/**
 * TARGETED TRADINGVIEW PROBE 08: FLOATING TOOLBAR, AXIS LABELS & FIBER DISCOVERY
 * File: research/tradingview/08-tv-floating-toolbar-probe.js
 */

(function () {
  console.clear();
  console.log('%c🔍 [Stock Chart Extractor] TRADINGVIEW DEEP LIVE PROBE', 'background: #2563eb; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 14px;');

  const result = {
    // 1. Elements containing the active drawing's price badges on the axis
    priceAxisBadges: [] as any[],
    timeAxisBadges: [] as any[],

    // 2. Elements containing "2px" (the floating toolbar line thickness)
    thicknessButtons: [] as any[],

    // 3. Floating Toolbar exact elements & structure
    floatingToolbars: [] as any[],

    // 4. Candidate tools found in React Fiber of matched elements
    fiberDrawingCandidates: [] as any[],
  };

  // 1. Search for any leaf DOM elements with price-like numbers (e.g. 3,161 or 2,701)
  const allElements = Array.from(document.querySelectorAll('body *'));
  allElements.forEach((el) => {
    if (el.children.length === 0 && el.textContent) {
      const text = el.textContent.trim();
      // Match price pattern like 3,161.70 or 3021.60
      if (/^[0-9]{1,3}(,[0-9]{3})*(\.[0-9]{1,4})?$/.test(text) && parseFloat(text.replace(/,/g, '')) > 100) {
        // Check if element or parent has axis-related class or style
        const parent = el.parentElement;
        const classStr = `${el.className} ${parent?.className || ''}`;
        if (/axis|price|badge|label|pane|value|widget|chart/i.test(classStr) || (el as HTMLElement).style.backgroundColor) {
          result.priceAxisBadges.push({
            text,
            tag: el.tagName,
            className: el.className,
            parentClass: parent?.className,
            style: (el as HTMLElement).getAttribute('style'),
          });
        }
      }

      // Match date pattern like "17 Sep" or "09 Oct"
      if (/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(text) && /[0-9]/.test(text)) {
        result.timeAxisBadges.push({
          text,
          tag: el.tagName,
          className: el.className,
          parentClass: el.parentElement?.className,
        });
      }

      // Match "2px" or "1px" or "3px" (line thickness button)
      if (/^[1-4]px$/i.test(text)) {
        result.thicknessButtons.push({
          text,
          tag: el.tagName,
          className: el.className,
          parentClass: el.parentElement?.className,
          grandParentClass: el.parentElement?.parentElement?.className,
        });
      }
    }
  });

  // 2. Inspect Floating Toolbars
  document.querySelectorAll('[class*="floating-toolbar"], [class*="tv-floating-toolbar"]').forEach((ft) => {
    const childrenDesc: any[] = [];
    ft.querySelectorAll('*').forEach((c) => {
      const txt = c.textContent?.trim();
      const dn = c.getAttribute('data-name');
      const aria = c.getAttribute('aria-label');
      if (dn || aria || (txt && txt.length < 15)) {
        childrenDesc.push({
          tag: c.tagName,
          className: c.className,
          dataName: dn,
          ariaLabel: aria,
          text: txt || null,
        });
      }
    });

    result.floatingToolbars.push({
      className: ft.className,
      style: (ft as HTMLElement).getAttribute('style'),
      childCount: ft.children.length,
      sampleInteractiveChildren: childrenDesc.slice(0, 15),
    });

    // Check React Fiber on floating toolbar and its children
    const checkFiber = (node: any) => {
      const fKey = Object.keys(node).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      if (!fKey) return;
      let curr = node[fKey];
      let depth = 0;
      while (curr && depth < 20) {
        depth++;
        const p = curr.memoizedProps;
        if (p && typeof p === 'object') {
          for (const k of Object.keys(p)) {
            const v = p[k];
            if (v && typeof v === 'object') {
              if (v.points || v.properties || v.state || v.id || v.priceAxisPoints || v.tool || v.source) {
                result.fiberDrawingCandidates.push({
                  propName: k,
                  depth,
                  keys: Object.keys(v).slice(0, 15),
                  id: v.id || v._id,
                  name: v.name || v.type,
                  hasPoints: Boolean(v.points),
                });
              }
            }
          }
        }
        curr = curr.return;
      }
    };

    checkFiber(ft);
    ft.querySelectorAll('*').forEach((c) => checkFiber(c));
  });

  console.log('%c📊 KẾT QUẢ KHẢO SÁT CHUYÊN SÂU:', 'color: #38bdf8; font-weight: bold;');
  console.dir(result);
  console.log('%c👉 HÃY COPY TOÀN BỘ JSON DƯỚI ĐÂY GỬI CHO TÔI:', 'color: #4ade80; font-weight: bold;');
  console.log(JSON.stringify(result, null, 2));

  return result;
})();
