import { createContext, useContext, useEffect, useId, type ReactNode } from 'react'

/**
 * What the open views tell the agent. Each view reports one short text under its own id (the tab's
 * filters, the open card); the shell joins them under the tab's name and publishes the result.
 */
type Report = (id: string, text: string | null) => void
const ReportContext = createContext<Report>(() => {})

export function ContextProvider({ report, children }: { report: Report; children: ReactNode }) {
  return <ReportContext.Provider value={report}>{children}</ReportContext.Provider>
}

/** Report while mounted; the text goes away with the view. */
export function useReportContext(text: string | null): void {
  const report = useContext(ReportContext)
  const id = useId()
  useEffect(() => {
    report(id, text)
    return () => report(id, null)
  }, [report, id, text])
}
