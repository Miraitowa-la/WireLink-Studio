import { describe, expect, test } from 'vitest';
import {
  createEmptyProject,
  parseProjectFile,
  serializeProjectFile,
} from './project';

describe('project file model', () => {
  test('creates an empty versioned project', () => {
    expect(createEmptyProject('测试工程')).toMatchObject({
      version: 2,
      name: '测试工程',
      devices: [],
      wires: [],
      harnesses: [],
      assets: [],
    });
  });

  test('round trips image assets, harnesses and unknown optional fields', () => {
    const project = createEmptyProject('SPI 接线');
    const template = {
      id: 'board',
      name: '主控板',
      category: '控制器',
      width: 180,
      height: 120,
      appearance: { kind: 'image' as const, assetId: 'board-image' },
      terminals: [
        {
          id: 'mosi',
          label: 'MOSI',
          typeId: 'spi-mosi',
          side: 'right' as const,
          order: 0,
          maxConnections: 1,
        },
      ],
    };
    project.devices = [
      {
        id: 'board-a',
        templateSnapshot: template,
        name: '主控板 A',
        position: { x: 10, y: 20 },
      },
      {
        id: 'board-b',
        templateSnapshot: template,
        name: '主控板 B',
        position: { x: 300, y: 20 },
      },
    ];
    project.terminalTypes = [
      {
        id: 'spi-mosi',
        name: 'SPI-MOSI',
        color: '#24a',
        compatibleTypeIds: ['spi-mosi'],
      },
    ];
    project.harnesses = [
      {
        id: 'harness-1',
        name: 'SPI-1',
        collapsed: true,
        templateSnapshot: {
          id: 'spi-1',
          name: 'SPI-1',
          color: '#369',
          conductors: [
            {
              id: 'mosi',
              name: 'MOSI',
              terminalTypeId: 'spi-mosi',
              required: true,
              order: 0,
            },
          ],
        },
      },
    ];
    project.wires = [
      {
        id: 'wire-1',
        source: { deviceId: 'board-a', terminalId: 'mosi' },
        target: { deviceId: 'board-b', terminalId: 'mosi' },
        harnessId: 'harness-1',
        conductorId: 'mosi',
      },
    ];
    project.assets = [
      {
        id: 'board-image',
        mimeType: 'image/png',
        name: 'board.png',
        data: 'data:image/png;base64,aGVsbG8=',
      },
    ];

    const withFutureFields = {
      ...project,
      futurePreference: { snapToGrid: true },
      devices: project.devices.map((device) => ({
        ...device,
        templateSnapshot: {
          ...device.templateSnapshot,
          terminals: device.templateSnapshot.terminals.map((terminal) => ({
            ...terminal,
            manufacturerPin: 'J1-1',
          })),
        },
      })),
    };

    const parsed = parseProjectFile(JSON.stringify(withFutureFields));
    expect(JSON.parse(serializeProjectFile(parsed))).toEqual(withFutureFields);
  });

  test('rejects invalid JSON, unsupported versions and missing required fields', () => {
    expect(() => parseProjectFile('{')).toThrow('工程文件不是有效的 JSON');
    expect(() => parseProjectFile('{}')).toThrow('工程文件缺少版本号');
    expect(() => parseProjectFile(JSON.stringify({ version: 1 }))).toThrow(
      '不支持的工程版本',
    );
    expect(() =>
      parseProjectFile(
        JSON.stringify({ ...createEmptyProject(), wires: undefined }),
      ),
    ).toThrow('工程结构无效：wires 缺少必需字段');
  });

  test('rejects invalid terminal layout and duplicate IDs', () => {
    const project = createEmptyProject();
    project.deviceLibrary = [
      {
        id: 'device-type',
        name: '设备',
        category: '',
        width: 100,
        height: 100,
        appearance: { kind: 'default' },
        terminals: [
          {
            id: 'pin',
            label: '端子',
            typeId: 'signal',
            side: 'left',
            order: 0,
            maxConnections: 1,
          },
        ],
      },
    ];
    const invalidSide = {
      ...project,
      deviceLibrary: [
        {
          ...project.deviceLibrary[0],
          terminals: [
            { ...project.deviceLibrary[0].terminals[0], side: 'center' },
          ],
        },
      ],
    };
    expect(() => parseProjectFile(JSON.stringify(invalidSide))).toThrow(
      '工程结构无效：deviceLibrary.0.terminals.0.side 字段值无效',
    );

    project.deviceLibrary.push({ ...project.deviceLibrary[0] });
    expect(() => parseProjectFile(JSON.stringify(project))).toThrow(
      'deviceLibrary 中存在重复 ID',
    );
  });
});
