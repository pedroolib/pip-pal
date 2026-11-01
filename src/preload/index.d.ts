import type { PipApi } from '../shared/ipc'

declare global {
  interface Window {
    /** Undefined in a plain browser (no preload); use `api` from `@renderer/api`. */
    api: PipApi | undefined
  }
}
