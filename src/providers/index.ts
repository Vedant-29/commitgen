import { LLMProvider, CommitGenConfig } from '../types';
import { OllamaProvider } from './ollama';
import { OpenRouterProvider } from './openrouter';

export class ProviderFactory {
  static create(config: CommitGenConfig): LLMProvider {
    switch (config.provider) {
      case 'ollama':
        return new OllamaProvider(config);
      case 'openrouter':
        return new OpenRouterProvider(config);
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }
}

export { OllamaProvider, OpenRouterProvider };

