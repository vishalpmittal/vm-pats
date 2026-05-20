import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { extractJobDetails } from "./extractor.js";
import { scrapeJobDescription } from "./scraper.js";
import { analyzeResume } from "./job-analyzer.js";
import { generateResumeContent, generateResumeFilename, findResumesForJob } from "./resume-generator.js";
import { runClaude } from "./claude.js";

interface JobApplication {
  id: string;
  company: string;
  title: string;
  jobLink: string;
  location: string;
  postingDate: string;
  applicationDate: string;
  notes: string;
  hasAiReview: boolean;
}

const JOB_FIELDS: ReadonlyArray<keyof Omit<JobApplication, "id">> = [
  "company", "title", "jobLink", "location",
  "postingDate", "applicationDate", "notes", "hasAiReview",
];

function pickJobFields(body: Record<string, unknown>): Partial<Omit<JobApplication, "id">> {
  const result: Record<string, unknown> = {};
  for (const key of JOB_FIELDS) {
    if (key in body) {
      result[key] = body[key];
    }
  }
  return result as Partial<Omit<JobApplication, "id">>;
}

const app = express();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");
const dataDir = path.resolve(process.env.PATS_DATA_DIR ?? path.join(__dirname, "..", "data"));
const dataFile = path.join(dataDir, "jobs", "jobs.json");
const reviewsFile = path.join(dataDir, "jobs", "reviews.json");
const resumeFile = path.join(dataDir, "resumes", "master-resume.md");
const gapFile = path.join(dataDir, "resumes", "resume-gap.md");
const resumesDir = path.join(dataDir, "resumes");
const guidelinesDir = path.join(dataDir, "guidelines");

function initDataDir(): void {
  fs.mkdirSync(path.join(dataDir, "jobs"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "resumes"), { recursive: true });
  fs.mkdirSync(guidelinesDir, { recursive: true });
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, "[]\n");
  if (!fs.existsSync(reviewsFile)) fs.writeFileSync(reviewsFile, "{}\n");

  const repoGuidelinesDir = path.join(__dirname, "..", "data", "guidelines");
  if (fs.existsSync(repoGuidelinesDir) && repoGuidelinesDir !== guidelinesDir) {
    for (const file of fs.readdirSync(repoGuidelinesDir).filter(f => f.endsWith(".md"))) {
      const dest = path.join(guidelinesDir, file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(repoGuidelinesDir, file), dest);
      }
    }
  }
}

initDataDir();

app.use(express.json());

function readJobs(): JobApplication[] {
  if (!fs.existsSync(dataFile)) return [];
  return JSON.parse(fs.readFileSync(dataFile, "utf-8")) as JobApplication[];
}

function writeJobs(jobs: JobApplication[]): void {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(jobs, null, 2) + "\n");
}

interface ReviewEntry { text: string; reviewedAt: string; }

function readReviews(): Record<string, ReviewEntry> {
  if (!fs.existsSync(reviewsFile)) return {};
  const raw = JSON.parse(fs.readFileSync(reviewsFile, "utf-8")) as Record<string, unknown>;
  const result: Record<string, ReviewEntry> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") {
      result[k] = { text: v, reviewedAt: "" };
    } else {
      result[k] = v as ReviewEntry;
    }
  }
  return result;
}

function writeReview(jobId: string, review: string): void {
  const reviews = readReviews();
  reviews[jobId] = { text: review, reviewedAt: new Date().toISOString() };
  fs.writeFileSync(reviewsFile, JSON.stringify(reviews, null, 2) + "\n");
}

const GAP_REGEX = /##\s*\d+\.\s*Key Gaps\s*\n([\s\S]*?)(?=\n##\s*\d+\.|$)/i;

function extractGapsFromReview(review: string): string {
  const match = review.match(GAP_REGEX);
  return match ? match[1].trim() : "";
}

async function consolidateGaps(): Promise<void> {
  try {
    const reviews = readReviews();
    const jobs = readJobs();
    const jobById = new Map(jobs.map(j => [j.id, j]));

    const allGaps: string[] = [];
    for (const [jobId, entry] of Object.entries(reviews)) {
      const gaps = extractGapsFromReview(entry.text);
      if (!gaps) continue;
      const job = jobById.get(jobId);
      const label = job ? `${job.company} — ${job.title}` : jobId;
      allGaps.push(`### ${label}\n${gaps}`);
    }

    if (allGaps.length === 0) {
      fs.writeFileSync(gapFile, "# Resume Gaps\n\nNo gaps identified yet.\n");
      return;
    }

    const prompt = `You are a career advisor. Below are resume gap analyses from multiple job applications. Consolidate them into a single, deduplicated document organized by category.

## Raw Gaps from Reviews

${allGaps.join("\n\n")}

## Instructions
1. Group all gaps into thematic categories such as: Technical Skills, Leadership & Management, Domain Knowledge, Certifications & Education, Communication & Soft Skills, and any other relevant categories.
2. Deduplicate — if the same gap appears across multiple roles, list it once and note how many roles flagged it in parentheses (e.g., "(3 roles)").
3. Within each category, list gaps as bullet points, most frequently cited first.
4. Do NOT include role-specific headers — this is a consolidated view.
5. Output clean markdown starting with "# Resume Gaps" as the title.
6. Output ONLY the markdown — no explanations or commentary.`;

    const consolidated = await runClaude(prompt);
    fs.writeFileSync(gapFile, consolidated + "\n");
  } catch (err) {
    console.error("Gap consolidation error:", err);
  }
}

// --- Jobs CRUD ---

app.get("/api/jobs", (_req, res) => {
  res.json(readJobs());
});

app.post("/api/jobs", (req, res) => {
  const fields = pickJobFields(req.body);
  if (!fields.company || !fields.title) {
    res.status(400).json({ error: "company and title are required" });
    return;
  }
  const jobs = readJobs();
  const entry: JobApplication = {
    company: fields.company,
    title: fields.title,
    jobLink: fields.jobLink ?? "",
    location: fields.location ?? "",
    postingDate: fields.postingDate ?? "",
    applicationDate: fields.applicationDate ?? "",
    notes: fields.notes ?? "",
    hasAiReview: false,
    id: crypto.randomUUID(),
  };
  jobs.push(entry);
  writeJobs(jobs);
  res.status(201).json(entry);
});

app.put("/api/jobs/:id", (req, res) => {
  const jobs = readJobs();
  const idx = jobs.findIndex((j) => j.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: "not found" }); return; }
  const fields = pickJobFields(req.body);
  jobs[idx] = { ...jobs[idx], ...fields, id: jobs[idx].id };
  writeJobs(jobs);
  res.json(jobs[idx]);
});

app.delete("/api/jobs/:id", (req, res) => {
  const jobs = readJobs();
  const filtered = jobs.filter((j) => j.id !== req.params.id);
  if (filtered.length === jobs.length) { res.status(404).json({ error: "not found" }); return; }
  writeJobs(filtered);
  res.status(204).end();
});

// --- URL extraction ---

app.get("/api/extract", async (req, res) => {
  const url = req.query.url as string | undefined;
  if (!url) { res.status(400).json({ error: "url query parameter is required" }); return; }
  try { new URL(url); } catch { res.status(400).json({ error: "invalid URL" }); return; }

  console.log(`Extracting: ${url}`);
  try {
    const result = await extractJobDetails(url);
    console.log(`Result:`, JSON.stringify(result));
    res.json(result);
  } catch (err) {
    console.error("Extraction error:", err);
    res.status(500).json({ error: "Failed to extract job details" });
  }
});

// --- Resume analysis ---

app.post("/api/analyze", async (req, res) => {
  const { jobId } = req.body;
  if (!jobId) { res.status(400).json({ error: "jobId is required" }); return; }

  const jobs = readJobs();
  const job = jobs.find((j) => j.id === jobId);
  if (!job) { res.status(404).json({ error: "job not found" }); return; }

  if (!fs.existsSync(resumeFile)) {
    res.status(400).json({ error: "resumes/master-resume.md not found" });
    return;
  }

  const resume = fs.readFileSync(resumeFile, "utf-8");
  let description = "";
  if (job.jobLink) {
    try {
      description = await scrapeJobDescription(job.jobLink);
    } catch {
      description = "(Could not fetch job description)";
    }
  }

  console.log(`Analyzing resume for: ${job.company} - ${job.title}`);
  try {
    const analysis = await analyzeResume(resume, {
      company: job.company,
      title: job.title,
      location: job.location,
      description,
    });
    writeReview(jobId, analysis);
    job.hasAiReview = true;
    writeJobs(jobs);
    consolidateGaps().catch(err => console.error("Gap consolidation error:", err));
    res.json({ analysis, reviewedAt: new Date().toISOString() });
  } catch (err) {
    console.error("Analysis error:", err);
    res.status(500).json({ error: "Failed to analyze resume" });
  }
});

// --- Reviews ---

app.get("/api/reviews/:id", (req, res) => {
  const reviews = readReviews();
  const entry = reviews[req.params.id];
  if (!entry) { res.status(404).json({ error: "review not found" }); return; }
  res.json({ review: entry.text, reviewedAt: entry.reviewedAt });
});

// --- Guidelines ---

function guidelineTitleFromContent(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return filename.replace(/\.md$/, "").replace(/[-_]/g, " ");
}

function guidelineSlugFromFilename(filename: string): string {
  return filename.replace(/\.md$/, "");
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const guidelinesConfigFile = path.join(guidelinesDir, "config.json");

function readGuidelinesConfig(): { enabled: string[] } | null {
  if (!fs.existsSync(guidelinesConfigFile)) return null;
  try { return JSON.parse(fs.readFileSync(guidelinesConfigFile, "utf-8")); } catch { return null; }
}

app.get("/api/guidelines", (_req, res) => {
  if (!fs.existsSync(guidelinesDir)) { res.json([]); return; }
  const files = fs.readdirSync(guidelinesDir).filter(f => f.endsWith(".md")).sort();
  const config = readGuidelinesConfig();
  const guidelines = files.map(f => {
    const content = fs.readFileSync(path.join(guidelinesDir, f), "utf-8");
    const slug = guidelineSlugFromFilename(f);
    const enabled = config ? config.enabled.includes(slug) : true;
    return { slug, title: guidelineTitleFromContent(content, f), enabled };
  });
  res.json(guidelines);
});

app.put("/api/guidelines/config", (req, res) => {
  const { enabled } = req.body;
  if (!Array.isArray(enabled)) { res.status(400).json({ error: "enabled must be an array of slugs" }); return; }
  fs.mkdirSync(guidelinesDir, { recursive: true });
  fs.writeFileSync(guidelinesConfigFile, JSON.stringify({ enabled }, null, 2) + "\n");
  res.json({ enabled });
});

app.get("/api/guidelines/:slug", (req, res) => {
  const filePath = path.join(guidelinesDir, `${req.params.slug}.md`);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "guidelines not found" }); return; }
  const content = fs.readFileSync(filePath, "utf-8");
  const title = guidelineTitleFromContent(content, `${req.params.slug}.md`);
  res.json({ title, content });
});

app.post("/api/guidelines", (req, res) => {
  const { title, content } = req.body;
  if (!title) { res.status(400).json({ error: "title is required" }); return; }
  const slug = slugify(title);
  if (!slug) { res.status(400).json({ error: "invalid title" }); return; }
  const filePath = path.join(guidelinesDir, `${slug}.md`);
  if (fs.existsSync(filePath)) { res.status(409).json({ error: "guideline already exists" }); return; }
  fs.mkdirSync(guidelinesDir, { recursive: true });
  const md = `# ${title}\n\n${content ?? ""}`;
  fs.writeFileSync(filePath, md + "\n");
  res.status(201).json({ slug });
});

app.delete("/api/guidelines/:slug", (req, res) => {
  const filePath = path.join(guidelinesDir, `${req.params.slug}.md`);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "guidelines not found" }); return; }
  fs.unlinkSync(filePath);
  res.status(204).end();
});

app.post("/api/guidelines/generate", async (req, res) => {
  const { prompt: userPrompt } = req.body;
  if (!userPrompt || typeof userPrompt !== "string" || !userPrompt.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  try {
    const content = await runClaude(`You are an expert resume writing coach. Generate a resume writing guideline based on the following request:

${userPrompt.trim()}

## Instructions
1. Write a practical, actionable guideline that helps someone write better resumes.
2. Use markdown formatting with clear sections and bullet points.
3. Include specific examples and before/after comparisons where helpful.
4. Keep the tone professional but approachable.
5. Do NOT include a top-level heading — the title is handled separately.
6. Output ONLY the guideline content — no preamble or commentary.`);
    res.json({ content });
  } catch (err) {
    console.error("Guideline generation error:", err);
    res.status(500).json({ error: "Failed to generate guideline" });
  }
});

// --- Master Resume ---

app.get("/api/master-resume", (_req, res) => {
  if (!fs.existsSync(resumeFile)) { res.json({ content: "" }); return; }
  const content = fs.readFileSync(resumeFile, "utf-8");
  res.json({ content });
});

app.post("/api/master-resume", async (req, res) => {
  const { content, filename } = req.body;
  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  try {
    let md: string;
    if (typeof filename === "string" && filename.endsWith(".md")) {
      md = content;
    } else {
      md = await runClaude(`Convert the following resume content to clean, well-structured markdown. Preserve all information exactly — do not add, remove, or rephrase anything. Just format it as proper markdown with appropriate headings, bullet points, and sections.

${content}

Output ONLY the markdown — no explanations or commentary.`);
    }

    fs.mkdirSync(path.dirname(resumeFile), { recursive: true });
    fs.writeFileSync(resumeFile, md + "\n");
    res.json({ content: md });
  } catch (err) {
    console.error("Master resume upload error:", err);
    res.status(500).json({ error: "Failed to process resume" });
  }
});

// --- Resume Gaps ---

app.get("/api/gaps", (_req, res) => {
  if (!fs.existsSync(gapFile)) { res.json({ content: "" }); return; }
  const content = fs.readFileSync(gapFile, "utf-8");
  res.json({ content });
});

// --- Resume Generation ---

function readEnabledGuidelines(): string {
  if (!fs.existsSync(guidelinesDir)) return "";
  const config = readGuidelinesConfig();
  return fs.readdirSync(guidelinesDir)
    .filter(f => f.endsWith(".md"))
    .filter(f => config ? config.enabled.includes(guidelineSlugFromFilename(f)) : true)
    .map(f => fs.readFileSync(path.join(guidelinesDir, f), "utf-8"))
    .join("\n\n---\n\n");
}

app.post("/api/generate-resume", async (req, res) => {
  const { jobId, feedback } = req.body;
  if (!jobId) { res.status(400).json({ error: "jobId is required" }); return; }

  const jobs = readJobs();
  const job = jobs.find((j) => j.id === jobId);
  if (!job) { res.status(404).json({ error: "job not found" }); return; }

  const masterResume = fs.existsSync(resumeFile) ? fs.readFileSync(resumeFile, "utf-8") : "";
  const guidelines = readEnabledGuidelines();
  const reviews = readReviews();
  const aiReview = reviews[jobId]?.text ?? "";

  let description = "";
  if (job.jobLink) {
    try {
      description = await scrapeJobDescription(job.jobLink);
    } catch {
      description = "(Could not fetch job description)";
    }
  }

  console.log(`Generating resume for: ${job.company} - ${job.title}`);
  try {
    const content = await generateResumeContent({
      company: job.company,
      title: job.title,
      location: job.location,
      description,
      masterResume,
      guidelines,
      aiReview,
      feedback: feedback ?? "",
    });
    const filename = generateResumeFilename(job.company, job.title, resumesDir);
    fs.mkdirSync(resumesDir, { recursive: true });
    fs.writeFileSync(path.join(resumesDir, filename), content + "\n");
    res.json({ filename, content });
  } catch (err) {
    console.error("Resume generation error:", err);
    res.status(500).json({ error: "Failed to generate resume" });
  }
});

app.get("/api/generated-resumes/:jobId", (req, res) => {
  const jobs = readJobs();
  const job = jobs.find((j) => j.id === req.params.jobId);
  if (!job) { res.status(404).json({ error: "job not found" }); return; }

  const resumes = findResumesForJob(job.company, job.title, resumesDir);

  res.json({ resumes });
});

app.get("/api/generated-resumes/:jobId/:filename", (req, res) => {
  const filePath = path.join(resumesDir, req.params.filename);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "file not found" }); return; }
  const content = fs.readFileSync(filePath, "utf-8");
  res.json({ content });
});

// --- Static files ---

app.use(express.static(distDir));

app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`PATS server running on http://localhost:${PORT}`);
  console.log(`Data directory: ${dataDir}`);
});
