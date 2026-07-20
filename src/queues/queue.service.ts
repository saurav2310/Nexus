import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConnectionOptions, Queue } from 'bullmq';

export const STEP_QUEUE_NAME = 'step-execution';

function parseRedisUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
  };
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  // A plain options object, not an ioredis client instance. BullMQ creates
  // and owns its own internal ioredis connections from these options - this
  // sidesteps a real gotcha: if you `npm install ioredis` yourself alongside
  // BullMQ (which bundles its own copy), npm can end up with two separate
  // copies of the package. They're functionally identical but TypeScript
  // treats them as structurally different types, so a Redis instance from
  // "your" ioredis doesn't type-check where BullMQ expects "its" ioredis.
  // Passing plain connection options avoids the whole class of problem.
  public readonly connection: ConnectionOptions = parseRedisUrl(
    process.env.REDIS_URL ?? 'redis://localhost:6379',
  );

  public readonly stepQueue = new Queue(STEP_QUEUE_NAME, { connection: this.connection });

  async onModuleDestroy() {
    await this.stepQueue.close();
  }
}
