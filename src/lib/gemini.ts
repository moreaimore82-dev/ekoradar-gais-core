import { GoogleGenAI, Type, ThinkingLevel, Modality, FunctionDeclaration } from "@google/genai";

const getAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delay = 3000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const errorMessage = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    
    // Don't retry on hard quota errors (daily limit reached)
    const isHardQuotaError = errorMessage.includes("exceeded your current quota") || errorMessage.includes("check your plan and billing details");
    
    const isRetryable = !isHardQuotaError && (
      errorMessage.includes("429") || 
      errorMessage.includes("RESOURCE_EXHAUSTED") || 
      errorMessage.includes("500") ||
      errorMessage.includes("503") ||
      errorMessage.includes("fetch failed") ||
      errorMessage.includes("network error") ||
      error?.status === 429 ||
      error?.status === 500 ||
      error?.status === 503 ||
      error?.error?.code === 429 ||
      error?.error?.status === "RESOURCE_EXHAUSTED"
    );

    if (isRetryable && retries > 0) {
      // Add jitter to delay
      const jitter = Math.random() * 1000;
      const finalDelay = delay + jitter;
      console.log(`Rate limited or server error. Retrying in ${Math.round(finalDelay)}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, finalDelay));
      return withRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
};

const scrapeUrlTool: FunctionDeclaration = {
  name: "scrapeUrl",
  description: "Bir URL'yi ziyaret eder ve içeriğini (metin veya PDF) döndürür. Bu araç, JavaScript ile oluşturulan içerikleri ve PDF dosyalarını okuyabilir. Kaynak doğrulaması yaparken MUTLAKA bu aracı kullanmalısın.",
  parameters: {
    type: Type.OBJECT,
    description: "Ziyaret edilecek URL",
    properties: {
      url: {
        type: Type.STRING,
        description: "Ziyaret edilecek tam URL"
      }
    },
    required: ["url"]
  }
};

const scrapeUrl = async (url: string, scanType?: string, selectedDate?: string) => {
  try {
    const response = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, scanType, selectedDate })
    });
    if (!response.ok) return "Scrape failed";
    const data = await response.json();
    return data.content;
  } catch (error) {
    return "Scrape failed";
  }
};

export const generateEconomicSummary = async (date: string, sourcesData: { url: string, content: string }[]) => {
  const ai = getAI();
  const urls = sourcesData.map(s => s.url);

  const timeRangeDescription = `Sadece ${date} tarihindeki güncel gelişmeleri özetle. Eğer bu tarihte yeni bir veri veya haber yoksa, sadece "Belirlenen tarihte herhangi bir güncel ekonomik veri veya haber bulunamadı." yaz.`;

  const prompt = `
    Aşağıdaki ekonomik bülten ve haber kaynaklarını kullanarak bir "Yönetici Özeti" hazırla.
    
    Referans Tarih: ${date}
    
    Kapsam ve Kurallar:
    1. ${timeRangeDescription}
    2. Özet tam olarak bir sayfa uzunluğunda (yaklaşık 500-800 kelime) olmalı (eğer yeterli veri varsa).
    3. Türkiye Ekonomisi ve Dünya Ekonomisi başlıkları altında iki ana bölüme ayır.
    4. Önemli verileri (enflasyon, faiz, büyüme, döviz vb.) vurgula.
    5. Sadece verilen kaynaklardaki bilgileri kullan.
    6. Dil: Türkçe.
    7. En sonda "Yararlanılan Kaynaklar" listesi ekle.
    
    Kaynak Listesi:
    ${urls.join('\n')}

    Not: Bazı kaynakların ham metinleri aşağıda verilmiştir. 
    Eğer bir kaynak sayfası (landing page) ise ve o sayfada PDF rapor linkleri varsa, 
    belirlediğin tarihle eşleşen PDF'i okumak için 'scrapeUrl' aracını kullanmalısın. 
    Bu araç hem web sayfalarını hem de PDF dosyalarını okuyabilir.
    
    Ham Metin Örnekleri:
    ${sourcesData.map(s => `URL: ${s.url}\nİçerik: ${s.content.substring(0, 1000)}`).join('\n\n---\n\n')}
  `;

  const generateWithModel = async (modelName: string, isFallback = false) => {
    let contents: any[] = [{ role: 'user', parts: [{ text: prompt }] }];
    
    const config: any = {
      tools: [
        { urlContext: {} },
        { functionDeclarations: [scrapeUrlTool] }
      ],
      toolConfig: { includeServerSideToolInvocations: true }
    };

    if (modelName.includes("pro")) {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    }

    let response = await withRetry(() => ai.models.generateContent({
      model: modelName,
      contents,
      config
    }));

    // Handle function calls (up to 3 iterations for deep scanning)
    for (let i = 0; i < 3; i++) {
      const functionCalls = response.functionCalls;
      if (!functionCalls || functionCalls.length === 0) break;

      const functionResponses = [];
      for (const call of functionCalls) {
        if (call.name === "scrapeUrl") {
          const content = await scrapeUrl(call.args.url as string, 'daily', date);
          functionResponses.push({
            name: "scrapeUrl",
            response: { content },
            id: call.id
          });
        }
      }

      contents.push(response.candidates?.[0]?.content);
      contents.push({
        parts: functionResponses.map(res => ({
          functionResponse: {
            name: res.name,
            response: res.response,
            id: res.id
          }
        }))
      });

      response = await withRetry(() => ai.models.generateContent({
        model: modelName,
        contents,
        config
      }));
    }

    return response.text;
  };

  try {
    return await generateWithModel("gemini-3.1-pro-preview");
  } catch (error: any) {
    const errorMessage = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
      console.log("Pro model quota exceeded, falling back to Flash model...");
      return await generateWithModel("gemini-3-flash-preview", true);
    }
    throw error;
  }
};

export const chatWithSummary = async (history: { role: string, parts: { text: string }[] }[], message: string, summaryContext: string) => {
  const ai = getAI();
  const systemInstruction = `Sen bir ekonomi analistisin. Kullanıcının paylaştığı şu özet bağlamında soruları cevapla: ${summaryContext}. Eğer bilgi özette yoksa, Google Search kullanarak güncel bilgi verebilirsin.`;
  
  const chatWithModel = async (modelName: string) => {
    const chat = ai.chats.create({
      model: modelName,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }]
      }
    });
    const response = await withRetry(() => chat.sendMessage({ message }));
    return response.text;
  };

  try {
    return await chatWithModel("gemini-3.1-pro-preview");
  } catch (error: any) {
    const errorMessage = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
    if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
      console.log("Pro model quota exceeded in chat, falling back to Flash model...");
      return await chatWithModel("gemini-3-flash-preview");
    }
    throw error;
  }
};

export const textToSpeech = async (text: string) => {
  const ai = getAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Lütfen şu ekonomi özetini profesyonel bir sesle oku: ${text.substring(0, 5000)}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  }));

  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};

export const fetchSourceTitle = async (url: string) => {
  const ai = getAI();
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Bu URL'yi ziyaret et: ${url}. Bu kaynak için en uygun, çok kısa (en fazla 3-4 kelime) bir başlık/isim öner. Sadece ismi döndür. Örn: "Bloomberg Ekonomi", "TÜİK Haberleri"`,
    config: {
      tools: [{ urlContext: {} }]
    }
  }));
  return response.text.trim().replace(/^"|"$/g, '');
};

