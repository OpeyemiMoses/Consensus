import {
  createTask,
  acceptTask,
  startWork,
  deliverResult,
  completeTask,
  failTask,
  getTask,
} from "./taskStore.js";
import { parseTaskInput } from "./parseTaskInput.js";
import { runRiskConsensus } from "../core/runRiskConsensus.js";
import { runCoverageMatch } from "../core/runCoverageMatch.js";

/**
 * Runs a full A2A task end-to-end: accept -> work -> deliver -> complete
 * (Section 6.3). This is intentionally synchronous/in-process for hackathon
 * scope — the task-state history is still recorded at each step so the
 * lifecycle is visible/auditable even though nothing here actually waits
 * on an external OKX webhook. If OKX's real Task Marketplace turns out to
 * require async accept-then-separately-poll semantics, split this function
 * at the "startWork" line and expose a second endpoint that runs the rest.
 *
 * chain is required for coverage-match — if the parsed task wants coverage
 * but didn't mention one explicitly, we can't safely guess it, so that
 * sub-request is skipped and noted in the result rather than guessed.
 */
export async function runA2ATask(rawInput) {
  const task = createTask({ rawInput });

  try {
    const parsedInput = await parseTaskInput(rawInput);
    acceptTask(task.id, parsedInput);

    startWork(task.id);

    const result = {};

    if (parsedInput.service === "risk-consensus" || parsedInput.service === "both") {
      result.riskConsensus = await runRiskConsensus({
        protocolSlug: parsedInput.protocolSlug,
        contractAddress: parsedInput.contractAddress,
        chain: parsedInput.chain,
      });
    }

    if (parsedInput.service === "coverage-match" || parsedInput.service === "both") {
      if (parsedInput.chain) {
        result.coverageMatch = runCoverageMatch({ chain: parsedInput.chain });
      } else {
        result.coverageMatchSkipped =
          "Coverage match requested but no chain was specified in the request — cannot safely infer one.";
      }
    }

    deliverResult(task.id, result);
    completeTask(task.id);

    return getTask(task.id);
  } catch (err) {
    failTask(task.id, err);
    return getTask(task.id);
  }
}

export { getTask };
