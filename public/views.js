import {
  totals,
  eventCost,
  usedTokens,
  projectBriefs,
  safeUrl,
} from "./shared/domain.js";
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
  empty,
  field,
  select,
  option,
  terms,
} from "./ui.js";
const headings = {
  overview: [
    "Overview",
    "A clear view of your AI spend and the work behind it.",
  ],
  people: [
    "People & accounts",
    "Understand observed usage, ownership and recent work.",
  ],
  work: ["Company projects", "A simple brief for every connected project."],
  activity: ["Live activity", "Trace every record back to its source."],
  review: ["Needs review", "Check the evidence. Record a clear decision."],
  connections: [
    "Connections",
    "Bring work evidence and AI usage into one place.",
  ],
  budgets: ["Budgets & rules", "Give managed AI a clear allowance."],
  savings: ["Savings lab", "Compare the same work before and after a change."],
  advanced: [
    "Advanced planning",
    "Plan tasks, compare evidence and improve the workflow.",
  ],
  guide: ["Quick start & help", "Start with one account and one source."],
  updates: [
    "Product updates",
    "What is built, what is tested and what needs setup.",
  ],
};
export function shell(ctx) {
  const { s, page, mode, range } = ctx;
  const [title, sub] = headings[page] || headings.overview;
  const nav = [
    ["overview", "Overview", "overview"],
    ["people", "People & accounts", "people"],
    ["work", "Company projects", "work"],
    ["activity", "Live activity", "activity"],
    ["review", "Needs review", "review"],
    ["connections", "Connections", "connections"],
    ["budgets", "Budgets & rules", "budgets"],
    ["savings", "Savings lab", "savings"],
  ];
  const count = totals(s).reviews;
  return `<div class="app-shell"><aside class="sidebar" id="sidebar"><a class="brand" href="#overview" aria-label="Worklens home"><img src="./favicon.svg" alt="">worklens<span style="color:#7e9d6b;font-size:28px">.</span></a><a href="#overview" class="workspace-tile"><span class="square">${esc(s.name[0])}</span><span><strong>${esc(s.name)}</strong><small>${mode === "demo" ? "Example workspace" : mode === "remote" ? "Connected owner workspace" : "Local workspace"}</small></span><span style="margin-left:auto;width:12px;color:#7c8c7b">${icon("chevron")}</span></a><p class="nav-label">WORKSPACE</p><nav class="nav" aria-label="Workspace">${nav.map(([id, label, ic]) => `<a href="#${id}" class="${page === id ? "active" : ""}" ${page === id ? 'aria-current="page"' : ""}>${icon(ic)}<span>${label}</span>${id === "review" && count ? `<span class="nav-count">${count}</span>` : ""}</a>`).join("")}</nav><div class="sidebar-bottom"><p class="nav-label">RESOURCES</p><nav class="nav" aria-label="Resources">${[
    ["advanced", "Advanced planning", "advanced"],
    ["guide", "Quick start & help", "guide"],
    ["updates", "Product updates", "clock"],
  ]
    .map(
      ([id, label, ic]) =>
        `<a href="#${id}" class="${page === id ? "active" : ""}">${icon(ic)}${label}</a>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-note"><strong>Evidence over assumptions.</strong>Usage tells you where to look.<br>People decide what it means.</div><div class="profile">${avatar(mode === "demo" ? "Priya Kapoor" : "Workspace owner")}<div><strong>${mode === "demo" ? "Priya Kapoor" : "Workspace owner"}</strong><small>${mode === "demo" ? "Operations · Northstar" : "Owner-operated pilot"}</small></div><button class="icon" data-action="backend" aria-label="Backend settings">${icon("settings")}</button></div></div></aside><div class="main-shell"><header class="topbar"><button class="icon mobile-menu" data-action="menu" aria-label="Open navigation">${icon("menu")}</button><div class="breadcrumb">Workspace<span>/</span><strong>${esc(title)}</strong></div><div class="top-actions"><button class="top-search" data-action="search">${icon("search").replace("<svg", '<svg width="13" height="13"')}Search workspace <kbd>/</kbd></button><span class="status"><i class="dot ${mode === "demo" ? "amber" : ""}"></i>${mode === "demo" ? "Example data" : mode === "remote" ? "Backend connected" : "Saved in this browser"}</span>${avatar("Workspace owner")}</div></header><main class="content" id="main" tabindex="-1"><div class="page-heading"><div><p class="eyebrow">AI INTELLIGENCE / ${mode === "demo" ? "EXAMPLE WORKSPACE" : "YOUR WORKSPACE"}</p><h1>${esc(title)}</h1><p>${esc(sub)}</p></div><div class="heading-actions">${page === "overview" ? `<select aria-label="Date range" id="range">${option("30", "Last 30 days", range)}${option("7", "Last 7 days", range)}${option("all", "All retained data", range)}</select>` : ""}${button("Export data", "export", "ghost")}${page === "people" ? button("+ Add account", "account", "primary") : page === "connections" ? button("+ Connect source", "connect", "primary") : button(mode === "demo" ? "Use my own data" : mode === "remote" ? "Workspace settings" : "Explore example", mode === "demo" ? "real" : mode === "remote" ? "backend" : "demo", "primary")}</div></div>${mode === "demo" ? `<div class="banner warning">${icon("spark")}<span>You’re exploring a fictional company. All activity, people and model prices are illustrative.</span>${button("Start your workspace →", "real", "small ghost")}</div>` : mode === "local" ? `<div class="banner">${icon("shield")}<span>Your records stay in this browser. Connect public repositories now, or add a backend for private sources and managed AI.</span>${button("Connect backend", "backend", "small ghost")}</div>` : ""}<div id="page-content">${renderPage(ctx)}</div><footer class="footer"><span>Worklens 1.0 · Usage is evidence, not an employee score.</span><a href="#guide">Sources, calculations & limits ↗</a></footer></main></div></div>`;
}
function stats(ctx) {
  const t = totals(ctx.s, ctx.events);
  return `<div class="stats">${[
    [
      "Observed tokens",
      fmt(t.tokens),
      "bolt",
      `${t.ai - t.unknown} known requests${t.unknown ? ` · ${t.unknown} unknown` : ""}`,
    ],
    [
      "Estimated API cost",
      t.priced ? money(t.cost) : "Not priced",
      "budgets",
      `${t.priced} of ${t.ai} AI requests priced`,
    ],
    [
      "Active accounts",
      `${t.active} <span style="color:#647469;font-size:18px">/ ${ctx.s.accounts.length}</span>`,
      "people",
      "With observed activity in this period",
    ],
    ["Needs review", t.reviews, "review", "Open data or request questions"],
  ]
    .map(
      ([label, value, ic, detail]) =>
        `<div class="stat"><div class="stat-label">${label} ${info(label)}</div><span class="stat-symbol">${icon(ic)}</span><div class="stat-value">${value}</div><small>${esc(detail)}</small></div>`,
    )
    .join("")}</div>`;
}
function trend(ctx) {
  const vals = Array.from({ length: 14 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - 13 + i);
    return { day: day.toISOString().slice(0, 10), value: 0 };
  });
  for (const e of ctx.events) {
    const v = vals.find((v) => v.day === e.time.slice(0, 10));
    if (v && e.source === "ai")
      v.value += (e.inputTokens ?? 0) + (e.outputTokens ?? 0);
  }
  const max = Math.max(100, ...vals.map((v) => v.value));
  const points = vals.map((v, i) => [38 + i * 40, 170 - (v.value / max) * 135]);
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const sum = vals.reduce((n, v) => n + v.value, 0);
  return `<div class="card"><div class="card-head"><div><h2>AI usage over time</h2><p>Observed tokens across your tracked requests</p></div>${tag("Last 14 days", "neutral")}</div><div class="chart-total"><b>${fmt(sum)}</b><span>tokens in this window</span></div><div class="chart-wrap"><svg viewBox="0 0 600 195" class="trend-svg" role="img" aria-label="Daily observed tokens for the last fourteen days"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#b6e78e" stop-opacity=".19"/><stop offset="100%" stop-color="#b6e78e" stop-opacity="0"/></linearGradient></defs>${[35, 80, 125, 170].map((y) => `<line x1="35" y1="${y}" x2="585" y2="${y}" stroke="#2b352e" stroke-dasharray="3 5"/>`).join("")}<path d="${d} L558,180 L38,180 Z" fill="url(#fill)"/><path d="${d}" fill="none" stroke="#b9ed8e" stroke-width="2.7"/>${points.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="3" fill="#b9ed8e"><title>${vals[i].day}: ${fmt(vals[i].value)} tokens</title></circle>`).join("")}</svg></div><div class="chart-labels"><span>${esc(vals[0].day.slice(5))}</span><span>${esc(vals[3].day.slice(5))}</span><span>${esc(vals[7].day.slice(5))}</span><span>${esc(vals[10].day.slice(5))}</span><span>Today</span></div><div class="card-foot"><span>Reported usage only. Unknown outcomes excluded.</span><a href="#activity" class="text-green">View activity ↗</a></div></div>`;
}
function spend(ctx) {
  const all = ctx.s.accounts
    .map((a) => ({
      a,
      t: totals(
        ctx.s,
        ctx.events.filter((e) => e.accountId === a.id),
      ),
    }))
    .sort((a, b) => b.t.cost - a.t.cost);
  const max = Math.max(0.001, ...all.map((x) => x.t.cost));
  return `<div class="card"><div class="card-head"><div><h2>Where the spend goes</h2><p>Estimated API cost by account ${info("Estimated API cost")}</p></div>${tag("USD", "neutral")}</div><div class="card-body">${
    all.length
      ? all
          .slice(0, 4)
          .map(
            ({ a, t }, i) =>
              `<div><div class="spend-row"><span>${esc(a.name)}</span><strong>${t.priced ? money(t.cost) : "Not priced"}</strong></div><div class="bar"><span class="${["", "blue", "gold", "gray"][i]}" style="width:${(t.cost / max) * 100}%"></span></div><p class="status-line">${esc(a.team)} · ${fmt(t.tokens)} observed tokens</p></div>`,
          )
          .join("")
      : empty(
          "No account usage yet",
          "Add your account, then connect a work source.",
          "account",
          "Add account",
        )
  }</div><div class="card-foot"><span>Configured rates · no subscription costs</span><a href="#people" class="text-green">All accounts ↗</a></div></div>`;
}
function projectCard(p, s) {
  return `<article class="project-card"><div class="project-top"><span class="project-icon">${icon("work")}</span>${tag(p.stats.reviews ? `${p.stats.reviews} to review` : "Evidence ready", p.stats.reviews ? "amber" : "neutral")}</div><h3>${esc(p.name.split("/").pop())}</h3><p>${esc(p.description.slice(0, 145))}</p><p style="color:#c0cdbb">${esc(p.brief)}</p><div class="project-foot"><span class="stack">${p.people
    .slice(0, 4)
    .map((id) => avatar(s.accounts.find((a) => a.id === id)?.name))
    .join(
      "",
    )}</span><span>${fmt(p.stats.tokens)} tokens</span>${button("Open ↗", "project", "link", p.name)}</div></article>`;
}
export function activityTable(events, s) {
  return `<div class="table-wrap"><table><thead><tr><th>WORK / SOURCE</th><th>ACCOUNT</th><th>OBSERVED TOKENS</th><th>EST. COST</th><th>WHEN</th></tr></thead><tbody>${events.length ? events.map((e) => `<tr class="clickable"><td><button class="link feed-title" data-action="event" data-id="${esc(e.id)}">${esc(e.title)}</button><small>${esc(e.source === "github" ? "GitHub · " + e.kind.replace("_", " ") : e.source === "import" ? "Imported report" : e.model || "Managed AI")} · ${esc(e.project || "Unassigned")}</small></td><td>${esc(s.accounts.find((a) => a.id === e.accountId)?.name || e.author || "Unassigned")}</td><td>${e.inputTokens == null ? (e.source === "github" ? "—" : "Unknown") : fmt(e.inputTokens + e.outputTokens)}</td><td>${e.source === "github" ? "—" : money(eventCost(e, s.settings.rates))}</td><td>${esc(date(e.time))}</td></tr>`).join("") : '<tr class="table-empty"><td colspan="5">No records match these filters.</td></tr>'}</tbody></table></div>`;
}
function reviews(events, s, limit = 20) {
  const items = events.filter(
    (e) => e.issue && !["reviewed", "expected"].includes(e.review?.status),
  );
  return items.length
    ? items
        .slice(0, limit)
        .map(
          (e) =>
            `<div class="review-item"><span class="review-icon">${icon("review")}</span><div><p>${esc(e.issue)}</p><small>${esc(s.accounts.find((a) => a.id === e.accountId)?.name || e.author || "Unmapped account")} · ${esc(e.project || "Unassigned")}</small></div>${button("Review", "event", "small ghost", e.id)}</div>`,
        )
        .join("")
    : empty(
        "All caught up",
        "There are no unresolved data or request questions in this view.",
        "",
        "",
      );
}
function overview(ctx) {
  const { s } = ctx;
  const ps = projectBriefs({ ...s, events: ctx.events });
  return `${stats(ctx)}<div class="grid-main">${trend(ctx)}${spend(ctx)}</div><div class="section-heading"><div><h2>Work in focus</h2><p>The latest evidence from your company projects</p></div><a href="#work" class="text-green" style="font-size:11px">All projects →</a></div>${
    ps.length
      ? `<div class="projects">${ps
          .slice(0, 3)
          .map((p) => projectCard(p, s))
          .join("")}</div>`
      : `<div class="card">${empty("Your first project starts with a connection", "Connect a public GitHub repository. Worklens will create its project and brief from observed activity.", "connect", "Connect GitHub")}</div>`
  }<div class="lower-grid"><div class="card"><div class="card-head mb"><div><h2>Recent activity</h2><p>Every number has a source behind it</p></div><a href="#activity" class="text-green" style="font-size:11px">View all ↗</a></div>${activityTable(ctx.events.slice(0, 4), s)}</div><div class="card"><div class="card-head mb"><div><h2>Worth a closer look</h2><p>Questions to check, without assumptions</p></div>${tag(String(totals(s, ctx.events).reviews), "amber")}</div>${reviews(ctx.events, s, 3)}</div></div>`;
}
function people(ctx) {
  const { s } = ctx;
  return `<div class="toolbar"><input class="search" id="filter" aria-label="Search accounts" placeholder="Search names, teams or GitHub logins…" value="${esc(ctx.filter)}"></div><div class="account-grid">${s.accounts
    .filter((a) =>
      [a.name, a.team, a.github]
        .join(" ")
        .toLowerCase()
        .includes(ctx.filter.toLowerCase()),
    )
    .map((a) => {
      const ev = s.events.filter((e) => e.accountId === a.id),
        t = totals(s, ev),
        used = usedTokens(s, a.id);
      return `<article class="card person-card"><div class="person-top">${avatar(a.name)}<div><h3>${esc(a.name)}</h3><p>${esc(a.team)} · ${esc(a.role)}</p></div></div><div class="flex mb">${tag(a.paused ? "AI paused" : "Active", a.paused ? "amber" : "")}${a.github ? tag("@" + a.github, "neutral") : ""}</div><div class="person-metrics"><div><strong>${fmt(t.tokens)}</strong><small>Observed tokens</small></div><div><strong>${t.priced ? money(t.cost) : "—"}</strong><small>Estimated API cost</small></div></div><div class="progress-caption"><span>Monthly allowance used ${info("Token allowance")}</span><span>${a.limit ? Math.round((used / a.limit) * 100) : 0}%</span></div><div class="bar"><span style="width:${Math.min(100, a.limit ? (used / a.limit) * 100 : 0)}%"></span></div><p class="status-line">${fmt(used)} / ${fmt(a.limit)} tokens, including reservations</p><div class="person-actions">${button("View profile", "profile", "small", a.id)}${button("Edit", "account", "small ghost", a.id)}</div></article>`;
    })
    .join(
      "",
    )}</div>${s.accounts.length ? "" : `<div class="card">${empty("Who is using AI?", "Add a person or service account. Map the exact GitHub username to connect their work evidence.", "account", "Add your first account")}</div>`}<p class="note mt">Names and project labels are entered by the workspace owner. Observed activity does not establish productivity, knowledge gained or employee value.</p>`;
}
function work(ctx) {
  const ps = projectBriefs(ctx.s).filter((p) =>
    (p.name + " " + p.description)
      .toLowerCase()
      .includes(ctx.filter.toLowerCase()),
  );
  return `<div class="toolbar"><input class="search" id="filter" aria-label="Search projects" placeholder="Find a project…" value="${esc(ctx.filter)}">${button("+ Connect repository", "connect", "ghost")}</div><div class="projects">${ps.map((p) => projectCard(p, ctx.s)).join("")}</div>${ps.length ? "" : `<div class="card">${empty("Bring your projects into view", "Connected repositories become projects automatically. Tracked AI requests join the project you declare.", "connect", "Connect GitHub")}</div>`}<p class="note mt">${info("Project brief")} Briefs summarize retained evidence. They do not infer blockers, task completion or all work happening in the company.</p>`;
}
function activity(ctx) {
  let es = ctx.s.events.filter((e) => e.source !== "import");
  if (ctx.source) es = es.filter((e) => e.source === ctx.source);
  if (ctx.accountFilter)
    es = es.filter((e) => e.accountId === ctx.accountFilter);
  if (ctx.filter)
    es = es.filter((e) =>
      (e.title + " " + e.project + " " + (e.author || ""))
        .toLowerCase()
        .includes(ctx.filter.toLowerCase()),
    );
  return `<div class="toolbar"><input class="search" id="filter" aria-label="Search activity" placeholder="Search work, projects or authors…" value="${esc(ctx.filter)}"><select id="source-filter" aria-label="Filter source">${option("", "All sources", ctx.source)}${option("github", "GitHub", ctx.source)}${option("ai", "Managed AI", ctx.source)}</select><select id="account-filter" aria-label="Filter account">${option("", "All accounts", ctx.accountFilter)}${ctx.s.accounts.map((a) => option(a.id, a.name, ctx.accountFilter)).join("")}</select>${button("Clear filters", "clear", "ghost small")}${button("Try tracked AI", "ai", "primary small")}</div><div class="card">${activityTable(es.slice(0, 500), ctx.s)}<div class="card-foot"><span>Showing ${Math.min(500, es.length)} of ${es.length} matching retained records.</span><span>Imported data is under Advanced planning.</span></div></div>`;
}
function review(ctx) {
  const completed = ctx.s.events.filter(
    (e) => e.review && e.review.status !== "open",
  );
  return `<div class="grid-two"><div class="card"><div class="card-head mb"><div><h2>Open questions</h2><p>Check original records before deciding</p></div>${tag(String(totals(ctx.s).reviews), "amber")}</div>${reviews(ctx.s.events, ctx.s)}</div><div class="card"><div class="card-head mb"><div><h2>Decision history</h2><p>Notes stay attached when sources sync again</p></div></div>${
    completed.length
      ? completed
          .slice(0, 20)
          .map(
            (e) =>
              `<div class="review-item"><span class="review-icon" style="background:#293922;color:var(--green)">${icon("check")}</span><div><p>${esc(e.review.note)}</p><small>${esc(e.review.status)} · ${esc(e.title)}</small></div>${button("Open", "event", "small ghost", e.id)}</div>`,
          )
          .join("")
      : empty(
          "A transparent review trail",
          "Save a review decision and its reason. It will appear here.",
          "",
          "",
        )
  }</div></div>`;
}
function connections(ctx) {
  const { s, mode, capabilities } = ctx;
  return `<div class="setup-grid"><div class="card setup-step"><span class="step-number">01</span><h3>Add your accounts</h3><p>Use a name, team and exact GitHub login to link work to the right account.</p><p class="mt"><a href="#people" class="text-green">Manage accounts →</a></p></div><div class="card setup-step"><span class="step-number">02</span><h3>Connect your work</h3><p>Public GitHub repositories work from your browser. Private tokens stay on your backend.</p><p class="mt">${button("Connect GitHub →", "connect", "link")}</p></div><div class="card setup-step"><span class="step-number">03</span><h3>Review the evidence</h3><p>Open a source record, confirm the author and time, then save your review.</p><p class="mt"><a href="#activity" class="text-green">Open activity →</a></p></div></div><div class="grid-two"><div><h2 class="mb">Work sources <span class="muted" style="font-size:12px">${s.connections.length} / 5 repositories</span></h2>${s.connections.map((c) => `<article class="card connection"><div class="connection-title"><span class="project-icon">${icon("github")}</span><h3 class="break">${esc(c.repository)}</h3>${tag(mode === "demo" ? "Example" : c.private ? "Private" : "Public", "neutral")}</div><p>${esc(c.description || "GitHub work evidence and automatic project briefs.")}</p><div class="connection-meta">Last sync: ${esc(date(c.lastSync))}<br>Coverage: ${esc(c.coverage || "Not collected yet")}</div><div class="actions">${button("Sync now", "sync", "small primary", c.id)}${button("Open project", "project", "small", c.repository)}${button("Disconnect", "disconnect", "small ghost danger", c.id)}</div></article>`).join("")}${s.connections.length ? "" : `<div class="card">${empty("Connect your first source", "Public repositories need no credentials. Start with a repository you can verify.", "connect", "Connect GitHub")}</div>`}</div><div><h2 class="mb">AI & storage</h2><article class="card connection"><div class="connection-title"><span class="project-icon">${icon("spark")}</span><h3>Managed OpenAI</h3>${tag(mode === "remote" && capabilities.ai ? "Configured" : "Setup required", mode === "remote" && capabilities.ai ? "" : "amber")}</div><p>Track requests made inside Worklens. The server reserves tokens, applies allowances and records returned usage.</p><p class="note">Normal ChatGPT conversations and subscriptions are outside this connection. No provider keys belong in the public website.</p><div class="actions">${button("Try tracked AI", "ai", "small primary")}${button("Backend setup", "backend", "small ghost")}</div></article><article class="card connection"><div class="connection-title"><span class="project-icon">${icon("shield")}</span><h3>${mode === "remote" ? "SQLite backend" : "Browser storage"}</h3>${tag(mode === "remote" ? "Connected" : "Local only", "neutral")}</div><p>${mode === "remote" ? "Owner-authenticated records saved on your configured backend." : "Your own data stays on this device. Other visitors cannot see it. Export a backup to move it to another browser."}</p><div class="actions">${button("Download backup", "backup", "small")}${button(mode === "remote" ? "Disconnect backend" : "Connect backend", mode === "remote" ? "backend-off" : "backend", "small ghost")}</div></article></div></div><p class="note mt">Automatic checks run every minute while this page is open and visible. Closing the page stops collection. GitHub activity supplies work context; it does not report GPT or Copilot tokens.</p>`;
}
function budgets(ctx) {
  const s = ctx.s,
    used = usedTokens(s),
    reserved = s.events.reduce((v, e) => v + (e.reservedTokens || 0), 0);
  return `<div class="stats"><div class="stat"><div class="stat-label">Company allowance ${info("Token allowance")}</div><div class="stat-value">${fmt(s.settings.companyLimit)}</div><small>Tokens per UTC calendar month</small></div><div class="stat"><div class="stat-label">Used + reserved</div><div class="stat-value">${fmt(used)}</div><small>Current month, managed requests only</small></div><div class="stat"><div class="stat-label">Reserved tokens ${info("Reserved tokens")}</div><div class="stat-value">${fmt(reserved)}</div><small>Pending or unknown provider outcomes</small></div><div class="stat"><div class="stat-label">Paused accounts</div><div class="stat-value">${s.accounts.filter((a) => a.paused).length}</div><small>Stops future managed requests only</small></div></div><div class="grid-two"><div class="card"><div class="card-head"><div><h2>Allowances & retention</h2><p>Budget enforcement requires the connected backend</p></div></div><form id="budget-form" class="card-body" data-revision="${s.revision}"><div class="form-grid">${field("Monthly company token allowance", "companyLimit", s.settings.companyLimit, "number", 'min="0" step="1" required')}${select("Event retention", "retentionDays", [30, 90].map((v) => option(v, v + " days", s.settings.retentionDays)).join(""))}</div><p class="form-note mt">Current-month usage and unresolved reservations are retained to keep budget accounting intact. Summaries cover retained records only.</p><div class="form-error" role="alert"></div><div class="form-footer"><button class="primary" type="submit">Save rules</button></div></form></div><div class="card"><div class="card-head"><div><h2>Model prices</h2><p>USD per million tokens · entered by you</p></div>${button("+ Add rate", "rate", "small")}</div><div class="card-body">${s.settings.rates.length ? `<table><thead><tr><th>MODEL</th><th>INPUT</th><th>OUTPUT</th><th></th></tr></thead><tbody>${s.settings.rates.map((r) => `<tr><td>${esc(r.model)}</td><td>${money(r.input)}</td><td>${money(r.output)}</td><td>${button("Edit", "rate", "link", r.model)}</td></tr>`).join("")}</tbody></table>` : empty("No rates configured", "Add the rates from your provider contract. Unpriced requests will stay unknown.", "rate", "Add a model rate")}<p class="note mt">${ctx.mode === "demo" ? "These example rates are fictional. " : ""}Price estimates are calculated at the currently configured rates, including for historical records. They are not a billing ledger.</p></div></div></div><div class="section-heading"><h2>Account controls</h2><a href="#people" class="text-green">Manage accounts →</a></div><div class="card table-wrap"><table><thead><tr><th>ACCOUNT</th><th>MONTHLY ALLOWANCE</th><th>USED + RESERVED</th><th>MANAGED AI ACCESS</th><th></th></tr></thead><tbody>${s.accounts.map((a) => `<tr><td>${esc(a.name)}</td><td>${fmt(a.limit)}</td><td>${fmt(usedTokens(s, a.id))}</td><td>${tag(a.paused ? "Paused" : "Allowed", a.paused ? "amber" : "")}</td><td>${button(a.paused ? "Resume" : "Pause", "pause", "small ghost", a.id)} ${button("Edit allowance", "account", "small ghost", a.id)}</td></tr>`).join("")}</tbody></table></div>`;
}
function savingsView() {
  return `<div class="banner">${icon("savings")}<span>A scenario worksheet. Use comparable periods and finance-verified costs. These starting figures are from the fictional company in the original workflow.</span></div><div class="grid-two"><div class="card"><div class="card-head"><div><h2>Compare two workflows</h2><p>All money uses the same currency: USD</p></div></div><form id="savings-form" class="card-body"><div class="form-grid">${field("Baseline API cost", "before", 110, "number", 'min="0" step="0.01" required')}${field("Improved API cost", "after", 77, "number", 'min="0" step="0.01" required')}${field("Monthly Worklens fee (assumed)", "fee", 12, "number", 'min="0" step="0.01" required')}${field("Monthly hosting cost", "hosting", 3, "number", 'min="0" step="0.01" required')}${field("Accepted tasks before", "tasksBefore", 400, "number", 'min="0" step="1" required')}${field("Accepted tasks after", "tasksAfter", 400, "number", 'min="0" step="1" required')}${field("Monthly review hours", "hours", 2, "number", 'min="0" step="0.1" required')}${field("Value per review hour", "hourly", 4, "number", 'min="0" step="0.01" required')}<div class="full">${field("One-time paid setup cost", "setup", 60, "number", 'min="0" step="0.01" required')}</div></div><label class="switch-row mt"><input type="checkbox" name="quality" checked>Same task mix and quality requirements met</label><p class="form-note mt">Verify accepted work and quality independently. Lower token use alone does not demonstrate savings or productivity.</p><div class="form-error" role="alert"></div><div class="form-footer"><button type="submit" class="primary">Calculate comparison</button></div></form></div><div><div class="savings-result" id="savings-result"></div><div class="card guide-section mt"><h3>Make the comparison fair</h3><p>Match working days, task mix, model rates and quality. Reconcile against provider invoices. Include setup, implementation and review costs. Keep time value separate from cash savings.</p><p>Other subscriptions are unchanged in this worksheet. Avoided payroll and the same hours of capacity must not be counted twice.</p></div></div></div>`;
}
const planningTypes = {
  tasks: "Task opportunities",
  jobs: "Job Studio",
  benchmarks: "Benchmarks",
  prompts: "Prompt library",
  skills: "Skills evidence",
  programs: "Program actions",
  imports: "CSV reports",
};
function advanced(ctx) {
  const tab = ctx.planningTab || "tasks";
  const items = ctx.s.planning.filter((p) => p.type === tab);
  return `<div class="tabs" role="navigation" aria-label="Planning tools">${Object.entries(
    planningTypes,
  )
    .map(([id, label]) =>
      button(esc(label), "planning-tab", tab === id ? "active" : "", id),
    )
    .join(
      "",
    )}</div>${tab === "imports" ? `<div class="card guide-section"><h2>Import authorized usage reports</h2><p>Imported records stay separate from the observed ledger and managed AI allowances. Review your account IDs before importing. Blank token counts mean unknown, not zero.</p><div class="flex">${button("Download CSV template", "template", "primary")}${button("Import CSV", "import", "ghost")}${button("Export imported records", "export-imports", "ghost")}</div><p class="note mt">${ctx.s.events.filter((e) => e.source === "import").length} imported records · ${fmt(ctx.s.events.filter((e) => e.source === "import").reduce((v, e) => v + (e.inputTokens ?? 0) + (e.outputTokens ?? 0), 0))} reported tokens</p></div><div class="card">${activityTable(ctx.s.events.filter((e) => e.source === "import").slice(0, 500), ctx.s)}</div>` : `<div class="section-heading"><div><h2>${planningTypes[tab]}</h2><p>${{ tasks: "Record a task, the hypothesis and the outcome evidence needed.", jobs: "Describe how a role changes, with human responsibilities kept explicit.", benchmarks: "Save comparable baselines, accepted work and measurement conditions.", prompts: "Keep reusable prompts and verification instructions.", skills: "Record reviewer-entered assessments and their evidence.", programs: "Turn a finding into a clear owner, action and follow-up." }[tab]}</p></div>${button("+ Add record", "planning", "primary", tab)}</div><div class="grid-two">${items.map((p) => `<article class="card guide-section"><div class="flex" style="justify-content:space-between"><h3>${esc(p.title)}</h3>${tag(p.status, "neutral")}</div><p style="white-space:pre-wrap">${esc(p.detail)}</p><div class="flex mt">${button("Edit record", "planning-edit", "small", p.id)}${tab === "prompts" ? button("Copy template", "copy-prompt", "small ghost", p.id) : ""}${button("Remove", "planning-delete", "small ghost danger", p.id)}</div></article>`).join("")}</div>${items.length ? "" : `<div class="card">${empty("Build an evidence-based plan", "Add a record with its owner, conditions, evidence and next step.", "planning", "Add a record")}</div>`}`}<p class="note mt">Assessments, task benchmarks and planning notes are owner-entered evidence. Worklens does not produce employee rankings or automatic layoff recommendations.</p>`;
}
function guide() {
  return `<div class="guide-grid"><div><section class="card guide-section"><h2>Your first GitHub test</h2><ol><li>Choose <strong>Use my own data</strong> and add your account under People & accounts.</li><li>Enter your exact GitHub login, without @.</li><li>Open Connections and connect a public repository as owner/repository.</li><li>Select Sync now, then open a record in Live activity. Verify its author, title and date on GitHub.</li><li>Sync again. The same source record should appear only once.</li><li>Record a review note. It stays attached after another sync.</li></ol><p>Private repository credentials require your backend. Ordinary ChatGPT sign-in does not share your chats or API billing with this app.</p></section><section class="card guide-section"><h2>From usage to a decision</h2><ol><li><strong>Connect:</strong> add an account and a source.</li><li><strong>Observe:</strong> see project briefs, tokens and source coverage.</li><li><strong>Investigate:</strong> inspect a record and ask what work it supports.</li><li><strong>Review:</strong> save a reasoned decision.</li><li><strong>Improve:</strong> change the workflow, then compare accepted work, quality and total cost.</li></ol><p>A pause or allowance only applies to AI requests routed through the managed backend. GitHub observations are not AI usage.</p></section><section class="card guide-section"><h2>Storage & operator setup</h2><p>The public Pages app is fully usable with local storage, public GitHub sources, planning, CSV tools and the savings worksheet. Your workspace data is not committed to the public code repository.</p><p>For durable server records, private repositories and tracked AI, deploy the included Node.js backend with its SQLite database on a persistent volume. Set the owner token, allowed website origin, encryption key and optional OpenAI key as server environment variables. Then connect its HTTPS address in this app.</p><div class="flex">${button("Connect backend", "backend", "small primary")}${button("Export backup", "backup", "small")}${button("Restore backup", "restore", "small ghost")}</div></section></div><section class="card guide-section"><h2>Plain-language glossary</h2><input id="term-filter" class="search mt" aria-label="Search glossary" placeholder="Find a term…" style="width:100%"><div id="terms">${Object.entries(
    terms,
  )
    .map(
      ([term, meaning]) =>
        `<div class="term"><strong>${esc(term)}</strong><p>${esc(meaning)}</p></div>`,
    )
    .join("")}</div></section></div>`;
}
function updates() {
  return `<div class="grid-two"><section class="card guide-section"><p class="eyebrow">REBUILT FROM YOUR ORIGINAL SPECIFICATION</p><h2>Worklens 1.0</h2><p>This is a new implementation informed by the original research, user manual, product audit, workflow diagrams and recovered conversation. It is not the lost original source archive.</p><h3>Included in the Pages app</h3><ul><li>Overview, accounts, project briefs, activity and source evidence.</li><li>Public GitHub collection, stable IDs and preserved review notes.</li><li>Separate example and real workspaces, local backups and CSV imports.</li><li>Configurable rates, allowances, account pauses and savings comparison.</li><li>Task opportunities, Job Studio, benchmarks, prompt templates, skills evidence and program actions.</li><li>Responsive layouts, keyboard navigation and explanations beside metrics.</li></ul><h3>Included in the backend source</h3><ul><li>SQLite persistence, owner authentication and exact-origin access checks.</li><li>AES-GCM encrypted private GitHub credentials.</li><li>Managed OpenAI adapter with request deduplication and budget reservations.</li><li>Unknown-outcome recovery and provider-verified manual reconciliation.</li></ul></section><section class="card guide-section"><h2>Setup and verification boundaries</h2><p>The public app does not contain provider credentials. A backend must be deployed and connected before private GitHub sync or paid managed AI requests can run. Source-code publication does not perform that setup.</p><p>Collection runs while the page is visible. No closed-tab scheduler, company-wide employee login or team authorization is included in this owner pilot.</p><h3>Before a company rollout</h3><ul><li>Verify a real provider request against provider usage records.</li><li>Add organization sign-in, team roles and trusted attribution.</li><li>Test backups, restoration, load, retention and operational monitoring.</li><li>Agree authorized data use and review procedures.</li></ul><h3>What the app never assumes</h3><p>Tokens, commits and prompt counts do not establish employee value, learning or misconduct. Decisions require work-quality evidence and human review.</p></section></div>`;
}
function renderPage(ctx) {
  return (
    {
      overview,
      people,
      work,
      activity,
      review,
      connections,
      budgets,
      savings: savingsView,
      advanced,
      guide,
      updates,
    }[ctx.page] || overview
  )(ctx);
}
