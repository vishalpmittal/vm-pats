import { el } from "../utils/dom";
import { renderMarkdown } from "../utils/markdown";

function validateMarkdown(content: string): string[] {
  const warnings: string[] = [];
  const fences = (content.match(/^```/gm) ?? []).length;
  if (fences % 2 !== 0) warnings.push("Unmatched code fence (``` opened but not closed).");
  if (!/^#{1,6}\s/m.test(content)) warnings.push("No headings found — structure may be broken.");
  if (content.trim().length < 200) warnings.push("Content is very short — sections may have been accidentally deleted.");
  return warnings;
}

function openEditPane(initialContent: string, onSave: (newContent: string) => void): void {
  const existing = document.getElementById("master-resume-editor");
  if (existing) existing.remove();

  const textarea = el("textarea", { className: "master-resume-editor-textarea" }) as HTMLTextAreaElement;
  textarea.value = initialContent;

  const closeBtn = el("button", { className: "resume-viewer-close", title: "Close" }, "×");
  const saveBtn = el("button", { className: "btn btn-primary btn-sm" }, "Save") as HTMLButtonElement;

  const header = el("div", { className: "resume-viewer-header" },
    el("h2", { className: "resume-viewer-title" }, "Edit Master Resume"),
    el("div", { className: "resume-viewer-actions" }, saveBtn, closeBtn),
  );

  const pane = el("div", { className: "resume-viewer-pane master-resume-editor-pane" }, header, textarea);
  const overlay = el("div", { className: "resume-viewer-overlay", id: "master-resume-editor" }, pane);

  const close = () => {
    pane.classList.remove("resume-viewer-open");
    setTimeout(() => overlay.remove(), 200);
  };

  saveBtn.addEventListener("click", async () => {
    const warnings = validateMarkdown(textarea.value);
    if (warnings.length > 0) {
      const proceed = confirm(`Potential formatting issues detected:\n\n• ${warnings.join("\n• ")}\n\nSave anyway?`);
      if (!proceed) return;
    }
    saveBtn.textContent = "Saving...";
    saveBtn.setAttribute("disabled", "true");
    try {
      const resp = await fetch("/api/master-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: textarea.value, filename: "master-resume.md" }),
      });
      if (!resp.ok) {
        const data = await resp.json();
        alert(data.error ?? "Failed to save");
        return;
      }
      const data = await resp.json();
      onSave(data.content);
      close();
    } catch {
      alert("Failed to connect to server.");
    } finally {
      saveBtn.textContent = "Save";
      saveBtn.removeAttribute("disabled");
    }
  });

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => pane.classList.add("resume-viewer-open"));
  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(0, 0);
    textarea.scrollTop = 0;
  }, 250);
}

function renderUploadForm(container: HTMLElement, hasExisting = false): void {
  const fileInput = el("input", { type: "file", accept: ".md,.txt,.pdf,.doc,.docx" }) as HTMLInputElement;
  const uploadBtn = el("button", { className: "btn btn-primary" }, "Upload") as HTMLButtonElement;

  uploadBtn.addEventListener("click", async () => {
    const file = fileInput.files?.[0];
    if (!file) { fileInput.click(); return; }

    uploadBtn.textContent = "Uploading...";
    uploadBtn.setAttribute("disabled", "true");

    try {
      if (hasExisting) {
        await fetch("/api/master-resume/backup", { method: "POST" });
      }
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
    } catch {
      alert("Failed to connect to server.");
    } finally {
      uploadBtn.textContent = "Upload";
      uploadBtn.removeAttribute("disabled");
    }
  });

  const children: HTMLElement[] = [];
  if (!hasExisting) {
    children.push(
      el("p", {}, "No master resume found."),
      el("p", {}, "Upload your resume to get started."),
    );
  } else {
    children.push(el("p", {}, "Uploading a new resume will automatically back up the current one."));
  }
  children.push(el("div", { style: "display:flex; gap:12px; align-items:center; margin-top:12px" }, fileInput, uploadBtn));

  container.appendChild(el("div", { className: "empty-state glass-card" }, ...children));
}

export async function renderMasterResume(container: HTMLElement): Promise<void> {
  container.innerHTML = "";

  const header = el("div", { className: "page-header" },
    el("h1", {}, "Master Resume")
  );
  container.appendChild(header);

  try {
    const resp = await fetch("/api/master-resume");
    if (!resp.ok) {
      container.appendChild(el("div", { className: "empty-state glass-card" },
        el("p", {}, "Could not load master resume.")
      ));
      return;
    }

    const data = await resp.json();
    if (!data.content || !data.content.trim()) {
      renderUploadForm(container);
      return;
    }

    const backupBtn = el("a", { href: "#/master-resume/backups", className: "btn btn-secondary btn-sm" }, "Backup & Restore");
    const editBtn = el("button", { className: "btn btn-secondary btn-sm" }, "Edit");
    const replaceBtn = el("button", { className: "btn btn-secondary btn-sm" }, "Upload New");

    const card = el("div", { className: "guidelines-content glass-card" });
    card.innerHTML = renderMarkdown(data.content);

    editBtn.addEventListener("click", () => {
      openEditPane(data.content, (newContent) => {
        data.content = newContent;
        card.innerHTML = renderMarkdown(newContent);
      });
    });

    replaceBtn.addEventListener("click", () => {
      container.innerHTML = "";
      const closeBtn = el("button", { className: "resume-viewer-close", title: "Close", style: "font-size:1.1rem" }, "×");
      closeBtn.addEventListener("click", () => renderMasterResume(container));
      const backBtn = el("button", { className: "btn btn-secondary btn-sm" }, "← Master Resume");
      backBtn.addEventListener("click", () => renderMasterResume(container));
      container.appendChild(
        el("div", { className: "page-header" },
          el("div", { style: "display:flex; align-items:center; gap:12px" },
            backBtn,
            el("h1", { style: "margin:0" }, "Upload New Resume"),
          ),
          closeBtn,
        )
      );
      renderUploadForm(container, true);
    });

    header.appendChild(el("div", { className: "page-header-actions", style: "display:flex; gap:8px; align-items:center" }, replaceBtn, backupBtn, editBtn));
    container.appendChild(card);
  } catch {
    container.appendChild(el("div", { className: "empty-state glass-card" },
      el("p", {}, "Failed to connect to server.")
    ));
  }
}
