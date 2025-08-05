/**
 * Generic Utility Types for Common Patterns
 * 
 * This file contains reusable generic utility types, type guards,
 * and helper functions for common TypeScript patterns used throughout
 * the municipal portal application.
 */

// ============================================================================
// GENERIC UTILITY TYPES
// ============================================================================

/** Make all properties optional recursively */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Make all properties required recursively */
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};

/** Make all properties readonly recursively */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/** Make all properties mutable recursively */
export type DeepMutable<T> = {
  -readonly [P in keyof T]: T[P] extends object ? DeepMutable<T[P]> : T[P];
};

/** Extract keys that have values of a specific type */
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/** Create a type with only specified keys */
export type PickByType<T, U> = Pick<T, KeysOfType<T, U>>;

/** Omit keys that have values of a specific type */
export type OmitByType<T, U> = Omit<T, KeysOfType<T, U>>;

/** Make specified keys optional */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Make specified keys required */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/** Rename keys in a type */
export type RenameKeys<T, R extends Record<keyof T, string>> = {
  [K in keyof R as R[K]]: T[K];
};

/** Create a union of all property values */
export type ValueOf<T> = T[keyof T];

/** Extract property names of functions */
export type FunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

/** Extract function properties */
export type FunctionProperties<T> = Pick<T, FunctionPropertyNames<T>>;

/** Extract non-function properties */
export type NonFunctionProperties<T> = Omit<T, FunctionPropertyNames<T>>;

/** Create a type where all properties are functions */
export type Functionize<T> = {
  [K in keyof T]: () => T[K];
};

/** Create a type where all function properties return promises */
export type Promisify<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<R>
    : T[K];
};

// ============================================================================
// CONDITIONAL TYPES
// ============================================================================

/** Check if type is never */
export type IsNever<T> = [T] extends [never] ? true : false;

/** Check if type is any */
export type IsAny<T> = 0 extends 1 & T ? true : false;

/** Check if type is unknown */
export type IsUnknown<T> = IsAny<T> extends true ? false : unknown extends T ? true : false;

/** Check if type is array */
export type IsArray<T> = T extends readonly unknown[] ? true : false;

/** Check if type is object */
export type IsObject<T> = T extends object ? (T extends unknown[] ? false : true) : false;

/** Check if type is function */
export type IsFunction<T> = T extends (...args: any[]) => any ? true : false;

/** Check if type is promise */
export type IsPromise<T> = T extends Promise<unknown> ? true : false;

/** Get array element type */
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

/** Get promise resolved type */
export type PromiseValue<T> = T extends Promise<infer U> ? U : never;

/** Get function parameters */
export type Parameters<T> = T extends (...args: infer P) => any ? P : never;

/** Get function return type */
export type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

// ============================================================================
// BRAND TYPES AND HELPERS
// ============================================================================

/** Create a branded type */
export type Brand<T, B> = T & { readonly __brand: B };

/** Create a nominal type */
export type Nominal<T, N extends string> = T & { readonly __nominal: N };

/** Extract the base type from a branded type */
export type Unbrand<T> = T extends Brand<infer U, unknown> ? U : T;

/** Create a branded type factory */
export type BrandFactory<T, B> = (value: T) => Brand<T, B>;

/** Type-safe branded type creator */
export const createBrand = <T, B extends string>(brand: B) => {
  return (value: T): Brand<T, B> => value as Brand<T, B>;
};

// ============================================================================
// ASYNC TYPES
// ============================================================================

/** Async state for data loading */
export interface AsyncState<TData, TError = Error> {
  readonly data: TData | null;
  readonly loading: boolean;
  readonly error: TError | null;
}

/** Async state with success flag */
export interface AsyncStateWithSuccess<TData, TError = Error> extends AsyncState<TData, TError> {
  readonly success: boolean;
}

/** Create async state */
export const createAsyncState = <TData, TError = Error>(): AsyncState<TData, TError> => ({
  data: null,
  loading: false,
  error: null,
});

/** Update async state to loading */
export const setLoading = <TData, TError = Error>(
  state: AsyncState<TData, TError>
): AsyncState<TData, TError> => ({
  ...state,
  loading: true,
  error: null,
});

/** Update async state with success */
export const setSuccess = <TData, TError = Error>(
  state: AsyncState<TData, TError>,
  data: TData
): AsyncState<TData, TError> => ({
  data,
  loading: false,
  error: null,
});

/** Update async state with error */
export const setError = <TData, TError = Error>(
  state: AsyncState<TData, TError>,
  error: TError
): AsyncState<TData, TError> => ({
  ...state,
  loading: false,
  error,
});

// ============================================================================
// RESULT TYPES
// ============================================================================

/** Result type for operations that can succeed or fail */
export type Result<TSuccess, TError = Error> = 
  | { readonly success: true; readonly data: TSuccess }
  | { readonly success: false; readonly error: TError };

/** Create a success result */
export const success = <TSuccess>(data: TSuccess): Result<TSuccess, never> => ({
  success: true,
  data,
});

/** Create an error result */
export const failure = <TError>(error: TError): Result<never, TError> => ({
  success: false,
  error,
});

/** Type guard for success result */
export const isSuccess = <TSuccess, TError>(
  result: Result<TSuccess, TError>
): result is { success: true; data: TSuccess } => {
  return result.success === true;
};

/** Type guard for error result */
export const isFailure = <TSuccess, TError>(
  result: Result<TSuccess, TError>
): result is { success: false; error: TError } => {
  return result.success === false;
};

// ============================================================================
// OPTION TYPES
// ============================================================================

/** Option type for nullable values */
export type Option<T> = T | null | undefined;

/** Some value (not null or undefined) */
export type Some<T> = NonNullable<T>;

/** None value (null or undefined) */
export type None = null | undefined;

/** Check if option has a value */
export const isSome = <T>(option: Option<T>): option is Some<T> => {
  return option !== null && option !== undefined;
};

/** Check if option is empty */
export const isNone = <T>(option: Option<T>): option is None => {
  return option === null || option === undefined;
};

/** Get value from option or return default */
export const getOrElse = <T>(option: Option<T>, defaultValue: T): T => {
  return isSome(option) ? option : defaultValue;
};

/** Map over option value */
export const mapOption = <T, U>(
  option: Option<T>,
  mapper: (value: T) => U
): Option<U> => {
  return isSome(option) ? mapper(option) : option;
};

// ============================================================================
// TYPE GUARDS
// ============================================================================

/** Type guard for checking if value is not null or undefined */
export const isNotNull = <T>(value: T | null | undefined): value is T => {
  return value !== null && value !== undefined;
};

/** Type guard for checking if value is null */
export const isNull = <T>(value: T | null): value is null => {
  return value === null;
};

/** Type guard for checking if value is undefined */
export const isUndefined = <T>(value: T | undefined): value is undefined => {
  return value === undefined;
};

/** Type guard for checking if value is string */
export const isString = (value: unknown): value is string => {
  return typeof value === 'string';
};

/** Type guard for checking if value is number */
export const isNumber = (value: unknown): value is number => {
  return typeof value === 'number' && !isNaN(value);
};

/** Type guard for checking if value is boolean */
export const isBoolean = (value: unknown): value is boolean => {
  return typeof value === 'boolean';
};

/** Type guard for checking if value is object */
export const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/** Type guard for checking if value is array */
export const isArray = <T>(value: unknown): value is T[] => {
  return Array.isArray(value);
};

/** Type guard for checking if value is function */
export const isFunction = (value: unknown): value is Function => {
  return typeof value === 'function';
};

/** Type guard for checking if value is promise */
export const isPromise = <T>(value: unknown): value is Promise<T> => {
  return value instanceof Promise;
};

/** Type guard for checking if value is date */
export const isDate = (value: unknown): value is Date => {
  return value instanceof Date && !isNaN(value.getTime());
};

/** Type guard for checking if value is error */
export const isError = (value: unknown): value is Error => {
  return value instanceof Error;
};

// ============================================================================
// ARRAY UTILITIES
// ============================================================================

/** Non-empty array type */
export type NonEmptyArray<T> = [T, ...T[]];

/** Check if array is non-empty */
export const isNonEmptyArray = <T>(array: T[]): array is NonEmptyArray<T> => {
  return array.length > 0;
};

/** Get first element of array safely */
export const first = <T>(array: readonly T[]): Option<T> => {
  return array.length > 0 ? array[0] : undefined;
};

/** Get last element of array safely */
export const last = <T>(array: readonly T[]): Option<T> => {
  return array.length > 0 ? array[array.length - 1] : undefined;
};

/** Remove duplicates from array */
export const unique = <T>(array: readonly T[]): T[] => {
  return Array.from(new Set(array));
};

/** Group array elements by key */
export const groupBy = <T, K extends string | number | symbol>(
  array: readonly T[],
  keyFn: (item: T) => K
): Record<K, T[]> => {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key]!.push(item);
    return groups;
  }, {} as Record<K, T[]>);
};

/** Chunk array into smaller arrays */
export const chunk = <T>(array: readonly T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

// ============================================================================
// OBJECT UTILITIES
// ============================================================================

/** Pick properties from object with type safety */
export const pick = <T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: readonly K[]
): Pick<T, K> => {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
};

/** Omit properties from object with type safety */
export const omit = <T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: readonly K[]
): Omit<T, K> => {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
};

/** Check if object has property */
export const has = <T extends Record<string, unknown>>(
  obj: T,
  key: string | number | symbol
): key is keyof T => {
  return Object.prototype.hasOwnProperty.call(obj, key);
};

// ============================================================================
// FUNCTION UTILITIES
// ============================================================================

/** Debounce function */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), wait);
  };
};

/** Throttle function */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

/** Memoize function */
export const memoize = <T extends (...args: any[]) => any>(
  func: T,
  keyFn?: (...args: Parameters<T>) => string
): T => {
  const cache = new Map<string, ReturnType<T>>();
  
  return ((...args: Parameters<T>) => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    const result = func(...args);
    cache.set(key, result);
    return result;
  }) as T;
};