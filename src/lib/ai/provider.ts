import { classifyProviderError } from "./parse";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LlmCompletionArgs {
  system: string;
  user: string;
  tools: ToolDef[];
}

export type LlmCompletionResult =
  | { toolName: string; toolInput: unknown }
  | { text: string };

export interface LlmProvider {
  complete(args: LlmCompletionArgs): Promise<LlmCompletionResult>;
}

/**
 * Creates an instance of an LlmProvider for a specific provider type and model.
 */
export async function createSingleModelProvider(
  providerType: string,
  model: string
): Promise<LlmProvider> {
  if (providerType === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("Missing required environment variable ANTHROPIC_API_KEY.");
    }
    const { AnthropicProvider } = await import("./anthropic");
    return new AnthropicProvider(model, apiKey);
  }

  if (providerType === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("Missing required environment variable GEMINI_API_KEY.");
    }
    const { GeminiProvider } = await import("./gemini");
    return new GeminiProvider(model, apiKey);
  }

  throw new Error(
    `Unsupported LLM_PROVIDER: "${providerType}". Expected "anthropic" or "gemini".`
  );
}

/**
 * Fallback-aware LlmProvider wrapper.
 * Tries the primary model, then each fallback model in order.
 * Advances to the next model ONLY on retryable errors.
 * Non-retryable errors throw immediately.
 * If all models fail, re-throws the last error.
 */
export class FallbackLlmProvider implements LlmProvider {
  constructor(
    private readonly models: string[],
    private readonly providerFactory: (model: string) => Promise<LlmProvider>
  ) {}

  async complete(args: LlmCompletionArgs): Promise<LlmCompletionResult> {
    let lastError: unknown = null;

    for (let i = 0; i < this.models.length; i++) {
      const model = this.models[i];
      if (i > 0) {
        console.warn(`[LLM Fallback] Switching to fallback model: ${model}`);
      }

      try {
        const provider = await this.providerFactory(model);
        return await provider.complete(args);
      } catch (err) {
        lastError = err;
        const classified = classifyProviderError(err);
        if (!classified.retryable) {
          // Non-retryable error (e.g. 401, 400, 403, 404): fail immediately
          throw err;
        }
        // Retryable error (429, 500, 502, 503, 504, network): advance to next model if available
      }
    }

    throw lastError;
  }
}

/**
 * Returns an LlmProvider based on the LLM_PROVIDER and LLM_MODEL environment variables,
 * wrapping in FallbackLlmProvider if fallback models are configured.
 */
export async function getProvider(): Promise<LlmProvider> {
  const providerType = process.env.LLM_PROVIDER?.trim().toLowerCase();
  const primaryModel = process.env.LLM_MODEL?.trim();

  if (!providerType) {
    throw new Error(
      "Missing required environment variable LLM_PROVIDER. Expected 'anthropic' or 'gemini'."
    );
  }

  if (!primaryModel) {
    throw new Error(
      "Missing required environment variable LLM_MODEL. Please specify a model name (e.g. 'claude-3-5-sonnet-latest' or 'gemini-2.5-flash')."
    );
  }

  const rawFallbacks = process.env.LLM_FALLBACK_MODELS?.trim();
  const fallbackModels = rawFallbacks
    ? rawFallbacks
        .split(",")
        .map((m) => m.trim())
        .filter((m) => m.length > 0 && m !== primaryModel)
    : [];

  const allModels = [primaryModel, ...fallbackModels];

  if (allModels.length === 1) {
    return createSingleModelProvider(providerType, primaryModel);
  }

  return new FallbackLlmProvider(allModels, (model) =>
    createSingleModelProvider(providerType, model)
  );
}
