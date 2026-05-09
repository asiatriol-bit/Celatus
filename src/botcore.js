const https = require('https');

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

module.exports = {
  sendMessage: (chat_id, text, extra = {}) => apiCall('sendMessage', { chat_id, text, ...extra }),
  sendPhoto: (chat_id, photo, extra = {}) => apiCall('sendPhoto', { chat_id, photo, ...extra }),
  answerCallbackQuery: (callback_query_id, extra = {}) => apiCall('answerCallbackQuery', { callback_query_id, ...extra }),
  setWebhook: (url) => apiCall('setWebhook', { url }),
  getWebhookInfo: () => apiCall('getWebhookInfo'),
};
