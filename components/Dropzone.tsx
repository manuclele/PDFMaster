import React, { useRef, useState, useCallback } from 'react';
import { UploadCloud, FileUp } from 'lucide-react';

interface DropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFilesSelected, disabled }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const validFiles = Array.from(e.dataTransfer.files).filter(
        (file: File) => file.type === 'application/pdf'
      );
      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    }
  }, [onFilesSelected, disabled]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const validFiles = Array.from(e.target.files);
      onFilesSelected(validFiles);
    }
  };

  const handleZoneClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleZoneClick}
      className={`
        relative group cursor-pointer transition-all duration-300 ease-in-out
        border-2 border-dashed rounded-2xl p-12 text-center
        ${isDragOver 
          ? 'border-primary-500 bg-primary-50 shadow-xl scale-[1.01]' 
          : 'border-slate-300 bg-white hover:border-primary-400 hover:bg-slate-50 shadow-sm'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
      `}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInput}
        className="hidden"
        multiple
        accept=".pdf"
      />
      
      <div className="flex flex-col items-center justify-center space-y-4">
        <div className={`
          p-4 rounded-full transition-colors duration-300
          ${isDragOver ? 'bg-primary-100 text-primary-600' : 'bg-slate-100 text-slate-500 group-hover:text-primary-500 group-hover:bg-primary-50'}
        `}>
          {isDragOver ? <FileUp size={40} /> : <UploadCloud size={40} />}
        </div>
        
        <div className="space-y-1">
          <p className="text-lg font-semibold text-slate-700">
            {isDragOver ? 'Drop files now' : 'Click to upload or drag and drop'}
          </p>
          <p className="text-sm text-slate-500">
            PDF documents only. Multiple files allowed.
          </p>
        </div>
      </div>
    </div>
  );
};