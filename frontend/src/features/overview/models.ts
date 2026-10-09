import type { ModelMetrics } from "@/lib/api";
import { parseMoney } from "@/lib/format";

/** How many models the Models card lists before "All models" expands it. */
export const MODEL_PREVIEW_LIMIT = 5;

/** Busiest models first; ties broken by name so the order is stable between refetches. */
export function sortModelsByCalls(models: readonly ModelMetrics[]): ModelMetrics[] {
  return [...models].sort((a, b) => {
    if (b.calls !== a.calls) {
      return b.calls - a.calls;
    }
    return (a.model ?? "").localeCompare(b.model ?? "");
  });
}

/** Error ratio for a model row, or null when it made no calls. */
export function modelErrorRate(model: Pick<ModelMetrics, "calls" | "errors">): number | null {
  return model.calls > 0 ? model.errors / model.calls : null;
}

/** A stable React key for a model row; provider and model can both be null. */
export function modelRowKey(model: Pick<ModelMetrics, "provider" | "model">): string {
  return `${model.provider ?? "∅"}/${model.model ?? "∅"}`;
}

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  azure: "Azure",
  azure_openai: "Azure OpenAI",
  google: "Google",
  gemini: "Google",
  vertex_ai: "Vertex AI",
  bedrock: "Bedrock",
  aws_bedrock: "Bedrock",
  meta: "Meta",
  mistral: "Mistral",
  cohere: "Cohere",
  groq: "Groq",
  ollama: "Ollama",
  together: "Together",
  deepseek: "DeepSeek",
  xai: "xAI",
};

/** The display name for a provider id ("openai" → "OpenAI"); unknown ids are capitalised. */
export function formatProvider(provider: string | null): string | null {
  if (provider === null || provider.trim() === "") {
    return null;
  }
  const known = PROVIDER_NAMES[provider.toLowerCase()];
  if (known) {
    return known;
  }
  return `${provider.charAt(0).toUpperCase()}${provider.slice(1)}`;
}

/** True when the model has no price, so its calls are missing from spend. */
export function isUnpriced(model: Pick<ModelMetrics, "cost_usd">): boolean {
  return parseMoney(model.cost_usd) === null;
}

/** Calls made with models that have no price. */
export function unpricedCalls(models: readonly ModelMetrics[]): number {
  return models.filter(isUnpriced).reduce((sum, model) => sum + model.calls, 0);
}
