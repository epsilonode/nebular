import type { AuthorizedExecution } from './authority.ts';
import type { BunWindowsFilesystemFactsRuntime } from './bun-windows-filesystem-facts.ts';
import { type GrantQualifiedOneShotStartOutcome, type GrantQualifiedOneShotStartTiming } from './grant-qualified-one-shot-start.ts';
import { type AttemptJournal, type GrantQualifiedContainedAttemptRecord, type ProcessIncarnation, type TrustedProfileRoot } from './journal.ts';
import { type GrantQualifiedOneShotLaunchFactory, type GrantQualifiedOneShotReservation } from './one-shot-materialization-reservation.ts';
import type { ExactNameOneShotPorts } from './one-shot-receiver.ts';
import type { OneShotAttemptHandle, OneShotSlotPool } from './one-shot-slots.ts';
import { type Pm2OneShotLaunchPayload } from './pm2-exact-name-receiver.ts';
import type { ProcessAttemptId } from './primitives.ts';
import type { CurrentProcessIncarnationPort } from './receiver-attempt-verifier.ts';
import { type WindowsNamedJobContainmentPort, type WindowsNamedJobIdentity } from './windows-named-job-containment.ts';
import { type WindowsOneShotArtifactRuntimePort } from './windows-one-shot-artifacts.ts';
export declare const WINDOWS_PM2_ONE_SHOT_BIND_OPERATION_DOMAIN: "epsilonode.nebular.windows-pm2-one-shot-bind/v1";
export declare const WINDOWS_PM2_ONE_SHOT_BOOTSTRAP_READY_OPERATION_DOMAIN: "epsilonode.nebular.windows-pm2-one-shot-bootstrap-ready/v1";
export type WindowsPm2OneShotLaunchRecoveryStage = 'configuration' | 'canonical-plan' | 'receiver-probe' | 'durable-reservation' | 'exact-start' | 'exact-start-invalid' | 'exact-start-admission' | 'exact-start-lock' | 'exact-start-observation' | 'exact-start-artifact-preparation' | 'exact-start-receiver-start' | 'exact-start-bootstrap-artifact' | 'exact-start-bootstrap-job-pending' | 'exact-start-bootstrap-job-name-missing' | 'exact-start-bootstrap-job-empty' | 'exact-start-bootstrap-job-unavailable' | 'exact-start-bootstrap-job-multiple' | 'exact-start-bootstrap-job-policy' | 'exact-start-bootstrap-process-incarnation' | 'exact-start-bootstrap-job-membership' | 'exact-start-bootstrap-journal-bind' | 'exact-start-ownership' | 'exact-start-confirmation' | 'exact-start-timing' | 'terminal-before-containment' | 'process-incarnation' | 'job-containment' | 'bootstrap-binding';
type WindowsPm2OneShotActiveStart = Extract<GrantQualifiedOneShotStartOutcome, Readonly<{
    state: 'exact-start-confirmed';
}>>;
type WindowsPm2OneShotTerminalStart = Extract<GrantQualifiedOneShotStartOutcome, Readonly<{
    state: 'exact-terminal-confirmed';
}>>;
export type WindowsPm2OneShotReservedLaunchReceipt = Readonly<{
    format: 'windows-pm2-one-shot-launch-receipt/v1';
    reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>;
    start: null;
    containedAttempt: null;
}>;
export type WindowsPm2OneShotActiveLaunchReceipt = Readonly<{
    format: 'windows-pm2-one-shot-launch-receipt/v1';
    reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>;
    start: WindowsPm2OneShotActiveStart;
    containedAttempt: GrantQualifiedContainedAttemptRecord | null;
}>;
export type WindowsPm2OneShotTerminalLaunchReceipt = Readonly<{
    format: 'windows-pm2-one-shot-launch-receipt/v1';
    reservation: GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>;
    start: WindowsPm2OneShotTerminalStart;
    containedAttempt: null;
}>;
export type WindowsPm2OneShotLaunchReceipt = WindowsPm2OneShotReservedLaunchReceipt | WindowsPm2OneShotActiveLaunchReceipt | WindowsPm2OneShotTerminalLaunchReceipt;
export type WindowsPm2OneShotRunningLaunch = Readonly<{
    state: 'launched' | 'replayed';
    attemptId: ProcessAttemptId;
    handle: OneShotAttemptHandle;
    processId: number;
    processIncarnation: ProcessIncarnation;
    job: WindowsNamedJobIdentity;
    receiverStatus: 'online' | 'launching';
    journalState: 'running';
    bindingGeneration: number;
    receipt: WindowsPm2OneShotActiveLaunchReceipt & Readonly<{
        containedAttempt: GrantQualifiedContainedAttemptRecord;
    }>;
}>;
export type WindowsPm2OneShotLaunchRecovery = Readonly<{
    state: 'recovery-required';
    stage: WindowsPm2OneShotLaunchRecoveryStage;
    attemptId: ProcessAttemptId | null;
    safeMessage: string;
    receipt: WindowsPm2OneShotLaunchReceipt | null;
}>;
export type WindowsPm2OneShotLaunchOutcome = WindowsPm2OneShotRunningLaunch | WindowsPm2OneShotLaunchRecovery;
export type WindowsPm2OneShotLaunchConfig = Readonly<{
    trustedProfileRoot: TrustedProfileRoot;
    brokerEntrypointPath: string;
    pool: OneShotSlotPool;
    allowedNonsecretEnvironmentNames: readonly string[];
}>;
export type WindowsPm2OneShotLaunchPorts = Readonly<{
    filesystem: BunWindowsFilesystemFactsRuntime;
    artifacts: WindowsOneShotArtifactRuntimePort;
    attempts: Pick<AttemptJournal, 'bindBootstrap' | 'bindVerifiedWindowsContainmentAndStart' | 'readGrantQualifiedMaterializing' | 'reserveGrantQualifiedMaterializing'>;
    receiver: Pick<ExactNameOneShotPorts<Pm2OneShotLaunchPayload>, 'probe' | 'withAllocationLock' | 'observe' | 'startExact'>;
    processIncarnations: CurrentProcessIncarnationPort;
    containment: WindowsNamedJobContainmentPort;
    timing: GrantQualifiedOneShotStartTiming;
}>;
export type WindowsPm2OneShotLaunchPort = Readonly<{
    launch: (execution: AuthorizedExecution, observedAtMs: number) => Promise<WindowsPm2OneShotLaunchOutcome>;
}>;
export declare const createWindowsPm2OneShotLaunchFactory: (config: WindowsPm2OneShotLaunchConfig) => GrantQualifiedOneShotLaunchFactory<Pm2OneShotLaunchPayload>;
export declare const createWindowsPm2OneShotLaunchPort: (config: WindowsPm2OneShotLaunchConfig, ports: Omit<WindowsPm2OneShotLaunchPorts, "timing"> & Readonly<{
    timing?: GrantQualifiedOneShotStartTiming;
}>) => WindowsPm2OneShotLaunchPort;
export {};
