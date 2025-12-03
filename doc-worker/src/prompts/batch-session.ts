/**
 * Batch Session Documentation Prompt
 * Process multiple sessions in a single LLM call for cost efficiency
 */

import type { SessionContext, TaskCommit, ThoughtRecord } from '../types.js';

export function generateBatchPrompt(sessions: SessionContext[]): string {
  const sessionBlocks = sessions.map((session, index) => {
    const { session: meta, thoughts, tasks } = session;

    return `
## SESSION ${index + 1}: ${meta.id}
Created: ${meta.createdAt}
Outcome: ${meta.outcome || 'completed'}
Agent Summary: ${meta.agentSummary || 'Not provided'}

### Thoughts (${thoughts.length} total)
${formatThoughtsCompact(thoughts)}

### Tasks (${tasks.length} total)
${formatTasks(tasks)}
---`;
  }).join('\n\n');

  return `You are a technical documentation specialist for a software development workflow tool.

You are given ${sessions.length} completed thinking sessions from developers. For EACH session, generate concise but informative documentation.

${sessionBlocks}

For EACH session above, generate documentation with this EXACT structure:

===SESSION_START: {session_id}===
## Executive Summary
(2-3 sentences: What was the developer trying to accomplish? What was the outcome?)

## Problem Statement
(What specific problem or task was being addressed?)

## Approach
(Key decisions made and reasoning. Focus on WHY, not just WHAT.)

## Outcome
(What was achieved? Any notable results or artifacts?)

## Key Insights
(Lessons learned, patterns identified, or recommendations for future work)

## Tags
(3-5 relevant tags for categorization, comma-separated)
===SESSION_END===

Rules:
- Keep each section concise (2-4 sentences max)
- Focus on actionable information
- Identify connections between sessions if they exist
- Use technical language appropriate for developers
- If a session was abandoned/deferred, note what was incomplete and why

Generate documentation for all ${sessions.length} sessions now:`;
}

function formatThoughtsCompact(thoughts: ThoughtRecord[]): string {
  if (thoughts.length === 0) return '(No thoughts recorded)';

  // For batch processing, be more aggressive with summarization
  if (thoughts.length <= 5) {
    return thoughts.map(t => {
      const prefix = t.isRevision ? '[REV] ' : t.branchId ? `[B:${t.branchId}] ` : '';
      return `${t.thoughtNumber}. ${prefix}${t.thought}`;
    }).join('\n');
  }

  // Show first 2, last 2, and key revision points
  const first = thoughts.slice(0, 2);
  const last = thoughts.slice(-2);
  const revisions = thoughts.filter(t => t.isRevision);
  const branches = [...new Set(thoughts.filter(t => t.branchId).map(t => t.branchId))];

  let output = first.map(t => `${t.thoughtNumber}. ${t.thought}`).join('\n');
  output += `\n... (${thoughts.length - 4} thoughts omitted) ...\n`;
  output += last.map(t => `${t.thoughtNumber}. ${t.thought}`).join('\n');

  if (revisions.length > 0) {
    output += `\nRevisions: ${revisions.length} total`;
  }
  if (branches.length > 0) {
    output += `\nBranches: ${branches.join(', ')}`;
  }

  return output;
}

function formatTasks(tasks: TaskCommit[]): string {
  if (tasks.length === 0) return '(No tasks tracked)';

  return tasks.map(t => {
    const emoji = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '⏳';
    return `${emoji} ${t.taskTitle}${t.description ? `: ${t.description}` : ''} (${t.status})`;
  }).join('\n');
}

/**
 * Parse the multi-session response into individual documentation entries
 */
export function parseBatchResponse(
  response: string,
  sessions: SessionContext[]
): Map<string, ParsedBatchDoc> {
  const docs = new Map<string, ParsedBatchDoc>();

  const sessionPattern = /===SESSION_START:\s*(\S+)\s*===([\s\S]*?)===SESSION_END===/g;
  let match;

  while ((match = sessionPattern.exec(response)) !== null) {
    const sessionId = match[1];
    const content = match[2].trim();

    docs.set(sessionId, {
      sessionId,
      content,
      executiveSummary: extractSection(content, 'Executive Summary'),
      problemStatement: extractSection(content, 'Problem Statement'),
      approach: extractSection(content, 'Approach'),
      outcome: extractSection(content, 'Outcome'),
      keyInsights: extractSection(content, 'Key Insights'),
      tags: extractTags(content),
    });
  }

  return docs;
}

function extractSection(content: string, sectionName: string): string {
  const pattern = new RegExp(`## ${sectionName}\\s*([\\s\\S]*?)(?=## |$)`, 'i');
  const match = pattern.exec(content);
  return match ? match[1].trim() : '';
}

function extractTags(content: string): string[] {
  const tagsSection = extractSection(content, 'Tags');
  if (!tagsSection) return [];
  return tagsSection.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

export interface ParsedBatchDoc {
  sessionId: string;
  content: string;
  executiveSummary: string;
  problemStatement: string;
  approach: string;
  outcome: string;
  keyInsights: string;
  tags: string[];
}

