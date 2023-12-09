import type {
  IBatchLoaderItem,
  IBatchLoaderItemPatch,
  IBatchLoaderItemsStore,
} from './BatchLoader.types'

type ImmutableBatchLoaderItemsStoreState<ID extends number | string, R> = Record<
  ID,
  IBatchLoaderItem<R>
>

export default class ImmutableBatchLoaderItemsStore<ID extends number | string, R>
implements IBatchLoaderItemsStore<ID, R> {
  constructor(
    private readonly getState: () => ImmutableBatchLoaderItemsStoreState<ID, R>,
    private readonly setState: (state: ImmutableBatchLoaderItemsStoreState<ID, R>) => void
  ) {}

  get(id: ID): IBatchLoaderItem<R> {
    return this.getState()[id]
  }

  add(id: ID, item: IBatchLoaderItem<R>): void {
    this.setState({
      ...this.getState(),
      [id]: item,
    })
  }

  update(id: ID, patch: IBatchLoaderItemPatch<R>): IBatchLoaderItem<R> {
    const state = this.getState()
    const item: IBatchLoaderItem<R> | undefined = state[id]

    if (!item) {
      throw new Error(`Item with id: ${JSON.stringify(id)} not found`)
    }

    const updatedItem: IBatchLoaderItem<R> = {
      ...item,
      ...patch,
    }

    this.setState({
      ...state,
      [id]: updatedItem,
    })

    return updatedItem
  }

  batchUpdate(entries: [ID, IBatchLoaderItemPatch<R>][]): IBatchLoaderItem<R>[] {
    const notFoundIds: ID[] = []
    const state = this.getState()

    const patchedEntries = entries
      .map(([id, patch]) => {
        const item: IBatchLoaderItem<R> | undefined = state[id]

        if (!item) {
          notFoundIds.push(id)
          return undefined
        }

        return [
          id,
          {
            ...item,
            ...patch,
          },
        ] as const
      })
      .filter(Boolean) as [ID, IBatchLoaderItem<R>][]

    this.setState({
      ...state,
      ...Object.fromEntries(patchedEntries),
    })

    if (notFoundIds.length > 0) {
      throw new Error(`Items with ids: ${JSON.stringify(notFoundIds)} not found`)
    }

    return patchedEntries.map(([_id, item]) => item)
  }
}
