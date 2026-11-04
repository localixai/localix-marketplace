import { join } from 'node:path'
import { z } from 'zod'
import { openJsonStore, type SemanticIndexHost } from '@localixai/mini-app-sdk/backend'
import { systemClock, type Clock } from '../shared/day'
import { inTransaction, withDb, type Db } from './db'
import { importOps } from './service-import'
import { noteOps } from './service-notes'
import { readOps } from './service-reads'
import { studyOps } from './service-study'

/**
 * The service: every read and write Recall does, for the routes and the tools alike. A write is
 * one IMMEDIATE transaction on its own connection; once it commits, `revision.json` is bumped (the
 * store feed nudges open screens, whose `useRevision` re-reads) and the semantic index is told
 * which notes changed. Nothing lives between calls: the clock and the index are passed in.
 */

export const REVISION_FILE = 'revision.json'
export const revisionSchema = z.object({ revision: z.number().int().min(0) })
/** The semantic index's collection of notes. */
export const NOTES_INDEX = 'recall-notes'

export interface ServiceDeps {
  dataDir: string
  clock?: Clock
  /** The host's semantic index, when this load has it. */
  semantic?: SemanticIndexHost
}

export interface Core {
  dataDir: string
  mediaDir: string
  clock: Clock
  semantic: SemanticIndexHost | undefined
  /** Run reads on a connection of their own. */
  read<T>(use: (db: Db, now: Date) => T): T
  /**
   * Run a write in one transaction, then bump the revision. `touched` collects the ids of notes
   * whose text changed or that were removed, for the semantic index.
   */
  write<T>(change: (db: Db, now: Date, touched: Set<string>) => T): Promise<T>
}

export function revisionStore(dataDir: string) {
  return openJsonStore({ dir: dataDir, file: REVISION_FILE, schema: revisionSchema, initial: { revision: 0 } })
}

export function createCore(deps: ServiceDeps): Core {
  const clock = deps.clock ?? systemClock
  return {
    dataDir: deps.dataDir,
    mediaDir: join(deps.dataDir, 'media'),
    clock,
    semantic: deps.semantic,
    read: (use) => withDb(deps.dataDir, (db) => use(db, clock.now())),
    async write(change) {
      const now = clock.now()
      const touched = new Set<string>()
      const result = withDb(deps.dataDir, (db) => inTransaction(db, () => change(db, now, touched)))
      await revisionStore(deps.dataDir).update((current) => ({ revision: current.revision + 1 }))
      if (touched.size) {
        try {
          deps.semantic?.changed(NOTES_INDEX, [...touched])
        } catch {
          // The index catches up on its next scan.
        }
      }
      return result
    },
  }
}

export function createService(deps: ServiceDeps) {
  const core = createCore(deps)
  const reads = readOps(core)
  const study = studyOps(core)
  return {
    core,
    ...reads,
    ...study,
    ...noteOps(core),
    ...importOps(core),
    async revision(): Promise<number> {
      return (await revisionStore(core.dataDir).read()).revision
    },
  }
}

export type Service = ReturnType<typeof createService>
