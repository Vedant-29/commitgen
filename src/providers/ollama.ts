import axios, { AxiosInstance } from 'axios';
import { BaseProvider } from './base';
import { LLMMessage, GenerationOptions, OllamaError } from '../types';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class OllamaProvider extends BaseProvider {
  private client: AxiosInstance;
  private timeout: number = 60000; // 60 seconds

  constructor(config: any) {
    super(config);
    this.client = axios.create({
      baseURL: config.baseUrl || 'http://localhost:11434',
      timeout: this.timeout,
    });
  }

  async generateText(
    messages: LLMMessage[],
    options?: GenerationOptions
  ): Promise<string> {
    try {
      // Health check
      await this.healthCheck();

      // Check model installed
      const installed = await this.isModelInstalled();
      if (!installed) {
        const requested = this.config.model || 'llama3.2:1b';
        throw new OllamaError(
          `Model "${requested}" not found.\n` +
          `Install a lightweight model with one of:\n` +
          `  ollama pull llama3.2:1b\n` +
          `  ollama pull tinyllama\n` +
          `Or install the requested model:\n` +
          `  ollama pull ${requested}`
        );
      }

      // Generate
      const response = await this.client.post('/api/chat', {
        model: options?.model || this.config.model || 'mistral',
        messages: messages as OllamaMessage[],
        stream: false,
        temperature: options?.temperature ?? this.config.temperature ?? 0.7,
      });

      const content = response.data?.message?.content;
      if (!content) {
        throw new OllamaError('Empty response from model');
      }

      return content.trim();
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new OllamaError(
            'Connection refused. Is Ollama running? Start with: ollama serve'
          );
        }
        throw new OllamaError(error.message);
      }
      throw error;
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      await this.healthCheck();
      return true;
    } catch {
      return false;
    }
  }

  private async healthCheck(): Promise<void> {
    try {
      await this.client.get('/api/tags', { timeout: 2000 });
    } catch (error) {
      throw new OllamaError(
        'Connection failed. Start Ollama with: ollama serve'
      );
    }
  }

  private async isModelInstalled(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/tags');
      const models = response.data?.models || [];
      const modelName = this.config.model || 'mistral';

      return models.some((m: any) => m.name === modelName || m.name === `${modelName}:latest`);
    } catch {
      return false;
    }
  }
}

