import type { TeleportInventoryEntry } from './cartridge';
import { type TeleportCodecRegistry } from './codec';
import { type TeleportResult } from './result';
import type { TeleportRestorePlan } from './types';
export declare const composeTeleportRestorePlan: (inventory: readonly TeleportInventoryEntry[], registry: TeleportCodecRegistry) => TeleportResult<TeleportRestorePlan>;
