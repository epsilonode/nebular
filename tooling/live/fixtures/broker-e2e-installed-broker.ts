// Replaced with `@epsilonode/nebular/broker` in the isolated consumer.
import { parseBrokerEntrypointChildMode } from '../../../broker.ts';

/**
 * Fail-closed placeholder copied into the isolated consumer. The tooling-only
 * production adapter replaces this file with a composition of general broker
 * factories once the launch-to-terminal operation API is available. It must
 * retain the same path because that exact installed entrypoint is grant-bound.
 */
const mode = parseBrokerEntrypointChildMode(Bun.argv);
if (mode.isErr() || mode.value.mode === 'none') process.exitCode = 64;
else process.exitCode = 78;
