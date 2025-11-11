// LLM Message interface (follows OpenAI pattern)
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Provider interface
export interface LLMProvider {
  generateText(messages: LLMMessage[], options?: GenerationOptions): Promise<string>;
  validateConfig(): Promise<boolean>;
}

// Generation options
export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

// Check configuration
export interface CheckConfig {
  enabled: boolean;
  command: string;
  blocking: boolean;
  message?: string;
  autofix?: string;
  timeout?: number;
}

// Workflow configuration
export type WorkflowStep =
  | 'stage:all'
  | 'stage:prompt'
  | 'check:all'
  | 'check:build'
  | 'check:lint'
  | 'check:test'
  | 'check:typecheck'
  | 'commit:auto'
  | 'commit:review'
  | 'commit:interactive'
  | 'push'
  | 'push:prompt'
  | 'create-pr';

export interface WorkflowConfig {
  steps: WorkflowStep[];
  checks?: string[];
  interactive: boolean;
  description?: string;
}

// Prompts configuration
export interface PromptsConfig {
  askPush?: boolean;
  askStage?: boolean;
  showChecks?: boolean;
}

// Model configuration
export interface ModelConfig {
  provider: 'ollama' | 'openrouter';
  model: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

// Configuration
export interface CommitGenConfig {
  // Multi-model format
  activeModel: string;
  models: Record<string, ModelConfig>;

  // Fallback model (used if active model fails)
  fallbackModel?: string;

  // Global settings (optional, can be overridden per model)
  temperature?: number;
  maxTokens?: number;

  // Commit message settings
  language?: string;
  emoji?: boolean;

  // Check system
  checks?: Record<string, CheckConfig>;

  // Prompt behavior
  prompts?: PromptsConfig;

  // UI settings
  ui?: {
    theme?: 'auto' | 'dark' | 'light';
    accent?: 'cyan' | 'magenta' | 'green' | 'blue' | 'yellow';
    useGradients?: boolean;
    bannerStyle?: 'block' | 'ascii' | 'none';
    unicode?: boolean;
  };

  // Internal: resolved provider settings (set by ConfigManager)
  provider?: 'ollama' | 'openrouter';
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

// Error types
export class CommitGenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommitGenError';
  }
}

export class OllamaError extends CommitGenError {
  constructor(message: string) {
    super(`Ollama error: ${message}`);
    this.name = 'OllamaError';
  }
}

export class OpenRouterError extends CommitGenError {
  constructor(message: string) {
    super(`OpenRouter error: ${message}`);
    this.name = 'OpenRouterError';
  }
}

export class GitError extends CommitGenError {
  constructor(message: string) {
    super(`Git error: ${message}`);
    this.name = 'GitError';
  }
}

