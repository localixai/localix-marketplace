import { useCollection } from '@localixai/mini-app-sdk/ui/app'
import {
  ACTIVITIES,
  APP,
  DEALS,
  activitySchema,
  dealSchema,
  type Activity,
  type ActivityInput,
  type Deal,
  type DealInput,
} from '../shared/model'

/** What every pattern receives: whether the gallery tab is showing, so a hidden one reads nothing. */
export interface PatternProps {
  active: boolean
}

/**
 * The deals, read and written through the collection's routes. `useCollection` polls while the
 * screen is `active`, shows a change the moment its answer arrives, and exposes `error` for both a
 * failed read and a failed write. Two typed wrappers keep the generics out of every pattern.
 */
export function useDeals(active: boolean) {
  return useCollection<Deal, DealInput>({ app: APP, name: DEALS, item: dealSchema, active })
}

export function useActivities(active: boolean) {
  return useCollection<Activity, ActivityInput>({
    app: APP,
    name: ACTIVITIES,
    item: activitySchema,
    active,
  })
}
