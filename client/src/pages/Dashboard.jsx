// pages/Dashboard.jsx
// The main view after logging in. Shows sync status, controls, and history.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { api } from '../lib/api.js'

export default function Dashboard() {
  const { user, logout } = useAuth()
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

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div style={styles.page}>
      {/* Navbar */}
      <nav style={styles.nav}>
        <div style={styles.navBrand}>⇄ CourseBridge</div>
        <div style={styles.navActions}>
          <span style={styles.navEmail}>{user?.email}</span>
          <button style={styles.navBtn} onClick={() => navigate('/config')}>Settings</button>
          <button style={styles.navBtn} onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <main style={styles.main}>
        {/* Setup banner if not configured */}
        {configured === false && (
          <div style={styles.setupBanner}>
            <div>
              <div style={styles.setupTitle}>Set up your connections</div>
              <div style={styles.setupDesc}>Connect Canvas and Notion to start syncing.</div>
            </div>
            <button style={styles.setupBtn} onClick={() => navigate('/config')}>
              Get started →
            </button>
          </div>
        )}

        {/* Stats row */}
        {stats && (
          <div style={styles.statsRow}>
            <StatCard
              label="Assignments synced"
              value={stats.totalAssignmentsSynced}
            />
            <StatCard
              label="Last sync"
              value={stats.lastSyncAt ? timeAgo(stats.lastSyncAt) : 'Never'}
            />
            {stats.lastSyncResult && (
              <StatCard
                label="Last run"
                value={`+${stats.lastSyncResult.created} new, ${stats.lastSyncResult.updated} updated`}
              />
            )}
          </div>
        )}

        {/* Sync button */}
        <div style={styles.syncCard}>
          <div>
            <h2 style={styles.syncTitle}>Sync assignments</h2>
            <p style={styles.syncDesc}>
              Pulls all assignments from your Canvas courses and pushes them into Notion.
              You can run this as often as you like. Assignments already in Notion get updated instead of added again.
            </p>
          </div>

          <button
            style={{ ...styles.syncBtn, opacity: syncing || !configured ? 0.5 : 1 }}
            onClick={handleSync}
            disabled={syncing || !configured}
          >
            {syncing ? (
              <span style={styles.syncBtnInner}>
                <span style={styles.spinner} /> Syncing...
              </span>
            ) : 'Sync now'}
          </button>

          {/* Sync result */}
          {syncResult && (
            <div style={styles.resultBox}>
              <span style={styles.resultGreen}>✓ Sync complete</span>
              &nbsp;—&nbsp;
              {syncResult.created} created, {syncResult.updated} updated
              {syncResult.failed > 0 && (
                <span style={styles.resultRed}>, {syncResult.failed} failed</span>
              )}
            </div>
          )}

          {syncError && (
            <div style={{ ...styles.resultBox, ...styles.resultBoxError }}>
              {syncError}
            </div>
          )}
        </div>

        {/* Sync history */}
        {logs.length > 0 && (
          <div style={styles.logsCard}>
            <h2 style={styles.logsTitle}>Sync history</h2>
            <table style={styles.table}>
              <thead>
                <tr>
                  {['Date', 'Created', 'Updated', 'Failed'].map(h => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td style={styles.td}>{formatDate(log.syncedAt)}</td>
                    <td style={styles.td}><span style={styles.badgeGreen}>+{log.created}</span></td>
                    <td style={styles.td}><span style={styles.badgeBlue}>{log.updated}</span></td>
                    <td style={styles.td}>
                      {log.failed > 0
                        ? <span style={styles.badgeRed}>{log.failed}</span>
                        : <span style={styles.badgeGray}>0</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
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

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#0f0f10',
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    color: '#f0f0f0',
  },
  nav: {
    alignItems: 'center',
    borderBottom: '1px solid #1f1f22',
    display: 'flex',
    justifyContent: 'space-between',
    padding: '14px 32px',
  },
  navBrand: {
    color: '#f0f0f0',
    fontSize: '15px',
    fontWeight: '600',
  },
  navActions: {
    alignItems: 'center',
    display: 'flex',
    gap: '12px',
  },
  navEmail: {
    color: '#555',
    fontSize: '13px',
  },
  navBtn: {
    background: 'none',
    border: '1px solid #2a2a2d',
    borderRadius: '6px',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '5px 12px',
  },
  main: {
    maxWidth: '720px',
    margin: '0 auto',
    padding: '40px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  setupBanner: {
    alignItems: 'center',
    backgroundColor: '#111820',
    border: '1px solid #1e3048',
    borderRadius: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    padding: '20px 24px',
  },
  setupTitle: {
    color: '#7ab3e0',
    fontWeight: '600',
    marginBottom: '4px',
  },
  setupDesc: {
    color: '#556',
    fontSize: '14px',
  },
  setupBtn: {
    backgroundColor: '#5865f2',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    padding: '10px 20px',
    whiteSpace: 'nowrap',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '16px',
  },
  statCard: {
    backgroundColor: '#1a1a1d',
    border: '1px solid #2a2a2d',
    borderRadius: '10px',
    padding: '16px 20px',
  },
  statValue: {
    fontSize: '22px',
    fontWeight: '700',
    marginBottom: '4px',
    letterSpacing: '-0.5px',
  },
  statLabel: {
    color: '#666',
    fontSize: '12px',
  },
  syncCard: {
    backgroundColor: '#1a1a1d',
    border: '1px solid #2a2a2d',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '28px',
  },
  syncTitle: {
    fontSize: '18px',
    fontWeight: '600',
    margin: '0 0 6px',
  },
  syncDesc: {
    color: '#666',
    fontSize: '14px',
    lineHeight: '1.5',
    margin: 0,
  },
  syncBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#5865f2',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '600',
    padding: '11px 28px',
    transition: 'opacity 0.15s',
  },
  syncBtnInner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  spinner: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  resultBox: {
    backgroundColor: '#0d2010',
    border: '1px solid #1a4020',
    borderRadius: '8px',
    color: '#aaa',
    fontSize: '14px',
    padding: '12px 16px',
  },
  resultBoxError: {
    backgroundColor: '#2a1515',
    borderColor: '#5a2020',
    color: '#f87171',
  },
  resultGreen: { color: '#4ade80' },
  resultRed: { color: '#f87171' },
  logsCard: {
    backgroundColor: '#1a1a1d',
    border: '1px solid #2a2a2d',
    borderRadius: '12px',
    padding: '24px',
  },
  logsTitle: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 16px',
  },
  table: {
    borderCollapse: 'collapse',
    width: '100%',
  },
  th: {
    borderBottom: '1px solid #2a2a2d',
    color: '#666',
    fontSize: '12px',
    fontWeight: '500',
    padding: '8px 12px',
    textAlign: 'left',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  td: {
    borderBottom: '1px solid #1a1a1d',
    color: '#ccc',
    fontSize: '14px',
    padding: '10px 12px',
  },
  badgeGreen: {
    backgroundColor: '#0d2010', color: '#4ade80',
    borderRadius: '4px', padding: '2px 8px', fontSize: '13px',
  },
  badgeBlue: {
    backgroundColor: '#0d1520', color: '#60a5fa',
    borderRadius: '4px', padding: '2px 8px', fontSize: '13px',
  },
  badgeRed: {
    backgroundColor: '#2a1515', color: '#f87171',
    borderRadius: '4px', padding: '2px 8px', fontSize: '13px',
  },
  badgeGray: {
    color: '#444', fontSize: '13px', padding: '2px 8px',
  },
}
