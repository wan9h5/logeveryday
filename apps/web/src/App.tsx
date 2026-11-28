import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextStyle from '@tiptap/extension-text-style'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { ArrowDownToLine, CalendarDays, Check, ChevronDown, Inbox, LayoutGrid, Plus, Settings, Sparkles, Type, Upload, X } from 'lucide-react'
import { api, type ApiDocument } from './api'
import { DocumentColumns } from './DocumentColumns'
import { JournalDialog } from './JournalDialog'
import { InsightsView, WeeklySummary } from './InsightsView'
import { SavePositionPicker, type SavePosition } from './SavePositionPicker'
import { FloatingTextToolbar } from './FloatingTextToolbar'
import { ColumnTheme, JournalFontSize, columnThemeStyle } from './editorStyle'
import { ParagraphTime, journalTimeNextLine } from './ParagraphTime'
import { ClearMarksOnEnter } from './ClearMarksOnEnter'
import { DailyJournal, DailyJournalForm, closeDailySlot, collectMealSuggestions, openDailyForm, saveDailyEntry, showDailyPrompt, type DailyEntry, type MealSuggestions } from './DailyJournal'
import { HeadingPrefix, editableJournal, headingText, headingTextPosition } from './HeadingPrefix'
import { useJournalDocuments, type SaveState } from './useJournalDocuments'

type PluginId = 'daily' | 'mood' | 'bristol' | 'expense' | 'image'
type View = 'inbox' | 'calendar' | 'insights'

const journalEditorProps = {
  scrollThreshold: { top: 0, right: 0, bottom: 72, left: 0 },
  scrollMargin: { top: 5, right: 5, bottom: 96, left: 5 },
}

function focusDailyForm(host: HTMLDivElement) {
  host.scrollIntoView({ block: 'start', inline: 'nearest' })
  host.querySelector<HTMLInputElement>('input[name="breakfastFood"]')?.focus({ preventScroll: true })
}

const pluginMeta: Record<PluginId, { icon: string; label: string; description: string }> = {
  daily: { icon: '📅', label: '今日记录', description: '插入今天的日期标题' },
  mood: { icon: '😊', label: '心情', description: '记录今天的心情分数' },
  bristol: { icon: '💩', label: '排便', description: '选择 Bristol 类型' },
  expense: { icon: '💰', label: '消费', description: '记录一笔消费' },
  image: { icon: '🖼️', label: '图片', description: '上传一张图片' },
}

function CalendarView({ documents, onOpen }: { documents: ApiDocument[]; onOpen: (id: string) => void }) {
  const days = Array.from({ length: 30 }, (_, i) => i + 1)
  return <div className="feature-view"><div className="feature-heading"><div><div className="eyebrow">CALENDAR</div><h1>2026年 9月</h1><p>把生活放回时间里，回看每一天留下的痕迹。</p></div><button className="toolbar-button"><CalendarDays size={16} /> 今天</button></div><div className="calendar-card"><div className="calendar-week">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({ length: 1 }).map((_, i) => <span key={`empty-${i}`} />)}{days.map((day) => <button key={day} className={`${day === 19 ? 'today' : ''} ${[3, 7, 12, 16, 19, 24, 28].includes(day) ? 'has-entry' : ''}`} onClick={() => day === 19 && documents[0] && onOpen(documents[0].id)}><strong>{day}</strong>{[3, 7, 12, 16, 19, 24, 28].includes(day) && <small />}</button>)}</div></div><div className="calendar-entries"><div className="section-heading"><span>最近记录</span><span className="line" /></div>{documents.slice(0, 3).map((doc) => <button key={doc.id} className="calendar-entry" onClick={() => onOpen(doc.id)}><span className="entry-date">19<span>周六</span></span><span><strong>{doc.title}</strong><small>{new Date(doc.updated_at).toLocaleDateString('zh-CN')}</small></span><ChevronDown size={15} /></button>)}</div></div>
}

function JournalEditor({ doc, documents, getDraft, saveState, onEdit, onSave }: {
  doc: ApiDocument
  documents: ApiDocument[]
  getDraft: () => ProseMirrorNode | undefined
  saveState: SaveState
  onEdit: (doc: ProseMirrorNode) => void
  onSave: () => void
}) {
  const [moduleMenu, setModuleMenu] = useState(false)
  const modulePickerRef = useRef<HTMLDivElement>(null)
  const [moduleError, setModuleError] = useState('')
  const [showComposer, setShowComposer] = useState(false)
  const [composerText, setComposerText] = useState('')
  const [composerPosition, setComposerPosition] = useState<SavePosition>('bottom')
  const paneRef = useRef<HTMLElement>(null)
  const bottomAnchorRef = useRef<HTMLDivElement>(null)
  const [showJumpToBottom, setShowJumpToBottom] = useState(false)
  const [dailyMode, setDailyMode] = useState(false)
  const [dailyForms, setDailyForms] = useState<HTMLDivElement[]>([])
  const dailyFormId = useRef(0)
  const pendingFormFocus = useRef<HTMLDivElement | null>(null)
  const [dailyPrompt, setDailyPrompt] = useState<{ position: number; host: HTMLDivElement } | null>(null)
  const [mealSuggestions, setMealSuggestions] = useState<MealSuggestions>({ breakfast: [], lunch: [], dinner: [] })

  useLayoutEffect(() => {
    const pane = paneRef.current
    const anchor = bottomAnchorRef.current
    if (!pane || !anchor) return

    pane.scrollTop = 0
    const observer = new IntersectionObserver(([entry]) => {
      setShowJumpToBottom(!entry.isIntersecting)
    }, { root: pane })
    observer.observe(anchor)
    return () => observer.disconnect()
  }, [])

  const jumpToBottom = () => {
    const pane = paneRef.current
    if (!pane) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    pane.focus({ preventScroll: true })
    pane.scrollTo({ top: pane.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  const [editorContent] = useState<JSONContent | undefined>(() => {
    const draft = getDraft()
    const content: JSONContent | undefined = draft?.toJSON()
      ?? (doc.content_json.type === 'doc' ? editableJournal(doc.content_json) : undefined)
    const blocks = content?.content
    if (blocks?.[blocks.length - 1]?.type === 'dailyJournal') {
      return { ...content, content: [...blocks, { type: 'paragraph' }] }
    }
    return content
  })
  const editor = useEditor({
    editorProps: journalEditorProps,
    extensions: [
      StarterKit, Underline, TextStyle, Color, JournalFontSize, ColumnTheme, ParagraphTime, HeadingPrefix, ClearMarksOnEnter, DailyJournal,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: '从今天发生的第一件事开始记录…' }),
    ],
    content: editorContent,
    onTransaction: ({ transaction }) => {
      if (!dailyMode) return
      const position = journalTimeNextLine(transaction)
      if (position === null) return
      const host = dailyPrompt?.host ?? document.createElement('div')
      host.className = 'daily-record-shortcut'
      setDailyPrompt({ position, host })
    },
    onUpdate: ({ editor: currentEditor }) => {
      onEdit(currentEditor.state.doc)
    },
  })

  useLayoutEffect(() => {
    const host = pendingFormFocus.current
    if (!host) return
    pendingFormFocus.current = null
    focusDailyForm(host)
  }, [dailyForms])

  useLayoutEffect(() => {
    if (editor && dailyPrompt) showDailyPrompt(editor, dailyPrompt)
  }, [editor, dailyPrompt])

  const showDailyForm = () => {
    if (!editor) return
    const newHost = document.createElement('div')
    newHost.className = 'daily-record-slot'
    newHost.id = `daily-form-${++dailyFormId.current}`
    const host = openDailyForm(editor, newHost)
    setDailyPrompt(null)
    const otherDocuments = documents.filter((item) => item.id !== doc.id).map((item) => item.content_json)
    setMealSuggestions(collectMealSuggestions([editor.getJSON(), ...otherDocuments]))
    if (host === newHost) {
      pendingFormFocus.current = host
      setDailyForms((forms) => [...forms, host])
    } else {
      focusDailyForm(host)
    }
  }

  const hideDailySlot = (host?: HTMLDivElement) => {
    if (!editor) return
    closeDailySlot(editor, host)
    if (!host || host === dailyPrompt?.host) setDailyPrompt(null)
  }

  const enterDailyMode = () => {
    setDailyMode(true)
    showDailyForm()
  }

  const returnToQuickNotes = () => {
    if (!dailyMode) return
    hideDailySlot()
    setDailyMode(false)
  }

  const saveDaily = (host: HTMLDivElement, entry: DailyEntry) => {
    if (!editor || !saveDailyEntry(editor, host, entry)) return false
    setDailyForms((forms) => forms.filter((form) => form !== host))
    onSave()
    return true
  }

  useEffect(() => {
    if (!moduleMenu) return

    const closeOutside = (event: PointerEvent) => {
      const picker = modulePickerRef.current
      if (!picker || !event.composedPath().includes(picker)) setModuleMenu(false)
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      modulePickerRef.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')?.focus()
      setModuleMenu(false)
    }

    document.addEventListener('pointerdown', closeOutside, true)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [moduleMenu])

  const headings = useMemo(() => {
    if (!editor) return []
    const result: { level: number; text: string; position: number }[] = []
    editor.state.doc.descendants((node, position) => {
      if (node.type.name !== 'heading') return
      const text = headingText(node).trim()
      if (text) result.push({ level: node.attrs.level as number, text, position: headingTextPosition(node, position) })
    })
    return result
  }, [editor?.state.doc])

  const insertModuleContent = (content: string | JSONContent) => {
    editor?.chain().focus().insertContent(content).run()
  }

  const addRecord = (id: PluginId) => {
    setModuleMenu(false)
    if (id === 'daily') {
      const today = new Date()
      const title = today.toLocaleDateString('zh-CN', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
      })
      insertModuleContent({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] })
      return
    }
    if (id === 'image') {
      insertModuleContent('<p>🖼️ 图片占位 · 点击上传图片</p>')
      return
    }

    const { icon, label } = pluginMeta[id]
    insertModuleContent({
      type: 'paragraph',
      content: [{ type: 'text', text: `${icon} ${label}：待填写` }],
    })

    setModuleError('')
    if (id === 'mood') {
      void api.createMood({ score: 4, color: '#F3A86F', note: '不错' })
        .catch(() => setModuleError('心情记录保存失败'))
    }
    if (id === 'bristol') {
      void api.createBristol({ bristol_type: 4, note: '正常香肠状' })
        .catch(() => setModuleError('排便记录保存失败'))
    }
  }

  const saveComposer = () => {
    const text = composerText.trim()
    if (!text || !editor) return false
    const position = composerPosition === 'top' ? 0 : editor.state.doc.content.size
    const inserted = editor.commands.insertContentAt(position, {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text }],
    })
    if (inserted) {
      setComposerText('')
      onSave()
    }
    return inserted
  }

  return (
    <>
      <div className={`journal-frame${dailyMode ? ' is-daily-mode' : ''}`}>
        <main ref={paneRef} tabIndex={-1} className="editor-pane" style={columnThemeStyle(doc.content_json)}>
          <div className="editor-header">
            <div>
              <div className="breadcrumb">我的文档</div>
              <h2><span className="column-title-mark" aria-hidden="true" />{doc.title}</h2>
            </div>
          </div>
          <div className="editor-toolbar">
            <button className="toolbar-button new-entry-button" onClick={() => { setShowComposer(true); setComposerPosition('bottom') }}>
              <Plus size={17} />新增
            </button>
            <div className="toolbar-group module-picker" ref={modulePickerRef}>
              <button
                className="toolbar-button module-trigger"
                aria-expanded={moduleMenu}
                aria-controls="module-picker"
                onClick={() => setModuleMenu((open) => !open)}
              >
                <Sparkles size={15} />模块<ChevronDown size={13} />
              </button>
              <div className={`insert-menu${moduleMenu ? ' is-open' : ''}`} id="module-picker" aria-hidden={!moduleMenu}>
                {(Object.keys(pluginMeta) as PluginId[]).map((id) => (
                  <button
                    key={id}
                    tabIndex={moduleMenu ? 0 : -1}
                    onClick={() => addRecord(id)}
                  >
                    <span>{pluginMeta[id].icon}</span>
                    <span>
                      <strong>{pluginMeta[id].label}</strong>
                      <small>{pluginMeta[id].description}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="toolbar-divider" />
            <div className="toolbar-group format-group">
              <button
                aria-label="加粗"
                aria-pressed={editor?.isActive('bold') ?? false}
                data-tooltip="加粗"
                onClick={() => editor?.chain().focus().toggleBold().run()}
                className={editor?.isActive('bold') ? 'format-active' : ''}
              ><strong>B</strong></button>
              <button
                aria-label="斜体"
                aria-pressed={editor?.isActive('italic') ?? false}
                data-tooltip="斜体"
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                className={editor?.isActive('italic') ? 'format-active' : ''}
              ><em>I</em></button>
              <button
                aria-label="下划线"
                aria-pressed={editor?.isActive('underline') ?? false}
                data-tooltip="下划线"
                onClick={() => editor?.chain().focus().toggleUnderline().run()}
                className={editor?.isActive('underline') ? 'format-active' : ''}
              ><u>U</u></button>
              <button
                aria-label="删除线"
                aria-pressed={editor?.isActive('strike') ?? false}
                data-tooltip="删除线"
                onClick={() => editor?.chain().focus().toggleStrike().run()}
                className={editor?.isActive('strike') ? 'format-active' : ''}
              ><s>S</s></button>
              <button
                aria-label="文字颜色"
                data-tooltip="文字颜色"
                onClick={() => editor?.chain().focus().setColor('#ef6b5b').run()}
                className="color-button"
              >A</button>
              <button
                aria-label="文字背景色"
                aria-pressed={editor?.isActive('highlight', { color: '#fff0c6' }) ?? false}
                data-tooltip="文字背景色"
                onClick={() => editor?.chain().focus().toggleHighlight({ color: '#fff0c6' }).run()}
                className="highlight-button"
              >A</button>
            </div>
            <div className="toolbar-divider" />
            <div className="toolbar-group">
              <button className="toolbar-button secondary"><Upload size={16} />图片</button>
              <button className="toolbar-button secondary"><Type size={16} />格式</button>
            </div>
          </div>
          <div className="editor-body">
            <nav className="document-outline" aria-label="文档大纲">
              {headings.length > 0 ? (
                <ol className="outline-list">
                  {headings.map(({ level, text, position }) => (
                    <li key={position}>
                      <button
                        type="button"
                        className={`outline-item level-${level}`}
                        title={text}
                        onClick={() => editor?.chain().focus(position).scrollIntoView().run()}
                      >
                        <span className="outline-level">H{level}</span>
                        <span className="outline-item-title">{text}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="outline-empty">输入 <kbd>#</kbd> 和空格创建标题</p>
              )}
            </nav>
            <div className="editor-scroll">
              <article className="document">
                <EditorContent editor={editor} />
                {editor && <FloatingTextToolbar editor={editor} />}
                {moduleError && <p className="column-error" role="alert">{moduleError}</p>}
              </article>
            </div>
          </div>
          <div className="journal-save-status" role="status">
            {saveState === 'saved' && <><Check size={14} aria-hidden="true" />已保存</>}
            {saveState === 'pending' && '待保存'}
            {saveState === 'saving' && '保存中…'}
            {saveState === 'error' && <button className="column-error" onClick={onSave}>保存失败 · 重试</button>}
          </div>
          <div ref={bottomAnchorRef} className="journal-bottom-anchor" aria-hidden="true" />
        </main>
        <div className="journal-mode-switch" role="group" aria-label="记录模式">
          <button type="button" aria-pressed={!dailyMode} onClick={returnToQuickNotes} disabled={!editor}>随记模式</button>
          <button type="button" aria-pressed={dailyMode} onClick={enterDailyMode} disabled={!editor}>日志模式</button>
        </div>
        {showJumpToBottom && (
          <button type="button" className="toolbar-button journal-jump-bottom" onClick={jumpToBottom}>
            <ArrowDownToLine size={15} aria-hidden="true" />到底部
          </button>
        )}
      </div>
      {dailyPrompt && createPortal(
        <>
          <button type="button" className="toolbar-button" onClick={showDailyForm}>
            <Plus size={15} aria-hidden="true" />填写日志
          </button>
          <button type="button" className="small-icon" aria-label="关闭填写日志提示" title="关闭填写日志提示" onClick={() => hideDailySlot(dailyPrompt.host)}>
            <X size={15} aria-hidden="true" />
          </button>
        </>, dailyPrompt.host,
      )}
      {dailyForms.map((host) => createPortal(
        <DailyJournalForm onSave={(entry) => saveDaily(host, entry)} onClose={() => hideDailySlot(host)} mealSuggestions={mealSuggestions} />,
        host, host.id,
      ))}
      <aside className="summary-pane">
        <WeeklySummary documents={documents} />
      </aside>
      {showComposer && (
        <JournalDialog
          className="composer-dialog"
          labelledBy="composer-dialog-title"
          closeOnBackdrop
          onClose={() => setShowComposer(false)}
        >
          {(close) => (
            <form onSubmit={(event) => { event.preventDefault(); if (saveComposer()) close() }}>
              <div className="composer-head">
                <h3 id="composer-dialog-title"><Sparkles size={17} />新增日志</h3>
                <button className="icon-button" type="button" aria-label="关闭" onClick={close}><X size={18} /></button>
              </div>
              <textarea
                autoFocus
                aria-label="日志内容"
                aria-describedby="composer-keyboard-hint"
                value={composerText}
                placeholder="写下今天想记录的内容…"
                onChange={(event) => setComposerText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
              />
              <div className="composer-actions">
                <span id="composer-keyboard-hint">Enter 保存 · Shift + Enter 换行</span>
                <div>
                  <SavePositionPicker value={composerPosition} onChange={setComposerPosition} />
                  <button className="composer-save" type="submit" disabled={!composerText.trim() || !editor}>保存</button>
                </div>
              </div>
            </form>
          )}
        </JournalDialog>
      )}
    </>
  )
}

function App() {
  const journal = useJournalDocuments()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [view, setView] = useState<View>('inbox')
  const active = journal.documents.find((doc) => doc.id === activeId) ?? journal.documents[0]

  const openDocument = (id: string) => {
    if (view === 'inbox' && active && active.id !== id) journal.save(active.id)
    setActiveId(id)
    setView('inbox')
  }

  const openView = (next: View) => {
    if (view === 'inbox' && next !== 'inbox' && active) journal.save(active.id)
    setView(next)
  }

  const createColumn = async (title: string, themeColor: string) => {
    const id = await journal.create(title, themeColor)
    openDocument(id)
  }

  const deleteColumn = async (id: string) => {
    await journal.remove(id)
    setActiveId((current) => current === id ? null : current)
  }

  return (
    <div className="app-shell">
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-scroll">
            <div className="sidebar-head">
              <div className="eyebrow">WORKSPACE</div>
              <div className="workspace-title">我的生活 <ChevronDown size={14} /></div>
            </div>
            <div className="sidebar-nav">
              <button className={`nav-item ${view === 'inbox' ? 'active' : ''}`} onClick={() => openView('inbox')}>
                <Inbox size={17} />收件箱<span className="count">{journal.documents.length}</span>
              </button>
              <button className={`nav-item ${view === 'calendar' ? 'active' : ''}`} onClick={() => openView('calendar')}>
                <CalendarDays size={17} />日历
              </button>
              <button className={`nav-item ${view === 'insights' ? 'active' : ''}`} onClick={() => openView('insights')}>
                <LayoutGrid size={17} />统计中心
              </button>
            </div>
            <DocumentColumns
              documents={journal.documents}
              activeId={view === 'inbox' ? active?.id : undefined}
              loadState={journal.loadState}
              retryLoad={journal.retryLoad}
              onOpen={openDocument}
              onCreate={createColumn}
              onRename={journal.rename}
              onDelete={deleteColumn}
            />
          </div>
          <div className="sidebar-bottom">
            <button type="button" className="nav-item" onClick={() => setShowSettings(true)}>
              <Settings size={17} aria-hidden="true" />设置
            </button>
          </div>
        </aside>
        {view === 'inbox' && active ? (
          <JournalEditor
            key={active.id}
            doc={active}
            documents={journal.documents}
            getDraft={() => journal.getDraft(active.id)}
            saveState={journal.saveStates[active.id] ?? 'saved'}
            onEdit={(content) => journal.edit(active.id, content)}
            onSave={() => journal.save(active.id)}
          />
        ) : (
          <>
            <main className="editor-pane">
              {view === 'calendar' && <CalendarView documents={journal.documents} onOpen={openDocument} />}
              {view === 'insights' && <InsightsView documents={journal.documents} />}
              {view === 'inbox' && (
                <div className="document column-placeholder">
                  {journal.loadState === 'ready' && '点左侧的 + 新建栏目，开始写日志。'}
                  {journal.loadState === 'loading' && '正在加载栏目…'}
                  {journal.loadState === 'error' && '日记服务暂时无法连接。'}
                </div>
              )}
            </main>
            <aside className="summary-pane" aria-hidden="true" />
          </>
        )}
      </div>
      {showSettings && (
        <JournalDialog
          className="settings-modal"
          labelledBy="settings-dialog-title"
          closeOnBackdrop
          onClose={() => setShowSettings(false)}
        >
          {(close) => (
            <>
              <div className="modal-head">
                <div><div className="eyebrow">PREFERENCES</div><h3 id="settings-dialog-title">设置</h3></div>
                <button className="icon-button" aria-label="关闭" onClick={close}><X size={18} /></button>
              </div>
              <div className="setting-row">
                <div><strong>每日提醒</strong><small>提醒自己记录今天发生的事</small></div>
                <div className="toggle on"><span /></div>
              </div>
              <div className="setting-row">
                <div><strong>提醒时间</strong><small>每天提醒一次</small></div>
                <span className="time-chip">22:30</span>
              </div>
              <div className="setting-row">
                <div><strong>自动保存</strong><small>停止编辑 5 秒后保存</small></div>
                <div className="toggle on"><span /></div>
              </div>
            </>
          )}
        </JournalDialog>
      )}
    </div>
  )
}

export default App
