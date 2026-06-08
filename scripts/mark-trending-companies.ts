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
  about?: string;
  trending?: boolean;
  [key: string]: unknown;
}

function readCompanies(): Company[] {
  return JSON.parse(fs.readFileSync(companiesFile, "utf-8"));
}

function writeCompanies(data: Company[]): void {
  fs.writeFileSync(companiesFile, JSON.stringify(data, null, 2) + "\n");
}

async function main(): Promise<void> {
  const companies = readCompanies();

  const catalog = companies
    .map(c => `- ${c.company}${c.about ? ` (${c.about})` : ""}`)
    .join("\n");

  const prompt = `From the list of companies below, identify those that are CURRENTLY TRENDING in tech as of late 2025 / early 2026. Focus on:
- Hot AI labs and frontier model companies
- Fast-growing AI-native products and dev tools
- AI infrastructure / GPU clouds / inference platforms
- Companies experiencing notable momentum, hiring sprees, or buzz right now

Pick 15-25 companies total. Be selective — only include companies that someone scanning a job board today would recognize as "in the spotlight". Avoid established big tech (Google, Microsoft, Amazon, Apple, Meta) unless they have a uniquely hot moment. Skip declining or stagnant companies.

Return ONLY a JSON array of company names, exactly as they appear in the input list. No markdown, no commentary.

Example: ["Anthropic", "Cursor", "Databricks"]

Companies:
${catalog}`;

  console.log(`Asking AI to pick trending companies from ${companies.length} options...`);
  const raw = await runClaude(prompt);

  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) {
    console.error("AI response had no JSON array:");
    console.error(raw);
    process.exit(1);
  }
  const picks: string[] = JSON.parse(match[0]);
  console.log(`AI picked ${picks.length} companies.`);

  // Match case-insensitive, accept exact match on .company. Mark trending=true and clear others.
  const byName = new Map(companies.map(c => [c.company.toLowerCase(), c]));
  const matched: string[] = [];
  const unmatched: string[] = [];

  // Reset all to false first so re-runs produce a fresh set.
  for (const c of companies) c.trending = false;

  for (const name of picks) {
    const c = byName.get(name.toLowerCase());
    if (c) {
      c.trending = true;
      matched.push(c.company);
    } else {
      unmatched.push(name);
    }
  }

  writeCompanies(companies);

  console.log("");
  console.log(`Marked trending (${matched.length}):`);
  for (const name of matched) console.log(`  ${name}`);
  if (unmatched.length > 0) {
    console.log("");
    console.log(`Could not match (${unmatched.length}):`);
    for (const name of unmatched) console.log(`  ${name}`);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
