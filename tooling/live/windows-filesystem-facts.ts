import { win32 } from 'node:path';

import {
  createBunWindowsFilesystemFactsRuntime,
  createWindowsExecutionPathResolver,
  createWindowsExecutionTargetEntrypointResolver,
  createWindowsExecutionToolRegistry,
  parseCanonicalRepository
} from '../../src/broker/public.ts';

const optIn = process.env['NEBULAR_WINDOWS_FILESYSTEM_FACTS_LIVE'] === '1';

if (!optIn || process.platform !== 'win32') {
  console.log(JSON.stringify({
    proof: 'windows-filesystem-facts',
    status: 'skipped',
    reason: optIn ? 'windows-required' : 'explicit-opt-in-required'
  }));
} else {
  const repositoryPath = win32.normalize(process.cwd());
  const brokerEntrypointPath = win32.join(repositoryPath, 'dist', 'broker.js');
  const runtime = createBunWindowsFilesystemFactsRuntime();
  const repository = parseCanonicalRepository(repositoryPath);
  const workingDirectory = repository.isOk()
    ? await createWindowsExecutionPathResolver(runtime).resolveWorkingDirectory({
        repository: repository.value,
        declaredCwd: '.'
      })
    : null;
  const tool = await createWindowsExecutionToolRegistry(
    { brokerEntrypointPath },
    runtime
  ).resolve({ declaredTool: 'bun' });
  const target = repository.isErr() || workingDirectory === null || workingDirectory.isErr()
    ? null
    : await createWindowsExecutionTargetEntrypointResolver(runtime).resolveTargetEntrypoint({
        repository: repository.value,
        workingDirectory: workingDirectory.value,
        declaredEntrypoint: 'src/broker/public.ts'
      });
  const workingDirectoryPassed = workingDirectory?.isOk() === true;
  const passed = repository.isOk() && workingDirectoryPassed && tool.isOk() && target?.isOk() === true;
  console.log(JSON.stringify({
    proof: 'windows-filesystem-facts',
    status: passed ? 'passed' : 'failed',
    checks: {
      canonicalRepositoryAndCwd: workingDirectoryPassed,
      currentBunAndFixedBrokerArtifact: tool.isOk(),
      repositoryTargetEntrypoint: target?.isOk() === true
    }
  }));
  if (!passed) process.exitCode = 1;
}
