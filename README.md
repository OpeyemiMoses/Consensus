# Consensus

DeFi risk-consensus and coverage-matching ASP for the OKX AI Genesis Hackathon.

Three independent AI personas (Auditor, Liquidity Analyst, Historian) score a protocol/contract without seeing each other's output, then a consensus mechanism surfaces agreement vs. genuine disagreement — instead of quietly averaging it away.

**Demo chains: Ethereum / Arbitrum / X Layer.** Confirmed live via DeFiLlama that Aave V3 has real, current TVL on all three — X Layer being OKX's own chain is a nice fit given you're listing on OKX.AI.

**LLM provider: Groq** (`openai/gpt-oss-120b` by default — Groq deprecated `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` in June 2026). Override via `GROQ_MODEL` in `.env`; check console.groq.com/docs/models for what's current.

## Status: Phase 3 (A2A task lifecycle) — built, state machine validated

### What's built
- ✅ Three persona modules with distinct system prompts (`src/personas/`) — **validated**: ran all 5 test cases, real disagreement confirmed on 4/5 (obviously-risky case converged tight at stddev 3.3, as expected; the other four all flagged genuine disagreement, including the Historian catching fork-lineage risk the other two structurally don't look at)
- ✅ Consensus calculation with mean/stddev + disagreement flagging (`src/consensus/calculateConsensus.js`)
- ✅ `src/data/onchain.js` — DeFiLlama fetcher, rewritten and **live-tested** against the real `/protocol/{slug}` shape (TVL nested per-chain, not a flat array — my first guess was wrong, this is corrected and confirmed working against real data)
- ✅ Curated audit history: 6 protocols (`aave-v3`, `uniswap-v3`, `curve-finance`, `gmx`, `compound-v3`, plus a synthetic risky-fork test fixture)
- ✅ **Shared core** (`src/core/runRiskConsensus.js`, `src/core/runCoverageMatch.js`) — HTTP routes, A2MCP server, and A2A task wrapper all call the same functions (Section 6.3: "the persona/consensus engine doesn't change, only the wrapper around it")
- ✅ **A2A task lifecycle** (`src/a2a/`) — models OKX's Task Marketplace state model: `received -> accepted -> in_progress -> delivered -> completed` (or `-> failed`), every transition timestamped in the task's `history` array
- ✅ **Natural-language task parsing** (`src/a2a/parseTaskInput.js`) — turns freeform text like "check the risk consensus for aave-v3 on arbitrum" into structured params, via a shared Groq client (`src/llm/groqClient.js`)
- ✅ **State machine tested in isolation, no API key needed** (`test/testTaskLifecycle.js`) — validates accept/work/deliver/complete and the failure path. Ran clean.
- ✅ A2MCP server exposing `get_risk_consensus` (`src/mcp/server.js`)
- ✅ New route: `POST /api/a2a/tasks` (body: `{ "text": "..." }`), `GET /api/a2a/tasks/:id`

### What's NOT done yet / needs your input
- ⚠️ **Run an actual end-to-end A2A task** (needs `GROQ_API_KEY`, see below). The state machine is proven correct; unverified is whether the NL parser reliably extracts the right protocol/chain across realistic phrasings — try a few before the demo.
- ⚠️ The A2A lifecycle currently runs synchronously in one request (accept through complete in a single `POST`) rather than truly async accept-then-poll. Deliberate hackathon-scope simplification — if OKX's real Task Marketplace needs a genuine async handshake, split `runA2ATask` at the `startWork` line (noted in the code) and expose a second endpoint for the rest.
- ⚠️ In-memory task store — tasks vanish on restart. Fine for a demo, not for a real deploy.
- ⚠️ MCP transport: still stdio, a placeholder since I don't have Wingman's actual scaffolding — swap if OKX's A2MCP spec wants something else.
- ⚠️ Coverage dataset: Nexus Mutual and InsurAce confirmed active as of July 2026. **Sherlock and Neptune Mutual are NOT independently verified** — confirm before the demo (see `verificationStatus` field in `coverageProtocols.json`). Also worth knowing: InsurAce took a real capital hit paying out the 2022 UST depeg claim — accurate context if it comes up, not a reason to drop it.

## Setup (Windows / PowerShell)

```powershell
cd consensus
npm install
Copy-Item .env.example .env
# then edit .env and add your GROQ_API_KEY
```

## Run the persona validation test

```powershell
npm run test:personas
```

Calls all three personas against 5 evidence packets (controlled test fixtures) and prints each persona's score/rationale, the consensus, and a summary of whether the ambiguous cases triggered real disagreement.

## Run the task lifecycle test (no API key needed)

```powershell
npm run test:lifecycle
```

## Run the backend

```powershell
npm start
```

```powershell
# risk consensus
curl -X POST http://localhost:3001/api/risk-consensus -H "Content-Type: application/json" -d '{\"protocolSlug\":\"aave-v3\",\"chain\":\"ethereum\"}'

# coverage match
curl -X POST http://localhost:3001/api/coverage-match -H "Content-Type: application/json" -d '{\"chain\":\"ethereum\",\"protocolType\":\"lending\"}'

# A2A task — full lifecycle in one call, returns state history + result
curl -X POST http://localhost:3001/api/a2a/tasks -H "Content-Type: application/json" -d '{\"text\":\"Please check the risk consensus for aave-v3 on ethereum and find coverage options.\"}'
```

## Run the MCP server

```powershell
npm run mcp
```

## Next steps

1. Run an end-to-end A2A task with your API key, try a few phrasings.
2. Verify Sherlock and Neptune Mutual's current status before the demo.
3. Decide: frontend (persona debate visual) next, or OKX Agentic Wallet / hosting setup?
