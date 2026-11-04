import {
  getPendingSyncActions,
  removeSyncAction,
  saveOfflinePage,
  getOfflinePage,
  getQueuedOfflineFiles,
  removeQueuedOfflineFile,
} from './offlineStorage';
import { api } from './api';

export type SyncState = 'idle' | 'syncing' | 'synced' | 'failed' | 'offline';

type SyncListener = (state: SyncState, message?: string) => void;

class SyncManager {
  private isSyncing = false;
  private listeners: Set<SyncListener> = new Set();
  private currentState: SyncState = navigator.onLine ? 'idle' : 'offline';

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.updateState('idle', 'Internet connection restored');
        this.syncAll();
      });

      window.addEventListener('offline', () => {
        this.updateState('offline', 'Working offline');
      });
    }
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => this.listeners.delete(listener);
  }

  private updateState(state: SyncState, message?: string) {
    this.currentState = state;
    for (const listener of this.listeners) {
      try {
        listener(state, message);
      } catch (e) {
        console.error('Error in sync listener:', e);
      }
    }
  }

  public async syncAll(): Promise<{ success: boolean; processed: number; errors: number }> {
    if (!navigator.onLine) {
      this.updateState('offline', 'Cannot sync while offline');
      return { success: false, processed: 0, errors: 0 };
    }

    if (this.isSyncing) {
      return { success: true, processed: 0, errors: 0 };
    }

    this.isSyncing = true;
    this.updateState('syncing', 'Synchronizing pending changes...');

    let processed = 0;
    let errors = 0;

    try {
      const actions = await getPendingSyncActions();

      for (const action of actions) {
        try {
          if (action.type === 'create_page') {
            try {
              await api.createPage(action.pageName, action.payload.password);
            } catch (err: any) {
              // If page already exists on server, that's fine
              if (err?.response?.status !== 409) {
                throw err;
              }
            }
            await removeSyncAction(action.id);
            processed++;
          } else if (action.type === 'save_content') {
            // Check server page first to detect expiry and conflicts
            try {
              const serverPage = await api.getPage(action.pageName);

              // Check if cloud page has expired
              if (Date.now() >= serverPage.page.expires_at) {
                // Rule 7: Do not recreate or resurrect expired cloud pages
                const local = await getOfflinePage(action.pageName);
                if (local) {
                  local.syncStatus = 'expired';
                  await saveOfflinePage(local);
                }
                await removeSyncAction(action.id);
                continue;
              }

              // Check conflict: if server version is strictly greater than expected version
              if (action.payload.version && serverPage.page.version > action.payload.version + 1) {
                const local = await getOfflinePage(action.pageName);
                if (local) {
                  local.syncStatus = 'conflict';
                  await saveOfflinePage(local);
                }
                // Leave action for manual resolution or overwrite confirmation
                errors++;
                continue;
              }

              // Save content to server
              const saveRes = await api.saveContent(
                action.pageName,
                action.payload.text || '',
                action.payload.version
              );

              // Update local page to synced
              const local = await getOfflinePage(action.pageName);
              if (local) {
                local.syncStatus = 'synced';
                local.version = saveRes.version;
                local.updatedAt = saveRes.updated_at;
                await saveOfflinePage(local);
              }

              await removeSyncAction(action.id);
              processed++;
            } catch (err: any) {
              if (err?.response?.status === 410) {
                // Page expired on server
                const local = await getOfflinePage(action.pageName);
                if (local) {
                  local.syncStatus = 'expired';
                  await saveOfflinePage(local);
                }
                await removeSyncAction(action.id);
              } else {
                throw err;
              }
            }
          }

          // Also sync any queued offline files for this page
          const queuedFiles = await getQueuedOfflineFiles(action.pageName);
          if (queuedFiles.length > 0) {
            const filesToUpload: File[] = queuedFiles.map(
              (qf) => new File([qf.blob], qf.name, { type: qf.type })
            );

            try {
              await api.uploadFiles(action.pageName, filesToUpload);
              for (const qf of queuedFiles) {
                await removeQueuedOfflineFile(qf.id);
              }
            } catch (e) {
              console.warn('Queued file upload postponed:', e);
            }
          }
        } catch (err) {
          console.error(`Failed to sync action ${action.id}:`, err);
          errors++;
          action.retryCount = (action.retryCount || 0) + 1;
        }
      }

      if (errors > 0) {
        this.updateState('failed', `${errors} items failed to sync`);
      } else {
        this.updateState('synced', 'All changes synchronized');
        setTimeout(() => {
          if (this.currentState === 'synced') {
            this.updateState('idle');
          }
        }, 3000);
      }

      return { success: errors === 0, processed, errors };
    } finally {
      this.isSyncing = false;
    }
  }
}

export const syncManager = new SyncManager();

