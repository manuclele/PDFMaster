import React, { useState } from 'react';
import { UploadedFile, ProcessingState, ViewMode } from './types';
import { mergePdfs, createPdfBlob } from './utils/pdfHandler';
import { Dropzone } from './components/Dropzone';
import { FileGrid } from './components/FileGrid';
import { Layers, FileStack, ArrowRight, Download, RefreshCw, AlertCircle } from 'lucide-react';

const App: React.FC = () => {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('merge');
  const [status, setStatus] = useState<ProcessingState>({
    isProcessing: false,
    message: '',
    error: null,
  });

  const handleFilesSelected = (newFiles: File[]) => {
    const uploadedFiles: UploadedFile[] = newFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
    }));
    setFiles((prev) => [...prev, ...uploadedFiles]);
    setStatus({ ...status, error: null });
  };

  const handleRemove = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
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
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = `merged_${new Date().toISOString().slice(0, 10)}.pdf`;
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
      setFiles([]);
      setStatus({ isProcessing: false, message: '', error: null });
    }
  };

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
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        {/* Header Section */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-4">
            {viewMode === 'merge' ? 'Merge PDF Files' : 'Split PDF Files'}
          </h1>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto">
            {viewMode === 'merge' 
              ? 'Combine multiple PDFs into one unified document. Drag and drop your files, reorder them, and click merge. Secure and client-side.'
              : 'Coming soon. Quickly extract pages from your PDF documents.'}
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
              />

              {/* Floating Action Bar */}
              {files.length > 0 && (
                <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-white/80 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl p-2 flex items-center space-x-3 z-40">
                  <div className="pl-4 pr-2 text-sm font-medium text-slate-600 border-r border-slate-200">
                    {files.length} file{files.length !== 1 ? 's' : ''} selected
                  </div>
                  
                  <button
                    onClick={handleReset}
                    disabled={status.isProcessing}
                    className="p-2.5 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                    title="Clear all"
                  >
                    <RefreshCw size={20} />
                  </button>

                  <button
                    onClick={handleMerge}
                    disabled={status.isProcessing || files.length < 2}
                    className={`
                      flex items-center space-x-2 px-6 py-2.5 rounded-xl font-semibold text-white shadow-lg shadow-primary-500/30 transition-all transform active:scale-95
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
            <div className="text-center py-20 bg-white border border-dashed border-slate-200 rounded-2xl">
              <Download size={48} className="mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-600">Split Feature Coming Soon</h3>
              <p className="text-slate-400 mt-2">We are currently working on this feature.</p>
              <button 
                onClick={() => setViewMode('merge')}
                className="mt-6 text-primary-600 font-medium hover:underline"
              >
                Go back to Merge
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
