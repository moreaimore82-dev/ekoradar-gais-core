# PWA Desteği — Tasarım Dokümanı

**Tarih:** 2026-04-17  
**Proje:** EkoRadar GAIS Core

---

## Amaç

EkoRadar'ı Android ve diğer cihazlara ana ekrana eklenebilen, kurulabilir bir Progressive Web App (PWA) haline getirmek. Kullanıcı uygulamayı bir kez yükledikten sonra install butonu kaybolur.

---

## Yaklaşım

Manuel PWA — yeni npm bağımlılığı yok. `public/` klasörüne statik dosyalar eklenir, `index.html` ve `App.tsx` güncellenir.

---

## Dosya Değişiklikleri

### 1. `public/manifest.json` (yeni)

```json
{
  "name": "EkoRadar",
  "short_name": "EkoRadar",
  "description": "Yapay Zeka Destekli Ekonomi Analiz Sistemi",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#09090b",
  "theme_color": "#09090b",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icons/icon-192.svg", "sizes": "192x192", "type": "image/svg+xml" },
    { "src": "/icons/icon-512.svg", "sizes": "512x512", "type": "image/svg+xml", "purpose": "maskable" }
  ]
}
```

### 2. `public/icons/icon-192.svg` (yeni)

Siyah zemin (#09090b), beyaz "ER" monogram, yuvarlak köşeler.

### 3. `public/icons/icon-512.svg` (yeni)

Aynı tasarım, 512×512, maskable padding ile (içerik güvenli alanda).

### 4. `public/sw.js` (yeni)

Minimal service worker — Chrome install prompt için SW kaydı yeterli, tam offline cache gerekmez:
- Install event: boş (sadece SW'ın var olması install prompt'u tetikler)
- Fetch event: `event.respondWith(fetch(event.request))` — ağı olduğu gibi geçirir
- Activate event: `clients.claim()` — hemen kontrolü al

Not: Vite build hash'li dosya adları üretir, bu yüzden statik önbellekleme yapılmaz.

### 5. `index.html` (güncelleme)

Eklenecekler:
- `<link rel="manifest" href="/manifest.json">`
- Service worker kayıt script bloğu (`<script>` içinde, `navigator.serviceWorker.register('/sw.js')`)
- Mevcut apple meta etiketleri korunur, `apple-touch-icon` SVG'ye yönlendirilir

### 6. `src/App.tsx` (güncelleme)

**State:**
```ts
const [installPrompt, setInstallPrompt] = useState<any>(null);
const [isInstalled, setIsInstalled] = useState(false);
```

**Efekt:**
- `beforeinstallprompt` → `installPrompt` state'e kaydedilir, event default'u engellenir
- `appinstalled` → `isInstalled = true`, localStorage'a `pwa_installed=true` kaydedilir
- Mount'ta localStorage kontrol: `pwa_installed=true` ise buton hiç gösterilmez

**Buton (floating, sağ alt köşe):**
- `installPrompt && !isInstalled` koşulunda görünür
- Konumlandırma: `fixed bottom-6 right-6 z-50`
- Tasarım: koyu arka plan (`bg-zinc-900 border border-zinc-700`), beyaz metin, ⬇ ikonu, `shadow-2xl`
- Tıklayınca: `installPrompt.prompt()` → kullanıcı onaylarsa `setIsInstalled(true)`, `setInstallPrompt(null)`
- Framer Motion ile fade-in animasyonu

---

## Cihaz Uyumluluğu

| Platform | Destek |
|---|---|
| Android Chrome | `beforeinstallprompt` tam destek — buton + native diyalog |
| iOS Safari | `beforeinstallprompt` yok — buton görünmez; kullanıcı "Ana Ekrana Ekle" ile yükleyebilir |
| Desktop Chrome/Edge | `beforeinstallprompt` tam destek |
| Firefox | Manifest okunur ama install prompt yok |

iOS için özel bir "Safari'de Ana Ekrana Ekle" talimatı göstermek kapsam dışı bırakıldı (YAGNI).

---

## Kapsam Dışı

- Push notification
- Background sync
- iOS install yönlendirme banner'ı
- Offline-first tam önbellekleme (API çağrıları önbelleğe alınmaz)
