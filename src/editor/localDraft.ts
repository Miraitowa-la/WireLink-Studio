import type { Project } from '../model/project';

export type LocalDraft = { id: string; project: Project; savedAt: number };

const databaseName = 'wirelink-studio';
const storeName = 'local-draft';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('本机草稿数据库正被其他页面占用'));
    };
  });
}

async function access<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    let request: IDBRequest<T>;
    try {
      request = action(transaction.objectStore(storeName));
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      database.close();
      resolve(request.result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

let pendingWrite: Promise<unknown> = Promise.resolve();

function mutate(action: (store: IDBObjectStore) => IDBRequest): Promise<void> {
  const result = pendingWrite.then(() => access('readwrite', action));
  pendingWrite = result.catch(() => {});
  return result.then(() => {});
}

export async function readLocalDrafts(): Promise<LocalDraft[]> {
  await pendingWrite;
  const drafts = await access<Array<Omit<LocalDraft, 'id'> & { id?: string }>>(
    'readonly',
    (store) => store.getAll(),
  );
  return drafts
    .map((draft) => ({ ...draft, id: draft.id ?? 'latest' }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

const activityChannel = 'wirelink-studio-draft-activity';

export function listenForDraftActivity(id: string): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(activityChannel);
  channel.onmessage = (event: MessageEvent<{ type: string; id: string }>) => {
    if (event.data?.type === 'check' && event.data.id === id)
      channel.postMessage({ type: 'active', id });
  };
  return () => channel.close();
}

export function isDraftActive(id: string): Promise<boolean> {
  if (typeof BroadcastChannel === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const channel = new BroadcastChannel(activityChannel);
    const finish = (active: boolean) => {
      window.clearTimeout(timer);
      channel.close();
      resolve(active);
    };
    const timer = window.setTimeout(() => finish(false), 150);
    channel.onmessage = (event: MessageEvent<{ type: string; id: string }>) => {
      if (event.data?.type === 'active' && event.data.id === id) finish(true);
    };
    channel.postMessage({ type: 'check', id });
  });
}

export function saveLocalDraft(id: string, project: Project): Promise<void> {
  return mutate((store) => store.put({ id, project, savedAt: Date.now() }, id));
}

export function clearLocalDraft(id: string): Promise<void> {
  return mutate((store) => store.delete(id));
}
