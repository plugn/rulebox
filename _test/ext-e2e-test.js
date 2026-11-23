(async function () {
  var results = [];
  var harness = window.__e2e;

  function check(name, ok, info) {
    results.push((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : ''));
  }

  function $(id) {
    return document.getElementById(id);
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function borders() {
    return rulebox._items.map(function (item) {
      return getComputedStyle(item).borderTopColor;
    });
  }

  function paletteRadio(value) {
    return document.querySelector('#swatches input[name="borderColor"][value="' + value + '"]');
  }

  try {
    // Попап при открытии запрашивает состояние; движка ещё нет.
    await wait(80);
    check('попап открылся на пустой странице', $('count').textContent === '0' &&
      /нет рулбоксов/.test($('status').textContent), $('status').textContent);
    check('движок не внедрён до создания', typeof window.rulebox === 'undefined');

    // Клик «Создать рулбокс»: попап → SW → инъекция → движок.
    $('create').click();
    await wait(60);
    check('движок внедрён после клика', typeof rulebox === 'object' && Array.isArray(rulebox._items));
    check('создан один синий рулбокс', borders().join() === 'rgb(0, 0, 255)', borders().join());
    check('счётчик попапа = 1', $('count').textContent === '1', $('count').textContent);
    check('бейдж = 1', harness.badge.text === '1', String(harness.badge.text));
    check('автовыбор — красный', paletteRadio('#ff0000').checked === true);
    check('storage = #ff0000', harness.storage.borderColor === '#ff0000',
      harness.storage.borderColor);

    // Второй и третий клики — соседние цвета палитры.
    $('create').click();
    await wait(60);
    $('create').click();
    await wait(60);
    check('три рулбокса: синий, красный, зелёный',
      borders().join() === 'rgb(0, 0, 255),rgb(255, 0, 0),rgb(22, 163, 74)', borders().join());
    check('счётчик попапа = 3', $('count').textContent === '3', $('count').textContent);
    check('автовыбор — фиолетовый', paletteRadio('#7c3aed').checked === true);
    check('storage = #7c3aed', harness.storage.borderColor === '#7c3aed',
      harness.storage.borderColor);
    check('бейдж = 3', harness.badge.text === '3', String(harness.badge.text));

    // Хоткей (попап при этом закрыт): берёт цвет из storage, двигает дальше.
    harness.command('create-rulebox');
    await wait(80);
    check('хоткей добавил четвёртый рулбокс', rulebox._items.length === 4,
      String(rulebox._items.length));
    check('хоткей создал фиолетовый', borders()[3] === 'rgb(124, 58, 237)', borders()[3]);
    check('storage после хоткея — оранжевый', harness.storage.borderColor === '#f97316',
      harness.storage.borderColor);
    check('бейдж = 4', harness.badge.text === '4', String(harness.badge.text));

    // Ручной выбор радиокнопки и создание с ним.
    var cyan = paletteRadio('#0891b2');
    cyan.checked = true;
    cyan.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(20);
    check('выбор бирюзового сохранён', harness.storage.borderColor === '#0891b2',
      harness.storage.borderColor);
    $('create').click();
    await wait(60);
    check('пятый рулбокс бирюзовый', borders()[4] === 'rgb(8, 145, 178)', borders()[4]);

    // Удаление: последний и все.
    $('remove-last').click();
    await wait(40);
    check('remove-last через попап', rulebox._items.length === 4 && $('count').textContent === '4',
      String(rulebox._items.length) + ' / ' + $('count').textContent);
    $('remove-all').click();
    await wait(40);
    check('remove-all через попап', rulebox._items.length === 0 && $('count').textContent === '0',
      String(rulebox._items.length));
    check('бейдж очищен', harness.badge.text === '', String(harness.badge.text));
    check('кнопки удаления отключены', $('remove-last').disabled && $('remove-all').disabled);

    // Движок остался подключённым: новый рулбокс создаётся без инъекции.
    $('create').click();
    await wait(60);
    check('движок не перезапускался', rulebox._items.length === 1 && typeof rulebox === 'object',
      String(rulebox._items.length));

    document.getElementById('out').textContent = results.join('\n');
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
    document.getElementById('out').textContent = results.join('\n');
  }
})();
