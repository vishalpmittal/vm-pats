import { el } from "../utils/dom";
import { renderMarkdown } from "../utils/markdown";

const TITLES: Record<string, string> = {
  director: "Director of Engineering Guidelines",
  "senior-manager": "Sr. Manager of Engineering Guidelines",
  "ai-transformation": "AI Transformation Leadership",
};

export async function renderGuidelines(container: HTMLElement, level: string): Promise<void> {
  container.innerHTML = "";

  const title = TITLES[level] ?? "Guidelines";
  const header = el("div", { className: "page-header" },
    el("h1", {}, title)
  );
  container.appendChild(header);

  try {
    const resp = await fetch(`/api/guidelines/${level}`);
    if (!resp.ok) {
      container.appendChild(el("div", { className: "empty-state glass-card" },
        el("p", {}, "Could not load guidelines.")
      ));
      return;
    }
    const data = await resp.json();
    const card = el("div", { className: "guidelines-content glass-card" });
    card.innerHTML = renderMarkdown(data.content);
    container.appendChild(card);
  } catch {
    container.appendChild(el("div", { className: "empty-state glass-card" },
      el("p", {}, "Failed to connect to server.")
    ));
  }
}
