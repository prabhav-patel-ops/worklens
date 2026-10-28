import { assert, githubLogin, repository } from "./domain.js?v=921d4f1575f1";
import { collectRepository } from "./github.js?v=921d4f1575f1";
export async function discoverRepositories(
  type,
  login,
  token = "",
  fetcher = fetch,
) {
  login = githubLogin(login);
  assert(
    ["user", "organization"].includes(type),
    "Choose account or organization.",
  );
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  async function read(path) {
    const r = await fetcher("https://api.github.com" + path, {
      headers,
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok)
      throw new Error(
        `GitHub returned ${r.status}. Check the account, approved access and API rate limit.`,
      );
    return {
      data: await r.json(),
      next: !!r.headers.get("link")?.includes('rel="next"'),
    };
  }
  let prefix =
    type === "organization"
      ? `/orgs/${login}/repos?type=all&sort=full_name`
      : `/users/${login}/repos?type=owner&sort=full_name`;
  if (type === "user" && token) {
    const identity = await read("/user");
    assert(
      identity.data.login?.toLowerCase() === login,
      "The private-account token must belong to the GitHub account being connected.",
    );
    prefix = "/user/repos?affiliation=owner&visibility=all&sort=full_name";
  }
  const found = new Map();
  let complete = false;
  for (let page = 1; page <= 5; page++) {
    const r = await read(prefix + `&per_page=100&page=${page}`);
    assert(
      Array.isArray(r.data),
      "GitHub returned an invalid repository list.",
    );
    for (const item of r.data) {
      const name = repository(item.full_name);
      if (!name.startsWith(login + "/")) continue;
      found.set(name, {
        name,
        description: String(item.description || "").slice(0, 1000),
        private: !!item.private,
        archived: !!item.archived,
      });
    }
    if (!r.next) {
      complete = true;
      break;
    }
  }
  return {
    repositories: [...found.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    discoveryComplete: complete,
    visibility: token ? "authorized" : "public",
  };
}
export async function collectSource(
  source,
  accounts,
  token = "",
  fetcher = fetch,
  { batchSize = token ? 5 : 2, now = new Date().toISOString() } = {},
) {
  const discovered = await discoverRepositories(
    source.type,
    source.login,
    token,
    fetcher,
  );
  const previous = new Map((source.repositories || []).map((r) => [r.name, r]));
  const repos = discovered.repositories.map((r) => ({
    ...previous.get(r.name),
    ...r,
  }));
  // A rotating queue uses last-check times, so new repositories are collected first
  // and a sorted-list insertion cannot permanently skip an existing project.
  const pending = [...repos]
    .sort(
      (a, b) =>
        (a.checkedAt || "").localeCompare(b.checkedAt || "") ||
        a.name.localeCompare(b.name),
    )
    .slice(0, batchSize);
  const events = [];
  let errors = 0,
    checked = 0;
  for (const repo of pending) {
    repo.checkedAt = now;
    checked++;
    try {
      const result = await collectRepository(
        repo.name,
        accounts,
        token,
        fetcher,
      );
      events.push(...result.events);
      repo.syncedAt = now;
      repo.coverage = result.coverage;
      repo.error = "";
    } catch (error) {
      repo.error = error.message;
      errors++;
      if (/403|429/.test(error.message)) break;
    }
  }
  const collected = repos.filter((r) => r.syncedAt).length;
  const coverage = `${repos.length} ${discovered.visibility === "public" ? "public" : "accessible"} repositories discovered${discovered.discoveryComplete ? "" : "; discovery is partial at the 500-repository limit"}. ${collected} have an activity snapshot; ${Math.max(0, repos.length - collected)} pending. This pass checked ${checked} repositories${errors ? ` with ${errors} source errors` : ""}. Commit and pull-request windows are bounded; this is not every GitHub action or a complete history. Newly accessible repositories are discovered on every sync.`;
  return { ...discovered, repositories: repos, events, cursor: 0, coverage };
}
