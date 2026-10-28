export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const fmt = (n) =>
  new Intl.NumberFormat("en-US", {
    notation: n >= 100000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(n || 0);
export const money = (n) =>
  n == null
    ? "Not priced"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: n < 1 ? 4 : 2,
      }).format(n);
export const date = (t) =>
  t
    ? new Date(t).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not synced";
export const initials = (n) =>
  (n || "?")
    .split(/[\s/]+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const paths = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.9 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  work: "M3 7h7l2-3h9v16H3z",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  review: "M12 3l10 18H2z M12 9v5 M12 17v1",
  connections:
    "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  budgets: "M3 5h18v15H3z M3 9h18 M15 14h3 M6 2v6",
  savings: "M4 19l5-6 4 3 7-11 M15 5h5v5",
  advanced: "M12 3v18 M3 12h18 M5 5l14 14 M5 19L19 5",
  guide: "M4 3h12l4 4v14H4z M15 3v5h5 M8 12h8 M8 16h6",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  plus: "M12 5v14 M5 12h14",
  download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6",
  chevron: "M9 5l7 7-7 7",
  check: "M5 12l4 4L19 6",
  close: "M6 6l12 12 M6 18L18 6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
  github:
    "M9 19c-5 1-5-2-7-2 M9 22v-4c-5-1-6-6-3-9-1-2 0-5 0-5 2 0 3 1 3 1 2-1 4-1 6 0 0 0 1-1 3-1 0 0 1 3 0 5 3 3 2 8-3 9v4",
  bolt: "M13 2L3 14h8l-1 8 11-13h-8z",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  refresh:
    "M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-2l2 3 M18 17a7 7 0 0 1-12 2l-2-3",
  shield: "M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6z M8 12l3 3 5-6",
  spark: "M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
  external: "M14 3h7v7 M21 3L10 14 M10 3H3v18h18v-7",
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.work}"/></svg>`;
export const tag = (label, type = "") =>
  `<span class="tag ${type}">${esc(label)}</span>`;
export const button = (label, action, cls = "", id = "") =>
  `<button class="${cls}" data-action="${action}"${id ? ` data-id="${esc(id)}"` : ""}>${label}</button>`;
export const empty = (
  title,
  detail,
  action = "account",
  label = "Add an account",
) =>
  `<div class="empty">${icon("work")}<h3>${esc(title)}</h3><p>${esc(detail)}</p>${action ? button(label, action, "primary") : ""}</div>`;
export const avatar = (name, style = "") =>
  `<span class="avatar" ${style ? `style="${style}"` : ""}>${esc(initials(name))}</span>`;
export const info = (term) =>
  `<button class="info" aria-label="Explain ${esc(term)}" data-action="info" data-id="${esc(term)}">i</button>`;
export const field = (label, name, value = "", type = "text", extra = "") =>
  `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
export const area = (label, name, value = "", extra = "") =>
  `<label>${esc(label)}<textarea name="${name}" ${extra}>${esc(value)}</textarea></label>`;
export const option = (value, label, selected = "") =>
  `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(label)}</option>`;
export const select = (label, name, options) =>
  `<label>${esc(label)}<select name="${name}">${options}</select></label>`;
export const terms = {
  "Observed tokens":
    "Input plus output tokens reported by managed AI requests. GitHub records have no token count. Unknown outcomes stay unknown and hold their token reservation. Imported reports remain separate.",
  "Estimated API cost":
    "Known usage multiplied by the model rates you configure per million tokens. The result is a USD estimate, not a provider invoice. Missing rates are shown as Not priced. Subscriptions are outside this estimate.",
  "Active accounts":
    "Accounts with at least one observed event in the selected date range. Account attribution is owner-selected or matched to a GitHub username. Activity does not measure employee value.",
  "Needs review":
    "Open questions about missing account mappings, unknown AI outcomes or incomplete responses. A review flag requests investigation and is not a misconduct verdict.",
  "Token allowance":
    "A ceiling for managed AI requests routed through the connected backend. Tokens are reserved before sending a request. It does not control ordinary ChatGPT, GitHub, Copilot or other apps.",
  "Reserved tokens":
    "Capacity held for an AI request before it is sent. It is released when known usage is recorded. An unknown outcome keeps the reservation until an owner checks provider records and reconciles it.",
  "Project brief":
    "A summary of retained repository activity and explicitly attributed AI requests. Project names come from connected repositories or declared work labels. It cannot establish completion, quality or blockers without human evidence.",
  "Source coverage":
    "Accounts and organizations discover accessible owned repositories automatically, with a 500-repository discovery bound per source. Two public repositories or five authenticated repositories are checked per rotating pass. Each activity snapshot includes up to 100 default-branch commits and 100 recently updated pull requests. Coverage can be partial.",
  "Net cash benefit":
    "Baseline API spending minus improved API spending, the Worklens fee and hosting. Review-time value is shown separately. A fair before/after comparison requires comparable accepted work and quality.",
  "Account pause":
    "Prevents future managed AI requests for the selected account. It does not stop GitHub collection or AI use outside Worklens.",
  "Local workspace":
    "Real records saved in this browser only, separately from example data. They are not sent to GitHub or shared with other visitors. Export a backup before clearing browser storage.",
  "Connected backend":
    "An owner-operated server with SQLite storage. It protects provider credentials and enforces budgets. GitHub Pages serves the interface only; backend deployment is a separate operator step.",
  "Imported reports":
    "CSV records supplied by you. They do not become live observations. Their tokens are displayed separately and do not change managed-request budget counters.",
  "Knowledge gained":
    "Requires a domain assessment before and after training, with comparable rubrics and a human reviewer. Token usage alone cannot establish learning.",
  "Accepted work":
    "Work that meets a company-defined quality rubric. It comes from work records and reviewers, not from GitHub commit counts or AI usage.",
};
