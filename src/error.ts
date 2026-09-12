/**
 * Error thrown by genbumppush for expected release failures.
 *
 * Unlike a generic `Error`, every {@link ReleaseError} carries a stable
 * {@link ReleaseError.code} so scripts and the CLI can branch on the reason
 * (`DIRTY_WORKTREE`, `TAG_EXISTS`, `CANCELLED`, …) without parsing messages.
 *
 * @example Branch on the failure reason
 * ```ts
 * import { runRelease, ReleaseError } from 'genbumppush';
 *
 * try {
 *   await runRelease({ cwd: process.cwd(), dryRun: false, yes: true, help: false });
 * } catch (error) {
 *   if (error instanceof ReleaseError && error.code === 'CANCELLED') {
 *     process.exit(0);
 *   }
 *   throw error;
 * }
 * ```
 *
 * @example Print code and message the same way the CLI does
 * ```ts
 * if (error instanceof ReleaseError) {
 *   console.error(`[${error.code}] ${error.message}`);
 * }
 * ```
 */
export class ReleaseError extends Error {
  /** Machine-readable reason, for example `'DIRTY_WORKTREE'` or `'TAG_EXISTS'`. */
  readonly code: string;

  /**
   * @param code - Stable machine-readable reason.
   * @param message - Human-readable explanation shown to the user.
   * @param options - Optional `cause` when wrapping an underlying error.
   */
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ReleaseError';
    this.code = code;
  }
}
