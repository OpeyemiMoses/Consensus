import coverageProtocols from "../data/coverageProtocols.json" with { type: "json" };

/**
 * Presented as a comparison table, never a recommendation —
 * see Section 7.1 compliance note: Consensus does not underwrite
 * or tell users what to buy, only what exists and its listed terms.
 */
export function runCoverageMatch({ chain, protocolType }) {
  if (!chain) {
    throw new Error("Provide a chain to match coverage against.");
  }

  const matches = coverageProtocols.filter((p) => {
    const chainMatch = p.coversChains.includes(chain.toLowerCase());
    const typeMatch = protocolType
      ? p.coversProtocolTypes.includes(protocolType.toLowerCase())
      : true;
    return chainMatch && typeMatch;
  });

  return {
    query: { chain, protocolType: protocolType || null },
    matchCount: matches.length,
    options: matches,
    disclaimer:
      "This is not financial or insurance advice. Consult the coverage provider's own terms.",
  };
}
