export class ResponseValidator {
  static parseCommitMessage(response: string): string {
    // Clean up response
    let message = (response || '').trim();

    // Remove markdown code blocks if present
    message = message.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');

    // Remove quotes if wrapped
    if ((message.startsWith('"') && message.endsWith('"')) ||
        (message.startsWith("'") && message.endsWith("'"))) {
      message = message.slice(1, -1);
    }

    // Get first line (in case multiple lines returned)
    message = message.split('\n')[0];

    // Validate conventional commit format
    if (!this.isValidCommitMessage(message)) {
      // Try to salvage it
      message = this.sanitizeMessage(message);
    }

    return message;
  }

  static parseBracketed(message: string): {
    category?: string;
    scope?: string;
    description?: string;
  } {
    const bracketRegex = /^\[(?<category>[^\]]+)\](?:\[(?<scope>[^\]]+)\])?\s+(?<desc>.+)$/;
    const match = message.match(bracketRegex);
    if (match && match.groups) {
      return {
        category: match.groups.category,
        scope: match.groups.scope,
        description: match.groups.desc,
      };
    }
    return { description: message };
  }

  private static isValidCommitMessage(message: string): boolean {
    // Basic validation: should have format or at least be reasonable length
    return (
      message.length > 3 &&
      message.length < 100 &&
      !message.includes('\n')
    );
  }

  private static sanitizeMessage(message: string): string {
    // Remove leading/trailing special characters
    message = message.replace(/^[^a-z]/i, '').trim();

    // If still invalid, use fallback
    if (!this.isValidCommitMessage(message)) {
      return 'chore: update code';
    }

    return message;
  }

  static extractConventionalCommit(message: string): {
    type?: string;
    scope?: string;
    description?: string;
  } {
    const match = message.match(/^(\w+)(?:\(([^)]+)\))?: (.+)$/);

    if (match) {
      return {
        type: match[1],
        scope: match[2],
        description: match[3],
      };
    }

    return { description: message };
  }
}

