import fs from "node:fs";
import path from "node:path";
import { runClaude } from "./claude.js";

interface ReferralBlurbContext {
  company: string;
  title: string;
  description: string;
  masterResume: string;
  aiReview: string;
  referrerName: string;
  referralRelation: string;
  referralContext: string;
}

export async function generateReferralBlurb(ctx: ReferralBlurbContext): Promise<string> {
  const prompt = `You are writing a referral blurb that ${ctx.referrerName} can use to refer a candidate at ${ctx.company} for the ${ctx.title} role. The blurb should be written from ${ctx.referrerName}'s perspective (first person).

## Referrer Details
- **Name:** ${ctx.referrerName}
- **Relation to candidate:** ${ctx.referralRelation || "(not specified)"}
- **Additional context:** ${ctx.referralContext || "(none)"}

## Target Role
- **Company:** ${ctx.company}
- **Title:** ${ctx.title}

## Job Description
${ctx.description || "(No job description available)"}

## Candidate's Resume (source of truth for all facts)
${ctx.masterResume}

## AI Resume Review (strengths and gaps analysis)
${ctx.aiReview || "(No review available)"}

## Instructions
Write a referral blurb in exactly three paragraphs:

1. **Introduction** — How ${ctx.referrerName} knows the candidate, their professional relationship (${ctx.referralRelation}), and how long/in what capacity they've worked together or know each other. Make it personal and authentic.

2. **Technical strengths** — Highlight the candidate's technical skills, accomplishments, and experience that are most relevant to the ${ctx.title} role at ${ctx.company}. Reference specific projects, technologies, or achievements from their resume that align with the job description.

3. **Soft skills & values** — Speak to the candidate's work ethic, leadership, collaboration, passion, and values. Explain why they would be a great cultural addition to ${ctx.company}. Be genuine and specific.

Guidelines:
- Write naturally as if ${ctx.referrerName} is personally vouching for the candidate.
- Only reference facts from the candidate's resume — do not fabricate.
- Tailor the blurb to the specific role and company.
- Keep it concise — each paragraph should be 3-5 sentences.
- Output ONLY the blurb — no headers, no commentary, no labels.`;

  return runClaude(prompt);
}

function blurbPrefix(company: string, title: string, referrerName: string): string {
  const comp = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const abbrev = title
    .replace(/[,/]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0].toLowerCase())
    .join("");
  const referrer = referrerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "referral";
  return `${comp}-${abbrev}-${referrer}-blurb`;
}

export function generateBlurbFilename(company: string, title: string, blurbsDir: string, referrerName: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = blurbPrefix(company, title, referrerName);
  let version = 1;
  if (fs.existsSync(blurbsDir)) {
    const existing = fs.readdirSync(blurbsDir).filter(f => f.includes(prefix) && f.endsWith(".md"));
    version = existing.length + 1;
  }
  return `${date}-${prefix}-v${version}.md`;
}

export function findBlurbsForJob(company: string, title: string, blurbsDir: string, referrerName: string): { filename: string; version: number; timestamp: string }[] {
  if (!fs.existsSync(blurbsDir)) return [];
  const prefix = blurbPrefix(company, title, referrerName);
  return fs.readdirSync(blurbsDir)
    .filter(f => f.includes(prefix) && f.endsWith(".md"))
    .map(f => {
      const vMatch = f.match(/-v(\d+)\.md$/);
      const version = vMatch ? parseInt(vMatch[1], 10) : 0;
      const stat = fs.statSync(path.join(blurbsDir, f));
      return { filename: f, version, timestamp: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.version - a.version);
}
