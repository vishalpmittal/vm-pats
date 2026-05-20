export async function getAll() {
    const resp = await fetch("/api/jobs");
    const jobs = await resp.json();
    return jobs.sort((a, b) => b.applicationDate.localeCompare(a.applicationDate));
}
export async function add(job) {
    const resp = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job),
    });
    return resp.json();
}
export async function update(id, fields) {
    await fetch(`/api/jobs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
    });
}
export async function getById(id) {
    const jobs = await getAll();
    return jobs.find((j) => j.id === id);
}
export async function remove(id) {
    await fetch(`/api/jobs/${id}`, { method: "DELETE" });
}
export async function getByCompany(company) {
    const jobs = await getAll();
    const lower = company.toLowerCase();
    return jobs
        .filter((j) => j.company.toLowerCase() === lower)
        .sort((a, b) => b.applicationDate.localeCompare(a.applicationDate));
}
