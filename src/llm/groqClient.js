import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// openai/gpt-oss-120b is Groq's current recommended general-purpose model
// (llama-3.3-70b-versatile and llama-3.1-8b-instant were deprecated June 2026).
// Override via GROQ_MODEL if you want to try qwen/qwen3.6-27b or something newer —
// check https://console.groq.com/docs/models for what's current before the demo.
export const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// Hard ceiling per individual retry wait — protects against a large
// retry-after header value stacking into unacceptable latency for
// time-sensitive callers (e.g. OKX's functional verification, or any
// caller with a short timeout).
const MAX_RETRY_WAIT_MS = 2000;

// Overall time budget for the whole callGroqWithRetry call, including all
// retries. Once exceeded, we stop retrying and throw immediately rather
// than stack further delay on top of an already-slow situation. Tunable
// via GROQ_MAX_TOTAL_WAIT_MS if a particular deployment needs more/less
// headroom (e.g. a caller known to tolerate longer waits).
const MAX_TOTAL_WAIT_MS = Number(process.env.GROQ_MAX_TOTAL_WAIT_MS || 6000);

export async function callGroqWithRetry(params, retriesLeft = 3, deadline = null) {
  const callDeadline = deadline ?? Date.now() + MAX_TOTAL_WAIT_MS;

  try {
    return await groq.chat.completions.create(params);
  } catch (err) {
    const status = err?.status;
    const timeLeft = callDeadline - Date.now();

    if (status === 429 && retriesLeft > 0 && timeLeft > 0) {
      const retryAfterHeader = err?.headers?.["retry-after"];
      const requestedWaitMs = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : 1500;

      // Cap the wait to the smaller of: our hard ceiling, and whatever time
      // is actually left in the overall budget — never wait longer than we
      // have room for.
      const waitMs = Math.max(0, Math.min(requestedWaitMs, MAX_RETRY_WAIT_MS, timeLeft));

      console.warn(
        `[groq] rate limited, waiting ${(waitMs / 1000).toFixed(1)}s before retry (${retriesLeft} retries left, ${(timeLeft / 1000).toFixed(1)}s budget remaining)...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return callGroqWithRetry(params, retriesLeft - 1, callDeadline);
    }

    if (status === 429) {
      console.error(
        `[groq] rate limited and out of retries/time budget (${retriesLeft} retries left, ${timeLeft}ms left) — failing fast.`
      );
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