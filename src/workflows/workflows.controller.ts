import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  list(@Req() req: Request) {
    // req.tenantId was set by TenantMiddleware before this handler ever ran.
    return this.workflowsService.list(req.tenantId!);
  }

  @Post()
  create(@Req() req: Request, @Body() body: { name: string; definition: object }) {
    return this.workflowsService.create(req.tenantId!, body.name, body.definition);
  }
}
