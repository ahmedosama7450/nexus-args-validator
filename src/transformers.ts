import { MaybeNullable } from "./types";
import { reduceAsync } from "./utils";
import { Transformer } from ".";

/**
 * @returns a new transformer where child transformers are piped one after the other in order such that
 * the output of each previous transformer is the input of the next transformer.
 */
export function combineTransformers<T>(
  transformers: [Transformer<T>, Transformer<T>, ...Transformer<T>[]]
): Transformer<T> {
  return (arg) => {
    return reduceAsync(
      transformers,
      (acc, currentItem) => currentItem(acc),
      (_, currentValue) => currentValue,
      arg
    );
  };
}

//===================================
// General
//===================================

/**
 * @returns transformer that sets default value for the argument when it's undefined or null
 */
export const defaulted: <T>(defaultValue: T) => Transformer<T> =
  (defaultValue) => (value) => {
    return value === null || value === undefined ? defaultValue : value;
  };

//===================================
// Strings
//===================================

/**
 * string transformer that trims the string arg
 */
export const trim: Transformer<string> = (arg) => {
  return arg.trim();
};

/**
 * Same as {@link trim} but handles null and undefined values
 */
export const trimNullable: Transformer<MaybeNullable<string>> = (arg) => {
  return arg ? arg.trim() : arg;
};

/**
 * string transformer that converts the string arg to lowercase
 */
export const lowercase: Transformer<string> = (arg) => {
  return arg.toLowerCase();
};

/**
 * Same as {@link lowercase} but handles null and undefined values
 */
export const lowercaseNullable: Transformer<MaybeNullable<string>> = (arg) => {
  return arg ? arg.toLowerCase() : arg;
};

/**
 * string transformer that converts the string arg to uppercase
 */
export const uppercase: Transformer<string> = (arg) => {
  return arg.toUpperCase();
};

/**
 * Same as {@link uppercase} but handles null and undefined values
 */
export const uppercaseNullable: Transformer<MaybeNullable<string>> = (arg) => {
  return arg ? arg.toUpperCase() : arg;
};

//===================================
// Numbers
//===================================

/**
 * @returns transformer that clamps the value of argument between {@link lowerBound} and {@link upperBound} if either or both of them are defined
 */
export const clamp: (
  lowerBound?: number,
  upperBound?: number
) => Transformer<number> = (lowerBound, upperBound) => (arg) => {
  if (lowerBound && arg < lowerBound) return lowerBound;
  if (upperBound && arg > upperBound) return upperBound;
  return arg;
};

/**
 * Same as {@link clamp} but handles null and undefined values
 */
export const clampNullable: (
  lowerBound?: number,
  upperBound?: number
) => Transformer<MaybeNullable<number>> = (lowerBound, upperBound) => (arg) => {
  if (!arg) return arg;
  if (lowerBound && arg < lowerBound) return lowerBound;
  if (upperBound && arg > upperBound) return upperBound;
  return arg;
};
