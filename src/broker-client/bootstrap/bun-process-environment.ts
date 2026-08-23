import {
  clientErr,
  clientOk,
  clientTry,
  type BrokerClientIssues,
  type BrokerClientResult
} from '../result.ts';
import type {
  BootstrapEnvironmentInstallPort,
  BootstrapEnvironmentInstallReceipt,
  BootstrapEnvironmentPatch,
  BootstrapEnvironmentPatchEntry
} from './cooperative.ts';

export type BunProcessEnvironmentRuntime = Readonly<{
  names: () => readonly string[];
  write: (name: string, value: string) => BrokerClientResult<void>;
  remove: (name: string) => BrokerClientResult<void>;
}>;

type StagedEnvironmentEntry = Readonly<{
  name: string;
  value: string;
}>;

const foldName = (name: string): string => name.toUpperCase();

const unique = (values: readonly string[]): boolean =>
  values.every((value, index) => values.indexOf(value) === index);

const samePatchSlots = (patch: BootstrapEnvironmentPatch): boolean =>
  patch.entries.length === patch.slots.length && patch.entries.every(entry =>
    patch.slots.some(slot =>
      slot.slotId.value === entry.slotId.value && slot.environmentName === entry.environmentName));

const stageEntry = (entry: BootstrapEnvironmentPatchEntry): BrokerClientResult<StagedEnvironmentEntry> =>
  entry.secret.withValue(value => value.length > 0 && !value.includes('\0')
    ? clientOk({ name: entry.environmentName, value })
    : clientErr({
        code: 'environment-invalid',
        message: 'Bootstrap environment value is invalid.'
      }));

const stageEntries = (
  entries: readonly BootstrapEnvironmentPatchEntry[]
): BrokerClientResult<readonly StagedEnvironmentEntry[]> => entries.reduce<
BrokerClientResult<readonly StagedEnvironmentEntry[]>
>(
  (staged, entry) => staged.andThen(values => stageEntry(entry).map(value => [...values, value])),
  clientOk([])
);

const rollback = (
  runtime: BunProcessEnvironmentRuntime,
  names: readonly string[]
): BrokerClientResult<void> => names.reduceRight<BrokerClientResult<void>>(
  (removed, name) => removed.andThen(() => runtime.remove(name)),
  clientOk(undefined)
);

const failAfterRollback = <Value>(
  runtime: BunProcessEnvironmentRuntime,
  names: readonly string[],
  issues: BrokerClientIssues
): BrokerClientResult<Value> => rollback(runtime, names)
  .andThen(() => clientErr(issues[0], ...issues.slice(1)))
  .orElse(() => clientErr({
    code: 'environment-invalid',
    message: 'Bootstrap environment installation and rollback failed.'
  }));

const applyStaged = (
  runtime: BunProcessEnvironmentRuntime,
  entries: readonly StagedEnvironmentEntry[],
  index: number,
  installedNames: readonly string[]
): BrokerClientResult<readonly string[]> => {
  const entry = entries[index];
  if (entry === undefined) return clientOk(installedNames);
  const written = runtime.write(entry.name, entry.value);
  return written.isErr()
    ? failAfterRollback(runtime, installedNames, written.error)
    : applyStaged(runtime, entries, index + 1, [...installedNames, entry.name]);
};

const validatePatch = (
  patch: BootstrapEnvironmentPatch,
  existingNames: readonly string[]
): BrokerClientResult<BootstrapEnvironmentPatch> => {
  const patchNames: readonly string[] = patch.slots.map(slot => foldName(slot.environmentName));
  const existingFolded: readonly string[] = existingNames.map(foldName);
  return samePatchSlots(patch) && unique(patchNames) &&
    patch.slots.every(slot => /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u.test(slot.environmentName)) &&
    !patchNames.some(name => existingFolded.includes(name))
    ? clientOk(patch)
    : clientErr({
        code: 'environment-invalid',
        message: 'Bootstrap environment patch is invalid or collides with the current process.'
      });
};

const installPatch = (
  patch: BootstrapEnvironmentPatch,
  runtime: BunProcessEnvironmentRuntime
): BrokerClientResult<BootstrapEnvironmentInstallReceipt> =>
  validatePatch(patch, runtime.names()).andThen(validated =>
    stageEntries(validated.entries).andThen(staged =>
      applyStaged(runtime, staged, 0, []).map(installedNames => {
        const rollbackState = { active: true };
        return {
          atomic: true,
          installedSlots: validated.slots,
          cleanup: {
            rollback: (): Promise<BrokerClientResult<void>> => {
              if (!rollbackState.active) return Promise.resolve(clientOk(undefined));
              rollbackState.active = false;
              return Promise.resolve(rollback(runtime, installedNames));
            }
          }
        };
      })
    )
  );

export const createBunProcessEnvironmentRuntime = (): BunProcessEnvironmentRuntime => ({
  names: () => Object.keys(process.env),
  write: (name, value) => clientTry(() => {
    process.env[name] = value;
  }, {
    code: 'environment-invalid',
    message: 'Current-process environment installation failed.'
  }),
  remove: name => clientTry(() => {
    delete process.env[name];
  }, {
    code: 'environment-invalid',
    message: 'Current-process environment rollback failed.'
  })
});

export const createBunProcessEnvironmentInstallPort = (
  runtime: BunProcessEnvironmentRuntime = createBunProcessEnvironmentRuntime()
): BootstrapEnvironmentInstallPort => ({
  installAtomically: patch => Promise.resolve(installPatch(patch, runtime))
});

export const bunProcessEnvironmentNames = (): readonly string[] => Object.keys(process.env);
