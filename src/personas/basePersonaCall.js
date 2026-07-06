import { callGroqWithRetry, extractJsonObject, MODEL } from "../llm/groqClient.js";

/**
 * Calls a single persona independently against an evidence packet.
 * Personas NEVER see each other's output — each call is isolated,
 * which is what makes disagreement between them meaningful rather than theater.
 *
 * @param {Object} params
 * @param {string} params.personaName - e.g. "The Auditor"
 * @param {string} params.systemPrompt - the persona's distinct system prompt
 * @param {Object} params.evidence - shared evidence packet (on-chain data, audit history, etc.)
 * @returns {Promise<{persona: string, score: number, rationale: string, raw: string}>}
 */
export async function callPersona({ personaName, systemPrompt, evidence }, attempt = 1) {
  const strictReminder =
    attempt > 1
      ? '\n\nIMPORTANT: your previous response was not valid JSON. "score" must be a plain numeral digit (e.g. 55), never spelled out as a word (not "fifty-five"). Do not include any text outside the JSON object.'
      : "";

  const userMessage = `Evidence packet for this protocol/contract:\n\n${JSON.stringify(
    evidence,
    null,
    2
  )}\n\nRespond ONLY with valid JSON in this exact shape, no preamble, no markdown fences:\n{"score": <integer 0-100>, "rationale": "<2-3 sentence explanation in your persona's voice, citing specific evidence fields you weighed>"}${strictReminder}`;

  const response = await callGroqWithRetry({
    model: MODEL,
    max_tokens: 700,
    reasoning_effort: "low", // gpt-oss-120b: keeps hidden reasoning tokens (and TPM burn) down
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const raw = (response.choices?.[0]?.message?.content || "").trim();

  let parsed;
  try {
    parsed = extractJsonObject(raw);
  } catch (err) {
    if (attempt < 3) {
      console.warn(
        `[${personaName}] unparseable JSON on attempt ${attempt} (e.g. score spelled as a word) — retrying with a stricter reminder...`
      );
      return callPersona({ personaName, systemPrompt, evidence }, attempt + 1);
    }
    throw new Error(
      `${personaName} returned unparseable output after ${attempt} attempts: ${raw.slice(0, 200)}`
    );
  }

  if (
    typeof parsed.score !== "number" ||
    parsed.score < 0 ||
    parsed.score > 100
  ) {
    throw new Error(`${personaName} returned an invalid score: ${parsed.score}`);
  }

  return {
    persona: personaName,
    score: Math.round(parsed.score),
    rationale: parsed.rationale,
    raw,
  };
}
