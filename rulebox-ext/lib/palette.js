/**
 * Палитра расширения Rulebox.
 *
 * Порядок важен: после создания рулбокса автовыбор переключается на
 * соседний цвет, чтобы соседние рулбоксы визуально различались.
 *
 * Файл подключается и в попап (обычный script), и в service worker
 * (importScripts), поэтому объявления глобальные.
 */
var RULEBOX_PALETTE = [
  { id: 'blue', label: 'Синий', value: '#0000ff' },
  { id: 'red', label: 'Красный', value: '#ff0000' },
  { id: 'green', label: 'Зелёный', value: '#16a34a' },
  { id: 'purple', label: 'Фиолетовый', value: '#7c3aed' },
  { id: 'orange', label: 'Оранжевый', value: '#f97316' },
  { id: 'black', label: 'Чёрный', value: '#111827' },
  { id: 'cyan', label: 'Бирюзовый', value: '#0891b2' }
];

var RULEBOX_DEFAULT_COLOR = RULEBOX_PALETTE[0].value;

/**
 * Соседний цвет палитры (по кругу).
 * Произвольный цвет, которого нет в палитре, считается ручным выбором
 * и остаётся без изменений.
 */
function ruleboxNextColor(color) {
  var value = color === undefined || color === null ? '' : String(color).toLowerCase();
  if (!value) {
    return RULEBOX_DEFAULT_COLOR;
  }
  for (var i = 0; i < RULEBOX_PALETTE.length; i += 1) {
    if (RULEBOX_PALETTE[i].value === value) {
      return RULEBOX_PALETTE[(i + 1) % RULEBOX_PALETTE.length].value;
    }
  }
  return value;
}

/**
 * Приводит пустое значение к цвету по умолчанию, остальное — к нижнему
 * регистру (цвета палитры записаны в нижнем регистре).
 */
function ruleboxNormalizeColor(color) {
  var value = color === undefined || color === null ? '' : String(color).toLowerCase();
  return value || RULEBOX_DEFAULT_COLOR;
}
