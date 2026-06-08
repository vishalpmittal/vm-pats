import { el } from "../utils/dom";
import { getAll } from "../store";

interface Company {
  rank: number;
  company: string;
  sector: string;
  type: string;
  careersUrl: string;
  about?: string;
  isFavorite?: boolean;
  trending?: boolean;
}

type SortKey = "rank" | "company" | "sector" | "about" | "roles" | "favorite";
type SortDir = "asc" | "desc";

function showCompanyModal(opts: { title: string; initial?: Company; onSave: (data: { company: string; sector: string; type: string; careersUrl: string; about: string }) => Promise<boolean> }): void {
  const existing = document.getElementById("company-modal");
  if (existing) existing.remove();

  const nameInput = el("input", { type: "text", placeholder: "Company name", className: "input", value: opts.initial?.company ?? "" }) as HTMLInputElement;
  const sectorInput = el("input", { type: "text", placeholder: "Sector (e.g., AI / SaaS)", className: "input", value: opts.initial?.sector ?? "" }) as HTMLInputElement;
  const aboutInput = el("input", { type: "text", placeholder: "Short one-liner (e.g., AI coding platform)", className: "input", value: opts.initial?.about ?? "" }) as HTMLInputElement;
  const typeInput = el("input", { type: "text", placeholder: "Type (e.g., Public, Private)", className: "input", value: opts.initial?.type ?? "" }) as HTMLInputElement;
  const urlInput = el("input", { type: "url", placeholder: "Careers URL", className: "input", value: opts.initial?.careersUrl ?? "" }) as HTMLInputElement;

  const saveBtn = el("button", { className: "btn btn-primary" }, "Save") as HTMLButtonElement;
  const cancelBtn = el("button", { className: "btn btn-secondary" }, "Cancel");

  const form = el("div", { className: "modal-form" },
    el("div", { className: "form-field" }, el("label", { className: "form-label" }, "Company"), nameInput),
    el("div", { className: "form-field" }, el("label", { className: "form-label" }, "Sector"), sectorInput),
    el("div", { className: "form-field" }, el("label", { className: "form-label" }, "About"), aboutInput),
    el("div", { className: "form-field" }, el("label", { className: "form-label" }, "Type"), typeInput),
    el("div", { className: "form-field" }, el("label", { className: "form-label" }, "Careers URL"), urlInput),
  );

  const btnGroup = el("div", { className: "modal-buttons" }, saveBtn, cancelBtn);
  const card = el("div", { className: "modal-card glass-card" },
    el("h2", { className: "modal-title" }, opts.title),
    form,
    btnGroup,
  );
  const overlay = el("div", { className: "modal-overlay", id: "company-modal" }, card);

  const close = () => overlay.remove();
  cancelBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  saveBtn.addEventListener("click", async () => {
    if (!nameInput.value.trim()) { nameInput.focus(); return; }
    saveBtn.textContent = "Saving...";
    saveBtn.setAttribute("disabled", "true");
    try {
      const ok = await opts.onSave({
        company: nameInput.value.trim(),
        sector: sectorInput.value.trim(),
        type: typeInput.value.trim(),
        careersUrl: urlInput.value.trim(),
        about: aboutInput.value.trim(),
      });
      if (ok) close();
    } finally {
      saveBtn.textContent = "Save";
      saveBtn.removeAttribute("disabled");
    }
  });

  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") saveBtn.click(); });
  document.body.appendChild(overlay);
  nameInput.focus();
}

export async function renderCompanies(container: HTMLElement): Promise<void> {
  container.innerHTML = "";

  const addBtn = el("button", { className: "btn btn-primary" }, "+ Add Company");
  addBtn.addEventListener("click", () => {
    showCompanyModal({
      title: "Add Company",
      onSave: async (data) => {
        const resp = await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (resp.ok) { renderCompanies(container); return true; }
        return false;
      },
    });
  });

  const header = el("div", { className: "page-header" },
    el("h1", {}, "Companies"),
    addBtn,
  );
  container.appendChild(header);

  let companies: Company[] = [];
  try {
    const resp = await fetch("/api/companies");
    companies = await resp.json();
  } catch {
    container.appendChild(el("div", { className: "empty-state glass-card" }, el("p", {}, "Failed to load companies.")));
    return;
  }

  if (companies.length === 0) {
    container.appendChild(el("div", { className: "empty-state glass-card" }, el("p", {}, "No companies found.")));
    return;
  }

  const jobCounts = new Map<string, number>();
  try {
    const jobs = await getAll();
    for (const j of jobs) {
      const key = j.company.toLowerCase();
      jobCounts.set(key, (jobCounts.get(key) || 0) + 1);
    }
  } catch { /* ignore */ }

  let sortKey: SortKey = "rank";
  let sortDir: SortDir = "asc";
  let searchQuery = "";
  let starredOnly = false;
  let trendingOnly = false;

  const searchInput = el("input", {
    type: "search",
    placeholder: "Search companies...",
    className: "input filter-search",
  }) as HTMLInputElement;
  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderTable();
  });

  const trendingIconSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="2,12 6,8 9,11 14,4"></polyline><polyline points="10,4 14,4 14,8"></polyline></svg>';

  const starToggle = el("button", { className: "filter-toggle", type: "button" });
  starToggle.innerHTML = "★ <span>Starred</span>";
  starToggle.addEventListener("click", () => {
    starredOnly = !starredOnly;
    starToggle.classList.toggle("active", starredOnly);
    renderTable();
  });

  const trendingToggle = el("button", { className: "filter-toggle", type: "button" });
  trendingToggle.innerHTML = `${trendingIconSvg} <span>Trending</span>`;
  trendingToggle.addEventListener("click", () => {
    trendingOnly = !trendingOnly;
    trendingToggle.classList.toggle("active", trendingOnly);
    renderTable();
  });

  const filterRow = el("div", { className: "filter-row" },
    searchInput,
    el("div", { className: "filter-toggles" }, starToggle, trendingToggle),
  );
  container.appendChild(filterRow);

  const tableWrap = el("div", { className: "companies-table-wrap" });
  container.appendChild(tableWrap);

  function applyFiltersAndSort(): Company[] {
    let result = companies;
    if (searchQuery) {
      result = result.filter(c =>
        c.company.toLowerCase().includes(searchQuery) ||
        (c.sector ?? "").toLowerCase().includes(searchQuery) ||
        (c.about ?? "").toLowerCase().includes(searchQuery)
      );
    }
    if (starredOnly) result = result.filter(c => c.isFavorite);
    if (trendingOnly) result = result.filter(c => c.trending);

    return [...result].sort((a, b) => {
      let va: string | number | boolean;
      let vb: string | number | boolean;
      if (sortKey === "roles") {
        va = jobCounts.get(a.company.toLowerCase()) || 0;
        vb = jobCounts.get(b.company.toLowerCase()) || 0;
      } else if (sortKey === "favorite") {
        va = a.isFavorite ? 1 : 0;
        vb = b.isFavorite ? 1 : 0;
      } else if (sortKey === "about") {
        va = a.about ?? "";
        vb = b.about ?? "";
      } else {
        va = a[sortKey];
        vb = b[sortKey];
      }
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }

  function renderTable() {
    tableWrap.innerHTML = "";

    const display = applyFiltersAndSort();

    const table = el("table", { className: "md-table companies-table" });
    const thead = el("thead", {});
    const headerRow = el("tr", {});

    const columns: { key: SortKey; label: string }[] = [
      { key: "rank", label: "#" },
      { key: "company", label: "Company" },
      { key: "sector", label: "Sector" },
      { key: "about", label: "About" },
      { key: "roles", label: "Roles Applied" },
    ];

    for (const col of columns) {
      const arrow = sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : "";
      const th = el("th", { className: "sortable-th" }, col.label + arrow);
      th.addEventListener("click", () => {
        if (sortKey === col.key) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortKey = col.key;
          sortDir = "asc";
        }
        renderTable();
      });
      headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = el("tbody", {});

    if (display.length === 0) {
      const emptyRow = el("tr", {},
        el("td", { colspan: "5", class: "filter-empty" }, "No companies match the current filters.")
      );
      tbody.appendChild(emptyRow);
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      return;
    }

    for (const c of display) {
      const companyLink = c.careersUrl
        ? el("a", { href: c.careersUrl, target: "_blank", rel: "noopener", className: "job-link" }, c.company)
        : el("span", {}, c.company);

      const starBtn = el("button", {
        className: `btn-icon company-star-btn${c.isFavorite ? " is-favorite" : ""}`,
        title: c.isFavorite ? "Unfavorite" : "Favorite",
      }, c.isFavorite ? "★" : "☆");
      starBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const next = !c.isFavorite;
        starBtn.setAttribute("disabled", "true");
        try {
          const resp = await fetch(`/api/companies/${c.rank}/favorite`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isFavorite: next }),
          });
          if (resp.ok) {
            c.isFavorite = next;
            starBtn.textContent = next ? "★" : "☆";
            starBtn.title = next ? "Unfavorite" : "Favorite";
            starBtn.classList.toggle("is-favorite", next);
          }
        } finally {
          starBtn.removeAttribute("disabled");
        }
      });

      const editBtn = el("button", { className: "btn-icon btn-edit company-edit-btn", title: "Edit" }, "✎");
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showCompanyModal({
          title: "Edit Company",
          initial: c,
          onSave: async (data) => {
            const resp = await fetch(`/api/companies/${c.rank}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            if (resp.ok) { renderCompanies(container); return true; }
            return false;
          },
        });
      });

      const cellChildren: (Node | string)[] = [companyLink];
      if (c.trending) {
        const trendingIcon = el("span", { className: "company-trending-icon", title: "Trending" });
        trendingIcon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="2,12 6,8 9,11 14,4"></polyline><polyline points="10,4 14,4 14,8"></polyline></svg>';
        cellChildren.push(trendingIcon);
      }
      cellChildren.push(starBtn, editBtn);
      const companyCell = el("span", { className: "company-name-cell" }, ...cellChildren);
      const count = jobCounts.get(c.company.toLowerCase()) || 0;

      tbody.appendChild(
        el("tr", {},
          el("td", {}, String(c.rank)),
          el("td", {}, companyCell),
          el("td", {}, c.sector),
          el("td", {}, c.about ?? ""),
          el("td", {}, count > 0 ? String(count) : ""),
        )
      );
    }

    table.appendChild(tbody);
    tableWrap.appendChild(table);
  }

  renderTable();
}
