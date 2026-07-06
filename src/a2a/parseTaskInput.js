import { callGroqWithRetry, extractJsonObject, MODEL } from "../llm/groqClient.js";

/**
 * A2A tasks arrive as natural language (Section 6.2): another agent pastes
 * something like "I'd like to use the service provided by Agent [ID]...
 * Please check the risk consensus for aave-v3 on Arbitrum and find coverage
 * options." This turns that free text into the structured params the core
 * engine (risk-consensus / coverage-match) actually needs.
 *
 * Kept deliberately simple for hackathon scope — one LLM call, low reasoning
 * effort, same retry/parsing infra as the personas. If this turns out to be
 * a bottleneck or unreliable, a regex/keyword fallback for the common phrasing
 * patterns in Section 4.5's service descriptions would be a reasonable Phase 3+
 * fallback, but start here.
 */
const SYSTEM_PROMPT = `You extract structured parameters from a natural-language request to a DeFi risk-consensus and coverage-matching service called Consensus.

Identify:
- "service": either "risk-consensus" (the user wants a risk score/consensus check) or "coverage-match" (the user wants insurance/coverage options) or "both" if the request clearly wants both.
- "protocolSlug": a DeFiLlama-style lowercase-hyphenated protocol slug if a protocol name is mentioned (e.g. "Aave V3" -> "aave-v3", "Uniswap" -> "uniswap-v3" if version unspecified assume v3, "Curve" -> "curve-finance"). Use your best guess at the DeFiLlama slug convention. Null if no protocol name is given.
- "contractAddress": a raw contract address if one is given (0x... or other chain format). Null otherwise.
- "chain": lowercase chain name if mentioned (e.g. "ethereum", "arbitrum", "x-layer"). Null otherwise.

Respond ONLY with valid JSON, no preamble, no markdown fences:
{"service": "risk-consensus"|"coverage-match"|"both", "protocolSlug": string|null, "contractAddress": string|null, "chain": string|null}`;

export async function parseTaskInput(rawText, attempt = 1) {
  const strictReminder =
    attempt > 1
      ? "\n\nIMPORTANT: your previous response was not valid JSON. Respond with ONLY the JSON object, nothing else."
      : "";

  const response = await callGroqWithRetry({
    model: MODEL,
    max_tokens: 400,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Request text:\n\n"${rawText}"${strictReminder}` },
    ],
  });

  const raw = (response.choices?.[0]?.message?.content || "").trim();

  try {
    const parsed = extractJsonObject(raw);
    if (!parsed.service || !["risk-consensus", "coverage-match", "both"].includes(parsed.service)) {
      throw new Error(`invalid or missing "service" field: ${parsed.service}`);
    }
    return {
      service: parsed.service,
      protocolSlug: parsed.protocolSlug || null,
      contractAddress: parsed.contractAddress || null,
      chain: parsed.chain || null,
    };
  } catch (err) {
    if (attempt < 3) {
      console.warn(`[parseTaskInput] unparseable response on attempt ${attempt}, retrying...`);
      return parseTaskInput(rawText, attempt + 1);
    }
    throw new Error(`Could not parse task input after ${attempt} attempts: ${raw.slice(0, 200)}`);
  }
}
