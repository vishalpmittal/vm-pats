// Import new companies from /Users/vimittal/Downloads/VM/applications.html.
// Skips placeholders, exact matches, and fuzzy duplicates. Appends remaining new
// companies with empty sector/about/careersUrl, type="Private", isFavorite=false.
// Does NOT modify any existing entries. Run scripts/backfill-missing-fields.ts after.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_FILE = "/Users/vimittal/Downloads/VM/applications.html";
const COMPANIES_FILE = path.resolve(__dirname, "..", "data", "companies", "all-companies.json");

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

const STOPWORDS = new Set([
  "inc", "incorporated", "corp", "corporation", "co", "ltd", "llc",
  "ai", "labs", "lab", "platforms", "platform", "global", "holdings", "holding",
  "group", "the", "of", "and", "services", "systems", "solutions",
  "international", "software", "media", "scientific", "entertainment",
  "technology", "technologies", "tech", "com",
]);

const PLACEHOLDER = new Set(["confidential", "undisclosed", "stealth startup", "companies tbd"]);

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
}
function normTight(s: string): string {
  return tokenize(s).join("");
}
function normStripStop(s: string): string {
  return tokenize(s).filter(t => !STOPWORDS.has(t)).join("");
}
function isMeaningfulAlt(s: string): boolean {
  return s.length >= 6 && !STOPWORDS.has(s);
}
function altKeysFor(name: string): { primary: string; alts: string[] } {
  const primary = normTight(name);
  const alts = new Set<string>();
  const stripped = normStripStop(name);
  if (stripped && stripped !== primary && stripped.length >= 4) alts.add(stripped);
  const baseNoParens = name.replace(/\([^)]*\)/g, " ").trim();
  if (baseNoParens) {
    const k = normTight(baseNoParens);
    if (k && k !== primary && k.length >= 4) alts.add(k);
    const ks = normStripStop(baseNoParens);
    if (ks && ks !== primary && ks.length >= 4) alts.add(ks);
  }
  for (const p of (name.match(/\(([^)]*)\)/g) ?? [])) {
    const inner = p.replace(/[()]/g, "").trim();
    for (const part of inner.split(/[\/,]/)) {
      const k = normTight(part);
      if (k && isMeaningfulAlt(k)) alts.add(k);
    }
  }
  for (const part of name.split(/\s*\/\s*/)) {
    const k = normTight(part);
    if (k && k !== primary && k.length >= 5) alts.add(k);
  }
  alts.delete("");
  alts.delete(primary);
  return { primary, alts: [...alts] };
}

function extractCompanies(): string[] {
  const html = fs.readFileSync(HTML_FILE, "utf-8");
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const order: string[] = [];
  $("table tr").each((_, tr) => {
    const cells: string[] = [];
    $(tr).find("td, th").each((__, td) => cells.push($(td).text().trim()));
    let name = cells[2];
    if (!name) return;
    name = name.trim();
    if (name === "Companies" || name === "Follow ups") return;
    if (name.length === 1) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    order.push(name);
  });
  return order;
}

function main(): void {
  const companies: Company[] = JSON.parse(fs.readFileSync(COMPANIES_FILE, "utf-8"));
  const imported = extractCompanies();

  // Index existing
  const keyToExisting = new Map<string, Company>();
  for (const c of companies) {
    const { primary } = altKeysFor(c.company);
    if (primary && !keyToExisting.has(primary)) keyToExisting.set(primary, c);
  }
  for (const c of companies) {
    const { alts } = altKeysFor(c.company);
    for (const a of alts) if (!keyToExisting.has(a)) keyToExisting.set(a, c);
  }

  // Intra-import dedup by stopword-stripped key
  const importByStripKey = new Map<string, string[]>();
  for (const name of imported) {
    if (PLACEHOLDER.has(name.toLowerCase())) continue;
    const key = normStripStop(name) || normTight(name);
    if (!key) continue;
    if (!importByStripKey.has(key)) importByStripKey.set(key, []);
    importByStripKey.get(key)!.push(name);
  }

  let maxRank = companies.reduce((m, c) => Math.max(m, c.rank), 0);
  const added: string[] = [];
  const skippedExact: string[] = [];
  const skippedFuzzy: string[] = [];

  for (const [stripKey, variants] of importByStripKey) {
    const canonical = variants[0];
    const canonicalPrimary = normTight(canonical);
    const { alts } = altKeysFor(canonical);
    const candidates = [canonicalPrimary, stripKey, ...alts].filter(Boolean);

    let matched: Company | undefined;
    let isExact = false;
    for (const k of candidates) {
      const ex = keyToExisting.get(k);
      if (!ex) continue;
      if (normTight(ex.company) === canonicalPrimary) { matched = ex; isExact = true; break; }
      if (!matched) matched = ex;
    }

    if (matched) {
      if (isExact) skippedExact.push(canonical);
      else skippedFuzzy.push(`${canonical} -> #${matched.rank} ${matched.company}`);
      continue;
    }

    maxRank += 1;
    companies.push({
      rank: maxRank,
      company: canonical,
      sector: "",
      type: "Private",
      careersUrl: "",
      about: "",
      isFavorite: false,
    });
    added.push(`#${maxRank} ${canonical}`);
  }

  fs.writeFileSync(COMPANIES_FILE, JSON.stringify(companies, null, 2) + "\n");

  console.log(`Existing in DB before:        ${companies.length - added.length}`);
  console.log(`Imported unique strings:      ${imported.length}`);
  console.log(`Skipped placeholders:         4`);
  console.log(`Skipped exact matches:        ${skippedExact.length}`);
  console.log(`Skipped fuzzy duplicates:     ${skippedFuzzy.length}`);
  console.log(`Added new:                    ${added.length}`);
  console.log(`Total in DB after:            ${companies.length}`);
  console.log("");
  console.log("Fuzzy duplicates skipped (kept existing):");
  for (const s of skippedFuzzy) console.log(`  ${s}`);
}

main();
