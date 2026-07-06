import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// openai/gpt-oss-120b is Groq's current recommended general-purpose model
// (llama-3.3-70b-versatile and llama-3.1-8b-instant were deprecated June 2026).
// Override via GROQ_MODEL if you want to try qwen/qwen3.6-27b or something newer —
// check https://console.groq.com/docs/models for what's current before the demo.
export const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export async function callGroqWithRetry(params, retriesLeft = 3) {
  try {
    return await groq.chat.completions.create(params);
  } catch (err) {
    const status = err?.status;
    if (status === 429 && retriesLeft > 0) {
      const retryAfterHeader = err?.headers?.["retry-after"];
      const waitSeconds = retryAfterHeader ? parseFloat(retryAfterHeader) : 5;
      console.warn(
        `[groq] rate limited, waiting ${waitSeconds}s before retry (${retriesLeft} retries left)...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000 + 250));
      return callGroqWithRetry(params, retriesLeft - 1);
    }
    throw err;
  }
}

/**
 * Extracts a {...} JSON object from a raw LLM text response, tolerating
 * markdown fences or stray commentary the model prepends/appends.
 */
export function extractJsonObject(raw) {
  let cleaned = raw.replace(/```json|```/g, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}
