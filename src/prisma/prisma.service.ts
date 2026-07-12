import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Runs `work` inside a transaction with the Postgres session variable
   * `app.tenant_id` set via SET LOCAL - meaning it is scoped strictly to
   * this transaction and cannot leak to another request that later reuses
   * the same pooled connection.
   *
   * Every tenant-scoped query in the app MUST go through this method.
   * There is no other approved way to talk to the database for tenant data.
   */
  async forTenant<T>(tenantId: string, work: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      // Parameterized to avoid SQL injection - tenantId is never string-concatenated.
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return work(tx as unknown as PrismaClient);
    });
  }
}
