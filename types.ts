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

export type ViewMode = 'merge' | 'split' | 'process';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  timestamp: number;
  fileNames: string[];
}

export interface PromptPreset {
  id: string;
  name: string;
  prompt: string;
}
