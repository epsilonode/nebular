import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  createAuthorityWindow,
  openAuthorityRequest,
  parseAuthorityInstant,
  reduceAuthorityRequest
} from './authority-lifecycle.ts';
import { parseJournalOperationId } from './journal.ts';

type ResultLike<Value> =
  | Readonly<{ type: 'ok'; value: Value }>
  | Readonly<{ type: 'err'; issues: readonly Readonly<{ message: string }>[] }>;

const unwrap = <Value>(result: ResultLike<Value>): Value => {
  if (result.type === 'err') throw new Error(result.issues[0]?.message ?? 'Property fixture is invalid.');
  return result.value;
};

describe('authority-request reducer laws', () => {
  it('reduces expiry deterministically and makes the resulting terminal state non-replayable', () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 1_000_000 }),
      fc.integer({ min: 1, max: 86_400_000 }),
      (issuedAtMs, durationMs) => {
        const issuedAt = unwrap(parseAuthorityInstant(issuedAtMs));
        const expiresAt = unwrap(parseAuthorityInstant(issuedAtMs + durationMs));
        const opened = unwrap(openAuthorityRequest({
          operationId: unwrap(parseJournalOperationId(`property-expiry-${issuedAtMs}-${durationMs}`)),
          requestWindow: unwrap(createAuthorityWindow(issuedAt, expiresAt))
        }));
        const event = { type: 'expire' as const, at: expiresAt };

        const first = reduceAuthorityRequest(opened.state, event);
        const second = reduceAuthorityRequest(opened.state, event);
        expect(first).toEqual(second);
        expect(first).toMatchObject({
          type: 'ok',
          value: { state: { state: 'expired' }, terminal: { outcome: 'expired' } }
        });
        if (first.type === 'err') return;
        expect(reduceAuthorityRequest(first.value.state, event)).toMatchObject({
          type: 'err',
          issues: [{ code: 'request-transition-invalid' }]
        });
      }
    ));
  });
});
