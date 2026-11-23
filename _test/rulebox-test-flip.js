(async function () {
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

  function near(actual, expected, tolerance) {
    return Math.abs(actual - expected) <= (tolerance === undefined ? 1 : tolerance);
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

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  // Движение мыши с паузой: движок троттлит обновления до 30 мс.
  async function move(x, y) {
    mouse('mousemove', document.body, x, y);
    await wait(40);
  }

  try {
    var box = rulebox.create();
    var resizer = box.children[1];
    var label = box.children[0];
    var start = center(box);
    mouse('click', box, start.x, start.y);

    var base = rect(box);
    var anchorX = base.left;
    var anchorY = base.top;

    check('ручка изначально в правом нижнем углу',
      getComputedStyle(resizer).right !== 'auto' && getComputedStyle(resizer).bottom !== 'auto' &&
      getComputedStyle(resizer).cursor === 'nwse-resize',
      getComputedStyle(resizer).cursor);

    // 1. Тянем ручку влево-вверх за левый верхний угол рулбокса.
    mouse('mousedown', resizer, base.right, base.bottom);
    await move(anchorX - 120, anchorY - 80);
    var flipped = rect(box);
    var flippedResizerCenter = center(resizer);

    check('размер вырос влево-вверх: 120x80',
      near(flipped.width, 120) && near(flipped.height, 80),
      flipped.width + 'x' + flipped.height);
    check('якорь остался на месте (правый нижний угол)',
      near(flipped.right, anchorX) && near(flipped.bottom, anchorY),
      flipped.right + ',' + flipped.bottom + ' vs ' + anchorX + ',' + anchorY);
    check('ручка переехала под курсор',
      near(flippedResizerCenter.x, anchorX - 120) && near(flippedResizerCenter.y, anchorY - 80),
      flippedResizerCenter.x + ',' + flippedResizerCenter.y);
    check('ручка в левом верхнем углу рулбокса',
      near(flippedResizerCenter.x, flipped.left) && near(flippedResizerCenter.y, flipped.top),
      flippedResizerCenter.x + ',' + flippedResizerCenter.y + ' vs ' + flipped.left + ',' + flipped.top);
    check('подпись показывает актуальный размер',
      label.textContent === Math.round(flipped.width) + ' × ' + Math.round(flipped.height),
      JSON.stringify(label.textContent));

    // 2. Продолжаем вести дальше влево-вверх: размер растёт свободно.
    mouse('mousemove', document.body, anchorX - 300, anchorY - 200);
    await wait(40);
    var bigger = rect(box);
    check('рост не ограничен: 300x200',
      near(bigger.width, 300) && near(bigger.height, 200),
      bigger.width + 'x' + bigger.height);
    check('якорь всё ещё неподвижен',
      near(bigger.right, anchorX) && near(bigger.bottom, anchorY),
      bigger.right + ',' + bigger.bottom);
    check('подпись после роста',
      label.textContent === Math.round(bigger.width) + ' × ' + Math.round(bigger.height),
      JSON.stringify(label.textContent));
    mouse('mouseup', document.body, anchorX - 300, anchorY - 200);

    // 3. Новый жест за переехавшую ручку: якорь — бывший правый нижний угол.
    var flippedRect = rect(box);
    var flippedCenter = center(resizer);
    check('ручка осталась в левом верхнем углу после mouseup',
      near(flippedCenter.x, flippedRect.left) && near(flippedCenter.y, flippedRect.top),
      flippedCenter.x + ',' + flippedCenter.y);

    mouse('mousedown', resizer, flippedCenter.x, flippedCenter.y);
    await move(anchorX - 50, anchorY - 40);
    var second = rect(box);
    check('ресайз от перевёрнутой ручки: 50x40',
      near(second.width, 50) && near(second.height, 40),
      second.width + 'x' + second.height);
    check('якорь — бывший правый нижний угол',
      near(second.right, anchorX) && near(second.bottom, anchorY),
      second.right + ',' + second.bottom);

    // 4. Возврат через якорь: рулбокс снова становится обычным.
    mouse('mousemove', document.body, anchorX + 30, anchorY + 20);
    await wait(40);
    var back = rect(box);
    var backCenter = center(resizer);
    check('обратный ресайз без переворота: 30x20',
      near(back.width, 30) && near(back.height, 20), back.width + 'x' + back.height);
    check('верхний левый угол встал на якорь',
      near(back.left, anchorX) && near(back.top, anchorY),
      back.left + ',' + back.top);
    check('ручка снова в правом нижнем углу',
      near(backCenter.x, back.right) && near(backCenter.y, back.bottom) &&
      getComputedStyle(resizer).cursor === 'nwse-resize',
      backCenter.x + ',' + backCenter.y + ' ' + getComputedStyle(resizer).cursor);
    mouse('mouseup', document.body, anchorX + 30, anchorY + 20);

    // 5. Смешанный переворот: влево и вниз — ручка в левом нижнем углу.
    mouse('mousedown', resizer, center(resizer).x, center(resizer).y);
    await move(anchorX - 140, anchorY + 100);
    var mixed = rect(box);
    var mixedCenter = center(resizer);
    check('смешанный переворот: 140x100',
      near(mixed.width, 140) && near(mixed.height, 100),
      mixed.width + 'x' + mixed.height);
    check('ручка в левом нижнем углу',
      near(mixedCenter.x, mixed.left) && near(mixedCenter.y, mixed.bottom),
      mixedCenter.x + ',' + mixedCenter.y + ' vs ' + mixed.left + ',' + mixed.bottom);
    check('курсор nesw-resize при смешанном перевороте',
      getComputedStyle(resizer).cursor === 'nesw-resize', getComputedStyle(resizer).cursor);

    // 6. Минимум 20x20 в зоне якоря: ручка прилипает к 20px от якоря.
    mouse('mousemove', document.body, anchorX - 5, anchorY + 100);
    await wait(40);
    var clamped = rect(box);
    check('минимальная ширина 20 при движении через якорь',
      near(clamped.width, 20) && near(clamped.height, 100),
      clamped.width + 'x' + clamped.height);
    check('ручка прилипла к 20px от якоря',
      near(center(resizer).x, anchorX - 20) && near(clamped.right, anchorX),
      center(resizer).x + ' vs ' + (anchorX - 20));

    // 7. Нет клампа к окну: курсор может уйти в отрицательные координаты.
    mouse('mousemove', document.body, -200, -150);
    await wait(40);
    var outside = rect(box);
    var outsideResizer = center(resizer);
    check('ручка под курсором вне окна',
      near(outsideResizer.x, -200) && near(outsideResizer.y, -150),
      outsideResizer.x + ',' + outsideResizer.y);
    check('размер не ограничен вьюпортом',
      near(outside.width, anchorX + 200) && near(outside.height, anchorY + 150),
      outside.width + 'x' + outside.height + ' при якоре ' + anchorX + ',' + anchorY);
    check('подпись обновилась после выхода за окно',
      label.textContent === (Math.round(outside.width) + ' × ' + Math.round(outside.height)),
      JSON.stringify(label.textContent));
    mouse('mouseup', document.body, -200, -150);

    // 8. Перетаскивание за тело не сбрасывает перевёрнутую ручку.
    var dragFrom = center(box);
    mouse('mousedown', box, dragFrom.x, dragFrom.y);
    await move(dragFrom.x + 100, dragFrom.y + 100);
    mouse('mouseup', document.body, dragFrom.x + 100, dragFrom.y + 100);
    var dragged = rect(box);
    var draggedResizer = center(resizer);
    check('ручка при перетаскивании остаётся в том же углу',
      near(draggedResizer.x, dragged.left) && near(draggedResizer.y, dragged.top),
      draggedResizer.x + ',' + draggedResizer.y + ' vs ' + dragged.left + ',' + dragged.top);

    document.getElementById('out').textContent = results.join('\n');
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
    document.getElementById('out').textContent = results.join('\n');
  }
})();
