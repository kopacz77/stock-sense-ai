# Phase 4: Risk Integration

## Overview

Connect risk CLI commands (VaR, CVaR, Monte Carlo, stress test) to actual portfolio data from paper trading or file-based storage.

## Requirements Covered

| REQ-ID | Description | Status |
|--------|-------------|--------|
| RISK-01 | Risk CLI commands use actual portfolio data | pending |

## Problem Statement

Risk commands exist but may use placeholder/mock portfolio data instead of:
- Positions from paper trading portfolio manager
- Positions from file-based portfolio storage
- Real position weights and values

## Key Files

- `src/cli/risk-commands.ts` - CLI command definitions
- `src/risk/metrics/var-calculator.ts` - VaR calculation
- `src/risk/metrics/cvar-calculator.ts` - CVaR calculation
- `src/risk/simulation/monte-carlo.ts` - Monte Carlo simulation
- `src/risk/stress/stress-tester.ts` - Stress testing
- `src/paper-trading/portfolio/portfolio-manager.ts` - Real portfolio data

## Success Criteria

1. `stock-analyzer risk var` reads positions from real portfolio
2. `stock-analyzer risk cvar --confidence 0.99` uses real position weights
3. `stock-analyzer risk monte-carlo --simulations 10000` uses actual holdings
4. `stock-analyzer risk stress-test --scenario market-crash` applies to real portfolio
5. Risk reports show position-level risk contribution

## Dependencies

- Phase 2: Paper trading portfolio manager provides position data

## Plans

Plans will be created in this directory as work progresses.

---

*Phase Status: pending*
