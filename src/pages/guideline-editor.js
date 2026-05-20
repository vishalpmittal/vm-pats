import { el } from "../utils/dom";
export async function renderGuidelineEditor(container) {
    container.innerHTML = "";
    const header = el("div", { className: "page-header" }, el("h1", {}, "New Guideline"));
    container.appendChild(header);
    const titleInput = el("input", { className: "input", placeholder: "Guideline title" });
    const promptArea = el("textarea", {
        className: "input input-textarea",
        placeholder: "Describe what this guideline should cover...",
        style: "min-height: 80px",
    });
    const generateBtn = el("button", { className: "btn btn-primary btn-sm" }, "Generate");
    const contentArea = el("textarea", {
        className: "input input-textarea guideline-textarea",
        placeholder: "Write your guideline content here (markdown supported)...",
    });
    generateBtn.addEventListener("click", async () => {
        const prompt = promptArea.value.trim();
        if (!prompt) {
            promptArea.focus();
            return;
        }
        generateBtn.textContent = "Generating...";
        generateBtn.setAttribute("disabled", "true");
        try {
            const resp = await fetch("/api/guidelines/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt }),
            });
            if (!resp.ok) {
                const data = await resp.json();
                alert(data.error ?? "Failed to generate guideline");
                return;
            }
            const data = await resp.json();
            contentArea.value = data.content;
        }
        catch {
            alert("Failed to connect to server.");
        }
        finally {
            generateBtn.textContent = "Generate";
            generateBtn.removeAttribute("disabled");
        }
    });
    const saveBtn = el("button", { className: "btn btn-primary" }, "Save");
    saveBtn.addEventListener("click", async () => {
        const title = titleInput.value.trim();
        if (!title) {
            titleInput.focus();
            return;
        }
        saveBtn.textContent = "Saving...";
        saveBtn.setAttribute("disabled", "true");
        try {
            const resp = await fetch("/api/guidelines", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, content: contentArea.value }),
            });
            if (!resp.ok) {
                const data = await resp.json();
                alert(data.error ?? "Failed to save guideline");
                return;
            }
            const { slug } = await resp.json();
            window.location.hash = `#/guidelines/${slug}`;
        }
        catch {
            alert("Failed to connect to server.");
        }
        finally {
            saveBtn.textContent = "Save";
            saveBtn.removeAttribute("disabled");
        }
    });
    const form = el("div", { className: "glass-card guideline-form" }, el("div", { className: "form-field" }, el("label", { className: "form-label" }, "Title"), titleInput), el("div", { className: "form-field" }, el("label", { className: "form-label" }, "AI Prompt"), promptArea, generateBtn), el("div", { className: "form-field" }, el("label", { className: "form-label" }, "Content"), contentArea), saveBtn);
    container.appendChild(form);
}
