import { createAbstraction } from "@/src/base/index.js";
import type { Result } from "@/src/base/index.js";

/**
 * Refactor to be proper interfaces.
 */
export interface IQueryParams {
  unknown: any;
}

/**
 * Error can be some generic one if its not easy to find proper ones.
 * The point is for user to know which kind of errors can be expected when using the abstraction.
 */
export interface IQueryErrorsRecord {
  someError: Error;
  // fix
  dynamoConnectionError: SomeDynamoConnectionError;
}

type IQueryErrors = IQueryErrorsRecord[keyof IQueryErrorsRecord];

// proper response
export interface IQueryResult<T> {
  items: T[];
  // there does need to be next?
  next?: () => Promise<IQueryResult<T>>;
}

export interface IDynamoDbClient {
  scan<T>(params: IScanParams): Promise<Result<IScanResult<T>>, IScanErrors>;
  query<T>(params: IQueryParams): Promise<Result<IQueryResult<T>, IQueryErrors>>;
  get(...args: any[]): Promise<any>;
  put(...args: any[]): Promise<any>;
  delete(...args: any[]): Promise<any>;
  update(...args: any[]): Promise<any>;
}

export const DynamoDbClient = createAbstraction<IDynamoDbClient>("Core/DynamoDbClient");


export namespace DynamoDbClient {
  export type Interface = IDynamoDbClient;
  export type QueryErrors = IQueryErrors;
}
