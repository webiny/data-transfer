export function createTransformer(name, fn) {
  Object.defineProperty(fn, "transformerName", {
    value: name,
    enumerable: false,
    writable: false,
    configurable: false
  });
  return fn;
}
//# sourceMappingURL=createTransformer.js.map
