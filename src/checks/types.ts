/**
 * Types for the check system
 */

export interface CheckConfig {
  enabled: boolean;
  command: string;
  blocking: boolean; // If true, fail commit if check fails
  message?: string; // Custom message to display while running
  autofix?: string; // Command to run to auto-fix if check fails
  timeout?: number; // Timeout in milliseconds (default: 30000)
}

export interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
  error?: string;
  duration: number; // milliseconds
  autoFixAvailable: boolean;
}

export interface CheckSummary {
  totalChecks: number;
  passed: number;
  failed: number;
  skipped: number;
  results: CheckResult[];
  totalDuration: number;
}
