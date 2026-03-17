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
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [showPresets, setShowPresets] = useState(false);
  
  const [status, setStatus] = useState<ProcessingState>({ isProcessing: false, message: '', error: null });
  
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
        
        let title = 'Nuova Chat';
        if (existingIdx >= 0) {
          title = prev[existingIdx].title;
        } else {
          const userMsg = messages.find(m => m.role === 'user');
          title = userMsg ? userMsg.text.slice(0, 30) + '...' : 'Nuova Chat';
        }
        
        const updatedSession: ChatSession = {
          id: currentSessionId,
          title,
          messages,
          timestamp: Date.now(),
          fileNames: files.map(f => f.name)
        };
        
        let newSessions;
        if (existingIdx >= 0) {
          newSessions = [...prev];
          newSessions[existingIdx] = updatedSession;
        } else {
          newSessions = [updatedSession, ...prev];
        }
        localStorage.setItem('pdf_master_sessions', JSON.stringify(newSessions));
        return newSessions;
      });
    }
    scrollToBottom();
  }, [messages, currentSessionId, files]);

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
    setNewPresetName('Analisi Personalizzata');
    setShowPresetModal(true);
  };

  const confirmSavePreset = () => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg || !newPresetName.trim()) return;

    const newPreset: PromptPreset = {
      id: crypto.randomUUID(),
      name: newPresetName.trim(),
      prompt: lastUserMsg.text
    };
    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    localStorage.setItem('pdf_master_presets', JSON.stringify(updatedPresets));
    setShowPresetModal(false);
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
    
    setStatus({ isProcessing: true, message: 'Preparazione report PDF professionale...', error: null });
    
    try {
      // Create a temporary container for the PDF export
      const exportContainer = document.createElement('div');
      exportContainer.className = 'pdf-export-container';
      exportContainer.style.position = 'absolute';
      exportContainer.style.left = '-9999px';
      exportContainer.style.top = '0';
      exportContainer.style.width = '190mm'; // Standard content width for A4
      exportContainer.style.backgroundColor = 'white';
      exportContainer.style.padding = '10mm';
      
      // Add a professional header
      const header = document.createElement('div');
      header.style.borderBottom = '1px solid #000';
      header.style.marginBottom = '30px';
      header.style.paddingBottom = '10px';
      header.innerHTML = `
        <div style="display: flex; justify-between; align-items: center;">
          <h1 style="margin: 0; font-size: 24pt; font-weight: bold; color: #000;">REPORT ANALISI</h1>
          <div style="text-align: right; font-size: 10pt; color: #666;">
            <div>Data: ${new Date().toLocaleDateString('it-IT')}</div>
            <div>Ora: ${new Date().toLocaleTimeString('it-IT')}</div>
          </div>
        </div>
        <div style="margin-top: 10px; font-size: 9pt; color: #444;">
          ${files.length > 0 ? `<strong>Documenti sorgente:</strong> ${files.map(f => f.name).join(', ')}` : ''}
        </div>
      `;
      exportContainer.appendChild(header);

      const contentWrapper = document.createElement('div');
      
      if (specificMessage) {
        // Export only one message
        const msgDiv = document.createElement('div');
        msgDiv.className = 'markdown-body';
        
        // Find the original markdown content to avoid cloning UI elements
        const originalMsgEl = targetElement.querySelectorAll('.animate-in')[messages.indexOf(specificMessage)];
        const markdownContent = originalMsgEl?.querySelector('.markdown-body')?.cloneNode(true) as HTMLElement;
        
        if (markdownContent) {
          msgDiv.appendChild(markdownContent);
        } else {
          msgDiv.innerText = specificMessage.text;
        }
        contentWrapper.appendChild(msgDiv);
      } else {
        // Export full conversation
        messages.forEach((msg, idx) => {
          const section = document.createElement('div');
          section.style.marginBottom = '25px';
          section.style.pageBreakInside = 'avoid';
          
          const label = document.createElement('div');
          label.style.fontSize = '8pt';
          label.style.fontWeight = 'bold';
          label.style.textTransform = 'uppercase';
          label.style.color = '#888';
          label.style.marginBottom = '5px';
          label.innerText = msg.role === 'user' ? 'UTENTE' : 'ASSISTENTE AI';
          section.appendChild(label);
          
          const msgDiv = document.createElement('div');
          msgDiv.className = 'markdown-body';
          
          const originalMsgEl = targetElement.querySelectorAll('.animate-in')[idx];
          const markdownContent = originalMsgEl?.querySelector('.markdown-body')?.cloneNode(true) as HTMLElement;
          
          if (markdownContent) {
            msgDiv.appendChild(markdownContent);
          } else {
            msgDiv.innerText = msg.text;
          }
          section.appendChild(msgDiv);
          contentWrapper.appendChild(section);
        });
      }

      // Apply strict table styles to the export container
      const tables = contentWrapper.querySelectorAll('table');
      tables.forEach((table: any) => {
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.marginBottom = '20px';
        table.style.pageBreakInside = 'avoid'; // Prevent table from splitting
        
        const cells = table.querySelectorAll('th, td');
        cells.forEach((cell: any) => {
          cell.style.border = '1px solid #ccc';
          cell.style.padding = '8px';
          cell.style.fontSize = '10pt';
        });
        
        const headers = table.querySelectorAll('th');
        headers.forEach((h: any) => {
          h.style.backgroundColor = '#f0f0f0';
          h.style.fontWeight = 'bold';
        });
      });

      exportContainer.appendChild(contentWrapper);
      document.body.appendChild(exportContainer);

      // Wait for any potential rendering
      await new Promise(resolve => setTimeout(resolve, 1000));

      const pdf = new jsPDF('p', 'mm', 'a4');
      const session = sessions.find(s => s.id === currentSessionId);
      const fileName = specificMessage 
        ? `Risposta_AI_${new Date().getTime()}.pdf` 
        : `${session?.title.replace(/[^a-z0-9]/gi, '_') || 'Report'}_${new Date().getTime()}.pdf`;

      await pdf.html(exportContainer, {
        callback: (doc) => {
          doc.save(fileName);
          setStatus({ isProcessing: false, message: '', error: null });
          if (document.body.contains(exportContainer)) {
            document.body.removeChild(exportContainer);
          }
        },
        x: 10,
        y: 10,
        width: 190,
        windowWidth: 800,
        autoPaging: 'text'
      });
    } catch (err: any) {
      console.error(err);
      setStatus({ isProcessing: false, message: '', error: `Errore export: ${err.message}` });
      const container = document.querySelector('.pdf-export-container');
      if (container) document.body.removeChild(container);
    }
  };

  return (
    <div className="flex h-[calc(100vh-140px)] bg-slate-100/30 rounded-3xl border border-slate-200 shadow-xl overflow-hidden relative">
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
                className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-xs font-bold shadow-sm border border-indigo-500"
                title="Esporta conversazione"
              >
                <Download size={14} />
                <span className="hidden md:inline">Esporta Report</span>
              </button>
            )}
            {files.length > 0 && (
              <button 
                onClick={saveAsPreset} 
                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-200" 
                title="Salva come preset rapido"
              >
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
        <div className="flex-1 overflow-hidden relative flex flex-col bg-slate-50/50">
          {files.length === 0 && messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-6">
              <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center text-indigo-500">
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
              <div 
                ref={chatContainerRef} 
                className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth custom-scrollbar"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}
              >
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4`}>
                    <div className={`flex max-w-[85%] space-x-3 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'}`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-primary-600 text-white' : 'bg-indigo-100 text-indigo-600'}`}>
                        {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                      </div>
                      <div className={`p-4 rounded-2xl shadow-sm relative group/msg ${msg.role === 'user' ? 'bg-primary-600 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'}`}>
                        <div className="prose prose-sm max-w-none">
                          <div className={msg.role === 'user' ? 'text-white' : 'markdown-body'}>
                            <Markdown remarkPlugins={[remarkGfm]}>{msg.text}</Markdown>
                          </div>
                        </div>
                        {msg.role === 'model' && (
                          <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                            <button 
                              onClick={() => exportToPdf(msg)}
                              className="flex items-center space-x-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-indigo-600 hover:bg-indigo-100 transition-all text-[10px] font-bold"
                              title="Esporta questa risposta"
                            >
                              <Download size={12} />
                              <span>Esporta Risposta</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {status.isProcessing && (
                  <div className="flex justify-start animate-in fade-in duration-300">
                    <div className="flex space-x-3">
                      <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center animate-pulse">
                        <Bot size={16} />
                      </div>
                      <div className="bg-white border border-slate-100 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center space-x-3">
                        <Loader2 size={16} className="animate-spin text-indigo-600" />
                        <span className="text-sm text-slate-500">{status.message || 'L\'AI sta pensando...'}</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
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
      {/* Preset Modal */}
      {showPresetModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">Salva come Preset</h3>
              <p className="text-sm text-slate-500 mt-1">Dai un nome a questa richiesta per riutilizzarla velocemente in futuro.</p>
            </div>
            <div className="p-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">Nome Preset</label>
              <input 
                type="text" 
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="es. Analisi Carburanti Mensile"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                autoFocus
              />
            </div>
            <div className="p-6 bg-slate-50 rounded-b-2xl flex justify-end space-x-3">
              <button 
                onClick={() => setShowPresetModal(false)}
                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
              >
                Annulla
              </button>
              <button 
                onClick={confirmSavePreset}
                disabled={!newPresetName.trim()}
                className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Salva Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
