import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export const handler = async () => {
  try {
    const response = await axios.get('https://www.bloomberght.com/', {
      timeout: 10000,
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    const $ = cheerio.load(response.data);
    const marketData = [];

    $('.market-data .item').each((_, el) => {
      const name = $(el).find('.label').text().trim();
      const value = $(el).find('.value').text().trim();
      const change = $(el).find('.percent').text().trim();
      const isUp = $(el).find('.percent').hasClass('up') || change.includes('+');
      const isDown = $(el).find('.percent').hasClass('down') || change.includes('-');
      if (name && value) marketData.push({ name, value, change, isUp, isDown });
    });

    if (marketData.length === 0) {
      $('ul.market-data li').each((_, el) => {
        const name = $(el).find('span.name').text().trim();
        const value = $(el).find('span.value').text().trim();
        const change = $(el).find('span.change').text().trim();
        if (name) marketData.push({ name, value, change, isUp: change.includes('+'), isDown: change.includes('-') });
      });
    }

    const targets = ['BIST 100', 'USD', 'EUR', 'ONS', 'BTC'];
    const filteredData = marketData.filter(item =>
      targets.some(t => item.name.toUpperCase().includes(t))
    );

    if (filteredData.length < 3) {
      const dovizRes = await axios.get('https://www.doviz.com/', { timeout: 5000, httpsAgent }).catch(() => null);
      if (dovizRes) {
        const $d = cheerio.load(dovizRes.data);
        const dData = [];
        $d('.market-data .item').each((_, el) => {
          const name = $d(el).find('.name').text().trim();
          const value = $d(el).find('.value').text().trim();
          const change = $d(el).find('.change').text().trim();
          dData.push({ name: name.replace('İ', 'I').toUpperCase(), value, change, isUp: change.includes('+'), isDown: change.includes('-') });
        });
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dData.length > 0 ? dData : marketData),
        };
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filteredData.length > 0 ? filteredData : marketData),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch market data' }),
    };
  }
};
