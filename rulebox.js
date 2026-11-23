/**
 * rulebox — измерительная линейка (рулбокс) поверх страницы.
 * Сниппет для Google Chrome DevTools → Sources → Snippets.
 * Описание задачи: rulebox.md
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
  // Прилипание к направляющим «магнита» (в клиентских CSS-пикселях).
  var SNAP_THRESHOLD = 6;
  var GUIDE_COLOR = '#e11d48';
  var GUIDE_ATTR = 'data-rulebox-guide';
  // Угловая зона: 30x30, но не больше половины ребра.
  var CORNER_ZONE = 30;
  // Шаг сдвига рулбокса стрелками (Shift — крупный шаг).
  var ARROW_STEP = 1;
  var ARROW_STEP_LARGE = 10;

  // Состояние каждого рулбокса. WeakMap, чтобы не мусорить в DOM-элементах.
  var states = new WeakMap();

  // После drag/resize браузер может сгенерировать click на элементе под
  // курсором (а не на рулбоксе), если throttled-позиция не успела
  // обновиться. Такой click не должен деактивировать рулбоксы.
  var ignoreClickUntil = 0;

  // Направляющие «магнита» задаются в клиентских координатах вьюпорта:
  // так они не зависят от скролла, зума и offsetParent.
  var guides = {
    vertical: [],
    horizontal: [],
    threshold: SNAP_THRESHOLD
  };

  var guideLines = {
    vertical: null,
    horizontal: null
  };

  var api = {
    _items: [],
    create: create,
    list: list,
    remove: remove,
    setGuides: setGuides,
    clearGuides: clearGuides
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

    // Направляющие прошлого запуска тоже убираем.
    var oldGuides = doc.querySelectorAll('[' + GUIDE_ATTR + ']');
    for (var j = 0; j < oldGuides.length; j += 1) {
      if (oldGuides[j].parentNode) {
        oldGuides[j].parentNode.removeChild(oldGuides[j]);
      }
    }
  })();

  root.addEventListener('click', onWindowClick, true);
  root.rulebox = api;

  return api;

  function list() {
    return api._items;
  }

  /**
   * Линии «магнита» в клиентских координатах вьюпорта (как их отдаёт
   * снимок вкладки). threshold — расстояние в CSS px, в пределах
   * которого срабатывает прилипание.
   */
  function setGuides(vertical, horizontal, threshold) {
    guides.vertical = normalizeGuides(vertical);
    guides.horizontal = normalizeGuides(horizontal);
    if (typeof threshold === 'number' && isFinite(threshold) && threshold > 0) {
      guides.threshold = threshold;
    }
  }

  function clearGuides() {
    guides.vertical = [];
    guides.horizontal = [];
    hideGuideLines();
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
    // Рулбокс можно сфокусировать программно (клик/активация), чтобы
    // работало удаление по Backspace. В Tab-порядок он не попадает.
    box.tabIndex = -1;
    box.setAttribute('data-rulebox-item', '');

    // Resizer центрируется на том углу, который тянет пользователь.
    // Абсолютный потомок позиционируется относительно padding box
    // родителя, поэтому компенсируем половину resizer'а и толщину рамки.
    var resizer = doc.createElement('div');
    resizer.setAttribute('data-rulebox-resizer', '');
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

    // Угловые зоны: нажатие внутри угла переключает ручку в этот угол и
    // сразу позволяет тянуть. Размер зоны — 30px, но не больше половины
    // ребра, чтобы зоны соседних углов не пересекались.
    var zones = ['tl', 'tr', 'bl', 'br'].map(function (corner) {
      var zone = doc.createElement('div');
      zone.setAttribute('data-rulebox-zone', corner);
      zone.style.position = 'absolute';
      zone.style.display = 'none';
      zone.style.margin = '0';
      zone.style.padding = '0';
      zone.style.border = '0';
      zone.style.backgroundColor = 'transparent';
      zone.style.pointerEvents = 'auto';
      zone.style.cursor = (corner === 'tl' || corner === 'br') ? 'nwse-resize' : 'nesw-resize';
      zone.style.left = corner === 'tl' || corner === 'bl' ? '0' : 'auto';
      zone.style.right = corner === 'tl' || corner === 'bl' ? 'auto' : '0';
      zone.style.top = corner === 'tl' || corner === 'tr' ? '0' : 'auto';
      zone.style.bottom = corner === 'tl' || corner === 'tr' ? 'auto' : '0';
      zone.addEventListener('mousedown', function (event) {
        onCornerMouseDown(corner, event);
      });
      zone.addEventListener('click', onCornerClick);
      return zone;
    });

    box.appendChild(label);
    for (var zoneIndex = 0; zoneIndex < zones.length; zoneIndex += 1) {
      box.appendChild(zones[zoneIndex]);
    }
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
    updateZones();

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
    box.addEventListener('keydown', onBoxKeyDown);
    resizer.addEventListener('mousedown', onResizerMouseDown);
    resizer.addEventListener('click', onResizerClick);

    return box;

    function activate() {
      state.active = true;
      setFill(true);
      label.style.color = ACTIVE_TEXT_COLOR;
      resizer.style.display = 'block';
      showZones();
      focusBox();
    }

    /** Фокус на рулбоксе: нужен для удаления по Backspace. */
    function focusBox() {
      if (doc.activeElement === box) {
        return;
      }
      try {
        box.focus({ preventScroll: true });
      } catch (error) {
        box.focus();
      }
    }

    function deactivate() {
      if (state.stopTracking) {
        state.stopTracking();
      }
      state.active = false;
      setFill(false);
      label.style.color = strokeColor;
      resizer.style.display = 'none';
      hideZones();
    }

    function showZones() {
      for (var i = 0; i < zones.length; i += 1) {
        zones[i].style.display = 'block';
      }
      updateZones();
    }

    function hideZones() {
      for (var i = 0; i < zones.length; i += 1) {
        zones[i].style.display = 'none';
      }
    }

    /** Размер угловой зоны: 30px, но не больше половины ребра. */
    function updateZones() {
      var rect = box.getBoundingClientRect();
      var width = Math.max(1, Math.min(CORNER_ZONE, rect.width / 2));
      var height = Math.max(1, Math.min(CORNER_ZONE, rect.height / 2));

      for (var i = 0; i < zones.length; i += 1) {
        zones[i].style.width = width + 'px';
        zones[i].style.height = height + 'px';
      }
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

    /**
     * Клавиши на сфокусированном рулбоксе:
     *  - Backspace/Delete — удалить рулбокс;
     *  - стрелки — сдвиг на 1px, Shift+стрелки — на 10px.
     * Обработчик висит на самом рулбоксе, поэтому ввод текста в полях
     * страницы не затрагивается.
     */
    function onBoxKeyDown(event) {
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        event.stopPropagation();

        var index = api._items.indexOf(box);
        if (index !== -1) {
          remove(index);
        }
        return;
      }

      var horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      var vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
      if (!horizontal && !vertical) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      var step = event.shiftKey ? ARROW_STEP_LARGE : ARROW_STEP;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        step = -step;
      }

      if (horizontal) {
        box.style.left = (parseFloat(box.style.left) || 0) + step + 'px';
      } else {
        box.style.top = (parseFloat(box.style.top) || 0) + step + 'px';
      }
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
     * Нажатие в угловой зоне переключает ручку в этот угол и сразу
     * начинает отслеживание: клик без движения оставит ручку в углу,
     * а протяжка сразу изменит размер.
     */
    function onCornerMouseDown(corner, event) {
      if (event.button !== 0 || !state.active) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      placeResizer(
        corner === 'tl' || corner === 'bl',
        corner === 'tl' || corner === 'tr'
      );
      focusBox();
      startTracking(state, createResizeHandler());
    }

    function onCornerClick(event) {
      // Клик по зоне не должен активировать рулбокс повторно.
      event.stopPropagation();
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

      var snapX = snapEdges(
        [current.left + offsetX, current.right + offsetX],
        guides.vertical,
        guides.threshold
      );
      var snapY = snapEdges(
        [current.top + offsetY, current.bottom + offsetY],
        guides.horizontal,
        guides.threshold
      );

      var shiftX = offsetX + (snapX ? snapX.delta : 0);
      var shiftY = offsetY + (snapY ? snapY.delta : 0);

      box.style.left = (parseFloat(box.style.left) || 0) + shiftX + 'px';
      box.style.top = (parseFloat(box.style.top) || 0) + shiftY + 'px';

      showGuideLines(snapX ? snapX.value : null, snapY ? snapY.value : null);
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

      // Прилипание считаем в клиентских координатах: там же заданы
      // направляющие, полученные из снимка вкладки.
      var clientX = event.clientX;
      var clientY = event.clientY;
      var snapX = snapValue(clientX, guides.vertical, guides.threshold);
      var snapY = snapValue(clientY, guides.horizontal, guides.threshold);
      if (snapX) {
        clientX = snapX.value;
      }
      if (snapY) {
        clientY = snapY.value;
      }

      // Координаты мыши в документе — через дельту от текущего
      // прямоугольника, чтобы не зависеть от скролла и offsetParent.
      var pointerX = left + (clientX - current.left);
      var pointerY = top + (clientY - current.top);

      var flipX = pointerX < anchor.x;
      var flipY = pointerY < anchor.y;
      var width = Math.max(MIN_SIZE, Math.abs(pointerX - anchor.x));
      var height = Math.max(MIN_SIZE, Math.abs(pointerY - anchor.y));

      box.style.left = (flipX ? anchor.x - width : anchor.x) + 'px';
      box.style.top = (flipY ? anchor.y - height : anchor.y) + 'px';
      box.style.width = width + 'px';
      box.style.height = height + 'px';

      placeResizer(flipX, flipY);
      showGuideLines(snapX ? snapX.value : null, snapY ? snapY.value : null);
      updateLabel();
      updateZones();
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
      hideGuideLines();
      markGesture(false);
      state.stopTracking = null;
    }

    state.stopTracking = cleanup;
    markGesture(true);
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

  function normalizeGuides(values) {
    if (!Array.isArray(values)) {
      return [];
    }

    var result = [];
    for (var i = 0; i < values.length; i += 1) {
      var value = Number(values[i]);
      if (isFinite(value)) {
        result.push(value);
      }
    }
    result.sort(function (a, b) {
      return a - b;
    });
    return result;
  }

  /** Ближайшая линия в пределах порога; есть ли смысл прилипать. */
  function snapValue(value, lines, threshold) {
    var best = null;

    for (var i = 0; i < lines.length; i += 1) {
      var delta = lines[i] - value;
      if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best.delta))) {
        best = { value: lines[i], delta: delta };
      }
    }

    return best;
  }

  /**
   * Для перетаскивания: ищем линию рядом с любой из граней рулбокса и
   * отдаём сдвиг, который нужно применить к его позиции.
   */
  function snapEdges(edges, lines, threshold) {
    var best = null;

    for (var i = 0; i < edges.length; i += 1) {
      var snap = snapValue(edges[i], lines, threshold);
      if (snap && (best === null || Math.abs(snap.delta) < Math.abs(best.delta))) {
        best = { value: snap.value, delta: snap.delta };
      }
    }

    return best;
  }

  function ensureGuideLine(axis) {
    var existing = guideLines[axis];
    if (existing && existing.parentNode) {
      return existing;
    }

    var line = doc.createElement('div');
    line.setAttribute(GUIDE_ATTR, axis);
    line.style.position = 'fixed';
    line.style.zIndex = String(Z_INDEX + 1);
    line.style.margin = '0';
    line.style.padding = '0';
    line.style.border = '0';
    line.style.pointerEvents = 'none';
    line.style.backgroundColor = GUIDE_COLOR;
    line.style.display = 'none';

    if (axis === 'vertical') {
      line.style.top = '0';
      line.style.height = '100vh';
      line.style.width = BORDER_WIDTH + 'px';
    } else {
      line.style.left = '0';
      line.style.width = '100vw';
      line.style.height = BORDER_WIDTH + 'px';
    }

    (doc.body || doc.documentElement).appendChild(line);
    guideLines[axis] = line;
    return line;
  }

  /** null скрывает направляющую соответствующей оси. */
  function showGuideLines(vertical, horizontal) {
    if (vertical === null) {
      hideGuideLine('vertical');
    } else {
      var verticalLine = ensureGuideLine('vertical');
      verticalLine.style.left = vertical + 'px';
      verticalLine.style.display = 'block';
    }

    if (horizontal === null) {
      hideGuideLine('horizontal');
    } else {
      var horizontalLine = ensureGuideLine('horizontal');
      horizontalLine.style.top = horizontal + 'px';
      horizontalLine.style.display = 'block';
    }
  }

  function hideGuideLine(axis) {
    if (guideLines[axis]) {
      guideLines[axis].style.display = 'none';
    }
  }

  function hideGuideLines() {
    hideGuideLine('vertical');
    hideGuideLine('horizontal');
  }

  /**
   * Мост для авто-режима: пока идёт drag/resize, страница помечена
   * атрибутом, и слушатель активности не принимает эти события за
   * прокрутку/panning.
   */
  function markGesture(active) {
    if (active) {
      doc.documentElement.setAttribute('data-rulebox-gesture', '');
    } else {
      doc.documentElement.removeAttribute('data-rulebox-gesture');
    }
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

