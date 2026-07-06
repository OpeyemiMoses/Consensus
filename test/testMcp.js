import "dotenv/config";
import { spawn } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ListToolsResultSchema, CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

/**
 * Tests the A2MCP surface over Streamable HTTP.
 *
 * Two modes:
 *  - LOCAL (default): spawns src/server.js as a child process, waits for
 *    /health, tests against http://localhost:PORT/api/mcp, kills the
 *    process when done.
 *  - REMOTE: set TARGET_URL to a full base URL (e.g.
 *    https://your-app.up.railway.app) to test an already-running, publicly
 *    hosted server instead. No process is spawned or killed in this mode —
 *    we're proving the real deployed server answers real MCP calls over
 *    the public internet, exactly as OKX would call it.
 *
 * Usage:
 *   node test/testMcp.js                                   # local
 *   TARGET_URL=https://your-app.up.railway.app node test/testMcp.js   # remote
 */

const REMOTE_TARGET = process.env.TARGET_URL;
const PORT = process.env.PORT || 3001;
const BASE_URL = REMOTE_TARGET || `http://localhost:${PORT}`;
const MCP_URL = `${BASE_URL}/api/mcp`;
const HEALTH_URL = `${BASE_URL}/health`;

function waitForServer(url, timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = async () => {
      try {
        const res = await fetch(url);
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
  if (!REMOTE_TARGET && !process.env.GROQ_API_KEY) {
    console.error("Missing GROQ_API_KEY. Copy .env.example to .env and add your key before running this test.");
    process.exit(1);
  }

  let serverProcess = null;

  if (REMOTE_TARGET) {
    console.log(`Testing REMOTE server at ${BASE_URL} — nothing will be spawned locally.\n`);
  } else {
    console.log("Spawning the real server (src/server.js) as a child process...\n");
    serverProcess = spawn("node", ["src/server.js"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    serverProcess.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
    serverProcess.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
  }

  try {
    console.log(`Checking health at ${HEALTH_URL} ...`);
    await waitForServer(HEALTH_URL, REMOTE_TARGET ? 15000 : 8000);
    console.log("✓ Server is up.\n");

    console.log(`Connecting to MCP endpoint at ${MCP_URL} ...`);
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
    console.log(`\n✓ All A2MCP-over-HTTP tests passed against ${BASE_URL}.`);
  } finally {
    if (serverProcess) serverProcess.kill();
  }
}

main().catch((err) => {
  console.error("\n✗ A2MCP test failed:", err.message);
  process.exit(1);
});