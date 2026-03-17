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
  const [files, setFiles] = useState<File[]>([]);
  const [pagesText, setPagesText] = useState<{ page: number, text: string, fileName: string }[]>([]);
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
    const pdfFiles = newFiles.filter(f => f.type === 'application/pdf');
    if (pdfFiles.length === 0) {
      setStatus({ ...status, error: 'Per favore seleziona almeno un file PDF.' });
      return;
    }
    
    setFiles(prev => [...prev, ...pdfFiles]);
    setStatus({ isProcessing: true, message: `Lettura di ${pdfFiles.length} documenti in corso...`, error: null });

    try {
      const allExtractedText: { page: number, text: string, fileName: string }[] = [];
      
      for (const pdfFile of pdfFiles) {
        const extractedText = await extractTextFromPdf(pdfFile);
        allExtractedText.push(...extractedText.map(p => ({ ...p, fileName: pdfFile.name })));
      }

      setPagesText(prev => [...prev, ...allExtractedText]);
      setStatus({ isProcessing: false, message: '', error: null });
      
      // Initial greeting or update message
      const fileNames = pdfFiles.map(f => `"${f.name}"`).join(', ');
      setMessages(prev => [
        ...prev,
        { 
          role: 'model', 
          text: prev.length === 0 
            ? `Ho letto ${pdfFiles.length} documenti: ${fileNames}. Cosa desideri analizzare? Posso fare calcoli incrociati, riassunti o estrarre dati specifici da tutti i file.`
            : `Ho aggiunto ${pdfFiles.length} nuovi documenti: ${fileNames}. Ora posso analizzarli insieme ai precedenti.`
        }
      ]);
    } catch (err: any) {
      console.error(err);
      setStatus({ isProcessing: false, message: '', error: `Errore durante la lettura: ${err.message}` });
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || status.isProcessing || files.length === 0) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setStatus({ isProcessing: true, message: 'L\'AI sta elaborando...', error: null });

    try {
      // We need to pass the file name context to the chat service
      const contextText = pagesText.map(p => ({ page: p.page, text: `[File: ${p.fileName}, Pagina: ${p.page}]\n${p.text}` }));
      const response = await chatWithPdf(contextText, userMessage, messages);
      setMessages(prev => [...prev, { role: 'model', text: response }]);
      setStatus({ isProcessing: false, message: '', error: null });
    } catch (err: any) {
      console.error(err);
      setStatus({ isProcessing: false, message: '', error: `Errore: ${err.message}` });
    }
  };

  const removeFile = (index: number) => {
    const fileName = files[index].name;
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPagesText(prev => prev.filter(p => p.fileName !== fileName));
    if (files.length === 1) {
      reset();
    }
  };

  const reset = () => {
    setFiles([]);
    setPagesText([]);
    setMessages([]);
    setInput('');
    setStatus({ isProcessing: false, message: '', error: null });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {files.length === 0 ? (
        <div className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold text-slate-800">Elabora Documenti</h2>
            <p className="text-slate-500">Carica uno o più PDF per analizzarli, fare calcoli o estrarre dati con l'AI.</p>
          </div>
          <Dropzone onFilesSelected={handleFilesSelected} />
        </div>
      ) : (
        <div className="flex flex-col h-[75vh] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 flex-shrink-0">
                <FileSearch size={20} />
              </div>
              <div className="overflow-hidden">
                <h3 className="font-bold text-slate-800 truncate">
                  {files.length} Documenti caricati
                </h3>
                <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1">
                  {files.map((f, i) => (
                    <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-white border border-slate-200 text-slate-600 whitespace-nowrap">
                      {f.name}
                      <button onClick={() => removeFile(i)} className="ml-1 text-slate-400 hover:text-red-500">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button 
                onClick={() => document.getElementById('add-more-files')?.click()}
                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="Aggiungi altri file"
              >
                <Sparkles size={18} />
                <input 
                  id="add-more-files" 
                  type="file" 
                  multiple 
                  accept="application/pdf" 
                  className="hidden" 
                  onChange={(e) => e.target.files && handleFilesSelected(Array.from(e.target.files))}
                />
              </button>
              <button 
                onClick={reset}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Rimuovi tutto"
              >
                <Trash2 size={18} />
              </button>
            </div>
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
                placeholder="Chiedi all'AI di analizzare i documenti..."
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
                onClick={() => setInput("Fai un riassunto dei dati principali di tutti i file")}
                className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-primary-600 transition-colors"
              >
                Riassunto Globale
              </button>
              <button 
                onClick={() => setInput("Estrai tutti i totali in euro suddivisi per file")}
                className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-primary-600 transition-colors"
              >
                Totali per File
              </button>
              <button 
                onClick={() => setInput("Crea una tabella comparativa dei dati estratti")}
                className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-primary-600 transition-colors"
              >
                Tabella Comparativa
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
