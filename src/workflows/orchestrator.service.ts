import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queues/queue.service';
import { getReadySteps, WorkflowDefinition } from './dag.util';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  /**
   * The single re-entry point for progressing a workflow run. Called:
   *  1. Once when the run is first created (to kick off the initial steps)
   *  2. Once every time a step succeeds (to unblock whatever depended on it)
   *
   * It is safe to call this multiple times concurrently for the same run -
   * it only enqueues steps whose StepRun row is still 'pending' in the DB,
   * and BullMQ's deterministic jobId prevents duplicate enqueues on top of that.
   */
  async advance(tenantId: string, runId: string): Promise<void> {
    const run = await this.prisma.forTenant(tenantId, (tx) =>
      tx.workflowRun.findUniqueOrThrow({
        where: { id: runId },
        include: { workflow: true, steps: true },
      }),
    );

    if (run.status === 'succeeded' || run.status === 'failed') {
      return; // terminal state, nothing left to do
    }

    const definition = run.workflow.definition as unknown as WorkflowDefinition;

    const failedStep = run.steps.find((s) => s.status === 'failed');
    if (failedStep) {
      // Simple policy for Phase 1: any single step failure fails the whole run.
      // A more advanced version would support "continue on error" per step -
      // worth calling out as a deliberate scope cut, not an oversight.
      await this.prisma.forTenant(tenantId, (tx) =>
        tx.workflowRun.update({
          where: { id: runId },
          data: { status: 'failed', finishedAt: new Date() },
        }),
      );
      this.logger.warn(`Run ${runId} failed due to step "${failedStep.stepName}"`);
      return;
    }

    const succeededNames = new Set(run.steps.filter((s) => s.status === 'succeeded').map((s) => s.stepName));
    const inProgressOrDone = new Set(
      run.steps.filter((s) => s.status !== 'pending').map((s) => s.stepName),
    );

    if (succeededNames.size === definition.steps.length) {
      await this.prisma.forTenant(tenantId, (tx) =>
        tx.workflowRun.update({
          where: { id: runId },
          data: { status: 'succeeded', finishedAt: new Date() },
        }),
      );
      this.logger.log(`Run ${runId} succeeded`);
      return;
    }

    const ready = getReadySteps(definition.steps, succeededNames, inProgressOrDone);

    for (const step of ready) {
      await this.queue.stepQueue.add(
        step.name,
        { tenantId, runId, stepName: step.name, stepType: step.type, config: step.config ?? {} },
        {
          // Deterministic jobId: BullMQ will refuse to add a second job with
          // this exact ID while one exists in the queue, which is our
          // first line of defense against double-enqueueing the same step.
          jobId: `${runId}:${step.name}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        },
      );
      this.logger.log(`Enqueued step "${step.name}" for run ${runId}`);
    }
  }
}
