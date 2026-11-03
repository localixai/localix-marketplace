import type { LucideIcon } from 'lucide-react'
import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  FileText,
  Mail,
  Phone,
  StickyNote,
  Users,
} from 'lucide-react'
import { STATUS_TONE_DOT } from '@localixai/kit/status-dot'
import type { SelectOption } from '@localixai/kit/select'
import { ACTIVITY_KINDS, STAGES, type ActivityKind, type Stage } from '../shared/model'

/**
 * How a stage and an activity kind LOOK, owned once so every pattern draws them the same way: the
 * label a person reads, the dot colour, the chip tone and the icon. A stage is never told by
 * colour alone — each has its own label and glyph. `Record<Stage, …>` makes the compiler flag a
 * stage added to the model but not drawn here.
 */
export const STAGE_LABEL: Record<Stage, string> = {
  lead: 'Lead',
  qualified: 'Qualified',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
}

/** The dot's colour: the host's shared work tones, plus a plain status token for "in progress". */
export const STAGE_DOT: Record<Stage, string> = {
  lead: STATUS_TONE_DOT.idle,
  qualified: STATUS_TONE_DOT.queued,
  proposal: 'bg-status-warning',
  won: STATUS_TONE_DOT.done,
  lost: STATUS_TONE_DOT.error,
}

/** The tone of a `Chip` for the stage. */
export const STAGE_TONE: Record<Stage, 'neutral' | 'info' | 'warning' | 'success' | 'error'> = {
  lead: 'neutral',
  qualified: 'info',
  proposal: 'warning',
  won: 'success',
  lost: 'error',
}

export const STAGE_ICON: Record<Stage, LucideIcon> = {
  lead: CircleDashed,
  qualified: CircleDot,
  proposal: FileText,
  won: CircleCheck,
  lost: CircleX,
}

/** The text colour that matches the stage, for an icon that stands alone. */
export const STAGE_TEXT: Record<Stage, string> = {
  lead: 'text-text-faint',
  qualified: 'text-status-info',
  proposal: 'text-status-warning',
  won: 'text-status-success',
  lost: 'text-status-error',
}

export const STAGE_OPTIONS: readonly SelectOption[] = STAGES.map((stage) => ({
  value: stage,
  label: STAGE_LABEL[stage],
  icon: STAGE_ICON[stage],
}))

export const KIND_LABEL: Record<ActivityKind, string> = {
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  note: 'Note',
}
export const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  note: StickyNote,
}
export const KIND_OPTIONS: readonly SelectOption[] = ACTIVITY_KINDS.map((kind) => ({
  value: kind,
  label: KIND_LABEL[kind],
  icon: KIND_ICON[kind],
}))
