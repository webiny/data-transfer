import { Result } from "./Result.js";
export declare class ResultAsync<TValue, TError = never> {
  private readonly promise;
  constructor(promise: Promise<Result<TValue, TError>>);
  static from<T, E>(fn: () => Promise<Result<T, E>>): ResultAsync<T, E>;
  static ok<T>(value: T): ResultAsync<T, never>;
  static fail<E>(error: E): ResultAsync<never, E>;
  unwrap(): Promise<Result<TValue, TError>>;
  mapAsync<U>(fn: (value: TValue) => U | Promise<U>): ResultAsync<U, TError>;
  mapErrorAsync<F>(fn: (error: TError) => F | Promise<F>): ResultAsync<TValue, F>;
  flatMapAsync<U>(fn: (value: TValue) => ResultAsync<U, TError>): ResultAsync<U, TError>;
  match<U>(handlers: { ok: (value: TValue) => U; fail: (error: TError) => U }): Promise<U>;
}
//# sourceMappingURL=ResultAsync.d.ts.map
