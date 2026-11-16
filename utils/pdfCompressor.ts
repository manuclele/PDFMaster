import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { CompressionPreset, CompressionSettings } from '../types';

const PDFJS_VERSION = pdfjsLib.version;
const CDN_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}`;

if (typeof window !== 'undefined' && 'Worker' in window) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${CDN_URL}/legacy/build/pdf.worker.min.mjs`;
}

export const COMPRESSION_PRESETS: Record<
  Exclude<CompressionPreset, 'custom'>,
  {
    label: string;
    description: string;
    settings: Omit<CompressionSettings, 'preset'>;
  }
> = {
  light: {
    label: 'Alta Qualità',
    description: 'Compressione leggera, ideale per stampa e lettura ad alta definizione.',
    settings: {
      mode: 'raster',
      quality: 0.85,
      dpi: 200,
      grayscale: false,
      stripMetadata: true,
      useObjectStreams: true,
      keepSmallerOriginal: true,
    },
  },
  balanced: {
    label: 'Bilanciata',
    description: 'Miglior compromesso tra riduzione di peso e nitidezza del testo.',
    settings: {
      mode: 'raster',
      quality: 0.7,
      dpi: 150,
      grayscale: false,
      stripMetadata: true,
      useObjectStreams: true,
      keepSmallerOriginal: true,
    },
  },
  maximum: {
    label: 'Massima',
    description: 'Riduce al minimo la dimensione del file per invii rapidi via email.',
    settings: {
      mode: 'raster',
      quality: 0.45,
      dpi: 110,
      grayscale: false,
      stripMetadata: true,
      useObjectStreams: true,
      keepSmallerOriginal: true,
    },
  },
};

export async function getPdfPageCount(file: File): Promise<number> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  return pdfDoc.getPageCount();
}

function clearMetadata(pdfDoc: PDFDocument) {
  pdfDoc.setTitle('');
  pdfDoc.setAuthor('');
  pdfDoc.setSubject('');
  pdfDoc.setKeywords([]);
  pdfDoc.setProducer('');
  pdfDoc.setCreator('');
}

async function appendCompressedPages(
  file: File,
  targetPdf: PDFDocument,
  settings: CompressionSettings,
  onProgress?: (pageIndex: number, totalPages: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const arrayBuffer = await file.arrayBuffer();

  if (settings.mode === 'lossless') {
    const srcPdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const indices = srcPdf.getPageIndices();
    const total = indices.length;
    const copiedPages = await targetPdf.copyPages(srcPdf, indices);
    copiedPages.forEach((page, idx) => {
      if (signal?.aborted) {
        throw new DOMException('Operazione annullata', 'AbortError');
      }
      targetPdf.addPage(page);
      onProgress?.(idx + 1, total);
    });
    return;
  }

  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    standardFontDataUrl: `${CDN_URL}/standard_fonts/`,
    cMapUrl: `${CDN_URL}/cmaps/`,
    cMapPacked: true,
    disableFontFace: false,
    useWorkerFetch: false,
  });

  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  // Cap canvas dimensions to prevent browser memory exhaustion on oversized engineering sheets
  const MAX_CANVAS_DIM = 3200;
  const targetScale = settings.dpi / 72;

  for (let i = 1; i <= totalPages; i++) {
    if (signal?.aborted) {
      await pdf.destroy();
      throw new DOMException('Operazione annullata', 'AbortError');
    }

    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    let renderViewport = page.getViewport({ scale: targetScale });

    if (renderViewport.width > MAX_CANVAS_DIM || renderViewport.height > MAX_CANVAS_DIM) {
      const clampFactor = Math.min(
        MAX_CANVAS_DIM / renderViewport.width,
        MAX_CANVAS_DIM / renderViewport.height
      );
      renderViewport = page.getViewport({ scale: targetScale * clampFactor });
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(renderViewport.width));
    canvas.height = Math.max(1, Math.round(renderViewport.height));

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Impossibile inizializzare il contesto grafico per la compressione.');
    }

    // White background prevents transparent PDF regions from turning black in JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (settings.grayscale) {
      ctx.filter = 'grayscale(100%)';
    }

    await page.render({
      canvasContext: ctx,
      viewport: renderViewport,
    }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', settings.quality)
    );

    // Free canvas memory immediately
    canvas.width = 0;
    canvas.height = 0;

    if (!blob) {
      throw new Error(`Errore nella codifica JPEG della pagina ${i}.`);
    }

    const imgBytes = await blob.arrayBuffer();
    const embeddedImage = await targetPdf.embedJpg(imgBytes);

    // Preserve exact physical page size (in 72-DPI PDF points)
    const outPage = targetPdf.addPage([baseViewport.width, baseViewport.height]);
    outPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: baseViewport.width,
      height: baseViewport.height,
    });

    onProgress?.(i, totalPages);
  }

  await pdf.destroy();
}

export async function compressSinglePdf(
  file: File,
  settings: CompressionSettings,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<{ bytes: Uint8Array; usedOriginalFallback: boolean }> {
  const outPdf = await PDFDocument.create();

  await appendCompressedPages(
    file,
    outPdf,
    settings,
    (page, total) => {
      onProgress?.(Math.round((page / Math.max(1, total)) * 95));
    },
    signal
  );

  if (settings.stripMetadata) {
    clearMetadata(outPdf);
  }

  const compressedBytes = await outPdf.save({
    useObjectStreams: settings.useObjectStreams,
    addDefaultPage: false,
  });

  onProgress?.(100);

  if (settings.keepSmallerOriginal && compressedBytes.length >= file.size) {
    const originalBytes = new Uint8Array(await file.arrayBuffer());
    return { bytes: originalBytes, usedOriginalFallback: true };
  }

  return { bytes: compressedBytes, usedOriginalFallback: false };
}

export async function compressAndMergePdfs(
  files: File[],
  settings: CompressionSettings,
  onFileProgress?: (fileIndex: number, pageProgress: number) => void,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (let idx = 0; idx < files.length; idx++) {
    if (signal?.aborted) {
      throw new DOMException('Operazione annullata', 'AbortError');
    }

    await appendCompressedPages(
      files[idx],
      mergedPdf,
      settings,
      (page, total) => {
        onFileProgress?.(idx, Math.round((page / Math.max(1, total)) * 100));
      },
      signal
    );
  }

  if (settings.stripMetadata) {
    clearMetadata(mergedPdf);
  }

  return mergedPdf.save({
    useObjectStreams: settings.useObjectStreams,
    addDefaultPage: false,
  });
}

export async function estimatePdfCompressedSize(
  file: File,
  settings: CompressionSettings,
  signal?: AbortSignal
): Promise<{ estimatedSize: number; pageCount: number }> {
  const arrayBuffer = await file.arrayBuffer();
  if (signal?.aborted) {
    throw new DOMException('Stima annullata', 'AbortError');
  }

  if (settings.mode === 'lossless') {
    const srcPdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const pageCount = srcPdf.getPageCount();
    if (file.size <= 8 * 1024 * 1024) {
      const outPdf = await PDFDocument.create();
      const copied = await outPdf.copyPages(srcPdf, srcPdf.getPageIndices());
      copied.forEach((p) => outPdf.addPage(p));
      if (settings.stripMetadata) {
        clearMetadata(outPdf);
      }
      const bytes = await outPdf.save({
        useObjectStreams: settings.useObjectStreams,
        addDefaultPage: false,
      });
      const size = settings.keepSmallerOriginal
        ? Math.min(bytes.length, file.size)
        : bytes.length;
      return { estimatedSize: size, pageCount };
    }
    const approx = Math.round(file.size * (settings.useObjectStreams ? 0.9 : 0.98));
    return {
      estimatedSize: settings.keepSmallerOriginal ? Math.min(approx, file.size) : approx,
      pageCount,
    };
  }

  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    standardFontDataUrl: `${CDN_URL}/standard_fonts/`,
    cMapUrl: `${CDN_URL}/cmaps/`,
    cMapPacked: true,
    disableFontFace: false,
    useWorkerFetch: false,
  });

  const pdf = await loadingTask.promise;
  try {
    const pageCount = pdf.numPages;
    if (pageCount === 0) {
      return { estimatedSize: file.size, pageCount: 0 };
    }

    const sampleIndices =
      pageCount === 1
        ? [1]
        : pageCount === 2
        ? [1, 2]
        : [1, Math.ceil(pageCount / 2)];

    const MAX_CANVAS_DIM = 3200;
    const targetScale = settings.dpi / 72;
    let totalSampleBytes = 0;

    for (const pageNum of sampleIndices) {
      if (signal?.aborted) {
        throw new DOMException('Stima annullata', 'AbortError');
      }

      const page = await pdf.getPage(pageNum);
      let renderViewport = page.getViewport({ scale: targetScale });

      if (renderViewport.width > MAX_CANVAS_DIM || renderViewport.height > MAX_CANVAS_DIM) {
        const clampFactor = Math.min(
          MAX_CANVAS_DIM / renderViewport.width,
          MAX_CANVAS_DIM / renderViewport.height
        );
        renderViewport = page.getViewport({ scale: targetScale * clampFactor });
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(renderViewport.width));
      canvas.height = Math.max(1, Math.round(renderViewport.height));

      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (settings.grayscale) {
        ctx.filter = 'grayscale(100%)';
      }

      await page.render({
        canvasContext: ctx,
        viewport: renderViewport,
      }).promise;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', settings.quality)
      );

      canvas.width = 0;
      canvas.height = 0;

      if (blob) {
        totalSampleBytes += blob.size;
      }
    }

    const avgPageBytes = totalSampleBytes / sampleIndices.length;
    // Account for PDF xref/page dictionary overhead (~800 B/page + 2 KB base)
    const rawEstimate = Math.round(avgPageBytes * pageCount + pageCount * 800 + 2048);
    const estimatedSize = settings.keepSmallerOriginal
      ? Math.min(rawEstimate, file.size)
      : rawEstimate;

    return { estimatedSize, pageCount };
  } finally {
    await pdf.destroy();
  }
}

export function getCompressedFilename(originalName: string): string {
  const baseName = originalName.replace(/\.pdf$/i, '');
  return `${baseName}_compresso.pdf`;
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string): void {
  const safeFilename = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  saveAs(blob, safeFilename);
}

export async function downloadCompressedZip(
  items: { filename: string; bytes: Uint8Array }[],
  zipFilename = 'pdf_compressi.zip'
): Promise<void> {
  const zip = new JSZip();
  const usedNames = new Set<string>();

  items.forEach((item) => {
    let name = item.filename;
    if (usedNames.has(name)) {
      const base = name.replace(/\.pdf$/i, '');
      let counter = 2;
      while (usedNames.has(`${base}_${counter}.pdf`)) {
        counter++;
      }
      name = `${base}_${counter}.pdf`;
    }
    usedNames.add(name);
    zip.file(name, item.bytes);
  });

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveAs(zipBlob, zipFilename);
}
