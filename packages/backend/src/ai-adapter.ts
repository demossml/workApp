// Hermes AI adapter — replaces Cloudflare AI binding
// Uses Anthropic API for text, returns placeholder for vision
import { execSync } from "child_process";

interface AiRunOptions {
  messages?: Array<{ role: string; content: string | Array<{ type: string; text?: string; image?: string }> }>;
  prompt?: string;
  max_tokens?: number;
  temperature?: number;
}

interface AiRunResult {
  response?: string;
  choices?: Array<{ message?: { content?: string } }>;
}

function extractTextFromMessages(messages?: AiRunOptions["messages"]): string {
  if (!messages) return "";
  return messages
    .filter(m => m.role === "user")
    .map(m => {
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.content)) {
        return m.content
          .filter(c => c.type === "text" && c.text)
          .map(c => c.text)
          .join("\n");
      }
      return "";
    })
    .join("\n\n");
}

async function callAnthropic(prompt: string, opts: { maxTokens?: number }): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) {
    // Fallback to Hermes CLI
    try {
      const result = execSync(
        `python3 ~/.hermes/hermes-tools/tools.py ask ${JSON.stringify(prompt.slice(0, 4000))}`,
        { timeout: 60000, maxBuffer: 100 * 1024 }
      );
      return result.toString().trim();
    } catch {
      return "AI сервис временно недоступен";
    }
  }
  
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: opts.maxTokens || 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(55000),
    });
    const data: any = await resp.json();
    return data?.content?.[0]?.text || JSON.stringify(data);
  } catch {
    return "AI сервис временно недоступен";
  }
}

export function createAiAdapter(): any {
  return {
    async run(model: string, options: AiRunOptions): Promise<any> {
      // Vision models — return placeholder
      if (model.includes("vision")) {
        return { response: "[vision analysis skipped — local mode]" };
      }

      const text = options.prompt || extractTextFromMessages(options.messages);
      if (!text) return { response: "" };

      const result = await callAnthropic(text, { maxTokens: options.max_tokens });
      return { response: result };
    },
  };
}
