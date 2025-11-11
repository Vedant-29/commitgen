#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import { ConfigManager } from '../config/configManager';
import { DiffCollector } from '../git/diffCollector';
import { ProviderFactory } from '../providers';
import { CheckRunner } from '../checks/checkRunner';
import { WorkflowRunner } from '../workflows/workflowRunner';
import { StatusDisplay } from './statusDisplay';
import { WizardMode } from './wizard';
import { Logger } from '../utils/logger';
import { UI } from '../utils/ui';

// Force color output
if (!process.env.FORCE_COLOR && process.env.NO_COLOR !== '1') {
  process.env.FORCE_COLOR = '1';
}

// Graceful exit handling for Ctrl+C and other interruptions
let isExiting = false;

// Swallow Enquirer/Node readline double-close error on Ctrl+C
process.on('uncaughtException', (err: any) => {
  const msg = String(err?.message || '');
  const code = (err && (err as any).code) || '';
  if (code === 'ERR_USE_AFTER_CLOSE' || msg.includes('readline was closed')) {
    console.log('\n');
    Logger.info('Cancelled');
    process.exit(1);
    return;
  }
  // Unknown error: rethrow to fail fast
  console.error(err);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  const msg = String((reason && (reason as any).message) || reason || '');
  const code = (reason && (reason as any).code) || '';
  if (code === 'ERR_USE_AFTER_CLOSE' || msg.includes('readline was closed')) {
    console.log('\n');
    Logger.info('Cancelled');
    process.exit(1);
    return;
  }
  console.error(reason);
  process.exit(1);
});

process.on('SIGINT', () => {
  // If a prompt is active, stdin is in raw mode; let Enquirer handle it
  const stdin: any = process.stdin as any;
  if (stdin && stdin.isRaw) {
    return;
  }
  if (isExiting) return;
  isExiting = true;
  console.log('\n');
  Logger.info('Exited');
  process.exit(0);
});

process.on('SIGTERM', () => {
  const stdin: any = process.stdin as any;
  if (stdin && stdin.isRaw) {
    return;
  }
  if (isExiting) return;
  isExiting = true;
  console.log('\n');
  Logger.info('Exited');
  process.exit(0);
});

program
  .name('cgen')
  .version('0.1.0')
  .description('AI-powered commit message generator');

// Default command: Interactive wizard
program
  .command('wizard', { isDefault: true, hidden: true })
  .description('Interactive wizard (default)')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      const config = configManager.getConfig();
      UI.init(config.ui);
      const provider = ProviderFactory.create(config);

      // Create fallback provider if configured
      let fallbackProvider;
      if (config.fallbackModel && config.fallbackModel !== config.activeModel && config.models[config.fallbackModel]) {
        const fallbackModelConfig = config.models[config.fallbackModel];
        const fallbackConfig = {
          ...config,
          provider: fallbackModelConfig.provider,
          model: fallbackModelConfig.model,
          baseUrl: fallbackModelConfig.baseUrl,
          apiKey: fallbackModelConfig.apiKey || process.env.OPENROUTER_API_KEY,
        };
        fallbackProvider = ProviderFactory.create(fallbackConfig);
      }

      const checkRunner = new CheckRunner(config.checks || {});
      const workflowRunner = new WorkflowRunner(checkRunner, provider, false, fallbackProvider);
      const wizard = new WizardMode(checkRunner, workflowRunner, config);
      await wizard.run();
    } catch (error: any) {
      if (error.message) {
        Logger.error(error.message);
      }
      process.exit(1);
    }
  });

// Check command
program
  .command('check [names...]')
  .description('Run pre-commit checks')
  .option('--all', 'Run all enabled checks')
  .option('--fix', 'Auto-fix failed checks if possible')
  .action(async (names, options) => {
    try {
      const configManager = new ConfigManager();
      const config = configManager.getConfig();
      const checkRunner = new CheckRunner(config.checks || {});

      let summary;
      if (options.all || !names || names.length === 0) {
        summary = await checkRunner.runAllChecks();
      } else {
        summary = await checkRunner.runChecks(names);
      }

      checkRunner.displaySummary(summary);

      // Auto-fix if requested
      if (options.fix && summary.failed > 0) {
        Logger.info('\nAttempting auto-fixes...');
        for (const result of summary.results) {
          if (!result.passed && result.autoFixAvailable) {
            await checkRunner.autoFix(result.name);
          }
        }
      }

      process.exit(checkRunner.canProceed(summary) ? 0 : 1);
    } catch (error: any) {
      if (error.message) {
        Logger.error(error.message);
      }
      process.exit(1);
    }
  });

// Doctor command
program
  .command('doctor')
  .description('Check system health')
  .action(async () => {
    try {
      console.log(chalk.bold('\nSystem Health Check\n'));

      const configManager = new ConfigManager();
      const config = configManager.getConfig();

      // Git check
      try {
        const diffCollector = new DiffCollector();
        const isRepo = await diffCollector.isRepository();
        if (isRepo) {
          Logger.success('✓ Git repository');
        } else {
          Logger.error('✗ Not a git repository');
        }
      } catch {
        Logger.error('✗ Git not found');
      }

      // Provider check
      try {
        const provider = ProviderFactory.create(config);
        const valid = await provider.validateConfig();
        if (valid) {
          Logger.success(`✓ ${config.provider} provider (${config.baseUrl || 'cloud'})`);
        } else {
          Logger.error(`✗ ${config.provider} provider not available`);
        }
      } catch (error: any) {
        Logger.error(`✗ Provider error: ${error.message}`);
      }

      // Model check
      Logger.info(`Active Model: ${config.activeModel || 'not set'}`);
      Logger.info(`Provider: ${config.provider || 'not set'}`);
      Logger.info(`Model: ${config.model || 'not set'}`);
      Logger.info(`Temperature: ${config.temperature || 0.2}`);

      // Check system
      const checkRunner = new CheckRunner(config.checks || {});
      const checks = checkRunner.listChecks();
      Logger.info(`\nChecks configured: ${checks.length}`);
      const enabled = checks.filter((c) => c.enabled);
      Logger.info(`  Enabled: ${enabled.length}`);

      console.log('');
    } catch (error: any) {
      if (error.message) {
        Logger.error(error.message);
      }
      process.exit(1);
    }
  });

// Models command - list all configured models
program
  .command('models')
  .description('List all configured models')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      const config = configManager.getConfig();

      console.log(chalk.bold('\nConfigured Models:\n'));

      for (const [key, modelConfig] of Object.entries(config.models)) {
        const isActive = key === config.activeModel;
        const prefix = isActive ? chalk.green('● ') : '  ';
        const name = isActive ? chalk.green.bold(key) : chalk.cyan(key);

        console.log(`${prefix}${name}`);
        console.log(`  Provider: ${modelConfig.provider}`);
        console.log(`  Model: ${modelConfig.model}`);

        if (modelConfig.provider === 'ollama') {
          console.log(`  BaseURL: ${modelConfig.baseUrl}`);

          // Check if Ollama model is installed
          try {
            const axios = require('axios');
            const response = await axios.get(`${modelConfig.baseUrl}/api/tags`, { timeout: 2000 });
            const models = response.data?.models || [];
            const installed = models.some((m: any) =>
              m.name === modelConfig.model || m.name === `${modelConfig.model}:latest`
            );
            if (installed) {
              Logger.success(`  Status: Installed ✓`);
            } else {
              Logger.warn(`  Status: Not installed (run: ollama pull ${modelConfig.model})`);
            }
          } catch {
            Logger.warn(`  Status: Unable to check (Ollama not running?)`);
          }
        }

        if (modelConfig.temperature) {
          console.log(`  Temperature: ${modelConfig.temperature}`);
        }
        if (modelConfig.maxTokens) {
          console.log(`  Max Tokens: ${modelConfig.maxTokens}`);
        }

        console.log('');
      }

      console.log(chalk.dim(`Use ${chalk.cyan('cgen use <model-name>')} to switch models\n`));
    } catch (error: any) {
      if (error.message) {
        Logger.error(error.message);
      }
      process.exit(1);
    }
  });

// Init command - create initial config file
program
  .command('init')
  .description('Create a configuration file')
  .option('-g, --global', 'Create global config in home directory')
  .option('-l, --local', 'Create local config in current directory')
  .action(async (options) => {
    try {
      const enquirer = require('enquirer');
      const fs = require('fs');
      const path = require('path');
      const os = require('os');

      // Determine config path
      let configPath: string;
      let scope: string;

      if (options.global) {
        configPath = path.join(os.homedir(), '.commitgenrc.json');
        scope = 'global';
      } else if (options.local) {
        configPath = path.join(process.cwd(), '.commitgenrc.json');
        scope = 'local';
      } else {
        // Ask user
        const { configScope } = await enquirer.prompt({
          type: 'select',
          name: 'configScope',
          message: 'Where should the config be created?',
          choices: [
            { name: 'global', message: `Global (${path.join(os.homedir(), '.commitgenrc.json')})` },
            { name: 'local', message: `Local (${path.join(process.cwd(), '.commitgenrc.json')})` }
          ]
        });
        scope = configScope;
        configPath = scope === 'global'
          ? path.join(os.homedir(), '.commitgenrc.json')
          : path.join(process.cwd(), '.commitgenrc.json');
      }

      // Check if config already exists
      if (fs.existsSync(configPath)) {
        const { overwrite } = await enquirer.prompt({
          type: 'confirm',
          name: 'overwrite',
          message: `Config already exists at ${configPath}. Overwrite?`,
          initial: false
        });

        if (!overwrite) {
          Logger.info('Cancelled');
          process.exit(0);
        }
      }

      console.log(chalk.bold('\nInitialize CommitGen Configuration\n'));

      // Prompt for initial model setup
      const answers: any = await enquirer.prompt([
        {
          type: 'select',
          name: 'provider',
          message: 'Choose your primary AI provider:',
          choices: [
            { name: 'ollama', message: 'Ollama (Local)' },
            { name: 'openrouter', message: 'OpenRouter (Cloud)' }
          ]
        },
        {
          type: 'input',
          name: 'model',
          message: 'Model identifier:',
          initial: (state: any) =>
            state.answers.provider === 'ollama' ? 'qwen2.5-coder:7b' : 'openai/gpt-4o-mini',
          validate: (input: string) => input ? true : 'Model identifier is required'
        },
        {
          type: 'input',
          name: 'baseUrl',
          message: 'Ollama base URL:',
          initial: 'http://localhost:11434',
          skip: (state: any) => state.answers.provider !== 'ollama'
        },
        {
          type: 'password',
          name: 'apiKey',
          message: 'OpenRouter API Key:',
          skip: (state: any) => state.answers.provider !== 'openrouter'
        }
      ]);

      // Create default config
      const defaultConfig: any = {
        temperature: 0.2,
        maxTokens: 500,
        language: 'en',
        emoji: false,
        ui: {
          theme: 'auto',
          accent: 'cyan',
          useGradients: true,
          bannerStyle: 'block',
          unicode: true
        },
        checks: {
          build: {
            enabled: false,
            command: 'npm run build',
            blocking: true,
            message: 'Building project...',
            timeout: 300000
          },
          lint: {
            enabled: false,
            command: 'npm run lint',
            blocking: false,
            message: 'Linting code...',
            autofix: 'npm run lint:fix',
            timeout: 60000
          },
          test: {
            enabled: false,
            command: 'npm test',
            blocking: true,
            message: 'Running tests...',
            timeout: 300000
          },
          typecheck: {
            enabled: false,
            command: 'tsc --noEmit',
            blocking: false,
            message: 'Type checking...',
            timeout: 60000
          }
        },
        prompts: {
          askPush: true,
          askStage: true,
          showChecks: true
        },
        activeModel: answers.provider === 'ollama' ? 'local-qwen' : 'cloud-gpt4o-mini',
        models: {}
      };

      // Add the configured model
      if (answers.provider === 'ollama') {
        defaultConfig.models['local-qwen'] = {
          provider: 'ollama',
          model: answers.model,
          baseUrl: answers.baseUrl
        };
      } else {
        defaultConfig.models['cloud-gpt4o-mini'] = {
          provider: 'openrouter',
          model: answers.model,
          apiKey: answers.apiKey
        };
      }

      // Write config file
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');

      Logger.success(`\n✓ Configuration created at ${chalk.cyan(configPath)}`);
      console.log(chalk.dim(`\nYou can now use ${chalk.cyan('cgen')} to generate commit messages!`));
      console.log(chalk.dim(`Add more models with ${chalk.cyan('cgen add-model')}\n`));
    } catch (error: any) {
      if (error.message && error.message !== '') {
        Logger.error(error.message);
      }
      process.exit(1);
    }
  });

// Add model command - add a new model interactively
program
  .command('add-model')
  .description('Add a new model to configuration')
  .action(async () => {
    try {
      const enquirer = require('enquirer');
      const configManager = new ConfigManager();
      const config = configManager.getConfig();

      console.log(chalk.bold('\nAdd New Model\n'));

      // Prompt for model details
      const answers: any = await enquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Model name (key):',
          validate: (input: string) => {
            if (!input) return 'Model name is required';
            if (config.models[input]) return `Model "${input}" already exists`;
            return true;
          }
        },
        {
          type: 'select',
          name: 'provider',
          message: 'Provider:',
          choices: ['ollama', 'openrouter']
        },
        {
          type: 'input',
          name: 'model',
          message: 'Model identifier:',
          validate: (input: string) => input ? true : 'Model identifier is required'
        },
        {
          type: 'input',
          name: 'baseUrl',
          message: 'Base URL:',
          initial: (state: any) => state.answers.provider === 'ollama' ? 'http://localhost:11434' : '',
          skip: (state: any) => state.answers.provider === 'openrouter'
        },
        {
          type: 'password',
          name: 'apiKey',
          message: 'API Key:',
          skip: (state: any) => state.answers.provider === 'ollama'
        },
        {
          type: 'input',
          name: 'temperature',
          message: 'Temperature (optional, 0.0-1.0):',
          initial: '',
          validate: (input: string) => {
            if (!input) return true;
            const num = parseFloat(input);
            return !isNaN(num) && num >= 0 && num <= 1 ? true : 'Must be between 0.0 and 1.0';
          }
        },
        {
          type: 'input',
          name: 'maxTokens',
          message: 'Max Tokens (optional):',
          initial: '',
          validate: (input: string) => {
            if (!input) return true;
            const num = parseInt(input);
            return !isNaN(num) && num > 0 ? true : 'Must be a positive number';
          }
        }
      ]);

      // Build model config
      const modelConfig: any = {
        provider: answers.provider,
        model: answers.model
      };

      if (answers.baseUrl) modelConfig.baseUrl = answers.baseUrl;
      if (answers.apiKey) modelConfig.apiKey = answers.apiKey;
      if (answers.temperature) modelConfig.temperature = parseFloat(answers.temperature);
      if (answers.maxTokens) modelConfig.maxTokens = parseInt(answers.maxTokens);

      // Add to config
      config.models[answers.name] = modelConfig;
      configManager.set('models', config.models);
      configManager.save();

      Logger.success(`\n✓ Model "${answers.name}" added successfully!`);
      console.log(chalk.dim(`\nUse ${chalk.cyan(`cgen use ${answers.name}`)} to activate this model\n`));
    } catch (error: any) {
      if (error.message && error.message !== '') {
        Logger.error(error.message);
      }
      process.exit(1);
    }
  });

// Use command - switch active model
program
  .command('use <model-name>')
  .description('Switch to a different model')
  .action(async (modelName: string) => {
    try {
      const configManager = new ConfigManager();
      const config = configManager.getConfig();

      if (!config.models[modelName]) {
        Logger.error(`Model "${modelName}" not found in configuration`);
        console.log(chalk.dim('\nAvailable models:'));
        for (const key of Object.keys(config.models)) {
          console.log(`  ${chalk.cyan(key)}`);
        }
        console.log(chalk.dim(`\nUse ${chalk.cyan('cgen models')} to see detailed model info\n`));
        process.exit(1);
      }

      // Update active model
      configManager.set('activeModel', modelName);
      configManager.save();

      const modelConfig = config.models[modelName];
      Logger.success(`\n✓ Switched to model "${chalk.cyan(modelName)}"`);
      console.log(chalk.dim(`  Provider: ${modelConfig.provider}`));
      console.log(chalk.dim(`  Model: ${modelConfig.model}\n`));
    } catch (error: any) {
      if (error.message) {
        Logger.error(error.message);
      }
      process.exit(1);
    }
  });

// Help text
program.addHelpText(
  'after',
  `
${chalk.bold('Commands:')}
  ${chalk.cyan('cgen')}                    ${chalk.dim('# Interactive commit wizard')}
  ${chalk.cyan('cgen init')}               ${chalk.dim('# Create configuration file')}
  ${chalk.cyan('cgen check')}              ${chalk.dim('# Run pre-commit checks')}
  ${chalk.cyan('cgen doctor')}             ${chalk.dim('# Diagnose setup issues')}
  ${chalk.cyan('cgen models')}             ${chalk.dim('# List all configured models')}
  ${chalk.cyan('cgen add-model')}          ${chalk.dim('# Add a new model')}
  ${chalk.cyan('cgen use <model>')}        ${chalk.dim('# Switch active model')}

${chalk.bold('Examples:')}
  ${chalk.dim('# First time setup (global config)')}
  $ cgen init --global

  ${chalk.dim('# Create project-specific config')}
  $ cgen init --local

  ${chalk.dim('# Interactive commit')}
  $ cgen

  ${chalk.dim('# List models and see which are installed')}
  $ cgen models

  ${chalk.dim('# Switch to a different model')}
  $ cgen use cloud-gpt

  ${chalk.dim('# Add a new model interactively')}
  $ cgen add-model

  ${chalk.dim('# Run specific checks')}
  $ cgen check build lint

${chalk.bold('Configuration:')}
  Global config: ${chalk.cyan('~/.commitgenrc.json')}
  Local config:  ${chalk.cyan('.commitgenrc.json')} (in project directory)
  See ${chalk.cyan('README.md')} for full documentation.
`
);

program.parse();
