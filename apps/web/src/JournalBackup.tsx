import { useEffect, useState } from 'react'
import { api, type AutomaticBackupStatus } from './api'

type BackupFile = { filename: string; payload: unknown; documents: number }
type Feedback = { message: string; error: boolean }
const backupTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short',
})

export function JournalBackup({ flush, onRestore, onBusyChange }: {
  flush: () => Promise<void>
  onRestore: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [file, setFile] = useState<BackupFile | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [busy, setBusy] = useState(false)
  const [automatic, setAutomatic] = useState<AutomaticBackupStatus | null>(null)
  const [statusError, setStatusError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    api.automaticBackupStatus(controller.signal)
      .then((status) => { if (!controller.signal.aborted) setAutomatic(status) })
      .catch(() => { if (!controller.signal.aborted) setStatusError(true) })
    return () => controller.abort()
  }, [])

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true)
    onBusyChange(true)
    setFeedback(null)
    try {
      await action()
    } catch (error) {
      const message = error instanceof Error && error.message === 'API 422'
        ? '备份内容无效，请选择从本系统导出的备份文件。'
        : error instanceof Error && error.message === 'A journal could not be saved'
          ? '有日志尚未保存，请保存成功后重试。'
          : fallback
      setFeedback({ message, error: true })
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }

  function exportBackup() {
    void run(async () => {
      await flush()
      const backup = await api.exportBackup()
      const date = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date())
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
      const download = document.createElement('a')
      download.href = url
      download.download = `logeveryday-${date}.json`
      document.body.append(download)
      download.click()
      download.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setFeedback({ message: '备份已生成。', error: false })
    }, '备份暂时无法导出，请重试。')
  }

  function chooseFile(selection: File) {
    setFile(null)
    void run(async () => {
      const payload = JSON.parse(await selection.text())
      if (payload?.format !== 'modular-life-journal' || payload.version !== 1 || !Array.isArray(payload.documents)) {
        throw new Error('Invalid backup')
      }
      setFile({ filename: selection.name, payload, documents: payload.documents.length })
    }, '无法读取备份文件，请选择从本系统导出的 JSON。')
  }

  function restoreBackup() {
    if (!file) return
    void run(async () => {
      await flush()
      const results = await api.restoreBackup(file.payload)
      const totals = Object.values(results).reduce(
        (total, row) => ({ added: total.added + row.added, skipped: total.skipped + row.skipped }),
        { added: 0, skipped: 0 },
      )
      setFile(null)
      setFeedback({ message: `已恢复 ${totals.added} 项，保留现有 ${totals.skipped} 项。`, error: false })
      onRestore()
    }, '恢复失败，现有数据已保留。请核对备份文件后重试。')
  }

  return (
    <section className="backup-settings" aria-labelledby="backup-title">
      <h4 id="backup-title">备份与恢复</h4>
      <div className="automatic-backup-status" aria-live="polite">
        <strong>自动备份</strong>
        {automatic ? (
          <>
            <p>{automatic.enabled ? '服务运行时每天留一份，启动时补齐当天缺失的备份。' : '自动备份已关闭。'}</p>
            {automatic.enabled && automatic.failed && <p role="status">最近一次备份失败，服务会自动重试。</p>}
            {automatic.last_success_at
              ? <p>最近备份于 <time dateTime={automatic.last_success_at}>{backupTime.format(new Date(automatic.last_success_at))}</time></p>
              : automatic.enabled && <p>等待首次备份。</p>}
            {automatic.enabled && <code title={automatic.directory}>{automatic.directory}</code>}
          </>
        ) : <p>{statusError ? '暂时无法读取备份状态。' : '正在读取备份状态…'}</p>}
      </div>
      <p>导出日志和统计记录。导入会补回缺失项，同一条记录保留当前版本。</p>
      <div className="backup-actions">
        <button type="button" className="toolbar-button" onClick={exportBackup} disabled={busy}>导出备份</button>
        <label className="toolbar-button backup-file-picker">
          选择备份文件
          <input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => {
            const selection = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (selection) chooseFile(selection)
          }} />
        </label>
      </div>
      {file && (
        <div className="backup-selection">
          <p>{file.filename} · {file.documents} 个栏目</p>
          <button type="button" className="toolbar-button" onClick={restoreBackup} disabled={busy}>导入备份</button>
        </div>
      )}
      {feedback && <p className={feedback.error ? 'column-error' : undefined} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
    </section>
  )
}
