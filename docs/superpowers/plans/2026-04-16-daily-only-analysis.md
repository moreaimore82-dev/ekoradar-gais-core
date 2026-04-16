# Daily-Only Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Haftalık/Aylık/Yıllık tarama seçeneklerini kaldırıp uygulamayı sadece günlük analize odaklanacak şekilde sadeleştirmek.

**Architecture:** `scanType` state ve UI tamamen kaldırılır; `'daily'` değeri ilgili API çağrılarına sabit olarak geçilir. `gemini.ts` ve `server.ts`'teki şartlı mantık da temizlenerek prompt ve scraping kodu sadeleştirilir.

**Tech Stack:** React 19 + TypeScript, Express.js, Google Gemini API

---

## File Map

| Dosya | Değişiklik |
|---|---|
| `src/App.tsx` | `scanType` state kaldır, UI butonları kaldır, arşiv etiketi düzelt |
| `src/lib/gemini.ts` | `generateEconomicSummary` ve `verifySourceStatus` fonksiyonlarından `scanType` parametresi kaldır |
| `server.ts` | İş Bankası scraping'deki haftalık/aylık URL şartlarını kaldır |

---

### Task 1: `scanType` state ve resetApp temizliği — App.tsx

**Files:**
- Modify: `src/App.tsx:104` (state tanımı)
- Modify: `src/App.tsx:202` (resetApp)

- [ ] **Step 1: `scanType` state satırını sil**

`src/App.tsx` satır 104'teki şu satırı tamamen kaldır:

```tsx
// SİL:
const [scanType, setScanType] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
```

- [ ] **Step 2: `resetApp()` içindeki `setScanType` çağrısını sil**

`src/App.tsx` satır 202'deki şu satırı kaldır:

```tsx
// SİL:
setScanType('daily');
```

- [ ] **Step 3: TypeScript derlemesinin hatasız geçtiğini doğrula**

```bash
npx tsc --noEmit
```

Beklenen: `error TS2304: Cannot find name 'scanType'` ve `setScanType` hataları — bunları sonraki adımlarda düzelteceğiz, bu adımda sadece kaç hata olduğunu not et.

---

### Task 2: `scanSources()` içindeki `scanType` referanslarını sabitle — App.tsx

**Files:**
- Modify: `src/App.tsx:324` (verifySourceStatus çağrısı)
- Modify: `src/App.tsx:410` (scrape API çağrısı)
- Modify: `src/App.tsx:437` (generateEconomicSummary çağrısı)
- Modify: `src/App.tsx:445` (arşiv kayıt)

- [ ] **Step 1: `verifySourceStatus` çağrısından `scanType` kaldır**

Satır 324'ü şöyle değiştir:

```tsx
// ÖNCE:
const result = await verifySourceStatus(source.url, selectedDate, scanType);

// SONRA:
const result = await verifySourceStatus(source.url, selectedDate);
```

- [ ] **Step 2: `/api/scrape` body'sindeki `scanType`'ı sabitle**

Satır 408-412'yi şöyle değiştir:

```tsx
// ÖNCE:
body: JSON.stringify({ 
  url: source.url,
  scanType,
  selectedDate
})

// SONRA:
body: JSON.stringify({ 
  url: source.url,
  scanType: 'daily',
  selectedDate
})
```

- [ ] **Step 3: `generateEconomicSummary` çağrısından `scanType` kaldır**

Satır 437'yi şöyle değiştir:

```tsx
// ÖNCE:
const result = await generateEconomicSummary(selectedDate, scrapedData, scanType);

// SONRA:
const result = await generateEconomicSummary(selectedDate, scrapedData);
```

- [ ] **Step 4: Arşiv kaydındaki `scanType` alanını sabitle**

Satır 445'i şöyle değiştir:

```tsx
// ÖNCE:
scanType: scanType,

// SONRA:
scanType: 'daily',
```

---

### Task 3: "Tarama Periyodu" UI bölümünü kaldır — App.tsx

**Files:**
- Modify: `src/App.tsx:586-606`

> Not: Satır 585'teki `<div className="space-y-6">` outer wrapper'dır ve altındaki "Referans Tarih" bölümünü de sarar — o satırı **dokunma**. Sadece satır 586-606 arasındaki iç `<div className="space-y-2">` bloğunu kaldır.

- [ ] **Step 1: Tarama Periyodu iç div bloğunu sil**

Satır 586-606 arasındaki şu bloğu kaldır (başındaki `<div className="space-y-2">` ve kapanış `</div>` dahil):

```tsx
// SİL (satır 586-606):
            <div className="space-y-2">
              <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-400 uppercase tracking-wider">Tarama Periyodu</label>
              <div className="grid grid-cols-2 gap-2">
                {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setScanType(type)}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all ${
                      scanType === type 
                        ? 'bg-brand-primary dark:bg-brand-accent text-white border-brand-primary dark:border-brand-accent shadow-md' 
                        : 'bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-brand-accent'
                    }`}
                  >
                    {type === 'daily' && 'GÜNLÜK'}
                    {type === 'weekly' && 'HAFTALIK'}
                    {type === 'monthly' && 'AYLIK'}
                    {type === 'yearly' && 'YILLIK'}
                  </button>
                ))}
              </div>
            </div>
```

---

### Task 4: Arşiv geri yükleme ve etiket düzeltmesi — App.tsx

**Files:**
- Modify: `src/App.tsx:1332` (arşivden yükleme onClick)
- Modify: `src/App.tsx:1339-1342` (arşiv etiketi)

- [ ] **Step 1: `setScanType` çağrısını arşiv onClick'ten sil**

Satır 1332'deki şu satırı kaldır:

```tsx
// SİL:
setScanType(item.scanType as any);
```

- [ ] **Step 2: Arşiv etiketini her zaman "Günlük Analiz" gösterecek şekilde düzelt**

Satır 1339-1342'yi şöyle değiştir:

```tsx
// ÖNCE:
<span className="text-xs font-bold text-brand-accent uppercase tracking-wider">
  {item.scanType === 'daily' ? 'Günlük' : 
   item.scanType === 'weekly' ? 'Haftalık' : 
   item.scanType === 'monthly' ? 'Aylık' : 'Yıllık'} Analiz
</span>

// SONRA:
<span className="text-xs font-bold text-brand-accent uppercase tracking-wider">
  Günlük Analiz
</span>
```

- [ ] **Step 3: TypeScript derlemesinin App.tsx hatalarından temiz olduğunu doğrula**

```bash
npx tsc --noEmit
```

Beklenen: `scanType` ve `setScanType` ile ilgili tüm hataların gitmiş olması.

---

### Task 5: `generateEconomicSummary` sadeleştirmesi — gemini.ts

**Files:**
- Modify: `src/lib/gemini.ts:71-111`

- [ ] **Step 1: Fonksiyon imzasından `scanType` parametresini kaldır**

Satır 71'i şöyle değiştir:

```ts
// ÖNCE:
export const generateEconomicSummary = async (date: string, sourcesData: { url: string, content: string }[], scanType: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'daily') => {

// SONRA:
export const generateEconomicSummary = async (date: string, sourcesData: { url: string, content: string }[]) => {
```

- [ ] **Step 2: `timeRangeDescription` if/else bloğunu sil ve sabit değerle değiştir**

Satır 75-84'ü şöyle değiştir:

```ts
// ÖNCE:
let timeRangeDescription = "";
if (scanType === 'daily') {
  timeRangeDescription = `Sadece ${date} tarihindeki güncel gelişmeleri özetle. Eğer bu tarihte yeni bir veri veya haber yoksa, sadece "Belirlenen tarihte herhangi bir güncel ekonomik veri veya haber bulunamadı." yaz.`;
} else if (scanType === 'weekly') {
  timeRangeDescription = `${date} tarihinden tam bir hafta öncesine kadar olan (son 7 gün) tüm ekonomik verileri konsolide ederek özetle.`;
} else if (scanType === 'monthly') {
  timeRangeDescription = `${date} tarihinden tam bir ay öncesine kadar olan tüm ekonomik verileri konsolide ederek özetle.`;
} else if (scanType === 'yearly') {
  timeRangeDescription = `${date} tarihinden tam bir yıl öncesine kadar olan tüm ekonomik verileri konsolide ederek özetle.`;
}

// SONRA:
const timeRangeDescription = `Sadece ${date} tarihindeki güncel gelişmeleri özetle. Eğer bu tarihte yeni bir veri veya haber yoksa, sadece "Belirlenen tarihte herhangi bir güncel ekonomik veri veya haber bulunamadı." yaz.`;
```

- [ ] **Step 3: Prompt'tan `Tarama Tipi` satırını kaldır**

Satır 89'daki şu satırı prompt string'inden sil:

```ts
// SİL (prompt içinden):
    Tarama Tipi: ${scanType.toUpperCase()}
```

---

### Task 6: `verifySourceStatus` sadeleştirmesi — gemini.ts

**Files:**
- Modify: `src/lib/gemini.ts:242` (`verifySourceStatus` imzası)
- Modify: `src/lib/gemini.ts:275` (`verifySourceStatusWithModel` imzası)
- Modify: `src/lib/gemini.ts:282-307` (prompt içeriği)
- Modify: `src/lib/gemini.ts:327` (`scrapeUrl` çağrısı)

- [ ] **Step 1: `verifySourceStatus` imzasından `scanType` kaldır**

Satır 242-244'ü şöyle değiştir:

```ts
// ÖNCE:
export const verifySourceStatus = async (url: string, date: string, scanType: string) => {
  try {
    return await verifySourceStatusWithModel(url, date, scanType, "gemini-3-flash-preview");

// SONRA:
export const verifySourceStatus = async (url: string, date: string) => {
  try {
    return await verifySourceStatusWithModel(url, date, "gemini-3-flash-preview");
```

- [ ] **Step 2: Fallback çağrısındaki `scanType`'ı da kaldır**

Satır 257'yi şöyle değiştir:

```ts
// ÖNCE:
return await verifySourceStatusWithModel(url, date, scanType, "gemini-3.1-pro-preview");

// SONRA:
return await verifySourceStatusWithModel(url, date, "gemini-3.1-pro-preview");
```

- [ ] **Step 3: `verifySourceStatusWithModel` imzasından `scanType` kaldır**

Satır 275'i şöyle değiştir:

```ts
// ÖNCE:
const verifySourceStatusWithModel = async (url: string, date: string, scanType: string, modelName: string) => {

// SONRA:
const verifySourceStatusWithModel = async (url: string, date: string, modelName: string) => {
```

- [ ] **Step 4: Prompt'tan `Tarama Periyodu` satırı ve periyot referansını temizle**

Satır 282-307 arasındaki prompt'u şöyle değiştir:

```ts
// ÖNCE:
  const prompt = `Bu URL'yi ziyaret et ve içeriğini incele: ${url}. 
    
    Sistem Zamanı: ${currentTime}
    Hedef Tarih: ${date} (${dayName})
    Tarama Periyodu: ${scanType}
    
    Görev:
    1. Link çalışıyor mu? (Erişilebilir mi?)
    2. Bu kaynakta TAM OLARAK ${date} (${dayName}) tarihinde (veya bu tarihin dahil olduğu ${scanType} periyodunda) yayınlanmış YENİ bir rapor, haber veya veri var mı?
    
    Önemli Kurallar:
    - 'scrapeUrl' aracını kullanarak sayfanın en güncel halini oku. URL'yi ziyaret etmeden karar verme.
    - Eğer sayfa bir liste sayfasıysa (blog, rapor listesi vb.), en üstteki/en güncel öğenin tarihine bak.
    - Eğer tarih ${date} ile tam eşleşmiyorsa (veya periyot dışındaysa) "outdated" olarak işaretle.
    - Sadece "Mart 2026" yazması yetmez, gün bazlı kontrolde günün de tutması gerekir.

// SONRA:
  const prompt = `Bu URL'yi ziyaret et ve içeriğini incele: ${url}. 
    
    Sistem Zamanı: ${currentTime}
    Hedef Tarih: ${date} (${dayName})
    
    Görev:
    1. Link çalışıyor mu? (Erişilebilir mi?)
    2. Bu kaynakta TAM OLARAK ${date} (${dayName}) tarihinde yayınlanmış YENİ bir rapor, haber veya veri var mı?
    
    Önemli Kurallar:
    - 'scrapeUrl' aracını kullanarak sayfanın en güncel halini oku. URL'yi ziyaret etmeden karar verme.
    - Eğer sayfa bir liste sayfasıysa (blog, rapor listesi vb.), en üstteki/en güncel öğenin tarihine bak.
    - Eğer tarih ${date} ile tam eşleşmiyorsa "outdated" olarak işaretle.
    - Sadece "Mart 2026" yazması yetmez, gün bazlı kontrolde günün de tutması gerekir.
```

- [ ] **Step 5: `scrapeUrl` çağrısından `scanType` kaldır**

Satır 327'yi şöyle değiştir:

```ts
// ÖNCE:
const content = await scrapeUrl(call.args.url as string, scanType, date);

// SONRA:
const content = await scrapeUrl(call.args.url as string, 'daily', date);
```

---

### Task 7: İş Bankası scraping'deki haftalık/aylık dallarını kaldır — server.ts

**Files:**
- Modify: `server.ts:150-158`

- [ ] **Step 1: Haftalık ve aylık URL dallarını kaldır**

Satır 150-158'i şöyle değiştir:

```ts
// ÖNCE:
let constructedUrl = '';
if (scanType === 'daily') {
  constructedUrl = `https://ekonomi.isbank.com.tr/raporlar/${day}-${monthLower}-${year}`;
} else if (scanType === 'weekly') {
  constructedUrl = `https://ekonomi.isbank.com.tr/haftalik-bulten`;
} else if (scanType === 'monthly') {
  constructedUrl = `https://ekonomi.isbank.com.tr/raporlar/dunya-ve-turkiye-ekonomisindeki-gelismeler-${monthLower}-${year}`;
}

// SONRA:
const constructedUrl = `https://ekonomi.isbank.com.tr/raporlar/${day}-${monthLower}-${year}`;
```

---

### Task 8: Son doğrulama

- [ ] **Step 1: TypeScript derleme kontrolü**

```bash
npx tsc --noEmit
```

Beklenen: 0 hata.

- [ ] **Step 2: Uygulamayı başlat ve manuel test et**

```bash
npm run dev
```

Kontrol edilecekler:
- Sidebar'da "Tarama Periyodu" bölümü görünmüyor ✓
- Tarih seçici hâlâ çalışıyor ✓
- "Taramayı Başlat" butonu çalışıyor, analiz üretiyor ✓
- Arşivde eski kayıtlar dahil tüm kayıtlar "Günlük Analiz" gösteriyor ✓
- Arşivden bir kayıt açıldığında uygulama çökmüyor ✓

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx src/lib/gemini.ts server.ts
git commit -m "refactor: remove weekly/monthly/yearly scan types, daily-only analysis"
```
