var Ho = Object.create, fv = Object.defineProperty, xo = Object.getOwnPropertyDescriptor, Ro = Object.getOwnPropertyNames, Co = Object.getPrototypeOf, sv = Object.prototype.hasOwnProperty, Ut = (f, o) => () => (o || (f((o = { exports: {} }).exports, o), f = null), o.exports), Bo = (f, o, _, z) => {
  if (o && typeof o == "object" || typeof o == "function")
    for (var s = Ro(o), j = 0, H = s.length, M; j < H; j++)
      M = s[j], !sv.call(f, M) && M !== _ && fv(f, M, {
        get: ((U) => o[U]).bind(null, M),
        enumerable: !(z = xo(o, M)) || z.enumerable
      });
  return f;
}, Yo = (f, o, _) => (_ = f != null ? Ho(Co(f)) : {}, Bo(o || !f || !f.__esModule || !sv.call(f, "default") ? fv(_, "default", {
  value: f,
  enumerable: !0
}) : _, f)), qo = /* @__PURE__ */ Ut(((f) => {
  var o = Symbol.for("react.transitional.element"), _ = Symbol.for("react.portal"), z = Symbol.for("react.fragment"), s = Symbol.for("react.strict_mode"), j = Symbol.for("react.profiler"), H = Symbol.for("react.consumer"), M = Symbol.for("react.context"), U = Symbol.for("react.forward_ref"), O = Symbol.for("react.suspense"), p = Symbol.for("react.memo"), Y = Symbol.for("react.lazy"), B = Symbol.for("react.activity"), nl = Symbol.iterator;
  function $(r) {
    return r === null || typeof r != "object" ? null : (r = nl && r[nl] || r["@@iterator"], typeof r == "function" ? r : null);
  }
  var bl = {
    isMounted: function() {
      return !1;
    },
    enqueueForceUpdate: function() {
    },
    enqueueReplaceState: function() {
    },
    enqueueSetState: function() {
    }
  }, El = Object.assign, wl = {};
  function Ul(r, N, C) {
    this.props = r, this.context = N, this.refs = wl, this.updater = C || bl;
  }
  Ul.prototype.isReactComponent = {}, Ul.prototype.setState = function(r, N) {
    if (typeof r != "object" && typeof r != "function" && r != null) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
    this.updater.enqueueSetState(this, r, N, "setState");
  }, Ul.prototype.forceUpdate = function(r) {
    this.updater.enqueueForceUpdate(this, r, "forceUpdate");
  };
  function Jl() {
  }
  Jl.prototype = Ul.prototype;
  function F(r, N, C) {
    this.props = r, this.context = N, this.refs = wl, this.updater = C || bl;
  }
  var J = F.prototype = new Jl();
  J.constructor = F, El(J, Ul.prototype), J.isPureReactComponent = !0;
  var Q = Array.isArray;
  function Z() {
  }
  var K = {
    H: null,
    A: null,
    T: null,
    S: null
  }, Hl = Object.prototype.hasOwnProperty;
  function kl(r, N, C) {
    var L = C.ref;
    return {
      $$typeof: o,
      type: r,
      key: N,
      ref: L !== void 0 ? L : null,
      props: C
    };
  }
  function Ht(r, N) {
    return kl(r.type, N, r.props);
  }
  function al(r) {
    return typeof r == "object" && r !== null && r.$$typeof === o;
  }
  function Ml(r) {
    var N = {
      "=": "=0",
      ":": "=2"
    };
    return "$" + r.replace(/[=:]/g, function(C) {
      return N[C];
    });
  }
  var ql = /\/+/g;
  function Tl(r, N) {
    return typeof r == "object" && r !== null && r.key != null ? Ml("" + r.key) : N.toString(36);
  }
  function x(r) {
    switch (r.status) {
      case "fulfilled":
        return r.value;
      case "rejected":
        throw r.reason;
      default:
        switch (typeof r.status == "string" ? r.then(Z, Z) : (r.status = "pending", r.then(function(N) {
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
  function D(r, N, C, L, I) {
    var P = typeof r;
    (P === "undefined" || P === "boolean") && (r = null);
    var vl = !1;
    if (r === null) vl = !0;
    else switch (P) {
      case "bigint":
      case "string":
      case "number":
        vl = !0;
        break;
      case "object":
        switch (r.$$typeof) {
          case o:
          case _:
            vl = !0;
            break;
          case Y:
            return vl = r._init, D(vl(r._payload), N, C, L, I);
        }
    }
    if (vl) return I = I(r), vl = L === "" ? "." + Tl(r, 0) : L, Q(I) ? (C = "", vl != null && (C = vl.replace(ql, "$&/") + "/"), D(I, N, C, "", function(Au) {
      return Au;
    })) : I != null && (al(I) && (I = Ht(I, C + (I.key == null || r && r.key === I.key ? "" : ("" + I.key).replace(ql, "$&/") + "/") + vl)), N.push(I)), 1;
    vl = 0;
    var Wl = L === "" ? "." : L + ":";
    if (Q(r)) for (var Ol = 0; Ol < r.length; Ol++) L = r[Ol], P = Wl + Tl(L, Ol), vl += D(L, N, C, P, I);
    else if (Ol = $(r), typeof Ol == "function") for (r = Ol.call(r), Ol = 0; !(L = r.next()).done; ) L = L.value, P = Wl + Tl(L, Ol++), vl += D(L, N, C, P, I);
    else if (P === "object") {
      if (typeof r.then == "function") return D(x(r), N, C, L, I);
      throw N = String(r), Error("Objects are not valid as a React child (found: " + (N === "[object Object]" ? "object with keys {" + Object.keys(r).join(", ") + "}" : N) + "). If you meant to render a collection of children, use an array instead.");
    }
    return vl;
  }
  function R(r, N, C) {
    if (r == null) return r;
    var L = [], I = 0;
    return D(r, L, "", "", function(P) {
      return N.call(C, P, I++);
    }), L;
  }
  function cl(r) {
    if (r._status === -1) {
      var N = r._result;
      N = N(), N.then(function(C) {
        (r._status === 0 || r._status === -1) && (r._status = 1, r._result = C);
      }, function(C) {
        (r._status === 0 || r._status === -1) && (r._status = 2, r._result = C);
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
  }, et = {
    map: R,
    forEach: function(r, N, C) {
      R(r, function() {
        N.apply(this, arguments);
      }, C);
    },
    count: function(r) {
      var N = 0;
      return R(r, function() {
        N++;
      }), N;
    },
    toArray: function(r) {
      return R(r, function(N) {
        return N;
      }) || [];
    },
    only: function(r) {
      if (!al(r)) throw Error("React.Children.only expected to receive a single React element child.");
      return r;
    }
  };
  f.Activity = B, f.Children = et, f.Component = Ul, f.Fragment = z, f.Profiler = j, f.PureComponent = F, f.StrictMode = s, f.Suspense = O, f.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = K, f.__COMPILER_RUNTIME = {
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
  }, f.cloneElement = function(r, N, C) {
    if (r == null) throw Error("The argument must be a React element, but you passed " + r + ".");
    var L = El({}, r.props), I = r.key;
    if (N != null) for (P in N.key !== void 0 && (I = "" + N.key), N) !Hl.call(N, P) || P === "key" || P === "__self" || P === "__source" || P === "ref" && N.ref === void 0 || (L[P] = N[P]);
    var P = arguments.length - 2;
    if (P === 1) L.children = C;
    else if (1 < P) {
      for (var vl = Array(P), Wl = 0; Wl < P; Wl++) vl[Wl] = arguments[Wl + 2];
      L.children = vl;
    }
    return kl(r.type, I, L);
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
  }, f.createElement = function(r, N, C) {
    var L, I = {}, P = null;
    if (N != null) for (L in N.key !== void 0 && (P = "" + N.key), N) Hl.call(N, L) && L !== "key" && L !== "__self" && L !== "__source" && (I[L] = N[L]);
    var vl = arguments.length - 2;
    if (vl === 1) I.children = C;
    else if (1 < vl) {
      for (var Wl = Array(vl), Ol = 0; Ol < vl; Ol++) Wl[Ol] = arguments[Ol + 2];
      I.children = Wl;
    }
    if (r && r.defaultProps) for (L in vl = r.defaultProps, vl) I[L] === void 0 && (I[L] = vl[L]);
    return kl(r, P, I);
  }, f.createRef = function() {
    return { current: null };
  }, f.forwardRef = function(r) {
    return {
      $$typeof: U,
      render: r
    };
  }, f.isValidElement = al, f.lazy = function(r) {
    return {
      $$typeof: Y,
      _payload: {
        _status: -1,
        _result: r
      },
      _init: cl
    };
  }, f.memo = function(r, N) {
    return {
      $$typeof: p,
      type: r,
      compare: N === void 0 ? null : N
    };
  }, f.startTransition = function(r) {
    var N = K.T, C = {};
    K.T = C;
    try {
      var L = r(), I = K.S;
      I !== null && I(C, L), typeof L == "object" && L !== null && typeof L.then == "function" && L.then(Z, Sl);
    } catch (P) {
      Sl(P);
    } finally {
      N !== null && C.types !== null && (N.types = C.types), K.T = N;
    }
  }, f.unstable_useCacheRefresh = function() {
    return K.H.useCacheRefresh();
  }, f.use = function(r) {
    return K.H.use(r);
  }, f.useActionState = function(r, N, C) {
    return K.H.useActionState(r, N, C);
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
  }, f.useImperativeHandle = function(r, N, C) {
    return K.H.useImperativeHandle(r, N, C);
  }, f.useInsertionEffect = function(r, N) {
    return K.H.useInsertionEffect(r, N);
  }, f.useLayoutEffect = function(r, N) {
    return K.H.useLayoutEffect(r, N);
  }, f.useMemo = function(r, N) {
    return K.H.useMemo(r, N);
  }, f.useOptimistic = function(r, N) {
    return K.H.useOptimistic(r, N);
  }, f.useReducer = function(r, N, C) {
    return K.H.useReducer(r, N, C);
  }, f.useRef = function(r) {
    return K.H.useRef(r);
  }, f.useState = function(r) {
    return K.H.useState(r);
  }, f.useSyncExternalStore = function(r, N, C) {
    return K.H.useSyncExternalStore(r, N, C);
  }, f.useTransition = function() {
    return K.H.useTransition();
  }, f.version = "19.2.8";
})), nf = /* @__PURE__ */ Ut(((f, o) => {
  o.exports = qo();
})), Go = /* @__PURE__ */ Ut(((f) => {
  function o(x, D) {
    var R = x.length;
    x.push(D);
    l: for (; 0 < R; ) {
      var cl = R - 1 >>> 1, Sl = x[cl];
      if (0 < s(Sl, D)) x[cl] = D, x[R] = Sl, R = cl;
      else break l;
    }
  }
  function _(x) {
    return x.length === 0 ? null : x[0];
  }
  function z(x) {
    if (x.length === 0) return null;
    var D = x[0], R = x.pop();
    if (R !== D) {
      x[0] = R;
      l: for (var cl = 0, Sl = x.length, et = Sl >>> 1; cl < et; ) {
        var r = 2 * (cl + 1) - 1, N = x[r], C = r + 1, L = x[C];
        if (0 > s(N, R)) C < Sl && 0 > s(L, N) ? (x[cl] = L, x[C] = R, cl = C) : (x[cl] = N, x[r] = R, cl = r);
        else if (C < Sl && 0 > s(L, R)) x[cl] = L, x[C] = R, cl = C;
        else break l;
      }
    }
    return D;
  }
  function s(x, D) {
    var R = x.sortIndex - D.sortIndex;
    return R !== 0 ? R : x.id - D.id;
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
  var U = [], O = [], p = 1, Y = null, B = 3, nl = !1, $ = !1, bl = !1, El = !1, wl = typeof setTimeout == "function" ? setTimeout : null, Ul = typeof clearTimeout == "function" ? clearTimeout : null, Jl = typeof setImmediate < "u" ? setImmediate : null;
  function F(x) {
    for (var D = _(O); D !== null; ) {
      if (D.callback === null) z(O);
      else if (D.startTime <= x) z(O), D.sortIndex = D.expirationTime, o(U, D);
      else break;
      D = _(O);
    }
  }
  function J(x) {
    if (bl = !1, F(x), !$) if (_(U) !== null) $ = !0, Q || (Q = !0, al());
    else {
      var D = _(O);
      D !== null && Tl(J, D.startTime - x);
    }
  }
  var Q = !1, Z = -1, K = 5, Hl = -1;
  function kl() {
    return El ? !0 : !(f.unstable_now() - Hl < K);
  }
  function Ht() {
    if (El = !1, Q) {
      var x = f.unstable_now();
      Hl = x;
      var D = !0;
      try {
        l: {
          $ = !1, bl && (bl = !1, Ul(Z), Z = -1), nl = !0;
          var R = B;
          try {
            t: {
              for (F(x), Y = _(U); Y !== null && !(Y.expirationTime > x && kl()); ) {
                var cl = Y.callback;
                if (typeof cl == "function") {
                  Y.callback = null, B = Y.priorityLevel;
                  var Sl = cl(Y.expirationTime <= x);
                  if (x = f.unstable_now(), typeof Sl == "function") {
                    Y.callback = Sl, F(x), D = !0;
                    break t;
                  }
                  Y === _(U) && z(U), F(x);
                } else z(U);
                Y = _(U);
              }
              if (Y !== null) D = !0;
              else {
                var et = _(O);
                et !== null && Tl(J, et.startTime - x), D = !1;
              }
            }
            break l;
          } finally {
            Y = null, B = R, nl = !1;
          }
          D = void 0;
        }
      } finally {
        D ? al() : Q = !1;
      }
    }
  }
  var al;
  if (typeof Jl == "function") al = function() {
    Jl(Ht);
  };
  else if (typeof MessageChannel < "u") {
    var Ml = new MessageChannel(), ql = Ml.port2;
    Ml.port1.onmessage = Ht, al = function() {
      ql.postMessage(null);
    };
  } else al = function() {
    wl(Ht, 0);
  };
  function Tl(x, D) {
    Z = wl(function() {
      x(f.unstable_now());
    }, D);
  }
  f.unstable_IdlePriority = 5, f.unstable_ImmediatePriority = 1, f.unstable_LowPriority = 4, f.unstable_NormalPriority = 3, f.unstable_Profiling = null, f.unstable_UserBlockingPriority = 2, f.unstable_cancelCallback = function(x) {
    x.callback = null;
  }, f.unstable_forceFrameRate = function(x) {
    0 > x || 125 < x ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : K = 0 < x ? Math.floor(1e3 / x) : 5;
  }, f.unstable_getCurrentPriorityLevel = function() {
    return B;
  }, f.unstable_next = function(x) {
    switch (B) {
      case 1:
      case 2:
      case 3:
        var D = 3;
        break;
      default:
        D = B;
    }
    var R = B;
    B = D;
    try {
      return x();
    } finally {
      B = R;
    }
  }, f.unstable_requestPaint = function() {
    El = !0;
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
    var R = B;
    B = x;
    try {
      return D();
    } finally {
      B = R;
    }
  }, f.unstable_scheduleCallback = function(x, D, R) {
    var cl = f.unstable_now();
    switch (typeof R == "object" && R !== null ? (R = R.delay, R = typeof R == "number" && 0 < R ? cl + R : cl) : R = cl, x) {
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
    return Sl = R + Sl, x = {
      id: p++,
      callback: D,
      priorityLevel: x,
      startTime: R,
      expirationTime: Sl,
      sortIndex: -1
    }, R > cl ? (x.sortIndex = R, o(O, x), _(U) === null && x === _(O) && (bl ? (Ul(Z), Z = -1) : bl = !0, Tl(J, R - cl))) : (x.sortIndex = Sl, o(U, x), $ || nl || ($ = !0, Q || (Q = !0, al()))), x;
  }, f.unstable_shouldYield = kl, f.unstable_wrapCallback = function(x) {
    var D = B;
    return function() {
      var R = B;
      B = D;
      try {
        return x.apply(this, arguments);
      } finally {
        B = R;
      }
    };
  };
})), Xo = /* @__PURE__ */ Ut(((f, o) => {
  o.exports = Go();
})), Qo = /* @__PURE__ */ Ut(((f) => {
  var o = nf();
  function _(O) {
    var p = "https://react.dev/errors/" + O;
    if (1 < arguments.length) {
      p += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var Y = 2; Y < arguments.length; Y++) p += "&args[]=" + encodeURIComponent(arguments[Y]);
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
  function H(O, p, Y) {
    var B = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: j,
      key: B == null ? null : "" + B,
      children: O,
      containerInfo: p,
      implementation: Y
    };
  }
  var M = o.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function U(O, p) {
    if (O === "font") return "";
    if (typeof p == "string") return p === "use-credentials" ? p : "";
  }
  f.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = s, f.createPortal = function(O, p) {
    var Y = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!p || p.nodeType !== 1 && p.nodeType !== 9 && p.nodeType !== 11) throw Error(_(299));
    return H(O, p, null, Y);
  }, f.flushSync = function(O) {
    var p = M.T, Y = s.p;
    try {
      if (M.T = null, s.p = 2, O) return O();
    } finally {
      M.T = p, s.p = Y, s.d.f();
    }
  }, f.preconnect = function(O, p) {
    typeof O == "string" && (p ? (p = p.crossOrigin, p = typeof p == "string" ? p === "use-credentials" ? p : "" : void 0) : p = null, s.d.C(O, p));
  }, f.prefetchDNS = function(O) {
    typeof O == "string" && s.d.D(O);
  }, f.preinit = function(O, p) {
    if (typeof O == "string" && p && typeof p.as == "string") {
      var Y = p.as, B = U(Y, p.crossOrigin), nl = typeof p.integrity == "string" ? p.integrity : void 0, $ = typeof p.fetchPriority == "string" ? p.fetchPriority : void 0;
      Y === "style" ? s.d.S(O, typeof p.precedence == "string" ? p.precedence : void 0, {
        crossOrigin: B,
        integrity: nl,
        fetchPriority: $
      }) : Y === "script" && s.d.X(O, {
        crossOrigin: B,
        integrity: nl,
        fetchPriority: $,
        nonce: typeof p.nonce == "string" ? p.nonce : void 0
      });
    }
  }, f.preinitModule = function(O, p) {
    if (typeof O == "string") if (typeof p == "object" && p !== null) {
      if (p.as == null || p.as === "script") {
        var Y = U(p.as, p.crossOrigin);
        s.d.M(O, {
          crossOrigin: Y,
          integrity: typeof p.integrity == "string" ? p.integrity : void 0,
          nonce: typeof p.nonce == "string" ? p.nonce : void 0
        });
      }
    } else p ?? s.d.M(O);
  }, f.preload = function(O, p) {
    if (typeof O == "string" && typeof p == "object" && p !== null && typeof p.as == "string") {
      var Y = p.as, B = U(Y, p.crossOrigin);
      s.d.L(O, Y, {
        crossOrigin: B,
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
      var Y = U(p.as, p.crossOrigin);
      s.d.m(O, {
        as: typeof p.as == "string" && p.as !== "script" ? p.as : void 0,
        crossOrigin: Y,
        integrity: typeof p.integrity == "string" ? p.integrity : void 0
      });
    } else s.d.m(O);
  }, f.requestFormReset = function(O) {
    s.d.r(O);
  }, f.unstable_batchedUpdates = function(O, p) {
    return O(p);
  }, f.useFormState = function(O, p, Y) {
    return M.H.useFormState(O, p, Y);
  }, f.useFormStatus = function() {
    return M.H.useHostTransitionStatus();
  }, f.version = "19.2.8";
})), Zo = /* @__PURE__ */ Ut(((f, o) => {
  function _() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(_);
      } catch (z) {
        console.error(z);
      }
  }
  _(), o.exports = Qo();
})), Lo = /* @__PURE__ */ Ut(((f) => {
  var o = Xo(), _ = nf(), z = Zo();
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
    for (var a = l, u = t; ; ) {
      var e = a.return;
      if (e === null) break;
      var n = e.alternate;
      if (n === null) {
        if (u = e.return, u !== null) {
          a = u;
          continue;
        }
        break;
      }
      if (e.child === n.child) {
        for (n = e.child; n; ) {
          if (n === a) return O(e), l;
          if (n === u) return O(e), t;
          n = n.sibling;
        }
        throw Error(s(188));
      }
      if (a.return !== u.return) a = e, u = n;
      else {
        for (var i = !1, c = e.child; c; ) {
          if (c === a) {
            i = !0, a = e, u = n;
            break;
          }
          if (c === u) {
            i = !0, u = e, a = n;
            break;
          }
          c = c.sibling;
        }
        if (!i) {
          for (c = n.child; c; ) {
            if (c === a) {
              i = !0, a = n, u = e;
              break;
            }
            if (c === u) {
              i = !0, u = n, a = e;
              break;
            }
            c = c.sibling;
          }
          if (!i) throw Error(s(189));
        }
      }
      if (a.alternate !== u) throw Error(s(190));
    }
    if (a.tag !== 3) throw Error(s(188));
    return a.stateNode.current === a ? l : t;
  }
  function Y(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l;
    for (l = l.child; l !== null; ) {
      if (t = Y(l), t !== null) return t;
      l = l.sibling;
    }
    return null;
  }
  var B = Object.assign, nl = Symbol.for("react.element"), $ = Symbol.for("react.transitional.element"), bl = Symbol.for("react.portal"), El = Symbol.for("react.fragment"), wl = Symbol.for("react.strict_mode"), Ul = Symbol.for("react.profiler"), Jl = Symbol.for("react.consumer"), F = Symbol.for("react.context"), J = Symbol.for("react.forward_ref"), Q = Symbol.for("react.suspense"), Z = Symbol.for("react.suspense_list"), K = Symbol.for("react.memo"), Hl = Symbol.for("react.lazy"), kl = Symbol.for("react.activity"), Ht = Symbol.for("react.memo_cache_sentinel"), al = Symbol.iterator;
  function Ml(l) {
    return l === null || typeof l != "object" ? null : (l = al && l[al] || l["@@iterator"], typeof l == "function" ? l : null);
  }
  var ql = Symbol.for("react.client.reference");
  function Tl(l) {
    if (l == null) return null;
    if (typeof l == "function") return l.$$typeof === ql ? null : l.displayName || l.name || null;
    if (typeof l == "string") return l;
    switch (l) {
      case El:
        return "Fragment";
      case Ul:
        return "Profiler";
      case wl:
        return "StrictMode";
      case Q:
        return "Suspense";
      case Z:
        return "SuspenseList";
      case kl:
        return "Activity";
    }
    if (typeof l == "object") switch (l.$$typeof) {
      case bl:
        return "Portal";
      case F:
        return l.displayName || "Context";
      case Jl:
        return (l._context.displayName || "Context") + ".Consumer";
      case J:
        var t = l.render;
        return l = l.displayName, l || (l = t.displayName || t.name || "", l = l !== "" ? "ForwardRef(" + l + ")" : "ForwardRef"), l;
      case K:
        return t = l.displayName || null, t !== null ? t : Tl(l.type) || "Memo";
      case Hl:
        t = l._payload, l = l._init;
        try {
          return Tl(l(t));
        } catch {
        }
    }
    return null;
  }
  var x = Array.isArray, D = _.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, R = z.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, cl = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, Sl = [], et = -1;
  function r(l) {
    return { current: l };
  }
  function N(l) {
    0 > et || (l.current = Sl[et], Sl[et] = null, et--);
  }
  function C(l, t) {
    et++, Sl[et] = l.current, l.current = t;
  }
  var L = r(null), I = r(null), P = r(null), vl = r(null);
  function Wl(l, t) {
    switch (C(P, t), C(I, l), C(L, null), t.nodeType) {
      case 9:
      case 11:
        l = (l = t.documentElement) && (l = l.namespaceURI) ? jd(l) : 0;
        break;
      default:
        if (l = t.tagName, t = t.namespaceURI) t = jd(t), l = Ud(t, l);
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
    N(L), C(L, l);
  }
  function Ol() {
    N(L), N(I), N(P);
  }
  function Au(l) {
    l.memoizedState !== null && C(vl, l);
    var t = L.current, a = Ud(t, l.type);
    t !== a && (C(I, l), C(L, a));
  }
  function ze(l) {
    I.current === l && (N(L), N(I)), vl.current === l && (N(vl), he._currentValue = cl);
  }
  var Xn, cf;
  function za(l) {
    if (Xn === void 0) try {
      throw Error();
    } catch (a) {
      var t = a.stack.trim().match(/\n( *(at )?)/);
      Xn = t && t[1] || "", cf = -1 < a.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < a.stack.indexOf("@") ? "@unknown:0:0" : "";
    }
    return `
` + Xn + l + cf;
  }
  var Qn = !1;
  function Zn(l, t) {
    if (!l || Qn) return "";
    Qn = !0;
    var a = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var u = { DetermineComponentFrameRoot: function() {
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
      u.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var e = Object.getOwnPropertyDescriptor(u.DetermineComponentFrameRoot, "name");
      e && e.configurable && Object.defineProperty(u.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
      var n = u.DetermineComponentFrameRoot(), i = n[0], c = n[1];
      if (i && c) {
        var d = i.split(`
`), g = c.split(`
`);
        for (e = u = 0; u < d.length && !d[u].includes("DetermineComponentFrameRoot"); ) u++;
        for (; e < g.length && !g[e].includes("DetermineComponentFrameRoot"); ) e++;
        if (u === d.length || e === g.length) for (u = d.length - 1, e = g.length - 1; 1 <= u && 0 <= e && d[u] !== g[e]; ) e--;
        for (; 1 <= u && 0 <= e; u--, e--) if (d[u] !== g[e]) {
          if (u !== 1 || e !== 1) do
            if (u--, e--, 0 > e || d[u] !== g[e]) {
              var E = `
` + d[u].replace(" at new ", " at ");
              return l.displayName && E.includes("<anonymous>") && (E = E.replace("<anonymous>", l.displayName)), E;
            }
          while (1 <= u && 0 <= e);
          break;
        }
      }
    } finally {
      Qn = !1, Error.prepareStackTrace = a;
    }
    return (a = l ? l.displayName || l.name : "") ? za(a) : "";
  }
  function hv(l, t) {
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
        return Zn(l.type, !1);
      case 11:
        return Zn(l.type.render, !1);
      case 1:
        return Zn(l.type, !0);
      case 31:
        return za("Activity");
      default:
        return "";
    }
  }
  function ff(l) {
    try {
      var t = "", a = null;
      do
        t += hv(l, a), a = l, l = l.return;
      while (l);
      return t;
    } catch (u) {
      return `
Error generating stack: ` + u.message + `
` + u.stack;
    }
  }
  var Ln = Object.prototype.hasOwnProperty, Vn = o.unstable_scheduleCallback, Kn = o.unstable_cancelCallback, yv = o.unstable_shouldYield, gv = o.unstable_requestPaint, nt = o.unstable_now, bv = o.unstable_getCurrentPriorityLevel, sf = o.unstable_ImmediatePriority, df = o.unstable_UserBlockingPriority, pe = o.unstable_NormalPriority, Sv = o.unstable_LowPriority, vf = o.unstable_IdlePriority, _v = o.log, zv = o.unstable_setDisableYieldValue, Nu = null, it = null;
  function It(l) {
    if (typeof _v == "function" && zv(l), it && typeof it.setStrictMode == "function") try {
      it.setStrictMode(Nu, l);
    } catch {
    }
  }
  var ct = Math.clz32 ? Math.clz32 : Tv, pv = Math.log, Ev = Math.LN2;
  function Tv(l) {
    return l >>>= 0, l === 0 ? 32 : 31 - (pv(l) / Ev | 0) | 0;
  }
  var Ee = 256, Te = 262144, Me = 4194304;
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
  function Ae(l, t, a) {
    var u = l.pendingLanes;
    if (u === 0) return 0;
    var e = 0, n = l.suspendedLanes, i = l.pingedLanes;
    l = l.warmLanes;
    var c = u & 134217727;
    return c !== 0 ? (u = c & ~n, u !== 0 ? e = pa(u) : (i &= c, i !== 0 ? e = pa(i) : a || (a = c & ~l, a !== 0 && (e = pa(a))))) : (c = u & ~n, c !== 0 ? e = pa(c) : i !== 0 ? e = pa(i) : a || (a = u & ~l, a !== 0 && (e = pa(a)))), e === 0 ? 0 : t !== 0 && t !== e && (t & n) === 0 && (n = e & -e, a = t & -t, n >= a || n === 32 && (a & 4194048) !== 0) ? t : e;
  }
  function Ou(l, t) {
    return (l.pendingLanes & ~(l.suspendedLanes & ~l.pingedLanes) & t) === 0;
  }
  function Mv(l, t) {
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
  function rf() {
    var l = Me;
    return Me <<= 1, (Me & 62914560) === 0 && (Me = 4194304), l;
  }
  function Jn(l) {
    for (var t = [], a = 0; 31 > a; a++) t.push(l);
    return t;
  }
  function Ne(l, t) {
    l.pendingLanes |= t, t !== 268435456 && (l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0);
  }
  function Av(l, t, a, u, e, n) {
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
    u !== 0 && of(l, u, 0), n !== 0 && e === 0 && l.tag !== 0 && (l.suspendedLanes |= n & ~(i & ~t));
  }
  function of(l, t, a) {
    l.pendingLanes |= t, l.suspendedLanes &= ~t;
    var u = 31 - ct(t);
    l.entangledLanes |= t, l.entanglements[u] = l.entanglements[u] | 1073741824 | a & 261930;
  }
  function mf(l, t) {
    var a = l.entangledLanes |= t;
    for (l = l.entanglements; a; ) {
      var u = 31 - ct(a), e = 1 << u;
      e & t | l[u] & t && (l[u] |= t), a &= ~e;
    }
  }
  function hf(l, t) {
    var a = t & -t;
    return a = (a & 42) !== 0 ? 1 : yf(a), (a & (l.suspendedLanes | t)) !== 0 ? 0 : a;
  }
  function yf(l) {
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
  function wn(l) {
    return l &= -l, 2 < l ? 8 < l ? (l & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function gf() {
    var l = R.p;
    return l !== 0 ? l : (l = window.event, l === void 0 ? 32 : Id(l.type));
  }
  function bf(l, t) {
    var a = R.p;
    try {
      return R.p = l, t();
    } finally {
      R.p = a;
    }
  }
  var Pt = Math.random().toString(36).slice(2), Ql = "__reactFiber$" + Pt, Fl = "__reactProps$" + Pt, Du = "__reactContainer$" + Pt, kn = "__reactEvents$" + Pt, Nv = "__reactListeners$" + Pt, Ov = "__reactHandles$" + Pt, Sf = "__reactResources$" + Pt, ju = "__reactMarker$" + Pt;
  function Wn(l) {
    delete l[Ql], delete l[Fl], delete l[kn], delete l[Nv], delete l[Ov];
  }
  function Za(l) {
    var t = l[Ql];
    if (t) return t;
    for (var a = l.parentNode; a; ) {
      if (t = a[Du] || a[Ql]) {
        if (a = t.alternate, t.child !== null || a !== null && a.child !== null) for (l = qd(l); l !== null; ) {
          if (a = l[Ql]) return a;
          l = qd(l);
        }
        return t;
      }
      l = a, a = l.parentNode;
    }
    return null;
  }
  function La(l) {
    if (l = l[Ql] || l[Du]) {
      var t = l.tag;
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3) return l;
    }
    return null;
  }
  function Uu(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l.stateNode;
    throw Error(s(33));
  }
  function Va(l) {
    var t = l[Sf];
    return t || (t = l[Sf] = {
      hoistableStyles: /* @__PURE__ */ new Map(),
      hoistableScripts: /* @__PURE__ */ new Map()
    }), t;
  }
  function Gl(l) {
    l[ju] = !0;
  }
  var _f = /* @__PURE__ */ new Set(), zf = {};
  function Ea(l, t) {
    Ka(l, t), Ka(l + "Capture", t);
  }
  function Ka(l, t) {
    for (zf[l] = t, l = 0; l < t.length; l++) _f.add(t[l]);
  }
  var Dv = RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), pf = {}, Ef = {};
  function jv(l) {
    return Ln.call(Ef, l) ? !0 : Ln.call(pf, l) ? !1 : Dv.test(l) ? Ef[l] = !0 : (pf[l] = !0, !1);
  }
  function Oe(l, t, a) {
    if (jv(t)) if (a === null) l.removeAttribute(t);
    else {
      switch (typeof a) {
        case "undefined":
        case "function":
        case "symbol":
          l.removeAttribute(t);
          return;
        case "boolean":
          var u = t.toLowerCase().slice(0, 5);
          if (u !== "data-" && u !== "aria-") {
            l.removeAttribute(t);
            return;
          }
      }
      l.setAttribute(t, "" + a);
    }
  }
  function De(l, t, a) {
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
  function xt(l, t, a, u) {
    if (u === null) l.removeAttribute(a);
    else {
      switch (typeof u) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          l.removeAttribute(a);
          return;
      }
      l.setAttributeNS(t, a, "" + u);
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
  function Tf(l) {
    var t = l.type;
    return (l = l.nodeName) && l.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function Uv(l, t, a) {
    var u = Object.getOwnPropertyDescriptor(l.constructor.prototype, t);
    if (!l.hasOwnProperty(t) && typeof u < "u" && typeof u.get == "function" && typeof u.set == "function") {
      var e = u.get, n = u.set;
      return Object.defineProperty(l, t, {
        configurable: !0,
        get: function() {
          return e.call(this);
        },
        set: function(i) {
          a = "" + i, n.call(this, i);
        }
      }), Object.defineProperty(l, t, { enumerable: u.enumerable }), {
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
  function $n(l) {
    if (!l._valueTracker) {
      var t = Tf(l) ? "checked" : "value";
      l._valueTracker = Uv(l, t, "" + l[t]);
    }
  }
  function Mf(l) {
    if (!l) return !1;
    var t = l._valueTracker;
    if (!t) return !0;
    var a = t.getValue(), u = "";
    return l && (u = Tf(l) ? l.checked ? "true" : "false" : l.value), l = u, l !== a ? (t.setValue(l), !0) : !1;
  }
  function je(l) {
    if (l = l || (typeof document < "u" ? document : void 0), typeof l > "u") return null;
    try {
      return l.activeElement || l.body;
    } catch {
      return l.body;
    }
  }
  var Hv = /[\n"\\]/g;
  function ht(l) {
    return l.replace(Hv, function(t) {
      return "\\" + t.charCodeAt(0).toString(16) + " ";
    });
  }
  function Fn(l, t, a, u, e, n, i, c) {
    l.name = "", i != null && typeof i != "function" && typeof i != "symbol" && typeof i != "boolean" ? l.type = i : l.removeAttribute("type"), t != null ? i === "number" ? (t === 0 && l.value === "" || l.value != t) && (l.value = "" + mt(t)) : l.value !== "" + mt(t) && (l.value = "" + mt(t)) : i !== "submit" && i !== "reset" || l.removeAttribute("value"), t != null ? In(l, i, mt(t)) : a != null ? In(l, i, mt(a)) : u != null && l.removeAttribute("value"), e == null && n != null && (l.defaultChecked = !!n), e != null && (l.checked = e && typeof e != "function" && typeof e != "symbol"), c != null && typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" ? l.name = "" + mt(c) : l.removeAttribute("name");
  }
  function Af(l, t, a, u, e, n, i, c) {
    if (n != null && typeof n != "function" && typeof n != "symbol" && typeof n != "boolean" && (l.type = n), t != null || a != null) {
      if (!(n !== "submit" && n !== "reset" || t != null)) {
        $n(l);
        return;
      }
      a = a != null ? "" + mt(a) : "", t = t != null ? "" + mt(t) : a, c || t === l.value || (l.value = t), l.defaultValue = t;
    }
    u = u ?? e, u = typeof u != "function" && typeof u != "symbol" && !!u, l.checked = c ? l.checked : !!u, l.defaultChecked = !!u, i != null && typeof i != "function" && typeof i != "symbol" && typeof i != "boolean" && (l.name = i), $n(l);
  }
  function In(l, t, a) {
    t === "number" && je(l.ownerDocument) === l || l.defaultValue === "" + a || (l.defaultValue = "" + a);
  }
  function Ja(l, t, a, u) {
    if (l = l.options, t) {
      t = {};
      for (var e = 0; e < a.length; e++) t["$" + a[e]] = !0;
      for (a = 0; a < l.length; a++) e = t.hasOwnProperty("$" + l[a].value), l[a].selected !== e && (l[a].selected = e), e && u && (l[a].defaultSelected = !0);
    } else {
      for (a = "" + mt(a), t = null, e = 0; e < l.length; e++) {
        if (l[e].value === a) {
          l[e].selected = !0, u && (l[e].defaultSelected = !0);
          return;
        }
        t !== null || l[e].disabled || (t = l[e]);
      }
      t !== null && (t.selected = !0);
    }
  }
  function Nf(l, t, a) {
    if (t != null && (t = "" + mt(t), t !== l.value && (l.value = t), a == null)) {
      l.defaultValue !== t && (l.defaultValue = t);
      return;
    }
    l.defaultValue = a != null ? "" + mt(a) : "";
  }
  function Of(l, t, a, u) {
    if (t == null) {
      if (u != null) {
        if (a != null) throw Error(s(92));
        if (x(u)) {
          if (1 < u.length) throw Error(s(93));
          u = u[0];
        }
        a = u;
      }
      a ??= "", t = a;
    }
    a = mt(t), l.defaultValue = a, u = l.textContent, u === a && u !== "" && u !== null && (l.value = u), $n(l);
  }
  function wa(l, t) {
    if (t) {
      var a = l.firstChild;
      if (a && a === l.lastChild && a.nodeType === 3) {
        a.nodeValue = t;
        return;
      }
    }
    l.textContent = t;
  }
  var xv = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));
  function Df(l, t, a) {
    var u = t.indexOf("--") === 0;
    a == null || typeof a == "boolean" || a === "" ? u ? l.setProperty(t, "") : t === "float" ? l.cssFloat = "" : l[t] = "" : u ? l.setProperty(t, a) : typeof a != "number" || a === 0 || xv.has(t) ? t === "float" ? l.cssFloat = a : l[t] = ("" + a).trim() : l[t] = a + "px";
  }
  function jf(l, t, a) {
    if (t != null && typeof t != "object") throw Error(s(62));
    if (l = l.style, a != null) {
      for (var u in a) !a.hasOwnProperty(u) || t != null && t.hasOwnProperty(u) || (u.indexOf("--") === 0 ? l.setProperty(u, "") : u === "float" ? l.cssFloat = "" : l[u] = "");
      for (var e in t) u = t[e], t.hasOwnProperty(e) && a[e] !== u && Df(l, e, u);
    } else for (var n in t) t.hasOwnProperty(n) && Df(l, n, t[n]);
  }
  function Pn(l) {
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
  var Rv = /* @__PURE__ */ new Map([
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
  ]), Cv = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Ue(l) {
    return Cv.test("" + l) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : l;
  }
  function Rt() {
  }
  var li = null;
  function ti(l) {
    return l = l.target || l.srcElement || window, l.correspondingUseElement && (l = l.correspondingUseElement), l.nodeType === 3 ? l.parentNode : l;
  }
  var ka = null, Wa = null;
  function Uf(l) {
    var t = La(l);
    if (t && (l = t.stateNode)) {
      var a = l[Fl] || null;
      l: switch (l = t.stateNode, t.type) {
        case "input":
          if (Fn(l, a.value, a.defaultValue, a.defaultValue, a.checked, a.defaultChecked, a.type, a.name), t = a.name, a.type === "radio" && t != null) {
            for (a = l; a.parentNode; ) a = a.parentNode;
            for (a = a.querySelectorAll('input[name="' + ht("" + t) + '"][type="radio"]'), t = 0; t < a.length; t++) {
              var u = a[t];
              if (u !== l && u.form === l.form) {
                var e = u[Fl] || null;
                if (!e) throw Error(s(90));
                Fn(u, e.value, e.defaultValue, e.defaultValue, e.checked, e.defaultChecked, e.type, e.name);
              }
            }
            for (t = 0; t < a.length; t++) u = a[t], u.form === l.form && Mf(u);
          }
          break l;
        case "textarea":
          Nf(l, a.value, a.defaultValue);
          break l;
        case "select":
          t = a.value, t != null && Ja(l, !!a.multiple, t, !1);
      }
    }
  }
  var ai = !1;
  function Hf(l, t, a) {
    if (ai) return l(t, a);
    ai = !0;
    try {
      return l(t);
    } finally {
      if (ai = !1, (ka !== null || Wa !== null) && (Sn(), ka && (t = ka, l = Wa, Wa = ka = null, Uf(t), l)))
        for (t = 0; t < l.length; t++) Uf(l[t]);
    }
  }
  function Hu(l, t) {
    var a = l.stateNode;
    if (a === null) return null;
    var u = a[Fl] || null;
    if (u === null) return null;
    a = u[t];
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
        (u = !u.disabled) || (l = l.type, u = !(l === "button" || l === "input" || l === "select" || l === "textarea")), l = !u;
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
    var xu = {};
    Object.defineProperty(xu, "passive", { get: function() {
      ui = !0;
    } }), window.addEventListener("test", xu, xu), window.removeEventListener("test", xu, xu);
  } catch {
    ui = !1;
  }
  var la = null, ei = null, He = null;
  function xf() {
    if (He) return He;
    var l, t = ei, a = t.length, u, e = "value" in la ? la.value : la.textContent, n = e.length;
    for (l = 0; l < a && t[l] === e[l]; l++) ;
    var i = a - l;
    for (u = 1; u <= i && t[a - u] === e[n - u]; u++) ;
    return He = e.slice(l, 1 < u ? 1 - u : void 0);
  }
  function xe(l) {
    var t = l.keyCode;
    return "charCode" in l ? (l = l.charCode, l === 0 && t === 13 && (l = 13)) : l = t, l === 10 && (l = 13), 32 <= l || l === 13 ? l : 0;
  }
  function Re() {
    return !0;
  }
  function Rf() {
    return !1;
  }
  function Il(l) {
    function t(a, u, e, n, i) {
      this._reactName = a, this._targetInst = e, this.type = u, this.nativeEvent = n, this.target = i, this.currentTarget = null;
      for (var c in l) l.hasOwnProperty(c) && (a = l[c], this[c] = a ? a(n) : n[c]);
      return this.isDefaultPrevented = (n.defaultPrevented != null ? n.defaultPrevented : n.returnValue === !1) ? Re : Rf, this.isPropagationStopped = Rf, this;
    }
    return B(t.prototype, {
      preventDefault: function() {
        this.defaultPrevented = !0;
        var a = this.nativeEvent;
        a && (a.preventDefault ? a.preventDefault() : typeof a.returnValue != "unknown" && (a.returnValue = !1), this.isDefaultPrevented = Re);
      },
      stopPropagation: function() {
        var a = this.nativeEvent;
        a && (a.stopPropagation ? a.stopPropagation() : typeof a.cancelBubble != "unknown" && (a.cancelBubble = !0), this.isPropagationStopped = Re);
      },
      persist: function() {
      },
      isPersistent: Re
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
  }, Ce = Il(Ta), Ru = B({}, Ta, {
    view: 0,
    detail: 0
  }), Bv = Il(Ru), ni, ii, Cu, Be = B({}, Ru, {
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
    getModifierState: fi,
    button: 0,
    buttons: 0,
    relatedTarget: function(l) {
      return l.relatedTarget === void 0 ? l.fromElement === l.srcElement ? l.toElement : l.fromElement : l.relatedTarget;
    },
    movementX: function(l) {
      return "movementX" in l ? l.movementX : (l !== Cu && (Cu && l.type === "mousemove" ? (ni = l.screenX - Cu.screenX, ii = l.screenY - Cu.screenY) : ii = ni = 0, Cu = l), ni);
    },
    movementY: function(l) {
      return "movementY" in l ? l.movementY : ii;
    }
  }), Cf = Il(Be), Yv = Il(B({}, Be, { dataTransfer: 0 })), ci = Il(B({}, Ru, { relatedTarget: 0 })), qv = Il(B({}, Ta, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  })), Gv = Il(B({}, Ta, { clipboardData: function(l) {
    return "clipboardData" in l ? l.clipboardData : window.clipboardData;
  } })), Bf = Il(B({}, Ta, { data: 0 })), Xv = {
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
  }, Qv = {
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
  }, Zv = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function Lv(l) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(l) : (l = Zv[l]) ? !!t[l] : !1;
  }
  function fi() {
    return Lv;
  }
  var Vv = Il(B({}, Ru, {
    key: function(l) {
      if (l.key) {
        var t = Xv[l.key] || l.key;
        if (t !== "Unidentified") return t;
      }
      return l.type === "keypress" ? (l = xe(l), l === 13 ? "Enter" : String.fromCharCode(l)) : l.type === "keydown" || l.type === "keyup" ? Qv[l.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: fi,
    charCode: function(l) {
      return l.type === "keypress" ? xe(l) : 0;
    },
    keyCode: function(l) {
      return l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    },
    which: function(l) {
      return l.type === "keypress" ? xe(l) : l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    }
  })), Yf = Il(B({}, Be, {
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
  })), Kv = Il(B({}, Ru, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: fi
  })), Jv = Il(B({}, Ta, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  })), wv = Il(B({}, Be, {
    deltaX: function(l) {
      return "deltaX" in l ? l.deltaX : "wheelDeltaX" in l ? -l.wheelDeltaX : 0;
    },
    deltaY: function(l) {
      return "deltaY" in l ? l.deltaY : "wheelDeltaY" in l ? -l.wheelDeltaY : "wheelDelta" in l ? -l.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  })), kv = Il(B({}, Ta, {
    newState: 0,
    oldState: 0
  })), Wv = [
    9,
    13,
    27,
    32
  ], si = Ct && "CompositionEvent" in window, Bu = null;
  Ct && "documentMode" in document && (Bu = document.documentMode);
  var $v = Ct && "TextEvent" in window && !Bu, qf = Ct && (!si || Bu && 8 < Bu && 11 >= Bu), Gf = " ", Xf = !1;
  function Qf(l, t) {
    switch (l) {
      case "keyup":
        return Wv.indexOf(t.keyCode) !== -1;
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
  function Zf(l) {
    return l = l.detail, typeof l == "object" && "data" in l ? l.data : null;
  }
  var $a = !1;
  function Fv(l, t) {
    switch (l) {
      case "compositionend":
        return Zf(t);
      case "keypress":
        return t.which !== 32 ? null : (Xf = !0, Gf);
      case "textInput":
        return l = t.data, l === Gf && Xf ? null : l;
      default:
        return null;
    }
  }
  function Iv(l, t) {
    if ($a) return l === "compositionend" || !si && Qf(l, t) ? (l = xf(), He = ei = la = null, $a = !1, l) : null;
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
        return qf && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var Pv = {
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
  function Lf(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t === "input" ? !!Pv[l.type] : t === "textarea";
  }
  function Vf(l, t, a, u) {
    ka ? Wa ? Wa.push(u) : Wa = [u] : ka = u, t = An(t, "onChange"), 0 < t.length && (a = new Ce("onChange", "change", null, a, u), l.push({
      event: a,
      listeners: t
    }));
  }
  var Yu = null, qu = null;
  function lr(l) {
    Ed(l, 0);
  }
  function Ye(l) {
    if (Mf(Uu(l))) return l;
  }
  function Kf(l, t) {
    if (l === "change") return t;
  }
  var Jf = !1;
  if (Ct) {
    var di;
    if (Ct) {
      var vi = "oninput" in document;
      if (!vi) {
        var wf = document.createElement("div");
        wf.setAttribute("oninput", "return;"), vi = typeof wf.oninput == "function";
      }
      di = vi;
    } else di = !1;
    Jf = di && (!document.documentMode || 9 < document.documentMode);
  }
  function kf() {
    Yu && (Yu.detachEvent("onpropertychange", Wf), qu = Yu = null);
  }
  function Wf(l) {
    if (l.propertyName === "value" && Ye(qu)) {
      var t = [];
      Vf(t, qu, l, ti(l)), Hf(lr, t);
    }
  }
  function tr(l, t, a) {
    l === "focusin" ? (kf(), Yu = t, qu = a, Yu.attachEvent("onpropertychange", Wf)) : l === "focusout" && kf();
  }
  function ar(l) {
    if (l === "selectionchange" || l === "keyup" || l === "keydown") return Ye(qu);
  }
  function ur(l, t) {
    if (l === "click") return Ye(t);
  }
  function er(l, t) {
    if (l === "input" || l === "change") return Ye(t);
  }
  function nr(l, t) {
    return l === t && (l !== 0 || 1 / l === 1 / t) || l !== l && t !== t;
  }
  var ft = typeof Object.is == "function" ? Object.is : nr;
  function Gu(l, t) {
    if (ft(l, t)) return !0;
    if (typeof l != "object" || l === null || typeof t != "object" || t === null) return !1;
    var a = Object.keys(l), u = Object.keys(t);
    if (a.length !== u.length) return !1;
    for (u = 0; u < a.length; u++) {
      var e = a[u];
      if (!Ln.call(t, e) || !ft(l[e], t[e])) return !1;
    }
    return !0;
  }
  function $f(l) {
    for (; l && l.firstChild; ) l = l.firstChild;
    return l;
  }
  function Ff(l, t) {
    var a = $f(l);
    l = 0;
    for (var u; a; ) {
      if (a.nodeType === 3) {
        if (u = l + a.textContent.length, l <= t && u >= t) return {
          node: a,
          offset: t - l
        };
        l = u;
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
      a = $f(a);
    }
  }
  function If(l, t) {
    return l && t ? l === t ? !0 : l && l.nodeType === 3 ? !1 : t && t.nodeType === 3 ? If(l, t.parentNode) : "contains" in l ? l.contains(t) : l.compareDocumentPosition ? !!(l.compareDocumentPosition(t) & 16) : !1 : !1;
  }
  function Pf(l) {
    l = l != null && l.ownerDocument != null && l.ownerDocument.defaultView != null ? l.ownerDocument.defaultView : window;
    for (var t = je(l.document); t instanceof l.HTMLIFrameElement; ) {
      try {
        var a = typeof t.contentWindow.location.href == "string";
      } catch {
        a = !1;
      }
      if (a) l = t.contentWindow;
      else break;
      t = je(l.document);
    }
    return t;
  }
  function ri(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t && (t === "input" && (l.type === "text" || l.type === "search" || l.type === "tel" || l.type === "url" || l.type === "password") || t === "textarea" || l.contentEditable === "true");
  }
  var ir = Ct && "documentMode" in document && 11 >= document.documentMode, Fa = null, oi = null, Xu = null, mi = !1;
  function l0(l, t, a) {
    var u = a.window === a ? a.document : a.nodeType === 9 ? a : a.ownerDocument;
    mi || Fa == null || Fa !== je(u) || (u = Fa, "selectionStart" in u && ri(u) ? u = {
      start: u.selectionStart,
      end: u.selectionEnd
    } : (u = (u.ownerDocument && u.ownerDocument.defaultView || window).getSelection(), u = {
      anchorNode: u.anchorNode,
      anchorOffset: u.anchorOffset,
      focusNode: u.focusNode,
      focusOffset: u.focusOffset
    }), Xu && Gu(Xu, u) || (Xu = u, u = An(oi, "onSelect"), 0 < u.length && (t = new Ce("onSelect", "select", null, t, a), l.push({
      event: t,
      listeners: u
    }), t.target = Fa)));
  }
  function Ma(l, t) {
    var a = {};
    return a[l.toLowerCase()] = t.toLowerCase(), a["Webkit" + l] = "webkit" + t, a["Moz" + l] = "moz" + t, a;
  }
  var Ia = {
    animationend: Ma("Animation", "AnimationEnd"),
    animationiteration: Ma("Animation", "AnimationIteration"),
    animationstart: Ma("Animation", "AnimationStart"),
    transitionrun: Ma("Transition", "TransitionRun"),
    transitionstart: Ma("Transition", "TransitionStart"),
    transitioncancel: Ma("Transition", "TransitionCancel"),
    transitionend: Ma("Transition", "TransitionEnd")
  }, hi = {}, t0 = {};
  Ct && (t0 = document.createElement("div").style, "AnimationEvent" in window || (delete Ia.animationend.animation, delete Ia.animationiteration.animation, delete Ia.animationstart.animation), "TransitionEvent" in window || delete Ia.transitionend.transition);
  function Aa(l) {
    if (hi[l]) return hi[l];
    if (!Ia[l]) return l;
    var t = Ia[l], a;
    for (a in t) if (t.hasOwnProperty(a) && a in t0) return hi[l] = t[a];
    return l;
  }
  var a0 = Aa("animationend"), u0 = Aa("animationiteration"), e0 = Aa("animationstart"), cr = Aa("transitionrun"), fr = Aa("transitionstart"), sr = Aa("transitioncancel"), n0 = Aa("transitionend"), i0 = /* @__PURE__ */ new Map(), yi = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
  yi.push("scrollEnd");
  function Mt(l, t) {
    i0.set(l, t), Ea(t, [l]);
  }
  var qe = typeof reportError == "function" ? reportError : function(l) {
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
  }, yt = [], Pa = 0, gi = 0;
  function Ge() {
    for (var l = Pa, t = gi = Pa = 0; t < l; ) {
      var a = yt[t];
      yt[t++] = null;
      var u = yt[t];
      yt[t++] = null;
      var e = yt[t];
      yt[t++] = null;
      var n = yt[t];
      if (yt[t++] = null, u !== null && e !== null) {
        var i = u.pending;
        i === null ? e.next = e : (e.next = i.next, i.next = e), u.pending = e;
      }
      n !== 0 && c0(a, e, n);
    }
  }
  function Xe(l, t, a, u) {
    yt[Pa++] = l, yt[Pa++] = t, yt[Pa++] = a, yt[Pa++] = u, gi |= u, l.lanes |= u, l = l.alternate, l !== null && (l.lanes |= u);
  }
  function bi(l, t, a, u) {
    return Xe(l, t, a, u), Qe(l);
  }
  function Na(l, t) {
    return Xe(l, null, null, t), Qe(l);
  }
  function c0(l, t, a) {
    l.lanes |= a;
    var u = l.alternate;
    u !== null && (u.lanes |= a);
    for (var e = !1, n = l.return; n !== null; ) n.childLanes |= a, u = n.alternate, u !== null && (u.childLanes |= a), n.tag === 22 && (l = n.stateNode, l === null || l._visibility & 1 || (e = !0)), l = n, n = n.return;
    return l.tag === 3 ? (n = l.stateNode, e && t !== null && (e = 31 - ct(a), l = n.hiddenUpdates, u = l[e], u === null ? l[e] = [t] : u.push(t), t.lane = a | 536870912), n) : null;
  }
  function Qe(l) {
    if (50 < fe) throw fe = 0, Nc = null, Error(s(185));
    for (var t = l.return; t !== null; ) l = t, t = l.return;
    return l.tag === 3 ? l.stateNode : null;
  }
  var lu = {};
  function dr(l, t, a, u) {
    this.tag = l, this.key = a, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = u, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function st(l, t, a, u) {
    return new dr(l, t, a, u);
  }
  function Si(l) {
    return l = l.prototype, !(!l || !l.isReactComponent);
  }
  function Bt(l, t) {
    var a = l.alternate;
    return a === null ? (a = st(l.tag, t, l.key, l.mode), a.elementType = l.elementType, a.type = l.type, a.stateNode = l.stateNode, a.alternate = l, l.alternate = a) : (a.pendingProps = t, a.type = l.type, a.flags = 0, a.subtreeFlags = 0, a.deletions = null), a.flags = l.flags & 65011712, a.childLanes = l.childLanes, a.lanes = l.lanes, a.child = l.child, a.memoizedProps = l.memoizedProps, a.memoizedState = l.memoizedState, a.updateQueue = l.updateQueue, t = l.dependencies, a.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }, a.sibling = l.sibling, a.index = l.index, a.ref = l.ref, a.refCleanup = l.refCleanup, a;
  }
  function f0(l, t) {
    l.flags &= 65011714;
    var a = l.alternate;
    return a === null ? (l.childLanes = 0, l.lanes = t, l.child = null, l.subtreeFlags = 0, l.memoizedProps = null, l.memoizedState = null, l.updateQueue = null, l.dependencies = null, l.stateNode = null) : (l.childLanes = a.childLanes, l.lanes = a.lanes, l.child = a.child, l.subtreeFlags = 0, l.deletions = null, l.memoizedProps = a.memoizedProps, l.memoizedState = a.memoizedState, l.updateQueue = a.updateQueue, l.type = a.type, t = a.dependencies, l.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }), l;
  }
  function Ze(l, t, a, u, e, n) {
    var i = 0;
    if (u = l, typeof l == "function") Si(l) && (i = 1);
    else if (typeof l == "string") i = go(l, a, L.current) ? 26 : l === "html" || l === "head" || l === "body" ? 27 : 5;
    else l: switch (l) {
      case kl:
        return l = st(31, a, t, e), l.elementType = kl, l.lanes = n, l;
      case El:
        return Oa(a.children, e, n, t);
      case wl:
        i = 8, e |= 24;
        break;
      case Ul:
        return l = st(12, a, t, e | 2), l.elementType = Ul, l.lanes = n, l;
      case Q:
        return l = st(13, a, t, e), l.elementType = Q, l.lanes = n, l;
      case Z:
        return l = st(19, a, t, e), l.elementType = Z, l.lanes = n, l;
      default:
        if (typeof l == "object" && l !== null) switch (l.$$typeof) {
          case F:
            i = 10;
            break l;
          case Jl:
            i = 9;
            break l;
          case J:
            i = 11;
            break l;
          case K:
            i = 14;
            break l;
          case Hl:
            i = 16, u = null;
            break l;
        }
        i = 29, a = Error(s(130, l === null ? "null" : typeof l, "")), u = null;
    }
    return t = st(i, a, t, e), t.elementType = l, t.type = u, t.lanes = n, t;
  }
  function Oa(l, t, a, u) {
    return l = st(7, l, u, t), l.lanes = a, l;
  }
  function _i(l, t, a) {
    return l = st(6, l, null, t), l.lanes = a, l;
  }
  function s0(l) {
    var t = st(18, null, null, 0);
    return t.stateNode = l, t;
  }
  function zi(l, t, a) {
    return t = st(4, l.children !== null ? l.children : [], l.key, t), t.lanes = a, t.stateNode = {
      containerInfo: l.containerInfo,
      pendingChildren: null,
      implementation: l.implementation
    }, t;
  }
  var d0 = /* @__PURE__ */ new WeakMap();
  function gt(l, t) {
    if (typeof l == "object" && l !== null) {
      var a = d0.get(l);
      return a !== void 0 ? a : (t = {
        value: l,
        source: t,
        stack: ff(t)
      }, d0.set(l, t), t);
    }
    return {
      value: l,
      source: t,
      stack: ff(t)
    };
  }
  var tu = [], au = 0, Le = null, Qu = 0, bt = [], St = 0, ta = null, Ot = 1, Dt = "";
  function Yt(l, t) {
    tu[au++] = Qu, tu[au++] = Le, Le = l, Qu = t;
  }
  function v0(l, t, a) {
    bt[St++] = Ot, bt[St++] = Dt, bt[St++] = ta, ta = l;
    var u = Ot;
    l = Dt;
    var e = 32 - ct(u) - 1;
    u &= ~(1 << e), a += 1;
    var n = 32 - ct(t) + e;
    if (30 < n) {
      var i = e - e % 5;
      n = (u & (1 << i) - 1).toString(32), u >>= i, e -= i, Ot = 1 << 32 - ct(t) + e | a << e | u, Dt = n + l;
    } else Ot = 1 << n | a << e | u, Dt = l;
  }
  function pi(l) {
    l.return !== null && (Yt(l, 1), v0(l, 1, 0));
  }
  function Ei(l) {
    for (; l === Le; ) Le = tu[--au], tu[au] = null, Qu = tu[--au], tu[au] = null;
    for (; l === ta; ) ta = bt[--St], bt[St] = null, Dt = bt[--St], bt[St] = null, Ot = bt[--St], bt[St] = null;
  }
  function r0(l, t) {
    bt[St++] = Ot, bt[St++] = Dt, bt[St++] = ta, Ot = t.id, Dt = t.overflow, ta = l;
  }
  var Zl = null, _l = null, il = !1, aa = null, _t = !1, Ti = Error(s(519));
  function ua(l) {
    throw Zu(gt(Error(s(418, 1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML", "")), l)), Ti;
  }
  function o0(l) {
    var t = l.stateNode, a = l.type, u = l.memoizedProps;
    switch (t[Ql] = l, t[Fl] = u, a) {
      case "dialog":
        tl("cancel", t), tl("close", t);
        break;
      case "iframe":
      case "object":
      case "embed":
        tl("load", t);
        break;
      case "video":
      case "audio":
        for (a = 0; a < de.length; a++) tl(de[a], t);
        break;
      case "source":
        tl("error", t);
        break;
      case "img":
      case "image":
      case "link":
        tl("error", t), tl("load", t);
        break;
      case "details":
        tl("toggle", t);
        break;
      case "input":
        tl("invalid", t), Af(t, u.value, u.defaultValue, u.checked, u.defaultChecked, u.type, u.name, !0);
        break;
      case "select":
        tl("invalid", t);
        break;
      case "textarea":
        tl("invalid", t), Of(t, u.value, u.defaultValue, u.children);
    }
    a = u.children, typeof a != "string" && typeof a != "number" && typeof a != "bigint" || t.textContent === "" + a || u.suppressHydrationWarning === !0 || Od(t.textContent, a) ? (u.popover != null && (tl("beforetoggle", t), tl("toggle", t)), u.onScroll != null && tl("scroll", t), u.onScrollEnd != null && tl("scrollend", t), u.onClick != null && (t.onclick = Rt), t = !0) : t = !1, t || ua(l, !0);
  }
  function m0(l) {
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
  function uu(l) {
    if (l !== Zl) return !1;
    if (!il) return m0(l), il = !0, !1;
    var t = l.tag, a;
    if ((a = t !== 3 && t !== 27) && ((a = t === 5) && (a = l.type, a = !(a !== "form" && a !== "button") || Qc(l.type, l.memoizedProps)), a = !a), a && _l && ua(l), m0(l), t === 13) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(s(317));
      _l = Yd(l);
    } else if (t === 31) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(s(317));
      _l = Yd(l);
    } else t === 27 ? (t = _l, ha(l.type) ? (l = Jc, Jc = null, _l = l) : _l = t) : _l = Zl ? Et(l.stateNode.nextSibling) : null;
    return !0;
  }
  function Da() {
    _l = Zl = null, il = !1;
  }
  function Mi() {
    var l = aa;
    return l !== null && (at === null ? at = l : at.push.apply(at, l), aa = null), l;
  }
  function Zu(l) {
    aa === null ? aa = [l] : aa.push(l);
  }
  var Ai = r(null), ja = null, qt = null;
  function ea(l, t, a) {
    C(Ai, t._currentValue), t._currentValue = a;
  }
  function Gt(l) {
    l._currentValue = Ai.current, N(Ai);
  }
  function Ni(l, t, a) {
    for (; l !== null; ) {
      var u = l.alternate;
      if ((l.childLanes & t) !== t ? (l.childLanes |= t, u !== null && (u.childLanes |= t)) : u !== null && (u.childLanes & t) !== t && (u.childLanes |= t), l === a) break;
      l = l.return;
    }
  }
  function Oi(l, t, a, u) {
    var e = l.child;
    for (e !== null && (e.return = l); e !== null; ) {
      var n = e.dependencies;
      if (n !== null) {
        var i = e.child;
        n = n.firstContext;
        l: for (; n !== null; ) {
          var c = n;
          n = e;
          for (var d = 0; d < t.length; d++) if (c.context === t[d]) {
            n.lanes |= a, c = n.alternate, c !== null && (c.lanes |= a), Ni(n.return, a, l), u || (i = null);
            break l;
          }
          n = c.next;
        }
      } else if (e.tag === 18) {
        if (i = e.return, i === null) throw Error(s(341));
        i.lanes |= a, n = i.alternate, n !== null && (n.lanes |= a), Ni(i, a, l), i = null;
      } else i = e.child;
      if (i !== null) i.return = e;
      else for (i = e; i !== null; ) {
        if (i === l) {
          i = null;
          break;
        }
        if (e = i.sibling, e !== null) {
          e.return = i.return, i = e;
          break;
        }
        i = i.return;
      }
      e = i;
    }
  }
  function eu(l, t, a, u) {
    l = null;
    for (var e = t, n = !1; e !== null; ) {
      if (!n) {
        if ((e.flags & 524288) !== 0) n = !0;
        else if ((e.flags & 262144) !== 0) break;
      }
      if (e.tag === 10) {
        var i = e.alternate;
        if (i === null) throw Error(s(387));
        if (i = i.memoizedProps, i !== null) {
          var c = e.type;
          ft(e.pendingProps.value, i.value) || (l !== null ? l.push(c) : l = [c]);
        }
      } else if (e === vl.current) {
        if (i = e.alternate, i === null) throw Error(s(387));
        i.memoizedState.memoizedState !== e.memoizedState.memoizedState && (l !== null ? l.push(he) : l = [he]);
      }
      e = e.return;
    }
    l !== null && Oi(t, l, a, u), t.flags |= 262144;
  }
  function Ve(l) {
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
    return h0(ja, l);
  }
  function Ke(l, t) {
    return ja === null && Ua(l), h0(l, t);
  }
  function h0(l, t) {
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
  var vr = typeof AbortController < "u" ? AbortController : function() {
    var l = [], t = this.signal = {
      aborted: !1,
      addEventListener: function(a, u) {
        l.push(u);
      }
    };
    this.abort = function() {
      t.aborted = !0, l.forEach(function(a) {
        return a();
      });
    };
  }, rr = o.unstable_scheduleCallback, or = o.unstable_NormalPriority, xl = {
    $$typeof: F,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function Di() {
    return {
      controller: new vr(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function Lu(l) {
    l.refCount--, l.refCount === 0 && rr(or, function() {
      l.controller.abort();
    });
  }
  var Vu = null, ji = 0, nu = 0, iu = null;
  function mr(l, t) {
    if (Vu === null) {
      var a = Vu = [];
      ji = 0, nu = xc(), iu = {
        status: "pending",
        value: void 0,
        then: function(u) {
          a.push(u);
        }
      };
    }
    return ji++, t.then(y0, y0), t;
  }
  function y0() {
    if (--ji === 0 && Vu !== null) {
      iu !== null && (iu.status = "fulfilled");
      var l = Vu;
      Vu = null, nu = 0, iu = null;
      for (var t = 0; t < l.length; t++) (0, l[t])();
    }
  }
  function hr(l, t) {
    var a = [], u = {
      status: "pending",
      value: null,
      reason: null,
      then: function(e) {
        a.push(e);
      }
    };
    return l.then(function() {
      u.status = "fulfilled", u.value = t;
      for (var e = 0; e < a.length; e++) (0, a[e])(t);
    }, function(e) {
      for (u.status = "rejected", u.reason = e, e = 0; e < a.length; e++) (0, a[e])(void 0);
    }), u;
  }
  var g0 = D.S;
  D.S = function(l, t) {
    Fs = nt(), typeof t == "object" && t !== null && typeof t.then == "function" && mr(l, t), g0 !== null && g0(l, t);
  };
  var Ha = r(null);
  function Ui() {
    var l = Ha.current;
    return l !== null ? l : gl.pooledCache;
  }
  function Je(l, t) {
    t === null ? C(Ha, Ha.current) : C(Ha, t.pool);
  }
  function b0() {
    var l = Ui();
    return l === null ? null : {
      parent: xl._currentValue,
      pool: l
    };
  }
  var cu = Error(s(460)), Hi = Error(s(474)), we = Error(s(542)), ke = { then: function() {
  } };
  function S0(l) {
    return l = l.status, l === "fulfilled" || l === "rejected";
  }
  function _0(l, t, a) {
    switch (a = l[a], a === void 0 ? l.push(t) : a !== t && (t.then(Rt, Rt), t = a), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw l = t.reason, p0(l), l;
      default:
        if (typeof t.status == "string") t.then(Rt, Rt);
        else {
          if (l = gl, l !== null && 100 < l.shellSuspendCounter) throw Error(s(482));
          l = t, l.status = "pending", l.then(function(u) {
            if (t.status === "pending") {
              var e = t;
              e.status = "fulfilled", e.value = u;
            }
          }, function(u) {
            if (t.status === "pending") {
              var e = t;
              e.status = "rejected", e.reason = u;
            }
          });
        }
        switch (t.status) {
          case "fulfilled":
            return t.value;
          case "rejected":
            throw l = t.reason, p0(l), l;
        }
        throw Ra = t, cu;
    }
  }
  function xa(l) {
    try {
      var t = l._init;
      return t(l._payload);
    } catch (a) {
      throw a !== null && typeof a == "object" && typeof a.then == "function" ? (Ra = a, cu) : a;
    }
  }
  var Ra = null;
  function z0() {
    if (Ra === null) throw Error(s(459));
    var l = Ra;
    return Ra = null, l;
  }
  function p0(l) {
    if (l === cu || l === we) throw Error(s(483));
  }
  var fu = null, Ku = 0;
  function We(l) {
    var t = Ku;
    return Ku += 1, fu === null && (fu = []), _0(fu, l, t);
  }
  function Ju(l, t) {
    t = t.props.ref, l.ref = t !== void 0 ? t : null;
  }
  function $e(l, t) {
    throw t.$$typeof === nl ? Error(s(525)) : (l = Object.prototype.toString.call(t), Error(s(31, l === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : l)));
  }
  function E0(l) {
    function t(m, v) {
      if (l) {
        var y = m.deletions;
        y === null ? (m.deletions = [v], m.flags |= 16) : y.push(v);
      }
    }
    function a(m, v) {
      if (!l) return null;
      for (; v !== null; ) t(m, v), v = v.sibling;
      return null;
    }
    function u(m) {
      for (var v = /* @__PURE__ */ new Map(); m !== null; ) m.key !== null ? v.set(m.key, m) : v.set(m.index, m), m = m.sibling;
      return v;
    }
    function e(m, v) {
      return m = Bt(m, v), m.index = 0, m.sibling = null, m;
    }
    function n(m, v, y) {
      return m.index = y, l ? (y = m.alternate, y !== null ? (y = y.index, y < v ? (m.flags |= 67108866, v) : y) : (m.flags |= 67108866, v)) : (m.flags |= 1048576, v);
    }
    function i(m) {
      return l && m.alternate === null && (m.flags |= 67108866), m;
    }
    function c(m, v, y, T) {
      return v === null || v.tag !== 6 ? (v = _i(y, m.mode, T), v.return = m, v) : (v = e(v, y), v.return = m, v);
    }
    function d(m, v, y, T) {
      var V = y.type;
      return V === El ? E(m, v, y.props.children, T, y.key) : v !== null && (v.elementType === V || typeof V == "object" && V !== null && V.$$typeof === Hl && xa(V) === v.type) ? (v = e(v, y.props), Ju(v, y), v.return = m, v) : (v = Ze(y.type, y.key, y.props, null, m.mode, T), Ju(v, y), v.return = m, v);
    }
    function g(m, v, y, T) {
      return v === null || v.tag !== 4 || v.stateNode.containerInfo !== y.containerInfo || v.stateNode.implementation !== y.implementation ? (v = zi(y, m.mode, T), v.return = m, v) : (v = e(v, y.children || []), v.return = m, v);
    }
    function E(m, v, y, T, V) {
      return v === null || v.tag !== 7 ? (v = Oa(y, m.mode, T, V), v.return = m, v) : (v = e(v, y), v.return = m, v);
    }
    function A(m, v, y) {
      if (typeof v == "string" && v !== "" || typeof v == "number" || typeof v == "bigint") return v = _i("" + v, m.mode, y), v.return = m, v;
      if (typeof v == "object" && v !== null) {
        switch (v.$$typeof) {
          case $:
            return y = Ze(v.type, v.key, v.props, null, m.mode, y), Ju(y, v), y.return = m, y;
          case bl:
            return v = zi(v, m.mode, y), v.return = m, v;
          case Hl:
            return v = xa(v), A(m, v, y);
        }
        if (x(v) || Ml(v)) return v = Oa(v, m.mode, y, null), v.return = m, v;
        if (typeof v.then == "function") return A(m, We(v), y);
        if (v.$$typeof === F) return A(m, Ke(m, v), y);
        $e(m, v);
      }
      return null;
    }
    function b(m, v, y, T) {
      var V = v !== null ? v.key : null;
      if (typeof y == "string" && y !== "" || typeof y == "number" || typeof y == "bigint") return V !== null ? null : c(m, v, "" + y, T);
      if (typeof y == "object" && y !== null) {
        switch (y.$$typeof) {
          case $:
            return y.key === V ? d(m, v, y, T) : null;
          case bl:
            return y.key === V ? g(m, v, y, T) : null;
          case Hl:
            return y = xa(y), b(m, v, y, T);
        }
        if (x(y) || Ml(y)) return V !== null ? null : E(m, v, y, T, null);
        if (typeof y.then == "function") return b(m, v, We(y), T);
        if (y.$$typeof === F) return b(m, v, Ke(m, y), T);
        $e(m, y);
      }
      return null;
    }
    function S(m, v, y, T, V) {
      if (typeof T == "string" && T !== "" || typeof T == "number" || typeof T == "bigint") return m = m.get(y) || null, c(v, m, "" + T, V);
      if (typeof T == "object" && T !== null) {
        switch (T.$$typeof) {
          case $:
            return m = m.get(T.key === null ? y : T.key) || null, d(v, m, T, V);
          case bl:
            return m = m.get(T.key === null ? y : T.key) || null, g(v, m, T, V);
          case Hl:
            return T = xa(T), S(m, v, y, T, V);
        }
        if (x(T) || Ml(T)) return m = m.get(y) || null, E(v, m, T, V, null);
        if (typeof T.then == "function") return S(m, v, y, We(T), V);
        if (T.$$typeof === F) return S(m, v, y, Ke(v, T), V);
        $e(v, T);
      }
      return null;
    }
    function q(m, v, y, T) {
      for (var V = null, fl = null, X = v, W = v = 0, el = null; X !== null && W < y.length; W++) {
        X.index > W ? (el = X, X = null) : el = X.sibling;
        var sl = b(m, X, y[W], T);
        if (sl === null) {
          X === null && (X = el);
          break;
        }
        l && X && sl.alternate === null && t(m, X), v = n(sl, v, W), fl === null ? V = sl : fl.sibling = sl, fl = sl, X = el;
      }
      if (W === y.length) return a(m, X), il && Yt(m, W), V;
      if (X === null) {
        for (; W < y.length; W++) X = A(m, y[W], T), X !== null && (v = n(X, v, W), fl === null ? V = X : fl.sibling = X, fl = X);
        return il && Yt(m, W), V;
      }
      for (X = u(X); W < y.length; W++) el = S(X, m, W, y[W], T), el !== null && (l && el.alternate !== null && X.delete(el.key === null ? W : el.key), v = n(el, v, W), fl === null ? V = el : fl.sibling = el, fl = el);
      return l && X.forEach(function(_a) {
        return t(m, _a);
      }), il && Yt(m, W), V;
    }
    function w(m, v, y, T) {
      if (y == null) throw Error(s(151));
      for (var V = null, fl = null, X = v, W = v = 0, el = null, sl = y.next(); X !== null && !sl.done; W++, sl = y.next()) {
        X.index > W ? (el = X, X = null) : el = X.sibling;
        var _a = b(m, X, sl.value, T);
        if (_a === null) {
          X === null && (X = el);
          break;
        }
        l && X && _a.alternate === null && t(m, X), v = n(_a, v, W), fl === null ? V = _a : fl.sibling = _a, fl = _a, X = el;
      }
      if (sl.done) return a(m, X), il && Yt(m, W), V;
      if (X === null) {
        for (; !sl.done; W++, sl = y.next()) sl = A(m, sl.value, T), sl !== null && (v = n(sl, v, W), fl === null ? V = sl : fl.sibling = sl, fl = sl);
        return il && Yt(m, W), V;
      }
      for (X = u(X); !sl.done; W++, sl = y.next()) sl = S(X, m, W, sl.value, T), sl !== null && (l && sl.alternate !== null && X.delete(sl.key === null ? W : sl.key), v = n(sl, v, W), fl === null ? V = sl : fl.sibling = sl, fl = sl);
      return l && X.forEach(function(Uo) {
        return t(m, Uo);
      }), il && Yt(m, W), V;
    }
    function yl(m, v, y, T) {
      if (typeof y == "object" && y !== null && y.type === El && y.key === null && (y = y.props.children), typeof y == "object" && y !== null) {
        switch (y.$$typeof) {
          case $:
            l: {
              for (var V = y.key; v !== null; ) {
                if (v.key === V) {
                  if (V = y.type, V === El) {
                    if (v.tag === 7) {
                      a(m, v.sibling), T = e(v, y.props.children), T.return = m, m = T;
                      break l;
                    }
                  } else if (v.elementType === V || typeof V == "object" && V !== null && V.$$typeof === Hl && xa(V) === v.type) {
                    a(m, v.sibling), T = e(v, y.props), Ju(T, y), T.return = m, m = T;
                    break l;
                  }
                  a(m, v);
                  break;
                } else t(m, v);
                v = v.sibling;
              }
              y.type === El ? (T = Oa(y.props.children, m.mode, T, y.key), T.return = m, m = T) : (T = Ze(y.type, y.key, y.props, null, m.mode, T), Ju(T, y), T.return = m, m = T);
            }
            return i(m);
          case bl:
            l: {
              for (V = y.key; v !== null; ) {
                if (v.key === V) if (v.tag === 4 && v.stateNode.containerInfo === y.containerInfo && v.stateNode.implementation === y.implementation) {
                  a(m, v.sibling), T = e(v, y.children || []), T.return = m, m = T;
                  break l;
                } else {
                  a(m, v);
                  break;
                }
                else t(m, v);
                v = v.sibling;
              }
              T = zi(y, m.mode, T), T.return = m, m = T;
            }
            return i(m);
          case Hl:
            return y = xa(y), yl(m, v, y, T);
        }
        if (x(y)) return q(m, v, y, T);
        if (Ml(y)) {
          if (V = Ml(y), typeof V != "function") throw Error(s(150));
          return y = V.call(y), w(m, v, y, T);
        }
        if (typeof y.then == "function") return yl(m, v, We(y), T);
        if (y.$$typeof === F) return yl(m, v, Ke(m, y), T);
        $e(m, y);
      }
      return typeof y == "string" && y !== "" || typeof y == "number" || typeof y == "bigint" ? (y = "" + y, v !== null && v.tag === 6 ? (a(m, v.sibling), T = e(v, y), T.return = m, m = T) : (a(m, v), T = _i(y, m.mode, T), T.return = m, m = T), i(m)) : a(m, v);
    }
    return function(m, v, y, T) {
      try {
        Ku = 0;
        var V = yl(m, v, y, T);
        return fu = null, V;
      } catch (X) {
        if (X === cu || X === we) throw X;
        var fl = st(29, X, null, m.mode);
        return fl.lanes = T, fl.return = m, fl;
      }
    };
  }
  var Ca = E0(!0), T0 = E0(!1), na = !1;
  function xi(l) {
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
  function Ri(l, t) {
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
    var u = l.updateQueue;
    if (u === null) return null;
    if (u = u.shared, (dl & 2) !== 0) {
      var e = u.pending;
      return e === null ? t.next = t : (t.next = e.next, e.next = t), u.pending = t, t = Qe(l), c0(l, null, a), t;
    }
    return Xe(l, u, t, a), Qe(l);
  }
  function wu(l, t, a) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (a & 4194048) !== 0)) {
      var u = t.lanes;
      u &= l.pendingLanes, a |= u, t.lanes = a, mf(l, a);
    }
  }
  function Ci(l, t) {
    var a = l.updateQueue, u = l.alternate;
    if (u !== null && (u = u.updateQueue, a === u)) {
      var e = null, n = null;
      if (a = a.firstBaseUpdate, a !== null) {
        do {
          var i = {
            lane: a.lane,
            tag: a.tag,
            payload: a.payload,
            callback: null,
            next: null
          };
          n === null ? e = n = i : n = n.next = i, a = a.next;
        } while (a !== null);
        n === null ? e = n = t : n = n.next = t;
      } else e = n = t;
      a = {
        baseState: u.baseState,
        firstBaseUpdate: e,
        lastBaseUpdate: n,
        shared: u.shared,
        callbacks: u.callbacks
      }, l.updateQueue = a;
      return;
    }
    l = a.lastBaseUpdate, l === null ? a.firstBaseUpdate = t : l.next = t, a.lastBaseUpdate = t;
  }
  var Bi = !1;
  function ku() {
    if (Bi) {
      var l = iu;
      if (l !== null) throw l;
    }
  }
  function Wu(l, t, a, u) {
    Bi = !1;
    var e = l.updateQueue;
    na = !1;
    var n = e.firstBaseUpdate, i = e.lastBaseUpdate, c = e.shared.pending;
    if (c !== null) {
      e.shared.pending = null;
      var d = c, g = d.next;
      d.next = null, i === null ? n = g : i.next = g, i = d;
      var E = l.alternate;
      E !== null && (E = E.updateQueue, c = E.lastBaseUpdate, c !== i && (c === null ? E.firstBaseUpdate = g : c.next = g, E.lastBaseUpdate = d));
    }
    if (n !== null) {
      var A = e.baseState;
      i = 0, E = g = d = null, c = n;
      do {
        var b = c.lane & -536870913, S = b !== c.lane;
        if (S ? (ul & b) === b : (u & b) === b) {
          b !== 0 && b === nu && (Bi = !0), E !== null && (E = E.next = {
            lane: 0,
            tag: c.tag,
            payload: c.payload,
            callback: null,
            next: null
          });
          l: {
            var q = l, w = c;
            b = t;
            var yl = a;
            switch (w.tag) {
              case 1:
                if (q = w.payload, typeof q == "function") {
                  A = q.call(yl, A, b);
                  break l;
                }
                A = q;
                break l;
              case 3:
                q.flags = q.flags & -65537 | 128;
              case 0:
                if (q = w.payload, b = typeof q == "function" ? q.call(yl, A, b) : q, b == null) break l;
                A = B({}, A, b);
                break l;
              case 2:
                na = !0;
            }
          }
          b = c.callback, b !== null && (l.flags |= 64, S && (l.flags |= 8192), S = e.callbacks, S === null ? e.callbacks = [b] : S.push(b));
        } else S = {
          lane: b,
          tag: c.tag,
          payload: c.payload,
          callback: c.callback,
          next: null
        }, E === null ? (g = E = S, d = A) : E = E.next = S, i |= b;
        if (c = c.next, c === null) {
          if (c = e.shared.pending, c === null) break;
          S = c, c = S.next, S.next = null, e.lastBaseUpdate = S, e.shared.pending = null;
        }
      } while (!0);
      E === null && (d = A), e.baseState = d, e.firstBaseUpdate = g, e.lastBaseUpdate = E, n === null && (e.shared.lanes = 0), da |= i, l.lanes = i, l.memoizedState = A;
    }
  }
  function M0(l, t) {
    if (typeof l != "function") throw Error(s(191, l));
    l.call(t);
  }
  function A0(l, t) {
    var a = l.callbacks;
    if (a !== null) for (l.callbacks = null, l = 0; l < a.length; l++) M0(a[l], t);
  }
  var su = r(null), Fe = r(0);
  function N0(l, t) {
    l = kt, C(Fe, l), C(su, t), kt = l | t.baseLanes;
  }
  function Yi() {
    C(Fe, kt), C(su, su.current);
  }
  function qi() {
    kt = Fe.current, N(su), N(Fe);
  }
  var dt = r(null), zt = null;
  function ia(l) {
    var t = l.alternate;
    C(Dl, Dl.current & 1), C(dt, l), zt === null && (t === null || su.current !== null || t.memoizedState !== null) && (zt = l);
  }
  function Gi(l) {
    C(Dl, Dl.current), C(dt, l), zt === null && (zt = l);
  }
  function O0(l) {
    l.tag === 22 ? (C(Dl, Dl.current), C(dt, l), zt === null && (zt = l)) : ca(l);
  }
  function ca() {
    C(Dl, Dl.current), C(dt, dt.current);
  }
  function vt(l) {
    N(dt), zt === l && (zt = null), N(Dl);
  }
  var Dl = r(0);
  function Ie(l) {
    for (var t = l; t !== null; ) {
      if (t.tag === 13) {
        var a = t.memoizedState;
        if (a !== null && (a = a.dehydrated, a === null || Vc(a) || Kc(a))) return t;
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
  var Xt = 0, k = null, ml = null, Rl = null, Pe = !1, du = !1, qa = !1, ln = 0, $u = 0, vu = null, yr = 0;
  function Al() {
    throw Error(s(321));
  }
  function Xi(l, t) {
    if (t === null) return !1;
    for (var a = 0; a < t.length && a < l.length; a++) if (!ft(l[a], t[a])) return !1;
    return !0;
  }
  function Qi(l, t, a, u, e, n) {
    return Xt = n, k = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, D.H = l === null || l.memoizedState === null ? vs : ac, qa = !1, n = a(u, e), qa = !1, du && (n = j0(t, a, u, e)), D0(l), n;
  }
  function D0(l) {
    D.H = Pu;
    var t = ml !== null && ml.next !== null;
    if (Xt = 0, Rl = ml = k = null, Pe = !1, $u = 0, vu = null, t) throw Error(s(300));
    l === null || Cl || (l = l.dependencies, l !== null && Ve(l) && (Cl = !0));
  }
  function j0(l, t, a, u) {
    k = l;
    var e = 0;
    do {
      if (du && (vu = null), $u = 0, du = !1, 25 <= e) throw Error(s(301));
      if (e += 1, Rl = ml = null, l.updateQueue != null) {
        var n = l.updateQueue;
        n.lastEffect = null, n.events = null, n.stores = null, n.memoCache != null && (n.memoCache.index = 0);
      }
      D.H = rs, n = t(a, u);
    } while (du);
    return n;
  }
  function gr() {
    var l = D.H, t = l.useState()[0];
    return t = typeof t.then == "function" ? Fu(t) : t, l = l.useState()[0], (ml !== null ? ml.memoizedState : null) !== l && (k.flags |= 1024), t;
  }
  function Zi() {
    var l = ln !== 0;
    return ln = 0, l;
  }
  function Li(l, t, a) {
    t.updateQueue = l.updateQueue, t.flags &= -2053, l.lanes &= ~a;
  }
  function Vi(l) {
    if (Pe) {
      for (l = l.memoizedState; l !== null; ) {
        var t = l.queue;
        t !== null && (t.pending = null), l = l.next;
      }
      Pe = !1;
    }
    Xt = 0, Rl = ml = k = null, du = !1, $u = ln = 0, vu = null;
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
    if (ml === null) {
      var l = k.alternate;
      l = l !== null ? l.memoizedState : null;
    } else l = ml.next;
    var t = Rl === null ? k.memoizedState : Rl.next;
    if (t !== null) Rl = t, ml = l;
    else {
      if (l === null)
        throw k.alternate === null ? Error(s(467)) : Error(s(310));
      ml = l, l = {
        memoizedState: ml.memoizedState,
        baseState: ml.baseState,
        baseQueue: ml.baseQueue,
        queue: ml.queue,
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
  function Fu(l) {
    var t = $u;
    return $u += 1, vu === null && (vu = []), l = _0(vu, l, t), t = k, (Rl === null ? t.memoizedState : Rl.next) === null && (t = t.alternate, D.H = t === null || t.memoizedState === null ? vs : ac), l;
  }
  function an(l) {
    if (l !== null && typeof l == "object") {
      if (typeof l.then == "function") return Fu(l);
      if (l.$$typeof === F) return Ll(l);
    }
    throw Error(s(438, String(l)));
  }
  function Ki(l) {
    var t = null, a = k.updateQueue;
    if (a !== null && (t = a.memoCache), t == null) {
      var u = k.alternate;
      u !== null && (u = u.updateQueue, u !== null && (u = u.memoCache, u != null && (t = {
        data: u.data.map(function(e) {
          return e.slice();
        }),
        index: 0
      })));
    }
    if (t ??= {
      data: [],
      index: 0
    }, a === null && (a = tn(), k.updateQueue = a), a.memoCache = t, a = t.data[t.index], a === void 0) for (a = t.data[t.index] = Array(l), u = 0; u < l; u++) a[u] = Ht;
    return t.index++, a;
  }
  function Qt(l, t) {
    return typeof t == "function" ? t(l) : t;
  }
  function un(l) {
    return Ji(jl(), ml, l);
  }
  function Ji(l, t, a) {
    var u = l.queue;
    if (u === null) throw Error(s(311));
    u.lastRenderedReducer = a;
    var e = l.baseQueue, n = u.pending;
    if (n !== null) {
      if (e !== null) {
        var i = e.next;
        e.next = n.next, n.next = i;
      }
      t.baseQueue = e = n, u.pending = null;
    }
    if (n = l.baseState, e === null) l.memoizedState = n;
    else {
      t = e.next;
      var c = i = null, d = null, g = t, E = !1;
      do {
        var A = g.lane & -536870913;
        if (A !== g.lane ? (ul & A) === A : (Xt & A) === A) {
          var b = g.revertLane;
          if (b === 0) d !== null && (d = d.next = {
            lane: 0,
            revertLane: 0,
            gesture: null,
            action: g.action,
            hasEagerState: g.hasEagerState,
            eagerState: g.eagerState,
            next: null
          }), A === nu && (E = !0);
          else if ((Xt & b) === b) {
            g = g.next, b === nu && (E = !0);
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
      if (d === null ? i = n : d.next = c, !ft(n, l.memoizedState) && (Cl = !0, E && (a = iu, a !== null))) throw a;
      l.memoizedState = n, l.baseState = i, l.baseQueue = d, u.lastRenderedState = n;
    }
    return e === null && (u.lanes = 0), [l.memoizedState, u.dispatch];
  }
  function wi(l) {
    var t = jl(), a = t.queue;
    if (a === null) throw Error(s(311));
    a.lastRenderedReducer = l;
    var u = a.dispatch, e = a.pending, n = t.memoizedState;
    if (e !== null) {
      a.pending = null;
      var i = e = e.next;
      do
        n = l(n, i.action), i = i.next;
      while (i !== e);
      ft(n, t.memoizedState) || (Cl = !0), t.memoizedState = n, t.baseQueue === null && (t.baseState = n), a.lastRenderedState = n;
    }
    return [n, u];
  }
  function U0(l, t, a) {
    var u = k, e = jl(), n = il;
    if (n) {
      if (a === void 0) throw Error(s(407));
      a = a();
    } else a = t();
    var i = !ft((ml || e).memoizedState, a);
    if (i && (e.memoizedState = a, Cl = !0), e = e.queue, $i(R0.bind(null, u, e, l), [l]), e.getSnapshot !== t || i || Rl !== null && Rl.memoizedState.tag & 1) {
      if (u.flags |= 2048, ru(9, { destroy: void 0 }, x0.bind(null, u, e, a, t), null), gl === null) throw Error(s(349));
      n || (Xt & 127) !== 0 || H0(u, t, a);
    }
    return a;
  }
  function H0(l, t, a) {
    l.flags |= 16384, l = {
      getSnapshot: t,
      value: a
    }, t = k.updateQueue, t === null ? (t = tn(), k.updateQueue = t, t.stores = [l]) : (a = t.stores, a === null ? t.stores = [l] : a.push(l));
  }
  function x0(l, t, a, u) {
    t.value = a, t.getSnapshot = u, C0(t) && B0(l);
  }
  function R0(l, t, a) {
    return a(function() {
      C0(t) && B0(l);
    });
  }
  function C0(l) {
    var t = l.getSnapshot;
    l = l.value;
    try {
      var a = t();
      return !ft(l, a);
    } catch {
      return !0;
    }
  }
  function B0(l) {
    var t = Na(l, 2);
    t !== null && ut(t, l, 2);
  }
  function ki(l) {
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
  function Y0(l, t, a, u) {
    return l.baseState = a, Ji(l, ml, typeof u == "function" ? u : Qt);
  }
  function br(l, t, a, u, e) {
    if (cn(l)) throw Error(s(485));
    if (l = t.action, l !== null) {
      var n = {
        payload: e,
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
      D.T !== null ? a(!0) : n.isTransition = !1, u(n), a = t.pending, a === null ? (n.next = t.pending = n, q0(t, n)) : (n.next = a.next, t.pending = a.next = n);
    }
  }
  function q0(l, t) {
    var a = t.action, u = t.payload, e = l.state;
    if (t.isTransition) {
      var n = D.T, i = {};
      D.T = i;
      try {
        var c = a(e, u), d = D.S;
        d !== null && d(i, c), G0(l, t, c);
      } catch (g) {
        Wi(l, t, g);
      } finally {
        n !== null && i.types !== null && (n.types = i.types), D.T = n;
      }
    } else try {
      n = a(e, u), G0(l, t, n);
    } catch (g) {
      Wi(l, t, g);
    }
  }
  function G0(l, t, a) {
    a !== null && typeof a == "object" && typeof a.then == "function" ? a.then(function(u) {
      X0(l, t, u);
    }, function(u) {
      return Wi(l, t, u);
    }) : X0(l, t, a);
  }
  function X0(l, t, a) {
    t.status = "fulfilled", t.value = a, Q0(t), l.state = a, t = l.pending, t !== null && (a = t.next, a === t ? l.pending = null : (a = a.next, t.next = a, q0(l, a)));
  }
  function Wi(l, t, a) {
    var u = l.pending;
    if (l.pending = null, u !== null) {
      u = u.next;
      do
        t.status = "rejected", t.reason = a, Q0(t), t = t.next;
      while (t !== u);
    }
    l.action = null;
  }
  function Q0(l) {
    l = l.listeners;
    for (var t = 0; t < l.length; t++) (0, l[t])();
  }
  function Z0(l, t) {
    return t;
  }
  function L0(l, t) {
    if (il) {
      var a = gl.formState;
      if (a !== null) {
        l: {
          var u = k;
          if (il) {
            if (_l) {
              t: {
                for (var e = _l, n = _t; e.nodeType !== 8; ) {
                  if (!n) {
                    e = null;
                    break t;
                  }
                  if (e = Et(e.nextSibling), e === null) {
                    e = null;
                    break t;
                  }
                }
                n = e.data, e = n === "F!" || n === "F" ? e : null;
              }
              if (e) {
                _l = Et(e.nextSibling), u = e.data === "F!";
                break l;
              }
            }
            ua(u);
          }
          u = !1;
        }
        u && (t = a[0]);
      }
    }
    return a = $l(), a.memoizedState = a.baseState = t, u = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: Z0,
      lastRenderedState: t
    }, a.queue = u, a = fs.bind(null, k, u), u.dispatch = a, u = ki(!1), n = tc.bind(null, k, !1, u.queue), u = $l(), e = {
      state: t,
      dispatch: null,
      action: l,
      pending: null
    }, u.queue = e, a = br.bind(null, k, e, n, a), e.dispatch = a, u.memoizedState = l, [
      t,
      a,
      !1
    ];
  }
  function V0(l) {
    return K0(jl(), ml, l);
  }
  function K0(l, t, a) {
    if (t = Ji(l, t, Z0)[0], l = un(Qt)[0], typeof t == "object" && t !== null && typeof t.then == "function") try {
      var u = Fu(t);
    } catch (i) {
      throw i === cu ? we : i;
    }
    else u = t;
    t = jl();
    var e = t.queue, n = e.dispatch;
    return a !== t.memoizedState && (k.flags |= 2048, ru(9, { destroy: void 0 }, Sr.bind(null, e, a), null)), [
      u,
      n,
      l
    ];
  }
  function Sr(l, t) {
    l.action = t;
  }
  function J0(l) {
    var t = jl(), a = ml;
    if (a !== null) return K0(t, a, l);
    jl(), t = t.memoizedState, a = jl();
    var u = a.queue.dispatch;
    return a.memoizedState = l, [
      t,
      u,
      !1
    ];
  }
  function ru(l, t, a, u) {
    return l = {
      tag: l,
      create: a,
      deps: u,
      inst: t,
      next: null
    }, t = k.updateQueue, t === null && (t = tn(), k.updateQueue = t), a = t.lastEffect, a === null ? t.lastEffect = l.next = l : (u = a.next, a.next = l, l.next = u, t.lastEffect = l), l;
  }
  function w0() {
    return jl().memoizedState;
  }
  function en(l, t, a, u) {
    var e = $l();
    k.flags |= l, e.memoizedState = ru(1 | t, { destroy: void 0 }, a, u === void 0 ? null : u);
  }
  function nn(l, t, a, u) {
    var e = jl();
    u = u === void 0 ? null : u;
    var n = e.memoizedState.inst;
    ml !== null && u !== null && Xi(u, ml.memoizedState.deps) ? e.memoizedState = ru(t, n, a, u) : (k.flags |= l, e.memoizedState = ru(1 | t, n, a, u));
  }
  function k0(l, t) {
    en(8390656, 8, l, t);
  }
  function $i(l, t) {
    nn(2048, 8, l, t);
  }
  function _r(l) {
    k.flags |= 4;
    var t = k.updateQueue;
    if (t === null) t = tn(), k.updateQueue = t, t.events = [l];
    else {
      var a = t.events;
      a === null ? t.events = [l] : a.push(l);
    }
  }
  function W0(l) {
    var t = jl().memoizedState;
    return _r({
      ref: t,
      nextImpl: l
    }), function() {
      if ((dl & 2) !== 0) throw Error(s(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function $0(l, t) {
    return nn(4, 2, l, t);
  }
  function F0(l, t) {
    return nn(4, 4, l, t);
  }
  function I0(l, t) {
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
  function P0(l, t, a) {
    a = a != null ? a.concat([l]) : null, nn(4, 4, I0.bind(null, t, l), a);
  }
  function Fi() {
  }
  function ls(l, t) {
    var a = jl();
    t = t === void 0 ? null : t;
    var u = a.memoizedState;
    return t !== null && Xi(t, u[1]) ? u[0] : (a.memoizedState = [l, t], l);
  }
  function ts(l, t) {
    var a = jl();
    t = t === void 0 ? null : t;
    var u = a.memoizedState;
    if (t !== null && Xi(t, u[1])) return u[0];
    if (u = l(), qa) {
      It(!0);
      try {
        l();
      } finally {
        It(!1);
      }
    }
    return a.memoizedState = [u, t], u;
  }
  function Ii(l, t, a) {
    return a === void 0 || (Xt & 1073741824) !== 0 && (ul & 261930) === 0 ? l.memoizedState = t : (l.memoizedState = a, l = Ps(), k.lanes |= l, da |= l, a);
  }
  function as(l, t, a, u) {
    return ft(a, t) ? a : su.current !== null ? (l = Ii(l, a, u), ft(l, t) || (Cl = !0), l) : (Xt & 42) === 0 || (Xt & 1073741824) !== 0 && (ul & 261930) === 0 ? (Cl = !0, l.memoizedState = a) : (l = Ps(), k.lanes |= l, da |= l, t);
  }
  function us(l, t, a, u, e) {
    var n = R.p;
    R.p = n !== 0 && 8 > n ? n : 8;
    var i = D.T, c = {};
    D.T = c, tc(l, !1, t, a);
    try {
      var d = e(), g = D.S;
      g !== null && g(c, d), d !== null && typeof d == "object" && typeof d.then == "function" ? Iu(l, t, hr(d, u), pt(l)) : Iu(l, t, u, pt(l));
    } catch (E) {
      Iu(l, t, {
        then: function() {
        },
        status: "rejected",
        reason: E
      }, pt());
    } finally {
      R.p = n, i !== null && c.types !== null && (i.types = c.types), D.T = i;
    }
  }
  function zr() {
  }
  function Pi(l, t, a, u) {
    if (l.tag !== 5) throw Error(s(476));
    var e = es(l).queue;
    us(l, e, t, cl, a === null ? zr : function() {
      return ns(l), a(u);
    });
  }
  function es(l) {
    var t = l.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: cl,
      baseState: cl,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Qt,
        lastRenderedState: cl
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
  function ns(l) {
    var t = es(l);
    t.next === null && (t = l.alternate.memoizedState), Iu(l, t.next.queue, {}, pt());
  }
  function lc() {
    return Ll(he);
  }
  function is() {
    return jl().memoizedState;
  }
  function cs() {
    return jl().memoizedState;
  }
  function pr(l) {
    for (var t = l.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var a = pt();
          l = Ba(a);
          var u = Ya(t, l, a);
          u !== null && (ut(u, t, a), wu(u, t, a)), t = { cache: Di() }, l.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function Er(l, t, a) {
    var u = pt();
    a = {
      lane: u,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, cn(l) ? ss(t, a) : (a = bi(l, t, a, u), a !== null && (ut(a, l, u), ds(a, t, u)));
  }
  function fs(l, t, a) {
    Iu(l, t, a, pt());
  }
  function Iu(l, t, a, u) {
    var e = {
      lane: u,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    };
    if (cn(l)) ss(t, e);
    else {
      var n = l.alternate;
      if (l.lanes === 0 && (n === null || n.lanes === 0) && (n = t.lastRenderedReducer, n !== null)) try {
        var i = t.lastRenderedState, c = n(i, a);
        if (e.hasEagerState = !0, e.eagerState = c, ft(c, i)) return Xe(l, t, e, 0), gl === null && Ge(), !1;
      } catch {
      }
      if (a = bi(l, t, e, u), a !== null) return ut(a, l, u), ds(a, t, u), !0;
    }
    return !1;
  }
  function tc(l, t, a, u) {
    if (u = {
      lane: 2,
      revertLane: xc(),
      gesture: null,
      action: u,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, cn(l)) {
      if (t) throw Error(s(479));
    } else t = bi(l, a, u, 2), t !== null && ut(t, l, 2);
  }
  function cn(l) {
    var t = l.alternate;
    return l === k || t !== null && t === k;
  }
  function ss(l, t) {
    du = Pe = !0;
    var a = l.pending;
    a === null ? t.next = t : (t.next = a.next, a.next = t), l.pending = t;
  }
  function ds(l, t, a) {
    if ((a & 4194048) !== 0) {
      var u = t.lanes;
      u &= l.pendingLanes, a |= u, t.lanes = a, mf(l, a);
    }
  }
  var Pu = {
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
  Pu.useEffectEvent = Al;
  var vs = {
    readContext: Ll,
    use: an,
    useCallback: function(l, t) {
      return $l().memoizedState = [l, t === void 0 ? null : t], l;
    },
    useContext: Ll,
    useEffect: k0,
    useImperativeHandle: function(l, t, a) {
      a = a != null ? a.concat([l]) : null, en(4194308, 4, I0.bind(null, t, l), a);
    },
    useLayoutEffect: function(l, t) {
      return en(4194308, 4, l, t);
    },
    useInsertionEffect: function(l, t) {
      en(4, 2, l, t);
    },
    useMemo: function(l, t) {
      var a = $l();
      t = t === void 0 ? null : t;
      var u = l();
      if (qa) {
        It(!0);
        try {
          l();
        } finally {
          It(!1);
        }
      }
      return a.memoizedState = [u, t], u;
    },
    useReducer: function(l, t, a) {
      var u = $l();
      if (a !== void 0) {
        var e = a(t);
        if (qa) {
          It(!0);
          try {
            a(t);
          } finally {
            It(!1);
          }
        }
      } else e = t;
      return u.memoizedState = u.baseState = e, l = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: l,
        lastRenderedState: e
      }, u.queue = l, l = l.dispatch = Er.bind(null, k, l), [u.memoizedState, l];
    },
    useRef: function(l) {
      var t = $l();
      return l = { current: l }, t.memoizedState = l;
    },
    useState: function(l) {
      l = ki(l);
      var t = l.queue, a = fs.bind(null, k, t);
      return t.dispatch = a, [l.memoizedState, a];
    },
    useDebugValue: Fi,
    useDeferredValue: function(l, t) {
      return Ii($l(), l, t);
    },
    useTransition: function() {
      var l = ki(!1);
      return l = us.bind(null, k, l.queue, !0, !1), $l().memoizedState = l, [!1, l];
    },
    useSyncExternalStore: function(l, t, a) {
      var u = k, e = $l();
      if (il) {
        if (a === void 0) throw Error(s(407));
        a = a();
      } else {
        if (a = t(), gl === null) throw Error(s(349));
        (ul & 127) !== 0 || H0(u, t, a);
      }
      e.memoizedState = a;
      var n = {
        value: a,
        getSnapshot: t
      };
      return e.queue = n, k0(R0.bind(null, u, n, l), [l]), u.flags |= 2048, ru(9, { destroy: void 0 }, x0.bind(null, u, n, a, t), null), a;
    },
    useId: function() {
      var l = $l(), t = gl.identifierPrefix;
      if (il) {
        var a = Dt, u = Ot;
        a = (u & ~(1 << 32 - ct(u) - 1)).toString(32) + a, t = "_" + t + "R_" + a, a = ln++, 0 < a && (t += "H" + a.toString(32)), t += "_";
      } else a = yr++, t = "_" + t + "r_" + a.toString(32) + "_";
      return l.memoizedState = t;
    },
    useHostTransitionStatus: lc,
    useFormState: L0,
    useActionState: L0,
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
      return t.queue = a, t = tc.bind(null, k, !0, a), a.dispatch = t, [l, t];
    },
    useMemoCache: Ki,
    useCacheRefresh: function() {
      return $l().memoizedState = pr.bind(null, k);
    },
    useEffectEvent: function(l) {
      var t = $l(), a = { impl: l };
      return t.memoizedState = a, function() {
        if ((dl & 2) !== 0) throw Error(s(440));
        return a.impl.apply(void 0, arguments);
      };
    }
  }, ac = {
    readContext: Ll,
    use: an,
    useCallback: ls,
    useContext: Ll,
    useEffect: $i,
    useImperativeHandle: P0,
    useInsertionEffect: $0,
    useLayoutEffect: F0,
    useMemo: ts,
    useReducer: un,
    useRef: w0,
    useState: function() {
      return un(Qt);
    },
    useDebugValue: Fi,
    useDeferredValue: function(l, t) {
      return as(jl(), ml.memoizedState, l, t);
    },
    useTransition: function() {
      var l = un(Qt)[0], t = jl().memoizedState;
      return [typeof l == "boolean" ? l : Fu(l), t];
    },
    useSyncExternalStore: U0,
    useId: is,
    useHostTransitionStatus: lc,
    useFormState: V0,
    useActionState: V0,
    useOptimistic: function(l, t) {
      return Y0(jl(), ml, l, t);
    },
    useMemoCache: Ki,
    useCacheRefresh: cs
  };
  ac.useEffectEvent = W0;
  var rs = {
    readContext: Ll,
    use: an,
    useCallback: ls,
    useContext: Ll,
    useEffect: $i,
    useImperativeHandle: P0,
    useInsertionEffect: $0,
    useLayoutEffect: F0,
    useMemo: ts,
    useReducer: wi,
    useRef: w0,
    useState: function() {
      return wi(Qt);
    },
    useDebugValue: Fi,
    useDeferredValue: function(l, t) {
      var a = jl();
      return ml === null ? Ii(a, l, t) : as(a, ml.memoizedState, l, t);
    },
    useTransition: function() {
      var l = wi(Qt)[0], t = jl().memoizedState;
      return [typeof l == "boolean" ? l : Fu(l), t];
    },
    useSyncExternalStore: U0,
    useId: is,
    useHostTransitionStatus: lc,
    useFormState: J0,
    useActionState: J0,
    useOptimistic: function(l, t) {
      var a = jl();
      return ml !== null ? Y0(a, ml, l, t) : (a.baseState = l, [l, a.queue.dispatch]);
    },
    useMemoCache: Ki,
    useCacheRefresh: cs
  };
  rs.useEffectEvent = W0;
  function uc(l, t, a, u) {
    t = l.memoizedState, a = a(u, t), a = a == null ? t : B({}, t, a), l.memoizedState = a, l.lanes === 0 && (l.updateQueue.baseState = a);
  }
  var ec = {
    enqueueSetState: function(l, t, a) {
      l = l._reactInternals;
      var u = pt(), e = Ba(u);
      e.payload = t, a != null && (e.callback = a), t = Ya(l, e, u), t !== null && (ut(t, l, u), wu(t, l, u));
    },
    enqueueReplaceState: function(l, t, a) {
      l = l._reactInternals;
      var u = pt(), e = Ba(u);
      e.tag = 1, e.payload = t, a != null && (e.callback = a), t = Ya(l, e, u), t !== null && (ut(t, l, u), wu(t, l, u));
    },
    enqueueForceUpdate: function(l, t) {
      l = l._reactInternals;
      var a = pt(), u = Ba(a);
      u.tag = 2, t != null && (u.callback = t), t = Ya(l, u, a), t !== null && (ut(t, l, a), wu(t, l, a));
    }
  };
  function os(l, t, a, u, e, n, i) {
    return l = l.stateNode, typeof l.shouldComponentUpdate == "function" ? l.shouldComponentUpdate(u, n, i) : t.prototype && t.prototype.isPureReactComponent ? !Gu(a, u) || !Gu(e, n) : !0;
  }
  function ms(l, t, a, u) {
    l = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(a, u), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(a, u), t.state !== l && ec.enqueueReplaceState(t, t.state, null);
  }
  function Ga(l, t) {
    var a = t;
    if ("ref" in t) {
      a = {};
      for (var u in t) u !== "ref" && (a[u] = t[u]);
    }
    if (l = l.defaultProps) {
      a === t && (a = B({}, a));
      for (var e in l) a[e] === void 0 && (a[e] = l[e]);
    }
    return a;
  }
  function Tr(l) {
    qe(l);
  }
  function Mr(l) {
    console.error(l);
  }
  function Ar(l) {
    qe(l);
  }
  function fn(l, t) {
    try {
      var a = l.onUncaughtError;
      a(t.value, { componentStack: t.stack });
    } catch (u) {
      setTimeout(function() {
        throw u;
      });
    }
  }
  function hs(l, t, a) {
    try {
      var u = l.onCaughtError;
      u(a.value, {
        componentStack: a.stack,
        errorBoundary: t.tag === 1 ? t.stateNode : null
      });
    } catch (e) {
      setTimeout(function() {
        throw e;
      });
    }
  }
  function nc(l, t, a) {
    return a = Ba(a), a.tag = 3, a.payload = { element: null }, a.callback = function() {
      fn(l, t);
    }, a;
  }
  function ys(l) {
    return l = Ba(l), l.tag = 3, l;
  }
  function gs(l, t, a, u) {
    var e = a.type.getDerivedStateFromError;
    if (typeof e == "function") {
      var n = u.value;
      l.payload = function() {
        return e(n);
      }, l.callback = function() {
        hs(t, a, u);
      };
    }
    var i = a.stateNode;
    i !== null && typeof i.componentDidCatch == "function" && (l.callback = function() {
      hs(t, a, u), typeof e != "function" && (va === null ? va = /* @__PURE__ */ new Set([this]) : va.add(this));
      var c = u.stack;
      this.componentDidCatch(u.value, { componentStack: c !== null ? c : "" });
    });
  }
  function Nr(l, t, a, u, e) {
    if (a.flags |= 32768, u !== null && typeof u == "object" && typeof u.then == "function") {
      if (t = a.alternate, t !== null && eu(t, a, e, !0), a = dt.current, a !== null) {
        switch (a.tag) {
          case 31:
          case 13:
            return zt === null ? _n() : a.alternate === null && Nl === 0 && (Nl = 3), a.flags &= -257, a.flags |= 65536, a.lanes = e, u === ke ? a.flags |= 16384 : (t = a.updateQueue, t === null ? a.updateQueue = /* @__PURE__ */ new Set([u]) : t.add(u), jc(l, u, e)), !1;
          case 22:
            return a.flags |= 65536, u === ke ? a.flags |= 16384 : (t = a.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([u])
            }, a.updateQueue = t) : (a = t.retryQueue, a === null ? t.retryQueue = /* @__PURE__ */ new Set([u]) : a.add(u)), jc(l, u, e)), !1;
        }
        throw Error(s(435, a.tag));
      }
      return jc(l, u, e), _n(), !1;
    }
    if (il) return t = dt.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = e, u !== Ti && (l = Error(s(422), { cause: u }), Zu(gt(l, a)))) : (u !== Ti && (t = Error(s(423), { cause: u }), Zu(gt(t, a))), l = l.current.alternate, l.flags |= 65536, e &= -e, l.lanes |= e, u = gt(u, a), e = nc(l.stateNode, u, e), Ci(l, e), Nl !== 4 && (Nl = 2)), !1;
    var n = Error(s(520), { cause: u });
    if (n = gt(n, a), ce === null ? ce = [n] : ce.push(n), Nl !== 4 && (Nl = 2), t === null) return !0;
    u = gt(u, a), a = t;
    do {
      switch (a.tag) {
        case 3:
          return a.flags |= 65536, l = e & -e, a.lanes |= l, l = nc(a.stateNode, u, l), Ci(a, l), !1;
        case 1:
          if (t = a.type, n = a.stateNode, (a.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || n !== null && typeof n.componentDidCatch == "function" && (va === null || !va.has(n)))) return a.flags |= 65536, e &= -e, a.lanes |= e, e = ys(e), gs(e, l, a, u), Ci(a, e), !1;
      }
      a = a.return;
    } while (a !== null);
    return !1;
  }
  var ic = Error(s(461)), Cl = !1;
  function Vl(l, t, a, u) {
    t.child = l === null ? T0(t, null, a, u) : Ca(t, l.child, a, u);
  }
  function bs(l, t, a, u, e) {
    a = a.render;
    var n = t.ref;
    if ("ref" in u) {
      var i = {};
      for (var c in u) c !== "ref" && (i[c] = u[c]);
    } else i = u;
    return Ua(t), u = Qi(l, t, a, i, n, e), c = Zi(), l !== null && !Cl ? (Li(l, t, e), Zt(l, t, e)) : (il && c && pi(t), t.flags |= 1, Vl(l, t, u, e), t.child);
  }
  function Ss(l, t, a, u, e) {
    if (l === null) {
      var n = a.type;
      return typeof n == "function" && !Si(n) && n.defaultProps === void 0 && a.compare === null ? (t.tag = 15, t.type = n, _s(l, t, n, u, e)) : (l = Ze(a.type, null, u, t, t.mode, e), l.ref = t.ref, l.return = t, t.child = l);
    }
    if (n = l.child, !mc(l, e)) {
      var i = n.memoizedProps;
      if (a = a.compare, a = a !== null ? a : Gu, a(i, u) && l.ref === t.ref) return Zt(l, t, e);
    }
    return t.flags |= 1, l = Bt(n, u), l.ref = t.ref, l.return = t, t.child = l;
  }
  function _s(l, t, a, u, e) {
    if (l !== null) {
      var n = l.memoizedProps;
      if (Gu(n, u) && l.ref === t.ref) if (Cl = !1, t.pendingProps = u = n, mc(l, e)) (l.flags & 131072) !== 0 && (Cl = !0);
      else return t.lanes = l.lanes, Zt(l, t, e);
    }
    return cc(l, t, a, u, e);
  }
  function zs(l, t, a, u) {
    var e = u.children, n = l !== null ? l.memoizedState : null;
    if (l === null && t.stateNode === null && (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), u.mode === "hidden") {
      if ((t.flags & 128) !== 0) {
        if (n = n !== null ? n.baseLanes | a : a, l !== null) {
          for (u = t.child = l.child, e = 0; u !== null; ) e = e | u.lanes | u.childLanes, u = u.sibling;
          u = e & ~n;
        } else u = 0, t.child = null;
        return ps(l, t, n, a, u);
      }
      if ((a & 536870912) !== 0) t.memoizedState = {
        baseLanes: 0,
        cachePool: null
      }, l !== null && Je(t, n !== null ? n.cachePool : null), n !== null ? N0(t, n) : Yi(), O0(t);
      else return u = t.lanes = 536870912, ps(l, t, n !== null ? n.baseLanes | a : a, a, u);
    } else n !== null ? (Je(t, n.cachePool), N0(t, n), ca(t), t.memoizedState = null) : (l !== null && Je(t, null), Yi(), ca(t));
    return Vl(l, t, e, a), t.child;
  }
  function le(l, t) {
    return l !== null && l.tag === 22 || t.stateNode !== null || (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), t.sibling;
  }
  function ps(l, t, a, u, e) {
    var n = Ui();
    return n = n === null ? null : {
      parent: xl._currentValue,
      pool: n
    }, t.memoizedState = {
      baseLanes: a,
      cachePool: n
    }, l !== null && Je(t, null), Yi(), O0(t), l !== null && eu(l, t, u, !0), t.childLanes = e, null;
  }
  function sn(l, t) {
    return t = vn({
      mode: t.mode,
      children: t.children
    }, l.mode), t.ref = l.ref, l.child = t, t.return = l, t;
  }
  function Es(l, t, a) {
    return Ca(t, l.child, null, a), l = sn(t, t.pendingProps), l.flags |= 2, vt(t), t.memoizedState = null, l;
  }
  function Or(l, t, a) {
    var u = t.pendingProps, e = (t.flags & 128) !== 0;
    if (t.flags &= -129, l === null) {
      if (il) {
        if (u.mode === "hidden") return l = sn(t, u), t.lanes = 536870912, le(null, l);
        if (Gi(t), (l = _l) ? (l = Bd(l, _t), l = l !== null && l.data === "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: ta !== null ? {
            id: Ot,
            overflow: Dt
          } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = s0(l), a.return = t, t.child = a, Zl = t, _l = null)) : l = null, l === null) throw ua(t);
        return t.lanes = 536870912, null;
      }
      return sn(t, u);
    }
    var n = l.memoizedState;
    if (n !== null) {
      var i = n.dehydrated;
      if (Gi(t), e) if (t.flags & 256) t.flags &= -257, t = Es(l, t, a);
      else if (t.memoizedState !== null) t.child = l.child, t.flags |= 128, t = null;
      else throw Error(s(558));
      else if (Cl || eu(l, t, a, !1), e = (a & l.childLanes) !== 0, Cl || e) {
        if (u = gl, u !== null && (i = hf(u, a), i !== 0 && i !== n.retryLane)) throw n.retryLane = i, Na(l, i), ut(u, l, i), ic;
        _n(), t = Es(l, t, a);
      } else l = n.treeContext, _l = Et(i.nextSibling), Zl = t, il = !0, aa = null, _t = !1, l !== null && r0(t, l), t = sn(t, u), t.flags |= 4096;
      return t;
    }
    return l = Bt(l.child, {
      mode: u.mode,
      children: u.children
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
  function cc(l, t, a, u, e) {
    return Ua(t), a = Qi(l, t, a, u, void 0, e), u = Zi(), l !== null && !Cl ? (Li(l, t, e), Zt(l, t, e)) : (il && u && pi(t), t.flags |= 1, Vl(l, t, a, e), t.child);
  }
  function Ts(l, t, a, u, e, n) {
    return Ua(t), t.updateQueue = null, a = j0(t, u, a, e), D0(l), u = Zi(), l !== null && !Cl ? (Li(l, t, n), Zt(l, t, n)) : (il && u && pi(t), t.flags |= 1, Vl(l, t, a, n), t.child);
  }
  function Ms(l, t, a, u, e) {
    if (Ua(t), t.stateNode === null) {
      var n = lu, i = a.contextType;
      typeof i == "object" && i !== null && (n = Ll(i)), n = new a(u, n), t.memoizedState = n.state !== null && n.state !== void 0 ? n.state : null, n.updater = ec, t.stateNode = n, n._reactInternals = t, n = t.stateNode, n.props = u, n.state = t.memoizedState, n.refs = {}, xi(t), i = a.contextType, n.context = typeof i == "object" && i !== null ? Ll(i) : lu, n.state = t.memoizedState, i = a.getDerivedStateFromProps, typeof i == "function" && (uc(t, a, i, u), n.state = t.memoizedState), typeof a.getDerivedStateFromProps == "function" || typeof n.getSnapshotBeforeUpdate == "function" || typeof n.UNSAFE_componentWillMount != "function" && typeof n.componentWillMount != "function" || (i = n.state, typeof n.componentWillMount == "function" && n.componentWillMount(), typeof n.UNSAFE_componentWillMount == "function" && n.UNSAFE_componentWillMount(), i !== n.state && ec.enqueueReplaceState(n, n.state, null), Wu(t, u, n, e), ku(), n.state = t.memoizedState), typeof n.componentDidMount == "function" && (t.flags |= 4194308), u = !0;
    } else if (l === null) {
      n = t.stateNode;
      var c = t.memoizedProps, d = Ga(a, c);
      n.props = d;
      var g = n.context, E = a.contextType;
      i = lu, typeof E == "object" && E !== null && (i = Ll(E));
      var A = a.getDerivedStateFromProps;
      E = typeof A == "function" || typeof n.getSnapshotBeforeUpdate == "function", c = t.pendingProps !== c, E || typeof n.UNSAFE_componentWillReceiveProps != "function" && typeof n.componentWillReceiveProps != "function" || (c || g !== i) && ms(t, n, u, i), na = !1;
      var b = t.memoizedState;
      n.state = b, Wu(t, u, n, e), ku(), g = t.memoizedState, c || b !== g || na ? (typeof A == "function" && (uc(t, a, A, u), g = t.memoizedState), (d = na || os(t, a, d, u, b, g, i)) ? (E || typeof n.UNSAFE_componentWillMount != "function" && typeof n.componentWillMount != "function" || (typeof n.componentWillMount == "function" && n.componentWillMount(), typeof n.UNSAFE_componentWillMount == "function" && n.UNSAFE_componentWillMount()), typeof n.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof n.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = u, t.memoizedState = g), n.props = u, n.state = g, n.context = i, u = d) : (typeof n.componentDidMount == "function" && (t.flags |= 4194308), u = !1);
    } else {
      n = t.stateNode, Ri(l, t), i = t.memoizedProps, E = Ga(a, i), n.props = E, A = t.pendingProps, b = n.context, g = a.contextType, d = lu, typeof g == "object" && g !== null && (d = Ll(g)), c = a.getDerivedStateFromProps, (g = typeof c == "function" || typeof n.getSnapshotBeforeUpdate == "function") || typeof n.UNSAFE_componentWillReceiveProps != "function" && typeof n.componentWillReceiveProps != "function" || (i !== A || b !== d) && ms(t, n, u, d), na = !1, b = t.memoizedState, n.state = b, Wu(t, u, n, e), ku();
      var S = t.memoizedState;
      i !== A || b !== S || na || l !== null && l.dependencies !== null && Ve(l.dependencies) ? (typeof c == "function" && (uc(t, a, c, u), S = t.memoizedState), (E = na || os(t, a, E, u, b, S, d) || l !== null && l.dependencies !== null && Ve(l.dependencies)) ? (g || typeof n.UNSAFE_componentWillUpdate != "function" && typeof n.componentWillUpdate != "function" || (typeof n.componentWillUpdate == "function" && n.componentWillUpdate(u, S, d), typeof n.UNSAFE_componentWillUpdate == "function" && n.UNSAFE_componentWillUpdate(u, S, d)), typeof n.componentDidUpdate == "function" && (t.flags |= 4), typeof n.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof n.componentDidUpdate != "function" || i === l.memoizedProps && b === l.memoizedState || (t.flags |= 4), typeof n.getSnapshotBeforeUpdate != "function" || i === l.memoizedProps && b === l.memoizedState || (t.flags |= 1024), t.memoizedProps = u, t.memoizedState = S), n.props = u, n.state = S, n.context = d, u = E) : (typeof n.componentDidUpdate != "function" || i === l.memoizedProps && b === l.memoizedState || (t.flags |= 4), typeof n.getSnapshotBeforeUpdate != "function" || i === l.memoizedProps && b === l.memoizedState || (t.flags |= 1024), u = !1);
    }
    return n = u, dn(l, t), u = (t.flags & 128) !== 0, n || u ? (n = t.stateNode, a = u && typeof a.getDerivedStateFromError != "function" ? null : n.render(), t.flags |= 1, l !== null && u ? (t.child = Ca(t, l.child, null, e), t.child = Ca(t, null, a, e)) : Vl(l, t, a, e), t.memoizedState = n.state, l = t.child) : l = Zt(l, t, e), l;
  }
  function As(l, t, a, u) {
    return Da(), t.flags |= 256, Vl(l, t, a, u), t.child;
  }
  var fc = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  function sc(l) {
    return {
      baseLanes: l,
      cachePool: b0()
    };
  }
  function dc(l, t, a) {
    return l = l !== null ? l.childLanes & ~a : 0, t && (l |= ot), l;
  }
  function Ns(l, t, a) {
    var u = t.pendingProps, e = !1, n = (t.flags & 128) !== 0, i;
    if ((i = n) || (i = l !== null && l.memoizedState === null ? !1 : (Dl.current & 2) !== 0), i && (e = !0, t.flags &= -129), i = (t.flags & 32) !== 0, t.flags &= -33, l === null) {
      if (il) {
        if (e ? ia(t) : ca(t), (l = _l) ? (l = Bd(l, _t), l = l !== null && l.data !== "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: ta !== null ? {
            id: Ot,
            overflow: Dt
          } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = s0(l), a.return = t, t.child = a, Zl = t, _l = null)) : l = null, l === null) throw ua(t);
        return Kc(l) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var c = u.children;
      return u = u.fallback, e ? (ca(t), e = t.mode, c = vn({
        mode: "hidden",
        children: c
      }, e), u = Oa(u, e, a, null), c.return = t, u.return = t, c.sibling = u, t.child = c, u = t.child, u.memoizedState = sc(a), u.childLanes = dc(l, i, a), t.memoizedState = fc, le(null, u)) : (ia(t), vc(t, c));
    }
    var d = l.memoizedState;
    if (d !== null && (c = d.dehydrated, c !== null)) {
      if (n) t.flags & 256 ? (ia(t), t.flags &= -257, t = rc(l, t, a)) : t.memoizedState !== null ? (ca(t), t.child = l.child, t.flags |= 128, t = null) : (ca(t), c = u.fallback, e = t.mode, u = vn({
        mode: "visible",
        children: u.children
      }, e), c = Oa(c, e, a, null), c.flags |= 2, u.return = t, c.return = t, u.sibling = c, t.child = u, Ca(t, l.child, null, a), u = t.child, u.memoizedState = sc(a), u.childLanes = dc(l, i, a), t.memoizedState = fc, t = le(null, u));
      else if (ia(t), Kc(c)) {
        if (i = c.nextSibling && c.nextSibling.dataset, i) var g = i.dgst;
        i = g, u = Error(s(419)), u.stack = "", u.digest = i, Zu({
          value: u,
          source: null,
          stack: null
        }), t = rc(l, t, a);
      } else if (Cl || eu(l, t, a, !1), i = (a & l.childLanes) !== 0, Cl || i) {
        if (i = gl, i !== null && (u = hf(i, a), u !== 0 && u !== d.retryLane)) throw d.retryLane = u, Na(l, u), ut(i, l, u), ic;
        Vc(c) || _n(), t = rc(l, t, a);
      } else Vc(c) ? (t.flags |= 192, t.child = l.child, t = null) : (l = d.treeContext, _l = Et(c.nextSibling), Zl = t, il = !0, aa = null, _t = !1, l !== null && r0(t, l), t = vc(t, u.children), t.flags |= 4096);
      return t;
    }
    return e ? (ca(t), c = u.fallback, e = t.mode, d = l.child, g = d.sibling, u = Bt(d, {
      mode: "hidden",
      children: u.children
    }), u.subtreeFlags = d.subtreeFlags & 65011712, g !== null ? c = Bt(g, c) : (c = Oa(c, e, a, null), c.flags |= 2), c.return = t, u.return = t, u.sibling = c, t.child = u, le(null, u), u = t.child, c = l.child.memoizedState, c === null ? c = sc(a) : (e = c.cachePool, e !== null ? (d = xl._currentValue, e = e.parent !== d ? {
      parent: d,
      pool: d
    } : e) : e = b0(), c = {
      baseLanes: c.baseLanes | a,
      cachePool: e
    }), u.memoizedState = c, u.childLanes = dc(l, i, a), t.memoizedState = fc, le(l.child, u)) : (ia(t), a = l.child, l = a.sibling, a = Bt(a, {
      mode: "visible",
      children: u.children
    }), a.return = t, a.sibling = null, l !== null && (i = t.deletions, i === null ? (t.deletions = [l], t.flags |= 16) : i.push(l)), t.child = a, t.memoizedState = null, a);
  }
  function vc(l, t) {
    return t = vn({
      mode: "visible",
      children: t
    }, l.mode), t.return = l, l.child = t;
  }
  function vn(l, t) {
    return l = st(22, l, null, t), l.lanes = 0, l;
  }
  function rc(l, t, a) {
    return Ca(t, l.child, null, a), l = vc(t, t.pendingProps.children), l.flags |= 2, t.memoizedState = null, l;
  }
  function Os(l, t, a) {
    l.lanes |= t;
    var u = l.alternate;
    u !== null && (u.lanes |= t), Ni(l.return, t, a);
  }
  function oc(l, t, a, u, e, n) {
    var i = l.memoizedState;
    i === null ? l.memoizedState = {
      isBackwards: t,
      rendering: null,
      renderingStartTime: 0,
      last: u,
      tail: a,
      tailMode: e,
      treeForkCount: n
    } : (i.isBackwards = t, i.rendering = null, i.renderingStartTime = 0, i.last = u, i.tail = a, i.tailMode = e, i.treeForkCount = n);
  }
  function Ds(l, t, a) {
    var u = t.pendingProps, e = u.revealOrder, n = u.tail;
    u = u.children;
    var i = Dl.current, c = (i & 2) !== 0;
    if (c ? (i = i & 1 | 2, t.flags |= 128) : i &= 1, C(Dl, i), Vl(l, t, u, a), u = il ? Qu : 0, !c && l !== null && (l.flags & 128) !== 0) l: for (l = t.child; l !== null; ) {
      if (l.tag === 13) l.memoizedState !== null && Os(l, a, t);
      else if (l.tag === 19) Os(l, a, t);
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
    switch (e) {
      case "forwards":
        for (a = t.child, e = null; a !== null; ) l = a.alternate, l !== null && Ie(l) === null && (e = a), a = a.sibling;
        a = e, a === null ? (e = t.child, t.child = null) : (e = a.sibling, a.sibling = null), oc(t, !1, e, a, n, u);
        break;
      case "backwards":
      case "unstable_legacy-backwards":
        for (a = null, e = t.child, t.child = null; e !== null; ) {
          if (l = e.alternate, l !== null && Ie(l) === null) {
            t.child = e;
            break;
          }
          l = e.sibling, e.sibling = a, a = e, e = l;
        }
        oc(t, !0, a, null, n, u);
        break;
      case "together":
        oc(t, !1, null, null, void 0, u);
        break;
      default:
        t.memoizedState = null;
    }
    return t.child;
  }
  function Zt(l, t, a) {
    if (l !== null && (t.dependencies = l.dependencies), da |= t.lanes, (a & t.childLanes) === 0) if (l !== null) {
      if (eu(l, t, a, !1), (a & t.childLanes) === 0) return null;
    } else return null;
    if (l !== null && t.child !== l.child) throw Error(s(153));
    if (t.child !== null) {
      for (l = t.child, a = Bt(l, l.pendingProps), t.child = a, a.return = t; l.sibling !== null; ) l = l.sibling, a = a.sibling = Bt(l, l.pendingProps), a.return = t;
      a.sibling = null;
    }
    return t.child;
  }
  function mc(l, t) {
    return (l.lanes & t) !== 0 ? !0 : (l = l.dependencies, !!(l !== null && Ve(l)));
  }
  function Dr(l, t, a) {
    switch (t.tag) {
      case 3:
        Wl(t, t.stateNode.containerInfo), ea(t, xl, l.memoizedState.cache), Da();
        break;
      case 27:
      case 5:
        Au(t);
        break;
      case 4:
        Wl(t, t.stateNode.containerInfo);
        break;
      case 10:
        ea(t, t.type, t.memoizedProps.value);
        break;
      case 31:
        if (t.memoizedState !== null) return t.flags |= 128, Gi(t), null;
        break;
      case 13:
        var u = t.memoizedState;
        if (u !== null)
          return u.dehydrated !== null ? (ia(t), t.flags |= 128, null) : (a & t.child.childLanes) !== 0 ? Ns(l, t, a) : (ia(t), l = Zt(l, t, a), l !== null ? l.sibling : null);
        ia(t);
        break;
      case 19:
        var e = (l.flags & 128) !== 0;
        if (u = (a & t.childLanes) !== 0, u || (eu(l, t, a, !1), u = (a & t.childLanes) !== 0), e) {
          if (u) return Ds(l, t, a);
          t.flags |= 128;
        }
        if (e = t.memoizedState, e !== null && (e.rendering = null, e.tail = null, e.lastEffect = null), C(Dl, Dl.current), u) break;
        return null;
      case 22:
        return t.lanes = 0, zs(l, t, a, t.pendingProps);
      case 24:
        ea(t, xl, l.memoizedState.cache);
    }
    return Zt(l, t, a);
  }
  function js(l, t, a) {
    if (l !== null) if (l.memoizedProps !== t.pendingProps) Cl = !0;
    else {
      if (!mc(l, a) && (t.flags & 128) === 0) return Cl = !1, Dr(l, t, a);
      Cl = (l.flags & 131072) !== 0;
    }
    else Cl = !1, il && (t.flags & 1048576) !== 0 && v0(t, Qu, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        l: {
          var u = t.pendingProps;
          if (l = xa(t.elementType), t.type = l, typeof l == "function") Si(l) ? (u = Ga(l, u), t.tag = 1, t = Ms(null, t, l, u, a)) : (t.tag = 0, t = cc(null, t, l, u, a));
          else {
            if (l != null) {
              var e = l.$$typeof;
              if (e === J) {
                t.tag = 11, t = bs(null, t, l, u, a);
                break l;
              } else if (e === K) {
                t.tag = 14, t = Ss(null, t, l, u, a);
                break l;
              }
            }
            throw t = Tl(l) || l, Error(s(306, t, ""));
          }
        }
        return t;
      case 0:
        return cc(l, t, t.type, t.pendingProps, a);
      case 1:
        return u = t.type, e = Ga(u, t.pendingProps), Ms(l, t, u, e, a);
      case 3:
        l: {
          if (Wl(t, t.stateNode.containerInfo), l === null) throw Error(s(387));
          u = t.pendingProps;
          var n = t.memoizedState;
          e = n.element, Ri(l, t), Wu(t, u, null, a);
          var i = t.memoizedState;
          if (u = i.cache, ea(t, xl, u), u !== n.cache && Oi(t, [xl], a, !0), ku(), u = i.element, n.isDehydrated) if (n = {
            element: u,
            isDehydrated: !1,
            cache: i.cache
          }, t.updateQueue.baseState = n, t.memoizedState = n, t.flags & 256) {
            t = As(l, t, u, a);
            break l;
          } else if (u !== e) {
            e = gt(Error(s(424)), t), Zu(e), t = As(l, t, u, a);
            break l;
          } else {
            switch (l = t.stateNode.containerInfo, l.nodeType) {
              case 9:
                l = l.body;
                break;
              default:
                l = l.nodeName === "HTML" ? l.ownerDocument.body : l;
            }
            for (_l = Et(l.firstChild), Zl = t, il = !0, aa = null, _t = !0, a = T0(t, null, u, a), t.child = a; a; ) a.flags = a.flags & -3 | 4096, a = a.sibling;
          }
          else {
            if (Da(), u === e) {
              t = Zt(l, t, a);
              break l;
            }
            Vl(l, t, u, a);
          }
          t = t.child;
        }
        return t;
      case 26:
        return dn(l, t), l === null ? (a = Zd(t.type, null, t.pendingProps, null)) ? t.memoizedState = a : il || (a = t.type, l = t.pendingProps, u = Nn(P.current).createElement(a), u[Ql] = t, u[Fl] = l, Kl(u, a, l), Gl(u), t.stateNode = u) : t.memoizedState = Zd(t.type, l.memoizedProps, t.pendingProps, l.memoizedState), null;
      case 27:
        return Au(t), l === null && il && (u = t.stateNode = Gd(t.type, t.pendingProps, P.current), Zl = t, _t = !0, e = _l, ha(t.type) ? (Jc = e, _l = Et(u.firstChild)) : _l = e), Vl(l, t, t.pendingProps.children, a), dn(l, t), l === null && (t.flags |= 4194304), t.child;
      case 5:
        return l === null && il && ((e = u = _l) && (u = uo(u, t.type, t.pendingProps, _t), u !== null ? (t.stateNode = u, Zl = t, _l = Et(u.firstChild), _t = !1, e = !0) : e = !1), e || ua(t)), Au(t), e = t.type, n = t.pendingProps, i = l !== null ? l.memoizedProps : null, u = n.children, Qc(e, n) ? u = null : i !== null && Qc(e, i) && (t.flags |= 32), t.memoizedState !== null && (e = Qi(l, t, gr, null, null, a), he._currentValue = e), dn(l, t), Vl(l, t, u, a), t.child;
      case 6:
        return l === null && il && ((l = a = _l) && (a = eo(a, t.pendingProps, _t), a !== null ? (t.stateNode = a, Zl = t, _l = null, l = !0) : l = !1), l || ua(t)), null;
      case 13:
        return Ns(l, t, a);
      case 4:
        return Wl(t, t.stateNode.containerInfo), u = t.pendingProps, l === null ? t.child = Ca(t, null, u, a) : Vl(l, t, u, a), t.child;
      case 11:
        return bs(l, t, t.type, t.pendingProps, a);
      case 7:
        return Vl(l, t, t.pendingProps, a), t.child;
      case 8:
        return Vl(l, t, t.pendingProps.children, a), t.child;
      case 12:
        return Vl(l, t, t.pendingProps.children, a), t.child;
      case 10:
        return u = t.pendingProps, ea(t, t.type, u.value), Vl(l, t, u.children, a), t.child;
      case 9:
        return e = t.type._context, u = t.pendingProps.children, Ua(t), e = Ll(e), u = u(e), t.flags |= 1, Vl(l, t, u, a), t.child;
      case 14:
        return Ss(l, t, t.type, t.pendingProps, a);
      case 15:
        return _s(l, t, t.type, t.pendingProps, a);
      case 19:
        return Ds(l, t, a);
      case 31:
        return Or(l, t, a);
      case 22:
        return zs(l, t, a, t.pendingProps);
      case 24:
        return Ua(t), u = Ll(xl), l === null ? (e = Ui(), e === null && (e = gl, n = Di(), e.pooledCache = n, n.refCount++, n !== null && (e.pooledCacheLanes |= a), e = n), t.memoizedState = {
          parent: u,
          cache: e
        }, xi(t), ea(t, xl, e)) : ((l.lanes & a) !== 0 && (Ri(l, t), Wu(t, null, null, a), ku()), e = l.memoizedState, n = t.memoizedState, e.parent !== u ? (e = {
          parent: u,
          cache: u
        }, t.memoizedState = e, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = e), ea(t, xl, u)) : (u = n.cache, ea(t, xl, u), u !== e.cache && Oi(t, [xl], a, !0))), Vl(l, t, t.pendingProps.children, a), t.child;
      case 29:
        throw t.pendingProps;
    }
    throw Error(s(156, t.tag));
  }
  function Lt(l) {
    l.flags |= 4;
  }
  function hc(l, t, a, u, e) {
    if ((t = (l.mode & 32) !== 0) && (t = !1), t) {
      if (l.flags |= 16777216, (e & 335544128) === e) if (l.stateNode.complete) l.flags |= 8192;
      else if (ud()) l.flags |= 8192;
      else throw Ra = ke, Hi;
    } else l.flags &= -16777217;
  }
  function Us(l, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0) l.flags &= -16777217;
    else if (l.flags |= 16777216, !wd(t)) if (ud()) l.flags |= 8192;
    else throw Ra = ke, Hi;
  }
  function rn(l, t) {
    t !== null && (l.flags |= 4), l.flags & 16384 && (t = l.tag !== 22 ? rf() : 536870912, l.lanes |= t, yu |= t);
  }
  function te(l, t) {
    if (!il) switch (l.tailMode) {
      case "hidden":
        t = l.tail;
        for (var a = null; t !== null; ) t.alternate !== null && (a = t), t = t.sibling;
        a === null ? l.tail = null : a.sibling = null;
        break;
      case "collapsed":
        a = l.tail;
        for (var u = null; a !== null; ) a.alternate !== null && (u = a), a = a.sibling;
        u === null ? t || l.tail === null ? l.tail = null : l.tail.sibling = null : u.sibling = null;
    }
  }
  function zl(l) {
    var t = l.alternate !== null && l.alternate.child === l.child, a = 0, u = 0;
    if (t) for (var e = l.child; e !== null; ) a |= e.lanes | e.childLanes, u |= e.subtreeFlags & 65011712, u |= e.flags & 65011712, e.return = l, e = e.sibling;
    else for (e = l.child; e !== null; ) a |= e.lanes | e.childLanes, u |= e.subtreeFlags, u |= e.flags, e.return = l, e = e.sibling;
    return l.subtreeFlags |= u, l.childLanes = a, t;
  }
  function jr(l, t, a) {
    var u = t.pendingProps;
    switch (Ei(t), t.tag) {
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
        return a = t.stateNode, u = null, l !== null && (u = l.memoizedState.cache), t.memoizedState.cache !== u && (t.flags |= 2048), Gt(xl), Ol(), a.pendingContext && (a.context = a.pendingContext, a.pendingContext = null), (l === null || l.child === null) && (uu(t) ? Lt(t) : l === null || l.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, Mi())), zl(t), null;
      case 26:
        var e = t.type, n = t.memoizedState;
        return l === null ? (Lt(t), n !== null ? (zl(t), Us(t, n)) : (zl(t), hc(t, e, null, u, a))) : n ? n !== l.memoizedState ? (Lt(t), zl(t), Us(t, n)) : (zl(t), t.flags &= -16777217) : (l = l.memoizedProps, l !== u && Lt(t), zl(t), hc(t, e, l, u, a)), null;
      case 27:
        if (ze(t), a = P.current, e = t.type, l !== null && t.stateNode != null) l.memoizedProps !== u && Lt(t);
        else {
          if (!u) {
            if (t.stateNode === null) throw Error(s(166));
            return zl(t), null;
          }
          l = L.current, uu(t) ? o0(t, l) : (l = Gd(e, u, a), t.stateNode = l, Lt(t));
        }
        return zl(t), null;
      case 5:
        if (ze(t), e = t.type, l !== null && t.stateNode != null) l.memoizedProps !== u && Lt(t);
        else {
          if (!u) {
            if (t.stateNode === null) throw Error(s(166));
            return zl(t), null;
          }
          if (n = L.current, uu(t)) o0(t, n);
          else {
            var i = Nn(P.current);
            switch (n) {
              case 1:
                n = i.createElementNS("http://www.w3.org/2000/svg", e);
                break;
              case 2:
                n = i.createElementNS("http://www.w3.org/1998/Math/MathML", e);
                break;
              default:
                switch (e) {
                  case "svg":
                    n = i.createElementNS("http://www.w3.org/2000/svg", e);
                    break;
                  case "math":
                    n = i.createElementNS("http://www.w3.org/1998/Math/MathML", e);
                    break;
                  case "script":
                    n = i.createElement("div"), n.innerHTML = "<script><\/script>", n = n.removeChild(n.firstChild);
                    break;
                  case "select":
                    n = typeof u.is == "string" ? i.createElement("select", { is: u.is }) : i.createElement("select"), u.multiple ? n.multiple = !0 : u.size && (n.size = u.size);
                    break;
                  default:
                    n = typeof u.is == "string" ? i.createElement(e, { is: u.is }) : i.createElement(e);
                }
            }
            n[Ql] = t, n[Fl] = u;
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
            l: switch (Kl(n, e, u), e) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                u = !!u.autoFocus;
                break l;
              case "img":
                u = !0;
                break l;
              default:
                u = !1;
            }
            u && Lt(t);
          }
        }
        return zl(t), hc(t, t.type, l === null ? null : l.memoizedProps, t.pendingProps, a), null;
      case 6:
        if (l && t.stateNode != null) l.memoizedProps !== u && Lt(t);
        else {
          if (typeof u != "string" && t.stateNode === null) throw Error(s(166));
          if (l = P.current, uu(t)) {
            if (l = t.stateNode, a = t.memoizedProps, u = null, e = Zl, e !== null) switch (e.tag) {
              case 27:
              case 5:
                u = e.memoizedProps;
            }
            l[Ql] = t, l = !!(l.nodeValue === a || u !== null && u.suppressHydrationWarning === !0 || Od(l.nodeValue, a)), l || ua(t, !0);
          } else l = Nn(l).createTextNode(u), l[Ql] = t, t.stateNode = l;
        }
        return zl(t), null;
      case 31:
        if (a = t.memoizedState, l === null || l.memoizedState !== null) {
          if (u = uu(t), a !== null) {
            if (l === null) {
              if (!u) throw Error(s(318));
              if (l = t.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(s(557));
              l[Ql] = t;
            } else Da(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            zl(t), l = !1;
          } else a = Mi(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = a), l = !0;
          if (!l)
            return t.flags & 256 ? (vt(t), t) : (vt(t), null);
          if ((t.flags & 128) !== 0) throw Error(s(558));
        }
        return zl(t), null;
      case 13:
        if (u = t.memoizedState, l === null || l.memoizedState !== null && l.memoizedState.dehydrated !== null) {
          if (e = uu(t), u !== null && u.dehydrated !== null) {
            if (l === null) {
              if (!e) throw Error(s(318));
              if (e = t.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(s(317));
              e[Ql] = t;
            } else Da(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            zl(t), e = !1;
          } else e = Mi(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = e), e = !0;
          if (!e)
            return t.flags & 256 ? (vt(t), t) : (vt(t), null);
        }
        return vt(t), (t.flags & 128) !== 0 ? (t.lanes = a, t) : (a = u !== null, l = l !== null && l.memoizedState !== null, a && (u = t.child, e = null, u.alternate !== null && u.alternate.memoizedState !== null && u.alternate.memoizedState.cachePool !== null && (e = u.alternate.memoizedState.cachePool.pool), n = null, u.memoizedState !== null && u.memoizedState.cachePool !== null && (n = u.memoizedState.cachePool.pool), n !== e && (u.flags |= 2048)), a !== l && a && (t.child.flags |= 8192), rn(t, t.updateQueue), zl(t), null);
      case 4:
        return Ol(), l === null && Td(t.stateNode.containerInfo), zl(t), null;
      case 10:
        return Gt(t.type), zl(t), null;
      case 19:
        if (N(Dl), u = t.memoizedState, u === null) return zl(t), null;
        if (e = (t.flags & 128) !== 0, n = u.rendering, n === null) if (e) te(u, !1);
        else {
          if (Nl !== 0 || l !== null && (l.flags & 128) !== 0) for (l = t.child; l !== null; ) {
            if (n = Ie(l), n !== null) {
              for (t.flags |= 128, te(u, !1), l = n.updateQueue, t.updateQueue = l, rn(t, l), t.subtreeFlags = 0, l = a, a = t.child; a !== null; ) f0(a, l), a = a.sibling;
              return C(Dl, Dl.current & 1 | 2), il && Yt(t, u.treeForkCount), t.child;
            }
            l = l.sibling;
          }
          u.tail !== null && nt() > gn && (t.flags |= 128, e = !0, te(u, !1), t.lanes = 4194304);
        }
        else {
          if (!e) if (l = Ie(n), l !== null) {
            if (t.flags |= 128, e = !0, l = l.updateQueue, t.updateQueue = l, rn(t, l), te(u, !0), u.tail === null && u.tailMode === "hidden" && !n.alternate && !il) return zl(t), null;
          } else 2 * nt() - u.renderingStartTime > gn && a !== 536870912 && (t.flags |= 128, e = !0, te(u, !1), t.lanes = 4194304);
          u.isBackwards ? (n.sibling = t.child, t.child = n) : (l = u.last, l !== null ? l.sibling = n : t.child = n, u.last = n);
        }
        return u.tail !== null ? (l = u.tail, u.rendering = l, u.tail = l.sibling, u.renderingStartTime = nt(), l.sibling = null, a = Dl.current, C(Dl, e ? a & 1 | 2 : a & 1), il && Yt(t, u.treeForkCount), l) : (zl(t), null);
      case 22:
      case 23:
        return vt(t), qi(), u = t.memoizedState !== null, l !== null ? l.memoizedState !== null !== u && (t.flags |= 8192) : u && (t.flags |= 8192), u ? (a & 536870912) !== 0 && (t.flags & 128) === 0 && (zl(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : zl(t), a = t.updateQueue, a !== null && rn(t, a.retryQueue), a = null, l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), u = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (u = t.memoizedState.cachePool.pool), u !== a && (t.flags |= 2048), l !== null && N(Ha), null;
      case 24:
        return a = null, l !== null && (a = l.memoizedState.cache), t.memoizedState.cache !== a && (t.flags |= 2048), Gt(xl), zl(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(s(156, t.tag));
  }
  function Ur(l, t) {
    switch (Ei(t), t.tag) {
      case 1:
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 3:
        return Gt(xl), Ol(), l = t.flags, (l & 65536) !== 0 && (l & 128) === 0 ? (t.flags = l & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return ze(t), null;
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
        return vt(t), qi(), l !== null && N(Ha), l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 24:
        return Gt(xl), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function Hs(l, t) {
    switch (Ei(t), t.tag) {
      case 3:
        Gt(xl), Ol();
        break;
      case 26:
      case 27:
      case 5:
        ze(t);
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
        vt(t), qi(), l !== null && N(Ha);
        break;
      case 24:
        Gt(xl);
    }
  }
  function ae(l, t) {
    try {
      var a = t.updateQueue, u = a !== null ? a.lastEffect : null;
      if (u !== null) {
        var e = u.next;
        a = e;
        do {
          if ((a.tag & l) === l) {
            u = void 0;
            var n = a.create, i = a.inst;
            u = n(), i.destroy = u;
          }
          a = a.next;
        } while (a !== e);
      }
    } catch (c) {
      ol(t, t.return, c);
    }
  }
  function fa(l, t, a) {
    try {
      var u = t.updateQueue, e = u !== null ? u.lastEffect : null;
      if (e !== null) {
        var n = e.next;
        u = n;
        do {
          if ((u.tag & l) === l) {
            var i = u.inst, c = i.destroy;
            if (c !== void 0) {
              i.destroy = void 0, e = t;
              var d = a, g = c;
              try {
                g();
              } catch (E) {
                ol(e, d, E);
              }
            }
          }
          u = u.next;
        } while (u !== n);
      }
    } catch (E) {
      ol(t, t.return, E);
    }
  }
  function xs(l) {
    var t = l.updateQueue;
    if (t !== null) {
      var a = l.stateNode;
      try {
        A0(t, a);
      } catch (u) {
        ol(l, l.return, u);
      }
    }
  }
  function Rs(l, t, a) {
    a.props = Ga(l.type, l.memoizedProps), a.state = l.memoizedState;
    try {
      a.componentWillUnmount();
    } catch (u) {
      ol(l, t, u);
    }
  }
  function ue(l, t) {
    try {
      var a = l.ref;
      if (a !== null) {
        switch (l.tag) {
          case 26:
          case 27:
          case 5:
            var u = l.stateNode;
            break;
          case 30:
            u = l.stateNode;
            break;
          default:
            u = l.stateNode;
        }
        typeof a == "function" ? l.refCleanup = a(u) : a.current = u;
      }
    } catch (e) {
      ol(l, t, e);
    }
  }
  function jt(l, t) {
    var a = l.ref, u = l.refCleanup;
    if (a !== null) if (typeof u == "function") try {
      u();
    } catch (e) {
      ol(l, t, e);
    } finally {
      l.refCleanup = null, l = l.alternate, l != null && (l.refCleanup = null);
    }
    else if (typeof a == "function") try {
      a(null);
    } catch (e) {
      ol(l, t, e);
    }
    else a.current = null;
  }
  function Cs(l) {
    var t = l.type, a = l.memoizedProps, u = l.stateNode;
    try {
      l: switch (t) {
        case "button":
        case "input":
        case "select":
        case "textarea":
          a.autoFocus && u.focus();
          break l;
        case "img":
          a.src ? u.src = a.src : a.srcSet && (u.srcset = a.srcSet);
      }
    } catch (e) {
      ol(l, l.return, e);
    }
  }
  function yc(l, t, a) {
    try {
      var u = l.stateNode;
      Fr(u, l.type, a, t), u[Fl] = t;
    } catch (e) {
      ol(l, l.return, e);
    }
  }
  function Bs(l) {
    return l.tag === 5 || l.tag === 3 || l.tag === 26 || l.tag === 27 && ha(l.type) || l.tag === 4;
  }
  function gc(l) {
    l: for (; ; ) {
      for (; l.sibling === null; ) {
        if (l.return === null || Bs(l.return)) return null;
        l = l.return;
      }
      for (l.sibling.return = l.return, l = l.sibling; l.tag !== 5 && l.tag !== 6 && l.tag !== 18; ) {
        if (l.tag === 27 && ha(l.type) || l.flags & 2 || l.child === null || l.tag === 4) continue l;
        l.child.return = l, l = l.child;
      }
      if (!(l.flags & 2)) return l.stateNode;
    }
  }
  function bc(l, t, a) {
    var u = l.tag;
    if (u === 5 || u === 6) l = l.stateNode, t ? (a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a).insertBefore(l, t) : (t = a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a, t.appendChild(l), a = a._reactRootContainer, a != null || t.onclick !== null || (t.onclick = Rt));
    else if (u !== 4 && (u === 27 && ha(l.type) && (a = l.stateNode, t = null), l = l.child, l !== null)) for (bc(l, t, a), l = l.sibling; l !== null; ) bc(l, t, a), l = l.sibling;
  }
  function on(l, t, a) {
    var u = l.tag;
    if (u === 5 || u === 6) l = l.stateNode, t ? a.insertBefore(l, t) : a.appendChild(l);
    else if (u !== 4 && (u === 27 && ha(l.type) && (a = l.stateNode), l = l.child, l !== null)) for (on(l, t, a), l = l.sibling; l !== null; ) on(l, t, a), l = l.sibling;
  }
  function Ys(l) {
    var t = l.stateNode, a = l.memoizedProps;
    try {
      for (var u = l.type, e = t.attributes; e.length; ) t.removeAttributeNode(e[0]);
      Kl(t, u, a), t[Ql] = l, t[Fl] = a;
    } catch (n) {
      ol(l, l.return, n);
    }
  }
  var Vt = !1, Bl = !1, Sc = !1, qs = typeof WeakSet == "function" ? WeakSet : Set, Xl = null;
  function Hr(l, t) {
    if (l = l.containerInfo, Gc = Rn, l = Pf(l), ri(l)) {
      if ("selectionStart" in l) var a = {
        start: l.selectionStart,
        end: l.selectionEnd
      };
      else l: {
        a = (a = l.ownerDocument) && a.defaultView || window;
        var u = a.getSelection && a.getSelection();
        if (u && u.rangeCount !== 0) {
          a = u.anchorNode;
          var e = u.anchorOffset, n = u.focusNode;
          u = u.focusOffset;
          try {
            a.nodeType, n.nodeType;
          } catch {
            a = null;
            break l;
          }
          var i = 0, c = -1, d = -1, g = 0, E = 0, A = l, b = null;
          t: for (; ; ) {
            for (var S; A !== a || e !== 0 && A.nodeType !== 3 || (c = i + e), A !== n || u !== 0 && A.nodeType !== 3 || (d = i + u), A.nodeType === 3 && (i += A.nodeValue.length), (S = A.firstChild) !== null; )
              b = A, A = S;
            for (; ; ) {
              if (A === l) break t;
              if (b === a && ++g === e && (c = i), b === n && ++E === u && (d = i), (S = A.nextSibling) !== null) break;
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
    for (Xc = {
      focusedElem: l,
      selectionRange: a
    }, Rn = !1, Xl = t; Xl !== null; ) if (t = Xl, l = t.child, (t.subtreeFlags & 1028) !== 0 && l !== null) l.return = t, Xl = l;
    else for (; Xl !== null; ) {
      switch (t = Xl, n = t.alternate, l = t.flags, t.tag) {
        case 0:
          if ((l & 4) !== 0 && (l = t.updateQueue, l = l !== null ? l.events : null, l !== null)) for (a = 0; a < l.length; a++) e = l[a], e.ref.impl = e.nextImpl;
          break;
        case 11:
        case 15:
          break;
        case 1:
          if ((l & 1024) !== 0 && n !== null) {
            l = void 0, a = t, e = n.memoizedProps, n = n.memoizedState, u = a.stateNode;
            try {
              var q = Ga(a.type, e);
              l = u.getSnapshotBeforeUpdate(q, n), u.__reactInternalSnapshotBeforeUpdate = l;
            } catch (w) {
              ol(a, a.return, w);
            }
          }
          break;
        case 3:
          if ((l & 1024) !== 0) {
            if (l = t.stateNode.containerInfo, a = l.nodeType, a === 9) Lc(l);
            else if (a === 1) switch (l.nodeName) {
              case "HEAD":
              case "HTML":
              case "BODY":
                Lc(l);
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
  function Gs(l, t, a) {
    var u = a.flags;
    switch (a.tag) {
      case 0:
      case 11:
      case 15:
        Jt(l, a), u & 4 && ae(5, a);
        break;
      case 1:
        if (Jt(l, a), u & 4) if (l = a.stateNode, t === null) try {
          l.componentDidMount();
        } catch (i) {
          ol(a, a.return, i);
        }
        else {
          var e = Ga(a.type, t.memoizedProps);
          t = t.memoizedState;
          try {
            l.componentDidUpdate(e, t, l.__reactInternalSnapshotBeforeUpdate);
          } catch (i) {
            ol(a, a.return, i);
          }
        }
        u & 64 && xs(a), u & 512 && ue(a, a.return);
        break;
      case 3:
        if (Jt(l, a), u & 64 && (l = a.updateQueue, l !== null)) {
          if (t = null, a.child !== null) switch (a.child.tag) {
            case 27:
            case 5:
              t = a.child.stateNode;
              break;
            case 1:
              t = a.child.stateNode;
          }
          try {
            A0(l, t);
          } catch (i) {
            ol(a, a.return, i);
          }
        }
        break;
      case 27:
        t === null && u & 4 && Ys(a);
      case 26:
      case 5:
        Jt(l, a), t === null && u & 4 && Cs(a), u & 512 && ue(a, a.return);
        break;
      case 12:
        Jt(l, a);
        break;
      case 31:
        Jt(l, a), u & 4 && Zs(l, a);
        break;
      case 13:
        Jt(l, a), u & 4 && Ls(l, a), u & 64 && (l = a.memoizedState, l !== null && (l = l.dehydrated, l !== null && (a = Qr.bind(null, a), no(l, a))));
        break;
      case 22:
        if (u = a.memoizedState !== null || Vt, !u) {
          t = t !== null && t.memoizedState !== null || Bl, e = Vt;
          var n = Bl;
          Vt = u, (Bl = t) && !n ? wt(l, a, (a.subtreeFlags & 8772) !== 0) : Jt(l, a), Vt = e, Bl = n;
        }
        break;
      case 30:
        break;
      default:
        Jt(l, a);
    }
  }
  function Xs(l) {
    var t = l.alternate;
    t !== null && (l.alternate = null, Xs(t)), l.child = null, l.deletions = null, l.sibling = null, l.tag === 5 && (t = l.stateNode, t !== null && Wn(t)), l.stateNode = null, l.return = null, l.dependencies = null, l.memoizedProps = null, l.memoizedState = null, l.pendingProps = null, l.stateNode = null, l.updateQueue = null;
  }
  var pl = null, Pl = !1;
  function Kt(l, t, a) {
    for (a = a.child; a !== null; ) Qs(l, t, a), a = a.sibling;
  }
  function Qs(l, t, a) {
    if (it && typeof it.onCommitFiberUnmount == "function") try {
      it.onCommitFiberUnmount(Nu, a);
    } catch {
    }
    switch (a.tag) {
      case 26:
        Bl || jt(a, t), Kt(l, t, a), a.memoizedState ? a.memoizedState.count-- : a.stateNode && (a = a.stateNode, a.parentNode.removeChild(a));
        break;
      case 27:
        Bl || jt(a, t);
        var u = pl, e = Pl;
        ha(a.type) && (pl = a.stateNode, Pl = !1), Kt(l, t, a), re(a.stateNode), pl = u, Pl = e;
        break;
      case 5:
        Bl || jt(a, t);
      case 6:
        if (u = pl, e = Pl, pl = null, Kt(l, t, a), pl = u, Pl = e, pl !== null) if (Pl) try {
          (pl.nodeType === 9 ? pl.body : pl.nodeName === "HTML" ? pl.ownerDocument.body : pl).removeChild(a.stateNode);
        } catch (n) {
          ol(a, t, n);
        }
        else try {
          pl.removeChild(a.stateNode);
        } catch (n) {
          ol(a, t, n);
        }
        break;
      case 18:
        pl !== null && (Pl ? (l = pl, Rd(l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l, a.stateNode), Tu(l)) : Rd(pl, a.stateNode));
        break;
      case 4:
        u = pl, e = Pl, pl = a.stateNode.containerInfo, Pl = !0, Kt(l, t, a), pl = u, Pl = e;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        fa(2, a, t), Bl || fa(4, a, t), Kt(l, t, a);
        break;
      case 1:
        Bl || (jt(a, t), u = a.stateNode, typeof u.componentWillUnmount == "function" && Rs(a, t, u)), Kt(l, t, a);
        break;
      case 21:
        Kt(l, t, a);
        break;
      case 22:
        Bl = (u = Bl) || a.memoizedState !== null, Kt(l, t, a), Bl = u;
        break;
      default:
        Kt(l, t, a);
    }
  }
  function Zs(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null))) {
      l = l.dehydrated;
      try {
        Tu(l);
      } catch (a) {
        ol(t, t.return, a);
      }
    }
  }
  function Ls(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null && (l = l.dehydrated, l !== null)))) try {
      Tu(l);
    } catch (a) {
      ol(t, t.return, a);
    }
  }
  function xr(l) {
    switch (l.tag) {
      case 31:
      case 13:
      case 19:
        var t = l.stateNode;
        return t === null && (t = l.stateNode = new qs()), t;
      case 22:
        return l = l.stateNode, t = l._retryCache, t === null && (t = l._retryCache = new qs()), t;
      default:
        throw Error(s(435, l.tag));
    }
  }
  function mn(l, t) {
    var a = xr(l);
    t.forEach(function(u) {
      if (!a.has(u)) {
        a.add(u);
        var e = Zr.bind(null, l, u);
        u.then(e, e);
      }
    });
  }
  function lt(l, t) {
    var a = t.deletions;
    if (a !== null) for (var u = 0; u < a.length; u++) {
      var e = a[u], n = l, i = t, c = i;
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
      Qs(n, i, e), pl = null, Pl = !1, n = e.alternate, n !== null && (n.return = null), e.return = null;
    }
    if (t.subtreeFlags & 13886) for (t = t.child; t !== null; ) Vs(t, l), t = t.sibling;
  }
  var At = null;
  function Vs(l, t) {
    var a = l.alternate, u = l.flags;
    switch (l.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        lt(t, l), tt(l), u & 4 && (fa(3, l, l.return), ae(3, l), fa(5, l, l.return));
        break;
      case 1:
        lt(t, l), tt(l), u & 512 && (Bl || a === null || jt(a, a.return)), u & 64 && Vt && (l = l.updateQueue, l !== null && (u = l.callbacks, u !== null && (a = l.shared.hiddenCallbacks, l.shared.hiddenCallbacks = a === null ? u : a.concat(u))));
        break;
      case 26:
        var e = At;
        if (lt(t, l), tt(l), u & 512 && (Bl || a === null || jt(a, a.return)), u & 4) {
          var n = a !== null ? a.memoizedState : null;
          if (u = l.memoizedState, a === null) if (u === null) if (l.stateNode === null) {
            l: {
              u = l.type, a = l.memoizedProps, e = e.ownerDocument || e;
              t: switch (u) {
                case "title":
                  n = e.getElementsByTagName("title")[0], (!n || n[ju] || n[Ql] || n.namespaceURI === "http://www.w3.org/2000/svg" || n.hasAttribute("itemprop")) && (n = e.createElement(u), e.head.insertBefore(n, e.querySelector("head > title"))), Kl(n, u, a), n[Ql] = l, Gl(n), u = n;
                  break l;
                case "link":
                  var i = Kd("link", "href", e).get(u + (a.href || ""));
                  if (i) {
                    for (var c = 0; c < i.length; c++) if (n = i[c], n.getAttribute("href") === (a.href == null || a.href === "" ? null : a.href) && n.getAttribute("rel") === (a.rel == null ? null : a.rel) && n.getAttribute("title") === (a.title == null ? null : a.title) && n.getAttribute("crossorigin") === (a.crossOrigin == null ? null : a.crossOrigin)) {
                      i.splice(c, 1);
                      break t;
                    }
                  }
                  n = e.createElement(u), Kl(n, u, a), e.head.appendChild(n);
                  break;
                case "meta":
                  if (i = Kd("meta", "content", e).get(u + (a.content || ""))) {
                    for (c = 0; c < i.length; c++) if (n = i[c], n.getAttribute("content") === (a.content == null ? null : "" + a.content) && n.getAttribute("name") === (a.name == null ? null : a.name) && n.getAttribute("property") === (a.property == null ? null : a.property) && n.getAttribute("http-equiv") === (a.httpEquiv == null ? null : a.httpEquiv) && n.getAttribute("charset") === (a.charSet == null ? null : a.charSet)) {
                      i.splice(c, 1);
                      break t;
                    }
                  }
                  n = e.createElement(u), Kl(n, u, a), e.head.appendChild(n);
                  break;
                default:
                  throw Error(s(468, u));
              }
              n[Ql] = l, Gl(n), u = n;
            }
            l.stateNode = u;
          } else Jd(e, l.type, l.stateNode);
          else l.stateNode = Vd(e, u, l.memoizedProps);
          else n !== u ? (n === null ? a.stateNode !== null && (a = a.stateNode, a.parentNode.removeChild(a)) : n.count--, u === null ? Jd(e, l.type, l.stateNode) : Vd(e, u, l.memoizedProps)) : u === null && l.stateNode !== null && yc(l, l.memoizedProps, a.memoizedProps);
        }
        break;
      case 27:
        lt(t, l), tt(l), u & 512 && (Bl || a === null || jt(a, a.return)), a !== null && u & 4 && yc(l, l.memoizedProps, a.memoizedProps);
        break;
      case 5:
        if (lt(t, l), tt(l), u & 512 && (Bl || a === null || jt(a, a.return)), l.flags & 32) {
          e = l.stateNode;
          try {
            wa(e, "");
          } catch (q) {
            ol(l, l.return, q);
          }
        }
        u & 4 && l.stateNode != null && (e = l.memoizedProps, yc(l, e, a !== null ? a.memoizedProps : e)), u & 1024 && (Sc = !0);
        break;
      case 6:
        if (lt(t, l), tt(l), u & 4) {
          if (l.stateNode === null) throw Error(s(162));
          u = l.memoizedProps, a = l.stateNode;
          try {
            a.nodeValue = u;
          } catch (q) {
            ol(l, l.return, q);
          }
        }
        break;
      case 3:
        if (jn = null, e = At, At = On(t.containerInfo), lt(t, l), At = e, tt(l), u & 4 && a !== null && a.memoizedState.isDehydrated) try {
          Tu(t.containerInfo);
        } catch (q) {
          ol(l, l.return, q);
        }
        Sc && (Sc = !1, Ks(l));
        break;
      case 4:
        u = At, At = On(l.stateNode.containerInfo), lt(t, l), tt(l), At = u;
        break;
      case 12:
        lt(t, l), tt(l);
        break;
      case 31:
        lt(t, l), tt(l), u & 4 && (u = l.updateQueue, u !== null && (l.updateQueue = null, mn(l, u)));
        break;
      case 13:
        lt(t, l), tt(l), l.child.flags & 8192 && l.memoizedState !== null != (a !== null && a.memoizedState !== null) && (yn = nt()), u & 4 && (u = l.updateQueue, u !== null && (l.updateQueue = null, mn(l, u)));
        break;
      case 22:
        e = l.memoizedState !== null;
        var d = a !== null && a.memoizedState !== null, g = Vt, E = Bl;
        if (Vt = g || e, Bl = E || d, lt(t, l), Bl = E, Vt = g, tt(l), u & 8192) l: for (t = l.stateNode, t._visibility = e ? t._visibility & -2 : t._visibility | 1, e && (a === null || d || Vt || Bl || Xa(l)), a = null, t = l; ; ) {
          if (t.tag === 5 || t.tag === 26) {
            if (a === null) {
              d = a = t;
              try {
                if (n = d.stateNode, e) i = n.style, typeof i.setProperty == "function" ? i.setProperty("display", "none", "important") : i.display = "none";
                else {
                  c = d.stateNode;
                  var A = d.memoizedProps.style, b = A != null && A.hasOwnProperty("display") ? A.display : null;
                  c.style.display = b == null || typeof b == "boolean" ? "" : ("" + b).trim();
                }
              } catch (q) {
                ol(d, d.return, q);
              }
            }
          } else if (t.tag === 6) {
            if (a === null) {
              d = t;
              try {
                d.stateNode.nodeValue = e ? "" : d.memoizedProps;
              } catch (q) {
                ol(d, d.return, q);
              }
            }
          } else if (t.tag === 18) {
            if (a === null) {
              d = t;
              try {
                var S = d.stateNode;
                e ? Cd(S, !0) : Cd(d.stateNode, !1);
              } catch (q) {
                ol(d, d.return, q);
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
        u & 4 && (u = l.updateQueue, u !== null && (a = u.retryQueue, a !== null && (u.retryQueue = null, mn(l, a))));
        break;
      case 19:
        lt(t, l), tt(l), u & 4 && (u = l.updateQueue, u !== null && (l.updateQueue = null, mn(l, u)));
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
        for (var a, u = l.return; u !== null; ) {
          if (Bs(u)) {
            a = u;
            break;
          }
          u = u.return;
        }
        if (a == null) throw Error(s(160));
        switch (a.tag) {
          case 27:
            var e = a.stateNode;
            on(l, gc(l), e);
            break;
          case 5:
            var n = a.stateNode;
            a.flags & 32 && (wa(n, ""), a.flags &= -33), on(l, gc(l), n);
            break;
          case 3:
          case 4:
            var i = a.stateNode.containerInfo;
            bc(l, gc(l), i);
            break;
          default:
            throw Error(s(161));
        }
      } catch (c) {
        ol(l, l.return, c);
      }
      l.flags &= -3;
    }
    t & 4096 && (l.flags &= -4097);
  }
  function Ks(l) {
    if (l.subtreeFlags & 1024) for (l = l.child; l !== null; ) {
      var t = l;
      Ks(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), l = l.sibling;
    }
  }
  function Jt(l, t) {
    if (t.subtreeFlags & 8772) for (t = t.child; t !== null; ) Gs(l, t.alternate, t), t = t.sibling;
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
          typeof a.componentWillUnmount == "function" && Rs(t, t.return, a), Xa(t);
          break;
        case 27:
          re(t.stateNode);
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
      var u = t.alternate, e = l, n = t, i = n.flags;
      switch (n.tag) {
        case 0:
        case 11:
        case 15:
          wt(e, n, a), ae(4, n);
          break;
        case 1:
          if (wt(e, n, a), u = n, e = u.stateNode, typeof e.componentDidMount == "function") try {
            e.componentDidMount();
          } catch (g) {
            ol(u, u.return, g);
          }
          if (u = n, e = u.updateQueue, e !== null) {
            var c = u.stateNode;
            try {
              var d = e.shared.hiddenCallbacks;
              if (d !== null) for (e.shared.hiddenCallbacks = null, e = 0; e < d.length; e++) M0(d[e], c);
            } catch (g) {
              ol(u, u.return, g);
            }
          }
          a && i & 64 && xs(n), ue(n, n.return);
          break;
        case 27:
          Ys(n);
        case 26:
        case 5:
          wt(e, n, a), a && u === null && i & 4 && Cs(n), ue(n, n.return);
          break;
        case 12:
          wt(e, n, a);
          break;
        case 31:
          wt(e, n, a), a && i & 4 && Zs(e, n);
          break;
        case 13:
          wt(e, n, a), a && i & 4 && Ls(e, n);
          break;
        case 22:
          n.memoizedState === null && wt(e, n, a), ue(n, n.return);
          break;
        case 30:
          break;
        default:
          wt(e, n, a);
      }
      t = t.sibling;
    }
  }
  function _c(l, t) {
    var a = null;
    l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), l = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (l = t.memoizedState.cachePool.pool), l !== a && (l != null && l.refCount++, a != null && Lu(a));
  }
  function zc(l, t) {
    l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Lu(l));
  }
  function Nt(l, t, a, u) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) Js(l, t, a, u), t = t.sibling;
  }
  function Js(l, t, a, u) {
    var e = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        Nt(l, t, a, u), e & 2048 && ae(9, t);
        break;
      case 1:
        Nt(l, t, a, u);
        break;
      case 3:
        Nt(l, t, a, u), e & 2048 && (l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Lu(l)));
        break;
      case 12:
        if (e & 2048) {
          Nt(l, t, a, u), l = t.stateNode;
          try {
            var n = t.memoizedProps, i = n.id, c = n.onPostCommit;
            typeof c == "function" && c(i, t.alternate === null ? "mount" : "update", l.passiveEffectDuration, -0);
          } catch (d) {
            ol(t, t.return, d);
          }
        } else Nt(l, t, a, u);
        break;
      case 31:
        Nt(l, t, a, u);
        break;
      case 13:
        Nt(l, t, a, u);
        break;
      case 23:
        break;
      case 22:
        n = t.stateNode, i = t.alternate, t.memoizedState !== null ? n._visibility & 2 ? Nt(l, t, a, u) : ee(l, t) : n._visibility & 2 ? Nt(l, t, a, u) : (n._visibility |= 2, ou(l, t, a, u, (t.subtreeFlags & 10256) !== 0 || !1)), e & 2048 && _c(i, t);
        break;
      case 24:
        Nt(l, t, a, u), e & 2048 && zc(t.alternate, t);
        break;
      default:
        Nt(l, t, a, u);
    }
  }
  function ou(l, t, a, u, e) {
    for (e = e && ((t.subtreeFlags & 10256) !== 0 || !1), t = t.child; t !== null; ) {
      var n = l, i = t, c = a, d = u, g = i.flags;
      switch (i.tag) {
        case 0:
        case 11:
        case 15:
          ou(n, i, c, d, e), ae(8, i);
          break;
        case 23:
          break;
        case 22:
          var E = i.stateNode;
          i.memoizedState !== null ? E._visibility & 2 ? ou(n, i, c, d, e) : ee(n, i) : (E._visibility |= 2, ou(n, i, c, d, e)), e && g & 2048 && _c(i.alternate, i);
          break;
        case 24:
          ou(n, i, c, d, e), e && g & 2048 && zc(i.alternate, i);
          break;
        default:
          ou(n, i, c, d, e);
      }
      t = t.sibling;
    }
  }
  function ee(l, t) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) {
      var a = l, u = t, e = u.flags;
      switch (u.tag) {
        case 22:
          ee(a, u), e & 2048 && _c(u.alternate, u);
          break;
        case 24:
          ee(a, u), e & 2048 && zc(u.alternate, u);
          break;
        default:
          ee(a, u);
      }
      t = t.sibling;
    }
  }
  var ne = 8192;
  function mu(l, t, a) {
    if (l.subtreeFlags & ne) for (l = l.child; l !== null; ) ws(l, t, a), l = l.sibling;
  }
  function ws(l, t, a) {
    switch (l.tag) {
      case 26:
        mu(l, t, a), l.flags & ne && l.memoizedState !== null && bo(a, At, l.memoizedState, l.memoizedProps);
        break;
      case 5:
        mu(l, t, a);
        break;
      case 3:
      case 4:
        var u = At;
        At = On(l.stateNode.containerInfo), mu(l, t, a), At = u;
        break;
      case 22:
        l.memoizedState === null && (u = l.alternate, u !== null && u.memoizedState !== null ? (u = ne, ne = 16777216, mu(l, t, a), ne = u) : mu(l, t, a));
        break;
      default:
        mu(l, t, a);
    }
  }
  function ks(l) {
    var t = l.alternate;
    if (t !== null && (l = t.child, l !== null)) {
      t.child = null;
      do
        t = l.sibling, l.sibling = null, l = t;
      while (l !== null);
    }
  }
  function ie(l) {
    var t = l.deletions;
    if ((l.flags & 16) !== 0) {
      if (t !== null) for (var a = 0; a < t.length; a++) {
        var u = t[a];
        Xl = u, $s(u, l);
      }
      ks(l);
    }
    if (l.subtreeFlags & 10256) for (l = l.child; l !== null; ) Ws(l), l = l.sibling;
  }
  function Ws(l) {
    switch (l.tag) {
      case 0:
      case 11:
      case 15:
        ie(l), l.flags & 2048 && fa(9, l, l.return);
        break;
      case 3:
        ie(l);
        break;
      case 12:
        ie(l);
        break;
      case 22:
        var t = l.stateNode;
        l.memoizedState !== null && t._visibility & 2 && (l.return === null || l.return.tag !== 13) ? (t._visibility &= -3, hn(l)) : ie(l);
        break;
      default:
        ie(l);
    }
  }
  function hn(l) {
    var t = l.deletions;
    if ((l.flags & 16) !== 0) {
      if (t !== null) for (var a = 0; a < t.length; a++) {
        var u = t[a];
        Xl = u, $s(u, l);
      }
      ks(l);
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
  function $s(l, t) {
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
            var u = a.memoizedState.cachePool.pool;
            u != null && u.refCount++;
          }
          break;
        case 24:
          Lu(a.memoizedState.cache);
      }
      if (u = a.child, u !== null) u.return = a, Xl = u;
      else l: for (a = l; Xl !== null; ) {
        u = Xl;
        var e = u.sibling, n = u.return;
        if (Xs(u), u === a) {
          Xl = null;
          break l;
        }
        if (e !== null) {
          e.return = n, Xl = e;
          break l;
        }
        Xl = n;
      }
    }
  }
  var Rr = {
    getCacheForType: function(l) {
      var t = Ll(xl), a = t.data.get(l);
      return a === void 0 && (a = l(), t.data.set(l, a)), a;
    },
    cacheSignal: function() {
      return Ll(xl).controller.signal;
    }
  }, Cr = typeof WeakMap == "function" ? WeakMap : Map, dl = 0, gl = null, ll = null, ul = 0, rl = 0, rt = null, sa = !1, hu = !1, pc = !1, kt = 0, Nl = 0, da = 0, Qa = 0, Ec = 0, ot = 0, yu = 0, ce = null, at = null, Tc = !1, yn = 0, Fs = 0, gn = 1 / 0, bn = null, va = null, Yl = 0, ra = null, gu = null, Wt = 0, Mc = 0, Ac = null, Is = null, fe = 0, Nc = null;
  function pt() {
    return (dl & 2) !== 0 && ul !== 0 ? ul & -ul : D.T !== null ? xc() : gf();
  }
  function Ps() {
    if (ot === 0) if ((ul & 536870912) === 0 || il) {
      var l = Te;
      Te <<= 1, (Te & 3932160) === 0 && (Te = 262144), ot = l;
    } else ot = 536870912;
    return l = dt.current, l !== null && (l.flags |= 32), ot;
  }
  function ut(l, t, a) {
    (l === gl && (rl === 2 || rl === 9) || l.cancelPendingCommit !== null) && (bu(l, 0), oa(l, ul, ot, !1)), Ne(l, a), ((dl & 2) === 0 || l !== gl) && (l === gl && ((dl & 2) === 0 && (Qa |= a), Nl === 4 && oa(l, ul, ot, !1)), $t(l));
  }
  function ld(l, t, a) {
    if ((dl & 6) !== 0) throw Error(s(327));
    var u = !a && (t & 127) === 0 && (t & l.expiredLanes) === 0 || Ou(l, t), e = u ? qr(l, t) : Dc(l, t, !0), n = u;
    do {
      if (e === 0) {
        hu && !u && oa(l, t, 0, !1);
        break;
      } else {
        if (a = l.current.alternate, n && !Br(a)) {
          e = Dc(l, t, !1), n = !1;
          continue;
        }
        if (e === 2) {
          if (n = t, l.errorRecoveryDisabledLanes & n) var i = 0;
          else i = l.pendingLanes & -536870913, i = i !== 0 ? i : i & 536870912 ? 536870912 : 0;
          if (i !== 0) {
            t = i;
            l: {
              var c = l;
              e = ce;
              var d = c.current.memoizedState.isDehydrated;
              if (d && (bu(c, i).flags |= 256), i = Dc(c, i, !1), i !== 2) {
                if (pc && !d) {
                  c.errorRecoveryDisabledLanes |= n, Qa |= n, e = 4;
                  break l;
                }
                n = at, at = e, n !== null && (at === null ? at = n : at.push.apply(at, n));
              }
              e = i;
            }
            if (n = !1, e !== 2) continue;
          }
        }
        if (e === 1) {
          bu(l, 0), oa(l, t, 0, !0);
          break;
        }
        l: {
          switch (u = l, n = e, n) {
            case 0:
            case 1:
              throw Error(s(345));
            case 4:
              if ((t & 4194048) !== t) break;
            case 6:
              oa(u, t, ot, !sa);
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
          if ((t & 62914560) === t && (e = yn + 300 - nt(), 10 < e)) {
            if (oa(u, t, ot, !sa), Ae(u, 0, !0) !== 0) break l;
            Wt = t, u.timeoutHandle = Hd(td.bind(null, u, a, at, bn, Tc, t, ot, Qa, yu, sa, n, "Throttled", -0, 0), e);
            break l;
          }
          td(u, a, at, bn, Tc, t, ot, Qa, yu, sa, n, null, -0, 0);
        }
      }
      break;
    } while (!0);
    $t(l);
  }
  function td(l, t, a, u, e, n, i, c, d, g, E, A, b, S) {
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
      }, ws(t, n, A);
      var q = (n & 62914560) === n ? yn - nt() : (n & 4194048) === n ? Fs - nt() : 0;
      if (q = So(A, q), q !== null) {
        Wt = n, l.cancelPendingCommit = q(sd.bind(null, l, t, n, a, u, e, i, c, d, E, A, null, b, S)), oa(l, n, i, !g);
        return;
      }
    }
    sd(l, t, n, a, u, e, i, c, d);
  }
  function Br(l) {
    for (var t = l; ; ) {
      var a = t.tag;
      if ((a === 0 || a === 11 || a === 15) && t.flags & 16384 && (a = t.updateQueue, a !== null && (a = a.stores, a !== null))) for (var u = 0; u < a.length; u++) {
        var e = a[u], n = e.getSnapshot;
        e = e.value;
        try {
          if (!ft(n(), e)) return !1;
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
  function oa(l, t, a, u) {
    t &= ~Ec, t &= ~Qa, l.suspendedLanes |= t, l.pingedLanes &= ~t, u && (l.warmLanes |= t), u = l.expirationTimes;
    for (var e = t; 0 < e; ) {
      var n = 31 - ct(e), i = 1 << n;
      u[n] = -1, e &= ~i;
    }
    a !== 0 && of(l, a, t);
  }
  function Sn() {
    return (dl & 6) === 0 ? (se(0, !1), !1) : !0;
  }
  function Oc() {
    if (ll !== null) {
      if (rl === 0) var l = ll.return;
      else l = ll, qt = ja = null, Vi(l), fu = null, Ku = 0, l = ll;
      for (; l !== null; ) Hs(l.alternate, l), l = l.return;
      ll = null;
    }
  }
  function bu(l, t) {
    var a = l.timeoutHandle;
    a !== -1 && (l.timeoutHandle = -1, lo(a)), a = l.cancelPendingCommit, a !== null && (l.cancelPendingCommit = null, a()), Wt = 0, Oc(), gl = l, ll = a = Bt(l.current, null), ul = t, rl = 0, rt = null, sa = !1, hu = Ou(l, t), pc = !1, yu = ot = Ec = Qa = da = Nl = 0, at = ce = null, Tc = !1, (t & 8) !== 0 && (t |= t & 32);
    var u = l.entangledLanes;
    if (u !== 0) for (l = l.entanglements, u &= t; 0 < u; ) {
      var e = 31 - ct(u), n = 1 << e;
      t |= l[e], u &= ~n;
    }
    return kt = t, Ge(), a;
  }
  function ad(l, t) {
    k = null, D.H = Pu, t === cu || t === we ? (t = z0(), rl = 3) : t === Hi ? (t = z0(), rl = 4) : rl = t === ic ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, rt = t, ll === null && (Nl = 1, fn(l, gt(t, l.current)));
  }
  function ud() {
    var l = dt.current;
    return l === null ? !0 : (ul & 4194048) === ul ? zt === null : (ul & 62914560) === ul || (ul & 536870912) !== 0 ? l === zt : !1;
  }
  function ed() {
    var l = D.H;
    return D.H = Pu, l === null ? Pu : l;
  }
  function nd() {
    var l = D.A;
    return D.A = Rr, l;
  }
  function _n() {
    Nl = 4, sa || (ul & 4194048) !== ul && dt.current !== null || (hu = !0), (da & 134217727) === 0 && (Qa & 134217727) === 0 || gl === null || oa(gl, ul, ot, !1);
  }
  function Dc(l, t, a) {
    var u = dl;
    dl |= 2;
    var e = ed(), n = nd();
    (gl !== l || ul !== t) && (bn = null, bu(l, t)), t = !1;
    var i = Nl;
    l: do
      try {
        if (rl !== 0 && ll !== null) {
          var c = ll, d = rt;
          switch (rl) {
            case 8:
              Oc(), i = 6;
              break l;
            case 3:
            case 2:
            case 9:
            case 6:
              dt.current === null && (t = !0);
              var g = rl;
              if (rl = 0, rt = null, Su(l, c, d, g), a && hu) {
                i = 0;
                break l;
              }
              break;
            default:
              g = rl, rl = 0, rt = null, Su(l, c, d, g);
          }
        }
        Yr(), i = Nl;
        break;
      } catch (E) {
        ad(l, E);
      }
    while (!0);
    return t && l.shellSuspendCounter++, qt = ja = null, dl = u, D.H = e, D.A = n, ll === null && (gl = null, ul = 0, Ge()), i;
  }
  function Yr() {
    for (; ll !== null; ) id(ll);
  }
  function qr(l, t) {
    var a = dl;
    dl |= 2;
    var u = ed(), e = nd();
    gl !== l || ul !== t ? (bn = null, gn = nt() + 500, bu(l, t)) : hu = Ou(l, t);
    l: do
      try {
        if (rl !== 0 && ll !== null) {
          t = ll;
          var n = rt;
          t: switch (rl) {
            case 1:
              rl = 0, rt = null, Su(l, t, n, 1);
              break;
            case 2:
            case 9:
              if (S0(n)) {
                rl = 0, rt = null, cd(t);
                break;
              }
              t = function() {
                rl !== 2 && rl !== 9 || gl !== l || (rl = 7), $t(l);
              }, n.then(t, t);
              break l;
            case 3:
              rl = 7;
              break l;
            case 4:
              rl = 5;
              break l;
            case 7:
              S0(n) ? (rl = 0, rt = null, cd(t)) : (rl = 0, rt = null, Su(l, t, n, 7));
              break;
            case 5:
              var i = null;
              switch (ll.tag) {
                case 26:
                  i = ll.memoizedState;
                case 5:
                case 27:
                  var c = ll;
                  if (i ? wd(i) : c.stateNode.complete) {
                    rl = 0, rt = null;
                    var d = c.sibling;
                    if (d !== null) ll = d;
                    else {
                      var g = c.return;
                      g !== null ? (ll = g, zn(g)) : ll = null;
                    }
                    break t;
                  }
              }
              rl = 0, rt = null, Su(l, t, n, 5);
              break;
            case 6:
              rl = 0, rt = null, Su(l, t, n, 6);
              break;
            case 8:
              Oc(), Nl = 6;
              break l;
            default:
              throw Error(s(462));
          }
        }
        Gr();
        break;
      } catch (E) {
        ad(l, E);
      }
    while (!0);
    return qt = ja = null, D.H = u, D.A = e, dl = a, ll !== null ? 0 : (gl = null, ul = 0, Ge(), Nl);
  }
  function Gr() {
    for (; ll !== null && !yv(); ) id(ll);
  }
  function id(l) {
    var t = js(l.alternate, l, kt);
    l.memoizedProps = l.pendingProps, t === null ? zn(l) : ll = t;
  }
  function cd(l) {
    var t = l, a = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = Ts(a, t, t.pendingProps, t.type, void 0, ul);
        break;
      case 11:
        t = Ts(a, t, t.pendingProps, t.type.render, t.ref, ul);
        break;
      case 5:
        Vi(t);
      default:
        Hs(a, t), t = ll = f0(t, kt), t = js(a, t, kt);
    }
    l.memoizedProps = l.pendingProps, t === null ? zn(l) : ll = t;
  }
  function Su(l, t, a, u) {
    qt = ja = null, Vi(t), fu = null, Ku = 0;
    var e = t.return;
    try {
      if (Nr(l, e, t, a, ul)) {
        Nl = 1, fn(l, gt(a, l.current)), ll = null;
        return;
      }
    } catch (n) {
      if (e !== null) throw ll = e, n;
      Nl = 1, fn(l, gt(a, l.current)), ll = null;
      return;
    }
    t.flags & 32768 ? (il || u === 1 ? l = !0 : hu || (ul & 536870912) !== 0 ? l = !1 : (sa = l = !0, (u === 2 || u === 9 || u === 3 || u === 6) && (u = dt.current, u !== null && u.tag === 13 && (u.flags |= 16384))), fd(t, l)) : zn(t);
  }
  function zn(l) {
    var t = l;
    do {
      if ((t.flags & 32768) !== 0) {
        fd(t, sa);
        return;
      }
      l = t.return;
      var a = jr(t.alternate, t, kt);
      if (a !== null) {
        ll = a;
        return;
      }
      if (t = t.sibling, t !== null) {
        ll = t;
        return;
      }
      ll = t = l;
    } while (t !== null);
    Nl === 0 && (Nl = 5);
  }
  function fd(l, t) {
    do {
      var a = Ur(l.alternate, l);
      if (a !== null) {
        a.flags &= 32767, ll = a;
        return;
      }
      if (a = l.return, a !== null && (a.flags |= 32768, a.subtreeFlags = 0, a.deletions = null), !t && (l = l.sibling, l !== null)) {
        ll = l;
        return;
      }
      ll = l = a;
    } while (l !== null);
    Nl = 6, ll = null;
  }
  function sd(l, t, a, u, e, n, i, c, d) {
    l.cancelPendingCommit = null;
    do
      pn();
    while (Yl !== 0);
    if ((dl & 6) !== 0) throw Error(s(327));
    if (t !== null) {
      if (t === l.current) throw Error(s(177));
      if (n = t.lanes | t.childLanes, n |= gi, Av(l, a, n, i, c, d), l === gl && (ll = gl = null, ul = 0), gu = t, ra = l, Wt = a, Mc = n, Ac = e, Is = u, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (l.callbackNode = null, l.callbackPriority = 0, Lr(pe, function() {
        return md(), null;
      })) : (l.callbackNode = null, l.callbackPriority = 0), u = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || u) {
        u = D.T, D.T = null, e = R.p, R.p = 2, i = dl, dl |= 4;
        try {
          Hr(l, t, a);
        } finally {
          dl = i, R.p = e, D.T = u;
        }
      }
      Yl = 1, dd(), vd(), rd();
    }
  }
  function dd() {
    if (Yl === 1) {
      Yl = 0;
      var l = ra, t = gu, a = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || a) {
        a = D.T, D.T = null;
        var u = R.p;
        R.p = 2;
        var e = dl;
        dl |= 4;
        try {
          Vs(t, l);
          var n = Xc, i = Pf(l.containerInfo), c = n.focusedElem, d = n.selectionRange;
          if (i !== c && c && c.ownerDocument && If(c.ownerDocument.documentElement, c)) {
            if (d !== null && ri(c)) {
              var g = d.start, E = d.end;
              if (E === void 0 && (E = g), "selectionStart" in c) c.selectionStart = g, c.selectionEnd = Math.min(E, c.value.length);
              else {
                var A = c.ownerDocument || document, b = A && A.defaultView || window;
                if (b.getSelection) {
                  var S = b.getSelection(), q = c.textContent.length, w = Math.min(d.start, q), yl = d.end === void 0 ? w : Math.min(d.end, q);
                  !S.extend && w > yl && (i = yl, yl = w, w = i);
                  var m = Ff(c, w), v = Ff(c, yl);
                  if (m && v && (S.rangeCount !== 1 || S.anchorNode !== m.node || S.anchorOffset !== m.offset || S.focusNode !== v.node || S.focusOffset !== v.offset)) {
                    var y = A.createRange();
                    y.setStart(m.node, m.offset), S.removeAllRanges(), w > yl ? (S.addRange(y), S.extend(v.node, v.offset)) : (y.setEnd(v.node, v.offset), S.addRange(y));
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
          Rn = !!Gc, Xc = Gc = null;
        } finally {
          dl = e, R.p = u, D.T = a;
        }
      }
      l.current = t, Yl = 2;
    }
  }
  function vd() {
    if (Yl === 2) {
      Yl = 0;
      var l = ra, t = gu, a = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || a) {
        a = D.T, D.T = null;
        var u = R.p;
        R.p = 2;
        var e = dl;
        dl |= 4;
        try {
          Gs(l, t.alternate, t);
        } finally {
          dl = e, R.p = u, D.T = a;
        }
      }
      Yl = 3;
    }
  }
  function rd() {
    if (Yl === 4 || Yl === 3) {
      Yl = 0, gv();
      var l = ra, t = gu, a = Wt, u = Is;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? Yl = 5 : (Yl = 0, gu = ra = null, od(l, l.pendingLanes));
      var e = l.pendingLanes;
      if (e === 0 && (va = null), wn(a), t = t.stateNode, it && typeof it.onCommitFiberRoot == "function") try {
        it.onCommitFiberRoot(Nu, t, void 0, (t.current.flags & 128) === 128);
      } catch {
      }
      if (u !== null) {
        t = D.T, e = R.p, R.p = 2, D.T = null;
        try {
          for (var n = l.onRecoverableError, i = 0; i < u.length; i++) {
            var c = u[i];
            n(c.value, { componentStack: c.stack });
          }
        } finally {
          D.T = t, R.p = e;
        }
      }
      (Wt & 3) !== 0 && pn(), $t(l), e = l.pendingLanes, (a & 261930) !== 0 && (e & 42) !== 0 ? l === Nc ? fe++ : (fe = 0, Nc = l) : fe = 0, se(0, !1);
    }
  }
  function od(l, t) {
    (l.pooledCacheLanes &= t) === 0 && (t = l.pooledCache, t != null && (l.pooledCache = null, Lu(t)));
  }
  function pn() {
    return dd(), vd(), rd(), md();
  }
  function md() {
    if (Yl !== 5) return !1;
    var l = ra, t = Mc;
    Mc = 0;
    var a = wn(Wt), u = D.T, e = R.p;
    try {
      R.p = 32 > a ? 32 : a, D.T = null, a = Ac, Ac = null;
      var n = ra, i = Wt;
      if (Yl = 0, gu = ra = null, Wt = 0, (dl & 6) !== 0) throw Error(s(331));
      var c = dl;
      if (dl |= 4, Ws(n.current), Js(n, n.current, i, a), dl = c, se(0, !1), it && typeof it.onPostCommitFiberRoot == "function") try {
        it.onPostCommitFiberRoot(Nu, n);
      } catch {
      }
      return !0;
    } finally {
      R.p = e, D.T = u, od(l, t);
    }
  }
  function hd(l, t, a) {
    t = gt(a, t), t = nc(l.stateNode, t, 2), l = Ya(l, t, 2), l !== null && (Ne(l, 2), $t(l));
  }
  function ol(l, t, a) {
    if (l.tag === 3) hd(l, l, a);
    else for (; t !== null; ) {
      if (t.tag === 3) {
        hd(t, l, a);
        break;
      } else if (t.tag === 1) {
        var u = t.stateNode;
        if (typeof t.type.getDerivedStateFromError == "function" || typeof u.componentDidCatch == "function" && (va === null || !va.has(u))) {
          l = gt(a, l), a = ys(2), u = Ya(t, a, 2), u !== null && (gs(a, u, t, l), Ne(u, 2), $t(u));
          break;
        }
      }
      t = t.return;
    }
  }
  function jc(l, t, a) {
    var u = l.pingCache;
    if (u === null) {
      u = l.pingCache = new Cr();
      var e = /* @__PURE__ */ new Set();
      u.set(t, e);
    } else e = u.get(t), e === void 0 && (e = /* @__PURE__ */ new Set(), u.set(t, e));
    e.has(a) || (pc = !0, e.add(a), l = Xr.bind(null, l, t, a), t.then(l, l));
  }
  function Xr(l, t, a) {
    var u = l.pingCache;
    u !== null && u.delete(t), l.pingedLanes |= l.suspendedLanes & a, l.warmLanes &= ~a, gl === l && (ul & a) === a && (Nl === 4 || Nl === 3 && (ul & 62914560) === ul && 300 > nt() - yn ? (dl & 2) === 0 && bu(l, 0) : Ec |= a, yu === ul && (yu = 0)), $t(l);
  }
  function yd(l, t) {
    t === 0 && (t = rf()), l = Na(l, t), l !== null && (Ne(l, t), $t(l));
  }
  function Qr(l) {
    var t = l.memoizedState, a = 0;
    t !== null && (a = t.retryLane), yd(l, a);
  }
  function Zr(l, t) {
    var a = 0;
    switch (l.tag) {
      case 31:
      case 13:
        var u = l.stateNode, e = l.memoizedState;
        e !== null && (a = e.retryLane);
        break;
      case 19:
        u = l.stateNode;
        break;
      case 22:
        u = l.stateNode._retryCache;
        break;
      default:
        throw Error(s(314));
    }
    u !== null && u.delete(t), yd(l, a);
  }
  function Lr(l, t) {
    return Vn(l, t);
  }
  var En = null, _u = null, Uc = !1, Tn = !1, Hc = !1, ma = 0;
  function $t(l) {
    l !== _u && l.next === null && (_u === null ? En = _u = l : _u = _u.next = l), Tn = !0, Uc || (Uc = !0, Kr());
  }
  function se(l, t) {
    if (!Hc && Tn) {
      Hc = !0;
      do
        for (var a = !1, u = En; u !== null; ) {
          if (!t) if (l !== 0) {
            var e = u.pendingLanes;
            if (e === 0) var n = 0;
            else {
              var i = u.suspendedLanes, c = u.pingedLanes;
              n = (1 << 31 - ct(42 | l) + 1) - 1, n &= e & ~(i & ~c), n = n & 201326741 ? n & 201326741 | 1 : n ? n | 2 : 0;
            }
            n !== 0 && (a = !0, _d(u, n));
          } else n = ul, n = Ae(u, u === gl ? n : 0, u.cancelPendingCommit !== null || u.timeoutHandle !== -1), (n & 3) === 0 || Ou(u, n) || (a = !0, _d(u, n));
          u = u.next;
        }
      while (a);
      Hc = !1;
    }
  }
  function Vr() {
    gd();
  }
  function gd() {
    Tn = Uc = !1;
    var l = 0;
    ma !== 0 && Pr() && (l = ma);
    for (var t = nt(), a = null, u = En; u !== null; ) {
      var e = u.next, n = bd(u, t);
      n === 0 ? (u.next = null, a === null ? En = e : a.next = e, e === null && (_u = a)) : (a = u, (l !== 0 || (n & 3) !== 0) && (Tn = !0)), u = e;
    }
    Yl !== 0 && Yl !== 5 || se(l, !1), ma !== 0 && (ma = 0);
  }
  function bd(l, t) {
    for (var a = l.suspendedLanes, u = l.pingedLanes, e = l.expirationTimes, n = l.pendingLanes & -62914561; 0 < n; ) {
      var i = 31 - ct(n), c = 1 << i, d = e[i];
      d === -1 ? ((c & a) === 0 || (c & u) !== 0) && (e[i] = Mv(c, t)) : d <= t && (l.expiredLanes |= c), n &= ~c;
    }
    if (t = gl, a = ul, a = Ae(l, l === t ? a : 0, l.cancelPendingCommit !== null || l.timeoutHandle !== -1), u = l.callbackNode, a === 0 || l === t && (rl === 2 || rl === 9) || l.cancelPendingCommit !== null) return u !== null && u !== null && Kn(u), l.callbackNode = null, l.callbackPriority = 0;
    if ((a & 3) === 0 || Ou(l, a)) {
      if (t = a & -a, t === l.callbackPriority) return t;
      switch (u !== null && Kn(u), wn(a)) {
        case 2:
        case 8:
          a = df;
          break;
        case 32:
          a = pe;
          break;
        case 268435456:
          a = vf;
          break;
        default:
          a = pe;
      }
      return u = Sd.bind(null, l), a = Vn(a, u), l.callbackPriority = t, l.callbackNode = a, t;
    }
    return u !== null && u !== null && Kn(u), l.callbackPriority = 2, l.callbackNode = null, 2;
  }
  function Sd(l, t) {
    if (Yl !== 0 && Yl !== 5) return l.callbackNode = null, l.callbackPriority = 0, null;
    var a = l.callbackNode;
    if (pn() && l.callbackNode !== a) return null;
    var u = ul;
    return u = Ae(l, l === gl ? u : 0, l.cancelPendingCommit !== null || l.timeoutHandle !== -1), u === 0 ? null : (ld(l, u, t), bd(l, nt()), l.callbackNode != null && l.callbackNode === a ? Sd.bind(null, l) : null);
  }
  function _d(l, t) {
    if (pn()) return null;
    ld(l, t, !0);
  }
  function Kr() {
    to(function() {
      (dl & 6) !== 0 ? Vn(sf, Vr) : gd();
    });
  }
  function xc() {
    if (ma === 0) {
      var l = nu;
      l === 0 && (l = Ee, Ee <<= 1, (Ee & 261888) === 0 && (Ee = 256)), ma = l;
    }
    return ma;
  }
  function zd(l) {
    return l == null || typeof l == "symbol" || typeof l == "boolean" ? null : typeof l == "function" ? l : Ue("" + l);
  }
  function pd(l, t) {
    var a = t.ownerDocument.createElement("input");
    return a.name = t.name, a.value = t.value, l.id && a.setAttribute("form", l.id), t.parentNode.insertBefore(a, t), l = new FormData(l), a.parentNode.removeChild(a), l;
  }
  function Jr(l, t, a, u, e) {
    if (t === "submit" && a && a.stateNode === e) {
      var n = zd((e[Fl] || null).action), i = u.submitter;
      i && (t = (t = i[Fl] || null) ? zd(t.formAction) : i.getAttribute("formAction"), t !== null && (n = t, i = null));
      var c = new Ce("action", "action", null, u, e);
      l.push({
        event: c,
        listeners: [{
          instance: null,
          listener: function() {
            if (u.defaultPrevented) {
              if (ma !== 0) {
                var d = i ? pd(e, i) : new FormData(e);
                Pi(a, {
                  pending: !0,
                  data: d,
                  method: e.method,
                  action: n
                }, null, d);
              }
            } else typeof n == "function" && (c.preventDefault(), d = i ? pd(e, i) : new FormData(e), Pi(a, {
              pending: !0,
              data: d,
              method: e.method,
              action: n
            }, n, d));
          },
          currentTarget: e
        }]
      });
    }
  }
  for (var Rc = 0; Rc < yi.length; Rc++) {
    var Cc = yi[Rc];
    Mt(Cc.toLowerCase(), "on" + (Cc[0].toUpperCase() + Cc.slice(1)));
  }
  Mt(a0, "onAnimationEnd"), Mt(u0, "onAnimationIteration"), Mt(e0, "onAnimationStart"), Mt("dblclick", "onDoubleClick"), Mt("focusin", "onFocus"), Mt("focusout", "onBlur"), Mt(cr, "onTransitionRun"), Mt(fr, "onTransitionStart"), Mt(sr, "onTransitionCancel"), Mt(n0, "onTransitionEnd"), Ka("onMouseEnter", ["mouseout", "mouseover"]), Ka("onMouseLeave", ["mouseout", "mouseover"]), Ka("onPointerEnter", ["pointerout", "pointerover"]), Ka("onPointerLeave", ["pointerout", "pointerover"]), Ea("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" ")), Ea("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")), Ea("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]), Ea("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" ")), Ea("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" ")), Ea("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
  var de = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), wr = new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(de));
  function Ed(l, t) {
    t = (t & 4) !== 0;
    for (var a = 0; a < l.length; a++) {
      var u = l[a], e = u.event;
      u = u.listeners;
      l: {
        var n = void 0;
        if (t) for (var i = u.length - 1; 0 <= i; i--) {
          var c = u[i], d = c.instance, g = c.currentTarget;
          if (c = c.listener, d !== n && e.isPropagationStopped()) break l;
          n = c, e.currentTarget = g;
          try {
            n(e);
          } catch (E) {
            qe(E);
          }
          e.currentTarget = null, n = d;
        }
        else for (i = 0; i < u.length; i++) {
          if (c = u[i], d = c.instance, g = c.currentTarget, c = c.listener, d !== n && e.isPropagationStopped()) break l;
          n = c, e.currentTarget = g;
          try {
            n(e);
          } catch (E) {
            qe(E);
          }
          e.currentTarget = null, n = d;
        }
      }
    }
  }
  function tl(l, t) {
    var a = t[kn];
    a === void 0 && (a = t[kn] = /* @__PURE__ */ new Set());
    var u = l + "__bubble";
    a.has(u) || (Md(t, l, 2, !1), a.add(u));
  }
  function Bc(l, t, a) {
    var u = 0;
    t && (u |= 4), Md(a, l, u, t);
  }
  var Mn = "_reactListening" + Math.random().toString(36).slice(2);
  function Td(l) {
    if (!l[Mn]) {
      l[Mn] = !0, _f.forEach(function(a) {
        a !== "selectionchange" && (wr.has(a) || Bc(a, !1, l), Bc(a, !0, l));
      });
      var t = l.nodeType === 9 ? l : l.ownerDocument;
      t === null || t[Mn] || (t[Mn] = !0, Bc("selectionchange", !1, t));
    }
  }
  function Md(l, t, a, u) {
    switch (Id(t)) {
      case 2:
        var e = To;
        break;
      case 8:
        e = Mo;
        break;
      default:
        e = Fc;
    }
    a = e.bind(null, t, a, l), e = void 0, !ui || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (e = !0), u ? e !== void 0 ? l.addEventListener(t, a, {
      capture: !0,
      passive: e
    }) : l.addEventListener(t, a, !0) : e !== void 0 ? l.addEventListener(t, a, { passive: e }) : l.addEventListener(t, a, !1);
  }
  function Yc(l, t, a, u, e) {
    var n = u;
    if ((t & 1) === 0 && (t & 2) === 0 && u !== null) l: for (; ; ) {
      if (u === null) return;
      var i = u.tag;
      if (i === 3 || i === 4) {
        var c = u.stateNode.containerInfo;
        if (c === e) break;
        if (i === 4) for (i = u.return; i !== null; ) {
          var d = i.tag;
          if ((d === 3 || d === 4) && i.stateNode.containerInfo === e) return;
          i = i.return;
        }
        for (; c !== null; ) {
          if (i = Za(c), i === null) return;
          if (d = i.tag, d === 5 || d === 6 || d === 26 || d === 27) {
            u = n = i;
            continue l;
          }
          c = c.parentNode;
        }
      }
      u = u.return;
    }
    Hf(function() {
      var g = n, E = ti(a), A = [];
      l: {
        var b = i0.get(l);
        if (b !== void 0) {
          var S = Ce, q = l;
          switch (l) {
            case "keypress":
              if (xe(a) === 0) break l;
            case "keydown":
            case "keyup":
              S = Vv;
              break;
            case "focusin":
              q = "focus", S = ci;
              break;
            case "focusout":
              q = "blur", S = ci;
              break;
            case "beforeblur":
            case "afterblur":
              S = ci;
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
              S = Cf;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              S = Yv;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              S = Kv;
              break;
            case a0:
            case u0:
            case e0:
              S = qv;
              break;
            case n0:
              S = Jv;
              break;
            case "scroll":
            case "scrollend":
              S = Bv;
              break;
            case "wheel":
              S = wv;
              break;
            case "copy":
            case "cut":
            case "paste":
              S = Gv;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              S = Yf;
              break;
            case "toggle":
            case "beforetoggle":
              S = kv;
          }
          var w = (t & 4) !== 0, yl = !w && (l === "scroll" || l === "scrollend"), m = w ? b !== null ? b + "Capture" : null : b;
          w = [];
          for (var v = g, y; v !== null; ) {
            var T = v;
            if (y = T.stateNode, T = T.tag, T !== 5 && T !== 26 && T !== 27 || y === null || m === null || (T = Hu(v, m), T != null && w.push(ve(v, T, y))), yl) break;
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
          if (b = l === "mouseover" || l === "pointerover", S = l === "mouseout" || l === "pointerout", b && a !== li && (q = a.relatedTarget || a.fromElement) && (Za(q) || q[Du])) break l;
          if ((S || b) && (b = E.window === E ? E : (b = E.ownerDocument) ? b.defaultView || b.parentWindow : window, S ? (q = a.relatedTarget || a.toElement, S = g, q = q ? Za(q) : null, q !== null && (yl = H(q), w = q.tag, q !== yl || w !== 5 && w !== 27 && w !== 6) && (q = null)) : (S = null, q = g), S !== q)) {
            if (w = Cf, T = "onMouseLeave", m = "onMouseEnter", v = "mouse", (l === "pointerout" || l === "pointerover") && (w = Yf, T = "onPointerLeave", m = "onPointerEnter", v = "pointer"), yl = S == null ? b : Uu(S), y = q == null ? b : Uu(q), b = new w(T, v + "leave", S, a, E), b.target = yl, b.relatedTarget = y, T = null, Za(E) === g && (w = new w(m, v + "enter", q, a, E), w.target = y, w.relatedTarget = yl, T = w), yl = T, S && q) t: {
              for (w = kr, m = S, v = q, y = 0, T = m; T; T = w(T)) y++;
              T = 0;
              for (var V = v; V; V = w(V)) T++;
              for (; 0 < y - T; ) m = w(m), y--;
              for (; 0 < T - y; ) v = w(v), T--;
              for (; y--; ) {
                if (m === v || v !== null && m === v.alternate) {
                  w = m;
                  break t;
                }
                m = w(m), v = w(v);
              }
              w = null;
            }
            else w = null;
            S !== null && Ad(A, b, S, w, !1), q !== null && yl !== null && Ad(A, yl, q, w, !0);
          }
        }
        l: {
          if (b = g ? Uu(g) : window, S = b.nodeName && b.nodeName.toLowerCase(), S === "select" || S === "input" && b.type === "file") var fl = Kf;
          else if (Lf(b)) if (Jf) fl = er;
          else {
            fl = ar;
            var X = tr;
          }
          else S = b.nodeName, !S || S.toLowerCase() !== "input" || b.type !== "checkbox" && b.type !== "radio" ? g && Pn(g.elementType) && (fl = Kf) : fl = ur;
          if (fl && (fl = fl(l, g))) {
            Vf(A, fl, a, E);
            break l;
          }
          X && X(l, b, g), l === "focusout" && g && b.type === "number" && g.memoizedProps.value != null && In(b, "number", b.value);
        }
        switch (X = g ? Uu(g) : window, l) {
          case "focusin":
            (Lf(X) || X.contentEditable === "true") && (Fa = X, oi = g, Xu = null);
            break;
          case "focusout":
            Xu = oi = Fa = null;
            break;
          case "mousedown":
            mi = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            mi = !1, l0(A, a, E);
            break;
          case "selectionchange":
            if (ir) break;
          case "keydown":
          case "keyup":
            l0(A, a, E);
        }
        var W;
        if (si) l: {
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
        else $a ? Qf(l, a) && (el = "onCompositionEnd") : l === "keydown" && a.keyCode === 229 && (el = "onCompositionStart");
        el && (qf && a.locale !== "ko" && ($a || el !== "onCompositionStart" ? el === "onCompositionEnd" && $a && (W = xf()) : (la = E, ei = "value" in la ? la.value : la.textContent, $a = !0)), X = An(g, el), 0 < X.length && (el = new Bf(el, l, null, a, E), A.push({
          event: el,
          listeners: X
        }), W ? el.data = W : (W = Zf(a), W !== null && (el.data = W)))), (W = $v ? Fv(l, a) : Iv(l, a)) && (el = An(g, "onBeforeInput"), 0 < el.length && (X = new Bf("onBeforeInput", "beforeinput", null, a, E), A.push({
          event: X,
          listeners: el
        }), X.data = W)), Jr(A, l, g, a, E);
      }
      Ed(A, t);
    });
  }
  function ve(l, t, a) {
    return {
      instance: l,
      listener: t,
      currentTarget: a
    };
  }
  function An(l, t) {
    for (var a = t + "Capture", u = []; l !== null; ) {
      var e = l, n = e.stateNode;
      if (e = e.tag, e !== 5 && e !== 26 && e !== 27 || n === null || (e = Hu(l, a), e != null && u.unshift(ve(l, e, n)), e = Hu(l, t), e != null && u.push(ve(l, e, n))), l.tag === 3) return u;
      l = l.return;
    }
    return [];
  }
  function kr(l) {
    if (l === null) return null;
    do
      l = l.return;
    while (l && l.tag !== 5 && l.tag !== 27);
    return l || null;
  }
  function Ad(l, t, a, u, e) {
    for (var n = t._reactName, i = []; a !== null && a !== u; ) {
      var c = a, d = c.alternate, g = c.stateNode;
      if (c = c.tag, d !== null && d === u) break;
      c !== 5 && c !== 26 && c !== 27 || g === null || (d = g, e ? (g = Hu(a, n), g != null && i.unshift(ve(a, g, d))) : e || (g = Hu(a, n), g != null && i.push(ve(a, g, d)))), a = a.return;
    }
    i.length !== 0 && l.push({
      event: t,
      listeners: i
    });
  }
  var Wr = /\r\n?/g, $r = /\u0000|\uFFFD/g;
  function Nd(l) {
    return (typeof l == "string" ? l : "" + l).replace(Wr, `
`).replace($r, "");
  }
  function Od(l, t) {
    return t = Nd(t), Nd(l) === t;
  }
  function hl(l, t, a, u, e, n) {
    switch (a) {
      case "children":
        typeof u == "string" ? t === "body" || t === "textarea" && u === "" || wa(l, u) : (typeof u == "number" || typeof u == "bigint") && t !== "body" && wa(l, "" + u);
        break;
      case "className":
        De(l, "class", u);
        break;
      case "tabIndex":
        De(l, "tabindex", u);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        De(l, a, u);
        break;
      case "style":
        jf(l, u, n);
        break;
      case "data":
        if (t !== "object") {
          De(l, "data", u);
          break;
        }
      case "src":
      case "href":
        if (u === "" && (t !== "a" || a !== "href")) {
          l.removeAttribute(a);
          break;
        }
        if (u == null || typeof u == "function" || typeof u == "symbol" || typeof u == "boolean") {
          l.removeAttribute(a);
          break;
        }
        u = Ue("" + u), l.setAttribute(a, u);
        break;
      case "action":
      case "formAction":
        if (typeof u == "function") {
          l.setAttribute(a, "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");
          break;
        } else typeof n == "function" && (a === "formAction" ? (t !== "input" && hl(l, t, "name", e.name, e, null), hl(l, t, "formEncType", e.formEncType, e, null), hl(l, t, "formMethod", e.formMethod, e, null), hl(l, t, "formTarget", e.formTarget, e, null)) : (hl(l, t, "encType", e.encType, e, null), hl(l, t, "method", e.method, e, null), hl(l, t, "target", e.target, e, null)));
        if (u == null || typeof u == "symbol" || typeof u == "boolean") {
          l.removeAttribute(a);
          break;
        }
        u = Ue("" + u), l.setAttribute(a, u);
        break;
      case "onClick":
        u != null && (l.onclick = Rt);
        break;
      case "onScroll":
        u != null && tl("scroll", l);
        break;
      case "onScrollEnd":
        u != null && tl("scrollend", l);
        break;
      case "dangerouslySetInnerHTML":
        if (u != null) {
          if (typeof u != "object" || !("__html" in u)) throw Error(s(61));
          if (a = u.__html, a != null) {
            if (e.children != null) throw Error(s(60));
            l.innerHTML = a;
          }
        }
        break;
      case "multiple":
        l.multiple = u && typeof u != "function" && typeof u != "symbol";
        break;
      case "muted":
        l.muted = u && typeof u != "function" && typeof u != "symbol";
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
        if (u == null || typeof u == "function" || typeof u == "boolean" || typeof u == "symbol") {
          l.removeAttribute("xlink:href");
          break;
        }
        a = Ue("" + u), l.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", a);
        break;
      case "contentEditable":
      case "spellCheck":
      case "draggable":
      case "value":
      case "autoReverse":
      case "externalResourcesRequired":
      case "focusable":
      case "preserveAlpha":
        u != null && typeof u != "function" && typeof u != "symbol" ? l.setAttribute(a, "" + u) : l.removeAttribute(a);
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
        u && typeof u != "function" && typeof u != "symbol" ? l.setAttribute(a, "") : l.removeAttribute(a);
        break;
      case "capture":
      case "download":
        u === !0 ? l.setAttribute(a, "") : u !== !1 && u != null && typeof u != "function" && typeof u != "symbol" ? l.setAttribute(a, u) : l.removeAttribute(a);
        break;
      case "cols":
      case "rows":
      case "size":
      case "span":
        u != null && typeof u != "function" && typeof u != "symbol" && !isNaN(u) && 1 <= u ? l.setAttribute(a, u) : l.removeAttribute(a);
        break;
      case "rowSpan":
      case "start":
        u == null || typeof u == "function" || typeof u == "symbol" || isNaN(u) ? l.removeAttribute(a) : l.setAttribute(a, u);
        break;
      case "popover":
        tl("beforetoggle", l), tl("toggle", l), Oe(l, "popover", u);
        break;
      case "xlinkActuate":
        xt(l, "http://www.w3.org/1999/xlink", "xlink:actuate", u);
        break;
      case "xlinkArcrole":
        xt(l, "http://www.w3.org/1999/xlink", "xlink:arcrole", u);
        break;
      case "xlinkRole":
        xt(l, "http://www.w3.org/1999/xlink", "xlink:role", u);
        break;
      case "xlinkShow":
        xt(l, "http://www.w3.org/1999/xlink", "xlink:show", u);
        break;
      case "xlinkTitle":
        xt(l, "http://www.w3.org/1999/xlink", "xlink:title", u);
        break;
      case "xlinkType":
        xt(l, "http://www.w3.org/1999/xlink", "xlink:type", u);
        break;
      case "xmlBase":
        xt(l, "http://www.w3.org/XML/1998/namespace", "xml:base", u);
        break;
      case "xmlLang":
        xt(l, "http://www.w3.org/XML/1998/namespace", "xml:lang", u);
        break;
      case "xmlSpace":
        xt(l, "http://www.w3.org/XML/1998/namespace", "xml:space", u);
        break;
      case "is":
        Oe(l, "is", u);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < a.length) || a[0] !== "o" && a[0] !== "O" || a[1] !== "n" && a[1] !== "N") && (a = Rv.get(a) || a, Oe(l, a, u));
    }
  }
  function qc(l, t, a, u, e, n) {
    switch (a) {
      case "style":
        jf(l, u, n);
        break;
      case "dangerouslySetInnerHTML":
        if (u != null) {
          if (typeof u != "object" || !("__html" in u)) throw Error(s(61));
          if (a = u.__html, a != null) {
            if (e.children != null) throw Error(s(60));
            l.innerHTML = a;
          }
        }
        break;
      case "children":
        typeof u == "string" ? wa(l, u) : (typeof u == "number" || typeof u == "bigint") && wa(l, "" + u);
        break;
      case "onScroll":
        u != null && tl("scroll", l);
        break;
      case "onScrollEnd":
        u != null && tl("scrollend", l);
        break;
      case "onClick":
        u != null && (l.onclick = Rt);
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
        if (!zf.hasOwnProperty(a)) l: {
          if (a[0] === "o" && a[1] === "n" && (e = a.endsWith("Capture"), t = a.slice(2, e ? a.length - 7 : void 0), n = l[Fl] || null, n = n != null ? n[a] : null, typeof n == "function" && l.removeEventListener(t, n, e), typeof u == "function")) {
            typeof n != "function" && n !== null && (a in l ? l[a] = null : l.hasAttribute(a) && l.removeAttribute(a)), l.addEventListener(t, u, e);
            break l;
          }
          a in l ? l[a] = u : u === !0 ? l.setAttribute(a, "") : Oe(l, a, u);
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
        tl("error", l), tl("load", l);
        var u = !1, e = !1, n;
        for (n in a) if (a.hasOwnProperty(n)) {
          var i = a[n];
          if (i != null) switch (n) {
            case "src":
              u = !0;
              break;
            case "srcSet":
              e = !0;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(s(137, t));
            default:
              hl(l, t, n, i, a, null);
          }
        }
        e && hl(l, t, "srcSet", a.srcSet, a, null), u && hl(l, t, "src", a.src, a, null);
        return;
      case "input":
        tl("invalid", l);
        var c = n = i = e = null, d = null, g = null;
        for (u in a) if (a.hasOwnProperty(u)) {
          var E = a[u];
          if (E != null) switch (u) {
            case "name":
              e = E;
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
              hl(l, t, u, E, a, null);
          }
        }
        Af(l, n, c, d, g, i, e, !1);
        return;
      case "select":
        tl("invalid", l), u = i = n = null;
        for (e in a) if (a.hasOwnProperty(e) && (c = a[e], c != null)) switch (e) {
          case "value":
            n = c;
            break;
          case "defaultValue":
            i = c;
            break;
          case "multiple":
            u = c;
          default:
            hl(l, t, e, c, a, null);
        }
        t = n, a = i, l.multiple = !!u, t != null ? Ja(l, !!u, t, !1) : a != null && Ja(l, !!u, a, !0);
        return;
      case "textarea":
        tl("invalid", l), n = e = u = null;
        for (i in a) if (a.hasOwnProperty(i) && (c = a[i], c != null)) switch (i) {
          case "value":
            u = c;
            break;
          case "defaultValue":
            e = c;
            break;
          case "children":
            n = c;
            break;
          case "dangerouslySetInnerHTML":
            if (c != null) throw Error(s(91));
            break;
          default:
            hl(l, t, i, c, a, null);
        }
        Of(l, u, e, n);
        return;
      case "option":
        for (d in a) if (a.hasOwnProperty(d) && (u = a[d], u != null)) switch (d) {
          case "selected":
            l.selected = u && typeof u != "function" && typeof u != "symbol";
            break;
          default:
            hl(l, t, d, u, a, null);
        }
        return;
      case "dialog":
        tl("beforetoggle", l), tl("toggle", l), tl("cancel", l), tl("close", l);
        break;
      case "iframe":
      case "object":
        tl("load", l);
        break;
      case "video":
      case "audio":
        for (u = 0; u < de.length; u++) tl(de[u], l);
        break;
      case "image":
        tl("error", l), tl("load", l);
        break;
      case "details":
        tl("toggle", l);
        break;
      case "embed":
      case "source":
      case "link":
        tl("error", l), tl("load", l);
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
        for (g in a) if (a.hasOwnProperty(g) && (u = a[g], u != null)) switch (g) {
          case "children":
          case "dangerouslySetInnerHTML":
            throw Error(s(137, t));
          default:
            hl(l, t, g, u, a, null);
        }
        return;
      default:
        if (Pn(t)) {
          for (E in a) a.hasOwnProperty(E) && (u = a[E], u !== void 0 && qc(l, t, E, u, a, void 0));
          return;
        }
    }
    for (c in a) a.hasOwnProperty(c) && (u = a[c], u != null && hl(l, t, c, u, a, null));
  }
  function Fr(l, t, a, u) {
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
        var e = null, n = null, i = null, c = null, d = null, g = null, E = null;
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
              u.hasOwnProperty(S) || hl(l, t, S, null, u, A);
          }
        }
        for (var b in u) {
          var S = u[b];
          if (A = a[b], u.hasOwnProperty(b) && (S != null || A != null)) switch (b) {
            case "type":
              n = S;
              break;
            case "name":
              e = S;
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
              S !== A && hl(l, t, b, S, u, A);
          }
        }
        Fn(l, i, c, d, g, E, n, e);
        return;
      case "select":
        S = i = c = b = null;
        for (n in a) if (d = a[n], a.hasOwnProperty(n) && d != null) switch (n) {
          case "value":
            break;
          case "multiple":
            S = d;
          default:
            u.hasOwnProperty(n) || hl(l, t, n, null, u, d);
        }
        for (e in u) if (n = u[e], d = a[e], u.hasOwnProperty(e) && (n != null || d != null)) switch (e) {
          case "value":
            b = n;
            break;
          case "defaultValue":
            c = n;
            break;
          case "multiple":
            i = n;
          default:
            n !== d && hl(l, t, e, n, u, d);
        }
        t = c, a = i, u = S, b != null ? Ja(l, !!a, b, !1) : !!u != !!a && (t != null ? Ja(l, !!a, t, !0) : Ja(l, !!a, a ? [] : "", !1));
        return;
      case "textarea":
        S = b = null;
        for (c in a) if (e = a[c], a.hasOwnProperty(c) && e != null && !u.hasOwnProperty(c)) switch (c) {
          case "value":
            break;
          case "children":
            break;
          default:
            hl(l, t, c, null, u, e);
        }
        for (i in u) if (e = u[i], n = a[i], u.hasOwnProperty(i) && (e != null || n != null)) switch (i) {
          case "value":
            b = e;
            break;
          case "defaultValue":
            S = e;
            break;
          case "children":
            break;
          case "dangerouslySetInnerHTML":
            if (e != null) throw Error(s(91));
            break;
          default:
            e !== n && hl(l, t, i, e, u, n);
        }
        Nf(l, b, S);
        return;
      case "option":
        for (var q in a) if (b = a[q], a.hasOwnProperty(q) && b != null && !u.hasOwnProperty(q)) switch (q) {
          case "selected":
            l.selected = !1;
            break;
          default:
            hl(l, t, q, null, u, b);
        }
        for (d in u) if (b = u[d], S = a[d], u.hasOwnProperty(d) && b !== S && (b != null || S != null)) switch (d) {
          case "selected":
            l.selected = b && typeof b != "function" && typeof b != "symbol";
            break;
          default:
            hl(l, t, d, b, u, S);
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
        for (var w in a) b = a[w], a.hasOwnProperty(w) && b != null && !u.hasOwnProperty(w) && hl(l, t, w, null, u, b);
        for (g in u) if (b = u[g], S = a[g], u.hasOwnProperty(g) && b !== S && (b != null || S != null)) switch (g) {
          case "children":
          case "dangerouslySetInnerHTML":
            if (b != null) throw Error(s(137, t));
            break;
          default:
            hl(l, t, g, b, u, S);
        }
        return;
      default:
        if (Pn(t)) {
          for (var yl in a) b = a[yl], a.hasOwnProperty(yl) && b !== void 0 && !u.hasOwnProperty(yl) && qc(l, t, yl, void 0, u, b);
          for (E in u) b = u[E], S = a[E], !u.hasOwnProperty(E) || b === S || b === void 0 && S === void 0 || qc(l, t, E, b, u, S);
          return;
        }
    }
    for (var m in a) b = a[m], a.hasOwnProperty(m) && b != null && !u.hasOwnProperty(m) && hl(l, t, m, null, u, b);
    for (A in u) b = u[A], S = a[A], !u.hasOwnProperty(A) || b === S || b == null && S == null || hl(l, t, A, b, u, S);
  }
  function Dd(l) {
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
  function Ir() {
    if (typeof performance.getEntriesByType == "function") {
      for (var l = 0, t = 0, a = performance.getEntriesByType("resource"), u = 0; u < a.length; u++) {
        var e = a[u], n = e.transferSize, i = e.initiatorType, c = e.duration;
        if (n && c && Dd(i)) {
          for (i = 0, c = e.responseEnd, u += 1; u < a.length; u++) {
            var d = a[u], g = d.startTime;
            if (g > c) break;
            var E = d.transferSize, A = d.initiatorType;
            E && Dd(A) && (d = d.responseEnd, i += E * (d < c ? 1 : (c - g) / (d - g)));
          }
          if (--u, t += 8 * (n + i) / (e.duration / 1e3), l++, 10 < l) break;
        }
      }
      if (0 < l) return t / l / 1e6;
    }
    return navigator.connection && (l = navigator.connection.downlink, typeof l == "number") ? l : 5;
  }
  var Gc = null, Xc = null;
  function Nn(l) {
    return l.nodeType === 9 ? l : l.ownerDocument;
  }
  function jd(l) {
    switch (l) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function Ud(l, t) {
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
  function Qc(l, t) {
    return l === "textarea" || l === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var Zc = null;
  function Pr() {
    var l = window.event;
    return l && l.type === "popstate" ? l === Zc ? !1 : (Zc = l, !0) : (Zc = null, !1);
  }
  var Hd = typeof setTimeout == "function" ? setTimeout : void 0, lo = typeof clearTimeout == "function" ? clearTimeout : void 0, xd = typeof Promise == "function" ? Promise : void 0, to = typeof queueMicrotask == "function" ? queueMicrotask : typeof xd < "u" ? function(l) {
    return xd.resolve(null).then(l).catch(ao);
  } : Hd;
  function ao(l) {
    setTimeout(function() {
      throw l;
    });
  }
  function ha(l) {
    return l === "head";
  }
  function Rd(l, t) {
    var a = t, u = 0;
    do {
      var e = a.nextSibling;
      if (l.removeChild(a), e && e.nodeType === 8) if (a = e.data, a === "/$" || a === "/&") {
        if (u === 0) {
          l.removeChild(e), Tu(t);
          return;
        }
        u--;
      } else if (a === "$" || a === "$?" || a === "$~" || a === "$!" || a === "&") u++;
      else if (a === "html") re(l.ownerDocument.documentElement);
      else if (a === "head") {
        a = l.ownerDocument.head, re(a);
        for (var n = a.firstChild; n; ) {
          var i = n.nextSibling, c = n.nodeName;
          n[ju] || c === "SCRIPT" || c === "STYLE" || c === "LINK" && n.rel.toLowerCase() === "stylesheet" || a.removeChild(n), n = i;
        }
      } else a === "body" && re(l.ownerDocument.body);
      a = e;
    } while (a);
    Tu(t);
  }
  function Cd(l, t) {
    var a = l;
    l = 0;
    do {
      var u = a.nextSibling;
      if (a.nodeType === 1 ? t ? (a._stashedDisplay = a.style.display, a.style.display = "none") : (a.style.display = a._stashedDisplay || "", a.getAttribute("style") === "" && a.removeAttribute("style")) : a.nodeType === 3 && (t ? (a._stashedText = a.nodeValue, a.nodeValue = "") : a.nodeValue = a._stashedText || ""), u && u.nodeType === 8) if (a = u.data, a === "/$") {
        if (l === 0) break;
        l--;
      } else a !== "$" && a !== "$?" && a !== "$~" && a !== "$!" || l++;
      a = u;
    } while (a);
  }
  function Lc(l) {
    var t = l.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var a = t;
      switch (t = t.nextSibling, a.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          Lc(a), Wn(a);
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
  function uo(l, t, a, u) {
    for (; l.nodeType === 1; ) {
      var e = a;
      if (l.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!u && (l.nodeName !== "INPUT" || l.type !== "hidden")) break;
      } else if (u) {
        if (!l[ju]) switch (t) {
          case "meta":
            if (!l.hasAttribute("itemprop")) break;
            return l;
          case "link":
            if (n = l.getAttribute("rel"), n === "stylesheet" && l.hasAttribute("data-precedence")) break;
            if (n !== e.rel || l.getAttribute("href") !== (e.href == null || e.href === "" ? null : e.href) || l.getAttribute("crossorigin") !== (e.crossOrigin == null ? null : e.crossOrigin) || l.getAttribute("title") !== (e.title == null ? null : e.title)) break;
            return l;
          case "style":
            if (l.hasAttribute("data-precedence")) break;
            return l;
          case "script":
            if (n = l.getAttribute("src"), (n !== (e.src == null ? null : e.src) || l.getAttribute("type") !== (e.type == null ? null : e.type) || l.getAttribute("crossorigin") !== (e.crossOrigin == null ? null : e.crossOrigin)) && n && l.hasAttribute("async") && !l.hasAttribute("itemprop")) break;
            return l;
          default:
            return l;
        }
      } else if (t === "input" && l.type === "hidden") {
        var n = e.name == null ? null : "" + e.name;
        if (e.type === "hidden" && l.getAttribute("name") === n) return l;
      } else return l;
      if (l = Et(l.nextSibling), l === null) break;
    }
    return null;
  }
  function eo(l, t, a) {
    if (t === "") return null;
    for (; l.nodeType !== 3; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !a || (l = Et(l.nextSibling), l === null)) return null;
    return l;
  }
  function Bd(l, t) {
    for (; l.nodeType !== 8; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !t || (l = Et(l.nextSibling), l === null)) return null;
    return l;
  }
  function Vc(l) {
    return l.data === "$?" || l.data === "$~";
  }
  function Kc(l) {
    return l.data === "$!" || l.data === "$?" && l.ownerDocument.readyState !== "loading";
  }
  function no(l, t) {
    var a = l.ownerDocument;
    if (l.data === "$~") l._reactRetry = t;
    else if (l.data !== "$?" || a.readyState !== "loading") t();
    else {
      var u = function() {
        t(), a.removeEventListener("DOMContentLoaded", u);
      };
      a.addEventListener("DOMContentLoaded", u), l._reactRetry = u;
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
  var Jc = null;
  function Yd(l) {
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
  function qd(l) {
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
  function Gd(l, t, a) {
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
  function re(l) {
    for (var t = l.attributes; t.length; ) l.removeAttributeNode(t[0]);
    Wn(l);
  }
  var Tt = /* @__PURE__ */ new Map(), Xd = /* @__PURE__ */ new Set();
  function On(l) {
    return typeof l.getRootNode == "function" ? l.getRootNode() : l.nodeType === 9 ? l : l.ownerDocument;
  }
  var Ft = R.d;
  R.d = {
    f: io,
    r: co,
    D: fo,
    C: so,
    L: vo,
    m: ro,
    X: mo,
    S: oo,
    M: ho
  };
  function io() {
    var l = Ft.f(), t = Sn();
    return l || t;
  }
  function co(l) {
    var t = La(l);
    t !== null && t.tag === 5 && t.type === "form" ? ns(t) : Ft.r(l);
  }
  var zu = typeof document > "u" ? null : document;
  function Qd(l, t, a) {
    var u = zu;
    if (u && typeof t == "string" && t) {
      var e = ht(t);
      e = 'link[rel="' + l + '"][href="' + e + '"]', typeof a == "string" && (e += '[crossorigin="' + a + '"]'), Xd.has(e) || (Xd.add(e), l = {
        rel: l,
        crossOrigin: a,
        href: t
      }, u.querySelector(e) === null && (t = u.createElement("link"), Kl(t, "link", l), Gl(t), u.head.appendChild(t)));
    }
  }
  function fo(l) {
    Ft.D(l), Qd("dns-prefetch", l, null);
  }
  function so(l, t) {
    Ft.C(l, t), Qd("preconnect", l, t);
  }
  function vo(l, t, a) {
    Ft.L(l, t, a);
    var u = zu;
    if (u && l && t) {
      var e = 'link[rel="preload"][as="' + ht(t) + '"]';
      t === "image" && a && a.imageSrcSet ? (e += '[imagesrcset="' + ht(a.imageSrcSet) + '"]', typeof a.imageSizes == "string" && (e += '[imagesizes="' + ht(a.imageSizes) + '"]')) : e += '[href="' + ht(l) + '"]';
      var n = e;
      switch (t) {
        case "style":
          n = pu(l);
          break;
        case "script":
          n = Eu(l);
      }
      Tt.has(n) || (l = B({
        rel: "preload",
        href: t === "image" && a && a.imageSrcSet ? void 0 : l,
        as: t
      }, a), Tt.set(n, l), u.querySelector(e) !== null || t === "style" && u.querySelector(oe(n)) || t === "script" && u.querySelector(me(n)) || (t = u.createElement("link"), Kl(t, "link", l), Gl(t), u.head.appendChild(t)));
    }
  }
  function ro(l, t) {
    Ft.m(l, t);
    var a = zu;
    if (a && l) {
      var u = t && typeof t.as == "string" ? t.as : "script", e = 'link[rel="modulepreload"][as="' + ht(u) + '"][href="' + ht(l) + '"]', n = e;
      switch (u) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          n = Eu(l);
      }
      if (!Tt.has(n) && (l = B({
        rel: "modulepreload",
        href: l
      }, t), Tt.set(n, l), a.querySelector(e) === null)) {
        switch (u) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (a.querySelector(me(n))) return;
        }
        u = a.createElement("link"), Kl(u, "link", l), Gl(u), a.head.appendChild(u);
      }
    }
  }
  function oo(l, t, a) {
    Ft.S(l, t, a);
    var u = zu;
    if (u && l) {
      var e = Va(u).hoistableStyles, n = pu(l);
      t = t || "default";
      var i = e.get(n);
      if (!i) {
        var c = {
          loading: 0,
          preload: null
        };
        if (i = u.querySelector(oe(n))) c.loading = 5;
        else {
          l = B({
            rel: "stylesheet",
            href: l,
            "data-precedence": t
          }, a), (a = Tt.get(n)) && wc(l, a);
          var d = i = u.createElement("link");
          Gl(d), Kl(d, "link", l), d._p = new Promise(function(g, E) {
            d.onload = g, d.onerror = E;
          }), d.addEventListener("load", function() {
            c.loading |= 1;
          }), d.addEventListener("error", function() {
            c.loading |= 2;
          }), c.loading |= 4, Dn(i, t, u);
        }
        i = {
          type: "stylesheet",
          instance: i,
          count: 1,
          state: c
        }, e.set(n, i);
      }
    }
  }
  function mo(l, t) {
    Ft.X(l, t);
    var a = zu;
    if (a && l) {
      var u = Va(a).hoistableScripts, e = Eu(l), n = u.get(e);
      n || (n = a.querySelector(me(e)), n || (l = B({
        src: l,
        async: !0
      }, t), (t = Tt.get(e)) && kc(l, t), n = a.createElement("script"), Gl(n), Kl(n, "link", l), a.head.appendChild(n)), n = {
        type: "script",
        instance: n,
        count: 1,
        state: null
      }, u.set(e, n));
    }
  }
  function ho(l, t) {
    Ft.M(l, t);
    var a = zu;
    if (a && l) {
      var u = Va(a).hoistableScripts, e = Eu(l), n = u.get(e);
      n || (n = a.querySelector(me(e)), n || (l = B({
        src: l,
        async: !0,
        type: "module"
      }, t), (t = Tt.get(e)) && kc(l, t), n = a.createElement("script"), Gl(n), Kl(n, "link", l), a.head.appendChild(n)), n = {
        type: "script",
        instance: n,
        count: 1,
        state: null
      }, u.set(e, n));
    }
  }
  function Zd(l, t, a, u) {
    var e = (e = P.current) ? On(e) : null;
    if (!e) throw Error(s(446));
    switch (l) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof a.precedence == "string" && typeof a.href == "string" ? (t = pu(a.href), a = Va(e).hoistableStyles, u = a.get(t), u || (u = {
          type: "style",
          instance: null,
          count: 0,
          state: null
        }, a.set(t, u)), u) : {
          type: "void",
          instance: null,
          count: 0,
          state: null
        };
      case "link":
        if (a.rel === "stylesheet" && typeof a.href == "string" && typeof a.precedence == "string") {
          l = pu(a.href);
          var n = Va(e).hoistableStyles, i = n.get(l);
          if (i || (e = e.ownerDocument || e, i = {
            type: "stylesheet",
            instance: null,
            count: 0,
            state: {
              loading: 0,
              preload: null
            }
          }, n.set(l, i), (n = e.querySelector(oe(l))) && !n._p && (i.instance = n, i.state.loading = 5), Tt.has(l) || (a = {
            rel: "preload",
            as: "style",
            href: a.href,
            crossOrigin: a.crossOrigin,
            integrity: a.integrity,
            media: a.media,
            hrefLang: a.hrefLang,
            referrerPolicy: a.referrerPolicy
          }, Tt.set(l, a), n || yo(e, l, a, i.state))), t && u === null) throw Error(s(528, ""));
          return i;
        }
        if (t && u !== null) throw Error(s(529, ""));
        return null;
      case "script":
        return t = a.async, a = a.src, typeof a == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Eu(a), a = Va(e).hoistableScripts, u = a.get(t), u || (u = {
          type: "script",
          instance: null,
          count: 0,
          state: null
        }, a.set(t, u)), u) : {
          type: "void",
          instance: null,
          count: 0,
          state: null
        };
      default:
        throw Error(s(444, l));
    }
  }
  function pu(l) {
    return 'href="' + ht(l) + '"';
  }
  function oe(l) {
    return 'link[rel="stylesheet"][' + l + "]";
  }
  function Ld(l) {
    return B({}, l, {
      "data-precedence": l.precedence,
      precedence: null
    });
  }
  function yo(l, t, a, u) {
    l.querySelector('link[rel="preload"][as="style"][' + t + "]") ? u.loading = 1 : (t = l.createElement("link"), u.preload = t, t.addEventListener("load", function() {
      return u.loading |= 1;
    }), t.addEventListener("error", function() {
      return u.loading |= 2;
    }), Kl(t, "link", a), Gl(t), l.head.appendChild(t));
  }
  function Eu(l) {
    return '[src="' + ht(l) + '"]';
  }
  function me(l) {
    return "script[async]" + l;
  }
  function Vd(l, t, a) {
    if (t.count++, t.instance === null) switch (t.type) {
      case "style":
        var u = l.querySelector('style[data-href~="' + ht(a.href) + '"]');
        if (u) return t.instance = u, Gl(u), u;
        var e = B({}, a, {
          "data-href": a.href,
          "data-precedence": a.precedence,
          href: null,
          precedence: null
        });
        return u = (l.ownerDocument || l).createElement("style"), Gl(u), Kl(u, "style", e), Dn(u, a.precedence, l), t.instance = u;
      case "stylesheet":
        e = pu(a.href);
        var n = l.querySelector(oe(e));
        if (n) return t.state.loading |= 4, t.instance = n, Gl(n), n;
        u = Ld(a), (e = Tt.get(e)) && wc(u, e), n = (l.ownerDocument || l).createElement("link"), Gl(n);
        var i = n;
        return i._p = new Promise(function(c, d) {
          i.onload = c, i.onerror = d;
        }), Kl(n, "link", u), t.state.loading |= 4, Dn(n, a.precedence, l), t.instance = n;
      case "script":
        return n = Eu(a.src), (e = l.querySelector(me(n))) ? (t.instance = e, Gl(e), e) : (u = a, (e = Tt.get(n)) && (u = B({}, a), kc(u, e)), l = l.ownerDocument || l, e = l.createElement("script"), Gl(e), Kl(e, "link", u), l.head.appendChild(e), t.instance = e);
      case "void":
        return null;
      default:
        throw Error(s(443, t.type));
    }
    else t.type === "stylesheet" && (t.state.loading & 4) === 0 && (u = t.instance, t.state.loading |= 4, Dn(u, a.precedence, l));
    return t.instance;
  }
  function Dn(l, t, a) {
    for (var u = a.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'), e = u.length ? u[u.length - 1] : null, n = e, i = 0; i < u.length; i++) {
      var c = u[i];
      if (c.dataset.precedence === t) n = c;
      else if (n !== e) break;
    }
    n ? n.parentNode.insertBefore(l, n.nextSibling) : (t = a.nodeType === 9 ? a.head : a, t.insertBefore(l, t.firstChild));
  }
  function wc(l, t) {
    l.crossOrigin ??= t.crossOrigin, l.referrerPolicy ??= t.referrerPolicy, l.title ??= t.title;
  }
  function kc(l, t) {
    l.crossOrigin ??= t.crossOrigin, l.referrerPolicy ??= t.referrerPolicy, l.integrity ??= t.integrity;
  }
  var jn = null;
  function Kd(l, t, a) {
    if (jn === null) {
      var u = /* @__PURE__ */ new Map(), e = jn = /* @__PURE__ */ new Map();
      e.set(a, u);
    } else e = jn, u = e.get(a), u || (u = /* @__PURE__ */ new Map(), e.set(a, u));
    if (u.has(l)) return u;
    for (u.set(l, null), a = a.getElementsByTagName(l), e = 0; e < a.length; e++) {
      var n = a[e];
      if (!(n[ju] || n[Ql] || l === "link" && n.getAttribute("rel") === "stylesheet") && n.namespaceURI !== "http://www.w3.org/2000/svg") {
        var i = n.getAttribute(t) || "";
        i = l + i;
        var c = u.get(i);
        c ? c.push(n) : u.set(i, [n]);
      }
    }
    return u;
  }
  function Jd(l, t, a) {
    l = l.ownerDocument || l, l.head.insertBefore(a, t === "title" ? l.querySelector("head > title") : null);
  }
  function go(l, t, a) {
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
  function wd(l) {
    return !(l.type === "stylesheet" && (l.state.loading & 3) === 0);
  }
  function bo(l, t, a, u) {
    if (a.type === "stylesheet" && (typeof u.media != "string" || matchMedia(u.media).matches !== !1) && (a.state.loading & 4) === 0) {
      if (a.instance === null) {
        var e = pu(u.href), n = t.querySelector(oe(e));
        if (n) {
          t = n._p, t !== null && typeof t == "object" && typeof t.then == "function" && (l.count++, l = Un.bind(l), t.then(l, l)), a.state.loading |= 4, a.instance = n, Gl(n);
          return;
        }
        n = t.ownerDocument || t, u = Ld(u), (e = Tt.get(e)) && wc(u, e), n = n.createElement("link"), Gl(n);
        var i = n;
        i._p = new Promise(function(c, d) {
          i.onload = c, i.onerror = d;
        }), Kl(n, "link", u), a.instance = n;
      }
      l.stylesheets === null && (l.stylesheets = /* @__PURE__ */ new Map()), l.stylesheets.set(a, t), (t = a.state.preload) && (a.state.loading & 3) === 0 && (l.count++, a = Un.bind(l), t.addEventListener("load", a), t.addEventListener("error", a));
    }
  }
  var Wc = 0;
  function So(l, t) {
    return l.stylesheets && l.count === 0 && xn(l, l.stylesheets), 0 < l.count || 0 < l.imgCount ? function(a) {
      var u = setTimeout(function() {
        if (l.stylesheets && xn(l, l.stylesheets), l.unsuspend) {
          var n = l.unsuspend;
          l.unsuspend = null, n();
        }
      }, 6e4 + t);
      0 < l.imgBytes && Wc === 0 && (Wc = 62500 * Ir());
      var e = setTimeout(function() {
        if (l.waitingForImages = !1, l.count === 0 && (l.stylesheets && xn(l, l.stylesheets), l.unsuspend)) {
          var n = l.unsuspend;
          l.unsuspend = null, n();
        }
      }, (l.imgBytes > Wc ? 50 : 800) + t);
      return l.unsuspend = a, function() {
        l.unsuspend = null, clearTimeout(u), clearTimeout(e);
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
    l.stylesheets = null, l.unsuspend !== null && (l.count++, Hn = /* @__PURE__ */ new Map(), t.forEach(_o, l), Hn = null, Un.call(l));
  }
  function _o(l, t) {
    if (!(t.state.loading & 4)) {
      var a = Hn.get(l);
      if (a) var u = a.get(null);
      else {
        a = /* @__PURE__ */ new Map(), Hn.set(l, a);
        for (var e = l.querySelectorAll("link[data-precedence],style[data-precedence]"), n = 0; n < e.length; n++) {
          var i = e[n];
          (i.nodeName === "LINK" || i.getAttribute("media") !== "not all") && (a.set(i.dataset.precedence, i), u = i);
        }
        u && a.set(null, u);
      }
      e = t.instance, i = e.getAttribute("data-precedence"), n = a.get(i) || u, n === u && a.set(null, e), a.set(i, e), this.count++, u = Un.bind(this), e.addEventListener("load", u), e.addEventListener("error", u), n ? n.parentNode.insertBefore(e, n.nextSibling) : (l = l.nodeType === 9 ? l.head : l, l.insertBefore(e, l.firstChild)), t.state.loading |= 4;
    }
  }
  var he = {
    $$typeof: F,
    Provider: null,
    Consumer: null,
    _currentValue: cl,
    _currentValue2: cl,
    _threadCount: 0
  };
  function zo(l, t, a, u, e, n, i, c, d) {
    this.tag = 1, this.containerInfo = l, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Jn(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Jn(0), this.hiddenUpdates = Jn(null), this.identifierPrefix = u, this.onUncaughtError = e, this.onCaughtError = n, this.onRecoverableError = i, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = d, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function po(l, t, a, u, e, n, i, c, d, g, E, A) {
    return l = new zo(l, t, a, i, d, g, E, A, c), t = 1, n === !0 && (t |= 24), n = st(3, null, null, t), l.current = n, n.stateNode = l, t = Di(), t.refCount++, l.pooledCache = t, t.refCount++, n.memoizedState = {
      element: u,
      isDehydrated: a,
      cache: t
    }, xi(n), l;
  }
  function Eo(l) {
    return l ? (l = lu, l) : lu;
  }
  function kd(l, t, a, u, e, n) {
    e = Eo(e), u.context === null ? u.context = e : u.pendingContext = e, u = Ba(t), u.payload = { element: a }, n = n === void 0 ? null : n, n !== null && (u.callback = n), a = Ya(l, u, t), a !== null && (ut(a, l, t), wu(a, l, t));
  }
  function Wd(l, t) {
    if (l = l.memoizedState, l !== null && l.dehydrated !== null) {
      var a = l.retryLane;
      l.retryLane = a !== 0 && a < t ? a : t;
    }
  }
  function $c(l, t) {
    Wd(l, t), (l = l.alternate) && Wd(l, t);
  }
  function $d(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = Na(l, 67108864);
      t !== null && ut(t, l, 67108864), $c(l, 67108864);
    }
  }
  function Fd(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = pt();
      t = yf(t);
      var a = Na(l, t);
      a !== null && ut(a, l, t), $c(l, t);
    }
  }
  var Rn = !0;
  function To(l, t, a, u) {
    var e = D.T;
    D.T = null;
    var n = R.p;
    try {
      R.p = 2, Fc(l, t, a, u);
    } finally {
      R.p = n, D.T = e;
    }
  }
  function Mo(l, t, a, u) {
    var e = D.T;
    D.T = null;
    var n = R.p;
    try {
      R.p = 8, Fc(l, t, a, u);
    } finally {
      R.p = n, D.T = e;
    }
  }
  function Fc(l, t, a, u) {
    if (Rn) {
      var e = Ic(u);
      if (e === null) Yc(l, t, u, Cn, a), Pd(l, u);
      else if (No(e, l, t, a, u)) u.stopPropagation();
      else if (Pd(l, u), t & 4 && -1 < Ao.indexOf(l)) {
        for (; e !== null; ) {
          var n = La(e);
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
                  $t(n), (dl & 6) === 0 && (gn = nt() + 500, se(0, !1));
                }
              }
              break;
            case 31:
            case 13:
              c = Na(n, 2), c !== null && ut(c, n, 2), Sn(), $c(n, 2);
          }
          if (n = Ic(u), n === null && Yc(l, t, u, Cn, a), n === e) break;
          e = n;
        }
        e !== null && u.stopPropagation();
      } else Yc(l, t, u, null, a);
    }
  }
  function Ic(l) {
    return l = ti(l), Pc(l);
  }
  var Cn = null;
  function Pc(l) {
    if (Cn = null, l = Za(l), l !== null) {
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
  function Id(l) {
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
        switch (bv()) {
          case sf:
            return 2;
          case df:
            return 8;
          case pe:
          case Sv:
            return 32;
          case vf:
            return 268435456;
          default:
            return 32;
        }
      default:
        return 32;
    }
  }
  var lf = !1, ya = null, ga = null, ba = null, ye = /* @__PURE__ */ new Map(), ge = /* @__PURE__ */ new Map(), Sa = [], Ao = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");
  function Pd(l, t) {
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
        ye.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        ge.delete(t.pointerId);
    }
  }
  function be(l, t, a, u, e, n) {
    return l === null || l.nativeEvent !== n ? (l = {
      blockedOn: t,
      domEventName: a,
      eventSystemFlags: u,
      nativeEvent: n,
      targetContainers: [e]
    }, t !== null && (t = La(t), t !== null && $d(t)), l) : (l.eventSystemFlags |= u, t = l.targetContainers, e !== null && t.indexOf(e) === -1 && t.push(e), l);
  }
  function No(l, t, a, u, e) {
    switch (t) {
      case "focusin":
        return ya = be(ya, l, t, a, u, e), !0;
      case "dragenter":
        return ga = be(ga, l, t, a, u, e), !0;
      case "mouseover":
        return ba = be(ba, l, t, a, u, e), !0;
      case "pointerover":
        var n = e.pointerId;
        return ye.set(n, be(ye.get(n) || null, l, t, a, u, e)), !0;
      case "gotpointercapture":
        return n = e.pointerId, ge.set(n, be(ge.get(n) || null, l, t, a, u, e)), !0;
    }
    return !1;
  }
  function lv(l) {
    var t = Za(l.target);
    if (t !== null) {
      var a = H(t);
      if (a !== null) {
        if (t = a.tag, t === 13) {
          if (t = M(a), t !== null) {
            l.blockedOn = t, bf(l.priority, function() {
              Fd(a);
            });
            return;
          }
        } else if (t === 31) {
          if (t = U(a), t !== null) {
            l.blockedOn = t, bf(l.priority, function() {
              Fd(a);
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
      var a = Ic(l.nativeEvent);
      if (a === null) {
        a = l.nativeEvent;
        var u = new a.constructor(a.type, a);
        li = u, a.target.dispatchEvent(u), li = null;
      } else return t = La(a), t !== null && $d(t), l.blockedOn = a, !1;
      t.shift();
    }
    return !0;
  }
  function tv(l, t, a) {
    Bn(l) && a.delete(t);
  }
  function Oo() {
    lf = !1, ya !== null && Bn(ya) && (ya = null), ga !== null && Bn(ga) && (ga = null), ba !== null && Bn(ba) && (ba = null), ye.forEach(tv), ge.forEach(tv);
  }
  function Yn(l, t) {
    l.blockedOn === t && (l.blockedOn = null, lf || (lf = !0, o.unstable_scheduleCallback(o.unstable_NormalPriority, Oo)));
  }
  var qn = null;
  function av(l) {
    qn !== l && (qn = l, o.unstable_scheduleCallback(o.unstable_NormalPriority, function() {
      qn === l && (qn = null);
      for (var t = 0; t < l.length; t += 3) {
        var a = l[t], u = l[t + 1], e = l[t + 2];
        if (typeof u != "function") {
          if (Pc(u || a) === null) continue;
          break;
        }
        var n = La(a);
        n !== null && (l.splice(t, 3), t -= 3, Pi(n, {
          pending: !0,
          data: e,
          method: a.method,
          action: u
        }, u, e));
      }
    }));
  }
  function Tu(l) {
    function t(d) {
      return Yn(d, l);
    }
    ya !== null && Yn(ya, l), ga !== null && Yn(ga, l), ba !== null && Yn(ba, l), ye.forEach(t), ge.forEach(t);
    for (var a = 0; a < Sa.length; a++) {
      var u = Sa[a];
      u.blockedOn === l && (u.blockedOn = null);
    }
    for (; 0 < Sa.length && (a = Sa[0], a.blockedOn === null); ) lv(a), a.blockedOn === null && Sa.shift();
    if (a = (l.ownerDocument || l).$$reactFormReplay, a != null) for (u = 0; u < a.length; u += 3) {
      var e = a[u], n = a[u + 1], i = e[Fl] || null;
      if (typeof n == "function") i || av(a);
      else if (i) {
        var c = null;
        if (n && n.hasAttribute("formAction")) {
          if (e = n, i = n[Fl] || null) c = i.formAction;
          else if (Pc(e) !== null) continue;
        } else c = i.action;
        typeof c == "function" ? a[u + 1] = c : (a.splice(u, 3), u -= 3), av(a);
      }
    }
  }
  function Do() {
    function l(n) {
      n.canIntercept && n.info === "react-transition" && n.intercept({
        handler: function() {
          return new Promise(function(i) {
            return e = i;
          });
        },
        focusReset: "manual",
        scroll: "manual"
      });
    }
    function t() {
      e !== null && (e(), e = null), u || setTimeout(a, 20);
    }
    function a() {
      if (!u && !navigation.transition) {
        var n = navigation.currentEntry;
        n && n.url != null && navigation.navigate(n.url, {
          state: n.getState(),
          info: "react-transition",
          history: "replace"
        });
      }
    }
    if (typeof navigation == "object") {
      var u = !1, e = null;
      return navigation.addEventListener("navigate", l), navigation.addEventListener("navigatesuccess", t), navigation.addEventListener("navigateerror", t), setTimeout(a, 100), function() {
        u = !0, navigation.removeEventListener("navigate", l), navigation.removeEventListener("navigatesuccess", t), navigation.removeEventListener("navigateerror", t), e !== null && (e(), e = null);
      };
    }
  }
  function tf(l) {
    this._internalRoot = l;
  }
  af.prototype.render = tf.prototype.render = function(l) {
    var t = this._internalRoot;
    if (t === null) throw Error(s(409));
    var a = t.current;
    kd(a, pt(), l, t, null, null);
  }, af.prototype.unmount = tf.prototype.unmount = function() {
    var l = this._internalRoot;
    if (l !== null) {
      this._internalRoot = null;
      var t = l.containerInfo;
      kd(l.current, 2, null, l, null, null), Sn(), t[Du] = null;
    }
  };
  function af(l) {
    this._internalRoot = l;
  }
  af.prototype.unstable_scheduleHydration = function(l) {
    if (l) {
      var t = gf();
      l = {
        blockedOn: null,
        target: l,
        priority: t
      };
      for (var a = 0; a < Sa.length && t !== 0 && t < Sa[a].priority; a++) ;
      Sa.splice(a, 0, l), a === 0 && lv(l);
    }
  };
  var uv = _.version;
  if (uv !== "19.2.8") throw Error(s(527, uv, "19.2.8"));
  R.findDOMNode = function(l) {
    var t = l._reactInternals;
    if (t === void 0)
      throw typeof l.render == "function" ? Error(s(188)) : (l = Object.keys(l).join(","), Error(s(268, l)));
    return l = p(t), l = l !== null ? Y(l) : null, l = l === null ? null : l.stateNode, l;
  };
  var jo = {
    bundleType: 0,
    version: "19.2.8",
    rendererPackageName: "react-dom",
    currentDispatcherRef: D,
    reconcilerVersion: "19.2.8"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Gn = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Gn.isDisabled && Gn.supportsFiber) try {
      Nu = Gn.inject(jo), it = Gn;
    } catch {
    }
  }
  f.createRoot = function(l, t) {
    if (!j(l)) throw Error(s(299));
    var a = !1, u = "", e = Tr, n = Mr, i = Ar;
    return t != null && (t.unstable_strictMode === !0 && (a = !0), t.identifierPrefix !== void 0 && (u = t.identifierPrefix), t.onUncaughtError !== void 0 && (e = t.onUncaughtError), t.onCaughtError !== void 0 && (n = t.onCaughtError), t.onRecoverableError !== void 0 && (i = t.onRecoverableError)), t = po(l, 1, !1, null, null, a, u, null, e, n, i, Do), l[Du] = t.current, Td(l), new tf(t);
  };
})), Vo = /* @__PURE__ */ Ut(((f, o) => {
  function _() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(_);
      } catch (z) {
        console.error(z);
      }
  }
  _(), o.exports = Lo();
})), Ko = /* @__PURE__ */ Ut(((f) => {
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
})), Jo = /* @__PURE__ */ Ut(((f, o) => {
  o.exports = Ko();
})), wo = Vo(), G = /* @__PURE__ */ Yo(nf()), h = Jo(), ko = 1, dv = (0, G.createContext)(null);
function v1({ knopf: f, children: o }) {
  const [_, z] = (0, G.useState)([]), s = (0, G.useCallback)((M) => (z((U) => [...U, M]), () => z((U) => U.filter((O) => O !== M))), []), j = _.length > 0 ? Math.min(..._) : null, H = (0, G.useMemo)(() => ({
    knopf: f,
    erster: j,
    anmelden: s
  }), [
    f,
    j,
    s
  ]);
  return /* @__PURE__ */ (0, h.jsxs)(dv.Provider, {
    value: H,
    children: [j === null && /* @__PURE__ */ (0, h.jsx)("div", {
      className: "ara-kopf__vorne ara-kopf__vorne--allein",
      children: f
    }), o]
  });
}
function r1({ titel: f, beschreibung: o, werkzeuge: _, aktionen: z, vorne: s, mittig: j = !1, ebene: H = 1 }) {
  const M = H === 2 ? "h2" : "h1", U = (0, G.useRef)(null), O = Wo(U, j), p = (0, G.useContext)(dv), [Y] = (0, G.useState)(() => ko++), B = p?.anmelden, nl = !j && s === void 0 && !!B;
  (0, G.useLayoutEffect)(() => nl && B ? B(Y) : void 0, [
    nl,
    B,
    Y
  ]);
  const $ = j ? null : s !== void 0 ? s : p?.erster === Y ? p.knopf : null;
  return /* @__PURE__ */ (0, h.jsxs)("header", {
    ref: U,
    className: "ara-kopf",
    "data-mittig": j ? "true" : void 0,
    style: O === null ? void 0 : { paddingRight: O },
    children: [
      /* @__PURE__ */ (0, h.jsxs)("div", {
        className: "ara-kopf__text",
        children: [/* @__PURE__ */ (0, h.jsx)(M, {
          className: "ara-kopf__titel",
          children: f
        }), o && /* @__PURE__ */ (0, h.jsx)("p", {
          className: "ara-kopf__satz",
          children: o
        })]
      }),
      !j && (_ || $) && /* @__PURE__ */ (0, h.jsxs)("div", {
        className: "ara-kopf__werkzeuge",
        role: "toolbar",
        "aria-label": `Aktionen: ${f}`,
        children: [
          _,
          _ && $ && /* @__PURE__ */ (0, h.jsx)("span", {
            className: "ara-kopf__trenner",
            "aria-hidden": "true"
          }),
          $ && /* @__PURE__ */ (0, h.jsx)("span", {
            className: "ara-kopf__vorne",
            children: $
          })
        ]
      }),
      z && /* @__PURE__ */ (0, h.jsx)("div", {
        className: "ara-kopf__aktionen",
        children: z
      })
    ]
  });
}
function Wo(f, o) {
  const [_, z] = (0, G.useState)(null);
  return (0, G.useLayoutEffect)(() => {
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
function o1({ symbol: f, beschriftung: o, aktiv: _, type: z = "button", className: s, ...j }) {
  return /* @__PURE__ */ (0, h.jsx)("button", {
    type: z,
    className: s ? `ara-werkzeug ${s}` : "ara-werkzeug",
    "aria-label": o,
    title: o,
    "aria-pressed": _ === void 0 ? void 0 : _,
    ...j,
    children: /* @__PURE__ */ (0, h.jsx)("span", {
      className: "ara-werkzeug__symbol",
      "aria-hidden": "true",
      children: f
    })
  });
}
function m1({ beschriftung: f, dicht: o = !1, children: _ }) {
  return /* @__PURE__ */ (0, h.jsxs)("div", { children: [f && /* @__PURE__ */ (0, h.jsx)("div", {
    className: "ara-liste__beschriftung",
    children: f
  }), /* @__PURE__ */ (0, h.jsx)("ul", {
    className: "ara-liste",
    "data-dicht": o ? "true" : void 0,
    "aria-label": f,
    children: _
  })] });
}
function h1({ titel: f, symbol: o, hinweis: _, unterzeile: z, erklaerung: s, onKlick: j, aktiv: H = !1, kennzeichen: M }) {
  const U = /* @__PURE__ */ (0, h.jsxs)(h.Fragment, { children: [
    o && /* @__PURE__ */ (0, h.jsx)("span", {
      className: "ara-liste__symbol",
      "aria-hidden": "true",
      children: o
    }),
    /* @__PURE__ */ (0, h.jsxs)("span", {
      className: "ara-liste__text",
      children: [/* @__PURE__ */ (0, h.jsx)("span", {
        className: "ara-liste__wort",
        children: f
      }), z && /* @__PURE__ */ (0, h.jsx)("span", {
        className: "ara-liste__unterzeile",
        children: z
      })]
    }),
    _ && /* @__PURE__ */ (0, h.jsx)("span", {
      className: "ara-liste__hinweis",
      children: _
    })
  ] });
  return /* @__PURE__ */ (0, h.jsx)("li", { children: j ? /* @__PURE__ */ (0, h.jsx)("button", {
    type: "button",
    className: "ara-liste__eintrag",
    "data-aktiv": H ? "true" : "false",
    "aria-current": H ? "true" : void 0,
    "data-testid": M,
    title: s,
    onClick: j,
    children: U
  }) : /* @__PURE__ */ (0, h.jsx)("div", {
    className: "ara-liste__eintrag",
    "data-aktiv": H ? "true" : "false",
    "data-testid": M,
    title: s,
    children: U
  }) });
}
function y1({ titel: f, hinweis: o, symbol: _, onKlick: z, kennzeichen: s, children: j }) {
  const H = (f || o) && /* @__PURE__ */ (0, h.jsxs)("div", {
    className: "ara-karte__kopf",
    children: [f && /* @__PURE__ */ (0, h.jsx)("h2", {
      className: "ara-karte__titel",
      children: f
    }), o && /* @__PURE__ */ (0, h.jsx)("span", {
      className: "ara-karte__hinweis",
      children: o
    })]
  }), M = j && /* @__PURE__ */ (0, h.jsx)("div", {
    className: "ara-karte__inhalt",
    children: j
  }), U = _ ? /* @__PURE__ */ (0, h.jsxs)(h.Fragment, { children: [/* @__PURE__ */ (0, h.jsx)("span", {
    className: "ara-karte__symbol",
    "aria-hidden": "true",
    children: _
  }), /* @__PURE__ */ (0, h.jsxs)("div", {
    className: "ara-karte__rumpf",
    children: [H, M]
  })] }) : /* @__PURE__ */ (0, h.jsxs)(h.Fragment, { children: [H, M] });
  return z ? /* @__PURE__ */ (0, h.jsx)("button", {
    type: "button",
    className: "ara-karte",
    "data-symbol": _ ? "" : void 0,
    "data-testid": s,
    onClick: z,
    children: U
  }) : /* @__PURE__ */ (0, h.jsx)("div", {
    className: "ara-karte",
    "data-symbol": _ ? "" : void 0,
    "data-testid": s,
    children: U
  });
}
function g1({ onAbsenden: f, aktionen: o, kennzeichen: _, children: z }) {
  const s = (j) => {
    j.preventDefault(), f?.();
  };
  return /* @__PURE__ */ (0, h.jsxs)("form", {
    className: "ara-formular",
    "data-testid": _,
    onSubmit: s,
    noValidate: !0,
    children: [z, o && /* @__PURE__ */ (0, h.jsx)("div", {
      className: "ara-formular__aktionen",
      children: o
    })]
  });
}
function b1({ kennung: f, beschriftung: o, hinweis: _, children: z }) {
  return /* @__PURE__ */ (0, h.jsxs)("div", {
    className: "ara-feld",
    children: [
      /* @__PURE__ */ (0, h.jsx)("label", {
        className: "ara-feld__beschriftung",
        htmlFor: f,
        children: o
      }),
      z,
      _ && /* @__PURE__ */ (0, h.jsx)("p", {
        className: "ara-feld__hinweis",
        children: _
      })
    ]
  });
}
function Se({ art: f = "still", typ: o = "knopf", onKlick: _, gesperrt: z = !1, kennzeichen: s, beschriftung: j, children: H }) {
  return /* @__PURE__ */ (0, h.jsx)("button", {
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
var vv = {
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
    "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    "M8.5 8.5a5 5 0 0 0 0 7",
    "M15.5 8.5a5 5 0 0 1 0 7"
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
}, S1 = Object.keys(vv);
function Mu({ name: f, groesse: o = 20, titel: _ }) {
  return /* @__PURE__ */ (0, h.jsx)("svg", {
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
    children: vv[f].map((z) => /* @__PURE__ */ (0, h.jsx)("path", { d: z }, z))
  });
}
function $o({ symbol: f, groesse: o = 44, titel: _ }) {
  const z = { "--ara-appicon": `${o}px` };
  return /* @__PURE__ */ (0, h.jsx)("span", {
    className: "ara-appicon",
    style: z,
    "data-groesse": o,
    children: /* @__PURE__ */ (0, h.jsx)(Mu, {
      name: f,
      groesse: o >= 64 || o >= 44 ? 24 : 16,
      titel: _
    })
  });
}
function _1({ als: f = "div", form: o = "karte", kennzeichen: _, className: z, children: s }) {
  return /* @__PURE__ */ (0, h.jsx)(f, {
    className: z ? `ara-glas ${z}` : "ara-glas",
    "data-form": o,
    "data-testid": _,
    children: s
  });
}
function ef({ symbol: f, hinweis: o, art: _ = "glas", groesse: z = 20, aktiv: s, gesperrt: j, onKlick: H, kennzeichen: M }) {
  return /* @__PURE__ */ (0, h.jsx)("button", {
    type: "button",
    className: "ara-iknopf",
    "data-art": _,
    "data-hinweis": o,
    "aria-label": o,
    "aria-pressed": s,
    disabled: j,
    onClick: H,
    "data-testid": M,
    children: /* @__PURE__ */ (0, h.jsx)(Mu, {
      name: f,
      groesse: z
    })
  });
}
function z1({ children: f, symbol: o, typ: _ = "knopf", gesperrt: z, onKlick: s, kennzeichen: j }) {
  return /* @__PURE__ */ (0, h.jsxs)("button", {
    type: _ === "absenden" ? "submit" : "button",
    className: "ara-kapsel",
    disabled: z,
    onClick: s,
    "data-testid": j,
    children: [o && /* @__PURE__ */ (0, h.jsx)(Mu, {
      name: o,
      groesse: 16
    }), f]
  });
}
function Fo({ children: f, hinweis: o, gesperrt: _, onKlick: z, kennzeichen: s }) {
  return /* @__PURE__ */ (0, h.jsx)("button", {
    type: "button",
    className: "ara-textknopf",
    "data-hinweis": o,
    disabled: _,
    onClick: z,
    "data-testid": s,
    children: f
  });
}
var Io = 5e3;
function p1({ art: f = "hinweis", titel: o, kennzeichen: _, beiRueckgaengig: z, frist: s = Io, beiAblauf: j, children: H }) {
  const M = (0, G.useRef)(j);
  M.current = j;
  const U = !!z;
  return (0, G.useEffect)(() => {
    if (!U) return;
    const O = setTimeout(() => M.current?.(), s);
    return () => clearTimeout(O);
  }, [U, s]), /* @__PURE__ */ (0, h.jsxs)("div", {
    className: "ara-meldung",
    "data-art": f,
    "data-rueckgaengig": U ? "true" : void 0,
    "data-testid": _,
    role: f === "fehler" ? "alert" : "status",
    children: [
      /* @__PURE__ */ (0, h.jsxs)("div", {
        className: "ara-meldung__text",
        children: [o && /* @__PURE__ */ (0, h.jsx)("p", {
          className: "ara-meldung__titel",
          children: o
        }), H]
      }),
      z && /* @__PURE__ */ (0, h.jsx)(Fo, {
        hinweis: "Die Handlung zurücknehmen",
        onKlick: z,
        children: "Rückgängig"
      }),
      U && /* @__PURE__ */ (0, h.jsx)("span", {
        className: "ara-meldung__frist",
        style: { animationDuration: `${s}ms` },
        "aria-hidden": "true"
      })
    ]
  });
}
function ev(f) {
  return f ? [...f.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')] : [];
}
function E1({ offen: f, onSchliessen: o, titel: _ = "Menü", kennzeichen: z, children: s }) {
  const j = (0, G.useRef)(null), H = (0, G.useRef)(null);
  return (0, G.useEffect)(() => {
    if (!f) return;
    H.current = document.activeElement;
    const M = (U) => {
      if (U.key === "Escape") {
        o();
        return;
      }
      if (U.key !== "Tab") return;
      const O = ev(j.current);
      if (O.length === 0) return;
      const p = O[0], Y = O[O.length - 1], B = document.activeElement;
      U.shiftKey && (B === p || !j.current?.contains(B)) ? (U.preventDefault(), Y.focus()) : !U.shiftKey && B === Y && (U.preventDefault(), p.focus());
    };
    return document.addEventListener("keydown", M), ev(j.current)[0]?.focus(), () => {
      document.removeEventListener("keydown", M), H.current?.focus?.();
    };
  }, [f, o]), f ? /* @__PURE__ */ (0, h.jsxs)(h.Fragment, { children: [/* @__PURE__ */ (0, h.jsx)("button", {
    type: "button",
    className: "ara-menue__schleier",
    "aria-label": `${_} schließen`,
    onClick: o
  }), /* @__PURE__ */ (0, h.jsxs)("div", {
    className: "ara-menue",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": _,
    "data-testid": z,
    ref: j,
    children: [/* @__PURE__ */ (0, h.jsxs)("div", {
      className: "ara-menue__kopf",
      children: [/* @__PURE__ */ (0, h.jsx)("span", { children: _ }), /* @__PURE__ */ (0, h.jsx)("button", {
        type: "button",
        className: "ara-menue__zu",
        "aria-label": `${_} schließen`,
        onClick: o,
        children: "×"
      })]
    }), /* @__PURE__ */ (0, h.jsx)("div", {
      className: "ara-menue__inhalt",
      children: s
    })]
  })] }) : null;
}
function T1({ links: f, mitte: o, rechts: _, test: z, beschriftung: s = "Kopfleiste", kennzeichen: j }) {
  return /* @__PURE__ */ (0, h.jsxs)("header", {
    className: "ara-glas ara-leiste",
    "data-test": z ? "true" : void 0,
    "data-testid": j,
    "aria-label": s,
    children: [
      /* @__PURE__ */ (0, h.jsx)("div", {
        className: "ara-leiste__links",
        children: f
      }),
      o && /* @__PURE__ */ (0, h.jsx)("div", {
        className: "ara-leiste__mitte",
        children: o
      }),
      /* @__PURE__ */ (0, h.jsx)("div", {
        className: "ara-leiste__rechts",
        children: _
      })
    ]
  });
}
function M1({ beschriftung: f = "Hauptnavigation", kennzeichen: o, children: _ }) {
  const z = (0, G.useRef)(null), [s, j] = (0, G.useState)(null);
  (0, G.useLayoutEffect)(() => {
    const M = () => {
      const O = z.current?.querySelector('[aria-current="page"]'), p = O ? {
        x: O.offsetLeft,
        b: O.offsetWidth
      } : null;
      j((Y) => Y?.x === p?.x && Y?.b === p?.b ? Y : p);
    };
    if (M(), typeof ResizeObserver > "u" || !z.current) return;
    const U = new ResizeObserver(M);
    return U.observe(z.current), () => U.disconnect();
  });
  const H = s ? {
    "--ara-dock-x": `${s.x}px`,
    "--ara-dock-b": `${s.b}px`
  } : void 0;
  return /* @__PURE__ */ (0, h.jsxs)("nav", {
    className: "ara-glas ara-dock",
    "aria-label": f,
    "data-testid": o,
    ref: z,
    style: H,
    children: [s && /* @__PURE__ */ (0, h.jsx)("span", {
      className: "ara-dock__marke",
      "aria-hidden": "true"
    }), _]
  });
}
function A1({ symbol: f, beschriftung: o, aktiv: _, zahl: z, plus: s, onKlick: j, kennzeichen: H }) {
  return /* @__PURE__ */ (0, h.jsxs)("button", {
    type: "button",
    className: "ara-dock__eintrag",
    "data-plus": s ? "true" : void 0,
    "data-hinweis": o,
    "aria-label": z ? `${o}, ${z} offen` : o,
    "aria-current": _ ? "page" : void 0,
    onClick: j,
    "data-testid": H,
    children: [/* @__PURE__ */ (0, h.jsx)(Mu, {
      name: f,
      groesse: s ? 24 : 20
    }), z ? /* @__PURE__ */ (0, h.jsx)("span", {
      className: "ara-dock__zahl",
      children: z > 99 ? "99+" : z
    }) : null]
  });
}
function nv(f) {
  return f ? [...f.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')] : [];
}
function rv(f, o, _, z) {
  (0, G.useEffect)(() => {
    if (!f) return;
    const s = document.activeElement, j = (H) => {
      if (H.key === "Escape") {
        H.stopPropagation(), _();
        return;
      }
      if (H.key !== "Tab") return;
      const M = nv(o.current);
      if (M.length === 0) return;
      const U = M[0], O = M[M.length - 1], p = document.activeElement;
      H.shiftKey && (p === U || !o.current?.contains(p)) ? (H.preventDefault(), O.focus()) : !H.shiftKey && (p === O || !o.current?.contains(p)) && (H.preventDefault(), U.focus());
    };
    return document.addEventListener("keydown", j), (z?.current ?? nv(o.current)[0])?.focus(), () => {
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
  const U = (0, G.useRef)(null), O = (0, G.useRef)(null);
  if (rv(f, U, o, z ? O : void 0), !f) return null;
  const p = (Y) => {
    if (Y.key !== "ArrowDown" && Y.key !== "ArrowUp") return;
    const B = [...U.current?.querySelectorAll("input, .ara-popup__eintrag") ?? []], nl = B[(B.indexOf(document.activeElement) + (Y.key === "ArrowDown" ? 1 : -1) + B.length) % B.length];
    nl && (Y.preventDefault(), nl.focus());
  };
  return /* @__PURE__ */ (0, h.jsxs)(h.Fragment, { children: [/* @__PURE__ */ (0, h.jsx)("button", {
    type: "button",
    tabIndex: -1,
    className: "ara-schleier",
    "aria-label": `${_} schließen`,
    onClick: o
  }), /* @__PURE__ */ (0, h.jsxs)("div", {
    className: "ara-glas ara-popup",
    "data-form": "karte",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": _,
    "data-testid": H,
    ref: U,
    onKeyDown: p,
    children: [z && /* @__PURE__ */ (0, h.jsxs)("label", {
      className: "ara-popup__suche",
      children: [/* @__PURE__ */ (0, h.jsx)(Mu, {
        name: "suche",
        groesse: 20
      }), /* @__PURE__ */ (0, h.jsx)("input", {
        ref: O,
        type: "search",
        value: z.wert,
        placeholder: z.platzhalter ?? "Suchen",
        "aria-label": z.platzhalter ?? "Suchen",
        onChange: (Y) => z.onAendern(Y.target.value)
      })]
    }), /* @__PURE__ */ (0, h.jsx)("div", {
      className: "ara-popup__inhalt",
      children: j ? /* @__PURE__ */ (0, h.jsx)("p", {
        className: "ara-popup__leer",
        children: s
      }) : M
    })]
  })] });
}
function O1({ titel: f, children: o }) {
  return /* @__PURE__ */ (0, h.jsxs)("section", {
    className: "ara-popup__gruppe",
    "aria-label": f,
    children: [/* @__PURE__ */ (0, h.jsx)("h2", {
      className: "ara-popup__gruppentitel",
      children: f
    }), o]
  });
}
function D1({ symbol: f, titel: o, unterzeile: _, kuerzel: z, onWaehlen: s }) {
  return /* @__PURE__ */ (0, h.jsxs)("button", {
    type: "button",
    className: "ara-popup__eintrag",
    onClick: s,
    children: [
      f && /* @__PURE__ */ (0, h.jsx)(Mu, {
        name: f,
        groesse: 20
      }),
      /* @__PURE__ */ (0, h.jsxs)("span", {
        className: "ara-popup__text",
        children: [/* @__PURE__ */ (0, h.jsx)("span", {
          className: "ara-popup__titel",
          children: o
        }), _ && /* @__PURE__ */ (0, h.jsx)("span", {
          className: "ara-popup__unterzeile",
          children: _
        })]
      }),
      z && /* @__PURE__ */ (0, h.jsx)("kbd", {
        className: "ara-popup__kuerzel",
        children: z
      })
    ]
  });
}
var Po = 80;
function j1({ offen: f, onSchliessen: o, art: _ = "blatt", titel: z, aktionen: s, kennzeichen: j, children: H }) {
  const M = (0, G.useRef)(null), U = (0, G.useRef)(null), [O, p] = (0, G.useState)(0);
  if (rv(f, M, o), !f) return null;
  const Y = ($) => {
    U.current = $.clientY, $.currentTarget.setPointerCapture?.($.pointerId);
  }, B = ($) => {
    U.current !== null && p(Math.max(0, $.clientY - U.current));
  }, nl = () => {
    if (U.current === null) return;
    const $ = O > Po;
    U.current = null, p(0), $ && o();
  };
  return /* @__PURE__ */ (0, h.jsxs)(h.Fragment, { children: [_ === "blatt" && /* @__PURE__ */ (0, h.jsx)("button", {
    type: "button",
    tabIndex: -1,
    className: "ara-ebene__schleier",
    "aria-label": `${z} schließen`,
    onClick: o
  }), /* @__PURE__ */ (0, h.jsx)("div", {
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
    children: _ === "blatt" ? /* @__PURE__ */ (0, h.jsxs)(h.Fragment, { children: [
      /* @__PURE__ */ (0, h.jsx)("div", {
        className: "ara-ebene__griff",
        onPointerDown: Y,
        onPointerMove: B,
        onPointerUp: nl,
        onPointerCancel: nl,
        children: /* @__PURE__ */ (0, h.jsx)("span", {})
      }),
      /* @__PURE__ */ (0, h.jsxs)("div", {
        className: "ara-ebene__kopf",
        children: [/* @__PURE__ */ (0, h.jsx)("h2", {
          className: "ara-ebene__titel",
          children: z
        }), /* @__PURE__ */ (0, h.jsx)(ef, {
          symbol: "schliessen",
          hinweis: "Schließen",
          art: "flach",
          onKlick: o
        })]
      }),
      /* @__PURE__ */ (0, h.jsx)("div", {
        className: "ara-ebene__rumpf",
        children: H
      }),
      s && /* @__PURE__ */ (0, h.jsx)("div", {
        className: "ara-ebene__aktionen",
        children: s
      })
    ] }) : /* @__PURE__ */ (0, h.jsxs)(h.Fragment, { children: [/* @__PURE__ */ (0, h.jsx)("div", {
      className: "ara-ebene__x",
      children: /* @__PURE__ */ (0, h.jsx)(ef, {
        symbol: "schliessen",
        hinweis: "Schließen",
        onKlick: o
      })
    }), /* @__PURE__ */ (0, h.jsx)("div", {
      className: "ara-ebene__rumpf",
      "data-vollbild": "true",
      children: H
    })] })
  })] });
}
function U1({ titel: f, symbol: o, werkzeuge: _, zurueck: z, hoehe: s = 420, kennzeichen: j, children: H }) {
  return /* @__PURE__ */ (0, h.jsxs)("section", {
    className: "ara-fenster",
    style: { height: s },
    "aria-label": f,
    "data-testid": j,
    children: [/* @__PURE__ */ (0, h.jsxs)("div", {
      className: "ara-glas ara-fenster__leiste",
      "data-form": "leiste",
      children: [
        z,
        /* @__PURE__ */ (0, h.jsx)($o, {
          symbol: o,
          groesse: 32
        }),
        /* @__PURE__ */ (0, h.jsx)("span", {
          className: "ara-fenster__titel",
          children: f
        }),
        /* @__PURE__ */ (0, h.jsx)("div", {
          className: "ara-fenster__werkzeuge",
          children: _
        })
      ]
    }), /* @__PURE__ */ (0, h.jsx)("div", {
      className: "ara-fenster__inhalt",
      children: H
    })]
  });
}
var H1 = 400, l1 = 4;
function x1({ stufen: f, karten: o, beiVerschieben: _, beiOeffnen: z, beschriftung: s = "Board", kennzeichen: j, leerText: H = "Leer" }) {
  const M = (0, G.useRef)(null), [U, O] = (0, G.useState)(null), [p, Y] = (0, G.useState)(null), [B, nl] = (0, G.useState)({
    x: 0,
    y: 0
  }), $ = (0, G.useRef)(!1), bl = (J, Q) => document.elementFromPoint(J, Q)?.closest("[data-stufe]")?.dataset.stufe ?? null, El = (J, Q) => {
    J.aktiv = !0, O(J.id), Q.currentTarget.setPointerCapture?.(J.pointerId);
  }, wl = (J, Q) => {
    if (Q.button > 0) return;
    const Z = {
      id: J.id,
      pointerId: Q.pointerId,
      art: Q.pointerType,
      x0: Q.clientX,
      y0: Q.clientY,
      aktiv: !1
    };
    if (M.current = Z, Q.pointerType !== "mouse") {
      const K = Q.currentTarget;
      Z.timer = setTimeout(() => {
        M.current === Z && (Z.aktiv = !0, O(Z.id), K.setPointerCapture?.(Z.pointerId));
      }, 400);
    }
  }, Ul = (J) => {
    const Q = M.current;
    if (!Q || Q.pointerId !== J.pointerId) return;
    const Z = J.clientX - Q.x0, K = J.clientY - Q.y0;
    if (!Q.aktiv) {
      Q.art === "mouse" && Math.hypot(Z, K) > l1 ? El(Q, J) : Q.art !== "mouse" && Math.hypot(Z, K) > 10 && (clearTimeout(Q.timer), M.current = null);
      return;
    }
    nl({
      x: Z,
      y: K
    }), Y(bl(J.clientX, J.clientY));
  }, Jl = (J, Q) => {
    const Z = M.current;
    if (!(!Z || Z.pointerId !== Q.pointerId)) {
      if (clearTimeout(Z.timer), M.current = null, Z.aktiv) {
        $.current = !0, setTimeout(() => $.current = !1, 0);
        const K = bl(Q.clientX, Q.clientY), Hl = f.find((kl) => kl.id === K);
        Hl && Hl.id !== J.stufe && _(J, Hl);
      }
      O(null), Y(null), nl({
        x: 0,
        y: 0
      });
    }
  }, F = (J, Q) => {
    if (!Q.altKey || Q.key !== "ArrowLeft" && Q.key !== "ArrowRight") return;
    const Z = f[f.findIndex((K) => K.id === J.stufe) + (Q.key === "ArrowRight" ? 1 : -1)];
    Z && (Q.preventDefault(), _(J, Z));
  };
  return /* @__PURE__ */ (0, h.jsx)("div", {
    className: "ara-board",
    role: "group",
    "aria-label": s,
    "data-testid": j,
    children: f.map((J) => {
      const Q = o.filter((Z) => Z.stufe === J.id);
      return /* @__PURE__ */ (0, h.jsxs)("section", {
        className: "ara-board__stufe",
        "data-stufe": J.id,
        "data-blass": J.blass ? "true" : void 0,
        "data-ziel": p === J.id && U ? "true" : void 0,
        "aria-label": J.titel,
        children: [/* @__PURE__ */ (0, h.jsxs)("h3", {
          className: "ara-board__kopf",
          children: [/* @__PURE__ */ (0, h.jsx)("span", { children: J.titel }), /* @__PURE__ */ (0, h.jsx)("span", {
            className: "ara-board__zaehler",
            children: Q.length
          })]
        }), /* @__PURE__ */ (0, h.jsxs)("div", {
          className: "ara-board__karten",
          children: [Q.length === 0 && /* @__PURE__ */ (0, h.jsx)("p", {
            className: "ara-board__leer",
            children: H
          }), Q.map((Z) => /* @__PURE__ */ (0, h.jsxs)("button", {
            type: "button",
            className: "ara-board__karte",
            "data-zieht": U === Z.id ? "true" : void 0,
            style: U === Z.id ? { transform: `translate(${B.x}px, ${B.y}px)` } : void 0,
            onPointerDown: (K) => wl(Z, K),
            onPointerMove: Ul,
            onPointerUp: (K) => Jl(Z, K),
            onPointerCancel: (K) => Jl(Z, K),
            onKeyDown: (K) => F(Z, K),
            onClick: () => {
              $.current || z?.(Z);
            },
            children: [
              /* @__PURE__ */ (0, h.jsx)("span", {
                className: "ara-board__nummer",
                children: Z.nummer
              }),
              /* @__PURE__ */ (0, h.jsx)("span", {
                className: "ara-board__titel",
                children: Z.titel
              }),
              Z.etikett && /* @__PURE__ */ (0, h.jsx)("span", {
                className: "ara-board__etikett",
                children: Z.etikett
              })
            ]
          }, Z.id))]
        })]
      }, J.id);
    })
  });
}
function R1({ stufen: f, aktuell: o, onWaehlen: _, beschriftung: z = "Stufe" }) {
  return /* @__PURE__ */ (0, h.jsx)("ol", {
    className: "ara-stufen",
    "aria-label": z,
    children: f.map((s, j) => {
      const H = j < o ? "erreicht" : j === o ? "jetzt" : "offen", M = /* @__PURE__ */ (0, h.jsxs)(h.Fragment, { children: [/* @__PURE__ */ (0, h.jsx)("span", {
        className: "ara-stufen__balken",
        "aria-hidden": "true"
      }), /* @__PURE__ */ (0, h.jsx)("span", {
        className: "ara-stufen__name",
        children: s
      })] });
      return /* @__PURE__ */ (0, h.jsx)("li", {
        className: "ara-stufen__stufe",
        "data-zustand": H,
        children: _ ? /* @__PURE__ */ (0, h.jsx)("button", {
          type: "button",
          className: "ara-stufen__knopf",
          "aria-current": j === o ? "step" : void 0,
          onClick: () => _(j),
          children: M
        }) : /* @__PURE__ */ (0, h.jsx)("span", {
          className: "ara-stufen__knopf",
          "aria-current": j === o ? "step" : void 0,
          children: M
        })
      }, s);
    })
  });
}
function ov(f, o, _, z) {
  const s = f.key === "ArrowRight" ? 1 : f.key === "ArrowLeft" ? -1 : 0;
  if (f.key === "Home" || f.key === "End" || s) {
    f.preventDefault();
    const j = o.indexOf(_), H = f.key === "Home" ? 0 : f.key === "End" ? o.length - 1 : (j + s + o.length) % o.length;
    z(o[H]), f.currentTarget.querySelectorAll("[role]")[H]?.focus();
  }
}
function mv(f) {
  const o = (0, G.useRef)(null), [_, z] = (0, G.useState)();
  return (0, G.useLayoutEffect)(() => {
    const s = () => {
      const H = o.current?.querySelector('[aria-selected="true"],[aria-checked="true"]');
      if (!H) return;
      const M = `${H.offsetLeft}px`, U = `${H.offsetWidth}px`;
      z((O) => O && O["--ara-marke-x"] === M && O["--ara-marke-b"] === U ? O : {
        "--ara-marke-x": M,
        "--ara-marke-b": U
      });
    };
    if (s(), typeof ResizeObserver > "u" || !o.current) return;
    const j = new ResizeObserver(s);
    return j.observe(o.current), () => j.disconnect();
  }, [f]), {
    wurzel: o,
    marke: _
  };
}
function C1({ eintraege: f, aktiv: o, onWaehlen: _, beschriftung: z = "Reiter" }) {
  const { wurzel: s, marke: j } = mv(o), H = f.map((M) => M.id);
  return /* @__PURE__ */ (0, h.jsxs)("div", {
    className: "ara-reiter",
    role: "tablist",
    "aria-label": z,
    ref: s,
    style: j,
    onKeyDown: (M) => ov(M, H, o, _),
    children: [f.map((M) => /* @__PURE__ */ (0, h.jsxs)("button", {
      type: "button",
      role: "tab",
      id: `ara-reiter-${M.id}`,
      className: "ara-reiter__knopf",
      "aria-selected": M.id === o,
      tabIndex: M.id === o ? 0 : -1,
      onClick: () => _(M.id),
      children: [M.titel, M.zahl ? /* @__PURE__ */ (0, h.jsx)("span", {
        className: "ara-reiter__zahl",
        children: M.zahl
      }) : null]
    }, M.id)), /* @__PURE__ */ (0, h.jsx)("span", {
      className: "ara-reiter__marke",
      "aria-hidden": "true"
    })]
  });
}
function B1({ eintraege: f, wert: o, onWaehlen: _, beschriftung: z }) {
  const { wurzel: s, marke: j } = mv(o), H = f.map((M) => M.id);
  return /* @__PURE__ */ (0, h.jsxs)("div", {
    className: "ara-segmente",
    role: "radiogroup",
    "aria-label": z,
    ref: s,
    style: j,
    onKeyDown: (M) => ov(M, H, o, _),
    children: [/* @__PURE__ */ (0, h.jsx)("span", {
      className: "ara-segmente__marke",
      "aria-hidden": "true"
    }), f.map((M) => /* @__PURE__ */ (0, h.jsx)("button", {
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
function Y1({ titel: f, unterzeile: o, beiFreigeben: _, beiAblehnen: z, schwelle: s = 0.4, freigebenText: j = "Freigeben", ablehnenText: H = "Ablehnen", kennzeichen: M }) {
  const U = (0, G.useRef)(null), O = (0, G.useRef)(null), [p, Y] = (0, G.useState)(0), [B, nl] = (0, G.useState)(null), $ = (F) => {
    F.button > 0 || F.target.closest("button") || (O.current = {
      x: F.clientX,
      y: F.clientY,
      id: F.pointerId
    });
  }, bl = (F) => {
    const J = O.current;
    if (!J || J.id !== F.pointerId) return;
    const Q = F.clientX - J.x;
    if (Math.abs(Q) < 6 && Math.abs(F.clientY - J.y) > 6) {
      O.current = null;
      return;
    }
    Math.abs(Q) > 6 && F.currentTarget.setPointerCapture?.(F.pointerId), Y(Q);
  }, El = (F) => {
    const J = O.current;
    if (!J || J.id !== F.pointerId) return;
    O.current = null;
    const Q = U.current?.offsetWidth ?? 1;
    if (Math.abs(p) >= Q * s) {
      const Z = p > 0;
      nl(Z ? "frei" : "ab"), Y(Z ? Q : -Q), setTimeout(() => Z ? _() : z(), 160);
    } else Y(0);
  }, wl = p > 0 ? "frei" : p < 0 ? "ab" : null, Ul = U.current?.offsetWidth ?? 1, Jl = Math.abs(p) >= Ul * s;
  return /* @__PURE__ */ (0, h.jsxs)("div", {
    className: "ara-wisch",
    ref: U,
    "data-richtung": wl ?? void 0,
    "data-erreicht": Jl ? "true" : void 0,
    "data-raus": B ?? void 0,
    "data-testid": M,
    children: [/* @__PURE__ */ (0, h.jsxs)("div", {
      className: "ara-wisch__hinten",
      "aria-hidden": "true",
      children: [/* @__PURE__ */ (0, h.jsx)("span", { children: j }), /* @__PURE__ */ (0, h.jsx)("span", { children: H })]
    }), /* @__PURE__ */ (0, h.jsxs)("div", {
      className: "ara-wisch__zeile",
      style: {
        transform: `translateX(${p}px)`,
        transition: O.current ? "none" : void 0
      },
      onPointerDown: $,
      onPointerMove: bl,
      onPointerUp: El,
      onPointerCancel: El,
      children: [/* @__PURE__ */ (0, h.jsxs)("div", {
        className: "ara-wisch__text",
        children: [/* @__PURE__ */ (0, h.jsx)("span", {
          className: "ara-wisch__titel",
          children: f
        }), o && /* @__PURE__ */ (0, h.jsx)("span", {
          className: "ara-wisch__unterzeile",
          children: o
        })]
      }), /* @__PURE__ */ (0, h.jsx)(ef, {
        symbol: "haken",
        hinweis: j,
        art: "flach",
        onKlick: _
      })]
    })]
  });
}
var q1 = 900;
function t1(f = 900) {
  const [o, _] = (0, G.useState)(() => typeof window > "u" || typeof window.matchMedia != "function" ? !1 : window.matchMedia(`(max-width: ${f - 1}px)`).matches);
  return (0, G.useEffect)(() => {
    if (typeof window > "u" || typeof window.matchMedia != "function") return;
    const z = window.matchMedia(`(max-width: ${f - 1}px)`), s = () => _(z.matches);
    return s(), typeof z.addEventListener == "function" ? (z.addEventListener("change", s), () => z.removeEventListener("change", s)) : (z.addListener?.(s), () => z.removeListener?.(s));
  }, [f]), o;
}
var a1 = typeof window > "u" ? G.useEffect : G.useLayoutEffect;
function G1(f) {
  const o = t1(f), [_, z] = (0, G.useState)(null), [s, j] = (0, G.useState)(null), H = (0, G.useCallback)((M) => z(M), []);
  return a1(() => {
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
var X1 = "6.0.0", u1 = 0.25, e1 = 4, n1 = 24;
function iv(f) {
  return Math.min(e1, Math.max(u1, f));
}
var i1 = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/;
function c1(f, o) {
  if (o) return o;
  if (typeof f != "string")
    return f.type === "application/pdf" ? "pdf" : f.type.startsWith("image/") ? "bild" : null;
  if (f.startsWith("data:image/")) return "bild";
  if (f.startsWith("data:application/pdf")) return "pdf";
  const _ = (f.split("?")[0] ?? "").toLowerCase();
  return _.endsWith(".pdf") ? "pdf" : i1.test(_) ? "bild" : null;
}
function _e(f) {
  return new URL("pdf-dateien/" + f, import.meta.url).toString();
}
var cv = null;
function f1() {
  return cv ??= import("./marken-pdf.js").then((f) => (!f.GlobalWorkerOptions.workerSrc && !f.GlobalWorkerOptions.workerPort && (f.GlobalWorkerOptions.workerSrc = _e("pdf.worker.min.js")), f)), cv;
}
var uf = "Das Dokument ließ sich nicht öffnen.", s1 = "Dieses Format kann hier nicht angezeigt werden.";
function d1(f) {
  return f instanceof Error && f.name === "RenderingCancelledException";
}
function Q1({ quelle: f, art: o, name: _, leerHinweis: z = "Kein Dokument ausgewählt.", hoehe: s, kennzeichen: j, className: H }) {
  const [M, U] = G.useState({ stufe: "leer" }), [O, p] = G.useState(1), [Y, B] = G.useState(0), [nl, $] = G.useState(null), [bl, El] = G.useState(!1), [wl, Ul] = G.useState(null), Jl = G.useRef(null), F = G.useRef(null), J = G.useRef(null), Q = G.useRef(null), Z = _ ?? (f instanceof File ? f.name : void 0);
  G.useEffect(() => {
    if (p(1), B(0), $(null), Ul(null), f == null || f === "") {
      U({ stufe: "leer" });
      return;
    }
    const al = c1(f, o);
    if (!al) {
      U({
        stufe: "fehler",
        meldung: s1
      });
      return;
    }
    if (al === "bild") {
      if (typeof f == "string") {
        U({
          stufe: "bild",
          url: f
        });
        return;
      }
      const Tl = URL.createObjectURL(f);
      return U({
        stufe: "bild",
        url: Tl
      }), () => URL.revokeObjectURL(Tl);
    }
    let Ml = !1, ql;
    return U({ stufe: "laden" }), (async () => {
      try {
        const Tl = await f1(), x = typeof f == "string" ? { url: f } : { data: new Uint8Array(await f.arrayBuffer()) };
        if (Ml) return;
        ql = Tl.getDocument({
          ...x,
          cMapUrl: _e("cmaps/"),
          cMapPacked: !0,
          standardFontDataUrl: _e("standard_fonts/"),
          wasmUrl: _e("wasm/"),
          iccUrl: _e("iccs/")
        });
        const D = await ql.promise;
        if (Ml) return;
        B(D.numPages), U({
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
  }, [f, o]), G.useEffect(() => {
    if (M.stufe !== "pdf") return;
    let al = !1, Ml;
    return (async () => {
      try {
        const ql = await M.dokument.getPage(O);
        if (al) return;
        if (nl === null) {
          const R = F.current?.clientWidth ?? 640, cl = ql.getViewport({ scale: 1 });
          $(iv((R - n1) / cl.width));
          return;
        }
        const Tl = J.current;
        if (!Tl) return;
        const x = ql.getViewport({ scale: nl }), D = window.devicePixelRatio || 1;
        Tl.width = Math.floor(x.width * D), Tl.height = Math.floor(x.height * D), Tl.style.width = `${Math.floor(x.width)}px`, Tl.style.height = `${Math.floor(x.height)}px`, Ml = ql.render({
          canvas: Tl,
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
        !al && !d1(ql) && U({
          stufe: "fehler",
          meldung: uf
        });
      }
    })(), () => {
      al = !0, Ml?.cancel();
    };
  }, [
    M,
    O,
    nl
  ]), G.useEffect(() => {
    if (!bl) return;
    const al = (ql) => {
      ql.key === "Escape" && El(!1);
    }, Ml = () => {
      document.fullscreenElement || El(!1);
    };
    return document.addEventListener("keydown", al), document.addEventListener("fullscreenchange", Ml), () => {
      document.removeEventListener("keydown", al), document.removeEventListener("fullscreenchange", Ml);
    };
  }, [bl]);
  const K = () => {
    if (bl) {
      document.fullscreenElement && document.exitFullscreen().catch(() => {
      }), El(!1);
      return;
    }
    El(!0);
    try {
      Jl.current?.requestFullscreen?.().catch(() => {
      });
    } catch {
    }
  }, Hl = () => {
    if (nl !== null) return nl;
    const al = Q.current;
    return al && al.naturalWidth > 0 ? al.clientWidth / al.naturalWidth : 1;
  }, kl = (al) => {
    $(iv(Hl() * al));
  }, Ht = M.stufe === "pdf" || M.stufe === "bild";
  return /* @__PURE__ */ (0, h.jsxs)("div", {
    ref: Jl,
    className: H ? `ara-dokumentanzeige ${H}` : "ara-dokumentanzeige",
    "data-vollbild": bl || void 0,
    "data-testid": j,
    style: s ? { "--ara-dokument-hoehe": s } : void 0,
    role: "group",
    "aria-label": Z ? `Dokument ${Z}` : "Dokumentanzeige",
    children: [Ht && /* @__PURE__ */ (0, h.jsxs)("div", {
      className: "ara-dokumentanzeige__leiste",
      children: [
        /* @__PURE__ */ (0, h.jsx)("span", {
          className: "ara-dokumentanzeige__name",
          title: Z,
          children: Z
        }),
        M.stufe === "pdf" && Y > 1 && /* @__PURE__ */ (0, h.jsxs)("div", {
          className: "ara-dokumentanzeige__gruppe",
          children: [
            /* @__PURE__ */ (0, h.jsx)(Se, {
              beschriftung: "Vorige Seite",
              gesperrt: O <= 1,
              onKlick: () => p((al) => Math.max(1, al - 1)),
              children: "‹"
            }),
            /* @__PURE__ */ (0, h.jsxs)("span", {
              className: "ara-dokumentanzeige__stand",
              "aria-live": "polite",
              children: [
                "Seite ",
                O,
                " von ",
                Y
              ]
            }),
            /* @__PURE__ */ (0, h.jsx)(Se, {
              beschriftung: "Nächste Seite",
              gesperrt: O >= Y,
              onKlick: () => p((al) => Math.min(Y, al + 1)),
              children: "›"
            })
          ]
        }),
        /* @__PURE__ */ (0, h.jsxs)("div", {
          className: "ara-dokumentanzeige__gruppe",
          children: [
            /* @__PURE__ */ (0, h.jsx)(Se, {
              beschriftung: "Verkleinern",
              onKlick: () => kl(0.8),
              children: "−"
            }),
            /* @__PURE__ */ (0, h.jsx)("span", {
              className: "ara-dokumentanzeige__stand",
              children: nl === null ? "passend" : `${Math.round(nl * 100)} %`
            }),
            /* @__PURE__ */ (0, h.jsx)(Se, {
              beschriftung: "Vergrößern",
              onKlick: () => kl(1.25),
              children: "+"
            }),
            /* @__PURE__ */ (0, h.jsx)(Se, {
              beschriftung: bl ? "Vollbild verlassen" : "Vollbild",
              onKlick: K,
              children: /* @__PURE__ */ (0, h.jsx)("svg", {
                viewBox: "0 0 24 24",
                width: "14",
                height: "14",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                "aria-hidden": "true",
                children: /* @__PURE__ */ (0, h.jsx)("path", { d: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" })
              })
            })
          ]
        })
      ]
    }), /* @__PURE__ */ (0, h.jsxs)("div", {
      ref: F,
      className: "ara-dokumentanzeige__flaeche",
      children: [
        M.stufe === "leer" && /* @__PURE__ */ (0, h.jsx)("p", {
          className: "ara-dokumentanzeige__meldung",
          children: z
        }),
        M.stufe === "laden" && /* @__PURE__ */ (0, h.jsxs)("p", {
          className: "ara-dokumentanzeige__meldung",
          role: "status",
          "aria-live": "polite",
          children: [/* @__PURE__ */ (0, h.jsx)("span", {
            className: "ara-dokumentanzeige__kreisel",
            "aria-hidden": "true"
          }), "Wird geladen …"]
        }),
        M.stufe === "fehler" && /* @__PURE__ */ (0, h.jsx)("p", {
          className: "ara-dokumentanzeige__meldung",
          role: "alert",
          children: M.meldung
        }),
        M.stufe === "pdf" && /* @__PURE__ */ (0, h.jsx)("canvas", {
          ref: J,
          className: "ara-dokumentanzeige__seite",
          role: "img",
          "aria-label": Z ? `Seite ${O} von ${Y} aus ${Z}` : `Seite ${O} von ${Y}`
        }),
        M.stufe === "bild" && /* @__PURE__ */ (0, h.jsx)("img", {
          ref: Q,
          src: M.url,
          alt: Z ?? "Bild",
          className: "ara-dokumentanzeige__bild",
          onLoad: (al) => Ul(al.currentTarget.naturalWidth),
          onError: () => U({
            stufe: "fehler",
            meldung: uf
          }),
          style: nl !== null && wl ? {
            width: `${Math.round(wl * nl)}px`,
            maxWidth: "none",
            maxHeight: "none"
          } : void 0
        })
      ]
    })]
  });
}
var Z1 = G.createElement;
function L1(f, o) {
  (0, wo.createRoot)(o).render(f);
}
var V1 = G.Fragment, K1 = G.useEffect, J1 = G.useMemo, w1 = G.useRef, k1 = G.useState;
export {
  $o as AppIcon,
  x1 as Board,
  M1 as Dock,
  A1 as DockEintrag,
  Q1 as Dokumentanzeige,
  j1 as Ebene,
  X1 as FASSUNG,
  b1 as Feld,
  U1 as Fenster,
  g1 as Formular,
  V1 as Fragment,
  _1 as Glas,
  T1 as Glasleiste,
  z1 as Hauptkapsel,
  ef as IconKnopf,
  y1 as Karte,
  Se as Knopf,
  r1 as Kopf,
  v1 as KopfVorne,
  S1 as LINIEN_NAMEN,
  Mu as Linie,
  m1 as Liste,
  h1 as ListenEintrag,
  p1 as Meldung,
  E1 as Menue,
  N1 as Popup,
  D1 as PopupEintrag,
  O1 as PopupGruppe,
  Io as RUECKGAENGIG_FRIST_MS,
  C1 as Reiter,
  q1 as SCHMAL_AB_PX,
  B1 as Segmente,
  R1 as Stufenleiste,
  Fo as TextKnopf,
  o1 as Werkzeug,
  Y1 as Wischzeile,
  H1 as ZIEHEN_NACH_MS,
  Z1 as h,
  L1 as rendern,
  K1 as useEffect,
  J1 as useMemo,
  w1 as useRef,
  G1 as useSchmalerBehaelter,
  t1 as useSchmalesFenster,
  k1 as useState
};
