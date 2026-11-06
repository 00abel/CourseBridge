export function createRequestPacer(intervalMs = 350) {
  let nextStart = 0
  let queue = Promise.resolve()
  return function pace(operation) {
    const slot = queue.then(async () => {
      const delay = Math.max(0, nextStart - Date.now())
      if (delay) await new Promise(resolve => setTimeout(resolve, delay))
      nextStart = Date.now() + intervalMs
    })
    queue = slot.catch(() => {})
    return slot.then(operation)
  }
}

// only retry when notion says we hit the request limit. a request that timed out
// might have already created the page, so retrying it could make a duplicate
export function createNotionFetch({
  pace = createRequestPacer(), fetch = (...args) => globalThis.fetch(...args),
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  return async (...args) => {
    const signal = AbortSignal.timeout(45000)
    for (let attempt = 0; ; attempt++) {
      const response = await pace(() => {
        // a queued request must not write after its caller has timed out
        signal.throwIfAborted()
        return fetch(args[0], { ...args[1], signal })
      })
      if (response.status !== 429 || attempt === 2) return response
      const retryAfter = Number(response.headers.get('retry-after') || 1)
      // keep retries within the request timeout. if the wait is too long,
      // mark the assignment as failed so it can be synced again later
      if (!Number.isFinite(retryAfter) || retryAfter < 0 || retryAfter > 10) return response
      await response.body?.cancel()
      await wait(Math.max(350, retryAfter * 1000))
    }
  }
}
