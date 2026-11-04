import { useEffect, useRef } from 'react'
import type { StudyTarget } from './nav'

/**
 * A request for the Recall screen to show something, made from outside it: the Anki file tab opens
 * the screen and asks for the imported cards or a study session. The screen takes the request when
 * it mounts or the moment it arrives. Both live in this mini app's UI bundle, so one variable is
 * the whole channel; nothing is stored.
 */
export type Launch =
  | { show: 'study'; target: StudyTarget }
  | { show: 'cards'; preset: { deck?: string; state?: string } }

let pending: Launch | null = null
const listeners = new Set<() => void>()

export function requestLaunch(launch: Launch): void {
  pending = launch
  for (const listener of [...listeners]) listener()
}

/** The request waiting, if any, taken so that no one else acts on it. */
export function takeLaunch(): Launch | null {
  const launch = pending
  pending = null
  return launch
}

/** Calls `onLaunch` with a request waiting now and every one that comes while mounted. */
export function useLaunch(onLaunch: (launch: Launch) => void): void {
  const latest = useRef(onLaunch)
  latest.current = onLaunch
  useEffect(() => {
    const take = () => {
      const launch = takeLaunch()
      if (launch) latest.current(launch)
    }
    take()
    listeners.add(take)
    return () => void listeners.delete(take)
  }, [])
}
