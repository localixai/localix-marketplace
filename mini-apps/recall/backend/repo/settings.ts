import { DEFAULT_SETTINGS, settingsSchema, type Settings, type SettingsPatch } from '../../shared/model'
import type { Db } from '../db'

/**
 * Settings: one row per key, the value as JSON. A key that is missing or no longer valid reads as
 * its default, so a setting added or narrowed later never loses the others.
 */

export function readSettings(db: Db): Settings {
  const rows = db.query('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const settings: Settings = { ...DEFAULT_SETTINGS }
  const shape = settingsSchema.shape
  for (const row of rows) {
    if (!(row.key in shape)) continue
    const key = row.key as keyof Settings
    try {
      const parsed = shape[key].safeParse(JSON.parse(row.value))
      if (parsed.success) (settings as Record<string, unknown>)[key] = parsed.data
    } catch {
      // A value that is not JSON reads as the default.
    }
  }
  return settings
}

export function writeSettings(db: Db, patch: SettingsPatch): void {
  const statement = db.query(
    'INSERT INTO settings (key, value) VALUES ($key, $value) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  )
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) statement.run({ key, value: JSON.stringify(value) })
  }
}
