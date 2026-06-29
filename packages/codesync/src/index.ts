export {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_MAX_FILE_BYTES,
  MAX_SYNC_INSTANCES
} from './shared/constants.js'

export {
  CODESYNC_CHANNELS,
  type CodeSyncApi,
  type CodeSyncConfig,
  type LogEntry,
  type StartSyncPayload,
  type StartSyncResult,
  type SyncInstanceConfig,
  type SyncStatus
} from './api.js'

export {
  registerCodeSyncIpc,
  type CodeSyncConfigStore,
  type CodeSyncHandle,
  type RegisterCodeSyncOptions
} from './ipc.js'

export { SyncManager } from './sync/manager.js'
export { isUnderOrEqual, relUnder, conflictMessage } from './sync/pathConflict.js'
export {
  resolveSyncDestRoot,
  sourceContextFolderName,
  sourceFolderBasename
} from './sync/destRoot.js'
export {
  DEFAULT_IGNORES,
  compileIgnoreMatchers,
  getIgnoreGlobList,
  isIgnoredRel,
  parseUserIgnoreLines
} from './sync/ignore.js'
export { validateConfigSave, validateSyncStart } from './validate.js'
