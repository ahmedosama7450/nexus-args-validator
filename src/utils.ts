export function assignObjectAt(
  obj: object,
  accessKey: readonly string[],
  value: any
) {
  let objBranch: any = obj;
  const lastKeyPartIndex = accessKey.length - 1;

  for (let i = 0; i < lastKeyPartIndex; i++) {
    const keyPart = accessKey[i];
    if (!objBranch[keyPart]) {
      objBranch[keyPart] = {};
    }
    objBranch = objBranch[keyPart];
  }

  objBranch[accessKey[lastKeyPartIndex]] = value;
}
