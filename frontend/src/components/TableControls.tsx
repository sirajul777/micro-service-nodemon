import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

type TableControlsProps = {
  rows: Record<string, any>[];
  searchable?: boolean;
  pageSize?: number;
  onPageChange?: (page: number) => void;
};

export function useTableControls({ rows, pageSize = 25 }: Pick<TableControlsProps, 'rows' | 'pageSize'>) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalized) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(normalized)));
  }, [rows, normalized]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return {
    query,
    setQuery: (value: string) => { setQuery(value); setPage(1); },
    page: safePage,
    totalPages,
    filtered,
    visible,
    next: () => setPage((value) => Math.min(value + 1, totalPages)),
    previous: () => setPage((value) => Math.max(value - 1, 1)),
  };
}

export function TableControlBar({ query, onQueryChange, page, totalPages, totalRows, onPrevious, onNext }: {
  query: string;
  onQueryChange: (value: string) => void;
  page: number;
  totalPages: number;
  totalRows: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return <div className="table-controls">
    <div className="table-search"><Search size={15} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search records..." /></div>
    <div className="table-pagination"><span>{totalRows} records · Page {page} / {totalPages}</span><button className="icon tiny" disabled={page <= 1} onClick={onPrevious} aria-label="Previous page"><ChevronLeft size={15} /></button><button className="icon tiny" disabled={page >= totalPages} onClick={onNext} aria-label="Next page"><ChevronRight size={15} /></button></div>
  </div>;
}
