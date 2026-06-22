import { el } from "../utils/dom";

interface NavLink {
  label: string;
  hash: string;
}

interface NavSection {
  label: string;
  children: NavLink[];
}

type NavEntry = NavLink | NavSection;

function isSection(entry: NavEntry): entry is NavSection {
  return "children" in entry;
}

const NAV: NavEntry[] = [
  {
    label: "Jobs",
    children: [
      { label: "In Interview", hash: "#/in-interview" },
      { label: "Applied", hash: "#/applied" },
      { label: "Opportunities", hash: "#/" },
    ],
  },
  {
    label: "Resume",
    children: [
      { label: "Master Resume", hash: "#/master-resume" },
      { label: "Resume Gaps", hash: "#/gaps" },
      { label: "Guidelines", hash: "#/guidelines" },
    ],
  },
  { label: "Companies", hash: "#/companies" },
  {
    label: "Configuration",
    children: [
      { label: "Settings", hash: "#/settings" },
    ],
  },
];

function isActive(hash: string): boolean {
  const current = window.location.hash || "#/";
  if (hash === "#/") return current === "#/" || current === "";
  return current.startsWith(hash);
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

  for (const entry of NAV) {
    if (isSection(entry)) {
      list.appendChild(el("li", { className: "nav-section" }, entry.label));
      for (const child of entry.children) {
        const link = el("a", { href: child.hash, className: "nav-link" }, child.label);
        const li = el("li", { className: `nav-item nav-sub${isActive(child.hash) ? " active" : ""}` }, link);
        list.appendChild(li);
      }
    } else {
      const link = el("a", { href: entry.hash, className: "nav-link" }, entry.label);
      const li = el("li", { className: `nav-item${isActive(entry.hash) ? " active" : ""}` }, link);
      list.appendChild(li);
    }
  }

  container.appendChild(list);
}
