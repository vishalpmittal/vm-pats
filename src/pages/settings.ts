import { el } from "../utils/dom";
import { showToast } from "../utils/toast";

export async function renderSettings(container: HTMLElement): Promise<void> {
  container.innerHTML = "";
  container.appendChild(el("div", { className: "page-header" }, el("h1", {}, "Settings")));

  let current = "";
  try {
    const resp = await fetch("/api/settings");
    const json = await resp.json();
    current = json.dataDir ?? "";
  } catch {
    container.appendChild(el("div", { className: "empty-state glass-card" }, el("p", {}, "Failed to load settings.")));
    return;
  }

  const input = el("input", {
    type: "text",
    className: "form-input",
    value: current,
    placeholder: "/absolute/path/to/data",
    style: "flex:1; font-family: monospace; font-size:0.85rem",
  }) as HTMLInputElement;

  const applyBtn = el("button", { className: "btn btn-primary btn-sm" }, "Apply") as HTMLButtonElement;

  const statusEl = el("p", { className: "settings-status", style: "margin-top:10px; font-size:0.82rem; color:var(--text-muted)" }, `Active: ${current}`);

  applyBtn.addEventListener("click", async () => {
    const newPath = input.value.trim();
    if (!newPath) return;
    applyBtn.textContent = "Applying...";
    applyBtn.setAttribute("disabled", "true");
    try {
      const resp = await fetch("/api/settings/data-dir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: newPath }),
      });
      const json = await resp.json();
      if (!resp.ok) { alert(json.error ?? "Failed to apply"); return; }
      statusEl.textContent = `Active: ${json.dataDir}`;
      input.value = json.dataDir;
      showToast("Data directory updated and initialized.");
    } catch {
      alert("Failed to connect to server.");
    } finally {
      applyBtn.textContent = "Apply";
      applyBtn.removeAttribute("disabled");
    }
  });

  const section = el("div", { className: "glass-card", style: "padding:24px" },
    el("h2", { style: "margin:0 0 6px; font-size:1rem; font-weight:600" }, "Data Directory"),
    el("p", { style: "margin:0 0 16px; font-size:0.83rem; color:var(--text-muted)" },
      "Folder where all jobs, resumes, and generated files are stored. If the folder is empty or new, it will be initialized with the required structure."
    ),
    el("div", { style: "display:flex; gap:8px; align-items:center" }, input, applyBtn),
    statusEl,
  );

  container.appendChild(section);
}
