import type { CSSProperties } from 'react'
import { Extension, type JSONContent } from '@tiptap/react'

export const COLUMN_THEMES = [
  { name: '羊皮纸', color: '#b28b55' },
  { name: '灰蓝', color: '#567189' },
  { name: '海青', color: '#347e83' },
  { name: '松绿', color: '#4d775c' },
  { name: '陶棕', color: '#a26849' },
  { name: '蔷薇', color: '#a15b6d' },
] as const

export const DEFAULT_COLUMN_COLOR = COLUMN_THEMES[0].color

export function columnColor(content?: JSONContent) {
  return COLUMN_THEMES.find(({ color }) => color === content?.attrs?.themeColor)?.color ?? DEFAULT_COLUMN_COLOR
}

export function columnThemeStyle(content: JSONContent) {
  const color = columnColor(content)
  return {
    '--column-accent': color,
    '--column-tint': `${color}1a`,
  } as CSSProperties
}

// Keep the theme on the document root so it round-trips through TipTap and autosave.
export const ColumnTheme = Extension.create({
  name: 'columnTheme',
  addGlobalAttributes() {
    return [{
      types: ['doc'],
      attributes: { themeColor: { default: DEFAULT_COLUMN_COLOR, rendered: false } },
    }]
  },
})

export const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'] as const

export const JournalFontSize = Extension.create({
  name: 'journalFontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (element) => FONT_SIZES.find((size) => size === element.style.fontSize) ?? null,
          renderHTML: ({ fontSize }) =>
            FONT_SIZES.includes(fontSize) ? { style: `font-size: ${fontSize}` } : {},
        },
      },
    }]
  },
})
