// pages/ConfigPage.jsx
// Where users connect Canvas and Notion.
//
// Canvas can be connected two ways:
//   1. "Connect with Canvas" (OAuth). Shown only when the server has a Developer Key.
//   2. Pasting a personal access token. Always available as a fallback.

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api.js'

// Messages for the ?canvas=error&reason=... flag the backend sends back
const OAUTH_ERRORS = {
  denied: 'You cancelled the Canvas authorization. Nothing was connected.',
  invalid_state: 'That Canvas login link expired or was already used. Please try again.',
  missing_code: 'Canvas did not return an authorization code. Please try again.',
  exchange_failed: 'Canvas approved the login, but the token exchange failed. Please try again.',
  canvas_error: 'Canvas returned an error during authorization.',
}

export default function ConfigPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [info, setInfo] = useState(null) // response from GET /api/config
  const [form, setForm] = useState({ canvasBaseUrl: '', canvasToken: '', notionToken: '', notionDbId: '' })
  const [showTokenForm, setShowTokenForm] = useState(false)
  const [status, setStatus] = useState(null) // null | 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('')
  const [canvasBusy, setCanvasBusy] = useState(false)

  const loadConfig = async () => {
    const data = await api.config.get()
    setInfo(data)
    setForm(f => ({
      ...f,
      canvasBaseUrl: f.canvasBaseUrl || (data.canvas.authType === 'token' ? data.canvas.baseUrl : ''),
      notionDbId: f.notionDbId || data.notion.dbId,
    }))
    // No OAuth on this server: the token form is the only option, so show it
    if (!data.oauthAvailable) setShowTokenForm(true)
  }

  useEffect(() => {
    loadConfig().catch(err => {
      setStatus('error')
      setMessage(err.message)
    })
  }, [])

  // Handle the redirect back from Canvas (?canvas=connected or ?canvas=error)
  useEffect(() => {
    const result = searchParams.get('canvas')
    if (!result) return
    if (result === 'connected') {
      setStatus('success')
      setMessage('Canvas connected. Add your Notion details below if you have not yet.')
    } else {
      setStatus('error')
      setMessage(OAUTH_ERRORS[searchParams.get('reason')] || 'Canvas connection failed.')
    }
    setSearchParams({}, { replace: true }) // clean the URL so a refresh doesn't repeat the message
  }, [searchParams])

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const connectWithCanvas = async () => {
    setCanvasBusy(true)
    try {
      const { url } = await api.canvasOAuth.start()
      window.location.href = url // leave our app and go to the Canvas login page
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
      setCanvasBusy(false)
    }
  }

  const disconnectCanvas = async () => {
    if (!window.confirm('Disconnect Canvas? Syncing will stop until you connect again.')) return
    setCanvasBusy(true)
    try {
      await api.canvasOAuth.disconnect()
      await loadConfig()
      setStatus('success')
      setMessage('Canvas disconnected.')
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    } finally {
      setCanvasBusy(false)
    }
  }

  const handleSave = async e => {
    e.preventDefault()
    setStatus('loading')
    setMessage('')
    try {
      const result = await api.config.save(form)
      setStatus('success')
      setMessage(result.message)
      setTimeout(() => navigate('/dashboard'), 1500)
    } catch (err) {
      setStatus('error')
      setMessage(err.message)
    }
  }

  if (!info) {
    return <div style={{ ...styles.page, color: '#666' }}>{message || 'Loading...'}</div>
  }

  const { canvas, notion, oauthAvailable } = info

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <button style={styles.back} onClick={() => navigate('/dashboard')}>← Back</button>
          <h1 style={styles.title}>Connect your accounts</h1>
          <p style={styles.subtitle}>Tokens are encrypted before they are stored and only used to sync your assignments.</p>
        </div>

        {message && (
          <div style={{ ...styles.message, ...(status === 'error' ? styles.messageError : styles.messageSuccess), marginBottom: 24 }}>
            {message}
          </div>
        )}

        <form onSubmit={handleSave} style={styles.form}>
          {/* ── Canvas ── */}
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Canvas LMS</h2>
            </div>

            {canvas.connected && (
              <div style={styles.connectedRow}>
                <div>
                  <div style={styles.connectedLabel}>● Connected</div>
                  <div style={styles.connectedDetail}>
                    {canvas.authType === 'oauth'
                      ? `Signed in with Canvas${canvas.userName ? ` as ${canvas.userName}` : ''}`
                      : `Personal token for ${canvas.baseUrl}`}
                  </div>
                </div>
                <button type="button" style={styles.secondaryBtn} onClick={disconnectCanvas} disabled={canvasBusy}>
                  Disconnect
                </button>
              </div>
            )}

            {oauthAvailable && (
              <button type="button" style={styles.canvasBtn} onClick={connectWithCanvas} disabled={canvasBusy}>
                {canvasBusy ? 'Opening Canvas...' : canvas.authType === 'oauth' ? 'Reconnect with Canvas' : 'Connect with Canvas'}
              </button>
            )}

            {oauthAvailable && (
              <button type="button" style={styles.linkBtn} onClick={() => setShowTokenForm(v => !v)}>
                {showTokenForm ? 'Hide personal token option' : 'Or use a personal access token instead'}
              </button>
            )}

            {showTokenForm && (
              <>
                <p style={styles.sectionDesc}>Get a token in Canvas: Account → Settings → New Access Token</p>
                <div style={styles.field}>
                  <label style={styles.label}>Canvas URL</label>
                  <input
                    name="canvasBaseUrl"
                    value={form.canvasBaseUrl}
                    onChange={handleChange}
                    style={styles.input}
                    placeholder="https://canvas.university.edu"
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Access Token</label>
                  <input
                    name="canvasToken"
                    value={form.canvasToken}
                    onChange={handleChange}
                    style={styles.input}
                    type="password"
                    placeholder={canvas.connected ? 'Leave blank to keep the current connection' : 'Paste your Canvas token'}
                  />
                </div>
              </>
            )}
          </section>

          {/* ── Notion ── */}
          <section style={styles.section}>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Notion</h2>
              <p style={styles.sectionDesc}>
                Create an integration at notion.so/my-integrations, then share your database with it.
              </p>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Integration Token</label>
              <input
                name="notionToken"
                value={form.notionToken}
                onChange={handleChange}
                style={styles.input}
                type="password"
                placeholder={notion.connected ? 'Saved. Leave blank to keep it.' : 'secret_...'}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Database ID</label>
              <input
                name="notionDbId"
                value={form.notionDbId}
                onChange={handleChange}
                style={styles.input}
                placeholder="32-character ID from your database URL"
              />
              <span style={styles.hint}>Open your Notion database and copy the ID from the URL (the part after the last /)</span>
            </div>
          </section>

          {/* Required columns reminder */}
          <div style={styles.reminder}>
            <p style={styles.reminderTitle}>Your Notion database needs these columns:</p>
            <div style={styles.columns}>
              {[
                ['Name', 'Title'], ['Course', 'Select'], ['Due Date', 'Date'], ['Status', 'Select'],
                ['Assignment Type', 'Select'], ['Points', 'Number'], ['Canvas ID', 'Text'],
                ['Canvas URL', 'URL'], ['Description', 'Text'], ['Last Synced', 'Date'],
              ].map(([name, type]) => (
                <div key={name} style={styles.column}>
                  <span style={styles.columnName}>{name}</span>
                  <span style={styles.columnType}>{type}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            style={{ ...styles.button, opacity: status === 'loading' ? 0.6 : 1 }}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? 'Verifying connections...' : 'Save and verify'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', backgroundColor: '#0f0f10', fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", color: '#f0f0f0', padding: '40px 20px' },
  container: { maxWidth: '600px', margin: '0 auto' },
  header: { marginBottom: '32px' },
  back: { background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '14px', padding: '0 0 16px', display: 'block' },
  title: { fontSize: '28px', fontWeight: '700', margin: '0 0 8px', letterSpacing: '-0.5px' },
  subtitle: { color: '#666', fontSize: '14px', margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '24px' },
  section: { backgroundColor: '#1a1a1d', border: '1px solid #2a2a2d', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  sectionHeader: { marginBottom: '4px' },
  sectionTitle: { fontSize: '16px', fontWeight: '600', margin: '0 0 4px', color: '#f0f0f0' },
  sectionDesc: { color: '#666', fontSize: '13px', margin: 0 },
  connectedRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', backgroundColor: '#0d2010', border: '1px solid #1a4020', borderRadius: '8px', padding: '12px 14px' },
  connectedLabel: { color: '#4ade80', fontSize: '13px', fontWeight: '600' },
  connectedDetail: { color: '#9ca3af', fontSize: '13px', marginTop: '2px' },
  canvasBtn: { backgroundColor: '#e13f2b', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '15px', fontWeight: '600', padding: '12px' },
  secondaryBtn: { background: 'none', border: '1px solid #3a3a3d', borderRadius: '6px', color: '#ccc', cursor: 'pointer', fontSize: '13px', padding: '6px 12px', whiteSpace: 'nowrap' },
  linkBtn: { alignSelf: 'flex-start', background: 'none', border: 'none', color: '#5865f2', cursor: 'pointer', fontSize: '13px', padding: 0 },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { color: '#aaa', fontSize: '13px', fontWeight: '500' },
  input: { backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', color: '#f0f0f0', fontSize: '14px', padding: '10px 14px', outline: 'none' },
  hint: { color: '#555', fontSize: '12px' },
  reminder: { backgroundColor: '#111820', border: '1px solid #1e3048', borderRadius: '12px', padding: '20px' },
  reminderTitle: { color: '#7ab3e0', fontSize: '13px', fontWeight: '600', margin: '0 0 12px' },
  columns: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' },
  column: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0d1520', borderRadius: '6px', padding: '6px 10px' },
  columnName: { color: '#ddd', fontSize: '12px' },
  columnType: { color: '#556', fontSize: '11px', fontFamily: 'monospace' },
  message: { borderRadius: '8px', fontSize: '14px', padding: '12px 16px' },
  messageSuccess: { backgroundColor: '#0d2010', border: '1px solid #1a4020', color: '#4ade80' },
  messageError: { backgroundColor: '#2a1515', border: '1px solid #5a2020', color: '#f87171' },
  button: { backgroundColor: '#5865f2', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '15px', fontWeight: '600', padding: '13px', transition: 'opacity 0.15s' },
}
