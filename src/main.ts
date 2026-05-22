import { renderHome } from "./pages/home";
import { renderAddRole } from "./pages/add-role";
import { renderGuidelines } from "./pages/guidelines";
import { renderGuidelineEditor } from "./pages/guideline-editor";
import { renderGuidelinesList } from "./pages/guidelines-list";
import { renderGaps } from "./pages/gaps";
import { renderCompanies } from "./pages/companies";
import { renderMasterResume } from "./pages/master-resume";
import { renderNav } from "./components/nav";

const app = document.getElementById("app")!;
const nav = document.getElementById("nav")!;

async function route(): Promise<void> {
  renderNav(nav);
  const hash = window.location.hash;
  if (hash === "#/add") {
    await renderAddRole(app);
  } else if (hash.startsWith("#/edit/")) {
    await renderAddRole(app, hash.slice("#/edit/".length));
  } else if (hash === "#/master-resume") {
    await renderMasterResume(app);
  } else if (hash === "#/gaps") {
    await renderGaps(app);
  } else if (hash === "#/companies") {
    await renderCompanies(app);
  } else if (hash === "#/guidelines") {
    await renderGuidelinesList(app);
  } else if (hash === "#/guidelines/new") {
    await renderGuidelineEditor(app);
  } else if (hash.startsWith("#/guidelines/")) {
    await renderGuidelines(app, hash.slice("#/guidelines/".length));
  } else {
    await renderHome(app);
  }
}

window.addEventListener("hashchange", route);
route();
