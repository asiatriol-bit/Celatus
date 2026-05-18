const { Groq } = require('groq-sdk');
const faqData = require('./faq.json');

let client = null;
let systemPromptCache = null;

function initializeClient() {
  if (!client && process.env.GROQ_API_KEY) {
    client = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
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
  } catch (e) {
    console.error('Error flattening FAQ:', e.message);
  }
  return faqText;
}

const COMPANY_INFO = `
КОМПАНИЯ: Celatus
Тел: +998 91 007-15-28
Сайт: celatus.uz
Адрес: проспект Мустакиллик 88А, БЦ Дархан, Ташкент
Часы: Пн-Сб 09:00 — 18:00 (Ташкент UTC+5)
Специализация: Щелевые диффузоры скрытого монтажа премиального класса

ПРОДУКТЫ:
- 1-щелевой диффузор: 75$/п.м. (до 200 м³/ч на 1 п.м.)
- 2-щелевой диффузор: 105$/п.м. (до 400 м³/ч на 1 п.м.) - ПОПУЛЯРНЫЙ
- 3-щелевой диффузор: 135$/п.м. (до 600 м³/ч на 1 п.м.)

ПРЕИМУЩЕСТВА:
- Единственный производитель в Узбекистане
- Собственное производство
- Алюминиевые профили высокого качества
- Непрерывные линии без швов
- Любой цвет RAL под проект
- Гарантия 12 месяцев
- Обучение монтажников
- Сроки: 3-14 дней
`;

function getSystemPrompt() {
  if (!systemPromptCache) {
    systemPromptCache = `Ты профессиональный архитектурный консультант компании Celatus.

${COMPANY_INFO}

${flattenFAQ()}

ПРАВИЛА БЕСЕДЫ:
1. Отвечай профессионально, но дружелюбно
2. Используй FAQ для ответов на стандартные вопросы
3. Если вопрос выходит за рамки компетенции — сразу предложи консультацию инженера
4. Собирай информацию: имя, номер, тип (клиент/партнер), ищет ли партнерства
5. Когда клиент готов заказать/начать расчет:
   - Предложи кнопку звонка (рабочее время 09:00-20:00 Ташкент)
   - Если поздно/рано - скажи, что отправим данные менеджеру на Telegram
6. На вопросы про расчет сложности, проектирование ОВиК - предложи консультацию HVAC-специалиста
7. Не обещай сроки/цены без уточнений
8. Помни: ты консультант, не продавец`;
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
        type: null, // 'client' | 'partner'
        isPartner: null, // true | false
        role: null, // 'designer' | 'architect' | 'hvac' | 'builder' | 'private'
      },
    });
  }
  return conversationHistory.get(userId);
}

async function processMessage(userId, userMessage) {
  const groqClient = initializeClient();
  
  if (!groqClient) {
    console.error('Groq client not initialized. GROQ_API_KEY missing?');
    return {
      message: '❌ Ошибка: API не настроен. Пожалуйста, позвоните нам.',
      session: {},
    };
  }

  const session = getOrCreateSession(userId);
  
  // Keep only last 2 user messages + 2 assistant messages (4 messages max)
  if (session.messages.length >= 4) {
    session.messages = session.messages.slice(-3);
  }

  session.messages.push({
    role: 'user',
    content: userMessage,
  });

  try {
    console.log(`Processing message for user ${userId}...`);
    
    const response = await groqClient.chat.completions.create({
      messages: [
        { role: 'system', content: getSystemPrompt() },
        ...session.messages,
      ],
      model: 'mixtral-8x7b-32768',
      max_tokens: 500,
      temperature: 0.7,
    });

    const assistantMessage = response.choices[0].message.content;
    
    session.messages.push({
      role: 'assistant',
      content: assistantMessage,
    });

    // Extract user info from conversation (simple heuristics)
    extractUserInfo(session, userMessage);

    return {
      message: assistantMessage,
      session: session.userInfo,
    };
  } catch (error) {
    console.error('Groq error:', error);
    return {
      message: '❌ Ошибка при обработке запроса. Пожалуйста, попробуйте еще раз или позвоните нам: +998 91 007-15-28',
      session: session.userInfo,
    };
  }
}

function extractUserInfo(session, userMessage) {
  // Simple extraction (can be improved with regex)
  const lowerMsg = userMessage.toLowerCase();
  
  // Detect client type
  if (lowerMsg.includes('партнер') || lowerMsg.includes('сотрудничество') || lowerMsg.includes('дистрибьютор')) {
    session.userInfo.isPartner = true;
    session.userInfo.type = 'partner';
  } else if (lowerMsg.includes('ищу') || lowerMsg.includes('нужен') || lowerMsg.includes('хочу')) {
    session.userInfo.isPartner = false;
    session.userInfo.type = 'client';
  }

  // Detect role
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
