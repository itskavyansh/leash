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
 * Returns an LlmProvider based on the LLM_PROVIDER and LLM_MODEL environment variables.
 * Throws a clear error if required environment variables are missing or invalid.
 */
export async function getProvider(): Promise<LlmProvider> {
  const providerType = process.env.LLM_PROVIDER?.trim().toLowerCase();
  const model = process.env.LLM_MODEL?.trim();

  if (!providerType) {
    throw new Error(
      "Missing required environment variable LLM_PROVIDER. Expected 'anthropic' or 'gemini'."
    );
  }

  if (!model) {
    throw new Error(
      "Missing required environment variable LLM_MODEL. Please specify a model name (e.g. 'claude-3-5-sonnet-latest' or 'gemini-2.5-flash')."
    );
  }

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
