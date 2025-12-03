/**
 * Staged Summary Prompts
 * For large sessions (20+ thoughts), summarize in stages then synthesize
 */

import type { ThoughtRecord, TaskCommit, Session } from '../types.js';

/**
 * Stage 1: Summarize a chunk of thoughts (20 thoughts per stage)
 */
export function generateStagePrompt(
  thoughts: ThoughtRecord[],
  stageNumber: number,
  totalStages: number
): string {
  return `You are summarizing stage ${stageNumber} of ${totalStages} from a developer's thinking session.

This stage contains ${thoughts.length} thoughts:

${thoughts.map(t => {
  const prefix = t.isRevision ? '[REVISION] ' : t.branchId ? `[BRANCH:${t.branchId}] ` : '';
  return `[${t.thoughtNumber}] ${prefix}${t.thought}`;
}).join('\n\n')}

Summarize this stage in 3-5 sentences:
- What was explored or decided?
- Any key turning points or revisions?
- What direction did the thinking take?

Stage ${stageNumber} Summary:`;
}

/**
 * Stage 2: Synthesize all stage summaries into final documentation
 */
export function generateSynthesisPrompt(
  stageSummaries: string[],
  tasks: TaskCommit[],
  metadata: Session
): string {
  return `You are creating final documentation from a large thinking session.

Session ID: ${metadata.id}
Total Thoughts: ${metadata.thoughtCount}
Total Tasks: ${metadata.taskCount}
Outcome: ${metadata.outcome || 'completed'}
Agent Summary: ${metadata.agentSummary || 'Not provided'}

The session was processed in ${stageSummaries.length} stages:

${stageSummaries.map((summary, i) => `### Stage ${i + 1}\n${summary}`).join('\n\n')}

### Tasks Tracked
${tasks.length === 0 ? '(No tasks tracked)' : tasks.map(t => {
  const emoji = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '⏳';
  return `${emoji} ${t.taskTitle}: ${t.description || 'No description'} (${t.status})`;
}).join('\n')}

Create comprehensive documentation with this structure:

## Executive Summary
(3-4 sentences covering the entire session's journey and outcome)

## Problem Statement
(What was the developer trying to solve?)

## Thinking Journey
(Describe the evolution of thought across stages - what changed, what was reconsidered)

## Key Decisions
(List 3-5 major decisions made and their reasoning)

## Outcome
(What was achieved? What's the final state?)

## Recommendations
(Based on this session, what should be done next or kept in mind?)

## Tags
(5-7 relevant tags for categorization)

Generate the documentation:`;
}

export const STAGE_SIZE = 20; // thoughts per stage

