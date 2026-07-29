/**
 * A container type that represents either a successful result (`ok`) or a failure (`fail`).
 * Inspired by functional programming constructs like `Either` or `Result` in other languages.
 *
 * @template TValue - The type of the success value.
 * @template TError - The type of the error value.
 */
export declare class Result<TValue, TError = never> {
  protected readonly _isOk: boolean;
  protected readonly _value?: TValue;
  protected readonly _error?: TError;
  private constructor();
  /**
   * Creates a successful `Result` containing the provided value.
   * If no value is provided, returns Result<void, never>.
   *
   * @param value - The value to wrap in a successful result (optional).
   * @returns A `Result` instance with the value.
   */
  static ok<T>(value: T): Result<T, never>;
  static ok(): Result<void, never>;
  /**
   * Creates a failed `Result` containing the provided error.
   *
   * @param error - The error to wrap in a failed result.
   * @returns A `Result` instance with the error.
   */
  static fail<E>(error: E): Result<never, E>;
  /**
   * Checks whether the result is successful.
   *
   * @returns `true` if the result is `ok`, otherwise `false`.
   *          Acts as a type guard to narrow the type to a successful result.
   */
  isOk(): this is {
    _value: TValue;
  } & Result<TValue, TError>;
  /**
   * Checks whether the result is a failure.
   *
   * @returns `true` if the result is `fail`, otherwise `false`.
   *          Acts as a type guard to narrow the type to a failed result.
   */
  isFail(): this is {
    _error: TError;
  } & Result<TValue, TError>;
  /**
   * Gets the value inside a successful result.
   *
   * @throws If the result is a failure.
   * @returns The success value.
   */
  get value(): TValue;
  /**
   * Gets the error inside a failed result.
   *
   * @throws If the result is successful.
   * @returns The error value.
   */
  get error(): TError;
  /**
   * Transforms the success value using the provided mapping function.
   *
   * @template U - The type of the new success value.
   * @param fn - Function to apply to the value if the result is successful.
   * @returns A new `Result` containing the mapped value, or the original error if failed.
   */
  map<U>(fn: (value: TValue) => U): Result<U, TError>;
  /**
   * Transforms the error value using the provided mapping function.
   *
   * @template F - The type of the new error.
   * @param fn - Function to apply to the error if the result is a failure.
   * @returns A new `Result` containing the original value or the mapped error.
   */
  mapError<F>(fn: (error: TError) => F): Result<TValue, F>;
  /**
   * Chains another `Result`-producing function onto this result.
   * If this result is successful, the function is applied to the value.
   * If this result is a failure, the original error is returned.
   *
   * @template U - The type of the next success value.
   * @param fn - A function that takes the current value and returns another `Result`.
   * @returns A new `Result` from applying the function or the original failure.
   */
  flatMap<U>(fn: (value: TValue) => Result<U, TError>): Result<U, TError>;
  /**
   * Pattern-matches the result to handle both success and failure cases.
   *
   * @template U - The return type of both match functions.
   * @param handlers - An object containing `ok` and `fail` handlers.
   * @returns The return value from the corresponding handler.
   */
  match<U>(handlers: { ok: (value: TValue) => U; fail: (error: TError) => U }): U;
}
export declare namespace Result {
  type UnwrapResult<T> = Awaited<T> extends Result<infer Ok, any> ? Ok : never;
  type UnwrapError<T> = Awaited<T> extends Result<any, infer Err> ? Err : never;
}
//# sourceMappingURL=Result.d.ts.map
