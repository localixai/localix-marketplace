import type { LucideIcon } from 'lucide-react'
import { Bookmark, CircleCheck, CircleSlash, MessagesSquare, Send, Undo2 } from 'lucide-react'
import type { SelectOption } from '@localixai/kit/select'
import { STATUSES, type Status } from '../shared/model'

/**
 * How a status LOOKS, owned once so the list, the table, the timeline and the form draw it the same
 * way: the label a person reads, the tone of its chip and its icon. A status is never told by
 * colour alone: each has its own label and glyph. `Record<Status, …>` makes the compiler flag a
 * status added to the model but not drawn here.
 */
export const STATUS_LABEL: Record<Status, string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

/** The tone of a `Chip` for the status. */
export const STATUS_TONE: Record<Status, 'neutral' | 'info' | 'warning' | 'success' | 'error'> = {
  wishlist: 'neutral',
  applied: 'info',
  interview: 'warning',
  offer: 'success',
  rejected: 'error',
  withdrawn: 'neutral',
}

export const STATUS_ICON: Record<Status, LucideIcon> = {
  wishlist: Bookmark,
  applied: Send,
  interview: MessagesSquare,
  offer: CircleCheck,
  rejected: CircleSlash,
  withdrawn: Undo2,
}

/** The text colour that matches the status, for an icon that stands alone. */
export const STATUS_TEXT: Record<Status, string> = {
  wishlist: 'text-text-faint',
  applied: 'text-status-info',
  interview: 'text-status-warning',
  offer: 'text-status-success',
  rejected: 'text-status-error',
  withdrawn: 'text-text-faint',
}

export const STATUS_OPTIONS: SelectOption[] = STATUSES.map((status) => ({
  value: status,
  label: STATUS_LABEL[status],
}))
