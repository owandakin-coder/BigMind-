/**
 * costEstimator.ts — Token and cost estimation for agent LLM calls.
 *
 * Provides pre-call cost ceiling checks and post-call cost tracking.
 * All prices are per-million-token rates (as of June 2026).
 */

export type ModelId =
  | 'claude-opus-4-8'
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5'
  | 'gpt-4o'
  | 'gpt-4o-mini'

/** Prices in USD per 1,000 tokens */
const TOKEN_PRICES: Record<ModelId, { input: number; output: number }> = {
  'claude-opus-4-8':   { input: 0.015,  output: 0.075  },
  'claude-sonnet-4-6': { input: 0.003,  output: 0.015  },
  'claude-haiku-4-5':  { input: 0.00025,output: 0.00125 },
  'gpt-4o':            { input: 0.005,  output: 0.015  },
  'gpt-4o-mini':       { input: 0.00015,output: 0.0006  },
}

/** Credit cost per agent run (matches AGENT_CREDIT_COST in execute-agent-workflow) */
export const AGENT_CREDIT_COST: Record<string, number> = {
  market_research_agent:     5,
  course_architect_agent:    3,
  content_production_agent:  10,
  sales_page_agent:          4,
  marketing_agent:           6,
  analytics_agent:           1,
  publishing_agent:          2,
  portfolio_manager_agent:   2,
  revenue_intelligence_agent:2,
  seo_agent:                 2,
  customer_success_agent:    2,
}

export interface TokenUsage {
  inputTokens:  number
  outputTokens: number
  totalTokens:  number
  costUsd:      number
  modelId:      ModelId
}

/**
 * Estimate cost from token counts (post-call).
 */
export function computeCost(
  modelId:      ModelId,
  inputTokens:  number,
  outputTokens: number
): TokenUsage {
  const prices = TOKEN_PRICES[modelId] ?? TOKEN_PRICES['claude-haiku-4-5']
  const costUsd = (inputTokens / 1000 * prices.input) + (outputTokens / 1000 * prices.output)
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000, // 6 decimal places
    modelId,
  }
}

/**
 * Rough token estimate for a string (4 chars ≈ 1 token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Pre-call budget guard — throws if estimated cost exceeds ceiling.
 */
export function assertBudget(
  modelId:      ModelId,
  inputText:    string,
  maxOutputTokens: number,
  maxCostUsd:   number
): void {
  const inputTokens  = estimateTokens(inputText)
  const estimated    = computeCost(modelId, inputTokens, maxOutputTokens)

  if (estimated.costUsd > maxCostUsd) {
    throw new Error(
      `Pre-call budget exceeded: estimated $${estimated.costUsd.toFixed(4)} > ceiling $${maxCostUsd.toFixed(4)} ` +
      `(${inputTokens} input tokens + ${maxOutputTokens} max output on ${modelId})`
    )
  }
}

/**
 * Select the most cost-effective model for a given agent and prompt size.
 * Automatically downgrades to Haiku for large prompts if Sonnet would exceed budget.
 */
export function selectModel(
  preferredModel: ModelId,
  inputTokens:    number,
  maxOutputTokens: number,
  maxCostUsd:     number
): ModelId {
  const preferred = computeCost(preferredModel, inputTokens, maxOutputTokens)
  if (preferred.costUsd <= maxCostUsd) return preferredModel

  // Try downgrade path
  const downgradeChain: ModelId[] = [
    'claude-sonnet-4-6',
    'claude-haiku-4-5',
    'gpt-4o-mini',
  ]

  for (const model of downgradeChain) {
    if (model === preferredModel) continue
    const cost = computeCost(model, inputTokens, maxOutputTokens)
    if (cost.costUsd <= maxCostUsd) {
      console.warn(`[CostEstimator] Downgraded ${preferredModel} → ${model} to stay under $${maxCostUsd} budget`)
      return model
    }
  }

  // Last resort: use cheapest model
  console.warn(`[CostEstimator] All models exceed budget — using gpt-4o-mini as last resort`)
  return 'gpt-4o-mini'
}
