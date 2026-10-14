import Anthropic from "@anthropic-ai/sdk";
import { LlmCompletionArgs, LlmCompletionResult, LlmProvider } from "./provider";

export class AnthropicProvider implements LlmProvider {
  private client: Anthropic;
  private model: string;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.client = new Anthropic({ apiKey });
  }

  async complete(args: LlmCompletionArgs): Promise<LlmCompletionResult> {
    const tools: Anthropic.Tool[] = args.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
      tools,
      tool_choice: { type: "any", disable_parallel_tool_use: true },
    });

    for (const block of response.content) {
      if (block.type === "tool_use") {
        return {
          toolName: block.name,
          toolInput: block.input,
        };
      }
    }

    // Fallback if no tool_use block was produced
    const textBlocks = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return { text: textBlocks };
  }
}
