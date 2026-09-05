import { type ManagedWindowsJobEnvironmentPort, type ManagedWindowsJobFirstEffectGatePort, type ManagedWindowsJobNativePort } from './windows-job-first-effect.ts';
export declare const createBunManagedWindowsJobNativePort: (platform?: string, architecture?: string) => ManagedWindowsJobNativePort;
export declare const createBunManagedWindowsJobFirstEffectGate: (environment?: ManagedWindowsJobEnvironmentPort, native?: ManagedWindowsJobNativePort) => ManagedWindowsJobFirstEffectGatePort;
