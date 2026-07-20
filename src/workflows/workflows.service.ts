import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrchestratorService } from './orchestrator.service';
import { validateDag, WorkflowDefinition } from './dag.util';

@Injectable()
export class WorkflowsService {
  constructor(
    private prisma: PrismaService,
    private orchestrator: OrchestratorService,
  ) {}

  async list(tenantId: string) {
    // Even though RLS would filter this anyway if we forgot the .where clause,
    // we still filter explicitly here. Defense in depth: RLS is the safety net,
    // not a replacement for writing correct queries.
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.workflow.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    );
  }

  async create(tenantId: string, name: string, definition: WorkflowDefinition) {
    // Reject a broken DAG at creation time - never let a malformed workflow
    // reach execution, where a cycle would just hang forever with zero
    // steps ever becoming "ready".
    validateDag(definition);

    return this.prisma.forTenant(tenantId, (tx) =>
      tx.workflow.create({ data: { tenantId, name, definition: definition as object } }),
    );
  }

  /**
   * Starts a new run of a workflow: creates the WorkflowRun row plus one
   * StepRun row per step (all 'pending'), then asks the orchestrator to
   * enqueue whatever's immediately ready (steps with no dependencies).
   */
  async startRun(tenantId: string, workflowId: string, input: object) {
    const workflow = await this.prisma.forTenant(tenantId, (tx) =>
      tx.workflow.findFirst({ where: { id: workflowId, tenantId } }),
    );
    if (!workflow) throw new NotFoundException('Workflow not found');

    const definition = workflow.definition as unknown as WorkflowDefinition;

    const run = await this.prisma.forTenant(tenantId, (tx) =>
      tx.workflowRun.create({
        data: {
          tenantId,
          workflowId,
          status: 'running',
          input,
          startedAt: new Date(),
          steps: {
            create: definition.steps.map((step) => ({
              tenantId,
              stepName: step.name,
              stepType: step.type,
              status: 'pending',
            })),
          },
        },
        include: { steps: true },
      }),
    );

    await this.orchestrator.advance(tenantId, run.id);
    return run;
  }

  async getRun(tenantId: string, runId: string) {
    const run = await this.prisma.forTenant(tenantId, (tx) =>
      tx.workflowRun.findFirst({ where: { id: runId, tenantId }, include: { steps: true } }),
    );
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }
}
