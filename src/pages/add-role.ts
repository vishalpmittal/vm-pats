import { add, update, getById, getByCompany, getAll, remove } from "../store";
import { el } from "../utils/dom";
import { renderMarkdown } from "../utils/markdown";
import { parseJobUrl } from "../utils/url-parser";
import { showResumeViewer } from "../components/resume-viewer";

async function renderPastApplications(container: HTMLElement, company: string, title: string, excludeId?: string): Promise<void> {
  container.innerHTML = "";
  if (!company.trim()) return;

  const past = (await getByCompany(company)).filter((j) => j.id !== excludeId);
  if (past.length === 0) return;

  container.appendChild(el("h3", { className: "past-apps-heading" }, `Past applications at ${company}`));

  const header = el(
    "div",
    { className: "job-row job-row-header" },
    el("span", { className: "cell cell-date" }, "Posted"),
    el("span", { className: "cell cell-company" }, "Company"),
    el("span", { className: "cell cell-title" }, "Title"),
    el("span", { className: "cell cell-location" }, "Location"),
    el("span", { className: "cell cell-link" }, "Link"),
    el("span", { className: "cell cell-date" }, "Applied"),
    el("span", { className: "cell cell-notes" }, "Notes"),
    el("span", { className: "cell cell-actions" }, "")
  );
  container.appendChild(header);

  for (const job of past) {
    const link = el("a", { href: job.jobLink, target: "_blank", rel: "noopener" }, "View");
    link.classList.add("job-link");

    const isDup = title.trim() !== "" && job.title.toLowerCase() === title.toLowerCase();
    const row = el(
      "div",
      { className: isDup ? "job-row glass-card job-row-dup" : "job-row glass-card" },
      el("span", { className: "cell cell-date" }, job.postingDate || "—"),
      el("span", { className: "cell cell-company" }, job.company),
      el("span", { className: "cell cell-title" }, job.title),
      el("span", { className: "cell cell-location" }, job.location || "—"),
      el("span", { className: "cell cell-link" }, link),
      el("span", { className: "cell cell-date" }, job.applicationDate || "—"),
      el("span", { className: "cell cell-notes" }, job.notes || "—"),
      el("span", { className: "cell cell-actions" }, "")
    );
    container.appendChild(row);
  }
}

async function checkDuplicate(company: string, title: string): Promise<boolean> {
  const all = await getAll();
  const c = company.toLowerCase();
  const t = title.toLowerCase();
  return all.some(
    (j) => j.company.toLowerCase() === c && j.title.toLowerCase() === t
  );
}

export async function renderAddRole(container: HTMLElement, editId?: string): Promise<void> {
  container.innerHTML = "";

  const existing = editId ? await getById(editId) : undefined;
  const isEdit = !!existing;

  const backBtn = el("button", { className: "btn btn-secondary" }, "← Back");
  backBtn.addEventListener("click", () => { window.location.hash = "#/"; });

  const headerButtons = el("div", { className: "header-actions" }, backBtn);

  let extractedJobDescription = existing?.jobDescription ?? "";
  let bottomActions: HTMLElement | undefined;
  let runAnalysis: (() => Promise<void>) | undefined;
  const reviewSpinner = el("span", { className: "section-spinner" });
  const reviewTimestamp = el("span", { className: "section-timestamp" });
  let reviewBodyRef: HTMLElement | undefined;
  let reviewBtnRef: HTMLButtonElement | undefined;
  let reviewSectionRef: HTMLElement | undefined;

  if (isEdit && existing) {
    runAnalysis = async () => {
      reviewSpinner.classList.add("active");
      if (reviewBtnRef) { reviewBtnRef.setAttribute("disabled", "true"); reviewBtnRef.textContent = "Reviewing..."; }
      try {
        const resp = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: editId }),
        });
        if (!resp.ok) {
          const err = await resp.json();
          if (reviewBodyRef) reviewBodyRef.textContent = err.error || "Analysis failed.";
          return;
        }
        const data = await resp.json();
        if (reviewBodyRef) {
          reviewBodyRef.innerHTML = renderMarkdown(data.analysis);
          reviewBodyRef.classList.add("guidelines-content");
        }
        if (reviewSectionRef) reviewSectionRef.setAttribute("open", "");
        if (data.reviewedAt) reviewTimestamp.textContent = new Date(data.reviewedAt).toLocaleString();
      } catch {
        if (reviewBodyRef) reviewBodyRef.textContent = "Failed to connect to analysis service.";
      } finally {
        reviewSpinner.classList.remove("active");
        if (reviewBtnRef) { reviewBtnRef.removeAttribute("disabled"); reviewBtnRef.textContent = "Review"; }
      }
    };

    const deleteBtn = el("button", { className: "btn btn-danger-glass" }, "Delete");
    deleteBtn.addEventListener("click", async () => {
      if (confirm(`Delete application at ${existing.company}?`)) {
        await remove(editId!);
        window.location.hash = "#/";
      }
    });

    bottomActions = el("div", { className: "edit-actions" }, deleteBtn);
  }

  const header = el("div", { className: "page-header" },
    el("h1", {}, isEdit ? "Role Details" : "Add New Role"),
    headerButtons
  );
  container.appendChild(header);

  const form = el("form", { className: "add-form glass-card" });
  const dupWarning = el("div", { className: "dup-warning hidden" },
    "This looks like a duplicate of an existing application."
  );
  const pastAppsSection = el("div", { className: "past-apps" });

  const linkInput = el("input", {
    type: "url",
    name: "jobLink",
    placeholder: "Paste job URL here...",
    className: "input",
    value: existing?.jobLink ?? "",
  }) as HTMLInputElement;

  const companyInput = el("input", {
    type: "text",
    name: "company",
    placeholder: "Company name",
    className: "input",
    value: existing?.company ?? "",
    autocomplete: "off",
  }) as HTMLInputElement;

  const companyDropdown = el("div", { className: "autocomplete-dropdown hidden" });
  let companiesList: { company: string }[] = [];

  fetch("/api/companies").then(r => r.json()).then((data: { company: string }[]) => {
    companiesList = data;
  }).catch(() => {});

  function updateDropdown() {
    companyDropdown.innerHTML = "";
    const query = companyInput.value.trim().toLowerCase();
    if (!query) { companyDropdown.classList.add("hidden"); return; }

    const matches = companiesList
      .filter(c => c.company.toLowerCase().includes(query))
      .slice(0, 8);

    if (matches.length === 0) { companyDropdown.classList.add("hidden"); return; }

    for (const m of matches) {
      const item = el("div", { className: "autocomplete-item" }, m.company);
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        companyInput.value = m.company;
        companyDropdown.classList.add("hidden");
        companyInput.dispatchEvent(new Event("input"));
      });
      companyDropdown.appendChild(item);
    }
    companyDropdown.classList.remove("hidden");
  }

  companyInput.addEventListener("input", updateDropdown);
  companyInput.addEventListener("focus", updateDropdown);
  companyInput.addEventListener("blur", () => {
    setTimeout(() => companyDropdown.classList.add("hidden"), 150);
  });

  const titleInput = el("input", {
    type: "text",
    name: "title",
    placeholder: "Job title",
    className: "input",
    value: existing?.title ?? "",
  }) as HTMLInputElement;

  const locationInput = el("input", {
    type: "text",
    name: "location",
    placeholder: "Location",
    className: "input",
    value: existing?.location ?? "",
  }) as HTMLInputElement;

  const postingDateInput = el("input", {
    type: "date",
    name: "postingDate",
    value: existing?.postingDate ?? "",
    className: "input",
  }) as HTMLInputElement;

  const appDateInput = el("input", {
    type: "date",
    name: "applicationDate",
    value: existing?.applicationDate ?? "",
    className: "input",
  }) as HTMLInputElement;

  const notesInput = el("textarea", {
    name: "notes",
    placeholder: "Notes (optional)",
    className: "input input-textarea",
    rows: "3",
  }) as HTMLTextAreaElement;
  if (existing?.notes) notesInput.value = existing.notes;

  const extractStatus = el("div", { className: "extract-status hidden" });

  let extractTimer: ReturnType<typeof setTimeout> | null = null;
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

    if (extractTimer) clearTimeout(extractTimer);
    try { new URL(linkInput.value); } catch { return; }

    extractTimer = setTimeout(async () => {
      extractStatus.textContent = "Extracting job details...";
      extractStatus.className = "extract-status";
      try {
        const resp = await fetch(`/api/extract?url=${encodeURIComponent(linkInput.value)}`);
        if (!resp.ok) return;
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
        if (data.jobDescription) {
          extractedJobDescription = data.jobDescription;
        }
        extractStatus.textContent = "Details extracted";
        setTimeout(() => { extractStatus.className = "extract-status hidden"; }, 2000);
      } catch {
        extractStatus.className = "extract-status hidden";
      }
    }, 400);
  });

  const updateCompanyDeps = async () => {
    await renderPastApplications(pastAppsSection, companyInput.value, titleInput.value, editId);
    if (companyInput.value && titleInput.value && await checkDuplicate(companyInput.value, titleInput.value)) {
      dupWarning.classList.remove("hidden");
    } else {
      dupWarning.classList.add("hidden");
    }
  };
  companyInput.addEventListener("input", updateCompanyDeps);
  titleInput.addEventListener("input", updateCompanyDeps);

  const submitBtn = el("button", { type: "submit", className: "btn btn-primary" }, isEdit ? "Update Application" : "Save Application");

  const field = (label: string, input: HTMLElement, full?: boolean) => {
    const wrap = el("div", { className: full ? "form-field form-field-full" : "form-field" },
      el("label", { className: "form-label" }, label),
      input
    );
    return wrap;
  };

  const companyField = field("Company", companyInput);
  companyField.style.position = "relative";
  companyField.appendChild(companyDropdown);

  form.append(
    field("Job Link", linkInput, true),
    extractStatus,
    companyField,
    field("Job Title", titleInput),
    dupWarning,
    field("Location", locationInput),
    field("Posting Date", postingDateInput),
    field("Application Date", appDateInput),
    field("Notes", notesInput),
    ...((isEdit && existing?.addedDate) ? [(() => {
      const addedInput = el("input", { type: "date", className: "input", value: existing.addedDate, disabled: "true" }) as HTMLInputElement;
      return field("Added", addedInput);
    })()] : []),
    submitBtn
  );

  extractStatus.classList.add("form-field-full");
  dupWarning.classList.add("form-field-full");

  const referralNameInput = el("input", {
    type: "text",
    name: "referralName",
    placeholder: "Referrer's name",
    className: "input",
    value: existing?.referralName ?? "",
  }) as HTMLInputElement;

  const referralLinkedInInput = el("input", {
    type: "url",
    name: "referralLinkedIn",
    placeholder: "LinkedIn profile URL",
    className: "input",
    value: existing?.referralLinkedIn ?? "",
  }) as HTMLInputElement;

  const referralRelationSelect = el("select", {
    name: "referralRelation",
    className: "input",
  }) as HTMLSelectElement;
  const relationOptions = ["", "Ex-colleague", "College together", "Close friend", "Know via common friend"];
  for (const opt of relationOptions) {
    const option = el("option", { value: opt }, opt || "Select relation...");
    if (opt === (existing?.referralRelation ?? "")) (option as HTMLOptionElement).selected = true;
    referralRelationSelect.appendChild(option);
  }

  const referralContextInput = el("textarea", {
    name: "referralContext",
    placeholder: "Additional context about the referrer (e.g., worked together on X project, met at Y conference)",
    className: "input input-textarea",
    rows: "3",
  }) as HTMLTextAreaElement;
  if (existing?.referralContext) referralContextInput.value = existing.referralContext;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!companyInput.value.trim() || !titleInput.value.trim()) {
      alert("Company and Title are required.");
      return;
    }

    let companyName = companyInput.value.trim();
    const match = companiesList.find(c => c.company.toLowerCase() === companyName.toLowerCase());
    if (match) {
      companyName = match.company;
    } else {
      submitBtn.textContent = "Adding company...";
      (submitBtn as HTMLButtonElement).disabled = true;
      try {
        const lookupResp = await fetch("/api/companies/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company: companyName }),
        });
        if (lookupResp.ok) {
          const added = await lookupResp.json();
          companyName = added.company;
          companiesList.push(added);
        }
      } catch { /* proceed with typed name */ }
      submitBtn.textContent = isEdit ? "Update Application" : "Save Application";
      (submitBtn as HTMLButtonElement).disabled = false;
    }

    const fields = {
      company: companyName,
      title: titleInput.value.trim(),
      jobLink: linkInput.value.trim(),
      location: locationInput.value.trim(),
      postingDate: postingDateInput.value,
      applicationDate: appDateInput.value,
      notes: notesInput.value.trim(),
      referralName: referralNameInput.value.trim(),
      referralLinkedIn: referralLinkedInInput.value.trim(),
      referralRelation: referralRelationSelect.value,
      referralContext: referralContextInput.value.trim(),
      jobDescription: extractedJobDescription,
    };
    if (isEdit) {
      await update(editId!, fields);
    } else {
      await add(fields);
    }
    window.location.hash = "#/";
  });

  container.appendChild(form);
  container.appendChild(pastAppsSection);

  // --- Job Description section ---
  const jobDescSection = el("details", { className: "collapsible-section glass-card" });
  const jobDescBody = el("div", { className: "collapsible-body" });
  const jobDescSpinner = el("span", { className: "section-spinner" });
  const fetchDescBtn = el("button", { className: "btn btn-primary btn-sm" }, existing?.jobDescription ? "Refetch" : "Fetch") as HTMLButtonElement;

  const renderJobDesc = (md: string) => {
    jobDescBody.innerHTML = renderMarkdown(md);
    jobDescBody.classList.add("guidelines-content");
    extractedJobDescription = md;
    fetchDescBtn.textContent = "Refetch";
  };

  const fetchJobDesc = async () => {
    if (isEdit && editId) {
      fetchDescBtn.textContent = "Fetching...";
      fetchDescBtn.setAttribute("disabled", "true");
      jobDescSpinner.classList.add("active");
      try {
        const resp = await fetch(`/api/fetch-job-description/${editId}`, { method: "POST" });
        if (resp.ok) {
          const data = await resp.json();
          renderJobDesc(data.jobDescription);
        } else {
          jobDescBody.textContent = "Failed to fetch job description.";
        }
      } catch {
        jobDescBody.textContent = "Failed to connect to server.";
      } finally {
        fetchDescBtn.removeAttribute("disabled");
        jobDescSpinner.classList.remove("active");
      }
    }
  };

  if (isEdit && editId && linkInput.value) {
    fetchDescBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      fetchJobDesc();
    });
  } else {
    fetchDescBtn.setAttribute("disabled", "true");
    fetchDescBtn.title = "Save the application with a job link first";
  }

  const jobDescSummary = el("summary", { className: "collapsible-header" },
    el("span", {}, "Job Description", jobDescSpinner),
    fetchDescBtn
  );

  if (existing?.jobDescription) {
    renderJobDesc(existing.jobDescription);
  } else if (isEdit && editId && linkInput.value) {
    jobDescBody.textContent = "Fetching job description...";
    fetchJobDesc();
  } else {
    jobDescBody.textContent = "No job description available.";
  }

  jobDescSection.appendChild(jobDescSummary);
  jobDescSection.appendChild(jobDescBody);
  container.appendChild(jobDescSection);

  // --- AI Resume Review section ---
  const reviewSection = el("details", { className: "collapsible-section glass-card" });

  const reviewBtn = el("button", { className: "btn btn-primary btn-sm" }, "Review") as HTMLButtonElement;
  reviewBtnRef = reviewBtn;

  if (isEdit && editId) {
    reviewBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      runAnalysis!();
    });
  } else {
    reviewBtn.setAttribute("disabled", "true");
    reviewBtn.title = "Save the application first to review";
  }

  const reviewSummary = el("summary", { className: "collapsible-header" },
    el("span", {}, "AI Resume Review", reviewSpinner, reviewTimestamp),
    reviewBtn
  );
  const reviewBody = el("div", { className: "collapsible-body" });
  reviewBodyRef = reviewBody;
  reviewSectionRef = reviewSection;

  reviewSection.appendChild(reviewSummary);
  reviewSection.appendChild(reviewBody);
  container.appendChild(reviewSection);

  if (isEdit && existing?.hasAiReview) {
    fetch(`/api/reviews/${editId}`).then(async (resp) => {
      if (resp.ok) {
        const data = await resp.json();
        reviewBody.innerHTML = renderMarkdown(data.review);
        reviewBody.classList.add("guidelines-content");
        if (data.reviewedAt) reviewTimestamp.textContent = new Date(data.reviewedAt).toLocaleString();
      } else {
        reviewBody.textContent = "Could not load review.";
      }
    }).catch(() => {
      reviewBody.textContent = "Failed to connect to server.";
    });
  } else {
    reviewBody.textContent = "No AI review yet. Click \"Review\" to generate one.";
  }

  // --- Resume for Role section ---
  const resumeSection = el("details", { className: "collapsible-section glass-card" });
  const resumeBody = el("div", { className: "collapsible-body" });

  const feedbackInput = el("textarea", {
    placeholder: "Resume generation context / feedback (optional)",
    className: "input input-textarea",
    rows: "3",
  }) as HTMLTextAreaElement;

  const resumeContent = el("div", { className: "guidelines-content" });
  const pastResumes = el("div", { className: "past-resumes" });

  const loadPastResumes = async () => {
    pastResumes.innerHTML = "";
    if (!isEdit || !editId) return;
    try {
      const resp = await fetch(`/api/generated-resumes/${editId}`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.resumes.length === 0) return;

      const table = el("table", { className: "md-table resume-table" });
      const thead = el("thead", {},
        el("tr", {},
          el("th", {}, "Generated"),
          el("th", {}, "Resume"),
          el("th", {}, "")
        )
      );
      const tbody = el("tbody", {});

      for (const r of data.resumes as { filename: string; version: number; timestamp: string }[]) {
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
        tbody.appendChild(
          el("tr", {},
            el("td", {}, localTime),
            el("td", {}, r.filename),
            el("td", {}, viewBtn)
          )
        );
      }

      table.append(thead, tbody);
      pastResumes.appendChild(table);
    } catch { /* ignore */ }
  };

  const resumeSpinner = el("span", { className: "section-spinner" });
  const generateBtn = el("button", { className: "btn btn-primary btn-sm" }, "Generate") as HTMLButtonElement;

  if (isEdit && editId) {
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
      } catch {
        resumeContent.textContent = "Failed to connect to server.";
      } finally {
        generateBtn.textContent = "Generate";
        generateBtn.removeAttribute("disabled");
        resumeSpinner.classList.remove("active");
      }
    });

    loadPastResumes();
  } else {
    generateBtn.setAttribute("disabled", "true");
    generateBtn.title = "Save the application first to generate a resume";
  }

  const resumeSummary = el("summary", { className: "collapsible-header" },
    el("span", {}, "Resume for Role", resumeSpinner),
    generateBtn
  );

  resumeBody.append(feedbackInput, resumeContent, pastResumes);
  resumeSection.appendChild(resumeSummary);
  resumeSection.appendChild(resumeBody);
  container.appendChild(resumeSection);

  // --- Referral section ---
  const referralSection = el("details", { className: "collapsible-section glass-card" });
  const referralBody = el("div", { className: "collapsible-body referral-fields" });

  const blurbContent = el("div", { className: "guidelines-content" });
  const pastBlurbs = el("div", { className: "past-resumes" });

  const loadPastBlurbs = async () => {
    pastBlurbs.innerHTML = "";
    if (!isEdit || !editId) return;
    try {
      const resp = await fetch(`/api/referral-blurbs/${editId}`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.blurbs.length === 0) return;

      const table = el("table", { className: "md-table resume-table" });
      const thead = el("thead", {},
        el("tr", {},
          el("th", {}, "Generated"),
          el("th", {}, "Blurb"),
          el("th", {}, "")
        )
      );
      const tbody = el("tbody", {});

      for (const b of data.blurbs as { filename: string; version: number; timestamp: string }[]) {
        const viewBtn = el("a", { href: "#", className: "past-resume-link" }, "View");
        viewBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          const resp2 = await fetch(`/api/referral-blurbs/${editId}/${b.filename}`);
          if (resp2.ok) {
            const d = await resp2.json();
            showResumeViewer(b.filename, d.content);
          }
        });
        const localTime = b.timestamp ? new Date(b.timestamp).toLocaleString() : "—";
        tbody.appendChild(
          el("tr", {},
            el("td", {}, localTime),
            el("td", {}, b.filename),
            el("td", {}, viewBtn)
          )
        );
      }

      table.append(thead, tbody);
      pastBlurbs.appendChild(table);
    } catch { /* ignore */ }
  };

  referralBody.append(
    field("Name", referralNameInput),
    field("LinkedIn URL", referralLinkedInInput),
    field("Relation", referralRelationSelect),
    field("Context", referralContextInput, true),
    blurbContent,
    pastBlurbs,
  );

  const blurbSpinner = el("span", { className: "section-spinner" });
  const generateBlurbBtn = el("button", { className: "btn btn-primary btn-sm" }, "Generate Blurb") as HTMLButtonElement;

  if (isEdit && editId) {
    generateBlurbBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      generateBlurbBtn.textContent = "Generating...";
      generateBlurbBtn.setAttribute("disabled", "true");
      blurbSpinner.classList.add("active");
      try {
        await update(editId!, {
          referralName: referralNameInput.value.trim(),
          referralLinkedIn: referralLinkedInInput.value.trim(),
          referralRelation: referralRelationSelect.value,
          referralContext: referralContextInput.value.trim(),
        });
        const resp = await fetch("/api/generate-referral-blurb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: editId }),
        });
        if (!resp.ok) {
          const err = await resp.json();
          blurbContent.textContent = err.error || "Generation failed.";
          return;
        }
        const data = await resp.json();
        showResumeViewer(data.filename, data.content);
        await loadPastBlurbs();
      } catch {
        blurbContent.textContent = "Failed to connect to server.";
      } finally {
        generateBlurbBtn.textContent = "Generate Blurb";
        generateBlurbBtn.removeAttribute("disabled");
        blurbSpinner.classList.remove("active");
      }
    });

    loadPastBlurbs();
  } else {
    generateBlurbBtn.setAttribute("disabled", "true");
    generateBlurbBtn.title = "Save the application first to generate a blurb";
  }

  const referralSummary = el("summary", { className: "collapsible-header" },
    el("span", {}, "Referral", blurbSpinner),
    generateBlurbBtn,
  );
  referralSection.appendChild(referralSummary);
  referralSection.appendChild(referralBody);

  if (existing?.referralName) referralSection.setAttribute("open", "");

  container.appendChild(referralSection);

  // --- Cover Letter section ---
  const coverLetterSection = el("details", { className: "collapsible-section glass-card" });
  const coverLetterBody = el("div", { className: "collapsible-body" });

  const coverLetterNotesInput = el("textarea", {
    placeholder: "Additional notes for the cover letter (e.g., specific points to emphasize, company values that resonate with you)",
    className: "input input-textarea",
    rows: "3",
  }) as HTMLTextAreaElement;

  const coverLetterContent = el("div", { className: "guidelines-content" });
  const pastCoverLetters = el("div", { className: "past-resumes" });

  const loadPastCoverLetters = async () => {
    pastCoverLetters.innerHTML = "";
    if (!isEdit || !editId) return;
    try {
      const resp = await fetch(`/api/cover-letters/${editId}`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.coverLetters.length === 0) return;

      const table = el("table", { className: "md-table resume-table" });
      const thead = el("thead", {},
        el("tr", {},
          el("th", {}, "Generated"),
          el("th", {}, "Cover Letter"),
          el("th", {}, "")
        )
      );
      const tbody = el("tbody", {});

      for (const cl of data.coverLetters as { filename: string; version: number; timestamp: string }[]) {
        const viewBtn = el("a", { href: "#", className: "past-resume-link" }, "View");
        viewBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          const resp2 = await fetch(`/api/cover-letters/${editId}/${cl.filename}`);
          if (resp2.ok) {
            const d = await resp2.json();
            showResumeViewer(cl.filename, d.content);
          }
        });
        const localTime = cl.timestamp ? new Date(cl.timestamp).toLocaleString() : "—";
        tbody.appendChild(
          el("tr", {},
            el("td", {}, localTime),
            el("td", {}, cl.filename),
            el("td", {}, viewBtn)
          )
        );
      }

      table.append(thead, tbody);
      pastCoverLetters.appendChild(table);
    } catch { /* ignore */ }
  };

  coverLetterBody.append(coverLetterNotesInput, coverLetterContent, pastCoverLetters);

  const coverLetterSpinner = el("span", { className: "section-spinner" });
  const generateCoverLetterBtn = el("button", { className: "btn btn-primary btn-sm" }, "Generate") as HTMLButtonElement;

  if (isEdit && editId) {
    generateCoverLetterBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      generateCoverLetterBtn.textContent = "Generating...";
      generateCoverLetterBtn.setAttribute("disabled", "true");
      coverLetterSpinner.classList.add("active");
      try {
        const resp = await fetch("/api/generate-cover-letter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: editId, notes: coverLetterNotesInput.value.trim() }),
        });
        if (!resp.ok) {
          const err = await resp.json();
          coverLetterContent.textContent = err.error || "Generation failed.";
          return;
        }
        const data = await resp.json();
        showResumeViewer(data.filename, data.content);
        await loadPastCoverLetters();
      } catch {
        coverLetterContent.textContent = "Failed to connect to server.";
      } finally {
        generateCoverLetterBtn.textContent = "Generate";
        generateCoverLetterBtn.removeAttribute("disabled");
        coverLetterSpinner.classList.remove("active");
      }
    });

    loadPastCoverLetters();
  } else {
    generateCoverLetterBtn.setAttribute("disabled", "true");
    generateCoverLetterBtn.title = "Save the application first to generate a cover letter";
  }

  const coverLetterSummary = el("summary", { className: "collapsible-header" },
    el("span", {}, "Cover Letter", coverLetterSpinner),
    generateCoverLetterBtn,
  );
  coverLetterSection.appendChild(coverLetterSummary);
  coverLetterSection.appendChild(coverLetterBody);
  container.appendChild(coverLetterSection);

  // --- Custom Questions section ---
  const questionsSection = el("details", { className: "collapsible-section glass-card" });
  const questionsBody = el("div", { className: "collapsible-body" });
  const questionsList = el("div", { className: "questions-list" });

  const questionInput = el("input", {
    type: "text",
    placeholder: "Type a question...",
    className: "input",
  }) as HTMLInputElement;
  const addQuestionBtn = el("button", { className: "btn btn-primary btn-sm" }, "Add") as HTMLButtonElement;

  const renderQuestionCard = (q: { id: string; question: string; answer: string; generatedAt: string }) => {
    const card = el("div", { className: "question-card glass-card" });

    const questionText = el("div", { className: "question-text" }, q.question);

    const answerInput = el("textarea", {
      className: "input input-textarea",
      rows: "4",
      placeholder: "Answer will appear here...",
    }) as HTMLTextAreaElement;
    if (q.answer) answerInput.value = q.answer;

    const spinner = el("span", { className: "section-spinner" });
    const generateBtn = el("button", { className: "btn btn-primary btn-sm" }, "Generate") as HTMLButtonElement;
    const saveBtn = el("button", { className: "btn btn-secondary btn-sm" }, "Save") as HTMLButtonElement;
    const deleteBtn = el("button", { className: "btn btn-danger-glass btn-sm" }, "Delete") as HTMLButtonElement;

    generateBtn.addEventListener("click", async () => {
      generateBtn.textContent = "Generating...";
      generateBtn.setAttribute("disabled", "true");
      spinner.classList.add("active");
      try {
        const resp = await fetch(`/api/custom-questions/${editId}/${q.id}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (resp.ok) {
          const data = await resp.json();
          answerInput.value = data.answer;
        } else {
          const err = await resp.json();
          answerInput.value = err.error || "Generation failed.";
        }
      } catch {
        answerInput.value = "Failed to connect to server.";
      } finally {
        generateBtn.textContent = "Generate";
        generateBtn.removeAttribute("disabled");
        spinner.classList.remove("active");
      }
    });

    saveBtn.addEventListener("click", async () => {
      saveBtn.textContent = "Saving...";
      saveBtn.setAttribute("disabled", "true");
      try {
        await fetch(`/api/custom-questions/${editId}/${q.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: answerInput.value }),
        });
        saveBtn.textContent = "Saved!";
        setTimeout(() => { saveBtn.textContent = "Save"; }, 1500);
      } catch {
        saveBtn.textContent = "Error";
        setTimeout(() => { saveBtn.textContent = "Save"; }, 1500);
      } finally {
        saveBtn.removeAttribute("disabled");
      }
    });

    deleteBtn.addEventListener("click", async () => {
      if (!confirm("Delete this question?")) return;
      await fetch(`/api/custom-questions/${editId}/${q.id}`, { method: "DELETE" });
      card.remove();
    });

    const actions = el("div", { className: "question-actions" }, spinner, generateBtn, saveBtn, deleteBtn);
    card.append(questionText, answerInput, actions);
    questionsList.appendChild(card);
  };

  const loadQuestions = async () => {
    questionsList.innerHTML = "";
    if (!isEdit || !editId) return;
    try {
      const resp = await fetch(`/api/custom-questions/${editId}`);
      if (!resp.ok) return;
      const data = await resp.json();
      for (const q of data.questions) renderQuestionCard(q);
    } catch { /* ignore */ }
  };

  addQuestionBtn.addEventListener("click", async () => {
    const text = questionInput.value.trim();
    if (!text || !editId) return;
    addQuestionBtn.setAttribute("disabled", "true");
    try {
      const resp = await fetch(`/api/custom-questions/${editId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      if (resp.ok) {
        const q = await resp.json();
        renderQuestionCard(q);
        questionInput.value = "";
      }
    } finally {
      addQuestionBtn.removeAttribute("disabled");
    }
  });

  questionInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addQuestionBtn.click(); }
  });

  const addRow = el("div", { className: "question-add-row" }, questionInput, addQuestionBtn);
  questionsBody.append(addRow, questionsList);

  const questionsSummary = el("summary", { className: "collapsible-header" },
    el("span", {}, "Custom Questions"),
  );
  questionsSection.appendChild(questionsSummary);
  questionsSection.appendChild(questionsBody);

  if (isEdit && editId) {
    loadQuestions();
  } else {
    addQuestionBtn.setAttribute("disabled", "true");
    questionInput.setAttribute("disabled", "true");
    questionInput.placeholder = "Save the application first to add questions";
  }

  container.appendChild(questionsSection);

  if (bottomActions) {
    container.appendChild(bottomActions);
  }
}
