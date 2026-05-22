import { getAll, update } from "../store";
import { el } from "../utils/dom";
import type { JobApplication } from "../types";

function renderRow(job: JobApplication, onRefresh: () => void): HTMLElement {
  const titleCell = job.jobLink
    ? el("a", { href: job.jobLink, target: "_blank", rel: "noopener", className: "job-link" }, job.title)
    : el("span", {}, job.title);

  const row = el(
    "div",
    { className: "job-row glass-card" },
    el("span", { className: "cell cell-date" }, job.addedDate || "—"),
    el("span", { className: "cell cell-company" }, job.company),
    el("span", { className: "cell cell-title" }, titleCell),
    el("span", { className: "cell cell-location" }, job.location || "—"),
    el("span", { className: "cell cell-date" }, job.postingDate || "—"),
    (() => {
      if (job.applicationDate) {
        return el("span", { className: "cell cell-date" }, job.applicationDate);
      }
      const checkbox = el("input", { type: "checkbox", className: "apply-checkbox", title: "Mark as applied today" }) as HTMLInputElement;
      checkbox.addEventListener("click", async (e) => {
        e.stopPropagation();
        await update(job.id, { applicationDate: new Date().toISOString().slice(0, 10) });
        onRefresh();
      });
      const cell = el("span", { className: "cell cell-date cell-apply" }, checkbox);
      return cell;
    })(),
  );

  row.style.cursor = "pointer";
  row.addEventListener("click", () => {
    window.location.hash = `#/edit/${job.id}`;
  });

  return row;
}

export async function renderHome(container: HTMLElement): Promise<void> {
  container.innerHTML = "";

  const header = el("div", { className: "page-header" },
    el("h1", {}, "Job Applications"),
    (() => {
      const btn = el("button", { className: "btn btn-primary" }, "+ Add New Role");
      btn.addEventListener("click", () => {
        window.location.hash = "#/add";
      });
      return btn;
    })()
  );

  container.appendChild(header);

  const jobs = await getAll();

  if (jobs.length === 0) {
    const empty = el("div", { className: "empty-state glass-card" },
      el("p", {}, "No applications yet."),
      el("p", {}, "Click \"+ Add New Role\" to get started.")
    );
    container.appendChild(empty);
    return;
  }

  type SortKey = "addedDate" | "company" | "title" | "location" | "postingDate" | "applicationDate";
  type SortDir = "asc" | "desc";
  let sortKey: SortKey = "addedDate";
  let sortDir: SortDir = "desc";

  const listWrap = el("div", {});
  container.appendChild(listWrap);

  function renderList() {
    listWrap.innerHTML = "";

    const sorted = [...jobs].sort((a, b) => {
      const va = (a[sortKey] || "").toLowerCase();
      const vb = (b[sortKey] || "").toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    const columns: { key: SortKey; label: string; className: string }[] = [
      { key: "addedDate", label: "Added", className: "cell cell-date" },
      { key: "company", label: "Company", className: "cell cell-company" },
      { key: "title", label: "Title", className: "cell cell-title" },
      { key: "location", label: "Location", className: "cell cell-location" },
      { key: "postingDate", label: "Posted", className: "cell cell-date" },
      { key: "applicationDate", label: "Applied", className: "cell cell-date" },
    ];

    const listHeader = el("div", { className: "job-row job-row-header" });
    for (const col of columns) {
      const arrow = sortKey === col.key ? (sortDir === "asc" ? " ▲" : " ▼") : "";
      const span = el("span", { className: col.className + " sortable-th" }, col.label + arrow);
      span.addEventListener("click", () => {
        if (sortKey === col.key) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortKey = col.key;
          sortDir = "asc";
        }
        renderList();
      });
      listHeader.appendChild(span);
    }
    listWrap.appendChild(listHeader);

    const list = el("div", { className: "job-list" });
    for (const job of sorted) {
      list.appendChild(renderRow(job, () => renderHome(container)));
    }
    listWrap.appendChild(list);
  }

  renderList();
}
