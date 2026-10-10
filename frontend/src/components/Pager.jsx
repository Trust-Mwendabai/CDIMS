import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/** Page numbers with ellipses, e.g. 1 … 4 5 [6] 7 8 … 20 */
function windowOf(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, 2, pages - 1, pages, page - 1, page, page + 1]);
  const list = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  list.forEach((n, i) => {
    if (i && n - list[i - 1] > 1) out.push('…');
    out.push(n);
  });
  return out;
}

/**
 * Pagination bar: range text, first/prev/numbers/next/last and a page-size selector.
 * Controlled: the parent owns `page` and `pageSize`.
 */
export default function Pager({ total, page, pageSize, onPage, onPageSize, sizes = [10, 25, 50, 100], label = 'items' }) {
  const size = pageSize === 0 ? Math.max(total, 1) : pageSize; // 0 means "show all"
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const nums = useMemo(() => windowOf(page, pages), [page, pages]);

  if (total <= Math.min(...sizes.filter((s) => s > 0))) {
    return total ? <div className="pager"><span>{total.toLocaleString()} {label}</span></div> : null;
  }

  return (
    <nav className="pager2" aria-label="Pagination">
      <span className="pager-range">Showing <b>{from.toLocaleString()}–{to.toLocaleString()}</b> of <b>{total.toLocaleString()}</b> {label}</span>
      <div className="pager-controls">
        <button className="pg" onClick={() => onPage(1)} disabled={page <= 1} aria-label="First page"><ChevronsLeft size={16} /></button>
        <button className="pg" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft size={16} /></button>
        <span className="pg-nums">
          {nums.map((n, i) => (n === '…'
            ? <span key={`e${i}`} className="pg-gap">…</span>
            : <button key={n} className={`pg ${n === page ? 'on' : ''}`} onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined} aria-label={`Page ${n}`}>{n}</button>))}
        </span>
        <span className="pg-compact">Page {page} of {pages}</span>
        <button className="pg" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page"><ChevronRight size={16} /></button>
        <button className="pg" onClick={() => onPage(pages)} disabled={page >= pages} aria-label="Last page"><ChevronsRight size={16} /></button>
      </div>
      {onPageSize && (
        <label className="pager-size">
          <span>Rows</span>
          <select className="input compact" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Rows per page">
            {sizes.map((s) => <option key={s} value={s}>{s === 0 ? 'All' : s}</option>)}
          </select>
        </label>
      )}
    </nav>
  );
}

/** Client-side pagination for lists already in memory. Resets to page 1 when the list changes. */
export function usePaged(items, initialSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  const total = items.length;
  const size = pageSize === 0 ? Math.max(total, 1) : pageSize; // 0 means "show all"
  const pages = Math.max(1, Math.ceil(total / size));

  useEffect(() => { setPage(1); }, [total, pageSize]);
  const current = Math.min(page, pages);
  const slice = useMemo(() => items.slice((current - 1) * size, current * size), [items, current, size]);

  return {
    slice,
    pagerProps: { total, page: current, pageSize, onPage: setPage, onPageSize: setPageSize },
  };
}
