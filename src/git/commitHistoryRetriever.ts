import { execSync } from 'child_process';

/**
 * Represents a historical commit that can be used as an example
 */
export interface HistoricalCommit {
  hash: string;
  message: string;
  files: string[];
  similarity: number; // 0-1 score of how similar it is to current changes
}

/**
 * Retrieves similar commits from git history to use as few-shot examples
 * This helps maintain consistency with the repo's existing commit message style
 */
export class CommitHistoryRetriever {
  private maxCommits: number;

  constructor(maxCommits: number = 5) {
    this.maxCommits = maxCommits;
  }

  /**
   * Find commits similar to the current staged changes
   * @param changedFiles - Files that are currently staged
   * @param keywords - Optional keywords to search for in commit messages
   * @returns Array of similar historical commits
   */
  findSimilarCommits(changedFiles: string[], keywords: string[] = []): HistoricalCommit[] {
    try {
      // Get recent commits (last 200)
      const logOutput = execSync(
        'git log -200 --pretty=format:"%H|%s" --name-only --no-merges',
        {
          encoding: 'utf8',
          timeout: 5000,
        }
      );

      const commits = this.parseGitLog(logOutput);

      // Score commits based on similarity to current changes
      const scoredCommits = commits.map((commit) => ({
        ...commit,
        similarity: this.calculateSimilarity(commit, changedFiles, keywords),
      }));

      // Sort by similarity and return top N
      return scoredCommits
        .filter((c) => c.similarity > 0)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, this.maxCommits);
    } catch (error) {
      // If git log fails, return empty array (graceful degradation)
      return [];
    }
  }

  /**
   * Parse git log output into structured commits
   */
  private parseGitLog(logOutput: string): HistoricalCommit[] {
    const commits: HistoricalCommit[] = [];
    const lines = logOutput.split('\n');

    let currentCommit: Partial<HistoricalCommit> | null = null;

    for (const line of lines) {
      if (line.includes('|')) {
        // New commit line: hash|message
        if (currentCommit && currentCommit.hash && currentCommit.message) {
          commits.push({
            hash: currentCommit.hash,
            message: currentCommit.message,
            files: currentCommit.files || [],
            similarity: 0,
          });
        }

        const [hash, message] = line.split('|');
        currentCommit = { hash, message, files: [] };
      } else if (line.trim() && currentCommit) {
        // File line
        currentCommit.files = currentCommit.files || [];
        currentCommit.files.push(line.trim());
      }
    }

    // Add last commit
    if (currentCommit && currentCommit.hash && currentCommit.message) {
      commits.push({
        hash: currentCommit.hash,
        message: currentCommit.message,
        files: currentCommit.files || [],
        similarity: 0,
      });
    }

    return commits;
  }

  /**
   * Calculate similarity score between historical commit and current changes
   * Factors:
   * 1. File overlap (0-0.6): How many files in common?
   * 2. Directory overlap (0-0.3): Same directories/modules affected?
   * 3. Keyword match (0-0.1): Keywords in commit message?
   */
  private calculateSimilarity(
    commit: HistoricalCommit,
    changedFiles: string[],
    keywords: string[]
  ): number {
    let score = 0;

    // 1. File overlap score (0-0.6)
    const fileOverlap = this.calculateFileOverlap(commit.files, changedFiles);
    score += fileOverlap * 0.6;

    // 2. Directory overlap score (0-0.3)
    const dirOverlap = this.calculateDirectoryOverlap(commit.files, changedFiles);
    score += dirOverlap * 0.3;

    // 3. Keyword match score (0-0.1)
    const keywordMatch = this.calculateKeywordMatch(commit.message, keywords);
    score += keywordMatch * 0.1;

    return score;
  }

  /**
   * Calculate overlap between two file lists (Jaccard similarity)
   */
  private calculateFileOverlap(files1: string[], files2: string[]): number {
    if (files1.length === 0 || files2.length === 0) {
      return 0;
    }

    const set1 = new Set(files1);
    const set2 = new Set(files2);

    let intersection = 0;
    for (const file of set1) {
      if (set2.has(file)) {
        intersection++;
      }
    }

    const union = set1.size + set2.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Calculate overlap between directories of changed files
   */
  private calculateDirectoryOverlap(files1: string[], files2: string[]): number {
    if (files1.length === 0 || files2.length === 0) {
      return 0;
    }

    const dirs1 = new Set(files1.map((f) => this.getDirectory(f)));
    const dirs2 = new Set(files2.map((f) => this.getDirectory(f)));

    let intersection = 0;
    for (const dir of dirs1) {
      if (dirs2.has(dir)) {
        intersection++;
      }
    }

    const union = dirs1.size + dirs2.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Extract directory from file path
   */
  private getDirectory(filePath: string): string {
    const lastSlash = filePath.lastIndexOf('/');
    if (lastSlash === -1) {
      return '.'; // Root directory
    }
    return filePath.substring(0, lastSlash);
  }

  /**
   * Calculate keyword match score
   */
  private calculateKeywordMatch(message: string, keywords: string[]): number {
    if (keywords.length === 0) {
      return 0;
    }

    const lowerMessage = message.toLowerCase();
    let matches = 0;

    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        matches++;
      }
    }

    return matches / keywords.length;
  }

  /**
   * Extract keywords from code context that might be useful for searching
   * @param codeContext - Semantic symbols from the diff
   * @returns Array of keywords to search for
   */
  static extractKeywords(codeContext: { symbols: Array<{ name: string; type: string }> }): string[] {
    const keywords: string[] = [];

    // Add symbol names as keywords (up to 5 most important ones)
    const importantSymbols = codeContext.symbols
      .filter((s) => s.type === 'function' || s.type === 'class')
      .slice(0, 5);

    for (const symbol of importantSymbols) {
      keywords.push(symbol.name);
    }

    return keywords;
  }

  /**
   * Format similar commits for inclusion in LLM prompt
   */
  formatForPrompt(commits: HistoricalCommit[]): string {
    if (commits.length === 0) {
      return '';
    }

    let formatted = 'SIMILAR COMMITS FROM THIS REPO:\n';
    formatted += '(Use these as examples of the commit message style in this repository)\n\n';

    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i];
      formatted += `${i + 1}. ${commit.message}\n`;
      formatted += `   Files: ${commit.files.slice(0, 3).join(', ')}${commit.files.length > 3 ? '...' : ''}\n`;
      formatted += `   Similarity: ${(commit.similarity * 100).toFixed(0)}%\n\n`;
    }

    return formatted;
  }
}
