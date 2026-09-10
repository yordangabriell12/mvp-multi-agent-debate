'use client'

import { useEffect } from 'react'
import { initConfigSync } from '@/lib/configSync'

/**
 * Starts the configuration sync once the workspace mounts. Renders nothing.
 * Kept as its own component so the app layout can stay a server component.
 */
export function ConfigSync() {
  useEffect(() => {
    initConfigSync()
  }, [])
  return null
}
