import { describe, expect, it } from 'vitest';

import {
  FOUR_ARTIFACT_E2E_FORMAT,
  e2eErr,
  e2eOk,
  type FourArtifactE2eProductionPort
} from './four-artifact-e2e-contract.ts';
import {
  fourArtifactE2ePublicJson,
  runFourArtifactBrokerE2e,
  runFourArtifactE2ePreflight,
  type FourArtifactE2eWorkspacePort
} from './four-artifact-e2e-harness.ts';
import type {
  CommittedFourArtifactE2eWorkspace,
  PreparedFourArtifactE2eWorkspace
} from './four-artifact-e2e-workspace.ts';

const prepared: PreparedFourArtifactE2eWorkspace = {
  authorityDatabasePath: 'C:\\Temp\\nebular-e2e\\authority.sqlite3',
  brokerEntrypointPath: 'C:\\Temp\\nebular-e2e\\repo\\broker-e2e-broker.ts',
  bridgeEntrypointPath: 'C:\\Temp\\nebular-e2e\\repo\\bridge.ts',
  commandTemporaryDirectory: 'C:\\Temp\\nebular-e2e\\command-temp',
  gitExecutablePath: 'C:\\Program Files\\Git\\cmd\\git.exe',
  installedPackageRoot: 'C:\\Temp\\nebular-e2e\\repo\\node_modules\\@epsilonode\\nebular',
  packageTarballPath: 'C:\\Temp\\nebular-e2e\\package\\nebular.tgz',
  receiptDirectory: 'C:\\Temp\\nebular-e2e\\receipts',
  recipePath: 'C:\\Temp\\nebular-e2e\\repo\\recipes\\broker-e2e.xml',
  recipeTemplate: '<recipe />',
  repositoryPath: 'C:\\Temp\\nebular-e2e\\repo',
  targetEntrypointPath: 'C:\\Temp\\nebular-e2e\\repo\\broker-e2e-target.ts',
  targetBootstrapReceiptPath:
    'C:\\Temp\\nebular-e2e\\repo\\.nebular-e2e\\target-bootstrap-terminal.json',
  targetFirstEffectReceiptPath:
    'C:\\Temp\\nebular-e2e\\repo\\.nebular-e2e\\target-first-effect.json',
  targetReceiptPath: 'C:\\Temp\\nebular-e2e\\repo\\.nebular-e2e\\target-receipt.json',
  temporaryRoot: 'C:\\Temp\\nebular-four-artifact-e2e-fixture',
  trustedProfileRoot: 'C:\\Users\\fixture\\AppData\\Local'
};

const committed: CommittedFourArtifactE2eWorkspace = {
  ...prepared,
  committedRecipe: {
    format: FOUR_ARTIFACT_E2E_FORMAT,
    proof: 'committed-recipe-admitted',
    lifecycle: 'one-shot',
    receiver: 'pm2',
    credentialSlotCount: 1
  }
};

const workspacePort = (
  calls: string[],
  overrides: Partial<FourArtifactE2eWorkspacePort> = {}
): FourArtifactE2eWorkspacePort => ({
  prepare: () => {
    calls.push('workspace.prepare');
    return Promise.resolve(e2eOk(prepared));
  },
  commitRecipe: (_workspace, digest) => {
    calls.push(`workspace.commit:${digest}`);
    return Promise.resolve(e2eOk(committed));
  },
  provisionCanary: () => {
    calls.push('canary.provision');
    return Promise.resolve(e2eOk({
      format: FOUR_ARTIFACT_E2E_FORMAT,
      proof: 'temporary-keychain-canary-stored',
      expectedSha256: 'a'.repeat(64)
    }));
  },
  deleteCanary: () => {
    calls.push('canary.delete');
    return Promise.resolve(e2eOk({
      format: FOUR_ARTIFACT_E2E_FORMAT,
      proof: 'temporary-keychain-canary-absent'
    }));
  },
  cleanup: () => {
    calls.push('workspace.cleanup');
    return Promise.resolve(e2eOk({ temporaryWorkspace: 'absent' }));
  },
  ...overrides
});

const productionPort = (
  calls: string[],
  overrides: Partial<FourArtifactE2eProductionPort> = {}
): FourArtifactE2eProductionPort => ({
  inspectReadiness: input => {
    calls.push('production.readiness');
    expect(input).not.toHaveProperty('credentialReference');
    expect(input).not.toHaveProperty('grantId');
    expect(input).not.toHaveProperty('pm2ProcessName');
    expect(input.targetBootstrapReceiptPath).toBe(prepared.targetBootstrapReceiptPath);
    expect(input.targetFirstEffectReceiptPath).toBe(prepared.targetFirstEffectReceiptPath);
    expect(input.targetReceiptPath).toBe(prepared.targetReceiptPath);
    return Promise.resolve(e2eOk({ ready: true }));
  },
  materializeBrokerComposition: () => {
    calls.push('production.composition');
    return Promise.resolve(e2eOk({ materialized: true }));
  },
  runToTerminalAndCleanup: () => {
    calls.push('production.execute');
    return Promise.resolve(e2eOk({
      targetReceipt: { outcome: 'success', proof: 'credential-digest-match' },
      cleanup: {
        pm2Record: 'absent',
        windowsJob: 'absent',
        trustedArtifacts: 'absent',
        secretExposures: 'closed'
      }
    }));
  },
  reconcileAndProveCleanup: () => {
    calls.push('production.cleanup');
    return Promise.resolve(e2eOk({
      pm2Record: 'absent',
      windowsJob: 'absent',
      trustedArtifacts: 'absent',
      secretExposures: 'closed'
    }));
  },
  ...overrides
});

describe('four-artifact live E2E harness', () => {
  it('proves the installed/committed preflight and cleans its temporary workspace', async () => {
    const calls: string[] = [];
    const outcome = await runFourArtifactE2ePreflight(prepared.gitExecutablePath, {
      workspace: workspacePort(calls)
    });
    expect(outcome).toEqual({
      type: 'ok',
      value: {
        outcome: 'success',
        proof: 'four-artifact-preflight',
        deliverableCount: 4,
        committedRecipe: true,
        cleanup: 'complete'
      }
    });
    expect(calls).toEqual([
      'workspace.prepare',
      `workspace.commit:${'0'.repeat(64)}`,
      'workspace.cleanup'
    ]);
  });

  it('does not provision a keychain canary when production composition is unavailable', async () => {
    const calls: string[] = [];
    const outcome = await runFourArtifactBrokerE2e(prepared.gitExecutablePath, {
      workspace: workspacePort(calls),
      production: productionPort(calls, {
        inspectReadiness: () => {
          calls.push('production.readiness');
          return Promise.resolve(e2eErr(
            'production-operation-api-unavailable',
            'production-readiness'
          ));
        }
      }),
      entropy: { createRunId: () => '01234567-89ab-cdef-0123-456789abcdef' }
    });
    expect(outcome).toMatchObject({
      type: 'err',
      issue: { code: 'production-operation-api-unavailable' }
    });
    expect(calls).toEqual(['workspace.prepare', 'production.readiness', 'workspace.cleanup']);
  });

  it('cleans the workspace without provisioning a canary when composition materialization fails', async () => {
    const calls: string[] = [];
    const outcome = await runFourArtifactBrokerE2e(prepared.gitExecutablePath, {
      workspace: workspacePort(calls),
      production: productionPort(calls, {
        materializeBrokerComposition: () => {
          calls.push('production.composition');
          return Promise.resolve(e2eErr('production-operation-failed', 'production-composition'));
        }
      }),
      entropy: { createRunId: () => '01234567-89ab-cdef-0123-456789abcdef' }
    });
    expect(outcome).toMatchObject({
      type: 'err',
      issue: { code: 'production-operation-failed', phase: 'production-composition' }
    });
    expect(calls).toEqual([
      'workspace.prepare',
      'production.readiness',
      'production.composition',
      'workspace.cleanup'
    ]);
  });

  it('runs to the exact digest receipt and proves receiver, keychain, and workspace cleanup', async () => {
    const calls: string[] = [];
    const outcome = await runFourArtifactBrokerE2e(prepared.gitExecutablePath, {
      workspace: workspacePort(calls),
      production: productionPort(calls),
      entropy: { createRunId: () => '01234567-89ab-cdef-0123-456789abcdef' }
    });
    expect(outcome).toMatchObject({
      type: 'ok',
      value: {
        outcome: 'success',
        proof: 'credential-digest-match',
        deliverableCount: 4,
        installedTarball: true,
        cleanup: 'complete'
      }
    });
    expect(calls).toEqual([
      'workspace.prepare',
      'production.readiness',
      'production.composition',
      'canary.provision',
      `workspace.commit:${'a'.repeat(64)}`,
      'production.execute',
      'production.cleanup',
      'canary.delete',
      'workspace.cleanup'
    ]);
    expect(fourArtifactE2ePublicJson(outcome)).not.toContain('credentialReference');
    expect(fourArtifactE2ePublicJson(outcome)).not.toContain('C:\\');
  });

  it('reconciles receiver state and removes the canary after execution failure', async () => {
    const calls: string[] = [];
    const outcome = await runFourArtifactBrokerE2e(prepared.gitExecutablePath, {
      workspace: workspacePort(calls),
      production: productionPort(calls, {
        runToTerminalAndCleanup: () => {
          calls.push('production.execute');
          return Promise.resolve(e2eErr('production-operation-failed', 'production-execution'));
        }
      }),
      entropy: { createRunId: () => '01234567-89ab-cdef-0123-456789abcdef' }
    });
    expect(outcome).toMatchObject({ type: 'err', issue: { code: 'production-operation-failed' } });
    expect(calls.slice(-4)).toEqual([
      'production.execute',
      'production.cleanup',
      'canary.delete',
      'workspace.cleanup'
    ]);
  });

  it('treats any failed final cleanup proof as the terminal outcome', async () => {
    const calls: string[] = [];
    const outcome = await runFourArtifactBrokerE2e(prepared.gitExecutablePath, {
      workspace: workspacePort(calls),
      production: productionPort(calls, {
        reconcileAndProveCleanup: () => {
          calls.push('production.cleanup');
          return Promise.resolve(e2eErr('resource-cleanup-failed', 'production-cleanup'));
        }
      }),
      entropy: { createRunId: () => '01234567-89ab-cdef-0123-456789abcdef' }
    });
    expect(outcome).toMatchObject({ type: 'err', issue: { code: 'resource-cleanup-failed' } });
    expect(calls.slice(-3)).toEqual(['production.cleanup', 'canary.delete', 'workspace.cleanup']);
  });
});
