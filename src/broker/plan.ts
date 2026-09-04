import { brokerErr, brokerOk, type BrokerResult } from './result.ts';

export type BrokerPlanAuthority = 'none' | 'grant' | 'provider' | 'lease';
export type BrokerPlanExposure =
  | 'none'
  | 'opaque-handle'
  | 'provider-operation'
  | 'child-environment'
  | 'transfer-encryption'
  | 'elevated-raw';
export type BrokerPlanConfirmation = 'none' | 'standard' | 'elevated';
export type BrokerPlanRetry = 'never' | 'idempotent' | 'conditional-on-version' | 'resume-from-journal';

export type BrokerPlanStep = Readonly<{
  id: string;
  kind: string;
  dependsOn: readonly string[];
  authority: BrokerPlanAuthority;
  resources: readonly string[];
  exposure: BrokerPlanExposure;
  confirmation: BrokerPlanConfirmation;
  deadlineMs: number;
  idempotencyKey: string;
  retry: BrokerPlanRetry;
  verification: string;
  reversible: boolean;
  rollback: string | null;
  journalRequired: boolean;
}>;

export type BrokerPlan = Readonly<{
  state: 'planned';
  steps: readonly BrokerPlanStep[];
  confirmations: readonly BrokerPlanConfirmation[];
}>;

const ID: Readonly<RegExp> = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const RESOURCE: Readonly<RegExp> = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;

const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

const unique = (values: readonly string[]): boolean => new Set(values).size === values.length;

const validText = (value: string, maximum = 256): boolean =>
  value.length > 0 && value.length <= maximum && !value.includes('\0');

const stepInvalid = <Value = never>(message: string): BrokerResult<Value> => brokerErr({
  code: 'process-plan-invalid',
  message
});

const validStepShape = (step: BrokerPlanStep): boolean =>
  ID.test(step.id) && validText(step.kind) && unique(step.dependsOn) && step.dependsOn.every(value => ID.test(value)) &&
  unique(step.resources) && step.resources.every(resource => RESOURCE.test(resource)) &&
  Number.isSafeInteger(step.deadlineMs) && step.deadlineMs > 0 && ID.test(step.idempotencyKey) &&
  validText(step.verification, 1024) &&
  (step.reversible ? validText(step.rollback ?? '', 1024) : step.rollback === null) &&
  !(step.exposure !== 'none' && step.authority === 'none') &&
  !(step.exposure === 'elevated-raw' && step.confirmation !== 'elevated') &&
  !((step.exposure === 'child-environment' || step.exposure === 'transfer-encryption') &&
    step.confirmation === 'none') &&
  !(step.retry === 'resume-from-journal' && !step.journalRequired) &&
  !(!step.reversible && !step.journalRequired);

const stepById = (steps: readonly BrokerPlanStep[], id: string): BrokerPlanStep | undefined =>
  steps.find(step => step.id === id);

const hasDependencyPath = (
  steps: readonly BrokerPlanStep[],
  from: string,
  to: string,
  seen: readonly string[] = []
): boolean => {
  if (from === to) return true;
  if (seen.includes(from)) return false;
  const step = stepById(steps, from);
  return step?.dependsOn.some(dependency => hasDependencyPath(steps, dependency, to, [...seen, from])) === true;
};

const hasResourceConflict = (steps: readonly BrokerPlanStep[], index = 0): boolean => {
  const step = steps[index];
  if (step === undefined) return false;
  const conflicts = steps.slice(index + 1).some(candidate =>
    step.resources.some(resource => candidate.resources.includes(resource)) &&
    !hasDependencyPath(steps, step.id, candidate.id) &&
    !hasDependencyPath(steps, candidate.id, step.id)
  );
  return conflicts || hasResourceConflict(steps, index + 1);
};

const hasCycle = (
  steps: readonly BrokerPlanStep[],
  step: BrokerPlanStep,
  seen: readonly string[] = []
): boolean => step.dependsOn.some(dependency => {
  const dependent = stepById(steps, dependency);
  return dependency === step.id || seen.includes(dependency) ||
    (dependent !== undefined && hasCycle(steps, dependent, [...seen, step.id]));
});

const orderSteps = (
  pending: readonly BrokerPlanStep[],
  ordered: readonly BrokerPlanStep[] = []
): BrokerResult<readonly BrokerPlanStep[]> => {
  if (pending.length === 0) return brokerOk(ordered);
  const ready: readonly BrokerPlanStep[] = pending.filter(step => step.dependsOn.every(dependency => ordered.some(candidate => candidate.id === dependency)))
    .toSorted((left, right) => compareText(left.id, right.id));
  if (ready.length === 0) return stepInvalid('Broker plan contains a dependency cycle.');
  return orderSteps(pending.filter(step => !ready.some(candidate => candidate.id === step.id)), [...ordered, ...ready]);
};

const confirmationOrder = (value: BrokerPlanConfirmation): number =>
  value === 'none' ? 0 : value === 'standard' ? 1 : 2;

const planConfirmations = (steps: readonly BrokerPlanStep[]): readonly BrokerPlanConfirmation[] =>
  [...new Set(steps.map(step => step.confirmation).filter(value => value !== 'none'))]
    .toSorted((left, right) => confirmationOrder(left) - confirmationOrder(right));

export const createBrokerPlan = (steps: readonly BrokerPlanStep[]): BrokerResult<BrokerPlan> => {
  if (steps.length > 256 || !steps.every(validStepShape) || !unique(steps.map(step => step.id))) {
    return stepInvalid('Broker plan step shape or identity is invalid.');
  }
  if (steps.some(step => step.dependsOn.some(dependency => stepById(steps, dependency) === undefined))) {
    return stepInvalid('Broker plan has a missing dependency.');
  }
  if (steps.some(step => hasCycle(steps, step))) return stepInvalid('Broker plan contains a dependency cycle.');
  if (hasResourceConflict(steps)) return stepInvalid('Broker plan has an unordered resource conflict.');
  const ordered = orderSteps(steps);
  return ordered.isErr()
    ? brokerErr(...ordered.error)
    : brokerOk({ state: 'planned', steps: ordered.value, confirmations: planConfirmations(ordered.value) });
};

export const composeBrokerPlans = (
  left: BrokerPlan,
  right: BrokerPlan
): BrokerResult<BrokerPlan> => createBrokerPlan([...left.steps, ...right.steps]);
