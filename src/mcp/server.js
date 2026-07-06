import "dotenv/config";
import express from "express";
import cors from "cors";
import riskConsensusRouter from "./routes/riskConsensus.js";
import coverageMatchRouter from "./routes/coverageMatch.js";
import a2aRouter from "./a2a/a2aRoutes.js";
import devPaidProxyRouter from "./payments/devPaidProxyRoutes.js";
import mcpRouter from "./mcp/httpMcpRouter.js";
import { getPaymentMiddleware } from "./payments/x402Setup.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok", service: "consensus" }));

async function main() {
  // x402 payment enforcement — no-op unless ENABLE_X402_PAYMENTS=true (see
  // src/payments/x402Setup.js). Awaited here deliberately: the facilitator
  // client validates OKX credentials during setup, and that must complete
  // (and be safely caught on failure) before the server starts accepting
  // traffic — otherwise a bad payment config can crash the process later,
  // mid-request, instead of failing safely at startup.
  const paymentMw = await getPaymentMiddleware();
  app.use(paymentMw);

  app.use("/api", riskConsensusRouter);
  app.use("/api", coverageMatchRouter);
  app.use("/api", a2aRouter);
  app.use("/api", mcpRouter); // A2MCP surface — POST /api/mcp, public HTTPS per OKX's requirements

  // The dev-buyer-proxy holds a private key (DEV_BUYER_PRIVATE_KEY) that pays
  // your own paywalled endpoints — it exists ONLY so your own dashboard can
  // demo the payment flow locally without a key ever touching the browser.
  // It must NEVER be exposed on a public/hosted deployment: anyone who found
  // it could trigger payments from that key. Gated behind an explicit flag,
  // defaulting to off, on top of never mounting in production regardless of
  // the flag — belt and suspenders.
  const devProxyExplicitlyEnabled = process.env.ENABLE_DEV_PAYMENT_PROXY === "true";
  const isProduction = process.env.NODE_ENV === "production";
  if (devProxyExplicitlyEnabled && !isProduction) {
    console.log("[dev-paid-proxy] ENABLED — local-only payment testing route is live at /api/dev/*.");
    app.use("/api", devPaidProxyRouter);
  } else if (devProxyExplicitlyEnabled && isProduction) {
    console.error("[dev-paid-proxy] ENABLE_DEV_PAYMENT_PROXY=true was set but NODE_ENV=production — refusing to mount it. This route holds a private key and must never run on a public host.");
  } else {
    console.log("[dev-paid-proxy] disabled (set ENABLE_DEV_PAYMENT_PROXY=true for local-only payment testing).");
  }

  app.listen(PORT, () => {
    console.log(`Consensus backend listening on port ${PORT}`);
  });
}

main();