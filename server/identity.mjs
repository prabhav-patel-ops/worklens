import { randomBytes, createHash } from "node:crypto";
import {
  assert,
  account,
  identityPolicyKey,
  remapGitHub,
} from "../shared/domain.js";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("hex");
function init(store) {
  store.db.exec(
    "CREATE TABLE IF NOT EXISTS identity_invites (id TEXT PRIMARY KEY,account_id TEXT NOT NULL,policy TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);CREATE TABLE IF NOT EXISTS identity_states (id TEXT PRIMARY KEY,invite_id TEXT NOT NULL,expires INTEGER NOT NULL);",
  );
}
function config(env) {
  assert(
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.GITHUB_CALLBACK_URL,
    "GitHub employee sign-in is not activated. The operator must configure the GitHub OAuth application first.",
  );
  const url = new URL(env.GITHUB_CALLBACK_URL);
  assert(
    url.pathname === "/auth/github/callback" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password,
    "Configure the exact /auth/github/callback address.",
  );
  assert(
    url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)),
    "GitHub callback must use HTTPS outside localhost.",
  );
  return url;
}
export function createIdentityInvite(store, accountId, env, now = Date.now()) {
  init(store);
  const callback = config(env),
    s = store.read(),
    a = account(s, accountId);
  assert(
    a.github,
    "Add the employee GitHub username before inviting verification.",
  );
  const value = random(),
    expires = now + 3600000;
  store.db.prepare("DELETE FROM identity_invites WHERE expires < ?").run(now);
  store.db.prepare("DELETE FROM identity_states WHERE expires < ?").run(now);
  store.db
    .prepare(
      "INSERT INTO identity_invites(id,account_id,policy,expires) VALUES(?,?,?,?)",
    )
    .run(hash(value), a.id, identityPolicyKey(s.identityPolicy), expires);
  const url = new URL("/auth/github/start", callback);
  url.searchParams.set("invite", value);
  return { url: url.href, expiresAt: new Date(expires).toISOString() };
}
export async function verifyGitHubIdentity(
  accessToken,
  a,
  policy,
  fetcher = fetch,
) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  async function read(path) {
    const r = await fetcher("https://api.github.com" + path, {
      headers,
      signal: AbortSignal.timeout(20000),
    });
    assert(
      r.ok,
      "GitHub identity or organization membership could not be verified.",
    );
    return r.json();
  }
  const profile = await read("/user");
  assert(
    profile.login?.toLowerCase() === a.github.toLowerCase(),
    "The signed-in GitHub account does not match the invited employee.",
  );
  const emails = await read("/user/emails");
  assert(
    Array.isArray(emails),
    "GitHub did not return verified email information.",
  );
  const valid = emails.filter(
    (e) =>
      e.verified === true &&
      typeof e.email === "string" &&
      (!a.email || e.email.toLowerCase() === a.email.toLowerCase()) &&
      (policy.mode !== "company" ||
        e.email.split("@")[1]?.toLowerCase() === policy.domain),
  );
  assert(
    valid.length,
    "Add and verify the required work email in GitHub, then try again.",
  );
  if (policy.mode === "company") {
    const membership = await read(
      "/user/memberships/orgs/" + encodeURIComponent(policy.organization),
    );
    assert(
      membership.state === "active",
      "Active membership in the company GitHub organization is required.",
    );
  }
  const email = (valid.find((e) => e.primary) || valid[0]).email.toLowerCase();
  return {
    provider: "github",
    github: profile.login.toLowerCase(),
    githubId: String(profile.id),
    email,
    mode: policy.mode,
    organization: policy.organization || "",
    policy: identityPolicyKey(policy),
    verifiedAt: new Date().toISOString(),
  };
}
export async function handleIdentityRoute(
  req,
  res,
  url,
  store,
  env,
  fetcher = fetch,
) {
  if (!["/auth/github/start", "/auth/github/callback"].includes(url.pathname))
    return false;
  assert(req.method === "GET", "Use the employee verification link.");
  init(store);
  const callback = config(env),
    now = Date.now();
  if (url.pathname === "/auth/github/start") {
    const value = url.searchParams.get("invite") || "";
    assert(/^[a-f0-9]{64}$/.test(value), "Invalid verification invitation.");
    const invite = store.db
      .prepare("SELECT * FROM identity_invites WHERE id=?")
      .get(hash(value));
    assert(
      invite && invite.expires > now && !invite.used,
      "This employee invitation expired or was already used. Ask the owner for a new link.",
    );
    const state = random();
    store.db
      .prepare(
        "INSERT INTO identity_states(id,invite_id,expires) VALUES(?,?,?)",
      )
      .run(hash(state), invite.id, now + 600000);
    const target = new URL("https://github.com/login/oauth/authorize");
    target.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    target.searchParams.set("redirect_uri", callback.href);
    target.searchParams.set("state", state);
    target.searchParams.set(
      "scope",
      invite.policy.startsWith("company:")
        ? "read:user user:email read:org"
        : "read:user user:email",
    );
    res.writeHead(302, { Location: target.href, "Cache-Control": "no-store" });
    res.end();
    return true;
  }
  const state = url.searchParams.get("state") || "",
    code = url.searchParams.get("code") || "";
  assert(
    /^[a-f0-9]{64}$/.test(state) && code.length > 0 && code.length <= 1000,
    "GitHub authorization was cancelled or returned an invalid callback.",
  );
  const pending = store.db
    .prepare("SELECT * FROM identity_states WHERE id=?")
    .get(hash(state));
  assert(
    pending && pending.expires > now,
    "The GitHub sign-in session expired or was already used.",
  );
  store.db.prepare("DELETE FROM identity_states WHERE id=?").run(hash(state));
  const invite = store.db
    .prepare("SELECT * FROM identity_invites WHERE id=?")
    .get(pending.invite_id);
  assert(
    invite && invite.expires > now && !invite.used,
    "The employee invitation is no longer valid.",
  );
  const s = store.read(),
    a = account(s, invite.account_id);
  assert(
    invite.policy === identityPolicyKey(s.identityPolicy),
    "The company verification policy changed. Ask for a new invitation.",
  );
  const response = await fetcher(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: callback.href,
      }),
      signal: AbortSignal.timeout(20000),
    },
  );
  assert(response.ok, "GitHub authorization could not be completed.");
  const result = await response.json();
  assert(
    typeof result.access_token === "string",
    "GitHub did not authorize identity verification.",
  );
  const proof = await verifyGitHubIdentity(
    result.access_token,
    a,
    s.identityPolicy,
    fetcher,
  );
  store.transaction((current) => {
    const liveInvite = store.db
      .prepare("SELECT * FROM identity_invites WHERE id=?")
      .get(invite.id);
    assert(liveInvite && !liveInvite.used, "This invitation was already used.");
    assert(
      invite.policy === identityPolicyKey(current.identityPolicy),
      "The company policy changed. Ask for a new invitation.",
    );
    const employee = account(current, a.id);
    assert(
      employee.github === a.github &&
        (employee.email || "") === (a.email || ""),
      "The invited account changed. Ask for a new invitation.",
    );
    employee.identity = proof;
    remapGitHub(current);
    current.revision++;
    store.save(current);
    store.db
      .prepare("UPDATE identity_invites SET used=1 WHERE id=?")
      .run(invite.id);
  });
  // The short-lived GitHub user token is deliberately not persisted.
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Worklens identity verified</title><body><h1>GitHub identity verified</h1><p>Your GitHub identity and the workspace email requirements were verified. You can close this window. The workspace owner will see the result after refreshing Worklens.</p></body></html>',
  );
  return true;
}
