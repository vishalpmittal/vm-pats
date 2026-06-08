import { getAll, update } from "../store";
import { el } from "../utils/dom";
import { showToast } from "../utils/toast";
import type { JobApplication } from "../types";

type DateField = "addedDate" | "postingDate" | "applicationDate";
type JobListMode = "opportunities" | "applied";

interface ModeConfig {
  title: string;
  filter: (j: JobApplication) => boolean;
  defaultDateField: DateField;
  emptyMessage: string;
  hideAppliedPill?: boolean;
  showAddButton?: boolean;
}

const MODES: Record<JobListMode, ModeConfig> = {
  opportunities: {
    title: "Opportunities",
    filter: (j) => !j.applicationDate,
    defaultDateField: "addedDate",
    emptyMessage: "No opportunities yet. Click \"+ Add New Role\" to get started.",
    hideAppliedPill: true,
    showAddButton: true,
  },
  applied: {
    title: "Applied",
    filter: (j) => !!j.applicationDate,
    defaultDateField: "applicationDate",
    emptyMessage: "No applied jobs yet. Check off \"Applied\" on a row in Opportunities.",
  },
};

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
        showToast(`Moving Job ${job.title} at ${job.company} to Applied`);
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

export async function renderJobList(container: HTMLElement, mode: JobListMode): Promise<void> {
  container.innerHTML = "";
  const config = MODES[mode];

  const header = el("div", { className: "page-header" }, el("h1", {}, config.title));
  if (config.showAddButton) {
    const btn = el("button", { className: "btn btn-primary" }, "+ Add New Role");
    btn.addEventListener("click", () => { window.location.hash = "#/add"; });
    header.appendChild(btn);
  }
  container.appendChild(header);

  const allJobs = await getAll();
  const jobs = allJobs.filter(config.filter);

  if (jobs.length === 0) {
    const empty = el("div", { className: "empty-state glass-card" },
      el("p", {}, config.emptyMessage),
    );
    container.appendChild(empty);
    return;
  }

  type SortKey = DateField | "company" | "title" | "location";
  type SortDir = "asc" | "desc";
  let sortKey: SortKey = config.defaultDateField;
  let sortDir: SortDir = "desc";

  let searchQuery = "";
  let dateField: DateField = config.defaultDateField;
  let dateValue = "";

  // --- Filter row ---
  const searchInput = el("input", {
    type: "search",
    placeholder: "Search by company or title...",
    className: "input filter-search",
  }) as HTMLInputElement;
  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderList();
  });

  const calendarSvg = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="1"></rect><line x1="2" y1="6" x2="14" y2="6"></line><line x1="5" y1="2" x2="5" y2="4"></line><line x1="11" y1="2" x2="11" y2="4"></line></svg>';

  const calendarBtn = el("button", { className: "filter-toggle filter-calendar-btn", type: "button", title: "Filter by date" });
  calendarBtn.innerHTML = calendarSvg;

  const datePopover = el("div", { className: "date-popover hidden" });
  datePopover.addEventListener("click", (e) => e.stopPropagation());

  function renderDatePopover() {
    datePopover.innerHTML = "";

    const fieldGroup = el("div", { className: "date-popover-fields" });
    const fieldOptions: { key: DateField; label: string }[] = [
      { key: "addedDate", label: "Added" },
      { key: "postingDate", label: "Posted" },
      { key: "applicationDate", label: "Applied" },
    ];
    for (const opt of fieldOptions) {
      if (opt.key === "applicationDate" && config.hideAppliedPill) continue;
      const pill = el("button", {
        type: "button",
        className: `date-pill${dateField === opt.key ? " active" : ""}`,
      }, opt.label);
      pill.addEventListener("click", () => {
        dateField = opt.key;
        renderDatePopover();
        if (dateValue) renderList();
      });
      fieldGroup.appendChild(pill);
    }

    const dateInput = el("input", {
      type: "date",
      className: "input date-popover-input",
      value: dateValue,
    }) as HTMLInputElement;
    dateInput.addEventListener("input", () => {
      dateValue = dateInput.value;
      calendarBtn.classList.toggle("active", !!dateValue);
      renderList();
    });

    const clearBtn = el("button", { type: "button", className: "btn btn-secondary btn-sm" }, "Clear");
    clearBtn.addEventListener("click", () => {
      dateValue = "";
      calendarBtn.classList.remove("active");
      renderDatePopover();
      renderList();
    });

    datePopover.appendChild(el("div", { className: "date-popover-label" }, "Filter by"));
    datePopover.appendChild(fieldGroup);
    datePopover.appendChild(el("div", { className: "date-popover-label" }, "Date"));
    datePopover.appendChild(dateInput);
    datePopover.appendChild(clearBtn);
  }

  function closePopover(): void {
    datePopover.classList.add("hidden");
    document.removeEventListener("click", outsideClickHandler);
  }

  function outsideClickHandler(e: MouseEvent): void {
    const target = e.target as Node;
    if (!datePopover.contains(target) && !calendarBtn.contains(target)) {
      closePopover();
    }
  }

  calendarBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = datePopover.classList.contains("hidden");
    if (isHidden) {
      renderDatePopover();
      datePopover.classList.remove("hidden");
      setTimeout(() => document.addEventListener("click", outsideClickHandler), 0);
    } else {
      closePopover();
    }
  });

  const calendarWrap = el("div", { className: "filter-calendar-wrap" }, calendarBtn, datePopover);

  const filterRow = el("div", { className: "filter-row" },
    searchInput,
    el("div", { className: "filter-toggles" }, calendarWrap),
  );
  container.appendChild(filterRow);

  const listWrap = el("div", {});
  container.appendChild(listWrap);

  function applyFilters(): JobApplication[] {
    let result = jobs;
    if (searchQuery) {
      result = result.filter(j =>
        j.company.toLowerCase().includes(searchQuery) ||
        j.title.toLowerCase().includes(searchQuery)
      );
    }
    if (dateValue) {
      result = result.filter(j => (j[dateField] ?? "") === dateValue);
    }
    return result;
  }

  function renderList() {
    listWrap.innerHTML = "";

    const filtered = applyFilters();
    const sorted = [...filtered].sort((a, b) => {
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

    if (sorted.length === 0) {
      listWrap.appendChild(el("div", { className: "empty-state glass-card filter-empty" },
        el("p", {}, "No jobs match the current filters.")
      ));
      return;
    }

    const list = el("div", { className: "job-list" });
    for (const job of sorted) {
      list.appendChild(renderRow(job, () => renderJobList(container, mode)));
    }
    listWrap.appendChild(list);
  }

  renderList();
}

export const renderHome = (container: HTMLElement) => renderJobList(container, "opportunities");
export const renderApplied = (container: HTMLElement) => renderJobList(container, "applied");
