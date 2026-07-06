/**
 * Turns three independent persona scores into a consensus verdict.
 *
 * Deliberately NOT a simple average end-to-end: when personas diverge
 * significantly, that divergence IS the signal (something ambiguous enough
 * to split three independent experts is often exactly what harms retail
 * users), so we surface it explicitly instead of smoothing it away.
 *
 * Thresholds are a hackathon-reasonable starting point, not a tuned model —
 * revisit once you've run this against real ambiguous cases in Phase 1 testing.
 */

const LOW_DISAGREEMENT_STDDEV = 12; // scores within roughly this band -> "high confidence"
const HIGH_DISAGREEMENT_STDDEV = 25; // scores spread beyond this -> "significant disagreement"

function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values, avg) {
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * @param {Array<{persona: string, score: number, rationale: string}>} personaResults
 * @returns {Object} consensus object ready to serialize for A2A display or A2MCP JSON
 */
export function calculateConsensus(personaResults) {
  const scores = personaResults.map((p) => p.score);
  const avg = mean(scores);
  const sd = stddev(scores, avg);

  let confidenceLevel;
  let disagreementFlag;
  let disagreementNote = null;

  if (sd <= LOW_DISAGREEMENT_STDDEV) {
    confidenceLevel = "high";
    disagreementFlag = false;
  } else if (sd <= HIGH_DISAGREEMENT_STDDEV) {
    confidenceLevel = "moderate";
    disagreementFlag = true;
    disagreementNote =
      "Personas show moderate disagreement — treat the consensus score as a range, not a point estimate.";
  } else {
    confidenceLevel = "low";
    disagreementFlag = true;
    const sorted = [...personaResults].sort((a, b) => a.score - b.score);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];
    disagreementNote = `Personas significantly disagree (${lowest.persona}: ${lowest.score} vs. ${highest.persona}: ${highest.score}). This split is itself a risk signal worth reading, not just noise to average out.`;
  }

  return {
    consensusScore: Math.round(avg),
    standardDeviation: Math.round(sd * 10) / 10,
    confidenceLevel,
    disagreementFlag,
    disagreementNote,
    personaBreakdown: personaResults.map((p) => ({
      persona: p.persona,
      score: p.score,
      rationale: p.rationale,
    })),
    disclaimer:
      "This is not financial or insurance advice. Consult the coverage provider's own terms.",
  };
}
