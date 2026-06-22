import { el } from "../utils/dom";
import { showToast } from "../utils/toast";

function parseBackupFilename(filename: string): { date: string; time: string; name: string } {
  // yyyymmdd-HHMMSS-Master-Resume-Firstname-Lastname.md
  const m = filename.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-Master-Resume-(.+)\.md$/);
  if (!m) return { date: "", time: "", name: filename };
  const [, yr, mo, dy, hh, mm, ss, namePart] = m;
  return {
    date: `${yr}-${mo}-${dy}`,
    time: `${hh}:${mm}:${ss}`,
    name: namePart.replace(/-/g, " "),
  };
}

async function backupNow(): Promise<string | null> {
  const resp = await fetch("/api/master-resume/backup", { method: "POST" });
  const json = await resp.json();
  if (!resp.ok) { alert(json.error ?? "Failed to backup"); return null; }
  return json.filename as string;
}

async function renderTable(tableContainer: HTMLElement): Promise<void> {
  tableContainer.innerHTML = "";

  const resp = await fetch("/api/master-resume/backups");
  const json = await resp.json();
  const backups: string[] = json.backups ?? [];

  if (backups.length === 0) {
    tableContainer.appendChild(
      el("div", { className: "empty-state glass-card" },
        el("p", {}, "No backups yet. Click \"Backup Now\" to create one."),
      )
    );
    return;
  }

  const thead = el("thead", {},
    el("tr", {},
      el("th", {}, "Date"),
      el("th", {}, "Time"),
      el("th", {}, "Name"),
      el("th", {}, ""),
    ),
  );

  const tbody = el("tbody", {});
  for (const filename of backups) {
    const { date, time, name } = parseBackupFilename(filename);
    const restoreBtn = el("button", { className: "btn btn-secondary btn-sm" }, "Restore") as HTMLButtonElement;

    restoreBtn.addEventListener("click", async () => {
      if (!confirm(`Restore "${filename}" as your master resume? The current resume will be overwritten.`)) return;
      restoreBtn.textContent = "Restoring...";
      restoreBtn.setAttribute("disabled", "true");
      try {
        const r = await fetch(`/api/master-resume/restore/${encodeURIComponent(filename)}`, { method: "POST" });
        const rj = await r.json();
        if (!r.ok) { alert(rj.error ?? "Failed to restore"); return; }
        showToast(`Restored: ${filename}`);
      } catch {
        alert("Failed to connect to server.");
      } finally {
        restoreBtn.textContent = "Restore";
        restoreBtn.removeAttribute("disabled");
      }
    });

    tbody.appendChild(
      el("tr", { className: "guideline-list-item" },
        el("td", {}, date),
        el("td", {}, time),
        el("td", {}, name),
        el("td", { style: "text-align:right" }, restoreBtn),
      )
    );
  }

  const table = el("table", { className: "guideline-table" }, thead, tbody);
  const wrap = el("div", { className: "glass-card", style: "overflow:hidden; padding:0" });
  wrap.appendChild(table);
  tableContainer.appendChild(wrap);
}

export async function renderResumeBackups(container: HTMLElement): Promise<void> {
  container.innerHTML = "";

  const backupBtn = el("button", { className: "btn btn-primary btn-sm" }, "Backup Now") as HTMLButtonElement;

  const header = el("div", { className: "page-header" },
    el("div", { style: "display:flex; align-items:center; gap:12px" },
      el("a", { href: "#/master-resume", className: "btn btn-secondary btn-sm" }, "← Master Resume"),
      el("h1", { style: "margin:0" }, "Backup & Restore"),
    ),
    el("div", { className: "page-header-actions" }, backupBtn),
  );
  container.appendChild(header);

  const tableContainer = el("div", {});
  container.appendChild(tableContainer);

  await renderTable(tableContainer);

  backupBtn.addEventListener("click", async () => {
    backupBtn.textContent = "Backing up...";
    backupBtn.setAttribute("disabled", "true");
    try {
      const filename = await backupNow();
      if (filename) {
        showToast(`Backup saved: ${filename}`);
        await renderTable(tableContainer);
      }
    } catch {
      alert("Failed to connect to server.");
    } finally {
      backupBtn.textContent = "Backup Now";
      backupBtn.removeAttribute("disabled");
    }
  });
}
