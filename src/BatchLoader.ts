import withResolvers from 'promise.withresolvers'

withResolvers.shim()

import type {
  BatchLoaderStatus,
  IBatchLoaderGetStateResult,
  IBatchLoaderItem,
  IBatchLoaderItemPatch,
  IBatchLoaderItemsStore,
  IBatchLoaderOptions,
} from './BatchLoader.types'
import DefaultBatchLoaderItemsStore from './DefaultBatchLoaderItemsStore'

function defaultBatchScheduleFn(callback: () => void): void {
  setTimeout(callback)
}

const fetchingItemPatch: IBatchLoaderItemPatch<never> = Object.freeze({
  status: 'fetching',
})

export default class BatchLoader<ID extends number | string, R> {
  private readonly batchScheduleFn: (callback: () => void) => void
  private readonly itemsStore: IBatchLoaderItemsStore<ID, R>
  public batchStatus: BatchLoaderStatus = 'unrequested'
  private batchBuffer: ID[] = []

  constructor(private readonly options: IBatchLoaderOptions<ID, R>) {
    this.batchScheduleFn = options.batchScheduleFn || defaultBatchScheduleFn
    this.itemsStore = options.itemsStore || new DefaultBatchLoaderItemsStore<ID, R>()
  }

  getState(id: ID): IBatchLoaderGetStateResult<R> {
    const item = this.itemsStore.get(id)

    return item
      ? ({
        status: item.status,
        result: item.result,
      } as IBatchLoaderGetStateResult<R>)
      : {
        status: 'unrequested',
        result: undefined,
      }
  }

  getResult(id: ID): R | undefined {
    return this.itemsStore.get(id)?.result
  }

  getStatus(id: ID): BatchLoaderStatus {
    return this.itemsStore.get(id)?.status || 'unrequested'
  }

  load(id: ID): Promise<R> {
    const item = this.itemsStore.get(id)

    if (item && !this.canFetch(item)) {
      return item.deferred.promise
    }

    const { promise } = this.scheduleItem(id, item)

    this.scheduleBatchFetch()

    return promise
  }

  loadMany(ids: ID[]): Promise<R[]> {
    const idsForFetch = ids.filter((id) => {
      const item = this.itemsStore.get(id)

      return !item || this.canFetch(item)
    })

    if (idsForFetch.length > 0) {
      for (const id of idsForFetch) {
        void this.scheduleItem(id)
      }

      this.scheduleBatchFetch()
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return Promise.all(ids.map((id) => this.itemsStore.get(id)!.deferred.promise))
  }

  private canFetch(item: IBatchLoaderItem<R>): boolean {
    return (
      item.status === 'rejected'
      || (item.status === 'resolved' && this.options.refetchStrategy === 'refresh')
    )
  }

  private scheduleItem(id: ID, item?: IBatchLoaderItem<R>): PromiseWithResolvers<R> {
    const deferred = Promise.withResolvers<R>()

    // let resolve: (value: R | PromiseLike<R>) => void
    // let reject: (reason?: unknown) => void
    // const promise = new Promise<R>((innerResolve, innerReject) => {
    //   resolve = innerResolve
    //   reject = innerReject
    // })
    // const deferred = {
    //   promise,
    //   // @ts-ignore
    //   resolve,
    //   // @ts-ignore
    //   reject,
    // }

    const newItem = {
      deferred,
      status: 'scheduled',
    } as const

    if (item) {
      this.itemsStore.update(id, newItem)
    } else {
      this.itemsStore.add(id, newItem)
    }

    this.batchBuffer.push(id)

    return deferred
  }

  private scheduleBatchFetch() {
    if (this.batchStatus === 'scheduled' || this.batchStatus === 'fetching') {
      return
    }

    // from 'initial', 'resolved' or 'rejected'
    this.batchStatus = 'scheduled'

    this.batchScheduleFn(() => {
      this.batchStatus = 'fetching'

      const { batchBuffer } = this

      this.batchBuffer = []

      void this.doFetch(batchBuffer).then((batchStatus) => {
        this.batchStatus = batchStatus

        if (this.batchBuffer.length > 0) {
          this.scheduleBatchFetch()
        }
      })
    })
  }

  private async doFetch(ids: ID[]): Promise<'resolved' | 'rejected'> {
    let results: (R | Error | null | undefined)[]

    this.itemsStore.batchUpdate(
      ids.map((id) => [id, fetchingItemPatch as IBatchLoaderItemPatch<R>])
    )

    try {
      results = await this.options.batchFetch(ids)
    } catch (error: unknown) {
      const patch: IBatchLoaderItemPatch<R> = {
        status: 'rejected',
        error,
      }

      const items = this.itemsStore.batchUpdate(ids.map((id) => [id, patch]))

      for (const item of items) {
        item.deferred.reject(error)
      }

      this.options.onError?.(error)
      return 'rejected'
    }

    const items = this.itemsStore.batchUpdate(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      ids
        .map((id, index) => {
          const result = results[index]

          return result ? this.createBatchUpdateEntry(id, result) : undefined
        })
        .filter(Boolean) as [ID, IBatchLoaderItemPatch<R>][]
    )

    for (const { deferred, result, error } of items) {
      if (error) {
        deferred.reject(error)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-non-null-assertion
        deferred.resolve(result!)
      }
    }

    return 'resolved'
  }

  private createBatchUpdateEntry(id: ID, result: R | Error): [ID, IBatchLoaderItemPatch<R>] {
    return [
      id,
      result instanceof Error
        ? {
          status: 'rejected',
          error: result,
        }
        : {
          status: 'resolved',
          result,
          error: undefined,
        },
    ]
  }
}
