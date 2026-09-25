import { expect, test, vi } from 'vitest';
import { createEmptyProject } from '../model/project';
import {
  readProjectFile,
  saveProjectFile,
  type ProjectFileHandle,
} from './projectFiles';

test('saves a validated project through an existing file handle', async () => {
  const writes: string[] = [];
  let closed = false;
  const handle: ProjectFileHandle = {
    name: 'example.wlproj',
    getFile: async () => ({ text: async () => '' }) as File,
    createWritable: async () => ({
      write: async (text) => {
        writes.push(text);
      },
      close: async () => {
        closed = true;
      },
    }),
  };
  const project = createEmptyProject('接线测试');
  expect(await saveProjectFile(project, handle)).toBe(handle);
  expect(closed).toBe(true);
  expect(
    await readProjectFile({ text: async () => writes[0] } as File),
  ).toEqual(project);
});

test('does not write an invalid project', async () => {
  let wrote = false;
  const handle: ProjectFileHandle = {
    name: 'invalid.wlproj',
    getFile: async () => ({ text: async () => '' }) as File,
    createWritable: async () => ({
      write: async () => {
        wrote = true;
      },
      close: async () => {},
    }),
  };
  await expect(
    saveProjectFile({ ...createEmptyProject(), name: '' }, handle),
  ).rejects.toThrow('工程结构无效：name');
  expect(wrote).toBe(false);
});

test('downloads a .wlproj file when native saving is unavailable', async () => {
  const createObjectURL = vi.fn(() => 'blob:project');
  const revokeObjectURL = vi.fn();
  const downloads: string[] = [];
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
  vi.useFakeTimers();
  try {
    expect(
      await saveProjectFile(createEmptyProject('现场/控制器'), null),
    ).toBeNull();
    expect(downloads).toEqual(['现场_控制器.wlproj']);
    expect(createObjectURL).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:project');
  } finally {
    click.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
