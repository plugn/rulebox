'use strict';

/**
 * Service worker расширения Rulebox.
 *
 * Задачи:
 *  - внедрить движок lib/rulebox.js в MAIN world страницы (там же живёт
 *    API window.rulebox, поэтому оно доступно в консоли);
 *  - выполнить команды попапа: state / create / remove-last / remove-all;
 *  - обработать хоткей create-rulebox;
 *  - показать количество рулбоксов бейджем на иконке вкладки.
 *
 * После каждого созданного рулбокса автовыбор цвета сдвигается на
 * соседний цвет палитры (lib/palette.js) и сохраняется в storage.
 */

importScripts('lib/palette.js');

var LIB_FILE = 'lib/rulebox.js';
var COLOR_KEY = 'borderColor';
var BADGE_COLOR = '#2563eb';

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  runCommand(message)
    .then(sendResponse)
    .catch(function (error) {
      sendResponse({ ok: false, error: toUserError(error) });
    });
  // Ответ формируется асинхронно.
  return true;
});

chrome.commands.onCommand.addListener(function (command) {
  if (command === 'create-rulebox') {
    createFromShortcut();
  }
});

async function runCommand(message) {
  if (!message || typeof message.type !== 'string') {
    return { ok: false, error: 'Неизвестная команда' };
  }

  var tab = await getActiveTab();
  var result;

  switch (message.type) {
    case 'state':
      result = await readState(tab.id);
      await updateBadge(tab.id, result.count);
      return { ok: true, count: result.count };

    case 'create':
      result = await createBox(tab.id, message.color);
      await updateBadge(tab.id, result.count);
      return {
        ok: true,
        count: result.count,
        color: result.color,
        nextColor: result.nextColor
      };

    case 'remove-last':
      result = await removeLast(tab.id);
      await updateBadge(tab.id, result.count);
      return { ok: true, count: result.count };

    case 'remove-all':
      result = await removeAll(tab.id);
      await updateBadge(tab.id, result.count);
      return { ok: true, count: result.count };

    default:
      return { ok: false, error: 'Неизвестная команда: ' + message.type };
  }
}

/**
 * Создаёт рулбокс и переключает автовыбор на соседний цвет палитры.
 * Ротация живёт только здесь, чтобы клик в попапе и хоткей вёл себя
 * одинаково.
 */
async function createBox(tabId, color) {
  var requestColor = ruleboxNormalizeColor(color);
  await ensureEngine(tabId);

  var results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: createRuleboxInPage,
    args: [requestColor]
  });
  var created = pickResult(results, { count: 0 });

  var nextColor = ruleboxNextColor(requestColor);
  await saveColor(nextColor);

  return { count: created.count, color: requestColor, nextColor: nextColor };
}

/** Выполняется в MAIN world страницы. */
function createRuleboxInPage(color) {
  var engine = window.rulebox;
  if (!engine || typeof engine.create !== 'function') {
    return { count: 0 };
  }
  engine.create(color);
  return { count: engine._items.length };
}

async function removeLast(tabId) {
  var results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: removeLastRuleboxInPage
  });
  return pickResult(results, { count: 0 });
}

/** Выполняется в MAIN world страницы. */
function removeLastRuleboxInPage() {
  var engine = window.rulebox;
  if (!engine || !engine._items.length) {
    return { count: 0 };
  }
  engine.remove(engine._items.length - 1);
  return { count: engine._items.length };
}

async function removeAll(tabId) {
  var results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: removeAllRuleboxesInPage
  });
  return pickResult(results, { count: 0 });
}

/** Выполняется в MAIN world страницы. */
function removeAllRuleboxesInPage() {
  var engine = window.rulebox;
  if (!engine) {
    return { count: 0 };
  }
  while (engine._items.length) {
    engine.remove(0);
  }
  return { count: 0 };
}

async function readState(tabId) {
  var results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: readStateInPage
  });
  return pickResult(results, { count: 0, injected: false });
}

/** Выполняется в MAIN world страницы. */
function readStateInPage() {
  var engine = window.rulebox;
  if (!engine || !Array.isArray(engine._items)) {
    return { count: 0, injected: false };
  }
  return { count: engine._items.length, injected: true };
}

/**
 * Подключает движок, если его ещё нет на странице. Повторная инъекция
 * не нужна: движок при старте удаляет рулбоксы прошлого запуска.
 */
async function ensureEngine(tabId) {
  var state = await readState(tabId);
  if (state.injected) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    files: [LIB_FILE]
  });

  state = await readState(tabId);
  if (!state.injected) {
    throw new Error('Не удалось подключить rulebox на этой странице');
  }
}

async function createFromShortcut() {
  try {
    var tab = await getActiveTab();
    var color = await getColor();
    var created = await createBox(tab.id, color);
    await updateBadge(tab.id, created.count);
  } catch (error) {
    console.warn('[rulebox] Не удалось создать рулбокс:', toUserError(error));
  }
}

async function getActiveTab() {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = Array.isArray(tabs) ? tabs[0] : null;
  if (!tab || typeof tab.id !== 'number' || tab.id < 0) {
    throw new Error('Не найдена активная вкладка');
  }
  return tab;
}

async function getColor() {
  try {
    var data = await chrome.storage.local.get(COLOR_KEY);
    return ruleboxNormalizeColor(data ? data[COLOR_KEY] : '');
  } catch (error) {
    return ruleboxNormalizeColor('');
  }
}

async function saveColor(color) {
  try {
    await chrome.storage.local.set({ borderColor: color });
  } catch (error) {
    // Не критично: автовыбор просто не запомнится.
  }
}

async function updateBadge(tabId, count) {
  var value = Number(count) > 0 ? Number(count) : 0;
  var text = value > 0 ? String(value) : '';
  try {
    await chrome.action.setBadgeText({ tabId: tabId, text: text });
    if (text) {
      await chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: BADGE_COLOR });
    }
  } catch (error) {
    // Вкладка могла закрыться — бейдж не критичен.
  }
}

function pickResult(results, fallback) {
  var entry = Array.isArray(results) ? results[0] : null;
  var result = entry ? entry.result : null;
  return result && typeof result === 'object' ? result : fallback;
}

function toUserError(error) {
  var message = error && error.message ? error.message : String(error);
  if (/cannot access|chrome:\/\/|chrome-extension:|webstore|web store|extensions gallery|cannot be scripted|error page/i.test(message)) {
    return 'На этой странице нельзя выполнять код расширения (chrome://, Chrome Web Store, PDF, страница ошибки). Откройте обычный сайт по http(s).';
  }
  if (/no tab with id/i.test(message)) {
    return 'Вкладка не найдена — обновите страницу и попробуйте ещё раз.';
  }
  return message;
}
