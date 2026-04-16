import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { url, selectedDate } = body;
  if (!url) return { statusCode: 400, body: JSON.stringify({ error: 'URL is required' }) };

  try {
    let targetUrl = url;

    if (url.includes('ekonomi.isbank.com.tr')) {
      try {
        const turkishMonthsLower = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
        const dateObj = new Date(selectedDate || new Date());
        const day = dateObj.getDate().toString();
        const monthLower = turkishMonthsLower[dateObj.getMonth()];
        const year = dateObj.getFullYear().toString();
        const constructedUrl = `https://ekonomi.isbank.com.tr/raporlar/${day}-${monthLower}-${year}`;

        const checkResponse = await axios.get(constructedUrl, {
          timeout: 10000,
          httpsAgent,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          responseType: 'arraybuffer',
        }).catch(() => null);

        if (checkResponse?.status === 200) targetUrl = constructedUrl;
      } catch (e) {
        // fall through to original URL
      }
    }

    const response = await axios.get(targetUrl, {
      timeout: 45000,
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.google.com/',
      },
      responseType: 'arraybuffer',
    });

    const contentType = response.headers['content-type'] || '';
    const isPdf = contentType.includes('application/pdf') || targetUrl.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      const data = await pdf(Buffer.from(response.data));
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: data.text, type: 'pdf' }),
      };
    } else {
      const html = Buffer.from(response.data).toString('utf-8');
      const $ = cheerio.load(html);
      $('script, style').remove();
      const text = $('body').text().replace(/\s+/g, ' ').trim();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text.substring(0, 20000), type: 'html' }),
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to scrape site', message: error.message }),
    };
  }
};
