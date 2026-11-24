import { useEffect, useMemo, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TextStyle from '@tiptap/extension-text-style'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { ArrowDownToLine, BookOpen, CalendarDays, Check, ChevronDown, CircleHelp, FileText, ImagePlus, Inbox, LayoutGrid, Menu, MoreHorizontal, PanelLeftClose, Plus, Search, Settings, Sparkles, Tag, Trash2, Type, Upload, Wallet, Waves, X } from 'lucide-react'
import { api } from './api'

type PluginId = 'daily' | 'mood' | 'bristol' | 'expense' | 'image' | 'sleep'
type View = 'inbox' | 'calendar' | 'insights'
type LifeRecord = { id: string; icon: string; title: string; value: string; detail: string; tone: string }

const demoDocuments = [
  { id: 'daily', icon: '☀️', title: '日常日志', meta: '今天 09:42' },
  { id: 'work', icon: '💼', title: '工作记录', meta: '昨天' },
  { id: 'learning', icon: '📚', title: '学习笔记', meta: '9 月 17 日' },
  { id: 'ideas', icon: '💡', title: '灵感随笔', meta: '9 月 12 日' },
]

const initialRecords: LifeRecord[] = [
  { id: 'mood', icon: '☀️', title: '心情', value: '不错', detail: '4 / 5 · 明亮的一天', tone: 'peach' },
  { id: 'bristol', icon: '◌', title: '排便', value: 'Type 4', detail: '正常香肠状 · 08:32', tone: 'mint' },
  { id: 'expense', icon: '¥', title: '今日消费', value: '¥ 46.50', detail: '2 笔 · 餐饮', tone: 'sky' },
]

const pluginMeta: Record<PluginId, { icon: string; label: string; description: string }> = {
  daily: { icon: '📅', label: '今日记录', description: '插入今天的日期标题' },
  mood: { icon: '😊', label: '心情', description: '记录今天的心情分数' },
  bristol: { icon: '💩', label: '排便', description: '选择 Bristol 类型' },
  expense: { icon: '💰', label: '消费', description: '记录一笔消费' },
  image: { icon: '🖼️', label: '图片', description: '上传一张图片' },
  sleep: { icon: '🌙', label: '睡眠', description: '记录入睡和起床时间' },
}

function CalendarView({ documents, onOpen }: { documents: { id: string; title: string; meta: string }[]; onOpen: (id: string) => void }) {
  const days = Array.from({ length: 30 }, (_, i) => i + 1)
  return <div className="feature-view"><div className="feature-heading"><div><div className="eyebrow">CALENDAR</div><h1>2026年 9月</h1><p>把生活放回时间里，回看每一天留下的痕迹。</p></div><button className="toolbar-button"><CalendarDays size={16} /> 今天</button></div><div className="calendar-card"><div className="calendar-week">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({ length: 1 }).map((_, i) => <span key={`empty-${i}`} />)}{days.map((day) => <button key={day} className={`${day === 19 ? 'today' : ''} ${[3, 7, 12, 16, 19, 24, 28].includes(day) ? 'has-entry' : ''}`} onClick={() => day === 19 && onOpen('daily')}><strong>{day}</strong>{[3, 7, 12, 16, 19, 24, 28].includes(day) && <small />}</button>)}</div></div><div className="calendar-entries"><div className="section-heading"><span>最近记录</span><span className="line" /></div>{documents.slice(0, 3).map((doc) => <button key={doc.id} className="calendar-entry" onClick={() => onOpen(doc.id)}><span className="entry-date">19<span>周六</span></span><span><strong>{doc.title}</strong><small>{doc.meta} · 有内容记录</small></span><ChevronDown size={15} /></button>)}</div></div>
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

function App() {
  const [activeDoc, setActiveDoc] = useState('daily')
  const [documents, setDocuments] = useState(demoDocuments)
  const [records, setRecords] = useState(initialRecords)
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [saved, setSaved] = useState(true)
  const [backendOnline, setBackendOnline] = useState(false)
  const [view, setView] = useState<View>('inbox')
  const [insertAtBottom, setInsertAtBottom] = useState(false)
  const [showComposer, setShowComposer] = useState(false)
  const [composerText, setComposerText] = useState('')
  const [composerPosition, setComposerPosition] = useState<'bottom' | 'top'>('bottom')
  const [showSleepForm, setShowSleepForm] = useState(false)
  const [sleepStart, setSleepStart] = useState('22:30')
  const [sleepEnd, setSleepEnd] = useState('07:00')

  const editor = useEditor({
    extensions: [StarterKit, Underline, TextStyle, Color, Highlight.configure({ multicolor: true }), Link.configure({ openOnClick: false }), Placeholder.configure({ placeholder: '从今天发生的第一件事开始记录…' })],
    content: `<h1>2026年9月19日 周六</h1><p>今天是一个适合慢下来、整理思绪的日子。</p><h2>今天做了什么</h2><p>把新的生活日志工作台搭了起来，感觉一个好用的记录工具应该像一张舒展的桌子，让想法和生活数据都能自然地放在这里。</p><blockquote>让每一天都留下可以回看的痕迹。</blockquote><h2>明天想做</h2><ul><li>继续完善日志编辑器</li><li>试试新的早餐店</li></ul>`,
    onUpdate: ({ editor: currentEditor }) => {
      setSaved(false)
      window.setTimeout(() => setSaved(true), 700)
      const active = documents.find((doc) => doc.id === activeDoc)
      if (backendOnline && active && !active.id.startsWith('demo-') && !['daily', 'work', 'learning', 'ideas'].includes(active.id)) {
        api.saveDocument(active.id, currentEditor.getJSON() as unknown as Record<string, unknown>, currentEditor.getText()).catch(() => setBackendOnline(false))
      }
    },
  })

  useEffect(() => {
    api.health().then(() => setBackendOnline(true)).catch(() => setBackendOnline(false))
    api.documents().then((items) => {
      if (items.length) {
        setDocuments(items.map((item) => ({ id: item.id, icon: '📄', title: item.title, meta: new Date(item.updated_at).toLocaleDateString('zh-CN') })))
        setActiveDoc(items[0].id)
      }
    }).catch(() => undefined)
  }, [])

  const headings = useMemo(() => {
    if (!editor) return []
    const result: { level: number; text: string }[] = []
    editor.state.doc.descendants((node) => { if (node.type.name === 'heading') result.push({ level: node.attrs.level as number, text: node.textContent }) })
    return result
  }, [editor?.state.doc.content.size])

  const addRecord = (id: PluginId, atBottom = false) => {
    if (id === 'sleep') {
      setShowSleepForm(true)
      setMenuOpen(false)
      setInsertAtBottom(false)
      return
    }
    if (atBottom && editor) {
      const end = Math.max(1, editor.state.doc.content.size - 1)
      editor.chain().focus().setTextSelection({ from: end, to: end }).run()
    }
    if (id === 'daily') editor?.chain().focus().insertContent('<h1>2026年9月19日 周六</h1><p></p>').run()
    if (id === 'image') editor?.chain().focus().insertContent('<p>🖼️ 图片占位 · 点击上传图片</p>').run()
    if (id === 'mood' || id === 'bristol' || id === 'expense') {
      const meta = pluginMeta[id]
      const next: LifeRecord = id === 'mood' ? { id: crypto.randomUUID(), icon: '🌤️', title: meta.label, value: '待记录', detail: '点击编辑详细心情', tone: 'peach' } : id === 'bristol' ? { id: crypto.randomUUID(), icon: '◌', title: meta.label, value: '待记录', detail: '选择 Bristol 类型', tone: 'mint' } : { id: crypto.randomUUID(), icon: '¥', title: meta.label, value: '¥ 0.00', detail: '填写金额和用途', tone: 'sky' }
      setRecords((prev) => [...prev, next])
      if (backendOnline) {
        const payload = id === 'mood' ? { score: 4, color: '#F3A86F', note: '不错' } : id === 'bristol' ? { bristol_type: 4, note: '正常香肠状' } : { amount: 0, category: '其他', description: '待填写' }
        const create = id === 'mood' ? () => api.createMood(payload) : id === 'bristol' ? () => api.createBristol(payload) : () => api.createExpense(payload)
        create().catch(() => setBackendOnline(false))
      }
    }
    setMenuOpen(false)
    setInsertAtBottom(false)
  }

  const saveComposer = () => {
    const text = composerText.trim()
    if (!text || !editor) return
    const position = composerPosition === 'top' ? 1 : Math.max(1, editor.state.doc.content.size - 1)
    editor.chain().focus().insertContentAt(position, { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] }).run()
    setComposerText('')
    setShowComposer(false)
  }

  const saveSleep = () => {
    const next: LifeRecord = { id: crypto.randomUUID(), icon: '🌙', title: '睡眠', value: `${sleepStart} — ${sleepEnd}`, detail: '睡眠时间区间', tone: 'lavender' }
    setRecords((prev) => [...prev, next])
    if (backendOnline) api.createRecord('sleep', { sleep_start: sleepStart, sleep_end: sleepEnd }).catch(() => setBackendOnline(false))
    setShowSleepForm(false)
  }

  const createDocument = () => {
    const title = `新文档 ${documents.length + 1}`
    if (backendOnline) {
      api.createDocument(title).then((item) => {
        setDocuments((prev) => [{ id: item.id, icon: '📄', title: item.title, meta: '刚刚' }, ...prev])
        setActiveDoc(item.id)
      }).catch(() => setBackendOnline(false))
    } else {
      const id = `demo-${Date.now()}`
      setDocuments((prev) => [{ id, icon: '📄', title, meta: '刚刚' }, ...prev])
      setActiveDoc(id)
    }
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Sparkles size={17} /></div><span>日常 · Journal</span></div>
      <div className="topbar-center"><span className={`status-dot ${backendOnline ? '' : 'offline'}`} />{backendOnline ? '数据库已连接' : '演示模式'}<span className="separator">·</span><span className="muted">{saved ? '内容已保存' : '正在保存…'}</span></div>
      <div className="topbar-actions"><button className="icon-button"><CircleHelp size={18} /></button><button className="avatar">林</button></div>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="sidebar-head"><div><div className="eyebrow">WORKSPACE</div><div className="workspace-title">我的生活 <ChevronDown size={14} /></div></div><button className="icon-button"><PanelLeftClose size={17} /></button></div>
        <div className="sidebar-nav"><button className={`nav-item ${view === 'inbox' ? 'active' : ''}`} onClick={() => setView('inbox')}><Inbox size={17} />收件箱<span className="count">3</span></button><button className={`nav-item ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')}><CalendarDays size={17} />日历</button><button className={`nav-item ${view === 'insights' ? 'active' : ''}`} onClick={() => setView('insights')}><LayoutGrid size={17} />统计中心</button></div>
        <div className="section-label"><span>我的文档</span><button className="small-icon" onClick={createDocument}><Plus size={16} /></button></div>
        <div className="doc-list">{documents.filter((doc) => doc.title.includes(search) || !search).map((doc) => <button className={`doc-item ${activeDoc === doc.id ? 'selected' : ''}`} key={doc.id} onClick={() => setActiveDoc(doc.id)}><span className="doc-icon">{doc.icon}</span><span className="doc-copy"><strong>{doc.title}</strong><small>{doc.meta}</small></span>{activeDoc === doc.id && <span className="selected-bar" />}</button>)}</div>
        <div className="sidebar-bottom"><button className="nav-item" onClick={() => setShowSettings(true)}><Settings size={17} />设置</button><div className="storage"><div className="storage-label"><span>空间使用</span><span>12%</span></div><div className="storage-bar"><span /></div></div></div>
      </aside>
      <main className="editor-pane">
        {view === 'inbox' ? <>
        <div className="editor-header"><div><div className="breadcrumb">我的文档 <span>/</span> 日常日志</div><h2>日常日志</h2></div><button className="more-button"><MoreHorizontal size={19} /></button></div>
        <div className="editor-toolbar"><div className="toolbar-group"><button className="toolbar-button new-entry-button" onClick={() => { setShowComposer(true); setComposerPosition('bottom') }}><Plus size={17} /><span>新增</span></button><button className="toolbar-button" onClick={() => { setInsertAtBottom(false); setMenuOpen((v) => !v) }}><Sparkles size={15} /><span>模块</span><ChevronDown size={13} /></button><button className="toolbar-button bottom-insert" title="追加模块到文档底部" onClick={() => { setInsertAtBottom(true); setMenuOpen(true) }}><ArrowDownToLine size={16} /><span>底部模块</span></button>{menuOpen && <div className="insert-menu">{(Object.keys(pluginMeta) as PluginId[]).map((id) => <button key={id} onClick={() => addRecord(id, insertAtBottom)}><span>{pluginMeta[id].icon}</span><span><strong>{pluginMeta[id].label}</strong><small>{insertAtBottom ? '追加到文档底部' : pluginMeta[id].description}</small></span></button>)}</div>}</div><div className="toolbar-divider" /><div className="toolbar-group format-group"><button onClick={() => editor?.chain().focus().toggleBold().run()} className={editor?.isActive('bold') ? 'format-active' : ''}><strong>B</strong></button><button onClick={() => editor?.chain().focus().toggleItalic().run()} className={editor?.isActive('italic') ? 'format-active' : ''}><em>I</em></button><button onClick={() => editor?.chain().focus().toggleUnderline().run()} className={editor?.isActive('underline') ? 'format-active' : ''}><u>U</u></button><button onClick={() => editor?.chain().focus().toggleStrike().run()} className={editor?.isActive('strike') ? 'format-active' : ''}><s>S</s></button><button onClick={() => editor?.chain().focus().setColor('#ef6b5b').run()} className="color-button">A</button><button onClick={() => editor?.chain().focus().toggleHighlight({ color: '#fff0c6' }).run()} className="highlight-button">A</button></div><div className="toolbar-divider" /><div className="toolbar-group"><button className="toolbar-button secondary"><Upload size={16} />图片</button><button className="toolbar-button secondary"><Type size={16} />格式</button></div></div>
        <div className="editor-scroll"><article className="document"><div className="date-kicker"><span className="date-dot" />周六，9 月 19 日</div>{showComposer && <div className="composer-card"><div className="composer-label"><Sparkles size={15} />新增日志</div><textarea autoFocus value={composerText} placeholder="写下今天想记录的内容…" onChange={(event) => setComposerText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); saveComposer() } }} /><div className="composer-actions"><span>Enter 保存 · Shift + Enter 换行</span><div><select value={composerPosition} onChange={(event) => setComposerPosition(event.target.value as 'bottom' | 'top')}><option value="bottom">追加到底部</option><option value="top">添加到顶部</option></select><button onClick={saveComposer}>保存</button></div></div></div>}<EditorContent editor={editor} /><div className="record-section"><div className="section-heading"><span>今日记录</span><span className="line" /></div><div className="record-grid">{records.map((record) => <div className={`record-card ${record.tone}`} key={record.id}><div className="record-top"><span className="record-icon">{record.icon}</span><button className="record-more"><MoreHorizontal size={16} /></button></div><div className="record-title">{record.title}</div><div className="record-value">{record.value}</div><div className="record-detail">{record.detail}</div></div>)}<button className="record-add" onClick={() => setShowComposer(true)}><Plus size={19} /><span>新增日志</span></button></div></div><div className="document-footer"><span><Check size={14} /> 内容自动保存</span><span>Markdown · 富文本</span></div></article></div>
        </> : view === 'calendar' ? <CalendarView documents={documents} onOpen={(id) => { setActiveDoc(id); setView('inbox') }} /> : <InsightsView backendOnline={backendOnline} />}
      </main>
      <aside className="outline-pane"><div className="outline-title"><span>本页目录</span><span className="outline-count">{headings.length}</span></div><div className="outline-list">{headings.map((heading, i) => <button key={`${heading.text}-${i}`} className={`outline-item level-${heading.level}`} onClick={() => editor?.commands.setTextSelection({ from: 1, to: 1 })}>{heading.text}</button>)}</div><div className="quick-stats"><div className="quick-stats-title">本周小结 <Sparkles size={14} /></div><div className="stat-row"><span>记录天数</span><strong>5 / 7</strong></div><div className="stat-row"><span>平均心情</span><strong className="warm">4.2 <span>↗</span></strong></div><div className="stat-row"><span>本周消费</span><strong>¥ 328.50</strong></div></div></aside>
    </div>
    <div className="search-pill"><Search size={16} /><input placeholder="搜索文档…" value={search} onChange={(e) => setSearch(e.target.value)} /><kbd>⌘ K</kbd></div>
    {showSettings && <div className="modal-backdrop" onClick={() => setShowSettings(false)}><div className="settings-modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">PREFERENCES</div><h3>设置</h3></div><button className="icon-button" onClick={() => setShowSettings(false)}><X size={18} /></button></div><div className="setting-row"><div><strong>每日提醒</strong><small>提醒自己记录今天发生的事</small></div><div className="toggle on"><span /></div></div><div className="setting-row"><div><strong>提醒时间</strong><small>每天提醒一次</small></div><span className="time-chip">22:30</span></div><div className="setting-row"><div><strong>自动保存</strong><small>编辑后自动保存内容</small></div><div className="toggle on"><span /></div></div></div></div>}
    {showSleepForm && <div className="modal-backdrop" onClick={() => setShowSleepForm(false)}><div className="settings-modal sleep-modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">LIFE MODULE</div><h3>🌙 记录睡眠</h3></div><button className="icon-button" onClick={() => setShowSleepForm(false)}><X size={18} /></button></div><p className="sleep-help">选择今天的入睡和起床时间，保存后会作为一个睡眠区间卡片。</p><div className="sleep-fields"><label>入睡时间<select value={sleepStart} onChange={(event) => setSleepStart(event.target.value)}>{['22:00', '22:30', '23:00', '23:30', '00:00', '00:30', '01:00'].map((time) => <option key={time}>{time}</option>)}</select></label><span>至</span><label>起床时间<select value={sleepEnd} onChange={(event) => setSleepEnd(event.target.value)}>{['05:30', '06:00', '06:30', '07:00', '07:30', '08:00', '08:30'].map((time) => <option key={time}>{time}</option>)}</select></label></div><button className="sleep-save" onClick={saveSleep}>保存睡眠记录</button></div></div>}
  </div>
}

export default App
