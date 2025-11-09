/**
 * Risk Management Module - Index
 * Exports all risk management components
 */

// Metrics
export { VaRCalculator } from "./metrics/var-calculator.js";
export { CVaRCalculator } from "./metrics/cvar-calculator.js";

// Correlation
export { CorrelationMatrixCalculator } from "./correlation/correlation-matrix.js";

// Position Sizing
export { KellyCriterion } from "./position-sizing/kelly-criterion.js";

// Simulation
export { MonteCarloSimulator } from "./simulation/monte-carlo.js";

// Stress Testing
export { StressTester } from "./stress/stress-tester.js";

// Validation
export { PreTradeValidator } from "./validation/pre-trade-validator.js";

// Reporting
export { RiskReporter } from "./reporting/risk-reporter.js";

// Alerts
export { RiskAlerter } from "./alerts/risk-alerter.js";

// Types
export * from "./types/risk-types.js";
