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
  enhancements?: {
    contrast: number;      // 0 to 200, default 100
    brightness: number;    // 0 to 200, default 100
    sharpness: number;     // 0 to 100, default 0
    grayscale: boolean;    // default false
  };
}

export interface ProcessingState {
  isProcessing: boolean;
  message: string;
  error: string | null;
}

export type OptimizationLevel = 'none' | 'minimum' | 'recommended' | 'maximum';

export type ViewMode = 'merge' | 'split' | 'process';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  timestamp: number;
  fileNames: string[];
}

export interface PromptPreset {
  id: string;
  userId: string;
  name: string;
  prompt: string;
}
