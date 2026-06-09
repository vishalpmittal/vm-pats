// Scan the full companies DB for duplicate candidates using several keys:
//   1. Stopword-stripped + punctuation-stripped key (catches "Inc"/"Corp" variants)
//   2. Parenthetical alts (catches "Cursor" vs "Anysphere (Cursor)")
//   3. Levenshtein distance <= 2 on stopword-stripped keys (catches typos like "ZScalar" vs "Zscaler")

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
}
function normTight(s: string): string {
  return tokens(s).join("");
}
function normStripStop(s: string): string {
  return tokens(s).filter(t => !STOPWORDS.has(t)).join("");
}

function altKeys(name: string): string[] {
  const keys = new Set<string>();
  const primary = normTight(name);
  const stripped = normStripStop(name);
  if (primary) keys.add(primary);
  if (stripped && stripped.length >= 4) keys.add(stripped);
  const baseNoParens = name.replace(/\([^)]*\)/g, " ").trim();
  if (baseNoParens) {
    const k = normTight(baseNoParens);
    if (k && k.length >= 4) keys.add(k);
    const ks = normStripStop(baseNoParens);
    if (ks && ks.length >= 4) keys.add(ks);
  }
  for (const p of (name.match(/\(([^)]*)\)/g) ?? [])) {
    const inner = p.replace(/[()]/g, "").trim();
    for (const part of inner.split(/[\/,]/)) {
      const k = normTight(part);
      if (k && k.length >= 6 && !STOPWORDS.has(k)) keys.add(k);
    }
  }
  return [...keys];
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = Array(b.length + 1).fill(0).map((_, i) => i);
  const v1 = Array(b.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

function main(): void {
  const companies: Company[] = JSON.parse(fs.readFileSync(COMPANIES_FILE, "utf-8"));
  console.log(`Total companies: ${companies.length}`);
  console.log("");

  // --- Pass 1: stopword-stripped key clusters ---
  const stripGroups = new Map<string, Company[]>();
  for (const c of companies) {
    const k = normStripStop(c.company);
    if (!k || k.length < 3) continue;
    if (!stripGroups.has(k)) stripGroups.set(k, []);
    stripGroups.get(k)!.push(c);
  }
  const stripDupes = [...stripGroups.entries()].filter(([, v]) => v.length > 1);

  console.log(`===== STOPWORD-STRIPPED KEY CLUSTERS (${stripDupes.length}) =====`);
  for (const [key, group] of stripDupes) {
    console.log(`  [${key}]`);
    for (const c of group) console.log(`    #${c.rank}  "${c.company}"`);
  }
  console.log("");

  // --- Pass 2: alt-key cross-references (parens content) ---
  // Build: for each alt-key (not the primary), which companies have it?
  const altGroups = new Map<string, Company[]>();
  for (const c of companies) {
    const primary = normTight(c.company);
    for (const k of altKeys(c.company)) {
      if (k === primary) continue;
      if (!altGroups.has(k)) altGroups.set(k, []);
      altGroups.get(k)!.push(c);
    }
  }
  // For each alt key, also check whether that same key is the PRIMARY for a different company.
  const primaryMap = new Map<string, Company>();
  for (const c of companies) {
    const p = normTight(c.company);
    if (!primaryMap.has(p)) primaryMap.set(p, c);
  }

  const altMatches: { key: string; existing: Company; alias: Company }[] = [];
  for (const [k, group] of altGroups) {
    const directHit = primaryMap.get(k);
    if (directHit && !group.includes(directHit)) {
      for (const g of group) {
        altMatches.push({ key: k, existing: directHit, alias: g });
      }
    }
  }
  console.log(`===== ALT-KEY MATCHES (parenthetical/alias overlap) — ${altMatches.length} =====`);
  for (const m of altMatches) {
    console.log(`  via "${m.key}":  #${m.existing.rank} "${m.existing.company}"  ↔  #${m.alias.rank} "${m.alias.company}"`);
  }
  console.log("");

  // --- Pass 3: Levenshtein on stripped keys (typos) ---
  // Only compare if shorter key length >= 5, abs(length diff) <= 2, and distance <= 2.
  // Skip pairs already flagged in Pass 1 (same stripped key).
  const allStripped = companies
    .map(c => ({ c, k: normStripStop(c.company) }))
    .filter(x => x.k.length >= 5);
  const seenPair = new Set<string>();
  for (const [k, g] of stripDupes) {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      seenPair.add(`${Math.min(g[i].rank, g[j].rank)}-${Math.max(g[i].rank, g[j].rank)}`);
    }
  }
  const typoPairs: { a: Company; b: Company; dist: number }[] = [];
  for (let i = 0; i < allStripped.length; i++) {
    for (let j = i + 1; j < allStripped.length; j++) {
      const a = allStripped[i], b = allStripped[j];
      if (Math.abs(a.k.length - b.k.length) > 2) continue;
      const pairKey = `${Math.min(a.c.rank, b.c.rank)}-${Math.max(a.c.rank, b.c.rank)}`;
      if (seenPair.has(pairKey)) continue;
      const d = levenshtein(a.k, b.k);
      if (d > 0 && d <= 2) {
        typoPairs.push({ a: a.c, b: b.c, dist: d });
      }
    }
  }
  console.log(`===== LEVENSHTEIN <=2 (potential typos) — ${typoPairs.length} =====`);
  for (const t of typoPairs) {
    console.log(`  d=${t.dist}:  #${t.a.rank} "${t.a.company}"  ↔  #${t.b.rank} "${t.b.company}"`);
  }
}

main();
