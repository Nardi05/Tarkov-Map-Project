/**
 * Reading text off a screenshot, entirely in the browser.
 *
 * Everything this needs — the worker, the wasm core, the English model — is
 * served from this site's own `/ocr/` directory, staged there by
 * `scripts/setup-ocr.mjs`. Tesseract.js would otherwise pull all three from
 * unpkg at runtime, which would mean the feature quietly breaking whenever
 * somebody else's CDN had a bad day.
 *
 * The image never leaves the machine either. There is no upload: the file is
 * drawn to a canvas and handed to a worker in the same tab.
 *
 * All of it sits behind a dynamic import, so none of the several megabytes is
 * fetched — or even requested — unless somebody opens the screenshot panel.
 */

export interface OcrProgress {
  /** "loading" while the engine downloads, "reading" once it is working. */
  phase: "loading" | "reading";
  /** 0-1, or null when the underlying step does not report one. */
  ratio: number | null;
}

export class OcrError extends Error {}

type TesseractModule = typeof import("tesseract.js");
type Worker = Awaited<ReturnType<TesseractModule["createWorker"]>>;

let workerPromise: Promise<Worker> | null = null;

const base = () => `${import.meta.env.BASE_URL}ocr`;

/**
 * One worker, reused across screenshots.
 *
 * Starting it means fetching and compiling several megabytes of wasm, so
 * somebody working through eleven traders should pay that once. `disposeOcr`
 * releases it when the wizard unmounts.
 */
async function getWorker(onProgress?: (p: OcrProgress) => void): Promise<Worker> {
  if (workerPromise) return workerPromise;

  workerPromise = (async () => {
    const { createWorker } = await import("tesseract.js");
    return createWorker("eng", 1, {
      workerPath: `${base()}/worker.min.js`,
      corePath: base(),
      langPath: base(),
      // Keeps the model in the browser's cache between visits, so the second
      // trader — and the next session — start without the download.
      cacheMethod: "write",
      logger: (m: { status?: string; progress?: number }) => {
        if (!onProgress) return;
        onProgress({
          phase: m.status === "recognizing text" ? "reading" : "loading",
          ratio: typeof m.progress === "number" ? m.progress : null,
        });
      },
    });
  })().catch((err: unknown) => {
    // Almost always the staged assets missing, which is a build problem rather
    // than anything the player did. Cleared so a retry can work.
    workerPromise = null;
    throw new OcrError(
      `The text reader could not start (${err instanceof Error ? err.message : "unknown error"}).`,
    );
  });

  return workerPromise;
}

/**
 * Scales a screenshot into the band Tesseract reads best.
 *
 * Accuracy falls off below roughly 30px of cap height, so a small image is
 * worth upscaling; a 4K grab is not worth downscaling, which costs accuracy
 * and time for nothing. Both ends are clamped rather than guessed at.
 */
async function prepare(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new OcrError("That file could not be read as an image.");
  });

  const target = 1600;
  const scale = Math.min(2, Math.max(1, target / Math.max(bitmap.width, bitmap.height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new OcrError("This browser would not give us a canvas to work on.");
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return canvas;
}

/** Reads one screenshot and returns its raw text, newline separated. */
export async function readImage(file: File, onProgress?: (p: OcrProgress) => void): Promise<string> {
  const canvas = await prepare(file);
  const worker = await getWorker(onProgress);
  onProgress?.({ phase: "reading", ratio: 0 });

  const { data } = await worker.recognize(canvas);
  return data.text ?? "";
}

/** Frees the wasm worker. Called when the wizard unmounts. */
export async function disposeOcr(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    await (await pending).terminate();
  } catch {
    /* Already gone, or never started; nothing to release. */
  }
}
