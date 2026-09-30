// Tests for the one-at-a-time gate.
//
// The property that matters: while one holder is inside, nobody else is. A lock that lets
// two callers in defeats the whole point of serialising the search planning, and the bug
// would be invisible in the app because the symptom is only that two agents pick the same
// keywords.

import { describe, it, expect } from 'vitest'
import { createLock } from '@/lib/lock'

/** Lets pending microtasks settle. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createLock', () => {
  it('grants immediately when nobody holds it', async () => {
    const lock = createLock()
    const release = await lock.acquire()
    expect(typeof release).toBe('function')
  })

  it('keeps a second caller out until the first releases', async () => {
    const lock = createLock()
    const order: string[] = []

    const first = await lock.acquire()
    order.push('first in')

    let secondIn = false
    const secondPromise = lock.acquire().then((release) => {
      secondIn = true
      order.push('second in')
      return release
    })

    await tick()
    expect(secondIn).toBe(false)

    first()
    const second = await secondPromise
    expect(secondIn).toBe(true)
    expect(order).toEqual(['first in', 'second in'])
    second()
  })

  it('serves waiters in the order they arrived', async () => {
    const lock = createLock()
    const order: number[] = []

    const first = await lock.acquire()
    const others = [1, 2, 3].map((n) =>
      lock.acquire().then((release) => {
        order.push(n)
        release()
      })
    )

    first()
    await Promise.all(others)
    expect(order).toEqual([1, 2, 3])
  })

  it('lets everyone through in turn, even when each holder releases before the next asks', async () => {
    const lock = createLock()
    for (let i = 0; i < 3; i++) {
      const release = await lock.acquire()
      release()
    }
    // A lock left held by a missed release would hang here rather than fail, so the value
    // being reached at all is the assertion.
    expect(true).toBe(true)
  })

  it('ignores a second release from the same holder', async () => {
    const lock = createLock()
    const first = await lock.acquire()
    const secondPromise = lock.acquire()

    // Releasing twice must not hand the lock to two callers, which would put two planners
    // in the critical section at the same time.
    first()
    first()

    const second = await secondPromise
    let thirdIn = false
    const thirdPromise = lock.acquire().then((release) => {
      thirdIn = true
      return release
    })

    await tick()
    expect(thirdIn).toBe(false)
    second()
    const third = await thirdPromise
    third()
  })

  it('serialises a real overlapping workload', async () => {
    const lock = createLock()
    let inside = 0
    let maxInside = 0

    await Promise.all(
      [1, 2, 3, 4, 5].map(async () => {
        const release = await lock.acquire()
        inside++
        maxInside = Math.max(maxInside, inside)
        await tick()
        inside--
        release()
      })
    )

    expect(maxInside).toBe(1)
  })
})
