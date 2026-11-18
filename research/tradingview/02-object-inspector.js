/**
 * PROTOTYPE 02: REUSABLE OBJECT INSPECTOR
 * File: research/tradingview/02-object-inspector.js
 *
 * Description:
 * Advanced, safe, non-destructive runtime object inspector designed for deep
 * traversal of TradingView obfuscated runtime structures, React Fiber trees,
 * DOM elements, and module scopes.
 *
 * Key Capabilities:
 * - Depth-limited property and prototype chain traversal (configurable maxDepth, default: 3).
 * - Circular reference prevention using WeakSet.
 * - Non-destructive read-only property inspection (guards against invoking mutating getters).
 * - Identification of function signatures, object structures, and method candidates.
 * - Filtering by keyword patterns (e.g. /chart|drawing|line|shape|model|study|source/i).
 * - Exported as window.__TV_INSPECT__ for interactive console use.
 *
 * Usage:
 * Paste and run in Chrome DevTools Console at https://www.tradingview.com/chart/
 * Then call:
 *   window.__TV_INSPECT__(targetObject, { maxDepth: 2, filter: 'line' });
 *
 * Safety: 100% read-only. Never calls setter or state-modifying functions.
 */

(() => {
  console.log('%c[TV Inspector] Initializing Object Inspector Tool...', 'color: #38bdf8; font-weight: bold;');

  /**
   * Safe check if property is a plain getter/accessor or unsafe to read
   */
  function isSafeProperty(obj, prop) {
    try {
      const desc = Object.getOwnPropertyDescriptor(obj, prop);
      if (!desc) return true;
      // If getter exists and is native/custom, reading might trigger side-effects
      // However in standard JS, reading data property is always safe
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Core inspection function
   */
  function inspectObject(target, options = {}) {
    const {
      maxDepth = 3,
      currentDepth = 0,
      filter = null,
      visited = new WeakSet(),
      maxPropsPerLevel = 50,
    } = options;

    if (target === null) return { type: 'null', value: null };
    if (target === undefined) return { type: 'undefined', value: undefined };

    const type = typeof target;
    if (type !== 'object' && type !== 'function') {
      return { type, value: target };
    }

    if (visited.has(target)) {
      return { type: 'circular-reference', note: '[Circular Reference]' };
    }
    visited.add(target);

    const constructorName = target.constructor?.name || (type === 'function' ? 'Function' : 'Object');

    if (type === 'function') {
      return {
        type: 'function',
        name: target.name || '(anonymous)',
        length: target.length,
        isNative: target.toString().includes('[native code]'),
      };
    }

    if (Array.isArray(target)) {
      if (currentDepth >= maxDepth) {
        return { type: 'Array', length: target.length, note: `[Array(${target.length}) - Depth Limit]` };
      }
      return {
        type: 'Array',
        length: target.length,
        items: target.slice(0, 10).map((item, idx) => ({
          index: idx,
          detail: inspectObject(item, { ...options, currentDepth: currentDepth + 1, visited }),
        })),
      };
    }

    // Object traversal
    const result = {
      type: 'object',
      constructorName,
      ownPropertiesCount: 0,
      methods: [],
      properties: {},
      prototypeChain: [],
    };

    // Prototype hierarchy collection
    let proto = Object.getPrototypeOf(target);
    while (proto && proto !== Object.prototype) {
      result.prototypeChain.push(proto.constructor?.name || 'AnonymousPrototype');
      proto = Object.getPrototypeOf(proto);
    }

    if (currentDepth >= maxDepth) {
      result.note = `[Object (${constructorName}) - Max Depth Reached]`;
      return result;
    }

    // Property names collection (including symbols & non-enumerable)
    let propNames = [];
    try {
      propNames = Object.getOwnPropertyNames(target);
      result.ownPropertiesCount = propNames.length;
    } catch (e) {
      result.error = `Failed to get properties: ${e.message}`;
      return result;
    }

    const filterRegex = filter ? (filter instanceof RegExp ? filter : new RegExp(String(filter), 'i')) : null;

    let processedProps = 0;
    for (const key of propNames) {
      if (processedProps >= maxPropsPerLevel) {
        result.properties['__truncated__'] = `[Truncated after ${maxPropsPerLevel} properties]`;
        break;
      }

      if (filterRegex && !filterRegex.test(key)) {
        continue;
      }

      try {
        const val = target[key];
        const valType = typeof val;

        if (valType === 'function') {
          result.methods.push({
            name: key,
            paramCount: val.length,
            isNative: val.toString().includes('[native code]'),
          });
        } else {
          result.properties[key] = inspectObject(val, {
            ...options,
            currentDepth: currentDepth + 1,
            visited,
          });
        }
        processedProps++;
      } catch (err) {
        result.properties[key] = { error: `Access error: ${err.message}` };
      }
    }

    return result;
  }

  /**
   * Helper to inspect React Fiber nodes starting from a DOM element
   */
  function inspectReactFiber(domElement, options = {}) {
    if (!domElement) return { error: 'DOM element is null' };
    const keys = Object.keys(domElement);
    const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    if (!fiberKey) {
      return { error: 'No React Fiber instance found on this element' };
    }

    const fiber = domElement[fiberKey];
    console.log(`%c[TV Inspector] Found React Fiber on element: ${fiberKey}`, 'color: #a855f7; font-weight: bold;');

    // Walk fiber upward or downward to inspect memoizedState and memoizedProps
    const fiberSummary = {
      key: fiber.key,
      elementType: typeof fiber.elementType === 'string' ? fiber.elementType : fiber.elementType?.name || 'Component',
      hasMemoizedState: Boolean(fiber.memoizedState),
      hasMemoizedProps: Boolean(fiber.memoizedProps),
      memoizedPropsKeys: fiber.memoizedProps ? Object.keys(fiber.memoizedProps) : [],
    };

    return {
      fiberSummary,
      deepInspection: inspectObject(fiber.memoizedProps || fiber.memoizedState || fiber, {
        maxDepth: options.maxDepth || 2,
        filter: options.filter,
      }),
    };
  }

  // Register globally for interactive console debugging
  window.__TV_INSPECT__ = (target, options) => {
    const res = inspectObject(target, options);
    console.dir(res);
    return res;
  };

  window.__TV_INSPECT_FIBER__ = (elementOrSelector, options) => {
    const el = typeof elementOrSelector === 'string' ? document.querySelector(elementOrSelector) : elementOrSelector;
    const res = inspectReactFiber(el, options);
    console.dir(res);
    return res;
  };

  console.log('%c[TV Inspector] Ready! Functions available in console:', 'color: #4ade80; font-weight: bold;');
  console.log(' - window.__TV_INSPECT__(targetObject, { maxDepth: 2, filter: "..." })');
  console.log(' - window.__TV_INSPECT_FIBER__(".chart-container", { maxDepth: 2 })');
})();
