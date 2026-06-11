import fs from "node:fs";
import path from "node:path";
import { runClaude } from "./claude.js";

interface InterviewerCtx { name: string; title: string; linkedinUrl: string; }

interface InterviewPrepContext {
  company: string;
  title: string;
  location: string;
  description: string;
  masterResume: string;
  aiReview: string;
  roundName: string;
  roundDate: string;
  roundStartTime: string;
  roundDuration: string;
  roundDetails: string;
  roundNotes: string;
  interviewers: InterviewerCtx[];
  priorRounds: { name: string; date: string; details: string; notes: string }[];
}

export async function generateInterviewPrep(ctx: InterviewPrepContext): Promise<string> {
  const interviewersBlock = ctx.interviewers.length > 0
    ? ctx.interviewers.map(i => `- **${i.name || "Unknown"}** — ${i.title || "(title unknown)"}${i.linkedinUrl ? ` (LinkedIn: ${i.linkedinUrl})` : ""}`).join("\n")
    : "(No interviewers listed)";

  const priorRoundsBlock = ctx.priorRounds.length > 0
    ? ctx.priorRounds.map(r => {
        const parts = [`### ${r.name || "(unnamed)"}${r.date ? ` — ${r.date}` : ""}`];
        if (r.details) parts.push(`**Interview Guidelines:** ${r.details}`);
        if (r.notes) parts.push(`**What happened:** ${r.notes}`);
        if (!r.details && !r.notes) parts.push("(no notes)");
        return parts.join("\n");
      }).join("\n\n")
    : "(No prior rounds recorded)";

  const prompt = `You are an interview prep coach helping a candidate prepare for a specific interview round.

## Target Role
- **Company:** ${ctx.company}
- **Title:** ${ctx.title}
- **Location:** ${ctx.location || "(not specified)"}

## Job Description
${ctx.description || "(No job description available)"}

## Upcoming Interview Round
- **Round Name:** ${ctx.roundName || "(unnamed)"}
- **Date:** ${ctx.roundDate || "(unspecified)"}
- **Start Time:** ${ctx.roundStartTime || "(unspecified)"}
- **Duration:** ${ctx.roundDuration ? `${ctx.roundDuration} minutes` : "(unspecified)"}
- **Interview Guidelines:** ${ctx.roundDetails || "(none)"}
- **Interview Notes (so far):** ${ctx.roundNotes || "(none)"}

## Interviewers
${interviewersBlock}

## Prior Rounds at This Company (for context — what's already been covered)
${priorRoundsBlock}

## Candidate's Resume (source of truth for all facts)
${ctx.masterResume}

## AI Resume Review (strengths and gaps to be aware of)
${ctx.aiReview || "(No review available)"}

## Instructions
Produce a markdown document with the following structure:

# Interview Prep — ${ctx.roundName || "Round"}${ctx.roundDate ? ` (${ctx.roundDate})` : ""}

## Likely Questions
A numbered list of 8–12 questions the candidate should expect specifically for THIS round. Tailor by drawing on:
- The round name and notes (e.g., system design, behavioral, hiring-manager, coding, deep dive).
- Each interviewer's title — engineering rounds focus differently than PM or director rounds.
- Requirements emphasized in the job description.
- Likely follow-ups on resume gaps surfaced by the AI review.
- Don't repeat questions already covered in prior rounds — build on them instead.

## Tentative Answers
For each question above, draft a 3–6 sentence answer the candidate can adapt. Be specific — cite real projects, technologies, and outcomes from the resume. Use STAR (Situation, Task, Action, Result) for behavioral questions. For gap-probing questions, acknowledge honestly and pivot to learning velocity or adjacent strengths.

## Questions to Ask the Interviewer(s)
4–6 thoughtful questions tailored to each interviewer's role. Show genuine curiosity about the team, technical decisions, roadmap, or company direction. Avoid generic "what's the culture like" — be specific.

## Last-Minute Reminders
A short bulleted list: key projects/numbers to weave in, gaps to preempt, format-specific reminders (whiteboard, screenshare, IDE setup), and one or two anecdotes that show range.

Guidelines:
- Be concrete to THIS company, role, and round — no generic boilerplate.
- Pull facts ONLY from the candidate's resume; do not invent experiences.
- Output ONLY the markdown document — no preamble or commentary.`;

  return runClaude(prompt);
}

function shortRoundId(roundId: string): string {
  return roundId.slice(0, 8);
}

function prepPrefix(company: string, roundName: string, roundId: string): string {
  const comp = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "company";
  const round = (roundName || "round").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "round";
  return `${comp}-${round}-${shortRoundId(roundId)}-prep`;
}

export function generatePrepFilename(company: string, roundName: string, roundId: string, prepDir: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const id = shortRoundId(roundId);
  let version = 1;
  if (fs.existsSync(prepDir)) {
    const existing = fs.readdirSync(prepDir).filter(f => f.includes(`-${id}-prep`) && f.endsWith(".md"));
    version = existing.length + 1;
  }
  return `${date}-${prepPrefix(company, roundName, roundId)}-v${version}.md`;
}

export function findPrepFilesForRound(roundId: string, prepDir: string): { filename: string; version: number; timestamp: string }[] {
  if (!fs.existsSync(prepDir)) return [];
  const id = shortRoundId(roundId);
  return fs.readdirSync(prepDir)
    .filter(f => f.includes(`-${id}-prep`) && f.endsWith(".md"))
    .map(f => {
      const vMatch = f.match(/-v(\d+)\.md$/);
      const version = vMatch ? parseInt(vMatch[1], 10) : 0;
      const stat = fs.statSync(path.join(prepDir, f));
      return { filename: f, version, timestamp: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.version - a.version);
}
