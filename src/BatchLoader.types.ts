import type { PromiseWithResolvers } from './promiseWithResolvers'

type BatchFetchFunction<ID extends number | string, R> = (
  ids: ID[],
) => Promise<(R | Error | undefined)[]>

export interface IBatchLoaderOptions<ID extends number | string, R> {
  batchFetch: BatchFetchFunction<ID, R>
  batchScheduleFn?: (this: void, callback: () => void) => void
  itemsStore?: IBatchLoaderItemsStore<ID, R>
  refetchStrategy?: 'unfetched' | 'refresh' // default: 'unfetched'
  /**
   Max ids per one `batchFetch` call; a bigger buffer is flushed in parallel chunks.
  */
  maxBatchSize?: number
  onError?: (error: unknown) => void
}

export interface IBatchLoaderItemsStore<ID extends number | string, R> {
  get: (id: ID) => IBatchLoaderItem<R> | undefined
  add: (id: ID, item: IBatchLoaderItem<R>) => void
  update: (id: ID, patch: IBatchLoaderItemPatch<R>) => IBatchLoaderItem<R>
  batchUpdate: (entries: [ID, IBatchLoaderItemPatch<R>][]) => IBatchLoaderItem<R>[]
  /**
   Optional; enables `loader.clear()`.
  */
  delete?: (id: ID) => void
  /**
   Optional; enables `loader.clearAll()`.
  */
  clear?: () => void
}

export type BatchLoaderStatus =
  | 'unrequested'
  | 'scheduled'
  | 'fetching'
  | 'resolved'
  | 'rejected'

export type IBatchLoaderItem<R> = {
  readonly deferred: PromiseWithResolvers<R>
  /**
   Set by `optimisticUpdate`; a batch dispatched with an older snapshot must not overwrite the item.
  */
  readonly optimisticRevision?: number
} & (
  | {
    readonly status: 'scheduled'
    readonly result?: R
    readonly error?: unknown
  }
  | {
    readonly status: 'fetching'
    readonly result?: R
    readonly error?: unknown
  }
  | {
    readonly status: 'resolved'
    readonly result: R | undefined
    readonly error?: unknown
  }
  | {
    readonly status: 'rejected'
    readonly result?: R
    readonly error: unknown
  }
  )

export type IBatchLoaderItemPatch<R> =
  | {
    readonly deferred: PromiseWithResolvers<R>
    readonly status: 'scheduled'
  }
  | {
    readonly status: 'fetching'
  }
  | {
    readonly status: 'resolved'
    readonly result: R | undefined
    readonly error: undefined
    readonly optimisticRevision?: number
    readonly deferred?: PromiseWithResolvers<R>
  }
  | {
    readonly status: 'rejected'
    readonly error: unknown
  }

export type IBatchLoaderGetStateResult<R> =
  | {
    status: 'unrequested'
    result?: undefined
  }
  | {
    status: Exclude<BatchLoaderStatus, 'unrequested' | 'resolved' | 'rejected'>
    result: R | undefined
  }
  | {
    status: 'resolved'
    result: R
  }
  | {
    status: 'rejected'
    result: R | undefined
    error: unknown
  }
