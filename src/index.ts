import { plugin } from "nexus";
import {
  ArgsValue,
  completeValue,
  MaybePromise,
  printedGenTyping,
  printedGenTypingImport,
  isPromiseLike,
} from "nexus/dist/core";
import { join } from "path";

import { assignObjectAt } from "./utils";
import { Resolver } from "./types";

/**
 * undefined means validation passed
 */
export type ValidationResult = ErrorValidationResult | undefined;

/**
 * First element represents error code
 *
 * Second element represents any extras related to validation
 */
export type ErrorValidationResult = [string, ErrorValidationResultExtras];

export type ErrorValidationResultExtras = {
  [key: string]: number | string | boolean;
} | null;

export type ErrorsTree = {
  [key: string]: ErrorValidationResult | ErrorsTree;
};

export type MaybeErrorsTree = ErrorsTree | null;

export type Validator<T> = (arg: T) => MaybePromise<ValidationResult>;

export type Transformer<T> = (arg: T) => MaybePromise<T>;

/**
 * Could be a validator or transformer.
 *
 * `T` is arg type
 *
 * `R` is what is return, It' ValidationResult in case of validators, T in case of transformers
 */
type Executor<T, R> = (arg: T) => MaybePromise<R>;

type GeneralArgsValue = { [key: string]: any };

/* type ArgsTreeValue<
  key extends keyof Args,
  T extends string,
  F extends string,
  E extends Function,
  B,
  Args extends ArgsValue<T, F>
> = Args[key] extends { [key: string]: any } ? B : E | E[];
 */

type BaseValidatorTree<
  T extends string,
  F extends string,
  Args extends ArgsValue<string, string>
> = {
  [key in keyof Args]?: Args[key] extends
    | { [key: string]: any }
    | null
    | undefined
    ?
        | BaseValidatorTree<T, F, Args[key]>
        | Validator<Args[key]>
        | Validator<Args[key]>[]
    : Validator<Args[key]> | Validator<Args[key]>[];
};

type ValidatorTree<
  TypeName extends string,
  FieldName extends string
> = BaseValidatorTree<TypeName, FieldName, ArgsValue<TypeName, FieldName>>;

type BaseTransformerTree<
  T extends string,
  F extends string,
  Args extends ArgsValue<string, string>
> = {
  [key in keyof Args]?: Args[key] extends
    | { [key: string]: any }
    | null
    | undefined
    ?
        | BaseTransformerTree<T, F, Args[key]>
        | Transformer<Args[key]>
        | Transformer<Args[key]>[]
    : Transformer<Args[key]> | Transformer<Args[key]>[];
};

type TransformerTree<
  TypeName extends string,
  FieldName extends string
> = BaseTransformerTree<TypeName, FieldName, ArgsValue<TypeName, FieldName>>;

type BaseExecutorTree<Args extends ArgsValue<string, string>, R> = {
  [key in keyof Args]?: Args[key] extends
    | { [key: string]: any }
    | null
    | undefined
    ?
        | BaseExecutorTree<Args[key], R>
        | Executor<Args[key], R>
        | Executor<Args[key], R>[]
    : Executor<Args[key], R> | Executor<Args[key], R>[];
};

type ExecutorTree<R> = BaseExecutorTree<ArgsValue<string, string>, R>;

export type ValidateResolver<
  TypeName extends string,
  FieldName extends string
> = Resolver<TypeName, FieldName, ValidatorTree<TypeName, FieldName>>;

export type TransformResolver<
  TypeName extends string,
  FieldName extends string
> = Resolver<TypeName, FieldName, TransformerTree<TypeName, FieldName>>;

export interface ArgsValidatorPluginConfig {
  onValidationError: (errorsTree: ErrorsTree) => void;
}

export const argsValidatorPlugin = ({
  onValidationError,
}: ArgsValidatorPluginConfig) =>
  plugin({
    name: "Args Validator / Transformer plugin",

    description: "Plugin for validation and transformation of arguments",

    fieldDefTypes: [
      printedGenTyping({
        optional: true,
        name: "validate",
        description: "Validation for arguments",
        type: "ValidateResolver<TypeName, FieldName>",
        imports: [
          printedGenTypingImport({
            module: join(__dirname, "."),
            bindings: ["ValidateResolver"],
          }),
        ],
      }),
      printedGenTyping({
        optional: true,
        name: "transform",
        description: "Transformation for arguments",
        type: "TransformResolver<TypeName, FieldName>",
        imports: [
          printedGenTypingImport({
            module: join(__dirname, "."),
            bindings: ["TransformResolver"],
          }),
        ],
      }),
    ],

    onCreateFieldResolver(config) {
      const validate: ValidateResolver<string, string> =
        config.fieldConfig.extensions?.nexus?.config.validate;

      const transform: TransformResolver<string, string> =
        config.fieldConfig.extensions?.nexus?.config.transform;

      // If both fields don't exist, our work is done here
      if (validate === null && transform === null) {
        return;
      }

      // If any of them is not a function, it's wrong - let's provide a warning
      if (
        (validate && typeof validate !== "function") ||
        (transform && typeof transform !== "function")
      ) {
        console.error(
          new Error(
            `The validate or transform property provided to ${
              config.fieldConfig.name
            } with type ${
              config.fieldConfig.type
            } should be a function, saw ${typeof validate}`
          )
        );
        return;
      }

      return (root, args: GeneralArgsValue | undefined, ctx, info, next) => {
        if (!args) return next(root, args, ctx, info);

        const transformedArgsOrPromise = transform
          ? applyTransforms(args, transform(root, args, ctx, info))
          : args;

        return completeValue(transformedArgsOrPromise, (transformedArgs) => {
          if (validate) {
            const errorsTreeOrPromise = findErrors(
              transformedArgs,
              validate(root, transformedArgs, ctx, info)
            );

            return completeValue(errorsTreeOrPromise, (errorsTree) => {
              if (errorsTree) {
                onValidationError(errorsTree);
              } else {
                return next(root, transformedArgs, ctx, info);
              }
            });
          } else {
            return next(root, transformedArgs, ctx, info);
          }
        });
      };
    },
  });

function findErrors(
  args: GeneralArgsValue,
  validatorTree: ValidatorTree<string, string>
): MaybePromise<MaybeErrorsTree> {
  return execute<unknown, ValidationResult>(
    args,
    validatorTree,
    combineValidators,
    (result) => result != undefined
  );
}

function applyTransforms(
  args: GeneralArgsValue,
  transformerTree: TransformerTree<"", "">
): MaybePromise<GeneralArgsValue> {
  // Guaranteed not to be null because it takes same form as args which shouldn't be null;
  return execute<unknown, unknown>(args, transformerTree, combineTransformers)!;
}

export function combineValidators<T>(validators: Validator<T>[]): Validator<T> {
  return (arg) => {
    for (let i = 0; i < validators.length; i++) {
      const validationResultOrPromise = validators[i](arg);

      if (isPromiseLike(validationResultOrPromise)) {
        // Now, We can return a promise
        return Promise.all(
          validators.reduce(
            (acc, currentValidator, curIndex) => {
              if (curIndex > i) {
                acc.push(currentValidator(arg));
              }

              return acc;
            },
            [validationResultOrPromise] as MaybePromise<ValidationResult>[]
          )
        ).then((validationResults) => {
          for (const validationResult of validationResults) {
            if (validationResult != undefined) {
              return validationResult;
            }
          }
          return undefined;
        });
      } else {
        if (validationResultOrPromise !== undefined) {
          return validationResultOrPromise;
        }
      }
    }

    return undefined;
  };
}

export function combineTransformers<T>(
  transformers: Transformer<T>[]
): Transformer<T> {
  return (arg) => {
    let lastTransformedArg = arg;
    for (let i = 0; i < transformers.length; i++) {
      const transformedArgOrPromise = transformers[i](lastTransformedArg);

      if (isPromiseLike(transformedArgOrPromise)) {
        // Now, We can return a promise
        return Promise.all(
          transformers.reduce(
            (acc, currentTransformer, curIndex) => {
              if (curIndex > i) {
                acc.push(currentTransformer(arg));
              }

              return acc;
            },
            [transformedArgOrPromise] as MaybePromise<T>[]
          )
        ).then((asyncTransformedArgs) => {
          for (const transformedArg of asyncTransformedArgs) {
            lastTransformedArg = transformedArg;
          }
          return lastTransformedArg;
        });
      } else {
        lastTransformedArg = transformedArgOrPromise;
      }
    }

    return lastTransformedArg;
  };
}

type ResultAssignCondition<R> = (result: R) => boolean;

/**
 * Could be ErrorsTree in case of validators, args in case of transformers
 */
type ExecutionResultTree = { [key: string]: any };

type MaybeExecutionResultTree = ExecutionResultTree | null;

/**
 * @param resultAssignCondition if defined the returned tree will only be part of args structure, used with validators
 * to only include the args with errors
 */
function execute<T, R>(
  args: GeneralArgsValue,
  executorTree: ExecutorTree<R>,
  combineExecutors: (executors: Executor<T, R>[]) => Executor<T, R>,
  resultAssignCondition?: ResultAssignCondition<R>
): MaybePromise<MaybeExecutionResultTree> {
  const asyncExecutors: PromiseLike<R>[] = [];
  const asyncExecutorsAccessKeys: string[][] = [];

  let maybeExecutionResultTree = executeHelper<T, R>(
    args,
    executorTree,

    [],

    asyncExecutors,
    asyncExecutorsAccessKeys,

    combineExecutors,
    resultAssignCondition
  );

  if (asyncExecutors.length !== 0) {
    // Alright, we have async stuff that needs to be resolved and appended to the execution result tree
    return Promise.all(asyncExecutors).then((results) => {
      for (let i = 0; i < results.length; i++) {
        const result = results[i];

        // We only ever need to do anything if resultAssignCondition is undefined or when it evaluates to true
        if (!resultAssignCondition || resultAssignCondition(result)) {
          if (!maybeExecutionResultTree) {
            maybeExecutionResultTree = {};
          }

          assignObjectAt(
            maybeExecutionResultTree,
            asyncExecutorsAccessKeys[i],
            result
          );
        }
      }

      return maybeExecutionResultTree;
    });
  }

  return maybeExecutionResultTree;
}

function executeHelper<T, R>(
  args: GeneralArgsValue,
  executorTree: ExecutorTree<R>,

  accessKey: string[],

  asyncExecutors: PromiseLike<R>[],
  asyncExecutorsAccessKeys: string[][],

  combineExecutors: (executors: Executor<T, R>[]) => Executor<T, R>,
  resultAssignCondition?: ResultAssignCondition<R>
): MaybeExecutionResultTree {
  // We only pick the fields that satisfy the condition or the result is null if none satisfies
  let maybeExecutionResultTree: MaybeExecutionResultTree = resultAssignCondition
    ? null
    : args;

  const executorTreeKeys = Object.keys(executorTree);

  if (executorTreeKeys.length !== 0) {
    accessKey.push("");
  }

  for (const key of executorTreeKeys) {
    const executorOrExecutorTree = executorTree[key];

    accessKey[accessKey.length - 1] = key;

    if (
      typeof executorOrExecutorTree === "function" ||
      Array.isArray(executorOrExecutorTree)
    ) {
      // This is indeed an executor or array of executors
      let resultOrPromise;
      if (Array.isArray(executorOrExecutorTree)) {
        resultOrPromise = combineExecutors(executorOrExecutorTree)(args[key]);
      } else {
        resultOrPromise = executorOrExecutorTree(args[key]);
      }

      if (isPromiseLike(resultOrPromise)) {
        asyncExecutors.push(resultOrPromise);
        asyncExecutorsAccessKeys.push([...accessKey]);
      } else {
        // We only ever need to do anything if resultAssignCondition is undefined or when it evaluates to true
        if (!resultAssignCondition || resultAssignCondition(resultOrPromise)) {
          if (!maybeExecutionResultTree) {
            maybeExecutionResultTree = {};
          }
          maybeExecutionResultTree[key] = resultOrPromise;
        }
      }
    } else if (typeof executorOrExecutorTree !== "undefined") {
      const arg = args[key];

      if (arg) {
        // This is nested tree of executors, we need to recursively traverse the tree
        const maybeExecutionResultTreeBranch = executeHelper(
          args[key],
          executorOrExecutorTree,

          [...accessKey],

          asyncExecutors,
          asyncExecutorsAccessKeys,

          combineExecutors,
          resultAssignCondition
        );

        if (maybeExecutionResultTreeBranch) {
          if (!maybeExecutionResultTree) {
            maybeExecutionResultTree = {};
          }
          maybeExecutionResultTree[key] = maybeExecutionResultTreeBranch;
        }
      } else {
        // We only ever need to do anything if resultAssignCondition is undefined or when it evaluates to true
        if (!resultAssignCondition || resultAssignCondition(arg)) {
          if (!maybeExecutionResultTree) {
            maybeExecutionResultTree = {};
          }
          maybeExecutionResultTree[key] = arg;
        }
      }
    }
  }

  return maybeExecutionResultTree;
}

/*
function combineExecutors<T, R>(
  executors: Executor<T, R>[],
  resultAssignCondition?: (result: unknown) => boolean,
  def?: R
): Executor<T, R> {
  return (arg) => {
    let helper: R = arg;
    for (let i = 0; i < executors.length; i++) {
      const resultOrPromise = executors[i](
        resultAssignCondition ? arg : helper
      );

      if (isPromiseLike(resultOrPromise)) {
        // Stop, We need to return a promise
        return Promise.all(
          executors.reduce(
            (acc, currentValidator, curIndex) => {
              if (curIndex > i) {
                acc.push(currentValidator(arg));
              }
              return acc;
            },
            [resultOrPromise] as MaybePromise<R>[]
          )
        ).then((results) => {
          for (const result of results) {
            if (resultAssignCondition) {
              if (resultAssignCondition(result)) return result;
            } else {
              helper = result;
            }
          }

          if (resultAssignCondition) return helper;
          else return def || helper;
        });
      } else {
        if (resultAssignCondition) {
          if (resultAssignCondition(resultOrPromise)) return resultOrPromise;
        } else {
          helper = resultOrPromise;
        }
      }
    }

    return def || helper;
  };
}

*/

/* export function combineExecutors(executors: Executor[]): Executor {
  return (value) => {
    for (let i = 0; i < executors.length; i++) {
      const resultOrPromise = executors[i](value);

      if (isPromiseLike(resultOrPromise)) {
        // Stop, We need to return a promise
        return Promise.all(
          [
            resultOrPromise,
            ...executors.slice(i + 1).map((validator) => validator(value)),
          ]
        ).then((results) => {
          for (const result of results) {
            if (result != undefined) {
              return result;
            }
          }
          return undefined;
        });
      } else {
        if (resultOrPromise !== undefined) {
          return resultOrPromise;
        }
      }
    }

    return undefined;
  };
}
 */

/*

/*
function applyTransformss(
  args: GeneralArgsValue,
  transformerTree: GeneralTransformerTree
): MaybePromise<GeneralArgsValue> {
  const asyncTransformers: PromiseLike<any>[] = [];
  const asyncTransformersAccessKeys: string[][] = [];

  let transformedArgs = applyTransformsHelper(
    args,
    transformerTree,

    [],

    asyncTransformers,
    asyncTransformersAccessKeys
  );

  if (asyncTransformers.length !== 0) {
    // Alright, we have async transformation that needs to be resolved
    return Promise.all(asyncTransformers).then((asynTransformedArgs) => {
      for (let i = 0; i < asynTransformedArgs.length; i++) {
        const transformedArg = asynTransformedArgs[i];

        const accessKey = asyncTransformersAccessKeys[i];
        const lastAccessKey = accessKey.length - 1;

        let accessBranch = transformedArgs;
        for (let i = 0; i < lastAccessKey; i++) {
          accessBranch = accessBranch[accessKey[i]];
        }

        accessBranch[accessKey[lastAccessKey]] = transformedArg;
      }

      return transformedArgs;
    });
  }

  return transformedArgs;
}

function applyTransformsHelper(
  args: GeneralArgsValue,
  transformerTree: GeneralTransformerTree,

  accessKey: string[],

  asyncTransformers: PromiseLike<any>[],
  asyncTransformersAccessKeys: string[][]
): GeneralArgsValue {
  let transformedArgs: GeneralArgsValue = args;

  const transformerTreeKeys = Object.keys(transformerTree);

  if (transformerTreeKeys.length !== 0) {
    accessKey.push("");
  }

  for (const key of transformerTreeKeys) {
    const transformerOrTransformerTree = transformerTree[key];

    accessKey[accessKey.length - 1] = key;

    if (
      typeof transformerOrTransformerTree === "function" ||
      Array.isArray(transformerOrTransformerTree)
    ) {
      // This is indeed a validator or array of validatots
      let transformedArgOrPromise;
      if (Array.isArray(transformerOrTransformerTree)) {
        transformedArgOrPromise = combineTransformers(
          transformerOrTransformerTree
        )(args[key]);
      } else {
        transformedArgOrPromise = transformerOrTransformerTree(args[key]);
      }

      if (isPromiseLike(transformedArgOrPromise)) {
        asyncTransformers.push(transformedArgOrPromise);
        asyncTransformersAccessKeys.push(accessKey);
      } else {
        transformedArgs[key] = transformedArgOrPromise;
      }
    } else if (typeof transformerOrTransformerTree !== "undefined") {
      // We need to recursively traverse the tree
      const branchErrorsTree = applyTransformsHelper(
        args[key],
        transformerOrTransformerTree,

        [...accessKey],

        asyncTransformers,
        asyncTransformersAccessKeys
      );

      if (branchErrorsTree) {
        if (!transformedArgs) {
          transformedArgs = {};
        }
        transformedArgs[key] = branchErrorsTree;
      }
    }
  }

  return transformedArgs;
}


function findErrorss(
  args: GeneralArgsValue,
  validatorTree: GeneralValidatorTree
): MaybePromise<MaybeErrorsTree> {
  const asyncValidators: PromiseLike<ValidationResult>[] = [];
  const asyncValidatorsAccessKeys: string[][] = [];

  let errorsTree = findErrorsHelper(
    args,
    validatorTree,

    [],

    asyncValidators,
    asyncValidatorsAccessKeys
  );

  if (asyncValidators.length !== 0) {
    // Alright, we have async validaition that needs to be resolved
    return Promise.all(asyncValidators).then((validationResults) => {
      for (let i = 0; i < validationResults.length; i++) {
        const validationResult = validationResults[i];

        if (validationResult !== undefined) {
          // Validation failed

          if (!errorsTree) {
            errorsTree = {};
          }

          const accessKey = asyncValidatorsAccessKeys[i];
          const lastAccessKey = accessKey.length - 1;

          let accessBranch = errorsTree;
          for (let i = 0; i < lastAccessKey; i++) {
            accessBranch = accessBranch[accessKey[i]] as ErrorsTree;
          }

          accessBranch[accessKey[lastAccessKey]] = validationResult;
        }
      }

      return errorsTree;
    });
  }

  return errorsTree;
}

function findErrorsHelper(
  args: GeneralArgsValue,
  validatorTree: GeneralValidatorTree,

  accessKey: string[],

  asyncValidators: PromiseLike<ValidationResult>[],
  asyncValidatorsAccessKeys: string[][]
): MaybeErrorsTree {
  let errorsTree: MaybeErrorsTree = null;

  const validatorTreeKeys = Object.keys(validatorTree);

  if (validatorTreeKeys.length !== 0) {
    accessKey.push("");
  }

  for (const key of validatorTreeKeys) {
    const validatorOrValidatorTree = validatorTree[key];

    accessKey[accessKey.length - 1] = key;

    if (
      typeof validatorOrValidatorTree === "function" ||
      Array.isArray(validatorOrValidatorTree)
    ) {
      // This is indeed a validator or array of validatots
      let validationDataOrPromise;
      if (Array.isArray(validatorOrValidatorTree)) {
        validationDataOrPromise = combineValidators(validatorOrValidatorTree)(
          args[key]
        );
      } else {
        validationDataOrPromise = validatorOrValidatorTree(args[key]);
      }

      if (isPromiseLike(validationDataOrPromise)) {
        asyncValidators.push(validationDataOrPromise);
        asyncValidatorsAccessKeys.push(accessKey);
      } else {
        const validationResult = validationDataOrPromise;
        if (validationResult !== undefined) {
          if (!errorsTree) {
            errorsTree = {};
          }
          errorsTree[key] = validationResult;
        }
      }
    } else if (typeof validatorOrValidatorTree !== "undefined") {
      // We need to recursively traverse the tree
      const branchErrorsTree = findErrorsHelper(
        args[key],
        validatorOrValidatorTree,

        [...accessKey],

        asyncValidators,
        asyncValidatorsAccessKeys
      );

      if (branchErrorsTree) {
        if (!errorsTree) {
          errorsTree = {};
        }
        errorsTree[key] = branchErrorsTree;
      }
    }
  }

  return errorsTree;
}


/* export function combineValidatorsUsingGenerators<T>(
  ...validators: Validator<T>[]
): Validator<T> {
  const gen = function* (value: T) {
    for (const validator of validators) {
      const validationDataOrPromise = validator(value);
      if (isPromiseLike(validationDataOrPromise)) {
        yield validationDataOrPromise;
      } else {
        const [pass] = validationDataOrPromise;
        if (!pass) {
          return validationDataOrPromise;
        }
      }
    }
  };

  async function helper(generator: ReturnType<typeof gen>) {
    for (const asyncValidator of generator) {
      const v = await asyncValidator;
      const [pass] = v;
      if (!pass) {
        return v;
      }
    }
  }

  return (value) => {
    const g = gen(value);
    const a = g.next().value;

    if (isPromiseLike(a)) {
      return Promise.all([a, helper(g)]).then((values) => {
        if (!values[0][0]) {
          return values[0];
        } else if (values[1]) {
          if (!values[1][0]) {
            return values[1];
          }
        }
        return [true, ""];
      });
    } else if (!a) {
      return [true, ""];
    } else {
      return a;
    }
  };
} */

/* export function combineSyncValidators<T>(
  ...validators: SyncValidator<T>[]
): SyncValidator<T> {
  return (value) => {
    for (const validator of validators) {
      const validaitonData = validator(value);
      if (!validaitonData[0]) {
        return validaitonData;
      }
    }

    return [true, ""];
  };
}
 */
