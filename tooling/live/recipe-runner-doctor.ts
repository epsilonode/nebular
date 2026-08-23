import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dir, '..', '..');
const recipeRunnerEntrypoint = resolve(projectRoot, 'dist', 'recipe-runner.js');
const brokerEntrypoint = resolve(projectRoot, 'dist', 'broker.js');
const child = Bun.spawn({
  cmd: [process.execPath, recipeRunnerEntrypoint, 'doctor', '--broker', brokerEntrypoint, '--cwd', projectRoot],
  cwd: projectRoot,
  env: {},
  stdin: 'ignore',
  stdout: 'pipe',
  stderr: 'pipe'
});

let deadline: ReturnType<typeof setTimeout> | undefined;
const timedExit = new Promise<Readonly<{ outcome: 'timeout' }> | Readonly<{ outcome: 'exit'; code: number }>>(resolveExit => {
  deadline = setTimeout(() => resolveExit({ outcome: 'timeout' }), 15_000);
  void child.exited.then(code => resolveExit({ outcome: 'exit', code }));
});
const exit = await timedExit;
if (deadline !== undefined) clearTimeout(deadline);
if (exit.outcome === 'timeout') {
  child.kill();
  await child.exited;
  throw new Error('Recipe-runner doctor exceeded its bounded live-test deadline.');
}
const [stdout, stderr] = await Promise.all([
  new Response(child.stdout).text(),
  new Response(child.stderr).text()
]);
if (exit.code !== 0 || stderr.trim().length > 0) {
  throw new Error(`Recipe-runner doctor failed with exit ${exit.code}.`);
}

const parsed: unknown = JSON.parse(stdout);
if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) ||
    !('outcome' in parsed) || parsed.outcome !== 'success' ||
    !('code' in parsed) || parsed.code !== 'broker-ready' ||
    !('helperExitCode' in parsed) || parsed.helperExitCode !== 0) {
  throw new Error('Recipe-runner doctor emitted an invalid redacted receipt.');
}

console.log('Recipe-runner to broker inherited-IPC live conformance passed.');
