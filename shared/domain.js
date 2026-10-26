export const VERSION = 1;
export const uid = () => globalThis.crypto.randomUUID();
export const copy = (value) => structuredClone(value);
export function assert(ok, message) {
  if (!ok) throw new Error(message);
}
export function text(value, name, max = 180, optional = false) {
  assert(
    typeof value === "string" &&
      (optional || value.trim()) &&
      value.length <= max,
    `${name} must be ${optional ? "text" : "non-empty text"} up to ${max} characters.`,
  );
  return value.trim();
}
export function number(value, name, max = 1e12) {
  assert(
    typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= max,
    `${name} must be a non-negative number up to ${max}.`,
  );
  return value;
}
export function integer(value, name, max = 1e12) {
  number(value, name, max);
  assert(Number.isSafeInteger(value), `${name} must be a whole number.`);
  return value;
}
export const month = (date = new Date()) =>
  new Date(date).toISOString().slice(0, 7);
export function emptyWorkspace() {
  return {
    schemaVersion: VERSION,
    revision: 0,
    name: "My workspace",
    accounts: [],
    connections: [],
    events: [],
    planning: [],
    settings: { companyLimit: 1000000, retentionDays: 90, rates: [] },
    updatedAt: null,
  };
}
export function account(state, id) {
  const a = state.accounts.find((a) => a.id === id);
  assert(a, "Account no longer exists.");
  return a;
}
export function repository(value) {
  assert(
    typeof value === "string" &&
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})\/[a-zA-Z0-9_.-]{1,100}$/.test(
        value,
      ) &&
      !value.endsWith("/.."),
    "Enter a GitHub repository as owner/repository.",
  );
  return value.toLowerCase();
}
export function safeUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}
export function eventCost(event, rates) {
  if (
    event.inputTokens == null ||
    event.outputTokens == null ||
    event.source !== "ai"
  )
    return null;
  const r = rates.find((r) => r.model === event.model);
  if (!r) return null;
  return (event.inputTokens * r.input + event.outputTokens * r.output) / 1e6;
}
export function totals(state, events = state.events) {
  const ai = events.filter((e) => e.source === "ai");
  const known = ai.filter(
    (e) => e.inputTokens != null && e.outputTokens != null,
  );
  const priced = ai
    .map((e) => eventCost(e, state.settings.rates))
    .filter((v) => v != null);
  return {
    tokens: known.reduce((v, e) => v + e.inputTokens + e.outputTokens, 0),
    cost: priced.reduce((a, b) => a + b, 0),
    ai: ai.length,
    priced: priced.length,
    unknown: ai.length - known.length,
    reviews: events.filter(
      (e) => e.issue && !["reviewed", "expected"].includes(e.review?.status),
    ).length,
    active: new Set(events.map((e) => e.accountId).filter(Boolean)).size,
    github: events.filter((e) => e.source === "github").length,
  };
}
export function usedTokens(state, accountId, m = month()) {
  return state.events
    .filter(
      (e) =>
        e.source === "ai" &&
        month(e.time) === m &&
        (!accountId || e.accountId === accountId),
    )
    .reduce(
      (n, e) =>
        n +
        (e.inputTokens ?? 0) +
        (e.outputTokens ?? 0) +
        (e.reservedTokens ?? 0),
      0,
    );
}
export function projectBriefs(state) {
  const names = new Set([
    ...state.connections.map((c) => c.repository),
    ...state.events.map((e) => e.project || "Unassigned"),
  ]);
  return [...names].map((name) => {
    const events = state.events
      .filter((e) => (e.project || "Unassigned") === name)
      .sort((a, b) => b.time.localeCompare(a.time));
    const c = state.connections.find((c) => c.repository === name);
    const people = [...new Set(events.map((e) => e.accountId).filter(Boolean))];
    return {
      name,
      description:
        c?.description ||
        (name === "Unassigned"
          ? "Activity without a clear project reference."
          : "A project from declared work labels or connected source records."),
      events,
      people,
      latest: events[0],
      coverage: c?.coverage,
      stats: totals(state, events),
      brief: events.length
        ? `${events.filter((e) => e.kind === "commit").length} commits, ${events.filter((e) => e.kind === "pull_request").length} pull requests and ${events.filter((e) => e.source === "ai").length} tracked AI requests in retained evidence.`
        : "Connected. No activity has been collected yet.",
    };
  });
}
export function upsertEvents(state, events) {
  for (const event of events) {
    validateEvent(event);
    const old = state.events.find((e) => e.id === event.id);
    if (old) {
      const review = old.review;
      Object.assign(old, event, { review });
    } else state.events.push(copy(event));
  }
  assert(
    state.events.length <= 20000,
    "Workspace limit is 20,000 retained events. Export and reduce the imported dataset.",
  );
  state.events.sort((a, b) => b.time.localeCompare(a.time));
}
export function pruneEvents(state, now = new Date()) {
  const startOfMonth = Date.parse(month(now) + "-01T00:00:00Z");
  const cutoff = Math.min(
    now.getTime() - state.settings.retentionDays * 86400000,
    startOfMonth,
  );
  // Keep the full current month for allowances, plus every unresolved reservation.
  state.events = state.events.filter(
    (e) =>
      Date.parse(e.time) >= cutoff ||
      (e.reservedTokens || 0) > 0 ||
      e.status === "pending",
  );
}
export function validateEvent(e) {
  assert(e && typeof e === "object", "Invalid event.");
  text(e.id, "Event ID", 300);
  text(e.title, "Work label", 500);
  assert(
    ["ai", "github", "import"].includes(e.source),
    "Invalid event source.",
  );
  assert(Number.isFinite(Date.parse(e.time)), "Invalid event date.");
  text(e.project ?? "", "Project", 180, true);
  text(e.accountId ?? "", "Account ID", 100, true);
  if (e.inputTokens != null) integer(e.inputTokens, "Input tokens");
  if (e.outputTokens != null) integer(e.outputTokens, "Output tokens");
  assert(
    (e.inputTokens == null) === (e.outputTokens == null),
    "Both token counts must be known, or both unknown.",
  );
  if (e.reservedTokens != null) integer(e.reservedTokens, "Reserved tokens");
  if (e.url) assert(safeUrl(e.url), "Source link must be HTTPS.");
  if (e.model) text(e.model, "Model", 100);
  if (e.issue) text(e.issue, "Issue", 500);
  if (e.review) {
    assert(
      ["open", "reviewed", "expected"].includes(e.review.status),
      "Invalid review status.",
    );
    text(e.review.note ?? "", "Review note", 2000, true);
  }
}
export function validateWorkspace(s) {
  assert(s?.schemaVersion === VERSION, "Unsupported workspace format.");
  integer(s.revision, "Workspace revision");
  text(s.name, "Workspace name", 100);
  for (const key of ["accounts", "connections", "events", "planning"])
    assert(Array.isArray(s[key]), `Missing ${key} list.`);
  assert(
    s.accounts.length <= 200 &&
      s.connections.length <= 5 &&
      s.events.length <= 20000 &&
      s.planning.length <= 2000,
    "Workspace exceeds pilot limits.",
  );
  assert(
    new Set(s.accounts.map((a) => a.id)).size === s.accounts.length,
    "Duplicate account IDs.",
  );
  for (const a of s.accounts) {
    text(a.id, "Account ID", 100);
    text(a.name, "Name", 100);
    text(a.team, "Team", 100);
    text(a.role, "Role", 100);
    integer(a.limit, "Account limit");
    assert(typeof a.paused === "boolean", "Invalid account pause.");
    if (a.github)
      assert(/^[a-zA-Z0-9-]{1,39}$/.test(a.github), "Invalid GitHub login.");
  }
  assert(
    new Set(s.connections.map((c) => c.repository)).size ===
      s.connections.length,
    "Duplicate repositories.",
  );
  for (const c of s.connections) {
    repository(c.repository);
    assert(!("token" in c), "A backup must not contain a GitHub token.");
  }
  assert(
    new Set(s.events.map((e) => e.id)).size === s.events.length,
    "Duplicate event IDs.",
  );
  s.events.forEach(validateEvent);
  integer(s.settings?.companyLimit, "Company allowance");
  assert(
    [30, 90].includes(s.settings.retentionDays),
    "Retention must be 30 or 90 days.",
  );
  assert(
    Array.isArray(s.settings.rates) && s.settings.rates.length <= 30,
    "Invalid price list.",
  );
  for (const r of s.settings.rates) {
    text(r.model, "Model", 100);
    number(r.input, "Input rate", 1000000);
    number(r.output, "Output rate", 1000000);
  }
  for (const p of s.planning) {
    text(p.id, "Record ID", 100);
    text(p.type, "Record type", 30);
    text(p.title, "Title", 180);
    text(p.detail ?? "", "Details", 4000, true);
  }
  return s;
}
export function applyCommand(
  original,
  command,
  now = new Date().toISOString(),
) {
  const s = copy(original);
  const d = command.data ?? {};
  assert(
    command.revision === s.revision,
    "This workspace changed in another session. Refresh before saving.",
  );
  switch (command.type) {
    case "workspace":
      s.name = text(d.name, "Workspace name", 100);
      break;
    case "account": {
      const id = d.id || uid();
      const existing = s.accounts.find((a) => a.id === id);
      const a = {
        id,
        name: text(d.name, "Name", 100),
        team: text(d.team, "Team", 100),
        role: text(d.role, "Role", 100),
        github: (d.github || "").trim().toLowerCase(),
        limit: integer(d.limit, "Account allowance"),
        paused: existing?.paused ?? false,
      };
      if (existing) Object.assign(existing, a);
      else s.accounts.push(a);
      for (const e of s.events)
        if (
          e.source === "github" &&
          a.github &&
          e.author?.toLowerCase() === a.github
        ) {
          e.accountId = a.id;
          if (e.issue === "GitHub author is not mapped to an account.")
            e.issue = "";
        }
      break;
    }
    case "pause":
      account(s, d.id).paused = !!d.paused;
      break;
    case "settings":
      s.settings = {
        companyLimit: integer(d.companyLimit, "Company allowance"),
        retentionDays: Number(d.retentionDays),
        rates: copy(d.rates),
      };
      break;
    case "review": {
      const e = s.events.find((e) => e.id === d.id);
      assert(e, "Event no longer exists.");
      assert(
        ["open", "reviewed", "expected"].includes(d.status),
        "Choose a review status.",
      );
      e.review = {
        status: d.status,
        note: text(d.note, "Review note", 2000),
        time: now,
      };
      break;
    }
    case "connection": {
      const repo = repository(d.repository);
      let c = s.connections.find((c) => c.repository === repo);
      if (!c) {
        assert(
          s.connections.length < 5,
          "This pilot supports up to five repositories.",
        );
        c = { id: uid(), repository: repo };
        s.connections.push(c);
      }
      c.description = text(d.description || "", "Description", 1000, true);
      c.private = !!d.private;
      break;
    }
    case "disconnect":
      s.connections = s.connections.filter((c) => c.id !== d.id);
      break;
    case "github": {
      const c = s.connections.find((c) => c.id === d.id);
      assert(c, "Connection was removed. Sync again after reconnecting.");
      assert(
        Array.isArray(d.events) &&
          d.events.every(
            (e) => e.source === "github" && e.project === c.repository,
          ),
        "Invalid GitHub sync data.",
      );
      upsertEvents(s, d.events);
      c.lastSync = now;
      c.coverage = d.coverage;
      c.description = d.description || c.description;
      break;
    }
    case "import": {
      assert(
        Array.isArray(d.events) && d.events.every((e) => e.source === "import"),
        "Imports belong in the separate imported ledger.",
      );
      upsertEvents(s, d.events);
      break;
    }
    case "planning": {
      const item = {
        id: d.id || uid(),
        type: text(d.type, "Type", 30),
        title: text(d.title, "Title", 180),
        detail: text(d.detail || "", "Details", 4000, true),
        status: text(d.status || "Planned", "Status", 40),
        time: now,
      };
      const old = s.planning.find((p) => p.id === item.id);
      if (old) Object.assign(old, item);
      else s.planning.push(item);
      break;
    }
    case "planning-delete":
      s.planning = s.planning.filter((p) => p.id !== d.id);
      break;
    default:
      throw new Error("Unsupported workspace action.");
  }
  pruneEvents(s, new Date(now));
  s.revision++;
  s.updatedAt = now;
  return validateWorkspace(s);
}
export function savings(d) {
  for (const k of [
    "before",
    "after",
    "fee",
    "hosting",
    "hours",
    "hourly",
    "setup",
    "tasksBefore",
    "tasksAfter",
  ])
    number(d[k], k);
  const avoided = d.before - d.after,
    cash = avoided - d.fee - d.hosting;
  return {
    avoided,
    cash,
    afterTime: cash - d.hours * d.hourly,
    payback: cash > 0 ? d.setup / cash : null,
    firstMonth: cash - d.setup,
    beforePerTask: d.tasksBefore ? d.before / d.tasksBefore : null,
    afterPerTask: d.tasksAfter ? d.after / d.tasksAfter : null,
    comparable:
      d.tasksBefore === d.tasksAfter && d.tasksBefore > 0 && d.quality === true,
  };
}
