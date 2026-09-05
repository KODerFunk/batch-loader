/* eslint-disable max-lines, max-lines-per-function, max-statements, max-classes-per-file, @typescript-eslint/no-magic-numbers */
import type {
  BatchLoaderStatus,
  IBatchLoaderItem,
  IBatchLoaderItemPatch,
  IBatchLoaderItemsStore,
  IBatchLoaderOptions,
} from './BatchLoader.types'
import BatchLoader from './BatchLoader'
import DefaultBatchLoaderItemsStore from './DefaultBatchLoaderItemsStore'
import ImmutableBatchLoaderItemsStore from './ImmutableBatchLoaderItemsStore'
import promiseWithResolvers from './promiseWithResolvers'
import type { PromiseWithResolvers } from './promiseWithResolvers'

const TEST_TIMEOUT = 1

function timeout(delay = 0): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delay)
  })
}

const emptyBatchFetch = (): Promise<{ test: string }[]> => Promise.resolve([])

// Throws on the first `failTimes` batchUpdate calls, then behaves like a regular store —
// emulates a store failure on the fetching patch and on the error patch
class BatchUpdateErrorItemsStore<ID extends number | string, R>
  extends DefaultBatchLoaderItemsStore<ID, R> {
  private failedCallsCount = 0

  constructor(private readonly failTimes: number) {
    super()
  }

  batchUpdate(entries: [ID, IBatchLoaderItemPatch<R>][]): IBatchLoaderItem<R>[] {
    if (this.failedCallsCount < this.failTimes) {
      this.failedCallsCount += 1
      throw new Error('Test itemsStore batchUpdate error')
    }

    return super.batchUpdate(entries)
  }
}

describe('BatchLoader', () => {
  it('should work with batchFetch only', async () => {
    let salt = '1'

    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: (ids) => new Promise((resolve) => {
        setTimeout(() => {
          resolve(
            ids.map((id) => ({
              test: `test_${id}_${salt}`,
            })),
          )
        }, TEST_TIMEOUT)
      }),
    }

    const batchFetchSpy = jest.spyOn(options, 'batchFetch')
    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    expect(testBatchLoader.getStatus('a')).toStrictEqual('unrequested')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'unrequested',
      result: undefined,
    })

    const promiseA1 = testBatchLoader.load('a')

    void testBatchLoader.load('b')

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'scheduled',
      result: undefined,
    })

    await timeout()

    const promiseA2 = testBatchLoader.load('a')

    expect(promiseA2 === promiseA1).toStrictEqual(true)
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'fetching',
      result: undefined,
    })
    expect(testBatchLoader.getStatus('a')).toStrictEqual('fetching')

    expect(await promiseA1).toStrictEqual({ test: 'test_a_1' })

    const promiseA3 = testBatchLoader.load('a')
    const promiseC = testBatchLoader.load('c')

    expect(promiseA3 === promiseA1).toStrictEqual(true)

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'test_a_1' },
    })
    expect(testBatchLoader.getResult('a')).toStrictEqual({ test: 'test_a_1' })
    expect(testBatchLoader.getState('c')).toStrictEqual({
      status: 'scheduled',
      result: undefined,
    })

    salt = '2'

    expect(await promiseC).toStrictEqual({ test: 'test_c_2' })

    expect(batchFetchSpy).toHaveBeenCalledTimes(2)
    expect(batchFetchSpy).toHaveBeenNthCalledWith(1, ['a', 'b'])
    expect(batchFetchSpy).toHaveBeenNthCalledWith(2, ['c'])
  })

  it('should work optimisticUpdate', async () => {
    let salt = '1'

    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: (ids) => new Promise((resolve) => {
        setTimeout(() => {
          resolve(
            ids.map((id) => ({
              test: `test_${id}_${salt}`,
            })),
          )
        }, TEST_TIMEOUT)
      }),
      refetchStrategy: 'refresh',
    }

    const batchFetchSpy = jest.spyOn(options, 'batchFetch')
    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    expect(testBatchLoader.getStatus('a')).toStrictEqual('unrequested')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'unrequested',
      result: undefined,
    })

    testBatchLoader.optimisticUpdate('a', { test: 'optimistic_value_before_load_a' })
    testBatchLoader.optimisticUpdate('b', { test: 'optimistic_value_before_load_b' })

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'optimistic_value_before_load_a' },
    })

    const promiseA1 = testBatchLoader.load('a')

    void testBatchLoader.load('b')

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'scheduled',
      result: { test: 'optimistic_value_before_load_a' },
    })

    testBatchLoader.optimisticUpdate('a', { test: 'optimistic_value_after_scheduled_a' })

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'optimistic_value_after_scheduled_a' },
    })

    await timeout()

    const promiseA2 = testBatchLoader.load('a')

    expect(promiseA2 === promiseA1).toStrictEqual(true)
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'fetching',
      result: { test: 'optimistic_value_after_scheduled_a' },
    })
    expect(testBatchLoader.getStatus('a')).toStrictEqual('fetching')

    testBatchLoader.optimisticUpdate('a', { test: 'optimistic_value_after_fetching_a' })

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'optimistic_value_after_fetching_a' },
    })

    // The batch was in flight when the optimisticUpdate happened — the optimistic value wins
    expect(await promiseA1).toStrictEqual({ test: 'optimistic_value_after_fetching_a' })

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'optimistic_value_after_fetching_a' },
    })

    testBatchLoader.optimisticUpdate('a', { test: 'optimistic_value_after_await_a' })

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'optimistic_value_after_await_a' },
    })

    const promiseA3 = testBatchLoader.load('a')
    const promiseC = testBatchLoader.load('c')

    expect(promiseA3 === promiseA1).toStrictEqual(false)
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'scheduled',
      result: { test: 'optimistic_value_after_await_a' },
    })
    expect(testBatchLoader.getState('c')).toStrictEqual({
      status: 'scheduled',
      result: undefined,
    })

    salt = '2'

    expect(await promiseC).toStrictEqual({ test: 'test_c_2' })
    expect(await promiseA3).toStrictEqual({ test: 'test_a_2' })
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'test_a_2' },
    })

    expect(batchFetchSpy).toHaveBeenCalledTimes(2)
    expect(batchFetchSpy).toHaveBeenNthCalledWith(1, ['a', 'b'])
    expect(batchFetchSpy).toHaveBeenNthCalledWith(2, ['a', 'c'])
  })

  it('should keep the optimistic value when a batch started before optimisticUpdate resolves', async () => {
    const batchFetchDeferreds: PromiseWithResolvers<{ test: string }[]>[] = []

    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: () => {
        const deferred = promiseWithResolvers<{ test: string }[]>()
        batchFetchDeferreds.push(deferred)
        return deferred.promise
      },
    }

    const batchFetchSpy = jest.spyOn(options, 'batchFetch')
    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    const promiseA = testBatchLoader.load('a')

    // The scheduler has dispatched the batch and taken its revision snapshot
    await timeout()

    expect(testBatchLoader.getStatus('a')).toStrictEqual('fetching')

    testBatchLoader.optimisticUpdate('a', { test: 'optimistic_a' })

    batchFetchDeferreds[0]?.resolve([{ test: 'old_a' }])

    await expect(promiseA).resolves.toStrictEqual({ test: 'optimistic_a' })
    expect(testBatchLoader.getResult('a')).toStrictEqual({ test: 'optimistic_a' })
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'optimistic_a' },
    })
    expect(batchFetchSpy).toHaveBeenCalledTimes(1)
    expect(batchFetchSpy).toHaveBeenNthCalledWith(1, ['a'])
  })

  it('should resolve with the optimistic value when a batch started before optimisticUpdate rejects', async () => {
    const batchFetchDeferreds: PromiseWithResolvers<{ test: string }[]>[] = []

    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: () => {
        const deferred = promiseWithResolvers<{ test: string }[]>()
        batchFetchDeferreds.push(deferred)
        return deferred.promise
      },
      onError: () => {
        // noop
      },
    }

    const onErrorSpy = jest.spyOn(options, 'onError')
    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    const promiseA = testBatchLoader.load('a')

    // The scheduler has dispatched the batch and taken its revision snapshot
    await timeout()

    expect(testBatchLoader.getStatus('a')).toStrictEqual('fetching')

    testBatchLoader.optimisticUpdate('a', { test: 'optimistic_a' })

    batchFetchDeferreds[0]?.reject(new Error('test batch error'))

    await expect(promiseA).resolves.toStrictEqual({ test: 'optimistic_a' })
    expect(testBatchLoader.getResult('a')).toStrictEqual({ test: 'optimistic_a' })
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'optimistic_a' },
    })
    // The batch itself did fail — onError still reports the network fact
    expect(onErrorSpy).toHaveBeenCalledTimes(1)
    expect(onErrorSpy).toHaveBeenCalledWith(new Error('test batch error'))
  })

  it('should overwrite the optimistic value with a batch started after optimisticUpdate', async () => {
    const batchFetchDeferreds: PromiseWithResolvers<{ test: string }[]>[] = []

    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: () => {
        const deferred = promiseWithResolvers<{ test: string }[]>()
        batchFetchDeferreds.push(deferred)
        return deferred.promise
      },
      refetchStrategy: 'refresh',
    }

    const batchFetchSpy = jest.spyOn(options, 'batchFetch')
    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    testBatchLoader.optimisticUpdate('a', { test: 'optimistic_a' })

    // 'refresh' refetches the resolved item — the batch starts after the optimistic update
    const promiseA = testBatchLoader.load('a')

    await timeout()

    expect(testBatchLoader.getStatus('a')).toStrictEqual('fetching')

    batchFetchDeferreds[0]?.resolve([{ test: 'new_a' }])

    await expect(promiseA).resolves.toStrictEqual({ test: 'new_a' })
    expect(testBatchLoader.getResult('a')).toStrictEqual({ test: 'new_a' })
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'new_a' },
    })
    expect(batchFetchSpy).toHaveBeenCalledTimes(1)
    expect(batchFetchSpy).toHaveBeenNthCalledWith(1, ['a'])
  })

  it('should serve the optimistic value from load after optimisticUpdate on a resolved item', async () => {
    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: () => Promise.resolve([{ test: 'server_a' }]),
    }

    const batchFetchSpy = jest.spyOn(options, 'batchFetch')
    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    await expect(testBatchLoader.load('a')).resolves.toStrictEqual({ test: 'server_a' })

    testBatchLoader.optimisticUpdate('a', { test: 'optimistic_a' })

    expect(testBatchLoader.getResult('a')).toStrictEqual({ test: 'optimistic_a' })
    await expect(testBatchLoader.load('a')).resolves.toStrictEqual({ test: 'optimistic_a' })
    expect(batchFetchSpy).toHaveBeenCalledTimes(1)
  })

  it('should serve the optimistic value from load after optimisticUpdate on a rejected item', async () => {
    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: () => Promise.resolve([new Error('Test error a')]),
    }

    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    await expect(testBatchLoader.load('a')).rejects.toThrow('Test error a')

    testBatchLoader.optimisticUpdate('a', { test: 'optimistic_a' })

    await expect(testBatchLoader.load('a')).resolves.toStrictEqual({ test: 'optimistic_a' })
  })

  it('should not orphan the first load promise when optimisticUpdate is followed by a refresh load', async () => {
    const batchFetchDeferreds: PromiseWithResolvers<{ test: string }[]>[] = []

    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: () => {
        const deferred = promiseWithResolvers<{ test: string }[]>()
        batchFetchDeferreds.push(deferred)
        return deferred.promise
      },
      refetchStrategy: 'refresh',
    }

    const batchFetchSpy = jest.spyOn(options, 'batchFetch')
    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    const promiseA1 = testBatchLoader.load('a')

    // The scheduler has dispatched the batch and taken its revision snapshot
    await timeout()

    testBatchLoader.optimisticUpdate('a', { test: 'optimistic_a' })

    // Settles right away — without waiting for the in-flight batch
    await expect(promiseA1).resolves.toStrictEqual({ test: 'optimistic_a' })

    const promiseA2 = testBatchLoader.load('a')

    batchFetchDeferreds[0]?.resolve([{ test: 'old_a' }])

    // One tick for the batch bookkeeping microtasks, one for the scheduler timer that
    // dispatches the second batch for the refresh load
    await timeout()
    await timeout()

    batchFetchDeferreds[1]?.resolve([{ test: 'fresh_a' }])

    await expect(promiseA2).resolves.toStrictEqual({ test: 'fresh_a' })
    expect(testBatchLoader.getResult('a')).toStrictEqual({ test: 'fresh_a' })
    expect(batchFetchSpy).toHaveBeenCalledTimes(2)
  })

  it('should settle the load promise with fresh server data when optimisticUpdate happens in the scheduled window', async () => {
    let dispatchBatch: (() => void) | undefined

    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: () => Promise.resolve([{ test: 'server_a' }]),
      batchScheduleFn: (callback) => {
        dispatchBatch = callback
      },
    }

    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    const promiseA = testBatchLoader.load('a')

    testBatchLoader.optimisticUpdate('a', { test: 'optimistic_a' })

    expect(testBatchLoader.getResult('a')).toStrictEqual({ test: 'optimistic_a' })

    dispatchBatch?.()

    await expect(promiseA).resolves.toStrictEqual({ test: 'server_a' })
    expect(testBatchLoader.getResult('a')).toStrictEqual({ test: 'server_a' })
  })

  it('should not duplicate the id in the batch when a refresh load follows optimisticUpdate in the scheduled window', async () => {
    let dispatchBatch: (() => void) | undefined

    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: () => Promise.resolve([{ test: 'server_a' }]),
      batchScheduleFn: (callback) => {
        dispatchBatch = callback
      },
      refetchStrategy: 'refresh',
    }

    const batchFetchSpy = jest.spyOn(options, 'batchFetch')
    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    const promiseA1 = testBatchLoader.load('a')

    testBatchLoader.optimisticUpdate('a', { test: 'optimistic_a' })

    const promiseA2 = testBatchLoader.load('a')

    dispatchBatch?.()

    await expect(promiseA1).resolves.toStrictEqual({ test: 'optimistic_a' })
    await expect(promiseA2).resolves.toStrictEqual({ test: 'server_a' })
    expect(batchFetchSpy).toHaveBeenCalledTimes(1)
    expect(batchFetchSpy).toHaveBeenNthCalledWith(1, ['a'])
  })

  it('should deduplicate repeated ids within one loadMany', async () => {
    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: () => Promise.resolve([{ test: 'server_a' }]),
    }

    const batchFetchSpy = jest.spyOn(options, 'batchFetch')
    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    const [resultA1, resultA2] = await testBatchLoader.loadMany(['a', 'a'] as const)

    expect(resultA1).toStrictEqual({ test: 'server_a' })
    expect(resultA2).toStrictEqual({ test: 'server_a' })
    expect(batchFetchSpy).toHaveBeenCalledTimes(1)
    expect(batchFetchSpy).toHaveBeenNthCalledWith(1, ['a'])
  })

  it('should work when batchFetch throw Error', async () => {
    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: () => Promise.reject(new Error('test error')),
      onError: () => {
        // noop
      },
    }

    const onErrorSpy = jest.spyOn(options, 'onError')
    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    await Promise.all([
      expect(testBatchLoader.load('a')).rejects.toThrow('test error'),
      expect(testBatchLoader.load('b')).rejects.toThrow('test error'),
    ])

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'rejected',
      result: undefined,
      error: new Error('test error'),
    })

    expect(onErrorSpy).toHaveBeenCalledTimes(1)
    expect(onErrorSpy).toHaveBeenNthCalledWith(1, new Error('test error'))
  })

  it('should work with async fetches and custom itemsStore', async () => {
    let state: Record<string, IBatchLoaderItem<{ test: string }>> = {}

    const itemsStore = new ImmutableBatchLoaderItemsStore<string, { test: string }>(
      () => state,
      (newState) => {
        state = newState
      },
    )

    const itemsStoreSpies = {
      add: jest.spyOn(itemsStore, 'add'),
      update: jest.spyOn(itemsStore, 'update'),
      batchUpdate: jest.spyOn(itemsStore, 'batchUpdate'),
    }

    let salt = '1'

    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: (ids) => new Promise((resolve) => {
        setTimeout(() => {
          resolve(
            ids.map((id) => ({
              test: `test_${id}_${salt}`,
            })),
          )
        }, TEST_TIMEOUT)
      }),
      itemsStore,
    }

    const batchFetchSpy = jest.spyOn(options, 'batchFetch')
    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'unrequested',
      result: undefined,
    })

    const promiseA1 = testBatchLoader.load('a')

    void testBatchLoader.load('b')

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'scheduled',
      result: undefined,
    })

    await timeout()

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'fetching',
      result: undefined,
    })

    expect(await promiseA1).toStrictEqual({ test: 'test_a_1' })

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'test_a_1' },
    })

    salt = '2'

    const promiseA2 = testBatchLoader.load('a')
    const promiseC = testBatchLoader.load('c')

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'test_a_1' },
    })

    await timeout()

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'test_a_1' },
    })

    expect(await Promise.all([promiseA2, promiseC])).toStrictEqual([{ test: 'test_a_1' }, { test: 'test_c_2' }])

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'test_a_1' },
    })

    expect(batchFetchSpy).toHaveBeenCalledTimes(2)
    expect(itemsStoreSpies.add).toHaveBeenCalledTimes(3)
    expect(itemsStoreSpies.update).toHaveBeenCalledTimes(0)
    expect(itemsStoreSpies.batchUpdate).toHaveBeenCalledTimes(4)

    expect(itemsStoreSpies.batchUpdate).toHaveBeenNthCalledWith(1, [['a', { status: 'fetching' }], ['b', { status: 'fetching' }]])
    expect(batchFetchSpy).toHaveBeenNthCalledWith(1, ['a', 'b'])
    expect(itemsStoreSpies.batchUpdate).toHaveBeenNthCalledWith(2, [
      [
        'a',
        {
          status: 'resolved',
          result: { test: 'test_a_1' },
        },
      ],
      [
        'b',
        {
          status: 'resolved',
          result: { test: 'test_b_1' },
        },
      ],
    ])

    expect(itemsStoreSpies.batchUpdate).toHaveBeenNthCalledWith(3, [['c', { status: 'fetching' }]])
    expect(batchFetchSpy).toHaveBeenNthCalledWith(2, ['c'])
    expect(itemsStoreSpies.batchUpdate).toHaveBeenNthCalledWith(4, [
      [
        'c',
        {
          status: 'resolved',
          result: { test: 'test_c_2' },
        },
      ],
    ])
  })

  it('should work with default refetchStrategy (\'unfetched\')', async () => {
    let salt = '1'

    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: (ids) => new Promise((resolve) => {
        setTimeout(() => {
          resolve(
            ids.map((id) => ({
              test: `test_${id}_${salt}`,
            })),
          )
        }, TEST_TIMEOUT)
      }),
    }

    const batchFetchSpy = jest.spyOn(options, 'batchFetch')
    const testBatchLoader = new BatchLoader<string, { test: string }>(options) as BatchLoader<string, {
      test: string
    }> & { batchStatus: BatchLoaderStatus }

    expect(testBatchLoader.batchStatus).toStrictEqual('unrequested')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'unrequested',
      result: undefined,
    })

    const promiseA1 = testBatchLoader.load('a')

    void testBatchLoader.load('b')

    expect(testBatchLoader.batchStatus).toStrictEqual('scheduled')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'scheduled',
      result: undefined,
    })

    await timeout()

    expect(testBatchLoader.batchStatus).toStrictEqual('fetching')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'fetching',
      result: undefined,
    })

    expect(await promiseA1).toStrictEqual({ test: 'test_a_1' })

    expect(testBatchLoader.batchStatus).toStrictEqual('fetching')

    await Promise.resolve()

    expect(testBatchLoader.batchStatus).toStrictEqual('resolved')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'test_a_1' },
    })

    salt = '2'

    const promiseA2 = testBatchLoader.load('a')

    expect(testBatchLoader.batchStatus).toStrictEqual('resolved')

    const promiseC = testBatchLoader.load('c')

    expect(testBatchLoader.batchStatus).toStrictEqual('scheduled')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'test_a_1' },
    })

    await timeout()

    expect(testBatchLoader.batchStatus).toStrictEqual('fetching')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'test_a_1' },
    })

    expect(await Promise.all([promiseA2, promiseC])).toStrictEqual([{ test: 'test_a_1' }, { test: 'test_c_2' }])

    expect(testBatchLoader.batchStatus).toStrictEqual('resolved')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'test_a_1' },
    })

    expect(await testBatchLoader.loadMany(['a', 'b', 'c'])).toStrictEqual([
      { test: 'test_a_1' },
      { test: 'test_b_1' },
      { test: 'test_c_2' },
    ])

    expect(batchFetchSpy).toHaveBeenCalledTimes(2)
    expect(batchFetchSpy).toHaveBeenNthCalledWith(1, ['a', 'b'])
    expect(batchFetchSpy).toHaveBeenNthCalledWith(2, ['c'])
  })

  it('should work with refetchStrategy: \'refresh\'', async () => {
    let salt = '1'

    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: (ids) => new Promise((resolve) => {
        setTimeout(() => {
          resolve(
            ids.map((id) => ({
              test: `test_${id}_${salt}`,
            })),
          )
        }, TEST_TIMEOUT)
      }),
      refetchStrategy: 'refresh',
    }

    const batchFetchSpy = jest.spyOn(options, 'batchFetch')
    const testBatchLoader = new BatchLoader<string, { test: string }>(options) as BatchLoader<string, {
      test: string
    }> & { batchStatus: BatchLoaderStatus }

    expect(testBatchLoader.batchStatus).toStrictEqual('unrequested')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'unrequested',
      result: undefined,
    })

    const promiseA1 = testBatchLoader.load('a')

    void testBatchLoader.load('b')

    expect(testBatchLoader.batchStatus).toStrictEqual('scheduled')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'scheduled',
      result: undefined,
    })

    await timeout()

    expect(testBatchLoader.batchStatus).toStrictEqual('fetching')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'fetching',
      result: undefined,
    })

    expect(await promiseA1).toStrictEqual({ test: 'test_a_1' })

    await Promise.resolve()

    expect(testBatchLoader.batchStatus).toStrictEqual('resolved')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'test_a_1' },
    })

    salt = '2'

    const promiseA2 = testBatchLoader.load('a')
    const promiseC = testBatchLoader.load('c')

    expect(testBatchLoader.batchStatus).toStrictEqual('scheduled')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'scheduled',
      result: { test: 'test_a_1' },
    })

    await timeout()

    expect(testBatchLoader.batchStatus).toStrictEqual('fetching')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'fetching',
      result: { test: 'test_a_1' },
    })

    expect(await Promise.all([promiseA2, promiseC])).toStrictEqual([{ test: 'test_a_2' }, { test: 'test_c_2' }])

    expect(testBatchLoader.batchStatus).toStrictEqual('resolved')
    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'test_a_2' },
    })

    expect(batchFetchSpy).toHaveBeenCalledTimes(2)
    expect(batchFetchSpy).toHaveBeenNthCalledWith(1, ['a', 'b'])
    expect(batchFetchSpy).toHaveBeenNthCalledWith(2, ['a', 'c'])
  })

  it('should work with response with errors', async () => {
    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: (ids) => new Promise((resolve) => {
        setTimeout(() => {
          resolve(ids.map((id) => (
            id === 'a'
              ? { test: `test_${id}` }
              : id === 'b'
                ? undefined
                : new Error(`Test error for id=${JSON.stringify(id)}`)
          )))
        }, TEST_TIMEOUT)
      }),
      onError: () => {
        // noop
      },
    }

    const onErrorSpy = jest.spyOn(options, 'onError')

    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    await expect(testBatchLoader.loadMany(['a', 'b', 'c'])).rejects.toThrow('Test error for id="c"')

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'test_a' },
    })

    expect(testBatchLoader.getState('b')).toStrictEqual({
      status: 'resolved',
      result: undefined,
    })

    expect(testBatchLoader.getState('c')).toStrictEqual({
      status: 'rejected',
      result: undefined,
      error: new Error('Test error for id="c"'),
    })

    expect(onErrorSpy).toHaveBeenCalledTimes(0)
  })

  it('should apply batch error when itemsStore.batchUpdate fails on fetching patch', async () => {
    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: (ids) => new Promise((resolve) => {
        setTimeout(() => {
          resolve(ids.map((id) => ({
            test: `test_${id}`,
          })))
        }, TEST_TIMEOUT)
      }),
      onError: () => {
        // noop
      },
      itemsStore: new BatchUpdateErrorItemsStore<string, { test: string }>(1),
    }

    const batchFetchSpy = jest.spyOn(options, 'batchFetch')
    const onErrorSpy = jest.spyOn(options, 'onError')
    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    await expect(testBatchLoader.load('a')).rejects.toThrow('Test itemsStore batchUpdate error')

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'rejected',
      result: undefined,
      error: new Error('Test itemsStore batchUpdate error'),
    })

    expect(batchFetchSpy).toHaveBeenCalledTimes(0)
    expect(onErrorSpy).toHaveBeenCalledTimes(1)
    expect(onErrorSpy).toHaveBeenCalledWith(new Error('Test itemsStore batchUpdate error'))
  })

  it('should leave items scheduled when itemsStore.batchUpdate always fails', async () => {
    const options: IBatchLoaderOptions<string, { test: string }> = {
      batchFetch: (ids) => new Promise((resolve) => {
        setTimeout(() => {
          resolve(ids.map((id) => ({
            test: `test_${id}`,
          })))
        }, TEST_TIMEOUT)
      }),
      onError: () => {
        // noop
      },
      itemsStore: new BatchUpdateErrorItemsStore<string, { test: string }>(2),
    }

    const batchFetchSpy = jest.spyOn(options, 'batchFetch')
    const onErrorSpy = jest.spyOn(options, 'onError')
    const testBatchLoader = new BatchLoader<string, { test: string }>(options)

    // Both batchUpdate calls throw — the load promise never settles, assert side effects only
    void testBatchLoader.load('a')

    await timeout()

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'scheduled',
      result: undefined,
    })
    expect(batchFetchSpy).toHaveBeenCalledTimes(0)
    expect(onErrorSpy).toHaveBeenCalledTimes(0)
  })

  describe('options validation', () => {
    it('should throw when constructed without a batchFetch function', () => {
      expect(() => new BatchLoader<string, { test: string }>({
        batchFetch: undefined as never,
      })).toThrow('BatchLoader must be constructed with a batchFetch function, but got: undefined.')

      expect(() => new BatchLoader<string, { test: string }>({
        batchFetch: 42 as never,
      })).toThrow('BatchLoader must be constructed with a batchFetch function, but got: 42.')
    })

    it('should throw when constructed with invalid options', () => {
      const { batchFetch } = { batchFetch: emptyBatchFetch }

      expect(() => new BatchLoader<string, { test: string }>({ batchFetch, maxBatchSize: 0 })).toThrow(TypeError)
      expect(() => new BatchLoader<string, { test: string }>({ batchFetch, maxBatchSize: -1 })).toThrow(TypeError)
      expect(() => new BatchLoader<string, { test: string }>({ batchFetch, maxBatchSize: 1.5 })).toThrow(TypeError)
      expect(() => new BatchLoader<string, { test: string }>({ batchFetch, maxBatchSize: '2' as never })).toThrow(
        'maxBatchSize must be a positive integer, but got: 2.',
      )
      expect(() => new BatchLoader<string, { test: string }>({ batchFetch, batchScheduleFn: 1 as never })).toThrow(
        'batchScheduleFn must be a function, but got: 1.',
      )
    })

    it('should throw on load and loadMany with null or undefined ids', () => {
      const testBatchLoader = new BatchLoader<string, { test: string }>({
        batchFetch: emptyBatchFetch,
      })

      expect(() => testBatchLoader.load(null as never)).toThrow(
        'The load() function must be called with an id, but got: null.',
      )
      expect(() => testBatchLoader.load(undefined as never)).toThrow(
        'The load() function must be called with an id, but got: undefined.',
      )
      expect(() => testBatchLoader.loadMany(['a', null as never])).toThrow(
        'The loadMany() function must be called with an id, but got: null.',
      )
    })

    it('should reject the whole batch when batchFetch resolves with a non-array or a wrong-length array', async () => {
      const invalidOptions: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: () => Promise.resolve(null as never),
        onError: () => {
          // noop
        },
      }

      const invalidBatchLoader = new BatchLoader<string, { test: string }>(invalidOptions)
      const onErrorSpy = jest.spyOn(invalidOptions, 'onError')

      await expect(invalidBatchLoader.load('a')).rejects.toThrow(
        'batchFetch must resolve to an array with exactly one entry per requested id (1), but got: null.',
      )
      expect(invalidBatchLoader.getState('a').status).toStrictEqual('rejected')
      expect(onErrorSpy).toHaveBeenCalledTimes(1)

      const shortBatchLoader = new BatchLoader<string, { test: string }>({
        batchFetch: emptyBatchFetch,
      })

      await expect(shortBatchLoader.loadMany(['a', 'b'])).rejects.toThrow(
        'batchFetch must resolve to an array with exactly one entry per requested id (2), but got: an array of length 0.',
      )
      expect(shortBatchLoader.getState('b').status).toStrictEqual('rejected')
    })
  })

  describe('maxBatchSize', () => {
    it('should split the buffer into parallel chunks of maxBatchSize', async () => {
      const options: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: (ids) => Promise.resolve(ids.map((id) => ({ test: `test_${id}` }))),
        maxBatchSize: 2,
      }

      const batchFetchSpy = jest.spyOn(options, 'batchFetch')
      const testBatchLoader = new BatchLoader<string, { test: string }>(options)

      expect(await testBatchLoader.loadMany(['a', 'b', 'c', 'd', 'e'])).toStrictEqual([
        { test: 'test_a' },
        { test: 'test_b' },
        { test: 'test_c' },
        { test: 'test_d' },
        { test: 'test_e' },
      ])

      expect(batchFetchSpy).toHaveBeenCalledTimes(3)
      expect(batchFetchSpy).toHaveBeenNthCalledWith(1, ['a', 'b'])
      expect(batchFetchSpy).toHaveBeenNthCalledWith(2, ['c', 'd'])
      expect(batchFetchSpy).toHaveBeenNthCalledWith(3, ['e'])
    })

    it('should not count cached items towards maxBatchSize', async () => {
      const options: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: (ids) => Promise.resolve(ids.map((id) => ({ test: `test_${id}` }))),
        maxBatchSize: 2,
      }

      const batchFetchSpy = jest.spyOn(options, 'batchFetch')
      const testBatchLoader = new BatchLoader<string, { test: string }>(options)

      expect(await testBatchLoader.load('a')).toStrictEqual({ test: 'test_a' })
      expect(await testBatchLoader.load('a')).toStrictEqual({ test: 'test_a' }) // from cache

      expect(await testBatchLoader.loadMany(['a', 'b', 'c', 'd'])).toStrictEqual([
        { test: 'test_a' },
        { test: 'test_b' },
        { test: 'test_c' },
        { test: 'test_d' },
      ])

      expect(batchFetchSpy).toHaveBeenCalledTimes(3)
      expect(batchFetchSpy).toHaveBeenNthCalledWith(2, ['b', 'c'])
      expect(batchFetchSpy).toHaveBeenNthCalledWith(3, ['d'])
    })

    it('should keep per-chunk results when one chunk fails', async () => {
      const options: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: (ids) => (ids.includes('b')
          ? Promise.reject(new Error('Test chunk error'))
          : Promise.resolve(ids.map((id) => ({ test: `test_${id}` })))),
        maxBatchSize: 1,
        onError: () => {
          // noop
        },
      }

      const onErrorSpy = jest.spyOn(options, 'onError')
      const testBatchLoader = new BatchLoader<string, { test: string }>(options)

      const promiseA = testBatchLoader.load('a')
      const promiseB = testBatchLoader.load('b')

      await expect(promiseB).rejects.toThrow('Test chunk error')
      expect(await promiseA).toStrictEqual({ test: 'test_a' })

      expect(testBatchLoader.getState('a').status).toStrictEqual('resolved')
      expect(testBatchLoader.getState('b').status).toStrictEqual('rejected')
      expect(onErrorSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('flush', () => {
    it('should execute a scheduled batch immediately and ignore the late scheduler callback', async () => {
      const options: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: (ids) => new Promise((resolve) => {
          setTimeout(() => {
            resolve(ids.map((id) => ({ test: `test_${id}` })))
          }, TEST_TIMEOUT)
        }),
        batchScheduleFn: (callback) => {
          setTimeout(callback, 30)
        },
      }

      const batchFetchSpy = jest.spyOn(options, 'batchFetch')
      const testBatchLoader = new BatchLoader<string, { test: string }>(options)

      const promiseA = testBatchLoader.load('a')
      const promiseB = testBatchLoader.load('b')

      expect(batchFetchSpy).toHaveBeenCalledTimes(0)

      testBatchLoader.flush()

      expect(batchFetchSpy).toHaveBeenCalledTimes(1)
      expect(batchFetchSpy).toHaveBeenNthCalledWith(1, ['a', 'b'])

      expect(await promiseA).toStrictEqual({ test: 'test_a' })
      expect(await promiseB).toStrictEqual({ test: 'test_b' })

      // The scheduler callback fires later and must be ignored
      await timeout(40)

      expect(batchFetchSpy).toHaveBeenCalledTimes(1)
    })

    it('should do nothing when there is no scheduled batch', async () => {
      const options: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: (ids) => new Promise((resolve) => {
          setTimeout(() => {
            resolve(ids.map((id) => ({ test: `test_${id}` })))
          }, 5)
        }),
      }

      const batchFetchSpy = jest.spyOn(options, 'batchFetch')
      const testBatchLoader = new BatchLoader<string, { test: string }>(options)

      testBatchLoader.flush()

      const promiseA = testBatchLoader.load('a')

      await timeout()

      testBatchLoader.flush()

      expect(await promiseA).toStrictEqual({ test: 'test_a' })

      testBatchLoader.flush()

      expect(batchFetchSpy).toHaveBeenCalledTimes(1)
    })

    it('should support manual dispatch via a captured scheduler callback', async () => {
      let scheduledCallback: (() => void) | undefined

      const options: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: (ids) => Promise.resolve(ids.map((id) => ({ test: `test_${id}` }))),
        batchScheduleFn: (callback) => {
          scheduledCallback = callback
        },
      }

      const batchFetchSpy = jest.spyOn(options, 'batchFetch')
      const testBatchLoader = new BatchLoader<string, { test: string }>(options)

      const promiseA = testBatchLoader.load('a')

      await timeout(2)

      expect(batchFetchSpy).toHaveBeenCalledTimes(0)
      expect(testBatchLoader.getStatus('a')).toStrictEqual('scheduled')

      scheduledCallback?.()

      expect(await promiseA).toStrictEqual({ test: 'test_a' })
      expect(batchFetchSpy).toHaveBeenCalledTimes(1)
    })

    it('should tolerate a scheduler that invokes the callback twice', async () => {
      const options: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: (ids) => Promise.resolve(ids.map((id) => ({ test: `test_${id}` }))),
        batchScheduleFn: (callback) => {
          callback()
          callback()
        },
      }

      const batchFetchSpy = jest.spyOn(options, 'batchFetch')
      const testBatchLoader = new BatchLoader<string, { test: string }>(options)

      expect(await testBatchLoader.load('a')).toStrictEqual({ test: 'test_a' })
      expect(batchFetchSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('clear and clearAll', () => {
    it('should re-fetch a cleared resolved item', async () => {
      const options: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: (ids) => new Promise((resolve) => {
          setTimeout(() => {
            resolve(ids.map((id) => ({ test: `test_${id}` })))
          }, TEST_TIMEOUT)
        }),
      }

      const batchFetchSpy = jest.spyOn(options, 'batchFetch')
      const testBatchLoader = new BatchLoader<string, { test: string }>(options)

      expect(await testBatchLoader.load('a')).toStrictEqual({ test: 'test_a' })

      testBatchLoader.clear('a')

      expect(testBatchLoader.getState('a')).toStrictEqual({
        status: 'unrequested',
        result: undefined,
      })
      expect(testBatchLoader.getResult('a')).toBeUndefined()

      expect(await testBatchLoader.load('a')).toStrictEqual({ test: 'test_a' })

      expect(batchFetchSpy).toHaveBeenCalledTimes(2)
      expect(batchFetchSpy).toHaveBeenNthCalledWith(2, ['a'])
    })

    it('should drop a cleared scheduled item from the pending batch', async () => {
      const options: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: (ids) => new Promise((resolve) => {
          setTimeout(() => {
            resolve(ids.map((id) => ({ test: `test_${id}` })))
          }, TEST_TIMEOUT)
        }),
        batchScheduleFn: (callback) => {
          setTimeout(callback, 10)
        },
      }

      const batchFetchSpy = jest.spyOn(options, 'batchFetch')
      const testBatchLoader = new BatchLoader<string, { test: string }>(options)

      // The cleared item's promise never settles — do not await it
      void testBatchLoader.load('a')
      const promiseB = testBatchLoader.load('b')

      testBatchLoader.clear('a')

      expect(testBatchLoader.getState('a')).toStrictEqual({
        status: 'unrequested',
        result: undefined,
      })

      expect(await promiseB).toStrictEqual({ test: 'test_b' })

      expect(batchFetchSpy).toHaveBeenCalledTimes(1)
      expect(batchFetchSpy).toHaveBeenNthCalledWith(1, ['b'])
    })

    it('should cancel a scheduled batch when its last item is cleared', async () => {
      const options: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: (ids) => Promise.resolve(ids.map((id) => ({ test: `test_${id}` }))),
        batchScheduleFn: (callback) => {
          setTimeout(callback, 10)
        },
      }

      const batchFetchSpy = jest.spyOn(options, 'batchFetch')
      const testBatchLoader = new BatchLoader<string, { test: string }>(options)

      void testBatchLoader.load('a')

      testBatchLoader.clear('a')

      await timeout(15)

      expect(batchFetchSpy).toHaveBeenCalledTimes(0)
      expect(testBatchLoader.getState('a').status).toStrictEqual('unrequested')
    })

    it('should tolerate clearing unknown ids', () => {
      const testBatchLoader = new BatchLoader<string, { test: string }>({
        batchFetch: (ids) => Promise.resolve(ids.map((id) => ({ test: `test_${id}` }))),
      })

      testBatchLoader.clear('zzz')

      expect(testBatchLoader.getState('zzz')).toStrictEqual({
        status: 'unrequested',
        result: undefined,
      })
    })

    it('should clear all items while an in-flight batch applies to nothing', async () => {
      const options: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: (ids) => new Promise((resolve) => {
          setTimeout(() => {
            resolve(ids.map((id) => ({ test: `test_${id}` })))
          }, 5)
        }),
      }

      const batchFetchSpy = jest.spyOn(options, 'batchFetch')
      const testBatchLoader = new BatchLoader<string, { test: string }>(options)

      // The cleared item's promise never settles — do not await it
      void testBatchLoader.load('a')

      await timeout()

      testBatchLoader.clearAll()

      expect(testBatchLoader.getState('a')).toStrictEqual({
        status: 'unrequested',
        result: undefined,
      })

      await timeout(10)

      expect(batchFetchSpy).toHaveBeenCalledTimes(1)
      expect(testBatchLoader.getState('a')).toStrictEqual({
        status: 'unrequested',
        result: undefined,
      })
    })

    it('should throw when the items store does not implement delete or clear', () => {
      const minimalItemsStore = {
        get: () => undefined,
        add: () => {
          // noop
        },
        update: () => {
          throw new Error('Test store update error')
        },
        batchUpdate: () => [],
      } as IBatchLoaderItemsStore<string, { test: string }>

      const testBatchLoader = new BatchLoader<string, { test: string }>({
        batchFetch: (ids) => Promise.resolve(ids.map((id) => ({ test: `test_${id}` }))),
        itemsStore: minimalItemsStore,
      })

      expect(() => {
        testBatchLoader.clear('a')
      }).toThrow(
        'itemsStore does not implement delete() — clear(id) is not supported.',
      )
      expect(() => {
        testBatchLoader.clearAll()
      }).toThrow(
        'itemsStore does not implement clear() — clearAll() is not supported.',
      )
    })
  })

  describe('batching edge cases', () => {
    it('should batch loads made within promise microtasks', async () => {
      const options: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: (ids) => new Promise((resolve) => {
          setTimeout(() => {
            resolve(ids.map((id) => ({ test: `test_${id}` })))
          }, TEST_TIMEOUT)
        }),
      }

      const batchFetchSpy = jest.spyOn(options, 'batchFetch')
      const testBatchLoader = new BatchLoader<string, { test: string }>(options)

      const promiseA = testBatchLoader.load('a')

      queueMicrotask(() => {
        void testBatchLoader.load('b')
      })

      expect(await promiseA).toStrictEqual({ test: 'test_a' })
      expect(batchFetchSpy).toHaveBeenCalledTimes(1)
      expect(batchFetchSpy).toHaveBeenNthCalledWith(1, ['a', 'b'])
    })

    it('should dispatch separate batches with a synchronous scheduler', async () => {
      const options: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: (ids) => Promise.resolve(ids.map((id) => ({ test: `test_${id}` }))),
        batchScheduleFn: (callback) => {
          callback()
        },
      }

      const batchFetchSpy = jest.spyOn(options, 'batchFetch')
      const testBatchLoader = new BatchLoader<string, { test: string }>(options)

      const promiseA = testBatchLoader.load('a')
      const promiseB = testBatchLoader.load('b')

      expect(await promiseA).toStrictEqual({ test: 'test_a' })
      expect(await promiseB).toStrictEqual({ test: 'test_b' })

      expect(batchFetchSpy).toHaveBeenCalledTimes(2)
      expect(batchFetchSpy).toHaveBeenNthCalledWith(1, ['a'])
      expect(batchFetchSpy).toHaveBeenNthCalledWith(2, ['b'])
    })

    it('should deduplicate loads spread over time within one window', async () => {
      const options: IBatchLoaderOptions<number, { test: string }> = {
        batchFetch: (ids) => new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              ids.map((id) => ({
                test: `test_${String(id)}`,
              })),
            )
          }, TEST_TIMEOUT)
        }),
        batchScheduleFn: (callback) => {
          setTimeout(callback, 15)
        },
      }

      const batchFetchSpy = jest.spyOn(options, 'batchFetch')
      const testBatchLoader = new BatchLoader<number, { test: string }>(options)

      const promiseOne = testBatchLoader.load(1)

      await timeout(3)

      const promiseOneAgain = testBatchLoader.load(1)

      await timeout(3)

      const promiseTwo = testBatchLoader.load(2)

      expect(promiseOneAgain === promiseOne).toStrictEqual(true)

      expect(await promiseOne).toStrictEqual({ test: 'test_1' })
      expect(await promiseTwo).toStrictEqual({ test: 'test_2' })

      expect(batchFetchSpy).toHaveBeenCalledTimes(1)
      expect(batchFetchSpy).toHaveBeenNthCalledWith(1, [1, 2])
    })

    it('should keep batching when used from another loader', async () => {
      const innerOptions: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: (ids) => Promise.resolve(ids.map((id) => ({ test: `test_${id}` }))),
      }

      const innerBatchFetchSpy = jest.spyOn(innerOptions, 'batchFetch')
      const innerBatchLoader = new BatchLoader<string, { test: string }>(innerOptions)

      const outerOptions: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: async (ids) => await Promise.all(ids.map((id) => innerBatchLoader.load(id))),
      }

      const outerBatchFetchSpy = jest.spyOn(outerOptions, 'batchFetch')
      const outerBatchLoader = new BatchLoader<string, { test: string }>(outerOptions)

      const promiseA = outerBatchLoader.load('a')
      const promiseB = outerBatchLoader.load('b')

      expect(await promiseA).toStrictEqual({ test: 'test_a' })
      expect(await promiseB).toStrictEqual({ test: 'test_b' })

      expect(outerBatchFetchSpy).toHaveBeenCalledTimes(1)
      expect(outerBatchFetchSpy).toHaveBeenNthCalledWith(1, ['a', 'b'])
      expect(innerBatchFetchSpy).toHaveBeenCalledTimes(1)
      expect(innerBatchFetchSpy).toHaveBeenNthCalledWith(1, ['a', 'b'])
    })

    it('should apply batch error when itemsStore.batchUpdate fails on results patch', async () => {
      // Fails only when the resolved-results patch is applied, not on the fetching one
      class ResultsUpdateErrorItemsStore<ID extends number | string, R>
        extends DefaultBatchLoaderItemsStore<ID, R> {
        batchUpdate(entries: [ID, IBatchLoaderItemPatch<R>][]): IBatchLoaderItem<R>[] {
          if (entries.some(([, patch]) => patch.status === 'resolved')) {
            throw new Error('Test itemsStore results batchUpdate error')
          }

          return super.batchUpdate(entries)
        }
      }

      const options: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: () => Promise.resolve([{ test: 'test_a' }]),
        onError: () => {
          // noop
        },
        itemsStore: new ResultsUpdateErrorItemsStore<string, { test: string }>(),
      }

      const onErrorSpy = jest.spyOn(options, 'onError')
      const testBatchLoader = new BatchLoader<string, { test: string }>(options)

      await expect(testBatchLoader.load('a')).rejects.toThrow('Test itemsStore results batchUpdate error')

      expect(testBatchLoader.getState('a')).toStrictEqual({
        status: 'rejected',
        result: undefined,
        error: new Error('Test itemsStore results batchUpdate error'),
      })
      expect(onErrorSpy).toHaveBeenCalledTimes(1)
      expect(onErrorSpy).toHaveBeenCalledWith(new Error('Test itemsStore results batchUpdate error'))
    })

    it('should leave items fetching when itemsStore.batchUpdate fails on both results and error patches', async () => {
      // Fails on every settling patch (resolved/rejected), succeeds only on the fetching one
      class SettlingUpdateErrorItemsStore<ID extends number | string, R>
        extends DefaultBatchLoaderItemsStore<ID, R> {
        batchUpdate(entries: [ID, IBatchLoaderItemPatch<R>][]): IBatchLoaderItem<R>[] {
          if (entries.some(([, patch]) => patch.status !== 'fetching')) {
            throw new Error('Test itemsStore settling batchUpdate error')
          }

          return super.batchUpdate(entries)
        }
      }

      const options: IBatchLoaderOptions<string, { test: string }> = {
        batchFetch: () => Promise.resolve([{ test: 'test_a' }]),
        onError: () => {
          // noop
        },
        itemsStore: new SettlingUpdateErrorItemsStore<string, { test: string }>(),
      }

      const batchFetchSpy = jest.spyOn(options, 'batchFetch')
      const onErrorSpy = jest.spyOn(options, 'onError')
      const testBatchLoader = new BatchLoader<string, { test: string }>(options)

      // Both settling batchUpdate calls throw — the load promise never settles
      void testBatchLoader.load('a')

      await timeout()

      expect(testBatchLoader.getState('a')).toStrictEqual({
        status: 'fetching',
        result: undefined,
      })
      expect(batchFetchSpy).toHaveBeenCalledTimes(1)
      expect(onErrorSpy).toHaveBeenCalledTimes(0)
    })
  })
})
