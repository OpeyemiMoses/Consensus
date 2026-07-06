import { Router } from "express";
import { runA2ATask, getTask } from "./taskLifecycle.js";

const router = Router();

/**
 * Section 6.2: another agent's A2A flow pastes a templated natural-language
 * request. This posts a task, runs it through the full accept->work->deliver
 * ->complete lifecycle, and returns the final task record (including the
 * state history, useful for demoing the lifecycle on camera per Section 7).
 */
router.post("/a2a/tasks", async (req, res) => {
  const { text } = req.body || {};

  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: 'Provide a "text" field with the natural-language task request.' });
  }

  const task = await runA2ATask(text);
  res.json(task);
});

/**
 * Poll a task's current state — useful if you split runA2ATask into async
 * accept + separate work steps later (see note in taskLifecycle.js).
 */
router.get("/a2a/tasks/:id", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found." });
  res.json(task);
});

export default router;
