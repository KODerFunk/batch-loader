import promiseWithResolvers from './promiseWithResolvers'

const withResolversDescriptor = Object.getOwnPropertyDescriptor(Promise, 'withResolvers')

describe('promiseWithResolvers', () => {
  it('should use native Promise.withResolvers when available', async () => {
    const { promise, resolve } = promiseWithResolvers<string>()

    expect(promise).toBeInstanceOf(Promise)

    resolve('test')

    await expect(promise).resolves.toBe('test')
  })

  // Fallback for environments without Promise.withResolvers (Node < 22)
  describe('fallback', () => {
    beforeEach(() => {
      Reflect.deleteProperty(Promise, 'withResolvers')
    })

    afterEach(() => {
      if (withResolversDescriptor) {
        Object.defineProperty(Promise, 'withResolvers', withResolversDescriptor)
      }
    })

    it('should resolve and reject via fallback implementation', async () => {
      const { promise, resolve } = promiseWithResolvers<string>()

      expect(promise).toBeInstanceOf(Promise)

      resolve('test')

      await expect(promise).resolves.toBe('test')

      const error = new Error('Test error')
      const rejected = promiseWithResolvers<string>()

      rejected.reject(error)

      await expect(rejected.promise).rejects.toBe(error)
    })
  })
})
