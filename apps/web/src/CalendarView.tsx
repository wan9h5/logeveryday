import { useMemo } from 'react'
import type { JSONContent } from '@tiptap/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ApiDocument } from './api'
import { entryRows, type SavedDailyEntry } from './DailyJournal'

const dayFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
})
const clockFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const weekdays = ['一', '二', '三', '四', '五', '六', '日']

export type CalendarAnchor = { path: number[]; stamp?: string }

type CalendarItem = {
  document: ApiDocument
  anchor: CalendarAnchor
  text: string
  time?: string
  entry?: SavedDailyEntry
  heading?: boolean
}

function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const stamp = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(stamp.getTime()) && stamp.toISOString().slice(0, 10) === value
}

function headingDay(text: string) {
  const match = text.match(/^(\d{4})(?:年\s*|[-/])(\d{1,2})(?:月\s*|[-/])(\d{1,2})(?:日|\b)/)
  if (!match) return undefined
  const value = [match[1], match[2].padStart(2, '0'), match[3].padStart(2, '0')].join('-')
  return validDay(value) ? value : undefined
}

function textOf(node: JSONContent): string {
  if (node.type === 'hardBreak') return '\n'
  return node.text ?? node.content?.map(textOf).join('') ?? ''
}

function calendarIndex(documents: ApiDocument[]) {
  const byDate = new Map<string, CalendarItem[]>()
  const append = (date: string, item: CalendarItem) => {
    const items = byDate.get(date) ?? []
    items.push(item)
    byDate.set(date, items)
  }

  for (const document of documents) {
    function visitBlocks(blocks: JSONContent[], parent: number[], initialDay?: string) {
      let sectionDay = initialDay
      blocks.forEach((node, index) => {
        const path = [...parent, index]
        if (node.type === 'dailyJournal') {
          const entry = node.attrs?.entry as SavedDailyEntry | undefined
          if (entry && validDay(entry.date)) append(entry.date, { document, anchor: { path }, text: '生活日志', entry })
        } else if (node.type === 'heading' || node.type === 'paragraph' || node.type === 'codeBlock') {
          const text = textOf(node).trim()
          if (!text) return
          const explicitDay = node.type === 'heading' ? headingDay(text) : undefined
          if (explicitDay) sectionDay = explicitDay
          const raw = node.attrs?.journalTime
          const stamp = typeof raw === 'string' ? new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw) ? raw : `${raw}Z`) : null
          const validStamp = stamp && Number.isFinite(stamp.getTime()) ? stamp : null
          const day = validStamp ? dayFormat.format(validStamp) : sectionDay
          if (day) append(day, { document, anchor: { path, stamp: validStamp ? raw : undefined }, text,
            heading: node.type === 'heading', time: validStamp ? clockFormat.format(validStamp) : undefined })
        } else if (node.content) {
          visitBlocks(node.content, path, sectionDay)
        }
      })
    }
    visitBlocks(document.content_json.content ?? [], [])
  }
  return byDate
}

function monthDate(month: string, shift = 0) {
  const date = new Date(`${month}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + shift)
  return date
}

export function CalendarView({ documents, onOpen, status, selection, onSelect }: {
  documents: ApiDocument[]
  onOpen: (id: string, anchor: CalendarAnchor) => void
  status: 'loading' | 'ready' | 'error'
  selection: string | null
  onSelect: (date: string) => void
}) {
  const today = dayFormat.format(new Date())
  const selected = selection ?? today
  const month = selected.slice(0, 7)
  const first = monthDate(month)
  const next = monthDate(month, 1)
  const days = (next.getTime() - first.getTime()) / 86_400_000
  const leading = (first.getUTCDay() + 6) % 7
  const index = useMemo(() => calendarIndex(documents), [documents])
  const entries = index.get(selected) ?? []

  function openDay(date: string) {
    onSelect(date)
    const timed = index.get(date)?.filter((item) => item.anchor.stamp)
    if (timed?.length === 1) onOpen(timed[0].document.id, timed[0].anchor)
  }

  return (
    <div className="feature-view journal-calendar">
      <header className="calendar-heading">
        <h1>日历</h1>
        <button type="button" className="toolbar-button" onClick={() => onSelect(today)}>今天</button>
      </header>
      <section className="calendar-card" aria-label="月历">
        <div className="calendar-month-nav">
          <button type="button" className="icon-button" aria-label="上个月"
            onClick={() => onSelect(monthDate(month, -1).toISOString().slice(0, 10))}><ChevronLeft size={17} aria-hidden="true" /></button>
          <h2>{first.getUTCFullYear()} 年 {first.getUTCMonth() + 1} 月</h2>
          <button type="button" className="icon-button" aria-label="下个月"
            onClick={() => onSelect(next.toISOString().slice(0, 10))}><ChevronRight size={17} aria-hidden="true" /></button>
        </div>
        <div className="calendar-week">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">
          {Array.from({ length: leading }, (_, i) => <span key={`blank-${i}`} aria-hidden="true" />)}
          {Array.from({ length: days }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, '0')}`
            const count = index.get(date)?.length ?? 0
            return (
              <button key={date} type="button" className={date === today ? 'today' : ''}
                aria-current={date === today ? 'date' : undefined} aria-pressed={date === selected}
                aria-label={count ? `${date}，${count} 条记录` : date}
                onClick={() => openDay(date)}>
                <strong>{i + 1}</strong>
                {count > 0 && <small aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </section>
      <section className="calendar-entries" aria-labelledby="calendar-day">
        <h2 id="calendar-day">{selected} 的记录</h2>
        {entries.length ? (
          <ul className="calendar-records">
            {entries.map(({ document, anchor, text, entry, time, heading }) => (
              <li key={`${document.id}:${anchor.path.join('.')}`}>
                <div className="calendar-record-meta">
                  <span>{document.title}</span>
                  <button type="button" className="toolbar-button" onClick={() => onOpen(document.id, anchor)}>
                    {time ? `跳到 ${time}` : '打开原文'}
                  </button>
                </div>
                {entry || heading ? <h3>{text}</h3> : <p className="calendar-record-text">{text}</p>}
                {entry && <dl className="calendar-record-fields">{entryRows(entry).map(({ label, value }, i) => (
                  <div key={`${label}-${i}`}><dt>{label}</dt><dd>{value}</dd></div>
                ))}</dl>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="insights-notice" role="status">
            {status === 'loading' ? '正在加载记录…' : status === 'error' ? '记录暂时无法加载。' : '这一天还没有记录。'}
          </p>
        )}
      </section>
    </div>
  )
}
