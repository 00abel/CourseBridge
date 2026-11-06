export function getCanvasUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('Enter a valid Canvas URL.')
  }

  const local = process.env.NODE_ENV !== 'production' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.port && !local)) {
    throw new Error('Use the Canvas website address with https and no extra path.')
  }

  // only send tokens to schools listed by the server owner
  const hosts = (process.env.CANVAS_ALLOWED_HOSTS || '').split(',').map(host => host.trim().toLowerCase())
  if (!local && !hosts.includes(url.hostname)) {
    throw new Error('This Canvas school is not enabled. Ask the app owner to add it.')
  }
  return url.origin
}
