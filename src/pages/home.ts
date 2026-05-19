import { getAll, update } from "../store";
import { el } from "../utils/dom";
import type { JobApplication } from "../types";

function renderRow(job: JobApplication, onRefresh: () => void): HTMLElement {
  const link = el("a", { href: job.jobLink, target: "_blank", rel: "noopener" }, "View");
  link.classList.add("job-link");

  const row = el(
    "div",
    { className: "job-row glass-card" },
    el("span", { className: "cell cell-date" }, job.postingDate),
    el("span", { className: "cell cell-company" }, job.company),
    el("span", { className: "cell cell-title" }, job.title),
    el("span", { className: "cell cell-location" }, job.location || "—"),
    el("span", { className: "cell cell-link" }, link),
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
    el("span", { className: "cell cell-notes" }, job.notes || "—")
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

  const listHeader = el(
    "div",
    { className: "job-row job-row-header" },
    el("span", { className: "cell cell-date" }, "Posted"),
    el("span", { className: "cell cell-company" }, "Company"),
    el("span", { className: "cell cell-title" }, "Title"),
    el("span", { className: "cell cell-location" }, "Location"),
    el("span", { className: "cell cell-link" }, "Link"),
    el("span", { className: "cell cell-date" }, "Applied"),
    el("span", { className: "cell cell-notes" }, "Notes")
  );
  container.appendChild(listHeader);

  const list = el("div", { className: "job-list" });
  for (const job of jobs) {
    list.appendChild(renderRow(job, () => renderHome(container)));
  }
  container.appendChild(list);
}
