import { assignObjectAt, mapObject, reduceAsync } from "../src/utils";

test("assignObjectAt", () => {
  expect(assignObjectAt({}, ["c", "e"], 8)).toStrictEqual({
    c: { e: 8 },
  });
  expect(assignObjectAt({ r: 4 }, ["c", "e"], 8)).toStrictEqual({
    r: 4,
    c: { e: 8 },
  });
});

test("reduceAsync", () => {
  expect(
    reduceAsync(
      [1, 2, 3],
      (acc, currentItem) => currentItem,
      (acc, currentValue) => acc + currentValue,
      4
    )
  ).toBe(10);

  expect(
    reduceAsync(
      [1, 2, 3],
      (acc, currentItem) => currentItem * 2,
      (acc, currentValue) => acc + currentValue,
      0,
      (acc) => acc * 2
    )
  ).toBe(24);

  expect(
    reduceAsync(
      [1, 2, 3],
      (acc, currentItem) => currentItem * 2,
      (acc, currentValue, i, returnEarly) => {
        returnEarly(200);
        return acc + currentValue;
      },
      0
    )
  ).toBe(200);

  return expect(
    reduceAsync(
      [1, 2, 3],
      (acc, currentItem) =>
        currentItem === 2 ? Promise.resolve(currentItem) : currentItem,
      (acc, currentValue) => acc + currentValue,
      4
    )
  ).resolves.toBe(10);
});

describe("mapObject", () => {
  test("one to one map", () => {
    const obj = {
      a: 1,
      b: 2,
      c: {
        d: 3,
        e: 4,
        f: {
          g: 5,
          h: 6,
          i: {
            j: 7,
            k: 8,
          },
        },
      },
    };

    expect(
      mapObject(obj, (value) => {
        return value;
      })
    ).toStrictEqual(obj);

    expect(
      mapObject(
        obj,
        (value) => {
          return value;
        },
        {
          initialValue: { b: 5 },
        }
      )
    ).toStrictEqual(obj);
  });

  test("correctly maps to another object", () => {
    const obj = {
      a: 1,
      b: 2,
      c: {
        d: 3,
        e: 4,
      },
    };

    expect(
      mapObject(obj, (value) => {
        if (typeof value === "number") {
          return value * 2;
        } else {
          return value;
        }
      })
    ).toStrictEqual({
      a: 2,
      b: 4,
      c: {
        d: 6,
        e: 8,
      },
    });

    return expect(
      mapObject(
        obj,
        (value) => {
          if (typeof value === "number") {
            if (value === 2 || value === 4) {
              return Promise.resolve(value * 2);
            } else {
              return value * 2;
            }
          } else {
            return value;
          }
        },
        { initialValue: { a: 5, f: 4 } }
      )
    ).resolves.toStrictEqual({
      a: 2,
      b: 4,
      f: 4,
      c: {
        d: 6,
        e: 8,
      },
    });
  });

  test("initialValue parameter", () => {
    const obj = {
      a: 1,
      b: 2,
      c: {
        d: 3,
        e: 4,
      },
    };

    expect(
      mapObject(
        obj,
        (value) => {
          return value;
        },
        {
          initialValue: {
            b: 5,
            t: 7,
            f: { e: 4, y: 5, r: { u: 9 } },
            y: { e: 5, c: 4 },
          },
        }
      )
    ).toStrictEqual({
      a: 1,
      b: 2,
      c: {
        d: 3,
        e: 4,
      },
      t: 7,
      f: { e: 4, y: 5, r: { u: 9 } },
      y: { e: 5, c: 4 },
    });
  });

  test("searchFor parameter", () => {
    expect(
      mapObject(
        {
          a: 1,
          b: 2,
          c: {
            d: 3,
            e: 4,
          },
        },
        (value) => {
          if (typeof value == "number") return value * 2;
          return value;
        },
        {
          searchFor: (mappedValue) => mappedValue === 8,
        }
      )
    ).toStrictEqual({ c: { e: 8 } });

    expect(
      mapObject(
        {
          a: 1,
          b: 2,
          c: {
            d: 3,
            e: 4,
          },
        },
        (value) => {
          if (typeof value == "number") return value * 2;
          return value;
        },
        {
          initialValue: { r: 8 },
          searchFor: (mappedValue) => mappedValue === 8,
        }
      )
    ).toStrictEqual({ c: { e: 8 } });
  });

  test("skipValueCondition parameter", () => {
    expect(
      mapObject(
        {
          a: "Hello World",
          b: 2,
          c: {
            d: 3,
            e: { a: 5 },
          },
          f: {
            e: 7,
            f: 5,
          },
          d: "Hello Again",
        },
        (value) => {
          if (typeof value === "number") {
            return 5;
          } else {
            return "Hello";
          }
        },
        {
          initialValue: { greeting: "Hey there" },
          skipValueCondition: (mappedValue) => mappedValue === 5,
        }
      )
    ).toStrictEqual({
      a: "Hello",
      d: "Hello",
      greeting: "Hey there",
    });

    expect(
      mapObject(
        {
          a: "Hello World",
          b: 2,
          c: {
            d: 3,
            e: { a: 5 },
          },
          f: {
            e: 7,
            f: 5,
          },
          d: "Hello Again",
        },
        () => {
          return 5;
        },
        {
          skipValueCondition: (mappedValue) => mappedValue === 5,
        }
      )
    ).toBeNull();
  });

  test("skipBranchCondition parameter", () => {
    expect(
      mapObject(
        {
          a: "Hello World",
          b: 2,
          c: {
            d: 3,
            e: { a: 5 },
          },
          e: {
            a: 8,
          },
          f: {
            e: 7,
            f: 5,
          },
          d: "Hello Again",
        },
        (value) => {
          return value;
        },
        {
          relatedObj: {
            e: "r",
          },
          skipBranchCondition(branchObj, relatedValue) {
            return (
              ("d" in branchObj &&
                branchObj["d" as keyof typeof branchObj] === 3) ||
              relatedValue === "r"
            );
          },
        }
      )
    ).toStrictEqual({
      a: "Hello World",
      b: 2,
      f: {
        e: 7,
        f: 5,
      },
      d: "Hello Again",
    });
  });
});
