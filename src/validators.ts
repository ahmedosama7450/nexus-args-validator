import { isPromiseLike, MaybePromise } from "nexus/dist/core";

import { MaybeNull, MaybeNullable } from "./types";
import {
  ValidationResultError,
  ValidationResultErrorExtras,
  Validator,
} from ".";
import { reduceAsync } from "./utils";

/**
 * normal: (arg: T) -> validation passes in case of nullable (null/undefined)
 * strict: (arg: T | null | undefined) -> full control
 * strict-with-null: (arg: T | null) -> undefined is converted to null
 */
type NullabilityStrategy = "normal" | "strict" | "strict-with-null";

/**
 * Utility to easily create validators
 *
 * @param errorCode to use when validation fails
 * @param errorOrPassCondition depends on takeErrorCondition. Return either if validation fails or passes
 * @param extras returned along with error code when validation fails
 * @param takeErrorCondition Deal with errorOrPassCondition function as error condition. Defaults to true
 * @param nullabilityStrategy Defaults to normal
 */
export function defineValidator<T, S extends NullabilityStrategy = "normal">(
  errorCode: string,
  errorOrPassCondition: (
    arg: S extends "normal"
      ? T
      : S extends "strict"
      ? MaybeNullable<T>
      : MaybeNull<T>
  ) => MaybePromise<boolean>,
  extras: ValidationResultErrorExtras = null,
  takeErrorCondition = true,
  nullabilityStrategy?: S
): Validator<MaybeNullable<T>> {
  return (arg) => {
    if (!nullabilityStrategy || nullabilityStrategy === "normal") {
      if (arg === null || arg === undefined) {
        return undefined; // Validation passes
      }
    } else if (nullabilityStrategy === "strict-with-null") {
      if (arg === undefined) {
        arg = null;
      }
    }

    if (
      takeErrorCondition
        ? // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          errorOrPassCondition(arg)
        : // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          !errorOrPassCondition(arg)
    ) {
      return [errorCode, extras];
    } else {
      return undefined;
    }
  };
}

/**
 * @returns a new validator that passes when the original validator fails
 * and fails (with the given error) when the original validator passes
 */
export function notValidator<T>(
  validator: Validator<T>,
  error: ValidationResultError
): Validator<T> {
  return (arg) => {
    const validationResultOrPromise = validator(arg);

    if (isPromiseLike(validationResultOrPromise)) {
      return validationResultOrPromise.then((validatorResult) => {
        if (validatorResult === undefined) {
          return error;
        } else {
          return undefined;
        }
      });
    } else {
      if (validationResultOrPromise === undefined) {
        return error;
      } else {
        return undefined;
      }
    }
  };
}

/**
 * @param error If provided, this is used instead of the errors collected by child validators
 *
 * @returns new validator where at least one of the child validators has to pass in order for the resultant validator to pass. (OR logic)
 */
export function orValidators<T>(
  validators: [Validator<T>, Validator<T>, ...Validator<T>[]],
  error?: ValidationResultError
): Validator<T> {
  return (arg) => {
    return reduceAsync(
      validators,

      (_, validator) => validator(arg),

      (acc, validationResult, _, returnEarly) => {
        if (validationResult === undefined) {
          returnEarly(undefined);
        } else {
          acc.push(validationResult);
        }

        return acc;
      },

      [] as ValidationResultError[],

      (acc) => (acc.length === 0 ? undefined : error || acc)
    );
  };
}

/**
 * @param abortEarly
 * If `true`, Stop once a validation error is found (Short-circuit evaluation) which means the resultant
 * validator, when called, will return only one error (in case validation fails).
 * If `false`, the resultant validator, when called, will return an array of errors (in case validation fails).
 *
 * @param error If provided, this is used instead of the errors collected by child validators
 *
 * @returns new validator where child validators all have to pass in order for the resultant validator to pass. (AND logic)
 */
export function andValidators<T>(
  validators: [Validator<T>, Validator<T>, ...Validator<T>[]],
  abortEarly = true,
  error?: ValidationResultError
): Validator<T> {
  return (arg) => {
    return reduceAsync(
      validators,

      (_, validator) => validator(arg),

      (acc, validationResult, _, returnEarly) => {
        if (validationResult != undefined) {
          if (abortEarly) {
            returnEarly(error || validationResult);
          } else {
            if (error) returnEarly(error); // Saves us some time
            acc.push(validationResult);
          }
        }

        return acc;
      },

      [] as ValidationResultError[],

      (acc) => (acc.length === 0 ? undefined : error || acc)
    );
  };
}

//===================================
// Numbers
//===================================

/**
 * @returns number validator that fails when the number arg is above {@link n}
 */
export const max = (n: number, errorCode = "max") =>
  defineValidator<number>(errorCode, (arg) => arg > n, { n });

/**
 * @returns number validator that fails when the number arg is below {@link n}
 */
export const min = (n: number, errorCode = "min") =>
  defineValidator<number>(errorCode, (arg) => arg < n, { n });

/**
 * @returns number validator that fails when the number arg is not within the range [{@link lowerBound}, {@link upperBound}]
 */
export const range = (
  lowerBound: number,
  upperBound: number,
  errorCode = "range"
) =>
  defineValidator<number>(
    errorCode,
    (arg) => arg < lowerBound || arg > upperBound,
    { lowerBound, upperBound }
  );

//===================================
// Arrays
//===================================

/**
 * @returns array validator that fails when the array arg length is above {@link n}
 */
export const maxSize = (n: number, errorCode = "max-size") =>
  defineValidator<[] | string>(errorCode, (arg) => arg.length > n, { n });

/**
 * @returns array validator that fails when the array arg length is below {@link n}
 */
export const minSize = (n: number, errorCode = "min-size") =>
  defineValidator<[] | string>(errorCode, (arg) => arg.length < n, { n });

/**
 * @returns array validator that fails when the array arg length is not within the range [{@link lowerBound}, {@link upperBound}]
 */
export const rangeSize = (
  lowerBound: number,
  upperBound: number,
  errorCode = "range-size"
) =>
  defineValidator<[] | string>(
    errorCode,
    (arg) => arg.length < lowerBound || arg.length > upperBound,
    { lowerBound, upperBound }
  );

/**
 * @returns array validator that fails when the array arg is empty [{@link lowerBound}, {@link upperBound}]
 */
export const nonEmpty = (errorCode = "non-empty") =>
  defineValidator<[] | string>(errorCode, (arg) => arg.length === 0);

//===================================
// Strings
//===================================

/**
 * @returns string validator that fails when the string arg does not respect {@link regexp} [{@link lowerBound}, {@link upperBound}]
 */
export const pattern = (regexp: RegExp, errorCode = "pattern") =>
  defineValidator<string>(errorCode, (arg) => !regexp.test(arg), {
    regexp: regexp.source,
  });
