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
  const [rotation, setRotation] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Corners in relative coordinates (0 to 1)
  const [corners, setCorners] = useState({
    tl: { x: 0.1, y: 0.1 },
    tr: { x: 0.9, y: 0.1 },
    br: { x: 0.9, y: 0.9 },
    bl: { x: 0.1, y: 0.9 },
  });

  const [activeHandle, setActiveHandle] = useState<keyof typeof corners | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const updateDisplaySize = useCallback(() => {
    if (!containerRef.current || !imageRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const img = imageRef.current;
    
    const isRotated = rotation % 180 !== 0;
    const naturalWidth = isRotated ? img.naturalHeight : img.naturalWidth;
    const naturalHeight = isRotated ? img.naturalWidth : img.naturalHeight;

    if (!naturalWidth || !naturalHeight) return;

    const containerAspect = container.width / container.height;
    const imageAspect = naturalWidth / naturalHeight;
    
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
    setIsLoaded(true);
  }, [rotation]);

  useEffect(() => {
    const timer = setTimeout(updateDisplaySize, 100); // Small delay to ensure container is ready
    window.addEventListener('resize', updateDisplaySize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateDisplaySize);
    };
  }, [updateDisplaySize]);

  const handleRotate = () => {
    setRotation(prev => {
      const nextRotation = (prev + 90) % 360;
      // Rotate corners clockwise: (x, y) -> (1-y, x)
      setCorners(prevCorners => ({
        tl: { x: 1 - prevCorners.bl.y, y: prevCorners.bl.x },
        tr: { x: 1 - prevCorners.tl.y, y: prevCorners.tl.x },
        br: { x: 1 - prevCorners.tr.y, y: prevCorners.tr.x },
        bl: { x: 1 - prevCorners.br.y, y: prevCorners.br.x },
      }));
      return nextRotation;
    });
  };

  const handleResetGrid = () => {
    setCorners({
      tl: { x: 0, y: 0 },
      tr: { x: 1, y: 0 },
      br: { x: 1, y: 1 },
      bl: { x: 0, y: 1 },
    });
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setMousePos({ x: clientX, y: clientY });

    if (!activeHandle || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    
    // Calculate relative to the display area
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
    (onSave as any)(corners, rotation);
  };

  const isRotated = rotation % 180 !== 0;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col font-sans">
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-900/50 backdrop-blur-md text-white">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary-600 rounded-lg shadow-lg shadow-primary-900/20">
            <ScanLine size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Perspective Scan</h2>
            <p className="text-xs text-slate-400 font-medium">Align the grid with your document's edges</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleResetGrid}
            className="flex items-center space-x-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl transition-all font-medium text-sm"
            title="Reset to full image"
          >
            <Maximize2 size={16} />
            <span className="hidden sm:inline">Full Image</span>
          </button>
          <button
            onClick={handleRotate}
            className="flex items-center space-x-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all font-medium text-sm"
          >
            <RotateCw size={16} />
            <span className="hidden sm:inline">Rotate 90°</span>
          </button>
          <button 
            onClick={onCancel}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Editor Area */}
      <div 
        ref={containerRef}
        className="flex-1 relative overflow-hidden select-none touch-none bg-slate-950 flex items-center justify-center p-4 sm:p-8"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
      >
        <div
          className="relative shadow-2xl transition-opacity duration-300"
          style={{
            width: displaySize.width,
            height: displaySize.height,
            opacity: isLoaded ? 1 : 0,
          }}
        >
          {/* Rotated Image Container */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              width: isRotated ? displaySize.height : displaySize.width,
              height: isRotated ? displaySize.width : displaySize.height,
              left: isRotated ? (displaySize.width - displaySize.height) / 2 : 0,
              top: isRotated ? (displaySize.height - displaySize.width) / 2 : 0,
              transform: `rotate(${rotation}deg)`,
            }}
          >
            <img
              ref={imageRef}
              src={imageSrc}
              alt="To edit"
              onLoad={updateDisplaySize}
              className="w-full h-full object-fill pointer-events-none"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Overlay SVG for lines */}
          <svg className="absolute inset-0 pointer-events-none z-10 overflow-visible">
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <polygon
              points={`
                ${corners.tl.x * displaySize.width},${corners.tl.y * displaySize.height}
                ${corners.tr.x * displaySize.width},${corners.tr.y * displaySize.height}
                ${corners.br.x * displaySize.width},${corners.br.y * displaySize.height}
                ${corners.bl.x * displaySize.width},${corners.bl.y * displaySize.height}
              `}
              fill="rgba(59, 130, 246, 0.15)"
              stroke="#3b82f6"
              strokeWidth="2.5"
              filter="url(#glow)"
            />
            {/* Grid lines for better alignment */}
            <line 
              x1={(corners.tl.x + corners.bl.x) / 2 * displaySize.width} y1={(corners.tl.y + corners.bl.y) / 2 * displaySize.height}
              x2={(corners.tr.x + corners.br.x) / 2 * displaySize.width} y2={(corners.tr.y + corners.br.y) / 2 * displaySize.height}
              stroke="rgba(59, 130, 246, 0.3)" strokeWidth="1" strokeDasharray="4"
            />
            <line 
              x1={(corners.tl.x + corners.tr.x) / 2 * displaySize.width} y1={(corners.tl.y + corners.tr.y) / 2 * displaySize.height}
              x2={(corners.bl.x + corners.br.x) / 2 * displaySize.width} y2={(corners.bl.y + corners.br.y) / 2 * displaySize.height}
              stroke="rgba(59, 130, 246, 0.3)" strokeWidth="1" strokeDasharray="4"
            />
          </svg>

          {/* Handles */}
          <div className="absolute inset-0 z-20">
            {(Object.entries(corners) as [keyof typeof corners, Point][]).map(([key, point]) => (
              <div
                key={key}
                onMouseDown={() => setActiveHandle(key)}
                onTouchStart={() => setActiveHandle(key)}
                className={`
                  absolute w-10 h-10 -ml-5 -mt-5 rounded-full border-2 border-white shadow-xl cursor-move transition-all flex items-center justify-center
                  ${activeHandle === key ? 'bg-primary-500 scale-125 ring-4 ring-primary-500/30' : 'bg-primary-600/90 hover:bg-primary-500'}
                `}
                style={{
                  left: `${point.x * 100}%`,
                  top: `${point.y * 100}%`,
                }}
              >
                <div className="w-2 h-2 bg-white rounded-full shadow-sm" />
              </div>
            ))}
          </div>
        </div>

        {/* Magnifier */}
        {activeHandle && (
          <div 
            className="fixed pointer-events-none z-50 w-32 h-32 rounded-full border-4 border-white shadow-2xl overflow-hidden bg-slate-900"
            style={{
              left: mousePos.x - 64,
              top: mousePos.y - 160,
            }}
          >
            <div
              className="absolute"
              style={{
                width: displaySize.width * 2.5,
                height: displaySize.height * 2.5,
                left: -(corners[activeHandle].x * displaySize.width * 2.5) + 64,
                top: -(corners[activeHandle].y * displaySize.height * 2.5) + 64,
              }}
            >
              <div
                className="absolute"
                style={{
                  width: isRotated ? displaySize.height * 2.5 : displaySize.width * 2.5,
                  height: isRotated ? displaySize.width * 2.5 : displaySize.height * 2.5,
                  left: isRotated ? (displaySize.width * 2.5 - displaySize.height * 2.5) / 2 : 0,
                  top: isRotated ? (displaySize.height * 2.5 - displaySize.width * 2.5) / 2 : 0,
                  transform: `rotate(${rotation}deg)`,
                }}
              >
                <img
                  src={imageSrc}
                  className="w-full h-full object-fill"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
            {/* Crosshair */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-0.5 bg-primary-500/50" />
              <div className="h-full w-0.5 bg-primary-500/50 absolute" />
              <div className="w-2 h-2 border-2 border-primary-500 rounded-full" />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-6 bg-slate-900/80 backdrop-blur-md border-t border-white/5 flex items-center justify-between">
        <div className="hidden sm:flex items-center space-x-2 text-sm text-slate-400 font-medium">
          <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
          <span>Drag corners to the document's edges for a perfect scan.</span>
        </div>
        <div className="flex items-center space-x-4 w-full sm:w-auto">
          <button
            onClick={onCancel}
            className="flex-1 sm:flex-none px-6 py-3 text-slate-400 font-bold hover:text-white transition-colors uppercase tracking-wider text-xs"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-10 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-bold shadow-xl shadow-primary-900/40 transition-all active:scale-95 uppercase tracking-wider text-xs"
          >
            <Check size={18} />
            <span>Process Scan</span>
          </button>
        </div>
      </div>
    </div>
  );
};

