export interface Point {
  x: number;
  y: number;
}

export interface UploadedFile {
  id: string;
  file: File;
  preview?: string;
  type: 'pdf' | 'image';
  rotation?: number;
  corners?: {
    tl: Point;
    tr: Point;
    br: Point;
    bl: Point;
  };
}

export interface ProcessingState {
  isProcessing: boolean;
  message: string;
  error: string | null;
}

export type ViewMode = 'merge' | 'split';
