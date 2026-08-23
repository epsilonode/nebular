export type TeleportIssueCode =
  | 'budget-exceeded'
  | 'capability-invalid'
  | 'car-invalid'
  | 'cid-mismatch'
  | 'codec-duplicate'
  | 'codec-invalid'
  | 'decode-failed'
  | 'dependency-invalid'
  | 'execution-failed'
  | 'manifest-invalid'
  | 'migration-failed'
  | 'missing-block'
  | 'policy-rejected'
  | 'required-capability-unsupported'
  | 'signature-invalid'
  | 'unsupported-capability'
  | 'unsupported-version'
  | 'verification-failed';

export interface TeleportIssue {
  readonly code: TeleportIssueCode;
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly capabilityId?: string;
  readonly instanceId?: string;
}

export type TeleportResult<T> =
  | Readonly<{ ok: true; value: T; warnings: readonly TeleportIssue[] }>
  | Readonly<{ ok: false; issues: readonly TeleportIssue[] }>;

export const ok = <T>(value: T, warnings: readonly TeleportIssue[] = []): TeleportResult<T> => ({
  ok: true,
  value,
  warnings
});

export const err = <T = never>(...issues: readonly TeleportIssue[]): TeleportResult<T> => ({
  ok: false,
  issues
});
