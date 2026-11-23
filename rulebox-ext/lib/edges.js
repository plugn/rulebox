/**
 * Детектор контрастных линий для режима «магнит».
 *
 * Ищет в снимке вкладки длинные вертикальные и горизонтальные границы:
 * рамки макетов, панели, направляющие. Работает с ImageData, поэтому
 * подключается и в service worker (importScripts), и в тестовые страницы.
 *
 * Координаты результата — в пикселях снимка. Пересчёт в CSS-пиксели
 * делает вызывающий код: scale = imageWidth / documentElement.clientWidth.
 */

var RULEBOX_EDGE_DEFAULTS = {
  // Минимальная разница RGB между соседними пикселями (0..765).
  stepThreshold: 40,
  // Какую долю длины линии должен покрыть градиент.
  minCoverage: 0.25,
  // Кандидаты ближе mergeRadius пикселей считаются одной линией.
  mergeRadius: 2,
  // Ограничение на число линий (сильнейшие по покрытию).
  limit: 400,
  // Штрихи короче minRun не считаются сегментами: так отсекаются
  // пересечения горизонтальных линий и антиалиасинг.
  minRun: 8,
  // Гэп до maxGap пикселей внутри линии считается пересечением, а не
  // разрывом: сплошная рамка остаётся одним сегментом.
  maxGap: 2,
  // «Пунктирная» линия: несколько выровненных коротких границ (рамки
  // полей ввода, чекбоксы). Суммарная длина сегментов, их количество
  // и средняя длина.
  minSupport: 40,
  minSegments: 2,
  minAverageRun: 14
};

function ruleboxDetectLines(imageData, width, height, options) {
  var opts = mergeEdgeOptions(options);
  var data = imageData.data;
  var skip = buildSkipMask(width, height, opts.skip);

  var columns = createRunStats(width);
  var rows = createRunStats(height);

  for (var y = 0; y < height - 1; y += 1) {
    var rowOffset = y * width;

    for (var x = 0; x < width - 1; x += 1) {
      var columnIndex = x + 1;
      var rowIndex = y + 1;
      var i = (rowOffset + x) * 4;
      var right = i + 4;
      var down = i + width * 4;
      var valid = skip[rowOffset + x] === 0;

      var dxHit = false;
      var dyHit = false;

      if (valid) {
        columns.total[columnIndex] += 1;
        rows.total[rowIndex] += 1;

        var dx = Math.abs(data[i] - data[right]) +
          Math.abs(data[i + 1] - data[right + 1]) +
          Math.abs(data[i + 2] - data[right + 2]);
        dxHit = dx >= opts.stepThreshold;

        var dy = Math.abs(data[i] - data[down]) +
          Math.abs(data[i + 1] - data[down + 1]) +
          Math.abs(data[i + 2] - data[down + 2]);
        dyHit = dy >= opts.stepThreshold;
      }

      updateRun(columns, columnIndex, valid && dxHit, opts);
      updateRun(rows, rowIndex, valid && dyHit, opts);
    }
  }

  finalizeRuns(columns, opts);
  finalizeRuns(rows, opts);

  return {
    vertical: pickEdgeLines(columns, opts),
    horizontal: pickEdgeLines(rows, opts)
  };
}

function createRunStats(size) {
  return {
    total: new Float64Array(size),
    current: new Float64Array(size),
    gap: new Float64Array(size),
    support: new Float64Array(size),
    segments: new Float64Array(size),
    runSum: new Float64Array(size)
  };
}

function updateRun(stats, index, hit, opts) {
  if (hit) {
    if (stats.gap[index] > opts.maxGap) {
      finalizeRun(stats, index, opts);
    }
    stats.gap[index] = 0;
    stats.current[index] += 1;
    return;
  }

  if (stats.current[index] > 0) {
    stats.gap[index] += 1;
    if (stats.gap[index] > opts.maxGap) {
      finalizeRun(stats, index, opts);
    }
  }
}

function finalizeRun(stats, index, opts) {
  var length = stats.current[index];
  if (length === 0) {
    return;
  }

  stats.current[index] = 0;
  stats.gap[index] = 0;
  if (length >= opts.minRun) {
    stats.support[index] += length;
    stats.segments[index] += 1;
    stats.runSum[index] += length;
  }
}

function finalizeRuns(stats, opts) {
  for (var i = 0; i < stats.current.length; i += 1) {
    finalizeRun(stats, i, opts);
  }
}

function mergeEdgeOptions(options) {
  var result = {
    stepThreshold: RULEBOX_EDGE_DEFAULTS.stepThreshold,
    minCoverage: RULEBOX_EDGE_DEFAULTS.minCoverage,
    mergeRadius: RULEBOX_EDGE_DEFAULTS.mergeRadius,
    limit: RULEBOX_EDGE_DEFAULTS.limit,
    minRun: RULEBOX_EDGE_DEFAULTS.minRun,
    maxGap: RULEBOX_EDGE_DEFAULTS.maxGap,
    minSupport: RULEBOX_EDGE_DEFAULTS.minSupport,
    minSegments: RULEBOX_EDGE_DEFAULTS.minSegments,
    minAverageRun: RULEBOX_EDGE_DEFAULTS.minAverageRun,
    skip: []
  };

  if (options) {
    ['stepThreshold', 'minCoverage', 'mergeRadius', 'limit', 'minRun', 'maxGap',
      'minSupport', 'minSegments', 'minAverageRun'].forEach(function (key) {
      if (typeof options[key] === 'number') {
        result[key] = options[key];
      }
    });
    if (Array.isArray(options.skip)) {
      result.skip = options.skip;
    }
  }

  return result;
}

/** Маска исключённых областей (например, наших рулбоксов) в пикселях снимка. */
function buildSkipMask(width, height, rects) {
  var mask = new Uint8Array(width * height);

  for (var i = 0; i < rects.length; i += 1) {
    var rect = rects[i];
    var left = Math.max(0, Math.floor(rect.left));
    var top = Math.max(0, Math.floor(rect.top));
    var right = Math.min(width, Math.ceil(rect.right));
    var bottom = Math.min(height, Math.ceil(rect.bottom));

    for (var y = top; y < bottom; y += 1) {
      var offset = y * width;
      for (var x = left; x < right; x += 1) {
        mask[offset + x] = 1;
      }
    }
  }

  return mask;
}

/**
 * Метрики кандидата. Линия принимается, если она либо покрывает
 * заметную долю длины (сплошная рамка), либо собрана из нескольких
 * выровненных коротких границ (рамки полей, чекбоксы).
 */
function lineMetrics(stats, index, opts) {
  var total = stats.total[index];
  if (!total) {
    return null;
  }

  var support = stats.support[index];
  var segments = stats.segments[index];
  var coverage = support / total;
  var averageRun = segments ? stats.runSum[index] / segments : 0;

  var solid = coverage >= opts.minCoverage;
  var aligned = segments >= opts.minSegments &&
    support >= opts.minSupport &&
    averageRun >= opts.minAverageRun;

  if (!solid && !aligned) {
    return null;
  }

  return {
    pos: index,
    coverage: Number(coverage.toFixed(3)),
    support: Math.round(support),
    segments: segments,
    averageRun: Number(averageRun.toFixed(1))
  };
}

function pickEdgeLines(stats, opts) {
  var lines = [];
  var index = 0;

  while (index < stats.total.length) {
    var first = lineMetrics(stats, index, opts);
    if (!first) {
      index += 1;
      continue;
    }

    var best = first;
    var next = index + 1;

    while (next < stats.total.length && next - index <= opts.mergeRadius) {
      var candidate = lineMetrics(stats, next, opts);
      if (!candidate) {
        break;
      }
      if (candidate.coverage > best.coverage ||
        (candidate.coverage === best.coverage && candidate.support > best.support)) {
        best = candidate;
      }
      next += 1;
    }

    lines.push(best);
    index = next;
  }

  if (lines.length > opts.limit) {
    lines.sort(function (a, b) {
      return b.coverage - a.coverage;
    });
    lines = lines.slice(0, opts.limit);
    lines.sort(function (a, b) {
      return a.pos - b.pos;
    });
  }

  return lines;
}
