# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PATS (Personal Application Tracking System) — a job application tracker with an Express backend and vanilla TypeScript frontend. See `README.md` for features, setup, and data model.

## Commands

```bash
npm run dev              # Start Vite + Express dev servers (frontend :5173, API :3001)
npm run dev:client       # Start Vite frontend only (:5173)
npm run dev:server       # Start Express backend only (:3001)
npm run build            # Type-check + build frontend (dist/) + compile server (dist-server/)
npx tsc -p tsconfig.json --noEmit        # Type-check frontend only
npx tsc -p server/tsconfig.json --noEmit # Type-check server only
```

No test framework is configured. There are no tests.

## Architecture

Vanilla TypeScript frontend (no frameworks) bundled by Vite. Express 5 backend using Puppeteer for page rendering and AI (via `claude` CLI or Anthropic SDK) for resume features. Data stored as JSON files and markdown on disk (no database). Vite proxies `/api` to Express (:3001) in dev; in production Express serves both API and static files from port 3000.

### AI backend (`server/claude.ts`)

`runClaude(prompt): Promise<string>` is the single entry point for all AI features. On first call it auto-detects which backend to use:
1. If `claude` CLI is on PATH → uses CLI (`claude -p` with 180s timeout)
2. If CLI not found but `ANTHROPIC_API_KEY` is set → uses `@anthropic-ai/sdk` (Sonnet, 8192 max tokens)
3. If neither → throws with setup instructions

All callers (`job-analyzer.ts`, `resume-generator.ts`, endpoint handlers) go through `runClaude()`.

### Frontend (`src/`)

- `main.ts` — Entry point, hash-based routing (`#/` → home, `#/add` → add role, `#/edit/:id` → role details, `#/master-resume` → master resume, `#/gaps` → resume gaps, `#/guidelines` → guidelines list, `#/guidelines/new` → create guideline, `#/guidelines/:slug` → view guideline). Renders the nav bar on every route change.
- `types.ts` — Canonical `JobApplication` interface (duplicated in `server/index.ts` — keep both in sync when changing fields).
- `store.ts` — Async CRUD via `fetch` to `/api/jobs` endpoints. All functions return Promises.
- `pages/add-role.ts` — Add/edit form ("Role Details" in edit mode). URL paste → client-side parse → debounced server extraction. Includes collapsible AI Resume Review and Resume for Role sections.
- `pages/master-resume.ts` — View master resume (rendered markdown) or upload a new one (file upload → AI conversion to markdown if not `.md`).
- `pages/guideline-editor.ts` — Form to create new guidelines (auto-slugifies title). Includes AI prompt field to auto-generate guideline content.
- `pages/guidelines-list.ts` — Guidelines index page with enable/disable checkboxes (enabled guidelines are injected into resume generation prompts).
- `pages/guidelines.ts` — Single guideline viewer with delete option.
- `components/nav.ts` — Left sidebar nav. Static items (Job Applications, Master Resume, Resume Gaps) + dynamic Guidelines section fetched from API.
- `utils/dom.ts` — `el()` helper for type-safe DOM element creation.
- `utils/markdown.ts` — Shared `renderMarkdown()` used by multiple pages and components.
- `utils/url-parser.ts` — Client-side URL pattern parser (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, LinkedIn, Indeed).
- `styles/main.css` — Glass-inspired theme with CSS custom properties. Includes `@media print` rules for resume PDF export.

### Backend (`server/`)

- `index.ts` — Express app with all routes:
  - `GET/POST/PUT/DELETE /api/jobs` — CRUD backed by `data/jobs/jobs.json`. POST/PUT use `pickJobFields()` to allowlist fields (update `JOB_FIELDS` array when adding fields).
  - `GET /api/extract?url=...` — Extract job details from a URL via Puppeteer.
  - `POST /api/analyze` — AI resume analysis. Saves review to `reviews.json`, consolidates gaps via AI into categorized `resume-gap.md`, sets `hasAiReview` flag.
  - `POST /api/generate-resume` — Generate tailored resume using all context. Saves versioned `.md` to `data/resumes/`.
  - `GET/POST/PUT/DELETE /api/guidelines[/:slug]` — Guidelines CRUD with enable/disable config.
  - `POST /api/guidelines/generate` — AI-generate guideline content from a user prompt.
  - `GET/POST /api/master-resume` — View or upload master resume (POST converts non-`.md` files to markdown via AI).
  - `GET /api/gaps` — Serve consolidated resume gaps.
- `claude.ts` — Shared `runClaude()` with CLI/SDK auto-detection (see AI backend section above).
- `extractor.ts` — Renders pages with Puppeteer, extracts job details via Cheerio. Priority: JSON-LD → DOM selectors → OG/meta tags → h1 fallback → URL pattern fallback.
- `scraper.ts` — Puppeteer-based job description scraper (returns plain text, capped at 5000 chars). Reuses a shared browser instance.
- `job-analyzer.ts` — Builds the resume analysis prompt and calls `runClaude()`.
- `resume-generator.ts` — Builds generation prompt (master resume + enabled guidelines + AI review + job description + user feedback) and handles versioned filename generation (`{yyyymmdd}-{company}-{abbrev}-VishalM-resume-v{N}.md`).

### Data flow

1. User pastes URL → client-side `parseJobUrl()` fills form instantly → server `/api/extract` overwrites with richer data from rendered HTML
2. Form submit → `POST /api/jobs` → written to `data/jobs/jobs.json`
3. AI analyze → server reads `data/resumes/master-resume.md` + scrapes job page → `runClaude()` → review saved to `data/jobs/reviews.json` (with timestamp) → `consolidateGaps()` reads ALL reviews, extracts gaps, uses AI to deduplicate and categorize them, overwrites `data/resumes/resume-gap.md`
4. Resume generation → server reads master resume + all enabled guidelines + AI review + job description + user feedback → `runClaude()` → saved as versioned `.md` in `data/resumes/`, displayed in slide-in viewer

### Adding a new field to JobApplication

Three places must be updated:
1. `src/types.ts` — the frontend interface
2. `server/index.ts` — the server interface AND the `JOB_FIELDS` array
3. `server/index.ts` — the `POST /api/jobs` handler defaults

### Adding a new page

1. Create `src/pages/{name}.ts` exporting an async `render{Name}(container: HTMLElement)` function
2. Add route in `src/main.ts` (hash-based, order matters — more specific routes before general ones)
3. Add nav item in `src/components/nav.ts` (`STATIC_ITEMS` array for top-level, or dynamic section)

### Guidelines system

Guidelines are markdown files in `data/guidelines/`. A `config.json` file tracks which are enabled. Enabled guidelines are read by `readEnabledGuidelines()` in `server/index.ts` and injected into the resume generation prompt. The frontend guidelines list page (`src/pages/guidelines-list.ts`) lets users toggle guidelines on/off and create new ones. The guideline editor supports AI-generated content from a user prompt.

### Data notes

Contents of `data/jobs/` and `data/resumes/` are gitignored (only `.gitkeep` files are tracked). The `data/` directory is mounted as a Docker volume in production. The `PATS_DATA_DIR` env var overrides the data path (defaults to `./data` relative to project root). The server auto-initializes the data directory on startup (creates folders, seeds empty JSON files, copies bundled guidelines).

### Prerequisites

- Node.js 22+
- **One of**: `claude` CLI (handles its own auth) **or** `ANTHROPIC_API_KEY` env var (for SDK fallback)
- Chromium/Chrome — Puppeteer uses it for page rendering during job extraction
