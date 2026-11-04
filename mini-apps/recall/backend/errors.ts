/**
 * Domain errors: the service throws them with a sentence for the person; routes map the code to
 * an HTTP status, tools to `isError`.
 */
export type RecallErrorCode = 'not_found' | 'invalid' | 'conflict' | 'list_changed'

const STATUS: Record<RecallErrorCode, 404 | 422 | 409> = {
  not_found: 404,
  invalid: 422,
  conflict: 409,
  list_changed: 409,
}

export class RecallError extends Error {
  override name = 'RecallError'
  constructor(
    readonly code: RecallErrorCode,
    message: string,
  ) {
    super(message)
  }
  get status(): 404 | 422 | 409 {
    return STATUS[this.code]
  }
}

export const notFound = (what: string, where: string) =>
  new RecallError('not_found', `No ${what} has that id. ${where}`)

export const invalid = (message: string) => new RecallError('invalid', message)

/** An error from the import parsers: a file that cannot be read, worded for the person. */
export function isImportError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'ImportError'
}
