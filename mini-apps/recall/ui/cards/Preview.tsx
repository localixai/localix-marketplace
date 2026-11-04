import { Md } from '../Md'
import { previewOf, type FormState } from './note-form'

/** The card as it will look when studied, updating as the person types. */
export function Preview({ form }: { form: FormState }) {
  const faces = previewOf(form)
  const empty = !form.front.trim()
  return (
    <section aria-label="Preview" className="recall-paper flex flex-col gap-2 rounded-lg border border-[var(--recall-edge)] bg-[var(--recall-paper)] p-3">
      <span className="recall-kicker">Preview</span>
      {empty ? (
        <p className="text-xs text-text-faint">Write the front to see the card.</p>
      ) : (
        <>
          <Md>{faces.prompt}</Md>
          {(faces.answer.trim() || faces.extra.trim()) && <hr className="recall-rule" />}
          {faces.answer.trim() && <Md>{faces.answer}</Md>}
          {faces.extra.trim() && <Md className="text-text-soft">{faces.extra}</Md>}
        </>
      )}
    </section>
  )
}
