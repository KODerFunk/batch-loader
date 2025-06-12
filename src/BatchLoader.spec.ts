/* eslint-disable max-lines, max-lines-per-function, max-statements, @typescript-eslint/no-magic-numbers */
import type { BatchLoaderStatus, IBatchLoaderItem, IBatchLoaderOptions } from './BatchLoader.types'
import BatchLoader from './BatchLoader'
import ImmutableBatchLoaderItemsStore from './ImmutableBatchLoaderItemsStore'

const TEST_TIMEOUT = 1

function timeout(delay = 0): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delay)
  })
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

    expect(await promiseA1).toStrictEqual({ test: 'test_a_1' })

    expect(testBatchLoader.getState('a')).toStrictEqual({
      status: 'resolved',
      result: { test: 'test_a_1' },
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
    const testBatchLoader = new BatchLoader<string, { test: string }>(options) as BatchLoader<string, { test: string }> & { batchStatus: BatchLoaderStatus }

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
    const testBatchLoader = new BatchLoader<string, { test: string }>(options) as BatchLoader<string, { test: string }> & { batchStatus: BatchLoaderStatus }

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
})
