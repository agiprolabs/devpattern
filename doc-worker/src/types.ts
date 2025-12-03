/**
 * Type definitions for the Documentation Worker
 * These mirror the types from the main DevPattern server
 */

export interface ThoughtRecord {
  sessionId: string;
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  branchId?: string;
  isRevision?: boolean;
  revisesThought?: number;
  timestamp: Date;
}

export interface TaskCommit {
  sessionId: string;
  taskId: string;
  taskTitle: string;
  description?: string;
  completedAtThought: number;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: Date;
  completedAt?: Date;
}

export interface Session {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'completed' | 'finalized';
  outcome?: 'completed' | 'abandoned' | 'deferred';
  thoughtCount: number;
  taskCount: number;
  tenantId?: string;
  tier?: 'basic' | 'premium';
  agentSummary?: string;
  autoFinalized?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SessionContext {
  session: Session;
  thoughts: ThoughtRecord[];
  tasks: TaskCommit[];
}

export interface DocumentationEntry {
  sessionId: string;
  generatedAt: Date;
  summary: string;
  thoughtCount: number;
  taskCount: number;
  branches: string[];
  content: string;
  // Enhanced documentation fields
  executiveSummary?: string;
  problemStatement?: string;
  approach?: string;
  outcome?: string;
  keyInsights?: string;
  tags?: string[];
}

// Redis Event Types
export interface DevPatternEvent {
  type: 'session.thought' | 'session.task_completed' | 'session.finalized' | 'session.idle_timeout';
  sessionId: string;
  tenantId?: string;
  timestamp: string;
  payload: EventPayload;
}

export interface EventPayload {
  outcome?: 'completed' | 'abandoned' | 'deferred';
  agentSummary?: string;
  thoughtCount?: number;
  taskCount?: number;
  tier?: 'basic' | 'premium';
  retryCount?: number;
  idleMinutes?: number;
}

// Parsed documentation from LLM response
export interface ParsedDocumentation {
  sessionId: string;
  content: string;
  executiveSummary: string;
  problemStatement: string;
  approach: string;
  outcome: string;
  keyInsights: string;
  tags: string[];
}

// Dead letter queue entry
export interface DeadLetterEntry {
  event: DevPatternEvent;
  error: string;
  failedAt: string;
  retryCount: number;
}

