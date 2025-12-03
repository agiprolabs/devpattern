/**
 * Configuration for the Documentation Worker
 * All settings are loaded from environment variables with sensible defaults
 */

export interface Config {
  // Data storage
  dataPath: string;

  // Redis connection
  redisUrl: string;

  // Anthropic API
  anthropicApiKey: string;
  basicModel: string;
  premiumModel: string;

  // Worker settings
  idleTimeoutMinutes: number;
  batchSize: number;
  batchWindowSeconds: number;
  maxRetries: number;
  retryDelays: number[]; // milliseconds

  // Health check
  healthPort: number;

  // Environment
  nodeEnv: string;
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvIntOrDefault(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function loadConfig(): Config {
  return {
    // Data storage
    dataPath: getEnvOrDefault('DATA_PATH', './data'),

    // Redis connection
    redisUrl: getEnvOrDefault('REDIS_URL', 'redis://localhost:6379'),

    // Anthropic API
    anthropicApiKey: getEnvOrThrow('ANTHROPIC_API_KEY'),
    basicModel: getEnvOrDefault('BASIC_MODEL', 'claude-3-5-haiku-20241022'),
    premiumModel: getEnvOrDefault('PREMIUM_MODEL', 'claude-3-5-sonnet-20241022'),

    // Worker settings
    idleTimeoutMinutes: getEnvIntOrDefault('IDLE_TIMEOUT_MINUTES', 10),
    batchSize: getEnvIntOrDefault('BATCH_SIZE', 5),
    batchWindowSeconds: getEnvIntOrDefault('BATCH_WINDOW_SECONDS', 30),
    maxRetries: getEnvIntOrDefault('MAX_RETRIES', 3),
    retryDelays: [5000, 30000, 120000], // 5s, 30s, 2min

    // Health check
    healthPort: getEnvIntOrDefault('HEALTH_PORT', 3002),

    // Environment
    nodeEnv: getEnvOrDefault('NODE_ENV', 'development'),
  };
}

// Lazy-loaded config singleton
let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

// Proxy for convenient access
export const config: Config = new Proxy({} as Config, {
  get(_, prop: keyof Config) {
    return getConfig()[prop];
  },
}) as Config;

