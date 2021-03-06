import { plugin } from "nexus";
import {
  ArgsValue,
  completeValue,
  MaybePromise,
  printedGenTyping,
  printedGenTypingImport,
} from "nexus/dist/core";
import { join } from "path";
import { getType } from "jest-get-type";

import { mapObject } from "./utils";
import { MaybeNull, Resolver, TraversableObject } from "./types";
import { combineTransformers } from "./transformers";
import { andValidators } from "./validators";

/**
 * undefined means validation passed.
 */
export type ValidationResult = ValidationResultError | undefined;

export type ValidationResultError =
  | BaseValidationResultError
  | ValidationResultError[];

/**
 * First element represents error code
 *
 * Second element represents any extras related to validation
 */
export type BaseValidationResultError = [string, ValidationResultErrorExtras];

export type ValidationResultErrorExtras = Record<
  string,
  number | string | boolean
> | null;

export type ErrorsTree = {
  [key: string]: ValidationResultError | ErrorsTree;
};

export type Validator<T> = (arg: T) => MaybePromise<ValidationResult>;

export type Transformer<T> = (arg: T) => MaybePromise<T>;

type BaseValidatorTree<
  T extends string,
  F extends string,
  Args extends ArgsValue<string, string>
> = {
  [key in keyof Args]?: Args[key] extends
    | { [key: string]: unknown }
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
    | { [key: string]: unknown }
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

export type ValidateResolver<
  TypeName extends string,
  FieldName extends string
> = Resolver<TypeName, FieldName, ValidatorTree<TypeName, FieldName>>;

export type TransformResolver<
  TypeName extends string,
  FieldName extends string
> = Resolver<TypeName, FieldName, TransformerTree<TypeName, FieldName>>;

export type GeneralArgsValue = TraversableObject;

export interface ArgsValidatorPluginConfig {
  /**
   * This is where you handle the validation errors.
   * Mostly you will be throwing an error containing `errorsTree`.
   * 
   * @example
   * ```
    throw new ApolloError(
          "One or more arguments failed validation",
          "VALIDATION_FAILED",
          {
            validationErrors: errorsTree,
          }
    );
   * ```
   * @param errorsTree - an object containing the fields that failed validation. the key is the field name, the value is the error code
   */
  onValidationError: (errorsTree: ErrorsTree) => void;

  /**
   * Stop once an argument fails validation.
   * If true, errorsTree passed to {@link onValidationError} will consist of only one field
   */
  abortEarly?: boolean;
}

export const argsValidatorPlugin = ({
  onValidationError,
  abortEarly = false,
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
              validate(root, transformedArgs, ctx, info),
              abortEarly
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

export function findErrors(
  args: GeneralArgsValue,
  validatorTree: ValidatorTree<string, string>,
  abortEarly: boolean
): MaybePromise<MaybeNull<ErrorsTree>> {
  return mapObject(
    validatorTree,
    (validator, arg) => {
      const valueType = getType(validator);

      if (valueType === "array") {
        return andValidators(
          validator as [
            Validator<unknown>,
            Validator<unknown>,
            ...Validator<unknown>[]
          ]
        )(arg);
      } else if (valueType === "function") {
        return (validator as Validator<unknown>)(arg);
      }

      return validator;
    },
    {
      relatedObj: args,
      skipValueCondition: (mappedValue) => mappedValue === undefined,
      skipBranchCondition: (_, relatedValue) => !relatedValue,
      searchFor: abortEarly
        ? (mappedValue) => mappedValue !== undefined
        : undefined,
    }
  );
}

export function applyTransforms(
  args: GeneralArgsValue,
  transformerTree: TransformerTree<string, string>
): MaybePromise<GeneralArgsValue> {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return mapObject(
    transformerTree,
    (transformer, arg) => {
      const valueType = getType(transformer);

      if (valueType === "array") {
        return combineTransformers(
          transformer as [
            Transformer<unknown>,
            Transformer<unknown>,
            ...Transformer<unknown>[]
          ]
        )(arg);
      } else if (valueType === "function") {
        return (transformer as Transformer<unknown>)(arg);
      }

      return transformer;
    },
    {
      initialValue: args,
      relatedObj: args,
      skipBranchCondition: (_, relatedValue) => !relatedValue,
    }
  )!; // Guaranteed not to be null because the result should at least be initialValue which is not null
}
