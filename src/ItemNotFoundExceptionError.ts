export default class ItemNotFoundExceptionError extends Error {
  constructor(id: unknown) {
    super(`Item with id: ${JSON.stringify(id)} not found`)
    this.name = 'ItemNotFoundExceptionError'
  }
}
