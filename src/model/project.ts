import { z } from 'zod';

export const PROJECT_VERSION = 2 as const;

const id = z.string().min(1);
const label = z.string().min(1);
const point = z.looseObject({ x: z.number().finite(), y: z.number().finite() });
const size = z.looseObject({
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

export const sideSchema = z.enum(['top', 'right', 'bottom', 'left']);
export type Side = z.infer<typeof sideSchema>;

export const electricalRoleSchema = z.enum([
  'passive',
  'power-source',
  'power-sink',
  'signal-source',
  'signal-sink',
  'bidirectional',
]);
export type ElectricalRole = z.infer<typeof electricalRoleSchema>;

export const terminalTypeSchema = z.looseObject({
  id,
  name: label,
  color: label,
  description: z.string().optional(),
  compatibleTypeIds: z.array(id),
  defaultElectricalRole: electricalRoleSchema.optional(),
});
export type TerminalType = z.infer<typeof terminalTypeSchema>;

export const terminalDefinitionSchema = z.looseObject({
  id,
  label,
  typeId: id,
  side: sideSchema,
  order: z.number().int().nonnegative(),
  maxConnections: z.number().int().positive().nullable(),
  electricalRole: electricalRoleSchema.optional(),
  note: z.string().optional(),
});
export type TerminalDefinition = z.infer<typeof terminalDefinitionSchema>;

export const deviceAppearanceSchema = z.looseObject({
  kind: z.enum(['default', 'image']),
  assetId: id.optional(),
  imageFit: z.enum(['contain', 'cover']).optional(),
});
export type DeviceAppearance = z.infer<typeof deviceAppearanceSchema>;

export const deviceTemplateSchema = z.looseObject({
  id,
  name: label,
  category: z.string(),
  width: size.shape.width,
  height: size.shape.height,
  appearance: deviceAppearanceSchema,
  terminals: z.array(terminalDefinitionSchema),
  note: z.string().optional(),
});
export type DeviceTemplate = z.infer<typeof deviceTemplateSchema>;

export const deviceInstanceSchema = z.looseObject({
  id,
  templateId: id.optional(),
  templateSnapshot: deviceTemplateSchema,
  name: label,
  position: point,
  size: size.optional(),
  note: z.string().optional(),
});
export type DeviceInstance = z.infer<typeof deviceInstanceSchema>;

export const wireEndpointSchema = z.looseObject({
  deviceId: id,
  terminalId: id,
});
export type WireEndpoint = z.infer<typeof wireEndpointSchema>;

export const wireSchema = z.looseObject({
  id,
  source: wireEndpointSchema,
  target: wireEndpointSchema,
  color: z.string().optional(),
  number: z.string().optional(),
  name: z.string().optional(),
  note: z.string().optional(),
  harnessId: id.optional(),
  conductorId: id.optional(),
  routePoints: z.array(point).optional(),
});
export type Wire = z.infer<typeof wireSchema>;

export const harnessConductorSchema = z.looseObject({
  id,
  name: label,
  terminalTypeId: id,
  color: z.string().optional(),
  required: z.boolean(),
  order: z.number().int().nonnegative(),
});
export type HarnessConductor = z.infer<typeof harnessConductorSchema>;

export const harnessTemplateSchema = z.looseObject({
  id,
  name: label,
  description: z.string().optional(),
  color: label,
  conductors: z.array(harnessConductorSchema),
});
export type HarnessTemplate = z.infer<typeof harnessTemplateSchema>;

export const harnessConnectionSchema = z.looseObject({
  id,
  templateId: id.optional(),
  templateSnapshot: harnessTemplateSchema,
  number: z.string().optional(),
  name: label,
  note: z.string().optional(),
  cableModel: z.string().optional(),
  shielded: z.boolean().optional(),
  collapsed: z.boolean(),
  routePoints: z.array(point).optional(),
});
export type HarnessConnection = z.infer<typeof harnessConnectionSchema>;

export const imageAssetSchema = z.looseObject({
  id,
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  name: label,
  data: z.string().min(1),
});
export type ImageAsset = z.infer<typeof imageAssetSchema>;

export const projectSchema = z.looseObject({
  version: z.literal(PROJECT_VERSION),
  name: label,
  devices: z.array(deviceInstanceSchema),
  wires: z.array(wireSchema),
  harnesses: z.array(harnessConnectionSchema),
  deviceLibrary: z.array(deviceTemplateSchema),
  terminalTypes: z.array(terminalTypeSchema),
  harnessLibrary: z.array(harnessTemplateSchema),
  assets: z.array(imageAssetSchema),
  viewPreferences: z
    .looseObject({
      wireStyle: z.enum(['curve', 'orthogonal']),
      showLabels: z.boolean(),
    })
    .optional(),
});
export type Project = z.infer<typeof projectSchema>;

export function createEmptyProject(name = '未命名工程'): Project {
  return {
    version: PROJECT_VERSION,
    name,
    devices: [],
    wires: [],
    harnesses: [],
    deviceLibrary: [],
    terminalTypes: [],
    harnessLibrary: [],
    assets: [],
  };
}

function assertUniqueIds(items: { id: string }[], path: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new Error(`工程结构无效：${path} 中存在重复 ID“${item.id}”`);
    }
    seen.add(item.id);
  }
}

function assertProjectIds(project: Project): void {
  assertUniqueIds(project.devices, 'devices');
  assertUniqueIds(project.wires, 'wires');
  assertUniqueIds(project.harnesses, 'harnesses');
  assertUniqueIds(project.deviceLibrary, 'deviceLibrary');
  assertUniqueIds(project.terminalTypes, 'terminalTypes');
  assertUniqueIds(project.harnessLibrary, 'harnessLibrary');
  assertUniqueIds(project.assets, 'assets');

  for (const template of project.deviceLibrary) {
    assertUniqueIds(
      template.terminals,
      `deviceLibrary.${template.id}.terminals`,
    );
  }
  for (const device of project.devices) {
    assertUniqueIds(
      device.templateSnapshot.terminals,
      `devices.${device.id}.terminals`,
    );
  }
  for (const template of project.harnessLibrary) {
    assertUniqueIds(
      template.conductors,
      `harnessLibrary.${template.id}.conductors`,
    );
  }
  for (const harness of project.harnesses) {
    assertUniqueIds(
      harness.templateSnapshot.conductors,
      `harnesses.${harness.id}.conductors`,
    );
  }
}

export function parseProjectFile(content: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error('工程文件不是有效的 JSON');
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('工程文件的根节点必须是对象');
  }

  if (!('version' in data)) {
    throw new Error('工程文件缺少版本号');
  }
  if (data.version !== PROJECT_VERSION) {
    throw new Error(
      `不支持的工程版本：${String(data.version)}；当前支持版本 ${PROJECT_VERSION}`,
    );
  }

  const result = projectSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.join('.') || '根节点';
    const reason =
      issue.code === 'invalid_type' && issue.input === undefined
        ? '缺少必需字段'
        : '字段值无效';
    throw new Error(`工程结构无效：${path} ${reason}`);
  }

  assertProjectIds(result.data);
  return result.data;
}

export function serializeProjectFile(project: Project): string {
  return JSON.stringify(parseProjectFile(JSON.stringify(project)), null, 2);
}
