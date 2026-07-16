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

// Railway (and most cloud platforms) terminate TLS at their edge proxy and
// forward traffic internally as plain HTTP, setting X-Forwarded-Proto:https.
// Without this, Express ignores that header and reconstructs req.protocol as
// "http", which makes the x402 payment challenge emit an http:// resource URL
// instead of https:// — causing payment clients to reject the challenge.
app.set("trust proxy", true);

app.use(cors());
app.use(express.json());

// Force Accept header for /api/mcp requests so MCP transport handles them
// correctly even if clients (like task-402-pay) do not send standard headers.
app.use((req, res, next) => {
  if (req.path.includes("mcp")) {
    req.headers["accept"] = "application/json, text/event-stream";
    if (req.rawHeaders) {
      const idx = req.rawHeaders.findIndex(h => h.toLowerCase() === "accept");
      if (idx !== -1) {
        req.rawHeaders[idx + 1] = "application/json, text/event-stream";
      } else {
        req.rawHeaders.push("Accept", "application/json, text/event-stream");
      }
    }
  }
  next();
});

app.get("/health", (req, res) => res.json({ status: "ok", service: "consensus" }));

// Payment middleware setup is async (it validates OKX credentials against
// the facilitator over the network, which can be slow or fail entirely —
// see getPaymentMiddleware's own safe-fallback behavior). We still want it
// positioned *before* the priced routers in the middleware stack so it can
// gate them once ready, but we do NOT want server startup (app.listen) to
// block on that network call — a slow/failing facilitator fetch shouldn't
// delay the server coming up and answering /health, /api/mcp, /api/a2a,
// etc., which don't depend on payments at all.
//
// So: mount a synchronous wrapper middleware immediately, in the correct
// stack position, that defers to the real middleware once it resolves.
let realPaymentMw = null;
const paymentMwReady = getPaymentMiddleware()
  .then((mw) => {
    realPaymentMw = mw;
  })
  .catch((err) => {
    console.error("[x402] Failed to initialize payment middleware:", err.message);
    // Fall through to a no-op — same "keep the rest of the app working"
    // behavior getPaymentMiddleware itself already documents.
    realPaymentMw = (req, res, next) => next();
  });

app.use((req, res, next) => {
  if (realPaymentMw) return realPaymentMw(req, res, next);
  paymentMwReady.then(() => realPaymentMw(req, res, next)).catch(next);
});

app.use("/api", riskConsensusRouter);
app.use("/api", coverageMatchRouter);
app.use("/api", a2aRouter);

// httpMcpRouter.js defines its route internally as POST /mcp, so mounting
// it at /api here gives the full path /api/mcp — matching what testMcp.js
// (and any real A2MCP caller) expects.
app.use("/api", mcpRouter);

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