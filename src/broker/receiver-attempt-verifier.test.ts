import { describe, expect, it, vi } from 'vitest';

import {
  parseCheckedInRecipeLocator,
  parseJournalOperationId,
  parseProcessIncarnation,
  parseReceiverCorrelation,
  parseReceiverEntryIdentity,
  parseRedactedPlanDigest,
  type BootstrapAttemptJournalRecord,
  type JournalResult
} from './journal.ts';
import {
  createCurrentReceiverAttemptVerifier,
  type BootstrapReceiverAttemptVerifierPorts
} from './receiver-attempt-verifier.ts';
import {
  parseCanonicalRepository,
  parseGrantId,
  parseProcessAttemptId,
  parseReceiverId,
  parseRecipeRevision
} from './primitives.ts';
import type { BrokerResult } from './result.ts';

const unwrapBroker = <Value>(result: BrokerResult<Value>): Value => {
  if (result.isErr()) throw new Error('expected valid broker primitive fixture');
  return result.value;
};

const unwrapJournal = <Value>(result: JournalResult<Value>): Value => {
  if (result.type === 'err') throw new Error('expected valid journal primitive fixture');
  return result.value;
};

const attempt = (): BootstrapAttemptJournalRecord => ({
  id: unwrapBroker(parseProcessAttemptId('attempt-1')),
  reserveOperationId: unwrapJournal(parseJournalOperationId('reserve-attempt-1')),
  repository: unwrapBroker(parseCanonicalRepository('R:/Code/example')),
  recipeRevision: unwrapBroker(parseRecipeRevision('recipe-revision-1')),
  planDigest: unwrapJournal(parseRedactedPlanDigest('plan-1')),
  lifecycle: 'one-shot',
  receiverCorrelation: unwrapJournal(parseReceiverCorrelation('pm2:nebular-example')),
  state: 'materializing',
  stateVersion: 3,
  createdAtMs: 900,
  updatedAtMs: 950,
  bootstrapBinding: {
    format: 'bootstrap-attempt-binding/v2',
    bindingGeneration: 2,
    grantId: unwrapBroker(parseGrantId('grant-1')),
    grantGeneration: 3,
    receiverId: unwrapBroker(parseReceiverId('pm2')),
    receiverEntryIdentity: unwrapJournal(parseReceiverEntryIdentity('pm2-entry:nebular-example')),
    helperParentProcessId: 4_100,
    helperParentProcessIncarnation: unwrapJournal(parseProcessIncarnation('windows-process-v1-parent-a')),
    recipeLocator: unwrapJournal(parseCheckedInRecipeLocator('.nebular/recipe.xml'))
  }
});

const receiverFact = (
  factOverrides: Readonly<Record<string, unknown>> = {},
  ownershipOverrides: Readonly<Record<string, unknown>> = {}
) => ({
  format: 'bootstrap-receiver-attempt-projection/v1',
  receiverId: 'pm2',
  receiverEntryIdentity: {
    kind: 'receiver-entry-identity',
    value: 'pm2-entry:nebular-example'
  },
  receiverCorrelation: {
    kind: 'receiver-correlation',
    value: 'pm2:nebular-example'
  },
  processId: 4_100,
  lifecycleState: 'online',
  ownership: {
    processAttemptId: 'attempt-1',
    repository: 'R:/Code/example',
    recipeRevision: 'recipe-revision-1',
    grantId: 'grant-1',
    grantGeneration: 3,
    bindingGeneration: 2,
    ...ownershipOverrides
  },
  ...factOverrides
});

const receiverResolved = (
  factOverrides: Readonly<Record<string, unknown>> = {},
  ownershipOverrides: Readonly<Record<string, unknown>> = {}
) => ({ status: 'resolved', fact: receiverFact(factOverrides, ownershipOverrides) });

const ports = (
  overrides: Partial<BootstrapReceiverAttemptVerifierPorts> = {}
): BootstrapReceiverAttemptVerifierPorts => ({
  brokerProcess: {
    readCurrentProcess: () => Promise.resolve({
      status: 'resolved',
      processId: 8_200,
      parentProcessId: 4_100
    })
  },
  receiverAttempts: {
    readStrictProjection: () => Promise.resolve(receiverResolved())
  },
  processIncarnations: {
    readCurrentIncarnation: () => Promise.resolve({
      status: 'running',
      processId: 4_100,
      incarnation: { kind: 'process-incarnation', value: 'windows-process-v1-parent-a' }
    })
  },
  ...overrides
});

const expectDenied = async (
  verifierPorts: BootstrapReceiverAttemptVerifierPorts,
  currentAttempt: BootstrapAttemptJournalRecord = attempt(),
  timeoutMs: number = 100
): Promise<void> => {
  const result = await createCurrentReceiverAttemptVerifier(verifierPorts, timeoutMs)
    .verifyCurrentAttempt(currentAttempt);
  expect(result.isErr()).toBe(true);
  if (result.isErr()) {
    expect(result.error).toEqual([expect.objectContaining({
      code: 'bootstrap-rejected',
      message: expect.stringMatching(
        /^Current managed process authority could not be verified \([a-z-]+\)\.$/u
      )
    })]);
  }
};

describe('current receiver attempt verifier', () => {
  it('joins only durable attempt locators to exact receiver, broker-parent, and Windows incarnation facts', async () => {
    const readProjection = vi.fn(() => Promise.resolve(receiverResolved()));
    const readIncarnation = vi.fn(() => Promise.resolve({
      status: 'running',
      processId: 4_100,
      incarnation: { kind: 'process-incarnation', value: 'windows-process-v1-parent-a' }
    }));
    const result = await createCurrentReceiverAttemptVerifier(ports({
      receiverAttempts: { readStrictProjection: readProjection },
      processIncarnations: { readCurrentIncarnation: readIncarnation }
    })).verifyCurrentAttempt(attempt());

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        state: 'verified-current-attempt',
        processAttemptId: 'attempt-1',
        repository: 'R:/Code/example',
        recipeRevision: 'recipe-revision-1',
        grantId: 'grant-1',
        grantGeneration: 3,
        receiverId: 'pm2',
        bindingGeneration: 2,
        receiverEntryIdentity: { kind: 'receiver-entry-identity', value: 'pm2-entry:nebular-example' },
        helperParentProcessId: 4_100,
        helperParentProcessIncarnation: {
          kind: 'process-incarnation',
          value: 'windows-process-v1-parent-a'
        },
        recipeLocator: { kind: 'checked-in-recipe-locator', value: '.nebular/recipe.xml' }
      });
    }
    expect(readProjection).toHaveBeenCalledWith({
      format: 'bootstrap-receiver-attempt-query/v1',
      receiverId: 'pm2',
      receiverEntryIdentity: { kind: 'receiver-entry-identity', value: 'pm2-entry:nebular-example' }
    });
    expect(readIncarnation).toHaveBeenCalledWith({ processId: 4_100 });
  });

  it('rejects direct-parent drift before asking the receiver or opening a process handle', async () => {
    const readProjection = vi.fn(() => Promise.resolve(receiverResolved()));
    const readIncarnation = vi.fn(() => Promise.resolve({ status: 'missing', processId: 4_100 }));
    await expectDenied(ports({
      brokerProcess: {
        readCurrentProcess: () => Promise.resolve({
          status: 'resolved',
          processId: 8_200,
          parentProcessId: 4_101
        })
      },
      receiverAttempts: { readStrictProjection: readProjection },
      processIncarnations: { readCurrentIncarnation: readIncarnation }
    }));

    expect(readProjection).not.toHaveBeenCalled();
    expect(readIncarnation).not.toHaveBeenCalled();
  });

  it.each([
    receiverResolved({ receiverId: 'different-receiver' }),
    receiverResolved({ receiverEntryIdentity: 'pm2-entry:reused' }),
    receiverResolved({ receiverCorrelation: 'pm2:different-correlation' }),
    receiverResolved({ processId: 4_101 }),
    receiverResolved({}, { processAttemptId: 'different-attempt' }),
    receiverResolved({}, { repository: 'R:/Code/different' }),
    receiverResolved({}, { recipeRevision: 'different-revision' }),
    receiverResolved({}, { grantId: 'different-grant' }),
    receiverResolved({}, { grantGeneration: 4 }),
    receiverResolved({}, { bindingGeneration: 3 }),
    receiverResolved({ lifecycleState: 'stopping' }),
    receiverResolved({ lifecycleState: 'stopped' }),
    receiverResolved({ lifecycleState: 'errored' })
  ])('rejects receiver identity, ownership, process, or lifecycle drift', async observation => {
    await expectDenied(ports({
      receiverAttempts: { readStrictProjection: () => Promise.resolve(observation) }
    }));
  });

  it.each([
    { status: 'missing' },
    { status: 'ambiguous' },
    { status: 'unavailable' },
    { status: 'resolved', fact: { ...receiverFact(), environment: { TOKEN: 'secret-canary' } } },
    { status: 'resolved', fact: { ...receiverFact(), lifecycleState: 'online', extra: 'secret-canary' } }
  ])('rejects missing, ambiguous, unavailable, or non-strict receiver projections', async observation => {
    const verifier = ports({
      receiverAttempts: { readStrictProjection: () => Promise.resolve(observation) }
    });
    const result = await createCurrentReceiverAttemptVerifier(verifier).verifyCurrentAttempt(attempt());
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(JSON.stringify(result.error)).not.toContain('secret-canary');
  });

  it.each([
    { status: 'running', processId: 4_101, incarnation: { kind: 'process-incarnation', value: 'windows-process-v1-parent-a' } },
    { status: 'running', processId: 4_100, incarnation: { kind: 'process-incarnation', value: 'windows-process-v1-reused' } },
    { status: 'stopped', processId: 4_100 },
    { status: 'missing', processId: 4_100 },
    { status: 'inaccessible', processId: 4_100 },
    { status: 'unavailable', processId: 4_100 }
  ])('rejects a missing, stopped, inaccessible, or PID-reused parent process', async observation => {
    await expectDenied(ports({
      processIncarnations: { readCurrentIncarnation: () => Promise.resolve(observation) }
    }));
  });

  it('admits launching only while the durable attempt is materializing', async () => {
    const launching = ports({
      receiverAttempts: {
        readStrictProjection: () => Promise.resolve(receiverResolved({ lifecycleState: 'launching' }))
      }
    });
    expect((await createCurrentReceiverAttemptVerifier(launching).verifyCurrentAttempt(attempt())).isOk()).toBe(true);
    await expectDenied(launching, { ...attempt(), state: 'running' });
  });

  it('fails closed for terminal durable state without invoking host capabilities', async () => {
    const readCurrentProcess = vi.fn(() => Promise.resolve({ status: 'unavailable' }));
    await expectDenied(ports({ brokerProcess: { readCurrentProcess } }), {
      ...attempt(),
      state: 'succeeded'
    });
    expect(readCurrentProcess).not.toHaveBeenCalled();
  });

  it('bounds hung, rejected, and synchronously throwing foreign effects with one redacted denial', async () => {
    const cases: readonly BootstrapReceiverAttemptVerifierPorts[] = [
      ports({ brokerProcess: { readCurrentProcess: () => new Promise(() => undefined) } }),
      ports({ receiverAttempts: { readStrictProjection: () => Promise.reject(new Error('secret-canary')) } }),
      ports({ processIncarnations: { readCurrentIncarnation: () => { throw new Error('secret-canary'); } } })
    ];
    const startedAt = Date.now();
    await Promise.all(cases.map(candidate => expectDenied(candidate, attempt(), 20)));
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });
});
