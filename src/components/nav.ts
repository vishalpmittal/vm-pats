import { el } from "../utils/dom";

interface NavItem {
  label: string;
  hash: string;
  children?: NavItem[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Job Applications", hash: "#/" },
  {
    label: "Guidelines",
    hash: "",
    children: [
      { label: "Director of Engineering", hash: "#/guidelines/director" },
      { label: "Sr. Manager of Engineering", hash: "#/guidelines/senior-manager" },
      { label: "Resume Gaps", hash: "#/gaps" },
      { label: "AI Transformation Leadership", hash: "#/guidelines/ai-transformation" },
    ],
  },
];

function isActive(hash: string): boolean {
  const current = window.location.hash || "#/";
  if (hash === "#/") return current === "#/" || current === "";
  return current.startsWith(hash);
}

export function renderNav(container: HTMLElement): void {
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

  for (const item of NAV_ITEMS) {
    if (item.children) {
      const sectionLabel = el("li", { className: "nav-section" }, item.label);
      list.appendChild(sectionLabel);

      for (const child of item.children) {
        const link = el("a", { href: child.hash, className: "nav-link" }, child.label);
        const li = el("li", { className: `nav-item nav-sub${isActive(child.hash) ? " active" : ""}` }, link);
        list.appendChild(li);
      }
    } else {
      const link = el("a", { href: item.hash, className: "nav-link" }, item.label);
      const li = el("li", { className: `nav-item${isActive(item.hash) ? " active" : ""}` }, link);
      list.appendChild(li);
    }
  }

  container.appendChild(list);
}
