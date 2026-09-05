import { type BrokerClientResult, type BrokerInheritedIpcReceipt, type BrokerInheritedIpcRequest, type BrokerInheritedIpcRuntime } from '../broker-client/public.ts';
import { type RecipeRelativePath, type RecipeRunnerResult } from '../recipe-contract/public.ts';
export declare const RECIPE_RUNNER_MAX_ARG_COUNT = 16;
export declare const RECIPE_RUNNER_MAX_PATH_LENGTH = 4096;
export declare const RECIPE_RUNNER_LOCAL_READ_TIMEOUT_MS = 3000;
export type RecipeRunnerDoctorCliPlan = Readonly<{
    command: 'doctor';
    brokerEntrypoint: string;
    cwd: string;
    timeoutMs: number;
}>;
export type RecipeRunnerRunCliPlan = Readonly<{
    command: 'run';
    brokerEntrypoint: string;
    repositoryPathHint: string;
    recipePathHint: RecipeRelativePath;
    grantIdHint: string;
    timeoutMs: number;
}>;
export type RecipeRunnerCliPlan = RecipeRunnerDoctorCliPlan | RecipeRunnerRunCliPlan;
export type RecipeRunnerCliReceipt = Readonly<{
    command: RecipeRunnerCliPlan['command'];
    outcome: BrokerInheritedIpcReceipt['terminal']['outcome'];
    code: string;
    progressCount: number;
    helperExitCode: number;
}>;
export type RecipeRunnerLocalReadRequest = Readonly<{
    repositoryPathHint: string;
    recipePathHint: RecipeRelativePath;
    maximumBytes: number;
    timeoutMs: number;
}>;
export type RecipeRunnerLocalReadOutcome = Readonly<{
    type: 'bytes';
    bytes: Readonly<Uint8Array>;
}> | Readonly<{
    type: 'too-large';
}> | Readonly<{
    type: 'deadline';
}> | Readonly<{
    type: 'unavailable';
}>;
export type RecipeRunnerSha256Port = Readonly<{
    sha256: (input: Readonly<Uint8Array>) => RecipeRunnerResult<unknown> | PromiseLike<RecipeRunnerResult<unknown>>;
}>;
export type RecipeRunnerBrokerControlPort = Readonly<{
    send: (request: BrokerInheritedIpcRequest) => BrokerClientResult<BrokerInheritedIpcReceipt> | PromiseLike<BrokerClientResult<BrokerInheritedIpcReceipt>>;
}>;
export type RecipeRunnerCliRuntime = Readonly<{
    workingDirectory: Readonly<{
        read: () => string;
    }>;
    localRecipe: Readonly<{
        read: (request: RecipeRunnerLocalReadRequest) => RecipeRunnerLocalReadOutcome | PromiseLike<RecipeRunnerLocalReadOutcome>;
    }>;
    digest: RecipeRunnerSha256Port;
    brokerControl: RecipeRunnerBrokerControlPort;
}>;
export declare const parseRecipeRunnerCliPlan: (argv: readonly string[], defaultCwd: string) => RecipeRunnerResult<RecipeRunnerCliPlan>;
export declare const executeRecipeRunnerCliPlan: (plan: RecipeRunnerCliPlan, runtime: RecipeRunnerCliRuntime) => Promise<RecipeRunnerResult<RecipeRunnerCliReceipt>>;
export declare const runRecipeRunnerCli: (argv: readonly string[], runtime: RecipeRunnerCliRuntime) => Promise<RecipeRunnerResult<RecipeRunnerCliReceipt>>;
export declare const createBunNodeRecipeRunnerCliRuntime: (ipcRuntime?: BrokerInheritedIpcRuntime) => RecipeRunnerCliRuntime;
