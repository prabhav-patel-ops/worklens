# Data contract

Workspace format version 1 contains a monotonically increasing revision, a name, accounts, source connections, events, planning records and settings. The shared validation implementation is `shared/domain.js`.

| Record           | Required meaning                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Account          | Owner-assigned name, team, role, optional exact GitHub username, monthly managed-token allowance and pause state                              |
| Connection       | Stable connection ID, canonical owner/repository, source description, last-sync time and coverage note; no plaintext token in snapshots       |
| GitHub event     | Stable provider identity, author, mapped account, repository/project, title, time and HTTPS source URL; token counts are null                 |
| Managed AI event | Account, declared project, short work label, model, time, reported input/output usage or null, reservation, request status and optional issue |
| Imported event   | CSV-origin event in the separate imported ledger; never relabeled live and never included in managed budget counters                          |
| Review           | Open/reviewed/expected status, explanation note and decision time; preserved across source refresh                                            |
| Planning record  | Type, title, details/evidence, status and time; explicitly owner-entered                                                                      |
| Price rate       | Exact model name and USD input/output rates per million tokens; used for estimates at current configured rates                                |

## Calculations

Observed tokens = known managed input tokens + known managed output tokens. Unknown outcomes are counted separately. GitHub supplies no tokens.

Estimated API cost = input tokens × input USD/million ÷ 1,000,000 + output tokens × output USD/million ÷ 1,000,000. No rate means unknown. This model does not price cached-token tiers, subscriptions, taxes or provider discounts.

Monthly allowance usage = managed known tokens + unresolved reservations in the current UTC month. Imported reports are excluded. Account pauses only affect managed requests routed through the server. Reservations use UTF-8 input bytes plus 512 units of overhead and the requested output cap as a conservative text-input estimate; returned provider usage remains authoritative and may differ.

Cash benefit = baseline API cost − improved API cost − Worklens fee − hosting. Review time × hourly value is subtracted separately for a time-valued comparison. Setup payback = one-time paid setup cost ÷ positive monthly cash benefit. No positive cash benefit means no positive payback. Comparable task counts and a user-confirmed quality guardrail are necessary but do not by themselves prove causal savings.

## Limits and retention

The pilot supports 200 accounts, ten GitHub account/organization sources of up to 500 accessible owned repositories each, five legacy repository connections, 20,000 retained events and 2,000 planning records. CSV imports support 10,000 rows and 10 MB per import. Activity/export filters show up to 500 matching visible events; workspace backups and general exports contain the full retained workspace.

Retention runs on writes and on backend requests/recovery. It removes old event details after the selected 30/90-day period, except the entire current month and all unresolved reservations. Summaries are recalculated from retained evidence; they are not full historical accounting. SQLite request fingerprints persist for idempotency even when an old event expires. There is no automated data-subject request system or background deletion service for closed local browsers.

## API

Every route uses `Authorization: Bearer <owner token>`. Mutating bodies are JSON. Configure one exact allowed browser origin.

| Method and path      | Purpose                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| GET /api/workspace   | Validated snapshot and configuration capabilities; no credentials                                          |
| POST /api/command    | Revision-checked account, review, settings, import and planning mutations                                  |
| POST /api/connection | Verify GitHub access, encrypt optional token, connect and collect source evidence                          |
| POST /api/sync       | Collect a currently connected repository and merge stable records                                          |
| POST /api/ai         | Reserve allowance and issue an idempotent managed request                                                  |
| POST /api/reconcile  | Record verified usage for an unknown request with a source note                                            |
| POST /api/restore    | Replace workspace from a validated backup; refuse unresolved reservations and clear old source credentials |

The server never persists prompt/answer bodies. Source titles and work labels may still contain sensitive information; use minimal descriptions and authorized data.

## GitHub sources and identity

`githubSources` retains source type/login, discovered repository metadata, per-project check/success/error times and explicit coverage. POST `/api/github-source` connects and collects; POST `/api/github-source-sync` scans the next batch. POST `/api/employee-invite` creates a private verification link. These API routes require owner authentication. Public GET `/auth/github/start` and `/auth/github/callback` require expiring invitation/state values. `identityPolicy` selects personal or exact company domain/organization rules. Proofs and outstanding invitations are cleared on restore.
