const { QUALIFICATION } = require('./data');

const mainMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '📐 Подобрать диффузор', callback_data: 'qualify_start' }],
      [{ text: '📦 Каталог продукции', callback_data: 'catalog' }],
      [{ text: '❓ Частые вопросы', callback_data: 'faq_menu' }],
      [{ text: '📞 Связаться с менеджером', callback_data: 'contact_manager' }],
    ],
  },
};

const roleKeyboard = {
  reply_markup: {
    inline_keyboard: [
      ...QUALIFICATION.roles.map(r => [{ text: r.label, callback_data: `role_${r.id}` }]),
    ],
  },
};

const projectTypeKeyboard = {
  reply_markup: {
    inline_keyboard: [
      ...QUALIFICATION.projectTypes.map(p => [{ text: p.label, callback_data: `project_${p.id}` }]),
    ],
  },
};

const slotKeyboard = {
  reply_markup: {
    inline_keyboard: [
      ...QUALIFICATION.slotChoices.map(s => [{ text: s.label, callback_data: `slot_${s.id}` }]),
    ],
  },
};

const lengthKeyboard = {
  reply_markup: {
    inline_keyboard: [
      ...QUALIFICATION.lengths.map(l => [{ text: l.label, callback_data: `length_${l.id}` }]),
    ],
  },
};

function productActions(productId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💰 Получить расчёт стоимости', callback_data: `request_${productId}` }],
        [{ text: '📦 Весь каталог', callback_data: 'catalog' }],
        [{ text: '🏠 Главное меню', callback_data: 'main_menu' }],
      ],
    },
  };
}

function catalogItem(productId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💰 Запросить расчёт', callback_data: `request_${productId}` }],
        [{ text: '◀️ Назад в каталог', callback_data: 'catalog' }],
      ],
    },
  };
}

function faqMenu(faqItems) {
  return {
    reply_markup: {
      inline_keyboard: [
        ...faqItems.map(f => [{ text: f.question, callback_data: `faq_${f.id}` }]),
        [{ text: '🏠 Главное меню', callback_data: 'main_menu' }],
      ],
    },
  };
}

function backToFaq() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '◀️ Все вопросы', callback_data: 'faq_menu' }],
        [{ text: '🏠 Главное меню', callback_data: 'main_menu' }],
      ],
    },
  };
}

const cancelKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '❌ Отмена', callback_data: 'main_menu' }],
    ],
  },
};

const afterRequestKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🏠 Главное меню', callback_data: 'main_menu' }],
    ],
  },
};

module.exports = {
  mainMenu,
  roleKeyboard,
  projectTypeKeyboard,
  slotKeyboard,
  lengthKeyboard,
  productActions,
  catalogItem,
  faqMenu,
  backToFaq,
  cancelKeyboard,
  afterRequestKeyboard,
};
