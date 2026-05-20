import { el } from "../utils/dom";
async function saveConfig(enabled) {
    await fetch("/api/guidelines/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
    });
}
export async function renderGuidelinesList(container) {
    container.innerHTML = "";
    const header = el("div", { className: "page-header" }, el("h1", {}, "Guidelines"));
    container.appendChild(header);
    const helpText = el("p", { className: "guideline-help-text" }, "Guidelines shape how your tailored resumes are generated. Check the ones you want included during resume generation.");
    container.appendChild(helpText);
    let guidelines;
    try {
        const resp = await fetch("/api/guidelines");
        guidelines = await resp.json();
    }
    catch {
        container.appendChild(el("div", { className: "empty-state glass-card" }, el("p", {}, "Failed to load guidelines.")));
        return;
    }
    if (guidelines.length === 0) {
        container.appendChild(el("div", { className: "empty-state glass-card" }, el("p", {}, "No guidelines yet. Use the + button in the sidebar to add one.")));
        return;
    }
    const card = el("div", { className: "glass-card guideline-list" });
    const table = el("table", { className: "guideline-table" });
    const thead = el("thead", {}, el("tr", {}, el("th", {}, "Guideline"), el("th", { className: "guideline-col-enabled" }, "Enabled")));
    table.appendChild(thead);
    const tbody = el("tbody");
    for (const g of guidelines) {
        const checkbox = el("input", { type: "checkbox", className: "guideline-checkbox" });
        checkbox.checked = g.enabled;
        checkbox.addEventListener("change", () => {
            const enabled = guidelines
                .filter(item => {
                if (item.slug === g.slug)
                    return checkbox.checked;
                const cb = card.querySelector(`[data-slug="${item.slug}"] input`);
                return cb ? cb.checked : item.enabled;
            })
                .map(item => item.slug);
            saveConfig(enabled);
        });
        const link = el("a", { href: `#/guidelines/${g.slug}`, className: "guideline-list-link" }, g.title);
        const checkCell = el("td", { className: "guideline-col-enabled" });
        checkCell.appendChild(checkbox);
        const row = el("tr", { className: "guideline-list-item" }, el("td", {}, link), checkCell);
        row.setAttribute("data-slug", g.slug);
        tbody.appendChild(row);
    }
    table.appendChild(tbody);
    card.appendChild(table);
    container.appendChild(card);
}
