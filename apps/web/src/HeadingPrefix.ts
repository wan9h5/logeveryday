import { Extension, getText, getTextSerializersFromSchema, type JSONContent } from '@tiptap/react'
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const liveHeadingKey = new PluginKey<boolean>('liveHeading')
const headingPattern = /^(#{1,6})(?:[ \t]|$)/
const markerFor = (level: number) => `${'#'.repeat(level)} `

function prefixOf(node: ProseMirrorNode) {
  return node.type.name === 'heading' && node.attrs.sourceLevel
    ? headingPattern.exec(node.textBetween(0, node.content.size, '\n', '\ufffc'))
    : null
}

export function headingText(node: ProseMirrorNode) {
  return node.textContent.slice(prefixOf(node)?.[0].length ?? 0)
}

export function headingTextPosition(node: ProseMirrorNode, start: number) {
  return start + 1 + (prefixOf(node)?.[0].length ?? 0)
}

function isBlankParagraph(node: JSONContent) {
  return node.type === 'paragraph' && !node.content?.length
    && Object.values(node.attrs ?? {}).every((value) => value == null)
}

function collapseTrailingBlankParagraphs(doc: JSONContent): JSONContent {
  const blocks = doc.content
  if (doc.type !== 'doc' || !blocks?.length || !isBlankParagraph(blocks[blocks.length - 1])) return doc

  let end = blocks.length
  while (end > 1 && isBlankParagraph(blocks[end - 2])) end -= 1
  return end === blocks.length ? doc : { ...doc, content: blocks.slice(0, end) }
}

export function editableJournal(content: JSONContent): JSONContent {
  const normalized = collapseTrailingBlankParagraphs(content)
  const children = normalized.content?.map(editableJournal)
  if (normalized.type !== 'heading') return children ? { ...normalized, content: children } : normalized
  const level = Math.max(1, Math.min(6, Number(content.attrs?.level) || 1))
  return {
    ...content,
    attrs: { ...content.attrs, level, sourceLevel: level },
    content: [{ type: 'text', text: markerFor(level) }, ...(children ?? [])],
  }
}

function storedFragment(fragment: Fragment, openStart = 0, selectedPrefixLength?: number): Fragment {
  const children: ProseMirrorNode[] = []
  fragment.forEach((node, _, index) => {
    const partialStart = index === 0 && openStart > 0
    if (node.type.name === 'heading' && node.attrs.sourceLevel) {
      const prefixLength = partialStart && selectedPrefixLength !== undefined
        ? Math.min(selectedPrefixLength, node.content.size)
        : prefixOf(node)?.[0].length ?? 0
      children.push(node.type.create(
        { ...node.attrs, sourceLevel: null },
        node.content.cut(prefixLength),
        node.marks,
      ))
    } else {
      children.push(node.isLeaf ? node : node.copy(storedFragment(
        node.content, partialStart ? openStart - 1 : 0, selectedPrefixLength,
      )))
    }
  })
  return Fragment.fromArray(children)
}

function withoutSourceLevel({ attrs, content, ...node }: JSONContent): JSONContent {
  if (attrs) {
    const { sourceLevel: _sourceLevel, ...storedAttrs } = attrs
    node.attrs = storedAttrs
  }
  if (content) node.content = content.map(withoutSourceLevel)
  return node
}

export function journalSnapshot(doc: ProseMirrorNode) {
  const stored = doc.copy(storedFragment(doc.content))
  return {
    content_json: collapseTrailingBlankParagraphs(withoutSourceLevel(stored.toJSON())),
    search_text: getText(stored, { textSerializers: getTextSerializersFromSchema(stored.type.schema) }),
  }
}

function normalizeHeadings(state: EditorState) {
  const headings: { node: ProseMirrorNode; position: number }[] = []
  state.doc.descendants((node, position) => {
    if (node.type.name === 'heading') headings.push({ node, position })
  })
  const transaction = state.tr
  for (const { node, position } of headings.reverse()) {
    const { level, sourceLevel } = node.attrs
    if (!sourceLevel) {
      transaction.insert(position + 1, state.schema.text(markerFor(level)))
      transaction.setNodeMarkup(position, undefined, { ...node.attrs, sourceLevel: level })
      continue
    }

    const prefix = prefixOf(node)
    if (!prefix) {
      transaction.setNodeMarkup(position, state.schema.nodes.paragraph, node.attrs)
      continue
    }
    const textLevel = prefix[1].length
    if (level !== sourceLevel && textLevel === sourceLevel) {
      // Commands that change the heading level must also update the inline syntax.
      transaction.replaceWith(position + 1, position + 1 + prefix[0].length, state.schema.text(markerFor(level)))
      transaction.setNodeMarkup(position, undefined, { ...node.attrs, sourceLevel: level })
    } else if (textLevel !== level || textLevel !== sourceLevel) {
      transaction.setNodeMarkup(position, undefined, { ...node.attrs, level: textLevel, sourceLevel: textLevel })
    }
  }
  return transaction.docChanged ? transaction : null
}

export const HeadingPrefix = Extension.create({
  name: 'headingPrefix',
  priority: 1100,

  addGlobalAttributes() {
    return [{
      types: ['heading'],
      attributes: { sourceLevel: { default: null, rendered: false, keepOnSplit: false } },
    }]
  },

  addProseMirrorPlugins() {
    return [new Plugin<boolean>({
      key: liveHeadingKey,
      state: {
        init: () => false,
        apply(transaction, focused) {
          if (transaction.getMeta('focus')) return true
          if (transaction.getMeta('blur')) return false
          return focused
        },
      },
      appendTransaction(transactions, _, state) {
        return transactions.some((transaction) => transaction.docChanged) ? normalizeHeadings(state) : null
      },
      props: {
        decorations(state) {
          const { $from, $to } = state.selection
          const active = liveHeadingKey.getState(state) && $from.parent === $to.parent ? $from.parent : null
          const decorations: Decoration[] = []
          state.doc.descendants((node, position) => {
            const prefix = prefixOf(node)
            if (!prefix) return
            decorations.push(Decoration.inline(position + 1, position + 1 + prefix[0].length, {
              class: node === active ? 'heading-prefix' : 'heading-prefix is-hidden',
            }))
            return false
          })
          return DecorationSet.create(state.doc, decorations)
        },
        transformCopied(slice, view) {
          // Block copies use the same rendered content as storage. A selection of
          // literal characters inside a heading still copies those characters.
          const { $from } = view.state.selection
          const prefix = prefixOf($from.parent)
          const selectedPrefixLength = prefix ? Math.max(0, prefix[0].length - $from.parentOffset) : undefined
          return new Slice(storedFragment(slice.content, slice.openStart, selectedPrefixLength), slice.openStart, slice.openEnd)
        },
        handleKeyDown(view, event) {
          if (event.key !== 'Backspace' || event.isComposing || view.composing || !view.editable
            || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
          const { $from, empty } = view.state.selection
          const prefix = empty ? prefixOf($from.parent) : null
          if (!prefix || !liveHeadingKey.getState(view.state)) return false

          const hashes = prefix[1].length
          if ($from.parentOffset === prefix[0].length && prefix[0].length > hashes) {
            // At the first title character, move left of the Markdown separator.
            const start = $from.start()
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start + hashes)))
            return true
          }
          if ($from.parentOffset === 1 && hashes === 1) {
            view.dispatch(view.state.tr.delete($from.start(), $from.start() + prefix[0].length))
            return true
          }
          return false
        },
      },
    })]
  },
})
