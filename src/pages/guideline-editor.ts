import { el } from "../utils/dom";

export async function renderGuidelineEditor(container: HTMLElement, slug?: string): Promise<void> {
  container.innerHTML = "";

  const isEdit = !!slug;

  const header = el("div", { className: "page-header" },
    el("h1", {}, "Guideline Details")
  );
  container.appendChild(header);

  const titleInput = el("input", { className: "input", placeholder: "Guideline title" }) as HTMLInputElement;

  const promptArea = el("textarea", {
    className: "input input-textarea",
    placeholder: "Describe what this guideline should cover...",
    style: "min-height: 80px",
  }) as HTMLTextAreaElement;

  const generateBtn = el("button", { className: "btn btn-primary btn-sm" }, "Generate") as HTMLButtonElement;

  const contentArea = el("textarea", {
    className: "input input-textarea guideline-textarea",
    placeholder: "Write your guideline content here (markdown supported)...",
  }) as HTMLTextAreaElement;

  if (isEdit) {
    try {
      const resp = await fetch(`/api/guidelines/${slug}`);
      if (!resp.ok) {
        alert("Failed to load guideline.");
        window.location.hash = "#/guidelines";
        return;
      }
      const data: { title: string; body: string } = await resp.json();
      titleInput.value = data.title;
      contentArea.value = data.body;
    } catch {
      alert("Failed to connect to server.");
      window.location.hash = "#/guidelines";
      return;
    }
  }

  generateBtn.addEventListener("click", async () => {
    const prompt = promptArea.value.trim();
    if (!prompt) { promptArea.focus(); return; }

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
    } catch {
      alert("Failed to connect to server.");
    } finally {
      generateBtn.textContent = "Generate";
      generateBtn.removeAttribute("disabled");
    }
  });

  const saveBtn = el("button", { className: "btn btn-primary" }, "Save");

  saveBtn.addEventListener("click", async () => {
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }

    saveBtn.textContent = "Saving...";
    saveBtn.setAttribute("disabled", "true");

    try {
      const url = isEdit ? `/api/guidelines/${slug}` : "/api/guidelines";
      const method = isEdit ? "PUT" : "POST";
      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content: contentArea.value }),
      });
      if (!resp.ok) {
        const data = await resp.json();
        alert(data.error ?? "Failed to save guideline");
        return;
      }
      window.location.hash = "#/guidelines";
    } catch {
      alert("Failed to connect to server.");
    } finally {
      saveBtn.textContent = "Save";
      saveBtn.removeAttribute("disabled");
    }
  });

  const form = el("div", { className: "glass-card guideline-form" },
    el("div", { className: "form-field" },
      el("label", { className: "form-label" }, "Title"),
      titleInput
    ),
    el("div", { className: "form-field" },
      el("label", { className: "form-label" }, "AI Prompt"),
      promptArea,
      generateBtn
    ),
    el("div", { className: "form-field" },
      el("label", { className: "form-label" }, "Content"),
      contentArea
    ),
    saveBtn
  );
  container.appendChild(form);
}
