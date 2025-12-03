import { describe, it, expect } from 'vitest';
import { generateBatchPrompt, parseBatchResponse } from '../src/prompts/batch-session.js';
import { generateStagePrompt, generateSynthesisPrompt, STAGE_SIZE } from '../src/prompts/staged-summary.js';
import type { SessionContext, ThoughtRecord, TaskCommit, Session } from '../src/types.js';

describe('Batch Session Prompts', () => {
  const mockSession: Session = {
    id: 'test-session-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    status: 'finalized',
    outcome: 'completed',
    thoughtCount: 3,
    taskCount: 1,
    agentSummary: 'Implemented user authentication',
  };

  const mockThoughts: ThoughtRecord[] = [
    { sessionId: 'test-session-1', thought: 'First thought', thoughtNumber: 1, totalThoughts: 3, timestamp: new Date() },
    { sessionId: 'test-session-1', thought: 'Second thought', thoughtNumber: 2, totalThoughts: 3, timestamp: new Date() },
    { sessionId: 'test-session-1', thought: 'Final thought', thoughtNumber: 3, totalThoughts: 3, timestamp: new Date() },
  ];

  const mockTasks: TaskCommit[] = [
    { sessionId: 'test-session-1', taskId: 'task-1', taskTitle: 'Add login', status: 'completed', completedAtThought: 3, createdAt: new Date() },
  ];

  const mockSessionContext: SessionContext = {
    session: mockSession,
    thoughts: mockThoughts,
    tasks: mockTasks,
  };

  it('should generate batch prompt for multiple sessions', () => {
    const prompt = generateBatchPrompt([mockSessionContext]);

    expect(prompt).toContain('SESSION 1: test-session-1');
    expect(prompt).toContain('First thought');
    expect(prompt).toContain('Add login');
    expect(prompt).toContain('===SESSION_START:');
    expect(prompt).toContain('===SESSION_END===');
  });

  it('should parse batch response correctly', () => {
    const mockResponse = `
===SESSION_START: test-session-1===
## Executive Summary
This session implemented user authentication.

## Problem Statement
Need to add login functionality.

## Approach
Used JWT tokens for authentication.

## Outcome
Successfully implemented login.

## Key Insights
Consider adding refresh tokens.

## Tags
authentication, jwt, login
===SESSION_END===
`;

    const parsed = parseBatchResponse(mockResponse, [mockSessionContext]);

    expect(parsed.size).toBe(1);
    const doc = parsed.get('test-session-1');
    expect(doc).toBeDefined();
    expect(doc?.executiveSummary).toContain('user authentication');
    expect(doc?.tags).toContain('authentication');
    expect(doc?.tags).toContain('jwt');
  });
});

describe('Staged Summary Prompts', () => {
  it('should generate stage prompt', () => {
    const thoughts: ThoughtRecord[] = Array.from({ length: 5 }, (_, i) => ({
      sessionId: 'test',
      thought: `Thought ${i + 1}`,
      thoughtNumber: i + 1,
      totalThoughts: 5,
      timestamp: new Date(),
    }));

    const prompt = generateStagePrompt(thoughts, 1, 2);

    expect(prompt).toContain('stage 1 of 2');
    expect(prompt).toContain('5 thoughts');
    expect(prompt).toContain('Thought 1');
    expect(prompt).toContain('Thought 5');
  });

  it('should generate synthesis prompt', () => {
    const stageSummaries = ['Stage 1 explored options', 'Stage 2 made decisions'];
    const tasks: TaskCommit[] = [
      { sessionId: 'test', taskId: '1', taskTitle: 'Task 1', status: 'completed', completedAtThought: 10, createdAt: new Date() },
    ];
    const metadata: Session = {
      id: 'test-session',
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'finalized',
      thoughtCount: 40,
      taskCount: 1,
    };

    const prompt = generateSynthesisPrompt(stageSummaries, tasks, metadata);

    expect(prompt).toContain('2 stages');
    expect(prompt).toContain('Stage 1');
    expect(prompt).toContain('Stage 2');
    expect(prompt).toContain('Task 1');
    expect(prompt).toContain('## Executive Summary');
  });

  it('should have correct STAGE_SIZE', () => {
    expect(STAGE_SIZE).toBe(20);
  });
});

