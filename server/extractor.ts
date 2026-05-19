import * as cheerio from "cheerio";
import puppeteer, { type Browser } from "puppeteer";

export interface ExtractedJob {
  company: string | null;
  title: string | null;
  location: string | null;
  postingDate: string | null;
  description: string | null;
}

const EMPTY: ExtractedJob = { company: null, title: null, location: null, postingDate: null, description: null };

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
  }
  return browserInstance;
}

async function fetchRenderedHtml(url: string): Promise<string> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: 15_000 });
    return await page.content();
  } finally {
    await page.close();
  }
}

function findJobPosting(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  if (obj["@type"] === "JobPosting") return obj;

  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) {
      const found = findJobPosting(item);
      if (found) return found;
    }
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findJobPosting(item);
      if (found) return found;
    }
  }

  return null;
}

function normalizeDate(raw: string): string | null {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function fromJsonLd($: cheerio.CheerioAPI): ExtractedJob | null {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    try {
      const raw = $(scripts[i]).html();
      if (!raw) continue;
      const data = JSON.parse(raw);
      const job = findJobPosting(data);
      if (!job) continue;

      const org = job.hiringOrganization as Record<string, unknown> | string | undefined;
      const company = typeof org === "string"
        ? org
        : (org?.name as string) ?? null;

      const datePosted = typeof job.datePosted === "string"
        ? normalizeDate(job.datePosted)
        : null;

      let location: string | null = null;
      const loc = job.jobLocation;
      if (typeof loc === "string") {
        location = loc;
      } else if (Array.isArray(loc)) {
        location = loc.map((l: Record<string, unknown>) =>
          (l.address as Record<string, unknown>)?.addressLocality ?? l.name ?? ""
        ).filter(Boolean).join(", ");
      } else if (loc && typeof loc === "object") {
        const addr = (loc as Record<string, unknown>).address as Record<string, unknown> | undefined;
        location = (addr?.addressLocality as string) ?? (loc as Record<string, unknown>).name as string ?? null;
      }

      return {
        company: company ?? null,
        title: (job.title as string) ?? null,
        location: location || null,
        postingDate: datePosted,
        description: job.description
          ? cheerio.load(String(job.description)).text().slice(0, 500)
          : null,
      };
    } catch {
      // invalid JSON-LD, skip
    }
  }
  return null;
}

function companyFromTitle(title: string | null): string | null {
  if (!title) return null;
  const atMatch = title.match(/\bat\s+(.+?)(?:\s*[-|]|$)/i);
  if (atMatch) return atMatch[1].trim();
  const sepMatch = title.match(/[-|]\s*([^-|]+?)\s*$/);
  if (sepMatch) return sepMatch[1].trim();
  return null;
}

function fromMetaTags($: cheerio.CheerioAPI): ExtractedJob {
  const ogTitle = $('meta[property="og:title"]').attr("content") ?? null;
  const ogSiteName = $('meta[property="og:site_name"]').attr("content") ?? null;
  const ogDescription = $('meta[property="og:description"]').attr("content") ?? null;
  const metaDescription = $('meta[name="description"]').attr("content") ?? null;
  const pageTitle = $("title").text().trim() || null;

  const rawTitle = ogTitle ?? pageTitle;
  const company = ogSiteName ?? companyFromTitle(rawTitle);
  const description = ogDescription ?? metaDescription;

  const datePublished = $('meta[property="article:published_time"]').attr("content")
    ?? $('meta[name="date"]').attr("content")
    ?? null;
  const postingDate = datePublished ? normalizeDate(datePublished) : null;

  const geoRegion = $('meta[name="geo.region"]').attr("content") ?? null;
  const geoPlace = $('meta[name="geo.placename"]').attr("content") ?? null;
  const locationMeta = geoPlace ?? geoRegion;

  return {
    company: company ? company.trim() : null,
    title: rawTitle ? rawTitle.trim() : null,
    location: locationMeta ? locationMeta.trim() : null,
    postingDate,
    description: description ? description.trim().slice(0, 500) : null,
  };
}

function fromRenderedDom($: cheerio.CheerioAPI): Partial<ExtractedJob> {
  const result: Partial<ExtractedJob> = {};

  // Greenhouse: company name in .company-name, job title in .app-title
  const ghCompany = $(".company-name").first().text().trim();
  const ghTitle = $(".app-title").first().text().trim();
  if (ghCompany) result.company = ghCompany;
  if (ghTitle) result.title = ghTitle;

  // Lever: company in .main-header-logo img alt, title in .posting-headline h2
  const leverTitle = $(".posting-headline h2").first().text().trim();
  const leverCompany = $(".main-header-logo img").attr("alt")?.trim();
  if (leverTitle) result.title = leverTitle;
  if (leverCompany) result.company = leverCompany;

  // Ashby: title in h1.ashby-job-posting-brief-title, company from header
  const ashbyTitle = $("h1.ashby-job-posting-brief-title").first().text().trim()
    || $('[data-testid="job-title"]').first().text().trim();
  if (ashbyTitle) result.title = ashbyTitle;

  // Generic: look for the most prominent heading as job title
  if (!result.title) {
    const h1 = $("h1").first().text().trim();
    if (h1 && h1.length > 3 && h1.length < 200) result.title = h1;
  }

  // Look for company name in common selectors
  if (!result.company) {
    for (const sel of [".company-name", ".employer-name", '[data-testid="company-name"]', ".posting-categories .location"]) {
      const text = $(sel).first().text().trim();
      if (text && text.length > 1 && text.length < 100) {
        result.company = text;
        break;
      }
    }
  }

  // Look for posting date in visible text
  if (!result.postingDate) {
    const datePatterns = [
      /posted\s*(?:on\s*)?:?\s*(\w+\s+\d{1,2},?\s+\d{4})/i,
      /date\s*(?:posted)?\s*:?\s*(\w+\s+\d{1,2},?\s+\d{4})/i,
      /posted\s*(?:on\s*)?:?\s*(\d{4}-\d{2}-\d{2})/i,
      /(\d{1,2}\/\d{1,2}\/\d{4})/,
    ];
    const bodyText = $("body").text();
    for (const pat of datePatterns) {
      const m = bodyText.match(pat);
      if (m) {
        const d = normalizeDate(m[1]);
        if (d) { result.postingDate = d; break; }
      }
    }

    // Check time/datetime elements
    $("time[datetime]").each((_, el) => {
      if (result.postingDate) return;
      const dt = $(el).attr("datetime");
      if (dt) {
        const d = normalizeDate(dt);
        if (d) result.postingDate = d;
      }
    });
  }

  // Look for location in common selectors
  if (!result.location) {
    for (const sel of [
      ".location", ".job-location", '[data-testid="location"]',
      ".posting-categories .location", ".job-info .location",
      ".workplaceType", '[class*="location"]',
    ]) {
      const text = $(sel).first().text().trim();
      if (text && text.length > 1 && text.length < 150) {
        result.location = text;
        break;
      }
    }
  }

  // Fallback: element immediately after h1 often contains location on career pages
  if (!result.location) {
    const afterH1 = $("h1").first().next().text().trim();
    if (afterH1 && afterH1.length > 3 && afterH1.length < 150) {
      result.location = afterH1;
    }
  }

  return result;
}

function companyFromUrl(url: string): string | null {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }

  const host = parsed.hostname.toLowerCase();
  const parts = parsed.pathname.split("/").filter(Boolean);

  const platformHosts: Record<string, boolean> = {
    "boards.greenhouse.io": true,
    "jobs.lever.co": true,
    "jobs.ashbyhq.com": true,
    "jobs.smartrecruiters.com": true,
  };

  if (platformHosts[host] && parts.length > 0) {
    return parts[0].split(/[-_]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
  }

  const workday = host.match(/^([^.]+)\.wd\d+\.myworkdayjobs\.com$/);
  if (workday) {
    return workday[1].split(/[-_]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
  }

  if (host.endsWith("linkedin.com")) {
    const viewIdx = parts.indexOf("view");
    if (viewIdx !== -1 && parts.length > viewIdx + 1) {
      const raw = parts[viewIdx + 1].replace(/-\d+$/, "");
      const atIdx = raw.lastIndexOf("-at-");
      if (atIdx !== -1) {
        return raw.slice(atIdx + 4).split(/[-_]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
      }
    }
    return null;
  }

  if (host.endsWith("indeed.com")) {
    return parsed.searchParams.get("cmp") || null;
  }

  return null;
}

export async function extractJobDetails(url: string): Promise<ExtractedJob> {
  let html: string;
  try {
    html = await fetchRenderedHtml(url);
  } catch {
    return EMPTY;
  }

  const $ = cheerio.load(html);

  const jsonLd = fromJsonLd($);
  const meta = fromMetaTags($);
  const dom = fromRenderedDom($);
  const urlCompany = companyFromUrl(url);

  return {
    company: jsonLd?.company ?? dom.company ?? meta.company ?? urlCompany,
    title: jsonLd?.title ?? dom.title ?? meta.title,
    location: jsonLd?.location ?? dom.location ?? meta.location ?? null,
    postingDate: jsonLd?.postingDate ?? dom.postingDate ?? meta.postingDate,
    description: jsonLd?.description ?? meta.description ?? dom.description ?? null,
  };
}
