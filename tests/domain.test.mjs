import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyWorkspace,
  applyCommand,
  eventCost,
  totals,
  upsertEvents,
  usedTokens,
  savings,
  projectBriefs,
  validateWorkspace,
  repository,
  safeUrl,
  pruneEvents,
} from "../shared/domain.js";
import { parseCSV, toCSV, importEvents, HEADERS } from "../shared/csv.js";
import { collectRepository } from "../shared/github.js";
const event = (patch = {}) => ({
  id: "e1",
  source: "ai",
  title: "Draft reply",
  project: "Support",
  accountId: "a",
  time: "2026-10-19T00:00:00Z",
  inputTokens: 100,
  outputTokens: 200,
  model: "test",
  ...patch,
});
function workspace() {
  let s = emptyWorkspace();
  s = applyCommand(s, {
    type: "account",
    revision: 0,
    data: {
      id: "a",
      name: "Asha",
      team: "Engineering",
      role: "Engineer",
      github: "asha",
      limit: 10000,
    },
  });
  return s;
}
test("price estimates preserve unknown data instead of turning it into zero", () => {
  const rates = [{ model: "test", input: 10, output: 50 }];
  assert.equal(eventCost(event(), rates), 0.011);
  assert.equal(eventCost(event(), []), null);
  assert.equal(
    eventCost(event({ inputTokens: null, outputTokens: null }), rates),
    null,
  );
  assert.equal(eventCost(event({ source: "github" }), rates), null);
});
test("workspace writes reject stale revisions", () => {
  const s = workspace();
  assert.throws(
    () =>
      applyCommand(s, {
        type: "workspace",
        revision: 0,
        data: { name: "New" },
      }),
    /changed/,
  );
  assert.equal(s.name, "My workspace");
});
test("sync stable IDs preserve review decisions and do not duplicate source records", () => {
  const s = workspace();
  const first = event({
    review: { status: "reviewed", note: "Checked original evidence" },
  });
  upsertEvents(s, [first]);
  upsertEvents(s, [event({ title: "Updated title" })]);
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].review.note, "Checked original evidence");
  assert.equal(s.events[0].title, "Updated title");
});
test("adding an exact GitHub username maps retained work", () => {
  const s = emptyWorkspace();
  s.events = [
    event({
      source: "github",
      author: "ASHA",
      accountId: "",
      inputTokens: null,
      outputTokens: null,
    }),
  ];
  const next = applyCommand(s, {
    type: "account",
    revision: 0,
    data: {
      id: "a",
      name: "Asha",
      team: "Engineering",
      role: "Engineer",
      github: "asha",
      limit: 100,
    },
  });
  assert.equal(next.events[0].accountId, "a");
  assert.equal(s.events[0].accountId, "");
});
test("GitHub sync cannot insert records after disconnect", () => {
  const s = workspace();
  assert.throws(
    () =>
      applyCommand(s, {
        type: "github",
        revision: s.revision,
        data: { id: "gone", events: [] },
      }),
    /removed/,
  );
});
test("workspace enforces five repositories and stable reconnections", () => {
  let s = workspace();
  for (let i = 0; i < 5; i++)
    s = applyCommand(s, {
      type: "connection",
      revision: s.revision,
      data: { repository: `owner/repo-${i}` },
    });
  s = applyCommand(s, {
    type: "connection",
    revision: s.revision,
    data: { repository: "owner/repo-0" },
  });
  assert.equal(s.connections.length, 5);
  assert.throws(
    () =>
      applyCommand(s, {
        type: "connection",
        revision: s.revision,
        data: { repository: "owner/sixth" },
      }),
    /five/,
  );
});
test("month counters use UTC and include unresolved reservations", () => {
  const s = workspace();
  s.events = [
    event(),
    event({ id: "e2", time: "2026-11-01T00:00:00Z" }),
    event({
      id: "e3",
      inputTokens: null,
      outputTokens: null,
      reservedTokens: 500,
    }),
  ];
  assert.equal(usedTokens(s, "a", "2026-10"), 800);
  assert.equal(usedTokens(s, "a", "2026-11"), 300);
});
test("reviewing unknown usage does not release its reservation", () => {
  let s = workspace();
  s.events = [
    event({
      inputTokens: null,
      outputTokens: null,
      reservedTokens: 500,
      status: "unknown",
    }),
  ];
  s = applyCommand(s, {
    type: "review",
    revision: s.revision,
    data: { id: "e1", status: "reviewed", note: "Waiting for invoice" },
  });
  assert.equal(s.events[0].reservedTokens, 500);
});
test("unknown and unpriced usage remain visible in totals", () => {
  const s = workspace();
  s.events = [
    event(),
    event({
      id: "e2",
      inputTokens: null,
      outputTokens: null,
      issue: "Unknown outcome",
    }),
  ];
  const t = totals(s);
  assert.equal(t.tokens, 300);
  assert.equal(t.unknown, 1);
  assert.equal(t.priced, 0);
  assert.equal(t.reviews, 1);
});
test("project briefs combine repository evidence without inventing completion", () => {
  const s = workspace();
  s.connections = [
    { id: "c", repository: "owner/repo", description: "Project purpose" },
  ];
  s.events = [event({ project: "owner/repo", kind: "request" })];
  const brief = projectBriefs(s)[0];
  assert.equal(brief.description, "Project purpose");
  assert.match(brief.brief, /1 tracked AI requests/);
  assert.equal(brief.people[0], "a");
});
test("cost comparison matches the original worked example without double counting review time", () => {
  const r = savings({
    before: 110,
    after: 77,
    fee: 12,
    hosting: 3,
    hours: 2,
    hourly: 4,
    setup: 60,
    tasksBefore: 400,
    tasksAfter: 400,
    quality: true,
  });
  assert.equal(r.cash, 18);
  assert.equal(r.afterTime, 10);
  assert.equal(r.firstMonth, -42);
  assert.equal(r.payback, 60 / 18);
  assert.equal(r.beforePerTask, 0.275);
  assert.equal(r.comparable, true);
});
test("negative benefit gives no positive payback and unequal work is not comparable", () => {
  const r = savings({
    before: 10,
    after: 30,
    fee: 5,
    hosting: 3,
    hours: 0,
    hourly: 0,
    setup: 60,
    tasksBefore: 400,
    tasksAfter: 200,
    quality: true,
  });
  assert.equal(r.payback, null);
  assert.equal(r.comparable, false);
  assert.throws(() => savings({ before: NaN }), /non-negative/);
});
test("CSV handles escaped quotes, newlines and BOMs", () => {
  assert.deepEqual(
    parseCSV('\uFEFFid,title\r\na,"He said ""yes""\nagain"\r\n'),
    [
      ["id", "title"],
      ["a", 'He said "yes"\nagain'],
    ],
  );
  assert.throws(() => parseCSV('id,"unclosed'), /unclosed/);
});
test("CSV export neutralizes spreadsheet formulas", () => {
  const x = toCSV([['=HYPERLINK("x")', " +1", "-2", "@sum", "normal"]]);
  assert.ok(x.includes("'=HYPERLINK"));
  assert.ok(x.includes("' +1"));
  assert.ok(x.includes("'-2"));
});
test("CSV import validates all records before writing and stays in separate ledger", () => {
  const events = importEvents(
    toCSV([
      HEADERS,
      [
        "1",
        "2026-10-19T00:00:00Z",
        "a",
        "Support",
        "Draft reply",
        "test",
        "100",
        "200",
      ],
    ]),
  );
  assert.equal(events[0].source, "import");
  assert.equal(events[0].id, "import:1");
  assert.throws(
    () =>
      importEvents(
        toCSV([
          HEADERS,
          ["1", "2026-10-19T00:00:00Z", "a", "P", "T", "test", "-1", "20"],
        ]),
      ),
    /whole/,
  );
});
test("backups reject secrets, malformed accounts and duplicate IDs", () => {
  const s = workspace();
  s.connections = [{ id: "c", repository: "owner/repo", token: "secret" }];
  assert.throws(() => validateWorkspace(s), /token/);
  s.connections = [];
  s.accounts.push({ ...s.accounts[0] });
  assert.throws(() => validateWorkspace(s), /Duplicate/);
});
test("repository and source URLs reject injection and unsafe schemes", () => {
  assert.equal(repository("Owner/Repo"), "owner/repo");
  assert.throws(() => repository("../secret"), /repository/);
  assert.throws(() => repository("owner/repo?token=x"), /repository/);
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("https://github.com/a/b"), "https://github.com/a/b");
});
test("GitHub empty repositories are valid and larger windows are marked partial", async () => {
  const fetcher = async (url) => {
    if (url.includes("/commits")) return new Response("", { status: 409 });
    if (url.includes("/pulls"))
      return Response.json([], { headers: { link: '<next>; rel="next"' } });
    return Response.json({ description: "Empty project", private: false });
  };
  const r = await collectRepository("owner/repo", [], "", fetcher);
  assert.deepEqual(r.events, []);
  assert.match(r.coverage, /Partial/);
});
test("GitHub collection uses stable provider IDs and exact author mapping", async () => {
  const fetcher = async (url) => {
    if (url.includes("/commits"))
      return Response.json([
        {
          sha: "abc",
          author: { login: "asha" },
          commit: {
            message: "Fix\nDetails",
            author: { date: "2026-10-19T00:00:00Z" },
          },
          html_url: "https://github.com/owner/repo/commit/abc",
        },
      ]);
    if (url.includes("/pulls")) return Response.json([]);
    return Response.json({ description: "Project", private: false });
  };
  const r = await collectRepository(
    "owner/repo",
    workspace().accounts,
    "",
    fetcher,
  );
  assert.equal(r.events[0].id, "github:owner/repo:commit:abc");
  assert.equal(r.events[0].accountId, "a");
  assert.equal(r.events[0].title, "Fix");
  assert.equal(r.events[0].inputTokens, null);
});
test("retention preserves the full budget month and every unresolved reservation", () => {
  const s = workspace();
  s.settings.retentionDays = 30;
  s.events = [
    event({ id: "current", time: "2026-10-01T00:00:00Z" }),
    event({ id: "old", time: "2026-08-01T00:00:00Z" }),
    event({
      id: "unknown",
      time: "2026-08-01T00:00:00Z",
      inputTokens: null,
      outputTokens: null,
      reservedTokens: 500,
      status: "unknown",
    }),
  ];
  pruneEvents(s, new Date("2026-10-31T23:00:00Z"));
  assert.deepEqual(
    s.events.map((e) => e.id),
    ["current", "unknown"],
  );
});
test("imported token reports never consume managed AI allowances", () => {
  const s = workspace();
  s.events = [
    event({ source: "import", inputTokens: 999999, outputTokens: 999999 }),
  ];
  assert.equal(usedTokens(s, "a", "2026-10"), 0);
  assert.equal(totals(s).tokens, 0);
});
test("all application views render with both example and empty data", async () => {
  const { shell } = await import("../dist/views.js");
  const { demoWorkspace } = await import("../dist/demo.js");
  for (const state of [emptyWorkspace(), demoWorkspace()])
    for (const page of [
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
    ]) {
      const result = shell({
        s: state,
        page,
        mode: state.demo ? "demo" : "local",
        range: "30",
        events: state.events,
        capabilities: {},
        filter: "",
        source: "",
        accountFilter: "",
        planningTab: "tasks",
      });
      assert.match(result, /<main/);
      assert.ok(!result.includes("undefined"), page);
    }
});
