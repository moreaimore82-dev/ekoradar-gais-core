import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import * as cheerio from "cheerio";
import cors from "cors";
import { createRequire } from "module";
import https from "https";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // API Route: Fetch system info (memory usage)
  app.get("/api/system-info", (req, res) => {
    const mem = process.memoryUsage();
    // Updated to 2GB (2048MB) as a more realistic limit for the environment
    const totalMem = 2048 * 1024 * 1024; 
    const usedPercent = Math.round((mem.rss / totalMem) * 100);
    
    res.json({
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
      percent: Math.min(usedPercent, 100)
    });
  });

  // API Route: Fetch market data
  app.get("/api/market-data", async (req, res) => {
    try {
      const response = await axios.get("https://www.bloomberght.com/", {
        timeout: 10000,
        httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      const marketData: any[] = [];

      // BloombergHT top bar data
      $('.market-data .item').each((_, el) => {
        const name = $(el).find('.label').text().trim();
        const value = $(el).find('.value').text().trim();
        const change = $(el).find('.percent').text().trim();
        const isUp = $(el).find('.percent').hasClass('up') || $(el).find('.percent').text().includes('+');
        const isDown = $(el).find('.percent').hasClass('down') || $(el).find('.percent').text().includes('-');

        if (name && value) {
          marketData.push({ name, value, change, isUp, isDown });
        }
      });

      // If top bar parsing fails or is incomplete, try specific items
      const targets = [
        { label: 'BIST 100', key: 'BIST 100' },
        { label: 'DOLAR', key: 'USD' },
        { label: 'EURO', key: 'EUR' },
        { label: 'ALTIN/ONS', key: 'ONS' },
        { label: 'BITCOIN', key: 'BTC' }
      ];

      // Fallback/Refinement: BloombergHT has a specific widget for these
      if (marketData.length === 0) {
          // Try alternative parsing if the structure is different
          $('ul.market-data li').each((_, el) => {
              const name = $(el).find('span.name').text().trim();
              const value = $(el).find('span.value').text().trim();
              const change = $(el).find('span.change').text().trim();
              const isUp = change.includes('+');
              const isDown = change.includes('-');
              if (name) marketData.push({ name, value, change, isUp, isDown });
          });
      }

      // Filter to only requested ones if possible, or just return what we found
      const filteredData = marketData.filter(item => 
        targets.some(t => item.name.toUpperCase().includes(t.label) || item.name.toUpperCase().includes(t.key))
      );

      // If still empty, let's try a more generic approach or return a mock for safety (but we want real)
      // Actually, let's try doviz.com as a fallback in the same request if bloomberg fails
      if (filteredData.length < 3) {
          const dovizRes = await axios.get("https://www.doviz.com/", { timeout: 5000, httpsAgent }).catch(() => null);
          if (dovizRes) {
              const $d = cheerio.load(dovizRes.data);
              const dData: any[] = [];
              $d('.market-data .item').each((_, el) => {
                  const name = $d(el).find('.name').text().trim();
                  const value = $d(el).find('.value').text().trim();
                  const change = $d(el).find('.change').text().trim();
                  dData.push({ 
                      name: name.replace('İ', 'I').toUpperCase(), 
                      value, 
                      change, 
                      isUp: change.includes('+'), 
                      isDown: change.includes('-') 
                  });
              });
              return res.json(dData.length > 0 ? dData : marketData);
          }
      }

      res.json(filteredData.length > 0 ? filteredData : marketData);
    } catch (error: any) {
      console.error("Market data fetch error:", error.message);
      res.status(500).json({ error: "Failed to fetch market data" });
    }
  });

  // API Route: Scrape URL content
  app.post("/api/scrape", async (req, res) => {
    const { url, selectedDate } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      let targetUrl = url;

      // Special handling for İş Bankası
      if (url.includes('ekonomi.isbank.com.tr')) {
        try {
          const turkishMonthsLower = [
            'ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran',
            'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'
          ];
          
          const dateObj = new Date(selectedDate || new Date());
          const day = dateObj.getDate().toString();
          const monthLower = turkishMonthsLower[dateObj.getMonth()];
          const year = dateObj.getFullYear().toString();

          const constructedUrl = `https://ekonomi.isbank.com.tr/raporlar/${day}-${monthLower}-${year}`;

          if (constructedUrl) {
            console.log(`İş Bankası: Testing constructed daily URL: ${constructedUrl}`);
            try {
              // Use GET instead of HEAD for more reliable check
              const checkResponse = await axios.get(constructedUrl, {
                timeout: 10000,
                httpsAgent,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                },
                responseType: 'arraybuffer' // Fetch as buffer to be safe
              });
              if (checkResponse.status === 200) {
                targetUrl = constructedUrl;
                console.log(`İş Bankası: Constructed URL is valid.`);
              }
            } catch (checkError) {
              console.log(`İş Bankası: Constructed URL failed, falling back to search logic.`);
            }
          }
        } catch (e) {
          console.error("Error in İş Bankası specific handling:", e);
        }
      }

      console.log(`Scraping target URL: ${targetUrl}`);

      // Fetch as arraybuffer to handle both HTML and PDF correctly
      const response = await axios.get(targetUrl, {
        timeout: 45000, // Increased timeout
        httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://www.google.com/'
        },
        responseType: 'arraybuffer'
      });

      console.log(`Scrape successful for ${targetUrl}. Status: ${response.status}`);
      const contentType = response.headers['content-type'] || '';
      const isPdf = contentType.includes('application/pdf') || targetUrl.toLowerCase().endsWith('.pdf');

      if (isPdf) {
        console.log(`Processing as PDF: ${targetUrl}`);
        const data = await pdf(Buffer.from(response.data));
        return res.json({ content: data.text, type: 'pdf' });
      } else {
        console.log(`Processing as HTML: ${targetUrl}`);
        const html = Buffer.from(response.data).toString('utf-8');
        const $ = cheerio.load(html);
        
        // Remove script and style elements
        $('script, style').remove();
        const text = $('body').text().replace(/\s+/g, ' ').trim();
        console.log(`Extracted ${text.length} characters of text.`);
        return res.json({ content: text.substring(0, 20000), type: 'html' }); // Increased limit
      }
    } catch (error: any) {
      console.error(`Error scraping ${url}:`, error.message);
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error(`Headers:`, error.response.headers);
      }
      res.status(500).json({ error: "Failed to scrape site", message: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Ensure index.html is served for non-API routes
    app.get('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) return next();
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
