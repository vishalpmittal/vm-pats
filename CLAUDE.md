# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PATS (Personal Application Tracking System) — a job application tracker with an Express backend and vanilla TypeScript frontend. See `PRD.md` for full requirements and `ux/glass-ux-design.png` for the UI design reference.

## Tech Stack

- **Frontend**: Vanilla TypeScript + DOM APIs (no frameworks), bundled by Vite
- **Backend**: Express 5, Puppeteer (headless Chrome for page rendering), cheerio (HTML parsing)
- **Data**: JSON files on disk (`data/jobs/jobs.json`, `data/jobs/reviews.json`), markdown files in `data/resumes/` and `data/guidelines/`
- **AI**: Calls `claude` CLI for resume analysis and resume generation (no API key needed)
- **Dev tooling**: Vite (frontend dev + proxy), tsx (server watch), concurrently
- **Deployment**: Docker with multi-stage build

## Commands

```bash
npm run dev              # Start Vite + Express dev servers (frontend :5173, API :3001)
npm run dev:client       # Start Vite frontend only (:5173)
npm run dev:server       # Start Express backend only (:3001)
npm run build            # Type-check + build frontend (dist/) + compile server (dist-server/)
npm start                # Run production server (serves built frontend + API)
npx tsc -p tsconfig.json --noEmit        # Type-check frontend only
npx tsc -p server/tsconfig.json --noEmit # Type-check server only
docker compose up --build                # Build and run in Docker (port 3000)
```

No test framework is configured. There are no tests.

## Architecture

### Frontend (`src/`)

- `main.ts` — Entry point, hash-based routing (`#/` → home, `#/add` → add role, `#/edit/:id` → role details, `#/guidelines/:level` → guidelines, `#/gaps` → resume gaps). Renders the nav bar on every route change.
- `types.ts` — Canonical `JobApplication` interface (duplicated in `server/index.ts` — keep both in sync when changing fields)
- `store.ts` — Async CRUD via `fetch` to `/api/jobs` endpoints. All functions return Promises.
- `components/nav.ts` — Collapsible left sidebar navigation. Nav items defined in `NAV_ITEMS` array. Section label "Guidelines" with sub-items. Collapse state toggled via `nav-collapsed` CSS class on `#layout`.
- `components/resume-viewer.ts` — Slide-in side pane from right for viewing generated resumes. Has close (×) button, Export PDF (via `window.print()` with `@media print` rules), and scrollable markdown body.
- `pages/home.ts` — Job list view. Rows are clickable (navigate to Role Details). No inline action buttons — all actions live on the Role Details page.
- `pages/add-role.ts` — Add/edit form ("Role Details" in edit mode). Features:
  - URL paste → client-side parse → debounced server extraction
  - Past applications at same company with duplicate highlighting
  - Collapsible "AI Resume Review" section with inline review display, spinner, timestamp, and "Review" button
  - Collapsible "Resume for Role" section with feedback textarea, "Generate" button, spinner, and versioned resume table
  - Delete button (bottom left, glass style)
- `pages/analysis-modal.ts` — Modal overlay for AI analysis results (used in other contexts)
- `pages/guidelines.ts` — Fetches and renders markdown guidelines from `/api/guidelines/:level`
- `pages/gaps.ts` — Fetches and renders aggregated resume gaps from `/api/gaps`
- `utils/markdown.ts` — Shared `renderMarkdown()` — handles headings, bold/italic, lists, tables, blockquotes, code, horizontal rules. Used by modal, guidelines, gaps, resume viewer, and inline review.
- `utils/url-parser.ts` — Client-side URL pattern parser (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, LinkedIn, Indeed)
- `utils/dom.ts` — `el()` helper for creating typed DOM elements
- `styles/main.css` — Glass-inspired theme with CSS custom properties. Layout: `#layout` (flex) with `#nav` (220px collapsible sidebar) and `#app` (main content). Includes `@media print` rules for resume PDF export.

### Backend (`server/`)

- `claude.ts` — Shared `runClaude()` utility that shells out to `claude -p` CLI. Used by both `job-analyzer.ts` and `resume-generator.ts`.
- `index.ts` — Express app with routes:
  - `GET/POST/PUT/DELETE /api/jobs` — CRUD backed by `data/jobs/jobs.json`. POST/PUT use `pickJobFields()` to allowlist fields from `req.body` (update `JOB_FIELDS` when adding new fields to `JobApplication`).
  - `GET /api/extract?url=...` — Extract job details from a URL
  - `POST /api/analyze` — AI resume analysis. Writes review with timestamp to `data/jobs/reviews.json`, extracts "Key Gaps" and appends to `data/resumes/resume-gap.md`, sets `hasAiReview` flag on the job. Returns `{ analysis, reviewedAt }`.
  - `GET /api/reviews/:id` — Fetch a stored AI review by job ID. Returns `{ review, reviewedAt }`.
  - `GET /api/guidelines/:level` — Serve markdown guidelines (`director`, `senior-manager`, or `ai-transformation`) from `data/guidelines/`
  - `GET /api/gaps` — Serve aggregated resume gaps from `data/resumes/resume-gap.md`
  - `POST /api/generate-resume` — Generate a tailored resume using all context (master resume, guidelines, AI review, job description, user feedback). Saves to `data/resumes/` with versioned filename.
  - `GET /api/generated-resumes/:jobId` — List generated resumes for a job (version, timestamp, filename)
  - `GET /api/generated-resumes/:jobId/:filename` — Serve a specific generated resume
- `extractor.ts` — Renders pages with Puppeteer, then extracts job details. Priority: JSON-LD (`schema.org/JobPosting`) → rendered DOM selectors → Open Graph/meta tags → h1-adjacent element fallback → URL pattern fallback.
- `scraper.ts` — Extracts job description text from rendered pages via Puppeteer
- `job-analyzer.ts` — Builds analysis prompt and calls `runClaude()` for resume-vs-job analysis
- `resume-generator.ts` — Builds generation prompt (includes master resume, all guidelines, AI review, job details, user feedback) and calls `runClaude()`. Handles versioned filename generation (`{yyyymmdd}-{company}-{abbrev}-VishalM-resume-v{N}.md`) and listing existing resumes for a job.

### Data flow

1. User pastes URL → client-side `parseJobUrl()` fills form instantly → server `/api/extract` overwrites with richer data from rendered HTML
2. Form submit → `POST /api/jobs` → written to `data/jobs/jobs.json`
3. AI analyze → server reads `data/resumes/master-resume.md` + scrapes job page → pipes to `claude` CLI → review saved to `data/jobs/reviews.json` (with timestamp), gaps appended to `data/resumes/resume-gap.md`, result displayed inline in collapsible section
4. Resume generation → server reads master resume + all guidelines + AI review + job description + user feedback → pipes to `claude` CLI → saved as versioned `.md` in `data/resumes/`, displayed in slide-in viewer

### Adding a new field to JobApplication

Three places must be updated:
1. `src/types.ts` — the frontend interface
2. `server/index.ts` — the server interface AND the `JOB_FIELDS` array
3. `server/index.ts` — the `POST /api/jobs` handler defaults

### Dev proxy

Vite proxies `/api` requests to Express (port 3001) during development. In production, Express serves both the API and the built static files.

### Data directory structure

```
data/
├── jobs/
│   ├── jobs.json          — Job application records
│   └── reviews.json       — AI reviews keyed by job ID ({ text, reviewedAt })
├── resumes/
│   ├── master-resume.md   — Source resume for AI analysis and generation
│   ├── resume-gap.md      — Aggregated gaps from all AI reviews
│   └── *.md               — Generated tailored resumes (versioned per role)
└── guidelines/
    ├── build-guideline-director-of-eng.md
    ├── build-guideline-senior-manager.md
    └── build-guideline-ai-transformation.md
```

### Key files outside `src/`, `server/`, and `data/`

- `Dockerfile` — Multi-stage build (build frontend + server, then slim runtime with Chromium for Puppeteer)
- `docker-compose.yml` — Mounts `./data` as volume, reads `.env` for config
