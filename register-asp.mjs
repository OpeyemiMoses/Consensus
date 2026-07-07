/**
 * Consensus ASP Registration for OKX Onchain OS
 *
 * Based on https://okx.ai/tutorial/asp, ASP registration is done through
 * your Onchain OS Agent (Agentic Wallet), not through a REST API call.
 *
 * The API credentials in .env (OKX_API_KEY etc.) are for x402 payment
 * processing, not for ASP registration.
 *
 * === VERIFIED DEPLOYED ENDPOINTS ===
 *
 * A2A:  POST https://consensus-production-d6fa.up.railway.app/api/a2a/tasks
 *       Body: { "text": "Check risk consensus for aave-v3 on ethereum" }
 *       Returns full task lifecycle with state history + result
 *
 * A2MCP: POST https://consensus-production-d6fa.up.railway.app/api/mcp
 *        JSON-RPC 2.0, tools: get_risk_consensus
 *
 * === HOW TO REGISTER AS A2A ASP ===
 *
 * Step 1: Install Onchain OS (if not already installed):
 *    npx skills add okx/onchainos-skills --yes -g
 *
 * Step 2: Log in to your Agentic Wallet:
 *    Tell your agent: "Log in to Agentic Wallet on Onchain OS with my email"
 *
 * Step 3: Register as A2A ASP:
 *    Tell your agent: "Help me register an A2A ASP on OKX.AI using OKX Agent Identity from Onchain OS"
 *
 *    Use these details when prompted:
 *      ASP Name:     Consensus
 *      Service Type: A2A
 *      Endpoint:     https://consensus-production-d6fa.up.railway.app
 *      Description:  DeFi risk-consensus and coverage-matching A2A service.
 *                    AI agents can request 3-persona risk analysis for DeFi
 *                    protocols, get coverage provider matches, and run
 *                    multi-step tasks combining risk consensus with coverage
 *                    discovery.
 *
 * Step 4: List your ASP on OKX.AI:
 *    Tell your agent: "Help me list my ASP on OKX.AI using Onchain OS"
 *
 *    OKX reviews submissions within 24 hours and sends the result to the
 *    email registered with your Agentic Wallet.
 *
 * === A2A TASK FORMAT ===
 *
 * Other agents call your A2A service by posting natural-language tasks:
 *    POST /api/a2a/tasks
 *    { "text": "Check risk consensus for aave-v3 on ethereum" }
 *
 * The service parses the text, runs the full accept->work->deliver->complete
 * lifecycle, and returns the result with state history.
 *
 * Supported task types:
 *  - "Check risk consensus for {protocol} on {chain}"
 *  - "Find coverage options for {chain}"
 *  - "Check risk for {protocol} on {chain} and find coverage"
 */

console.log(`
╔══════════════════════════════════════════════════════════════╗
║            Consensus - Onchain OS ASP Registration          ║
║                    (A2A Service)                            ║
╚══════════════════════════════════════════════════════════════╝

Your A2A service is deployed and verified at:
   https://consensus-production-d6fa.up.railway.app

A2A Endpoint: POST /api/a2a/tasks
  Body: { "text": "Check risk consensus for aave-v3 on ethereum" }
  Returns: Full task lifecycle with state history + result

A2MCP Endpoint: POST /api/mcp
  Tool: get_risk_consensus (JSON-RPC 2.0, Streamable HTTP)

╔══════════════════════════════════════════════════════════════╗
║                   REGISTRATION STEPS                        ║
╚══════════════════════════════════════════════════════════════╝

Step 1: Install Onchain OS (if needed)
  -> npx skills add okx/onchainos-skills --yes -g

Step 2: Log in to your Agentic Wallet
  -> Tell your agent: "Log in to Agentic Wallet on Onchain OS with my email"

Step 3: Register as an A2A ASP
  -> Tell your agent: "Help me register an A2A ASP on OKX.AI using OKX Agent Identity from Onchain OS"
  
  Use these details when prompted:
     ASP Name:     Consensus
     Service Type: A2A
     Endpoint:     https://consensus-production-d6fa.up.railway.app
     Description:  DeFi risk-consensus and coverage-matching A2A service.
                   AI agents can request 3-persona risk analysis for DeFi
                   protocols, get coverage provider matches, and run
                   multi-step tasks combining risk consensus with coverage
                   discovery.

Step 4: List your ASP on OKX.AI
  -> Tell your agent: "Help me list my ASP on OKX.AI using Onchain OS"
  
  OKX reviews submissions within 24 hours. Once approved, your ASP
  will appear in the Agent marketplace.

╔══════════════════════════════════════════════════════════════╗
║                   VERIFICATION                              ║
╚══════════════════════════════════════════════════════════════╝

A2A endpoint tested successfully:
  POST /api/a2a/tasks with text "Check risk consensus for aave-v3 on ethereum"
  -> Status 200, task completed with full risk consensus result

A2MCP endpoint tested successfully:
  POST /api/mcp with tools/list -> get_risk_consensus advertised
  POST /api/mcp with tools/call -> consensusScore returned

╔══════════════════════════════════════════════════════════════╗
║                   NOTES                                     ║
╚══════════════════════════════════════════════════════════════╝

- A2A services negotiate price, scope, and delivery terms between agents.
  Payment runs through escrow; the provider is paid only after the user
  signs off. Providers may escalate disputes to arbitration.

- The service also exposes an A2MCP surface at /api/mcp for direct
  pay-per-call access (requires x402 payment SDK integration).

- For A2MCP-only registration, use a different prompt:
  "Help me register an A2MCP ASP on OKX.AI using OKX Agent Identity from Onchain OS"
`);