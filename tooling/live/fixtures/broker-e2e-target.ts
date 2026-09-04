// The live harness replaces this repository-relative development import with
// the installed `@epsilonode/nebular/broker-client` package subpath before it
// commits the isolated consumer repository.
import { prepareManagedBunRecipeEnvironmentThenImport } from '../../../broker-client.ts';

const prepared = await prepareManagedBunRecipeEnvironmentThenImport(
  {
    slots: [{
      slotId: { kind: 'bootstrap-credential-slot-id', value: 'e2e-provider' },
      environmentName: 'E2E_PROVIDER_VALUE'
    }]
  },
  () => import('./broker-e2e-application.ts')
);

if (prepared.isErr()) {
  console.error(JSON.stringify({ outcome: 'failure', code: prepared.error[0].code }));
  process.exit(1);
}

try {
  const receipt = prepared.value.application.run();
  console.log(JSON.stringify(receipt));
} catch {
  console.error(JSON.stringify({ outcome: 'failure', code: 'application-proof-failed' }));
  process.exit(1);
}
