import React, { useState, useCallback } from 'react';
import { UploadedFile, ProcessingState } from '../types';
import { Dropzone } from './Dropzone';
import { extractTextFromPdf } from '../utils/pdfExtractor';
import { analyzePdfSplits, SplitPlan } from '../services/geminiService';
import { splitAndDownloadPdf } from '../utils/pdfSplitter';
import { FileText, Loader2, Download, AlertCircle, Edit2, Check, X } from 'lucide-react';

export const SplitView: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [splitPlans, setSplitPlans] = useState<SplitPlan[]>([]);
  const [status, setStatus] = useState<ProcessingState>({
    isProcessing: false,
    message: '',
    error: null,
  });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editPlan, setEditPlan] = useState<SplitPlan | null>(null);

  const handleFilesSelected = async (newFiles: File[]) => {
    const pdfFile = newFiles.find(f => f.type === 'application/pdf');
    if (!pdfFile) {
      setStatus({ ...status, error: 'Please select a PDF file.' });
      return;
    }
    setFile(pdfFile);
    setStatus({ isProcessing: true, message: 'Extracting text from PDF...', error: null });

    try {
      const pagesText = await extractTextFromPdf(pdfFile);
      setStatus({ isProcessing: true, message: 'Analyzing document structure with AI...', error: null });
      
      const plans = await analyzePdfSplits(pagesText);
      setSplitPlans(plans);
      setStatus({ isProcessing: false, message: '', error: null });
    } catch (err) {
      console.error(err);
      setStatus({ isProcessing: false, message: '', error: 'Failed to analyze PDF. Please try again.' });
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
      {!file && (
        <Dropzone 
          onFilesSelected={handleFilesSelected} 
          disabled={status.isProcessing}
        />
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

      {file && !status.isProcessing && splitPlans.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Proposed Split Plan</h2>
              <p className="text-sm text-slate-500 mt-1">Review the recognized documents and adjust if necessary.</p>
            </div>
            <button
              onClick={() => {
                setFile(null);
                setSplitPlans([]);
              }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Start Over
            </button>
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
                      placeholder="Document Name"
                    />
                    <div className="flex items-center space-x-2">
                      <label className="text-sm text-slate-500">Pages:</label>
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
                          Pages {plan.startPage} to {plan.endPage} ({plan.endPage - plan.startPage + 1} pages)
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
              <span>Confirm & Download ZIP</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
