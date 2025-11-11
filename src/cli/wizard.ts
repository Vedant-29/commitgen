import { prompt } from 'enquirer';
import { WorkflowRunner } from '../workflows/workflowRunner';
import { CheckRunner } from '../checks/checkRunner';
import { CommitGenConfig, WorkflowConfig } from '../types';
import { Logger } from '../utils/logger';
import { UI } from '../utils/ui';
import { StatusDisplay } from './statusDisplay';
import { ConfigManager } from '../config/configManager';
import { DiffCollector } from '../git/diffCollector';
import { execSync } from 'child_process';
import chalk from 'chalk';

export class WizardMode {
  private checkRunner: CheckRunner;
  private workflowRunner: WorkflowRunner;
  private config: CommitGenConfig;
  private diffCollector: DiffCollector;

  constructor(checkRunner: CheckRunner, workflowRunner: WorkflowRunner, config: CommitGenConfig) {
    this.checkRunner = checkRunner;
    this.workflowRunner = workflowRunner;
    this.config = config;
    this.diffCollector = new DiffCollector();
  }

  /**
   * Run the interactive wizard
   */
  async run(): Promise<void> {
    UI.init(this.config.ui);
    UI.banner();

    try {
      // Step 1: What does user want to do?
      const actionResponse: any = await prompt({
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'commit', message: 'Generate commit message (review & commit)' },
          { name: 'quick', message: 'Quick commit (auto-generate & commit & push)' },
          { name: 'status', message: 'Show repository status' },
          { name: 'config', message: 'Configure settings' },
        ],
      });

      switch (actionResponse.action) {
        case 'commit':
          await this.runCommitWizard();
          break;
        case 'quick':
          await this.runQuickWorkflow();
          break;
        case 'status':
          await this.runStatus();
          break;
        case 'config':
          await this.runConfig();
          break;
      }
    } catch (error: any) {
      // Handle user cancellation (Ctrl+C, ESC, etc.)
      if (error.message === '' || error.name === 'ExitPromptError' || error.code === 'ERR_USE_AFTER_CLOSE') {
        // Silently exit - the signal handler will show the exit message
        return;
      } else {
        UI.error(`Error: ${error.message}`);
      }
    }
  }

  /**
   * Check if there are any changes to commit (staged or unstaged)
   */
  private async checkForChanges(): Promise<boolean> {
    try {
      // Check for any changes (staged or unstaged)
      const statusOutput = execSync('git status --porcelain', {
        encoding: 'utf8',
      }).trim();

      if (!statusOutput) {
        console.log('');
        UI.info('No changes detected in your repository.');
        UI.info('Everything is clean and up to date!');
        console.log('');
        return false;
      }

      return true;
    } catch (error) {
      Logger.error('Failed to check repository status');
      return false;
    }
  }

  /**
   * Interactive commit wizard
   */
  private async runCommitWizard(): Promise<void> {
    // Early validation: check if there are any changes
    if (!(await this.checkForChanges())) {
      return;
    }

    try {
      // Step 1: Stage files?
      if (this.config.prompts?.askStage !== false) {
        const stageResponse: any = await prompt({
          type: 'confirm',
          name: 'stage',
          message: 'Stage all changes?',
          initial: true,
        });

        if (stageResponse.stage) {
          const result = await this.workflowRunner.executeWorkflow({
            steps: ['stage:all'],
            interactive: false,
            description: 'Stage files',
          });

          if (!result.success) {
            return;
          }
        }
      }

      // Step 2: Run checks?
      if (this.config.prompts?.showChecks !== false) {
        const enabledChecks = this.checkRunner
          .listChecks()
          .filter((c) => c.enabled)
          .map((c) => c.name);

        if (enabledChecks.length > 0) {
          const runChecks: any = await prompt({
            type: 'confirm',
            name: 'run',
            message: 'Run pre-commit checks?',
            initial: true,
          });

          if (runChecks.run) {
            const checkSummary = await this.checkRunner.runChecks(enabledChecks);
            this.checkRunner.displaySummary(checkSummary);

            if (!this.checkRunner.canProceed(checkSummary)) {
              UI.error('Blocking checks failed, cannot proceed');
              return;
            }
          }
        }
      }

      // Step 3: Generate and commit
      const commitResult = await this.workflowRunner.executeWorkflow({
        steps: ['commit:interactive'],
        interactive: true,
        description: 'Commit',
      });

      // If commit failed or was cancelled, don't proceed to push
      if (!commitResult.success) {
        return;
      }

      // Step 4: Push?
      if (this.config.prompts?.askPush !== false) {
        await this.workflowRunner.executeWorkflow({
          steps: ['push:prompt'],
          interactive: true,
          description: 'Push',
        });
      }
    } catch (error: any) {
      // User cancelled with Ctrl+C
      if (error.message === '' || error.name === 'ExitPromptError' || error.code === 'ERR_USE_AFTER_CLOSE') {
        throw error; // Re-throw to be caught by main try-catch in run()
      }
      throw error;
    }
  }

  /**
   * Quick workflow (no prompts)
   */
  private async runQuickWorkflow(): Promise<void> {
    // Early validation: check if there are any changes
    if (!(await this.checkForChanges())) {
      return;
    }

    const result = await this.workflowRunner.executeWorkflow({
      steps: ['stage:all', 'commit:auto', 'push'],
      interactive: false,
      description: 'Quick commit and push',
    });

    if (!result.success) {
      UI.error('Quick workflow failed');
    }
  }

  /**
   * Show repository status
   */
  private async runStatus(): Promise<void> {
    const statusDisplay = new StatusDisplay(this.config, this.checkRunner);
    await statusDisplay.displayStatus();
  }

  /**
   * Interactive configuration
   */
  private async runConfig(): Promise<void> {
    const configManager = new ConfigManager();
    const config = configManager.getConfig();

    UI.compactBanner('Configuration');

    try {
      // Main configuration menu
      const response: any = await prompt({
        type: 'select',
        name: 'category',
        message: 'What would you like to configure?',
        choices: [
          { name: 'ai', message: 'AI Model Settings' },
          { name: 'checks', message: 'Pre-commit Checks' },
          { name: 'prompts', message: 'Prompt Behavior' },
          { name: 'view', message: 'View Current Configuration' },
          { name: 'exit', message: 'Exit Configuration' },
        ],
      });

      switch (response.category) {
        case 'ai':
          await this.configureAI(configManager);
          break;
        case 'checks':
          await this.configureChecks(configManager);
          break;
        case 'prompts':
          await this.configurePrompts(configManager);
          break;
        case 'view':
          console.log('');
          console.log(chalk.bold('Current Configuration:'));
          console.log('');
          console.log(chalk.dim(JSON.stringify(config, null, 2)));
          console.log('');
          break;
        case 'exit':
          return;
      }

      // Ask if user wants to configure more
      const continueResponse: any = await prompt({
        type: 'confirm',
        name: 'continue',
        message: 'Configure more settings?',
        initial: false,
      });

      if (continueResponse.continue) {
        await this.runConfig();
      }
    } catch (error: any) {
      // Handle user cancellation (Ctrl+C, ESC, etc.)
      if (error.message === '' || error.name === 'ExitPromptError' || error.code === 'ERR_USE_AFTER_CLOSE') {
        // Silently exit - the signal handler will show the exit message
        return;
      }
    }
  }

  /**
   * Configure AI model settings
   */
  private async configureAI(configManager: ConfigManager): Promise<void> {
    const config = configManager.getConfig();

    console.log('');
    console.log(chalk.bold.cyan('AI Model Settings'));
    console.log(chalk.dim('Configure your AI provider and model preferences'));
    console.log('');

    const modelResponse: any = await prompt({
      type: 'input',
      name: 'model',
      message: 'Model name:',
      initial: config.model,
    });

    const baseUrlResponse: any = await prompt({
      type: 'input',
      name: 'baseUrl',
      message: 'Ollama base URL:',
      initial: config.baseUrl,
    });

    const temperatureResponse: any = await prompt({
      type: 'numeral',
      name: 'temperature',
      message: 'Temperature (0.0-1.0):',
      initial: config.temperature,
      min: 0,
      max: 1,
    });

    const maxTokensResponse: any = await prompt({
      type: 'numeral',
      name: 'maxTokens',
      message: 'Max tokens:',
      initial: config.maxTokens,
    });

    const emojiResponse: any = await prompt({
      type: 'confirm',
      name: 'emoji',
      message: 'Use emojis in commit messages?',
      initial: config.emoji,
    });

    // Update config
    configManager.set('model', modelResponse.model);
    configManager.set('baseUrl', baseUrlResponse.baseUrl);
    configManager.set('temperature', temperatureResponse.temperature);
    configManager.set('maxTokens', maxTokensResponse.maxTokens);
    configManager.set('emoji', emojiResponse.emoji);

    // Save
    configManager.save();
    UI.success('AI settings saved!');
    console.log('');
  }

  /**
   * Configure pre-commit checks
   */
  private async configureChecks(configManager: ConfigManager): Promise<void> {
    const config = configManager.getConfig();

    console.log('');
    console.log(chalk.bold.cyan('Pre-commit Checks'));
    console.log(chalk.dim('Enable/disable and configure checks that run before commits'));
    console.log('');

    // Build check
    const buildEnabled: any = await prompt({
      type: 'confirm',
      name: 'enabled',
      message: 'Enable build check?',
      initial: config.checks?.build?.enabled ?? true,
    });

    const buildCommand: any = await prompt({
      type: 'input',
      name: 'command',
      message: 'Build command:',
      initial: config.checks?.build?.command ?? 'npm run build',
    });

    const buildBlocking: any = await prompt({
      type: 'confirm',
      name: 'blocking',
      message: 'Should build check be blocking?',
      initial: config.checks?.build?.blocking ?? true,
    });

    // Lint check
    const lintEnabled: any = await prompt({
      type: 'confirm',
      name: 'enabled',
      message: 'Enable lint check?',
      initial: config.checks?.lint?.enabled ?? false,
    });

    const lintCommand: any = await prompt({
      type: 'input',
      name: 'command',
      message: 'Lint command:',
      initial: config.checks?.lint?.command ?? 'npm run lint',
    });

    const lintBlocking: any = await prompt({
      type: 'confirm',
      name: 'blocking',
      message: 'Should lint check be blocking?',
      initial: config.checks?.lint?.blocking ?? false,
    });

    // Test check
    const testEnabled: any = await prompt({
      type: 'confirm',
      name: 'enabled',
      message: 'Enable test check?',
      initial: config.checks?.test?.enabled ?? false,
    });

    const testCommand: any = await prompt({
      type: 'input',
      name: 'command',
      message: 'Test command:',
      initial: config.checks?.test?.command ?? 'npm test',
    });

    const testBlocking: any = await prompt({
      type: 'confirm',
      name: 'blocking',
      message: 'Should test check be blocking?',
      initial: config.checks?.test?.blocking ?? true,
    });

    // Typecheck check
    const typecheckEnabled: any = await prompt({
      type: 'confirm',
      name: 'enabled',
      message: 'Enable typecheck?',
      initial: config.checks?.typecheck?.enabled ?? false,
    });

    const typecheckCommand: any = await prompt({
      type: 'input',
      name: 'command',
      message: 'Typecheck command:',
      initial: config.checks?.typecheck?.command ?? 'tsc --noEmit',
    });

    const typecheckBlocking: any = await prompt({
      type: 'confirm',
      name: 'blocking',
      message: 'Should typecheck be blocking?',
      initial: config.checks?.typecheck?.blocking ?? false,
    });

    // Update config
    configManager.set('checks', {
      build: {
        enabled: buildEnabled.enabled,
        command: buildCommand.command,
        blocking: buildBlocking.blocking,
        message: 'Building project...',
      },
      lint: {
        enabled: lintEnabled.enabled,
        command: lintCommand.command,
        blocking: lintBlocking.blocking,
        message: 'Linting code...',
      },
      test: {
        enabled: testEnabled.enabled,
        command: testCommand.command,
        blocking: testBlocking.blocking,
        message: 'Running tests...',
      },
      typecheck: {
        enabled: typecheckEnabled.enabled,
        command: typecheckCommand.command,
        blocking: typecheckBlocking.blocking,
        message: 'Type checking...',
      },
    });

    // Save
    configManager.save();
    UI.success('Check settings saved!');
    console.log('');
  }

  /**
   * Configure prompt behavior
   */
  private async configurePrompts(configManager: ConfigManager): Promise<void> {
    const config = configManager.getConfig();

    console.log('');
    console.log(chalk.bold.cyan('Prompt Behavior'));
    console.log(chalk.dim('Configure when the tool should ask for confirmation'));
    console.log('');

    const askStage: any = await prompt({
      type: 'confirm',
      name: 'value',
      message: 'Ask before staging files?',
      initial: config.prompts?.askStage ?? true,
    });

    const showChecks: any = await prompt({
      type: 'confirm',
      name: 'value',
      message: 'Ask before running checks?',
      initial: config.prompts?.showChecks ?? true,
    });

    const askPush: any = await prompt({
      type: 'confirm',
      name: 'value',
      message: 'Ask before pushing to remote?',
      initial: config.prompts?.askPush ?? true,
    });

    // Update config
    configManager.set('prompts', {
      askStage: askStage.value,
      showChecks: showChecks.value,
      askPush: askPush.value,
    });

    // Save
    configManager.save();
    UI.success('Prompt settings saved!');
    console.log('');
  }
}
