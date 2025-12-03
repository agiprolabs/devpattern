/**
 * Storage interface for reading session data
 * Reads from the shared /data directory used by DevPattern
 */

import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import type { Session, ThoughtRecord, TaskCommit, DocumentationEntry, SessionContext } from './types.js';

export class Storage {
  private dataPath: string;

  constructor(dataPath: string) {
    this.dataPath = dataPath;
  }

  private getSessionsDir(): string {
    return join(this.dataPath, 'sessions');
  }

  private getSessionDir(sessionId: string): string {
    return join(this.getSessionsDir(), sessionId);
  }

  private async readJson<T>(filePath: string): Promise<T | null> {
    try {
      const data = await readFile(filePath, 'utf-8');
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  private async writeJson(filePath: string, data: unknown): Promise<void> {
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async getSession(sessionId: string): Promise<Session | null> {
    return this.readJson<Session>(join(this.getSessionDir(sessionId), 'session.json'));
  }

  async getThoughts(sessionId: string): Promise<ThoughtRecord[]> {
    const thoughts = await this.readJson<ThoughtRecord[]>(
      join(this.getSessionDir(sessionId), 'thoughts.json')
    );
    return thoughts || [];
  }

  async getTasks(sessionId: string): Promise<TaskCommit[]> {
    const tasks = await this.readJson<TaskCommit[]>(
      join(this.getSessionDir(sessionId), 'tasks.json')
    );
    return tasks || [];
  }

  async getSessionContext(sessionId: string): Promise<SessionContext | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const [thoughts, tasks] = await Promise.all([
      this.getThoughts(sessionId),
      this.getTasks(sessionId),
    ]);

    return { session, thoughts, tasks };
  }

  async getDocumentation(sessionId: string): Promise<DocumentationEntry | null> {
    return this.readJson<DocumentationEntry>(
      join(this.getSessionDir(sessionId), 'documentation.json')
    );
  }

  async saveDocumentation(doc: DocumentationEntry): Promise<void> {
    await this.writeJson(
      join(this.getSessionDir(doc.sessionId), 'documentation.json'),
      doc
    );
  }

  async updateSession(session: Session): Promise<void> {
    await this.writeJson(
      join(this.getSessionDir(session.id), 'session.json'),
      session
    );
  }

  async listActiveSessions(): Promise<Session[]> {
    const sessionsDir = this.getSessionsDir();
    const sessions: Session[] = [];

    try {
      const entries = await readdir(sessionsDir);

      for (const entry of entries) {
        const sessionPath = join(sessionsDir, entry);
        const stats = await stat(sessionPath);

        if (stats.isDirectory()) {
          const session = await this.getSession(entry);
          if (session && (session.status === 'active' || session.status === 'completed')) {
            sessions.push(session);
          }
        }
      }
    } catch {
      // Sessions directory might not exist yet
    }

    return sessions;
  }

  async getContentHash(sessionId: string): Promise<string> {
    const thoughts = await this.getThoughts(sessionId);
    const tasks = await this.getTasks(sessionId);

    const content = JSON.stringify({ thoughts, tasks });
    // Simple hash for cache invalidation
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }
}

