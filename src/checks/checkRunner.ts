import { execSync } from 'child_process';
import { CheckConfig, CheckResult, CheckSummary } from './types';
import { Logger } from '../utils/logger';
import { UI } from '../utils/ui';
import chalk from 'chalk';

export class CheckRunner {
  private checks: Map<string, CheckConfig>;

  constructor(checksConfig: Record<string, CheckConfig>) {
    this.checks = new Map(Object.entries(checksConfig));
  }

  /**
   * Run specific checks by name
   */
  async runChecks(checkNames: string[]): Promise<CheckSummary> {
    const results: CheckResult[] = [];
    let totalDuration = 0;

    for (const checkName of checkNames) {
      const checkConfig = this.checks.get(checkName);

      if (!checkConfig) {
        UI.warn(`Check "${checkName}" not found in configuration, skipping`);
        continue;
      }

      if (!checkConfig.enabled) {
        UI.info(`Check "${checkName}" is disabled, skipping`);
        continue;
      }

      const result = await this.runSingleCheck(checkName, checkConfig);
      results.push(result);
      totalDuration += result.duration;

      // If check is blocking and failed, stop here
      if (checkConfig.blocking && !result.passed) {
        UI.error(`Blocking check "${checkName}" failed, stopping`);
        break;
      }
    }

    return this.summarizeResults(results, totalDuration);
  }

  /**
   * Run all enabled checks
   */
  async runAllChecks(): Promise<CheckSummary> {
    const enabledChecks = Array.from(this.checks.entries())
      .filter(([_, config]) => config.enabled)
      .map(([name, _]) => name);

    return this.runChecks(enabledChecks);
  }

  /**
   * Run a single check
   */
  private async runSingleCheck(
    name: string,
    config: CheckConfig
  ): Promise<CheckResult> {
    const message = config.message || `Running ${name} check...`;
    const spinner = UI.spinner(message);
    spinner.start();

    const startTime = Date.now();
    let passed = false;
    let output = '';
    let error: string | undefined;

    try {
      output = execSync(config.command, {
        encoding: 'utf8',
        timeout: config.timeout || 30000,
        stdio: 'pipe',
      });
      passed = true;
      const duration = Date.now() - startTime;
      spinner.succeed(`${name} check passed (${duration}ms)`);
    } catch (err: any) {
      passed = false;
      error = err.message;
      output = err.stdout || err.stderr || '';

      if (config.blocking) {
        spinner.fail(`${name} check failed (blocking)`);
      } else {
        spinner.warn(`${name} check failed (non-blocking)`);
      }

      // Show concise error summary (first 3 lines only)
      if (output) {
        const errorLines = output.split('\n')
          .filter(l => l.trim())
          .slice(0, 3);

        if (errorLines.length > 0) {
          console.log('');
          errorLines.forEach(line => {
            console.log(chalk.dim(`  ${line.trim()}`));
          });
        }
      }
    }

    const duration = Date.now() - startTime;

    return {
      name,
      passed,
      output,
      error,
      duration,
      autoFixAvailable: !!config.autofix,
    };
  }

  /**
   * Attempt to auto-fix a failed check
   */
  async autoFix(checkName: string): Promise<boolean> {
    const config = this.checks.get(checkName);

    if (!config || !config.autofix) {
      UI.warn(`No auto-fix available for "${checkName}"`);
      return false;
    }

    const spinner = UI.spinner(`Running auto-fix for ${checkName}...`);
    spinner.start();

    try {
      execSync(config.autofix, {
        encoding: 'utf8',
        timeout: 30000,
        stdio: 'inherit',
      });
      spinner.succeed(`Auto-fix completed for ${checkName}`);
      return true;
    } catch (err: any) {
      spinner.fail(`Auto-fix failed for ${checkName}: ${err.message}`);
      return false;
    }
  }

  /**
   * Summarize check results
   */
  private summarizeResults(
    results: CheckResult[],
    totalDuration: number
  ): CheckSummary {
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    return {
      totalChecks: results.length,
      passed,
      failed,
      skipped: 0,
      results,
      totalDuration,
    };
  }

  /**
   * Check if all blocking checks passed
   */
  canProceed(summary: CheckSummary): boolean {
    // Check if any blocking check failed
    for (const result of summary.results) {
      const config = this.checks.get(result.name);
      if (config && config.blocking && !result.passed) {
        return false;
      }
    }
    return true;
  }

  /**
   * Display check summary
   */
  displaySummary(summary: CheckSummary): void {
    // Show failed checks with details
    const failedChecks = summary.results.filter((r) => !r.passed);
    if (failedChecks.length > 0) {
      console.log(chalk.bold.red('Failed checks:'));
      for (const check of failedChecks) {
        const config = this.checks.get(check.name);
        const blocking = config?.blocking ? chalk.yellow('(blocking)') : chalk.dim('(non-blocking)');
        console.log(`  ${chalk.red('✗')} ${check.name} ${blocking}`);
        if (check.autoFixAvailable) {
          console.log(chalk.dim(`    Auto-fix available: cgen check ${check.name} --fix`));
        }
      }
    } else {
      // Success message - only show if checks passed
      UI.success('All checks passed!');
    }
  }

  /**
   * Get list of all configured checks with their status
   */
  listChecks(): Array<{ name: string; enabled: boolean; blocking: boolean }> {
    return Array.from(this.checks.entries()).map(([name, config]) => ({
      name,
      enabled: config.enabled,
      blocking: config.blocking,
    }));
  }
}
