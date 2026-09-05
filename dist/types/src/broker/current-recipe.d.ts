import { type RecipeRevisionDigestPort } from '../recipe-contract/public.ts';
import type { CurrentBootstrapRecipeAuthority, VerifiedBootstrapReceiverAttempt } from './bootstrap-authority.ts';
import { type CheckedInRecipeLocator } from './journal.ts';
import { type CanonicalRepository } from './primitives.ts';
import { type BrokerIssue, type BrokerResult } from './result.ts';
export type CurrentRecipeTaskResult<T> = Promise<BrokerResult<T>>;
export declare const currentRecipeTaskOk: <T>(value: T) => CurrentRecipeTaskResult<T>;
export declare const currentRecipeTaskErr: <T = never>(issue: BrokerIssue) => CurrentRecipeTaskResult<T>;
export type CanonicalGitWorktree = Readonly<{
    state: 'canonical-git-worktree';
    canonicalRepository: CanonicalRepository;
}>;
export type CanonicalGitWorktreeOutcome = Readonly<{
    status: 'resolved';
    worktree: CanonicalGitWorktree;
}> | Readonly<{
    status: 'not-git-worktree';
}> | Readonly<{
    status: 'ambiguous-worktree';
}> | Readonly<{
    status: 'unavailable';
}>;
export type CurrentRecipeWorktreePort = Readonly<{
    resolveCanonicalWorktree: (expectedRepository: CanonicalRepository) => CurrentRecipeTaskResult<CanonicalGitWorktreeOutcome>;
}>;
export type CheckedInRecipeReadRequest = Readonly<{
    worktree: CanonicalGitWorktree;
    expectedRelativeLocator: CheckedInRecipeLocator;
}>;
export type CheckedInRecipeFileOutcome = Readonly<{
    status: 'checked-in-regular-file';
    relativeLocator: string;
    xml: string;
}> | Readonly<{
    status: 'untracked';
}> | Readonly<{
    status: 'symlink';
}> | Readonly<{
    status: 'path-escape';
}> | Readonly<{
    status: 'missing';
}> | Readonly<{
    status: 'not-regular-file';
}> | Readonly<{
    status: 'unavailable';
}>;
export type CurrentRecipeCheckedInFilePort = Readonly<{
    readCheckedInRegularFile: (request: CheckedInRecipeReadRequest) => CurrentRecipeTaskResult<CheckedInRecipeFileOutcome>;
}>;
export type CurrentRecipeSha256Port = RecipeRevisionDigestPort;
export type BrokerCurrentRecipePorts = Readonly<{
    worktrees: CurrentRecipeWorktreePort;
    files: CurrentRecipeCheckedInFilePort;
    sha256: CurrentRecipeSha256Port;
}>;
export type BrokerCurrentRecipeResolver = Readonly<{
    resolveCurrentRecipe: (attempt: VerifiedBootstrapReceiverAttempt) => CurrentRecipeTaskResult<CurrentBootstrapRecipeAuthority>;
}>;
export declare const createBrokerCurrentRecipeResolver: (ports: BrokerCurrentRecipePorts) => BrokerCurrentRecipeResolver;
