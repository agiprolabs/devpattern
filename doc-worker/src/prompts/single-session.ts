/**
 * Single Session Documentation Prompt
 * Used when processing individual sessions (non-batched)
 */

import type { SessionContext, TaskCommit, ThoughtRecord } from '../types.js';

export function generateSingleSessionPrompt(session: SessionContext): string {
  const { session: meta, thoughts, tasks } = session;

  return `You are a technical documentation specialist for a software development workflow tool.

Generate concise but informative documentation for this completed thinking session.

## Session Information
- Session ID: ${meta.id}
- Created: ${meta.createdAt}
- Outcome: ${meta.outcome || 'completed'}
- Agent Summary: ${meta.agentSummary || 'Not provided'}

## Thoughts (${thoughts.length} total)
${formatThoughts(thoughts)}

## Tasks (${tasks.length} total)
${formatTasks(tasks)}

Generate documentation with this structure:

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

Rules:
- Keep each section concise (2-4 sentences max)
- Focus on actionable information
- Use technical language appropriate for developers
- If the session was abandoned/deferred, note what was incomplete and why

Generate the documentation now:`;
}

function formatThoughts(thoughts: ThoughtRecord[]): string {
  if (thoughts.length === 0) {
    return '(No thoughts recorded)';
  }

  if (thoughts.length <= 10) {
    return thoughts.map(t => {
      const prefix = t.isRevision ? '[REVISION] ' : t.branchId ? `[BRANCH:${t.branchId}] ` : '';
      return `${t.thoughtNumber}. ${prefix}${t.thought}`;
    }).join('\n\n');
  }

  // For longer sessions, show first 3, last 3, and key points
  const first = thoughts.slice(0, 3);
  const last = thoughts.slice(-3);
  const revisions = thoughts.filter(t => t.isRevision);
  const branches = thoughts.filter(t => t.branchId);

  let output = first.map(t => `${t.thoughtNumber}. ${t.thought}`).join('\n\n');
  output += `\n\n... (${thoughts.length - 6} thoughts omitted) ...\n\n`;
  output += last.map(t => `${t.thoughtNumber}. ${t.thought}`).join('\n\n');

  if (revisions.length > 0) {
    output += `\n\n### Key Revisions (${revisions.length} total):`;
    output += revisions.slice(0, 3).map(t =>
      `\n- Thought ${t.thoughtNumber} revised thought ${t.revisesThought}: ${t.thought.slice(0, 150)}...`
    ).join('');
  }

  if (branches.length > 0) {
    const branchIds = [...new Set(branches.map(t => t.branchId))];
    output += `\n\n### Branches explored: ${branchIds.join(', ')}`;
  }

  return output;
}

function formatTasks(tasks: TaskCommit[]): string {
  if (tasks.length === 0) {
    return '(No tasks tracked)';
  }

  return tasks.map(t => {
    const emoji = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '⏳';
    return `${emoji} ${t.taskTitle}${t.description ? `: ${t.description}` : ''} (${t.status})`;
  }).join('\n');
}

