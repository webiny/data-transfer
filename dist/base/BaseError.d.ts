export interface ErrorOptions {
  stack?: string;
}
type ErrorDataWithOptionalData<TData> = TData extends void
  ? {
      message: string;
      data?: never;
    }
  : {
      message: string;
      data: TData;
    };
export declare abstract class BaseError<TData = void> extends Error {
  abstract readonly code: string;
  readonly data: TData extends void ? undefined : TData;
  protected constructor(input: ErrorDataWithOptionalData<TData>, options?: ErrorOptions);
}
export {};
//# sourceMappingURL=BaseError.d.ts.map
