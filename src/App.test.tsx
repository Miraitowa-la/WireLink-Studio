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
  expect(screen.getByText('0 台设备 · 0 条导线')).toBeInTheDocument();
  expect(screen.getByText('尚无设备模板')).toBeInTheDocument();
});
