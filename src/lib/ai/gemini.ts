import { GoogleGenAI, FunctionCallingConfigMode, FunctionDeclaration } from "@google/genai";
import { LlmCompletionArgs, LlmCompletionResult, LlmProvider } from "./provider";

export class GeminiProvider implements LlmProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.client = new GoogleGenAI({ apiKey });
  }

  async complete(args: LlmCompletionArgs): Promise<LlmCompletionResult> {
    const functionDeclarations: FunctionDeclaration[] = args.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parametersJsonSchema: t.inputSchema,
    }));

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: args.user,
      config: {
        systemInstruction: args.system,
        tools: [{ functionDeclarations }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: args.tools.map((t) => t.name),
          },
        },
      },
    });

    const calls = response.functionCalls;
    if (calls && calls.length > 0) {
      const call = calls[0];
      return {
        toolName: call.name ?? "",
        toolInput: call.args ?? {},
      };
    }

    return { text: response.text ?? "" };
  }
}
