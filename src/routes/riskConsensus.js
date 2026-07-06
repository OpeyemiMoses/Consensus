import { Router } from "express";
import { runRiskConsensus } from "../core/runRiskConsensus.js";

const router = Router();

router.post("/risk-consensus", async (req, res) => {
  const { protocolSlug, contractAddress, chain } = req.body || {};

  try {
    const result = await runRiskConsensus({ protocolSlug, contractAddress, chain });
    res.json(result);
  } catch (err) {
    if (err.message.startsWith("Provide at least one of")) {
      return res.status(400).json({ error: err.message });
    }
    console.error("[risk-consensus] error:", err);
    res.status(500).json({ error: "Failed to compute risk consensus.", detail: err.message });
  }
});

export default router;
