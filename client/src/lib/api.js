const BASE_URL = import.meta.env.VITE_API_URL || ''

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

  let data
  try {
    data = await res.json()
  } catch {
    throw new Error('The server returned an unexpected response. Try again.')
  }

  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`)
    error.status = res.status
    throw error
  }

  return data
}

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

    disconnectCanvas: () => request('/config/canvas', { method: 'DELETE' }),

    save: (config) =>
      request('/config', { method: 'POST', body: JSON.stringify(config) }),
  },

  sync: {
    run: () => request('/sync', { method: 'POST' }),

    logs: () => request('/sync/logs'),

    stats: () => request('/sync/stats'),
  },
}
