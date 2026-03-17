import React, { useState, useRef, useEffect } from 'react';
import { ProcessingState, ChatMessage, ChatSession, PromptPreset } from '../types';
import { Dropzone } from './Dropzone';
import { extractTextFromPdf } from '../utils/pdfExtractor';
import { chatWithPdf, generateChatTitle } from '../services/geminiService';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  db, 
  auth, 
  googleProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  onSnapshot,
  User
} from '../firebase';
import { 
  FileText, 
  Loader2, 
  AlertCircle, 
  Send, 
  User as UserIcon, 
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
  MessageSquare,
  Copy,
  Edit2,
  Square,
  LogOut,
  LogIn
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
  const [newPresetPrompt, setNewPresetPrompt] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [status, setStatus] = useState<ProcessingState>({ isProcessing: false, message: '', error: null });
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Sync - Sessions
  useEffect(() => {
    if (!user || !isAuthReady) {
      setSessions([]);
      return;
    }

    const q = query(collection(db, 'sessions'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => d.data() as ChatSession);
      setSessions(docs.sort((a, b) => b.timestamp - a.timestamp));
    }, (error) => {
      console.error("Firestore Sessions Error:", error);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  // Firestore Sync - Presets
  useEffect(() => {
    if (!user || !isAuthReady) {
      // Fallback to defaults if not logged in
      const defaultPresets: PromptPreset[] = [
        { id: '1', userId: 'system', name: 'Analisi Carburante', prompt: 'Dividi i rifornimenti per targa e dammi i totali in litri ed euro (comprensivi di IVA). Non tenere conto dell\'AdBlue.' },
        { id: '2', userId: 'system', name: 'Riassunto Esecutivo', prompt: 'Fai un riassunto dei dati principali di tutti i file in una tabella strutturata.' },
        { id: '3', userId: 'system', name: 'Estrazione Totali', prompt: 'Estrai tutti i totali in euro suddivisi per file e calcola il totale generale.' }
      ];
      setPresets(defaultPresets);
      return;
    }

    const q = query(collection(db, 'presets'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => d.data() as PromptPreset);
      setPresets(docs);
    }, (error) => {
      console.error("Firestore Presets Error:", error);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setStatus({ ...status, error: `Login fallito: ${err.message}` });
    }
  };

  const handleLogout = () => auth.signOut();

  // Update current session in history
  useEffect(() => {
    if (messages.length > 0 && user) {
      const existingIdx = sessions.findIndex(s => s.id === currentSessionId);
      
      let title = 'Nuova Chat';
      if (existingIdx >= 0) {
        title = sessions[existingIdx].title;
      } else {
        const userMsg = messages.find(m => m.role === 'user');
        title = userMsg ? userMsg.text.slice(0, 30) + '...' : 'Nuova Chat';
      }
      
      const updatedSession: ChatSession = {
        id: currentSessionId,
        userId: user.uid,
        title,
        messages,
        timestamp: Date.now(),
        fileNames: files.map(f => f.name)
      };
      
      setDoc(doc(db, 'sessions', currentSessionId), updatedSession).catch(err => {
        console.error("Error saving session:", err);
      });
    }
    scrollToBottom();
  }, [messages, currentSessionId, files, user]);

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

    // Initialize AbortController
    abortControllerRef.current = new AbortController();

    try {
      const contextText = pagesText.map(p => ({ page: p.page, text: `[File: ${p.fileName}, Pagina: ${p.page}]\n${p.text}` }));
      const response = await chatWithPdf(contextText, userMessage, messages, abortControllerRef.current.signal);
      
      // Generate title if it's the first exchange
      if (messages.length === 0) {
        generateChatTitle(userMessage, response).then(title => {
          if (user) {
            updateDoc(doc(db, 'sessions', currentSessionId), { title }).catch(err => {
              console.error("Error updating title:", err);
            });
          }
        });
      }
      
      setMessages(prev => [...prev, { role: 'model', text: response }]);
      setStatus({ isProcessing: false, message: '', error: null });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setStatus({ isProcessing: false, message: '', error: 'Elaborazione interrotta dall\'utente.' });
      } else {
        console.error(err);
        setStatus({ isProcessing: false, message: '', error: `Errore: ${err.message}` });
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleStopProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
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
    if (user) {
      deleteDoc(doc(db, 'sessions', id)).catch(err => {
        console.error("Error deleting session:", err);
      });
    }
    if (currentSessionId === id) {
      startNewChat();
    }
  };

  const saveAsPreset = () => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;
    setNewPresetName('Analisi Personalizzata');
    setNewPresetPrompt(lastUserMsg.text);
    setEditingPresetId(null);
    setShowPresetModal(true);
  };

  const openEditPreset = (preset: PromptPreset, e: React.MouseEvent) => {
    e.stopPropagation();
    setNewPresetName(preset.name);
    setNewPresetPrompt(preset.prompt);
    setEditingPresetId(preset.id);
    setShowPresetModal(true);
  };

  const duplicatePreset = (preset: PromptPreset, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    const newPreset: PromptPreset = {
      ...preset,
      id: crypto.randomUUID(),
      userId: user.uid,
      name: `${preset.name} (Copia)`
    };
    setDoc(doc(db, 'presets', newPreset.id), newPreset).catch(err => {
      console.error("Error duplicating preset:", err);
    });
  };

  const confirmSavePreset = () => {
    if (!newPresetName.trim() || !newPresetPrompt.trim() || !user) return;

    if (editingPresetId) {
      updateDoc(doc(db, 'presets', editingPresetId), { 
        name: newPresetName.trim(), 
        prompt: newPresetPrompt.trim() 
      }).catch(err => {
        console.error("Error updating preset:", err);
      });
    } else {
      const newPreset: PromptPreset = {
        id: crypto.randomUUID(),
        userId: user.uid,
        name: newPresetName.trim(),
        prompt: newPresetPrompt.trim()
      };
      setDoc(doc(db, 'presets', newPreset.id), newPreset).catch(err => {
        console.error("Error saving preset:", err);
      });
    }
    
    setShowPresetModal(false);
    setEditingPresetId(null);
    setNewPresetName('');
    setNewPresetPrompt('');
  };

  const deletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (user) {
      deleteDoc(doc(db, 'presets', id)).catch(err => {
        console.error("Error deleting preset:", err);
      });
    }
  };

  const exportToPdf = async (specificMessage?: ChatMessage) => {
    const targetElement = chatContainerRef.current;
    if (!targetElement || messages.length === 0) return;
    
    setStatus({ isProcessing: true, message: 'Generazione documento in corso...', error: null });
    
    try {
      // Create a temporary container for the PDF export
      const exportContainer = document.createElement('div');
      exportContainer.className = 'pdf-export-container';
      // Position it at the very top left of the document to ensure correct coordinate capture
      exportContainer.style.position = 'absolute';
      exportContainer.style.left = '0';
      exportContainer.style.top = '0';
      exportContainer.style.width = '800px';
      exportContainer.style.maxHeight = 'none';
      exportContainer.style.overflow = 'visible';
      exportContainer.style.zIndex = '-9999';
      exportContainer.style.pointerEvents = 'none';
      exportContainer.style.backgroundColor = 'white';
      exportContainer.style.padding = '40px';
      exportContainer.style.boxSizing = 'border-box';
      exportContainer.style.visibility = 'hidden';
      
      // Global styles for the export container
      const styleTag = document.createElement('style');
      styleTag.innerHTML = `
        .pdf-export-container * { box-sizing: border-box !important; }
        .pdf-export-container .markdown-body { font-size: 11pt !important; line-height: 1.5 !important; }
        .pdf-export-container table { width: 100% !important; border-collapse: collapse !important; margin: 15px 0 !important; table-layout: fixed !important; page-break-inside: auto !important; }
        .pdf-export-container tr { page-break-inside: avoid !important; page-break-after: auto !important; }
        .pdf-export-container thead { display: table-header-group !important; }
        .pdf-export-container th, .pdf-export-container td { border: 1px solid #e2e8f0 !important; padding: 8px !important; word-break: break-word !important; font-size: 9pt !important; }
        .pdf-export-container th { background-color: #f8fafc !important; }
        .pdf-export-container pre { white-space: pre-wrap !important; word-break: break-all !important; background: #f1f5f9 !important; padding: 10px !important; border-radius: 5px !important; }
        .pdf-export-container p, .pdf-export-container li { word-break: break-word !important; }
        .pdf-export-container .report-section { page-break-inside: avoid !important; margin-bottom: 25px !important; }
      `;
      exportContainer.appendChild(styleTag);
      
      // Add a professional header
      const header = document.createElement('div');
      header.style.borderBottom = '2px solid #1e293b';
      header.style.marginBottom = '30px';
      header.style.paddingBottom = '15px';
      header.style.fontFamily = 'sans-serif';
      header.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 style="margin: 0; font-size: 24pt; font-weight: 800; color: #1e293b;">REPORT ANALISI</h1>
            <div style="margin-top: 5px; font-size: 10pt; color: #64748b;">Documento generato tramite PDF Master AI</div>
          </div>
          <div style="text-align: right; font-size: 10pt; color: #1e293b;">
            <div style="font-weight: bold;">Data: ${new Date().toLocaleDateString('it-IT')}</div>
            <div>Ora: ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
        <div style="margin-top: 20px; font-size: 9pt; color: #475569; line-height: 1.4; word-break: break-all;">
          ${files.length > 0 ? `<strong>File analizzati:</strong> ${files.map(f => f.name).join(', ')}` : ''}
        </div>
      `;
      exportContainer.appendChild(header);

      const contentWrapper = document.createElement('div');
      contentWrapper.style.fontFamily = 'sans-serif';
      
      if (specificMessage) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'markdown-body report-section';
        
        const originalMsgEl = targetElement.querySelectorAll('.animate-in')[messages.indexOf(specificMessage)];
        const markdownContent = originalMsgEl?.querySelector('.markdown-body')?.cloneNode(true) as HTMLElement;
        
        if (markdownContent) {
          msgDiv.appendChild(markdownContent);
        } else {
          msgDiv.innerText = specificMessage.text;
        }
        contentWrapper.appendChild(msgDiv);
      } else {
        messages.forEach((msg, idx) => {
          const section = document.createElement('div');
          section.className = 'report-section';
          
          const label = document.createElement('div');
          label.style.fontSize = '9pt';
          label.style.fontWeight = '800';
          label.style.color = msg.role === 'user' ? '#4f46e5' : '#0f172a';
          label.style.borderLeft = `4px solid ${msg.role === 'user' ? '#4f46e5' : '#0f172a'}`;
          label.style.paddingLeft = '10px';
          label.style.marginBottom = '10px';
          label.innerText = msg.role === 'user' ? 'DOMANDA UTENTE' : 'ANALISI ASSISTENTE AI';
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

      // Apply strict table styles
      const tables = contentWrapper.querySelectorAll('table');
      tables.forEach((table: any) => {
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.margin = '20px 0';
        table.style.fontSize = '10pt';
        table.style.pageBreakInside = 'avoid';
        
        const cells = table.querySelectorAll('th, td');
        cells.forEach((cell: any) => {
          cell.style.border = '1px solid #e2e8f0';
          cell.style.padding = '10px';
        });
        
        const headers = table.querySelectorAll('th');
        headers.forEach((h: any) => {
          h.style.backgroundColor = '#f8fafc';
          h.style.color = '#1e293b';
          h.style.textAlign = 'left';
        });
      });

      exportContainer.appendChild(contentWrapper);
      document.body.appendChild(exportContainer);

      // Crucial: wait for browser to actually paint the hidden element
      await new Promise(resolve => setTimeout(resolve, 1500));

      const pdf = new jsPDF('p', 'mm', 'a4');
      const session = sessions.find(s => s.id === currentSessionId);
      const fileName = specificMessage 
        ? `Risposta_AI_${new Date().getTime()}.pdf` 
        : `${session?.title.replace(/[^a-z0-9]/gi, '_') || 'Report'}_${new Date().getTime()}.pdf`;

      // Make it temporarily visible for capture
      exportContainer.style.visibility = 'visible';

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
        autoPaging: 'slice'
      });
    } catch (err: any) {
      console.error(err);
      setStatus({ isProcessing: false, message: '', error: `Errore export: ${err.message}` });
      const container = document.querySelector('.pdf-export-container');
      if (container) document.body.removeChild(container);
    }
  };

  const formatError = (error: string) => {
    if (error.includes('429') || error.toLowerCase().includes('quota')) {
      return "Limite messaggi raggiunto per questo modello. Ho ripristinato il modello standard per permetterti di continuare. Riprova ora.";
    }
    if (error.includes('503') || error.toLowerCase().includes('high demand')) {
      return "I server di Google sono temporaneamente sovraccarichi. Attendi 10 secondi e riprova a inviare il messaggio.";
    }
    return error;
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
              <div key={preset.id} className="group flex flex-col bg-white p-2 rounded-lg border border-slate-200 hover:border-indigo-300 transition-all cursor-pointer" onClick={() => handleSendMessage(preset.prompt)}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700 truncate flex-1">{preset.name}</span>
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={(e) => duplicatePreset(preset, e)} title="Duplica" className="p-1 text-slate-400 hover:text-indigo-500">
                      <Copy size={12} />
                    </button>
                    <button onClick={(e) => openEditPreset(preset, e)} title="Modifica Nome" className="p-1 text-slate-400 hover:text-indigo-500">
                      <Edit2 size={12} />
                    </button>
                    <button onClick={(e) => deletePreset(preset.id, e)} title="Elimina" className="p-1 text-slate-400 hover:text-red-500">
                      <X size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* User Profile Section */}
        <div className="p-4 border-t border-slate-200 bg-white">
          {user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 overflow-hidden">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-slate-200" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <UserIcon size={16} />
                  </div>
                )}
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-slate-800 truncate">{user.displayName || 'Utente'}</p>
                  <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="w-full flex items-center justify-center space-x-2 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all text-sm font-bold shadow-sm"
            >
              <LogIn size={16} />
              <span>Accedi con Google</span>
            </button>
          )}
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
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-center space-y-4">
              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-indigo-500">
                <FileSearch size={32} />
              </div>
              <div className="max-w-md">
                <h2 className="text-xl font-bold text-slate-800 mb-1">Pronto ad analizzare?</h2>
                <p className="text-xs text-slate-500 mb-4">Carica i tuoi PDF per iniziare una nuova sessione di analisi intelligente.</p>
                <div className="scale-90 origin-top">
                  <Dropzone onFilesSelected={handleFilesSelected} />
                </div>
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
                        {msg.role === 'user' ? <UserIcon size={16} /> : <Bot size={16} />}
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
              className={`w-full pl-6 ${status.isProcessing ? 'pr-32' : 'pr-16'} py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all shadow-inner`}
              disabled={status.isProcessing || files.length === 0}
            />
            <button
              type="submit"
              disabled={!input.trim() || status.isProcessing || files.length === 0}
              className="absolute right-2 top-2 p-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary-500/20"
            >
              <Send size={20} />
            </button>
            
            {status.isProcessing && (
              <button
                type="button"
                onClick={handleStopProcessing}
                className="absolute right-16 top-2 p-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all shadow-lg shadow-red-500/20 flex items-center space-x-2"
                title="Ferma elaborazione"
              >
                <Square size={20} fill="currentColor" />
                <span className="text-xs font-bold pr-1">STOP</span>
              </button>
            )}
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
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 p-4 bg-red-600 text-white rounded-2xl shadow-2xl flex items-center space-x-3 animate-in fade-in slide-in-from-top-4 max-w-lg">
          <AlertCircle size={20} className="flex-shrink-0" />
          <span className="text-sm font-medium">{formatError(status.error)}</span>
          <button onClick={() => setStatus({ ...status, error: null })} className="p-1 hover:bg-white/20 rounded-lg flex-shrink-0">
            <X size={16} />
          </button>
        </div>
      )}
      {/* Preset Modal */}
      {showPresetModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800">
                {editingPresetId ? 'Modifica Preset' : 'Salva come Preset'}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                {editingPresetId 
                  ? 'Modifica il nome del tuo preset salvato.' 
                  : 'Dai un nome a questa richiesta per riutilizzarla velocemente in futuro.'}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
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
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Istruzioni (Prompt)</label>
                <textarea 
                  value={newPresetPrompt}
                  onChange={(e) => setNewPresetPrompt(e.target.value)}
                  placeholder="Inserisci le istruzioni per l'AI..."
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none text-sm"
                />
              </div>
            </div>
            <div className="p-6 bg-slate-50 rounded-b-2xl flex justify-end space-x-3">
              <button 
                onClick={() => {
                  setShowPresetModal(false);
                  setEditingPresetId(null);
                }}
                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors"
              >
                Annulla
              </button>
              <button 
                onClick={confirmSavePreset}
                disabled={!newPresetName.trim() || !newPresetPrompt.trim()}
                className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingPresetId ? 'Aggiorna Preset' : 'Salva Preset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
