import { Router } from "express";
import { getDevBuyerFetch } from "./devBuyerClient.js";

const router = Router();
const PORT = process.env.PORT || 3001;
const SELF_BASE_URL = `http://localhost:${PORT}`;

/**
 * These routes exist purely so your own dashboard can demonstrate a real
 * x402 payment completing, without a private key ever touching the browser.
 * See src/payments/devBuyerClient.js for why this is a server-side proxy
 * rather than browser-side wallet code.
 *
 * If DEV_BUYER_PRIVATE_KEY isn't set, these return a clear 501 rather than
 * silently failing — that's a deliberate signal that dev-payment testing
 * isn't configured yet, distinct from a real payment failure.
 */

router.post("/dev/risk-consensus-paid", async (req, res) => {
  const fetchWithPayment = getDevBuyerFetch();
  // No dev buyer key configured — fine if payments are disabled server-side,
  // just pass the request straight through unpaid.
  const fetchFn = fetchWithPayment || fetch;

  try {
    const response = await fetchFn(`${SELF_BASE_URL}/api/risk-consensus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
    });
    const data = await response.json();
    if (response.status === 402 && !fetchWithPayment) {
      return res.status(402).json({
        ...data,
        note: "This endpoint requires payment (ENABLE_X402_PAYMENTS=true) but no DEV_BUYER_PRIVATE_KEY is configured to pay it automatically. See .env.example.",
      });
    }
    res.status(response.status).json(data);
  } catch (err) {
    console.error("[dev-paid-proxy] risk-consensus request failed:", err);
    res.status(502).json({ error: "Dev proxy failed to complete the request.", detail: err.message });
  }
});

router.post("/dev/coverage-match-paid", async (req, res) => {
  const fetchWithPayment = getDevBuyerFetch();
  const fetchFn = fetchWithPayment || fetch;

  try {
    const response = await fetchFn(`${SELF_BASE_URL}/api/coverage-match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
    });
    const data = await response.json();
    if (response.status === 402 && !fetchWithPayment) {
      return res.status(402).json({
        ...data,
        note: "This endpoint requires payment (ENABLE_X402_PAYMENTS=true) but no DEV_BUYER_PRIVATE_KEY is configured to pay it automatically. See .env.example.",
      });
    }
    res.status(response.status).json(data);
  } catch (err) {
    console.error("[dev-paid-proxy] coverage-match request failed:", err);
    res.status(502).json({ error: "Dev proxy failed to complete the request.", detail: err.message });
  }
});

export default router;