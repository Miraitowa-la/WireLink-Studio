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
      await screen.findByText('点击网格设置起点汇合点'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '新建' }));
    expect(screen.queryByText('点击网格设置起点汇合点')).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});
