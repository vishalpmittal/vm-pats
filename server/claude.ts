import { execFile } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";

export type AiProvider = "anthropic" | "google";

let configuredProvider: AiProvider | null = null;
let configuredApiKey: string | null = null;
let cliAvailable: boolean | null = null;

export function configureAiBackend(provider: AiProvider, apiKey: string): void {
  configuredProvider = provider;
  configuredApiKey = apiKey;
}

export function clearAiBackendConfig(): void {
  configuredProvider = null;
  configuredApiKey = null;
  cliAvailable = null;
}

function checkCliAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("claude", ["--version"], { timeout: 5_000 }, (err) => resolve(!err));
  });
}

function runClaudeCLI(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("claude", ["-p", prompt, "--output-format", "text"], {
      maxBuffer: 1024 * 1024,
      timeout: 180_000,
    }, (err, stdout, stderr) => {
      if (err) { reject(new Error(stderr || err.message)); return; }
      resolve(stdout.trim());
    });
  });
}

async function runAnthropicSDK(prompt: string, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

async function runGeminiAPI(prompt: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${text}`);
  }
  const data = await resp.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
}

function stripWrappingFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
  if (!match) return text;
  if (match[1].includes("```")) return text;
  return match[1].trim();
}

export async function runClaude(prompt: string): Promise<string> {
  let result: string;

  if (configuredProvider && configuredApiKey) {
    if (configuredProvider === "anthropic") {
      result = await runAnthropicSDK(prompt, configuredApiKey);
    } else {
      result = await runGeminiAPI(prompt, configuredApiKey);
    }
    return stripWrappingFence(result);
  }

  // Fall back to CLI if no provider configured
  if (cliAvailable === null) {
    cliAvailable = await checkCliAvailable();
    if (cliAvailable) {
      console.log("[AI] Using claude CLI");
    } else {
      console.warn("[AI] No AI backend available. Configure an API key in Settings or install the claude CLI.");
    }
  }

  if (cliAvailable) {
    result = await runClaudeCLI(prompt);
    return stripWrappingFence(result);
  }

  throw new Error(
    "No AI backend configured. Add an API key in the Settings page or install the claude CLI."
  );
}
