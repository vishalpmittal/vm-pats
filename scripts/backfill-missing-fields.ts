// Backfill sector, about, and careersUrl for any company missing one or more of those
// fields. Batched (10 per AI call) using the same runClaude entry point as the server.
// Only OVERWRITES fields that are currently empty — never replaces existing values.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runClaude } from "../server/claude.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const companiesFile = path.resolve(__dirname, "..", "data", "companies", "all-companies.json");

interface Company {
  rank: number;
  company: string;
  sector?: string;
  type?: string;
  careersUrl?: string;
  about?: string;
  [key: string]: unknown;
}

const BATCH_SIZE = 10;

function readCompanies(): Company[] {
  return JSON.parse(fs.readFileSync(companiesFile, "utf-8"));
}
function writeCompanies(data: Company[]): void {
  fs.writeFileSync(companiesFile, JSON.stringify(data, null, 2) + "\n");
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

function buildPrompt(batch: Company[]): string {
  const list = batch.map((c, i) => `${i + 1}. ${c.company}`).join("\n");
  return `For each company below, return the following fields:
- "sector": the company's primary industry/sector (e.g., "Enterprise SaaS", "AI / Foundation Models", "Finance / Tech", "Healthcare / MedTech")
- "about": a very short one-liner describing what the company does. Max 6 words, no trailing period. Examples: "AI coding platform", "Cloud data warehouse", "Consumer payments app".
- "careersUrl": the company's careers/jobs page URL (must be a real, working URL)

Return ONLY a JSON array of objects in the same order as input. No markdown, no commentary.

Each object must have these keys: "company" (echo the input name exactly), "sector", "about", "careersUrl".

Example:
[{"company": "Stripe", "sector": "Payments / Fintech", "about": "Online payments infrastructure", "careersUrl": "https://stripe.com/jobs"}]

Companies:
${list}`;
}

interface AiEntry {
  company: string;
  sector?: string;
  about?: string;
  careersUrl?: string;
}

function parseResponse(raw: string): AiEntry[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("no JSON array found in response");
  return JSON.parse(match[0]);
}

async function main(): Promise<void> {
  const companies = readCompanies();
  const todo = companies.filter(c => isEmpty(c.sector) || isEmpty(c.about) || isEmpty(c.careersUrl));

  console.log(`Total companies: ${companies.length}`);
  console.log(`Needing backfill: ${todo.length}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Batches: ${Math.ceil(todo.length / BATCH_SIZE)}`);
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
    console.log(`[${batchNum}/${total}] Backfilling ${batch.length} companies...`);

    try {
      const raw = await runClaude(buildPrompt(batch));
      const parsed = parseResponse(raw);

      for (const entry of parsed) {
        const c = byName.get(entry.company.toLowerCase());
        if (!c) {
          console.warn(`  ! AI returned unknown company: ${entry.company}`);
          continue;
        }
        const updates: string[] = [];
        if (isEmpty(c.sector) && entry.sector) {
          c.sector = entry.sector.trim();
          updates.push(`sector="${c.sector}"`);
        }
        if (isEmpty(c.about) && entry.about) {
          c.about = entry.about.trim();
          updates.push(`about="${c.about}"`);
        }
        if (isEmpty(c.careersUrl) && entry.careersUrl) {
          c.careersUrl = entry.careersUrl.trim();
          updates.push(`url`);
        }
        if (updates.length > 0) {
          console.log(`  #${c.rank} ${c.company}: ${updates.join(", ")}`);
        }
      }

      writeCompanies(companies);
    } catch (err) {
      console.error(`  Batch ${batchNum} failed:`, err instanceof Error ? err.message : err);
      console.error("  Continuing...");
    }
  }

  const remaining = readCompanies().filter(c => isEmpty(c.sector) || isEmpty(c.about) || isEmpty(c.careersUrl));
  console.log("");
  console.log(`Remaining with missing fields: ${remaining.length}`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
