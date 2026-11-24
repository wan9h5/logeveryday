import type { JSONContent } from '@tiptap/react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'

export type ApiDocument = { id: string; title: string; content_json: JSONContent; search_text: string; created_at: string; updated_at: string }
export type ApiRecord = { id: string; record_type: string; recorded_at: string; payload: Record<string, unknown> }

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) }, ...options })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.status === 204 ? (undefined as T) : response.json()
}

export const api = {
  health: () => request<{ status: string; database: string }>('/health'),
  documents: (search = '') => request<ApiDocument[]>(`/documents${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createDocument: (title: string, themeColor: string) => request<ApiDocument>('/documents', {
    method: 'POST',
    body: JSON.stringify({
      title,
      content_json: {
        type: 'doc',
        attrs: { themeColor },
        content: [{ type: 'paragraph' }],
      },
    }),
  }),
  renameDocument: (id: string, title: string) => request<ApiDocument>(`/documents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  }),
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, { method: 'DELETE' }),
  saveDocument: (id: string, contentJson: JSONContent, searchText: string) => request<ApiDocument>(`/documents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ content_json: contentJson, search_text: searchText }),
  }),
  moods: () => request<Record<string, unknown>[]>('/moods'),
  bristol: () => request<Record<string, unknown>[]>('/bristol'),
  expenses: () => request<Record<string, unknown>[]>('/expenses'),
  createMood: (payload: Record<string, unknown>) => request<Record<string, unknown>>('/moods', { method: 'POST', body: JSON.stringify(payload) }),
  createBristol: (payload: Record<string, unknown>) => request<Record<string, unknown>>('/bristol', { method: 'POST', body: JSON.stringify(payload) }),
  createExpense: (payload: Record<string, unknown>) => request<Record<string, unknown>>('/expenses', { method: 'POST', body: JSON.stringify(payload) }),
  expenseInsights: (period = 'month') => request<{ period: string; total: number; currency: string; by_category: { category: string; total: number }[] }>(`/insights/expenses?period=${period}`),
  createRecord: (recordType: string, payload: Record<string, unknown>) => request<ApiRecord>('/records', { method: 'POST', body: JSON.stringify({ record_type: recordType, payload }) }),
}
