import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import {
  clearLocalDraft,
  isDraftActive,
  readLocalDrafts,
  saveLocalDraft,
} from './editor/localDraft';
import { createEmptyProject } from './model/project';
import { useProjectSession } from './useProjectSession';
import App from './App';

vi.mock('./editor/localDraft', () => ({
  clearLocalDraft: vi.fn(),
  isDraftActive: vi.fn(() => Promise.resolve(false)),
  listenForDraftActivity: vi.fn(() => () => {}),
  readLocalDrafts: vi.fn(),
  saveLocalDraft: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.mocked(isDraftActive).mockResolvedValue(false);
});

test('restores the chosen draft and autosaves later changes independently', async () => {
  vi.stubGlobal('indexedDB', {});
  vi.mocked(readLocalDrafts).mockResolvedValue([
    {
      id: 'previous-session',
      project: createEmptyProject('恢复的工程'),
      savedAt: Date.now(),
    },
  ]);
  vi.mocked(saveLocalDraft).mockResolvedValue();
  vi.mocked(clearLocalDraft).mockResolvedValue();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const onReplace = vi.fn();
  const { result } = renderHook(() => useProjectSession(vi.fn(), onReplace));

  await waitFor(() => expect(result.current.draftChecked).toBe(true));
  expect(result.current.project).toBeNull();
  await act(async () => result.current.restoreDraft('previous-session'));
  await waitFor(() => expect(result.current.project?.name).toBe('恢复的工程'));
  expect(confirm).not.toHaveBeenCalled();
  expect(result.current.dirty).toBe(true);
  expect(onReplace).toHaveBeenCalledOnce();
  act(() =>
    result.current.changeProject((current) => ({ ...current, name: '已编辑' })),
  );
  await waitFor(
    () =>
      expect(saveLocalDraft).toHaveBeenCalledWith(
        expect.not.stringMatching(/^previous-session$/),
        expect.objectContaining({ name: '已编辑' }),
      ),
    { timeout: 2000 },
  );
  await waitFor(() => expect(result.current.draftState).toBe('saved'));
});

test('deferring recovery retains every draft and allows reopening the list', async () => {
  vi.stubGlobal('indexedDB', {});
  vi.mocked(readLocalDrafts).mockResolvedValue([
    {
      id: 'another-tab',
      project: createEmptyProject('不恢复'),
      savedAt: Date.now(),
    },
  ]);
  vi.mocked(clearLocalDraft).mockResolvedValue();
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { result } = renderHook(() => useProjectSession(vi.fn(), vi.fn()));

  await waitFor(() => expect(result.current.draftChecked).toBe(true));
  act(() => result.current.setDraftPanelOpen(false));
  expect(result.current.draftPanelOpen).toBe(false);
  await act(async () => result.current.refreshDrafts());
  expect(result.current.draftPanelOpen).toBe(true);
  expect(result.current.localDrafts.map((draft) => draft.id)).toEqual([
    'another-tab',
  ]);
  expect(result.current.project).toBeNull();
  expect(clearLocalDraft).not.toHaveBeenCalledWith('another-tab');
});

test('skips drafts owned by an active tab', async () => {
  vi.stubGlobal('indexedDB', {});
  vi.mocked(readLocalDrafts).mockResolvedValue([
    { id: 'active-tab', project: createEmptyProject('正在编辑'), savedAt: 2 },
    { id: 'closed-tab', project: createEmptyProject('可恢复'), savedAt: 1 },
  ]);
  vi.mocked(isDraftActive).mockImplementation(
    async (id) => id === 'active-tab',
  );
  vi.mocked(clearLocalDraft).mockResolvedValue();
  vi.mocked(saveLocalDraft).mockResolvedValue();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const { result } = renderHook(() => useProjectSession(vi.fn(), vi.fn()));

  await waitFor(() => expect(result.current.draftChecked).toBe(true));
  expect(result.current.localDrafts.map((draft) => draft.id)).toEqual([
    'closed-tab',
  ]);
  await act(async () => result.current.restoreDraft('closed-tab'));
  await waitFor(() => expect(result.current.project?.name).toBe('可恢复'));
  expect(confirm).not.toHaveBeenCalled();
  expect(clearLocalDraft).not.toHaveBeenCalledWith('active-tab');
});

test('invalid drafts remain visible for explicit deletion', async () => {
  vi.stubGlobal('indexedDB', {});
  vi.mocked(readLocalDrafts).mockResolvedValue([
    {
      id: 'invalid-session',
      project: { ...createEmptyProject(), version: 4 as 5 },
      savedAt: Date.now(),
    },
  ]);
  vi.mocked(clearLocalDraft).mockResolvedValue();
  const confirm = vi.spyOn(window, 'confirm');
  const { result } = renderHook(() => useProjectSession(vi.fn(), vi.fn()));

  await waitFor(() => expect(result.current.draftChecked).toBe(true));
  expect(result.current.project).toBeNull();
  expect(confirm).not.toHaveBeenCalled();
  expect(result.current.localDrafts[0].error).toBeTruthy();
  expect(clearLocalDraft).not.toHaveBeenCalledWith('invalid-session');
});

test('deletion requires confirmation and leaves other drafts intact', async () => {
  vi.stubGlobal('indexedDB', {});
  vi.mocked(readLocalDrafts).mockResolvedValue([
    { id: 'newer', project: createEmptyProject('新草稿'), savedAt: 2 },
    { id: 'older', project: createEmptyProject('旧草稿'), savedAt: 1 },
  ]);
  vi.mocked(clearLocalDraft).mockResolvedValue();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const { result } = renderHook(() => useProjectSession(vi.fn(), vi.fn()));
  await waitFor(() => expect(result.current.draftChecked).toBe(true));
  await act(async () => result.current.deleteDraft('newer'));
  expect(clearLocalDraft).not.toHaveBeenCalledWith('newer');
  expect(result.current.localDrafts).toHaveLength(2);
  confirm.mockReturnValue(true);
  await act(async () => result.current.deleteDraft('newer'));
  expect(clearLocalDraft).toHaveBeenCalledWith('newer');
  expect(clearLocalDraft).not.toHaveBeenCalledWith('older');
  expect(result.current.localDrafts.map((draft) => draft.id)).toEqual([
    'older',
  ]);
});

test('a draft claimed by another tab cannot be restored or deleted', async () => {
  vi.stubGlobal('indexedDB', {});
  vi.mocked(readLocalDrafts).mockResolvedValue([
    { id: 'claimed', project: createEmptyProject(), savedAt: 1 },
  ]);
  vi.mocked(clearLocalDraft).mockResolvedValue();
  vi.mocked(saveLocalDraft).mockResolvedValue();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const { result } = renderHook(() => useProjectSession(vi.fn(), vi.fn()));
  await waitFor(() => expect(result.current.localDrafts).toHaveLength(1));
  vi.mocked(isDraftActive).mockResolvedValue(true);
  await act(async () => result.current.restoreDraft('claimed'));
  await act(async () => result.current.deleteDraft('claimed'));
  expect(result.current.project).toBeNull();
  expect(saveLocalDraft).not.toHaveBeenCalled();
  expect(clearLocalDraft).not.toHaveBeenCalledWith('claimed');
  expect(result.current.status?.kind).toBe('error');
});

test('failed recovery or deletion preserves the source draft', async () => {
  vi.stubGlobal('indexedDB', {});
  vi.mocked(readLocalDrafts).mockResolvedValue([
    { id: 'retained', project: createEmptyProject(), savedAt: 1 },
  ]);
  vi.mocked(clearLocalDraft).mockResolvedValue();
  vi.mocked(saveLocalDraft).mockRejectedValueOnce(new Error('存储已满'));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const { result } = renderHook(() => useProjectSession(vi.fn(), vi.fn()));
  await waitFor(() => expect(result.current.draftChecked).toBe(true));
  await act(async () => result.current.restoreDraft('retained'));
  expect(result.current.project).toBeNull();
  expect(clearLocalDraft).not.toHaveBeenCalledWith('retained');
  vi.mocked(clearLocalDraft).mockRejectedValueOnce(new Error('删除失败'));
  await act(async () => result.current.deleteDraft('retained'));
  expect(result.current.localDrafts).toHaveLength(1);
  expect(result.current.status?.kind).toBe('error');
});

test('the welcome list can be deferred, reopened, and used to restore an older draft', async () => {
  vi.stubGlobal('indexedDB', {});
  vi.mocked(readLocalDrafts).mockResolvedValue([
    { id: 'newer', project: createEmptyProject('最新草稿'), savedAt: 2 },
    { id: 'older', project: createEmptyProject('较早草稿'), savedAt: 1 },
  ]);
  vi.mocked(clearLocalDraft).mockResolvedValue();
  vi.mocked(saveLocalDraft).mockResolvedValue();
  render(<App />);
  await screen.findByText('较早草稿');
  expect(screen.getByText('最新草稿')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '暂不恢复' }));
  expect(screen.queryByText('较早草稿')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '查看本机草稿' }));
  const older = (await screen.findByText('较早草稿')).closest('li')!;
  fireEvent.click(within(older).getByRole('button', { name: '恢复' }));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: '工程名称' })).toHaveValue(
      '较早草稿',
    ),
  );
  expect(clearLocalDraft).not.toHaveBeenCalledWith('older');
});

test('manual file save clears the automatically saved draft', async () => {
  vi.stubGlobal('indexedDB', {});
  vi.mocked(readLocalDrafts).mockResolvedValue([]);
  vi.mocked(saveLocalDraft).mockResolvedValue();
  vi.mocked(clearLocalDraft).mockResolvedValue();
  vi.stubGlobal('showSaveFilePicker', async () => ({
    name: '工程.wlproj',
    createWritable: async () => ({
      write: async () => {},
      close: async () => {},
    }),
  }));
  const { result } = renderHook(() => useProjectSession(vi.fn(), vi.fn()));
  await waitFor(() => expect(result.current.draftChecked).toBe(true));
  act(() => result.current.newProject());
  await waitFor(() => expect(saveLocalDraft).toHaveBeenCalled(), {
    timeout: 2000,
  });
  vi.mocked(clearLocalDraft).mockClear();
  await act(async () => result.current.save());
  await waitFor(() => expect(clearLocalDraft).toHaveBeenCalledOnce());
  expect(result.current.dirty).toBe(false);
});

test('two editor sessions save and clear only their own drafts', async () => {
  vi.stubGlobal('indexedDB', {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(readLocalDrafts).mockResolvedValue([]);
  vi.mocked(saveLocalDraft).mockResolvedValue();
  vi.mocked(clearLocalDraft).mockResolvedValue();
  const first = renderHook(() => useProjectSession(vi.fn(), vi.fn()));
  const second = renderHook(() => useProjectSession(vi.fn(), vi.fn()));
  await waitFor(() => {
    expect(first.result.current.draftChecked).toBe(true);
    expect(second.result.current.draftChecked).toBe(true);
  });
  act(() => {
    first.result.current.newProject();
    second.result.current.newProject();
  });
  await waitFor(() => expect(saveLocalDraft).toHaveBeenCalledTimes(2), {
    timeout: 2000,
  });
  const [firstId, secondId] = vi
    .mocked(saveLocalDraft)
    .mock.calls.map(([id]) => id);
  expect(firstId).not.toBe(secondId);
  vi.mocked(clearLocalDraft).mockClear();
  act(() => first.result.current.backToWelcome());
  await waitFor(() => expect(clearLocalDraft).toHaveBeenCalledWith(firstId));
  expect(clearLocalDraft).not.toHaveBeenCalledWith(secondId);
});

test('download fallback keeps the recovery draft', async () => {
  vi.stubGlobal('indexedDB', {});
  vi.mocked(readLocalDrafts).mockResolvedValue([]);
  vi.mocked(saveLocalDraft).mockResolvedValue();
  vi.mocked(clearLocalDraft).mockResolvedValue();
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:project',
    revokeObjectURL: () => {},
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const { result } = renderHook(() => useProjectSession(vi.fn(), vi.fn()));
  await waitFor(() => expect(result.current.draftChecked).toBe(true));
  act(() => result.current.newProject());
  await waitFor(() => expect(saveLocalDraft).toHaveBeenCalled(), {
    timeout: 2000,
  });
  vi.mocked(clearLocalDraft).mockClear();
  await act(async () => result.current.save());
  expect(result.current.dirty).toBe(true);
  expect(result.current.status?.text).toContain('草稿将保留');
  expect(clearLocalDraft).not.toHaveBeenCalled();
});
