/** DOM helpers shared by the screen's tests: they act the way a person does. */

/** Set a field's value the way typing does, so React sees the change. */
export function setValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
  Object.getOwnPropertyDescriptor(prototype.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** The one element with this accessible name, anywhere in the page (dialogs and menus portal). */
export function byLabel<T extends HTMLElement = HTMLElement>(
  label: string,
  root: ParentNode = document.body,
): T {
  const found = root.querySelectorAll<T>(`[aria-label="${label}"]`)
  if (found.length !== 1) throw new Error(`Expected one "${label}", found ${found.length}`)
  return found[0]!
}

export const byRole = (role: string, root: ParentNode = document.body): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(`[role="${role}"]`),
]

/** The innermost element matching `selector` whose text is exactly `text`. */
export function byText(
  text: string,
  selector = '*',
  root: ParentNode = document.body,
): HTMLElement {
  const matches = [...root.querySelectorAll<HTMLElement>(selector)].filter(
    (element) => element.textContent?.trim() === text,
  )
  const found = matches.find(
    (element) => !matches.some((other) => other !== element && element.contains(other)),
  )
  if (!found) throw new Error(`No ${selector} with the text "${text}"`)
  return found
}

export const click = (element: Element): void => {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

export const press = (element: Element, key: string, init: KeyboardEventInit = {}): void => {
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  )
}

/** Open a Radix menu trigger the way a keyboard does. */
export function openMenu(trigger: Element): void {
  press(trigger, 'Enter')
}

/** The control a visible `Field` label names (a `<label for>` the kit's Field wires up). */
export function field<T extends HTMLElement = HTMLInputElement>(
  label: string,
  root: ParentNode = document.body,
): T {
  const found = [...root.querySelectorAll<HTMLLabelElement>('label')].find(
    (element) => element.textContent?.replace(/\*?Required|Optional/g, '').trim() === label,
  )
  const control = found && document.getElementById(found.htmlFor)
  if (!control) throw new Error(`No field labelled "${label}"`)
  return control as T
}
