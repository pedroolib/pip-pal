import type { PipApi } from '../shared/ipc'

declare global {
  interface Window {
    api: PipApi
  }
}
