# Deployment

## GitHub Pages

Run `npm test`, `npm run check` and `npm run build`. Commit the source and generated `docs/` files. In repository Settings → Pages, select **Deploy from a branch**, branch **main**, folder **/docs**. The project URL is https://prabhav-patel-ops.github.io/worklens/.

The site uses relative assets and hash routes. `.nojekyll` disables Jekyll processing. `docs/` contains only publishable static files and explanatory Markdown; it never contains `.env`, databases or credentials. Rebuild after changing source. No API server runs on GitHub Pages.

## Optional backend on a persistent server

Use Node.js 22.16+ on a host with a persistent disk. SQLite is built into this Node release; Node may print an experimental-feature notice. The backend has no third-party npm dependencies. Use one process and one database. Do not deploy this SQLite configuration on ephemeral serverless instances or multiple writers with separate local disks.

1. Clone this public repository onto your backend host.
2. Copy `.env.example` to `.env` outside public assets. Protect its file permissions.
3. Generate a random owner access token, at least 24 characters. Generate a separate 32-byte hexadecimal encryption key. Keep both in your host's secret configuration.
4. Set `WORKLENS_ORIGIN=https://prabhav-patel-ops.github.io`. CORS takes an origin, **not** the `/worklens/` repository path.
5. Set `WORKLENS_DATABASE` to the persistent database file path. Back up the database and encryption key together.
6. If managed AI is authorized, set `OPENAI_API_KEY` and a model accessible to that account. Enter the exact returned model name and your contract rates in Budgets. No API key is supplied with this repository.
7. Start `node --env-file=.env server/index.mjs` behind an HTTPS reverse proxy. Use a process supervisor and a persistent volume. Set `HOST=0.0.0.0` if your reverse proxy or container needs it; restrict direct network exposure as appropriate.
8. In the Pages app, choose Connections → Connect backend, enter its HTTPS origin and owner access token, and verify the server workspace loads.

Docker option, from the repository root:

```sh
docker build -f server/Dockerfile -t worklens-backend .
docker run --env-file .env -e HOST=0.0.0.0 -p 4173:4173 -v worklens-data:/data worklens-backend
```

Do not commit `.env` or run a database in the public static folder. The backend accepts one exact browser origin. The owner token is a powerful shared-secret credential; rotate it on exposure, clear old browser sessions and do not present it as employee SSO.

## Operator acceptance

- Add an account with your exact GitHub username.
- Connect your personal account or company organization and review discovered repositories. Verify one record on GitHub, then sync twice and confirm one copy.
- Save a review note and sync again; verify the note remains.
- For a private repository, create a fine-grained, expiring read-only token scoped to that repository. Grant Contents: read and Pull requests: read. Verify it can be read before retaining the connection.
- Before authorizing paid AI, enter model prices and a small token allowance. Send one short request and compare returned usage against provider records.
- Pause the account and confirm a second managed request is blocked before the provider call.
- Simulate an unknown result in a test environment. Reconcile only with verified provider evidence.

## Backups and recovery

Export the workspace JSON before destructive local changes. This includes account/event/planning metadata and review notes but no private credentials. Restoring replaces the workspace; private sources must be reconnected. Pending reservations cannot be restored. On the server, keep regular SQLite backups on separate storage, use SQLite's backup facilities or a consistent stopped-process snapshot, and protect the encryption key separately. Restore to a test instance before relying on backups.

## Remaining operational work

Company-wide use needs organization identity, separate roles, employee notice and attribution, independent security review, live provider acceptance, operational monitoring, backup exercises and load testing. The included backend can sync every 15 minutes while its process runs; Pages alone cannot collect with the page closed. The Pages release does not make these gates complete.

## Activate employee GitHub verification

1. Deploy the backend behind HTTPS. Register a GitHub OAuth application in GitHub Settings, Developer settings, OAuth Apps. Its callback must be `https://YOUR-BACKEND/auth/github/callback`.
2. Configure GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and that exact GITHUB_CALLBACK_URL on the server. Never place the client secret in Pages or Git. Restart the backend.
3. Connect the backend in Worklens. Configure identity rules: Personal for testing, or Company with the exact work email domain and organization name.
4. Add the employee's work GitHub username and email under People. Open their profile and choose Verify GitHub identity. Share the private one-use link directly; it expires after one hour. It does not contain the owner token.
5. The employee signs into the invited GitHub account and authorizes verification. Company mode checks a GitHub-verified matching company email and active organization membership. Company OAuth restrictions or SAML settings may need administrator approval.
6. Refresh Worklens to see the verification badge. Employee verification does not grant owner access or provide employee portal roles. Do not share the owner access token.

Scopes are read:user and user:email, plus read:org in company mode. Temporary identity tokens are not persisted. Proofs are snapshots; reverify after employment changes. Identity edits, policy changes and restores clear proofs. Backup restores invalidate outstanding invitations.

Private repository access is separate. Supply an approved fine-grained read-only token through the backend, scoped to the organization and authorized repositories, with Contents: read and Pull requests: read. For personal private discovery the token must belong to that username. Discovery cannot bypass repository permissions. A GitHub App installation is a future alternative, not implemented by this release. Set WORKLENS_GITHUB_SYNC_MINUTES=0 to disable the default 15-minute backend scheduler.
