/**
 * Types for the workflow system
 */

export type WorkflowStep =
  | 'stage:all' // git add .
  | 'stage:prompt' // Ask which files to stage
  | 'check:all' // Run all enabled checks
  | 'check:build' // Run build check
  | 'check:lint' // Run lint check
  | 'check:test' // Run test check
  | 'check:typecheck' // Run type check
  | 'commit:auto' // Auto-commit without review
  | 'commit:review' // Commit with review prompt
  | 'commit:interactive' // Full interactive commit (accept/retry/edit)
  | 'push' // Push to remote
  | 'push:prompt' // Ask before pushing
  | 'create-pr'; // Create pull request (if gh CLI available)

export interface WorkflowConfig {
  steps: WorkflowStep[];
  checks?: string[]; // Specific checks to run (if not using check:all)
  interactive: boolean; // Show prompts vs auto-execute
  description?: string; // Description of what this workflow does
}

export interface WorkflowResult {
  success: boolean;
  stepsCompleted: number;
  totalSteps: number;
  failedStep?: string;
  error?: string;
}
