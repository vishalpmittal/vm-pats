import fs from "node:fs";
import path from "node:path";
import { runClaude } from "./claude.js";

interface CoverLetterContext {
  company: string;
  title: string;
  location: string;
  description: string;
  masterResume: string;
  aiReview: string;
  referrerName: string;
  referralRelation: string;
  additionalNotes: string;
}

export async function generateCoverLetter(ctx: CoverLetterContext): Promise<string> {
  const referrerSection = ctx.referrerName
    ? `\n## Referrer at Company\n- **Name:** ${ctx.referrerName}\n- **Relation:** ${ctx.referralRelation || "(not specified)"}`
    : "";

  const prompt = `You are writing a cover letter for a candidate applying to ${ctx.company} for the ${ctx.title} role.

## Target Role
- **Company:** ${ctx.company}
- **Title:** ${ctx.title}
- **Location:** ${ctx.location || "(not specified)"}

## Job Description
${ctx.description || "(No job description available)"}

## Candidate's Resume (source of truth for all facts)
${ctx.masterResume}

## AI Resume Review (strengths and gaps analysis)
${ctx.aiReview || "(No review available)"}
${referrerSection}

## Additional Notes from Candidate
${ctx.additionalNotes || "(None)"}

## Instructions
Write a cover letter in exactly three paragraphs:

1. **Why I'm interested** — Express genuine enthusiasm for this specific role at ${ctx.company}. Reference the company's mission, values, pillars, or recent initiatives that resonate with the candidate. Show that this isn't a generic application — the candidate has done their research and is drawn to what ${ctx.company} stands for.

2. **Why I'm a great fit** — Connect the candidate's most relevant experience, technical skills, and accomplishments directly to the role requirements. Be specific — reference projects, technologies, and impact from the resume that align with the job description. Show how the candidate's background uniquely positions them to excel.

3. **Alignment & connections** — Tie together the candidate's values, work ethic, and career goals with the company's culture and mission.${ctx.referrerName ? ` Mention that ${ctx.referrerName} (${ctx.referralRelation}) referred them and can speak to their qualifications.` : ""} Close with a confident, forward-looking statement about contributing to ${ctx.company}.

Guidelines:
- Write in first person as the candidate.
- Only reference facts from the resume — do not fabricate.
- Tailor every sentence to this specific company and role.
- Keep it concise — each paragraph should be 3-5 sentences.
- Professional but personable tone — not stiff or formulaic.
- Output ONLY the cover letter body — no "Dear Hiring Manager", no sign-off, no headers.`;

  return runClaude(prompt);
}

function coverLetterPrefix(company: string, title: string): string {
  const comp = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const abbrev = title
    .replace(/[,/]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0].toLowerCase())
    .join("");
  return `${comp}-${abbrev}-cover-letter`;
}

export function generateCoverLetterFilename(company: string, title: string, coverLettersDir: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = coverLetterPrefix(company, title);
  let version = 1;
  if (fs.existsSync(coverLettersDir)) {
    const existing = fs.readdirSync(coverLettersDir).filter(f => f.includes(prefix) && f.endsWith(".md"));
    version = existing.length + 1;
  }
  return `${date}-${prefix}-v${version}.md`;
}

export function findCoverLettersForJob(company: string, title: string, coverLettersDir: string): { filename: string; version: number; timestamp: string }[] {
  if (!fs.existsSync(coverLettersDir)) return [];
  const prefix = coverLetterPrefix(company, title);
  return fs.readdirSync(coverLettersDir)
    .filter(f => f.includes(prefix) && f.endsWith(".md"))
    .map(f => {
      const vMatch = f.match(/-v(\d+)\.md$/);
      const version = vMatch ? parseInt(vMatch[1], 10) : 0;
      const stat = fs.statSync(path.join(coverLettersDir, f));
      return { filename: f, version, timestamp: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.version - a.version);
}
