(function () {
  var results = [];

  function check(name, ok, info) {
    results.push((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : ''));
  }

  function rect(el) {
    return el.getBoundingClientRect();
  }

  function center(el) {
    var r = rect(el);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function label(box) {
    return box.children[0];
  }

  function resizer(box) {
    return box.children[1];
  }

  function color(el) {
    return getComputedStyle(el).color;
  }

  function bg(el) {
    return getComputedStyle(el).backgroundColor;
  }

  function mouse(type, target, x, y) {
    target.dispatchEvent(new MouseEvent(type, {
      bubbles: type !== 'mouseenter' && type !== 'mouseleave',
      cancelable: true,
      clientX: x || 0,
      clientY: y || 0,
      button: 0,
      buttons: type === 'mousedown' ? 1 : 0
    }));
  }

  try {
    check('API exported', typeof rulebox === 'object' &&
      typeof rulebox.create === 'function' &&
      typeof rulebox.list === 'function' &&
      typeof rulebox.remove === 'function');
    check('list returns _items', rulebox.list() === rulebox._items);

    var box = rulebox.create();
    var r = rect(box);
    var cs = getComputedStyle(box);
    var l = label(box);
    var lr = rect(l);
    var rs = resizer(box);

    check('default border blue', cs.borderTopColor === 'rgb(0, 0, 255)', cs.borderTopColor);
    check('size 200x50', Math.abs(r.width - 200) < 0.5 && Math.abs(r.height - 50) < 0.5,
      r.width + 'x' + r.height);
    check('label exists', l.nodeType === 1 && l.textContent.length > 0);
    check('label text 200 x 50', l.textContent === '200 × 50', JSON.stringify(l.textContent));
    check('label color = border color', color(l) === 'rgb(0, 0, 255)', color(l));
    check('label font 12px', getComputedStyle(l).fontSize === '12px', getComputedStyle(l).fontSize);
    check('label centered horizontally',
      Math.abs(lr.left - r.left - 1) < 0.6 && Math.abs(r.right - lr.right - 1) < 0.6,
      (lr.left - r.left) + ' / ' + (r.right - lr.right) + ' (box ' + r.width + ')');
    check('label pressed to bottom border with padding',
      Math.abs(r.bottom - lr.bottom - 1) < 0.6,
      'gap=' + (r.bottom - lr.bottom));
    check('label bottom padding 6px',
      getComputedStyle(l).paddingBottom === '6px', getComputedStyle(l).paddingBottom);
    check('label ignores pointer events', getComputedStyle(l).pointerEvents === 'none',
      getComputedStyle(l).pointerEvents);
    check('resizer hidden initially', getComputedStyle(rs).display === 'none');
    check('resizer styles 18x18', rs.style.width === '18px' && rs.style.height === '18px',
      rs.style.width + 'x' + rs.style.height);
    check('resizer border blue', getComputedStyle(rs).borderTopColor === 'rgb(0, 0, 255)',
      getComputedStyle(rs).borderTopColor);

    mouse('mouseenter', box);
    check('hover fill default', bg(box) === 'rgba(0, 0, 255, 0.5)', bg(box));
    check('hover keeps label color', color(l) === 'rgb(0, 0, 255)', color(l));
    mouse('mouseleave', box);
    check('mouseleave clears fill', bg(box) === 'rgba(0, 0, 0, 0)', bg(box));

    var c = center(box);
    mouse('click', box, c.x, c.y);
    var rrc = center(rs);
    var br = rect(box);
    check('active fill kept', bg(box) === 'rgba(0, 0, 255, 0.5)', bg(box));
    check('active label is white', color(l) === 'rgb(255, 255, 255)', color(l));
    check('resizer visible', getComputedStyle(rs).display === 'block');
    var rrMeasured = rect(rs);
    check('resizer 18x18 visible',
      Math.abs(rrMeasured.width - 18) < 0.5 && Math.abs(rrMeasured.height - 18) < 0.5,
      rrMeasured.width + 'x' + rrMeasured.height);
    check('resizer center on corner',
      Math.abs(rrc.x - br.right) < 0.6 && Math.abs(rrc.y - br.bottom) < 0.6,
      rrc.x + ',' + rrc.y + ' vs ' + br.right + ',' + br.bottom);

    // Resize до 320x180: подпись должна обновиться.
    var beforeResize = rect(box);
    mouse('mousedown', rs, beforeResize.right, beforeResize.bottom);
    mouse('mousemove', document.body, beforeResize.left + 320, beforeResize.top + 180);
    mouse('mouseup', document.body, beforeResize.left + 320, beforeResize.top + 180);
    var afterResize = rect(box);
    check('resize to 320x180',
      Math.abs(afterResize.width - 320) < 1 && Math.abs(afterResize.height - 180) < 1,
      afterResize.width + 'x' + afterResize.height);
    check('label shows new size', l.textContent === '320 × 180', JSON.stringify(l.textContent));
    check('label stays inside after resize',
      Math.abs(afterResize.bottom - rect(l).bottom - 1) < 0.6,
      'gap=' + (afterResize.bottom - rect(l).bottom));

    // Resize меньше минимума.
    mouse('mousedown', rs, afterResize.right, afterResize.bottom);
    mouse('mousemove', document.body, afterResize.left - 100, afterResize.top - 100);
    mouse('mouseup', document.body, afterResize.left - 100, afterResize.top - 100);
    var minRect = rect(box);
    check('minimum size 20x20',
      Math.abs(minRect.width - 20) < 0.5 && Math.abs(minRect.height - 20) < 0.5,
      minRect.width + 'x' + minRect.height);
    check('label shows 20 x 20', l.textContent === '20 × 20', JSON.stringify(l.textContent));

    // Клик вне — деактивация, цвет подписи возвращается к цвету рамки.
    // Ждём окончания 100-мс окна подавления клика после drag/resize.
    var waitUntil = Date.now() + 120;
    while (Date.now() < waitUntil) { /* busy wait */ }
    mouse('click', document.body, 5, 5);
    check('outside click deactivates', bg(box) === 'rgba(0, 0, 0, 0)' &&
      getComputedStyle(rs).display === 'none');
    check('inactive label back to border color', color(l) === 'rgb(0, 0, 255)', color(l));

    // Перетаскивание по-прежнему центрирует рулбокс на мыши.
    var dragFrom = center(box);
    mouse('click', box, dragFrom.x, dragFrom.y);
    mouse('mousedown', box, dragFrom.x, dragFrom.y);
    mouse('mousemove', document.body, 400, 300);
    mouse('mouseup', document.body, 400, 300);
    var dragTo = center(box);
    check('drag centers on mouse',
      Math.abs(dragTo.x - 400) < 1 && Math.abs(dragTo.y - 300) < 1,
      dragTo.x + ',' + dragTo.y);
    check('label unchanged by drag', l.textContent === '20 × 20', JSON.stringify(l.textContent));

    // Кастомный цвет рамки: hex.
    var red = rulebox.create('#ff0000');
    var redLabel = label(red);
    var redResizer = resizer(red);
    check('custom border color applied',
      getComputedStyle(red).borderTopColor === 'rgb(255, 0, 0)',
      getComputedStyle(red).borderTopColor);
    check('custom resizer border color',
      getComputedStyle(redResizer).borderTopColor === 'rgb(255, 0, 0)',
      getComputedStyle(redResizer).borderTopColor);
    check('custom label color', color(redLabel) === 'rgb(255, 0, 0)', color(redLabel));
    mouse('mouseenter', red);
    check('custom hover fill rgba(255,0,0,0.5)',
      bg(red) === 'rgba(255, 0, 0, 0.5)', bg(red));
    mouse('mouseleave', red);
    var redCenter = center(red);
    mouse('click', red, redCenter.x, redCenter.y);
    check('custom active label white', color(redLabel) === 'rgb(255, 255, 255)', color(redLabel));
    check('custom label size text', redLabel.textContent === '200 × 50',
      JSON.stringify(redLabel.textContent));

    // Именованный цвет.
    var named = rulebox.create('green');
    check('named color border', getComputedStyle(named).borderTopColor === 'rgb(0, 128, 0)',
      getComputedStyle(named).borderTopColor);
    mouse('mouseenter', named);
    check('named color hover fill rgba(0,128,0,0.5)',
      bg(named) === 'rgba(0, 128, 0, 0.5)', bg(named));
    mouse('mouseleave', named);

    // rgb() синтаксис.
    var rgbBox = rulebox.create('rgb(10, 20, 30)');
    check('rgb() color border', getComputedStyle(rgbBox).borderTopColor === 'rgb(10, 20, 30)',
      getComputedStyle(rgbBox).borderTopColor);
    mouse('mouseenter', rgbBox);
    check('rgb() hover fill', bg(rgbBox) === 'rgba(10, 20, 30, 0.5)', bg(rgbBox));
    mouse('mouseleave', rgbBox);

    // Явный undefined — цвет по умолчанию.
    var undef = rulebox.create(undefined);
    check('undefined falls back to blue',
      getComputedStyle(undef).borderTopColor === 'rgb(0, 0, 255)',
      getComputedStyle(undef).borderTopColor);

    check('items count', rulebox._items.length === 5, String(rulebox._items.length));

    rulebox.remove(0);
    check('remove works', rulebox._items.length === 4 && !document.body.contains(box));
    while (rulebox._items.length) {
      rulebox.remove(0);
    }
    check('all removed', rulebox._items.length === 0);
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
  }

  document.getElementById('out').textContent = results.join('\n');
})();
