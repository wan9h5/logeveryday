import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextStyle from '@tiptap/extension-text-style'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { ArrowDownToLine, CalendarDays, Check, ChevronDown, Inbox, LayoutGrid, PanelLeftClose, Plus, Search, Settings, Sparkles, Type, Upload, X } from 'lucide-react'
import { api, type ApiDocument } from './api'
import { DocumentColumns } from './DocumentColumns'
import { JournalDialog } from './JournalDialog'
import { JournalSelect } from './JournalSelect'
import { SavePositionPicker, type SavePosition } from './SavePositionPicker'
import { FloatingTextToolbar } from './FloatingTextToolbar'
import { ColumnTheme, JournalFontSize, columnThemeStyle } from './editorStyle'
import { ParagraphTime } from './ParagraphTime'
import { useJournalDocuments, type SaveState } from './useJournalDocuments'

type PluginId = 'daily' | 'mood' | 'bristol' | 'expense' | 'image' | 'sleep'
type View = 'inbox' | 'calendar' | 'insights'
type ModulePlacement = 'cursor' | 'bottom'

const pluginMeta: Record<PluginId, { icon: string; label: string; description: string }> = {
  daily: { icon: '📅', label: '今日记录', description: '插入今天的日期标题' },
  mood: { icon: '😊', label: '心情', description: '记录今天的心情分数' },
  bristol: { icon: '💩', label: '排便', description: '选择 Bristol 类型' },
  expense: { icon: '💰', label: '消费', description: '记录一笔消费' },
  image: { icon: '🖼️', label: '图片', description: '上传一张图片' },
  sleep: { icon: '🌙', label: '睡眠', description: '记录入睡和起床时间' },
}

function CalendarView({ documents, onOpen }: { documents: ApiDocument[]; onOpen: (id: string) => void }) {
  const days = Array.from({ length: 30 }, (_, i) => i + 1)
  return <div className="feature-view"><div className="feature-heading"><div><div className="eyebrow">CALENDAR</div><h1>2026年 9月</h1><p>把生活放回时间里，回看每一天留下的痕迹。</p></div><button className="toolbar-button"><CalendarDays size={16} /> 今天</button></div><div className="calendar-card"><div className="calendar-week">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({ length: 1 }).map((_, i) => <span key={`empty-${i}`} />)}{days.map((day) => <button key={day} className={`${day === 19 ? 'today' : ''} ${[3, 7, 12, 16, 19, 24, 28].includes(day) ? 'has-entry' : ''}`} onClick={() => day === 19 && documents[0] && onOpen(documents[0].id)}><strong>{day}</strong>{[3, 7, 12, 16, 19, 24, 28].includes(day) && <small />}</button>)}</div></div><div className="calendar-entries"><div className="section-heading"><span>最近记录</span><span className="line" /></div>{documents.slice(0, 3).map((doc) => <button key={doc.id} className="calendar-entry" onClick={() => onOpen(doc.id)}><span className="entry-date">19<span>周六</span></span><span><strong>{doc.title}</strong><small>{new Date(doc.updated_at).toLocaleDateString('zh-CN')}</small></span><ChevronDown size={15} /></button>)}</div></div>
}

function InsightsView({ backendOnline }: { backendOnline: boolean }) {
  const [period, setPeriod] = useState('month')
  const [summary, setSummary] = useState({ total: 0, by_category: [] as { category: string; total: number }[] })
  useEffect(() => { if (backendOnline) api.expenseInsights(period).then(setSummary).catch(() => undefined) }, [backendOnline, period])
  const fallback = [{ category: '餐饮', total: 182 }, { category: '交通', total: 86 }, { category: '其他', total: 60.5 }]
  const rows = summary.by_category.length ? summary.by_category : fallback
  const total = summary.total || rows.reduce((sum, item) => sum + item.total, 0)
  return <div className="feature-view"><div className="feature-heading"><div><div className="eyebrow">INSIGHTS</div><h1>统计中心</h1><p>用温柔的数字，看看最近的生活节奏。</p></div><div className="period-switch">{['day', 'week', 'month', 'quarter', 'year'].map((item) => <button key={item} className={period === item ? 'selected' : ''} onClick={() => setPeriod(item)}>{({ day: '日', week: '周', month: '月', quarter: '季度', year: '年' } as Record<string, string>)[item]}</button>)}</div></div><div className="insight-cards"><div className="insight-card primary"><span>本期消费</span><strong>¥ {total.toFixed(2)}</strong><small>{backendOnline ? '来自数据库实时统计' : '演示数据 · 连接后实时统计'}</small></div><div className="insight-card"><span>平均心情</span><strong>4.2 <em>↗</em></strong><small>比上期稳定</small></div><div className="insight-card"><span>记录天数</span><strong>5 / 7</strong><small>保持你的节奏</small></div></div><div className="chart-card"><div className="chart-head"><h3>消费分类</h3><span>¥ {total.toFixed(2)}</span></div><div className="bars">{rows.map((row) => <div className="bar-row" key={row.category}><span>{row.category}</span><div><i style={{ width: `${Math.max(10, Math.round((row.total / total) * 100))}%` }} /></div><strong>¥ {row.total.toFixed(2)}</strong></div>)}</div></div></div>
}

function JournalEditor({ doc, saveState, onEdit, retrySave }: {
  doc: ApiDocument
  saveState: SaveState
  onEdit: (content: Pick<ApiDocument, 'content_json' | 'search_text'>) => void
  retrySave: () => void
}) {
  const [moduleMenu, setModuleMenu] = useState<ModulePlacement | null>(null)
  const modulePickerRef = useRef<HTMLDivElement>(null)
  const [moduleError, setModuleError] = useState('')
  const [showComposer, setShowComposer] = useState(false)
  const [composerText, setComposerText] = useState('')
  const [composerPosition, setComposerPosition] = useState<SavePosition>('bottom')
  const [sleepPlacement, setSleepPlacement] = useState<ModulePlacement | null>(null)
  const [sleepStart, setSleepStart] = useState('22:30')
  const [sleepEnd, setSleepEnd] = useState('07:00')

  const editor = useEditor({
    extensions: [
      StarterKit, Underline, TextStyle, Color, JournalFontSize, ColumnTheme, ParagraphTime,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: '从今天发生的第一件事开始记录…' }),
    ],
    content: doc.content_json.type === 'doc' ? doc.content_json : undefined,
    onUpdate: ({ editor: currentEditor }) => {
      onEdit({ content_json: currentEditor.getJSON(), search_text: currentEditor.getText() })
    },
  })

  useEffect(() => {
    if (!moduleMenu) return

    const closeOutside = (event: PointerEvent) => {
      const picker = modulePickerRef.current
      if (!picker || !event.composedPath().includes(picker)) setModuleMenu(null)
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      modulePickerRef.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')?.focus()
      setModuleMenu(null)
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
      if (node.type.name === 'heading') {
        result.push({ level: node.attrs.level as number, text: node.textContent, position: position + 1 })
      }
    })
    return result
  }, [editor?.state.doc])

  const insertModuleContent = (content: string | JSONContent, placement: ModulePlacement) => {
    if (!editor) return
    const chain = editor.chain().focus()
    if (placement === 'bottom') {
      chain.insertContentAt(editor.state.doc.content.size, content).run()
    } else {
      chain.insertContent(content).run()
    }
  }

  const addRecord = (id: PluginId, placement: ModulePlacement) => {
    setModuleMenu(null)
    if (id === 'sleep') {
      setSleepPlacement(placement)
      return
    }
    if (id === 'daily') {
      const today = new Date()
      const title = today.toLocaleDateString('zh-CN', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
      })
      insertModuleContent({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] }, placement)
      return
    }
    if (id === 'image') {
      insertModuleContent('<p>🖼️ 图片占位 · 点击上传图片</p>', placement)
      return
    }

    const { icon, label } = pluginMeta[id]
    insertModuleContent({
      type: 'paragraph',
      content: [{ type: 'text', text: `${icon} ${label}：待填写` }],
    }, placement)

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
    if (inserted) setComposerText('')
    return inserted
  }

  const saveSleep = () => {
    if (!sleepPlacement) return
    insertModuleContent({
      type: 'paragraph',
      content: [{ type: 'text', text: `🌙 睡眠：${sleepStart} — ${sleepEnd}` }],
    }, sleepPlacement)
    setModuleError('')
    void api.createRecord('sleep', { sleep_start: sleepStart, sleep_end: sleepEnd })
      .catch(() => setModuleError('睡眠记录保存失败'))
  }

  return (
    <>
      <main className="editor-pane" style={columnThemeStyle(doc.content_json)}>
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
              aria-expanded={moduleMenu === 'cursor'}
              aria-controls={moduleMenu === 'cursor' ? 'module-picker' : undefined}
              onClick={() => setModuleMenu(moduleMenu === 'cursor' ? null : 'cursor')}
            >
              <Sparkles size={15} />模块<ChevronDown size={13} />
            </button>
            <button
              className="toolbar-button bottom-insert"
              title="追加模块到文档底部"
              aria-expanded={moduleMenu === 'bottom'}
              aria-controls={moduleMenu === 'bottom' ? 'module-picker' : undefined}
              onClick={() => setModuleMenu(moduleMenu === 'bottom' ? null : 'bottom')}
            >
              <ArrowDownToLine size={16} />底部模块
            </button>
            <div className={`insert-menu${moduleMenu ? ' is-open' : ''}`} id="module-picker" aria-hidden={!moduleMenu}>
              {(Object.keys(pluginMeta) as PluginId[]).map((id) => (
                <button
                  key={id}
                  tabIndex={moduleMenu ? 0 : -1}
                  onClick={() => { if (moduleMenu) addRecord(id, moduleMenu) }}
                >
                  <span>{pluginMeta[id].icon}</span>
                  <span>
                    <strong>{pluginMeta[id].label}</strong>
                    <small>{moduleMenu === 'bottom' ? '追加到文档底部' : pluginMeta[id].description}</small>
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
        <div className="editor-scroll">
          <article className="document">
            <EditorContent editor={editor} />
            {editor && <FloatingTextToolbar editor={editor} />}
            {moduleError && <p className="column-error" role="alert">{moduleError}</p>}
            <div className="document-footer">
              <span aria-live="polite">
                {saveState === 'saved' && <><Check size={14} /> 已保存</>}
                {saveState === 'saving' && '保存中…'}
                {saveState === 'error' && <button className="column-error" onClick={retrySave}>保存失败 · 重试</button>}
              </span>
              <span>Markdown · 富文本</span>
            </div>
          </article>
        </div>
      </main>
      <aside className="outline-pane"><div className="outline-title"><span>本页目录</span><span className="outline-count">{headings.length}</span></div><div className="outline-list">{headings.map((heading) => <button key={heading.position} className={`outline-item level-${heading.level}`} onClick={() => editor?.chain().focus(heading.position).scrollIntoView().run()}>{heading.text}</button>)}</div><div className="quick-stats"><div className="quick-stats-title">本周小结 <Sparkles size={14} /></div><div className="stat-row"><span>记录天数</span><strong>5 / 7</strong></div><div className="stat-row"><span>平均心情</span><strong className="warm">4.2 <span>↗</span></strong></div><div className="stat-row"><span>本周消费</span><strong>¥ 328.50</strong></div></div></aside>
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
      {sleepPlacement && (
        <JournalDialog
          className="settings-modal sleep-modal"
          labelledBy="sleep-dialog-title"
          closeOnBackdrop
          onClose={() => setSleepPlacement(null)}
        >
          {(close) => (
            <form onSubmit={(event) => { event.preventDefault(); saveSleep(); close() }}>
              <div className="modal-head">
                <div><div className="eyebrow">LIFE MODULE</div><h3 id="sleep-dialog-title">🌙 记录睡眠</h3></div>
                <button type="button" className="icon-button" aria-label="关闭" onClick={close}><X size={18} /></button>
              </div>
              <p className="sleep-help">选择今天的入睡和起床时间，保存后会插入日志正文。</p>
              <div className="sleep-fields">
                <label>
                  入睡时间
                  <JournalSelect value={sleepStart} onChange={(event) => setSleepStart(event.target.value)}>
                    {['22:00', '22:30', '23:00', '23:30', '00:00', '00:30', '01:00'].map((time) => <option key={time}>{time}</option>)}
                  </JournalSelect>
                </label>
                <span>至</span>
                <label>
                  起床时间
                  <JournalSelect value={sleepEnd} onChange={(event) => setSleepEnd(event.target.value)}>
                    {['05:30', '06:00', '06:30', '07:00', '07:30', '08:00', '08:30'].map((time) => <option key={time}>{time}</option>)}
                  </JournalSelect>
                </label>
              </div>
              <button className="sleep-save" type="submit">保存睡眠记录</button>
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
  const [search, setSearch] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [view, setView] = useState<View>('inbox')
  const active = journal.documents.find((doc) => doc.id === activeId) ?? journal.documents[0]

  const openDocument = (id: string) => {
    setActiveId(id)
    setView('inbox')
  }

  const createColumn = async (title: string, themeColor: string) => {
    const id = await journal.create(title, themeColor)
    setSearch('')
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
          <div className="sidebar-head"><div><div className="eyebrow">WORKSPACE</div><div className="workspace-title">我的生活 <ChevronDown size={14} /></div></div><button className="icon-button"><PanelLeftClose size={17} /></button></div>
          <div className="sidebar-nav">
            <button className={`nav-item ${view === 'inbox' ? 'active' : ''}`} onClick={() => setView('inbox')}>
              <Inbox size={17} />收件箱<span className="count">{journal.documents.length}</span>
            </button>
            <button className={`nav-item ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')}>
              <CalendarDays size={17} />日历
            </button>
            <button className={`nav-item ${view === 'insights' ? 'active' : ''}`} onClick={() => setView('insights')}>
              <LayoutGrid size={17} />统计中心
            </button>
          </div>
          <DocumentColumns
            documents={journal.documents}
            activeId={view === 'inbox' ? active?.id : undefined}
            search={search}
            loadState={journal.loadState}
            retryLoad={journal.retryLoad}
            onOpen={openDocument}
            onCreate={createColumn}
            onRename={journal.rename}
            onDelete={deleteColumn}
          />
          <div className="sidebar-bottom"><button className="nav-item" onClick={() => setShowSettings(true)}><Settings size={17} />设置</button><div className="storage"><div className="storage-label"><span>空间使用</span><span>12%</span></div><div className="storage-bar"><span /></div></div></div>
        </aside>
        {view === 'inbox' && active ? (
          <JournalEditor
            key={active.id}
            doc={active}
            saveState={journal.saveStates[active.id] ?? 'saved'}
            onEdit={(content) => journal.edit(active.id, content)}
            retrySave={() => journal.save(active.id)}
          />
        ) : (
          <>
            <main className="editor-pane">
              {view === 'calendar' && <CalendarView documents={journal.documents} onOpen={openDocument} />}
              {view === 'insights' && <InsightsView backendOnline={journal.loadState === 'ready'} />}
              {view === 'inbox' && (
                <div className="document column-placeholder">
                  {journal.loadState === 'ready' && '点左侧的 + 新建栏目，开始写日志。'}
                  {journal.loadState === 'loading' && '正在加载栏目…'}
                  {journal.loadState === 'error' && '日记服务暂时无法连接。'}
                </div>
              )}
            </main>
            <aside className="outline-pane" aria-hidden="true" />
          </>
        )}
      </div>
      <div className="search-pill">
        <Search size={16} />
        <input aria-label="搜索栏目" placeholder="搜索栏目…" value={search} onChange={(event) => setSearch(event.target.value)} />
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
                <div><strong>自动保存</strong><small>编辑后自动保存内容</small></div>
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
