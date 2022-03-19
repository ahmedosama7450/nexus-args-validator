import { GraphQLResolveInfo } from "graphql";
import { ArgsValue, GetGen, SourceValue } from "nexus/dist/core";

export type MaybeNullable<T> = T | null | undefined;

export type MaybeNull<T> = T | null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TraversableObject = Record<string, any>;

export type Resolver<
  TypeName extends string,
  FieldName extends string,
  ReturnType
> = (
  root: SourceValue<TypeName>,
  args: ArgsValue<TypeName, FieldName>,
  context: GetGen<"context">,
  info: GraphQLResolveInfo
) => ReturnType;
