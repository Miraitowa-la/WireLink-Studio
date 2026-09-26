import { expect, test } from 'vitest';
import { createEmptyProject } from '../model/project';
import { pruneAssets } from './assets';

test('removes unreferenced images while preserving images used by device snapshots', () => {
  const project = createEmptyProject();
  project.assets = ['used', 'orphan'].map((id) => ({
    id,
    name: `${id}.png`,
    mimeType: 'image/png' as const,
    data: 'data:image/png;base64,AA==',
  }));
  project.devices = [
    {
      id: 'device',
      name: '设备',
      position: { x: 0, y: 0 },
      templateSnapshot: {
        id: 'template',
        name: '模板',
        category: '',
        width: 180,
        height: 120,
        appearance: { kind: 'image', assetId: 'used' },
        terminals: [],
      },
    },
  ];
  expect(pruneAssets(project).assets.map((asset) => asset.id)).toEqual([
    'used',
  ]);
});
