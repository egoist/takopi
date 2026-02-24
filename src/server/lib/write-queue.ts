export function createWriteQueue() {
  let queue: Promise<void> = Promise.resolve()

  return async function withWriteQueue<T>(operation: () => Promise<T>): Promise<T> {
    const resultPromise = queue.then(operation, operation)
    queue = resultPromise.then(
      () => undefined,
      () => undefined
    )
    return resultPromise
  }
}
