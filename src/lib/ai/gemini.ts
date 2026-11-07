import { GoogleGenAI, FunctionCallingConfigMode, FunctionDeclaration, Content } from "@google/genai";
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

    let contents: string | Content[];
    if (typeof args.user === "string") {
      contents = args.user;
    } else {
      contents = [
        {
          role: "user",
          parts: args.user.map((part) => {
            if (typeof part === "string") {
              return { text: part };
            }
            return {
              inlineData: {
                mimeType: part.inlineData.mimeType,
                data: part.inlineData.data,
              },
            };
          }),
        },
      ];
    }

    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
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
