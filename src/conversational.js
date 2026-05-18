const { Groq } = require('groq-sdk');
const faqData = require('./faq.json');

let client = null;
let systemPromptCache = null;

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
    systemPromptCache = `Ты — Динар, профессиональный консультант компании Celatus.
Твоё имя — Динар. Всегда представляйся как Динар, никогда не используй "Ваше имя" или другие заглушки.
Отвечай ТОЛЬКО на русском языке. Никогда не используй английские слова в русском тексте.

${COMPANY_INFO}

${flattenFAQ()}

ПРАВИЛА БЕСЕДЫ:
1. Представляйся ("Меня зовут Динар, консультант Celatus") ТОЛЬКО в самом первом ответе. В следующих сообщениях — не повторяй представление.
2. Отвечай профессионально, дружелюбно, только на русском языке
3. Используй FAQ для ответов на стандартные вопросы
4. Если вопрос выходит за рамки компетенции — предложи консультацию инженера
5. Собирай информацию: имя, номер, тип (клиент/партнер)
6. Когда клиент готов заказать/начать расчет — скажи что внизу есть кнопки для звонка или заявки
7. На вопросы про проектирование ОВиК — предложи консультацию HVAC-специалиста
8. Не обещай сроки/цены без уточнений
9. Ты консультант, не продавец — помогай, не навязывай`;
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
    console.log(`📤 Sending request to Groq with model: llama-3.3-70b-versatile`);
    console.log(`📝 System prompt length: ${getSystemPrompt().length} chars`);
    console.log(`💬 Messages in context: ${session.messages.length}`);

    const response = await Promise.race([
      groqClient.chat.completions.create({
        messages: [
          { role: 'system', content: getSystemPrompt() },
          ...session.messages,
        ],
        model: 'llama-3.3-70b-versatile',
        max_tokens: 500,
        temperature: 0.7,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Groq timeout: запрос занял слишком долго')), 15000)
      ),
    ]);

    console.log(`✅ Groq response received`);
    
    const assistantMessage = response.choices[0].message.content;
    console.log(`📥 Response: ${assistantMessage.substring(0, 100)}...`);
    
    session.messages.push({
      role: 'assistant',
      content: assistantMessage,
    });

    extractUserInfo(session, userMessage);

    return {
      message: assistantMessage,
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
      message: `❌ Ошибка Groq: ${error.message}. Позвоните нам: +998 91 007-15-28`,
      session: session.userInfo,
    };
  }
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
