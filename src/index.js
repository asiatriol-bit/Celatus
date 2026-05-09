require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');
const http = require('http');

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => res.end('OK')).listen(PORT);

const { COMPANY, PRODUCTS, FAQ, QUALIFICATION, getRecommendation } = require('./data');
const kb = require('./keyboards');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MANAGER_CHAT_ID = process.env.MANAGER_CHAT_ID;

if (!TOKEN) {
  console.error('❌ Укажите TELEGRAM_BOT_TOKEN в файле .env');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// chatId → { step, role, projectType, slotChoice, length, name, phone, product }
const sessions = new Map();

// ─── Утилиты ────────────────────────────────────────────────────────────────

function esc(text) {
  return String(text).replace(/([_*\[\]()~`>#+=|{}.!-])/g, '\\$1');
}

function getSession(userId) {
  if (!sessions.has(userId)) sessions.set(userId, {});
  return sessions.get(userId);
}

function labelFor(list, id) {
  const found = list.find(i => i.id === id);
  return found ? found.label : id;
}

async function sendPhoto(chatId, photoFile, caption, options = {}) {
  const fullPath = path.join(__dirname, '..', photoFile);
  if (fs.existsSync(fullPath)) {
    return bot.sendPhoto(chatId, fullPath, { caption, parse_mode: 'Markdown', ...options });
  }
  // Фото нет — отправляем текст
  return bot.sendMessage(chatId, caption, { parse_mode: 'Markdown', ...options });
}

async function showMainMenu(chatId, text) {
  const msg = text ||
    `🏠 *Главное меню CELATUS*\n\n` +
    `Щелевые диффузоры скрытого монтажа\n` +
    `Сайт: ${COMPANY.website}\n\n` +
    `Выберите, что вас интересует:`;
  return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', ...kb.mainMenu });
}

// ─── /start ──────────────────────────────────────────────────────────────────

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || 'Привет';
  sessions.delete(msg.from.id);

  await bot.sendMessage(chatId,
    `👋 *${name}, добро пожаловать в CELATUS!*\n\n` +
    `Мы производим *щелевые диффузоры скрытого монтажа* — ` +
    `единственный производитель в Узбекистане.\n\n` +
    `🔹 1-, 2-, 3-щелевые модели\n` +
    `🔹 Непрерывные линии без швов\n` +
    `🔹 Любой цвет RAL под проект\n` +
    `🔹 Любимый выбор дизайнеров и архитекторов\n\n` +
    `Сайт: *${COMPANY.website}*`,
    { parse_mode: 'Markdown', ...kb.mainMenu }
  );
});

// ─── Callback-обработчик ─────────────────────────────────────────────────────

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  await bot.answerCallbackQuery(query.id);

  // ── Главное меню ──
  if (data === 'main_menu') {
    sessions.delete(userId);
    return showMainMenu(chatId);
  }

  // ── Квалификация: старт ──
  if (data === 'qualify_start') {
    sessions.set(userId, { step: 'role' });
    return bot.sendMessage(chatId,
      `📐 *Подбор диффузора*\n\nКто вы?`,
      { parse_mode: 'Markdown', ...kb.roleKeyboard }
    );
  }

  // ── Квалификация: роль ──
  if (data.startsWith('role_')) {
    const role = data.replace('role_', '');
    const session = getSession(userId);
    session.role = role;
    session.step = 'projectType';
    return bot.sendMessage(chatId,
      `Отлично! Какой тип объекта?`,
      { parse_mode: 'Markdown', ...kb.projectTypeKeyboard }
    );
  }

  // ── Квалификация: тип объекта ──
  if (data.startsWith('project_')) {
    const projectType = data.replace('project_', '');
    const session = getSession(userId);
    session.projectType = projectType;
    session.step = 'slotChoice';
    return bot.sendMessage(chatId,
      `Какой диффузор вас интересует?`,
      { parse_mode: 'Markdown', ...kb.slotKeyboard }
    );
  }

  // ── Квалификация: тип щели ──
  if (data.startsWith('slot_')) {
    const slotChoice = data.replace('slot_', '');
    const session = getSession(userId);
    session.slotChoice = slotChoice;
    session.step = 'length';
    return bot.sendMessage(chatId,
      `Примерная суммарная длина диффузора?`,
      { parse_mode: 'Markdown', ...kb.lengthKeyboard }
    );
  }

  // ── Квалификация: длина → показать рекомендацию ──
  if (data.startsWith('length_')) {
    const length = data.replace('length_', '');
    const session = getSession(userId);
    session.length = length;
    session.step = 'recommend';

    const product = getRecommendation(session);
    session.recommendedProduct = product.id;

    const roleLabel = labelFor(QUALIFICATION.roles, session.role);
    const projectLabel = labelFor(QUALIFICATION.projectTypes, session.projectType);
    const lengthLabel = labelFor(QUALIFICATION.lengths, session.length);
    const slotLabel = session.slotChoice === 'help'
      ? `рекомендуем ${product.slots}-щелевой`
      : labelFor(QUALIFICATION.slotChoices, session.slotChoice);

    const caption =
      `✅ *Рекомендуем: ${product.name}*\n\n` +
      `${product.description}\n\n` +
      `📊 *Характеристики:*\n` +
      `• Воздухоподача: ${product.airflow}\n` +
      `• Лучше всего для: ${product.bestFor}\n` +
      `• Цена: ${product.priceFrom}\n\n` +
      `⭐ ${product.feature}\n\n` +
      `━━━━━━━━━━━━━━━\n` +
      `🎨 ${roleLabel} | ${projectLabel}\n` +
      `📏 Длина: ${lengthLabel} | ${slotLabel}`;

    return sendPhoto(chatId, product.photoFile, caption, kb.productActions(product.id));
  }

  // ── Запрос расчёта (из каталога или рекомендации) ──
  if (data.startsWith('request_')) {
    const productId = data.replace('request_', '');
    const session = getSession(userId);
    session.step = 'ask_name';
    session.requestProduct = productId;
    return bot.sendMessage(chatId,
      `📝 *Запрос расчёта стоимости*\n\nВведите ваше имя:`,
      { parse_mode: 'Markdown', ...kb.cancelKeyboard }
    );
  }

  // ── Каталог ──
  if (data === 'catalog') {
    return bot.sendMessage(chatId,
      `📦 *Каталог Celatus*\n\nВыберите модель:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            ...PRODUCTS.map(p => [{ text: p.name, callback_data: `product_${p.id}` }]),
            [{ text: '🏠 Главное меню', callback_data: 'main_menu' }],
          ],
        },
      }
    );
  }

  // ── Отдельная карточка продукта ──
  if (data.startsWith('product_')) {
    const productId = data.replace('product_', '');
    const product = PRODUCTS.find(p => p.id === productId);
    if (!product) return;

    const caption =
      `📐 *${product.name}*\n\n` +
      `${product.description}\n\n` +
      `• Воздухоподача: ${product.airflow}\n` +
      `• Применение: ${product.bestFor}\n` +
      `• Цена: ${product.priceFrom}\n\n` +
      `⭐ ${product.feature}`;

    return sendPhoto(chatId, product.photoFile, caption, kb.catalogItem(product.id));
  }

  // ── FAQ: меню ──
  if (data === 'faq_menu') {
    return bot.sendMessage(chatId,
      `❓ *Частые вопросы:*\n\nВыберите вопрос:`,
      { parse_mode: 'Markdown', ...kb.faqMenu(FAQ) }
    );
  }

  // ── FAQ: ответ ──
  if (data.startsWith('faq_')) {
    const faqId = data.replace('faq_', '');
    const item = FAQ.find(f => f.id === faqId);
    if (!item) return;
    return bot.sendMessage(chatId,
      `❓ *${item.question}*\n\n${item.answer}`,
      { parse_mode: 'Markdown', ...kb.backToFaq() }
    );
  }

  // ── Контакт с менеджером ──
  if (data === 'contact_manager') {
    return bot.sendMessage(chatId,
      `📞 *Контакты Celatus*\n\n` +
      `📱 Телефон: ${COMPANY.phone}\n` +
      `💬 Telegram: ${COMPANY.telegram}\n` +
      `🌐 Сайт: ${COMPANY.website}\n` +
      `📍 ${COMPANY.address}\n` +
      `🕐 ${COMPANY.workingHours}\n\n` +
      `Или оставьте заявку — мы перезвоним:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📝 Оставить заявку', callback_data: 'request_general' }],
            [{ text: '🏠 Главное меню', callback_data: 'main_menu' }],
          ],
        },
      }
    );
  }
});

// ─── Текстовые сообщения (сбор имени/телефона) ───────────────────────────────

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();
  const session = getSession(userId);

  if (session.step === 'ask_name') {
    session.name = text;
    session.step = 'ask_phone';
    return bot.sendMessage(chatId,
      `Отлично, *${esc(text)}*! 👋\n\nТеперь введите ваш номер телефона:`,
      { parse_mode: 'Markdown', ...kb.cancelKeyboard }
    );
  }

  if (session.step === 'ask_phone') {
    session.phone = text;
    session.step = 'done';

    const product = PRODUCTS.find(p => p.id === session.requestProduct)
      || PRODUCTS.find(p => p.id === session.recommendedProduct)
      || { name: 'Общий запрос' };

    const roleLabel = session.role
      ? labelFor(QUALIFICATION.roles, session.role)
      : '—';
    const projectLabel = session.projectType
      ? labelFor(QUALIFICATION.projectTypes, session.projectType)
      : '—';
    const lengthLabel = session.length
      ? labelFor(QUALIFICATION.lengths, session.length)
      : '—';

    // Подтверждение клиенту
    await bot.sendMessage(chatId,
      `✅ *Заявка принята!*\n\n` +
      `Имя: *${esc(session.name)}*\n` +
      `Телефон: *${esc(session.phone)}*\n\n` +
      `Менеджер свяжется с вами в ближайшее время.\n` +
      `Обычно отвечаем за 15–30 минут в рабочее время.`,
      { parse_mode: 'Markdown', ...kb.afterRequestKeyboard }
    );

    // Карточка лида для менеджера
    const leadCard =
      `🔔 НОВАЯ ЗАЯВКА — CELATUS\n` +
      `━━━━━━━━━━━━━━━\n` +
      `👤 Имя: ${session.name}\n` +
      `📱 Телефон: ${session.phone}\n` +
      `🆔 Telegram: @${msg.from.username || '—'} (id: ${userId})\n` +
      `━━━━━━━━━━━━━━━\n` +
      `📐 Продукт: ${product.name}\n` +
      `🎨 Роль: ${roleLabel}\n` +
      `🏗 Объект: ${projectLabel}\n` +
      `📏 Длина: ${lengthLabel}\n` +
      `━━━━━━━━━━━━━━━\n` +
      `🕐 ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })}`;

    if (MANAGER_CHAT_ID) {
      try {
        await bot.sendMessage(MANAGER_CHAT_ID, leadCard);
      } catch (e) {
        console.error('Ошибка отправки менеджеру:', e.message);
      }
    }

    console.log(`📢 Новый лид: ${session.name} | ${session.phone} | ${product.name}`);
    sessions.delete(userId);
    return;
  }

  // Любое другое сообщение → главное меню
  return showMainMenu(chatId,
    `Не понял запрос. Выберите раздел 👇`
  );
});

// ─── Ошибки ──────────────────────────────────────────────────────────────────

bot.on('polling_error', (err) => {
  console.error('Polling error:', err.code, err.message);
});

// Graceful shutdown: останавливаем polling до завершения процесса
// чтобы избежать 409 Conflict при деплое на Render
process.on('SIGTERM', () => {
  bot.stopPolling().then(() => process.exit(0));
});
process.on('SIGINT', () => {
  bot.stopPolling().then(() => process.exit(0));
});

console.log(`
╔═══════════════════════════════════════╗
║   🏗  CELATUS Bot — запущен           ║
║                                       ║
║   celatus.uz                          ║
║   Щелевые диффузоры скрытого монтажа  ║
║                                       ║
║   Ctrl+C — остановить                 ║
╚═══════════════════════════════════════╝
`);
