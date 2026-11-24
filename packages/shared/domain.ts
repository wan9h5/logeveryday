export type BlockType = 'text' | 'daily' | 'mood' | 'bristol' | 'expense' | 'image'

export type RecordType = Exclude<BlockType, 'text'>

export interface DocumentSummary {
  id: string
  title: string
  updatedAt: string
  icon: string
}

export interface LifeRecord {
  id: string
  type: RecordType
  label: string
  value: string
  tone: 'lavender' | 'peach' | 'mint' | 'sky'
}

export interface JournalPlugin {
  id: BlockType
  label: string
  icon: string
  description: string
  insert: () => void
}
