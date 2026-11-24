import { useEffect, useRef, useState } from 'react'
import { api, type ApiDocument } from './api'

type DocumentContent = Pick<ApiDocument, 'content_json' | 'search_text'>
type LoadState = 'loading' | 'ready' | 'error'
export type SaveState = 'saved' | 'saving' | 'error'

export function useJournalDocuments() {
  const [documents, setDocuments] = useState<ApiDocument[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const drafts = useRef(new Map<string, DocumentContent>())
  const writes = useRef(new Map<string, Promise<void>>())

  useEffect(() => {
    let cancelled = false
    api.documents()
      .then((items) => {
        if (cancelled) return
        setDocuments(items)
        setLoadState('ready')
      })
      .catch(() => { if (!cancelled) setLoadState('error') })
    return () => { cancelled = true }
  }, [loadAttempt])

  useEffect(() => {
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (drafts.current.size === 0) return
      event.preventDefault()
      event.returnValue = true
    }
    window.addEventListener('beforeunload', warnIfUnsaved)
    return () => window.removeEventListener('beforeunload', warnIfUnsaved)
  }, [])

  const retryLoad = () => {
    setLoadState('loading')
    setLoadAttempt((attempt) => attempt + 1)
  }

  const updateDocument = (id: string, changes: Partial<ApiDocument>) => {
    setDocuments((items) => items.map((item) => item.id === id ? { ...item, ...changes } : item))
  }

  const setSaveState = (id: string, state: SaveState) => {
    setSaveStates((states) => ({ ...states, [id]: state }))
  }

  async function writeDrafts(id: string) {
    setSaveState(id, 'saving')
    try {
      // Finish older requests first. While one runs, keep only the latest snapshot.
      for (let draft = drafts.current.get(id); draft; draft = drafts.current.get(id)) {
        const result = await api.saveDocument(id, draft.content_json, draft.search_text)
        if (drafts.current.get(id) === draft) drafts.current.delete(id)
        updateDocument(id, { updated_at: result.updated_at })
      }
      setSaveState(id, 'saved')
    } catch {
      setSaveState(id, 'error')
    }
  }

  function save(id: string) {
    if (writes.current.has(id) || !drafts.current.has(id)) return
    writes.current.set(id, writeDrafts(id).finally(() => { writes.current.delete(id) }))
  }

  const edit = (id: string, content: DocumentContent) => {
    drafts.current.set(id, content)
    updateDocument(id, content)
    save(id)
  }

  const create = async (title: string, themeColor: string) => {
    const created = await api.createDocument(title, themeColor)
    setDocuments((items) => [created, ...items])
    return created.id
  }

  const rename = async (id: string, title: string) => {
    const updated = await api.renameDocument(id, title)
    updateDocument(id, { title: updated.title, updated_at: updated.updated_at })
  }

  const remove = async (id: string) => {
    await writes.current.get(id)
    await api.deleteDocument(id)
    drafts.current.delete(id)
    setDocuments((items) => items.filter((item) => item.id !== id))
    setSaveStates(({ [id]: _deleted, ...states }) => states)
  }

  return { documents, loadState, retryLoad, saveStates, edit, save, create, rename, remove }
}
