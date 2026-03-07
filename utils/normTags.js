const normalizeTags = (tags) => 
{
    const normalized = tags.map(tag =>
        tag.toLowerCase().replace(/[\s\-_\.]/g, "")
    );
    return [...new Set(normalized)];
};
export default normalizeTags;