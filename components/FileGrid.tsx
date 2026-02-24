import React from 'react';
import { UploadedFile } from '../types';
import { formatFileSize } from '../utils/formatters';
import { FileText, X, ArrowLeft, ArrowRight, Image as ImageIcon, Edit2 } from 'lucide-react';

interface FileGridProps {
  files: UploadedFile[];
  onRemove: (id: string) => void;
  onMove: (index: number, direction: 'left' | 'right') => void;
  onEdit: (id: string) => void;
}

export const FileGrid: React.FC<FileGridProps> = ({ files, onRemove, onMove, onEdit }) => {
  if (files.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-8">
      {files.map((file, index) => (
        <div 
          key={file.id}
          className="relative bg-white p-4 rounded-xl shadow-md border border-slate-100 group hover:shadow-lg transition-all duration-200 flex flex-col"
        >
          {/* Header with Icon and Remove */}
          <div className="flex justify-between items-start mb-3">
            <div className={`p-2 rounded-lg ${file.type === 'pdf' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
              {file.type === 'pdf' ? <FileText size={24} /> : <ImageIcon size={24} />}
            </div>
            <div className="flex space-x-1">
              {file.type === 'image' && (
                <button
                  onClick={() => onEdit(file.id)}
                  className="text-slate-400 hover:text-primary-600 hover:bg-primary-50 p-1 rounded-full transition-colors"
                  aria-label="Edit image"
                >
                  <Edit2 size={18} />
                </button>
              )}
              <button
                onClick={() => onRemove(file.id)}
                className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-full transition-colors"
                aria-label="Remove file"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Preview for images */}
          {file.type === 'image' && file.preview && (
            <div className="mb-3 rounded-lg overflow-hidden bg-slate-100 aspect-video relative">
              <img 
                src={file.preview} 
                alt={file.file.name} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          )}

          {/* File Info */}
          <div className="mb-4 flex-1">
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
