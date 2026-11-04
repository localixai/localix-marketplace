import { useCallback, useState } from 'react'
import type { ImportOptions, ImportPreview, ImportResult } from '../../shared/payloads-more'
import { messageOf, upload, useShared } from '../data'

export const ACCEPT = '.apkg,.colpkg,.csv,.tsv,.txt,.md,.json'
export const MAX_BYTES = 512 * 1024 * 1024

export type Step =
  | { name: 'choose'; error: string | null }
  | { name: 'reading'; file: File }
  | { name: 'preview'; file: File; preview: ImportPreview; error: string | null }
  | { name: 'importing'; file: File; preview: ImportPreview }
  | { name: 'done'; result: ImportResult }

/** The import in steps: choose a file, read it for a preview, import it with the person's options. */
export function useImport() {
  const { bump } = useShared()
  const [step, setStep] = useState<Step>({ name: 'choose', error: null })

  const reset = useCallback(() => setStep({ name: 'choose', error: null }), [])
  const choose = useCallback(async (file: File) => {
    if (file.size > MAX_BYTES) return setStep({ name: 'choose', error: 'That file is larger than 512 MB.' })
    setStep({ name: 'reading', file })
    try {
      const preview = await upload('importPreview', file, { name: file.name })
      setStep({ name: 'preview', file, preview, error: null })
    } catch (failure) {
      setStep({ name: 'choose', error: messageOf(failure, 'That file could not be read.') })
    }
  }, [])
  const commit = useCallback(
    async (file: File, preview: ImportPreview, options: ImportOptions) => {
      setStep({ name: 'importing', file, preview })
      try {
        const result = await upload('importCommit', file, { name: file.name, ...options })
        setStep({ name: 'done', result })
        bump()
      } catch (failure) {
        setStep({ name: 'preview', file, preview, error: messageOf(failure, 'The import failed.') })
      }
    },
    [bump],
  )
  return { step, choose, commit, reset }
}
