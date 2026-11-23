(async function () {
  var results = [];
  var harness = window.__popupHarness;

  function check(name, ok, info) {
    results.push((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : ''));
  }

  function $(id) {
    return document.getElementById(id);
  }

  function paletteRadio(value) {
    return document.querySelector('input[name="borderColor"][value="' + value + '"]');
  }

  function checkedValue() {
    var checked = document.querySelector('#swatches input[name="borderColor"]:checked');
    return checked ? checked.value : '(кастом)';
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function clickPalette(value) {
    var input = paletteRadio(value);
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  try {
    await wait(80);

    // 1. Отрисовка радиогруппы из палитры.
    var radios = document.querySelectorAll('#swatches input[name="borderColor"]');
    check('7 радиокнопок палитры', radios.length === RULEBOX_PALETTE.length && radios.length === 7,
      String(radios.length));
    check('радио имеют подписи', radios[0].getAttribute('aria-label') === 'Синий',
      radios[0].getAttribute('aria-label'));
    check('кружки окрашены', radios[2].parentNode.querySelector('.swatch__dot').style.backgroundColor === 'rgb(22, 163, 74)',
      radios[2].parentNode.querySelector('.swatch__dot').style.backgroundColor);

    // 2. Состояние, восстановленное из storage ('#7c3aed').
    check('цвет из storage — фиолетовый', paletteRadio('#7c3aed').checked === true && !$('custom-radio').checked,
      checkedValue());
    check('счётчик = 2', $('count').textContent === '2', $('count').textContent);
    check('кнопки удаления активны', !$('remove-last').disabled && !$('remove-all').disabled);
    check('статус про 2 рулбокса', /2 рулбокса/.test($('status').textContent), $('status').textContent);
    check('state запрошен при открытии', harness.sent.length === 1 && harness.sent[0].type === 'state',
      JSON.stringify(harness.sent));

    // 3. «Создать»: используется выбранный цвет, автовыбор уходит на соседний.
    $('create').click();
    await wait(20);
    var createMessage = harness.sent[harness.sent.length - 1];
    check('сообщение create с фиолетовым', createMessage.type === 'create' && createMessage.color === '#7c3aed',
      JSON.stringify(createMessage));
    check('счётчик = 3', $('count').textContent === '3', $('count').textContent);
    check('автовыбор — оранжевый (соседний)', paletteRadio('#f97316').checked === true && !$('custom-radio').checked,
      checkedValue());
    check('статус упоминает следующий цвет', /оранжевый/.test($('status').textContent),
      $('status').textContent);

    // 4. Ручной выбор радиокнопки сохраняется.
    clickPalette('#16a34a');
    await wait(10);
    check('выбор радиокнопки сохранён', harness.storage.borderColor === '#16a34a',
      harness.storage.borderColor);
    check('статус про цвет', /зелёный/.test($('status').textContent), $('status').textContent);

    // 5. Свой цвет: включается кастомное радио, цвет сохраняется, ротация не сдвигает.
    $('color').value = '#123456';
    $('color').dispatchEvent(new Event('input', { bubbles: true }));
    await wait(10);
    check('кастомное радио выбрано', $('custom-radio').checked === true);
    check('кастомный цвет сохранён', harness.storage.borderColor === '#123456',
      harness.storage.borderColor);
    $('create').click();
    await wait(20);
    var customMessage = harness.sent[harness.sent.length - 1];
    check('create с кастомным цветом', customMessage.color === '#123456', JSON.stringify(customMessage));
    check('кастомный цвет остался выбранным', $('custom-radio').checked === true &&
      $('color').value === '#123456', $('color').value + ' / ' + checkedValue());

    // 6. Удаление.
    $('remove-last').click();
    await wait(20);
    check('remove-last уменьшил счётчик', $('count').textContent === '3', $('count').textContent);
    $('remove-all').click();
    await wait(20);
    check('remove-all обнулил счётчик', $('count').textContent === '0', $('count').textContent);
    check('кнопки удаления отключены', $('remove-last').disabled && $('remove-all').disabled);
    check('бейдж пустого счётчика', $('count').classList.contains('badge--empty'));

    // 7. Ошибка от service worker показывается красным.
    harness.failNext = 'На этой странице нельзя выполнять код расширения.';
    $('create').click();
    await wait(20);
    check('ошибка отображена', $('status').classList.contains('status--error') &&
      /нельзя выполнять/.test($('status').textContent), $('status').textContent);

    document.getElementById('out').textContent = results.join('\n');
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
    document.getElementById('out').textContent = results.join('\n');
  }
})();
