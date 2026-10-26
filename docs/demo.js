import { emptyWorkspace } from "./shared/domain.js";
export function demoWorkspace() {
  const s = emptyWorkspace();
  s.name = "Northstar Digital";
  s.demo = true;
  s.accounts = [
    {
      id: "asha",
      name: "Asha Shah",
      team: "Engineering",
      role: "Frontend engineer",
      github: "asha-example",
      limit: 1500000,
      paused: false,
    },
    {
      id: "rahul",
      name: "Rahul Mehta",
      team: "Customer success",
      role: "Support lead",
      github: "rahul-example",
      limit: 1200000,
      paused: false,
    },
    {
      id: "meera",
      name: "Meera Rao",
      team: "Marketing",
      role: "Content strategist",
      github: "meera-example",
      limit: 900000,
      paused: false,
    },
    {
      id: "neel",
      name: "Neel Desai",
      team: "Operations",
      role: "Operations analyst",
      github: "neel-example",
      limit: 600000,
      paused: false,
    },
  ];
  s.settings = {
    companyLimit: 5000000,
    retentionDays: 90,
    rates: [{ model: "example-model", input: 10, output: 50 }],
  };
  s.connections = [
    {
      id: "demo-repo-1",
      repository: "northstar-example/customer-portal",
      description:
        "A simpler customer portal, from onboarding to renewal. The engineering team is shipping a clearer account experience.",
      lastSync: new Date().toISOString(),
      coverage: "Synthetic example data",
      private: false,
    },
    {
      id: "demo-repo-2",
      repository: "northstar-example/support-toolkit",
      description:
        "Reusable answers and better internal tools for the customer success team.",
      lastSync: new Date().toISOString(),
      coverage: "Synthetic example data",
      private: false,
    },
  ];
  const titles = [
    "Draft renewal reply",
    "Review onboarding copy",
    "Summarize customer feedback",
    "Prepare release notes",
    "Outline campaign landing page",
    "Explain an API change",
    "Review support template",
    "Summarize operations report",
  ];
  const projects = [
    "northstar-example/customer-portal",
    "Customer replies",
    "Autumn campaign",
    "Internal summaries",
  ];
  for (let i = 0; i < 72; i++) {
    const a = s.accounts[i % 4];
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(i / 3));
    date.setHours(9 + (i % 10), i % 60, 0, 0);
    s.events.push({
      id: `demo-ai-${i}`,
      source: "ai",
      kind: "request",
      accountId: a.id,
      project: projects[i % 4],
      title: titles[i % 8],
      model: "example-model",
      inputTokens: 2200 + ((i * 317) % 6000),
      outputTokens: 3300 + ((i * 613) % 9000),
      time: date.toISOString(),
      status: "completed",
      reservedTokens: 0,
      issue:
        i === 3
          ? "The response was incomplete. Check whether another request is needed."
          : "",
    });
  }
  for (let i = 0; i < 12; i++) {
    const date = new Date(Date.now() - i * 5600000);
    const repo = s.connections[i % 2].repository;
    s.events.push({
      id: `demo-github-${i}`,
      source: "github",
      kind: i % 3 ? "commit" : "pull_request",
      accountId: i === 1 ? "" : s.accounts[i % 2].id,
      author: i === 1 ? "unmapped-contributor" : s.accounts[i % 2].github,
      project: repo,
      title: [
        "Improve account settings flow",
        "Add renewal status to dashboard",
        "Update onboarding documentation",
        "Fix empty-state navigation",
      ][i % 4],
      time: date.toISOString(),
      url: "",
      inputTokens: null,
      outputTokens: null,
      state: i % 3 ? "" : "merged",
      issue: i === 1 ? "GitHub author is not mapped to an account." : "",
    });
  }
  s.events.push({
    id: "demo-unknown",
    source: "ai",
    kind: "request",
    accountId: "asha",
    project: projects[0],
    title: "Explain the billing integration",
    time: new Date().toISOString(),
    model: "example-model",
    status: "unknown",
    inputTokens: null,
    outputTokens: null,
    reservedTokens: 12000,
    issue:
      "The provider outcome is unknown. Check provider records before reconciling.",
  });
  s.planning = [
    {
      id: "task-1",
      type: "tasks",
      title: "Customer reply drafting",
      detail:
        "Test approved reply templates against the current process. Measure accepted replies and review time.",
      status: "In progress",
    },
    {
      id: "prompt-1",
      type: "prompts",
      title: "A concise customer reply",
      detail:
        "Write a clear reply to the customer question. Use only the verified facts supplied. Flag anything that needs confirmation. Keep it under 150 words.",
      status: "Ready",
    },
    {
      id: "program-1",
      type: "programs",
      title: "Reduce repeat drafts",
      detail:
        "Support lead reviews 20 repeated requests and verifies whether approved templates maintain quality.",
      status: "In progress",
    },
    {
      id: "skill-1",
      type: "skills",
      title: "Asha · AI output verification",
      detail:
        "Baseline assessment: 7/10. Follow-up: 8/10. Reviewer: team lead. Different but comparable exercises. These are illustrative reviewer-entered results.",
      status: "Reviewed",
    },
  ];
  s.events.sort((a, b) => b.time.localeCompare(a.time));
  return s;
}
