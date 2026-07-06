import "dotenv/config";
import { runAuditor } from "../src/personas/auditor.js";
import { runLiquidityAnalyst } from "../src/personas/liquidityAnalyst.js";
import { runHistorian } from "../src/personas/historian.js";
import { calculateConsensus } from "../src/consensus/calculateConsensus.js";

/**
 * Phase 1 validation harness.
 *
 * The whole product lives or dies on one question: do the three personas
 * actually produce meaningfully different scores/rationales when given the
 * same evidence, or do they all converge to the same "safe middle" answer?
 *
 * These test cases are deliberately chosen to span:
 *  - "obviously safe"   (case 1)
 *  - "obviously risky"  (case 2)
 *  - "genuinely ambiguous" (cases 3-5) — THESE are the ones that matter most.
 *    If personas don't diverge on the ambiguous cases, the consensus framing
 *    is decorative, not functional. Don't skip evaluating these.
 */
const testCases = [
  {
    label: "Case 1 — Obviously safe (mature, audited, deep liquidity)",
    evidence: {
      contractAddress: "0x0000000000000000000000000000000000AAA1",
      protocolSlug: "aave-v3",
      chain: "ethereum",
      auditHistory: {
        audited: true,
        auditors: ["OpenZeppelin", "Trail of Bits", "SigmaPrime"],
        lastAuditDate: "2023-01-01",
        knownUnpatchedFindings: false,
        adminKeyRisk: "DAO-governed timelock, no single admin key",
      },
      liquidityData: {
        currentTvlUsd: 8_500_000_000,
        trendPercent30d: 2.1,
        chains: ["ethereum", "arbitrum", "polygon"],
      },
    },
  },
  {
    label: "Case 2 — Obviously risky (unaudited fork, single admin key, thin liquidity)",
    evidence: {
      contractAddress: "0x0000000000000000000000000000000000BBB2",
      protocolSlug: "example-unaudited-fork",
      chain: "bsc",
      auditHistory: {
        audited: false,
        auditors: [],
        lastAuditDate: null,
        knownUnpatchedFindings: null,
        adminKeyRisk: "Single EOA admin key with no timelock (deployer wallet)",
      },
      liquidityData: {
        currentTvlUsd: 180_000,
        trendPercent30d: -62.4,
        chains: ["bsc"],
      },
    },
  },
  {
    label: "Case 3 — Ambiguous: solid audit, but liquidity is fleeing",
    evidence: {
      contractAddress: "0x0000000000000000000000000000000000CCC3",
      protocolSlug: "unnamed-lending-fork",
      chain: "arbitrum",
      auditHistory: {
        audited: true,
        auditors: ["Zellic"],
        lastAuditDate: "2024-11-01",
        knownUnpatchedFindings: false,
        adminKeyRisk: "3-of-5 multisig, 48h timelock",
      },
      liquidityData: {
        currentTvlUsd: 4_200_000,
        trendPercent30d: -38.0,
        chains: ["arbitrum"],
      },
    },
  },
  {
    label: "Case 4 — Ambiguous: novel oracle design, no exploit precedent, thin audit",
    evidence: {
      contractAddress: "0x0000000000000000000000000000000000DDD4",
      protocolSlug: "novel-oracle-protocol",
      chain: "ethereum",
      auditHistory: {
        audited: true,
        auditors: ["SoloAuditorLLC"],
        lastAuditDate: "2025-02-01",
        knownUnpatchedFindings: "unknown — audit scope did not cover oracle module",
        adminKeyRisk: "2-of-3 multisig, no timelock",
      },
      liquidityData: {
        currentTvlUsd: 22_000_000,
        trendPercent30d: 14.6,
        chains: ["ethereum"],
      },
    },
  },
  {
    label: "Case 5 — Ambiguous: fork of a previously-exploited protocol, but patched and re-audited",
    evidence: {
      contractAddress: "0x0000000000000000000000000000000000EEE5",
      protocolSlug: "patched-fork-of-exploited-protocol",
      chain: "polygon",
      auditHistory: {
        audited: true,
        auditors: ["Trail of Bits"],
        lastAuditDate: "2025-06-01",
        knownUnpatchedFindings: false,
        adminKeyRisk: "DAO-governed timelock",
        notes: "Fork of a protocol that suffered a reentrancy exploit in 2022; this fork patches the specific vector but shares the broader architecture.",
      },
      liquidityData: {
        currentTvlUsd: 9_800_000,
        trendPercent30d: 5.2,
        chains: ["polygon"],
      },
    },
  },
];

async function runCase(testCase) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(testCase.label);
  console.log("=".repeat(70));

  const [auditorResult, liquidityResult, historianResult] = await Promise.all([
    runAuditor(testCase.evidence),
    runLiquidityAnalyst(testCase.evidence),
    runHistorian(testCase.evidence),
  ]);

  const consensus = calculateConsensus([auditorResult, liquidityResult, historianResult]);

  for (const p of consensus.personaBreakdown) {
    console.log(`\n  [${p.persona}] score: ${p.score}`);
    console.log(`  ${p.rationale}`);
  }

  console.log(`\n  --> Consensus: ${consensus.consensusScore} (stddev: ${consensus.standardDeviation}, confidence: ${consensus.confidenceLevel})`);
  if (consensus.disagreementFlag) {
    console.log(`  ⚠ ${consensus.disagreementNote}`);
  }

  return { label: testCase.label, consensus };
}

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error("Missing GROQ_API_KEY. Copy .env.example to .env and add your key before running this test.");
    process.exit(1);
  }

  const results = [];
  for (const tc of testCases) {
    results.push(await runCase(tc));
    // Free-tier Groq TPM limits are tight (8000/min on gpt-oss-120b) — a short
    // pause between cases avoids cascading 429s across the 5-case run.
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("SUMMARY — does divergence actually happen on ambiguous cases?");
  console.log("=".repeat(70));
  for (const r of results) {
    console.log(`${r.label}\n  stddev=${r.consensus.standardDeviation}  disagreement=${r.consensus.disagreementFlag}`);
  }

  const ambiguousResults = results.slice(2); // cases 3-5
  const anyDisagreement = ambiguousResults.some((r) => r.consensus.disagreementFlag);
  if (!anyDisagreement) {
    console.log(
      "\n⚠ WARNING: none of the ambiguous cases triggered a disagreement flag. Per the build plan, this means the consensus mechanism may not be producing genuine independent judgment — consider sharpening the persona prompts before moving to Phase 2."
    );
  } else {
    console.log("\n✓ At least one ambiguous case triggered real disagreement between personas — the core mechanism is functioning as intended.");
  }
}

main();
