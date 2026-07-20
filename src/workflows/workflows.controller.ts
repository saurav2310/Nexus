import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { WorkflowsService } from './workflows.service';
import { WorkflowDefinition } from './dag.util';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.workflowsService.list(req.tenantId!);
  }

  @Post()
  create(@Req() req: Request, @Body() body: { name: string; definition: WorkflowDefinition }) {
    return this.workflowsService.create(req.tenantId!, body.name, body.definition);
  }

  @Post(':id/run')
  startRun(@Req() req: Request, @Param('id') id: string, @Body() body: { input?: object }) {
    return this.workflowsService.startRun(req.tenantId!, id, body.input ?? {});
  }

  @Get('runs/:runId')
  getRun(@Req() req: Request, @Param('runId') runId: string) {
    return this.workflowsService.getRun(req.tenantId!, runId);
  }
}
