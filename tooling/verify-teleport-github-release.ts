import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dir, '..');
const gitRef = Bun.argv.at(2);
if (gitRef === undefined || !/^[0-9a-f]{40}$/u.test(gitRef)) {
  throw new Error('Usage: mise run verify-teleport-github-release -- <40-character immutable Git commit>.');
}

const artifactPath = resolve(projectRoot, 'dist', 'teleport.js');
const declarationPath = resolve(projectRoot, 'dist', 'types', 'teleport.d.ts');
const digest = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');
const [artifact, declaration] = await Promise.all([
  readFile(artifactPath),
  readFile(declarationPath)
]);
const rawArtifactUrl = `https://raw.githubusercontent.com/epsilonode/nebular/${gitRef}/dist/teleport.js`;
const rawDeclarationUrl = `https://raw.githubusercontent.com/epsilonode/nebular/${gitRef}/dist/types/teleport.d.ts`;
const esmUrl = `https://esm.sh/gh/epsilonode/nebular@${gitRef}/dist/teleport.js`;
const [rawArtifactResponse, rawDeclarationResponse, esmResponse] = await Promise.all([
  fetch(rawArtifactUrl),
  fetch(rawDeclarationUrl),
  fetch(esmUrl)
]);
if (!rawArtifactResponse.ok || !rawDeclarationResponse.ok || !esmResponse.ok) {
  throw new Error(`GitHub/esm.sh release fetch failed: artifact=${rawArtifactResponse.status}, declaration=${rawDeclarationResponse.status}, esm=${esmResponse.status}.`);
}

const [remoteArtifact, remoteDeclaration, esmSource] = await Promise.all([
  rawArtifactResponse.bytes(),
  rawDeclarationResponse.bytes(),
  esmResponse.text()
]);
if (digest(artifact) !== digest(remoteArtifact)) {
  throw new Error('The committed GitHub teleport.js artifact does not match local dist/teleport.js.');
}
if (digest(declaration) !== digest(remoteDeclaration)) {
  throw new Error('The committed GitHub teleport declaration does not match local dist/types/teleport.d.ts.');
}
const expectedArtifactPath = `/gh/epsilonode/nebular@${gitRef}/dist/teleport.js`;
if (!esmSource.includes(expectedArtifactPath) || esmSource.includes('/teleport.ts')) {
  throw new Error('esm.sh did not resolve the selected compiled teleport.js GitHub artifact.');
}
const foreignNebularRefs = [...esmSource.matchAll(/\/gh\/epsilonode\/nebular@([^/'"]+)/gu)]
  .map(match => match[1])
  .filter((ref): ref is string => ref !== undefined && ref !== gitRef);
if (foreignNebularRefs.length > 0) {
  throw new Error(`esm.sh module response mixed Nebular refs: ${foreignNebularRefs.join(', ')}.`);
}

console.log(JSON.stringify({
  gitRef,
  artifactSha256: digest(artifact),
  declarationSha256: digest(declaration),
  esmUrl,
  esmContentType: esmResponse.headers.get('content-type')
}, undefined, 2));
