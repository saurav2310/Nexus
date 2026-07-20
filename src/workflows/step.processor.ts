import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService, STEP_QUEUE_NAME } from '../queues/queue.service';
import { OrchestratorService } from './orchestrator.service';

interface StepJobData {
  tenantId: string;
  runId: string;
  stepName: string;
  stepType: 'http' | 'transform' | 'agent';
  config: Record<string, unknown>;
}

@Injectable()
export class StepProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StepProcessor.name);
  private worker!: Worker<StepJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<StepJobData>(
      STEP_QUEUE_NAME,
      (job) => this.process(job),
      { connection: this.queue.connection, concurrency: 5 },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.warn(`Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker.close();
  }

  private async process(job: Job<StepJobData>): Promise<void> {
    const { tenantId, runId, stepName, stepType, config } = job.data;

    // --- CLAIM ---
    // Atomic conditional update: only transitions pending -> running.
    // If another worker (or a previous, still-in-flight attempt) already
    // claimed this step, `count` will be 0 and we bail out silently.
    // This is what makes it safe for the same job to theoretically be
    // picked up more than once (e.g. after a Redis failover edge case).
    const claim = await this.prisma.forTenant(tenantId, (tx) =>
      tx.stepRun.updateMany({
        where: { runId, stepName, status: 'pending' },
        data: { status: 'running', startedAt: new Date() },
      }),
    );

    if (claim.count === 0) {
      this.logger.log(`Step "${stepName}" for run ${runId} already claimed - skipping`);
      return;
    }

    try {
      const output = await this.executeStep(stepType, config);

      await this.prisma.forTenant(tenantId, (tx) =>
        tx.stepRun.update({
          where: { runId_stepName: { runId, stepName } },
          data: { status: 'succeeded', output, finishedAt: new Date() },
        }),
      );

      // Progress the DAG: this step's success may have unblocked others.
      await this.orchestrator.advance(tenantId, runId);
    } catch (err) {
      const error = err as Error;
      const attemptsRemaining = job.opts.attempts! - job.attemptsMade > 0;

      if (attemptsRemaining) {
        // Reset to 'pending' so the retry (a fresh job attempt BullMQ will
        // schedule automatically after we rethrow) can pass the claim check.
        await this.prisma.forTenant(tenantId, (tx) =>
          tx.stepRun.update({
            where: { runId_stepName: { runId, stepName } },
            data: { status: 'pending', startedAt: null },
          }),
        );
      } else {
        // No retries left - this is a terminal failure for the step.
        await this.prisma.forTenant(tenantId, (tx) =>
          tx.stepRun.update({
            where: { runId_stepName: { runId, stepName } },
            data: { status: 'failed', errorMessage: error.message, finishedAt: new Date() },
          }),
        );
        // Let the orchestrator notice the failed step and fail the whole run.
        await this.orchestrator.advance(tenantId, runId);
      }

      // Rethrow regardless - this is what tells BullMQ the job failed, so
      // its own retry/backoff scheduling kicks in when attempts remain.
      throw error;
    }
  }

  /**
   * Placeholder step execution. Phase 2 replaces the "agent" branch with a
   * real LLM tool-calling loop; "http" becomes a real outbound request.
   * Kept stubbed here so we can test the orchestration logic in isolation
   * from any real external system.
   */
  private async executeStep(
    stepType: StepJobData['stepType'],
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    await new Promise((r) => setTimeout(r, 500)); // simulate work
    return { stepType, echoedConfig: config, ranAt: new Date().toISOString() };
  }
}
