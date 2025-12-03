/**
 * DevPattern Documentation Worker
 * Entry point for the async documentation generation service
 */

import { createServer } from 'http';
import express from 'express';
import { DocumentationWorker } from './worker.js';
import { IdleSessionScanner } from './idle-scanner.js';
import { config } from './config.js';

const VERSION = '0.1.0';

async function main() {
  console.log('🔧 DevPattern Doc Worker starting...');
  console.log(`   Version: ${VERSION}`);
  console.log(`   Data path: ${config.dataPath}`);
  console.log(`   Redis: ${config.redisUrl}`);
  console.log(`   Basic model: ${config.basicModel}`);
  console.log(`   Premium model: ${config.premiumModel}`);

  // Initialize worker
  const worker = new DocumentationWorker();
  await worker.connect();

  // Start idle session scanner
  const scanner = new IdleSessionScanner(worker);
  scanner.start();

  // Health check server
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      worker: 'devpattern-doc-worker',
      version: VERSION,
      redis: worker.isConnected() ? 'connected' : 'disconnected',
      pendingBatch: worker.getPendingCount(),
      processedTotal: worker.getProcessedCount(),
      config: {
        idleTimeoutMinutes: config.idleTimeoutMinutes,
        batchSize: config.batchSize,
        batchWindowSeconds: config.batchWindowSeconds,
      },
    });
  });

  // Metrics endpoint
  app.get('/metrics', (_req, res) => {
    res.json({
      processed: worker.getProcessedCount(),
      pending: worker.getPendingCount(),
      uptime: process.uptime(),
    });
  });

  const server = createServer(app);

  server.listen(config.healthPort, () => {
    console.log(`✅ Health endpoint: http://0.0.0.0:${config.healthPort}/health`);
    console.log(`📡 Listening for events on Redis channel: devpattern:events`);
    console.log(`⏱️  Idle timeout: ${config.idleTimeoutMinutes} minutes`);
    console.log(`📦 Batch size: ${config.batchSize}, window: ${config.batchWindowSeconds}s`);
    console.log('');
    console.log('Ready to process documentation events!');
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n🛑 Shutting down...');
    scanner.stop();
    await worker.shutdown();
    server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

