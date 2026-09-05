import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dir, '..');
const outputDirectory = resolve(projectRoot, 'dist');
const evidenceDirectory = resolve(projectRoot, '.generated', 'build');

const build = (
  entrypoints: readonly string[],
  target: 'browser' | 'bun'
): Promise<Bun.BuildOutput> => Bun.build({
  entrypoints: entrypoints.map(entrypoint => resolve(projectRoot, entrypoint)),
  target,
  format: 'esm',
  splitting: false,
  outdir: outputDirectory,
  root: projectRoot,
  naming: '[name].[ext]',
  packages: 'bundle',
  allowUnresolved: [],
  env: 'disable',
  define: target === 'browser'
    ? {
        'globalThis.process': 'undefined',
        'globalThis.Buffer': 'undefined'
      }
    : {},
  minify: target === 'browser' ? { syntax: true } : false,
  sourcemap: 'none',
  metafile: true,
  throw: false
});

await rm(outputDirectory, { recursive: true, force: true });
await rm(evidenceDirectory, { recursive: true, force: true });
await Promise.all([
  mkdir(outputDirectory, { recursive: true }),
  mkdir(evidenceDirectory, { recursive: true })
]);

const [portable, bunRuntime] = await Promise.all([
  build(['teleport.ts'], 'browser'),
  build(['broker-client.ts', 'recipe-runner.ts', 'broker.ts'], 'bun')
]);

const failedBuilds: readonly Bun.BuildOutput[] = [portable, bunRuntime].filter(output => !output.success);
if (failedBuilds.length > 0) {
  failedBuilds.flatMap(output => output.logs).forEach(log => console.error(log));
  throw new Error('Nebular runtime artifact build failed.');
}
if (portable.metafile === undefined || bunRuntime.metafile === undefined) {
  throw new Error('Bun did not return the required artifact metafiles.');
}

await Promise.all([
  Bun.write(resolve(evidenceDirectory, 'teleport.meta.json'), JSON.stringify(portable.metafile, undefined, 2)),
  Bun.write(resolve(evidenceDirectory, 'bun.meta.json'), JSON.stringify(bunRuntime.metafile, undefined, 2))
]);
