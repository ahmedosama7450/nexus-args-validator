import { ArgsValue, isPromiseLike, MaybePromise } from "nexus/dist/core";

import { GeneralArgsValue } from "./types";

export function assignObjectAt(
  obj: object,
  accessKey: readonly string[],
  value: any
) {
  let objBranch: any = obj;
  const lastKeyPartIndex = accessKey.length - 1;

  for (let i = 0; i < lastKeyPartIndex; i++) {
    const keyPart = accessKey[i];
    if (!objBranch[keyPart]) {
      objBranch[keyPart] = {};
    }
    objBranch = objBranch[keyPart];
  }

  objBranch[accessKey[lastKeyPartIndex]] = value;
}

/**
 * Could be a validator or transformer.
 *
 * `T` is arg type
 *
 * `R` is what is return, It' ValidationResult in case of validators, T in case of transformers
 */
type Executor<T, R> = (arg: T) => MaybePromise<R>;

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
export function execute<T, R>(
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
        if (!resultAssignCondition) {
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
