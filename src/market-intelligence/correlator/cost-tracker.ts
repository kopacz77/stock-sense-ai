import { JsonlStore } from "../storage/jsonl-store.js";
import type { CorrelationCost } from "./llm-correlator.js";

interface CostEntry {
  fetchedAt: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  usdEstimate: number;
}

/**
 * Persists per-call LLM cost entries and exposes daily totals for the
 * scheduler to gate further calls.
 */
export class LlmCostTracker {
  private store: JsonlStore<CostEntry>;

  constructor(dir = "./data/intel") {
    this.store = new JsonlStore<CostEntry>(dir, "llm-cost");
  }

  async record(cost: CorrelationCost): Promise<void> {
    await this.store.append({
      fetchedAt: new Date().toISOString(),
      provider: cost.provider,
      inputTokens: cost.inputTokens,
      outputTokens: cost.outputTokens,
      usdEstimate: cost.usdEstimate,
    });
  }

  async todayUsd(): Promise<number> {
    const entries = await this.store.readDay(new Date());
    return entries.reduce((sum, e) => sum + (e.usdEstimate ?? 0), 0);
  }
}
