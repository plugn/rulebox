/**
 * rulebox — движок измерительной линейки (рулбокс) поверх страницы.
 * Подключается расширением Rulebox в MAIN world через chrome.scripting,
 * поэтому API доступно как window.top.rulebox (в том числе в консоли).
 * Описание задачи: ../rulebox.md
 *
 * API:
 *   rulebox.create(borderColor) — создать рулбокс, вернуть его DOM-элемент.
 *                         borderColor — цвет рамки; если не задан,
 *                         используется синий по умолчанию.
 *   rulebox.list()        — вернуть массив rulebox._items
 *   rulebox.remove(index) — удалить рулбокс по индексу
 *
 * Внутри рулбокса у нижней границы по центру выводится его текущий
 * размер, например «200 × 50».
 */
(function () {
  'use strict';

  // window.top может быть недоступен, если сниппет запущен внутри
  // кросс-доменного iframe. В этом случае работаем в текущем окне.
  var root = window;
  try {
    if (window.top && window.top.document) {
      root = window.top;
    }
  } catch (e) {
    root = window;
  }

  var doc = root.document;

  var BOX_WIDTH = 200;
  var BOX_HEIGHT = 50;
  var Z_INDEX = 90000;
  var BORDER_WIDTH = 1;
  var BORDER_COLOR = '#0000ff';
  var FILL_COLOR = 'rgba(0, 0, 255, 0.5)';
  var RESIZER_SIZE = 18;
  var MIN_SIZE = 20;
  var THROTTLE_MS = 30;
  var LABEL_FONT_SIZE = 12;
  var LABEL_FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
  // Отступ подписи от нижней границы рулбокса.
  var LABEL_PADDING_BOTTOM = 6;
  var ACTIVE_TEXT_COLOR = '#ffffff';

  // Состояние каждого рулбокса. WeakMap, чтобы не мусорить в DOM-элементах.
  var states = new WeakMap();

  // После drag/resize браузер может сгенерировать click на элементе под
  // курсором (а не на рулбоксе), если throttled-позиция не успела
  // обновиться. Такой click не должен деактивировать рулбоксы.
  var ignoreClickUntil = 0;

  var api = {
    _items: [],
    create: create,
    list: list,
    remove: remove
  };

  // При повторном запуске сниппета убираем рулбоксы прошлого запуска.
  (function cleanupPrevious() {
    var previous = root.rulebox;
    if (!previous || !Array.isArray(previous._items)) {
      return;
    }
    for (var i = 0; i < previous._items.length; i += 1) {
      var item = previous._items[i];
      if (item && item.nodeType === 1 && item.parentNode) {
        item.parentNode.removeChild(item);
      }
    }
    previous._items.length = 0;
  })();

  root.addEventListener('click', onWindowClick, true);
  root.rulebox = api;

  return api;

  function list() {
    return api._items;
  }

  function create(borderColor) {
    var strokeColor = resolveBorderColor(borderColor);
    var fillColor = toFillColor(strokeColor);

    var box = doc.createElement('div');
    box.style.position = 'absolute';
    box.style.left = '0px';
    box.style.top = '0px';
    box.style.width = BOX_WIDTH + 'px';
    box.style.height = BOX_HEIGHT + 'px';
    box.style.boxSizing = 'border-box';
    box.style.border = BORDER_WIDTH + 'px solid ' + strokeColor;
    box.style.backgroundColor = 'transparent';
    box.style.backgroundClip = 'padding-box';
    box.style.zIndex = String(Z_INDEX);
    box.style.margin = '0';
    box.style.padding = '0';
    box.style.overflow = 'visible';
    box.style.pointerEvents = 'auto';
    box.style.cursor = 'move';
    box.style.userSelect = 'none';
    box.style.webkitUserSelect = 'none';

    // Resizer центрируется на том углу, который тянет пользователь.
    // Абсолютный потомок позиционируется относительно padding box
    // родителя, поэтому компенсируем половину resizer'а и толщину рамки.
    var resizer = doc.createElement('div');
    resizer.style.position = 'absolute';
    resizer.style.width = RESIZER_SIZE + 'px';
    resizer.style.height = RESIZER_SIZE + 'px';
    resizer.style.boxSizing = 'border-box';
    resizer.style.border = BORDER_WIDTH + 'px solid ' + strokeColor;
    resizer.style.backgroundColor = '#ffffff';
    resizer.style.display = 'none';
    resizer.style.margin = '0';
    resizer.style.padding = '0';
    resizer.style.pointerEvents = 'auto';

    // Подпись с текущим размером: по центру по горизонтали, прижата к
    // нижней границе. pointerEvents: none — чтобы не мешать drag/resize.
    var label = doc.createElement('div');
    label.style.position = 'absolute';
    label.style.left = '0';
    label.style.right = '0';
    label.style.bottom = '0';
    label.style.paddingBottom = LABEL_PADDING_BOTTOM + 'px';
    label.style.margin = '0';
    label.style.fontSize = LABEL_FONT_SIZE + 'px';
    label.style.lineHeight = '1';
    label.style.fontFamily = LABEL_FONT_FAMILY;
    label.style.textAlign = 'center';
    label.style.whiteSpace = 'nowrap';
    label.style.color = strokeColor;
    label.style.pointerEvents = 'none';
    label.style.userSelect = 'none';
    label.style.webkitUserSelect = 'none';

    box.appendChild(label);
    box.appendChild(resizer);
    (doc.body || doc.documentElement).appendChild(box);

    // Ставим центр рулбокса в центр видимой области. Делаем это через
    // разницу координат, чтобы не зависеть от offsetParent, margin'ов
    // body и position: relative у родителей.
    var rect = box.getBoundingClientRect();
    var dx = viewportWidth() / 2 - (rect.left + rect.width / 2);
    var dy = viewportHeight() / 2 - (rect.top + rect.height / 2);
    box.style.left = dx + 'px';
    box.style.top = dy + 'px';
    updateLabel();

    var state = {
      active: false,
      stopTracking: null,
      flipX: false,
      flipY: false,
      deactivate: deactivate
    };

    // Начальное положение ручки — правый нижний угол.
    placeResizer(false, false);

    states.set(box, state);
    api._items.push(box);

    box.addEventListener('mouseenter', onMouseEnter);
    box.addEventListener('mouseleave', onMouseLeave);
    box.addEventListener('mousedown', onBoxMouseDown);
    box.addEventListener('click', onBoxClick);
    resizer.addEventListener('mousedown', onResizerMouseDown);
    resizer.addEventListener('click', onResizerClick);

    return box;

    function activate() {
      state.active = true;
      setFill(true);
      label.style.color = ACTIVE_TEXT_COLOR;
      resizer.style.display = 'block';
    }

    function deactivate() {
      if (state.stopTracking) {
        state.stopTracking();
      }
      state.active = false;
      setFill(false);
      label.style.color = strokeColor;
      resizer.style.display = 'none';
    }

    function setFill(filled) {
      box.style.backgroundColor = filled ? fillColor : 'transparent';
    }

    function updateLabel() {
      var current = box.getBoundingClientRect();
      label.textContent = Math.round(current.width) + ' × ' + Math.round(current.height);
    }

    function onMouseEnter() {
      if (!state.active) {
        setFill(true);
      }
    }

    function onMouseLeave() {
      if (!state.active) {
        setFill(false);
      }
    }

    function onBoxClick(event) {
      if (resizer.contains(event.target)) {
        return;
      }
      activate();
    }

    function onBoxMouseDown(event) {
      if (event.button !== 0 || !state.active || resizer.contains(event.target)) {
        return;
      }
      event.preventDefault();
      startTracking(state, applyDrag);
    }

    function onResizerMouseDown(event) {
      if (event.button !== 0 || !state.active) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      startTracking(state, createResizeHandler());
    }

    /**
     * Якорь ресайза — угол, противоположный текущему положению ручки.
     * Считаем его один раз в начале жеста, в документных координатах.
     */
    function createResizeHandler() {
      var rect = box.getBoundingClientRect();
      var left = parseFloat(box.style.left) || 0;
      var top = parseFloat(box.style.top) || 0;
      var anchor = {
        x: state.flipX ? left + rect.width : left,
        y: state.flipY ? top + rect.height : top
      };

      return function (moveEvent) {
        applyResize(moveEvent, anchor);
      };
    }

    function onResizerClick(event) {
      // Клик по resizer'у не должен активировать рулбокс повторно.
      event.stopPropagation();
    }

    function applyDrag(event) {
      var current = box.getBoundingClientRect();
      var offsetX = event.clientX - (current.left + current.width / 2);
      var offsetY = event.clientY - (current.top + current.height / 2);
      box.style.left = (parseFloat(box.style.left) || 0) + offsetX + 'px';
      box.style.top = (parseFloat(box.style.top) || 0) + offsetY + 'px';
    }

    /**
     * Размер считается от неподвижного якоря до мыши. Когда мышь уходит
     * за противоположный угол, рулбокс переворачивается и растёт в
     * другую сторону — ручка всегда остаётся под курсором.
     */
    function applyResize(event, anchor) {
      var current = box.getBoundingClientRect();
      var left = parseFloat(box.style.left) || 0;
      var top = parseFloat(box.style.top) || 0;

      // Координаты мыши в документе — через дельту от текущего
      // прямоугольника, чтобы не зависеть от скролла и offsetParent.
      var pointerX = left + (event.clientX - current.left);
      var pointerY = top + (event.clientY - current.top);

      var flipX = pointerX < anchor.x;
      var flipY = pointerY < anchor.y;
      var width = Math.max(MIN_SIZE, Math.abs(pointerX - anchor.x));
      var height = Math.max(MIN_SIZE, Math.abs(pointerY - anchor.y));

      box.style.left = (flipX ? anchor.x - width : anchor.x) + 'px';
      box.style.top = (flipY ? anchor.y - height : anchor.y) + 'px';
      box.style.width = width + 'px';
      box.style.height = height + 'px';

      placeResizer(flipX, flipY);
      updateLabel();
    }

    /**
     * Ручка крепится к тому углу, который тянет пользователь. При
     * перевороте через противоположный угол она переезжает на другую
     * сторону, а курсор меняется на другую диагональ.
     */
    function placeResizer(flipX, flipY) {
      var offset = -(RESIZER_SIZE / 2 + BORDER_WIDTH) + 'px';
      resizer.style.left = flipX ? offset : 'auto';
      resizer.style.right = flipX ? 'auto' : offset;
      resizer.style.top = flipY ? offset : 'auto';
      resizer.style.bottom = flipY ? 'auto' : offset;
      resizer.style.cursor = flipX === flipY ? 'nwse-resize' : 'nesw-resize';
      state.flipX = flipX;
      state.flipY = flipY;
    }
  }

  function remove(index) {
    if (!Number.isInteger(index) || index < 0 || index >= api._items.length) {
      return null;
    }

    var item = api._items[index];
    var state = item ? states.get(item) : null;
    if (state) {
      state.deactivate();
      states.delete(item);
    }
    if (item && item.parentNode) {
      item.parentNode.removeChild(item);
    }
    api._items.splice(index, 1);
    return item;
  }

  /**
   * Начинает отслеживание мыши. apply вызывается не чаще, чем раз в
   * THROTTLE_MS; последняя позиция применяется принудительно на mouseup.
   */
  function startTracking(state, apply) {
    if (state.stopTracking) {
      state.stopTracking();
    }

    var moved = false;
    var throttled = throttle(function (event) {
      apply(event);
    }, THROTTLE_MS);

    function onMove(event) {
      moved = true;
      throttled(event);
    }

    function onUp(event) {
      throttled.cancel();
      if (moved && event && typeof event.clientX === 'number') {
        apply(event);
        ignoreClickUntil = Date.now() + 100;
      }
      cleanup();
    }

    function onBlur() {
      cleanup();
    }

    function onWindowMouseOut(event) {
      // Курсор ушёл за пределы окна — mouseup можно не получить.
      if (!event.relatedTarget) {
        cleanup();
      }
    }

    function cleanup() {
      root.removeEventListener('mousemove', onMove, true);
      root.removeEventListener('mouseup', onUp, true);
      root.removeEventListener('mouseout', onWindowMouseOut, true);
      root.removeEventListener('blur', onBlur, false);
      throttled.cancel();
      state.stopTracking = null;
    }

    state.stopTracking = cleanup;
    root.addEventListener('mousemove', onMove, true);
    root.addEventListener('mouseup', onUp, true);
    root.addEventListener('mouseout', onWindowMouseOut, true);
    root.addEventListener('blur', onBlur, false);
  }

  function onWindowClick(event) {
    // click, сгенерированный сразу после drag/resize, игнорируем.
    if (Date.now() < ignoreClickUntil) {
      ignoreClickUntil = 0;
      return;
    }

    var target = event.target;
    var inside = false;

    for (var i = 0; i < api._items.length; i += 1) {
      var item = api._items[i];
      if (item && item.nodeType === 1 && item.contains(target)) {
        inside = true;
        break;
      }
    }

    // Клик вне всех рулбоксов снимает active со всех инстансов.
    if (!inside) {
      for (var j = 0; j < api._items.length; j += 1) {
        var state = states.get(api._items[j]);
        if (state) {
          state.deactivate();
        }
      }
    }
  }

  /**
   * Цвет рамки: аргумент create() применяется, если он задан.
   */
  function resolveBorderColor(color) {
    if (color === undefined || color === null || color === '') {
      return BORDER_COLOR;
    }
    return String(color);
  }

  /**
   * Заливка — цвет рамки с прозрачностью 50%. Произвольный CSS-цвет
   * приводим к rgb() через браузер, чтобы получить корректный rgba().
   */
  function toFillColor(color) {
    var rgb = toRgb(color);
    if (!rgb) {
      return FILL_COLOR;
    }
    return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', 0.5)';
  }

  function toRgb(color) {
    var host = doc.body || doc.documentElement;
    if (!host) {
      return null;
    }

    var probe = doc.createElement('div');
    probe.style.position = 'absolute';
    probe.style.left = '-9999px';
    probe.style.top = '-9999px';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.backgroundColor = color;
    host.appendChild(probe);

    var computed;
    try {
      computed = root.getComputedStyle(probe).backgroundColor;
    } finally {
      host.removeChild(probe);
    }

    var match = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/i.exec(computed || '');
    if (!match) {
      return null;
    }
    // Полностью прозрачный результат означает, что цвет не распознан.
    if (match[4] !== undefined && parseFloat(match[4]) === 0) {
      return null;
    }
    return [
      Math.round(parseFloat(match[1])),
      Math.round(parseFloat(match[2])),
      Math.round(parseFloat(match[3]))
    ];
  }

  function viewportWidth() {
    return doc.documentElement.clientWidth || root.innerWidth || 0;
  }

  function viewportHeight() {
    return doc.documentElement.clientHeight || root.innerHeight || 0;
  }

  /**
   * Троттлинг: первый вызов выполняется сразу, следующие — не чаще
   * одного раза в wait мс, с применением последнего события.
   */
  function throttle(fn, wait) {
    var lastTime = 0;
    var timer = null;
    var lastEvent = null;

    function invoke() {
      timer = null;
      lastTime = Date.now();
      if (lastEvent) {
        fn(lastEvent);
      }
    }

    function throttled(event) {
      lastEvent = event;
      var remaining = wait - (Date.now() - lastTime);
      if (remaining <= 0) {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        invoke();
      } else if (timer === null) {
        timer = setTimeout(invoke, remaining);
      }
    }

    throttled.cancel = function () {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      lastEvent = null;
    };

    return throttled;
  }
})();

