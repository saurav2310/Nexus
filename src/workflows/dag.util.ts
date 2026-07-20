export interface StepDefinition {
  name: string;
  type: 'http' | 'transform' | 'agent';
  dependsOn: string[];
  config?: Record<string, unknown>;
}

export interface WorkflowDefinition {
  steps: StepDefinition[];
}

/**
 * Validates that a workflow definition is a legal DAG:
 * - every dependsOn reference points at a step that actually exists
 * - there are no cycles (A depends on B depends on A)
 *
 * Run this at workflow CREATE time, not at run-execution time - you want
 * to reject a broken workflow before anyone ever tries to run it, not
 * discover the cycle mid-execution with half the steps already run.
 */
export function validateDag(definition: WorkflowDefinition): void {
  const names = new Set(definition.steps.map((s) => s.name));

  if (names.size !== definition.steps.length) {
    throw new Error('Duplicate step names in workflow definition');
  }

  for (const step of definition.steps) {
    for (const dep of step.dependsOn) {
      if (!names.has(dep)) {
        throw new Error(`Step "${step.name}" depends on unknown step "${dep}"`);
      }
    }
  }

  // Cycle detection via DFS with a recursion stack.
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(definition.steps.map((s) => [s.name, WHITE]));
  const byName = new Map(definition.steps.map((s) => [s.name, s]));

  function visit(name: string, path: string[]) {
    color.set(name, GRAY);
    const step = byName.get(name)!;
    for (const dep of step.dependsOn) {
      const c = color.get(dep);
      if (c === GRAY) {
        throw new Error(`Cycle detected: ${[...path, dep].join(' -> ')}`);
      }
      if (c === WHITE) {
        visit(dep, [...path, dep]);
      }
    }
    color.set(name, BLACK);
  }

  for (const step of definition.steps) {
    if (color.get(step.name) === WHITE) visit(step.name, [step.name]);
  }
}

/**
 * Given the full step list and the set of step names that have already
 * succeeded, returns the steps that are now unblocked and ready to run -
 * i.e. every dependency has succeeded, and this step hasn't been attempted.
 *
 * `inProgressOrDone` covers pending-but-already-enqueued/running/succeeded/failed
 * steps so we never suggest re-running something that's already moving.
 */
export function getReadySteps(
  steps: StepDefinition[],
  succeededNames: Set<string>,
  inProgressOrDone: Set<string>,
): StepDefinition[] {
  return steps.filter((step) => {
    if (inProgressOrDone.has(step.name)) return false;
    return step.dependsOn.every((dep) => succeededNames.has(dep));
  });
}
