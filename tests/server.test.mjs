import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.mjs";
import {
  reserve,
  settle,
  reconcile,
  recoverPending,
  managedRequest,
} from "../server/ai.mjs";
import { createApp } from "../server/index.mjs";
import { applyCommand } from "../shared/domain.js";
const input = (extra = {}) => ({
  id: "request-1",
  accountId: "a",
  project: "Support",
  title: "Draft reply",
  prompt: "Hello",
  maxOutputTokens: 100,
  ...extra,
});
function setup() {
  const store = new Store(":memory:", "ab".repeat(32));
  store.save(
    applyCommand(store.read(), {
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
    }),
  );
  return store;
}
test("private repository credentials are authenticated-encrypted and connection-bound", () => {
  const store = setup();
  try {
    store.setSecret("a", "secret-token");
    assert.equal(store.secret("a"), "secret-token");
    const row = store.db.prepare("SELECT encrypted FROM secrets").get();
    assert.ok(!row.encrypted.includes("secret-token"));
    store.db.prepare("INSERT INTO secrets VALUES(?,?)").run("b", row.encrypted);
    assert.throws(() => store.secret("b"));
    assert.ok(!JSON.stringify(store.read()).includes("secret-token"));
  } finally {
    store.close();
  }
});
test("budget reservation and duplicate request IDs send only once", () => {
  const store = setup();
  try {
    const a = reserve(store, input());
    assert.equal(a.duplicate, false);
    const b = reserve(store, input());
    assert.equal(b.duplicate, true);
    assert.equal(store.read().events.length, 1);
    assert.throws(
      () => reserve(store, input({ prompt: "Changed" })),
      /different/,
    );
  } finally {
    store.close();
  }
});
test("only one pending managed request is allowed per owner workspace", () => {
  const store = setup();
  try {
    reserve(store, input());
    assert.throws(
      () => reserve(store, input({ id: "second" })),
      /already active/,
    );
  } finally {
    store.close();
  }
});
test("paused accounts and exhausted allowances are rejected before provider execution", () => {
  const store = setup();
  try {
    let s = store.read();
    s.accounts[0].paused = true;
    store.save(s);
    assert.throws(() => reserve(store, input()), /paused/);
    s.accounts[0].paused = false;
    s.settings.companyLimit = 1;
    store.save(s);
    assert.throws(() => reserve(store, input()), /Company token allowance/);
    assert.equal(store.read().events.length, 0);
  } finally {
    store.close();
  }
});
test("settlement happens once and late failures cannot overwrite known usage", () => {
  const store = setup();
  try {
    const { request } = reserve(store, input());
    assert.equal(
      settle(store, request, {
        inputTokens: 20,
        outputTokens: 30,
        model: "test",
        status: "completed",
      }),
      true,
    );
    assert.equal(
      settle(store, request, {
        inputTokens: null,
        outputTokens: null,
        status: "unknown",
      }),
      false,
    );
    assert.equal(store.read().events[0].inputTokens, 20);
    assert.equal(store.read().events[0].reservedTokens, 0);
  } finally {
    store.close();
  }
});
test("missing usage stays unknown and retains the reservation", async () => {
  const store = setup();
  try {
    const result = await managedRequest(
      store,
      input(),
      { OPENAI_API_KEY: "test" },
      async () => Response.json({ model: "test", output: [] }),
    );
    assert.equal(result.workspace.events[0].status, "unknown");
    assert.equal(result.workspace.events[0].inputTokens, null);
    assert.ok(result.workspace.events[0].reservedTokens > 0);
  } finally {
    store.close();
  }
});
test("network timeout preserves unknown outcome for later reconciliation", async () => {
  const store = setup();
  try {
    await assert.rejects(
      () =>
        managedRequest(store, input(), { OPENAI_API_KEY: "test" }, async () => {
          throw new Error("timeout");
        }),
      /timeout/,
    );
    assert.equal(store.read().events[0].status, "unknown");
    assert.ok(store.read().events[0].reservedTokens > 0);
  } finally {
    store.close();
  }
});
test("explicit provider rejections release allowance but server failures remain unknown", async () => {
  for (const status of [401, 500]) {
    const store = setup();
    try {
      await assert.rejects(() =>
        managedRequest(
          store,
          input(),
          { OPENAI_API_KEY: "test" },
          async () => new Response("", { status }),
        ),
      );
      const e = store.read().events[0];
      assert.equal(e.status, status === 401 ? "rejected" : "unknown");
      assert.equal(e.inputTokens, status === 401 ? 0 : null);
      assert.equal(e.reservedTokens === 0, status === 401);
    } finally {
      store.close();
    }
  }
});
test("successful managed request retains usage but not prompt or answer bodies", async () => {
  const store = setup();
  try {
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return Response.json({
        status: "completed",
        model: "test",
        usage: { input_tokens: 12, output_tokens: 18 },
        output: [
          { content: [{ type: "output_text", text: "Private response" }] },
        ],
      });
    };
    const r = await managedRequest(
      store,
      input({ prompt: "Private prompt" }),
      { OPENAI_API_KEY: "test" },
      fetcher,
    );
    assert.equal(r.answer, "Private response");
    assert.ok(!JSON.stringify(store.read()).includes("Private prompt"));
    assert.ok(!JSON.stringify(store.read()).includes("Private response"));
    await managedRequest(
      store,
      input({ prompt: "Private prompt" }),
      { OPENAI_API_KEY: "test" },
      fetcher,
    );
    assert.equal(calls, 1);
  } finally {
    store.close();
  }
});
test("stale requests recover as unknown and reject late provider settlement", () => {
  const store = setup();
  try {
    const { request } = reserve(
      store,
      input(),
      new Date("2026-10-19T00:00:00Z"),
    );
    recoverPending(store, new Date("2026-10-19T00:03:00Z"));
    assert.equal(store.read().events[0].status, "unknown");
    assert.equal(
      settle(store, request, {
        inputTokens: 1,
        outputTokens: 1,
        status: "completed",
      }),
      false,
    );
  } finally {
    store.close();
  }
});
test("reconciliation requires verified nonnegative counts and marks owner-entered usage", () => {
  const store = setup();
  try {
    const { request } = reserve(store, input());
    settle(store, request, {
      inputTokens: null,
      outputTokens: null,
      model: "test",
      status: "unknown",
    });
    assert.throws(
      () =>
        reconcile(store, {
          id: "ai:request-1",
          inputTokens: -1,
          outputTokens: 1,
          note: "provider record",
        }),
      /non-negative/,
    );
    const s = reconcile(store, {
      id: "ai:request-1",
      inputTokens: 0,
      outputTokens: 0,
      note: "Provider confirms no billable usage",
    });
    assert.equal(s.events[0].attribution, "owner-entered");
    assert.equal(s.events[0].reservedTokens, 0);
    assert.throws(
      () =>
        reconcile(store, {
          id: "ai:request-1",
          inputTokens: 0,
          outputTokens: 0,
          note: "Again",
        }),
      /Only an unknown/,
    );
  } finally {
    store.close();
  }
});
test("failed database transaction rolls back state and request evidence together", () => {
  const store = setup();
  try {
    const before = store.read();
    assert.throws(() =>
      store.transaction((s) => {
        s.name = "Changed";
        store.save(s);
        throw new Error("fail");
      }),
    );
    assert.deepEqual(store.read(), before);
  } finally {
    store.close();
  }
});
test("HTTP boundary rejects anonymous access, wrong origins and stale writes", async () => {
  const store = setup();
  const token = "x".repeat(32);
  const { server } = createApp({
    store,
    env: {
      WORKLENS_OWNER_TOKEN: token,
      WORKLENS_ORIGIN: "http://localhost:4173",
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + "/api/workspace")).status, 401);
    assert.equal(
      (
        await fetch(base + "/api/workspace", {
          headers: {
            Authorization: "Bearer " + token,
            Origin: "https://evil.example",
          },
        })
      ).status,
      403,
    );
    const ok = await fetch(base + "/api/workspace", {
      headers: { Authorization: "Bearer " + token },
    });
    assert.equal(ok.status, 200);
    const r = await fetch(base + "/api/command", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "workspace",
        revision: 0,
        data: { name: "Overwrite" },
      }),
    });
    assert.equal(r.status, 409);
    assert.equal(store.read().name, "My workspace");
  } finally {
    await new Promise((r) => server.close(r));
    store.close();
  }
});
test("HTTP boundary serves the app but never serves source secrets or database", async () => {
  const store = setup();
  const { server } = createApp({ store, env: {} });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const index = await fetch(base + "/");
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Worklens/);
    assert.equal((await fetch(base + "/.env")).status, 404);
    assert.equal((await fetch(base + "/data/worklens.db")).status, 404);
    assert.equal((await fetch(base + "/api/workspace")).status, 503);
  } finally {
    await new Promise((r) => server.close(r));
    store.close();
  }
});
