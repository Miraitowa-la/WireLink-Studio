import { useState } from 'react';
import type { HarnessConnection, Project } from '../model/project';

export function HarnessCreateDialog({
  project,
  wireIds,
  onCreate,
  onClose,
}: {
  project: Project;
  wireIds: string[];
  onCreate(
    details: Pick<
      HarnessConnection,
      'name' | 'number' | 'color' | 'note' | 'cableModel' | 'shielded'
    >,
  ): string | null;
  onClose(): void;
}) {
  const [details, setDetails] = useState({
    name: `线束 ${project.harnesses.length + 1}`,
    number: '',
    color: '#7045e5',
    note: '',
    cableModel: '',
    shielded: false,
  });
  const [error, setError] = useState('');
  return (
    <div className="modal-backdrop">
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="harness-create-title"
      >
        <header className="modal-header">
          <h2 id="harness-create-title">创建线束</h2>
          <button type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <p className="hint">
          已选择 {wireIds.length}{' '}
          根导线。分组会保留原有端子、名称、颜色和展开路径。
        </p>
        <div className="form-grid">
          <label>
            名称
            <input
              value={details.name}
              onChange={(event) =>
                setDetails({ ...details, name: event.target.value })
              }
            />
          </label>
          <label>
            编号
            <input
              value={details.number}
              onChange={(event) =>
                setDetails({ ...details, number: event.target.value })
              }
            />
          </label>
          <label>
            线束颜色
            <input
              type="color"
              value={details.color}
              onChange={(event) =>
                setDetails({ ...details, color: event.target.value })
              }
            />
          </label>
          <label>
            线缆型号
            <input
              value={details.cableModel}
              onChange={(event) =>
                setDetails({ ...details, cableModel: event.target.value })
              }
            />
          </label>
          <label className="span-two">
            备注
            <input
              value={details.note}
              onChange={(event) =>
                setDetails({ ...details, note: event.target.value })
              }
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={details.shielded}
              onChange={(event) =>
                setDetails({ ...details, shielded: event.target.checked })
              }
            />
            屏蔽线缆
          </label>
        </div>
        {error && (
          <p role="alert" className="status-error">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => setError(onCreate(details) ?? '')}
          >
            创建并走线
          </button>
        </footer>
      </section>
    </div>
  );
}
