import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { ThemeManager } from './theme';

/**
 * UI utilities for consistent, beautiful CLI output
 */
export class UI {
  /**
   * Initialize theme once per process (safe to call multiple times)
   */
  static init(config?: any): void {
    ThemeManager.init(config);
  }

  private static c() {
    return ThemeManager.theme().colors;
  }

  /**
   * Create a spinner for long-running operations
   */
  static spinner(text: string): Ora {
    return ora({
      text,
      color: 'cyan',
      spinner: 'dots',
    });
  }

  /**
   * Draw a box around content
   */
  static box(content: string, title?: string): string {
    const lines = content.split('\n');
    const maxLength = Math.max(...lines.map(l => this.stripAnsi(l).length), title ? title.length + 2 : 0);
    const width = Math.min(maxLength + 4, 70);

    const top = title
      ? `${this.c().border('┌')}─ ${this.c().heading(title)} ${this.c().border('─'.repeat(Math.max(0, width - title.length - 5)))}${this.c().border('┐')}`
      : `${this.c().border('┌' + '─'.repeat(width) + '┐')}`;

    const bottom = this.c().border('└' + '─'.repeat(width) + '┘');

    const paddedLines = lines.map(line => {
      const stripped = this.stripAnsi(line);
      const padding = ' '.repeat(Math.max(0, width - stripped.length - 2));
      return `${this.c().border('│')} ${line}${padding} ${this.c().border('│')}`;
    });

    return [top, ...paddedLines, bottom].join('\n');
  }

  /**
   * Display commit message in a styled box
   */
  static commitMessage(message: string): string {
    const lines = message.split('\n').filter(l => l.trim());

    // Main message with accent
    lines.forEach((line, i) => {
      if (i === 0) {
        // First line is the title with arrow prefix
        console.log(`${this.c().accent('→')} ${this.c().heading(line)}`);
      } else {
        console.log(`  ${this.c().dim(line)}`);
      }
    });

    return message;
  }

  /**
   * Success message with checkmark
   */
  static success(message: string): void {
    console.log(`${this.c().success('✓')} ${this.c().muted(message)}`);
  }

  /**
   * Error message with X
   */
  static error(message: string): void {
    console.log(`${this.c().error('✗')} ${this.c().text(message)}`);
  }

  /**
   * Info message with icon
   */
  static info(message: string): void {
    console.log(`${this.c().info('ℹ')} ${this.c().muted(message)}`);
  }

  /**
   * Warning message
   */
  static warn(message: string): void {
    console.log(`${this.c().warning('⚠')} ${this.c().text(message)}`);
  }

  /**
   * Section header
   */
  static section(title: string): void {
    console.log('');
    console.log(this.c().heading(`▸ ${title}`));
    console.log(this.c().dim('─'.repeat(50)));
  }

  /**
   * Divider line
   */
  static divider(): void {
    console.log(this.c().dim('─'.repeat(60)));
  }

  /**
   * Step indicator (1/3, 2/3, etc.)
   */
  static step(current: number, total: number, description: string): void {
    const stepNum = this.c().heading(`[${current}/${total}]`);
    console.log(`\n${stepNum} ${description}`);
  }

  /**
   * Progress bar
   */
  static progress(current: number, total: number): string {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * 20);
    const empty = 20 - filled;

    const bar = this.c().accent('█'.repeat(filled)) + this.c().dim('░'.repeat(empty));
    return `${bar} ${this.c().heading(`${percentage}%`)}`;
  }

  /**
   * Code block display
   */
  static code(code: string, language?: string): void {
    console.log('');
    if (language) {
      console.log(this.c().dim(`  ${language}:`));
    }
    code.split('\n').forEach(line => {
      console.log(this.c().dim('  │ ') + this.c().muted(line));
    });
    console.log('');
  }

  /**
   * List item
   */
  static listItem(text: string, indent: number = 0): void {
    const indentation = '  '.repeat(indent);
    console.log(`${indentation}${this.c().dim('•')} ${text}`);
  }

  /**
   * Highlight important text
   */
  static highlight(text: string): string {
    return this.c().heading(text);
  }

  /**
   * Dim/muted text
   */
  static muted(text: string): string {
    return this.c().dim(text);
  }

  /**
   * Strip ANSI codes to get true string length
   */
  private static stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  /**
   * Banner with ASCII art
   */
  static banner(): void {
    const { useGradients, bannerStyle } = ThemeManager.settingsSnapshot();
    const colors = this.c();
    console.log('');

    if (bannerStyle === 'none') {
      console.log(colors.heading('CommitGen') + colors.dim(' - AI-Powered Git Assistant'));
      console.log('');
      return;
    }

    // Attempt gradient banner
    if (useGradients) {
      try {
        // optional deps
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const gradient = require('gradient-string');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const figlet = require('figlet');
        const text: string = figlet.textSync('COMMITGEN', {
          font: bannerStyle === 'ascii' ? 'Standard' : 'Big',
          horizontalLayout: 'default',
          verticalLayout: 'default',
        });
        console.log(gradient.atlas.multiline(text));
        console.log(colors.muted('Tips: ') + colors.link('cgen help') + colors.muted(' for commands'));
        console.log('');
        return;
      } catch {
        // fall through to simple banner
      }
    }

    console.log(colors.accent('┌─────────────────────────────────────────────────────────┐'));
    console.log(colors.accent('│') + colors.heading('  CommitGen') + colors.dim(' - AI-Powered Git Assistant           ') + colors.accent('│'));
    console.log(colors.accent('└─────────────────────────────────────────────────────────┘'));
    console.log('');
  }

  /**
   * Compact banner for status displays
   */
  static compactBanner(title: string): void {
    console.log('');
    console.log(this.c().heading(`▸ ${title}`));
    console.log(this.c().dim('━'.repeat(60)));
    console.log('');
  }
}
