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
      { label: "💼 In Interview", hash: "#/in-interview" },
      { label: "📤 Applied", hash: "#/applied" },
      { label: "🔍 Opportunities", hash: "#/" },
    ],
  },
  {
    label: "Resume",
    children: [
      { label: "📄 Master Resume", hash: "#/master-resume" },
      { label: "📊 Resume Gaps", hash: "#/gaps" },
      { label: "📋 Guidelines", hash: "#/guidelines" },
    ],
  },
  {
    label: "Companies",
    children: [
      { label: "🏢 All Companies", hash: "#/companies" },
    ],
  },
  {
    label: "Configuration",
    children: [
      { label: "⚙️ Settings", hash: "#/settings" },
    ],
  },
];

function isActive(hash: string): boolean {
  const current = window.location.hash || "#/";
  if (hash === "#/") return current === "#/" || current === "";
  const active = current.startsWith(hash);
  console.log(`[NAV] Checking "${hash}" against "${current}" = ${active}`);
  return active;
}

export async function renderNav(container: HTMLElement): Promise<void> {
  container.innerHTML = "";

  const layout = document.getElementById("layout")!;
  const collapsed = layout.classList.contains("nav-collapsed");

  // Top section with brand
  const navTop = el("div", { className: "nav-top" });
  const logo = el("div", { className: "nav-logo" });
  logo.innerHTML = `
    <svg viewBox="0 0 32 32" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="patsLogoGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stop-color="#6366f1"/>
          <stop offset="1" stop-color="#8b5cf6"/>
        </linearGradient>
      </defs>
      <rect x="3" y="9" width="26" height="19" rx="4" fill="url(#patsLogoGrad)"/>
      <path d="M11 9V7.5A2.5 2.5 0 0 1 13.5 5h5A2.5 2.5 0 0 1 21 7.5V9" stroke="url(#patsLogoGrad)" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M11.5 18.5l3 3 6-6.5" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  const brand = el("div", { className: "nav-brand" }, "PATS");
  navTop.appendChild(logo);
  navTop.appendChild(brand);
  container.appendChild(navTop);

  const list = el("ul", { className: "nav-list" });

  for (let i = 0; i < NAV.length; i++) {
    const entry = NAV[i];
    if (isSection(entry)) {
      // Add separator before each section except the first
      if (i > 0) {
        list.appendChild(el("li", { className: "nav-separator" }));
      }

      list.appendChild(el("li", { className: "nav-section" }, entry.label));
      for (const child of entry.children) {
        const active = isActive(child.hash);
        const firstSpace = child.label.indexOf(" ");
        const icon = child.label.slice(0, firstSpace);
        const text = child.label.slice(firstSpace + 1);
        const link = el(
          "a",
          { href: child.hash, className: "nav-link", title: text },
          el("span", { className: "nav-icon" }, icon),
          el("span", { className: "nav-text" }, text),
        );
        const li = el("li", { className: `nav-item nav-sub${active ? " active" : ""}` }, link);
        if (active) {
          console.log(`[NAV] Applied active class to: ${child.label}`);
        }
        list.appendChild(li);
      }
    } else {
      const link = el("a", { href: entry.hash, className: "nav-link" }, entry.label);
      const li = el("li", { className: `nav-item${isActive(entry.hash) ? " active" : ""}` }, link);
      list.appendChild(li);
    }
  }

  container.appendChild(list);

  // Bottom section with collapse toggle
  const navBottom = el("div", { className: "nav-bottom" });
  const toggleIcon = collapsed ? "→|" : "|←";
  const toggle = el(
    "button",
    { className: "nav-toggle", title: collapsed ? "Expand" : "Collapse" },
    toggleIcon,
  );
  toggle.addEventListener("click", () => {
    layout.classList.toggle("nav-collapsed");
    renderNav(container);
  });
  navBottom.appendChild(toggle);
  container.appendChild(navBottom);
}
