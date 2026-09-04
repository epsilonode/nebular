import { createWindowsProfilePathPort } from '../../src/broker/bun-sqlite-journal.ts';
import { createWindowsKnownFolderLocalApplicationDataPort } from '../../src/broker/bun-windows-profile.ts';

const profile = createWindowsKnownFolderLocalApplicationDataPort();
const root = await profile.resolveCurrentUserRoot();
if (root.type === 'err') {
  throw new Error(`Windows Known Folder proof failed: ${root.issues[0].code}.`);
}

const database = await createWindowsProfilePathPort(profile).resolveAuthorityDatabasePath();
if (database.type === 'err') {
  throw new Error(`Windows authority path proof failed: ${database.issues[0].code}.`);
}

console.log(JSON.stringify({
  outcome: 'success',
  rootKind: root.value.kind,
  databaseKind: database.value.kind,
  pathRedacted: true
}));
