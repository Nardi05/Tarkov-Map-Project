/**
 * A copy-on-write filesystem for running the data pipeline without a disk.
 *
 * The pipeline reads a dozen vendored inputs (map geometry, wiki scrapes, the
 * seasonal questline) and writes about twenty payloads. On a build machine both
 * halves are real files. Inside a serverless function the inputs are still
 * real — they ship in the function bundle — but the output directory is
 * read-only, and the result is wanted in memory anyway so it can be handed
 * straight back as an HTTP response.
 *
 * So: reads fall through to the real filesystem, writes land in a Map, and a
 * read of something already written sees the written copy. That is the whole
 * idea. The pipeline does not know the difference, which is the point — the
 * live endpoint and the build produce identical bytes because they run
 * identical code.
 *
 * `rm` is the one part that needs care. The pipeline clears its output
 * directory before rebuilding it, and if that were a no-op, a read of a file
 * the fresh build had not written yet would quietly fall through to last
 * deploy's copy on disk. So removal is recorded, and a read below a removed
 * path fails with ENOENT until something writes it again — exactly what would
 * happen on a real disk.
 */
import nodeFs from "node:fs/promises";
import path from "node:path";

function enoent(target) {
  const err = new Error(`ENOENT: no such file or directory, open '${target}'`);
  err.code = "ENOENT";
  return err;
}

const norm = (p) => path.resolve(p);
const isUnder = (child, parent) => child === parent || child.startsWith(parent + path.sep);

export function overlayFs(base = nodeFs) {
  /** @type {Map<string, Buffer|string>} */
  const files = new Map();
  /** Paths cleared by `rm` and not written since. */
  const removed = new Set();

  const isRemoved = (p) => {
    if (files.has(p)) return false;
    for (const gone of removed) if (isUnder(p, gone)) return true;
    return false;
  };

  const fs = {
    async readFile(target, encoding) {
      const p = norm(target);
      if (files.has(p)) {
        const held = files.get(p);
        const enc = typeof encoding === "string" ? encoding : encoding?.encoding;
        if (enc) return typeof held === "string" ? held : held.toString(enc);
        return typeof held === "string" ? Buffer.from(held) : held;
      }
      if (isRemoved(p)) throw enoent(p);
      return base.readFile(target, encoding);
    },

    async writeFile(target, data) {
      const p = norm(target);
      files.set(p, data);
      for (const gone of [...removed]) if (isUnder(p, gone)) removed.delete(gone);
    },

    async readdir(target) {
      const dir = norm(target);
      const names = new Set();
      if (!isRemoved(dir)) {
        try {
          for (const name of await base.readdir(target)) names.add(name);
        } catch {
          /* the directory may exist only in the overlay */
        }
      }
      for (const p of files.keys()) {
        if (path.dirname(p) === dir) names.add(path.basename(p));
      }
      // A directory that exists in neither place is still an error, the same
      // way it would be on disk — the pipeline relies on that to detect a
      // first build with nothing to compare against.
      if (!names.size && isRemoved(dir)) throw enoent(dir);
      return [...names];
    },

    async mkdir() {
      /* directories are implied by the paths in the map */
    },

    async rm(target) {
      const p = norm(target);
      removed.add(p);
      for (const held of [...files.keys()]) if (isUnder(held, p)) files.delete(held);
    },

    async copyFile(src, dest) {
      await fs.writeFile(dest, await fs.readFile(src));
    },

    async stat(target) {
      const p = norm(target);
      if (files.has(p)) {
        const held = files.get(p);
        return { size: typeof held === "string" ? Buffer.byteLength(held) : held.length };
      }
      if (isRemoved(p)) throw enoent(p);
      return base.stat(target);
    },

    /** Everything written during the run, keyed by path relative to `from`. */
    written(from) {
      const root = norm(from);
      const out = new Map();
      for (const [p, data] of files) {
        if (!isUnder(p, root)) continue;
        out.set(path.relative(root, p).split(path.sep).join("/"), data);
      }
      return out;
    },
  };

  return fs;
}
