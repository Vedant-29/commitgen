import chalk, { ChalkInstance } from 'chalk';
import { CommitGenConfig } from '../types';

export type ThemeName = 'auto' | 'dark' | 'light';

export interface UITheme {
  name: Exclude<ThemeName, 'auto'>;
  colors: {
    accent: ChalkInstance;
    heading: ChalkInstance;
    text: ChalkInstance;
    muted: ChalkInstance;
    dim: ChalkInstance;
    success: ChalkInstance;
    warning: ChalkInstance;
    error: ChalkInstance;
    info: ChalkInstance;
    border: ChalkInstance;
    link: ChalkInstance;
  };
}

export interface UISettings {
  theme?: ThemeName;
  accent?: 'cyan' | 'magenta' | 'green' | 'blue' | 'yellow';
  useGradients?: boolean;
  bannerStyle?: 'block' | 'ascii' | 'none';
  unicode?: boolean;
}

export class ThemeManager {
  private static currentTheme: UITheme;
  private static settings: Required<UISettings>;

  static init(config?: CommitGenConfig['ui']): void {
    const defaults: Required<UISettings> = {
      theme: 'auto',
      accent: 'cyan',
      useGradients: true,
      bannerStyle: 'block',
      unicode: true,
    };

    this.settings = { ...defaults, ...(config || {}) };

    const resolved: UITheme = this.buildTheme(this.settings.theme);
    this.currentTheme = resolved;
  }

  static theme(): UITheme {
    if (!this.currentTheme) {
      this.init();
    }
    return this.currentTheme;
  }

  static settingsSnapshot(): Required<UISettings> {
    if (!this.settings) this.init();
    return this.settings;
  }

  private static buildTheme(themeName: ThemeName): UITheme {
    const prefersDark = process.env.TERM_BG === 'dark' || process.env.DARK === '1';
    const base: 'dark' | 'light' =
      themeName === 'auto' ? (prefersDark ? 'dark' : 'dark') : (themeName as 'dark' | 'light');

    const accent = this.pickAccent();

    if (base === 'light') {
      return {
        name: 'light',
        colors: {
          accent,
          heading: accent.bold,
          text: chalk.black,
          muted: chalk.hex('#4b5563'),
          dim: chalk.hex('#9ca3af'),
          success: chalk.hex('#2563eb'),
          warning: chalk.hex('#b45309'),
          error: chalk.hex('#dc2626'),
          info: chalk.hex('#0284c7'),
          border: chalk.hex('#d1d5db'),
          link: accent.underline,
        },
      };
    }

    // dark
    return {
      name: 'dark',
      colors: {
        accent,
        heading: accent.bold,
        text: chalk.white,
        muted: chalk.hex('#9ca3af'),
        dim: chalk.dim,
        success: chalk.hex('#8aadf4'),
        warning: chalk.hex('#f9e2af'),
        error: chalk.hex('#f38ba8'),
        info: chalk.hex('#89dceb'),
        border: chalk.hex('#4b5563'),
        link: accent.underline,
      },
    };
  }

  private static pickAccent(): ChalkInstance {
    const accent = (this.settings?.accent || 'cyan');
    switch (accent) {
      case 'magenta':
        return chalk.magentaBright;
      case 'green':
        return chalk.greenBright;
      case 'blue':
        return chalk.blueBright;
      case 'yellow':
        return chalk.yellowBright;
      case 'cyan':
      default:
        return chalk.cyanBright;
    }
  }
}


