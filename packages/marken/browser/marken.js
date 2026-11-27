var xo = Object.create, sv = Object.defineProperty, Ro = Object.getOwnPropertyDescriptor, Co = Object.getOwnPropertyNames, Bo = Object.getPrototypeOf, dv = Object.prototype.hasOwnProperty, Ut = (f, o) => () => (o || (f((o = { exports: {} }).exports, o), f = null), o.exports), Yo = (f, o, _, z) => {
  if (o && typeof o == "object" || typeof o == "function")
    for (var s = Co(o), j = 0, H = s.length, M; j < H; j++)
      M = s[j], !dv.call(f, M) && M !== _ && sv(f, M, {
        get: ((U) => o[U]).bind(null, M),
        enumerable: !(z = Ro(o, M)) || z.enumerable
      });
  return f;
}, qo = (f, o, _) => (_ = f != null ? xo(Bo(f)) : {}, Yo(o || !f || !f.__esModule || !dv.call(f, "default") ? sv(_, "default", {
  value: f,
  enumerable: !0
}) : _, f)), Go = /* @__PURE__ */ Ut(((f) => {
  var o = Symbol.for("react.transitional.element"), _ = Symbol.for("react.portal"), z = Symbol.for("react.fragment"), s = Symbol.for("react.strict_mode"), j = Symbol.for("react.profiler"), H = Symbol.for("react.consumer"), M = Symbol.for("react.context"), U = Symbol.for("react.forward_ref"), O = Symbol.for("react.suspense"), p = Symbol.for("react.memo"), R = Symbol.for("react.lazy"), C = Symbol.for("react.activity"), ul = Symbol.iterator;
  function $(r) {
    return r === null || typeof r != "object" ? null : (r = ul && r[ul] || r["@@iterator"], typeof r == "function" ? r : null);
  }
  var gl = {
    isMounted: function() {
      return !1;
    },
    enqueueForceUpdate: function() {
    },
    enqueueReplaceState: function() {
    },
    enqueueSetState: function() {
    }
  }, Tl = Object.assign, Jl = {};
  function Ul(r, N, Y) {
    this.props = r, this.context = N, this.refs = Jl, this.updater = Y || gl;
  }
  Ul.prototype.isReactComponent = {}, Ul.prototype.setState = function(r, N) {
    if (typeof r != "object" && typeof r != "function" && r != null) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
    this.updater.enqueueSetState(this, r, N, "setState");
  }, Ul.prototype.forceUpdate = function(r) {
    this.updater.enqueueForceUpdate(this, r, "forceUpdate");
  };
  function wl() {
  }
  wl.prototype = Ul.prototype;
  function bl(r, N, Y) {
    this.props = r, this.context = N, this.refs = Jl, this.updater = Y || gl;
  }
  var V = bl.prototype = new wl();
  V.constructor = bl, Tl(V, Ul.prototype), V.isPureReactComponent = !0;
  var Z = Array.isArray;
  function G() {
  }
  var K = {
    H: null,
    A: null,
    T: null,
    S: null
  }, Hl = Object.prototype.hasOwnProperty;
  function kl(r, N, Y) {
    var L = Y.ref;
    return {
      $$typeof: o,
      type: r,
      key: N,
      ref: L !== void 0 ? L : null,
      props: Y
    };
  }
  function Ht(r, N) {
    return kl(r.type, N, r.props);
  }
  function tl(r) {
    return typeof r == "object" && r !== null && r.$$typeof === o;
  }
  function Ml(r) {
    var N = {
      "=": "=0",
      ":": "=2"
    };
    return "$" + r.replace(/[=:]/g, function(Y) {
      return N[Y];
    });
  }
  var ql = /\/+/g;
  function El(r, N) {
    return typeof r == "object" && r !== null && r.key != null ? Ml("" + r.key) : N.toString(36);
  }
  function x(r) {
    switch (r.status) {
      case "fulfilled":
        return r.value;
      case "rejected":
        throw r.reason;
      default:
        switch (typeof r.status == "string" ? r.then(G, G) : (r.status = "pending", r.then(function(N) {
          r.status === "pending" && (r.status = "fulfilled", r.value = N);
        }, function(N) {
          r.status === "pending" && (r.status = "rejected", r.reason = N);
        })), r.status) {
          case "fulfilled":
            return r.value;
          case "rejected":
            throw r.reason;
        }
    }
    throw r;
  }
  function D(r, N, Y, L, F) {
    var I = typeof r;
    (I === "undefined" || I === "boolean") && (r = null);
    var dl = !1;
    if (r === null) dl = !0;
    else switch (I) {
      case "bigint":
      case "string":
      case "number":
        dl = !0;
        break;
      case "object":
        switch (r.$$typeof) {
          case o:
          case _:
            dl = !0;
            break;
          case R:
            return dl = r._init, D(dl(r._payload), N, Y, L, F);
        }
    }
    if (dl) return F = F(r), dl = L === "" ? "." + El(r, 0) : L, Z(F) ? (Y = "", dl != null && (Y = dl.replace(ql, "$&/") + "/"), D(F, N, Y, "", function(Ae) {
      return Ae;
    })) : F != null && (tl(F) && (F = Ht(F, Y + (F.key == null || r && r.key === F.key ? "" : ("" + F.key).replace(ql, "$&/") + "/") + dl)), N.push(F)), 1;
    dl = 0;
    var Wl = L === "" ? "." : L + ":";
    if (Z(r)) for (var Ol = 0; Ol < r.length; Ol++) L = r[Ol], I = Wl + El(L, Ol), dl += D(L, N, Y, I, F);
    else if (Ol = $(r), typeof Ol == "function") for (r = Ol.call(r), Ol = 0; !(L = r.next()).done; ) L = L.value, I = Wl + El(L, Ol++), dl += D(L, N, Y, I, F);
    else if (I === "object") {
      if (typeof r.then == "function") return D(x(r), N, Y, L, F);
      throw N = String(r), Error("Objects are not valid as a React child (found: " + (N === "[object Object]" ? "object with keys {" + Object.keys(r).join(", ") + "}" : N) + "). If you meant to render a collection of children, use an array instead.");
    }
    return dl;
  }
  function B(r, N, Y) {
    if (r == null) return r;
    var L = [], F = 0;
    return D(r, L, "", "", function(I) {
      return N.call(Y, I, F++);
    }), L;
  }
  function il(r) {
    if (r._status === -1) {
      var N = r._result;
      N = N(), N.then(function(Y) {
        (r._status === 0 || r._status === -1) && (r._status = 1, r._result = Y);
      }, function(Y) {
        (r._status === 0 || r._status === -1) && (r._status = 2, r._result = Y);
      }), r._status === -1 && (r._status = 0, r._result = N);
    }
    if (r._status === 1) return r._result.default;
    throw r._result;
  }
  var Sl = typeof reportError == "function" ? reportError : function(r) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var N = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof r == "object" && r !== null && typeof r.message == "string" ? String(r.message) : String(r),
        error: r
      });
      if (!window.dispatchEvent(N)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", r);
      return;
    }
    console.error(r);
  }, ut = {
    map: B,
    forEach: function(r, N, Y) {
      B(r, function() {
        N.apply(this, arguments);
      }, Y);
    },
    count: function(r) {
      var N = 0;
      return B(r, function() {
        N++;
      }), N;
    },
    toArray: function(r) {
      return B(r, function(N) {
        return N;
      }) || [];
    },
    only: function(r) {
      if (!tl(r)) throw Error("React.Children.only expected to receive a single React element child.");
      return r;
    }
  };
  f.Activity = C, f.Children = ut, f.Component = Ul, f.Fragment = z, f.Profiler = j, f.PureComponent = bl, f.StrictMode = s, f.Suspense = O, f.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = K, f.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(r) {
      return K.H.useMemoCache(r);
    }
  }, f.cache = function(r) {
    return function() {
      return r.apply(null, arguments);
    };
  }, f.cacheSignal = function() {
    return null;
  }, f.cloneElement = function(r, N, Y) {
    if (r == null) throw Error("The argument must be a React element, but you passed " + r + ".");
    var L = Tl({}, r.props), F = r.key;
    if (N != null) for (I in N.key !== void 0 && (F = "" + N.key), N) !Hl.call(N, I) || I === "key" || I === "__self" || I === "__source" || I === "ref" && N.ref === void 0 || (L[I] = N[I]);
    var I = arguments.length - 2;
    if (I === 1) L.children = Y;
    else if (1 < I) {
      for (var dl = Array(I), Wl = 0; Wl < I; Wl++) dl[Wl] = arguments[Wl + 2];
      L.children = dl;
    }
    return kl(r.type, F, L);
  }, f.createContext = function(r) {
    return r = {
      $$typeof: M,
      _currentValue: r,
      _currentValue2: r,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, r.Provider = r, r.Consumer = {
      $$typeof: H,
      _context: r
    }, r;
  }, f.createElement = function(r, N, Y) {
    var L, F = {}, I = null;
    if (N != null) for (L in N.key !== void 0 && (I = "" + N.key), N) Hl.call(N, L) && L !== "key" && L !== "__self" && L !== "__source" && (F[L] = N[L]);
    var dl = arguments.length - 2;
    if (dl === 1) F.children = Y;
    else if (1 < dl) {
      for (var Wl = Array(dl), Ol = 0; Ol < dl; Ol++) Wl[Ol] = arguments[Ol + 2];
      F.children = Wl;
    }
    if (r && r.defaultProps) for (L in dl = r.defaultProps, dl) F[L] === void 0 && (F[L] = dl[L]);
    return kl(r, I, F);
  }, f.createRef = function() {
    return { current: null };
  }, f.forwardRef = function(r) {
    return {
      $$typeof: U,
      render: r
    };
  }, f.isValidElement = tl, f.lazy = function(r) {
    return {
      $$typeof: R,
      _payload: {
        _status: -1,
        _result: r
      },
      _init: il
    };
  }, f.memo = function(r, N) {
    return {
      $$typeof: p,
      type: r,
      compare: N === void 0 ? null : N
    };
  }, f.startTransition = function(r) {
    var N = K.T, Y = {};
    K.T = Y;
    try {
      var L = r(), F = K.S;
      F !== null && F(Y, L), typeof L == "object" && L !== null && typeof L.then == "function" && L.then(G, Sl);
    } catch (I) {
      Sl(I);
    } finally {
      N !== null && Y.types !== null && (N.types = Y.types), K.T = N;
    }
  }, f.unstable_useCacheRefresh = function() {
    return K.H.useCacheRefresh();
  }, f.use = function(r) {
    return K.H.use(r);
  }, f.useActionState = function(r, N, Y) {
    return K.H.useActionState(r, N, Y);
  }, f.useCallback = function(r, N) {
    return K.H.useCallback(r, N);
  }, f.useContext = function(r) {
    return K.H.useContext(r);
  }, f.useDebugValue = function() {
  }, f.useDeferredValue = function(r, N) {
    return K.H.useDeferredValue(r, N);
  }, f.useEffect = function(r, N) {
    return K.H.useEffect(r, N);
  }, f.useEffectEvent = function(r) {
    return K.H.useEffectEvent(r);
  }, f.useId = function() {
    return K.H.useId();
  }, f.useImperativeHandle = function(r, N, Y) {
    return K.H.useImperativeHandle(r, N, Y);
  }, f.useInsertionEffect = function(r, N) {
    return K.H.useInsertionEffect(r, N);
  }, f.useLayoutEffect = function(r, N) {
    return K.H.useLayoutEffect(r, N);
  }, f.useMemo = function(r, N) {
    return K.H.useMemo(r, N);
  }, f.useOptimistic = function(r, N) {
    return K.H.useOptimistic(r, N);
  }, f.useReducer = function(r, N, Y) {
    return K.H.useReducer(r, N, Y);
  }, f.useRef = function(r) {
    return K.H.useRef(r);
  }, f.useState = function(r) {
    return K.H.useState(r);
  }, f.useSyncExternalStore = function(r, N, Y) {
    return K.H.useSyncExternalStore(r, N, Y);
  }, f.useTransition = function() {
    return K.H.useTransition();
  }, f.version = "19.2.8";
})), nf = /* @__PURE__ */ Ut(((f, o) => {
  o.exports = Go();
})), Xo = /* @__PURE__ */ Ut(((f) => {
  function o(x, D) {
    var B = x.length;
    x.push(D);
    l: for (; 0 < B; ) {
      var il = B - 1 >>> 1, Sl = x[il];
      if (0 < s(Sl, D)) x[il] = D, x[B] = Sl, B = il;
      else break l;
    }
  }
  function _(x) {
    return x.length === 0 ? null : x[0];
  }
  function z(x) {
    if (x.length === 0) return null;
    var D = x[0], B = x.pop();
    if (B !== D) {
      x[0] = B;
      l: for (var il = 0, Sl = x.length, ut = Sl >>> 1; il < ut; ) {
        var r = 2 * (il + 1) - 1, N = x[r], Y = r + 1, L = x[Y];
        if (0 > s(N, B)) Y < Sl && 0 > s(L, N) ? (x[il] = L, x[Y] = B, il = Y) : (x[il] = N, x[r] = B, il = r);
        else if (Y < Sl && 0 > s(L, B)) x[il] = L, x[Y] = B, il = Y;
        else break l;
      }
    }
    return D;
  }
  function s(x, D) {
    var B = x.sortIndex - D.sortIndex;
    return B !== 0 ? B : x.id - D.id;
  }
  if (f.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
    var j = performance;
    f.unstable_now = function() {
      return j.now();
    };
  } else {
    var H = Date, M = H.now();
    f.unstable_now = function() {
      return H.now() - M;
    };
  }
  var U = [], O = [], p = 1, R = null, C = 3, ul = !1, $ = !1, gl = !1, Tl = !1, Jl = typeof setTimeout == "function" ? setTimeout : null, Ul = typeof clearTimeout == "function" ? clearTimeout : null, wl = typeof setImmediate < "u" ? setImmediate : null;
  function bl(x) {
    for (var D = _(O); D !== null; ) {
      if (D.callback === null) z(O);
      else if (D.startTime <= x) z(O), D.sortIndex = D.expirationTime, o(U, D);
      else break;
      D = _(O);
    }
  }
  function V(x) {
    if (gl = !1, bl(x), !$) if (_(U) !== null) $ = !0, Z || (Z = !0, tl());
    else {
      var D = _(O);
      D !== null && El(V, D.startTime - x);
    }
  }
  var Z = !1, G = -1, K = 5, Hl = -1;
  function kl() {
    return Tl ? !0 : !(f.unstable_now() - Hl < K);
  }
  function Ht() {
    if (Tl = !1, Z) {
      var x = f.unstable_now();
      Hl = x;
      var D = !0;
      try {
        l: {
          $ = !1, gl && (gl = !1, Ul(G), G = -1), ul = !0;
          var B = C;
          try {
            t: {
              for (bl(x), R = _(U); R !== null && !(R.expirationTime > x && kl()); ) {
                var il = R.callback;
                if (typeof il == "function") {
                  R.callback = null, C = R.priorityLevel;
                  var Sl = il(R.expirationTime <= x);
                  if (x = f.unstable_now(), typeof Sl == "function") {
                    R.callback = Sl, bl(x), D = !0;
                    break t;
                  }
                  R === _(U) && z(U), bl(x);
                } else z(U);
                R = _(U);
              }
              if (R !== null) D = !0;
              else {
                var ut = _(O);
                ut !== null && El(V, ut.startTime - x), D = !1;
              }
            }
            break l;
          } finally {
            R = null, C = B, ul = !1;
          }
          D = void 0;
        }
      } finally {
        D ? tl() : Z = !1;
      }
    }
  }
  var tl;
  if (typeof wl == "function") tl = function() {
    wl(Ht);
  };
  else if (typeof MessageChannel < "u") {
    var Ml = new MessageChannel(), ql = Ml.port2;
    Ml.port1.onmessage = Ht, tl = function() {
      ql.postMessage(null);
    };
  } else tl = function() {
    Jl(Ht, 0);
  };
  function El(x, D) {
    G = Jl(function() {
      x(f.unstable_now());
    }, D);
  }
  f.unstable_IdlePriority = 5, f.unstable_ImmediatePriority = 1, f.unstable_LowPriority = 4, f.unstable_NormalPriority = 3, f.unstable_Profiling = null, f.unstable_UserBlockingPriority = 2, f.unstable_cancelCallback = function(x) {
    x.callback = null;
  }, f.unstable_forceFrameRate = function(x) {
    0 > x || 125 < x ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : K = 0 < x ? Math.floor(1e3 / x) : 5;
  }, f.unstable_getCurrentPriorityLevel = function() {
    return C;
  }, f.unstable_next = function(x) {
    switch (C) {
      case 1:
      case 2:
      case 3:
        var D = 3;
        break;
      default:
        D = C;
    }
    var B = C;
    C = D;
    try {
      return x();
    } finally {
      C = B;
    }
  }, f.unstable_requestPaint = function() {
    Tl = !0;
  }, f.unstable_runWithPriority = function(x, D) {
    switch (x) {
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
        break;
      default:
        x = 3;
    }
    var B = C;
    C = x;
    try {
      return D();
    } finally {
      C = B;
    }
  }, f.unstable_scheduleCallback = function(x, D, B) {
    var il = f.unstable_now();
    switch (typeof B == "object" && B !== null ? (B = B.delay, B = typeof B == "number" && 0 < B ? il + B : il) : B = il, x) {
      case 1:
        var Sl = -1;
        break;
      case 2:
        Sl = 250;
        break;
      case 5:
        Sl = 1073741823;
        break;
      case 4:
        Sl = 1e4;
        break;
      default:
        Sl = 5e3;
    }
    return Sl = B + Sl, x = {
      id: p++,
      callback: D,
      priorityLevel: x,
      startTime: B,
      expirationTime: Sl,
      sortIndex: -1
    }, B > il ? (x.sortIndex = B, o(O, x), _(U) === null && x === _(O) && (gl ? (Ul(G), G = -1) : gl = !0, El(V, B - il))) : (x.sortIndex = Sl, o(U, x), $ || ul || ($ = !0, Z || (Z = !0, tl()))), x;
  }, f.unstable_shouldYield = kl, f.unstable_wrapCallback = function(x) {
    var D = C;
    return function() {
      var B = C;
      C = D;
      try {
        return x.apply(this, arguments);
      } finally {
        C = B;
      }
    };
  };
})), Qo = /* @__PURE__ */ Ut(((f, o) => {
  o.exports = Xo();
})), Zo = /* @__PURE__ */ Ut(((f) => {
  var o = nf();
  function _(O) {
    var p = "https://react.dev/errors/" + O;
    if (1 < arguments.length) {
      p += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var R = 2; R < arguments.length; R++) p += "&args[]=" + encodeURIComponent(arguments[R]);
    }
    return "Minified React error #" + O + "; visit " + p + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function z() {
  }
  var s = {
    d: {
      f: z,
      r: function() {
        throw Error(_(522));
      },
      D: z,
      C: z,
      L: z,
      m: z,
      X: z,
      S: z,
      M: z
    },
    p: 0,
    findDOMNode: null
  }, j = Symbol.for("react.portal");
  function H(O, p, R) {
    var C = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: j,
      key: C == null ? null : "" + C,
      children: O,
      containerInfo: p,
      implementation: R
    };
  }
  var M = o.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function U(O, p) {
    if (O === "font") return "";
    if (typeof p == "string") return p === "use-credentials" ? p : "";
  }
  f.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = s, f.createPortal = function(O, p) {
    var R = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!p || p.nodeType !== 1 && p.nodeType !== 9 && p.nodeType !== 11) throw Error(_(299));
    return H(O, p, null, R);
  }, f.flushSync = function(O) {
    var p = M.T, R = s.p;
    try {
      if (M.T = null, s.p = 2, O) return O();
    } finally {
      M.T = p, s.p = R, s.d.f();
    }
  }, f.preconnect = function(O, p) {
    typeof O == "string" && (p ? (p = p.crossOrigin, p = typeof p == "string" ? p === "use-credentials" ? p : "" : void 0) : p = null, s.d.C(O, p));
  }, f.prefetchDNS = function(O) {
    typeof O == "string" && s.d.D(O);
  }, f.preinit = function(O, p) {
    if (typeof O == "string" && p && typeof p.as == "string") {
      var R = p.as, C = U(R, p.crossOrigin), ul = typeof p.integrity == "string" ? p.integrity : void 0, $ = typeof p.fetchPriority == "string" ? p.fetchPriority : void 0;
      R === "style" ? s.d.S(O, typeof p.precedence == "string" ? p.precedence : void 0, {
        crossOrigin: C,
        integrity: ul,
        fetchPriority: $
      }) : R === "script" && s.d.X(O, {
        crossOrigin: C,
        integrity: ul,
        fetchPriority: $,
        nonce: typeof p.nonce == "string" ? p.nonce : void 0
      });
    }
  }, f.preinitModule = function(O, p) {
    if (typeof O == "string") if (typeof p == "object" && p !== null) {
      if (p.as == null || p.as === "script") {
        var R = U(p.as, p.crossOrigin);
        s.d.M(O, {
          crossOrigin: R,
          integrity: typeof p.integrity == "string" ? p.integrity : void 0,
          nonce: typeof p.nonce == "string" ? p.nonce : void 0
        });
      }
    } else p ?? s.d.M(O);
  }, f.preload = function(O, p) {
    if (typeof O == "string" && typeof p == "object" && p !== null && typeof p.as == "string") {
      var R = p.as, C = U(R, p.crossOrigin);
      s.d.L(O, R, {
        crossOrigin: C,
        integrity: typeof p.integrity == "string" ? p.integrity : void 0,
        nonce: typeof p.nonce == "string" ? p.nonce : void 0,
        type: typeof p.type == "string" ? p.type : void 0,
        fetchPriority: typeof p.fetchPriority == "string" ? p.fetchPriority : void 0,
        referrerPolicy: typeof p.referrerPolicy == "string" ? p.referrerPolicy : void 0,
        imageSrcSet: typeof p.imageSrcSet == "string" ? p.imageSrcSet : void 0,
        imageSizes: typeof p.imageSizes == "string" ? p.imageSizes : void 0,
        media: typeof p.media == "string" ? p.media : void 0
      });
    }
  }, f.preloadModule = function(O, p) {
    if (typeof O == "string") if (p) {
      var R = U(p.as, p.crossOrigin);
      s.d.m(O, {
        as: typeof p.as == "string" && p.as !== "script" ? p.as : void 0,
        crossOrigin: R,
        integrity: typeof p.integrity == "string" ? p.integrity : void 0
      });
    } else s.d.m(O);
  }, f.requestFormReset = function(O) {
    s.d.r(O);
  }, f.unstable_batchedUpdates = function(O, p) {
    return O(p);
  }, f.useFormState = function(O, p, R) {
    return M.H.useFormState(O, p, R);
  }, f.useFormStatus = function() {
    return M.H.useHostTransitionStatus();
  }, f.version = "19.2.8";
})), Lo = /* @__PURE__ */ Ut(((f, o) => {
  function _() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(_);
      } catch (z) {
        console.error(z);
      }
  }
  _(), o.exports = Zo();
})), Vo = /* @__PURE__ */ Ut(((f) => {
  var o = Qo(), _ = nf(), z = Lo();
  function s(l) {
    var t = "https://react.dev/errors/" + l;
    if (1 < arguments.length) {
      t += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var a = 2; a < arguments.length; a++) t += "&args[]=" + encodeURIComponent(arguments[a]);
    }
    return "Minified React error #" + l + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function j(l) {
    return !(!l || l.nodeType !== 1 && l.nodeType !== 9 && l.nodeType !== 11);
  }
  function H(l) {
    var t = l, a = l;
    if (l.alternate) for (; t.return; ) t = t.return;
    else {
      l = t;
      do
        t = l, (t.flags & 4098) !== 0 && (a = t.return), l = t.return;
      while (l);
    }
    return t.tag === 3 ? a : null;
  }
  function M(l) {
    if (l.tag === 13) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function U(l) {
    if (l.tag === 31) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function O(l) {
    if (H(l) !== l) throw Error(s(188));
  }
  function p(l) {
    var t = l.alternate;
    if (!t) {
      if (t = H(l), t === null) throw Error(s(188));
      return t !== l ? null : l;
    }
    for (var a = l, e = t; ; ) {
      var u = a.return;
      if (u === null) break;
      var n = u.alternate;
      if (n === null) {
        if (e = u.return, e !== null) {
          a = e;
          continue;
        }
        break;
      }
      if (u.child === n.child) {
        for (n = u.child; n; ) {
          if (n === a) return O(u), l;
          if (n === e) return O(u), t;
          n = n.sibling;
        }
        throw Error(s(188));
      }
      if (a.return !== e.return) a = u, e = n;
      else {
        for (var i = !1, c = u.child; c; ) {
          if (c === a) {
            i = !0, a = u, e = n;
            break;
          }
          if (c === e) {
            i = !0, e = u, a = n;
            break;
          }
          c = c.sibling;
        }
        if (!i) {
          for (c = n.child; c; ) {
            if (c === a) {
              i = !0, a = n, e = u;
              break;
            }
            if (c === e) {
              i = !0, e = n, a = u;
              break;
            }
            c = c.sibling;
          }
          if (!i) throw Error(s(189));
        }
      }
      if (a.alternate !== e) throw Error(s(190));
    }
    if (a.tag !== 3) throw Error(s(188));
    return a.stateNode.current === a ? l : t;
  }
  function R(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l;
    for (l = l.child; l !== null; ) {
      if (t = R(l), t !== null) return t;
      l = l.sibling;
    }
    return null;
  }
  var C = Object.assign, ul = Symbol.for("react.element"), $ = Symbol.for("react.transitional.element"), gl = Symbol.for("react.portal"), Tl = Symbol.for("react.fragment"), Jl = Symbol.for("react.strict_mode"), Ul = Symbol.for("react.profiler"), wl = Symbol.for("react.consumer"), bl = Symbol.for("react.context"), V = Symbol.for("react.forward_ref"), Z = Symbol.for("react.suspense"), G = Symbol.for("react.suspense_list"), K = Symbol.for("react.memo"), Hl = Symbol.for("react.lazy"), kl = Symbol.for("react.activity"), Ht = Symbol.for("react.memo_cache_sentinel"), tl = Symbol.iterator;
  function Ml(l) {
    return l === null || typeof l != "object" ? null : (l = tl && l[tl] || l["@@iterator"], typeof l == "function" ? l : null);
  }
  var ql = Symbol.for("react.client.reference");
  function El(l) {
    if (l == null) return null;
    if (typeof l == "function") return l.$$typeof === ql ? null : l.displayName || l.name || null;
    if (typeof l == "string") return l;
    switch (l) {
      case Tl:
        return "Fragment";
      case Ul:
        return "Profiler";
      case Jl:
        return "StrictMode";
      case Z:
        return "Suspense";
      case G:
        return "SuspenseList";
      case kl:
        return "Activity";
    }
    if (typeof l == "object") switch (l.$$typeof) {
      case gl:
        return "Portal";
      case bl:
        return l.displayName || "Context";
      case wl:
        return (l._context.displayName || "Context") + ".Consumer";
      case V:
        var t = l.render;
        return l = l.displayName, l || (l = t.displayName || t.name || "", l = l !== "" ? "ForwardRef(" + l + ")" : "ForwardRef"), l;
      case K:
        return t = l.displayName || null, t !== null ? t : El(l.type) || "Memo";
      case Hl:
        t = l._payload, l = l._init;
        try {
          return El(l(t));
        } catch {
        }
    }
    return null;
  }
  var x = Array.isArray, D = _.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, B = z.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, il = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, Sl = [], ut = -1;
  function r(l) {
    return { current: l };
  }
  function N(l) {
    0 > ut || (l.current = Sl[ut], Sl[ut] = null, ut--);
  }
  function Y(l, t) {
    ut++, Sl[ut] = l.current, l.current = t;
  }
  var L = r(null), F = r(null), I = r(null), dl = r(null);
  function Wl(l, t) {
    switch (Y(I, t), Y(F, l), Y(L, null), t.nodeType) {
      case 9:
      case 11:
        l = (l = t.documentElement) && (l = l.namespaceURI) ? Ud(l) : 0;
        break;
      default:
        if (l = t.tagName, t = t.namespaceURI) t = Ud(t), l = Hd(t, l);
        else switch (l) {
          case "svg":
            l = 1;
            break;
          case "math":
            l = 2;
            break;
          default:
            l = 0;
        }
    }
    N(L), Y(L, l);
  }
  function Ol() {
    N(L), N(F), N(I);
  }
  function Ae(l) {
    l.memoizedState !== null && Y(dl, l);
    var t = L.current, a = Hd(t, l.type);
    t !== a && (Y(F, l), Y(L, a));
  }
  function zu(l) {
    F.current === l && (N(L), N(F)), dl.current === l && (N(dl), hu._currentValue = il);
  }
  var Qn, ff;
  function za(l) {
    if (Qn === void 0) try {
      throw Error();
    } catch (a) {
      var t = a.stack.trim().match(/\n( *(at )?)/);
      Qn = t && t[1] || "", ff = -1 < a.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < a.stack.indexOf("@") ? "@unknown:0:0" : "";
    }
    return `
` + Qn + l + ff;
  }
  var Zn = !1;
  function Ln(l, t) {
    if (!l || Zn) return "";
    Zn = !0;
    var a = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var e = { DetermineComponentFrameRoot: function() {
        try {
          if (t) {
            var A = function() {
              throw Error();
            };
            if (Object.defineProperty(A.prototype, "props", { set: function() {
              throw Error();
            } }), typeof Reflect == "object" && Reflect.construct) {
              try {
                Reflect.construct(A, []);
              } catch (S) {
                var b = S;
              }
              Reflect.construct(l, [], A);
            } else {
              try {
                A.call();
              } catch (S) {
                b = S;
              }
              l.call(A.prototype);
            }
          } else {
            try {
              throw Error();
            } catch (S) {
              b = S;
            }
            (A = l()) && typeof A.catch == "function" && A.catch(function() {
            });
          }
        } catch (S) {
          if (S && b && typeof S.stack == "string") return [S.stack, b.stack];
        }
        return [null, null];
      } };
      e.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var u = Object.getOwnPropertyDescriptor(e.DetermineComponentFrameRoot, "name");
      u && u.configurable && Object.defineProperty(e.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
      var n = e.DetermineComponentFrameRoot(), i = n[0], c = n[1];
      if (i && c) {
        var d = i.split(`
`), g = c.split(`
`);
        for (u = e = 0; e < d.length && !d[e].includes("DetermineComponentFrameRoot"); ) e++;
        for (; u < g.length && !g[u].includes("DetermineComponentFrameRoot"); ) u++;
        if (e === d.length || u === g.length) for (e = d.length - 1, u = g.length - 1; 1 <= e && 0 <= u && d[e] !== g[u]; ) u--;
        for (; 1 <= e && 0 <= u; e--, u--) if (d[e] !== g[u]) {
          if (e !== 1 || u !== 1) do
            if (e--, u--, 0 > u || d[e] !== g[u]) {
              var E = `
` + d[e].replace(" at new ", " at ");
              return l.displayName && E.includes("<anonymous>") && (E = E.replace("<anonymous>", l.displayName)), E;
            }
          while (1 <= e && 0 <= u);
          break;
        }
      }
    } finally {
      Zn = !1, Error.prepareStackTrace = a;
    }
    return (a = l ? l.displayName || l.name : "") ? za(a) : "";
  }
  function yv(l, t) {
    switch (l.tag) {
      case 26:
      case 27:
      case 5:
        return za(l.type);
      case 16:
        return za("Lazy");
      case 13:
        return l.child !== t && t !== null ? za("Suspense Fallback") : za("Suspense");
      case 19:
        return za("SuspenseList");
      case 0:
      case 15:
        return Ln(l.type, !1);
      case 11:
        return Ln(l.type.render, !1);
      case 1:
        return Ln(l.type, !0);
      case 31:
        return za("Activity");
      default:
        return "";
    }
  }
  function sf(l) {
    try {
      var t = "", a = null;
      do
        t += yv(l, a), a = l, l = l.return;
      while (l);
      return t;
    } catch (e) {
      return `
Error generating stack: ` + e.message + `
` + e.stack;
    }
  }
  var Vn = Object.prototype.hasOwnProperty, Kn = o.unstable_scheduleCallback, Jn = o.unstable_cancelCallback, gv = o.unstable_shouldYield, bv = o.unstable_requestPaint, nt = o.unstable_now, Sv = o.unstable_getCurrentPriorityLevel, df = o.unstable_ImmediatePriority, vf = o.unstable_UserBlockingPriority, pu = o.unstable_NormalPriority, _v = o.unstable_LowPriority, rf = o.unstable_IdlePriority, zv = o.log, pv = o.unstable_setDisableYieldValue, Ne = null, it = null;
  function It(l) {
    if (typeof zv == "function" && pv(l), it && typeof it.setStrictMode == "function") try {
      it.setStrictMode(Ne, l);
    } catch {
    }
  }
  var ct = Math.clz32 ? Math.clz32 : Mv, Ev = Math.log, Tv = Math.LN2;
  function Mv(l) {
    return l >>>= 0, l === 0 ? 32 : 31 - (Ev(l) / Tv | 0) | 0;
  }
  var Eu = 256, Tu = 262144, Mu = 4194304;
  function pa(l) {
    var t = l & 42;
    if (t !== 0) return t;
    switch (l & -l) {
      case 1:
        return 1;
      case 2:
        return 2;
      case 4:
        return 4;
      case 8:
        return 8;
      case 16:
        return 16;
      case 32:
        return 32;
      case 64:
        return 64;
      case 128:
        return 128;
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
        return l & 261888;
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return l & 3932160;
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        return l & 62914560;
      case 67108864:
        return 67108864;
      case 134217728:
        return 134217728;
      case 268435456:
        return 268435456;
      case 536870912:
        return 536870912;
      case 1073741824:
        return 0;
      default:
        return l;
    }
  }
  function Au(l, t, a) {
    var e = l.pendingLanes;
    if (e === 0) return 0;
    var u = 0, n = l.suspendedLanes, i = l.pingedLanes;
    l = l.warmLanes;
    var c = e & 134217727;
    return c !== 0 ? (e = c & ~n, e !== 0 ? u = pa(e) : (i &= c, i !== 0 ? u = pa(i) : a || (a = c & ~l, a !== 0 && (u = pa(a))))) : (c = e & ~n, c !== 0 ? u = pa(c) : i !== 0 ? u = pa(i) : a || (a = e & ~l, a !== 0 && (u = pa(a)))), u === 0 ? 0 : t !== 0 && t !== u && (t & n) === 0 && (n = u & -u, a = t & -t, n >= a || n === 32 && (a & 4194048) !== 0) ? t : u;
  }
  function Oe(l, t) {
    return (l.pendingLanes & ~(l.suspendedLanes & ~l.pingedLanes) & t) === 0;
  }
  function Av(l, t) {
    switch (l) {
      case 1:
      case 2:
      case 4:
      case 8:
      case 64:
        return t + 250;
      case 16:
      case 32:
      case 128:
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
        return t + 5e3;
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        return -1;
      case 67108864:
      case 134217728:
      case 268435456:
      case 536870912:
      case 1073741824:
        return -1;
      default:
        return -1;
    }
  }
  function of() {
    var l = Mu;
    return Mu <<= 1, (Mu & 62914560) === 0 && (Mu = 4194304), l;
  }
  function wn(l) {
    for (var t = [], a = 0; 31 > a; a++) t.push(l);
    return t;
  }
  function Nu(l, t) {
    l.pendingLanes |= t, t !== 268435456 && (l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0);
  }
  function Nv(l, t, a, e, u, n) {
    var i = l.pendingLanes;
    l.pendingLanes = a, l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0, l.expiredLanes &= a, l.entangledLanes &= a, l.errorRecoveryDisabledLanes &= a, l.shellSuspendCounter = 0;
    var c = l.entanglements, d = l.expirationTimes, g = l.hiddenUpdates;
    for (a = i & ~a; 0 < a; ) {
      var E = 31 - ct(a), A = 1 << E;
      c[E] = 0, d[E] = -1;
      var b = g[E];
      if (b !== null) for (g[E] = null, E = 0; E < b.length; E++) {
        var S = b[E];
        S !== null && (S.lane &= -536870913);
      }
      a &= ~A;
    }
    e !== 0 && mf(l, e, 0), n !== 0 && u === 0 && l.tag !== 0 && (l.suspendedLanes |= n & ~(i & ~t));
  }
  function mf(l, t, a) {
    l.pendingLanes |= t, l.suspendedLanes &= ~t;
    var e = 31 - ct(t);
    l.entangledLanes |= t, l.entanglements[e] = l.entanglements[e] | 1073741824 | a & 261930;
  }
  function hf(l, t) {
    var a = l.entangledLanes |= t;
    for (l = l.entanglements; a; ) {
      var e = 31 - ct(a), u = 1 << e;
      u & t | l[e] & t && (l[e] |= t), a &= ~u;
    }
  }
  function yf(l, t) {
    var a = t & -t;
    return a = (a & 42) !== 0 ? 1 : gf(a), (a & (l.suspendedLanes | t)) !== 0 ? 0 : a;
  }
  function gf(l) {
    switch (l) {
      case 2:
        l = 1;
        break;
      case 8:
        l = 4;
        break;
      case 32:
        l = 16;
        break;
      case 256:
      case 512:
      case 1024:
      case 2048:
      case 4096:
      case 8192:
      case 16384:
      case 32768:
      case 65536:
      case 131072:
      case 262144:
      case 524288:
      case 1048576:
      case 2097152:
      case 4194304:
      case 8388608:
      case 16777216:
      case 33554432:
        l = 128;
        break;
      case 268435456:
        l = 134217728;
        break;
      default:
        l = 0;
    }
    return l;
  }
  function kn(l) {
    return l &= -l, 2 < l ? 8 < l ? (l & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function bf() {
    var l = B.p;
    return l !== 0 ? l : (l = window.event, l === void 0 ? 32 : Pd(l.type));
  }
  function Sf(l, t) {
    var a = B.p;
    try {
      return B.p = l, t();
    } finally {
      B.p = a;
    }
  }
  var Pt = Math.random().toString(36).slice(2), Ql = "__reactFiber$" + Pt, Fl = "__reactProps$" + Pt, De = "__reactContainer$" + Pt, Wn = "__reactEvents$" + Pt, Ov = "__reactListeners$" + Pt, Dv = "__reactHandles$" + Pt, _f = "__reactResources$" + Pt, je = "__reactMarker$" + Pt;
  function $n(l) {
    delete l[Ql], delete l[Fl], delete l[Wn], delete l[Ov], delete l[Dv];
  }
  function La(l) {
    var t = l[Ql];
    if (t) return t;
    for (var a = l.parentNode; a; ) {
      if (t = a[De] || a[Ql]) {
        if (a = t.alternate, t.child !== null || a !== null && a.child !== null) for (l = Gd(l); l !== null; ) {
          if (a = l[Ql]) return a;
          l = Gd(l);
        }
        return t;
      }
      l = a, a = l.parentNode;
    }
    return null;
  }
  function Va(l) {
    if (l = l[Ql] || l[De]) {
      var t = l.tag;
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3) return l;
    }
    return null;
  }
  function Ue(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l.stateNode;
    throw Error(s(33));
  }
  function Ka(l) {
    var t = l[_f];
    return t || (t = l[_f] = {
      hoistableStyles: /* @__PURE__ */ new Map(),
      hoistableScripts: /* @__PURE__ */ new Map()
    }), t;
  }
  function Gl(l) {
    l[je] = !0;
  }
  var zf = /* @__PURE__ */ new Set(), pf = {};
  function Ea(l, t) {
    Ja(l, t), Ja(l + "Capture", t);
  }
  function Ja(l, t) {
    for (pf[l] = t, l = 0; l < t.length; l++) zf.add(t[l]);
  }
  var jv = RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), Ef = {}, Tf = {};
  function Uv(l) {
    return Vn.call(Tf, l) ? !0 : Vn.call(Ef, l) ? !1 : jv.test(l) ? Tf[l] = !0 : (Ef[l] = !0, !1);
  }
  function Ou(l, t, a) {
    if (Uv(t)) if (a === null) l.removeAttribute(t);
    else {
      switch (typeof a) {
        case "undefined":
        case "function":
        case "symbol":
          l.removeAttribute(t);
          return;
        case "boolean":
          var e = t.toLowerCase().slice(0, 5);
          if (e !== "data-" && e !== "aria-") {
            l.removeAttribute(t);
            return;
          }
      }
      l.setAttribute(t, "" + a);
    }
  }
  function Du(l, t, a) {
    if (a === null) l.removeAttribute(t);
    else {
      switch (typeof a) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          l.removeAttribute(t);
          return;
      }
      l.setAttribute(t, "" + a);
    }
  }
  function xt(l, t, a, e) {
    if (e === null) l.removeAttribute(a);
    else {
      switch (typeof e) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          l.removeAttribute(a);
          return;
      }
      l.setAttributeNS(t, a, "" + e);
    }
  }
  function mt(l) {
    switch (typeof l) {
      case "bigint":
      case "boolean":
      case "number":
      case "string":
      case "undefined":
        return l;
      case "object":
        return l;
      default:
        return "";
    }
  }
  function Mf(l) {
    var t = l.type;
    return (l = l.nodeName) && l.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function Hv(l, t, a) {
    var e = Object.getOwnPropertyDescriptor(l.constructor.prototype, t);
    if (!l.hasOwnProperty(t) && typeof e < "u" && typeof e.get == "function" && typeof e.set == "function") {
      var u = e.get, n = e.set;
      return Object.defineProperty(l, t, {
        configurable: !0,
        get: function() {
          return u.call(this);
        },
        set: function(i) {
          a = "" + i, n.call(this, i);
        }
      }), Object.defineProperty(l, t, { enumerable: e.enumerable }), {
        getValue: function() {
          return a;
        },
        setValue: function(i) {
          a = "" + i;
        },
        stopTracking: function() {
          l._valueTracker = null, delete l[t];
        }
      };
    }
  }
  function Fn(l) {
    if (!l._valueTracker) {
      var t = Mf(l) ? "checked" : "value";
      l._valueTracker = Hv(l, t, "" + l[t]);
    }
  }
  function Af(l) {
    if (!l) return !1;
    var t = l._valueTracker;
    if (!t) return !0;
    var a = t.getValue(), e = "";
    return l && (e = Mf(l) ? l.checked ? "true" : "false" : l.value), l = e, l !== a ? (t.setValue(l), !0) : !1;
  }
  function ju(l) {
    if (l = l || (typeof document < "u" ? document : void 0), typeof l > "u") return null;
    try {
      return l.activeElement || l.body;
    } catch {
      return l.body;
    }
  }
  var xv = /[\n"\\]/g;
  function ht(l) {
    return l.replace(xv, function(t) {
      return "\\" + t.charCodeAt(0).toString(16) + " ";
    });
  }
  function In(l, t, a, e, u, n, i, c) {
    l.name = "", i != null && typeof i != "function" && typeof i != "symbol" && typeof i != "boolean" ? l.type = i : l.removeAttribute("type"), t != null ? i === "number" ? (t === 0 && l.value === "" || l.value != t) && (l.value = "" + mt(t)) : l.value !== "" + mt(t) && (l.value = "" + mt(t)) : i !== "submit" && i !== "reset" || l.removeAttribute("value"), t != null ? Pn(l, i, mt(t)) : a != null ? Pn(l, i, mt(a)) : e != null && l.removeAttribute("value"), u == null && n != null && (l.defaultChecked = !!n), u != null && (l.checked = u && typeof u != "function" && typeof u != "symbol"), c != null && typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" ? l.name = "" + mt(c) : l.removeAttribute("name");
  }
  function Nf(l, t, a, e, u, n, i, c) {
    if (n != null && typeof n != "function" && typeof n != "symbol" && typeof n != "boolean" && (l.type = n), t != null || a != null) {
      if (!(n !== "submit" && n !== "reset" || t != null)) {
        Fn(l);
        return;
      }
      a = a != null ? "" + mt(a) : "", t = t != null ? "" + mt(t) : a, c || t === l.value || (l.value = t), l.defaultValue = t;
    }
    e = e ?? u, e = typeof e != "function" && typeof e != "symbol" && !!e, l.checked = c ? l.checked : !!e, l.defaultChecked = !!e, i != null && typeof i != "function" && typeof i != "symbol" && typeof i != "boolean" && (l.name = i), Fn(l);
  }
  function Pn(l, t, a) {
    t === "number" && ju(l.ownerDocument) === l || l.defaultValue === "" + a || (l.defaultValue = "" + a);
  }
  function wa(l, t, a, e) {
    if (l = l.options, t) {
      t = {};
      for (var u = 0; u < a.length; u++) t["$" + a[u]] = !0;
      for (a = 0; a < l.length; a++) u = t.hasOwnProperty("$" + l[a].value), l[a].selected !== u && (l[a].selected = u), u && e && (l[a].defaultSelected = !0);
    } else {
      for (a = "" + mt(a), t = null, u = 0; u < l.length; u++) {
        if (l[u].value === a) {
          l[u].selected = !0, e && (l[u].defaultSelected = !0);
          return;
        }
        t !== null || l[u].disabled || (t = l[u]);
      }
      t !== null && (t.selected = !0);
    }
  }
  function Of(l, t, a) {
    if (t != null && (t = "" + mt(t), t !== l.value && (l.value = t), a == null)) {
      l.defaultValue !== t && (l.defaultValue = t);
      return;
    }
    l.defaultValue = a != null ? "" + mt(a) : "";
  }
  function Df(l, t, a, e) {
    if (t == null) {
      if (e != null) {
        if (a != null) throw Error(s(92));
        if (x(e)) {
          if (1 < e.length) throw Error(s(93));
          e = e[0];
        }
        a = e;
      }
      a ??= "", t = a;
    }
    a = mt(t), l.defaultValue = a, e = l.textContent, e === a && e !== "" && e !== null && (l.value = e), Fn(l);
  }
  function ka(l, t) {
    if (t) {
      var a = l.firstChild;
      if (a && a === l.lastChild && a.nodeType === 3) {
        a.nodeValue = t;
        return;
      }
    }
    l.textContent = t;
  }
  var Rv = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));
  function jf(l, t, a) {
    var e = t.indexOf("--") === 0;
    a == null || typeof a == "boolean" || a === "" ? e ? l.setProperty(t, "") : t === "float" ? l.cssFloat = "" : l[t] = "" : e ? l.setProperty(t, a) : typeof a != "number" || a === 0 || Rv.has(t) ? t === "float" ? l.cssFloat = a : l[t] = ("" + a).trim() : l[t] = a + "px";
  }
  function Uf(l, t, a) {
    if (t != null && typeof t != "object") throw Error(s(62));
    if (l = l.style, a != null) {
      for (var e in a) !a.hasOwnProperty(e) || t != null && t.hasOwnProperty(e) || (e.indexOf("--") === 0 ? l.setProperty(e, "") : e === "float" ? l.cssFloat = "" : l[e] = "");
      for (var u in t) e = t[u], t.hasOwnProperty(u) && a[u] !== e && jf(l, u, e);
    } else for (var n in t) t.hasOwnProperty(n) && jf(l, n, t[n]);
  }
  function li(l) {
    if (l.indexOf("-") === -1) return !1;
    switch (l) {
      case "annotation-xml":
      case "color-profile":
      case "font-face":
      case "font-face-src":
      case "font-face-uri":
      case "font-face-format":
      case "font-face-name":
      case "missing-glyph":
        return !1;
      default:
        return !0;
    }
  }
  var Cv = /* @__PURE__ */ new Map([
    ["acceptCharset", "accept-charset"],
    ["htmlFor", "for"],
    ["httpEquiv", "http-equiv"],
    ["crossOrigin", "crossorigin"],
    ["accentHeight", "accent-height"],
    ["alignmentBaseline", "alignment-baseline"],
    ["arabicForm", "arabic-form"],
    ["baselineShift", "baseline-shift"],
    ["capHeight", "cap-height"],
    ["clipPath", "clip-path"],
    ["clipRule", "clip-rule"],
    ["colorInterpolation", "color-interpolation"],
    ["colorInterpolationFilters", "color-interpolation-filters"],
    ["colorProfile", "color-profile"],
    ["colorRendering", "color-rendering"],
    ["dominantBaseline", "dominant-baseline"],
    ["enableBackground", "enable-background"],
    ["fillOpacity", "fill-opacity"],
    ["fillRule", "fill-rule"],
    ["floodColor", "flood-color"],
    ["floodOpacity", "flood-opacity"],
    ["fontFamily", "font-family"],
    ["fontSize", "font-size"],
    ["fontSizeAdjust", "font-size-adjust"],
    ["fontStretch", "font-stretch"],
    ["fontStyle", "font-style"],
    ["fontVariant", "font-variant"],
    ["fontWeight", "font-weight"],
    ["glyphName", "glyph-name"],
    ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
    ["glyphOrientationVertical", "glyph-orientation-vertical"],
    ["horizAdvX", "horiz-adv-x"],
    ["horizOriginX", "horiz-origin-x"],
    ["imageRendering", "image-rendering"],
    ["letterSpacing", "letter-spacing"],
    ["lightingColor", "lighting-color"],
    ["markerEnd", "marker-end"],
    ["markerMid", "marker-mid"],
    ["markerStart", "marker-start"],
    ["overlinePosition", "overline-position"],
    ["overlineThickness", "overline-thickness"],
    ["paintOrder", "paint-order"],
    ["panose-1", "panose-1"],
    ["pointerEvents", "pointer-events"],
    ["renderingIntent", "rendering-intent"],
    ["shapeRendering", "shape-rendering"],
    ["stopColor", "stop-color"],
    ["stopOpacity", "stop-opacity"],
    ["strikethroughPosition", "strikethrough-position"],
    ["strikethroughThickness", "strikethrough-thickness"],
    ["strokeDasharray", "stroke-dasharray"],
    ["strokeDashoffset", "stroke-dashoffset"],
    ["strokeLinecap", "stroke-linecap"],
    ["strokeLinejoin", "stroke-linejoin"],
    ["strokeMiterlimit", "stroke-miterlimit"],
    ["strokeOpacity", "stroke-opacity"],
    ["strokeWidth", "stroke-width"],
    ["textAnchor", "text-anchor"],
    ["textDecoration", "text-decoration"],
    ["textRendering", "text-rendering"],
    ["transformOrigin", "transform-origin"],
    ["underlinePosition", "underline-position"],
    ["underlineThickness", "underline-thickness"],
    ["unicodeBidi", "unicode-bidi"],
    ["unicodeRange", "unicode-range"],
    ["unitsPerEm", "units-per-em"],
    ["vAlphabetic", "v-alphabetic"],
    ["vHanging", "v-hanging"],
    ["vIdeographic", "v-ideographic"],
    ["vMathematical", "v-mathematical"],
    ["vectorEffect", "vector-effect"],
    ["vertAdvY", "vert-adv-y"],
    ["vertOriginX", "vert-origin-x"],
    ["vertOriginY", "vert-origin-y"],
    ["wordSpacing", "word-spacing"],
    ["writingMode", "writing-mode"],
    ["xmlnsXlink", "xmlns:xlink"],
    ["xHeight", "x-height"]
  ]), Bv = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Uu(l) {
    return Bv.test("" + l) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : l;
  }
  function Rt() {
  }
  var ti = null;
  function ai(l) {
    return l = l.target || l.srcElement || window, l.correspondingUseElement && (l = l.correspondingUseElement), l.nodeType === 3 ? l.parentNode : l;
  }
  var Wa = null, $a = null;
  function Hf(l) {
    var t = Va(l);
    if (t && (l = t.stateNode)) {
      var a = l[Fl] || null;
      l: switch (l = t.stateNode, t.type) {
        case "input":
          if (In(l, a.value, a.defaultValue, a.defaultValue, a.checked, a.defaultChecked, a.type, a.name), t = a.name, a.type === "radio" && t != null) {
            for (a = l; a.parentNode; ) a = a.parentNode;
            for (a = a.querySelectorAll('input[name="' + ht("" + t) + '"][type="radio"]'), t = 0; t < a.length; t++) {
              var e = a[t];
              if (e !== l && e.form === l.form) {
                var u = e[Fl] || null;
                if (!u) throw Error(s(90));
                In(e, u.value, u.defaultValue, u.defaultValue, u.checked, u.defaultChecked, u.type, u.name);
              }
            }
            for (t = 0; t < a.length; t++) e = a[t], e.form === l.form && Af(e);
          }
          break l;
        case "textarea":
          Of(l, a.value, a.defaultValue);
          break l;
        case "select":
          t = a.value, t != null && wa(l, !!a.multiple, t, !1);
      }
    }
  }
  var ei = !1;
  function xf(l, t, a) {
    if (ei) return l(t, a);
    ei = !0;
    try {
      return l(t);
    } finally {
      if (ei = !1, (Wa !== null || $a !== null) && (Sn(), Wa && (t = Wa, l = $a, $a = Wa = null, Hf(t), l)))
        for (t = 0; t < l.length; t++) Hf(l[t]);
    }
  }
  function He(l, t) {
    var a = l.stateNode;
    if (a === null) return null;
    var e = a[Fl] || null;
    if (e === null) return null;
    a = e[t];
    l: switch (t) {
      case "onClick":
      case "onClickCapture":
      case "onDoubleClick":
      case "onDoubleClickCapture":
      case "onMouseDown":
      case "onMouseDownCapture":
      case "onMouseMove":
      case "onMouseMoveCapture":
      case "onMouseUp":
      case "onMouseUpCapture":
      case "onMouseEnter":
        (e = !e.disabled) || (l = l.type, e = !(l === "button" || l === "input" || l === "select" || l === "textarea")), l = !e;
        break l;
      default:
        l = !1;
    }
    if (l) return null;
    if (a && typeof a != "function") throw Error(s(231, t, typeof a));
    return a;
  }
  var Ct = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), ui = !1;
  if (Ct) try {
    var xe = {};
    Object.defineProperty(xe, "passive", { get: function() {
      ui = !0;
    } }), window.addEventListener("test", xe, xe), window.removeEventListener("test", xe, xe);
  } catch {
    ui = !1;
  }
  var la = null, ni = null, Hu = null;
  function Rf() {
    if (Hu) return Hu;
    var l, t = ni, a = t.length, e, u = "value" in la ? la.value : la.textContent, n = u.length;
    for (l = 0; l < a && t[l] === u[l]; l++) ;
    var i = a - l;
    for (e = 1; e <= i && t[a - e] === u[n - e]; e++) ;
    return Hu = u.slice(l, 1 < e ? 1 - e : void 0);
  }
  function xu(l) {
    var t = l.keyCode;
    return "charCode" in l ? (l = l.charCode, l === 0 && t === 13 && (l = 13)) : l = t, l === 10 && (l = 13), 32 <= l || l === 13 ? l : 0;
  }
  function Ru() {
    return !0;
  }
  function Cf() {
    return !1;
  }
  function Il(l) {
    function t(a, e, u, n, i) {
      this._reactName = a, this._targetInst = u, this.type = e, this.nativeEvent = n, this.target = i, this.currentTarget = null;
      for (var c in l) l.hasOwnProperty(c) && (a = l[c], this[c] = a ? a(n) : n[c]);
      return this.isDefaultPrevented = (n.defaultPrevented != null ? n.defaultPrevented : n.returnValue === !1) ? Ru : Cf, this.isPropagationStopped = Cf, this;
    }
    return C(t.prototype, {
      preventDefault: function() {
        this.defaultPrevented = !0;
        var a = this.nativeEvent;
        a && (a.preventDefault ? a.preventDefault() : typeof a.returnValue != "unknown" && (a.returnValue = !1), this.isDefaultPrevented = Ru);
      },
      stopPropagation: function() {
        var a = this.nativeEvent;
        a && (a.stopPropagation ? a.stopPropagation() : typeof a.cancelBubble != "unknown" && (a.cancelBubble = !0), this.isPropagationStopped = Ru);
      },
      persist: function() {
      },
      isPersistent: Ru
    }), t;
  }
  var Ta = {
    eventPhase: 0,
    bubbles: 0,
    cancelable: 0,
    timeStamp: function(l) {
      return l.timeStamp || Date.now();
    },
    defaultPrevented: 0,
    isTrusted: 0
  }, Cu = Il(Ta), Re = C({}, Ta, {
    view: 0,
    detail: 0
  }), Yv = Il(Re), ii, ci, Ce, Bu = C({}, Re, {
    screenX: 0,
    screenY: 0,
    clientX: 0,
    clientY: 0,
    pageX: 0,
    pageY: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    getModifierState: si,
    button: 0,
    buttons: 0,
    relatedTarget: function(l) {
      return l.relatedTarget === void 0 ? l.fromElement === l.srcElement ? l.toElement : l.fromElement : l.relatedTarget;
    },
    movementX: function(l) {
      return "movementX" in l ? l.movementX : (l !== Ce && (Ce && l.type === "mousemove" ? (ii = l.screenX - Ce.screenX, ci = l.screenY - Ce.screenY) : ci = ii = 0, Ce = l), ii);
    },
    movementY: function(l) {
      return "movementY" in l ? l.movementY : ci;
    }
  }), Bf = Il(Bu), qv = Il(C({}, Bu, { dataTransfer: 0 })), fi = Il(C({}, Re, { relatedTarget: 0 })), Gv = Il(C({}, Ta, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  })), Xv = Il(C({}, Ta, { clipboardData: function(l) {
    return "clipboardData" in l ? l.clipboardData : window.clipboardData;
  } })), Yf = Il(C({}, Ta, { data: 0 })), Qv = {
    Esc: "Escape",
    Spacebar: " ",
    Left: "ArrowLeft",
    Up: "ArrowUp",
    Right: "ArrowRight",
    Down: "ArrowDown",
    Del: "Delete",
    Win: "OS",
    Menu: "ContextMenu",
    Apps: "ContextMenu",
    Scroll: "ScrollLock",
    MozPrintableKey: "Unidentified"
  }, Zv = {
    8: "Backspace",
    9: "Tab",
    12: "Clear",
    13: "Enter",
    16: "Shift",
    17: "Control",
    18: "Alt",
    19: "Pause",
    20: "CapsLock",
    27: "Escape",
    32: " ",
    33: "PageUp",
    34: "PageDown",
    35: "End",
    36: "Home",
    37: "ArrowLeft",
    38: "ArrowUp",
    39: "ArrowRight",
    40: "ArrowDown",
    45: "Insert",
    46: "Delete",
    112: "F1",
    113: "F2",
    114: "F3",
    115: "F4",
    116: "F5",
    117: "F6",
    118: "F7",
    119: "F8",
    120: "F9",
    121: "F10",
    122: "F11",
    123: "F12",
    144: "NumLock",
    145: "ScrollLock",
    224: "Meta"
  }, Lv = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function Vv(l) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(l) : (l = Lv[l]) ? !!t[l] : !1;
  }
  function si() {
    return Vv;
  }
  var Kv = Il(C({}, Re, {
    key: function(l) {
      if (l.key) {
        var t = Qv[l.key] || l.key;
        if (t !== "Unidentified") return t;
      }
      return l.type === "keypress" ? (l = xu(l), l === 13 ? "Enter" : String.fromCharCode(l)) : l.type === "keydown" || l.type === "keyup" ? Zv[l.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: si,
    charCode: function(l) {
      return l.type === "keypress" ? xu(l) : 0;
    },
    keyCode: function(l) {
      return l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    },
    which: function(l) {
      return l.type === "keypress" ? xu(l) : l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    }
  })), qf = Il(C({}, Bu, {
    pointerId: 0,
    width: 0,
    height: 0,
    pressure: 0,
    tangentialPressure: 0,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    pointerType: 0,
    isPrimary: 0
  })), Jv = Il(C({}, Re, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: si
  })), wv = Il(C({}, Ta, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  })), kv = Il(C({}, Bu, {
    deltaX: function(l) {
      return "deltaX" in l ? l.deltaX : "wheelDeltaX" in l ? -l.wheelDeltaX : 0;
    },
    deltaY: function(l) {
      return "deltaY" in l ? l.deltaY : "wheelDeltaY" in l ? -l.wheelDeltaY : "wheelDelta" in l ? -l.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  })), Wv = Il(C({}, Ta, {
    newState: 0,
    oldState: 0
  })), $v = [
    9,
    13,
    27,
    32
  ], di = Ct && "CompositionEvent" in window, Be = null;
  Ct && "documentMode" in document && (Be = document.documentMode);
  var Fv = Ct && "TextEvent" in window && !Be, Gf = Ct && (!di || Be && 8 < Be && 11 >= Be), Xf = " ", Qf = !1;
  function Zf(l, t) {
    switch (l) {
      case "keyup":
        return $v.indexOf(t.keyCode) !== -1;
      case "keydown":
        return t.keyCode !== 229;
      case "keypress":
      case "mousedown":
      case "focusout":
        return !0;
      default:
        return !1;
    }
  }
  function Lf(l) {
    return l = l.detail, typeof l == "object" && "data" in l ? l.data : null;
  }
  var Fa = !1;
  function Iv(l, t) {
    switch (l) {
      case "compositionend":
        return Lf(t);
      case "keypress":
        return t.which !== 32 ? null : (Qf = !0, Xf);
      case "textInput":
        return l = t.data, l === Xf && Qf ? null : l;
      default:
        return null;
    }
  }
  function Pv(l, t) {
    if (Fa) return l === "compositionend" || !di && Zf(l, t) ? (l = Rf(), Hu = ni = la = null, Fa = !1, l) : null;
    switch (l) {
      case "paste":
        return null;
      case "keypress":
        if (!(t.ctrlKey || t.altKey || t.metaKey) || t.ctrlKey && t.altKey) {
          if (t.char && 1 < t.char.length) return t.char;
          if (t.which) return String.fromCharCode(t.which);
        }
        return null;
      case "compositionend":
        return Gf && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var lr = {
    color: !0,
    date: !0,
    datetime: !0,
    "datetime-local": !0,
    email: !0,
    month: !0,
    number: !0,
    password: !0,
    range: !0,
    search: !0,
    tel: !0,
    text: !0,
    time: !0,
    url: !0,
    week: !0
  };
  function Vf(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t === "input" ? !!lr[l.type] : t === "textarea";
  }
  function Kf(l, t, a, e) {
    Wa ? $a ? $a.push(e) : $a = [e] : Wa = e, t = An(t, "onChange"), 0 < t.length && (a = new Cu("onChange", "change", null, a, e), l.push({
      event: a,
      listeners: t
    }));
  }
  var Ye = null, qe = null;
  function tr(l) {
    Td(l, 0);
  }
  function Yu(l) {
    if (Af(Ue(l))) return l;
  }
  function Jf(l, t) {
    if (l === "change") return t;
  }
  var wf = !1;
  if (Ct) {
    var vi;
    if (Ct) {
      var ri = "oninput" in document;
      if (!ri) {
        var kf = document.createElement("div");
        kf.setAttribute("oninput", "return;"), ri = typeof kf.oninput == "function";
      }
      vi = ri;
    } else vi = !1;
    wf = vi && (!document.documentMode || 9 < document.documentMode);
  }
  function Wf() {
    Ye && (Ye.detachEvent("onpropertychange", $f), qe = Ye = null);
  }
  function $f(l) {
    if (l.propertyName === "value" && Yu(qe)) {
      var t = [];
      Kf(t, qe, l, ai(l)), xf(tr, t);
    }
  }
  function ar(l, t, a) {
    l === "focusin" ? (Wf(), Ye = t, qe = a, Ye.attachEvent("onpropertychange", $f)) : l === "focusout" && Wf();
  }
  function er(l) {
    if (l === "selectionchange" || l === "keyup" || l === "keydown") return Yu(qe);
  }
  function ur(l, t) {
    if (l === "click") return Yu(t);
  }
  function nr(l, t) {
    if (l === "input" || l === "change") return Yu(t);
  }
  function ir(l, t) {
    return l === t && (l !== 0 || 1 / l === 1 / t) || l !== l && t !== t;
  }
  var ft = typeof Object.is == "function" ? Object.is : ir;
  function Ge(l, t) {
    if (ft(l, t)) return !0;
    if (typeof l != "object" || l === null || typeof t != "object" || t === null) return !1;
    var a = Object.keys(l), e = Object.keys(t);
    if (a.length !== e.length) return !1;
    for (e = 0; e < a.length; e++) {
      var u = a[e];
      if (!Vn.call(t, u) || !ft(l[u], t[u])) return !1;
    }
    return !0;
  }
  function Ff(l) {
    for (; l && l.firstChild; ) l = l.firstChild;
    return l;
  }
  function If(l, t) {
    var a = Ff(l);
    l = 0;
    for (var e; a; ) {
      if (a.nodeType === 3) {
        if (e = l + a.textContent.length, l <= t && e >= t) return {
          node: a,
          offset: t - l
        };
        l = e;
      }
      l: {
        for (; a; ) {
          if (a.nextSibling) {
            a = a.nextSibling;
            break l;
          }
          a = a.parentNode;
        }
        a = void 0;
      }
      a = Ff(a);
    }
  }
  function Pf(l, t) {
    return l && t ? l === t ? !0 : l && l.nodeType === 3 ? !1 : t && t.nodeType === 3 ? Pf(l, t.parentNode) : "contains" in l ? l.contains(t) : l.compareDocumentPosition ? !!(l.compareDocumentPosition(t) & 16) : !1 : !1;
  }
  function l0(l) {
    l = l != null && l.ownerDocument != null && l.ownerDocument.defaultView != null ? l.ownerDocument.defaultView : window;
    for (var t = ju(l.document); t instanceof l.HTMLIFrameElement; ) {
      try {
        var a = typeof t.contentWindow.location.href == "string";
      } catch {
        a = !1;
      }
      if (a) l = t.contentWindow;
      else break;
      t = ju(l.document);
    }
    return t;
  }
  function oi(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t && (t === "input" && (l.type === "text" || l.type === "search" || l.type === "tel" || l.type === "url" || l.type === "password") || t === "textarea" || l.contentEditable === "true");
  }
  var cr = Ct && "documentMode" in document && 11 >= document.documentMode, Ia = null, mi = null, Xe = null, hi = !1;
  function t0(l, t, a) {
    var e = a.window === a ? a.document : a.nodeType === 9 ? a : a.ownerDocument;
    hi || Ia == null || Ia !== ju(e) || (e = Ia, "selectionStart" in e && oi(e) ? e = {
      start: e.selectionStart,
      end: e.selectionEnd
    } : (e = (e.ownerDocument && e.ownerDocument.defaultView || window).getSelection(), e = {
      anchorNode: e.anchorNode,
      anchorOffset: e.anchorOffset,
      focusNode: e.focusNode,
      focusOffset: e.focusOffset
    }), Xe && Ge(Xe, e) || (Xe = e, e = An(mi, "onSelect"), 0 < e.length && (t = new Cu("onSelect", "select", null, t, a), l.push({
      event: t,
      listeners: e
    }), t.target = Ia)));
  }
  function Ma(l, t) {
    var a = {};
    return a[l.toLowerCase()] = t.toLowerCase(), a["Webkit" + l] = "webkit" + t, a["Moz" + l] = "moz" + t, a;
  }
  var Pa = {
    animationend: Ma("Animation", "AnimationEnd"),
    animationiteration: Ma("Animation", "AnimationIteration"),
    animationstart: Ma("Animation", "AnimationStart"),
    transitionrun: Ma("Transition", "TransitionRun"),
    transitionstart: Ma("Transition", "TransitionStart"),
    transitioncancel: Ma("Transition", "TransitionCancel"),
    transitionend: Ma("Transition", "TransitionEnd")
  }, yi = {}, a0 = {};
  Ct && (a0 = document.createElement("div").style, "AnimationEvent" in window || (delete Pa.animationend.animation, delete Pa.animationiteration.animation, delete Pa.animationstart.animation), "TransitionEvent" in window || delete Pa.transitionend.transition);
  function Aa(l) {
    if (yi[l]) return yi[l];
    if (!Pa[l]) return l;
    var t = Pa[l], a;
    for (a in t) if (t.hasOwnProperty(a) && a in a0) return yi[l] = t[a];
    return l;
  }
  var e0 = Aa("animationend"), u0 = Aa("animationiteration"), n0 = Aa("animationstart"), fr = Aa("transitionrun"), sr = Aa("transitionstart"), dr = Aa("transitioncancel"), i0 = Aa("transitionend"), c0 = /* @__PURE__ */ new Map(), gi = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
  gi.push("scrollEnd");
  function Mt(l, t) {
    c0.set(l, t), Ea(t, [l]);
  }
  var qu = typeof reportError == "function" ? reportError : function(l) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var t = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof l == "object" && l !== null && typeof l.message == "string" ? String(l.message) : String(l),
        error: l
      });
      if (!window.dispatchEvent(t)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", l);
      return;
    }
    console.error(l);
  }, yt = [], le = 0, bi = 0;
  function Gu() {
    for (var l = le, t = bi = le = 0; t < l; ) {
      var a = yt[t];
      yt[t++] = null;
      var e = yt[t];
      yt[t++] = null;
      var u = yt[t];
      yt[t++] = null;
      var n = yt[t];
      if (yt[t++] = null, e !== null && u !== null) {
        var i = e.pending;
        i === null ? u.next = u : (u.next = i.next, i.next = u), e.pending = u;
      }
      n !== 0 && f0(a, u, n);
    }
  }
  function Xu(l, t, a, e) {
    yt[le++] = l, yt[le++] = t, yt[le++] = a, yt[le++] = e, bi |= e, l.lanes |= e, l = l.alternate, l !== null && (l.lanes |= e);
  }
  function Si(l, t, a, e) {
    return Xu(l, t, a, e), Qu(l);
  }
  function Na(l, t) {
    return Xu(l, null, null, t), Qu(l);
  }
  function f0(l, t, a) {
    l.lanes |= a;
    var e = l.alternate;
    e !== null && (e.lanes |= a);
    for (var u = !1, n = l.return; n !== null; ) n.childLanes |= a, e = n.alternate, e !== null && (e.childLanes |= a), n.tag === 22 && (l = n.stateNode, l === null || l._visibility & 1 || (u = !0)), l = n, n = n.return;
    return l.tag === 3 ? (n = l.stateNode, u && t !== null && (u = 31 - ct(a), l = n.hiddenUpdates, e = l[u], e === null ? l[u] = [t] : e.push(t), t.lane = a | 536870912), n) : null;
  }
  function Qu(l) {
    if (50 < fu) throw fu = 0, Oc = null, Error(s(185));
    for (var t = l.return; t !== null; ) l = t, t = l.return;
    return l.tag === 3 ? l.stateNode : null;
  }
  var te = {};
  function vr(l, t, a, e) {
    this.tag = l, this.key = a, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = e, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function st(l, t, a, e) {
    return new vr(l, t, a, e);
  }
  function _i(l) {
    return l = l.prototype, !(!l || !l.isReactComponent);
  }
  function Bt(l, t) {
    var a = l.alternate;
    return a === null ? (a = st(l.tag, t, l.key, l.mode), a.elementType = l.elementType, a.type = l.type, a.stateNode = l.stateNode, a.alternate = l, l.alternate = a) : (a.pendingProps = t, a.type = l.type, a.flags = 0, a.subtreeFlags = 0, a.deletions = null), a.flags = l.flags & 65011712, a.childLanes = l.childLanes, a.lanes = l.lanes, a.child = l.child, a.memoizedProps = l.memoizedProps, a.memoizedState = l.memoizedState, a.updateQueue = l.updateQueue, t = l.dependencies, a.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }, a.sibling = l.sibling, a.index = l.index, a.ref = l.ref, a.refCleanup = l.refCleanup, a;
  }
  function s0(l, t) {
    l.flags &= 65011714;
    var a = l.alternate;
    return a === null ? (l.childLanes = 0, l.lanes = t, l.child = null, l.subtreeFlags = 0, l.memoizedProps = null, l.memoizedState = null, l.updateQueue = null, l.dependencies = null, l.stateNode = null) : (l.childLanes = a.childLanes, l.lanes = a.lanes, l.child = a.child, l.subtreeFlags = 0, l.deletions = null, l.memoizedProps = a.memoizedProps, l.memoizedState = a.memoizedState, l.updateQueue = a.updateQueue, l.type = a.type, t = a.dependencies, l.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }), l;
  }
  function Zu(l, t, a, e, u, n) {
    var i = 0;
    if (e = l, typeof l == "function") _i(l) && (i = 1);
    else if (typeof l == "string") i = bo(l, a, L.current) ? 26 : l === "html" || l === "head" || l === "body" ? 27 : 5;
    else l: switch (l) {
      case kl:
        return l = st(31, a, t, u), l.elementType = kl, l.lanes = n, l;
      case Tl:
        return Oa(a.children, u, n, t);
      case Jl:
        i = 8, u |= 24;
        break;
      case Ul:
        return l = st(12, a, t, u | 2), l.elementType = Ul, l.lanes = n, l;
      case Z:
        return l = st(13, a, t, u), l.elementType = Z, l.lanes = n, l;
      case G:
        return l = st(19, a, t, u), l.elementType = G, l.lanes = n, l;
      default:
        if (typeof l == "object" && l !== null) switch (l.$$typeof) {
          case bl:
            i = 10;
            break l;
          case wl:
            i = 9;
            break l;
          case V:
            i = 11;
            break l;
          case K:
            i = 14;
            break l;
          case Hl:
            i = 16, e = null;
            break l;
        }
        i = 29, a = Error(s(130, l === null ? "null" : typeof l, "")), e = null;
    }
    return t = st(i, a, t, u), t.elementType = l, t.type = e, t.lanes = n, t;
  }
  function Oa(l, t, a, e) {
    return l = st(7, l, e, t), l.lanes = a, l;
  }
  function zi(l, t, a) {
    return l = st(6, l, null, t), l.lanes = a, l;
  }
  function d0(l) {
    var t = st(18, null, null, 0);
    return t.stateNode = l, t;
  }
  function pi(l, t, a) {
    return t = st(4, l.children !== null ? l.children : [], l.key, t), t.lanes = a, t.stateNode = {
      containerInfo: l.containerInfo,
      pendingChildren: null,
      implementation: l.implementation
    }, t;
  }
  var v0 = /* @__PURE__ */ new WeakMap();
  function gt(l, t) {
    if (typeof l == "object" && l !== null) {
      var a = v0.get(l);
      return a !== void 0 ? a : (t = {
        value: l,
        source: t,
        stack: sf(t)
      }, v0.set(l, t), t);
    }
    return {
      value: l,
      source: t,
      stack: sf(t)
    };
  }
  var ae = [], ee = 0, Lu = null, Qe = 0, bt = [], St = 0, ta = null, Ot = 1, Dt = "";
  function Yt(l, t) {
    ae[ee++] = Qe, ae[ee++] = Lu, Lu = l, Qe = t;
  }
  function r0(l, t, a) {
    bt[St++] = Ot, bt[St++] = Dt, bt[St++] = ta, ta = l;
    var e = Ot;
    l = Dt;
    var u = 32 - ct(e) - 1;
    e &= ~(1 << u), a += 1;
    var n = 32 - ct(t) + u;
    if (30 < n) {
      var i = u - u % 5;
      n = (e & (1 << i) - 1).toString(32), e >>= i, u -= i, Ot = 1 << 32 - ct(t) + u | a << u | e, Dt = n + l;
    } else Ot = 1 << n | a << u | e, Dt = l;
  }
  function Ei(l) {
    l.return !== null && (Yt(l, 1), r0(l, 1, 0));
  }
  function Ti(l) {
    for (; l === Lu; ) Lu = ae[--ee], ae[ee] = null, Qe = ae[--ee], ae[ee] = null;
    for (; l === ta; ) ta = bt[--St], bt[St] = null, Dt = bt[--St], bt[St] = null, Ot = bt[--St], bt[St] = null;
  }
  function o0(l, t) {
    bt[St++] = Ot, bt[St++] = Dt, bt[St++] = ta, Ot = t.id, Dt = t.overflow, ta = l;
  }
  var Zl = null, _l = null, nl = !1, aa = null, _t = !1, Mi = Error(s(519));
  function ea(l) {
    throw Ze(gt(Error(s(418, 1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML", "")), l)), Mi;
  }
  function m0(l) {
    var t = l.stateNode, a = l.type, e = l.memoizedProps;
    switch (t[Ql] = l, t[Fl] = e, a) {
      case "dialog":
        ll("cancel", t), ll("close", t);
        break;
      case "iframe":
      case "object":
      case "embed":
        ll("load", t);
        break;
      case "video":
      case "audio":
        for (a = 0; a < du.length; a++) ll(du[a], t);
        break;
      case "source":
        ll("error", t);
        break;
      case "img":
      case "image":
      case "link":
        ll("error", t), ll("load", t);
        break;
      case "details":
        ll("toggle", t);
        break;
      case "input":
        ll("invalid", t), Nf(t, e.value, e.defaultValue, e.checked, e.defaultChecked, e.type, e.name, !0);
        break;
      case "select":
        ll("invalid", t);
        break;
      case "textarea":
        ll("invalid", t), Df(t, e.value, e.defaultValue, e.children);
    }
    a = e.children, typeof a != "string" && typeof a != "number" && typeof a != "bigint" || t.textContent === "" + a || e.suppressHydrationWarning === !0 || Dd(t.textContent, a) ? (e.popover != null && (ll("beforetoggle", t), ll("toggle", t)), e.onScroll != null && ll("scroll", t), e.onScrollEnd != null && ll("scrollend", t), e.onClick != null && (t.onclick = Rt), t = !0) : t = !1, t || ea(l, !0);
  }
  function h0(l) {
    for (Zl = l.return; Zl; ) switch (Zl.tag) {
      case 5:
      case 31:
      case 13:
        _t = !1;
        return;
      case 27:
      case 3:
        _t = !0;
        return;
      default:
        Zl = Zl.return;
    }
  }
  function ue(l) {
    if (l !== Zl) return !1;
    if (!nl) return h0(l), nl = !0, !1;
    var t = l.tag, a;
    if ((a = t !== 3 && t !== 27) && ((a = t === 5) && (a = l.type, a = !(a !== "form" && a !== "button") || Zc(l.type, l.memoizedProps)), a = !a), a && _l && ea(l), h0(l), t === 13) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(s(317));
      _l = qd(l);
    } else if (t === 31) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(s(317));
      _l = qd(l);
    } else t === 27 ? (t = _l, ha(l.type) ? (l = wc, wc = null, _l = l) : _l = t) : _l = Zl ? Et(l.stateNode.nextSibling) : null;
    return !0;
  }
  function Da() {
    _l = Zl = null, nl = !1;
  }
  function Ai() {
    var l = aa;
    return l !== null && (at === null ? at = l : at.push.apply(at, l), aa = null), l;
  }
  function Ze(l) {
    aa === null ? aa = [l] : aa.push(l);
  }
  var Ni = r(null), ja = null, qt = null;
  function ua(l, t, a) {
    Y(Ni, t._currentValue), t._currentValue = a;
  }
  function Gt(l) {
    l._currentValue = Ni.current, N(Ni);
  }
  function Oi(l, t, a) {
    for (; l !== null; ) {
      var e = l.alternate;
      if ((l.childLanes & t) !== t ? (l.childLanes |= t, e !== null && (e.childLanes |= t)) : e !== null && (e.childLanes & t) !== t && (e.childLanes |= t), l === a) break;
      l = l.return;
    }
  }
  function Di(l, t, a, e) {
    var u = l.child;
    for (u !== null && (u.return = l); u !== null; ) {
      var n = u.dependencies;
      if (n !== null) {
        var i = u.child;
        n = n.firstContext;
        l: for (; n !== null; ) {
          var c = n;
          n = u;
          for (var d = 0; d < t.length; d++) if (c.context === t[d]) {
            n.lanes |= a, c = n.alternate, c !== null && (c.lanes |= a), Oi(n.return, a, l), e || (i = null);
            break l;
          }
          n = c.next;
        }
      } else if (u.tag === 18) {
        if (i = u.return, i === null) throw Error(s(341));
        i.lanes |= a, n = i.alternate, n !== null && (n.lanes |= a), Oi(i, a, l), i = null;
      } else i = u.child;
      if (i !== null) i.return = u;
      else for (i = u; i !== null; ) {
        if (i === l) {
          i = null;
          break;
        }
        if (u = i.sibling, u !== null) {
          u.return = i.return, i = u;
          break;
        }
        i = i.return;
      }
      u = i;
    }
  }
  function ne(l, t, a, e) {
    l = null;
    for (var u = t, n = !1; u !== null; ) {
      if (!n) {
        if ((u.flags & 524288) !== 0) n = !0;
        else if ((u.flags & 262144) !== 0) break;
      }
      if (u.tag === 10) {
        var i = u.alternate;
        if (i === null) throw Error(s(387));
        if (i = i.memoizedProps, i !== null) {
          var c = u.type;
          ft(u.pendingProps.value, i.value) || (l !== null ? l.push(c) : l = [c]);
        }
      } else if (u === dl.current) {
        if (i = u.alternate, i === null) throw Error(s(387));
        i.memoizedState.memoizedState !== u.memoizedState.memoizedState && (l !== null ? l.push(hu) : l = [hu]);
      }
      u = u.return;
    }
    l !== null && Di(t, l, a, e), t.flags |= 262144;
  }
  function Vu(l) {
    for (l = l.firstContext; l !== null; ) {
      if (!ft(l.context._currentValue, l.memoizedValue)) return !0;
      l = l.next;
    }
    return !1;
  }
  function Ua(l) {
    ja = l, qt = null, l = l.dependencies, l !== null && (l.firstContext = null);
  }
  function Ll(l) {
    return y0(ja, l);
  }
  function Ku(l, t) {
    return ja === null && Ua(l), y0(l, t);
  }
  function y0(l, t) {
    var a = t._currentValue;
    if (t = {
      context: t,
      memoizedValue: a,
      next: null
    }, qt === null) {
      if (l === null) throw Error(s(308));
      qt = t, l.dependencies = {
        lanes: 0,
        firstContext: t
      }, l.flags |= 524288;
    } else qt = qt.next = t;
    return a;
  }
  var rr = typeof AbortController < "u" ? AbortController : function() {
    var l = [], t = this.signal = {
      aborted: !1,
      addEventListener: function(a, e) {
        l.push(e);
      }
    };
    this.abort = function() {
      t.aborted = !0, l.forEach(function(a) {
        return a();
      });
    };
  }, or = o.unstable_scheduleCallback, mr = o.unstable_NormalPriority, xl = {
    $$typeof: bl,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function ji() {
    return {
      controller: new rr(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function Le(l) {
    l.refCount--, l.refCount === 0 && or(mr, function() {
      l.controller.abort();
    });
  }
  var Ve = null, Ui = 0, ie = 0, ce = null;
  function hr(l, t) {
    if (Ve === null) {
      var a = Ve = [];
      Ui = 0, ie = Rc(), ce = {
        status: "pending",
        value: void 0,
        then: function(e) {
          a.push(e);
        }
      };
    }
    return Ui++, t.then(g0, g0), t;
  }
  function g0() {
    if (--Ui === 0 && Ve !== null) {
      ce !== null && (ce.status = "fulfilled");
      var l = Ve;
      Ve = null, ie = 0, ce = null;
      for (var t = 0; t < l.length; t++) (0, l[t])();
    }
  }
  function yr(l, t) {
    var a = [], e = {
      status: "pending",
      value: null,
      reason: null,
      then: function(u) {
        a.push(u);
      }
    };
    return l.then(function() {
      e.status = "fulfilled", e.value = t;
      for (var u = 0; u < a.length; u++) (0, a[u])(t);
    }, function(u) {
      for (e.status = "rejected", e.reason = u, u = 0; u < a.length; u++) (0, a[u])(void 0);
    }), e;
  }
  var b0 = D.S;
  D.S = function(l, t) {
    Is = nt(), typeof t == "object" && t !== null && typeof t.then == "function" && hr(l, t), b0 !== null && b0(l, t);
  };
  var Ha = r(null);
  function Hi() {
    var l = Ha.current;
    return l !== null ? l : yl.pooledCache;
  }
  function Ju(l, t) {
    t === null ? Y(Ha, Ha.current) : Y(Ha, t.pool);
  }
  function S0() {
    var l = Hi();
    return l === null ? null : {
      parent: xl._currentValue,
      pool: l
    };
  }
  var fe = Error(s(460)), xi = Error(s(474)), wu = Error(s(542)), ku = { then: function() {
  } };
  function _0(l) {
    return l = l.status, l === "fulfilled" || l === "rejected";
  }
  function z0(l, t, a) {
    switch (a = l[a], a === void 0 ? l.push(t) : a !== t && (t.then(Rt, Rt), t = a), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw l = t.reason, E0(l), l;
      default:
        if (typeof t.status == "string") t.then(Rt, Rt);
        else {
          if (l = yl, l !== null && 100 < l.shellSuspendCounter) throw Error(s(482));
          l = t, l.status = "pending", l.then(function(e) {
            if (t.status === "pending") {
              var u = t;
              u.status = "fulfilled", u.value = e;
            }
          }, function(e) {
            if (t.status === "pending") {
              var u = t;
              u.status = "rejected", u.reason = e;
            }
          });
        }
        switch (t.status) {
          case "fulfilled":
            return t.value;
          case "rejected":
            throw l = t.reason, E0(l), l;
        }
        throw Ra = t, fe;
    }
  }
  function xa(l) {
    try {
      var t = l._init;
      return t(l._payload);
    } catch (a) {
      throw a !== null && typeof a == "object" && typeof a.then == "function" ? (Ra = a, fe) : a;
    }
  }
  var Ra = null;
  function p0() {
    if (Ra === null) throw Error(s(459));
    var l = Ra;
    return Ra = null, l;
  }
  function E0(l) {
    if (l === fe || l === wu) throw Error(s(483));
  }
  var se = null, Ke = 0;
  function Wu(l) {
    var t = Ke;
    return Ke += 1, se === null && (se = []), z0(se, l, t);
  }
  function Je(l, t) {
    t = t.props.ref, l.ref = t !== void 0 ? t : null;
  }
  function $u(l, t) {
    throw t.$$typeof === ul ? Error(s(525)) : (l = Object.prototype.toString.call(t), Error(s(31, l === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : l)));
  }
  function T0(l) {
    function t(h, v) {
      if (l) {
        var y = h.deletions;
        y === null ? (h.deletions = [v], h.flags |= 16) : y.push(v);
      }
    }
    function a(h, v) {
      if (!l) return null;
      for (; v !== null; ) t(h, v), v = v.sibling;
      return null;
    }
    function e(h) {
      for (var v = /* @__PURE__ */ new Map(); h !== null; ) h.key !== null ? v.set(h.key, h) : v.set(h.index, h), h = h.sibling;
      return v;
    }
    function u(h, v) {
      return h = Bt(h, v), h.index = 0, h.sibling = null, h;
    }
    function n(h, v, y) {
      return h.index = y, l ? (y = h.alternate, y !== null ? (y = y.index, y < v ? (h.flags |= 67108866, v) : y) : (h.flags |= 67108866, v)) : (h.flags |= 1048576, v);
    }
    function i(h) {
      return l && h.alternate === null && (h.flags |= 67108866), h;
    }
    function c(h, v, y, T) {
      return v === null || v.tag !== 6 ? (v = zi(y, h.mode, T), v.return = h, v) : (v = u(v, y), v.return = h, v);
    }
    function d(h, v, y, T) {
      var J = y.type;
      return J === Tl ? E(h, v, y.props.children, T, y.key) : v !== null && (v.elementType === J || typeof J == "object" && J !== null && J.$$typeof === Hl && xa(J) === v.type) ? (v = u(v, y.props), Je(v, y), v.return = h, v) : (v = Zu(y.type, y.key, y.props, null, h.mode, T), Je(v, y), v.return = h, v);
    }
    function g(h, v, y, T) {
      return v === null || v.tag !== 4 || v.stateNode.containerInfo !== y.containerInfo || v.stateNode.implementation !== y.implementation ? (v = pi(y, h.mode, T), v.return = h, v) : (v = u(v, y.children || []), v.return = h, v);
    }
    function E(h, v, y, T, J) {
      return v === null || v.tag !== 7 ? (v = Oa(y, h.mode, T, J), v.return = h, v) : (v = u(v, y), v.return = h, v);
    }
    function A(h, v, y) {
      if (typeof v == "string" && v !== "" || typeof v == "number" || typeof v == "bigint") return v = zi("" + v, h.mode, y), v.return = h, v;
      if (typeof v == "object" && v !== null) {
        switch (v.$$typeof) {
          case $:
            return y = Zu(v.type, v.key, v.props, null, h.mode, y), Je(y, v), y.return = h, y;
          case gl:
            return v = pi(v, h.mode, y), v.return = h, v;
          case Hl:
            return v = xa(v), A(h, v, y);
        }
        if (x(v) || Ml(v)) return v = Oa(v, h.mode, y, null), v.return = h, v;
        if (typeof v.then == "function") return A(h, Wu(v), y);
        if (v.$$typeof === bl) return A(h, Ku(h, v), y);
        $u(h, v);
      }
      return null;
    }
    function b(h, v, y, T) {
      var J = v !== null ? v.key : null;
      if (typeof y == "string" && y !== "" || typeof y == "number" || typeof y == "bigint") return J !== null ? null : c(h, v, "" + y, T);
      if (typeof y == "object" && y !== null) {
        switch (y.$$typeof) {
          case $:
            return y.key === J ? d(h, v, y, T) : null;
          case gl:
            return y.key === J ? g(h, v, y, T) : null;
          case Hl:
            return y = xa(y), b(h, v, y, T);
        }
        if (x(y) || Ml(y)) return J !== null ? null : E(h, v, y, T, null);
        if (typeof y.then == "function") return b(h, v, Wu(y), T);
        if (y.$$typeof === bl) return b(h, v, Ku(h, y), T);
        $u(h, y);
      }
      return null;
    }
    function S(h, v, y, T, J) {
      if (typeof T == "string" && T !== "" || typeof T == "number" || typeof T == "bigint") return h = h.get(y) || null, c(v, h, "" + T, J);
      if (typeof T == "object" && T !== null) {
        switch (T.$$typeof) {
          case $:
            return h = h.get(T.key === null ? y : T.key) || null, d(v, h, T, J);
          case gl:
            return h = h.get(T.key === null ? y : T.key) || null, g(v, h, T, J);
          case Hl:
            return T = xa(T), S(h, v, y, T, J);
        }
        if (x(T) || Ml(T)) return h = h.get(y) || null, E(v, h, T, J, null);
        if (typeof T.then == "function") return S(h, v, y, Wu(T), J);
        if (T.$$typeof === bl) return S(h, v, y, Ku(v, T), J);
        $u(v, T);
      }
      return null;
    }
    function q(h, v, y, T) {
      for (var J = null, cl = null, Q = v, W = v = 0, el = null; Q !== null && W < y.length; W++) {
        Q.index > W ? (el = Q, Q = null) : el = Q.sibling;
        var fl = b(h, Q, y[W], T);
        if (fl === null) {
          Q === null && (Q = el);
          break;
        }
        l && Q && fl.alternate === null && t(h, Q), v = n(fl, v, W), cl === null ? J = fl : cl.sibling = fl, cl = fl, Q = el;
      }
      if (W === y.length) return a(h, Q), nl && Yt(h, W), J;
      if (Q === null) {
        for (; W < y.length; W++) Q = A(h, y[W], T), Q !== null && (v = n(Q, v, W), cl === null ? J = Q : cl.sibling = Q, cl = Q);
        return nl && Yt(h, W), J;
      }
      for (Q = e(Q); W < y.length; W++) el = S(Q, h, W, y[W], T), el !== null && (l && el.alternate !== null && Q.delete(el.key === null ? W : el.key), v = n(el, v, W), cl === null ? J = el : cl.sibling = el, cl = el);
      return l && Q.forEach(function(_a) {
        return t(h, _a);
      }), nl && Yt(h, W), J;
    }
    function w(h, v, y, T) {
      if (y == null) throw Error(s(151));
      for (var J = null, cl = null, Q = v, W = v = 0, el = null, fl = y.next(); Q !== null && !fl.done; W++, fl = y.next()) {
        Q.index > W ? (el = Q, Q = null) : el = Q.sibling;
        var _a = b(h, Q, fl.value, T);
        if (_a === null) {
          Q === null && (Q = el);
          break;
        }
        l && Q && _a.alternate === null && t(h, Q), v = n(_a, v, W), cl === null ? J = _a : cl.sibling = _a, cl = _a, Q = el;
      }
      if (fl.done) return a(h, Q), nl && Yt(h, W), J;
      if (Q === null) {
        for (; !fl.done; W++, fl = y.next()) fl = A(h, fl.value, T), fl !== null && (v = n(fl, v, W), cl === null ? J = fl : cl.sibling = fl, cl = fl);
        return nl && Yt(h, W), J;
      }
      for (Q = e(Q); !fl.done; W++, fl = y.next()) fl = S(Q, h, W, fl.value, T), fl !== null && (l && fl.alternate !== null && Q.delete(fl.key === null ? W : fl.key), v = n(fl, v, W), cl === null ? J = fl : cl.sibling = fl, cl = fl);
      return l && Q.forEach(function(Ho) {
        return t(h, Ho);
      }), nl && Yt(h, W), J;
    }
    function hl(h, v, y, T) {
      if (typeof y == "object" && y !== null && y.type === Tl && y.key === null && (y = y.props.children), typeof y == "object" && y !== null) {
        switch (y.$$typeof) {
          case $:
            l: {
              for (var J = y.key; v !== null; ) {
                if (v.key === J) {
                  if (J = y.type, J === Tl) {
                    if (v.tag === 7) {
                      a(h, v.sibling), T = u(v, y.props.children), T.return = h, h = T;
                      break l;
                    }
                  } else if (v.elementType === J || typeof J == "object" && J !== null && J.$$typeof === Hl && xa(J) === v.type) {
                    a(h, v.sibling), T = u(v, y.props), Je(T, y), T.return = h, h = T;
                    break l;
                  }
                  a(h, v);
                  break;
                } else t(h, v);
                v = v.sibling;
              }
              y.type === Tl ? (T = Oa(y.props.children, h.mode, T, y.key), T.return = h, h = T) : (T = Zu(y.type, y.key, y.props, null, h.mode, T), Je(T, y), T.return = h, h = T);
            }
            return i(h);
          case gl:
            l: {
              for (J = y.key; v !== null; ) {
                if (v.key === J) if (v.tag === 4 && v.stateNode.containerInfo === y.containerInfo && v.stateNode.implementation === y.implementation) {
                  a(h, v.sibling), T = u(v, y.children || []), T.return = h, h = T;
                  break l;
                } else {
                  a(h, v);
                  break;
                }
                else t(h, v);
                v = v.sibling;
              }
              T = pi(y, h.mode, T), T.return = h, h = T;
            }
            return i(h);
          case Hl:
            return y = xa(y), hl(h, v, y, T);
        }
        if (x(y)) return q(h, v, y, T);
        if (Ml(y)) {
          if (J = Ml(y), typeof J != "function") throw Error(s(150));
          return y = J.call(y), w(h, v, y, T);
        }
        if (typeof y.then == "function") return hl(h, v, Wu(y), T);
        if (y.$$typeof === bl) return hl(h, v, Ku(h, y), T);
        $u(h, y);
      }
      return typeof y == "string" && y !== "" || typeof y == "number" || typeof y == "bigint" ? (y = "" + y, v !== null && v.tag === 6 ? (a(h, v.sibling), T = u(v, y), T.return = h, h = T) : (a(h, v), T = zi(y, h.mode, T), T.return = h, h = T), i(h)) : a(h, v);
    }
    return function(h, v, y, T) {
      try {
        Ke = 0;
        var J = hl(h, v, y, T);
        return se = null, J;
      } catch (Q) {
        if (Q === fe || Q === wu) throw Q;
        var cl = st(29, Q, null, h.mode);
        return cl.lanes = T, cl.return = h, cl;
      }
    };
  }
  var Ca = T0(!0), M0 = T0(!1), na = !1;
  function Ri(l) {
    l.updateQueue = {
      baseState: l.memoizedState,
      firstBaseUpdate: null,
      lastBaseUpdate: null,
      shared: {
        pending: null,
        lanes: 0,
        hiddenCallbacks: null
      },
      callbacks: null
    };
  }
  function Ci(l, t) {
    l = l.updateQueue, t.updateQueue === l && (t.updateQueue = {
      baseState: l.baseState,
      firstBaseUpdate: l.firstBaseUpdate,
      lastBaseUpdate: l.lastBaseUpdate,
      shared: l.shared,
      callbacks: null
    });
  }
  function Ba(l) {
    return {
      lane: l,
      tag: 0,
      payload: null,
      callback: null,
      next: null
    };
  }
  function Ya(l, t, a) {
    var e = l.updateQueue;
    if (e === null) return null;
    if (e = e.shared, (sl & 2) !== 0) {
      var u = e.pending;
      return u === null ? t.next = t : (t.next = u.next, u.next = t), e.pending = t, t = Qu(l), f0(l, null, a), t;
    }
    return Xu(l, e, t, a), Qu(l);
  }
  function we(l, t, a) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (a & 4194048) !== 0)) {
      var e = t.lanes;
      e &= l.pendingLanes, a |= e, t.lanes = a, hf(l, a);
    }
  }
  function Bi(l, t) {
    var a = l.updateQueue, e = l.alternate;
    if (e !== null && (e = e.updateQueue, a === e)) {
      var u = null, n = null;
      if (a = a.firstBaseUpdate, a !== null) {
        do {
          var i = {
            lane: a.lane,
            tag: a.tag,
            payload: a.payload,
            callback: null,
            next: null
          };
          n === null ? u = n = i : n = n.next = i, a = a.next;
        } while (a !== null);
        n === null ? u = n = t : n = n.next = t;
      } else u = n = t;
      a = {
        baseState: e.baseState,
        firstBaseUpdate: u,
        lastBaseUpdate: n,
        shared: e.shared,
        callbacks: e.callbacks
      }, l.updateQueue = a;
      return;
    }
    l = a.lastBaseUpdate, l === null ? a.firstBaseUpdate = t : l.next = t, a.lastBaseUpdate = t;
  }
  var Yi = !1;
  function ke() {
    if (Yi) {
      var l = ce;
      if (l !== null) throw l;
    }
  }
  function We(l, t, a, e) {
    Yi = !1;
    var u = l.updateQueue;
    na = !1;
    var n = u.firstBaseUpdate, i = u.lastBaseUpdate, c = u.shared.pending;
    if (c !== null) {
      u.shared.pending = null;
      var d = c, g = d.next;
      d.next = null, i === null ? n = g : i.next = g, i = d;
      var E = l.alternate;
      E !== null && (E = E.updateQueue, c = E.lastBaseUpdate, c !== i && (c === null ? E.firstBaseUpdate = g : c.next = g, E.lastBaseUpdate = d));
    }
    if (n !== null) {
      var A = u.baseState;
      i = 0, E = g = d = null, c = n;
      do {
        var b = c.lane & -536870913, S = b !== c.lane;
        if (S ? (al & b) === b : (e & b) === b) {
          b !== 0 && b === ie && (Yi = !0), E !== null && (E = E.next = {
            lane: 0,
            tag: c.tag,
            payload: c.payload,
            callback: null,
            next: null
          });
          l: {
            var q = l, w = c;
            b = t;
            var hl = a;
            switch (w.tag) {
              case 1:
                if (q = w.payload, typeof q == "function") {
                  A = q.call(hl, A, b);
                  break l;
                }
                A = q;
                break l;
              case 3:
                q.flags = q.flags & -65537 | 128;
              case 0:
                if (q = w.payload, b = typeof q == "function" ? q.call(hl, A, b) : q, b == null) break l;
                A = C({}, A, b);
                break l;
              case 2:
                na = !0;
            }
          }
          b = c.callback, b !== null && (l.flags |= 64, S && (l.flags |= 8192), S = u.callbacks, S === null ? u.callbacks = [b] : S.push(b));
        } else S = {
          lane: b,
          tag: c.tag,
          payload: c.payload,
          callback: c.callback,
          next: null
        }, E === null ? (g = E = S, d = A) : E = E.next = S, i |= b;
        if (c = c.next, c === null) {
          if (c = u.shared.pending, c === null) break;
          S = c, c = S.next, S.next = null, u.lastBaseUpdate = S, u.shared.pending = null;
        }
      } while (!0);
      E === null && (d = A), u.baseState = d, u.firstBaseUpdate = g, u.lastBaseUpdate = E, n === null && (u.shared.lanes = 0), da |= i, l.lanes = i, l.memoizedState = A;
    }
  }
  function A0(l, t) {
    if (typeof l != "function") throw Error(s(191, l));
    l.call(t);
  }
  function N0(l, t) {
    var a = l.callbacks;
    if (a !== null) for (l.callbacks = null, l = 0; l < a.length; l++) A0(a[l], t);
  }
  var de = r(null), Fu = r(0);
  function O0(l, t) {
    l = kt, Y(Fu, l), Y(de, t), kt = l | t.baseLanes;
  }
  function qi() {
    Y(Fu, kt), Y(de, de.current);
  }
  function Gi() {
    kt = Fu.current, N(de), N(Fu);
  }
  var dt = r(null), zt = null;
  function ia(l) {
    var t = l.alternate;
    Y(Dl, Dl.current & 1), Y(dt, l), zt === null && (t === null || de.current !== null || t.memoizedState !== null) && (zt = l);
  }
  function Xi(l) {
    Y(Dl, Dl.current), Y(dt, l), zt === null && (zt = l);
  }
  function D0(l) {
    l.tag === 22 ? (Y(Dl, Dl.current), Y(dt, l), zt === null && (zt = l)) : ca(l);
  }
  function ca() {
    Y(Dl, Dl.current), Y(dt, dt.current);
  }
  function vt(l) {
    N(dt), zt === l && (zt = null), N(Dl);
  }
  var Dl = r(0);
  function Iu(l) {
    for (var t = l; t !== null; ) {
      if (t.tag === 13) {
        var a = t.memoizedState;
        if (a !== null && (a = a.dehydrated, a === null || Kc(a) || Jc(a))) return t;
      } else if (t.tag === 19 && (t.memoizedProps.revealOrder === "forwards" || t.memoizedProps.revealOrder === "backwards" || t.memoizedProps.revealOrder === "unstable_legacy-backwards" || t.memoizedProps.revealOrder === "together")) {
        if ((t.flags & 128) !== 0) return t;
      } else if (t.child !== null) {
        t.child.return = t, t = t.child;
        continue;
      }
      if (t === l) break;
      for (; t.sibling === null; ) {
        if (t.return === null || t.return === l) return null;
        t = t.return;
      }
      t.sibling.return = t.return, t = t.sibling;
    }
    return null;
  }
  var Xt = 0, k = null, ol = null, Rl = null, Pu = !1, ve = !1, qa = !1, ln = 0, $e = 0, re = null, gr = 0;
  function Al() {
    throw Error(s(321));
  }
  function Qi(l, t) {
    if (t === null) return !1;
    for (var a = 0; a < t.length && a < l.length; a++) if (!ft(l[a], t[a])) return !1;
    return !0;
  }
  function Zi(l, t, a, e, u, n) {
    return Xt = n, k = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, D.H = l === null || l.memoizedState === null ? rs : ec, qa = !1, n = a(e, u), qa = !1, ve && (n = U0(t, a, e, u)), j0(l), n;
  }
  function j0(l) {
    D.H = Pe;
    var t = ol !== null && ol.next !== null;
    if (Xt = 0, Rl = ol = k = null, Pu = !1, $e = 0, re = null, t) throw Error(s(300));
    l === null || Cl || (l = l.dependencies, l !== null && Vu(l) && (Cl = !0));
  }
  function U0(l, t, a, e) {
    k = l;
    var u = 0;
    do {
      if (ve && (re = null), $e = 0, ve = !1, 25 <= u) throw Error(s(301));
      if (u += 1, Rl = ol = null, l.updateQueue != null) {
        var n = l.updateQueue;
        n.lastEffect = null, n.events = null, n.stores = null, n.memoCache != null && (n.memoCache.index = 0);
      }
      D.H = os, n = t(a, e);
    } while (ve);
    return n;
  }
  function br() {
    var l = D.H, t = l.useState()[0];
    return t = typeof t.then == "function" ? Fe(t) : t, l = l.useState()[0], (ol !== null ? ol.memoizedState : null) !== l && (k.flags |= 1024), t;
  }
  function Li() {
    var l = ln !== 0;
    return ln = 0, l;
  }
  function Vi(l, t, a) {
    t.updateQueue = l.updateQueue, t.flags &= -2053, l.lanes &= ~a;
  }
  function Ki(l) {
    if (Pu) {
      for (l = l.memoizedState; l !== null; ) {
        var t = l.queue;
        t !== null && (t.pending = null), l = l.next;
      }
      Pu = !1;
    }
    Xt = 0, Rl = ol = k = null, ve = !1, $e = ln = 0, re = null;
  }
  function $l() {
    var l = {
      memoizedState: null,
      baseState: null,
      baseQueue: null,
      queue: null,
      next: null
    };
    return Rl === null ? k.memoizedState = Rl = l : Rl = Rl.next = l, Rl;
  }
  function jl() {
    if (ol === null) {
      var l = k.alternate;
      l = l !== null ? l.memoizedState : null;
    } else l = ol.next;
    var t = Rl === null ? k.memoizedState : Rl.next;
    if (t !== null) Rl = t, ol = l;
    else {
      if (l === null)
        throw k.alternate === null ? Error(s(467)) : Error(s(310));
      ol = l, l = {
        memoizedState: ol.memoizedState,
        baseState: ol.baseState,
        baseQueue: ol.baseQueue,
        queue: ol.queue,
        next: null
      }, Rl === null ? k.memoizedState = Rl = l : Rl = Rl.next = l;
    }
    return Rl;
  }
  function tn() {
    return {
      lastEffect: null,
      events: null,
      stores: null,
      memoCache: null
    };
  }
  function Fe(l) {
    var t = $e;
    return $e += 1, re === null && (re = []), l = z0(re, l, t), t = k, (Rl === null ? t.memoizedState : Rl.next) === null && (t = t.alternate, D.H = t === null || t.memoizedState === null ? rs : ec), l;
  }
  function an(l) {
    if (l !== null && typeof l == "object") {
      if (typeof l.then == "function") return Fe(l);
      if (l.$$typeof === bl) return Ll(l);
    }
    throw Error(s(438, String(l)));
  }
  function Ji(l) {
    var t = null, a = k.updateQueue;
    if (a !== null && (t = a.memoCache), t == null) {
      var e = k.alternate;
      e !== null && (e = e.updateQueue, e !== null && (e = e.memoCache, e != null && (t = {
        data: e.data.map(function(u) {
          return u.slice();
        }),
        index: 0
      })));
    }
    if (t ??= {
      data: [],
      index: 0
    }, a === null && (a = tn(), k.updateQueue = a), a.memoCache = t, a = t.data[t.index], a === void 0) for (a = t.data[t.index] = Array(l), e = 0; e < l; e++) a[e] = Ht;
    return t.index++, a;
  }
  function Qt(l, t) {
    return typeof t == "function" ? t(l) : t;
  }
  function en(l) {
    return wi(jl(), ol, l);
  }
  function wi(l, t, a) {
    var e = l.queue;
    if (e === null) throw Error(s(311));
    e.lastRenderedReducer = a;
    var u = l.baseQueue, n = e.pending;
    if (n !== null) {
      if (u !== null) {
        var i = u.next;
        u.next = n.next, n.next = i;
      }
      t.baseQueue = u = n, e.pending = null;
    }
    if (n = l.baseState, u === null) l.memoizedState = n;
    else {
      t = u.next;
      var c = i = null, d = null, g = t, E = !1;
      do {
        var A = g.lane & -536870913;
        if (A !== g.lane ? (al & A) === A : (Xt & A) === A) {
          var b = g.revertLane;
          if (b === 0) d !== null && (d = d.next = {
            lane: 0,
            revertLane: 0,
            gesture: null,
            action: g.action,
            hasEagerState: g.hasEagerState,
            eagerState: g.eagerState,
            next: null
          }), A === ie && (E = !0);
          else if ((Xt & b) === b) {
            g = g.next, b === ie && (E = !0);
            continue;
          } else A = {
            lane: 0,
            revertLane: g.revertLane,
            gesture: null,
            action: g.action,
            hasEagerState: g.hasEagerState,
            eagerState: g.eagerState,
            next: null
          }, d === null ? (c = d = A, i = n) : d = d.next = A, k.lanes |= b, da |= b;
          A = g.action, qa && a(n, A), n = g.hasEagerState ? g.eagerState : a(n, A);
        } else b = {
          lane: A,
          revertLane: g.revertLane,
          gesture: g.gesture,
          action: g.action,
          hasEagerState: g.hasEagerState,
          eagerState: g.eagerState,
          next: null
        }, d === null ? (c = d = b, i = n) : d = d.next = b, k.lanes |= A, da |= A;
        g = g.next;
      } while (g !== null && g !== t);
      if (d === null ? i = n : d.next = c, !ft(n, l.memoizedState) && (Cl = !0, E && (a = ce, a !== null))) throw a;
      l.memoizedState = n, l.baseState = i, l.baseQueue = d, e.lastRenderedState = n;
    }
    return u === null && (e.lanes = 0), [l.memoizedState, e.dispatch];
  }
  function ki(l) {
    var t = jl(), a = t.queue;
    if (a === null) throw Error(s(311));
    a.lastRenderedReducer = l;
    var e = a.dispatch, u = a.pending, n = t.memoizedState;
    if (u !== null) {
      a.pending = null;
      var i = u = u.next;
      do
        n = l(n, i.action), i = i.next;
      while (i !== u);
      ft(n, t.memoizedState) || (Cl = !0), t.memoizedState = n, t.baseQueue === null && (t.baseState = n), a.lastRenderedState = n;
    }
    return [n, e];
  }
  function H0(l, t, a) {
    var e = k, u = jl(), n = nl;
    if (n) {
      if (a === void 0) throw Error(s(407));
      a = a();
    } else a = t();
    var i = !ft((ol || u).memoizedState, a);
    if (i && (u.memoizedState = a, Cl = !0), u = u.queue, Fi(C0.bind(null, e, u, l), [l]), u.getSnapshot !== t || i || Rl !== null && Rl.memoizedState.tag & 1) {
      if (e.flags |= 2048, oe(9, { destroy: void 0 }, R0.bind(null, e, u, a, t), null), yl === null) throw Error(s(349));
      n || (Xt & 127) !== 0 || x0(e, t, a);
    }
    return a;
  }
  function x0(l, t, a) {
    l.flags |= 16384, l = {
      getSnapshot: t,
      value: a
    }, t = k.updateQueue, t === null ? (t = tn(), k.updateQueue = t, t.stores = [l]) : (a = t.stores, a === null ? t.stores = [l] : a.push(l));
  }
  function R0(l, t, a, e) {
    t.value = a, t.getSnapshot = e, B0(t) && Y0(l);
  }
  function C0(l, t, a) {
    return a(function() {
      B0(t) && Y0(l);
    });
  }
  function B0(l) {
    var t = l.getSnapshot;
    l = l.value;
    try {
      var a = t();
      return !ft(l, a);
    } catch {
      return !0;
    }
  }
  function Y0(l) {
    var t = Na(l, 2);
    t !== null && et(t, l, 2);
  }
  function Wi(l) {
    var t = $l();
    if (typeof l == "function") {
      var a = l;
      if (l = a(), qa) {
        It(!0);
        try {
          a();
        } finally {
          It(!1);
        }
      }
    }
    return t.memoizedState = t.baseState = l, t.queue = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: Qt,
      lastRenderedState: l
    }, t;
  }
  function q0(l, t, a, e) {
    return l.baseState = a, wi(l, ol, typeof e == "function" ? e : Qt);
  }
  function Sr(l, t, a, e, u) {
    if (cn(l)) throw Error(s(485));
    if (l = t.action, l !== null) {
      var n = {
        payload: u,
        action: l,
        next: null,
        isTransition: !0,
        status: "pending",
        value: null,
        reason: null,
        listeners: [],
        then: function(i) {
          n.listeners.push(i);
        }
      };
      D.T !== null ? a(!0) : n.isTransition = !1, e(n), a = t.pending, a === null ? (n.next = t.pending = n, G0(t, n)) : (n.next = a.next, t.pending = a.next = n);
    }
  }
  function G0(l, t) {
    var a = t.action, e = t.payload, u = l.state;
    if (t.isTransition) {
      var n = D.T, i = {};
      D.T = i;
      try {
        var c = a(u, e), d = D.S;
        d !== null && d(i, c), X0(l, t, c);
      } catch (g) {
        $i(l, t, g);
      } finally {
        n !== null && i.types !== null && (n.types = i.types), D.T = n;
      }
    } else try {
      n = a(u, e), X0(l, t, n);
    } catch (g) {
      $i(l, t, g);
    }
  }
  function X0(l, t, a) {
    a !== null && typeof a == "object" && typeof a.then == "function" ? a.then(function(e) {
      Q0(l, t, e);
    }, function(e) {
      return $i(l, t, e);
    }) : Q0(l, t, a);
  }
  function Q0(l, t, a) {
    t.status = "fulfilled", t.value = a, Z0(t), l.state = a, t = l.pending, t !== null && (a = t.next, a === t ? l.pending = null : (a = a.next, t.next = a, G0(l, a)));
  }
  function $i(l, t, a) {
    var e = l.pending;
    if (l.pending = null, e !== null) {
      e = e.next;
      do
        t.status = "rejected", t.reason = a, Z0(t), t = t.next;
      while (t !== e);
    }
    l.action = null;
  }
  function Z0(l) {
    l = l.listeners;
    for (var t = 0; t < l.length; t++) (0, l[t])();
  }
  function L0(l, t) {
    return t;
  }
  function V0(l, t) {
    if (nl) {
      var a = yl.formState;
      if (a !== null) {
        l: {
          var e = k;
          if (nl) {
            if (_l) {
              t: {
                for (var u = _l, n = _t; u.nodeType !== 8; ) {
                  if (!n) {
                    u = null;
                    break t;
                  }
                  if (u = Et(u.nextSibling), u === null) {
                    u = null;
                    break t;
                  }
                }
                n = u.data, u = n === "F!" || n === "F" ? u : null;
              }
              if (u) {
                _l = Et(u.nextSibling), e = u.data === "F!";
                break l;
              }
            }
            ea(e);
          }
          e = !1;
        }
        e && (t = a[0]);
      }
    }
    return a = $l(), a.memoizedState = a.baseState = t, e = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: L0,
      lastRenderedState: t
    }, a.queue = e, a = ss.bind(null, k, e), e.dispatch = a, e = Wi(!1), n = ac.bind(null, k, !1, e.queue), e = $l(), u = {
      state: t,
      dispatch: null,
      action: l,
      pending: null
    }, e.queue = u, a = Sr.bind(null, k, u, n, a), u.dispatch = a, e.memoizedState = l, [
      t,
      a,
      !1
    ];
  }
  function K0(l) {
    return J0(jl(), ol, l);
  }
  function J0(l, t, a) {
    if (t = wi(l, t, L0)[0], l = en(Qt)[0], typeof t == "object" && t !== null && typeof t.then == "function") try {
      var e = Fe(t);
    } catch (i) {
      throw i === fe ? wu : i;
    }
    else e = t;
    t = jl();
    var u = t.queue, n = u.dispatch;
    return a !== t.memoizedState && (k.flags |= 2048, oe(9, { destroy: void 0 }, _r.bind(null, u, a), null)), [
      e,
      n,
      l
    ];
  }
  function _r(l, t) {
    l.action = t;
  }
  function w0(l) {
    var t = jl(), a = ol;
    if (a !== null) return J0(t, a, l);
    jl(), t = t.memoizedState, a = jl();
    var e = a.queue.dispatch;
    return a.memoizedState = l, [
      t,
      e,
      !1
    ];
  }
  function oe(l, t, a, e) {
    return l = {
      tag: l,
      create: a,
      deps: e,
      inst: t,
      next: null
    }, t = k.updateQueue, t === null && (t = tn(), k.updateQueue = t), a = t.lastEffect, a === null ? t.lastEffect = l.next = l : (e = a.next, a.next = l, l.next = e, t.lastEffect = l), l;
  }
  function k0() {
    return jl().memoizedState;
  }
  function un(l, t, a, e) {
    var u = $l();
    k.flags |= l, u.memoizedState = oe(1 | t, { destroy: void 0 }, a, e === void 0 ? null : e);
  }
  function nn(l, t, a, e) {
    var u = jl();
    e = e === void 0 ? null : e;
    var n = u.memoizedState.inst;
    ol !== null && e !== null && Qi(e, ol.memoizedState.deps) ? u.memoizedState = oe(t, n, a, e) : (k.flags |= l, u.memoizedState = oe(1 | t, n, a, e));
  }
  function W0(l, t) {
    un(8390656, 8, l, t);
  }
  function Fi(l, t) {
    nn(2048, 8, l, t);
  }
  function zr(l) {
    k.flags |= 4;
    var t = k.updateQueue;
    if (t === null) t = tn(), k.updateQueue = t, t.events = [l];
    else {
      var a = t.events;
      a === null ? t.events = [l] : a.push(l);
    }
  }
  function $0(l) {
    var t = jl().memoizedState;
    return zr({
      ref: t,
      nextImpl: l
    }), function() {
      if ((sl & 2) !== 0) throw Error(s(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function F0(l, t) {
    return nn(4, 2, l, t);
  }
  function I0(l, t) {
    return nn(4, 4, l, t);
  }
  function P0(l, t) {
    if (typeof t == "function") {
      l = l();
      var a = t(l);
      return function() {
        typeof a == "function" ? a() : t(null);
      };
    }
    if (t != null) return l = l(), t.current = l, function() {
      t.current = null;
    };
  }
  function ls(l, t, a) {
    a = a != null ? a.concat([l]) : null, nn(4, 4, P0.bind(null, t, l), a);
  }
  function Ii() {
  }
  function ts(l, t) {
    var a = jl();
    t = t === void 0 ? null : t;
    var e = a.memoizedState;
    return t !== null && Qi(t, e[1]) ? e[0] : (a.memoizedState = [l, t], l);
  }
  function as(l, t) {
    var a = jl();
    t = t === void 0 ? null : t;
    var e = a.memoizedState;
    if (t !== null && Qi(t, e[1])) return e[0];
    if (e = l(), qa) {
      It(!0);
      try {
        l();
      } finally {
        It(!1);
      }
    }
    return a.memoizedState = [e, t], e;
  }
  function Pi(l, t, a) {
    return a === void 0 || (Xt & 1073741824) !== 0 && (al & 261930) === 0 ? l.memoizedState = t : (l.memoizedState = a, l = ld(), k.lanes |= l, da |= l, a);
  }
  function es(l, t, a, e) {
    return ft(a, t) ? a : de.current !== null ? (l = Pi(l, a, e), ft(l, t) || (Cl = !0), l) : (Xt & 42) === 0 || (Xt & 1073741824) !== 0 && (al & 261930) === 0 ? (Cl = !0, l.memoizedState = a) : (l = ld(), k.lanes |= l, da |= l, t);
  }
  function us(l, t, a, e, u) {
    var n = B.p;
    B.p = n !== 0 && 8 > n ? n : 8;
    var i = D.T, c = {};
    D.T = c, ac(l, !1, t, a);
    try {
      var d = u(), g = D.S;
      g !== null && g(c, d), d !== null && typeof d == "object" && typeof d.then == "function" ? Ie(l, t, yr(d, e), pt(l)) : Ie(l, t, e, pt(l));
    } catch (E) {
      Ie(l, t, {
        then: function() {
        },
        status: "rejected",
        reason: E
      }, pt());
    } finally {
      B.p = n, i !== null && c.types !== null && (i.types = c.types), D.T = i;
    }
  }
  function pr() {
  }
  function lc(l, t, a, e) {
    if (l.tag !== 5) throw Error(s(476));
    var u = ns(l).queue;
    us(l, u, t, il, a === null ? pr : function() {
      return is(l), a(e);
    });
  }
  function ns(l) {
    var t = l.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: il,
      baseState: il,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Qt,
        lastRenderedState: il
      },
      next: null
    };
    var a = {};
    return t.next = {
      memoizedState: a,
      baseState: a,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Qt,
        lastRenderedState: a
      },
      next: null
    }, l.memoizedState = t, l = l.alternate, l !== null && (l.memoizedState = t), t;
  }
  function is(l) {
    var t = ns(l);
    t.next === null && (t = l.alternate.memoizedState), Ie(l, t.next.queue, {}, pt());
  }
  function tc() {
    return Ll(hu);
  }
  function cs() {
    return jl().memoizedState;
  }
  function fs() {
    return jl().memoizedState;
  }
  function Er(l) {
    for (var t = l.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var a = pt();
          l = Ba(a);
          var e = Ya(t, l, a);
          e !== null && (et(e, t, a), we(e, t, a)), t = { cache: ji() }, l.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function Tr(l, t, a) {
    var e = pt();
    a = {
      lane: e,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, cn(l) ? ds(t, a) : (a = Si(l, t, a, e), a !== null && (et(a, l, e), vs(a, t, e)));
  }
  function ss(l, t, a) {
    Ie(l, t, a, pt());
  }
  function Ie(l, t, a, e) {
    var u = {
      lane: e,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    };
    if (cn(l)) ds(t, u);
    else {
      var n = l.alternate;
      if (l.lanes === 0 && (n === null || n.lanes === 0) && (n = t.lastRenderedReducer, n !== null)) try {
        var i = t.lastRenderedState, c = n(i, a);
        if (u.hasEagerState = !0, u.eagerState = c, ft(c, i)) return Xu(l, t, u, 0), yl === null && Gu(), !1;
      } catch {
      }
      if (a = Si(l, t, u, e), a !== null) return et(a, l, e), vs(a, t, e), !0;
    }
    return !1;
  }
  function ac(l, t, a, e) {
    if (e = {
      lane: 2,
      revertLane: Rc(),
      gesture: null,
      action: e,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, cn(l)) {
      if (t) throw Error(s(479));
    } else t = Si(l, a, e, 2), t !== null && et(t, l, 2);
  }
  function cn(l) {
    var t = l.alternate;
    return l === k || t !== null && t === k;
  }
  function ds(l, t) {
    ve = Pu = !0;
    var a = l.pending;
    a === null ? t.next = t : (t.next = a.next, a.next = t), l.pending = t;
  }
  function vs(l, t, a) {
    if ((a & 4194048) !== 0) {
      var e = t.lanes;
      e &= l.pendingLanes, a |= e, t.lanes = a, hf(l, a);
    }
  }
  var Pe = {
    readContext: Ll,
    use: an,
    useCallback: Al,
    useContext: Al,
    useEffect: Al,
    useImperativeHandle: Al,
    useLayoutEffect: Al,
    useInsertionEffect: Al,
    useMemo: Al,
    useReducer: Al,
    useRef: Al,
    useState: Al,
    useDebugValue: Al,
    useDeferredValue: Al,
    useTransition: Al,
    useSyncExternalStore: Al,
    useId: Al,
    useHostTransitionStatus: Al,
    useFormState: Al,
    useActionState: Al,
    useOptimistic: Al,
    useMemoCache: Al,
    useCacheRefresh: Al
  };
  Pe.useEffectEvent = Al;
  var rs = {
    readContext: Ll,
    use: an,
    useCallback: function(l, t) {
      return $l().memoizedState = [l, t === void 0 ? null : t], l;
    },
    useContext: Ll,
    useEffect: W0,
    useImperativeHandle: function(l, t, a) {
      a = a != null ? a.concat([l]) : null, un(4194308, 4, P0.bind(null, t, l), a);
    },
    useLayoutEffect: function(l, t) {
      return un(4194308, 4, l, t);
    },
    useInsertionEffect: function(l, t) {
      un(4, 2, l, t);
    },
    useMemo: function(l, t) {
      var a = $l();
      t = t === void 0 ? null : t;
      var e = l();
      if (qa) {
        It(!0);
        try {
          l();
        } finally {
          It(!1);
        }
      }
      return a.memoizedState = [e, t], e;
    },
    useReducer: function(l, t, a) {
      var e = $l();
      if (a !== void 0) {
        var u = a(t);
        if (qa) {
          It(!0);
          try {
            a(t);
          } finally {
            It(!1);
          }
        }
      } else u = t;
      return e.memoizedState = e.baseState = u, l = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: l,
        lastRenderedState: u
      }, e.queue = l, l = l.dispatch = Tr.bind(null, k, l), [e.memoizedState, l];
    },
    useRef: function(l) {
      var t = $l();
      return l = { current: l }, t.memoizedState = l;
    },
    useState: function(l) {
      l = Wi(l);
      var t = l.queue, a = ss.bind(null, k, t);
      return t.dispatch = a, [l.memoizedState, a];
    },
    useDebugValue: Ii,
    useDeferredValue: function(l, t) {
      return Pi($l(), l, t);
    },
    useTransition: function() {
      var l = Wi(!1);
      return l = us.bind(null, k, l.queue, !0, !1), $l().memoizedState = l, [!1, l];
    },
    useSyncExternalStore: function(l, t, a) {
      var e = k, u = $l();
      if (nl) {
        if (a === void 0) throw Error(s(407));
        a = a();
      } else {
        if (a = t(), yl === null) throw Error(s(349));
        (al & 127) !== 0 || x0(e, t, a);
      }
      u.memoizedState = a;
      var n = {
        value: a,
        getSnapshot: t
      };
      return u.queue = n, W0(C0.bind(null, e, n, l), [l]), e.flags |= 2048, oe(9, { destroy: void 0 }, R0.bind(null, e, n, a, t), null), a;
    },
    useId: function() {
      var l = $l(), t = yl.identifierPrefix;
      if (nl) {
        var a = Dt, e = Ot;
        a = (e & ~(1 << 32 - ct(e) - 1)).toString(32) + a, t = "_" + t + "R_" + a, a = ln++, 0 < a && (t += "H" + a.toString(32)), t += "_";
      } else a = gr++, t = "_" + t + "r_" + a.toString(32) + "_";
      return l.memoizedState = t;
    },
    useHostTransitionStatus: tc,
    useFormState: V0,
    useActionState: V0,
    useOptimistic: function(l) {
      var t = $l();
      t.memoizedState = t.baseState = l;
      var a = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: null,
        lastRenderedState: null
      };
      return t.queue = a, t = ac.bind(null, k, !0, a), a.dispatch = t, [l, t];
    },
    useMemoCache: Ji,
    useCacheRefresh: function() {
      return $l().memoizedState = Er.bind(null, k);
    },
    useEffectEvent: function(l) {
      var t = $l(), a = { impl: l };
      return t.memoizedState = a, function() {
        if ((sl & 2) !== 0) throw Error(s(440));
        return a.impl.apply(void 0, arguments);
      };
    }
  }, ec = {
    readContext: Ll,
    use: an,
    useCallback: ts,
    useContext: Ll,
    useEffect: Fi,
    useImperativeHandle: ls,
    useInsertionEffect: F0,
    useLayoutEffect: I0,
    useMemo: as,
    useReducer: en,
    useRef: k0,
    useState: function() {
      return en(Qt);
    },
    useDebugValue: Ii,
    useDeferredValue: function(l, t) {
      return es(jl(), ol.memoizedState, l, t);
    },
    useTransition: function() {
      var l = en(Qt)[0], t = jl().memoizedState;
      return [typeof l == "boolean" ? l : Fe(l), t];
    },
    useSyncExternalStore: H0,
    useId: cs,
    useHostTransitionStatus: tc,
    useFormState: K0,
    useActionState: K0,
    useOptimistic: function(l, t) {
      return q0(jl(), ol, l, t);
    },
    useMemoCache: Ji,
    useCacheRefresh: fs
  };
  ec.useEffectEvent = $0;
  var os = {
    readContext: Ll,
    use: an,
    useCallback: ts,
    useContext: Ll,
    useEffect: Fi,
    useImperativeHandle: ls,
    useInsertionEffect: F0,
    useLayoutEffect: I0,
    useMemo: as,
    useReducer: ki,
    useRef: k0,
    useState: function() {
      return ki(Qt);
    },
    useDebugValue: Ii,
    useDeferredValue: function(l, t) {
      var a = jl();
      return ol === null ? Pi(a, l, t) : es(a, ol.memoizedState, l, t);
    },
    useTransition: function() {
      var l = ki(Qt)[0], t = jl().memoizedState;
      return [typeof l == "boolean" ? l : Fe(l), t];
    },
    useSyncExternalStore: H0,
    useId: cs,
    useHostTransitionStatus: tc,
    useFormState: w0,
    useActionState: w0,
    useOptimistic: function(l, t) {
      var a = jl();
      return ol !== null ? q0(a, ol, l, t) : (a.baseState = l, [l, a.queue.dispatch]);
    },
    useMemoCache: Ji,
    useCacheRefresh: fs
  };
  os.useEffectEvent = $0;
  function uc(l, t, a, e) {
    t = l.memoizedState, a = a(e, t), a = a == null ? t : C({}, t, a), l.memoizedState = a, l.lanes === 0 && (l.updateQueue.baseState = a);
  }
  var nc = {
    enqueueSetState: function(l, t, a) {
      l = l._reactInternals;
      var e = pt(), u = Ba(e);
      u.payload = t, a != null && (u.callback = a), t = Ya(l, u, e), t !== null && (et(t, l, e), we(t, l, e));
    },
    enqueueReplaceState: function(l, t, a) {
      l = l._reactInternals;
      var e = pt(), u = Ba(e);
      u.tag = 1, u.payload = t, a != null && (u.callback = a), t = Ya(l, u, e), t !== null && (et(t, l, e), we(t, l, e));
    },
    enqueueForceUpdate: function(l, t) {
      l = l._reactInternals;
      var a = pt(), e = Ba(a);
      e.tag = 2, t != null && (e.callback = t), t = Ya(l, e, a), t !== null && (et(t, l, a), we(t, l, a));
    }
  };
  function ms(l, t, a, e, u, n, i) {
    return l = l.stateNode, typeof l.shouldComponentUpdate == "function" ? l.shouldComponentUpdate(e, n, i) : t.prototype && t.prototype.isPureReactComponent ? !Ge(a, e) || !Ge(u, n) : !0;
  }
  function hs(l, t, a, e) {
    l = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(a, e), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(a, e), t.state !== l && nc.enqueueReplaceState(t, t.state, null);
  }
  function Ga(l, t) {
    var a = t;
    if ("ref" in t) {
      a = {};
      for (var e in t) e !== "ref" && (a[e] = t[e]);
    }
    if (l = l.defaultProps) {
      a === t && (a = C({}, a));
      for (var u in l) a[u] === void 0 && (a[u] = l[u]);
    }
    return a;
  }
  function Mr(l) {
    qu(l);
  }
  function Ar(l) {
    console.error(l);
  }
  function Nr(l) {
    qu(l);
  }
  function fn(l, t) {
    try {
      var a = l.onUncaughtError;
      a(t.value, { componentStack: t.stack });
    } catch (e) {
      setTimeout(function() {
        throw e;
      });
    }
  }
  function ys(l, t, a) {
    try {
      var e = l.onCaughtError;
      e(a.value, {
        componentStack: a.stack,
        errorBoundary: t.tag === 1 ? t.stateNode : null
      });
    } catch (u) {
      setTimeout(function() {
        throw u;
      });
    }
  }
  function ic(l, t, a) {
    return a = Ba(a), a.tag = 3, a.payload = { element: null }, a.callback = function() {
      fn(l, t);
    }, a;
  }
  function gs(l) {
    return l = Ba(l), l.tag = 3, l;
  }
  function bs(l, t, a, e) {
    var u = a.type.getDerivedStateFromError;
    if (typeof u == "function") {
      var n = e.value;
      l.payload = function() {
        return u(n);
      }, l.callback = function() {
        ys(t, a, e);
      };
    }
    var i = a.stateNode;
    i !== null && typeof i.componentDidCatch == "function" && (l.callback = function() {
      ys(t, a, e), typeof u != "function" && (va === null ? va = /* @__PURE__ */ new Set([this]) : va.add(this));
      var c = e.stack;
      this.componentDidCatch(e.value, { componentStack: c !== null ? c : "" });
    });
  }
  function Or(l, t, a, e, u) {
    if (a.flags |= 32768, e !== null && typeof e == "object" && typeof e.then == "function") {
      if (t = a.alternate, t !== null && ne(t, a, u, !0), a = dt.current, a !== null) {
        switch (a.tag) {
          case 31:
          case 13:
            return zt === null ? _n() : a.alternate === null && Nl === 0 && (Nl = 3), a.flags &= -257, a.flags |= 65536, a.lanes = u, e === ku ? a.flags |= 16384 : (t = a.updateQueue, t === null ? a.updateQueue = /* @__PURE__ */ new Set([e]) : t.add(e), Uc(l, e, u)), !1;
          case 22:
            return a.flags |= 65536, e === ku ? a.flags |= 16384 : (t = a.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([e])
            }, a.updateQueue = t) : (a = t.retryQueue, a === null ? t.retryQueue = /* @__PURE__ */ new Set([e]) : a.add(e)), Uc(l, e, u)), !1;
        }
        throw Error(s(435, a.tag));
      }
      return Uc(l, e, u), _n(), !1;
    }
    if (nl) return t = dt.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = u, e !== Mi && (l = Error(s(422), { cause: e }), Ze(gt(l, a)))) : (e !== Mi && (t = Error(s(423), { cause: e }), Ze(gt(t, a))), l = l.current.alternate, l.flags |= 65536, u &= -u, l.lanes |= u, e = gt(e, a), u = ic(l.stateNode, e, u), Bi(l, u), Nl !== 4 && (Nl = 2)), !1;
    var n = Error(s(520), { cause: e });
    if (n = gt(n, a), cu === null ? cu = [n] : cu.push(n), Nl !== 4 && (Nl = 2), t === null) return !0;
    e = gt(e, a), a = t;
    do {
      switch (a.tag) {
        case 3:
          return a.flags |= 65536, l = u & -u, a.lanes |= l, l = ic(a.stateNode, e, l), Bi(a, l), !1;
        case 1:
          if (t = a.type, n = a.stateNode, (a.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || n !== null && typeof n.componentDidCatch == "function" && (va === null || !va.has(n)))) return a.flags |= 65536, u &= -u, a.lanes |= u, u = gs(u), bs(u, l, a, e), Bi(a, u), !1;
      }
      a = a.return;
    } while (a !== null);
    return !1;
  }
  var cc = Error(s(461)), Cl = !1;
  function Vl(l, t, a, e) {
    t.child = l === null ? M0(t, null, a, e) : Ca(t, l.child, a, e);
  }
  function Ss(l, t, a, e, u) {
    a = a.render;
    var n = t.ref;
    if ("ref" in e) {
      var i = {};
      for (var c in e) c !== "ref" && (i[c] = e[c]);
    } else i = e;
    return Ua(t), e = Zi(l, t, a, i, n, u), c = Li(), l !== null && !Cl ? (Vi(l, t, u), Zt(l, t, u)) : (nl && c && Ei(t), t.flags |= 1, Vl(l, t, e, u), t.child);
  }
  function _s(l, t, a, e, u) {
    if (l === null) {
      var n = a.type;
      return typeof n == "function" && !_i(n) && n.defaultProps === void 0 && a.compare === null ? (t.tag = 15, t.type = n, zs(l, t, n, e, u)) : (l = Zu(a.type, null, e, t, t.mode, u), l.ref = t.ref, l.return = t, t.child = l);
    }
    if (n = l.child, !hc(l, u)) {
      var i = n.memoizedProps;
      if (a = a.compare, a = a !== null ? a : Ge, a(i, e) && l.ref === t.ref) return Zt(l, t, u);
    }
    return t.flags |= 1, l = Bt(n, e), l.ref = t.ref, l.return = t, t.child = l;
  }
  function zs(l, t, a, e, u) {
    if (l !== null) {
      var n = l.memoizedProps;
      if (Ge(n, e) && l.ref === t.ref) if (Cl = !1, t.pendingProps = e = n, hc(l, u)) (l.flags & 131072) !== 0 && (Cl = !0);
      else return t.lanes = l.lanes, Zt(l, t, u);
    }
    return fc(l, t, a, e, u);
  }
  function ps(l, t, a, e) {
    var u = e.children, n = l !== null ? l.memoizedState : null;
    if (l === null && t.stateNode === null && (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), e.mode === "hidden") {
      if ((t.flags & 128) !== 0) {
        if (n = n !== null ? n.baseLanes | a : a, l !== null) {
          for (e = t.child = l.child, u = 0; e !== null; ) u = u | e.lanes | e.childLanes, e = e.sibling;
          e = u & ~n;
        } else e = 0, t.child = null;
        return Es(l, t, n, a, e);
      }
      if ((a & 536870912) !== 0) t.memoizedState = {
        baseLanes: 0,
        cachePool: null
      }, l !== null && Ju(t, n !== null ? n.cachePool : null), n !== null ? O0(t, n) : qi(), D0(t);
      else return e = t.lanes = 536870912, Es(l, t, n !== null ? n.baseLanes | a : a, a, e);
    } else n !== null ? (Ju(t, n.cachePool), O0(t, n), ca(t), t.memoizedState = null) : (l !== null && Ju(t, null), qi(), ca(t));
    return Vl(l, t, u, a), t.child;
  }
  function lu(l, t) {
    return l !== null && l.tag === 22 || t.stateNode !== null || (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), t.sibling;
  }
  function Es(l, t, a, e, u) {
    var n = Hi();
    return n = n === null ? null : {
      parent: xl._currentValue,
      pool: n
    }, t.memoizedState = {
      baseLanes: a,
      cachePool: n
    }, l !== null && Ju(t, null), qi(), D0(t), l !== null && ne(l, t, e, !0), t.childLanes = u, null;
  }
  function sn(l, t) {
    return t = vn({
      mode: t.mode,
      children: t.children
    }, l.mode), t.ref = l.ref, l.child = t, t.return = l, t;
  }
  function Ts(l, t, a) {
    return Ca(t, l.child, null, a), l = sn(t, t.pendingProps), l.flags |= 2, vt(t), t.memoizedState = null, l;
  }
  function Dr(l, t, a) {
    var e = t.pendingProps, u = (t.flags & 128) !== 0;
    if (t.flags &= -129, l === null) {
      if (nl) {
        if (e.mode === "hidden") return l = sn(t, e), t.lanes = 536870912, lu(null, l);
        if (Xi(t), (l = _l) ? (l = Yd(l, _t), l = l !== null && l.data === "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: ta !== null ? {
            id: Ot,
            overflow: Dt
          } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = d0(l), a.return = t, t.child = a, Zl = t, _l = null)) : l = null, l === null) throw ea(t);
        return t.lanes = 536870912, null;
      }
      return sn(t, e);
    }
    var n = l.memoizedState;
    if (n !== null) {
      var i = n.dehydrated;
      if (Xi(t), u) if (t.flags & 256) t.flags &= -257, t = Ts(l, t, a);
      else if (t.memoizedState !== null) t.child = l.child, t.flags |= 128, t = null;
      else throw Error(s(558));
      else if (Cl || ne(l, t, a, !1), u = (a & l.childLanes) !== 0, Cl || u) {
        if (e = yl, e !== null && (i = yf(e, a), i !== 0 && i !== n.retryLane)) throw n.retryLane = i, Na(l, i), et(e, l, i), cc;
        _n(), t = Ts(l, t, a);
      } else l = n.treeContext, _l = Et(i.nextSibling), Zl = t, nl = !0, aa = null, _t = !1, l !== null && o0(t, l), t = sn(t, e), t.flags |= 4096;
      return t;
    }
    return l = Bt(l.child, {
      mode: e.mode,
      children: e.children
    }), l.ref = t.ref, t.child = l, l.return = t, l;
  }
  function dn(l, t) {
    var a = t.ref;
    if (a === null) l !== null && l.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof a != "function" && typeof a != "object") throw Error(s(284));
      (l === null || l.ref !== a) && (t.flags |= 4194816);
    }
  }
  function fc(l, t, a, e, u) {
    return Ua(t), a = Zi(l, t, a, e, void 0, u), e = Li(), l !== null && !Cl ? (Vi(l, t, u), Zt(l, t, u)) : (nl && e && Ei(t), t.flags |= 1, Vl(l, t, a, u), t.child);
  }
  function Ms(l, t, a, e, u, n) {
    return Ua(t), t.updateQueue = null, a = U0(t, e, a, u), j0(l), e = Li(), l !== null && !Cl ? (Vi(l, t, n), Zt(l, t, n)) : (nl && e && Ei(t), t.flags |= 1, Vl(l, t, a, n), t.child);
  }
  function As(l, t, a, e, u) {
    if (Ua(t), t.stateNode === null) {
      var n = te, i = a.contextType;
      typeof i == "object" && i !== null && (n = Ll(i)), n = new a(e, n), t.memoizedState = n.state !== null && n.state !== void 0 ? n.state : null, n.updater = nc, t.stateNode = n, n._reactInternals = t, n = t.stateNode, n.props = e, n.state = t.memoizedState, n.refs = {}, Ri(t), i = a.contextType, n.context = typeof i == "object" && i !== null ? Ll(i) : te, n.state = t.memoizedState, i = a.getDerivedStateFromProps, typeof i == "function" && (uc(t, a, i, e), n.state = t.memoizedState), typeof a.getDerivedStateFromProps == "function" || typeof n.getSnapshotBeforeUpdate == "function" || typeof n.UNSAFE_componentWillMount != "function" && typeof n.componentWillMount != "function" || (i = n.state, typeof n.componentWillMount == "function" && n.componentWillMount(), typeof n.UNSAFE_componentWillMount == "function" && n.UNSAFE_componentWillMount(), i !== n.state && nc.enqueueReplaceState(n, n.state, null), We(t, e, n, u), ke(), n.state = t.memoizedState), typeof n.componentDidMount == "function" && (t.flags |= 4194308), e = !0;
    } else if (l === null) {
      n = t.stateNode;
      var c = t.memoizedProps, d = Ga(a, c);
      n.props = d;
      var g = n.context, E = a.contextType;
      i = te, typeof E == "object" && E !== null && (i = Ll(E));
      var A = a.getDerivedStateFromProps;
      E = typeof A == "function" || typeof n.getSnapshotBeforeUpdate == "function", c = t.pendingProps !== c, E || typeof n.UNSAFE_componentWillReceiveProps != "function" && typeof n.componentWillReceiveProps != "function" || (c || g !== i) && hs(t, n, e, i), na = !1;
      var b = t.memoizedState;
      n.state = b, We(t, e, n, u), ke(), g = t.memoizedState, c || b !== g || na ? (typeof A == "function" && (uc(t, a, A, e), g = t.memoizedState), (d = na || ms(t, a, d, e, b, g, i)) ? (E || typeof n.UNSAFE_componentWillMount != "function" && typeof n.componentWillMount != "function" || (typeof n.componentWillMount == "function" && n.componentWillMount(), typeof n.UNSAFE_componentWillMount == "function" && n.UNSAFE_componentWillMount()), typeof n.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof n.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = e, t.memoizedState = g), n.props = e, n.state = g, n.context = i, e = d) : (typeof n.componentDidMount == "function" && (t.flags |= 4194308), e = !1);
    } else {
      n = t.stateNode, Ci(l, t), i = t.memoizedProps, E = Ga(a, i), n.props = E, A = t.pendingProps, b = n.context, g = a.contextType, d = te, typeof g == "object" && g !== null && (d = Ll(g)), c = a.getDerivedStateFromProps, (g = typeof c == "function" || typeof n.getSnapshotBeforeUpdate == "function") || typeof n.UNSAFE_componentWillReceiveProps != "function" && typeof n.componentWillReceiveProps != "function" || (i !== A || b !== d) && hs(t, n, e, d), na = !1, b = t.memoizedState, n.state = b, We(t, e, n, u), ke();
      var S = t.memoizedState;
      i !== A || b !== S || na || l !== null && l.dependencies !== null && Vu(l.dependencies) ? (typeof c == "function" && (uc(t, a, c, e), S = t.memoizedState), (E = na || ms(t, a, E, e, b, S, d) || l !== null && l.dependencies !== null && Vu(l.dependencies)) ? (g || typeof n.UNSAFE_componentWillUpdate != "function" && typeof n.componentWillUpdate != "function" || (typeof n.componentWillUpdate == "function" && n.componentWillUpdate(e, S, d), typeof n.UNSAFE_componentWillUpdate == "function" && n.UNSAFE_componentWillUpdate(e, S, d)), typeof n.componentDidUpdate == "function" && (t.flags |= 4), typeof n.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof n.componentDidUpdate != "function" || i === l.memoizedProps && b === l.memoizedState || (t.flags |= 4), typeof n.getSnapshotBeforeUpdate != "function" || i === l.memoizedProps && b === l.memoizedState || (t.flags |= 1024), t.memoizedProps = e, t.memoizedState = S), n.props = e, n.state = S, n.context = d, e = E) : (typeof n.componentDidUpdate != "function" || i === l.memoizedProps && b === l.memoizedState || (t.flags |= 4), typeof n.getSnapshotBeforeUpdate != "function" || i === l.memoizedProps && b === l.memoizedState || (t.flags |= 1024), e = !1);
    }
    return n = e, dn(l, t), e = (t.flags & 128) !== 0, n || e ? (n = t.stateNode, a = e && typeof a.getDerivedStateFromError != "function" ? null : n.render(), t.flags |= 1, l !== null && e ? (t.child = Ca(t, l.child, null, u), t.child = Ca(t, null, a, u)) : Vl(l, t, a, u), t.memoizedState = n.state, l = t.child) : l = Zt(l, t, u), l;
  }
  function Ns(l, t, a, e) {
    return Da(), t.flags |= 256, Vl(l, t, a, e), t.child;
  }
  var sc = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  function dc(l) {
    return {
      baseLanes: l,
      cachePool: S0()
    };
  }
  function vc(l, t, a) {
    return l = l !== null ? l.childLanes & ~a : 0, t && (l |= ot), l;
  }
  function Os(l, t, a) {
    var e = t.pendingProps, u = !1, n = (t.flags & 128) !== 0, i;
    if ((i = n) || (i = l !== null && l.memoizedState === null ? !1 : (Dl.current & 2) !== 0), i && (u = !0, t.flags &= -129), i = (t.flags & 32) !== 0, t.flags &= -33, l === null) {
      if (nl) {
        if (u ? ia(t) : ca(t), (l = _l) ? (l = Yd(l, _t), l = l !== null && l.data !== "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: ta !== null ? {
            id: Ot,
            overflow: Dt
          } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = d0(l), a.return = t, t.child = a, Zl = t, _l = null)) : l = null, l === null) throw ea(t);
        return Jc(l) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var c = e.children;
      return e = e.fallback, u ? (ca(t), u = t.mode, c = vn({
        mode: "hidden",
        children: c
      }, u), e = Oa(e, u, a, null), c.return = t, e.return = t, c.sibling = e, t.child = c, e = t.child, e.memoizedState = dc(a), e.childLanes = vc(l, i, a), t.memoizedState = sc, lu(null, e)) : (ia(t), rc(t, c));
    }
    var d = l.memoizedState;
    if (d !== null && (c = d.dehydrated, c !== null)) {
      if (n) t.flags & 256 ? (ia(t), t.flags &= -257, t = oc(l, t, a)) : t.memoizedState !== null ? (ca(t), t.child = l.child, t.flags |= 128, t = null) : (ca(t), c = e.fallback, u = t.mode, e = vn({
        mode: "visible",
        children: e.children
      }, u), c = Oa(c, u, a, null), c.flags |= 2, e.return = t, c.return = t, e.sibling = c, t.child = e, Ca(t, l.child, null, a), e = t.child, e.memoizedState = dc(a), e.childLanes = vc(l, i, a), t.memoizedState = sc, t = lu(null, e));
      else if (ia(t), Jc(c)) {
        if (i = c.nextSibling && c.nextSibling.dataset, i) var g = i.dgst;
        i = g, e = Error(s(419)), e.stack = "", e.digest = i, Ze({
          value: e,
          source: null,
          stack: null
        }), t = oc(l, t, a);
      } else if (Cl || ne(l, t, a, !1), i = (a & l.childLanes) !== 0, Cl || i) {
        if (i = yl, i !== null && (e = yf(i, a), e !== 0 && e !== d.retryLane)) throw d.retryLane = e, Na(l, e), et(i, l, e), cc;
        Kc(c) || _n(), t = oc(l, t, a);
      } else Kc(c) ? (t.flags |= 192, t.child = l.child, t = null) : (l = d.treeContext, _l = Et(c.nextSibling), Zl = t, nl = !0, aa = null, _t = !1, l !== null && o0(t, l), t = rc(t, e.children), t.flags |= 4096);
      return t;
    }
    return u ? (ca(t), c = e.fallback, u = t.mode, d = l.child, g = d.sibling, e = Bt(d, {
      mode: "hidden",
      children: e.children
    }), e.subtreeFlags = d.subtreeFlags & 65011712, g !== null ? c = Bt(g, c) : (c = Oa(c, u, a, null), c.flags |= 2), c.return = t, e.return = t, e.sibling = c, t.child = e, lu(null, e), e = t.child, c = l.child.memoizedState, c === null ? c = dc(a) : (u = c.cachePool, u !== null ? (d = xl._currentValue, u = u.parent !== d ? {
      parent: d,
      pool: d
    } : u) : u = S0(), c = {
      baseLanes: c.baseLanes | a,
      cachePool: u
    }), e.memoizedState = c, e.childLanes = vc(l, i, a), t.memoizedState = sc, lu(l.child, e)) : (ia(t), a = l.child, l = a.sibling, a = Bt(a, {
      mode: "visible",
      children: e.children
    }), a.return = t, a.sibling = null, l !== null && (i = t.deletions, i === null ? (t.deletions = [l], t.flags |= 16) : i.push(l)), t.child = a, t.memoizedState = null, a);
  }
  function rc(l, t) {
    return t = vn({
      mode: "visible",
      children: t
    }, l.mode), t.return = l, l.child = t;
  }
  function vn(l, t) {
    return l = st(22, l, null, t), l.lanes = 0, l;
  }
  function oc(l, t, a) {
    return Ca(t, l.child, null, a), l = rc(t, t.pendingProps.children), l.flags |= 2, t.memoizedState = null, l;
  }
  function Ds(l, t, a) {
    l.lanes |= t;
    var e = l.alternate;
    e !== null && (e.lanes |= t), Oi(l.return, t, a);
  }
  function mc(l, t, a, e, u, n) {
    var i = l.memoizedState;
    i === null ? l.memoizedState = {
      isBackwards: t,
      rendering: null,
      renderingStartTime: 0,
      last: e,
      tail: a,
      tailMode: u,
      treeForkCount: n
    } : (i.isBackwards = t, i.rendering = null, i.renderingStartTime = 0, i.last = e, i.tail = a, i.tailMode = u, i.treeForkCount = n);
  }
  function js(l, t, a) {
    var e = t.pendingProps, u = e.revealOrder, n = e.tail;
    e = e.children;
    var i = Dl.current, c = (i & 2) !== 0;
    if (c ? (i = i & 1 | 2, t.flags |= 128) : i &= 1, Y(Dl, i), Vl(l, t, e, a), e = nl ? Qe : 0, !c && l !== null && (l.flags & 128) !== 0) l: for (l = t.child; l !== null; ) {
      if (l.tag === 13) l.memoizedState !== null && Ds(l, a, t);
      else if (l.tag === 19) Ds(l, a, t);
      else if (l.child !== null) {
        l.child.return = l, l = l.child;
        continue;
      }
      if (l === t) break l;
      for (; l.sibling === null; ) {
        if (l.return === null || l.return === t) break l;
        l = l.return;
      }
      l.sibling.return = l.return, l = l.sibling;
    }
    switch (u) {
      case "forwards":
        for (a = t.child, u = null; a !== null; ) l = a.alternate, l !== null && Iu(l) === null && (u = a), a = a.sibling;
        a = u, a === null ? (u = t.child, t.child = null) : (u = a.sibling, a.sibling = null), mc(t, !1, u, a, n, e);
        break;
      case "backwards":
      case "unstable_legacy-backwards":
        for (a = null, u = t.child, t.child = null; u !== null; ) {
          if (l = u.alternate, l !== null && Iu(l) === null) {
            t.child = u;
            break;
          }
          l = u.sibling, u.sibling = a, a = u, u = l;
        }
        mc(t, !0, a, null, n, e);
        break;
      case "together":
        mc(t, !1, null, null, void 0, e);
        break;
      default:
        t.memoizedState = null;
    }
    return t.child;
  }
  function Zt(l, t, a) {
    if (l !== null && (t.dependencies = l.dependencies), da |= t.lanes, (a & t.childLanes) === 0) if (l !== null) {
      if (ne(l, t, a, !1), (a & t.childLanes) === 0) return null;
    } else return null;
    if (l !== null && t.child !== l.child) throw Error(s(153));
    if (t.child !== null) {
      for (l = t.child, a = Bt(l, l.pendingProps), t.child = a, a.return = t; l.sibling !== null; ) l = l.sibling, a = a.sibling = Bt(l, l.pendingProps), a.return = t;
      a.sibling = null;
    }
    return t.child;
  }
  function hc(l, t) {
    return (l.lanes & t) !== 0 ? !0 : (l = l.dependencies, !!(l !== null && Vu(l)));
  }
  function jr(l, t, a) {
    switch (t.tag) {
      case 3:
        Wl(t, t.stateNode.containerInfo), ua(t, xl, l.memoizedState.cache), Da();
        break;
      case 27:
      case 5:
        Ae(t);
        break;
      case 4:
        Wl(t, t.stateNode.containerInfo);
        break;
      case 10:
        ua(t, t.type, t.memoizedProps.value);
        break;
      case 31:
        if (t.memoizedState !== null) return t.flags |= 128, Xi(t), null;
        break;
      case 13:
        var e = t.memoizedState;
        if (e !== null)
          return e.dehydrated !== null ? (ia(t), t.flags |= 128, null) : (a & t.child.childLanes) !== 0 ? Os(l, t, a) : (ia(t), l = Zt(l, t, a), l !== null ? l.sibling : null);
        ia(t);
        break;
      case 19:
        var u = (l.flags & 128) !== 0;
        if (e = (a & t.childLanes) !== 0, e || (ne(l, t, a, !1), e = (a & t.childLanes) !== 0), u) {
          if (e) return js(l, t, a);
          t.flags |= 128;
        }
        if (u = t.memoizedState, u !== null && (u.rendering = null, u.tail = null, u.lastEffect = null), Y(Dl, Dl.current), e) break;
        return null;
      case 22:
        return t.lanes = 0, ps(l, t, a, t.pendingProps);
      case 24:
        ua(t, xl, l.memoizedState.cache);
    }
    return Zt(l, t, a);
  }
  function Us(l, t, a) {
    if (l !== null) if (l.memoizedProps !== t.pendingProps) Cl = !0;
    else {
      if (!hc(l, a) && (t.flags & 128) === 0) return Cl = !1, jr(l, t, a);
      Cl = (l.flags & 131072) !== 0;
    }
    else Cl = !1, nl && (t.flags & 1048576) !== 0 && r0(t, Qe, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        l: {
          var e = t.pendingProps;
          if (l = xa(t.elementType), t.type = l, typeof l == "function") _i(l) ? (e = Ga(l, e), t.tag = 1, t = As(null, t, l, e, a)) : (t.tag = 0, t = fc(null, t, l, e, a));
          else {
            if (l != null) {
              var u = l.$$typeof;
              if (u === V) {
                t.tag = 11, t = Ss(null, t, l, e, a);
                break l;
              } else if (u === K) {
                t.tag = 14, t = _s(null, t, l, e, a);
                break l;
              }
            }
            throw t = El(l) || l, Error(s(306, t, ""));
          }
        }
        return t;
      case 0:
        return fc(l, t, t.type, t.pendingProps, a);
      case 1:
        return e = t.type, u = Ga(e, t.pendingProps), As(l, t, e, u, a);
      case 3:
        l: {
          if (Wl(t, t.stateNode.containerInfo), l === null) throw Error(s(387));
          e = t.pendingProps;
          var n = t.memoizedState;
          u = n.element, Ci(l, t), We(t, e, null, a);
          var i = t.memoizedState;
          if (e = i.cache, ua(t, xl, e), e !== n.cache && Di(t, [xl], a, !0), ke(), e = i.element, n.isDehydrated) if (n = {
            element: e,
            isDehydrated: !1,
            cache: i.cache
          }, t.updateQueue.baseState = n, t.memoizedState = n, t.flags & 256) {
            t = Ns(l, t, e, a);
            break l;
          } else if (e !== u) {
            u = gt(Error(s(424)), t), Ze(u), t = Ns(l, t, e, a);
            break l;
          } else {
            switch (l = t.stateNode.containerInfo, l.nodeType) {
              case 9:
                l = l.body;
                break;
              default:
                l = l.nodeName === "HTML" ? l.ownerDocument.body : l;
            }
            for (_l = Et(l.firstChild), Zl = t, nl = !0, aa = null, _t = !0, a = M0(t, null, e, a), t.child = a; a; ) a.flags = a.flags & -3 | 4096, a = a.sibling;
          }
          else {
            if (Da(), e === u) {
              t = Zt(l, t, a);
              break l;
            }
            Vl(l, t, e, a);
          }
          t = t.child;
        }
        return t;
      case 26:
        return dn(l, t), l === null ? (a = Ld(t.type, null, t.pendingProps, null)) ? t.memoizedState = a : nl || (a = t.type, l = t.pendingProps, e = Nn(I.current).createElement(a), e[Ql] = t, e[Fl] = l, Kl(e, a, l), Gl(e), t.stateNode = e) : t.memoizedState = Ld(t.type, l.memoizedProps, t.pendingProps, l.memoizedState), null;
      case 27:
        return Ae(t), l === null && nl && (e = t.stateNode = Xd(t.type, t.pendingProps, I.current), Zl = t, _t = !0, u = _l, ha(t.type) ? (wc = u, _l = Et(e.firstChild)) : _l = u), Vl(l, t, t.pendingProps.children, a), dn(l, t), l === null && (t.flags |= 4194304), t.child;
      case 5:
        return l === null && nl && ((u = e = _l) && (e = uo(e, t.type, t.pendingProps, _t), e !== null ? (t.stateNode = e, Zl = t, _l = Et(e.firstChild), _t = !1, u = !0) : u = !1), u || ea(t)), Ae(t), u = t.type, n = t.pendingProps, i = l !== null ? l.memoizedProps : null, e = n.children, Zc(u, n) ? e = null : i !== null && Zc(u, i) && (t.flags |= 32), t.memoizedState !== null && (u = Zi(l, t, br, null, null, a), hu._currentValue = u), dn(l, t), Vl(l, t, e, a), t.child;
      case 6:
        return l === null && nl && ((l = a = _l) && (a = no(a, t.pendingProps, _t), a !== null ? (t.stateNode = a, Zl = t, _l = null, l = !0) : l = !1), l || ea(t)), null;
      case 13:
        return Os(l, t, a);
      case 4:
        return Wl(t, t.stateNode.containerInfo), e = t.pendingProps, l === null ? t.child = Ca(t, null, e, a) : Vl(l, t, e, a), t.child;
      case 11:
        return Ss(l, t, t.type, t.pendingProps, a);
      case 7:
        return Vl(l, t, t.pendingProps, a), t.child;
      case 8:
        return Vl(l, t, t.pendingProps.children, a), t.child;
      case 12:
        return Vl(l, t, t.pendingProps.children, a), t.child;
      case 10:
        return e = t.pendingProps, ua(t, t.type, e.value), Vl(l, t, e.children, a), t.child;
      case 9:
        return u = t.type._context, e = t.pendingProps.children, Ua(t), u = Ll(u), e = e(u), t.flags |= 1, Vl(l, t, e, a), t.child;
      case 14:
        return _s(l, t, t.type, t.pendingProps, a);
      case 15:
        return zs(l, t, t.type, t.pendingProps, a);
      case 19:
        return js(l, t, a);
      case 31:
        return Dr(l, t, a);
      case 22:
        return ps(l, t, a, t.pendingProps);
      case 24:
        return Ua(t), e = Ll(xl), l === null ? (u = Hi(), u === null && (u = yl, n = ji(), u.pooledCache = n, n.refCount++, n !== null && (u.pooledCacheLanes |= a), u = n), t.memoizedState = {
          parent: e,
          cache: u
        }, Ri(t), ua(t, xl, u)) : ((l.lanes & a) !== 0 && (Ci(l, t), We(t, null, null, a), ke()), u = l.memoizedState, n = t.memoizedState, u.parent !== e ? (u = {
          parent: e,
          cache: e
        }, t.memoizedState = u, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = u), ua(t, xl, e)) : (e = n.cache, ua(t, xl, e), e !== u.cache && Di(t, [xl], a, !0))), Vl(l, t, t.pendingProps.children, a), t.child;
      case 29:
        throw t.pendingProps;
    }
    throw Error(s(156, t.tag));
  }
  function Lt(l) {
    l.flags |= 4;
  }
  function yc(l, t, a, e, u) {
    if ((t = (l.mode & 32) !== 0) && (t = !1), t) {
      if (l.flags |= 16777216, (u & 335544128) === u) if (l.stateNode.complete) l.flags |= 8192;
      else if (ud()) l.flags |= 8192;
      else throw Ra = ku, xi;
    } else l.flags &= -16777217;
  }
  function Hs(l, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0) l.flags &= -16777217;
    else if (l.flags |= 16777216, !kd(t)) if (ud()) l.flags |= 8192;
    else throw Ra = ku, xi;
  }
  function rn(l, t) {
    t !== null && (l.flags |= 4), l.flags & 16384 && (t = l.tag !== 22 ? of() : 536870912, l.lanes |= t, ge |= t);
  }
  function tu(l, t) {
    if (!nl) switch (l.tailMode) {
      case "hidden":
        t = l.tail;
        for (var a = null; t !== null; ) t.alternate !== null && (a = t), t = t.sibling;
        a === null ? l.tail = null : a.sibling = null;
        break;
      case "collapsed":
        a = l.tail;
        for (var e = null; a !== null; ) a.alternate !== null && (e = a), a = a.sibling;
        e === null ? t || l.tail === null ? l.tail = null : l.tail.sibling = null : e.sibling = null;
    }
  }
  function zl(l) {
    var t = l.alternate !== null && l.alternate.child === l.child, a = 0, e = 0;
    if (t) for (var u = l.child; u !== null; ) a |= u.lanes | u.childLanes, e |= u.subtreeFlags & 65011712, e |= u.flags & 65011712, u.return = l, u = u.sibling;
    else for (u = l.child; u !== null; ) a |= u.lanes | u.childLanes, e |= u.subtreeFlags, e |= u.flags, u.return = l, u = u.sibling;
    return l.subtreeFlags |= e, l.childLanes = a, t;
  }
  function Ur(l, t, a) {
    var e = t.pendingProps;
    switch (Ti(t), t.tag) {
      case 16:
      case 15:
      case 0:
      case 11:
      case 7:
      case 8:
      case 12:
      case 9:
      case 14:
        return zl(t), null;
      case 1:
        return zl(t), null;
      case 3:
        return a = t.stateNode, e = null, l !== null && (e = l.memoizedState.cache), t.memoizedState.cache !== e && (t.flags |= 2048), Gt(xl), Ol(), a.pendingContext && (a.context = a.pendingContext, a.pendingContext = null), (l === null || l.child === null) && (ue(t) ? Lt(t) : l === null || l.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, Ai())), zl(t), null;
      case 26:
        var u = t.type, n = t.memoizedState;
        return l === null ? (Lt(t), n !== null ? (zl(t), Hs(t, n)) : (zl(t), yc(t, u, null, e, a))) : n ? n !== l.memoizedState ? (Lt(t), zl(t), Hs(t, n)) : (zl(t), t.flags &= -16777217) : (l = l.memoizedProps, l !== e && Lt(t), zl(t), yc(t, u, l, e, a)), null;
      case 27:
        if (zu(t), a = I.current, u = t.type, l !== null && t.stateNode != null) l.memoizedProps !== e && Lt(t);
        else {
          if (!e) {
            if (t.stateNode === null) throw Error(s(166));
            return zl(t), null;
          }
          l = L.current, ue(t) ? m0(t, l) : (l = Xd(u, e, a), t.stateNode = l, Lt(t));
        }
        return zl(t), null;
      case 5:
        if (zu(t), u = t.type, l !== null && t.stateNode != null) l.memoizedProps !== e && Lt(t);
        else {
          if (!e) {
            if (t.stateNode === null) throw Error(s(166));
            return zl(t), null;
          }
          if (n = L.current, ue(t)) m0(t, n);
          else {
            var i = Nn(I.current);
            switch (n) {
              case 1:
                n = i.createElementNS("http://www.w3.org/2000/svg", u);
                break;
              case 2:
                n = i.createElementNS("http://www.w3.org/1998/Math/MathML", u);
                break;
              default:
                switch (u) {
                  case "svg":
                    n = i.createElementNS("http://www.w3.org/2000/svg", u);
                    break;
                  case "math":
                    n = i.createElementNS("http://www.w3.org/1998/Math/MathML", u);
                    break;
                  case "script":
                    n = i.createElement("div"), n.innerHTML = "<script><\/script>", n = n.removeChild(n.firstChild);
                    break;
                  case "select":
                    n = typeof e.is == "string" ? i.createElement("select", { is: e.is }) : i.createElement("select"), e.multiple ? n.multiple = !0 : e.size && (n.size = e.size);
                    break;
                  default:
                    n = typeof e.is == "string" ? i.createElement(u, { is: e.is }) : i.createElement(u);
                }
            }
            n[Ql] = t, n[Fl] = e;
            l: for (i = t.child; i !== null; ) {
              if (i.tag === 5 || i.tag === 6) n.appendChild(i.stateNode);
              else if (i.tag !== 4 && i.tag !== 27 && i.child !== null) {
                i.child.return = i, i = i.child;
                continue;
              }
              if (i === t) break l;
              for (; i.sibling === null; ) {
                if (i.return === null || i.return === t) break l;
                i = i.return;
              }
              i.sibling.return = i.return, i = i.sibling;
            }
            t.stateNode = n;
            l: switch (Kl(n, u, e), u) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                e = !!e.autoFocus;
                break l;
              case "img":
                e = !0;
                break l;
              default:
                e = !1;
            }
            e && Lt(t);
          }
        }
        return zl(t), yc(t, t.type, l === null ? null : l.memoizedProps, t.pendingProps, a), null;
      case 6:
        if (l && t.stateNode != null) l.memoizedProps !== e && Lt(t);
        else {
          if (typeof e != "string" && t.stateNode === null) throw Error(s(166));
          if (l = I.current, ue(t)) {
            if (l = t.stateNode, a = t.memoizedProps, e = null, u = Zl, u !== null) switch (u.tag) {
              case 27:
              case 5:
                e = u.memoizedProps;
            }
            l[Ql] = t, l = !!(l.nodeValue === a || e !== null && e.suppressHydrationWarning === !0 || Dd(l.nodeValue, a)), l || ea(t, !0);
          } else l = Nn(l).createTextNode(e), l[Ql] = t, t.stateNode = l;
        }
        return zl(t), null;
      case 31:
        if (a = t.memoizedState, l === null || l.memoizedState !== null) {
          if (e = ue(t), a !== null) {
            if (l === null) {
              if (!e) throw Error(s(318));
              if (l = t.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(s(557));
              l[Ql] = t;
            } else Da(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            zl(t), l = !1;
          } else a = Ai(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = a), l = !0;
          if (!l)
            return t.flags & 256 ? (vt(t), t) : (vt(t), null);
          if ((t.flags & 128) !== 0) throw Error(s(558));
        }
        return zl(t), null;
      case 13:
        if (e = t.memoizedState, l === null || l.memoizedState !== null && l.memoizedState.dehydrated !== null) {
          if (u = ue(t), e !== null && e.dehydrated !== null) {
            if (l === null) {
              if (!u) throw Error(s(318));
              if (u = t.memoizedState, u = u !== null ? u.dehydrated : null, !u) throw Error(s(317));
              u[Ql] = t;
            } else Da(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            zl(t), u = !1;
          } else u = Ai(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = u), u = !0;
          if (!u)
            return t.flags & 256 ? (vt(t), t) : (vt(t), null);
        }
        return vt(t), (t.flags & 128) !== 0 ? (t.lanes = a, t) : (a = e !== null, l = l !== null && l.memoizedState !== null, a && (e = t.child, u = null, e.alternate !== null && e.alternate.memoizedState !== null && e.alternate.memoizedState.cachePool !== null && (u = e.alternate.memoizedState.cachePool.pool), n = null, e.memoizedState !== null && e.memoizedState.cachePool !== null && (n = e.memoizedState.cachePool.pool), n !== u && (e.flags |= 2048)), a !== l && a && (t.child.flags |= 8192), rn(t, t.updateQueue), zl(t), null);
      case 4:
        return Ol(), l === null && Md(t.stateNode.containerInfo), zl(t), null;
      case 10:
        return Gt(t.type), zl(t), null;
      case 19:
        if (N(Dl), e = t.memoizedState, e === null) return zl(t), null;
        if (u = (t.flags & 128) !== 0, n = e.rendering, n === null) if (u) tu(e, !1);
        else {
          if (Nl !== 0 || l !== null && (l.flags & 128) !== 0) for (l = t.child; l !== null; ) {
            if (n = Iu(l), n !== null) {
              for (t.flags |= 128, tu(e, !1), l = n.updateQueue, t.updateQueue = l, rn(t, l), t.subtreeFlags = 0, l = a, a = t.child; a !== null; ) s0(a, l), a = a.sibling;
              return Y(Dl, Dl.current & 1 | 2), nl && Yt(t, e.treeForkCount), t.child;
            }
            l = l.sibling;
          }
          e.tail !== null && nt() > gn && (t.flags |= 128, u = !0, tu(e, !1), t.lanes = 4194304);
        }
        else {
          if (!u) if (l = Iu(n), l !== null) {
            if (t.flags |= 128, u = !0, l = l.updateQueue, t.updateQueue = l, rn(t, l), tu(e, !0), e.tail === null && e.tailMode === "hidden" && !n.alternate && !nl) return zl(t), null;
          } else 2 * nt() - e.renderingStartTime > gn && a !== 536870912 && (t.flags |= 128, u = !0, tu(e, !1), t.lanes = 4194304);
          e.isBackwards ? (n.sibling = t.child, t.child = n) : (l = e.last, l !== null ? l.sibling = n : t.child = n, e.last = n);
        }
        return e.tail !== null ? (l = e.tail, e.rendering = l, e.tail = l.sibling, e.renderingStartTime = nt(), l.sibling = null, a = Dl.current, Y(Dl, u ? a & 1 | 2 : a & 1), nl && Yt(t, e.treeForkCount), l) : (zl(t), null);
      case 22:
      case 23:
        return vt(t), Gi(), e = t.memoizedState !== null, l !== null ? l.memoizedState !== null !== e && (t.flags |= 8192) : e && (t.flags |= 8192), e ? (a & 536870912) !== 0 && (t.flags & 128) === 0 && (zl(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : zl(t), a = t.updateQueue, a !== null && rn(t, a.retryQueue), a = null, l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== a && (t.flags |= 2048), l !== null && N(Ha), null;
      case 24:
        return a = null, l !== null && (a = l.memoizedState.cache), t.memoizedState.cache !== a && (t.flags |= 2048), Gt(xl), zl(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(s(156, t.tag));
  }
  function Hr(l, t) {
    switch (Ti(t), t.tag) {
      case 1:
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 3:
        return Gt(xl), Ol(), l = t.flags, (l & 65536) !== 0 && (l & 128) === 0 ? (t.flags = l & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return zu(t), null;
      case 31:
        if (t.memoizedState !== null) {
          if (vt(t), t.alternate === null) throw Error(s(340));
          Da();
        }
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 13:
        if (vt(t), l = t.memoizedState, l !== null && l.dehydrated !== null) {
          if (t.alternate === null) throw Error(s(340));
          Da();
        }
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 19:
        return N(Dl), null;
      case 4:
        return Ol(), null;
      case 10:
        return Gt(t.type), null;
      case 22:
      case 23:
        return vt(t), Gi(), l !== null && N(Ha), l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 24:
        return Gt(xl), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function xs(l, t) {
    switch (Ti(t), t.tag) {
      case 3:
        Gt(xl), Ol();
        break;
      case 26:
      case 27:
      case 5:
        zu(t);
        break;
      case 4:
        Ol();
        break;
      case 31:
        t.memoizedState !== null && vt(t);
        break;
      case 13:
        vt(t);
        break;
      case 19:
        N(Dl);
        break;
      case 10:
        Gt(t.type);
        break;
      case 22:
      case 23:
        vt(t), Gi(), l !== null && N(Ha);
        break;
      case 24:
        Gt(xl);
    }
  }
  function au(l, t) {
    try {
      var a = t.updateQueue, e = a !== null ? a.lastEffect : null;
      if (e !== null) {
        var u = e.next;
        a = u;
        do {
          if ((a.tag & l) === l) {
            e = void 0;
            var n = a.create, i = a.inst;
            e = n(), i.destroy = e;
          }
          a = a.next;
        } while (a !== u);
      }
    } catch (c) {
      rl(t, t.return, c);
    }
  }
  function fa(l, t, a) {
    try {
      var e = t.updateQueue, u = e !== null ? e.lastEffect : null;
      if (u !== null) {
        var n = u.next;
        e = n;
        do {
          if ((e.tag & l) === l) {
            var i = e.inst, c = i.destroy;
            if (c !== void 0) {
              i.destroy = void 0, u = t;
              var d = a, g = c;
              try {
                g();
              } catch (E) {
                rl(u, d, E);
              }
            }
          }
          e = e.next;
        } while (e !== n);
      }
    } catch (E) {
      rl(t, t.return, E);
    }
  }
  function Rs(l) {
    var t = l.updateQueue;
    if (t !== null) {
      var a = l.stateNode;
      try {
        N0(t, a);
      } catch (e) {
        rl(l, l.return, e);
      }
    }
  }
  function Cs(l, t, a) {
    a.props = Ga(l.type, l.memoizedProps), a.state = l.memoizedState;
    try {
      a.componentWillUnmount();
    } catch (e) {
      rl(l, t, e);
    }
  }
  function eu(l, t) {
    try {
      var a = l.ref;
      if (a !== null) {
        switch (l.tag) {
          case 26:
          case 27:
          case 5:
            var e = l.stateNode;
            break;
          case 30:
            e = l.stateNode;
            break;
          default:
            e = l.stateNode;
        }
        typeof a == "function" ? l.refCleanup = a(e) : a.current = e;
      }
    } catch (u) {
      rl(l, t, u);
    }
  }
  function jt(l, t) {
    var a = l.ref, e = l.refCleanup;
    if (a !== null) if (typeof e == "function") try {
      e();
    } catch (u) {
      rl(l, t, u);
    } finally {
      l.refCleanup = null, l = l.alternate, l != null && (l.refCleanup = null);
    }
    else if (typeof a == "function") try {
      a(null);
    } catch (u) {
      rl(l, t, u);
    }
    else a.current = null;
  }
  function Bs(l) {
    var t = l.type, a = l.memoizedProps, e = l.stateNode;
    try {
      l: switch (t) {
        case "button":
        case "input":
        case "select":
        case "textarea":
          a.autoFocus && e.focus();
          break l;
        case "img":
          a.src ? e.src = a.src : a.srcSet && (e.srcset = a.srcSet);
      }
    } catch (u) {
      rl(l, l.return, u);
    }
  }
  function gc(l, t, a) {
    try {
      var e = l.stateNode;
      Ir(e, l.type, a, t), e[Fl] = t;
    } catch (u) {
      rl(l, l.return, u);
    }
  }
  function Ys(l) {
    return l.tag === 5 || l.tag === 3 || l.tag === 26 || l.tag === 27 && ha(l.type) || l.tag === 4;
  }
  function bc(l) {
    l: for (; ; ) {
      for (; l.sibling === null; ) {
        if (l.return === null || Ys(l.return)) return null;
        l = l.return;
      }
      for (l.sibling.return = l.return, l = l.sibling; l.tag !== 5 && l.tag !== 6 && l.tag !== 18; ) {
        if (l.tag === 27 && ha(l.type) || l.flags & 2 || l.child === null || l.tag === 4) continue l;
        l.child.return = l, l = l.child;
      }
      if (!(l.flags & 2)) return l.stateNode;
    }
  }
  function Sc(l, t, a) {
    var e = l.tag;
    if (e === 5 || e === 6) l = l.stateNode, t ? (a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a).insertBefore(l, t) : (t = a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a, t.appendChild(l), a = a._reactRootContainer, a != null || t.onclick !== null || (t.onclick = Rt));
    else if (e !== 4 && (e === 27 && ha(l.type) && (a = l.stateNode, t = null), l = l.child, l !== null)) for (Sc(l, t, a), l = l.sibling; l !== null; ) Sc(l, t, a), l = l.sibling;
  }
  function on(l, t, a) {
    var e = l.tag;
    if (e === 5 || e === 6) l = l.stateNode, t ? a.insertBefore(l, t) : a.appendChild(l);
    else if (e !== 4 && (e === 27 && ha(l.type) && (a = l.stateNode), l = l.child, l !== null)) for (on(l, t, a), l = l.sibling; l !== null; ) on(l, t, a), l = l.sibling;
  }
  function qs(l) {
    var t = l.stateNode, a = l.memoizedProps;
    try {
      for (var e = l.type, u = t.attributes; u.length; ) t.removeAttributeNode(u[0]);
      Kl(t, e, a), t[Ql] = l, t[Fl] = a;
    } catch (n) {
      rl(l, l.return, n);
    }
  }
  var Vt = !1, Bl = !1, _c = !1, Gs = typeof WeakSet == "function" ? WeakSet : Set, Xl = null;
  function xr(l, t) {
    if (l = l.containerInfo, Xc = Rn, l = l0(l), oi(l)) {
      if ("selectionStart" in l) var a = {
        start: l.selectionStart,
        end: l.selectionEnd
      };
      else l: {
        a = (a = l.ownerDocument) && a.defaultView || window;
        var e = a.getSelection && a.getSelection();
        if (e && e.rangeCount !== 0) {
          a = e.anchorNode;
          var u = e.anchorOffset, n = e.focusNode;
          e = e.focusOffset;
          try {
            a.nodeType, n.nodeType;
          } catch {
            a = null;
            break l;
          }
          var i = 0, c = -1, d = -1, g = 0, E = 0, A = l, b = null;
          t: for (; ; ) {
            for (var S; A !== a || u !== 0 && A.nodeType !== 3 || (c = i + u), A !== n || e !== 0 && A.nodeType !== 3 || (d = i + e), A.nodeType === 3 && (i += A.nodeValue.length), (S = A.firstChild) !== null; )
              b = A, A = S;
            for (; ; ) {
              if (A === l) break t;
              if (b === a && ++g === u && (c = i), b === n && ++E === e && (d = i), (S = A.nextSibling) !== null) break;
              A = b, b = A.parentNode;
            }
            A = S;
          }
          a = c === -1 || d === -1 ? null : {
            start: c,
            end: d
          };
        } else a = null;
      }
      a = a || {
        start: 0,
        end: 0
      };
    } else a = null;
    for (Qc = {
      focusedElem: l,
      selectionRange: a
    }, Rn = !1, Xl = t; Xl !== null; ) if (t = Xl, l = t.child, (t.subtreeFlags & 1028) !== 0 && l !== null) l.return = t, Xl = l;
    else for (; Xl !== null; ) {
      switch (t = Xl, n = t.alternate, l = t.flags, t.tag) {
        case 0:
          if ((l & 4) !== 0 && (l = t.updateQueue, l = l !== null ? l.events : null, l !== null)) for (a = 0; a < l.length; a++) u = l[a], u.ref.impl = u.nextImpl;
          break;
        case 11:
        case 15:
          break;
        case 1:
          if ((l & 1024) !== 0 && n !== null) {
            l = void 0, a = t, u = n.memoizedProps, n = n.memoizedState, e = a.stateNode;
            try {
              var q = Ga(a.type, u);
              l = e.getSnapshotBeforeUpdate(q, n), e.__reactInternalSnapshotBeforeUpdate = l;
            } catch (w) {
              rl(a, a.return, w);
            }
          }
          break;
        case 3:
          if ((l & 1024) !== 0) {
            if (l = t.stateNode.containerInfo, a = l.nodeType, a === 9) Vc(l);
            else if (a === 1) switch (l.nodeName) {
              case "HEAD":
              case "HTML":
              case "BODY":
                Vc(l);
                break;
              default:
                l.textContent = "";
            }
          }
          break;
        case 5:
        case 26:
        case 27:
        case 6:
        case 4:
        case 17:
          break;
        default:
          if ((l & 1024) !== 0) throw Error(s(163));
      }
      if (l = t.sibling, l !== null) {
        l.return = t.return, Xl = l;
        break;
      }
      Xl = t.return;
    }
  }
  function Xs(l, t, a) {
    var e = a.flags;
    switch (a.tag) {
      case 0:
      case 11:
      case 15:
        Jt(l, a), e & 4 && au(5, a);
        break;
      case 1:
        if (Jt(l, a), e & 4) if (l = a.stateNode, t === null) try {
          l.componentDidMount();
        } catch (i) {
          rl(a, a.return, i);
        }
        else {
          var u = Ga(a.type, t.memoizedProps);
          t = t.memoizedState;
          try {
            l.componentDidUpdate(u, t, l.__reactInternalSnapshotBeforeUpdate);
          } catch (i) {
            rl(a, a.return, i);
          }
        }
        e & 64 && Rs(a), e & 512 && eu(a, a.return);
        break;
      case 3:
        if (Jt(l, a), e & 64 && (l = a.updateQueue, l !== null)) {
          if (t = null, a.child !== null) switch (a.child.tag) {
            case 27:
            case 5:
              t = a.child.stateNode;
              break;
            case 1:
              t = a.child.stateNode;
          }
          try {
            N0(l, t);
          } catch (i) {
            rl(a, a.return, i);
          }
        }
        break;
      case 27:
        t === null && e & 4 && qs(a);
      case 26:
      case 5:
        Jt(l, a), t === null && e & 4 && Bs(a), e & 512 && eu(a, a.return);
        break;
      case 12:
        Jt(l, a);
        break;
      case 31:
        Jt(l, a), e & 4 && Ls(l, a);
        break;
      case 13:
        Jt(l, a), e & 4 && Vs(l, a), e & 64 && (l = a.memoizedState, l !== null && (l = l.dehydrated, l !== null && (a = Zr.bind(null, a), io(l, a))));
        break;
      case 22:
        if (e = a.memoizedState !== null || Vt, !e) {
          t = t !== null && t.memoizedState !== null || Bl, u = Vt;
          var n = Bl;
          Vt = e, (Bl = t) && !n ? wt(l, a, (a.subtreeFlags & 8772) !== 0) : Jt(l, a), Vt = u, Bl = n;
        }
        break;
      case 30:
        break;
      default:
        Jt(l, a);
    }
  }
  function Qs(l) {
    var t = l.alternate;
    t !== null && (l.alternate = null, Qs(t)), l.child = null, l.deletions = null, l.sibling = null, l.tag === 5 && (t = l.stateNode, t !== null && $n(t)), l.stateNode = null, l.return = null, l.dependencies = null, l.memoizedProps = null, l.memoizedState = null, l.pendingProps = null, l.stateNode = null, l.updateQueue = null;
  }
  var pl = null, Pl = !1;
  function Kt(l, t, a) {
    for (a = a.child; a !== null; ) Zs(l, t, a), a = a.sibling;
  }
  function Zs(l, t, a) {
    if (it && typeof it.onCommitFiberUnmount == "function") try {
      it.onCommitFiberUnmount(Ne, a);
    } catch {
    }
    switch (a.tag) {
      case 26:
        Bl || jt(a, t), Kt(l, t, a), a.memoizedState ? a.memoizedState.count-- : a.stateNode && (a = a.stateNode, a.parentNode.removeChild(a));
        break;
      case 27:
        Bl || jt(a, t);
        var e = pl, u = Pl;
        ha(a.type) && (pl = a.stateNode, Pl = !1), Kt(l, t, a), ru(a.stateNode), pl = e, Pl = u;
        break;
      case 5:
        Bl || jt(a, t);
      case 6:
        if (e = pl, u = Pl, pl = null, Kt(l, t, a), pl = e, Pl = u, pl !== null) if (Pl) try {
          (pl.nodeType === 9 ? pl.body : pl.nodeName === "HTML" ? pl.ownerDocument.body : pl).removeChild(a.stateNode);
        } catch (n) {
          rl(a, t, n);
        }
        else try {
          pl.removeChild(a.stateNode);
        } catch (n) {
          rl(a, t, n);
        }
        break;
      case 18:
        pl !== null && (Pl ? (l = pl, Cd(l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l, a.stateNode), Me(l)) : Cd(pl, a.stateNode));
        break;
      case 4:
        e = pl, u = Pl, pl = a.stateNode.containerInfo, Pl = !0, Kt(l, t, a), pl = e, Pl = u;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        fa(2, a, t), Bl || fa(4, a, t), Kt(l, t, a);
        break;
      case 1:
        Bl || (jt(a, t), e = a.stateNode, typeof e.componentWillUnmount == "function" && Cs(a, t, e)), Kt(l, t, a);
        break;
      case 21:
        Kt(l, t, a);
        break;
      case 22:
        Bl = (e = Bl) || a.memoizedState !== null, Kt(l, t, a), Bl = e;
        break;
      default:
        Kt(l, t, a);
    }
  }
  function Ls(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null))) {
      l = l.dehydrated;
      try {
        Me(l);
      } catch (a) {
        rl(t, t.return, a);
      }
    }
  }
  function Vs(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null && (l = l.dehydrated, l !== null)))) try {
      Me(l);
    } catch (a) {
      rl(t, t.return, a);
    }
  }
  function Rr(l) {
    switch (l.tag) {
      case 31:
      case 13:
      case 19:
        var t = l.stateNode;
        return t === null && (t = l.stateNode = new Gs()), t;
      case 22:
        return l = l.stateNode, t = l._retryCache, t === null && (t = l._retryCache = new Gs()), t;
      default:
        throw Error(s(435, l.tag));
    }
  }
  function mn(l, t) {
    var a = Rr(l);
    t.forEach(function(e) {
      if (!a.has(e)) {
        a.add(e);
        var u = Lr.bind(null, l, e);
        e.then(u, u);
      }
    });
  }
  function lt(l, t) {
    var a = t.deletions;
    if (a !== null) for (var e = 0; e < a.length; e++) {
      var u = a[e], n = l, i = t, c = i;
      l: for (; c !== null; ) {
        switch (c.tag) {
          case 27:
            if (ha(c.type)) {
              pl = c.stateNode, Pl = !1;
              break l;
            }
            break;
          case 5:
            pl = c.stateNode, Pl = !1;
            break l;
          case 3:
          case 4:
            pl = c.stateNode.containerInfo, Pl = !0;
            break l;
        }
        c = c.return;
      }
      if (pl === null) throw Error(s(160));
      Zs(n, i, u), pl = null, Pl = !1, n = u.alternate, n !== null && (n.return = null), u.return = null;
    }
    if (t.subtreeFlags & 13886) for (t = t.child; t !== null; ) Ks(t, l), t = t.sibling;
  }
  var At = null;
  function Ks(l, t) {
    var a = l.alternate, e = l.flags;
    switch (l.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        lt(t, l), tt(l), e & 4 && (fa(3, l, l.return), au(3, l), fa(5, l, l.return));
        break;
      case 1:
        lt(t, l), tt(l), e & 512 && (Bl || a === null || jt(a, a.return)), e & 64 && Vt && (l = l.updateQueue, l !== null && (e = l.callbacks, e !== null && (a = l.shared.hiddenCallbacks, l.shared.hiddenCallbacks = a === null ? e : a.concat(e))));
        break;
      case 26:
        var u = At;
        if (lt(t, l), tt(l), e & 512 && (Bl || a === null || jt(a, a.return)), e & 4) {
          var n = a !== null ? a.memoizedState : null;
          if (e = l.memoizedState, a === null) if (e === null) if (l.stateNode === null) {
            l: {
              e = l.type, a = l.memoizedProps, u = u.ownerDocument || u;
              t: switch (e) {
                case "title":
                  n = u.getElementsByTagName("title")[0], (!n || n[je] || n[Ql] || n.namespaceURI === "http://www.w3.org/2000/svg" || n.hasAttribute("itemprop")) && (n = u.createElement(e), u.head.insertBefore(n, u.querySelector("head > title"))), Kl(n, e, a), n[Ql] = l, Gl(n), e = n;
                  break l;
                case "link":
                  var i = Jd("link", "href", u).get(e + (a.href || ""));
                  if (i) {
                    for (var c = 0; c < i.length; c++) if (n = i[c], n.getAttribute("href") === (a.href == null || a.href === "" ? null : a.href) && n.getAttribute("rel") === (a.rel == null ? null : a.rel) && n.getAttribute("title") === (a.title == null ? null : a.title) && n.getAttribute("crossorigin") === (a.crossOrigin == null ? null : a.crossOrigin)) {
                      i.splice(c, 1);
                      break t;
                    }
                  }
                  n = u.createElement(e), Kl(n, e, a), u.head.appendChild(n);
                  break;
                case "meta":
                  if (i = Jd("meta", "content", u).get(e + (a.content || ""))) {
                    for (c = 0; c < i.length; c++) if (n = i[c], n.getAttribute("content") === (a.content == null ? null : "" + a.content) && n.getAttribute("name") === (a.name == null ? null : a.name) && n.getAttribute("property") === (a.property == null ? null : a.property) && n.getAttribute("http-equiv") === (a.httpEquiv == null ? null : a.httpEquiv) && n.getAttribute("charset") === (a.charSet == null ? null : a.charSet)) {
                      i.splice(c, 1);
                      break t;
                    }
                  }
                  n = u.createElement(e), Kl(n, e, a), u.head.appendChild(n);
                  break;
                default:
                  throw Error(s(468, e));
              }
              n[Ql] = l, Gl(n), e = n;
            }
            l.stateNode = e;
          } else wd(u, l.type, l.stateNode);
          else l.stateNode = Kd(u, e, l.memoizedProps);
          else n !== e ? (n === null ? a.stateNode !== null && (a = a.stateNode, a.parentNode.removeChild(a)) : n.count--, e === null ? wd(u, l.type, l.stateNode) : Kd(u, e, l.memoizedProps)) : e === null && l.stateNode !== null && gc(l, l.memoizedProps, a.memoizedProps);
        }
        break;
      case 27:
        lt(t, l), tt(l), e & 512 && (Bl || a === null || jt(a, a.return)), a !== null && e & 4 && gc(l, l.memoizedProps, a.memoizedProps);
        break;
      case 5:
        if (lt(t, l), tt(l), e & 512 && (Bl || a === null || jt(a, a.return)), l.flags & 32) {
          u = l.stateNode;
          try {
            ka(u, "");
          } catch (q) {
            rl(l, l.return, q);
          }
        }
        e & 4 && l.stateNode != null && (u = l.memoizedProps, gc(l, u, a !== null ? a.memoizedProps : u)), e & 1024 && (_c = !0);
        break;
      case 6:
        if (lt(t, l), tt(l), e & 4) {
          if (l.stateNode === null) throw Error(s(162));
          e = l.memoizedProps, a = l.stateNode;
          try {
            a.nodeValue = e;
          } catch (q) {
            rl(l, l.return, q);
          }
        }
        break;
      case 3:
        if (jn = null, u = At, At = On(t.containerInfo), lt(t, l), At = u, tt(l), e & 4 && a !== null && a.memoizedState.isDehydrated) try {
          Me(t.containerInfo);
        } catch (q) {
          rl(l, l.return, q);
        }
        _c && (_c = !1, Js(l));
        break;
      case 4:
        e = At, At = On(l.stateNode.containerInfo), lt(t, l), tt(l), At = e;
        break;
      case 12:
        lt(t, l), tt(l);
        break;
      case 31:
        lt(t, l), tt(l), e & 4 && (e = l.updateQueue, e !== null && (l.updateQueue = null, mn(l, e)));
        break;
      case 13:
        lt(t, l), tt(l), l.child.flags & 8192 && l.memoizedState !== null != (a !== null && a.memoizedState !== null) && (yn = nt()), e & 4 && (e = l.updateQueue, e !== null && (l.updateQueue = null, mn(l, e)));
        break;
      case 22:
        u = l.memoizedState !== null;
        var d = a !== null && a.memoizedState !== null, g = Vt, E = Bl;
        if (Vt = g || u, Bl = E || d, lt(t, l), Bl = E, Vt = g, tt(l), e & 8192) l: for (t = l.stateNode, t._visibility = u ? t._visibility & -2 : t._visibility | 1, u && (a === null || d || Vt || Bl || Xa(l)), a = null, t = l; ; ) {
          if (t.tag === 5 || t.tag === 26) {
            if (a === null) {
              d = a = t;
              try {
                if (n = d.stateNode, u) i = n.style, typeof i.setProperty == "function" ? i.setProperty("display", "none", "important") : i.display = "none";
                else {
                  c = d.stateNode;
                  var A = d.memoizedProps.style, b = A != null && A.hasOwnProperty("display") ? A.display : null;
                  c.style.display = b == null || typeof b == "boolean" ? "" : ("" + b).trim();
                }
              } catch (q) {
                rl(d, d.return, q);
              }
            }
          } else if (t.tag === 6) {
            if (a === null) {
              d = t;
              try {
                d.stateNode.nodeValue = u ? "" : d.memoizedProps;
              } catch (q) {
                rl(d, d.return, q);
              }
            }
          } else if (t.tag === 18) {
            if (a === null) {
              d = t;
              try {
                var S = d.stateNode;
                u ? Bd(S, !0) : Bd(d.stateNode, !1);
              } catch (q) {
                rl(d, d.return, q);
              }
            }
          } else if ((t.tag !== 22 && t.tag !== 23 || t.memoizedState === null || t === l) && t.child !== null) {
            t.child.return = t, t = t.child;
            continue;
          }
          if (t === l) break l;
          for (; t.sibling === null; ) {
            if (t.return === null || t.return === l) break l;
            a === t && (a = null), t = t.return;
          }
          a === t && (a = null), t.sibling.return = t.return, t = t.sibling;
        }
        e & 4 && (e = l.updateQueue, e !== null && (a = e.retryQueue, a !== null && (e.retryQueue = null, mn(l, a))));
        break;
      case 19:
        lt(t, l), tt(l), e & 4 && (e = l.updateQueue, e !== null && (l.updateQueue = null, mn(l, e)));
        break;
      case 30:
        break;
      case 21:
        break;
      default:
        lt(t, l), tt(l);
    }
  }
  function tt(l) {
    var t = l.flags;
    if (t & 2) {
      try {
        for (var a, e = l.return; e !== null; ) {
          if (Ys(e)) {
            a = e;
            break;
          }
          e = e.return;
        }
        if (a == null) throw Error(s(160));
        switch (a.tag) {
          case 27:
            var u = a.stateNode;
            on(l, bc(l), u);
            break;
          case 5:
            var n = a.stateNode;
            a.flags & 32 && (ka(n, ""), a.flags &= -33), on(l, bc(l), n);
            break;
          case 3:
          case 4:
            var i = a.stateNode.containerInfo;
            Sc(l, bc(l), i);
            break;
          default:
            throw Error(s(161));
        }
      } catch (c) {
        rl(l, l.return, c);
      }
      l.flags &= -3;
    }
    t & 4096 && (l.flags &= -4097);
  }
  function Js(l) {
    if (l.subtreeFlags & 1024) for (l = l.child; l !== null; ) {
      var t = l;
      Js(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), l = l.sibling;
    }
  }
  function Jt(l, t) {
    if (t.subtreeFlags & 8772) for (t = t.child; t !== null; ) Xs(l, t.alternate, t), t = t.sibling;
  }
  function Xa(l) {
    for (l = l.child; l !== null; ) {
      var t = l;
      switch (t.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          fa(4, t, t.return), Xa(t);
          break;
        case 1:
          jt(t, t.return);
          var a = t.stateNode;
          typeof a.componentWillUnmount == "function" && Cs(t, t.return, a), Xa(t);
          break;
        case 27:
          ru(t.stateNode);
        case 26:
        case 5:
          jt(t, t.return), Xa(t);
          break;
        case 22:
          t.memoizedState === null && Xa(t);
          break;
        case 30:
          Xa(t);
          break;
        default:
          Xa(t);
      }
      l = l.sibling;
    }
  }
  function wt(l, t, a) {
    for (a = a && (t.subtreeFlags & 8772) !== 0, t = t.child; t !== null; ) {
      var e = t.alternate, u = l, n = t, i = n.flags;
      switch (n.tag) {
        case 0:
        case 11:
        case 15:
          wt(u, n, a), au(4, n);
          break;
        case 1:
          if (wt(u, n, a), e = n, u = e.stateNode, typeof u.componentDidMount == "function") try {
            u.componentDidMount();
          } catch (g) {
            rl(e, e.return, g);
          }
          if (e = n, u = e.updateQueue, u !== null) {
            var c = e.stateNode;
            try {
              var d = u.shared.hiddenCallbacks;
              if (d !== null) for (u.shared.hiddenCallbacks = null, u = 0; u < d.length; u++) A0(d[u], c);
            } catch (g) {
              rl(e, e.return, g);
            }
          }
          a && i & 64 && Rs(n), eu(n, n.return);
          break;
        case 27:
          qs(n);
        case 26:
        case 5:
          wt(u, n, a), a && e === null && i & 4 && Bs(n), eu(n, n.return);
          break;
        case 12:
          wt(u, n, a);
          break;
        case 31:
          wt(u, n, a), a && i & 4 && Ls(u, n);
          break;
        case 13:
          wt(u, n, a), a && i & 4 && Vs(u, n);
          break;
        case 22:
          n.memoizedState === null && wt(u, n, a), eu(n, n.return);
          break;
        case 30:
          break;
        default:
          wt(u, n, a);
      }
      t = t.sibling;
    }
  }
  function zc(l, t) {
    var a = null;
    l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), l = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (l = t.memoizedState.cachePool.pool), l !== a && (l != null && l.refCount++, a != null && Le(a));
  }
  function pc(l, t) {
    l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Le(l));
  }
  function Nt(l, t, a, e) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) ws(l, t, a, e), t = t.sibling;
  }
  function ws(l, t, a, e) {
    var u = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        Nt(l, t, a, e), u & 2048 && au(9, t);
        break;
      case 1:
        Nt(l, t, a, e);
        break;
      case 3:
        Nt(l, t, a, e), u & 2048 && (l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Le(l)));
        break;
      case 12:
        if (u & 2048) {
          Nt(l, t, a, e), l = t.stateNode;
          try {
            var n = t.memoizedProps, i = n.id, c = n.onPostCommit;
            typeof c == "function" && c(i, t.alternate === null ? "mount" : "update", l.passiveEffectDuration, -0);
          } catch (d) {
            rl(t, t.return, d);
          }
        } else Nt(l, t, a, e);
        break;
      case 31:
        Nt(l, t, a, e);
        break;
      case 13:
        Nt(l, t, a, e);
        break;
      case 23:
        break;
      case 22:
        n = t.stateNode, i = t.alternate, t.memoizedState !== null ? n._visibility & 2 ? Nt(l, t, a, e) : uu(l, t) : n._visibility & 2 ? Nt(l, t, a, e) : (n._visibility |= 2, me(l, t, a, e, (t.subtreeFlags & 10256) !== 0 || !1)), u & 2048 && zc(i, t);
        break;
      case 24:
        Nt(l, t, a, e), u & 2048 && pc(t.alternate, t);
        break;
      default:
        Nt(l, t, a, e);
    }
  }
  function me(l, t, a, e, u) {
    for (u = u && ((t.subtreeFlags & 10256) !== 0 || !1), t = t.child; t !== null; ) {
      var n = l, i = t, c = a, d = e, g = i.flags;
      switch (i.tag) {
        case 0:
        case 11:
        case 15:
          me(n, i, c, d, u), au(8, i);
          break;
        case 23:
          break;
        case 22:
          var E = i.stateNode;
          i.memoizedState !== null ? E._visibility & 2 ? me(n, i, c, d, u) : uu(n, i) : (E._visibility |= 2, me(n, i, c, d, u)), u && g & 2048 && zc(i.alternate, i);
          break;
        case 24:
          me(n, i, c, d, u), u && g & 2048 && pc(i.alternate, i);
          break;
        default:
          me(n, i, c, d, u);
      }
      t = t.sibling;
    }
  }
  function uu(l, t) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) {
      var a = l, e = t, u = e.flags;
      switch (e.tag) {
        case 22:
          uu(a, e), u & 2048 && zc(e.alternate, e);
          break;
        case 24:
          uu(a, e), u & 2048 && pc(e.alternate, e);
          break;
        default:
          uu(a, e);
      }
      t = t.sibling;
    }
  }
  var nu = 8192;
  function he(l, t, a) {
    if (l.subtreeFlags & nu) for (l = l.child; l !== null; ) ks(l, t, a), l = l.sibling;
  }
  function ks(l, t, a) {
    switch (l.tag) {
      case 26:
        he(l, t, a), l.flags & nu && l.memoizedState !== null && So(a, At, l.memoizedState, l.memoizedProps);
        break;
      case 5:
        he(l, t, a);
        break;
      case 3:
      case 4:
        var e = At;
        At = On(l.stateNode.containerInfo), he(l, t, a), At = e;
        break;
      case 22:
        l.memoizedState === null && (e = l.alternate, e !== null && e.memoizedState !== null ? (e = nu, nu = 16777216, he(l, t, a), nu = e) : he(l, t, a));
        break;
      default:
        he(l, t, a);
    }
  }
  function Ws(l) {
    var t = l.alternate;
    if (t !== null && (l = t.child, l !== null)) {
      t.child = null;
      do
        t = l.sibling, l.sibling = null, l = t;
      while (l !== null);
    }
  }
  function iu(l) {
    var t = l.deletions;
    if ((l.flags & 16) !== 0) {
      if (t !== null) for (var a = 0; a < t.length; a++) {
        var e = t[a];
        Xl = e, Fs(e, l);
      }
      Ws(l);
    }
    if (l.subtreeFlags & 10256) for (l = l.child; l !== null; ) $s(l), l = l.sibling;
  }
  function $s(l) {
    switch (l.tag) {
      case 0:
      case 11:
      case 15:
        iu(l), l.flags & 2048 && fa(9, l, l.return);
        break;
      case 3:
        iu(l);
        break;
      case 12:
        iu(l);
        break;
      case 22:
        var t = l.stateNode;
        l.memoizedState !== null && t._visibility & 2 && (l.return === null || l.return.tag !== 13) ? (t._visibility &= -3, hn(l)) : iu(l);
        break;
      default:
        iu(l);
    }
  }
  function hn(l) {
    var t = l.deletions;
    if ((l.flags & 16) !== 0) {
      if (t !== null) for (var a = 0; a < t.length; a++) {
        var e = t[a];
        Xl = e, Fs(e, l);
      }
      Ws(l);
    }
    for (l = l.child; l !== null; ) {
      switch (t = l, t.tag) {
        case 0:
        case 11:
        case 15:
          fa(8, t, t.return), hn(t);
          break;
        case 22:
          a = t.stateNode, a._visibility & 2 && (a._visibility &= -3, hn(t));
          break;
        default:
          hn(t);
      }
      l = l.sibling;
    }
  }
  function Fs(l, t) {
    for (; Xl !== null; ) {
      var a = Xl;
      switch (a.tag) {
        case 0:
        case 11:
        case 15:
          fa(8, a, t);
          break;
        case 23:
        case 22:
          if (a.memoizedState !== null && a.memoizedState.cachePool !== null) {
            var e = a.memoizedState.cachePool.pool;
            e != null && e.refCount++;
          }
          break;
        case 24:
          Le(a.memoizedState.cache);
      }
      if (e = a.child, e !== null) e.return = a, Xl = e;
      else l: for (a = l; Xl !== null; ) {
        e = Xl;
        var u = e.sibling, n = e.return;
        if (Qs(e), e === a) {
          Xl = null;
          break l;
        }
        if (u !== null) {
          u.return = n, Xl = u;
          break l;
        }
        Xl = n;
      }
    }
  }
  var Cr = {
    getCacheForType: function(l) {
      var t = Ll(xl), a = t.data.get(l);
      return a === void 0 && (a = l(), t.data.set(l, a)), a;
    },
    cacheSignal: function() {
      return Ll(xl).controller.signal;
    }
  }, Br = typeof WeakMap == "function" ? WeakMap : Map, sl = 0, yl = null, P = null, al = 0, vl = 0, rt = null, sa = !1, ye = !1, Ec = !1, kt = 0, Nl = 0, da = 0, Qa = 0, Tc = 0, ot = 0, ge = 0, cu = null, at = null, Mc = !1, yn = 0, Is = 0, gn = 1 / 0, bn = null, va = null, Yl = 0, ra = null, be = null, Wt = 0, Ac = 0, Nc = null, Ps = null, fu = 0, Oc = null;
  function pt() {
    return (sl & 2) !== 0 && al !== 0 ? al & -al : D.T !== null ? Rc() : bf();
  }
  function ld() {
    if (ot === 0) if ((al & 536870912) === 0 || nl) {
      var l = Tu;
      Tu <<= 1, (Tu & 3932160) === 0 && (Tu = 262144), ot = l;
    } else ot = 536870912;
    return l = dt.current, l !== null && (l.flags |= 32), ot;
  }
  function et(l, t, a) {
    (l === yl && (vl === 2 || vl === 9) || l.cancelPendingCommit !== null) && (Se(l, 0), oa(l, al, ot, !1)), Nu(l, a), ((sl & 2) === 0 || l !== yl) && (l === yl && ((sl & 2) === 0 && (Qa |= a), Nl === 4 && oa(l, al, ot, !1)), $t(l));
  }
  function td(l, t, a) {
    if ((sl & 6) !== 0) throw Error(s(327));
    var e = !a && (t & 127) === 0 && (t & l.expiredLanes) === 0 || Oe(l, t), u = e ? Gr(l, t) : jc(l, t, !0), n = e;
    do {
      if (u === 0) {
        ye && !e && oa(l, t, 0, !1);
        break;
      } else {
        if (a = l.current.alternate, n && !Yr(a)) {
          u = jc(l, t, !1), n = !1;
          continue;
        }
        if (u === 2) {
          if (n = t, l.errorRecoveryDisabledLanes & n) var i = 0;
          else i = l.pendingLanes & -536870913, i = i !== 0 ? i : i & 536870912 ? 536870912 : 0;
          if (i !== 0) {
            t = i;
            l: {
              var c = l;
              u = cu;
              var d = c.current.memoizedState.isDehydrated;
              if (d && (Se(c, i).flags |= 256), i = jc(c, i, !1), i !== 2) {
                if (Ec && !d) {
                  c.errorRecoveryDisabledLanes |= n, Qa |= n, u = 4;
                  break l;
                }
                n = at, at = u, n !== null && (at === null ? at = n : at.push.apply(at, n));
              }
              u = i;
            }
            if (n = !1, u !== 2) continue;
          }
        }
        if (u === 1) {
          Se(l, 0), oa(l, t, 0, !0);
          break;
        }
        l: {
          switch (e = l, n = u, n) {
            case 0:
            case 1:
              throw Error(s(345));
            case 4:
              if ((t & 4194048) !== t) break;
            case 6:
              oa(e, t, ot, !sa);
              break l;
            case 2:
              at = null;
              break;
            case 3:
            case 5:
              break;
            default:
              throw Error(s(329));
          }
          if ((t & 62914560) === t && (u = yn + 300 - nt(), 10 < u)) {
            if (oa(e, t, ot, !sa), Au(e, 0, !0) !== 0) break l;
            Wt = t, e.timeoutHandle = xd(ad.bind(null, e, a, at, bn, Mc, t, ot, Qa, ge, sa, n, "Throttled", -0, 0), u);
            break l;
          }
          ad(e, a, at, bn, Mc, t, ot, Qa, ge, sa, n, null, -0, 0);
        }
      }
      break;
    } while (!0);
    $t(l);
  }
  function ad(l, t, a, e, u, n, i, c, d, g, E, A, b, S) {
    if (l.timeoutHandle = -1, A = t.subtreeFlags, A & 8192 || (A & 16785408) === 16785408) {
      A = {
        stylesheets: null,
        count: 0,
        imgCount: 0,
        imgBytes: 0,
        suspenseyImages: [],
        waitingForImages: !0,
        waitingForViewTransition: !1,
        unsuspend: Rt
      }, ks(t, n, A);
      var q = (n & 62914560) === n ? yn - nt() : (n & 4194048) === n ? Is - nt() : 0;
      if (q = _o(A, q), q !== null) {
        Wt = n, l.cancelPendingCommit = q(dd.bind(null, l, t, n, a, e, u, i, c, d, E, A, null, b, S)), oa(l, n, i, !g);
        return;
      }
    }
    dd(l, t, n, a, e, u, i, c, d);
  }
  function Yr(l) {
    for (var t = l; ; ) {
      var a = t.tag;
      if ((a === 0 || a === 11 || a === 15) && t.flags & 16384 && (a = t.updateQueue, a !== null && (a = a.stores, a !== null))) for (var e = 0; e < a.length; e++) {
        var u = a[e], n = u.getSnapshot;
        u = u.value;
        try {
          if (!ft(n(), u)) return !1;
        } catch {
          return !1;
        }
      }
      if (a = t.child, t.subtreeFlags & 16384 && a !== null) a.return = t, t = a;
      else {
        if (t === l) break;
        for (; t.sibling === null; ) {
          if (t.return === null || t.return === l) return !0;
          t = t.return;
        }
        t.sibling.return = t.return, t = t.sibling;
      }
    }
    return !0;
  }
  function oa(l, t, a, e) {
    t &= ~Tc, t &= ~Qa, l.suspendedLanes |= t, l.pingedLanes &= ~t, e && (l.warmLanes |= t), e = l.expirationTimes;
    for (var u = t; 0 < u; ) {
      var n = 31 - ct(u), i = 1 << n;
      e[n] = -1, u &= ~i;
    }
    a !== 0 && mf(l, a, t);
  }
  function Sn() {
    return (sl & 6) === 0 ? (su(0, !1), !1) : !0;
  }
  function Dc() {
    if (P !== null) {
      if (vl === 0) var l = P.return;
      else l = P, qt = ja = null, Ki(l), se = null, Ke = 0, l = P;
      for (; l !== null; ) xs(l.alternate, l), l = l.return;
      P = null;
    }
  }
  function Se(l, t) {
    var a = l.timeoutHandle;
    a !== -1 && (l.timeoutHandle = -1, to(a)), a = l.cancelPendingCommit, a !== null && (l.cancelPendingCommit = null, a()), Wt = 0, Dc(), yl = l, P = a = Bt(l.current, null), al = t, vl = 0, rt = null, sa = !1, ye = Oe(l, t), Ec = !1, ge = ot = Tc = Qa = da = Nl = 0, at = cu = null, Mc = !1, (t & 8) !== 0 && (t |= t & 32);
    var e = l.entangledLanes;
    if (e !== 0) for (l = l.entanglements, e &= t; 0 < e; ) {
      var u = 31 - ct(e), n = 1 << u;
      t |= l[u], e &= ~n;
    }
    return kt = t, Gu(), a;
  }
  function ed(l, t) {
    k = null, D.H = Pe, t === fe || t === wu ? (t = p0(), vl = 3) : t === xi ? (t = p0(), vl = 4) : vl = t === cc ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, rt = t, P === null && (Nl = 1, fn(l, gt(t, l.current)));
  }
  function ud() {
    var l = dt.current;
    return l === null ? !0 : (al & 4194048) === al ? zt === null : (al & 62914560) === al || (al & 536870912) !== 0 ? l === zt : !1;
  }
  function nd() {
    var l = D.H;
    return D.H = Pe, l === null ? Pe : l;
  }
  function id() {
    var l = D.A;
    return D.A = Cr, l;
  }
  function _n() {
    Nl = 4, sa || (al & 4194048) !== al && dt.current !== null || (ye = !0), (da & 134217727) === 0 && (Qa & 134217727) === 0 || yl === null || oa(yl, al, ot, !1);
  }
  function jc(l, t, a) {
    var e = sl;
    sl |= 2;
    var u = nd(), n = id();
    (yl !== l || al !== t) && (bn = null, Se(l, t)), t = !1;
    var i = Nl;
    l: do
      try {
        if (vl !== 0 && P !== null) {
          var c = P, d = rt;
          switch (vl) {
            case 8:
              Dc(), i = 6;
              break l;
            case 3:
            case 2:
            case 9:
            case 6:
              dt.current === null && (t = !0);
              var g = vl;
              if (vl = 0, rt = null, _e(l, c, d, g), a && ye) {
                i = 0;
                break l;
              }
              break;
            default:
              g = vl, vl = 0, rt = null, _e(l, c, d, g);
          }
        }
        qr(), i = Nl;
        break;
      } catch (E) {
        ed(l, E);
      }
    while (!0);
    return t && l.shellSuspendCounter++, qt = ja = null, sl = e, D.H = u, D.A = n, P === null && (yl = null, al = 0, Gu()), i;
  }
  function qr() {
    for (; P !== null; ) cd(P);
  }
  function Gr(l, t) {
    var a = sl;
    sl |= 2;
    var e = nd(), u = id();
    yl !== l || al !== t ? (bn = null, gn = nt() + 500, Se(l, t)) : ye = Oe(l, t);
    l: do
      try {
        if (vl !== 0 && P !== null) {
          t = P;
          var n = rt;
          t: switch (vl) {
            case 1:
              vl = 0, rt = null, _e(l, t, n, 1);
              break;
            case 2:
            case 9:
              if (_0(n)) {
                vl = 0, rt = null, fd(t);
                break;
              }
              t = function() {
                vl !== 2 && vl !== 9 || yl !== l || (vl = 7), $t(l);
              }, n.then(t, t);
              break l;
            case 3:
              vl = 7;
              break l;
            case 4:
              vl = 5;
              break l;
            case 7:
              _0(n) ? (vl = 0, rt = null, fd(t)) : (vl = 0, rt = null, _e(l, t, n, 7));
              break;
            case 5:
              var i = null;
              switch (P.tag) {
                case 26:
                  i = P.memoizedState;
                case 5:
                case 27:
                  var c = P;
                  if (i ? kd(i) : c.stateNode.complete) {
                    vl = 0, rt = null;
                    var d = c.sibling;
                    if (d !== null) P = d;
                    else {
                      var g = c.return;
                      g !== null ? (P = g, zn(g)) : P = null;
                    }
                    break t;
                  }
              }
              vl = 0, rt = null, _e(l, t, n, 5);
              break;
            case 6:
              vl = 0, rt = null, _e(l, t, n, 6);
              break;
            case 8:
              Dc(), Nl = 6;
              break l;
            default:
              throw Error(s(462));
          }
        }
        Xr();
        break;
      } catch (E) {
        ed(l, E);
      }
    while (!0);
    return qt = ja = null, D.H = e, D.A = u, sl = a, P !== null ? 0 : (yl = null, al = 0, Gu(), Nl);
  }
  function Xr() {
    for (; P !== null && !gv(); ) cd(P);
  }
  function cd(l) {
    var t = Us(l.alternate, l, kt);
    l.memoizedProps = l.pendingProps, t === null ? zn(l) : P = t;
  }
  function fd(l) {
    var t = l, a = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = Ms(a, t, t.pendingProps, t.type, void 0, al);
        break;
      case 11:
        t = Ms(a, t, t.pendingProps, t.type.render, t.ref, al);
        break;
      case 5:
        Ki(t);
      default:
        xs(a, t), t = P = s0(t, kt), t = Us(a, t, kt);
    }
    l.memoizedProps = l.pendingProps, t === null ? zn(l) : P = t;
  }
  function _e(l, t, a, e) {
    qt = ja = null, Ki(t), se = null, Ke = 0;
    var u = t.return;
    try {
      if (Or(l, u, t, a, al)) {
        Nl = 1, fn(l, gt(a, l.current)), P = null;
        return;
      }
    } catch (n) {
      if (u !== null) throw P = u, n;
      Nl = 1, fn(l, gt(a, l.current)), P = null;
      return;
    }
    t.flags & 32768 ? (nl || e === 1 ? l = !0 : ye || (al & 536870912) !== 0 ? l = !1 : (sa = l = !0, (e === 2 || e === 9 || e === 3 || e === 6) && (e = dt.current, e !== null && e.tag === 13 && (e.flags |= 16384))), sd(t, l)) : zn(t);
  }
  function zn(l) {
    var t = l;
    do {
      if ((t.flags & 32768) !== 0) {
        sd(t, sa);
        return;
      }
      l = t.return;
      var a = Ur(t.alternate, t, kt);
      if (a !== null) {
        P = a;
        return;
      }
      if (t = t.sibling, t !== null) {
        P = t;
        return;
      }
      P = t = l;
    } while (t !== null);
    Nl === 0 && (Nl = 5);
  }
  function sd(l, t) {
    do {
      var a = Hr(l.alternate, l);
      if (a !== null) {
        a.flags &= 32767, P = a;
        return;
      }
      if (a = l.return, a !== null && (a.flags |= 32768, a.subtreeFlags = 0, a.deletions = null), !t && (l = l.sibling, l !== null)) {
        P = l;
        return;
      }
      P = l = a;
    } while (l !== null);
    Nl = 6, P = null;
  }
  function dd(l, t, a, e, u, n, i, c, d) {
    l.cancelPendingCommit = null;
    do
      pn();
    while (Yl !== 0);
    if ((sl & 6) !== 0) throw Error(s(327));
    if (t !== null) {
      if (t === l.current) throw Error(s(177));
      if (n = t.lanes | t.childLanes, n |= bi, Nv(l, a, n, i, c, d), l === yl && (P = yl = null, al = 0), be = t, ra = l, Wt = a, Ac = n, Nc = u, Ps = e, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (l.callbackNode = null, l.callbackPriority = 0, Vr(pu, function() {
        return hd(), null;
      })) : (l.callbackNode = null, l.callbackPriority = 0), e = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || e) {
        e = D.T, D.T = null, u = B.p, B.p = 2, i = sl, sl |= 4;
        try {
          xr(l, t, a);
        } finally {
          sl = i, B.p = u, D.T = e;
        }
      }
      Yl = 1, vd(), rd(), od();
    }
  }
  function vd() {
    if (Yl === 1) {
      Yl = 0;
      var l = ra, t = be, a = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || a) {
        a = D.T, D.T = null;
        var e = B.p;
        B.p = 2;
        var u = sl;
        sl |= 4;
        try {
          Ks(t, l);
          var n = Qc, i = l0(l.containerInfo), c = n.focusedElem, d = n.selectionRange;
          if (i !== c && c && c.ownerDocument && Pf(c.ownerDocument.documentElement, c)) {
            if (d !== null && oi(c)) {
              var g = d.start, E = d.end;
              if (E === void 0 && (E = g), "selectionStart" in c) c.selectionStart = g, c.selectionEnd = Math.min(E, c.value.length);
              else {
                var A = c.ownerDocument || document, b = A && A.defaultView || window;
                if (b.getSelection) {
                  var S = b.getSelection(), q = c.textContent.length, w = Math.min(d.start, q), hl = d.end === void 0 ? w : Math.min(d.end, q);
                  !S.extend && w > hl && (i = hl, hl = w, w = i);
                  var h = If(c, w), v = If(c, hl);
                  if (h && v && (S.rangeCount !== 1 || S.anchorNode !== h.node || S.anchorOffset !== h.offset || S.focusNode !== v.node || S.focusOffset !== v.offset)) {
                    var y = A.createRange();
                    y.setStart(h.node, h.offset), S.removeAllRanges(), w > hl ? (S.addRange(y), S.extend(v.node, v.offset)) : (y.setEnd(v.node, v.offset), S.addRange(y));
                  }
                }
              }
            }
            for (A = [], S = c; S = S.parentNode; ) S.nodeType === 1 && A.push({
              element: S,
              left: S.scrollLeft,
              top: S.scrollTop
            });
            for (typeof c.focus == "function" && c.focus(), c = 0; c < A.length; c++) {
              var T = A[c];
              T.element.scrollLeft = T.left, T.element.scrollTop = T.top;
            }
          }
          Rn = !!Xc, Qc = Xc = null;
        } finally {
          sl = u, B.p = e, D.T = a;
        }
      }
      l.current = t, Yl = 2;
    }
  }
  function rd() {
    if (Yl === 2) {
      Yl = 0;
      var l = ra, t = be, a = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || a) {
        a = D.T, D.T = null;
        var e = B.p;
        B.p = 2;
        var u = sl;
        sl |= 4;
        try {
          Xs(l, t.alternate, t);
        } finally {
          sl = u, B.p = e, D.T = a;
        }
      }
      Yl = 3;
    }
  }
  function od() {
    if (Yl === 4 || Yl === 3) {
      Yl = 0, bv();
      var l = ra, t = be, a = Wt, e = Ps;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? Yl = 5 : (Yl = 0, be = ra = null, md(l, l.pendingLanes));
      var u = l.pendingLanes;
      if (u === 0 && (va = null), kn(a), t = t.stateNode, it && typeof it.onCommitFiberRoot == "function") try {
        it.onCommitFiberRoot(Ne, t, void 0, (t.current.flags & 128) === 128);
      } catch {
      }
      if (e !== null) {
        t = D.T, u = B.p, B.p = 2, D.T = null;
        try {
          for (var n = l.onRecoverableError, i = 0; i < e.length; i++) {
            var c = e[i];
            n(c.value, { componentStack: c.stack });
          }
        } finally {
          D.T = t, B.p = u;
        }
      }
      (Wt & 3) !== 0 && pn(), $t(l), u = l.pendingLanes, (a & 261930) !== 0 && (u & 42) !== 0 ? l === Oc ? fu++ : (fu = 0, Oc = l) : fu = 0, su(0, !1);
    }
  }
  function md(l, t) {
    (l.pooledCacheLanes &= t) === 0 && (t = l.pooledCache, t != null && (l.pooledCache = null, Le(t)));
  }
  function pn() {
    return vd(), rd(), od(), hd();
  }
  function hd() {
    if (Yl !== 5) return !1;
    var l = ra, t = Ac;
    Ac = 0;
    var a = kn(Wt), e = D.T, u = B.p;
    try {
      B.p = 32 > a ? 32 : a, D.T = null, a = Nc, Nc = null;
      var n = ra, i = Wt;
      if (Yl = 0, be = ra = null, Wt = 0, (sl & 6) !== 0) throw Error(s(331));
      var c = sl;
      if (sl |= 4, $s(n.current), ws(n, n.current, i, a), sl = c, su(0, !1), it && typeof it.onPostCommitFiberRoot == "function") try {
        it.onPostCommitFiberRoot(Ne, n);
      } catch {
      }
      return !0;
    } finally {
      B.p = u, D.T = e, md(l, t);
    }
  }
  function yd(l, t, a) {
    t = gt(a, t), t = ic(l.stateNode, t, 2), l = Ya(l, t, 2), l !== null && (Nu(l, 2), $t(l));
  }
  function rl(l, t, a) {
    if (l.tag === 3) yd(l, l, a);
    else for (; t !== null; ) {
      if (t.tag === 3) {
        yd(t, l, a);
        break;
      } else if (t.tag === 1) {
        var e = t.stateNode;
        if (typeof t.type.getDerivedStateFromError == "function" || typeof e.componentDidCatch == "function" && (va === null || !va.has(e))) {
          l = gt(a, l), a = gs(2), e = Ya(t, a, 2), e !== null && (bs(a, e, t, l), Nu(e, 2), $t(e));
          break;
        }
      }
      t = t.return;
    }
  }
  function Uc(l, t, a) {
    var e = l.pingCache;
    if (e === null) {
      e = l.pingCache = new Br();
      var u = /* @__PURE__ */ new Set();
      e.set(t, u);
    } else u = e.get(t), u === void 0 && (u = /* @__PURE__ */ new Set(), e.set(t, u));
    u.has(a) || (Ec = !0, u.add(a), l = Qr.bind(null, l, t, a), t.then(l, l));
  }
  function Qr(l, t, a) {
    var e = l.pingCache;
    e !== null && e.delete(t), l.pingedLanes |= l.suspendedLanes & a, l.warmLanes &= ~a, yl === l && (al & a) === a && (Nl === 4 || Nl === 3 && (al & 62914560) === al && 300 > nt() - yn ? (sl & 2) === 0 && Se(l, 0) : Tc |= a, ge === al && (ge = 0)), $t(l);
  }
  function gd(l, t) {
    t === 0 && (t = of()), l = Na(l, t), l !== null && (Nu(l, t), $t(l));
  }
  function Zr(l) {
    var t = l.memoizedState, a = 0;
    t !== null && (a = t.retryLane), gd(l, a);
  }
  function Lr(l, t) {
    var a = 0;
    switch (l.tag) {
      case 31:
      case 13:
        var e = l.stateNode, u = l.memoizedState;
        u !== null && (a = u.retryLane);
        break;
      case 19:
        e = l.stateNode;
        break;
      case 22:
        e = l.stateNode._retryCache;
        break;
      default:
        throw Error(s(314));
    }
    e !== null && e.delete(t), gd(l, a);
  }
  function Vr(l, t) {
    return Kn(l, t);
  }
  var En = null, ze = null, Hc = !1, Tn = !1, xc = !1, ma = 0;
  function $t(l) {
    l !== ze && l.next === null && (ze === null ? En = ze = l : ze = ze.next = l), Tn = !0, Hc || (Hc = !0, Jr());
  }
  function su(l, t) {
    if (!xc && Tn) {
      xc = !0;
      do
        for (var a = !1, e = En; e !== null; ) {
          if (!t) if (l !== 0) {
            var u = e.pendingLanes;
            if (u === 0) var n = 0;
            else {
              var i = e.suspendedLanes, c = e.pingedLanes;
              n = (1 << 31 - ct(42 | l) + 1) - 1, n &= u & ~(i & ~c), n = n & 201326741 ? n & 201326741 | 1 : n ? n | 2 : 0;
            }
            n !== 0 && (a = !0, zd(e, n));
          } else n = al, n = Au(e, e === yl ? n : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1), (n & 3) === 0 || Oe(e, n) || (a = !0, zd(e, n));
          e = e.next;
        }
      while (a);
      xc = !1;
    }
  }
  function Kr() {
    bd();
  }
  function bd() {
    Tn = Hc = !1;
    var l = 0;
    ma !== 0 && lo() && (l = ma);
    for (var t = nt(), a = null, e = En; e !== null; ) {
      var u = e.next, n = Sd(e, t);
      n === 0 ? (e.next = null, a === null ? En = u : a.next = u, u === null && (ze = a)) : (a = e, (l !== 0 || (n & 3) !== 0) && (Tn = !0)), e = u;
    }
    Yl !== 0 && Yl !== 5 || su(l, !1), ma !== 0 && (ma = 0);
  }
  function Sd(l, t) {
    for (var a = l.suspendedLanes, e = l.pingedLanes, u = l.expirationTimes, n = l.pendingLanes & -62914561; 0 < n; ) {
      var i = 31 - ct(n), c = 1 << i, d = u[i];
      d === -1 ? ((c & a) === 0 || (c & e) !== 0) && (u[i] = Av(c, t)) : d <= t && (l.expiredLanes |= c), n &= ~c;
    }
    if (t = yl, a = al, a = Au(l, l === t ? a : 0, l.cancelPendingCommit !== null || l.timeoutHandle !== -1), e = l.callbackNode, a === 0 || l === t && (vl === 2 || vl === 9) || l.cancelPendingCommit !== null) return e !== null && e !== null && Jn(e), l.callbackNode = null, l.callbackPriority = 0;
    if ((a & 3) === 0 || Oe(l, a)) {
      if (t = a & -a, t === l.callbackPriority) return t;
      switch (e !== null && Jn(e), kn(a)) {
        case 2:
        case 8:
          a = vf;
          break;
        case 32:
          a = pu;
          break;
        case 268435456:
          a = rf;
          break;
        default:
          a = pu;
      }
      return e = _d.bind(null, l), a = Kn(a, e), l.callbackPriority = t, l.callbackNode = a, t;
    }
    return e !== null && e !== null && Jn(e), l.callbackPriority = 2, l.callbackNode = null, 2;
  }
  function _d(l, t) {
    if (Yl !== 0 && Yl !== 5) return l.callbackNode = null, l.callbackPriority = 0, null;
    var a = l.callbackNode;
    if (pn() && l.callbackNode !== a) return null;
    var e = al;
    return e = Au(l, l === yl ? e : 0, l.cancelPendingCommit !== null || l.timeoutHandle !== -1), e === 0 ? null : (td(l, e, t), Sd(l, nt()), l.callbackNode != null && l.callbackNode === a ? _d.bind(null, l) : null);
  }
  function zd(l, t) {
    if (pn()) return null;
    td(l, t, !0);
  }
  function Jr() {
    ao(function() {
      (sl & 6) !== 0 ? Kn(df, Kr) : bd();
    });
  }
  function Rc() {
    if (ma === 0) {
      var l = ie;
      l === 0 && (l = Eu, Eu <<= 1, (Eu & 261888) === 0 && (Eu = 256)), ma = l;
    }
    return ma;
  }
  function pd(l) {
    return l == null || typeof l == "symbol" || typeof l == "boolean" ? null : typeof l == "function" ? l : Uu("" + l);
  }
  function Ed(l, t) {
    var a = t.ownerDocument.createElement("input");
    return a.name = t.name, a.value = t.value, l.id && a.setAttribute("form", l.id), t.parentNode.insertBefore(a, t), l = new FormData(l), a.parentNode.removeChild(a), l;
  }
  function wr(l, t, a, e, u) {
    if (t === "submit" && a && a.stateNode === u) {
      var n = pd((u[Fl] || null).action), i = e.submitter;
      i && (t = (t = i[Fl] || null) ? pd(t.formAction) : i.getAttribute("formAction"), t !== null && (n = t, i = null));
      var c = new Cu("action", "action", null, e, u);
      l.push({
        event: c,
        listeners: [{
          instance: null,
          listener: function() {
            if (e.defaultPrevented) {
              if (ma !== 0) {
                var d = i ? Ed(u, i) : new FormData(u);
                lc(a, {
                  pending: !0,
                  data: d,
                  method: u.method,
                  action: n
                }, null, d);
              }
            } else typeof n == "function" && (c.preventDefault(), d = i ? Ed(u, i) : new FormData(u), lc(a, {
              pending: !0,
              data: d,
              method: u.method,
              action: n
            }, n, d));
          },
          currentTarget: u
        }]
      });
    }
  }
  for (var Cc = 0; Cc < gi.length; Cc++) {
    var Bc = gi[Cc];
    Mt(Bc.toLowerCase(), "on" + (Bc[0].toUpperCase() + Bc.slice(1)));
  }
  Mt(e0, "onAnimationEnd"), Mt(u0, "onAnimationIteration"), Mt(n0, "onAnimationStart"), Mt("dblclick", "onDoubleClick"), Mt("focusin", "onFocus"), Mt("focusout", "onBlur"), Mt(fr, "onTransitionRun"), Mt(sr, "onTransitionStart"), Mt(dr, "onTransitionCancel"), Mt(i0, "onTransitionEnd"), Ja("onMouseEnter", ["mouseout", "mouseover"]), Ja("onMouseLeave", ["mouseout", "mouseover"]), Ja("onPointerEnter", ["pointerout", "pointerover"]), Ja("onPointerLeave", ["pointerout", "pointerover"]), Ea("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" ")), Ea("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")), Ea("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]), Ea("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" ")), Ea("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" ")), Ea("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
  var du = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), kr = new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(du));
  function Td(l, t) {
    t = (t & 4) !== 0;
    for (var a = 0; a < l.length; a++) {
      var e = l[a], u = e.event;
      e = e.listeners;
      l: {
        var n = void 0;
        if (t) for (var i = e.length - 1; 0 <= i; i--) {
          var c = e[i], d = c.instance, g = c.currentTarget;
          if (c = c.listener, d !== n && u.isPropagationStopped()) break l;
          n = c, u.currentTarget = g;
          try {
            n(u);
          } catch (E) {
            qu(E);
          }
          u.currentTarget = null, n = d;
        }
        else for (i = 0; i < e.length; i++) {
          if (c = e[i], d = c.instance, g = c.currentTarget, c = c.listener, d !== n && u.isPropagationStopped()) break l;
          n = c, u.currentTarget = g;
          try {
            n(u);
          } catch (E) {
            qu(E);
          }
          u.currentTarget = null, n = d;
        }
      }
    }
  }
  function ll(l, t) {
    var a = t[Wn];
    a === void 0 && (a = t[Wn] = /* @__PURE__ */ new Set());
    var e = l + "__bubble";
    a.has(e) || (Ad(t, l, 2, !1), a.add(e));
  }
  function Yc(l, t, a) {
    var e = 0;
    t && (e |= 4), Ad(a, l, e, t);
  }
  var Mn = "_reactListening" + Math.random().toString(36).slice(2);
  function Md(l) {
    if (!l[Mn]) {
      l[Mn] = !0, zf.forEach(function(a) {
        a !== "selectionchange" && (kr.has(a) || Yc(a, !1, l), Yc(a, !0, l));
      });
      var t = l.nodeType === 9 ? l : l.ownerDocument;
      t === null || t[Mn] || (t[Mn] = !0, Yc("selectionchange", !1, t));
    }
  }
  function Ad(l, t, a, e) {
    switch (Pd(t)) {
      case 2:
        var u = Mo;
        break;
      case 8:
        u = Ao;
        break;
      default:
        u = Ic;
    }
    a = u.bind(null, t, a, l), u = void 0, !ui || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (u = !0), e ? u !== void 0 ? l.addEventListener(t, a, {
      capture: !0,
      passive: u
    }) : l.addEventListener(t, a, !0) : u !== void 0 ? l.addEventListener(t, a, { passive: u }) : l.addEventListener(t, a, !1);
  }
  function qc(l, t, a, e, u) {
    var n = e;
    if ((t & 1) === 0 && (t & 2) === 0 && e !== null) l: for (; ; ) {
      if (e === null) return;
      var i = e.tag;
      if (i === 3 || i === 4) {
        var c = e.stateNode.containerInfo;
        if (c === u) break;
        if (i === 4) for (i = e.return; i !== null; ) {
          var d = i.tag;
          if ((d === 3 || d === 4) && i.stateNode.containerInfo === u) return;
          i = i.return;
        }
        for (; c !== null; ) {
          if (i = La(c), i === null) return;
          if (d = i.tag, d === 5 || d === 6 || d === 26 || d === 27) {
            e = n = i;
            continue l;
          }
          c = c.parentNode;
        }
      }
      e = e.return;
    }
    xf(function() {
      var g = n, E = ai(a), A = [];
      l: {
        var b = c0.get(l);
        if (b !== void 0) {
          var S = Cu, q = l;
          switch (l) {
            case "keypress":
              if (xu(a) === 0) break l;
            case "keydown":
            case "keyup":
              S = Kv;
              break;
            case "focusin":
              q = "focus", S = fi;
              break;
            case "focusout":
              q = "blur", S = fi;
              break;
            case "beforeblur":
            case "afterblur":
              S = fi;
              break;
            case "click":
              if (a.button === 2) break l;
            case "auxclick":
            case "dblclick":
            case "mousedown":
            case "mousemove":
            case "mouseup":
            case "mouseout":
            case "mouseover":
            case "contextmenu":
              S = Bf;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              S = qv;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              S = Jv;
              break;
            case e0:
            case u0:
            case n0:
              S = Gv;
              break;
            case i0:
              S = wv;
              break;
            case "scroll":
            case "scrollend":
              S = Yv;
              break;
            case "wheel":
              S = kv;
              break;
            case "copy":
            case "cut":
            case "paste":
              S = Xv;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              S = qf;
              break;
            case "toggle":
            case "beforetoggle":
              S = Wv;
          }
          var w = (t & 4) !== 0, hl = !w && (l === "scroll" || l === "scrollend"), h = w ? b !== null ? b + "Capture" : null : b;
          w = [];
          for (var v = g, y; v !== null; ) {
            var T = v;
            if (y = T.stateNode, T = T.tag, T !== 5 && T !== 26 && T !== 27 || y === null || h === null || (T = He(v, h), T != null && w.push(vu(v, T, y))), hl) break;
            v = v.return;
          }
          0 < w.length && (b = new S(b, q, null, a, E), A.push({
            event: b,
            listeners: w
          }));
        }
      }
      if ((t & 7) === 0) {
        l: {
          if (b = l === "mouseover" || l === "pointerover", S = l === "mouseout" || l === "pointerout", b && a !== ti && (q = a.relatedTarget || a.fromElement) && (La(q) || q[De])) break l;
          if ((S || b) && (b = E.window === E ? E : (b = E.ownerDocument) ? b.defaultView || b.parentWindow : window, S ? (q = a.relatedTarget || a.toElement, S = g, q = q ? La(q) : null, q !== null && (hl = H(q), w = q.tag, q !== hl || w !== 5 && w !== 27 && w !== 6) && (q = null)) : (S = null, q = g), S !== q)) {
            if (w = Bf, T = "onMouseLeave", h = "onMouseEnter", v = "mouse", (l === "pointerout" || l === "pointerover") && (w = qf, T = "onPointerLeave", h = "onPointerEnter", v = "pointer"), hl = S == null ? b : Ue(S), y = q == null ? b : Ue(q), b = new w(T, v + "leave", S, a, E), b.target = hl, b.relatedTarget = y, T = null, La(E) === g && (w = new w(h, v + "enter", q, a, E), w.target = y, w.relatedTarget = hl, T = w), hl = T, S && q) t: {
              for (w = Wr, h = S, v = q, y = 0, T = h; T; T = w(T)) y++;
              T = 0;
              for (var J = v; J; J = w(J)) T++;
              for (; 0 < y - T; ) h = w(h), y--;
              for (; 0 < T - y; ) v = w(v), T--;
              for (; y--; ) {
                if (h === v || v !== null && h === v.alternate) {
                  w = h;
                  break t;
                }
                h = w(h), v = w(v);
              }
              w = null;
            }
            else w = null;
            S !== null && Nd(A, b, S, w, !1), q !== null && hl !== null && Nd(A, hl, q, w, !0);
          }
        }
        l: {
          if (b = g ? Ue(g) : window, S = b.nodeName && b.nodeName.toLowerCase(), S === "select" || S === "input" && b.type === "file") var cl = Jf;
          else if (Vf(b)) if (wf) cl = nr;
          else {
            cl = er;
            var Q = ar;
          }
          else S = b.nodeName, !S || S.toLowerCase() !== "input" || b.type !== "checkbox" && b.type !== "radio" ? g && li(g.elementType) && (cl = Jf) : cl = ur;
          if (cl && (cl = cl(l, g))) {
            Kf(A, cl, a, E);
            break l;
          }
          Q && Q(l, b, g), l === "focusout" && g && b.type === "number" && g.memoizedProps.value != null && Pn(b, "number", b.value);
        }
        switch (Q = g ? Ue(g) : window, l) {
          case "focusin":
            (Vf(Q) || Q.contentEditable === "true") && (Ia = Q, mi = g, Xe = null);
            break;
          case "focusout":
            Xe = mi = Ia = null;
            break;
          case "mousedown":
            hi = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            hi = !1, t0(A, a, E);
            break;
          case "selectionchange":
            if (cr) break;
          case "keydown":
          case "keyup":
            t0(A, a, E);
        }
        var W;
        if (di) l: {
          switch (l) {
            case "compositionstart":
              var el = "onCompositionStart";
              break l;
            case "compositionend":
              el = "onCompositionEnd";
              break l;
            case "compositionupdate":
              el = "onCompositionUpdate";
              break l;
          }
          el = void 0;
        }
        else Fa ? Zf(l, a) && (el = "onCompositionEnd") : l === "keydown" && a.keyCode === 229 && (el = "onCompositionStart");
        el && (Gf && a.locale !== "ko" && (Fa || el !== "onCompositionStart" ? el === "onCompositionEnd" && Fa && (W = Rf()) : (la = E, ni = "value" in la ? la.value : la.textContent, Fa = !0)), Q = An(g, el), 0 < Q.length && (el = new Yf(el, l, null, a, E), A.push({
          event: el,
          listeners: Q
        }), W ? el.data = W : (W = Lf(a), W !== null && (el.data = W)))), (W = Fv ? Iv(l, a) : Pv(l, a)) && (el = An(g, "onBeforeInput"), 0 < el.length && (Q = new Yf("onBeforeInput", "beforeinput", null, a, E), A.push({
          event: Q,
          listeners: el
        }), Q.data = W)), wr(A, l, g, a, E);
      }
      Td(A, t);
    });
  }
  function vu(l, t, a) {
    return {
      instance: l,
      listener: t,
      currentTarget: a
    };
  }
  function An(l, t) {
    for (var a = t + "Capture", e = []; l !== null; ) {
      var u = l, n = u.stateNode;
      if (u = u.tag, u !== 5 && u !== 26 && u !== 27 || n === null || (u = He(l, a), u != null && e.unshift(vu(l, u, n)), u = He(l, t), u != null && e.push(vu(l, u, n))), l.tag === 3) return e;
      l = l.return;
    }
    return [];
  }
  function Wr(l) {
    if (l === null) return null;
    do
      l = l.return;
    while (l && l.tag !== 5 && l.tag !== 27);
    return l || null;
  }
  function Nd(l, t, a, e, u) {
    for (var n = t._reactName, i = []; a !== null && a !== e; ) {
      var c = a, d = c.alternate, g = c.stateNode;
      if (c = c.tag, d !== null && d === e) break;
      c !== 5 && c !== 26 && c !== 27 || g === null || (d = g, u ? (g = He(a, n), g != null && i.unshift(vu(a, g, d))) : u || (g = He(a, n), g != null && i.push(vu(a, g, d)))), a = a.return;
    }
    i.length !== 0 && l.push({
      event: t,
      listeners: i
    });
  }
  var $r = /\r\n?/g, Fr = /\u0000|\uFFFD/g;
  function Od(l) {
    return (typeof l == "string" ? l : "" + l).replace($r, `
`).replace(Fr, "");
  }
  function Dd(l, t) {
    return t = Od(t), Od(l) === t;
  }
  function ml(l, t, a, e, u, n) {
    switch (a) {
      case "children":
        typeof e == "string" ? t === "body" || t === "textarea" && e === "" || ka(l, e) : (typeof e == "number" || typeof e == "bigint") && t !== "body" && ka(l, "" + e);
        break;
      case "className":
        Du(l, "class", e);
        break;
      case "tabIndex":
        Du(l, "tabindex", e);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        Du(l, a, e);
        break;
      case "style":
        Uf(l, e, n);
        break;
      case "data":
        if (t !== "object") {
          Du(l, "data", e);
          break;
        }
      case "src":
      case "href":
        if (e === "" && (t !== "a" || a !== "href")) {
          l.removeAttribute(a);
          break;
        }
        if (e == null || typeof e == "function" || typeof e == "symbol" || typeof e == "boolean") {
          l.removeAttribute(a);
          break;
        }
        e = Uu("" + e), l.setAttribute(a, e);
        break;
      case "action":
      case "formAction":
        if (typeof e == "function") {
          l.setAttribute(a, "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");
          break;
        } else typeof n == "function" && (a === "formAction" ? (t !== "input" && ml(l, t, "name", u.name, u, null), ml(l, t, "formEncType", u.formEncType, u, null), ml(l, t, "formMethod", u.formMethod, u, null), ml(l, t, "formTarget", u.formTarget, u, null)) : (ml(l, t, "encType", u.encType, u, null), ml(l, t, "method", u.method, u, null), ml(l, t, "target", u.target, u, null)));
        if (e == null || typeof e == "symbol" || typeof e == "boolean") {
          l.removeAttribute(a);
          break;
        }
        e = Uu("" + e), l.setAttribute(a, e);
        break;
      case "onClick":
        e != null && (l.onclick = Rt);
        break;
      case "onScroll":
        e != null && ll("scroll", l);
        break;
      case "onScrollEnd":
        e != null && ll("scrollend", l);
        break;
      case "dangerouslySetInnerHTML":
        if (e != null) {
          if (typeof e != "object" || !("__html" in e)) throw Error(s(61));
          if (a = e.__html, a != null) {
            if (u.children != null) throw Error(s(60));
            l.innerHTML = a;
          }
        }
        break;
      case "multiple":
        l.multiple = e && typeof e != "function" && typeof e != "symbol";
        break;
      case "muted":
        l.muted = e && typeof e != "function" && typeof e != "symbol";
        break;
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "defaultValue":
      case "defaultChecked":
      case "innerHTML":
      case "ref":
        break;
      case "autoFocus":
        break;
      case "xlinkHref":
        if (e == null || typeof e == "function" || typeof e == "boolean" || typeof e == "symbol") {
          l.removeAttribute("xlink:href");
          break;
        }
        a = Uu("" + e), l.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", a);
        break;
      case "contentEditable":
      case "spellCheck":
      case "draggable":
      case "value":
      case "autoReverse":
      case "externalResourcesRequired":
      case "focusable":
      case "preserveAlpha":
        e != null && typeof e != "function" && typeof e != "symbol" ? l.setAttribute(a, "" + e) : l.removeAttribute(a);
        break;
      case "inert":
      case "allowFullScreen":
      case "async":
      case "autoPlay":
      case "controls":
      case "default":
      case "defer":
      case "disabled":
      case "disablePictureInPicture":
      case "disableRemotePlayback":
      case "formNoValidate":
      case "hidden":
      case "loop":
      case "noModule":
      case "noValidate":
      case "open":
      case "playsInline":
      case "readOnly":
      case "required":
      case "reversed":
      case "scoped":
      case "seamless":
      case "itemScope":
        e && typeof e != "function" && typeof e != "symbol" ? l.setAttribute(a, "") : l.removeAttribute(a);
        break;
      case "capture":
      case "download":
        e === !0 ? l.setAttribute(a, "") : e !== !1 && e != null && typeof e != "function" && typeof e != "symbol" ? l.setAttribute(a, e) : l.removeAttribute(a);
        break;
      case "cols":
      case "rows":
      case "size":
      case "span":
        e != null && typeof e != "function" && typeof e != "symbol" && !isNaN(e) && 1 <= e ? l.setAttribute(a, e) : l.removeAttribute(a);
        break;
      case "rowSpan":
      case "start":
        e == null || typeof e == "function" || typeof e == "symbol" || isNaN(e) ? l.removeAttribute(a) : l.setAttribute(a, e);
        break;
      case "popover":
        ll("beforetoggle", l), ll("toggle", l), Ou(l, "popover", e);
        break;
      case "xlinkActuate":
        xt(l, "http://www.w3.org/1999/xlink", "xlink:actuate", e);
        break;
      case "xlinkArcrole":
        xt(l, "http://www.w3.org/1999/xlink", "xlink:arcrole", e);
        break;
      case "xlinkRole":
        xt(l, "http://www.w3.org/1999/xlink", "xlink:role", e);
        break;
      case "xlinkShow":
        xt(l, "http://www.w3.org/1999/xlink", "xlink:show", e);
        break;
      case "xlinkTitle":
        xt(l, "http://www.w3.org/1999/xlink", "xlink:title", e);
        break;
      case "xlinkType":
        xt(l, "http://www.w3.org/1999/xlink", "xlink:type", e);
        break;
      case "xmlBase":
        xt(l, "http://www.w3.org/XML/1998/namespace", "xml:base", e);
        break;
      case "xmlLang":
        xt(l, "http://www.w3.org/XML/1998/namespace", "xml:lang", e);
        break;
      case "xmlSpace":
        xt(l, "http://www.w3.org/XML/1998/namespace", "xml:space", e);
        break;
      case "is":
        Ou(l, "is", e);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < a.length) || a[0] !== "o" && a[0] !== "O" || a[1] !== "n" && a[1] !== "N") && (a = Cv.get(a) || a, Ou(l, a, e));
    }
  }
  function Gc(l, t, a, e, u, n) {
    switch (a) {
      case "style":
        Uf(l, e, n);
        break;
      case "dangerouslySetInnerHTML":
        if (e != null) {
          if (typeof e != "object" || !("__html" in e)) throw Error(s(61));
          if (a = e.__html, a != null) {
            if (u.children != null) throw Error(s(60));
            l.innerHTML = a;
          }
        }
        break;
      case "children":
        typeof e == "string" ? ka(l, e) : (typeof e == "number" || typeof e == "bigint") && ka(l, "" + e);
        break;
      case "onScroll":
        e != null && ll("scroll", l);
        break;
      case "onScrollEnd":
        e != null && ll("scrollend", l);
        break;
      case "onClick":
        e != null && (l.onclick = Rt);
        break;
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "innerHTML":
      case "ref":
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        if (!pf.hasOwnProperty(a)) l: {
          if (a[0] === "o" && a[1] === "n" && (u = a.endsWith("Capture"), t = a.slice(2, u ? a.length - 7 : void 0), n = l[Fl] || null, n = n != null ? n[a] : null, typeof n == "function" && l.removeEventListener(t, n, u), typeof e == "function")) {
            typeof n != "function" && n !== null && (a in l ? l[a] = null : l.hasAttribute(a) && l.removeAttribute(a)), l.addEventListener(t, e, u);
            break l;
          }
          a in l ? l[a] = e : e === !0 ? l.setAttribute(a, "") : Ou(l, a, e);
        }
    }
  }
  function Kl(l, t, a) {
    switch (t) {
      case "div":
      case "span":
      case "svg":
      case "path":
      case "a":
      case "g":
      case "p":
      case "li":
        break;
      case "img":
        ll("error", l), ll("load", l);
        var e = !1, u = !1, n;
        for (n in a) if (a.hasOwnProperty(n)) {
          var i = a[n];
          if (i != null) switch (n) {
            case "src":
              e = !0;
              break;
            case "srcSet":
              u = !0;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(s(137, t));
            default:
              ml(l, t, n, i, a, null);
          }
        }
        u && ml(l, t, "srcSet", a.srcSet, a, null), e && ml(l, t, "src", a.src, a, null);
        return;
      case "input":
        ll("invalid", l);
        var c = n = i = u = null, d = null, g = null;
        for (e in a) if (a.hasOwnProperty(e)) {
          var E = a[e];
          if (E != null) switch (e) {
            case "name":
              u = E;
              break;
            case "type":
              i = E;
              break;
            case "checked":
              d = E;
              break;
            case "defaultChecked":
              g = E;
              break;
            case "value":
              n = E;
              break;
            case "defaultValue":
              c = E;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              if (E != null) throw Error(s(137, t));
              break;
            default:
              ml(l, t, e, E, a, null);
          }
        }
        Nf(l, n, c, d, g, i, u, !1);
        return;
      case "select":
        ll("invalid", l), e = i = n = null;
        for (u in a) if (a.hasOwnProperty(u) && (c = a[u], c != null)) switch (u) {
          case "value":
            n = c;
            break;
          case "defaultValue":
            i = c;
            break;
          case "multiple":
            e = c;
          default:
            ml(l, t, u, c, a, null);
        }
        t = n, a = i, l.multiple = !!e, t != null ? wa(l, !!e, t, !1) : a != null && wa(l, !!e, a, !0);
        return;
      case "textarea":
        ll("invalid", l), n = u = e = null;
        for (i in a) if (a.hasOwnProperty(i) && (c = a[i], c != null)) switch (i) {
          case "value":
            e = c;
            break;
          case "defaultValue":
            u = c;
            break;
          case "children":
            n = c;
            break;
          case "dangerouslySetInnerHTML":
            if (c != null) throw Error(s(91));
            break;
          default:
            ml(l, t, i, c, a, null);
        }
        Df(l, e, u, n);
        return;
      case "option":
        for (d in a) if (a.hasOwnProperty(d) && (e = a[d], e != null)) switch (d) {
          case "selected":
            l.selected = e && typeof e != "function" && typeof e != "symbol";
            break;
          default:
            ml(l, t, d, e, a, null);
        }
        return;
      case "dialog":
        ll("beforetoggle", l), ll("toggle", l), ll("cancel", l), ll("close", l);
        break;
      case "iframe":
      case "object":
        ll("load", l);
        break;
      case "video":
      case "audio":
        for (e = 0; e < du.length; e++) ll(du[e], l);
        break;
      case "image":
        ll("error", l), ll("load", l);
        break;
      case "details":
        ll("toggle", l);
        break;
      case "embed":
      case "source":
      case "link":
        ll("error", l), ll("load", l);
      case "area":
      case "base":
      case "br":
      case "col":
      case "hr":
      case "keygen":
      case "meta":
      case "param":
      case "track":
      case "wbr":
      case "menuitem":
        for (g in a) if (a.hasOwnProperty(g) && (e = a[g], e != null)) switch (g) {
          case "children":
          case "dangerouslySetInnerHTML":
            throw Error(s(137, t));
          default:
            ml(l, t, g, e, a, null);
        }
        return;
      default:
        if (li(t)) {
          for (E in a) a.hasOwnProperty(E) && (e = a[E], e !== void 0 && Gc(l, t, E, e, a, void 0));
          return;
        }
    }
    for (c in a) a.hasOwnProperty(c) && (e = a[c], e != null && ml(l, t, c, e, a, null));
  }
  function Ir(l, t, a, e) {
    switch (t) {
      case "div":
      case "span":
      case "svg":
      case "path":
      case "a":
      case "g":
      case "p":
      case "li":
        break;
      case "input":
        var u = null, n = null, i = null, c = null, d = null, g = null, E = null;
        for (S in a) {
          var A = a[S];
          if (a.hasOwnProperty(S) && A != null) switch (S) {
            case "checked":
              break;
            case "value":
              break;
            case "defaultValue":
              d = A;
            default:
              e.hasOwnProperty(S) || ml(l, t, S, null, e, A);
          }
        }
        for (var b in e) {
          var S = e[b];
          if (A = a[b], e.hasOwnProperty(b) && (S != null || A != null)) switch (b) {
            case "type":
              n = S;
              break;
            case "name":
              u = S;
              break;
            case "checked":
              g = S;
              break;
            case "defaultChecked":
              E = S;
              break;
            case "value":
              i = S;
              break;
            case "defaultValue":
              c = S;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              if (S != null) throw Error(s(137, t));
              break;
            default:
              S !== A && ml(l, t, b, S, e, A);
          }
        }
        In(l, i, c, d, g, E, n, u);
        return;
      case "select":
        S = i = c = b = null;
        for (n in a) if (d = a[n], a.hasOwnProperty(n) && d != null) switch (n) {
          case "value":
            break;
          case "multiple":
            S = d;
          default:
            e.hasOwnProperty(n) || ml(l, t, n, null, e, d);
        }
        for (u in e) if (n = e[u], d = a[u], e.hasOwnProperty(u) && (n != null || d != null)) switch (u) {
          case "value":
            b = n;
            break;
          case "defaultValue":
            c = n;
            break;
          case "multiple":
            i = n;
          default:
            n !== d && ml(l, t, u, n, e, d);
        }
        t = c, a = i, e = S, b != null ? wa(l, !!a, b, !1) : !!e != !!a && (t != null ? wa(l, !!a, t, !0) : wa(l, !!a, a ? [] : "", !1));
        return;
      case "textarea":
        S = b = null;
        for (c in a) if (u = a[c], a.hasOwnProperty(c) && u != null && !e.hasOwnProperty(c)) switch (c) {
          case "value":
            break;
          case "children":
            break;
          default:
            ml(l, t, c, null, e, u);
        }
        for (i in e) if (u = e[i], n = a[i], e.hasOwnProperty(i) && (u != null || n != null)) switch (i) {
          case "value":
            b = u;
            break;
          case "defaultValue":
            S = u;
            break;
          case "children":
            break;
          case "dangerouslySetInnerHTML":
            if (u != null) throw Error(s(91));
            break;
          default:
            u !== n && ml(l, t, i, u, e, n);
        }
        Of(l, b, S);
        return;
      case "option":
        for (var q in a) if (b = a[q], a.hasOwnProperty(q) && b != null && !e.hasOwnProperty(q)) switch (q) {
          case "selected":
            l.selected = !1;
            break;
          default:
            ml(l, t, q, null, e, b);
        }
        for (d in e) if (b = e[d], S = a[d], e.hasOwnProperty(d) && b !== S && (b != null || S != null)) switch (d) {
          case "selected":
            l.selected = b && typeof b != "function" && typeof b != "symbol";
            break;
          default:
            ml(l, t, d, b, e, S);
        }
        return;
      case "img":
      case "link":
      case "area":
      case "base":
      case "br":
      case "col":
      case "embed":
      case "hr":
      case "keygen":
      case "meta":
      case "param":
      case "source":
      case "track":
      case "wbr":
      case "menuitem":
        for (var w in a) b = a[w], a.hasOwnProperty(w) && b != null && !e.hasOwnProperty(w) && ml(l, t, w, null, e, b);
        for (g in e) if (b = e[g], S = a[g], e.hasOwnProperty(g) && b !== S && (b != null || S != null)) switch (g) {
          case "children":
          case "dangerouslySetInnerHTML":
            if (b != null) throw Error(s(137, t));
            break;
          default:
            ml(l, t, g, b, e, S);
        }
        return;
      default:
        if (li(t)) {
          for (var hl in a) b = a[hl], a.hasOwnProperty(hl) && b !== void 0 && !e.hasOwnProperty(hl) && Gc(l, t, hl, void 0, e, b);
          for (E in e) b = e[E], S = a[E], !e.hasOwnProperty(E) || b === S || b === void 0 && S === void 0 || Gc(l, t, E, b, e, S);
          return;
        }
    }
    for (var h in a) b = a[h], a.hasOwnProperty(h) && b != null && !e.hasOwnProperty(h) && ml(l, t, h, null, e, b);
    for (A in e) b = e[A], S = a[A], !e.hasOwnProperty(A) || b === S || b == null && S == null || ml(l, t, A, b, e, S);
  }
  function jd(l) {
    switch (l) {
      case "css":
      case "script":
      case "font":
      case "img":
      case "image":
      case "input":
      case "link":
        return !0;
      default:
        return !1;
    }
  }
  function Pr() {
    if (typeof performance.getEntriesByType == "function") {
      for (var l = 0, t = 0, a = performance.getEntriesByType("resource"), e = 0; e < a.length; e++) {
        var u = a[e], n = u.transferSize, i = u.initiatorType, c = u.duration;
        if (n && c && jd(i)) {
          for (i = 0, c = u.responseEnd, e += 1; e < a.length; e++) {
            var d = a[e], g = d.startTime;
            if (g > c) break;
            var E = d.transferSize, A = d.initiatorType;
            E && jd(A) && (d = d.responseEnd, i += E * (d < c ? 1 : (c - g) / (d - g)));
          }
          if (--e, t += 8 * (n + i) / (u.duration / 1e3), l++, 10 < l) break;
        }
      }
      if (0 < l) return t / l / 1e6;
    }
    return navigator.connection && (l = navigator.connection.downlink, typeof l == "number") ? l : 5;
  }
  var Xc = null, Qc = null;
  function Nn(l) {
    return l.nodeType === 9 ? l : l.ownerDocument;
  }
  function Ud(l) {
    switch (l) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function Hd(l, t) {
    if (l === 0) switch (t) {
      case "svg":
        return 1;
      case "math":
        return 2;
      default:
        return 0;
    }
    return l === 1 && t === "foreignObject" ? 0 : l;
  }
  function Zc(l, t) {
    return l === "textarea" || l === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var Lc = null;
  function lo() {
    var l = window.event;
    return l && l.type === "popstate" ? l === Lc ? !1 : (Lc = l, !0) : (Lc = null, !1);
  }
  var xd = typeof setTimeout == "function" ? setTimeout : void 0, to = typeof clearTimeout == "function" ? clearTimeout : void 0, Rd = typeof Promise == "function" ? Promise : void 0, ao = typeof queueMicrotask == "function" ? queueMicrotask : typeof Rd < "u" ? function(l) {
    return Rd.resolve(null).then(l).catch(eo);
  } : xd;
  function eo(l) {
    setTimeout(function() {
      throw l;
    });
  }
  function ha(l) {
    return l === "head";
  }
  function Cd(l, t) {
    var a = t, e = 0;
    do {
      var u = a.nextSibling;
      if (l.removeChild(a), u && u.nodeType === 8) if (a = u.data, a === "/$" || a === "/&") {
        if (e === 0) {
          l.removeChild(u), Me(t);
          return;
        }
        e--;
      } else if (a === "$" || a === "$?" || a === "$~" || a === "$!" || a === "&") e++;
      else if (a === "html") ru(l.ownerDocument.documentElement);
      else if (a === "head") {
        a = l.ownerDocument.head, ru(a);
        for (var n = a.firstChild; n; ) {
          var i = n.nextSibling, c = n.nodeName;
          n[je] || c === "SCRIPT" || c === "STYLE" || c === "LINK" && n.rel.toLowerCase() === "stylesheet" || a.removeChild(n), n = i;
        }
      } else a === "body" && ru(l.ownerDocument.body);
      a = u;
    } while (a);
    Me(t);
  }
  function Bd(l, t) {
    var a = l;
    l = 0;
    do {
      var e = a.nextSibling;
      if (a.nodeType === 1 ? t ? (a._stashedDisplay = a.style.display, a.style.display = "none") : (a.style.display = a._stashedDisplay || "", a.getAttribute("style") === "" && a.removeAttribute("style")) : a.nodeType === 3 && (t ? (a._stashedText = a.nodeValue, a.nodeValue = "") : a.nodeValue = a._stashedText || ""), e && e.nodeType === 8) if (a = e.data, a === "/$") {
        if (l === 0) break;
        l--;
      } else a !== "$" && a !== "$?" && a !== "$~" && a !== "$!" || l++;
      a = e;
    } while (a);
  }
  function Vc(l) {
    var t = l.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var a = t;
      switch (t = t.nextSibling, a.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          Vc(a), $n(a);
          continue;
        case "SCRIPT":
        case "STYLE":
          continue;
        case "LINK":
          if (a.rel.toLowerCase() === "stylesheet") continue;
      }
      l.removeChild(a);
    }
  }
  function uo(l, t, a, e) {
    for (; l.nodeType === 1; ) {
      var u = a;
      if (l.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!e && (l.nodeName !== "INPUT" || l.type !== "hidden")) break;
      } else if (e) {
        if (!l[je]) switch (t) {
          case "meta":
            if (!l.hasAttribute("itemprop")) break;
            return l;
          case "link":
            if (n = l.getAttribute("rel"), n === "stylesheet" && l.hasAttribute("data-precedence")) break;
            if (n !== u.rel || l.getAttribute("href") !== (u.href == null || u.href === "" ? null : u.href) || l.getAttribute("crossorigin") !== (u.crossOrigin == null ? null : u.crossOrigin) || l.getAttribute("title") !== (u.title == null ? null : u.title)) break;
            return l;
          case "style":
            if (l.hasAttribute("data-precedence")) break;
            return l;
          case "script":
            if (n = l.getAttribute("src"), (n !== (u.src == null ? null : u.src) || l.getAttribute("type") !== (u.type == null ? null : u.type) || l.getAttribute("crossorigin") !== (u.crossOrigin == null ? null : u.crossOrigin)) && n && l.hasAttribute("async") && !l.hasAttribute("itemprop")) break;
            return l;
          default:
            return l;
        }
      } else if (t === "input" && l.type === "hidden") {
        var n = u.name == null ? null : "" + u.name;
        if (u.type === "hidden" && l.getAttribute("name") === n) return l;
      } else return l;
      if (l = Et(l.nextSibling), l === null) break;
    }
    return null;
  }
  function no(l, t, a) {
    if (t === "") return null;
    for (; l.nodeType !== 3; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !a || (l = Et(l.nextSibling), l === null)) return null;
    return l;
  }
  function Yd(l, t) {
    for (; l.nodeType !== 8; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !t || (l = Et(l.nextSibling), l === null)) return null;
    return l;
  }
  function Kc(l) {
    return l.data === "$?" || l.data === "$~";
  }
  function Jc(l) {
    return l.data === "$!" || l.data === "$?" && l.ownerDocument.readyState !== "loading";
  }
  function io(l, t) {
    var a = l.ownerDocument;
    if (l.data === "$~") l._reactRetry = t;
    else if (l.data !== "$?" || a.readyState !== "loading") t();
    else {
      var e = function() {
        t(), a.removeEventListener("DOMContentLoaded", e);
      };
      a.addEventListener("DOMContentLoaded", e), l._reactRetry = e;
    }
  }
  function Et(l) {
    for (; l != null; l = l.nextSibling) {
      var t = l.nodeType;
      if (t === 1 || t === 3) break;
      if (t === 8) {
        if (t = l.data, t === "$" || t === "$!" || t === "$?" || t === "$~" || t === "&" || t === "F!" || t === "F") break;
        if (t === "/$" || t === "/&") return null;
      }
    }
    return l;
  }
  var wc = null;
  function qd(l) {
    l = l.nextSibling;
    for (var t = 0; l; ) {
      if (l.nodeType === 8) {
        var a = l.data;
        if (a === "/$" || a === "/&") {
          if (t === 0) return Et(l.nextSibling);
          t--;
        } else a !== "$" && a !== "$!" && a !== "$?" && a !== "$~" && a !== "&" || t++;
      }
      l = l.nextSibling;
    }
    return null;
  }
  function Gd(l) {
    l = l.previousSibling;
    for (var t = 0; l; ) {
      if (l.nodeType === 8) {
        var a = l.data;
        if (a === "$" || a === "$!" || a === "$?" || a === "$~" || a === "&") {
          if (t === 0) return l;
          t--;
        } else a !== "/$" && a !== "/&" || t++;
      }
      l = l.previousSibling;
    }
    return null;
  }
  function Xd(l, t, a) {
    switch (t = Nn(a), l) {
      case "html":
        if (l = t.documentElement, !l) throw Error(s(452));
        return l;
      case "head":
        if (l = t.head, !l) throw Error(s(453));
        return l;
      case "body":
        if (l = t.body, !l) throw Error(s(454));
        return l;
      default:
        throw Error(s(451));
    }
  }
  function ru(l) {
    for (var t = l.attributes; t.length; ) l.removeAttributeNode(t[0]);
    $n(l);
  }
  var Tt = /* @__PURE__ */ new Map(), Qd = /* @__PURE__ */ new Set();
  function On(l) {
    return typeof l.getRootNode == "function" ? l.getRootNode() : l.nodeType === 9 ? l : l.ownerDocument;
  }
  var Ft = B.d;
  B.d = {
    f: co,
    r: fo,
    D: so,
    C: vo,
    L: ro,
    m: oo,
    X: ho,
    S: mo,
    M: yo
  };
  function co() {
    var l = Ft.f(), t = Sn();
    return l || t;
  }
  function fo(l) {
    var t = Va(l);
    t !== null && t.tag === 5 && t.type === "form" ? is(t) : Ft.r(l);
  }
  var pe = typeof document > "u" ? null : document;
  function Zd(l, t, a) {
    var e = pe;
    if (e && typeof t == "string" && t) {
      var u = ht(t);
      u = 'link[rel="' + l + '"][href="' + u + '"]', typeof a == "string" && (u += '[crossorigin="' + a + '"]'), Qd.has(u) || (Qd.add(u), l = {
        rel: l,
        crossOrigin: a,
        href: t
      }, e.querySelector(u) === null && (t = e.createElement("link"), Kl(t, "link", l), Gl(t), e.head.appendChild(t)));
    }
  }
  function so(l) {
    Ft.D(l), Zd("dns-prefetch", l, null);
  }
  function vo(l, t) {
    Ft.C(l, t), Zd("preconnect", l, t);
  }
  function ro(l, t, a) {
    Ft.L(l, t, a);
    var e = pe;
    if (e && l && t) {
      var u = 'link[rel="preload"][as="' + ht(t) + '"]';
      t === "image" && a && a.imageSrcSet ? (u += '[imagesrcset="' + ht(a.imageSrcSet) + '"]', typeof a.imageSizes == "string" && (u += '[imagesizes="' + ht(a.imageSizes) + '"]')) : u += '[href="' + ht(l) + '"]';
      var n = u;
      switch (t) {
        case "style":
          n = Ee(l);
          break;
        case "script":
          n = Te(l);
      }
      Tt.has(n) || (l = C({
        rel: "preload",
        href: t === "image" && a && a.imageSrcSet ? void 0 : l,
        as: t
      }, a), Tt.set(n, l), e.querySelector(u) !== null || t === "style" && e.querySelector(ou(n)) || t === "script" && e.querySelector(mu(n)) || (t = e.createElement("link"), Kl(t, "link", l), Gl(t), e.head.appendChild(t)));
    }
  }
  function oo(l, t) {
    Ft.m(l, t);
    var a = pe;
    if (a && l) {
      var e = t && typeof t.as == "string" ? t.as : "script", u = 'link[rel="modulepreload"][as="' + ht(e) + '"][href="' + ht(l) + '"]', n = u;
      switch (e) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          n = Te(l);
      }
      if (!Tt.has(n) && (l = C({
        rel: "modulepreload",
        href: l
      }, t), Tt.set(n, l), a.querySelector(u) === null)) {
        switch (e) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (a.querySelector(mu(n))) return;
        }
        e = a.createElement("link"), Kl(e, "link", l), Gl(e), a.head.appendChild(e);
      }
    }
  }
  function mo(l, t, a) {
    Ft.S(l, t, a);
    var e = pe;
    if (e && l) {
      var u = Ka(e).hoistableStyles, n = Ee(l);
      t = t || "default";
      var i = u.get(n);
      if (!i) {
        var c = {
          loading: 0,
          preload: null
        };
        if (i = e.querySelector(ou(n))) c.loading = 5;
        else {
          l = C({
            rel: "stylesheet",
            href: l,
            "data-precedence": t
          }, a), (a = Tt.get(n)) && kc(l, a);
          var d = i = e.createElement("link");
          Gl(d), Kl(d, "link", l), d._p = new Promise(function(g, E) {
            d.onload = g, d.onerror = E;
          }), d.addEventListener("load", function() {
            c.loading |= 1;
          }), d.addEventListener("error", function() {
            c.loading |= 2;
          }), c.loading |= 4, Dn(i, t, e);
        }
        i = {
          type: "stylesheet",
          instance: i,
          count: 1,
          state: c
        }, u.set(n, i);
      }
    }
  }
  function ho(l, t) {
    Ft.X(l, t);
    var a = pe;
    if (a && l) {
      var e = Ka(a).hoistableScripts, u = Te(l), n = e.get(u);
      n || (n = a.querySelector(mu(u)), n || (l = C({
        src: l,
        async: !0
      }, t), (t = Tt.get(u)) && Wc(l, t), n = a.createElement("script"), Gl(n), Kl(n, "link", l), a.head.appendChild(n)), n = {
        type: "script",
        instance: n,
        count: 1,
        state: null
      }, e.set(u, n));
    }
  }
  function yo(l, t) {
    Ft.M(l, t);
    var a = pe;
    if (a && l) {
      var e = Ka(a).hoistableScripts, u = Te(l), n = e.get(u);
      n || (n = a.querySelector(mu(u)), n || (l = C({
        src: l,
        async: !0,
        type: "module"
      }, t), (t = Tt.get(u)) && Wc(l, t), n = a.createElement("script"), Gl(n), Kl(n, "link", l), a.head.appendChild(n)), n = {
        type: "script",
        instance: n,
        count: 1,
        state: null
      }, e.set(u, n));
    }
  }
  function Ld(l, t, a, e) {
    var u = (u = I.current) ? On(u) : null;
    if (!u) throw Error(s(446));
    switch (l) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof a.precedence == "string" && typeof a.href == "string" ? (t = Ee(a.href), a = Ka(u).hoistableStyles, e = a.get(t), e || (e = {
          type: "style",
          instance: null,
          count: 0,
          state: null
        }, a.set(t, e)), e) : {
          type: "void",
          instance: null,
          count: 0,
          state: null
        };
      case "link":
        if (a.rel === "stylesheet" && typeof a.href == "string" && typeof a.precedence == "string") {
          l = Ee(a.href);
          var n = Ka(u).hoistableStyles, i = n.get(l);
          if (i || (u = u.ownerDocument || u, i = {
            type: "stylesheet",
            instance: null,
            count: 0,
            state: {
              loading: 0,
              preload: null
            }
          }, n.set(l, i), (n = u.querySelector(ou(l))) && !n._p && (i.instance = n, i.state.loading = 5), Tt.has(l) || (a = {
            rel: "preload",
            as: "style",
            href: a.href,
            crossOrigin: a.crossOrigin,
            integrity: a.integrity,
            media: a.media,
            hrefLang: a.hrefLang,
            referrerPolicy: a.referrerPolicy
          }, Tt.set(l, a), n || go(u, l, a, i.state))), t && e === null) throw Error(s(528, ""));
          return i;
        }
        if (t && e !== null) throw Error(s(529, ""));
        return null;
      case "script":
        return t = a.async, a = a.src, typeof a == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Te(a), a = Ka(u).hoistableScripts, e = a.get(t), e || (e = {
          type: "script",
          instance: null,
          count: 0,
          state: null
        }, a.set(t, e)), e) : {
          type: "void",
          instance: null,
          count: 0,
          state: null
        };
      default:
        throw Error(s(444, l));
    }
  }
  function Ee(l) {
    return 'href="' + ht(l) + '"';
  }
  function ou(l) {
    return 'link[rel="stylesheet"][' + l + "]";
  }
  function Vd(l) {
    return C({}, l, {
      "data-precedence": l.precedence,
      precedence: null
    });
  }
  function go(l, t, a, e) {
    l.querySelector('link[rel="preload"][as="style"][' + t + "]") ? e.loading = 1 : (t = l.createElement("link"), e.preload = t, t.addEventListener("load", function() {
      return e.loading |= 1;
    }), t.addEventListener("error", function() {
      return e.loading |= 2;
    }), Kl(t, "link", a), Gl(t), l.head.appendChild(t));
  }
  function Te(l) {
    return '[src="' + ht(l) + '"]';
  }
  function mu(l) {
    return "script[async]" + l;
  }
  function Kd(l, t, a) {
    if (t.count++, t.instance === null) switch (t.type) {
      case "style":
        var e = l.querySelector('style[data-href~="' + ht(a.href) + '"]');
        if (e) return t.instance = e, Gl(e), e;
        var u = C({}, a, {
          "data-href": a.href,
          "data-precedence": a.precedence,
          href: null,
          precedence: null
        });
        return e = (l.ownerDocument || l).createElement("style"), Gl(e), Kl(e, "style", u), Dn(e, a.precedence, l), t.instance = e;
      case "stylesheet":
        u = Ee(a.href);
        var n = l.querySelector(ou(u));
        if (n) return t.state.loading |= 4, t.instance = n, Gl(n), n;
        e = Vd(a), (u = Tt.get(u)) && kc(e, u), n = (l.ownerDocument || l).createElement("link"), Gl(n);
        var i = n;
        return i._p = new Promise(function(c, d) {
          i.onload = c, i.onerror = d;
        }), Kl(n, "link", e), t.state.loading |= 4, Dn(n, a.precedence, l), t.instance = n;
      case "script":
        return n = Te(a.src), (u = l.querySelector(mu(n))) ? (t.instance = u, Gl(u), u) : (e = a, (u = Tt.get(n)) && (e = C({}, a), Wc(e, u)), l = l.ownerDocument || l, u = l.createElement("script"), Gl(u), Kl(u, "link", e), l.head.appendChild(u), t.instance = u);
      case "void":
        return null;
      default:
        throw Error(s(443, t.type));
    }
    else t.type === "stylesheet" && (t.state.loading & 4) === 0 && (e = t.instance, t.state.loading |= 4, Dn(e, a.precedence, l));
    return t.instance;
  }
  function Dn(l, t, a) {
    for (var e = a.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'), u = e.length ? e[e.length - 1] : null, n = u, i = 0; i < e.length; i++) {
      var c = e[i];
      if (c.dataset.precedence === t) n = c;
      else if (n !== u) break;
    }
    n ? n.parentNode.insertBefore(l, n.nextSibling) : (t = a.nodeType === 9 ? a.head : a, t.insertBefore(l, t.firstChild));
  }
  function kc(l, t) {
    l.crossOrigin ??= t.crossOrigin, l.referrerPolicy ??= t.referrerPolicy, l.title ??= t.title;
  }
  function Wc(l, t) {
    l.crossOrigin ??= t.crossOrigin, l.referrerPolicy ??= t.referrerPolicy, l.integrity ??= t.integrity;
  }
  var jn = null;
  function Jd(l, t, a) {
    if (jn === null) {
      var e = /* @__PURE__ */ new Map(), u = jn = /* @__PURE__ */ new Map();
      u.set(a, e);
    } else u = jn, e = u.get(a), e || (e = /* @__PURE__ */ new Map(), u.set(a, e));
    if (e.has(l)) return e;
    for (e.set(l, null), a = a.getElementsByTagName(l), u = 0; u < a.length; u++) {
      var n = a[u];
      if (!(n[je] || n[Ql] || l === "link" && n.getAttribute("rel") === "stylesheet") && n.namespaceURI !== "http://www.w3.org/2000/svg") {
        var i = n.getAttribute(t) || "";
        i = l + i;
        var c = e.get(i);
        c ? c.push(n) : e.set(i, [n]);
      }
    }
    return e;
  }
  function wd(l, t, a) {
    l = l.ownerDocument || l, l.head.insertBefore(a, t === "title" ? l.querySelector("head > title") : null);
  }
  function bo(l, t, a) {
    if (a === 1 || t.itemProp != null) return !1;
    switch (l) {
      case "meta":
      case "title":
        return !0;
      case "style":
        if (typeof t.precedence != "string" || typeof t.href != "string" || t.href === "") break;
        return !0;
      case "link":
        if (typeof t.rel != "string" || typeof t.href != "string" || t.href === "" || t.onLoad || t.onError) break;
        switch (t.rel) {
          case "stylesheet":
            return l = t.disabled, typeof t.precedence == "string" && l == null;
          default:
            return !0;
        }
      case "script":
        if (t.async && typeof t.async != "function" && typeof t.async != "symbol" && !t.onLoad && !t.onError && t.src && typeof t.src == "string") return !0;
    }
    return !1;
  }
  function kd(l) {
    return !(l.type === "stylesheet" && (l.state.loading & 3) === 0);
  }
  function So(l, t, a, e) {
    if (a.type === "stylesheet" && (typeof e.media != "string" || matchMedia(e.media).matches !== !1) && (a.state.loading & 4) === 0) {
      if (a.instance === null) {
        var u = Ee(e.href), n = t.querySelector(ou(u));
        if (n) {
          t = n._p, t !== null && typeof t == "object" && typeof t.then == "function" && (l.count++, l = Un.bind(l), t.then(l, l)), a.state.loading |= 4, a.instance = n, Gl(n);
          return;
        }
        n = t.ownerDocument || t, e = Vd(e), (u = Tt.get(u)) && kc(e, u), n = n.createElement("link"), Gl(n);
        var i = n;
        i._p = new Promise(function(c, d) {
          i.onload = c, i.onerror = d;
        }), Kl(n, "link", e), a.instance = n;
      }
      l.stylesheets === null && (l.stylesheets = /* @__PURE__ */ new Map()), l.stylesheets.set(a, t), (t = a.state.preload) && (a.state.loading & 3) === 0 && (l.count++, a = Un.bind(l), t.addEventListener("load", a), t.addEventListener("error", a));
    }
  }
  var $c = 0;
  function _o(l, t) {
    return l.stylesheets && l.count === 0 && xn(l, l.stylesheets), 0 < l.count || 0 < l.imgCount ? function(a) {
      var e = setTimeout(function() {
        if (l.stylesheets && xn(l, l.stylesheets), l.unsuspend) {
          var n = l.unsuspend;
          l.unsuspend = null, n();
        }
      }, 6e4 + t);
      0 < l.imgBytes && $c === 0 && ($c = 62500 * Pr());
      var u = setTimeout(function() {
        if (l.waitingForImages = !1, l.count === 0 && (l.stylesheets && xn(l, l.stylesheets), l.unsuspend)) {
          var n = l.unsuspend;
          l.unsuspend = null, n();
        }
      }, (l.imgBytes > $c ? 50 : 800) + t);
      return l.unsuspend = a, function() {
        l.unsuspend = null, clearTimeout(e), clearTimeout(u);
      };
    } : null;
  }
  function Un() {
    if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
      if (this.stylesheets) xn(this, this.stylesheets);
      else if (this.unsuspend) {
        var l = this.unsuspend;
        this.unsuspend = null, l();
      }
    }
  }
  var Hn = null;
  function xn(l, t) {
    l.stylesheets = null, l.unsuspend !== null && (l.count++, Hn = /* @__PURE__ */ new Map(), t.forEach(zo, l), Hn = null, Un.call(l));
  }
  function zo(l, t) {
    if (!(t.state.loading & 4)) {
      var a = Hn.get(l);
      if (a) var e = a.get(null);
      else {
        a = /* @__PURE__ */ new Map(), Hn.set(l, a);
        for (var u = l.querySelectorAll("link[data-precedence],style[data-precedence]"), n = 0; n < u.length; n++) {
          var i = u[n];
          (i.nodeName === "LINK" || i.getAttribute("media") !== "not all") && (a.set(i.dataset.precedence, i), e = i);
        }
        e && a.set(null, e);
      }
      u = t.instance, i = u.getAttribute("data-precedence"), n = a.get(i) || e, n === e && a.set(null, u), a.set(i, u), this.count++, e = Un.bind(this), u.addEventListener("load", e), u.addEventListener("error", e), n ? n.parentNode.insertBefore(u, n.nextSibling) : (l = l.nodeType === 9 ? l.head : l, l.insertBefore(u, l.firstChild)), t.state.loading |= 4;
    }
  }
  var hu = {
    $$typeof: bl,
    Provider: null,
    Consumer: null,
    _currentValue: il,
    _currentValue2: il,
    _threadCount: 0
  };
  function po(l, t, a, e, u, n, i, c, d) {
    this.tag = 1, this.containerInfo = l, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = wn(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = wn(0), this.hiddenUpdates = wn(null), this.identifierPrefix = e, this.onUncaughtError = u, this.onCaughtError = n, this.onRecoverableError = i, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = d, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function Eo(l, t, a, e, u, n, i, c, d, g, E, A) {
    return l = new po(l, t, a, i, d, g, E, A, c), t = 1, n === !0 && (t |= 24), n = st(3, null, null, t), l.current = n, n.stateNode = l, t = ji(), t.refCount++, l.pooledCache = t, t.refCount++, n.memoizedState = {
      element: e,
      isDehydrated: a,
      cache: t
    }, Ri(n), l;
  }
  function To(l) {
    return l ? (l = te, l) : te;
  }
  function Wd(l, t, a, e, u, n) {
    u = To(u), e.context === null ? e.context = u : e.pendingContext = u, e = Ba(t), e.payload = { element: a }, n = n === void 0 ? null : n, n !== null && (e.callback = n), a = Ya(l, e, t), a !== null && (et(a, l, t), we(a, l, t));
  }
  function $d(l, t) {
    if (l = l.memoizedState, l !== null && l.dehydrated !== null) {
      var a = l.retryLane;
      l.retryLane = a !== 0 && a < t ? a : t;
    }
  }
  function Fc(l, t) {
    $d(l, t), (l = l.alternate) && $d(l, t);
  }
  function Fd(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = Na(l, 67108864);
      t !== null && et(t, l, 67108864), Fc(l, 67108864);
    }
  }
  function Id(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = pt();
      t = gf(t);
      var a = Na(l, t);
      a !== null && et(a, l, t), Fc(l, t);
    }
  }
  var Rn = !0;
  function Mo(l, t, a, e) {
    var u = D.T;
    D.T = null;
    var n = B.p;
    try {
      B.p = 2, Ic(l, t, a, e);
    } finally {
      B.p = n, D.T = u;
    }
  }
  function Ao(l, t, a, e) {
    var u = D.T;
    D.T = null;
    var n = B.p;
    try {
      B.p = 8, Ic(l, t, a, e);
    } finally {
      B.p = n, D.T = u;
    }
  }
  function Ic(l, t, a, e) {
    if (Rn) {
      var u = Pc(e);
      if (u === null) qc(l, t, e, Cn, a), lv(l, e);
      else if (Oo(u, l, t, a, e)) e.stopPropagation();
      else if (lv(l, e), t & 4 && -1 < No.indexOf(l)) {
        for (; u !== null; ) {
          var n = Va(u);
          if (n !== null) switch (n.tag) {
            case 3:
              if (n = n.stateNode, n.current.memoizedState.isDehydrated) {
                var i = pa(n.pendingLanes);
                if (i !== 0) {
                  var c = n;
                  for (c.pendingLanes |= 2, c.entangledLanes |= 2; i; ) {
                    var d = 1 << 31 - ct(i);
                    c.entanglements[1] |= d, i &= ~d;
                  }
                  $t(n), (sl & 6) === 0 && (gn = nt() + 500, su(0, !1));
                }
              }
              break;
            case 31:
            case 13:
              c = Na(n, 2), c !== null && et(c, n, 2), Sn(), Fc(n, 2);
          }
          if (n = Pc(e), n === null && qc(l, t, e, Cn, a), n === u) break;
          u = n;
        }
        u !== null && e.stopPropagation();
      } else qc(l, t, e, null, a);
    }
  }
  function Pc(l) {
    return l = ai(l), lf(l);
  }
  var Cn = null;
  function lf(l) {
    if (Cn = null, l = La(l), l !== null) {
      var t = H(l);
      if (t === null) l = null;
      else {
        var a = t.tag;
        if (a === 13) {
          if (l = M(t), l !== null) return l;
          l = null;
        } else if (a === 31) {
          if (l = U(t), l !== null) return l;
          l = null;
        } else if (a === 3) {
          if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
          l = null;
        } else t !== l && (l = null);
      }
    }
    return Cn = l, null;
  }
  function Pd(l) {
    switch (l) {
      case "beforetoggle":
      case "cancel":
      case "click":
      case "close":
      case "contextmenu":
      case "copy":
      case "cut":
      case "auxclick":
      case "dblclick":
      case "dragend":
      case "dragstart":
      case "drop":
      case "focusin":
      case "focusout":
      case "input":
      case "invalid":
      case "keydown":
      case "keypress":
      case "keyup":
      case "mousedown":
      case "mouseup":
      case "paste":
      case "pause":
      case "play":
      case "pointercancel":
      case "pointerdown":
      case "pointerup":
      case "ratechange":
      case "reset":
      case "resize":
      case "seeked":
      case "submit":
      case "toggle":
      case "touchcancel":
      case "touchend":
      case "touchstart":
      case "volumechange":
      case "change":
      case "selectionchange":
      case "textInput":
      case "compositionstart":
      case "compositionend":
      case "compositionupdate":
      case "beforeblur":
      case "afterblur":
      case "beforeinput":
      case "blur":
      case "fullscreenchange":
      case "focus":
      case "hashchange":
      case "popstate":
      case "select":
      case "selectstart":
        return 2;
      case "drag":
      case "dragenter":
      case "dragexit":
      case "dragleave":
      case "dragover":
      case "mousemove":
      case "mouseout":
      case "mouseover":
      case "pointermove":
      case "pointerout":
      case "pointerover":
      case "scroll":
      case "touchmove":
      case "wheel":
      case "mouseenter":
      case "mouseleave":
      case "pointerenter":
      case "pointerleave":
        return 8;
      case "message":
        switch (Sv()) {
          case df:
            return 2;
          case vf:
            return 8;
          case pu:
          case _v:
            return 32;
          case rf:
            return 268435456;
          default:
            return 32;
        }
      default:
        return 32;
    }
  }
  var tf = !1, ya = null, ga = null, ba = null, yu = /* @__PURE__ */ new Map(), gu = /* @__PURE__ */ new Map(), Sa = [], No = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");
  function lv(l, t) {
    switch (l) {
      case "focusin":
      case "focusout":
        ya = null;
        break;
      case "dragenter":
      case "dragleave":
        ga = null;
        break;
      case "mouseover":
      case "mouseout":
        ba = null;
        break;
      case "pointerover":
      case "pointerout":
        yu.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        gu.delete(t.pointerId);
    }
  }
  function bu(l, t, a, e, u, n) {
    return l === null || l.nativeEvent !== n ? (l = {
      blockedOn: t,
      domEventName: a,
      eventSystemFlags: e,
      nativeEvent: n,
      targetContainers: [u]
    }, t !== null && (t = Va(t), t !== null && Fd(t)), l) : (l.eventSystemFlags |= e, t = l.targetContainers, u !== null && t.indexOf(u) === -1 && t.push(u), l);
  }
  function Oo(l, t, a, e, u) {
    switch (t) {
      case "focusin":
        return ya = bu(ya, l, t, a, e, u), !0;
      case "dragenter":
        return ga = bu(ga, l, t, a, e, u), !0;
      case "mouseover":
        return ba = bu(ba, l, t, a, e, u), !0;
      case "pointerover":
        var n = u.pointerId;
        return yu.set(n, bu(yu.get(n) || null, l, t, a, e, u)), !0;
      case "gotpointercapture":
        return n = u.pointerId, gu.set(n, bu(gu.get(n) || null, l, t, a, e, u)), !0;
    }
    return !1;
  }
  function tv(l) {
    var t = La(l.target);
    if (t !== null) {
      var a = H(t);
      if (a !== null) {
        if (t = a.tag, t === 13) {
          if (t = M(a), t !== null) {
            l.blockedOn = t, Sf(l.priority, function() {
              Id(a);
            });
            return;
          }
        } else if (t === 31) {
          if (t = U(a), t !== null) {
            l.blockedOn = t, Sf(l.priority, function() {
              Id(a);
            });
            return;
          }
        } else if (t === 3 && a.stateNode.current.memoizedState.isDehydrated) {
          l.blockedOn = a.tag === 3 ? a.stateNode.containerInfo : null;
          return;
        }
      }
    }
    l.blockedOn = null;
  }
  function Bn(l) {
    if (l.blockedOn !== null) return !1;
    for (var t = l.targetContainers; 0 < t.length; ) {
      var a = Pc(l.nativeEvent);
      if (a === null) {
        a = l.nativeEvent;
        var e = new a.constructor(a.type, a);
        ti = e, a.target.dispatchEvent(e), ti = null;
      } else return t = Va(a), t !== null && Fd(t), l.blockedOn = a, !1;
      t.shift();
    }
    return !0;
  }
  function av(l, t, a) {
    Bn(l) && a.delete(t);
  }
  function Do() {
    tf = !1, ya !== null && Bn(ya) && (ya = null), ga !== null && Bn(ga) && (ga = null), ba !== null && Bn(ba) && (ba = null), yu.forEach(av), gu.forEach(av);
  }
  function Yn(l, t) {
    l.blockedOn === t && (l.blockedOn = null, tf || (tf = !0, o.unstable_scheduleCallback(o.unstable_NormalPriority, Do)));
  }
  var qn = null;
  function ev(l) {
    qn !== l && (qn = l, o.unstable_scheduleCallback(o.unstable_NormalPriority, function() {
      qn === l && (qn = null);
      for (var t = 0; t < l.length; t += 3) {
        var a = l[t], e = l[t + 1], u = l[t + 2];
        if (typeof e != "function") {
          if (lf(e || a) === null) continue;
          break;
        }
        var n = Va(a);
        n !== null && (l.splice(t, 3), t -= 3, lc(n, {
          pending: !0,
          data: u,
          method: a.method,
          action: e
        }, e, u));
      }
    }));
  }
  function Me(l) {
    function t(d) {
      return Yn(d, l);
    }
    ya !== null && Yn(ya, l), ga !== null && Yn(ga, l), ba !== null && Yn(ba, l), yu.forEach(t), gu.forEach(t);
    for (var a = 0; a < Sa.length; a++) {
      var e = Sa[a];
      e.blockedOn === l && (e.blockedOn = null);
    }
    for (; 0 < Sa.length && (a = Sa[0], a.blockedOn === null); ) tv(a), a.blockedOn === null && Sa.shift();
    if (a = (l.ownerDocument || l).$$reactFormReplay, a != null) for (e = 0; e < a.length; e += 3) {
      var u = a[e], n = a[e + 1], i = u[Fl] || null;
      if (typeof n == "function") i || ev(a);
      else if (i) {
        var c = null;
        if (n && n.hasAttribute("formAction")) {
          if (u = n, i = n[Fl] || null) c = i.formAction;
          else if (lf(u) !== null) continue;
        } else c = i.action;
        typeof c == "function" ? a[e + 1] = c : (a.splice(e, 3), e -= 3), ev(a);
      }
    }
  }
  function jo() {
    function l(n) {
      n.canIntercept && n.info === "react-transition" && n.intercept({
        handler: function() {
          return new Promise(function(i) {
            return u = i;
          });
        },
        focusReset: "manual",
        scroll: "manual"
      });
    }
    function t() {
      u !== null && (u(), u = null), e || setTimeout(a, 20);
    }
    function a() {
      if (!e && !navigation.transition) {
        var n = navigation.currentEntry;
        n && n.url != null && navigation.navigate(n.url, {
          state: n.getState(),
          info: "react-transition",
          history: "replace"
        });
      }
    }
    if (typeof navigation == "object") {
      var e = !1, u = null;
      return navigation.addEventListener("navigate", l), navigation.addEventListener("navigatesuccess", t), navigation.addEventListener("navigateerror", t), setTimeout(a, 100), function() {
        e = !0, navigation.removeEventListener("navigate", l), navigation.removeEventListener("navigatesuccess", t), navigation.removeEventListener("navigateerror", t), u !== null && (u(), u = null);
      };
    }
  }
  function af(l) {
    this._internalRoot = l;
  }
  ef.prototype.render = af.prototype.render = function(l) {
    var t = this._internalRoot;
    if (t === null) throw Error(s(409));
    var a = t.current;
    Wd(a, pt(), l, t, null, null);
  }, ef.prototype.unmount = af.prototype.unmount = function() {
    var l = this._internalRoot;
    if (l !== null) {
      this._internalRoot = null;
      var t = l.containerInfo;
      Wd(l.current, 2, null, l, null, null), Sn(), t[De] = null;
    }
  };
  function ef(l) {
    this._internalRoot = l;
  }
  ef.prototype.unstable_scheduleHydration = function(l) {
    if (l) {
      var t = bf();
      l = {
        blockedOn: null,
        target: l,
        priority: t
      };
      for (var a = 0; a < Sa.length && t !== 0 && t < Sa[a].priority; a++) ;
      Sa.splice(a, 0, l), a === 0 && tv(l);
    }
  };
  var uv = _.version;
  if (uv !== "19.2.8") throw Error(s(527, uv, "19.2.8"));
  B.findDOMNode = function(l) {
    var t = l._reactInternals;
    if (t === void 0)
      throw typeof l.render == "function" ? Error(s(188)) : (l = Object.keys(l).join(","), Error(s(268, l)));
    return l = p(t), l = l !== null ? R(l) : null, l = l === null ? null : l.stateNode, l;
  };
  var Uo = {
    bundleType: 0,
    version: "19.2.8",
    rendererPackageName: "react-dom",
    currentDispatcherRef: D,
    reconcilerVersion: "19.2.8"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Gn = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Gn.isDisabled && Gn.supportsFiber) try {
      Ne = Gn.inject(Uo), it = Gn;
    } catch {
    }
  }
  f.createRoot = function(l, t) {
    if (!j(l)) throw Error(s(299));
    var a = !1, e = "", u = Mr, n = Ar, i = Nr;
    return t != null && (t.unstable_strictMode === !0 && (a = !0), t.identifierPrefix !== void 0 && (e = t.identifierPrefix), t.onUncaughtError !== void 0 && (u = t.onUncaughtError), t.onCaughtError !== void 0 && (n = t.onCaughtError), t.onRecoverableError !== void 0 && (i = t.onRecoverableError)), t = Eo(l, 1, !1, null, null, a, e, null, u, n, i, jo), l[De] = t.current, Md(l), new af(t);
  };
})), Ko = /* @__PURE__ */ Ut(((f, o) => {
  function _() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(_);
      } catch (z) {
        console.error(z);
      }
  }
  _(), o.exports = Vo();
})), Jo = /* @__PURE__ */ Ut(((f) => {
  var o = Symbol.for("react.transitional.element"), _ = Symbol.for("react.fragment");
  function z(s, j, H) {
    var M = null;
    if (H !== void 0 && (M = "" + H), j.key !== void 0 && (M = "" + j.key), "key" in j) {
      H = {};
      for (var U in j) U !== "key" && (H[U] = j[U]);
    } else H = j;
    return j = H.ref, {
      $$typeof: o,
      type: s,
      key: M,
      ref: j !== void 0 ? j : null,
      props: H
    };
  }
  f.Fragment = _, f.jsx = z, f.jsxs = z;
})), wo = /* @__PURE__ */ Ut(((f, o) => {
  o.exports = Jo();
})), ko = Ko(), X = /* @__PURE__ */ qo(nf()), m = wo(), Wo = 1, vv = (0, X.createContext)(null);
function d1({ knopf: f, children: o }) {
  const [_, z] = (0, X.useState)([]), s = (0, X.useCallback)((M) => (z((U) => [...U, M]), () => z((U) => U.filter((O) => O !== M))), []), j = _.length > 0 ? Math.min(..._) : null, H = (0, X.useMemo)(() => ({
    knopf: f,
    erster: j,
    anmelden: s
  }), [
    f,
    j,
    s
  ]);
  return /* @__PURE__ */ (0, m.jsxs)(vv.Provider, {
    value: H,
    children: [j === null && /* @__PURE__ */ (0, m.jsx)("div", {
      className: "ara-kopf__vorne ara-kopf__vorne--allein",
      children: f
    }), o]
  });
}
function v1({ titel: f, beschreibung: o, werkzeuge: _, aktionen: z, vorne: s, mittig: j = !1, ebene: H = 1 }) {
  const M = H === 2 ? "h2" : "h1", U = (0, X.useRef)(null), O = $o(U, j), p = (0, X.useContext)(vv), [R] = (0, X.useState)(() => Wo++), C = p?.anmelden, ul = !j && s === void 0 && !!C;
  (0, X.useLayoutEffect)(() => ul && C ? C(R) : void 0, [
    ul,
    C,
    R
  ]);
  const $ = j ? null : s !== void 0 ? s : p?.erster === R ? p.knopf : null;
  return /* @__PURE__ */ (0, m.jsxs)("header", {
    ref: U,
    className: "ara-kopf",
    "data-mittig": j ? "true" : void 0,
    style: O === null ? void 0 : { paddingRight: O },
    children: [
      /* @__PURE__ */ (0, m.jsxs)("div", {
        className: "ara-kopf__text",
        children: [/* @__PURE__ */ (0, m.jsx)(M, {
          className: "ara-kopf__titel",
          children: f
        }), o && /* @__PURE__ */ (0, m.jsx)("p", {
          className: "ara-kopf__satz",
          children: o
        })]
      }),
      !j && (_ || $) && /* @__PURE__ */ (0, m.jsxs)("div", {
        className: "ara-kopf__werkzeuge",
        role: "toolbar",
        "aria-label": `Aktionen: ${f}`,
        children: [
          _,
          _ && $ && /* @__PURE__ */ (0, m.jsx)("span", {
            className: "ara-kopf__trenner",
            "aria-hidden": "true"
          }),
          $ && /* @__PURE__ */ (0, m.jsx)("span", {
            className: "ara-kopf__vorne",
            children: $
          })
        ]
      }),
      z && /* @__PURE__ */ (0, m.jsx)("div", {
        className: "ara-kopf__aktionen",
        children: z
      })
    ]
  });
}
function $o(f, o) {
  const [_, z] = (0, X.useState)(null);
  return (0, X.useLayoutEffect)(() => {
    if (o || typeof window > "u") return;
    const s = () => {
      const H = f.current;
      if (!H) return;
      const M = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ara-kapsel-platz"));
      if (!Number.isFinite(M) || M <= 0) {
        z(0);
        return;
      }
      const U = document.documentElement.clientWidth - H.getBoundingClientRect().right;
      z(Math.max(0, Math.ceil(M - U)));
    };
    s();
    const j = typeof ResizeObserver > "u" ? null : new ResizeObserver(s);
    return j?.observe(document.documentElement), window.addEventListener("resize", s), () => {
      j?.disconnect(), window.removeEventListener("resize", s);
    };
  }, [f, o]), _;
}
function r1({ symbol: f, beschriftung: o, aktiv: _, type: z = "button", className: s, ...j }) {
  return /* @__PURE__ */ (0, m.jsx)("button", {
    type: z,
    className: s ? `ara-werkzeug ${s}` : "ara-werkzeug",
    "aria-label": o,
    title: o,
    "aria-pressed": _ === void 0 ? void 0 : _,
    ...j,
    children: /* @__PURE__ */ (0, m.jsx)("span", {
      className: "ara-werkzeug__symbol",
      "aria-hidden": "true",
      children: f
    })
  });
}
function o1({ beschriftung: f, dicht: o = !1, children: _ }) {
  return /* @__PURE__ */ (0, m.jsxs)("div", { children: [f && /* @__PURE__ */ (0, m.jsx)("div", {
    className: "ara-liste__beschriftung",
    children: f
  }), /* @__PURE__ */ (0, m.jsx)("ul", {
    className: "ara-liste",
    "data-dicht": o ? "true" : void 0,
    "aria-label": f,
    children: _
  })] });
}
function m1({ titel: f, symbol: o, hinweis: _, unterzeile: z, erklaerung: s, onKlick: j, aktiv: H = !1, kennzeichen: M }) {
  const U = /* @__PURE__ */ (0, m.jsxs)(m.Fragment, { children: [
    o && /* @__PURE__ */ (0, m.jsx)("span", {
      className: "ara-liste__symbol",
      "aria-hidden": "true",
      children: o
    }),
    /* @__PURE__ */ (0, m.jsxs)("span", {
      className: "ara-liste__text",
      children: [/* @__PURE__ */ (0, m.jsx)("span", {
        className: "ara-liste__wort",
        children: f
      }), z && /* @__PURE__ */ (0, m.jsx)("span", {
        className: "ara-liste__unterzeile",
        children: z
      })]
    }),
    _ && /* @__PURE__ */ (0, m.jsx)("span", {
      className: "ara-liste__hinweis",
      children: _
    })
  ] });
  return /* @__PURE__ */ (0, m.jsx)("li", { children: j ? /* @__PURE__ */ (0, m.jsx)("button", {
    type: "button",
    className: "ara-liste__eintrag",
    "data-aktiv": H ? "true" : "false",
    "aria-current": H ? "true" : void 0,
    "data-testid": M,
    title: s,
    onClick: j,
    children: U
  }) : /* @__PURE__ */ (0, m.jsx)("div", {
    className: "ara-liste__eintrag",
    "data-aktiv": H ? "true" : "false",
    "data-testid": M,
    title: s,
    children: U
  }) });
}
function h1({ titel: f, hinweis: o, symbol: _, onKlick: z, kennzeichen: s, children: j }) {
  const H = (f || o) && /* @__PURE__ */ (0, m.jsxs)("div", {
    className: "ara-karte__kopf",
    children: [f && /* @__PURE__ */ (0, m.jsx)("h2", {
      className: "ara-karte__titel",
      children: f
    }), o && /* @__PURE__ */ (0, m.jsx)("span", {
      className: "ara-karte__hinweis",
      children: o
    })]
  }), M = j && /* @__PURE__ */ (0, m.jsx)("div", {
    className: "ara-karte__inhalt",
    children: j
  }), U = _ ? /* @__PURE__ */ (0, m.jsxs)(m.Fragment, { children: [/* @__PURE__ */ (0, m.jsx)("span", {
    className: "ara-karte__symbol",
    "aria-hidden": "true",
    children: _
  }), /* @__PURE__ */ (0, m.jsxs)("div", {
    className: "ara-karte__rumpf",
    children: [H, M]
  })] }) : /* @__PURE__ */ (0, m.jsxs)(m.Fragment, { children: [H, M] });
  return z ? /* @__PURE__ */ (0, m.jsx)("button", {
    type: "button",
    className: "ara-karte",
    "data-symbol": _ ? "" : void 0,
    "data-testid": s,
    onClick: z,
    children: U
  }) : /* @__PURE__ */ (0, m.jsx)("div", {
    className: "ara-karte",
    "data-symbol": _ ? "" : void 0,
    "data-testid": s,
    children: U
  });
}
function y1({ onAbsenden: f, aktionen: o, kennzeichen: _, children: z }) {
  const s = (j) => {
    j.preventDefault(), f?.();
  };
  return /* @__PURE__ */ (0, m.jsxs)("form", {
    className: "ara-formular",
    "data-testid": _,
    onSubmit: s,
    noValidate: !0,
    children: [z, o && /* @__PURE__ */ (0, m.jsx)("div", {
      className: "ara-formular__aktionen",
      children: o
    })]
  });
}
function g1({ kennung: f, beschriftung: o, hinweis: _, children: z }) {
  return /* @__PURE__ */ (0, m.jsxs)("div", {
    className: "ara-feld",
    children: [
      /* @__PURE__ */ (0, m.jsx)("label", {
        className: "ara-feld__beschriftung",
        htmlFor: f,
        children: o
      }),
      z,
      _ && /* @__PURE__ */ (0, m.jsx)("p", {
        className: "ara-feld__hinweis",
        children: _
      })
    ]
  });
}
function Su({ art: f = "still", typ: o = "knopf", onKlick: _, gesperrt: z = !1, kennzeichen: s, beschriftung: j, children: H }) {
  return /* @__PURE__ */ (0, m.jsx)("button", {
    type: o === "absenden" ? "submit" : "button",
    className: "ara-knopf",
    "data-art": f,
    "data-testid": s,
    "aria-label": j,
    disabled: z,
    onClick: _,
    children: H
  });
}
var rv = {
  start: ["M4 11l8-7 8 7", "M6 10v9h12v-9"],
  fuerSie: ["M4 13l2-7h12l2 7v5H4z", "M4 13h5l1 2h4l1-2h5"],
  plus: ["M12 5v14", "M5 12h14"],
  store: ["M5 8h14l-1 12H6z", "M9 8V7a3 3 0 0 1 6 0v1"],
  zuletzt: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
  suche: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-4-4"],
  idee: [
    "M9 18h6",
    "M10 21h4",
    "M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"
  ],
  live: [
    "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    "M7.8 7.8a6 6 0 0 0 0 8.4",
    "M16.2 7.8a6 6 0 0 1 0 8.4"
  ],
  test: ["M9 3h6", "M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"],
  rueckmeldung: ["M4 5h16v11H9l-5 4z", "M8 10h8"],
  zurueck: ["M15 5l-7 7 7 7"],
  weiter: ["M9 5l7 7-7 7"],
  unten: ["M5 9l7 7 7-7"],
  schliessen: ["M6 6l12 12", "M18 6L6 18"],
  haken: ["M5 12.5l4.5 4.5L19 7.5"],
  rueckgaengig: ["M9 14L4 9l5-5", "M4 9h10a6 6 0 0 1 0 12h-3"],
  angebote: [
    "M7 3h7l4 4v14H7z",
    "M14 3v4h4",
    "M10 13h5"
  ],
  kalender: [
    "M4 6h16v14H4z",
    "M4 10h16",
    "M8 3v4M16 3v4"
  ],
  personen: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 20a8 8 0 0 1 16 0"],
  einstellungen: [
    "M4 8h9M17 8h3",
    "M4 16h3M11 16h9",
    "M15 6v4M9 14v4"
  ],
  lager: [
    "M4 8l8-4 8 4v8l-8 4-8-4z",
    "M4 8l8 4 8-4",
    "M12 12v8"
  ],
  bauen: ["M12 4v4M12 16v4M4 12h4M16 12h4", "M12 10l1 1-1 1-1-1z"],
  freigabe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M8.5 12.5l2.5 2.5 4.5-5"],
  ziehen: [
    "M9 6h.01M15 6h.01",
    "M9 12h.01M15 12h.01",
    "M9 18h.01M15 18h.01"
  ]
}, b1 = Object.keys(rv);
function Za({ name: f, groesse: o = 20, titel: _ }) {
  return /* @__PURE__ */ (0, m.jsx)("svg", {
    className: "ara-linie",
    width: o,
    height: o,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    role: _ ? "img" : void 0,
    "aria-label": _,
    "aria-hidden": _ ? void 0 : !0,
    focusable: "false",
    children: rv[f].map((z) => /* @__PURE__ */ (0, m.jsx)("path", { d: z }, z))
  });
}
function cf({ symbol: f, groesse: o = 44, titel: _ }) {
  const z = { "--ara-appicon": `${o}px` };
  return /* @__PURE__ */ (0, m.jsx)("span", {
    className: "ara-appicon",
    style: z,
    "data-groesse": o,
    children: /* @__PURE__ */ (0, m.jsx)(Za, {
      name: f,
      groesse: o >= 64 || o >= 44 ? 24 : 16,
      titel: _
    })
  });
}
function S1({ als: f = "div", form: o = "karte", kennzeichen: _, className: z, children: s }) {
  return /* @__PURE__ */ (0, m.jsx)(f, {
    className: z ? `ara-glas ${z}` : "ara-glas",
    "data-form": o,
    "data-testid": _,
    children: s
  });
}
function Xn({ symbol: f, hinweis: o, art: _ = "glas", groesse: z = 20, aktiv: s, gesperrt: j, onKlick: H, kennzeichen: M }) {
  return /* @__PURE__ */ (0, m.jsx)("button", {
    type: "button",
    className: "ara-iknopf",
    "data-art": _,
    "data-hinweis": o,
    "aria-label": o,
    "aria-pressed": s,
    disabled: j,
    onClick: H,
    "data-testid": M,
    children: /* @__PURE__ */ (0, m.jsx)(Za, {
      name: f,
      groesse: z
    })
  });
}
function _1({ children: f, symbol: o, typ: _ = "knopf", gesperrt: z, onKlick: s, kennzeichen: j }) {
  return /* @__PURE__ */ (0, m.jsxs)("button", {
    type: _ === "absenden" ? "submit" : "button",
    className: "ara-kapsel",
    disabled: z,
    onClick: s,
    "data-testid": j,
    children: [o && /* @__PURE__ */ (0, m.jsx)(Za, {
      name: o,
      groesse: 16
    }), f]
  });
}
function z1({ children: f, hinweis: o, gesperrt: _, onKlick: z, kennzeichen: s }) {
  return /* @__PURE__ */ (0, m.jsx)("button", {
    type: "button",
    className: "ara-textknopf",
    "data-hinweis": o,
    disabled: _,
    onClick: z,
    "data-testid": s,
    children: f
  });
}
var Fo = 5e3;
function p1({ art: f = "hinweis", titel: o, kennzeichen: _, beiRueckgaengig: z, frist: s = Fo, beiAblauf: j, children: H }) {
  const M = (0, X.useRef)(j);
  M.current = j;
  const U = !!z;
  return (0, X.useEffect)(() => {
    if (!U) return;
    const O = setTimeout(() => M.current?.(), s);
    return () => clearTimeout(O);
  }, [U, s]), /* @__PURE__ */ (0, m.jsxs)("div", {
    className: U ? "ara-glas ara-meldung" : "ara-meldung",
    "data-form": U ? "kapsel" : void 0,
    "data-art": f,
    "data-rueckgaengig": U ? "true" : void 0,
    "data-testid": _,
    role: f === "fehler" ? "alert" : "status",
    children: [
      U && /* @__PURE__ */ (0, m.jsx)(Za, {
        name: "haken",
        groesse: 20
      }),
      /* @__PURE__ */ (0, m.jsxs)("div", {
        className: "ara-meldung__text",
        children: [o && /* @__PURE__ */ (0, m.jsx)("p", {
          className: "ara-meldung__titel",
          children: o
        }), H]
      }),
      z && /* @__PURE__ */ (0, m.jsx)(Xn, {
        symbol: "rueckgaengig",
        hinweis: "Rückgängig",
        art: "flach",
        onKlick: z
      }),
      U && /* @__PURE__ */ (0, m.jsx)("span", {
        className: "ara-meldung__frist",
        style: { animationDuration: `${s}ms` },
        "aria-hidden": "true"
      })
    ]
  });
}
function nv(f) {
  return f ? [...f.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')] : [];
}
function E1({ offen: f, onSchliessen: o, titel: _ = "Menü", kennzeichen: z, children: s }) {
  const j = (0, X.useRef)(null), H = (0, X.useRef)(null);
  return (0, X.useEffect)(() => {
    if (!f) return;
    H.current = document.activeElement;
    const M = (U) => {
      if (U.key === "Escape") {
        o();
        return;
      }
      if (U.key !== "Tab") return;
      const O = nv(j.current);
      if (O.length === 0) return;
      const p = O[0], R = O[O.length - 1], C = document.activeElement;
      U.shiftKey && (C === p || !j.current?.contains(C)) ? (U.preventDefault(), R.focus()) : !U.shiftKey && C === R && (U.preventDefault(), p.focus());
    };
    return document.addEventListener("keydown", M), nv(j.current)[0]?.focus(), () => {
      document.removeEventListener("keydown", M), H.current?.focus?.();
    };
  }, [f, o]), f ? /* @__PURE__ */ (0, m.jsxs)(m.Fragment, { children: [/* @__PURE__ */ (0, m.jsx)("button", {
    type: "button",
    className: "ara-menue__schleier",
    "aria-label": `${_} schließen`,
    onClick: o
  }), /* @__PURE__ */ (0, m.jsxs)("div", {
    className: "ara-menue",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": _,
    "data-testid": z,
    ref: j,
    children: [/* @__PURE__ */ (0, m.jsxs)("div", {
      className: "ara-menue__kopf",
      children: [/* @__PURE__ */ (0, m.jsx)("span", { children: _ }), /* @__PURE__ */ (0, m.jsx)("button", {
        type: "button",
        className: "ara-menue__zu",
        "aria-label": `${_} schließen`,
        onClick: o,
        children: "×"
      })]
    }), /* @__PURE__ */ (0, m.jsx)("div", {
      className: "ara-menue__inhalt",
      children: s
    })]
  })] }) : null;
}
function T1({ links: f, mitte: o, rechts: _, test: z, beschriftung: s = "Kopfleiste", kennzeichen: j }) {
  return /* @__PURE__ */ (0, m.jsxs)("header", {
    className: "ara-glas ara-leiste",
    "data-test": z ? "true" : void 0,
    "data-testid": j,
    "aria-label": s,
    children: [
      /* @__PURE__ */ (0, m.jsx)("div", {
        className: "ara-leiste__links",
        children: f
      }),
      o && /* @__PURE__ */ (0, m.jsx)("div", {
        className: "ara-leiste__mitte",
        children: o
      }),
      /* @__PURE__ */ (0, m.jsx)("div", {
        className: "ara-leiste__rechts",
        children: _
      })
    ]
  });
}
function M1({ beschriftung: f = "Hauptnavigation", kennzeichen: o, children: _ }) {
  const z = (0, X.useRef)(null), [s, j] = (0, X.useState)(null);
  (0, X.useLayoutEffect)(() => {
    const M = () => {
      const O = z.current?.querySelector('[aria-current="page"]'), p = O ? {
        x: O.offsetLeft,
        b: O.offsetWidth
      } : null;
      j((R) => R?.x === p?.x && R?.b === p?.b ? R : p);
    };
    if (M(), document.fonts?.ready.then(M), typeof ResizeObserver > "u" || !z.current) return;
    const U = new ResizeObserver(M);
    return U.observe(z.current), () => U.disconnect();
  });
  const H = s ? {
    "--ara-dock-x": `${s.x}px`,
    "--ara-dock-b": `${s.b}px`
  } : void 0;
  return /* @__PURE__ */ (0, m.jsxs)("nav", {
    className: "ara-glas ara-dock",
    "aria-label": f,
    "data-testid": o,
    ref: z,
    style: H,
    children: [s && /* @__PURE__ */ (0, m.jsx)("span", {
      className: "ara-dock__marke",
      "aria-hidden": "true"
    }), _]
  });
}
function A1({ symbol: f, beschriftung: o, aktiv: _, zahl: z, plus: s, onKlick: j, kennzeichen: H }) {
  return /* @__PURE__ */ (0, m.jsxs)("button", {
    type: "button",
    className: "ara-dock__eintrag",
    "data-plus": s ? "true" : void 0,
    "aria-label": z ? `${o}, ${z} offen` : o,
    "aria-current": _ ? "page" : void 0,
    onClick: j,
    "data-testid": H,
    children: [
      /* @__PURE__ */ (0, m.jsx)(Za, {
        name: f,
        groesse: s ? 24 : 20
      }),
      !s && /* @__PURE__ */ (0, m.jsx)("span", {
        className: "ara-dock__wort",
        children: o
      }),
      z ? /* @__PURE__ */ (0, m.jsx)("span", {
        className: "ara-dock__zahl",
        children: z > 99 ? "99+" : z
      }) : null
    ]
  });
}
function iv(f) {
  return f ? [...f.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')] : [];
}
function ov(f, o, _, z) {
  (0, X.useEffect)(() => {
    if (!f) return;
    const s = document.activeElement, j = (H) => {
      if (H.key === "Escape") {
        H.stopPropagation(), _();
        return;
      }
      if (H.key !== "Tab") return;
      const M = iv(o.current);
      if (M.length === 0) return;
      const U = M[0], O = M[M.length - 1], p = document.activeElement;
      H.shiftKey && (p === U || !o.current?.contains(p)) ? (H.preventDefault(), O.focus()) : !H.shiftKey && (p === O || !o.current?.contains(p)) && (H.preventDefault(), U.focus());
    };
    return document.addEventListener("keydown", j), (z?.current ?? iv(o.current)[0])?.focus(), () => {
      document.removeEventListener("keydown", j), s?.focus?.();
    };
  }, [
    f,
    _,
    o,
    z
  ]);
}
function N1({ offen: f, onSchliessen: o, titel: _, suche: z, leerText: s = "Nichts gefunden.", leer: j, kennzeichen: H, children: M }) {
  const U = (0, X.useRef)(null), O = (0, X.useRef)(null);
  if (ov(f, U, o, z ? O : void 0), !f) return null;
  const p = (R) => {
    if (R.key !== "ArrowDown" && R.key !== "ArrowUp") return;
    const C = [...U.current?.querySelectorAll("input, .ara-popup__eintrag") ?? []], ul = C[(C.indexOf(document.activeElement) + (R.key === "ArrowDown" ? 1 : -1) + C.length) % C.length];
    ul && (R.preventDefault(), ul.focus());
  };
  return /* @__PURE__ */ (0, m.jsxs)(m.Fragment, { children: [/* @__PURE__ */ (0, m.jsx)("button", {
    type: "button",
    tabIndex: -1,
    className: "ara-schleier",
    "aria-label": `${_} schließen`,
    onClick: o
  }), /* @__PURE__ */ (0, m.jsxs)("div", {
    className: "ara-glas ara-popup",
    "data-form": "karte",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": _,
    "data-testid": H,
    ref: U,
    onKeyDown: p,
    children: [z && /* @__PURE__ */ (0, m.jsxs)("label", {
      className: "ara-popup__suche",
      children: [
        /* @__PURE__ */ (0, m.jsx)(Za, {
          name: "suche",
          groesse: 20
        }),
        /* @__PURE__ */ (0, m.jsx)("input", {
          ref: O,
          type: "search",
          value: z.wert,
          placeholder: z.platzhalter ?? "Suchen",
          "aria-label": z.platzhalter ?? "Suchen",
          onChange: (R) => z.onAendern(R.target.value)
        }),
        /* @__PURE__ */ (0, m.jsx)("kbd", {
          className: "ara-popup__kuerzel",
          children: "esc"
        })
      ]
    }), /* @__PURE__ */ (0, m.jsx)("div", {
      className: "ara-popup__inhalt",
      children: j ? /* @__PURE__ */ (0, m.jsx)("p", {
        className: "ara-popup__leer",
        children: s
      }) : M
    })]
  })] });
}
function O1({ titel: f, children: o }) {
  return /* @__PURE__ */ (0, m.jsxs)("section", {
    className: "ara-popup__gruppe",
    "aria-label": f,
    children: [/* @__PURE__ */ (0, m.jsx)("h2", {
      className: "ara-popup__gruppentitel",
      children: f
    }), o]
  });
}
function D1({ symbol: f, app: o, titel: _, unterzeile: z, kuerzel: s, onWaehlen: j }) {
  return /* @__PURE__ */ (0, m.jsxs)("button", {
    type: "button",
    className: "ara-popup__eintrag",
    onClick: j,
    children: [
      f && (o ? /* @__PURE__ */ (0, m.jsx)(cf, {
        symbol: f,
        groesse: 32
      }) : /* @__PURE__ */ (0, m.jsx)(Za, {
        name: f,
        groesse: 20
      })),
      /* @__PURE__ */ (0, m.jsxs)("span", {
        className: "ara-popup__text",
        children: [/* @__PURE__ */ (0, m.jsx)("span", {
          className: "ara-popup__titel",
          children: _
        }), z && /* @__PURE__ */ (0, m.jsx)("span", {
          className: "ara-popup__unterzeile",
          children: z
        })]
      }),
      s && /* @__PURE__ */ (0, m.jsx)("kbd", {
        className: "ara-popup__kuerzel",
        children: s
      })
    ]
  });
}
var Io = 80;
function j1({ offen: f, onSchliessen: o, art: _ = "blatt", titel: z, aktionen: s, kennzeichen: j, children: H }) {
  const M = (0, X.useRef)(null), U = (0, X.useRef)(null), [O, p] = (0, X.useState)(0);
  if (ov(f, M, o), !f) return null;
  const R = ($) => {
    U.current = $.clientY, $.currentTarget.setPointerCapture?.($.pointerId);
  }, C = ($) => {
    U.current !== null && p(Math.max(0, $.clientY - U.current));
  }, ul = () => {
    if (U.current === null) return;
    const $ = O > Io;
    U.current = null, p(0), $ && o();
  };
  return /* @__PURE__ */ (0, m.jsxs)(m.Fragment, { children: [_ === "blatt" && /* @__PURE__ */ (0, m.jsx)("button", {
    type: "button",
    tabIndex: -1,
    className: "ara-ebene__schleier",
    "aria-label": `${z} schließen`,
    onClick: o
  }), /* @__PURE__ */ (0, m.jsx)("div", {
    className: "ara-ebene",
    "data-art": _,
    role: "dialog",
    "aria-modal": "true",
    "aria-label": z,
    "data-testid": j,
    ref: M,
    style: O ? {
      transform: `translateY(${O}px)`,
      transition: "none"
    } : void 0,
    children: _ === "blatt" ? /* @__PURE__ */ (0, m.jsxs)(m.Fragment, { children: [
      /* @__PURE__ */ (0, m.jsx)("div", {
        className: "ara-ebene__griff",
        onPointerDown: R,
        onPointerMove: C,
        onPointerUp: ul,
        onPointerCancel: ul,
        children: /* @__PURE__ */ (0, m.jsx)("span", {})
      }),
      /* @__PURE__ */ (0, m.jsxs)("div", {
        className: "ara-ebene__kopf",
        children: [/* @__PURE__ */ (0, m.jsx)("h2", {
          className: "ara-ebene__titel",
          children: z
        }), /* @__PURE__ */ (0, m.jsx)(Xn, {
          symbol: "schliessen",
          hinweis: "Schließen",
          art: "flach",
          onKlick: o
        })]
      }),
      /* @__PURE__ */ (0, m.jsx)("div", {
        className: "ara-ebene__rumpf",
        children: H
      }),
      s && /* @__PURE__ */ (0, m.jsx)("div", {
        className: "ara-ebene__aktionen",
        children: s
      })
    ] }) : /* @__PURE__ */ (0, m.jsxs)(m.Fragment, { children: [/* @__PURE__ */ (0, m.jsx)("div", {
      className: "ara-ebene__x",
      children: /* @__PURE__ */ (0, m.jsx)(Xn, {
        symbol: "schliessen",
        hinweis: "Schließen",
        onKlick: o
      })
    }), /* @__PURE__ */ (0, m.jsx)("div", {
      className: "ara-ebene__rumpf",
      "data-vollbild": "true",
      children: H
    })] })
  })] });
}
function U1({ titel: f, symbol: o, werkzeuge: _, zurueck: z, hoehe: s = 420, kennzeichen: j, children: H }) {
  return /* @__PURE__ */ (0, m.jsxs)("section", {
    className: "ara-fenster",
    style: { height: s },
    "aria-label": f,
    "data-testid": j,
    children: [/* @__PURE__ */ (0, m.jsxs)("div", {
      className: "ara-glas ara-fenster__leiste",
      "data-form": "leiste",
      children: [
        z,
        /* @__PURE__ */ (0, m.jsx)(cf, {
          symbol: o,
          groesse: 32
        }),
        /* @__PURE__ */ (0, m.jsx)("span", {
          className: "ara-fenster__titel",
          children: f
        }),
        /* @__PURE__ */ (0, m.jsx)("div", {
          className: "ara-fenster__werkzeuge",
          children: _
        })
      ]
    }), /* @__PURE__ */ (0, m.jsx)("div", {
      className: "ara-fenster__inhalt",
      children: H
    })]
  });
}
var H1 = 400, Po = 4;
function x1({ stufen: f, karten: o, beiVerschieben: _, beiOeffnen: z, beschriftung: s = "Board", kennzeichen: j, leerText: H = "Leer" }) {
  const M = (0, X.useRef)(null), [U, O] = (0, X.useState)(null), [p, R] = (0, X.useState)(null), [C, ul] = (0, X.useState)({
    x: 0,
    y: 0
  }), $ = (0, X.useRef)(!1), gl = (V, Z) => document.elementFromPoint(V, Z)?.closest("[data-stufe]")?.dataset.stufe ?? null, Tl = (V, Z) => {
    V.aktiv = !0, O(V.id), Z.currentTarget.setPointerCapture?.(V.pointerId);
  }, Jl = (V, Z) => {
    if (Z.button > 0) return;
    const G = {
      id: V.id,
      pointerId: Z.pointerId,
      art: Z.pointerType,
      x0: Z.clientX,
      y0: Z.clientY,
      aktiv: !1
    };
    if (M.current = G, Z.pointerType !== "mouse") {
      const K = Z.currentTarget;
      G.timer = setTimeout(() => {
        M.current === G && (G.aktiv = !0, O(G.id), K.setPointerCapture?.(G.pointerId));
      }, 400);
    }
  }, Ul = (V) => {
    const Z = M.current;
    if (!Z || Z.pointerId !== V.pointerId) return;
    const G = V.clientX - Z.x0, K = V.clientY - Z.y0;
    if (!Z.aktiv) {
      Z.art === "mouse" && Math.hypot(G, K) > Po ? Tl(Z, V) : Z.art !== "mouse" && Math.hypot(G, K) > 10 && (clearTimeout(Z.timer), M.current = null);
      return;
    }
    ul({
      x: G,
      y: K
    }), R(gl(V.clientX, V.clientY));
  }, wl = (V, Z) => {
    const G = M.current;
    if (!(!G || G.pointerId !== Z.pointerId)) {
      if (clearTimeout(G.timer), M.current = null, G.aktiv) {
        $.current = !0, setTimeout(() => $.current = !1, 0);
        const K = gl(Z.clientX, Z.clientY), Hl = f.find((kl) => kl.id === K);
        Hl && Hl.id !== V.stufe && _(V, Hl);
      }
      O(null), R(null), ul({
        x: 0,
        y: 0
      });
    }
  }, bl = (V, Z) => {
    if (!Z.altKey || Z.key !== "ArrowLeft" && Z.key !== "ArrowRight") return;
    const G = f[f.findIndex((K) => K.id === V.stufe) + (Z.key === "ArrowRight" ? 1 : -1)];
    G && (Z.preventDefault(), _(V, G));
  };
  return /* @__PURE__ */ (0, m.jsx)("div", {
    className: "ara-board",
    role: "group",
    "aria-label": s,
    "data-testid": j,
    children: f.map((V) => {
      const Z = o.filter((G) => G.stufe === V.id);
      return /* @__PURE__ */ (0, m.jsxs)("section", {
        className: "ara-board__stufe",
        "data-stufe": V.id,
        "data-blass": V.blass ? "true" : void 0,
        "data-ziel": p === V.id && U ? "true" : void 0,
        "aria-label": V.titel,
        children: [/* @__PURE__ */ (0, m.jsxs)("h3", {
          className: "ara-board__kopf",
          children: [/* @__PURE__ */ (0, m.jsx)("span", { children: V.titel }), /* @__PURE__ */ (0, m.jsx)("span", {
            className: "ara-board__zaehler",
            children: Z.length
          })]
        }), /* @__PURE__ */ (0, m.jsxs)("div", {
          className: "ara-board__karten",
          children: [Z.length === 0 && /* @__PURE__ */ (0, m.jsx)("p", {
            className: "ara-board__leer",
            children: H
          }), Z.map((G) => /* @__PURE__ */ (0, m.jsxs)("button", {
            type: "button",
            className: "ara-board__karte",
            "data-zieht": U === G.id ? "true" : void 0,
            style: U === G.id ? { transform: `translate(${C.x}px, ${C.y}px)` } : void 0,
            onPointerDown: (K) => Jl(G, K),
            onPointerMove: Ul,
            onPointerUp: (K) => wl(G, K),
            onPointerCancel: (K) => wl(G, K),
            onKeyDown: (K) => bl(G, K),
            onClick: () => {
              $.current || z?.(G);
            },
            children: [
              /* @__PURE__ */ (0, m.jsx)("span", {
                className: "ara-board__titel",
                children: G.titel
              }),
              /* @__PURE__ */ (0, m.jsx)("span", {
                className: "ara-board__nummer",
                children: G.nummer
              }),
              G.etikett && /* @__PURE__ */ (0, m.jsx)("span", {
                className: "ara-board__etikett",
                children: G.etikett
              })
            ]
          }, G.id))]
        })]
      }, V.id);
    })
  });
}
function R1({ stufen: f, aktuell: o, onWaehlen: _, beschriftung: z = "Stufe" }) {
  return /* @__PURE__ */ (0, m.jsxs)("div", {
    className: "ara-stufen",
    children: [/* @__PURE__ */ (0, m.jsx)("ol", {
      className: "ara-stufen__reihe",
      "aria-label": z,
      children: f.map((s, j) => {
        const H = j < o ? "erreicht" : j === o ? "jetzt" : "offen", M = /* @__PURE__ */ (0, m.jsxs)(m.Fragment, { children: [/* @__PURE__ */ (0, m.jsx)("span", {
          className: "ara-stufen__balken",
          "aria-hidden": "true"
        }), /* @__PURE__ */ (0, m.jsx)("span", {
          className: "ara-stufen__name",
          children: s
        })] });
        return /* @__PURE__ */ (0, m.jsx)("li", {
          className: "ara-stufen__stufe",
          "data-zustand": H,
          children: _ ? /* @__PURE__ */ (0, m.jsx)("button", {
            type: "button",
            className: "ara-stufen__knopf",
            "aria-current": j === o ? "step" : void 0,
            onClick: () => _(j),
            children: M
          }) : /* @__PURE__ */ (0, m.jsx)("span", {
            className: "ara-stufen__knopf",
            "aria-current": j === o ? "step" : void 0,
            children: M
          })
        }, s);
      })
    }), /* @__PURE__ */ (0, m.jsx)("span", {
      className: "ara-stufen__jetzt",
      "aria-hidden": "true",
      children: f[o]
    })]
  });
}
function mv(f, o, _, z) {
  const s = f.key === "ArrowRight" ? 1 : f.key === "ArrowLeft" ? -1 : 0;
  if (f.key === "Home" || f.key === "End" || s) {
    f.preventDefault();
    const j = o.indexOf(_), H = f.key === "Home" ? 0 : f.key === "End" ? o.length - 1 : (j + s + o.length) % o.length;
    z(o[H]), f.currentTarget.querySelectorAll("[role]")[H]?.focus();
  }
}
function hv(f) {
  const o = (0, X.useRef)(null), [_, z] = (0, X.useState)();
  return (0, X.useLayoutEffect)(() => {
    const s = () => {
      const H = o.current?.querySelector('[aria-selected="true"],[aria-checked="true"]');
      if (!H) return;
      const M = `${H.offsetLeft}px`, U = `${H.offsetWidth}px`;
      z((O) => O && O["--ara-marke-x"] === M && O["--ara-marke-b"] === U ? O : {
        "--ara-marke-x": M,
        "--ara-marke-b": U
      });
    };
    if (s(), document.fonts?.ready.then(s), typeof ResizeObserver > "u" || !o.current) return;
    const j = new ResizeObserver(s);
    return j.observe(o.current), () => j.disconnect();
  }, [f]), {
    wurzel: o,
    marke: _
  };
}
function C1({ eintraege: f, aktiv: o, onWaehlen: _, beschriftung: z = "Reiter" }) {
  const { wurzel: s, marke: j } = hv(o), H = f.map((M) => M.id);
  return /* @__PURE__ */ (0, m.jsxs)("div", {
    className: "ara-reiter",
    role: "tablist",
    "aria-label": z,
    ref: s,
    style: j,
    onKeyDown: (M) => mv(M, H, o, _),
    children: [f.map((M) => /* @__PURE__ */ (0, m.jsxs)("button", {
      type: "button",
      role: "tab",
      id: `ara-reiter-${M.id}`,
      className: "ara-reiter__knopf",
      "aria-selected": M.id === o,
      tabIndex: M.id === o ? 0 : -1,
      onClick: () => _(M.id),
      children: [M.titel, M.zahl ? /* @__PURE__ */ (0, m.jsx)("span", {
        className: "ara-reiter__zahl",
        children: M.zahl
      }) : null]
    }, M.id)), /* @__PURE__ */ (0, m.jsx)("span", {
      className: "ara-reiter__marke",
      "aria-hidden": "true"
    })]
  });
}
function B1({ eintraege: f, wert: o, onWaehlen: _, beschriftung: z }) {
  const { wurzel: s, marke: j } = hv(o), H = f.map((M) => M.id);
  return /* @__PURE__ */ (0, m.jsxs)("div", {
    className: "ara-segmente",
    role: "radiogroup",
    "aria-label": z,
    ref: s,
    style: j,
    onKeyDown: (M) => mv(M, H, o, _),
    children: [/* @__PURE__ */ (0, m.jsx)("span", {
      className: "ara-segmente__marke",
      "aria-hidden": "true"
    }), f.map((M) => /* @__PURE__ */ (0, m.jsx)("button", {
      type: "button",
      role: "radio",
      className: "ara-segmente__knopf",
      "aria-checked": M.id === o,
      "aria-label": M.beschriftung,
      tabIndex: M.id === o ? 0 : -1,
      onClick: () => _(M.id),
      children: M.titel
    }, M.id))]
  });
}
function Y1({ symbol: f, titel: o, unterzeile: _, beiFreigeben: z, beiAblehnen: s, schwelle: j = 0.4, freigebenText: H = "Freigeben", ablehnenText: M = "Ablehnen", kennzeichen: U }) {
  const O = (0, X.useRef)(null), p = (0, X.useRef)(null), [R, C] = (0, X.useState)(0), [ul, $] = (0, X.useState)(null), gl = (V) => {
    V.button > 0 || V.target.closest("button") || (p.current = {
      x: V.clientX,
      y: V.clientY,
      id: V.pointerId
    });
  }, Tl = (V) => {
    const Z = p.current;
    if (!Z || Z.id !== V.pointerId) return;
    const G = V.clientX - Z.x;
    if (Math.abs(G) < 6 && Math.abs(V.clientY - Z.y) > 6) {
      p.current = null;
      return;
    }
    Math.abs(G) > 6 && V.currentTarget.setPointerCapture?.(V.pointerId), C(G);
  }, Jl = (V) => {
    const Z = p.current;
    if (!Z || Z.id !== V.pointerId) return;
    p.current = null;
    const G = O.current?.offsetWidth ?? 1;
    if (Math.abs(R) >= G * j) {
      const K = R > 0;
      $(K ? "frei" : "ab"), C(K ? G : -G), setTimeout(() => K ? z() : s(), 160);
    } else C(0);
  }, Ul = R > 0 ? "frei" : R < 0 ? "ab" : null, wl = O.current?.offsetWidth ?? 1, bl = Math.abs(R) >= wl * j;
  return /* @__PURE__ */ (0, m.jsxs)("div", {
    className: "ara-wisch",
    ref: O,
    "data-richtung": Ul ?? void 0,
    "data-erreicht": bl ? "true" : void 0,
    "data-raus": ul ?? void 0,
    "data-testid": U,
    children: [/* @__PURE__ */ (0, m.jsxs)("div", {
      className: "ara-wisch__hinten",
      "aria-hidden": "true",
      children: [/* @__PURE__ */ (0, m.jsx)("span", { children: H }), /* @__PURE__ */ (0, m.jsx)("span", { children: M })]
    }), /* @__PURE__ */ (0, m.jsxs)("div", {
      className: "ara-wisch__zeile",
      style: {
        transform: `translateX(${R}px)`,
        transition: p.current ? "none" : void 0
      },
      onPointerDown: gl,
      onPointerMove: Tl,
      onPointerUp: Jl,
      onPointerCancel: Jl,
      children: [
        f && /* @__PURE__ */ (0, m.jsx)(cf, {
          symbol: f,
          groesse: 32
        }),
        /* @__PURE__ */ (0, m.jsxs)("div", {
          className: "ara-wisch__text",
          children: [/* @__PURE__ */ (0, m.jsx)("span", {
            className: "ara-wisch__titel",
            children: o
          }), _ && /* @__PURE__ */ (0, m.jsx)("span", {
            className: "ara-wisch__unterzeile",
            children: _
          })]
        }),
        /* @__PURE__ */ (0, m.jsx)(Xn, {
          symbol: "haken",
          hinweis: H,
          art: "flach",
          onKlick: z
        })
      ]
    })]
  });
}
var q1 = 900;
function l1(f = 900) {
  const [o, _] = (0, X.useState)(() => typeof window > "u" || typeof window.matchMedia != "function" ? !1 : window.matchMedia(`(max-width: ${f - 1}px)`).matches);
  return (0, X.useEffect)(() => {
    if (typeof window > "u" || typeof window.matchMedia != "function") return;
    const z = window.matchMedia(`(max-width: ${f - 1}px)`), s = () => _(z.matches);
    return s(), typeof z.addEventListener == "function" ? (z.addEventListener("change", s), () => z.removeEventListener("change", s)) : (z.addListener?.(s), () => z.removeListener?.(s));
  }, [f]), o;
}
var t1 = typeof window > "u" ? X.useEffect : X.useLayoutEffect;
function G1(f) {
  const o = l1(f), [_, z] = (0, X.useState)(null), [s, j] = (0, X.useState)(null), H = (0, X.useCallback)((M) => z(M), []);
  return t1(() => {
    if (!_) {
      j(null);
      return;
    }
    const M = () => {
      const O = _.getBoundingClientRect().width;
      j(O > 0 ? O : null);
    };
    if (M(), typeof ResizeObserver != "function") return;
    const U = new ResizeObserver(M);
    return U.observe(_), () => U.disconnect();
  }, [_]), [
    H,
    s === null ? o : s < f,
    s
  ];
}
var X1 = "6.0.0", a1 = 0.25, e1 = 4, u1 = 24;
function cv(f) {
  return Math.min(e1, Math.max(a1, f));
}
var n1 = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/;
function i1(f, o) {
  if (o) return o;
  if (typeof f != "string")
    return f.type === "application/pdf" ? "pdf" : f.type.startsWith("image/") ? "bild" : null;
  if (f.startsWith("data:image/")) return "bild";
  if (f.startsWith("data:application/pdf")) return "pdf";
  const _ = (f.split("?")[0] ?? "").toLowerCase();
  return _.endsWith(".pdf") ? "pdf" : n1.test(_) ? "bild" : null;
}
function _u(f) {
  return new URL("pdf-dateien/" + f, import.meta.url).toString();
}
var fv = null;
function c1() {
  return fv ??= import("./marken-pdf.js").then((f) => (!f.GlobalWorkerOptions.workerSrc && !f.GlobalWorkerOptions.workerPort && (f.GlobalWorkerOptions.workerSrc = _u("pdf.worker.min.js")), f)), fv;
}
var uf = "Das Dokument ließ sich nicht öffnen.", f1 = "Dieses Format kann hier nicht angezeigt werden.";
function s1(f) {
  return f instanceof Error && f.name === "RenderingCancelledException";
}
function Q1({ quelle: f, art: o, name: _, leerHinweis: z = "Kein Dokument ausgewählt.", hoehe: s, kennzeichen: j, className: H }) {
  const [M, U] = X.useState({ stufe: "leer" }), [O, p] = X.useState(1), [R, C] = X.useState(0), [ul, $] = X.useState(null), [gl, Tl] = X.useState(!1), [Jl, Ul] = X.useState(null), wl = X.useRef(null), bl = X.useRef(null), V = X.useRef(null), Z = X.useRef(null), G = _ ?? (f instanceof File ? f.name : void 0);
  X.useEffect(() => {
    if (p(1), C(0), $(null), Ul(null), f == null || f === "") {
      U({ stufe: "leer" });
      return;
    }
    const tl = i1(f, o);
    if (!tl) {
      U({
        stufe: "fehler",
        meldung: f1
      });
      return;
    }
    if (tl === "bild") {
      if (typeof f == "string") {
        U({
          stufe: "bild",
          url: f
        });
        return;
      }
      const El = URL.createObjectURL(f);
      return U({
        stufe: "bild",
        url: El
      }), () => URL.revokeObjectURL(El);
    }
    let Ml = !1, ql;
    return U({ stufe: "laden" }), (async () => {
      try {
        const El = await c1(), x = typeof f == "string" ? { url: f } : { data: new Uint8Array(await f.arrayBuffer()) };
        if (Ml) return;
        ql = El.getDocument({
          ...x,
          cMapUrl: _u("cmaps/"),
          cMapPacked: !0,
          standardFontDataUrl: _u("standard_fonts/"),
          wasmUrl: _u("wasm/"),
          iccUrl: _u("iccs/")
        });
        const D = await ql.promise;
        if (Ml) return;
        C(D.numPages), U({
          stufe: "pdf",
          dokument: D
        });
      } catch {
        Ml || U({
          stufe: "fehler",
          meldung: uf
        });
      }
    })(), () => {
      Ml = !0, ql?.destroy().catch(() => {
      });
    };
  }, [f, o]), X.useEffect(() => {
    if (M.stufe !== "pdf") return;
    let tl = !1, Ml;
    return (async () => {
      try {
        const ql = await M.dokument.getPage(O);
        if (tl) return;
        if (ul === null) {
          const B = bl.current?.clientWidth ?? 640, il = ql.getViewport({ scale: 1 });
          $(cv((B - u1) / il.width));
          return;
        }
        const El = V.current;
        if (!El) return;
        const x = ql.getViewport({ scale: ul }), D = window.devicePixelRatio || 1;
        El.width = Math.floor(x.width * D), El.height = Math.floor(x.height * D), El.style.width = `${Math.floor(x.width)}px`, El.style.height = `${Math.floor(x.height)}px`, Ml = ql.render({
          canvas: El,
          viewport: x,
          transform: D !== 1 ? [
            D,
            0,
            0,
            D,
            0,
            0
          ] : void 0
        }), await Ml.promise;
      } catch (ql) {
        !tl && !s1(ql) && U({
          stufe: "fehler",
          meldung: uf
        });
      }
    })(), () => {
      tl = !0, Ml?.cancel();
    };
  }, [
    M,
    O,
    ul
  ]), X.useEffect(() => {
    if (!gl) return;
    const tl = (ql) => {
      ql.key === "Escape" && Tl(!1);
    }, Ml = () => {
      document.fullscreenElement || Tl(!1);
    };
    return document.addEventListener("keydown", tl), document.addEventListener("fullscreenchange", Ml), () => {
      document.removeEventListener("keydown", tl), document.removeEventListener("fullscreenchange", Ml);
    };
  }, [gl]);
  const K = () => {
    if (gl) {
      document.fullscreenElement && document.exitFullscreen().catch(() => {
      }), Tl(!1);
      return;
    }
    Tl(!0);
    try {
      wl.current?.requestFullscreen?.().catch(() => {
      });
    } catch {
    }
  }, Hl = () => {
    if (ul !== null) return ul;
    const tl = Z.current;
    return tl && tl.naturalWidth > 0 ? tl.clientWidth / tl.naturalWidth : 1;
  }, kl = (tl) => {
    $(cv(Hl() * tl));
  }, Ht = M.stufe === "pdf" || M.stufe === "bild";
  return /* @__PURE__ */ (0, m.jsxs)("div", {
    ref: wl,
    className: H ? `ara-dokumentanzeige ${H}` : "ara-dokumentanzeige",
    "data-vollbild": gl || void 0,
    "data-testid": j,
    style: s ? { "--ara-dokument-hoehe": s } : void 0,
    role: "group",
    "aria-label": G ? `Dokument ${G}` : "Dokumentanzeige",
    children: [Ht && /* @__PURE__ */ (0, m.jsxs)("div", {
      className: "ara-dokumentanzeige__leiste",
      children: [
        /* @__PURE__ */ (0, m.jsx)("span", {
          className: "ara-dokumentanzeige__name",
          title: G,
          children: G
        }),
        M.stufe === "pdf" && R > 1 && /* @__PURE__ */ (0, m.jsxs)("div", {
          className: "ara-dokumentanzeige__gruppe",
          children: [
            /* @__PURE__ */ (0, m.jsx)(Su, {
              beschriftung: "Vorige Seite",
              gesperrt: O <= 1,
              onKlick: () => p((tl) => Math.max(1, tl - 1)),
              children: "‹"
            }),
            /* @__PURE__ */ (0, m.jsxs)("span", {
              className: "ara-dokumentanzeige__stand",
              "aria-live": "polite",
              children: [
                "Seite ",
                O,
                " von ",
                R
              ]
            }),
            /* @__PURE__ */ (0, m.jsx)(Su, {
              beschriftung: "Nächste Seite",
              gesperrt: O >= R,
              onKlick: () => p((tl) => Math.min(R, tl + 1)),
              children: "›"
            })
          ]
        }),
        /* @__PURE__ */ (0, m.jsxs)("div", {
          className: "ara-dokumentanzeige__gruppe",
          children: [
            /* @__PURE__ */ (0, m.jsx)(Su, {
              beschriftung: "Verkleinern",
              onKlick: () => kl(0.8),
              children: "−"
            }),
            /* @__PURE__ */ (0, m.jsx)("span", {
              className: "ara-dokumentanzeige__stand",
              children: ul === null ? "passend" : `${Math.round(ul * 100)} %`
            }),
            /* @__PURE__ */ (0, m.jsx)(Su, {
              beschriftung: "Vergrößern",
              onKlick: () => kl(1.25),
              children: "+"
            }),
            /* @__PURE__ */ (0, m.jsx)(Su, {
              beschriftung: gl ? "Vollbild verlassen" : "Vollbild",
              onKlick: K,
              children: /* @__PURE__ */ (0, m.jsx)("svg", {
                viewBox: "0 0 24 24",
                width: "14",
                height: "14",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                "aria-hidden": "true",
                children: /* @__PURE__ */ (0, m.jsx)("path", { d: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" })
              })
            })
          ]
        })
      ]
    }), /* @__PURE__ */ (0, m.jsxs)("div", {
      ref: bl,
      className: "ara-dokumentanzeige__flaeche",
      children: [
        M.stufe === "leer" && /* @__PURE__ */ (0, m.jsx)("p", {
          className: "ara-dokumentanzeige__meldung",
          children: z
        }),
        M.stufe === "laden" && /* @__PURE__ */ (0, m.jsxs)("p", {
          className: "ara-dokumentanzeige__meldung",
          role: "status",
          "aria-live": "polite",
          children: [/* @__PURE__ */ (0, m.jsx)("span", {
            className: "ara-dokumentanzeige__kreisel",
            "aria-hidden": "true"
          }), "Wird geladen …"]
        }),
        M.stufe === "fehler" && /* @__PURE__ */ (0, m.jsx)("p", {
          className: "ara-dokumentanzeige__meldung",
          role: "alert",
          children: M.meldung
        }),
        M.stufe === "pdf" && /* @__PURE__ */ (0, m.jsx)("canvas", {
          ref: V,
          className: "ara-dokumentanzeige__seite",
          role: "img",
          "aria-label": G ? `Seite ${O} von ${R} aus ${G}` : `Seite ${O} von ${R}`
        }),
        M.stufe === "bild" && /* @__PURE__ */ (0, m.jsx)("img", {
          ref: Z,
          src: M.url,
          alt: G ?? "Bild",
          className: "ara-dokumentanzeige__bild",
          onLoad: (tl) => Ul(tl.currentTarget.naturalWidth),
          onError: () => U({
            stufe: "fehler",
            meldung: uf
          }),
          style: ul !== null && Jl ? {
            width: `${Math.round(Jl * ul)}px`,
            maxWidth: "none",
            maxHeight: "none"
          } : void 0
        })
      ]
    })]
  });
}
var Z1 = X.createElement;
function L1(f, o) {
  (0, ko.createRoot)(o).render(f);
}
var V1 = X.Fragment, K1 = X.useEffect, J1 = X.useMemo, w1 = X.useRef, k1 = X.useState;
export {
  cf as AppIcon,
  x1 as Board,
  M1 as Dock,
  A1 as DockEintrag,
  Q1 as Dokumentanzeige,
  j1 as Ebene,
  X1 as FASSUNG,
  g1 as Feld,
  U1 as Fenster,
  y1 as Formular,
  V1 as Fragment,
  S1 as Glas,
  T1 as Glasleiste,
  _1 as Hauptkapsel,
  Xn as IconKnopf,
  h1 as Karte,
  Su as Knopf,
  v1 as Kopf,
  d1 as KopfVorne,
  b1 as LINIEN_NAMEN,
  Za as Linie,
  o1 as Liste,
  m1 as ListenEintrag,
  p1 as Meldung,
  E1 as Menue,
  N1 as Popup,
  D1 as PopupEintrag,
  O1 as PopupGruppe,
  Fo as RUECKGAENGIG_FRIST_MS,
  C1 as Reiter,
  q1 as SCHMAL_AB_PX,
  B1 as Segmente,
  R1 as Stufenleiste,
  z1 as TextKnopf,
  r1 as Werkzeug,
  Y1 as Wischzeile,
  H1 as ZIEHEN_NACH_MS,
  Z1 as h,
  L1 as rendern,
  K1 as useEffect,
  J1 as useMemo,
  w1 as useRef,
  G1 as useSchmalerBehaelter,
  l1 as useSchmalesFenster,
  k1 as useState
};
