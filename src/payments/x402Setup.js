import { paymentMiddleware, x402ResourceServer } from "@okxweb3/x402-express";
import { ExactEvmScheme } from "@okxweb3/x402-evm/exact/server";
import { OKXFacilitatorClient } from "@okxweb3/x402-core";

/**
 * x402 payment enforcement for the routes other agents actually pay to call.
 *
 * Deliberately OFF by default (ENABLE_X402_PAYMENTS unset or "false") so the
 * dashboard and local dev testing keep working exactly as before — nobody
 * wants their own demo blocked by a 402 they didn't expect. Flip it on only
 * when you're specifically testing the payment flow with a real Agentic
 * Wallet, or once you're ready to actually monetize the live deployment.
 *
 * Defaults to X Layer TESTNET (eip155:1952), not mainnet (eip155:196) — the
 * OKX docs' own examples default to mainnet, which is the wrong default for
 * a hackathon project still being tested. Set X402_NETWORK explicitly to
 * switch to mainnet once you've verified the flow works end-to-end.
 *
 * NOTE: x402 is HTTP-native (it works by returning a real 402 status code
 * over a normal HTTP request/response). It attaches here, to the plain
 * Express routes — it does NOT attach to src/mcp/server.js, which runs over
 * stdio, not HTTP. If OKX's actual A2MCP runtime expects payment enforcement
 * on the MCP surface itself, that surface likely needs to run over HTTP/SSE
 * instead of stdio — worth checking OKX's A2MCP-specific docs before assuming
 * stdio is correct long-term.
 */

const ENABLED = process.env.ENABLE_X402_PAYMENTS === "true";
const NETWORK = process.env.X402_NETWORK || "eip155:1952"; // X Layer Testnet by default
const PAY_TO = process.env.PAY_TO_ADDRESS;

let cachedMiddleware = null;

function noopMiddleware(req, res, next) {
  next();
}

/**
 * This is async and must be awaited before app.listen() — the OKX facilitator
 * client calls out to OKX's API during initialize() to fetch supported payment
 * kinds. If that call fails (bad/expired credentials, network issue, wrong
 * environment), it throws asynchronously. Left unhandled, that crashes the
 * entire Node process — not just payments — taking down risk-consensus and
 * coverage-match too. We catch it here explicitly so a broken payment config
 * degrades to "payments off" instead of taking the whole backend down.
 */
export async function getPaymentMiddleware() {
  if (cachedMiddleware) return cachedMiddleware;

  if (!ENABLED) {
    console.log("[x402] Payments disabled (ENABLE_X402_PAYMENTS not set to 'true') — routes are unpaywalled.");
    cachedMiddleware = noopMiddleware;
    return cachedMiddleware;
  }

  if (!PAY_TO) {
    console.warn("[x402] ENABLE_X402_PAYMENTS is true but PAY_TO_ADDRESS is missing — falling back to unpaywalled routes.");
    cachedMiddleware = noopMiddleware;
    return cachedMiddleware;
  }

  if (!process.env.OKX_API_KEY || !process.env.OKX_SECRET_KEY || !process.env.OKX_PASSPHRASE) {
    console.warn("[x402] ENABLE_X402_PAYMENTS is true but OKX_API_KEY/OKX_SECRET_KEY/OKX_PASSPHRASE are missing — falling back to unpaywalled routes.");
    cachedMiddleware = noopMiddleware;
    return cachedMiddleware;
  }

  try {
    const facilitatorClient = new OKXFacilitatorClient({
      apiKey: process.env.OKX_API_KEY,
      secretKey: process.env.OKX_SECRET_KEY,
      passphrase: process.env.OKX_PASSPHRASE,
    });

    const resourceServer = new x402ResourceServer(facilitatorClient);
    resourceServer.register(NETWORK, new ExactEvmScheme());

    // Validate credentials/connectivity BEFORE handing back working middleware —
    // if this throws, we catch it below and fall back safely instead of the
    // library's internal lazy-init crashing the process on the first request.
    await resourceServer.initialize();

    console.log(`[x402] Payments ENABLED on network ${NETWORK}, paying to ${PAY_TO}`);

    // decimals: 6 must be in the `extra` object — the x402-core SDK reads
    // `requirements.extra?.decimals` (chunk-NYKB44OI.mjs:286). A top-level
    // `decimals` field is silently ignored, leaving the OKX task system unable
    // to resolve the token amount (tokenResolveError during x402-check).
    const MCP_ACCEPTS = [{
      scheme: "exact",
      network: NETWORK,
      payTo: PAY_TO,
      price: process.env.X402_PRICE_MCP || "$0.05",
      extra: { decimals: 6 },
    }];

    cachedMiddleware = paymentMiddleware(
      {
        "POST /api/risk-consensus": {
          accepts: [{
            scheme: "exact",
            network: NETWORK,
            payTo: PAY_TO,
            price: process.env.X402_PRICE_RISK_CONSENSUS || "$0.05",
            extra: { decimals: 6 },
          }],
          description: "3-persona AI risk consensus score for a DeFi protocol",
          mimeType: "application/json",
        },
        "POST /api/coverage-match": {
          accepts: [{
            scheme: "exact",
            network: NETWORK,
            payTo: PAY_TO,
            price: process.env.X402_PRICE_COVERAGE_MATCH || "$0.01",
            extra: { decimals: 6 },
          }],
          description: "DeFi coverage provider match for a given chain",
          mimeType: "application/json",
        },
        // Both GET and POST are registered so that automated validation probes
        // (which may use GET or POST without a business body) correctly receive
        // a 402 challenge rather than a 404. The MCP SDK only mounts POST, so
        // the GET variant is purely for the payment gate — it will 402 before
        // ever reaching the MCP handler, which is the desired behaviour for
        // any unpaid probe.
        "POST /api/mcp": {
          accepts: MCP_ACCEPTS,
          description: "Consensus Multi-Agent Risk & Coverage Match MCP server",
          mimeType: "application/json",
        },
        "GET /api/mcp": {
          accepts: MCP_ACCEPTS,
          description: "Consensus Multi-Agent Risk & Coverage Match MCP server",
          mimeType: "application/json",
        },
      },
      resourceServer,
    );
  } catch (err) {
    console.error(`[x402] Failed to initialize payment facilitator (${err.message}) — falling back to unpaywalled routes so the rest of the app keeps working.`);
    cachedMiddleware = noopMiddleware;
  }

  return cachedMiddleware;
}