/**
 * Git-spice error handling
 */

export class GitSpiceError extends Error {
  constructor(
    message: string,
    public readonly command?: string,
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = 'GitSpiceError';
  }
}
