import { useId, useState, type MouseEvent } from 'react'
import { BubbleMenu, type Editor } from '@tiptap/react'
import { Bold, Check, ChevronDown, Highlighter, Italic, Strikethrough, Underline } from 'lucide-react'
import { FONT_SIZES } from './editorStyle'

type Panel = 'size' | 'foreground' | 'background'

const textColors = [
  ['墨黑', '#243243'], ['灰蓝', '#526b82'], ['雾蓝', '#3b74a5'], ['海青', '#347e83'],
  ['松绿', '#377047'], ['陶棕', '#975730'], ['莓红', '#a43755'],
]
const highlightColors = [
  ['浅蓝', '#d9e9f5'], ['浅青', '#d4efec'], ['浅绿', '#dcecd5'], ['浅黄', '#fff0c6'],
  ['浅橙', '#fbe1cb'], ['浅粉', '#f6dce5'], ['浅灰', '#e7ebf0'],
]

const keepSelection = (event: MouseEvent<HTMLButtonElement>) => event.preventDefault()

export function FloatingTextToolbar({ editor }: { editor: Editor }) {
  const [panel, setPanel] = useState<Panel | null>(null)
  const [hex, setHex] = useState('')
  const panelId = useId()
  const style = editor.getAttributes('textStyle')
  const currentHighlight = editor.getAttributes('highlight').color as string | undefined
  const isBackground = panel === 'background'
  const currentColor = isBackground ? currentHighlight : style.color as string | undefined
  const hexDigits = hex.trim().replace(/^#/, '')
  const validHex = /^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hexDigits)

  const togglePanel = (next: Panel) => {
    setPanel((previous) => previous === next ? null : next)
    setHex('')
  }

  const changeSize = (size: string | null) => {
    editor.chain().focus().setMark('textStyle', { fontSize: size }).removeEmptyTextStyle().run()
    setPanel(null)
  }

  const changeColor = (color: string | null) => {
    const chain = editor.chain().focus()
    if (isBackground) {
      if (color) chain.setHighlight({ color }).run()
      else chain.unsetHighlight().run()
    } else {
      if (color) chain.setColor(color).run()
      else chain.unsetColor().run()
    }
    setPanel(null)
  }

  const markButtons = [
    { mark: 'bold', Icon: Bold, label: '加粗', run: () => editor.chain().focus().toggleBold().run() },
    { mark: 'italic', Icon: Italic, label: '斜体', run: () => editor.chain().focus().toggleItalic().run() },
    { mark: 'underline', Icon: Underline, label: '下划线', run: () => editor.chain().focus().toggleUnderline().run() },
    { mark: 'strike', Icon: Strikethrough, label: '删除线', run: () => editor.chain().focus().toggleStrike().run() },
  ]

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="selectionFormatting"
      updateDelay={80}
      shouldShow={({ editor: current, view, state, element, from, to }) =>
        current.isEditable && !state.selection.empty && state.doc.textBetween(from, to).trim().length > 0
        && (view.hasFocus() || element.contains(document.activeElement))}
      tippyOptions={{
        placement: 'top-end',
        // Tippy moves this DOM node. Its buttons still need to bubble to the React root.
        appendTo: () => editor.view.dom.closest<HTMLElement>('.app-shell')
          ?? editor.view.dom.parentElement ?? editor.view.dom,
        offset: [0, 8],
        maxWidth: 'calc(100vw - 24px)',
        theme: 'journal-format',
        arrow: false,
        duration: [160, 140],
        zIndex: 12,
        onHide: () => { setPanel(null) },
      }}
    >
      <div className="floating-format">
        <div className="floating-format-tools format-group" role="group" aria-label="选中文字格式">
          <button
            type="button"
            data-tooltip="字号"
            aria-label="字号"
            aria-expanded={panel === 'size'}
            aria-controls={panel === 'size' ? panelId : undefined}
            onMouseDown={keepSelection}
            onClick={() => togglePanel('size')}
          >
            {style.fontSize ?? '字号'} <ChevronDown size={13} aria-hidden="true" />
          </button>
          {markButtons.map(({ mark, Icon, label, run }) => (
            <button
              key={mark}
              type="button"
              aria-label={label}
              aria-pressed={editor.isActive(mark)}
              data-tooltip={label}
              onMouseDown={keepSelection}
              onClick={run}
            ><Icon size={16} aria-hidden="true" /></button>
          ))}
          <button
            type="button"
            className="floating-text-color"
            aria-label="文字颜色"
            aria-expanded={panel === 'foreground'}
            aria-controls={panel === 'foreground' ? panelId : undefined}
            data-tooltip="文字颜色"
            style={{ textDecorationColor: style.color ?? '#3b74a5' }}
            onMouseDown={keepSelection}
            onClick={() => togglePanel('foreground')}
          >A</button>
          <button
            type="button"
            aria-label="背景颜色"
            aria-expanded={panel === 'background'}
            aria-controls={panel === 'background' ? panelId : undefined}
            data-tooltip="背景颜色"
            onMouseDown={keepSelection}
            onClick={() => togglePanel('background')}
          ><Highlighter size={16} style={{ backgroundColor: currentHighlight }} aria-hidden="true" /></button>
        </div>
        {panel === 'size' && (
          <div className="floating-format-panel floating-sizes" id={panelId}>
            <button type="button" onMouseDown={keepSelection} onClick={() => changeSize(null)}>默认</button>
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={style.fontSize === size}
                onMouseDown={keepSelection}
                onClick={() => changeSize(size)}
              >{size}</button>
            ))}
          </div>
        )}
        {(panel === 'foreground' || panel === 'background') && (
          <div className="floating-format-panel" id={panelId}>
            <div className="floating-color-grid" aria-label={isBackground ? '推荐背景色' : '推荐文字色'}>
              {(isBackground ? highlightColors : textColors).map(([label, color]) => (
                <button
                  type="button"
                  key={color}
                  title={`${label} ${color}`}
                  aria-label={label}
                  aria-pressed={currentColor?.toLowerCase() === color}
                  style={{ backgroundColor: color }}
                  onMouseDown={keepSelection}
                  onClick={() => changeColor(color)}
                >{currentColor?.toLowerCase() === color && <Check size={14} aria-hidden="true" />}</button>
              ))}
            </div>
            <form
              className="floating-hex"
              onSubmit={(event) => { event.preventDefault(); if (validHex) changeColor(`#${hexDigits.toLowerCase()}`) }}
            >
              <input
                aria-label="十六进制色号"
                placeholder={isBackground ? '#FFF0C6' : '#3B74A5'}
                value={hex}
                maxLength={7}
                spellCheck={false}
                onChange={(event) => setHex(event.target.value)}
              />
              <button type="submit" disabled={!validHex}>应用</button>
              <button type="button" onMouseDown={keepSelection} onClick={() => changeColor(null)}>清除</button>
            </form>
          </div>
        )}
      </div>
    </BubbleMenu>
  )
}
