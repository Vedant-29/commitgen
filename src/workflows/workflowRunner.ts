import { WorkflowConfig, WorkflowResult, WorkflowStep } from './types';
import { CheckRunner } from '../checks/checkRunner';
import { DiffCollector } from '../git/diffCollector';
import { Logger } from '../utils/logger';
import { UI } from '../utils/ui';
import { PromptEngine } from '../prompts/promptEngine';
import { LLMProvider } from '../types';
import { ResponseValidator } from '../utils/validators';
import { prompt } from 'enquirer';

export class WorkflowRunner {
  private diffCollector: DiffCollector;
  private checkRunner: CheckRunner;
  private promptEngine: PromptEngine;
  private provider: LLMProvider;
  private fallbackProvider: LLMProvider | null = null;
  private dryRun: boolean;

  constructor(
    checkRunner: CheckRunner,
    provider: LLMProvider,
    dryRun: boolean = false,
    fallbackProvider?: LLMProvider
  ) {
    this.diffCollector = new DiffCollector();
    this.checkRunner = checkRunner;
    this.promptEngine = new PromptEngine();
    this.provider = provider;
    this.fallbackProvider = fallbackProvider || null;
    this.dryRun = dryRun;
  }

  /**
   * Generate text with fallback support
   */
  private async generateTextWithFallback(messages: any[]): Promise<string> {
    try {
      return await this.provider.generateText(messages);
    } catch (error: any) {
      // If primary provider fails and fallback is available, try fallback
      if (this.fallbackProvider) {
        Logger.warn(`Primary provider failed: ${error.message}`);
        Logger.info('Attempting to use fallback model...');
        try {
          const result = await this.fallbackProvider.generateText(messages);
          Logger.success('Fallback model succeeded');
          return result;
        } catch (fallbackError: any) {
          throw new Error(`Both primary and fallback providers failed. Primary: ${error.message}, Fallback: ${fallbackError.message}`);
        }
      }
      // No fallback available, throw original error
      throw error;
    }
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(config: WorkflowConfig): Promise<WorkflowResult> {
    const startTime = Date.now();
    let stepsCompleted = 0;
    const totalSteps = config.steps.length;

    try {
      for (const step of config.steps) {
        const success = await this.executeStep(step, config);

        if (!success) {
          return {
            success: false,
            stepsCompleted,
            totalSteps,
            failedStep: step,
            error: `Step failed: ${step}`,
          };
        }

        stepsCompleted++;
      }

      return {
        success: true,
        stepsCompleted,
        totalSteps,
      };
    } catch (error: any) {
      UI.error(`Workflow failed: ${error.message}`);
      return {
        success: false,
        stepsCompleted,
        totalSteps,
        error: error.message,
      };
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(step: WorkflowStep, config: WorkflowConfig): Promise<boolean> {
    if (this.dryRun) {
      Logger.info(`[DRY RUN] Would execute: ${step}`);
      return true;
    }

    switch (step) {
      case 'stage:all':
        return this.stageAll();

      case 'stage:prompt':
        return this.stagePrompt();

      case 'check:all':
        return this.runAllChecks();

      case 'check:build':
        return this.runSpecificCheck('build');

      case 'check:lint':
        return this.runSpecificCheck('lint');

      case 'check:test':
        return this.runSpecificCheck('test');

      case 'check:typecheck':
        return this.runSpecificCheck('typecheck');

      case 'commit:auto':
        return this.commitAuto();

      case 'commit:review':
        return this.commitReview();

      case 'commit:interactive':
        return this.commitInteractive();

      case 'push':
        return this.push();

      case 'push:prompt':
        return this.pushPrompt();

      case 'create-pr':
        return this.createPR();

      default:
        Logger.warn(`Unknown step: ${step}`);
        return false;
    }
  }

  /**
   * Stage all changes
   */
  private async stageAll(): Promise<boolean> {
    try {
      const spinner = UI.spinner('Staging all changes...');
      spinner.start();
      this.diffCollector.addAll();
      spinner.succeed('Staged all changes');
      return true;
    } catch (error: any) {
      UI.error(`Failed to stage changes: ${error.message}`);
      return false;
    }
  }

  /**
   * Prompt which files to stage
   */
  private async stagePrompt(): Promise<boolean> {
    try {
      const response: any = await prompt({
        type: 'confirm',
        name: 'stage',
        message: 'Stage all changes?',
        initial: true,
      });

      if (response.stage) {
        return this.stageAll();
      }

      UI.info('Proceeding with currently staged files');
      return true;
    } catch (error: any) {
      // User cancelled - let it propagate to be handled by signal handler
      if (error.code === 'ERR_USE_AFTER_CLOSE' || error.name === 'ExitPromptError') {
        throw error;
      }
      return false;
    }
  }

  /**
   * Run all enabled checks
   */
  private async runAllChecks(): Promise<boolean> {
    const summary = await this.checkRunner.runAllChecks();
    this.checkRunner.displaySummary(summary);
    return this.checkRunner.canProceed(summary);
  }

  /**
   * Run a specific check
   */
  private async runSpecificCheck(checkName: string): Promise<boolean> {
    const summary = await this.checkRunner.runChecks([checkName]);
    return this.checkRunner.canProceed(summary);
  }

  /**
   * Auto-commit without review
   */
  private async commitAuto(): Promise<boolean> {
    try {
      const diffContext = await this.diffCollector.getStagedDiff();

      if (!diffContext.diff || diffContext.filesChanged === 0) {
        UI.error('No staged changes to commit');
        return false;
      }

      const spinner = UI.spinner('Analyzing changes and generating commit message...');
      spinner.start();

      const messages = this.promptEngine.buildBracketedCommitPrompt(diffContext);
      const response = await this.generateTextWithFallback(messages);
      const commitMessage = ResponseValidator.parseCommitMessage(response);

      spinner.stop();
      UI.commitMessage(commitMessage);

      this.diffCollector.commit(commitMessage);
      UI.success('Committed successfully');

      return true;
    } catch (error: any) {
      UI.error(`Commit failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Commit with simple review (accept/cancel)
   */
  private async commitReview(): Promise<boolean> {
    try {
      const diffContext = await this.diffCollector.getStagedDiff();

      if (!diffContext.diff || diffContext.filesChanged === 0) {
        UI.error('No staged changes to commit');
        return false;
      }

      const spinner = UI.spinner('Generating commit message with AI...');
      spinner.start();

      const messages = this.promptEngine.buildBracketedCommitPrompt(diffContext);
      const response = await this.generateTextWithFallback(messages);
      const commitMessage = ResponseValidator.parseCommitMessage(response);

      spinner.stop();
      UI.commitMessage(commitMessage);

      const answer: any = await prompt({
        type: 'confirm',
        name: 'accept',
        message: 'Accept this commit message?',
        initial: true,
      });

      if (!answer.accept) {
        UI.info('Commit cancelled');
        return false;
      }

      this.diffCollector.commit(commitMessage);
      UI.success('Committed successfully');

      return true;
    } catch (error: any) {
      UI.error(`Commit failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Interactive commit (accept/retry/edit/cancel)
   */
  private async commitInteractive(): Promise<boolean> {
    try {
      const diffContext = await this.diffCollector.getStagedDiff();

      if (!diffContext.diff || diffContext.filesChanged === 0) {
        UI.error('No staged changes to commit');
        return false;
      }

      let attempts = 0;
      const maxAttempts = 5;
      const previousMessages: string[] = [];

      while (attempts < maxAttempts) {
        attempts++;

        const spinner = UI.spinner(
          attempts === 1 ? 'Analyzing changes and generating commit message...' : 'Regenerating with different approach...'
        );
        spinner.start();

        const messages = this.promptEngine.buildBracketedCommitPrompt(diffContext);

        // Add variation instruction on retry
        if (attempts > 1 && previousMessages.length > 0) {
          messages.push({
            role: 'user',
            content: `Previous attempt(s) generated: ${previousMessages.join(', ')}. Please generate a DIFFERENT commit message with alternative wording or perspective.`
          });
        }

        const response = await this.generateTextWithFallback(messages);
        let commitMessage = ResponseValidator.parseCommitMessage(response);

        spinner.stop();
        UI.commitMessage(commitMessage);

        const answer: any = await prompt({
          type: 'select',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'accept', message: '✓ Commit with this message' },
            { name: 'retry', message: '⟳ Regenerate with different phrasing' },
            { name: 'edit', message: '✎ Edit the message manually' },
            { name: 'cancel', message: '✗ Cancel' },
          ],
        });

        if (answer.action === 'accept') {
          this.diffCollector.commit(commitMessage);
          UI.success('Committed successfully');
          return true;
        } else if (answer.action === 'edit') {
          const editAnswer: any = await prompt({
            type: 'input',
            name: 'message',
            message: 'Enter commit message:',
            initial: commitMessage,
          });
          commitMessage = editAnswer.message;
          this.diffCollector.commit(commitMessage);
          UI.success('Committed successfully');
          return true;
        } else if (answer.action === 'cancel') {
          UI.info('Commit cancelled');
          return false;
        } else if (answer.action === 'retry') {
          // Store this message to avoid repeating it
          previousMessages.push(commitMessage);
        }
        // If retry, loop continues
      }

      UI.warn('Maximum retry attempts reached');
      return false;
    } catch (error: any) {
      UI.error(`Commit failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Push to remote
   */
  private async push(): Promise<boolean> {
    const spinner = UI.spinner('Pushing to remote...');
    try {
      spinner.start();
      const output = await this.diffCollector.push();

      // Extract only the important summary (branch and status)
      const lines = output.split('\n').filter(l => l.trim());
      const importantLine = lines.find(l =>
        l.includes('->') || l.includes('branch') || l.includes('up to date')
      );

      if (importantLine) {
        spinner.succeed('Pushed to remote');
      } else {
        spinner.succeed('Pushed to remote');
      }
      return true;
    } catch (error: any) {
      spinner.fail('Push failed');
      UI.error(error.message);
      return false;
    }
  }

  /**
   * Prompt before pushing
   */
  private async pushPrompt(): Promise<boolean> {
    try {
      const answer: any = await prompt({
        type: 'confirm',
        name: 'push',
        message: 'Push to remote?',
        initial: true,
      });

      if (answer.push) {
        return this.push();
      }

      UI.info('Push skipped');
      return true; // Don't fail workflow, just skip
    } catch (error: any) {
      // User cancelled - let it propagate to be handled by signal handler
      if (error.code === 'ERR_USE_AFTER_CLOSE' || error.name === 'ExitPromptError') {
        throw error;
      }
      return true; // Other errors don't fail workflow
    }
  }

  /**
   * Create pull request (requires gh CLI)
   */
  private async createPR(): Promise<boolean> {
    UI.warn('create-pr step is not yet implemented');
    UI.info('You can manually create a PR using: gh pr create');
    return true; // Don't fail workflow
  }

  /**
   * Get human-readable description of a step
   */
  private getStepDescription(step: WorkflowStep): string {
    const descriptions: Record<WorkflowStep, string> = {
      'stage:all': 'Stage all changes (git add .)',
      'stage:prompt': 'Prompt to stage changes',
      'check:all': 'Run all enabled checks',
      'check:build': 'Run build check',
      'check:lint': 'Run lint check',
      'check:test': 'Run test suite',
      'check:typecheck': 'Run type check',
      'commit:auto': 'Generate and commit (no review)',
      'commit:review': 'Generate and commit (with review)',
      'commit:interactive': 'Interactive commit (accept/retry/edit)',
      'push': 'Push to remote',
      'push:prompt': 'Prompt before pushing',
      'create-pr': 'Create pull request',
    };
    return descriptions[step] || step;
  }
}
