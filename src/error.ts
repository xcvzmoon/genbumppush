export class ReleaseError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReleaseError';
    this.code = code;
  }
}
