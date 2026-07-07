import { Router } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { runRiskConsensus } from "../core/runRiskConsensus.js";
import { runCoverageMatch } from "../core/runCoverageMatch.js";

/**
 * A2MCP surface for Consensus — mounted on the same public Express app as
 * everything else, at POST /mcp.
 *
 * This used to run as a separate stdio process (src/mcp/server.js originally).
 * That only works when something spawns it as a local child process — fine
 * for local testing, but OKX's own A2MCP requirements are explicit: the
 * service must be "a public server reachable worldwide... served over
 * HTTPS." Stdio can't satisfy that; nothing external can spawn a process on
 * your host over the internet. Streamable HTTP (this file) is the correct
 * transport for a hosted, publicly-callable MCP server.
 *
 * Stateless mode (sessionIdGenerator: undefined) is used deliberately —
 * each get_risk_consensus call is independent, there's no multi-turn session
 * to track, so there's no reason to take on session-management complexity.
 */

const server = new Server(
  { name: "consensus-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_risk_consensus",
      description:
        "Returns a 3-persona AI risk consensus score for a DeFi protocol/contract, including per-persona scores, rationale, and a disagreement flag when personas diverge. Informational only — not financial or insurance advice.",
      inputSchema: {
        type: "object",
        properties: {
          contractAddress: { type: "string", description: "On-chain contract address" },
          protocolSlug: {
            type: "string",
            description: "DeFiLlama-style protocol slug, e.g. 'aave-v3', used to pull TVL/liquidity data and curated audit history",
          },
          chain: { type: "string", description: "Chain name, e.g. 'ethereum', 'arbitrum', 'x-layer'" },
        },
        required: [],
      },
    },
    {
      name: "get_coverage_match",
      description:
        "Matches a DeFi protocol with available insurance/coverage options from curated providers (Nexus Mutual, InsurAce, etc.). Returns a list of coverage products for the given chain and optional protocol type. Informational only — not financial or insurance advice.",
      inputSchema: {
        type: "object",
        properties: {
          chain: {
            type: "string",
            description: "Chain name, e.g. 'ethereum', 'arbitrum', 'x-layer'",
          },
          protocolType: {
            type: "string",
            description: "Optional. Protocol type to filter by, e.g. 'lending', 'dex', 'bridge'",
          },
        },
        required: ["chain"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments || {};

  try {
    if (request.params.name === "get_risk_consensus") {
      const { contractAddress, protocolSlug, chain } = args;
      const result = await runRiskConsensus({ contractAddress, protocolSlug, chain });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    if (request.params.name === "get_coverage_match") {
      const { chain, protocolType } = args;
      const result = runCoverageMatch({ chain, protocolType });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
      isError: true,
    };
  }
});

const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

// Connect once at module load — the transport/server pairing is stateless
// and reused across every request, matching the SDK's documented pattern.
let connected = false;
async function ensureConnected() {
  if (!connected) {
    await server.connect(transport);
    connected = true;
  }
}

const router = Router();

router.post("/mcp", async (req, res) => {
  await ensureConnected();
  await transport.handleRequest(req, res, req.body);
});

export default router;