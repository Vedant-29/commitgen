import { DiffCollector } from '../git/diffCollector';
import { CheckRunner } from '../checks/checkRunner';
import { CommitGenConfig } from '../types';
import { Logger } from '../utils/logger';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { UI } from '../utils/ui';
import { ThemeManager } from '../utils/theme';

export class StatusDisplay {
  private diffCollector: DiffCollector;
  private checkRunner: CheckRunner;
  private config: CommitGenConfig;

  constructor(config: CommitGenConfig, checkRunner: CheckRunner) {
    this.diffCollector = new DiffCollector();
    this.checkRunner = checkRunner;
    this.config = config;
  }

  /**
   * Display comprehensive repository and configuration status
   */
  async displayStatus(): Promise<void> {
    const c = ThemeManager.theme().colors;
    console.log('');
    console.log(c.accent('┌─────────────────────────────────────────────────────────┐'));
    console.log(c.heading('│  Repository Status                                       │'));
    console.log(c.accent('└─────────────────────────────────────────────────────────┘'));
    console.log('');

    // Git branch info
    this.displayBranchInfo();

    // Staged and unstaged files
    await this.displayFileStatus();

    // Configuration
    this.displayConfiguration();

    // Checks
    this.displayChecksConfig();

    console.log('');
    console.log(c.dim('Ready to commit? Run:'), c.heading('cgen'));
    console.log('');
  }

  /**
   * Display git branch information
   */
  private displayBranchInfo(): void {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf8',
      }).trim();

      const ahead = execSync(
        `git rev-list --count origin/${branch}..HEAD 2>/dev/null || echo 0`,
        { encoding: 'utf8' }
      ).trim();

      const behind = execSync(
        `git rev-list --count HEAD..origin/${branch} 2>/dev/null || echo 0`,
        { encoding: 'utf8' }
      ).trim();

      const c = ThemeManager.theme().colors;
      console.log(c.heading('Branch:'), c.accent(branch));

      if (ahead !== '0') {
        console.log(c.heading('Commits ahead:'), c.success(ahead));
      }
      if (behind !== '0') {
        console.log(c.heading('Commits behind:'), c.error(behind));
      }

      console.log('');
    } catch (error) {
      // Ignore errors (might not be a git repo)
    }
  }

  /**
   * Display file status (staged/unstaged)
   */
  private async displayFileStatus(): Promise<void> {
    try {
      // Get staged files
      const stagedOutput = execSync('git diff --staged --name-status', {
        encoding: 'utf8',
      });

      // Get unstaged files
      const unstagedOutput = execSync('git diff --name-status', {
        encoding: 'utf8',
      });

      // Get untracked files
      const untrackedOutput = execSync('git ls-files --others --exclude-standard', {
        encoding: 'utf8',
      });

      const stagedFiles = stagedOutput.trim().split('\n').filter((f) => f);
      const unstagedFiles = unstagedOutput.trim().split('\n').filter((f) => f);
      const untrackedFiles = untrackedOutput.trim().split('\n').filter((f) => f);

      const c = ThemeManager.theme().colors;

      if (stagedFiles.length > 0) {
        console.log(c.success.bold ? c.success.bold(`Staged files (${stagedFiles.length}):`) : c.success(`Staged files (${stagedFiles.length}):`));
        stagedFiles.slice(0, 10).forEach((file) => {
          const [status, ...pathParts] = file.split('\t');
          const path = pathParts.join('\t');
          const statusIcon = this.getStatusIcon(status);
          console.log(`  ${statusIcon} ${path}`);
        });
        if (stagedFiles.length > 10) {
          console.log(c.dim(`  ... and ${stagedFiles.length - 10} more`));
        }
        console.log('');
      }

      if (unstagedFiles.length > 0) {
        console.log(c.warning.bold ? c.warning.bold(`Unstaged files (${unstagedFiles.length}):`) : c.warning(`Unstaged files (${unstagedFiles.length}):`));
        unstagedFiles.slice(0, 5).forEach((file) => {
          const [status, ...pathParts] = file.split('\t');
          const path = pathParts.join('\t');
          const statusIcon = this.getStatusIcon(status);
          console.log(`  ${statusIcon} ${path}`);
        });
        if (unstagedFiles.length > 5) {
          console.log(c.dim(`  ... and ${unstagedFiles.length - 5} more`));
        }
        console.log('');
      }

      if (untrackedFiles.length > 0) {
        console.log(c.dim(`Untracked files (${untrackedFiles.length}):`));
        untrackedFiles.slice(0, 5).forEach((file) => {
          console.log(`  ${c.dim('??')} ${c.dim(file)}`);
        });
        if (untrackedFiles.length > 5) {
          console.log(c.dim(`  ... and ${untrackedFiles.length - 5} more`));
        }
        console.log('');
      }

      if (stagedFiles.length === 0 && unstagedFiles.length === 0 && untrackedFiles.length === 0) {
        console.log(c.dim('No changes detected'));
        console.log('');
      }
    } catch (error) {
      console.log(ThemeManager.theme().colors.dim('Unable to get file status'));
      console.log('');
    }
  }

  /**
   * Display configuration
   */
  private displayConfiguration(): void {
    const c = ThemeManager.theme().colors;
    console.log(c.heading('Configuration:'));
    console.log(`  Model: ${c.accent(this.config.model || 'not set')}`);
    console.log(`  Temperature: ${c.accent(this.config.temperature?.toString() || '0.2')}`);
    console.log('');
  }

  /**
   * Display checks configuration
   */
  private displayChecksConfig(): void {
    const c = ThemeManager.theme().colors;
    console.log(c.heading('Checks configured:'));

    const checks = this.checkRunner.listChecks();

    if (checks.length === 0) {
      console.log(c.dim('  No checks configured'));
    } else {
      checks.forEach((check) => {
        const icon = check.enabled ? c.success('✓') : c.error('✗');
        const blocking = check.blocking ? c.warning('(blocking)') : c.dim('(non-blocking)');
        console.log(`  ${icon} ${check.name} ${blocking}`);
      });
    }

    console.log('');
  }

  /**
   * Get status icon for file status
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'M':
        return ThemeManager.theme().colors.warning('M');
      case 'A':
        return ThemeManager.theme().colors.success('A');
      case 'D':
        return ThemeManager.theme().colors.error('D');
      case 'R':
        return ThemeManager.theme().colors.info('R');
      default:
        return ThemeManager.theme().colors.dim(status);
    }
  }
}
