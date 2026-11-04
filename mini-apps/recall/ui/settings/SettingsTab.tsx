import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { Input } from '@localixai/kit/input'
import { Select } from '@localixai/kit/select'
import { SectionHeading } from '@localixai/kit/section-heading'
import { Skeleton } from '@localixai/kit/skeleton'
import { StateNotice } from '@localixai/kit/state-notice'
import { Switch } from '@localixai/kit/switch'
import { SegmentedRadioGroup } from '@localixai/mini-app-sdk/ui/segmented-control'
import { settingsSchema, type Settings, type SettingsPatch } from '../../shared/model'
import { call, messageOf, useRead, useShared } from '../data'

type Retention = '0.8' | '0.9' | '0.95'
const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, '0')}:00`,
}))
const SAVED_MS = 2500

/** One setting: its name and description on the left, its control on the right (stacked when narrow). */
function Row({ label, description, error, children }: { label: string; description?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div className="grid gap-2 py-4 @xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] @xl:items-center @xl:gap-8">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="mt-0.5 text-xs text-text-soft">{description}</p>}
      </div>
      <div className="min-w-0">
        {children}
        {error && <p role="alert" className="mt-1 text-xs text-status-error">{error}</p>}
      </div>
    </div>
  )
}

function Group({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <SectionHeading as="h2" level="section" title={<span id={id}>{title}</span>} description={description} />
      <div className="divide-y divide-border-faint">{children}</div>
    </section>
  )
}

/**
 * Settings as a page: grouped rows that fill the pane. Every change is saved the moment it is made
 * (a number when its field is left or Enter is pressed), with a quiet "Saved"; a refused change
 * goes back to what is stored and says why.
 */
export function SettingsTab() {
  const read = useRead('settings')
  const { bump } = useShared()
  const stored = read.data?.settings
  const [pending, setPending] = useState<SettingsPatch>({})
  const [numbers, setNumbers] = useState<{ newPerDay?: string; dailyGoal?: string }>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  if (!stored || !read.data) {
    return read.error ? (
      <StateNotice
        role="alert"
        icon={SettingsIcon}
        title="Settings could not be loaded"
        body={read.error}
        actions={<Button onClick={read.refresh}>Try again</Button>}
      />
    ) : (
      <div className="flex flex-col gap-4" aria-hidden>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  const value: Settings = { ...stored, ...pending }
  const estimate = read.data.estimates[String(value.retention) as Retention]

  async function save(patch: SettingsPatch) {
    setPending((current) => ({ ...current, ...patch }))
    setFailure(null)
    setSaved(false)
    try {
      await call('settingsUpdate', { body: patch })
      bump()
      setSaved(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setSaved(false), SAVED_MS)
    } catch (error) {
      setFailure(messageOf(error, 'That change was not saved.'))
    } finally {
      // Either way the stored value is the truth again.
      setPending((current) => {
        const next = { ...current }
        for (const key of Object.keys(patch)) delete next[key as keyof SettingsPatch]
        return next
      })
    }
  }

  function commitNumber(key: 'newPerDay' | 'dailyGoal') {
    const text = numbers[key]
    if (text === undefined) return
    const parsed = settingsSchema.shape[key].safeParse(text.trim() === '' ? NaN : Number(text))
    if (!parsed.success) {
      return setErrors((e) => ({ ...e, [key]: key === 'newPerDay' ? 'Use a whole number from 0 to 1000.' : 'Use a whole number from 1 to 5000.' }))
    }
    setErrors((e) => ({ ...e, [key]: '' }))
    setNumbers((n) => ({ ...n, [key]: undefined }))
    if (parsed.data !== stored![key]) void save({ [key]: parsed.data })
  }
  const numberField = (key: 'newPerDay' | 'dailyGoal', label: string, min: number, max: number) => (
    <Input
      type="number"
      inputMode="numeric"
      aria-label={label}
      min={min}
      max={max}
      value={numbers[key] ?? String(value[key])}
      onChange={(event) => setNumbers((n) => ({ ...n, [key]: event.target.value }))}
      onBlur={() => commitNumber(key)}
      onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), commitNumber(key))}
    />
  )

  return (
    <div className="flex flex-col gap-8">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <p className="text-xs text-text-faint">Changes are saved as you make them.</p>
        {saved && <span role="status" className="text-xs text-status-success">Saved</span>}
        {failure && <span role="alert" className="text-xs text-status-error">{failure}</span>}
      </div>
      <Group id="settings-studying" title="Studying" description="How much you want to remember and how a day of study runs.">
        <Row
          label="How much do you want to remember?"
          description={`About ${estimate} reviews a day at ${Math.round(value.retention * 100)}%. Higher means more reviews.`}
        >
          <SegmentedRadioGroup<Retention>
            aria-label="How much do you want to remember?"
            value={String(value.retention) as Retention}
            onValueChange={(retention) => void save({ retention: Number(retention) as Settings['retention'] })}
            fullWidth
            options={[
              { value: '0.8', label: '80%' },
              { value: '0.9', label: '90%' },
              { value: '0.95', label: '95%' },
            ]}
          />
        </Row>
        <Row label="New cards a day" description="How many cards you have not seen yet are added to each day." error={errors.newPerDay}>
          {numberField('newPerDay', 'New cards a day', 0, 1000)}
        </Row>
        <Row label="Answer buttons" description={value.buttons === 'two' ? 'Again and Good.' : 'Again, Hard, Good and Easy.'}>
          <SegmentedRadioGroup<Settings['buttons']>
            aria-label="Answer buttons"
            value={value.buttons}
            onValueChange={(buttons) => void save({ buttons })}
            fullWidth
            options={[
              { value: 'two', label: 'Two buttons' },
              { value: 'four', label: 'Four buttons' },
            ]}
          />
        </Row>
        <Row label="Day starts at" description="Late-night study counts for the day before.">
          <Select aria-label="Day starts at" value={String(value.dayStartsAt)} options={HOURS} onValueChange={(hour) => void save({ dayStartsAt: Number(hour) })} />
        </Row>
      </Group>
      <Group id="settings-goal" title="Goal" description="What counts as a good day.">
        <Row label="Daily goal" description="Reviews to answer each day; Today shows your progress." error={errors.dailyGoal}>
          {numberField('dailyGoal', 'Daily goal', 1, 5000)}
        </Row>
      </Group>
      <Group id="settings-ai" title="AI help" description="Small judgments Recall can ask the model to make.">
        <Row label="Check typed answers with AI" description="Uses your Decisions budget. Without it only exact answers are recognised and you grade the rest.">
          <Switch aria-label="Check typed answers with AI" checked={value.typedAnswerCheck} onChange={(event) => void save({ typedAnswerCheck: event.target.checked })} />
        </Row>
        <Row label="Suggest decks and tags" description="For cards without a deck. You accept each suggestion.">
          <Switch aria-label="Suggest decks and tags" checked={value.suggestPlacement} onChange={(event) => void save({ suggestPlacement: event.target.checked })} />
        </Row>
      </Group>
    </div>
  )
}
