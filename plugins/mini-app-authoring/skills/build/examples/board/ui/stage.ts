import { STATUS_TONE_DOT } from '@localixai/kit/status-dot'
import type { Stage } from '../shared/model'

/**
 * How a stage looks: the dot beside its name. The label itself is in the model (the agent says the
 * same words). A stage is never told by colour alone: its name is always printed beside the dot.
 * `Record<Stage, …>` makes the compiler flag a stage added to the model but not drawn here.
 */
export const STAGE_DOT: Record<Stage, string> = {
  backlog: STATUS_TONE_DOT.idle,
  doing: STATUS_TONE_DOT.queued,
  review: 'bg-status-warning',
  done: STATUS_TONE_DOT.done,
}
