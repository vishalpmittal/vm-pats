import { el } from "../utils/dom";
import { renderMarkdown } from "../utils/markdown";

export async function renderGuidelines(container: HTMLElement, slug: string): Promise<void> {
  container.innerHTML = "";

  try {
    const resp = await fetch(`/api/guidelines/${slug}`);
    if (!resp.ok) {
      container.appendChild(el("div", { className: "page-header" }, el("h1", {}, "Guidelines")));
      container.appendChild(el("div", { className: "empty-state glass-card" },
        el("p", {}, "Could not load guidelines.")
      ));
      return;
    }
    const data: { title: string; content: string } = await resp.json();

    const header = el("div", { className: "page-header" },
      el("h1", {}, data.title)
    );
    container.appendChild(header);

    const card = el("div", { className: "guidelines-content glass-card" });
    card.innerHTML = renderMarkdown(data.content);
    container.appendChild(card);

    const deleteBtn = el("button", { className: "btn btn-danger-glass" }, "Delete");
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`Delete guideline "${data.title}"?`)) return;
      try {
        await fetch(`/api/guidelines/${slug}`, { method: "DELETE" });
        window.location.hash = "#/";
      } catch {
        alert("Failed to delete guideline.");
      }
    });
    const actions = el("div", { className: "edit-actions" }, deleteBtn);
    container.appendChild(actions);
  } catch {
    container.appendChild(el("div", { className: "page-header" }, el("h1", {}, "Guidelines")));
    container.appendChild(el("div", { className: "empty-state glass-card" },
      el("p", {}, "Failed to connect to server.")
    ));
  }
}
