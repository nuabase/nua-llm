// To get the true and full nature of a value
// https://chatgpt.com/c/68d15084-e468-8321-b232-b4e91beec0ef
export const debug_kindOf = (v: any) => {
  if (v === null) return "null";
  const t = typeof v;
  if (t !== "object") return t; // primitives + function

  const tag = Object.prototype.toString.call(v).slice(8, -1); // e.g., "Array"
  switch (tag) {
    case "Array":
    case "Date":
    case "RegExp":
    case "Map":
    case "Set":
    case "WeakMap":
    case "WeakSet":
    case "ArrayBuffer":
    case "DataView":
    case "Promise":
    case "Error":
    case "Int8Array":
    case "Uint8Array":
    case "Uint8ClampedArray":
    case "Int16Array":
    case "Uint16Array":
    case "Int32Array":
    case "Uint32Array":
    case "Float32Array":
    case "Float64Array":
    case "BigInt64Array":
    case "BigUint64Array":
      return tag.toLowerCase();
    case "Number":
      return Number.isNaN(v.valueOf()) ? "number-object(nan)" : "number-object";
    case "String":
    case "Boolean":
    case "BigInt":
    case "Symbol":
      return `${tag.toLowerCase()}-object`; // boxed primitives
    default: {
      const proto = Object.getPrototypeOf(v);
      if (proto === null) return "object(null-prototype)";
      if (proto === Object.prototype) return "plain-object";
      return "object";
    }
  }
};
