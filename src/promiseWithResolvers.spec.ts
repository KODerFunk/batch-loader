import promiseWithResolvers from './promiseWithResolvers'
import type { PromiseWithResolvers } from './promiseWithResolvers'

const withResolversDescriptor = Object.getOwnPropertyDescriptor(Promise, 'withResolvers')

// On Node >= 22 restores the real method, on older runtimes removes the stub —
// either way the global state returns to what it was before the test.
function restoreWithResolvers(): void {
  if (withResolversDescriptor) {
    Object.defineProperty(Promise, 'withResolvers', withResolversDescriptor)
  } else {
    Reflect.deleteProperty(Promise, 'withResolvers')
  }
}

describe('promiseWithResolvers', () => {
  afterEach(restoreWithResolvers)

  it('should delegate to Promise.withResolvers when it is available', () => {
    // Node < 22 lacks the method, so a stub stands in for it — the branch under
    // test is the delegation itself, not the native implementation.
    const native: PromiseWithResolvers<string> = {
      promise: Promise.resolve('native'),
      resolve: () => undefined,
      reject: () => undefined,
    }

    Object.defineProperty(Promise, 'withResolvers', {
      value: () => native,
      configurable: true,
      writable: true,
    })

    // Identity proves the native branch ran — the fallback builds its own object
    expect(promiseWithResolvers<string>()).toBe(native)
  })

  // Fallback for environments without Promise.withResolvers (Node < 22)
  describe('fallback', () => {
    beforeEach(() => {
      Reflect.deleteProperty(Promise, 'withResolvers')
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
