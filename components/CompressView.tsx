import React, { useState, useRef, useEffect } from 'react';
import { CompressFileItem, CompressionPreset, CompressionSettings } from '../types';
import { Dropzone } from './Dropzone';
import { formatFileSize } from '../utils/formatters';
import {
  COMPRESSION_PRESETS,
  getPdfPageCount,
  compressSinglePdf,
  compressAndMergePdfs,
  estimatePdfCompressedSize,
  getCompressedFilename,
  downloadPdfBytes,
  downloadCompressedZip,
} from '../utils/pdfCompressor';
import {
  FileText,
  Trash2,
  Download,
  Archive,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  Square,
  Minimize2,
  Layers,
} from 'lucide-react';

const DEFAULT_SETTINGS: CompressionSettings = {
  preset: 'balanced',
  ...COMPRESSION_PRESETS.balanced.settings,
};

const DPI_OPTIONS: { value: 72 | 110 | 150 | 200; label: string; hint: string }[] = [
  { value: 72, label: '72 DPI', hint: 'Web' },
  { value: 110, label: '110 DPI', hint: 'Schermo' },
  { value: 150, label: '150 DPI', hint: 'Standard' },
  { value: 200, label: '200 DPI', hint: 'Stampa' },
];

export const CompressView: React.FC = () => {
  const [items, setItems] = useState<CompressFileItem[]>([]);
  const [settings, setSettings] = useState<CompressionSettings>(DEFAULT_SETTINGS);
  const [mergeFiles, setMergeFiles] = useState<boolean>(false);
  const [mergedFilename, setMergedFilename] = useState<string>('documenti-compressi');
  const [mergedResult, setMergedResult] = useState<{
    bytes: Uint8Array;
    originalTotalSize: number;
    filename: string;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isEstimating, setIsEstimating] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const addInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const itemIdsKey = items.map((i) => i.id).join(',');

  // Live size estimation when files or compression settings change
  useEffect(() => {
    if (items.length === 0 || isProcessing) {
      setIsEstimating(false);
      return;
    }

    const controller = new AbortController();
    setIsEstimating(true);

    const timer = setTimeout(async () => {
      try {
        for (const item of items) {
          if (controller.signal.aborted) return;
          try {
            const { estimatedSize, pageCount } = await estimatePdfCompressedSize(
              item.file,
              settings,
              controller.signal
            );
            if (controller.signal.aborted) return;
            setItems((prev) =>
              prev.map((curr) =>
                curr.id === item.id
                  ? {
                      ...curr,
                      estimatedSize,
                      pageCount: curr.pageCount ?? pageCount,
                    }
                  : curr
              )
            );
          } catch (err: any) {
            if (err?.name === 'AbortError') return;
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsEstimating(false);
        }
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [itemIdsKey, settings, isProcessing]);

  const handleFilesSelected = async (newFiles: File[]) => {
    const pdfFiles = newFiles.filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );

    if (pdfFiles.length === 0) {
      setError('Seleziona almeno un file PDF valido.');
      return;
    }

    setError(null);
    setMergedResult(null);

    const newItems: CompressFileItem[] = pdfFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      pageCount: null,
      status: 'idle',
      progress: 0,
    }));

    setItems((prev) => [...prev, ...newItems]);

    // Populate page counts asynchronously
    newItems.forEach(async (item) => {
      try {
        const count = await getPdfPageCount(item.file);
        setItems((prev) =>
          prev.map((curr) => (curr.id === item.id ? { ...curr, pageCount: count } : curr))
        );
      } catch {
        setItems((prev) =>
          prev.map((curr) => (curr.id === item.id ? { ...curr, pageCount: 0 } : curr))
        );
      }
    });
  };

  const resetCompressionResults = () => {
    setMergedResult(null);
    setStatusMessage('');
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        status: 'idle',
        progress: 0,
        compressedBytes: undefined,
        compressedSize: undefined,
        usedOriginalFallback: undefined,
        error: undefined,
      }))
    );
  };

  const applyPreset = (presetKey: Exclude<CompressionPreset, 'custom'>) => {
    resetCompressionResults();
    setSettings({
      preset: presetKey,
      ...COMPRESSION_PRESETS[presetKey].settings,
    });
  };

  const updateCustomSetting = <K extends keyof CompressionSettings>(
    key: K,
    value: CompressionSettings[K]
  ) => {
    resetCompressionResults();
    setSettings((prev) => ({
      ...prev,
      preset: 'custom',
      [key]: value,
    }));
  };

  const removeItem = (id: string) => {
    if (isProcessing) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
    setMergedResult(null);
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    if (isProcessing) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setMergedResult(null);
  };

  const resetAll = () => {
    if (isProcessing) return;
    setItems([]);
    setMergedResult(null);
    setStatusMessage('');
    setError(null);
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleCompress = async () => {
    if (items.length === 0 || isProcessing) return;

    setIsProcessing(true);
    setError(null);
    setMergedResult(null);
    setStatusMessage(
      mergeFiles
        ? `Compressione e unione di ${items.length} PDF in corso...`
        : `Compressione di ${items.length} ${items.length === 1 ? 'file' : 'file'} in corso...`
    );

    // Reset item states
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        status: 'idle',
        progress: 0,
        compressedBytes: undefined,
        compressedSize: undefined,
        usedOriginalFallback: undefined,
        error: undefined,
      }))
    );

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      if (mergeFiles) {
        const filesToMerge = items.map((i) => i.file);
        const originalTotalSize = filesToMerge.reduce((acc, f) => acc + f.size, 0);

        const mergedBytes = await compressAndMergePdfs(
          filesToMerge,
          settings,
          (fileIndex, pageProgress) => {
            setStatusMessage(
              `Compressione file ${fileIndex + 1} di ${filesToMerge.length} (${pageProgress}%)...`
            );
            setItems((prev) =>
              prev.map((item, idx) => {
                if (idx < fileIndex) return { ...item, status: 'done', progress: 100 };
                if (idx === fileIndex)
                  return { ...item, status: 'processing', progress: pageProgress };
                return item;
              })
            );
          },
          controller.signal
        );

        setItems((prev) =>
          prev.map((item) => ({ ...item, status: 'done', progress: 100 }))
        );

        const safeName = mergedFilename.trim() || 'documenti-compressi';
        const finalFilename = safeName.toLowerCase().endsWith('.pdf')
          ? safeName
          : `${safeName}.pdf`;

        setMergedResult({
          bytes: mergedBytes,
          originalTotalSize,
          filename: finalFilename,
        });

        downloadPdfBytes(mergedBytes, finalFilename);
        setStatusMessage(
          `Compressione e unione completate! Dimensione finale: ${formatFileSize(mergedBytes.length)}`
        );
      } else {
        const completedResults: { filename: string; bytes: Uint8Array }[] = [];

        for (let idx = 0; idx < items.length; idx++) {
          if (controller.signal.aborted) {
            throw new DOMException('Operazione annullata', 'AbortError');
          }

          const current = items[idx];
          setStatusMessage(
            `Compressione di "${current.file.name}" (${idx + 1}/${items.length})...`
          );

          setItems((prev) =>
            prev.map((item) =>
              item.id === current.id ? { ...item, status: 'processing', progress: 5 } : item
            )
          );

          try {
            const { bytes, usedOriginalFallback } = await compressSinglePdf(
              current.file,
              settings,
              (progress) => {
                setItems((prev) =>
                  prev.map((item) =>
                    item.id === current.id ? { ...item, progress } : item
                  )
                );
              },
              controller.signal
            );

            setItems((prev) =>
              prev.map((item) =>
                item.id === current.id
                  ? {
                      ...item,
                      status: 'done',
                      progress: 100,
                      compressedBytes: bytes,
                      compressedSize: bytes.length,
                      usedOriginalFallback,
                    }
                  : item
              )
            );

            completedResults.push({
              filename: getCompressedFilename(current.file.name),
              bytes,
            });
          } catch (fileErr: any) {
            if (fileErr?.name === 'AbortError') {
              throw fileErr;
            }
            setItems((prev) =>
              prev.map((item) =>
                item.id === current.id
                  ? {
                      ...item,
                      status: 'error',
                      error: fileErr?.message || 'Errore durante la compressione',
                    }
                  : item
              )
            );
          }
        }

        if (completedResults.length === 1) {
          downloadPdfBytes(completedResults[0].bytes, completedResults[0].filename);
          setStatusMessage('Compressione completata! Download avviato.');
        } else if (completedResults.length > 1) {
          await downloadCompressedZip(completedResults, 'pdf_compressi.zip');
          setStatusMessage(
            `Compressione di ${completedResults.length} PDF completata! Archivio ZIP scaricato.`
          );
        } else {
          setError('Nessun file è stato compresso correttamente.');
          setStatusMessage('');
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setError('Compressione interrotta dall\'utente.');
        setStatusMessage('');
      } else {
        console.error('Compression error:', err);
        setError(err?.message || 'Errore imprevisto durante la compressione.');
        setStatusMessage('');
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const completedItems = items.filter(
    (item) => item.status === 'done' && item.compressedBytes
  );
  const totalOriginalBytes = items.reduce((acc, item) => acc + item.file.size, 0);
  const allEstimated = items.length > 0 && items.every((item) => item.estimatedSize !== undefined);
  const totalEstimatedBytes = allEstimated
    ? items.reduce((acc, item) => acc + (item.estimatedSize ?? item.file.size), 0)
    : null;
  const totalCompressedBytes = completedItems.reduce(
    (acc, item) => acc + (item.compressedSize ?? item.file.size),
    0
  );
  const hasFinalBatchSizes =
    !mergeFiles && completedItems.length === items.length && items.length > 0;
  const activeAfterBytes = mergeFiles && mergedResult
    ? mergedResult.bytes.length
    : hasFinalBatchSizes
    ? totalCompressedBytes
    : totalEstimatedBytes;
  const activeSavedPct =
    totalOriginalBytes > 0 && activeAfterBytes !== null
      ? Math.round(((totalOriginalBytes - activeAfterBytes) / totalOriginalBytes) * 100)
      : null;

  const handleDownloadAllZip = async () => {
    if (completedItems.length === 0) return;
    await downloadCompressedZip(
      completedItems.map((item) => ({
        filename: getCompressedFilename(item.file.name),
        bytes: item.compressedBytes!,
      })),
      'pdf_compressi.zip'
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Error / Status Banner */}
      {(error || statusMessage) && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
            error
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {error ? (
              <AlertCircle size={18} className="shrink-0" />
            ) : isProcessing ? (
              <RefreshCw size={18} className="shrink-0 animate-spin" />
            ) : (
              <CheckCircle2 size={18} className="shrink-0" />
            )}
            <span className="text-sm font-medium truncate">
              {error || statusMessage}
            </span>
          </div>
          {isProcessing && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Square size={12} fill="currentColor" />
              <span>Interrompi</span>
            </button>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <Dropzone
          onFilesSelected={handleFilesSelected}
          disabled={isProcessing}
          pdfOnly
          title="Carica uno o più file PDF da comprimere"
          subtitle="Trascina qui i tuoi PDF o clicca per selezionarli. Supporta compressione multipla simultanea."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: File Queue & Results */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  File caricati ({items.length})
                </h2>
                <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                  Prima: {formatFileSize(totalOriginalBytes)}
                  {activeAfterBytes !== null && (
                    <>
                      {' → '}
                      {hasFinalBatchSizes || (mergeFiles && mergedResult)
                        ? `Dopo: ${formatFileSize(activeAfterBytes)}`
                        : `Dopo (stima): ~${formatFileSize(activeAfterBytes)}`}
                      {activeSavedPct !== null && (
                        <span className={activeSavedPct > 0 ? ' text-emerald-700 font-semibold' : ''}>
                          {' '}
                          ({activeSavedPct > 0 ? `-${activeSavedPct}%` : activeSavedPct === 0 ? 'invariato' : `+${Math.abs(activeSavedPct)}%`})
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <input
                  ref={addInputRef}
                  type="file"
                  multiple
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFilesSelected(Array.from(e.target.files));
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  onClick={() => addInputRef.current?.click()}
                  disabled={isProcessing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Plus size={14} />
                  <span>Aggiungi PDF</span>
                </button>
                <button
                  onClick={resetAll}
                  disabled={isProcessing}
                  className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  Svuota
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {items.map((item, index) => {
                const actualSavedPct =
                  item.compressedSize !== undefined && item.file.size > 0
                    ? Math.round(
                        ((item.file.size - item.compressedSize) / item.file.size) * 100
                      )
                    : null;
                const estSavedPct =
                  item.estimatedSize !== undefined && item.file.size > 0
                    ? Math.round(
                        ((item.file.size - item.estimatedSize) / item.file.size) * 100
                      )
                    : null;

                return (
                  <div
                    key={item.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-sm font-semibold text-slate-800 truncate"
                          title={item.file.name}
                        >
                          {item.file.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 tabular-nums mt-0.5">
                          <span>Prima: {formatFileSize(item.file.size)}</span>
                          {item.pageCount !== null && item.pageCount > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                {item.pageCount}{' '}
                                {item.pageCount === 1 ? 'pagina' : 'pagine'}
                              </span>
                            </>
                          )}
                          {item.status === 'processing' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-primary-600 font-medium">
                                Compressione {item.progress}%
                              </span>
                            </>
                          )}
                          {item.status === 'done' && !mergeFiles && item.compressedSize !== undefined ? (
                            <>
                              <span aria-hidden="true">→</span>
                              <span className="font-semibold text-emerald-700">
                                Dopo: {formatFileSize(item.compressedSize)}
                              </span>
                              <span className="text-emerald-700 font-medium">
                                ({actualSavedPct && actualSavedPct > 0 ? `-${actualSavedPct}%` : 'originale mantenuto'})
                              </span>
                            </>
                          ) : item.status !== 'error' && item.estimatedSize !== undefined ? (
                            <>
                              <span aria-hidden="true">→</span>
                              <span className="font-medium text-slate-700">
                                Stima dopo: ~{formatFileSize(item.estimatedSize)}
                              </span>
                              <span className={estSavedPct && estSavedPct > 0 ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                                ({estSavedPct && estSavedPct > 0 ? `-${estSavedPct}%` : estSavedPct === 0 ? 'invariato' : `+${Math.abs(estSavedPct ?? 0)}%`})
                              </span>
                            </>
                          ) : isEstimating && item.status === 'idle' ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-slate-400">Calcolo stima...</span>
                            </>
                          ) : null}
                          {item.status === 'error' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-red-600 font-medium">
                                {item.error || 'Errore'}
                              </span>
                            </>
                          )}
                        </div>

                        {item.status === 'processing' && (
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                            <div
                              className="h-full bg-primary-600 transition-all duration-150"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {mergeFiles && items.length > 1 && (
                        <>
                          <button
                            onClick={() => moveItem(index, 'up')}
                            disabled={isProcessing || index === 0}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-30 transition-colors"
                            title="Sposta su"
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            onClick={() => moveItem(index, 'down')}
                            disabled={isProcessing || index === items.length - 1}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-30 transition-colors"
                            title="Sposta giù"
                          >
                            <ArrowDown size={15} />
                          </button>
                        </>
                      )}

                      {item.status === 'done' && !mergeFiles && item.compressedBytes && (
                        <button
                          onClick={() =>
                            downloadPdfBytes(
                              item.compressedBytes!,
                              getCompressedFilename(item.file.name)
                            )
                          }
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                          title="Scarica PDF compresso"
                        >
                          <Download size={13} />
                          <span>Scarica</span>
                        </button>
                      )}

                      <button
                        onClick={() => removeItem(item.id)}
                        disabled={isProcessing}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 transition-colors"
                        title="Rimuovi file"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer actions when batch compression is complete */}
            {!mergeFiles && completedItems.length > 1 && (
              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-600 font-medium tabular-nums">
                  {completedItems.length} file pronti per il download
                </span>
                <button
                  onClick={handleDownloadAllZip}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Archive size={14} />
                  <span>Scarica tutti (.ZIP)</span>
                </button>
              </div>
            )}

            {/* Merged result summary bar */}
            {mergeFiles && mergedResult && (
              <div className="px-5 py-3.5 bg-emerald-50 border-t border-emerald-200 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-emerald-900 tabular-nums">
                  <span className="font-semibold">{mergedResult.filename}</span>
                  {' · '}
                  <span>{formatFileSize(mergedResult.originalTotalSize)}</span>
                  {' → '}
                  <span className="font-bold">{formatFileSize(mergedResult.bytes.length)}</span>
                  {mergedResult.originalTotalSize > 0 && (
                    <span>
                      {' '}
                      (
                      {Math.round(
                        ((mergedResult.originalTotalSize - mergedResult.bytes.length) /
                          mergedResult.originalTotalSize) *
                          100
                      ) > 0
                        ? `-${Math.round(
                            ((mergedResult.originalTotalSize - mergedResult.bytes.length) /
                              mergedResult.originalTotalSize) *
                              100
                          )}%`
                        : '0%'}
                      )
                    </span>
                  )}
                </div>
                <button
                  onClick={() => downloadPdfBytes(mergedResult.bytes, mergedResult.filename)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Download size={14} />
                  <span>Scarica PDF unito</span>
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Compression Settings */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={17} className="text-primary-600" />
                <h3 className="text-base font-bold text-slate-800">
                  Impostazioni Compressione
                </h3>
              </div>
              {settings.preset === 'custom' && (
                <span className="text-xs font-medium text-slate-500">
                  Personalizzata
                </span>
              )}
            </div>

            {/* Presets */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-600">
                Profilo rapido
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                {(['light', 'balanced', 'maximum'] as const).map((key) => {
                  const active = settings.preset === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={isProcessing}
                      onClick={() => applyPreset(key)}
                      className={`px-2.5 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                        active
                          ? 'bg-white text-primary-600 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {COMPRESSION_PRESETS[key].label}
                    </button>
                  );
                })}
              </div>
              {settings.preset !== 'custom' && (
                <p className="text-xs text-slate-500">
                  {COMPRESSION_PRESETS[settings.preset].description}
                </p>
              )}
            </div>

            {/* Mode Toggle */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-600">
                Metodo di ottimizzazione
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => updateCustomSetting('mode', 'raster')}
                  className={`px-2.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                    settings.mode === 'raster'
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Riduci Immagini
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => updateCustomSetting('mode', 'lossless')}
                  className={`px-2.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                    settings.mode === 'lossless'
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Solo Struttura
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {settings.mode === 'raster'
                  ? 'Ricompone le pagine comprimendo immagini e grafiche per ottenere il massimo risparmio di spazio.'
                  : 'Ottimizza la struttura interna e rimuove i metadati mantenendo intatto il testo selezionabile.'}
              </p>
            </div>

            {settings.mode === 'raster' && (
              <>
                {/* JPEG Quality Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="jpeg-quality"
                      className="text-xs font-semibold text-slate-600"
                    >
                      Qualità immagini (JPEG)
                    </label>
                    <span className="text-xs font-bold text-slate-800 tabular-nums">
                      {Math.round(settings.quality * 100)}%
                    </span>
                  </div>
                  <input
                    id="jpeg-quality"
                    type="range"
                    min={20}
                    max={95}
                    step={5}
                    disabled={isProcessing}
                    value={Math.round(settings.quality * 100)}
                    onChange={(e) =>
                      updateCustomSetting('quality', Number(e.target.value) / 100)
                    }
                    className="w-full accent-primary-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Più leggero (20%)</span>
                    <span>Più nitido (95%)</span>
                  </div>
                </div>

                {/* DPI Resolution */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-600">
                    Risoluzione pagine
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {DPI_OPTIONS.map((opt) => {
                      const active = settings.dpi === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={isProcessing}
                          onClick={() => updateCustomSetting('dpi', opt.value)}
                          className={`py-2 px-1.5 rounded-lg border text-center transition-colors ${
                            active
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <div className="text-xs font-bold tabular-nums">{opt.label}</div>
                          <div className="text-[10px] opacity-80">{opt.hint}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Toggle Checkboxes */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              {settings.mode === 'raster' && (
                <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
                  <span className="text-xs font-medium text-slate-700">
                    Converti in scala di grigi (Bianco/Nero)
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.grayscale}
                    disabled={isProcessing}
                    onChange={(e) => updateCustomSetting('grayscale', e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                </label>
              )}

              <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
                <span className="text-xs font-medium text-slate-700">
                  Rimuovi metadati (autore, titolo, date)
                </span>
                <input
                  type="checkbox"
                  checked={settings.stripMetadata}
                  disabled={isProcessing}
                  onChange={(e) =>
                    updateCustomSetting('stripMetadata', e.target.checked)
                  }
                  className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
              </label>

              {!mergeFiles && (
                <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
                  <span className="text-xs font-medium text-slate-700">
                    Mantieni originale se il compresso pesa di più
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.keepSmallerOriginal}
                    disabled={isProcessing}
                    onChange={(e) =>
                      updateCustomSetting('keepSmallerOriginal', e.target.checked)
                    }
                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                </label>
              )}
            </div>

            {/* Merge Flag */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mergeFiles}
                  disabled={isProcessing}
                  onChange={(e) => {
                    setMergeFiles(e.target.checked);
                    setMergedResult(null);
                  }}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Layers size={14} className="text-primary-600" />
                    <span>Unisci i PDF compressi in un unico file</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {mergeFiles
                      ? 'Tutti i PDF verranno compressi e uniti nell\'ordine indicato.'
                      : 'Ogni PDF verrà compresso separatamente senza unirli.'}
                  </p>
                </div>
              </label>

              {mergeFiles && (
                <div>
                  <label
                    htmlFor="merged-filename"
                    className="block text-[11px] font-semibold text-slate-600 mb-1"
                  >
                    Nome file unito
                  </label>
                  <div className="flex items-center bg-white rounded-lg px-3 py-1.5 border border-slate-200 focus-within:border-primary-500">
                    <input
                      id="merged-filename"
                      type="text"
                      value={mergedFilename}
                      disabled={isProcessing}
                      onChange={(e) => setMergedFilename(e.target.value)}
                      placeholder="documenti-compressi"
                      className="w-full text-xs text-slate-800 bg-transparent outline-none"
                    />
                    <span className="text-xs text-slate-400 pl-1 select-none">.pdf</span>
                  </div>
                </div>
              )}
            </div>

            {/* Live Before / After Size Summary */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">
                  Anteprima dimensioni
                </span>
                {isEstimating ? (
                  <span className="text-[11px] text-slate-400">Aggiornamento...</span>
                ) : activeSavedPct !== null ? (
                  <span
                    className={`text-xs font-bold tabular-nums ${
                      activeSavedPct > 0 ? 'text-emerald-700' : 'text-slate-600'
                    }`}
                  >
                    {activeSavedPct > 0
                      ? `-${activeSavedPct}%`
                      : activeSavedPct === 0
                      ? '0%'
                      : `+${Math.abs(activeSavedPct)}%`}
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="text-[11px] text-slate-500">Prima</div>
                  <div className="text-sm font-bold text-slate-800 tabular-nums">
                    {formatFileSize(totalOriginalBytes)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">
                    {hasFinalBatchSizes || (mergeFiles && mergedResult)
                      ? 'Dopo (finale)'
                      : 'Dopo (stimato)'}
                  </div>
                  <div className="text-sm font-bold text-primary-700 tabular-nums">
                    {activeAfterBytes !== null
                      ? `${hasFinalBatchSizes || (mergeFiles && mergedResult) ? '' : '~'}${formatFileSize(activeAfterBytes)}`
                      : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={handleCompress}
              disabled={isProcessing || items.length === 0}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl shadow-sm transition-colors"
            >
              {isProcessing ? (
                <>
                  <RefreshCw size={17} className="animate-spin" />
                  <span>Compressione in corso...</span>
                </>
              ) : (
                <>
                  <Minimize2 size={17} />
                  <span>
                    {mergeFiles
                      ? `Comprimi e Unisci (${items.length})`
                      : items.length > 1
                      ? `Comprimi ${items.length} PDF`
                      : 'Comprimi PDF'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
