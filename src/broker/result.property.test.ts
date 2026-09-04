import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { brokerErr, brokerOk, brokerTry, type BrokerResult } from './result.ts';

const issue = { code: 'request-invalid' as const, message: 'Synthetic property failure.' };

const first = (value: number): BrokerResult<number> => value % 3 === 0
  ? brokerErr(issue)
  : brokerOk(value + 1);

const second = (value: number): BrokerResult<number> => value % 5 === 0
  ? brokerErr(issue)
  : brokerOk(value * 2);

describe('broker Result façade laws', () => {
  it('preserves left identity and associative dependent composition', () => {
    fc.assert(fc.property(fc.integer({ min: -10_000, max: 10_000 }), value => {
      expect(brokerOk(value).andThen(first)).toEqual(first(value));
      expect(brokerOk(value).andThen(first).andThen(second)).toEqual(
        brokerOk(value).andThen(candidate => first(candidate).andThen(second))
      );
    }));
  });

  it('preserves success values and turns thrown mechanics into the supplied nonempty issue family', () => {
    fc.assert(fc.property(fc.integer({ min: -10_000, max: 10_000 }), fc.boolean(), (value, throws) => {
      const result = brokerTry(() => {
        if (throws) throw new Error('Synthetic throw must not escape the Result boundary.');
        return value;
      }, issue);
      expect(result).toEqual(throws ? brokerErr(issue) : brokerOk(value));
    }));
  });
});
