import { z } from 'zod'
import { settingsSchema } from './model'
import { deckRefSchema, deckSummarySchema, libraryRowSchema } from './payloads'

/** Stats, heatmap, settings, decks, import, export and the revision (see `shared/api.ts`). */

export const revisionSchema = z.object({ revision: z.number() })

export const decksResultSchema = z.object({ decks: z.array(deckSummarySchema) })
export const deckRemoveResultSchema = z.object({
  removed: z.string(),
  moved: z.number(),
  deleted: z.number(),
})

const dayCountSchema = z.object({
  day: z.string(),
  reviews: z.number(),
  correct: z.number(),
  ms: z.number(),
})

export const statsQuerySchema = z.object({
  deckIds: z.array(z.string()).optional(),
  /** Forecast days, 7..365 (default 30). */
  days: z.number().int().min(7).max(365).optional(),
})

export const statsSchema = z.object({
  day: z.string(),
  forecast: z.array(z.object({ day: z.string(), count: z.number() })),
  /** The last 90 days. */
  perDay: z.array(dayCountSchema),
  retention: z.object({
    /** Of review cards answered in the last 30 days; null without any. */
    actual: z.number().nullable(),
    target: z.number(),
    reviews: z.number(),
  }),
  states: z.object({
    new: z.number(),
    learning: z.number(),
    young: z.number(),
    mature: z.number(),
    paused: z.number(),
    hard: z.number(),
    drafts: z.number(),
  }),
  /** Most lapses first, at most 10. */
  hardest: z.array(libraryRowSchema),
  time: z.object({ todayMs: z.number(), last30Ms: z.number(), averageMs: z.number().nullable() }),
  totals: z.object({ notes: z.number(), cards: z.number(), reviews: z.number() }),
})
export type Stats = z.infer<typeof statsSchema>

/** Weeks of reviews to draw, newest last: 1..53 (default 12). */
export const heatmapQuerySchema = z.object({ weeks: z.number().int().min(1).max(53).optional() })

export const heatmapSchema = z.object({
  cells: z.array(
    z.object({
      day: z.string(),
      reviews: z.number(),
      goalMet: z.boolean(),
      level: z.number(),
    }),
  ),
  streak: z.number(),
  goal: z.number(),
  today: z.object({ day: z.string(), reviews: z.number() }),
})
export type Heatmap = z.infer<typeof heatmapSchema>

export const settingsResultSchema = z.object({
  settings: settingsSchema,
  /** About how many reviews a day each retention choice means, at today's collection. */
  estimates: z.object({ '0.8': z.number(), '0.9': z.number(), '0.95': z.number() }),
})
export type SettingsResult = z.infer<typeof settingsResultSchema>

export const IMPORT_FORMATS = ['apkg', 'csv', 'markdown', 'json'] as const

/** Options of an import, as query parameters of the commit route and the tool's input. */
export const importOptionsSchema = z.object({
  /** Every note into this deck; without it, each into its file deck (none → the Inbox). */
  deckId: z.string().optional(),
  /** 'draft' (default) for review on the screen first, 'active' to study at once. */
  status: z.enum(['draft', 'active']).optional(),
  /** Replay the file's review history so cards keep their progress (default true). */
  keepProgress: z.boolean().optional(),
  /** Skip notes whose front exactly matches one already kept (default true). */
  skipDuplicates: z.boolean().optional(),
})
export type ImportOptions = z.infer<typeof importOptionsSchema>

export const importPreviewSchema = z.object({
  source: z.string(),
  format: z.enum(IMPORT_FORMATS),
  notes: z.number(),
  cards: z.number(),
  decks: z.array(z.object({ name: z.string(), notes: z.number(), exists: z.boolean() })),
  /** Notes whose front already exists here, exactly. */
  duplicates: z.number(),
  /** Notes that carry review history. */
  withProgress: z.number(),
  media: z.number(),
  warnings: z.array(z.string()),
  sample: z.array(z.object({ kind: z.string(), front: z.string(), back: z.string() })),
})
export type ImportPreview = z.infer<typeof importPreviewSchema>

export const importResultSchema = z.object({
  source: z.string(),
  added: z.number(),
  cards: z.number(),
  skippedDuplicates: z.number(),
  decksCreated: z.array(z.string()),
  status: z.enum(['draft', 'active']),
  reviewsReplayed: z.number(),
  warnings: z.array(z.string()),
  /** Where the notes went. */
  decks: z.array(deckRefSchema.extend({ notes: z.number() })),
})
export type ImportResult = z.infer<typeof importResultSchema>

export const EXPORT_FORMATS = ['json', 'csv', 'markdown'] as const
export const exportFormatSchema = z.enum(EXPORT_FORMATS)
export type ExportFormat = z.infer<typeof exportFormatSchema>
