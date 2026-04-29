import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, RotateCw, Maximize2, ScanLine, Sun, Contrast, Zap, Layers } from 'lucide-react';
import { Point, UploadedFile } from '../types';

interface PerspectiveEditorProps {
  imageSrc: string;
  initialEnhancements?: UploadedFile['enhancements'];
  onSave: (
    corners: { tl: Point; tr: Point; br: Point; bl: Point },
    rotation: number,
    enhancements: UploadedFile['enhancements']
  ) => void;
  onCancel: () => void;
}

export const PerspectiveEditor: React.FC<PerspectiveEditorProps> = ({
  imageSrc,
  initialEnhancements,
  onSave,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0, left: 0, top: 0 });
  const [rotation, setRotation] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const [enhancements, setEnhancements] = useState<{
    contrast: number;
    brightness: number;
    sharpness: number;
    grayscale: boolean;
  }>(initialEnhancements || {
    contrast: 100,
    brightness: 100,
    sharpness: 0,
    grayscale: false,
  });
  
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
    onSave(corners, rotation, enhancements);
  };

  const isRotated = rotation % 180 !== 0;

  // CSS Filter string for preview
  const filterString = `
    brightness(${enhancements.brightness}%)
    contrast(${enhancements.contrast}%)
    grayscale(${enhancements.grayscale ? 1 : 0})
    ${enhancements.sharpness > 0 ? `contrast(${100 + enhancements.sharpness * 0.5}%) saturate(${100 + enhancements.sharpness * 0.2}%)` : ''}
  `;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col font-sans">
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-900/50 backdrop-blur-md text-white">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary-600 rounded-lg shadow-lg shadow-primary-900/20">
            <ScanLine size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Ritocca e Migliora</h2>
            <p className="text-xs text-slate-400 font-medium">Trascina gli angoli o usa i cursori in basso per la qualità</p>
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
              style={{ filter: filterString }}
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
          <div className="absolute inset-0 z-20 pointer-events-none">
            {(Object.entries(corners) as [keyof typeof corners, Point][]).map(([key, point]) => (
              <div
                key={key}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setActiveHandle(key);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  setActiveHandle(key);
                }}
                className={`
                  absolute w-10 h-10 -ml-5 -mt-5 rounded-full border-2 border-white shadow-xl cursor-move transition-transform flex items-center justify-center pointer-events-auto
                  ${activeHandle === key ? 'bg-primary-500 scale-110 ring-4 ring-primary-500/30' : 'bg-primary-600/90 hover:bg-primary-500'}
                `}
                style={{
                  left: point.x * displaySize.width,
                  top: point.y * displaySize.height,
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
            className="fixed pointer-events-none z-50 w-40 h-40 rounded-2xl border-4 border-white shadow-2xl overflow-hidden bg-slate-900 ring-4 ring-black/20"
            style={{
              left: mousePos.x - 80,
              top: mousePos.y - 200,
            }}
          >
            <div
              className="absolute"
              style={{
                width: displaySize.width * 4,
                height: displaySize.height * 4,
                left: -(corners[activeHandle].x * displaySize.width * 4) + 80,
                top: -(corners[activeHandle].y * displaySize.height * 4) + 80,
              }}
            >
              <div
                className="absolute"
                style={{
                  width: isRotated ? displaySize.height * 4 : displaySize.width * 4,
                  height: isRotated ? displaySize.width * 4 : displaySize.height * 4,
                  left: isRotated ? (displaySize.width * 4 - displaySize.height * 4) / 2 : 0,
                  top: isRotated ? (displaySize.height * 4 - displaySize.width * 4) / 2 : 0,
                  transform: `rotate(${rotation}deg)`,
                }}
              >
                <img
                  src={imageSrc}
                  className="w-full h-full object-fill"
                  style={{ filter: filterString }}
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
            {/* Crosshair */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-px bg-primary-400/60" />
              <div className="h-full w-px bg-primary-400/60 absolute" />
              <div className="w-3 h-3 border-2 border-primary-400 rounded-full" />
            </div>
          </div>
        )}
      </div>

      {/* Footer & Controls */}
      <div className="bg-slate-900 border-t-2 border-primary-500/30 flex flex-col sm:flex-row shadow-2xl z-40 relative">
        {/* Enhancements Panel */}
        <div className="flex-1 p-4 sm:p-6 border-b sm:border-b-0 sm:border-r border-white/5 flex flex-col space-y-4 bg-slate-900/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2 text-primary-400">
              <Layers size={16} />
              <span className="text-xs font-bold uppercase tracking-widest">Regolazioni Qualità</span>
            </div>
            <div className="text-[10px] text-slate-500 font-medium bg-slate-800 px-2 py-0.5 rounded">
              L'effetto verrà applicato al documento finale
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
            {/* Presets */}
            <div className="space-y-4 lg:col-span-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Layers size={12} /> PRESET
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: 'Originale', c: 100, b: 100, s: 0, g: false },
                  { name: 'Magico', c: 135, b: 105, s: 20, g: false },
                  { name: 'Documento', c: 165, b: 110, s: 40, g: true },
                  { name: 'Scurisci', c: 150, b: 85, s: 10, g: false },
                  { name: 'Schiarisci', c: 110, b: 130, s: 0, g: false },
                  { name: 'Eco', c: 110, b: 130, s: 0, g: true },
                ].map(p => (
                  <button
                    key={p.name}
                    onClick={() => setEnhancements({ contrast: p.c, brightness: p.b, sharpness: p.s, grayscale: p.g })}
                    className="px-2 py-2 bg-slate-800/50 hover:bg-primary-600 text-[10px] font-bold text-slate-300 hover:text-white rounded-lg transition-all border border-white/5 active:scale-95 text-center"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Contrast */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-slate-400 flex items-center gap-2 uppercase tracking-widest">
                  <Contrast size={12} className="text-primary-400" /> Contrasto
                </label>
                <button 
                  onClick={() => setEnhancements(prev => ({ ...prev, contrast: 100 }))}
                  className="text-[9px] font-bold text-slate-600 hover:text-slate-400 uppercase"
                >
                  Reset
                </button>
              </div>
              <div className="flex items-center space-x-3">
                <input 
                  type="range" min="50" max="250" value={enhancements.contrast}
                  onChange={(e) => setEnhancements(prev => ({ ...prev, contrast: parseInt(e.target.value) }))}
                  className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary-500"
                />
                <span className="text-[10px] font-mono text-slate-500 w-8">{enhancements.contrast}%</span>
              </div>
            </div>

            {/* Brightness */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-slate-400 flex items-center gap-2 uppercase tracking-widest">
                  <Sun size={12} className="text-yellow-400" /> Luminosità
                </label>
                <button 
                  onClick={() => setEnhancements(prev => ({ ...prev, brightness: 100 }))}
                  className="text-[9px] font-bold text-slate-600 hover:text-slate-400 uppercase"
                >
                  Reset
                </button>
              </div>
              <div className="flex items-center space-x-3">
                <input 
                  type="range" min="50" max="150" value={enhancements.brightness}
                  onChange={(e) => setEnhancements(prev => ({ ...prev, brightness: parseInt(e.target.value) }))}
                  className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary-500"
                />
                <span className="text-[10px] font-mono text-slate-500 w-8">{enhancements.brightness}%</span>
              </div>
            </div>

            {/* Sharpness */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-slate-400 flex items-center gap-2 uppercase tracking-widest">
                  <Zap size={12} className="text-indigo-400" /> Nitidezza
                </label>
                <button 
                  onClick={() => setEnhancements(prev => ({ ...prev, sharpness: 0 }))}
                  className="text-[9px] font-bold text-slate-600 hover:text-slate-400 uppercase"
                >
                  Reset
                </button>
              </div>
              <div className="flex items-center space-x-3">
                <input 
                  type="range" min="0" max="100" value={enhancements.sharpness}
                  onChange={(e) => setEnhancements(prev => ({ ...prev, sharpness: parseInt(e.target.value) }))}
                  className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary-500"
                />
                <span className="text-[10px] font-mono text-slate-500 w-8">{enhancements.sharpness}%</span>
              </div>
            </div>

            {/* Grayscale */}
            <div className="flex flex-col space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Modalità Colore</label>
              <div className="flex p-1 bg-slate-800/80 rounded-xl">
                <button 
                  onClick={() => setEnhancements(prev => ({ ...prev, grayscale: false }))}
                  className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all ${!enhancements.grayscale ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  A COLORI
                </button>
                <button 
                  onClick={() => setEnhancements(prev => ({ ...prev, grayscale: true }))}
                  className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all ${enhancements.grayscale ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  B/N
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Actions panel */}
        <div className="p-4 sm:p-6 flex items-center justify-between sm:justify-end space-x-4 min-w-[300px]">
          <button
            onClick={onCancel}
            className="flex-1 sm:flex-none px-6 py-3 text-slate-400 font-bold hover:text-white transition-colors uppercase tracking-wider text-[10px]"
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-8 py-3 bg-white text-slate-900 hover:bg-primary-50 text-white rounded-xl font-bold shadow-xl transition-all active:scale-95 uppercase tracking-wider text-[10px]"
          >
            <Check size={16} className="text-primary-600" />
            <span>Salva Scansione</span>
          </button>
        </div>
      </div>
    </div>
  );
};

