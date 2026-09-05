/* eslint-disable max-lines-per-function, max-statements, @typescript-eslint/no-magic-numbers */
import type { IBatchLoaderItem } from './BatchLoader.types'
import ImmutableBatchLoaderItemsStore from './ImmutableBatchLoaderItemsStore'
import promiseWithResolvers from './promiseWithResolvers'

describe('ImmutableBatchLoaderItemsStore', () => {
  it('should work', () => {
    let state: Record<string, IBatchLoaderItem<{ test: string }>> = {}

    const itemsStore = new ImmutableBatchLoaderItemsStore<string, { test: string }>(
      () => state,
      (newState) => {
        state = newState
      },
    )

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

    // ImmutableBatchLoaderItemsStore use immutable update
    expect(updatedItem === item).toStrictEqual(false)

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
    let state: Record<string, IBatchLoaderItem<{ test: string }>> = {}

    const itemsStore = new ImmutableBatchLoaderItemsStore<string, { test: string }>(
      () => state,
      (newState) => {
        state = newState
      },
    )

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
    expect(itemsStore.get('e')).toBeUndefined()
  })

  it('should delete and clear items', () => {
    let state: Record<number, IBatchLoaderItem<{ test: string }>> = {}

    const itemsStore = new ImmutableBatchLoaderItemsStore<number, { test: string }>(
      () => state,
      (newState) => {
        state = newState
      },
    )

    itemsStore.add(1, {
      deferred: promiseWithResolvers<{ test: string }>(),
      status: 'scheduled',
    })
    itemsStore.add(2, {
      deferred: promiseWithResolvers<{ test: string }>(),
      status: 'scheduled',
    })

    itemsStore.delete(1)

    expect(itemsStore.get(1)).toBeUndefined()
    expect(itemsStore.get(2)).toBeDefined()
    expect(Object.keys(state)).toStrictEqual(['2'])

    itemsStore.clear()

    expect(itemsStore.get(2)).toBeUndefined()
    expect(state).toStrictEqual({})
  })
})
