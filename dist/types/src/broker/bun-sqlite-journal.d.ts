import { type AuthorityJournal, type ProfilePathPort, type TrustedLocalApplicationDataPort } from './journal.ts';
export type BunSqliteJournalOptions = Readonly<{
    profilePath: ProfilePathPort;
    applicationVersion: string;
    busyTimeoutMs?: number;
    clock: Readonly<{
        nowMs: () => number;
    }>;
}>;
export declare const createWindowsProfilePathPort: (localApplicationData: TrustedLocalApplicationDataPort) => ProfilePathPort;
export declare const createTestOnlyProfilePathPort: (databasePath: string) => ProfilePathPort;
export declare const createBunSqliteAuthorityJournal: (options: BunSqliteJournalOptions) => AuthorityJournal;
