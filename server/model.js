// Model adaptoru (Anthropic Messages API).
//
// Model: claude-haiku-5-5 (resmi sayfadan dogrulandi, 7 Ekim 2026).
// Tek arac: pay(mandateId, payee, amount).
//
// Resmi sayfa `temperature`, `top_p` ve `top_k` gonderilmemesini soyluyor;
// bu yuzden hicbiri set edilmez. Adaptive thinking varsayilan aciktir.

import Anthropic from "@anthropic-ai/sdk";
import { PAY_TOOL } from "./trust.js";

export const MODEL_ID = "claude-haiku-5-5";

export function createModel({ apiKey, model = MODEL_ID, maxTokens = 1024, effort = "low" }) {
  const client = new Anthropic({ apiKey });

  /**
   * @returns {{toolCall: {name: string, input: object}|null, text: string|null, stopReason: string, usage: object}}
   */
  async function decide({ system, user }) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      // Demoda model suresi ayri olculdugu icin dusuk effort tercih edildi.
      output_config: { effort },
      system,
      tools: [PAY_TOOL],
      messages: [{ role: "user", content: user }],
    });

    let toolCall = null;
    const textParts = [];
    for (const block of response.content ?? []) {
      if (block.type === "tool_use" && block.name === PAY_TOOL.name) {
        toolCall = { name: block.name, input: block.input };
      } else if (block.type === "text") {
        textParts.push(block.text);
      }
    }

    return {
      toolCall,
      text: textParts.join("\n").trim() || null,
      stopReason: response.stop_reason,
      usage: response.usage,
      model: response.model,
    };
  }

  return { decide, model };
}
