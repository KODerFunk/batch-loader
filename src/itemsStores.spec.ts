/* eslint-disable max-lines-per-function, max-statements */
import DefaultBatchLoaderItemsStore from './DefaultBatchLoaderItemsStore'
import ImmutableBatchLoaderItemsStore from './ImmutableBatchLoaderItemsStore'
import type { IBatchLoaderItem } from './BatchLoader.types'
import promiseWithResolvers from './promiseWithResolvers'

describe('items stores', () => {
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
      expect(() => itemsStore.update('c', { status: 'fetching' })).toThrowError(
        'Item with id: "c" not found',
      )

      // Updating not existing item throws error, but set all existing items
      expect(() => itemsStore.batchUpdate([
        ['b', { status: 'fetching' }],
        ['c', { status: 'fetching' }],
        ['d', { status: 'fetching' }],
      ])).toThrowError('Items with ids: ["c"] not found')

      expect(itemsStore.get('b')?.status).toStrictEqual('fetching')
      expect(itemsStore.get('d')?.status).toStrictEqual('fetching')
    })
  })

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
      expect(() => itemsStore.update('c', { status: 'fetching' })).toThrowError(
        'Item with id: "c" not found',
      )

      // Updating not existing item throws error, but set all existing items
      expect(() => itemsStore.batchUpdate([
        ['b', { status: 'fetching' }],
        ['c', { status: 'fetching' }],
        ['d', { status: 'fetching' }],
      ])).toThrowError('Items with ids: ["c"] not found')

      expect(itemsStore.get('b').status).toStrictEqual('fetching')
      expect(itemsStore.get('d').status).toStrictEqual('fetching')
    })
  })
})
