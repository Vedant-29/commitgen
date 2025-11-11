import { LLMProvider, LLMMessage, GenerationOptions, CommitGenConfig } from '../types';

export abstract class BaseProvider implements LLMProvider {
  protected config: CommitGenConfig;

  constructor(config: CommitGenConfig) {
    this.config = config;
  }

  abstract generateText(
    messages: LLMMessage[],
    options?: GenerationOptions
  ): Promise<string>;

  abstract validateConfig(): Promise<boolean>;

  protected mergeMessages(systemPrompt: string, userMessage: string): LLMMessage[] {
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];
  }
}

