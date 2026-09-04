import {
  createBootstrapRequest,
  type BootstrapRequestMessage,
  type CreateBootstrapRequestInput
} from './protocol.ts';
import { clientErr, clientTry, type BrokerClientResult } from '../result.ts';

export const MANAGED_ATTEMPT_ENVIRONMENT = Object.freeze({
  repository: 'NEBULAR_PM2_REPOSITORY',
  recipeRevision: 'NEBULAR_PM2_RECIPE_REVISION',
  grantId: 'NEBULAR_PM2_GRANT_ID',
  grantGeneration: 'NEBULAR_PM2_GRANT_GENERATION',
  receiverId: 'NEBULAR_PM2_RECEIVER_ID',
  processAttemptId: 'NEBULAR_PM2_ATTEMPT_ID'
} as const);

export type ManagedAttemptEnvironmentPort = Readonly<{
  read: (name: string) => unknown;
  createExchangeId: () => unknown;
}>;

export type ManagedBootstrapRequestInput = Readonly<{
  slots: CreateBootstrapRequestInput['slots'];
}>;

type ManagedAttemptFacts = Readonly<{
  repository: unknown;
  recipeRevision: unknown;
  grantId: unknown;
  grantGeneration: number;
  receiverId: unknown;
  processAttemptId: unknown;
  exchangeId: unknown;
}>;

const invalidManagedAttempt = <Value>(): BrokerClientResult<Value> => clientErr({
  code: 'invalid-input',
  message: 'The current managed recipe authority environment is invalid.'
});

const readEnvironment = (
  port: ManagedAttemptEnvironmentPort,
  name: string
): BrokerClientResult<unknown> => clientTry(
  () => port.read(name),
  {
    code: 'invalid-input',
    message: 'The current managed recipe authority environment is unavailable.'
  }
);

const canonicalPositiveGeneration = (value: unknown): number | null => {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,9}$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && String(parsed) === value ? parsed : null;
};

const readManagedFacts = (
  port: ManagedAttemptEnvironmentPort
): BrokerClientResult<ManagedAttemptFacts> => readEnvironment(port, MANAGED_ATTEMPT_ENVIRONMENT.repository).andThen(repository =>
  readEnvironment(port, MANAGED_ATTEMPT_ENVIRONMENT.recipeRevision).andThen(recipeRevision =>
    readEnvironment(port, MANAGED_ATTEMPT_ENVIRONMENT.grantId).andThen(grantId =>
      readEnvironment(port, MANAGED_ATTEMPT_ENVIRONMENT.grantGeneration).andThen(rawGeneration => {
        const grantGeneration = canonicalPositiveGeneration(rawGeneration);
        if (grantGeneration === null) return invalidManagedAttempt<ManagedAttemptFacts>();
        return readEnvironment(port, MANAGED_ATTEMPT_ENVIRONMENT.receiverId).andThen(receiverId =>
          readEnvironment(port, MANAGED_ATTEMPT_ENVIRONMENT.processAttemptId).andThen(processAttemptId =>
            clientTry(
              () => port.createExchangeId(),
              {
                code: 'invalid-input',
                message: 'A bootstrap exchange identity could not be created.'
              }
            ).map((exchangeId): ManagedAttemptFacts => ({
              repository,
              recipeRevision,
              grantId,
              grantGeneration,
              receiverId,
              processAttemptId,
              exchangeId
            }))
          )
        );
      })
    )
  )
);

export const createManagedBootstrapRequest = (
  input: ManagedBootstrapRequestInput,
  port: ManagedAttemptEnvironmentPort
): BrokerClientResult<BootstrapRequestMessage> => readManagedFacts(port).andThen(facts =>
  createBootstrapRequest({ ...facts, slots: input.slots })
);

export const createBunManagedAttemptEnvironmentPort = (): ManagedAttemptEnvironmentPort => ({
  read: name => process.env[name],
  createExchangeId: () => crypto.randomUUID()
});
