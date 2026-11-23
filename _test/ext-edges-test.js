(function () {
  var results = [];

  function check(name, ok, info) {
    results.push((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : ''));
  }

  // Синтетический «макет»: две длинные линии, одна под маской, и «текст».
  function makeImage(width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#222222';
    ctx.fillRect(40, 8, 2, height - 16);
    ctx.fillRect(150, 8, 2, height - 16);
    ctx.fillRect(10, 70, width - 20, 2);

    ctx.fillStyle = '#000000';
    for (var i = 0; i < 24; i += 1) {
      ctx.fillRect(100 + (i % 4) * 9, 20 + Math.floor(i / 4) * 7, 5, 3);
    }

    return ctx.getImageData(0, 0, width, height);
  }

  // Выровненные короткие рамки: похоже на чекбоксы или поля ввода.
  function makeAlignedBoxes(width, height, count) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    for (var i = 0; i < count; i += 1) {
      ctx.strokeRect(60, 20 + i * 34, 20, 20);
    }

    return ctx.getImageData(0, 0, width, height);
  }

  function hasLine(lines, expected, tolerance) {
    return lines.some(function (line) {
      return Math.abs(line.pos - expected) <= tolerance;
    });
  }

  try {
    var width = 240;
    var height = 120;
    var image = makeImage(width, height);

    check('детектор доступен', typeof ruleboxDetectLines === 'function');

    var plain = ruleboxDetectLines(image, width, height, { minCoverage: 0.2 });
    var vertical = plain.vertical;
    var horizontal = plain.horizontal;

    check('вертикальная линия найдена', hasLine(vertical, 41, 2),
      JSON.stringify(vertical.map(function (line) { return line.pos; })));
    check('вторая вертикальная линия найдена', hasLine(vertical, 151, 2),
      JSON.stringify(vertical.map(function (line) { return line.pos; })));
    check('горизонтальная линия найдена', hasLine(horizontal, 71, 2),
      JSON.stringify(horizontal.map(function (line) { return line.pos; })));
    check('текстовые штрихи не дают линий',
      !vertical.some(function (line) { return line.pos > 95 && line.pos < 135; }) &&
      !horizontal.some(function (line) { return line.pos > 15 && line.pos < 55; }),
      'v=' + JSON.stringify(vertical.map(function (line) { return line.pos; })) +
      ' h=' + JSON.stringify(horizontal.map(function (line) { return line.pos; })));

    var strong = vertical.filter(function (line) { return Math.abs(line.pos - 41) <= 2; })[0];
    check('покрытие линии высокое', strong && strong.coverage > 0.5,
      strong ? String(strong.coverage) : 'нет');

    var masked = ruleboxDetectLines(image, width, height, {
      minCoverage: 0.2,
      skip: [{ left: 140, top: 0, right: 165, bottom: height }]
    });
    check('маска исключает линию под рулбоксом', !hasLine(masked.vertical, 151, 2),
      JSON.stringify(masked.vertical.map(function (line) { return line.pos; })));
    check('маска не ломает остальные линии', hasLine(masked.vertical, 41, 2) && hasLine(masked.horizontal, 71, 2));

    var strict = ruleboxDetectLines(image, width, height, { minCoverage: 0.95 });
    check('высокий minCoverage отсекает всё', strict.vertical.length === 0 && strict.horizontal.length === 0,
      'v=' + strict.vertical.length + ' h=' + strict.horizontal.length);

    var noisy = ruleboxDetectLines(image, width, height, { minCoverage: 0.2, stepThreshold: 700 });
    check('высокий stepThreshold отсекает слабые границы',
      !hasLine(noisy.vertical, 41, 2) && !hasLine(noisy.horizontal, 71, 2),
      'v=' + noisy.vertical.length + ' h=' + noisy.horizontal.length);

    // «Пунктирные» линии: несколько выровненных коротких рамок.
    var aligned = ruleboxDetectLines(makeAlignedBoxes(240, 140, 3), 240, 140, {});
    var alignedLine = aligned.vertical.filter(function (line) {
      return Math.abs(line.pos - 61) <= 2;
    })[0];
    check('выровненные рамки дают вертикальную линию', Boolean(alignedLine),
      JSON.stringify(aligned.vertical.map(function (line) { return [line.pos, line.segments, line.support]; })));
    check('у линии несколько сегментов', alignedLine && alignedLine.segments >= 3,
      alignedLine ? String(alignedLine.segments) : 'нет');
    check('суммарная длина сегментов достаточная', alignedLine && alignedLine.support >= 40,
      alignedLine ? String(alignedLine.support) : 'нет');

    var twoBoxes = ruleboxDetectLines(makeAlignedBoxes(240, 140, 2), 240, 140, {});
    check('две выровненные рамки тоже дают линию',
      hasLine(twoBoxes.vertical, 61, 2),
      JSON.stringify(twoBoxes.vertical.map(function (line) { return line.pos; })));

    var singleBox = ruleboxDetectLines(makeAlignedBoxes(240, 140, 1), 240, 140, {});
    check('одиночная короткая рамка не даёт линии',
      !hasLine(singleBox.vertical, 61, 2) && !hasLine(singleBox.horizontal, 30, 2),
      JSON.stringify(singleBox.vertical.map(function (line) { return line.pos; })));

    document.getElementById('out').textContent = results.join('\n');
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
    document.getElementById('out').textContent = results.join('\n');
  }
})();
