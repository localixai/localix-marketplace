import { useState } from 'react'
import { Download } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@localixai/kit/dropdown-menu'
import { IconButton } from '@localixai/kit/icon-button'
import { miniAppFiles } from '@localixai/mini-app-sdk/ui/runtime'
import { miniAppApiFetch } from '@localixai/mini-app-sdk/ui/transport'
import { toast } from '@localixai/mini-app-sdk/ui'
import { pathOf } from '../../shared/api'
import type { ExportFormat } from '../../shared/payloads-more'
import { messageOf } from '../data'

const FORMATS: { format: ExportFormat; label: string; ext: string }[] = [
  { format: 'json', label: 'Backup (JSON)', ext: 'json' },
  { format: 'csv', label: 'Spreadsheet (CSV)', ext: 'csv' },
  { format: 'markdown', label: 'Notes (Markdown)', ext: 'md' },
]

/** Save the whole collection as a file through the host's save flow. */
export function ExportMenu() {
  const [busy, setBusy] = useState(false)
  async function download(format: ExportFormat, ext: string) {
    setBusy(true)
    try {
      const response = await miniAppApiFetch(pathOf('export', {}, { format }))
      if (!response.ok) throw new Error('The export failed.')
      await miniAppFiles.saveBlob(`recall.${ext}`, await response.blob())
      toast.success('Export saved.')
    } catch (failure) {
      toast.error(messageOf(failure, 'The export failed.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton aria-label="Export cards" tooltip="Export" size="sm" disabled={busy}>
          <Download />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {FORMATS.map((item) => (
          <DropdownMenuItem key={item.format} onSelect={() => void download(item.format, item.ext)}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
