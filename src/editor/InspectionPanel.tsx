import { useMemo, useState } from 'react';
import type { Project } from '../model/project';
import { safeProjectName } from './projectFiles';
import {
  csvForTerminalRows,
  inspectProject,
  harnessRows,
  terminalRows,
  type ValidationIssue,
} from './inspection';

interface Props {
  project: Project;
  onSelectIssue(issue: ValidationIssue): void;
  onSelectWire(id: string): void;
}

export default function InspectionPanel({
  project,
  onSelectIssue,
  onSelectWire,
}: Props) {
  const [tab, setTab] = useState<'validation' | 'table' | 'harness'>(
    'validation',
  );
  const [query, setQuery] = useState('');
  const issues = useMemo(() => inspectProject(project), [project]);
  const rows = useMemo(() => terminalRows(project), [project]);
  const harnessDetails = useMemo(() => harnessRows(project), [project]);
  const filtered = rows.filter((row) =>
    [
      row.device,
      row.terminal,
      row.type,
      row.side,
      row.connectedTo,
      row.number,
      row.harnessNumber,
      row.conductor,
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const filteredHarness = harnessDetails.filter((row) =>
    Object.values(row)
      .join(' ')
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );

  function exportCsv() {
    const blob = new Blob([csvForTerminalRows(filtered)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeProjectName(project.name)}-端子接线表.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="inspection-panel" aria-label="校验与接线表">
      <div className="inspection-tabs">
        <button
          type="button"
          aria-pressed={tab === 'validation'}
          onClick={() => setTab('validation')}
        >
          校验 {issues.length > 0 ? `(${issues.length})` : ''}
        </button>
        <button
          type="button"
          aria-pressed={tab === 'table'}
          onClick={() => setTab('table')}
        >
          端子接线表 ({rows.length})
        </button>
        <button
          type="button"
          aria-pressed={tab === 'harness'}
          onClick={() => setTab('harness')}
        >
          线束明细表 ({harnessDetails.length})
        </button>
        {(tab === 'table' || tab === 'harness') && (
          <div className="inspection-tools">
            <input
              aria-label="筛选接线表"
              placeholder="搜索设备、端子或线号"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {tab === 'table' && (
              <button type="button" onClick={exportCsv}>
                导出 CSV
              </button>
            )}
          </div>
        )}
      </div>
      <div className="inspection-content">
        {tab === 'validation' ? (
          issues.length === 0 ? (
            <p className="empty-hint">暂无接线问题</p>
          ) : (
            <ul className="issue-list">
              {issues.map((issue) => (
                <li key={issue.id}>
                  <button
                    type="button"
                    disabled={!issue.wireId && !issue.deviceId}
                    onClick={() => onSelectIssue(issue)}
                  >
                    <span className={`issue-level issue-${issue.severity}`}>
                      {issue.severity === 'error' ? '错误' : '警告'}
                    </span>
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : tab === 'harness' ? (
          <div className="terminal-table-wrap">
            <table className="terminal-table">
              <thead>
                <tr>
                  {[
                    '线束编号',
                    '模板',
                    '芯线',
                    '源设备/端子',
                    '目标设备/端子',
                    '状态',
                    '备注',
                  ].map((item) => (
                    <th key={item}>{item}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredHarness.map((row) => (
                  <tr key={row.id}>
                    <td>{row.number}</td>
                    <td>{row.template}</td>
                    <td>
                      {row.wireId ? (
                        <button
                          type="button"
                          className="table-link"
                          onClick={() => onSelectWire(row.wireId!)}
                        >
                          {row.conductor}
                        </button>
                      ) : (
                        row.conductor
                      )}
                    </td>
                    <td>{row.source}</td>
                    <td>{row.target}</td>
                    <td>{row.status}</td>
                    <td>{row.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredHarness.length && (
              <p className="empty-hint">没有匹配的线束记录</p>
            )}
          </div>
        ) : (
          <div className="terminal-table-wrap">
            <table className="terminal-table">
              <thead>
                <tr>
                  {[
                    '设备',
                    '端子',
                    '端子类型',
                    '所在边',
                    '连接对象',
                    '线号',
                    '线束编号',
                    '芯线名称',
                  ].map((heading) => (
                    <th key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    {[
                      row.device,
                      row.terminal,
                      row.type,
                      row.side,
                      row.connectedTo,
                      row.number,
                      row.harnessNumber,
                      row.conductor,
                    ].map((value, index) => (
                      <td key={index}>
                        {index === 0 ? (
                          <button
                            type="button"
                            className="table-link"
                            onClick={() => onSelectWire(row.wireId)}
                            aria-label={`定位导线 ${row.device} ${row.terminal}`}
                          >
                            {value || '—'}
                          </button>
                        ) : (
                          value || '—'
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="empty-hint">没有匹配的接线记录</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
