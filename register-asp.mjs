import crypto from "node:crypto";

const API_KEY = "c7110585-aab7-43f3-9db5-7f183883b6e1";
const SECRET_KEY = "F8A3712200A8BC3AA347C0DED33DDCB0";
const PASSPHRASE = "Yemigraffix123$";

const MCP_ENDPOINT = "https://consensus-production-d6fa.up.railway.app/api/mcp";

function sign(timestamp, method, requestPath, body) {
  const signStr = timestamp + method + requestPath + (body || "");
  return crypto.createHmac("sha256", SECRET_KEY).update(signStr).digest("base64");
}

async function tryRegister(path, payload) {
  const ts = new Date().toISOString();
  const method = "POST";
  const body = JSON.stringify(payload);
  const sig = sign(ts, method, path, body);

  const url = `https://www.okx.com${path}`;
  console.log(`\nTrying POST ${url}`);
  console.log(`Payload: ${body}`);
  
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "OK-ACCESS-KEY": API_KEY,
        "OK-ACCESS-SIGN": sig,
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": PASSPHRASE,
      },
      body,
    });
    const txt = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Response: ${txt.slice(0, 1000)}`);
    return { status: res.status, body: txt };
  } catch (err) {
    console.log(`Error: ${err.message}`);
    return { status: 0, body: err.message };
  }
}

// Try various possible API paths for Onchain OS ASP registration
const attempts = [
  { path: "/api/v5/onchainos/asp/register", payload: { aspName: "Consensus Risk ASP", endpoint: MCP_ENDPOINT, tools: ["get_risk_consensus"] } },
  { path: "/api/v5/onchainos/asp", payload: { aspName: "Consensus Risk ASP", endpoint: MCP_ENDPOINT, tools: ["get_risk_consensus"] } },
  { path: "/api/v5/onchainos/asp/register", payload: { name: "Consensus Risk ASP", description: "DeFi risk-consensus A2MCP service", mcpEndpoint: MCP_ENDPOINT, toolNames: ["get_risk_consensus"] } },
  { path: "/api/v5/onchainos/asp/register", payload: { aspName: "Consensus", mcpServerUrl: MCP_ENDPOINT, tools: [{ name: "get_risk_consensus", description: "Returns a 3-persona AI risk consensus score for a DeFi protocol" }] } },
];

for (const attempt of attempts) {
  await tryRegister(attempt.path, attempt.payload);
}