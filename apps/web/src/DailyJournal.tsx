import { useId, useRef, useState, type FormEvent } from 'react'
import { Node, type Editor, type JSONContent } from '@tiptap/react'
import type { DOMOutputSpec, Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, Selection, TextSelection, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Plus, X } from 'lucide-react'
import { JournalSelect } from './JournalSelect'
import { MealFoodPicker } from './MealFoodPicker'

const meals = [
  ['breakfast', '早餐'],
  ['lunch', '午餐'],
  ['dinner', '晚餐'],
] as const

const bristolTypes = [
  '分散的硬块', '凹凸块状条形', '带裂纹的条形', '光滑柔软的条形',
  '边缘清晰的软块', '边缘不规则的糊状', '水样',
]
const moodOptions = [
  ['很低落', '#7484a4'], ['有点低落', '#8c9caa'], ['平常', '#b39258'],
  ['不错', '#718d61'], ['很好', '#d2994e'],
]
const scores = [1, 2, 3, 4, 5]
const recordDateFormat = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric', month: '2-digit', day: '2-digit',
})

type MealName = (typeof meals)[number][0]
type Expense = { description: string; amount: number | null }
type DailyRecord = {
  date: string
  bristolType: number | null
  moodScore: number | null
}

export type DailyEntry = DailyRecord & {
  meals: { name: MealName; food: string; amount: number | null; place: string }[]
  otherExpenses: Expense[]
  sleepQuality: number | null
}

type LegacyDailyEntry = DailyRecord & {
  breakfast: string
  lunch: string
  dinner: string
  expenseAmount: number | null
  expenseNote: string
  sleepScore: number | null
}

type SavedDailyEntry = DailyEntry | LegacyDailyEntry
const expenseInput = { type: 'number', min: 0, max: 9999999999.99, step: 0.01 } as const

export type MealSuggestions = Record<MealName, string[]>

export function collectMealSuggestions(documents: JSONContent[]): MealSuggestions {
  const history = {
    breakfast: new Map<string, { food: string; count: number; date: string }>(),
    lunch: new Map<string, { food: string; count: number; date: string }>(),
    dinner: new Map<string, { food: string; count: number; date: string }>(),
  }

  function visit(node: JSONContent) {
    if (node.type !== 'dailyJournal') {
      node.content?.forEach(visit)
      return
    }
    const entry = node.attrs?.entry as SavedDailyEntry | null
    if (!entry || typeof entry.date !== 'string') return
    for (const [name] of meals) {
      const saved = 'meals' in entry ? entry.meals?.find((meal) => meal.name === name)?.food : entry[name]
      if (typeof saved !== 'string' || !saved.trim()) continue
      const food = saved.trim().replace(/\s+/g, ' ')
      const key = food.toLowerCase()
      const previous = history[name].get(key)
      const latest = !previous || entry.date >= previous.date
      history[name].set(key, {
        food: latest ? food : previous.food,
        count: (previous?.count ?? 0) + 1,
        date: latest ? entry.date : previous.date,
      })
    }
  }

  documents.forEach(visit)
  const suggestions = (name: MealName) => [...history[name].values()]
    .sort((a, b) => b.count - a.count || b.date.localeCompare(a.date))
    .slice(0, 12)
    .map(({ food }) => food)

  return { breakfast: suggestions('breakfast'), lunch: suggestions('lunch'), dinner: suggestions('dinner') }
}

function numberOrNull(raw: FormDataEntryValue | null | undefined) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

function money(value: number) {
  return `¥ ${value.toFixed(2)}`
}

function totalExpense(amounts: (number | null)[]) {
  let cents = 0
  for (const amount of amounts) {
    if (amount !== null && Number.isFinite(amount)) cents += Math.round(amount * 100)
  }
  return cents / 100
}

function entryTotal(entry: SavedDailyEntry) {
  return totalExpense('meals' in entry
    ? [...entry.meals.map(({ amount }) => amount), ...entry.otherExpenses.map(({ amount }) => amount)]
    : [entry.expenseAmount])
}

function entryRows(entry: SavedDailyEntry): { label: string; value: string; color?: string }[] {
  const rows: { label: string; value: string; color?: string }[] = []
  if ('meals' in entry) {
    for (const [key, label] of meals) {
      const meal = entry.meals.find(({ name }) => name === key)
      if (!meal) continue
      const details = [meal.food, meal.amount === null ? '' : money(meal.amount), meal.place].filter(Boolean)
      if (details.length) rows.push({ label, value: details.join(' · ') })
    }
    for (const { description, amount } of entry.otherExpenses) {
      const details = [description, amount === null ? '' : money(amount)].filter(Boolean)
      if (details.length) rows.push({ label: '其他消费', value: details.join(' · ') })
    }
    if (entry.sleepQuality !== null) rows.push({ label: '睡眠质量', value: String(entry.sleepQuality) })
  } else {
    for (const [key, label] of meals) {
      if (typeof entry[key] === 'string' && entry[key]) rows.push({ label, value: entry[key] })
    }
    if (typeof entry.expenseAmount === 'number' && Number.isFinite(entry.expenseAmount)) {
      rows.push({ label: '消费', value: money(entry.expenseAmount) })
    }
    if (typeof entry.expenseNote === 'string' && entry.expenseNote) rows.push({ label: '消费说明', value: entry.expenseNote })
    if (entry.sleepScore && scores.includes(entry.sleepScore)) rows.push({ label: '睡眠质量', value: `${entry.sleepScore} / 5` })
  }
  if (entry.bristolType && bristolTypes[entry.bristolType - 1]) {
    rows.push({ label: '排便', value: `Type ${entry.bristolType} · ${bristolTypes[entry.bristolType - 1]}` })
  }
  if (entry.moodScore && scores.includes(entry.moodScore)) {
    const [label, color] = moodOptions[entry.moodScore - 1]
    rows.push({ label: '整体心情', value: `${entry.moodScore} / 5 · ${label}`, color })
  }
  return rows
}

type DailySlot = { position: number; host: HTMLDivElement; kind: 'form' | 'prompt'; visible: boolean }
type DailySlotChange = (slots: DailySlot[]) => DailySlot[]
const dailySlotKey = new PluginKey<DailySlot[]>('dailyJournalSlot')

function changeDailySlots(transaction: Transaction, change: DailySlotChange) {
  return transaction.setMeta(dailySlotKey, change)
}

function dailyFormPosition(doc: ProseMirrorNode) {
  const last = doc.lastChild
  const trailingBlank = last?.type.name === 'paragraph' && !last.content.size && !last.attrs.journalTime
  return trailingBlank ? doc.content.size - last.nodeSize : doc.content.size
}

export const DailyJournal = Node.create({
  name: 'dailyJournal',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      entry: {
        default: null,
        parseHTML: (element) => {
          try { return JSON.parse(element.getAttribute('data-daily-journal') ?? 'null') }
          catch { return null }
        },
        renderHTML: ({ entry }) => ({ 'data-daily-journal': JSON.stringify(entry) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'section[data-daily-journal]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const entry = node.attrs.entry as SavedDailyEntry | null
    const rows = (entry ? entryRows(entry) : []).map<DOMOutputSpec>(({ label, value, color }) => {
      const cell: DOMOutputSpec = color
        ? ['td', ['span', { class: 'daily-mood-dot', style: `background: ${color}`, 'aria-hidden': 'true' }], value]
        : ['td', value]
      return ['tr', ['th', { scope: 'row' }, label], cell]
    })

    return ['section', { ...HTMLAttributes, class: 'daily-record' },
      ['header', { class: 'daily-record-heading' }, ['strong', '生活日志'],
        ['span', { class: 'daily-record-date' }, typeof entry?.date === 'string' ? entry.date : '']],
      ['table', ['tbody', ...rows]],
      ...(entry ? [['footer', { class: 'daily-record-total' }, ['span', '当日总花费'], ['strong', money(entryTotal(entry))]] as DOMOutputSpec] : []),
    ]
  },

  renderText({ node }) {
    const entry = node.attrs.entry as SavedDailyEntry | null
    if (!entry || typeof entry.date !== 'string') return '生活日志'
    return [entry.date, ...entryRows(entry).map(({ label, value }) => `${label}：${value}`)].join('\n')
  },

  addProseMirrorPlugins() {
    return [new Plugin<DailySlot[]>({
      key: dailySlotKey,
      state: {
        init: () => [],
        apply(transaction, previous) {
          const change = transaction.getMeta(dailySlotKey) as DailySlotChange | undefined
          const slots = transaction.docChanged ? previous.map((slot) => {
            // Keep each slot before any text entered at or below its insertion point.
            const mapped = transaction.doc.resolve(transaction.mapping.map(slot.position, -1))
            return { ...slot, position: mapped.depth ? mapped.after(1) : mapped.pos }
          }) : previous
          return change ? change(slots) : slots
        },
      },
      appendTransaction(transactions, _previous, state) {
        if (!transactions.some((transaction) => transaction.docChanged)) return null
        const end = state.doc.content.size
        const hasSlotAtEnd = dailySlotKey.getState(state)?.some((slot) => slot.visible && slot.position === end)
        if (!hasSlotAtEnd && state.doc.lastChild?.type.name !== 'dailyJournal') return null
        return state.tr.insert(end, state.schema.nodes.paragraph.create()).setMeta('addToHistory', false)
      },
      props: {
        decorations(state) {
          const slots = dailySlotKey.getState(state)?.filter((slot) => slot.visible) ?? []
          return DecorationSet.create(state.doc, slots.map((slot) => Decoration.widget(slot.position, () => slot.host, {
            key: slot.host.id || 'daily-journal-prompt',
            side: slot.kind === 'prompt' ? 1 : 0,
            ignoreSelection: true,
            stopEvent: () => true,
          })))
        },
      },
    })]
  },
})

export function showDailyPrompt(editor: Editor, prompt: Pick<DailySlot, 'position' | 'host'>) {
  const transaction = changeDailySlots(editor.state.tr, (slots) => [
    ...slots.filter((slot) => slot.kind === 'form'),
    { ...prompt, kind: 'prompt', visible: true },
  ])
  editor.view.dispatch(transaction.setMeta('addToHistory', false).scrollIntoView())
}

export function openDailyForm(editor: Editor, newHost: HTMLDivElement) {
  const transaction = editor.state.tr
  const slots = dailySlotKey.getState(editor.state) ?? []
  const prompt = slots.find((slot) => slot.kind === 'prompt')
  const forms = slots.filter((slot) => slot.kind === 'form')
  const existing = prompt ? forms.find((slot) => slot.position === prompt.position) : forms[forms.length - 1]
  const position = existing?.position ?? prompt?.position ?? dailyFormPosition(transaction.doc)
  const host = existing?.host ?? newHost
  if (position === transaction.doc.content.size) {
    transaction.insert(position, editor.schema.nodes.paragraph.create())
  }
  changeDailySlots(transaction, (mapped) => {
    const drafts = mapped.filter((slot) => slot.kind === 'form')
    if (!existing) return [...drafts, { position, host, kind: 'form', visible: true }]
    return drafts.map((slot) => !prompt || slot.host === host ? { ...slot, visible: true } : slot)
  })
  editor.view.dispatch(transaction.setMeta('preventUpdate', true).setMeta('addToHistory', false))
  return host
}

export function closeDailySlot(editor: Editor, host?: HTMLDivElement) {
  const transaction = changeDailySlots(editor.state.tr, (slots) => slots
    .filter((slot) => slot.kind === 'form' || (host && slot.host !== host))
    .map((slot) => !host || slot.host === host ? { ...slot, visible: false } : slot))
  editor.view.dispatch(transaction.setMeta('addToHistory', false))
  editor.view.focus()
}

export function saveDailyEntry(editor: Editor, host: HTMLDivElement, entry: DailyEntry) {
  const slot = dailySlotKey.getState(editor.state)?.find((item) => item.host === host && item.visible)
  if (slot?.kind !== 'form') return false

  editor.view.focus()
  const { dailyJournal, paragraph } = editor.schema.nodes
  const block = dailyJournal.create({ entry })
  const transaction = editor.state.tr.insert(slot.position, block)
  const after = slot.position + block.nodeSize
  let nextLine = Selection.findFrom(transaction.doc.resolve(after), 1, true)
  if (!nextLine) {
    transaction.insert(after, paragraph.create())
    nextLine = Selection.findFrom(transaction.doc.resolve(after), 1, true)
  }
  if (nextLine) {
    const caret = TextSelection.create(transaction.doc, nextLine.$from.end())
    transaction.setSelection(caret).setStoredMarks([])
  }
  changeDailySlots(transaction, (slots) => slots.filter((item) => item.host !== host))
  editor.view.dispatch(transaction.scrollIntoView())
  return true
}

export function DailyJournalForm({ onSave, onClose, mealSuggestions }: {
  onSave: (entry: DailyEntry) => boolean
  onClose: () => void
  mealSuggestions: MealSuggestions
}) {
  const fieldPrefix = useId()
  const [date] = useState(() => recordDateFormat.format(new Date()))
  const [mood, setMood] = useState('')
  const [error, setError] = useState('')
  const [mealAmounts, setMealAmounts] = useState<Partial<Record<MealName, string>>>({})
  const [otherRows, setOtherRows] = useState([{ id: 0, amount: '' }])
  const nextOtherId = useRef(1)
  const fieldId = (name: string) => `${fieldPrefix}-${name}`
  const total = totalExpense([
    ...Object.values(mealAmounts).map(numberOrNull),
    ...otherRows.map(({ amount }) => numberOrNull(amount)),
  ])

  function addOtherRow() {
    const id = nextOtherId.current++
    setOtherRows((rows) => [...rows, { id, amount: '' }])
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const text = (name: string) => String(data.get(name) ?? '').trim()
    const number = (name: string) => numberOrNull(data.get(name))
    const entry: DailyEntry = {
      date: text('date'),
      meals: meals.map(([name]) => ({
        name, food: text(`${name}Food`), place: text(`${name}Place`), amount: number(`${name}Amount`),
      })).filter(({ food, place, amount }) => food || place || amount !== null),
      otherExpenses: otherRows.map(({ id }) => ({
        description: text(`otherDescription-${id}`), amount: number(`otherAmount-${id}`),
      })).filter(({ description, amount }) => description || amount !== null),
      bristolType: number('bristolType'), sleepQuality: number('sleepQuality'), moodScore: number('moodScore'),
    }
    if (!entryRows(entry).length) {
      setError('至少填写一项记录。')
      return
    }
    if (!onSave(entry)) setError('暂时无法插入日志，请重试。')
  }

  return (
    <form className="daily-record daily-record-form" aria-label="生活日志" onSubmit={save} onInput={() => setError('')}>
      <header className="daily-record-heading">
        <strong>生活日志</strong>
        <input aria-label="记录日期" name="date" type="date" defaultValue={date} required />
      </header>
      <table>
        <tbody>
          {meals.map(([name, label]) => (
            <tr key={name}>
              <th scope="row">{label}</th>
              <td>
                <div className="daily-meal-fields">
                  <MealFoodPicker name={`${name}Food`} label={label} suggestions={mealSuggestions[name]} />
                  <input
                    {...expenseInput}
                    name={`${name}Amount`}
                    aria-label={`${label}金额`}
                    placeholder="金额（元）"
                    value={mealAmounts[name] ?? ''}
                    onChange={(event) => {
                      const amount = event.target.value
                      setMealAmounts((previous) => ({ ...previous, [name]: amount }))
                    }}
                  />
                  <input name={`${name}Place`} aria-label={`${label}消费地点`} type="text" placeholder="在哪消费" maxLength={255} />
                </div>
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row">其他消费</th>
            <td>
              <div className="daily-other-actions">
                <button type="button" className="small-icon" aria-label="添加其他消费" title="添加其他消费" onClick={addOtherRow}>
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
              {otherRows.map(({ id, amount }, index) => (
                <div className="daily-other-expense" key={id}>
                  <input
                    name={`otherDescription-${id}`}
                    aria-label={`其他消费 ${index + 1} 用途`}
                    type="text"
                    placeholder="用途"
                    maxLength={255}
                  />
                  <input
                    {...expenseInput}
                    name={`otherAmount-${id}`}
                    aria-label={`其他消费 ${index + 1} 金额`}
                    placeholder="金额（元）"
                    value={amount}
                    onChange={(event) => {
                      const value = event.target.value
                      setOtherRows((rows) => rows.map((row) => row.id === id ? { ...row, amount: value } : row))
                    }}
                  />
                  <button
                    type="button"
                    className="small-icon"
                    aria-label={`移除其他消费 ${index + 1}`}
                    title="移除这项消费"
                    onClick={() => setOtherRows((rows) => rows.filter((row) => row.id !== id))}
                  ><X size={15} aria-hidden="true" /></button>
                </div>
              ))}
            </td>
          </tr>
          <tr>
            <th scope="row"><label htmlFor={fieldId('bristolType')}>排便</label></th>
            <td>
              <JournalSelect id={fieldId('bristolType')} name="bristolType" defaultValue="">
                <option value="">选择 Bristol 类型</option>
                {bristolTypes.map((type, index) => <option key={type} value={index + 1}>Type {index + 1} · {type}</option>)}
              </JournalSelect>
            </td>
          </tr>
          <tr>
            <th scope="row"><label htmlFor={fieldId('sleepQuality')}>睡眠质量</label></th>
            <td>
              <input id={fieldId('sleepQuality')} name="sleepQuality" type="number" min={0} step="any" placeholder="输入睡眠分数" />
            </td>
          </tr>
          <tr>
            <th scope="row"><label htmlFor={fieldId('moodScore')}>整体心情</label></th>
            <td><div className="daily-mood">
              <JournalSelect id={fieldId('moodScore')} name="moodScore" value={mood} onChange={(event) => setMood(event.target.value)}>
                <option value="">选择心情</option>
                {moodOptions.map(([label], index) => <option key={label} value={index + 1}>{index + 1} / 5 · {label}</option>)}
              </JournalSelect>
              {mood && <span className="daily-mood-dot" style={{ background: moodOptions[Number(mood) - 1][1] }} aria-hidden="true" />}
            </div></td>
          </tr>
        </tbody>
      </table>
      <div className="daily-record-total">
        <span>当日总花费</span>
        <output>{money(total)}</output>
      </div>
      <footer className="daily-record-footer">
        {error && <span className="column-error" role="alert">{error}</span>}
        <button type="button" className="small-icon" aria-label="收起日志表格" title="收起日志表格" onClick={onClose}>
          <X size={15} aria-hidden="true" />
        </button>
        <button type="submit" className="composer-save">保存日志</button>
      </footer>
    </form>
  )
}
