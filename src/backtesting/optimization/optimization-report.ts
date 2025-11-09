/**
 * Optimization Report Generator
 * Creates detailed reports with visualizations (ASCII art) and analysis
 */

import type {
  OptimizationRunResult,
  WalkForwardResult,
  ParameterSensitivity,
} from "./types.js";

export class OptimizationReporter {
  /**
   * Generate full optimization report
   */
  generateReport(result: OptimizationRunResult): string {
    const sections: string[] = [];

    sections.push(this.generateHeader(result));
    sections.push(this.generateBestParameters(result));
    sections.push(this.generatePerformanceMetrics(result));
    sections.push(this.generateSummaryStatistics(result));
    sections.push(this.generateParameterSensitivity(result));
    sections.push(this.generateTopResults(result, 10));
    sections.push(this.generateObjectiveDistribution(result));

    return sections.join("\n\n");
  }

  /**
   * Generate walk-forward report
   */
  generateWalkForwardReport(result: WalkForwardResult): string {
    const sections: string[] = [];

    sections.push(this.generateWalkForwardHeader(result));
    sections.push(this.generateOverfittingAnalysis(result));
    sections.push(this.generateWindowPerformance(result));
    sections.push(this.generateEquityCurveComparison(result));

    return sections.join("\n\n");
  }

  /**
   * Generate report header
   */
  private generateHeader(result: OptimizationRunResult): string {
    return `
${"=".repeat(80)}
PARAMETER OPTIMIZATION REPORT
${"=".repeat(80)}

Optimization: ${result.config.name}
Method: ${result.config.method.toUpperCase()}
Objective: ${result.config.objective} (${result.config.direction})
Date: ${result.startTime.toISOString()}
Duration: ${(result.totalExecutionTimeMs / 1000).toFixed(2)}s
`;
  }

  /**
   * Generate best parameters section
   */
  private generateBestParameters(result: OptimizationRunResult): string {
    const params = result.bestResult.parameters.parameters;
    const lines = ["BEST PARAMETERS", "-".repeat(80)];

    for (const [key, value] of Object.entries(params)) {
      lines.push(`  ${key.padEnd(30)} ${value}`);
    }

    return lines.join("\n");
  }

  /**
   * Generate performance metrics
   */
  private generatePerformanceMetrics(result: OptimizationRunResult): string {
    const metrics = result.bestResult.backtestResult.metrics;

    return `PERFORMANCE METRICS
${"-".repeat(80)}
  Objective Value:           ${result.bestResult.objectiveValue.toFixed(4)}

  Returns:
    Total Return:            ${metrics.totalReturn.toFixed(2)}%
    CAGR:                    ${metrics.cagr.toFixed(2)}%

  Risk Metrics:
    Sharpe Ratio:            ${metrics.sharpeRatio.toFixed(2)}
    Sortino Ratio:           ${metrics.sortinoRatio.toFixed(2)}
    Calmar Ratio:            ${metrics.calmarRatio.toFixed(2)}
    Max Drawdown:            ${metrics.maxDrawdown.toFixed(2)}%
    Volatility:              ${metrics.volatility.toFixed(2)}%

  Trade Statistics:
    Total Trades:            ${metrics.totalTrades}
    Win Rate:                ${metrics.winRate.toFixed(2)}%
    Profit Factor:           ${metrics.profitFactor.toFixed(2)}
    Expectancy:              $${metrics.expectancy.toFixed(2)}
    Avg Win:                 $${metrics.avgWin.toFixed(2)}
    Avg Loss:                $${metrics.avgLoss.toFixed(2)}
`;
  }

  /**
   * Generate summary statistics
   */
  private generateSummaryStatistics(result: OptimizationRunResult): string {
    const summary = result.summary;

    return `SUMMARY STATISTICS
${"-".repeat(80)}
  Total Combinations:        ${summary.totalCombinations}
  Valid Combinations:        ${summary.validCombinations}
  Invalid Combinations:      ${summary.invalidCombinations}

  Objective Value Range:
    Best:                    ${summary.bestObjectiveValue.toFixed(4)}
    Worst:                   ${summary.worstObjectiveValue.toFixed(4)}
    Mean:                    ${summary.meanObjectiveValue.toFixed(4)}
    Median:                  ${summary.medianObjectiveValue.toFixed(4)}
    Std Dev:                 ${summary.stdDevObjectiveValue.toFixed(4)}

  Performance:
    Avg Execution Time:      ${summary.avgExecutionTimeMs.toFixed(0)}ms per backtest
    Total Time:              ${(result.totalExecutionTimeMs / 1000).toFixed(2)}s
    Throughput:              ${(summary.totalCombinations / (result.totalExecutionTimeMs / 1000)).toFixed(2)} backtests/sec
`;
  }

  /**
   * Generate parameter sensitivity analysis
   */
  private generateParameterSensitivity(result: OptimizationRunResult): string {
    const sensitivity = result.summary.parameterSensitivity;
    const sorted = [...sensitivity].sort((a, b) => b.correlation - a.correlation);

    const lines = ["PARAMETER SENSITIVITY ANALYSIS", "-".repeat(80)];

    for (const param of sorted) {
      lines.push(`\n${param.parameterName}:`);
      lines.push(`  Impact Score:     ${param.correlation.toFixed(4)}`);
      lines.push(`  Best Value:       ${param.bestValue}`);

      if (param.valuePerformance.length > 0) {
        lines.push(`  Value Performance:`);
        const sorted = [...param.valuePerformance].sort(
          (a, b) => b.avgObjective - a.avgObjective
        );
        for (const vp of sorted.slice(0, 5)) {
          lines.push(`    ${String(vp.value).padEnd(15)} ${vp.avgObjective.toFixed(4)}`);
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Generate top results
   */
  private generateTopResults(result: OptimizationRunResult, n: number): string {
    const lines = [`TOP ${n} RESULTS`, "-".repeat(80)];

    const top = result.results.slice(0, n);

    for (let i = 0; i < top.length; i++) {
      const res = top[i]!;
      lines.push(`\n#${i + 1} - Objective: ${res.objectiveValue.toFixed(4)}`);
      lines.push(`  Parameters: ${JSON.stringify(res.parameters.parameters)}`);
      lines.push(
        `  Return: ${res.backtestResult.metrics.totalReturn.toFixed(2)}% | Sharpe: ${res.backtestResult.metrics.sharpeRatio.toFixed(2)} | Trades: ${res.backtestResult.metrics.totalTrades}`
      );
    }

    return lines.join("\n");
  }

  /**
   * Generate objective value distribution (ASCII histogram)
   */
  private generateObjectiveDistribution(result: OptimizationRunResult): string {
    const values = result.results.map((r) => r.objectiveValue);
    const bins = 20;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const binSize = (max - min) / bins;

    const histogram = new Array(bins).fill(0);

    for (const value of values) {
      const binIndex = Math.min(bins - 1, Math.floor((value - min) / binSize));
      histogram[binIndex]++;
    }

    const maxCount = Math.max(...histogram);
    const barWidth = 50;

    const lines = ["OBJECTIVE VALUE DISTRIBUTION", "-".repeat(80)];

    for (let i = 0; i < bins; i++) {
      const rangeStart = min + i * binSize;
      const rangeEnd = min + (i + 1) * binSize;
      const count = histogram[i]!;
      const barLength = Math.floor((count / maxCount) * barWidth);
      const bar = "█".repeat(barLength);

      lines.push(
        `${rangeStart.toFixed(3)} - ${rangeEnd.toFixed(3)} | ${bar} ${count}`
      );
    }

    return lines.join("\n");
  }

  /**
   * Generate walk-forward header
   */
  private generateWalkForwardHeader(result: WalkForwardResult): string {
    return `
${"=".repeat(80)}
WALK-FORWARD ANALYSIS REPORT
${"=".repeat(80)}

Configuration:
  Training Window:         ${result.config.trainMonths} months
  Testing Window:          ${result.config.testMonths} months
  Step Size:               ${result.config.stepMonths} months
  Window Type:             ${result.config.windowType}
  Total Windows:           ${result.windows.length}

Optimization:
  Method:                  ${result.optimizationConfig.method.toUpperCase()}
  Objective:               ${result.optimizationConfig.objective}

Duration: ${(result.totalExecutionTimeMs / 1000 / 60).toFixed(2)} minutes
`;
  }

  /**
   * Generate overfitting analysis
   */
  private generateOverfittingAnalysis(result: WalkForwardResult): string {
    const analysis = result.overfittingAnalysis;

    const statusIcon = analysis.isOverfitted ? "⚠️" : "✓";
    const severityBar = this.generateSeverityBar(analysis.severity);

    return `OVERFITTING ANALYSIS
${"-".repeat(80)}
  Status: ${statusIcon} ${analysis.isOverfitted ? "OVERFITTING DETECTED" : "NO OVERFITTING"}
  Severity: ${severityBar}

  Performance Comparison:
    Avg In-Sample:           ${analysis.avgInSampleObjective.toFixed(4)}
    Avg Out-of-Sample:       ${analysis.avgOutOfSampleObjective.toFixed(4)}
    Degradation:             ${analysis.degradationPercent.toFixed(2)}%

  Consistency:
    Consistency Score:       ${analysis.consistencyScore.toFixed(2)}/100
    Windows Outperforming:   ${analysis.outperformingWindows}/${analysis.totalWindows}

  Recommendations:
${analysis.recommendations.map((r) => `    - ${r}`).join("\n")}
`;
  }

  /**
   * Generate severity bar
   */
  private generateSeverityBar(severity: string): string {
    const levels = ["none", "low", "moderate", "high", "severe"];
    const index = levels.indexOf(severity);
    const filled = "█".repeat(index + 1);
    const empty = "░".repeat(levels.length - index - 1);
    return `[${filled}${empty}] ${severity.toUpperCase()}`;
  }

  /**
   * Generate window performance
   */
  private generateWindowPerformance(result: WalkForwardResult): string {
    const lines = ["WINDOW PERFORMANCE", "-".repeat(80)];

    lines.push(
      `${"Window".padEnd(8)} | ${"In-Sample".padEnd(12)} | ${"Out-of-Sample".padEnd(12)} | ${"Degradation".padEnd(12)} | Status`
    );
    lines.push("-".repeat(80));

    for (const window of result.windows) {
      const inSample = window.optimizationResult?.objectiveValue ?? 0;
      const outOfSample = window.testObjectiveValue ?? 0;
      const degradation = ((outOfSample - inSample) / inSample) * 100;

      const status =
        result.optimizationConfig.direction === "maximize"
          ? outOfSample >= inSample
            ? "✓"
            : "✗"
          : outOfSample <= inSample
            ? "✓"
            : "✗";

      lines.push(
        `${String(window.index + 1).padEnd(8)} | ${inSample.toFixed(4).padEnd(12)} | ${outOfSample.toFixed(4).padEnd(12)} | ${degradation.toFixed(2).padEnd(11)}% | ${status}`
      );
    }

    return lines.join("\n");
  }

  /**
   * Generate equity curve comparison (ASCII chart)
   */
  private generateEquityCurveComparison(result: WalkForwardResult): string {
    const lines = ["EQUITY CURVE COMPARISON", "-".repeat(80)];

    // Simplified - would need actual equity curve data
    lines.push("(Equity curves would be visualized here in a production implementation)");
    lines.push("");
    lines.push("Aggregated Out-of-Sample Metrics:");
    lines.push(`  Total Return:     ${result.aggregatedMetrics.totalReturn.toFixed(2)}%`);
    lines.push(`  Sharpe Ratio:     ${result.aggregatedMetrics.sharpeRatio.toFixed(2)}`);
    lines.push(`  Win Rate:         ${result.aggregatedMetrics.winRate.toFixed(2)}%`);
    lines.push(`  Total Trades:     ${result.aggregatedMetrics.totalTrades}`);

    return lines.join("\n");
  }

  /**
   * Generate parameter heatmap (for 2D parameter optimization)
   */
  generateParameterHeatmap(
    result: OptimizationRunResult,
    param1: string,
    param2: string
  ): string {
    const lines = [`PARAMETER HEATMAP: ${param1} vs ${param2}`, "-".repeat(80)];

    // Extract unique values for each parameter
    const param1Values = new Set<number | string | boolean>();
    const param2Values = new Set<number | string | boolean>();

    for (const res of result.results) {
      const p1 = res.parameters.parameters[param1];
      const p2 = res.parameters.parameters[param2];
      if (p1 !== undefined) param1Values.add(p1);
      if (p2 !== undefined) param2Values.add(p2);
    }

    const p1Array = Array.from(param1Values).sort();
    const p2Array = Array.from(param2Values).sort();

    // Create grid
    const grid: (number | null)[][] = Array(p2Array.length)
      .fill(null)
      .map(() => Array(p1Array.length).fill(null));

    // Fill grid with objective values
    for (const res of result.results) {
      const p1 = res.parameters.parameters[param1];
      const p2 = res.parameters.parameters[param2];

      const i = p2Array.indexOf(p2 as never);
      const j = p1Array.indexOf(p1 as never);

      if (i >= 0 && j >= 0) {
        grid[i]![j] = res.objectiveValue;
      }
    }

    // Find min/max for color scale
    const allValues = grid.flat().filter((v): v is number => v !== null);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);

    // Print header
    lines.push(`\n${" ".repeat(10)} ${p1Array.map((v) => String(v).padStart(8)).join(" ")}`);

    // Print grid
    const symbols = [" ", "░", "▒", "▓", "█"];
    for (let i = 0; i < p2Array.length; i++) {
      const row = grid[i]!;
      const rowStr = row
        .map((val) => {
          if (val === null) return "   -   ";
          const normalized = (val - min) / (max - min);
          const symbolIndex = Math.floor(normalized * (symbols.length - 1));
          return symbols[symbolIndex]!.repeat(2) + val.toFixed(2);
        })
        .join(" ");

      lines.push(`${String(p2Array[i]).padStart(8)}: ${rowStr}`);
    }

    lines.push(`\nLegend: ${symbols[0]} = ${min.toFixed(2)}  ${symbols[4]} = ${max.toFixed(2)}`);

    return lines.join("\n");
  }
}
