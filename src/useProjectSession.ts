import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  createEmptyProject,
  parseProjectFile,
  type Project,
} from './model/project';
import {
  clearLocalDraft,
  isDraftActive,
  listenForDraftActivity,
  readLocalDrafts,
  saveLocalDraft,
  type LocalDraft,
} from './editor/localDraft';
import {
  hasFilePicker,
  isPickerCancel,
  openProjectWithPicker,
  readProjectFile,
  saveProjectFile,
  type ProjectFileHandle,
} from './editor/projectFiles';

export type Status = { kind: 'info' | 'error'; text: string } | null;

export function useProjectSession(
  onRestore: (project: Project) => void,
  onReplace: () => void,
) {
  const [project, setProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState('未命名工程');
  const [dirty, setDirty] = useState(false);
  const [draftChecked, setDraftChecked] = useState(
    typeof indexedDB === 'undefined',
  );
  const [draftState, setDraftState] = useState<'saving' | 'saved' | 'error'>(
    typeof indexedDB === 'undefined' ? 'error' : 'saving',
  );
  const [status, setStatus] = useState<Status>(null);
  const [sessionId, setSessionId] = useState(0);
  const [localDrafts, setLocalDrafts] = useState<
    Array<LocalDraft & { error?: string }>
  >([]);
  const [draftPanelOpen, setDraftPanelOpen] = useState(true);
  const [draftBusy, setDraftBusy] = useState<string | null>(null);
  const draftScan = useRef(0);
  const draftId = useRef(crypto.randomUUID());
  const fileHandle = useRef<ProjectFileHandle | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const projectRef = useRef<Project | null>(null);
  const savedProject = useRef<Project | null>(null);
  const projectSession = useRef(0);
  const history = useRef<{ past: Project[]; future: Project[] }>({
    past: [],
    future: [],
  });
  const saving = useRef(false);

  useEffect(() => {
    if (typeof indexedDB === 'undefined') {
      setStatus({
        kind: 'error',
        text: '当前浏览器不支持本机草稿自动保存，请手动保存工程文件',
      });
      return;
    }
    const stopListening = listenForDraftActivity(draftId.current);
    void refreshDrafts();
    return () => {
      draftScan.current += 1;
      stopListening();
    };
  }, []);

  async function refreshDrafts() {
    if (typeof indexedDB === 'undefined') return;
    const scan = ++draftScan.current;
    setDraftChecked(false);
    setDraftPanelOpen(true);
    try {
      const drafts = await readLocalDrafts();
      const available: typeof localDrafts = [];
      for (const draft of drafts) {
        if (scan !== draftScan.current) return;
        if (draft.id === draftId.current || (await isDraftActive(draft.id)))
          continue;
        try {
          available.push({
            ...draft,
            project: parseProjectFile(JSON.stringify(draft.project)),
          });
        } catch (error) {
          available.push({ ...draft, error: errorMessage(error) });
        }
      }
      if (scan === draftScan.current) setLocalDrafts(available);
    } catch (error) {
      if (scan === draftScan.current)
        setStatus({
          kind: 'error',
          text: `草稿读取失败：${errorMessage(error)}`,
        });
    } finally {
      if (scan === draftScan.current) setDraftChecked(true);
    }
  }

  async function restoreDraft(id: string) {
    if (draftBusy || !canReplaceProject()) return;
    const draft = localDrafts.find((item) => item.id === id);
    if (!draft) return;
    setDraftBusy(id);
    try {
      if (await isDraftActive(id))
        throw new Error('该草稿正在其他标签页中使用，请刷新草稿列表');
      const recovered = parseProjectFile(JSON.stringify(draft.project));
      // Keep the source until the user explicitly deletes it.
      await saveLocalDraft(draftId.current, recovered);
      projectRef.current = recovered;
      savedProject.current = null;
      fileHandle.current = null;
      projectSession.current += 1;
      setSessionId(projectSession.current);
      history.current = { past: [], future: [] };
      setProject(recovered);
      setProjectName(recovered.name);
      setDirty(true);
      onReplace();
      setStatus({
        kind: 'info',
        text: '已恢复本机草稿；原草稿保留，可在欢迎页删除，请手动保存为 .wlproj 文件',
      });
    } catch (error) {
      setStatus({
        kind: 'error',
        text: `草稿恢复失败：${errorMessage(error)}`,
      });
    } finally {
      setDraftBusy(null);
    }
  }

  async function deleteDraft(id: string) {
    if (draftBusy) return;
    const draft = localDrafts.find((item) => item.id === id);
    if (
      !draft ||
      !window.confirm(
        `确定删除草稿“${draft.project?.name || '未知工程'}”？此操作无法撤销。`,
      )
    )
      return;
    setDraftBusy(id);
    try {
      if (await isDraftActive(id))
        throw new Error('该草稿正在其他标签页中使用，请刷新草稿列表');
      await clearLocalDraft(id);
      setLocalDrafts((drafts) => drafts.filter((item) => item.id !== id));
      setStatus({ kind: 'info', text: '草稿已删除' });
    } catch (error) {
      setStatus({
        kind: 'error',
        text: `草稿删除失败：${errorMessage(error)}`,
      });
    } finally {
      setDraftBusy(null);
    }
  }

  useEffect(() => {
    if (!draftChecked || typeof indexedDB === 'undefined') return;
    if (!project || !dirty) {
      void clearLocalDraft(draftId.current).catch(() => {
        setDraftState('error');
        setStatus({
          kind: 'error',
          text: '本机旧草稿清理失败；下次打开时可能仍出现恢复提示',
        });
      });
      return;
    }
    setDraftState('saving');
    let active = true;
    const persist = (snapshot: Project) => {
      void saveLocalDraft(draftId.current, snapshot)
        .then(() => {
          if (active && projectRef.current === snapshot) setDraftState('saved');
        })
        .catch(() => {
          if (active) setDraftState('error');
        });
    };
    const timer = window.setTimeout(() => persist(project), 500);
    const flush = () => {
      window.clearTimeout(timer);
      if (projectRef.current !== savedProject.current)
        persist(projectRef.current ?? project);
    };
    window.addEventListener('pagehide', flush);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', flush);
    };
  }, [project, dirty, draftChecked]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function changeProject(update: (current: Project) => Project) {
    const current = projectRef.current;
    if (!current) return;
    const next = update(current);
    if (next === current) return;
    history.current.past.push(current);
    if (history.current.past.length > 50) history.current.past.shift();
    history.current.future = [];
    projectRef.current = next;
    setProject(next);
    setDirty(next !== savedProject.current);
    setStatus(null);
  }

  function restoreProject(next: Project) {
    projectRef.current = next;
    setProject(next);
    setDirty(next !== savedProject.current);
    setStatus(null);
    onRestore(next);
  }

  function undo() {
    const previous = history.current.past.pop();
    if (!previous || !projectRef.current) return;
    history.current.future.push(projectRef.current);
    restoreProject(previous);
  }

  function redo() {
    const next = history.current.future.pop();
    if (!next || !projectRef.current) return;
    history.current.past.push(projectRef.current);
    restoreProject(next);
  }

  function canReplaceProject() {
    return (
      !dirty || window.confirm('当前工程有未保存的修改，确定放弃并继续吗？')
    );
  }

  function newProject() {
    if (!canReplaceProject()) return;
    const next = createEmptyProject(projectName.trim() || '未命名工程');
    projectRef.current = next;
    savedProject.current = null;
    projectSession.current += 1;
    setSessionId(projectSession.current);
    history.current = { past: [], future: [] };
    setProject(next);
    fileHandle.current = null;
    setDirty(true);
    onReplace();
    setStatus({ kind: 'info', text: '空工程已创建，请显式保存到文件' });
  }

  function backToWelcome() {
    if (!canReplaceProject()) return;
    setProject(null);
    projectRef.current = null;
    savedProject.current = null;
    projectSession.current += 1;
    setSessionId(projectSession.current);
    history.current = { past: [], future: [] };
    fileHandle.current = null;
    setDirty(false);
    onReplace();
    setStatus(null);
    void refreshDrafts();
  }

  function acceptProject(next: Project, handle: ProjectFileHandle | null) {
    projectRef.current = next;
    savedProject.current = next;
    projectSession.current += 1;
    setSessionId(projectSession.current);
    history.current = { past: [], future: [] };
    setProject(next);
    setProjectName(next.name);
    fileHandle.current = handle;
    setDirty(false);
    onReplace();
    setStatus({ kind: 'info', text: `已打开工程“${next.name}”` });
  }

  async function openProject() {
    if (!canReplaceProject()) return;
    const session = projectSession.current;
    if (!hasFilePicker()) {
      fileInput.current?.click();
      return;
    }
    try {
      const { project: next, handle } = await openProjectWithPicker();
      if (projectSession.current === session) acceptProject(next, handle);
    } catch (error) {
      if (!isPickerCancel(error))
        setStatus({ kind: 'error', text: errorMessage(error) });
    }
  }

  async function onFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const session = projectSession.current;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const next = await readProjectFile(file);
      if (projectSession.current === session) acceptProject(next, null);
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) });
    }
  }

  async function save() {
    const snapshot = projectRef.current;
    if (!snapshot || saving.current) return;
    saving.current = true;
    const session = projectSession.current;
    try {
      const handle = await saveProjectFile(snapshot, fileHandle.current);
      if (projectSession.current !== session) return;
      if (!handle) {
        setStatus({
          kind: 'info',
          text: '工程文件已请求下载；本机草稿将保留，请确认下载完成',
        });
        return;
      }
      fileHandle.current = handle;
      savedProject.current = snapshot;
      const changedDuringSave = projectRef.current !== snapshot;
      setDirty(changedDuringSave);
      setStatus({
        kind: 'info',
        text: changedDuringSave
          ? '文件已写入，但期间产生了新修改，请再次保存'
          : '工程已保存',
      });
    } catch (error) {
      if (projectSession.current === session && !isPickerCancel(error))
        setStatus({ kind: 'error', text: errorMessage(error) });
    } finally {
      saving.current = false;
    }
  }

  const getProject = () => projectRef.current;

  return {
    project,
    projectName,
    setProjectName,
    dirty,
    draftChecked,
    draftState,
    localDrafts,
    draftPanelOpen,
    setDraftPanelOpen,
    draftBusy,
    refreshDrafts,
    restoreDraft,
    deleteDraft,
    status,
    setStatus,
    fileInput,
    sessionId,
    getProject,
    canUndo: history.current.past.length > 0,
    canRedo: history.current.future.length > 0,
    changeProject,
    undo,
    redo,
    newProject,
    backToWelcome,
    openProject,
    onFileSelected,
    save,
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请重试';
}
