type State = 'open' | 'closed';

export const unboundedEffect = (): void => {
  Promise.resolve('unhandled');
  throw new Error('expected failure escaped its typed channel');
};

export const incompleteState = (state: State): number => {
  switch (state) {
    case 'open': return 1;
  }
};
