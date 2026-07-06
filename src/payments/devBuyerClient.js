import { privateKeyToAccount } from "viem/accounts";
import { x402Client, wrapFetchWithPayment } from "@okxweb3/x402-fetch";
import { registerExactEvmScheme } from "@okxweb3/x402-evm/exact/client";

/**
 * This exists ONLY so you (the developer) can click "Run check" on your own
 * dashboard and see a real x402 payment complete, without embedding a
 * private key in the browser — which dashboard.html, being static HTML,
 * cannot safely do (anyone can view-source it).
 *
 * DEV_BUYER_PRIVATE_KEY should be a TESTNET-ONLY key with testnet funds from
 * the X Layer faucet (https://www.okx.com/xlayer/faucet/xlayerfaucet).
 * NEVER put a mainnet/real-funds key here, and NEVER commit this key to git —
 * it belongs in your local .env only.
 *
 * A real external agent calling your paywalled endpoint does NOT go through
 * this file — their own Agentic Wallet handles the 402 challenge
 * automatically (per OKX's docs: "install the Agentic Wallet and paid
 * services are automatically supported"). This proxy is purely a stand-in
 * for that, so your own dashboard can demonstrate the same flow locally.
 */

let cachedFetchWithPayment = null;

export function getDevBuyerFetch() {
  if (cachedFetchWithPayment) return cachedFetchWithPayment;

  const privateKey = process.env.DEV_BUYER_PRIVATE_KEY;
  if (!privateKey) return null;

  const signer = privateKeyToAccount(privateKey);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });

  cachedFetchWithPayment = wrapFetchWithPayment(fetch, client);
  return cachedFetchWithPayment;
}