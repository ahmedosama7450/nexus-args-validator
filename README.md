# Nexus args validator

Easy typesafe validation powered by [Nexus](https://nexusjs.org/)

## Motivation

Validating arguments in graphql can be pretty annoying
and the there isn't a "best" way to do it.

In fact, graphql already does some validation for you.
It validates that arguments are of the types defined
in the schema. This means you can always be
sure that the arguments you receive in the resolvers are of the right type.
So, It doesn't really make much sense to use a validation library like `yup` or `superstruct` because
the main objective of these libraries is to check that types are correct. graphql does this for us already.

So, Graphql validates types.
What about validating the data itself ?
e.g. Checking that an _age_ argument is greater than 18, that
a _username_ argument is unique, that a _date_ argument is in a specific range, and all kinds of other possible validation
Well, How does graphql allow us to do that ? Well, We have a couple of options:

1. Validate arguments in the resolver: You can throw an error or model the error as part of the schema
2. Create custom scalars: You can use [graphql-scalars](https://github.com/urigo/graphql-scalars) as a foundation and craete more scalars as you need them. But there is a limitation here, You can't do async validation, e.g. hitting the database to make sure that a username is unique

Personally, I prefere the first option as It gives you more freedom and moreover, you can do async stuff

The problem is: mixing your resolver logic with the validation logic, makes the code
look messy and makes it hard to reuse these validation rules in a predictable manner and that's where this plugin come into play!

## Principles

- Types-safety powered by [Nexus](https://nexusjs.org/). Argument names and types are inferred from the schema.
- Async validation is supported. The cool thing is, no promises are created if If none of your validator functions return promises (Because internally, we are not using async/await but promises from different validators are collected and if there is any, they are executed and returned all at once using `Promise.all`)
- Transformation of arguments before validating them. e.g. trimming, converting to lowercase/uppercase, clamping a numeric argument or any kind of transformation you want.

## Installation

1. Install dependencies

```bash
npm install nexus-args-validator
```

> Nexus and graphql are required peer dependencies.

2. Add `argsValidatorPlugin` to nexus list of plugins

```typescript
import { argsValidatorPlugin } from "nexus-args-validator";

const schema = makeSchema({
  ...
  plugins: [
    argsValidatorPlugin({
      onValidationError(errorsTree) {
        // Do something with the errors tree, mostly throw an error.
      },
    }),
  ],
  ...
});
```

## Usage

The plugin adds two new properties to the field config:

1. transform `(root, args, ctx, info)=> TransformerTree`:

   - Runs first
   - Return an object `TransformerTree` where the keys correspond to the argument names (Type-safe) and the values are transformer functions `(arg) => typeof arg` or an array of transformers where the output of each previous transformer is the input of the next one.
   - Each transformer function receives the argument value and returns the new value. Both must be of the same type. You can do any transformation you want here. e.g. trimming strings, converting to lowercase, clamping numbers, etc.

2. validate `(root, args, ctx, info)=> ValidatorTree`:
   - Runs after `transform` and receives the new transformed arguments (This is the case for any sub-resolver that comes next).
   - Return an object `ValidatorTree` where the keys correspond to the argument names (Type-safe) and the values are validator functions `(arg) => ValidationResult` or an array of validators where all validators have to pass for the validation to pass
   - Each validator function receives the argument value and returns a validation result `ValidationResultError | undefined`. `undefined` (not returning anything) means that validation passed. `ValidationResultError` is a tuple `[string, ValidationResultErrorExtras]` or an array of tuples. The first element represents error code which is how you identify the error on the frontend. The second element is an object that can be used to pass extra data along with the error.

Errors are collected from all validators and if there is any, you will receive a callback with `errorsTree` that looks something like:

```
{
  "username": ["not-unique", null],
  "age": ["too-young", 18], // 18 is the minimum age
  "lastName": ["contains-invalid-characters", ["$", "^"]], // ["$","^"] is the list of invalid characters
  "firstName": [
    ["short-name", 12],
    ["contains-invalid-characters", ["*"]]
  ] // array of validation errors
}
```

Mostly, you will throw an error

```typescript
argsValidatorPlugin({
  onValidationError(errorsTree) {
    // Do something with the errors tree, mostly throw an error
    throw new ApolloError(
      "One or more arguments failed validation",
      "VALIDATION_FAILED",
      {
        validationErrors: errorsTree,
      }
    );
  },
}),
```

> Check out [demo](https://github.com/ahmedosama7450/nexus-args-validator/blob/main/demo/src/schema.ts) to view the full schema

```typescript
import { lowercase, trim } from "nexus-args-validator/dist/transformers";
import { nonEmpty, rangeSize } from "nexus-args-validator/dist/validators";

export const CreateUserMutation = mutationField("createUser", {
  type: "User",
  args: {
    userCreateInput: nonNull("UserCreateInput"),
  },

  transform: () => ({
    userCreateInput: {
      firstName: trim,
      lastName: trim,
      username: [
        lowercase,

        (arg) => {
          // Correct short usernames
          if (arg.length < 5) {
            return arg + "12345";
          }
          return arg;
        },
      ],
    },
  }),

  validate: () => ({
    userCreateInput: {
      firstName: rangeSize(8, 12),
      lastName: nonEmpty(),
      email: rangeSize(5, 20),
      username: [
        (arg) => {
          // Username can not be "unknown"
          if (arg === "unknown") {
            return ["not-allowed", null];
          }
        },

        (arg) => {
          // Unique username
          if (users.find((u) => u.username === arg)) {
            return ["not-unique", null];
          }
        },
      ],
      profile: {
        bio: rangeSize(10, 100),
      },
    },
  }),

  resolve(_, args) {
    // args are the new ags after transformation
  },
});
```

## Reusable validators and transformers

The package exports a number of common validators and transformers as well as helpers to combine validators/transformers.

### Validators

#### Built-in validators

| Validator                                                                     | Description                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `max(n: number, errorCode = "max")`                                           | Returns number validator that fails when the number arg is above `n`                                                            |
| `min(n: number, errorCode = "min")`                                           | Returns number validator that fails when the number arg is below `n`                                                            |
| `range(lowerBound: number, upperBound: number, errorCode = "range")`          | Returns number validator that fails when the number arg is not within the range [`lowerBound`, `upperBound`]                    |
| `maxSize(n: number, errorCode = "max-size")`                                  | Returns array/string validator that fails when the array/string arg length is above `n`                                         |
| `minSize(n: number, errorCode = "min-size")`                                  | Returns array/string validator that fails when the array/string arg length is below `n`                                         |
| `rangeSize(lowerBound: number, upperBound: number, errorCode = "range-size")` | Returns array/string validator that fails when the array/string arg length is not within the range [`lowerBound`, `upperBound`] |
| `nonEmpty(errorCode = "non-empty")`                                           | Returns array/string validator that fails when the array/string arg is empty                                                    |
| `pattern(regexp: RegExp, errorCode = "pattern")`                              | Returns string validator that fails when the string arg does not respect `regexp`                                               |

#### Custom validators

You can create your own custom validators

```typescript
import { Validator } from "nexus-args-validator";
import { defineValidator } from "nexus-args-validator/dist/validators";

const myValidator: Validator<string> = (arg) => {
  if (arg === "bad") {
    return ["bad-arg", null]; // You can also return a promise
  }
};

// Or with parameters
const myValidatorWithParams: (
  param1: number,
  param2: string
) => Validator<string> = (param1, param2) => (arg) => {
  if (arg === "bad") {
    return ["bad-arg", null];
  }
};

// You might prefer to use `defineValidator` which is syntactic sugar over the previous code
const myValidatorWithParams2: (
  param1: number,
  param2: string
) => Validator<string> = (param1, param2) =>
  defineValidator<string>(
    "bad-arg",
    (arg) => {
      // Return true if validation fails
      return arg === "bad";
    },
    null
  );
```

#### Combining validators

You can combine validators in two ways using:

- `andValidators` Returns new validator where child validators all have to pass in order for the resultant validator to pass. (AND logic).

- `orValidators` Returns new validator where at least one of the child validators has to pass in order for the resultant validator to pass. (OR logic)

```typescript
import {
  andValidators,
  orValidators,
  min,
  max,
} from "nexus-args-validator/dist/validators";

// Both validators have to pass in order for the new validator to pass
const newAndValidator = andValidators(min(5), max(10));

// At least one of the validators has to pass in order for the new validator to pass
const newOrValidator = orValidators(min(5), max(10));
```

> By default, the new validator created by `andValidators` stops executing and returns the first error encountered by a child validator. If the second argument `abortEarly` is set to false, It will always execute all child validators, and when the the resultant validator is called, It will return an array of all validation errors (In case validation fails)

Internally, `andValidators` is used with `abortEarly=true` (Default) when you pass an array of validators in the validator tree

```typescript
// Both validator1 and validator2 are the same
const validator1 = andValidators(min(5), max(10), true);
const validator2 = [min(5), max(10)];
```

For completeness, there is also `notValidator` which returns new validator that passes when the original validator fails and fails (with the given error) when the original validator passes

```typescript
import { notValidator, min } from "nexus-args-validator/dist/validators";

// Passes when arg is less than 5
const newNotValidator = notValidator(min(5), ["must-be-less-than", 5]);
```

### Transformers

#### Built-in transformers

| Transformer               | Description                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `defaulted(defaultValue)` | Returns transformer that sets default value for the argument when it's undefined or null                                          |
| `trim`                    | string transformer that trims the string arg                                                                                      |
| `lowercase`               | string transformer that converts the string arg to lowercase                                                                      |
| `uppercase`               | string transformer that converts the string arg to uppercase                                                                      |
| `clamp`                   | Returns transformer that clamps the value of argument between `lowerBound` and `upperBound` if either or both of them are defined |

There are also nullable versions of the above transformers (e.g. trimNullable) to use with nullable args. They do the same thing except they do nothing and just return the original argument if It is null or undefined

#### Custom transformers

You can create your own custom transformers

```typescript
import { Transformer } from "nexus-args-validator";

const myTransformer: Transformer<number> = (arg) => {
  if (arg < 2) {
    return 2; // You can also return a promise
  }
  return arg;
};

// Or with parameters
const myTransformerWithParams: (
  param1: number,
  param2: string
) => Transformer<number> = (param1, param2) => (arg) => {
  if (arg < 2) {
    return 2; // You can also return a promise
  }
  return arg;
};
```

#### Combining transformers

You can combine transformers where the output of each previous transformer is the input of the next one with `combineTransformers` or you can just use an array

```typescript
import { trim, lowercase } from "nexus-args-validator/dist/transformers";

// Both transformer1 and transformer2 are the same
const transformer1 = combineTransformers([trim, lowercase]);
const transformer2 = [trim, lowercase];
```

## Notes

- By default, all validators in `ValidatorTree` are traversed and executed, So `errorsTree` contains all arguments with errors. You can set `abortEarly` to true in the plugin config to stop once an argument fails validation, this means that `errorsTree` will consist of only one field.

- For object arguments, you can either recursively traverse the object and define a separate validator/transformer for each nested argument or define a validator for the whole object. Typescript will help you with that.

- On the frontend, you may do something like this to handle validation errors :

  ```typescript
  import { getType } from "jest-get-type";

  function onError(apolloError: ApolloError) {
    if (
      apolloError.graphQLErrors[0]?.extensions?.code === "VALIDATION_FAILED"
    ) {
      const validationErrors =
        apolloError.graphQLErrors[0].extensions!["validationErrors"];

      traverseObject(validationErrors, (fieldName, validationError) => {
        const [errorCode, extras] = validationError;

        // Do something with `errorCode` and `extras`...
      });
    }
  }

  function traverseObject(
    obj: Record<string, any>,
    execute: (key: string, value: any) => void
  ) {
    for (const key in obj) {
      const nestedObjOrValue = obj[key];
      if (getType(nestedObjOrValue) === "object") {
        // Keep going deeper
        traverseObject(nestedObjOrValue, execute);
      } else {
        execute(key, nestedObjOrValue);
      }
    }
  }
  ```

## License

MIT
