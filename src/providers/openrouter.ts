import axios, { AxiosInstance } from 'axios';
import { BaseProvider } from './base';
import { LLMMessage, GenerationOptions, OpenRouterError } from '../types';
import { Logger } from '../utils/logger';

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
    const startTime = Date.now();
    const model = options?.model || this.config.model || 'openai/gpt-3.5-turbo';
    const baseURL = this.config.baseUrl || 'https://openrouter.ai/api/v1';
    
    try {
      // Validate API key
      const apiKey = this.config.apiKey || process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        Logger.error('OpenRouter API key not found');
        throw new OpenRouterError(
          'API key not found.\n' +
          'Set it in .commitgenrc.json:\n' +
          '  "apiKey": "your-openrouter-api-key"\n' +
          'Or set environment variable:\n' +
          '  export OPENROUTER_API_KEY="your-openrouter-api-key"'
        );
      }

      Logger.info(`[OpenRouter] Starting request to ${baseURL}`);
      Logger.debug(`[OpenRouter] Model: ${model}`);
      Logger.debug(`[OpenRouter] Messages: ${messages.length} message(s)`);
      Logger.debug(`[OpenRouter] Timeout: ${this.timeout}ms`);
      
      const requestPayload = {
        model,
        messages: messages as OpenRouterMessage[],
        temperature: options?.temperature ?? this.config.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? this.config.maxTokens ?? 500,
      };
      
      Logger.debug(`[OpenRouter] Request payload: ${JSON.stringify({
        model: requestPayload.model,
        messageCount: requestPayload.messages.length,
        temperature: requestPayload.temperature,
        max_tokens: requestPayload.max_tokens,
      })}`);

      // Generate
      Logger.info(`[OpenRouter] Sending POST request to /chat/completions...`);
      const response = await this.client.post('/chat/completions', requestPayload);
      
      const elapsed = Date.now() - startTime;
      Logger.info(`[OpenRouter] Request completed in ${elapsed}ms`);

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        Logger.error('[OpenRouter] Empty response from model');
        Logger.debug(`[OpenRouter] Response data: ${JSON.stringify(response.data)}`);
        throw new OpenRouterError('Empty response from model');
      }

      Logger.debug(`[OpenRouter] Response length: ${content.length} characters`);
      return content.trim();
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      
      if (axios.isAxiosError(error)) {
        Logger.error(`[OpenRouter] Request failed after ${elapsed}ms`);
        
        // Log detailed error information
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          Logger.error(`[OpenRouter] Request timed out after ${this.timeout}ms`);
          Logger.error(`[OpenRouter] This may indicate network issues or the model is taking too long to respond`);
          throw new OpenRouterError(
            `Request timed out after ${this.timeout}ms. The model may be slow or overloaded. Try again or use a different model.`
          );
        }
        
        if (error.code === 'ECONNREFUSED') {
          Logger.error(`[OpenRouter] Connection refused to ${baseURL}`);
          throw new OpenRouterError(
            'Connection refused. Check your internet connection.'
          );
        }
        
        if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
          Logger.error(`[OpenRouter] DNS resolution failed for ${baseURL}`);
          throw new OpenRouterError(
            'DNS resolution failed. Check your internet connection.'
          );
        }
        
        if (error.response) {
          const status = error.response.status;
          const statusText = error.response.statusText;
          const responseData = error.response.data as any;
          Logger.error(`[OpenRouter] HTTP ${status} ${statusText}`);
          Logger.debug(`[OpenRouter] Response data: ${JSON.stringify(responseData)}`);
          
          if (status === 401) {
            throw new OpenRouterError(
              'Authentication failed. Check your API key.\n' +
              'Get an API key from: https://openrouter.ai/keys'
            );
          }
          if (status === 402) {
            throw new OpenRouterError(
              'Insufficient credits. Add credits at: https://openrouter.ai/credits'
            );
          }
          if (status === 429) {
            throw new OpenRouterError('Rate limit exceeded. Please try again later.');
          }
          const errorMessage = responseData?.error?.message || error.message;
          throw new OpenRouterError(`HTTP ${status}: ${errorMessage}`);
        }
        
        Logger.error(`[OpenRouter] Network error: ${error.code || error.message}`);
        const errorMessage = (error.response as any)?.data?.error?.message || error.message;
        throw new OpenRouterError(errorMessage || `Network error: ${error.code || 'Unknown error'}`);
      }
      
      Logger.error(`[OpenRouter] Unexpected error: ${error.message}`);
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
