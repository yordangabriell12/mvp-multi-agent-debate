// A one-at-a-time gate for an async section.
//
// Why this exists rather than a plain boolean: the search planning stage has to happen one
// agent at a time, because each planner has to be told what the previous ones already
// searched. Written inline in a hook this is a promise chain with its own queue, easy to get
// subtly wrong (a rejection that never releases, a waiter that is never resumed), and it
// cannot be tested without a browser. Here it is a small object with a test.

export interface Lock {
  /** Resolves with the release function once it is this caller's turn. */
  acquire: () => Promise<() => void>
}

/**
 * Creates a lock whose waiters are served in the order they arrived.
 *
 * First-come-first-served matters here and is why a queue is kept rather than a single
 * resolve: the agents line up in a predictable order, so the trace reads in the same order
 * the agents answer rather than in whichever order promises happened to settle.
 */
export function createLock(): Lock {
  let held = false
  const waiting: (() => void)[] = []

  const acquire = (): Promise<() => void> =>
    new Promise((resolve) => {
      const grant = () => {
        held = true
        let released = false
        resolve(() => {
          // Guarded so a double release cannot hand the lock to two callers at once,
          // which would put two planners in the critical section together.
          if (released) return
          released = true
          const next = waiting.shift()
          if (next) next()
          else held = false
        })
      }

      if (held) waiting.push(grant)
      else grant()
    })

  return { acquire }
}
