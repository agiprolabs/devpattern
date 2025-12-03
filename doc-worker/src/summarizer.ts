/**
 * LLM Summarizer
 * Generates documentation using Anthropic Claude
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { Storage } from './storage.js';
import { generateSingleSessionPrompt } from './prompts/single-session.js';
import { generateStagePrompt, generateSynthesisPrompt, STAGE_SIZE } from './prompts/staged-summary.js';
import type { SessionContext, DocumentationEntry } from './types.js';

export class Summarizer {
  private anthropic: Anthropic;
  private storage: Storage;

  constructor(storage: Storage) {
    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
    this.storage = storage;
  }

  async generateDocumentation(
    sessionContext: SessionContext,
    tier: 'basic' | 'premium' = 'basic'
  ): Promise<DocumentationEntry> {
    const { session, thoughts, tasks } = sessionContext;
    const model = tier === 'premium' ? config.premiumModel : config.basicModel;

    // Determine if we need staged summarization
    if (thoughts.length > STAGE_SIZE) {
      return this.stagedSummarization(sessionContext, model);
    }

    return this.singlePassSummarization(sessionContext, model);
  }

  private async singlePassSummarization(
    sessionContext: SessionContext,
    model: string
  ): Promise<DocumentationEntry> {
    const { session, thoughts, tasks } = sessionContext;
    const prompt = generateSingleSessionPrompt(sessionContext);

    const response = await this.anthropic.messages.create({
      model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = this.parseDocumentation(content);

    const doc: DocumentationEntry = {
      sessionId: session.id,
      generatedAt: new Date(),
      summary: parsed.executiveSummary || `Session with ${thoughts.length} thoughts`,
      thoughtCount: thoughts.length,
      taskCount: tasks.length,
      branches: [...new Set(thoughts.filter(t => t.branchId).map(t => t.branchId!))],
      content,
      ...parsed,
    };

    await this.storage.saveDocumentation(doc);
    return doc;
  }

  private async stagedSummarization(
    sessionContext: SessionContext,
    model: string
  ): Promise<DocumentationEntry> {
    const { session, thoughts, tasks } = sessionContext;
    const stageSummaries: string[] = [];
    const totalStages = Math.ceil(thoughts.length / STAGE_SIZE);

    // Stage 1: Summarize each chunk
    for (let i = 0; i < thoughts.length; i += STAGE_SIZE) {
      const chunk = thoughts.slice(i, i + STAGE_SIZE);
      const stageNum = Math.floor(i / STAGE_SIZE) + 1;
      const prompt = generateStagePrompt(chunk, stageNum, totalStages);

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });

      const summary = response.content[0].type === 'text' ? response.content[0].text : '';
      stageSummaries.push(summary);
    }

    // Stage 2: Synthesize into final document
    const synthesisPrompt = generateSynthesisPrompt(stageSummaries, tasks, session);
    const response = await this.anthropic.messages.create({
      model,
      max_tokens: 3000,
      messages: [{ role: 'user', content: synthesisPrompt }],
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = this.parseDocumentation(content);

    const doc: DocumentationEntry = {
      sessionId: session.id,
      generatedAt: new Date(),
      summary: parsed.executiveSummary || `Large session with ${thoughts.length} thoughts`,
      thoughtCount: thoughts.length,
      taskCount: tasks.length,
      branches: [...new Set(thoughts.filter(t => t.branchId).map(t => t.branchId!))],
      content,
      ...parsed,
    };

    await this.storage.saveDocumentation(doc);
    return doc;
  }

  private parseDocumentation(content: string): Partial<DocumentationEntry> {
    return {
      executiveSummary: this.extractSection(content, 'Executive Summary'),
      problemStatement: this.extractSection(content, 'Problem Statement'),
      approach: this.extractSection(content, 'Approach'),
      outcome: this.extractSection(content, 'Outcome'),
      keyInsights: this.extractSection(content, 'Key Insights'),
      tags: this.extractTags(content),
    };
  }

  private extractSection(content: string, sectionName: string): string {
    const pattern = new RegExp(`## ${sectionName}\\s*([\\s\\S]*?)(?=## |$)`, 'i');
    const match = pattern.exec(content);
    return match ? match[1].trim() : '';
  }

  private extractTags(content: string): string[] {
    const tagsSection = this.extractSection(content, 'Tags');
    if (!tagsSection) return [];
    return tagsSection.split(',').map(t => t.trim()).filter(t => t.length > 0);
  }
}

