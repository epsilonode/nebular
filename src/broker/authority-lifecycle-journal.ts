import type {
  AuthorityGrantEvent,
  AuthorityInstant,
  CommitAuthorityGrantEffect
} from './authority-lifecycle.ts';
import type { GrantJournal } from './journal.ts';

export type AuthorityGrantCommitPort = Pick<GrantJournal, 'commitWithConsent'>;

/**
 * The only effectful seam owned by the authority lifecycle slice. The pure
 * reducer emits a closed commit command; this interpreter delegates durable
 * state to the journal and returns a correlated completion event.
 */
export const commitAuthorityGrant = async (
  effect: CommitAuthorityGrantEffect,
  completedAt: AuthorityInstant,
  port: AuthorityGrantCommitPort
): Promise<AuthorityGrantEvent> => {
  const result = await port.commitWithConsent(effect.command);
  return result.type === 'ok'
    ? {
        type: 'grant-persisted',
        operationId: effect.correlationId,
        grantId: result.value.record.id,
        at: completedAt
      }
    : {
        type: 'grant-persistence-failed',
        operationId: effect.correlationId,
        grantId: effect.command.grant.id,
        at: completedAt,
        issues: result.issues
      };
};
