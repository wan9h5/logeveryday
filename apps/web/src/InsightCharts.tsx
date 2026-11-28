import { useEffect, useMemo, useRef } from 'react'
import { init, use, type ComposeOption, type EChartsType } from 'echarts/core'
import { BarChart, LineChart, type BarSeriesOption, type LineSeriesOption } from 'echarts/charts'
import { GridComponent, TooltipComponent, type GridComponentOption, type TooltipComponentOption } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { JournalInsights } from './api'

use([GridComponent, TooltipComponent, BarChart, LineChart, CanvasRenderer])

type ChartOption = ComposeOption<BarSeriesOption | LineSeriesOption | GridComponentOption | TooltipComponentOption>

const ink = '#211a11'
const muted = '#746a58'
const border = '#ded0b7'
const axisLabel = { color: muted, fontSize: 12, hideOverlap: true }
const gridLines = { lineStyle: { color: border, type: 'dashed' as const } }
const axisNumber = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 })
const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', currencyDisplay: 'narrowSymbol' })
const scores = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })

export type TrendMetric = 'expense_total' | 'mood' | 'sleep_quality'
const metrics = [
  { key: 'expense_total', label: '消费', name: '消费金额', color: '#9b6b33' },
  { key: 'mood', label: '心情', name: '平均心情', color: '#527552' },
  { key: 'sleep_quality', label: '睡眠分数', name: '平均睡眠分数', color: '#526d93' },
] as const

function chartTooltip(format: (value: number) => string): TooltipComponentOption {
  return {
    trigger: 'axis',
    confine: true,
    backgroundColor: '#fcf5e6',
    borderColor: border,
    textStyle: { color: ink, fontSize: 13 },
    valueFormatter: (value) => typeof value === 'number' && Number.isFinite(value) ? format(value) : '暂无记录',
  }
}

function Plot({ option, label, compact = false }: { option: ChartOption; label: string; compact?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const chart = useRef<EChartsType | null>(null)

  useEffect(() => {
    const element = host.current
    if (!element) return
    const instance = init(element, null, { renderer: 'canvas' })
    chart.current = instance
    const resize = new ResizeObserver(() => instance.resize())
    resize.observe(element)
    return () => {
      resize.disconnect()
      instance.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    chart.current?.setOption({ ...option, animation: !reducedMotion, animationDuration: 200 }, { notMerge: true })
  }, [option])

  return <div ref={host} className={`insights-chart${compact ? ' is-compact' : ''}`} role="img" aria-label={label} />
}

function trendPoints(data: JournalInsights, metric: TrendMetric) {
  const monthly = data.period === 'quarter' || data.period === 'year'
  const byDate = new Map(data.trend.map((row) => [row.date, row[metric]]))
  // Include missing calendar buckets so gaps in recorded scores are visible.
  const cursor = new Date(`${data.start_date}T00:00:00Z`)
  const end = new Date(`${data.end_date}T00:00:00Z`)
  const labels: string[] = []
  const values: (number | null)[] = []
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10)
    labels.push(monthly ? `${cursor.getUTCMonth() + 1}月` : date.slice(5).replace('-', '/'))
    values.push(byDate.get(date) ?? null)
    if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    else cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return { labels, values }
}

export function TrendChart({ data, metric, onMetricChange }: {
  data: JournalInsights
  metric: TrendMetric
  onMetricChange: (metric: TrendMetric) => void
}) {
  const selected = metrics.find((item) => item.key === metric) ?? metrics[0]
  const hasValues = metric === 'expense_total' ? data.expenses.count > 0
    : metric === 'mood' ? data.mood.count > 0 : data.sleep.quality.count > 0
  const option = useMemo<ChartOption>(() => {
    const { labels, values } = trendPoints(data, metric)
    const spending = metric === 'expense_total'
    const mood = metric === 'mood'
    const series: BarSeriesOption | LineSeriesOption = spending
      ? { name: selected.name, type: 'bar', data: values, barMaxWidth: 34, itemStyle: { color: selected.color, borderRadius: [4, 4, 0, 0] } }
      : { name: selected.name, type: 'line', data: values, connectNulls: false, symbol: 'circle', symbolSize: 7,
          lineStyle: { color: selected.color, width: 2 }, itemStyle: { color: selected.color } }
    return {
      color: [selected.color],
      grid: { left: 52, right: 16, top: 21, bottom: 34 },
      tooltip: chartTooltip(spending ? currency.format : scores.format),
      xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLine: { lineStyle: { color: border } }, axisLabel },
      yAxis: {
        type: 'value', min: mood ? 1 : spending ? 0 : undefined, max: mood ? 5 : undefined,
        interval: mood ? 1 : undefined, scale: !mood && !spending, splitNumber: 4,
        axisLabel: { ...axisLabel, formatter: (value: number) => axisNumber.format(value) }, splitLine: gridLines,
      },
      series: [series],
    }
  }, [data, metric, selected])

  return (
    <section className="insights-panel insights-trend">
      <header>
        <h2>变化趋势</h2>
        <div className="period-switch" role="group" aria-label="趋势指标">
          {metrics.map(({ key, label }) => (
            <button key={key} type="button" className={metric === key ? 'selected' : ''}
              aria-pressed={metric === key} onClick={() => onMetricChange(key)}>{label}</button>
          ))}
        </div>
      </header>
      {hasValues
        ? <Plot option={option} label={`${selected.name}趋势图。具体数值可查看下方明细表。`} />
        : <p className="insights-muted">本期还没有{selected.label}记录。</p>}
    </section>
  )
}

export function BristolChart({ distribution }: { distribution: JournalInsights['bristol']['distribution'] }) {
  const option = useMemo<ChartOption>(() => ({
    grid: { left: 35, right: 9, top: 22, bottom: 30 },
    tooltip: chartTooltip((value) => `${value} 次`),
    xAxis: {
      type: 'category', data: distribution.map(({ value }) => `Type ${value}`),
      axisTick: { show: false }, axisLine: { lineStyle: { color: border } }, axisLabel,
    },
    yAxis: { type: 'value', min: 0, minInterval: 1, splitNumber: 4, axisLabel, splitLine: gridLines },
    series: [{
      name: '记录次数', type: 'bar', data: distribution.map(({ count }) => count), barMaxWidth: 30,
      itemStyle: { color: '#9b6b33', borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: 'top', color: ink, fontSize: 12,
        formatter: ({ value }) => typeof value === 'number' && value > 0 ? String(value) : '' },
    }],
  }), [distribution])
  const label = distribution.map(({ value, count }) => `Type ${value}，${count} 次`).join('。')
  return <Plot option={option} label={`Bristol 分类柱状图。${label}`} compact />
}
