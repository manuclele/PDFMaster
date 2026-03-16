import React, { useState, useCallback } from 'react';
import { UploadedFile, ProcessingState, ViewMode } from './types';
import { mergePdfs, createPdfBlob } from './utils/pdfHandler';
import { Dropzone } from './components/Dropzone';
import { FileGrid } from './components/FileGrid';
import { PerspectiveEditor } from './components/PerspectiveEditor';
import { SplitView } from './components/SplitView';
import { warpPerspective } from './utils/perspectiveUtils';
import { Point } from './types';
import { Layers, FileStack, ArrowRight, Download, RefreshCw, AlertCircle, Edit3 } from 'lucide-react';

const App: React.FC = () => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('merge');
  const [outputFilename, setOutputFilename] = useState<string>('merged-document');
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingState>({
    isProcessing: false,
    message: '',
    error: null,
  });

  const handleFilesSelected = (newFiles: File[]) => {
    const uploadedFiles: UploadedFile[] = newFiles.map((file) => {
      const type = file.type === 'application/pdf' ? 'pdf' : 'image';
      return {
        id: crypto.randomUUID(),
        file,
        type,
        preview: type === 'image' ? URL.createObjectURL(file) : undefined,
      };
    });
    setFiles((prev) => [...prev, ...uploadedFiles]);
    setStatus({ ...status, error: null });
  };

  const handleRemove = (id: string) => {
    setFiles((prev) => {
      const fileToRemove = prev.find(f => f.id === id);
      if (fileToRemove?.preview) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleEdit = (id: string) => {
    setEditingFileId(id);
  };

  const handleSaveEdit = async (corners: { tl: Point; tr: Point; br: Point; bl: Point }, rotation: number = 0) => {
    if (!editingFileId) return;

    const fileToEdit = files.find(f => f.id === editingFileId);
    if (!fileToEdit || !fileToEdit.preview) return;

    try {
      setStatus({ ...status, isProcessing: true, message: 'Correcting perspective...' });
      
      const img = new Image();
      img.src = fileToEdit.preview;
      await new Promise((resolve) => (img.onload = resolve));

      // If there's rotation, we need to rotate the image first or adjust points
      // Let's rotate the image on a canvas first if rotation != 0
      let sourceImg: HTMLImageElement | HTMLCanvasElement = img;
      if (rotation !== 0) {
        const canvas = document.createElement('canvas');
        const isRotated = rotation % 180 !== 0;
        canvas.width = isRotated ? img.naturalHeight : img.naturalWidth;
        canvas.height = isRotated ? img.naturalWidth : img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
          sourceImg = canvas;
        }
      }

      const imgW = sourceImg instanceof HTMLCanvasElement ? sourceImg.width : sourceImg.naturalWidth;
      const imgH = sourceImg instanceof HTMLCanvasElement ? sourceImg.height : sourceImg.naturalHeight;

      const pixelCorners = {
        tl: { x: corners.tl.x * imgW, y: corners.tl.y * imgH },
        tr: { x: corners.tr.x * imgW, y: corners.tr.y * imgH },
        br: { x: corners.br.x * imgW, y: corners.br.y * imgH },
        bl: { x: corners.bl.x * imgW, y: corners.bl.y * imgH },
      };

      // Calculate destination dimensions
      const widthTop = Math.sqrt((pixelCorners.tr.x - pixelCorners.tl.x) ** 2 + (pixelCorners.tr.y - pixelCorners.tl.y) ** 2);
      const widthBottom = Math.sqrt((pixelCorners.br.x - pixelCorners.bl.x) ** 2 + (pixelCorners.br.y - pixelCorners.bl.y) ** 2);
      const heightLeft = Math.sqrt((pixelCorners.bl.x - pixelCorners.tl.x) ** 2 + (pixelCorners.bl.y - pixelCorners.tl.y) ** 2);
      const heightRight = Math.sqrt((pixelCorners.br.x - pixelCorners.tr.x) ** 2 + (pixelCorners.br.y - pixelCorners.tr.y) ** 2);
      
      const destWidth = Math.max(widthTop, widthBottom);
      const destHeight = Math.max(heightLeft, heightRight);

      const srcPoints = [pixelCorners.tl, pixelCorners.tr, pixelCorners.br, pixelCorners.bl];
      
      // Check if corners are basically at the edges (within 1% tolerance)
      // If so, we can skip the expensive warp and just use the rotated image
      const isFullImage = 
        corners.tl.x < 0.01 && corners.tl.y < 0.01 &&
        corners.tr.x > 0.99 && corners.tr.y < 0.01 &&
        corners.br.x > 0.99 && corners.br.y > 0.99 &&
        corners.bl.x < 0.01 && corners.bl.y > 0.99;

      let warpedBlob: Blob | null;
      
      if (isFullImage) {
        // Just convert the rotated canvas to blob
        warpedBlob = await new Promise((resolve) => {
          if (sourceImg instanceof HTMLCanvasElement) {
            sourceImg.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
          } else {
            // Should not happen if rotation != 0, but for safety:
            const canvas = document.createElement('canvas');
            canvas.width = sourceImg.naturalWidth;
            canvas.height = sourceImg.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(sourceImg, 0, 0);
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
          }
        });
      } else {
        // We need an HTMLImageElement for warpPerspective
        let finalSource: HTMLImageElement;
        if (sourceImg instanceof HTMLCanvasElement) {
          finalSource = new Image();
          finalSource.src = sourceImg.toDataURL('image/jpeg');
          await new Promise(resolve => finalSource.onload = resolve);
        } else {
          finalSource = sourceImg;
        }
        warpedBlob = await warpPerspective(finalSource, srcPoints, destWidth, destHeight);
      }
      
      if (warpedBlob) {
        const newFile = new File([warpedBlob], fileToEdit.file.name, { type: 'image/jpeg' });
        const newPreview = URL.createObjectURL(newFile);

        setFiles(prev => prev.map(f => {
          if (f.id === editingFileId) {
            if (f.preview) URL.revokeObjectURL(f.preview);
            return {
              ...f,
              file: newFile,
              preview: newPreview,
              corners
            };
          }
          return f;
        }));
      }
    } catch (err) {
      console.error('Error saving edit:', err);
    } finally {
      setEditingFileId(null);
      setStatus({ ...status, isProcessing: false, message: '' });
    }
  };

  const handleMove = (index: number, direction: 'left' | 'right') => {
    const newFiles = [...files];
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    
    if (targetIndex >= 0 && targetIndex < newFiles.length) {
      [newFiles[index], newFiles[targetIndex]] = [newFiles[targetIndex], newFiles[index]];
      setFiles(newFiles);
    }
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      setStatus({ ...status, error: 'Please select at least 2 PDF files to merge.' });
      return;
    }

    try {
      setStatus({ isProcessing: true, message: 'Merging your documents...', error: null });
      
      // Artificial delay for better UX (so the user sees the processing state)
      await new Promise(resolve => setTimeout(resolve, 800));

      const mergedBytes = await mergePdfs(files);
      const url = createPdfBlob(mergedBytes);
      
      // Determine filename
      const safeName = outputFilename.trim() || 'merged-document';
      const fileName = safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`;

      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setStatus({ isProcessing: false, message: '', error: null });
    } catch (err) {
      console.error(err);
      setStatus({ 
        isProcessing: false, 
        message: '', 
        error: 'An error occurred while processing your PDF. Please try again.' 
      });
    }
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to clear all files?')) {
      files.forEach(f => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
      setFiles([]);
      setOutputFilename('merged-document');
      setStatus({ isProcessing: false, message: '', error: null });
    }
  };

  const editingFile = files.find(f => f.id === editingFileId);

  return (
    <div className="min-h-screen pb-20">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-primary-600 p-2 rounded-lg text-white">
              <Layers size={20} />
            </div>
            <span className="text-xl font-bold text-slate-800 tracking-tight">PDF Master</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setViewMode('merge')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  viewMode === 'merge' 
                    ? 'bg-white text-primary-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Merge
              </button>
              <button
                onClick={() => setViewMode('split')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  viewMode === 'split' 
                    ? 'bg-white text-primary-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Split
              </button>
            </div>
            
            {files.length > 0 && viewMode === 'merge' && (
              <button
                onClick={handleReset}
                className="hidden sm:flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-100"
              >
                <RefreshCw size={16} />
                <span>New Merge</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        {/* Header Section */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-4">
            {viewMode === 'merge' ? 'Merge PDF Files' : 'AI Smart Split'}
          </h1>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto">
            {viewMode === 'merge' 
              ? 'Combine multiple PDFs into one unified document. Drag and drop your files, reorder them, and click merge. Secure and client-side.'
              : 'Upload a large PDF (like tax returns for multiple employees) and let AI automatically split and name them for you.'}
          </p>
        </div>

        {/* Action Area */}
        <div className="max-w-4xl mx-auto">
          {viewMode === 'merge' ? (
            <>
              <Dropzone 
                onFilesSelected={handleFilesSelected} 
                disabled={status.isProcessing}
              />
              
              {status.error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-center text-red-600">
                  <AlertCircle size={20} className="mr-2" />
                  {status.error}
                </div>
              )}

              <FileGrid 
                files={files} 
                onRemove={handleRemove} 
                onMove={handleMove} 
                onEdit={handleEdit}
              />

              {/* Floating Action Bar */}
              {files.length > 0 && (
                <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-white/80 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl p-2 flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-3 z-40">
                  
                  <div className="flex items-center space-x-3 w-full sm:w-auto justify-between sm:justify-start px-2">
                    <div className="text-sm font-medium text-slate-600 pr-2 border-r border-slate-200">
                      {files.length} file{files.length !== 1 ? 's' : ''}
                    </div>
                    
                    <button
                      onClick={handleReset}
                      disabled={status.isProcessing}
                      className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                      title="Clear all"
                    >
                      <RefreshCw size={20} />
                    </button>
                  </div>

                  {/* Filename Input */}
                  <div className="flex items-center bg-slate-50 rounded-xl px-3 py-2 border border-slate-200 focus-within:ring-2 focus-within:ring-primary-100 focus-within:border-primary-400 transition-all w-full sm:w-auto">
                    <Edit3 size={14} className="text-slate-400 mr-2 flex-shrink-0" />
                    <input
                      type="text"
                      value={outputFilename}
                      onChange={(e) => setOutputFilename(e.target.value)}
                      disabled={status.isProcessing}
                      className="bg-transparent border-none outline-none text-sm text-slate-700 w-full sm:w-32 placeholder-slate-400"
                      placeholder="Filename"
                    />
                    <span className="text-slate-400 text-sm font-medium select-none pl-1">.pdf</span>
                  </div>

                  <button
                    onClick={handleMerge}
                    disabled={status.isProcessing || files.length < 2}
                    className={`
                      w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl font-semibold text-white shadow-lg shadow-primary-500/30 transition-all transform active:scale-95
                      ${status.isProcessing || files.length < 2
                        ? 'bg-slate-300 cursor-not-allowed shadow-none'
                        : 'bg-primary-600 hover:bg-primary-700'
                      }
                    `}
                  >
                    {status.isProcessing ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <FileStack size={18} />
                        <span>Merge PDF</span>
                        <ArrowRight size={18} className="opacity-70" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <SplitView />
          )}
        </div>
      </main>

      {/* Perspective Editor Modal */}
      {editingFile && editingFile.preview && (
        <PerspectiveEditor
          imageSrc={editingFile.preview}
          onSave={handleSaveEdit}
          onCancel={() => setEditingFileId(null)}
        />
      )}
    </div>
  );
};

export default App;
