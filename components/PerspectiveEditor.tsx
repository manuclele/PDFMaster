import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, RotateCw, Maximize2, ScanLine } from 'lucide-react';
import { Point } from '../types';

interface PerspectiveEditorProps {
  imageSrc: string;
  onSave: (corners: { tl: Point; tr: Point; br: Point; bl: Point }) => void;
  onCancel: () => void;
}

export const PerspectiveEditor: React.FC<PerspectiveEditorProps> = ({
  imageSrc,
  onSave,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0, left: 0, top: 0 });
  
  // Corners in relative coordinates (0 to 1)
  const [corners, setCorners] = useState({
    tl: { x: 0.1, y: 0.1 },
    tr: { x: 0.9, y: 0.1 },
    br: { x: 0.9, y: 0.9 },
    bl: { x: 0.1, y: 0.9 },
  });

  const [activeHandle, setActiveHandle] = useState<keyof typeof corners | null>(null);

  const updateDisplaySize = useCallback(() => {
    if (!containerRef.current || !imageRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const img = imageRef.current;
    
    const containerAspect = container.width / container.height;
    const imageAspect = img.naturalWidth / img.naturalHeight;
    
    let width, height;
    if (imageAspect > containerAspect) {
      width = container.width;
      height = container.width / imageAspect;
    } else {
      height = container.height;
      width = container.height * imageAspect;
    }
    
    setDisplaySize({
      width,
      height,
      left: (container.width - width) / 2,
      top: (container.height - height) / 2,
    });
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

  useEffect(() => {
    window.addEventListener('resize', updateDisplaySize);
    return () => window.removeEventListener('resize', updateDisplaySize);
  }, [updateDisplaySize]);

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!activeHandle || !containerRef.current) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - displaySize.left) / displaySize.width;
    const y = (clientY - rect.top - displaySize.top) / displaySize.height;
    
    setCorners(prev => ({
      ...prev,
      [activeHandle]: {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      }
    }));
  };

  const handleMouseUp = () => setActiveHandle(null);

  const handleSave = () => {
    // Convert relative corners to pixel coordinates
    const pixelCorners = {
      tl: { x: corners.tl.x * imageSize.width, y: corners.tl.y * imageSize.height },
      tr: { x: corners.tr.x * imageSize.width, y: corners.tr.y * imageSize.height },
      br: { x: corners.br.x * imageSize.width, y: corners.br.y * imageSize.height },
      bl: { x: corners.bl.x * imageSize.width, y: corners.bl.y * imageSize.height },
    };
    onSave(pixelCorners);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-md flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-900 text-white">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary-600 rounded-lg">
            <ScanLine size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold">Perspective Correction</h2>
            <p className="text-xs text-slate-400">Drag corners to match the document edges</p>
          </div>
        </div>
        <button 
          onClick={onCancel}
          className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
        >
          <X size={24} />
        </button>
      </div>

      {/* Editor Area */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden select-none touch-none"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
      >
        <img
          ref={imageRef}
          src={imageSrc}
          alt="To edit"
          onLoad={updateDisplaySize}
          className="absolute pointer-events-none"
          style={{
            width: displaySize.width,
            height: displaySize.height,
            left: displaySize.left,
            top: displaySize.top,
          }}
          referrerPolicy="no-referrer"
        />

        {/* Overlay SVG for lines */}
        <svg 
          className="absolute pointer-events-none"
          style={{
            width: displaySize.width,
            height: displaySize.height,
            left: displaySize.left,
            top: displaySize.top,
          }}
        >
          <polygon
            points={`
              ${corners.tl.x * displaySize.width},${corners.tl.y * displaySize.height}
              ${corners.tr.x * displaySize.width},${corners.tr.y * displaySize.height}
              ${corners.br.x * displaySize.width},${corners.br.y * displaySize.height}
              ${corners.bl.x * displaySize.width},${corners.bl.y * displaySize.height}
            `}
            fill="rgba(59, 130, 246, 0.2)"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeDasharray="4"
          />
        </svg>

        {/* Handles */}
        <div 
          className="absolute"
          style={{
            width: displaySize.width,
            height: displaySize.height,
            left: displaySize.left,
            top: displaySize.top,
          }}
        >
          {(Object.entries(corners) as [keyof typeof corners, Point][]).map(([key, point]) => (
            <div
              key={key}
              onMouseDown={() => setActiveHandle(key)}
              onTouchStart={() => setActiveHandle(key)}
              className={`
                absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 border-white shadow-lg cursor-move transition-transform active:scale-125
                ${activeHandle === key ? 'bg-primary-500 scale-125' : 'bg-primary-600/80'}
              `}
              style={{
                left: `${point.x * 100}%`,
                top: `${point.y * 100}%`,
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-1.5 h-1.5 bg-white rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 bg-slate-900 border-t border-white/10 flex items-center justify-between">
        <div className="hidden sm:block text-sm text-slate-400">
          Tip: Align the blue grid with the corners of your document.
        </div>
        <div className="flex items-center space-x-4 w-full sm:w-auto">
          <button
            onClick={onCancel}
            className="flex-1 sm:flex-none px-6 py-3 text-slate-300 font-medium hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-10 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-bold shadow-xl shadow-primary-900/20 transition-all active:scale-95"
          >
            <Check size={20} />
            <span>Process Scan</span>
          </button>
        </div>
      </div>
    </div>
  );
};
