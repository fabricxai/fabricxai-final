/**
 * jsdom setup (plan 7.2, audit TEST-H8).
 *
 * Two things jsdom does not have and the code under test requires.
 */
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

import { clearQueue } from './src/lib/offline/test-support'

beforeEach(async () => {
  /*
   * A fresh IndexedDB per test.
   *
   * `fake-indexeddb/auto` gives one database per FILE, not per test, and the offline queue is
   * exactly the kind of module-level state that leaks: a test that captures three writes and
   * a following test that asserts the queue is empty would pass or fail depending on order.
   * Emptying it between tests makes each one say what it means.
   */
  await clearQueue()
})

afterEach(() => {
  // React roots outlive a test otherwise, and a component still mounted keeps firing timers
  // into the next one's assertions.
  cleanup()
})
