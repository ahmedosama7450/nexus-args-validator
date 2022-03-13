import { isPromiseLike, MaybePromise } from "nexus/dist/core";

import { MaybeNull, TraversableObject } from "./types";

export function assignObjectAt(
  obj: TraversableObject,
  accessKey: readonly string[],
  value: any
) {
  const lastKeyPartIndex = accessKey.length - 1;

  for (let i = 0; i < lastKeyPartIndex; i++) {
    const keyPart = accessKey[i];
    if (!obj[keyPart]) {
      obj[keyPart] = {};
    }
    obj = obj[keyPart];
  }

  obj[accessKey[lastKeyPartIndex]] = value;
}

/**
 * Note: null is returned instead of returning an empty object except if {@link initialValue is the empty object}
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
     * If provided, It will be traversed and the corresponding value will be passed {@link mapValue}
     */
    relatedObj?: MaybeNull<TraversableObject>;

    /**
     * If the provided value is equal to the returned value from {@link mapValue} function, The field (key-value pair) is not included in the returned object
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
    skipValueCondition,
    skipBranchCondition,
  } = options;

  let resultObj = mapObjectHelper(
    [],
    promises,
    promisesAccessKeys,
    obj,
    mapValue,
    initialValue,
    relatedObj,
    skipValueCondition,
    skipBranchCondition
  );

  if (promises.length !== 0) {
    // Alright, we have promises that need to be resolved and appended to the result object
    return Promise.all(promises).then((newValues) => {
      for (let i = 0; i < newValues.length; i++) {
        const newValue = newValues[i];

        if (!skipValueCondition || !skipValueCondition(newValue)) {
          if (!resultObj) {
            resultObj = {};
          }
          assignObjectAt(resultObj, promisesAccessKeys[i], newValue);
        }
      }

      return resultObj;
    });
  }

  return resultObj;
}

function mapObjectHelper(
  currentAccessKey: string[],
  promises: PromiseLike<any>[],
  promisesAccessKeys: string[][],

  obj: TraversableObject,
  mapValue: (value: any, relatedValue: any) => any,

  initialValue: MaybeNull<TraversableObject>,
  relatedObj: MaybeNull<TraversableObject>,
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
      const newValueOrPromise = mapValue(value, relatedValue);

      if (isPromiseLike(newValueOrPromise)) {
        promises.push(newValueOrPromise);
        promisesAccessKeys.push([...currentAccessKey]);
      } else if (
        !skipValueCondition ||
        !skipValueCondition(newValueOrPromise)
      ) {
        if (!resultObj) {
          resultObj = {};
        }
        resultObj[key] = newValueOrPromise;
      }
    }
  }

  return resultObj;
}

// TODO type guards
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
