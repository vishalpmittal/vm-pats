import { el } from "../utils/dom";
import { renderMarkdown } from "../utils/markdown";

export function showResumeViewer(title: string, content: string): void {
  const existing = document.getElementById("resume-viewer");
  if (existing) existing.remove();

  const body = el("div", { className: "resume-viewer-body guidelines-content" });
  body.innerHTML = renderMarkdown(content);

  const closeBtn = el("button", { className: "resume-viewer-close", title: "Close" }, "×");
  const exportBtn = el("button", { className: "btn btn-secondary btn-sm", title: "Export PDF" }, "Export PDF");

  exportBtn.addEventListener("click", () => {
    const prevTitle = document.title;
    document.title = title.replace(/\.md$/, "");
    pane.classList.add("resume-viewer-printing");
    window.print();
    pane.classList.remove("resume-viewer-printing");
    document.title = prevTitle;
  });

  const header = el("div", { className: "resume-viewer-header" },
    el("h2", { className: "resume-viewer-title" }, title),
    el("div", { className: "resume-viewer-actions" }, exportBtn, closeBtn)
  );

  const pane = el("div", { className: "resume-viewer-pane" }, header, body);
  const overlay = el("div", { className: "resume-viewer-overlay", id: "resume-viewer" }, pane);

  const close = () => {
    pane.classList.remove("resume-viewer-open");
    setTimeout(() => overlay.remove(), 200);
  };

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => pane.classList.add("resume-viewer-open"));
}
