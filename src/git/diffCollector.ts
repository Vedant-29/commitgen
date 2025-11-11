import { execSync } from 'child_process';
import * as fs from 'fs';
import { minimatch } from 'minimatch';
import { GitError } from '../types';
import { CodeContext, CodeContextExtractor } from './codeContextExtractor';
import { HistoricalCommit, CommitHistoryRetriever } from './commitHistoryRetriever';

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  insertions: number;
  deletions: number;
}

export interface DiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface DiffContext {
  diff: string;
  filesChanged: number;
  truncated: boolean;
  stats?: DiffStats;
  files?: FileChange[];
  codeContext?: CodeContext;
  similarCommits?: HistoricalCommit[];
}

export class DiffCollector {
  private readonly maxDiffSize = 500000; // 500KB
  private readonly defaultIgnorePatterns = [
    '*-lock.*',
    '*.lock',
    'dist/*',
    'build/*',
    'node_modules/*',
    '.next/*',
    'coverage/*',
  ];

  async getStagedDiff(): Promise<DiffContext> {
    try {
      let diff = execSync('git diff --staged --no-ext-diff', {
        encoding: 'utf8',
        timeout: 10000,
      });

      // Filter files based on .commitignore
      const ignorePatterns = this.loadIgnorePatterns();
      diff = this.filterDiff(diff, ignorePatterns);

      // Check if truncated
      let truncated = false;
      if (diff.length > this.maxDiffSize) {
        diff = diff.substring(0, this.maxDiffSize) + '\n... (truncated)';
        truncated = true;
      }

      // Count files
      const filesChanged = (diff.match(/^diff --git/gm) || []).length;

      // Collect enhanced metadata
      const stats = this.getStats();
      const files = this.getFileChanges(ignorePatterns);

      // Extract code context (semantic understanding of what's being changed)
      const contextExtractor = new CodeContextExtractor();
      const codeContext = contextExtractor.extract(diff);

      // Retrieve similar commits from history
      const historyRetriever = new CommitHistoryRetriever(5);
      const changedFilePaths = files?.map((f) => f.path) || [];
      const keywords = CommitHistoryRetriever.extractKeywords(codeContext);
      const similarCommits = historyRetriever.findSimilarCommits(changedFilePaths, keywords);

      return { diff, filesChanged, truncated, stats, files, codeContext, similarCommits };
    } catch (error: any) {
      if (error instanceof Error && error.message.includes('fatal')) {
        throw new GitError('Not a git repository or no staged changes');
      }
      throw new GitError(`Failed to get staged diff: ${error}`);
    }
  }

  private getStats(): DiffStats {
    try {
      const statOutput = execSync('git diff --staged --shortstat', {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();

      // Parse: "3 files changed, 45 insertions(+), 12 deletions(-)"
      const filesMatch = statOutput.match(/(\d+)\s+files?\s+changed/);
      const insertMatch = statOutput.match(/(\d+)\s+insertions?\(/);
      const deleteMatch = statOutput.match(/(\d+)\s+deletions?\(/);

      return {
        filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
        insertions: insertMatch ? parseInt(insertMatch[1], 10) : 0,
        deletions: deleteMatch ? parseInt(deleteMatch[1], 10) : 0,
      };
    } catch {
      return { filesChanged: 0, insertions: 0, deletions: 0 };
    }
  }

  private getFileChanges(ignorePatterns: string[]): FileChange[] {
    try {
      // Get file status (A/M/D/R)
      const statusOutput = execSync('git diff --staged --name-status', {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();

      // Get per-file stats
      const numstatOutput = execSync('git diff --staged --numstat', {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();

      const statusLines = statusOutput.split('\n').filter(l => l);
      const numstatLines = numstatOutput.split('\n').filter(l => l);

      const files: FileChange[] = [];

      for (let i = 0; i < statusLines.length; i++) {
        const statusParts = statusLines[i].split('\t');
        const numstatParts = numstatLines[i]?.split('\t') || [];

        if (statusParts.length < 2) continue;

        const statusCode = statusParts[0];
        const path = statusParts[1];

        // Skip ignored files
        if (ignorePatterns.some(p => minimatch(path, p))) continue;

        const status = this.parseStatus(statusCode);
        const insertions = parseInt(numstatParts[0], 10) || 0;
        const deletions = parseInt(numstatParts[1], 10) || 0;

        files.push({ path, status, insertions, deletions });
      }

      return files;
    } catch {
      return [];
    }
  }

  private parseStatus(code: string): FileChange['status'] {
    if (code.startsWith('A')) return 'added';
    if (code.startsWith('D')) return 'deleted';
    if (code.startsWith('R')) return 'renamed';
    return 'modified';
  }

  private loadIgnorePatterns(): string[] {
    const patterns = [...this.defaultIgnorePatterns];

    // Load .commitignore if exists
    if (fs.existsSync('.commitignore')) {
      const content = fs.readFileSync('.commitignore', 'utf-8');
      const lines = content
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
      patterns.push(...lines);
    }

    return patterns;
  }

  private filterDiff(diff: string, patterns: string[]): string {
    const lines = diff.split('\n');
    const filtered: string[] = [];
    let skipCurrentFile = false;

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        // Extract filename: diff --git a/path b/path
        const match = line.match(/b\/(.+?)$/);
        if (match) {
          const currentFile = match[1];
          const shouldExclude = patterns.some(p => minimatch(currentFile, p));
          skipCurrentFile = shouldExclude;
          if (skipCurrentFile) {
            continue; // skip header line for excluded file
          }
        }
      }
      if (!skipCurrentFile) filtered.push(line);
      // Reset skip when a new file starts
      if (line.startsWith('diff --git')) {
        // already handled at the top of loop
      }
    }

    return filtered.join('\n');
  }

  async commit(message: string): Promise<void> {
    try {
      // Escape quotes and newlines
      const escapedMessage = message
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');

      execSync(`git commit -m "${escapedMessage}"`, {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error: any) {
      const errorMsg = error.stderr || error.stdout || error.message;
      throw new GitError(`Failed to create commit: ${errorMsg}`);
    }
  }

  async addAll(): Promise<void> {
    try {
      execSync('git add .', {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error: any) {
      const errorMsg = error.stderr || error.stdout || error.message;
      throw new GitError(`Failed to stage changes: ${errorMsg}`);
    }
  }

  async push(): Promise<string> {
    try {
      const output = execSync('git push', {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      return output;
    } catch (error: any) {
      const errorMsg = error.stderr || error.stdout || error.message;
      // Check for common errors
      if (errorMsg.includes('no upstream branch')) {
        throw new GitError(
          'No upstream branch set. Set upstream with:\n  git push -u origin <branch>'
        );
      }
      throw new GitError(`Failed to push: ${errorMsg}`);
    }
  }

  async isRepository(): Promise<boolean> {
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async hasStagedChanges(): Promise<boolean> {
    try {
      const output = execSync('git diff --staged --exit-code', {
        encoding: 'utf8',
      });
      return output.length > 0;
    } catch {
      // Exit code 1 means there are changes
      return true;
    }
  }
}

