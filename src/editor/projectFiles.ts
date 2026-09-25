import {
  parseProjectFile,
  serializeProjectFile,
  type Project,
} from '../model/project';

export interface ProjectFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }>;
}

interface PickerWindow extends Window {
  showOpenFilePicker?: (options: unknown) => Promise<ProjectFileHandle[]>;
  showSaveFilePicker?: (options: unknown) => Promise<ProjectFileHandle>;
}

const pickerOptions = {
  types: [
    {
      description: 'WireLink 工程',
      accept: { 'application/json': ['.wlproj', '.json'] },
    },
  ],
};

export function hasFilePicker(): boolean {
  return typeof (window as PickerWindow).showOpenFilePicker === 'function';
}

export async function openProjectWithPicker(): Promise<{
  project: Project;
  handle: ProjectFileHandle;
}> {
  const picker = (window as PickerWindow).showOpenFilePicker;
  if (!picker) throw new Error('当前浏览器不支持文件选择器');
  const [handle] = await picker(pickerOptions);
  if (!handle) throw new Error('没有选择工程文件');
  const project = parseProjectFile(await (await handle.getFile()).text());
  return { project, handle };
}

export async function readProjectFile(file: File): Promise<Project> {
  return parseProjectFile(await file.text());
}

function downloadProject(project: Project, content: string): void {
  const url = URL.createObjectURL(
    new Blob([content], { type: 'application/json;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeProjectName(project.name)}.wlproj`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveProjectFile(
  project: Project,
  handle: ProjectFileHandle | null,
): Promise<ProjectFileHandle | null> {
  const content = serializeProjectFile(project);
  let destination = handle;
  if (!destination) {
    const picker = (window as PickerWindow).showSaveFilePicker;
    if (picker) {
      destination = await picker({
        ...pickerOptions,
        suggestedName: `${safeProjectName(project.name)}.wlproj`,
      });
    } else {
      downloadProject(project, content);
      return null;
    }
  }
  const writable = await destination.createWritable();
  await writable.write(content);
  await writable.close();
  return destination;
}

export function safeProjectName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || '未命名工程';
}

export function isPickerCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
