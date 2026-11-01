import { createMockApi } from '@shared/mock-api'

// Use this, never `window.api` directly. Opened in a plain browser (Factory review, design work) there is
// no preload, so the UI runs on the fixtures instead of crashing.
export const api = window.api ?? createMockApi()
