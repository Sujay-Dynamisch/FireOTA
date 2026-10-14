/**
 * FireOTA update package: gzip( "FOTA1\n" | u32 big-endian header length | JSON {files:[{path,size}]} | file bytes ).
 * The native SDK unpacks exactly this format (FireOTAStore.kt / FireOTA.m).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";

function walk(dir, root = dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, root) : [relative(root, full).split(sep).join("/")];
  });
}

/** gzip( "FOTA1\n" | u32 header length | JSON {files:[{path,size}]} | file bytes ) */
export function packDirectory(dir) {
  const paths = walk(dir).sort();
  const files = paths.map((path) => ({ path, size: statSync(join(dir, path)).size }));
  const header = Buffer.from(JSON.stringify({ version: 1, files }), "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  const parts = [Buffer.from("FOTA1\n", "ascii"), length, header, ...paths.map((p) => readFileSync(join(dir, p)))];
  return gzipSync(Buffer.concat(parts), { level: 9 });
}

