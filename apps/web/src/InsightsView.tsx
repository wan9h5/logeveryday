import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { api, type ApiDocument, type InsightsCount, type InsightsPeriod, type JournalInsights } from './api'
import type { TrendMetric } from './InsightCharts'

const TrendChart = lazy(() => import('./InsightCharts').then(({ TrendChart }) => ({ default: TrendChart })))
const BristolChart = lazy(() => import('./InsightCharts').then(({ BristolChart }) => ({ default: BristolChart })))

const periods: [InsightsPeriod, string][] = [
  ['day', '日'], ['week', '周'], ['month', '月'], ['quarter', '季度'], ['year', '年'],
]
const meals = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }
const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', currencyDisplay: 'narrowSymbol' })
const scores = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const journalCalendar = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
})

function score(value: number | null) {
  return value === null ? '—' : scores.format(value)
}

function shiftDate(date: string, days: number) {
  const target = new Date(`${date}T00:00:00Z`)
  target.setUTCDate(target.getUTCDate() + days)
  return target.toISOString().slice(0, 10)
}

function useInsights(period: InsightsPeriod, anchor: string | null, documents: ApiDocument[]) {
  const key = `${period}:${anchor ?? 'current'}`
  const [result, setResult] = useState<{ key: string; data: JournalInsights | null; error: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    api.journalInsights(period, anchor, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setResult({ key, data, error: false }) })
      .catch(() => { if (!controller.signal.aborted) setResult({ key, data: null, error: true }) })
    return () => controller.abort()
  }, [period, anchor, documents, key, attempt])

  return {
    data: result?.key === key ? result.data : null,
    error: result?.key === key && result.error,
    retry: () => { setResult(null); setAttempt((value) => value + 1) },
  }
}

export function WeeklySummary({ documents }: { documents: ApiDocument[] }) {
  const { data, error } = useInsights('week', null, documents)
  return (
    <div className="quick-stats">
      <div className="quick-stats-title">本周小结 <Sparkles size={14} aria-hidden="true" /></div>
      {data ? (
        <>
          <div className="stat-row"><span>记录天数</span><strong>{data.recorded_days} / 7</strong></div>
          <div className="stat-row"><span>平均心情</span><strong>{score(data.mood.average)}</strong></div>
          <div className="stat-row"><span>本周消费</span><strong>{currency.format(data.expenses.total)}</strong></div>
        </>
      ) : <p className="insights-muted">{error ? '小结暂时无法加载' : '正在加载…'}</p>}
    </div>
  )
}

function InsightCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="insight-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="insights-panel">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function Bars({ rows, format }: { rows: { label: string; value: number }[]; format: (value: number) => string }) {
  const maximum = rows.reduce((max, row) => Math.max(max, row.value), 0)
  return (
    <ul className="insights-bars">
      {rows.map(({ label, value }) => (
        <li key={label}>
          <div><span>{label}</span><strong>{format(value)}</strong></div>
          <span className="insights-bar-track" aria-hidden="true">
            <span style={{ width: `${maximum > 0 ? value / maximum * 100 : 0}%` }} />
          </span>
        </li>
      ))}
    </ul>
  )
}

function CountList({ title, entries }: { title: string; entries: InsightsCount[] }) {
  const rows = (items: InsightsCount[]) => items.map(({ label, count }) => (
    <li key={label}><span>{label}</span><strong>{count} 次</strong></li>
  ))
  return (
    <div className="insights-list">
      <h4>{title}</h4>
      {entries.length === 0 ? <p className="insights-muted">暂无记录</p> : (
        <>
          <ul>{rows(entries.slice(0, 4))}</ul>
          {entries.length > 4 && <details><summary>展开其余 {entries.length - 4} 项</summary><ul>{rows(entries.slice(4))}</ul></details>}
        </>
      )}
    </div>
  )
}

function InsightsReport({ data, metric, onMetricChange }: {
  data: JournalInsights
  metric: TrendMetric
  onMetricChange: (metric: TrendMetric) => void
}) {
  return (
    <div className="insights-results">
      <div className="insight-cards journal-insight-cards">
        <InsightCard label="消费总额" value={currency.format(data.expenses.total)} detail={`${data.expenses.count} 笔有金额的消费`} />
        <InsightCard label="记录天数" value={`${data.recorded_days} 天`} detail={`${data.journal_entries} 份日志 · ${data.quick_notes} 条带时间的随记`} />
        <InsightCard label="平均心情" value={score(data.mood.average)} detail={`${data.mood.count} 次评分 · 满分 5 分`} />
        <InsightCard label="平均睡眠分数" value={score(data.sleep.quality.average)} detail={`${data.sleep.quality.count} 次评分`} />
      </div>
      {data.recorded_days === 0 ? <p className="insights-notice" role="status">这个时段还没有记录。</p> : (
        <>
          <Suspense fallback={<p className="insights-notice" role="status">正在加载趋势图…</p>}>
            <TrendChart data={data} metric={metric} onMetricChange={onMetricChange} />
          </Suspense>
          <div className="insights-panel-row">
            <Panel title="消费分类">
              {data.expenses.categories.length ? (
                <Bars rows={data.expenses.categories.map(({ label, total }) => ({ label, value: total }))} format={currency.format} />
              ) : <p className="insights-muted">暂无消费记录</p>}
            </Panel>
            <Panel title="消费用途">
              {data.expenses.uses.length ? (
                <ul className="insights-totals">{data.expenses.uses.map(({ label, count, total }) => (
                  <li key={label}><span>{label}<small>{count} 笔</small></span><strong>{currency.format(total)}</strong></li>
                ))}</ul>
              ) : <p className="insights-muted">暂无用途记录</p>}
            </Panel>
          </div>
          <Panel title="三餐记录">
            <div className="insights-meals">
              {data.meals.map((meal) => (
                <section key={meal.meal}>
                  <h3>{meals[meal.meal]}</h3>
                  <p className="insights-meal-total">{meal.count} 餐 <strong>{currency.format(meal.spending.total)}</strong></p>
                  <CountList title="吃了什么" entries={meal.foods} />
                  <CountList title="在哪消费" entries={meal.places} />
                </section>
              ))}
            </div>
          </Panel>
          <div className="insights-panel-row">
            <Panel title="心情分布">
              {data.mood.count ? (
                <Bars rows={data.mood.distribution.map(({ value, count }) => ({ label: `${value} 分`, value: count }))} format={(value) => `${value} 次`} />
              ) : <p className="insights-muted">暂无心情记录</p>}
            </Panel>
            <Panel title="Bristol 排便分类">
              {data.bristol.count ? (
                <>
                  <p className="insights-muted">共记录 {data.bristol.count} 次</p>
                  <Suspense fallback={<p className="insights-muted" role="status">正在加载分类图…</p>}>
                    <BristolChart distribution={data.bristol.distribution} />
                  </Suspense>
                </>
              ) : <p className="insights-muted">暂无排便记录</p>}
            </Panel>
          </div>
          {data.sleep.legacy_quality.count > 0 && (
            <Panel title="旧版睡眠质量">
              <p className="insights-muted">平均 {score(data.sleep.legacy_quality.average)} / 5 分 · {data.sleep.legacy_quality.count} 次评分</p>
            </Panel>
          )}
          <Panel title={data.period === 'year' || data.period === 'quarter' ? '每月明细' : '每日明细'}>
            <div className="insights-table-scroll">
              <table className="insights-table">
                <thead>
                  <tr><th scope="col">日期</th><th scope="col">消费</th><th scope="col">三餐</th><th scope="col">平均心情</th><th scope="col">排便次数</th><th scope="col">睡眠分数</th></tr>
                </thead>
                <tbody>
                  {data.trend.map((row) => (
                    <tr key={row.date}>
                      <th scope="row">{data.period === 'year' || data.period === 'quarter' ? row.date.slice(0, 7) : row.date.slice(5)}</th>
                      <td>{currency.format(row.expense_total)}</td><td>{row.meals}</td><td>{score(row.mood)}</td>
                      <td>{row.bristol}</td><td>{score(row.sleep_quality)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}

export function InsightsView({ documents }: { documents: ApiDocument[] }) {
  const [period, setPeriod] = useState<InsightsPeriod>('month')
  const [anchor, setAnchor] = useState<string | null>(null)
  const [metric, setMetric] = useState<TrendMetric>('expense_total')
  const { data, error, retry } = useInsights(period, anchor, documents)
  const today = journalCalendar.format(new Date())
  const canMoveForward = Boolean(data && data.end_date < today)

  return (
    <div className="feature-view insights-view">
      <div className="insights-page">
        <header className="insights-heading">
          <h1>统计中心</h1>
          <div className="period-switch" role="group" aria-label="统计周期">
            {periods.map(([value, label]) => (
              <button type="button" key={value} className={value === period ? 'selected' : ''}
                aria-pressed={value === period} onClick={() => setPeriod(value)}>{label}</button>
            ))}
          </div>
        </header>
        <div className="insights-dates">
          <div className="insights-date-nav" role="group" aria-label="切换统计时段">
            <button className="icon-button" type="button" aria-label="上一期" disabled={!data}
              onClick={() => data && setAnchor(shiftDate(data.start_date, -1))}><ChevronLeft size={17} aria-hidden="true" /></button>
            <span aria-live="polite">{data ? (data.start_date === data.end_date ? data.start_date : `${data.start_date} 至 ${data.end_date}`) : '统计时段'}</span>
            <button className="icon-button" type="button" aria-label="下一期" disabled={!canMoveForward}
              onClick={() => data && setAnchor(shiftDate(data.end_date, 1))}><ChevronRight size={17} aria-hidden="true" /></button>
          </div>
          {anchor && <button className="toolbar-button" type="button" onClick={() => setAnchor(null)}>回到本期</button>}
        </div>
        {data ? <InsightsReport data={data} metric={metric} onMetricChange={setMetric} /> : error ? (
          <div className="insights-notice" role="alert">统计暂时无法加载。<button type="button" className="toolbar-button" onClick={retry}>重试</button></div>
        ) : <p className="insights-notice" role="status">正在加载统计…</p>}
      </div>
    </div>
  )
}
