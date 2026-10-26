import { repository } from "./domain.js";
export async function collectRepository(
  repo,
  accounts,
  token = "",
  fetcher = fetch,
) {
  repo = repository(repo);
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  async function read(path, empty = false) {
    const r = await fetcher(`https://api.github.com/repos/${repo}${path}`, {
      headers,
      signal: AbortSignal.timeout(20000),
    });
    if (empty && r.status === 409) return { data: [], full: false };
    if (!r.ok)
      throw new Error(
        `GitHub returned ${r.status}. Check repository access or the API rate limit.`,
      );
    return {
      data: await r.json(),
      full: !!r.headers.get("link")?.includes('rel="next"'),
    };
  }
  const meta = await read("");
  const commits = await read("/commits?per_page=100", true);
  const prs = await read(
    "/pulls?state=all&sort=updated&direction=desc&per_page=100",
  );
  const map = (login) =>
    accounts.find(
      (a) => a.github && a.github.toLowerCase() === login?.toLowerCase(),
    )?.id || "";
  const events = [
    ...commits.data.map((c) => {
      const author = c.author?.login || c.commit.author?.name || "Unknown";
      return {
        id: `github:${repo}:commit:${c.sha}`,
        source: "github",
        kind: "commit",
        title: c.commit.message.split("\n")[0].slice(0, 500),
        author,
        accountId: map(author),
        project: repo,
        time: c.commit.author?.date || c.commit.committer.date,
        url: c.html_url,
        inputTokens: null,
        outputTokens: null,
        issue: map(author) ? "" : "GitHub author is not mapped to an account.",
      };
    }),
    ...prs.data.map((p) => {
      const author = p.user?.login || "Unknown";
      return {
        id: `github:${repo}:pr:${p.number}`,
        source: "github",
        kind: "pull_request",
        title: p.title.slice(0, 500),
        author,
        accountId: map(author),
        project: repo,
        time: p.updated_at,
        url: p.html_url,
        state: p.merged_at ? "merged" : p.draft ? "draft" : p.state,
        inputTokens: null,
        outputTokens: null,
        issue: map(author) ? "" : "GitHub author is not mapped to an account.",
      };
    }),
  ];
  return {
    events,
    description: meta.data.description || "",
    private: meta.data.private,
    coverage:
      commits.full || prs.full
        ? "Partial: more than 100 commits or pull requests."
        : "Up to 100 default-branch commits and 100 recently updated pull requests; this is a bounded activity window.",
  };
}
