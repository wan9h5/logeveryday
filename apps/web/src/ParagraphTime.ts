import { Extension } from '@tiptap/react'
import { isHistoryTransaction } from '@tiptap/pm/history'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Mapping } from '@tiptap/pm/transform'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { headingText, headingTextPosition } from './HeadingPrefix'

const idleDelay = 3000
const fadeOutDuration = 180
const fadeOutCleanupDelay = fadeOutDuration + 40
const dateTimeFormat = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23',
})

type TimeTag = {
  position: number
  blankLines: number
  removeAt?: number
}

type TimeState = {
  pending: Map<number, number>
  tag: TimeTag | null
  decorations: DecorationSet
  nextDeadline: number | null
}

const timeKey = new PluginKey<TimeState>('journalParagraphTime')

export function journalTimeNextLine(transaction: Transaction) {
  if (transaction.getMeta(timeKey) !== 'stamp') return null
  return transaction.selection.$from.before(1)
}

function isTimedBlock(node: ProseMirrorNode | null | undefined): node is ProseMirrorNode {
  return node?.type.name === 'paragraph' || node?.type.name === 'heading'
}

function readTime(stamp: unknown) {
  if (typeof stamp !== 'string') return null
  const date = new Date(stamp)
  return Number.isFinite(date.getTime()) ? date : null
}

const savedTime = (node: ProseMirrorNode) => readTime(node.attrs.journalTime)

function contentChanged(before: ProseMirrorNode, after: ProseMirrorNode) {
  // The editable Markdown prefix is syntax; compare the heading's actual content.
  const beforeContent = before.content.cut(headingTextPosition(before, 0) - 1)
  const afterContent = after.content.cut(headingTextPosition(after, 0) - 1)
  return before.type !== after.type || before.attrs.level !== after.attrs.level || !beforeContent.eq(afterContent)
}

function stampEditedRecords(transactions: readonly Transaction[], before: EditorState, after: EditorState) {
  if (before.doc.eq(after.doc) || transactions.some((transaction) => {
    const original = transaction.getMeta('appendedTransaction') as Transaction | undefined
    return isHistoryTransaction(transaction) || (original && isHistoryTransaction(original))
  })) return null

  const mapping = new Mapping()
  for (const transaction of transactions) mapping.appendMapping(transaction.mapping)
  const reverse = mapping.invert()
  const update = after.tr
  const now = new Date().toISOString()

  after.doc.descendants((node, position) => {
    if (!isTimedBlock(node)) return
    if (savedTime(node)) {
      const previous = before.doc.nodeAt(reverse.map(position, 1))
      if (isTimedBlock(previous) && previous.attrs.journalTime === node.attrs.journalTime
        && contentChanged(previous, node) && node.attrs.journalUpdatedAt !== now) {
        update.setNodeMarkup(position, undefined, { ...node.attrs, journalUpdatedAt: now })
      }
    }
    return false
  })

  return update.docChanged ? update : null
}

function trackEditedBlocks(transaction: Transaction, previous: Map<number, number>, now: number) {
  const { doc, before, mapping } = transaction
  const pending = new Map<number, number>()

  // Map a block's position through edits that insert or remove preceding text.
  for (const [oldPosition, deadline] of previous) {
    const position = mapping.mapResult(oldPosition, 1)
    const node = doc.nodeAt(position.pos)
    if (!position.deleted && isTimedBlock(node) && headingText(node).trim() && !savedTime(node)) {
      pending.set(position.pos, deadline)
    }
  }

  const start = before.content.findDiffStart(doc.content)
  if (start == null || start >= doc.content.size) return pending
  const end = before.content.findDiffEnd(doc.content)
  const to = Math.min(doc.content.size, Math.max(start + 1, end?.b ?? start))
  const reverse = mapping.invert()

  doc.nodesBetween(start, to, (node, position) => {
    if (!isTimedBlock(node)) return
    const text = headingText(node).trim()
    if (text && !savedTime(node)) {
      const oldPosition = reverse.mapResult(position, 1)
      const oldNode = oldPosition.deleted ? null : before.nodeAt(oldPosition.pos)
      if (!oldNode || headingText(oldNode).trim() !== text) {
        pending.set(position, now + idleDelay)
      } else if (savedTime(oldNode)) {
        // Undoing a time marker makes the button available again.
        pending.set(position, now)
      }
    }
    return false
  })

  return pending
}

function trailingBlankLines(node: ProseMirrorNode) {
  let blankLines = 0
  for (let index = node.childCount - 1; index >= 0; index -= 1) {
    const child = node.child(index)
    if (child.type.name === 'hardBreak') blankLines += 1
    else if (!child.isText || child.text?.trim()) break
  }
  return blankLines
}

function mapTimeTag(tag: TimeTag | null, transaction: Transaction): TimeTag | null {
  if (!tag) return null
  const position = transaction.mapping.mapResult(tag.position, 1)
  const node = transaction.doc.nodeAt(position.pos)
  if (position.deleted || !isTimedBlock(node) || savedTime(node) || !headingText(node).trim()) return null
  return { ...tag, position: position.pos }
}

function timeButton(position: number) {
  return Decoration.widget(position, (view, getPosition) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'journal-time-rail journal-time-tag'
    const label = document.createElement('span')
    label.textContent = 'time'
    button.append(label)
    button.title = '为这段文字添加时间'
    button.setAttribute('aria-label', button.title)
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => {
      const anchor = getPosition()
      if (anchor == null || !view.editable) return
      const resolved = view.state.doc.resolve(anchor)
      const tag = timeKey.getState(view.state)?.tag
      if (!tag || tag.removeAt !== undefined || tag.position !== resolved.before()) return
      const block = resolved.parent
      if (!isTimedBlock(block) || savedTime(block)) return

      const transaction = view.state.tr.setNodeMarkup(tag.position, undefined, {
        ...block.attrs,
        journalTime: new Date().toISOString(),
        journalUpdatedAt: null,
      })
      const after = resolved.after()
      const next = Selection.findFrom(transaction.doc.resolve(after), 1, true)
      if (!next) transaction.insert(after, view.state.schema.nodes.paragraph.create())

      const caret = next ? headingTextPosition(next.$from.parent, next.$from.before()) : after + 1
      view.focus()
      view.dispatch(transaction
        .setSelection(TextSelection.create(transaction.doc, caret))
        .setStoredMarks([])
        .scrollIntoView()
        .setMeta(timeKey, 'stamp'))
    })
    return button
  }, { key: 'journal-time-button', marks: [], ignoreSelection: true, stopEvent: () => true })
}

function timeLine(date: Date, label?: string) {
  const line = document.createElement('span')
  line.className = 'journal-time-line'
  if (label) {
    const caption = document.createElement('span')
    caption.className = 'journal-time-caption'
    caption.textContent = label
    line.append(caption)
  }
  const time = document.createElement('time')
  time.dateTime = date.toISOString()
  time.textContent = dateTimeFormat.format(date)
  line.append(time)
  return line
}

function timePoint(position: number, date: Date, updatedAt: Date | null) {
  return Decoration.widget(position, () => {
    const point = document.createElement('span')
    point.className = 'journal-time-rail journal-time-point'
    point.addEventListener('mousedown', (event) => event.preventDefault())
    point.append(timeLine(date))
    if (updatedAt) point.append(timeLine(updatedAt, '更新时间'))
    return point
  }, {
    key: `journal-time-point-${date.toISOString()}-${updatedAt?.toISOString() ?? ''}`,
    marks: [],
    ignoreSelection: true,
    stopEvent: () => true,
  })
}

function pendingTimeOnOpen(doc: ProseMirrorNode, now: number) {
  let lastUntimed: number | undefined
  doc.descendants((node, position) => {
    if (!isTimedBlock(node)) return
    if (savedTime(node)) lastUntimed = undefined
    else if (headingText(node).trim()) lastUntimed = position
    return false
  })
  const pending = new Map<number, number>()
  if (lastUntimed !== undefined) pending.set(lastUntimed, now + idleDelay)
  return pending
}

function buildState(doc: ProseMirrorNode, pending: Map<number, number>, now: number, previousTag: TimeTag | null = null): TimeState {
  const widgets: Decoration[] = []
  let lastEdited = -1
  let showAfter = 0
  for (const [position, deadline] of pending) {
    lastEdited = Math.max(lastEdited, position)
    showAfter = Math.max(showAfter, deadline)
  }
  let nextDeadline = showAfter > now ? showAfter : null
  let tag: TimeTag | null = null
  const lastBlock = nextDeadline === null && lastEdited >= 0 ? doc.nodeAt(lastEdited) : null
  if (isTimedBlock(lastBlock)) {
    tag = { position: lastEdited, blankLines: trailingBlankLines(lastBlock) }
  } else if (previousTag) {
    // Keep the old line and its offset while the button fades.
    const removeAt = previousTag.removeAt ?? now + fadeOutCleanupDelay
    if (removeAt > now) {
      tag = { ...previousTag, removeAt }
      nextDeadline = Math.min(nextDeadline ?? removeAt, removeAt)
    }
  }

  doc.descendants((node, position) => {
    if (!isTimedBlock(node)) return
    // Keep the widget before the text so it cannot create a trailing caret line.
    const railAnchor = position + 1
    const time = savedTime(node)
    if (time) {
      const updatedAt = readTime(node.attrs.journalUpdatedAt)
      widgets.push(
        Decoration.node(position, position + node.nodeSize, {
          class: updatedAt ? 'journal-time-block has-time has-update' : 'journal-time-block has-time',
        }),
        timePoint(railAnchor, time, updatedAt),
      )
    } else if (tag?.position === position) {
      widgets.push(
        Decoration.node(position, position + node.nodeSize, {
          class: tag.removeAt === undefined ? 'journal-time-block' : 'journal-time-block is-time-fading',
          style: `--journal-time-blank-lines: ${tag.blankLines}; --journal-time-fade-duration: ${fadeOutDuration}ms`,
        }),
        timeButton(railAnchor),
      )
    }
    return false
  })

  return { pending, tag, decorations: DecorationSet.create(doc, widgets), nextDeadline }
}

export const ParagraphTime = Extension.create({
  name: 'paragraphTime',

  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        journalTime: { default: null, rendered: false, keepOnSplit: false },
        journalUpdatedAt: { default: null, rendered: false, keepOnSplit: false },
      },
    }]
  },

  addProseMirrorPlugins() {
    return [new Plugin<TimeState>({
      key: timeKey,
      appendTransaction: stampEditedRecords,
      state: {
        init: (_, state) => {
          const now = Date.now()
          return buildState(state.doc, pendingTimeOnOpen(state.doc, now), now)
        },
        apply: (transaction, previous) => {
          const timeAction = transaction.getMeta(timeKey)
          if (!transaction.docChanged && !timeAction) return previous
          const now = Date.now()
          const pending = timeAction === 'stamp' ? new Map<number, number>() : previous.pending
          const edited = transaction.docChanged ? trackEditedBlocks(transaction, pending, now) : pending
          const tag = timeAction === 'stamp' ? null : mapTimeTag(previous.tag, transaction)
          return buildState(transaction.doc, edited, now, tag)
        },
      },
      props: {
        decorations: (state) => timeKey.getState(state)?.decorations,
        handleDOMEvents: {
          mousedown: (view, event) => {
            if (event.target !== view.dom || !view.state.doc.textContent.trim()) return false
            event.preventDefault()
            return true
          },
        },
      },
      view: (view) => {
        let timer: number | undefined

        const reveal = () => {
          if (view.composing) {
            timer = window.setTimeout(reveal, 150)
            return
          }
          view.dispatch(view.state.tr.setMeta(timeKey, true).setMeta('addToHistory', false))
        }

        const schedule = () => {
          window.clearTimeout(timer)
          const deadline = timeKey.getState(view.state)?.nextDeadline
          if (deadline != null) timer = window.setTimeout(reveal, Math.max(0, deadline - Date.now()))
        }

        schedule()
        return {
          update: (_, previousState) => {
            if (timeKey.getState(view.state) !== timeKey.getState(previousState)) schedule()
          },
          destroy: () => window.clearTimeout(timer),
        }
      },
    })]
  },
})
