import { plugin } from "nexus";
import {
  ArgsValue,
  completeValue,
  MaybePromise,
  printedGenTyping,
  printedGenTypingImport,
} from "nexus/dist/core";
import { join } from "path";

import { mapObject, type } from "./utils";
import { MaybeNull, Resolver, TraversableObject } from "./types";
import { combineTransformers } from "./transformers";
import { andValidators } from "./validators";

/**
 * undefined means validation passed
 */
export type ValidationResult = ErrorValidationResult | undefined;

/**
 * First element represents error code
 *
 * Second element represents any extras related to validation
 */
export type ErrorValidationResult =
  | BaseErrorValidationResult
  | ErrorValidationResult[];

export type BaseErrorValidationResult = [string, ErrorValidationResultExtras];

export type ErrorValidationResultExtras = {
  [key: string]: number | string | boolean;
} | null;

export type ErrorsTree = {
  [key: string]: ErrorValidationResult | ErrorsTree;
};

export type Validator<T> = (arg: T) => MaybePromise<ValidationResult>;

export type Transformer<T> = (arg: T) => MaybePromise<T>;

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
   * Mostly you will be throwing an error containing `errorsTree`. e.g.
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
   * Stop once a validation error is found.
   * This means that errorsTree passed to {@link onValidationError} will consist if only one field
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

function findErrors(
  args: GeneralArgsValue,
  validatorTree: ValidatorTree<string, string>,
  abortEarly: boolean
): MaybePromise<MaybeNull<ErrorsTree>> {
  return mapObject(
    validatorTree,
    (validator, arg) => {
      const valueType = type(validator);

      if (valueType === "array") {
        return andValidators(validator)(arg);
      } else if (valueType === "function") {
        return validator(arg);
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

function applyTransforms(
  args: GeneralArgsValue,
  transformerTree: TransformerTree<string, string>
): MaybePromise<GeneralArgsValue> {
  return mapObject(
    transformerTree,
    (transformer, arg) => {
      const valueType = type(transformer);

      if (valueType === "array") {
        return combineTransformers(transformer)(arg);
      } else if (valueType === "function") {
        return transformer(arg);
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
