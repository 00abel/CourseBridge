import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import TopBar from '../components/TopBar.jsx'

const NOTION_COLUMNS = [
  ['Name', 'Title'], ['Course', 'Select'], ['Due Date', 'Date'], ['Status', 'Select'],
  ['Assignment Type', 'Select'], ['Points', 'Number'], ['Canvas ID', 'Text'],
  ['Canvas URL', 'URL'], ['Description', 'Text'], ['Last Synced', 'Date'],
]

// accepts a full notion link or a bare id
function extractDbId(value) {
  const trimmed = value.trim()
  const last = trimmed.split('?')[0].split('#')[0].replace(/\/+$/, '').split('/').pop()
  const match = last.replace(/-/g, '').match(/[0-9a-f]{32}$/i)
  return match ? match[0] : trimmed
}

export default function ConfigPage() {
  const navigate = useNavigate()

  const [info, setInfo] = useState(null)
  const [form, setForm] = useState({ canvasBaseUrl: '', canvasToken: '', notionToken: '', notionDbId: '' })
  const [status, setStatus] = useState(null)
  const [message, setMessage] = useState('')
  const [canvasBusy, setCanvasBusy] = useState(false)

  const loadConfig = async () => {
    const data = await api.config.get()
    setInfo(data)
    setForm(f => ({
      ...f,
      canvasBaseUrl: f.canvasBaseUrl || data.canvas.baseUrl,
      notionDbId: f.notionDbId || data.notion.dbId,
    }))
  }

  useEffect(() => {
    loadConfig().catch(err => {
      setStatus('error')
      setMessage(err.message)
    })
  }, [])

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const disconnectCanvas = async () => {
    if (!window.confirm('Disconnect Canvas? Syncing will stop until you connect again.')) return
    setCanvasBusy(true)
    try {
      await api.config.disconnectCanvas()
      await loadConfig()
      setStatus('success')
      setForm(f => ({ ...f, canvasToken: '' }))
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
    if (canvasBusy) return
    setStatus('loading')
    setMessage('')
    try {
      const result = await api.config.save({ ...form, notionDbId: extractDbId(form.notionDbId) })
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

  const { canvas, notion } = info

  return (
    <>
      <TopBar />

      <main className="page">
        <div className="conn-page">
          <div className="conn-intro">
            <h1>Connections</h1>
            <p>CourseBridge reads assignments from Canvas and writes them to one Notion database. Tokens are encrypted before they’re saved.</p>
            <ul className="checklist">
              <li><span className={`dot ${canvas.connected ? '' : 'dot-off'}`} aria-hidden="true" />
                Canvas {canvas.connected ? 'connected' : 'not connected'}</li>
              <li><span className={`dot ${notion.connected ? '' : 'dot-off'}`} aria-hidden="true" />
                Notion {notion.connected ? 'connected' : 'not connected'}</li>
            </ul>
          </div>

          <form onSubmit={handleSave} className="conn-form">
            {message && (
              <div className={`notice ${status === 'error' ? 'notice-error' : 'notice-success'}`} role="status">
                {message}
              </div>
            )}

            <section className="box conn-card" aria-labelledby="canvas-h">
              <div className="conn-head">
                <div>
                  <h2 id="canvas-h">Canvas</h2>
                  <p>Where assignments come from. Read only.</p>
                </div>
                <ConnBadge on={canvas.connected} />
              </div>

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
                <label className="label" htmlFor="canvasToken">Personal access token</label>
                <input
                  id="canvasToken"
                  name="canvasToken"
                  className="input"
                  type="password"
                  value={form.canvasToken}
                  onChange={handleChange}
                  placeholder={canvas.connected ? 'Saved. Leave blank to keep it.' : 'Paste your Canvas token'}
                />
                <span className="hint">In Canvas, open Account, then Settings, and click New Access Token. Schools that disable personal tokens cannot be connected.</span>
              </div>

              {canvas.connected && (
                <div className="conn-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={disconnectCanvas} disabled={canvasBusy || status === 'loading'}>
                    {canvasBusy ? 'Disconnecting' : 'Disconnect Canvas'}
                  </button>
                </div>
              )}
            </section>

            <section className="box conn-card" aria-labelledby="notion-h">
              <div className="conn-head">
                <div>
                  <h2 id="notion-h">Notion</h2>
                  <p>Where assignments go. Create an integration at notion.so/my-integrations, then share the database with it.</p>
                </div>
                <ConnBadge on={notion.connected} />
              </div>

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
                <label className="label" htmlFor="notionDbId">Database link or ID</label>
                <input
                  id="notionDbId"
                  name="notionDbId"
                  className="input mono"
                  value={form.notionDbId}
                  onChange={handleChange}
                  placeholder="https://www.notion.so/..."
                />
                <span className="hint">Paste the database link from Notion. The ID gets pulled out of it.</span>
              </div>

              <div className="columns-block">
                <h3>Required columns</h3>
                <ul className="columns">
                  {NOTION_COLUMNS.map(([name, type]) => (
                    <li key={name}>
                      <span>{name}</span>
                      <code>{type}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <div className="save-row">
              <button type="submit" className="btn btn-primary" disabled={status === 'loading' || canvasBusy}>
                {status === 'loading' && <span className="spinner" />}
                {status === 'loading' ? 'Checking connections' : 'Save and verify'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}

function ConnBadge({ on }) {
  return on
    ? <span className="badge badge-ok"><span className="dot" />Connected</span>
    : <span className="badge badge-off"><span className="dot dot-off" />Not connected</span>
}
