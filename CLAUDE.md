# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Follow the behavioral guidelines in [Behavioral-Guidelines.md](./Behavioral-Guidelines.md) — think before coding, keep changes surgical, simplify aggressively, and verify against explicit success criteria.

## Project

PATS (Personal Application Tracking System) — a job application tracker with an Express backend and vanilla TypeScript frontend. See `README.md` for features, setup, and data model.

### Prerequisites

- Node.js 22+
- **One of**: `claude` CLI (handles its own auth) **or** `ANTHROPIC_API_KEY` env var (for SDK fallback)
- Chromium/Chrome — Puppeteer uses it for page rendering during job extraction

## Commands

```bash
npm run dev              # Start Vite + Express dev servers (frontend :5173, API :3001)
npm run dev:client       # Start Vite frontend only (:5173)
npm run dev:server       # Start Express backend only (:3001)
npm run build            # Type-check + build frontend (dist/) + compile server (dist-server/)
npm start                # Run production server (:3000, serves static + API)
npx tsc -p tsconfig.json --noEmit        # Type-check frontend only
npx tsc -p server/tsconfig.json --noEmit # Type-check server only
```

No test framework, linter, or formatter is configured.

## Architecture

Vanilla TypeScript frontend (no frameworks) bundled by Vite. Express 5 backend using Puppeteer for page rendering and AI (via `claude` CLI or Anthropic SDK) for resume features. Data stored as JSON files and markdown on disk (no database). Vite proxies `/api` to Express (:3001) in dev; in production Express serves both API and static files from port 3000. Both tsconfigs use strict mode with `noUnusedLocals` and `noUnusedParameters`. Server imports use `.js` extensions in `import` statements (e.g., `from "./claude.js"`) even though source files are `.ts` — this is required for ESM compatibility.

### AI backend (`server/claude.ts`)

`runClaude(prompt): Promise<string>` is the single entry point for all AI features. On first call it auto-detects which backend to use:
1. If `claude` CLI is on PATH → uses CLI (`claude -p` with 180s timeout)
2. If CLI not found but `ANTHROPIC_API_KEY` is set → uses `@anthropic-ai/sdk` (Sonnet, 8192 max tokens)
3. If neither → throws with setup instructions

All callers (`job-analyzer.ts`, `resume-generator.ts`, `referral-blurb.ts`, `cover-letter.ts`, endpoint handlers) go through `runClaude()`.

### Frontend (`src/`)

- `main.ts` — Entry point, hash-based routing (`#/` → home, `#/add` → add role, `#/edit/:id` → role details, `#/master-resume` → master resume, `#/gaps` → resume gaps, `#/companies` → companies list, `#/guidelines` → guidelines list, `#/guidelines/new` → create guideline, `#/guidelines/:slug` → view guideline). Renders the nav bar on every route change.
- `types.ts` — Canonical `JobApplication` interface (duplicated in `server/index.ts` — keep both in sync when changing fields).
- `store.ts` — Async CRUD via `fetch` to `/api/jobs` endpoints. All functions return Promises.
- `pages/add-role.ts` — Add/edit form ("Role Details" in edit mode). URL paste → client-side parse → debounced server extraction. Company field has autocomplete dropdown from the companies list (`/api/companies`) — if a typed company isn't in the list, it's auto-added via AI lookup on form submit. Contains five collapsible sections in edit mode (see Role Details sections below).
- `pages/master-resume.ts` — View master resume (rendered markdown) or upload a new one (file upload → AI conversion to markdown if not `.md`).
- `pages/guideline-editor.ts` — Form to create new guidelines (auto-slugifies title). Includes AI prompt field to auto-generate guideline content.
- `pages/guidelines-list.ts` — Guidelines index page with enable/disable checkboxes (enabled guidelines are injected into resume generation prompts).
- `pages/guidelines.ts` — Single guideline viewer with delete option.
- `pages/companies.ts` — Companies directory table with sortable columns (rank, company, sector, type, roles). Add/edit company modals. Shows job count per company. Company names link to careers URLs.
- `components/nav.ts` — Left sidebar nav. Static items (Job Applications, Master Resume, Resume Gaps, Companies) + dynamic Guidelines section fetched from API.
- `components/resume-viewer.ts` — Slide-in overlay pane for viewing generated resumes/blurbs/cover letters, with Export PDF (triggers `window.print()` with print-optimized CSS).
- `pages/analysis-modal.ts` — Modal overlay for displaying AI resume review results, with optional re-analyze callback.
- `pages/home.ts` — Home timeline listing all jobs with sortable columns (Added, Company, Title, Location, Posted, Applied). Default sort: Added date descending. Title column links to job posting. Applied column has checkbox to mark as applied today.
- `pages/gaps.ts` — Renders consolidated resume gaps from `/api/gaps` as markdown.
- `utils/dom.ts` — `el()` helper for type-safe DOM element creation.
- `utils/markdown.ts` — Shared `renderMarkdown()` used by multiple pages and components.
- `utils/url-parser.ts` — Client-side URL pattern parser (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, LinkedIn, Indeed).
- `styles/main.css` — Glass-inspired theme with CSS custom properties. Includes `@media print` rules for resume PDF export.

### Role Details page sections (`pages/add-role.ts`)

The edit-mode page has five collapsible `<details>` sections below the main form, all following the same pattern (spinner + action button in header, content in body):

1. **AI Resume Review** — Analyze resume against job posting. Saves to `reviews.json`.
2. **Resume for Role** — Generate tailored resume with feedback textarea. Versioned files in `data/resumes/`, past versions in table, side-pane viewer.
3. **Referral** — Referrer name/LinkedIn/relation/context fields (two-per-row grid). "Generate Blurb" saves referral fields first, then generates a 3-paragraph referral blurb with referrer details appended at the bottom. Filename includes referrer name. Versioned files in `data/referral-blurbs/`, past versions in table, side-pane viewer.
4. **Cover Letter** — Notes textarea for additional context. "Generate" button creates a 3-paragraph cover letter. Versioned files in `data/cover-letters/`, past versions in table, side-pane viewer.
5. **Custom Questions** — Add questions via text input, each renders as a card with editable answer textarea, per-question "Generate" (AI), "Save", and "Delete" buttons. Persisted to `data/jobs/custom-questions.json`.

### Backend (`server/`)

- `index.ts` — Express app with all routes:
  - `GET/POST/PUT/DELETE /api/jobs` — CRUD backed by `data/jobs/jobs.json`. POST/PUT use `pickJobFields()` to allowlist fields (update `JOB_FIELDS` array when adding fields).
  - `GET /api/extract?url=...` — Extract job details from a URL via Puppeteer.
  - `POST /api/analyze` — AI resume analysis. Saves review to `reviews.json`, consolidates gaps via AI into categorized `resume-gap.md`, sets `hasAiReview` flag.
  - `POST /api/generate-resume` — Generate tailored resume. Saves versioned `.md` to `data/resumes/`.
  - `GET /api/generated-resumes/:jobId[/:filename]` — List or view generated resumes for a job.
  - `POST /api/generate-referral-blurb` — Generate referral blurb using job context + referral fields. Saves versioned `.md` to `data/referral-blurbs/`.
  - `GET /api/referral-blurbs/:jobId[/:filename]` — List or view referral blurbs for a job.
  - `POST /api/generate-cover-letter` — Generate cover letter (accepts optional `notes`). Saves versioned `.md` to `data/cover-letters/`.
  - `GET /api/cover-letters/:jobId[/:filename]` — List or view cover letters for a job.
  - `GET/POST/PUT/DELETE /api/custom-questions/:jobId[/:questionId]` — Custom Q&A CRUD. Stored in `data/jobs/custom-questions.json`.
  - `POST /api/custom-questions/:jobId/:questionId/generate` — AI-generate answer for a custom question.
  - `GET/POST /api/companies` — Companies list CRUD backed by `data/companies/all-companies.json`.
  - `PUT /api/companies/:rank` — Update a company by rank.
  - `POST /api/companies/lookup` — AI-powered company lookup: given a name, uses `runClaude()` to detect sector, type, and careers URL, then adds to the list.
  - `GET/POST/PUT/DELETE /api/guidelines[/:slug]` — Guidelines CRUD with enable/disable config.
  - `POST /api/guidelines/generate` — AI-generate guideline content from a user prompt.
  - `GET/POST /api/master-resume` — View or upload master resume (POST converts non-`.md` files to markdown via AI).
  - `GET /api/gaps` — Serve consolidated resume gaps.
- `claude.ts` — Shared `runClaude()` with CLI/SDK auto-detection (see AI backend section above).
- `extractor.ts` — Renders pages with Puppeteer, extracts job details via Cheerio. Priority: JSON-LD → DOM selectors → OG/meta tags → h1 fallback → URL pattern fallback.
- `scraper.ts` — Puppeteer-based job description scraper (returns plain text, capped at 5000 chars). Reuses a shared browser instance.
- `job-analyzer.ts` — Builds the resume analysis prompt and calls `runClaude()`.
- `resume-generator.ts` — Builds generation prompt (master resume + enabled guidelines + AI review + job description + user feedback) and handles versioned filename generation (`{yyyymmdd}-{company}-{abbrev}-VishalM-resume-v{N}.md`).
- `referral-blurb.ts` — Builds referral blurb prompt (referrer info + job context + resume) and handles versioned filename/find functions.
- `cover-letter.ts` — Builds cover letter prompt (job context + resume + referrer info + notes) and handles versioned filename/find functions.

### Data flow

1. User pastes URL → client-side `parseJobUrl()` fills form instantly → server `/api/extract` overwrites with richer data from rendered HTML
2. Form submit → `POST /api/jobs` → written to `data/jobs/jobs.json`
3. AI analyze → server reads `data/resumes/master-resume.md` + scrapes job page → `runClaude()` → review saved to `data/jobs/reviews.json` (with timestamp) → `consolidateGaps()` reads ALL reviews, extracts gaps, uses AI to deduplicate and categorize them, overwrites `data/resumes/resume-gap.md`
4. Resume generation → server reads master resume + all enabled guidelines + AI review + job description + user feedback → `runClaude()` → saved as versioned `.md` in `data/resumes/`, displayed in slide-in viewer
5. Referral blurb → server reads job + referral fields + master resume + AI review + scraped description → `runClaude()` → saved as versioned `.md` in `data/referral-blurbs/`
6. Cover letter → same context as blurb + user notes → `runClaude()` → saved as versioned `.md` in `data/cover-letters/`
7. Custom questions → per-question AI generation using job context + resume → answer saved to `data/jobs/custom-questions.json`

### Adding a new field to JobApplication

Three places must be updated:
1. `src/types.ts` — the frontend interface
2. `server/index.ts` — the server interface AND the `JOB_FIELDS` array
3. `server/index.ts` — the `POST /api/jobs` handler defaults

Note: `addedDate` is auto-set server-side on job creation (not user-editable). It's displayed read-only on the edit page and as a sortable column on the home page.

### Adding a new page

1. Create `src/pages/{name}.ts` exporting an async `render{Name}(container: HTMLElement)` function
2. Add route in `src/main.ts` (hash-based, order matters — more specific routes before general ones)
3. Add nav item in `src/components/nav.ts` (`STATIC_ITEMS` array for top-level, or dynamic section)

### Adding a new AI generation feature

Follow the pattern established by referral blurb / cover letter:
1. Create `server/{feature}.ts` with prompt builder, filename generator, and find function
2. Add generate/list/view endpoints in `server/index.ts` (import with `.js` extension)
3. Add data directory constant and `mkdirSync` in `initDataDir()`
4. Add collapsible section in `src/pages/add-role.ts` with spinner + button in header, content + past versions table in body, using `showResumeViewer()` for the side-pane display

### Guidelines system

Guidelines are markdown files in `data/guidelines/`. A `config.json` file tracks which are enabled. Enabled guidelines are read by `readEnabledGuidelines()` in `server/index.ts` and injected into the resume generation prompt. The frontend guidelines list page (`src/pages/guidelines-list.ts`) lets users toggle guidelines on/off and create new ones. The guideline editor supports AI-generated content from a user prompt.

### Data notes

Contents of `data/jobs/`, `data/resumes/`, `data/referral-blurbs/`, `data/cover-letters/`, and `data/companies/` are gitignored (only `.gitkeep` files are tracked). The `data/` directory is mounted as a Docker volume in production. The `PATS_DATA_DIR` env var overrides the data path (defaults to `./data` relative to project root). The server auto-initializes the data directory on startup (creates folders, seeds empty JSON files, copies bundled guidelines).

### Important: stale `.js` files in `src/`

Do NOT leave compiled `.js` files in `src/`. Vite may resolve bare imports (e.g., `"./pages/add-role"`) to `.js` instead of `.ts`, serving stale code. If the frontend behaves unexpectedly after changes, check for and delete any `.js` files in `src/`.
