var pt = typeof process == "object" && process + "" == "[object process]" && !process.versions.nw && !(process.versions.electron && process.type && process.type !== "browser"), Tt = [
  1 / 0,
  1 / 0,
  -1 / 0,
  -1 / 0
], Ht = new Float32Array(Tt), Ze = [
  1e-3,
  0,
  0,
  1e-3,
  0,
  0
], lt = "http://www.w3.org/2000/svg", ft = {
  ANY: 1,
  DISPLAY: 2,
  PRINT: 4,
  SAVE: 8,
  ANNOTATIONS_FORMS: 16,
  ANNOTATIONS_STORAGE: 32,
  ANNOTATIONS_DISABLE: 64,
  IS_EDITING: 128,
  OPLIST: 256
}, It = {
  DISABLE: 0,
  ENABLE: 1,
  ENABLE_FORMS: 2,
  ENABLE_STORAGE: 3
}, qt = "pdfjs_internal_id_", Qt = "pdfjs_internal_editor_", O = {
  DISABLE: -1,
  NONE: 0,
  FREETEXT: 3,
  HIGHLIGHT: 9,
  STAMP: 13,
  INK: 15,
  POPUP: 16,
  SIGNATURE: 101,
  COMMENT: 102
}, N = {
  RESIZE: 1,
  CREATE: 2,
  FREETEXT_SIZE: 11,
  FREETEXT_COLOR: 12,
  FREETEXT_OPACITY: 13,
  INK_COLOR: 21,
  INK_THICKNESS: 22,
  INK_OPACITY: 23,
  INK_COLOR_AND_OPACITY: 24,
  HIGHLIGHT_COLOR: 31,
  HIGHLIGHT_THICKNESS: 32,
  HIGHLIGHT_FREE: 33,
  HIGHLIGHT_SHOW_ALL: 34,
  DRAW_STEP: 41
}, An = {
  PRINT: 4,
  MODIFY_CONTENTS: 8,
  COPY: 16,
  MODIFY_ANNOTATIONS: 32,
  FILL_INTERACTIVE_FORMS: 256,
  COPY_FOR_ACCESSIBILITY: 512,
  ASSEMBLE: 1024,
  PRINT_HIGH_QUALITY: 2048
}, tt = {
  FILL: 0,
  STROKE: 1,
  FILL_STROKE: 2,
  INVISIBLE: 3,
  FILL_ADD_TO_PATH: 4,
  STROKE_ADD_TO_PATH: 5,
  FILL_STROKE_ADD_TO_PATH: 6,
  ADD_TO_PATH: 7,
  FILL_STROKE_MASK: 3,
  ADD_TO_PATH_FLAG: 4
}, Ee = {
  GRAYSCALE_1BPP: 1,
  RGB_24BPP: 2,
  RGBA_32BPP: 3
}, q = {
  TEXT: 1,
  LINK: 2,
  FREETEXT: 3,
  LINE: 4,
  SQUARE: 5,
  CIRCLE: 6,
  POLYGON: 7,
  POLYLINE: 8,
  HIGHLIGHT: 9,
  UNDERLINE: 10,
  SQUIGGLY: 11,
  STRIKEOUT: 12,
  STAMP: 13,
  CARET: 14,
  INK: 15,
  POPUP: 16,
  FILEATTACHMENT: 17,
  SOUND: 18,
  MOVIE: 19,
  WIDGET: 20,
  SCREEN: 21,
  PRINTERMARK: 22,
  TRAPNET: 23,
  WATERMARK: 24,
  THREED: 25,
  REDACT: 26,
  RICHMEDIA: 27
}, Xt = {
  SOLID: 1,
  DASHED: 2,
  BEVELED: 3,
  INSET: 4,
  UNDERLINE: 5
}, Me = {
  ERRORS: 0,
  WARNINGS: 1,
  INFOS: 5
}, Et = {
  dependency: 1,
  setLineWidth: 2,
  setLineCap: 3,
  setLineJoin: 4,
  setMiterLimit: 5,
  setDash: 6,
  setRenderingIntent: 7,
  setFlatness: 8,
  setGState: 9,
  save: 10,
  restore: 11,
  transform: 12,
  moveTo: 13,
  lineTo: 14,
  curveTo: 15,
  curveTo2: 16,
  curveTo3: 17,
  closePath: 18,
  rectangle: 19,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closeFillStroke: 26,
  closeEOFillStroke: 27,
  endPath: 28,
  clip: 29,
  eoClip: 30,
  beginText: 31,
  endText: 32,
  setCharSpacing: 33,
  setWordSpacing: 34,
  setHScale: 35,
  setLeading: 36,
  setFont: 37,
  setTextRenderingMode: 38,
  setTextRise: 39,
  moveText: 40,
  setLeadingMoveText: 41,
  setTextMatrix: 42,
  nextLine: 43,
  showText: 44,
  showSpacedText: 45,
  nextLineShowText: 46,
  nextLineSetSpacingShowText: 47,
  setCharWidth: 48,
  setCharWidthAndBounds: 49,
  setStrokeColorSpace: 50,
  setFillColorSpace: 51,
  setStrokeColor: 52,
  setStrokeColorN: 53,
  setFillColor: 54,
  setFillColorN: 55,
  setStrokeGray: 56,
  setFillGray: 57,
  setStrokeRGBColor: 58,
  setFillRGBColor: 59,
  setStrokeCMYKColor: 60,
  setFillCMYKColor: 61,
  shadingFill: 62,
  beginInlineImage: 63,
  beginImageData: 64,
  endInlineImage: 65,
  paintXObject: 66,
  markPoint: 67,
  markPointProps: 68,
  beginMarkedContent: 69,
  beginMarkedContentProps: 70,
  endMarkedContent: 71,
  beginCompat: 72,
  endCompat: 73,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  beginGroup: 76,
  endGroup: 77,
  beginAnnotation: 80,
  endAnnotation: 81,
  paintImageMaskXObject: 83,
  paintImageMaskXObjectGroup: 84,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
  paintInlineImageXObjectGroup: 87,
  paintImageXObjectRepeat: 88,
  paintImageMaskXObjectRepeat: 89,
  paintSolidColorImageMask: 90,
  constructPath: 91,
  setStrokeTransparent: 92,
  setFillTransparent: 93,
  rawFillPath: 94
}, te = {
  moveTo: 0,
  lineTo: 1,
  curveTo: 2,
  quadraticCurveTo: 3,
  closePath: 4
}, vn = {
  NEED_PASSWORD: 1,
  INCORRECT_PASSWORD: 2
}, De = Me.WARNINGS;
function wn(s) {
  Number.isInteger(s) && (De = s);
}
function Sn() {
  return De;
}
function Ie(s) {
  De >= Me.INFOS && console.info(`Info: ${s}`);
}
function R(s) {
  De >= Me.WARNINGS && console.warn(`Warning: ${s}`);
}
function U(s) {
  throw new Error(s);
}
function Q(s, t) {
  s || U(t);
}
function En(s) {
  switch (s?.protocol) {
    case "http:":
    case "https:":
    case "ftp:":
    case "mailto:":
    case "tel:":
      return !0;
    default:
      return !1;
  }
}
function bi(s, t = null, e = null) {
  if (!s) return null;
  if (e && typeof s == "string" && (e.addDefaultProtocol && s.startsWith("www.") && s.match(/\./g)?.length >= 2 && (s = `http://${s}`), e.tryConvertEncoding))
    try {
      s = xn(s);
    } catch {
    }
  const i = t ? URL.parse(s, t) : URL.parse(s);
  return En(i) ? i : null;
}
function yi(s, t, e = !1) {
  const i = URL.parse(s);
  return i ? (i.hash = t, i.href) : e && bi(s, "http://example.com") ? s.split("#", 1)[0] + `${t ? `#${t}` : ""}` : "";
}
function ts(s) {
  return s.substring(s.lastIndexOf("/") + 1);
}
function P(s, t, e, i = !1) {
  return Object.defineProperty(s, t, {
    value: e,
    enumerable: !i,
    configurable: !0,
    writable: !1
  }), e;
}
var $t = (function() {
  function t(e, i) {
    this.message = e, this.name = i;
  }
  return t.prototype = /* @__PURE__ */ new Error(), t.constructor = t, t;
})(), es = class extends $t {
  constructor(s, t) {
    super(s, "PasswordException"), this.code = t;
  }
}, Ve = class extends $t {
  constructor(s, t) {
    super(s, "UnknownErrorException"), this.details = t;
  }
}, ss = class extends $t {
  constructor(s) {
    super(s, "InvalidPDFException");
  }
}, Te = class extends $t {
  constructor(s, t, e) {
    super(s, "ResponseException"), this.status = t, this.missing = e;
  }
}, _n = class extends $t {
  constructor(s) {
    super(s, "FormatError");
  }
}, Lt = class extends $t {
  constructor(s) {
    super(s, "AbortException");
  }
};
function Cn(s) {
  (typeof s != "object" || s?.length === void 0) && U("Invalid argument for bytesToString");
  const t = s.length, e = 8192;
  if (t < e) return String.fromCharCode.apply(null, s);
  const i = [];
  for (let n = 0; n < t; n += e) {
    const r = Math.min(n + e, t), a = s.subarray(n, r);
    i.push(String.fromCharCode.apply(null, a));
  }
  return i.join("");
}
function Le(s) {
  typeof s != "string" && U("Invalid argument for stringToBytes");
  const t = s.length, e = new Uint8Array(t);
  for (let i = 0; i < t; ++i) e[i] = s.charCodeAt(i) & 255;
  return e;
}
var z = class {
  static get isLittleEndian() {
    const s = /* @__PURE__ */ new Uint8Array(4);
    s[0] = 1;
    const t = new Uint32Array(s.buffer, 0, 1);
    return P(this, "isLittleEndian", t[0] === 1);
  }
  static get isOffscreenCanvasSupported() {
    return P(this, "isOffscreenCanvasSupported", typeof OffscreenCanvas < "u");
  }
  static get isImageDecoderSupported() {
    return P(this, "isImageDecoderSupported", typeof ImageDecoder < "u");
  }
  static get isFloat16ArraySupported() {
    return P(this, "isFloat16ArraySupported", typeof Float16Array < "u");
  }
  static get isSanitizerSupported() {
    return P(this, "isSanitizerSupported", typeof Sanitizer < "u");
  }
  static get platform() {
    const { platform: s, userAgent: t } = navigator;
    return P(this, "platform", {
      isAndroid: t.includes("Android"),
      isLinux: s.includes("Linux"),
      isMac: s.includes("Mac"),
      isWindows: s.includes("Win"),
      isFirefox: t.includes("Firefox")
    });
  }
  static get isCanvasFilterSupported() {
    let s;
    return this.isOffscreenCanvasSupported ? s = new OffscreenCanvas(1, 1).getContext("2d") : typeof document < "u" && (s = document.createElement("canvas").getContext("2d")), P(this, "isCanvasFilterSupported", s?.filter !== void 0);
  }
  static get isAlphaColorInputSupported() {
    if (typeof document > "u") return P(this, "isAlphaColorInputSupported", !1);
    const s = document.createElement("input");
    return s.type = "color", s.setAttribute("alpha", ""), s.value = "#ff000080", P(this, "isAlphaColorInputSupported", s.value !== "#ff0000");
  }
  static get isBackdropFilterSupported() {
    return P(this, "isBackdropFilterSupported", typeof CSS < "u" && CSS.supports("backdrop-filter", "blur(1px)"));
  }
}, _ = class {
  static get hexNums() {
    return P(this, "hexNums", Array.from({ length: 256 }, (s, t) => t.toString(16).padStart(2, "0")));
  }
  static makeHexColor(s, t, e) {
    return `#${this.hexNums[s]}${this.hexNums[t]}${this.hexNums[e]}`;
  }
  static transform(s, t) {
    return [
      s[0] * t[0] + s[2] * t[1],
      s[1] * t[0] + s[3] * t[1],
      s[0] * t[2] + s[2] * t[3],
      s[1] * t[2] + s[3] * t[3],
      s[0] * t[4] + s[2] * t[5] + s[4],
      s[1] * t[4] + s[3] * t[5] + s[5]
    ];
  }
  static multiplyByDOMMatrix(s, t) {
    return [
      s[0] * t.a + s[2] * t.b,
      s[1] * t.a + s[3] * t.b,
      s[0] * t.c + s[2] * t.d,
      s[1] * t.c + s[3] * t.d,
      s[0] * t.e + s[2] * t.f + s[4],
      s[1] * t.e + s[3] * t.f + s[5]
    ];
  }
  static applyTransform(s, t, e = 0) {
    const i = s[e], n = s[e + 1];
    s[e] = i * t[0] + n * t[2] + t[4], s[e + 1] = i * t[1] + n * t[3] + t[5];
  }
  static applyTransformToBezier(s, t, e = 0) {
    const i = t[0], n = t[1], r = t[2], a = t[3], o = t[4], l = t[5];
    for (let h = 0; h < 6; h += 2) {
      const c = s[e + h], d = s[e + h + 1];
      s[e + h] = c * i + d * r + o, s[e + h + 1] = c * n + d * a + l;
    }
  }
  static applyInverseTransform(s, t) {
    const e = s[0], i = s[1], n = t[0] * t[3] - t[1] * t[2];
    s[0] = (e * t[3] - i * t[2] + t[2] * t[5] - t[4] * t[3]) / n, s[1] = (-e * t[1] + i * t[0] + t[4] * t[1] - t[5] * t[0]) / n;
  }
  static axialAlignedBoundingBox(s, t, e) {
    const i = t[0], n = t[1], r = t[2], a = t[3], o = t[4], l = t[5], h = s[0], c = s[1], d = s[2], u = s[3];
    let p = i * h + o, f = p, m = i * d + o, g = m, b = a * c + l, y = b, A = a * u + l, w = A;
    if (n !== 0 || r !== 0) {
      const v = n * h, S = n * d, E = r * c, C = r * u;
      p += E, g += E, m += C, f += C, b += v, w += v, A += S, y += S;
    }
    e[0] = Math.min(e[0], p, m, f, g), e[1] = Math.min(e[1], b, A, y, w), e[2] = Math.max(e[2], p, m, f, g), e[3] = Math.max(e[3], b, A, y, w);
  }
  static inverseTransform(s) {
    const t = s[0] * s[3] - s[1] * s[2];
    return [
      s[3] / t,
      -s[1] / t,
      -s[2] / t,
      s[0] / t,
      (s[2] * s[5] - s[4] * s[3]) / t,
      (s[4] * s[1] - s[5] * s[0]) / t
    ];
  }
  static singularValueDecompose2dScale(s, t) {
    const e = s[0], i = s[1], n = s[2], r = s[3], a = e ** 2 + i ** 2, o = e * n + i * r, l = n ** 2 + r ** 2, h = (a + l) / 2, c = Math.sqrt(h ** 2 - (a * l - o ** 2));
    t[0] = Math.sqrt(h + c || 1), t[1] = Math.sqrt(h - c || 1);
  }
  static normalizeRect(s) {
    const t = s.slice(0);
    return s[0] > s[2] && (t[0] = s[2], t[2] = s[0]), s[1] > s[3] && (t[1] = s[3], t[3] = s[1]), t;
  }
  static intersect(s, t) {
    const e = Math.max(Math.min(s[0], s[2]), Math.min(t[0], t[2])), i = Math.min(Math.max(s[0], s[2]), Math.max(t[0], t[2]));
    if (e > i) return null;
    const n = Math.max(Math.min(s[1], s[3]), Math.min(t[1], t[3])), r = Math.min(Math.max(s[1], s[3]), Math.max(t[1], t[3]));
    return n > r ? null : [
      e,
      n,
      i,
      r
    ];
  }
  static pointBoundingBox(s, t, e) {
    e[0] = Math.min(e[0], s), e[1] = Math.min(e[1], t), e[2] = Math.max(e[2], s), e[3] = Math.max(e[3], t);
  }
  static rectBoundingBox(s, t, e, i, n) {
    n[0] = Math.min(n[0], s, e), n[1] = Math.min(n[1], t, i), n[2] = Math.max(n[2], s, e), n[3] = Math.max(n[3], t, i);
  }
  static #t(s, t, e, i, n, r, a, o, l, h) {
    if (l <= 0 || l >= 1) return;
    const c = 1 - l, d = l * l, u = d * l, p = c * (c * (c * s + 3 * l * t) + 3 * d * e) + u * i, f = c * (c * (c * n + 3 * l * r) + 3 * d * a) + u * o;
    h[0] = Math.min(h[0], p), h[1] = Math.min(h[1], f), h[2] = Math.max(h[2], p), h[3] = Math.max(h[3], f);
  }
  static #e(s, t, e, i, n, r, a, o, l, h, c, d) {
    if (Math.abs(l) < 1e-12) {
      Math.abs(h) >= 1e-12 && this.#t(s, t, e, i, n, r, a, o, -c / h, d);
      return;
    }
    const u = h ** 2 - 4 * c * l;
    if (u < 0) return;
    const p = Math.sqrt(u), f = 2 * l;
    this.#t(s, t, e, i, n, r, a, o, (-h + p) / f, d), this.#t(s, t, e, i, n, r, a, o, (-h - p) / f, d);
  }
  static bezierBoundingBox(s, t, e, i, n, r, a, o, l) {
    l[0] = Math.min(l[0], s, a), l[1] = Math.min(l[1], t, o), l[2] = Math.max(l[2], s, a), l[3] = Math.max(l[3], t, o), this.#e(s, e, n, a, t, i, r, o, 3 * (-s + 3 * (e - n) + a), 6 * (s - 2 * e + n), 3 * (e - s), l), this.#e(s, e, n, a, t, i, r, o, 3 * (-t + 3 * (i - r) + o), 6 * (t - 2 * i + r), 3 * (i - t), l);
  }
};
function xn(s) {
  return decodeURIComponent(escape(s));
}
var We = null, Bs = null;
function Tn(s) {
  return We || (We = /([\u00a0\u00b5\u037e\u0eb3\u2000-\u200a\u202f\u2126\ufb00-\ufb04\ufb06\ufb20-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufba1\ufba4-\ufba9\ufbae-\ufbb1\ufbd3-\ufbdc\ufbde-\ufbe7\ufbea-\ufbf8\ufbfc\ufbfd\ufc00-\ufc5d\ufc64-\ufcf1\ufcf5-\ufd3d\ufd88\ufdf4\ufdfa\ufdfb\ufe71\ufe77\ufe79\ufe7b\ufe7d]+)|(\ufb05+)/gu, Bs = /* @__PURE__ */ new Map([["ﬅ", "ſt"]])), s.replaceAll(We, (t, e, i) => e ? e.normalize("NFKC") : Bs.get(i));
}
function Ai() {
  if (typeof crypto.randomUUID == "function") return crypto.randomUUID();
  const s = /* @__PURE__ */ new Uint8Array(32);
  return crypto.getRandomValues(s), Cn(s);
}
function kn(s, t, e) {
  if (!Array.isArray(e) || e.length < 2) return !1;
  const [i, n, ...r] = e;
  if (!s(i) && !Number.isInteger(i) || !t(n)) return !1;
  const a = r.length;
  let o = !0;
  switch (n.name) {
    case "XYZ":
      if (a < 2 || a > 3) return !1;
      break;
    case "Fit":
    case "FitB":
      return a === 0;
    case "FitH":
    case "FitBH":
    case "FitV":
    case "FitBV":
      if (a > 1) return !1;
      break;
    case "FitR":
      if (a !== 4) return !1;
      o = !1;
      break;
    default:
      return !1;
  }
  for (const l of r)
    if (!(typeof l == "number" || o && l === null))
      return !1;
  return !0;
}
var Zt = () => [], Cs = () => /* @__PURE__ */ new Map(), is = () => /* @__PURE__ */ Object.create(null), Pn = () => /* @__PURE__ */ new Set();
typeof Iterator.prototype.join != "function" && (Iterator.prototype.join = function(s) {
  return [...this].join(s);
});
function Y(s, t, e) {
  return Math.min(Math.max(s, t), e);
}
var xs = class vi {
  constructor({ viewBox: t, userUnit: e, scale: i, rotation: n, offsetX: r = 0, offsetY: a = 0, dontFlip: o = !1 }) {
    this.viewBox = t, this.userUnit = e, this.scale = i, this.rotation = n, this.offsetX = r, this.offsetY = a, i *= e;
    const l = (t[2] + t[0]) / 2, h = (t[3] + t[1]) / 2;
    let c, d, u, p;
    switch (n %= 360, n < 0 && (n += 360), n) {
      case 180:
        c = -1, d = 0, u = 0, p = 1;
        break;
      case 90:
        c = 0, d = 1, u = 1, p = 0;
        break;
      case 270:
        c = 0, d = -1, u = -1, p = 0;
        break;
      case 0:
        c = 1, d = 0, u = 0, p = -1;
        break;
      default:
        throw new Error("PageViewport: Invalid rotation, must be a multiple of 90 degrees.");
    }
    o && (u = -u, p = -p);
    let f, m, g, b;
    c === 0 ? (f = Math.abs(h - t[1]) * i + r, m = Math.abs(l - t[0]) * i + a, g = (t[3] - t[1]) * i, b = (t[2] - t[0]) * i) : (f = Math.abs(l - t[0]) * i + r, m = Math.abs(h - t[1]) * i + a, g = (t[2] - t[0]) * i, b = (t[3] - t[1]) * i), this.transform = [
      c * i,
      d * i,
      u * i,
      p * i,
      f - c * i * l - u * i * h,
      m - d * i * l - p * i * h
    ], this.width = g, this.height = b;
  }
  get rawDims() {
    const t = this.viewBox;
    return P(this, "rawDims", {
      pageWidth: t[2] - t[0],
      pageHeight: t[3] - t[1],
      pageX: t[0],
      pageY: t[1]
    });
  }
  clone({ scale: t = this.scale, rotation: e = this.rotation, offsetX: i = this.offsetX, offsetY: n = this.offsetY, dontFlip: r = !1 } = {}) {
    return new vi({
      viewBox: this.viewBox.slice(),
      userUnit: this.userUnit,
      scale: t,
      rotation: e,
      offsetX: i,
      offsetY: n,
      dontFlip: r
    });
  }
  convertToViewportPoint(t, e) {
    const i = [t, e];
    return _.applyTransform(i, this.transform), i;
  }
  convertToPdfPoint(t, e) {
    const i = [t, e];
    return _.applyInverseTransform(i, this.transform), i;
  }
}, ns = class wi {
  static textContent(t) {
    const e = [], i = {
      items: e,
      styles: /* @__PURE__ */ Object.create(null)
    };
    function n(r) {
      if (!r) return;
      let a = null;
      const o = r.name;
      if (o === "#text") a = r.value;
      else if (wi.shouldBuildText(o)) r?.attributes?.textContent ? a = r.attributes.textContent : r.value && (a = r.value);
      else return;
      if (a !== null && e.push({ str: a }), !!r.children)
        for (const l of r.children) n(l);
    }
    return n(t), i;
  }
  static shouldBuildText(t) {
    return !(t === "textarea" || t === "input" || t === "option" || t === "select");
  }
}, Mn = /url\(|image-set\(/i, Dn = /^on/i, Si = class {
  static get _allowedHtmlElements() {
    return P(this, "_allowedHtmlElements", /* @__PURE__ */ new Set([
      "a",
      "b",
      "br",
      "button",
      "div",
      "i",
      "img",
      "input",
      "label",
      "li",
      "ol",
      "option",
      "p",
      "select",
      "span",
      "sub",
      "sup",
      "textarea",
      "ul"
    ]));
  }
  static get _allowedSvgElements() {
    return P(this, "_allowedSvgElements", /* @__PURE__ */ new Set([
      "ellipse",
      "line",
      "path",
      "rect",
      "svg"
    ]));
  }
  static get _allowedRichTextElements() {
    return P(this, "_allowedRichTextElements", /* @__PURE__ */ new Set([
      "a",
      "b",
      "br",
      "div",
      "i",
      "li",
      "ol",
      "p",
      "span",
      "sub",
      "sup",
      "ul"
    ]));
  }
  static get _allowedRichTextAttributes() {
    return P(this, "_allowedRichTextAttributes", /* @__PURE__ */ new Set([
      "class",
      "dir",
      "style"
    ]));
  }
  static get _allowedRichTextStyles() {
    return P(this, "_allowedRichTextStyles", /* @__PURE__ */ new Set([
      "color",
      "font",
      "fontFamily",
      "fontSize",
      "fontStretch",
      "fontStyle",
      "fontWeight",
      "kerningMode",
      "letterSpacing",
      "lineHeight",
      "margin",
      "marginBottom",
      "marginLeft",
      "marginRight",
      "marginTop",
      "orphans",
      "paddingLeft",
      "paddingRight",
      "breakAfter",
      "breakBefore",
      "breakInside",
      "tabInterval",
      "tabStop",
      "textAlign",
      "textDecoration",
      "textIndent",
      "transform",
      "verticalAlign",
      "widows"
    ]));
  }
  static setupStorage(s, t, e, i, n) {
    const r = i.getValue(t, { value: null });
    switch (e.name) {
      case "textarea":
        if (r.value !== null && (s.textContent = r.value), n === "print") break;
        s.addEventListener("input", (a) => {
          i.setValue(t, { value: a.target.value });
        });
        break;
      case "input":
        if (e.attributes.type === "radio" || e.attributes.type === "checkbox") {
          if (r.value === e.attributes.xfaOn ? s.setAttribute("checked", !0) : r.value === e.attributes.xfaOff && s.removeAttribute("checked"), n === "print") break;
          s.addEventListener("change", (a) => {
            i.setValue(t, { value: a.target.checked ? a.target.getAttribute("xfaOn") : a.target.getAttribute("xfaOff") });
          });
        } else {
          if (r.value !== null && s.setAttribute("value", r.value), n === "print") break;
          s.addEventListener("input", (a) => {
            i.setValue(t, { value: a.target.value });
          });
        }
        break;
      case "select":
        if (r.value !== null) {
          s.setAttribute("value", r.value);
          for (const a of e.children) a.attributes.value === r.value ? a.attributes.selected = !0 : Object.hasOwn(a.attributes, "selected") && delete a.attributes.selected;
        }
        s.addEventListener("input", (a) => {
          const o = a.target.options, l = o.selectedIndex === -1 ? "" : o[o.selectedIndex].value;
          i.setValue(t, { value: l });
        });
    }
  }
  static setAttributes({ html: s, element: t, storage: e = null, intent: i, linkService: n }) {
    const { attributes: r } = t, a = s instanceof HTMLAnchorElement;
    r.type === "radio" && (r.name = `${r.name}-${i}`);
    for (const [o, l] of Object.entries(r))
      if (l != null && !Dn.test(o) && !(i === "richText" && !this._allowedRichTextAttributes.has(o)))
        switch (o) {
          case "class":
            l.length && s.setAttribute(o, l.join(" "));
            break;
          case "dataId":
            break;
          case "id":
            s.setAttribute("data-element-id", l);
            break;
          case "style":
            if (i === "richText") {
              const h = this._allowedRichTextStyles;
              for (const [c, d] of Object.entries(l)) h.has(c) && !Mn.test(d) && (s.style[c] = d);
            } else Object.assign(s.style, l);
            break;
          case "textContent":
            s.textContent = l;
            break;
          default:
            (!a || o !== "href" && o !== "newWindow") && s.setAttribute(o, l);
        }
    a && n?.addLinkAttributes(s, r.href, r.newWindow), e && r.dataId && this.setupStorage(s, r.dataId, t, e);
  }
  static #t(s, t, e) {
    return e === "richText" ? !t && this._allowedRichTextElements.has(s) ? document.createElement(s) : null : t ? t === lt && this._allowedSvgElements.has(s) ? document.createElementNS(lt, s) : null : this._allowedHtmlElements.has(s) ? document.createElement(s) : null;
  }
  static render(s) {
    const t = s.annotationStorage, e = s.linkService, i = s.xfaHtml, n = s.intent || "display", r = this.#t(i.name, i.attributes?.xmlns, n) ?? document.createElement("div");
    i.attributes && this.setAttributes({
      html: r,
      element: i,
      intent: n,
      linkService: e
    });
    const a = n !== "richText", o = s.div;
    if (o.append(r), s.viewport) {
      const c = `matrix(${s.viewport.transform.join(",")})`;
      o.style.transform = c;
    }
    a && o.setAttribute("class", "xfaLayer xfaFont");
    const l = [];
    if (i.children.length === 0) {
      if (i.value) {
        const c = document.createTextNode(i.value);
        r.append(c), a && ns.shouldBuildText(i.name) && l.push(c);
      }
      return { textDivs: l };
    }
    const h = [[
      i,
      -1,
      r
    ]];
    for (; h.length > 0; ) {
      const [c, d, u] = h.at(-1);
      if (d + 1 === c.children.length) {
        h.pop();
        continue;
      }
      const p = c.children[++h.at(-1)[1]];
      if (p === null) continue;
      const { name: f } = p;
      if (f === "#text") {
        const g = document.createTextNode(p.value);
        l.push(g), u.append(g);
        continue;
      }
      const m = this.#t(f, p.attributes?.xmlns, n);
      if (m) {
        if (u.append(m), p.attributes && this.setAttributes({
          html: m,
          element: p,
          storage: t,
          intent: n,
          linkService: e
        }), p.children?.length > 0) h.push([
          p,
          -1,
          m
        ]);
        else if (p.value) {
          const g = document.createTextNode(p.value);
          a && ns.shouldBuildText(f) && l.push(g), m.append(g);
        }
      }
    }
    for (const c of o.querySelectorAll(".xfaNonInteractive input, .xfaNonInteractive textarea")) c.setAttribute("readOnly", !0);
    return { textDivs: l };
  }
  static update(s) {
    const t = `matrix(${s.viewport.transform.join(",")})`;
    s.div.style.transform = t, s.div.hidden = !1;
  }
  static getPageViewport(s, { scale: t = 1, rotation: e = 0 }) {
    const { width: i, height: n } = s.attributes.style;
    return new xs({
      viewBox: [
        0,
        0,
        parseInt(i, 10),
        parseInt(n, 10)
      ],
      userUnit: 1,
      scale: t,
      rotation: e
    });
  }
}, Jt = class {
  static CSS = 96;
  static PDF = 72;
  static PDF_TO_CSS_UNITS = this.CSS / this.PDF;
};
async function Ts(s, t = "text") {
  if (re(s, document.baseURI)) {
    const e = await fetch(s);
    if (!e.ok) throw new Error(e.statusText);
    switch (t) {
      case "blob":
        return e.blob();
      case "bytes":
        return e.bytes();
      case "json":
        return e.json();
    }
    return e.text();
  }
  return new Promise((e, i) => {
    const n = new XMLHttpRequest();
    n.open("GET", s, !0), n.responseType = t === "bytes" ? "arraybuffer" : t, n.onreadystatechange = () => {
      if (n.readyState === XMLHttpRequest.DONE) {
        if (n.status === 200 || n.status === 0) {
          switch (t) {
            case "bytes":
              e(new Uint8Array(n.response));
              return;
            case "blob":
            case "json":
              e(n.response);
              return;
          }
          e(n.responseText);
          return;
        }
        i(new Error(n.statusText));
      }
    }, n.send(null);
  });
}
var ks = class extends $t {
  constructor(s, t = 0) {
    super(s, "RenderingCancelledException"), this.extraDelay = t;
  }
};
function Fe(s) {
  const t = s.length;
  let e = 0;
  for (; e < t && s[e].trim() === ""; ) e++;
  return s.substring(e, e + 5).toLowerCase() === "data:";
}
function Ps(s) {
  return typeof s == "string" && /\.pdf$/i.test(s);
}
function In(s) {
  return [s] = s.split(/[#?]/, 1), ts(s);
}
function Ln(s, t = "document.pdf") {
  if (typeof s != "string") return t;
  if (Fe(s))
    return R('getPdfFilenameFromUrl: ignore "data:"-URL for performance reasons.'), t;
  const i = ((o) => {
    try {
      return new URL(o);
    } catch {
    }
    try {
      return new URL(decodeURIComponent(o));
    } catch {
    }
    try {
      return new URL(o, "https://foo.bar");
    } catch {
    }
    try {
      return new URL(decodeURIComponent(o), "https://foo.bar");
    } catch {
    }
    return null;
  })(s);
  if (!i) return t;
  const n = (o) => {
    try {
      let l = decodeURIComponent(o);
      return l.includes("/") && (l = ts(l), l.length === 4 && r.test(l)) ? o : l;
    } catch {
      return o;
    }
  }, r = /\.pdf$/i, a = ts(i.pathname);
  if (r.test(a)) return n(a);
  if (i.searchParams.size > 0) {
    const o = (h) => [...h].findLast((c) => r.test(c)), l = o(i.searchParams.values()) ?? o(i.searchParams.keys());
    if (l) return n(l);
  }
  if (i.hash) {
    const { hash: o } = i;
    let l = -1;
    for (const { index: h } of o.matchAll(/\.pdf\b/gi)) l = h;
    if (l > 0) {
      let h = l;
      for (; h > 0 && !"/?#=".includes(o[h - 1]); ) h--;
      if (h < l) return n(o.slice(h, l + 4));
    }
  }
  return t;
}
var Hs = class {
  #t = /* @__PURE__ */ new Map();
  times = [];
  time(s) {
    this.#t.has(s) && R(`Timer is already running for ${s}`), this.#t.set(s, Date.now());
  }
  timeEnd(s) {
    this.#t.has(s) || R(`Timer has not been started for ${s}`), this.times.push({
      name: s,
      start: this.#t.get(s),
      end: Date.now()
    }), this.#t.delete(s);
  }
  toString() {
    const s = Math.max(...this.times.map((t) => t.name.length));
    return this.times.map((t) => `${t.name.padEnd(s)} ${t.end - t.start}ms
`).join("");
  }
};
function re(s, t) {
  const e = t ? URL.parse(s, t) : URL.parse(s);
  return /https?:/.test(e?.protocol ?? "");
}
function At(s) {
  s.preventDefault();
}
function et(s) {
  s.preventDefault(), s.stopPropagation();
}
var rs = class {
  static #t;
  static toDateObject(s) {
    if (s instanceof Date) return s;
    if (!s || typeof s != "string") return null;
    this.#t ||= /* @__PURE__ */ new RegExp("^D:(\\d{4})(\\d{2})?(\\d{2})?(\\d{2})?(\\d{2})?(\\d{2})?([Z|+\\-])?(\\d{2})?'?(\\d{2})?'?");
    const t = this.#t.exec(s);
    if (!t) return null;
    const e = parseInt(t[1], 10);
    let i = parseInt(t[2], 10);
    i = i >= 1 && i <= 12 ? i - 1 : 0;
    let n = parseInt(t[3], 10);
    n = n >= 1 && n <= 31 ? n : 1;
    let r = parseInt(t[4], 10);
    r = r >= 0 && r <= 23 ? r : 0;
    let a = parseInt(t[5], 10);
    a = a >= 0 && a <= 59 ? a : 0;
    let o = parseInt(t[6], 10);
    o = o >= 0 && o <= 59 ? o : 0;
    const l = t[7] || "Z";
    let h = parseInt(t[8], 10);
    h = h >= 0 && h <= 23 ? h : 0;
    let c = parseInt(t[9], 10) || 0;
    return c = c >= 0 && c <= 59 ? c : 0, l === "-" ? (r += h, a += c) : l === "+" && (r -= h, a -= c), new Date(Date.UTC(e, i, n, r, a, o));
  }
};
function he(s) {
  if (s.startsWith("#")) {
    const e = s.slice(1);
    return [
      parseInt(e.slice(0, 2), 16),
      parseInt(e.slice(2, 4), 16),
      parseInt(e.slice(4, 6), 16),
      e.length >= 8 ? parseInt(e.slice(6, 8), 16) / 255 : 1
    ];
  }
  if (s.startsWith("rgb(")) {
    const [e, i, n] = s.slice(4, -1).split(",").map((r) => parseInt(r, 10));
    return [
      e,
      i,
      n,
      1
    ];
  }
  if (s.startsWith("rgba(")) {
    const e = s.slice(5, -1).split(",");
    return [
      parseInt(e[0], 10),
      parseInt(e[1], 10),
      parseInt(e[2], 10),
      parseFloat(e[3])
    ];
  }
  const t = s.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+|none))?\)$/);
  return t ? [
    Math.round(parseFloat(t[1]) * 255),
    Math.round(parseFloat(t[2]) * 255),
    Math.round(parseFloat(t[3]) * 255),
    t[4] !== void 0 && t[4] !== "none" ? parseFloat(t[4]) : 1
  ] : null;
}
function ce(s) {
  const t = he(s);
  return t ? t.slice(0, 3) : (R(`Not a valid color format: "${s}"`), [
    0,
    0,
    0
  ]);
}
function Fn(s) {
  const t = document.createElement("span");
  t.style.visibility = "hidden", t.style.colorScheme = "only light", document.body.append(t);
  for (const e of s.keys()) {
    t.style.color = e;
    const i = window.getComputedStyle(t).color;
    s.set(e, ce(i));
  }
  t.remove();
}
function j(s) {
  const { a: t, b: e, c: i, d: n, e: r, f: a } = s.getTransform();
  return [
    t,
    e,
    i,
    n,
    r,
    a
  ];
}
function vt(s) {
  const { a: t, b: e, c: i, d: n, e: r, f: a } = s.getTransform().invertSelf();
  return [
    t,
    e,
    i,
    n,
    r,
    a
  ];
}
function Ut(s, t, e = !1, i = !0) {
  if (t instanceof xs) {
    const { pageWidth: n, pageHeight: r } = t.rawDims, { style: a } = s, o = `round(down, var(--total-scale-factor) * ${n}px, var(--scale-round-x))`, l = `round(down, var(--total-scale-factor) * ${r}px, var(--scale-round-y))`;
    !e || t.rotation % 180 === 0 ? (a.width = o, a.height = l) : (a.width = l, a.height = o);
  }
  i && s.setAttribute("data-main-rotation", t.rotation);
}
var Ft = class as {
  constructor() {
    const { pixelRatio: t } = as;
    this.sx = t, this.sy = t;
  }
  get scaled() {
    return this.sx !== 1 || this.sy !== 1;
  }
  get symmetric() {
    return this.sx === this.sy;
  }
  limitCanvas(t, e, i, n, r = -1) {
    let a = 1 / 0, o = 1 / 0, l = 1 / 0;
    i = as.capPixels(i, r), i > 0 && (a = Math.sqrt(i / (t * e))), n !== -1 && (o = n / t, l = n / e);
    const h = Math.min(a, o, l);
    return this.sx > h || this.sy > h ? (this.sx = h, this.sy = h, !0) : !1;
  }
  static get pixelRatio() {
    return globalThis.devicePixelRatio || 1;
  }
  static capPixels(t, e) {
    if (e >= 0) {
      const i = Math.ceil(window.screen.availWidth * window.screen.availHeight * this.pixelRatio ** 2 * (1 + e / 100));
      return t > 0 ? Math.min(t, i) : i;
    }
    return t;
  }
}, os = [
  "image/apng",
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "image/x-icon"
], On = class {
  static get isDarkMode() {
    return P(this, "isDarkMode", !!window?.matchMedia?.("(prefers-color-scheme: dark)").matches);
  }
}, Rn = class {
  static get commentForegroundColor() {
    const s = document.createElement("span");
    s.classList.add("comment", "sidebar");
    const { style: t } = s;
    t.width = t.height = "0", t.display = "none", t.color = "var(--comment-fg-color)", document.body.append(s);
    const { color: e } = window.getComputedStyle(s);
    return s.remove(), P(this, "commentForegroundColor", ce(e));
  }
};
function Nn(s, t) {
  t = Y(t ?? 1, 0, 1);
  const e = 255 * (1 - t);
  return s.map((i) => Math.round(i * t + e));
}
function Us(s, t) {
  const e = s[0] / 255, i = s[1] / 255, n = s[2] / 255, r = Math.max(e, i, n), a = Math.min(e, i, n), o = (r + a) / 2;
  if (r === a) t[0] = t[1] = 0;
  else {
    const l = r - a;
    switch (t[1] = o < 0.5 ? l / (r + a) : l / (2 - r - a), r) {
      case e:
        t[0] = ((i - n) / l + (i < n ? 6 : 0)) * 60;
        break;
      case i:
        t[0] = ((n - e) / l + 2) * 60;
        break;
      case n:
        t[0] = ((e - i) / l + 4) * 60;
    }
  }
  t[2] = o;
}
function ls(s, t) {
  const e = s[0], i = s[1], n = s[2], r = (1 - Math.abs(2 * n - 1)) * i, a = r * (1 - Math.abs(e / 60 % 2 - 1)), o = n - r / 2;
  switch (Math.floor(e / 60)) {
    case 0:
      t[0] = r + o, t[1] = a + o, t[2] = o;
      break;
    case 1:
      t[0] = a + o, t[1] = r + o, t[2] = o;
      break;
    case 2:
      t[0] = o, t[1] = r + o, t[2] = a + o;
      break;
    case 3:
      t[0] = o, t[1] = a + o, t[2] = r + o;
      break;
    case 4:
      t[0] = a + o, t[1] = o, t[2] = r + o;
      break;
    case 5:
    case 6:
      t[0] = r + o, t[1] = o, t[2] = a + o;
  }
}
function hs(s) {
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function Gs(s, t, e) {
  ls(s, e), e.map(hs);
  const i = 0.2126 * e[0] + 0.7152 * e[1] + 0.0722 * e[2];
  ls(t, e), e.map(hs);
  const n = 0.2126 * e[0] + 0.7152 * e[1] + 0.0722 * e[2];
  return i > n ? (i + 0.05) / (n + 0.05) : (n + 0.05) / (i + 0.05);
}
var $s = /* @__PURE__ */ new Map();
function Bn(s, t) {
  const e = s[0] + s[1] * 256 + s[2] * 65536 + t[0] * 16777216 + t[1] * 4294967296 + t[2] * 1099511627776;
  let i = $s.get(e);
  if (i) return i;
  const n = /* @__PURE__ */ new Float32Array(9), r = n.subarray(0, 3), a = n.subarray(3, 6);
  Us(s, a);
  const o = n.subarray(6, 9);
  Us(t, o);
  const l = o[2] < 0.5, h = l ? 12 : 4.5;
  if (a[2] = l ? Math.sqrt(a[2]) : 1 - Math.sqrt(1 - a[2]), Gs(a, o, r) < h) {
    let c, d;
    l ? (c = a[2], d = 1) : (c = 0, d = a[2]);
    const u = 5e-3;
    for (; d - c > u; ) {
      const p = a[2] = (c + d) / 2;
      l === Gs(a, o, r) < h ? c = p : d = p;
    }
    a[2] = l ? d : c;
  }
  return ls(a, r), i = _.makeHexColor(Math.round(r[0] * 255), Math.round(r[1] * 255), Math.round(r[2] * 255)), $s.set(e, i), i;
}
function Ei({ html: s, dir: t, className: e }, i) {
  const n = document.createDocumentFragment();
  if (typeof s == "string") {
    const r = document.createElement("p");
    r.dir = t || "auto";
    const a = s.split(/\r\n?|\n/);
    for (let o = 0, l = a.length; o < l; ++o) {
      const h = a[o];
      r.append(document.createTextNode(h)), o < l - 1 && r.append(document.createElement("br"));
    }
    n.append(r);
  } else Si.render({
    xfaHtml: s,
    div: n,
    intent: "richText"
  });
  n.firstElementChild.classList.add("richText", e), i.append(n);
}
function _i(s) {
  const t = new Path2D();
  if (!s) return t;
  for (let e = 0, i = s.length; e < i; ) switch (s[e++]) {
    case te.moveTo:
      t.moveTo(s[e++], s[e++]);
      break;
    case te.lineTo:
      t.lineTo(s[e++], s[e++]);
      break;
    case te.curveTo:
      t.bezierCurveTo(s[e++], s[e++], s[e++], s[e++], s[e++], s[e++]);
      break;
    case te.quadraticCurveTo:
      t.quadraticCurveTo(s[e++], s[e++], s[e++], s[e++]);
      break;
    case te.closePath:
      t.closePath();
      break;
    default:
      R(`Unrecognized drawing path operator: ${s[e - 1]}`);
  }
  return t;
}
var Hn = class _e {
  #t = null;
  #e = null;
  #s;
  #i = null;
  #n = null;
  #a = null;
  #r = null;
  #o = null;
  static #l = null;
  constructor(t) {
    this.#s = t, _e.#l ||= Object.freeze({
      freetext: "pdfjs-editor-remove-freetext-button",
      highlight: "pdfjs-editor-remove-highlight-button",
      ink: "pdfjs-editor-remove-ink-button",
      stamp: "pdfjs-editor-remove-stamp-button",
      signature: "pdfjs-editor-remove-signature-button"
    });
  }
  render() {
    const t = this.#t = document.createElement("div");
    t.classList.add("editToolbar", "hidden"), t.setAttribute("role", "toolbar");
    const e = this.#s._uiManager._signal;
    e instanceof AbortSignal && !e.aborted && (t.addEventListener("contextmenu", At, { signal: e }), t.addEventListener("pointerdown", _e.#h, { signal: e }));
    const i = this.#i = document.createElement("div");
    i.className = "buttons", t.append(i);
    const n = this.#s.toolbarPosition;
    if (n) {
      const { style: r } = t;
      r.insetInlineEnd = `${100 * (this.#s._uiManager.direction === "ltr" ? 1 - n[0] : n[0])}%`, r.top = `calc(${100 * n[1]}% + var(--editor-toolbar-vert-offset))`;
    }
    return t;
  }
  get div() {
    return this.#t;
  }
  static #h(t) {
    t.stopPropagation();
  }
  #u(t) {
    this.#s._focusEventsAllowed = !1, et(t);
  }
  #d(t) {
    this.#s._focusEventsAllowed = !0, et(t);
  }
  #f(t) {
    const e = this.#s._uiManager._signal;
    return !(e instanceof AbortSignal) || e.aborted ? !1 : (t.addEventListener("focusin", this.#u.bind(this), {
      capture: !0,
      signal: e
    }), t.addEventListener("focusout", this.#d.bind(this), {
      capture: !0,
      signal: e
    }), t.addEventListener("contextmenu", At, { signal: e }), !0);
  }
  hide() {
    this.#t.classList.add("hidden"), this.#e?.hideDropdown();
  }
  show() {
    this.#t.classList.remove("hidden"), this.#n?.shown(), this.#a?.shown();
  }
  addDeleteButton() {
    const { editorType: t, _uiManager: e } = this.#s, i = document.createElement("button");
    i.classList.add("basic", "deleteButton"), i.tabIndex = 0, i.setAttribute("data-l10n-id", _e.#l[t]), this.#f(i) && i.addEventListener("click", (n) => {
      e.delete();
    }, { signal: e._signal }), this.#i.append(i);
  }
  get #g() {
    const t = document.createElement("div");
    return t.className = "divider", t;
  }
  async addAltText(t) {
    const e = await t.render();
    this.#f(e), this.#i.append(e, this.#g), this.#n = t;
  }
  addComment(t, e = null) {
    if (this.#a) return;
    const i = t.renderForToolbar();
    if (!i) return;
    this.#f(i);
    const n = this.#r = this.#g;
    e ? (this.#i.insertBefore(i, e), this.#i.insertBefore(n, e)) : this.#i.append(i, n), this.#a = t, t.toolbar = this;
  }
  addColorPicker(t) {
    if (this.#e) return;
    this.#e = t;
    const e = t.renderButton();
    this.#f(e), this.#i.append(e, this.#g);
  }
  async addEditSignatureButton(t) {
    const e = this.#o = await t.renderEditButton(this.#s);
    this.#f(e), this.#i.append(e, this.#g);
  }
  removeButton(t) {
    switch (t) {
      case "comment":
        this.#a?.removeToolbarCommentButton(), this.#a = null, this.#r?.remove(), this.#r = null;
    }
  }
  async addButton(t, e) {
    switch (t) {
      case "colorPicker":
        e && this.addColorPicker(e);
        break;
      case "altText":
        e && await this.addAltText(e);
        break;
      case "editSignature":
        e && await this.addEditSignatureButton(e);
        break;
      case "delete":
        this.addDeleteButton();
        break;
      case "comment":
        e && this.addComment(e);
    }
  }
  async addButtonBefore(t, e, i) {
    if (!e && t === "comment") return;
    const n = this.#i.querySelector(i);
    n && t === "comment" && this.addComment(e, n);
  }
  updateEditSignatureButton(t) {
    this.#o && (this.#o.title = t);
  }
  remove() {
    this.#t.remove(), this.#e?.destroy(), this.#e = null;
  }
}, Un = class {
  #t = null;
  #e = null;
  #s;
  constructor(s) {
    this.#s = s;
  }
  #i() {
    const s = this.#e = document.createElement("div");
    s.className = "editToolbar", s.setAttribute("role", "toolbar"), s.dir = this.#s.direction;
    const t = this.#s._signal;
    t instanceof AbortSignal && !t.aborted && s.addEventListener("contextmenu", At, { signal: t });
    const e = this.#t = document.createElement("div");
    return e.className = "buttons", s.append(e), this.#s.hasCommentManager() && this.#a("commentButton", "pdfjs-comment-floating-button", "pdfjs-comment-floating-button-label", () => {
      this.#s.commentSelection("floating_button");
    }), this.#a("highlightButton", "pdfjs-highlight-floating-button1", "pdfjs-highlight-floating-button-label", () => {
      this.#s.highlightSelection("floating_button");
    }), s;
  }
  #n(s, t) {
    let e = 0, i = 0;
    for (const n of s) {
      const r = n.y + n.height;
      if (r < e) continue;
      const a = n.x + (t ? n.width : 0);
      if (r > e) {
        i = a, e = r;
        continue;
      }
      t ? a > i && (i = a) : a < i && (i = a);
    }
    return [t ? 1 - i : i, e];
  }
  show(s, t, e) {
    const [i, n] = this.#n(t, e), { style: r } = this.#e ||= this.#i();
    s.append(this.#e), r.insetInlineEnd = `${100 * i}%`, r.top = `calc(${100 * n}% + var(--editor-toolbar-vert-offset))`;
  }
  hide() {
    this.#e.remove();
  }
  #a(s, t, e, i) {
    const n = document.createElement("button");
    n.classList.add("basic", s), n.tabIndex = 0, n.setAttribute("data-l10n-id", t);
    const r = document.createElement("span");
    n.append(r), r.className = "visuallyHidden", r.setAttribute("data-l10n-id", e);
    const a = this.#s._signal;
    a instanceof AbortSignal && !a.aborted && (n.addEventListener("contextmenu", At, { signal: a }), n.addEventListener("click", i, { signal: a })), this.#t.append(n);
  }
}, Xe = Object.freeze({ internal: "59968104-cc61-4cf9-b570-014b35b3709c" });
function Ci(s, t, e) {
  for (const i of e) t.addEventListener(i, s[i].bind(s));
}
var ht = class nt {
  static #t = NaN;
  static #e = null;
  static #s = NaN;
  static #i = null;
  static initializeAndAddPointerId(t) {
    (nt.#e ||= /* @__PURE__ */ new Set()).add(t);
  }
  static setPointer(t, e) {
    nt.#t ||= e, nt.#i ??= t;
  }
  static setTimeStamp(t) {
    nt.#s = t;
  }
  static isSamePointerId(t) {
    return nt.#t === t;
  }
  static isSamePointerIdOrRemove(t) {
    return nt.#t === t ? !0 : (nt.#e?.delete(t), !1);
  }
  static isSamePointerType(t) {
    return nt.#i === t;
  }
  static isInitializedAndDifferentPointerType(t) {
    return nt.#i !== null && !nt.isSamePointerType(t);
  }
  static isSameTimeStamp(t) {
    return nt.#s === t;
  }
  static isUsingMultiplePointers() {
    return nt.#e?.size >= 1;
  }
  static clearPointerType() {
    nt.#i = null;
  }
  static clearPointerIds() {
    nt.#t = NaN, nt.#e = null;
  }
  static clearTimeStamp() {
    nt.#s = NaN;
  }
}, Gn = class {
  #t = 0;
  get id() {
    return `${Qt}${this.#t++}`;
  }
}, $n = class xi {
  #t = Ai();
  #e = 0;
  #s = null;
  static get _isSVGFittingCanvas() {
    const t = `data:image/svg+xml;charset=UTF-8,<svg viewBox="0 0 1 1" width="1" height="1" xmlns="${lt}"><rect width="1" height="1" style="fill:red;"/></svg>`, e = new OffscreenCanvas(1, 3).getContext("2d", { willReadFrequently: !0 }), i = new Image();
    i.src = t;
    const n = i.decode().then(() => (e.drawImage(i, 0, 0, 1, 1, 0, 0, 1, 3), new Uint32Array(e.getImageData(0, 0, 1, 1).data.buffer)[0] === 0));
    return P(this, "_isSVGFittingCanvas", n);
  }
  async #i(t, e) {
    this.#s ||= /* @__PURE__ */ new Map();
    let i = this.#s.get(t);
    if (i === null) return null;
    if (i?.bitmap)
      return i.refCounter += 1, i;
    try {
      i ||= {
        bitmap: null,
        id: `image_${this.#t}_${this.#e++}`,
        refCounter: 0,
        isSvg: !1
      };
      let n;
      if (typeof e == "string" ? (i.url = e, n = await Ts(e, "blob")) : e instanceof File ? n = i.file = e : e instanceof Blob && (n = e), n.type === "image/svg+xml") {
        const r = xi._isSVGFittingCanvas, a = new FileReader(), o = new Image(), l = new Promise((h, c) => {
          o.onload = () => {
            i.bitmap = o, i.isSvg = !0, h();
          }, a.onload = async () => {
            const d = i.svgUrl = a.result;
            o.src = await r ? `${d}#svgView(preserveAspectRatio(none))` : d;
          }, o.onerror = a.onerror = c;
        });
        a.readAsDataURL(n), await l;
      } else i.bitmap = await createImageBitmap(n);
      i.refCounter = 1;
    } catch (n) {
      R(n), i = null;
    }
    return this.#s.set(t, i), i && this.#s.set(i.id, i), i;
  }
  async getFromFile(t) {
    const { lastModified: e, name: i, size: n, type: r } = t;
    return this.#i(`${e}_${i}_${n}_${r}`, t);
  }
  async getFromUrl(t) {
    return this.#i(t, t);
  }
  async getFromBlob(t, e) {
    const i = await e;
    return this.#i(t, i);
  }
  async getFromId(t) {
    this.#s ||= /* @__PURE__ */ new Map();
    const e = this.#s.get(t);
    if (!e) return null;
    if (e.bitmap)
      return e.refCounter += 1, e;
    if (e.file) return this.getFromFile(e.file);
    if (e.blobPromise) {
      const { blobPromise: i } = e;
      return delete e.blobPromise, this.getFromBlob(e.id, i);
    }
    return this.getFromUrl(e.url);
  }
  getFromCanvas(t, e) {
    this.#s ||= /* @__PURE__ */ new Map();
    let i = this.#s.get(t);
    if (i?.bitmap)
      return i.refCounter += 1, i;
    const n = new OffscreenCanvas(e.width, e.height);
    return n.getContext("2d").drawImage(e, 0, 0), i = {
      bitmap: n.transferToImageBitmap(),
      id: `image_${this.#t}_${this.#e++}`,
      refCounter: 1,
      isSvg: !1
    }, this.#s.set(t, i), this.#s.set(i.id, i), i;
  }
  getSvgUrl(t) {
    const e = this.#s.get(t);
    return e?.isSvg ? e.svgUrl : null;
  }
  deleteId(t) {
    this.#s ||= /* @__PURE__ */ new Map();
    const e = this.#s.get(t);
    if (!e || (e.refCounter -= 1, e.refCounter !== 0)) return;
    const { bitmap: i } = e;
    if (!e.url && !e.file) {
      const n = new OffscreenCanvas(i.width, i.height);
      n.getContext("bitmaprenderer").transferFromImageBitmap(i), e.blobPromise = n.convertToBlob();
    }
    i.close?.(), e.bitmap = null;
  }
  isValidId(t) {
    return t.startsWith(`image_${this.#t}_`);
  }
}, zn = class {
  #t = [];
  #e = !1;
  #s;
  #i = -1;
  constructor(s = 128) {
    this.#s = s;
  }
  add({ cmd: s, undo: t, post: e, mustExec: i, type: n = NaN, overwriteIfSameType: r = !1, keepUndo: a = !1 }) {
    if (i && s(), this.#e) return;
    const o = {
      cmd: s,
      undo: t,
      post: e,
      type: n
    };
    if (this.#i === -1) {
      this.#t.length > 0 && (this.#t.length = 0), this.#i = 0, this.#t.push(o);
      return;
    }
    if (r && this.#t[this.#i].type === n) {
      a && (o.undo = this.#t[this.#i].undo), this.#t[this.#i] = o;
      return;
    }
    const l = this.#i + 1;
    l === this.#s ? this.#t.splice(0, 1) : (this.#i = l, l < this.#t.length && this.#t.splice(l)), this.#t.push(o);
  }
  undo() {
    if (this.#i === -1) return;
    this.#e = !0;
    const { undo: s, post: t } = this.#t[this.#i];
    s(), t?.(), this.#e = !1, this.#i -= 1;
  }
  redo() {
    if (this.#i < this.#t.length - 1) {
      this.#i += 1, this.#e = !0;
      const { cmd: s, post: t } = this.#t[this.#i];
      s(), t?.(), this.#e = !1;
    }
  }
  hasSomethingToUndo() {
    return this.#i !== -1;
  }
  hasSomethingToRedo() {
    return this.#i < this.#t.length - 1;
  }
  cleanType(s) {
    if (this.#i !== -1) {
      for (let t = this.#i; t >= 0; t--) if (this.#t[t].type !== s) {
        this.#t.splice(t + 1, this.#i - t), this.#i = t;
        return;
      }
      this.#t.length = 0, this.#i = -1;
    }
  }
  destroy() {
    this.#t = null;
  }
}, de = class Pt {
  static ALT = 1;
  static CTRL = 2;
  static META = 4;
  static SHIFT = 8;
  constructor(t) {
    this.callbacks = /* @__PURE__ */ new Map();
    const { isMac: e } = z.platform;
    for (const [i, n, r = {}] of t) {
      const a = i.some((o) => o.startsWith("mac+"));
      for (const o of i) {
        let l = o;
        if (a) {
          const d = o.startsWith("mac+");
          if (e !== d) continue;
          d && (l = o.slice(4));
        }
        const [h, c] = Pt.#t(l);
        h !== null && this.callbacks.getOrInsertComputed(h, Zt).push({
          callback: n,
          options: r,
          modifiers: c
        });
      }
    }
  }
  static #t(t) {
    let e = null, i = 0;
    for (let n of t.split("+")) {
      if (n = n.trim(), !n) continue;
      const r = n.toUpperCase(), a = Pt[r];
      if (a) {
        i |= a;
        continue;
      }
      if (e !== null) {
        R(`KeyboardManager: multiple keys in shortcut "${t}"`);
        break;
      }
      e = r === "SPACE" ? " " : n;
    }
    return e === null && R(`KeyboardManager: no key found in shortcut "${t}"`), [e, i];
  }
  static #e(t) {
    const e = /^(?:Key([A-Z])|(?:Digit|Numpad)(\d))$/.exec(t);
    return e ? e[1]?.toLowerCase() ?? e[2] : null;
  }
  exec(t, e) {
    let i = this.callbacks.get(e.key);
    if (!i) {
      if (/^[a-z]$/i.test(e.key)) return;
      const c = Pt.#e(e.code);
      if (c === null || c === e.key || (i = this.callbacks.get(c), !i)) return;
    }
    const n = (e.altKey ? Pt.ALT : 0) | (e.ctrlKey ? Pt.CTRL : 0) | (e.metaKey ? Pt.META : 0) | (e.shiftKey ? Pt.SHIFT : 0), r = i.find((c) => c.modifiers === n);
    if (!r) return;
    const { callback: a, options: { bubbles: o = !1, args: l = [], checker: h = null } } = r;
    h && !h(t, e) || (a.bind(t, ...l, e)(), o || et(e));
  }
}, jn = class Ti {
  static _colorsMapping = /* @__PURE__ */ new Map([["CanvasText", [
    0,
    0,
    0
  ]], ["Canvas", [
    255,
    255,
    255
  ]]]);
  get _colors() {
    const t = /* @__PURE__ */ new Map([["CanvasText", null], ["Canvas", null]]);
    return Fn(t), P(this, "_colors", t);
  }
  convert(t) {
    const e = ce(t);
    if (!window.matchMedia("(forced-colors: active)").matches) return e;
    for (const [i, n] of this._colors) if (n.every((r, a) => r === e[a])) return Ti._colorsMapping.get(i);
    return e;
  }
  getHexCode(t) {
    const e = this._colors.get(t);
    return e ? _.makeHexColor(...e) : t;
  }
}, oe = class cs {
  #t = new AbortController();
  #e = null;
  #s = null;
  #i = /* @__PURE__ */ new Map();
  #n = /* @__PURE__ */ new Map();
  #a = null;
  #r = null;
  #o = null;
  #l = null;
  #h = null;
  #u = new zn();
  #d = null;
  #f = null;
  #g = null;
  #m = 0;
  #c = /* @__PURE__ */ new Set();
  #p = null;
  #b = null;
  #y = /* @__PURE__ */ new Set();
  _editorUndoBar = null;
  #A = !1;
  #v = !1;
  #E = !1;
  #S = null;
  #_ = null;
  #C = null;
  #M = null;
  #k = !1;
  #T = null;
  #I = new Gn();
  #D = !1;
  #L = !1;
  #U = !1;
  #F = null;
  #R = null;
  #j = null;
  #N = null;
  #G = null;
  #x = O.NONE;
  #w = /* @__PURE__ */ new Set();
  #B = null;
  #$ = null;
  #V = null;
  #q = null;
  #Y = null;
  #K = {
    isEditing: !1,
    isEmpty: !0,
    hasSomethingToUndo: !1,
    hasSomethingToRedo: !1,
    hasSelectedEditor: !1,
    hasSelectedText: !1
  };
  #O = [0, 0];
  #W = null;
  #X = null;
  #tt = null;
  #et = null;
  #H = null;
  static TRANSLATE_SMALL = 1;
  static TRANSLATE_BIG = 10;
  static get _keyboardManager() {
    const t = cs.prototype, e = (a) => a.#X.contains(document.activeElement) && document.activeElement.tagName !== "BUTTON" && a.hasSomethingToControl(), i = (a, { target: o }) => {
      if (o instanceof HTMLInputElement) {
        const { type: l } = o;
        return l !== "text" && l !== "number";
      }
      return !0;
    }, n = this.TRANSLATE_SMALL, r = this.TRANSLATE_BIG;
    return P(this, "_keyboardManager", new de([
      [
        ["ctrl+a", "mac+meta+a"],
        t.selectAll,
        { checker: i }
      ],
      [
        ["ctrl+z", "mac+meta+z"],
        t.undo,
        { checker: i }
      ],
      [
        [
          "ctrl+y",
          "ctrl+shift+z",
          "mac+meta+shift+z",
          "ctrl+shift+Z",
          "mac+meta+shift+Z"
        ],
        t.redo,
        { checker: i }
      ],
      [
        [
          "Backspace",
          "alt+Backspace",
          "ctrl+Backspace",
          "shift+Backspace",
          "mac+Backspace",
          "mac+alt+Backspace",
          "mac+ctrl+Backspace",
          "Delete",
          "ctrl+Delete",
          "shift+Delete",
          "mac+Delete"
        ],
        t.delete,
        { checker: i }
      ],
      [
        ["Enter"],
        t.addNewEditorFromKeyboard,
        { checker: (a, { target: o }) => !(o instanceof HTMLButtonElement) && a.#X.contains(o) && !a.isEnterHandled }
      ],
      [
        ["Space"],
        t.addNewEditorFromKeyboard,
        { checker: (a, { target: o }) => !(o instanceof HTMLButtonElement) && a.#X.contains(document.activeElement) }
      ],
      [["Escape"], t.unselectAll],
      [
        ["ArrowLeft"],
        t.translateSelectedEditors,
        {
          args: [-n, 0],
          checker: e
        }
      ],
      [
        ["ctrl+ArrowLeft", "mac+shift+ArrowLeft"],
        t.translateSelectedEditors,
        {
          args: [-r, 0],
          checker: e
        }
      ],
      [
        ["ArrowRight"],
        t.translateSelectedEditors,
        {
          args: [n, 0],
          checker: e
        }
      ],
      [
        ["ctrl+ArrowRight", "mac+shift+ArrowRight"],
        t.translateSelectedEditors,
        {
          args: [r, 0],
          checker: e
        }
      ],
      [
        ["ArrowUp"],
        t.translateSelectedEditors,
        {
          args: [0, -n],
          checker: e
        }
      ],
      [
        ["ctrl+ArrowUp", "mac+shift+ArrowUp"],
        t.translateSelectedEditors,
        {
          args: [0, -r],
          checker: e
        }
      ],
      [
        ["ArrowDown"],
        t.translateSelectedEditors,
        {
          args: [0, n],
          checker: e
        }
      ],
      [
        ["ctrl+ArrowDown", "mac+shift+ArrowDown"],
        t.translateSelectedEditors,
        {
          args: [0, r],
          checker: e
        }
      ]
    ]));
  }
  constructor(t, e, i, n, r, a, o, l, h, c, d, u, p, f, m, g) {
    const b = this._signal = this.#t.signal;
    this.#X = t, this.#tt = e, this.#et = i, this.#o = n, this.#d = r, this.#$ = a, this.#Y = l, this._eventBus = o;
    const y = {
      signal: b,
      ...Xe
    };
    o.on("editingaction", this.onEditingAction.bind(this), y), o.on("pagechanging", this.onPageChanging.bind(this), y), o.on("scalechanging", this.onScaleChanging.bind(this), y), o.on("rotationchanging", this.onRotationChanging.bind(this), y), o.on("setpreference", this.onSetPreference.bind(this), y), o.on("switchannotationeditorparams", (A) => this.updateParams(A.type, A.value), y), window.addEventListener("pointerdown", () => {
      this.#L = !0;
    }, {
      capture: !0,
      signal: b
    }), window.addEventListener("pointerup", () => {
      this.#L = !1;
    }, {
      capture: !0,
      signal: b
    }), window.addEventListener("beforeunload", this.endCurrentEditing.bind(this), {
      capture: !0,
      signal: b
    }), this.#lt(), this.#pt(), this.#it(), this.#l = l.annotationStorage, this.#S = l.filterFactory, this.#V = h, this.#M = c || null, this.#A = d, this.#v = u, this.#E = p, this.#G = f || null, this.viewParameters = {
      realScale: Jt.PDF_TO_CSS_UNITS,
      rotation: 0
    }, this.isShiftKeyDown = !1, this._editorUndoBar = m || null, this._supportsPinchToZoom = g !== !1, r?.setSidebarUiManager(this);
  }
  destroy() {
    this.#H?.resolve(), this.#H = null, this.#t?.abort(), this.#t = null, this._signal = null;
    for (const t of this.#n.values()) t.destroy();
    this.#n.clear(), this.#i.clear(), this.#y.clear(), this.#N?.clear(), this.#e = null, this.#w.clear(), this.#u.destroy(), this.#o?.destroy(), this.#d?.destroy(), this.#$?.destroy(), this.#T?.hide(), this.#T = null, this.#j?.destroy(), this.#j = null, this.#s = null, this.#_ && (clearTimeout(this.#_), this.#_ = null), this.#W && (clearTimeout(this.#W), this.#W = null), this._editorUndoBar?.destroy(), this.#Y = null;
  }
  combinedSignal(t) {
    return AbortSignal.any([this._signal, t.signal]);
  }
  get mlManager() {
    return this.#G;
  }
  get useNewAltTextFlow() {
    return this.#v;
  }
  get useNewAltTextWhenAddingImage() {
    return this.#E;
  }
  get hcmFilter() {
    return P(this, "hcmFilter", this.#V ? this.#S.addHCMFilter(this.#V.foreground, this.#V.background) : "none");
  }
  get direction() {
    return P(this, "direction", getComputedStyle(this.#X).direction);
  }
  get _highlightColors() {
    return P(this, "_highlightColors", this.#M ? new Map(this.#M.split(",").map((t) => (t = t.split("=").map((e) => e.trim()), t[1] = t[1].toUpperCase(), t))) : null);
  }
  get highlightColors() {
    const { _highlightColors: t } = this;
    if (!t) return P(this, "highlightColors", null);
    const e = /* @__PURE__ */ new Map(), i = !!this.#V;
    for (const [n, r] of t) {
      const a = n.endsWith("_HCM");
      if (i && a) {
        e.set(n.replace("_HCM", ""), r);
        continue;
      }
      !i && !a && e.set(n, r);
    }
    return P(this, "highlightColors", e);
  }
  get highlightColorNames() {
    return P(this, "highlightColorNames", this.highlightColors ? new Map(Array.from(this.highlightColors, (t) => t.reverse())) : null);
  }
  getNonHCMColor(t) {
    if (!this._highlightColors) return t;
    const e = this.highlightColorNames.get(t);
    return this._highlightColors.get(e) || t;
  }
  getNonHCMColorName(t) {
    return this.highlightColorNames.get(t) || t;
  }
  setCurrentDrawingSession(t) {
    t ? (this.unselectAll(), this.disableUserSelect(!0)) : this.disableUserSelect(!1), this.#g = t;
  }
  setMainHighlightColorPicker(t) {
    this.#j = t;
  }
  editAltText(t, e = !1) {
    this.#o?.editAltText(this, t, e);
  }
  hasCommentManager() {
    return !!this.#d;
  }
  editComment(t, e, i, n) {
    this.#d?.showDialog(this, t, e, i, n);
  }
  selectComment(t, e) {
    this.#n.get(t)?.getEditorByUID(e)?.toggleComment(!0, !0);
  }
  updateComment(t) {
    this.#d?.updateComment(t.getData());
  }
  updatePopupColor(t) {
    this.#d?.updatePopupColor(t);
  }
  removeComment(t) {
    this.#d?.removeComments([t.uid]);
  }
  deleteComment(t, e) {
    const i = () => {
      t.comment = e;
    }, n = () => {
      this._editorUndoBar?.show(i, "comment"), this.toggleComment(null), t.comment = null;
    };
    this.addCommands({
      cmd: n,
      undo: i,
      mustExec: !0
    });
  }
  toggleComment(t, e, i = void 0) {
    this.#d?.toggleCommentPopup(t, e, i);
  }
  makeCommentColor(t, e) {
    return t && this.#d?.makeCommentColor(t, e) || null;
  }
  getCommentDialogElement() {
    return this.#d?.dialogElement || null;
  }
  async waitForEditorsRendered(t) {
    if (this.#n.has(t - 1)) return;
    const { resolve: e, promise: i } = Promise.withResolvers(), n = (r) => {
      r.pageNumber === t && (this._eventBus.off("editorsrendered", n), e());
    };
    this._eventBus.on("editorsrendered", n, Xe), await i;
  }
  getSignature(t) {
    this.#$?.getSignature({
      uiManager: this,
      editor: t
    });
  }
  get signatureManager() {
    return this.#$;
  }
  switchToMode(t, e) {
    this._eventBus.on("annotationeditormodechanged", e, {
      once: !0,
      signal: this._signal,
      ...Xe
    }), this._eventBus.dispatch("showannotationeditorui", {
      source: this,
      mode: t
    });
  }
  setPreference(t, e) {
    this._eventBus.dispatch("setpreference", {
      source: this,
      name: t,
      value: e
    });
  }
  onSetPreference({ name: t, value: e }) {
    switch (t) {
      case "enableNewAltTextWhenAddingImage":
        this.#E = e;
    }
  }
  onPageChanging({ pageNumber: t }) {
    this.#m = t - 1;
  }
  deletePage(t) {
    for (const e of this.getEditors(t)) e.remove();
    this.#n.delete(t), this.#m === t && (this.#m = 0);
  }
  focusMainContainer() {
    this.#X.focus();
  }
  findParent(t, e) {
    for (const i of this.#n.values()) {
      const { x: n, y: r, width: a, height: o } = i.div.getBoundingClientRect();
      if (t >= n && t <= n + a && e >= r && e <= r + o) return i;
    }
    return null;
  }
  disableUserSelect(t = !1) {
    this.#tt.classList.toggle("noUserSelect", t);
  }
  addShouldRescale(t) {
    this.#y.add(t);
  }
  removeShouldRescale(t) {
    this.#y.delete(t);
  }
  onScaleChanging({ scale: t }) {
    this.commitOrRemove(), this.viewParameters.realScale = t * Jt.PDF_TO_CSS_UNITS;
    for (const e of this.#y) e.onScaleChanging();
    this.#g?.onScaleChanging();
  }
  onRotationChanging({ pagesRotation: t }) {
    this.commitOrRemove(), this.viewParameters.rotation = t;
  }
  #Z({ anchorNode: t }) {
    return t.nodeType === Node.TEXT_NODE ? t.parentElement : t;
  }
  #st(t) {
    const { currentLayer: e } = this;
    if (e.hasTextLayer(t)) return e;
    for (const i of this.#n.values()) if (i.hasTextLayer(t)) return i;
    return null;
  }
  highlightSelection(t = "", e = !1) {
    const i = document.getSelection();
    if (!i || i.isCollapsed) return;
    const { anchorNode: n, anchorOffset: r, focusNode: a, focusOffset: o } = i, l = i.toString(), h = this.#Z(i).closest(".textLayer"), c = this.getSelectionBoxes(h);
    if (!c) return;
    i.empty();
    const d = this.#st(h), u = this.#x === O.NONE, p = () => {
      const f = d?.createAndAddNewEditor({
        x: 0,
        y: 0
      }, !1, {
        methodOfCreation: t,
        boxes: c,
        anchorNode: n,
        anchorOffset: r,
        focusNode: a,
        focusOffset: o,
        text: l
      });
      u && this.showAllEditors("highlight", !0, !0), e && f?.editComment();
    };
    if (u) {
      this.switchToMode(O.HIGHLIGHT, p);
      return;
    }
    p();
  }
  commentSelection(t = "") {
    this.highlightSelection(t, !0);
  }
  endCurrentEditing() {
    this.commitOrRemove(), this.currentLayer?.endDrawingSession(!1);
  }
  #at() {
    const t = document.getSelection();
    if (!t || t.isCollapsed) return;
    const e = this.#Z(t).closest(".textLayer"), i = this.getSelectionBoxes(e);
    i && (this.#T ||= new Un(this), this.#T.show(e, i, this.direction === "ltr"));
  }
  getAndRemoveDataFromAnnotationStorage(t) {
    if (!this.#l) return null;
    const e = `${Qt}${t}`, i = this.#l.getRawValue(e);
    return i && this.#l.remove(e), i;
  }
  addToAnnotationStorage(t) {
    !t.isEmpty() && this.#l && !this.#l.has(t.id) && this.#l.setValue(t.id, t);
  }
  a11yAlert(t, e = null) {
    const i = this.#et;
    i && (i.setAttribute("data-l10n-id", t), e ? i.setAttribute("data-l10n-args", JSON.stringify(e)) : i.removeAttribute("data-l10n-args"));
  }
  #ot() {
    const t = document.getSelection();
    if (!t || t.isCollapsed) {
      this.#B && (this.#T?.hide(), this.#B = null, this.#P({ hasSelectedText: !1 }));
      return;
    }
    const { anchorNode: e } = t;
    if (e === this.#B) return;
    const i = this.#Z(t).closest(".textLayer");
    if (!i) {
      this.#B && (this.#T?.hide(), this.#B = null, this.#P({ hasSelectedText: !1 }));
      return;
    }
    if (this.#T?.hide(), this.#B = e, this.#P({ hasSelectedText: !0 }), !(this.#x !== O.HIGHLIGHT && this.#x !== O.NONE) && (this.#x === O.HIGHLIGHT && this.showAllEditors("highlight", !0, !0), this.#k = this.isShiftKeyDown, !this.isShiftKeyDown)) {
      const n = this.#x === O.HIGHLIGHT ? this.#st(i) : null;
      if (n?.toggleDrawing(), this.#L) {
        const r = new AbortController(), a = this.combinedSignal(r), o = (l) => {
          l.type === "pointerup" && l.button !== 0 || (r.abort(), n?.toggleDrawing(!0), l.type === "pointerup" && this.#Q("main_toolbar"));
        };
        window.addEventListener("pointerup", o, { signal: a }), window.addEventListener("blur", o, { signal: a });
      } else
        n?.toggleDrawing(!0), this.#Q("main_toolbar");
    }
  }
  #Q(t = "") {
    this.#x === O.HIGHLIGHT ? this.highlightSelection(t) : this.#A && this.#at();
  }
  #lt() {
    document.addEventListener("selectionchange", this.#ot.bind(this), { signal: this._signal });
  }
  #ht() {
    if (this.#C) return;
    this.#C = new AbortController();
    const t = this.combinedSignal(this.#C);
    window.addEventListener("focus", this.focus.bind(this), { signal: t }), window.addEventListener("blur", this.blur.bind(this), { signal: t });
  }
  #ct() {
    this.#C?.abort(), this.#C = null;
  }
  blur() {
    if (this.isShiftKeyDown = !1, this.#k && (this.#k = !1, this.#Q("main_toolbar")), !this.hasSelection) return;
    const { activeElement: t } = document;
    for (const e of this.#w) if (e.div.contains(t)) {
      this.#R = [e, t], e._focusEventsAllowed = !1;
      break;
    }
  }
  focus() {
    if (!this.#R) return;
    const [t, e] = this.#R;
    this.#R = null, e.addEventListener("focusin", () => {
      t._focusEventsAllowed = !0;
    }, {
      once: !0,
      signal: this._signal
    }), e.focus();
  }
  #it() {
    if (this.#F) return;
    this.#F = new AbortController();
    const t = this.combinedSignal(this.#F);
    window.addEventListener("keydown", this.keydown.bind(this), { signal: t }), window.addEventListener("keyup", this.keyup.bind(this), { signal: t });
  }
  #dt() {
    this.#F?.abort(), this.#F = null;
  }
  #ut() {
    if (this.#f) return;
    this.#f = new AbortController();
    const t = this.combinedSignal(this.#f);
    document.addEventListener("copy", this.copy.bind(this), { signal: t }), document.addEventListener("cut", this.cut.bind(this), { signal: t }), document.addEventListener("paste", this.paste.bind(this), { signal: t });
  }
  #ft() {
    this.#f?.abort(), this.#f = null;
  }
  #pt() {
    const t = this._signal;
    document.addEventListener("dragover", this.dragOver.bind(this), { signal: t }), document.addEventListener("drop", this.drop.bind(this), { signal: t });
  }
  addEditListeners() {
    this.#it(), this.setEditingState(!0);
  }
  removeEditListeners() {
    this.#dt(), this.setEditingState(!1);
  }
  dragOver(t) {
    for (const { type: e } of t.dataTransfer.items) for (const i of this.#b) if (i.isHandlingMimeForPasting(e)) {
      t.dataTransfer.dropEffect = "copy", t.preventDefault();
      return;
    }
  }
  drop(t) {
    for (const e of t.dataTransfer.items) for (const i of this.#b) if (i.isHandlingMimeForPasting(e.type)) {
      i.paste(e, this.currentLayer), t.preventDefault();
      return;
    }
  }
  copy(t) {
    if (t.preventDefault(), this.#e?.commitOrRemove(), !this.hasSelection) return;
    const e = [];
    for (const i of this.#w) {
      const n = i.serialize(!0);
      n && e.push(n);
    }
    e.length !== 0 && t.clipboardData.setData("application/pdfjs", JSON.stringify(e));
  }
  cut(t) {
    this.copy(t), this.delete();
  }
  async paste(t) {
    t.preventDefault();
    const { clipboardData: e } = t;
    for (const r of e.items) for (const a of this.#b) if (a.isHandlingMimeForPasting(r.type)) {
      a.paste(r, this.currentLayer);
      return;
    }
    let i = e.getData("application/pdfjs");
    if (!i) return;
    try {
      i = JSON.parse(i);
    } catch (r) {
      R(`paste: "${r.message}".`);
      return;
    }
    if (!Array.isArray(i)) return;
    this.unselectAll();
    const n = this.currentLayer;
    try {
      const r = [];
      for (const l of i) {
        const h = await n.deserialize(l);
        if (!h) return;
        r.push(h);
      }
      const a = () => {
        for (const l of r) this.#nt(l);
        this.#rt(r);
      }, o = () => {
        for (const l of r) l.remove();
      };
      this.addCommands({
        cmd: a,
        undo: o,
        mustExec: !0
      });
    } catch (r) {
      R(`paste: "${r.message}".`);
    }
  }
  keydown(t) {
    !this.isShiftKeyDown && t.key === "Shift" && (this.isShiftKeyDown = !0), this.#x !== O.NONE && !this.isEditorHandlingKeyboard && cs._keyboardManager.exec(this, t);
  }
  keyup(t) {
    this.isShiftKeyDown && t.key === "Shift" && (this.isShiftKeyDown = !1, this.#k && (this.#k = !1, this.#Q("main_toolbar")));
  }
  onEditingAction({ name: t }) {
    switch (t) {
      case "undo":
      case "redo":
      case "delete":
      case "selectAll":
        this[t]();
        break;
      case "highlightSelection":
        this.highlightSelection("context_menu");
        break;
      case "commentSelection":
        this.commentSelection("context_menu");
    }
  }
  updatePageIndex(t, e) {
    for (const n of this.#r.get(t) || []) n.pageIndex = e;
    const i = this.#a.get(t);
    i && (i.pageIndex = e, this.#n.set(e, i), this.#D ? i.enable() : i.disable());
  }
  startUpdatePages() {
    this.#a = new Map(this.#n), this.#n.clear();
    const t = this.#r = /* @__PURE__ */ new Map(), e = (i) => {
      t.getOrInsertComputed(i.pageIndex, Zt).push(i);
    };
    for (const i of this.#i.values()) e(i);
    for (const [i, n] of this.#l) i.startsWith(Qt) && !this.#i.has(i) && Number.isInteger(n?.pageIndex) && e(n);
  }
  endUpdatePages() {
    this.#a = null, this.#r = null;
  }
  clonePage(t, e) {
    for (const i of this.getEditors(t)) {
      const n = i.serialize(i.mode !== O.HIGHLIGHT);
      n && (n.pageIndex = e, n.id = this.getId(), n.isClone = !0, delete n.popupRef, this.#l.setValue(n.id, n));
    }
  }
  findClonesForPage(t) {
    const e = [], { pageIndex: i } = t;
    for (const [n, r] of this.#l) r.pageIndex === i && r.isClone && (this.#l.remove(n), e.push(t.deserialize(r).then((a) => {
      a && (a.isClone = !0, t.addOrRebuild(a));
    })));
    return Promise.all(e);
  }
  #P(t) {
    Object.entries(t).some(([e, i]) => this.#K[e] !== i) && (this._eventBus.dispatch("editingstateschanged", {
      source: this,
      details: Object.assign(this.#K, t)
    }), this.#x === O.HIGHLIGHT && t.hasSelectedEditor === !1 && this.#z([[N.HIGHLIGHT_FREE, !0]]));
  }
  #z(t) {
    this._eventBus.dispatch("annotationeditorparamschanged", {
      source: this,
      details: t
    });
  }
  setEditingState(t) {
    t ? (this.#ht(), this.#ut(), this.#P({
      isEditing: this.#x !== O.NONE,
      isEmpty: this.#J(),
      hasSomethingToUndo: this.#u.hasSomethingToUndo(),
      hasSomethingToRedo: this.#u.hasSomethingToRedo(),
      hasSelectedEditor: !1
    })) : (this.#ct(), this.#ft(), this.#P({ isEditing: !1 }), this.disableUserSelect(!1));
  }
  registerEditorTypes(t) {
    if (!this.#b) {
      this.#b = t;
      for (const e of this.#b) this.#z(e.defaultPropertiesToUpdate);
    }
  }
  getId() {
    return this.#I.id;
  }
  get currentLayer() {
    return this.#n.get(this.#m);
  }
  getLayer(t) {
    return this.#n.get(t);
  }
  get currentPageIndex() {
    return this.#m;
  }
  addLayer(t) {
    this.#n.set(t.pageIndex, t), this.#D ? t.enable() : t.disable();
  }
  removeLayer(t) {
    this.#n.delete(t.pageIndex);
  }
  async updateMode(t, e = null, i = !1, n = !1, r = !1, a = !1) {
    if (this.#x !== t && !(this.#H && (await this.#H.promise, !this.#H))) {
      if (this.#H = Promise.withResolvers(), this.#g?.commitOrRemove(), this.#x === O.POPUP && this.#d?.hideSidebar(), this.#d?.destroyPopup(), this.#x = t, t === O.NONE) {
        this.setEditingState(!1), this.#mt();
        for (const o of this.#i.values()) o.hideStandaloneCommentButton();
        this._editorUndoBar?.hide(), this.toggleComment(null), this.#H.resolve();
        return;
      }
      for (const o of this.#i.values()) o.addStandaloneCommentButton();
      t === O.SIGNATURE && await this.#$?.loadSignatures(), i && ht.clearPointerType(), this.setEditingState(!0), await this.#gt(), this.unselectAll();
      for (const o of this.#n.values()) o.updateMode(t);
      if (t === O.POPUP) {
        this.#s ||= await this.#Y.getAnnotationsByType(new Set(this.#b.map((h) => h._editorType)));
        const o = /* @__PURE__ */ new Set(), l = [];
        for (const h of this.#i.values()) {
          const { annotationElementId: c, hasComment: d, deleted: u } = h;
          c && o.add(c), d && !u && l.push(h.getData());
        }
        for (const h of this.#s) {
          const { id: c, popupRef: d, contentsObj: u } = h;
          d && u?.str && !o.has(c) && !this.#c.has(c) && l.push(h);
        }
        this.#d?.showSidebar(l);
      }
      if (!e) {
        n && this.addNewEditorFromKeyboard(), this.#H.resolve();
        return;
      }
      for (const o of this.#i.values()) o.uid === e ? (this.setSelected(o), a ? o.editComment() : r ? o.enterInEditMode() : o.focus()) : o.unselect();
      this.#H.resolve();
    }
  }
  addNewEditorFromKeyboard() {
    this.currentLayer.canCreateNewEmptyEditor() && this.currentLayer.addNewEditor();
  }
  updateToolbar(t) {
    t.mode !== this.#x && this._eventBus.dispatch("switchannotationeditormode", {
      source: this,
      ...t
    });
  }
  updateParams(t, e) {
    if (this.#b) {
      switch (t) {
        case N.CREATE:
          this.currentLayer.addNewEditor(e);
          return;
        case N.HIGHLIGHT_SHOW_ALL:
          this._eventBus.dispatch("reporttelemetry", {
            source: this,
            details: {
              type: "editing",
              data: {
                type: "highlight",
                action: "toggle_visibility"
              }
            }
          }), (this.#q ||= /* @__PURE__ */ new Map()).set(t, e), this.showAllEditors("highlight", e);
      }
      if (this.hasSelection) for (const i of this.#w) i.updateParams(t, e);
      else for (const i of this.#b) i.updateDefaultParams(t, e);
    }
  }
  showAllEditors(t, e, i = !1) {
    for (const n of this.#i.values()) n.editorType === t && n.show(e);
    (this.#q?.get(N.HIGHLIGHT_SHOW_ALL) ?? !0) !== e && this.#z([[N.HIGHLIGHT_SHOW_ALL, e]]);
  }
  enableWaiting(t = !1) {
    if (this.#U !== t) {
      this.#U = t;
      for (const e of this.#n.values())
        t ? e.disableClick() : e.enableClick(), e.div.classList.toggle("waiting", t);
    }
  }
  async #gt() {
    if (!this.#D) {
      this.#D = !0;
      const t = [];
      for (const e of this.#n.values()) t.push(e.enable());
      await Promise.all(t);
      for (const e of this.#i.values()) e.enable();
    }
  }
  #mt() {
    if (this.unselectAll(), this.#D) {
      this.#D = !1;
      for (const t of this.#n.values()) t.disable();
      for (const t of this.#i.values()) t.disable();
    }
  }
  *getEditors(t) {
    for (const e of this.#i.values()) e.pageIndex === t && (yield e);
  }
  getEditor(t) {
    return this.#i.get(t);
  }
  addEditor(t) {
    this.#i.set(t.id, t);
  }
  removeEditor(t) {
    t.div.contains(document.activeElement) && (this.#_ && clearTimeout(this.#_), this.#_ = setTimeout(() => {
      this.focusMainContainer(), this.#_ = null;
    }, 0)), this.#i.delete(t.id), t.annotationElementId && this.#N?.delete(t.annotationElementId), this.unselect(t), (!t.annotationElementId || !this.#c.has(t.annotationElementId)) && this.#l?.remove(t.id);
  }
  addDeletedAnnotationElement(t) {
    this.#c.add(t.annotationElementId), this.addChangedExistingAnnotation(t), t.deleted = !0;
  }
  isDeletedAnnotationElement(t) {
    return this.#c.has(t);
  }
  removeDeletedAnnotationElement(t) {
    this.#c.delete(t.annotationElementId), this.removeChangedExistingAnnotation(t), t.deleted = !1;
  }
  #nt(t) {
    const e = this.#n.get(t.pageIndex);
    e ? e.addOrRebuild(t) : (this.addEditor(t), this.addToAnnotationStorage(t));
  }
  setActiveEditor(t) {
    this.#e !== t && (this.#e = t, t && this.#z(t.propertiesToUpdate));
  }
  get #bt() {
    let t = null;
    for (t of this.#w) ;
    return t;
  }
  updateUI(t) {
    this.#bt === t && this.#z(t.propertiesToUpdate);
  }
  updateUIForDefaultProperties(t) {
    this.#z(t.defaultPropertiesToUpdate);
  }
  toggleSelected(t) {
    if (this.#w.has(t)) {
      this.#w.delete(t), t.unselect(), this.#P({ hasSelectedEditor: this.hasSelection });
      return;
    }
    this.#w.add(t), t.select(), this.#z(t.propertiesToUpdate), this.#P({ hasSelectedEditor: !0 });
  }
  setSelected(t) {
    this.updateToolbar({
      mode: t.mode,
      editId: t.uid
    }), this.#g?.commitOrRemove();
    for (const e of this.#w) e !== t && e.unselect();
    this.#d?.destroyPopup(), this.#w.clear(), this.#w.add(t), t.select(), this.#z(t.propertiesToUpdate), this.#P({ hasSelectedEditor: !0 });
  }
  get firstSelectedEditor() {
    return this.#w.values().next().value;
  }
  unselect(t) {
    t.unselect(), this.#w.delete(t), this.#P({ hasSelectedEditor: this.hasSelection });
  }
  get hasSelection() {
    return this.#w.size !== 0;
  }
  get isEnterHandled() {
    return this.#w.size === 1 && this.firstSelectedEditor.isEnterHandled;
  }
  undo() {
    this.#u.undo(), this.#P({
      hasSomethingToUndo: this.#u.hasSomethingToUndo(),
      hasSomethingToRedo: !0,
      isEmpty: this.#J()
    }), this._editorUndoBar?.hide();
  }
  redo() {
    this.#u.redo(), this.#P({
      hasSomethingToUndo: !0,
      hasSomethingToRedo: this.#u.hasSomethingToRedo(),
      isEmpty: this.#J()
    });
  }
  addCommands(t) {
    this.#u.add(t), this.#P({
      hasSomethingToUndo: !0,
      hasSomethingToRedo: !1,
      isEmpty: this.#J()
    });
  }
  cleanUndoStack(t) {
    this.#u.cleanType(t);
  }
  #J() {
    if (this.#i.size === 0) return !0;
    if (this.#i.size === 1) for (const t of this.#i.values()) return t.isEmpty();
    return !1;
  }
  delete() {
    this.commitOrRemove();
    const t = this.currentLayer?.endDrawingSession(!0);
    if (!this.hasSelection && !t) return;
    const e = t ? [t] : [...this.#w], i = () => {
      this._editorUndoBar?.show(n, e.length === 1 ? e[0].editorType : e.length);
      for (const r of e) r.remove();
    }, n = () => {
      for (const r of e) this.#nt(r);
    };
    this.addCommands({
      cmd: i,
      undo: n,
      mustExec: !0
    });
  }
  commitOrRemove() {
    this.#e?.commitOrRemove();
  }
  hasSomethingToControl() {
    return this.#e || this.hasSelection;
  }
  #rt(t) {
    for (const e of this.#w) e.unselect();
    this.#w.clear();
    for (const e of t)
      e.isEmpty() || (this.#w.add(e), e.select());
    this.#P({ hasSelectedEditor: this.hasSelection });
  }
  selectAll() {
    for (const t of this.#w) t.commit();
    this.#rt(this.#i.values());
  }
  unselectAll() {
    if (!(this.#e && (this.#e.commitOrRemove(), this.#x !== O.NONE)) && !this.#g?.commitOrRemove() && (this.#d?.destroyPopup(), !!this.hasSelection)) {
      for (const t of this.#w) t.unselect();
      this.#w.clear(), this.#P({ hasSelectedEditor: !1 });
    }
  }
  translateSelectedEditors(t, e, i = !1) {
    if (i || this.commitOrRemove(), !this.hasSelection) return;
    this.#O[0] += t, this.#O[1] += e;
    const [n, r] = this.#O, a = [...this.#w], o = 1e3;
    this.#W && clearTimeout(this.#W), this.#W = setTimeout(() => {
      this.#W = null, this.#O[0] = this.#O[1] = 0, this.addCommands({
        cmd: () => {
          for (const l of a) this.#i.has(l.id) && (l.translateInPage(n, r), l.translationDone());
        },
        undo: () => {
          for (const l of a) this.#i.has(l.id) && (l.translateInPage(-n, -r), l.translationDone());
        },
        mustExec: !1
      });
    }, o);
    for (const l of a)
      l.translateInPage(t, e), l.translationDone();
  }
  setUpDragSession() {
    if (this.hasSelection) {
      this.disableUserSelect(!0), this.#p = /* @__PURE__ */ new Map();
      for (const t of this.#w) this.#p.set(t, {
        savedX: t.x,
        savedY: t.y,
        savedPageIndex: t.pageIndex,
        newX: 0,
        newY: 0,
        newPageIndex: -1
      });
    }
  }
  endDragSession() {
    if (!this.#p) return !1;
    this.disableUserSelect(!1);
    const t = this.#p;
    this.#p = null;
    let e = !1;
    for (const [{ x: n, y: r, pageIndex: a }, o] of t)
      o.newX = n, o.newY = r, o.newPageIndex = a, e ||= n !== o.savedX || r !== o.savedY || a !== o.savedPageIndex;
    if (!e) return !1;
    const i = (n, r, a, o) => {
      if (this.#i.has(n.id)) {
        const l = this.#n.get(o);
        l ? n._setParentAndPosition(l, r, a) : (n.pageIndex = o, n.x = r, n.y = a);
      }
    };
    return this.addCommands({
      cmd: () => {
        for (const [n, { newX: r, newY: a, newPageIndex: o }] of t) i(n, r, a, o);
      },
      undo: () => {
        for (const [n, { savedX: r, savedY: a, savedPageIndex: o }] of t) i(n, r, a, o);
      },
      mustExec: !0
    }), !0;
  }
  dragSelectedEditors(t, e) {
    if (this.#p)
      for (const i of this.#p.keys()) i.drag(t, e);
  }
  rebuild(t) {
    if (t.parent === null) {
      const e = this.getLayer(t.pageIndex);
      e ? (e.changeParent(t), e.addOrRebuild(t)) : (this.addEditor(t), this.addToAnnotationStorage(t), t.rebuild());
    } else t.parent.addOrRebuild(t);
  }
  get isEditorHandlingKeyboard() {
    return this.getActive()?.shouldGetKeyboardEvents() || this.#w.size === 1 && this.firstSelectedEditor.shouldGetKeyboardEvents();
  }
  isActive(t) {
    return this.#e === t;
  }
  getActive() {
    return this.#e;
  }
  getMode() {
    return this.#x;
  }
  isEditingMode() {
    return this.#x !== O.NONE;
  }
  get imageManager() {
    return P(this, "imageManager", new $n());
  }
  getSelectionBoxes(t) {
    if (!t) return null;
    const e = document.getSelection();
    for (let h = 0, c = e.rangeCount; h < c; h++) if (!t.contains(e.getRangeAt(h).commonAncestorContainer)) return null;
    const { x: i, y: n, width: r, height: a } = t.getBoundingClientRect();
    let o;
    switch (t.getAttribute("data-main-rotation")) {
      case "90":
        o = (h, c, d, u) => ({
          x: (c - n) / a,
          y: 1 - (h + d - i) / r,
          width: u / a,
          height: d / r
        });
        break;
      case "180":
        o = (h, c, d, u) => ({
          x: 1 - (h + d - i) / r,
          y: 1 - (c + u - n) / a,
          width: d / r,
          height: u / a
        });
        break;
      case "270":
        o = (h, c, d, u) => ({
          x: 1 - (c + u - n) / a,
          y: (h - i) / r,
          width: u / a,
          height: d / r
        });
        break;
      default:
        o = (h, c, d, u) => ({
          x: (h - i) / r,
          y: (c - n) / a,
          width: d / r,
          height: u / a
        });
    }
    const l = [];
    for (let h = 0, c = e.rangeCount; h < c; h++) {
      const d = e.getRangeAt(h);
      if (!d.collapsed)
        for (const { x: u, y: p, width: f, height: m } of d.getClientRects())
          f === 0 || m === 0 || l.push(o(u, p, f, m));
    }
    return l.length === 0 ? null : l;
  }
  addChangedExistingAnnotation({ annotationElementId: t, id: e }) {
    (this.#h ||= /* @__PURE__ */ new Map()).set(t, e);
  }
  removeChangedExistingAnnotation({ annotationElementId: t }) {
    this.#h?.delete(t);
  }
  renderAnnotationElement(t) {
    const e = this.#h?.get(t.data.id);
    if (!e) return;
    const i = this.#l.getRawValue(e);
    i && (this.#x === O.NONE && !i.hasBeenModified || i.renderAnnotationElement(t));
  }
  setMissingCanvas(t, e, i) {
    const n = this.#N?.get(t);
    n && (n.setCanvas(e, i), this.#N.delete(t));
  }
  addMissingCanvas(t, e) {
    (this.#N ||= /* @__PURE__ */ new Map()).set(t, e);
  }
}, zs = class Mt {
  #t = null;
  #e = !1;
  #s = null;
  #i = null;
  #n = null;
  #a = null;
  #r = !1;
  #o = null;
  #l = null;
  #h = null;
  #u = null;
  #d = !1;
  static #f = null;
  static _l10n = null;
  constructor(t) {
    this.#l = t, this.#d = t._uiManager.useNewAltTextFlow, Mt.#f ||= Object.freeze({
      added: "pdfjs-editor-new-alt-text-added-button",
      "added-label": "pdfjs-editor-new-alt-text-added-button-label",
      missing: "pdfjs-editor-new-alt-text-missing-button",
      "missing-label": "pdfjs-editor-new-alt-text-missing-button-label",
      review: "pdfjs-editor-new-alt-text-to-review-button",
      "review-label": "pdfjs-editor-new-alt-text-to-review-button-label"
    });
  }
  static initialize(t) {
    Mt._l10n ??= t;
  }
  async render() {
    const t = this.#s = document.createElement("button");
    t.className = "altText", t.tabIndex = "0";
    const e = this.#i = document.createElement("span");
    t.append(e), this.#d ? (t.classList.add("new"), t.setAttribute("data-l10n-id", Mt.#f.missing), e.setAttribute("data-l10n-id", Mt.#f["missing-label"])) : (t.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-button"), e.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-button-label"));
    const i = this.#l._uiManager._signal;
    t.addEventListener("contextmenu", At, { signal: i }), t.addEventListener("pointerdown", (r) => r.stopPropagation(), { signal: i });
    const n = (r) => {
      r.preventDefault(), this.#l._uiManager.editAltText(this.#l), this.#d && this.#l._reportTelemetry({
        action: "pdfjs.image.alt_text.image_status_label_clicked",
        data: { label: this.#g }
      });
    };
    return t.addEventListener("click", n, {
      capture: !0,
      signal: i
    }), t.addEventListener("keydown", (r) => {
      r.target === t && r.key === "Enter" && (this.#r = !0, n(r));
    }, { signal: i }), await this.#m(), t;
  }
  get #g() {
    return this.#t && "added" || this.#t === null && this.guessedText && "review" || "missing";
  }
  finish() {
    this.#s && (this.#s.focus({ focusVisible: this.#r }), this.#r = !1);
  }
  isEmpty() {
    return this.#d ? this.#t === null : !this.#t && !this.#e;
  }
  hasData() {
    return this.#d ? this.#t !== null || !!this.#h : this.isEmpty();
  }
  get guessedText() {
    return this.#h;
  }
  async setGuessedText(t) {
    this.#t === null && (this.#h = t, this.#u = await Mt._l10n.get("pdfjs-editor-new-alt-text-generated-alt-text-with-disclaimer", { generatedAltText: t }), this.#m());
  }
  toggleAltTextBadge(t = !1) {
    if (!this.#d || this.#t) {
      this.#o?.remove(), this.#o = null;
      return;
    }
    if (!this.#o) {
      const e = this.#o = document.createElement("div");
      e.className = "noAltTextBadge", this.#l.div.append(e);
    }
    this.#o.classList.toggle("hidden", !t);
  }
  serialize(t) {
    let e = this.#t;
    return !t && this.#h === e && (e = this.#u), {
      altText: e,
      decorative: this.#e,
      guessedText: this.#h,
      textWithDisclaimer: this.#u
    };
  }
  get data() {
    return {
      altText: this.#t,
      decorative: this.#e
    };
  }
  set data({ altText: t, decorative: e, guessedText: i, textWithDisclaimer: n, cancel: r = !1 }) {
    i && (this.#h = i, this.#u = n), !(this.#t === t && this.#e === e) && (r || (this.#t = t, this.#e = e), this.#m());
  }
  toggle(t = !1) {
    this.#s && (!t && this.#a && (clearTimeout(this.#a), this.#a = null), this.#s.disabled = !t);
  }
  shown() {
    this.#l._reportTelemetry({
      action: "pdfjs.image.alt_text.image_status_label_displayed",
      data: { label: this.#g }
    });
  }
  destroy() {
    this.#s?.remove(), this.#s = null, this.#i = null, this.#n = null, this.#o?.remove(), this.#o = null;
  }
  async #m() {
    const t = this.#s;
    if (!t) return;
    if (this.#d) {
      if (t.classList.toggle("done", !!this.#t), t.setAttribute("data-l10n-id", Mt.#f[this.#g]), this.#i?.setAttribute("data-l10n-id", Mt.#f[`${this.#g}-label`]), !this.#t) {
        this.#n?.remove();
        return;
      }
    } else {
      if (!this.#t && !this.#e) {
        t.classList.remove("done"), this.#n?.remove();
        return;
      }
      t.classList.add("done"), t.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-edit-button");
    }
    let e = this.#n;
    if (!e) {
      this.#n = e = document.createElement("span"), e.className = "tooltip", e.setAttribute("role", "tooltip"), e.id = `alt-text-tooltip-${this.#l.id}`;
      const i = 100, n = this.#l._uiManager._signal;
      n.addEventListener("abort", () => {
        clearTimeout(this.#a), this.#a = null;
      }, { once: !0 }), t.addEventListener("mouseenter", () => {
        this.#a = setTimeout(() => {
          this.#a = null, this.#n.classList.add("show"), this.#l._reportTelemetry({ action: "alt_text_tooltip" });
        }, i);
      }, { signal: n }), t.addEventListener("mouseleave", () => {
        this.#a && (clearTimeout(this.#a), this.#a = null), this.#n?.classList.remove("show");
      }, { signal: n });
    }
    this.#e ? e.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-decorative-tooltip") : (e.removeAttribute("data-l10n-id"), e.textContent = this.#t), e.parentNode || t.append(e), this.#l.getElementForAltText()?.setAttribute("aria-describedby", e.id);
  }
}, fe = class {
  #t = null;
  #e = null;
  #s = !1;
  #i = null;
  #n = null;
  #a = null;
  #r = null;
  #o = null;
  #l = !1;
  #h = null;
  constructor(s) {
    this.#i = s;
  }
  renderForToolbar() {
    const s = this.#e = document.createElement("button");
    return s.className = "comment", this.#u(s, !1);
  }
  renderForStandalone() {
    const s = this.#t = document.createElement("button");
    s.className = "annotationCommentButton";
    const t = this.#i.commentButtonPosition;
    if (t) {
      const { style: e } = s;
      e.insetInlineEnd = `calc(${100 * (this.#i._uiManager.direction === "ltr" ? 1 - t[0] : t[0])}% - var(--comment-button-dim))`, e.top = `calc(${100 * t[1]}% - var(--comment-button-dim))`;
      const i = this.#i.commentButtonColor;
      i && (e.backgroundColor = i);
    }
    return this.#u(s, !0);
  }
  focusButton() {
    setTimeout(() => {
      (this.#t ?? this.#e)?.focus();
    }, 0);
  }
  onUpdatedColor() {
    if (!this.#t) return;
    const s = this.#i.commentButtonColor;
    s && (this.#t.style.backgroundColor = s), this.#i._uiManager.updatePopupColor(this.#i);
  }
  get commentButtonWidth() {
    return (this.#t?.getBoundingClientRect().width ?? 0) / this.#i.parent.boundingClientRect.width;
  }
  get commentPopupPositionInLayer() {
    if (this.#h) return this.#h;
    if (!this.#t) return null;
    const { x: s, y: t, height: e } = this.#t.getBoundingClientRect(), { x: i, y: n, width: r, height: a } = this.#i.parent.boundingClientRect;
    return [(s - i) / r, (t + e - n) / a];
  }
  set commentPopupPositionInLayer(s) {
    this.#h = s;
  }
  hasDefaultPopupPosition() {
    return this.#h === null;
  }
  removeStandaloneCommentButton() {
    this.#t?.remove(), this.#t = null;
  }
  removeToolbarCommentButton() {
    this.#e?.remove(), this.#e = null;
  }
  setCommentButtonStates({ selected: s, hasPopup: t }) {
    this.#t && (this.#t.classList.toggle("selected", s), this.#t.ariaExpanded = t);
  }
  #u(s, t) {
    if (!this.#i._uiManager.hasCommentManager()) return null;
    s.tabIndex = "0", s.ariaHasPopup = "dialog", t ? (s.ariaControls = "commentPopup", s.setAttribute("data-l10n-id", "pdfjs-show-comment-button")) : (s.ariaControlsElements = [this.#i._uiManager.getCommentDialogElement()], s.setAttribute("data-l10n-id", "pdfjs-editor-add-comment-button"));
    const e = this.#i._uiManager._signal;
    if (!(e instanceof AbortSignal) || e.aborted) return s;
    s.addEventListener("contextmenu", At, { signal: e }), t && (s.addEventListener("focusin", (n) => {
      this.#i._focusEventsAllowed = !1, et(n);
    }, {
      capture: !0,
      signal: e
    }), s.addEventListener("focusout", (n) => {
      this.#i._focusEventsAllowed = !0, et(n);
    }, {
      capture: !0,
      signal: e
    })), s.addEventListener("pointerdown", (n) => n.stopPropagation(), { signal: e });
    const i = (n) => {
      n.preventDefault(), s === this.#e ? this.edit() : this.#i.toggleComment(!0);
    };
    return s.addEventListener("click", i, {
      capture: !0,
      signal: e
    }), s.addEventListener("keydown", (n) => {
      n.target === s && n.key === "Enter" && (this.#s = !0, i(n));
    }, { signal: e }), s.addEventListener("pointerenter", () => {
      this.#i.toggleComment(!1, !0);
    }, { signal: e }), s.addEventListener("pointerleave", () => {
      this.#i.toggleComment(!1, !1);
    }, { signal: e }), s;
  }
  edit(s) {
    const t = this.commentPopupPositionInLayer;
    let e, i;
    if (t) [e, i] = t;
    else {
      [e, i] = this.#i.commentButtonPosition;
      const { width: h, height: c, x: d, y: u } = this.#i;
      e = d + e * h, i = u + i * c;
    }
    const n = this.#i.parent.boundingClientRect, { x: r, y: a, width: o, height: l } = n;
    this.#i._uiManager.editComment(this.#i, r + e * o, a + i * l, {
      ...s,
      parentDimensions: n
    });
  }
  finish() {
    this.#e && (this.#e.focus({ focusVisible: this.#s }), this.#s = !1);
  }
  isDeleted() {
    return this.#l || this.#r === "";
  }
  isEmpty() {
    return this.#r === null;
  }
  hasBeenEdited() {
    return this.isDeleted() || this.#r !== this.#n;
  }
  serialize() {
    return this.data;
  }
  get data() {
    return {
      text: this.#r,
      richText: this.#a,
      date: this.#o,
      deleted: this.isDeleted()
    };
  }
  set data(s) {
    if (s !== this.#r && (this.#a = null), s === null) {
      this.#r = "", this.#l = !0;
      return;
    }
    this.#r = s, this.#o = /* @__PURE__ */ new Date(), this.#l = !1;
  }
  restoreData({ text: s, richText: t, date: e }) {
    this.#r = s, this.#a = t, this.#o = e, this.#l = !1;
  }
  setInitialText(s, t = null) {
    this.#n = s, this.data = s, this.#o = null, this.#a = t;
  }
  shown() {
  }
  destroy() {
    this.#e?.remove(), this.#e = null, this.#t?.remove(), this.#t = null, this.#r = "", this.#a = null, this.#o = null, this.#i = null, this.#s = !1, this.#l = !1;
  }
};
function js(s) {
  s.preventDefault();
}
var Vs = 1e-4;
function Ye(s) {
  return s.cancelable ? (et(s), !0) : (s.stopPropagation(), !1);
}
var ki = class {
  #t;
  #e = !1;
  #s = null;
  #i;
  #n;
  #a;
  #r;
  #o;
  #l = !1;
  #h = null;
  #u;
  #d = /* @__PURE__ */ new Set();
  #f = null;
  #g;
  #m = null;
  #c = 0;
  constructor({ container: s, isPinchingDisabled: t = null, isPinchingStopped: e = null, onPinchStart: i = null, onPinching: n = null, onPinchEnd: r = null, onPanning: a = null, signal: o }) {
    this.#t = s, this.#s = e, this.#i = t, this.#n = i, this.#a = n, this.#r = r, this.#o = a, this.#g = new AbortController(), this.#u = AbortSignal.any([o, this.#g.signal]), s.addEventListener("touchstart", this.#p.bind(this), {
      passive: !1,
      signal: this.#u
    });
  }
  get MIN_TOUCH_DISTANCE_TO_PINCH() {
    return 35 / Ft.pixelRatio;
  }
  get MIN_TOUCH_DISTANCE_TO_SCALE() {
    return 4 / Ft.pixelRatio;
  }
  #p(s) {
    if (this.#i?.()) return;
    this.#y(s);
    const t = this.#d;
    for (const { identifier: e } of s.changedTouches) t.add(e);
    if (t.size === 1) {
      this.#b();
      return;
    }
    if (!this.#m) {
      this.#m = new AbortController();
      const e = AbortSignal.any([this.#u, this.#m.signal]), i = this.#t, n = {
        signal: e,
        capture: !1,
        passive: !1
      };
      i.addEventListener("touchmove", this.#E.bind(this), n);
      const r = this.#S.bind(this);
      i.addEventListener("touchend", r, n), i.addEventListener("touchcancel", r, n), n.capture = !0, i.addEventListener("pointerdown", et, n), i.addEventListener("pointermove", et, n), i.addEventListener("pointercancel", js, n), i.addEventListener("pointerup", js, n), this.#n?.();
    }
    this.#l = Ye(s), this.#v(s);
  }
  #b() {
    if (this.#h) return;
    const s = this.#h = new AbortController(), t = AbortSignal.any([this.#u, s.signal]), e = this.#t, i = {
      capture: !0,
      signal: t,
      passive: !1
    }, n = (r) => {
      r.pointerType === "touch" && (this.#h?.abort(), this.#h = null);
    };
    e.addEventListener("pointerdown", (r) => {
      r.pointerType === "touch" && (et(r), n(r));
    }, i), e.addEventListener("pointerup", n, i), e.addEventListener("pointercancel", n, i);
  }
  #y(s) {
    const t = this.#d;
    if (t.size === 0) return;
    const e = this.#d = /* @__PURE__ */ new Set();
    for (const { identifier: i } of s.touches) t.has(i) && e.add(i);
  }
  #A(s) {
    const t = this.#d, e = [];
    for (const i of s.touches) t.has(i.identifier) && e.push(i);
    return e;
  }
  #v(s) {
    const t = this.#A(s);
    if (t.length !== 2 || this.#s?.()) {
      this.#f = null;
      return;
    }
    const [e, i] = t;
    this.#f = {
      touch0X: e.screenX,
      touch0Y: e.screenY,
      touch1X: i.screenX,
      touch1Y: i.screenY,
      panX: (e.clientX + i.clientX) / 2,
      panY: (e.clientY + i.clientY) / 2,
      screenPanX: (e.screenX + i.screenX) / 2,
      screenPanY: (e.screenY + i.screenY) / 2
    };
  }
  #E(s) {
    if (!this.#f) return;
    const t = this.#A(s);
    if (t.length !== 2) return;
    const e = this.#l;
    if (this.#l = Ye(s), !this.#l) return;
    if (!e) {
      this.#v(s);
      return;
    }
    const [i, n] = t, { screenX: r, screenY: a } = i, { screenX: o, screenY: l } = n, h = this.#f, { touch0X: c, touch0Y: d, touch1X: u, touch1Y: p, panX: f, panY: m } = h, g = u - c, b = p - d, y = o - r, A = l - a, w = (i.clientX + n.clientX) / 2, v = (i.clientY + n.clientY) / 2;
    h.panX = w, h.panY = v;
    const S = w - f, E = v - m, C = (r + o) / 2, x = (a + l) / 2, M = Math.hypot(C - h.screenPanX, x - h.screenPanY);
    h.screenPanX = C, h.screenPanY = x;
    const k = Math.hypot(y, A), I = Math.hypot(g, b), B = this.#e ? this.MIN_TOUCH_DISTANCE_TO_SCALE : this.MIN_TOUCH_DISTANCE_TO_PINCH + 2 * M;
    if (k < Vs || I < Vs || Math.abs(I - k) <= B) {
      (S || E) && this.#o?.(S, E);
      return;
    }
    h.touch0X = r, h.touch0Y = a, h.touch1X = o, h.touch1Y = l;
    const G = Math.sign(k - I);
    if (!this.#e) {
      this.#e = !0, this.#c = G, (S || E) && this.#o?.(S, E);
      return;
    }
    if (this.#c) {
      const K = this.#c;
      if (this.#c = 0, G !== K && Math.abs(k - I) <= 2 * M) {
        this.#e = !1, (S || E) && this.#o?.(S, E);
        return;
      }
    }
    this.#a?.([f, m], I, k, S, E);
  }
  #S(s) {
    if (this.#y(s), this.#d.size >= 2) {
      this.#v(s);
      return;
    }
    const t = !!this.#f;
    this.#_(), this.#d.size === 1 && this.#b(), t && Ye(s);
  }
  #_() {
    this.#f = null, this.#e = !1, this.#c = 0, this.#l = !1, this.#m && (this.#m.abort(), this.#m = null, this.#r?.());
  }
  destroy() {
    this.#_(), this.#d.clear(), this.#g?.abort(), this.#g = null, this.#h?.abort(), this.#h = null;
  }
}, V = class $ {
  #t = null;
  #e = null;
  #s = null;
  #i = null;
  #n = null;
  #a = !1;
  #r = null;
  #o = "";
  #l = null;
  #h = null;
  #u = null;
  #d = null;
  #f = null;
  #g = "";
  #m = !1;
  #c = null;
  #p = !1;
  #b = !1;
  #y = !1;
  #A = null;
  #v = 0;
  #E = 0;
  #S = null;
  #_ = null;
  isSelected = !1;
  _isCopy = !1;
  _editToolbar = null;
  _initialOptions = /* @__PURE__ */ Object.create(null);
  _initialData = null;
  _isVisible = !0;
  _uiManager = null;
  _focusEventsAllowed = !0;
  static _l10n = null;
  static _l10nAlert = null;
  static _l10nResizer = null;
  #C = !1;
  #M = $._zIndex++;
  static _borderLineWidth = -1;
  static _colorManager = new jn();
  static _zIndex = 1;
  static _telemetryTimeout = 1e3;
  static get _resizerKeyboardManager() {
    const t = $.prototype._resizeWithKeyboard, e = oe.TRANSLATE_SMALL, i = oe.TRANSLATE_BIG;
    return P(this, "_resizerKeyboardManager", new de([
      [
        ["ArrowLeft"],
        t,
        { args: [-e, 0] }
      ],
      [
        ["ctrl+ArrowLeft", "mac+shift+ArrowLeft"],
        t,
        { args: [-i, 0] }
      ],
      [
        ["ArrowRight"],
        t,
        { args: [e, 0] }
      ],
      [
        ["ctrl+ArrowRight", "mac+shift+ArrowRight"],
        t,
        { args: [i, 0] }
      ],
      [
        ["ArrowUp"],
        t,
        { args: [0, -e] }
      ],
      [
        ["ctrl+ArrowUp", "mac+shift+ArrowUp"],
        t,
        { args: [0, -i] }
      ],
      [
        ["ArrowDown"],
        t,
        { args: [0, e] }
      ],
      [
        ["ctrl+ArrowDown", "mac+shift+ArrowDown"],
        t,
        { args: [0, i] }
      ],
      [["Escape"], $.prototype._stopResizingWithKeyboard]
    ]));
  }
  constructor(t) {
    this.parent = t.parent, this.id = t.id, this.width = this.height = null, this.pageIndex = t.parent.pageIndex, this.name = t.name, this.div = null, this._uiManager = t.uiManager, this.annotationElementId = null, this._willKeepAspectRatio = !1, this._initialOptions.isCentered = t.isCentered, this._structTreeParentId = null, this.annotationElementId = t.annotationElementId || null, this.creationDate = t.creationDate || /* @__PURE__ */ new Date(), this.modificationDate = t.modificationDate || null, this.canAddComment = !0;
    const { rotation: e, rawDims: { pageWidth: i, pageHeight: n, pageX: r, pageY: a } } = this.parent.viewport;
    this.rotation = e, this.pageRotation = (360 + e - this._uiManager.viewParameters.rotation) % 360, this.pageDimensions = [i, n], this.pageTranslation = [r, a];
    const [o, l] = this.parentDimensions;
    this.x = t.x / o, this.y = t.y / l, this.isAttachedToDOM = !1, this.deleted = !1;
  }
  updatePageIndex(t) {
    this.pageIndex = t;
  }
  get editorType() {
    return Object.getPrototypeOf(this).constructor._type;
  }
  get mode() {
    return Object.getPrototypeOf(this).constructor._editorType;
  }
  static get isDrawer() {
    return !1;
  }
  static get _defaultLineColor() {
    return P(this, "_defaultLineColor", this._colorManager.getHexCode("CanvasText"));
  }
  static deleteAnnotationElement(t) {
    const e = new Vn({
      id: t._uiManager.getId(),
      parent: t.parent,
      uiManager: t._uiManager
    });
    e.annotationElementId = t.annotationElementId, e.deleted = !0, e._uiManager.addToAnnotationStorage(e);
  }
  static initialize(t, e) {
    if ($._l10n ??= t, $._l10nAlert ??= Object.freeze({
      highlight: "pdfjs-editor-highlight-added-alert",
      freetext: "pdfjs-editor-freetext-added-alert",
      ink: "pdfjs-editor-ink-added-alert",
      stamp: "pdfjs-editor-stamp-added-alert",
      signature: "pdfjs-editor-signature-added-alert"
    }), $._l10nResizer ??= Object.freeze({
      topLeft: "pdfjs-editor-resizer-top-left",
      topMiddle: "pdfjs-editor-resizer-top-middle",
      topRight: "pdfjs-editor-resizer-top-right",
      middleRight: "pdfjs-editor-resizer-middle-right",
      bottomRight: "pdfjs-editor-resizer-bottom-right",
      bottomMiddle: "pdfjs-editor-resizer-bottom-middle",
      bottomLeft: "pdfjs-editor-resizer-bottom-left",
      middleLeft: "pdfjs-editor-resizer-middle-left"
    }), $._borderLineWidth !== -1) return;
    const i = getComputedStyle(document.documentElement);
    $._borderLineWidth = parseFloat(i.getPropertyValue("--outline-width")) || 0;
  }
  static updateDefaultParams(t, e) {
  }
  static get defaultPropertiesToUpdate() {
    return [];
  }
  static isHandlingMimeForPasting(t) {
    return !1;
  }
  static paste(t, e) {
    U("Not implemented");
  }
  get propertiesToUpdate() {
    return [];
  }
  get _isDraggable() {
    return this.#C;
  }
  set _isDraggable(t) {
    this.#C = t, this.div?.classList.toggle("draggable", t);
  }
  get uid() {
    return this.annotationElementId || this.id;
  }
  get isEnterHandled() {
    return !0;
  }
  center() {
    const [t, e] = this.pageDimensions;
    switch (this.parentRotation) {
      case 90:
        this.x -= this.height * e / (t * 2), this.y += this.width * t / (e * 2);
        break;
      case 180:
        this.x += this.width / 2, this.y += this.height / 2;
        break;
      case 270:
        this.x += this.height * e / (t * 2), this.y -= this.width * t / (e * 2);
        break;
      default:
        this.x -= this.width / 2, this.y -= this.height / 2;
    }
    this.fixAndSetPosition();
  }
  addCommands(t) {
    this._uiManager.addCommands(t);
  }
  get currentLayer() {
    return this._uiManager.currentLayer;
  }
  setInBackground() {
    this.div.style.zIndex = 0;
  }
  setInForeground() {
    this.div.style.zIndex = this.#M;
  }
  setParent(t) {
    t !== null ? (this.pageIndex = t.pageIndex, this.pageDimensions = t.pageDimensions) : (this.#O(), this.#d?.remove(), this.#d = null), this.parent = t;
  }
  focusin(t) {
    this._focusEventsAllowed && (this.#m ? this.#m = !1 : this.parent.setSelected(this));
  }
  focusout(t) {
    this._focusEventsAllowed && this.isAttachedToDOM && (t.relatedTarget?.closest(`#${this.id}`) || (t.preventDefault(), this.parent?.isMultipleSelection || this.commitOrRemove()));
  }
  commitOrRemove() {
    this.isEmpty() ? this.remove() : this.commit();
  }
  commit() {
    this.isInEditMode() && this.addToAnnotationStorage();
  }
  addToAnnotationStorage() {
    this._uiManager.addToAnnotationStorage(this);
  }
  setAt(t, e, i, n) {
    const [r, a] = this.parentDimensions;
    [i, n] = this.screenToPageTranslation(i, n), this.x = (t + i) / r, this.y = (e + n) / a, this.fixAndSetPosition();
  }
  _moveAfterPaste(t, e) {
    if (this.isClone) {
      delete this.isClone;
      return;
    }
    const [i, n] = this.parentDimensions;
    this.setAt(t * i, e * n, this.width * i, this.height * n), this._onTranslated();
  }
  #k([t, e], i, n) {
    [i, n] = this.screenToPageTranslation(i, n), this.x += i / t, this.y += n / e, this._onTranslating(this.x, this.y), this.fixAndSetPosition();
  }
  translate(t, e) {
    this.#k(this.parentDimensions, t, e);
  }
  translateInPage(t, e) {
    this.#c ||= [
      this.x,
      this.y,
      this.width,
      this.height
    ], this.#k(this.pageDimensions, t, e), this.div.scrollIntoView({ block: "nearest" });
  }
  translationDone() {
    this._onTranslated(this.x, this.y);
  }
  drag(t, e) {
    this.#c ||= [
      this.x,
      this.y,
      this.width,
      this.height
    ];
    const { div: i, parentDimensions: [n, r] } = this;
    if (this.x += t / n, this.y += e / r, this.parent && (this.x < 0 || this.x > 1 || this.y < 0 || this.y > 1)) {
      const { x: d, y: u } = this.div.getBoundingClientRect();
      this.parent.findNewParent(this, d, u) && (this.x -= Math.floor(this.x), this.y -= Math.floor(this.y));
    }
    let { x: a, y: o } = this;
    const [l, h] = this.getBaseTranslation();
    a += l, o += h;
    const { style: c } = i;
    c.left = `${(100 * a).toFixed(2)}%`, c.top = `${(100 * o).toFixed(2)}%`, this._onTranslating(a, o);
  }
  _onTranslating(t, e) {
  }
  _onTranslated(t, e) {
  }
  get _hasBeenMoved() {
    return !!this.#c && (this.#c[0] !== this.x || this.#c[1] !== this.y);
  }
  get _hasBeenResized() {
    return !!this.#c && (this.#c[2] !== this.width || this.#c[3] !== this.height);
  }
  getBaseTranslation() {
    const [t, e] = this.parentDimensions, { _borderLineWidth: i } = $, n = i / t, r = i / e;
    switch (this.rotation) {
      case 90:
        return [-n, r];
      case 180:
        return [n, r];
      case 270:
        return [n, -r];
      default:
        return [-n, -r];
    }
  }
  get _mustFixPosition() {
    return !0;
  }
  fixAndSetPosition(t = this.rotation) {
    const { div: { style: e }, pageDimensions: [i, n] } = this;
    let { x: r, y: a, width: o, height: l } = this;
    if (o *= i, l *= n, r *= i, a *= n, this._mustFixPosition) switch (t) {
      case 0:
        r = Y(r, 0, i - o), a = Y(a, 0, n - l);
        break;
      case 90:
        r = Y(r, 0, i - l), a = Y(a, o, n);
        break;
      case 180:
        r = Y(r, o, i), a = Y(a, l, n);
        break;
      case 270:
        r = Y(r, l, i), a = Y(a, 0, n - o);
    }
    this.x = r /= i, this.y = a /= n;
    const [h, c] = this.getBaseTranslation();
    r += h, a += c, e.left = `${(100 * r).toFixed(2)}%`, e.top = `${(100 * a).toFixed(2)}%`, this.moveInDOM();
  }
  static #T(t, e, i) {
    switch (i) {
      case 90:
        return [e, -t];
      case 180:
        return [-t, -e];
      case 270:
        return [-e, t];
      default:
        return [t, e];
    }
  }
  screenToPageTranslation(t, e) {
    return $.#T(t, e, this.parentRotation);
  }
  pageTranslationToScreen(t, e) {
    return $.#T(t, e, 360 - this.parentRotation);
  }
  #I(t) {
    switch (t) {
      case 90: {
        const [e, i] = this.pageDimensions;
        return [
          0,
          -e / i,
          i / e,
          0
        ];
      }
      case 180:
        return [
          -1,
          0,
          0,
          -1
        ];
      case 270: {
        const [e, i] = this.pageDimensions;
        return [
          0,
          e / i,
          -i / e,
          0
        ];
      }
      default:
        return [
          1,
          0,
          0,
          1
        ];
    }
  }
  get parentScale() {
    return this._uiManager.viewParameters.realScale;
  }
  get parentRotation() {
    return (this._uiManager.viewParameters.rotation + this.pageRotation) % 360;
  }
  get parentDimensions() {
    const { parentScale: t, pageDimensions: [e, i] } = this;
    return [e * t, i * t];
  }
  setDims() {
    const { div: { style: t }, width: e, height: i } = this;
    t.width = `${(100 * e).toFixed(2)}%`, t.height = `${(100 * i).toFixed(2)}%`;
  }
  getInitialTranslation() {
    return [0, 0];
  }
  #D() {
    if (this.#l) return;
    this.#l = document.createElement("div"), this.#l.classList.add("resizers");
    const t = this._willKeepAspectRatio ? [
      "topLeft",
      "topRight",
      "bottomRight",
      "bottomLeft"
    ] : [
      "topLeft",
      "topMiddle",
      "topRight",
      "middleRight",
      "bottomRight",
      "bottomMiddle",
      "bottomLeft",
      "middleLeft"
    ], e = this._uiManager._signal;
    for (const i of t) {
      const n = document.createElement("div");
      this.#l.append(n), n.classList.add("resizer", i), n.setAttribute("data-resizer-name", i), n.addEventListener("pointerdown", this.#L.bind(this, i), { signal: e }), n.addEventListener("contextmenu", At, { signal: e }), n.tabIndex = -1;
    }
    this.div.prepend(this.#l);
  }
  #L(t, e) {
    e.preventDefault();
    const { isMac: i } = z.platform;
    if (e.button !== 0 || e.ctrlKey && i) return;
    this.#s?.toggle(!1);
    const n = this._isDraggable;
    this._isDraggable = !1, this.#h = [e.screenX, e.screenY];
    const r = new AbortController(), a = this._uiManager.combinedSignal(r);
    this.parent.togglePointerEvents(!1), window.addEventListener("pointermove", this.#R.bind(this, t), {
      passive: !0,
      capture: !0,
      signal: a
    }), window.addEventListener("touchmove", et, {
      passive: !1,
      signal: a
    }), window.addEventListener("contextmenu", At, { signal: a }), this.#u = {
      savedX: this.x,
      savedY: this.y,
      savedWidth: this.width,
      savedHeight: this.height
    };
    const o = this.parent.div.style.cursor, l = this.div.style.cursor;
    this.div.style.cursor = this.parent.div.style.cursor = window.getComputedStyle(e.target).cursor;
    const h = () => {
      r.abort(), this.parent.togglePointerEvents(!0), this.#s?.toggle(!0), this._isDraggable = n, this.parent.div.style.cursor = o, this.div.style.cursor = l, this.#F();
    };
    window.addEventListener("pointerup", h, { signal: a }), window.addEventListener("blur", h, { signal: a });
  }
  #U(t, e, i, n) {
    this.width = i, this.height = n, this.x = t, this.y = e, this.setDims(), this.fixAndSetPosition(), this._onResized();
  }
  _onResized() {
  }
  #F() {
    if (!this.#u) return;
    const { savedX: t, savedY: e, savedWidth: i, savedHeight: n } = this.#u;
    this.#u = null;
    const r = this.x, a = this.y, o = this.width, l = this.height;
    r === t && a === e && o === i && l === n || this.addCommands({
      cmd: this.#U.bind(this, r, a, o, l),
      undo: this.#U.bind(this, t, e, i, n),
      mustExec: !0
    });
  }
  static _round(t) {
    return Math.round(t * 1e4) / 1e4;
  }
  #R(t, e) {
    const [i, n] = this.parentDimensions, r = this.x, a = this.y, o = this.width, l = this.height, h = $.MIN_SIZE / i, c = $.MIN_SIZE / n, d = this.#I(this.rotation), u = (L, D) => [d[0] * L + d[2] * D, d[1] * L + d[3] * D], p = this.#I(360 - this.rotation), f = (L, D) => [p[0] * L + p[2] * D, p[1] * L + p[3] * D];
    let m, g, b = !1, y = !1;
    switch (t) {
      case "topLeft":
        b = !0, m = (L, D) => [0, 0], g = (L, D) => [L, D];
        break;
      case "topMiddle":
        m = (L, D) => [L / 2, 0], g = (L, D) => [L / 2, D];
        break;
      case "topRight":
        b = !0, m = (L, D) => [L, 0], g = (L, D) => [0, D];
        break;
      case "middleRight":
        y = !0, m = (L, D) => [L, D / 2], g = (L, D) => [0, D / 2];
        break;
      case "bottomRight":
        b = !0, m = (L, D) => [L, D], g = (L, D) => [0, 0];
        break;
      case "bottomMiddle":
        m = (L, D) => [L / 2, D], g = (L, D) => [L / 2, 0];
        break;
      case "bottomLeft":
        b = !0, m = (L, D) => [0, D], g = (L, D) => [L, 0];
        break;
      case "middleLeft":
        y = !0, m = (L, D) => [0, D / 2], g = (L, D) => [L, D / 2];
    }
    const A = m(o, l), w = g(o, l);
    let v = u(...w);
    const S = $._round(r + v[0]), E = $._round(a + v[1]);
    let C = 1, x = 1, M, k;
    if (e.fromKeyboard)
      ({ deltaX: M, deltaY: k } = e);
    else {
      const { screenX: L, screenY: D } = e, [ot, it] = this.#h;
      [M, k] = this.screenToPageTranslation(L - ot, D - it), this.#h[0] = L, this.#h[1] = D;
    }
    if ([M, k] = f(M / i, k / n), b) {
      const L = Math.hypot(o, l);
      C = x = Math.max(Math.min(Math.hypot(w[0] - A[0] - M, w[1] - A[1] - k) / L, 1 / o, 1 / l), h / o, c / l);
    } else y ? C = Y(Math.abs(w[0] - A[0] - M), h, 1) / o : x = Y(Math.abs(w[1] - A[1] - k), c, 1) / l;
    const I = $._round(o * C), B = $._round(l * x);
    v = u(...g(I, B));
    const G = S - v[0], K = E - v[1];
    this.#c ||= [
      this.x,
      this.y,
      this.width,
      this.height
    ], this.width = I, this.height = B, this.x = G, this.y = K, this.setDims(), this.fixAndSetPosition(), this._onResizing();
  }
  _onResizing() {
  }
  altTextFinish() {
    this.#s?.finish();
  }
  get toolbarButtons() {
    return null;
  }
  async addEditToolbar() {
    if (this._editToolbar || this.#b) return this._editToolbar;
    this._editToolbar = new Hn(this), this.div.append(this._editToolbar.render());
    const { toolbarButtons: t } = this;
    if (t) for (const [e, i] of t) await this._editToolbar.addButton(e, i);
    return this.hasComment || this._editToolbar.addButton("comment", this.addCommentButton()), this._editToolbar.addButton("delete"), this._editToolbar;
  }
  addCommentButtonInToolbar() {
    this._editToolbar?.addButtonBefore("comment", this.addCommentButton(), ".deleteButton");
  }
  removeCommentButtonFromToolbar() {
    this._editToolbar?.removeButton("comment");
  }
  removeEditToolbar() {
    this._editToolbar?.remove(), this._editToolbar = null, this.#s?.destroy();
  }
  addContainer(t) {
    const e = this._editToolbar?.div;
    e ? e.before(t) : this.div.append(t);
  }
  getClientDimensions() {
    return this.div.getBoundingClientRect();
  }
  createAltText() {
    return this.#s || (zs.initialize($._l10n), this.#s = new zs(this), this.#t && (this.#s.data = this.#t, this.#t = null)), this.#s;
  }
  get altTextData() {
    return this.#s?.data;
  }
  set altTextData(t) {
    this.#s && (this.#s.data = t);
  }
  get guessedAltText() {
    return this.#s?.guessedText;
  }
  async setGuessedAltText(t) {
    await this.#s?.setGuessedText(t);
  }
  serializeAltText(t) {
    return this.#s?.serialize(t);
  }
  hasAltText() {
    return !!this.#s && !this.#s.isEmpty();
  }
  hasAltTextData() {
    return this.#s?.hasData() ?? !1;
  }
  focusCommentButton() {
    this.#i?.focusButton();
  }
  addCommentButton() {
    return this.canAddComment ? this.#i ||= new fe(this) : null;
  }
  addStandaloneCommentButton() {
    if (this._uiManager.hasCommentManager()) {
      if (this.#n) {
        this._uiManager.isEditingMode() && this.#n.classList.remove("hidden");
        return;
      }
      this.hasComment && (this.#n = this.#i.renderForStandalone(), this.div.append(this.#n));
    }
  }
  removeStandaloneCommentButton() {
    this.#i.removeStandaloneCommentButton(), this.#n = null;
  }
  hideStandaloneCommentButton() {
    this.#n?.classList.add("hidden");
  }
  get comment() {
    if (!this.#i) return null;
    const { data: { richText: t, text: e, date: i, deleted: n } } = this.#i;
    return {
      text: e,
      richText: t,
      date: i,
      deleted: n,
      color: this.getNonHCMColor(),
      opacity: this.opacity ?? 1
    };
  }
  set comment(t) {
    this.#i ||= new fe(this), typeof t == "object" && t !== null ? this.#i.restoreData(t) : this.#i.data = t, this.hasComment ? (this.removeCommentButtonFromToolbar(), this.addStandaloneCommentButton(), this._uiManager.updateComment(this)) : (this.addCommentButtonInToolbar(), this.removeStandaloneCommentButton(), this._uiManager.removeComment(this));
  }
  setCommentData({ comment: t, popupRef: e, richText: i }) {
    if (!e || (this.#i ||= new fe(this), this.#i.setInitialText(t, i), !this.annotationElementId)) return;
    const n = this._uiManager.getAndRemoveDataFromAnnotationStorage(this.annotationElementId);
    n && this.updateFromAnnotationLayer(n);
  }
  get hasEditedComment() {
    return this.#i?.hasBeenEdited();
  }
  get hasDeletedComment() {
    return this.#i?.isDeleted();
  }
  get hasComment() {
    return !!this.#i && !this.#i.isEmpty() && !this.#i.isDeleted();
  }
  async editComment(t) {
    this.#i ||= new fe(this), this.#i.edit(t);
  }
  toggleComment(t, e = void 0) {
    this.hasComment && this._uiManager.toggleComment(this, t, e);
  }
  setSelectedCommentButton(t) {
    this.#i.setSelectedButton(t);
  }
  addComment(t) {
    if (this.hasEditedComment) {
      const [, , , n] = t.rect, [r] = this.pageDimensions, [a] = this.pageTranslation, o = a + r + 1, l = n - 100, h = o + 180;
      t.popup = {
        contents: this.comment.text,
        deleted: this.comment.deleted,
        rect: [
          o,
          l,
          h,
          n
        ]
      };
    }
  }
  updateFromAnnotationLayer({ popup: { contents: t, deleted: e } }) {
    this.#i.data = e ? null : t;
  }
  get parentBoundingClientRect() {
    return this.parent.boundingClientRect;
  }
  render() {
    const t = this.div = document.createElement("div");
    t.setAttribute("data-editor-rotation", (360 - this.rotation) % 360), t.className = this.name, t.setAttribute("id", this.id), t.tabIndex = this.#a ? -1 : 0, t.setAttribute("role", "application"), this.defaultL10nId && t.setAttribute("data-l10n-id", this.defaultL10nId), this._isVisible || t.classList.add("hidden"), this.setInForeground(), this.#B();
    const [e, i] = this.parentDimensions;
    this.parentRotation % 180 !== 0 && (t.style.maxWidth = `${(100 * i / e).toFixed(2)}%`, t.style.maxHeight = `${(100 * e / i).toFixed(2)}%`);
    const [n, r] = this.getInitialTranslation();
    return this.translate(n, r), Ci(this, t, [
      "keydown",
      "pointerdown",
      "dblclick"
    ]), this.#$(), this.addStandaloneCommentButton(), this._uiManager._editorUndoBar?.hide(), t;
  }
  #j() {
    this.#u = {
      savedX: this.x,
      savedY: this.y,
      savedWidth: this.width,
      savedHeight: this.height
    }, this.#s?.toggle(!1), this.parent.togglePointerEvents(!1);
  }
  #N(t, e, i) {
    let r = 0.7 * (i / e) + 1 - 0.7;
    if (r === 1) return;
    const a = this.#I(this.rotation), o = (S, E) => [a[0] * S + a[2] * E, a[1] * S + a[3] * E], [l, h] = this.parentDimensions, c = this.x, d = this.y, u = this.width, p = this.height, f = $.MIN_SIZE / l, m = $.MIN_SIZE / h;
    r = Math.max(Math.min(r, 1 / u, 1 / p), f / u, m / p);
    const g = $._round(u * r), b = $._round(p * r);
    if (g === u && b === p) return;
    this.#c ||= [
      c,
      d,
      u,
      p
    ];
    const y = o(u / 2, p / 2), A = $._round(c + y[0]), w = $._round(d + y[1]), v = o(g / 2, b / 2);
    this.x = A - v[0], this.y = w - v[1], this.width = g, this.height = b, this.setDims(), this.fixAndSetPosition(), this._onResizing();
  }
  #G() {
    this.#s?.toggle(!0), this.parent.togglePointerEvents(!0), this.#F();
  }
  pointerdown(t) {
    const { isMac: e } = z.platform;
    if (t.button !== 0 || t.ctrlKey && e) {
      t.preventDefault();
      return;
    }
    if (this.#m = !0, this._isDraggable) {
      this.#w(t);
      return;
    }
    this.#x(t);
  }
  #x(t) {
    const { isMac: e } = z.platform;
    t.ctrlKey && !e || t.shiftKey || t.metaKey && e ? this.parent.toggleSelected(this) : this.parent.setSelected(this);
  }
  #w(t) {
    const { isSelected: e } = this;
    this._uiManager.setUpDragSession();
    let i = !1;
    const n = new AbortController(), r = this._uiManager.combinedSignal(n), a = {
      capture: !0,
      passive: !1,
      signal: r
    }, o = (h) => {
      n.abort(), this.#r = null, this.#m = !1, this._uiManager.endDragSession() || this.#x(h), i && this._onStopDragging();
    };
    e && (this.#v = t.clientX, this.#E = t.clientY, this.#r = t.pointerId, this.#o = t.pointerType, window.addEventListener("pointermove", (h) => {
      i || (i = !0, this._uiManager.toggleComment(this, !0, !1), this._onStartDragging());
      const { clientX: c, clientY: d, pointerId: u } = h;
      if (u !== this.#r) {
        et(h);
        return;
      }
      const [p, f] = this.screenToPageTranslation(c - this.#v, d - this.#E);
      this.#v = c, this.#E = d, this._uiManager.dragSelectedEditors(p, f), this.div.scrollIntoView({ block: "nearest" });
    }, a), window.addEventListener("touchmove", et, a), window.addEventListener("pointerdown", (h) => {
      h.pointerType === this.#o && (this.#_ || h.isPrimary) && o(h), et(h);
    }, a));
    const l = (h) => {
      if (!this.#r || this.#r === h.pointerId) {
        o(h);
        return;
      }
      et(h);
    };
    window.addEventListener("pointerup", l, { signal: r }), window.addEventListener("blur", l, { signal: r });
  }
  _onStartDragging() {
  }
  _onStopDragging() {
  }
  moveInDOM() {
    this.#A && clearTimeout(this.#A), this.#A = setTimeout(() => {
      this.#A = null, this.parent?.moveEditorInDOM(this);
    }, 0);
  }
  _setParentAndPosition(t, e, i) {
    t.changeParent(this), this.x = e, this.y = i, this.fixAndSetPosition(), this._onTranslated();
  }
  getRect(t, e, i = this.rotation) {
    const n = this.parentScale, [r, a] = this.pageDimensions, [o, l] = this.pageTranslation, h = t / n, c = e / n, d = this.x * r, u = this.y * a, p = this.width * r, f = this.height * a;
    switch (i) {
      case 0:
        return [
          d + h + o,
          a - u - c - f + l,
          d + h + p + o,
          a - u - c + l
        ];
      case 90:
        return [
          d + c + o,
          a - u + h + l,
          d + c + f + o,
          a - u + h + p + l
        ];
      case 180:
        return [
          d - h - p + o,
          a - u + c + l,
          d - h + o,
          a - u + c + f + l
        ];
      case 270:
        return [
          d - c - f + o,
          a - u - h - p + l,
          d - c + o,
          a - u - h + l
        ];
      default:
        throw new Error("Invalid rotation");
    }
  }
  getRectInCurrentCoords(t, e) {
    const [i, n, r, a] = t, o = r - i, l = a - n;
    switch (this.rotation) {
      case 0:
        return [
          i,
          e - a,
          o,
          l
        ];
      case 90:
        return [
          i,
          e - n,
          l,
          o
        ];
      case 180:
        return [
          r,
          e - n,
          o,
          l
        ];
      case 270:
        return [
          r,
          e - a,
          l,
          o
        ];
      default:
        throw new Error("Invalid rotation");
    }
  }
  getPDFRect() {
    return this.getRect(0, 0);
  }
  getNonHCMColor() {
    return this.color && $._colorManager.convert(this._uiManager.getNonHCMColor(this.color));
  }
  onUpdatedColor() {
    this.#i?.onUpdatedColor();
  }
  getData() {
    const { comment: { text: t, color: e, date: i, opacity: n, deleted: r, richText: a }, uid: o, pageIndex: l, creationDate: h, modificationDate: c } = this;
    return {
      id: o,
      pageIndex: l,
      rect: this.getPDFRect(),
      richText: a,
      contentsObj: { str: t },
      creationDate: h,
      modificationDate: i || c,
      popupRef: !r,
      color: e,
      opacity: n
    };
  }
  onceAdded(t) {
  }
  isEmpty() {
    return !1;
  }
  enableEditMode() {
    return this.isInEditMode() ? !1 : (this.parent.setEditingState(!1), this.#b = !0, !0);
  }
  disableEditMode() {
    return this.isInEditMode() ? (this.parent.setEditingState(!0), this.#b = !1, !0) : !1;
  }
  isInEditMode() {
    return this.#b;
  }
  shouldGetKeyboardEvents() {
    return this.#y;
  }
  needsToBeRebuilt() {
    return this.div && !this.isAttachedToDOM;
  }
  get isOnScreen() {
    const { top: t, left: e, bottom: i, right: n } = this.getClientDimensions(), { innerHeight: r, innerWidth: a } = window;
    return e < a && n > 0 && t < r && i > 0;
  }
  #B() {
    if (this.#f || !this.div) return;
    this.#f = new AbortController();
    const t = this._uiManager.combinedSignal(this.#f);
    this.div.addEventListener("focusin", this.focusin.bind(this), { signal: t }), this.div.addEventListener("focusout", this.focusout.bind(this), { signal: t });
  }
  #$() {
    this.#_ || !this.div || !this.isResizable || !this._uiManager._supportsPinchToZoom || (this.#_ = new ki({
      container: this.div,
      isPinchingDisabled: () => !this.isSelected,
      onPinchStart: this.#j.bind(this),
      onPinching: this.#N.bind(this),
      onPinchEnd: this.#G.bind(this),
      signal: this._uiManager._signal
    }));
  }
  rebuild() {
    this.#B(), this.#$();
  }
  rotate(t) {
  }
  resize() {
  }
  serializeDeleted() {
    return {
      id: this.annotationElementId,
      deleted: !0,
      pageIndex: this.pageIndex,
      popupRef: this._initialData?.popupRef || ""
    };
  }
  serialize(t = !1, e = null) {
    return {
      annotationType: this.mode,
      pageIndex: this.pageIndex,
      rect: this.getPDFRect(),
      rotation: this.rotation,
      structTreeParentId: this._structTreeParentId,
      popupRef: this._initialData?.popupRef || ""
    };
  }
  static async deserialize(t, e, i) {
    const n = new this.prototype.constructor({
      parent: e,
      id: i.getId(),
      uiManager: i,
      annotationElementId: t.annotationElementId,
      creationDate: t.creationDate,
      modificationDate: t.modificationDate
    });
    n.rotation = t.rotation, n.#t = t.accessibilityData, n._isCopy = t.isCopy || !1;
    const [r, a] = n.pageDimensions, [o, l, h, c] = n.getRectInCurrentCoords(t.rect, a);
    return n.x = o / r, n.y = l / a, n.width = h / r, n.height = c / a, n;
  }
  get hasBeenModified() {
    return !!this.annotationElementId && (this.deleted || this.serialize() !== null);
  }
  remove() {
    if (this.#f?.abort(), this.#f = null, this.isEmpty() || this.commit(), this.#_?.destroy(), this.#_ = null, this.parent ? this.parent.remove(this) : this._uiManager.removeEditor(this), this.hideCommentPopup(), this.#A && (clearTimeout(this.#A), this.#A = null), this.#O(), this.removeEditToolbar(), this.#S) {
      for (const t of this.#S.values()) clearTimeout(t);
      this.#S = null;
    }
    this.parent = null, this.#d?.remove(), this.#d = null;
  }
  get isResizable() {
    return !1;
  }
  makeResizable() {
    this.isResizable && (this.#D(), this.#l.classList.remove("hidden"));
  }
  get toolbarPosition() {
    return null;
  }
  get commentButtonPosition() {
    return this._uiManager.direction === "ltr" ? [1, 0] : [0, 0];
  }
  get commentButtonPositionInPage() {
    const { commentButtonPosition: [t, e] } = this, [i, n, r, a] = this.getPDFRect();
    return [$._round(i + (r - i) * t), $._round(n + (a - n) * (1 - e))];
  }
  get commentButtonColor() {
    return this._uiManager.makeCommentColor(this.getNonHCMColor(), this.opacity);
  }
  get commentPopupPosition() {
    return this.#i.commentPopupPositionInLayer;
  }
  set commentPopupPosition(t) {
    this.#i.commentPopupPositionInLayer = t;
  }
  hasDefaultPopupPosition() {
    return this.#i.hasDefaultPopupPosition();
  }
  get commentButtonWidth() {
    return this.#i.commentButtonWidth;
  }
  get elementBeforePopup() {
    return this.div;
  }
  setCommentButtonStates(t) {
    this.#i?.setCommentButtonStates(t);
  }
  keydown(t) {
    if (!this.isResizable || t.target !== this.div || t.key !== "Enter") return;
    this._uiManager.setSelected(this), this.#u = {
      savedX: this.x,
      savedY: this.y,
      savedWidth: this.width,
      savedHeight: this.height
    };
    const e = this.#l.children;
    if (!this.#e) {
      this.#e = Array.from(e);
      const a = this.#V.bind(this), o = this.#q.bind(this), l = this._uiManager._signal;
      for (const h of this.#e) {
        const c = h.getAttribute("data-resizer-name");
        h.setAttribute("role", "spinbutton"), h.addEventListener("keydown", a, { signal: l }), h.addEventListener("blur", o, { signal: l }), h.addEventListener("focus", this.#Y.bind(this, c), { signal: l }), h.setAttribute("data-l10n-id", $._l10nResizer[c]);
      }
    }
    const i = this.#e[0];
    let n = 0;
    for (const a of e) {
      if (a === i) break;
      n++;
    }
    const r = (360 - this.rotation + this.parentRotation) % 360 / 90 * (this.#e.length / 4);
    if (r !== n) {
      if (r < n) for (let o = 0; o < n - r; o++) this.#l.append(this.#l.firstElementChild);
      else if (r > n) for (let o = 0; o < r - n; o++) this.#l.firstElementChild.before(this.#l.lastElementChild);
      let a = 0;
      for (const o of e) {
        const l = this.#e[a++].getAttribute("data-resizer-name");
        o.setAttribute("data-l10n-id", $._l10nResizer[l]);
      }
    }
    this.#K(0), this.#y = !0, this.#l.firstElementChild.focus({ focusVisible: !0 }), t.preventDefault(), t.stopImmediatePropagation();
  }
  #V(t) {
    $._resizerKeyboardManager.exec(this, t);
  }
  #q(t) {
    this.#y && t.relatedTarget?.parentNode !== this.#l && this.#O();
  }
  #Y(t) {
    this.#g = this.#y ? t : "";
  }
  #K(t) {
    if (this.#e)
      for (const e of this.#e) e.tabIndex = t;
  }
  _resizeWithKeyboard(t, e) {
    this.#y && this.#R(this.#g, {
      deltaX: t,
      deltaY: e,
      fromKeyboard: !0
    });
  }
  #O() {
    this.#y = !1, this.#K(-1), this.#F();
  }
  _stopResizingWithKeyboard() {
    this.#O(), this.div.focus();
  }
  select() {
    if (this.isSelected && this._editToolbar) {
      this._editToolbar.show();
      return;
    }
    if (this.isSelected = !0, this.makeResizable(), this.div?.classList.add("selectedEditor"), !this._editToolbar) {
      this.addEditToolbar().then(() => {
        this.div?.classList.contains("selectedEditor") && this._editToolbar?.show();
      });
      return;
    }
    this._editToolbar?.show(), this.#s?.toggleAltTextBadge(!1);
  }
  focus() {
    this.div && !this.div.contains(document.activeElement) && setTimeout(() => this.div?.focus({ preventScroll: !0 }), 0);
  }
  unselect() {
    this.isSelected && (this.isSelected = !1, this.#l?.classList.add("hidden"), this.div?.classList.remove("selectedEditor"), this.div?.contains(document.activeElement) && this._uiManager.currentLayer.div.focus({ preventScroll: !0 }), this._editToolbar?.hide(), this.#s?.toggleAltTextBadge(!0), this.hideCommentPopup());
  }
  hideCommentPopup() {
    this.hasComment && this._uiManager.toggleComment(null);
  }
  updateParams(t, e) {
  }
  disableEditing() {
  }
  enableEditing() {
  }
  get canChangeContent() {
    return !1;
  }
  enterInEditMode() {
    this.canChangeContent && (this.enableEditMode(), this.div.focus());
  }
  dblclick(t) {
    t.target.nodeName !== "BUTTON" && (this.enterInEditMode(), this.parent.updateToolbar({
      mode: this.constructor._editorType,
      editId: this.uid
    }));
  }
  getElementForAltText() {
    return this.div;
  }
  get contentDiv() {
    return this.div;
  }
  get isEditing() {
    return this.#p;
  }
  set isEditing(t) {
    this.#p = t, this.parent && (t ? (this.parent.setSelected(this), this.parent.setActiveEditor(this)) : this.parent.setActiveEditor(null));
  }
  static get MIN_SIZE() {
    return 16;
  }
  static canCreateNewEmptyEditor() {
    return !0;
  }
  get telemetryInitialData() {
    return { action: "added" };
  }
  get telemetryFinalData() {
    return null;
  }
  _reportTelemetry(t, e = !1) {
    if (e) {
      this.#S ||= /* @__PURE__ */ new Map();
      const { action: i } = t;
      let n = this.#S.get(i);
      n && clearTimeout(n), n = setTimeout(() => {
        this._reportTelemetry(t), this.#S.delete(i), this.#S.size === 0 && (this.#S = null);
      }, $._telemetryTimeout), this.#S.set(i, n);
      return;
    }
    t.type ||= this.editorType, this._uiManager._eventBus.dispatch("reporttelemetry", {
      source: this,
      details: {
        type: "editing",
        data: t
      }
    });
  }
  show(t = this._isVisible) {
    this.div.classList.toggle("hidden", !t), this._isVisible = t;
  }
  enable() {
    this.div && (this.div.tabIndex = 0), this.#a = !1;
  }
  disable() {
    this.div && (this.div.tabIndex = -1), this.#a = !0;
  }
  updateFakeAnnotationElement(t) {
    if (!this.#d && !this.deleted) {
      this.#d = t.addFakeAnnotation(this);
      return;
    }
    if (this.deleted) {
      this.#d.remove(), this.#d = null;
      return;
    }
    (this.hasEditedComment || this._hasBeenMoved || this._hasBeenResized) && this.#d.updateEdited({
      rect: this.getPDFRect(),
      popup: this.comment
    });
  }
  renderAnnotationElement(t) {
    if (this.deleted)
      return t.hide(), null;
    let e = t.container.querySelector(".annotationContent");
    if (!e)
      e = document.createElement("div"), e.classList.add("annotationContent", this.editorType), t.container.prepend(e);
    else if (e.nodeName === "CANVAS") {
      const i = e;
      e = document.createElement("div"), e.classList.add("annotationContent", this.editorType), i.before(e);
    }
    return e;
  }
  resetAnnotationElement(t) {
    const { firstElementChild: e } = t.container;
    e?.nodeName === "DIV" && e.classList.contains("annotationContent") && e.remove();
  }
}, Vn = class extends V {
  constructor(s) {
    super(s), this.annotationElementId = s.annotationElementId, this.deleted = !0;
  }
  serialize() {
    return this.serializeDeleted();
  }
}, Ws = 3285377520, mt = 4294901760, kt = 65535, ds = class {
  constructor(s) {
    this.h1 = s ? s & 4294967295 : Ws, this.h2 = s ? s & 4294967295 : Ws;
  }
  update(s) {
    let t, e;
    if (typeof s == "string") {
      t = new Uint8Array(s.length * 2), e = 0;
      for (let f = 0, m = s.length; f < m; f++) {
        const g = s.charCodeAt(f);
        g <= 255 ? t[e++] = g : (t[e++] = g >>> 8, t[e++] = g & 255);
      }
    } else if (ArrayBuffer.isView(s))
      t = s.slice(), e = t.byteLength;
    else throw new Error("Invalid data format, must be a string or TypedArray.");
    const i = e >> 2, n = e - i * 4, r = new Uint32Array(t.buffer, 0, i);
    let a = 0, o = 0, l = this.h1, h = this.h2;
    const c = 3432918353, d = 461845907, u = 11601, p = 13715;
    for (let f = 0; f < i; f++) f & 1 ? (a = r[f], a = a * c & mt | a * u & kt, a = a << 15 | a >>> 17, a = a * d & mt | a * p & kt, l ^= a, l = l << 13 | l >>> 19, l = l * 5 + 3864292196) : (o = r[f], o = o * c & mt | o * u & kt, o = o << 15 | o >>> 17, o = o * d & mt | o * p & kt, h ^= o, h = h << 13 | h >>> 19, h = h * 5 + 3864292196);
    switch (a = 0, n) {
      case 3:
        a ^= t[i * 4 + 2] << 16;
      case 2:
        a ^= t[i * 4 + 1] << 8;
      case 1:
        a ^= t[i * 4], a = a * c & mt | a * u & kt, a = a << 15 | a >>> 17, a = a * d & mt | a * p & kt, i & 1 ? l ^= a : h ^= a;
    }
    this.h1 = l, this.h2 = h;
  }
  hexdigest() {
    let s = this.h1, t = this.h2;
    return s ^= t >>> 1, s = s * 3981806797 & mt | s * 36045 & kt, t = t * 4283543511 & mt | ((t << 16 | s >>> 16) * 2950163797 & mt) >>> 16, s ^= t >>> 1, s = s * 444984403 & mt | s * 60499 & kt, t = t * 3301882366 & mt | ((t << 16 | s >>> 16) * 3120437893 & mt) >>> 16, s ^= t >>> 1, (s >>> 0).toString(16).padStart(8, "0") + (t >>> 0).toString(16).padStart(8, "0");
  }
}, le = Object.freeze({
  map: null,
  hash: "",
  transfer: void 0
}), Ms = class {
  #t = !1;
  #e = null;
  #s = null;
  #i = /* @__PURE__ */ new Map();
  onSetModified = null;
  onResetModified = null;
  onAnnotationEditor = null;
  getValue(s, t) {
    const e = this.#i.get(s);
    return e === void 0 ? t : Object.assign(t, e);
  }
  getRawValue(s) {
    return this.#i.get(s);
  }
  remove(s) {
    const t = this.#i.get(s);
    t !== void 0 && (t instanceof V && this.#s.delete(t.annotationElementId), this.#i.delete(s), this.#i.size === 0 && this.resetModified(), !this.#i.values().some((e) => e instanceof V) && this.onAnnotationEditor?.(null));
  }
  setValue(s, t) {
    const e = this.#i.get(s);
    let i = !1;
    if (e !== void 0)
      for (const [n, r] of Object.entries(t)) e[n] !== r && (i = !0, e[n] = r);
    else
      i = !0, this.#i.set(s, t);
    i && this.#n(), t instanceof V && ((this.#s ||= /* @__PURE__ */ new Map()).set(t.annotationElementId, t), this.onAnnotationEditor?.(t.constructor._type));
  }
  has(s) {
    return this.#i.has(s);
  }
  get size() {
    return this.#i.size;
  }
  #n() {
    this.#t || (this.#t = !0, this.onSetModified?.());
  }
  resetModified() {
    this.#t && (this.#t = !1, this.onResetModified?.());
  }
  get print() {
    return new Pi(this);
  }
  get serializable() {
    if (this.#i.size === 0) return le;
    const s = /* @__PURE__ */ new Map(), t = new ds(), e = [], i = /* @__PURE__ */ Object.create(null);
    let n = !1;
    for (const [r, a] of this.#i) {
      const o = a instanceof V ? a.serialize(!1, i) : a;
      a.page && (a.pageIndex = a.page._pageIndex, delete a.page), o && (s.set(r, o), t.update(`${r}:${JSON.stringify(o)}`), n ||= !!o.bitmap);
    }
    if (n)
      for (const r of s.values()) r.bitmap && e.push(r.bitmap);
    return s.size > 0 ? {
      map: s,
      hash: t.hexdigest(),
      transfer: e
    } : le;
  }
  get editorStats() {
    let s = null;
    const t = /* @__PURE__ */ new Map();
    let e = 0, i = 0;
    for (const n of this.#i.values()) {
      if (!(n instanceof V)) {
        n.popup && (n.popup.deleted ? i += 1 : e += 1);
        continue;
      }
      n.isCommentDeleted ? i += 1 : n.hasEditedComment && (e += 1);
      const r = n.telemetryFinalData;
      if (!r) continue;
      const { type: a } = r;
      t.getOrInsertComputed(a, () => Object.getPrototypeOf(n).constructor), s ||= /* @__PURE__ */ Object.create(null);
      const o = s[a] ||= /* @__PURE__ */ new Map();
      for (const [l, h] of Object.entries(r)) {
        if (l === "type") continue;
        const c = o.getOrInsertComputed(l, Cs);
        c.set(h, (c.get(h) ?? 0) + 1);
      }
    }
    if ((i > 0 || e > 0) && (s ||= /* @__PURE__ */ Object.create(null), s.comments = {
      deleted: i,
      edited: e
    }), !s) return null;
    for (const [n, r] of t) s[n] = r.computeTelemetryFinalData(s[n]);
    return s;
  }
  resetModifiedIds() {
    this.#e = null;
  }
  updateEditor(s, t) {
    const e = this.#s?.get(s);
    return e ? (e.updateFromAnnotationLayer(t), !0) : !1;
  }
  getEditor(s) {
    return this.#s?.get(s) || null;
  }
  get modifiedIds() {
    if (this.#e) return this.#e;
    const s = [];
    if (this.#s) for (const e of this.#s.values())
      e.serialize() && s.push(e.annotationElementId);
    let t = "";
    if (s.length) {
      const e = new ds();
      e.update(s.join(",")), t = e.hexdigest();
    }
    return this.#e = {
      ids: new Set(s),
      hash: t
    };
  }
  [Symbol.iterator]() {
    return this.#i.entries();
  }
}, Pi = class extends Ms {
  #t = le;
  constructor(s) {
    super();
    const { serializable: t } = s;
    if (t === le) return;
    const { map: e, hash: i, transfer: n } = t, r = structuredClone(e, n ? { transfer: n } : null);
    this.#t = {
      map: r,
      hash: i,
      transfer: []
    };
  }
  get print() {
    U("Should not call PrintAnnotationStorage.print");
  }
  get serializable() {
    return this.#t;
  }
  get modifiedIds() {
    return P(this, "modifiedIds", {
      ids: /* @__PURE__ */ new Set(),
      hash: ""
    });
  }
}, Wt = "__forcedDependency", { floor: Xs, ceil: Ys } = Math;
function Ks(s, t, e, i, n, r) {
  s[t * 4 + 0] = Math.min(s[t * 4 + 0], e), s[t * 4 + 1] = Math.min(s[t * 4 + 1], i), s[t * 4 + 2] = Math.max(s[t * 4 + 2], n), s[t * 4 + 3] = Math.max(s[t * 4 + 3], r);
}
function Wn(s, t, e, i, n) {
  let r;
  s ? (s < 0 && (r = n[0], n[0] = n[2], n[2] = r), n[0] *= s, n[2] *= s, t < 0 && (r = n[1], n[1] = n[3], n[3] = r), n[1] *= t, n[3] *= t) : n.fill(0), n[0] += e, n[1] += i, n[2] += e, n[3] += i;
}
var us = new Uint32Array(new Uint8Array([
  255,
  255,
  0,
  0
]).buffer)[0], Xn = class {
  #t;
  #e;
  constructor(s, t) {
    this.#t = s, this.#e = t;
  }
  get length() {
    return this.#t.length;
  }
  isEmpty(s) {
    return this.#t[s] === us;
  }
  minX(s) {
    return this.#e[s * 4 + 0] / 256;
  }
  minY(s) {
    return this.#e[s * 4 + 1] / 256;
  }
  maxX(s) {
    return (this.#e[s * 4 + 2] + 1) / 256;
  }
  maxY(s) {
    return (this.#e[s * 4 + 3] + 1) / 256;
  }
}, qs = (s, t) => s?.getOrInsertComputed(t, () => ({
  dependencies: /* @__PURE__ */ new Set(),
  isRenderingOperation: !1
})), Yn = class {
  #t = [[
    1,
    0,
    0,
    1,
    0,
    0
  ]];
  #e = [
    -1 / 0,
    -1 / 0,
    1 / 0,
    1 / 0
  ];
  #s = new Float64Array(Tt);
  _pendingBBoxIdx = -1;
  #i;
  #n;
  #a;
  #r;
  _savesStack = [];
  _markedContentStack = [];
  constructor(s, t) {
    this.#i = s.width, this.#n = s.height, this.#o(t);
  }
  growOperationsCount(s) {
    s >= this.#r.length && this.#o(s, this.#r);
  }
  #o(s, t) {
    const e = /* @__PURE__ */ new ArrayBuffer(s * 4);
    this.#a = new Uint8ClampedArray(e), this.#r = new Uint32Array(e), t && t.length > 0 ? (this.#r.set(t), this.#r.fill(us, t.length)) : this.#r.fill(us);
  }
  get clipBox() {
    return this.#e;
  }
  save(s) {
    return this.#e = { __proto__: this.#e }, this._savesStack.push(s), this;
  }
  restore(s, t) {
    const e = Object.getPrototypeOf(this.#e);
    if (e === null) return this;
    this.#e = e;
    const i = this._savesStack.pop();
    return i !== void 0 && (t?.(i, s), this.#r[s] = this.#r[i]), this;
  }
  recordOpenMarker(s) {
    return this._savesStack.push(s), this;
  }
  getOpenMarker() {
    return this._savesStack.length === 0 ? null : this._savesStack.at(-1);
  }
  recordCloseMarker(s, t) {
    const e = this._savesStack.pop();
    return e !== void 0 && (t?.(e, s), this.#r[s] = this.#r[e]), this;
  }
  beginMarkedContent(s) {
    return this._markedContentStack.push(s), this;
  }
  endMarkedContent(s, t) {
    const e = this._markedContentStack.pop();
    return e !== void 0 && (t?.(e, s), this.#r[s] = this.#r[e]), this;
  }
  pushBaseTransform(s) {
    return this.#t.push(_.multiplyByDOMMatrix(this.#t.at(-1), s.getTransform())), this;
  }
  popBaseTransform() {
    return this.#t.length > 1 && this.#t.pop(), this;
  }
  resetBBox(s) {
    return this._pendingBBoxIdx !== s && (this._pendingBBoxIdx = s, this.#s.set(Tt, 0)), this;
  }
  recordClipBox(s, t, e, i, n, r) {
    const a = _.multiplyByDOMMatrix(this.#t.at(-1), t.getTransform()), o = Tt.slice();
    _.axialAlignedBoundingBox([
      e,
      n,
      i,
      r
    ], a, o);
    const l = _.intersect(this.#e, o);
    return l ? (this.#e[0] = l[0], this.#e[1] = l[1], this.#e[2] = l[2], this.#e[3] = l[3]) : (this.#e[0] = this.#e[1] = 1 / 0, this.#e[2] = this.#e[3] = -1 / 0), this;
  }
  recordBBox(s, t, e, i, n, r) {
    const a = this.#e;
    if (a[0] === 1 / 0) return this;
    const o = _.multiplyByDOMMatrix(this.#t.at(-1), t.getTransform());
    if (a[0] === -1 / 0)
      return _.axialAlignedBoundingBox([
        e,
        n,
        i,
        r
      ], o, this.#s), this;
    const l = Tt.slice();
    return _.axialAlignedBoundingBox([
      e,
      n,
      i,
      r
    ], o, l), this.#s[0] = Y(l[0], a[0], this.#s[0]), this.#s[1] = Y(l[1], a[1], this.#s[1]), this.#s[2] = Y(l[2], this.#s[2], a[2]), this.#s[3] = Y(l[3], this.#s[3], a[3]), this;
  }
  recordFullPageBBox(s) {
    return this.#s[0] = Math.max(0, this.#e[0]), this.#s[1] = Math.max(0, this.#e[1]), this.#s[2] = Math.min(this.#i, this.#e[2]), this.#s[3] = Math.min(this.#n, this.#e[3]), this;
  }
  recordOperation(s, t = !1, e) {
    if (this._pendingBBoxIdx !== s) return this;
    const i = Xs(this.#s[0] * 256 / this.#i), n = Xs(this.#s[1] * 256 / this.#n), r = Ys(this.#s[2] * 256 / this.#i), a = Ys(this.#s[3] * 256 / this.#n);
    if (Ks(this.#a, s, i, n, r, a), e)
      for (const o of e) for (const l of o) l !== s && Ks(this.#a, l, i, n, r, a);
    return t || (this._pendingBBoxIdx = -1), this;
  }
  bboxToClipBoxDropOperation(s) {
    return this._pendingBBoxIdx === s && (this._pendingBBoxIdx = -1, this.#e[0] = Math.max(this.#e[0], this.#s[0]), this.#e[1] = Math.max(this.#e[1], this.#s[1]), this.#e[2] = Math.min(this.#e[2], this.#s[2]), this.#e[3] = Math.min(this.#e[3], this.#s[3])), this;
  }
  take() {
    return new Xn(this.#r, this.#a);
  }
  takeDebugMetadata() {
    throw new Error("Unreachable");
  }
  recordSimpleData(s, t) {
    return this;
  }
  recordIncrementalData(s, t) {
    return this;
  }
  resetIncrementalData(s, t) {
    return this;
  }
  recordNamedData(s, t) {
    return this;
  }
  recordSimpleDataFromNamed(s, t, e) {
    return this;
  }
  recordFutureForcedDependency(s, t) {
    return this;
  }
  inheritSimpleDataAsFutureForcedDependencies(s) {
    return this;
  }
  inheritPendingDependenciesAsFutureForcedDependencies() {
    return this;
  }
  recordCharacterBBox(s, t, e, i = 1, n = 0, r = 0, a) {
    return this;
  }
  getSimpleIndex(s) {
  }
  recordDependencies(s, t) {
    return this;
  }
  recordNamedDependency(s, t) {
    return this;
  }
  recordShowTextOperation(s, t = !1) {
    return this;
  }
}, Kn = class {
  #t = { __proto__: null };
  #e = {
    __proto__: null,
    transform: [],
    moveText: [],
    sameLineText: [],
    [Wt]: []
  };
  #s = /* @__PURE__ */ new Map();
  #i = /* @__PURE__ */ new Set();
  #n = /* @__PURE__ */ new Map();
  #a;
  #r;
  #o;
  constructor(s, t = !1) {
    this.#o = s, t && (this.#a = /* @__PURE__ */ new Map(), this.#r = (e, i) => {
      qs(this.#a, i).dependencies.add(e);
    });
  }
  get clipBox() {
    return this.#o.clipBox;
  }
  growOperationsCount(s) {
    this.#o.growOperationsCount(s);
  }
  save(s) {
    return this.#t = { __proto__: this.#t }, this.#e = {
      __proto__: this.#e,
      transform: { __proto__: this.#e.transform },
      moveText: { __proto__: this.#e.moveText },
      sameLineText: { __proto__: this.#e.sameLineText },
      [Wt]: { __proto__: this.#e[Wt] }
    }, this.#o.save(s), this;
  }
  restore(s) {
    this.#o.restore(s, this.#r);
    const t = Object.getPrototypeOf(this.#t);
    return t === null ? this : (this.#t = t, this.#e = Object.getPrototypeOf(this.#e), this);
  }
  recordOpenMarker(s) {
    return this.#o.recordOpenMarker(s, this.#r), this;
  }
  getOpenMarker() {
    return this.#o.getOpenMarker();
  }
  recordCloseMarker(s) {
    return this.#o.recordCloseMarker(s, this.#r), this;
  }
  beginMarkedContent(s) {
    return this.#o.beginMarkedContent(s), this;
  }
  endMarkedContent(s) {
    return this.#o.endMarkedContent(s, this.#r), this;
  }
  pushBaseTransform(s) {
    return this.#o.pushBaseTransform(s), this;
  }
  popBaseTransform() {
    return this.#o.popBaseTransform(), this;
  }
  recordSimpleData(s, t) {
    return this.#t[s] = t, this;
  }
  recordIncrementalData(s, t) {
    return this.#e[s].push(t), this;
  }
  resetIncrementalData(s, t) {
    return this.#e[s].length = 0, this;
  }
  recordNamedData(s, t) {
    return this.#s.set(s, t), this;
  }
  recordSimpleDataFromNamed(s, t, e) {
    this.#t[s] = this.#s.get(t) ?? e;
  }
  recordFutureForcedDependency(s, t) {
    return this.recordIncrementalData(Wt, t), this;
  }
  inheritSimpleDataAsFutureForcedDependencies(s) {
    for (const t of s) t in this.#t && this.recordFutureForcedDependency(t, this.#t[t]);
    return this;
  }
  inheritPendingDependenciesAsFutureForcedDependencies() {
    for (const s of this.#i) this.recordFutureForcedDependency(Wt, s);
    return this;
  }
  resetBBox(s) {
    return this.#o.resetBBox(s), this;
  }
  recordClipBox(s, t, e, i, n, r) {
    return this.#o.recordClipBox(s, t, e, i, n, r), this;
  }
  recordBBox(s, t, e, i, n, r) {
    return this.#o.recordBBox(s, t, e, i, n, r), this;
  }
  recordCharacterBBox(s, t, e, i = 1, n = 0, r = 0, a) {
    const o = e.bbox;
    let l, h;
    if (o && (l = o[2] !== o[0] && o[3] !== o[1] && this.#n.get(e), l !== !1 && (h = [
      0,
      0,
      0,
      0
    ], _.axialAlignedBoundingBox(o, e.fontMatrix, h), (i !== 1 || n !== 0 || r !== 0) && Wn(i, -i, n, r, h), l)))
      return this.recordBBox(s, t, h[0], h[2], h[1], h[3]);
    if (!a) return this.recordFullPageBBox(s);
    const c = a();
    return o && h && l === void 0 && (l = h[0] <= n - c.actualBoundingBoxLeft && h[2] >= n + c.actualBoundingBoxRight && h[1] <= r - c.actualBoundingBoxAscent && h[3] >= r + c.actualBoundingBoxDescent, this.#n.set(e, l), l) ? this.recordBBox(s, t, h[0], h[2], h[1], h[3]) : this.recordBBox(s, t, n - c.actualBoundingBoxLeft, n + c.actualBoundingBoxRight, r - c.actualBoundingBoxAscent, r + c.actualBoundingBoxDescent);
  }
  recordFullPageBBox(s) {
    return this.#o.recordFullPageBBox(s), this;
  }
  getSimpleIndex(s) {
    return this.#t[s];
  }
  recordDependencies(s, t) {
    const e = this.#i, i = this.#t, n = this.#e;
    for (const r of t) r in this.#t ? e.add(i[r]) : r in n && n[r].forEach(e.add, e);
    return this;
  }
  recordNamedDependency(s, t) {
    return this.#s.has(t) && this.#i.add(this.#s.get(t)), this;
  }
  recordOperation(s, t = !1) {
    if (this.recordDependencies(s, [Wt]), this.#a) {
      const i = qs(this.#a, s), { dependencies: n } = i;
      this.#i.forEach(n.add, n), this.#o._savesStack.forEach(n.add, n), this.#o._markedContentStack.forEach(n.add, n), n.delete(s), i.isRenderingOperation = !0;
    }
    const e = !t && s === this.#o._pendingBBoxIdx;
    return this.#o.recordOperation(s, t, [
      this.#i,
      this.#o._savesStack,
      this.#o._markedContentStack
    ]), e && this.#i.clear(), this;
  }
  recordShowTextOperation(s, t = !1) {
    const e = Array.from(this.#i);
    this.recordOperation(s, t), this.recordIncrementalData("sameLineText", s);
    for (const i of e) this.recordIncrementalData("sameLineText", i);
    return this;
  }
  bboxToClipBoxDropOperation(s, t = !1) {
    const e = !t && s === this.#o._pendingBBoxIdx;
    return this.#o.bboxToClipBoxDropOperation(s), e && this.#i.clear(), this;
  }
  take() {
    return this.#n.clear(), this.#o.take();
  }
  takeDebugMetadata() {
    return this.#a;
  }
}, fs = class Mi {
  #t;
  #e;
  #s;
  #i = 0;
  #n = 0;
  constructor(t, e, i) {
    if (t instanceof Mi && t.#s === !!i) return t;
    this.#t = t, this.#e = e, this.#s = !!i;
  }
  get clipBox() {
    return this.#t.clipBox;
  }
  growOperationsCount() {
    throw new Error("Unreachable");
  }
  save(t) {
    return this.#n++, this.#t.save(this.#e), this;
  }
  restore(t) {
    return this.#n > 0 && (this.#t.restore(this.#e), this.#n--), this;
  }
  recordOpenMarker(t) {
    return this.#i++, this;
  }
  getOpenMarker() {
    return this.#i > 0 ? this.#e : this.#t.getOpenMarker();
  }
  recordCloseMarker(t) {
    return this.#i--, this;
  }
  beginMarkedContent(t) {
    return this;
  }
  endMarkedContent(t) {
    return this;
  }
  pushBaseTransform(t) {
    return this.#t.pushBaseTransform(t), this;
  }
  popBaseTransform() {
    return this.#t.popBaseTransform(), this;
  }
  recordSimpleData(t, e) {
    return this.#t.recordSimpleData(t, this.#e), this;
  }
  recordIncrementalData(t, e) {
    return this.#t.recordIncrementalData(t, this.#e), this;
  }
  resetIncrementalData(t, e) {
    return this.#t.resetIncrementalData(t, this.#e), this;
  }
  recordNamedData(t, e) {
    return this;
  }
  recordSimpleDataFromNamed(t, e, i) {
    return this.#t.recordSimpleDataFromNamed(t, e, this.#e), this;
  }
  recordFutureForcedDependency(t, e) {
    return this.#t.recordFutureForcedDependency(t, this.#e), this;
  }
  inheritSimpleDataAsFutureForcedDependencies(t) {
    return this.#t.inheritSimpleDataAsFutureForcedDependencies(t), this;
  }
  inheritPendingDependenciesAsFutureForcedDependencies() {
    return this.#t.inheritPendingDependenciesAsFutureForcedDependencies(), this;
  }
  resetBBox(t) {
    return this.#s || this.#t.resetBBox(this.#e), this;
  }
  recordClipBox(t, e, i, n, r, a) {
    return this.#s || this.#t.recordClipBox(this.#e, e, i, n, r, a), this;
  }
  recordBBox(t, e, i, n, r, a) {
    return this.#s || this.#t.recordBBox(this.#e, e, i, n, r, a), this;
  }
  recordCharacterBBox(t, e, i, n, r, a, o) {
    return this.#s || this.#t.recordCharacterBBox(this.#e, e, i, n, r, a, o), this;
  }
  recordFullPageBBox(t) {
    return this.#s || this.#t.recordFullPageBBox(this.#e), this;
  }
  getSimpleIndex(t) {
    return this.#t.getSimpleIndex(t);
  }
  recordDependencies(t, e) {
    return this.#t.recordDependencies(this.#e, e), this;
  }
  recordNamedDependency(t, e) {
    return this.#t.recordNamedDependency(this.#e, e), this;
  }
  recordOperation(t) {
    return this.#t.recordOperation(this.#e, !0), this;
  }
  recordShowTextOperation(t) {
    return this.#t.recordShowTextOperation(this.#e, !0), this;
  }
  bboxToClipBoxDropOperation(t) {
    return this.#s || this.#t.bboxToClipBoxDropOperation(this.#e, !0), this;
  }
  take() {
    throw new Error("Unreachable");
  }
  takeDebugMetadata() {
    throw new Error("Unreachable");
  }
}, bt = {
  stroke: [
    "path",
    "transform",
    "filter",
    "strokeColor",
    "strokeAlpha",
    "lineWidth",
    "lineCap",
    "lineJoin",
    "miterLimit",
    "dash"
  ],
  fill: [
    "path",
    "transform",
    "filter",
    "fillColor",
    "fillAlpha",
    "globalCompositeOperation",
    "SMask"
  ],
  imageXObject: [
    "transform",
    "SMask",
    "filter",
    "fillAlpha",
    "strokeAlpha",
    "globalCompositeOperation"
  ],
  rawFillPath: [
    "filter",
    "fillColor",
    "fillAlpha"
  ],
  showText: [
    "transform",
    "leading",
    "charSpacing",
    "wordSpacing",
    "hScale",
    "textRise",
    "moveText",
    "textMatrix",
    "font",
    "fontObj",
    "filter",
    "fillColor",
    "textRenderingMode",
    "SMask",
    "fillAlpha",
    "strokeAlpha",
    "globalCompositeOperation",
    "sameLineText"
  ],
  transform: ["transform"],
  transformAndFill: ["transform", "fillColor"]
}, qn = class ps {
  #t;
  #e;
  #s = 4;
  #i = 0;
  #n = new ps.#a(this.#s * 6);
  static #a = z.isFloat16ArraySupported ? Float16Array : Float32Array;
  constructor(t) {
    this.#t = t.width, this.#e = t.height;
  }
  record(t, e, i, n) {
    if (this.#i === this.#s) {
      this.#s *= 2;
      const o = new ps.#a(this.#s * 6);
      o.set(this.#n), this.#n = o;
    }
    const r = j(t);
    let a;
    if (n[0] !== 1 / 0) {
      const o = Tt.slice();
      _.axialAlignedBoundingBox([
        0,
        -i,
        e,
        0
      ], r, o);
      const l = _.intersect(n, o);
      if (!l) return;
      const [h, c, d, u] = l;
      if (h !== o[0] || c !== o[1] || d !== o[2] || u !== o[3]) {
        const p = Math.atan2(r[1], r[0]), f = Math.abs(Math.sin(p)), m = Math.abs(Math.cos(p));
        if (f < 1e-6 || m < 1e-6 || Math.abs(f - m) < 1e-6) a = [
          h,
          c,
          h,
          u,
          d,
          c
        ];
        else {
          const g = d - h, b = u - c, y = f * f, A = m * m, w = m * f, v = A - y, S = (b * A - g * w) / v;
          a = [
            h + (b * w - g * y) / v,
            c,
            h,
            c + S,
            d,
            u - S
          ];
        }
      }
    }
    a || (a = [
      0,
      -i,
      0,
      0,
      e,
      -i
    ], _.applyTransform(a, r, 0), _.applyTransform(a, r, 2), _.applyTransform(a, r, 4)), a[0] /= this.#t, a[1] /= this.#e, a[2] /= this.#t, a[3] /= this.#e, a[4] /= this.#t, a[5] /= this.#e, this.#n.set(a, this.#i * 6), this.#i++;
  }
  take() {
    return this.#n.subarray(0, this.#i * 6);
  }
}, Qs = new RegExp("\\p{Cc}", "u");
function Qn(s) {
  const t = s[0];
  if (s.length < 2 || t !== '"' && t !== "'" || s.at(-1) !== t) return !1;
  const e = s.length - 1;
  for (let i = 1; i < e; i++) {
    const n = s[i];
    if (n === t || Qs.test(n) || n === "\\" && (++i >= e || Qs.test(s[i])))
      return !1;
  }
  return !0;
}
function Js(s) {
  return Qn(s) ? s : `"${s.replaceAll(/["\\\p{Cc}]/gu, (t) => t === '"' || t === "\\" ? `\\${t}` : `\\${t.codePointAt(0).toString(16)} `)}"`;
}
var Jn = class {
  #t = /* @__PURE__ */ new Set();
  #e = null;
  constructor({ ownerDocument: s = globalThis.document, styleElement: t = null }) {
    this._document = s, this.nativeFontFaces = /* @__PURE__ */ new Set(), this.styleElement = null, this.loadingRequests = [], this.loadTestFontId = 0;
  }
  addNativeFontFace(s) {
    this.nativeFontFaces.add(s), this._document.fonts.add(s);
  }
  removeNativeFontFace(s) {
    this.nativeFontFaces.delete(s), this._document.fonts.delete(s);
  }
  insertRule(s) {
    const t = this.#s();
    t.insertRule(s, t.cssRules.length);
  }
  #s() {
    if (this.#e) return this.#e;
    const s = this._document.defaultView?.CSSStyleSheet || globalThis.CSSStyleSheet;
    if (!this.styleElement && s) {
      const { adoptedStyleSheets: t } = this._document;
      if (t) {
        const e = new s();
        return t.push(e), this.#e = e;
      }
    }
    return this.styleElement || (this.styleElement = this._document.createElement("style"), this._document.documentElement.getElementsByTagName("head")[0].append(this.styleElement)), this.#e = this.styleElement.sheet;
  }
  clear() {
    for (const s of this.nativeFontFaces) this._document.fonts.delete(s);
    if (this.nativeFontFaces.clear(), this.#t.clear(), this.#e) {
      const { adoptedStyleSheets: s } = this._document;
      s?.includes(this.#e) && (this._document.adoptedStyleSheets = s.filter((t) => t !== this.#e)), this.#e = null;
    }
    this.styleElement && (this.styleElement.remove(), this.styleElement = null);
  }
  async loadSystemFont({ systemFontInfo: s, disableFontFace: t, _inspectFont: e }) {
    if (!(!s || this.#t.has(s.loadedName))) {
      if (Q(!t, "loadSystemFont shouldn't be called when `disableFontFace` is set."), this.isFontLoadingAPISupported) {
        const { loadedName: i, src: n, style: r } = s, a = new FontFace(i, n, r);
        this.addNativeFontFace(a);
        try {
          await a.load(), this.#t.add(i), e?.(s);
        } catch {
          R(`Cannot load system font: ${s.baseFontName}, installing it could help to improve PDF rendering.`), this.removeNativeFontFace(a);
        }
        return;
      }
      U("Not implemented: loadSystemFont without the Font Loading API.");
    }
  }
  async bind(s) {
    if (s.attached || s.missingFile && !s.systemFontInfo) return;
    if (s.attached = !0, s.systemFontInfo) {
      await this.loadSystemFont(s);
      return;
    }
    if (this.isFontLoadingAPISupported) {
      const e = s.createNativeFontFace();
      if (e) {
        this.addNativeFontFace(e);
        try {
          await e.loaded;
        } catch (i) {
          throw R(`Failed to load font '${e.family}': '${i}'.`), s.disableFontFace = !0, i;
        }
      }
      return;
    }
    const t = s.createFontFaceRule();
    if (t) {
      if (this.insertRule(t), this.isSyncFontLoadingSupported) return;
      await new Promise((e) => {
        const i = this._queueLoadingCallback(e);
        this._prepareFontLoadEvent(s, i);
      });
    }
  }
  get isFontLoadingAPISupported() {
    const s = !!this._document?.fonts;
    return P(this, "isFontLoadingAPISupported", s);
  }
  get isSyncFontLoadingSupported() {
    return P(this, "isSyncFontLoadingSupported", pt || z.platform.isFirefox);
  }
  _queueLoadingCallback(s) {
    function t() {
      for (Q(!i.done, "completeRequest() cannot be called twice."), i.done = !0; e.length > 0 && e[0].done; ) {
        const n = e.shift();
        setTimeout(n.callback, 0);
      }
    }
    const { loadingRequests: e } = this, i = {
      done: !1,
      complete: t,
      callback: s
    };
    return e.push(i), i;
  }
  get _loadTestFont() {
    const s = atob("T1RUTwALAIAAAwAwQ0ZGIDHtZg4AAAOYAAAAgUZGVE1lkzZwAAAEHAAAABxHREVGABQAFQAABDgAAAAeT1MvMlYNYwkAAAEgAAAAYGNtYXABDQLUAAACNAAAAUJoZWFk/xVFDQAAALwAAAA2aGhlYQdkA+oAAAD0AAAAJGhtdHgD6AAAAAAEWAAAAAZtYXhwAAJQAAAAARgAAAAGbmFtZVjmdH4AAAGAAAAAsXBvc3T/hgAzAAADeAAAACAAAQAAAAEAALZRFsRfDzz1AAsD6AAAAADOBOTLAAAAAM4KHDwAAAAAA+gDIQAAAAgAAgAAAAAAAAABAAADIQAAAFoD6AAAAAAD6AABAAAAAAAAAAAAAAAAAAAAAQAAUAAAAgAAAAQD6AH0AAUAAAKKArwAAACMAooCvAAAAeAAMQECAAACAAYJAAAAAAAAAAAAAQAAAAAAAAAAAAAAAFBmRWQAwAAuAC4DIP84AFoDIQAAAAAAAQAAAAAAAAAAACAAIAABAAAADgCuAAEAAAAAAAAAAQAAAAEAAAAAAAEAAQAAAAEAAAAAAAIAAQAAAAEAAAAAAAMAAQAAAAEAAAAAAAQAAQAAAAEAAAAAAAUAAQAAAAEAAAAAAAYAAQAAAAMAAQQJAAAAAgABAAMAAQQJAAEAAgABAAMAAQQJAAIAAgABAAMAAQQJAAMAAgABAAMAAQQJAAQAAgABAAMAAQQJAAUAAgABAAMAAQQJAAYAAgABWABYAAAAAAAAAwAAAAMAAAAcAAEAAAAAADwAAwABAAAAHAAEACAAAAAEAAQAAQAAAC7//wAAAC7////TAAEAAAAAAAABBgAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAD/gwAyAAAAAQAAAAAAAAAAAAAAAAAAAAABAAQEAAEBAQJYAAEBASH4DwD4GwHEAvgcA/gXBIwMAYuL+nz5tQXkD5j3CBLnEQACAQEBIVhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYAAABAQAADwACAQEEE/t3Dov6fAH6fAT+fPp8+nwHDosMCvm1Cvm1DAz6fBQAAAAAAAABAAAAAMmJbzEAAAAAzgTjFQAAAADOBOQpAAEAAAAAAAAADAAUAAQAAAABAAAAAgABAAAAAAAAAAAD6AAAAAAAAA==");
    return P(this, "_loadTestFont", s);
  }
  _prepareFontLoadEvent(s, t) {
    function e(y, A) {
      return y.charCodeAt(A) << 24 | y.charCodeAt(A + 1) << 16 | y.charCodeAt(A + 2) << 8 | y.charCodeAt(A + 3) & 255;
    }
    function i(y) {
      return String.fromCharCode(y >> 24 & 255, y >> 16 & 255, y >> 8 & 255, y & 255);
    }
    function n(y, A, w, v) {
      const S = y.substring(0, A), E = y.substring(A + w);
      return S + v + E;
    }
    let r, a;
    const o = this._document.createElement("canvas");
    o.width = 1, o.height = 1;
    const l = o.getContext("2d");
    let h = 0;
    function c(y, A) {
      if (++h > 30) {
        R("Load test font never loaded."), A();
        return;
      }
      if (l.font = "30px " + y, l.fillText(".", 0, 20), l.getImageData(0, 0, 1, 1).data[3] > 0) {
        A();
        return;
      }
      setTimeout(c.bind(null, y, A));
    }
    const d = `lt${Date.now()}${this.loadTestFontId++}`;
    let u = this._loadTestFont;
    u = n(u, 976, d.length, d);
    const p = 16, f = 1482184792;
    let m = e(u, p);
    for (r = 0, a = d.length - 3; r < a; r += 4) m = m - f + e(d, r) | 0;
    r < d.length && (m = m - f + e(d + "XXX", r) | 0), u = n(u, p, 4, i(m));
    const g = `@font-face {font-family:"${d}";src:${`url(data:font/opentype;base64,${btoa(u)});`}}`;
    this.insertRule(g);
    const b = this._document.createElement("div");
    b.style.visibility = "hidden", b.style.width = b.style.height = "10px", b.style.position = "absolute", b.style.top = b.style.left = "0px";
    for (const y of [s.loadedName, d]) {
      const A = this._document.createElement("span");
      A.textContent = "Hi", A.style.fontFamily = y, b.append(A);
    }
    this._document.body.append(b), c(d, () => {
      b.remove(), t.complete();
    });
  }
}, Zn = class {
  compiledGlyphs = /* @__PURE__ */ Object.create(null);
  #t;
  constructor(s, t = null, e, i) {
    this.#t = s, this._inspectFont = t, e && (this.charProcOperatorList = e), i && Object.assign(this, i);
  }
  createNativeFontFace() {
    if (!this.data || this.disableFontFace) return null;
    let s;
    if (!this.cssFontInfo) s = new FontFace(this.loadedName, this.data, {});
    else {
      const t = { weight: this.cssFontInfo.fontWeight };
      this.cssFontInfo.italicAngle && (t.style = `oblique ${this.cssFontInfo.italicAngle}deg`), s = new FontFace(Js(this.cssFontInfo.fontFamily), this.data, t);
    }
    return this._inspectFont?.(this), s;
  }
  createFontFaceRule() {
    if (!this.data || this.disableFontFace) return null;
    const s = `url(data:${this.mimetype};base64,${this.data.toBase64()});`;
    let t;
    if (!this.cssFontInfo) t = `@font-face {font-family:"${this.loadedName}";src:${s}}`;
    else {
      let e = `font-weight: ${this.cssFontInfo.fontWeight};`;
      this.cssFontInfo.italicAngle && (e += `font-style: oblique ${this.cssFontInfo.italicAngle}deg;`), t = `@font-face {font-family:${Js(this.cssFontInfo.fontFamily)};${e}src:${s}}`;
    }
    return this._inspectFont?.(this, s), t;
  }
  getPathGenerator(s, t) {
    if (this.compiledGlyphs[t] !== void 0) return this.compiledGlyphs[t];
    const e = this.loadedName + "_path_" + t;
    let i;
    try {
      i = s.get(e);
    } catch (r) {
      R(`getPathGenerator - ignoring character: "${r}".`);
    }
    const n = _i(i?.path);
    return this.fontExtraProperties || s.delete(e), this.compiledGlyphs[t] = n;
  }
  get black() {
    return this.#t.black;
  }
  get bold() {
    return this.#t.bold;
  }
  get disableFontFace() {
    return this.#t.disableFontFace;
  }
  set disableFontFace(s) {
    P(this, "disableFontFace", !!s);
  }
  get fontExtraProperties() {
    return this.#t.fontExtraProperties;
  }
  get isInvalidPDFjsFont() {
    return this.#t.isInvalidPDFjsFont;
  }
  get isType3Font() {
    return this.#t.isType3Font;
  }
  get italic() {
    return this.#t.italic;
  }
  get missingFile() {
    return this.#t.missingFile;
  }
  get remeasure() {
    return this.#t.remeasure;
  }
  get vertical() {
    return this.#t.vertical;
  }
  get ascent() {
    return this.#t.ascent;
  }
  get defaultWidth() {
    return this.#t.defaultWidth;
  }
  get descent() {
    return this.#t.descent;
  }
  get bbox() {
    return this.#t.bbox;
  }
  get fontMatrix() {
    return this.#t.fontMatrix;
  }
  get fallbackName() {
    return this.#t.fallbackName;
  }
  get loadedName() {
    return this.#t.loadedName;
  }
  get mimetype() {
    return this.#t.mimetype;
  }
  get name() {
    return this.#t.name;
  }
  get data() {
    return this.#t.data;
  }
  clearData() {
    this.#t.clearData();
  }
  get cssFontInfo() {
    return this.#t.cssFontInfo;
  }
  get systemFontInfo() {
    return this.#t.systemFontInfo;
  }
  get defaultVMetrics() {
    return this.#t.defaultVMetrics;
  }
}, tr = class {
  static strings = [
    "fontFamily",
    "fontWeight",
    "italicAngle"
  ];
}, er = class {
  static strings = [
    "css",
    "loadedName",
    "baseFontName",
    "src"
  ];
}, yt = class {
  static bools = [
    "black",
    "bold",
    "disableFontFace",
    "fontExtraProperties",
    "isInvalidPDFjsFont",
    "isType3Font",
    "italic",
    "missingFile",
    "remeasure",
    "vertical"
  ];
  static numbers = [
    "ascent",
    "defaultWidth",
    "descent"
  ];
  static strings = [
    "fallbackName",
    "loadedName",
    "mimetype",
    "name"
  ];
  static OFFSET_NUMBERS = Math.ceil(this.bools.length * 2 / 8);
  static OFFSET_BBOX = this.OFFSET_NUMBERS + this.numbers.length * 8;
  static OFFSET_FONT_MATRIX = this.OFFSET_BBOX + 1 + 8;
  static OFFSET_DEFAULT_VMETRICS = this.OFFSET_FONT_MATRIX + 1 + 48;
  static OFFSET_STRINGS = this.OFFSET_DEFAULT_VMETRICS + 1 + 6;
}, Rt = class {
  static KIND = 0;
  static HAS_BBOX = 1;
  static HAS_BACKGROUND = 2;
  static SHADING_TYPE = 3;
  static N_COORD = 4;
  static N_COLOR = 8;
  static N_STOP = 12;
  static N_FIGURES = 16;
}, ke = class {
  static get decoder() {
    return P(this, "decoder", new TextDecoder());
  }
  static get encoder() {
    return P(this, "encoder", new TextEncoder());
  }
}, sr = class {
  #t;
  #e;
  constructor(s) {
    this.#t = s, this.#e = new DataView(s);
  }
  #s(s) {
    Q(s < tr.strings.length, "Invalid string index");
    const { decoder: t } = ke;
    let e = 0;
    for (let n = 0; n < s; n++) e += this.#e.getUint32(e) + 4;
    const i = this.#e.getUint32(e);
    return t.decode(new Uint8Array(this.#t, e + 4, i));
  }
  get fontFamily() {
    return this.#s(0);
  }
  get fontWeight() {
    return this.#s(1);
  }
  get italicAngle() {
    return this.#s(2);
  }
}, ir = class {
  #t;
  #e;
  constructor(s) {
    this.#t = s, this.#e = new DataView(s);
  }
  get guessFallback() {
    return this.#e.getUint8(0) !== 0;
  }
  #s(s) {
    Q(s < er.strings.length, "Invalid string index");
    const { decoder: t } = ke;
    let e = 5;
    for (let n = 0; n < s; n++) e += this.#e.getUint32(e) + 4;
    const i = this.#e.getUint32(e);
    return t.decode(new Uint8Array(this.#t, e + 4, i));
  }
  get css() {
    return this.#s(0);
  }
  get loadedName() {
    return this.#s(1);
  }
  get baseFontName() {
    return this.#s(2);
  }
  get src() {
    return this.#s(3);
  }
  get style() {
    const { decoder: s } = ke;
    let t = 1;
    t += 4 + this.#e.getUint32(t);
    const e = this.#e.getUint32(t), i = s.decode(new Uint8Array(this.#t, t + 4, e));
    t += 4 + e;
    const n = this.#e.getUint32(t);
    return {
      style: i,
      weight: s.decode(new Uint8Array(this.#t, t + 4, n))
    };
  }
}, nr = class {
  #t;
  #e;
  constructor({ buffer: s, extra: t }) {
    this.#t = s, this.#e = new DataView(s), t && Object.assign(this, t);
  }
  #s(s) {
    Q(s < yt.bools.length, "Invalid boolean index");
    const t = Math.floor(s / 4), e = s * 2 % 8, i = this.#e.getUint8(t) >> e & 3;
    return i === 0 ? void 0 : i === 2;
  }
  get black() {
    return this.#s(0);
  }
  get bold() {
    return this.#s(1);
  }
  get disableFontFace() {
    return this.#s(2);
  }
  get fontExtraProperties() {
    return this.#s(3);
  }
  get isInvalidPDFjsFont() {
    return this.#s(4);
  }
  get isType3Font() {
    return this.#s(5);
  }
  get italic() {
    return this.#s(6);
  }
  get missingFile() {
    return this.#s(7);
  }
  get remeasure() {
    return this.#s(8);
  }
  get vertical() {
    return this.#s(9);
  }
  #i(s) {
    return Q(s < yt.numbers.length, "Invalid number index"), this.#e.getFloat64(yt.OFFSET_NUMBERS + s * 8);
  }
  get ascent() {
    return this.#i(0);
  }
  get defaultWidth() {
    return this.#i(1);
  }
  get descent() {
    return this.#i(2);
  }
  #n(s, t, e, i) {
    const n = this.#e.getUint8(s);
    if (n === 0) return;
    Q(n === t, "Invalid array length."), s += 1;
    const r = new Array(n);
    for (let a = 0; a < n; a++)
      r[a] = this.#e[e](s, !0), s += i;
    return r;
  }
  get bbox() {
    return this.#n(yt.OFFSET_BBOX, 4, "getInt16", 2);
  }
  get fontMatrix() {
    return this.#n(yt.OFFSET_FONT_MATRIX, 6, "getFloat64", 8);
  }
  get defaultVMetrics() {
    return this.#n(yt.OFFSET_DEFAULT_VMETRICS, 3, "getInt16", 2);
  }
  #a(s) {
    Q(s < yt.strings.length, "Invalid string index");
    const { decoder: t } = ke;
    let e = yt.OFFSET_STRINGS + 4;
    for (let n = 0; n < s; n++) e += this.#e.getUint32(e) + 4;
    const i = this.#e.getUint32(e);
    return t.decode(new Uint8Array(this.#t, e + 4, i));
  }
  get fallbackName() {
    return this.#a(0);
  }
  get loadedName() {
    return this.#a(1);
  }
  get mimetype() {
    return this.#a(2);
  }
  get name() {
    return this.#a(3);
  }
  #r() {
    let s = yt.OFFSET_STRINGS;
    const t = this.#e.getUint32(s);
    s += 4 + t;
    const e = this.#e.getUint32(s);
    s += 4 + e;
    const i = this.#e.getUint32(s);
    s += 4 + i;
    const n = this.#e.getUint32(s);
    return {
      offset: s,
      length: n
    };
  }
  get data() {
    const { offset: s, length: t } = this.#r();
    return t === 0 ? void 0 : new Uint8Array(this.#t, s + 4, t);
  }
  clearData() {
    const { offset: s, length: t } = this.#r();
    t !== 0 && (this.#e.setUint32(s, 0), this.#t = new Uint8Array(this.#t, 0, s + 4).slice().buffer, this.#e = new DataView(this.#t));
  }
  get cssFontInfo() {
    let s = yt.OFFSET_STRINGS;
    const t = this.#e.getUint32(s);
    s += 4 + t;
    const e = this.#e.getUint32(s);
    s += 4 + e;
    const i = this.#e.getUint32(s);
    if (i === 0) return null;
    const n = new Uint8Array(i);
    return n.set(new Uint8Array(this.#t, s + 4, i)), new sr(n.buffer);
  }
  get systemFontInfo() {
    let s = yt.OFFSET_STRINGS;
    const t = this.#e.getUint32(s);
    s += 4 + t;
    const e = this.#e.getUint32(s);
    if (e === 0) return null;
    const i = new Uint8Array(e);
    return i.set(new Uint8Array(this.#t, s + 4, e)), new ir(i.buffer);
  }
}, rr = class {
  constructor(s) {
    this.buffer = s, this.view = new DataView(s), this.data = new Uint8Array(s);
  }
  getIR() {
    const s = this.view, t = this.data[Rt.KIND], e = !!this.data[Rt.HAS_BBOX], i = !!this.data[Rt.HAS_BACKGROUND], n = s.getUint32(Rt.N_COORD, !0), r = s.getUint32(Rt.N_COLOR, !0), a = s.getUint32(Rt.N_STOP, !0);
    let o = 20;
    const l = new Float32Array(this.buffer, o, n * 2);
    o += n * 8;
    const h = new Uint8Array(this.buffer, o, r * 4);
    o += r * 4;
    const c = [];
    for (let p = 0; p < a; ++p) {
      const f = s.getFloat32(o, !0);
      o += 4;
      const m = s.getUint32(o, !0);
      o += 4, c.push([f, `#${m.toString(16).padStart(6, "0")}`]);
    }
    let d = null;
    if (e) {
      d = [];
      for (let p = 0; p < 4; ++p)
        d.push(s.getFloat32(o, !0)), o += 4;
    }
    let u = null;
    if (i && (u = new Uint8Array(this.buffer, o, 3), o += 3), t === 1) return [
      "RadialAxial",
      "axial",
      d,
      c,
      Array.from(l.slice(0, 2)),
      Array.from(l.slice(2, 4)),
      null,
      null
    ];
    if (t === 2) return [
      "RadialAxial",
      "radial",
      d,
      c,
      [l[0], l[1]],
      [l[3], l[4]],
      l[2],
      l[5]
    ];
    if (t === 3) {
      const p = this.data[Rt.SHADING_TYPE];
      let f = null;
      if (l.length > 0) {
        f = Tt.slice();
        for (let m = 0, g = l.length; m < g; m += 2) _.pointBoundingBox(l[m], l[m + 1], f);
      }
      return [
        "Mesh",
        p,
        l,
        h,
        n,
        f,
        d,
        u
      ];
    }
    throw new Error(`Unsupported pattern kind: ${t}`);
  }
}, ar = class {
  #t;
  constructor(s) {
    this.#t = s;
  }
  get path() {
    return z.isFloat16ArraySupported ? new Float16Array(this.#t) : new Float32Array(this.#t);
  }
};
function or(s) {
  if (s instanceof URL) return s;
  if (typeof s == "string") {
    if (pt) {
      if (/^[a-z][a-z0-9\-+.]+:/i.test(s)) return new URL(s);
      const e = process.getBuiltinModule("url");
      return new URL(e.pathToFileURL(s));
    }
    const t = URL.parse(s, window.location);
    if (t) return t;
  }
  throw new Error("Invalid PDF url data: either string or URL-object is expected in the url property.");
}
function lr(s) {
  if (pt && typeof Buffer < "u" && s instanceof Buffer) throw new Error("Please provide binary data as `Uint8Array`, rather than `Buffer`.");
  if (s instanceof Uint8Array && s.byteLength === s.buffer.byteLength) return s;
  if (typeof s == "string") return Le(s);
  if (s instanceof ArrayBuffer || ArrayBuffer.isView(s) || typeof s == "object" && !isNaN(s?.length)) return new Uint8Array(s);
  throw new Error("Invalid PDF binary data: either TypedArray, string, or array-like object is expected in the data property.");
}
function pe(s) {
  if (typeof s != "string") return null;
  if (s.endsWith("/")) return s;
  throw new Error(`Invalid factory url: "${s}" must include trailing slash.`);
}
var gs = (s) => typeof s == "object" && Number.isInteger(s?.num) && s.num >= 0 && Number.isInteger(s?.gen) && s.gen >= 0, hr = (s) => typeof s == "object" && typeof s?.name == "string", cr = kn.bind(null, gs, hr), dr = class {
  #t = /* @__PURE__ */ new Map();
  #e = Promise.resolve();
  postMessage(s, t) {
    const e = { data: structuredClone(s, t ? { transfer: t } : null) };
    this.#e.then(() => {
      for (const [i] of this.#t) i.call(this, e);
    });
  }
  addEventListener(s, t, e = null) {
    let i = null;
    if (e?.signal instanceof AbortSignal) {
      const { signal: n } = e;
      if (n.aborted) {
        R("LoopbackPort - cannot use an `aborted` signal.");
        return;
      }
      const r = () => this.removeEventListener(s, t);
      i = () => n.removeEventListener("abort", r), n.addEventListener("abort", r);
    }
    this.#t.set(t, i);
  }
  removeEventListener(s, t) {
    this.#t.get(t)?.(), this.#t.delete(t);
  }
  terminate() {
    for (const [, s] of this.#t) s?.();
    this.#t.clear();
  }
}, ge = {
  DATA: 1,
  ERROR: 2
}, Z = {
  CANCEL: 1,
  CANCEL_COMPLETE: 2,
  CLOSE: 3,
  ENQUEUE: 4,
  ERROR: 5,
  PULL: 6,
  PULL_COMPLETE: 7,
  START_COMPLETE: 8
};
function Zs() {
}
function dt(s) {
  if (s instanceof Lt || s instanceof ss || s instanceof es || s instanceof Te || s instanceof Ve) return s;
  switch (s instanceof Error || typeof s == "object" && s !== null || U('wrapReason: Expected "reason" to be a (possibly cloned) Error.'), s.name) {
    case "AbortException":
      return new Lt(s.message);
    case "InvalidPDFException":
      return new ss(s.message);
    case "PasswordException":
      return new es(s.message, s.code);
    case "ResponseException":
      return new Te(s.message, s.status, s.missing);
    case "UnknownErrorException":
      return new Ve(s.message, s.details);
  }
  return new Ve(s.message, s.toString());
}
var se = class {
  #t = new AbortController();
  constructor(s, t, e) {
    this.sourceName = s, this.targetName = t, this.comObj = e, this.callbackId = 1, this.streamId = 1, this.streamSinks = /* @__PURE__ */ Object.create(null), this.streamControllers = /* @__PURE__ */ Object.create(null), this.callbackCapabilities = /* @__PURE__ */ Object.create(null), this.actionHandler = /* @__PURE__ */ Object.create(null), e.addEventListener("message", this.#e.bind(this), { signal: this.#t.signal });
  }
  #e({ data: s }) {
    if (s.targetName !== this.sourceName) return;
    if (s.stream) {
      this.#i(s);
      return;
    }
    if (s.callback) {
      const e = s.callbackId, i = this.callbackCapabilities[e];
      if (!i) throw new Error(`Cannot resolve callback ${e}`);
      if (delete this.callbackCapabilities[e], s.callback === ge.DATA) i.resolve(s.data);
      else if (s.callback === ge.ERROR) i.reject(dt(s.reason));
      else throw new Error("Unexpected callback case");
      return;
    }
    const t = this.actionHandler[s.action];
    if (!t) throw new Error(`Unknown action from worker: ${s.action}`);
    if (s.callbackId) {
      const e = this.sourceName, i = s.sourceName, n = this.comObj;
      Promise.try(t, s.data).then(function(r) {
        n.postMessage({
          sourceName: e,
          targetName: i,
          callback: ge.DATA,
          callbackId: s.callbackId,
          data: r
        });
      }, function(r) {
        n.postMessage({
          sourceName: e,
          targetName: i,
          callback: ge.ERROR,
          callbackId: s.callbackId,
          reason: dt(r)
        });
      });
      return;
    }
    if (s.streamId) {
      this.#s(s);
      return;
    }
    t(s.data);
  }
  on(s, t) {
    const e = this.actionHandler;
    if (e[s]) throw new Error(`There is already an actionName called "${s}"`);
    e[s] = t;
  }
  send(s, t, e) {
    this.comObj.postMessage({
      sourceName: this.sourceName,
      targetName: this.targetName,
      action: s,
      data: t
    }, e);
  }
  sendWithPromise(s, t, e) {
    const i = this.callbackId++, n = Promise.withResolvers();
    this.callbackCapabilities[i] = n;
    try {
      this.comObj.postMessage({
        sourceName: this.sourceName,
        targetName: this.targetName,
        action: s,
        callbackId: i,
        data: t
      }, e);
    } catch (r) {
      n.reject(r);
    }
    return n.promise;
  }
  sendWithStream(s, t, e, i) {
    const n = this.streamId++, r = this.sourceName, a = this.targetName, o = this.comObj;
    return new ReadableStream({
      start: (l) => {
        const h = Promise.withResolvers();
        return this.streamControllers[n] = {
          controller: l,
          startCall: h,
          pullCall: null,
          cancelCall: null,
          isClosed: !1
        }, o.postMessage({
          sourceName: r,
          targetName: a,
          action: s,
          streamId: n,
          data: t,
          desiredSize: l.desiredSize
        }, i), h.promise;
      },
      pull: (l) => {
        const h = Promise.withResolvers();
        return this.streamControllers[n].pullCall = h, o.postMessage({
          sourceName: r,
          targetName: a,
          stream: Z.PULL,
          streamId: n,
          desiredSize: l.desiredSize
        }), h.promise;
      },
      cancel: (l) => {
        Q(l instanceof Error, "cancel must have a valid reason");
        const h = Promise.withResolvers();
        return this.streamControllers[n].cancelCall = h, this.streamControllers[n].isClosed = !0, o.postMessage({
          sourceName: r,
          targetName: a,
          stream: Z.CANCEL,
          streamId: n,
          reason: dt(l)
        }), h.promise;
      }
    }, e);
  }
  #s(s) {
    const t = s.streamId, e = this.sourceName, i = s.sourceName, n = this.comObj, r = this, a = this.actionHandler[s.action], o = {
      enqueue(l, h = 1, c) {
        if (this.isCancelled) return;
        const d = this.desiredSize;
        this.desiredSize -= h, d > 0 && this.desiredSize <= 0 && (this.sinkCapability = Promise.withResolvers(), this.ready = this.sinkCapability.promise), n.postMessage({
          sourceName: e,
          targetName: i,
          stream: Z.ENQUEUE,
          streamId: t,
          chunk: l
        }, c);
      },
      close() {
        this.isCancelled || (this.isCancelled = !0, n.postMessage({
          sourceName: e,
          targetName: i,
          stream: Z.CLOSE,
          streamId: t
        }), delete r.streamSinks[t]);
      },
      error(l) {
        Q(l instanceof Error, "error must have a valid reason"), !this.isCancelled && (this.isCancelled = !0, n.postMessage({
          sourceName: e,
          targetName: i,
          stream: Z.ERROR,
          streamId: t,
          reason: dt(l)
        }));
      },
      sinkCapability: Promise.withResolvers(),
      onPull: null,
      onCancel: null,
      isCancelled: !1,
      desiredSize: s.desiredSize,
      ready: null
    };
    o.sinkCapability.resolve(), o.ready = o.sinkCapability.promise, this.streamSinks[t] = o, Promise.try(a, s.data, o).then(function() {
      n.postMessage({
        sourceName: e,
        targetName: i,
        stream: Z.START_COMPLETE,
        streamId: t,
        success: !0
      });
    }, function(l) {
      n.postMessage({
        sourceName: e,
        targetName: i,
        stream: Z.START_COMPLETE,
        streamId: t,
        reason: dt(l)
      });
    });
  }
  #i(s) {
    const t = s.streamId, e = this.sourceName, i = s.sourceName, n = this.comObj, r = this.streamControllers[t], a = this.streamSinks[t];
    switch (s.stream) {
      case Z.START_COMPLETE:
        s.success ? r.startCall.resolve() : r.startCall.reject(dt(s.reason));
        break;
      case Z.PULL_COMPLETE:
        s.success ? r.pullCall.resolve() : r.pullCall.reject(dt(s.reason));
        break;
      case Z.PULL:
        if (!a) {
          n.postMessage({
            sourceName: e,
            targetName: i,
            stream: Z.PULL_COMPLETE,
            streamId: t,
            success: !0
          });
          break;
        }
        a.desiredSize <= 0 && s.desiredSize > 0 && a.sinkCapability.resolve(), a.desiredSize = s.desiredSize, Promise.try(a.onPull || Zs).then(function() {
          n.postMessage({
            sourceName: e,
            targetName: i,
            stream: Z.PULL_COMPLETE,
            streamId: t,
            success: !0
          });
        }, function(l) {
          n.postMessage({
            sourceName: e,
            targetName: i,
            stream: Z.PULL_COMPLETE,
            streamId: t,
            reason: dt(l)
          });
        });
        break;
      case Z.ENQUEUE:
        if (Q(r, "enqueue should have stream controller"), r.isClosed) break;
        r.controller.enqueue(s.chunk);
        break;
      case Z.CLOSE:
        if (Q(r, "close should have stream controller"), r.isClosed) break;
        r.isClosed = !0, r.controller.close(), this.#n(r, t);
        break;
      case Z.ERROR:
        Q(r, "error should have stream controller"), r.controller.error(dt(s.reason)), this.#n(r, t);
        break;
      case Z.CANCEL_COMPLETE:
        s.success ? r.cancelCall.resolve() : r.cancelCall.reject(dt(s.reason)), this.#n(r, t);
        break;
      case Z.CANCEL:
        if (!a) break;
        const o = dt(s.reason);
        Promise.try(a.onCancel || Zs, o).then(function() {
          n.postMessage({
            sourceName: e,
            targetName: i,
            stream: Z.CANCEL_COMPLETE,
            streamId: t,
            success: !0
          });
        }, function(l) {
          n.postMessage({
            sourceName: e,
            targetName: i,
            stream: Z.CANCEL_COMPLETE,
            streamId: t,
            reason: dt(l)
          });
        }), a.sinkCapability.reject(o), a.isCancelled = !0, delete this.streamSinks[t];
        break;
      default:
        throw new Error("Unexpected stream case");
    }
  }
  async #n(s, t) {
    await Promise.allSettled([
      s.startCall?.promise,
      s.pullCall?.promise,
      s.cancelCall?.promise
    ]), delete this.streamControllers[t];
  }
  destroy() {
    this.#t?.abort(), this.#t = null;
  }
}, Di = class {
  #t = Object.freeze({
    cMapUrl: "CMap",
    standardFontDataUrl: "font",
    wasmUrl: "wasm"
  });
  constructor({ cMapUrl: s = null, standardFontDataUrl: t = null, wasmUrl: e = null }) {
    this.cMapUrl = s, this.standardFontDataUrl = t, this.wasmUrl = e;
  }
  async fetch({ kind: s, filename: t }) {
    switch (s) {
      case "cMapUrl":
      case "standardFontDataUrl":
      case "wasmUrl":
        break;
      default:
        U(`Not implemented: ${s}`);
    }
    const e = this[s];
    if (!e) throw new Error(`Ensure that the \`${s}\` API parameter is provided.`);
    const i = `${e}${t}`;
    return this._fetch(i, s).catch((n) => {
      throw new Error(`Unable to load ${this.#t[s]} data at: ${i}`);
    });
  }
  async _fetch(s, t) {
    U("Abstract method `_fetch` called.");
  }
}, ti = class extends Di {
  async _fetch(s, t) {
    const e = await Ts(s, t === "cMapUrl" && !s.endsWith(".bcmap") ? "text" : "bytes");
    return e instanceof Uint8Array ? e : Le(e);
  }
}, Ii = class {
  #t = !1;
  constructor({ enableHWA: s = !1 }) {
    this.#t = s;
  }
  create(s, t) {
    if (s <= 0 || t <= 0) throw new Error("Invalid canvas size");
    const e = this._createCanvas(s, t);
    return {
      canvas: e,
      context: e.getContext("2d", { willReadFrequently: !this.#t })
    };
  }
  reset({ canvas: s }, t, e) {
    if (!s) throw new Error("Canvas is not specified");
    if (t <= 0 || e <= 0) throw new Error("Invalid canvas size");
    s.width = t, s.height = e;
  }
  destroy(s) {
    const { canvas: t } = s;
    if (!t) throw new Error("Canvas is not specified");
    t.width = t.height = 0, s.canvas = null, s.context = null;
  }
  _createCanvas(s, t) {
    U("Abstract method `_createCanvas` called.");
  }
}, ur = class extends Ii {
  constructor({ ownerDocument: s = globalThis.document, enableHWA: t = !1 }) {
    super({ enableHWA: t }), this._document = s;
  }
  _createCanvas(s, t) {
    const e = this._document.createElement("canvas");
    return e.width = s, e.height = t, e;
  }
}, Li = class {
  addFilter(s) {
    return "none";
  }
  addHCMFilter(s, t) {
    return "none";
  }
  addAlphaFilter(s) {
    return "none";
  }
  addLuminosityFilter(s) {
    return "none";
  }
  addKnockoutFilter(s = 0) {
    return "none";
  }
  addHighlightHCMFilter(s, t, e, i, n) {
    return "none";
  }
  addSelectionHCMFilter(s, t) {
    return "none";
  }
  addSelectionFilter() {
    return "none";
  }
  createSelectionStyle(s = null) {
    return null;
  }
  destroy(s = !1) {
  }
}, fr = class extends Li {
  #t;
  #e;
  #s;
  #i;
  #n;
  #a;
  #r = 0;
  constructor({ docId: s, ownerDocument: t = globalThis.document }) {
    super(), this.#i = s, this.#n = t;
  }
  get #o() {
    return this.#e ||= /* @__PURE__ */ new Map();
  }
  get #l() {
    return this.#a ||= /* @__PURE__ */ new Map();
  }
  get #h() {
    if (!this.#s) {
      const s = this.#n.createElement("div"), { style: t } = s;
      t.colorScheme = "only light", t.visibility = "hidden", t.contain = "strict", t.width = t.height = 0, t.position = "absolute", t.top = t.left = 0, t.zIndex = -1;
      const e = this.#n.createElementNS(lt, "svg");
      e.setAttribute("width", 0), e.setAttribute("height", 0), this.#s = this.#n.createElementNS(lt, "defs"), s.append(e), e.append(this.#s), this.#n.body.append(s);
    }
    return this.#s;
  }
  #u(s) {
    if (s.length === 1) {
      const o = s[0], l = new Array(256);
      for (let c = 0; c < 256; c++) l[c] = o[c] / 255;
      const h = l.join(",");
      return [
        h,
        h,
        h
      ];
    }
    const [t, e, i] = s, n = new Array(256), r = new Array(256), a = new Array(256);
    for (let o = 0; o < 256; o++)
      n[o] = t[o] / 255, r[o] = e[o] / 255, a[o] = i[o] / 255;
    return [
      n.join(","),
      r.join(","),
      a.join(",")
    ];
  }
  #d(s) {
    if (this.#t === void 0) {
      this.#t = "";
      const t = this.#n.URL;
      t !== this.#n.baseURI && (Fe(t) ? R('#createUrl: ignore "data:"-URL for performance reasons.') : this.#t = yi(t, ""));
    }
    return `url(${this.#t}#${s})`;
  }
  addFilter(s) {
    if (!s) return "none";
    let t = this.#o.get(s);
    if (t) return t;
    const [e, i, n] = this.#u(s), r = s.length === 1 ? e : `${e}${i}${n}`;
    if (t = this.#o.get(r), t)
      return this.#o.set(s, t), t;
    const a = `g_${this.#i}_transfer_map_${this.#r++}`, o = this.#d(a);
    this.#o.set(s, o), this.#o.set(r, o);
    const l = this.#m(a);
    return this.#p(e, i, n, l), o;
  }
  addHCMFilter(s, t) {
    const e = `${s}-${t}`, i = "base";
    let n = this.#l.get(i);
    if (n?.key === e || (n ? (n.filter?.remove(), n.key = e, n.url = "none", n.filter = null) : (n = {
      key: e,
      url: "none",
      filter: null
    }, this.#l.set(i, n)), !s || !t)) return n.url;
    const r = this.#y(s);
    s = _.makeHexColor(...r);
    const a = this.#y(t);
    if (t = _.makeHexColor(...a), this.#v(), s === "#000000" && t === "#ffffff" || s === t) return n.url;
    const o = Array.from({ length: 256 }, (d, u) => hs(u / 255)).join(","), l = `g_${this.#i}_hcm_filter`, h = n.filter = this.#m(l);
    this.#p(o, o, o, h), this.#g(h);
    const c = (d, u) => {
      const p = r[d] / 255, f = a[d] / 255, m = new Array(u + 1);
      for (let g = 0; g <= u; g++) m[g] = p + g / u * (f - p);
      return m.join(",");
    };
    return this.#p(c(0, 5), c(1, 5), c(2, 5), h), n.url = this.#d(l), n.url;
  }
  addSelectionHCMFilter(s, t) {
    return this.addHighlightHCMFilter("selection", s, t, "HighlightText", "Highlight");
  }
  addSelectionFilter() {
    return this.addHighlightHCMFilter("selection_default", "black", "white", "HighlightText", "Highlight");
  }
  createSelectionStyle(s = null) {
    const t = s ? this.addSelectionHCMFilter(s.foreground, s.background) : this.addSelectionFilter();
    return t === "none" || !z.platform.isFirefox ? null : {
      "backdrop-filter": t,
      "background-color": "transparent"
    };
  }
  addAlphaFilter(s) {
    let t = this.#o.get(s);
    if (t) return t;
    const [e] = this.#u([s]), i = `alpha_${e}`;
    if (t = this.#o.get(i), t)
      return this.#o.set(s, t), t;
    const n = `g_${this.#i}_alpha_map_${this.#r++}`, r = this.#d(n);
    this.#o.set(s, r), this.#o.set(i, r);
    const a = this.#m(n);
    return this.#b(e, a), r;
  }
  addLuminosityFilter(s) {
    let t = this.#o.get(s || "luminosity");
    if (t) return t;
    let e, i;
    if (s ? ([e] = this.#u([s]), i = `luminosity_${e}`) : i = "luminosity", t = this.#o.get(i), t)
      return this.#o.set(s, t), t;
    const n = `g_${this.#i}_luminosity_map_${this.#r++}`, r = this.#d(n);
    this.#o.set(s, r), this.#o.set(i, r);
    const a = this.#m(n);
    return this.#f(a), s && this.#b(e, a), r;
  }
  addKnockoutFilter(s = 0) {
    const t = s > 0 ? Math.min(1 / s, 1e6) : 1e6, e = `knockout_${t}`, i = this.#o.get(e);
    if (i) return i;
    const n = `g_${this.#i}_knockout_filter_${this.#r++}`, r = this.#d(n);
    this.#o.set(e, r);
    const a = this.#m(n), o = this.#n.createElementNS(lt, "feComponentTransfer");
    a.append(o);
    const l = this.#n.createElementNS(lt, "feFuncA");
    return l.setAttribute("type", "linear"), l.setAttribute("slope", `${t}`), l.setAttribute("intercept", "0"), o.append(l), r;
  }
  addHighlightHCMFilter(s, t, e, i, n) {
    const r = `${t}-${e}-${i}-${n}`;
    let a = this.#l.get(s);
    if (a?.key === r || (a ? (a.filter?.remove(), a.key = r, a.url = "none", a.filter = null) : (a = {
      key: r,
      url: "none",
      filter: null
    }, this.#l.set(s, a)), !t || !e)) return a.url;
    const [o, l] = [t, e].map(this.#y.bind(this));
    let h = Math.round(0.2126 * o[0] + 0.7152 * o[1] + 0.0722 * o[2]), c = Math.round(0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]), [d, u] = [i, n].map(this.#E.bind(this));
    c < h && ([h, c, d, u] = [
      c,
      h,
      u,
      d
    ]), this.#v();
    const p = (g, b, y) => {
      const A = new Array(256), w = (c - h) / y, v = g / 255, S = (b - g) / (255 * y);
      let E = 0;
      for (let C = 0; C <= y; C++) {
        const x = Math.round(h + C * w), M = v + C * S;
        for (let k = E; k <= x; k++) A[k] = M;
        E = x + 1;
      }
      for (let C = E; C < 256; C++) A[C] = A[E - 1];
      return A.join(",");
    }, f = `g_${this.#i}_hcm_${s}_filter`, m = a.filter = this.#m(f);
    return this.#g(m), this.#p(p(d[0], u[0], 5), p(d[1], u[1], 5), p(d[2], u[2], 5), m), a.url = this.#d(f), a.url;
  }
  destroy(s = !1) {
    s && this.#a?.size || (this.#s?.parentNode.parentNode.remove(), this.#s = null, this.#e?.clear(), this.#e = null, this.#a?.clear(), this.#a = null, this.#r = 0);
  }
  #f(s) {
    const t = this.#n.createElementNS(lt, "feColorMatrix");
    t.setAttribute("type", "matrix"), t.setAttribute("values", "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0.59 0.11 0 0"), s.append(t);
  }
  #g(s) {
    const t = this.#n.createElementNS(lt, "feColorMatrix");
    t.setAttribute("type", "matrix"), t.setAttribute("values", "0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"), s.append(t);
  }
  #m(s) {
    const t = this.#n.createElementNS(lt, "filter");
    return t.setAttribute("color-interpolation-filters", "sRGB"), t.setAttribute("id", s), this.#h.append(t), t;
  }
  #c(s, t, e) {
    const i = this.#n.createElementNS(lt, t);
    i.setAttribute("type", "discrete"), i.setAttribute("tableValues", e), s.append(i);
  }
  #p(s, t, e, i) {
    const n = this.#n.createElementNS(lt, "feComponentTransfer");
    i.append(n), this.#c(n, "feFuncR", s), this.#c(n, "feFuncG", t), this.#c(n, "feFuncB", e);
  }
  #b(s, t) {
    const e = this.#n.createElementNS(lt, "feComponentTransfer");
    t.append(e), this.#c(e, "feFuncA", s);
  }
  #y(s) {
    return this.#h.style.color = "CanvasText", this.#h.style.backgroundColor = s, ce(getComputedStyle(this.#h).getPropertyValue("background-color"));
  }
  #A(s) {
    return this.#h.style.color = "CanvasText", this.#h.style.backgroundColor = s, he(getComputedStyle(this.#h).getPropertyValue("background-color"));
  }
  #v() {
    this.#h.style.color = "", this.#h.style.backgroundColor = "";
  }
  #E(s) {
    const [t, e, i, n] = this.#A(s);
    if (n === 1) return [
      t,
      e,
      i
    ];
    const [r, a, o] = this.#y("Canvas");
    return [
      Ke(t, r, n),
      Ke(e, a, n),
      Ke(i, o, n)
    ];
  }
};
function Ke(s, t, e) {
  return Math.round(e * s + (1 - e) * t);
}
pt && R("Please use the `legacy` build in Node.js environments.");
async function pr(s) {
  const t = await process.getBuiltinModule("fs/promises").readFile(s);
  return new Uint8Array(t);
}
var gr = class extends Li {
}, mr = class extends Ii {
  _createCanvas(s, t) {
    return process.getBuiltinModule("module").createRequire(import.meta.url)("@napi-rs/canvas").createCanvas(s, t);
  }
}, br = class extends Di {
  async _fetch(s, t) {
    return pr(s);
  }
};
function Fi({ src: s, srcPos: t = 0, dest: e, width: i, height: n, nonBlackColor: r = 4294967295, inverseDecode: a = !1 }) {
  const o = z.isLittleEndian ? 4278190080 : 255, [l, h] = a ? [r, o] : [o, r], c = i >> 3, d = i & 7, u = l ^ h, p = s.length;
  e = new Uint32Array(e.buffer);
  let f = 0;
  for (let m = 0; m < n; ++m) {
    for (const b = t + c; t < b; ++t, f += 8) {
      const y = s[t];
      e[f] = l ^ -(y >> 7 & 1) & u, e[f + 1] = l ^ -(y >> 6 & 1) & u, e[f + 2] = l ^ -(y >> 5 & 1) & u, e[f + 3] = l ^ -(y >> 4 & 1) & u, e[f + 4] = l ^ -(y >> 3 & 1) & u, e[f + 5] = l ^ -(y >> 2 & 1) & u, e[f + 6] = l ^ -(y >> 1 & 1) & u, e[f + 7] = l ^ -(y & 1) & u;
    }
    if (d === 0) continue;
    const g = t < p ? s[t++] : 255;
    for (let b = 0; b < d; ++b, ++f) e[f] = l ^ -(g >> 7 - b & 1) & u;
  }
  return {
    srcPos: t,
    destPos: f
  };
}
function yr({ src: s, srcPos: t = 0, dest: e, destPos: i = 0, width: n, height: r }) {
  let a = 0;
  const o = n * r * 3, l = o >> 2, h = new Uint32Array(s.buffer, t, l), c = z.isLittleEndian ? 4278190080 : 255;
  if (z.isLittleEndian) {
    for (; a < l - 2; a += 3, i += 4) {
      const d = h[a], u = h[a + 1], p = h[a + 2];
      e[i] = d | c, e[i + 1] = d >>> 24 | u << 8 | c, e[i + 2] = u >>> 16 | p << 16 | c, e[i + 3] = p >>> 8 | c;
    }
    for (let d = a * 4, u = t + o; d < u; d += 3) e[i++] = s[d] | s[d + 1] << 8 | s[d + 2] << 16 | c;
  } else {
    for (; a < l - 2; a += 3, i += 4) {
      const d = h[a], u = h[a + 1], p = h[a + 2];
      e[i] = d | c, e[i + 1] = d << 24 | u >>> 8 | c, e[i + 2] = u << 16 | p >>> 16 | c, e[i + 3] = p << 8 | c;
    }
    for (let d = a * 4, u = t + o; d < u; d += 3) e[i++] = s[d] << 24 | s[d + 1] << 16 | s[d + 2] << 8 | c;
  }
  return {
    srcPos: t + o,
    destPos: i
  };
}
var Ar = `
struct Uniforms {
  offsetX      : f32,
  offsetY      : f32,
  scaleX       : f32,
  scaleY       : f32,
  paddedWidth  : f32,
  paddedHeight : f32,
  borderSize   : f32,
  _pad         : f32,
};

@group(0) @binding(0) var<uniform> u : Uniforms;

struct VertexInput {
  @location(0) position : vec2<f32>,
  @location(1) color    : vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0)       color    : vec3<f32>,
};

@vertex
fn vs_main(in : VertexInput) -> VertexOutput {
  var out : VertexOutput;
  let cx = (in.position.x + u.offsetX) * u.scaleX;
  let cy = (in.position.y + u.offsetY) * u.scaleY;
  out.position = vec4<f32>(
    ((cx + u.borderSize) / u.paddedWidth) * 2.0 - 1.0,
    1.0 - ((cy + u.borderSize) / u.paddedHeight) * 2.0,
    0.0,
    1.0
  );
  out.color = in.color.rgb;
  return out;
}

@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(in.color, 1.0);
}
`, vr = class {
  #t = null;
  #e = null;
  #s = null;
  #i = null;
  async #n() {
    if (!globalThis.navigator?.gpu) return !1;
    try {
      const s = await navigator.gpu.requestAdapter();
      return s ? (this.#i = navigator.gpu.getPreferredCanvasFormat(), this.#e = await s.requestDevice(), !0) : !1;
    } catch {
      return !1;
    }
  }
  init() {
    return this.#t ||= this.#n();
  }
  get isReady() {
    return this.#e !== null;
  }
  loadMeshShader() {
    if (!this.#e || this.#s) return;
    const s = this.#e.createShaderModule({ code: Ar });
    this.#s = this.#e.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: s,
        entryPoint: "vs_main",
        buffers: [{
          arrayStride: 8,
          attributes: [{
            shaderLocation: 0,
            offset: 0,
            format: "float32x2"
          }]
        }, {
          arrayStride: 4,
          attributes: [{
            shaderLocation: 1,
            offset: 0,
            format: "unorm8x4"
          }]
        }]
      },
      fragment: {
        module: s,
        entryPoint: "fs_main",
        targets: [{ format: this.#i }]
      },
      primitive: { topology: "triangle-list" }
    });
  }
  draw(s, t, e, i, n, r, a, o) {
    this.loadMeshShader();
    const l = this.#e, { offsetX: h, offsetY: c, scaleX: d, scaleY: u } = i, p = l.createBuffer({
      size: Math.max(s.byteLength, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    s.byteLength > 0 && l.queue.writeBuffer(p, 0, s);
    const f = l.createBuffer({
      size: Math.max(t.byteLength, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    t.byteLength > 0 && l.queue.writeBuffer(f, 0, t);
    const m = l.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    l.queue.writeBuffer(m, 0, new Float32Array([
      h,
      c,
      d,
      u,
      r,
      a,
      o,
      0
    ]));
    const g = l.createBindGroup({
      layout: this.#s.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: { buffer: m }
      }]
    }), b = new OffscreenCanvas(r, a), y = b.getContext("webgpu");
    y.configure({
      device: l,
      format: this.#i,
      alphaMode: n ? "opaque" : "premultiplied"
    });
    const A = n ? {
      r: n[0] / 255,
      g: n[1] / 255,
      b: n[2] / 255,
      a: 1
    } : {
      r: 0,
      g: 0,
      b: 0,
      a: 0
    }, w = l.createCommandEncoder(), v = w.beginRenderPass({ colorAttachments: [{
      view: y.getCurrentTexture().createView(),
      clearValue: A,
      loadOp: "clear",
      storeOp: "store"
    }] });
    return e > 0 && (v.setPipeline(this.#s), v.setBindGroup(0, g), v.setVertexBuffer(0, p), v.setVertexBuffer(1, f), v.draw(e)), v.end(), l.queue.submit([w.finish()]), p.destroy(), f.destroy(), m.destroy(), b.transferToImageBitmap();
  }
}, Oe = new vr();
function wr() {
  return Oe.init();
}
function Sr() {
  return Oe.isReady;
}
function Er() {
  Oe.loadMeshShader();
}
function _r(s, t, e, i, n, r, a, o) {
  return Oe.draw(s, t, e, i, n, r, a, o);
}
var at = {
  FILL: "Fill",
  STROKE: "Stroke",
  SHADING: "Shading"
};
function Ce(s, t) {
  if (!t) return;
  const e = t[2] - t[0], i = t[3] - t[1], n = new Path2D();
  n.rect(t[0], t[1], e, i), s.clip(n);
}
var Ds = class {
  matrix = null;
  isModifyingCurrentTransform() {
    return !1;
  }
  getPattern() {
    U("Abstract method `getPattern` called.");
  }
}, Cr = class extends Ds {
  constructor(s) {
    super(), this._type = s[1], this._bbox = s[2], this._colorStops = s[3], this._p0 = s[4], this._p1 = s[5], this._r0 = s[6], this._r1 = s[7];
  }
  isOriginBased() {
    return this._p0[0] === 0 && this._p0[1] === 0 && (!this.isRadial() || this._p1[0] === 0 && this._p1[1] === 0);
  }
  isRadial() {
    return this._type === "radial";
  }
  areConic() {
    if (!this.isRadial()) return !1;
    const s = Math.hypot(this._p0[0] - this._p1[0], this._p0[1] - this._p1[1]);
    return s + this._r1 > this._r0 && s + this._r0 > this._r1;
  }
  _createGradient(s, t = null) {
    let e, i = this._p0, n = this._p1;
    if (t && (i = i.slice(), n = n.slice(), _.applyTransform(i, t), _.applyTransform(n, t)), this._type === "axial") e = s.createLinearGradient(i[0], i[1], n[0], n[1]);
    else if (this._type === "radial") {
      let r = this._r0, a = this._r1;
      if (t) {
        const o = /* @__PURE__ */ new Float32Array(2);
        _.singularValueDecompose2dScale(t, o), r *= o[0], a *= o[0];
      }
      e = s.createRadialGradient(i[0], i[1], r, n[0], n[1], a);
    }
    for (const r of this._colorStops) e.addColorStop(r[0], r[1]);
    return e;
  }
  _createReversedGradient(s, t = null) {
    let e = this._p1, i = this._p0;
    t && (e = e.slice(), i = i.slice(), _.applyTransform(e, t), _.applyTransform(i, t));
    let n = this._r1, r = this._r0;
    if (t) {
      const l = /* @__PURE__ */ new Float32Array(2);
      _.singularValueDecompose2dScale(t, l), n *= l[0], r *= l[0];
    }
    const a = s.createRadialGradient(e[0], e[1], n, i[0], i[1], r), o = this._colorStops.map(([l, h]) => [1 - l, h]).reverse();
    for (const [l, h] of o) a.addColorStop(l, h);
    return a;
  }
  getPattern(s, t, e, i) {
    let n;
    if (i === at.STROKE || i === at.FILL) {
      if (this.isOriginBased()) {
        let d = _.transform(e, t.baseTransform);
        this.matrix && (d = _.transform(d, this.matrix));
        const u = 1e-3, p = Math.hypot(d[0], d[1]), f = Math.hypot(d[2], d[3]), m = (d[0] * d[2] + d[1] * d[3]) / (p * f);
        if (Math.abs(m) < u)
          if (this.isRadial()) {
            if (Math.abs(p - f) < u) return this._createGradient(s, d);
          } else return this._createGradient(s, d);
      }
      const r = t.current.getClippedPathBoundingBox(i, j(s)) || [
        0,
        0,
        0,
        0
      ], a = Math.ceil(r[2] - r[0]) || 1, o = Math.ceil(r[3] - r[1]) || 1, l = t.canvasFactory.create(a, o), h = l.context;
      h.clearRect(0, 0, h.canvas.width, h.canvas.height), h.beginPath(), h.rect(0, 0, h.canvas.width, h.canvas.height), h.translate(-r[0], -r[1]), e = _.transform(e, [
        1,
        0,
        0,
        1,
        r[0],
        r[1]
      ]), h.transform(...t.baseTransform), this.matrix && h.transform(...this.matrix), Ce(h, this._bbox), this.areConic() && (h.fillStyle = this._createReversedGradient(h), h.fill()), h.fillStyle = this._createGradient(h), h.fill(), n = s.createPattern(l.canvas, "no-repeat"), t.canvasFactory.destroy(l);
      const c = new DOMMatrix(e);
      n.setTransform(c);
    } else
      this.areConic() && (s.save(), Ce(s, this._bbox), s.fillStyle = this._createReversedGradient(s), s.fillRect(-1e10, -1e10, 2e10, 2e10), s.restore()), Ce(s, this._bbox), n = this._createGradient(s);
    return n;
  }
};
function xr(s, t, e, i, n, r, a, o) {
  const l = t.coords, h = t.colors, c = s.data, d = s.width * 4;
  let u;
  l[e * 2 + 1] > l[i * 2 + 1] && (u = e, e = i, i = u, u = r, r = a, a = u), l[i * 2 + 1] > l[n * 2 + 1] && (u = i, i = n, n = u, u = a, a = o, o = u), l[e * 2 + 1] > l[i * 2 + 1] && (u = e, e = i, i = u, u = r, r = a, a = u);
  const p = (l[e * 2] + t.offsetX) * t.scaleX, f = (l[e * 2 + 1] + t.offsetY) * t.scaleY, m = (l[i * 2] + t.offsetX) * t.scaleX, g = (l[i * 2 + 1] + t.offsetY) * t.scaleY, b = (l[n * 2] + t.offsetX) * t.scaleX, y = (l[n * 2 + 1] + t.offsetY) * t.scaleY;
  if (f >= y) return;
  const A = h[r * 4], w = h[r * 4 + 1], v = h[r * 4 + 2], S = h[a * 4], E = h[a * 4 + 1], C = h[a * 4 + 2], x = h[o * 4], M = h[o * 4 + 1], k = h[o * 4 + 2], I = Math.round(f), B = Math.round(y);
  let G, K, L, D, ot, it, _t, jt;
  for (let W = I; W <= B; W++) {
    if (W < g) {
      const st = W < f ? 0 : (f - W) / (f - g);
      G = p - (p - m) * st, K = A - (A - S) * st, L = w - (w - E) * st, D = v - (v - C) * st;
    } else {
      let st;
      W > y ? st = 1 : g === y ? st = 0 : st = (g - W) / (g - y), G = m - (m - b) * st, K = S - (S - x) * st, L = E - (E - M) * st, D = C - (C - k) * st;
    }
    let X;
    W < f ? X = 0 : W > y ? X = 1 : X = (f - W) / (f - y), ot = p - (p - b) * X, it = A - (A - x) * X, _t = w - (w - M) * X, jt = v - (v - k) * X;
    const Vt = Math.round(Math.min(G, ot)), ze = Math.round(Math.max(G, ot));
    let Ot = d * W + Vt * 4;
    for (let st = Vt; st <= ze; st++)
      X = (G - st) / (G - ot), X < 0 ? X = 0 : X > 1 && (X = 1), c[Ot++] = K - (K - it) * X | 0, c[Ot++] = L - (L - _t) * X | 0, c[Ot++] = D - (D - jt) * X | 0, c[Ot++] = 255;
  }
}
var Tr = class extends Ds {
  constructor(s) {
    super(), this._posData = s[2], this._colData = s[3], this._vertexCount = s[4], this._bounds = s[5], this._bbox = s[6], this._background = s[7], Er();
  }
  _createMeshCanvas(s, t, e) {
    const a = Math.floor(this._bounds[0]), o = Math.floor(this._bounds[1]), l = Math.ceil(this._bounds[2]) - a, h = Math.ceil(this._bounds[3]) - o, c = Math.min(Math.ceil(Math.abs(l * s[0] * 1.1)), 3e3) || 1, d = Math.min(Math.ceil(Math.abs(h * s[1] * 1.1)), 3e3) || 1, u = l ? l / c : 1, p = h ? h / d : 1, f = {
      coords: this._posData,
      colors: this._colData,
      offsetX: -a,
      offsetY: -o,
      scaleX: 1 / u,
      scaleY: 1 / p
    }, m = c + 4, g = d + 4, b = e.create(m, g);
    if (Sr() && this._vertexCount > 48) b.context.drawImage(_r(this._posData, this._colData, this._vertexCount, f, t, m, g, 2), 0, 0);
    else {
      const y = b.context.createImageData(c, d);
      if (t) {
        const A = y.data;
        for (let w = 0, v = A.length; w < v; w += 4)
          A[w] = t[0], A[w + 1] = t[1], A[w + 2] = t[2], A[w + 3] = 255;
      }
      for (let A = 0, w = this._vertexCount; A < w; A += 3) xr(y, f, A, A + 1, A + 2, A, A + 1, A + 2);
      b.context.putImageData(y, 2, 2);
    }
    return {
      canvas: b.canvas,
      offsetX: a - 2 * u,
      offsetY: o - 2 * p,
      scaleX: u,
      scaleY: p
    };
  }
  isModifyingCurrentTransform() {
    return !0;
  }
  getPattern(s, t, e, i) {
    Ce(s, this._bbox);
    const n = /* @__PURE__ */ new Float32Array(2);
    if (i === at.SHADING) _.singularValueDecompose2dScale(j(s), n);
    else if (this.matrix) {
      _.singularValueDecompose2dScale(this.matrix, n);
      const [o, l] = n;
      _.singularValueDecompose2dScale(t.baseTransform, n), n[0] *= o, n[1] *= l;
    } else _.singularValueDecompose2dScale(t.baseTransform, n);
    const r = this._createMeshCanvas(n, i === at.SHADING ? null : this._background, t.canvasFactory);
    i !== at.SHADING && (s.setTransform(...t.baseTransform), this.matrix && s.transform(...this.matrix)), s.translate(r.offsetX, r.offsetY), s.scale(r.scaleX, r.scaleY);
    const a = s.createPattern(r.canvas, "no-repeat");
    return t.canvasFactory.destroy(r), a;
  }
}, kr = class extends Ds {
  getPattern() {
    return "hotpink";
  }
};
function Pr(s) {
  switch (s[0]) {
    case "RadialAxial":
      return new Cr(s);
    case "Mesh":
      return new Tr(s);
    case "Dummy":
      return new kr();
  }
  throw new Error(`Unknown IR type: ${s[0]}`);
}
var ei = {
  COLORED: 1,
  UNCOLORED: 2
}, qe = class Oi {
  static MAX_PATTERN_SIZE = 3e3;
  constructor(t, e, i, n) {
    this.color = t[1], this.operatorList = t[2], this.matrix = t[3], this.bbox = t[4], this.xstep = t[5], this.ystep = t[6], this.paintType = t[7], this.tilingType = t[8], this.needsIsolation = t[9] ?? !0, this.ctx = e, this.canvasGraphicsFactory = i, this.baseTransform = n, this.patternBaseMatrix = this.matrix ? _.transform(n, this.matrix) : n;
  }
  canSkipPatternCanvas([t, e, i, n]) {
    const [r, a, o, l] = this.bbox, h = Math.abs(this.xstep), c = Math.abs(this.ystep);
    if (t > h + 1e-6 || e > c + 1e-6) return null;
    const d = Math.floor((i - o) / h) + 1, u = Math.ceil((i + t - r) / h) - 1, p = Math.floor((n - l) / c) + 1, f = Math.ceil((n + e - a) / c) - 1;
    return u <= d && f <= p ? [d, p] : null;
  }
  updatePatternDims(t, e) {
    const i = _.inverseTransform(this.patternBaseMatrix), n = [t[0], t[1]], r = [t[2], t[3]];
    _.applyTransform(n, i), _.applyTransform(r, i), e[0] = Math.abs(r[0] - n[0]), e[1] = Math.abs(r[1] - n[1]), e[2] = Math.min(n[0], r[0]), e[3] = Math.min(n[1], r[1]);
  }
  _renderTileCanvas(t, e, i, n) {
    const [r, a, o, l] = this.bbox, h = t.canvasFactory.create(i.size, n.size), c = h.context, d = this.canvasGraphicsFactory.createCanvasGraphics(c, e);
    return d.groupLevel = t.groupLevel, this.setFillAndStrokeStyleToContext(d, this.paintType, this.color), c.translate(-i.scale * r, -n.scale * a), d.transform(0, i.scale, 0, 0, n.scale, 0, 0), c.save(), d.dependencyTracker?.save(), this.clipBbox(d, r, a, o, l), d.baseTransform = j(d.ctx), d.executeOperatorList(this.operatorList), d.endDrawing(), d.dependencyTracker?.restore(), c.restore(), h;
  }
  _getCombinedScales() {
    const t = /* @__PURE__ */ new Float32Array(2);
    _.singularValueDecompose2dScale(this.matrix, t);
    const [e, i] = t;
    return _.singularValueDecompose2dScale(this.baseTransform, t), [e * t[0], i * t[1]];
  }
  drawPattern(t, e, i = !1, [n, r], a) {
    const [o, l, h, c] = this.bbox, d = t.dependencyTracker;
    if (d && (t.dependencyTracker = new fs(d, a)), t.save(), i ? t.ctx.clip(e, "evenodd") : t.ctx.clip(e), t.ctx.setTransform(...this.patternBaseMatrix), t.ctx.translate(n * this.xstep, r * this.ystep), this.needsIsolation || t.ctx.globalAlpha !== 1 || t.ctx.globalCompositeOperation !== "source-over" || t.inSMaskMode) {
      const u = h - o, p = c - l, [f, m] = this._getCombinedScales(), g = this.getSizeAndScale(u, this.ctx.canvas.width, f), b = this.getSizeAndScale(p, this.ctx.canvas.height, m), y = this._renderTileCanvas(t, a, g, b);
      t.ctx.drawImage(y.canvas, o, l, u, p), t.canvasFactory.destroy(y);
    } else
      this.setFillAndStrokeStyleToContext(t, this.paintType, this.color), this.clipBbox(t, o, l, h, c), t.baseTransformStack.push(t.baseTransform), t.baseTransform = j(t.ctx), t.executeOperatorList(this.operatorList), t.baseTransform = t.baseTransformStack.pop();
    t.restore(), d && (t.dependencyTracker = d);
  }
  createPatternCanvas(t, e) {
    const [i, n, r, a] = this.bbox, o = r - i, l = a - n;
    let { xstep: h, ystep: c } = this;
    h = Math.abs(h), c = Math.abs(c), Ie("TilingType: " + this.tilingType);
    const [d, u] = this._getCombinedScales();
    let p = o, f = l, m = !1, g = !1;
    Math.ceil(h * d) >= Math.ceil(o * d) ? p = h : m = !0, Math.ceil(c * u) >= Math.ceil(l * u) ? f = c : g = !0;
    const b = this.getSizeAndScale(p, this.ctx.canvas.width, d), y = this.getSizeAndScale(f, this.ctx.canvas.height, u), A = this._renderTileCanvas(t, e, b, y);
    if (m || g) {
      const w = A.canvas;
      m && (p = h), g && (f = c);
      const v = this.getSizeAndScale(p, this.ctx.canvas.width, d), S = this.getSizeAndScale(f, this.ctx.canvas.height, u), E = v.size, C = S.size, x = t.canvasFactory.create(E, C), M = x.context, k = m ? Math.floor(o / h) : 0, I = g ? Math.floor(l / c) : 0;
      for (let B = 0; B <= k; B++) for (let G = 0; G <= I; G++) M.drawImage(w, E * B, C * G, E, C, 0, 0, E, C);
      return t.canvasFactory.destroy(A), {
        canvas: x.canvas,
        canvasEntry: x,
        scaleX: v.scale,
        scaleY: S.scale,
        offsetX: i,
        offsetY: n
      };
    }
    return {
      canvas: A.canvas,
      canvasEntry: A,
      scaleX: b.scale,
      scaleY: y.scale,
      offsetX: i,
      offsetY: n
    };
  }
  getSizeAndScale(t, e, i) {
    const n = Math.max(Oi.MAX_PATTERN_SIZE, e);
    let r = Math.ceil(t * i);
    return r >= n ? r = n : i = r / t, {
      scale: i,
      size: r
    };
  }
  clipBbox(t, e, i, n, r) {
    const a = n - e, o = r - i, l = new Path2D();
    l.rect(e, i, a, o), _.axialAlignedBoundingBox([
      e,
      i,
      n,
      r
    ], j(t.ctx), t.current.minMax), t.ctx.clip(l), t.current.updateClipFromPath();
  }
  setFillAndStrokeStyleToContext(t, e, i) {
    const n = t.ctx, r = t.current;
    switch (r.patternFill = r.patternStroke = !1, e) {
      case ei.COLORED:
        const { fillStyle: a, strokeStyle: o } = this.ctx;
        n.fillStyle = r.fillColor = a, n.strokeStyle = r.strokeColor = o;
        break;
      case ei.UNCOLORED:
        n.fillStyle = n.strokeStyle = i, r.fillColor = r.strokeColor = i;
        break;
      default:
        throw new _n(`Unsupported paint type: ${e}`);
    }
  }
  isModifyingCurrentTransform() {
    return !1;
  }
  getPattern(t, e, i, n, r) {
    const a = n !== at.SHADING ? _.transform(i, this.patternBaseMatrix) : i, o = this.createPatternCanvas(e, r);
    let l = new DOMMatrix(a);
    l = l.translate(o.offsetX, o.offsetY), l = l.scale(1 / o.scaleX, 1 / o.scaleY);
    const h = t.createPattern(o.canvas, "repeat");
    return e.canvasFactory.destroy(o.canvasEntry), h.setTransform(l), h;
  }
}, Mr = 16, Dr = 100, Ir = 15, si = 10, ut = 16, gt = /* @__PURE__ */ new Float32Array(2);
function ii(s, t) {
  if (s._removeMirroring) throw new Error("Context is already forwarding operations.");
  const e = /* @__PURE__ */ new Map();
  for (const i of [
    "save",
    "restore",
    "rotate",
    "scale",
    "translate",
    "transform",
    "setTransform",
    "resetTransform",
    "clip",
    "moveTo",
    "lineTo",
    "bezierCurveTo",
    "quadraticCurveTo",
    "arc",
    "arcTo",
    "ellipse",
    "rect",
    "roundRect",
    "closePath",
    "beginPath"
  ]) {
    const n = s[i];
    typeof n != "function" || typeof t[i] != "function" || (e.set(i, n), s[i] = function(...r) {
      return t[i](...r), n.apply(this, r);
    });
  }
  s._removeMirroring = () => {
    for (const [i, n] of e) s[i] = n;
    delete s._removeMirroring;
  };
}
function me(s, t, e, i, n, r, a, o, l, h) {
  const [c, d, u, p, f, m] = j(s);
  if (d === 0 && u === 0) {
    const y = a * c + f, A = Math.round(y), w = o * p + m, v = Math.round(w), S = (a + l) * c + f, E = Math.abs(Math.round(S) - A) || 1, C = (o + h) * p + m, x = Math.abs(Math.round(C) - v) || 1;
    return s.setTransform(Math.sign(c), 0, 0, Math.sign(p), A, v), s.drawImage(t, e, i, n, r, 0, 0, E, x), s.setTransform(c, d, u, p, f, m), [E, x];
  }
  if (c === 0 && p === 0) {
    const y = o * u + f, A = Math.round(y), w = a * d + m, v = Math.round(w), S = (o + h) * u + f, E = Math.abs(Math.round(S) - A) || 1, C = (a + l) * d + m, x = Math.abs(Math.round(C) - v) || 1;
    return s.setTransform(0, Math.sign(d), Math.sign(u), 0, A, v), s.drawImage(t, e, i, n, r, 0, 0, x, E), s.setTransform(c, d, u, p, f, m), [x, E];
  }
  s.drawImage(t, e, i, n, r, a, o, l, h);
  const g = Math.hypot(c, d), b = Math.hypot(u, p);
  return [g * l, b * h];
}
var ni = class {
  alphaIsShape = !1;
  fontSize = 0;
  fontSizeScale = 1;
  textMatrix = null;
  textMatrixScale = 1;
  fontMatrix = Ze;
  leading = 0;
  x = 0;
  y = 0;
  lineX = 0;
  lineY = 0;
  charSpacing = 0;
  wordSpacing = 0;
  textHScale = 1;
  textRenderingMode = tt.FILL;
  textRise = 0;
  fillColor = "#000000";
  strokeColor = "#000000";
  tilingPatternDims = null;
  patternFill = !1;
  patternStroke = !1;
  fillAlpha = 1;
  strokeAlpha = 1;
  lineWidth = 1;
  activeSMask = null;
  transferMaps = "none";
  minMax = Ht.slice();
  constructor(s, t) {
    this.clipBox = new Float32Array([
      0,
      0,
      s,
      t
    ]);
  }
  clone() {
    const s = Object.create(this);
    return s.clipBox = this.clipBox.slice(), s.minMax = this.minMax.slice(), s.tilingPatternDims = this.tilingPatternDims?.slice(), s;
  }
  getPathBoundingBox(s = at.FILL, t = null) {
    const e = this.minMax.slice();
    if (s === at.STROKE) {
      t || U("Stroke bounding box must include transform."), _.singularValueDecompose2dScale(t, gt);
      const i = gt[0] * this.lineWidth / 2, n = gt[1] * this.lineWidth / 2;
      e[0] -= i, e[1] -= n, e[2] += i, e[3] += n;
    }
    return e;
  }
  updateClipFromPath() {
    const s = _.intersect(this.clipBox, this.getPathBoundingBox());
    this.startNewPathAndClipBox(s || [
      0,
      0,
      0,
      0
    ]);
  }
  isEmptyClip() {
    return this.minMax[0] === 1 / 0;
  }
  startNewPathAndClipBox(s) {
    this.clipBox.set(s, 0), this.minMax.set(Ht, 0);
  }
  getClippedPathBoundingBox(s = at.FILL, t = null) {
    return _.intersect(this.clipBox, this.getPathBoundingBox(s, t));
  }
};
function ri(s, t) {
  const { width: e, height: i, kind: n } = t, r = i % ut, a = (i - r) / ut, o = r === 0 ? a : a + 1, l = s.createImageData(e, ut);
  let h = 0;
  const c = t.data, d = l.data;
  let u;
  if (n === Ee.GRAYSCALE_1BPP) for (u = 0; u < o; u++)
    ({ srcPos: h } = Fi({
      src: c,
      srcPos: h,
      dest: d,
      width: e,
      height: u < a ? ut : r
    })), s.putImageData(l, 0, u * ut);
  else if (n === Ee.RGBA_32BPP) {
    let p = 0, f = e * ut * 4;
    for (u = 0; u < a; u++)
      d.set(c.subarray(h, h + f)), h += f, s.putImageData(l, 0, p), p += ut;
    u < o && (f = e * r * 4, d.set(c.subarray(h, h + f)), s.putImageData(l, 0, p));
  } else if (n === Ee.RGB_24BPP) for (u = 0; u < o; u++)
    ({ srcPos: h } = yr({
      src: c,
      srcPos: h,
      dest: new Uint32Array(d.buffer),
      width: e,
      height: u < a ? ut : r
    })), s.putImageData(l, 0, u * ut);
  else throw new Error(`bad image kind: ${n}`);
}
function ai(s, t) {
  if (t.bitmap) {
    s.drawImage(t.bitmap, 0, 0);
    return;
  }
  const { width: e, height: i } = t, n = i % ut, r = (i - n) / ut, a = n === 0 ? r : r + 1, o = s.createImageData(e, ut);
  let l = 0;
  const h = t.data, c = o.data;
  for (let d = 0; d < a; d++)
    ({ srcPos: l } = Fi({
      src: h,
      srcPos: l,
      dest: c,
      width: e,
      height: d < r ? ut : n,
      nonBlackColor: 0
    })), s.putImageData(o, 0, d * ut);
}
function Nt(s, t) {
  for (const e of [
    "strokeStyle",
    "fillStyle",
    "fillRule",
    "globalAlpha",
    "lineWidth",
    "lineCap",
    "lineJoin",
    "miterLimit",
    "globalCompositeOperation",
    "font",
    "filter"
  ]) s[e] !== void 0 && (t[e] = s[e]);
  s.setLineDash !== void 0 && (t.setLineDash(s.getLineDash()), t.lineDashOffset = s.lineDashOffset);
}
function be(s) {
  s.strokeStyle = s.fillStyle = "#000000", s.fillRule = "nonzero", s.globalAlpha = 1, s.lineWidth = 1, s.lineCap = "butt", s.lineJoin = "miter", s.miterLimit = 10, s.globalCompositeOperation = "source-over", s.font = "10px sans-serif", s.setLineDash !== void 0 && (s.setLineDash([]), s.lineDashOffset = 0);
  const { filter: t } = s;
  t !== "none" && t !== "" && (s.filter = "none");
}
function oi(s, t) {
  if (t) return !0;
  _.singularValueDecompose2dScale(s, gt);
  const e = Math.fround(Ft.pixelRatio * Jt.PDF_TO_CSS_UNITS);
  return gt[0] <= e && gt[1] <= e;
}
var Lr = [
  "butt",
  "round",
  "square"
], Fr = [
  "miter",
  "round",
  "bevel"
], Or = {}, li = {}, xe = class ms {
  static #t = null;
  #e = 0;
  #s = 0;
  #i = null;
  #n = null;
  #a = null;
  #r = null;
  #o = 1;
  #l;
  #h = null;
  #u = [];
  constructor(t, e, i, n, r, { optionalContentConfig: a, markedContentStack: o = null }, l, h, c, d) {
    this.ctx = t, this.current = new ni(this.ctx.canvas.width, this.ctx.canvas.height), this.stateStack = [], this.pendingClip = null, this.pendingEOFill = !1, this.commonObjs = e, this.objs = i, this.canvasFactory = n, this.filterFactory = r, this.groupStack = [], this.baseTransform = null, this.baseTransformStack = [], this.groupLevel = 0, this.smaskStack = [], this.tempSMask = null, this.smaskGroupCanvases = [], this.smaskPreparedEntry = null, this.smaskPreparedFor = null, this.smaskPreparedOffsetX = 0, this.smaskPreparedOffsetY = 0, this.smaskPreparedOOBAlpha = null, this.suspendedCtx = null, this.contentVisible = !0, this.markedContentStack = o || [], this.optionalContentConfig = a, this.cachedPatterns = /* @__PURE__ */ new Map(), this.annotationCanvasMap = l, this.viewportScale = 1, this.outputScaleX = 1, this.outputScaleY = 1, this.pageColors = h, this._cachedScaleForStroking = [-1, 0], this._cachedGetSinglePixelWidth = null, this._cachedBitmapsMap = /* @__PURE__ */ new Map(), this.dependencyTracker = c ?? null, this.imagesTracker = d ?? null;
  }
  getObject(t, e, i = null) {
    return typeof e == "string" ? (this.dependencyTracker?.recordNamedDependency(t, e), e.startsWith("g_") ? this.commonObjs.get(e) : this.objs.get(e)) : i;
  }
  beginDrawing({ transform: t, viewport: e, transparency: i = !1, background: n = null }) {
    const r = this.ctx.canvas.width, a = this.ctx.canvas.height, o = this.ctx.fillStyle;
    if (this.ctx.fillStyle = n || "#ffffff", this.ctx.fillRect(0, 0, r, a), this.ctx.fillStyle = o, i) {
      const l = this.transparentCanvasEntry = this.canvasFactory.create(r, a);
      this.compositeCtx = this.ctx, { canvas: this.transparentCanvas, context: this.ctx } = l, this.ctx.save(), this.ctx.transform(...j(this.compositeCtx));
    }
    this.ctx.save(), be(this.ctx), t && (this.ctx.transform(...t), this.outputScaleX = t[0], this.outputScaleY = t[3]), this.ctx.transform(...e.transform), this.viewportScale = e.scale, this.baseTransform = j(this.ctx);
  }
  executeOperatorList(t, e, i, n, r) {
    const a = t.argsArray, o = t.fnArray;
    let l = e || 0;
    const h = a.length;
    if (h === l) return l;
    const c = h - l > si && typeof i == "function", d = c ? Date.now() + Ir : 0;
    let u = 0;
    const p = this.commonObjs, f = this.objs;
    let m, g;
    for (; ; ) {
      if (n !== void 0) {
        if (l === n.nextBreakPoint)
          return n.breakIt(l, i), l;
        if (n.shouldSkip(l)) {
          if (++l === h) return l;
          continue;
        }
      }
      if (!r || r(l))
        if (m = o[l], g = a[l] ?? null, m !== Et.dependency)
          g === null ? this[m](l) : this[m](l, ...g);
        else for (const b of g) {
          this.dependencyTracker?.recordNamedData(b, l);
          const y = b.startsWith("g_") ? p : f;
          if (!y.has(b))
            return y.get(b, i), l;
        }
      if (l++, l === h) return l;
      if (c && ++u > si) {
        if (Date.now() > d)
          return i(), l;
        u = 0;
      }
    }
  }
  #d() {
    for (; this.stateStack.length || this.inSMaskMode; ) this.restore();
    this.current.activeSMask = null, this.ctx.restore(), this.transparentCanvas && (this.ctx = this.compositeCtx, this.ctx.save(), this.ctx.setTransform(1, 0, 0, 1, 0, 0), this.ctx.drawImage(this.transparentCanvas, 0, 0), this.ctx.restore(), this.canvasFactory.destroy(this.transparentCanvasEntry), this.transparentCanvas = null, this.transparentCanvasEntry = null);
  }
  endDrawing() {
    this.#d();
    for (const t of this.smaskGroupCanvases) this.canvasFactory.destroy(t);
    this.smaskGroupCanvases.length = 0, this._clearPreparedSMask(), this.tempSMask = null, this.smaskStack.length = 0;
    for (const t of this.#u) this.#v(t);
    this.#u.length = 0, this.#i = null, this.#n = null, this.#a = null, this.#r = null, this.#o = 1, this.#h = null, this.#s = 0, this.#e = 0, this.cachedPatterns.clear();
    for (const t of this._cachedBitmapsMap.values()) {
      for (const e of t.values()) typeof HTMLCanvasElement < "u" && e instanceof HTMLCanvasElement && (e.width = e.height = 0);
      t.clear();
    }
    this._cachedBitmapsMap.clear(), this.#f();
  }
  #f() {
    if (this.pageColors) {
      const t = this.filterFactory.addHCMFilter(this.pageColors.foreground, this.pageColors.background);
      if (t !== "none") {
        const e = this.ctx.filter;
        this.ctx.filter = t, this.ctx.drawImage(this.ctx.canvas, 0, 0), this.ctx.filter = e;
      }
    }
  }
  _scaleImage(t, e) {
    const i = t.width ?? t.displayWidth, n = t.height ?? t.displayHeight, r = Math.max(Math.hypot(e[0], e[1]), 1), a = Math.max(Math.hypot(e[2], e[3]), 1), o = [];
    let l = r, h = a, c = i, d = n;
    for (; l > 2 && c > 1 || h > 2 && d > 1; ) {
      let b = c, y = d;
      l > 2 && c > 1 && (b = Math.ceil(c / 2), l /= c / b), h > 2 && d > 1 && (y = Math.ceil(d / 2), h /= d / y), o.push({
        newWidth: b,
        newHeight: y
      }), c = b, d = y;
    }
    if (o.length === 0) return {
      img: t,
      paintWidth: i,
      paintHeight: n,
      tmpCanvas: null
    };
    if (o.length === 1) {
      const { newWidth: b, newHeight: y } = o[0], A = this.canvasFactory.create(b, y);
      return A.context.drawImage(t, 0, 0, i, n, 0, 0, b, y), {
        img: A.canvas,
        paintWidth: b,
        paintHeight: y,
        tmpCanvas: A
      };
    }
    let u = this.canvasFactory.create(1, 1), p = this.canvasFactory.create(1, 1), f = i, m = n, g = t;
    for (const { newWidth: b, newHeight: y } of o)
      this.canvasFactory.reset(p, b, y), p.context.drawImage(g, 0, 0, f, m, 0, 0, b, y), [u, p] = [p, u], g = u.canvas, f = b, m = y;
    return this.canvasFactory.destroy(p), {
      img: u.canvas,
      paintWidth: f,
      paintHeight: m,
      tmpCanvas: u
    };
  }
  _createMaskCanvas(t, e) {
    const i = this.ctx, { width: n, height: r } = e, a = this.current.fillColor, o = this.current.patternFill, l = j(i);
    let h, c, d, u;
    if ((e.bitmap || e.data) && e.count > 1) {
      const k = e.bitmap || e.data.buffer;
      c = JSON.stringify(o ? l : [l.slice(0, 4), a]), h = this._cachedBitmapsMap.getOrInsertComputed(k, Cs);
      const I = h.get(c);
      if (I && !o) {
        const B = Math.round(Math.min(l[0], l[2]) + l[4]), G = Math.round(Math.min(l[1], l[3]) + l[5]);
        return this.dependencyTracker?.recordDependencies(t, bt.transformAndFill), {
          canvas: I,
          offsetX: B,
          offsetY: G
        };
      }
      d = I;
    }
    d || (u = this.canvasFactory.create(n, r), ai(u.context, e));
    let p = _.transform(l, [
      1 / n,
      0,
      0,
      -1 / r,
      0,
      0
    ]);
    p = _.transform(p, [
      1,
      0,
      0,
      1,
      0,
      -r
    ]);
    const f = Ht.slice();
    _.axialAlignedBoundingBox([
      0,
      0,
      n,
      r
    ], p, f);
    const [m, g, b, y] = f, A = Math.round(b - m) || 1, w = Math.round(y - g) || 1, v = this.canvasFactory.create(A, w), S = v.context, E = m, C = g;
    S.translate(-E, -C), S.transform(...p);
    let x = null;
    if (!d) {
      const k = this._scaleImage(u.canvas, vt(S));
      d = k.img, x = k.tmpCanvas, d !== u.canvas && (this.canvasFactory.destroy(u), u = null), h && o && (h.set(c, d), x = null, u = null);
    }
    S.imageSmoothingEnabled = oi(j(S), e.interpolate), me(S, d, 0, 0, d.width, d.height, 0, 0, n, r), x && this.canvasFactory.destroy(x), u && this.canvasFactory.destroy(u), S.globalCompositeOperation = "source-in";
    const M = _.transform(vt(S), [
      1,
      0,
      0,
      1,
      -E,
      -C
    ]);
    return S.fillStyle = o ? a.getPattern(i, this, M, at.FILL, t) : a, S.fillRect(0, 0, n, r), h && !o && h.set(c, v.canvas), this.dependencyTracker?.recordDependencies(t, bt.transformAndFill), {
      canvas: v.canvas,
      canvasEntry: h && !o ? null : v,
      offsetX: Math.round(E),
      offsetY: Math.round(C)
    };
  }
  setLineWidth(t, e) {
    this.dependencyTracker?.recordSimpleData("lineWidth", t), e !== this.current.lineWidth && (this._cachedScaleForStroking[0] = -1), this.current.lineWidth = e, this.ctx.lineWidth = e;
  }
  setLineCap(t, e) {
    this.dependencyTracker?.recordSimpleData("lineCap", t), this.ctx.lineCap = Lr[e];
  }
  setLineJoin(t, e) {
    this.dependencyTracker?.recordSimpleData("lineJoin", t), this.ctx.lineJoin = Fr[e];
  }
  setMiterLimit(t, e) {
    this.dependencyTracker?.recordSimpleData("miterLimit", t), this.ctx.miterLimit = e;
  }
  setDash(t, e, i) {
    this.dependencyTracker?.recordSimpleData("dash", t);
    const n = this.ctx;
    n.setLineDash !== void 0 && (n.setLineDash(e), n.lineDashOffset = i);
  }
  setRenderingIntent(t, e) {
  }
  setFlatness(t, e) {
  }
  setGState(t, e) {
    for (const [i, n] of e) switch (i) {
      case "LW":
        this.setLineWidth(t, n);
        break;
      case "LC":
        this.setLineCap(t, n);
        break;
      case "LJ":
        this.setLineJoin(t, n);
        break;
      case "ML":
        this.setMiterLimit(t, n);
        break;
      case "D":
        this.setDash(t, n[0], n[1]);
        break;
      case "RI":
        this.setRenderingIntent(t, n);
        break;
      case "FL":
        this.setFlatness(t, n);
        break;
      case "Font":
        this.setFont(t, n[0], n[1]);
        break;
      case "CA":
        this.dependencyTracker?.recordSimpleData("strokeAlpha", t), this.current.strokeAlpha = n;
        break;
      case "ca":
        this.dependencyTracker?.recordSimpleData("fillAlpha", t), this.ctx.globalAlpha = this.current.fillAlpha = n;
        break;
      case "BM":
        this.dependencyTracker?.recordSimpleData("globalCompositeOperation", t), this.ctx.globalCompositeOperation = n;
        break;
      case "SMask":
        this.dependencyTracker?.recordSimpleData("SMask", t), this.current.activeSMask = n ? this.tempSMask : null, this.current.activeSMask && (this.current.activeSMask.blendMode = this.ctx.globalCompositeOperation), this.tempSMask = null, this.checkSMaskState(t);
        break;
      case "TR":
        this.dependencyTracker?.recordSimpleData("filter", t), this.ctx.filter = this.current.transferMaps = this.filterFactory.addFilter(n);
    }
  }
  get inSMaskMode() {
    return !!this.suspendedCtx;
  }
  _clearPreparedSMask() {
    this.smaskPreparedEntry && (this.canvasFactory.destroy(this.smaskPreparedEntry), this.smaskPreparedEntry = null), this.smaskPreparedFor = null, this.smaskPreparedOffsetX = 0, this.smaskPreparedOffsetY = 0, this.smaskPreparedOOBAlpha = null;
  }
  _ensurePreparedSMask(t) {
    t !== this.smaskPreparedFor && (this._clearPreparedSMask(), this._prepareSMaskCanvas(t));
  }
  checkSMaskState(t) {
    const e = this.inSMaskMode;
    this.current.activeSMask && !e ? this.beginSMaskMode(t) : !this.current.activeSMask && e ? this.endSMaskMode() : this.current.activeSMask && e && this._ensurePreparedSMask(this.current.activeSMask);
  }
  _prepareSMaskCanvas(t) {
    const { canvas: e, subtype: i, backdrop: n, transferMap: r } = t, a = i === "Luminosity" || i === "Alpha" && r;
    if (!a && !(i === "Luminosity" && n)) {
      this.smaskPreparedFor = t;
      return;
    }
    let o;
    if (i === "Luminosity" && n) {
      const [y, A, w] = he(n), v = Math.round(0.3 * y + 0.59 * A + 0.11 * w);
      o = r?.[v] ?? v;
    } else o = r?.[0] ?? 0;
    const l = 4, { width: h, height: c } = this.ctx.canvas, d = e.width * e.height, u = h * c < l * d, p = a ? {
      url: i === "Alpha" ? this.filterFactory.addAlphaFilter(r) : this.filterFactory.addLuminosityFilter(r),
      subtype: i,
      transferMap: r
    } : null, f = i === "Luminosity" ? n : null;
    let m, g, b;
    u ? (m = this._bakeSMaskCanvas(e, t.offsetX, t.offsetY, h, c, f, p), g = 0, b = 0) : (m = this._bakeSMaskCanvas(e, 0, 0, e.width, e.height, f, p), g = t.offsetX, b = t.offsetY), this.smaskPreparedEntry = m, this.smaskPreparedFor = t, this.smaskPreparedOffsetX = g, this.smaskPreparedOffsetY = b, this.smaskPreparedOOBAlpha = !u && o !== 0 ? o : null;
  }
  _bakeSMaskCanvas(t, e, i, n, r, a, o) {
    !a && !o && U("_bakeSMaskCanvas with neither backdrop nor filter");
    const l = this.canvasFactory.create(n, r), h = l.context;
    if (h.drawImage(t, e, i), a && (h.globalCompositeOperation = "destination-atop", h.fillStyle = a, h.fillRect(0, 0, n, r)), !o) return l;
    const c = this.canvasFactory.create(n, r), d = c.context;
    d.filter = o.url;
    const u = z.isCanvasFilterSupported && d.filter !== "none" && d.filter !== "";
    if (d.drawImage(l.canvas, 0, 0), z.isCanvasFilterSupported && (d.filter = "none"), !u) {
      const p = d.getImageData(0, 0, n, r), { data: f } = p, { transferMap: m } = o;
      if (o.subtype === "Luminosity") for (let g = 0, b = f.length; g < b; g += 4) {
        const y = 0.3 * f[g] + 0.59 * f[g + 1] + 0.11 * f[g + 2] + 0.5 | 0;
        f[g] = f[g + 1] = f[g + 2] = 0, f[g + 3] = m?.[y] ?? y;
      }
      else for (let g = 3, b = f.length; g < b; g += 4) f[g] = m[f[g]];
      d.putImageData(p, 0, 0);
    }
    return this.canvasFactory.destroy(l), c;
  }
  beginSMaskMode(t) {
    if (this.inSMaskMode) throw new Error("beginSMaskMode called while already in smask mode");
    const { width: e, height: i } = this.ctx.canvas, n = this.canvasFactory.create(e, i);
    this.smaskScratchCanvas = n, this.suspendedCtx = this.ctx;
    const r = this.ctx = n.context;
    r.setTransform(this.suspendedCtx.getTransform()), Nt(this.suspendedCtx, r), ii(r, this.suspendedCtx), this._ensurePreparedSMask(this.current.activeSMask), this.setGState(t, [["BM", "source-over"]]);
  }
  endSMaskMode() {
    if (!this.inSMaskMode) throw new Error("endSMaskMode called while not in smask mode");
    this.ctx._removeMirroring(), Nt(this.ctx, this.suspendedCtx), this.ctx = this.suspendedCtx, this.suspendedCtx = null, this.canvasFactory.destroy(this.smaskScratchCanvas), this.smaskScratchCanvas = null, this._clearPreparedSMask();
  }
  #g(t, e = null, i = 1) {
    const { width: n, height: r } = t, a = e ?? this.canvasFactory.create(n, r), o = a.context;
    i = Math.round(i * 255) / 255;
    const l = i < 1;
    l && this.#l === void 0 && (this.#l = z.isCanvasFilterSupported ? /* @__PURE__ */ new Map() : "none");
    let h = "none";
    if (l && this.#l instanceof Map && (h = this.#l.getOrInsertComputed(i, () => this.filterFactory.addKnockoutFilter(i))), !l || h !== "none")
      return e && (o.save(), o.setTransform(1, 0, 0, 1, 0, 0), o.clearRect(0, 0, n, r), o.restore()), o.filter = h, o.drawImage(t, 0, 0), o.filter = "none", a;
    const c = t.getContext("2d", { willReadFrequently: !0 }).getImageData(0, 0, n, r), d = o.createImageData(n, r), u = c.data, p = d.data, f = i > 0 ? 1 / i : 1e6;
    for (let m = 3, g = u.length; m < g; m += 4) p[m] = Math.min(Math.round(u[m] * f), 255);
    return o.putImageData(d, 0, 0), a;
  }
  #m(t, e, i, n) {
    let r = t?.[e] ?? null;
    if (r && (r.canvas.width !== i || r.canvas.height !== n) && (this.canvasFactory.destroy(r), r = null), !r)
      return r = this.canvasFactory.create(i, n), t && (t[e] = r), r;
    const a = r.context;
    return a.save(), a.setTransform(1, 0, 0, 1, 0, 0), a.clearRect(0, 0, i, n), a.restore(), r;
  }
  #c(t, e, i = {}) {
    const { backdropCanvas: n = null, destTransform: r = [
      1,
      0,
      0,
      1,
      0,
      0
    ], backdropOffset: a = [0, 0], reuseMaskEntry: o = null, poolMeta: l = null, sourceAlpha: h = 1, sourceFilter: c = "none", knockoutAlpha: d = 1 } = i, { width: u, height: p } = e, f = this.#g(e, o, d), m = t.globalCompositeOperation;
    if (t.save(), t.setTransform(...r), t.globalAlpha = 1, z.isCanvasFilterSupported && (t.filter = "none"), t.globalCompositeOperation = "destination-out", t.drawImage(f.canvas, 0, 0), n) {
      const [g, b] = a, y = this.#m(l, "knockoutBackdropEntry", u, p), A = y.context;
      A.drawImage(n, g, b, u, p, 0, 0, u, p), A.globalCompositeOperation = "destination-in", A.drawImage(f.canvas, 0, 0), A.globalCompositeOperation = "source-over", t.globalCompositeOperation = "destination-over", t.drawImage(y.canvas, 0, 0), l || this.canvasFactory.destroy(y);
    }
    t.globalCompositeOperation = m, t.globalAlpha = h, z.isCanvasFilterSupported && (t.filter = c ?? "none"), t.drawImage(e, 0, 0), t.restore(), o || this.canvasFactory.destroy(f);
  }
  #p(t = 1) {
    if (this.#e === 0 || this.#s > 0 || !this.contentVisible) return !1;
    this.#s++, this.#o = t;
    const e = this.#u.at(-1), { canvas: i } = this.ctx, n = this.#m(e, "knockoutTempEntry", i.width, i.height);
    this.#i = n;
    const r = n.context;
    return r.save(), r.setTransform(this.ctx.getTransform()), Nt(this.ctx, r), this.#r = r.globalCompositeOperation, r.globalCompositeOperation = "source-over", ii(r, this.ctx), this.#h = e, this.#n = this.ctx, this.#a = this.suspendedCtx, this.ctx = r, this.inSMaskMode && (this.suspendedCtx = r), !0;
  }
  #b(t) {
    if (!t) return;
    const e = this.#i, i = this.#n, n = this.#a, r = e.context;
    this.#i = null, this.#n = null, this.#a = null, this.inSMaskMode && this.suspendedCtx === r && this.ctx !== r && this.endSMaskMode(), this.inSMaskMode && (this.suspendedCtx = n), this.ctx._removeMirroring(), this.ctx.globalCompositeOperation = this.#r, this.#r = null, Nt(this.ctx, i), this.ctx = i;
    const a = this.#h;
    this.#h = null;
    const o = this.#o;
    this.#o = 1;
    try {
      this.#c(n ?? i, e.canvas, {
        backdropCanvas: a?.backdropCtx?.canvas ?? null,
        backdropOffset: a?.backdropCtx ? [a.offsetX, a.offsetY] : [0, 0],
        reuseMaskEntry: a?.knockoutMaskEntry ?? null,
        poolMeta: a,
        knockoutAlpha: o
      });
    } finally {
      r.restore(), this.#s--, a || this.canvasFactory.destroy(e);
    }
  }
  compose(t) {
    if (!this.current.activeSMask) return;
    t = t ? [
      Math.floor(t[0]),
      Math.floor(t[1]),
      Math.ceil(t[2]),
      Math.ceil(t[3])
    ] : [
      0,
      0,
      this.ctx.canvas.width,
      this.ctx.canvas.height
    ];
    const e = this.current.activeSMask, i = this.suspendedCtx, n = this.#s > 0 && i === this.ctx;
    this.composeSMask(n ? null : i, e, this.ctx, t), !n && (this.ctx.save(), this.ctx.setTransform(1, 0, 0, 1, 0, 0), this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height), this.ctx.restore());
  }
  composeSMask(t, e, i, n) {
    const r = n[0], a = n[1], o = n[2] - r, l = n[3] - a;
    if (o === 0 || l === 0) return;
    const h = this.smaskPreparedEntry;
    if (h) {
      let c = r, d = a, u = o, p = l;
      const f = this.smaskPreparedOOBAlpha, m = f !== null;
      if (m) {
        c = Math.max(r, e.offsetX), d = Math.max(a, e.offsetY);
        const g = Math.min(r + o, e.offsetX + e.canvas.width), b = Math.min(a + l, e.offsetY + e.canvas.height);
        u = g - c, p = b - d;
      }
      if (u > 0 && p > 0) {
        const g = c - this.smaskPreparedOffsetX, b = d - this.smaskPreparedOffsetY;
        i.save(), i.globalAlpha = 1, i.setTransform(1, 0, 0, 1, 0, 0);
        const y = new Path2D();
        y.rect(c, d, u, p), i.clip(y), i.globalCompositeOperation = "destination-in", i.drawImage(h.canvas, g, b, u, p, c, d, u, p), i.restore();
      }
      m && f < 255 && this._applySMaskOOBAlpha(i, r, a, o, l, c, d, c + u, d + p, f);
    } else this.genericComposeSMask(e, i, o, l, r, a);
    t && (t.save(), t.globalAlpha = 1, t.globalCompositeOperation = e.blendMode || "source-over", t.setTransform(1, 0, 0, 1, 0, 0), t.drawImage(i.canvas, r, a, o, l, r, a, o, l), t.restore());
  }
  _applySMaskOOBAlpha(t, e, i, n, r, a, o, l, h, c) {
    const d = a < l && o < h;
    if (d && a === e && o === i && l === e + n && h === i + r) return;
    const u = new Path2D();
    u.rect(e, i, n, r), d && u.rect(a, o, l - a, h - o), t.save(), t.globalAlpha = c / 255, t.setTransform(1, 0, 0, 1, 0, 0), t.clip(u, "evenodd"), t.globalCompositeOperation = "destination-in", t.fillStyle = "#000000", t.fillRect(e, i, n, r), t.restore();
  }
  genericComposeSMask(t, e, i, n, r, a) {
    const { context: o, offsetX: l, offsetY: h } = t;
    e.save(), e.globalAlpha = 1, e.setTransform(1, 0, 0, 1, 0, 0);
    const c = new Path2D();
    c.rect(r, a, i, n), e.clip(c), e.globalCompositeOperation = "destination-in", e.drawImage(o.canvas, r - l, a - h, i, n, r, a, i, n), e.restore();
  }
  save(t) {
    this.inSMaskMode && Nt(this.ctx, this.suspendedCtx), this.ctx.save();
    const e = this.current;
    this.stateStack.push(e), this.current = e.clone(), this.dependencyTracker?.save(t);
  }
  restore(t) {
    if (this.dependencyTracker?.restore(t), this.stateStack.length === 0) {
      this.inSMaskMode && this.endSMaskMode();
      return;
    }
    this.current = this.stateStack.pop(), this.ctx.restore(), this.inSMaskMode && (Nt(this.suspendedCtx, this.ctx), this.ctx.setTransform(this.suspendedCtx.getTransform())), this.checkSMaskState(t), this.pendingClip = null, this._cachedScaleForStroking[0] = -1, this._cachedGetSinglePixelWidth = null;
  }
  transform(t, e, i, n, r, a, o) {
    this.dependencyTracker?.recordIncrementalData("transform", t), this.ctx.transform(e, i, n, r, a, o), this._cachedScaleForStroking[0] = -1, this._cachedGetSinglePixelWidth = null;
  }
  constructPath(t, e, i, n) {
    let [r] = i;
    if (!n) {
      r ||= i[0] = new Path2D(), e !== Et.stroke && e !== Et.closeStroke && (this.current.tilingPatternDims = null), this[e](t, r);
      return;
    }
    if (this.dependencyTracker !== null) {
      const o = e === Et.stroke ? this.current.lineWidth / 2 : 0;
      this.dependencyTracker.resetBBox(t).recordBBox(t, this.ctx, n[0] - o, n[2] + o, n[1] - o, n[3] + o).recordDependencies(t, ["transform"]);
    }
    r instanceof Path2D || (r = i[0] = _i(r)), _.axialAlignedBoundingBox(n, j(this.ctx), this.current.minMax);
    const a = this.current.tilingPatternDims;
    if (a && e !== Et.stroke && e !== Et.closeStroke && this.current.fillColor instanceof qe) {
      const o = _.intersect(this.current.clipBox, this.current.minMax);
      o ? this.current.fillColor.updatePatternDims(o, a) : this.current.tilingPatternDims = null;
    }
    this[e](t, r), this._pathStartIdx = t;
  }
  closePath(t) {
    this.ctx.closePath();
  }
  stroke(t, e, i = !0) {
    const n = i && this.#p(this.current.strokeAlpha), r = this.ctx, a = this.current.strokeColor;
    if (r.globalAlpha = this.current.strokeAlpha, this.contentVisible)
      if (typeof a == "object" && a?.getPattern) {
        const o = a.isModifyingCurrentTransform() ? r.getTransform() : null;
        if (r.save(), r.strokeStyle = a.getPattern(r, this, vt(r), at.STROKE, t), o) {
          const l = new Path2D();
          l.addPath(e, r.getTransform().invertSelf().multiplySelf(o)), e = l;
        }
        this.rescaleAndStroke(e, !1), r.restore();
      } else this.rescaleAndStroke(e, !0);
    this.dependencyTracker?.recordDependencies(t, bt.stroke), i && this.consumePath(t, e, this.current.getClippedPathBoundingBox(at.STROKE, j(this.ctx))), r.globalAlpha = this.current.fillAlpha, this.#b(n);
  }
  closeStroke(t, e) {
    this.stroke(t, e);
  }
  fill(t, e, i = !0) {
    const n = i && this.#p(this.current.fillAlpha), r = this.ctx, a = this.current.fillColor, o = this.current.patternFill;
    let l = !1;
    const h = this.current.getClippedPathBoundingBox();
    if (this.dependencyTracker?.recordDependencies(t, bt.fill), o) {
      const c = this.current.tilingPatternDims, d = c && a.canSkipPatternCanvas(c);
      if (d) {
        a.drawPattern(this, e, this.pendingEOFill, d, t), this.pendingEOFill = !1, i && this.consumePath(t, e, h), this.current.tilingPatternDims = null, this.#b(n);
        return;
      }
      const u = a.isModifyingCurrentTransform() ? r.getTransform() : null;
      if (this.dependencyTracker?.save(t), r.save(), r.fillStyle = a.getPattern(r, this, vt(r), at.FILL, t), u) {
        const p = new Path2D();
        p.addPath(e, r.getTransform().invertSelf().multiplySelf(u)), e = p;
      }
      l = !0;
    }
    this.contentVisible && h !== null && (this.pendingEOFill ? (r.fill(e, "evenodd"), this.pendingEOFill = !1) : r.fill(e)), l && (r.restore(), this.dependencyTracker?.restore(t)), i && this.consumePath(t, e, h), this.#b(n);
  }
  eoFill(t, e) {
    this.pendingEOFill = !0, this.fill(t, e);
  }
  fillStroke(t, e) {
    const i = this.#p(Math.min(this.current.fillAlpha, this.current.strokeAlpha));
    this.fill(t, e, !1), this.stroke(t, e, !1), this.consumePath(t, e), this.#b(i);
  }
  eoFillStroke(t, e) {
    this.pendingEOFill = !0, this.fillStroke(t, e);
  }
  closeFillStroke(t, e) {
    this.fillStroke(t, e);
  }
  closeEOFillStroke(t, e) {
    this.pendingEOFill = !0, this.fillStroke(t, e);
  }
  endPath(t, e) {
    this.consumePath(t, e);
  }
  rawFillPath(t, e) {
    const i = this.#p(this.current.fillAlpha);
    this.ctx.fill(e), this.dependencyTracker?.recordDependencies(t, bt.rawFillPath).recordOperation(t), this.#b(i);
  }
  clip(t) {
    this.dependencyTracker?.recordFutureForcedDependency("clipMode", t), this.pendingClip = Or;
  }
  eoClip(t) {
    this.dependencyTracker?.recordFutureForcedDependency("clipMode", t), this.pendingClip = li;
  }
  beginText(t) {
    this.current.textMatrix = null, this.current.textMatrixScale = 1, this.current.x = this.current.lineX = 0, this.current.y = this.current.lineY = 0, this.dependencyTracker?.recordOpenMarker(t).resetIncrementalData("sameLineText").resetIncrementalData("moveText", t);
  }
  endText(t) {
    const e = this.pendingTextPaths, i = this.ctx;
    if (this.dependencyTracker) {
      const { dependencyTracker: n } = this;
      e !== void 0 && n.recordFutureForcedDependency("textClip", n.getOpenMarker()).recordFutureForcedDependency("textClip", t), n.recordCloseMarker(t);
    }
    if (e !== void 0) {
      const n = new Path2D(), r = i.getTransform().invertSelf();
      for (const { transform: a, x: o, y: l, fontSize: h, path: c } of e)
        c && n.addPath(c, new DOMMatrix(a).preMultiplySelf(r).translate(o, l).scale(h, -h));
      i.clip(n);
    }
    delete this.pendingTextPaths;
  }
  setCharSpacing(t, e) {
    this.dependencyTracker?.recordSimpleData("charSpacing", t), this.current.charSpacing = e;
  }
  setWordSpacing(t, e) {
    this.dependencyTracker?.recordSimpleData("wordSpacing", t), this.current.wordSpacing = e;
  }
  setHScale(t, e) {
    this.dependencyTracker?.recordSimpleData("hScale", t), this.current.textHScale = e / 100;
  }
  setLeading(t, e) {
    this.dependencyTracker?.recordSimpleData("leading", t), this.current.leading = -e;
  }
  setFont(t, e, i) {
    this.dependencyTracker?.recordSimpleData("font", t).recordSimpleDataFromNamed("fontObj", e, t);
    const n = this.commonObjs.get(e), r = this.current;
    if (!n) throw new Error(`Can't find font for ${e}`);
    if (r.fontMatrix = n.fontMatrix || Ze, (r.fontMatrix[0] === 0 || r.fontMatrix[3] === 0) && R("Invalid font matrix for font " + e), i < 0 ? (i = -i, r.fontDirection = -1) : r.fontDirection = 1, this.current.font = n, this.current.fontSize = i, n.isType3Font) return;
    const a = n.loadedName || "sans-serif", o = n.systemFontInfo?.css || `"${a}", ${n.fallbackName}`;
    let l = "normal";
    n.black ? l = "900" : n.bold && (l = "bold");
    const h = n.italic ? "italic" : "normal", c = Y(i, Mr, Dr);
    this.current.fontSizeScale = i / c, this.ctx.font = `${h} ${l} ${c}px ${o}`;
  }
  setTextRenderingMode(t, e) {
    this.dependencyTracker?.recordSimpleData("textRenderingMode", t), this.current.textRenderingMode = e;
  }
  setTextRise(t, e) {
    this.dependencyTracker?.recordSimpleData("textRise", t), this.current.textRise = e;
  }
  moveText(t, e, i) {
    this.dependencyTracker?.resetIncrementalData("sameLineText").recordIncrementalData("moveText", t), this.current.x = this.current.lineX += e, this.current.y = this.current.lineY += i;
  }
  setLeadingMoveText(t, e, i) {
    this.setLeading(t, -i), this.moveText(t, e, i);
  }
  setTextMatrix(t, e) {
    this.dependencyTracker?.resetIncrementalData("sameLineText").recordSimpleData("textMatrix", t);
    const { current: i } = this;
    i.textMatrix = e, i.textMatrixScale = Math.hypot(e[0], e[1]), i.x = i.lineX = 0, i.y = i.lineY = 0;
  }
  nextLine(t) {
    this.moveText(t, 0, this.current.leading), this.dependencyTracker?.recordIncrementalData("moveText", this.dependencyTracker.getSimpleIndex("leading") ?? t);
  }
  #y(t, e, i) {
    const n = new Path2D();
    return n.addPath(t, new DOMMatrix(i).invertSelf().multiplySelf(e)), n;
  }
  paintChar(t, e, i, n, r, a) {
    const o = this.ctx, l = this.current, h = l.font, c = l.textRenderingMode, d = l.fontSize / l.fontSizeScale, u = c & tt.FILL_STROKE_MASK, p = !!(c & tt.ADD_TO_PATH_FLAG), f = l.patternFill && !h.missingFile, m = l.patternStroke && !h.missingFile;
    let g;
    if ((h.disableFontFace || p || f || m) && !h.missingFile && (g = h.getPathGenerator(this.commonObjs, e)), g && (h.disableFontFace || f || m)) {
      o.save(), o.translate(i, n), o.scale(d, -d), this.dependencyTracker?.recordCharacterBBox(t, o, h);
      let b;
      if (u === tt.FILL || u === tt.FILL_STROKE)
        if (r) {
          b = o.getTransform(), o.setTransform(...r);
          const y = this.#y(g, b, r);
          o.fill(y);
        } else o.fill(g);
      if (u === tt.STROKE || u === tt.FILL_STROKE)
        if (a) {
          b ||= o.getTransform(), o.setTransform(...a);
          const { a: y, b: A, c: w, d: v } = b, S = _.inverseTransform(a), E = _.transform([
            y,
            A,
            w,
            v,
            0,
            0
          ], S);
          _.singularValueDecompose2dScale(E, gt), o.lineWidth *= Math.max(gt[0], gt[1]) / d, o.stroke(this.#y(g, b, a));
        } else
          o.lineWidth /= d, o.stroke(g);
      o.restore();
    } else
      (u === tt.FILL || u === tt.FILL_STROKE) && (o.fillText(e, i, n), this.dependencyTracker?.recordCharacterBBox(t, o, h, d, i, n, () => o.measureText(e))), (u === tt.STROKE || u === tt.FILL_STROKE) && (this.dependencyTracker && this.dependencyTracker?.recordCharacterBBox(t, o, h, d, i, n, () => o.measureText(e)).recordDependencies(t, bt.stroke), o.strokeText(e, i, n));
    p && ((this.pendingTextPaths ||= []).push({
      transform: j(o),
      x: i,
      y: n,
      fontSize: d,
      path: g
    }), this.dependencyTracker?.recordCharacterBBox(t, o, h, d, i, n));
  }
  get isFontSubpixelAAEnabled() {
    const t = this.canvasFactory.create(10, 10), e = t.context;
    e.scale(1.5, 1), e.fillText("I", 0, 10);
    const i = e.getImageData(0, 0, 10, 10).data;
    this.canvasFactory.destroy(t);
    let n = !1;
    for (let r = 3; r < i.length; r += 4) if (i[r] > 0 && i[r] < 255) {
      n = !0;
      break;
    }
    return P(this, "isFontSubpixelAAEnabled", n);
  }
  showText(t, e) {
    this.dependencyTracker && (this.dependencyTracker.recordDependencies(t, bt.showText).resetBBox(t), this.current.textRenderingMode & tt.ADD_TO_PATH_FLAG && this.dependencyTracker.recordFutureForcedDependency("textClip", t).inheritPendingDependenciesAsFutureForcedDependencies());
    const i = this.current, n = i.font;
    if (n.isType3Font) {
      const I = this.#p(i.fillAlpha);
      this.showType3Text(t, e), this.dependencyTracker?.recordShowTextOperation(t), this.#b(I);
      return;
    }
    const r = i.fontSize;
    if (r === 0) {
      this.dependencyTracker?.recordOperation(t);
      return;
    }
    const a = this.#p(i.fillAlpha), o = this.ctx, l = i.fontSizeScale, h = i.charSpacing, c = i.wordSpacing, d = i.fontDirection, u = i.textHScale * d, p = e.length, f = n.vertical, m = f ? 1 : -1, g = n.defaultVMetrics, b = r * i.fontMatrix[0], y = i.textRenderingMode === tt.FILL && !n.disableFontFace && !i.patternFill;
    o.save(), i.textMatrix && o.transform(...i.textMatrix), o.translate(i.x, i.y + i.textRise), d > 0 ? o.scale(u, -1) : o.scale(u, 1);
    let A, w;
    const v = i.textRenderingMode & tt.FILL_STROKE_MASK, S = v === tt.FILL || v === tt.FILL_STROKE, E = v === tt.STROKE || v === tt.FILL_STROKE;
    let C = i.lineWidth;
    const x = i.textMatrixScale;
    if (x === 0 || C === 0 ? E && (C = this.getSinglePixelWidth()) : C /= x, l !== 1 && (o.scale(l, l), C /= l), o.lineWidth = C, S && i.patternFill) {
      o.save();
      const I = i.fillColor.getPattern(o, this, vt(o), at.FILL, t);
      A = j(o), o.restore(), o.fillStyle = I;
    }
    if (E && i.patternStroke) {
      o.save();
      const I = i.strokeColor.getPattern(o, this, vt(o), at.STROKE, t);
      w = j(o), o.restore(), o.strokeStyle = I;
    }
    if (n.isInvalidPDFjsFont) {
      const I = [];
      let B = 0;
      for (const K of e)
        I.push(K.unicode), B += K.width;
      const G = I.join("");
      if (o.fillText(G, 0, 0), this.dependencyTracker !== null) {
        const K = o.measureText(G);
        this.dependencyTracker.recordBBox(t, this.ctx, -K.actualBoundingBoxLeft, K.actualBoundingBoxRight, -K.actualBoundingBoxAscent, K.actualBoundingBoxDescent).recordShowTextOperation(t);
      }
      i.x += B * b * u, o.restore(), this.compose(), this.#b(a);
      return;
    }
    let M = 0, k;
    for (k = 0; k < p; ++k) {
      const I = e[k];
      if (typeof I == "number") {
        M += m * I * r / 1e3;
        continue;
      }
      let B = !1;
      const G = (I.isSpace ? c : 0) + h, K = I.fontChar, L = I.accent;
      let D, ot, it = I.width;
      if (f) {
        const W = I.vmetric || g, X = -(I.vmetric ? W[1] : it * 0.5) * b, Vt = W[2] * b;
        it = W ? -W[0] : it, D = X / l, ot = (M + Vt) / l;
      } else
        D = M / l, ot = 0;
      let _t;
      if (n.remeasure && it > 0) {
        _t = o.measureText(K);
        const W = _t.width * 1e3 / r * l;
        if (it < W && this.isFontSubpixelAAEnabled) {
          const X = it / W;
          B = !0, o.save(), o.scale(X, 1), D /= X;
        } else it !== W && (D += (it - W) / 2e3 * r / l);
      }
      if (this.contentVisible && (I.isInFont || n.missingFile)) {
        if (y && !L)
          o.fillText(K, D, ot), this.dependencyTracker?.recordCharacterBBox(t, o, _t ? { bbox: null } : n, r / l, D, ot, () => _t ?? o.measureText(K));
        else if (this.paintChar(t, K, D, ot, A, w), L) {
          const W = D + r * L.offset.x / l, X = ot - r * L.offset.y / l;
          this.paintChar(t, L.fontChar, W, X, A, w);
        }
      }
      const jt = f ? it * b - G * d : it * b + G * d;
      M += jt, B && o.restore();
    }
    f ? i.y -= M : i.x += M * u, o.restore(), this.compose(), this.dependencyTracker?.recordShowTextOperation(t), this.#b(a);
  }
  showType3Text(t, e) {
    const i = this.ctx, n = this.current, r = n.font, a = n.fontSize, o = n.fontDirection, l = r.vertical ? 1 : -1, h = n.charSpacing, c = n.wordSpacing, d = n.textHScale * o, u = n.fontMatrix || Ze, p = e.length, f = n.textRenderingMode === tt.INVISIBLE;
    let m, g, b, y;
    if (f || a === 0) return;
    this._cachedScaleForStroking[0] = -1, this._cachedGetSinglePixelWidth = null, i.save(), n.textMatrix && i.transform(...n.textMatrix), i.translate(n.x, n.y + n.textRise), i.scale(d, o);
    const A = this.dependencyTracker;
    for (this.dependencyTracker = A ? new fs(A, t) : null, m = 0; m < p; ++m) {
      if (g = e[m], typeof g == "number") {
        y = l * g * a / 1e3, this.ctx.translate(y, 0), n.x += y * d;
        continue;
      }
      const w = (g.isSpace ? c : 0) + h, v = r.charProcOperatorList.get(g.operatorListId);
      v ? this.contentVisible && (this.save(), v.fnArray[0] === Et.setCharWidth && (n.fillAlpha = n.strokeAlpha = 1, i.globalAlpha = 1), i.scale(a, a), i.transform(...u), this.executeOperatorList(v), this.restore()) : R(`Type3 character "${g.operatorListId}" is not available.`);
      const S = [g.width, 0];
      _.applyTransform(S, u), b = S[0] * a + w, i.translate(b, 0), n.x += b * d;
    }
    i.restore(), A && (this.dependencyTracker = A);
  }
  setCharWidth(t, e, i) {
  }
  setCharWidthAndBounds(t, e, i, n, r, a, o) {
    const l = new Path2D();
    l.rect(n, r, a - n, o - r), this.ctx.clip(l), this.dependencyTracker?.recordBBox(t, this.ctx, n, a, r, o).recordClipBox(t, this.ctx, n, a, r, o), this.endPath(t);
  }
  getColorN_Pattern(t, e) {
    let i;
    if (e[0] === "TilingPattern") {
      const n = this.baseTransform || j(this.ctx);
      i = new qe(e, this.ctx, { createCanvasGraphics: (r, a) => new ms(r, this.commonObjs, this.objs, this.canvasFactory, this.filterFactory, {
        optionalContentConfig: this.optionalContentConfig,
        markedContentStack: this.markedContentStack
      }, void 0, void 0, this.dependencyTracker ? new fs(this.dependencyTracker, a, !0) : null) }, n);
    } else i = this._getPattern(t, e[1], e[2]);
    return i;
  }
  setStrokeColorN(t, ...e) {
    this.dependencyTracker?.recordSimpleData("strokeColor", t), this.current.strokeColor = this.getColorN_Pattern(t, e), this.current.patternStroke = !0;
  }
  setFillColorN(t, ...e) {
    this.dependencyTracker?.recordSimpleData("fillColor", t);
    const i = this.current.fillColor = this.getColorN_Pattern(t, e);
    this.current.patternFill = !0, this.current.tilingPatternDims = i instanceof qe ? [
      0,
      0,
      0,
      0
    ] : null;
  }
  setStrokeRGBColor(t, e) {
    this.dependencyTracker?.recordSimpleData("strokeColor", t), this.ctx.strokeStyle = this.current.strokeColor = e, this.current.patternStroke = !1;
  }
  setStrokeTransparent(t) {
    this.dependencyTracker?.recordSimpleData("strokeColor", t), this.ctx.strokeStyle = this.current.strokeColor = "transparent", this.current.patternStroke = !1;
  }
  setFillRGBColor(t, e) {
    this.dependencyTracker?.recordSimpleData("fillColor", t), this.ctx.fillStyle = this.current.fillColor = e, this.current.patternFill = !1, this.current.tilingPatternDims = null;
  }
  setFillTransparent(t) {
    this.dependencyTracker?.recordSimpleData("fillColor", t), this.ctx.fillStyle = this.current.fillColor = "transparent", this.current.patternFill = !1, this.current.tilingPatternDims = null;
  }
  _getPattern(t, e, i = null) {
    const n = this.cachedPatterns.getOrInsertComputed(e, () => Pr(this.getObject(t, e)));
    return i && (n.matrix = i), n;
  }
  shadingFill(t, e) {
    if (!this.contentVisible) return;
    const i = this.#p(this.current.fillAlpha), n = this.ctx;
    this.save(t), n.fillStyle = this._getPattern(t, e).getPattern(n, this, vt(n), at.SHADING, t);
    const r = vt(n);
    if (r) {
      const { width: a, height: o } = n.canvas, l = Ht.slice();
      _.axialAlignedBoundingBox([
        0,
        0,
        a,
        o
      ], r, l);
      const [h, c, d, u] = l;
      this.ctx.fillRect(h, c, d - h, u - c);
    } else this.ctx.fillRect(-1e10, -1e10, 2e10, 2e10);
    this.dependencyTracker?.resetBBox(t).recordFullPageBBox(t).recordDependencies(t, bt.transform).recordDependencies(t, bt.fill).recordOperation(t), this.compose(this.current.getClippedPathBoundingBox()), this.restore(t), this.#b(i);
  }
  beginInlineImage() {
    U("Should not call beginInlineImage");
  }
  beginImageData() {
    U("Should not call beginImageData");
  }
  paintFormXObjectBegin(t, e, i) {
    if (this.contentVisible && (this.save(t), this.baseTransformStack.push(this.baseTransform), e && this.transform(t, ...e), this.baseTransform = j(this.ctx), i)) {
      _.axialAlignedBoundingBox(i, this.baseTransform, this.current.minMax);
      const [n, r, a, o] = i, l = new Path2D();
      l.rect(n, r, a - n, o - r), this.ctx.clip(l), this.dependencyTracker?.recordClipBox(t, this.ctx, n, a, r, o), this.endPath(t);
    }
  }
  paintFormXObjectEnd(t) {
    this.contentVisible && (this.restore(t), this.baseTransform = this.baseTransformStack.pop());
  }
  beginGroup(t, e) {
    if (!this.contentVisible) return;
    this.save(t);
    const { inSMaskMode: i } = this;
    i && (this.endSMaskMode(), this.current.activeSMask = null);
    const n = this.ctx;
    if ((!e.needsIsolation || !e.isolated && !e.hasSoftMask) && !e.knockout && !e.isGray && this.#e === 0 && n.globalAlpha === 1 && n.globalCompositeOperation === "source-over" && !i) {
      if (e.bbox) {
        let w = new Path2D();
        const [v, S, E, C] = e.bbox;
        if (w.rect(v, S, E - v, C - S), e.matrix) {
          const x = new Path2D();
          x.addPath(w, new DOMMatrix(e.matrix)), w = x;
        }
        n.clip(w);
      }
      this.groupStack.push(null), this.#u.push(null), this.groupLevel++;
      return;
    }
    !e.isolated && !e.knockout && this.#e === 0 && Ie("TODO: Fully support non-isolated non-knockout groups.");
    const r = j(n);
    e.matrix && n.transform(...e.matrix);
    const a = [
      0,
      0,
      n.canvas.width,
      n.canvas.height
    ];
    let o;
    e.bbox ? (o = Ht.slice(), _.axialAlignedBoundingBox(e.bbox, j(n), o), o = _.intersect(o, a) || [
      0,
      0,
      0,
      0
    ]) : o = a;
    const l = Math.floor(o[0]), h = Math.floor(o[1]), c = Math.max(Math.ceil(o[2]) - l, 1), d = Math.max(Math.ceil(o[3]) - h, 1);
    this.current.startNewPathAndClipBox([
      0,
      0,
      c,
      d
    ]);
    const u = this.canvasFactory.create(c, d);
    e.smask && this.smaskGroupCanvases.push(u);
    const p = u.context, f = e.knockout && !e.isolated ? n : null, m = !e.isolated && !e.knockout && !e.smask && e.needsIsolation && this.#e > 0, g = e.knockout ? this.canvasFactory.create(c, d) : null, b = this.#e;
    e.knockout ? this.#e++ : this.#e = 0, p.translate(-l, -h), p.transform(...r);
    const y = !e.isolated && !e.smask && e.needsIsolation, A = y && !i && b === 0 && !e.knockout && !e.isGray && e.hasSoftMask && n.globalAlpha === 1 && n.globalCompositeOperation === "source-over" && this.current.transferMaps === "none";
    if (y && (i || A) && (p.save(), p.setTransform(1, 0, 0, 1, 0, 0), p.drawImage(n.canvas, -l, -h), p.restore()), e.bbox) {
      let w = new Path2D();
      const [v, S, E, C] = e.bbox;
      if (w.rect(v, S, E - v, C - S), e.matrix) {
        const x = new Path2D();
        x.addPath(w, new DOMMatrix(e.matrix)), w = x;
      }
      p.clip(w);
    }
    e.smask && this.smaskStack.push({
      canvas: u.canvas,
      context: p,
      offsetX: l,
      offsetY: h,
      subtype: e.smask.subtype,
      backdrop: e.smask.backdrop,
      transferMap: e.smask.transferMap || null
    }), (!e.smask || this.dependencyTracker) && (n.setTransform(1, 0, 0, 1, 0, 0), n.translate(l, h), n.save()), Nt(n, p), this.ctx = p, this.dependencyTracker?.inheritSimpleDataAsFutureForcedDependencies([
      "fillAlpha",
      "strokeAlpha",
      "globalCompositeOperation"
    ]).pushBaseTransform(n), this.setGState(t, [
      ["BM", "source-over"],
      ["ca", 1],
      ["CA", 1],
      ["TR", null]
    ]), this.groupStack.push(n), this.#u.push({
      backdropCtx: f,
      savedKnockoutLevel: b,
      offsetX: l,
      offsetY: h,
      hasInnerBackdrop: m,
      replaceBackdrop: A,
      knockoutMaskEntry: g,
      knockoutTempEntry: null,
      knockoutBackdropEntry: null
    }), this.groupLevel++;
  }
  endGroup(t, e) {
    if (!this.contentVisible) return;
    this.groupLevel--;
    const i = this.ctx, n = this.groupStack.pop(), r = this.#u.pop();
    if (r && (this.#e = r.savedKnockoutLevel), n === null) {
      this.restore(t);
      return;
    }
    if (e.isGray && this.#A(i), this.ctx = n, this.ctx.imageSmoothingEnabled = !1, this.dependencyTracker?.popBaseTransform(), e.smask)
      this.tempSMask = this.smaskStack.pop(), this.restore(t), this.dependencyTracker && (this.ctx.restore(), this.inSMaskMode && this.ctx.setTransform(this.suspendedCtx.getTransform())), this.#v(r);
    else {
      this.ctx.restore();
      const a = j(this.ctx);
      this.restore(t), this.ctx.save(), this.ctx.setTransform(...a);
      const o = Ht.slice();
      _.axialAlignedBoundingBox([
        0,
        0,
        i.canvas.width,
        i.canvas.height
      ], a, o);
      const l = this.#u.at(-1);
      if (this.#e > 0)
        if (r.hasInnerBackdrop) {
          const { width: h, height: c } = i.canvas, d = this.canvasFactory.create(h, c), u = d.context;
          u.drawImage(n.canvas, r.offsetX, r.offsetY, h, c, 0, 0, h, c), u.globalCompositeOperation = "source-over", u.drawImage(i.canvas, 0, 0);
          const p = this.#g(i.canvas);
          u.globalCompositeOperation = "destination-in", u.drawImage(p.canvas, 0, 0);
          const f = this.ctx.globalCompositeOperation, m = this.ctx.globalAlpha, g = this.ctx.filter;
          this.ctx.save(), this.ctx.setTransform(...a), this.ctx.globalAlpha = 1, z.isCanvasFilterSupported && (this.ctx.filter = "none"), this.ctx.globalCompositeOperation = "destination-out", this.ctx.drawImage(p.canvas, 0, 0), this.ctx.globalCompositeOperation = f, this.ctx.globalAlpha = m, z.isCanvasFilterSupported && (this.ctx.filter = g ?? "none"), this.ctx.drawImage(d.canvas, 0, 0), this.ctx.restore(), this.canvasFactory.destroy(p), this.canvasFactory.destroy(d);
        } else {
          const h = l?.backdropCtx ?? null;
          this.#c(this.ctx, i.canvas, {
            backdropCanvas: h?.canvas ?? null,
            destTransform: a,
            backdropOffset: h ? [l.offsetX + r.offsetX, l.offsetY + r.offsetY] : [0, 0],
            sourceAlpha: this.ctx.globalAlpha,
            sourceFilter: this.ctx.filter
          });
        }
      else {
        if (r.replaceBackdrop) {
          const h = new Path2D();
          h.rect(0, 0, i.canvas.width, i.canvas.height), this.ctx.clip(h), this.ctx.globalCompositeOperation = "copy";
        }
        this.ctx.drawImage(i.canvas, 0, 0);
      }
      this.ctx.restore(), this.canvasFactory.destroy({
        canvas: i.canvas,
        context: i
      }), this.#v(r), this.compose(o);
    }
  }
  #A(t) {
    const { canvas: e } = t, { width: i, height: n } = e;
    if (z.isCanvasFilterSupported) {
      t.save(), t.setTransform(1, 0, 0, 1, 0, 0), t.filter = "grayscale(1)", t.globalAlpha = 1, t.globalCompositeOperation = "copy", t.drawImage(e, 0, 0), t.restore();
      return;
    }
    const r = t.getImageData(0, 0, i, n), { data: a } = r;
    for (let o = 0, l = a.length; o < l; o += 4) {
      const h = a[o] * 0.2126 + a[o + 1] * 0.7152 + a[o + 2] * 0.0722 + 0.5 | 0;
      a[o] = a[o + 1] = a[o + 2] = h;
    }
    t.putImageData(r, 0, 0);
  }
  #v(t) {
    t && (t.knockoutMaskEntry && (this.canvasFactory.destroy(t.knockoutMaskEntry), t.knockoutMaskEntry = null), t.knockoutTempEntry && (this.canvasFactory.destroy(t.knockoutTempEntry), t.knockoutTempEntry = null), t.knockoutBackdropEntry && (this.canvasFactory.destroy(t.knockoutBackdropEntry), t.knockoutBackdropEntry = null));
  }
  beginAnnotation(t, e, i, n, r, a, o) {
    if (this.#d(), be(this.ctx), this.ctx.save(), this.save(t), this.baseTransform && this.ctx.setTransform(...this.baseTransform), i) {
      const l = i[2] - i[0], h = i[3] - i[1];
      if (a && this.annotationCanvasMap) {
        n = n.slice(), n[4] -= i[0], n[5] -= i[1], _.singularValueDecompose2dScale(j(this.ctx), gt);
        const { viewportScale: c } = this, d = Math.ceil(l * this.outputScaleX * c), u = Math.ceil(h * this.outputScaleY * c);
        this.annotationCanvas = this.canvasFactory.create(d, u);
        const { canvas: p, context: f } = this.annotationCanvas;
        if (o) {
          const m = this.annotationCanvasMap.getOrInsertComputed(e, Zt);
          p.setAttribute("data-canvas-name", o);
          const g = m.findIndex((b) => b.getAttribute("data-canvas-name") === o);
          g === -1 ? m.push(p) : m[g] = p;
        } else this.annotationCanvasMap.set(e, p);
        this.annotationCanvas.savedCtx = this.ctx, this.ctx = f, this.ctx.save(), this.ctx.setTransform(gt[0], 0, 0, -gt[1], 0, h * gt[1]), be(this.ctx);
      } else {
        be(this.ctx), this.endPath(t);
        const c = new Path2D();
        c.rect(i[0], i[1], l, h), this.ctx.clip(c);
      }
    }
    this.current = new ni(this.ctx.canvas.width, this.ctx.canvas.height), this.baseTransformStack.push(this.baseTransform), this.transform(t, ...n), this.transform(t, ...r), this.baseTransform = j(this.ctx);
  }
  endAnnotation(t) {
    this.annotationCanvas && (this.ctx.restore(), this.#f(), this.ctx = this.annotationCanvas.savedCtx, delete this.annotationCanvas.savedCtx, delete this.annotationCanvas), this.baseTransform = this.baseTransformStack.pop();
  }
  paintImageMaskXObject(t, e) {
    if (!this.contentVisible) return;
    const i = e.count;
    e = this.getObject(t, e.data, e), e.count = i;
    const n = this.#p(this.current.fillAlpha), r = this.ctx, a = this._createMaskCanvas(t, e), o = a.canvas;
    r.save(), r.setTransform(1, 0, 0, 1, 0, 0), r.drawImage(o, a.offsetX, a.offsetY), this.dependencyTracker?.resetBBox(t).recordBBox(t, this.ctx, a.offsetX, a.offsetX + o.width, a.offsetY, a.offsetY + o.height).recordOperation(t), r.restore(), a.canvasEntry && this.canvasFactory.destroy(a.canvasEntry), this.compose(), this.#b(n);
  }
  paintImageMaskXObjectRepeat(t, e, i, n = 0, r = 0, a, o) {
    if (!this.contentVisible) return;
    e = this.getObject(t, e.data, e);
    const l = this.#p(this.current.fillAlpha), h = this.ctx;
    h.save();
    const c = j(h);
    h.transform(i, n, r, a, 0, 0);
    const d = this._createMaskCanvas(t, e);
    h.setTransform(1, 0, 0, 1, d.offsetX - c[4], d.offsetY - c[5]), this.dependencyTracker?.resetBBox(t);
    for (let u = 0, p = o.length; u < p; u += 2) {
      const f = _.transform(c, [
        i,
        n,
        r,
        a,
        o[u],
        o[u + 1]
      ]);
      h.drawImage(d.canvas, f[4], f[5]), this.dependencyTracker?.recordBBox(t, this.ctx, f[4], f[4] + d.canvas.width, f[5], f[5] + d.canvas.height);
    }
    h.restore(), d.canvasEntry && this.canvasFactory.destroy(d.canvasEntry), this.compose(), this.dependencyTracker?.recordOperation(t), this.#b(l);
  }
  paintImageMaskXObjectGroup(t, e) {
    if (!this.contentVisible) return;
    const i = this.#p(this.current.fillAlpha), n = this.ctx, r = this.current.fillColor, a = this.current.patternFill;
    this.dependencyTracker?.resetBBox(t).recordDependencies(t, bt.transformAndFill);
    for (const o of e) {
      const { data: l, width: h, height: c, transform: d } = o, u = this.canvasFactory.create(h, c), p = u.context;
      p.save(), ai(p, this.getObject(t, l, o)), p.globalCompositeOperation = "source-in", p.fillStyle = a ? r.getPattern(p, this, vt(n), at.FILL, t) : r, p.fillRect(0, 0, h, c), p.restore(), n.save(), n.transform(...d), n.scale(1, -1), me(n, u.canvas, 0, 0, h, c, 0, -1, 1, 1), this.canvasFactory.destroy(u), this.dependencyTracker?.recordBBox(t, n, 0, h, 0, c), n.restore();
    }
    this.compose(), this.dependencyTracker?.recordOperation(t), this.#b(i);
  }
  paintImageXObject(t, e) {
    if (!this.contentVisible) return;
    const i = this.getObject(t, e);
    if (!i) {
      R("Dependent image isn't ready yet");
      return;
    }
    this.paintInlineImageXObject(t, i);
  }
  paintImageXObjectRepeat(t, e, i, n, r) {
    if (!this.contentVisible) return;
    const a = this.getObject(t, e);
    if (!a) {
      R("Dependent image isn't ready yet");
      return;
    }
    const o = a.width, l = a.height, h = [];
    for (let c = 0, d = r.length; c < d; c += 2) h.push({
      transform: [
        i,
        0,
        0,
        n,
        r[c],
        r[c + 1]
      ],
      x: 0,
      y: 0,
      w: o,
      h: l
    });
    this.paintInlineImageXObjectGroup(t, a, h);
  }
  applyTransferMapsToCanvas(t) {
    return this.current.transferMaps !== "none" && (t.filter = this.current.transferMaps, t.drawImage(t.canvas, 0, 0), t.filter = "none"), t.canvas;
  }
  applyTransferMapsToBitmap(t) {
    if (this.current.transferMaps === "none") return {
      img: t.bitmap,
      canvasEntry: null
    };
    const { bitmap: e, width: i, height: n } = t, r = this.canvasFactory.create(i, n), a = r.context;
    return a.filter = this.current.transferMaps, a.drawImage(e, 0, 0), a.filter = "none", {
      img: r.canvas,
      canvasEntry: r
    };
  }
  paintInlineImageXObject(t, e) {
    if (!this.contentVisible) return;
    const i = e.width, n = e.height, r = this.#p(this.current.fillAlpha), a = this.ctx;
    this.save(t);
    const { filter: o } = a;
    o !== "none" && o !== "" && (a.filter = "none"), a.scale(1 / i, -1 / n);
    let l, h = null;
    if (e.bitmap) {
      const d = this.applyTransferMapsToBitmap(e);
      l = d.img, h = d.canvasEntry;
    } else {
      const d = this.canvasFactory.create(i, n);
      ri(d.context, e), l = this.applyTransferMapsToCanvas(d.context), h = d;
    }
    const c = this._scaleImage(l, vt(a));
    a.imageSmoothingEnabled = oi(j(a), e.interpolate), this.dependencyTracker && (this.dependencyTracker.resetBBox(t).recordBBox(t, a, 0, i, -n, 0).recordDependencies(t, bt.imageXObject).recordOperation(t), this.imagesTracker?.record(a, i, n, this.dependencyTracker.clipBox)), me(a, c.img, 0, 0, c.paintWidth, c.paintHeight, 0, -n, i, n), c.tmpCanvas && this.canvasFactory.destroy(c.tmpCanvas), h && this.canvasFactory.destroy(h), this.compose(), this.restore(t), this.#b(r);
  }
  paintInlineImageXObjectGroup(t, e, i) {
    if (!this.contentVisible) return;
    const n = this.#p(this.current.fillAlpha), r = this.ctx;
    let a, o = null;
    if (e.bitmap) a = e.bitmap;
    else {
      const l = e.width, h = e.height, c = this.canvasFactory.create(l, h);
      ri(c.context, e), a = this.applyTransferMapsToCanvas(c.context), o = c;
    }
    this.dependencyTracker?.resetBBox(t);
    for (const l of i)
      r.save(), r.transform(...l.transform), r.scale(1, -1), me(r, a, l.x, l.y, l.w, l.h, 0, -1, 1, 1), this.dependencyTracker?.recordBBox(t, r, 0, 1, -1, 0), r.restore();
    o && this.canvasFactory.destroy(o), this.dependencyTracker?.recordOperation(t), this.compose(), this.#b(n);
  }
  paintSolidColorImageMask(t) {
    if (!this.contentVisible) return;
    const e = this.#p(this.current.fillAlpha);
    this.dependencyTracker?.resetBBox(t).recordBBox(t, this.ctx, 0, 1, 0, 1).recordDependencies(t, bt.fill).recordOperation(t), this.ctx.fillRect(0, 0, 1, 1), this.compose(), this.#b(e);
  }
  markPoint(t, e) {
  }
  markPointProps(t, e, i) {
  }
  beginMarkedContent(t, e) {
    this.dependencyTracker?.beginMarkedContent(t), this.markedContentStack.push({ visible: !0 });
  }
  beginMarkedContentProps(t, e, i) {
    this.dependencyTracker?.beginMarkedContent(t), e === "OC" ? this.markedContentStack.push({ visible: this.optionalContentConfig.isVisible(i) }) : this.markedContentStack.push({ visible: !0 }), this.contentVisible = this.isContentVisible();
  }
  endMarkedContent(t) {
    this.dependencyTracker?.endMarkedContent(t), this.markedContentStack.pop(), this.contentVisible = this.isContentVisible();
  }
  beginCompat(t) {
  }
  endCompat(t) {
  }
  consumePath(t, e, i) {
    const n = this.current.isEmptyClip();
    this.pendingClip && this.current.updateClipFromPath(), this.pendingClip || this.compose(i);
    const r = this.ctx;
    this.pendingClip ? (n || (this.pendingClip === li ? r.clip(e, "evenodd") : r.clip(e)), this.pendingClip = null, this.dependencyTracker?.bboxToClipBoxDropOperation(t).recordFutureForcedDependency("clipPath", t)) : this.dependencyTracker?.recordOperation(t), this.current.startNewPathAndClipBox(this.current.clipBox);
  }
  getSinglePixelWidth() {
    if (!this._cachedGetSinglePixelWidth) {
      const t = j(this.ctx);
      if (t[1] === 0 && t[2] === 0) this._cachedGetSinglePixelWidth = 1 / Math.min(Math.abs(t[0]), Math.abs(t[3]));
      else {
        const e = Math.abs(t[0] * t[3] - t[2] * t[1]), i = Math.hypot(t[0], t[2]), n = Math.hypot(t[1], t[3]);
        this._cachedGetSinglePixelWidth = Math.max(i, n) / e;
      }
    }
    return this._cachedGetSinglePixelWidth;
  }
  getScaleForStroking() {
    if (this._cachedScaleForStroking[0] === -1) {
      const { lineWidth: t } = this.current, { a: e, b: i, c: n, d: r } = this.ctx.getTransform();
      let a, o;
      if (i === 0 && n === 0) {
        const l = Math.abs(e), h = Math.abs(r);
        if (l === h)
          if (t === 0) a = o = 1 / l;
          else {
            const c = l * t;
            a = o = c < 1 ? 1 / c : 1;
          }
        else if (t === 0)
          a = 1 / l, o = 1 / h;
        else {
          const c = l * t, d = h * t;
          a = c < 1 ? 1 / c : 1, o = d < 1 ? 1 / d : 1;
        }
      } else {
        const l = Math.abs(e * r - i * n), h = Math.hypot(e, i), c = Math.hypot(n, r);
        if (t === 0)
          a = c / l, o = h / l;
        else {
          const d = t * l;
          a = c > d ? c / d : 1, o = h > d ? h / d : 1;
        }
      }
      this._cachedScaleForStroking[0] = a, this._cachedScaleForStroking[1] = o;
    }
    return this._cachedScaleForStroking;
  }
  rescaleAndStroke(t, e) {
    const { ctx: i, current: { lineWidth: n } } = this, [r, a] = this.getScaleForStroking();
    if (r === a) {
      i.lineWidth = (n || 1) * r, i.stroke(t);
      return;
    }
    const o = ms.#t ??= new DOMMatrix(), l = i.getLineDash();
    e && i.save(), i.scale(r, a), o.a = 1 / r, o.d = 1 / a;
    const h = new Path2D();
    if (h.addPath(t, o), l.length > 0) {
      const c = Math.max(r, a);
      i.setLineDash(l.map((d) => d / c)), i.lineDashOffset /= c;
    }
    i.lineWidth = n || 1, i.stroke(h), e && i.restore();
  }
  isContentVisible() {
    for (let t = this.markedContentStack.length - 1; t >= 0; t--) if (!this.markedContentStack[t].visible) return !1;
    return !0;
  }
};
for (const s in Et) xe.prototype[s] !== void 0 && (xe.prototype[Et[s]] = xe.prototype[s]);
var Re = class {
  #t = null;
  #e = null;
  _fullReader = null;
  _rangeReaders = /* @__PURE__ */ new Set();
  _source = null;
  constructor(s, t, e) {
    this._source = s, this.#t = t, this.#e = e;
  }
  get _progressiveDataLength() {
    return this._fullReader?._loaded ?? 0;
  }
  getFullReader() {
    return Q(!this._fullReader, "BasePDFStream.getFullReader can only be called once."), this._fullReader = new this.#t(this);
  }
  getRangeReader(s, t) {
    if (t <= this._progressiveDataLength) return null;
    const e = new this.#e(this, s, t);
    return this._rangeReaders.add(e), e;
  }
  cancelAllRequests(s) {
    this._fullReader?.cancel(s);
    for (const t of new Set(this._rangeReaders)) t.cancel(s);
  }
}, Ne = class {
  onProgress = null;
  _contentLength = 0;
  _filename = null;
  _headersCapability = Promise.withResolvers();
  _isRangeSupported = !1;
  _isStreamingSupported = !1;
  _loaded = 0;
  _stream = null;
  constructor(s) {
    this._stream = s;
  }
  _callOnProgress() {
    this.onProgress?.({
      loaded: this._loaded,
      total: this._contentLength
    });
  }
  get headersReady() {
    return this._headersCapability.promise;
  }
  get filename() {
    return this._filename;
  }
  get contentLength() {
    return this._contentLength;
  }
  get isRangeSupported() {
    return this._isRangeSupported;
  }
  get isStreamingSupported() {
    return this._isStreamingSupported;
  }
  async read() {
    U("Abstract method `read` called");
  }
  cancel(s) {
    U("Abstract method `cancel` called");
  }
}, Be = class {
  _stream = null;
  constructor(s, t, e) {
    this._stream = s;
  }
  async read() {
    U("Abstract method `read` called");
  }
  cancel(s) {
    U("Abstract method `cancel` called");
  }
};
function Rr(s) {
  let t = !0, e = i("filename\\*", "i").exec(s);
  if (e) {
    e = e[1];
    let c = o(e);
    return c = unescape(c), c = l(c), c = h(c), r(c);
  }
  if (e = a(s), e) return r(h(e));
  if (e = i("filename", "i").exec(s), e) {
    e = e[1];
    let c = o(e);
    return c = h(c), r(c);
  }
  function i(c, d) {
    return new RegExp("(?:^|;)\\s*" + c + '\\s*=\\s*([^";\\s][^;\\s]*|"(?:[^"\\\\]|\\\\"?)+"?)', d);
  }
  function n(c, d) {
    if (c) {
      if (!/^[\x00-\xFF]+$/.test(d)) return d;
      try {
        const u = new TextDecoder(c, { fatal: !0 }), p = Le(d);
        d = u.decode(p), t = !1;
      } catch {
      }
    }
    return d;
  }
  function r(c) {
    return t && /[\x80-\xff]/.test(c) && (c = n("utf-8", c), t && (c = n("iso-8859-1", c))), c;
  }
  function a(c) {
    const d = [];
    let u;
    const p = i("filename\\*((?!0\\d)\\d+)(\\*?)", "ig");
    for (; (u = p.exec(c)) !== null; ) {
      let [, m, g, b] = u;
      if (m = parseInt(m, 10), m in d) {
        if (m === 0) break;
        continue;
      }
      d[m] = [g, b];
    }
    const f = [];
    for (let m = 0; m < d.length && m in d; ++m) {
      let [g, b] = d[m];
      b = o(b), g && (b = unescape(b), m === 0 && (b = l(b))), f.push(b);
    }
    return f.join("");
  }
  function o(c) {
    if (c.startsWith('"')) {
      const d = c.slice(1).split('\\"');
      for (let u = 0; u < d.length; ++u) {
        const p = d[u].indexOf('"');
        p !== -1 && (d[u] = d[u].slice(0, p), d.length = u + 1), d[u] = d[u].replaceAll(/\\(.)/g, "$1");
      }
      c = d.join('"');
    }
    return c;
  }
  function l(c) {
    const d = c.indexOf("'");
    return d === -1 ? c : n(c.slice(0, d), c.slice(d + 1).replace(/^[^']*'/, ""));
  }
  function h(c) {
    return !c.startsWith("=?") || /[\x00-\x19\x80-\xff]/.test(c) ? c : c.replaceAll(/=\?([\w-]*)\?([QB])\?((?:[^?]|\?(?!=))*)\?=/gi, function(d, u, p, f) {
      if (p === "q" || p === "Q")
        return f = f.replaceAll("_", " "), f = f.replaceAll(/=([0-9a-f]{2})/gi, function(m, g) {
          return String.fromCharCode(parseInt(g, 16));
        }), n(u, f);
      try {
        f = atob(f);
      } catch {
      }
      return n(u, f);
    });
  }
  return "";
}
function Ri(s, t) {
  const e = new Headers();
  if (!s || !t || typeof t != "object") return e;
  for (const i in t) {
    const n = t[i];
    n !== void 0 && e.append(i, n);
  }
  return e;
}
function Nr(s) {
  let t = s.length;
  for (; t > 0 && s[t - 1] !== " " && /\s/.test(s[t - 1]); ) t--;
  return s.slice(0, t);
}
function He(s) {
  return URL.parse(s)?.origin ?? null;
}
function Ni({ responseHeaders: s, isHttp: t, rangeChunkSize: e, disableRange: i }) {
  const n = {
    contentLength: 0,
    isRangeSupported: !1
  }, r = parseInt(s.get("Content-Length"), 10);
  return !Number.isInteger(r) || (n.contentLength = r, r <= 2 * e) || i || !t || s.get("Accept-Ranges") !== "bytes" || (s.get("Content-Encoding") || "identity") === "identity" && (n.isRangeSupported = !0), n;
}
function Bi(s) {
  const t = s.get("Content-Disposition");
  if (t) {
    let e = Rr(t);
    if (e.includes("%")) try {
      e = decodeURIComponent(e);
    } catch {
    }
    if (Ps(e)) return e;
  }
  return null;
}
function Ue(s, t) {
  return new Te(`Unexpected server response (${s}) while retrieving PDF "${t.href}".`, s, s === 404 || s === 0 && t.protocol === "file:");
}
function Hi(s, t) {
  if (s !== t) throw new Error(`Expected range response-origin "${s}" to match "${t}".`);
}
function Ui(s, t, e, i) {
  return fetch(s, {
    method: "GET",
    headers: t,
    signal: i.signal,
    mode: "cors",
    credentials: e ? "include" : "same-origin",
    redirect: "follow"
  });
}
function Gi(s, t) {
  if (s !== 200 && s !== 206) throw Ue(s, t);
}
function Ge(s) {
  if (s instanceof Uint8Array) return s.buffer;
  if (s instanceof ArrayBuffer) return s;
  throw new Error(`getArrayBuffer - unexpected data: ${s}`);
}
var Br = class extends Re {
  _responseOrigin = null;
  constructor(s) {
    super(s, Hr, Ur);
    const { httpHeaders: t, url: e } = s;
    Q(/https?:/.test(e.protocol), "PDFFetchStream only supports http(s):// URLs."), this.headers = Ri(!0, t);
  }
}, Hr = class extends Ne {
  _abortController = new AbortController();
  _reader = null;
  constructor(s) {
    super(s);
    const { disableRange: t, disableStream: e, rangeChunkSize: i, url: n, withCredentials: r } = s._source;
    this._isStreamingSupported = !e, Ui(n, new Headers(s.headers), r, this._abortController).then((a) => {
      s._responseOrigin = He(a.url), Gi(a.status, n), this._reader = a.body.getReader();
      const o = a.headers, { contentLength: l, isRangeSupported: h } = Ni({
        responseHeaders: o,
        isHttp: !0,
        rangeChunkSize: i,
        disableRange: t
      });
      this._contentLength = l, this._isRangeSupported = h, this._filename = Bi(o), !this._isStreamingSupported && this._isRangeSupported && this.cancel(new Lt("Streaming is disabled.")), this._headersCapability.resolve();
    }).catch(this._headersCapability.reject);
  }
  async read() {
    await this._headersCapability.promise;
    const { value: s, done: t } = await this._reader.read();
    return t ? {
      value: s,
      done: t
    } : (this._loaded += s.byteLength, this._callOnProgress(), {
      value: Ge(s),
      done: !1
    });
  }
  cancel(s) {
    this._reader?.cancel(s), this._abortController.abort();
  }
}, Ur = class extends Be {
  _abortController = new AbortController();
  _readCapability = Promise.withResolvers();
  _reader = null;
  constructor(s, t, e) {
    super(s, t, e);
    const { url: i, withCredentials: n } = s._source, r = new Headers(s.headers);
    r.append("Range", `bytes=${t}-${e - 1}`), Ui(i, r, n, this._abortController).then((a) => {
      Hi(He(a.url), s._responseOrigin), Gi(a.status, i), this._reader = a.body.getReader(), this._readCapability.resolve();
    }).catch(this._readCapability.reject);
  }
  async read() {
    await this._readCapability.promise;
    const { value: s, done: t } = await this._reader.read();
    return t ? {
      value: s,
      done: t
    } : {
      value: Ge(s),
      done: !1
    };
  }
  cancel(s) {
    this._reader?.cancel(s), this._abortController.abort();
  }
};
function hi(s) {
  return s instanceof Uint8Array && s.byteLength === s.buffer.byteLength ? s.buffer : new Uint8Array(s).buffer;
}
function $e() {
  for (const s of this._requests) s.resolve({
    value: void 0,
    done: !0
  });
  this._requests.length = 0;
}
var Gr = class extends Re {
  _progressiveDone = !1;
  _queuedChunks = [];
  constructor(s) {
    super(s, $r, zr);
    const { pdfDataRangeTransport: t } = s, { initialData: e, progressiveDone: i } = t;
    if (e?.length > 0) {
      const r = hi(e);
      this._queuedChunks.push(r);
    }
    this._progressiveDone = i;
    const n = (r) => {
      switch (r.type) {
        case "range":
        case "progressiveRead":
          this.#t(r.begin, r.chunk);
          break;
        case "progressiveDone":
          this._fullReader?.progressiveDone(), this._progressiveDone = !0;
      }
    };
    t.transportReady(n);
  }
  #t(s, t) {
    const e = hi(t);
    if (s === void 0)
      this._fullReader ? this._fullReader._enqueue(e) : this._queuedChunks.push(e);
    else {
      const i = this._rangeReaders.keys().find((n) => n._begin === s);
      Q(i, "#onReceiveData - no `PDFDataTransportStreamRangeReader` instance found."), i._enqueue(e);
    }
  }
  getFullReader() {
    const s = super.getFullReader();
    return this._queuedChunks = null, s;
  }
  getRangeReader(s, t) {
    const e = super.getRangeReader(s, t);
    return e && (e.onDone = () => this._rangeReaders.delete(e), this._source.pdfDataRangeTransport.requestDataRange(s, t)), e;
  }
  cancelAllRequests(s) {
    super.cancelAllRequests(s), this._source.pdfDataRangeTransport.abort();
  }
}, $r = class extends Ne {
  #t = $e.bind(this);
  _done = !1;
  _queuedChunks = null;
  _requests = [];
  constructor(s) {
    super(s);
    const { pdfDataRangeTransport: t, disableRange: e, disableStream: i } = s._source, { length: n, contentDispositionFilename: r } = t;
    this._queuedChunks = s._queuedChunks || [];
    for (const o of this._queuedChunks) this._loaded += o.byteLength;
    this._done = s._progressiveDone, this._contentLength = n, this._isStreamingSupported = !i, this._isRangeSupported = !e, Ps(r) && (this._filename = r), this._headersCapability.resolve();
    const a = this._loaded;
    Promise.resolve().then(() => {
      a > 0 && this._loaded === a && this._callOnProgress();
    });
  }
  _enqueue(s) {
    this._done || (this._requests.length > 0 ? this._requests.shift().resolve({
      value: s,
      done: !1
    }) : this._queuedChunks.push(s), this._loaded += s.byteLength, this._callOnProgress());
  }
  async read() {
    if (this._queuedChunks.length > 0) return {
      value: this._queuedChunks.shift(),
      done: !1
    };
    if (this._done) return {
      value: void 0,
      done: !0
    };
    const s = Promise.withResolvers();
    return this._requests.push(s), s.promise;
  }
  cancel(s) {
    this._done = !0, this.#t();
  }
  progressiveDone() {
    this._done ||= !0, this._queuedChunks.length === 0 && this.#t();
  }
}, zr = class extends Be {
  #t = $e.bind(this);
  onDone = null;
  _begin = -1;
  _done = !1;
  _queuedChunk = null;
  _requests = [];
  constructor(s, t, e) {
    super(s, t, e), this._begin = t;
  }
  _enqueue(s) {
    this._done || (this._requests.length === 0 ? this._queuedChunk = s : (this._requests.shift().resolve({
      value: s,
      done: !1
    }), this.#t()), this._done = !0, this.onDone?.());
  }
  async read() {
    if (this._queuedChunk) {
      const t = this._queuedChunk;
      return this._queuedChunk = null, {
        value: t,
        done: !1
      };
    }
    if (this._done) return {
      value: void 0,
      done: !0
    };
    const s = Promise.withResolvers();
    return this._requests.push(s), s.promise;
  }
  cancel(s) {
    this._done = !0, this.#t(), this.onDone?.();
  }
}, Qe = 200, ci = 206;
function jr(s) {
  return typeof s != "string" ? s : Le(s).buffer;
}
var Vr = class extends Re {
  #t = /* @__PURE__ */ new WeakMap();
  _responseOrigin = null;
  constructor(s) {
    super(s, Wr, Xr);
    const { httpHeaders: t, url: e } = s;
    this.url = e, this.isHttp = /https?:/.test(e.protocol), this.headers = Ri(this.isHttp, t);
  }
  _request(s) {
    const t = new XMLHttpRequest(), e = {
      validateStatus: null,
      onHeadersReceived: s.onHeadersReceived,
      onDone: s.onDone,
      onError: s.onError,
      onProgress: s.onProgress
    };
    this.#t.set(t, e), t.open("GET", this.url), t.withCredentials = this._source.withCredentials;
    for (const [i, n] of this.headers) t.setRequestHeader(i, n);
    return this.isHttp && "begin" in s && "end" in s ? (t.setRequestHeader("Range", `bytes=${s.begin}-${s.end - 1}`), e.validateStatus = (i) => i === ci || i === Qe) : e.validateStatus = (i) => i === Qe, t.responseType = "arraybuffer", Q(s.onError, "Expected `onError` callback to be provided."), t.onerror = () => s.onError(t.status), t.onreadystatechange = this.#s.bind(this, t), t.onprogress = this.#e.bind(this, t), t.send(null), t;
  }
  #e(s, t) {
    this.#t.get(s)?.onProgress?.(t);
  }
  #s(s, t) {
    const e = this.#t.get(s);
    if (!e || (s.readyState >= 2 && e.onHeadersReceived && (e.onHeadersReceived(), delete e.onHeadersReceived), s.readyState !== 4) || !this.#t.has(s)) return;
    if (this.#t.delete(s), s.status === 0 && this.isHttp) {
      e.onError(s.status);
      return;
    }
    const i = s.status || Qe;
    if (!e.validateStatus(i)) {
      e.onError(s.status);
      return;
    }
    const n = jr(s.response);
    if (i === ci) {
      const r = s.getResponseHeader("Content-Range");
      /bytes \d+-\d+\/\d+/.test(r) ? e.onDone(n) : (R('Missing or invalid "Content-Range" header.'), e.onError(0));
    } else n ? e.onDone(n) : e.onError(s.status);
  }
  _abortRequest(s) {
    this.#t.has(s) && (this.#t.delete(s), s.abort());
  }
  getRangeReader(s, t) {
    const e = super.getRangeReader(s, t);
    return e && (e.onClosed = () => this._rangeReaders.delete(e)), e;
  }
}, Wr = class extends Ne {
  #t = $e.bind(this);
  _cachedChunks = [];
  _done = !1;
  _requests = [];
  _storedError = null;
  constructor(s) {
    super(s), this._fullRequestXhr = s._request({
      onHeadersReceived: this.#e.bind(this),
      onDone: this.#s.bind(this),
      onError: this.#i.bind(this),
      onProgress: this.#n.bind(this)
    });
  }
  #e() {
    const s = this._stream, { disableRange: t, rangeChunkSize: e } = s._source, i = this._fullRequestXhr;
    s._responseOrigin = He(i.responseURL);
    const n = i.getAllResponseHeaders(), r = new Headers(n ? Nr(n.trimStart()).split(/[\r\n]+/).map((l) => {
      const [h, ...c] = l.split(": ");
      return [h, c.join(": ")];
    }) : []), { contentLength: a, isRangeSupported: o } = Ni({
      responseHeaders: r,
      isHttp: s.isHttp,
      rangeChunkSize: e,
      disableRange: t
    });
    this._contentLength = a, this._isRangeSupported = o, this._filename = Bi(r), this._isRangeSupported && s._abortRequest(i), this._headersCapability.resolve();
  }
  #s(s) {
    this._requests.length > 0 ? this._requests.shift().resolve({
      value: s,
      done: !1
    }) : this._cachedChunks.push(s), this._done = !0, this._cachedChunks.length === 0 && this.#t();
  }
  #i(s) {
    this._storedError = Ue(s, this._stream.url), this._headersCapability.reject(this._storedError);
    for (const t of this._requests) t.reject(this._storedError);
    this._requests.length = 0, this._cachedChunks.length = 0;
  }
  #n(s) {
    this.onProgress?.({
      loaded: s.loaded,
      total: s.lengthComputable ? s.total : this._contentLength
    });
  }
  async read() {
    if (await this._headersCapability.promise, this._storedError) throw this._storedError;
    if (this._cachedChunks.length > 0) return {
      value: this._cachedChunks.shift(),
      done: !1
    };
    if (this._done) return {
      value: void 0,
      done: !0
    };
    const s = Promise.withResolvers();
    return this._requests.push(s), s.promise;
  }
  cancel(s) {
    this._done = !0, this._headersCapability.reject(s), this.#t(), this._stream._abortRequest(this._fullRequestXhr), this._fullRequestXhr = null;
  }
}, Xr = class extends Be {
  #t = $e.bind(this);
  onClosed = null;
  _done = !1;
  _queuedChunk = null;
  _requests = [];
  _storedError = null;
  constructor(s, t, e) {
    super(s, t, e), this._requestXhr = s._request({
      begin: t,
      end: e,
      onHeadersReceived: this.#e.bind(this),
      onDone: this.#s.bind(this),
      onError: this.#i.bind(this),
      onProgress: null
    });
  }
  #e() {
    const s = He(this._requestXhr?.responseURL);
    try {
      Hi(s, this._stream._responseOrigin);
    } catch (t) {
      this._storedError = t, this.#i(0);
    }
  }
  #s(s) {
    this._requests.length > 0 ? this._requests.shift().resolve({
      value: s,
      done: !1
    }) : this._queuedChunk = s, this._done = !0, this.#t(), this.onClosed?.();
  }
  #i(s) {
    this._storedError ??= Ue(s, this._stream.url);
    for (const t of this._requests) t.reject(this._storedError);
    this._requests.length = 0, this._queuedChunk = null;
  }
  async read() {
    if (this._storedError) throw this._storedError;
    if (this._queuedChunk !== null) {
      const t = this._queuedChunk;
      return this._queuedChunk = null, {
        value: t,
        done: !1
      };
    }
    if (this._done) return {
      value: void 0,
      done: !0
    };
    const s = Promise.withResolvers();
    return this._requests.push(s), s.promise;
  }
  cancel(s) {
    this._done = !0, this.#t(), this._stream._abortRequest(this._requestXhr), this.onClosed?.();
  }
};
function $i(s, t = null) {
  const e = process.getBuiltinModule("fs"), { Readable: i } = process.getBuiltinModule("stream"), n = e.createReadStream(s, t);
  return i.toWeb(n);
}
var Yr = class extends Re {
  constructor(s) {
    super(s, Kr, qr);
    const { url: t } = s;
    Q(t.protocol === "file:", "PDFNodeStream only supports file:// URLs.");
  }
}, Kr = class extends Ne {
  _reader = null;
  constructor(s) {
    super(s);
    const { disableRange: t, disableStream: e, rangeChunkSize: i, url: n } = s._source;
    this._isStreamingSupported = !e, process.getBuiltinModule("fs/promises").lstat(n).then((r) => {
      const a = $i(n);
      this._reader = a.getReader();
      const { size: o } = r;
      this._contentLength = o, this._isRangeSupported = !t && o > 2 * i, !this._isStreamingSupported && this._isRangeSupported && this.cancel(new Lt("Streaming is disabled.")), this._headersCapability.resolve();
    }).catch((r) => {
      r.code === "ENOENT" && (r = Ue(0, n)), this._headersCapability.reject(r);
    });
  }
  async read() {
    await this._headersCapability.promise;
    const { value: s, done: t } = await this._reader.read();
    return t ? {
      value: s,
      done: t
    } : (this._loaded += s.byteLength, this._callOnProgress(), {
      value: Ge(s),
      done: !1
    });
  }
  cancel(s) {
    this._reader?.cancel(s);
  }
}, qr = class extends Be {
  _readCapability = Promise.withResolvers();
  _reader = null;
  constructor(s, t, e) {
    super(s, t, e);
    const { url: i } = s._source;
    try {
      const n = $i(i, {
        start: t,
        end: e - 1
      });
      this._reader = n.getReader(), this._readCapability.resolve();
    } catch (n) {
      this._readCapability.reject(n);
    }
  }
  async read() {
    await this._readCapability.promise;
    const { value: s, done: t } = await this._reader.read();
    return t ? {
      value: s,
      done: t
    } : {
      value: Ge(s),
      done: !1
    };
  }
  cancel(s) {
    this._reader?.cancel(s);
  }
};
function Qr(s) {
  return re(s) ? Br : pt ? Yr : Vr;
}
var ae = class {
  static #t = null;
  static #e = "";
  static get workerPort() {
    return this.#t;
  }
  static set workerPort(s) {
    if (!(typeof Worker < "u" && s instanceof Worker) && s !== null) throw new Error("Invalid `workerPort` type.");
    this.#t = s;
  }
  static get workerSrc() {
    return this.#e;
  }
  static set workerSrc(s) {
    if (typeof s != "string") throw new Error("Invalid `workerSrc` type.");
    this.#e = s;
  }
}, Jr = class {
  #t;
  #e;
  constructor({ parsedData: s, rawData: t }) {
    this.#t = s, this.#e = t;
  }
  getRaw() {
    return this.#e;
  }
  get(s) {
    return this.#t.get(s) ?? null;
  }
  [Symbol.iterator]() {
    return this.#t.entries();
  }
}, Bt = Symbol("INTERNAL"), Zr = class {
  #t = !1;
  #e = !1;
  #s = !1;
  #i = !0;
  constructor(s, { name: t, intent: e, usage: i, rbGroups: n }) {
    this.#t = !!(s & ft.DISPLAY), this.#e = !!(s & ft.PRINT), this.name = t, this.intent = e, this.usage = i, this.rbGroups = n;
  }
  get visible() {
    if (this.#s) return this.#i;
    if (!this.#i) return !1;
    const { print: s, view: t } = this.usage;
    return this.#t ? t?.viewState !== "OFF" : this.#e ? s?.printState !== "OFF" : !0;
  }
  _setVisible(s, t, e = !1) {
    s !== Bt && U("Internal method `_setVisible` called."), this.#s = e, this.#i = t;
  }
  get serializable() {
    return {
      userSet: this.#s,
      visible: this.#i
    };
  }
}, ta = class zi {
  #t = null;
  #e = /* @__PURE__ */ new Map();
  #s = null;
  #i = null;
  #n;
  creator = null;
  name = null;
  constructor(t, e = ft.DISPLAY, i = null) {
    if (this.#n = t, this.renderingIntent = e, t !== null) {
      this.name = t.name, this.creator = t.creator, this.#i = t.order;
      for (const n of t.groups) this.#e.set(n.id, new Zr(e, n));
      if (i) {
        i.size !== this.#e.size && U("Incorrect serialized groupState.");
        for (const [n, r] of i) this.#e.get(n)._setVisible(Bt, r.visible, r.userSet);
      } else {
        if (t.baseState === "OFF") for (const n of this.#e.values()) n._setVisible(Bt, !1);
        for (const n of t.on) this.#e.get(n)._setVisible(Bt, !0);
        for (const n of t.off) this.#e.get(n)._setVisible(Bt, !1);
      }
      this.#s = this.getHash();
    }
  }
  #a(t) {
    const e = t.length;
    if (e < 2) return !0;
    const i = t[0];
    for (let n = 1; n < e; n++) {
      const r = t[n];
      let a;
      if (Array.isArray(r)) a = this.#a(r);
      else if (this.#e.has(r)) a = this.#e.get(r).visible;
      else
        return R(`Optional content group not found: ${r}`), !0;
      switch (i) {
        case "And":
          if (!a) return !1;
          break;
        case "Or":
          if (a) return !0;
          break;
        case "Not":
          return !a;
        default:
          return !0;
      }
    }
    return i === "And";
  }
  isVisible(t) {
    if (this.#e.size === 0) return !0;
    if (!t)
      return Ie("Optional content group not defined."), !0;
    if (t.type === "OCG")
      return this.#e.has(t.id) ? this.#e.get(t.id).visible : (R(`Optional content group not found: ${t.id}`), !0);
    if (t.type === "OCMD") {
      if (t.expression) return this.#a(t.expression);
      if (!t.policy || t.policy === "AnyOn") {
        for (const e of t.ids) {
          if (!this.#e.has(e))
            return R(`Optional content group not found: ${e}`), !0;
          if (this.#e.get(e).visible) return !0;
        }
        return !1;
      } else if (t.policy === "AllOn") {
        for (const e of t.ids) {
          if (!this.#e.has(e))
            return R(`Optional content group not found: ${e}`), !0;
          if (!this.#e.get(e).visible) return !1;
        }
        return !0;
      } else if (t.policy === "AnyOff") {
        for (const e of t.ids) {
          if (!this.#e.has(e))
            return R(`Optional content group not found: ${e}`), !0;
          if (!this.#e.get(e).visible) return !0;
        }
        return !1;
      } else if (t.policy === "AllOff") {
        for (const e of t.ids) {
          if (!this.#e.has(e))
            return R(`Optional content group not found: ${e}`), !0;
          if (this.#e.get(e).visible) return !1;
        }
        return !0;
      }
      return R(`Unknown optional content policy ${t.policy}.`), !0;
    }
    return R(`Unknown group type ${t.type}.`), !0;
  }
  setVisibility(t, e = !0, i = !0) {
    const n = this.#e.get(t);
    if (!n) {
      R(`Optional content group not found: ${t}`);
      return;
    }
    if (i && e && n.rbGroups.length)
      for (const r of n.rbGroups) for (const a of r) a !== t && this.#e.get(a)?._setVisible(Bt, !1, !0);
    n._setVisible(Bt, !!e, !0), this.#t = null;
  }
  setOCGState({ state: t, preserveRB: e }) {
    let i;
    for (const n of t) {
      switch (n) {
        case "ON":
        case "OFF":
        case "Toggle":
          i = n;
          continue;
      }
      const r = this.#e.get(n);
      if (r)
        switch (i) {
          case "ON":
            this.setVisibility(n, !0, e);
            break;
          case "OFF":
            this.setVisibility(n, !1, e);
            break;
          case "Toggle":
            this.setVisibility(n, !r.visible, e);
        }
    }
    this.#t = null;
  }
  get hasInitialVisibility() {
    return this.#s === null || this.getHash() === this.#s;
  }
  getOrder() {
    return this.#e.size ? this.#i ? this.#i.slice() : [...this.#e.keys()] : null;
  }
  getGroup(t) {
    return this.#e.get(t) || null;
  }
  getHash() {
    if (this.#t !== null) return this.#t;
    const t = new ds();
    for (const [e, i] of this.#e) t.update(`${e}:${i.visible}`);
    return this.#t = t.hexdigest();
  }
  [Symbol.iterator]() {
    return this.#e.entries();
  }
  get serializable() {
    const t = /* @__PURE__ */ new Map();
    for (const [e, i] of this.#e) t.set(e, i.serializable);
    return {
      data: this.#n,
      renderingIntent: this.renderingIntent,
      groupState: t
    };
  }
  static fromSerializable({ data: t, renderingIntent: e, groupState: i }) {
    return new zi(t, e, i);
  }
}, ea = class {
  #t = null;
  #e = null;
  #s = 0;
  #i = null;
  #n = null;
  get pagesNumber() {
    return this.#s;
  }
  set pagesNumber(s) {
    this.#s !== s && (this.#s = s, this.#t = null, this.#e = null);
  }
  #a() {
    if (this.#t) return;
    const s = this.#s, t = this.#t = new Uint32Array(s);
    for (let e = 0; e < s; e++) t[e] = e + 1;
    this.#e = new Int32Array(t);
  }
  #r() {
    const s = /* @__PURE__ */ new Map(), t = this.#t;
    for (let e = 0, i = this.#s; e < i; e++) {
      const n = t[e], r = s.get(n);
      r ? r.push(e + 1) : s.set(n, [e + 1]);
    }
    return s;
  }
  movePages(s, t, e) {
    this.#a();
    const i = this.#t, n = t.length, r = new Uint32Array(n);
    let a = 0;
    for (let d = 0; d < n; d++) {
      const u = t[d] - 1;
      r[d] = i[u], u < e && a++;
    }
    const o = this.#s, l = o - n, h = new Int32Array(o), c = Y(e - a, 0, l);
    for (let d = 0, u = 0; d < o; d++) s.has(d + 1) || (i[u] = i[d], h[u++] = d + 1);
    i.copyWithin(c + n, c, l), i.set(r, c), h.copyWithin(c + n, c, l), h.set(t, c), this.#e = h, i.every((d, u) => d === u + 1) && (this.#t = null);
  }
  deletePages(s) {
    this.#a();
    const t = this.#t, e = this.#r();
    this.#n = {
      pageNumberToId: t.slice(),
      pagesNumber: this.#s,
      prevPageNumbers: this.#e.slice()
    };
    const i = this.#s - s.length;
    this.#s = i;
    const n = this.#t = new Uint32Array(i);
    this.#e = new Int32Array(i);
    let r = 0, a = 0;
    for (const o of s) {
      const l = o - 1;
      l !== r && (n.set(t.subarray(r, l), a), a += l - r), r = l + 1;
    }
    r < t.length && n.set(t.subarray(r), a), this.#o(e, new Set(s));
  }
  cancelDelete() {
    this.#n && (this.#t = this.#n.pageNumberToId, this.#s = this.#n.pagesNumber, this.#e = this.#n.prevPageNumbers, this.#n = null);
  }
  cleanSavedData() {
    this.#n = null;
  }
  copyPages(s) {
    this.#a(), this.#i = {
      pageNumbers: s,
      pageIds: s.map((t) => this.#t[t - 1])
    };
  }
  cancelCopy() {
    this.#i = null;
  }
  pastePages(s) {
    this.#a();
    const t = this.#t, e = this.#r(), { pageNumbers: i, pageIds: n } = this.#i, r = this.#s + i.length;
    this.#s = r;
    const a = this.#t = new Uint32Array(r);
    this.#e = new Int32Array(r), a.set(t.subarray(0, s), 0), a.set(n, s), a.set(t.subarray(s), s + i.length), this.#o(e, null, s, i), this.#i = null;
  }
  #o(s, t = null, e = -1, i = null) {
    const n = this.#e, r = this.#t, a = e + (i?.length ?? 0), o = /* @__PURE__ */ new Map();
    for (let l = 0, h = this.#s; l < h; l++) {
      if (l >= e && l < a) {
        n[l] = -i[l - e];
        continue;
      }
      const c = r[l], d = s.get(c);
      let u = o.get(c) || 0;
      if (t && d) for (; u < d.length && t.has(d[u]); ) u++;
      n[l] = d?.[u], o.set(c, u + 1);
    }
  }
  hasBeenAltered() {
    return this.#t !== null;
  }
  #l(s = null) {
    if (!this.#t) return null;
    const t = new Int32Array(this.#s).fill(-1), e = /* @__PURE__ */ new Map();
    if (s) for (const i of s) {
      const n = this.getPageId(i), r = e.get(n) ?? 0;
      e.set(n, r + 1), t[i - 1] = r;
    }
    else for (let i = 0, n = this.#s; i < n; i++) {
      const r = this.#t[i], a = e.get(r) ?? 0;
      e.set(r, a + 1), t[i] = a;
    }
    return t;
  }
  getPageMappingForSaving(s = null, t = this.#l()) {
    s ??= this.#r();
    let e = 0;
    for (const n of s.values()) e = Math.max(e, n.length);
    const i = new Array(e);
    for (let n = 0; n < e; n++) i[n] = {
      document: null,
      pageIndices: [],
      includePages: []
    };
    for (const [n, r] of s) for (let a = 0, o = r.length; a < o; a++) i[a].includePages.push([n - 1, r[a] - 1]);
    for (const { includePages: n, pageIndices: r } of i) {
      n.sort((a, o) => a[0] - o[0]);
      for (let a = 0, o = n.length; a < o; a++)
        r.push(n[a][1]), n[a] = n[a][0];
    }
    return {
      pageInfos: i,
      copyLevels: t
    };
  }
  extractPages(s) {
    s = Array.from(s).sort((e, i) => e - i);
    const t = /* @__PURE__ */ new Map();
    for (let e = 0, i = s.length; e < i; e++) {
      const n = this.getPageId(s[e]);
      t.getOrInsertComputed(n, Zt).push(e + 1);
    }
    return this.getPageMappingForSaving(t, this.#l(s));
  }
  getPrevPageNumber(s) {
    return this.#e?.[s - 1] ?? 0;
  }
  getPageNumber(s) {
    if (!this.#t) return s;
    const t = this.#t;
    for (let e = 0, i = this.#s; e < i; e++) if (t[e] === s) return e + 1;
    return 0;
  }
  getPageId(s) {
    return this.#t?.[s - 1] ?? s;
  }
  getMapping() {
    return this.#t?.subarray(0, this.pagesNumber);
  }
}, Yt = Symbol("INITIAL_DATA"), di = () => ({
  ...Promise.withResolvers(),
  data: Yt
}), ji = class {
  #t = /* @__PURE__ */ new Map();
  get(s, t = null) {
    if (t) {
      const i = this.#t.getOrInsertComputed(s, di);
      return i.promise.then(() => t(i.data)), null;
    }
    const e = this.#t.get(s);
    if (!e || e.data === Yt) throw new Error(`Requesting object that isn't resolved yet ${s}.`);
    return e.data;
  }
  has(s) {
    const t = this.#t.get(s);
    return !!t && t.data !== Yt;
  }
  delete(s) {
    const t = this.#t.get(s);
    return !t || t.data === Yt ? !1 : (this.#t.delete(s), !0);
  }
  resolve(s, t = null) {
    const e = this.#t.getOrInsertComputed(s, di);
    if (e.data !== Yt) throw new Error(`Object already resolved ${s}.`);
    e.data = t, e.resolve();
  }
  clear() {
    for (const { data: s } of this.#t.values()) s?.bitmap?.close();
    this.#t.clear();
  }
  *[Symbol.iterator]() {
    for (const [s, { data: t }] of this.#t) t !== Yt && (yield [s, t]);
  }
}, sa = 1e5, ui = 30, bs = class wt {
  #t = Promise.withResolvers();
  #e = null;
  #s = !1;
  #i = !!globalThis.FontInspector?.enabled;
  #n = null;
  #a = null;
  #r = null;
  #o = 0;
  #l = 0;
  #h = null;
  #u = null;
  #d = 0;
  #f = 0;
  #g = /* @__PURE__ */ Object.create(null);
  #m = [];
  #c = null;
  #p = [];
  #b = /* @__PURE__ */ new WeakMap();
  #y = null;
  static #A = /* @__PURE__ */ new Map();
  static #v = /* @__PURE__ */ new Map();
  static #E = /* @__PURE__ */ new WeakMap();
  static #S = null;
  static #_ = /* @__PURE__ */ new Set();
  constructor({ textContentSource: t, images: e, container: i, viewport: n }) {
    if (t instanceof ReadableStream) this.#c = t;
    else if (typeof t == "object") this.#c = new ReadableStream({ start(h) {
      h.enqueue(t), h.close();
    } });
    else throw new Error('No "textContentSource" parameter specified.');
    this.#e = this.#u = i, this.#n = e, this.#f = n.scale * Ft.pixelRatio, this.#d = n.rotation, this.#r = {
      div: null,
      properties: null,
      ctx: null
    };
    const { pageWidth: r, pageHeight: a, pageX: o, pageY: l } = n.rawDims;
    this.#y = [
      1,
      0,
      0,
      -1,
      -o,
      l + a
    ], this.#l = r, this.#o = a, wt.#D(), i.style.setProperty("--min-font-size", wt.#S), Ut(i, n), this.#t.promise.finally(() => {
      wt.#_.delete(this), this.#r = null, this.#g = null;
    }).catch(() => {
    });
  }
  static get fontFamilyMap() {
    const { isWindows: t, isFirefox: e } = z.platform;
    return P(this, "fontFamilyMap", /* @__PURE__ */ new Map([["sans-serif", `${t && e ? "Calibri, " : ""}sans-serif`], ["monospace", `${t && e ? "Lucida Console, " : ""}monospace`]]));
  }
  render() {
    this.#n && this.#e.append(this.#n.render());
    const t = () => {
      this.#h.read().then(({ value: e, done: i }) => {
        if (i) {
          this.#t.resolve();
          return;
        }
        this.#a ??= e.lang, Object.assign(this.#g, e.styles), this.#C(e.items), t();
      }, this.#t.reject);
    };
    return this.#h = this.#c.getReader(), wt.#_.add(this), t(), this.#t.promise;
  }
  update({ viewport: t, onBefore: e = null }) {
    const i = t.scale * Ft.pixelRatio, n = t.rotation;
    if (n !== this.#d && (e?.(), this.#d = n, Ut(this.#u, { rotation: n })), i !== this.#f) {
      e?.(), this.#f = i;
      const r = {
        div: null,
        properties: null,
        ctx: wt.#T(this.#a)
      };
      for (const a of this.#p)
        r.properties = this.#b.get(a), r.div = a, this.#k(r);
    }
  }
  cancel() {
    const t = new Lt("TextLayer task cancelled.");
    this.#h?.cancel(t).catch(() => {
    }), this.#h = null, this.#t.reject(t);
  }
  get textDivs() {
    return this.#p;
  }
  get textContentItemsStr() {
    return this.#m;
  }
  #C(t) {
    if (this.#s) return;
    this.#r.ctx ??= wt.#T(this.#a);
    const e = this.#p, i = this.#m;
    for (const n of t) {
      if (e.length > sa) {
        R("Ignoring additional textDivs for performance reasons."), this.#s = !0;
        return;
      }
      if (n.str === void 0) {
        if (n.type === "beginMarkedContentProps" || n.type === "beginMarkedContent") {
          const r = this.#e;
          this.#e = document.createElement("span"), this.#e.classList.add("markedContent"), n.id && this.#e.setAttribute("id", n.id), n.tag === "Artifact" && (this.#e.ariaHidden = !0), r.append(this.#e);
        } else n.type === "endMarkedContent" && (this.#e = this.#e.parentNode);
        continue;
      }
      i.push(n.str), this.#M(n);
    }
  }
  #M(t) {
    const e = document.createElement("span"), i = {
      angle: 0,
      canvasWidth: 0,
      hasText: t.str !== "",
      hasEOL: t.hasEOL,
      fontSize: 0
    };
    this.#p.push(e);
    const n = _.transform(this.#y, t.transform);
    let r = Math.atan2(n[1], n[0]);
    const a = this.#g[t.fontName];
    a.vertical && (r += Math.PI / 2);
    let o = this.#i && a.fontSubstitution || a.fontFamily;
    o = wt.fontFamilyMap.get(o) || o;
    const l = Math.hypot(n[2], n[3]), h = l * wt.#L(o, a, this.#a);
    let c, d;
    r === 0 ? (c = n[4], d = n[5] - h) : (c = n[4] + h * Math.sin(r), d = n[5] - h * Math.cos(r));
    const u = e.style;
    u.left = `${(100 * c / this.#l).toFixed(2)}%`, u.top = `${(100 * d / this.#o).toFixed(2)}%`, u.setProperty("--font-height", `${l.toFixed(2)}px`), u.fontFamily = o, i.fontSize = l, e.setAttribute("role", "presentation"), e.textContent = t.str, e.dir = t.dir, this.#i && (e.dataset.fontName = a.fontSubstitutionLoadedName || t.fontName), r !== 0 && (i.angle = r * (180 / Math.PI));
    let p = !1;
    if (t.str.length > 1) p = !0;
    else if (t.str !== " " && t.transform[0] !== t.transform[3]) {
      const f = Math.abs(t.transform[0]), m = Math.abs(t.transform[3]);
      f !== m && Math.max(f, m) / Math.min(f, m) > 1.5 && (p = !0);
    }
    if (p && (i.canvasWidth = a.vertical ? t.height : t.width), this.#b.set(e, i), this.#r.div = e, this.#r.properties = i, this.#k(this.#r), i.hasText && this.#e.append(e), i.hasEOL) {
      const f = document.createElement("br");
      f.setAttribute("role", "presentation"), this.#e.append(f);
    }
  }
  #k(t) {
    const { div: e, properties: i, ctx: n } = t, { style: r } = e;
    if (i.canvasWidth !== 0 && i.hasText) {
      const { fontFamily: a } = r, { canvasWidth: o, fontSize: l } = i;
      wt.#I(n, l * this.#f, a);
      const { width: h } = n.measureText(e.textContent);
      h > 0 && r.setProperty("--scale-x", o * this.#f / h);
    }
    i.angle !== 0 && r.setProperty("--rotate", `${i.angle}deg`);
  }
  static cleanup() {
    if (!(this.#_.size > 0)) {
      this.#A.clear();
      for (const { canvas: t } of this.#v.values()) t.remove();
      this.#v.clear();
    }
  }
  static #T(t = null) {
    let e = this.#v.get(t ||= "");
    if (!e) {
      const i = document.createElement("canvas");
      i.style.cssText = "position:absolute;top:0;left:0;width:0;height:0;display:none;letter-spacing:normal;word-spacing:normal", i.lang = t, document.body.append(i), e = i.getContext("2d", {
        alpha: !1,
        willReadFrequently: !0
      }), this.#v.set(t, e), this.#E.set(e, {
        size: 0,
        family: ""
      });
    }
    return e;
  }
  static #I(t, e, i) {
    const n = this.#E.get(t);
    e === n.size && i === n.family || (t.font = `${e}px ${i}`, n.size = e, n.family = i);
  }
  static #D() {
    if (this.#S !== null) return;
    const t = document.createElement("div");
    t.style.opacity = 0, t.style.lineHeight = 1, t.style.fontSize = "1px", t.style.position = "absolute", t.textContent = "X", document.body.append(t), this.#S = t.getBoundingClientRect().height, t.remove();
  }
  static #L(t, e, i) {
    const n = this.#A.get(t);
    if (n) return n;
    const r = this.#T(i);
    r.canvas.width = r.canvas.height = ui, this.#I(r, ui, t);
    const a = r.measureText(""), o = a.fontBoundingBoxAscent, l = Math.abs(a.fontBoundingBoxDescent);
    r.canvas.width = r.canvas.height = 0;
    let h = 0.8;
    return o ? h = o / (o + l) : (z.platform.isFirefox && R("Enable the `dom.textMetrics.fontBoundingBox.enabled` preference in `about:config` to improve TextLayer rendering."), e.ascent ? h = e.ascent : e.descent && (h = 1 + e.descent)), this.#A.set(t, h), h;
  }
}, ia = 100;
function na(s = {}) {
  const t = new ra(), { docId: e } = t, i = s.url ? or(s.url) : null, n = s.data ? lr(s.data) : null, r = s.httpHeaders || null, a = s.withCredentials === !0, o = s.password ?? null, l = s.range instanceof Wi ? s.range : null, h = Number.isInteger(s.rangeChunkSize) && s.rangeChunkSize > 0 ? s.rangeChunkSize : 2 ** 16;
  let c = s.worker instanceof ys ? s.worker : null;
  const d = s.verbosity, u = typeof s.docBaseUrl == "string" && !Fe(s.docBaseUrl) ? s.docBaseUrl : null, p = pe(s.cMapUrl), f = s.cMapPacked !== !1, m = pe(s.iccUrl), g = pe(s.standardFontDataUrl), b = pe(s.wasmUrl), y = s.stopAtErrors !== !0, A = Number.isInteger(s.maxImageSize) && s.maxImageSize > -1 ? s.maxImageSize : -1, w = typeof s.isOffscreenCanvasSupported == "boolean" ? s.isOffscreenCanvasSupported : !pt, v = typeof s.isImageDecoderSupported == "boolean" ? s.isImageDecoderSupported : !pt, S = Number.isInteger(s.canvasMaxAreaInBytes) ? s.canvasMaxAreaInBytes : -1, E = typeof s.disableFontFace == "boolean" ? s.disableFontFace : pt, C = s.fontExtraProperties === !0, x = s.enableXfa === !0, M = s.ownerDocument || globalThis.document, k = s.disableRange === !0, I = s.disableStream === !0, B = s.disableAutoFetch === !0, G = s.pdfBug === !0, K = s.CanvasFactory || (pt ? mr : ur), L = s.FilterFactory || (pt ? gr : fr), D = s.BinaryDataFactory || (pt ? br : ti), ot = s.enableHWA === !0, it = s.enableWebGPU === !0 ? wr() : Promise.resolve(!1), _t = s.useWasm !== !1, jt = s.pagesMapper || new ea(), W = typeof s.useSystemFonts == "boolean" ? s.useSystemFonts : !pt && !E, X = typeof s.useWorkerFetch == "boolean" ? s.useWorkerFetch : !!(D === ti && p && f && g && b && re(p, document.baseURI) && re(g, document.baseURI) && re(b, document.baseURI)), Vt = null;
  wn(d);
  const ze = {
    canvasFactory: new K({
      ownerDocument: M,
      enableHWA: ot
    }),
    filterFactory: new L({
      docId: e,
      ownerDocument: M
    }),
    binaryDataFactory: X ? null : new D({
      cMapUrl: p,
      standardFontDataUrl: g,
      wasmUrl: b
    })
  };
  c || (c = ys.create({
    verbosity: d,
    port: ae.workerPort
  }), t._worker = c);
  const Ot = {
    docId: e,
    apiVersion: "6.3.289",
    data: n,
    password: o,
    disableAutoFetch: B,
    rangeChunkSize: h,
    docBaseUrl: u,
    enableXfa: x,
    evaluatorOptions: {
      maxImageSize: A,
      disableFontFace: E,
      ignoreErrors: y,
      isOffscreenCanvasSupported: w,
      isImageDecoderSupported: v,
      canvasMaxAreaInBytes: S,
      fontExtraProperties: C,
      useSystemFonts: W,
      useWasm: _t,
      useWorkerFetch: X,
      cMapUrl: p,
      cMapPacked: f,
      iccUrl: m,
      standardFontDataUrl: g,
      wasmUrl: b,
      hasGPU: !1
    }
  }, st = {
    ownerDocument: M,
    pdfBug: G,
    styleElement: Vt,
    enableHWA: ot,
    loadingParams: {
      disableAutoFetch: B,
      enableXfa: x
    }
  };
  return Promise.all([c.promise, it]).then(function([, gn]) {
    if (c.destroyed) throw new Error("Worker was destroyed");
    Ot.evaluatorOptions.hasGPU = gn;
    const mn = c.messageHandler.sendWithPromise("GetDocRequest", Ot, n ? [n.buffer] : null);
    let je;
    if (!n)
      if (l) je = new Gr({
        pdfDataRangeTransport: l,
        disableRange: k,
        disableStream: I
      });
      else if (i) je = new (Qr(i))({
        url: i,
        httpHeaders: r,
        withCredentials: a,
        rangeChunkSize: h,
        disableRange: k,
        disableStream: I
      });
      else throw new Error("getDocument - expected either `data`, `range`, or `url` parameter.");
    return mn.then((bn) => {
      if (c.destroyed) throw new Error("Worker was destroyed");
      const Ns = new se(e, bn, c.port), yn = new la(Ns, t, je, st, ze, jt);
      if (t._transport = yn, t.destroyed) throw new Error("Loading aborted");
      Ns.send("Ready", null);
    });
  }).catch(t._capability.reject).finally(t._setupCapability.resolve), t;
}
var ra = class Vi {
  static #t = 0;
  _capability = Promise.withResolvers();
  _setupCapability = Promise.withResolvers();
  _transport = null;
  _worker = null;
  docId = `d${Vi.#t++}`;
  destroyed = !1;
  onPassword = null;
  onProgress = null;
  get promise() {
    return this._capability.promise;
  }
  async destroy() {
    this.destroyed = !0, this._capability.promise.catch(() => {
    });
    try {
      this._worker?.port && (this._worker._pendingDestroy = !0), await this._setupCapability.promise, await this._transport?.destroy();
    } catch (t) {
      throw this._worker?.port && delete this._worker._pendingDestroy, t;
    }
    this._transport = null, this._worker?.destroy(), this._worker = null;
  }
  async getData() {
    return this._transport.getData();
  }
}, Wi = class {
  #t = Promise.withResolvers();
  #e = null;
  constructor(s, t, e = !1, i = null) {
    this.length = s, this.initialData = t, this.progressiveDone = e, this.contentDispositionFilename = i;
  }
  onDataRange(s, t) {
    this.#e({
      type: "range",
      begin: s,
      chunk: t
    });
  }
  onDataProgressiveRead(s) {
    this.#t.promise.then(() => {
      this.#e({
        type: "progressiveRead",
        chunk: s
      });
    });
  }
  onDataProgressiveDone() {
    this.#t.promise.then(() => {
      this.#e({ type: "progressiveDone" });
    });
  }
  transportReady(s) {
    this.#e = s, this.#t.resolve();
  }
  requestDataRange(s, t) {
    U("Abstract method PDFDataRangeTransport.requestDataRange");
  }
  abort() {
  }
}, aa = class {
  constructor(s, t) {
    this._pdfInfo = s, this._transport = t;
  }
  get pagesMapper() {
    return this._transport.pagesMapper;
  }
  get annotationStorage() {
    return this._transport.annotationStorage;
  }
  get canvasFactory() {
    return this._transport.canvasFactory;
  }
  get filterFactory() {
    return this._transport.filterFactory;
  }
  get numPages() {
    return this._pdfInfo.numPages;
  }
  get fingerprints() {
    return this._pdfInfo.fingerprints;
  }
  get isPureXfa() {
    return P(this, "isPureXfa", !!this._transport._htmlForXfa);
  }
  get allXfaHtml() {
    return this._transport._htmlForXfa;
  }
  getPage(s) {
    return this._transport.getPage(s);
  }
  getPageIndex(s) {
    return this._transport.getPageIndex(s);
  }
  getDestinations() {
    return this._transport.getDestinations();
  }
  getDestination(s) {
    return this._transport.getDestination(s);
  }
  getPageLabels() {
    return this._transport.getPageLabels();
  }
  getPageLayout() {
    return this._transport.getPageLayout();
  }
  getPageMode() {
    return this._transport.getPageMode();
  }
  getViewerPreferences() {
    return this._transport.getViewerPreferences();
  }
  getOpenAction() {
    return this._transport.getOpenAction();
  }
  getAttachments() {
    return this._transport.getAttachments();
  }
  getAttachmentContent(s) {
    return this._transport.getAttachmentContent(s);
  }
  getAnnotationsByType(s, t) {
    return this._transport.getAnnotationsByType(s, t);
  }
  getJSActions() {
    return this._transport.getDocJSActions();
  }
  getOutline() {
    return this._transport.getOutline();
  }
  getOptionalContentConfig({ intent: s = "display" } = {}) {
    const { renderingIntent: t } = this._transport.getRenderingIntent(s);
    return this._transport.getOptionalContentConfig(t);
  }
  getPermissions() {
    return this._transport.getPermissions();
  }
  getMetadata() {
    return this._transport.getMetadata();
  }
  getMarkInfo() {
    return this._transport.getMarkInfo();
  }
  getData() {
    return this._transport.getData();
  }
  saveDocument() {
    return this._transport.saveDocument();
  }
  extractPages(s, t = null) {
    return this._transport.extractPages(s, t);
  }
  getDownloadInfo() {
    return this._transport.downloadInfoCapability.promise;
  }
  cleanup(s = !1) {
    return this._transport.startCleanup(s || this.isPureXfa);
  }
  cachedPageNumber(s) {
    return this._transport.cachedPageNumber(s);
  }
  get loadingParams() {
    return this._transport.loadingParams;
  }
  get loadingTask() {
    return this._transport.loadingTask;
  }
  getFieldObjects() {
    return this._transport.getFieldObjects();
  }
  getSignatures() {
    return this._transport.getSignatures();
  }
  getSignatureData(s) {
    return this._transport.getSignatureData(s);
  }
  hasJSActions() {
    return this._transport.hasJSActions();
  }
  getCalculationOrderIds() {
    return this._transport.getCalculationOrderIds();
  }
}, oa = class Xi {
  #t = !1;
  #e = null;
  constructor(t, e, i, n, r = !1) {
    this._pageIndex = t, this._pageInfo = e, this._transport = i, this._stats = r ? new Hs() : null, this._pdfBug = r, this.commonObjs = i.commonObjs, this.objs = new ji(), this._intentStates = /* @__PURE__ */ new Map(), this.destroyed = !1, this.recordedBBoxes = null, this.#e = n, this.imageCoordinates = null;
  }
  clone(t) {
    const e = new Xi(t, this._pageInfo, this._transport, this.#e, this._pdfBug);
    return e.clonedFromIndex = this.clonedFromIndex ?? this._pageIndex, this._transport.updatePage(e), e;
  }
  get pageNumber() {
    return this._pageIndex + 1;
  }
  set pageNumber(t) {
    this._pageIndex = t - 1, this._transport.updatePage(this);
  }
  get rotate() {
    return this._pageInfo.rotate;
  }
  get ref() {
    return this._pageInfo.ref;
  }
  get userUnit() {
    return this._pageInfo.userUnit;
  }
  get view() {
    return this._pageInfo.view;
  }
  getViewport({ scale: t, rotation: e = this.rotate, offsetX: i = 0, offsetY: n = 0, dontFlip: r = !1 } = {}) {
    return new xs({
      viewBox: this.view,
      userUnit: this.userUnit,
      scale: t,
      rotation: e,
      offsetX: i,
      offsetY: n,
      dontFlip: r
    });
  }
  getAnnotations({ intent: t = "display" } = {}) {
    const { renderingIntent: e } = this._transport.getRenderingIntent(t);
    return this._transport.getAnnotations(this._pageIndex, e);
  }
  getJSActions() {
    return this._transport.getPageJSActions(this._pageIndex);
  }
  get filterFactory() {
    return this._transport.filterFactory;
  }
  get isPureXfa() {
    return P(this, "isPureXfa", !!this._transport._htmlForXfa);
  }
  async getXfa() {
    return this._transport._htmlForXfa?.children[this._pageIndex] || null;
  }
  render({ canvasContext: t, canvas: e = t.canvas, viewport: i, intent: n = "display", annotationMode: r = It.ENABLE, transform: a = null, background: o = null, optionalContentConfigPromise: l = null, annotationCanvasMap: h = null, pageColors: c = null, printAnnotationStorage: d = null, isEditing: u = !1, recordImages: p = !1, recordOperations: f = !1, operationsFilter: m = null }) {
    this._stats?.time("Overall");
    const g = this._transport.getRenderingIntent(n, r, d, u), { renderingIntent: b, cacheKey: y } = g;
    this.#t = !1, l ||= this._transport.getOptionalContentConfig(b);
    const A = this._intentStates.getOrInsertComputed(y, is);
    A.streamReaderCancelTimeout && (clearTimeout(A.streamReaderCancelTimeout), A.streamReaderCancelTimeout = null);
    const w = !!(b & ft.PRINT);
    A.displayReadyCapability || (A.displayReadyCapability = Promise.withResolvers(), A.operatorList = {
      fnArray: [],
      argsArray: [],
      lastChunk: !1,
      separateAnnots: null
    }, this._stats?.time("Page Request"), this._pumpOperatorList(g));
    const v = !!(this._pdfBug && globalThis.StepperManager?.enabled), S = !!e && !this.recordedBBoxes && (f || v), E = !!e && !this.imageCoordinates && p, C = (B) => {
      if (A.renderTasks.delete(k), S) {
        const G = k.gfx?.dependencyTracker.take();
        G && (k.stepper?.setOperatorBBoxes(G, k.gfx.dependencyTracker.takeDebugMetadata()), f && (this.recordedBBoxes = G));
      }
      E && !B && (this.imageCoordinates = k.gfx?.imagesTracker.take()), w && (this.#t = !0), this.#s(), B ? (k.capability.reject(B), this._abortOperatorList({
        intentState: A,
        reason: B instanceof Error ? B : new Error(B)
      })) : k.capability.resolve(), this._stats && (this._stats.timeEnd("Rendering"), this._stats.timeEnd("Overall"), globalThis.Stats?.enabled && globalThis.Stats.add(this.pageNumber, this._stats));
    };
    let x = null, M = null;
    (S || E) && (M = new Yn(e, A.operatorList.length)), S && (x = new Kn(M, v));
    const k = new ca({
      callback: C,
      params: {
        canvas: e,
        canvasContext: t,
        dependencyTracker: x ?? M,
        imagesTracker: E ? new qn(e) : null,
        viewport: i,
        transform: a,
        background: o
      },
      objs: this.objs,
      commonObjs: this.commonObjs,
      annotationCanvasMap: h,
      operatorList: A.operatorList,
      pageIndex: this._pageIndex,
      canvasFactory: this._transport.canvasFactory,
      filterFactory: this._transport.filterFactory,
      useRequestAnimationFrame: !w,
      pdfBug: this._pdfBug,
      pageColors: c,
      enableHWA: this._transport.enableHWA,
      operationsFilter: m
    });
    (A.renderTasks ||= /* @__PURE__ */ new Set()).add(k);
    const I = k.task;
    return Promise.all([A.displayReadyCapability.promise, l]).then(([B, G]) => {
      if (this.destroyed) {
        C();
        return;
      }
      if (this._stats?.time("Rendering"), !(G.renderingIntent & b)) throw new Error("Must use the same `intent`-argument when calling the `PDFPageProxy.render` and `PDFDocumentProxy.getOptionalContentConfig` methods.");
      k.initializeGraphics({
        transparency: B,
        optionalContentConfig: G
      }), k.operatorListChanged();
    }).catch(C), I;
  }
  getOperatorList({ intent: t = "display", annotationMode: e = It.ENABLE, printAnnotationStorage: i = null, isEditing: n = !1 } = {}) {
    function r() {
      o.operatorList.lastChunk && (o.opListReadCapability.resolve(o.operatorList), o.renderTasks.delete(l));
    }
    const a = this._transport.getRenderingIntent(t, e, i, n, !0), o = this._intentStates.getOrInsertComputed(a.cacheKey, is);
    let l;
    return o.opListReadCapability || (l = /* @__PURE__ */ Object.create(null), l.operatorListChanged = r, o.opListReadCapability = Promise.withResolvers(), (o.renderTasks ||= /* @__PURE__ */ new Set()).add(l), o.operatorList = {
      fnArray: [],
      argsArray: [],
      lastChunk: !1,
      separateAnnots: null
    }, this._stats?.time("Page Request"), this._pumpOperatorList(a)), o.opListReadCapability.promise;
  }
  streamTextContent({ includeMarkedContent: t = !1, disableNormalization: e = !1 } = {}) {
    return this._transport.messageHandler.sendWithStream("GetTextContent", {
      pageId: this.#e.getPageId(this._pageIndex + 1) - 1,
      pageIndex: this._pageIndex,
      includeMarkedContent: t === !0,
      disableNormalization: e === !0
    }, {
      highWaterMark: 100,
      size(i) {
        return i.items.length;
      }
    });
  }
  async getTextContent(t = {}) {
    if (this._transport._htmlForXfa) return this.getXfa().then((n) => ns.textContent(n));
    const e = this.streamTextContent(t), i = {
      items: [],
      styles: /* @__PURE__ */ Object.create(null),
      lang: null
    };
    for await (const n of e)
      i.lang ??= n.lang, Object.assign(i.styles, n.styles), i.items.push(...n.items);
    return i;
  }
  getStructTree() {
    return this._transport.getStructTree(this._pageIndex);
  }
  _destroy() {
    this.destroyed = !0;
    const t = [];
    for (const e of this._intentStates.values())
      if (this._abortOperatorList({
        intentState: e,
        reason: /* @__PURE__ */ new Error("Page was destroyed."),
        force: !0
      }), !e.opListReadCapability)
        for (const i of e.renderTasks)
          t.push(i.completed), i.cancel();
    return this.objs.clear(), this.#t = !1, Promise.all(t);
  }
  cleanup(t = !1) {
    this.#t = !0;
    const e = this.#s();
    return t && e && (this._stats &&= new Hs()), e;
  }
  #s() {
    if (!this.#t || this.destroyed) return !1;
    for (const { renderTasks: t, operatorList: e } of this._intentStates.values()) if (t.size > 0 || !e.lastChunk) return !1;
    return this._intentStates.clear(), this.objs.clear(), this.#t = !1, !0;
  }
  _startRenderPage(t, e) {
    const i = this._intentStates.get(e);
    i && (this._stats?.timeEnd("Page Request"), i.displayReadyCapability?.resolve(t));
  }
  _renderPageChunk(t, e) {
    for (let i = 0, n = t.length; i < n; i++)
      e.operatorList.fnArray.push(t.fnArray[i]), e.operatorList.argsArray.push(t.argsArray[i]);
    e.operatorList.lastChunk = t.lastChunk, e.operatorList.separateAnnots = t.separateAnnots;
    for (const i of e.renderTasks) i.operatorListChanged();
    t.lastChunk && this.#s();
  }
  _pumpOperatorList({ renderingIntent: t, cacheKey: e, annotationStorageSerializable: i, modifiedIds: n }) {
    const { map: r, transfer: a } = i, o = this._transport.messageHandler.sendWithStream("GetOperatorList", {
      pageId: this.#e.getPageId(this._pageIndex + 1) - 1,
      pageIndex: this._pageIndex,
      intent: t,
      cacheKey: e,
      annotationStorage: r,
      modifiedIds: n
    }, void 0, a).getReader(), l = this._intentStates.get(e);
    l.streamReader = o;
    const h = () => {
      o.read().then(({ value: c, done: d }) => {
        if (d) {
          l.streamReader = null;
          return;
        }
        this._transport.destroyed || (this._renderPageChunk(c, l), h());
      }, (c) => {
        if (l.streamReader = null, !this._transport.destroyed) {
          if (l.operatorList) {
            l.operatorList.lastChunk = !0;
            for (const d of l.renderTasks) d.operatorListChanged();
            this.#s();
          }
          if (l.displayReadyCapability) l.displayReadyCapability.reject(c);
          else if (l.opListReadCapability) l.opListReadCapability.reject(c);
          else throw c;
        }
      });
    };
    h();
  }
  _abortOperatorList({ intentState: t, reason: e, force: i = !1 }) {
    if (t.streamReader) {
      if (t.streamReaderCancelTimeout && (clearTimeout(t.streamReaderCancelTimeout), t.streamReaderCancelTimeout = null), !i) {
        if (t.renderTasks.size > 0) return;
        if (e instanceof ks) {
          let n = ia;
          e.extraDelay > 0 && e.extraDelay < 1e3 && (n += e.extraDelay), t.streamReaderCancelTimeout = setTimeout(() => {
            t.streamReaderCancelTimeout = null, this._abortOperatorList({
              intentState: t,
              reason: e,
              force: !0
            });
          }, n);
          return;
        }
      }
      if (t.streamReader.cancel(new Lt(e.message)).catch(() => {
      }), t.streamReader = null, !this._transport.destroyed) {
        for (const [n, r] of this._intentStates) if (r === t) {
          this._intentStates.delete(n);
          break;
        }
        this.cleanup();
      }
    }
  }
  get stats() {
    return this._stats;
  }
}, ys = class ct {
  #t = Promise.withResolvers();
  #e = null;
  #s = null;
  #i = null;
  static #n = 0;
  static #a = !1;
  static #r = /* @__PURE__ */ new WeakMap();
  static {
    pt && (this.#a = !0, ae.workerSrc ||= "./pdf.worker.mjs"), this._isSameOrigin = (t, e) => {
      const i = URL.parse(t);
      if (!i?.origin || i.origin === "null") return !1;
      const n = new URL(e, i);
      return i.origin === n.origin;
    }, this._createCDNWrapper = (t) => {
      const e = `await import("${t}");`;
      return URL.createObjectURL(new Blob([e], { type: "text/javascript" }));
    };
  }
  constructor({ name: t = null, port: e = null, verbosity: i = Sn() } = {}) {
    if (this.name = t, this.destroyed = !1, this.verbosity = i, e) {
      if (ct.#r.has(e)) throw new Error("Cannot use more than one PDFWorker per port.");
      ct.#r.set(e, this), this.#l(e);
    } else this.#h();
  }
  get promise() {
    return this.#t.promise;
  }
  #o() {
    this.#t.resolve(), this.#e.send("configure", { verbosity: this.verbosity });
  }
  get port() {
    return this.#s;
  }
  get messageHandler() {
    return this.#e;
  }
  #l(t) {
    this.#s = t, this.#e = new se("main", "worker", t), this.#e.on("ready", () => {
    }), this.#o();
  }
  #h() {
    if (ct.#a || ct.#d) {
      this.#u();
      return;
    }
    let { workerSrc: t } = ct;
    try {
      ct._isSameOrigin(window.location, t) || (t = ct._createCDNWrapper(new URL(t, window.location).href));
      const e = new Worker(t, { type: "module" }), i = new se("main", "worker", e), n = () => {
        r.abort(), i.destroy(), e.terminate(), this.destroyed ? this.#t.reject(/* @__PURE__ */ new Error("Worker was destroyed")) : this.#u();
      }, r = new AbortController();
      e.addEventListener("error", () => {
        this.#i || n();
      }, { signal: r.signal }), i.on("test", (o) => {
        if (r.abort(), this.destroyed || !o) {
          n();
          return;
        }
        this.#e = i, this.#s = e, this.#i = e, this.#o();
      }), i.on("ready", (o) => {
        if (r.abort(), this.destroyed) {
          n();
          return;
        }
        try {
          a();
        } catch {
          this.#u();
        }
      });
      const a = () => {
        const o = /* @__PURE__ */ new Uint8Array();
        i.send("test", o, [o.buffer]);
      };
      a();
      return;
    } catch {
      Ie("The worker has been disabled.");
    }
    this.#u();
  }
  #u() {
    ct.#a || (R("Setting up fake worker."), ct.#a = !0), ct._setupFakeWorkerGlobal.then((t) => {
      if (this.destroyed) {
        this.#t.reject(/* @__PURE__ */ new Error("Worker was destroyed"));
        return;
      }
      const e = new dr();
      this.#s = e;
      const i = `fake${ct.#n++}`, n = new se(i + "_worker", i, e);
      t.setup(n, e), this.#e = new se(i, i + "_worker", e), this.#o();
    }).catch((t) => {
      this.#t.reject(/* @__PURE__ */ new Error(`Setting up fake worker failed: "${t.message}".`));
    });
  }
  destroy() {
    this.destroyed = !0, this.#i?.terminate(), this.#i = null, ct.#r.delete(this.#s), this.#s = null, this.#e?.destroy(), this.#e = null;
  }
  static create(t) {
    const e = this.#r.get(t?.port);
    if (e) {
      if (e._pendingDestroy) throw new Error("PDFWorker.create - the worker is being destroyed.\nPlease remember to await `PDFDocumentLoadingTask.destroy()`-calls.");
      return e;
    }
    return new ct(t);
  }
  static get workerSrc() {
    if (ae.workerSrc) return ae.workerSrc;
    throw new Error('No "GlobalWorkerOptions.workerSrc" specified.');
  }
  static get #d() {
    try {
      return globalThis.pdfjsWorker?.WorkerMessageHandler || null;
    } catch {
      return null;
    }
  }
  static get _setupFakeWorkerGlobal() {
    return P(this, "_setupFakeWorkerGlobal", (async () => this.#d ? this.#d : (await import(
      /*webpackIgnore: true*/
      /*@vite-ignore*/
      this.workerSrc
    )).WorkerMessageHandler)());
  }
}, la = class {
  downloadInfoCapability = Promise.withResolvers();
  #t = null;
  #e = /* @__PURE__ */ new Map();
  #s = null;
  #i = /* @__PURE__ */ new Map();
  #n = /* @__PURE__ */ new Map();
  #a = /* @__PURE__ */ new Map();
  #r = null;
  constructor(s, t, e, i, n, r) {
    this.messageHandler = s, this.loadingTask = t, this.#s = e, this.commonObjs = new ji(), this.fontLoader = new Jn({
      ownerDocument: i.ownerDocument,
      styleElement: i.styleElement
    }), this.enableHWA = i.enableHWA, this.loadingParams = i.loadingParams, this._params = i, this.canvasFactory = n.canvasFactory, this.filterFactory = n.filterFactory, this.binaryDataFactory = n.binaryDataFactory, this.pagesMapper = r, this.destroyed = !1, this.destroyCapability = null, this.setupMessageHandler();
  }
  updatePage(s) {
    const { _pageIndex: t } = s;
    this.#i.set(t, s), this.#n.set(t, Promise.resolve(s));
  }
  #o(s, t = null) {
    return this.#e.getOrInsertComputed(s, () => this.messageHandler.sendWithPromise(s, t));
  }
  #l({ loaded: s, total: t }) {
    this.loadingTask.onProgress?.({
      loaded: s,
      total: t,
      percent: t ? Y(Math.round(s / t * 100), 0, 100) : NaN
    });
  }
  get annotationStorage() {
    return P(this, "annotationStorage", new Ms());
  }
  getRenderingIntent(s, t = It.ENABLE, e = null, i = !1, n = !1) {
    let r = ft.DISPLAY, a = le;
    switch (s) {
      case "any":
        r = ft.ANY;
        break;
      case "display":
        break;
      case "print":
        r = ft.PRINT;
        break;
      default:
        R(`getRenderingIntent - invalid intent: ${s}`);
    }
    const o = r & ft.PRINT && e instanceof Pi ? e : this.annotationStorage;
    switch (t) {
      case It.DISABLE:
        r += ft.ANNOTATIONS_DISABLE;
        break;
      case It.ENABLE:
        break;
      case It.ENABLE_FORMS:
        r += ft.ANNOTATIONS_FORMS;
        break;
      case It.ENABLE_STORAGE:
        r += ft.ANNOTATIONS_STORAGE, a = o.serializable;
        break;
      default:
        R(`getRenderingIntent - invalid annotationMode: ${t}`);
    }
    i && (r += ft.IS_EDITING), n && (r += ft.OPLIST);
    const { ids: l, hash: h } = o.modifiedIds, c = [
      r,
      a.hash,
      h
    ];
    return {
      renderingIntent: r,
      cacheKey: c.join("_"),
      annotationStorageSerializable: a,
      modifiedIds: l
    };
  }
  destroy() {
    if (this.destroyCapability) return this.destroyCapability.promise;
    this.destroyed = !0, this.destroyCapability = Promise.withResolvers(), this.#r?.reject(/* @__PURE__ */ new Error("Worker was destroyed during onPassword callback"));
    const s = [];
    for (const e of this.#i.values()) s.push(e._destroy());
    this.#i.clear(), this.#n.clear(), this.#a.clear(), Object.hasOwn(this, "annotationStorage") && this.annotationStorage.resetModified();
    const t = this.messageHandler.sendWithPromise("Terminate", null);
    return s.push(t), Promise.all(s).then(() => {
      this.commonObjs.clear(), this.fontLoader.clear(), this.#e.clear(), this.filterFactory.destroy(), bs.cleanup(), this.#s?.cancelAllRequests(new Lt("Worker was terminated.")), this.messageHandler?.destroy(), this.messageHandler = null, this.destroyCapability.resolve();
    }, this.destroyCapability.reject), this.destroyCapability.promise;
  }
  setupMessageHandler() {
    const { messageHandler: s, loadingTask: t } = this;
    s.on("GetReader", (e, i) => {
      Q(this.#s, "GetReader - no `BasePDFStream` instance available."), this.#t = this.#s.getFullReader(), this.#t.onProgress = (n) => this.#l(n), i.onPull = () => {
        this.#t.read().then(function({ value: n, done: r }) {
          if (r) {
            i.close();
            return;
          }
          Q(n instanceof ArrayBuffer, "GetReader - expected an ArrayBuffer."), i.enqueue(new Uint8Array(n), 1, [n]);
        }).catch((n) => {
          i.error(n);
        });
      }, i.onCancel = (n) => {
        this.#t.cancel(n), i.ready.catch((r) => {
          if (!this.destroyed)
            throw r;
        });
      };
    }), s.on("ReaderHeadersReady", async (e) => {
      await this.#t.headersReady;
      const { isStreamingSupported: i, isRangeSupported: n, contentLength: r } = this.#t;
      return i && n && (this.#t.onProgress = null), {
        isStreamingSupported: i,
        isRangeSupported: n,
        contentLength: r
      };
    }), s.on("GetRangeReader", (e, i) => {
      Q(this.#s, "GetRangeReader - no `BasePDFStream` instance available.");
      const n = this.#s.getRangeReader(e.begin, e.end);
      if (!n) {
        i.close();
        return;
      }
      i.onPull = () => {
        n.read().then(function({ value: r, done: a }) {
          if (a) {
            i.close();
            return;
          }
          Q(r instanceof ArrayBuffer, "GetRangeReader - expected an ArrayBuffer."), i.enqueue(new Uint8Array(r), 1, [r]);
        }).catch((r) => {
          i.error(r);
        });
      }, i.onCancel = (r) => {
        n.cancel(r), i.ready.catch((a) => {
          if (!this.destroyed)
            throw a;
        });
      };
    }), s.on("GetDoc", ({ pdfInfo: e }) => {
      this.pagesMapper.pagesNumber = e.numPages, this._numPages = e.numPages, this._htmlForXfa = e.htmlForXfa, delete e.htmlForXfa, t._capability.resolve(new aa(e, this));
    }), s.on("DocException", (e) => {
      t._capability.reject(dt(e));
    }), s.on("PasswordRequest", (e) => {
      this.#r = Promise.withResolvers();
      try {
        if (!t.onPassword) throw dt(e);
        const i = (n) => {
          n instanceof Error ? this.#r.reject(n) : this.#r.resolve({ password: n });
        };
        t.onPassword(i, e.code);
      } catch (i) {
        this.#r.reject(i);
      }
      return this.#r.promise;
    }), s.on("DataLoaded", (e) => {
      this.#l({
        loaded: e.length,
        total: e.length
      }), this.downloadInfoCapability.resolve(e);
    }), s.on("StartRenderPage", (e) => {
      this.destroyed || this.#i.get(e.pageIndex)._startRenderPage(e.transparency, e.cacheKey);
    }), s.on("commonobj", ([e, i, n]) => {
      if (this.destroyed || this.commonObjs.has(e)) return null;
      switch (i) {
        case "Font":
          if ("error" in n) {
            const c = n.error;
            R(`Error during font loading: ${c}`), this.commonObjs.resolve(e, c);
            break;
          }
          const r = new nr(n), a = this._params.pdfBug && globalThis.FontInspector?.enabled ? (c, d) => globalThis.FontInspector.fontAdded(c, d) : null, o = new Zn(r, a, n.charProcOperatorList, n.extra);
          this.fontLoader.bind(o).catch(() => s.sendWithPromise("FontFallback", { id: e })).finally(() => {
            o.fontExtraProperties || o.clearData(), this.commonObjs.resolve(e, o);
          });
          break;
        case "CopyLocalImage":
          const { imageRef: l } = n;
          Q(l, "The imageRef must be defined.");
          for (const c of this.#i.values()) for (const [, d] of c.objs) {
            if (d?.ref !== l) continue;
            if (!d.dataLen) return null;
            const u = structuredClone(d);
            return this.commonObjs.resolve(e, u), d.dataLen;
          }
          break;
        case "FontPath":
          this.commonObjs.resolve(e, new ar(n));
          break;
        case "Image":
          this.commonObjs.resolve(e, n);
          break;
        case "Pattern":
          const h = new rr(n);
          this.commonObjs.resolve(e, h.getIR());
          break;
        default:
          throw new Error(`Got unknown common object type ${i}`);
      }
      return null;
    }), s.on("obj", ([e, i, n, r]) => {
      if (this.destroyed) return;
      const a = this.#i.get(i);
      if (!a.objs.has(e)) {
        if (a._intentStates.size === 0) {
          r?.bitmap?.close();
          return;
        }
        switch (n) {
          case "Image":
          case "Pattern":
            a.objs.resolve(e, r);
            break;
          default:
            throw new Error(`Got unknown object type ${n}`);
        }
      }
    }), s.on("DocProgress", (e) => {
      this.destroyed || this.#l(e);
    }), s.on("FetchBinaryData", async (e) => {
      if (this.destroyed) throw new Error("Worker was destroyed.");
      if (!this.binaryDataFactory) throw new Error("`BinaryDataFactory` not initialized, see the `useWorkerFetch` parameter.");
      return this.binaryDataFactory.fetch(e);
    });
  }
  getData() {
    return this.messageHandler.sendWithPromise("GetData", null);
  }
  saveDocument() {
    this.annotationStorage.size <= 0 && R("saveDocument called while `annotationStorage` is empty, please use the getData-method instead.");
    const { map: s, transfer: t } = this.annotationStorage.serializable;
    return this.messageHandler.sendWithPromise("SaveDocument", {
      isPureXfa: !!this._htmlForXfa,
      numPages: this._numPages,
      annotationStorage: s,
      filename: this.#t?.filename ?? null
    }, t).finally(() => {
      this.annotationStorage.resetModified();
    });
  }
  extractPages(s, t = null) {
    const e = { pageInfos: s };
    let i;
    const n = globalThis.ImageBitmap;
    if (typeof n == "function") {
      const r = Array.isArray(s) ? s : [s];
      for (const a of r) a?.image instanceof n && (i ||= []).push(a.image);
    }
    if (this.annotationStorage.size > 0) {
      const r = this.annotationStorage.serializable;
      let { map: a } = r;
      r.transfer?.length && (i ? i.push(...r.transfer) : i = r.transfer);
      const o = this.pagesMapper.getMapping();
      if (o) {
        const l = /* @__PURE__ */ new Map();
        for (const [h, c] of a) {
          if (c?.pageIndex !== void 0 && c.pageIndex >= 0 && c.pageIndex < o.length) {
            const d = t?.[c.pageIndex] ?? 0, u = o[c.pageIndex] - 1;
            if (u !== c.pageIndex || d !== 0) {
              l.set(h, {
                ...c,
                pageIndex: u,
                copyLevel: d
              });
              continue;
            }
          }
          l.set(h, c);
        }
        a = l;
      }
      e.annotationStorage = a;
    }
    return this.messageHandler.sendWithPromise("ExtractPages", e, i).finally(() => {
      this.annotationStorage.resetModified();
    });
  }
  getPage(s) {
    if (!Number.isInteger(s) || s <= 0 || s > this.pagesMapper.pagesNumber) return Promise.reject(/* @__PURE__ */ new Error("Invalid page request."));
    const t = s - 1, e = this.pagesMapper.getPageId(s) - 1, i = this.#n.get(t);
    if (i) return i;
    const n = this.messageHandler.sendWithPromise("GetPage", { pageIndex: e }).then((r) => {
      if (this.destroyed) throw new Error("Transport destroyed");
      r.refStr && this.#a.set(r.refStr, e);
      const a = new oa(t, r, this, this.pagesMapper, this._params.pdfBug);
      return this.#i.set(t, a), a;
    });
    return this.#n.set(t, n), n;
  }
  async getPageIndex(s) {
    if (!gs(s)) throw new Error("Invalid pageIndex request.");
    const t = await this.messageHandler.sendWithPromise("GetPageIndex", {
      num: s.num,
      gen: s.gen
    }), e = this.pagesMapper.getPageNumber(t + 1);
    if (e === 0) throw new Error("GetPageIndex: page has been removed.");
    return e - 1;
  }
  getAnnotations(s, t) {
    return this.messageHandler.sendWithPromise("GetAnnotations", {
      pageIndex: this.pagesMapper.getPageId(s + 1) - 1,
      intent: t
    });
  }
  getFieldObjects() {
    return this.#o("GetFieldObjects");
  }
  getSignatures() {
    return this.#o("GetSignatures");
  }
  getSignatureData(s) {
    return this.messageHandler.sendWithPromise("GetSignatureData", s);
  }
  hasJSActions() {
    return this.#o("HasJSActions");
  }
  getCalculationOrderIds() {
    return this.messageHandler.sendWithPromise("GetCalculationOrderIds", null);
  }
  getDestinations() {
    return this.messageHandler.sendWithPromise("GetDestinations", null);
  }
  getDestination(s) {
    return typeof s != "string" ? Promise.reject(/* @__PURE__ */ new Error("Invalid destination request.")) : this.messageHandler.sendWithPromise("GetDestination", { id: s });
  }
  getPageLabels() {
    return this.messageHandler.sendWithPromise("GetPageLabels", null);
  }
  getPageLayout() {
    return this.messageHandler.sendWithPromise("GetPageLayout", null);
  }
  getPageMode() {
    return this.messageHandler.sendWithPromise("GetPageMode", null);
  }
  getViewerPreferences() {
    return this.messageHandler.sendWithPromise("GetViewerPreferences", null);
  }
  getOpenAction() {
    return this.messageHandler.sendWithPromise("GetOpenAction", null);
  }
  getAttachments() {
    return this.messageHandler.sendWithPromise("GetAttachments", null);
  }
  getAttachmentContent(s) {
    return this.messageHandler.sendWithPromise("GetAttachmentContent", s);
  }
  getAnnotationsByType(s, t) {
    return this.messageHandler.sendWithPromise("GetAnnotationsByType", {
      types: s,
      pageIndexesToSkip: t
    });
  }
  getDocJSActions() {
    return this.#o("GetDocJSActions");
  }
  getPageJSActions(s) {
    return this.messageHandler.sendWithPromise("GetPageJSActions", { pageIndex: this.pagesMapper.getPageId(s + 1) - 1 });
  }
  getStructTree(s) {
    return this.messageHandler.sendWithPromise("GetStructTree", { pageIndex: this.pagesMapper.getPageId(s + 1) - 1 });
  }
  getOutline() {
    return this.messageHandler.sendWithPromise("GetOutline", null);
  }
  getOptionalContentConfig(s) {
    return this.#o("GetOptionalContentConfig").then((t) => new ta(t, s));
  }
  getPermissions() {
    return this.messageHandler.sendWithPromise("GetPermissions", null);
  }
  getMetadata() {
    const s = "GetMetadata";
    return this.#e.getOrInsertComputed(s, () => this.messageHandler.sendWithPromise(s, null).then((t) => ({
      info: t[0],
      metadata: t[1] ? new Jr(t[1]) : null,
      contentDispositionFilename: this.#t?.filename ?? null,
      contentLength: this.#t?.contentLength ?? null,
      hasStructTree: t[2]
    })));
  }
  getMarkInfo() {
    return this.messageHandler.sendWithPromise("GetMarkInfo", null);
  }
  async startCleanup(s = !1) {
    if (!this.destroyed) {
      await this.messageHandler.sendWithPromise("Cleanup", null);
      for (const t of this.#i.values()) if (!t.cleanup()) throw new Error(`startCleanup: Page ${t.pageNumber} is currently rendering.`);
      this.commonObjs.clear(), s || this.fontLoader.clear(), this.#e.clear(), this.filterFactory.destroy(!0), bs.cleanup();
    }
  }
  cachedPageNumber(s) {
    if (!gs(s)) return null;
    const t = s.gen === 0 ? `${s.num}R` : `${s.num}R${s.gen}`, e = this.#a.get(t);
    if (e >= 0) {
      const i = this.pagesMapper.getPageNumber(e + 1);
      if (i !== 0) return i;
    }
    return null;
  }
}, ha = class {
  _internalRenderTask = null;
  onContinue = null;
  onError = null;
  constructor(s) {
    this._internalRenderTask = s;
  }
  get promise() {
    return this._internalRenderTask.capability.promise;
  }
  cancel(s = 0) {
    this._internalRenderTask.cancel(null, s);
  }
  get separateAnnots() {
    const { separateAnnots: s } = this._internalRenderTask.operatorList;
    if (!s) return !1;
    const { annotationCanvasMap: t } = this._internalRenderTask;
    return s.form || s.canvas && t?.size > 0;
  }
  get imageCoordinates() {
    return this._internalRenderTask.imageCoordinates || null;
  }
}, ca = class ie {
  #t = null;
  static #e = /* @__PURE__ */ new WeakSet();
  constructor({ callback: t, params: e, objs: i, commonObjs: n, annotationCanvasMap: r, operatorList: a, pageIndex: o, canvasFactory: l, filterFactory: h, useRequestAnimationFrame: c = !1, pdfBug: d = !1, pageColors: u = null, enableHWA: p = !1, operationsFilter: f = null }) {
    this.callback = t, this.params = e, this.objs = i, this.commonObjs = n, this.annotationCanvasMap = r, this.operatorListIdx = null, this.operatorList = a, this._pageIndex = o, this.canvasFactory = l, this.filterFactory = h, this._pdfBug = d, this.pageColors = u, this.running = !1, this.graphicsReadyCallback = null, this.graphicsReady = !1, this._useRequestAnimationFrame = c === !0 && typeof window < "u", this.cancelled = !1, this.capability = Promise.withResolvers(), this.task = new ha(this), this._cancelBound = this.cancel.bind(this), this._continueBound = this._continue.bind(this), this._scheduleNextBound = this._scheduleNext.bind(this), this._nextBound = this._next.bind(this), this._canvas = e.canvas, this._canvasContext = e.canvas ? null : e.canvasContext, this._enableHWA = p, this._dependencyTracker = e.dependencyTracker, this._imagesTracker = e.imagesTracker, this._operationsFilter = f;
  }
  get completed() {
    return this.capability.promise.catch(function() {
    });
  }
  initializeGraphics({ transparency: t = !1, optionalContentConfig: e }) {
    if (this.cancelled) return;
    if (this._canvas) {
      if (ie.#e.has(this._canvas)) throw new Error("Cannot use the same canvas during multiple render() operations. Use different canvas or ensure previous operations were cancelled or completed.");
      ie.#e.add(this._canvas);
    }
    this._pdfBug && globalThis.StepperManager?.enabled && (this.stepper = globalThis.StepperManager.create(this._pageIndex), this.stepper.init(this.operatorList), this.stepper.nextBreakPoint = this.stepper.getNextBreakPoint());
    const { viewport: i, transform: n, background: r, dependencyTracker: a, imagesTracker: o } = this.params, l = this._canvasContext || this._canvas.getContext("2d", {
      alpha: !1,
      willReadFrequently: !this._enableHWA
    });
    this.gfx = new xe(l, this.commonObjs, this.objs, this.canvasFactory, this.filterFactory, { optionalContentConfig: e }, this.annotationCanvasMap, this.pageColors, a, o), this.gfx.beginDrawing({
      transform: n,
      viewport: i,
      transparency: t,
      background: r
    }), this.operatorListIdx = 0, this.graphicsReady = !0, this.graphicsReadyCallback?.();
  }
  cancel(t = null, e = 0) {
    this.running = !1, this.cancelled = !0, this.gfx?.endDrawing(), this.#t && (window.cancelAnimationFrame(this.#t), this.#t = null), ie.#e.delete(this._canvas), t ||= new ks(`Rendering cancelled, page ${this._pageIndex + 1}`, e), this.callback(t), this.task.onError?.(t);
  }
  operatorListChanged() {
    if (!this.graphicsReady) {
      this.graphicsReadyCallback ||= this._continueBound;
      return;
    }
    this.gfx.dependencyTracker?.growOperationsCount(this.operatorList.fnArray.length), this.stepper?.updateOperatorList(this.operatorList), !this.running && this._continue();
  }
  _continue() {
    this.running = !0, !this.cancelled && (this.task.onContinue ? this.task.onContinue(this._scheduleNextBound) : this._scheduleNext());
  }
  _scheduleNext() {
    this._useRequestAnimationFrame ? this.#t = window.requestAnimationFrame(() => {
      this.#t = null, this._nextBound().catch(this._cancelBound);
    }) : Promise.resolve().then(this._nextBound).catch(this._cancelBound);
  }
  async _next() {
    this.cancelled || (this.operatorListIdx = this.gfx.executeOperatorList(this.operatorList, this.operatorListIdx, this._continueBound, this.stepper, this._operationsFilter), this.operatorListIdx === this.operatorList.argsArray.length && (this.running = !1, this.operatorList.lastChunk && (this.gfx.endDrawing(), ie.#e.delete(this._canvas), this.callback())));
  }
}, da = "6.3.289", ua = "1c8020a7d", Yi = class St {
  #t = null;
  #e = null;
  #s;
  #i = null;
  #n = !1;
  #a = !1;
  #r = null;
  #o;
  #l = null;
  #h = null;
  static #u = null;
  static get _keyboardManager() {
    return P(this, "_keyboardManager", new de([
      [["Escape"], St.prototype._hideDropdownFromKeyboard],
      [["Space"], St.prototype._colorSelectFromKeyboard],
      [["ArrowDown", "ArrowRight"], St.prototype._moveToNext],
      [["ArrowUp", "ArrowLeft"], St.prototype._moveToPrevious],
      [["Home"], St.prototype._moveToBeginning],
      [["End"], St.prototype._moveToEnd]
    ]));
  }
  constructor({ editor: t = null, uiManager: e = null }) {
    t ? (this.#a = !1, this.#r = t) : this.#a = !0, this.#h = t?._uiManager || e, this.#o = this.#h._eventBus, this.#s = t?.color?.toUpperCase() || this.#h?.highlightColors.values().next().value || "#FFFF98", St.#u ||= Object.freeze({
      blue: "pdfjs-editor-colorpicker-blue",
      green: "pdfjs-editor-colorpicker-green",
      pink: "pdfjs-editor-colorpicker-pink",
      red: "pdfjs-editor-colorpicker-red",
      yellow: "pdfjs-editor-colorpicker-yellow"
    });
  }
  renderButton() {
    const t = this.#t = document.createElement("button");
    t.className = "colorPicker", t.tabIndex = "0", t.setAttribute("data-l10n-id", "pdfjs-editor-colorpicker-button"), t.ariaHasPopup = "true", this.#r && (t.ariaControls = `${this.#r.id}_colorpicker_dropdown`);
    const e = this.#h._signal;
    t.addEventListener("click", this.#m.bind(this), { signal: e }), t.addEventListener("keydown", this.#g.bind(this), { signal: e });
    const i = this.#e = document.createElement("span");
    return i.className = "swatch", i.ariaHidden = "true", i.style.backgroundColor = this.#s, t.append(i), t;
  }
  renderMainDropdown() {
    const t = this.#i = this.#d();
    return t.ariaOrientation = "horizontal", t.ariaLabelledBy = "highlightColorPickerLabel", t;
  }
  #d() {
    const t = document.createElement("div"), e = this.#h._signal;
    t.addEventListener("contextmenu", At, { signal: e }), t.className = "dropdown", t.role = "listbox", t.ariaMultiSelectable = "false", t.ariaOrientation = "vertical", t.setAttribute("data-l10n-id", "pdfjs-editor-colorpicker-dropdown"), this.#r && (t.id = `${this.#r.id}_colorpicker_dropdown`);
    for (const [i, n] of this.#h.highlightColors) {
      const r = document.createElement("button");
      r.tabIndex = "0", r.role = "option", r.setAttribute("data-color", n), r.title = i, r.setAttribute("data-l10n-id", St.#u[i]);
      const a = document.createElement("span");
      r.append(a), a.className = "swatch", a.style.backgroundColor = n, r.ariaSelected = n === this.#s, r.addEventListener("click", this.#f.bind(this, n), { signal: e }), t.append(r);
    }
    return t.addEventListener("keydown", this.#g.bind(this), { signal: e }), t;
  }
  #f(t, e) {
    e.stopPropagation(), this.#o.dispatch("switchannotationeditorparams", {
      source: this,
      type: N.HIGHLIGHT_COLOR,
      value: t
    }), this.update(t);
  }
  _colorSelectFromKeyboard(t) {
    if (t.target === this.#t) {
      this.#m(t);
      return;
    }
    const e = t.target.getAttribute("data-color");
    e && this.#f(e, t);
  }
  _moveToNext(t) {
    if (!this.#p) {
      this.#m(t);
      return;
    }
    if (t.target === this.#t) {
      this.#i.firstElementChild?.focus();
      return;
    }
    t.target.nextSibling?.focus();
  }
  _moveToPrevious(t) {
    if (t.target === this.#i?.firstElementChild || t.target === this.#t) {
      this.#p && this._hideDropdownFromKeyboard();
      return;
    }
    this.#p || this.#m(t), t.target.previousSibling?.focus();
  }
  _moveToBeginning(t) {
    if (!this.#p) {
      this.#m(t);
      return;
    }
    this.#i.firstElementChild?.focus();
  }
  _moveToEnd(t) {
    if (!this.#p) {
      this.#m(t);
      return;
    }
    this.#i.lastElementChild?.focus();
  }
  #g(t) {
    St._keyboardManager.exec(this, t);
  }
  #m(t) {
    if (this.#p) {
      this.hideDropdown();
      return;
    }
    if (this.#n = t.detail === 0, this.#l || (this.#l = new AbortController(), window.addEventListener("pointerdown", this.#c.bind(this), { signal: this.#h.combinedSignal(this.#l) })), this.#t.ariaExpanded = "true", this.#i) {
      this.#i.classList.remove("hidden");
      return;
    }
    const e = this.#i = this.#d();
    this.#t.append(e);
  }
  #c(t) {
    this.#i?.contains(t.target) || this.hideDropdown();
  }
  hideDropdown() {
    this.#i?.classList.add("hidden"), this.#t.ariaExpanded = "false", this.#l?.abort(), this.#l = null;
  }
  get #p() {
    return this.#i && !this.#i.classList.contains("hidden");
  }
  _hideDropdownFromKeyboard() {
    if (!this.#a) {
      if (!this.#p) {
        this.#r?.unselect();
        return;
      }
      this.hideDropdown(), this.#t.focus({
        preventScroll: !0,
        focusVisible: this.#n
      });
    }
  }
  update(t) {
    if (this.#e && (this.#e.style.backgroundColor = t), !this.#i) return;
    const e = this.#h.highlightColors.values();
    for (const i of this.#i.children) i.ariaSelected = e.next().value === t.toUpperCase();
  }
  destroy() {
    this.#t?.remove(), this.#t = null, this.#e = null, this.#i?.remove(), this.#i = null;
  }
}, Ki = class As {
  #t = null;
  #e = !1;
  #s = null;
  #i = null;
  static #n = null;
  constructor(t) {
    this.#s = t, this.#i = t._uiManager, As.#n ||= Object.freeze({
      freetext: "pdfjs-editor-color-picker-free-text-input",
      ink: "pdfjs-editor-color-picker-ink-input"
    });
  }
  renderButton() {
    if (this.#t) return this.#t;
    const { editorType: t, colorType: e, colorAndOpacityType: i, opacityType: n, color: r, opacity: a } = this.#s, o = this.#e = z.isAlphaColorInputSupported && n !== void 0, l = this.#t = document.createElement("input");
    if (l.type = "color", o) {
      l.setAttribute("alpha", "");
      const h = _.hexNums[Math.round((a ?? 1) * 255)];
      l.value = (r || "#000000") + h;
    } else l.value = r || "#000000";
    return l.className = "basicColorPicker", l.tabIndex = 0, l.setAttribute("data-l10n-id", As.#n[t]), l.addEventListener("input", () => {
      if (o) {
        const h = he(l.value);
        if (!h) return;
        const [c, d, u, p] = h, f = _.makeHexColor(c, d, u);
        i !== void 0 ? this.#i.updateParams(i, {
          color: f,
          opacity: p
        }) : (this.#i.updateParams(e, f), this.#i.updateParams(n, p));
      } else this.#i.updateParams(e, l.value);
    }, { signal: this.#i._signal }), l;
  }
  update(t) {
    if (this.#t)
      if (this.#e) {
        const e = _.hexNums[Math.round(this.#s.opacity * 255)];
        this.#t.value = t + e;
      } else this.#t.value = t;
  }
  updateOpacity(t) {
    if (!this.#t || !this.#e) return;
    const e = _.hexNums[Math.round(t * 255)];
    this.#t.value = this.#s.color + e;
  }
  destroy() {
    this.#t?.remove(), this.#t = null;
  }
  hideDropdown() {
  }
};
function fi(s) {
  return Math.floor(Y(s, 0, 1) * 255).toString(16).padStart(2, "0");
}
function ee(s) {
  return Y(s, 0, 1) * 255;
}
var pi = class {
  static CMYK_G([s, t, e, i]) {
    return ["G", 1 - Math.min(1, 0.3 * s + 0.59 * e + 0.11 * t + i)];
  }
  static G_CMYK([s]) {
    return [
      "CMYK",
      0,
      0,
      0,
      1 - s
    ];
  }
  static G_RGB([s]) {
    return [
      "RGB",
      s,
      s,
      s
    ];
  }
  static G_rgb([s]) {
    return s = ee(s), [
      s,
      s,
      s
    ];
  }
  static G_HTML([s]) {
    const t = fi(s);
    return `#${t}${t}${t}`;
  }
  static RGB_G([s, t, e]) {
    return ["G", 0.3 * s + 0.59 * t + 0.11 * e];
  }
  static RGB_rgb(s) {
    return s.map(ee);
  }
  static RGB_HTML(s) {
    return `#${s.map(fi).join("")}`;
  }
  static T_HTML() {
    return "#00000000";
  }
  static T_rgb() {
    return [null];
  }
  static CMYK_RGB([s, t, e, i]) {
    return [
      "RGB",
      1 - Math.min(1, s + i),
      1 - Math.min(1, e + i),
      1 - Math.min(1, t + i)
    ];
  }
  static CMYK_rgb([s, t, e, i]) {
    return [
      ee(1 - Math.min(1, s + i)),
      ee(1 - Math.min(1, e + i)),
      ee(1 - Math.min(1, t + i))
    ];
  }
  static CMYK_HTML(s) {
    const t = this.CMYK_RGB(s).slice(1);
    return this.RGB_HTML(t);
  }
  static RGB_CMYK([s, t, e]) {
    const i = 1 - s, n = 1 - t, r = 1 - e;
    return [
      "CMYK",
      i,
      n,
      r,
      Math.min(i, n, r)
    ];
  }
}, fa = class {
  create(s, t, e = !1) {
    if (s <= 0 || t <= 0) throw new Error("Invalid SVG dimensions");
    const i = this._createSVG("svg:svg");
    return i.setAttribute("version", "1.1"), e || (i.setAttribute("width", `${s}px`), i.setAttribute("height", `${t}px`)), i.setAttribute("preserveAspectRatio", "none"), i.setAttribute("viewBox", `0 0 ${s} ${t}`), i;
  }
  createElement(s) {
    if (typeof s != "string") throw new Error("Invalid SVG element type");
    return this._createSVG(s);
  }
  _createSVG(s) {
    U("Abstract method `_createSVG` called.");
  }
}, Pe = class extends fa {
  _createSVG(s) {
    return document.createElementNS(lt, s);
  }
}, pa = 9, Gt = /* @__PURE__ */ new WeakSet(), ga = (/* @__PURE__ */ new Date()).getTimezoneOffset() * 60 * 1e3, Je = class {
  static create(s) {
    switch (s.data.annotationType) {
      case q.LINK:
        return new Is(s);
      case q.TEXT:
        return new ba(s);
      case q.WIDGET:
        switch (s.data.fieldType) {
          case "Tx":
            return new ya(s);
          case "Btn":
            return s.data.radioButton ? new wa(s) : s.data.checkBox ? new va(s) : new Sa(s);
          case "Ch":
            return new Ea(s);
          case "Sig":
            return new Aa(s);
        }
        return new zt(s);
      case q.POPUP:
        return new vs(s);
      case q.FREETEXT:
        return new Qi(s);
      case q.LINE:
        return new Ca(s);
      case q.SQUARE:
        return new xa(s);
      case q.CIRCLE:
        return new Ta(s);
      case q.POLYLINE:
        return new Ji(s);
      case q.CARET:
        return new Pa(s);
      case q.INK:
        return new Ls(s);
      case q.POLYGON:
        return new ka(s);
      case q.HIGHLIGHT:
        return new Zi(s);
      case q.UNDERLINE:
        return new Ma(s);
      case q.SQUIGGLY:
        return new Da(s);
      case q.STRIKEOUT:
        return new Ia(s);
      case q.STAMP:
        return new tn(s);
      case q.FILEATTACHMENT:
        return new La(s);
      case q.RICHMEDIA:
      case q.SCREEN:
      case q.SOUND:
        return new en(s);
      default:
        return new J(s);
    }
  }
}, J = class qi {
  #t = null;
  #e = !1;
  #s = null;
  constructor(t, { isRenderable: e = !1, ignoreBorder: i = !1, createQuadrilaterals: n = !1 } = {}) {
    this.isRenderable = e, this.data = t.data, this.layer = t.layer, this.linkService = t.linkService, this.downloadManager = t.downloadManager, this.imageResourcesPath = t.imageResourcesPath, this.renderForms = t.renderForms, this.svgFactory = t.svgFactory, this.annotationStorage = t.annotationStorage, this.enableComment = t.enableComment, this.enableScripting = t.enableScripting, this.hasJSActions = t.hasJSActions, this._fieldObjects = t.fieldObjects, this.parent = t.parent, this.hasOwnCommentButton = !1, e && (this.contentElement = this.container = this._createContainer(i)), n && this._createQuadrilaterals();
  }
  static _hasPopupData({ contentsObj: t, richText: e }) {
    return !!(t?.str || e?.str);
  }
  get _isEditable() {
    return this.data.isEditable;
  }
  get hasPopupData() {
    return qi._hasPopupData(this.data) || this.enableComment && !!this.commentText;
  }
  get commentData() {
    const { data: t } = this, e = this.annotationStorage?.getEditor(t.id);
    return e ? e.getData() : t;
  }
  get hasCommentButton() {
    return this.enableComment && this.hasPopupElement;
  }
  get commentButtonPosition() {
    const t = this.annotationStorage?.getEditor(this.data.id);
    if (t) return t.commentButtonPositionInPage;
    const { quadPoints: e, inkLists: i, rect: n } = this.data;
    let r = -1 / 0, a = -1 / 0;
    if (e?.length >= 8) {
      for (let o = 0; o < e.length; o += 8) e[o + 1] > a ? (a = e[o + 1], r = e[o + 2]) : e[o + 1] === a && (r = Math.max(r, e[o + 2]));
      return [r, a];
    }
    if (i?.length >= 1) {
      for (const o of i) for (let l = 0, h = o.length; l < h; l += 2) o[l + 1] > a ? (a = o[l + 1], r = o[l]) : o[l + 1] === a && (r = Math.max(r, o[l]));
      if (r !== 1 / 0) return [r, a];
    }
    return n ? [n[2], n[3]] : null;
  }
  _normalizePoint(t) {
    const { page: { view: e }, viewport: { rawDims: { pageWidth: i, pageHeight: n, pageX: r, pageY: a } } } = this.parent;
    return t[1] = e[3] - t[1] + e[1], t[0] = 100 * (t[0] - r) / i, t[1] = 100 * (t[1] - a) / n, t;
  }
  get commentText() {
    const { data: t } = this;
    return this.annotationStorage.getRawValue(`${Qt}${t.id}`)?.popup?.contents || t.contentsObj?.str || "";
  }
  set commentText(t) {
    const { data: e } = this, i = {
      deleted: !t,
      contents: t || ""
    };
    this.annotationStorage.updateEditor(e.id, { popup: i }) || this.annotationStorage.setValue(`${Qt}${e.id}`, {
      id: e.id,
      annotationType: e.annotationType,
      page: this.parent.page,
      popup: i,
      popupRef: e.popupRef,
      modificationDate: /* @__PURE__ */ new Date()
    }), t || this.removePopup();
  }
  removePopup() {
    (this.#s?.popup || this.popup)?.remove(), this.#s = this.popup = null;
  }
  updateEdited(t) {
    if (!this.container) return;
    t.rect && (this.#t ||= { rect: this.data.rect.slice(0) });
    const { rect: e, popup: i } = t;
    e && this.#i(e);
    let n = this.#s?.popup || this.popup;
    !n && i?.text && (this._createPopup(i), n = this.#s.popup), n && (n.updateEdited(t), i?.deleted && (n.remove(), this.#s = null, this.popup = null));
  }
  resetEdited() {
    this.#t && (this.#i(this.#t.rect), this.#s?.popup.resetEdited(), this.#t = null);
  }
  #i(t) {
    const { container: { style: e }, data: { rect: i, rotation: n }, parent: { viewport: { rawDims: { pageWidth: r, pageHeight: a, pageX: o, pageY: l } } } } = this;
    i?.splice(0, 4, ...t), e.left = `${100 * (t[0] - o) / r}%`, e.top = `${100 * (a - t[3] + l) / a}%`, n === 0 ? (e.width = `${100 * (t[2] - t[0]) / r}%`, e.height = `${100 * (t[3] - t[1]) / a}%`) : this.setRotation(n);
  }
  _createContainer(t) {
    const { data: e, parent: { page: i, viewport: n } } = this, r = document.createElement("section");
    r.setAttribute("data-annotation-id", e.id), !(this instanceof zt) && !(this instanceof Is) && !(this instanceof en) && (r.tabIndex = 0);
    const { style: a } = r;
    if (a.zIndex = this.parent.zIndex, this.parent.zIndex += 2, e.alternativeText && (r.title = e.alternativeText), e.noRotate && r.classList.add("norotate"), !e.rect || this instanceof vs) {
      const { rotation: m } = e;
      return !e.hasOwnCanvas && m !== 0 && this.setRotation(m, r), r;
    }
    const { width: o, height: l } = this;
    if (!t && e.borderStyle.width > 0) {
      a.borderWidth = `${e.borderStyle.width}px`;
      const m = e.borderStyle.horizontalCornerRadius, g = e.borderStyle.verticalCornerRadius;
      switch ((m > 0 || g > 0) && (a.borderRadius = `calc(${m}px * var(--total-scale-factor)) / calc(${g}px * var(--total-scale-factor))`), e.borderStyle.style) {
        case Xt.SOLID:
          a.borderStyle = "solid";
          break;
        case Xt.DASHED:
          a.borderStyle = "dashed";
          break;
        case Xt.BEVELED:
          R("Unimplemented border style: beveled");
          break;
        case Xt.INSET:
          R("Unimplemented border style: inset");
          break;
        case Xt.UNDERLINE:
          a.borderBottomStyle = "solid";
      }
      const b = e.borderColor || null;
      b ? (this.#e = !0, a.borderColor = _.makeHexColor(...b)) : a.borderWidth = 0;
    }
    const h = _.normalizeRect([
      e.rect[0],
      i.view[3] - e.rect[1] + i.view[1],
      e.rect[2],
      i.view[3] - e.rect[3] + i.view[1]
    ]), { pageWidth: c, pageHeight: d, pageX: u, pageY: p } = n.rawDims;
    a.left = `${100 * (h[0] - u) / c}%`, a.top = `${100 * (h[1] - p) / d}%`;
    const { rotation: f } = e;
    return e.hasOwnCanvas || f === 0 ? (a.width = `${100 * o / c}%`, a.height = `${100 * l / d}%`) : this.setRotation(f, r), r;
  }
  setRotation(t, e = this.container) {
    if (!this.data.rect) return;
    const { pageWidth: i, pageHeight: n } = this.parent.viewport.rawDims;
    let { width: r, height: a } = this;
    t % 180 !== 0 && ([r, a] = [a, r]), e.style.width = `${100 * r / i}%`, e.style.height = `${100 * a / n}%`, e.setAttribute("data-main-rotation", (360 - t) % 360);
  }
  get _commonActions() {
    const t = (e, i, n) => {
      const r = n.detail[e], a = r[0], o = r.slice(1);
      n.target.style[i] = pi[`${a}_HTML`](o), this.annotationStorage.setValue(this.data.id, { [i]: pi[`${a}_rgb`](o) });
    };
    return P(this, "_commonActions", {
      display: (e) => {
        const { display: i } = e.detail, n = i % 2 === 1;
        this.container.style.visibility = n ? "hidden" : "visible", this.annotationStorage.setValue(this.data.id, {
          noView: n,
          noPrint: i === 1 || i === 2
        });
      },
      print: (e) => {
        this.annotationStorage.setValue(this.data.id, { noPrint: !e.detail.print });
      },
      hidden: (e) => {
        const { hidden: i } = e.detail;
        this.container.style.visibility = i ? "hidden" : "visible", this.annotationStorage.setValue(this.data.id, {
          noPrint: i,
          noView: i
        });
      },
      focus: (e) => {
        setTimeout(() => e.target.focus({ preventScroll: !1 }), 0);
      },
      userName: (e) => {
        e.target.title = e.detail.userName;
      },
      readonly: (e) => {
        e.target.disabled = e.detail.readonly;
      },
      required: (e) => {
        this._setRequired(e.target, e.detail.required);
      },
      bgColor: (e) => {
        t("bgColor", "backgroundColor", e);
      },
      fillColor: (e) => {
        t("fillColor", "backgroundColor", e);
      },
      fgColor: (e) => {
        t("fgColor", "color", e);
      },
      textColor: (e) => {
        t("textColor", "color", e);
      },
      borderColor: (e) => {
        t("borderColor", "borderColor", e);
      },
      strokeColor: (e) => {
        t("strokeColor", "borderColor", e);
      },
      rotation: (e) => {
        const i = e.detail.rotation;
        this.setRotation(i), this.annotationStorage.setValue(this.data.id, { rotation: i });
      }
    });
  }
  _dispatchEventFromSandbox(t, e) {
    const i = this._commonActions;
    for (const n of Object.keys(e.detail)) (t[n] || i[n])?.(e);
  }
  _setDefaultPropertiesFromJS(t) {
    if (!this.enableScripting) return;
    const e = this.annotationStorage.getRawValue(this.data.id);
    if (!e) return;
    const i = this._commonActions;
    for (const [n, r] of Object.entries(e)) {
      const a = i[n];
      a && (a({
        detail: { [n]: r },
        target: t
      }), delete e[n]);
    }
  }
  _createQuadrilaterals() {
    if (!this.container) return;
    const { quadPoints: t } = this.data;
    if (!t) return;
    const [e, i, n, r] = this.data.rect.map(Math.fround);
    if (t.length === 8) {
      const [m, g, b, y] = t.subarray(2, 6);
      if (n === m && r === g && e === b && i === y) return;
    }
    const { style: a } = this.container;
    let o;
    if (this.#e) {
      const { borderColor: m, borderWidth: g } = a;
      a.borderWidth = 0, o = [
        "url('data:image/svg+xml;utf8,",
        `<svg xmlns="${lt}" preserveAspectRatio="none" viewBox="0 0 1 1">`,
        `<g fill="transparent" stroke="${m}" stroke-width="${g}">`
      ], this.container.classList.add("hasBorder");
    }
    const l = n - e, h = r - i, { svgFactory: c } = this, d = c.createElement("svg");
    d.classList.add("quadrilateralsContainer"), d.setAttribute("width", 0), d.setAttribute("height", 0), d.role = "none";
    const u = c.createElement("defs");
    d.append(u);
    const p = c.createElement("clipPath"), f = `clippath_${this.data.id}`;
    p.setAttribute("id", f), p.setAttribute("clipPathUnits", "objectBoundingBox"), u.append(p);
    for (let m = 2, g = t.length; m < g; m += 8) {
      const b = t[m], y = t[m + 1], A = t[m + 2], w = t[m + 3], v = c.createElement("rect"), S = (A - e) / l, E = (r - y) / h, C = (b - A) / l, x = (y - w) / h;
      v.setAttribute("x", S), v.setAttribute("y", E), v.setAttribute("width", C), v.setAttribute("height", x), p.append(v), o?.push(`<rect vector-effect="non-scaling-stroke" x="${S}" y="${E}" width="${C}" height="${x}"/>`);
    }
    this.#e && (o.push("</g></svg>')"), a.backgroundImage = o.join("")), this.container.append(d), this.container.style.clipPath = `url(#${f})`;
  }
  _createPopup(t = null) {
    const { data: e } = this;
    let i, n;
    t ? (i = { str: t.text }, n = t.date) : (i = e.contentsObj, n = e.modificationDate), this.#s = new vs({
      data: {
        color: e.color,
        titleObj: e.titleObj,
        modificationDate: n,
        contentsObj: i,
        richText: e.richText,
        parentRect: e.rect,
        borderStyle: 0,
        id: `popup_${e.id}`,
        rotation: e.rotation,
        noRotate: !0
      },
      linkService: this.linkService,
      parent: this.parent,
      elements: [this]
    });
  }
  get hasPopupElement() {
    return !!(this.#s || this.popup || this.data.popupRef);
  }
  get extraPopupElement() {
    return this.#s;
  }
  render() {
    U("Abstract method `AnnotationElement.render` called");
  }
  _getElementsByName(t, e = null) {
    const i = [];
    if (this._fieldObjects) {
      const n = this._fieldObjects.get(t) || [];
      for (const { page: r, id: a, exportValues: o } of n) {
        if (r === -1 || a === e) continue;
        const l = typeof o == "string" ? o : null, h = document.querySelector(`[data-element-id="${a}"]`);
        if (h && !Gt.has(h)) {
          R(`_getElementsByName - element not allowed: ${a}`);
          continue;
        }
        i.push({
          id: a,
          exportValue: l,
          domElement: h
        });
      }
      return i;
    }
    for (const n of document.getElementsByName(t)) {
      const { exportValue: r } = n, a = n.getAttribute("data-element-id");
      a !== e && Gt.has(n) && i.push({
        id: a,
        exportValue: r,
        domElement: n
      });
    }
    return i;
  }
  show() {
    this.container && (this.container.hidden = !1), this.popup?.maybeShow();
  }
  hide() {
    this.container && (this.container.hidden = !0), this.popup?.forceHide();
  }
  getElementsToTriggerPopup() {
    return this.container;
  }
  addHighlightArea() {
    const t = this.getElementsToTriggerPopup();
    if (Array.isArray(t)) for (const e of t) e.classList.add("highlightArea");
    else t.classList.add("highlightArea");
  }
  _editOnDoubleClick() {
    if (!this._isEditable) return;
    const { annotationEditorType: t, data: { id: e } } = this;
    this.container.addEventListener("dblclick", () => {
      this.linkService.eventBus?.dispatch("switchannotationeditormode", {
        source: this,
        mode: t,
        editId: e,
        mustEnterInEditMode: !0
      });
    });
  }
  updateOC(t) {
    !this.data.oc || !t || (t.isVisible(this.data.oc) ? this.show() : this.hide());
  }
  get width() {
    return this.data.rect[2] - this.data.rect[0];
  }
  get height() {
    return this.data.rect[3] - this.data.rect[1];
  }
  _setBackgroundColor(t) {
    const e = this.data.backgroundColor || null;
    t.style.backgroundColor = e === null ? "transparent" : _.makeHexColor(...e);
  }
}, ma = class extends J {
  constructor(s) {
    super(s, {
      isRenderable: !0,
      ignoreBorder: !0
    }), this.editor = s.editor;
  }
  render() {
    return this.container.className = "editorAnnotation", this.container;
  }
  createOrUpdatePopup() {
    const { editor: s } = this;
    s.hasComment && this._createPopup(s.comment);
  }
  get hasCommentButton() {
    return this.enableComment && this.editor.hasComment;
  }
  get commentButtonPosition() {
    return this.editor.commentButtonPositionInPage;
  }
  get commentText() {
    return this.editor.comment.text;
  }
  set commentText(s) {
    this.editor.comment = s, s || this.removePopup();
  }
  get commentData() {
    return this.editor.getData();
  }
  remove() {
    this.parent.removeAnnotation(this.data.id), this.container.remove(), this.container = null, this.removePopup();
  }
}, Is = class extends J {
  constructor(s, t = null) {
    super(s, {
      isRenderable: !0,
      ignoreBorder: !!t?.ignoreBorder,
      createQuadrilaterals: !0
    }), this.isTooltipOnly = s.data.isTooltipOnly;
  }
  render() {
    const { data: s, linkService: t } = this, e = document.createElement("a");
    e.setAttribute("data-element-id", s.id);
    let i = !1;
    return s.url ? (t.addLinkAttributes(e, s.url, s.newWindow), i = !0) : s.action ? (this._bindNamedAction(e, s.action, s.overlaidText), i = !0) : s.attachment ? (this.#e(e, s.attachmentId, s.attachment, s.overlaidText, s.attachmentDest), i = !0) : s.setOCGState ? (this.#s(e, s.setOCGState, s.overlaidText), i = !0) : s.dest ? (this._bindLink(e, s.dest, s.overlaidText), i = !0) : (s.actions && (s.actions.has("Action") || s.actions.has("Mouse Up") || s.actions.has("Mouse Down")) && this.enableScripting && this.hasJSActions && (this._bindJSAction(e, s), i = !0), s.resetForm ? (this._bindResetFormAction(e, s.resetForm), i = !0) : this.isTooltipOnly && !i && (this._bindLink(e, ""), i = !0)), this.container.classList.add("linkAnnotation"), i && (this.contentElement = e, this.container.append(e)), this.container;
  }
  #t() {
    this.container.setAttribute("data-internal-link", "");
  }
  _bindLink(s, t, e = "") {
    s.href = this.linkService.getDestinationHash(t), s.onclick = () => (t && this.linkService.goToDestination(t), !1), (t || t === "") && this.#t(), e && (s.title = e);
  }
  _bindNamedAction(s, t, e = "") {
    s.href = this.linkService.getAnchorUrl(""), s.onclick = () => (this.linkService.executeNamedAction(t), !1), e && (s.title = e), this.#t();
  }
  #e(s, t, e, i = "", n = null) {
    s.href = this.linkService.getAnchorUrl(""), e.description ? s.title = e.description : i && (s.title = i);
    const r = async () => {
      const a = await this.linkService.getAttachmentContent(t);
      a && this.downloadManager?.openOrDownloadData(a, e.filename, n);
    };
    s.onclick = () => (r(), !1), this.#t();
  }
  #s(s, t, e = "") {
    s.href = this.linkService.getAnchorUrl(""), s.onclick = () => (this.linkService.executeSetOCGState(t), !1), e && (s.title = e), this.#t();
  }
  _bindJSAction(s, { actions: t, id: e, overlaidText: i }) {
    s.href = this.linkService.getAnchorUrl("");
    const n = /* @__PURE__ */ new Map([
      ["Action", "onclick"],
      ["Mouse Up", "onmouseup"],
      ["Mouse Down", "onmousedown"]
    ]);
    for (const r of t.keys()) {
      const a = n.get(r);
      a && (s[a] = () => (this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
        source: this,
        detail: {
          id: e,
          name: r
        }
      }), !1));
    }
    i && (s.title = i), s.onclick ||= () => !1, this.#t();
  }
  _bindResetFormAction(s, t) {
    const e = s.onclick;
    if (e || (s.href = this.linkService.getAnchorUrl("")), this.#t(), !this._fieldObjects) {
      R('_bindResetFormAction - "resetForm" action not supported, ensure that the `fieldObjects` parameter is provided.'), e || (s.onclick = () => !1);
      return;
    }
    s.onclick = () => {
      e?.();
      const { fields: i, refs: n, include: r } = t, a = [];
      if (i.length !== 0 || n.length !== 0) {
        const h = new Set(n);
        for (const c of i) {
          const d = this._fieldObjects.get(c) || [];
          for (const { id: u } of d) h.add(u);
        }
        for (const c of this._fieldObjects.values()) for (const d of c) h.has(d.id) === r && a.push(d);
      } else for (const h of this._fieldObjects.values()) a.push(...h);
      const o = this.annotationStorage, l = [];
      for (const h of a) {
        const { id: c } = h;
        switch (l.push(c), h.type) {
          case "text": {
            const u = h.defaultValue || "";
            o.setValue(c, { value: u });
            break;
          }
          case "checkbox":
          case "radiobutton": {
            const u = h.defaultValue === h.exportValues;
            o.setValue(c, { value: u });
            break;
          }
          case "combobox":
          case "listbox": {
            const u = h.defaultValue || "";
            o.setValue(c, { value: u });
            break;
          }
          default:
            continue;
        }
        const d = document.querySelector(`[data-element-id="${c}"]`);
        if (d) {
          if (!Gt.has(d)) {
            R(`_bindResetFormAction - element not allowed: ${c}`);
            continue;
          }
        } else continue;
        d.dispatchEvent(new Event("resetform"));
      }
      return this.enableScripting && this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
        source: this,
        detail: {
          id: "app",
          ids: l,
          name: "ResetForm"
        }
      }), !1;
    };
  }
}, ba = class extends J {
  constructor(s) {
    super(s, { isRenderable: !0 });
  }
  render() {
    this.container.classList.add("textAnnotation");
    const s = document.createElement("img");
    return s.src = this.imageResourcesPath + "annotation-" + this.data.name.toLowerCase() + ".svg", s.setAttribute("data-l10n-id", "pdfjs-text-annotation-type"), s.setAttribute("data-l10n-args", JSON.stringify({ type: this.data.name })), !this.data.popupRef && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container.append(s), this.container;
  }
}, zt = class extends J {
  render() {
    return this.container;
  }
  _getKeyModifier(s) {
    return z.platform.isMac ? s.metaKey : s.ctrlKey;
  }
  _setEventListener(s, t, e, i, n) {
    e.includes("mouse") ? s.addEventListener(e, (r) => {
      this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
        source: this,
        detail: {
          id: this.data.id,
          name: i,
          value: n(r),
          shift: r.shiftKey,
          modifier: this._getKeyModifier(r)
        }
      });
    }) : s.addEventListener(e, (r) => {
      if (e === "blur") {
        if (!t.focused || !r.relatedTarget) return;
        t.focused = !1;
      } else if (e === "focus") {
        if (t.focused) return;
        t.focused = !0;
      }
      n && this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
        source: this,
        detail: {
          id: this.data.id,
          name: i,
          value: n(r)
        }
      });
    });
  }
  _setEventListeners(s, t, e, i) {
    const { actions: n } = this.data;
    for (const [r, a] of e) (a === "Action" || n?.has(a)) && ((a === "Focus" || a === "Blur") && (t ||= { focused: !1 }), this._setEventListener(s, t, r, a, i), a === "Focus" && !n?.has("Blur") ? this._setEventListener(s, t, "blur", "Blur", null) : a === "Blur" && !n?.has("Focus") && this._setEventListener(s, t, "focus", "Focus", null));
  }
  _setTextStyle(s) {
    const t = [
      "left",
      "center",
      "right"
    ], { fontColor: e } = this.data.defaultAppearanceData, i = this.data.defaultAppearanceData.fontSize || pa, n = s.style;
    let r;
    const a = 2, o = (l) => Math.round(10 * l) / 10;
    if (this.data.multiLine) {
      const l = Math.abs(this.data.rect[3] - this.data.rect[1] - a), h = l / (Math.round(l / (1.35 * i)) || 1);
      r = Math.min(i, o(h / 1.35));
    } else {
      const l = Math.abs(this.data.rect[3] - this.data.rect[1] - a);
      r = Math.min(i, o(l / 1.35));
    }
    n.fontSize = `calc(${r}px * var(--total-scale-factor))`, n.color = _.makeHexColor(...e), this.data.textAlignment !== null && !this.data.comb && (n.textAlign = t[this.data.textAlignment]);
  }
  _setRequired(s, t) {
    t ? s.setAttribute("required", !0) : s.removeAttribute("required"), s.setAttribute("aria-required", t);
  }
}, ya = class extends zt {
  constructor(s) {
    const t = s.renderForms || s.data.hasOwnCanvas || !s.data.hasAppearance && !!s.data.fieldValue;
    super(s, { isRenderable: t });
  }
  setPropertyOnSiblings(s, t, e, i) {
    const n = this.annotationStorage;
    for (const r of this._getElementsByName(s.name, s.id))
      r.domElement && (r.domElement[t] = e), n.setValue(r.id, { [i]: e });
  }
  render() {
    const s = this.annotationStorage, t = this.data.id;
    this.container.classList.add("textWidgetAnnotation");
    let e = null;
    if (this.renderForms) {
      const i = s.getValue(t, { value: this.data.fieldValue });
      let n = i.value || "";
      const r = s.getValue(t, { charLimit: this.data.maxLen }).charLimit;
      r && n.length > r && (n = n.slice(0, r));
      let a = i.formattedValue || this.data.textContent?.join(`
`) || null;
      a && this.data.comb && (a = a.replaceAll(/\s+/g, ""));
      const o = {
        userValue: n,
        formattedValue: a,
        lastCommittedValue: null,
        commitKey: 1,
        focused: !1
      };
      this.data.multiLine ? (e = document.createElement("textarea"), e.textContent = a ?? n, this.data.doNotScroll && (e.style.overflowY = "hidden")) : (e = document.createElement("input"), e.type = this.data.password ? "password" : "text", e.setAttribute("value", a ?? n), this.data.doNotScroll && (e.style.overflowX = "hidden")), this.data.hasOwnCanvas && (this.container.classList.add("hasOwnCanvas"), s.has(t) && this.container.classList.add("sandboxModified")), Gt.add(e), this.contentElement = e, e.setAttribute("data-element-id", t), e.disabled = this.data.readOnly, e.name = this.data.fieldName, e.tabIndex = 0;
      const { datetimeFormat: l, datetimeType: h, timeStep: c } = this.data, d = !!h && this.enableScripting;
      l && (e.title = l), this._setRequired(e, this.data.required), r && (e.maxLength = r), e.addEventListener("input", (p) => {
        s.setValue(t, { value: p.target.value }), this.setPropertyOnSiblings(e, "value", p.target.value, "value"), o.formattedValue = null;
      }), e.addEventListener("resetform", (p) => {
        const f = this.data.defaultFieldValue ?? "";
        e.value = o.userValue = f, o.formattedValue = null;
      });
      let u = (p) => {
        const { formattedValue: f } = o;
        f != null && (p.target.value = f), p.target.scrollLeft = 0;
      };
      if (this.enableScripting && this.hasJSActions) {
        e.addEventListener("focus", (f) => {
          if (o.focused) return;
          const { target: m } = f;
          if (d && (m.type = h, c && (m.step = c)), o.userValue) {
            const g = o.userValue;
            if (d)
              if (h === "time") {
                const b = new Date(g);
                m.value = [
                  b.getHours(),
                  b.getMinutes(),
                  b.getSeconds()
                ].map((y) => y.toString().padStart(2, "0")).join(":");
              } else m.value = new Date(g - ga).toISOString().split(h === "date" ? "T" : ".", 1)[0];
            else m.value = g;
          }
          o.lastCommittedValue = m.value, o.commitKey = 1, this.data.actions?.has("Focus") || (o.focused = !0);
        }), e.addEventListener("updatefromsandbox", (f) => {
          this.container.classList.add("sandboxModified"), this._dispatchEventFromSandbox({
            value(m) {
              o.userValue = m.detail.value ?? "", d || s.setValue(t, { value: o.userValue.toString() }), m.target.value = o.userValue;
            },
            formattedValue(m) {
              const { formattedValue: g } = m.detail;
              o.formattedValue = g, g != null && m.target !== document.activeElement && (m.target.value = g);
              const b = { formattedValue: g };
              d && (b.value = g), s.setValue(t, b);
            },
            selRange(m) {
              m.target.setSelectionRange(...m.detail.selRange);
            },
            charLimit: (m) => {
              const { charLimit: g } = m.detail, { target: b } = m;
              if (g === 0) {
                b.removeAttribute("maxLength");
                return;
              }
              b.setAttribute("maxLength", g);
              let y = o.userValue;
              !y || y.length <= g || (y = y.slice(0, g), b.value = o.userValue = y, s.setValue(t, { value: y }), this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
                source: this,
                detail: {
                  id: t,
                  name: "Keystroke",
                  value: y,
                  willCommit: !0,
                  commitKey: 1,
                  selStart: b.selectionStart,
                  selEnd: b.selectionEnd
                }
              }));
            }
          }, f);
        }), e.addEventListener("keydown", (f) => {
          o.commitKey = 1;
          let m = -1;
          if (f.key === "Escape" ? m = 0 : f.key === "Enter" && !this.data.multiLine ? m = 2 : f.key === "Tab" && (o.commitKey = 3), m === -1) return;
          const { value: g } = f.target;
          o.lastCommittedValue !== g && (o.lastCommittedValue = g, o.userValue = g, this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
            source: this,
            detail: {
              id: t,
              name: "Keystroke",
              value: g,
              willCommit: !0,
              commitKey: m,
              selStart: f.target.selectionStart,
              selEnd: f.target.selectionEnd
            }
          }));
        });
        const p = u;
        u = null, e.addEventListener("blur", (f) => {
          if (!o.focused || !f.relatedTarget) return;
          this.data.actions?.has("Blur") || (o.focused = !1);
          const { target: m } = f;
          let { value: g } = m;
          if (d) {
            if (g && h === "time") {
              const b = g.split(":").map((y) => parseInt(y, 10));
              g = new Date(2e3, 0, 1, b[0], b[1], b[2] || 0).valueOf(), m.step = "";
            } else
              g.includes("T") || (g = `${g}T00:00`), g = new Date(g).valueOf();
            m.type = "text";
          }
          o.userValue = g, o.lastCommittedValue !== g && this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
            source: this,
            detail: {
              id: t,
              name: "Keystroke",
              value: g,
              willCommit: !0,
              commitKey: o.commitKey,
              selStart: f.target.selectionStart,
              selEnd: f.target.selectionEnd
            }
          }), p(f);
        }), this.data.actions?.has("Keystroke") && e.addEventListener("beforeinput", (f) => {
          o.lastCommittedValue = null;
          const { data: m, target: g } = f, { value: b, selectionStart: y, selectionEnd: A } = g;
          let w = y, v = A;
          switch (f.inputType) {
            case "deleteWordBackward": {
              const S = /\w/;
              for (; w > 0 && !S.test(b[w - 1]); ) w--;
              for (; w > 0 && S.test(b[w - 1]); ) w--;
              break;
            }
            case "deleteWordForward": {
              const S = b.substring(y).match(/^\W*\w*/);
              S && (v += S[0].length);
              break;
            }
            case "deleteContentBackward":
              y === A && (w -= 1);
              break;
            case "deleteContentForward":
              y === A && (v += 1);
          }
          f.preventDefault(), this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
            source: this,
            detail: {
              id: t,
              name: "Keystroke",
              value: b,
              change: m || "",
              willCommit: !1,
              selStart: w,
              selEnd: v
            }
          });
        }), this._setEventListeners(e, o, [
          ["focus", "Focus"],
          ["blur", "Blur"],
          ["mousedown", "Mouse Down"],
          ["mouseenter", "Mouse Enter"],
          ["mouseleave", "Mouse Exit"],
          ["mouseup", "Mouse Up"]
        ], (f) => f.target.value);
      }
      if (u && e.addEventListener("blur", u), this.data.comb) {
        const p = (this.data.rect[2] - this.data.rect[0]) / r;
        e.classList.add("comb"), e.style.setProperty("--comb-width", `calc(${p}px * var(--total-scale-factor))`);
        const f = this.data.textAlignment;
        if (f === 1 || f === 2) {
          const m = () => {
            const g = r - e.value.length;
            e.style.setProperty("--comb-offset", `${f === 1 ? g >> 1 : g}`);
          };
          m();
          for (const g of [
            "input",
            "blur",
            "resetform",
            "updatefromsandbox"
          ]) e.addEventListener(g, m);
        }
      }
    } else
      e = document.createElement("div"), e.textContent = this.data.fieldValue, e.style.verticalAlign = "middle", e.style.display = "table-cell", this.data.hasOwnCanvas && (e.hidden = !0);
    return this._setTextStyle(e), this._setBackgroundColor(e), this._setDefaultPropertiesFromJS(e), this.container.append(e), this.container;
  }
}, Aa = class extends zt {
  constructor(s) {
    super(s, { isRenderable: !!s.data.hasOwnCanvas });
  }
}, va = class extends zt {
  constructor(s) {
    super(s, { isRenderable: s.renderForms });
  }
  render() {
    const s = this.annotationStorage, t = this.data, e = t.id;
    let i = s.getValue(e, { value: t.exportValue === t.fieldValue }).value;
    typeof i == "string" && (i = i !== "Off", s.setValue(e, { value: i })), this.container.classList.add("buttonWidgetAnnotation", "checkBox");
    const n = document.createElement("input");
    return Gt.add(n), n.setAttribute("data-element-id", e), n.disabled = t.readOnly, this._setRequired(n, this.data.required), n.type = "checkbox", n.name = t.fieldName, i && n.setAttribute("checked", !0), n.setAttribute("exportValue", t.exportValue), n.tabIndex = 0, n.addEventListener("change", (r) => {
      const { name: a, checked: o } = r.target;
      for (const l of this._getElementsByName(a, e)) {
        const h = o && l.exportValue === t.exportValue;
        l.domElement && (l.domElement.checked = h), s.setValue(l.id, { value: h });
      }
      s.setValue(e, { value: o });
    }), n.addEventListener("resetform", (r) => {
      const a = t.defaultFieldValue || "Off";
      r.target.checked = a === t.exportValue;
    }), this.enableScripting && this.hasJSActions && (n.addEventListener("updatefromsandbox", (r) => {
      this._dispatchEventFromSandbox({ value(a) {
        a.target.checked = a.detail.value !== "Off", s.setValue(e, { value: a.target.checked });
      } }, r);
    }), this._setEventListeners(n, null, [
      ["change", "Validate"],
      ["change", "Action"],
      ["focus", "Focus"],
      ["blur", "Blur"],
      ["mousedown", "Mouse Down"],
      ["mouseenter", "Mouse Enter"],
      ["mouseleave", "Mouse Exit"],
      ["mouseup", "Mouse Up"]
    ], (r) => r.target.checked)), this._setDefaultPropertiesFromJS(n), this.container.append(n), this.container;
  }
}, wa = class extends zt {
  constructor(s) {
    super(s, { isRenderable: s.renderForms });
  }
  render() {
    this.container.classList.add("buttonWidgetAnnotation", "radioButton");
    const s = this.annotationStorage, t = this.data, e = t.id;
    let i = s.getValue(e, { value: t.buttonValue !== null && t.fieldValue === t.buttonValue }).value;
    if (typeof i == "string" && (i = i !== t.buttonValue, s.setValue(e, { value: i })), i) for (const r of this._getElementsByName(t.fieldName, e)) s.setValue(r.id, { value: !1 });
    const n = document.createElement("input");
    if (Gt.add(n), n.setAttribute("data-element-id", e), n.disabled = t.readOnly, this._setRequired(n, this.data.required), n.type = "radio", n.name = t.fieldName, i && n.setAttribute("checked", !0), n.tabIndex = 0, n.addEventListener("change", (r) => {
      const { name: a, checked: o } = r.target;
      for (const l of this._getElementsByName(a, e)) s.setValue(l.id, { value: !1 });
      s.setValue(e, { value: o });
    }), n.addEventListener("resetform", (r) => {
      const a = t.defaultFieldValue;
      r.target.checked = a != null && a === t.buttonValue;
    }), this.enableScripting && this.hasJSActions) {
      const r = t.buttonValue;
      n.addEventListener("updatefromsandbox", (a) => {
        this._dispatchEventFromSandbox({ value: (o) => {
          const l = r === o.detail.value;
          for (const h of this._getElementsByName(o.target.name)) {
            const c = l && h.id === e;
            h.domElement && (h.domElement.checked = c), s.setValue(h.id, { value: c });
          }
        } }, a);
      }), this._setEventListeners(n, null, [
        ["change", "Validate"],
        ["change", "Action"],
        ["focus", "Focus"],
        ["blur", "Blur"],
        ["mousedown", "Mouse Down"],
        ["mouseenter", "Mouse Enter"],
        ["mouseleave", "Mouse Exit"],
        ["mouseup", "Mouse Up"]
      ], (a) => a.target.checked);
    }
    return this._setDefaultPropertiesFromJS(n), this.container.append(n), this.container;
  }
}, Sa = class extends Is {
  constructor(s) {
    super(s, { ignoreBorder: s.data.hasAppearance });
  }
  render() {
    const s = super.render();
    s.classList.add("buttonWidgetAnnotation", "pushButton");
    const t = s.lastChild;
    return this.enableScripting && this.hasJSActions && t && (this._setDefaultPropertiesFromJS(t), t.addEventListener("updatefromsandbox", (e) => {
      this._dispatchEventFromSandbox({}, e);
    })), s;
  }
}, Ea = class extends zt {
  constructor(s) {
    super(s, { isRenderable: s.renderForms });
  }
  render() {
    this.container.classList.add("choiceWidgetAnnotation");
    const s = this.annotationStorage, t = this.data.id, e = s.getValue(t, { value: this.data.fieldValue }), i = document.createElement("select");
    Gt.add(i), i.setAttribute("data-element-id", t), i.disabled = this.data.readOnly, this._setRequired(i, this.data.required), i.name = this.data.fieldName, i.tabIndex = 0;
    let n = this.data.combo && this.data.options.length > 0;
    this.data.combo || (i.size = this.data.options.length, this.data.multiSelect && (i.multiple = !0)), i.addEventListener("resetform", (c) => {
      const d = this.data.defaultFieldValue;
      for (const u of i.options) u.selected = u.value === d;
    });
    const r = (c, d) => {
      const u = d.replaceAll(" ", " ");
      c.textContent = u, u !== d && c.setAttribute("display-value", d);
    };
    for (const c of this.data.options) {
      const d = document.createElement("option");
      r(d, c.displayValue), d.value = c.exportValue, e.value.includes(c.exportValue) && (d.setAttribute("selected", !0), n = !1), i.append(d);
    }
    let a = null;
    if (n) {
      const c = document.createElement("option");
      c.value = " ", c.setAttribute("hidden", !0), c.setAttribute("selected", !0), i.prepend(c), a = () => {
        c.remove(), i.removeEventListener("input", a), a = null;
      }, i.addEventListener("input", a);
    }
    const o = (c) => {
      const d = c ? "value" : "textContent", { options: u, multiple: p } = i;
      return p ? Array.prototype.filter.call(u, (f) => f.selected).map((f) => f[d]) : u.selectedIndex === -1 ? null : u[u.selectedIndex][d];
    };
    let l = o(!1);
    const h = (c) => {
      const d = c.target.options;
      return Array.prototype.map.call(d, (u) => ({
        displayValue: u.getAttribute("display-value") || u.textContent,
        exportValue: u.value
      }));
    };
    return this.enableScripting && this.hasJSActions ? (i.addEventListener("updatefromsandbox", (c) => {
      this._dispatchEventFromSandbox({
        value(d) {
          a?.();
          const u = d.detail.value, p = new Set(Array.isArray(u) ? u : [u]);
          for (const f of i.options) f.selected = p.has(f.value);
          s.setValue(t, { value: o(!0) }), l = o(!1);
        },
        multipleSelection(d) {
          i.multiple = !0;
        },
        remove(d) {
          const u = i.options, p = d.detail.remove;
          u[p].selected = !1, i.remove(p), u.length > 0 && Array.prototype.findIndex.call(u, (f) => f.selected) === -1 && (u[0].selected = !0), s.setValue(t, {
            value: o(!0),
            items: h(d)
          }), l = o(!1);
        },
        clear(d) {
          for (; i.length !== 0; ) i.remove(0);
          s.setValue(t, {
            value: null,
            items: []
          }), l = o(!1);
        },
        insert(d) {
          const { index: u, displayValue: p, exportValue: f } = d.detail.insert, m = i.children[u], g = document.createElement("option");
          r(g, p), g.value = f, m ? m.before(g) : i.append(g), s.setValue(t, {
            value: o(!0),
            items: h(d)
          }), l = o(!1);
        },
        items(d) {
          const { items: u } = d.detail;
          for (; i.length !== 0; ) i.remove(0);
          for (const p of u) {
            const { displayValue: f, exportValue: m } = p, g = document.createElement("option");
            r(g, f), g.value = m, i.append(g);
          }
          i.options.length > 0 && (i.options[0].selected = !0), s.setValue(t, {
            value: o(!0),
            items: h(d)
          }), l = o(!1);
        },
        indices(d) {
          const u = new Set(d.detail.indices);
          for (const p of d.target.options) p.selected = u.has(p.index);
          s.setValue(t, { value: o(!0) }), l = o(!1);
        },
        editable(d) {
          d.target.disabled = !d.detail.editable;
        }
      }, c);
    }), i.addEventListener("input", (c) => {
      const d = o(!0), u = o(!1);
      s.setValue(t, { value: d }), c.preventDefault(), this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
        source: this,
        detail: {
          id: t,
          name: "Keystroke",
          value: l,
          change: u,
          changeEx: d,
          willCommit: !1,
          commitKey: 1,
          keyDown: !1
        }
      });
    }), this._setEventListeners(i, null, [
      ["focus", "Focus"],
      ["blur", "Blur"],
      ["mousedown", "Mouse Down"],
      ["mouseenter", "Mouse Enter"],
      ["mouseleave", "Mouse Exit"],
      ["mouseup", "Mouse Up"],
      ["input", "Action"],
      ["input", "Validate"]
    ], (c) => c.target.value)) : i.addEventListener("input", function(c) {
      s.setValue(t, { value: o(!0) });
    }), this.data.combo && this._setTextStyle(i), this._setBackgroundColor(i), this._setDefaultPropertiesFromJS(i), this.container.append(i), this.container;
  }
}, vs = class extends J {
  constructor(s) {
    const { data: t, elements: e, parent: i } = s, n = !!i._commentManager;
    if (super(s, { isRenderable: !n && J._hasPopupData(t) }), this.elements = e, n && J._hasPopupData(t)) {
      const r = this.popup = this.#t();
      for (const a of e) a.popup = r;
    } else this.popup = null;
  }
  #t() {
    return new _a({
      container: this.container,
      color: this.data.color,
      titleObj: this.data.titleObj,
      modificationDate: this.data.modificationDate || this.data.creationDate,
      contentsObj: this.data.contentsObj,
      richText: this.data.richText,
      rect: this.data.rect,
      parentRect: this.data.parentRect || null,
      parent: this.parent,
      elements: this.elements,
      open: this.data.open,
      commentManager: this.parent._commentManager
    });
  }
  render() {
    const { container: s } = this;
    s.classList.add("popupAnnotation"), s.role = "comment";
    const t = this.popup = this.#t(), e = [];
    for (const i of this.elements)
      i.popup = t, i.container.ariaHasPopup = "dialog", e.push(i.data.id), i.addHighlightArea();
    return this.container.setAttribute("aria-controls", e.map((i) => `${qt}${i}`).join(",")), this.container;
  }
}, _a = class {
  #t = null;
  #e = this.#j.bind(this);
  #s = this.#w.bind(this);
  #i = this.#x.bind(this);
  #n = this.#G.bind(this);
  #a = null;
  #r = null;
  #o = null;
  #l = null;
  #h = null;
  #u = null;
  #d = null;
  #f = !1;
  #g = null;
  #m = null;
  #c = null;
  #p = null;
  #b = null;
  #y = null;
  #A = null;
  #v = null;
  #E = null;
  #S = null;
  #_ = !1;
  #C = null;
  #M = null;
  constructor({ container: s, color: t, elements: e, titleObj: i, modificationDate: n, contentsObj: r, richText: a, parent: o, rect: l, parentRect: h, open: c, commentManager: d = null }) {
    this.#r = s, this.#E = i, this.#o = r, this.#v = a, this.#u = o, this.#a = t, this.#A = l, this.#d = h, this.#h = e, this.#t = d, this.#C = e[0], this.#l = rs.toDateObject(n), this.trigger = e.flatMap((u) => u.getElementsToTriggerPopup()), d || (this.#k(), this.#r.hidden = !0, c && this.#G());
  }
  #k() {
    if (this.#m) return;
    this.#m = new AbortController();
    const { signal: s } = this.#m;
    for (const t of this.trigger)
      t.addEventListener("click", this.#n, { signal: s }), t.addEventListener("pointerenter", this.#i, { signal: s }), t.addEventListener("pointerleave", this.#s, { signal: s }), t.classList.add("popupTriggerArea");
    for (const t of this.#h) t.container?.addEventListener("keydown", this.#e, { signal: s });
  }
  #T() {
    const s = this.#h.find((t) => t.hasCommentButton);
    s && (this.#b = s._normalizePoint(s.commentButtonPosition));
  }
  renderCommentButton() {
    if (this.#p) {
      this.#p.parentNode || this.#C.container.after(this.#p);
      return;
    }
    if (this.#b || this.#T(), !this.#b) return;
    const { signal: s } = this.#m = new AbortController(), t = this.#C.hasOwnCommentButton, e = () => {
      this.#t.toggleCommentPopup(this, !0, void 0, !t);
    }, i = () => {
      this.#t.toggleCommentPopup(this, !1, !0, !t);
    }, n = () => {
      this.#t.toggleCommentPopup(this, !1, !1);
    };
    if (t) {
      this.#p = this.#C.container;
      for (const r of this.trigger)
        r.ariaHasPopup = "dialog", r.ariaControls = "commentPopup", r.addEventListener("keydown", this.#e, { signal: s }), r.addEventListener("click", e, { signal: s }), r.addEventListener("pointerenter", i, { signal: s }), r.addEventListener("pointerleave", n, { signal: s }), r.classList.add("popupTriggerArea");
    } else {
      const r = this.#p = document.createElement("button");
      r.className = "annotationCommentButton";
      const a = this.#C.container;
      r.style.zIndex = parseInt(a.style.zIndex, 10) + 1, r.tabIndex = 0, r.ariaHasPopup = "dialog", r.ariaControls = "commentPopup", r.setAttribute("data-l10n-id", "pdfjs-show-comment-button"), this.#D(), this.#I(), r.addEventListener("keydown", this.#e, { signal: s }), r.addEventListener("click", e, { signal: s }), r.addEventListener("pointerenter", i, { signal: s }), r.addEventListener("pointerleave", n, { signal: s }), a.after(r);
    }
  }
  #I() {
    if (this.#C.extraPopupElement && !this.#C.editor) return;
    this.#p || this.renderCommentButton();
    const [s, t] = this.#b, { style: e } = this.#p;
    e.left = `calc(${s}%)`, e.top = `calc(${t}% - var(--comment-button-dim))`;
  }
  #D() {
    this.#C.extraPopupElement || (this.#p || this.renderCommentButton(), this.#p.style.backgroundColor = this.commentButtonColor || "");
  }
  get commentButtonColor() {
    const { color: s, opacity: t } = this.#C.commentData;
    return s ? this.#u._commentManager.makeCommentColor(s, t) : null;
  }
  focusCommentButton() {
    setTimeout(() => {
      this.#p?.focus();
    }, 0);
  }
  getData() {
    const { richText: s, color: t, opacity: e, creationDate: i, modificationDate: n } = this.#C.commentData;
    return {
      contentsObj: { str: this.comment },
      richText: s,
      color: t,
      opacity: e,
      creationDate: i,
      modificationDate: n
    };
  }
  get elementBeforePopup() {
    return this.#p;
  }
  get comment() {
    return this.#M ||= this.#C.commentText, this.#M;
  }
  set comment(s) {
    s !== this.comment && (this.#C.commentText = this.#M = s);
  }
  focus() {
    this.#C.container?.focus();
  }
  get parentBoundingClientRect() {
    return this.#C.layer.getBoundingClientRect();
  }
  setCommentButtonStates({ selected: s, hasPopup: t }) {
    this.#p && (this.#p.classList.toggle("selected", s), this.#p.ariaExpanded = t);
  }
  setSelectedCommentButton(s) {
    this.#p.classList.toggle("selected", s);
  }
  get commentPopupPosition() {
    if (this.#y) return this.#y;
    const { x: s, y: t, height: e } = this.#p.getBoundingClientRect(), { x: i, y: n, width: r, height: a } = this.#C.layer.getBoundingClientRect();
    return [(s - i) / r, (t + e - n) / a];
  }
  set commentPopupPosition(s) {
    this.#y = s;
  }
  hasDefaultPopupPosition() {
    return this.#y === null;
  }
  get commentButtonPosition() {
    return this.#b;
  }
  get commentButtonWidth() {
    return this.#p.getBoundingClientRect().width / this.parentBoundingClientRect.width;
  }
  editComment(s) {
    const [t, e] = this.#y || this.commentButtonPosition.map((l) => l / 100), i = this.parentBoundingClientRect, { x: n, y: r, width: a, height: o } = i;
    this.#t.showDialog(null, this, n + t * a, r + e * o, {
      ...s,
      parentDimensions: i
    });
  }
  render() {
    if (this.#g) return;
    const s = this.#g = document.createElement("div");
    if (s.className = "popup", this.#a) {
      const e = s.style.outlineColor = _.makeHexColor(...this.#a);
      s.style.backgroundColor = `color-mix(in srgb, ${e} 30%, white)`;
    }
    const t = document.createElement("span");
    if (t.className = "header", this.#E?.str) {
      const e = document.createElement("span");
      e.className = "title", t.append(e), { dir: e.dir, str: e.textContent } = this.#E;
    }
    if (s.append(t), this.#l) {
      const e = document.createElement("time");
      e.className = "popupDate", e.setAttribute("data-l10n-id", "pdfjs-annotation-date-time-string"), e.setAttribute("data-l10n-args", JSON.stringify({ dateObj: this.#l.valueOf() })), e.dateTime = this.#l.toISOString(), t.append(e);
    }
    Ei({
      html: this.#L || this.#o.str,
      dir: this.#o?.dir,
      className: "popupContent"
    }, s), this.#r.append(s);
  }
  get #L() {
    const s = this.#v, t = this.#o;
    return s?.str && (!t?.str || t.str === s.str) && this.#v.html || null;
  }
  get #U() {
    return this.#L?.attributes?.style?.fontSize || 0;
  }
  get #F() {
    return this.#L?.attributes?.style?.color || null;
  }
  #R(s) {
    const t = [], e = {
      str: s,
      html: {
        name: "div",
        attributes: { dir: "auto" },
        children: [{
          name: "p",
          children: t
        }]
      }
    }, i = { style: {
      color: this.#F,
      fontSize: this.#U ? `calc(${this.#U}px * var(--total-scale-factor))` : ""
    } };
    for (const n of s.split(`
`)) t.push({
      name: "span",
      value: n,
      attributes: i
    });
    return e;
  }
  #j(s) {
    s.altKey || s.shiftKey || s.ctrlKey || s.metaKey || (s.key === "Enter" || s.key === "Escape" && this.#f) && this.#G();
  }
  updateEdited({ rect: s, popup: t, deleted: e }) {
    if (this.#t) {
      e ? (this.remove(), this.#M = null) : t && (t.deleted ? this.remove() : (this.#D(), this.#M = t.text)), s && (this.#b = null, this.#T(), this.#I());
      return;
    }
    if (e || t?.deleted) {
      this.remove();
      return;
    }
    this.#k(), this.#S ||= {
      contentsObj: this.#o,
      richText: this.#v
    }, s && (this.#c = null), t && t.text && (this.#v = this.#R(t.text), this.#l = rs.toDateObject(t.date), this.#o = null), this.#g?.remove(), this.#g = null;
  }
  resetEdited() {
    this.#S && ({ contentsObj: this.#o, richText: this.#v } = this.#S, this.#S = null, this.#g?.remove(), this.#g = null, this.#c = null);
  }
  remove() {
    if (this.#m?.abort(), this.#m = null, this.#g?.remove(), this.#g = null, this.#_ = !1, this.#f = !1, this.#p?.remove(), this.#p = null, this.trigger) for (const s of this.trigger) s.classList.remove("popupTriggerArea");
  }
  #N() {
    if (this.#c !== null) return;
    const { page: { view: s }, viewport: { rawDims: { pageWidth: t, pageHeight: e, pageX: i, pageY: n } } } = this.#u;
    let r = !!this.#d, a = r ? this.#d : this.#A;
    for (const u of this.#h) if (!a || _.intersect(u.data.rect, a) !== null) {
      a = u.data.rect, r = !0;
      break;
    }
    const o = _.normalizeRect([
      a[0],
      s[3] - a[1] + s[1],
      a[2],
      s[3] - a[3] + s[1]
    ]), l = r ? a[2] - a[0] + 5 : 0, h = o[0] + l, c = o[1];
    this.#c = [100 * (h - i) / t, 100 * (c - n) / e];
    const { style: d } = this.#r;
    d.left = `${this.#c[0]}%`, d.top = `${this.#c[1]}%`;
  }
  #G() {
    if (this.#t) {
      this.#t.toggleCommentPopup(this, !1);
      return;
    }
    this.#f = !this.#f, this.#f ? (this.#x(), this.#r.addEventListener("click", this.#n), this.#r.addEventListener("keydown", this.#e)) : (this.#w(), this.#r.removeEventListener("click", this.#n), this.#r.removeEventListener("keydown", this.#e));
  }
  #x() {
    this.#g || this.render(), this.isVisible ? this.#f && this.#r.classList.add("focused") : (this.#N(), this.#r.hidden = !1, this.#r.style.zIndex = parseInt(this.#r.style.zIndex, 10) + 1e3);
  }
  #w() {
    this.#r.classList.remove("focused"), !(this.#f || !this.isVisible) && (this.#r.hidden = !0, this.#r.style.zIndex = parseInt(this.#r.style.zIndex, 10) - 1e3);
  }
  forceHide() {
    this.#_ = this.isVisible, this.#_ && (this.#r.hidden = !0);
  }
  maybeShow() {
    this.#t || (this.#k(), this.#_ && (this.#g || this.#x(), this.#_ = !1, this.#r.hidden = !1));
  }
  get isVisible() {
    return !this.#t && this.#r.hidden === !1;
  }
}, Qi = class extends J {
  constructor(s) {
    super(s, {
      isRenderable: !0,
      ignoreBorder: !0
    }), this.textContent = s.data.textContent, this.textPosition = s.data.textPosition, this.annotationEditorType = O.FREETEXT;
  }
  render() {
    if (this.container.classList.add("freeTextAnnotation"), this.textContent) {
      const s = this.contentElement = document.createElement("div");
      s.classList.add("annotationTextContent"), s.setAttribute("role", "comment");
      for (const t of this.textContent) {
        const e = document.createElement("span");
        e.textContent = t, s.append(e);
      }
      this.container.append(s);
    }
    return !this.data.popupRef && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this._editOnDoubleClick(), this.container;
  }
}, Ca = class extends J {
  #t = null;
  constructor(s) {
    super(s, {
      isRenderable: !0,
      ignoreBorder: !0
    });
  }
  render() {
    this.container.classList.add("lineAnnotation");
    const { data: s, width: t, height: e } = this, i = this.svgFactory.create(t, e, !0), n = this.#t = this.svgFactory.createElement("svg:line");
    return n.setAttribute("x1", s.rect[2] - s.lineCoordinates[0]), n.setAttribute("y1", s.rect[3] - s.lineCoordinates[1]), n.setAttribute("x2", s.rect[2] - s.lineCoordinates[2]), n.setAttribute("y2", s.rect[3] - s.lineCoordinates[3]), n.setAttribute("stroke-width", s.borderStyle.width || 1), n.setAttribute("stroke", "transparent"), n.setAttribute("fill", "transparent"), i.append(n), this.container.append(i), !s.popupRef && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container;
  }
  getElementsToTriggerPopup() {
    return this.#t;
  }
  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
}, xa = class extends J {
  #t = null;
  constructor(s) {
    super(s, {
      isRenderable: !0,
      ignoreBorder: !0
    });
  }
  render() {
    this.container.classList.add("squareAnnotation");
    const { data: s, width: t, height: e } = this, i = this.svgFactory.create(t, e, !0), n = s.borderStyle.width, r = this.#t = this.svgFactory.createElement("svg:rect");
    return r.setAttribute("x", n / 2), r.setAttribute("y", n / 2), r.setAttribute("width", t - n), r.setAttribute("height", e - n), r.setAttribute("stroke-width", n || 1), r.setAttribute("stroke", "transparent"), r.setAttribute("fill", "transparent"), i.append(r), this.container.append(i), !s.popupRef && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container;
  }
  getElementsToTriggerPopup() {
    return this.#t;
  }
  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
}, Ta = class extends J {
  #t = null;
  constructor(s) {
    super(s, {
      isRenderable: !0,
      ignoreBorder: !0
    });
  }
  render() {
    this.container.classList.add("circleAnnotation");
    const { data: s, width: t, height: e } = this, i = this.svgFactory.create(t, e, !0), n = s.borderStyle.width, r = this.#t = this.svgFactory.createElement("svg:ellipse");
    return r.setAttribute("cx", t / 2), r.setAttribute("cy", e / 2), r.setAttribute("rx", t / 2 - n / 2), r.setAttribute("ry", e / 2 - n / 2), r.setAttribute("stroke-width", n || 1), r.setAttribute("stroke", "transparent"), r.setAttribute("fill", "transparent"), i.append(r), this.container.append(i), !s.popupRef && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container;
  }
  getElementsToTriggerPopup() {
    return this.#t;
  }
  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
}, Ji = class extends J {
  #t = null;
  constructor(s) {
    super(s, {
      isRenderable: !0,
      ignoreBorder: !0
    }), this.containerClassName = "polylineAnnotation", this.svgElementName = "svg:polyline";
  }
  render() {
    this.container.classList.add(this.containerClassName);
    const { data: { rect: s, vertices: t, borderStyle: e, popupRef: i }, width: n, height: r } = this;
    if (!t) return this.container;
    const a = this.svgFactory.create(n, r, !0);
    let o = [];
    for (let h = 0, c = t.length; h < c; h += 2) {
      const d = t[h] - s[0], u = s[3] - t[h + 1];
      o.push(`${d},${u}`);
    }
    o = o.join(" ");
    const l = this.#t = this.svgFactory.createElement(this.svgElementName);
    return l.setAttribute("points", o), l.setAttribute("stroke-width", e.width || 1), l.setAttribute("stroke", "transparent"), l.setAttribute("fill", "transparent"), a.append(l), this.container.append(a), !i && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container;
  }
  getElementsToTriggerPopup() {
    return this.#t;
  }
  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
}, ka = class extends Ji {
  constructor(s) {
    super(s), this.containerClassName = "polygonAnnotation", this.svgElementName = "svg:polygon";
  }
}, Pa = class extends J {
  constructor(s) {
    super(s, {
      isRenderable: !0,
      ignoreBorder: !0
    });
  }
  render() {
    return this.container.classList.add("caretAnnotation"), !this.data.popupRef && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container;
  }
}, Ls = class extends J {
  #t = null;
  #e = [];
  constructor(s) {
    super(s, {
      isRenderable: !0,
      ignoreBorder: !0
    }), this.containerClassName = "inkAnnotation", this.svgElementName = "svg:polyline", this.annotationEditorType = this.data.it === "InkHighlight" ? O.HIGHLIGHT : O.INK;
  }
  #s(s, t) {
    switch (s) {
      case 90:
        return {
          transform: `rotate(90) translate(${-t[0]},${t[1]}) scale(1,-1)`,
          width: t[3] - t[1],
          height: t[2] - t[0]
        };
      case 180:
        return {
          transform: `rotate(180) translate(${-t[2]},${t[1]}) scale(1,-1)`,
          width: t[2] - t[0],
          height: t[3] - t[1]
        };
      case 270:
        return {
          transform: `rotate(270) translate(${-t[2]},${t[3]}) scale(1,-1)`,
          width: t[3] - t[1],
          height: t[2] - t[0]
        };
      default:
        return {
          transform: `translate(${-t[0]},${t[3]}) scale(1,-1)`,
          width: t[2] - t[0],
          height: t[3] - t[1]
        };
    }
  }
  render() {
    this.container.classList.add(this.containerClassName);
    const { data: { rect: s, rotation: t, inkLists: e, borderStyle: i, popupRef: n } } = this, { transform: r, width: a, height: o } = this.#s(t, s), l = this.svgFactory.create(a, o, !0), h = this.#t = this.svgFactory.createElement("svg:g");
    l.append(h), h.setAttribute("stroke-width", i.width || 1), h.setAttribute("stroke-linecap", "round"), h.setAttribute("stroke-linejoin", "round"), h.setAttribute("stroke-miterlimit", 10), h.setAttribute("stroke", "transparent"), h.setAttribute("fill", "transparent"), h.setAttribute("transform", r);
    for (const c of e) {
      const d = this.svgFactory.createElement(this.svgElementName);
      this.#e.push(d), d.setAttribute("points", c.join(",")), h.append(d);
    }
    return !n && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container.append(l), this._editOnDoubleClick(), this.container;
  }
  updateEdited(s) {
    super.updateEdited(s);
    const { thickness: t, points: e, rect: i } = s, n = this.#t;
    if (t >= 0 && n.setAttribute("stroke-width", t || 1), e) for (let r = 0, a = this.#e.length; r < a; r++) this.#e[r].setAttribute("points", e[r].join(","));
    if (i) {
      const { transform: r, width: a, height: o } = this.#s(this.data.rotation, i);
      n.parentElement.setAttribute("viewBox", `0 0 ${a} ${o}`), n.setAttribute("transform", r);
    }
  }
  getElementsToTriggerPopup() {
    return this.#e;
  }
  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
}, Zi = class extends J {
  constructor(s) {
    super(s, {
      isRenderable: !0,
      ignoreBorder: !0,
      createQuadrilaterals: !0
    }), this.annotationEditorType = O.HIGHLIGHT;
  }
  render() {
    const { data: { overlaidText: s, popupRef: t } } = this;
    if (!t && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container.classList.add("highlightAnnotation"), this._editOnDoubleClick(), s) {
      const e = document.createElement("mark");
      e.classList.add("overlaidText"), e.textContent = s, this.container.append(e);
    }
    return this.container;
  }
}, Ma = class extends J {
  constructor(s) {
    super(s, {
      isRenderable: !0,
      ignoreBorder: !0,
      createQuadrilaterals: !0
    });
  }
  render() {
    const { data: { overlaidText: s, popupRef: t } } = this;
    if (!t && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container.classList.add("underlineAnnotation"), s) {
      const e = document.createElement("u");
      e.classList.add("overlaidText"), e.textContent = s, this.container.append(e);
    }
    return this.container;
  }
}, Da = class extends J {
  constructor(s) {
    super(s, {
      isRenderable: !0,
      ignoreBorder: !0,
      createQuadrilaterals: !0
    });
  }
  render() {
    const { data: { overlaidText: s, popupRef: t } } = this;
    if (!t && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container.classList.add("squigglyAnnotation"), s) {
      const e = document.createElement("u");
      e.classList.add("overlaidText"), e.textContent = s, this.container.append(e);
    }
    return this.container;
  }
}, Ia = class extends J {
  constructor(s) {
    super(s, {
      isRenderable: !0,
      ignoreBorder: !0,
      createQuadrilaterals: !0
    });
  }
  render() {
    const { data: { overlaidText: s, popupRef: t } } = this;
    if (!t && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this.container.classList.add("strikeoutAnnotation"), s) {
      const e = document.createElement("s");
      e.classList.add("overlaidText"), e.textContent = s, this.container.append(e);
    }
    return this.container;
  }
}, tn = class extends J {
  constructor(s) {
    super(s, {
      isRenderable: !0,
      ignoreBorder: !0
    }), this.annotationEditorType = O.STAMP;
  }
  render() {
    return this.container.classList.add("stampAnnotation"), this.container.setAttribute("role", "img"), !this.data.popupRef && this.hasPopupData && (this.hasOwnCommentButton = !0, this._createPopup()), this._editOnDoubleClick(), this.container;
  }
}, La = class extends J {
  #t = null;
  constructor(s) {
    super(s, { isRenderable: !0 });
    const { fileId: t, file: e } = this.data;
    this.filename = e.filename, this.content = e.content, this.fileId = t, this.linkService.eventBus?.dispatch("fileattachmentannotation", {
      source: this,
      attachmentId: this.fileId,
      ...e
    });
  }
  render() {
    this.container.classList.add("fileAttachmentAnnotation");
    const { container: s, data: t } = this;
    let e;
    t.hasAppearance || t.fillAlpha === 0 ? e = document.createElement("div") : (e = document.createElement("img"), e.src = `${this.imageResourcesPath}annotation-${/paperclip/i.test(t.name) ? "paperclip" : "pushpin"}.svg`, t.fillAlpha && t.fillAlpha < 1 && (e.style = `filter: opacity(${Math.round(t.fillAlpha * 100)}%);`)), e.addEventListener("dblclick", this.#e.bind(this)), this.#t = e;
    const { isMac: i } = z.platform;
    return s.addEventListener("keydown", (n) => {
      n.key === "Enter" && (i ? n.metaKey : n.ctrlKey) && this.#e();
    }), !t.popupRef && this.hasPopupData ? (this.hasOwnCommentButton = !0, this._createPopup()) : e.classList.add("popupTriggerArea"), s.append(e), s;
  }
  getElementsToTriggerPopup() {
    return this.#t;
  }
  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
  async #e() {
    const { fileId: s, filename: t, content: e } = this, i = await this.linkService.getAttachmentContent(s) || e;
    i && this.downloadManager?.openOrDownloadData(i, t);
  }
}, en = class extends J {
  #t = new AbortController();
  #e = null;
  #s = null;
  constructor(s) {
    super(s, { isRenderable: !!s.data.richMedia });
  }
  render() {
    this.container.classList.add("mediaAnnotation");
    const { filename: s } = this.data.richMedia, t = document.createElement("button");
    return t.className = "mediaPlayButton", t.type = "button", t.title = t.ariaLabel = s, t.addEventListener("click", () => this.#i(t), { signal: this.#t.signal }), this.container.append(t), this.container;
  }
  async #i(s) {
    const { fileId: t, filename: e, contentType: i } = this.data.richMedia;
    s.disabled = !0;
    let n;
    try {
      n = await this.linkService.getAttachmentContent(t);
    } catch {
      return;
    } finally {
      s.disabled = !1;
    }
    if (!n || !s.isConnected) return;
    const { signal: r } = this.#t, a = URL.createObjectURL(new Blob([n], { type: i }));
    this.#e = a;
    const o = i.startsWith("audio/"), l = document.createElement(o ? "audio" : "video");
    if (this.#s = l, l.className = "mediaContent", this._setBackgroundColor(l), l.src = a, l.title = e, l.controls = !0, l.autoplay = !0, l.tabIndex = 0, o) {
      let h = !1, c = !1;
      const d = () => {
        l.controls = h || c;
      };
      this.container.addEventListener("pointerenter", () => {
        h = !0, d();
      }, { signal: r }), this.container.addEventListener("pointerleave", () => {
        h = !1, d();
      }, { signal: r }), this.container.addEventListener("focusin", () => {
        c = !0, d();
      }, { signal: r }), this.container.addEventListener("focusout", () => {
        c = !1, d();
      }, { signal: r });
    }
    l.addEventListener("emptied", () => this.#n(a), {
      once: !0,
      signal: r
    }), s.replaceWith(l), l.play().catch(() => {
    });
  }
  #n(s = this.#e) {
    s && s === this.#e && (URL.revokeObjectURL(s), this.#e = null);
  }
  destroy() {
    this.#t.abort(), this.#s && (this.#s.pause(), this.#s.removeAttribute("src"), this.#s.load(), this.#s = null), this.#n();
  }
}, Fa = class sn {
  #t = null;
  #e = null;
  #s = null;
  #i = /* @__PURE__ */ new Map();
  #n = null;
  #a = null;
  #r = [];
  #o = !1;
  zIndex = 0;
  constructor({ div: t, accessibilityManager: e, annotationCanvasMap: i, annotationEditorUIManager: n, page: r, viewport: a, structTreeLayer: o, commentManager: l, linkService: h, annotationStorage: c }) {
    this.div = t, this.#t = e, this.#e = i, this.#n = o || null, this.#a = h || null, this.#s = c || new Ms(), this.page = r, this.viewport = a, this._annotationEditorUIManager = n, this._commentManager = l || null;
  }
  hasEditableAnnotations() {
    return this.#i.size > 0;
  }
  async render(t) {
    const { annotations: e, optionalContentConfig: i } = t, n = this.div;
    Ut(n, this.viewport);
    const r = /* @__PURE__ */ new Map(), a = [], o = {
      data: null,
      layer: n,
      linkService: this.#a,
      downloadManager: t.downloadManager,
      imageResourcesPath: t.imageResourcesPath || "",
      renderForms: t.renderForms !== !1,
      svgFactory: new Pe(),
      annotationStorage: this.#s,
      enableComment: t.enableComment === !0,
      enableScripting: t.enableScripting === !0,
      hasJSActions: t.hasJSActions,
      fieldObjects: t.fieldObjects,
      parent: this,
      elements: null
    };
    for (const l of e) {
      if (l.noHTML) continue;
      const h = l.annotationType === q.POPUP;
      if (h) {
        const u = r.get(l.id);
        if (!u) continue;
        if (!this._commentManager) {
          a.push(l);
          continue;
        }
        o.elements = u;
      } else if (l.rect[2] === l.rect[0] || l.rect[3] === l.rect[1]) continue;
      o.data = l;
      const c = Je.create(o);
      if (!c.isRenderable) continue;
      h || (this.#r.push(c), l.popupRef && r.getOrInsertComputed(l.popupRef, Zt).push(c));
      const d = c.render();
      l.hidden && (d.style.visibility = "hidden"), c.updateOC(i), c._isEditable && (this.#i.set(c.data.id, c), this._annotationEditorUIManager?.renderAnnotationElement(c));
    }
    await this.#l();
    for (const l of a) {
      const h = o.elements = r.get(l.id);
      o.data = l;
      const c = Je.create(o);
      if (!c.isRenderable) continue;
      const d = c.render();
      c.contentElement.id = `${qt}${l.id}`, l.hidden && (d.style.visibility = "hidden"), h.at(-1).container.after(d);
    }
    this.#h();
  }
  async #l() {
    if (this.#r.length === 0) return;
    this.div.replaceChildren();
    const t = [];
    if (!this.#o) {
      this.#o = !0;
      for (const { contentElement: i, data: { hidden: n, id: r, oc: a } } of this.#r) {
        const o = i.id = `${qt}${r}`, l = i.localName === "a" && !n && !a;
        t.push(this.#n?.getAriaAttributes(o, { enableLinkOwnership: l }).then((h) => {
          if (h) for (const [c, d] of h) i.setAttribute(c, d);
        }));
      }
    }
    this.#r.sort(({ data: { rect: [i, n, r, a] } }, { data: { rect: [o, l, h, c] } }) => {
      if (i === r && n === a) return 1;
      if (o === h && l === c) return -1;
      const d = a, u = n, p = (n + a) / 2, f = c, m = l, g = (l + c) / 2;
      return p >= f && g <= u ? -1 : g >= d && p <= m ? 1 : (i + r) / 2 - (o + h) / 2;
    });
    const e = document.createDocumentFragment();
    for (const i of this.#r)
      e.append(i.container), this._commentManager ? (i.extraPopupElement?.popup || i.popup)?.renderCommentButton() : i.extraPopupElement && e.append(i.extraPopupElement.render());
    if (this.div.append(e), await Promise.all(t), this.#t) {
      const i = await this.#n?.getAnnotationIds();
      for (const { contentElement: n } of this.#r)
        i?.has(n.id) || this.#t.addPointerInTextLayer(n, !1);
    }
  }
  async addLinkAnnotations(t) {
    const e = {
      data: null,
      layer: this.div,
      linkService: this.#a,
      svgFactory: new Pe(),
      parent: this
    };
    for (const i of t) {
      i.borderStyle ||= sn._defaultBorderStyle, e.data = i;
      const n = Je.create(e);
      n.isRenderable && (n.render(), n.contentElement.id = `${qt}${i.id}`, this.#r.push(n));
    }
    await this.#l();
  }
  update({ viewport: t, optionalContentConfig: e }) {
    const i = this.div;
    this.viewport = t, Ut(i, { rotation: t.rotation });
    for (const n of this.#r) n.updateOC(e);
    this.#h(), i.hidden = !1;
  }
  destroy() {
    for (const t of this.#r)
      t.destroy?.(), this.#t?.removePointerInTextLayer(t.contentElement);
    this.#r.length = 0, this.#i.clear(), this.div.replaceChildren();
  }
  #h() {
    if (!this.#e) return;
    const t = this.div;
    for (const [e, i] of this.#e) {
      const n = t.querySelector(`[data-annotation-id="${e}"]`);
      if (!n) continue;
      if (Array.isArray(i)) for (const h of i)
        h.className = "annotationContent", h.ariaHidden = !0;
      else
        i.className = "annotationContent", i.ariaHidden = !0;
      const r = [];
      for (const h of n.children) h.nodeName === "CANVAS" && r.push(h);
      for (const h of r) h.remove();
      const a = Array.isArray(i) ? i[0] : i, { firstChild: o } = n;
      if (o ? o.classList.contains("annotationContent") ? o.after(a) : o.before(a) : n.append(a), Array.isArray(i)) {
        let h = a;
        for (let c = 1, d = i.length; c < d; c++)
          h.after(i[c]), h = i[c];
      }
      this.#e.delete(e);
      const l = this.#i.get(e);
      l && (l._hasNoCanvas ? (this._annotationEditorUIManager?.setMissingCanvas(e, n.id, i), l._hasNoCanvas = !1) : l.canvas = i);
    }
  }
  refreshCanvases() {
    this.#h();
  }
  getEditableAnnotations() {
    return this.#i.values();
  }
  getEditableAnnotation(t) {
    return this.#i.get(t);
  }
  addFakeAnnotation(t) {
    const { div: e } = this, { id: i, rotation: n } = t, r = new ma({
      data: {
        id: i,
        rect: t.getPDFRect(),
        rotation: n
      },
      editor: t,
      layer: e,
      parent: this,
      enableComment: !!this._commentManager,
      linkService: this.#a,
      annotationStorage: this.#s
    });
    return r.render(), r.contentElement.id = `${qt}${i}`, r.createOrUpdatePopup(), this.#r.push(r), r;
  }
  removeAnnotation(t) {
    const e = this.#r.findIndex((n) => n.data.id === t);
    if (e < 0) return;
    const [i] = this.#r.splice(e, 1);
    this.#t?.removePointerInTextLayer(i.contentElement);
  }
  updateFakeAnnotations(t) {
    if (t.length !== 0) {
      for (const e of t) e.updateFakeAnnotationElement(this);
      this.#l();
    }
  }
  togglePointerEvents(t = !1) {
    this.div.classList.toggle("disabled", !t);
  }
  static get _defaultBorderStyle() {
    return P(this, "_defaultBorderStyle", Object.freeze({
      width: 1,
      rawWidth: 1,
      style: Xt.SOLID,
      dashArray: [3],
      horizontalCornerRadius: 0,
      verticalCornerRadius: 0
    }));
  }
}, ye = /\r\n?|\n/g, Oa = class rt extends V {
  #t = "";
  #e = `${this.id}-editor`;
  #s = null;
  #i;
  _colorPicker = null;
  static _freeTextDefaultContent = "";
  static _internalPadding = 0;
  static _defaultColor = null;
  static _defaultFontSize = 10;
  static get _keyboardManager() {
    const t = rt.prototype, e = (r) => r.isEmpty(), i = oe.TRANSLATE_SMALL, n = oe.TRANSLATE_BIG;
    return P(this, "_keyboardManager", new de([
      [
        [
          "ctrl+s",
          "mac+meta+s",
          "ctrl+p",
          "mac+meta+p"
        ],
        t.commitOrRemove,
        { bubbles: !0 }
      ],
      [["ctrl+Enter", "mac+meta+Enter"], t.commitOrRemove],
      [["Escape"], t.commitOrRemove],
      [
        ["ArrowLeft"],
        t._translateEmpty,
        {
          args: [-i, 0],
          checker: e
        }
      ],
      [
        ["ctrl+ArrowLeft", "mac+shift+ArrowLeft"],
        t._translateEmpty,
        {
          args: [-n, 0],
          checker: e
        }
      ],
      [
        ["ArrowRight"],
        t._translateEmpty,
        {
          args: [i, 0],
          checker: e
        }
      ],
      [
        ["ctrl+ArrowRight", "mac+shift+ArrowRight"],
        t._translateEmpty,
        {
          args: [n, 0],
          checker: e
        }
      ],
      [
        ["ArrowUp"],
        t._translateEmpty,
        {
          args: [0, -i],
          checker: e
        }
      ],
      [
        ["ctrl+ArrowUp", "mac+shift+ArrowUp"],
        t._translateEmpty,
        {
          args: [0, -n],
          checker: e
        }
      ],
      [
        ["ArrowDown"],
        t._translateEmpty,
        {
          args: [0, i],
          checker: e
        }
      ],
      [
        ["ctrl+ArrowDown", "mac+shift+ArrowDown"],
        t._translateEmpty,
        {
          args: [0, n],
          checker: e
        }
      ]
    ]));
  }
  static _type = "freetext";
  static _editorType = O.FREETEXT;
  constructor(t) {
    super({
      ...t,
      name: "freeTextEditor"
    }), this.color = t.color || rt._defaultColor || V._defaultLineColor, this.#i = t.fontSize || rt._defaultFontSize, this.annotationElementId || this._uiManager.a11yAlert(V._l10nAlert.freetext), this.canAddComment = !1;
  }
  static initialize(t, e) {
    V.initialize(t, e);
    const i = getComputedStyle(document.documentElement);
    this._internalPadding = parseFloat(i.getPropertyValue("--freetext-padding"));
  }
  static updateDefaultParams(t, e) {
    switch (t) {
      case N.FREETEXT_SIZE:
        rt._defaultFontSize = e;
        break;
      case N.FREETEXT_COLOR:
        rt._defaultColor = e;
    }
  }
  updateParams(t, e) {
    switch (t) {
      case N.FREETEXT_SIZE:
        this.#n(e);
        break;
      case N.FREETEXT_COLOR:
        this.#a(e);
    }
  }
  static get defaultPropertiesToUpdate() {
    return [[N.FREETEXT_SIZE, rt._defaultFontSize], [N.FREETEXT_COLOR, rt._defaultColor || V._defaultLineColor]];
  }
  get propertiesToUpdate() {
    return [[N.FREETEXT_SIZE, this.#i], [N.FREETEXT_COLOR, this.color]];
  }
  get toolbarButtons() {
    return this._colorPicker ||= new Ki(this), [["colorPicker", this._colorPicker]];
  }
  get colorType() {
    return N.FREETEXT_COLOR;
  }
  #n(t) {
    const e = (n) => {
      this.editorDiv.style.fontSize = `calc(${n}px * var(--total-scale-factor))`, this.translate(0, -(n - this.#i) * this.parentScale), this.#i = n, this.#o();
    }, i = this.#i;
    this.addCommands({
      cmd: e.bind(this, t),
      undo: e.bind(this, i),
      post: this._uiManager.updateUI.bind(this._uiManager, this),
      mustExec: !0,
      type: N.FREETEXT_SIZE,
      overwriteIfSameType: !0,
      keepUndo: !0
    });
  }
  onUpdatedColor() {
    this.editorDiv.style.color = this.color, this._colorPicker?.update(this.color), super.onUpdatedColor();
  }
  #a(t) {
    const e = (n) => {
      this.color = n, this.onUpdatedColor();
    }, i = this.color;
    this.addCommands({
      cmd: e.bind(this, t),
      undo: e.bind(this, i),
      post: this._uiManager.updateUI.bind(this._uiManager, this),
      mustExec: !0,
      type: N.FREETEXT_COLOR,
      overwriteIfSameType: !0,
      keepUndo: !0
    });
  }
  _translateEmpty(t, e) {
    this._uiManager.translateSelectedEditors(t, e, !0);
  }
  getInitialTranslation() {
    const t = this.parentScale;
    return [-rt._internalPadding * t, -(rt._internalPadding + this.#i) * t];
  }
  rebuild() {
    this.parent && (super.rebuild(), this.div !== null && (this.isAttachedToDOM || this.parent.add(this)));
  }
  enableEditMode() {
    if (!super.enableEditMode()) return !1;
    this.overlayDiv.classList.remove("enabled"), this.editorDiv.contentEditable = !0, this._isDraggable = !1, this.div.removeAttribute("aria-activedescendant"), this.#s = new AbortController();
    const t = this._uiManager.combinedSignal(this.#s);
    return this.editorDiv.addEventListener("keydown", this.editorDivKeydown.bind(this), { signal: t }), this.editorDiv.addEventListener("focus", this.editorDivFocus.bind(this), { signal: t }), this.editorDiv.addEventListener("blur", this.editorDivBlur.bind(this), { signal: t }), this.editorDiv.addEventListener("input", this.editorDivInput.bind(this), { signal: t }), this.editorDiv.addEventListener("paste", this.editorDivPaste.bind(this), { signal: t }), !0;
  }
  disableEditMode() {
    return super.disableEditMode() ? (this.overlayDiv.classList.add("enabled"), this.editorDiv.contentEditable = !1, this.div.setAttribute("aria-activedescendant", this.#e), this._isDraggable = !0, this.#s?.abort(), this.#s = null, this.div.focus({ preventScroll: !0 }), this.isEditing = !1, this.parent.div.classList.add("freetextEditing"), !0) : !1;
  }
  focusin(t) {
    this._focusEventsAllowed && (super.focusin(t), t.target !== this.editorDiv && this.editorDiv.focus());
  }
  onceAdded(t) {
    this.width || (this.enableEditMode(), t && this.editorDiv.focus(), this._initialOptions?.isCentered && this.center(), this._initialOptions = null);
  }
  isEmpty() {
    return !this.editorDiv || this.editorDiv.innerText.trim() === "";
  }
  remove() {
    this.isEditing = !1, this.parent && (this.parent.setEditingState(!0), this.parent.div.classList.add("freetextEditing")), super.remove();
  }
  #r() {
    const t = [];
    this.editorDiv.normalize();
    let e = null;
    for (const i of this.editorDiv.childNodes)
      e?.nodeType === Node.TEXT_NODE && i.nodeName === "BR" || (t.push(rt.#l(i)), e = i);
    return t.join(`
`);
  }
  #o() {
    const [t, e] = this.parentDimensions;
    let i;
    if (this.isAttachedToDOM) i = this.div.getBoundingClientRect();
    else {
      const { currentLayer: n, div: r } = this, a = r.style.display, o = r.classList.contains("hidden");
      r.classList.remove("hidden"), r.style.display = "hidden", n.div.append(this.div), i = r.getBoundingClientRect(), r.remove(), r.style.display = a, r.classList.toggle("hidden", o);
    }
    this.rotation % 180 === this.parentRotation % 180 ? (this.width = i.width / t, this.height = i.height / e) : (this.width = i.height / t, this.height = i.width / e), this.fixAndSetPosition();
  }
  commit() {
    if (!this.isInEditMode()) return;
    super.commit(), this.disableEditMode();
    const t = this.#t, e = this.#t = this.#r().trimEnd();
    if (t === e) return;
    const i = (n) => {
      if (this.#t = n, !n) {
        this.remove();
        return;
      }
      this.#h(), this._uiManager.rebuild(this), this.#o();
    };
    this.addCommands({
      cmd: () => {
        i(e);
      },
      undo: () => {
        i(t);
      },
      mustExec: !1
    }), this.#o();
  }
  shouldGetKeyboardEvents() {
    return this.isInEditMode();
  }
  enterInEditMode() {
    this.enableEditMode(), this.editorDiv.focus();
  }
  keydown(t) {
    t.target === this.div && t.key === "Enter" && (this.enterInEditMode(), t.preventDefault());
  }
  editorDivKeydown(t) {
    rt._keyboardManager.exec(this, t);
  }
  editorDivFocus(t) {
    this.isEditing = !0;
  }
  editorDivBlur(t) {
    this.isEditing = !1;
  }
  editorDivInput(t) {
    this.parent.div.classList.toggle("freetextEditing", this.isEmpty());
  }
  disableEditing() {
    this.editorDiv.setAttribute("role", "comment"), this.editorDiv.removeAttribute("aria-multiline");
  }
  enableEditing() {
    this.editorDiv.setAttribute("role", "textbox"), this.editorDiv.setAttribute("aria-multiline", !0);
  }
  get canChangeContent() {
    return !0;
  }
  render() {
    if (this.div) return this.div;
    let t, e;
    (this._isCopy || this.annotationElementId) && (t = this.x, e = this.y), super.render(), this.editorDiv = document.createElement("div"), this.editorDiv.className = "internal", this.editorDiv.setAttribute("id", this.#e), this.editorDiv.setAttribute("data-l10n-id", "pdfjs-free-text2"), this.editorDiv.setAttribute("data-l10n-attrs", "default-content"), this.enableEditing(), this.editorDiv.contentEditable = !0;
    const { style: i } = this.editorDiv;
    if (i.fontSize = `calc(${this.#i}px * var(--total-scale-factor))`, i.color = this.color, this.div.append(this.editorDiv), this.overlayDiv = document.createElement("div"), this.overlayDiv.classList.add("overlay", "enabled"), this.div.append(this.overlayDiv), this._isCopy || this.annotationElementId) {
      const [n, r] = this.parentDimensions;
      if (this.annotationElementId) {
        const { position: a } = this._initialData;
        let [o, l] = this.getInitialTranslation();
        [o, l] = this.pageTranslationToScreen(o, l);
        const [h, c] = this.pageDimensions, [d, u] = this.pageTranslation;
        let p, f;
        switch (this.rotation) {
          case 0:
            p = t + (a[0] - d) / h, f = e + this.height - (a[1] - u) / c;
            break;
          case 90:
            p = t + (a[0] - d) / h, f = e - (a[1] - u) / c, [o, l] = [l, -o];
            break;
          case 180:
            p = t - this.width + (a[0] - d) / h, f = e - (a[1] - u) / c, [o, l] = [-o, -l];
            break;
          case 270:
            p = t + (a[0] - d - this.height * c) / h, f = e + (a[1] - u - this.width * h) / c, [o, l] = [-l, o];
        }
        this.setAt(p * n, f * r, o, l);
      } else this._moveAfterPaste(t, e);
      this.#h(), this._isDraggable = !0, this.editorDiv.contentEditable = !1;
    } else
      this._isDraggable = !1, this.editorDiv.contentEditable = !0;
    return this.div;
  }
  static #l(t) {
    return (t.nodeType === Node.TEXT_NODE ? t.nodeValue : t.innerText).replaceAll(ye, "");
  }
  editorDivPaste(t) {
    const e = t.clipboardData || window.clipboardData, { types: i } = e;
    if (i.length === 1 && i[0] === "text/plain") return;
    t.preventDefault();
    const n = rt.#d(e.getData("text") || "").replaceAll(ye, `
`);
    if (!n) return;
    const r = window.getSelection();
    if (!r.rangeCount) return;
    this.editorDiv.normalize(), r.deleteFromDocument();
    const a = r.getRangeAt(0);
    if (!n.includes(`
`)) {
      a.insertNode(document.createTextNode(n)), this.editorDiv.normalize(), r.collapseToStart();
      return;
    }
    const { startContainer: o, startOffset: l } = a, h = [], c = [];
    if (o.nodeType === Node.TEXT_NODE) {
      const p = o.parentElement;
      if (c.push(o.nodeValue.slice(l).replaceAll(ye, "")), p !== this.editorDiv) {
        let f = h;
        for (const m of this.editorDiv.childNodes) {
          if (m === p) {
            f = c;
            continue;
          }
          f.push(rt.#l(m));
        }
      }
      h.push(o.nodeValue.slice(0, l).replaceAll(ye, ""));
    } else if (o === this.editorDiv) {
      let p = h, f = 0;
      for (const m of this.editorDiv.childNodes)
        f++ === l && (p = c), p.push(rt.#l(m));
    }
    this.#t = `${h.join(`
`)}${n}${c.join(`
`)}`, this.#h();
    const d = new Range();
    let u = Math.sumPrecise(h.map((p) => p.length));
    for (const { firstChild: p } of this.editorDiv.childNodes) if (p.nodeType === Node.TEXT_NODE) {
      const f = p.nodeValue.length;
      if (u <= f) {
        d.setStart(p, u), d.setEnd(p, u);
        break;
      }
      u -= f;
    }
    r.removeAllRanges(), r.addRange(d);
  }
  #h() {
    if (this.editorDiv.replaceChildren(), !!this.#t)
      for (const t of this.#t.split(`
`)) {
        const e = document.createElement("div");
        e.append(t ? document.createTextNode(t) : document.createElement("br")), this.editorDiv.append(e);
      }
  }
  #u() {
    return this.#t.replaceAll(" ", " ");
  }
  static #d(t) {
    return t.replaceAll(" ", " ");
  }
  get contentDiv() {
    return this.editorDiv;
  }
  getPDFRect() {
    const t = rt._internalPadding * this.parentScale;
    return this.getRect(t, t);
  }
  static async deserialize(t, e, i) {
    let n = null;
    if (t instanceof Qi) {
      const { data: { defaultAppearanceData: { fontSize: a, fontColor: o }, rect: l, rotation: h, id: c, popupRef: d, richText: u, contentsObj: p, creationDate: f, modificationDate: m }, textContent: g, textPosition: b, parent: { page: { pageNumber: y } } } = t;
      if (!g?.length) return null;
      n = t = {
        annotationType: O.FREETEXT,
        color: Array.from(o),
        fontSize: a,
        value: g.join(`
`),
        position: b,
        pageIndex: y - 1,
        rect: l.slice(0),
        rotation: h,
        annotationElementId: c,
        id: c,
        deleted: !1,
        popupRef: d,
        comment: p?.str || null,
        richText: u,
        creationDate: f,
        modificationDate: m
      };
    }
    const r = await super.deserialize(t, e, i);
    return r.#i = t.fontSize, r.color = _.makeHexColor(...t.color), r.#t = rt.#d(t.value), r._initialData = n, t.comment && r.setCommentData(t), r;
  }
  serialize(t = !1) {
    if (this.isEmpty()) return null;
    if (this.deleted) return this.serializeDeleted();
    const e = V._colorManager.convert(this.isAttachedToDOM ? getComputedStyle(this.editorDiv).color : this.color), i = Object.assign(super.serialize(t), {
      color: e,
      fontSize: this.#i,
      value: this.#u()
    });
    return this.addComment(i), t ? (i.isCopy = !0, i) : this.annotationElementId && !this.#f(i) ? null : (i.id = this.annotationElementId, i);
  }
  #f(t) {
    const { value: e, fontSize: i, color: n, pageIndex: r } = this._initialData;
    return this.hasEditedComment || this._hasBeenMoved || t.value !== e || t.fontSize !== i || t.color.some((a, o) => a !== n[o]) || t.pageIndex !== r;
  }
  renderAnnotationElement(t) {
    const e = super.renderAnnotationElement(t);
    if (!e) return null;
    const { style: i } = e;
    i.fontSize = `calc(${this.#i}px * var(--total-scale-factor))`, i.color = this.color, e.replaceChildren();
    for (const n of this.#t.split(`
`)) {
      const r = document.createElement("div");
      r.append(n ? document.createTextNode(n) : document.createElement("br")), e.append(r);
    }
    return t.updateEdited({
      rect: this.getPDFRect(),
      popup: this._uiManager.hasCommentManager() || this.hasEditedComment ? this.comment : { text: this.#t }
    }), e;
  }
  resetAnnotationElement(t) {
    super.resetAnnotationElement(t), t.resetEdited();
  }
}, Fs = class {
  #t = /* @__PURE__ */ Object.create(null);
  updateProperty(s, t) {
    this[s] = t, this.updateSVGProperty(s, t);
  }
  updateProperties(s) {
    if (s)
      for (const [t, e] of Object.entries(s)) t.startsWith("_") || this.updateProperty(t, e);
  }
  updateSVGProperty(s, t) {
    this.#t[s] = t;
  }
  toSVGProperties() {
    const s = this.#t;
    return this.#t = /* @__PURE__ */ Object.create(null), { root: s };
  }
  reset() {
    this.#t = /* @__PURE__ */ Object.create(null);
  }
  updateAll(s = this) {
    this.updateProperties(s);
  }
  clone() {
    U("Not implemented");
  }
}, Os = class H extends V {
  #t = null;
  #e;
  _clipPathId = null;
  _colorPicker = null;
  _drawId = null;
  _drawOutlines = null;
  _focusDrawId = null;
  static _currentDrawId = -1;
  static _currentParent = null;
  static #s = null;
  static #i = null;
  static #n = null;
  static #a = null;
  static _INNER_MARGIN = 3;
  constructor(t) {
    super(t), this.#e = t.mustBeCommitted || !1, this._addOutlines(t);
  }
  onUpdatedColor() {
    this._colorPicker?.update(this.color), super.onUpdatedColor();
  }
  onUpdatedOpacity() {
    this._colorPicker?.updateOpacity?.(this.opacity);
  }
  _addOutlines(t) {
    t.drawOutlines && (this.#r(t), this.#m());
  }
  #r({ drawOutlines: t, drawId: e, drawingOptions: i, clipPathId: n }) {
    this._drawOutlines = t, this._drawingOptions ||= i, this.annotationElementId || this._uiManager.a11yAlert(V._l10nAlert[this.editorType]), e >= 0 ? (this._drawId = e, this._clipPathId = n ?? null, this.parent.drawLayer.finalizeDraw(e, t.defaultProperties), this.#l(this.parent)) : this._drawId = this.#o(t, this.parent), this.#b(t.box);
  }
  #o(t, e) {
    const { id: i, clipPathId: n } = e.drawLayer.draw(H._mergeSVGProperties(this._drawingOptions.toSVGProperties(), t.defaultSVGProperties), !1, this.constructor._hasClipPath);
    return this.constructor._hasClipPath && (this._clipPathId = n), this.#l(e), i;
  }
  #l(t) {
    const e = this._drawOutlines.getFocusSVGProperties(this.#f);
    e && (this._focusDrawId = t.drawLayer.drawOutline(e, this._drawOutlines.focusMustRemoveSelfIntersections));
  }
  #h(t = this.#f) {
    this._focusDrawId !== null && this.parent?.drawLayer.updateProperties(this._focusDrawId, this._drawOutlines.getFocusSVGProperties(t));
  }
  #u(t) {
    this._focusDrawId !== null && this.parent?.drawLayer.updateProperties(this._focusDrawId, { rootClass: t });
  }
  #d() {
    const { parent: t, _drawId: e, _focusDrawId: i, _isVisible: n } = this;
    if (!t || e === null) return;
    const r = { hidden: !n };
    t.drawLayer.updateProperties(e, { rootClass: r }), i !== null && t.drawLayer.updateProperties(i, { rootClass: r });
  }
  static _mergeSVGProperties(t, e) {
    const i = new Set(Object.keys(t));
    for (const [n, r] of Object.entries(e)) i.has(n) ? Object.assign(t[n], r) : t[n] = r;
    return t;
  }
  static getDefaultDrawingOptions(t) {
    U("Not implemented");
  }
  static get typesMap() {
    U("Not implemented");
  }
  static get isDrawer() {
    return !0;
  }
  static get _hasClipPath() {
    return !1;
  }
  static get _hasDrawClass() {
    return !0;
  }
  static get supportMultipleDrawings() {
    return !1;
  }
  get _drawRotation() {
    return this.rotation;
  }
  get _opacityName() {
    return this.constructor.typesMap.get(this.opacityType);
  }
  get #f() {
    return (this.parentRotation - this._drawRotation + 360) % 360;
  }
  static updateDefaultParams(t, e) {
    const i = this.typesMap.get(t);
    i && this._defaultDrawingOptions.updateProperty(i, e), this._currentParent && (H.#s.updateProperty(i, e), this._currentParent.drawLayer.updateProperties(this._currentDrawId, this._defaultDrawingOptions.toSVGProperties()));
  }
  updateParams(t, e) {
    const i = this.constructor.typesMap.get(t);
    i && this._updateProperty(t, i, e);
  }
  static get defaultPropertiesToUpdate() {
    const t = [], e = this._defaultDrawingOptions;
    for (const [i, n] of this.typesMap) t.push([i, e[n]]);
    return t;
  }
  get propertiesToUpdate() {
    const t = [], { _drawingOptions: e } = this;
    for (const [i, n] of this.constructor.typesMap) t.push([i, e[n]]);
    return t;
  }
  _updateProperty(t, e, i) {
    const n = this._drawingOptions, r = n[e], a = (o) => {
      n.updateProperty(e, o);
      const l = this._drawOutlines.updateProperty(e, o);
      l && this.#b(l), this.parent?.drawLayer.updateProperties(this._drawId, n.toSVGProperties()), t === this.colorType ? this.onUpdatedColor() : t === this.opacityType && this.onUpdatedOpacity();
    };
    this.addCommands({
      cmd: a.bind(this, i),
      undo: a.bind(this, r),
      post: this._uiManager.updateUI.bind(this._uiManager, this),
      mustExec: !0,
      type: t,
      overwriteIfSameType: !0,
      keepUndo: !0
    });
  }
  _updateColorAndOpacity(t, e, i = this.colorAndOpacityType) {
    const n = this.constructor.typesMap.get(this.colorType), r = this._opacityName, a = this._drawingOptions, o = a[n], l = a[r], h = (c, d) => {
      a.updateProperty(n, c), a.updateProperty(r, d), this._drawOutlines.updateProperty(n, c), this._drawOutlines.updateProperty(r, d), this.parent?.drawLayer.updateProperties(this._drawId, a.toSVGProperties()), this.onUpdatedColor(), this.onUpdatedOpacity();
    };
    this.addCommands({
      cmd: h.bind(this, t, e),
      undo: h.bind(this, o, l),
      post: this._uiManager.updateUI.bind(this._uiManager, this),
      mustExec: !0,
      type: i,
      overwriteIfSameType: !0,
      keepUndo: !0
    });
  }
  _onResizing() {
    this.parent?.drawLayer.updateProperties(this._drawId, H._mergeSVGProperties(this._drawOutlines.getPathResizingSVGProperties(this.#p()), { bbox: this.#y() }));
  }
  _onResized() {
    this.parent?.drawLayer.updateProperties(this._drawId, H._mergeSVGProperties(this._drawOutlines.getPathResizedSVGProperties(this.#p()), { bbox: this.#y() })), this.#h();
  }
  _onTranslating(t, e) {
    this.parent?.drawLayer.updateProperties(this._drawId, { bbox: this.#y() });
  }
  _onTranslated() {
    this.parent?.drawLayer.updateProperties(this._drawId, H._mergeSVGProperties(this._drawOutlines.getPathTranslatedSVGProperties(this.#p(), this.parentDimensions), { bbox: this.#y() }));
  }
  _onStartDragging() {
    this.parent?.drawLayer.updateProperties(this._drawId, { rootClass: { moving: !0 } });
  }
  _onStopDragging() {
    this.parent?.drawLayer.updateProperties(this._drawId, { rootClass: { moving: !1 } });
  }
  get _mustBeDisabledOnCommit() {
    return !0;
  }
  commit() {
    super.commit(), this._mustBeDisabledOnCommit && (this.disableEditMode(), this.disableEditing());
  }
  disableEditing() {
    super.disableEditing(), this.div.classList.toggle("disabled", !0);
  }
  enableEditing() {
    super.enableEditing(), this.div.classList.toggle("disabled", !1);
  }
  getBaseTranslation() {
    return [0, 0];
  }
  get isResizable() {
    return !0;
  }
  onceAdded(t) {
    this.annotationElementId || this.parent.addUndoableEditor(this), this._isDraggable = !0, this.#e && (this.#e = !1, this.commit(), this.parent.setSelected(this), t && this.isOnScreen && this.div.focus());
  }
  remove() {
    this._uiManager.removeShouldRescale(this), this.#g(), super.remove();
  }
  rebuild() {
    this.parent && (super.rebuild(), this.div !== null && (this.#m(), this.#b(this._drawOutlines.box), this.isAttachedToDOM || this.parent.add(this)));
  }
  setParent(t) {
    let e = !1;
    this.parent && !t ? (this._uiManager.removeShouldRescale(this), this.#g()) : t && (this._uiManager.addShouldRescale(this), this.#m(t), e = !this.parent && this.div?.classList.contains("selectedEditor")), super.setParent(t), this.#d(), e && this.select();
  }
  #g() {
    if (this._drawId === null || !this.parent) return;
    const { drawLayer: t } = this.parent;
    t.remove(this._drawId), this._drawId = null, this._focusDrawId !== null && (t.remove(this._focusDrawId), this._focusDrawId = null), this._drawingOptions.reset();
  }
  #m(t = this.parent) {
    if (!(this._drawId !== null && this.parent === t)) {
      if (this._drawId !== null) {
        const { drawLayer: e } = this.parent;
        e.updateParent(this._drawId, t.drawLayer), this._focusDrawId !== null && e.updateParent(this._focusDrawId, t.drawLayer);
        return;
      }
      this._drawingOptions.updateAll(), this._drawId = this.#o(this._drawOutlines, t), this._clipPathId && this.#t && (this.#t.style.clipPath = this._clipPathId);
    }
  }
  #c([t, e, i, n]) {
    const { parentDimensions: [r, a], _drawRotation: o } = this;
    switch (o) {
      case 90:
        return [
          e,
          1 - t,
          i * (a / r),
          n * (r / a)
        ];
      case 180:
        return [
          1 - t,
          1 - e,
          i,
          n
        ];
      case 270:
        return [
          1 - e,
          t,
          i * (a / r),
          n * (r / a)
        ];
      default:
        return [
          t,
          e,
          i,
          n
        ];
    }
  }
  #p() {
    const { x: t, y: e, width: i, height: n, parentDimensions: [r, a], _drawRotation: o } = this;
    switch (o) {
      case 90:
        return [
          1 - e,
          t,
          i * (r / a),
          n * (a / r)
        ];
      case 180:
        return [
          1 - t,
          1 - e,
          i,
          n
        ];
      case 270:
        return [
          e,
          1 - t,
          i * (r / a),
          n * (a / r)
        ];
      default:
        return [
          t,
          e,
          i,
          n
        ];
    }
  }
  #b(t) {
    [this.x, this.y, this.width, this.height] = this.#c(t), this.div && (this.fixAndSetPosition(), this.setDims()), this._onResized();
  }
  #y(t = this.parentRotation) {
    const { x: e, y: i, width: n, height: r, _drawRotation: a, parentDimensions: [o, l] } = this;
    switch ((a * 4 + t) / 90) {
      case 1:
        return [
          1 - i - r,
          e,
          r,
          n
        ];
      case 2:
        return [
          1 - e - n,
          1 - i - r,
          n,
          r
        ];
      case 3:
        return [
          i,
          1 - e - n,
          r,
          n
        ];
      case 4:
        return [
          e,
          i - n * (o / l),
          r * (l / o),
          n * (o / l)
        ];
      case 5:
        return [
          1 - i,
          e,
          n * (o / l),
          r * (l / o)
        ];
      case 6:
        return [
          1 - e - r * (l / o),
          1 - i,
          r * (l / o),
          n * (o / l)
        ];
      case 7:
        return [
          i - n * (o / l),
          1 - e - r * (l / o),
          n * (o / l),
          r * (l / o)
        ];
      case 8:
        return [
          e - n,
          i - r,
          n,
          r
        ];
      case 9:
        return [
          1 - i,
          e - n,
          r,
          n
        ];
      case 10:
        return [
          1 - e,
          1 - i,
          n,
          r
        ];
      case 11:
        return [
          i - r,
          1 - e,
          r,
          n
        ];
      case 12:
        return [
          e - r * (l / o),
          i,
          r * (l / o),
          n * (o / l)
        ];
      case 13:
        return [
          1 - i - n * (o / l),
          e - r * (l / o),
          n * (o / l),
          r * (l / o)
        ];
      case 14:
        return [
          1 - e,
          1 - i - n * (o / l),
          r * (l / o),
          n * (o / l)
        ];
      case 15:
        return [
          i,
          1 - e,
          n * (o / l),
          r * (l / o)
        ];
      default:
        return [
          e,
          i,
          n,
          r
        ];
    }
  }
  rotate(t = this.parentRotation) {
    if (!this.parent || this._drawId === null) return;
    const e = (t - this._drawRotation + 360) % 360;
    this.parent.drawLayer.updateProperties(this._drawId, H._mergeSVGProperties({ bbox: this.#y(t) }, this._drawOutlines.updateRotation(e))), this.#h(e);
  }
  show(t = this._isVisible) {
    super.show(t), this.#d();
  }
  select() {
    super.select(), this.#u({
      hovered: !1,
      selected: !0
    });
  }
  unselect() {
    super.unselect(), this.#u({ selected: !1 });
  }
  pointerover() {
    this.isSelected || this.#u({ hovered: !0 });
  }
  pointerleave() {
    this.isSelected || this.#u({ hovered: !1 });
  }
  onScaleChanging() {
    if (!this.parent) return;
    const t = this._drawOutlines.updateParentDimensions(this.parentDimensions, this.parent.scale);
    t && this.#b(t);
  }
  static onScaleChangingWhenDrawing() {
  }
  render() {
    if (this.div) return this.div;
    let t, e;
    this._isCopy && (t = this.x, e = this.y);
    const i = super.render();
    this.constructor._hasDrawClass && i.classList.add("draw");
    const n = this.#t = document.createElement("div");
    return i.append(n), n.setAttribute("aria-hidden", "true"), n.className = "internal", this._clipPathId && (n.style.clipPath = this._clipPathId), Ci(this, n, ["pointerover", "pointerleave"]), this.setDims(), this._uiManager.addShouldRescale(this), this.disableEditing(), this._isCopy && this._moveAfterPaste(t, e), i;
  }
  static createDrawerInstance(t) {
    U("Not implemented");
  }
  static _getDrawingTarget(t, { target: e }) {
    return e;
  }
  static _getPointerCoords({ offsetX: t, offsetY: e, clientX: i, clientY: n }, r = null) {
    if (!r) return [t, e];
    let a = i - r.clientX, o = n - r.clientY;
    switch (this._currentParent.viewport.rotation) {
      case 90:
        [a, o] = [o, -a];
        break;
      case 180:
        [a, o] = [-a, -o];
        break;
      case 270:
        [a, o] = [-o, a];
    }
    return [r.offsetX + a, r.offsetY + o];
  }
  static _addDrawingListeners(t, e) {
  }
  static _endDrawingSession(t = !1) {
    return this._currentParent.endDrawingSession(t);
  }
  static startDrawing(t, e, i, n) {
    const { pointerId: r, pointerType: a } = n;
    if (ht.isInitializedAndDifferentPointerType(a)) return;
    const o = this._getDrawingTarget(t, n), [l, h] = this._getPointerCoords(n), { viewport: { rotation: c } } = t, { x: d, y: u, width: p, height: f } = o.getBoundingClientRect(), m = H.#i = new AbortController(), g = t.combinedSignal(m);
    if (ht.setPointer(a, r), window.addEventListener("pointerup", (A) => {
      ht.isSamePointerIdOrRemove(A.pointerId) && this._endDraw(A);
    }, { signal: g }), window.addEventListener("pointercancel", (A) => {
      ht.isSamePointerIdOrRemove(A.pointerId) && this._endDrawingSession();
    }, { signal: g }), window.addEventListener("pointerdown", (A) => {
      ht.isSamePointerType(A.pointerType) && (ht.initializeAndAddPointerId(A.pointerId), H.#s.isCancellable() && (H.#s.removeLastElement(), H.#s.isEmpty() ? this._endDrawingSession(!0) : this._endDraw(null)));
    }, {
      capture: !0,
      passive: !1,
      signal: g
    }), window.addEventListener("contextmenu", At, { signal: g }), o.addEventListener("pointermove", this._drawMove.bind(this), { signal: g }), o.addEventListener("touchmove", (A) => {
      ht.isSameTimeStamp(A.timeStamp) && et(A);
    }, { signal: g }), this._addDrawingListeners(o, g), t.toggleDrawing(), e._editorUndoBar?.hide(), H.#s) {
      t.drawLayer.updateProperties(this._currentDrawId, H.#s.startNew(l, h, p, f, c));
      return;
    }
    e.updateUIForDefaultProperties(this), H.#s = this.createDrawerInstance({
      x: l,
      y: h,
      box: [
        d,
        u,
        p,
        f
      ],
      rotation: c,
      parent: t,
      isLTR: i
    }), H.#n = this.getDefaultDrawingOptions(), this._currentParent = t;
    const { id: b, clipPathId: y } = t.drawLayer.draw(this._mergeSVGProperties(H.#n.toSVGProperties(), H.#s.defaultSVGProperties), !0, this._hasClipPath);
    this._currentDrawId = b, H.#a = this._hasClipPath ? y : null;
  }
  static _drawMove(t) {
    if (ht.isSameTimeStamp(t.timeStamp), !H.#s || !ht.isSamePointerId(t.pointerId)) return;
    if (ht.isUsingMultiplePointers()) {
      this._endDraw(t);
      return;
    }
    let e;
    const i = t.getCoalescedEvents?.();
    if (i?.length) {
      const n = [];
      for (const r of i) n.push(...this._getPointerCoords(r, t));
      e = H.#s.addPoints(n);
    } else e = H.#s.add(...this._getPointerCoords(t));
    this._currentParent.drawLayer.updateProperties(this._currentDrawId, e), ht.setTimeStamp(t.timeStamp), et(t);
  }
  static _cleanup(t) {
    t && (this._currentDrawId = -1, this._currentParent = null, H.#s = null, H.#n = null, H.#a = null, ht.clearTimeStamp()), H.#i && (H.#i.abort(), H.#i = null, ht.clearPointerIds());
  }
  static _endDraw(t) {
    const e = this._currentParent;
    if (e) {
      if (e.toggleDrawing(!0), this._cleanup(!1), e.drawLayer.updateProperties(this._currentDrawId, t?.target === e.div ? H.#s.end(...this._getPointerCoords(t)) : H.#s.end()), this.supportMultipleDrawings) {
        const i = H.#s, n = this._currentDrawId, r = i.getLastElement();
        e.addCommands({
          cmd: () => {
            e.drawLayer.updateProperties(n, i.setLastElement(r));
          },
          undo: () => {
            e.drawLayer.updateProperties(n, i.removeLastElement());
          },
          mustExec: !1,
          type: N.DRAW_STEP
        });
        return;
      }
      this.endDrawing(!1);
    }
  }
  static endDrawing(t) {
    const e = this._currentParent;
    if (!e) return null;
    if (e.toggleDrawing(!0), e.cleanUndoStack(N.DRAW_STEP), !H.#s.isEmpty()) {
      const { pageDimensions: [i, n], scale: r } = e, a = e.createAndAddNewEditor({
        offsetX: 0,
        offsetY: 0
      }, !1, {
        drawId: this._currentDrawId,
        clipPathId: H.#a,
        drawOutlines: H.#s.getOutlines(i * r, n * r, r, this._INNER_MARGIN),
        drawingOptions: H.#n,
        mustBeCommitted: !t
      });
      return this._cleanup(!0), a;
    }
    return e.drawLayer.remove(this._currentDrawId), this._cleanup(!0), null;
  }
  createDrawingOptions(t) {
  }
  static deserializeDraw(t, e, i, n, r, a, o) {
    U("Not implemented");
  }
  static async deserialize(t, e, i) {
    const { rawDims: { pageWidth: n, pageHeight: r, pageX: a, pageY: o } } = e.viewport, l = this.deserializeDraw(a, o, n, r, this._INNER_MARGIN, t, i), h = await super.deserialize(t, e, i);
    return h.createDrawingOptions(t), h.#r({ drawOutlines: l }), h.#m(), h.onScaleChanging(), h.rotate(), h;
  }
  serializeDraw(t) {
    const [e, i] = this.pageTranslation, [n, r] = this.pageDimensions;
    return this._drawOutlines.serialize([
      e,
      i,
      n,
      r
    ], t);
  }
  renderAnnotationElement(t) {
    return t.updateEdited({ rect: this.getPDFRect() }), null;
  }
  static canCreateNewEmptyEditor() {
    return !1;
  }
}, T = class {
  static PRECISION = 1e-4;
  focusOutline = null;
  toSVGPath() {
    U("Abstract method `toSVGPath` must be implemented.");
  }
  get box() {
    U("Abstract getter `box` must be implemented.");
  }
  serialize(s, t) {
    U("Abstract method `serialize` must be implemented.");
  }
  get defaultSVGProperties() {
    U("Abstract getter `defaultSVGProperties` must be implemented.");
  }
  get defaultProperties() {
    return this.defaultSVGProperties;
  }
  getFocusSVGProperties(s) {
    return null;
  }
  get focusMustRemoveSelfIntersections() {
    return !1;
  }
  updateProperty(s, t) {
    return null;
  }
  updateParentDimensions(s, t) {
    return null;
  }
  serializeQuadPoints(s, t) {
    return null;
  }
  updateRotation(s) {
    return {};
  }
  getPathResizingSVGProperties(s) {
    return {};
  }
  getPathResizedSVGProperties(s) {
    return {};
  }
  getPathTranslatedSVGProperties(s, t) {
    return {};
  }
  static _rotateBox([s, t, e, i], n) {
    switch (n) {
      case 90:
        return [
          1 - t - i,
          s,
          i,
          e
        ];
      case 180:
        return [
          1 - s - e,
          1 - t - i,
          e,
          i
        ];
      case 270:
        return [
          t,
          1 - s - e,
          i,
          e
        ];
    }
    return [
      s,
      t,
      e,
      i
    ];
  }
  static _rescale(s, t, e, i, n, r) {
    r ||= new Float32Array(s.length);
    for (let a = 0, o = s.length; a < o; a += 2)
      r[a] = t + s[a] * i, r[a + 1] = e + s[a + 1] * n;
    return r;
  }
  static _rescaleAndSwap(s, t, e, i, n, r) {
    r ||= new Float32Array(s.length);
    for (let a = 0, o = s.length; a < o; a += 2)
      r[a] = t + s[a + 1] * i, r[a + 1] = e + s[a] * n;
    return r;
  }
  static _translate(s, t, e, i) {
    i ||= new Float32Array(s.length);
    for (let n = 0, r = s.length; n < r; n += 2)
      i[n] = t + s[n], i[n + 1] = e + s[n + 1];
    return i;
  }
  static svgRound(s) {
    return Math.round(s * 1e4);
  }
  static _normalizePoint(s, t, e, i, n) {
    switch (n) {
      case 90:
        return [1 - t / e, s / i];
      case 180:
        return [1 - s / e, 1 - t / i];
      case 270:
        return [t / e, 1 - s / i];
      default:
        return [s / e, t / i];
    }
  }
  static createBezierPoints(s, t, e, i, n, r) {
    return [
      (s + 5 * e) / 6,
      (t + 5 * i) / 6,
      (5 * e + n) / 6,
      (5 * i + r) / 6,
      (e + n) / 2,
      (i + r) / 2
    ];
  }
}, nn = class ne {
  #t;
  #e = [];
  #s;
  #i;
  #n = [];
  #a = /* @__PURE__ */ new Float32Array(18);
  #r;
  #o;
  #l;
  #h;
  #u;
  #d;
  #f = [];
  static #g = 8;
  static #m = 2;
  static #c = ne.#g + ne.#m;
  constructor(t, e, i, n, r, a, o = 0) {
    this.#t = i, this.#d = r * n, this.#i = a, this.#a.set([
      NaN,
      NaN,
      NaN,
      NaN,
      t,
      e
    ], 6), this.#s = o, this.#h = ne.#g * n, this.#l = ne.#c * n, this.#u = n, this.#f.push(t, e);
  }
  isEmpty() {
    return isNaN(this.#a[8]);
  }
  isCancellable() {
    return this.#f.length <= 10;
  }
  removeLastElement() {
    return this.#a.fill(NaN), this.#n.length = this.#e.length = this.#f.length = 0, { path: { d: "" } };
  }
  #p() {
    const t = this.#a.subarray(4, 6), e = this.#a.subarray(16, 18), [i, n, r, a] = this.#t;
    return [
      (this.#r + (t[0] - e[0]) / 2 - i) / r,
      (this.#o + (t[1] - e[1]) / 2 - n) / a,
      (this.#r + (e[0] - t[0]) / 2 - i) / r,
      (this.#o + (e[1] - t[1]) / 2 - n) / a
    ];
  }
  add(t, e) {
    this.#r = t, this.#o = e;
    const [i, n, r, a] = this.#t;
    let [o, l, h, c] = this.#a.subarray(8, 12);
    const d = t - h, u = e - c, p = Math.hypot(d, u);
    if (p < this.#l) return !1;
    const f = p - this.#h, m = f / p, g = m * d, b = m * u;
    let y = o, A = l;
    o = h, l = c, h += g, c += b, this.#f?.push(t, e);
    const w = -b / f, v = g / f, S = w * this.#d, E = v * this.#d;
    return this.#a.set(this.#a.subarray(2, 8), 0), this.#a.set([h + S, c + E], 4), this.#a.set(this.#a.subarray(14, 18), 12), this.#a.set([h - S, c - E], 16), isNaN(this.#a[6]) ? (this.#n.length === 0 && (this.#a.set([o + S, l + E], 2), this.#n.push(NaN, NaN, NaN, NaN, (o + S - i) / r, (l + E - n) / a), this.#a.set([o - S, l - E], 14), this.#e.push(NaN, NaN, NaN, NaN, (o - S - i) / r, (l - E - n) / a)), this.#a.set([
      y,
      A,
      o,
      l,
      h,
      c
    ], 6), !this.isEmpty()) : (this.#a.set([
      y,
      A,
      o,
      l,
      h,
      c
    ], 6), Math.abs(Math.atan2(A - l, y - o) - Math.atan2(b, g)) < Math.PI / 2 ? ([o, l, h, c] = this.#a.subarray(2, 6), this.#n.push(NaN, NaN, NaN, NaN, ((o + h) / 2 - i) / r, ((l + c) / 2 - n) / a), [o, l, y, A] = this.#a.subarray(14, 18), this.#e.push(NaN, NaN, NaN, NaN, ((y + o) / 2 - i) / r, ((A + l) / 2 - n) / a), !0) : ([y, A, o, l, h, c] = this.#a.subarray(0, 6), this.#n.push(((y + 5 * o) / 6 - i) / r, ((A + 5 * l) / 6 - n) / a, ((5 * o + h) / 6 - i) / r, ((5 * l + c) / 6 - n) / a, ((o + h) / 2 - i) / r, ((l + c) / 2 - n) / a), [h, c, o, l, y, A] = this.#a.subarray(12, 18), this.#e.push(((y + 5 * o) / 6 - i) / r, ((A + 5 * l) / 6 - n) / a, ((5 * o + h) / 6 - i) / r, ((5 * l + c) / 6 - n) / a, ((o + h) / 2 - i) / r, ((l + c) / 2 - n) / a), !0));
  }
  toSVGPath() {
    if (this.isEmpty()) return "";
    const t = this.#n, e = this.#e;
    if (isNaN(this.#a[6]) && !this.isEmpty()) return this.#b();
    const i = [];
    i.push(`M${t[4]} ${t[5]}`);
    for (let n = 6; n < t.length; n += 6) isNaN(t[n]) ? i.push(`L${t[n + 4]} ${t[n + 5]}`) : i.push(`C${t[n]} ${t[n + 1]} ${t[n + 2]} ${t[n + 3]} ${t[n + 4]} ${t[n + 5]}`);
    this.#A(i);
    for (let n = e.length - 6; n >= 6; n -= 6) isNaN(e[n]) ? i.push(`L${e[n + 4]} ${e[n + 5]}`) : i.push(`C${e[n]} ${e[n + 1]} ${e[n + 2]} ${e[n + 3]} ${e[n + 4]} ${e[n + 5]}`);
    return this.#y(i), i.join(" ");
  }
  #b() {
    const [t, e, i, n] = this.#t, [r, a, o, l] = this.#p();
    return `M${(this.#a[2] - t) / i} ${(this.#a[3] - e) / n} L${(this.#a[4] - t) / i} ${(this.#a[5] - e) / n} L${r} ${a} L${o} ${l} L${(this.#a[16] - t) / i} ${(this.#a[17] - e) / n} L${(this.#a[14] - t) / i} ${(this.#a[15] - e) / n} Z`;
  }
  #y(t) {
    const e = this.#e;
    t.push(`L${e[4]} ${e[5]} Z`);
  }
  #A(t) {
    const [e, i, n, r] = this.#t, a = this.#a.subarray(4, 6), o = this.#a.subarray(16, 18), [l, h, c, d] = this.#p();
    t.push(`L${(a[0] - e) / n} ${(a[1] - i) / r} L${l} ${h} L${c} ${d} L${(o[0] - e) / n} ${(o[1] - i) / r}`);
  }
  newFreeDrawOutline(t, e, i, n, r, a) {
    return new rn(t, e, i, n, r, a);
  }
  getOutlines() {
    const t = this.#n, e = this.#e, i = this.#a, [n, r, a, o] = this.#t, l = new Float32Array((this.#f?.length ?? 0) + 2);
    for (let d = 0, u = l.length - 2; d < u; d += 2)
      l[d] = (this.#f[d] - n) / a, l[d + 1] = (this.#f[d + 1] - r) / o;
    if (l[l.length - 2] = (this.#r - n) / a, l[l.length - 1] = (this.#o - r) / o, isNaN(i[6]) && !this.isEmpty()) return this.#v(l);
    const h = new Float32Array(this.#n.length + 24 + this.#e.length);
    let c = t.length;
    for (let d = 0; d < c; d += 2) {
      if (isNaN(t[d])) {
        h[d] = h[d + 1] = NaN;
        continue;
      }
      h[d] = t[d], h[d + 1] = t[d + 1];
    }
    c = this.#S(h, c);
    for (let d = e.length - 6; d >= 6; d -= 6) for (let u = 0; u < 6; u += 2) {
      if (isNaN(e[d + u])) {
        h[c] = h[c + 1] = NaN, c += 2;
        continue;
      }
      h[c] = e[d + u], h[c + 1] = e[d + u + 1], c += 2;
    }
    return this.#E(h, c), this.newFreeDrawOutline(h, l, this.#t, this.#u, this.#s, this.#i);
  }
  #v(t) {
    const e = this.#a, [i, n, r, a] = this.#t, [o, l, h, c] = this.#p(), d = /* @__PURE__ */ new Float32Array(36);
    return d.set([
      NaN,
      NaN,
      NaN,
      NaN,
      (e[2] - i) / r,
      (e[3] - n) / a,
      NaN,
      NaN,
      NaN,
      NaN,
      (e[4] - i) / r,
      (e[5] - n) / a,
      NaN,
      NaN,
      NaN,
      NaN,
      o,
      l,
      NaN,
      NaN,
      NaN,
      NaN,
      h,
      c,
      NaN,
      NaN,
      NaN,
      NaN,
      (e[16] - i) / r,
      (e[17] - n) / a,
      NaN,
      NaN,
      NaN,
      NaN,
      (e[14] - i) / r,
      (e[15] - n) / a
    ], 0), this.newFreeDrawOutline(d, t, this.#t, this.#u, this.#s, this.#i);
  }
  #E(t, e) {
    const i = this.#e;
    return t.set([
      NaN,
      NaN,
      NaN,
      NaN,
      i[4],
      i[5]
    ], e), e += 6;
  }
  #S(t, e) {
    const i = this.#a.subarray(4, 6), n = this.#a.subarray(16, 18), [r, a, o, l] = this.#t, [h, c, d, u] = this.#p();
    return t.set([
      NaN,
      NaN,
      NaN,
      NaN,
      (i[0] - r) / o,
      (i[1] - a) / l,
      NaN,
      NaN,
      NaN,
      NaN,
      h,
      c,
      NaN,
      NaN,
      NaN,
      NaN,
      d,
      u,
      NaN,
      NaN,
      NaN,
      NaN,
      (n[0] - r) / o,
      (n[1] - a) / l
    ], e), e += 24;
  }
}, rn = class extends T {
  #t;
  #e = /* @__PURE__ */ new Float32Array(4);
  #s;
  #i;
  #n;
  #a;
  #r;
  constructor(s, t, e, i, n, r) {
    super(), this.#r = s, this.#n = t, this.#t = e, this.#a = i, this.#s = n, this.#i = r, this.firstPoint = [NaN, NaN], this.lastPoint = [NaN, NaN], this.#o(r);
    const [a, o, l, h] = this.#e;
    for (let c = 0, d = s.length; c < d; c += 2)
      s[c] = (s[c] - a) / l, s[c + 1] = (s[c + 1] - o) / h;
    for (let c = 0, d = t.length; c < d; c += 2)
      t[c] = (t[c] - a) / l, t[c + 1] = (t[c + 1] - o) / h;
  }
  toSVGPath() {
    const s = [`M${this.#r[4]} ${this.#r[5]}`];
    for (let t = 6, e = this.#r.length; t < e; t += 6) {
      if (isNaN(this.#r[t])) {
        s.push(`L${this.#r[t + 4]} ${this.#r[t + 5]}`);
        continue;
      }
      s.push(`C${this.#r[t]} ${this.#r[t + 1]} ${this.#r[t + 2]} ${this.#r[t + 3]} ${this.#r[t + 4]} ${this.#r[t + 5]}`);
    }
    return s.push("Z"), s.join(" ");
  }
  serialize([s, t, e, i], n) {
    const r = e - s, a = i - t;
    let o, l;
    switch (n) {
      case 0:
        o = T._rescale(this.#r, s, i, r, -a), l = T._rescale(this.#n, s, i, r, -a);
        break;
      case 90:
        o = T._rescaleAndSwap(this.#r, s, t, r, a), l = T._rescaleAndSwap(this.#n, s, t, r, a);
        break;
      case 180:
        o = T._rescale(this.#r, e, t, -r, a), l = T._rescale(this.#n, e, t, -r, a);
        break;
      case 270:
        o = T._rescaleAndSwap(this.#r, e, i, -r, -a), l = T._rescaleAndSwap(this.#n, e, i, -r, -a);
    }
    return {
      outline: Array.from(o),
      points: [Array.from(l)]
    };
  }
  #o(s) {
    const t = this.#r;
    let e = t[4], i = t[5];
    const n = [
      e,
      i,
      e,
      i
    ];
    let r = e, a = i, o = e, l = i;
    const h = s ? Math.max : Math.min, c = /* @__PURE__ */ new Float32Array(4);
    for (let u = 6, p = t.length; u < p; u += 6) {
      const f = t[u + 4], m = t[u + 5];
      isNaN(t[u]) ? (_.pointBoundingBox(f, m, n), a > m ? (r = f, a = m) : a === m && (r = h(r, f)), l < m ? (o = f, l = m) : l === m && (o = h(o, f))) : (c.set(Tt, 0), _.bezierBoundingBox(e, i, ...t.slice(u, u + 6), c), _.rectBoundingBox(...c, n), a > c[1] ? (r = c[0], a = c[1]) : a === c[1] && (r = h(r, c[0])), l < c[3] ? (o = c[2], l = c[3]) : l === c[3] && (o = h(o, c[2]))), e = f, i = m;
    }
    const d = this.#e;
    d[0] = n[0] - this.#s, d[1] = n[1] - this.#s, d[2] = n[2] - n[0] + 2 * this.#s, d[3] = n[3] - n[1] + 2 * this.#s, this.firstPoint = [r, a], this.lastPoint = [o, l];
  }
  get box() {
    return this.#e;
  }
  newOutliner(s, t, e, i, n, r, a = 0) {
    return new nn(s, t, e, i, n, r, a);
  }
  updateThickness(s) {
    const t = this.getNewOutline(s);
    return this.#r = t.#r, this.#n = t.#n, this.#e.set(t.#e), this.firstPoint = t.firstPoint, this.lastPoint = t.lastPoint, this.#e;
  }
  getNewOutline(s, t) {
    const [e, i, n, r] = this.#e, [a, o, l, h] = this.#t, c = n * l, d = r * h, u = e * l + a, p = i * h + o, f = this.#n, m = this.newOutliner(f[0] * c + u, f[1] * d + p, this.#t, this.#a, s, this.#i, t ?? this.#s);
    for (let g = 2, b = f.length; g < b; g += 2) m.add(f[g] * c + u, f[g + 1] * d + p);
    return m.getOutlines();
  }
};
function an(s) {
  return {
    bbox: s.box,
    root: { viewBox: "0 0 1 1" },
    rootClass: {
      highlight: !0,
      free: s.isFree
    },
    path: { d: s.toSVGPath() }
  };
}
function on(s, t) {
  const { focusOutline: e } = s;
  return {
    bbox: T._rotateBox(e.box, t),
    root: { "data-main-rotation": t },
    rootClass: {
      highlightOutline: !0,
      free: s.isFree
    },
    path: { d: e.toSVGPath() }
  };
}
var ws = class {
  #t;
  #e;
  #s;
  #i = [];
  #n = [];
  constructor(s, t = 0, e = 0, i = !0) {
    const n = Tt.slice(), r = 10 ** -4;
    for (const { x: f, y: m, width: g, height: b } of s) {
      const y = Math.floor((f - t) / r) * r, A = Math.ceil((f + g + t) / r) * r, w = Math.floor((m - t) / r) * r, v = Math.ceil((m + b + t) / r) * r, S = [
        y,
        w,
        v,
        !0
      ], E = [
        A,
        w,
        v,
        !1
      ];
      this.#i.push(S, E), _.rectBoundingBox(y, w, A, v, n);
    }
    const a = n[2] - n[0] + 2 * e, o = n[3] - n[1] + 2 * e, l = n[0] - e, h = n[1] - e;
    let c = i ? -1 / 0 : 1 / 0, d = 1 / 0;
    const u = this.#i.at(i ? -1 : -2), p = [u[0], u[2]];
    for (const f of this.#i) {
      const [m, g, b, y] = f;
      !y && i ? g < d ? (d = g, c = m) : g === d && (c = Math.max(c, m)) : y && !i && (g < d ? (d = g, c = m) : g === d && (c = Math.min(c, m))), f[0] = (m - l) / a, f[1] = (g - h) / o, f[2] = (b - h) / o;
    }
    this.#t = new Float32Array([
      l,
      h,
      a,
      o
    ]), this.#e = [c, d], this.#s = p;
  }
  getOutlines() {
    this.#i.sort((t, e) => t[0] - e[0] || t[1] - e[1] || t[2] - e[2]);
    const s = [];
    for (const t of this.#i) t[3] ? (s.push(...this.#h(t)), this.#o(t)) : (this.#l(t), s.push(...this.#h(t)));
    return this.#a(s);
  }
  #a(s) {
    const t = [], e = /* @__PURE__ */ new Set();
    for (const r of s) {
      const [a, o, l] = r;
      t.push([
        a,
        o,
        r
      ], [
        a,
        l,
        r
      ]);
    }
    t.sort((r, a) => r[1] - a[1] || r[0] - a[0]);
    for (let r = 0, a = t.length; r < a; r += 2) {
      const o = t[r][2], l = t[r + 1][2];
      o.push(l), l.push(o), e.add(o), e.add(l);
    }
    const i = [];
    let n;
    for (; e.size > 0; ) {
      const r = e.values().next().value;
      let [a, o, l, h, c] = r;
      e.delete(r);
      let d = a, u = o;
      for (n = [a, l], i.push(n); ; ) {
        let p;
        if (e.has(h)) p = h;
        else if (e.has(c)) p = c;
        else break;
        e.delete(p), [a, o, l, h, c] = p, d !== a && (n.push(d, u, a, u === o ? o : l), d = a), u = u === o ? l : o;
      }
      n.push(d, u);
    }
    return new Ss(i, this.#t, this.#e, this.#s);
  }
  #r(s) {
    const t = this.#n;
    let e = 0, i = t.length - 1;
    for (; e <= i; ) {
      const n = e + i >> 1, r = t[n][0];
      if (r === s) return n;
      r < s ? e = n + 1 : i = n - 1;
    }
    return i + 1;
  }
  #o([, s, t]) {
    const e = this.#r(s);
    this.#n.splice(e, 0, [s, t]);
  }
  #l([, s, t]) {
    const e = this.#r(s);
    for (let i = e; i < this.#n.length; i++) {
      const [n, r] = this.#n[i];
      if (n !== s) break;
      if (n === s && r === t) {
        this.#n.splice(i, 1);
        return;
      }
    }
    for (let i = e - 1; i >= 0; i--) {
      const [n, r] = this.#n[i];
      if (n !== s) break;
      if (n === s && r === t) {
        this.#n.splice(i, 1);
        return;
      }
    }
  }
  #h(s) {
    const [t, e, i] = s, n = [[
      t,
      e,
      i
    ]], r = this.#r(i);
    for (let a = 0; a < r; a++) {
      const [o, l] = this.#n[a];
      for (let h = 0, c = n.length; h < c; h++) {
        const [, d, u] = n[h];
        if (!(l <= d || u <= o)) {
          if (d >= o) {
            if (u > l) n[h][1] = l;
            else {
              if (c === 1) return [];
              n.splice(h, 1), h--, c--;
            }
            continue;
          }
          n[h][2] = o, u > l && n.push([
            t,
            l,
            u
          ]);
        }
      }
    }
    return n;
  }
}, Ss = class extends T {
  #t;
  #e = null;
  #s;
  constructor(s, t, e, i) {
    super(), this.#s = s, this.#t = t, this.firstPoint = e, this.lastPoint = i;
  }
  static build(s, t) {
    const e = new ws(s, 1e-3).getOutlines();
    return e.#e = s, e.focusOutline = new ws(s, 25e-4, 1e-3, t).getOutlines(), e;
  }
  get isFree() {
    return !1;
  }
  get defaultSVGProperties() {
    return an(this);
  }
  getFocusSVGProperties(s) {
    return on(this, s);
  }
  updateRotation(s) {
    return { root: { "data-main-rotation": s } };
  }
  serializeQuadPoints([s, t], [e, i]) {
    const n = this.#e, r = new Float32Array(n.length * 8);
    let a = 0;
    for (const { x: o, y: l, width: h, height: c } of n) {
      const d = o * e + s, u = (1 - l) * i + t;
      r[a] = r[a + 4] = d, r[a + 1] = r[a + 3] = u, r[a + 2] = r[a + 6] = d + h * e, r[a + 5] = r[a + 7] = u - c * i, a += 8;
    }
    return r;
  }
  toSVGPath() {
    const s = [];
    for (const t of this.#s) {
      let [e, i] = t;
      s.push(`M${e} ${i}`);
      for (let n = 2; n < t.length; n += 2) {
        const r = t[n], a = t[n + 1];
        r === e ? (s.push(`V${a}`), i = a) : a === i && (s.push(`H${r}`), e = r);
      }
      s.push("Z");
    }
    return s.join(" ");
  }
  serialize([s, t, e, i], n) {
    const r = [], a = e - s, o = i - t;
    for (const l of this.#s) {
      const h = new Array(l.length);
      for (let c = 0; c < l.length; c += 2)
        h[c] = s + l[c] * a, h[c + 1] = i - l[c + 1] * o;
      r.push(h);
    }
    return r;
  }
  get box() {
    return this.#t;
  }
}, Rs = class extends nn {
  newFreeDrawOutline(s, t, e, i, n, r) {
    return new Na(s, t, e, i, n, r);
  }
}, Ra = class {
  #t;
  #e;
  constructor(s, t, e, i, n, r, a) {
    this.#t = new Rs(s, t, e, i, n, r, a), this.#e = n;
  }
  add(s, t) {
    return this.#t.add(s, t) ? { path: { d: this.#t.toSVGPath() } } : null;
  }
  addPoints(s) {
    let t = !1;
    for (let e = 0, i = s.length; e < i; e += 2) t = this.#t.add(s[e], s[e + 1]) || t;
    return t ? { path: { d: this.#t.toSVGPath() } } : null;
  }
  end(s, t) {
    return s === void 0 ? null : this.add(s, t);
  }
  isEmpty() {
    return this.#t.isEmpty();
  }
  isCancellable() {
    return this.#t.isCancellable();
  }
  removeLastElement() {
    return this.#t.removeLastElement();
  }
  updateProperty(s, t) {
    return null;
  }
  getOutlines() {
    const s = this.#t.getOutlines();
    return s.buildFocusOutline(2 * this.#e), s;
  }
  get defaultSVGProperties() {
    return {
      bbox: [
        0,
        0,
        1,
        1
      ],
      root: { viewBox: "0 0 1 1" },
      rootClass: {
        highlight: !0,
        free: !0
      },
      path: { d: this.#t.toSVGPath() }
    };
  }
}, Na = class ln extends rn {
  static #t = 1.5;
  newOutliner(t, e, i, n, r, a, o = 0) {
    return new Rs(t, e, i, n, r, a, o);
  }
  get isFree() {
    return !0;
  }
  buildFocusOutline(t) {
    this.focusOutline = this.getNewOutline(t / 2 + ln.#t, 25e-4);
  }
  get defaultSVGProperties() {
    return an(this);
  }
  getFocusSVGProperties(t) {
    return on(this, t);
  }
  get focusMustRemoveSelfIntersections() {
    return !0;
  }
  updateRotation(t) {
    return { root: { "data-main-rotation": t } };
  }
  updateProperty(t, e) {
    if (t !== "thickness") return null;
    const i = this.updateThickness(e / 2);
    return this.buildFocusOutline(e), i;
  }
  getPathResizedSVGProperties() {
    return { path: { d: this.toSVGPath() } };
  }
}, Ba = class hn extends Fs {
  constructor(t = null) {
    super(), super.updateProperties(t);
  }
  updateSVGProperty(t, e) {
    t !== "thickness" && super.updateSVGProperty(t, e);
  }
  clone() {
    const t = new hn();
    return t.updateAll(this), t;
  }
}, gi = class Ct extends Os {
  #t = null;
  #e = 0;
  #s = null;
  #i = 0;
  #n = "";
  #a = "";
  static _DEFAULT_OPACITY = 1;
  static _DEFAULT_THICKNESS = 12;
  static _defaultDrawingOptions = null;
  static _type = "highlight";
  static _editorType = O.HIGHLIGHT;
  static get _keyboardManager() {
    const t = Ct.prototype;
    return P(this, "_keyboardManager", new de([
      [
        ["ArrowLeft"],
        t._moveCaret,
        { args: [0] }
      ],
      [
        ["ArrowRight"],
        t._moveCaret,
        { args: [1] }
      ],
      [
        ["ArrowUp"],
        t._moveCaret,
        { args: [2] }
      ],
      [
        ["ArrowDown"],
        t._moveCaret,
        { args: [3] }
      ]
    ]));
  }
  constructor(t) {
    super({
      ...t,
      name: "highlightEditor"
    }), this.#t = t.anchorNode || null, this.#e = t.anchorOffset || 0, this.#s = t.focusNode || null, this.#i = t.focusOffset || 0, this.#n = t.methodOfCreation || (this._drawOutlines?.isFree ? "main_toolbar" : ""), this.#a = t.text || "", this._isDraggable = !1, this.defaultL10nId = "pdfjs-editor-highlight-editor", this.rotate();
  }
  static initialize(t, e) {
    V.initialize(t, e), this._defaultDrawingOptions ||= new Ba({
      fill: e.highlightColors?.values().next().value || "#fff066",
      "fill-opacity": Ct._DEFAULT_OPACITY,
      thickness: Ct._DEFAULT_THICKNESS
    });
  }
  static getDefaultDrawingOptions(t) {
    const e = this._defaultDrawingOptions.clone();
    return e.updateProperties(t), e;
  }
  static get typesMap() {
    return P(this, "typesMap", /* @__PURE__ */ new Map([[N.HIGHLIGHT_COLOR, "fill"], [N.HIGHLIGHT_THICKNESS, "thickness"]]));
  }
  static get isDrawer() {
    return !1;
  }
  static get _hasClipPath() {
    return !0;
  }
  static get _hasDrawClass() {
    return !1;
  }
  _addOutlines(t) {
    const { boxes: e, drawOutlines: i } = t;
    !e && !i || (this._drawingOptions ||= t.drawingOptions || Ct.getDefaultDrawingOptions(), e && (t = {
      ...t,
      drawOutlines: Ss.build(e, this._uiManager.direction === "ltr")
    }), super._addOutlines(t));
  }
  get colorType() {
    return N.HIGHLIGHT_COLOR;
  }
  get color() {
    return this._drawingOptions.fill;
  }
  get opacity() {
    return this._drawingOptions["fill-opacity"];
  }
  get _opacityName() {
    return "fill-opacity";
  }
  get _drawRotation() {
    return this._drawOutlines?.isFree ? this.rotation : 0;
  }
  get isResizable() {
    return !1;
  }
  get _mustBeDisabledOnCommit() {
    return !1;
  }
  get _mustFixPosition() {
    return !this._drawOutlines?.isFree;
  }
  get telemetryInitialData() {
    return {
      action: "added",
      type: this._drawOutlines.isFree ? "free_highlight" : "highlight",
      color: this._uiManager.getNonHCMColorName(this.color),
      thickness: this._drawingOptions.thickness,
      methodOfCreation: this.#n
    };
  }
  get telemetryFinalData() {
    return {
      type: "highlight",
      color: this._uiManager.getNonHCMColorName(this.color)
    };
  }
  static computeTelemetryFinalData(t) {
    return { numberOfColors: t.get("color").size };
  }
  translateInPage(t, e) {
  }
  get toolbarPosition() {
    return this.#r(this._drawOutlines.focusOutline.lastPoint);
  }
  get commentButtonPosition() {
    return this.#r(this._drawOutlines.firstPoint);
  }
  #r([t, e]) {
    const [i, n, r, a] = this._drawOutlines.box;
    return [(t - i) / r, (e - n) / a];
  }
  updateParams(t, e) {
    switch (t) {
      case N.HIGHLIGHT_COLOR:
        this._updateColorAndOpacity(e, Ct._DEFAULT_OPACITY, t), this._reportTelemetry({
          action: "color_changed",
          color: this._uiManager.getNonHCMColorName(e)
        }, !0);
        break;
      case N.HIGHLIGHT_THICKNESS:
        super.updateParams(t, e), this._reportTelemetry({
          action: "thickness_changed",
          thickness: e
        }, !0);
    }
  }
  get propertiesToUpdate() {
    const t = super.propertiesToUpdate;
    return t.push([N.HIGHLIGHT_FREE, this._drawOutlines.isFree]), t;
  }
  get toolbarButtons() {
    return this._uiManager.highlightColors ? (this._colorPicker = new Yi({ editor: this }), [["colorPicker", this._colorPicker]]) : super.toolbarButtons;
  }
  fixAndSetPosition() {
    return super.fixAndSetPosition(this._drawRotation);
  }
  getRect(t, e) {
    return super.getRect(t, e, this._drawRotation);
  }
  onceAdded(t) {
    this.annotationElementId || this.parent.addUndoableEditor(this), t && this.div.focus();
  }
  remove() {
    this._reportTelemetry({ action: "deleted" }), super.remove();
  }
  render() {
    if (this.div) return this.div;
    const t = super.render();
    return this.#a && (t.setAttribute("aria-label", this.#a), t.setAttribute("role", "mark")), this._drawOutlines.isFree ? t.classList.add("free") : t.addEventListener("keydown", this.#o.bind(this), { signal: this._uiManager._signal }), this.enableEditing(), t;
  }
  #o(t) {
    Ct._keyboardManager.exec(this, t);
  }
  _moveCaret(t) {
    switch (this.parent.unselect(this), t) {
      case 0:
      case 2:
        this.#l(!0);
        break;
      case 1:
      case 3:
        this.#l(!1);
    }
  }
  #l(t) {
    if (!this.#t) return;
    const e = window.getSelection();
    t ? e.setPosition(this.#t, this.#e) : e.setPosition(this.#s, this.#i);
  }
  unselect() {
    super.unselect(), this._drawOutlines.isFree || this.#l(!1);
  }
  static createDrawerInstance({ x: t, y: e, box: i, parent: n, isLTR: r }) {
    return new Ra(t, e, i, n.scale, this._defaultDrawingOptions.thickness / 2, r, 1e-3);
  }
  static _getDrawingTarget(t, { target: e }) {
    return e.closest(".textLayer");
  }
  static _getPointerCoords({ x: t, y: e }) {
    return [t, e];
  }
  static _addDrawingListeners(t, e) {
    t.classList.add("free"), e.addEventListener("abort", () => t.classList.remove("free"), { once: !0 }), window.addEventListener("blur", () => this._endDraw(null), { signal: e }), window.addEventListener("pointerdown", et, {
      capture: !0,
      passive: !1,
      signal: e
    });
  }
  static _endDrawingSession(t = !1) {
    return this.endDrawing(t);
  }
  createDrawingOptions({ color: t, opacity: e, thickness: i }) {
    const { _defaultDrawingOptions: n, _DEFAULT_OPACITY: r } = Ct;
    this._drawingOptions = Ct.getDefaultDrawingOptions({
      fill: _.makeHexColor(...t),
      "fill-opacity": e || r,
      thickness: i || n.thickness
    });
  }
  static deserializeDraw(t, e, i, n, r, a, o) {
    const { quadPoints: l } = a;
    if (l) {
      const p = [];
      for (let f = 0, m = l.length; f < m; f += 8) p.push({
        x: (l[f] - t) / i,
        y: 1 - (l[f + 1] - e) / n,
        width: (l[f + 2] - l[f]) / i,
        height: (l[f + 1] - l[f + 5]) / n
      });
      return Ss.build(p, o.direction === "ltr");
    }
    const h = a.thickness || this._defaultDrawingOptions.thickness, c = (a.inkLists || a.outlines.points)[0], d = new Rs(c[0] - t, n - (c[1] - e), [
      0,
      0,
      i,
      n
    ], 1, h / 2, !0, 1e-3);
    for (let p = 0, f = c.length; p < f; p += 2) d.add(c[p] - t, n - (c[p + 1] - e));
    const u = d.getOutlines();
    return u.buildFocusOutline(h), u;
  }
  static async deserialize(t, e, i) {
    let n = null;
    if (t instanceof Zi) {
      const { data: { quadPoints: a, rect: o, rotation: l, id: h, color: c, opacity: d, popupRef: u, richText: p, contentsObj: f, creationDate: m, modificationDate: g }, parent: { page: { pageNumber: b } } } = t;
      n = t = {
        annotationType: O.HIGHLIGHT,
        color: Array.from(c),
        opacity: d,
        quadPoints: a,
        pageIndex: b - 1,
        rect: o.slice(0),
        rotation: l,
        annotationElementId: h,
        id: h,
        deleted: !1,
        popupRef: u,
        richText: p,
        comment: f?.str || null,
        creationDate: m,
        modificationDate: g
      };
    } else if (t instanceof Ls) {
      const { data: { inkLists: a, rect: o, rotation: l, id: h, color: c, borderStyle: { rawWidth: d }, popupRef: u, richText: p, contentsObj: f, creationDate: m, modificationDate: g }, parent: { page: { pageNumber: b } } } = t;
      n = t = {
        annotationType: O.HIGHLIGHT,
        color: Array.from(c),
        thickness: d,
        inkLists: a,
        pageIndex: b - 1,
        rect: o.slice(0),
        rotation: l,
        annotationElementId: h,
        id: h,
        deleted: !1,
        popupRef: u,
        richText: p,
        comment: f?.str || null,
        creationDate: m,
        modificationDate: g
      };
    }
    const r = await super.deserialize(t, e, i);
    return r._initialData = n, t.comment && r.setCommentData(t), r;
  }
  serialize(t = !1) {
    if (this.isEmpty() || t) return null;
    if (this.deleted) return this.serializeDeleted();
    const e = super.serialize(t);
    return Object.assign(e, {
      color: V._colorManager.convert(this._uiManager.getNonHCMColor(this.color)),
      opacity: this.opacity,
      thickness: this._drawingOptions.thickness,
      quadPoints: this._drawOutlines.serializeQuadPoints(this.pageTranslation, this.pageDimensions),
      outlines: this._drawOutlines.serialize(e.rect, this._drawRotation)
    }), this.addComment(e), this.annotationElementId && !this.#h(e) ? null : (e.id = this.annotationElementId, e);
  }
  #h(t) {
    const { color: e } = this._initialData;
    return this.hasEditedComment || t.color.some((i, n) => i !== e[n]);
  }
  renderAnnotationElement(t) {
    return this.deleted ? (t.hide(), null) : (t.updateEdited({
      rect: this.getPDFRect(),
      popup: this.comment
    }), null);
  }
}, Ha = class {
  #t = /* @__PURE__ */ new Float64Array(6);
  #e = /* @__PURE__ */ new Float64Array(2);
  #s;
  #i;
  #n;
  #a;
  #r;
  #o = "";
  #l = 0;
  #h = new ue();
  #u;
  #d;
  constructor(s, t, e, i, n, r) {
    this.#u = e, this.#d = i, this.#n = n, this.#a = r, [s, t] = this.#f(s, t);
    const a = this.#s = [
      NaN,
      NaN,
      NaN,
      NaN,
      s,
      t
    ];
    this.#r = [s, t], this.#i = [{
      line: a,
      points: this.#r
    }], this.#t.set(a, 0), this.#e.set([s, t], 0);
  }
  updateProperty(s, t) {
    s === "stroke-width" && (this.#a = t);
  }
  #f(s, t) {
    return T._normalizePoint(s, t, this.#u, this.#d, this.#n);
  }
  isEmpty() {
    return !this.#i?.length;
  }
  isCancellable() {
    return this.#r.length <= 10;
  }
  add(s, t) {
    return this.#g(s, t) && this.toSVGPath(), { path: { d: this.#m() } };
  }
  addPoints(s) {
    let t = !1;
    for (let e = 0, i = s.length; e < i; e += 2)
      this.#g(s[e], s[e + 1]) && (t = !0, this.#r.length <= 6 && (this.toSVGPath(), t = !1));
    return t && this.toSVGPath(), { path: { d: this.#m() } };
  }
  #g(s, t) {
    [s, t] = this.#f(s, t), this.#e.set([s, t], 0);
    const [e, i, n, r] = this.#t.subarray(2, 6), a = s - n, o = t - r;
    return Math.hypot(this.#u * a, this.#d * o) <= 2 ? !1 : (this.#r.push(s, t), isNaN(e) ? (this.#t.set([
      n,
      r,
      s,
      t
    ], 2), this.#s.push(NaN, NaN, NaN, NaN, s, t), !0) : (isNaN(this.#t[0]) && this.#s.splice(6, 6), this.#t.set([
      e,
      i,
      n,
      r,
      s,
      t
    ], 0), this.#s.push(...T.createBezierPoints(e, i, n, r, s, t)), !0));
  }
  end(s, t) {
    return s !== void 0 && this.#g(s, t) ? { path: { d: this.toSVGPath() } } : this.#r.length === 2 ? { path: { d: this.toSVGPath() } } : { path: { d: this.#o } };
  }
  startNew(s, t, e, i, n) {
    this.#u = e, this.#d = i, this.#n = n, [s, t] = this.#f(s, t);
    const r = this.#s = [
      NaN,
      NaN,
      NaN,
      NaN,
      s,
      t
    ];
    this.#r = [s, t], this.#e.set([s, t], 0);
    const a = this.#i.at(-1);
    return a && (a.line = new Float32Array(a.line), a.points = new Float32Array(a.points)), this.#i.push({
      line: r,
      points: this.#r
    }), this.#t.set(r, 0), this.#l = 0, this.toSVGPath(), null;
  }
  getLastElement() {
    return this.#i.at(-1);
  }
  setLastElement(s) {
    return this.#i ? (this.#i.push(s), this.#s = s.line, this.#r = s.points, this.#l = 0, { path: { d: this.toSVGPath() } }) : this.#h.setLastElement(s);
  }
  removeLastElement() {
    if (!this.#i) return this.#h.removeLastElement();
    this.#i.pop(), this.#o = "";
    for (let s = 0, t = this.#i.length; s < t; s++) {
      const { line: e, points: i } = this.#i[s];
      this.#s = e, this.#r = i, this.#l = 0, this.toSVGPath();
    }
    return { path: { d: this.#o } };
  }
  #m() {
    const s = T.svgRound(this.#e[0]), t = T.svgRound(this.#e[1]);
    if (this.#r.length === 2) {
      const e = T.svgRound(this.#s[4]), i = T.svgRound(this.#s[5]);
      return `${this.#o} M ${e} ${i} L ${s} ${t}`;
    }
    return `${this.#o} L ${s} ${t}`;
  }
  toSVGPath() {
    const s = T.svgRound(this.#s[4]), t = T.svgRound(this.#s[5]);
    if (this.#r.length === 2)
      return this.#o = `${this.#o} M ${s} ${t} Z`, this.#o;
    if (this.#r.length <= 6) {
      const i = this.#o.lastIndexOf("M");
      this.#o = `${this.#o.slice(0, i)} M ${s} ${t}`, this.#l = 6;
    }
    if (this.#r.length === 4) {
      const i = T.svgRound(this.#s[10]), n = T.svgRound(this.#s[11]);
      return this.#o = `${this.#o} L ${i} ${n}`, this.#l = 12, this.#o;
    }
    const e = [];
    this.#l === 0 && (e.push(`M ${s} ${t}`), this.#l = 6);
    for (let i = this.#l, n = this.#s.length; i < n; i += 6) {
      const [r, a, o, l, h, c] = this.#s.slice(i, i + 6).map(T.svgRound);
      e.push(`C${r} ${a} ${o} ${l} ${h} ${c}`);
    }
    return this.#o += e.join(" "), this.#l = this.#s.length, this.#o;
  }
  getOutlines(s, t, e, i) {
    const n = this.#i.at(-1);
    return n.line = new Float32Array(n.line), n.points = new Float32Array(n.points), this.#h.build(this.#i, s, t, e, this.#n, this.#a, i), this.#t = null, this.#s = null, this.#i = null, this.#o = null, this.#h;
  }
  get defaultSVGProperties() {
    return {
      root: { viewBox: "0 0 10000 10000" },
      rootClass: { draw: !0 },
      bbox: [
        0,
        0,
        1,
        1
      ]
    };
  }
}, ue = class extends T {
  #t;
  #e = 0;
  #s;
  #i;
  #n;
  #a;
  #r;
  #o;
  #l;
  build(s, t, e, i, n, r, a) {
    this.#n = t, this.#a = e, this.#r = i, this.#o = n, this.#l = r, this.#s = a ?? 0, this.#i = s, this.#d();
  }
  get thickness() {
    return this.#l;
  }
  setLastElement(s) {
    return this.#i.push(s), { path: { d: this.toSVGPath() } };
  }
  removeLastElement() {
    return this.#i.pop(), { path: { d: this.toSVGPath() } };
  }
  toSVGPath() {
    const s = [];
    for (const { line: t } of this.#i) {
      if (s.push(`M${T.svgRound(t[4])} ${T.svgRound(t[5])}`), t.length === 6) {
        s.push("Z");
        continue;
      }
      if (t.length === 12 && isNaN(t[6])) {
        s.push(`L${T.svgRound(t[10])} ${T.svgRound(t[11])}`);
        continue;
      }
      for (let e = 6, i = t.length; e < i; e += 6) {
        const [n, r, a, o, l, h] = t.subarray(e, e + 6).map(T.svgRound);
        s.push(`C${n} ${r} ${a} ${o} ${l} ${h}`);
      }
    }
    return s.join("");
  }
  serialize([s, t, e, i], n) {
    const r = [], a = [], [o, l, h, c] = this.#u();
    let d, u, p, f, m, g, b, y, A;
    switch (this.#o) {
      case 0:
        A = T._rescale, d = s, u = t + i, p = e, f = -i, m = s + o * e, g = t + (1 - l - c) * i, b = s + (o + h) * e, y = t + (1 - l) * i;
        break;
      case 90:
        A = T._rescaleAndSwap, d = s, u = t, p = e, f = i, m = s + l * e, g = t + o * i, b = s + (l + c) * e, y = t + (o + h) * i;
        break;
      case 180:
        A = T._rescale, d = s + e, u = t, p = -e, f = i, m = s + (1 - o - h) * e, g = t + l * i, b = s + (1 - o) * e, y = t + (l + c) * i;
        break;
      case 270:
        A = T._rescaleAndSwap, d = s + e, u = t + i, p = -e, f = -i, m = s + (1 - l - c) * e, g = t + (1 - o - h) * i, b = s + (1 - l) * e, y = t + (1 - o) * i;
    }
    for (const { line: w, points: v } of this.#i)
      r.push(A(w, d, u, p, f, n ? new Array(w.length) : null)), a.push(A(v, d, u, p, f, n ? new Array(v.length) : null));
    return {
      lines: r,
      points: a,
      rect: [
        m,
        g,
        b,
        y
      ]
    };
  }
  static deserialize(s, t, e, i, n, { paths: { lines: r, points: a }, rotation: o, thickness: l }) {
    const h = [];
    let c, d, u, p, f;
    switch (o) {
      case 0:
        f = T._rescale, c = -s / e, d = t / i + 1, u = 1 / e, p = -1 / i;
        break;
      case 90:
        f = T._rescaleAndSwap, c = -t / i, d = -s / e, u = 1 / i, p = 1 / e;
        break;
      case 180:
        f = T._rescale, c = s / e + 1, d = -t / i, u = -1 / e, p = 1 / i;
        break;
      case 270:
        f = T._rescaleAndSwap, c = t / i + 1, d = s / e + 1, u = -1 / i, p = -1 / e;
    }
    if (!r) {
      r = [];
      for (const g of a) {
        const b = g.length;
        if (b === 2) {
          r.push(new Float32Array([
            NaN,
            NaN,
            NaN,
            NaN,
            g[0],
            g[1]
          ]));
          continue;
        }
        if (b === 4) {
          r.push(new Float32Array([
            NaN,
            NaN,
            NaN,
            NaN,
            g[0],
            g[1],
            NaN,
            NaN,
            NaN,
            NaN,
            g[2],
            g[3]
          ]));
          continue;
        }
        const y = new Float32Array(3 * (b - 2));
        r.push(y);
        let [A, w, v, S] = g.subarray(0, 4);
        y.set([
          NaN,
          NaN,
          NaN,
          NaN,
          A,
          w
        ], 0);
        for (let E = 4; E < b; E += 2) {
          const C = g[E], x = g[E + 1];
          y.set(T.createBezierPoints(A, w, v, S, C, x), (E - 2) * 3), [A, w, v, S] = [
            v,
            S,
            C,
            x
          ];
        }
      }
    }
    for (let g = 0, b = r.length; g < b; g++) h.push({
      line: f(r[g].map((y) => y ?? NaN), c, d, u, p),
      points: f(a[g].map((y) => y ?? NaN), c, d, u, p)
    });
    const m = new this.prototype.constructor();
    return m.build(h, e, i, 1, o, l, n), m;
  }
  #h(s = this.#l) {
    const t = this.#s + s / 2 * this.#r;
    return this.#o % 180 === 0 ? [t / this.#n, t / this.#a] : [t / this.#a, t / this.#n];
  }
  #u() {
    const [s, t, e, i] = this.#t, [n, r] = this.#h(0);
    return [
      s + n,
      t + r,
      e - 2 * n,
      i - 2 * r
    ];
  }
  #d() {
    const s = this.#t = Ht.slice();
    for (const { line: i } of this.#i) {
      if (i.length <= 12) {
        for (let a = 4, o = i.length; a < o; a += 6) _.pointBoundingBox(i[a], i[a + 1], s);
        continue;
      }
      let n = i[4], r = i[5];
      for (let a = 6, o = i.length; a < o; a += 6) {
        const [l, h, c, d, u, p] = i.subarray(a, a + 6);
        _.bezierBoundingBox(n, r, l, h, c, d, u, p, s), n = u, r = p;
      }
    }
    const [t, e] = this.#h();
    s[0] = Y(s[0] - t, 0, 1), s[1] = Y(s[1] - e, 0, 1), s[2] = Y(s[2] + t, 0, 1), s[3] = Y(s[3] + e, 0, 1), s[2] -= s[0], s[3] -= s[1];
  }
  get box() {
    return this.#t;
  }
  updateProperty(s, t) {
    return s === "stroke-width" ? this.#f(t) : null;
  }
  #f(s) {
    const [t, e] = this.#h();
    this.#l = s;
    const [i, n] = this.#h(), [r, a] = [i - t, n - e], o = this.#t;
    return o[0] -= r, o[1] -= a, o[2] += 2 * r, o[3] += 2 * a, o;
  }
  updateParentDimensions([s, t], e) {
    const [i, n] = this.#h();
    this.#n = s, this.#a = t, this.#r = e;
    const [r, a] = this.#h(), o = r - i, l = a - n, h = this.#t;
    return h[0] -= o, h[1] -= l, h[2] += 2 * o, h[3] += 2 * l, h;
  }
  updateRotation(s) {
    return this.#e = s, { path: { transform: this.rotationTransform } };
  }
  get viewBox() {
    return this.#t.map(T.svgRound).join(" ");
  }
  get defaultProperties() {
    const [s, t] = this.#t;
    return {
      root: { viewBox: this.viewBox },
      path: { "transform-origin": `${T.svgRound(s)} ${T.svgRound(t)}` }
    };
  }
  get rotationTransform() {
    const [, , s, t] = this.#t;
    let e = 0, i = 0, n = 0, r = 0, a = 0, o = 0;
    switch (this.#e) {
      case 90:
        i = t / s, n = -s / t, a = s;
        break;
      case 180:
        e = -1, r = -1, a = s, o = t;
        break;
      case 270:
        i = -t / s, n = s / t, o = t;
        break;
      default:
        return "";
    }
    return `matrix(${e} ${i} ${n} ${r} ${T.svgRound(a)} ${T.svgRound(o)})`;
  }
  getPathResizingSVGProperties([s, t, e, i]) {
    const [n, r] = this.#h(), [a, o, l, h] = this.#t;
    if (Math.abs(l - n) <= T.PRECISION || Math.abs(h - r) <= T.PRECISION) {
      const f = s + e / 2 - (a + l / 2), m = t + i / 2 - (o + h / 2);
      return { path: {
        "transform-origin": `${T.svgRound(s)} ${T.svgRound(t)}`,
        transform: `${this.rotationTransform} translate(${f} ${m})`
      } };
    }
    const c = (e - 2 * n) / (l - 2 * n), d = (i - 2 * r) / (h - 2 * r), u = l / e, p = h / i;
    return { path: {
      "transform-origin": `${T.svgRound(a)} ${T.svgRound(o)}`,
      transform: `${this.rotationTransform} scale(${u} ${p}) translate(${T.svgRound(n)} ${T.svgRound(r)}) scale(${c} ${d}) translate(${T.svgRound(-n)} ${T.svgRound(-r)})`
    } };
  }
  getPathResizedSVGProperties([s, t, e, i]) {
    const [n, r] = this.#h(), a = this.#t, [o, l, h, c] = a;
    if (a[0] = s, a[1] = t, a[2] = e, a[3] = i, Math.abs(h - n) <= T.PRECISION || Math.abs(c - r) <= T.PRECISION) {
      const m = s + e / 2 - (o + h / 2), g = t + i / 2 - (l + c / 2);
      for (const { line: b, points: y } of this.#i)
        T._translate(b, m, g, b), T._translate(y, m, g, y);
      return {
        root: { viewBox: this.viewBox },
        path: {
          "transform-origin": `${T.svgRound(s)} ${T.svgRound(t)}`,
          transform: this.rotationTransform || null,
          d: this.toSVGPath()
        }
      };
    }
    const d = (e - 2 * n) / (h - 2 * n), u = (i - 2 * r) / (c - 2 * r), p = -d * (o + n) + s + n, f = -u * (l + r) + t + r;
    if (d !== 1 || u !== 1 || p !== 0 || f !== 0) for (const { line: m, points: g } of this.#i)
      T._rescale(m, p, f, d, u, m), T._rescale(g, p, f, d, u, g);
    return {
      root: { viewBox: this.viewBox },
      path: {
        "transform-origin": `${T.svgRound(s)} ${T.svgRound(t)}`,
        transform: this.rotationTransform || null,
        d: this.toSVGPath()
      }
    };
  }
  getPathTranslatedSVGProperties([s, t], e) {
    const [i, n] = e, r = this.#t, a = s - r[0], o = t - r[1];
    if (this.#n === i && this.#a === n) for (const { line: l, points: h } of this.#i)
      T._translate(l, a, o, l), T._translate(h, a, o, h);
    else {
      const l = this.#n / i, h = this.#a / n;
      this.#n = i, this.#a = n;
      for (const { line: c, points: d } of this.#i)
        T._rescale(c, a, o, l, h, c), T._rescale(d, a, o, l, h, d);
      r[2] *= l, r[3] *= h;
    }
    return r[0] = s, r[1] = t, {
      root: { viewBox: this.viewBox },
      path: {
        d: this.toSVGPath(),
        "transform-origin": `${T.svgRound(s)} ${T.svgRound(t)}`
      }
    };
  }
  get defaultSVGProperties() {
    const s = this.#t;
    return {
      root: { viewBox: this.viewBox },
      rootClass: { draw: !0 },
      path: {
        d: this.toSVGPath(),
        "transform-origin": `${T.svgRound(s[0])} ${T.svgRound(s[1])}`,
        transform: this.rotationTransform || null
      },
      bbox: s
    };
  }
}, cn = class dn extends Fs {
  constructor(t) {
    super(), this._viewParameters = t, super.updateProperties({
      fill: "none",
      stroke: V._defaultLineColor,
      "stroke-opacity": 1,
      "stroke-width": 1,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-miterlimit": 10
    });
  }
  updateSVGProperty(t, e) {
    t === "stroke-width" && (e ??= this["stroke-width"], e *= this._viewParameters.realScale), super.updateSVGProperty(t, e);
  }
  clone() {
    const t = new dn(this._viewParameters);
    return t.updateAll(this), t;
  }
}, Ua = class un extends Os {
  static _type = "ink";
  static _editorType = O.INK;
  static _defaultDrawingOptions = null;
  constructor(t) {
    super({
      ...t,
      name: "inkEditor"
    }), this._willKeepAspectRatio = !0, this.defaultL10nId = "pdfjs-editor-ink-editor";
  }
  static initialize(t, e) {
    V.initialize(t, e), this._defaultDrawingOptions = new cn(e.viewParameters);
  }
  static getDefaultDrawingOptions(t) {
    const e = this._defaultDrawingOptions.clone();
    return e.updateProperties(t), e;
  }
  static get supportMultipleDrawings() {
    return !0;
  }
  static get typesMap() {
    return P(this, "typesMap", /* @__PURE__ */ new Map([
      [N.INK_THICKNESS, "stroke-width"],
      [N.INK_COLOR, "stroke"],
      [N.INK_OPACITY, "stroke-opacity"]
    ]));
  }
  static createDrawerInstance({ x: t, y: e, box: [, , i, n], rotation: r }) {
    return new Ha(t, e, i, n, r, this._defaultDrawingOptions["stroke-width"]);
  }
  static deserializeDraw(t, e, i, n, r, a) {
    return ue.deserialize(t, e, i, n, r, a);
  }
  static async deserialize(t, e, i) {
    let n = null;
    if (t instanceof Ls) {
      const { data: { inkLists: a, rect: o, rotation: l, id: h, color: c, opacity: d, borderStyle: { rawWidth: u }, popupRef: p, richText: f, contentsObj: m, creationDate: g, modificationDate: b }, parent: { page: { pageNumber: y } } } = t;
      n = t = {
        annotationType: O.INK,
        color: Array.from(c),
        thickness: u,
        opacity: d,
        paths: { points: a },
        boxes: null,
        pageIndex: y - 1,
        rect: o.slice(0),
        rotation: l,
        annotationElementId: h,
        id: h,
        deleted: !1,
        popupRef: p,
        richText: f,
        comment: m?.str || null,
        creationDate: g,
        modificationDate: b
      };
    }
    const r = await super.deserialize(t, e, i);
    return r._initialData = n, t.comment && r.setCommentData(t), r;
  }
  get toolbarButtons() {
    return this._colorPicker ||= new Ki(this), [["colorPicker", this._colorPicker]];
  }
  get colorType() {
    return N.INK_COLOR;
  }
  get colorAndOpacityType() {
    return N.INK_COLOR_AND_OPACITY;
  }
  get opacityType() {
    return N.INK_OPACITY;
  }
  updateParams(t, e) {
    if (t === N.INK_COLOR_AND_OPACITY) {
      this._updateColorAndOpacity(e.color, e.opacity);
      return;
    }
    super.updateParams(t, e);
  }
  static updateDefaultParams(t, e) {
    if (t === N.INK_COLOR_AND_OPACITY) {
      super.updateDefaultParams(N.INK_COLOR, e.color), super.updateDefaultParams(N.INK_OPACITY, e.opacity);
      return;
    }
    super.updateDefaultParams(t, e);
  }
  get color() {
    return this._drawingOptions.stroke;
  }
  get opacity() {
    return this._drawingOptions["stroke-opacity"];
  }
  onScaleChanging() {
    if (!this.parent) return;
    super.onScaleChanging();
    const { _drawId: t, _drawingOptions: e, parent: i } = this;
    e.updateSVGProperty("stroke-width"), i.drawLayer.updateProperties(t, e.toSVGProperties());
  }
  static onScaleChangingWhenDrawing() {
    const t = this._currentParent;
    t && (super.onScaleChangingWhenDrawing(), this._defaultDrawingOptions.updateSVGProperty("stroke-width"), t.drawLayer.updateProperties(this._currentDrawId, this._defaultDrawingOptions.toSVGProperties()));
  }
  createDrawingOptions({ color: t, thickness: e, opacity: i }) {
    this._drawingOptions = un.getDefaultDrawingOptions({
      stroke: _.makeHexColor(...t),
      "stroke-width": e,
      "stroke-opacity": i
    });
  }
  serialize(t = !1) {
    if (this.isEmpty()) return null;
    if (this.deleted) return this.serializeDeleted();
    const { lines: e, points: i } = this.serializeDraw(t), { _drawingOptions: { stroke: n, "stroke-opacity": r, "stroke-width": a } } = this, o = Object.assign(super.serialize(t), {
      color: V._colorManager.convert(n),
      opacity: r,
      thickness: a,
      paths: {
        lines: e,
        points: i
      }
    });
    return this.addComment(o), t ? (o.isCopy = !0, o) : this.annotationElementId && !this.#t(o) ? null : (o.id = this.annotationElementId, o);
  }
  #t(t) {
    const { color: e, thickness: i, opacity: n, pageIndex: r } = this._initialData;
    return this.hasEditedComment || this._hasBeenMoved || this._hasBeenResized || t.color.some((a, o) => a !== e[o]) || t.thickness !== i || t.opacity !== n || t.pageIndex !== r;
  }
  renderAnnotationElement(t) {
    if (this.deleted)
      return t.hide(), null;
    const { points: e, rect: i } = this.serializeDraw(!1);
    return t.updateEdited({
      rect: i,
      thickness: this._drawingOptions["stroke-width"],
      points: e,
      popup: this.comment
    }), null;
  }
}, Es = class extends ue {
  toSVGPath() {
    let s = super.toSVGPath();
    return s.endsWith("Z") || (s += "Z"), s;
  }
}, Ae = 8, ve = 3, Kt = class {
  static #t = {
    maxDim: 512,
    sigmaSFactor: 0.02,
    sigmaR: 25,
    kernelSize: 16
  };
  static #e(s, t, e, i) {
    return e -= s, i -= t, e === 0 ? i > 0 ? 0 : 4 : e === 1 ? i + 6 : 2 - i;
  }
  static #s = new Int32Array([
    0,
    1,
    -1,
    1,
    -1,
    0,
    -1,
    -1,
    0,
    -1,
    1,
    -1,
    1,
    0,
    1,
    1
  ]);
  static #i(s, t, e, i, n, r, a) {
    const o = this.#e(e, i, n, r);
    for (let l = 0; l < 8; l++) {
      const h = (-l + o - a + 16) % 8, c = this.#s[2 * h], d = this.#s[2 * h + 1];
      if (s[(e + c) * t + (i + d)] !== 0) return h;
    }
    return -1;
  }
  static #n(s, t, e, i, n, r, a) {
    const o = this.#e(e, i, n, r);
    for (let l = 0; l < 8; l++) {
      const h = (l + o + a + 16) % 8, c = this.#s[2 * h], d = this.#s[2 * h + 1];
      if (s[(e + c) * t + (i + d)] !== 0) return h;
    }
    return -1;
  }
  static #a(s, t, e, i) {
    const n = s.length, r = new Int32Array(n);
    for (let h = 0; h < n; h++) r[h] = s[h] <= i ? 1 : 0;
    for (let h = 1; h < e - 1; h++) r[h * t] = r[h * t + t - 1] = 0;
    for (let h = 0; h < t; h++) r[h] = r[t * e - 1 - h] = 0;
    let a = 1, o;
    const l = [];
    for (let h = 1; h < e - 1; h++) {
      o = 1;
      for (let c = 1; c < t - 1; c++) {
        const d = h * t + c, u = r[d];
        if (u === 0) continue;
        let p = h, f = c;
        if (u === 1 && r[d - 1] === 0)
          a += 1, f -= 1;
        else if (u >= 1 && r[d + 1] === 0)
          a += 1, f += 1, u > 1 && (o = u);
        else {
          u !== 1 && (o = Math.abs(u));
          continue;
        }
        const m = [c, h], g = f === c + 1, b = {
          isHole: g,
          points: m,
          id: a,
          parent: 0
        };
        l.push(b);
        let y;
        for (const M of l) if (M.id === o) {
          y = M;
          break;
        }
        y ? y.isHole ? b.parent = g ? y.parent : o : b.parent = g ? o : y.parent : b.parent = g ? o : 0;
        const A = this.#i(r, t, h, c, p, f, 0);
        if (A === -1) {
          r[d] = -a, r[d] !== 1 && (o = Math.abs(r[d]));
          continue;
        }
        let w = this.#s[2 * A], v = this.#s[2 * A + 1];
        const S = h + w, E = c + v;
        p = S, f = E;
        let C = h, x = c;
        for (; ; ) {
          const M = this.#n(r, t, C, x, p, f, 1);
          w = this.#s[2 * M], v = this.#s[2 * M + 1];
          const k = C + w, I = x + v;
          m.push(I, k);
          const B = C * t + x;
          if (r[B + 1] === 0 ? r[B] = -a : r[B] === 1 && (r[B] = a), k === h && I === c && C === S && x === E) {
            r[d] !== 1 && (o = Math.abs(r[d]));
            break;
          } else
            p = C, f = x, C = k, x = I;
        }
      }
    }
    return l;
  }
  static #r(s, t, e, i) {
    if (e - t <= 4) {
      for (let S = t; S < e - 2; S += 2) i.push(s[S], s[S + 1]);
      return;
    }
    const n = s[t], r = s[t + 1], a = s[e - 4] - n, o = s[e - 3] - r, l = Math.hypot(a, o), h = a / l, c = o / l, d = h * r - c * n, u = o / a, p = 1 / l, f = Math.atan(u), m = Math.cos(f), g = Math.sin(f), b = p * (Math.abs(m) + Math.abs(g)), y = p * (1 - b + b ** 2), A = Math.max(Math.atan(Math.abs(g + m) * y), Math.atan(Math.abs(g - m) * y));
    let w = 0, v = t;
    for (let S = t + 2; S < e - 2; S += 2) {
      const E = Math.abs(d - h * s[S + 1] + c * s[S]);
      E > w && (v = S, w = E);
    }
    w > (l * A) ** 2 ? (this.#r(s, t, v + 2, i), this.#r(s, v, e, i)) : i.push(n, r);
  }
  static #o(s) {
    const t = [], e = s.length;
    return this.#r(s, 0, e, t), t.push(s[e - 2], s[e - 1]), t.length <= 4 ? null : t;
  }
  static #l(s, t, e, i, n, r) {
    const a = new Float32Array(r ** 2), o = -2 * i ** 2, l = r >> 1;
    for (let f = 0; f < r; f++) {
      const m = (f - l) ** 2;
      for (let g = 0; g < r; g++) a[f * r + g] = Math.exp((m + (g - l) ** 2) / o);
    }
    const h = /* @__PURE__ */ new Float32Array(256), c = -2 * n ** 2;
    for (let f = 0; f < 256; f++) h[f] = Math.exp(f ** 2 / c);
    const d = s.length, u = new Uint8Array(d), p = /* @__PURE__ */ new Uint32Array(256);
    for (let f = 0; f < e; f++) for (let m = 0; m < t; m++) {
      const g = f * t + m, b = s[g];
      let y = 0, A = 0;
      for (let v = 0; v < r; v++) {
        const S = f + v - l;
        if (!(S < 0 || S >= e))
          for (let E = 0; E < r; E++) {
            const C = m + E - l;
            if (C < 0 || C >= t) continue;
            const x = s[S * t + C], M = a[v * r + E] * h[Math.abs(x - b)];
            y += x * M, A += M;
          }
      }
      const w = u[g] = Math.round(y / A);
      p[w]++;
    }
    return [u, p];
  }
  static #h(s) {
    const t = /* @__PURE__ */ new Uint32Array(256);
    for (const e of s) t[e]++;
    return t;
  }
  static #u(s) {
    const t = s.length, e = new Uint8ClampedArray(t >> 2);
    let i = -1 / 0, n = 1 / 0;
    for (let a = 0, o = e.length; a < o; a++) {
      const l = e[a] = s[a << 2];
      i = Math.max(i, l), n = Math.min(n, l);
    }
    const r = 255 / (i - n);
    for (let a = 0, o = e.length; a < o; a++) e[a] = (e[a] - n) * r;
    return e;
  }
  static #d(s) {
    let t, e = -1 / 0, i = -1 / 0;
    const n = s.findIndex((o) => o !== 0);
    let r = n, a = n;
    for (t = n; t < 256; t++) {
      const o = s[t];
      o > e && (t - r > i && (i = t - r, a = t - 1), e = o, r = t);
    }
    for (t = a - 1; t >= 0 && !(s[t] > s[t + 1]); t--) ;
    return t;
  }
  static #f(s) {
    const t = s, { width: e, height: i } = s, { maxDim: n } = this.#t;
    let r = e, a = i;
    if (e > n || i > n) {
      let h = e, c = i, d = Math.log2(Math.max(e, i) / n);
      const u = Math.floor(d);
      d = d === u ? u - 1 : u;
      for (let f = 0; f < d; f++) {
        r = Math.ceil(h / 2), a = Math.ceil(c / 2);
        const m = new OffscreenCanvas(r, a);
        m.getContext("2d").drawImage(s, 0, 0, h, c, 0, 0, r, a), h = r, c = a, s !== t && s.close(), s = m.transferToImageBitmap();
      }
      const p = Math.min(n / r, n / a);
      r = Math.round(r * p), a = Math.round(a * p);
    }
    const o = new OffscreenCanvas(r, a).getContext("2d", { willReadFrequently: !0 });
    o.fillStyle = "white", o.fillRect(0, 0, r, a), o.filter = "grayscale(1)", o.drawImage(s, 0, 0, s.width, s.height, 0, 0, r, a);
    const l = o.getImageData(0, 0, r, a).data;
    return [
      this.#u(l),
      r,
      a
    ];
  }
  static extractContoursFromText(s, { fontFamily: t, fontStyle: e, fontWeight: i }, n, r, a, o) {
    let l = new OffscreenCanvas(1, 1), h = l.getContext("2d", { alpha: !1 });
    const c = 200, d = h.font = `${e} ${i} ${c}px ${t}`, { actualBoundingBoxLeft: u, actualBoundingBoxRight: p, actualBoundingBoxAscent: f, actualBoundingBoxDescent: m, fontBoundingBoxAscent: g, fontBoundingBoxDescent: b, width: y } = h.measureText(s), A = 1.5, w = Math.ceil(Math.max(Math.abs(u) + Math.abs(p) || 0, y) * A), v = Math.ceil(Math.max(Math.abs(f) + Math.abs(m) || c, Math.abs(g) + Math.abs(b) || c) * A);
    l = new OffscreenCanvas(w, v), h = l.getContext("2d", {
      alpha: !0,
      willReadFrequently: !0
    }), h.font = d, h.filter = "grayscale(1)", h.fillStyle = "white", h.fillRect(0, 0, w, v), h.fillStyle = "black", h.fillText(s, w * 0.5 / 2, v * 1.5 / 2);
    const S = this.#u(h.getImageData(0, 0, w, v).data), E = this.#h(S), C = this.#d(E), x = this.#a(S, w, v, C);
    return this.processDrawnLines({
      lines: {
        curves: x,
        width: w,
        height: v
      },
      pageWidth: n,
      pageHeight: r,
      rotation: a,
      innerMargin: o,
      mustSmooth: !0,
      areContours: !0
    });
  }
  static process(s, t, e, i, n) {
    const [r, a, o] = this.#f(s), [l, h] = this.#l(r, a, o, Math.hypot(a, o) * this.#t.sigmaSFactor, this.#t.sigmaR, this.#t.kernelSize), c = this.#d(h), d = this.#a(l, a, o, c);
    return this.processDrawnLines({
      lines: {
        curves: d,
        width: a,
        height: o
      },
      pageWidth: t,
      pageHeight: e,
      rotation: i,
      innerMargin: n,
      mustSmooth: !0,
      areContours: !0
    });
  }
  static processDrawnLines({ lines: s, pageWidth: t, pageHeight: e, rotation: i, innerMargin: n, mustSmooth: r, areContours: a }) {
    i % 180 !== 0 && ([t, e] = [e, t]);
    const { curves: o, width: l, height: h } = s, c = s.thickness ?? 0, d = [], u = Math.min(t / l, e / h), p = u / t, f = u / e, m = [];
    for (const { points: b } of o) {
      const y = r ? this.#o(b) : b;
      if (!y) continue;
      m.push(y);
      const A = y.length, w = new Float32Array(A), v = new Float32Array(3 * (A === 2 ? 2 : A - 2));
      if (d.push({
        line: v,
        points: w
      }), A === 2) {
        w[0] = y[0] * p, w[1] = y[1] * f, v.set([
          NaN,
          NaN,
          NaN,
          NaN,
          w[0],
          w[1]
        ], 0);
        continue;
      }
      let [S, E, C, x] = y;
      S *= p, E *= f, C *= p, x *= f, w.set([
        S,
        E,
        C,
        x
      ], 0), v.set([
        NaN,
        NaN,
        NaN,
        NaN,
        S,
        E
      ], 0);
      for (let M = 4; M < A; M += 2) {
        const k = w[M] = y[M] * p, I = w[M + 1] = y[M + 1] * f;
        v.set(T.createBezierPoints(S, E, C, x, k, I), (M - 2) * 3), [S, E, C, x] = [
          C,
          x,
          k,
          I
        ];
      }
    }
    if (d.length === 0) return null;
    const g = a ? new Es() : new ue();
    return g.build(d, t, e, 1, i, a ? 0 : c, n), {
      outline: g,
      newCurves: m,
      areContours: a,
      thickness: c,
      width: l,
      height: h
    };
  }
  static async compressSignature({ outlines: s, areContours: t, thickness: e, width: i, height: n }) {
    let r = 1 / 0, a = -1 / 0, o = 0;
    for (const g of s) {
      o += g.length;
      for (let b = 2, y = g.length; b < y; b++) {
        const A = g[b] - g[b - 2];
        r = Math.min(r, A), a = Math.max(a, A);
      }
    }
    let l;
    r >= -128 && a <= 127 ? l = Int8Array : r >= -32768 && a <= 32767 ? l = Int16Array : l = Int32Array;
    const h = s.length, c = Ae + ve * h, d = new Uint32Array(c);
    let u = 0;
    d[u++] = c * Uint32Array.BYTES_PER_ELEMENT + (o - 2 * h) * l.BYTES_PER_ELEMENT, d[u++] = 0, d[u++] = i, d[u++] = n, d[u++] = t ? 0 : 1, d[u++] = Math.max(0, Math.floor(e ?? 0)), d[u++] = h, d[u++] = l.BYTES_PER_ELEMENT;
    for (const g of s)
      d[u++] = g.length - 2, d[u++] = g[0], d[u++] = g[1];
    const p = new CompressionStream("deflate-raw"), f = p.writable.getWriter();
    await f.ready, f.write(d);
    const m = l.prototype.constructor;
    for (const g of s) {
      const b = new m(g.length - 2);
      for (let y = 2, A = g.length; y < A; y++) b[y - 2] = g[y] - g[y - 2];
      f.write(b);
    }
    return f.close(), (await new Response(p.readable).bytes()).toBase64();
  }
  static async decompressSignature(s) {
    try {
      const t = Uint8Array.fromBase64(s), { readable: e, writable: i } = new DecompressionStream("deflate-raw"), n = i.getWriter();
      await n.ready, n.write(t).then(async () => {
        await n.ready, await n.close();
      }).catch(() => {
      });
      let r = null, a = 0;
      for await (const y of e)
        r ||= new Uint8Array(new Uint32Array(y.buffer, 0, 4)[0]), r.set(y, a), a += y.length;
      const o = new Uint32Array(r.buffer, 0, r.length >> 2), l = o[1];
      if (l !== 0) throw new Error(`Invalid version: ${l}`);
      const h = o[2], c = o[3], d = o[4] === 0, u = o[5], p = o[6], f = o[7], m = [], g = (Ae + ve * p) * Uint32Array.BYTES_PER_ELEMENT;
      let b;
      switch (f) {
        case Int8Array.BYTES_PER_ELEMENT:
          b = new Int8Array(r.buffer, g);
          break;
        case Int16Array.BYTES_PER_ELEMENT:
          b = new Int16Array(r.buffer, g);
          break;
        case Int32Array.BYTES_PER_ELEMENT:
          b = new Int32Array(r.buffer, g);
      }
      a = 0;
      for (let y = 0; y < p; y++) {
        const A = o[ve * y + Ae], w = new Float32Array(A + 2);
        m.push(w);
        for (let v = 0; v < 2; v++) w[v] = o[ve * y + Ae + v + 1];
        for (let v = 0; v < A; v++) w[v + 2] = w[v] + b[a++];
      }
      return {
        areContours: d,
        thickness: u,
        outlines: m,
        width: h,
        height: c
      };
    } catch (t) {
      return R(`decompressSignature: ${t}`), null;
    }
  }
}, Ga = class fn extends Fs {
  constructor() {
    super(), super.updateProperties({
      fill: V._defaultLineColor,
      "stroke-width": 0
    });
  }
  clone() {
    const t = new fn();
    return t.updateAll(this), t;
  }
}, $a = class pn extends cn {
  constructor(t) {
    super(t), super.updateProperties({
      stroke: V._defaultLineColor,
      "stroke-width": 1
    });
  }
  clone() {
    const t = new pn(this._viewParameters);
    return t.updateAll(this), t;
  }
}, za = class xt extends Os {
  #t = !1;
  #e = null;
  #s = null;
  #i = null;
  static _type = "signature";
  static _editorType = O.SIGNATURE;
  static _defaultDrawingOptions = null;
  constructor(t) {
    super({
      ...t,
      mustBeCommitted: !0,
      name: "signatureEditor"
    }), this._willKeepAspectRatio = !0, this.#s = t.signatureData || null, this.#e = null, this.defaultL10nId = "pdfjs-editor-signature-editor1";
  }
  static initialize(t, e) {
    V.initialize(t, e), this._defaultDrawingOptions = new Ga(), this._defaultDrawnSignatureOptions = new $a(e.viewParameters);
  }
  static getDefaultDrawingOptions(t) {
    const e = this._defaultDrawingOptions.clone();
    return e.updateProperties(t), e;
  }
  static get supportMultipleDrawings() {
    return !1;
  }
  static get typesMap() {
    return P(this, "typesMap", /* @__PURE__ */ new Map());
  }
  static get isDrawer() {
    return !1;
  }
  get telemetryFinalData() {
    return {
      type: "signature",
      hasDescription: !!this.#e
    };
  }
  static computeTelemetryFinalData(t) {
    const e = t.get("hasDescription");
    return {
      hasAltText: e.get(!0) ?? 0,
      hasNoAltText: e.get(!1) ?? 0
    };
  }
  get isResizable() {
    return !0;
  }
  onScaleChanging() {
    this._drawId !== null && super.onScaleChanging();
  }
  render() {
    if (this.div) return this.div;
    let t, e;
    const { _isCopy: i } = this;
    if (i && (this._isCopy = !1, t = this.x, e = this.y), super.render(), this._drawId === null)
      if (this.#s) {
        const { lines: n, mustSmooth: r, areContours: a, description: o, uuid: l, heightInPage: h } = this.#s, { rawDims: { pageWidth: c, pageHeight: d }, rotation: u } = this.parent.viewport, p = Kt.processDrawnLines({
          lines: n,
          pageWidth: c,
          pageHeight: d,
          rotation: u,
          innerMargin: xt._INNER_MARGIN,
          mustSmooth: r,
          areContours: a
        });
        this.addSignature(p, h, o, l);
      } else
        this.div.setAttribute("data-l10n-args", JSON.stringify({ description: "" })), this.div.hidden = !0, this._uiManager.getSignature(this);
    else this.div.setAttribute("data-l10n-args", JSON.stringify({ description: this.#e || "" }));
    return i && (this._isCopy = !0, this._moveAfterPaste(t, e)), this.div;
  }
  setUuid(t) {
    this.#i = t, this.addEditToolbar();
  }
  getUuid() {
    return this.#i;
  }
  get description() {
    return this.#e;
  }
  set description(t) {
    this.#e = t, this.div && (this.div.setAttribute("data-l10n-args", JSON.stringify({ description: t })), super.addEditToolbar().then((e) => {
      e?.updateEditSignatureButton(t);
    }));
  }
  getSignaturePreview() {
    const { newCurves: t, areContours: e, thickness: i, width: n, height: r } = this.#s, a = Math.max(n, r);
    return {
      areContours: e,
      outline: Kt.processDrawnLines({
        lines: {
          curves: t.map((o) => ({ points: o })),
          thickness: i,
          width: n,
          height: r
        },
        pageWidth: a,
        pageHeight: a,
        rotation: 0,
        innerMargin: 0,
        mustSmooth: !1,
        areContours: e
      }).outline
    };
  }
  get toolbarButtons() {
    return this._uiManager.signatureManager ? [["editSignature", this._uiManager.signatureManager]] : super.toolbarButtons;
  }
  addSignature(t, e, i, n) {
    const { x: r, y: a } = this, { outline: o } = this.#s = t;
    this.#t = o instanceof Es, this.description = i;
    let l;
    this.#t ? l = xt.getDefaultDrawingOptions() : (l = xt._defaultDrawnSignatureOptions.clone(), l.updateProperties({ "stroke-width": o.thickness })), this._addOutlines({
      drawOutlines: o,
      drawingOptions: l
    });
    const [, h] = this.pageDimensions;
    let c = e / h;
    c = c >= 1 ? 0.5 : c, this.width *= c / this.height, this.width >= 1 && (c *= 0.9 / this.width, this.width = 0.9), this.height = c, this.setDims(), this.x = r, this.y = a, this.center(), this._onResized(), this.onScaleChanging(), this.rotate(), this._uiManager.addToAnnotationStorage(this), this.setUuid(n), this._reportTelemetry({
      action: "pdfjs.signature.inserted",
      data: {
        hasBeenSaved: !!n,
        hasDescription: !!i
      }
    }), this.div.hidden = !1;
  }
  getFromImage(t) {
    const { rawDims: { pageWidth: e, pageHeight: i }, rotation: n } = this.parent.viewport;
    return Kt.process(t, e, i, n, xt._INNER_MARGIN);
  }
  getFromText(t, e) {
    const { rawDims: { pageWidth: i, pageHeight: n }, rotation: r } = this.parent.viewport;
    return Kt.extractContoursFromText(t, e, i, n, r, xt._INNER_MARGIN);
  }
  getDrawnSignature(t) {
    const { rawDims: { pageWidth: e, pageHeight: i }, rotation: n } = this.parent.viewport;
    return Kt.processDrawnLines({
      lines: t,
      pageWidth: e,
      pageHeight: i,
      rotation: n,
      innerMargin: xt._INNER_MARGIN,
      mustSmooth: !1,
      areContours: !1
    });
  }
  createDrawingOptions({ areContours: t, thickness: e }) {
    t ? this._drawingOptions = xt.getDefaultDrawingOptions() : (this._drawingOptions = xt._defaultDrawnSignatureOptions.clone(), this._drawingOptions.updateProperties({ "stroke-width": e }));
  }
  serialize(t = !1) {
    if (this.isEmpty()) return null;
    const { lines: e, points: i } = this.serializeDraw(t), { _drawingOptions: { "stroke-width": n } } = this, r = Object.assign(super.serialize(t), {
      isSignature: !0,
      areContours: this.#t,
      color: [
        0,
        0,
        0
      ],
      thickness: this.#t ? 0 : n
    });
    return this.addComment(r), t ? (r.paths = {
      lines: e,
      points: i
    }, r.uuid = this.#i, r.isCopy = !0) : r.lines = e, this.#e && (r.accessibilityData = {
      type: "Figure",
      alt: this.#e
    }), r;
  }
  static deserializeDraw(t, e, i, n, r, a) {
    return a.areContours ? Es.deserialize(t, e, i, n, r, a) : ue.deserialize(t, e, i, n, r, a);
  }
  static async deserialize(t, e, i) {
    const n = await super.deserialize(t, e, i);
    return n.#t = t.areContours, n.description = t.accessibilityData?.alt || "", n.#i = t.uuid, n;
  }
}, ja = class extends V {
  #t = null;
  #e = null;
  #s = null;
  #i = null;
  #n = null;
  #a = "";
  #r = null;
  #o = !1;
  #l = null;
  #h = !1;
  #u = !1;
  static _type = "stamp";
  static _editorType = O.STAMP;
  constructor(s) {
    super({
      ...s,
      name: "stampEditor"
    }), this.#i = s.bitmapUrl, this.#n = s.bitmapFile, this.defaultL10nId = "pdfjs-editor-stamp-editor";
  }
  static initialize(s, t) {
    V.initialize(s, t);
  }
  static isHandlingMimeForPasting(s) {
    return os.includes(s);
  }
  static paste(s, t) {
    t.pasteEditor({ mode: O.STAMP }, { bitmapFile: s.getAsFile() });
  }
  altTextFinish() {
    this._uiManager.useNewAltTextFlow && (this.div.hidden = !1), super.altTextFinish();
  }
  get telemetryFinalData() {
    return {
      type: "stamp",
      hasAltText: !!this.altTextData?.altText
    };
  }
  static computeTelemetryFinalData(s) {
    const t = s.get("hasAltText");
    return {
      hasAltText: t.get(!0) ?? 0,
      hasNoAltText: t.get(!1) ?? 0
    };
  }
  #d(s, t = !1) {
    if (!s) {
      this.remove();
      return;
    }
    this.#t = s.bitmap, t || (this.#e = s.id, this.#h = s.isSvg), s.file && (this.#a = s.file.name), this.#m();
  }
  #f() {
    if (this.#s = null, this._uiManager.enableWaiting(!1), !!this.#r) {
      if (this._uiManager.useNewAltTextWhenAddingImage && this._uiManager.useNewAltTextFlow && this.#t) {
        this.addEditToolbar().then(() => {
          this._editToolbar.hide(), this._uiManager.editAltText(this, !0);
        });
        return;
      }
      if (!this._uiManager.useNewAltTextWhenAddingImage && this._uiManager.useNewAltTextFlow && this.#t) {
        this._reportTelemetry({
          action: "pdfjs.image.image_added",
          data: {
            alt_text_modal: !1,
            alt_text_type: "empty"
          }
        });
        try {
          this.mlGuessAltText();
        } catch {
        }
      }
      this.div.focus();
    }
  }
  async mlGuessAltText(s = null, t = !0) {
    if (this.hasAltTextData()) return null;
    const { mlManager: e } = this._uiManager;
    if (!e) throw new Error("No ML.");
    if (!await e.isEnabledFor("altText")) throw new Error("ML isn't enabled for alt text.");
    const { data: i, width: n, height: r } = s || this.copyCanvas(null, null, !0).imageData, a = await e.guess({
      name: "altText",
      request: {
        data: i,
        width: n,
        height: r,
        channels: i.length / (n * r)
      }
    });
    if (!a) throw new Error("No response from the AI service.");
    if (a.error) throw new Error("Error from the AI service.");
    if (a.cancel) return null;
    if (!a.output) throw new Error("No valid response from the AI service.");
    const o = a.output;
    return await this.setGuessedAltText(o), t && !this.hasAltTextData() && (this.altTextData = {
      alt: o,
      decorative: !1
    }), o;
  }
  #g() {
    if (this.#e) {
      this._uiManager.enableWaiting(!0), this._uiManager.imageManager.getFromId(this.#e).then((e) => this.#d(e, !0)).finally(() => this.#f());
      return;
    }
    if (this.#i) {
      const e = this.#i;
      this.#i = null, this._uiManager.enableWaiting(!0), this.#s = this._uiManager.imageManager.getFromUrl(e).then((i) => this.#d(i)).finally(() => this.#f());
      return;
    }
    if (this.#n) {
      const e = this.#n;
      this.#n = null, this._uiManager.enableWaiting(!0), this.#s = this._uiManager.imageManager.getFromFile(e).then((i) => this.#d(i)).finally(() => this.#f());
      return;
    }
    const s = document.createElement("input");
    s.type = "file", s.accept = os.join(",");
    const t = this._uiManager._signal;
    this.#s = new Promise((e) => {
      s.addEventListener("change", async () => {
        if (!s.files || s.files.length === 0) this.remove();
        else {
          this._uiManager.enableWaiting(!0);
          const i = await this._uiManager.imageManager.getFromFile(s.files[0]);
          this._reportTelemetry({
            action: "pdfjs.image.image_selected",
            data: { alt_text_modal: this._uiManager.useNewAltTextFlow }
          }), this.#d(i);
        }
        e();
      }, { signal: t }), s.addEventListener("cancel", () => {
        this.remove(), e();
      }, { signal: t });
    }).finally(() => this.#f()), s.click();
  }
  remove() {
    this.#e && (this.#t = null, this._uiManager.imageManager.deleteId(this.#e), this.#r?.remove(), this.#r = null, this.#l && (clearTimeout(this.#l), this.#l = null)), super.remove();
  }
  rebuild() {
    if (!this.parent) {
      this.#e && this.#g();
      return;
    }
    super.rebuild(), this.div !== null && (this.#e && this.#r === null && this.#g(), this.isAttachedToDOM || this.parent.add(this));
  }
  onceAdded(s) {
    this._isDraggable = !0, s && this.div.focus();
  }
  isEmpty() {
    return !(this.#s || this.#t || this.#i || this.#n || this.#e || this.#o);
  }
  get toolbarButtons() {
    return [["altText", this.createAltText()]];
  }
  get isResizable() {
    return !0;
  }
  render() {
    if (this.div) return this.div;
    let s, t;
    return this._isCopy && (s = this.x, t = this.y), super.render(), this.div.hidden = !0, this.createAltText(), this.#o || (this.#t ? this.#m() : this.#g()), this._isCopy && this._moveAfterPaste(s, t), this._uiManager.addShouldRescale(this), this.div;
  }
  setCanvas(s, t) {
    const { id: e, bitmap: i } = this._uiManager.imageManager.getFromCanvas(s, t);
    t.remove(), e && this._uiManager.imageManager.isValidId(e) && (this.#e = e, i && (this.#t = i), this.#o = !1, this.#m());
  }
  _onResized() {
    this.onScaleChanging();
  }
  onScaleChanging() {
    if (!this.parent) return;
    this.#l !== null && clearTimeout(this.#l);
    const s = 200;
    this.#l = setTimeout(() => {
      this.#l = null, this.#p();
    }, s);
  }
  #m() {
    const { div: s } = this;
    let { width: t, height: e } = this.#t;
    const [i, n] = this.pageDimensions, r = 0.75;
    if (this.width)
      t = this.width * i, e = this.height * n;
    else if (t > r * i || e > r * n) {
      const o = Math.min(r * i / t, r * n / e);
      t *= o, e *= o;
    }
    this._uiManager.enableWaiting(!1);
    const a = this.#r = document.createElement("canvas");
    a.setAttribute("role", "img"), this.addContainer(a), this.width = t / i, this.height = e / n, this.setDims(), this._initialOptions?.isCentered ? this.center() : this.fixAndSetPosition(), this._initialOptions = null, (!this._uiManager.useNewAltTextWhenAddingImage || !this._uiManager.useNewAltTextFlow || this.annotationElementId) && (s.hidden = !1), this.#p(), this.#u || (this.parent.addUndoableEditor(this), this.#u = !0), this._reportTelemetry({ action: "inserted_image" }), this.#a && this.div.setAttribute("aria-description", this.#a), this.annotationElementId || this._uiManager.a11yAlert(V._l10nAlert.stamp);
  }
  copyCanvas(s, t, e = !1) {
    s ||= 224;
    const { width: i, height: n } = this.#t, r = new Ft();
    let a = this.#t, o = i, l = n, h = null;
    if (t) {
      if (i > t || n > t) {
        const v = Math.min(t / i, t / n);
        o = Math.floor(i * v), l = Math.floor(n * v);
      }
      h = document.createElement("canvas");
      const d = h.width = Math.ceil(o * r.sx), u = h.height = Math.ceil(l * r.sy);
      this.#h || (a = this.#c(d, u));
      const p = h.getContext("2d");
      p.filter = this._uiManager.hcmFilter;
      let f = "white", m = "#cfcfd8";
      this._uiManager.hcmFilter !== "none" ? m = "black" : On.isDarkMode && (f = "#8f8f9d", m = "#42414d");
      const g = 15, b = g * r.sx, y = g * r.sy, A = new OffscreenCanvas(b * 2, y * 2), w = A.getContext("2d");
      w.fillStyle = f, w.fillRect(0, 0, b * 2, y * 2), w.fillStyle = m, w.fillRect(0, 0, b, y), w.fillRect(b, y, b, y), p.fillStyle = p.createPattern(A, "repeat"), p.fillRect(0, 0, d, u), p.drawImage(a, 0, 0, a.width, a.height, 0, 0, d, u);
    }
    let c = null;
    if (e) {
      let d, u;
      if (r.symmetric && a.width < s && a.height < s)
        d = a.width, u = a.height;
      else if (a = this.#t, i > s || n > s) {
        const f = Math.min(s / i, s / n);
        d = Math.floor(i * f), u = Math.floor(n * f), this.#h || (a = this.#c(d, u));
      }
      const p = new OffscreenCanvas(d, u).getContext("2d", { willReadFrequently: !0 });
      p.drawImage(a, 0, 0, a.width, a.height, 0, 0, d, u), c = {
        width: d,
        height: u,
        data: p.getImageData(0, 0, d, u).data
      };
    }
    return {
      canvas: h,
      width: o,
      height: l,
      imageData: c
    };
  }
  #c(s, t) {
    const { width: e, height: i } = this.#t;
    let n = e, r = i, a = this.#t;
    for (; n > 2 * s || r > 2 * t; ) {
      const o = n, l = r;
      n > 2 * s && (n = Math.ceil(n / 2)), r > 2 * t && (r = Math.ceil(r / 2));
      const h = new OffscreenCanvas(n, r);
      h.getContext("2d").drawImage(a, 0, 0, o, l, 0, 0, n, r), a = h.transferToImageBitmap();
    }
    return a;
  }
  #p() {
    const [s, t] = this.parentDimensions, { width: e, height: i } = this, n = new Ft(), r = Math.ceil(e * s * n.sx), a = Math.ceil(i * t * n.sy), o = this.#r;
    if (!o || o.width === r && o.height === a) return;
    o.width = r, o.height = a;
    const l = this.#h ? this.#t : this.#c(r, a), h = o.getContext("2d");
    h.filter = this._uiManager.hcmFilter, h.drawImage(l, 0, 0, l.width, l.height, 0, 0, r, a);
  }
  #b(s) {
    if (s) {
      if (this.#h) {
        const e = this._uiManager.imageManager.getSvgUrl(this.#e);
        if (e) return e;
      }
      const t = document.createElement("canvas");
      return { width: t.width, height: t.height } = this.#t, t.getContext("2d").drawImage(this.#t, 0, 0), t.toDataURL();
    }
    if (this.#h) {
      const [t, e] = this.pageDimensions, i = Math.round(this.width * t * Jt.PDF_TO_CSS_UNITS), n = Math.round(this.height * e * Jt.PDF_TO_CSS_UNITS), r = new OffscreenCanvas(i, n);
      return r.getContext("2d").drawImage(this.#t, 0, 0, this.#t.width, this.#t.height, 0, 0, i, n), r.transferToImageBitmap();
    }
    return structuredClone(this.#t);
  }
  static async deserialize(s, t, e) {
    let i = null, n = !1;
    if (s instanceof tn) {
      const { data: { rect: f, rotation: m, id: g, structParent: b, popupRef: y, richText: A, contentsObj: w, creationDate: v, modificationDate: S }, container: E, parent: { page: { pageNumber: C } }, canvas: x } = s;
      let M, k;
      x ? (delete s.canvas, { id: M, bitmap: k } = e.imageManager.getFromCanvas(E.id, x), x.remove()) : (n = !0, s._hasNoCanvas = !0);
      const I = (await t._structTree.getAriaAttributes(`${qt}${g}`))?.get("aria-label") || "";
      i = s = {
        annotationType: O.STAMP,
        bitmapId: M,
        bitmap: k,
        pageIndex: C - 1,
        rect: f.slice(0),
        rotation: m,
        annotationElementId: g,
        id: g,
        deleted: !1,
        accessibilityData: {
          decorative: !1,
          altText: I
        },
        isSvg: !1,
        structParent: b,
        popupRef: y,
        richText: A,
        comment: w?.str || null,
        creationDate: v,
        modificationDate: S
      };
    }
    const r = await super.deserialize(s, t, e), { rect: a, bitmap: o, bitmapUrl: l, bitmapId: h, isSvg: c, accessibilityData: d } = s;
    n ? (e.addMissingCanvas(s.id, r), r.#o = !0) : h && e.imageManager.isValidId(h) ? (r.#e = h, o && (r.#t = o)) : r.#i = l, r.#h = c;
    const [u, p] = r.pageDimensions;
    return r.width = (a[2] - a[0]) / u, r.height = (a[3] - a[1]) / p, d && (r.altTextData = d), r._initialData = i, s.comment && r.setCommentData(s), r.#u = !!i, r;
  }
  serialize(s = !1, t = null) {
    if (this.isEmpty()) return null;
    if (this.deleted) return this.serializeDeleted();
    const e = Object.assign(super.serialize(s), {
      bitmapId: this.#e,
      isSvg: this.#h
    });
    if (this.addComment(e), s)
      return e.bitmapUrl = this.#b(!0), e.accessibilityData = this.serializeAltText(!0), e.isCopy = !0, e;
    const { decorative: i, altText: n } = this.serializeAltText(!1);
    if (!i && n && (e.accessibilityData = {
      type: "Figure",
      alt: n
    }), this.annotationElementId) {
      const a = this.#y(e);
      return a.isSame ? null : (a.isSameAltText ? delete e.accessibilityData : e.accessibilityData.structParent = this._initialData.structParent ?? -1, e.id = this.annotationElementId, delete e.bitmapId, e);
    }
    if (t === null) return e;
    t.stamps ||= /* @__PURE__ */ new Map();
    const r = this.#h ? (e.rect[2] - e.rect[0]) * (e.rect[3] - e.rect[1]) : null;
    if (!t.stamps.has(this.#e))
      t.stamps.set(this.#e, {
        area: r,
        serialized: e
      }), e.bitmap = this.#b(!1);
    else if (this.#h) {
      const a = t.stamps.get(this.#e);
      r > a.area && (a.area = r, a.serialized.bitmap.close(), a.serialized.bitmap = this.#b(!1));
    }
    return e;
  }
  #y(s) {
    const { pageIndex: t, accessibilityData: { altText: e } } = this._initialData, i = s.pageIndex === t, n = (s.accessibilityData?.alt || "") === e;
    return {
      isSame: !this.hasEditedComment && !this._hasBeenMoved && !this._hasBeenResized && i && n,
      isSameAltText: n
    };
  }
  renderAnnotationElement(s) {
    return this.deleted ? (s.hide(), null) : (s.updateEdited({
      rect: this.getPDFRect(),
      popup: this.comment
    }), null);
  }
}, Va = class Dt {
  #t;
  #e = !1;
  #s = null;
  #i = null;
  #n = null;
  #a = /* @__PURE__ */ new Map();
  #r = !1;
  #o = !1;
  #l = !1;
  #h = null;
  #u = null;
  #d = null;
  #f = null;
  #g = null;
  #m = -1;
  #c;
  static _initialized = !1;
  static #p = new Map([
    Oa,
    Ua,
    ja,
    gi,
    za
  ].map((t) => [t._editorType, t]));
  constructor({ uiManager: t, pageIndex: e, div: i, structTreeLayer: n, accessibilityManager: r, annotationLayer: a, drawLayer: o, textLayer: l, viewport: h, l10n: c }) {
    const d = [...Dt.#p.values()];
    if (!Dt._initialized) {
      Dt._initialized = !0;
      for (const u of d) u.initialize(c, t);
    }
    t.registerEditorTypes(d), this.#c = t, this.pageIndex = e, this.div = i, this.#t = r, this.#s = a, this.viewport = h, this.#d = l, this.drawLayer = o, this._structTree = n, this.#c.addLayer(this);
  }
  get isEmpty() {
    return this.#a.size === 0;
  }
  get isInvisible() {
    return this.isEmpty && this.#c.getMode() === O.NONE;
  }
  updateToolbar(t) {
    this.#c.updateToolbar(t);
  }
  updateMode(t = this.#c.getMode()) {
    switch (this.#S(), t) {
      case O.NONE:
        this.div.classList.toggle("nonEditing", !0), this.disableTextSelection(), this.togglePointerEvents(!1), this.toggleAnnotationLayerPointerEvents(!0), this.disableClick();
        return;
      case O.INK:
        this.disableTextSelection(), this.togglePointerEvents(!0), this.enableClick();
        break;
      case O.HIGHLIGHT:
        this.enableTextSelection(), this.togglePointerEvents(!1), this.disableClick();
        break;
      default:
        this.disableTextSelection(), this.togglePointerEvents(!0), this.enableClick();
    }
    this.toggleAnnotationLayerPointerEvents(!1);
    const { classList: e } = this.div;
    if (e.toggle("nonEditing", !1), t === O.POPUP) e.toggle("commentEditing", !0);
    else {
      e.toggle("commentEditing", !1);
      for (const i of Dt.#p.values()) e.toggle(`${i._type}Editing`, t === i._editorType);
    }
    this.div.hidden = !1;
  }
  hasTextLayer(t) {
    return t === this.#d?.div;
  }
  setEditingState(t) {
    this.#c.setEditingState(t);
  }
  addCommands(t) {
    this.#c.addCommands(t);
  }
  cleanUndoStack(t) {
    this.#c.cleanUndoStack(t);
  }
  toggleDrawing(t = !1) {
    this.div.classList.toggle("drawing", !t);
  }
  togglePointerEvents(t = !1) {
    this.div.classList.toggle("disabled", !t);
  }
  toggleAnnotationLayerPointerEvents(t = !1) {
    this.#s?.togglePointerEvents(t);
  }
  get #b() {
    return this.#a.size !== 0 ? this.#a.values() : this.#c.getEditors(this.pageIndex);
  }
  async enable() {
    this.#l = !0, this.div.tabIndex = 0, this.togglePointerEvents(!0), this.div.classList.toggle("nonEditing", !1), this.#g?.abort(), this.#g = null;
    const t = /* @__PURE__ */ new Set();
    for (const i of this.#b)
      i.enableEditing(), i.show(!0), i.annotationElementId && (this.#c.removeChangedExistingAnnotation(i), t.add(i.annotationElementId));
    const e = this.#s;
    if (e) for (const i of e.getEditableAnnotations()) {
      if (i.hide(), this.#c.isDeletedAnnotationElement(i.data.id) || t.has(i.data.id)) continue;
      const n = await this.deserialize(i);
      n && (this.addOrRebuild(n), n.enableEditing());
    }
    this.#l = !1, this.#c._eventBus.dispatch("editorsrendered", {
      source: this,
      pageNumber: this.pageIndex + 1
    });
  }
  disable() {
    if (this.#o = !0, this.div.tabIndex = -1, this.togglePointerEvents(!1), this.div.classList.toggle("nonEditing", !0), this.#d && !this.#g) {
      this.#g = new AbortController();
      const n = this.#c.combinedSignal(this.#g);
      this.#d.div.addEventListener("pointerdown", (r) => {
        const { clientX: o, clientY: l, timeStamp: h } = r;
        if (h - this.#m > 500) {
          this.#m = h;
          return;
        }
        this.#m = -1;
        const { classList: c } = this.div;
        c.toggle("getElements", !0);
        const d = document.elementsFromPoint(o, l);
        if (c.toggle("getElements", !1), !this.div.contains(d[0])) return;
        let u;
        const p = new RegExp(`^${Qt}[0-9]+$`);
        for (const m of d) if (p.test(m.id)) {
          u = m.id;
          break;
        }
        if (!u) return;
        const f = this.#a.get(u);
        f?.annotationElementId === null && (et(r), f.dblclick(r));
      }, {
        signal: n,
        capture: !0
      });
    }
    const t = this.#s, e = [];
    if (t) {
      const n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map();
      for (const a of this.#b) {
        if (a.disableEditing(), !a.annotationElementId) {
          e.push(a);
          continue;
        }
        if (a.serialize() !== null) {
          n.set(a.annotationElementId, a);
          continue;
        } else r.set(a.annotationElementId, a);
        this.getEditableAnnotation(a.annotationElementId)?.show(), a.remove();
      }
      for (const a of t.getEditableAnnotations()) {
        const { id: o } = a.data;
        if (this.#c.isDeletedAnnotationElement(o)) {
          a.updateEdited({ deleted: !0 });
          continue;
        }
        let l = r.get(o);
        if (l) {
          l.resetAnnotationElement(a), l.show(!1), a.show();
          continue;
        }
        l = n.get(o), l && (this.#c.addChangedExistingAnnotation(l), l.renderAnnotationElement(a) && l.show(!1)), a.show();
      }
    }
    this.#S(), this.isEmpty && (this.div.hidden = !0);
    const { classList: i } = this.div;
    for (const n of Dt.#p.values()) i.remove(`${n._type}Editing`);
    this.disableTextSelection(), this.toggleAnnotationLayerPointerEvents(!0), t?.updateFakeAnnotations(e), this.#o = !1;
  }
  getEditableAnnotation(t) {
    return this.#s?.getEditableAnnotation(t) || null;
  }
  setActiveEditor(t) {
    this.#c.getActive() !== t && this.#c.setActiveEditor(t);
  }
  enableTextSelection() {
    if (this.div.tabIndex = -1, this.#d?.div && !this.#f) {
      this.#f = new AbortController();
      const t = this.#c.combinedSignal(this.#f);
      this.#d.div.addEventListener("pointerdown", this.#y.bind(this), { signal: t }), this.#d.div.classList.add("highlighting");
    }
  }
  disableTextSelection() {
    this.div.tabIndex = 0, this.#d?.div && this.#f && (this.#f.abort(), this.#f = null, this.#d.div.classList.remove("highlighting"));
  }
  #y(t) {
    this.#c.unselectAll();
    const { target: e } = t;
    if (e === this.#d.div || (e.getAttribute("role") === "img" || e.classList.contains("endOfContent") || e.classList.contains("textLayerImages") || e.classList.contains("textLayerImagePlaceholder")) && this.#d.div.contains(e)) {
      const { isMac: i } = z.platform;
      if (t.button !== 0 || t.ctrlKey && i) return;
      this.#c.showAllEditors("highlight", !0, !0), gi.startDrawing(this, this.#c, this.#c.direction === "ltr", t), t.preventDefault();
    }
  }
  enableClick() {
    if (this.#i) return;
    this.#i = new AbortController();
    const t = this.#c.combinedSignal(this.#i);
    this.div.addEventListener("pointerdown", this.pointerdown.bind(this), { signal: t });
    const e = this.pointerup.bind(this);
    this.div.addEventListener("pointerup", e, { signal: t }), this.div.addEventListener("pointercancel", e, { signal: t });
  }
  disableClick() {
    this.#i?.abort(), this.#i = null;
  }
  attach(t) {
    this.#a.set(t.id, t);
    const { annotationElementId: e } = t;
    e && this.#c.isDeletedAnnotationElement(e) && this.#c.removeDeletedAnnotationElement(t);
  }
  detach(t) {
    this.#a.delete(t.id), this.#t?.removePointerInTextLayer(t.contentDiv), !this.#o && t.annotationElementId && this.#c.addDeletedAnnotationElement(t);
  }
  remove(t) {
    this.detach(t), this.#c.removeEditor(t), t.div.remove(), t.isAttachedToDOM = !1;
  }
  changeParent(t) {
    t.parent !== this && (t.parent && t.annotationElementId && (this.#c.addDeletedAnnotationElement(t), V.deleteAnnotationElement(t), t.annotationElementId = null), this.attach(t), t.parent?.detach(t), t.setParent(this), t.div && t.isAttachedToDOM && (t.div.remove(), this.div.append(t.div)));
  }
  add(t) {
    if (!(t.parent === this && t.isAttachedToDOM)) {
      if (this.changeParent(t), this.#c.addEditor(t), this.attach(t), !t.isAttachedToDOM) {
        const e = t.render();
        this.div.append(e), t.isAttachedToDOM = !0;
      }
      t.fixAndSetPosition(), t.onceAdded(!this.#l), this.#c.addToAnnotationStorage(t), t._reportTelemetry(t.telemetryInitialData);
    }
  }
  moveEditorInDOM(t) {
    if (!t.isAttachedToDOM) return;
    const { activeElement: e } = document;
    t.div.contains(e) && !this.#n && (t._focusEventsAllowed = !1, this.#n = setTimeout(() => {
      this.#n = null, t.div.contains(document.activeElement) ? t._focusEventsAllowed = !0 : (t.div.addEventListener("focusin", () => {
        t._focusEventsAllowed = !0;
      }, {
        once: !0,
        signal: this.#c._signal
      }), e.focus());
    }, 0)), t._structTreeParentId = this.#t?.moveElementInDOM(this.div, t.div, t.contentDiv, !0);
  }
  addOrRebuild(t) {
    t.needsToBeRebuilt() ? (t.parent ||= this, t.rebuild(), t.show()) : this.add(t);
  }
  addUndoableEditor(t) {
    const e = () => t._uiManager.rebuild(t), i = () => {
      t.remove();
    };
    this.addCommands({
      cmd: e,
      undo: i,
      mustExec: !1
    });
  }
  getEditorByUID(t) {
    for (const e of this.#a.values()) if (e.uid === t) return e;
    return null;
  }
  get #A() {
    return Dt.#p.get(this.#c.getMode());
  }
  combinedSignal(t) {
    return this.#c.combinedSignal(t);
  }
  #v(t) {
    const e = this.#A;
    return e ? new e.prototype.constructor(t) : null;
  }
  canCreateNewEmptyEditor() {
    return this.#A?.canCreateNewEmptyEditor();
  }
  async pasteEditor(t, e) {
    this.updateToolbar(t), await this.#c.updateMode(t.mode);
    const { offsetX: i, offsetY: n } = this.#E(), r = this.#c.getId(), a = this.#v({
      parent: this,
      id: r,
      x: i,
      y: n,
      uiManager: this.#c,
      isCentered: !0,
      ...e
    });
    a && this.add(a);
  }
  async deserialize(t) {
    return await Dt.#p.get(t.annotationType ?? t.annotationEditorType)?.deserialize(t, this, this.#c) || null;
  }
  createAndAddNewEditor(t, e, i = {}) {
    const n = this.#c.getId(), r = this.#v({
      parent: this,
      id: n,
      x: t.offsetX,
      y: t.offsetY,
      uiManager: this.#c,
      isCentered: e,
      ...i
    });
    return r && this.add(r), r;
  }
  get boundingClientRect() {
    return this.div.getBoundingClientRect();
  }
  #E() {
    const { x: t, y: e, width: i, height: n } = this.boundingClientRect, r = Math.max(0, t), a = Math.max(0, e), o = Math.min(window.innerWidth, t + i), l = Math.min(window.innerHeight, e + n), h = (r + o) / 2 - t, c = (a + l) / 2 - e, [d, u] = this.viewport.rotation % 180 === 0 ? [h, c] : [c, h];
    return {
      offsetX: d,
      offsetY: u
    };
  }
  addNewEditor(t = {}) {
    this.createAndAddNewEditor(this.#E(), !0, t);
  }
  setSelected(t) {
    this.#c.setSelected(t);
  }
  toggleSelected(t) {
    this.#c.toggleSelected(t);
  }
  unselect(t) {
    this.#c.unselect(t);
  }
  pointerup(t) {
    const { isMac: e } = z.platform;
    if (t.button !== 0 || t.ctrlKey && e || t.target !== this.div || !this.#r || (this.#r = !1, this.#A?.isDrawer && this.#A.supportMultipleDrawings)) return;
    if (!this.#e) {
      this.#e = !0;
      return;
    }
    const i = this.#c.getMode();
    if (i === O.STAMP || i === O.POPUP || i === O.SIGNATURE) {
      this.#c.unselectAll();
      return;
    }
    this.createAndAddNewEditor(t, !1);
  }
  pointerdown(t) {
    if (this.#c.getMode() === O.HIGHLIGHT && this.enableTextSelection(), this.#r) {
      this.#r = !1;
      return;
    }
    const { isMac: e } = z.platform;
    if (t.button !== 0 || t.ctrlKey && e || t.target !== this.div) return;
    if (this.#r = !0, this.#A?.isDrawer) {
      this.startDrawingSession(t);
      return;
    }
    const i = this.#c.getActive();
    this.#e = !i || i.isEmpty();
  }
  startDrawingSession(t) {
    if (this.div.focus({ preventScroll: !0 }), this.#h) {
      this.#A.startDrawing(this, this.#c, !1, t);
      return;
    }
    this.#c.setCurrentDrawingSession(this), this.#h = new AbortController();
    const e = this.#c.combinedSignal(this.#h);
    this.div.addEventListener("blur", ({ relatedTarget: i }) => {
      i && !this.div.contains(i) && (this.#u = null, this.commitOrRemove());
    }, { signal: e }), this.#A.startDrawing(this, this.#c, !1, t);
  }
  pause(t) {
    if (t) {
      const { activeElement: e } = document;
      this.div.contains(e) && (this.#u = e);
      return;
    }
    this.#u && setTimeout(() => {
      this.#u?.focus(), this.#u = null;
    }, 0);
  }
  endDrawingSession(t = !1) {
    return this.#h ? (this.#c.setCurrentDrawingSession(null), this.#h.abort(), this.#h = null, this.#u = null, this.#A.endDrawing(t)) : null;
  }
  findNewParent(t, e, i) {
    const n = this.#c.findParent(e, i);
    return n === null || n === this ? !1 : (n.changeParent(t), !0);
  }
  commitOrRemove() {
    return this.#h ? (this.endDrawingSession(), !0) : !1;
  }
  onScaleChanging() {
    this.#h && this.#A.onScaleChangingWhenDrawing(this);
  }
  destroy() {
    this.commitOrRemove(), this.#c.getActive()?.parent === this && (this.#c.commitOrRemove(), this.#c.setActiveEditor(null)), this.#n && (clearTimeout(this.#n), this.#n = null);
    for (const t of this.#a.values())
      this.#t?.removePointerInTextLayer(t.contentDiv), t.setParent(null), t.isAttachedToDOM = !1, t.div.remove();
    this.div = null, this.#a.clear(), this.#c.removeLayer(this);
  }
  #S() {
    for (const t of this.#a.values()) t.isEmpty() && t.remove();
  }
  async render({ viewport: t }) {
    this.viewport = t, Ut(this.div, t);
    for (const e of this.#c.getEditors(this.pageIndex))
      this.add(e), e.rebuild();
    await this.#c.findClonesForPage(this), this.div.hidden = this.isEmpty, this.updateMode();
  }
  update({ viewport: t }) {
    this.#c.commitOrRemove(), this.#S();
    const e = this.viewport.rotation, i = t.rotation;
    if (this.viewport = t, Ut(this.div, { rotation: i }), e !== i) for (const n of this.#a.values()) n.rotate(i);
  }
  get pageDimensions() {
    const { pageWidth: t, pageHeight: e } = this.viewport.rawDims;
    return [t, e];
  }
  get scale() {
    return this.#c.viewParameters.realScale;
  }
};
function Wa(s, t) {
  return s === t ? 0 : s.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}
function we(s) {
  return s ? s.nodeType === Node.ELEMENT_NODE ? s.closest(".textLayer") : s.parentElement?.closest(".textLayer") || null : null;
}
function Xa(s, t, e, i) {
  if (s === e) return t <= i;
  const n = s.compareDocumentPosition(e);
  return n & Node.DOCUMENT_POSITION_FOLLOWING ? !0 : n & Node.DOCUMENT_POSITION_PRECEDING ? !1 : null;
}
function mi(s, t, e) {
  if (s.nodeType !== Node.ELEMENT_NODE || !s.classList.contains("textLayer") || t !== s.childNodes.length) return {
    container: s,
    offset: t
  };
  let i = s.lastChild;
  return i?.nodeType === Node.ELEMENT_NODE && i.classList.contains("endOfContent") && (i = i.previousSibling), !i || !e.contains(i) ? null : i.nodeType === Node.TEXT_NODE ? {
    container: i,
    offset: i.textContent.length
  } : {
    container: i,
    offset: i.childNodes.length
  };
}
var Ya = class F {
  #t = null;
  #e = /* @__PURE__ */ new Map();
  #s = null;
  #i = null;
  #n = null;
  #a = null;
  #r = /* @__PURE__ */ new Map();
  static #o = 0;
  static #l = 0;
  static #h = null;
  static #u = /* @__PURE__ */ new Set();
  static #d = !1;
  static #f = /* @__PURE__ */ new Set();
  static #g = /* @__PURE__ */ new WeakMap();
  constructor({ filterFactory: t = null, pageColors: e = null, pageIndex: i, textLayer: n = null }) {
    if (this.pageIndex = i, this.#i = t, this.#n = e, n) {
      const r = F.#g.get(n);
      if (r?.selectionDiv && (r.selectionDiv.remove(), F.#u.delete(r.selectionDiv)), F.#g.set(n, { drawLayer: this }), F.#f.add(n), this.#s = n, this.#a = new MutationObserver((a) => {
        if (!(!this.#t || !this.#s?.isConnected || !F.#c())) {
          for (const { addedNodes: o } of a) for (const l of o) if (l.nodeType === Node.ELEMENT_NODE && l.classList.contains("endOfContent")) {
            F.#b();
            return;
          }
        }
      }), this.#a.observe(n, { childList: !0 }), F.#h === null) {
        F.#h = new AbortController();
        const { signal: a } = F.#h;
        document.addEventListener("selectionchange", F.#b.bind(F), { signal: a }), document.addEventListener("pointerdown", () => {
          F.#d = !0;
        }, { signal: a }), document.addEventListener("pointerup", () => {
          F.#d = !1;
        }, { signal: a }), window.addEventListener("blur", () => {
          F.#d = !1;
        }, { signal: a });
      }
    }
  }
  setParent(t) {
    if (!this.#t) {
      this.#t = t, this.#s?.isConnected && F.#c() && F.#b();
      return;
    }
    if (this.#t !== t) {
      if (this.#e.size > 0) for (const e of this.#e.values())
        e.remove(), t.append(e);
      this.#t = t;
    }
  }
  static #m(t) {
    const e = this.#g.get(t);
    e?.selectionDiv && (e.selectionDiv.remove(), this.#u.delete(e.selectionDiv), e.selectionDiv = null, e.path = null);
  }
  static #c() {
    const t = document.getSelection();
    return !!t && !t.isCollapsed;
  }
  static #p() {
    return this.#f.keys().filter((t) => t.isConnected).toArray().sort(Wa);
  }
  static #b() {
    const t = document.getSelection();
    if (!t || t.isCollapsed) {
      for (const a of this.#u) a.remove();
      this.#u.clear();
      return;
    }
    const e = /* @__PURE__ */ new WeakMap(), i = this.#p(), n = [];
    for (let a = 0, o = t.rangeCount; a < o; a++) {
      const l = t.getRangeAt(a);
      if (l.collapsed) continue;
      let { startContainer: h, startOffset: c, endContainer: d, endOffset: u } = l, p = we(h), f = we(d);
      const m = p === null, g = f === null;
      if (this.#d && m !== g) return;
      if (t.rangeCount === 1) {
        const { anchorNode: A, anchorOffset: w, focusNode: v, focusOffset: S } = t, E = we(A), C = we(v), x = Xa(A, w, v, S);
        E && C && x !== null && (x ? (h = A, c = w, p = E, d = v, u = S, f = C) : (h = v, c = S, p = C, d = A, u = w, f = E));
      }
      const b = i.filter((A) => l.intersectsNode(A));
      if (b.length === 0) continue;
      let y = !1;
      if (p || (p = b[0], h = p, c = 0, y = !0), f || (f = b.at(-1), d = f, u = f.childNodes.length, y = !0), d.nodeType === Node.ELEMENT_NODE) {
        if (d.classList.contains("endOfContent")) {
          const A = d.previousSibling;
          if (!A) continue;
          d = A, u = A.nodeType === Node.TEXT_NODE ? A.textContent.length : A.childNodes.length;
        } else if (d.classList.contains("textLayer") && d.childNodes.length === u) {
          const A = mi(d, u, f);
          if (!A) continue;
          d = A.container, u = A.offset;
        }
      }
      if (h.nodeType === Node.ELEMENT_NODE) {
        const A = mi(h, c, p);
        if (!A) continue;
        h = A.container, c = A.offset;
      }
      if (p === f && !y && b.includes(p)) {
        n.push([l, p]);
        continue;
      }
      for (const A of b) {
        const w = A.firstChild;
        if (!w) continue;
        const v = document.createRange();
        if (A === p ? v.setStart(h, c) : v.setStartBefore(w), A === f) v.setEnd(d, u);
        else {
          const S = A.lastChild;
          if (!S) continue;
          if (S.nodeType === Node.ELEMENT_NODE && S.classList.contains("endOfContent")) {
            const E = S.previousSibling;
            if (!E) continue;
            v.setEndAfter(E);
          } else v.setEndAfter(S);
        }
        v.collapsed || n.push([v, A]);
      }
    }
    const r = new Set(n.map((a) => a[1]));
    for (const a of this.#f) r.has(a) || this.#m(a);
    for (const [a, o] of n) {
      const l = F.#g.get(o);
      if (!l) continue;
      let h = e.get(o);
      if (!h) {
        const f = o.getBoundingClientRect();
        h = (m, g, b, y) => ({
          x: (m - f.x) / f.width,
          y: (g - f.y) / f.height,
          width: b / f.width,
          height: y / f.height
        }), e.set(o, h);
      }
      const c = [];
      for (let { x: f, y: m, width: g, height: b } of a.getClientRects())
        g === 0 || b === 0 || ({ x: f, y: m, width: g, height: b } = h(f, m, g, b), !(g === 1 && b === 1) && c.push(`M${f} ${m} h${g} v${b} h-${g} Z`));
      if (c.length === 0) continue;
      const d = l.drawLayer;
      let u = l.selectionDiv, p = l.path;
      if (!u) {
        const f = `clip_selection_${F.#l++}`;
        u = document.createElement("div"), u.className = "selection", u.style.clipPath = `url(#${f})`;
        const m = d.#i?.createSelectionStyle(d.#n);
        if (m) for (const [y, A] of Object.entries(m)) u.style.setProperty(y, A);
        const g = F._svgFactory.create(1, 1, !0);
        g.setAttribute("aria-hidden", "true"), g.setAttribute("width", "100%"), g.setAttribute("height", "100%");
        const b = F._svgFactory.createElement("clipPath");
        b.setAttribute("id", f), b.setAttribute("clipPathUnits", "objectBoundingBox"), p = F._svgFactory.createElement("path"), b.append(p), g.append(b), u.append(g), l.path = p, l.selectionDiv = u;
      }
      d.#t && u.parentNode !== d.#t && (d.#t.append(u), this.#u.add(u)), p.setAttribute("d", c.join(" "));
    }
  }
  static get _svgFactory() {
    return P(this, "_svgFactory", new Pe());
  }
  static #y(t, [e, i, n, r]) {
    const { style: a } = t;
    a.top = `${100 * i}%`, a.left = `${100 * e}%`, a.width = `${100 * n}%`, a.height = `${100 * r}%`;
  }
  #A() {
    const t = F._svgFactory.create(1, 1, !0);
    return this.#t.append(t), t.setAttribute("aria-hidden", "true"), t;
  }
  #v(t, e) {
    const i = F._svgFactory.createElement("clipPath");
    t.append(i);
    const n = `clip_${e}`;
    i.setAttribute("id", n), i.setAttribute("clipPathUnits", "objectBoundingBox");
    const r = F._svgFactory.createElement("use");
    return i.append(r), r.setAttribute("href", `#${e}`), r.classList.add("clip"), n;
  }
  #E(t, e) {
    for (const [i, n] of Object.entries(e)) n === null ? t.removeAttribute(i) : t.setAttribute(i, n);
  }
  draw(t, e = !1, i = !1) {
    const n = F.#o++, r = this.#A(), a = F._svgFactory.createElement("defs");
    r.append(a);
    const o = F._svgFactory.createElement("path");
    a.append(o);
    const l = `path_${n}`;
    o.setAttribute("id", l), o.setAttribute("vector-effect", "non-scaling-stroke"), e && this.#r.set(n, o);
    const h = i ? this.#v(a, l) : null, c = F._svgFactory.createElement("use");
    return r.append(c), c.setAttribute("href", `#${l}`), this.updateProperties(r, t), this.#e.set(n, r), {
      id: n,
      clipPathId: `url(#${h})`
    };
  }
  drawOutline(t, e) {
    const i = F.#o++, n = this.#A(), r = F._svgFactory.createElement("defs");
    n.append(r);
    const a = F._svgFactory.createElement("path");
    r.append(a);
    const o = `path_${i}`;
    a.setAttribute("id", o), a.setAttribute("vector-effect", "non-scaling-stroke");
    let l;
    if (e) {
      const d = F._svgFactory.createElement("mask");
      r.append(d), l = `mask_${i}`, d.setAttribute("id", l), d.setAttribute("maskUnits", "objectBoundingBox");
      const u = F._svgFactory.createElement("rect");
      d.append(u), u.setAttribute("width", "1"), u.setAttribute("height", "1"), u.setAttribute("fill", "white");
      const p = F._svgFactory.createElement("use");
      d.append(p), p.setAttribute("href", `#${o}`), p.setAttribute("stroke", "none"), p.setAttribute("fill", "black"), p.setAttribute("fill-rule", "nonzero"), p.classList.add("mask");
    }
    const h = F._svgFactory.createElement("use");
    n.append(h), h.setAttribute("href", `#${o}`), l && h.setAttribute("mask", `url(#${l})`);
    const c = h.cloneNode();
    return n.append(c), h.classList.add("mainOutline"), c.classList.add("secondaryOutline"), this.updateProperties(n, t), this.#e.set(i, n), i;
  }
  finalizeDraw(t, e) {
    this.#r.delete(t), this.updateProperties(t, e);
  }
  updateProperties(t, e) {
    if (!e) return;
    const { root: i, bbox: n, rootClass: r, path: a } = e, o = typeof t == "number" ? this.#e.get(t) : t;
    if (o) {
      if (i && this.#E(o, i), n && F.#y(o, n), r) {
        const { classList: l } = o;
        for (const [h, c] of Object.entries(r)) l.toggle(h, c);
      }
      if (a) {
        const l = o.firstElementChild.firstElementChild;
        this.#E(l, a);
      }
    }
  }
  updateParent(t, e) {
    if (e === this) return;
    const i = this.#e.get(t);
    i && (e.#t.append(i), this.#e.delete(t), e.#e.set(t, i));
  }
  remove(t) {
    this.#r.delete(t), this.#t !== null && (this.#e.get(t).remove(), this.#e.delete(t));
  }
  destroy() {
    this.#t = null;
    for (const t of this.#e.values()) t.remove();
    this.#e.clear(), this.#r.clear(), this.#a?.disconnect(), this.#a = null, this.#s && (F.#g.get(this.#s)?.drawLayer === this && (F.#m(this.#s), F.#g.delete(this.#s), F.#f.delete(this.#s), F.#f.size === 0 && (F.#h?.abort(), F.#h = null, F.#d = !1)), this.#s = null);
  }
};
function Se(s) {
  return `${(s * 100).toFixed(2)}%`;
}
var Ka = class _s {
  #t = [];
  #e = /* @__PURE__ */ new Map();
  #s = null;
  #i = 0;
  #n = 0;
  #a = 0;
  static #r = null;
  constructor(t, e, i, n) {
    this.#i = t, this.#t = e, this.#n = i.rawDims.pageWidth, this.#a = i.rawDims.pageHeight, this.#s = n;
  }
  render() {
    const t = document.createElement("div");
    t.className = "textLayerImages";
    for (let e = 0; e < this.#t.length; e += 6) {
      const i = this.#o(this.#t.subarray(e, e + 6));
      i && t.append(i);
    }
    return t.addEventListener("contextmenu", (e) => {
      if (!(e.target instanceof HTMLCanvasElement)) return;
      const i = e.target, n = this.#e.get(i);
      if (!n) return;
      const r = _s.#r?.deref();
      if (r === i) return;
      r && (r.width = 0, r.height = 0), _s.#r = new WeakRef(i);
      const { inverseTransform: a, x1: o, y1: l, width: h, height: c } = n, d = this.#s(), u = Math.ceil(o * d.width), p = Math.ceil(l * d.height), f = Math.floor((o + h / this.#n) * d.width), m = Math.floor((l + c / this.#a) * d.height);
      i.width = f - u, i.height = m - p;
      const g = i.getContext("2d");
      g.setTransform(...a), g.translate(-u, -p), g.drawImage(d, 0, 0);
    }), t;
  }
  #o([t, e, i, n, r, a]) {
    const o = Math.hypot((r - t) * this.#n, (a - e) * this.#a), l = Math.hypot((i - t) * this.#n, (n - e) * this.#a);
    if (o < this.#i || l < this.#i) return null;
    const h = [
      (r - t) * this.#n / o,
      (a - e) * this.#a / o,
      (i - t) * this.#n / l,
      (n - e) * this.#a / l,
      0,
      0
    ], c = _.inverseTransform(h), d = document.createElement("canvas");
    return d.className = "textLayerImagePlaceholder", d.width = 0, d.height = 0, Object.assign(d.style, {
      opacity: 0,
      position: "absolute",
      left: Se(t),
      top: Se(e),
      width: Se(o / this.#n),
      height: Se(l / this.#a),
      transformOrigin: "0% 0%",
      transform: `matrix(${h.join(",")})`
    }), this.#e.set(d, {
      inverseTransform: c,
      width: o,
      height: l,
      x1: t,
      y1: e
    }), d;
  }
};
globalThis._pdfjsTestingUtils = { HighlightOutliner: ws };
globalThis.pdfjsLib = {
  AbortException: Lt,
  AnnotationEditorLayer: Va,
  AnnotationEditorParamsType: N,
  AnnotationEditorType: O,
  AnnotationEditorUIManager: oe,
  AnnotationLayer: Fa,
  AnnotationMode: It,
  AnnotationType: q,
  applyOpacity: Nn,
  build: ua,
  ColorPicker: Yi,
  createValidAbsoluteUrl: bi,
  CSSConstants: Rn,
  DOMSVGFactory: Pe,
  DrawLayer: Ya,
  FeatureTest: z,
  fetchData: Ts,
  findContrastColor: Bn,
  getDocument: na,
  getFilenameFromUrl: In,
  getPdfFilenameFromUrl: Ln,
  getRGB: ce,
  getRGBA: he,
  getUuid: Ai,
  GlobalWorkerOptions: ae,
  ImageKind: Ee,
  InvalidPDFException: ss,
  isDataScheme: Fe,
  isPdfFile: Ps,
  isValidExplicitDest: cr,
  makeArr: Zt,
  makeMap: Cs,
  makeObj: is,
  makeSet: Pn,
  MathClamp: Y,
  noContextMenu: At,
  normalizeUnicode: Tn,
  OPS: Et,
  OutputScale: Ft,
  PasswordException: es,
  PasswordResponses: vn,
  PDFDataRangeTransport: Wi,
  PDFDateString: rs,
  PDFWorker: ys,
  PermissionFlag: An,
  PixelsPerInch: Jt,
  RenderingCancelledException: ks,
  renderRichText: Ei,
  ResponseException: Te,
  setLayerDimensions: Ut,
  shadow: P,
  SignatureExtractor: Kt,
  stopEvent: et,
  SupportedImageMimeTypes: os,
  TextLayer: bs,
  TextLayerImages: Ka,
  TouchManager: ki,
  updateUrlHash: yi,
  Util: _,
  VerbosityLevel: Me,
  version: da,
  XfaLayer: Si
};
export {
  Lt as AbortException,
  Va as AnnotationEditorLayer,
  N as AnnotationEditorParamsType,
  O as AnnotationEditorType,
  oe as AnnotationEditorUIManager,
  Fa as AnnotationLayer,
  It as AnnotationMode,
  q as AnnotationType,
  Rn as CSSConstants,
  Yi as ColorPicker,
  Pe as DOMSVGFactory,
  Ya as DrawLayer,
  z as FeatureTest,
  ae as GlobalWorkerOptions,
  Ee as ImageKind,
  ss as InvalidPDFException,
  Y as MathClamp,
  Et as OPS,
  Ft as OutputScale,
  Wi as PDFDataRangeTransport,
  rs as PDFDateString,
  ys as PDFWorker,
  es as PasswordException,
  vn as PasswordResponses,
  An as PermissionFlag,
  Jt as PixelsPerInch,
  ks as RenderingCancelledException,
  Te as ResponseException,
  Kt as SignatureExtractor,
  os as SupportedImageMimeTypes,
  bs as TextLayer,
  Ka as TextLayerImages,
  ki as TouchManager,
  _ as Util,
  Me as VerbosityLevel,
  Si as XfaLayer,
  Nn as applyOpacity,
  ua as build,
  bi as createValidAbsoluteUrl,
  Ts as fetchData,
  Bn as findContrastColor,
  na as getDocument,
  In as getFilenameFromUrl,
  Ln as getPdfFilenameFromUrl,
  ce as getRGB,
  he as getRGBA,
  Ai as getUuid,
  Fe as isDataScheme,
  Ps as isPdfFile,
  cr as isValidExplicitDest,
  Zt as makeArr,
  Cs as makeMap,
  is as makeObj,
  Pn as makeSet,
  At as noContextMenu,
  Tn as normalizeUnicode,
  Ei as renderRichText,
  Ut as setLayerDimensions,
  P as shadow,
  et as stopEvent,
  yi as updateUrlHash,
  da as version
};
