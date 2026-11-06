import { decrypt } from './crypto.js'

export function getCanvasCredentials(config) {
  if (!config?.canvasToken || !config?.canvasBaseUrl || (config.canvasAuthType && config.canvasAuthType !== 'token')) {
    throw new Error('Add a Canvas personal access token in Settings before syncing.')
  }
  return { baseUrl: config.canvasBaseUrl, token: decrypt(config.canvasToken) }
}
