import { MaybeNullable } from "./types";
import { reduceAsync } from "./utils";
import { Transformer } from ".";

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
// Unknowns
//===================================

export const defaulted: (defaultValue: unknown) => Transformer<unknown> =
  (defaultValue) => (value) => {
    return value === null || value === undefined ? defaultValue : value;
  };

//===================================
// Strings
//===================================

export const trim: Transformer<string> = (arg) => {
  return arg.trim();
};

export const trimNullable: Transformer<MaybeNullable<string>> = (arg) => {
  return arg ? arg.trim() : arg;
};

export const lowercase: Transformer<string> = (arg) => {
  return arg.toLowerCase();
};

export const lowercaseNullable: Transformer<MaybeNullable<string>> = (arg) => {
  return arg ? arg.toLowerCase() : arg;
};

export const uppercase: Transformer<string> = (arg) => {
  return arg.toUpperCase();
};

export const uppercaseNullable: Transformer<MaybeNullable<string>> = (arg) => {
  return arg ? arg.toUpperCase() : arg;
};
