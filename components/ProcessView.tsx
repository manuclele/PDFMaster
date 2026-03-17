import React, { useState, useRef, useEffect } from 'react';
import { ProcessingState, ChatMessage, ChatSession, PromptPreset } from '../types';
import { Dropzone } from './Dropzone';
import { extractTextFromPdf } from '../utils/pdfExtractor';
import { chatWithPdf, generateChatTitle } from '../services/geminiService';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  FileText, 
  Loader2, 
  AlertCircle, 
  Send, 
  User, 
  Bot, 
  Trash2, 
  Sparkles,
  FileSearch,
  X,
  Download,
  Plus,
  History,
  Bookmark,
  Save,
  ChevronLeft,
  Menu,
  MessageSquare
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const ProcessView: React.FC = () => {
  // Chat State
  const [files, setFiles] = useState<File[]>([]);
  const [pagesText, setPagesText] = useState<{ page: number, text: string, fileName: string }[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [currentSessionId, setCurrentSessionId] = useState<string>(crypto.randomUUID());
  
  // History & Presets State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showPresets, setShowPresets] = useState(false);
  
  const [status, setStatus] = useState<ProcessingState>({
    isProcessing: false,
    message: '',
    error: null,
  });
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load data from localStorage on mount
  useEffect(() => {
    const savedSessions = localStorage.getItem('pdf_master_sessions');
    const savedPresets = localStorage.getItem('pdf_master_presets');
    
    if (savedSessions) {
      try {
        setSessions(JSON.parse(savedSessions));
      } catch (e) { console.error('Failed to load sessions', e); }
    }
    
    if (savedPresets) {
      try {
        setPresets(JSON.parse(savedPresets));
      } catch (e) { console.error('Failed to load presets', e); }
    } else {
      // Default presets
      const defaultPresets: PromptPreset[] = [
        { id: '1', name: 'Analisi Carburante', prompt: 'Dividi i rifornimenti per targa e dammi i totali in litri ed euro (comprensivi di IVA). Non tenere conto dell\'AdBlue.' },
        { id: '2', name: 'Riassunto Esecutivo', prompt: 'Fai un riassunto dei dati principali di tutti i file in una tabella strutturata.' },
        { id: '3', name: 'Estrazione Totali', prompt: 'Estrai tutti i totali in euro suddivisi per file e calcola il totale generale.' }
      ];
      setPresets(defaultPresets);
      localStorage.setItem('pdf_master_presets', JSON.stringify(defaultPresets));
    }
  }, []);

  // Save sessions to localStorage when they change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('pdf_master_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  // Update current session in history
  useEffect(() => {
    if (messages.length > 0) {
      setSessions(prev => {
        const existingIdx = prev.findIndex(s => s.id === currentSessionId);
        const userMsg = messages.find(m => m.role === 'user');
        const title = userMsg ? userMsg.text.slice(0, 30) + '...' : 'Nuova Chat';
        
        const updatedSession: ChatSession = {
          id: currentSessionId,
          title: existingIdx >= 0 && !prev[existingIdx].title.startsWith('Nuova Chat') && prev[existingIdx].title !== title ? prev[existingIdx].title : title,
          messages,
          timestamp: Date.now(),
          fileNames: files.map(f => f.name)
        };

        if (existingIdx >= 0) {
          const newSessions = [...prev];
          newSessions[existingIdx] = updatedSession;
          return newSessions;
        } else {
          return [updatedSession, ...prev];
        }
      });
    }
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
      
      if (messages.length === 0) {
        const fileNames = pdfFiles.map(f => `"${f.name}"`).join(', ');
        setMessages([
          { 
            role: 'model', 
            text: `Ho letto ${pdfFiles.length} documenti: ${fileNames}. Cosa desideri analizzare?` 
          }
        ]);
      }
    } catch (err: any) {
      console.error(err);
      setStatus({ isProcessing: false, message: '', error: `Errore durante la lettura: ${err.message}` });
    }
  };

  const handleSendMessage = async (customMessage?: string) => {
    const userMessage = customMessage || input.trim();
    if (!userMessage || status.isProcessing || files.length === 0) return;

    if (!customMessage) setInput('');
    
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setStatus({ isProcessing: true, message: 'L\'AI sta elaborando...', error: null });

    try {
      const contextText = pagesText.map(p => ({ page: p.page, text: `[File: ${p.fileName}, Pagina: ${p.page}]\n${p.text}` }));
      const response = await chatWithPdf(contextText, userMessage, messages);
      
      // Generate title if it's the first exchange
      if (messages.length === 0) {
        generateChatTitle(userMessage, response).then(title => {
          setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, title } : s));
        });
      }
      
      setMessages(prev => [...prev, { role: 'model', text: response }]);
      setStatus({ isProcessing: false, message: '', error: null });
    } catch (err: any) {
      console.error(err);
      setStatus({ isProcessing: false, message: '', error: `Errore: ${err.message}` });
    }
  };

  const startNewChat = () => {
    setFiles([]);
    setPagesText([]);
    setMessages([]);
    setInput('');
    setCurrentSessionId(crypto.randomUUID());
    setStatus({ isProcessing: false, message: '', error: null });
  };

  const loadSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    // Note: Actual File objects cannot be restored from localStorage
    // We show a message that files need to be re-uploaded if they want to continue analysis
    setFiles([]); 
    setPagesText([]);
    setStatus({ 
      isProcessing: false, 
      message: '', 
      error: session.fileNames.length > 0 ? 'Nota: I file originali devono essere ricaricati per continuare l\'analisi in questa chat.' : null 
    });
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      startNewChat();
    }
  };

  const saveAsPreset = () => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    const name = window.prompt('Inserisci un nome per questo preset:', 'Analisi Personalizzata');
    if (name) {
      const newPreset: PromptPreset = {
        id: crypto.randomUUID(),
        name,
        prompt: lastUserMsg.text
      };
      const updatedPresets = [...presets, newPreset];
      setPresets(updatedPresets);
      localStorage.setItem('pdf_master_presets', JSON.stringify(updatedPresets));
      alert('Preset salvato con successo!');
    }
  };

  const deletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedPresets = presets.filter(p => p.id !== id);
    setPresets(updatedPresets);
    localStorage.setItem('pdf_master_presets', JSON.stringify(updatedPresets));
  };

  const exportToPdf = async (specificMessage?: ChatMessage) => {
    const targetElement = chatContainerRef.current;
    if (!targetElement || messages.length === 0) return;
    
    setStatus({ isProcessing: true, message: 'Preparazione report PDF...', error: null });
    
    try {
      // Create a temporary container for the PDF export
      const exportContainer = document.createElement('div');
      exportContainer.style.position = 'absolute';
      exportContainer.style.left = '-9999px';
      exportContainer.style.top = '0';
      exportContainer.style.width = '800px'; // Standard width for A4
      exportContainer.style.backgroundColor = 'white';
      exportContainer.style.padding = '40px';
      exportContainer.className = 'pdf-export-container';
      
      // Add a header to the PDF
      const header = document.createElement('div');
      header.innerHTML = `
        <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px;">
          <h1 style="color: #1e293b; margin: 0; font-size: 24px;">${specificMessage ? 'Risposta AI - Report' : 'Report Analisi Documenti'}</h1>
          <p style="color: #64748b; margin: 5px 0 0 0; font-size: 14px;">Generato il: ${new Date().toLocaleString()}</p>
          ${files.length > 0 ? `<p style="color: #64748b; margin: 2px 0 0 0; font-size: 12px;">File analizzati: ${files.map(f => f.name).join(', ')}</p>` : ''}
        </div>
      `;
      exportContainer.appendChild(header);

      if (specificMessage) {
        // Export only the specific message
        const messageDiv = document.createElement('div');
        messageDiv.className = 'markdown-body';
        messageDiv.style.padding = '20px';
        messageDiv.style.border = '1px solid #e2e8f0';
        messageDiv.style.borderRadius = '12px';
        messageDiv.style.backgroundColor = '#f8fafc';
        
        // We need to render the markdown for the specific message
        // Since we are in React, we can't easily use the component here, 
        // so we'll clone the specific message from the DOM if possible
        const allMessages = targetElement.querySelectorAll('.animate-in');
        const msgIndex = messages.indexOf(specificMessage);
        if (msgIndex !== -1 && allMessages[msgIndex]) {
          const clonedMsg = allMessages[msgIndex].querySelector('.markdown-body')?.cloneNode(true) as HTMLElement;
          if (clonedMsg) {
            messageDiv.appendChild(clonedMsg);
          } else {
            messageDiv.innerText = specificMessage.text;
          }
        } else {
          messageDiv.innerText = specificMessage.text;
        }
        exportContainer.appendChild(messageDiv);
      } else {
        // Clone the chat messages but style them for a document
        const messagesClone = targetElement.cloneNode(true) as HTMLElement;
        messagesClone.style.height = 'auto';
        messagesClone.style.overflow = 'visible';
        messagesClone.style.padding = '0';
        
        // Remove avatars and user bubbles styling for a cleaner report
        const avatars = messagesClone.querySelectorAll('.w-10.h-10');
        avatars.forEach((a: any) => a.remove());

        const bubbles = messagesClone.querySelectorAll('.rounded-3xl');
        bubbles.forEach((b: any) => {
          b.style.boxShadow = 'none';
          b.style.border = '1px solid #e2e8f0';
          b.style.borderRadius = '8px';
          b.style.marginBottom = '20px';
          b.style.pageBreakInside = 'avoid'; // Prevent breaking inside a message bubble
          
          if (b.classList.contains('bg-primary-600')) {
            b.style.backgroundColor = '#f8fafc';
            b.style.color = '#1e293b';
            b.style.borderColor = '#cbd5e1';
            const text = b.querySelector('.text-white');
            if (text) text.style.color = '#1e293b';
          }
        });

        exportContainer.appendChild(messagesClone);
      }

      document.body.appendChild(exportContainer);

      // Wait a bit for images and styles to be fully applied
      await new Promise(resolve => setTimeout(resolve, 800));

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      
      // Use jspdf's html method for better quality and selectable text
      await pdf.html(exportContainer, {
        callback: (doc) => {
          const session = sessions.find(s => s.id === currentSessionId);
          const fileName = specificMessage 
            ? `Risposta_AI_${new Date().getTime()}.pdf` 
            : `${session?.title.replace(/[^a-z0-9]/gi, '_') || 'Report'}_${new Date().getTime()}.pdf`;
          doc.save(fileName);
          setStatus({ isProcessing: false, message: '', error: null });
          if (document.body.contains(exportContainer)) {
            document.body.removeChild(exportContainer);
          }
        },
        x: 10,
        y: 10,
        width: pdfWidth - 20,
        windowWidth: 800,
        autoPaging: 'text'
      });
    } catch (err: any) {
      console.error(err);
      setStatus({ isProcessing: false, message: '', error: `Errore durante l'esportazione: ${err.message}` });
      // Cleanup if error
      const container = document.querySelector('.pdf-export-container');
      if (container) document.body.removeChild(container);
    }
  };

  return (
    <div className="flex h-[80vh] bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden relative">
      {/* Sidebar */}
      <div className={`
        ${showSidebar ? 'w-72' : 'w-0'} 
        transition-all duration-300 bg-slate-50 border-r border-slate-200 flex flex-col overflow-hidden z-20
      `}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center space-x-2">
            <History size={18} className="text-indigo-600" />
            <span>Cronologia</span>
          </h3>
          <button onClick={startNewChat} className="p-1.5 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors" title="Nuova Chat">
            <Plus size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="text-center py-10 px-4">
              <MessageSquare size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs text-slate-400 italic">Nessuna chat salvata</p>
            </div>
          ) : (
            sessions.map(session => (
              <div 
                key={session.id}
                onClick={() => loadSession(session)}
                className={`
                  group p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between
                  ${currentSessionId === session.id ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-200 text-slate-700'}
                `}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{session.title}</p>
                  <p className={`text-[10px] ${currentSessionId === session.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                    {new Date(session.timestamp).toLocaleDateString()}
                  </p>
                </div>
                <button 
                  onClick={(e) => deleteSession(session.id, e)}
                  className={`p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity ${currentSessionId === session.id ? 'hover:bg-indigo-500 text-white' : 'hover:bg-red-100 text-red-500'}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Presets Section in Sidebar */}
        <div className="p-4 border-t border-slate-200 bg-slate-100/50">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center space-x-2">
            <Bookmark size={14} />
            <span>I tuoi Preset</span>
          </h4>
          <div className="space-y-2">
            {presets.map(preset => (
              <div key={preset.id} className="group flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 hover:border-indigo-300 transition-all cursor-pointer" onClick={() => handleSendMessage(preset.prompt)}>
                <span className="text-xs font-medium text-slate-700 truncate">{preset.name}</span>
                <button onClick={(e) => deletePreset(preset.id, e)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 bg-white flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center space-x-3 overflow-hidden">
            <button 
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            >
              <Menu size={20} />
            </button>
            <div className="overflow-hidden">
              <h3 className="font-bold text-slate-800 truncate">
                {files.length > 0 ? `${files.length} Documenti caricati` : 'Analisi Documenti'}
              </h3>
              {files.length > 0 && (
                <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1">
                  {files.map((f, i) => (
                    <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 border border-slate-200 text-slate-600 whitespace-nowrap">
                      {f.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {files.length > 0 && messages.length > 0 && (
              <button 
                onClick={() => exportToPdf()} 
                className="flex items-center space-x-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-xs font-bold shadow-sm"
                title="Esporta l'intera conversazione in PDF"
              >
                <Download size={16} />
                <span className="hidden sm:inline">Esporta Report</span>
              </button>
            )}
            {files.length > 0 && (
              <button onClick={saveAsPreset} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Salva come Preset">
                <Save size={18} />
              </button>
            )}
            <button 
              onClick={() => document.getElementById('add-more-files')?.click()}
              className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title="Aggiungi file"
            >
              <Plus size={20} />
              <input id="add-more-files" type="file" multiple accept="application/pdf" className="hidden" onChange={(e) => e.target.files && handleFilesSelected(Array.from(e.target.files))} />
            </button>
          </div>
        </div>

        {/* Chat Content */}
        <div className="flex-1 overflow-hidden relative flex flex-col">
          {files.length === 0 && messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-6">
              <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600">
                <FileSearch size={40} />
              </div>
              <div className="max-w-md">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Pronto ad analizzare?</h2>
                <p className="text-slate-500 mb-8">Carica i tuoi PDF per iniziare una nuova sessione di analisi intelligente.</p>
                <Dropzone onFilesSelected={handleFilesSelected} />
              </div>
            </div>
          ) : (
            <>
              <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4`}>
                    <div className={`flex max-w-[80%] space-x-4 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'}`}>
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-primary-600 text-white' : 'bg-indigo-100 text-indigo-600'}`}>
                        {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                      </div>
                      <div className={`p-5 rounded-3xl shadow-sm relative group/msg ${msg.role === 'user' ? 'bg-primary-600 text-white rounded-tr-none' : 'bg-slate-50 text-slate-800 border border-slate-100 rounded-tl-none'}`}>
                        <div className="prose prose-sm max-w-none">
                          <div className={msg.role === 'user' ? 'text-white' : 'markdown-body'}>
                            <Markdown remarkPlugins={[remarkGfm]}>{msg.text}</Markdown>
                          </div>
                        </div>
                        {msg.role === 'model' && (
                          <div className="mt-4 pt-4 border-t border-slate-200/50 flex justify-end">
                            <button 
                              onClick={() => exportToPdf(msg)}
                              className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm text-indigo-600 hover:bg-indigo-50 transition-all text-xs font-bold"
                              title="Esporta solo questa risposta in PDF"
                            >
                              <Download size={14} />
                              <span>Esporta Risposta</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {status.isProcessing && (
                  <div className="flex justify-start animate-pulse">
                    <div className="flex space-x-4">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-400 flex items-center justify-center">
                        <Loader2 size={20} className="animate-spin" />
                      </div>
                      <div className="bg-slate-50 border border-slate-100 text-slate-400 p-4 rounded-3xl rounded-tl-none text-sm italic">
                        {status.message || 'L\'AI sta pensando...'}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Action Buttons Overlay removed - moved to header */}
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="p-6 bg-white border-t border-slate-100">
          <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={files.length > 0 ? "Chiedi all'AI di analizzare i documenti..." : "Carica dei file per iniziare..."}
              className="w-full pl-6 pr-16 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all shadow-inner"
              disabled={status.isProcessing || files.length === 0}
            />
            <button
              type="submit"
              disabled={!input.trim() || status.isProcessing || files.length === 0}
              className="absolute right-2 top-2 p-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary-500/20"
            >
              <Send size={20} />
            </button>
          </form>
          
          {/* Quick Presets Bar */}
          <div className="mt-4 flex items-center space-x-3 overflow-x-auto no-scrollbar pb-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Preset Rapidi:</span>
            {presets.slice(0, 3).map(preset => (
              <button 
                key={preset.id}
                onClick={() => handleSendMessage(preset.prompt)}
                disabled={status.isProcessing || files.length === 0}
                className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-lg text-xs font-medium transition-all whitespace-nowrap border border-transparent hover:border-indigo-100 disabled:opacity-50"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error Toast */}
      {status.error && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 p-4 bg-red-600 text-white rounded-2xl shadow-2xl flex items-center space-x-3 animate-in fade-in slide-in-from-top-4">
          <AlertCircle size={20} />
          <span className="text-sm font-medium">{status.error}</span>
          <button onClick={() => setStatus({ ...status, error: null })} className="p-1 hover:bg-white/20 rounded-lg">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};
