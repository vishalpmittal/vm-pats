# PRD: Personal Application Tracking System (PATS)

## Overview

A lightweight, browser-only job application tracker. No server or backend — runs entirely from local files opened in a browser. All data persists as JSON files in a `data/` folder.

## Design

Glass-inspired UI based on the reference mockup at `ux/glass-ux-design.png` — translucent panels, soft shadows, rounded corners, blurred backgrounds.

## Data Model

### Job Application

| Field            | Type   | Format/Notes              |
|------------------|--------|---------------------------|
| company          | string | Company name              |
| title            | string | Job title                 |
| jobLink          | string | URL to the posting        |
| postingDate      | string | `yyyy-mm-dd`              |
| applicationDate  | string | `yyyy-mm-dd`              |
| notes            | string | Free-text notes           |

## Pages

### Home — Timeline List

- Lists all job applications, most recent first (by application date)
- Each row shows fields in order: posting date, company, title, job link, application date, notes
- All dates displayed in `yyyy-mm-dd` format

### Add New Role

- Accessed via an "Add New Role" button at the top of the home page
- Pasting a job link auto-extracts company name and other job details when possible
- Below the form, shows all past applications at the same company
- Highlights if the new job is a duplicate of a past application
