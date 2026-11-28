import { useEffect, useRef, useState } from 'react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { api, type ApiDocument } from './api'
import { journalSnapshot } from './HeadingPrefix'

const AUTOSAVE_DELAY = 5000
type LoadState = 'loading' | 'ready' | 'error'
export type SaveState = 'saved' | 'pending' | 'saving' | 'error'

export function useJournalDocuments() {
  const [documents, setDocuments] = useState<ApiDocument[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const drafts = useRef(new Map<string, ProseMirrorNode>())
  const timers = useRef(new Map<string, number>())
  const writes = useRef(new Map<string, Promise<void>>())
  const deleting = useRef(new Set<string>())

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
    const scheduledSaves = timers.current
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (drafts.current.size === 0) return
      event.preventDefault()
      event.returnValue = true
    }
    window.addEventListener('beforeunload', warnIfUnsaved)
    return () => {
      window.removeEventListener('beforeunload', warnIfUnsaved)
      scheduledSaves.forEach((timer) => window.clearTimeout(timer))
      scheduledSaves.clear()
    }
  }, [])

  const retryLoad = () => {
    setLoadState('loading')
    setLoadAttempt((attempt) => attempt + 1)
  }

  const updateDocument = (id: string, changes: Partial<ApiDocument>) => {
    setDocuments((items) => items.map((item) => item.id === id ? { ...item, ...changes } : item))
  }

  const setSaveState = (id: string, state: SaveState) => {
    setSaveStates((states) => states[id] === state ? states : { ...states, [id]: state })
  }

  function cancelScheduledSave(id: string) {
    const timer = timers.current.get(id)
    if (timer === undefined) return
    window.clearTimeout(timer)
    timers.current.delete(id)
  }

  async function writeDraft(id: string, draft: ProseMirrorNode) {
    setSaveState(id, 'saving')
    try {
      const snapshot = journalSnapshot(draft)
      const result = await api.saveDocument(id, snapshot.content_json, snapshot.search_text)
      updateDocument(id, { ...snapshot, updated_at: result.updated_at })
      if (drafts.current.get(id) === draft) {
        drafts.current.delete(id)
        setSaveState(id, 'saved')
      }
    } catch {
      if (drafts.current.get(id) === draft) setSaveState(id, 'error')
    }
  }

  function save(id: string) {
    cancelScheduledSave(id)
    const draft = drafts.current.get(id)
    if (!draft || writes.current.has(id) || deleting.current.has(id)) return

    writes.current.set(id, writeDraft(id, draft).finally(() => {
      writes.current.delete(id)
      // A newer draft may already be due if its timer elapsed during this request.
      const latest = drafts.current.get(id)
      if (latest && latest !== draft && !timers.current.has(id)) save(id)
    }))
  }

  const edit = (id: string, doc: ProseMirrorNode) => {
    drafts.current.set(id, doc)
    setSaveState(id, 'pending')
    cancelScheduledSave(id)
    if (!deleting.current.has(id)) {
      timers.current.set(id, window.setTimeout(() => save(id), AUTOSAVE_DELAY))
    }
  }

  const getDraft = (id: string) => drafts.current.get(id)

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
    deleting.current.add(id)
    cancelScheduledSave(id)
    try {
      await writes.current.get(id)
      await api.deleteDocument(id)
      drafts.current.delete(id)
      setDocuments((items) => items.filter((item) => item.id !== id))
      setSaveStates(({ [id]: _deleted, ...states }) => states)
    } finally {
      deleting.current.delete(id)
      if (drafts.current.has(id)) save(id)
    }
  }

  return { documents, loadState, retryLoad, saveStates, edit, getDraft, save, create, rename, remove }
}
