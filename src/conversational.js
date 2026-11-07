const { Groq } = require('groq-sdk');
const faqData = require('./faq.json');

let client = null;
let systemPromptCache = null;

// Groq снимает модели с поддержки (llama-3.3-70b-versatile отключена 16.08.2026).
// Модель задаётся в Render переменной GROQ_MODEL, чтобы менять её без нового деплоя.
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

function initializeClient() {
  if (!client && process.env.GROQ_API_KEY) {
    try {
      client = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });
      console.log('✅ Groq client initialized successfully');
    } catch (e) {
      console.error('❌ Failed to initialize Groq client:', e.message);
    }
  }
  return client;
}

// Flatten FAQ for context
function flattenFAQ() {
  let faqText = '';
  try {
    for (const [category, items] of Object.entries(faqData)) {
      faqText += `\n${category.toUpperCase()}:\n`;
      items.forEach(item => {
        faqText += `Q: ${item.question}\nA: ${item.answer}\n\n`;
      });
    }
    console.log('✅ FAQ flattened successfully');
  } catch (e) {
    console.error('❌ Error flattening FAQ:', e.message);
  }
  return faqText;
}

const COMPANY_INFO = `
КОМПАНИЯ: Celatus — собственное производство щелевых диффузоров скрытого монтажа, Ташкент.
Тел: +998 91 007-15-28 · Сайт: celatus.uz · Telegram менеджера: @Celatus_uz
Адрес: проспект Мустакиллик, 88А, кабинет 109, Ташкент
Часы: Пн–Сб 09:00–18:00 (Ташкент)
Работаем по Ташкенту и Ташкентской области.

МОДЕЛИ (официальные названия SL, DL, TL; в каталоге ещё встречаются старые коды CSTL, CDTL, CTTL):
- SL — однощелевой, $75 за погонный метр, угол $90
- DL — двухщелевой, $105 за погонный метр, угол $120
- TL — трёхщелевой, $135 за погонный метр, угол $150
Длина округляется вверх с шагом 25 см (177 см считаются как 2 м). Минимальная длина 500 мм, максимальная не ограничена.
Цены без монтажа и без камеры статического давления (КСД). Доставка по Ташкенту бесплатная при любом метраже.
Расчёт: по плану помещения или длине менеджер посчитает в течение рабочего дня.
Оплата: 100% предоплата.

РАЗМЕРЫ ИЗ КАТАЛОГА (мм):
- Высота диффузора у всех моделей одинаковая: 48,5 мм.
- Ширина щели у всех моделей: 30 мм. Ширина ламели: 24,6 мм.
- Общая ширина: SL 80, DL 136,5, TL 193.
- Посадочная ширина (проём в потолке): SL 76, DL 132,5, TL 189.
- Камера статического давления (КСД) тоже одной высоты для SL, DL и TL. Она добавляет до 200 мм над диффузором.
- Ответ на вопрос «сколько нужно места в запотолочном пространстве»: сам диффузор 48,5 мм, плюс КСД до 200 мм. Точную высоту КСД под объект подбирает инженер.

РАСХОД ВОЗДУХА НА 1 ПОГОННЫЙ МЕТР (каталог), при скорости 1,43 / 1,89 / 2,36 / 2,83 м/с:
- SL: 154 / 204 / 255 / 306 м³/ч, шум 13 / 18 / 22 / 24 дБ(А)
- DL: 308 / 408 / 510 / 612 м³/ч, шум 14 / 20 / 23 / 25 дБ(А)
- TL: 462 / 612 / 765 / 918 м³/ч, шум 15 / 22 / 24 / 26 дБ(А)
Потери давления: 4 Па при 2,36 м/с и 6 Па при 2,83 м/с.

ПРОЧЕЕ:
- Материал: алюминий. Стандартные цвета белый RAL 9016 и чёрный RAL 9005, под заказ любой цвет RAL.
- Монтаж в ГКЛ. Натяжной потолок — только SL. Можно в стены.
- Монтируют обычно мастера по гипсокартону; Celatus консультирует и обучает их, сам монтирует редко — по договорённости.
- Гарантия на изделие пожизненная.
- Срок изготовления: 7–14 дней; точный срок конкретного заказа называет менеджер.
- Есть BIM-модели и каталог с монтажными узлами — их высылает менеджер.
`;

function getSystemPrompt() {
  if (!systemPromptCache) {
    systemPromptCache = `Ты — Динар, профессиональный консультант компании Celatus.
Твоё имя — Динар. Всегда представляйся как Динар, никогда не используй "Ваше имя" или другие заглушки.
Отвечай ТОЛЬКО на русском языке. Никогда не используй английские слова в русском тексте.

${COMPANY_INFO}

${flattenFAQ()}

ПРАВИЛА БЕСЕДЫ:
1. Представляйся ("Меня зовут Динар, консультант Celatus") ТОЛЬКО в самом первом ответе. В следующих сообщениях — не повторяй представление.
2. Отвечай профессионально, дружелюбно, коротко: 2–5 предложений.
3. Цифры (размеры, цены, сроки, расход воздуха) называй ТОЛЬКО из данных выше. Если нужной цифры нет — не придумывай, скажи, что уточнит инженер, и предложи кнопку заявки.
4. ФОРМАТ: это Telegram. Пиши обычным текстом. НЕ используй таблицы, символы |, звёздочки, решётки и другую разметку. Перечисления — короткими строками через «—».
5. Если вопрос выходит за рамки компетенции — предложи консультацию инженера.
6. Когда клиент готов заказать или посчитать — скажи, что внизу есть кнопки «Написать менеджеру» и «Оставить заявку».
7. На вопросы про проектирование ОВиК — предложи консультацию HVAC-специалиста.
8. Итоговую стоимость и срок конкретного заказа не обещай — их считает менеджер.
9. Ты консультант, не продавец — помогай, не навязывай.`;
  }
  return systemPromptCache;
}

// Session storage for conversation history
const conversationHistory = new Map();

function getOrCreateSession(userId) {
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, {
      messages: [],
      userInfo: {
        name: null,
        phone: null,
        type: null,
        isPartner: null,
        role: null,
      },
    });
  }
  return conversationHistory.get(userId);
}

async function processMessage(userId, userMessage) {
  console.log(`\n🔵 Processing message from user ${userId}: "${userMessage}"`);
  
  const groqClient = initializeClient();
  
  if (!groqClient) {
    console.error('❌ Groq client not initialized. GROQ_API_KEY missing?');
    console.error('GROQ_API_KEY value:', process.env.GROQ_API_KEY ? '***SET***' : 'NOT SET');
    return {
      message: '❌ Ошибка: API не настроен. Проверьте GROQ_API_KEY на Render.',
      session: {},
    };
  }

  const session = getOrCreateSession(userId);
  
  if (session.messages.length >= 4) {
    session.messages = session.messages.slice(-3);
  }

  session.messages.push({
    role: 'user',
    content: userMessage,
  });

  try {
    console.log(`📤 Sending request to Groq with model: ${MODEL}`);
    console.log(`📝 System prompt length: ${getSystemPrompt().length} chars`);
    console.log(`💬 Messages in context: ${session.messages.length}`);

    const response = await Promise.race([
      groqClient.chat.completions.create({
        messages: [
          { role: 'system', content: getSystemPrompt() },
          ...session.messages,
        ],
        model: MODEL,
        // gpt-oss сначала рассуждает, и рассуждение входит в лимит токенов — отсюда запас.
        reasoning_effort: 'low',
        max_tokens: 2000,
        temperature: 0.7,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Groq timeout: запрос занял слишком долго')), 15000)
      ),
    ]);

    console.log(`✅ Groq response received`);
    
    const assistantMessage = (response.choices[0].message.content || '').trim();
    if (!assistantMessage) throw new Error('Groq вернул пустой ответ');
    const plainMessage = toPlainText(assistantMessage);
    console.log(`📥 Response: ${assistantMessage.substring(0, 100)}...`);
    
    session.messages.push({
      role: 'assistant',
      content: plainMessage,
    });

    extractUserInfo(session, userMessage);

    return {
      message: plainMessage,
      session: session.userInfo,
    };
  } catch (error) {
    console.error('\n❌ GROQ ERROR DETAILS:');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error status:', error.status);
    console.error('Error code:', error.code);
    if (error.response) {
      console.error('Error response:', JSON.stringify(error.response, null, 2));
    }
    console.error('Full error:', error);
    
    return {
      message: 'Не получилось ответить на вопрос прямо сейчас. Напишите менеджеру или позвоните: +998 91 007-15-28',
      session: session.userInfo,
    };
  }
}

// Telegram не рисует Markdown-таблицы и заголовки: превращаем их в простой текст.
function toPlainText(text) {
  return text
    .split('\n')
    .filter(line => !/^\s*\|?\s*:?-{3,}/.test(line))
    .map(line => {
      if (/^\s*\|.*\|\s*$/.test(line)) {
        return line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()).filter(Boolean).join(' — ');
      }
      return line;
    })
    .join('\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractUserInfo(session, userMessage) {
  const lowerMsg = userMessage.toLowerCase();
  
  if (lowerMsg.includes('партнер') || lowerMsg.includes('сотрудничество') || lowerMsg.includes('дистрибьютор')) {
    session.userInfo.isPartner = true;
    session.userInfo.type = 'partner';
  } else if (lowerMsg.includes('ищу') || lowerMsg.includes('нужен') || lowerMsg.includes('хочу')) {
    session.userInfo.isPartner = false;
    session.userInfo.type = 'client';
  }

  if (lowerMsg.includes('дизайнер')) session.userInfo.role = 'designer';
  else if (lowerMsg.includes('архитектор')) session.userInfo.role = 'architect';
  else if (lowerMsg.includes('hvac') || lowerMsg.includes('инженер')) session.userInfo.role = 'hvac';
  else if (lowerMsg.includes('строител') || lowerMsg.includes('компани')) session.userInfo.role = 'builder';
}

function clearSession(userId) {
  conversationHistory.delete(userId);
}

function getSessionInfo(userId) {
  const session = getOrCreateSession(userId);
  return session.userInfo;
}

module.exports = {
  processMessage,
  clearSession,
  getSessionInfo,
  COMPANY_INFO,
};
