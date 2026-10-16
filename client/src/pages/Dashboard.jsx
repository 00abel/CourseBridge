// pages/Dashboard.jsx
// The main view after logging in. Shows sync status, controls, and history.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import TopBar from '../components/TopBar.jsx'

export default function Dashboard() {
  const navigate = useNavigate()

  const [stats, setStats] = useState(null)
  const [logs, setLogs] = useState([])
  const [configured, setConfigured] = useState(null)  // null = loading
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [syncError, setSyncError] = useState(null)

  // Load dashboard data on mount
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [configData, statsData, logsData] = await Promise.all([
        api.config.get(),
        api.sync.stats().catch(() => null),
        api.sync.logs().catch(() => ({ logs: [] })),
      ])
      setConfigured(configData.configured)
      setStats(statsData)
      setLogs(logsData.logs || [])
    } catch (err) {
      console.error('Failed to load dashboard:', err)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    setSyncError(null)

    try {
      const result = await api.sync.run()
      setSyncResult(result)
      await loadData()  // Refresh stats and logs
    } catch (err) {
      setSyncError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const last = stats?.lastSyncResult

  return (
    <>
      <TopBar />

      <main className="page">
        <div className="page-head">
          <h1>Dashboard</h1>
          <p>Sync your Canvas assignments into Notion and see how past runs went.</p>
        </div>

        <div className="stack">
          {configured === false && (
            <div className="setup-banner">
              <div>
                <strong>Finish setting up</strong>
                <p>Connect Canvas and Notion before your first sync.</p>
              </div>
              <button className="btn btn-primary" onClick={() => navigate('/config')}>
                Connect accounts
              </button>
            </div>
          )}

          {stats && (
            <div className="stats">
              <StatCard label="Assignments synced" value={stats.totalAssignmentsSynced} />
              <StatCard
                label="Last sync"
                value={stats.lastSyncAt ? timeAgo(stats.lastSyncAt) : 'Never'}
              />
              <StatCard
                label="Last run"
                value={last ? `${last.created} new, ${last.updated} updated` : 'Nothing yet'}
                small
              />
            </div>
          )}

          <section className="card">
            <div className="sync-card">
              <div>
                <h2 className="card-title">Sync assignments</h2>
                <p className="card-desc">
                  Pulls every assignment from your Canvas courses into Notion. Run it as
                  often as you like. Assignments already in Notion get updated, not added twice.
                </p>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleSync}
                disabled={syncing || !configured}
              >
                {syncing && <span className="spinner" />}
                {syncing ? 'Syncing' : 'Sync now'}
              </button>
            </div>

            {syncResult && (
              <div className="notice notice-success sync-result">
                Sync finished. {syncResult.created} created, {syncResult.updated} updated
                {syncResult.failed > 0 && `, ${syncResult.failed} failed`}.
              </div>
            )}

            {syncError && <div className="notice notice-error sync-result">{syncError}</div>}
          </section>

          <section className="card">
            <h2 className="card-title" style={{ marginBottom: 16 }}>Sync history</h2>
            {logs.length === 0 ? (
              <p className="empty">No syncs yet. Your runs will show up here.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Created</th>
                    <th>Updated</th>
                    <th>Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td>{formatDate(log.syncedAt)}</td>
                      <td><span className="pill pill-new">+{log.created}</span></td>
                      <td><span className="pill pill-upd">{log.updated}</span></td>
                      <td>
                        <span className={`pill ${log.failed > 0 ? 'pill-fail' : 'pill-zero'}`}>
                          {log.failed}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </main>
    </>
  )
}

function StatCard({ label, value, small = false }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${small ? ' small' : ''}`}>{value}</div>
    </div>
  )
}

// Helpers
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  })
}
