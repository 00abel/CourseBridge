import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import TopBar from '../components/TopBar.jsx'

export default function Dashboard() {
  const [config, setConfig] = useState(null)
  const [stats, setStats] = useState(null)
  const [logs, setLogs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadErrors, setLoadErrors] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [syncError, setSyncError] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const results = await Promise.allSettled([
      api.config.get(),
      api.sync.stats(),
      api.sync.logs(),
    ])
    const setters = [setConfig, setStats, data => setLogs(data.logs || [])]
    const labels = ['connections', 'sync totals', 'sync history']
    const errors = []
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        setters[index](result.value)
      } else {
        if (index === 0) setConfig(null)
        if (index === 1) setStats(null)
        if (index === 2) setLogs(null)
        errors.push(labels[index])
      }
    })
    setLoadErrors(errors)
    setLoading(false)
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    setSyncError(null)

    try {
      const result = await api.sync.run()
      setSyncResult(result)
      await loadData()
    } catch (err) {
      setSyncError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const configured = config?.configured
  const last = stats?.lastSyncResult
  const total = stats?.totalAssignmentsSynced ?? '—'
  const notionUrl = config?.notion.dbId
    ? `https://www.notion.so/${config.notion.dbId.replace(/-/g, '')}`
    : null

  let badge = null
  let title = ''
  let subtitle = ''

  if (config && !configured) {
    badge = <span className="badge badge-off"><span className="dot dot-off" />Not connected</span>
    title = 'Finish setting up.'
    subtitle = 'Connect Canvas and Notion before your first sync.'
  } else if (configured && !stats) {
    title = loading ? 'Loading sync status…' : 'Sync status unavailable.'
    subtitle = loading ? '' : 'Retry loading to check your last sync.'
  } else if (configured && !stats.lastSyncAt) {
    badge = <span className="badge badge-off"><span className="dot dot-off" />Not synced yet</span>
    title = 'Ready for your first sync.'
    subtitle = 'Import assignments from your active Canvas courses into Notion.'
  } else if (configured && last?.failed > 0) {
    badge = <span className="badge badge-fail"><span className="dot" />{last.failed} failed</span>
    title = 'Some assignments didn’t sync.'
    subtitle = `Last synced ${timeAgo(stats.lastSyncAt)}. Run it again to retry.`
  } else if (configured) {
    badge = <span className="badge badge-ok"><span className="dot" />Completed</span>
    title = 'Last sync completed.'
    subtitle = `Last synced ${timeAgo(stats.lastSyncAt)}. ${total} ${total === 1 ? 'assignment' : 'assignments'} tracked for this connection.`
  }

  return (
    <>
      <TopBar />

      <main className="page">
        <section className="hero" aria-labelledby="status">
          <div className="hero-text">
            {badge}
            <h1 id="status">{title || (loading ? 'Loading dashboard…' : 'Dashboard')}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="hero-actions">
            {config && !configured ? (
              <Link to="/config" className="btn btn-primary">Connect accounts</Link>
            ) : (
              <>
                {notionUrl && (
                  <a href={notionUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                    Open in Notion
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M5 2h7v7M12 2 3 11" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                  </a>
                )}
                <button className="btn btn-primary" onClick={handleSync} disabled={syncing || !configured}>
                  {syncing ? <span className="spinner" /> : <SyncIcon />}
                  {syncing ? 'Syncing' : 'Sync now'}
                </button>
              </>
            )}
          </div>
        </section>

        {loadErrors.length > 0 && (
          <div className="notice notice-error" role="alert">
            Couldn’t load {loadErrors.join(', ')}.{' '}
            <button type="button" className="link-btn" onClick={loadData} disabled={loading}>
              {loading ? 'Loading…' : 'Retry'}
            </button>
          </div>
        )}

        {syncResult && (
          <div className={`notice ${syncResult.failed > 0 ? 'notice-error' : 'notice-success'} sync-result`} role="status">
            {syncResult.failed > 0 ? 'Sync finished with errors.' : 'Sync finished.'} {syncResult.created} added, {syncResult.updated} updated
            {syncResult.failed > 0 && `, ${syncResult.failed} failed`}.
            {syncResult.errors?.length > 0 && (
              <ul>
                {syncResult.errors.map((error, index) => (
                  <li key={index}>{error.assignment}: {error.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {syncError && <div className="notice notice-error sync-result" role="alert">{syncError}</div>}

        <section className="box totals" aria-label="Totals">
          <Total label="Assignments tracked" value={total} />
          <Total label="Added last run" value={last ? `+${last.created}` : stats ? '0' : '—'} className={last?.created ? 'added' : ''} />
          <Total label="Updated last run" value={last?.updated ?? (stats ? 0 : '—')} />
          <Total label="Failed last run" value={last?.failed ?? (stats ? 0 : '—')} className={last?.failed ? 'failed' : ''} />
        </section>

        <div className="dash-grid">
          <section className="dash-main" aria-labelledby="history">
            <h2 id="history" className="section-title">Sync history</h2>
            <div className="box table-wrap">
              {loading ? (
                <p className="empty" role="status">Loading history…</p>
              ) : logs === null ? (
                <p className="empty">Sync history unavailable. Retry loading above.</p>
              ) : logs.length === 0 ? (
                <p className="empty">No syncs yet. Runs will show up here.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Added</th>
                      <th scope="col">Updated</th>
                      <th scope="col">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id}>
                        <td>{formatDate(log.syncedAt)}</td>
                        <td className={`num ${log.created > 0 ? 'added' : 'zero'}`}>+{log.created}</td>
                        <td className="num">{log.updated}</td>
                        <td className={`num ${log.failed > 0 ? 'failed' : 'zero'}`}>{log.failed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <aside className="dash-side" aria-labelledby="conn">
            <h2 id="conn" className="section-title">Connections</h2>
            <div className="box">
              <ConnRow
                name="Canvas"
                on={config?.canvas.connected}
                detail={!config ? 'Status unavailable' : config.canvas.connected ? hostOf(config.canvas.baseUrl) : 'Not connected'}
              />
              <ConnRow
                name="Notion"
                on={config?.notion.connected}
                detail={!config ? 'Status unavailable' : config.notion.connected ? 'Assignments database' : 'Not connected'}
              />
            </div>
          </aside>
        </div>
      </main>
    </>
  )
}

function Total({ label, value, className = '' }) {
  return (
    <div className="total">
      <div className="total-label">{label}</div>
      <div className={`total-value ${className}`}>{value}</div>
    </div>
  )
}

function ConnRow({ name, on, detail }) {
  return (
    <div className="conn-row">
      <span className={`dot ${on ? '' : 'dot-off'}`} aria-hidden="true" />
      <div>
        <div className="conn-name">{name}</div>
        <div className="conn-detail">{detail}</div>
      </div>
      <Link to="/config">Manage</Link>
    </div>
  )
}

function SyncIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13.5 8a5.5 5.5 0 0 1-9.7 3.5M2.5 8a5.5 5.5 0 0 1 9.7-3.5M12.5 1.5v3h-3M3.5 14.5v-3h3"
        stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function hostOf(url) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  })
}
