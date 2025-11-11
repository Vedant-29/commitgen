/**
 * Extracts semantic code context from git diffs to help LLMs understand
 * what's actually being changed (functions, classes, variables, etc.)
 */

export interface CodeSymbol {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'constant' | 'import' | 'export';
  action: 'added' | 'modified' | 'deleted' | 'renamed';
  oldName?: string; // For renames
  file: string;
}

export interface CodeContext {
  symbols: CodeSymbol[];
  summary: string; // Human-readable summary of changes
}

export class CodeContextExtractor {
  /**
   * Extract semantic context from a git diff
   */
  extract(diff: string): CodeContext {
    const symbols: CodeSymbol[] = [];
    const lines = diff.split('\n');
    let currentFile = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track current file
      if (line.startsWith('diff --git')) {
        const match = line.match(/b\/(.+?)$/);
        if (match) currentFile = match[1];
        continue;
      }

      // Skip if no current file
      if (!currentFile) continue;

      // Analyze added lines
      if (line.startsWith('+') && !line.startsWith('+++')) {
        const cleanLine = line.substring(1).trim();
        symbols.push(...this.extractSymbolsFromLine(cleanLine, 'added', currentFile));
      }

      // Analyze deleted lines
      if (line.startsWith('-') && !line.startsWith('---')) {
        const cleanLine = line.substring(1).trim();
        symbols.push(...this.extractSymbolsFromLine(cleanLine, 'deleted', currentFile));
      }
    }

    // Detect renames (when same function/class is deleted in one place and added in another)
    this.detectRenames(symbols);

    // Detect modifications (when function/class exists in both added and deleted)
    this.detectModifications(symbols);

    return {
      symbols: this.deduplicateSymbols(symbols),
      summary: this.generateSummary(symbols),
    };
  }

  /**
   * Extract symbols from a single line of code
   */
  private extractSymbolsFromLine(
    line: string,
    action: 'added' | 'deleted',
    file: string
  ): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];

    // Function declarations
    // Matches: function foo(), async function foo(), export function foo()
    const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      symbols.push({ name: funcMatch[1], type: 'function', action, file });
    }

    // Arrow functions assigned to variables
    // Matches: const foo = () =>, export const foo = async () =>
    const arrowMatch = line.match(/(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/);
    if (arrowMatch) {
      symbols.push({ name: arrowMatch[1], type: 'function', action, file });
    }

    // Class declarations
    // Matches: class Foo, export class Foo, export default class Foo
    const classMatch = line.match(/(?:export\s+)?(?:default\s+)?class\s+(\w+)/);
    if (classMatch) {
      symbols.push({ name: classMatch[1], type: 'class', action, file });
    }

    // Interface declarations (TypeScript)
    // Matches: interface Foo, export interface Foo
    const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
    if (interfaceMatch) {
      symbols.push({ name: interfaceMatch[1], type: 'interface', action, file });
    }

    // Type declarations (TypeScript)
    // Matches: type Foo =, export type Foo =
    const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)\s*=/);
    if (typeMatch) {
      symbols.push({ name: typeMatch[1], type: 'type', action, file });
    }

    // Import statements
    // Matches: import { foo } from, import foo from
    const importMatch = line.match(/import\s+(?:\{([^}]+)\}|(\w+))\s+from/);
    if (importMatch) {
      const imports = importMatch[1] || importMatch[2];
      if (imports) {
        // For named imports, split by comma
        imports.split(',').forEach((imp) => {
          const name = imp.trim().split(/\s+as\s+/)[0].trim();
          if (name) {
            symbols.push({ name, type: 'import', action, file });
          }
        });
      }
    }

    // Const/let/var declarations (only if they look significant)
    // Avoid noise by only capturing UPPER_CASE (constants) or exported ones
    const constMatch = line.match(/(?:export\s+)?const\s+([A-Z_]+)\s*=/);
    if (constMatch) {
      symbols.push({ name: constMatch[1], type: 'constant', action, file });
    }

    return symbols;
  }

  /**
   * Detect renames by finding symbols with same name deleted and added in different files
   * or with different names in same context
   */
  private detectRenames(symbols: CodeSymbol[]): void {
    // Simple heuristic: if a symbol is deleted and another similar symbol is added,
    // it might be a rename. This is a simplified version.
    const deleted = symbols.filter((s) => s.action === 'deleted');
    const added = symbols.filter((s) => s.action === 'added');

    for (const del of deleted) {
      for (const add of added) {
        // Same type, different name, same file = likely rename
        if (
          del.type === add.type &&
          del.file === add.file &&
          del.name !== add.name &&
          this.areSimilar(del.name, add.name)
        ) {
          add.action = 'renamed';
          add.oldName = del.name;
          del.action = 'renamed'; // Mark original as renamed too
        }
      }
    }
  }

  /**
   * Detect modifications (same symbol changed)
   */
  private detectModifications(symbols: CodeSymbol[]): void {
    const symbolMap = new Map<string, CodeSymbol[]>();

    // Group by name+type+file
    for (const symbol of symbols) {
      const key = `${symbol.name}:${symbol.type}:${symbol.file}`;
      if (!symbolMap.has(key)) {
        symbolMap.set(key, []);
      }
      symbolMap.get(key)!.push(symbol);
    }

    // If same symbol appears as both added and deleted, it's modified
    for (const [_, syms] of symbolMap) {
      const hasAdded = syms.some((s) => s.action === 'added');
      const hasDeleted = syms.some((s) => s.action === 'deleted');

      if (hasAdded && hasDeleted) {
        syms.forEach((s) => {
          if (s.action !== 'renamed') {
            s.action = 'modified';
          }
        });
      }
    }
  }

  /**
   * Check if two symbol names are similar (for rename detection)
   */
  private areSimilar(name1: string, name2: string): boolean {
    // Simple similarity: check if one contains the other, or Levenshtein distance < 3
    const lower1 = name1.toLowerCase();
    const lower2 = name2.toLowerCase();

    if (lower1.includes(lower2) || lower2.includes(lower1)) {
      return true;
    }

    // Simple Levenshtein distance check
    const distance = this.levenshteinDistance(lower1, lower2);
    return distance <= 3;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Deduplicate symbols (keep unique ones)
   */
  private deduplicateSymbols(symbols: CodeSymbol[]): CodeSymbol[] {
    const seen = new Set<string>();
    const unique: CodeSymbol[] = [];

    for (const symbol of symbols) {
      const key = `${symbol.name}:${symbol.type}:${symbol.action}:${symbol.file}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(symbol);
      }
    }

    return unique;
  }

  /**
   * Generate human-readable summary of changes
   */
  private generateSummary(symbols: CodeSymbol[]): string {
    if (symbols.length === 0) {
      return 'Minor changes';
    }

    const actions = {
      added: symbols.filter((s) => s.action === 'added' && s.type !== 'import'),
      modified: symbols.filter((s) => s.action === 'modified'),
      deleted: symbols.filter((s) => s.action === 'deleted' && s.type !== 'import'),
      renamed: symbols.filter((s) => s.action === 'renamed'),
    };

    const parts: string[] = [];

    if (actions.added.length > 0) {
      const types = this.groupByType(actions.added);
      parts.push(`Added ${this.formatTypeGroup(types)}`);
    }

    if (actions.modified.length > 0) {
      const types = this.groupByType(actions.modified);
      parts.push(`Modified ${this.formatTypeGroup(types)}`);
    }

    if (actions.renamed.length > 0) {
      const types = this.groupByType(actions.renamed);
      parts.push(`Renamed ${this.formatTypeGroup(types)}`);
    }

    if (actions.deleted.length > 0) {
      const types = this.groupByType(actions.deleted);
      parts.push(`Deleted ${this.formatTypeGroup(types)}`);
    }

    return parts.join('; ');
  }

  /**
   * Group symbols by type
   */
  private groupByType(symbols: CodeSymbol[]): Map<string, string[]> {
    const map = new Map<string, string[]>();

    for (const symbol of symbols) {
      if (!map.has(symbol.type)) {
        map.set(symbol.type, []);
      }
      map.get(symbol.type)!.push(symbol.name);
    }

    return map;
  }

  /**
   * Format type groups into readable string
   */
  private formatTypeGroup(typeMap: Map<string, string[]>): string {
    const parts: string[] = [];

    for (const [type, names] of typeMap) {
      if (names.length === 1) {
        parts.push(`${type} ${names[0]}`);
      } else if (names.length <= 3) {
        parts.push(`${type}s ${names.join(', ')}`);
      } else {
        parts.push(`${names.length} ${type}s`);
      }
    }

    return parts.join(', ');
  }
}
