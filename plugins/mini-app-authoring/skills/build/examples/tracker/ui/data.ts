import { useCollection } from '@localixai/mini-app-sdk/ui/app'
import {
  APP,
  APPLICATIONS,
  COMPANIES,
  applicationSchema,
  companySchema,
  type Application,
  type ApplicationInput,
  type Company,
  type CompanyInput,
} from '../shared/model'

/**
 * The two collections, read and written through their routes. `useCollection` polls while the
 * screen is `active`, shows a change the moment its answer arrives, re-reads when the agent writes
 * (the store feed), and exposes `error` for both a failed read and a failed write. Two typed
 * wrappers keep the generics out of the screen.
 */
export function useCompanies(active: boolean) {
  return useCollection<Company, CompanyInput>({
    app: APP,
    name: COMPANIES,
    item: companySchema,
    active,
  })
}

export function useApplications(active: boolean) {
  return useCollection<Application, ApplicationInput>({
    app: APP,
    name: APPLICATIONS,
    item: applicationSchema,
    active,
  })
}
