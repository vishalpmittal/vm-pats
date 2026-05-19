import fs from "node:fs";
import path from "node:path";
import { runClaude } from "./claude.js";

interface ResumeContext {
  company: string;
  title: string;
  location: string;
  description: string;
  masterResume: string;
  guidelines: string;
  aiReview: string;
  feedback: string;
}

export async function generateResumeContent(ctx: ResumeContext): Promise<string> {
  const prompt = `You are an expert resume writer. Generate a tailored, 10/10 matching resume for the target role.

## Target Role
- **Company:** ${ctx.company}
- **Title:** ${ctx.title}
- **Location:** ${ctx.location}

## Job Description
${ctx.description}

## My Master Resume (source of truth for all facts)
${ctx.masterResume}

## Resume Writing Guidelines
${ctx.guidelines}

## AI Resume Review for This Role (gaps and suggestions)
${ctx.aiReview || "(No review available)"}

## Additional Context / Feedback
${ctx.feedback || "(None)"}

## Instructions
1. Generate a complete, ready-to-use resume in markdown format.
2. Tailor every section to maximize alignment with the target role.
3. Incorporate ALL suggestions from the AI Resume Review — close every gap identified.
4. Follow the resume writing guidelines strictly.
5. Only use facts, experiences, and skills from the master resume — do not fabricate.
6. Reframe and reword existing experience to match the role's language and priorities.
7. Include: Contact Info, Summary, Professional Experience (most relevant roles only), Technical Skills, Education, Certifications.
8. Keep it to 2 pages max worth of content.
9. Output ONLY the resume markdown — no explanations, no commentary.`;

  return runClaude(prompt);
}

function resumePrefix(company: string, title: string): string {
  const comp = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const abbrev = title
    .replace(/[,/]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0].toLowerCase())
    .join("");
  return `${comp}-${abbrev}-VishalM-resume`;
}

export function generateResumeFilename(company: string, title: string, resumesDir: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = resumePrefix(company, title);
  let version = 1;
  if (fs.existsSync(resumesDir)) {
    const existing = fs.readdirSync(resumesDir).filter(f => f.includes(prefix) && f.endsWith(".md"));
    version = existing.length + 1;
  }
  return `${date}-${prefix}-v${version}.md`;
}

export function findResumesForJob(company: string, title: string, resumesDir: string): { filename: string; version: number; timestamp: string }[] {
  if (!fs.existsSync(resumesDir)) return [];
  const prefix = resumePrefix(company, title);
  return fs.readdirSync(resumesDir)
    .filter(f => f.includes(prefix) && f.endsWith(".md"))
    .map(f => {
      const vMatch = f.match(/-v(\d+)\.md$/);
      const version = vMatch ? parseInt(vMatch[1], 10) : 0;
      const stat = fs.statSync(path.join(resumesDir, f));
      return { filename: f, version, timestamp: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.version - a.version);
}
