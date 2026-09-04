import { describe, expect, it } from 'vitest';

import type { AuthorizedExecution } from './authority.ts';
import { createOneShotSlotPool } from './one-shot-slots.ts';
import type { WindowsOneShotExecutionPorts } from './windows-one-shot-execution.ts';
import { createWindowsOneShotExecutionPort } from './windows-one-shot-execution.ts';

const profile = { kind: 'trusted-profile-root' as const, value: 'C:\\Users\\fixture\\AppData\\Local' };

const pool = () => {
  const created = createOneShotSlotPool('nebular-one-shot', 1);
  if (created.outcome === 'failure') throw new Error('invalid test pool');
  return created.value;
};

const execution = (lifecycle: 'one-shot' | 'service'): AuthorizedExecution => ({
  recipe: { admittedRecipe: { semantic: { lifecycle } } }
} as unknown as AuthorizedExecution);

const unusedPorts = (launch: WindowsOneShotExecutionPorts['launch']): WindowsOneShotExecutionPorts => ({
  launch,
  terminalWait: {} as WindowsOneShotExecutionPorts['terminalWait'],
  cleanup: {} as WindowsOneShotExecutionPorts['cleanup'],
  artifacts: {} as WindowsOneShotExecutionPorts['artifacts']
});

describe('Windows one-shot terminal execution', () => {
  it('rejects non-one-shot recipes before invoking a receiver effect', async () => {
    let launches = 0;
    const port = createWindowsOneShotExecutionPort({ pool: pool(), trustedProfileRoot: profile }, unusedPorts({
      launch: () => {
        launches += 1;
        return Promise.reject(new Error('launch must not run'));
      }
    }));

    await expect(port.executeToTerminal(execution('service'), 1_000)).resolves.toEqual({
      error: [{
        code: 'receiver-unavailable',
        message: 'This broker runtime currently admits exact Windows one-shot recipes only.'
      }]
    });
    expect(launches).toBe(0);
  });

  it('fails closed without terminal observation or cleanup when exact launch evidence is incomplete', async () => {
    let launches = 0;
    const port = createWindowsOneShotExecutionPort({ pool: pool(), trustedProfileRoot: profile }, unusedPorts({
      launch: () => {
        launches += 1;
        return Promise.resolve({
          state: 'recovery-required' as const,
          stage: 'terminal-before-containment' as const,
          attemptId: null,
          safeMessage: 'The exact Windows PM2 one-shot launch requires bounded reconciliation.',
          receipt: null
        });
      }
    }));

    await expect(port.executeToTerminal(execution('one-shot'), 1_000)).resolves.toEqual({
      error: [{
        code: 'receiver-launch-terminal-before-containment',
        message: 'The exact Windows one-shot execution could not be completed safely.'
      }]
    });
    expect(launches).toBe(1);
  });
});
