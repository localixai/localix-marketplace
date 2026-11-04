import type { AgentTool } from '@localixai/mini-app-sdk/backend'
import { bulkCardTools } from './cards-bulk'
import { readCardTools } from './cards-read'
import { writeCardTools } from './cards-write'
import type { ToolDeps } from './common'
import { deckTools } from './decks'
import { fileTools } from './files'
import { studyTools } from './study'

/**
 * The agent's tools, `recall_*`: one per thing the person can do on the screen. Each answers in
 * words with where things stand; `isError` only when nothing was done.
 */
export function createTools(deps: ToolDeps): AgentTool[] {
  return [
    ...deckTools(deps),
    ...readCardTools(deps),
    ...writeCardTools(deps),
    ...bulkCardTools(deps),
    ...studyTools(deps),
    ...fileTools(deps),
  ] as AgentTool[]
}
