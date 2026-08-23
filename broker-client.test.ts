import { describe, expect, it } from 'vitest';

import * as brokerClient from './broker-client.ts';

describe('broker-client public entrypoint', () => {
  it('loads without starting privileged work and exposes only client contracts', () => {
    expect(Object.keys(brokerClient).toSorted()).toEqual([
      'BOOTSTRAP_RESERVED_ENVIRONMENT_NAMES',
      'BROKER_BOOTSTRAP_MAX_MESSAGE_BYTES',
      'BROKER_BOOTSTRAP_MAX_SECRET_CODE_UNITS',
      'BROKER_BOOTSTRAP_MAX_SLOTS',
      'BROKER_BOOTSTRAP_PROTOCOL_VERSION',
      'BROKER_DEFAULT_OPERATION_TIMEOUT_MS',
      'BROKER_IPC_CHILD_ARGUMENT',
      'BROKER_MAX_DISCONNECT_DETAIL_LENGTH',
      'BROKER_MAX_MESSAGE_BYTES',
      'BROKER_MAX_OPERATION_TIMEOUT_MS',
      'BROKER_MAX_OUTPUT_CHUNK_BYTES',
      'BROKER_PROTOCOL_VERSION',
      'BROKER_REQUEST_CANCELLED_CODE',
      'clientErr',
      'clientOk',
      'clientTaskErr',
      'clientTaskOk',
      'clientTry',
      'clientTryAsync',
      'createBootstrapAcknowledgement',
      'createBootstrapRequest',
      'createBunInheritedIpcRuntime',
      'decodeBootstrapProtocolJson',
      'decodeBootstrapProtocolMessage',
      'decodeBrokerControlJson',
      'decodeBrokerControlMessage',
      'encodeBrokerControlMessage',
      'isBootstrapResponseMessage',
      'openBrokerClientExchange',
      'parseBrokerAttemptId',
      'parseBrokerRequestId',
      'parseBrokerSequence',
      'parseBrokerTimestampMs',
      'planBootstrapEnvironmentPatch',
      'prepareRecipeEnvironment',
      'prepareRecipeEnvironmentThenImport',
      'reduceBrokerClientExchange',
      'reduceBrokerClientSession',
      'runBrokerControlOverInheritedIpc'
    ]);
    expect('Bun' in brokerClient).toBe(false);
  });
});
