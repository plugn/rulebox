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
    check('items is empty array', Array.isArray(rulebox._items) && rulebox._items.length === 0);
    check('list returns _items', rulebox.list() === rulebox._items);

    var box = rulebox.create();
    var resizer = box.firstElementChild;
    var r = rect(box);
    var cs = getComputedStyle(box);
    var c = center(box);
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;

    check('create returns attached element', box.nodeType === 1 && box.parentNode === document.body);
    check('items contains box', rulebox._items.length === 1 && rulebox._items[0] === box);
    check('size 200x50', Math.abs(r.width - 200) < 0.5 && Math.abs(r.height - 50) < 0.5,
      r.width + 'x' + r.height);
    check('position absolute', cs.position === 'absolute', cs.position);
    check('z-index 90000', cs.zIndex === '90000', cs.zIndex);
    check('1px blue border', cs.borderTopWidth === '1px' && cs.borderTopColor === 'rgb(0, 0, 255)',
      cs.borderTopWidth + ' ' + cs.borderTopColor);
    check('cursor move', cs.cursor === 'move', cs.cursor);
    check('centered in viewport',
      Math.abs(c.x - vw / 2) < 1 && Math.abs(c.y - vh / 2) < 1,
      c.x + ',' + c.y + ' vs ' + vw / 2 + ',' + vh / 2);
    check('resizer hidden initially', getComputedStyle(resizer).display === 'none');
    check('resizer cursor nwse-resize', resizer.style.cursor === 'nwse-resize', resizer.style.cursor);

    mouse('mouseenter', box);
    check('hover fill', getComputedStyle(box).backgroundColor === 'rgba(0, 0, 255, 0.5)',
      getComputedStyle(box).backgroundColor);
    mouse('mouseleave', box);
    check('mouseleave clears fill', getComputedStyle(box).backgroundColor === 'rgba(0, 0, 0, 0)',
      getComputedStyle(box).backgroundColor);
    mouse('click', box, c.x, c.y);
    var rr = rect(resizer);
    var rrc = center(resizer);
    check('click activates fill', getComputedStyle(box).backgroundColor === 'rgba(0, 0, 255, 0.5)',
      getComputedStyle(box).backgroundColor);
    check('resizer visible after click', getComputedStyle(resizer).display === 'block');
    check('resizer 30x30', Math.abs(rr.width - 30) < 0.5 && Math.abs(rr.height - 30) < 0.5,
      rr.width + 'x' + rr.height);
    check('resizer center on corner',
      Math.abs(rrc.x - rect(box).right) < 0.6 && Math.abs(rrc.y - rect(box).bottom) < 0.6,
      rrc.x + ',' + rrc.y + ' vs ' + rect(box).right + ',' + rect(box).bottom);

    var beforeDrag = rect(box);
    var targetX = 300;
    var targetY = 250;
    mouse('mousedown', box, beforeDrag.left + 10, beforeDrag.top + 10);
    mouse('mousemove', document.body, targetX, targetY);
    mouse('mouseup', document.body, targetX, targetY);
    var draggedCenter = center(box);
    check('drag puts center at mouse',
      Math.abs(draggedCenter.x - targetX) < 1 && Math.abs(draggedCenter.y - targetY) < 1,
      draggedCenter.x + ',' + draggedCenter.y + ' vs ' + targetX + ',' + targetY);

    var beforeResize = rect(box);
    var newRight = beforeResize.left + 320;
    var newBottom = beforeResize.top + 180;
    mouse('mousedown', resizer, beforeResize.right, beforeResize.bottom);
    mouse('mousemove', document.body, newRight, newBottom);
    mouse('mouseup', document.body, newRight, newBottom);
    var afterResize = rect(box);
    var resizerCenter = center(resizer);
    check('resize width', Math.abs(afterResize.width - 320) < 1, String(afterResize.width));
    check('resize height', Math.abs(afterResize.height - 180) < 1, String(afterResize.height));
    check('resize keeps top-left',
      Math.abs(afterResize.left - beforeResize.left) < 0.5 &&
      Math.abs(afterResize.top - beforeResize.top) < 0.5,
      afterResize.left + ',' + afterResize.top);
    check('resizer stays on new corner',
      Math.abs(resizerCenter.x - afterResize.right) < 1 &&
      Math.abs(resizerCenter.y - afterResize.bottom) < 1,
      resizerCenter.x + ',' + resizerCenter.y + ' vs ' + afterResize.right + ',' + afterResize.bottom);

    var beforeMin = rect(box);
    mouse('mousedown', resizer, beforeMin.right, beforeMin.bottom);
    mouse('mousemove', document.body, beforeMin.left - 50, beforeMin.top - 50);
    mouse('mouseup', document.body, beforeMin.left - 50, beforeMin.top - 50);
    var minRect = rect(box);
    check('minimum size 20x20',
      Math.abs(minRect.width - 20) < 0.5 && Math.abs(minRect.height - 20) < 0.5,
      minRect.width + 'x' + minRect.height);

    var box2 = rulebox.create();
    var box2Center = center(box2);
    mouse('click', box2, box2Center.x, box2Center.y);
    check('second box activates', getComputedStyle(box2.firstElementChild).display === 'block');
    mouse('click', document.body, 5, 5);
    check('outside click deactivates all',
      getComputedStyle(box).backgroundColor === 'rgba(0, 0, 0, 0)' &&
      getComputedStyle(box2).backgroundColor === 'rgba(0, 0, 0, 0)' &&
      getComputedStyle(box.firstElementChild).display === 'none' &&
      getComputedStyle(box2.firstElementChild).display === 'none');
    check('two items tracked', rulebox._items.length === 2);

    var removed = rulebox.remove(1);
    check('remove returns element', removed === box2);
    check('remove detaches from DOM', !document.body.contains(box2));
    check('remove splices array', rulebox._items.length === 1 && rulebox._items[0] === box);
    check('remove invalid is no-op', rulebox.remove(5) === null && rulebox._items.length === 1);

    rulebox.remove(0);
    check('remove last item', rulebox._items.length === 0 && !document.body.contains(box));

    var box3 = rulebox.create();
    var box3Center = center(box3);
    mouse('click', box3, box3Center.x, box3Center.y);
    mouse('mousedown', box3, box3Center.x, box3Center.y);
    mouse('mouseup', document.body, box3Center.x, box3Center.y);
    var box3After = center(box3);
    check('mousedown+mouseup without move does not jump',
      Math.abs(box3After.x - box3Center.x) < 0.5 && Math.abs(box3After.y - box3Center.y) < 0.5,
      box3After.x + ',' + box3After.y + ' vs ' + box3Center.x + ',' + box3Center.y);
    rulebox.remove(0);
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
  }

  document.getElementById('out').textContent = results.join('\n');
})();

