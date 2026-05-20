# PATS — Personal Application Tracking System

A job application tracker with AI-powered resume analysis and tailored resume generation. Built with a glass-inspired UI.


## Features

- **Job tracking** — Add, edit, and delete job applications with posting date, company, title, link, location, and notes
- **Auto-extraction** — Paste a job URL to auto-fill company name and job details (supports Greenhouse, Lever, Ashby, Workday, SmartRecruiters, LinkedIn, Indeed)
- **Duplicate detection** — Shows past applications at the same company and highlights duplicates
- **AI resume review** — Analyzes your master resume against a job posting, identifies gaps, and tracks them over time
- **Tailored resume generation** — Generates a role-specific resume using your master resume, career guidelines, AI review, and optional feedback. Supports multiple versions per role.
- **Resume PDF export** — Print-optimized layout for exporting generated resumes
- **Master resume management** — View your master resume in the app, or upload a new one (auto-converts to markdown)
- **Guidelines library** — Browse career-level guidelines with AI-powered guideline generation from a prompt
- **Consolidated gap analysis** — Resume gaps are AI-consolidated into categorized sections (Technical Skills, Leadership, Domain Knowledge, etc.) and deduplicated across reviews

## Design

Glass-inspired UI — translucent panels, soft shadows, rounded corners, blurred backgrounds. See `ux/glass-ux-design.png` for the reference mockup.

## Data Model

### Job Application

| Field           | Type    | Format/Notes                |
|-----------------|---------|-----------------------------|
| id              | string  | Auto-generated UUID         |
| company         | string  | Company name                |
| title           | string  | Job title                   |
| jobLink         | string  | URL to the posting          |
| location        | string  | Job location                |
| postingDate     | string  | `yyyy-mm-dd`                |
| applicationDate | string  | `yyyy-mm-dd`                |
| notes           | string  | Free-text notes             |
| hasAiReview     | boolean | Whether AI review exists    |

## Pages

### Home — Timeline List

- Lists all job applications, most recent first (by application date)
- Each row shows: posting date, company, title, job link, application date, notes
- Click a row to view/edit role details

### Add / Edit Role

- "Add New Role" button at the top of the home page
- Pasting a job link auto-extracts company name and other job details
- Shows past applications at the same company below the form, with duplicate highlighting
- **AI Resume Review** — collapsible section with "Review" button, spinner, timestamp, and inline results
- **Resume for Role** — collapsible section with feedback textarea, "Generate" button, versioned resume table, and slide-in viewer

### Master Resume

- View your master resume rendered as markdown
- Upload a new resume file (.md, .txt, .pdf, .doc, .docx) — non-markdown files are auto-converted via AI

### Guidelines

- Browse career-level guidelines served from markdown files
- Create new guidelines manually or auto-generate content from an AI prompt

### Resume Gaps

- Consolidated, categorized view of all gaps identified across AI reviews
- Deduplicated and organized by category (Technical Skills, Leadership, Domain Knowledge, etc.)

## Prerequisites

- **Node.js 22+**
- **One of** (for AI features):
  - **`claude` CLI** — preferred, handles its own auth (no API key needed)
  - **`ANTHROPIC_API_KEY`** env var — SDK fallback when CLI is not installed
- **Chromium/Chrome** — Puppeteer uses it for page rendering during job extraction

## Setup

```bash
git clone <repo-url> && cd vm-pats
npm install
cp .env.example .env        # Edit if needed (ANTHROPIC_API_KEY, PATS_DATA_DIR)
```

The server auto-initializes the `data/` directory on startup (creates folders, seeds empty JSON files, copies bundled guidelines). You can upload your master resume through the app (Master Resume page) or place it manually:
- `data/resumes/master-resume.md` — your resume in markdown format

## Development

```bash
npm run dev          # Start both Vite (:5173) and Express (:3001)
npm run dev:client   # Vite frontend only
npm run dev:server   # Express backend only
```

Vite proxies `/api` requests to the Express server during development.

## Build & Production

```bash
npm run build        # Type-check + build frontend (dist/) + compile server (dist-server/)
npm start            # Run production server (serves static files + API)
```

## Running with Docker Desktop

### Prerequisites

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and make sure it's running

### Prepare your resume

2. Place your master resume at `data/resumes/master-resume.md` (or at `PATS_DATA_DIR/resumes/master-resume.md` if using a custom data path)

The server auto-creates the `jobs/`, `resumes/`, and `guidelines/` directories on startup, seeds `jobs.json` and `reviews.json`, and copies the bundled guideline files into your data folder if they don't already exist.

### Configure and run

3. Copy the example env file:

```bash
cp .env.example .env
```

4. (Optional) Edit `.env` and set `PATS_DATA_DIR` to a custom data folder:

```
PATS_DATA_DIR=/Users/yourname/pats-data
```

If `PATS_DATA_DIR` is not set, it defaults to `./data` relative to the project root.

5. Build and start the container:

```bash
docker compose up --build
```

6. Open http://localhost:3000 in your browser

### Stopping and restarting

```bash
docker compose down          # Stop the container
docker compose up            # Restart (no --build needed unless code changed)
```

Your data is stored on the host at the `PATS_DATA_DIR` path, so it persists across container restarts.

## Tech Stack

- **Frontend**: Vanilla TypeScript + DOM APIs (no frameworks), bundled by Vite
- **Backend**: Express 5, Puppeteer, cheerio
- **Data**: JSON files + markdown on disk (no database)
- **AI**: `claude` CLI or `@anthropic-ai/sdk` (resume analysis, generation, and content creation)
