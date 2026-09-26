import type { ImageAsset, Project } from '../model/project';

const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function readImageAsset(file: File): Promise<ImageAsset> {
  if (!allowedTypes.has(file.type))
    throw new Error('仅支持 PNG、JPG、WebP 图片');
  if (file.size > 5 * 1024 * 1024) throw new Error('单张图片不能超过 5 MB');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('图片无法解码'));
    image.src = data;
  });
  return {
    id: crypto.randomUUID(),
    mimeType: file.type as ImageAsset['mimeType'],
    name: file.name,
    data,
  };
}

export function pruneAssets(project: Project): Project {
  const used = new Set([
    ...project.deviceLibrary.map((item) => item.appearance.assetId),
    ...project.devices.map((item) => item.templateSnapshot.appearance.assetId),
  ]);
  return {
    ...project,
    assets: project.assets.filter((asset) => used.has(asset.id)),
  };
}
