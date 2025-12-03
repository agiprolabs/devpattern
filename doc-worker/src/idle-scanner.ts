/**
 * Idle Session Scanner
 * Scans for sessions that have been idle for more than the configured timeout
 * and auto-finalizes them for documentation generation
 */

import { Redis } from 'ioredis';
import { config } from './config.js';
import { Storage } from './storage.js';
import type { DocumentationWorker } from './worker.js';
import type { DevPatternEvent, Session } from './types.js';

export class IdleSessionScanner {
  private storage: Storage;
  private redis: Redis;
  private worker: DocumentationWorker;
  private scanInterval: NodeJS.Timeout | null = null;
  private readonly SCAN_INTERVAL_MS = 60 * 1000; // Scan every minute

  constructor(worker: DocumentationWorker) {
    this.worker = worker;
    this.storage = new Storage(config.dataPath);
    this.redis = new Redis(config.redisUrl);
  }

  start(): void {
    console.log(`⏱️  Starting idle session scanner (timeout: ${config.idleTimeoutMinutes} minutes)`);

    // Run immediately on start
    this.scan().catch(err => console.error('Idle scan error:', err));

    // Then run every minute
    this.scanInterval = setInterval(() => {
      this.scan().catch(err => console.error('Idle scan error:', err));
    }, this.SCAN_INTERVAL_MS);
  }

  stop(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.redis.disconnect();
  }

  async scan(): Promise<void> {
    const activeSessions = await this.storage.listActiveSessions();
    const now = Date.now();
    const idleTimeoutMs = config.idleTimeoutMinutes * 60 * 1000;

    for (const session of activeSessions) {
      const lastActivity = new Date(session.updatedAt).getTime();
      const idleTime = now - lastActivity;

      if (idleTime > idleTimeoutMs) {
        console.log(`📋 Session ${session.id} idle for ${Math.round(idleTime / 60000)} minutes, auto-finalizing`);
        await this.autoFinalize(session);
      }
    }
  }

  private async autoFinalize(session: Session): Promise<void> {
    // Determine outcome based on task completion
    const tasks = await this.storage.getTasks(session.id);
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const outcome = completedTasks > 0 ? 'completed' : 'abandoned';

    // Update session
    session.status = 'finalized';
    session.outcome = outcome;
    session.autoFinalized = true;
    session.updatedAt = new Date();
    await this.storage.updateSession(session);

    // Publish event
    const event: DevPatternEvent = {
      type: 'session.idle_timeout',
      sessionId: session.id,
      tenantId: session.tenantId,
      timestamp: new Date().toISOString(),
      payload: {
        outcome,
        idleMinutes: config.idleTimeoutMinutes,
        thoughtCount: session.thoughtCount,
        taskCount: session.taskCount,
        tier: session.tier || 'basic',
      },
    };

    // Publish to Redis for other listeners
    await this.redis.publish('devpattern:events', JSON.stringify(event));

    // Directly queue for documentation (worker is already listening, but we can be explicit)
    console.log(`  Published idle_timeout event for session ${session.id}`);
  }
}

