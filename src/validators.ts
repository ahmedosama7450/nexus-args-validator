import { isPromiseLike, MaybePromise } from "nexus/dist/core";

import { MaybeNull, MaybeNullable } from "./types";
import {
  ValidationResultError,
  ValidationResultErrorExtras,
  Validator,
} from ".";
import { reduceAsync } from "./utils";

// TODO Maybe find a way to make sure that error codes are unique (e.g. make error code same as name as validator function)

/**
 * normal: (arg: T) -> validation passes in case of nullable (null/undefined)
 * strict: (arg: T | null | undefined) -> full control
 * strict-with-null: (arg: T | null) -> undefined is converted to null
 */
type NullabilityStrategy = "normal" | "strict" | "strict-with-null";

/**
 * @param errorCode
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
  takeErrorCondition: boolean = true,
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
        ? // @ts-ignore
          errorOrPassCondition(arg)
        : // @ts-ignore
          !errorOrPassCondition(arg)
    ) {
      return [errorCode, extras];
    } else {
      return undefined;
    }
  };
}

/**
 *
 * @param error If not provided, the original result is kept but error code string is prefixed with `not`
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

export function orValidators<T>(
  validators: [Validator<T>, Validator<T>, ...Validator<T>[]],
  error?: ValidationResultError
): Validator<T> {
  return (arg) => {
    return reduceAsync(
      validators,

      (acc, validator, i) => validator(arg),

      (acc, validationResult, i, returnEarly) => {
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
 * @param validators array of validators to be combined
 *
 * @param abortEarly If `true`, stop once a validation error is found.
 * If `false`, the resultant validator, when called, will return an array of errors (if there is any).
 *
 * @param error If provided,this is used instead of the errors collected by child validators
 *
 * @returns new validator where child validators all have to pass in order for the resultant validator to pass. (AND logic)
 */
export function andValidators<T>(
  validators: [Validator<T>, Validator<T>, ...Validator<T>[]],
  abortEarly: boolean = true,
  error?: ValidationResultError
): Validator<T> {
  return (arg) => {
    return reduceAsync(
      validators,

      (acc, validator, i) => validator(arg),

      (acc, validationResult, i, returnEarly) => {
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

export const max = (n: number) =>
  defineValidator<number>("max", (arg) => arg > n, { n });

export const min = (n: number) =>
  defineValidator<number>("min", (arg) => arg < n, { n });

export const range = (lowerBound: number, upperBound: number) =>
  defineValidator<number>(
    "range",
    (arg) => arg < lowerBound || arg > upperBound,
    { lowerBound, upperBound }
  );

//===================================
// Arrays
//===================================

export const maxSize = (n: number) =>
  defineValidator<[] | string>("max-size", (arg) => arg.length > n, { n });

export const minSize = (n: number) =>
  defineValidator<[] | string>("min-size", (arg) => arg.length < n, { n });

export const rangeSize = (lowerBound: number, upperBound: number) =>
  defineValidator<[] | string>(
    "range-size",
    (arg) => arg.length < lowerBound || arg.length > upperBound,
    { lowerBound, upperBound }
  );

export const nonEmpty = defineValidator<[] | string>(
  "non-empty",
  (arg) => arg.length > 0
);

//===================================
// Strings
//===================================

export const pattern = (regexp: RegExp) =>
  defineValidator<string>("pattern", (arg) => !regexp.test(arg), {
    regexp: regexp.source,
  });

const isUrl = (s: string) => {
  // TODO (import isUrl from "is-url-superb";) produces an error
  return true;
};

export const validUrl = defineValidator<string>(
  "invalid-url",
  (arg) => !isUrl(arg)
);

export const validUrls = defineValidator<string[]>("invalid-urls", (arg) =>
  arg.some((el) => !isUrl(el))
);
