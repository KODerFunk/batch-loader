/* eslint-disable max-lines-per-function, max-statements */
import DefaultBatchLoaderItemsStore from './DefaultBatchLoaderItemsStore'
import promiseWithResolvers from './promiseWithResolvers'

describe('DefaultBatchLoaderItemsStore', () => {
  it('should work', () => {
    const itemsStore = new DefaultBatchLoaderItemsStore<string, { test: string }>()

    expect(itemsStore.get('a')).toBeUndefined()

    const item = {
      deferred: promiseWithResolvers<{ test: string }>(),
      status: 'scheduled',
    } as const

    itemsStore.add('a', item)
    itemsStore.add('b', {
      deferred: promiseWithResolvers<{ test: string }>(),
      status: 'scheduled',
    })
    itemsStore.add('d', {
      deferred: promiseWithResolvers<{ test: string }>(),
      status: 'scheduled',
    })

    expect(itemsStore.get('a') === item).toStrictEqual(true)

    const error = new Error('Test reject `a`')

    const updatedItem = itemsStore.update('a', {
      status: 'rejected',
      error,
    })

    // DefaultBatchLoaderItemsStore use mutable update
    expect(updatedItem === item).toStrictEqual(true)

    expect(updatedItem).toStrictEqual({
      deferred: item.deferred,
      status: 'rejected',
      error,
    })

    const updatedItems = itemsStore.batchUpdate([
      ['b', { status: 'fetching' }],
      ['d', { status: 'fetching' }],
      [
        'a',
        {
          status: 'resolved',
          result: { test: 'test_a' },
          error: undefined,
        },
      ],
    ])

    expect(updatedItems.map(({ status }) => status)).toStrictEqual([
      'fetching',
      'fetching',
      'resolved',
    ])
    expect(updatedItems[0] === itemsStore.get('b')).toStrictEqual(true)
    expect(updatedItems[1] === itemsStore.get('d')).toStrictEqual(true)
    expect(updatedItems[2] === itemsStore.get('a')).toStrictEqual(true)
    expect(updatedItems[2]).toStrictEqual({
      deferred: item.deferred,
      status: 'resolved',
      result: { test: 'test_a' },
      error: undefined,
    })
  })

  it('should throw error when updating not existing item', () => {
    const itemsStore = new DefaultBatchLoaderItemsStore<string, { test: string }>()

    const item = {
      deferred: promiseWithResolvers<{ test: string }>(),
      status: 'scheduled',
    } as const

    itemsStore.add('a', item)
    itemsStore.add('b', {
      deferred: promiseWithResolvers<{ test: string }>(),
      status: 'scheduled',
    })
    itemsStore.add('d', {
      deferred: promiseWithResolvers<{ test: string }>(),
      status: 'scheduled',
    })

    // Updating not existing item throws error
    expect(() => itemsStore.update('c', { status: 'fetching' })).toThrow(
      'Item with id: "c" not found',
    )

    // Updating not existing item throws error, but set all existing items
    expect(() => itemsStore.batchUpdate([
      ['b', { status: 'fetching' }],
      ['c', { status: 'fetching' }],
      ['d', { status: 'fetching' }],
    ])).toThrow('Items with ids: ["c"] not found')

    expect(itemsStore.get('b')?.status).toStrictEqual('fetching')
    expect(itemsStore.get('d')?.status).toStrictEqual('fetching')
  })

  it('should rethrow update errors other than ItemNotFoundExceptionError', () => {
    const itemsStore = new DefaultBatchLoaderItemsStore<string, { test: string }>()

    // Object.assign on a frozen item throws TypeError regardless of strict mode
    itemsStore.add('a', Object.freeze({
      deferred: promiseWithResolvers<{ test: string }>(),
      status: 'scheduled',
    } as const))

    expect(() => itemsStore.batchUpdate([['a', { status: 'fetching' }]])).toThrow(TypeError)
  })

  it('should delete and clear items', () => {
    const itemsStore = new DefaultBatchLoaderItemsStore<string, { test: string }>()

    itemsStore.add('a', {
      deferred: promiseWithResolvers<{ test: string }>(),
      status: 'scheduled',
    })
    itemsStore.add('b', {
      deferred: promiseWithResolvers<{ test: string }>(),
      status: 'scheduled',
    })

    itemsStore.delete('a')

    expect(itemsStore.get('a')).toBeUndefined()
    expect(itemsStore.get('b')).toBeDefined()

    itemsStore.clear()

    expect(itemsStore.get('b')).toBeUndefined()
  })
})
