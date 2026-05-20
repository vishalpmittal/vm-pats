import { el } from "../utils/dom";
import { renderMarkdown } from "../utils/markdown";
function renderUploadForm(container) {
    const fileInput = el("input", { type: "file", accept: ".md,.txt,.pdf,.doc,.docx" });
    const uploadBtn = el("button", { className: "btn btn-primary" }, "Upload");
    uploadBtn.addEventListener("click", async () => {
        const file = fileInput.files?.[0];
        if (!file) {
            fileInput.click();
            return;
        }
        uploadBtn.textContent = "Uploading...";
        uploadBtn.setAttribute("disabled", "true");
        try {
            const content = await file.text();
            const resp = await fetch("/api/master-resume", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content, filename: file.name }),
            });
            if (!resp.ok) {
                const data = await resp.json();
                alert(data.error ?? "Failed to upload resume");
                return;
            }
            await renderMasterResume(container);
        }
        catch {
            alert("Failed to connect to server.");
        }
        finally {
            uploadBtn.textContent = "Upload";
            uploadBtn.removeAttribute("disabled");
        }
    });
    const card = el("div", { className: "empty-state glass-card" }, el("p", {}, "No master resume found."), el("p", {}, "Upload your resume to get started."), el("div", { style: "display:flex; gap:12px; align-items:center; margin-top:12px" }, fileInput, uploadBtn));
    container.appendChild(card);
}
export async function renderMasterResume(container) {
    container.innerHTML = "";
    const header = el("div", { className: "page-header" }, el("h1", {}, "Master Resume"));
    container.appendChild(header);
    try {
        const resp = await fetch("/api/master-resume");
        if (!resp.ok) {
            container.appendChild(el("div", { className: "empty-state glass-card" }, el("p", {}, "Could not load master resume.")));
            return;
        }
        const data = await resp.json();
        if (!data.content || !data.content.trim()) {
            renderUploadForm(container);
            return;
        }
        const replaceBtn = el("button", { className: "btn btn-primary btn-sm" }, "Replace");
        replaceBtn.addEventListener("click", () => {
            container.innerHTML = "";
            container.appendChild(header);
            renderUploadForm(container);
        });
        const actions = el("div", { className: "edit-actions" }, replaceBtn);
        const card = el("div", { className: "guidelines-content glass-card" });
        card.innerHTML = renderMarkdown(data.content);
        container.appendChild(card);
        container.appendChild(actions);
    }
    catch {
        container.appendChild(el("div", { className: "empty-state glass-card" }, el("p", {}, "Failed to connect to server.")));
    }
}
