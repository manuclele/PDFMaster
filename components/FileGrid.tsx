import React from 'react';
import { UploadedFile } from '../types';
import { formatFileSize } from '../utils/formatters';
import { FileText, X, ArrowLeft, ArrowRight } from 'lucide-react';

interface FileGridProps {
  files: UploadedFile[];
  onRemove: (id: string) => void;
  onMove: (index: number, direction: 'left' | 'right') => void;
}

export const FileGrid: React.FC<FileGridProps> = ({ files, onRemove, onMove }) => {
  if (files.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-8">
      {files.map((file, index) => (
        <div 
          key={file.id}
          className="relative bg-white p-4 rounded-xl shadow-md border border-slate-100 group hover:shadow-lg transition-all duration-200"
        >
          {/* Header with Icon and Remove */}
          <div className="flex justify-between items-start mb-3">
            <div className="p-2 bg-red-50 text-red-500 rounded-lg">
              <FileText size={24} />
            </div>
            <button
              onClick={() => onRemove(file.id)}
              className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-full transition-colors"
              aria-label="Remove file"
            >
              <X size={18} />
            </button>
          </div>

          {/* File Info */}
          <div className="mb-4">
            <h3 className="font-medium text-slate-800 truncate" title={file.file.name}>
              {file.file.name}
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-1">
              {formatFileSize(file.file.size)}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-xs font-semibold text-slate-300 bg-slate-50 px-2 py-1 rounded">
              #{index + 1}
            </span>
            <div className="flex space-x-1">
              <button
                onClick={() => onMove(index, 'left')}
                disabled={index === 0}
                className={`p-1.5 rounded-md transition-colors ${
                  index === 0 
                    ? 'text-slate-200 cursor-not-allowed' 
                    : 'text-slate-500 hover:bg-slate-100 hover:text-primary-600'
                }`}
              >
                <ArrowLeft size={16} />
              </button>
              <button
                onClick={() => onMove(index, 'right')}
                disabled={index === files.length - 1}
                className={`p-1.5 rounded-md transition-colors ${
                  index === files.length - 1
                    ? 'text-slate-200 cursor-not-allowed' 
                    : 'text-slate-500 hover:bg-slate-100 hover:text-primary-600'
                }`}
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
