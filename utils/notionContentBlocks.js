import
{
    createHash
}
from "node:crypto";
import
{
    notionFailure
}
from "./notionErrors.js";
import
{
    NOTION_REQUEST_BYTES
}
from "./notionApi.js";
import normalizeTags from "./normTags.js";

export const notionContentTags = content => (content.destinations?.notion?.options?.tags ?? content.tags ?? [])
    .map(value => validateText(value).trim()).filter(Boolean);

// Existing option IDs avoid implicitly adding options to the user's schema.
// All selected tags remain visible in the page body, including unmatched tags.
export const notionTagProperties = (content, verified) =>
{
    if (verified.tagProperties?.length !== 1) return {};
    const property = verified.tagProperties[0];
    const selected = [];
    for (const tag of notionContentTags(content))
    {
        const matches = property.options.filter(option => typeof option.name === "string" && typeof option.id === "string" &&
            option.id.length > 0 && option.id.length <= 200 && normalizeTags([option.name])[0] === normalizeTags([tag])[0]);
        if (matches.length === 1 && !selected.some(option => option.id === matches[0].id)) selected.push({ id: matches[0].id });
    }
    return selected.length ? { [property.id]: { multi_select: selected } } : {};
};

export const splitNotionText = text =>
{
    const chunks = [];
    for (let offset = 0; offset < text.length;)
    {
        let end = Math.min(offset + 2000, text.length);
        if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
        chunks.push(text.slice(offset, end));
        offset = end;
    }
    return chunks;
};
const richText = text => (
{
    type: "text",
    text:
    {
        content: text
    }
});
const paragraph = text => (
{
    object: "block",
    type: "paragraph",
    paragraph:
    {
        rich_text: [richText(text)]
    }
});
const heading = text => (
{
    object: "block",
    type: "heading_2",
    heading_2:
    {
        rich_text: [richText(text)]
    }
});
const validateText = value =>
{
    if (typeof value !== "string" || !value.isWellFormed() || value.includes("\0")) throw notionFailure("NOTION_INVALID_CONTENT");
    return value.replaceAll("\r\n", "\n");
};

export const mapNotionContent = content =>
{
    const title = validateText(content.title || "Saved knowledge").trim();
    const rawText = validateText(content.rawText).trim();
    const summary = content.summary == null ? "" : validateText(content.summary).trim();
    if (!title || !rawText || (content.tags != null && !Array.isArray(content.tags))) throw notionFailure("NOTION_INVALID_CONTENT");
    const tags = notionContentTags(content);
    if (title.length > 500 || title.length + rawText.length + summary.length + tags.join(" ").length > 400000 || tags.length > 1000)
        throw notionFailure("NOTION_CONTENT_LIMIT");
    const blocks = [];
    const addParagraphs = text =>
    {
        for (const part of text.split(/\n[\t ]*\n+/))
        {
            if (!part) continue;
            for (const chunk of splitNotionText(part)) blocks.push(paragraph(chunk));
        }
    };
    if (content.url)
    {
        const source = validateText(content.url);
        let url;
        try
        {
            url = new URL(source);
        }
        catch
        {
            throw notionFailure("NOTION_INVALID_CONTENT");
        }
        const webSource = ["https:", "http:"].includes(url.protocol);
        // Browser-page notes can have a chrome:/edge:/about: source. Preserve
        // that metadata as text; Notion hyperlinks accept only web sources.
        if ((!webSource && !["chrome:", "edge:", "about:", "chrome-extension:"].includes(url.protocol)) || url.username || url.password)
            throw notionFailure("NOTION_INVALID_CONTENT");
        if (source.length > 2000) throw notionFailure("NOTION_CONTENT_LIMIT");
        if (!webSource) addParagraphs(`Source: ${source}`);
        else
        blocks.push(
        {
            object: "block",
            type: "paragraph",
            paragraph:
            {
                rich_text: [richText("Source: "),
                {
                    type: "text",
                    text:
                    {
                        content: source,
                        link:
                        {
                            url: source
                        }
                    }
                }]
            }
        });
    }
    if (tags.length) addParagraphs(`Tags: ${tags.map(value => `#${value}`).join(" ")}`);
    addParagraphs(rawText);
    // contentService already appends this exact suffix when requested. Do not
    // copy the existing summary a second time into the exported body.
    const alreadyMerged = content.options?.mergeSummaryWithContent && rawText.endsWith(`Summary:\n${summary}`);
    if (summary && !alreadyMerged)
    {
        blocks.push(heading("Summary"));
        addParagraphs(summary);
    }
    if (blocks.length > 1000) throw notionFailure("NOTION_CONTENT_LIMIT");
    return {
        title: [richText(title)],
        blocks,
        contentHash: createHash("sha256").update(JSON.stringify(
        {
            title,
            blocks
        })).digest("hex")
    };
};

export const nextNotionBatch = (blocks, offset, base = {}) =>
{
    const children = [];
    for (let index = offset; index < blocks.length && children.length < 100; index++)
    {
        if (Buffer.byteLength(JSON.stringify(
            {
                ...base,
                children: [...children, blocks[index]]
            })) > NOTION_REQUEST_BYTES) break;
        children.push(blocks[index]);
    }
    if (!children.length && offset < blocks.length) throw notionFailure("NOTION_CONTENT_LIMIT");
    return children;
};
