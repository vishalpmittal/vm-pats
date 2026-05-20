const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d+$/;
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function cleanSlug(slug) {
    return slug
        .split(/[-_]/)
        .map(capitalize)
        .join(" ");
}
function isSlugMeaningful(slug) {
    return !UUID_RE.test(slug) && !NUMERIC_RE.test(slug) && slug.length > 2;
}
function titleFromSlug(slug) {
    if (!isSlugMeaningful(slug))
        return null;
    return cleanSlug(slug);
}
export function parseJobUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return { company: null, title: null };
    }
    const host = parsed.hostname.toLowerCase();
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const empty = { company: null, title: null };
    // Greenhouse: boards.greenhouse.io/{company}/jobs/{slug-or-id}
    if (host === "boards.greenhouse.io" && pathParts.length > 0) {
        const company = cleanSlug(pathParts[0]);
        const jobSlug = pathParts.length >= 3 ? pathParts[2] : null;
        return { company, title: jobSlug ? titleFromSlug(jobSlug) : null };
    }
    // Lever: jobs.lever.co/{company}/{uuid} or jobs.lever.co/{company}/{slug}
    if (host === "jobs.lever.co" && pathParts.length > 0) {
        const company = cleanSlug(pathParts[0]);
        const jobSlug = pathParts.length >= 2 ? pathParts[1] : null;
        return { company, title: jobSlug ? titleFromSlug(jobSlug) : null };
    }
    // Ashby: jobs.ashbyhq.com/{company}/{slug}
    if (host === "jobs.ashbyhq.com" && pathParts.length > 0) {
        const company = cleanSlug(pathParts[0]);
        const jobSlug = pathParts.length >= 2 ? pathParts[1] : null;
        return { company, title: jobSlug ? titleFromSlug(jobSlug) : null };
    }
    // Workday: {company}.wd{N}.myworkdayjobs.com/.../job/{slug}
    const workdayMatch = host.match(/^([^.]+)\.wd\d+\.myworkdayjobs\.com$/);
    if (workdayMatch) {
        const company = cleanSlug(workdayMatch[1]);
        const jobIdx = pathParts.indexOf("job");
        const jobSlug = jobIdx !== -1 && pathParts.length > jobIdx + 1 ? pathParts[jobIdx + 1] : null;
        return { company, title: jobSlug ? titleFromSlug(jobSlug) : null };
    }
    // SmartRecruiters: jobs.smartrecruiters.com/{company}/{slug}
    if (host === "jobs.smartrecruiters.com" && pathParts.length > 0) {
        const company = cleanSlug(pathParts[0]);
        const jobSlug = pathParts.length >= 2 ? pathParts[1] : null;
        return { company, title: jobSlug ? titleFromSlug(jobSlug) : null };
    }
    // LinkedIn: linkedin.com/jobs/view/{title-at-company-id}
    if (host.endsWith("linkedin.com")) {
        const viewIdx = pathParts.indexOf("view");
        if (viewIdx !== -1 && pathParts.length > viewIdx + 1) {
            const raw = pathParts[viewIdx + 1].replace(/-\d+$/, "");
            const atIdx = raw.lastIndexOf("-at-");
            if (atIdx !== -1) {
                return {
                    company: cleanSlug(raw.slice(atIdx + 4)),
                    title: cleanSlug(raw.slice(0, atIdx)),
                };
            }
            return { company: null, title: titleFromSlug(raw) };
        }
        return empty;
    }
    // Indeed: indeed.com/viewjob?t=...&cmp=...
    if (host.endsWith("indeed.com")) {
        const title = parsed.searchParams.get("t");
        const company = parsed.searchParams.get("cmp");
        return {
            company: company || null,
            title: title ? title.replace(/\+/g, " ") : null,
        };
    }
    // Generic: try subdomain for company, last meaningful path segment for title
    const subdomain = host.split(".")[0];
    const genericPrefixes = ["www", "jobs", "careers", "apply", "boards"];
    const company = !genericPrefixes.includes(subdomain) && host.split(".").length > 2
        ? cleanSlug(subdomain)
        : null;
    const lastSlug = pathParts.length > 0 ? pathParts[pathParts.length - 1] : null;
    const title = lastSlug ? titleFromSlug(lastSlug) : null;
    return { company, title };
}
