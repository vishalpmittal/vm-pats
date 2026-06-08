import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const companiesFile = path.resolve(__dirname, "..", "data", "companies", "all-companies.json");
const inputFile = "/Users/vimittal/Downloads/New list of 37 companies that have hired.md";

interface Company {
  rank: number;
  company: string;
  sector: string;
  type: string;
  careersUrl: string;
  about?: string;
  isFavorite?: boolean;
  trending?: boolean;
}

interface ParsedEntry {
  name: string;
  about: string;
}

// Known aliases — the imported name on left should match the existing DB entry on right.
const ALIASES: Record<string, string> = {
  "cursor": "anysphere (cursor)",
};

function parseFile(): ParsedEntry[] {
  const text = fs.readFileSync(inputFile, "utf-8");
  const entries: ParsedEntry[] = [];

  for (const line of text.split("\n")) {
    // Match: "1) Name - description (location)"  OR "1) Name - description"
    const m = line.match(/^\s*\d+\)\s+(.+?)\s+-\s+(.+?)\s*$/);
    if (!m) continue;
    const name = m[1].trim();
    let about = m[2].trim();
    // Strip trailing parenthetical location, e.g. "... (SF / NYC)"
    about = about.replace(/\s*\([^)]*\)\s*$/, "").trim();
    entries.push({ name, about });
  }
  return entries;
}

function findExisting(companies: Company[], name: string): Company | undefined {
  const target = ALIASES[name.toLowerCase()] ?? name.toLowerCase();
  return companies.find(c => c.company.toLowerCase() === target);
}

function main(): void {
  const companies: Company[] = JSON.parse(fs.readFileSync(companiesFile, "utf-8"));
  const entries = parseFile();
  console.log(`Parsed ${entries.length} entries from input file.`);

  let maxRank = companies.reduce((m, c) => Math.max(m, c.rank), 0);
  const updated: string[] = [];
  const added: string[] = [];

  for (const entry of entries) {
    const existing = findExisting(companies, entry.name);
    if (existing) {
      existing.trending = true;
      updated.push(`${existing.company} (was rank ${existing.rank})`);
    } else {
      maxRank += 1;
      companies.push({
        rank: maxRank,
        company: entry.name,
        sector: "",
        type: "Private",
        careersUrl: "",
        about: entry.about,
        isFavorite: false,
        trending: true,
      });
      added.push(`${entry.name} (rank ${maxRank})`);
    }
  }

  fs.writeFileSync(companiesFile, JSON.stringify(companies, null, 2) + "\n");

  console.log("");
  console.log(`Added new companies (${added.length}):`);
  for (const a of added) console.log(`  ${a}`);
  console.log("");
  console.log(`Marked existing as trending (${updated.length}):`);
  for (const u of updated) console.log(`  ${u}`);

  const trendingCount = companies.filter(c => c.trending).length;
  const totalCount = companies.length;
  console.log("");
  console.log(`Total companies: ${totalCount}`);
  console.log(`Total trending: ${trendingCount}`);
}

main();
