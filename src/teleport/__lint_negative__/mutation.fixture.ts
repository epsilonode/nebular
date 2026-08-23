export const mutate = (input: readonly number[]): readonly number[] => {
  let output = [...input];
  output.push(1);
  return output;
};
