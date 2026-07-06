import fs from "node:fs";
import path from "node:path";

function shortRoundId(roundId: string): string {
  return roundId.slice(0, 8);
}

function transcriptPrefix(company: string, roundName: string, roundId: string): string {
  const comp = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "company";
  const round = (roundName || "round").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "round";
  return `${comp}-${round}-${shortRoundId(roundId)}-transcript`;
}

export function transcriptFilename(company: string, roundName: string, roundId: string, ext: string, dir: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const id = shortRoundId(roundId);
  const cleanExt = (ext || "txt").replace(/[^a-z0-9]/gi, "").toLowerCase() || "txt";
  let version = 1;
  if (fs.existsSync(dir)) {
    const existing = fs.readdirSync(dir).filter(f => f.includes(`-${id}-transcript`));
    version = existing.length + 1;
  }
  return `${date}-${transcriptPrefix(company, roundName, roundId)}-v${version}.${cleanExt}`;
}

export function findTranscriptsForRound(roundId: string, dir: string): { filename: string; version: number; timestamp: string }[] {
  if (!fs.existsSync(dir)) return [];
  const id = shortRoundId(roundId);
  return fs.readdirSync(dir)
    .filter(f => f.includes(`-${id}-transcript`))
    .map(f => {
      const vMatch = f.match(/-v(\d+)\.[^.]+$/);
      const version = vMatch ? parseInt(vMatch[1], 10) : 0;
      const stat = fs.statSync(path.join(dir, f));
      return { filename: f, version, timestamp: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.version - a.version);
}
