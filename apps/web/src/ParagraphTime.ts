import { Extension } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const idleDelay = 3000
const dateTimeFormat = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'long',
  timeStyle: 'short',
  hourCycle: 'h23',
})

type TimeState = {
  pending: Map<number, number>
  decorations: DecorationSet
  nextDeadline: number | null
}

const timeKey = new PluginKey<TimeState>('journalParagraphTime')

function isTimedBlock(node: ProseMirrorNode | null | undefined): node is ProseMirrorNode {
  return node?.type.name === 'paragraph' || node?.type.name === 'heading'
}

function savedTime(node: ProseMirrorNode) {
  const stamp = node.attrs.journalTime
  if (typeof stamp !== 'string') return null
  const date = new Date(stamp)
  return Number.isFinite(date.getTime()) ? date : null
}

function trackEditedBlocks(transaction: Transaction, previous: Map<number, number>, now: number) {
  const { doc, before, mapping } = transaction
  const pending = new Map<number, number>()

  // Map a block's position through edits that insert or remove preceding text.
  for (const [oldPosition, deadline] of previous) {
    const position = mapping.mapResult(oldPosition, 1)
    const node = doc.nodeAt(position.pos)
    if (!position.deleted && isTimedBlock(node) && node.textContent.trim() && !savedTime(node)) {
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
    if (node.textContent.trim() && !savedTime(node)) {
      const oldPosition = reverse.mapResult(position, 1)
      const oldNode = oldPosition.deleted ? null : before.nodeAt(oldPosition.pos)
      if (!oldNode || oldNode.textContent !== node.textContent) {
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

function timeButton(position: number) {
  return Decoration.widget(position, (view, getPosition) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'journal-time-tag'
    button.textContent = 'time'
    button.title = '为这段文字添加时间'
    button.setAttribute('aria-label', button.title)
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => {
      const anchor = getPosition()
      if (anchor == null || !view.editable) return
      const resolved = view.state.doc.resolve(anchor)
      const block = resolved.parent
      if (!isTimedBlock(block) || savedTime(block)) return

      view.dispatch(view.state.tr.setNodeMarkup(resolved.before(), undefined, {
        ...block.attrs,
        journalTime: new Date().toISOString(),
      }))
    })
    return button
  }, { key: 'journal-time-button', marks: [], ignoreSelection: true, stopEvent: () => true })
}

function timePoint(position: number, date: Date) {
  return Decoration.widget(position, () => {
    const point = document.createElement('span')
    point.className = 'journal-time-point'
    const time = document.createElement('time')
    time.dateTime = date.toISOString()
    time.textContent = dateTimeFormat.format(date)
    point.append(time)
    return point
  }, { key: `journal-time-point-${date.toISOString()}`, marks: [], ignoreSelection: true })
}

function buildState(doc: ProseMirrorNode, pending: Map<number, number>, now: number): TimeState {
  const widgets: Decoration[] = []
  let nextDeadline: number | null = null

  doc.descendants((node, position) => {
    if (!isTimedBlock(node)) return
    const endOfBlock = position + node.nodeSize - 1
    const time = savedTime(node)
    const deadline = pending.get(position)

    if (time) {
      widgets.push(timePoint(endOfBlock, time))
    } else if (deadline != null) {
      if (deadline <= now) widgets.push(timeButton(endOfBlock))
      else nextDeadline = Math.min(nextDeadline ?? deadline, deadline)
    }
    return false
  })

  return { pending, decorations: DecorationSet.create(doc, widgets), nextDeadline }
}

export const ParagraphTime = Extension.create({
  name: 'paragraphTime',

  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: { journalTime: { default: null, rendered: false, keepOnSplit: false } },
    }]
  },

  addProseMirrorPlugins() {
    return [new Plugin<TimeState>({
      key: timeKey,
      state: {
        init: (_, state) => buildState(state.doc, new Map(), Date.now()),
        apply: (transaction, previous) => {
          if (!transaction.docChanged && !transaction.getMeta(timeKey)) return previous
          const now = Date.now()
          const pending = transaction.docChanged ? trackEditedBlocks(transaction, previous.pending, now) : previous.pending
          return buildState(transaction.doc, pending, now)
        },
      },
      props: {
        decorations: (state) => timeKey.getState(state)?.decorations,
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
