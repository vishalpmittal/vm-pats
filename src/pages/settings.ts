import { el } from "../utils/dom";
import { showToast } from "../utils/toast";

function buildDataDirSection(currentDir: string): HTMLElement {
  const input = el("input", {
    type: "text",
    className: "form-input",
    value: currentDir,
    placeholder: "/absolute/path/to/data",
    style: "flex:1; font-family:monospace; font-size:0.85rem",
  }) as HTMLInputElement;

  const applyBtn = el("button", { className: "btn btn-primary btn-sm" }, "Apply") as HTMLButtonElement;
  const statusEl = el("p", { style: "margin-top:10px; font-size:0.82rem; color:var(--text-muted)" }, `Active: ${currentDir}`);

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

  return el("div", { className: "glass-card", style: "padding:24px; margin-bottom:16px" },
    el("h2", { style: "margin:0 0 6px; font-size:1rem; font-weight:600" }, "Data Directory"),
    el("p", { style: "margin:0 0 16px; font-size:0.83rem; color:var(--text-muted)" },
      "Folder where all jobs, resumes, and generated files are stored. If the folder is empty or new, it will be initialized with the required structure."
    ),
    el("div", { style: "display:flex; gap:8px; align-items:center" }, input, applyBtn),
    statusEl,
  );
}

interface AiSettings {
  provider: "anthropic" | "google" | null;
  hasAnthropicKey: boolean;
  hasGoogleKey: boolean;
}

function buildAiSection(ai: AiSettings): HTMLElement {
  const providers: Array<{ value: "anthropic" | "google"; label: string; placeholder: string }> = [
    { value: "anthropic", label: "Anthropic (Claude)", placeholder: "sk-ant-..." },
    { value: "google", label: "Google Gemini", placeholder: "AIza..." },
  ];

  let selectedProvider: "anthropic" | "google" = ai.provider ?? "anthropic";

  const keyInput = el("input", {
    type: "password",
    className: "form-input",
    style: "flex:1; font-family:monospace; font-size:0.85rem",
    placeholder: providers.find(p => p.value === selectedProvider)?.placeholder ?? "",
  }) as HTMLInputElement;

  const hasKeyHint = el("span", { style: "font-size:0.78rem; color:var(--text-muted); margin-left:8px" });
  const updateHint = () => {
    const has = selectedProvider === "anthropic" ? ai.hasAnthropicKey : ai.hasGoogleKey;
    hasKeyHint.textContent = has ? "Key saved — leave blank to keep existing" : "";
  };
  updateHint();

  const radioGroup = el("div", { style: "display:flex; gap:16px; margin-bottom:16px" });
  for (const p of providers) {
    const radio = el("input", { type: "radio", name: "ai-provider", value: p.value }) as HTMLInputElement;
    radio.checked = p.value === selectedProvider;
    radio.addEventListener("change", () => {
      selectedProvider = p.value;
      keyInput.placeholder = p.placeholder;
      keyInput.value = "";
      updateHint();
    });
    const label = el("label", { style: "display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.9rem" },
      radio, el("span", {}, p.label)
    );
    radioGroup.appendChild(label);
  }

  const saveBtn = el("button", { className: "btn btn-primary btn-sm" }, "Save") as HTMLButtonElement;
  const statusEl = el("p", { style: "margin-top:10px; font-size:0.82rem; color:var(--text-muted)" },
    ai.provider ? `Active: ${providers.find(p => p.value === ai.provider)?.label ?? ai.provider}` : "No provider configured — Claude CLI will be used if available."
  );

  saveBtn.addEventListener("click", async () => {
    saveBtn.textContent = "Saving...";
    saveBtn.setAttribute("disabled", "true");
    try {
      const body: Record<string, string> = { provider: selectedProvider };
      if (keyInput.value.trim()) body.apiKey = keyInput.value.trim();
      const resp = await fetch("/api/settings/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await resp.json();
      if (!resp.ok) { alert(json.error ?? "Failed to save"); return; }
      ai.provider = json.provider;
      ai.hasAnthropicKey = json.hasAnthropicKey;
      ai.hasGoogleKey = json.hasGoogleKey;
      keyInput.value = "";
      updateHint();
      statusEl.textContent = `Active: ${providers.find(p => p.value === json.provider)?.label ?? json.provider}`;
      showToast("AI backend updated.");
    } catch {
      alert("Failed to connect to server.");
    } finally {
      saveBtn.textContent = "Save";
      saveBtn.removeAttribute("disabled");
    }
  });

  return el("div", { className: "glass-card", style: "padding:24px" },
    el("h2", { style: "margin:0 0 6px; font-size:1rem; font-weight:600" }, "AI Backend"),
    el("p", { style: "margin:0 0 16px; font-size:0.83rem; color:var(--text-muted)" },
      "Select a provider and enter its API key. Only one provider is active at a time. If no provider is configured, the Claude CLI is used as fallback."
    ),
    radioGroup,
    el("div", { style: "display:flex; align-items:center; gap:8px" },
      keyInput, saveBtn, hasKeyHint,
    ),
    statusEl,
  );
}

export async function renderSettings(container: HTMLElement): Promise<void> {
  container.innerHTML = "";
  container.appendChild(el("div", { className: "page-header" }, el("h1", {}, "Settings")));

  try {
    const [settingsResp, aiResp] = await Promise.all([
      fetch("/api/settings"),
      fetch("/api/settings/ai"),
    ]);
    const settings = await settingsResp.json();
    const ai: AiSettings = await aiResp.json();

    container.appendChild(buildDataDirSection(settings.dataDir ?? ""));
    container.appendChild(buildAiSection(ai));
  } catch {
    container.appendChild(el("div", { className: "empty-state glass-card" }, el("p", {}, "Failed to load settings.")));
  }
}
