/**
 * Batch Processor
 * Collects sessions and processes them in batches for cost efficiency
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { Storage } from './storage.js';
import { generateBatchPrompt, parseBatchResponse } from './prompts/batch-session.js';
import type { SessionContext, DocumentationEntry, DevPatternEvent } from './types.js';

export class BatchProcessor {
  private anthropic: Anthropic;
  private storage: Storage;
  private pendingQueue: Map<string, SessionContext> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;

  constructor(storage: Storage) {
    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
    this.storage = storage;
  }

  async queueSession(sessionContext: SessionContext): Promise<void> {
    this.pendingQueue.set(sessionContext.session.id, sessionContext);

    if (this.pendingQueue.size >= config.batchSize) {
      await this.processBatch();
    } else if (!this.batchTimer) {
      // Start timer for partial batches
      this.batchTimer = setTimeout(
        () => this.processBatch(),
        config.batchWindowSeconds * 1000
      );
    }
  }

  async processBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    const sessions = Array.from(this.pendingQueue.values()).slice(0, config.batchSize);
    sessions.forEach(s => this.pendingQueue.delete(s.session.id));

    if (sessions.length === 0) return;

    console.log(`📦 Processing batch of ${sessions.length} sessions`);

    // Group by tier
    const basicTier = sessions.filter(s => s.session.tier !== 'premium');
    const premiumTier = sessions.filter(s => s.session.tier === 'premium');

    await Promise.all([
      this.processTierBatch(basicTier, config.basicModel),
      this.processTierBatch(premiumTier, config.premiumModel),
    ]);
  }

  private async processTierBatch(sessions: SessionContext[], model: string): Promise<void> {
    if (sessions.length === 0) return;

    console.log(`  Processing ${sessions.length} ${model.includes('haiku') ? 'basic' : 'premium'} sessions`);

    const prompt = generateBatchPrompt(sessions);

    const response = await this.anthropic.messages.create({
      model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsedDocs = parseBatchResponse(responseText, sessions);

    // Save each document
    for (const session of sessions) {
      const parsed = parsedDocs.get(session.session.id);

      if (parsed) {
        const doc: DocumentationEntry = {
          sessionId: session.session.id,
          generatedAt: new Date(),
          summary: parsed.executiveSummary || `Session with ${session.thoughts.length} thoughts`,
          thoughtCount: session.thoughts.length,
          taskCount: session.tasks.length,
          branches: [...new Set(session.thoughts.filter(t => t.branchId).map(t => t.branchId!))],
          content: parsed.content,
          executiveSummary: parsed.executiveSummary,
          problemStatement: parsed.problemStatement,
          approach: parsed.approach,
          outcome: parsed.outcome,
          keyInsights: parsed.keyInsights,
          tags: parsed.tags,
        };

        await this.storage.saveDocumentation(doc);
        console.log(`  ✅ Saved documentation for session ${session.session.id}`);
      } else {
        console.warn(`  ⚠️ No parsed documentation for session ${session.session.id}`);
      }
    }
  }

  getPendingCount(): number {
    return this.pendingQueue.size;
  }

  async flush(): Promise<void> {
    if (this.pendingQueue.size > 0) {
      await this.processBatch();
    }
  }
}

