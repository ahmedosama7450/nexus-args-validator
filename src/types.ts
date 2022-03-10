import { GraphQLResolveInfo } from "graphql";
import { ArgsValue, GetGen, SourceValue } from "nexus/dist/core";

export type MaybeNullable<T> = T | null | undefined;

export type MaybeNull<T> = T | null;

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
