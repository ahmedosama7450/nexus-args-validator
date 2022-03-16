import { isPromiseLike, MaybePromise } from "nexus/dist/core";

import { MaybeNull, TraversableObject } from "./types";

export function assignObjectAt(
  obj: TraversableObject,
  accessKey: readonly string[],
  value: any
) {
  const lastKeyPartIndex = accessKey.length - 1;

  let currentObj = obj;

  for (let i = 0; i < lastKeyPartIndex; i++) {
    const keyPart = accessKey[i];
    if (!currentObj[keyPart]) {
      currentObj[keyPart] = {};
    }
    currentObj = currentObj[keyPart];
  }

  currentObj[accessKey[lastKeyPartIndex]] = value;

  return obj;
}

/**
 * Similar to array reduce, but the items passed to the reduce callback are the results of calling {@link evaluate} on the array items
 * in which we deal with any returned promises.
 */
export function reduceAsync<T, K, U, E>(
  array: T[],
  evaluate: (acc: U, currentItem: T, currentIndex: number) => MaybePromise<K>,
  callback: (
    acc: U,
    currentValue: K,
    currentIndex: number,
    returnEarly: (result: E) => void
  ) => U,
  initialValue: U,
  manipulateReturn?: (acc: U) => MaybePromise<U | E>
): MaybePromise<U | E> {
  let acc = initialValue;

  // TODO: I think I should do this differently
  const earlyResult: { inner: { result: E } | null } = { inner: null };
  const returnEarly = (result: E) => {
    earlyResult.inner = { result };
  };

  for (let i = 0; i < array.length; i++) {
    const valueOrPromise = evaluate(acc, array[i], i);

    if (isPromiseLike(valueOrPromise)) {
      // Now, We can return a promise
      const restArrMaybePromises: MaybePromise<K>[] = [valueOrPromise];

      for (let j = i + 1; j < array.length; j++) {
        restArrMaybePromises[j - i - 1] = evaluate(acc, array[j], j);
      }

      return Promise.all(restArrMaybePromises).then((restArr) => {
        for (let j = i; j < array.length; j++) {
          acc = callback(acc, restArr[j - i], j, returnEarly);

          if (earlyResult.inner) {
            return earlyResult.inner.result;
          }
        }
        return acc;
      });
    } else {
      acc = callback(acc, valueOrPromise, i, returnEarly);

      if (earlyResult.inner) {
        return earlyResult.inner.result;
      }
    }
  }

  return manipulateReturn ? manipulateReturn(acc) : acc;
}

/**
 * Note: null is returned instead of returning an empty object except if {@link initialValue} is the empty object
 */
export function mapObject(
  /** Could be object or array */
  obj: TraversableObject,

  /**
   * Note: Returned promises are collected and resolved all at once
   */
  mapValue: (value: any, relatedValue: any) => any,

  options: {
    /**
     * If an object is provided, It gets merged with the result object
     * (Similar keys are overwritten by the result object)
     */
    initialValue?: MaybeNull<TraversableObject>;

    /**
     * If provided, It will be traversed and the corresponding value will be passed {@link options.mapValue}
     */
    relatedObj?: MaybeNull<TraversableObject>;

    /**
     * Once the field that satisfies condition is found,
     * the object traversal is stopped which means that the result object will consist of only one field.
     *
     * Note: {@link options.initialValue} will have no effect on the result object
     */
    searchFor?: (mappedValue: any) => boolean;

    /**
     * If the provided value is equal to the returned value from {@link options.mapValue} function, The field (key-value pair) is not included in the returned object
     * (Only works if value other than undefined is passed)
     */
    skipValueCondition?: (mappedValue: any) => boolean;

    /**
     * Skip traversal of a nested object of {@link obj}
     */
    skipBranchCondition?: (
      branchObj: TraversableObject,
      relatedValue: any
    ) => boolean;
  } = { initialValue: null, relatedObj: null }
): MaybePromise<MaybeNull<TraversableObject>> {
  const promises: PromiseLike<any>[] = [];
  const promisesAccessKeys: string[][] = [];

  const {
    initialValue = null,
    relatedObj = null,
    searchFor,
    skipValueCondition,
    skipBranchCondition,
  } = options;

  try {
    let resultObj = mapObjectHelper(
      [],
      promises,
      promisesAccessKeys,
      obj,
      mapValue,
      initialValue,
      relatedObj,
      searchFor,
      skipValueCondition,
      skipBranchCondition
    );

    if (promises.length !== 0) {
      // Alright, we have promises that need to be resolved and appended to the result object
      return Promise.all(promises).then((mappedValues) => {
        for (let i = 0; i < mappedValues.length; i++) {
          const mappedValue = mappedValues[i];

          if (!skipValueCondition || !skipValueCondition(mappedValue)) {
            if (searchFor) {
              if (searchFor(mappedValues)) {
                return assignObjectAt({}, promisesAccessKeys[i], mappedValue);
              }
            } else {
              if (!resultObj) {
                resultObj = {};
              }
              assignObjectAt(resultObj, promisesAccessKeys[i], mappedValue);
            }
          }
        }

        return resultObj;
      });
    }

    return resultObj;
  } catch (e) {
    if (Array.isArray(e) && e[0] === "abort-early") {
      return e[1];
    }

    throw e;
  }
}

function mapObjectHelper(
  currentAccessKey: string[],
  promises: PromiseLike<any>[],
  promisesAccessKeys: string[][],

  obj: TraversableObject,
  mapValue: (value: any, relatedValue: any) => any,

  initialValue: MaybeNull<TraversableObject>,
  relatedObj: MaybeNull<TraversableObject>,
  searchFor?: (mappedValue: any) => boolean,
  skipValueCondition?: (mappedValue: any) => boolean,
  skipBranchCondition?: (
    branchObj: TraversableObject,
    relatedValue: any
  ) => boolean
): MaybeNull<TraversableObject> {
  let resultObj = initialValue;

  const keys = Object.keys(obj);

  if (keys.length !== 0) {
    currentAccessKey.push("");
  }

  for (const key of keys) {
    const value = obj[key];
    const relatedValue = relatedObj ? relatedObj[key] : relatedObj;

    currentAccessKey[currentAccessKey.length - 1] = key;

    if (type(value) === "object") {
      if (!skipBranchCondition || !skipBranchCondition(value, relatedValue)) {
        const branch = mapObjectHelper(
          [...currentAccessKey],
          promises,
          promisesAccessKeys,
          value,
          mapValue,
          initialValue ? initialValue[key] : initialValue,
          relatedValue,
          searchFor,
          skipValueCondition,
          skipBranchCondition
        );

        if (branch) {
          if (!resultObj) {
            resultObj = {};
          }
          resultObj[key] = branch;
        }
      }
    } else {
      const mappedValueOrPromise = mapValue(value, relatedValue);

      if (isPromiseLike(mappedValueOrPromise)) {
        promises.push(mappedValueOrPromise);
        promisesAccessKeys.push([...currentAccessKey]);
      } else if (
        !skipValueCondition ||
        !skipValueCondition(mappedValueOrPromise)
      ) {
        if (searchFor) {
          if (searchFor(mappedValueOrPromise)) {
            throw [
              "abort-early",
              assignObjectAt({}, currentAccessKey, mappedValueOrPromise),
            ]; // Break out of recursion
          }
        } else {
          if (!resultObj) {
            resultObj = {};
          }
          resultObj[key] = mappedValueOrPromise;
        }
      }
    }
  }

  return resultObj;
}

// TODO Enhance type safety including type guards
/**
 * More specific version of typeof. e.g. It handles null, arrays, regexp, date...
 * Copied from {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof#real-world_usage}
 */
export function type(obj: any, showFullClass: boolean = false): string {
  // get toPrototypeString() of obj (handles all types)
  if (showFullClass && typeof obj === "object") {
    return Object.prototype.toString.call(obj);
  }
  if (obj == null) {
    return (obj + "").toLowerCase();
  } // implicit toString() conversion

  var deepType = Object.prototype.toString.call(obj).slice(8, -1).toLowerCase();
  if (deepType === "generatorfunction") {
    return "function";
  }

  // Prevent overspecificity (for example, [object HTMLDivElement], etc).
  // Account for functionish Regexp (Android <=2.3), functionish <object> element (Chrome <=57, Firefox <=52), etc.
  // String.prototype.match is universally supported.

  return deepType.match(
    /^(array|bigint|date|error|function|generator|regexp|symbol)$/
  )
    ? deepType
    : typeof obj === "object" || typeof obj === "function"
    ? "object"
    : typeof obj;
}
