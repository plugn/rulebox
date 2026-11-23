'use strict';

/**
 * Логика попапа: выбор цвета (радиогруппа палитры или свой цвет),
 * создание/удаление рулбоксов на активной вкладке и счётчик.
 * Сами инъекции выполняет service worker (background.js).
 */

var COLOR_KEY = 'borderColor';

var els = {
  count: document.getElementById('count'),
  create: document.getElementById('create'),
  removeLast: document.getElementById('remove-last'),
  removeAll: document.getElementById('remove-all'),
  status: document.getElementById('status'),
  swatches: document.getElementById('swatches'),
  customRadio: document.getElementById('custom-radio'),
  customColor: document.getElementById('color')
};

var busy = false;

init();

async function init() {
  renderSwatches();
  bindEvents();
  setSelectedColor(await readSavedColor());
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
