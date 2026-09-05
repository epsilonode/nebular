import type { CanonicalGitWorktreeOutcome, CheckedInRecipeFileOutcome } from './current-recipe.ts';
import type { CanonicalRepository } from './primitives.ts';
export declare const GIT_RECIPE_DEFAULT_DEADLINE_MS = 5000;
export declare const GIT_RECIPE_MAX_DEADLINE_MS = 60000;
export declare const GIT_RECIPE_DEFAULT_BLOB_LIMIT_BYTES: number;
export declare const GIT_RECIPE_MAX_BLOB_LIMIT_BYTES: number;
export declare const GIT_RECIPE_METADATA_LIMIT_BYTES: number;
export declare const GIT_RECIPE_STDERR_LIMIT_BYTES: number;
export type GitCurrentRecipeOptions = Readonly<{
    gitExecutable: string;
    deadlineMs?: number;
    blobLimitBytes?: number;
}>;
export type GitCommandRequest = Readonly<{
    executable: string;
    argv: readonly string[];
    timeoutMs: number;
    stdoutLimitBytes: number;
    stderrLimitBytes: number;
}>;
export type GitCommandOutcome = Readonly<{
    status: 'exited';
    exitCode: number;
    stdout: Uint8Array;
    stderrByteLength: number;
}> | Readonly<{
    status: 'failed';
}>;
export type GitCurrentRecipeRuntime = Readonly<{
    run: (request: GitCommandRequest) => GitCommandOutcome;
    canonicalizeExistingPath: (path: string) => string | null;
    pathsEqual: (left: string, right: string) => boolean;
    monotonicNowMs: () => number;
}>;
export declare const createBunGitCurrentRecipeRuntime: () => GitCurrentRecipeRuntime;
export declare const createGitCurrentRecipePorts: (options: GitCurrentRecipeOptions, runtime?: GitCurrentRecipeRuntime) => {
    worktrees: {
        resolveCanonicalWorktree: (data: CanonicalRepository) => import("./current-recipe.ts").CurrentRecipeTaskResult<CanonicalGitWorktreeOutcome>;
    };
    files: {
        readCheckedInRegularFile: (data: Readonly<{
            worktree: Readonly<{
                state: "canonical-git-worktree";
                canonicalRepository: CanonicalRepository;
            }>;
            expectedRelativeLocator: import("./journal.ts").CheckedInRecipeLocator;
        }>) => import("./current-recipe.ts").CurrentRecipeTaskResult<CheckedInRecipeFileOutcome>;
    };
};
