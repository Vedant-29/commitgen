import chalk from 'chalk';

export class Logger {
  static info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  }

  static success(message: string): void {
    console.log(chalk.green('✓'), message);
  }

  static warn(message: string): void {
    console.log(chalk.yellow('⚠'), message);
  }

  static error(message: string): void {
    console.error(chalk.red('✗'), message);
  }

  static debug(message: string, data?: any): void {
    if (process.env.DEBUG) {
      console.log(chalk.gray('⚙'), message);
      if (data) console.log(chalk.gray(JSON.stringify(data, null, 2)));
    }
  }
}