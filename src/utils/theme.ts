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
          muted: chalk.hex('#666666'),
          dim: chalk.hex('#8a8a8a'),
          success: chalk.green,
          warning: chalk.hex('#b58900'),
          error: chalk.red,
          info: chalk.blue,
          border: chalk.hex('#bfbfbf'),
          link: chalk.blue.underline,
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
        muted: chalk.gray,
        dim: chalk.dim,
        success: chalk.greenBright,
        warning: chalk.yellowBright,
        error: chalk.redBright,
        info: chalk.cyanBright,
        border: chalk.gray,
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


