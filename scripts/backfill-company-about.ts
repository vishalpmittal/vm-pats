import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runClaude } from "../server/claude.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const companiesFile = path.resolve(__dirname, "..", "data", "companies", "all-companies.json");

interface Company {
  rank: number;
  company: string;
  sector: string;
  type: string;
  careersUrl: string;
  about?: string;
  isFavorite?: boolean;
}

const BATCH_SIZE = 10;

function readCompanies(): Company[] {
  return JSON.parse(fs.readFileSync(companiesFile, "utf-8"));
}

function writeCompanies(data: Company[]): void {
  fs.writeFileSync(companiesFile, JSON.stringify(data, null, 2) + "\n");
}

function buildPrompt(batch: Company[]): string {
  const list = batch.map((c, i) => `${i + 1}. ${c.company}`).join("\n");
  return `For each company below, provide a very short one-liner describing what the company does. Maximum 6 words, no trailing period. Examples: "AI coding platform", "Cloud data warehouse", "Consumer payments app".

Companies:
${list}

Return ONLY a JSON array of objects with "company" and "about" fields, in the same order. No markdown, no explanation.

Example:
[{"company": "Cursor", "about": "AI coding platform"}, {"company": "Stripe", "about": "Online payments infrastructure"}]`;
}

function parseResponse(raw: string): { company: string; about: string }[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("no JSON array found in response");
  return JSON.parse(match[0]);
}

async function main(): Promise<void> {
  const companies = readCompanies();
  const todo = companies.filter(c => !c.about || c.about.trim() === "");

  console.log(`Total companies: ${companies.length}`);
  console.log(`Missing About: ${todo.length}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Estimated batches: ${Math.ceil(todo.length / BATCH_SIZE)}`);
  console.log("");

  if (todo.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  const byName = new Map(companies.map(c => [c.company.toLowerCase(), c]));

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const total = Math.ceil(todo.length / BATCH_SIZE);
    console.log(`[${batchNum}/${total}] Processing ${batch.length} companies...`);

    try {
      const raw = await runClaude(buildPrompt(batch));
      const parsed = parseResponse(raw);

      for (const entry of parsed) {
        const c = byName.get(entry.company.toLowerCase());
        if (c && entry.about) {
          c.about = entry.about.trim();
          console.log(`  ${c.company} -> ${c.about}`);
        } else if (!c) {
          console.warn(`  ! AI returned unknown company: ${entry.company}`);
        }
      }

      writeCompanies(companies);
    } catch (err) {
      console.error(`  Batch ${batchNum} failed:`, err instanceof Error ? err.message : err);
      console.error("  Continuing with next batch...");
    }
  }

  const remaining = readCompanies().filter(c => !c.about || c.about.trim() === "").length;
  console.log("");
  console.log(`Done. Remaining without About: ${remaining}`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
