import { expect, test } from 'bun:test'
import { bytesLabel, numberLabel } from './format'

test('counts get thousands separators', () => {
  expect(numberLabel(2524)).toBe('2,524')
  expect(numberLabel(12)).toBe('12')
})

test('sizes read in the unit a person would say', () => {
  expect(bytesLabel(103 * 1024 * 1024 + 300_000)).toBe('103 MB')
  expect(bytesLabel(4.2 * 1024 * 1024)).toBe('4.2 MB')
  expect(bytesLabel(840 * 1024)).toBe('840 KB')
  expect(bytesLabel(10)).toBe('1 KB')
  expect(bytesLabel(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB')
})
