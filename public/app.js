import {
  emptyWorkspace,
  validateWorkspace,
  applyCommand,
  copy,
  uid,
  projectBriefs,
  totals,
  eventCost,
  safeUrl,
  savings,
  usedTokens,
  assert,
} from "./shared/domain.js";
import { collectRepository } from "./shared/github.js";
import { HEADERS, toCSV, importEvents } from "./shared/csv.js";
import { demoWorkspace } from "./demo.js";
import { shell, activityTable } from "./views.js";
import {
  esc,
  fmt,
  money,
  date,
  avatar,
  tag,
  button,
  icon,
  info,
  field,
  area,
  select,
  option,
  terms,
} from "./ui.js";
const KEY = "worklens.workspace.v1",
  MODE = "worklens.mode.v1",
  REMOTE = "worklens.backend.v1";
const app = document.querySelector("#app"),
  modal = document.querySelector("#modal");
let mode = localStorage.getItem(MODE) || "demo",
  s,
  capabilities = {},
  backend = { url: "", token: "" },
  filter = "",
  source = "",
  accountFilter = "",
  range = "30",
  planningTab = "tasks",
  busy = false,
  toastTimer,
  syncing = false;
let demo = demoWorkspace();
function readLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? validateWorkspace(JSON.parse(raw)) : emptyWorkspace();
  } catch (error) {
    toast(
      "Saved workspace could not be read. Export browser storage before replacing it.",
    );
    throw error;
  }
}
try {
  s = mode === "demo" ? demo : readLocal();
  backend = JSON.parse(
    sessionStorage.getItem(REMOTE) || '{"url":"","token":""}',
  );
  if (mode === "remote" && !backend.url) mode = "local";
} catch {
  s = emptyWorkspace();
  mode = "demo";
  s = demo;
}
const pages = [
  "overview",
  "people",
  "work",
  "activity",
  "review",
  "connections",
  "budgets",
  "savings",
  "advanced",
  "guide",
  "updates",
];
function page() {
  const id = location.hash.slice(1).split("?")[0];
  return pages.includes(id) ? id : "overview";
}
function context() {
  const cutoff = range === "all" ? 0 : Date.now() - Number(range) * 86400000;
  return {
    s,
    page: page(),
    mode,
    capabilities,
    filter,
    source,
    accountFilter,
    range,
    planningTab,
    events: s.events.filter(
      (e) => e.source !== "import" && Date.parse(e.time) >= cutoff,
    ),
  };
}
function render() {
  const focus = document.activeElement?.id,
    selection = document.activeElement?.selectionStart;
  app.innerHTML = shell(context());
  if (focus) {
    const target = document.getElementById(focus);
    target?.focus();
    if (typeof selection === "number" && target?.setSelectionRange)
      target.setSelectionRange(selection, selection);
  }
  if (page() === "savings") updateSavings();
}
function toast(message) {
  const t = document.querySelector("#toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 5500);
}
function dialog(title, body) {
  modal.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button class="icon" data-action="close" aria-label="Close dialog">${icon("close")}</button></div><div class="modal-body">${body}</div>`;
  if (!modal.open) modal.showModal();
  modal.querySelector("input,select,textarea,button")?.focus();
}
function form(title, body, save, submit = "Save", onCancel) {
  const revision = s.revision;
  dialog(
    title,
    `<form id="dialog-form">${body}<div class="form-error" role="alert"></div><div class="form-footer"><button type="button" data-action="close" class="ghost">Cancel</button><button type="submit" class="primary">${submit}</button></div></form>`,
  );
  modal.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitter = e.submitter;
    submitter.disabled = true;
    const target = e.currentTarget;
    try {
      await save(Object.fromEntries(new FormData(target)), revision);
      if (modal.contains(target)) modal.close();
    } catch (error) {
      target.querySelector(".form-error").textContent = error.message;
    } finally {
      submitter.disabled = false;
    }
  });
}
async function api(path, data, opts = {}) {
  assert(backend.url && backend.token, "Connect your backend first.");
  const response = await fetch(backend.url + path, {
    method: data ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${backend.token}`,
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(opts.long ? 100000 : 45000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || `Server returned ${response.status}`);
  return result;
}
async function refresh() {
  if (mode !== "remote") return;
  const r = await api("/api/workspace");
  s = validateWorkspace(r.workspace);
  capabilities = r.capabilities;
  render();
}
async function command(type, data, revision = s.revision) {
  if (mode === "remote") {
    const r = await api("/api/command", { type, data, revision });
    s = validateWorkspace(r.workspace);
  } else {
    if (mode === "local") {
      const latest = readLocal();
      assert(
        latest.revision === revision,
        "Workspace changed in another tab. Refresh before saving.",
      );
    }
    const next = applyCommand(s, { type, data, revision });
    if (mode === "local") localStorage.setItem(KEY, JSON.stringify(next));
    else demo = next;
    s = next;
  }
  render();
  return s;
}
function requireReal() {
  if (mode === "demo")
    throw new Error(
      "Switch to your own workspace before connecting real sources. Example data stays separate.",
    );
}
function changeMode(next) {
  mode = next;
  localStorage.setItem(MODE, mode);
  s = mode === "demo" ? demo : readLocal();
  filter = "";
  render();
  toast(
    mode === "demo"
      ? "Showing fictional example data."
      : "Your own workspace is ready. Start by adding an account.",
  );
}
function download(name, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportEvents(events = s.events) {
  const rows = [
    [
      "id",
      "source",
      "time",
      "account",
      "project",
      "work",
      "model",
      "inputTokens",
      "outputTokens",
      "estimatedUSD",
      "reviewStatus",
      "reviewNote",
      "sourceUrl",
    ],
    ...events.map((e) => [
      e.id,
      e.source,
      e.time,
      s.accounts.find((a) => a.id === e.accountId)?.name || e.author || "",
      e.project,
      e.title,
      e.model,
      e.inputTokens,
      e.outputTokens,
      eventCost(e, s.settings.rates),
      e.review?.status,
      e.review?.note,
      e.url,
    ]),
  ];
  download("worklens-events.csv", toCSV(rows), "text/csv");
  toast(
    `Exported ${events.length} records. Cost estimates use current configured rates.`,
  );
}
function accountForm(id) {
  const a = s.accounts.find((a) => a.id === id);
  form(
    a ? "Edit account" : "Add an account",
    `<div class="form-grid">${field("Full name or service name", "name", a?.name || "", "text", 'required maxlength="100"')}${field("Team", "team", a?.team || "", "text", 'required maxlength="100"')}${field("Role", "role", a?.role || "", "text", 'required maxlength="100"')}${field("GitHub username (optional)", "github", a?.github || "", "text", 'pattern="[a-zA-Z0-9-]{1,39}" maxlength="39"')}${field("Monthly managed token allowance", "limit", a?.limit ?? 250000, "number", 'required min="0" step="1"')}</div><p class="form-note mt">Use the exact GitHub login without @. The owner assigns this mapping; it is not employee authentication.</p>`,
    async (d, revision) => {
      await command(
        "account",
        { ...d, id: a?.id, limit: Number(d.limit) },
        revision,
      );
      toast("Account saved. Matching retained GitHub records were mapped.");
    },
  );
}
function profile(id) {
  const a = s.accounts.find((a) => a.id === id);
  if (!a) return;
  const events = s.events.filter((e) => e.accountId === id),
    t = totals(s, events);
  dialog(
    a.name,
    `<div class="person-top">${avatar(a.name)}<div><h3>${esc(a.team)}</h3><p>${esc(a.role)} ${a.github ? "· @" + esc(a.github) : ""}</p></div></div><div class="evidence"><div><dt>Observed tokens</dt><dd>${fmt(t.tokens)}</dd></div><div><dt>Estimated API cost</dt><dd>${t.priced ? money(t.cost) : "Not priced"}</dd></div><div><dt>Monthly managed allowance</dt><dd>${fmt(usedTokens(s, id))} / ${fmt(a.limit)}</dd></div><div><dt>Open review questions</dt><dd>${t.reviews}</dd></div></div><h3>Recent work evidence</h3>${
      events
        .slice(0, 6)
        .map(
          (e) =>
            `<p>${button(esc(e.title), "event", "link", e.id)}<br><small>${esc(e.project)} · ${esc(date(e.time))}</small></p>`,
        )
        .join("") || "<p>No observed records yet.</p>"
    }<div class="form-footer">${button("Edit account", "account", "primary", id)}</div>`,
  );
}
function eventDialog(id) {
  const e = s.events.find((e) => e.id === id);
  if (!e) return;
  form(
    "Activity evidence",
    `<h3 style="margin-top:0">${esc(e.title)}</h3><dl class="evidence"><div><dt>Account / author</dt><dd>${esc(s.accounts.find((a) => a.id === e.accountId)?.name || e.author || "Unassigned")}</dd></div><div><dt>Source</dt><dd>${esc(e.source)} ${esc(e.kind || "")}</dd></div><div><dt>Project</dt><dd>${esc(e.project || "Unassigned")}</dd></div><div><dt>Recorded time</dt><dd>${esc(date(e.time))}</dd></div><div><dt>Input / output tokens</dt><dd>${e.inputTokens == null ? (e.source === "github" ? "Not supplied by GitHub" : "Unknown") : `${fmt(e.inputTokens)} / ${fmt(e.outputTokens)}`}</dd></div><div><dt>Estimated API cost</dt><dd>${money(eventCost(e, s.settings.rates))}</dd></div><div><dt>Request status</dt><dd>${esc(e.status || e.state || "Observed")}</dd></div><div><dt>Usage attribution</dt><dd>${esc(e.attribution || (e.source === "github" ? "GitHub source" : "Provider-reported"))}</dd></div></dl>${e.issue ? `<div class="banner warning">${esc(e.issue)}</div>` : ""}${safeUrl(e.url) ? `<p><a class="text-green" href="${esc(safeUrl(e.url))}" target="_blank" rel="noopener noreferrer">Open original source record ↗</a></p>` : mode === "demo" ? "<p>Example record. No real source link is attached.</p>" : ""}<div class="form-grid">${select("Review decision", "status", ["open", "reviewed", "expected"].map((v) => option(v, { open: "Keep open", reviewed: "Reviewed", expected: "Expected activity" }[v], e.review?.status || "open")).join(""))}<div class="full">${area("Reason / evidence note", "note", e.review?.note || "", 'required maxlength="2000"')}</div></div>${e.status === "unknown" ? `<p class="form-note mt">${fmt(e.reservedTokens)} tokens remain reserved. Marking this event reviewed does not release them.</p>${button("Reconcile verified provider usage", "reconcile", "small mt", e.id)}` : ""}`,
    async (d, revision) => {
      await command("review", { id, ...d }, revision);
      toast("Review saved with this event.");
    },
    "Save review",
  );
}
function projectDialog(name) {
  const p = projectBriefs(s).find((p) => p.name === name);
  if (!p) return;
  dialog(
    name,
    `<p>${esc(p.description)}</p><div class="banner">${icon("work")}<span>${esc(p.brief)}</span></div><div class="evidence"><div><dt>Observed tokens</dt><dd>${fmt(p.stats.tokens)}</dd></div><div><dt>Estimated API cost</dt><dd>${p.stats.priced ? money(p.stats.cost) : "Not priced"}</dd></div><div><dt>Contributors with mapped accounts</dt><dd>${p.people.map((id) => esc(s.accounts.find((a) => a.id === id)?.name)).join(", ") || "None mapped"}</dd></div><div><dt>Source coverage</dt><dd>${esc(p.coverage || "Declared AI work labels only")}</dd></div></div><h3>Latest evidence</h3>${
      p.events
        .slice(0, 8)
        .map(
          (e) =>
            `<p>${button(esc(e.title), "event", "link", e.id)}<br><small>${esc(date(e.time))} · ${esc(e.source)} ${e.state ? "· " + esc(e.state) : ""}</small></p>`,
        )
        .join("") || "<p>No activity collected yet.</p>"
    }<p class="note">This brief describes observed activity. Completion, blockers and quality require additional evidence.</p>`,
  );
}
function connectForm() {
  if (mode === "demo") {
    dialog(
      "Start with your own workspace",
      "<p>Real connections belong in your own workspace, separately from this fictional example.</p>" +
        button("Use my own data", "real", "primary"),
    );
    return;
  }
  form(
    "Connect GitHub",
    `${field("Repository", "repository", "", "text", 'required placeholder="owner/repository" maxlength="140"')}${mode === "remote" ? `<div class="mt">${field("Read-only token (private repositories only)", "token", "", "password", 'autocomplete="off" maxlength="1000"')}</div><p class="form-note mt">Only the backend retains a private token, encrypted and bound to this connection. Grant only Contents: read and Pull requests: read.</p>` : '<p class="form-note mt">Public repositories need no token. To connect a private repository, configure the included backend first.</p>'}<p class="form-note mt">Worklens reads metadata, authors, titles and source links. It does not read AI token counts from GitHub.</p>`,
    async (d, revision) => {
      requireReal();
      if (mode === "remote") {
        const r = await api("/api/connection", { ...d, revision });
        s = validateWorkspace(r.workspace);
        render();
      } else {
        const found = await collectRepository(d.repository, s.accounts);
        assert(!found.private, "Private repositories require the backend.");
        await command(
          "connection",
          {
            repository: d.repository,
            description: found.description,
            private: false,
          },
          revision,
        );
        const c = s.connections.find(
          (c) => c.repository === d.repository.toLowerCase(),
        );
        await command("github", { id: c.id, ...found });
      }
      toast("Repository connected. Open its project to verify the evidence.");
    },
    "Verify & connect",
  );
}
async function sync(id, quiet = false) {
  if (mode === "demo") {
    if (!quiet)
      toast(
        "This is example data. Connect a real repository in your own workspace.",
      );
    return;
  }
  if (syncing) return;
  syncing = true;
  try {
    if (mode === "remote") {
      const r = await api("/api/sync", { id });
      s = validateWorkspace(r.workspace);
      render();
    } else {
      const c = s.connections.find((c) => c.id === id);
      assert(c, "Connection no longer exists.");
      const found = await collectRepository(c.repository, s.accounts);
      await command("github", { id, ...found });
    }
    if (!quiet) toast("Sync complete. Source IDs prevent duplicate records.");
  } catch (error) {
    if (!quiet) throw error;
  } finally {
    syncing = false;
  }
}
function backendForm() {
  form(
    "Connect your backend",
    `${field("Backend HTTPS address", "url", backend.url, "url", 'required placeholder="https://your-worklens-server.example"')}<div class="mt">${field("Owner access token", "token", "", "password", 'required autocomplete="off" minlength="24"')}</div><p class="form-note mt">Deploy the included server first. Its address must use HTTPS, except localhost for development. Your owner token stays in this tab’s session storage. Provider keys are configured on the server and never entered here.</p><p class="form-note">Connecting loads the server workspace. Your browser workspace remains saved separately.</p>`,
    async (d) => {
      const url = new URL(d.url);
      assert(
        url.protocol === "https:" ||
          (url.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(url.hostname)),
        "Use HTTPS, or localhost for development.",
      );
      assert(
        !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          ["", "/"].includes(url.pathname),
        "Enter the backend origin without a path, query or credentials.",
      );
      const previous = backend;
      backend = { url: url.origin, token: d.token };
      try {
        const r = await api("/api/workspace");
        s = validateWorkspace(r.workspace);
        capabilities = r.capabilities;
        sessionStorage.setItem(REMOTE, JSON.stringify(backend));
        mode = "remote";
        localStorage.setItem(MODE, mode);
        render();
        toast("Connected to your owner workspace.");
      } catch (error) {
        backend = previous;
        throw error;
      }
    },
    "Verify & connect",
  );
}
function rateForm(model) {
  const r = s.settings.rates.find((r) => r.model === model);
  form(
    "Model price estimate",
    `<div class="form-grid"><div class="full">${field("Exact model name", "model", r?.model || "", "text", 'required maxlength="100"')}</div>${field("USD per million input tokens", "input", r?.input ?? "", "number", 'required min="0" step="any"')}${field("USD per million output tokens", "output", r?.output ?? "", "number", 'required min="0" step="any"')}</div><p class="form-note mt">Use your current provider rates. The app does not fetch or guarantee prices. Saved rates recalculate historical estimates.</p>`,
    async (d, revision) => {
      const rates = s.settings.rates.filter(
        (x) => x.model !== (r?.model || d.model),
      );
      rates.push({
        model: d.model,
        input: Number(d.input),
        output: Number(d.output),
      });
      await command("settings", { ...s.settings, rates }, revision);
      toast("Price estimate saved.");
    },
  );
}
function aiForm() {
  if (mode !== "remote" || !capabilities.ai) {
    dialog(
      "Managed AI needs a backend",
      `<p>The server must be deployed with an authorized OpenAI API key. The public Pages app never stores provider keys.</p><p>You can already use public GitHub sources, planning, CSV imports and the savings worksheet.</p>${button("Connect backend", "backend", "primary")} <a href="#guide" data-action="close" class="text-green">Setup guide →</a>`,
    );
    return;
  }
  assert(s.accounts.length, "Add an account before sending a tracked request.");
  const requestId = uid();
  form(
    "Try tracked AI",
    `<div class="form-grid">${select("Attributed account", "accountId", s.accounts.map((a) => option(a.id, a.name + (a.paused ? " · paused" : ""))).join(""))}${field("Project / repository", "project", "", "text", 'required maxlength="180" placeholder="owner/repository or project name"')}<div class="full">${field("Short work label", "title", "", "text", 'required maxlength="500" placeholder="Draft renewal reply"')}</div><div class="full">${area("Prompt sent to your configured provider", "prompt", "", 'required maxlength="12000"')}</div>${field("Maximum output tokens", "maxOutputTokens", 512, "number", 'required min="16" max="4096" step="1"')}</div><p class="form-note mt">This sends a paid request to ${esc(capabilities.model)} through your backend. API billing is separate from ChatGPT. Worklens retains usage metadata and the work label, not the prompt or answer. The answer appears once in this dialog.</p>`,
    async (d) => {
      const r = await api(
        "/api/ai",
        { ...d, maxOutputTokens: Number(d.maxOutputTokens), id: requestId },
        { long: true },
      );
      s = validateWorkspace(r.workspace);
      render();
      dialog(
        "Tracked AI result",
        `${r.duplicate ? "<p>This request ID already exists. No new provider request was sent. The response body is not retained.</p>" : `<p>Reported usage is now in the ledger. Copy the answer if needed; Worklens does not save it.</p><div class="answer">${esc(r.answer || "No text returned. Inspect the request status in the activity ledger.")}</div>`}<div class="form-footer">${button("Close", "close", "primary")}</div>`,
      );
    },
    "Send tracked request",
  );
}
function reconcileForm(id) {
  if (mode !== "remote") {
    toast("Provider reconciliation is available on the connected backend.");
    return;
  }
  form(
    "Reconcile an unknown outcome",
    `<div class="banner warning">Verify usage against provider records first. Zero means you verified that no usage was charged.</div><div class="form-grid">${field("Verified input tokens", "inputTokens", "", "number", 'required min="0" step="1"')}${field("Verified output tokens", "outputTokens", "", "number", 'required min="0" step="1"')}<div class="full">${area("Provider record reference and explanation", "note", "", 'required maxlength="2000"')}</div></div>`,
    async (d) => {
      const r = await api("/api/reconcile", {
        id,
        note: d.note,
        inputTokens: Number(d.inputTokens),
        outputTokens: Number(d.outputTokens),
      });
      s = validateWorkspace(r.workspace);
      render();
      toast(
        "Verified usage recorded and labeled owner-entered. Reservation released.",
      );
    },
  );
}
function planningForm(id, type) {
  const item = s.planning.find((p) => p.id === id);
  const kind = item?.type || type || planningTab;
  form(
    item ? "Edit planning record" : "Add planning record",
    `${field("Title", "title", item?.title || "", "text", 'required maxlength="180"')}<div class="mt">${area("Owner, evidence, conditions and next step", "detail", item?.detail || "", 'required maxlength="4000"')}</div><div class="mt">${select("Status", "status", ["Planned", "In progress", "Ready", "Reviewed", "Done"].map((v) => option(v, v, item?.status || "Planned")).join(""))}</div><p class="form-note mt">This is a reviewer-entered record. Include where the evidence came from and avoid deriving skill or performance from token counts alone.</p>`,
    async (d, revision) => {
      await command("planning", { ...d, id: item?.id, type: kind }, revision);
      toast("Planning record saved.");
    },
  );
}
function importDialog() {
  requireReal();
  form(
    "Validate & import CSV",
    `<label>Authorized CSV file<input class="file-input" type="file" name="file" accept=".csv,text/csv" required></label><p class="form-note mt">Imports are validated before any records are written. Stable row IDs prevent duplication. Use account IDs from your workspace backup. Imported records remain separate from the live ledger.</p>`,
    async (_, revision) => {
      const file = modal.querySelector("input[type=file]").files[0];
      assert(file && file.size <= 10e6, "Choose a CSV up to 10 MB.");
      const events = importEvents(await file.text());
      for (const e of events)
        assert(
          !e.accountId || s.accounts.some((a) => a.id === e.accountId),
          `Unknown account ID: ${e.accountId}`,
        );
      await command("import", { events }, revision);
      toast(
        `Imported ${events.length} validated records into the separate ledger.`,
      );
    },
    "Import records",
  );
}
function restoreDialog() {
  requireReal();
  form(
    "Restore workspace backup",
    `<label>Workspace JSON backup<input class="file-input" type="file" accept=".json,application/json" required></label><p class="form-note mt">This replaces the current workspace. Download a backup first. Private GitHub credentials are not in backups and must be reconnected. Pending AI reservations cannot be restored.</p><label class="switch-row mt"><input type="checkbox" required>I have backed up this workspace and want to replace it.</label>`,
    async (_, revision) => {
      const file = modal.querySelector("input[type=file]").files[0];
      assert(file && file.size <= 12e6, "Choose a backup up to 12 MB.");
      const restored = validateWorkspace(JSON.parse(await file.text()));
      assert(!restored.demo, "Example data cannot replace a real workspace.");
      assert(
        !restored.events.some(
          (e) => e.reservedTokens > 0 || e.status === "pending",
        ),
        "Resolve reservations before restoring a backup.",
      );
      if (mode === "remote") {
        const r = await api("/api/restore", { workspace: restored, revision });
        s = validateWorkspace(r.workspace);
      } else {
        assert(
          readLocal().revision === revision,
          "Workspace changed in another tab.",
        );
        restored.revision = revision + 1;
        localStorage.setItem(KEY, JSON.stringify(restored));
        s = restored;
      }
      render();
      toast("Workspace restored. Reconnect private repositories if needed.");
    },
    "Restore backup",
  );
}
function updateSavings() {
  const f = document.querySelector("#savings-form");
  if (!f) return;
  const d = Object.fromEntries(new FormData(f));
  for (const k of Object.keys(d)) if (k !== "quality") d[k] = Number(d[k]);
  d.quality = f.elements.quality.checked;
  try {
    const r = savings(d);
    document.querySelector("#savings-result").innerHTML =
      `<p class="eyebrow">MONTHLY CASH COMPARISON</p><h2>Net cash benefit ${info("Net cash benefit")}</h2><div class="big">${money(r.cash)}</div><p>after the assumed fee and hosting cost</p><div class="math-row"><span>API cost avoided</span><strong>${money(r.avoided)}</strong></div><div class="math-row"><span>After valuing review time</span><strong>${money(r.afterTime)}</strong></div><div class="math-row"><span>Simple setup payback</span><strong>${r.payback == null ? "No positive payback" : r.payback.toFixed(1) + " months"}</strong></div><div class="math-row"><span>First-month cash benefit</span><strong>${money(r.firstMonth)}</strong></div><div class="math-row"><span>Cost per accepted task</span><strong>${money(r.beforePerTask)} → ${money(r.afterPerTask)}</strong></div><p class="note mt">${r.comparable ? "Comparable task counts and quality confirmed by you. Verify the evidence before using this as a business result." : "The comparison is not yet like-for-like. Match accepted work, task mix and quality before claiming savings."}</p>`;
  } catch (error) {
    f.querySelector(".form-error").textContent = error.message;
  }
}
async function handleAction(action, id) {
  switch (action) {
    case "close":
      modal.close();
      break;
    case "menu":
      document.querySelector(".sidebar").classList.toggle("open");
      break;
    case "real":
      changeMode("local");
      modal.close();
      break;
    case "demo":
      demo = demoWorkspace();
      changeMode("demo");
      break;
    case "account":
      accountForm(id);
      break;
    case "profile":
      profile(id);
      break;
    case "event":
      eventDialog(id);
      break;
    case "project":
      projectDialog(id);
      break;
    case "info":
      dialog(
        id,
        `<p>${esc(terms[id] || "See the glossary for data sources and limitations.")}</p>${button("Got it", "close", "primary")}`,
      );
      break;
    case "connect":
      connectForm();
      break;
    case "sync":
      await sync(id);
      break;
    case "disconnect": {
      const c = s.connections.find((c) => c.id === id);
      form(
        "Disconnect repository",
        `<p>Stop future syncs for <strong>${esc(c.repository)}</strong>? Existing activity and review notes remain in your ledger. A saved private token will be removed from the backend.</p>`,
        async (_, revision) => {
          await command("disconnect", { id }, revision);
          toast("Repository disconnected. Existing evidence was retained.");
        },
        "Disconnect",
      );
      break;
    }
    case "pause": {
      const a = s.accounts.find((a) => a.id === id);
      await command("pause", { id, paused: !a.paused });
      toast(
        a.paused
          ? "Managed AI access resumed."
          : "Future managed AI requests are paused for this account.",
      );
      break;
    }
    case "backend":
      backendForm();
      break;
    case "backend-off":
      backend = { url: "", token: "" };
      sessionStorage.removeItem(REMOTE);
      changeMode("local");
      break;
    case "rate":
      rateForm(id);
      break;
    case "ai":
      aiForm();
      break;
    case "reconcile":
      reconcileForm(id);
      break;
    case "clear":
      filter = "";
      source = "";
      accountFilter = "";
      render();
      break;
    case "export":
      exportEvents(
        page() === "activity"
          ? context()
              .s.events.filter(
                (e) =>
                  e.source !== "import" &&
                  (!source || e.source === source) &&
                  (!accountFilter || e.accountId === accountFilter) &&
                  (!filter ||
                    (e.title + " " + e.project + " " + (e.author || ""))
                      .toLowerCase()
                      .includes(filter.toLowerCase())),
              )
              .slice(0, 500)
          : s.events,
      );
      break;
    case "export-imports":
      exportEvents(s.events.filter((e) => e.source === "import"));
      break;
    case "backup":
      download("worklens-workspace-backup.json", JSON.stringify(s, null, 2));
      toast("Backup downloaded. It contains no provider credentials.");
      break;
    case "restore":
      restoreDialog();
      break;
    case "template":
      download(
        "worklens-usage-template.csv",
        toCSV([
          HEADERS,
          [
            "example-1",
            new Date().toISOString(),
            "",
            "Example project",
            "Example imported usage",
            "your-model",
            "100",
            "200",
          ],
        ]),
        "text/csv",
      );
      break;
    case "import":
      importDialog();
      break;
    case "planning-tab":
      planningTab = id;
      render();
      break;
    case "planning":
      planningForm(null, id);
      break;
    case "planning-edit":
      planningForm(id);
      break;
    case "planning-delete": {
      const p = s.planning.find((p) => p.id === id);
      form(
        "Remove planning record",
        `<p>Remove “${esc(p.title)}”? Download a workspace backup if you need to preserve it.</p>`,
        async (_, revision) => {
          await command("planning-delete", { id }, revision);
          toast("Planning record removed.");
        },
        "Remove",
      );
      break;
    }
    case "copy-prompt": {
      const p = s.planning.find((p) => p.id === id);
      await navigator.clipboard.writeText(p.detail);
      toast("Prompt template copied.");
      break;
    }
    case "search":
      form(
        "Search workspace",
        field(
          "Search accounts, projects and activity",
          "query",
          "",
          "search",
          "required",
        ),
        async (d) => {
          filter = d.query;
          location.hash = "activity?search=" + encodeURIComponent(d.query);
          render();
        },
        "Find activity",
      );
      break;
  }
}
document.addEventListener("click", async (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  if (target.tagName === "BUTTON") e.preventDefault();
  try {
    await handleAction(target.dataset.action, target.dataset.id || "");
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "filter") {
    filter = e.target.value;
    render();
  }
  if (e.target.id === "term-filter") {
    const q = e.target.value.toLowerCase();
    document
      .querySelectorAll(".term")
      .forEach((t) => (t.hidden = !t.textContent.toLowerCase().includes(q)));
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "range") {
    range = e.target.value;
    render();
  }
  if (e.target.id === "source-filter") {
    source = e.target.value;
    render();
  }
  if (e.target.id === "account-filter") {
    accountFilter = e.target.value;
    render();
  }
});
document.addEventListener("submit", async (e) => {
  if (e.target.id === "savings-form") {
    e.preventDefault();
    updateSavings();
  }
  if (e.target.id === "budget-form") {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await command(
        "settings",
        {
          ...s.settings,
          companyLimit: Number(data.companyLimit),
          retentionDays: Number(data.retentionDays),
        },
        Number(e.target.dataset.revision),
      );
      toast("Budget rules saved.");
    } catch (error) {
      e.target.querySelector(".form-error").textContent = error.message;
    }
  }
});
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) &&
    !modal.open
  ) {
    e.preventDefault();
    handleAction("search");
  }
});
window.addEventListener("hashchange", () => {
  filter =
    new URLSearchParams(location.hash.split("?")[1] || "").get("search") || "";
  source = "";
  accountFilter = "";
  modal.close();
  render();
  window.scrollTo(0, 0);
});
window.addEventListener("storage", (e) => {
  if (e.key === KEY && mode === "local") {
    try {
      s = readLocal();
      render();
      toast("Workspace updated from another browser tab.");
    } catch (error) {
      toast(error.message);
    }
  }
});
setInterval(async () => {
  if (
    document.hidden ||
    modal.open ||
    busy ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
  )
    return;
  try {
    if (mode === "remote") await refresh();
  } catch (error) {
    toast("Backend refresh failed: " + error.message);
  }
}, 15000);
setInterval(async () => {
  if (document.hidden || modal.open || syncing || mode === "demo") return;
  for (const c of s.connections) await sync(c.id, true);
}, 60000);
render();
if (mode === "remote")
  refresh().catch((error) => {
    toast("Reconnect your backend: " + error.message);
    backendForm();
  });
