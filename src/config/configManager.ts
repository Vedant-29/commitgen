import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';
import { CommitGenConfig } from '../types';

export class ConfigManager {
  private config: CommitGenConfig;
  private configPath: string;

  constructor() {
    this.loadEnvFiles();
    this.configPath = this.findConfigPath();
    this.config = this.loadConfig();
  }

  private loadEnvFiles(): void {
    // Load .env files from multiple locations (in order of precedence):
    // 1. Home directory (user-wide, lower priority) - loaded first
    // 2. Current working directory (project-specific, highest priority) - loaded second, overrides home
    // Later files override earlier ones, so cwd .env takes precedence
    
    const homeEnv = path.join(os.homedir(), '.env');
    const cwdEnv = path.join(process.cwd(), '.env');
    
    // Load home .env first (won't override existing env vars)
    if (fs.existsSync(homeEnv)) {
      dotenv.config({ path: homeEnv, override: false });
    }
    
    // Load cwd .env second (will override home .env values)
    if (fs.existsSync(cwdEnv)) {
      dotenv.config({ path: cwdEnv, override: true });
    }
  }

  private findConfigPath(): string {
    // Check local config first (project-specific overrides)
    const localCandidates = [
      path.join(process.cwd(), '.commitgenrc.json'),
      path.join(process.cwd(), '.commitgenrc'),
    ];

    for (const candidate of localCandidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // Fallback to global config (user-wide defaults)
    const globalCandidates = [
      path.join(os.homedir(), '.commitgenrc.json'),
      path.join(os.homedir(), '.commitgenrc'),
    ];

    for (const candidate of globalCandidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // If no config found, default to global config location
    return path.join(os.homedir(), '.commitgenrc.json');
  }

  private loadConfig(): CommitGenConfig {
    // Defaults
    const defaults = {
      temperature: 0.2,
      maxTokens: 500,
      language: 'en',
      emoji: false,
      ui: {
        theme: 'auto',
        accent: 'cyan',
        useGradients: true,
        bannerStyle: 'block',
        unicode: true,
      },
      checks: {
        build: {
          enabled: true,
          command: 'npm run build',
          blocking: true,
          message: 'Building project...',
        },
        lint: {
          enabled: false,
          command: 'npm run lint',
          blocking: false,
          message: 'Linting code...',
        },
        test: {
          enabled: false,
          command: 'npm test',
          blocking: true,
          message: 'Running tests...',
        },
        typecheck: {
          enabled: false,
          command: 'tsc --noEmit',
          blocking: false,
          message: 'Type checking...',
        },
      },
      prompts: {
        askPush: true,
        askStage: true,
        showChecks: true,
      },
    };

    // Load from config file
    let fileConfig: Partial<CommitGenConfig> = {};
    const configPath = this.configPath;
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        fileConfig = JSON.parse(content);
      } catch (e) {
        throw new Error(`Failed to parse ${configPath}: ${e}`);
      }
    } else {
      const isGlobalPath = configPath.startsWith(os.homedir());
      throw new Error(
        `Configuration file not found at ${configPath}\n\n` +
        `To use commitgen globally, create a global config:\n` +
        `  ${path.join(os.homedir(), '.commitgenrc.json')}\n\n` +
        `Or create a project-specific config:\n` +
        `  ${path.join(process.cwd(), '.commitgenrc.json')}\n\n` +
        `Run 'cgen init' to create a ${isGlobalPath ? 'global' : 'local'} config file.`
      );
    }

    if (!fileConfig.models || !fileConfig.activeModel) {
      throw new Error(
        `Invalid configuration: "models" and "activeModel" are required.\n` +
        `See documentation for configuration format.`
      );
    }

    // Merge defaults with file config
    let config = {
      ...defaults,
      ...fileConfig,
      checks: { ...defaults.checks, ...fileConfig.checks },
      prompts: { ...defaults.prompts, ...fileConfig.prompts },
      ui: { ...defaults.ui, ...(fileConfig as any).ui },
    } as CommitGenConfig;

    // Allow activeModel override from environment
    if (process.env.COMMITGEN_ACTIVE_MODEL) {
      config.activeModel = process.env.COMMITGEN_ACTIVE_MODEL;
    }

    // Resolve active model
    const activeModelConfig = config.models[config.activeModel];

    if (!activeModelConfig) {
      throw new Error(
        `Active model "${config.activeModel}" not found in models configuration.\n` +
        `Available models: ${Object.keys(config.models).join(', ')}`
      );
    }

    // Merge active model config with global settings
    // Model-specific settings override global settings
    config.provider = activeModelConfig.provider;
    config.model = activeModelConfig.model;
    config.baseUrl = activeModelConfig.baseUrl;
    // Prefer environment variable so users can override secret without editing files
    config.apiKey = process.env.OPENROUTER_API_KEY || activeModelConfig.apiKey;
    config.temperature = activeModelConfig.temperature ?? config.temperature;
    config.maxTokens = activeModelConfig.maxTokens ?? config.maxTokens;

    return config;
  }

  getConfig(): CommitGenConfig {
    return { ...this.config };
  }

  get<K extends keyof CommitGenConfig>(key: K): CommitGenConfig[K] {
    return this.config[key];
  }

  set<K extends keyof CommitGenConfig>(key: K, value: CommitGenConfig[K]): void {
    (this.config as any)[key] = value as any;
  }

  save(): void {
    fs.writeFileSync(
      this.configPath,
      JSON.stringify(this.config, null, 2),
      'utf-8'
    );
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.models) {
      errors.push('models configuration is required');
      return { valid: false, errors };
    }

    if (!this.config.activeModel) {
      errors.push('activeModel is required');
      return { valid: false, errors };
    }

    if (!this.config.models[this.config.activeModel]) {
      errors.push(`activeModel "${this.config.activeModel}" not found in models configuration`);
      errors.push(`Available models: ${Object.keys(this.config.models).join(', ')}`);
      return { valid: false, errors };
    }

    // Validate each model configuration
    for (const [key, modelConfig] of Object.entries(this.config.models)) {
      if (!modelConfig.provider) {
        errors.push(`models.${key}: provider is required`);
      }
      if (!modelConfig.model) {
        errors.push(`models.${key}: model is required`);
      }
      if (modelConfig.provider === 'ollama' && !modelConfig.baseUrl) {
        errors.push(`models.${key}: ollama provider requires baseUrl`);
      }
      if (modelConfig.provider === 'openrouter') {
        const apiKey = modelConfig.apiKey || this.config.apiKey || process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          errors.push(`models.${key}: openrouter provider requires apiKey (set in model config or OPENROUTER_API_KEY env var)`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

