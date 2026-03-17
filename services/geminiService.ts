import { GoogleGenAI, Type } from "@google/genai";

export interface SplitPlan {
  name: string;
  startPage: number;
  endPage: number;
}

const getApiKey = () => {
  // @ts-ignore - import.meta.env is provided by Vite
  const key = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key || key === 'dummy-key') return null;
  return key;
};

export async function suggestSplitCriteria(pagesText: { page: number, text: string }[]): Promise<string[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY_MISSING: La chiave API di Gemini non è configurata.");
  }

  const ai = new GoogleGenAI({ apiKey });
  // We only send a sample of pages to save tokens and speed up suggestion
  const sampleText = pagesText.slice(0, 5).map(p => `--- Pagina ${p.page} ---\n${p.text}`).join('\n\n');

  const prompt = `
    Analizza questo estratto di un documento PDF e suggerisci 3-4 modi logici per dividerlo in singoli file.
    Esempi: "Per Dipendente", "Per Mese", "Per Cliente", "Per Numero Fattura".
    
    Restituisci solo un array JSON di stringhe brevi.
    
    Testo estratto:
    ${sampleText}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  return JSON.parse(response.text || '[]');
}

export async function analyzePdfSplits(pagesText: { page: number, text: string }[], splitCriteria: string): Promise<SplitPlan[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY_MISSING: La chiave API di Gemini non è configurata.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `
    Analizza il seguente testo estratto da un documento PDF multi-pagina.
    Il tuo compito è dividere il documento seguendo questo criterio: ${splitCriteria}.
    Identifica dove inizia e dove finisce ogni singola sezione basandoti sul criterio scelto.
    
    Restituisci un array JSON di oggetti, dove ogni oggetto ha:
    - name: Un nome descrittivo per il file (es. il nome del dipendente, il mese, o il numero fattura).
    - startPage: Il numero della pagina iniziale (base 1).
    - endPage: Il numero della pagina finale (base 1).
    
    Ecco il testo per pagina:
    ${pagesText.map(p => `--- Pagina ${p.page} ---\n${p.text}`).join('\n\n')}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Full name of the person" },
            startPage: { type: Type.INTEGER, description: "Starting page number" },
            endPage: { type: Type.INTEGER, description: "Ending page number" }
          },
          required: ["name", "startPage", "endPage"]
        }
      }
    }
  });

  return JSON.parse(response.text || '[]');
}

export async function explainSplitLogic(pagesText: { page: number, text: string }[], splitCriteria: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY_MISSING: La chiave API di Gemini non è configurata.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const sampleText = pagesText.slice(0, 5).map(p => `--- Pagina ${p.page} ---\n${p.text}`).join('\n\n');

  const prompt = `
    Analizza questo estratto di un documento PDF e spiega brevemente come intendi dividerlo seguendo questo criterio: "${splitCriteria}".
    
    La tua spiegazione deve:
    1. Confermare cosa hai identificato come "separatore" tra un documento e l'altro (es. cambio di nome, cambio di codice fiscale, nuova intestazione).
    2. Fornire un esempio di come nominerai i file.
    3. Rassicurare l'utente sulla logica che seguirai.
    
    Sii conciso e professionale. Usa il grassetto per i punti chiave.
    
    Testo estratto:
    ${sampleText}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });

  return response.text || 'Non è stato possibile generare una spiegazione.';
}

export async function chatWithPdf(pagesText: { page: number, text: string }[], userMessage: string, chatHistory: { role: 'user' | 'model', text: string }[]): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY_MISSING: La chiave API di Gemini non è configurata.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Prepare context from PDF text
  const pdfContext = pagesText.map(p => `[Pagina ${p.page}]\n${p.text}`).join('\n\n');
  
  const systemInstruction = `
    Sei un assistente esperto nell'analisi di documenti PDF. 
    Ti viene fornito il testo estratto da un documento. 
    Il tuo compito è rispondere alle domande dell'utente basandoti esclusivamente sul testo fornito.
    Se l'utente chiede calcoli (es. somme di litri o euro), falli accuratamente estraendo i dati dal testo.
    Se i dati non sono presenti, dillo chiaramente.
    Rispondi in modo professionale e strutturato, usando Markdown se necessario (tabelle, grassetto, liste).
    
    TESTO DEL DOCUMENTO:
    ${pdfContext}
    
    IMPORTANTE: Non puoi generare file scaricabili o link a file direttamente. 
    Se l'utente ti chiede di creare un PDF o un file scaricabile, rispondi che hai elaborato i dati e che può scaricare il report cliccando sul pulsante "Esporta Report PDF" presente nell'interfaccia dell'applicazione.
  `;

  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: systemInstruction,
    },
    history: chatHistory.map(h => ({
      role: h.role,
      parts: [{ text: h.text }]
    }))
  });

  const response = await chat.sendMessage({
    message: userMessage
  });

  return response.text || "Non sono riuscito a generare una risposta.";
}
