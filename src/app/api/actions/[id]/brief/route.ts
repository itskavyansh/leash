import { NextResponse } from "next/server";
import { getAction, listActions, getSpentToday, getRules } from "@/lib/db";
import { buildBriefFacts } from "@/lib/briefFacts";
import { generateApprovalBrief, BriefResult } from "@/lib/briefWording";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";

// In-memory cache: key = `${actionId}:${factsHash}`, value = BriefResult
// Limit size to avoid unbounded memory
const briefCache = new Map<string, BriefResult>();

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`brief:${ip}`);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429 }
    );
  }

  const { id } = await ctx.params;

  const action = await getAction(id);
  if (!action || action.status !== "pending_approval") {
    return NextResponse.json(
      { error: "Action not found or not pending approval" },
      { status: 404 }
    );
  }

  const history = await listActions();
  const spentToday = await getSpentToday();
  const rules = await getRules();

  const facts = buildBriefFacts(action, history, spentToday, rules);

  // Simple facts hash for cache validation
  const factsHash = [
    facts.amount,
    facts.isFirstPaymentToRecipient,
    facts.priorPaymentCount,
    facts.priorTotal,
    facts.multipleOfAverage,
    facts.spentToday,
    facts.projectedSpend,
    facts.wouldExceedCap,
  ].join("|");

  const cacheKey = `${action.id}:${factsHash}`;
  const cached = briefCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { status: 200 });
  }

  const briefResult = await generateApprovalBrief(facts);

  // Maintain cache size under 100 entries
  if (briefCache.size > 100) {
    const firstKey = briefCache.keys().next().value;
    if (firstKey) briefCache.delete(firstKey);
  }
  briefCache.set(cacheKey, briefResult);

  return NextResponse.json(briefResult, { status: 200 });
}

