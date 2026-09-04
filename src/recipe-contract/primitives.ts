import { recipeErr, recipeOk, type RecipeRunnerResult } from './result.ts';

export type RecipeId = Readonly<{ kind: 'recipe-id'; value: string }>;
export type RecipeRelativePath = Readonly<{ kind: 'recipe-relative-path'; value: string }>;
export type RecipeRevision = Readonly<{ kind: 'recipe-revision'; value: string }>;
export type CredentialSlotId = Readonly<{ kind: 'credential-slot-id'; value: string }>;
export type ProviderId = Readonly<{ kind: 'provider-id'; value: string }>;
export type ProviderEnvironment = Readonly<{ kind: 'provider-environment'; value: string }>;
export type InjectionName = Readonly<{ kind: 'injection-name'; value: string }>;
export type AuthorityAtom = Readonly<{ kind: 'authority-atom'; value: string }>;

const parseToken = <Kind extends string>(
  value: unknown,
  kind: Kind,
  accepts: (candidate: string) => boolean,
  maxLength: number
): RecipeRunnerResult<Readonly<{ kind: Kind; value: string }>> =>
  typeof value === 'string' && value.length > 0 && value.length <= maxLength && accepts(value)
    ? recipeOk({ kind, value })
    : recipeErr({ code: 'invalid-input', message: `${kind} is invalid.` });

export const parseRecipeId = (value: unknown): RecipeRunnerResult<RecipeId> =>
  parseToken(value, 'recipe-id', candidate => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(candidate), 128);

export const parseRecipeRevision = (value: unknown): RecipeRunnerResult<RecipeRevision> =>
  parseToken(value, 'recipe-revision', candidate => /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(candidate), 256);

export const parseCredentialSlotId = (value: unknown): RecipeRunnerResult<CredentialSlotId> =>
  parseToken(value, 'credential-slot-id', candidate => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(candidate), 128);

export const parseProviderId = (value: unknown): RecipeRunnerResult<ProviderId> =>
  parseToken(value, 'provider-id', candidate => /^[a-z0-9][a-z0-9._-]*$/.test(candidate), 128);

export const parseProviderEnvironment = (value: unknown): RecipeRunnerResult<ProviderEnvironment> =>
  parseToken(value, 'provider-environment', candidate => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(candidate), 128);

export const parseInjectionName = (value: unknown): RecipeRunnerResult<InjectionName> =>
  parseToken(value, 'injection-name', candidate => /^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate), 128);

export const parseAuthorityAtom = (value: unknown): RecipeRunnerResult<AuthorityAtom> =>
  parseToken(value, 'authority-atom', candidate => /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(candidate), 256);

const isRelativeRecipePath = (value: string): boolean => {
  const segments: readonly string[] = value.replaceAll('\\', '/').split('/');
  return value.length <= 1024 &&
    !value.includes('\0') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:/.test(value) &&
    segments.every(segment => segment.length > 0 && segment !== '.' && segment !== '..');
};

export const parseRecipeRelativePath = (value: unknown): RecipeRunnerResult<RecipeRelativePath> =>
  typeof value === 'string' && isRelativeRecipePath(value)
    ? recipeOk({ kind: 'recipe-relative-path', value: value.replaceAll('\\', '/') })
    : recipeErr({ code: 'invalid-input', message: 'recipe-relative-path is invalid.' });
