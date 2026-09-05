import type { AuthorityGrantEvent, AuthorityInstant, CommitAuthorityGrantEffect } from './authority-lifecycle.ts';
import type { GrantJournal } from './journal.ts';
export type AuthorityGrantCommitPort = Pick<GrantJournal, 'commitWithConsent'>;
/**
 * The only effectful seam owned by the authority lifecycle slice. The pure
 * reducer emits a closed commit command; this interpreter delegates durable
 * state to the journal and returns a correlated completion event.
 */
export declare const commitAuthorityGrant: (effect: CommitAuthorityGrantEffect, completedAt: AuthorityInstant, port: AuthorityGrantCommitPort) => Promise<AuthorityGrantEvent>;
