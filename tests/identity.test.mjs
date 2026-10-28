import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.mjs";
import { createApp } from "../server/index.mjs";
import {
  createIdentityInvite,
  verifyGitHubIdentity,
} from "../server/identity.mjs";
import { applyCommand } from "../shared/domain.js";
const company = {
  mode: "company",
  domain: "company.com",
  organization: "company",
};
const env = {
  WORKLENS_OWNER_TOKEN: "x".repeat(32),
  GITHUB_CLIENT_ID: "configured-client",
  GITHUB_CLIENT_SECRET: "test-only-secret",
  GITHUB_CALLBACK_URL: "http://localhost:4173/auth/github/callback",
};
function setup() {
  const store = new Store(":memory:");
  store.save(
    applyCommand(store.read(), {
      type: "account",
      revision: 0,
      data: {
        id: "a",
        name: "Employee",
        team: "Engineering",
        role: "Engineer",
        github: "employee",
        email: "employee@company.com",
        limit: 1000,
      },
    }),
  );
  return store;
}
function github({
  login = "employee",
  email = "employee@company.com",
  verified = true,
  state = "active",
} = {}) {
  return async (url) => {
    if (url === "https://github.com/login/oauth/access_token")
      return Response.json({ access_token: "temporary-token" });
    if (url.endsWith("/user/emails"))
      return Response.json([{ email, verified, primary: true }]);
    if (url.includes("/user/memberships/orgs/"))
      return Response.json({ state });
    if (url.endsWith("/user")) return Response.json({ login, id: 123 });
    throw new Error("Unexpected identity URL");
  };
}
test("company identity requires verified work email and active organization membership", async () => {
  const a = { github: "employee", email: "employee@company.com" };
  const proof = await verifyGitHubIdentity("token", a, company, github());
  assert.equal(proof.mode, "company");
  assert.equal(proof.email, "employee@company.com");
  for (const mock of [
    { verified: false },
    { email: "employee@personal.com" },
    { state: "pending" },
    { login: "someone-else" },
  ])
    await assert.rejects(() =>
      verifyGitHubIdentity("token", a, company, github(mock)),
    );
});
test("personal testing still verifies ownership through GitHub", async () => {
  const proof = await verifyGitHubIdentity(
    "token",
    { github: "employee" },
    { mode: "personal", domain: "", organization: "" },
    github({ email: "employee@personal.com" }),
  );
  assert.equal(proof.mode, "personal");
  assert.equal(proof.organization, "");
});
test("typing email does not create verification and policy changes clear previous proof", () => {
  const store = setup();
  try {
    let s = store.read();
    assert.equal(s.accounts[0].identity, null);
    s.accounts[0].identity = { provider: "github" };
    s = applyCommand(s, {
      type: "identity-policy",
      revision: s.revision,
      data: company,
    });
    assert.equal(s.accounts[0].identity, null);
    assert.throws(
      () =>
        applyCommand(s, {
          type: "account",
          revision: s.revision,
          data: {
            id: "b",
            name: "Duplicate",
            github: "employee",
            email: "another@company.com",
            team: "T",
            role: "R",
            limit: 100,
          },
        }),
      /already mapped/,
    );
  } finally {
    store.close();
  }
});
test("employee invitations need configured sign-in and do not expose the owner token", () => {
  const store = setup();
  try {
    assert.throws(() => createIdentityInvite(store, "a", {}), /not activated/);
    const invite = createIdentityInvite(store, "a", env);
    assert.ok(
      invite.url.startsWith("http://localhost:4173/auth/github/start?invite="),
    );
    assert.ok(!JSON.stringify(invite).includes(env.WORKLENS_OWNER_TOKEN));
    assert.ok(!JSON.stringify(store.read()).includes("temporary-token"));
  } finally {
    store.close();
  }
});
test("OAuth state is one-use, verifies the invited account and never saves access tokens", async () => {
  const store = setup();
  store.save(
    applyCommand(store.read(), {
      type: "identity-policy",
      revision: store.read().revision,
      data: company,
    }),
  );
  const { server } = createApp({ store, env, fetcher: github() });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const invite = createIdentityInvite(store, "a", env);
    const start = await fetch(
      base + new URL(invite.url).pathname + new URL(invite.url).search,
      { redirect: "manual" },
    );
    assert.equal(start.status, 302);
    const target = new URL(start.headers.get("location"));
    assert.match(target.searchParams.get("scope"), /read:org/);
    const state = target.searchParams.get("state");
    const callback =
      base + `/auth/github/callback?code=test-code&state=${state}`;
    const done = await fetch(callback);
    assert.equal(done.status, 200);
    assert.match(await done.text(), /identity verified/);
    assert.equal(
      store.read().accounts[0].identity.email,
      "employee@company.com",
    );
    assert.ok(!JSON.stringify(store.read()).includes("temporary-token"));
    assert.equal((await fetch(callback)).status, 409);
    assert.equal(
      (
        await fetch(
          base + new URL(invite.url).pathname + new URL(invite.url).search,
          { redirect: "manual" },
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await fetch(
          base + "/auth/github/callback?code=wrong&state=" + "f".repeat(64),
        )
      ).status,
      409,
    );
  } finally {
    await new Promise((r) => server.close(r));
    store.close();
  }
});

test("backup restore clears identity claims and invalidates outstanding invitations", async () => {
  const store = setup();
  const { server } = createApp({ store, env, fetcher: github() });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    createIdentityInvite(store, "a", env);
    const workspace = store.read();
    workspace.accounts[0].identity = {
      provider: "github",
      email: "forged@company.com",
    };
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/restore`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WORKLENS_OWNER_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ revision: workspace.revision, workspace }),
      },
    );
    assert.equal(response.status, 200);
    assert.equal(store.read().accounts[0].identity, null);
    assert.equal(
      store.db.prepare("SELECT count(*) AS n FROM identity_invites").get().n,
      0,
    );
  } finally {
    await new Promise((r) => server.close(r));
    store.close();
  }
});
