interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

import { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Calendar as CalendarIcon, 
  Plus, 
  Check,
  Trash2, 
  FileText, 
  Loader2, 
  ChevronRight, 
  Globe, 
  TrendingUp, 
  AlertCircle,
  Volume2,
  ExternalLink,
  MessageSquare,
  Send,
  X,
  Moon,
  Sun,
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { toast, Toaster } from 'sonner';
import { generateEconomicSummary, chatWithSummary, textToSpeech, fetchSourceTitle } from './lib/gemini';

interface Source {
  id: string;
  name: string;
  url: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  content?: string;
  dataFound?: boolean;
  selected: boolean;
  category: string;
}

interface ArchiveItem {
  id: string;
  date: string;
  summary: string;
  scanType: string;
  sourcesCount: number;
  timestamp: number;
}

interface MarketItem {
  name: string;
  value: string;
  change: string;
  isUp: boolean;
  isDown: boolean;
}


const INITIAL_SOURCES: Source[] = [];

export default function App() {
  const [sources, setSources] = useState<Source[]>(() => {
    const saved = localStorage.getItem('ekoradar_sources');
    return saved ? JSON.parse(saved) : INITIAL_SOURCES;
  });
  const [newUrl, setNewUrl] = useState('');
  const [newUrlError, setNewUrlError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('Kullanıcı Tarafından Eklenen');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isScraping, setIsScraping] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isFetchingTitle, setIsFetchingTitle] = useState(false);
  const [sourceSearchQuery, setSourceSearchQuery] = useState('');
  const [visibleLinkSourceId, setVisibleLinkSourceId] = useState<string | null>(null);
  const [passwordModal, setPasswordModal] = useState<{
    isOpen: boolean;
    title: string;
    action: () => void;
  }>({ isOpen: false, title: '', action: () => {} });
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [archive, setArchive] = useState<ArchiveItem[]>(() => {
    const saved = localStorage.getItem('ekoradar_archive');
    return saved ? JSON.parse(saved) : [];
  });
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [marketData, setMarketData] = useState<MarketItem[]>([]);
  const [isMarketLoading, setIsMarketLoading] = useState(false);
  const [systemInfo, setSystemInfo] = useState<{ percent: number } | null>(null);

  const fetchSystemInfo = async () => {
    try {
      const response = await fetch('/api/system-info');
      if (response.ok) {
        const data = await response.json();
        setSystemInfo(data);
      }
    } catch (error) {
      console.error("System info fetch failed", error);
    }
  };

  const fetchMarketData = async () => {
    setIsMarketLoading(true);
    try {
      const response = await fetch('/api/market-data');
      if (response.ok) {
        const data = await response.json();
        setMarketData(data);
      }
    } catch (error) {
      console.error("Market data fetch failed", error);
    } finally {
      setIsMarketLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketData();
    fetchSystemInfo();
    const marketInterval = setInterval(fetchMarketData, 300000); // Refresh every 5 mins
    const systemInterval = setInterval(fetchSystemInfo, 10000); // Refresh every 10 secs
    return () => {
      clearInterval(marketInterval);
      clearInterval(systemInterval);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    
    // Unregister any existing service workers to prevent auto-refresh issues
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('ekoradar_archive', JSON.stringify(archive));
  }, [archive]);

  useEffect(() => {
    localStorage.setItem('ekoradar_sources', JSON.stringify(sources));
  }, [sources]);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => { e.preventDefault(); setInstallPrompt(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setInstallPrompt(null); };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onBeforeInstall); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const resetApp = () => {
    setSummary(null);
    setChatMessages([]);
    setUserInput('');
    setAudioUrl(null);
    setIsPlaying(false);

    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const chatEndRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const scrollToReport = () => {
    reportRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const addSource = async () => {
    if (!newUrl) return;
    
    setNewUrlError(null);
    
    let urlToProcess = newUrl.trim();
    if (urlToProcess.includes('piyasa-gunlugu.aspx')) {
      urlToProcess = 'https://ekonomi.isbank.com.tr/periyodik-yayinlar';
      setNewUrl(urlToProcess);
    }
    
    // Normalize URL for comparison
    const normalize = (url: string) => {
      try {
        const u = new URL(url.startsWith('http') ? url : `https://${url}`);
        return u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '');
      } catch (e) {
        return url.trim().toLowerCase().replace(/\/$/, '').replace(/^https?:\/\/(www\.)?/, '');
      }
    };

    const normalizedNewUrl = normalize(urlToProcess);
    const isDuplicate = sources.some(s => normalize(s.url) === normalizedNewUrl);
    
    if (isDuplicate) {
      setNewUrlError("Bu kaynak zaten listenizde mevcut.");
      setTimeout(() => setNewUrlError(null), 3000);
      return;
    }

    setIsCategoryModalOpen(true);
  };

  const confirmAddSource = async (category: string) => {
    setIsFetchingTitle(true);
    setIsCategoryModalOpen(false);
    let urlToAdd = newUrl;
    if (urlToAdd.includes('piyasa-gunlugu.aspx')) {
      urlToAdd = 'https://ekonomi.isbank.com.tr/periyodik-yayinlar';
    }
    setNewUrl('');
    setNewCategoryName('');
    setIsAddingNewCategory(false);
    
    try {
      const fetchedName = await fetchSourceTitle(urlToAdd);
      const id = Math.random().toString(36).substr(2, 9);
      setSources([...sources, { id, name: fetchedName || 'Yeni Kaynak', url: urlToAdd, status: 'idle', selected: true, category }]);
    } catch (error) {
      console.error("Failed to fetch title", error);
      const id = Math.random().toString(36).substr(2, 9);
      setSources([...sources, { id, name: 'Yeni Kaynak', url: urlToAdd, status: 'idle', selected: true, category }]);
    } finally {
      setIsFetchingTitle(false);
    }
  };

  const removeSource = (id: string) => {
    setPasswordModal({
      isOpen: true,
      title: "Kaynağı silmek için şifreyi girin",
      action: () => {
        setSources(prev => prev.filter(s => s.id !== id));
      }
    });
  };

  const toggleSourceSelection = (id: string) => {
    setSources(sources.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const selectAllSources = (selected: boolean) => {
    setSources(sources.map(s => ({ ...s, selected })));
  };

  const toggleCategorySelection = (category: string) => {
    const categorySources = sources.filter(s => s.category === category);
    const allSelected = categorySources.every(s => s.selected);
    setSources(sources.map(s => s.category === category ? { ...s, selected: !allSelected } : s));
  };

  const resetSources = () => {
    setPasswordModal({
      isOpen: true,
      title: "Kaynakları sıfırlamak için şifreyi girin",
      action: () => {
        setSources(INITIAL_SOURCES);
        localStorage.removeItem('economic_analysis_sources');
      }
    });
  };


  const handlePasswordSubmit = () => {
    if (passwordInput === "1304") {
      passwordModal.action();
      setPasswordModal({ ...passwordModal, isOpen: false });
      setPasswordInput('');
      setPasswordError(false);
    } else {
      setPasswordError(true);
      setTimeout(() => setPasswordError(false), 2000);
    }
  };

  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs: number = 60000) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  };

  const scanSources = async () => {
    const selectedSources = sources.filter(s => s.selected);

    if (selectedSources.length === 0) {
      toast.error("Lütfen en az bir kaynak seçin.");
      return;
    }

    setIsScraping(true);
    setIsSummarizing(false);
    setSummary(null);

    setSources(prev => prev.map(s => ({ ...s, status: s.selected ? s.status : 'idle' })));

    const updatedSources = [...sources].map(s => ({ ...s }));
    const scrapedData: { url: string, content: string }[] = [];

    for (const source of selectedSources) {
      const sourceIndex = updatedSources.findIndex(s => s.id === source.id);
      if (sourceIndex === -1) continue;

      updatedSources[sourceIndex].status = 'loading';
      setSources([...updatedSources]);

      try {
        const response = await fetchWithTimeout('/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: source.url,
            scanType: 'daily',
            selectedDate
          })
        }, 70000);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Scrape failed with status ${response.status}`);
        }

        const data = await response.json();
        updatedSources[sourceIndex].status = 'success';
        updatedSources[sourceIndex].content = data.content;
        scrapedData.push({ url: source.url, content: data.content || '' });
      } catch (error: any) {
        console.error(`Error scraping ${source.url}:`, error.message);
        updatedSources[sourceIndex].status = 'error';
      }
      setSources([...updatedSources]);
    }

    setIsScraping(false);

    if (scrapedData.length === 0) {
      toast.error("Kaynaklar taranamadı. Lütfen internet bağlantınızı veya kaynak URL'lerini kontrol edin.");
      return;
    }

    setIsSummarizing(true);
    {
      try {
        const result = await generateEconomicSummary(selectedDate, scrapedData);
        setSummary(result);

        // Add to archive
        const newArchiveItem: ArchiveItem = {
          id: Math.random().toString(36).substr(2, 9),
          date: selectedDate,
          summary: result,
          scanType: 'daily',
          sourcesCount: scrapedData.length,
          timestamp: Date.now()
        };
        setArchive(prev => [newArchiveItem, ...prev].slice(0, 10));
        
        // Automatically generate header image and infographic
      } catch (error: any) {
        console.error("Summary generation failed", error);
        const errorMessage = error?.message || JSON.stringify(error);
        if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
          toast.error("Gemini API kota sınırına ulaşıldı. Lütfen birkaç dakika bekleyip tekrar deneyin.");
        } else {
          toast.error("Özet oluşturulurken bir hata oluştu. Lütfen kaynakları kontrol edip tekrar deneyin.");
        }
      } finally {
        setIsSummarizing(false);
      }
    }
  };

  const handleChat = async () => {
    if (!userInput || !summary) return;
    const newMessage = { role: 'user' as const, text: userInput };
    setChatMessages([...chatMessages, newMessage]);
    setUserInput('');

    try {
      const response = await chatWithSummary([], userInput, summary);
      setChatMessages(prev => [...prev, { role: 'model', text: response }]);
    } catch (error) {
      console.error("Chat failed", error);
    }
  };

  const handleTTS = async () => {
    if (!summary) return;
    setIsAudioLoading(true);
    try {
      const base64Audio = await textToSpeech(summary);
      if (base64Audio) {
        // Gemini TTS returns raw PCM 16-bit 24kHz.
        // We need to convert it to a WAV Blob to use with the <audio> element.
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Create WAV header
        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);
        
        const writeString = (offset: number, string: string) => {
          for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
          }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + len, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // Mono
        view.setUint32(24, 24000, true); // Sample rate
        view.setUint32(28, 24000 * 2, true); // Byte rate
        view.setUint16(32, 2, true); // Block align
        view.setUint16(34, 16, true); // Bits per sample
        writeString(36, 'data');
        view.setUint32(40, len, true);

        const blob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setIsPlaying(true);
      }
    } catch (error) {
      console.error("TTS failed", error);
    } finally {
      setIsAudioLoading(false);
    }
  };

  const selectedCount = sources.filter(s => s.selected).length;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
        <Toaster position="top-center" richColors />
        {/* Sidebar: Config & Actions */}
        <aside className="w-full lg:w-80 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 p-6 flex flex-col gap-8 lg:overflow-y-auto lg:max-h-screen lg:sticky lg:top-0 sidebar-content">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="text-brand-accent w-8 h-8" />
              <h1
                onClick={resetApp}
                className="text-2xl font-serif font-bold tracking-tight cursor-pointer hover:text-brand-accent transition-colors"
              >
                EkoRadar
              </h1>
            </div>
            {installPrompt && (
              <button
                onClick={handleInstall}
                title="Uygulamayı yükle"
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <Download className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
              </button>
            )}
          </div>

          {/* Market Data Ticker */}
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4 border border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Piyasa Verileri</span>
              <button 
                onClick={fetchMarketData}
                disabled={isMarketLoading}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                title="Yenile"
              >
                <RefreshCw className={`w-3 h-3 text-zinc-500 ${isMarketLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {marketData.length > 0 ? (
                marketData.slice(0, 6).map((item, idx) => (
                  <div key={idx} className="flex flex-col">
                    <span className="text-[9px] text-zinc-500 dark:text-zinc-400 font-medium truncate uppercase">{item.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold tabular-nums">{item.value}</span>
                      <div className={`flex items-center text-[9px] font-bold ${item.isUp ? 'text-emerald-500' : item.isDown ? 'text-rose-500' : 'text-zinc-400'}`}>
                        {item.isUp ? <ArrowUpRight className="w-2.5 h-2.5" /> : item.isDown ? <ArrowDownRight className="w-2.5 h-2.5" /> : null}
                        {item.change.replace('+', '').replace('-', '')}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-2 py-2 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-400 uppercase tracking-wider">Referans Tarih</label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-brand-accent focus:border-transparent outline-none transition-all dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-400 uppercase tracking-wider">Kaynak Yönetimi</label>
              <button 
                onClick={() => setIsSourceMenuOpen(!isSourceMenuOpen)}
                className="w-full flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:border-brand-accent transition-all group relative"
              >
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-zinc-400 group-hover:text-brand-accent" />
                  <div className="text-left">
                    <div className="text-sm font-semibold">Kaynakları Seç</div>
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase">{selectedCount} Kaynak Seçili</div>
                  </div>
                </div>
                <ChevronRight className={`w-5 h-5 text-zinc-400 transition-transform ${isSourceMenuOpen ? 'rotate-90' : ''}`} />
              </button>

              <AnimatePresence>
                {isSourceMenuOpen && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border border-zinc-100 dark:border-zinc-800 rounded-xl bg-zinc-50/30 dark:bg-zinc-900/50"
                  >
                    <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input 
                          type="text"
                          placeholder="Kaynak ara..."
                          value={sourceSearchQuery}
                          onChange={(e) => {
                            setSourceSearchQuery(e.target.value);
                            if (e.target.value.length > 0) {
                              selectAllSources(false);
                            }
                          }}
                          className="w-full pl-8 pr-2 py-3 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-brand-accent dark:text-white"
                        />
                      </div>
                    </div>
                    <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900">
                      <div className="flex gap-4">
                        <button 
                          onClick={() => selectAllSources(true)}
                          className="text-xs font-bold text-brand-accent hover:underline"
                        >
                          TÜMÜNÜ SEÇ
                        </button>
                        <button 
                          onClick={() => selectAllSources(false)}
                          className="text-xs font-bold text-zinc-400 hover:underline"
                        >
                          TEMİZLE
                        </button>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={resetSources}
                          className="text-xs font-bold uppercase tracking-tighter px-3 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-brand-accent transition-colors rounded-lg"
                        >
                          Sıfırla
                        </button>
                      </div>
                    </div>
                    <div className="p-2 space-y-4">
                      {Array.from(new Set(sources.map(s => s.category))).map(category => {
                        const categorySources = sources.filter(s => 
                          (s.category === category) && 
                          (s.name.toLowerCase().includes(sourceSearchQuery.toLowerCase()) || s.url.toLowerCase().includes(sourceSearchQuery.toLowerCase()))
                        );
                        
                        if (categorySources.length === 0) return null;
                        
                        const allSelected = categorySources.every(s => s.selected);
                        
                        return (
                          <div key={category} className="space-y-1">
                            <div 
                              onClick={() => toggleCategorySelection(category)}
                              className="flex items-center justify-between px-2 py-1 cursor-pointer group"
                            >
                              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest group-hover:text-brand-accent transition-colors">
                                {category}
                              </span>
                              <div className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${allSelected ? 'bg-brand-accent/10 text-brand-accent' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
                                {allSelected ? 'TÜMÜ SEÇİLİ' : 'SEÇ'}
                              </div>
                            </div>
                            <div className="space-y-1">
                              {categorySources.map(source => (
                                <div key={source.id} className="flex flex-col">
                                  <div 
                                    onClick={() => toggleSourceSelection(source.id)}
                                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${source.selected ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/50'}`}
                                  >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${source.selected ? 'bg-brand-accent border-brand-accent' : 'border-zinc-300 dark:border-zinc-600'}`}>
                                      {source.selected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className={`text-xs font-medium truncate ${source.selected ? 'text-brand-primary dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'}`}>{source.name}</div>
                                      {source.status === 'loading' && (
                                        <div className="flex items-center gap-1 mt-1">
                                          <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-pulse" />
                                          <span className="text-[8px] text-zinc-400 uppercase font-bold tracking-tighter">Taranıyor...</span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button 
                                        onClick={(e) => { 
                                          e.stopPropagation(); 
                                          setVisibleLinkSourceId(visibleLinkSourceId === source.id ? null : source.id); 
                                        }}
                                        className={`p-1 transition-colors ${visibleLinkSourceId === source.id ? 'text-brand-accent' : 'text-zinc-300 dark:text-zinc-600 hover:text-brand-accent'}`}
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                      </button>
                                      <button 
                                        onClick={(e) => { 
                                          e.stopPropagation(); 
                                          removeSource(source.id); 
                                        }}
                                        className="p-1 text-zinc-300 dark:text-zinc-600 hover:text-red-500 transition-colors"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                  {visibleLinkSourceId === source.id && (
                                    <motion.div 
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      className="px-9 py-1 text-[10px] break-all border-l-2 border-brand-accent/20 ml-4 mb-1"
                                    >
                                      <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-brand-accent hover:underline flex items-center gap-1">
                                        {source.url}
                                      </a>
                                    </motion.div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="p-3 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
                      <div className="flex gap-2">
                        <input 
                          placeholder="Yeni URL..." 
                          value={newUrl}
                          onChange={(e) => {
                            setNewUrl(e.target.value);
                            if (newUrlError) setNewUrlError(null);
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && addSource()}
                          className={`flex-1 px-4 py-3 text-sm border ${newUrlError ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'} bg-white dark:bg-zinc-800 rounded-xl outline-none focus:ring-1 focus:ring-brand-accent dark:text-white transition-all`}
                        />
                        <button 
                          onClick={addSource}
                          disabled={isFetchingTitle || !newUrl}
                          className="p-3 bg-brand-primary dark:bg-brand-accent text-white rounded-xl hover:bg-black dark:hover:bg-brand-accent/80 disabled:opacity-50"
                        >
                          {isFetchingTitle ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Check className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                      
                      {newUrlError && (
                        <motion.p 
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-[10px] text-red-500 font-bold px-1 mt-2"
                        >
                          {newUrlError}
                        </motion.p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <AnimatePresence>
            {isCategoryModalOpen && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              >
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800"
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-tight">Kategori Seçin</h3>
                    <button 
                      onClick={() => setIsCategoryModalOpen(false)}
                      className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                    >
                      <X className="w-4 h-4 text-zinc-400" />
                    </button>
                  </div>
                  
                  <div className="space-y-2 max-h-60 overflow-y-auto mb-4 p-1">
                    {Array.from(new Set(sources.map(s => s.category))).map(cat => (
                      <button
                        key={cat}
                        onClick={() => confirmAddSource(cat)}
                        className="w-full text-left px-4 py-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm font-medium"
                      >
                        {cat}
                      </button>
                    ))}
                    {!sources.some(s => s.category === 'Kullanıcı Tarafından Eklenen') && (
                      <button
                        onClick={() => confirmAddSource('Kullanıcı Tarafından Eklenen')}
                        className="w-full text-left px-4 py-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm font-medium"
                      >
                        Kullanıcı Tarafından Eklenen
                      </button>
                    )}
                  </div>

                  <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
                    {!isAddingNewCategory ? (
                      <button
                        onClick={() => setIsAddingNewCategory(true)}
                        className="w-full py-3 text-brand-accent font-bold text-xs uppercase tracking-wider hover:underline"
                      >
                        + Yeni Kategori
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <input 
                          placeholder="Yeni kategori adı..." 
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          autoFocus
                          className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-brand-accent dark:text-white transition-all"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setIsAddingNewCategory(false)}
                            className="flex-1 py-3 text-zinc-400 font-bold text-xs uppercase"
                          >
                            İptal
                          </button>
                          <button
                            onClick={() => confirmAddSource(newCategoryName || 'Yeni Kategori')}
                            className="flex-1 py-3 bg-brand-accent text-white font-bold rounded-xl text-xs uppercase"
                          >
                            Kaydet
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {passwordModal.isOpen && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              >
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800"
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-tight">Güvenlik Doğrulaması</h3>
                    <button 
                      onClick={() => setPasswordModal({ ...passwordModal, isOpen: false })}
                      className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                    >
                      <X className="w-4 h-4 text-zinc-400" />
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">{passwordModal.title}</p>
                  <div className="space-y-4">
                    <motion.input 
                      type="password"
                      autoFocus
                      animate={passwordError ? { x: [-10, 10, -10, 10, 0] } : {}}
                      placeholder="Şifre"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                      className={`w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border ${passwordError ? 'border-red-500' : 'border-zinc-200 dark:border-zinc-700'} rounded-xl outline-none focus:ring-2 focus:ring-brand-accent dark:text-white transition-all`}
                    />
                    {passwordError && (
                      <p className="text-[10px] text-red-500 font-bold text-center">Hatalı şifre! Lütfen tekrar deneyin.</p>
                    )}
                    <button 
                      onClick={handlePasswordSubmit}
                      className="w-full py-3 bg-brand-primary dark:bg-brand-accent text-white font-bold rounded-xl hover:bg-black dark:hover:bg-brand-accent/80 transition-all"
                    >
                      ONAYLA
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-auto space-y-3">
            <button
              onClick={() => scanSources()}
              disabled={isScraping || isSummarizing}
              className="w-full py-4 bg-brand-primary dark:bg-brand-accent text-white font-bold rounded-2xl shadow-xl shadow-black/10 hover:bg-black dark:hover:bg-brand-accent/80 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {isScraping || isSummarizing ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-brand-accent dark:text-white" />
                  <span>Analiz Ediliyor...</span>
                </>
              ) : (
                <>
                  <Play className="w-6 h-6" />
                  <span>Analizi Başlat</span>
                </>
              )}
            </button>

            {summary && (
              <button 
                onClick={scrollToReport}
                className="lg:hidden w-full py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-bold rounded-xl flex items-center justify-center gap-2 text-xs border border-zinc-200 dark:border-zinc-700"
              >
                <ChevronRight className="w-4 h-4 rotate-90" />
                Raporu Gör
              </button>
            )}

            <button 
              onClick={() => setIsArchiveOpen(true)}
              className="w-full py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-bold rounded-xl flex items-center justify-center gap-2 text-xs border border-zinc-200 dark:border-zinc-700 mt-4"
            >
              <FileText className="w-4 h-4" />
              Arşiv
            </button>

            {/* System Info / Memory Usage */}
            <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-3 h-3 text-zinc-400" />
                  <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Sistem Durumu</span>
                </div>
                <span className="text-[10px] font-bold text-zinc-500 tabular-nums">%{systemInfo?.percent || 0} Doluluk</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${systemInfo?.percent || 0}%` }}
                  className={`h-full transition-all duration-1000 ${
                    (systemInfo?.percent || 0) > 80 ? 'bg-rose-500' : 
                    (systemInfo?.percent || 0) > 60 ? 'bg-amber-500' : 'bg-brand-accent'
                  }`}
                />
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content: Report View */}
        <main ref={reportRef} className="flex-1 p-6 lg:p-12 lg:overflow-y-auto lg:max-h-screen bg-zinc-50/50 dark:bg-zinc-950/50">
          {!summary && !isScraping && !isSummarizing && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-6">
                <FileText className="w-10 h-10 text-zinc-300 dark:text-zinc-700" />
              </div>
              <h2 className="text-2xl font-serif font-bold mb-2 dark:text-white">Henüz Rapor Yok</h2>
              <p className="text-zinc-500 dark:text-zinc-400">
                Soldaki panelden bir periyot ve tarih seçin ve kaynakları tarayarak günlük ekonomi özetinizi oluşturun.
              </p>
            </div>
          )}

          {(isScraping || isSummarizing) && !summary && (
            <div className="h-full flex flex-col items-center justify-center space-y-8">
              <div className="relative">
                <div className="w-24 h-24 border-4 border-zinc-100 dark:border-zinc-900 border-t-brand-accent rounded-full animate-spin" />
                <Globe className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-brand-accent animate-pulse" />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-serif font-bold mb-2 dark:text-white">
                  {isScraping ? 'Kaynaklar Taranıyor' : 'Analiz Hazırlanıyor'}
                </h3>
                <p className="text-zinc-500 dark:text-zinc-400 max-w-xs">
                  {isScraping 
                    ? "Ekonomi bültenleri taranıyor ve PDF'ler analiz ediliyor..." 
                    : "Yapay zeka verileri konsolide ediyor ve özetinizi hazırlıyor..."}
                </p>
              </div>
            </div>
          )}

          {summary && (
            <motion.article 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto bg-white dark:bg-zinc-900 shadow-xl rounded-2xl overflow-hidden border border-zinc-100 dark:border-zinc-800"
            >
              {/* Report Header */}
              <div className="bg-zinc-50 dark:bg-zinc-950 p-8 border-b border-zinc-100 dark:border-zinc-800 relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-brand-accent">
                    <TrendingUp className="w-5 h-5" />
                    <span className="text-xs font-bold uppercase tracking-widest">Ekonomi Analiz Raporu</span>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleTTS}
                      disabled={isAudioLoading}
                      className="p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                      title="Sesli Oku"
                    >
                      {isAudioLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <h2 className="text-3xl font-serif font-bold text-zinc-900 dark:text-white">
                  {format(new Date(selectedDate), 'd MMMM yyyy', { locale: tr })}
                </h2>
              </div>

              {/* Audio Player */}
              {audioUrl && (
                <div className="px-8 py-4 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-6">
                  <audio 
                    ref={audioRef}
                    src={audioUrl}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    autoPlay
                  />
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => {
                        if (audioRef.current) {
                          if (isPlaying) audioRef.current.pause();
                          else audioRef.current.play();
                        }
                      }}
                      className="w-10 h-10 bg-brand-primary dark:bg-brand-accent text-white rounded-full flex items-center justify-center hover:scale-105 transition-transform"
                    >
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </button>
                    <button 
                      onClick={() => {
                        if (audioRef.current) {
                          audioRef.current.currentTime = 0;
                          audioRef.current.play();
                        }
                      }}
                      className="p-2 text-zinc-500 hover:text-brand-primary transition-colors"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Hız</span>
                    <div className="flex bg-zinc-200 dark:bg-zinc-800 rounded-lg p-1">
                      {[1, 1.25, 1.5, 2].map(rate => (
                        <button
                          key={rate}
                          onClick={() => {
                            setPlaybackRate(rate);
                            if (audioRef.current) audioRef.current.playbackRate = rate;
                          }}
                          className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                            playbackRate === rate 
                              ? 'bg-white dark:bg-zinc-700 text-brand-primary dark:text-brand-accent shadow-sm' 
                              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 min-w-[200px] flex items-center gap-3">
                    <div className="h-1.5 flex-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-brand-accent"
                        animate={{ width: isPlaying ? '100%' : '0%' }}
                        transition={{ duration: isPlaying ? 300 : 0, ease: "linear" }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="p-8 lg:p-12 flex flex-col gap-12">
                <div className="flex-1">
                  <div className="markdown-body dark:text-zinc-100">
                    <Markdown>{summary}</Markdown>
                  </div>
                </div>
              </div>
            </motion.article>
          )}
        </main>

        {/* Chat Interface */}
        <div className="fixed bottom-8 right-8 z-50">
          <AnimatePresence>
            {isChatOpen && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="absolute bottom-20 right-0 w-96 h-[500px] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden"
              >
                <div className="p-4 bg-brand-primary dark:bg-zinc-950 text-white flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-brand-accent" />
                    <span className="font-medium">Analist ile Konuş</span>
                  </div>
                  <button onClick={() => setIsChatOpen(false)} className="hover:text-brand-accent transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50 dark:bg-zinc-950">
                  {chatMessages.length === 0 && (
                    <div className="text-center text-zinc-400 dark:text-zinc-600 mt-10 text-sm">
                      Rapor hakkında aklınıza takılanları sorabilirsiniz.
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                        msg.role === 'user' 
                          ? 'bg-brand-accent text-white rounded-tr-none' 
                          : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-tl-none'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex gap-2 bg-white dark:bg-zinc-900">
                  <input 
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleChat()}
                    placeholder="Soru sorun..."
                    className="flex-1 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-full text-sm outline-none focus:ring-1 focus:ring-brand-accent dark:text-white"
                  />
                  <button 
                    onClick={handleChat}
                    className="p-2 bg-brand-primary dark:bg-brand-accent text-white rounded-full hover:bg-black dark:hover:bg-brand-accent/80 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="w-14 h-14 bg-brand-primary dark:bg-brand-accent text-white rounded-full shadow-xl flex items-center justify-center hover:scale-110 transition-all group"
          >
            <MessageSquare className="w-6 h-6 group-hover:text-brand-accent" />
          </button>
        </div>


        {/* Archive Modal */}
        <AnimatePresence>
          {isArchiveOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[80vh]"
              >
                <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center">
                      <FileText className="w-5 h-5 text-brand-accent" />
                    </div>
                    <div>
                      <h3 className="text-xl font-serif font-bold dark:text-white">Analiz Arşivi</h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Son 10 analiziniz burada saklanır</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {archive.length > 0 && (
                      <button 
                        onClick={() => {
                          if (confirm('Tüm arşivi silmek istediğinize emin misiniz?')) {
                            setArchive([]);
                            localStorage.removeItem('ekoradar_archive');
                          }
                        }}
                        className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-full transition-colors"
                        title="Arşivi Temizle"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                    <button 
                      onClick={() => setIsArchiveOpen(false)}
                      className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors dark:text-white"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {archive.length === 0 ? (
                    <div className="text-center py-20">
                      <FileText className="w-16 h-16 text-zinc-200 dark:text-zinc-800 mx-auto mb-4" />
                      <p className="text-zinc-500 dark:text-zinc-400">Henüz arşivlenmiş bir analiz yok.</p>
                    </div>
                  ) : (
                    archive.map((item) => (
                      <div 
                        key={item.id}
                        className="group p-4 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-2xl hover:border-brand-accent transition-all cursor-pointer"
                        onClick={() => {
                          setSummary(item.summary);
                          setSelectedDate(item.date);
                          setIsArchiveOpen(false);
                          scrollToReport();
                        }}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="text-xs font-bold text-brand-accent uppercase tracking-wider">
                              Günlük Analiz
                            </span>
                            <h4 className="font-bold dark:text-white mt-1">{format(new Date(item.date), 'd MMMM yyyy', { locale: tr })}</h4>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 block">{format(item.timestamp, 'HH:mm')}</span>
                            <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 bg-zinc-200 dark:bg-zinc-700 px-2 py-0.5 rounded-full">{item.sourcesCount} Kaynak</span>
                          </div>
                        </div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 italic">
                          {item.summary.substring(0, 150)}...
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
}
