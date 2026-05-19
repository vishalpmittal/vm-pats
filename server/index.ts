import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { extractJobDetails } from "./extractor.js";
import { scrapeJobDescription } from "./scraper.js";
import { analyzeResume } from "./job-analyzer.js";
import { generateResumeContent, generateResumeFilename, findResumesForJob } from "./resume-generator.js";

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
const dataFile = path.join(__dirname, "..", "data", "jobs", "jobs.json");
const reviewsFile = path.join(__dirname, "..", "data", "jobs", "reviews.json");
const resumeFile = path.join(__dirname, "..", "data", "resumes", "master-resume.md");
const gapFile = path.join(__dirname, "..", "data", "resumes", "resume-gap.md");
const resumesDir = path.join(__dirname, "..", "data", "resumes");
const guidelinesDir = path.join(__dirname, "..", "data", "guidelines");

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

function appendGaps(company: string, title: string, analysis: string): void {
  try {
    const gapMatch = analysis.match(/##\s*\d+\.\s*Key Gaps\s*\n([\s\S]*?)(?=\n##\s*\d+\.|$)/i);
    if (!gapMatch) return;
    const gaps = gapMatch[1].trim();
    if (!gaps) return;
    const date = new Date().toISOString().slice(0, 10);
    const entry = `\n## ${company} — ${title}\nDate: ${date}\n\n${gaps}\n\n---\n`;
    fs.appendFileSync(gapFile, entry);
  } catch {
    // best-effort
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
    appendGaps(job.company, job.title, analysis);
    job.hasAiReview = true;
    writeJobs(jobs);
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

const guidelinesMap: Record<string, string> = {
  director: "build-guideline-director-of-eng.md",
  "senior-manager": "build-guideline-senior-manager.md",
  "ai-transformation": "build-guideline-ai-transformation.md",
};

app.get("/api/guidelines/:level", (req, res) => {
  const filename = guidelinesMap[req.params.level];
  if (!filename) { res.status(404).json({ error: "unknown level" }); return; }
  const filePath = path.join(guidelinesDir, filename);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "guidelines not found" }); return; }
  const content = fs.readFileSync(filePath, "utf-8");
  res.json({ content });
});

// --- Resume Gaps ---

app.get("/api/gaps", (_req, res) => {
  if (!fs.existsSync(gapFile)) { res.json({ content: "" }); return; }
  const content = fs.readFileSync(gapFile, "utf-8");
  res.json({ content });
});

// --- Resume Generation ---

function readAllGuidelines(): string {
  if (!fs.existsSync(guidelinesDir)) return "";
  return fs.readdirSync(guidelinesDir)
    .filter(f => f.endsWith(".md"))
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
  const guidelines = readAllGuidelines();
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
});
