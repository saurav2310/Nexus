import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkflowsService {
  constructor(private prisma: PrismaService) {}

  async list(tenantId: string) {
    // Even though RLS would filter this anyway if we forgot the .where clause,
    // we still filter explicitly here. Defense in depth: RLS is the safety net,
    // not a replacement for writing correct queries.
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.workflow.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } }),
    );
  }

  async create(tenantId: string, name: string, definition: object) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.workflow.create({ data: { tenantId, name, definition } }),
    );
  }
}
