import { describe, expect, it } from 'vitest';

import * as teleport from './teleport.ts';

describe('teleport public entrypoint', () => {
  it('is portable, inert, and exposes the cartridge/codec/restore contracts', () => {
    expect(Object.keys(teleport)).toEqual(expect.arrayContaining([
      'createTeleportCodecRegistry',
      'createTeleportCartridge',
      'verifyTeleportCartridge',
      'composeTeleportRestorePlan'
    ]));
    expect('resolveAndAuthorizeExecution' in teleport).toBe(false);
    expect('decodeBrokerControlMessage' in teleport).toBe(false);
  });
});
