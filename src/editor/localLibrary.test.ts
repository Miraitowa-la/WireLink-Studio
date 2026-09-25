import { expect, test } from 'vitest';
import { loadPublicLibrary, savePublicLibrary } from './localLibrary';

test('persists the public library locally and protects malformed data', () => {
  const library = {
    terminalTypes: [
      {
        id: 'signal',
        name: '信号',
        color: '#2563eb',
        compatibleTypeIds: ['signal'],
      },
    ],
    deviceTemplates: [],
  };
  localStorage.clear();
  savePublicLibrary(library);
  expect(loadPublicLibrary()).toEqual(library);
  localStorage.setItem('wirelink-studio-public-library-v1', '{');
  expect(() => loadPublicLibrary()).toThrow('已暂停公共库编辑');
  localStorage.clear();
});
