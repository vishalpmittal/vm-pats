import { execFile } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";

let cliAvailable: boolean | null = null;

function checkCliAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("claude", ["--version"], { timeout: 5_000 }, (err) => {
      resolve(!err);
    });
  });
}

function runClaudeCLI(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("claude", ["-p", prompt, "--output-format", "text"], {
      maxBuffer: 1024 * 1024,
      timeout: 180_000,
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function runClaudeSDK(prompt: string): Promise<string> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return text.trim();
}

export async function runClaude(prompt: string): Promise<string> {
  if (cliAvailable === null) {
    cliAvailable = await checkCliAvailable();
    if (cliAvailable) {
      console.log("[AI] Using claude CLI");
    } else if (process.env.ANTHROPIC_API_KEY) {
      console.log("[AI] Claude CLI not found, using Anthropic SDK");
    } else {
      console.warn("[AI] No AI backend available. Install claude CLI or set ANTHROPIC_API_KEY.");
    }
  }

  if (cliAvailable) {
    return runClaudeCLI(prompt);
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return runClaudeSDK(prompt);
  }

  throw new Error(
    "No AI backend configured. Either install the claude CLI or set the ANTHROPIC_API_KEY environment variable."
  );
}
