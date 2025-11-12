import axios, { AxiosInstance } from 'axios';
import { BaseProvider } from './base';
import { LLMMessage, GenerationOptions, OpenRouterError } from '../types';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class OpenRouterProvider extends BaseProvider {
  private client: AxiosInstance;
  private timeout: number = 60000; // 60 seconds

  constructor(config: any) {
    super(config);
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://openrouter.ai/api/v1',
      timeout: this.timeout,
      headers: {
        'Authorization': `Bearer ${config.apiKey || process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://github.com/commitgen',
        'X-Title': 'CommitGen',
      },
    });
  }

  async generateText(
    messages: LLMMessage[],
    options?: GenerationOptions
  ): Promise<string> {
    try {
      // Validate API key
      const apiKey = this.config.apiKey || process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new OpenRouterError(
          'API key not found.\n' +
          'Set it in .commitgenrc.json:\n' +
          '  "apiKey": "your-openrouter-api-key"\n' +
          'Or set environment variable:\n' +
          '  export OPENROUTER_API_KEY="your-openrouter-api-key"'
        );
      }

      // Generate
      const response = await this.client.post('/chat/completions', {
        model: options?.model || this.config.model || 'openai/gpt-3.5-turbo',
        messages: messages as OpenRouterMessage[],
        temperature: options?.temperature ?? this.config.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? this.config.maxTokens ?? 500,
      });

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new OpenRouterError('Empty response from model');
      }

      return content.trim();
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          throw new OpenRouterError(
            `Request timed out after ${this.timeout}ms. The model may be slow or overloaded. Try again or use a different model.`
          );
        }
        if (error.response?.status === 401) {
          throw new OpenRouterError(
            'Authentication failed. Check your API key.\n' +
            'Get an API key from: https://openrouter.ai/keys'
          );
        }
        if (error.response?.status === 402) {
          throw new OpenRouterError(
            'Insufficient credits. Add credits at: https://openrouter.ai/credits'
          );
        }
        if (error.response?.status === 429) {
          throw new OpenRouterError('Rate limit exceeded. Please try again later.');
        }
        if (error.code === 'ECONNREFUSED') {
          throw new OpenRouterError(
            'Connection refused. Check your internet connection.'
          );
        }
        const errorMessage = error.response?.data?.error?.message || error.message;
        throw new OpenRouterError(errorMessage);
      }
      throw error;
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      const apiKey = this.config.apiKey || process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return false;
      }

      // Test the API key with a minimal request
      await this.client.get('/models');
      return true;
    } catch {
      return false;
    }
  }
}
