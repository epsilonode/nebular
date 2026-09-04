export * from './src/recipe-runner/public.ts';

import {
  createBunNodeRecipeRunnerCliRuntime,
  runRecipeRunnerCli
} from './src/recipe-runner/public.ts';

if (import.meta.main) {
  const result = await runRecipeRunnerCli(
    Bun.argv.slice(2),
    createBunNodeRecipeRunnerCliRuntime()
  );
  if (result.isErr()) {
    console.error(JSON.stringify({ outcome: 'failure', code: result.error[0].code }));
    process.exit(result.error[0].code === 'invalid-input' ? 64 : 1);
  }
  console.log(JSON.stringify(result.value));
  process.exit(result.value.outcome === 'success' ? 0 : 1);
}
