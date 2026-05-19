import { execFile } from "node:child_process";

export function runClaude(prompt: string): Promise<string> {
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
