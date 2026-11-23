(async function () {
  var results = [];
  var harness = window.__harness;

  function check(name, ok, info) {
    results.push((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : ''));
  }

  function borderOf(index) {
    return getComputedStyle(rulebox._items[index]).borderTopColor;
  }

  try {
    // 1. Пустая страница: состояние без инъекции движка.
    var state = await harness.send({ type: 'state' });
    check('state без движка', state.ok === true && state.count === 0, JSON.stringify(state));
    check('движок не внедрён до создания', typeof window.rulebox === 'undefined');
    check('бейдж пуст', harness.badge.text === '', String(harness.badge.text));

    // 2. Первый рулбокс — синий, автовыбор уходит на красный.
    var first = await harness.send({ type: 'create', color: '#0000ff' });
    check('create вернул count=1', first.ok && first.count === 1, JSON.stringify(first));
    check('движок внедрён', typeof rulebox === 'object' && Array.isArray(rulebox._items));
    check('первый рулбокс синий', borderOf(0) === 'rgb(0, 0, 255)', borderOf(0));
    check('nextColor = красный', first.nextColor === '#ff0000', first.nextColor);
    check('автовыбор сохранён в storage', harness.storage.borderColor === '#ff0000',
      harness.storage.borderColor);
    check('бейдж = 1', harness.badge.text === '1', String(harness.badge.text));
    check('цвет бейджа задан', harness.badge.color === '#2563eb', String(harness.badge.color));

    // 3. Второй рулбокс — следующим цветом из storage.
    var second = await harness.send({ type: 'create', color: harness.storage.borderColor });
    check('второй рулбокс красный', borderOf(1) === 'rgb(255, 0, 0)', borderOf(1));
    check('nextColor = зелёный', second.nextColor === '#16a34a', second.nextColor);
    check('бейдж = 2', harness.badge.text === '2', String(harness.badge.text));

    // 4. Хоткей: цвет из storage (зелёный), после создания — фиолетовый.
    harness.command('create-rulebox');
    await new Promise(function (resolve) {
      setTimeout(resolve, 50);
    });
    check('хоткей создал третий рулбокс', rulebox._items.length === 3, String(rulebox._items.length));
    check('хоткей использовал зелёный', borderOf(2) === 'rgb(22, 163, 74)', borderOf(2));
    check('автовыбор после хоткея — фиолетовый', harness.storage.borderColor === '#7c3aed',
      harness.storage.borderColor);
    check('бейдж = 3', harness.badge.text === '3', String(harness.badge.text));

    // 5. Удаление.
    var removed = await harness.send({ type: 'remove-last' });
    check('remove-last', removed.ok && removed.count === 2, JSON.stringify(removed));
    var all = await harness.send({ type: 'remove-all' });
    check('remove-all', all.ok && all.count === 0 && rulebox._items.length === 0,
      JSON.stringify(all));
    check('бейдж очищен', harness.badge.text === '', String(harness.badge.text));

    // 6. Свой цвет: применяется, но ротация его не меняет.
    var custom = await harness.send({ type: 'create', color: '#123456' });
    check('свой цвет применён', borderOf(0) === 'rgb(18, 52, 86)', borderOf(0));
    check('свой цвет не ротируется', custom.nextColor === '#123456', custom.nextColor);
    await harness.send({ type: 'remove-all' });

    // 7. Неизвестная команда.
    var unknown = await harness.send({ type: 'nope' });
    check('неизвестная команда — ошибка', unknown.ok === false && /Неизвестная/.test(unknown.error),
      JSON.stringify(unknown));

    // 8. Запрещённая страница: ошибка Chrome переводится в понятный текст.
    harness.failNext = 'Cannot access contents of the page.';
    var denied = await harness.send({ type: 'state' });
    check('ошибка доступа локализована',
      denied.ok === false && /нельзя выполнять код расширения/.test(denied.error),
      JSON.stringify(denied));

    document.getElementById('out').textContent = results.join('\n');
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
    document.getElementById('out').textContent = results.join('\n');
  }
})();
