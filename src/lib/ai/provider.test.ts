import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FallbackLlmProvider, getProvider, LlmProvider } from "./provider";

describe("FallbackLlmProvider and model fallback", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("uses primary model when healthy without calling fallbacks", async () => {
    const mockPrimary: LlmProvider = {
      complete: vi.fn().mockResolvedValue({ toolName: "propose_action", toolInput: {} }),
    };
    const mockFallback: LlmProvider = {
      complete: vi.fn().mockResolvedValue({ toolName: "propose_action", toolInput: {} }),
    };

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fallbackProvider = new FallbackLlmProvider(
      ["primary-model", "fallback-model"],
      async (model) => (model === "primary-model" ? mockPrimary : mockFallback)
    );

    const result = await fallbackProvider.complete({
      system: "sys",
      user: "user",
      tools: [],
    });

    expect(result).toEqual({ toolName: "propose_action", toolInput: {} });
    expect(mockPrimary.complete).toHaveBeenCalledTimes(1);
    expect(mockFallback.complete).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("falls through to fallback model on retryable 503 error and logs a warning with the model name", async () => {
    const err503 = new Error("HTTP 503 Service Unavailable");
    const mockPrimary: LlmProvider = {
      complete: vi.fn().mockRejectedValue(err503),
    };
    const mockFallback: LlmProvider = {
      complete: vi.fn().mockResolvedValue({ toolName: "propose_action", toolInput: { ok: true } }),
    };

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fallbackProvider = new FallbackLlmProvider(
      ["gemini-2.5-pro", "gemini-2.5-flash"],
      async (model) => (model === "gemini-2.5-pro" ? mockPrimary : mockFallback)
    );

    const result = await fallbackProvider.complete({
      system: "sys",
      user: "user",
      tools: [],
    });

    expect(result).toEqual({ toolName: "propose_action", toolInput: { ok: true } });
    expect(mockPrimary.complete).toHaveBeenCalledTimes(1);
    expect(mockFallback.complete).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Switching to fallback model: gemini-2.5-flash")
    );
  });

  it("stops immediately and throws on non-retryable 401 error without trying fallbacks", async () => {
    const err401 = new Error("HTTP 401 Unauthorized: Invalid API key");
    const mockPrimary: LlmProvider = {
      complete: vi.fn().mockRejectedValue(err401),
    };
    const mockFallback: LlmProvider = {
      complete: vi.fn().mockResolvedValue({ toolName: "propose_action", toolInput: {} }),
    };

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fallbackProvider = new FallbackLlmProvider(
      ["primary-model", "fallback-model"],
      async (model) => (model === "primary-model" ? mockPrimary : mockFallback)
    );

    await expect(
      fallbackProvider.complete({
        system: "sys",
        user: "user",
        tools: [],
      })
    ).rejects.toThrow("HTTP 401 Unauthorized");

    expect(mockPrimary.complete).toHaveBeenCalledTimes(1);
    expect(mockFallback.complete).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("throws the last error if all fallback models fail with retryable errors", async () => {
    const err1 = new Error("HTTP 503 Service Unavailable");
    const err2 = new Error("HTTP 429 Too Many Requests");

    const mockPrimary: LlmProvider = {
      complete: vi.fn().mockRejectedValue(err1),
    };
    const mockFallback: LlmProvider = {
      complete: vi.fn().mockRejectedValue(err2),
    };

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fallbackProvider = new FallbackLlmProvider(
      ["m1", "m2"],
      async (model) => (model === "m1" ? mockPrimary : mockFallback)
    );

    await expect(
      fallbackProvider.complete({
        system: "sys",
        user: "user",
        tools: [],
      })
    ).rejects.toThrow("HTTP 429 Too Many Requests");

    expect(mockPrimary.complete).toHaveBeenCalledTimes(1);
    expect(mockFallback.complete).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("getProvider parses LLM_FALLBACK_MODELS and initializes FallbackLlmProvider", async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.LLM_MODEL = "gemini-2.5-pro";
    process.env.LLM_FALLBACK_MODELS = "gemini-2.5-flash, gemini-2.0-flash";
    process.env.GEMINI_API_KEY = "test-key";

    const provider = await getProvider();
    expect(provider).toBeInstanceOf(FallbackLlmProvider);
  });
});
