interface PromiseWithResolvers<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

interface PromiseConstructor {
  withResolvers<T>(): PromiseWithResolvers<T>
}

declare module 'promise.withresolvers' {

  type WithResolvers = {
    (): void
    shim: () => void
  }

  declare const withResolvers: WithResolvers

  export default withResolvers
}
