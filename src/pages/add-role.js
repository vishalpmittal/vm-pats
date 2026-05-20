import { add, update, getById, getByCompany, getAll, remove } from "../store";
import { el } from "../utils/dom";
import { renderMarkdown } from "../utils/markdown";
import { parseJobUrl } from "../utils/url-parser";
import { showResumeViewer } from "../components/resume-viewer";
async function renderPastApplications(container, company, title, excludeId) {
    container.innerHTML = "";
    if (!company.trim())
        return;
    const past = (await getByCompany(company)).filter((j) => j.id !== excludeId);
    if (past.length === 0)
        return;
    container.appendChild(el("h3", { className: "past-apps-heading" }, `Past applications at ${company}`));
    const header = el("div", { className: "job-row job-row-header" }, el("span", { className: "cell cell-date" }, "Posted"), el("span", { className: "cell cell-company" }, "Company"), el("span", { className: "cell cell-title" }, "Title"), el("span", { className: "cell cell-location" }, "Location"), el("span", { className: "cell cell-link" }, "Link"), el("span", { className: "cell cell-date" }, "Applied"), el("span", { className: "cell cell-notes" }, "Notes"), el("span", { className: "cell cell-actions" }, ""));
    container.appendChild(header);
    for (const job of past) {
        const link = el("a", { href: job.jobLink, target: "_blank", rel: "noopener" }, "View");
        link.classList.add("job-link");
        const isDup = title.trim() !== "" && job.title.toLowerCase() === title.toLowerCase();
        const row = el("div", { className: isDup ? "job-row glass-card job-row-dup" : "job-row glass-card" }, el("span", { className: "cell cell-date" }, job.postingDate || "—"), el("span", { className: "cell cell-company" }, job.company), el("span", { className: "cell cell-title" }, job.title), el("span", { className: "cell cell-location" }, job.location || "—"), el("span", { className: "cell cell-link" }, link), el("span", { className: "cell cell-date" }, job.applicationDate || "—"), el("span", { className: "cell cell-notes" }, job.notes || "—"), el("span", { className: "cell cell-actions" }, ""));
        container.appendChild(row);
    }
}
async function checkDuplicate(company, title) {
    const all = await getAll();
    const c = company.toLowerCase();
    const t = title.toLowerCase();
    return all.some((j) => j.company.toLowerCase() === c && j.title.toLowerCase() === t);
}
export async function renderAddRole(container, editId) {
    container.innerHTML = "";
    const existing = editId ? await getById(editId) : undefined;
    const isEdit = !!existing;
    const backBtn = el("button", { className: "btn btn-secondary" }, "← Back");
    backBtn.addEventListener("click", () => { window.location.hash = "#/"; });
    const headerButtons = el("div", { className: "header-actions" }, backBtn);
    let bottomActions;
    let runAnalysis;
    const reviewSpinner = el("span", { className: "section-spinner" });
    const reviewTimestamp = el("span", { className: "section-timestamp" });
    let reviewBodyRef;
    let reviewBtnRef;
    let reviewSectionRef;
    if (isEdit && existing) {
        runAnalysis = async () => {
            reviewSpinner.classList.add("active");
            if (reviewBtnRef) {
                reviewBtnRef.setAttribute("disabled", "true");
                reviewBtnRef.textContent = "Reviewing...";
            }
            try {
                const resp = await fetch("/api/analyze", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jobId: editId }),
                });
                if (!resp.ok) {
                    const err = await resp.json();
                    if (reviewBodyRef)
                        reviewBodyRef.textContent = err.error || "Analysis failed.";
                    return;
                }
                const data = await resp.json();
                if (reviewBodyRef) {
                    reviewBodyRef.innerHTML = renderMarkdown(data.analysis);
                    reviewBodyRef.classList.add("guidelines-content");
                }
                if (reviewSectionRef)
                    reviewSectionRef.setAttribute("open", "");
                if (data.reviewedAt)
                    reviewTimestamp.textContent = new Date(data.reviewedAt).toLocaleString();
            }
            catch {
                if (reviewBodyRef)
                    reviewBodyRef.textContent = "Failed to connect to analysis service.";
            }
            finally {
                reviewSpinner.classList.remove("active");
                if (reviewBtnRef) {
                    reviewBtnRef.removeAttribute("disabled");
                    reviewBtnRef.textContent = "Review";
                }
            }
        };
        const deleteBtn = el("button", { className: "btn btn-danger-glass" }, "Delete");
        deleteBtn.addEventListener("click", async () => {
            if (confirm(`Delete application at ${existing.company}?`)) {
                await remove(editId);
                window.location.hash = "#/";
            }
        });
        bottomActions = el("div", { className: "edit-actions" }, deleteBtn);
    }
    const header = el("div", { className: "page-header" }, el("h1", {}, isEdit ? "Role Details" : "Add New Role"), headerButtons);
    container.appendChild(header);
    const form = el("form", { className: "add-form glass-card" });
    const dupWarning = el("div", { className: "dup-warning hidden" }, "This looks like a duplicate of an existing application.");
    const pastAppsSection = el("div", { className: "past-apps" });
    const linkInput = el("input", {
        type: "url",
        name: "jobLink",
        placeholder: "Paste job URL here...",
        className: "input",
        value: existing?.jobLink ?? "",
    });
    const companyInput = el("input", {
        type: "text",
        name: "company",
        placeholder: "Company name",
        className: "input",
        value: existing?.company ?? "",
    });
    const titleInput = el("input", {
        type: "text",
        name: "title",
        placeholder: "Job title",
        className: "input",
        value: existing?.title ?? "",
    });
    const locationInput = el("input", {
        type: "text",
        name: "location",
        placeholder: "Location",
        className: "input",
        value: existing?.location ?? "",
    });
    const postingDateInput = el("input", {
        type: "date",
        name: "postingDate",
        value: existing?.postingDate ?? "",
        className: "input",
    });
    const appDateInput = el("input", {
        type: "date",
        name: "applicationDate",
        value: existing?.applicationDate ?? "",
        className: "input",
    });
    const notesInput = el("textarea", {
        name: "notes",
        placeholder: "Notes (optional)",
        className: "input input-textarea",
        rows: "3",
    });
    if (existing?.notes)
        notesInput.value = existing.notes;
    const extractStatus = el("div", { className: "extract-status hidden" });
    let extractTimer = null;
    linkInput.addEventListener("input", () => {
        const local = parseJobUrl(linkInput.value);
        if (local.company) {
            companyInput.value = local.company;
            companyInput.dispatchEvent(new Event("input"));
        }
        if (local.title) {
            titleInput.value = local.title;
            titleInput.dispatchEvent(new Event("input"));
        }
        if (extractTimer)
            clearTimeout(extractTimer);
        try {
            new URL(linkInput.value);
        }
        catch {
            return;
        }
        extractTimer = setTimeout(async () => {
            extractStatus.textContent = "Extracting job details...";
            extractStatus.className = "extract-status";
            try {
                const resp = await fetch(`/api/extract?url=${encodeURIComponent(linkInput.value)}`);
                if (!resp.ok)
                    return;
                const data = await resp.json();
                if (data.company) {
                    companyInput.value = data.company;
                    companyInput.dispatchEvent(new Event("input"));
                }
                if (data.title) {
                    titleInput.value = data.title;
                    titleInput.dispatchEvent(new Event("input"));
                }
                if (data.location) {
                    locationInput.value = data.location;
                }
                if (data.postingDate) {
                    postingDateInput.value = data.postingDate;
                }
                extractStatus.textContent = "Details extracted";
                setTimeout(() => { extractStatus.className = "extract-status hidden"; }, 2000);
            }
            catch {
                extractStatus.className = "extract-status hidden";
            }
        }, 400);
    });
    const updateCompanyDeps = async () => {
        await renderPastApplications(pastAppsSection, companyInput.value, titleInput.value, editId);
        if (companyInput.value && titleInput.value && await checkDuplicate(companyInput.value, titleInput.value)) {
            dupWarning.classList.remove("hidden");
        }
        else {
            dupWarning.classList.add("hidden");
        }
    };
    companyInput.addEventListener("input", updateCompanyDeps);
    titleInput.addEventListener("input", updateCompanyDeps);
    const submitBtn = el("button", { type: "submit", className: "btn btn-primary" }, isEdit ? "Update Application" : "Save Application");
    const field = (label, input, full) => {
        const wrap = el("div", { className: full ? "form-field form-field-full" : "form-field" }, el("label", { className: "form-label" }, label), input);
        return wrap;
    };
    form.append(field("Job Link", linkInput, true), extractStatus, field("Company", companyInput), field("Job Title", titleInput), dupWarning, field("Location", locationInput), field("Posting Date", postingDateInput), field("Application Date", appDateInput), field("Notes", notesInput), submitBtn);
    extractStatus.classList.add("form-field-full");
    dupWarning.classList.add("form-field-full");
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!companyInput.value.trim() || !titleInput.value.trim()) {
            alert("Company and Title are required.");
            return;
        }
        const fields = {
            company: companyInput.value.trim(),
            title: titleInput.value.trim(),
            jobLink: linkInput.value.trim(),
            location: locationInput.value.trim(),
            postingDate: postingDateInput.value,
            applicationDate: appDateInput.value,
            notes: notesInput.value.trim(),
        };
        if (isEdit) {
            await update(editId, fields);
        }
        else {
            await add(fields);
        }
        window.location.hash = "#/";
    });
    container.appendChild(form);
    container.appendChild(pastAppsSection);
    if (isEdit && existing) {
        const reviewSection = el("details", { className: "collapsible-section glass-card" });
        const reviewBtn = el("button", { className: "btn btn-primary btn-sm" }, "Review");
        reviewBtnRef = reviewBtn;
        reviewBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            runAnalysis();
        });
        const summary = el("summary", { className: "collapsible-header" }, el("span", {}, "AI Resume Review", reviewSpinner, reviewTimestamp), reviewBtn);
        const reviewBody = el("div", { className: "collapsible-body" });
        reviewBodyRef = reviewBody;
        reviewSectionRef = reviewSection;
        reviewSection.appendChild(summary);
        reviewSection.appendChild(reviewBody);
        container.appendChild(reviewSection);
        if (existing.hasAiReview) {
            fetch(`/api/reviews/${editId}`).then(async (resp) => {
                if (resp.ok) {
                    const data = await resp.json();
                    reviewBody.innerHTML = renderMarkdown(data.review);
                    reviewBody.classList.add("guidelines-content");
                    if (data.reviewedAt)
                        reviewTimestamp.textContent = new Date(data.reviewedAt).toLocaleString();
                }
                else {
                    reviewBody.textContent = "Could not load review.";
                }
            }).catch(() => {
                reviewBody.textContent = "Failed to connect to server.";
            });
        }
        else {
            reviewBody.textContent = "No AI review yet. Click \"Review\" to generate one.";
        }
        // --- Resume for Role section ---
        const resumeSection = el("details", { className: "collapsible-section glass-card" });
        const resumeBody = el("div", { className: "collapsible-body" });
        const feedbackInput = el("textarea", {
            placeholder: "Resume generation context / feedback (optional)",
            className: "input input-textarea",
            rows: "3",
        });
        const resumeContent = el("div", { className: "guidelines-content" });
        const pastResumes = el("div", { className: "past-resumes" });
        const loadPastResumes = async () => {
            pastResumes.innerHTML = "";
            try {
                const resp = await fetch(`/api/generated-resumes/${editId}`);
                if (!resp.ok)
                    return;
                const data = await resp.json();
                if (data.resumes.length === 0)
                    return;
                const table = el("table", { className: "md-table resume-table" });
                const thead = el("thead", {}, el("tr", {}, el("th", {}, "Generated"), el("th", {}, "Resume"), el("th", {}, "")));
                const tbody = el("tbody", {});
                for (const r of data.resumes) {
                    const viewBtn = el("a", { href: "#", className: "past-resume-link" }, "View");
                    viewBtn.addEventListener("click", async (e) => {
                        e.preventDefault();
                        const resp2 = await fetch(`/api/generated-resumes/${editId}/${r.filename}`);
                        if (resp2.ok) {
                            const d = await resp2.json();
                            showResumeViewer(r.filename, d.content);
                        }
                    });
                    const localTime = r.timestamp ? new Date(r.timestamp).toLocaleString() : "—";
                    tbody.appendChild(el("tr", {}, el("td", {}, localTime), el("td", {}, r.filename), el("td", {}, viewBtn)));
                }
                table.append(thead, tbody);
                pastResumes.appendChild(table);
            }
            catch { /* ignore */ }
        };
        const resumeSpinner = el("span", { className: "section-spinner" });
        const generateBtn = el("button", { className: "btn btn-primary btn-sm" }, "Generate");
        generateBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            generateBtn.textContent = "Generating...";
            generateBtn.setAttribute("disabled", "true");
            resumeSpinner.classList.add("active");
            try {
                const resp = await fetch("/api/generate-resume", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jobId: editId, feedback: feedbackInput.value.trim() }),
                });
                if (!resp.ok) {
                    const err = await resp.json();
                    resumeContent.textContent = err.error || "Generation failed.";
                    return;
                }
                const data = await resp.json();
                showResumeViewer(data.filename, data.content);
                await loadPastResumes();
            }
            catch {
                resumeContent.textContent = "Failed to connect to server.";
            }
            finally {
                generateBtn.textContent = "Generate";
                generateBtn.removeAttribute("disabled");
                resumeSpinner.classList.remove("active");
            }
        });
        const resumeSummary = el("summary", { className: "collapsible-header" }, el("span", {}, "Resume for Role", resumeSpinner), generateBtn);
        resumeBody.append(feedbackInput, resumeContent, pastResumes);
        resumeSection.appendChild(resumeSummary);
        resumeSection.appendChild(resumeBody);
        container.appendChild(resumeSection);
        loadPastResumes();
    }
    if (bottomActions) {
        container.appendChild(bottomActions);
    }
}
