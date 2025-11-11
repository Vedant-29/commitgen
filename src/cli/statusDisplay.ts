import { DiffCollector } from '../git/diffCollector';
import { CheckRunner } from '../checks/checkRunner';
import { CommitGenConfig } from '../types';
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
    UI.compactBanner('Repository Status');
    const c = ThemeManager.theme().colors;

    let isRepository = false;
    try {
      isRepository = await this.diffCollector.isRepository();
    } catch {
      isRepository = false;
    }

    if (!isRepository) {
      UI.listItem(c.error('Not a git repository'));
      console.log('');
      return;
    }

    const branchInfo = this.getBranchSummary();
    UI.section('Git');
    if (branchInfo) {
      UI.listItem(`${c.heading('Branch')}: ${c.accent(branchInfo.branch)}`);
      if (branchInfo.ahead > 0) {
        UI.listItem(`${c.heading('Ahead')}: ${c.success(String(branchInfo.ahead))}`, 1);
      }
      if (branchInfo.behind > 0) {
        UI.listItem(`${c.heading('Behind')}: ${c.warning(String(branchInfo.behind))}`, 1);
      }
    } else {
      UI.listItem(c.warning('Unable to determine branch information'));
    }

    const workingTree = this.getFileSummary();
    UI.section('Working Tree');
    if (workingTree.error) {
      UI.listItem(c.warning('Unable to read working tree status'));
    } else if (workingTree.staged === 0 && workingTree.unstaged === 0 && workingTree.untracked === 0) {
      UI.listItem(c.muted('No changes detected'));
    } else {
      if (workingTree.staged > 0) {
        UI.listItem(`${c.heading('Staged')}: ${c.accent(String(workingTree.staged))}`);
      }
      if (workingTree.unstaged > 0) {
        UI.listItem(`${c.heading('Unstaged')}: ${c.warning(String(workingTree.unstaged))}`);
      }
      if (workingTree.untracked > 0) {
        UI.listItem(`${c.heading('Untracked')}: ${c.info(String(workingTree.untracked))}`);
      }
    }

    UI.section('Configuration');
    const activeModelName = this.config.activeModel;
    const activeModelConfig = activeModelName ? this.config.models?.[activeModelName] : undefined;
    const modelId = activeModelConfig?.model || this.config.model || 'not set';

    const activeModelDisplay = activeModelName
      ? c.accent(activeModelName)
      : c.warning('Not set');

    UI.listItem(`${c.heading('Active Model')}: ${activeModelDisplay}`);
    UI.listItem(`${c.heading('Model ID')}: ${c.accent(modelId)}`);
    UI.listItem(`${c.heading('Provider')}: ${c.accent(this.config.provider || 'not set')}`);
    UI.listItem(`${c.heading('Temperature')}: ${c.accent(String(this.config.temperature ?? 0.2))}`);

    UI.section('Checks');
    const checks = this.checkRunner.listChecks();
    const enabledChecks = checks.filter((check) => check.enabled).map((check) => check.name);

    if (checks.length === 0) {
      UI.listItem(c.muted('No checks configured'));
    } else if (enabledChecks.length === 0) {
      UI.listItem(c.warning('All checks disabled'));
    } else {
      UI.listItem(`${c.heading('Enabled')}: ${c.accent(enabledChecks.join(', '))}`);
    }

    console.log('');
    console.log(c.muted('Ready to commit? Run:'), c.accent('cgen'));
    console.log('');
  }

  /**
   * Gather git branch information
   */
  private getBranchSummary(): { branch: string; ahead: number; behind: number } | null {
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

      return {
        branch,
        ahead: parseInt(ahead, 10) || 0,
        behind: parseInt(behind, 10) || 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Summarize working tree status counts
   */
  private getFileSummary(): { staged: number; unstaged: number; untracked: number; error?: boolean } {
    try {
      const stagedOutput = execSync('git diff --staged --name-only', {
        encoding: 'utf8',
      });

      const unstagedOutput = execSync('git diff --name-only', {
        encoding: 'utf8',
      });

      const untrackedOutput = execSync('git ls-files --others --exclude-standard', {
        encoding: 'utf8',
      });

      const staged = stagedOutput.trim() ? stagedOutput.trim().split('\n').length : 0;
      const unstaged = unstagedOutput.trim() ? unstagedOutput.trim().split('\n').length : 0;
      const untracked = untrackedOutput.trim() ? untrackedOutput.trim().split('\n').length : 0;

      return { staged, unstaged, untracked };
    } catch {
      return { staged: 0, unstaged: 0, untracked: 0, error: true };
    }
  }
}
