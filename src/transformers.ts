import { MaybeNullable } from "./types";
import { Transformer } from ".";

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
