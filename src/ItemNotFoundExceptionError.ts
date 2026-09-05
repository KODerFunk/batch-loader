export default class ItemNotFoundExceptionError extends Error {
  constructor(id: unknown, options?: ErrorOptions) {
    super(`Item with id: ${JSON.stringify(id)} not found`, options)
    this.name = 'ItemNotFoundExceptionError'
  }
}
