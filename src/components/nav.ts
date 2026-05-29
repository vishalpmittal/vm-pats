import { el } from "../utils/dom";

interface NavItem {
  label: string;
  hash: string;
}

const STATIC_ITEMS: NavItem[] = [
  { label: "My Applications", hash: "#/" },
  { label: "Master Resume", hash: "#/master-resume" },
  { label: "Resume Gaps", hash: "#/gaps" },
  { label: "Companies", hash: "#/companies" },
];

function isActive(hash: string): boolean {
  const current = window.location.hash || "#/";
  if (hash === "#/") return current === "#/" || current === "";
  return current.startsWith(hash);
}

async function fetchGuidelines(): Promise<NavItem[]> {
  try {
    const resp = await fetch("/api/guidelines");
    const data: { slug: string; title: string }[] = await resp.json();
    return data.map(g => ({ label: g.title, hash: `#/guidelines/${g.slug}` }));
  } catch {
    return [];
  }
}

export async function renderNav(container: HTMLElement): Promise<void> {
  container.innerHTML = "";

  const layout = document.getElementById("layout")!;
  const collapsed = layout.classList.contains("nav-collapsed");

  const toggle = el("button", { className: "nav-toggle", title: collapsed ? "Expand" : "Collapse" }, collapsed ? ">" : "<");
  toggle.addEventListener("click", () => {
    layout.classList.toggle("nav-collapsed");
    renderNav(container);
  });

  const brand = el("div", { className: "nav-brand" }, collapsed ? "P" : "PATS");
  container.appendChild(brand);
  container.appendChild(toggle);

  if (collapsed) return;

  const list = el("ul", { className: "nav-list" });

  for (const item of STATIC_ITEMS) {
    const link = el("a", { href: item.hash, className: "nav-link" }, item.label);
    const li = el("li", { className: `nav-item${isActive(item.hash) ? " active" : ""}` }, link);
    list.appendChild(li);
  }

  const addBtn = el("button", { className: "nav-add-btn", title: "Add guideline" }, "+");
  addBtn.addEventListener("click", () => { window.location.hash = "#/guidelines/new"; });

  const sectionLink = el("a", { href: "#/guidelines", className: "nav-section-link" }, "Guidelines");
  const sectionLabel = el("li", { className: `nav-section${window.location.hash === "#/guidelines" ? " nav-section-active" : ""}` },
    sectionLink,
    addBtn
  );
  list.appendChild(sectionLabel);

  const guidelines = await fetchGuidelines();
  for (const g of guidelines) {
    const link = el("a", { href: g.hash, className: "nav-link" }, g.label);
    const li = el("li", { className: `nav-item nav-sub${isActive(g.hash) ? " active" : ""}` }, link);
    list.appendChild(li);
  }

  container.appendChild(list);
}
