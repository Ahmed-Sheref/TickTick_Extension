/* Files stay local until explicit Save; only verified upload IDs enter content requests. */
(() =>
{
    const byId = id => document.getElementById(id);
    const input = byId("imageFileInput");
    const grid = byId("imageGrid");
    const error = byId("imageError");
    const { maximum, sizeLimit } = KnowviaImageLimits;
    const types = new Set(KnowviaImageLimits.types);
    let notionSelected = false;
    let api;
    let images = [];
    let generation = 0;
    let queue = Promise.resolve();
    const pendingUrls = new Set();
    const blocked = () => byId("saveArticleBtn").disabled || byId("appView").classList.contains("settings-active");
    const update = () =>
    {
        byId("imageCount").textContent = images.length ? `(${images.length})` : "";
        grid.hidden = images.length === 0;
        byId("notionImageOptions").hidden = !notionSelected || images.length === 0;
    };
    const remove = entry =>
    {
        images = images.filter(image => image !== entry);
        URL.revokeObjectURL(entry.url);
        if (entry.uploadId && api)
        {
            void api(`/images/${entry.uploadId}`, { method: "DELETE" }).catch(() =>
            {
                error.textContent = "The unused upload will be removed automatically.";
                error.hidden = false;
            });
        }
        entry.node.remove();
        error.hidden = true;
        update();
        byId("chooseImagesBtn").focus();
    };
    const thumbnail = (file, url) =>
    {
        const node = document.createElement("figure");
        node.className = "image-thumbnail";
        node.setAttribute("role", "listitem");
        const image = new Image();
        image.alt = file.name;
        image.src = url;
        const caption = document.createElement("figcaption");
        caption.textContent = file.name;
        caption.title = file.name;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "image-remove";
        button.setAttribute("aria-label", `Remove image ${file.name}`);
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-close"/></svg>';
        const entry = { file, url, node };
        button.addEventListener("click", () => remove(entry));
        node.append(image, button, caption);
        images.push(entry);
        grid.append(node);
    };
    const add = files =>
    {
        const operation = generation;
        // Serial decoding reserves count slots even for overlapping selections.
        queue = queue.then(async () =>
        {
            const messages = [];
            for (const file of files)
            {
                if (operation !== generation) return;
                if (images.some(entry => entry.file.name === file.name && entry.file.size === file.size && entry.file.lastModified === file.lastModified)) continue;
                if (!types.has(file.type))
                {
                    messages.push(`${file.name}: use PNG, JPG, WebP, or GIF.`);
                    continue;
                }
                if (!file.size || file.size > sizeLimit)
                {
                    messages.push(`${file.name}: choose an image up to 5 MB.`);
                    continue;
                }
                if (images.length >= maximum)
                {
                    messages.push("You can preview up to 6 images. Remove one to add another.");
                    break;
                }
                let url;
                try
                {
                    url = URL.createObjectURL(file);
                    pendingUrls.add(url);
                    const image = new Image();
                    image.src = url;
                    await image.decode();
                    if (operation !== generation) return;
                    thumbnail(file, url);
                    pendingUrls.delete(url);
                    url = null;
                }
                catch
                {
                    if (operation === generation) messages.push(`${file.name}: could not read this image. Choose another file.`);
                }
                finally
                {
                    if (url && pendingUrls.delete(url)) URL.revokeObjectURL(url);
                }
            }
            if (operation !== generation) return;
            error.textContent = [...new Set(messages)].join(" ");
            error.hidden = messages.length === 0;
            update();
        });
        return queue;
    };
    const paste = event =>
    {
        if (blocked() || document.querySelector("dialog[open]")) return;
        const files = [...(event.clipboardData?.items || [])]
            .filter(item => item.kind === "file" && item.type.startsWith("image/"))
            .map(item => item.getAsFile()).filter(Boolean);
        // Ordinary text keeps its native insertion and selection behavior.
        if (!files.length) return;
        event.preventDefault();
        void add(files);
    };
    byId("chooseImagesBtn").addEventListener("click", () => input.click());
    input.addEventListener("change", () =>
    {
        const files = [...input.files];
        input.value = "";
        if (!blocked()) void add(files);
    });
    byId("panelSave").addEventListener("paste", paste);
    const reset = () =>
    {
        generation++;
        for (const entry of images)
        {
            URL.revokeObjectURL(entry.url);
            entry.node.remove();
        }
        for (const url of pendingUrls) URL.revokeObjectURL(url);
        pendingUrls.clear();
        images = [];
        input.value = "";
        error.hidden = true;
        update();
    };
    byId("includeNotionImages").addEventListener("change", update);
    window.KnowviaImages = {
        reset,
        count: () => images.length,
        refresh: selected => { notionSelected = selected; update(); },
        async prepare({ request, identity, verifyIdentity, notion })
        {
            await queue;
            if (!images.length) return null;
            const retain = true;
            const includeNotion = notion && byId("includeNotionImages").checked;
            api = request;
            const status = byId("imageUploadStatus");
            status.hidden = false;
            error.hidden = true;
            const uploadIds = [];
            try
            {
                for (const [index, entry] of images.entries())
                {
                    await verifyIdentity();
                    status.textContent = `Uploading image ${index + 1} of ${images.length}…`;
                    if (entry.identity !== identity)
                    {
                        entry.uploadId = null;
                        entry.verified = false;
                        entry.identity = identity;
                    }
                    if (!entry.uploadId)
                    {
                        const result = await request("/images/uploads", { method: "POST", body: JSON.stringify({ filename: entry.file.name, mimeType: entry.file.type, size: entry.file.size }) });
                        const upload = result.data;
                        const url = new URL(upload.uploadUrl);
                        if (url.protocol !== "https:" || !/^[a-f0-9]{24}$/i.test(upload.uploadId)) throw new Error("Image upload authorization could not be confirmed.");
                        entry.uploadId = upload.uploadId;
                        await verifyIdentity();
                        try
                        {
                            const response = await fetch(upload.uploadUrl, { method: "PUT", body: entry.file, headers: upload.headers,
                                credentials: "omit", redirect: "error", signal: AbortSignal.timeout(60000) });
                            if (!response.ok) throw new Error("Image upload failed. Try saving again.");
                        }
                        catch (failure)
                        {
                            entry.uploadId = null;
                            throw failure;
                        }
                    }
                    if (!entry.verified)
                    {
                        await verifyIdentity();
                        try
                        {
                            const result = await request(`/images/${entry.uploadId}/complete`, { method: "POST" });
                            if (!["uploaded", "attached"].includes(result.data?.status)) throw new Error("Image verification could not be confirmed.");
                            entry.verified = true;
                        }
                        catch (failure)
                        {
                            if ([400, 404, 409, 410].includes(failure.status)) entry.uploadId = null;
                            throw failure;
                        }
                    }
                    uploadIds.push(entry.uploadId);
                }
                status.textContent = "Images uploaded and verified. Saving content…";
                return { uploadIds, retain, notion: includeNotion };
            }
            catch (failure)
            {
                error.textContent = failure.message || "Image upload failed. Try saving again.";
                error.hidden = false;
                throw Object.assign(failure, { fieldValidation: true });
            }
            finally
            {
                status.hidden = true;
            }
        }
    };
    window.addEventListener("pagehide", reset);
})();
