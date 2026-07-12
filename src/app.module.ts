import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { TenantMiddleware } from './tenancy/tenant.middleware';
import { WorkflowsController } from './workflows/workflows.controller';
import { WorkflowsService } from './workflows/workflows.service';

@Module({
  controllers: [WorkflowsController],
  providers: [PrismaService, WorkflowsService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Applied to every route - there is no route in this app that should
    // ever run without a resolved tenant context.
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
