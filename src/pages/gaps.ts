import { el } from "../utils/dom";
import { renderMarkdown } from "../utils/markdown";

export async function renderGaps(container: HTMLElement): Promise<void> {
  container.innerHTML = "";

  const header = el("div", { className: "page-header" },
    el("h1", {}, "Resume Gaps")
  );
  container.appendChild(header);

  try {
    const resp = await fetch("/api/gaps");
    if (!resp.ok) {
      container.appendChild(el("div", { className: "empty-state glass-card" },
        el("p", {}, "Could not load resume gaps.")
      ));
      return;
    }
    const data = await resp.json();
    if (!data.content || !data.content.trim()) {
      container.appendChild(el("div", { className: "empty-state glass-card" },
        el("p", {}, "No gaps recorded yet."),
        el("p", {}, "Run an AI resume review to start tracking gaps.")
      ));
      return;
    }
    const card = el("div", { className: "guidelines-content glass-card" });
    card.innerHTML = renderMarkdown(data.content);
    container.appendChild(card);
  } catch {
    container.appendChild(el("div", { className: "empty-state glass-card" },
      el("p", {}, "Failed to connect to server.")
    ));
  }
}
