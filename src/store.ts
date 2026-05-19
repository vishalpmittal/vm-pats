import type { JobApplication } from "./types";

export async function getAll(): Promise<JobApplication[]> {
  const resp = await fetch("/api/jobs");
  const jobs: JobApplication[] = await resp.json();
  return jobs.sort((a, b) => b.applicationDate.localeCompare(a.applicationDate));
}

export async function add(job: Omit<JobApplication, "id">): Promise<JobApplication> {
  const resp = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  });
  return resp.json();
}

export async function update(id: string, fields: Partial<Omit<JobApplication, "id">>): Promise<void> {
  await fetch(`/api/jobs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
}

export async function getById(id: string): Promise<JobApplication | undefined> {
  const jobs = await getAll();
  return jobs.find((j) => j.id === id);
}

export async function remove(id: string): Promise<void> {
  await fetch(`/api/jobs/${id}`, { method: "DELETE" });
}

export async function getByCompany(company: string): Promise<JobApplication[]> {
  const jobs = await getAll();
  const lower = company.toLowerCase();
  return jobs
    .filter((j) => j.company.toLowerCase() === lower)
    .sort((a, b) => b.applicationDate.localeCompare(a.applicationDate));
}
