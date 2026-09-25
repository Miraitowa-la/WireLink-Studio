import { z } from 'zod';
import {
  deviceTemplateSchema,
  terminalTypeSchema,
  type DeviceTemplate,
  type TerminalType,
} from '../model/project';

const STORAGE_KEY = 'wirelink-studio-public-library-v1';
const librarySchema = z.looseObject({
  terminalTypes: z.array(terminalTypeSchema),
  deviceTemplates: z.array(deviceTemplateSchema),
});

export interface PublicLibrary {
  terminalTypes: TerminalType[];
  deviceTemplates: DeviceTemplate[];
}

export function loadPublicLibrary(): PublicLibrary {
  const text = localStorage.getItem(STORAGE_KEY);
  if (!text) return { terminalTypes: [], deviceTemplates: [] };
  try {
    return librarySchema.parse(JSON.parse(text));
  } catch {
    throw new Error('本机公共库数据无效，已暂停公共库编辑以避免覆盖原有数据');
  }
}

export function savePublicLibrary(library: PublicLibrary): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(librarySchema.parse(library)),
  );
}
