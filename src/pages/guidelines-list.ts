import { el } from "../utils/dom";

interface GuidelineItem {
  slug: string;
  title: string;
  enabled: boolean;
  createdDate: string;
}

type SortKey = "title" | "createdDate" | "enabled";
type SortDir = "asc" | "desc";

async function saveConfig(enabled: string[]): Promise<void> {
  await fetch("/api/guidelines/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export async function renderGuidelinesList(container: HTMLElement): Promise<void> {
  container.innerHTML = "";

  const addBtn = el("button", { className: "btn btn-primary" }, "+ Add Guideline");
  addBtn.addEventListener("click", () => { window.location.hash = "#/guidelines/new"; });

  const header = el("div", { className: "page-header" },
    el("h1", {}, "Guidelines"),
    addBtn,
  );
  container.appendChild(header);

  const helpText = el("p", { className: "guideline-help-text" },
    "Guidelines shape how your tailored resumes are generated. Check the ones you want included during resume generation."
  );
  container.appendChild(helpText);

  let guidelines: GuidelineItem[];
  try {
    const resp = await fetch("/api/guidelines");
    guidelines = await resp.json();
  } catch {
    container.appendChild(el("div", { className: "empty-state glass-card" },
      el("p", {}, "Failed to load guidelines.")
    ));
    return;
  }

  if (guidelines.length === 0) {
    container.appendChild(el("div", { className: "empty-state glass-card" },
      el("p", {}, "No guidelines yet. Click \"+ Add Guideline\" to create one.")
    ));
    return;
  }

  let sortKey: SortKey = "title";
  let sortDir: SortDir = "asc";
  const tableWrap = el("div", { className: "companies-table-wrap" });
  container.appendChild(tableWrap);

  function sortData() {
    guidelines.sort((a, b) => {
      let va: string | number | boolean = a[sortKey];
      let vb: string | number | boolean = b[sortKey];
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }

  function renderTable() {
    tableWrap.innerHTML = "";

    const table = el("table", { className: "md-table companies-table" });
    const thead = el("thead", {});
    const headerRow = el("tr", {});

    const columns: { key: SortKey; label: string; className?: string }[] = [
      { key: "title", label: "Guideline" },
      { key: "createdDate", label: "Created" },
      { key: "enabled", label: "Enabled", className: "guideline-col-enabled" },
    ];

    for (const col of columns) {
      const arrow = sortKey === col.key ? (sortDir === "asc" ? "▲ " : "▼ ") : "";
      const th = el("th", { className: `sortable-th${col.className ? " " + col.className : ""}` }, arrow + col.label);
      th.addEventListener("click", () => {
        if (sortKey === col.key) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortKey = col.key;
          sortDir = "asc";
        }
        sortData();
        renderTable();
      });
      headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = el("tbody", {});
    for (const g of guidelines) {
      const nameLink = el("a", { href: `#/guidelines/${g.slug}`, className: "job-link" }, g.title);

      const editBtn = el("button", { className: "btn-icon btn-edit company-edit-btn", title: "Edit" }, "✎");
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.location.hash = `#/guidelines/edit/${g.slug}`;
      });

      const nameCell = el("span", { className: "company-name-cell" }, nameLink, editBtn);

      const checkbox = el("input", { type: "checkbox", className: "guideline-checkbox" }) as HTMLInputElement;
      checkbox.checked = g.enabled;
      checkbox.addEventListener("change", () => {
        g.enabled = checkbox.checked;
        const enabledSlugs = guidelines.filter(item => item.enabled).map(item => item.slug);
        saveConfig(enabledSlugs);
      });
      const checkCell = el("td", { className: "guideline-col-enabled" });
      checkCell.appendChild(checkbox);

      tbody.appendChild(
        el("tr", {},
          el("td", {}, nameCell),
          el("td", {}, g.createdDate || ""),
          checkCell,
        )
      );
    }

    table.appendChild(tbody);
    tableWrap.appendChild(table);
  }

  sortData();
  renderTable();
}
