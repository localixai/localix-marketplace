import { describe, expect, test } from 'bun:test'
import { curlCommand, formatRequest, parseHttpFile, shellQuote } from './http'

const FILE = `# Notes before the first request are skipped.

### List users
GET https://api.example.com/users
Accept: application/json

### Add a user
POST https://api.example.com/users HTTP/1.1
Content-Type: application/json

{"name": "Ada"}
`

describe('the .http format', () => {
  test('reads each request with its name, headers, body and line', () => {
    expect(parseHttpFile(FILE)).toEqual([
      {
        name: 'List users',
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: ['Accept: application/json'],
        body: '',
        line: 4,
      },
      {
        name: 'Add a user',
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: ['Content-Type: application/json'],
        body: '{"name": "Ada"}',
        line: 8,
      },
    ])
  })

  test('a request without a ### name is named after its method and URL', () => {
    expect(parseHttpFile('get https://example.com/ping\r\n')).toEqual([
      expect.objectContaining({ name: 'GET https://example.com/ping', method: 'GET', line: 1 }),
    ])
  })

  test('text that is not a request gives none', () => {
    expect(parseHttpFile('just some notes\n\n### nothing here')).toEqual([])
  })

  test('formatting a request and reading it back keeps it', () => {
    const [request] = parseHttpFile(FILE).slice(1)
    expect(parseHttpFile(formatRequest(request!))).toEqual([{ ...request!, line: 2 }])
  })

  test('the curl command quotes every part the person or the agent typed', () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`)
    expect(
      curlCommand({
        name: 'x',
        method: 'POST',
        url: "https://example.com/?q=a'b",
        headers: ['X-Key: 1'],
        body: '{"a":1}',
      }),
    ).toBe(
      `curl -sS -i -X POST 'https://example.com/?q=a'\\''b' -H 'X-Key: 1' --data-raw '{"a":1}'`,
    )
  })
})
