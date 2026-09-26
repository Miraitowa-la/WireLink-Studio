import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import App from './App';

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
