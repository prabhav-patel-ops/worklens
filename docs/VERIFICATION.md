# Verification

## Automated checks

The Node test suite exercises calculations and real HTTP routes with isolated SQLite databases and controlled provider responses. It covers:

- Unknown/unpriced cost handling; UTC allowances and reservations.
- Stale writes, account mapping, reconnect deduplication and preserved reviews.
- Five-source bounds, removed-connection guards and project evidence summaries.
- Original worked-example savings arithmetic and non-comparable scenarios.
- Quoted CSV parsing, invalid imports and formula-safe exports.
- Backup validation and HTTPS source-link restrictions.
- Empty and partial GitHub windows, stable provider IDs and exact mapping.
- Connection-bound encryption, owner snapshots and database rollback.
- Duplicate requests, changed-payload rejection, pauses and exhausted limits.
- One pending request, exact-once settlement and late-result protection.
- Missing usage, timeouts, known rejections, server failures and stale-request recovery.
- Owner-entered reconciliation and no persisted prompt/answer bodies.
- Anonymous access, disallowed origins, revision conflicts and private-file boundaries.

Run `npm test`, `npm run check` and `npm run build` on each release. Test counts are reported by the test runner; no old Worklens test results are carried forward as proof of this implementation.

## Browser and live-source acceptance

Local and published app checks are recorded during the release session. These checks validate visible navigation and a real public GitHub source; they do not certify every browser or full accessibility conformance. See the release report for the exact checks completed.

## Not verified by this release

No paid provider call, private customer repository credential, enterprise identity, independent security assessment, production load certification, database restore exercise or complete provider invoice reconciliation is represented as tested. The backend must be deployed and configured before its live routes can be accepted with real credentials.

## Release acceptance completed

On 26 October 2026, 36 automated tests passed, JavaScript syntax checks passed and the static build completed. All eleven screens rendered with example and empty workspaces. In the local browser, the dashboard layout was inspected, switching to real data kept the example separate, an owner account was saved, the real public prabhav-patel-ops/worklens repository was connected, the initial commit source link was inspected, repeat sync kept one event, and a Reviewed note survived that sync. The savings screen reproduced the original worked example: USD 18 net monthly cash benefit, USD 10 after review-time valuation and 3.3-month setup payback.

Published-site verification is performed after GitHub Pages finishes its deployment. Small-screen browser coverage, live paid AI and private-token acceptance remain unverified.
