import "dotenv/config";
import { spawn } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListToolsResultSchema, CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

/**
 * Tests the A2MCP surface now that it runs over Streamable HTTP (mounted on
 * the main Express app at POST /api/mcp) instead of stdio. This matches how
 * it will actually be called once hosted — OKX's A2MCP requirements are
 * explicit that this must be a public HTTPS endpoint, which stdio can never
 * satisfy (nothing external can spawn a process on your host over the
 * internet). This test spawns the real server exactly like `npm start`
 * would, then calls it over HTTP exactly like a real agent would.
 */

const PORT = process.env.PORT || 3001;
const MCP_URL = `http://localhost:${PORT}/api/mcp`;

function waitForServer(url, timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = async () => {
      try {
        const res = await fetch(url.replace("/api/mcp", "/health"));
        if (res.ok) return resolve();
      } catch (_) {
        // not up yet
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("Server did not become healthy in time."));
      }
      setTimeout(tryOnce, 300);
    };
    tryOnce();
  });
}

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error("Missing GROQ_API_KEY. Copy .env.example to .env and add your key before running this test.");
    process.exit(1);
  }

  console.log("Spawning the real server (src/server.js) as a child process...\n");
  const serverProcess = spawn("node", ["src/server.js"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  serverProcess.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
  serverProcess.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));

  try {
    await waitForServer(MCP_URL);
    console.log("✓ Server is up.\n");

    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
    const client = new Client({ name: "consensus-mcp-test-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    console.log("✓ Connected to MCP server over HTTP.\n");

    console.log("Test 1: tools/list");
    const toolsList = await client.request({ method: "tools/list" }, ListToolsResultSchema);
    const tool = toolsList.tools.find((t) => t.name === "get_risk_consensus");
    if (!tool) throw new Error("FAILED: get_risk_consensus not advertised in tools/list");
    console.log(`  ✓ get_risk_consensus is advertised`);

    console.log("\nTest 2: tools/call get_risk_consensus(protocolSlug: aave-v3, chain: ethereum)");
    const callResult = await client.request(
      { method: "tools/call", params: { name: "get_risk_consensus", arguments: { protocolSlug: "aave-v3", chain: "ethereum" } } },
      CallToolResultSchema
    );
    const resultText = callResult.content?.[0]?.text;
    const parsed = JSON.parse(resultText);
    if (typeof parsed.consensusScore !== "number") {
      throw new Error(`FAILED: response missing consensusScore. Got: ${resultText.slice(0, 300)}`);
    }
    console.log(`  ✓ consensusScore: ${parsed.consensusScore}`);
    console.log(`  ✓ confidenceLevel: ${parsed.confidenceLevel}`);
    console.log(`  ✓ personas: ${parsed.personaBreakdown.map((p) => p.persona).join(", ")}`);

    console.log("\nTest 3: tools/call get_risk_consensus() with no arguments (should error gracefully)");
    const errorResult = await client.request(
      { method: "tools/call", params: { name: "get_risk_consensus", arguments: {} } },
      CallToolResultSchema
    );
    if (!errorResult.isError) throw new Error("FAILED: expected isError: true for missing required input");
    console.log(`  ✓ correctly returned isError: true`);

    await client.close();
    console.log("\n✓ All A2MCP-over-HTTP tests passed.");
  } finally {
    serverProcess.kill();
  }
}

main().catch((err) => {
  console.error("\n✗ A2MCP test failed:", err.message);
  process.exit(1);
});