import React, { useState, useCallback } from 'react';
import { UploadedFile, ProcessingState } from '../types';
import { Dropzone } from './Dropzone';
import { extractTextFromPdf } from '../utils/pdfExtractor';
import { analyzePdfSplits, suggestSplitCriteria, explainSplitLogic, SplitPlan } from '../services/geminiService';
import { splitAndDownloadPdf } from '../utils/pdfSplitter';
import { FileText, Loader2, Download, AlertCircle, Edit2, Check, X, Sparkles, ArrowRight, MessageSquare, Play } from 'lucide-react';
import Markdown from 'react-markdown';

export const SplitView: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [pagesText, setPagesText] = useState<{ page: number, text: string }[]>([]);
  const [splitPlans, setSplitPlans] = useState<SplitPlan[]>([]);
  const [status, setStatus] = useState<ProcessingState>({
    isProcessing: false,
    message: '',
    error: null,
  });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editPlan, setEditPlan] = useState<SplitPlan | null>(null);
  const [docDescription, setDocDescription] = useState<string>('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [explanation, setExplanation] = useState<string>('');
  const [selectedCriteria, setSelectedCriteria] = useState<string>('');
  const [step, setStep] = useState<'upload' | 'criteria' | 'explanation' | 'review'>('upload');

  const reset = () => {
    setFile(null);
    setPagesText([]);
    setSplitPlans([]);
    setStatus({
      isProcessing: false,
      message: '',
      error: null,
    });
    setEditingIndex(null);
    setEditPlan(null);
    setDocDescription('');
    setSuggestions([]);
    setExplanation('');
    setSelectedCriteria('');
    setStep('upload');
  };

  const handleFilesSelected = async (newFiles: File[]) => {
    const pdfFile = newFiles.find(f => f.type === 'application/pdf');
    if (!pdfFile) {
      setStatus({ ...status, error: 'Per favore seleziona un file PDF.' });
      return;
    }
    
    setFile(pdfFile);
    setStatus({ isProcessing: true, message: 'Lettura del PDF in corso...', error: null });

    try {
      const extractedText = await extractTextFromPdf(pdfFile);
      const totalTextLength = extractedText.reduce((acc, curr) => acc + curr.text.trim().length, 0);
      
      if (totalTextLength === 0) {
        setStatus({ isProcessing: false, message: '', error: 'Il PDF sembra vuoto o composto solo da immagini. L\'AI ha bisogno di testo leggibile.' });
        return;
      }

      setPagesText(extractedText);
      setStatus({ isProcessing: true, message: 'L\'AI sta analizzando il contenuto per suggerire criteri di divisione...', error: null });
      
      const suggested = await suggestSplitCriteria(extractedText);
      setSuggestions(suggested);
      setStep('criteria');
      setStatus({ isProcessing: false, message: '', error: null });
    } catch (err: any) {
      console.error(err);
      setStatus({ isProcessing: false, message: '', error: `Errore durante la lettura: ${err.message}` });
    }
  };

  const startAnalysis = async (criteria: string) => {
    const finalCriteria = criteria || docDescription;
    if (!finalCriteria) return;
    
    setSelectedCriteria(finalCriteria);
    setStatus({ isProcessing: true, message: `L'AI sta preparando la strategia di divisione...`, error: null });

    try {
      const expl = await explainSplitLogic(pagesText, finalCriteria);
      setExplanation(expl);
      setStep('explanation');
      setStatus({ isProcessing: false, message: '', error: null });
    } catch (err: any) {
      console.error(err);
      setStatus({ isProcessing: false, message: '', error: `Errore durante la generazione della spiegazione: ${err.message}` });
    }
  };

  const confirmAndSplit = async () => {
    setStatus({ isProcessing: true, message: `Esecuzione divisione intelligente in corso...`, error: null });

    try {
      const plans = await analyzePdfSplits(pagesText, selectedCriteria);
      setSplitPlans(plans);
      setStep('review');
      setStatus({ isProcessing: false, message: '', error: null });
    } catch (err: any) {
      console.error(err);
      let displayError = err.message || 'Errore imprevisto durante l\'analisi.';
      if (displayError.includes('API_KEY_MISSING')) {
        displayError = "Chiave API mancante. Configura GEMINI_API_KEY su Vercel.";
      }
      setStatus({ isProcessing: false, message: '', error: displayError });
    }
  };

  const handleDownload = async () => {
    if (!file || splitPlans.length === 0) return;
    
    setStatus({ isProcessing: true, message: 'Generating and zipping PDFs...', error: null });
    try {
      await splitAndDownloadPdf(file, splitPlans);
      setStatus({ isProcessing: false, message: '', error: null });
    } catch (err) {
      console.error(err);
      setStatus({ isProcessing: false, message: '', error: 'Failed to generate PDFs.' });
    }
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditPlan({ ...splitPlans[index] });
  };

  const saveEdit = () => {
    if (editingIndex !== null && editPlan) {
      const newPlans = [...splitPlans];
      newPlans[editingIndex] = editPlan;
      setSplitPlans(newPlans);
      setEditingIndex(null);
      setEditPlan(null);
    }
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditPlan(null);
  };

  const removePlan = (index: number) => {
    const newPlans = [...splitPlans];
    newPlans.splice(index, 1);
    setSplitPlans(newPlans);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {(file || status.error) && (
        <div className="flex justify-end">
          <button
            onClick={reset}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
          >
            <X size={16} />
            <span>Annulla e Ricomincia</span>
          </button>
        </div>
      )}

      {step === 'upload' && !status.isProcessing && (
        <Dropzone 
          onFilesSelected={handleFilesSelected} 
          disabled={status.isProcessing}
        />
      )}

      {step === 'criteria' && !status.isProcessing && file && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600">
              <Sparkles size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Come vuoi dividere il documento?</h3>
              <p className="text-sm text-slate-500">L'AI ha analizzato il file e suggerisce questi criteri:</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => startAnalysis(s)}
                className="p-4 text-left border border-slate-200 rounded-xl hover:border-primary-500 hover:bg-primary-50 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700 group-hover:text-primary-700">{s}</span>
                  <ArrowRight size={16} className="text-slate-300 group-hover:text-primary-500 group-hover:translate-x-1 transition-all" />
                </div>
              </button>
            ))}
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-100"></span>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400">Oppure inserisci un criterio personalizzato</span>
            </div>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              value={docDescription}
              onChange={(e) => setDocDescription(e.target.value)}
              placeholder="es. Dividi per Numero di Pratica, Dividi ogni 2 pagine..."
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none transition-all"
            />
            <button
              onClick={() => startAnalysis(docDescription)}
              disabled={!docDescription}
              className="w-full py-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Usa criterio personalizzato
            </button>
          </div>
        </div>
      )}

      {step === 'explanation' && !status.isProcessing && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
              <MessageSquare size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Strategia di divisione</h3>
              <p className="text-sm text-slate-500">Ecco come l'AI intende procedere:</p>
            </div>
          </div>

          <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 prose prose-slate max-w-none">
            <div className="markdown-body">
              <Markdown>{explanation}</Markdown>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => setStep('criteria')}
              className="flex-1 py-4 px-6 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
            >
              Cambia criterio
            </button>
            <button
              onClick={confirmAndSplit}
              className="flex-1 py-4 px-6 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold shadow-lg shadow-primary-500/30 transition-all flex items-center justify-center space-x-2"
            >
              <Play size={20} />
              <span>Conferma e Procedi</span>
            </button>
          </div>
        </div>
      )}

      {status.error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-center text-red-600">
          <AlertCircle size={20} className="mr-2" />
          {status.error}
        </div>
      )}

      {status.isProcessing && (
        <div className="flex flex-col items-center justify-center py-12 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Loader2 size={48} className="text-primary-500 animate-spin mb-4" />
          <p className="text-lg font-medium text-slate-700">{status.message}</p>
        </div>
      )}

      {step === 'review' && !status.isProcessing && splitPlans.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-500">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-xl font-bold text-slate-800">Piano di divisione proposto</h2>
            <p className="text-sm text-slate-500 mt-1">Controlla i documenti identificati e apporta modifiche se necessario.</p>
          </div>

          <div className="divide-y divide-slate-100">
            {splitPlans.map((plan, index) => (
              <div key={index} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                {editingIndex === index && editPlan ? (
                  <div className="flex-1 flex items-center space-x-4">
                    <input
                      type="text"
                      value={editPlan.name}
                      onChange={(e) => setEditPlan({ ...editPlan, name: e.target.value })}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                      placeholder="Nome documento"
                    />
                    <div className="flex items-center space-x-2">
                      <label className="text-sm text-slate-500">Pagine:</label>
                      <input
                        type="number"
                        value={editPlan.startPage}
                        onChange={(e) => setEditPlan({ ...editPlan, startPage: parseInt(e.target.value) || 1 })}
                        className="w-16 px-2 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-center"
                      />
                      <span className="text-slate-400">-</span>
                      <input
                        type="number"
                        value={editPlan.endPage}
                        onChange={(e) => setEditPlan({ ...editPlan, endPage: parseInt(e.target.value) || 1 })}
                        className="w-16 px-2 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-center"
                      />
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <button onClick={saveEdit} className="p-2 text-green-600 hover:bg-green-50 rounded-lg">
                        <Check size={18} />
                      </button>
                      <button onClick={cancelEdit} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg">
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center text-primary-600">
                        <FileText size={20} />
                      </div>
                      <div>
                        <h3 className="font-medium text-slate-800">{plan.name}</h3>
                        <p className="text-sm text-slate-500">
                          Pagine da {plan.startPage} a {plan.endPage} ({plan.endPage - plan.startPage + 1} pagine)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => startEdit(index)}
                        className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => removePlan(index)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end">
            <button
              onClick={handleDownload}
              className="flex items-center space-x-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-bold shadow-lg shadow-primary-500/30 transition-all active:scale-95"
            >
              <Download size={20} />
              <span>Conferma e Scarica ZIP</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
