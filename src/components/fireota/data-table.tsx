import { ChevronDown, ChevronLeft, ChevronRight, Columns3, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ErrorState, SkeletonRows } from "@/components/fireota/primitives";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
  align?: "left" | "right";
  optional?: boolean;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  error?: Error | null;
  searchPlaceholder?: string;
  searchValue?: (row: T) => string;
  filters?: ReactNode;
  emptyState: ReactNode;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  pageSize?: number;
  bulkActions?: (selected: T[]) => ReactNode;
  toolbarAside?: ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  isLoading,
  error,
  searchPlaceholder = "Search…",
  searchValue,
  filters,
  emptyState,
  onRowClick,
  rowActions,
  pageSize = 10,
  bulkActions,
  toolbarAside,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);

  const visibleColumns = columns.filter((c) => !hidden.includes(c.key));

  const filtered = useMemo(() => {
    let out = rows;
    if (search && searchValue) {
      const query = search.toLowerCase();
      out = out.filter((row) => searchValue(row).toLowerCase().includes(query));
    }
    if (sort) {
      const column = columns.find((c) => c.key === sort.key);
      if (column?.sortValue) {
        out = [...out].sort((a, b) => {
          const av = column.sortValue!(a);
          const bv = column.sortValue!(b);
          const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, search, searchValue, sort, columns]);

  const pageCount = Math.max(Math.ceil(filtered.length / pageSize), 1);
  const current = Math.min(page, pageCount - 1);
  const paged = filtered.slice(current * pageSize, current * pageSize + pageSize);
  const selectedRows = rows.filter((row) => selected.includes(rowKey(row)));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface/50">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        {searchValue ? (
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 border-border bg-surface-2/60 pl-8 text-[12px]"
            />
          </div>
        ) : null}
        {filters}
        <div className="ml-auto flex items-center gap-2">
          {toolbarAside}
          {columns.some((c) => c.optional) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[12px]">
                  <Columns3 aria-hidden className="size-3.5" /> Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {columns
                  .filter((c) => c.optional)
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.key}
                      checked={!hidden.includes(column.key)}
                      onCheckedChange={(checked) =>
                        setHidden((prev) => (checked ? prev.filter((k) => k !== column.key) : [...prev, column.key]))
                      }
                    >
                      {column.header}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {bulkActions && selectedRows.length > 0 ? (
        <div className="flex items-center gap-3 border-b border-border bg-surface-2/40 px-4 py-2">
          <span className="font-mono text-[11px] text-muted-foreground">{selectedRows.length} selected</span>
          {bulkActions(selectedRows)}
        </div>
      ) : null}

      {error ? (
        <ErrorState title="We couldn't load this list" description={error.message} />
      ) : isLoading ? (
        <SkeletonRows rows={15} cols={visibleColumns.length} />
      ) : filtered.length === 0 ? (
        emptyState
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12px]">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
                {bulkActions ? (
                  <th className="w-9 px-3 py-2">
                    <Checkbox
                      aria-label="Select all rows on this page"
                      checked={paged.length > 0 && paged.every((row) => selected.includes(rowKey(row)))}
                      onCheckedChange={(checked) =>
                        setSelected(checked ? paged.map(rowKey) : [])
                      }
                    />
                  </th>
                ) : null}
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    className={cn("px-3 py-2 font-medium", column.align === "right" && "text-right", column.className)}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-muted-foreground"
                        onClick={() =>
                          setSort((prev) =>
                            prev?.key === column.key
                              ? { key: column.key, dir: prev.dir === "asc" ? "desc" : "asc" }
                              : { key: column.key, dir: "asc" },
                          )
                        }
                      >
                        {column.header}
                        <ChevronDown
                          aria-hidden
                          className={cn(
                            "size-3 transition-transform duration-150",
                            sort?.key === column.key ? "text-brand" : "text-faint",
                            sort?.key === column.key && sort.dir === "asc" && "rotate-180",
                          )}
                        />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
                {rowActions ? <th className="px-3 py-2 text-right font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paged.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={cn("row-hover", onRowClick && "cursor-pointer")}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {bulkActions ? (
                    <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        aria-label="Select row"
                        checked={selected.includes(rowKey(row))}
                        onCheckedChange={(checked) =>
                          setSelected((prev) =>
                            checked ? [...prev, rowKey(row)] : prev.filter((k) => k !== rowKey(row)),
                          )
                        }
                      />
                    </td>
                  ) : null}
                  {visibleColumns.map((column) => (
                    <td
                      key={column.key}
                      className={cn("px-3 py-2.5 align-middle", column.align === "right" && "text-right")}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                  {rowActions ? (
                    <td className="px-3 py-2.5 text-right" onClick={(event) => event.stopPropagation()}>
                      {rowActions(row)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && filtered.length > pageSize ? (
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <span className="font-mono text-[11px] text-faint">
            {current * pageSize + 1}–{Math.min((current + 1) * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label="Previous page"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft aria-hidden className="size-3.5" />
            </Button>
            <span className="px-1 font-mono text-[11px] text-muted-foreground">
              {current + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label="Next page"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight aria-hidden className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
