// Computational "visual" audit: geometry + computed styles + hit-testing run
// inside the real window, reported as numbers/text so a text-only model can
// judge layout/rendering without looking at pixels and without a human.
//
// Model-independent by design: nothing here calls a vision model or opens an
// image. The screenshot pixel-diff lives in ./pixeldiff.js and also reports
// numeric metrics only.

// Page-side IIFE (executed via browser.execute). Scans interactive controls,
// flags elements that are hidden, off-screen, clipped, low-contrast, or
// covered by an unrelated element at their center (a click-stealing overlay).
const PAGE_AUDIT = `(function () {
  const vw = window.innerWidth, vh = window.innerHeight;
  const INTERACTIVE = 'button, input, select, textarea, a[href], [role="button"], [tabindex]:not([tabindex="-1"])';
  const toRgba = (str) => {
    try {
      const c = document.createElement("canvas");
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = str;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch (e) { return null; }
  };
  const effectiveBg = (el, depth) => {
    for (let i = 0, n = el; n && i < (depth || 5); i++, n = n.parentElement) {
      const cs = getComputedStyle(n);
      const bg = toRgba(cs.backgroundColor);
      if (bg && bg.a >= 0.5) return bg;
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
    }
    return null;
  };
  const lum = (r, g, b) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a, b) => {
    const l1 = lum(a.r, a.g, a.b), l2 = lum(b.r, b.g, b.b);
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  };
  const label = (el) => {
    const p = [];
    if (el.tagName) p.push(el.tagName.toLowerCase());
    if (el.id) p.push("#" + el.id);
    const cls = typeof el.className === "string" ? el.className.trim().split(/\\s+/).slice(0, 2).join(".") : "";
    if (cls) p.push("." + cls);
    const al = el.getAttribute && el.getAttribute("aria-label");
    if (al) p.push("[" + al.slice(0, 24) + "]");
    const t = (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 24);
    if (t) p.push('"' + t + '"');
    return p.join("") || el.tagName || "?";
  };
  const chainInfo = (el) => {
    const parts = [];
    for (let n = el.parentElement, i = 0; n && i < 5; n = n.parentElement, i++) {
      const cs = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      parts.push({
        el: n.tagName.toLowerCase() + (n.className && typeof n.className === "string" ? "." + n.className.trim().split(/\\s+/).slice(0, 2).join(".") : ""),
        inert: n.hasAttribute && n.hasAttribute("inert"),
        d: cs.display, v: cs.visibility, o: cs.opacity,
        t: cs.transform, s: cs.clipPath,
        rect: [+r.width.toFixed(0), +r.height.toFixed(0)],
      });
    }
    return parts;
  };
  // A control inside a non-rendered ancestor (display:none / visibility:hidden /
  // opacity 0 / inert) is inside an intentionally closed container (collapsed
  // settings section, closed overlay, inactive pane) -- expected, not a bug.
  const hiddenByAncestor = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") return true;
      if (parseFloat(cs.opacity) <= 0.01) return true;
      if (n.hasAttribute && n.hasAttribute("inert")) return true;
    }
    return false;
  };
  const out = { at: new Date().toISOString(), vw, vh, scanned: 0, skipped: 0, violations: [] };
  const els = Array.from(document.querySelectorAll(INTERACTIVE));
  const seen = new Set();
  for (const el of els) {
    if (seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const issues = [];
    const rendered = cs.display !== "none" && cs.visibility !== "hidden" &&
      parseFloat(cs.opacity) > 0.001 && r.width >= 1 && r.height >= 1;
    if (!rendered) {
      if (hiddenByAncestor(el)) { out.skipped++; } else {
        issues.push({ code: "HIDDEN", sev: "warn",
          msg: "control in DOM but not rendered",
          meta: { display: cs.display, visibility: cs.visibility, opacity: cs.opacity, w: +r.width.toFixed(1), h: +r.height.toFixed(1), chain: chainInfo(el) } });
      }
    } else {
      if (r.right < -8 || r.left > vw + 8) issues.push({ code: "OFFSCREEN_X", sev: "warn", msg: "control outside viewport horizontally" });
      if (r.bottom < -8) issues.push({ code: "OFFSCREEN_TOP", sev: "warn", msg: "control above viewport top" });
      if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) {
        const ov = cs.overflowX + "/" + cs.overflowY;
        if (!/visible/i.test(ov)) issues.push({ code: "TEXT_OVERFLOW", sev: "warn",
          msg: "content clipped",
          meta: { scrollW: el.scrollWidth, scrollH: el.scrollHeight, clientW: el.clientWidth, clientH: el.clientHeight, overflow: ov } });
      }
      const text = (el.textContent || "").trim();
      if (text) {
        const fg = toRgba(cs.color);
        const bg = effectiveBg(el);
        if (fg && fg.a > 0.1 && bg) {
          const ratio = contrast(fg, bg);
          if (ratio < 3.0) issues.push({ code: "LOW_CONTRAST", sev: "warn",
            msg: "text contrast " + ratio.toFixed(2) + " < 3.0",
            meta: { color: cs.color, bg: cs.backgroundColor } });
        }
      }
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      if (cx >= 0 && cx <= vw && cy >= 0 && cy <= vh) {
        const top = document.elementFromPoint(cx, cy);
        if (top && top !== el && !el.contains(top) && !top.contains(el)) {
          const inertDiff = !!el.closest("[inert]") !== !!top.closest("[inert]");
          const overlayDiff = !!top.closest(".screen-overlay") !== !!el.closest(".screen-overlay");
          if (!inertDiff && !overlayDiff) {
            issues.push({ code: "OVERLAPPED", sev: "error", msg: "covered at center by " + label(top) });
          }
        }
      }
    }
    if (issues.length) out.violations.push({ label: label(el), issues });
  }
  out.scanned = seen.size;
  return out;
})()`;

export async function auditPage(browser) {
  return browser.execute(PAGE_AUDIT);
}

// Three-way verdict so a text-only AI (or a human) decides only on the
// genuinely ambiguous bucket.
export function classify(report) {
  const errors = [];
  const warns = [];
  for (const v of report.violations || []) {
    for (const i of v.issues) {
      (i.sev === "error" ? errors : warns).push({ element: v.label, code: i.code, msg: i.msg, meta: i.meta });
    }
  }
  const verdict = errors.length ? "CLEAR_FAIL" : warns.length ? "AMBIGUOUS" : "CLEAR_PASS";
  return { verdict, errors, warns };
}

export function formatReport(report, title) {
  const lines = [
    `=== UI audit: ${title || ""} ===`,
    `viewport: ${report.vw}x${report.vh}, scanned: ${report.scanned}, skipped-in-closed: ${report.skipped || 0}, violations: ${(report.violations || []).length}`,
  ];
  for (const v of report.violations || []) {
    lines.push(`- ${v.label}`);
    for (const i of v.issues) {
      lines.push(`    [${i.sev}] ${i.code}: ${i.msg}${i.meta ? " " + JSON.stringify(i.meta) : ""}`);
    }
  }
  return lines.join("\n");
}

// Collects page errors without relying on the driver exposing browser logs.
export async function installConsoleCollector(browser) {
  await browser.execute(`(() => {
    window.__auditErrors = window.__auditErrors || [];
    if (!window.__auditErrHooked) {
      window.__auditErrHooked = true;
      window.addEventListener("error", (e) => window.__auditErrors.push("error: " + String(e.message || e.error)));
      window.addEventListener("unhandledrejection", (e) => window.__auditErrors.push("unhandledrejection: " + String((e && e.reason) || e)));
    }
  })()`);
}

export async function drainConsoleErrors(browser) {
  return browser.execute(`(() => { const a = window.__auditErrors || []; window.__auditErrors = []; return a; })()`);
}