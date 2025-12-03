/**
 * Documentation Worker
 * Subscribes to Redis events and generates documentation
 */

import { Redis } from 'ioredis';
import { config } from './config.js';
import { Storage } from './storage.js';
import { Summarizer } from './summarizer.js';
import { BatchProcessor } from './batch-processor.js';
import type { DevPatternEvent, SessionContext } from './types.js';

export class DocumentationWorker {
  private subscriber: Redis;
  private publisher: Redis;
  private storage: Storage;
  private summarizer: Summarizer;
  private batchProcessor: BatchProcessor;
  private connected = false;
  private processedCount = 0;

  constructor() {
    this.subscriber = new Redis(config.redisUrl);
    this.publisher = new Redis(config.redisUrl);
    this.storage = new Storage(config.dataPath);
    this.summarizer = new Summarizer(this.storage);
    this.batchProcessor = new BatchProcessor(this.storage);
  }

  async connect(): Promise<void> {
    // Subscribe to events channel
    await this.subscriber.subscribe('devpattern:events');
    this.connected = true;

    this.subscriber.on('message', async (channel: string, message: string) => {
      if (channel === 'devpattern:events') {
        try {
          const event = JSON.parse(message) as DevPatternEvent;
          await this.handleEvent(event);
        } catch (error) {
          console.error('Error parsing event:', error);
        }
      }
    });

    // Start retry queue processor
    this.startRetryProcessor();

    console.log('📡 Connected to Redis, listening for events');
  }

  async handleEvent(event: DevPatternEvent): Promise<void> {
    if (event.type !== 'session.finalized' && event.type !== 'session.idle_timeout') {
      return; // Only process finalization events
    }

    console.log(`📥 Received ${event.type} event for session ${event.sessionId}`);

    const retryCount = event.payload.retryCount || 0;

    try {
      await this.processSession(event);
      this.processedCount++;
    } catch (error) {
      console.error(`Error processing session ${event.sessionId}:`, error);

      if (retryCount < config.maxRetries) {
        await this.scheduleRetry(event, retryCount + 1);
      } else {
        await this.moveToDeadLetter(event, error as Error);
      }
    }
  }

  private async processSession(event: DevPatternEvent): Promise<void> {
    const sessionContext = await this.storage.getSessionContext(event.sessionId);

    if (!sessionContext) {
      throw new Error(`Session not found: ${event.sessionId}`);
    }

    // Check cache - don't regenerate unchanged sessions
    const existingDoc = await this.storage.getDocumentation(event.sessionId);
    if (existingDoc) {
      const docTime = new Date(existingDoc.generatedAt).getTime();
      const sessionTime = new Date(sessionContext.session.updatedAt).getTime();

      if (docTime > sessionTime &&
          existingDoc.thoughtCount === sessionContext.thoughts.length &&
          existingDoc.taskCount === sessionContext.tasks.length) {
        console.log(`  ⏭️  Skipping ${event.sessionId} - documentation up to date`);
        return;
      }
    }

    // Use batch processor for small sessions, direct for large ones
    if (sessionContext.thoughts.length <= 20) {
      await this.batchProcessor.queueSession(sessionContext);
      console.log(`  📦 Queued ${event.sessionId} for batch processing`);
    } else {
      // Large sessions get immediate processing with staged summarization
      const tier = event.payload.tier || 'basic';
      await this.summarizer.generateDocumentation(sessionContext, tier);
      console.log(`  ✅ Generated documentation for ${event.sessionId} (staged)`);
    }
  }

  private async scheduleRetry(event: DevPatternEvent, retryCount: number): Promise<void> {
    const delay = config.retryDelays[retryCount - 1] || config.retryDelays[config.retryDelays.length - 1];

    const retryEvent = {
      ...event,
      payload: { ...event.payload, retryCount },
    };

    // Use Redis sorted set for delayed retry
    const retryAt = Date.now() + delay;
    await this.publisher.zadd('devpattern:retry_queue', retryAt, JSON.stringify(retryEvent));

    console.log(`  ⏳ Scheduled retry ${retryCount}/${config.maxRetries} for ${event.sessionId} in ${delay / 1000}s`);
  }

  private async moveToDeadLetter(event: DevPatternEvent, error: Error): Promise<void> {
    const entry = {
      event,
      error: error.message,
      failedAt: new Date().toISOString(),
      retryCount: config.maxRetries,
    };

    await this.publisher.lpush('devpattern:dead_letter', JSON.stringify(entry));
    console.error(`  ❌ Moved ${event.sessionId} to dead letter queue after ${config.maxRetries} retries`);
  }

  private startRetryProcessor(): void {
    // Check retry queue every 5 seconds
    setInterval(async () => {
      const now = Date.now();
      const items = await this.publisher.zrangebyscore('devpattern:retry_queue', 0, now);

      for (const item of items) {
        await this.publisher.zrem('devpattern:retry_queue', item);
        const event = JSON.parse(item) as DevPatternEvent;
        console.log(`  🔄 Retrying session ${event.sessionId}`);
        await this.handleEvent(event);
      }
    }, 5000);
  }

  isConnected(): boolean {
    return this.connected;
  }

  getPendingCount(): number {
    return this.batchProcessor.getPendingCount();
  }

  getProcessedCount(): number {
    return this.processedCount;
  }

  async shutdown(): Promise<void> {
    await this.batchProcessor.flush();
    this.subscriber.disconnect();
    this.publisher.disconnect();
  }
}

