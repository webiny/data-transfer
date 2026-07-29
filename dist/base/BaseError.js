export class BaseError extends Error {
  data;
  constructor(input, options) {
    super(input.message);
    this.stack = options?.stack;
    this.data = input.data;
  }
}
//# sourceMappingURL=BaseError.js.map
