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
  sector?: string;
  about?: string;
  [key: string]: unknown;
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
  // Reject too-short or pure-stopword alts (avoids "AWS", "IBM", "Tech" being indexed)
  if (s.length < 6) return false;
  if (STOPWORDS.has(s)) return false;
  return true;
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

  const parens = name.match(/\(([^)]*)\)/g) ?? [];
  for (const p of parens) {
    const inner = p.replace(/[()]/g, "").trim();
    // Inner may contain slash-separated alts: "Streaming/Tech"
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
    if (name === "Companies" || name === "Follow ups" || name === "B") return;
    if (name.length === 1) return; // column letters
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    order.push(name);
  });

  return order;
}

function main(): void {
  const imported = extractCompanies();
  console.log(`Unique company strings extracted from HTML: ${imported.length}`);

  const companies: Company[] = JSON.parse(fs.readFileSync(COMPANIES_FILE, "utf-8"));
  console.log(`Existing companies in DB: ${companies.length}`);
  console.log("");

  // Two-pass index: primary first (claims canonical), then alts (no override)
  const keyToExisting = new Map<string, Company>();
  for (const c of companies) {
    const { primary } = altKeysFor(c.company);
    if (primary && !keyToExisting.has(primary)) keyToExisting.set(primary, c);
  }
  for (const c of companies) {
    const { alts } = altKeysFor(c.company);
    for (const a of alts) {
      if (!keyToExisting.has(a)) keyToExisting.set(a, c);
    }
  }

  const exactMatches: { incoming: string; existing: Company }[] = [];
  const fuzzyMatches: { incoming: string; existing: Company; via: string }[] = [];
  const newOnes: string[] = [];
  const placeholders: string[] = [];

  // Collapse intra-import duplicates by stopword-stripped key (catches Docker / Docker Inc,
  // Pilot / Pilot.com, Valon / Valon Tech). Fallback to primary if stripped is empty.
  const importByPrimary = new Map<string, string[]>();
  for (const name of imported) {
    if (PLACEHOLDER.has(name.toLowerCase())) { placeholders.push(name); continue; }
    const stripped = normStripStop(name);
    const primary = stripped || normTight(name);
    if (!primary) continue;
    if (!importByPrimary.has(primary)) importByPrimary.set(primary, []);
    importByPrimary.get(primary)!.push(name);
  }

  for (const [stripKey, variants] of importByPrimary) {
    const canonical = variants[0];
    const canonicalPrimary = normTight(canonical);
    const { alts } = altKeysFor(canonical);
    const candidates: string[] = [canonicalPrimary, stripKey, ...alts];

    let matched: Company | undefined;
    let matchedVia = "";
    let matchedExact = false;

    for (const k of candidates) {
      if (!k) continue;
      const ex = keyToExisting.get(k);
      if (!ex) continue;
      const exPrimary = normTight(ex.company);
      if (canonicalPrimary === exPrimary) {
        matched = ex;
        matchedExact = true;
        matchedVia = "primary";
        break;
      }
      if (!matched) {
        matched = ex;
        matchedVia = k;
      }
    }

    if (matched) {
      if (matchedExact) exactMatches.push({ incoming: canonical, existing: matched });
      else fuzzyMatches.push({ incoming: canonical, existing: matched, via: matchedVia });
    } else {
      newOnes.push(canonical);
    }
  }

  const intraDupes = [...importByPrimary.entries()]
    .filter(([, vs]) => vs.length > 1)
    .map(([, vs]) => vs);

  console.log(`===== EXACT MATCHES (already in DB) — ${exactMatches.length} =====`);
  console.log("");

  console.log(`===== FUZZY MATCHES (potential duplicates) — ${fuzzyMatches.length} =====`);
  for (const m of fuzzyMatches) {
    console.log(`  "${m.incoming}"  ↔  #${m.existing.rank} "${m.existing.company}"  (via key: ${m.via})`);
  }
  console.log("");

  console.log(`===== INTRA-IMPORT VARIANTS — ${intraDupes.length} =====`);
  for (const vs of intraDupes) console.log(`  ${vs.map(v => `"${v}"`).join(", ")}`);
  console.log("");

  console.log(`===== PLACEHOLDERS (skipping) — ${placeholders.length} =====`);
  for (const p of placeholders) console.log(`  ${p}`);
  console.log("");

  console.log(`===== NEW (to add) — ${newOnes.length} =====`);
  for (const n of newOnes) console.log(`  ${n}`);
  console.log("");

  const missing = companies.filter(c => !c.sector || !c.about);
  console.log(`===== EXISTING DB MISSING SECTOR OR ABOUT — ${missing.length} =====`);
}

main();
