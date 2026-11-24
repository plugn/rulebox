'use strict';

/**
 * Service worker расширения Rulebox.
 *
 * Задачи:
 *  - внедрить движок lib/rulebox.js в MAIN world страницы (там же живёт
 *    API window.rulebox, поэтому оно доступно в консоли);
 *  - выполнить команды попапа: state / create / remove-last / remove-all;
 *  - обработать хоткей create-rulebox;
 *  - показать количество рулбоксов бейджем на иконке вкладки;
 *  - режим «магнит»: снимок вкладки и передача его в страницу, где
 *    lib/edges.js находит контрастные линии и отдаёт направляющие движку.
 *
 * После каждого созданного рулбокса автовыбор цвета сдвигается на
 * соседний цвет палитры (lib/palette.js) и сохраняется в storage.
 */

importScripts('lib/palette.js');

var LIB_FILE = 'lib/rulebox.js';
var EDGES_FILE = 'lib/edges.js';
var ACTIVITY_FILE = 'lib/activity.js';
var COLOR_KEY = 'borderColor';
var MAGNET_AUTO_KEY = 'magnetAuto';
var MAGNET_THRESHOLD_KEY = 'magnetThreshold';
var BADGE_COLOR = '#2563eb';
var BADGE_BUSY_COLOR = '#dc2626';
var SNAP_THRESHOLD_DEFAULT = 6;
var AUTO_MIN_INTERVAL = 5000;

var autoState = {
  busy: false,
  lastAt: 0,
  lastResult: null,
  lastError: null,
  timer: null
};

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  var task = message && message.type === 'magnet-auto-refresh'
    ? handleAutoRefresh(sender)
    : runCommand(message);

  task
    .then(sendResponse)
    .catch(function (error) {
      sendResponse({ ok: false, error: toUserError(error) });
    });
  // Ответ формируется асинхронно.
  return true;
});

// chrome.commands.onCommand.addListener(function (command) {
//   if (command === 'create-rulebox') {
//     createFromShortcut();
//   }
// });

// После перезагрузки страницы движок и слушатель активности исчезают:
// сбрасываем устаревшую карту и бейдж, чтобы не показывать старые данные.
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (!changeInfo || changeInfo.status !== 'loading') {
    return;
  }
  autoState.lastResult = null;
  updateBadge(tabId, 0).catch(function () {
    // Вкладка могла закрыться.
  });
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

    case 'magnet-refresh':
      result = await autoRefreshNow(tab, message.threshold);
      return { ok: true, vertical: result.vertical, horizontal: result.horizontal };

    case 'magnet-clear':
      await clearGuidesInTab(tab.id);
      return { ok: true, vertical: 0, horizontal: 0 };

    case 'magnet-auto-enable':
      result = await enableAutoMagnet(tab, message.threshold);
      return { ok: true, vertical: result.vertical, horizontal: result.horizontal };

    case 'magnet-auto-disable':
      await disableAutoMagnet(tab.id);
      return { ok: true };

    case 'auto-state':
      return {
        ok: true,
        enabled: await isAutoMagnetEnabled(),
        busy: autoState.busy,
        lastAt: autoState.lastAt,
        vertical: autoState.lastResult ? autoState.lastResult.vertical : 0,
        horizontal: autoState.lastResult ? autoState.lastResult.horizontal : 0
      };

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

/**
 * Режим «магнит»: снимаем видимую область вкладки и передаём снимок в
 * страницу. Декодирование и поиск линий идут в MAIN world — там есть
 * DOM (Image, canvas), а у service worker'а его нет.
 */
async function refreshMagnet(tab, threshold) {
  var limit = typeof threshold === 'number' && threshold > 0 ? threshold : SNAP_THRESHOLD_DEFAULT;

  var dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  await ensureEngine(tab.id);
  await ensureDetector(tab.id);

  var results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: magnetInPage,
    args: [dataUrl, limit]
  });

  return pickResult(results, { vertical: 0, horizontal: 0 });
}

/**
 * Выполняется в MAIN world страницы: декодирует снимок, ищет линии,
 * исключает области рулбоксов и отдаёт направляющие движку.
 */
function magnetInPage(dataUrl, threshold) {
  return new Promise(function (resolve, reject) {
    var image = new Image();

    image.onload = function () {
      try {
        var viewportWidth = document.documentElement.clientWidth;
        var scale = viewportWidth > 0 ? image.naturalWidth / viewportWidth : 1;

        var canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        var context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        var imageData = context.getImageData(0, 0, canvas.width, canvas.height);

        var engine = window.rulebox;
        var skip = [];
        if (engine && Array.isArray(engine._items)) {
          skip = engine._items.map(function (item) {
            var rect = item.getBoundingClientRect();
            return {
              left: rect.left * scale,
              top: rect.top * scale,
              right: rect.right * scale,
              bottom: rect.bottom * scale
            };
          });
        }

        var detected = typeof ruleboxDetectLines === 'function'
          ? ruleboxDetectLines(imageData, canvas.width, canvas.height, { skip: skip })
          : { vertical: [], horizontal: [] };

        var vertical = uniquePositions(detected.vertical.map(function (line) {
          return Math.round(line.pos / scale);
        }), viewportWidth);
        var horizontal = uniquePositions(detected.horizontal.map(function (line) {
          return Math.round(line.pos / scale);
        }), document.documentElement.clientHeight);

        if (engine && typeof engine.setGuides === 'function') {
          engine.setGuides(vertical, horizontal, threshold);
        }

        resolve({ vertical: vertical.length, horizontal: horizontal.length });
      } catch (error) {
        reject(error);
      }
    };

    image.onerror = function () {
      reject(new Error('Не удалось декодировать снимок вкладки'));
    };

    image.src = dataUrl;
  });

  function uniquePositions(values, max) {
    var result = [];
    for (var i = 0; i < values.length; i += 1) {
      var value = values[i];
      if (value >= 0 && value <= max && result.indexOf(value) === -1) {
        result.push(value);
      }
    }
    return result;
  }
}

/** lib/edges.js подключается в MAIN world один раз, как и движок. */
async function ensureDetector(tabId) {
  var results = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: function () {
      return typeof ruleboxDetectLines === 'function';
    }
  });

  var entry = Array.isArray(results) ? results[0] : null;
  if (entry && entry.result) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    files: [EDGES_FILE]
  });
}

async function clearGuidesInTab(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN',
    func: clearGuidesInPage
  });
}

function clearGuidesInPage() {
  var engine = window.rulebox;
  if (engine && typeof engine.clearGuides === 'function') {
    engine.clearGuides();
  }
  return { cleared: true };
}

/**
 * Авто-режим: слушатель активности внедряется в страницу (ISOLATED
 * world), дальше он присылает magnet-auto-refresh после дебаунса.
 */
async function enableAutoMagnet(tab, threshold) {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: [ACTIVITY_FILE]
  });

  return autoRefreshNow(tab, threshold);
}

async function disableAutoMagnet(tabId) {
  if (autoState.timer !== null) {
    clearTimeout(autoState.timer);
    autoState.timer = null;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: stopActivityInPage
    });
  } catch (error) {
    // Страница могла закрыться — не критично.
  }

  await clearGuidesInTab(tabId);
  autoState.lastResult = null;
}

function stopActivityInPage() {
  if (window.__ruleboxActivity && typeof window.__ruleboxActivity.stop === 'function') {
    window.__ruleboxActivity.stop();
  }
  return true;
}

async function isAutoMagnetEnabled() {
  try {
    var data = await chrome.storage.local.get(MAGNET_AUTO_KEY);
    return Boolean(data && data[MAGNET_AUTO_KEY]);
  } catch (error) {
    return false;
  }
}

async function getMagnetThreshold() {
  try {
    var data = await chrome.storage.local.get(MAGNET_THRESHOLD_KEY);
    var value = parseInt(data ? data[MAGNET_THRESHOLD_KEY] : '', 10);
    if (!isFinite(value)) {
      return SNAP_THRESHOLD_DEFAULT;
    }
    return Math.min(20, Math.max(2, value));
  } catch (error) {
    return SNAP_THRESHOLD_DEFAULT;
  }
}

/**
 * Сообщение от слушателя активности: не чаще одного пересчёта в
 * AUTO_MIN_INTERVAL, более ранние запросы откладываются и схлопываются.
 */
async function handleAutoRefresh(sender) {
  var tab = sender && sender.tab;
  if (!tab || typeof tab.id !== 'number') {
    return { ok: false, error: 'Нет вкладки для авто-пересчёта' };
  }
  if (!(await isAutoMagnetEnabled())) {
    return { ok: true, skipped: true };
  }
  if (autoState.busy) {
    return { ok: true, queued: true };
  }

  var wait = autoState.lastAt + AUTO_MIN_INTERVAL - Date.now();
  if (wait > 0) {
    scheduleAutoRefresh(tab, wait);
    return { ok: true, scheduled: wait };
  }

  var result = await autoRefreshNow(tab, await getMagnetThreshold());
  return { ok: true, vertical: result.vertical, horizontal: result.horizontal };
}

function scheduleAutoRefresh(tab, delay) {
  if (autoState.timer !== null) {
    clearTimeout(autoState.timer);
  }

  autoState.timer = setTimeout(function () {
    autoState.timer = null;
    getMagnetThreshold()
      .then(function (threshold) {
        return autoRefreshNow(tab, threshold);
      })
      .catch(function (error) {
        console.warn('[rulebox] Автообновление не удалось:', toUserError(error));
      });
  }, delay);
}

async function autoRefreshNow(tab, threshold) {
  if (autoState.busy) {
    return autoState.lastResult || { vertical: 0, horizontal: 0 };
  }

  autoState.busy = true;
  autoState.lastAt = Date.now();
  autoState.lastError = null;

  try {
    await setBadgeBusy(tab.id);
    // Старые направляющие уже невалидны — магнит заблокирован до готовности.
    await clearGuidesInTab(tab.id);
    var result = await refreshMagnet(tab, threshold);
    autoState.lastResult = result;
    await restoreBadge(tab.id);
    return result;
  } catch (error) {
    autoState.lastError = toUserError(error);
    await setBadgeError(tab.id);
    throw error;
  } finally {
    autoState.busy = false;
  }
}

async function setBadgeBusy(tabId) {
  try {
    // Текст нужен всегда: без него Chrome не рисует бейдж и фон не виден,
    // даже если рулбоксов на странице ещё нет.
    await chrome.action.setBadgeText({ tabId: tabId, text: '…' });
    await chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: BADGE_BUSY_COLOR });
  } catch (error) {
    // Бейдж не критичен.
  }
}

async function setBadgeError(tabId) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: BADGE_BUSY_COLOR });
    await chrome.action.setBadgeText({ tabId: tabId, text: '!' });
  } catch (error) {
    // Бейдж не критичен.
  }
}

async function restoreBadge(tabId) {
  var count = 0;
  try {
    var state = await readState(tabId);
    count = state.count;
  } catch (error) {
    count = 0;
  }
  await updateBadge(tabId, count);
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
