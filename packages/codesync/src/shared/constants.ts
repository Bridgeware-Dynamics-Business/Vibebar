/** Max concurrent sync instances (watchers + mirrors). */
export const MAX_SYNC_INSTANCES = 16

/** Default per-file size cap for mirroring (100 MB). 0 / null = unlimited. */
export const DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024

/** Default debounce between a filesystem change and the next mirror pass. */
export const DEFAULT_DEBOUNCE_MS = 350
