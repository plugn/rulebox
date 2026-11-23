'use strict';

/**
 * Логика попапа: выбор цвета (радиогруппа палитры или свой цвет),
 * создание/удаление рулбоксов на активной вкладке и счётчик.
 * Сами инъекции выполняет service worker (background.js).
 */

var COLOR_KEY = 'borderColor';
var MAGNET_ENABLED_KEY = 'magnetEnabled';
var MAGNET_THRESHOLD_KEY = 'magnetThreshold';
var MAGNET_AUTO_KEY = 'magnetAuto';
var MAGNET_THRESHOLD_DEFAULT = 6;

var els = {
  count: document.getElementById('count'),
  create: document.getElementById('create'),
  removeLast: document.getElementById('remove-last'),
  removeAll: document.getElementById('remove-all'),
  status: document.getElementById('status'),
  swatches: document.getElementById('swatches'),
  customRadio: document.getElementById('custom-radio'),
  customColor: document.getElementById('color'),
  magnetEnabled: document.getElementById('magnet-enabled'),
  magnetAuto: document.getElementById('magnet-auto'),
  magnetAutoStatus: document.getElementById('magnet-auto-status'),
  magnetThreshold: document.getElementById('magnet-threshold'),
  magnetThresholdValue: document.getElementById('magnet-threshold-value'),
  magnetRefresh: document.getElementById('magnet-refresh'),
  magnetStatus: document.getElementById('magnet-status')
};

var busy = false;
var magnetBusy = false;
var autoBusy = false;

init();

async function init() {
  renderSwatches();
  bindEvents();
  setSelectedColor(await readSavedColor());
  await restoreMagnet();
  await restoreAutoMagnet();
  await refreshState();
}

async function refreshState() {
  var response = await sendMessage({ type: 'state' });
  if (!response.ok) {
    applyCount(0);
    showError(response.error);
    return;
  }

  applyCount(response.count);
  setStatus(response.count
    ? 'На странице: ' + pluralBoxes(response.count) + '.'
    : 'На странице пока нет рулбоксов.');
}

function renderSwatches() {
  RULEBOX_PALETTE.forEach(function (item) {
    var label = document.createElement('label');
    label.className = 'swatch';
    label.title = item.label;

    var input = document.createElement('input');
    input.className = 'swatch__radio';
    input.type = 'radio';
    input.name = 'borderColor';
    input.value = item.value;
    input.setAttribute('aria-label', item.label);

    var dot = document.createElement('span');
    dot.className = 'swatch__dot';
    dot.style.backgroundColor = item.value;

    label.appendChild(input);
    label.appendChild(dot);
    els.swatches.appendChild(label);
  });
}

function bindEvents() {
  els.swatches.addEventListener('change', onColorChange);
  els.customRadio.addEventListener('change', onColorChange);
  els.customColor.addEventListener('input', onCustomColorInput);
  els.create.addEventListener('click', onCreate);
  els.removeLast.addEventListener('click', function () {
    runRemove('remove-last');
  });
  els.removeAll.addEventListener('click', function () {
    runRemove('remove-all');
  });

  els.magnetEnabled.addEventListener('change', onMagnetToggle);
  els.magnetAuto.addEventListener('change', onAutoToggle);
  els.magnetRefresh.addEventListener('click', function () {
    runMagnetRefresh('');
  });
  els.magnetThreshold.addEventListener('input', onThresholdInput);
  els.magnetThreshold.addEventListener('change', function () {
    if (els.magnetEnabled.checked) {
      runMagnetRefresh('Порог обновлён');
    }
  });
}

async function restoreMagnet() {
  var enabled = false;
  var threshold = MAGNET_THRESHOLD_DEFAULT;

  try {
    var enabledData = await chrome.storage.local.get(MAGNET_ENABLED_KEY);
    enabled = Boolean(enabledData && enabledData[MAGNET_ENABLED_KEY]);
    var thresholdData = await chrome.storage.local.get(MAGNET_THRESHOLD_KEY);
    threshold = normalizeThreshold(thresholdData ? thresholdData[MAGNET_THRESHOLD_KEY] : '');
  } catch (error) {
    // Настройки останутся по умолчанию.
  }

  els.magnetEnabled.checked = enabled;
  els.magnetThreshold.value = String(threshold);
  els.magnetThresholdValue.textContent = String(threshold);

  setMagnetStatus(enabled
    ? 'Магнит включён. Снимок делается по текущему виду — после прокрутки или зума обновите его.'
    : 'Магнит выключен.');
}

async function onMagnetToggle() {
  var enabled = els.magnetEnabled.checked;
  await persistSetting(MAGNET_ENABLED_KEY, enabled);

  if (!enabled) {
    if (els.magnetAuto.checked) {
      els.magnetAuto.checked = false;
      await persistSetting(MAGNET_AUTO_KEY, false);
      await sendMessage({ type: 'magnet-auto-disable' });
      setAutoStatus('Автообновление выключено.');
    }

    var response = await sendMessage({ type: 'magnet-clear' });
    setMagnetStatus(response.ok ? 'Магнит выключен.' : (response.error || 'Не удалось выключить магнит.'),
      !response.ok);
    return;
  }

  await runMagnetRefresh('Магнит включён');
}

async function restoreAutoMagnet() {
  var enabled = false;

  try {
    var data = await chrome.storage.local.get(MAGNET_AUTO_KEY);
    enabled = Boolean(data && data[MAGNET_AUTO_KEY]);
  } catch (error) {
    // Настройка останется выключенной.
  }

  els.magnetAuto.checked = enabled;
  if (!enabled) {
    setAutoStatus('Автообновление выключено.');
    return;
  }

  var state = await sendMessage({ type: 'auto-state' });
  if (!state.ok) {
    setAutoStatus(state.error || 'Автообновление включено.', true);
    return;
  }

  setAutoStatus(buildAutoStatus(state));
}

async function onAutoToggle() {
  var enabled = els.magnetAuto.checked;
  await persistSetting(MAGNET_AUTO_KEY, enabled);

  if (!enabled) {
    setAutoBusy(true);
    var off = await sendMessage({ type: 'magnet-auto-disable' });
    setAutoBusy(false);
    setAutoStatus(off.ok ? 'Автообновление выключено.'
      : (off.error || 'Не удалось выключить автообновление.'), !off.ok);
    return;
  }

  // Авто-режим бессмысленен без самого магнита.
  if (!els.magnetEnabled.checked) {
    els.magnetEnabled.checked = true;
    await persistSetting(MAGNET_ENABLED_KEY, true);
    setMagnetStatus('Магнит включён. Автообновление при скролле/зуме.');
  }

  setAutoBusy(true);
  var response = await sendMessage({ type: 'magnet-auto-enable', threshold: currentThreshold() });
  setAutoBusy(false);

  if (!response.ok) {
    setAutoStatus(response.error || 'Не удалось включить автообновление.', true);
    return;
  }

  setAutoStatus('Автообновление включено: линий ' + response.vertical + ' вертикальных, ' +
    response.horizontal + ' горизонтальных.');
}

function buildAutoStatus(state) {
  if (!state.lastAt) {
    return 'Автообновление включено.';
  }
  var seconds = Math.max(0, Math.round((Date.now() - state.lastAt) / 1000));
  var result = state.vertical || state.horizontal
    ? ', линий ' + (state.vertical || 0) + '×' + (state.horizontal || 0)
    : '';
  return 'Автообновление включено, обновлено ' + seconds + ' с назад' + result + '.';
}

function setAutoStatus(text, isError) {
  els.magnetAutoStatus.textContent = text;
  els.magnetAutoStatus.classList.toggle('magnet__status--error', Boolean(isError));
}

function setAutoBusy(value) {
  autoBusy = value;
  els.magnetAuto.disabled = value;
}

async function runMagnetRefresh(prefix) {
  if (magnetBusy) {
    return;
  }
  if (!els.magnetEnabled.checked) {
    setMagnetStatus('Сначала включите магнит.');
    return;
  }

  await persistSetting(MAGNET_THRESHOLD_KEY, currentThreshold());

  magnetBusy = true;
  els.magnetRefresh.disabled = true;
  var response = await sendMessage({ type: 'magnet-refresh', threshold: currentThreshold() });
  magnetBusy = false;
  els.magnetRefresh.disabled = false;

  if (!response.ok) {
    setMagnetStatus(response.error || 'Не удалось обновить снимок.', true);
    return;
  }

  var summary = 'линий: ' + response.vertical + ' вертикальных, ' +
    response.horizontal + ' горизонтальных.';
  setMagnetStatus((prefix ? prefix + '. ' : '') + summary);
}

function onThresholdInput() {
  var threshold = currentThreshold();
  els.magnetThresholdValue.textContent = String(threshold);
  persistSetting(MAGNET_THRESHOLD_KEY, threshold);
}

function currentThreshold() {
  return normalizeThreshold(els.magnetThreshold.value);
}

function normalizeThreshold(value) {
  var number = parseInt(value, 10);
  if (!isFinite(number)) {
    return MAGNET_THRESHOLD_DEFAULT;
  }
  return Math.min(20, Math.max(2, number));
}

function setMagnetStatus(text, isError) {
  els.magnetStatus.textContent = text;
  els.magnetStatus.classList.toggle('magnet__status--error', Boolean(isError));
}

async function persistSetting(key, value) {
  var patch = {};
  patch[key] = value;
  try {
    await chrome.storage.local.set(patch);
  } catch (error) {
    // Не критично: настройка просто не запомнится.
  }
}

/** Выбор в пипетке включает радиокнопку «Свой цвет». */
function onCustomColorInput() {
  els.customRadio.checked = true;
  onColorChange();
}

function onColorChange() {
  var color = getSelectedColor();
  if (!els.customRadio.checked) {
    // Пипетка продолжает с текущего цвета палитры.
    els.customColor.value = color;
  }
  persistColor(color);
  setStatus('Цвет рамки: ' + colorLabel(color));
}

async function onCreate() {
  if (busy) {
    return;
  }

  var color = getSelectedColor();
  setBusy(true);
  var response = await sendMessage({ type: 'create', color: color });
  setBusy(false);

  if (!response.ok) {
    showError(response.error);
    return;
  }

  applyCount(response.count);

  // Автовыбор — соседний цвет палитры; service worker уже сохранил его
  // в storage, поэтому попап только отражает новое значение.
  var nextColor = response.nextColor || color;
  setSelectedColor(nextColor);

  setStatus('Создан рулбокс: ' + pluralBoxes(response.count) +
    '. Следующий цвет — ' + colorLabel(nextColor) + '.');
}

async function runRemove(type) {
  if (busy) {
    return;
  }

  setBusy(true);
  var response = await sendMessage({ type: type });
  setBusy(false);

  if (!response.ok) {
    showError(response.error);
    return;
  }

  applyCount(response.count);

  if (type === 'remove-last') {
    setStatus(response.count
      ? 'Удалён последний рулбокс: осталось ' + pluralBoxes(response.count) + '.'
      : 'Рулбоксов не осталось.');
  } else {
    setStatus('Все рулбоксы удалены.');
  }
}

function getSelectedColor() {
  if (els.customRadio.checked) {
    return normalizeHex(els.customColor.value);
  }

  var checked = els.swatches.querySelector('input[name="borderColor"]:checked');
  return checked ? checked.value : RULEBOX_DEFAULT_COLOR;
}

function setSelectedColor(color) {
  var value = normalizeHex(color);
  var matched = false;

  var radios = els.swatches.querySelectorAll('input[name="borderColor"]');
  Array.prototype.forEach.call(radios, function (input) {
    var isMatch = input.value === value;
    input.checked = isMatch;
    matched = matched || isMatch;
  });

  els.customRadio.checked = !matched;
  els.customColor.value = value;
}

function applyCount(count) {
  var value = Number(count) > 0 ? Number(count) : 0;
  els.count.textContent = String(value);
  els.count.classList.toggle('badge--empty', value === 0);
  els.removeLast.disabled = value === 0;
  els.removeAll.disabled = value === 0;
}

function setBusy(value) {
  busy = value;
  els.create.disabled = value;
  els.removeLast.disabled = value;
  els.removeAll.disabled = value;
  document.body.classList.toggle('is-busy', value);
}

function setStatus(text) {
  els.status.textContent = text;
  els.status.classList.remove('status--error');
}

function showError(text) {
  els.status.textContent = text || 'Не удалось выполнить команду.';
  els.status.classList.add('status--error');
}

function pluralBoxes(count) {
  var mod10 = count % 10;
  var mod100 = count % 100;
  var word = 'рулбоксов';

  if (mod10 === 1 && mod100 !== 11) {
    word = 'рулбокс';
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    word = 'рулбокса';
  }

  return count + ' ' + word;
}

function colorLabel(color) {
  var value = normalizeHex(color);

  for (var i = 0; i < RULEBOX_PALETTE.length; i += 1) {
    if (RULEBOX_PALETTE[i].value === value) {
      return RULEBOX_PALETTE[i].label.toLowerCase();
    }
  }

  return 'свой цвет ' + value;
}

function normalizeHex(value) {
  var text = value === undefined || value === null ? '' : String(value).toLowerCase();
  return /^#[0-9a-f]{6}$/.test(text) ? text : RULEBOX_DEFAULT_COLOR;
}

async function readSavedColor() {
  try {
    var data = await chrome.storage.local.get(COLOR_KEY);
    return normalizeHex(data ? data[COLOR_KEY] : '');
  } catch (error) {
    return RULEBOX_DEFAULT_COLOR;
  }
}

async function persistColor(color) {
  try {
    await chrome.storage.local.set({ borderColor: color });
  } catch (error) {
    // Не критично: цвет просто не запомнится.
  }
}

function sendMessage(message) {
  return new Promise(function (resolve) {
    chrome.runtime.sendMessage(message, function (response) {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: 'Нет ответа от service worker.' });
    });
  });
}
