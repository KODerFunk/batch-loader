import type {
  IBatchLoaderItem,
  IBatchLoaderItemPatch,
  IBatchLoaderItemsStore,
} from './BatchLoader.types'

export default class DefaultBatchLoaderItemsStore<ID extends number | string, R>
implements IBatchLoaderItemsStore<ID, R> {
  private readonly itemsMap = new Map<ID, IBatchLoaderItem<R>>()

  get(id: ID): IBatchLoaderItem<R> | undefined {
    return this.itemsMap.get(id)
  }

  add(id: ID, item: IBatchLoaderItem<R>): void {
    this.itemsMap.set(id, item)
  }

  update(id: ID, patch: IBatchLoaderItemPatch<R>): IBatchLoaderItem<R> {
    const item = this.itemsMap.get(id)

    if (!item) {
      throw new Error(`Item with id: ${JSON.stringify(id)} not found`)
    }

    return Object.assign(item, patch)
  }

  batchUpdate(entries: [ID, IBatchLoaderItemPatch<R>][]): IBatchLoaderItem<R>[] {
    const notFoundIds: ID[] = []

    const items = entries.map(([id, patch]) => {
      try {
        return this.update(id, patch)
      } catch {
        notFoundIds.push(id)
        return undefined
      }
    })

    if (notFoundIds.length > 0) {
      throw new Error(`Items with ids: ${JSON.stringify(notFoundIds)} not found`)
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    return items as IBatchLoaderItem<R>[]
  }
}
