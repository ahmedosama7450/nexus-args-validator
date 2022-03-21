import { applyTransforms, findErrors, Transformer, Validator } from "../src";

const args1 = {
  firstName: "ahmed",
  lastName: "osama",
  age: 20,
  profile: {
    bio: "Hi there",
  },
  job: "developer",
};

const args2: typeof args1 = {
  firstName: "ahmedb",
  lastName: "osama",
  age: 15,
  profile: {
    bio: "Hi there. Hi there. Hi there. Hi there.",
  },
  job: "developer",
};

type SimpleValidatorTree = BaseSimpleValidatorTree<typeof args1>;

type BaseSimpleValidatorTree<T> = {
  [key in keyof T]?:
    | Validator<T[key]>
    | Validator<T[key]>[]
    | BaseSimpleValidatorTree<T[key]>;
};

const validatorTree: SimpleValidatorTree = {
  firstName: [
    (arg) => (!arg.startsWith("a") ? ["must-start-with-a", null] : undefined),
    (arg) => (!arg.endsWith("d") ? ["must-end-with-d", null] : undefined),
  ],
  age: (arg) => (arg < 18 ? ["older-than-18", null] : undefined),
  profile: {
    bio: (arg) => (arg.length > 12 ? ["too-long", null] : undefined),
  },
};

type SimpleTransformerTree = BaseSimpleTransformerTree<typeof args1>;

type BaseSimpleTransformerTree<T> = {
  [key in keyof T]?:
    | Transformer<T[key]>
    | Transformer<T[key]>[]
    | BaseSimpleTransformerTree<T[key]>;
};

const transformerTree: SimpleTransformerTree = {
  firstName: (arg) => arg + " hello",
  age: (arg) => arg - 2,
  profile: {
    bio: () => "new bio",
  },
};

test("findErrors", () => {
  expect(findErrors(args1, validatorTree as any, true)).toBeNull();

  expect(findErrors(args2, validatorTree as any, true)).toStrictEqual({
    firstName: ["must-end-with-d", null],
  });

  expect(findErrors(args1, validatorTree as any, false)).toBeNull();

  expect(findErrors(args2, validatorTree as any, false)).toStrictEqual({
    age: ["older-than-18", null],
    firstName: ["must-end-with-d", null],
    profile: {
      bio: ["too-long", null],
    },
  });
});

test("applyTransforms", () => {
  expect(applyTransforms(args1, transformerTree as any)).toStrictEqual({
    age: 18,
    firstName: "ahmed hello",
    job: "developer",
    lastName: "osama",
    profile: { bio: "new bio" },
  });
});
