/**
 * GARCH(1,1) Volatility Model
 *
 * Implements Generalized Autoregressive Conditional Heteroskedasticity
 * for modeling volatility clustering - the tendency for high volatility
 * periods to cluster together and low volatility periods to cluster together.
 *
 * GARCH(1,1) Model:
 * σ²(t) = ω + α × ε²(t-1) + β × σ²(t-1)
 *
 * Where:
 * - σ²(t) = conditional variance at time t
 * - ω (omega) = long-run average variance weight
 * - α (alpha) = weight for previous shock (innovation)
 * - β (beta) = weight for previous variance (persistence)
 * - ε(t-1) = previous return shock
 *
 * Constraints:
 * - ω > 0
 * - α ≥ 0, β ≥ 0
 * - α + β < 1 (for stationarity)
 */

export interface GARCHParams {
  omega: number; // Long-run variance weight (ω)
  alpha: number; // ARCH coefficient - shock impact (α)
  beta: number; // GARCH coefficient - persistence (β)
}

export interface GARCHResult {
  params: GARCHParams;
  conditionalVolatility: number[]; // Time series of σ(t)
  currentVolatility: number; // Most recent σ(t)
  forecastVolatility: number; // One-step ahead forecast
  longRunVolatility: number; // Unconditional (long-run) volatility
  halfLife: number; // Days for volatility to decay 50% toward long-run
  persistence: number; // α + β (volatility persistence)
  annualizedVolatility: number; // Current vol annualized
  annualizedForecast: number; // Forecast vol annualized
  logLikelihood: number; // Model fit quality
  interpretation: string;
}

export interface GARCHForecast {
  horizon: number; // Days ahead
  volatilityPath: number[]; // Expected volatility for each day
  volatilityCone: {
    lower95: number[];
    upper95: number[];
  };
}

export class GARCHVolatilityModel {
  private readonly TRADING_DAYS_PER_YEAR = 252;
  private readonly MAX_ITERATIONS = 1000;
  private readonly CONVERGENCE_TOLERANCE = 1e-8;

  /**
   * Fit GARCH(1,1) model to return series
   *
   * @param returns - Array of daily returns (as decimals, e.g., 0.02 for 2%)
   * @param initialParams - Optional starting parameters
   */
  fitGARCH(returns: number[], initialParams?: Partial<GARCHParams>): GARCHResult {
    if (returns.length < 30) {
      throw new Error("GARCH requires at least 30 data points for reliable estimation");
    }

    // Calculate sample statistics
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const demeaned = returns.map(r => r - mean);
    const sampleVariance = demeaned.reduce((sum, r) => sum + r * r, 0) / (returns.length - 1);

    // Initialize parameters using method of moments or provided values
    let params = this.initializeParams(sampleVariance, initialParams);

    // Optimize using quasi-Newton method (simplified BFGS-like iteration)
    params = this.optimizeParams(demeaned, params, sampleVariance);

    // Calculate conditional volatility series
    const conditionalVariance = this.calculateConditionalVariance(demeaned, params, sampleVariance);
    const conditionalVolatility = conditionalVariance.map(v => Math.sqrt(v));

    // Current and forecast volatility
    const currentVariance = conditionalVariance[conditionalVariance.length - 1] ?? sampleVariance;
    const lastShock = demeaned[demeaned.length - 1] ?? 0;
    const forecastVariance = params.omega + params.alpha * lastShock * lastShock + params.beta * currentVariance;

    // Long-run (unconditional) variance: ω / (1 - α - β)
    const persistence = params.alpha + params.beta;
    const longRunVariance = persistence < 1 ? params.omega / (1 - persistence) : sampleVariance;

    // Half-life: ln(0.5) / ln(α + β)
    const halfLife = persistence > 0 && persistence < 1
      ? Math.log(0.5) / Math.log(persistence)
      : Infinity;

    // Log-likelihood for model fit assessment
    const logLikelihood = this.calculateLogLikelihood(demeaned, conditionalVariance);

    const currentVolatility = Math.sqrt(currentVariance);
    const forecastVolatility = Math.sqrt(forecastVariance);
    const longRunVolatility = Math.sqrt(longRunVariance);

    // Annualize volatilities
    const annualizedVolatility = currentVolatility * Math.sqrt(this.TRADING_DAYS_PER_YEAR);
    const annualizedForecast = forecastVolatility * Math.sqrt(this.TRADING_DAYS_PER_YEAR);

    return {
      params,
      conditionalVolatility,
      currentVolatility,
      forecastVolatility,
      longRunVolatility,
      halfLife,
      persistence,
      annualizedVolatility,
      annualizedForecast,
      logLikelihood,
      interpretation: this.generateInterpretation(
        annualizedVolatility,
        annualizedForecast,
        persistence,
        halfLife
      ),
    };
  }

  /**
   * Generate multi-step volatility forecast
   */
  forecast(garchResult: GARCHResult, horizon: number): GARCHForecast {
    const { params, currentVolatility, longRunVolatility } = garchResult;
    const currentVariance = currentVolatility * currentVolatility;
    const longRunVariance = longRunVolatility * longRunVolatility;
    const persistence = params.alpha + params.beta;

    const volatilityPath: number[] = [];
    const lower95: number[] = [];
    const upper95: number[] = [];

    let forecastVariance = currentVariance;

    for (let h = 1; h <= horizon; h++) {
      // Multi-step forecast: σ²(t+h) = σ̄² + (α+β)^h × (σ²(t) - σ̄²)
      forecastVariance = longRunVariance + Math.pow(persistence, h) * (currentVariance - longRunVariance);

      const forecastVol = Math.sqrt(forecastVariance);
      volatilityPath.push(forecastVol);

      // Confidence interval (approximate - assumes variance of variance)
      // Using chi-squared approximation for variance uncertainty
      const varOfVar = 2 * forecastVariance * forecastVariance / garchResult.conditionalVolatility.length;
      const seVol = Math.sqrt(varOfVar) / (2 * forecastVol);

      lower95.push(Math.max(0, forecastVol - 1.96 * seVol));
      upper95.push(forecastVol + 1.96 * seVol);
    }

    return {
      horizon,
      volatilityPath,
      volatilityCone: { lower95, upper95 },
    };
  }

  /**
   * Calculate VaR using GARCH volatility forecast
   */
  calculateGARCHVaR(
    portfolioValue: number,
    garchResult: GARCHResult,
    confidenceLevel: number = 0.95
  ): { var95: number; var99: number; methodology: string } {
    // One-tailed z-scores for VaR
    const zScore95 = 1.645;
    const zScore99 = 2.326;

    // Use GARCH forecast volatility instead of historical
    const dailyVol = garchResult.forecastVolatility;

    const var95 = portfolioValue * zScore95 * dailyVol;
    const var99 = portfolioValue * zScore99 * dailyVol;

    return {
      var95: Number(var95.toFixed(2)),
      var99: Number(var99.toFixed(2)),
      methodology: "GARCH(1,1) conditional volatility forecast",
    };
  }

  /**
   * Initialize GARCH parameters using method of moments
   */
  private initializeParams(
    sampleVariance: number,
    initial?: Partial<GARCHParams>
  ): GARCHParams {
    // Typical starting values that work well for financial data
    const defaultAlpha = 0.05; // Shock impact
    const defaultBeta = 0.90; // Persistence
    const defaultOmega = sampleVariance * (1 - defaultAlpha - defaultBeta);

    return {
      omega: initial?.omega ?? Math.max(defaultOmega, 1e-10),
      alpha: initial?.alpha ?? defaultAlpha,
      beta: initial?.beta ?? defaultBeta,
    };
  }

  /**
   * Optimize GARCH parameters using gradient descent
   * (Simplified version - production would use proper BFGS)
   */
  private optimizeParams(
    returns: number[],
    initialParams: GARCHParams,
    sampleVariance: number
  ): GARCHParams {
    let params = { ...initialParams };
    let bestParams = { ...params };
    let bestLogLik = -Infinity;

    const stepSizes = [0.001, 0.0001, 0.00001];
    const paramRanges = {
      omega: { min: 1e-10, max: sampleVariance * 0.5 },
      alpha: { min: 0.001, max: 0.3 },
      beta: { min: 0.5, max: 0.99 },
    };

    // Grid search with refinement for robust estimation
    for (const step of stepSizes) {
      for (let iter = 0; iter < this.MAX_ITERATIONS / stepSizes.length; iter++) {
        const conditionalVariance = this.calculateConditionalVariance(returns, params, sampleVariance);
        const logLik = this.calculateLogLikelihood(returns, conditionalVariance);

        if (logLik > bestLogLik) {
          bestLogLik = logLik;
          bestParams = { ...params };
        }

        // Numerical gradient
        const grad = this.calculateGradient(returns, params, sampleVariance);

        // Update with constraints
        params.omega = Math.max(
          paramRanges.omega.min,
          Math.min(paramRanges.omega.max, params.omega + step * grad.omega)
        );
        params.alpha = Math.max(
          paramRanges.alpha.min,
          Math.min(paramRanges.alpha.max, params.alpha + step * grad.alpha)
        );
        params.beta = Math.max(
          paramRanges.beta.min,
          Math.min(paramRanges.beta.max, params.beta + step * grad.beta)
        );

        // Enforce stationarity: α + β < 1
        if (params.alpha + params.beta >= 0.999) {
          const scale = 0.998 / (params.alpha + params.beta);
          params.alpha *= scale;
          params.beta *= scale;
        }
      }
    }

    return bestParams;
  }

  /**
   * Calculate conditional variance series using GARCH recursion
   */
  private calculateConditionalVariance(
    returns: number[],
    params: GARCHParams,
    initialVariance: number
  ): number[] {
    const { omega, alpha, beta } = params;
    const n = returns.length;
    const sigma2: number[] = new Array(n);

    // Initialize with sample variance
    sigma2[0] = initialVariance;

    for (let t = 1; t < n; t++) {
      const prevReturn = returns[t - 1] ?? 0;
      const prevVariance = sigma2[t - 1] ?? initialVariance;

      // GARCH(1,1) recursion: σ²(t) = ω + α × ε²(t-1) + β × σ²(t-1)
      sigma2[t] = omega + alpha * prevReturn * prevReturn + beta * prevVariance;

      // Prevent numerical underflow
      if ((sigma2[t] ?? 0) < 1e-20) {
        sigma2[t] = 1e-20;
      }
    }

    return sigma2;
  }

  /**
   * Calculate log-likelihood for Gaussian GARCH
   */
  private calculateLogLikelihood(returns: number[], conditionalVariance: number[]): number {
    const n = returns.length;
    let logLik = 0;

    for (let t = 0; t < n; t++) {
      const r = returns[t] ?? 0;
      const sigma2 = conditionalVariance[t] ?? 1e-10;

      // Log-likelihood: -0.5 × (log(2π) + log(σ²) + r²/σ²)
      logLik += -0.5 * (Math.log(2 * Math.PI) + Math.log(sigma2) + (r * r) / sigma2);
    }

    return logLik;
  }

  /**
   * Calculate numerical gradient for optimization
   */
  private calculateGradient(
    returns: number[],
    params: GARCHParams,
    sampleVariance: number
  ): GARCHParams {
    const delta = 1e-6;
    const baseLogLik = this.calculateLogLikelihood(
      returns,
      this.calculateConditionalVariance(returns, params, sampleVariance)
    );

    const gradOmega = (
      this.calculateLogLikelihood(
        returns,
        this.calculateConditionalVariance(returns, { ...params, omega: params.omega + delta }, sampleVariance)
      ) - baseLogLik
    ) / delta;

    const gradAlpha = (
      this.calculateLogLikelihood(
        returns,
        this.calculateConditionalVariance(returns, { ...params, alpha: params.alpha + delta }, sampleVariance)
      ) - baseLogLik
    ) / delta;

    const gradBeta = (
      this.calculateLogLikelihood(
        returns,
        this.calculateConditionalVariance(returns, { ...params, beta: params.beta + delta }, sampleVariance)
      ) - baseLogLik
    ) / delta;

    return { omega: gradOmega, alpha: gradAlpha, beta: gradBeta };
  }

  /**
   * Generate human-readable interpretation
   */
  private generateInterpretation(
    annualizedVol: number,
    forecastVol: number,
    persistence: number,
    halfLife: number
  ): string {
    const volPercent = (annualizedVol * 100).toFixed(1);
    const forecastPercent = (forecastVol * 100).toFixed(1);

    let volLevel: string;
    if (annualizedVol < 0.15) volLevel = "low";
    else if (annualizedVol < 0.25) volLevel = "moderate";
    else if (annualizedVol < 0.40) volLevel = "high";
    else volLevel = "very high";

    let persistenceLevel: string;
    if (persistence < 0.90) persistenceLevel = "low persistence (volatility shocks decay quickly)";
    else if (persistence < 0.97) persistenceLevel = "moderate persistence";
    else persistenceLevel = "high persistence (volatility shocks are long-lasting)";

    const halfLifeStr = halfLife === Infinity ? "infinite" : `${halfLife.toFixed(1)} trading days`;

    return `Current annualized volatility: ${volPercent}% (${volLevel}). ` +
      `One-day forecast: ${forecastPercent}% annualized. ` +
      `Volatility ${persistenceLevel}. ` +
      `Half-life to long-run volatility: ${halfLifeStr}.`;
  }
}
