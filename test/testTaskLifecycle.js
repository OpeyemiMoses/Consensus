import {
  createTask,
  acceptTask,
  startWork,
  deliverResult,
  completeTask,
  failTask,
  getTask,
  TaskState,
} from "../src/a2a/taskStore.js";

/**
 * Validates the accept -> work -> deliver -> complete state machine
 * (Section 6.3) in isolation, without needing GROQ_API_KEY or hitting
 * any real service. This is the part that should never break regardless
 * of what the LLM does — a task must always transition legally.
 */
function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`FAILED: ${label} — expected ${expected}, got ${actual}`);
  }
  console.log(`  ✓ ${label}`);
}

function testHappyPath() {
  console.log("\nTest 1: happy path (received -> accepted -> in_progress -> delivered -> completed)");
  const task = createTask({ rawInput: "Check the risk consensus for aave-v3" });
  assertEqual(task.state, TaskState.RECEIVED, "starts as received");

  acceptTask(task.id, { service: "risk-consensus", protocolSlug: "aave-v3" });
  assertEqual(getTask(task.id).state, TaskState.ACCEPTED, "transitions to accepted");

  startWork(task.id);
  assertEqual(getTask(task.id).state, TaskState.IN_PROGRESS, "transitions to in_progress");

  deliverResult(task.id, { consensusScore: 12 });
  const delivered = getTask(task.id);
  assertEqual(delivered.state, TaskState.DELIVERED, "transitions to delivered");
  assertEqual(delivered.result.consensusScore, 12, "result payload is attached");

  completeTask(task.id);
  const completed = getTask(task.id);
  assertEqual(completed.state, TaskState.COMPLETED, "transitions to completed");
  assertEqual(completed.history.length, 5, "history records all 5 states");
}

function testFailurePath() {
  console.log("\nTest 2: failure path (received -> failed, e.g. unparseable request)");
  const task = createTask({ rawInput: "asdkjhaskjdh nonsense" });
  failTask(task.id, new Error("Could not parse task input"));
  const failed = getTask(task.id);
  assertEqual(failed.state, TaskState.FAILED, "transitions to failed");
  assertEqual(failed.error, "Could not parse task input", "error message is recorded");
}

function testUnknownTask() {
  console.log("\nTest 3: operating on an unknown task id throws rather than silently no-opping");
  let threw = false;
  try {
    acceptTask("task_does_not_exist", {});
  } catch (err) {
    threw = true;
  }
  assertEqual(threw, true, "throws on unknown task id");
}

testHappyPath();
testFailurePath();
testUnknownTask();
console.log("\n✓ All task lifecycle state machine tests passed.");
