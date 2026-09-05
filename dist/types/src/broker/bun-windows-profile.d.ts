import { type TrustedLocalApplicationDataPort } from './journal.ts';
export type WindowsLocalApplicationDataOutcome = Readonly<{
    status: 'resolved';
    path: string;
}> | Readonly<{
    status: 'unavailable';
}>;
export type WindowsKnownFolderRuntimePort = Readonly<{
    resolveLocalApplicationData: () => Promise<WindowsLocalApplicationDataOutcome>;
}>;
export declare const createBunWindowsKnownFolderRuntimePort: () => WindowsKnownFolderRuntimePort;
export declare const createWindowsKnownFolderLocalApplicationDataPort: (runtime?: WindowsKnownFolderRuntimePort, platform?: string) => TrustedLocalApplicationDataPort;
