import { BriefFacts, buildTemplateBrief } from "./briefFacts";
import { getProvider, LlmProvider, ToolDef } from "./ai/provider";
import { classifyProviderError, DelayFn } from "./ai/parse";
import { z } from "zod";

export interface BriefResult {
  text: string;
  source: "ai" | "template";
}

const BRIEF_TOOLS: ToolDef[] = [
  {
    name: "word_brief",
    description: "Provide a single concise sentence under 160 characters describing the key transaction facts.",
    inputSchema: {
      type: "object",
      properties: {
        sentence: {
          type: "string",
          description: "One plain summary sentence strictly under 160 characters.",
        },
      },
      required: ["sentence"],
      additionalProperties: false,
    },
  },
];

const WordBriefSchema = z.object({
  sentence: z.string().trim().min(1).max(160),
});

/**
 * Validates the candidate sentence from AI against the strictly computed BriefFacts:
 * 1. Single line (no newlines).
 * 2. Under 160 characters.
 * 3. No URLs or web addresses.
 * 4. No email addresses.
 * 5. Every number in the sentence must come directly from facts (or rounded / formatted equivalents).
 */
export function validateBriefWording(sentence: string, facts: BriefFacts): boolean {
  if (!sentence || sentence.length > 160) return false;
  if (sentence.includes("\n") || sentence.includes("\r")) return false;

  // No URLs
  if (/(https?:\/\/|www\.)/i.test(sentence)) return false;

  // No email addresses
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/i.test(sentence)) return false;

  // Extract all numbers from the generated sentence
  // Matches "$1,320", "1.5", "4", "1000", "2x"
  const rawNumberTokens = sentence.match(/\b\d+(?:,\d{3})*(?:\.\d+)?\b/g) || [];

  // Allowed numbers from facts
  const allowedNumbers = new Set<number>();

  function registerNumber(n: number | null | undefined) {
    if (n === null || n === undefined || !Number.isFinite(n)) return;
    allowedNumbers.add(n);
    allowedNumbers.add(Math.round(n));
    allowedNumbers.add(Math.floor(n));
    allowedNumbers.add(Math.ceil(n));
    allowedNumbers.add(Number(n.toFixed(1)));
    allowedNumbers.add(Number(n.toFixed(2)));
  }

  registerNumber(facts.amount);
  registerNumber(facts.priorPaymentCount);
  registerNumber(facts.priorTotal);
  registerNumber(facts.averagePayout);
  registerNumber(facts.multipleOfAverage);
  registerNumber(facts.spentToday);
  registerNumber(facts.projectedSpend);
  registerNumber(facts.dailyCap);

  // Allow numbers 0 and 1 if used in standard grammatical context (e.g., "1st", "1 time")
  allowedNumbers.add(1);

  for (const token of rawNumberTokens) {
    const cleanNumStr = token.replace(/,/g, "");
    const parsedNum = parseFloat(cleanNumStr);
    if (!Number.isFinite(parsedNum)) return false;

    // Check if parsedNum is close to any allowed number
    let matched = false;
    for (const allowed of allowedNumbers) {
      if (Math.abs(parsedNum - allowed) < 0.05) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      return false;
    }
  }

  return true;
}

const BRIEF_SYSTEM_PROMPT = `You are a concise financial approval assistant.
Your task is to write ONE plain sentence strictly under 160 characters summarizing the facts of an approval request.
Rules:
- Use ONLY the provided numbers and facts. Never invent or hallucinate any numbers, names, or percentages.
- Do not mention URLs or email addresses.
- Write a natural, informative sentence helping a human approver understand if this is a first-time recipient, repeat volume, high multiple of average payout, or near/over the daily cap.
- Call the word_brief tool with your sentence.`;

export async function generateApprovalBrief(
  facts: BriefFacts,
  provider?: LlmProvider,
  delayFn: DelayFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<BriefResult> {
  const templateFallback = buildTemplateBrief(facts);

  try {
    const activeProvider = provider || (await getProvider());

    const factsJson = JSON.stringify({
      amountUSD: facts.amount,
      actionType: facts.type,
      isFirstPaymentToRecipient: facts.isFirstPaymentToRecipient,
      priorPaymentsCount: facts.priorPaymentCount,
      priorTotalUSD: facts.priorTotal,
      averagePayoutUSD: facts.averagePayout,
      multipleOfAverage: facts.multipleOfAverage,
      spentTodayUSD: facts.spentToday,
      projectedSpendUSD: facts.projectedSpend,
      dailyCapUSD: facts.dailyCap,
      wouldExceedDailyCap: facts.wouldExceedCap,
      policyRule: facts.ruleFired,
      source: facts.sourceType,
    });

    const delays = [0, 500, 1000];
    let result: import("./ai/provider").LlmCompletionResult | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await activeProvider.complete({
          system: BRIEF_SYSTEM_PROMPT,
          user: `Transaction facts:\n${factsJson}`,
          tools: BRIEF_TOOLS,
        });
        break;
      } catch (err) {
        const classified = classifyProviderError(err);
        if (!classified.retryable || attempt === 2) {
          break;
        }
        await delayFn(delays[attempt]);
      }
    }

    if (result && "toolName" in result && result.toolName === "word_brief") {
      const parsed = WordBriefSchema.safeParse(result.toolInput);
      if (parsed.success) {
        const candidate = parsed.data.sentence.trim();
        if (validateBriefWording(candidate, facts)) {
          return { text: candidate, source: "ai" };
        }
      }
    }
  } catch {
    // Graceful fallback to deterministic template on any AI or validation failure
  }

  return { text: templateFallback, source: "template" };
}

