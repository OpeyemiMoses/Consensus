import { Router } from "express";
import { runCoverageMatch } from "../core/runCoverageMatch.js";

const router = Router();

router.post("/coverage-match", (req, res) => {
  const { chain, protocolType } = req.body || {};

  try {
    const result = runCoverageMatch({ chain, protocolType });
    res.json(result);
  } catch (err) {
    if (err.message.startsWith("Provide a chain")) {
      return res.status(400).json({ error: err.message });
    }
    console.error("[coverage-match] error:", err);
    res.status(500).json({ error: "Failed to match coverage.", detail: err.message });
  }
});

export default router;
