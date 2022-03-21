import { ApolloServer, ApolloError } from "apollo-server";
import { makeSchema } from "nexus";
import { join } from "path";
import { argsValidatorPlugin } from "nexus-args-validator";

import * as types from "./schema";

const schema = makeSchema({
  types,

  plugins: [
    argsValidatorPlugin({
      onValidationError(errorsTree) {
        throw new ApolloError(
          "One or more arguments failed validation",
          "VALIDATION_FAILED",
          {
            validationErrors: errorsTree,
          }
        );
      },
    }),
  ],

  outputs: {
    typegen: join(__dirname, "..", "__generated__", "nexus-typegen.ts"),
    schema: join(__dirname, "..", "__generated__", "schema.graphql"),
  },
});

const server = new ApolloServer({ schema });

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});
