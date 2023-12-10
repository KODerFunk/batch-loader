export interface PromiseWithResolvers<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

interface PromiseWithMethodWithResolvers {
  withResolvers: <T>() => PromiseWithResolvers<T>
}

export default function promiseWithResolvers<T>(): PromiseWithResolvers<T> {
  return 'withResolvers' in Promise

    /* c8 ignore next */
    ? (Promise as PromiseWithMethodWithResolvers).withResolvers()
    : createPromiseWithResolvers()
}

function createPromiseWithResolvers<T>(): PromiseWithResolvers<T> {
  let resolve: (value: T | PromiseLike<T>) => void
  let reject: (reason?: unknown) => void

  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })

  return {
    promise,
    // @ts-expect-error resolve assigned
    resolve,
    // @ts-expect-error reject assigned
    reject,
  }
}
