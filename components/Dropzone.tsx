import React, { useRef, useState, useCallback } from 'react';
import { UploadCloud, FileUp } from 'lucide-react';

interface DropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  pdfOnly?: boolean;
  title?: string;
  subtitle?: string;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  onFilesSelected,
  disabled,
  pdfOnly = false,
  title,
  subtitle,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isFileValid = useCallback(
    (file: File) => {
      if (pdfOnly) {
        return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      }
      return file.type === 'application/pdf' || file.type.startsWith('image/');
    },
    [pdfOnly]
  );

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
      const validFiles = Array.from(e.dataTransfer.files).filter(isFileValid);
      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    }
  }, [onFilesSelected, disabled, isFileValid]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const validFiles = Array.from(e.target.files).filter(isFileValid);
      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
      e.target.value = '';
    }
  };

  const handleZoneClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const defaultTitle = title || 'Click to upload or drag and drop';
  const defaultSubtitle =
    subtitle ||
    (pdfOnly
      ? 'Solo file PDF. Puoi caricare uno o più documenti contemporaneamente.'
      : 'PDF and common image formats (JPG, PNG). Multiple files allowed.');

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleZoneClick}
      className={`
        relative group cursor-pointer transition-all duration-200 ease-out
        border-2 border-dashed rounded-2xl p-10 text-center
        ${isDragOver 
          ? 'border-primary-500 bg-primary-50 shadow-sm' 
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
        accept={pdfOnly ? '.pdf,application/pdf' : '.pdf,image/*'}
      />
      
      <div className="flex flex-col items-center justify-center space-y-4">
        <div className={`
          p-4 rounded-full transition-colors duration-200
          ${isDragOver ? 'bg-primary-100 text-primary-600' : 'bg-slate-100 text-slate-500 group-hover:text-primary-500 group-hover:bg-primary-50'}
        `}>
          {isDragOver ? <FileUp size={36} /> : <UploadCloud size={36} />}
        </div>
        
        <div className="space-y-1">
          <p className="text-lg font-semibold text-slate-700">
            {isDragOver ? 'Rilascia i file qui' : defaultTitle}
          </p>
          <p className="text-sm text-slate-500">
            {defaultSubtitle}
          </p>
        </div>
      </div>
    </div>
  );
};