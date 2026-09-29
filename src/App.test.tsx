import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import App from './App';
import { createEmptyProject } from './model/project';

test('shows the project shell', () => {
  render(<App />);
  expect(
    screen.getByRole('heading', { name: 'WireLink Studio' }),
  ).toBeInTheDocument();
});

test('starts with an empty project instead of sample devices', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建工程' }));
  expect(
    screen.getByText('0 台设备 · 0 条导线 · 0 个线束'),
  ).toBeInTheDocument();
  expect(screen.getByText('尚无设备模板')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /走线/ }),
  ).not.toBeInTheDocument();
});

test('undoes and redoes project edits', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建工程' }));
  const name = screen.getByRole('textbox', { name: '工程名称' });
  fireEvent.change(name, { target: { value: '接线方案' } });
  expect(name).toHaveValue('接线方案');
  fireEvent.click(screen.getByRole('button', { name: '撤销' }));
  expect(name).toHaveValue('未命名工程');
  fireEvent.click(screen.getByRole('button', { name: '重做' }));
  expect(name).toHaveValue('接线方案');
  fireEvent.click(screen.getByRole('button', { name: '撤销' }));
  fireEvent.change(name, { target: { value: '另一个方案' } });
  expect(screen.getByRole('button', { name: '重做' })).toBeDisabled();
});

test('Escape exits one canvas layer and Delete requires canvas focus', async () => {
  const resizeObserver = globalThis.ResizeObserver;
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const project = createEmptyProject();
  project.devices = [
    {
      id: 'device',
      name: '设备',
      position: { x: 0, y: 0 },
      templateSnapshot: {
        id: 'template',
        name: '设备',
        category: '',
        width: 180,
        height: 120,
        appearance: { kind: 'default' },
        terminals: [],
      },
    },
  ];
  vi.stubGlobal('showOpenFilePicker', async () => [
    {
      name: 'device.wlproj',
      getFile: async () => ({ text: async () => JSON.stringify(project) }),
    },
  ]);
  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '打开工程' }));
    await screen.findByLabelText('接线画布快捷键区域', {}, { timeout: 10000 });
    const node = await waitFor(() => {
      const element = document.querySelector('.react-flow__node');
      expect(element).not.toBeNull();
      return element!;
    });
    fireEvent.click(node);
    expect(document.querySelector('.device-node-selected')).not.toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: '新增' })[0]);
    const dialog = screen.getByRole('dialog', { name: '编辑端子类型' });
    const closeDialog = screen.getByRole('button', {
      name: '关闭端子类型编辑器',
    });
    closeDialog.focus();
    fireEvent.keyDown(closeDialog, { key: 'Escape' });
    expect(dialog).not.toBeInTheDocument();
    expect(document.querySelector('.device-node-selected')).not.toBeNull();
    const pane = document.querySelector('.react-flow__pane')!;
    fireEvent.contextMenu(pane);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.querySelector('.device-node-selected')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('.device-node-selected')).toBeNull();

    fireEvent.click(node);
    const save = screen.getByRole('button', { name: '保存' });
    save.focus();
    fireEvent.keyDown(save, { key: 'Delete' });
    expect(
      screen.getByText('1 台设备 · 0 条导线 · 0 个线束'),
    ).toBeInTheDocument();
    const canvas = screen.getByLabelText('接线画布快捷键区域');
    canvas.focus();
    fireEvent.keyDown(canvas, { key: 'Delete' });
    expect(
      screen.getByText('0 台设备 · 0 条导线 · 0 个线束'),
    ).toBeInTheDocument();
  } finally {
    confirm.mockRestore();
    vi.unstubAllGlobals();
    vi.stubGlobal('ResizeObserver', resizeObserver);
  }
});

test('bulk harness expansion is one undo step from a mixed view', async () => {
  const resizeObserver = globalThis.ResizeObserver;
  const project = createEmptyProject('混合线束');
  project.harnesses = ['one', 'two'].map((id, index) => ({
    id,
    name: id,
    color: '#7045e5',
    collapsed: index === 0,
    route: {
      sourceDeviceId: 'a',
      targetDeviceId: 'b',
      sourceJunction: { x: 0, y: 0 },
      targetJunction: { x: 90, y: 0 },
      trunkPoints: [],
      branches: [],
    },
  }));
  vi.stubGlobal('showOpenFilePicker', async () => [
    {
      name: 'mixed.wlproj',
      getFile: async () => ({ text: async () => JSON.stringify(project) }),
    },
  ]);
  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '打开工程' }));
    expect(await screen.findByTitle('one · 已折叠')).toBeInTheDocument();
    expect(screen.getByTitle('two · 已展开')).toBeInTheDocument();
    const pane = await waitFor(() => {
      const element = document.querySelector('.react-flow__pane');
      expect(element).not.toBeNull();
      return element!;
    });
    fireEvent.contextMenu(pane, {
      clientX: 80,
      clientY: 80,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: '全部展开线束' }));
    expect(screen.getByTitle('one · 已展开')).toBeInTheDocument();
    expect(screen.getByTitle('two · 已展开')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.getByTitle('one · 已折叠')).toBeInTheDocument();
    expect(screen.getByTitle('two · 已展开')).toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
    vi.stubGlobal('ResizeObserver', resizeObserver);
  }
});

test('offers export formats and prepares the print diagram', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建工程' }));
  fireEvent.click(screen.getByText('导出'));
  for (const label of [
    '导出工程 JSON',
    '导出 SVG 图纸',
    '导出 PNG 图片',
    '导出离线 HTML 查看页',
  ]) {
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole('button', { name: '打印图纸或保存为 PDF' }));
  await waitFor(() => expect(print).toHaveBeenCalledOnce());
  expect(document.querySelector('.print-sheet svg')).not.toBeNull();
  print.mockRestore();
});

test('clears harness routing when replacing the project', async () => {
  const project = createEmptyProject('已有工程');
  project.harnesses = [
    { id: 'harness', name: '测试线束', color: '#7045e5', collapsed: false },
  ];
  vi.stubGlobal('showOpenFilePicker', async () => [
    {
      name: 'existing.wlproj',
      getFile: async () => ({ text: async () => JSON.stringify(project) }),
    },
  ]);
  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '打开工程' }));
    fireEvent.click(await screen.findByTitle('测试线束 · 待走线'));
    fireEvent.click(screen.getByRole('button', { name: '线束走线' }));
    expect(
      await screen.findByText('点击网格设置第一侧汇合点'),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('点击网格设置第一侧汇合点')).toBeNull();
    expect(
      screen.getByRole('button', { name: '线束走线' }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: '线束走线' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '新建' }));
    expect(screen.queryByText('点击网格设置第一侧汇合点')).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});

test('finishes harness routing on Enter using the last temporary point', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const project = createEmptyProject('走线工程');
  project.harnesses = [
    { id: 'harness', name: '测试线束', color: '#7045e5', collapsed: false },
  ];
  project.wires = ['one', 'two'].map((id) => ({
    id,
    harnessId: 'harness',
    source: { deviceId: 'left', terminalId: id },
    target: { deviceId: 'right', terminalId: id },
  }));
  project.devices = (['left', 'right'] as const).map((id, index) => ({
    id,
    name: id,
    position: { x: index * 360, y: 0 },
    templateSnapshot: {
      id,
      name: id,
      category: '',
      width: 180,
      height: 120,
      appearance: { kind: 'default' as const },
      terminals: ['one', 'two'].map((terminalId, order) => ({
        id: terminalId,
        label: terminalId,
        typeId: 'signal',
        side: (id === 'left' ? 'right' : 'left') as 'right' | 'left',
        order,
        maxConnections: 1,
      })),
    },
  }));
  vi.stubGlobal('showOpenFilePicker', async () => [
    {
      name: 'routing.wlproj',
      getFile: async () => ({ text: async () => JSON.stringify(project) }),
    },
  ]);
  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '打开工程' }));
    fireEvent.click(await screen.findByTitle('测试线束 · 待走线'));
    fireEvent.click(screen.getByRole('button', { name: '线束走线' }));
    const pane = document.querySelector('.react-flow__pane')!;
    const canvas = screen.getByLabelText('接线画布快捷键区域');
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(screen.getByText('点击网格设置第一侧汇合点')).toBeInTheDocument();
    fireEvent.click(pane, { clientX: 90, clientY: 90 });
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(screen.getByText(/点击追加至少一个路径点/)).toBeInTheDocument();
    fireEvent.click(pane, { clientX: 180, clientY: 90 });
    fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(screen.getByText(/点击追加至少一个路径点/)).toBeInTheDocument();
    fireEvent.click(pane, { clientX: 240, clientY: 120 });
    const cancel = screen.getByRole('button', { name: '取消' });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Enter' });
    expect(screen.getByText(/点击追加至少一个路径点/)).toBeInTheDocument();
    expect(screen.getByTitle('测试线束 · 待走线')).toBeInTheDocument();
    fireEvent.click(cancel);
    expect(screen.queryByText(/点击追加至少一个路径点/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '线束走线' }));
    fireEvent.click(pane, { clientX: 90, clientY: 90 });
    fireEvent.click(pane, { clientX: 240, clientY: 120 });
    fireEvent.keyDown(screen.getByRole('heading', { name: '资料库' }), {
      key: 'Enter',
    });
    expect(screen.getByText(/点击追加至少一个路径点/)).toBeInTheDocument();
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(await screen.findByTitle('测试线束 · 已折叠')).toBeInTheDocument();
    expect(
      screen.getAllByTitle('拖动调整；右键删除分支或主干路径点'),
    ).toHaveLength(2);
    fireEvent.contextMenu(
      screen.getAllByTitle('拖动调整；右键删除分支或主干路径点')[0],
    );
    fireEvent.click(screen.getByRole('button', { name: '重新走线' }));
    expect(
      screen.queryAllByTitle('拖动调整；右键删除分支或主干路径点'),
    ).toHaveLength(0);
    expect(screen.queryByRole('menu')).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});

test('clears an unfinished wire when opening another project', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const makeProject = (name: string, id: string) => {
    const project = createEmptyProject(name);
    project.terminalTypes = [
      {
        id: 'signal',
        name: '信号',
        color: '#345',
        compatibleTypeIds: ['signal'],
      },
    ];
    project.devices = [
      {
        id,
        name,
        position: { x: 0, y: 0 },
        templateSnapshot: {
          id: `template-${id}`,
          name,
          category: '',
          width: 180,
          height: 120,
          appearance: { kind: 'default' as const },
          terminals: [
            {
              id: 'port',
              label: '端子',
              typeId: 'signal',
              side: 'right' as const,
              order: 0,
              maxConnections: 1,
            },
          ],
        },
      },
    ];
    return project;
  };
  const projects = [makeProject('旧工程', 'old'), makeProject('新工程', 'new')];
  vi.stubGlobal('showOpenFilePicker', async () => [
    {
      name: 'project.wlproj',
      getFile: async () => ({
        text: async () => JSON.stringify(projects.shift()),
      }),
    },
  ]);
  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '打开工程' }));
    fireEvent.click(await screen.findByTitle('端子 · 信号'));
    expect(screen.getByText(/点击网格点确定下一点/)).toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: '工程名称' });
    fireEvent.change(name, { target: { value: '编辑后' } });
    const pane = document.querySelector('.react-flow__pane')!;
    fireEvent.click(pane, { clientX: 90, clientY: 90 });
    expect(document.querySelector('.wire-route-preview path')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(document.querySelector('.wire-route-preview path')).toBeNull();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(name).toHaveValue('编辑后');
    fireEvent.click(screen.getByRole('button', { name: '打开' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: '工程名称' })).toHaveValue(
        '新工程',
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText(/点击网格点确定下一点/)).toBeNull(),
    );
    fireEvent.click(screen.getByTitle('端子 · 信号'));
    expect(screen.getByText(/点击网格点确定下一点/)).toBeInTheDocument();
  } finally {
    confirm.mockRestore();
    vi.unstubAllGlobals();
  }
});
