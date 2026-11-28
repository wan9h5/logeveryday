import { Extension } from '@tiptap/core'
import { Plugin, TextSelection } from '@tiptap/pm/state'

export const ClearMarksOnEnter = Extension.create({
  name: 'clearMarksOnEnter',
  priority: 1000,

  addProseMirrorPlugins() {
    const plugin: Plugin = new Plugin({
      props: {
        handleKeyDown(view, event) {
          if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey
            || event.isComposing || view.composing || !view.editable) return false

          // Keep the normal Enter behavior for paragraphs, lists and code blocks.
          let reachedThisPlugin = false
          const handled = view.someProp('handleKeyDown', (handler) => {
            if (reachedThisPlugin) return handler(view, event)
            reachedThisPlugin = handler === plugin.props.handleKeyDown
            return false
          })
          if (!handled) return false

          const { selection, storedMarks } = view.state
          const cursor = selection instanceof TextSelection ? selection.$cursor : null
          if (cursor && (storedMarks ?? cursor.marks()).length) {
            view.dispatch(view.state.tr.setStoredMarks([]).setMeta('addToHistory', false))
          }
          return true
        },
      },
    })
    return [plugin]
  },
})
