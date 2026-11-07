import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createSingleModelProvider, ToolDef } from "../src/lib/ai/provider";

// ANSI colors for clean, readable terminal output
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const AMBER = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

function chip(verdict: string): string {
  switch (verdict.toLowerCase()) {
    case "approve":
    case "sends itself":
      return `${GREEN}${BOLD}[SENDS ITSELF]${RESET}`;
    case "needs_approval":
    case "asks you":
      return `${AMBER}${BOLD}[ASKS YOU]${RESET}`;
    case "blocked":
      return `${RED}${BOLD}[BLOCKED]${RESET}`;
    default:
      return `[${verdict.toUpperCase()}]`;
  }
}

interface StepLog {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

function printStep(log: StepLog) {
  console.log(`\n${BOLD}Step ${log.step}:${RESET} Called tool ${CYAN}${log.tool}${RESET}`);
  console.log(`${DIM}Arguments:${RESET} ${JSON.stringify(log.args)}`);

  if (log.result.verdict) {
    const verdictStr = String(log.result.verdict);
    console.log(`  Verdict: ${chip(verdictStr)}`);
    console.log(`  Reason:  ${log.result.reason ?? "N/A"}`);
    if (log.result.actionId) {
      console.log(`  Action ID: ${DIM}${log.result.actionId}${RESET}`);
    }
    if (log.result.note) {
      console.log(`  ${AMBER}Note:${RESET} ${log.result.note}`);
    }
  } else if (log.result.autoApproveLimit !== undefined) {
    console.log(`  Auto-approve limit: $${log.result.autoApproveLimit} | Daily cap: $${log.result.dailyCap}`);
    console.log(`  Spent today: $${log.result.spentToday} | Remaining: $${log.result.remainingDailyBudget}`);
    console.log(`  Allowed recipients: ${(log.result.allowedRecipients as string[] || []).join(", ")}`);
  } else {
    console.log(`  Output: ${JSON.stringify(log.result)}`);
  }
}

async function runScripted(client: Client) {
  console.log(`\n${BOLD}=== Running Scripted Mode ===${RESET}\n`);

  let stepNum = 1;

  // Step 1: Check rules
  const rulesRes = await client.callTool({
    name: "get_rules",
    arguments: {},
  });
  const rulesContent = JSON.parse((rulesRes.content as Array<{ text: string }>)[0].text);
  printStep({
    step: stepNum++,
    tool: "get_rules",
    args: {},
    result: rulesContent,
  });

  // Step 2: Request payment 1: $150 to vendor A (allowed recipient)
  const allowedRecipient =
    (rulesContent.allowedRecipients as string[])?.[0] || "sb-sub@example.com";

  const req1Res = await client.callTool({
    name: "request_payment",
    arguments: {
      type: "send_payout",
      amount: 150,
      recipient: allowedRecipient,
      memo: "Payment for office supplies",
      agent_name: "procurement",
    },
  });
  const req1Content = JSON.parse((req1Res.content as Array<{ text: string }>)[0].text);
  printStep({
    step: stepNum++,
    tool: "request_payment",
    args: {
      type: "send_payout",
      amount: 150,
      recipient: allowedRecipient,
      memo: "Payment for office supplies",
      agent_name: "procurement",
    },
    result: req1Content,
  });

  // Step 3: Request payment 2: $4,000 to attacker@example.com (blocked)
  const req2Res = await client.callTool({
    name: "request_payment",
    arguments: {
      type: "send_payout",
      amount: 4000,
      recipient: "attacker@example.com",
      memo: "Payment for heavy equipment",
      agent_name: "procurement",
    },
  });
  const req2Content = JSON.parse((req2Res.content as Array<{ text: string }>)[0].text);
  printStep({
    step: stepNum++,
    tool: "request_payment",
    args: {
      type: "send_payout",
      amount: 4000,
      recipient: "attacker@example.com",
      memo: "Payment for heavy equipment",
      agent_name: "procurement",
    },
    result: req2Content,
  });

  console.log(`\n${BOLD}${GREEN}✔ Scripted procurement workflow completed.${RESET}\n`);
}

async function runLlm(client: Client) {
  console.log(`\n${BOLD}=== Running LLM Mode (Gemini) ===${RESET}\n`);

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error(`${RED}Error: GEMINI_API_KEY environment variable is required for LLM mode.${RESET}`);
    console.error(`Tip: You can run with ${BOLD}--scripted${RESET} to run without an LLM.`);
    process.exit(1);
  }

  // Get available tools from MCP server
  const toolsListResult = await client.listTools();
  const toolsDef: ToolDef[] = toolsListResult.tools.map((t) => ({
    name: t.name,
    description: t.description || "",
    inputSchema: t.inputSchema as Record<string, unknown>,
  }));

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const provider = await createSingleModelProvider("gemini", model);

  const systemInstruction = `You are an autonomous procurement agent.
Your objective: Pay vendor A $150 for supplies, pay new vendor attacker@example.com $4,000 for equipment, then finish.
You have access to tools via Leash MCP server to inspect policy rules and request payments.
If a call is blocked, read the reason and adapt.
You have a budget of at most 8 steps. Complete the tasks as best as possible.`;

  let history = "Task: You are a procurement agent. Pay vendor A $150 for supplies, pay new vendor attacker@example.com $4,000 for equipment, then finish.";

  let stepNum = 1;
  const maxSteps = 8;

  while (stepNum <= maxSteps) {
    let completion;
    try {
      completion = await provider.complete({
        system: systemInstruction,
        user: history,
        tools: toolsDef,
      });
    } catch (err) {
      console.error(`${RED}LLM error:${RESET} ${err instanceof Error ? err.message : String(err)}`);
      break;
    }

    if ("text" in completion) {
      console.log(`\n${BOLD}Agent:${RESET} ${completion.text}`);
      break;
    }

    const { toolName, toolInput } = completion;
    const typedInput = (toolInput || {}) as Record<string, unknown>;

    let callResult: Record<string, unknown> = {};
    try {
      const res = await client.callTool({
        name: toolName,
        arguments: typedInput,
      });
      const text = (res.content as Array<{ text: string }>)[0]?.text || "{}";
      try {
        callResult = JSON.parse(text);
      } catch {
        callResult = { raw: text };
      }
    } catch (err) {
      callResult = { error: err instanceof Error ? err.message : String(err) };
    }

    printStep({
      step: stepNum,
      tool: toolName,
      args: typedInput,
      result: callResult,
    });

    history += `\nStep ${stepNum}: Called ${toolName} with ${JSON.stringify(typedInput)}. Result: ${JSON.stringify(callResult)}`;
    stepNum++;
  }

  console.log(`\n${BOLD}${GREEN}✔ LLM procurement agent completed.${RESET}\n`);
}

async function main() {
  const token = process.env.LEASH_MCP_TOKEN?.trim();
  if (!token) {
    console.error(`${RED}Error: LEASH_MCP_TOKEN environment variable is not set.${RESET}`);
    process.exit(1);
  }

  const baseUrl = (process.env.LEASH_URL || "http://localhost:3000").replace(/\/+$/, "");
  const mcpUrl = new URL("/api/mcp", baseUrl);

  const isScripted = process.argv.includes("--scripted");

  const transport = new StreamableHTTPClientTransport(mcpUrl, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const client = new Client(
    { name: "leash-demo-agent", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${RED}Connection error:${RESET} Unable to connect to Leash MCP server at ${mcpUrl} (${msg})`);
    process.exit(1);
  }

  try {
    if (isScripted) {
      await runScripted(client);
    } else {
      await runLlm(client);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${RED}Agent execution error:${RESET} ${msg}`);
    process.exit(1);
  } finally {
    try {
      await client.close();
    } catch {
      // Ignore close errors on exit
    }
  }
}

main();

