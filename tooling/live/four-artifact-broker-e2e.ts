import { realpath } from 'node:fs/promises';

import { createFourArtifactE2eProductionPort } from './four-artifact-e2e-production.ts';
import {
  fourArtifactE2ePublicJson,
  runFourArtifactBrokerE2e,
  runFourArtifactE2ePreflight,
  type FourArtifactE2eWorkspacePort
} from './four-artifact-e2e-harness.ts';
import {
  cleanupFourArtifactE2eWorkspace,
  commitFourArtifactE2eRecipe,
  deleteFourArtifactE2eCanary,
  prepareFourArtifactE2eWorkspace,
  provisionFourArtifactE2eCanary
} from './four-artifact-e2e-workspace.ts';
import { e2eErr, type FourArtifactE2eResult } from './four-artifact-e2e-contract.ts';

type LiveMode = 'preflight' | 'run';

const parseMode = (argv: readonly string[]): LiveMode | undefined =>
  argv.length === 1 && (argv[0] === 'preflight' || argv[0] === 'run') ? argv[0] : undefined;

const resolveGitExecutable = async (): Promise<FourArtifactE2eResult<string>> => {
  const located = Bun.which('git');
  if (located === null) return e2eErr('git-unavailable', 'git-resolution');
  try {
    return { type: 'ok', value: await realpath(located) };
  } catch {
    return e2eErr('git-unavailable', 'git-resolution');
  }
};

const workspace: FourArtifactE2eWorkspacePort = {
  prepare: prepareFourArtifactE2eWorkspace,
  commitRecipe: commitFourArtifactE2eRecipe,
  provisionCanary: provisionFourArtifactE2eCanary,
  deleteCanary: deleteFourArtifactE2eCanary,
  cleanup: cleanupFourArtifactE2eWorkspace
};

const mode = parseMode(Bun.argv.slice(2));
const git = await resolveGitExecutable();
const outcome = mode === undefined
  ? e2eErr('fixture-invalid', 'cli')
  : git.type === 'err'
    ? git
    : mode === 'preflight'
      ? await runFourArtifactE2ePreflight(git.value, { workspace })
      : await runFourArtifactBrokerE2e(git.value, {
          workspace,
          production: createFourArtifactE2eProductionPort(),
          entropy: { createRunId: () => crypto.randomUUID() }
        });

const publicJson = fourArtifactE2ePublicJson(outcome);
if (outcome.type === 'ok') console.log(publicJson);
else {
  console.error(publicJson);
  process.exitCode = 1;
}
