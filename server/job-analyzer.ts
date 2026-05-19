import { runClaude } from "./claude.js";

interface JobContext {
  company: string;
  title: string;
  location: string;
  description: string;
}

export async function analyzeResume(resume: string, job: JobContext): Promise<string> {
  const prompt = `You are a career advisor. I'm applying for a role and need help tailoring my resume.

## Job Details
- **Company:** ${job.company}
- **Title:** ${job.title}
- **Location:** ${job.location}

## Job Description
${job.description}

## My Current Resume
${resume}

## Instructions
Analyze my resume against this job posting and provide:
1. **Match Score** — How well does my resume align with this role (out of 10)?
2. **Key Gaps** — Skills or experiences mentioned in the job that are missing or weak in my resume.
3. **Suggested Updates** — Specific, actionable changes to make my resume stronger for this role. Include exact bullet points or phrases I should add or modify.
4. **Keywords to Add** — Important keywords from the job posting that should appear in my resume.

Be specific and actionable. Reference exact sections of my resume when suggesting changes.`;

  return runClaude(prompt);
}
