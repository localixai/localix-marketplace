import { ImportError } from './common'

/**
 * Just enough of the protobuf wire format to read the few messages a modern Anki package keeps as
 * blobs: the media list, the package version, a note type's kind, a template's formats and a deck's
 * description. Fields are returned by number; nothing is interpreted beyond the wire types.
 */

export type ProtoValue = number | Uint8Array
export type ProtoMessage = Map<number, ProtoValue[]>

const utf8 = new TextDecoder('utf-8')

function malformed(): never {
  throw new ImportError('A record in the Anki file is damaged and cannot be read.')
}

export function readProto(bytes: Uint8Array): ProtoMessage {
  const fields: ProtoMessage = new Map()
  let pos = 0

  const varint = (): number => {
    let result = 0
    let scale = 1
    for (let index = 0; index < 10; index++) {
      if (pos >= bytes.length) malformed()
      const byte = bytes[pos++]!
      result += (byte & 0x7f) * scale
      if (byte < 0x80) return result
      scale *= 128
    }
    return malformed()
  }

  while (pos < bytes.length) {
    const key = varint()
    const field = Math.floor(key / 8)
    const wire = key % 8
    let value: ProtoValue
    if (wire === 0) value = varint()
    else if (wire === 2) {
      const length = varint()
      if (pos + length > bytes.length) malformed()
      value = bytes.subarray(pos, pos + length)
      pos += length
    } else if (wire === 1 || wire === 5) {
      const width = wire === 1 ? 8 : 4
      if (pos + width > bytes.length) malformed()
      value = width === 4 ? new DataView(bytes.buffer, bytes.byteOffset + pos, 4).getUint32(0, true) : 0
      pos += width
    } else return malformed()
    if (field < 1) malformed()
    const list = fields.get(field)
    if (list) list.push(value)
    else fields.set(field, [value])
  }
  return fields
}

export function protoNumber(message: ProtoMessage, field: number): number | undefined {
  const value = message.get(field)?.at(-1)
  return typeof value === 'number' ? value : undefined
}

export function protoBytes(message: ProtoMessage, field: number): Uint8Array | undefined {
  const value = message.get(field)?.at(-1)
  return value instanceof Uint8Array ? value : undefined
}

export function protoString(message: ProtoMessage, field: number): string {
  const value = protoBytes(message, field)
  return value ? utf8.decode(value) : ''
}

export function protoMessages(message: ProtoMessage, field: number): ProtoMessage[] {
  return (message.get(field) ?? [])
    .filter((value): value is Uint8Array => value instanceof Uint8Array)
    .map(readProto)
}
