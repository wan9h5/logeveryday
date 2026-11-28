import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, FileText, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ApiDocument } from './api'
import { JournalDialog } from './JournalDialog'
import { COLUMN_THEMES, DEFAULT_COLUMN_COLOR, columnThemeStyle } from './editorStyle'

type ColumnAction = { kind: 'create' } | { kind: 'rename' | 'delete'; doc: ApiDocument }

type Props = {
  documents: ApiDocument[]
  activeId?: string
  loadState: 'loading' | 'ready' | 'error'
  retryLoad: () => void
  onOpen: (id: string) => void
  onCreate: (title: string, themeColor: string) => Promise<void>
  onRename: (id: string, title: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' })

function ColumnDialog({ action, onClose, onConfirm }: {
  action: ColumnAction
  onClose: () => void
  onConfirm: (title: string, themeColor: string) => Promise<void>
}) {
  const [title, setTitle] = useState(action.kind === 'rename' ? action.doc.title : '')
  const [themeColor, setThemeColor] = useState<string>(DEFAULT_COLUMN_COLOR)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const deleting = action.kind === 'delete'
  const heading = { create: '新建栏目', rename: '重命名栏目', delete: '删除栏目' }[action.kind]

  const submit = async (event: FormEvent<HTMLFormElement>, close: () => void) => {
    event.preventDefault()
    if (busy || (!deleting && !title.trim())) return
    setBusy(true)
    setError('')
    try {
      await onConfirm(title.trim(), themeColor)
      close()
    } catch {
      setError(`${heading}失败，请检查连接后重试。`)
      setBusy(false)
    }
  }

  return (
    <JournalDialog
      className="column-dialog"
      labelledBy="column-dialog-title"
      describedBy={deleting ? 'column-delete-description' : undefined}
      dismissDisabled={busy}
      onClose={onClose}
    >
      {(close) => <form onSubmit={(event) => void submit(event, close)}>
        <h2 id="column-dialog-title">{heading}</h2>
        {deleting ? (
          <p id="column-delete-description">「{action.doc.title}」及其正文将被删除，删除后无法恢复。</p>
        ) : (
          <label className="column-name-field">
            栏目名称
            <input
              autoFocus
              required
              maxLength={255}
              value={title}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：读书笔记"
            />
          </label>
        )}
        {action.kind === 'create' && (
          <fieldset className="column-theme-field" disabled={busy}>
            <legend>推荐主题色</legend>
            <div className="column-theme-grid">
              {COLUMN_THEMES.map(({ name, color }) => (
                <label className="column-theme-option" key={color}>
                  <input
                    type="radio"
                    name="column-theme"
                    value={color}
                    checked={themeColor === color}
                    onChange={() => setThemeColor(color)}
                  />
                  <span className="column-theme-swatch" style={{ backgroundColor: color }} aria-hidden="true">
                    {themeColor === color && <Check size={13} />}
                  </span>
                  {name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {error && <p className="column-error" role="alert">{error}</p>}
        <div className="column-dialog-actions">
          <button type="button" className="toolbar-button" disabled={busy} autoFocus={deleting} onClick={close}>
            取消
          </button>
          <button
            type="submit"
            className={`column-confirm ${deleting ? 'danger' : ''}`}
            disabled={busy || (!deleting && !title.trim())}
          >
            {busy ? '处理中…' : deleting ? '确认删除' : action.kind === 'create' ? '新建' : '保存'}
          </button>
        </div>
      </form>}
    </JournalDialog>
  )
}

export function DocumentColumns({
  documents, activeId, loadState, retryLoad, onOpen, onCreate, onRename, onDelete,
}: Props) {
  const [menuId, setMenuId] = useState<string | null>(null)
  const [action, setAction] = useState<ColumnAction | null>(null)
  const openMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuId) return
    openMenuRef.current?.querySelector('.column-menu')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const outside = (event: PointerEvent) => {
      const menu = openMenuRef.current
      if (menu && !event.composedPath().includes(menu)) setMenuId(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      openMenuRef.current?.querySelector('button')?.focus()
      setMenuId(null)
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape)
    }
  }, [menuId])

  const openAction = (next: ColumnAction) => {
    setMenuId(null)
    setAction(next)
  }

  const confirm = async (title: string, themeColor: string) => {
    if (!action) return
    if (action.kind === 'create') await onCreate(title, themeColor)
    else if (action.kind === 'rename') await onRename(action.doc.id, title)
    else await onDelete(action.doc.id)
  }

  return (
    <>
      <div className="section-label">
        <span>我的文档</span>
        <button
          className="small-icon"
          title="新建栏目"
          aria-label="新建栏目"
          disabled={loadState !== 'ready'}
          onClick={() => openAction({ kind: 'create' })}
        >
          <Plus size={16} />
        </button>
      </div>
      {loadState === 'loading' && <p className="column-empty" role="status">正在加载栏目…</p>}
      {loadState === 'error' && (
        <div className="column-empty">
          <p role="alert">无法加载栏目</p>
          <button className="toolbar-button" onClick={retryLoad}>重试</button>
        </div>
      )}
      {loadState === 'ready' && (
        <div className="doc-list">
          {documents.length === 0 && (
            <p className="column-empty">点击 + 新建第一个栏目</p>
          )}
          {documents.map((doc) => {
            const selected = activeId === doc.id
            const open = menuId === doc.id
            return (
              <div className="column-row" key={doc.id} style={columnThemeStyle(doc.content_json)}>
                <button
                  className={`doc-item ${selected ? 'selected' : ''}`}
                  aria-current={selected ? 'page' : undefined}
                  title={doc.title}
                  onClick={() => { setMenuId(null); onOpen(doc.id) }}
                >
                  <span className="doc-icon" aria-hidden="true"><FileText size={17} /></span>
                  <span className="doc-copy">
                    <strong>{doc.title}</strong>
                    <small>{dateFormat.format(new Date(doc.updated_at))}</small>
                  </span>
                </button>
                <div className="column-tools" ref={open ? openMenuRef : undefined}>
                  <button
                    className="small-icon"
                    aria-label={`管理栏目 ${doc.title}`}
                    aria-expanded={open}
                    aria-controls={`column-actions-${doc.id}`}
                    onClick={() => setMenuId(open ? null : doc.id)}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  <div
                    id={`column-actions-${doc.id}`}
                    className={`column-menu${open ? ' is-open' : ''}`}
                    aria-hidden={!open}
                  >
                    <button tabIndex={open ? 0 : -1} onClick={() => openAction({ kind: 'rename', doc })}><Pencil size={14} />重命名</button>
                    <button tabIndex={open ? 0 : -1} className="danger" onClick={() => openAction({ kind: 'delete', doc })}><Trash2 size={14} />删除</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {action && <ColumnDialog action={action} onClose={() => setAction(null)} onConfirm={confirm} />}
    </>
  )
}
