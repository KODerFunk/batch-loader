/* eslint-disable max-lines */
import type {
  BatchLoaderStatus,
  IBatchLoaderGetStateResult,
  IBatchLoaderItem,
  IBatchLoaderItemPatch,
  IBatchLoaderItemsStore,
  IBatchLoaderOptions,
} from './BatchLoader.types'
import DefaultBatchLoaderItemsStore from './DefaultBatchLoaderItemsStore'
import type { PromiseWithResolvers } from './promiseWithResolvers'
import promiseWithResolvers from './promiseWithResolvers'

const MIN_MAX_BATCH_SIZE = 1

function defaultBatchScheduleFunction(this: void, callback: () => void): void {
  setTimeout(callback)
}

const fetchingItemPatch: IBatchLoaderItemPatch<never> = Object.freeze({
  status: 'fetching',
})

export default class BatchLoader<ID extends number | string, R> {
  private readonly batchScheduleFn: (callback: () => void) => void
  private readonly maxBatchSize: number | undefined
  // Invalidates the pending scheduler callback after flush()/clear() so it cannot dispatch twice
  private batchEpoch = 0
  // Monotonic revision of the last optimisticUpdate; batches snapshot it per id on dispatch
  private optimisticRevisionCounter = 0
  protected readonly itemsStore: IBatchLoaderItemsStore<ID, R>
  protected batchStatus: BatchLoaderStatus = 'unrequested'
  protected batchBuffer: ID[] = []

  constructor(private readonly options: IBatchLoaderOptions<ID, R>) {
    validateBatchLoaderOptions(options)

    this.batchScheduleFn = options.batchScheduleFn || defaultBatchScheduleFunction
    this.maxBatchSize = options.maxBatchSize
    this.itemsStore = options.itemsStore || new DefaultBatchLoaderItemsStore<ID, R>()
  }

  getState(id: ID): IBatchLoaderGetStateResult<R> {
    const item = this.itemsStore.get(id)

    if (item) {
      if (item.status === 'rejected') {
        return {
          status: item.status,
          result: item.result,
          error: item.error,
        }
      }

      return {
        status: item.status,
        result: item.result,
      } as IBatchLoaderGetStateResult<R>
    }

    return {
      status: 'unrequested',
      result: undefined,
    }
  }

  optimisticUpdate(id: ID, result: R): void {
    this.optimisticRevisionCounter += 1

    const item = this.itemsStore.get(id)

    if (item && this.batchBuffer.includes(id)) {
      // Still waiting in the batch buffer: the upcoming batch owns the promise and must
      // settle it with fresh server data — only the observable state is patched
      this.itemsStore.update(id, this.createOptimisticPatch(result))
    } else {
      this.upsertResolvedItem(id, item, result)
    }
  }

  getResult(id: ID): R | undefined {
    return this.itemsStore.get(id)?.result
  }

  getStatus(id: ID): BatchLoaderStatus {
    return this.itemsStore.get(id)?.status || 'unrequested'
  }

  load(id: ID): Promise<R> {
    assertValidId('load', id)

    return this.requestItem(id)
  }

  loadMany<IDS extends readonly ID[]>(
    ids: IDS,
  ): Promise<{ -readonly [I in keyof IDS]: R }> {
    for (const id of ids) {
      assertValidId('loadMany', id)
    }

    return Promise.all(
      ids.map((id) => this.requestItem(id)),
    ) as Promise<{ -readonly [I in keyof IDS]: R }>
  }

  /**
   Executes the currently scheduled batch immediately, ignoring the scheduling window.
  */
  flush(): void {
    if (this.batchStatus !== 'scheduled') {
      return
    }

    // The still-pending scheduler callback must not dispatch a second time
    this.batchEpoch += 1

    this.dispatch()
  }

  /**
   Removes one item from the cache, so the next `load` re-fetches it.
   A pending item is dropped together with its promise — awaiting it never settles.
  */
  clear(id: ID): void {
    if (!this.itemsStore.delete) {
      throw new TypeError('itemsStore does not implement delete() — clear(id) is not supported.')
    }

    this.batchBuffer = this.batchBuffer.filter((bufferId) => bufferId !== id)

    this.itemsStore.delete(id)

    this.cancelEmptyScheduledBatch()
  }

  /**
   Removes all items from the cache. An in-flight batch (if any) completes,
   but its results apply to nothing.
  */
  clearAll(): void {
    if (!this.itemsStore.clear) {
      throw new TypeError('itemsStore does not implement clear() — clearAll() is not supported.')
    }

    this.batchBuffer = []
    this.itemsStore.clear()

    this.cancelEmptyScheduledBatch()
  }

  // Deduplicates a known pending/resolved item to its existing promise, otherwise
  // schedules a fetch and returns the fresh promise
  private requestItem(id: ID): Promise<R> {
    const item = this.itemsStore.get(id)

    if (item && !this.canFetch(item)) {
      return item.deferred.promise
    }

    const { promise } = this.scheduleItem(id, item)

    this.scheduleBatchFetch()

    return promise
  }

  private canFetch(item: IBatchLoaderItem<R>): boolean {
    return (
      item.status === 'rejected'
      || (item.status === 'resolved' && this.options.refetchStrategy === 'refresh')
    )
  }

  private createOptimisticPatch(
    result: R,
  ): Extract<IBatchLoaderItemPatch<R>, { status: 'resolved' }> {
    return {
      status: 'resolved',
      result,
      error: undefined,
      optimisticRevision: this.optimisticRevisionCounter,
    }
  }

  // Puts a fully resolved item — a brand-new one, or a replacement. The superseded
  // promise is settled with the optimistic value first: a no-op when it has already
  // settled, a lifeline for a load() still waiting on a doomed batch
  private upsertResolvedItem(id: ID, item: IBatchLoaderItem<R> | undefined, result: R): void {
    const deferred = promiseWithResolvers<R>()

    deferred.resolve(result)
    item?.deferred.resolve(result)

    const patch = { ...this.createOptimisticPatch(result), deferred }

    if (item) {
      this.itemsStore.update(id, patch)
    } else {
      this.itemsStore.add(id, patch)
    }
  }

  private scheduleItem(id: ID, item?: IBatchLoaderItem<R>): PromiseWithResolvers<R> {
    const deferred = promiseWithResolvers<R>()

    const newItem = {
      deferred,
      status: 'scheduled',
    } as const

    if (item) {
      // The batch machinery settles only the deferred currently stored on the item —
      // resolve the superseded one so an optimistic-era promise cannot hang forever
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      item.deferred.resolve(item.result!)
      this.itemsStore.update(id, newItem)
    } else {
      this.itemsStore.add(id, newItem)
    }

    if (!this.batchBuffer.includes(id)) {
      this.batchBuffer.push(id)
    }

    return deferred
  }

  private scheduleBatchFetch(): void {
    if (this.batchStatus === 'scheduled' || this.batchStatus === 'fetching') {
      return
    }

    // from 'unrequested', 'resolved' or 'rejected'
    this.batchStatus = 'scheduled'

    const epoch = this.batchEpoch

    this.batchScheduleFn(() => {
      // Stale (after flush()/clear()) or duplicated callback — already handled
      if (epoch !== this.batchEpoch || this.batchBuffer.length === 0) {
        return
      }

      this.dispatch()
    })
  }

  private dispatch(): void {
    this.batchStatus = 'fetching'

    // Items cleared while waiting for the scheduler are not fetched
    const ids = this.batchBuffer.filter((id) => this.itemsStore.get(id))

    this.batchBuffer = []

    // Optimistic updates made after the batch starts must win over its results;
    // only revisions already set at dispatch time are snapshotted
    const revisions = new Map(ids.flatMap((id) => {
      const revision = this.itemsStore.get(id)?.optimisticRevision

      return revision === undefined ? [] : [[id, revision] as const]
    }))

    this.runBatchChunks(ids, revisions)
  }

  private runBatchChunks(ids: ID[], revisions: ReadonlyMap<ID, number>): void {
    const maxBatchSize = this.maxBatchSize ?? ids.length
    const chunks: ID[][] = []

    for (let start = 0; start < ids.length; start += maxBatchSize) {
      chunks.push(ids.slice(start, start + maxBatchSize))
    }

    const completeBatch = (chunksStatuses: ('resolved' | 'rejected')[]): void => {
      this.finishBatch(
        chunksStatuses.every((chunkStatus) => chunkStatus === 'resolved')
          ? 'resolved'
          : 'rejected',
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    if (chunks.length === 1) {
      // Fast path: no Promise.all hop — the batch settles right after doFetch
      void this.doFetch(ids, revisions)
        .then((chunkStatus) => {
          completeBatch([chunkStatus])
        })
    } else {
      void Promise.all(chunks.map((chunk) => this.doFetch(chunk, revisions)))
        .then(completeBatch)
    }
  }

  // eslint-disable-next-line max-statements
  private async doFetch(
    ids: ID[],
    revisions: ReadonlyMap<ID, number>,
  ): Promise<'resolved' | 'rejected'> {
    try {
      this.itemsStore.batchUpdate(
        ids.map((id) => [id, fetchingItemPatch as IBatchLoaderItemPatch<R>]),
      )
    } catch (error: unknown) {
      try {
        this.applyBatchError(ids, error, revisions)
      } catch {
        // noop
      }
      return 'rejected'
    }

    let results: (R | Error | undefined)[]

    try {
      results = await this.options.batchFetch(ids)
    } catch (error: unknown) {
      this.applyBatchError(ids, error, revisions)
      return 'rejected'
    }

    const resultsError = this.createResultsValidationError(ids, results)

    if (resultsError) {
      this.applyBatchError(ids, resultsError, revisions)
      return 'rejected'
    }

    try {
      this.applyBatchResults(ids, results, revisions)
    } catch (error: unknown) {
      try {
        this.applyBatchError(ids, error, revisions)
      } catch {
        // noop
      }
      return 'rejected'
    }

    return 'resolved'
  }

  private createResultsValidationError(ids: ID[], results: unknown): TypeError | undefined {
    if (Array.isArray(results) && results.length === ids.length) {
      return undefined
    }

    const resultsDescription = Array.isArray(results)
      ? `an array of length ${String(results.length)}`
      : String(results)

    return new TypeError(
      `batchFetch must resolve to an array with exactly one entry per requested id (${String(ids.length)}), `
      + `but got: ${resultsDescription}.`,
    )
  }

  private applyBatchError(
    ids: readonly ID[],
    error: unknown,
    revisions: ReadonlyMap<ID, number>,
  ): void {
    const items = this.applyItemPatches(
      ids,
      () => ({
        status: 'rejected',
        error,
      }),
      revisions,
    )

    this.settleItems(items)

    this.options.onError?.(error)
  }

  private applyBatchResults(
    ids: ID[],
    results: (R | Error | undefined)[],
    revisions: ReadonlyMap<ID, number>,
  ): void {
    const items = this.applyItemPatches(
      ids,
      (index) => this.createResultPatch(results[index]),
      revisions,
    )

    this.settleItems(items)
  }

  // Settles every patched item's deferred according to its final status
  private settleItems(items: IBatchLoaderItem<R>[]): void {
    for (const item of items) {
      if (item.status === 'rejected') {
        item.deferred.reject(item.error)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        item.deferred.resolve(item.result!)
      }
    }
  }

  private applyItemPatches(
    ids: readonly ID[],
    createPatch: (index: number) => IBatchLoaderItemPatch<R>,
    revisions: ReadonlyMap<ID, number>,
  ): IBatchLoaderItem<R>[] {
    const entries: [ID, IBatchLoaderItemPatch<R>][] = []

    for (const [index, id] of ids.entries()) {
      if (!this.skipBatchItem(id, revisions)) {
        entries.push([id, createPatch(index)])
      }
    }

    return entries.length > 0 ? this.itemsStore.batchUpdate(entries) : []
  }

  // Returns true when the item must be skipped: deleted mid-flight (e.g. via clear()),
  // or protected by a newer optimistic update — the promise has already been settled
  // by optimisticUpdate, and the store value must not be overwritten. Resolving the
  // deferred here is not an option: it may belong to a load() issued after the update.
  private skipBatchItem(id: ID, revisions: ReadonlyMap<ID, number>): boolean {
    const item = this.itemsStore.get(id)

    if (!item) {
      return true
    }

    const revisionAtDispatch = revisions.get(id)

    return item.optimisticRevision !== undefined
      && (revisionAtDispatch === undefined || item.optimisticRevision > revisionAtDispatch)
  }

  private createResultPatch(result: R | Error | undefined): IBatchLoaderItemPatch<R> {
    return result instanceof Error
      ? {
        status: 'rejected',
        error: result,
      }
      : {
        status: 'resolved',
        result,
        error: undefined,
      }
  }

  private finishBatch(status: 'resolved' | 'rejected'): void {
    this.batchStatus = status

    if (this.batchBuffer.length > 0) {
      this.scheduleBatchFetch()
    }
  }

  private cancelEmptyScheduledBatch(): void {
    if (!(this.batchStatus === 'scheduled' && this.batchBuffer.length === 0)) {
      return
    }

    // Nothing left to dispatch — invalidate the pending scheduler callback
    this.batchEpoch += 1
    this.batchStatus = 'resolved'
  }
}

function assertValidId(method: string, id: unknown): void {
  if (id === null || id === undefined) {
    throw new TypeError(`The ${method}() function must be called with an id, but got: ${String(id)}.`)
  }
}

function validateBatchLoaderOptions<ID extends number | string, R>(
  options: IBatchLoaderOptions<ID, R>,
): void {
  if (typeof options.batchFetch !== 'function') {
    throw new TypeError(
      `BatchLoader must be constructed with a batchFetch function, but got: ${String(options.batchFetch)}.`,
    )
  }

  if (options.batchScheduleFn !== undefined && typeof options.batchScheduleFn !== 'function') {
    throw new TypeError(
      `batchScheduleFn must be a function, but got: ${String(options.batchScheduleFn)}.`,
    )
  }

  if (options.maxBatchSize !== undefined
    && (typeof options.maxBatchSize !== 'number'
      || !Number.isSafeInteger(options.maxBatchSize)
      || options.maxBatchSize < MIN_MAX_BATCH_SIZE)) {
    throw new TypeError(
      `maxBatchSize must be a positive integer, but got: ${String(options.maxBatchSize)}.`,
    )
  }
}
