import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Minimal Markdown for agent answers: headings, lists, tables, **bold**, `code`.
 * Builds React elements only (no HTML injection), so model output is safe to render.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={cn("space-y-3 text-sm leading-relaxed", className)}>{blocks(text)}</div>;
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

function blocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const at = (n: number) => lines[n] ?? "";
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = at(i);
    const key = out.length;

    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      out.push(
        <p
          key={key}
          className={cn(
            "font-semibold text-foreground",
            level <= 2 ? "text-base" : "text-sm",
            "pt-1",
          )}
        >
          {inline(heading[2] ?? "")}
        </p>,
      );
      i++;
      continue;
    }

    // Table: header row, separator row (|---|---|), body rows.
    if (line.trim().startsWith("|") && /^\s*\|?\s*:?-{2,}/.test(at(i + 1))) {
      const head = cells(line);
      const body: string[][] = [];
      i += 2;
      while (i < lines.length && at(i).trim().startsWith("|")) body.push(cells(at(i++)));
      out.push(
        <div key={key} className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50">
              <tr>
                {head.map((h, c) => (
                  <th key={c} className="px-3 py-2 font-medium">
                    {inline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r} className="border-t">
                  {row.map((cell, c) => (
                    <td key={c} className="px-3 py-2 align-top">
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const bullet = /^\s*([-*]|\d+\.)\s+/;
    if (bullet.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && bullet.test(at(i))) items.push(at(i++).replace(bullet, ""));
      const List = ordered ? "ol" : "ul";
      out.push(
        <List key={key} className={cn("space-y-1 pl-5", ordered ? "list-decimal" : "list-disc")}>
          {items.map((item, n) => (
            <li key={n}>{inline(item)}</li>
          ))}
        </List>,
      );
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      at(i).trim() &&
      !/^(#{1,6})\s/.test(at(i)) &&
      !bullet.test(at(i)) &&
      !at(i).trim().startsWith("|")
    ) {
      para.push(at(i++));
    }
    if (para.length === 0) para.push(at(i++));
    out.push(<p key={key}>{inline(para.join(" "))}</p>);
  }
  return out;
}
