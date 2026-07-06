import { runAuditor } from "../personas/auditor.js";
import { runLiquidityAnalyst } from "../personas/liquidityAnalyst.js";
import { runHistorian } from "../personas/historian.js";
import { calculateConsensus } from "../consensus/calculateConsensus.js";
import { fetchProtocolTvl } from "../data/onchain.js";
import { resolveContractInfo } from "../data/contractLookup.js";
import auditHistory from "../data/auditHistory.json" with { type: "json" };

/**
 * The single core engine behind all three service surfaces (Section 6.3):
 * HTTP route, A2MCP (src/mcp/server.js), and A2A task wrapper (src/a2a/).
 * Only the wrapper differs between them — this function doesn't know or
 * care which one is calling it.
 */
export async function runRiskConsensus({ protocolSlug, contractAddress, chain }) {
  if (!protocolSlug && !contractAddress) {
    throw new Error("Provide at least one of: protocolSlug, contractAddress.");
  }

  const tvlData = await fetchProtocolTvl(protocolSlug);
  const curated = auditHistory[protocolSlug] || null;

  // If there's a contract address, always try to resolve it — this is what
  // gives the Auditor real signal (verification status, contract name) when
  // there's no protocolSlug at all, since DeFiLlama can't help without one.
  const contractVerification = contractAddress
    ? await resolveContractInfo({ contractAddress, chain })
    : null;

  const evidence = {
    contractAddress: contractAddress || null,
    protocolSlug: protocolSlug || null,
    chain: chain || null,
    auditHistory: curated || "No curated audit data available for this protocol.",
    liquidityData: tvlData || "No live TVL/liquidity data available for this protocol.",
    contractVerification: contractVerification || (contractAddress
      ? "Contract address provided but verification lookup was unavailable or the address is unrecognized on the given chain."
      : "No contract address provided."),
  };

  // Run all three personas in parallel, independently — none sees another's output.
  const [auditorResult, liquidityResult, historianResult] = await Promise.all([
    runAuditor(evidence),
    runLiquidityAnalyst(evidence),
    runHistorian(evidence),
  ]);

  const consensus = calculateConsensus([auditorResult, liquidityResult, historianResult]);

  return {
    input: { protocolSlug, contractAddress, chain },
    evidenceUsed: evidence,
    ...consensus,
  };
}