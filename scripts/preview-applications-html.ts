import fs from "node:fs";
import * as cheerio from "cheerio";

const file = "/Users/vimittal/Downloads/VM/applications.html";
const html = fs.readFileSync(file, "utf-8");
const $ = cheerio.load(html);

// Find the first table and dump rows.
const tables = $("table");
console.log(`Tables found: ${tables.length}`);

const rows: string[][] = [];
$("table tr").each((_, tr) => {
  const cells: string[] = [];
  $(tr).find("td, th").each((__, td) => {
    cells.push($(td).text().trim());
  });
  if (cells.some(c => c.length > 0)) rows.push(cells);
});

console.log(`Total non-empty rows: ${rows.length}`);
console.log("");
console.log("First 5 rows:");
for (const r of rows.slice(0, 5)) {
  console.log(JSON.stringify(r));
}
console.log("");
console.log("Sample mid-document row (index 50):");
if (rows[50]) console.log(JSON.stringify(rows[50]));
