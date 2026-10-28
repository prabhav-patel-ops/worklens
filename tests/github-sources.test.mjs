import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverRepositories,
  collectSource,
} from "../shared/github-sources.js";
import {
  emptyWorkspace,
  applyCommand,
  projectBriefs,
  validateWorkspace,
} from "../shared/domain.js";
function rows(count, owner = "company") {
  return Array.from({ length: count }, (_, i) => ({
    full_name: `${owner}/repo-${i}`,
    description: `Project ${i}`,
    private: false,
  }));
}
function mock(repos) {
  return async (url) => {
    if (
      url.includes("/orgs/company/repos") ||
      url.includes("/users/person/repos")
    )
      return Response.json(repos);
    if (url.includes("/commits"))
      return Response.json([
        {
          sha: "abc",
          author: { login: "employee" },
          commit: {
            message: "Work evidence",
            author: { date: new Date().toISOString() },
          },
          html_url: "https://github.com/company/repo-0/commit/abc",
        },
      ]);
    if (url.includes("/pulls")) return Response.json([]);
    return Response.json({ description: "Project", private: false });
  };
}
test("account discovery follows repository pagination without manual entry", async () => {
  const seen = [];
  const fetcher = async (url) => {
    seen.push(url);
    return new URL(url).searchParams.get("page") === "1"
      ? Response.json(rows(100), { headers: { link: '<next>; rel="next"' } })
      : Response.json([{ full_name: "company/last", description: "Last" }]);
  };
  const r = await discoverRepositories("organization", "Company", "", fetcher);
  assert.equal(r.repositories.length, 101);
  assert.equal(r.discoveryComplete, true);
  assert.equal(seen.length, 2);
  assert.ok(
    seen.every((url) =>
      url.startsWith("https://api.github.com/orgs/company/repos"),
    ),
  );
});
test("discovery marks its bound as partial instead of claiming complete coverage", async () => {
  const r = await discoverRepositories(
    "organization",
    "company",
    "",
    async (url) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return Response.json(
        rows(100, `company`).map((x, i) => ({
          ...x,
          full_name: `company/p-${page}-${i}`,
        })),
        { headers: { link: '<next>; rel="next"' } },
      );
    },
  );
  assert.equal(r.repositories.length, 500);
  assert.equal(r.discoveryComplete, false);
});
test("private personal-account access checks the token owner", async () => {
  await assert.rejects(
    () =>
      discoverRepositories("user", "person", "private", async () =>
        Response.json({ login: "someone-else" }),
      ),
    /must belong/,
  );
  let requested = "";
  const result = await discoverRepositories(
    "user",
    "person",
    "private",
    async (url) => {
      requested = url;
      return url.endsWith("/user")
        ? Response.json({ login: "person" })
        : Response.json(rows(2, "person"));
    },
  );
  assert.equal(result.repositories.length, 2);
  assert.match(requested, /affiliation=owner/);
});
test("rotating scans discover new projects and eventually check each repository", async () => {
  const source = {
    id: "s",
    type: "organization",
    login: "company",
    repositories: [],
  };
  const first = await collectSource(source, [], "", mock(rows(4)), {
    now: "2026-10-29T01:00:00Z",
  });
  assert.equal(first.repositories.filter((r) => r.syncedAt).length, 2);
  const second = await collectSource(
    { ...source, repositories: first.repositories },
    [],
    "",
    mock(rows(4)),
    { now: "2026-10-29T02:00:00Z" },
  );
  assert.equal(second.repositories.filter((r) => r.syncedAt).length, 4);
  const third = await collectSource(
    { ...source, repositories: second.repositories },
    [],
    "",
    mock([...rows(4), { full_name: "company/new-project" }]),
    { now: "2026-10-29T03:00:00Z" },
  );
  assert.equal(
    third.repositories.find((r) => r.name === "company/new-project").syncedAt,
    "2026-10-29T03:00:00Z",
  );
});
test("a failed project does not starve other discovered projects", async () => {
  const fetcher = async (url) =>
    url.includes("/repo-0/commits")
      ? new Response("", { status: 500 })
      : mock(rows(3))(url);
  const first = await collectSource(
    { type: "organization", login: "company", repositories: [] },
    [],
    "",
    fetcher,
    { now: "2026-10-29T01:00:00Z" },
  );
  assert.match(first.repositories[0].error, /500/);
  const second = await collectSource(
    {
      type: "organization",
      login: "company",
      repositories: first.repositories,
    },
    [],
    "",
    fetcher,
    { now: "2026-10-29T02:00:00Z" },
  );
  assert.ok(
    second.repositories.find((r) => r.name === "company/repo-2").syncedAt,
  );
});
test("source upserts preserve reviews, and adding an employee maps retained company work", async () => {
  let s = applyCommand(emptyWorkspace(), {
    type: "github-source",
    revision: 0,
    data: { type: "organization", login: "company" },
  });
  const id = s.githubSources[0].id;
  const result = await collectSource(s.githubSources[0], [], "", mock(rows(1)));
  s = applyCommand(s, {
    type: "github-source-sync",
    revision: s.revision,
    data: { id, ...result },
  });
  s = applyCommand(s, {
    type: "review",
    revision: s.revision,
    data: { id: s.events[0].id, status: "reviewed", note: "Verified work" },
  });
  s = applyCommand(s, {
    type: "account",
    revision: s.revision,
    data: {
      id: "a",
      name: "Employee",
      github: "employee",
      email: "employee@company.com",
      team: "Engineering",
      role: "Developer",
      limit: 1000,
    },
  });
  assert.ok(s.events.every((e) => e.accountId === "a"));
  const before = s.events.length;
  s = applyCommand(s, {
    type: "github-source-sync",
    revision: s.revision,
    data: { id, ...result },
  });
  assert.equal(s.events.length, before);
  assert.equal(s.events[0].review.note, "Verified work");
  assert.equal(projectBriefs(s)[0].name, "company/repo-0");
});
test("disconnected or out-of-scope sources cannot insert later activity", () => {
  let s = applyCommand(emptyWorkspace(), {
    type: "github-source",
    revision: 0,
    data: { type: "organization", login: "company" },
  });
  const id = s.githubSources[0].id;
  assert.throws(
    () =>
      applyCommand(s, {
        type: "github-source-sync",
        revision: s.revision,
        data: {
          id,
          repositories: [{ name: "someone/private" }],
          events: [],
          cursor: 0,
          coverage: "bad",
        },
      }),
    /outside/,
  );
  s = applyCommand(s, {
    type: "github-source-disconnect",
    revision: s.revision,
    data: { id },
  });
  assert.throws(
    () =>
      applyCommand(s, {
        type: "github-source-sync",
        revision: s.revision,
        data: { id },
      }),
    /disconnected/,
  );
});
test("older backups gain source and personal identity defaults", () => {
  const s = emptyWorkspace();
  delete s.githubSources;
  delete s.identityPolicy;
  validateWorkspace(s);
  assert.deepEqual(s.githubSources, []);
  assert.equal(s.identityPolicy.mode, "personal");
});

test("backend sync records safe failure and clears it after recovery", async () => {
  const { Store } = await import("../server/store.mjs");
  const { syncGithubSource } = await import("../server/index.mjs");
  const store = new Store(":memory:");
  try {
    store.save(
      applyCommand(store.read(), {
        type: "github-source",
        revision: 0,
        data: { type: "organization", login: "company" },
      }),
    );
    const id = store.read().githubSources[0].id;
    await assert.rejects(() =>
      syncGithubSource(store, id, async () => {
        throw new Error("sensitive upstream details");
      }),
    );
    assert.match(store.read().githubSources[0].lastError, /sync failed/);
    assert.ok(!store.read().githubSources[0].lastError.includes("sensitive"));
    await syncGithubSource(store, id, mock(rows(1)));
    assert.equal(store.read().githubSources[0].lastError, "");
  } finally {
    store.close();
  }
});
