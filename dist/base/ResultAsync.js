import { Result } from "./Result.js";
export class ResultAsync {
  promise;
  constructor(promise) {
    this.promise = promise;
  }
  // Wrap a function returning a Promise<Result<T, E>>.
  static from(fn) {
    return new ResultAsync(fn());
  }
  // Wrap a successful value.
  static ok(value) {
    return new ResultAsync(Promise.resolve(Result.ok(value)));
  }
  // Wrap a failure.
  static fail(error) {
    return new ResultAsync(Promise.resolve(Result.fail(error)));
  }
  // Await the wrapped result.
  async unwrap() {
    return this.promise;
  }
  // Transform the success value.
  mapAsync(fn) {
    const newPromise = this.promise.then(async res => {
      if (res.isOk()) {
        return Result.ok(await fn(res.value));
      }
      return Result.fail(res.error);
    });
    return new ResultAsync(newPromise);
  }
  // Transform the error value.
  mapErrorAsync(fn) {
    const newPromise = this.promise.then(async res => {
      if (res.isFail()) {
        return Result.fail(await fn(res.error));
      }
      return Result.ok(res.value);
    });
    return new ResultAsync(newPromise);
  }
  // Chain another async Result.
  flatMapAsync(fn) {
    const newPromise = this.promise.then(async res => {
      if (res.isFail()) {
        return Result.fail(res.error);
      }
      return await fn(res.value).unwrap();
    });
    return new ResultAsync(newPromise);
  }
  // Match success/failure (like sync Result).
  async match(handlers) {
    const result = await this.unwrap();
    if (result.isOk()) {
      return handlers.ok(result.value);
    }
    return handlers.fail(result.error);
  }
}
//# sourceMappingURL=ResultAsync.js.map
