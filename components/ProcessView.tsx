import React, { useState, useRef, useEffect } from 'react';
import { ProcessingState } from '../types';
import { Dropzone } from './Dropzone';
import { extractTextFromPdf } from '../utils/pdfExtractor';
import { chatWithPdf } from '../services/geminiService';
import { 
  FileText, 
  Loader2, 
  AlertCircle, 
  Send, 
  User, 
  Bot, 
  Trash2, 
  Sparkles,
  FileSearch
} from 'lucide-react';
import Markdown from 'react-markdown';

interface Message {
  role: 'user' | 'model';
  text: string;
}

export const ProcessView: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [pagesText, setPagesText] = useState<{ page: number, text: string }[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<ProcessingState>({
    isProcessing: false,
    message: '',
    error: null,
  });
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFilesSelected = async (newFiles: File[]) => {
    const pdfFile = newFiles.find(f => f.type === 'application/pdf');
    if (!pdfFile) {
      setStatus({ ...status, error: 'Per favore seleziona un file PDF.' });
      return;
    }
    
    setFile(pdfFile);
    setStatus({ isProcessing: true, message: 'Lettura del documento in corso...', error: null });

    try {
      const extractedText = await extractTextFromPdf(pdfFile);
      setPagesText(extractedText);
      setStatus({ isProcessing: false, message: '', error: null });
      
      // Initial greeting
      setMessages([
        { 
          role: 'model', 
          text: `Ho letto il documento "${pdfFile.name}" (${extractedText.length} pagine). Cosa desideri analizzare? Posso fare calcoli, riassunti o estrarre dati specifici.` 
        }
      ]);
    } catch (err: any) {
      console.error(err);
      setStatus({ isProcessing: false, message: '', error: `Errore durante la lettura: ${err.message}` });
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || status.isProcessing || !file) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setStatus({ isProcessing: true, message: 'L\'AI sta elaborando...', error: null });

    try {
      const response = await chatWithPdf(pagesText, userMessage, messages);
      setMessages(prev => [...prev, { role: 'model', text: response }]);
      setStatus({ isProcessing: false, message: '', error: null });
    } catch (err: any) {
      console.error(err);
      setStatus({ isProcessing: false, message: '', error: `Errore: ${err.message}` });
    }
  };

  const reset = () => {
    setFile(null);
    setPagesText([]);
    setMessages([]);
    setInput('');
    setStatus({ isProcessing: false, message: '', error: null });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {!file ? (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-slate-800">Elabora Documenti</h2>
            <p className="text-slate-500">Carica un PDF per analizzarlo, fare calcoli o estrarre dati con l'AI.</p>
          </div>
          <Dropzone onFilesSelected={handleFilesSelected} />
        </div>
      ) : (
        <div className="flex flex-col h-[70vh] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600">
                <FileSearch size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 truncate max-w-[200px] sm:max-w-md">{file.name}</h3>
                <p className="text-xs text-slate-500">{pagesText.length} pagine caricate</p>
              </div>
            </div>
            <button 
              onClick={reset}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Rimuovi file"
            >
              <Trash2 size={18} />
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div 
                key={i} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}
              >
                <div className={`flex max-w-[85%] space-x-3 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-primary-100 text-primary-600' : 'bg-indigo-100 text-indigo-600'}`}>
                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className={`p-4 rounded-2xl ${msg.role === 'user' ? 'bg-primary-600 text-white rounded-tr-none' : 'bg-slate-100 text-slate-800 rounded-tl-none'}`}>
                    <div className="prose prose-sm max-w-none prose-slate dark:prose-invert">
                      <div className={msg.role === 'user' ? 'text-white' : 'markdown-body'}>
                        <Markdown>{msg.text}</Markdown>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {status.isProcessing && status.message && (
              <div className="flex justify-start animate-pulse">
                <div className="flex space-x-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-400 flex items-center justify-center">
                    <Bot size={16} />
                  </div>
                  <div className="bg-slate-50 text-slate-400 p-3 rounded-2xl rounded-tl-none text-sm italic">
                    {status.message}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-slate-100">
            <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Chiedi all'AI di analizzare il documento..."
                className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                disabled={status.isProcessing}
              />
              <button
                type="submit"
                disabled={!input.trim() || status.isProcessing}
                className="p-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary-500/20"
              >
                <Send size={20} />
              </button>
            </form>
            <div className="mt-2 flex flex-wrap gap-2">
              <button 
                onClick={() => setInput("Fai un riassunto dei dati principali")}
                className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-primary-600 transition-colors"
              >
                Riassunto
              </button>
              <button 
                onClick={() => setInput("Estrai tutti i totali in euro")}
                className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-primary-600 transition-colors"
              >
                Totali Euro
              </button>
              <button 
                onClick={() => setInput("Crea una tabella con i dati estratti")}
                className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-primary-600 transition-colors"
              >
                Tabella Dati
              </button>
            </div>
          </div>
        </div>
      )}

      {status.error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center text-red-600 animate-in fade-in slide-in-from-top-2">
          <AlertCircle size={20} className="mr-2" />
          {status.error}
        </div>
      )}
    </div>
  );
};
