import { el } from "../utils/dom";
import { renderMarkdown } from "../utils/markdown";
export function showAnalysisModal(title, content, onReanalyze) {
    const existing = document.getElementById("analysis-modal");
    if (existing)
        existing.remove();
    const body = el("div", { className: "modal-body" });
    body.innerHTML = renderMarkdown(content);
    const closeBtn = el("button", { className: "btn btn-secondary modal-close" }, "Close");
    const btnGroup = el("div", { className: "modal-buttons" }, closeBtn);
    if (onReanalyze) {
        const reanalyzeBtn = el("button", { className: "btn btn-primary modal-close" }, "Re-analyze");
        reanalyzeBtn.addEventListener("click", () => {
            overlay.remove();
            onReanalyze();
        });
        btnGroup.insertBefore(reanalyzeBtn, closeBtn);
    }
    const card = el("div", { className: "modal-card glass-card" }, el("h2", { className: "modal-title" }, title), body, btnGroup);
    const overlay = el("div", { className: "modal-overlay", id: "analysis-modal" }, card);
    const close = () => overlay.remove();
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay)
            close();
    });
    document.body.appendChild(overlay);
}
export function showLoadingModal(title) {
    const existing = document.getElementById("analysis-modal");
    if (existing)
        existing.remove();
    const spinner = el("div", { className: "modal-spinner" }, "Analyzing resume...");
    const card = el("div", { className: "modal-card glass-card" }, el("h2", { className: "modal-title" }, title), spinner);
    const overlay = el("div", { className: "modal-overlay", id: "analysis-modal" }, card);
    document.body.appendChild(overlay);
    return { close: () => overlay.remove() };
}
