import { useCallback, useEffect, useRef, useState } from 'react'
import type { BodyOf } from '../../shared/api'
import type { ImportFilePreview, ImportResult } from '../../shared/payloads-more'
import { call, messageOf, useShared } from '../data'
import { failureTitle } from './ankiText'

export type AnkiState =
  | { step: 'reading' }
  | { step: 'ready'; preview: ImportFilePreview }
  | { step: 'importing'; preview: ImportFilePreview }
  | { step: 'done'; preview: ImportFilePreview; result: ImportResult }
  | { step: 'error'; title: string; message: string; retry: () => void }

type Body = BodyOf<'importFileCommit'>

/** The Anki file in steps: read it for a preview (nothing is stored), then import it with the choices. */
export function useAnkiFile(path: string) {
  const { bump } = useShared()
  const [state, setState] = useState<AnkiState>({ step: 'reading' })
  const latest = useRef(0)

  const read = useCallback(async () => {
    const turn = ++latest.current
    setState({ step: 'reading' })
    try {
      const preview = await call('importFilePreview', { body: { path } })
      if (turn === latest.current) setState({ step: 'ready', preview })
    } catch (failure) {
      if (turn !== latest.current) return
      const message = messageOf(failure, 'That file could not be read.')
      setState({ step: 'error', title: failureTitle(message), message, retry: () => void read() })
    }
  }, [path])

  useEffect(() => {
    void read()
    return () => void latest.current++
  }, [read])

  const run = useCallback(
    async (preview: ImportFilePreview, body: Body) => {
      const turn = ++latest.current
      setState({ step: 'importing', preview })
      try {
        const result = await call('importFileCommit', { body })
        if (turn !== latest.current) return
        setState({ step: 'done', preview, result })
        bump()
      } catch (failure) {
        if (turn !== latest.current) return
        const message = messageOf(failure, 'The import failed.')
        setState({
          step: 'error',
          title: 'The import did not finish',
          message,
          retry: () => void run(preview, body),
        })
      }
    },
    [bump],
  )
  return { state, run }
}
