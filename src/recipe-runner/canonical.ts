import type { AdmittedRecipe, RecipeCredentialSlot, RecipeEnvironmentEntry, RecipePort } from './model.ts';
import { parseRecipeRevision, type RecipeRevision } from './primitives.ts';
import { type RecipeRunnerResult } from './result.ts';

export const RECIPE_REVISION_DOMAIN = 'wx.recipe.revision/v1' as const;

export type RecipeRevisionDigestPort = Readonly<{
  sha256: (input: Readonly<Uint8Array>) => RecipeRunnerResult<unknown>;
}>;

const environmentProjection = (entry: RecipeEnvironmentEntry): readonly [string, string] =>
  [entry.name.value, entry.value];

const portProjection = (port: RecipePort): readonly [string, string | null, string | null, string | null, string | null, string | null] =>
  [
    port.name,
    port.value ?? null,
    port.rangeStart ?? null,
    port.rangeEnd ?? null,
    port.host ?? null,
    port.hostAlias ?? null
  ];

const credentialProjection = (slot: RecipeCredentialSlot): readonly unknown[] => [
  slot.id.value,
  slot.provider.value,
  slot.account ?? null,
  slot.environment.value,
  slot.delivery,
  slot.inject.value,
  slot.operations.map(operation => operation.value),
  slot.scopes.map(scope => scope.value)
];

const probeProjection = (probe: Readonly<{ url: string; status?: number }>): readonly [string, number | null] =>
  [probe.url, probe.status ?? null];

export const canonicalRecipeJson = (recipe: AdmittedRecipe): string => {
  const semantic = recipe.semantic;
  const execution: readonly unknown[] | null = semantic.execution === undefined
    ? null
    : [
        semantic.execution.processName,
        semantic.execution.cwd,
        semantic.execution.tool,
        semantic.execution.argv,
        semantic.execution.environment
          .toSorted((left, right) => left.name.value.localeCompare(right.name.value))
          .map(environmentProjection)
      ];
  return JSON.stringify([
    semantic.schema,
    semantic.canonicalization,
    semantic.id.value,
    semantic.receiver,
    semantic.lifecycle,
    semantic.stopPolicy,
    semantic.timeoutMs,
    semantic.source === undefined
      ? null
      : [
          semantic.source.manifest ?? null,
          semantic.source.command ?? null,
          semantic.source.task ?? null,
          semantic.source.tool ?? null,
          semantic.source.doc ?? null
        ],
    execution,
    semantic.ports.map(portProjection),
    semantic.probes.map(probeProjection),
    semantic.credentialSlots.map(credentialProjection)
  ]);
};

export const recipeRevisionDigestInput = (recipe: AdmittedRecipe): Readonly<Uint8Array> =>
  new TextEncoder().encode(`${RECIPE_REVISION_DOMAIN}\0${canonicalRecipeJson(recipe)}`);

export const computeRecipeRevision = (
  recipe: AdmittedRecipe,
  digest: RecipeRevisionDigestPort
): RecipeRunnerResult<RecipeRevision> =>
  digest.sha256(recipeRevisionDigestInput(recipe)).andThen(parseRecipeRevision);
