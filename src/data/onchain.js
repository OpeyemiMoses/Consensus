const DEFILLAMA_BASE = process.env.DEFILLAMA_BASE_URL || "https://api.llama.fi";

/**
 * Fetches protocol-level TVL/liquidity data from DeFiLlama.
 * DeFiLlama keys protocols by slug, not contract address, so the caller
 * is expected to pass a known protocol slug (e.g. "aave-v3", "uniswap-v3").
 * Contract-address-only lookups fall back to `null` TVL data — the personas
 * are instructed to treat missing evidence as its own signal, not a blocker.
 */
/**
 * Fetches protocol-level TVL/liquidity data from DeFiLlama.
 * DeFiLlama keys protocols by slug, not contract address, so the caller
 * is expected to pass a known protocol slug (e.g. "aave-v3", "uniswap-v3").
 * Contract-address-only lookups fall back to `null` TVL data — the personas
 * are instructed to treat missing evidence as its own signal, not a blocker.
 *
 * Response shape (verified against DeFiLlama's /protocol/{slug} docs):
 *   currentChainTvls: { "Ethereum": 3200000000, "Polygon": 1500000000, ... }
 *   chainTvls: { "Ethereum": { tvl: [{ date, totalLiquidityUSD }, ...] }, ... }
 * There is NO flat top-level "tvl" time-series array — history is nested
 * per chain. To get an overall trend we pick the chain currently holding the
 * most TVL and compute the trend from its own time series (mixing multiple
 * chains' series together would require date-alignment that isn't worth the
 * complexity for hackathon scope).
 */
export async function fetchProtocolTvl(protocolSlug) {
  if (!protocolSlug) return null;

  try {
    const res = await fetch(`${DEFILLAMA_BASE}/protocol/${protocolSlug}`);
    if (!res.ok) return null;
    const data = await res.json();

    const currentChainTvls = data.currentChainTvls || {};
    const chainNames = Object.keys(currentChainTvls);
    const currentTvlUsd = chainNames.length
      ? Object.values(currentChainTvls).reduce((a, b) => a + b, 0)
      : null;

    let trendPercent30d = null;
    let trendComputedFromChain = null;

    if (chainNames.length > 0 && data.chainTvls) {
      const topChain = chainNames.reduce((a, b) =>
        currentChainTvls[a] >= currentChainTvls[b] ? a : b
      );
      const series = data.chainTvls[topChain]?.tvl || [];
      const recent = series.slice(-30);
      if (recent.length >= 2) {
        const first = recent[0].totalLiquidityUSD;
        const last = recent[recent.length - 1].totalLiquidityUSD;
        if (first) {
          trendPercent30d = Math.round(((last - first) / first) * 1000) / 10;
          trendComputedFromChain = topChain;
        }
      }
    }

    return {
      name: data.name,
      currentTvlUsd,
      chains: data.chains || chainNames,
      trendPercent30d,
      trendComputedFromChain, // which single chain the trend figure is based on — surface this so personas don't overweight it as whole-protocol truth
      auditsCount: data.audits ?? null, // DeFiLlama returns this as a string count, e.g. "2"
      auditNote: data.audit_note ?? null,
      auditLinks: data.audit_links || [],
    };
  } catch (err) {
    console.error(`[onchain] DeFiLlama fetch failed for ${protocolSlug}:`, err.message);
    return null;
  }
}
