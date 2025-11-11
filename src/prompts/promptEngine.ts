import { LLMMessage } from '../types';
import { DiffContext } from '../git/diffCollector';
import { CommitHistoryRetriever } from '../git/commitHistoryRetriever';

export class PromptEngine {
  buildBracketedCommitPrompt(context: DiffContext): LLMMessage[] {
    const { diff, stats, files, codeContext, similarCommits } = context;

    // Enhanced system prompt with few-shot examples showing diff→commit mapping
    const systemPrompt = `You are a commit message expert. Your task is to analyze code changes and generate ONE commit message in bracketed format.

TAG DEFINITIONS - Choose EXACTLY ONE of these 3 tags:

1. feature
   → Adds NEW functionality that didn't exist before
   → Creates NEW capabilities or user-facing behavior
   → Examples: "add login system", "implement export feature", "create API endpoint"

2. bugfix
   → Fixes BROKEN functionality or errors
   → Corrects incorrect behavior
   → Resolves crashes, errors, or issues
   → Examples: "fix login crash", "correct calculation error", "resolve memory leak"

3. refactor
   → Restructures or improves code WITHOUT changing external behavior
   → Renames, moves, or reorganizes code
   → Improves code quality, readability, or maintainability
   → Examples: "simplify validation logic", "extract utility function", "reorganize file structure"

FORMAT: [tag] description
- tag: exactly one of: feature, bugfix, refactor (lowercase)
- description: imperative mood, lowercase first letter, ≤72 chars, no period

FEW-SHOT EXAMPLES (learn from these diff→commit patterns):

Example 1:
DIFF:
+async function validateEmail(email) {
+  return /\\S+@\\S+\\.\\S+/.test(email);
+}
COMMIT: [feature] add email validation function

Example 2:
DIFF:
-const data = fetch('/api/users')
+const data = await fetch('/api/users')
COMMIT: [bugfix] add missing await to user fetch

Example 3:
DIFF:
-function getData() {
-  return db.query('SELECT * FROM users');
-}
+function fetchUsers() {
+  return db.query('SELECT * FROM users');
+}
COMMIT: [refactor] rename getData to fetchUsers

Example 4:
DIFF:
 function calculateTotal(items) {
-  return items.reduce((sum, item) => sum + item.price, 0);
+  return items.reduce((sum, item) => sum + (item.price || 0), 0);
 }
COMMIT: [bugfix] handle null prices in total calculation

Example 5:
DIFF:
+// Helper function to format dates
+function formatDate(date) {
+  return date.toISOString().split('T')[0];
+}
COMMIT: [refactor] add comment to formatDate helper

Return ONLY the final commit message line, no explanations, no code fences.`;

    // Build enhanced user prompt with chain-of-thought structure
    let userPrompt = '';

    // 1. Show similar commits from history (if available)
    if (similarCommits && similarCommits.length > 0) {
      const historyRetriever = new CommitHistoryRetriever();
      userPrompt += historyRetriever.formatForPrompt(similarCommits);
    }

    // 2. Show code context (what's being changed semantically)
    if (codeContext && codeContext.symbols.length > 0) {
      userPrompt += `CODE CONTEXT:\n`;
      userPrompt += `Summary: ${codeContext.summary}\n\n`;

      userPrompt += `Specific changes:\n`;
      for (const symbol of codeContext.symbols.slice(0, 10)) {
        const action = symbol.action.toUpperCase();
        const oldNameInfo = symbol.oldName ? ` (was: ${symbol.oldName})` : '';
        userPrompt += `- ${action}: ${symbol.type} "${symbol.name}"${oldNameInfo} in ${symbol.file}\n`;
      }
      userPrompt += `\n`;
    }

    // 3. Show file statistics
    if (stats && files && files.length > 0) {
      userPrompt += `CHANGE STATISTICS:\n`;
      userPrompt += `Files changed: ${stats.filesChanged}\n`;
      userPrompt += `Insertions: +${stats.insertions} lines\n`;
      userPrompt += `Deletions: -${stats.deletions} lines\n\n`;

      userPrompt += `FILES AFFECTED:\n`;
      for (const file of files) {
        userPrompt += `- ${file.status.toUpperCase()}: ${file.path} (+${file.insertions}/-${file.deletions})\n`;
      }
      userPrompt += `\n`;
    }

    // 4. Show the actual diff (truncated if too long for context)
    const maxDiffLength = 3000; // Reasonable size for LLM context
    let displayDiff = diff;
    let diffTruncated = false;
    if (diff.length > maxDiffLength) {
      displayDiff = diff.substring(0, maxDiffLength) + '\n... (diff truncated for brevity)';
      diffTruncated = true;
    }

    userPrompt += `DIFF DETAILS:\n\`\`\`diff\n${displayDiff}\n\`\`\`\n\n`;

    // 5. Chain-of-Thought prompting - ask model to think step by step
    userPrompt += `TASK: Analyze the changes above using this step-by-step reasoning process:

Step 1: What is the PRIMARY change?
- Look at the code context summary and specific symbols changed
- Identify the main intent of this commit

Step 2: Categorize the change:
- Is this adding NEW functionality? → [feature]
- Is this fixing BROKEN functionality? → [bugfix]
- Is this only improving/reorganizing code? → [refactor]

Step 3: Write a concise description:
- Use imperative mood (e.g., "add", "fix", "refactor", not "added" or "adding")
- Start with lowercase letter
- Keep it ≤72 characters
- Focus on WHAT and WHY, not HOW
- Be specific (mention the key function/class/file if relevant)

Now generate the commit message in format: [tag] description`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
  }
}

