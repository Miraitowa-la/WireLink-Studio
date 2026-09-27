import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createEmptyProject, type Project } from './model/project';
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
  const [status, setStatus] = useState<Status>(null);
  const [sessionId, setSessionId] = useState(0);
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
      fileHandle.current = handle;
      savedProject.current = snapshot;
      const changedDuringSave = projectRef.current !== snapshot;
      setDirty(changedDuringSave);
      setStatus({
        kind: 'info',
        text: changedDuringSave
          ? '文件已写入，但期间产生了新修改，请再次保存'
          : fileHandle.current
            ? '工程已保存'
            : '工程文件已下载',
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
