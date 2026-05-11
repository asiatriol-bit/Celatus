require('dotenv').config();
const http = require('http');
const path = require('path');
const fs = require('fs');
const bot = require('./botcore');

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MANAGER_CHAT_ID = process.env.MANAGER_CHAT_ID;

if (!TOKEN) { console.error('❌ Укажите TELEGRAM_BOT_TOKEN'); process.exit(1); }

const WEBHOOK_PATH = `/bot${TOKEN}`;
const { COMPANY, PRODUCTS, FAQ, QUALIFICATION, getRecommendation } = require('./data');
const kb = require('./keyboards');

const sessions = new Map();

function esc(text) { return String(text).replace(/([_*\[\]()~`>#+=|{}.!-])/g, '\\$1'); }
function getSession(id) { if (!sessions.has(id)) sessions.set(id, {}); return sessions.get(id); }
function labelFor(list, id) { const f = list.find(i => i.id === id); return f ? f.label : id; }

async function sendPhoto(chatId, photoFile, caption, options = {}) {
  const fullPath = path.join(__dirname, '..', photoFile);
  if (fs.existsSync(fullPath)) {
    return bot.sendPhoto(chatId, fullPath, { caption, parse_mode: 'Markdown', ...options });
  }
  return bot.sendMessage(chatId, caption, { parse_mode: 'Markdown', ...options });
}

async function showMainMenu(chatId, text) {
  return bot.sendMessage(chatId,
    text || `🏠 *Главное меню CELATUS*\n\nЩелевые диффузоры скрытого монтажа\nСайт: ${COMPANY.website}\n\nВыберите, что вас интересует:`,
    { parse_mode: 'Markdown', ...kb.mainMenu }
  );
}

async function handleMessage(msg) {
  if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();
  const session = getSession(userId);

  if (text === '/start') {
    sessions.delete(userId);
    const name = msg.from.first_name || 'Привет';
    return bot.sendMessage(chatId,
      `👋 *${name}, добро пожаловать в CELATUS!*\n\nМы производим *щелевые диффузоры скрытого монтажа* — единственный производитель в Узбекистане.\n\n🔹 1-, 2-, 3-щелевые модели\n🔹 Непрерывные линии без швов\n🔹 Любой цвет RAL под проект\n🔹 Любимый выбор дизайнеров и архитекторов\n\nСайт: *${COMPANY.website}*`,
      { parse_mode: 'Markdown', ...kb.mainMenu }
    );
  }

  if (session.step === 'ask_name') {
    session.name = text; session.step = 'ask_phone';
    return bot.sendMessage(chatId, `Отлично, *${esc(text)}*! 👋\n\nТеперь введите ваш номер телефона:`, { parse_mode: 'Markdown', ...kb.cancelKeyboard });
  }

  if (session.step === 'ask_phone') {
    session.phone = text; session.step = 'done';
    const product = PRODUCTS.find(p => p.id === session.requestProduct) || PRODUCTS.find(p => p.id === session.recommendedProduct) || { name: 'Общий запрос' };
    const roleLabel = session.role ? labelFor(QUALIFICATION.roles, session.role) : '—';
    const projectLabel = session.projectType ? labelFor(QUALIFICATION.projectTypes, session.projectType) : '—';
    const lengthLabel = session.length ? labelFor(QUALIFICATION.lengths, session.length) : '—';

    await bot.sendMessage(chatId,
      `✅ *Заявка принята!*\n\nИмя: *${esc(session.name)}*\nТелефон: *${esc(session.phone)}*\n\nМенеджер свяжется с вами в ближайшее время.\nОбычно отвечаем за 15–30 минут в рабочее время.`,
      { parse_mode: 'Markdown', ...kb.afterRequestKeyboard }
    );

    if (MANAGER_CHAT_ID) {
      await bot.sendMessage(MANAGER_CHAT_ID,
        `🔔 НОВАЯ ЗАЯВКА — CELATUS\n━━━━━━━━━━━━━━━\n👤 Имя: ${session.name}\n📱 Телефон: ${session.phone}\n🆔 Telegram: @${msg.from.username || '—'} (id: ${userId})\n━━━━━━━━━━━━━━━\n📐 Продукт: ${product.name}\n🎨 Роль: ${roleLabel}\n🏗 Объект: ${projectLabel}\n📏 Длина: ${lengthLabel}\n━━━━━━━━━━━━━━━\n🕐 ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}`
      ).catch(e => console.error('Ошибка отправки менеджеру:', e.message));
    }
    sessions.delete(userId);
    return;
  }

  return showMainMenu(chatId, `Не понял запрос. Выберите раздел 👇`);
}

async function handleCallback(query) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  await bot.answerCallbackQuery(query.id);

  if (data === 'main_menu') { sessions.delete(userId); return showMainMenu(chatId); }

  if (data === 'qualify_start') {
    sessions.set(userId, { step: 'role' });
    return bot.sendMessage(chatId, `📐 *Подбор диффузора*\n\nКто вы?`, { parse_mode: 'Markdown', ...kb.roleKeyboard });
  }

  if (data.startsWith('role_')) {
    const session = getSession(userId); session.role = data.replace('role_', ''); session.step = 'projectType';
    return bot.sendMessage(chatId, `Отлично! Какой тип объекта?`, { parse_mode: 'Markdown', ...kb.projectTypeKeyboard });
  }

  if (data.startsWith('project_')) {
    const session = getSession(userId); session.projectType = data.replace('project_', ''); session.step = 'slotChoice';
    return bot.sendMessage(chatId, `Какой диффузор вас интересует?`, { parse_mode: 'Markdown', ...kb.slotKeyboard });
  }

  if (data.startsWith('slot_')) {
    const session = getSession(userId); session.slotChoice = data.replace('slot_', ''); session.step = 'length';
    return bot.sendMessage(chatId, `Примерная суммарная длина диффузора?`, { parse_mode: 'Markdown', ...kb.lengthKeyboard });
  }

  if (data.startsWith('length_')) {
    const session = getSession(userId);
    session.length = data.replace('length_', ''); session.step = 'recommend';
    const product = getRecommendation(session);
    session.recommendedProduct = product.id;
    const roleLabel = labelFor(QUALIFICATION.roles, session.role);
    const projectLabel = labelFor(QUALIFICATION.projectTypes, session.projectType);
    const lengthLabel = labelFor(QUALIFICATION.lengths, session.length);
    const slotLabel = session.slotChoice === 'help' ? `рекомендуем ${product.slots}-щелевой` : labelFor(QUALIFICATION.slotChoices, session.slotChoice);
    const caption = `✅ *Рекомендуем: ${product.name}*\n\n${product.description}\n\n📊 *Характеристики:*\n• Воздухоподача: ${product.airflow}\n• Лучше всего для: ${product.bestFor}\n• Цена: ${product.priceFrom}\n\n⭐ ${product.feature}\n\n━━━━━━━━━━━━━━━\n🎨 ${roleLabel} | ${projectLabel}\n📏 Длина: ${lengthLabel} | ${slotLabel}`;
    return sendPhoto(chatId, product.photoFile, caption, kb.productActions(product.id));
  }

  if (data.startsWith('request_')) {
    const session = getSession(userId); session.step = 'ask_name'; session.requestProduct = data.replace('request_', '');
    return bot.sendMessage(chatId, `📝 *Запрос расчёта стоимости*\n\nВведите ваше имя:`, { parse_mode: 'Markdown', ...kb.cancelKeyboard });
  }

  if (data === 'catalog') {
    return bot.sendMessage(chatId, `📦 *Каталог Celatus*\n\nВыберите модель:`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [...PRODUCTS.map(p => [{ text: p.name, callback_data: `product_${p.id}` }]), [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]] } });
  }

  if (data.startsWith('product_')) {
    const product = PRODUCTS.find(p => p.id === data.replace('product_', '')); if (!product) return;
    const caption = `📐 *${product.name}*\n\n${product.description}\n\n• Воздухоподача: ${product.airflow}\n• Применение: ${product.bestFor}\n• Цена: ${product.priceFrom}\n\n⭐ ${product.feature}`;
    return sendPhoto(chatId, product.photoFile, caption, kb.catalogItem(product.id));
  }

  if (data === 'faq_menu') {
    return bot.sendMessage(chatId, `❓ *Частые вопросы:*\n\nВыберите вопрос:`, { parse_mode: 'Markdown', ...kb.faqMenu(FAQ) });
  }

  if (data.startsWith('faq_')) {
    const item = FAQ.find(f => f.id === data.replace('faq_', '')); if (!item) return;
    return bot.sendMessage(chatId, `❓ *${item.question}*\n\n${item.answer}`, { parse_mode: 'Markdown', ...kb.backToFaq() });
  }

  if (data === 'contact_manager') {
    return bot.sendMessage(chatId,
      `📞 *Контакты Celatus*\n\n📱 Телефон: ${COMPANY.phone}\n💬 Telegram: ${COMPANY.telegram}\n🌐 Сайт: ${COMPANY.website}\n📍 ${COMPANY.address}\n🕐 ${COMPANY.workingHours}\n\nИли оставьте заявку — мы перезвоним:`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '📝 Оставить заявку', callback_data: 'request_general' }], [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]] } }
    );
  }
}

// HTTP сервер
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === WEBHOOK_PATH) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        if (update.message) await handleMessage(update.message);
        if (update.callback_query) await handleCallback(update.callback_query);
      } catch(e) { console.error('Update error:', e.message); }
      res.writeHead(200); res.end('OK');
    });
  } else {
    res.writeHead(200); res.end('OK');
  }
});

const webhookTarget = WEBHOOK_URL ? `${WEBHOOK_URL}${WEBHOOK_PATH}` : null;

function setWebhook() {
  if (!webhookTarget) return;
  bot.setWebhook(webhookTarget)
    .then(() => console.log(`✅ Webhook set: ${webhookTarget}`))
    .catch(e => console.error('❌ Webhook error:', e.message));
}

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  if (webhookTarget) {
    // Агрессивно переустанавливаем webhook первые 2 минуты (каждые 4с),
    // чтобы пережить старый экземпляр на Render, который его удаляет
    let ticks = 0;
    const fast = setInterval(() => {
      setWebhook();
      if (++ticks >= 30) {
        clearInterval(fast);
        setInterval(setWebhook, 30000); // потом раз в 30с
      }
    }, 4000);
    setWebhook();
  }
});

