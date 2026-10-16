// pages/ConfigPage.jsx
// Where users connect Canvas and Notion.
//
// Canvas can be connected two ways:
//   1. "Connect with Canvas" (OAuth). Shown only when the server has a Developer Key.
//   2. Pasting a personal access token. Always available as a fallback.

import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import TopBar from '../components/TopBar.jsx'

// Messages for the ?canvas=error&reason=... flag the backend sends back
const OAUTH_ERRORS = {
  denied: 'You cancelled the Canvas authorization. Nothing was connected.',
  invalid_state: 'That Canvas login link expired or was already used. Please try again.',
  missing_code: 'Canvas did not return an authorization code. Please try again.',
  exchange_failed: 'Canvas approved the login, but the token exchange failed. Please try again.',
  canvas_error: 'Canvas returned an error during authorization.',
}

const NOTION_COLUMNS = [
  ['Name', 'Title'], ['Course', 'Select'], ['Due Date', 'Date'], ['Status', 'Select'],
  ['Assignment Type', 'Select'], ['Points', 'Number'], ['Canvas ID', 'Text'],
  ['Canvas URL', 'URL'], ['Description', 'Text'], ['Last Synced', 'Date'],
]

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
    return (
      <>
        <TopBar />
        <main className="page"><p className="hint">{message || 'Loading...'}</p></main>
      </>
    )
  }

  const { canvas, notion, oauthAvailable } = info

  return (
    <>
      <TopBar />

      <main className="page" style={{ maxWidth: 680 }}>
        <button className="back" onClick={() => navigate('/dashboard')}>← Back to dashboard</button>
        <div className="page-head">
          <h1>Connect your accounts</h1>
          <p>Your tokens are encrypted before they're saved and only used to sync assignments.</p>
        </div>

        {message && (
          <div className={`notice ${status === 'error' ? 'notice-error' : 'notice-success'}`}
            style={{ marginBottom: 20 }} role="status">
            {message}
          </div>
        )}

        <form onSubmit={handleSave} className="stack">
          <section className="card">
            <div className="step-head">
              <span className="step-num">1</span>
              <div>
                <h2 className="card-title">Canvas</h2>
                <p className="card-desc">Where your assignments come from. CourseBridge only reads from it.</p>
              </div>
            </div>

            <div className="step-body">
              {canvas.connected && (
                <div className="connected">
                  <div>
                    <div className="connected-label">Connected</div>
                    <div className="connected-detail">
                      {canvas.authType === 'oauth'
                        ? `Signed in with Canvas${canvas.userName ? ` as ${canvas.userName}` : ''}`
                        : `Personal token for ${canvas.baseUrl}`}
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={disconnectCanvas} disabled={canvasBusy}>
                    Disconnect
                  </button>
                </div>
              )}

              {oauthAvailable && (
                <button type="button" className="btn btn-canvas btn-block" onClick={connectWithCanvas} disabled={canvasBusy}>
                  {canvasBusy ? 'Opening Canvas...' : canvas.authType === 'oauth' ? 'Reconnect with Canvas' : 'Connect with Canvas'}
                </button>
              )}

              {oauthAvailable && (
                <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }}
                  onClick={() => setShowTokenForm(v => !v)}>
                  {showTokenForm ? 'Hide the personal token option' : 'Use a personal access token instead'}
                </button>
              )}

              {showTokenForm && (
                <>
                  <div className="field">
                    <label className="label" htmlFor="canvasBaseUrl">Canvas URL</label>
                    <input
                      id="canvasBaseUrl"
                      name="canvasBaseUrl"
                      className="input"
                      value={form.canvasBaseUrl}
                      onChange={handleChange}
                      placeholder="https://canvas.university.edu"
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="canvasToken">Access token</label>
                    <input
                      id="canvasToken"
                      name="canvasToken"
                      className="input"
                      type="password"
                      value={form.canvasToken}
                      onChange={handleChange}
                      placeholder={canvas.connected ? 'Leave blank to keep the current connection' : 'Paste your Canvas token'}
                    />
                    <span className="hint">In Canvas, open Account, then Settings, and click New Access Token.</span>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="card">
            <div className="step-head">
              <span className="step-num">2</span>
              <div>
                <h2 className="card-title">Notion</h2>
                <p className="card-desc">
                  Where your assignments go. Create an integration at notion.so/my-integrations,
                  then share your database with it.
                </p>
              </div>
            </div>

            <div className="step-body">
              <div className="field">
                <label className="label" htmlFor="notionToken">Integration token</label>
                <input
                  id="notionToken"
                  name="notionToken"
                  className="input"
                  type="password"
                  value={form.notionToken}
                  onChange={handleChange}
                  placeholder={notion.connected ? 'Saved. Leave blank to keep it.' : 'secret_...'}
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="notionDbId">Database ID</label>
                <input
                  id="notionDbId"
                  name="notionDbId"
                  className="input"
                  value={form.notionDbId}
                  onChange={handleChange}
                  placeholder="32 character ID from your database URL"
                />
                <span className="hint">Open the database in Notion and copy the part of the URL after the last slash.</span>
              </div>

              <details className="columns-help">
                <summary>Which columns does the database need?</summary>
                <div className="columns">
                  {NOTION_COLUMNS.map(([name, type]) => (
                    <div key={name} className="column">
                      <span>{name}</span>
                      <code>{type}</code>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </section>

          <button type="submit" className="btn btn-primary btn-block" disabled={status === 'loading'}>
            {status === 'loading' && <span className="spinner" />}
            {status === 'loading' ? 'Checking your connections' : 'Save and verify'}
          </button>
        </form>
      </main>
    </>
  )
}
