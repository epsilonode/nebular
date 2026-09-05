import { type RecipeRevisionDigestPort } from '../recipe-contract/public.ts';
import type { BrokerAuthorityPorts } from './authority.ts';
import { type GitCurrentRecipeOptions, type GitCurrentRecipeRuntime } from './git-current-recipe.ts';
import { type GrantJournal } from './journal.ts';
export type GitJournalExecutionAuthorityOptions = Readonly<{
    git: GitCurrentRecipeOptions;
    grants: Pick<GrantJournal, 'readGrant'>;
    sha256: RecipeRevisionDigestPort;
}>;
export declare const createGitJournalExecutionAuthorityPorts: (options: GitJournalExecutionAuthorityOptions, runtime?: GitCurrentRecipeRuntime) => BrokerAuthorityPorts;
