import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { QueueService } from './queues/queue.service';
import { TenantMiddleware } from './tenancy/tenant.middleware';
import { OrchestratorService } from './workflows/orchestrator.service';
import { StepProcessor } from './workflows/step.processor';
import { WorkflowsController } from './workflows/workflows.controller';
import { WorkflowsService } from './workflows/workflows.service';

@Module({
  controllers: [WorkflowsController],
  providers: [PrismaService, QueueService, OrchestratorService, StepProcessor, WorkflowsService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Applied to every route - there is no route in this app that should
    // ever run without a resolved tenant context.
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
