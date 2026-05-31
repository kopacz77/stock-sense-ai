# Treasury Fiscal Data Endpoint — Live Spike Result

**Spike date:** 2026-05-31
**Plan:** 10-03 (calendar fetchers)
**Question:** Which TreasuryDirect Fiscal Data endpoint actually returns upcoming-auction data?

---

## Endpoint that works

```
GET https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/upcoming_auctions
```

- **Status:** 200 OK
- **Auth:** none
- **Sort:** `sort=-auction_date` returns newest first (required — default sort is record_date ascending which yields stale 2024-vintage rows)
- **Pagination:** JSON:API style `page[size]=N`, `page[number]=N`
- **Filter:** `filter=security_type:in:(Note,Bond)` works for narrowing

### Live request used during spike

```bash
curl -sS "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/upcoming_auctions?sort=-auction_date&page%5Bsize%5D=50&filter=security_type:in:(Note,Bond)"
```

### Sample response row (latest, captured 2026-05-31)

```json
{
  "record_date": "2026-05-29",
  "security_type": "Bond",
  "security_term": "29-Year 11-Month",
  "reopening": "Yes",
  "cusip": "912810UU0",
  "offering_amt": "null",
  "announcemt_date": "2026-06-04",
  "auction_date": "2026-06-11",
  "issue_date": "2026-06-15"
}
```

### Confirmed field names (we use these)

| Field           | Purpose in our fetcher                                         |
| --------------- | -------------------------------------------------------------- |
| `auction_date`  | `CalendarEvent.expectedDate`                                   |
| `security_type` | filter to {"Note", "Bond"}                                     |
| `security_term` | filter to long-duration terms (see below) + id construction    |
| `issue_date`    | sourceMeta only                                                |
| `cusip`         | sourceMeta only                                                |
| `reopening`     | sourceMeta only                                                |

---

## Important nuance — reopening terms

The intuition "filter security_term IN (10-Year, 20-Year, 30-Year)" misses ~half of the upcoming long-duration auctions because reopenings shift the term string:

| Initial issue (new CUSIP)  | Reopening (Yes)                                    |
| -------------------------- | -------------------------------------------------- |
| `10-Year` Note             | `9-Year 10-Month` / `9-Year 11-Month` Note         |
| `20-Year` Bond             | `19-Year 10-Month` / `19-Year 11-Month` Bond       |
| `30-Year` Bond             | `29-Year 10-Month` / `29-Year 11-Month` Bond       |

In practice the operator cares about all of these — a 9Y11M reopening of the 10Y prices off the same auction-tail dynamics as the initial issue.

**Decision:** filter heuristically via regex matching the leading year value:

- 10-year family: `/^(10-Year|9-Year (10|11)-Month)$/` AND `security_type === "Note"`
- 20-year family: `/^(20-Year|19-Year (10|11)-Month)$/` AND `security_type === "Bond"`
- 30-year family: `/^(30-Year|29-Year (10|11)-Month)$/` AND `security_type === "Bond"`

Shorter-duration bills (4-Week / 8-Week / 13-Week / 52-Week) are intentionally excluded — they trade at the front of the curve and don't materially move TLT/IEF on auction tail/strength.

---

## Other endpoint variants tried — NOT used

| Variant                                                                                                              | Result                                                            |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `/v2/accounting/od/auctions_query?filter=auction_date:gte:2026-05-31`                                                | Not exercised; v1/upcoming_auctions already returns forward data  |
| Default sort (no `sort` param)                                                                                       | Returns ASCENDING record_date order — first page is 2024 vintage  |
| No filter                                                                                                            | Includes Bills + TIPS Notes; we filter client-side after fetch    |

---

## Fetcher behavior decisions baked into TreasuryAuctionCalendarFetcher

1. Always pass `sort=-auction_date` and `page[size]=200` (a 60-day window typically has ~40-60 long-duration auctions across all terms; 200 is a safe upper bound).
2. Filter client-side by:
   - `security_type IN ("Note", "Bond")`
   - `security_term` matches the 3 long-duration regexes above
   - `auction_date >= today` AND `auction_date <= today + days` (defensive — API may return slight overshoot)
3. Compose `id` as `treasury-${security_type.toLowerCase()}-${security_term-slug}-${auction_date}` — `security_term-slug` is the term string with spaces replaced by hyphens. e.g. `treasury-bond-29-year-11-month-2026-06-11`.
4. `affectedSectors: ["TLT", "IEF"]` — both because the 10Y maps closer to IEF and the 20/30Y to TLT, and the digest reader benefits from being able to retrieve all rate-sensitive ETFs from one query.
5. `magnitudePrior: 2`, `direction: "uncertain"`, `confidence: 0.3` — auctions matter on tail/strength deviation from indicated rate, which the calendar can't predict ahead of time.
6. `expectedTimeEt: "13:00"` — Treasury auctions are scheduled at 1:00pm ET (Notes/Bonds) per Treasury convention.

---

## Failure mode

If the endpoint ever returns non-2xx, the fetcher logs a warning and returns `[]`. This matches the plan's "best-effort, do not abort the cycle" requirement (a TLT/IEF data gap for 24 hours is preferable to clearing the cycle's entire calendar refresh).
