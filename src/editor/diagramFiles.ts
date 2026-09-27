import type { Project } from '../model/project';
import { serializeProjectFile } from '../model/project';
import { safeProjectName } from './projectFiles';
import { renderDiagramSvg } from './diagramExport';
import { renderViewerHtml } from './diagramViewer';
function download(content: Blob, filename: string): void {
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportDiagram(
  project: Project,
  format: 'json' | 'svg' | 'png' | 'html',
): Promise<void> {
  const name = safeProjectName(project.name);
  if (format === 'json') {
    download(
      new Blob([serializeProjectFile(project)], {
        type: 'application/json;charset=utf-8',
      }),
      `${name}.json`,
    );
    return;
  }
  if (format === 'html') {
    download(
      new Blob([renderViewerHtml(project)], {
        type: 'text/html;charset=utf-8',
      }),
      `${name}.html`,
    );
    return;
  }
  const { svg, width, height } = renderDiagramSvg(project);
  if (format === 'svg') {
    download(
      new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
      `${name}.svg`,
    );
    return;
  }
  const url = URL.createObjectURL(
    new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
  );
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const result = new Image();
      result.onload = () => resolve(result);
      result.onerror = () => reject(new Error('SVG 图纸无法转换为 PNG'));
      result.src = url;
    });
    const scale = Math.min(2, 8192 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法生成 PNG');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error('PNG 编码失败')),
        'image/png',
      ),
    );
    download(blob, `${name}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
