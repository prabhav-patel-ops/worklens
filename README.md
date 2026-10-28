# Worklens

Understand what AI spending supports. Worklens brings accounts, project activity, observed usage and human reviews into a clear workspace.

**Website:** https://prabhav-patel-ops.github.io/worklens/

This is a new implementation based on the original Worklens research, manual, product audit, workflow diagrams and recovered conversation. It is **not** the recovered original source or an exact visual copy of the inaccessible original website.

## What works on GitHub Pages

- Responsive overview with period filters, usage charts and account spending.
- People and service accounts, GitHub username mapping and project briefs.
- Connect personal GitHub accounts or company organizations once; automatically discover accessible owned repositories, including new projects on later syncs. Stable source IDs and reviews are preserved.
- Activity filtering, evidence dialogs, original source links and review history.
- Model price estimates, allowance settings and account pause configuration.
- Comparable-work savings worksheet with net cash, review-time value and setup payback shown separately.
- Task opportunities, Job Studio records, benchmark notes, prompt templates, skills evidence and program actions.
- Validated CSV imports in a separate ledger, formula-safe exports and JSON backups/restoration.
- A synthetic example workspace kept separate from the visitor's real browser data.

Your real workspace is saved **in your browser** unless you connect your own backend. The public repository contains code and fictional fixtures, not your workspace, keys or source documents. Other visitors do not receive your local records.

## What needs the included backend

GitHub Pages serves static files. It cannot safely hold provider credentials or execute private server operations. The repository therefore also includes a deployable Node.js/SQLite backend for:

- Durable owner-authenticated storage with version-conflict checks.
- Private GitHub tokens encrypted with AES-256-GCM and bound to connection IDs.
- Managed OpenAI requests, token reservations, idempotency and account/company allowances.
- Unknown-outcome recovery and provider-verified, labeled reconciliation.

**These server features are implemented and tested with controlled responses, but they are not enabled merely by publishing the Pages website.** Deploy and connect the backend separately. No live paid provider request is included in this release verification.

## Run locally

Requires Node.js 22.16 or newer. No third-party runtime packages are required.

```sh
git clone https://github.com/prabhav-patel-ops/worklens.git
cd worklens
npm start
```

Open http://localhost:4173. The app works in browser-only mode without secrets. For server features, copy `.env.example` to `.env`, fill the server environment variables, then run:

```sh
node --env-file=.env server/index.mjs
```

Use **Connections → Connect backend** to enter the backend origin and owner token. The server requires an owner token of at least 24 characters. Generate random tokens and encryption keys locally; never commit them.

```sh
npm test
npm run check
npm run build
```

The build generates `dist/` and refreshes the committed `docs/` Pages site. After editing `public/` or `shared/`, rebuild and commit `docs/` too. GitHub Pages is configured to publish `main /docs`.

## Account and company setup

For your personal test: add your own GitHub username under People. In Connections choose Connect source, Personal GitHub account, and enter that username. Public owned projects are discovered without entering each repository. Use Sync next batch to check pending projects.

For a company: connect the Company organization by its GitHub name once. Add each employee with their work GitHub username and company email. Matching activity inside connected sources is attributed automatically. A username or email entered by the owner remains unverified.

The included backend supports GitHub verification invitations. Personal mode accepts a verified personal email. Company rules require the invited GitHub username, a matching GitHub-verified work email on the exact configured domain, and active membership in the configured organization. Follow [Deployment](docs/DEPLOYMENT.md) to activate this. Verification confirms identity; it does not provide employee portal roles or authorize private repository access. Verification is a snapshot and does not continuously recheck employment.

Up to ten account/organization sources are supported, with discovery capped at 500 accessible owned repositories per source. Each pass checks two public projects or five with an approved backend credential, rotating new/old checks. Coverage shows pending scans and errors. This collects bounded commits and pull requests, not every GitHub action. The backend includes a 15-minute scheduler while its process runs; Pages alone collects only while open. The published Pages site has no deployed backend or configured OAuth application.

## Project structure

```text
public/       Browser application, views, styling and synthetic fixtures
shared/       Validation, calculations, CSV handling and GitHub collection
server/       HTTP API, SQLite store, encryption and managed AI accounting
tests/        Domain, provider-adapter and HTTP boundary tests
scripts/      Syntax checks and static Pages build
docs/         Generated Pages assets plus architecture and deployment guides
```

See [Architecture](docs/ARCHITECTURE.md), [Deployment](docs/DEPLOYMENT.md), [Data contract](docs/DATA-CONTRACT.md) and [Verification](docs/VERIFICATION.md).

## Product boundaries

This is an owner-operated pilot. It has no shared employee login, team roles, automatic provider invoice reconciliation or personal ChatGPT history connection. Account mapping is assigned by the owner. A normal ChatGPT subscription does not enable API billing or share conversations.

GitHub collection reads at most 100 default-branch commits and 100 recently updated pull requests per repository and marks larger windows partial. It is not a complete history or quality measurement. Browser checks occur every 15 minutes while open; connected backend snapshots refresh every 15 seconds when no form is being edited.

Cost estimates use the model rates currently entered by the owner, including for historical records. Missing rates remain unknown. Cached-token discount tiers are not modeled. Imported reports remain separate and do not alter managed AI allowances. Retention is 30 or 90 days, with the full current UTC month and unresolved reservations kept for budget accounting. Request-ID fingerprints persist to prevent replays; no prompt or answer bodies are retained by Worklens.

Usage and work activity are evidence to investigate, not employee-value, knowledge or misconduct scores. No automated employment decisions are produced.

## Source ownership

The repository is public at the owner's request. No open-source license has been assigned; public visibility alone does not grant a license to reuse it. Original user documents and chat exports are intentionally excluded.
