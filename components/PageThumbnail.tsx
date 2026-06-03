import React, { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';

// Set worker path
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PageThumbnailProps {
  file: File;
  pageNumber: number;
  className?: string;
}

export const PageThumbnail: React.FC<PageThumbnailProps> = ({ file, pageNumber, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const renderThumbnail = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(pageNumber);
        
        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        // @ts-ignore
        await page.render(renderContext).promise;
        if (isMounted) setLoading(false);
      } catch (error) {
        console.error('Error rendering thumbnail:', error);
      }
    };

    renderThumbnail();

    return () => {
      isMounted = false;
    };
  }, [file, pageNumber]);

  return (
    <div className={`relative bg-slate-100 rounded border border-slate-200 overflow-hidden ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      <canvas ref={canvasRef} className="w-full h-auto block" />
      <div className="absolute bottom-0 right-0 bg-black/50 text-white text-[10px] px-1 font-mono">
        p.{pageNumber}
      </div>
    </div>
  );
};
