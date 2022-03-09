import { MaybePromise } from "nexus/dist/core";
import { MaybeNull, MaybeNullable } from "./types";

import { ErrorValidationResultExtras, Validator } from ".";

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
  extras: ErrorValidationResultExtras = null,
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
