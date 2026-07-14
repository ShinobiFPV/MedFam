import type { ReactNode } from 'react';
import styles from './DataTable.module.css';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T extends { id: number }> {
  columns: Column<T>[];
  rows: T[];
  onEdit: (row: T) => void;
  onDelete: (row: T) => void;
  emptyMessage?: string;
  extraAction?: (row: T) => ReactNode;
}

export function DataTable<T extends { id: number }>({
  columns,
  rows,
  onEdit,
  onDelete,
  emptyMessage,
  extraAction,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <div className={styles.empty}>{emptyMessage || 'Nothing here yet.'}</div>;
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key}>{c.label}</th>
          ))}
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {columns.map((c) => (
              <td key={c.key}>{c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}</td>
            ))}
            <td className={styles.actions}>
              {extraAction?.(row)}
              <button type="button" onClick={() => onEdit(row)}>
                Edit
              </button>
              <button type="button" className={styles.deleteButton} onClick={() => onDelete(row)}>
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
