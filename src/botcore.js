const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BASE = `https://api.telegram.org/bot${TOKEN}`;

function apiCall(method, params = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params);
    const req = https.request(`${BASE}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data).result));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function multipartCall(method, fields, fileField, filePath) {
  return new Promise((resolve, reject) => {
    const boundary = '----TGBotBoundary' + Date.now();
    const fileData = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    const mimeType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const parts = [];
    for (const [key, val] of Object.entries(fields)) {
      if (val === undefined || val === null) continue;
      const v = typeof val === 'object' ? JSON.stringify(val) : String(val);
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${v}\r\n`
      );
    }
    const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const headerBuf = Buffer.from(parts.join('') + fileHeader);
    const footerBuf = Buffer.from(footer);
    const totalLength = headerBuf.length + fileData.length + footerBuf.length;

    const req = https.request(`${BASE}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': totalLength }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data).result));
    });
    req.on('error', reject);
    req.write(headerBuf);
    req.write(fileData);
    req.write(footerBuf);
    req.end();
  });
}

module.exports = {
  sendMessage: (chat_id, text, extra = {}) => apiCall('sendMessage', { chat_id, text, ...extra }),
  sendPhoto: (chat_id, photo, extra = {}) => {
    if (typeof photo === 'string' && !photo.startsWith('http')) {
      // local file path — use multipart upload
      const { caption, parse_mode, reply_markup } = extra;
      return multipartCall('sendPhoto', { chat_id, caption, parse_mode, reply_markup }, 'photo', photo);
    }
    return apiCall('sendPhoto', { chat_id, photo, ...extra });
  },
  answerCallbackQuery: (callback_query_id, extra = {}) => apiCall('answerCallbackQuery', { callback_query_id, ...extra }),
  setWebhook: (url) => apiCall('setWebhook', { url }),
  getWebhookInfo: () => apiCall('getWebhookInfo'),
};
