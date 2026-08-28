---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-08-28T05:38:36.160Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 11 | unmet-truth | src/market-intelligence/signal/materiality-prescreen.ts |  | D-16 acceptance bar not met: >=0.85 retention at top-50% required, measured 0.8107 (training, 2026-06) / 0.6878 (held-out, 2026-07-22..26). See 11-01-SUMMARY.md 'Fit methodology' for full writeup and oracle-ceiling analysis. | open |  | 2026-08-28T05:38:36.160Z |  |

````json
[
  {
    "id": 1,
    "kind": "unmet-truth",
    "phase": "11",
    "file": "src/market-intelligence/signal/materiality-prescreen.ts",
    "line": null,
    "description": "D-16 acceptance bar not met: >=0.85 retention at top-50% required, measured 0.8107 (training, 2026-06) / 0.6878 (held-out, 2026-07-22..26). See 11-01-SUMMARY.md 'Fit methodology' for full writeup and oracle-ceiling analysis.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-28T05:38:36.160Z",
    "resolved_at": null
  }
]
````
