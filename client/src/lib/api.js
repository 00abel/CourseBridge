// lib/api.js
// All API calls go through this file.
// It automatically attaches the auth token to every request.

const BASE_URL = import.meta.env.VITE_API_URL || ''

/**
 * Core fetch wrapper. Adds auth header, parses JSON, throws on errors.
 */
async function request(path, options = {}) {
  const token = localStorage.getItem('token')

  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  const data = await res.json()

  if (!res.ok) {
    // Throw an error with the server's message
    throw new Error(data.error || `Request failed (${res.status})`)
  }

  return data
}

// ── Auth ───────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    register: (email, password) =>
      request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),

    login: (email, password) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

    me: () => request('/auth/me'),
  },

  config: {
    get: () => request('/config'),

    save: (config) =>
      request('/config', { method: 'POST', body: JSON.stringify(config) }),
  },

  canvasOAuth: {
    // Is "Connect with Canvas" available on this server?
    status: () => request('/canvas/oauth/status'),

    // Returns { url } for the Canvas login + consent page
    start: () => request('/canvas/oauth/start'),

    disconnect: () => request('/canvas/oauth', { method: 'DELETE' }),
  },

  sync: {
    run: () => request('/sync', { method: 'POST' }),

    logs: () => request('/sync/logs'),

    stats: () => request('/sync/stats'),
  },
}
