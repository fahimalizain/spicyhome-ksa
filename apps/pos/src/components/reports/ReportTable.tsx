import { Children, cloneElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';

export const REPORT_TH =
  'sticky top-0 z-20 bg-gray-800 px-3 py-2 shadow-[inset_0_-1px_0_0_rgb(55,65,81)]';

export const REPORT_TF =
  'sticky bottom-0 z-20 bg-gray-800 px-3 py-2 shadow-[inset_0_1px_0_0_rgb(75,85,99)]';

interface ReportTableProps {
  children: ReactNode;
  loading?: boolean;
}

function headerColCount(children: ReactNode): number {
  let count = 0;
  Children.forEach(children, (child) => {
    if (!isValidElement(child) || child.type !== 'thead') return;
    const thead = child as ReactElement<{ children?: ReactNode }>;
    Children.forEach(thead.props.children, (row) => {
      if (!isValidElement(row)) return;
      const tr = row as ReactElement<{ children?: ReactNode }>;
      Children.forEach(tr.props.children, (cell) => {
        if (!isValidElement(cell)) return;
        const th = cell as ReactElement<{ colSpan?: number }>;
        count += th.props.colSpan ?? 1;
      });
    });
  });
  return count || 1;
}

function withSpacer(children: ReactNode, colSpan: number): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child) || child.type !== 'tbody') return child;
    const tbody = child as ReactElement<{ children?: ReactNode }>;
    return cloneElement(
      tbody,
      undefined,
      tbody.props.children,
      <tr
        key="report-table-spacer"
        aria-hidden="true"
        data-spacer
        data-testid="report-table-spacer"
      >
        <td colSpan={colSpan} className="p-0" />
      </tr>,
    );
  });
}

export function ReportTable({ children, loading = false }: ReportTableProps) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        data-testid="report-table-scroll"
        className="min-h-0 flex-1 overflow-auto scrollbar-thin rounded-lg border border-gray-700"
      >
        <table className="min-h-full w-full text-sm text-gray-300 whitespace-nowrap border-separate border-spacing-0 [&_thead_tr]:h-0 [&_tbody_tr:not([data-spacer])]:h-0 [&_tfoot_tr]:h-0">
          {withSpacer(children, headerColCount(children))}
        </table>
      </div>
      {loading && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-gray-900/60 rounded-lg"
          aria-busy="true"
        >
          <div className="flex items-center gap-2 text-gray-400">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-brand-500" />
            <span>Loading...</span>
          </div>
        </div>
      )}
    </div>
  );
}
