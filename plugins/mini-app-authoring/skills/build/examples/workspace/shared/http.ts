import { z } from 'zod'

/**
 * THE .http FORMAT — the file family this mini app edits, as pure functions. The editor's panel,
 * the chat action and the agent's tools all read and write requests through these, so a request
 * means the same thing wherever it appears.
 *
 * A file is requests separated by `###` lines (the text after `###` names the request):
 *
 *     ### List users
 *     GET https://api.example.com/users
 *     Accept: application/json
 *
 *     ### Add a user
 *     POST https://api.example.com/users
 *     Content-Type: application/json
 *
 *     {"name": "Ada"}
 */

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const
export type Method = (typeof METHODS)[number]

export const methodSchema = z.enum(METHODS)

/** One request, as the file, the agent and the store all hold it. */
export interface HttpRequest {
  name: string
  method: Method
  url: string
  /** `Name: value` lines. */
  headers: string[]
  body: string
}

/** A request found in a file, with the 1-based line of its request line (for "go to"). */
export interface ParsedRequest extends HttpRequest {
  line: number
}

const REQUEST_LINE = new RegExp(`^(${METHODS.join('|')})\\s+(\\S+)(?:\\s+HTTP/\\S+)?\\s*$`, 'i')
const HEADER_LINE = /^[A-Za-z0-9-]+\s*:/

/** The requests in a file, in order. Text that is not a request (notes, comments) is skipped. */
export function parseHttpFile(text: string): ParsedRequest[] {
  const requests: ParsedRequest[] = []
  // One request is being read at a time; an object (not loose variables) keeps its state in view.
  const reading: { request: ParsedRequest | null; inBody: boolean; title: string } = {
    request: null,
    inBody: false,
    title: '',
  }
  const finish = () => {
    if (reading.request) requests.push({ ...reading.request, body: reading.request.body.trim() })
    reading.request = null
    reading.inBody = false
    reading.title = ''
  }
  for (const [index, raw] of text.replace(/\r\n?/g, '\n').split('\n').entries()) {
    const line = raw.trimEnd()
    if (line.startsWith('###')) {
      finish()
      reading.title = line.slice(3).trim()
    } else if (!reading.request) {
      const match = REQUEST_LINE.exec(line.trim())
      if (!match) continue // a comment, a blank, a note before the request line
      const method = match[1]!.toUpperCase() as Method
      const url = match[2]!
      const name = reading.title || `${method} ${url}`
      reading.request = { name, method, url, headers: [], body: '', line: index + 1 }
    } else if (reading.inBody) {
      reading.request.body += `${line}\n`
    } else if (line === '') {
      reading.inBody = true
    } else if (HEADER_LINE.test(line)) {
      reading.request.headers.push(line.trim())
    }
  }
  finish()
  return requests
}

/** The request as `.http` text — what @-mentions give the agent and what a copy pastes. */
export function formatRequest(request: HttpRequest): string {
  const head = [`### ${request.name}`, `${request.method} ${request.url}`, ...request.headers]
  return `${head.join('\n')}${request.body ? `\n\n${request.body}` : ''}\n`
}

/** Single-quote a word for a POSIX shell: the only character that needs care is the quote. */
export const shellQuote = (word: string): string => `'${word.replace(/'/g, `'\\''`)}'`

/** The `curl` command that sends the request: what the terminal runs. */
export function curlCommand(request: HttpRequest): string {
  const parts = ['curl', '-sS', '-i', '-X', request.method, shellQuote(request.url)]
  for (const header of request.headers) parts.push('-H', shellQuote(header))
  if (request.body) parts.push('--data-raw', shellQuote(request.body))
  return parts.join(' ')
}
