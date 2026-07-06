import crypto from "crypto";

/**
 * Resolves a raw contract address to whatever verification info is available,
 * for the cases where a request has no protocolSlug (so DeFiLlama can't help
 * at all — it only indexes by protocol slug, never by address).
 *
 * This does NOT replace DeFiLlama's TVL/liquidity data — there's no general
 * way to get TVL from a bare contract address. What it DOES give the Auditor
 * persona specifically: is the contract verified, what's it named, is there
 * an ABI on file. That's real signal where previously there was none at all.
 *
 * Ethereum + Arbitrum: Etherscan's unified V2 API (one key, chainid param).
 * X Layer: OKX's own OKLink API — reuses your existing OKX_API_KEY/
 * OKX_SECRET_KEY/OKX_PASSPHRASE from the payments setup by default, since
 * OKLink is an OKX product. If that turns out to be a different credential
 * scope than the Developer Portal payment key, set OKLINK_API_KEY/
 * OKLINK_SECRET_KEY/OKLINK_PASSPHRASE explicitly to override.
 */

const CHAIN_ALIASES = {
  ethereum: "ethereum",
  eth: "ethereum",
  arbitrum: "arbitrum",
  "arbitrum-one": "arbitrum",
  "x-layer": "x-layer",
  xlayer: "x-layer",
  "x layer": "x-layer",
};

function normalizeChain(chain) {
  if (!chain) return null;
  return CHAIN_ALIASES[chain.toLowerCase().trim()] || null;
}

const ETHERSCAN_CHAIN_IDS = {
  ethereum: 1,
  arbitrum: 42161,
};

async function fetchEtherscanContractInfo(contractAddress, chainKey) {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    console.warn("[contractLookup] ETHERSCAN_API_KEY not set — skipping Etherscan verification lookup.");
    return null;
  }

  const chainId = ETHERSCAN_CHAIN_IDS[chainKey];
  const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.result?.[0];
    if (!result) return null;

    const isVerified = !!(result.SourceCode && result.SourceCode.length > 0);
    return {
      source: "etherscan",
      chain: chainKey,
      verified: isVerified,
      contractName: result.ContractName || null,
      compilerVersion: result.CompilerVersion || null,
      isProxy: result.Proxy === "1",
      hasAbi: isVerified && !!result.ABI && result.ABI !== "Contract source code not verified",
    };
  } catch (err) {
    console.error(`[contractLookup] Etherscan lookup failed for ${contractAddress} on ${chainKey}:`, err.message);
    return null;
  }
}

/**
 * OKX/OKLink v5 API signing — standard OKX exchange-API-style HMAC auth:
 * sign = base64(HMAC-SHA256(secretKey, timestamp + method + requestPath + body))
 */
function signOklinkRequest({ secretKey, timestamp, method, requestPath, body = "" }) {
  const prehash = `${timestamp}${method}${requestPath}${body}`;
  return crypto.createHmac("sha256", secretKey).update(prehash).digest("base64");
}

async function fetchOklinkContractInfo(contractAddress) {
  const apiKey = process.env.OKLINK_API_KEY || process.env.OKX_API_KEY;
  const secretKey = process.env.OKLINK_SECRET_KEY || process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKLINK_PASSPHRASE || process.env.OKX_PASSPHRASE;

  if (!apiKey || !secretKey || !passphrase) {
    console.warn("[contractLookup] No OKLink/OKX credentials available — skipping X Layer verification lookup.");
    return null;
  }

  const requestPath = `/api/v5/xlayer/contract/verify-contract-info?chainShortName=xlayer&contractAddress=${contractAddress}`;
  const timestamp = new Date().toISOString();
  const sign = signOklinkRequest({ secretKey, timestamp, method: "GET", requestPath });

  try {
    const res = await fetch(`https://web3.okx.com${requestPath}`, {
      headers: {
        "OK-ACCESS-KEY": apiKey,
        "OK-ACCESS-SIGN": sign,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": passphrase,
      },
    });
    if (!res.ok) {
      console.warn(`[contractLookup] OKLink request failed with status ${res.status}. If this persists, you may need a separate OKLINK_API_KEY from oklink.com rather than reusing the payments Developer Portal key.`);
      return null;
    }
    const data = await res.json();
    const result = data.data?.[0];
    if (!result) return null;

    // OKLink has no explicit "verified" boolean — same pattern as Etherscan:
    // infer it from whether sourceCode is actually present and non-empty.
    const isVerified = !!(result.sourceCode && result.sourceCode.length > 0);

    return {
      source: "oklink",
      chain: "x-layer",
      verified: isVerified,
      contractName: result.contractName || null,
      compilerVersion: result.compilerVersion || null,
      isProxy: result.proxy === "1",
      hasAbi: isVerified && !!result.contractAbi,
    };
  } catch (err) {
    console.error(`[contractLookup] OKLink lookup failed for ${contractAddress}:`, err.message);
    return null;
  }
}

/**
 * @param {Object} params
 * @param {string} params.contractAddress
 * @param {string} params.chain - "ethereum" | "arbitrum" | "x-layer" (aliases accepted)
 * @returns {Promise<Object|null>} verification info, or null if unresolvable
 */
export async function resolveContractInfo({ contractAddress, chain }) {
  if (!contractAddress) return null;

  const chainKey = normalizeChain(chain);
  if (!chainKey) {
    console.warn(`[contractLookup] Unrecognized or missing chain "${chain}" — cannot resolve contract without knowing which chain to check. Supported: ethereum, arbitrum, x-layer.`);
    return null;
  }

  if (chainKey === "x-layer") {
    return fetchOklinkContractInfo(contractAddress);
  }
  return fetchEtherscanContractInfo(contractAddress, chainKey);
}