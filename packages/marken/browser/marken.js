var As = Object.create, n1 = Object.defineProperty, Os = Object.getOwnPropertyDescriptor, Ms = Object.getOwnPropertyNames, Ds = Object.getPrototypeOf, i1 = Object.prototype.hasOwnProperty, Ht = (m, T) => () => (T || (m((T = { exports: {} }).exports, T), m = null), T.exports), Us = (m, T, M, H) => {
  if (T && typeof T == "object" || typeof T == "function")
    for (var s = Ms(T), G = 0, L = s.length, C; G < L; G++)
      C = s[G], !i1.call(m, C) && C !== M && n1(m, C, {
        get: ((Y) => T[Y]).bind(null, C),
        enumerable: !(H = Os(T, C)) || H.enumerable
      });
  return m;
}, ps = (m, T, M) => (M = m != null ? As(Ds(m)) : {}, Us(T || !m || !m.__esModule || !i1.call(m, "default") ? n1(M, "default", {
  value: m,
  enumerable: !0
}) : M, m)), Ns = /* @__PURE__ */ Ht(((m) => {
  var T = Symbol.for("react.transitional.element"), M = Symbol.for("react.portal"), H = Symbol.for("react.fragment"), s = Symbol.for("react.strict_mode"), G = Symbol.for("react.profiler"), L = Symbol.for("react.consumer"), C = Symbol.for("react.context"), Y = Symbol.for("react.forward_ref"), N = Symbol.for("react.suspense"), E = Symbol.for("react.memo"), X = Symbol.for("react.lazy"), R = Symbol.for("react.activity"), ol = Symbol.iterator;
  function gl(d) {
    return d === null || typeof d != "object" ? null : (d = ol && d[ol] || d["@@iterator"], typeof d == "function" ? d : null);
  }
  var Dl = {
    isMounted: function() {
      return !1;
    },
    enqueueForceUpdate: function() {
    },
    enqueueReplaceState: function() {
    },
    enqueueSetState: function() {
    }
  }, Rl = Object.assign, Tt = {};
  function Ll(d, _, U) {
    this.props = d, this.context = _, this.refs = Tt, this.updater = U || Dl;
  }
  Ll.prototype.isReactComponent = {}, Ll.prototype.setState = function(d, _) {
    if (typeof d != "object" && typeof d != "function" && d != null) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
    this.updater.enqueueSetState(this, d, _, "setState");
  }, Ll.prototype.forceUpdate = function(d) {
    this.updater.enqueueForceUpdate(this, d, "forceUpdate");
  };
  function At() {
  }
  At.prototype = Ll.prototype;
  function El(d, _, U) {
    this.props = d, this.context = _, this.refs = Tt, this.updater = U || Dl;
  }
  var wl = El.prototype = new At();
  wl.constructor = El, Rl(wl, Ll.prototype), wl.isPureReactComponent = !0;
  var Vl = Array.isArray;
  function Tl() {
  }
  var ll = {
    H: null,
    A: null,
    T: null,
    S: null
  }, xl = Object.prototype.hasOwnProperty;
  function tt(d, _, U) {
    var q = U.ref;
    return {
      $$typeof: T,
      type: d,
      key: _,
      ref: q !== void 0 ? q : null,
      props: U
    };
  }
  function jt(d, _) {
    return tt(d.type, _, d.props);
  }
  function k(d) {
    return typeof d == "object" && d !== null && d.$$typeof === T;
  }
  function bl(d) {
    var _ = {
      "=": "=0",
      ":": "=2"
    };
    return "$" + d.replace(/[=:]/g, function(U) {
      return _[U];
    });
  }
  var Bl = /\/+/g;
  function rl(d, _) {
    return typeof d == "object" && d !== null && d.key != null ? bl("" + d.key) : _.toString(36);
  }
  function O(d) {
    switch (d.status) {
      case "fulfilled":
        return d.value;
      case "rejected":
        throw d.reason;
      default:
        switch (typeof d.status == "string" ? d.then(Tl, Tl) : (d.status = "pending", d.then(function(_) {
          d.status === "pending" && (d.status = "fulfilled", d.value = _);
        }, function(_) {
          d.status === "pending" && (d.status = "rejected", d.reason = _);
        })), d.status) {
          case "fulfilled":
            return d.value;
          case "rejected":
            throw d.reason;
        }
    }
    throw d;
  }
  function A(d, _, U, q, J) {
    var w = typeof d;
    (w === "undefined" || w === "boolean") && (d = null);
    var nl = !1;
    if (d === null) nl = !0;
    else switch (w) {
      case "bigint":
      case "string":
      case "number":
        nl = !0;
        break;
      case "object":
        switch (d.$$typeof) {
          case T:
          case M:
            nl = !0;
            break;
          case X:
            return nl = d._init, A(nl(d._payload), _, U, q, J);
        }
    }
    if (nl) return J = J(d), nl = q === "" ? "." + rl(d, 0) : q, Vl(J) ? (U = "", nl != null && (U = nl.replace(Bl, "$&/") + "/"), A(J, _, U, "", function(Ou) {
      return Ou;
    })) : J != null && (k(J) && (J = jt(J, U + (J.key == null || d && d.key === J.key ? "" : ("" + J.key).replace(Bl, "$&/") + "/") + nl)), _.push(J)), 1;
    nl = 0;
    var Kl = q === "" ? "." : q + ":";
    if (Vl(d)) for (var Al = 0; Al < d.length; Al++) q = d[Al], w = Kl + rl(q, Al), nl += A(q, _, U, w, J);
    else if (Al = gl(d), typeof Al == "function") for (d = Al.call(d), Al = 0; !(q = d.next()).done; ) q = q.value, w = Kl + rl(q, Al++), nl += A(q, _, U, w, J);
    else if (w === "object") {
      if (typeof d.then == "function") return A(O(d), _, U, q, J);
      throw _ = String(d), Error("Objects are not valid as a React child (found: " + (_ === "[object Object]" ? "object with keys {" + Object.keys(d).join(", ") + "}" : _) + "). If you meant to render a collection of children, use an array instead.");
    }
    return nl;
  }
  function D(d, _, U) {
    if (d == null) return d;
    var q = [], J = 0;
    return A(d, q, "", "", function(w) {
      return _.call(U, w, J++);
    }), q;
  }
  function tl(d) {
    if (d._status === -1) {
      var _ = d._result;
      _ = _(), _.then(function(U) {
        (d._status === 0 || d._status === -1) && (d._status = 1, d._result = U);
      }, function(U) {
        (d._status === 0 || d._status === -1) && (d._status = 2, d._result = U);
      }), d._status === -1 && (d._status = 0, d._result = _);
    }
    if (d._status === 1) return d._result.default;
    throw d._result;
  }
  var sl = typeof reportError == "function" ? reportError : function(d) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var _ = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof d == "object" && d !== null && typeof d.message == "string" ? String(d.message) : String(d),
        error: d
      });
      if (!window.dispatchEvent(_)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", d);
      return;
    }
    console.error(d);
  }, at = {
    map: D,
    forEach: function(d, _, U) {
      D(d, function() {
        _.apply(this, arguments);
      }, U);
    },
    count: function(d) {
      var _ = 0;
      return D(d, function() {
        _++;
      }), _;
    },
    toArray: function(d) {
      return D(d, function(_) {
        return _;
      }) || [];
    },
    only: function(d) {
      if (!k(d)) throw Error("React.Children.only expected to receive a single React element child.");
      return d;
    }
  };
  m.Activity = R, m.Children = at, m.Component = Ll, m.Fragment = H, m.Profiler = G, m.PureComponent = El, m.StrictMode = s, m.Suspense = N, m.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ll, m.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(d) {
      return ll.H.useMemoCache(d);
    }
  }, m.cache = function(d) {
    return function() {
      return d.apply(null, arguments);
    };
  }, m.cacheSignal = function() {
    return null;
  }, m.cloneElement = function(d, _, U) {
    if (d == null) throw Error("The argument must be a React element, but you passed " + d + ".");
    var q = Rl({}, d.props), J = d.key;
    if (_ != null) for (w in _.key !== void 0 && (J = "" + _.key), _) !xl.call(_, w) || w === "key" || w === "__self" || w === "__source" || w === "ref" && _.ref === void 0 || (q[w] = _[w]);
    var w = arguments.length - 2;
    if (w === 1) q.children = U;
    else if (1 < w) {
      for (var nl = Array(w), Kl = 0; Kl < w; Kl++) nl[Kl] = arguments[Kl + 2];
      q.children = nl;
    }
    return tt(d.type, J, q);
  }, m.createContext = function(d) {
    return d = {
      $$typeof: C,
      _currentValue: d,
      _currentValue2: d,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, d.Provider = d, d.Consumer = {
      $$typeof: L,
      _context: d
    }, d;
  }, m.createElement = function(d, _, U) {
    var q, J = {}, w = null;
    if (_ != null) for (q in _.key !== void 0 && (w = "" + _.key), _) xl.call(_, q) && q !== "key" && q !== "__self" && q !== "__source" && (J[q] = _[q]);
    var nl = arguments.length - 2;
    if (nl === 1) J.children = U;
    else if (1 < nl) {
      for (var Kl = Array(nl), Al = 0; Al < nl; Al++) Kl[Al] = arguments[Al + 2];
      J.children = Kl;
    }
    if (d && d.defaultProps) for (q in nl = d.defaultProps, nl) J[q] === void 0 && (J[q] = nl[q]);
    return tt(d, w, J);
  }, m.createRef = function() {
    return { current: null };
  }, m.forwardRef = function(d) {
    return {
      $$typeof: Y,
      render: d
    };
  }, m.isValidElement = k, m.lazy = function(d) {
    return {
      $$typeof: X,
      _payload: {
        _status: -1,
        _result: d
      },
      _init: tl
    };
  }, m.memo = function(d, _) {
    return {
      $$typeof: E,
      type: d,
      compare: _ === void 0 ? null : _
    };
  }, m.startTransition = function(d) {
    var _ = ll.T, U = {};
    ll.T = U;
    try {
      var q = d(), J = ll.S;
      J !== null && J(U, q), typeof q == "object" && q !== null && typeof q.then == "function" && q.then(Tl, sl);
    } catch (w) {
      sl(w);
    } finally {
      _ !== null && U.types !== null && (_.types = U.types), ll.T = _;
    }
  }, m.unstable_useCacheRefresh = function() {
    return ll.H.useCacheRefresh();
  }, m.use = function(d) {
    return ll.H.use(d);
  }, m.useActionState = function(d, _, U) {
    return ll.H.useActionState(d, _, U);
  }, m.useCallback = function(d, _) {
    return ll.H.useCallback(d, _);
  }, m.useContext = function(d) {
    return ll.H.useContext(d);
  }, m.useDebugValue = function() {
  }, m.useDeferredValue = function(d, _) {
    return ll.H.useDeferredValue(d, _);
  }, m.useEffect = function(d, _) {
    return ll.H.useEffect(d, _);
  }, m.useEffectEvent = function(d) {
    return ll.H.useEffectEvent(d);
  }, m.useId = function() {
    return ll.H.useId();
  }, m.useImperativeHandle = function(d, _, U) {
    return ll.H.useImperativeHandle(d, _, U);
  }, m.useInsertionEffect = function(d, _) {
    return ll.H.useInsertionEffect(d, _);
  }, m.useLayoutEffect = function(d, _) {
    return ll.H.useLayoutEffect(d, _);
  }, m.useMemo = function(d, _) {
    return ll.H.useMemo(d, _);
  }, m.useOptimistic = function(d, _) {
    return ll.H.useOptimistic(d, _);
  }, m.useReducer = function(d, _, U) {
    return ll.H.useReducer(d, _, U);
  }, m.useRef = function(d) {
    return ll.H.useRef(d);
  }, m.useState = function(d) {
    return ll.H.useState(d);
  }, m.useSyncExternalStore = function(d, _, U) {
    return ll.H.useSyncExternalStore(d, _, U);
  }, m.useTransition = function() {
    return ll.H.useTransition();
  }, m.version = "19.2.8";
})), uf = /* @__PURE__ */ Ht(((m, T) => {
  T.exports = Ns();
})), Hs = /* @__PURE__ */ Ht(((m) => {
  function T(O, A) {
    var D = O.length;
    O.push(A);
    l: for (; 0 < D; ) {
      var tl = D - 1 >>> 1, sl = O[tl];
      if (0 < s(sl, A)) O[tl] = A, O[D] = sl, D = tl;
      else break l;
    }
  }
  function M(O) {
    return O.length === 0 ? null : O[0];
  }
  function H(O) {
    if (O.length === 0) return null;
    var A = O[0], D = O.pop();
    if (D !== A) {
      O[0] = D;
      l: for (var tl = 0, sl = O.length, at = sl >>> 1; tl < at; ) {
        var d = 2 * (tl + 1) - 1, _ = O[d], U = d + 1, q = O[U];
        if (0 > s(_, D)) U < sl && 0 > s(q, _) ? (O[tl] = q, O[U] = D, tl = U) : (O[tl] = _, O[d] = D, tl = d);
        else if (U < sl && 0 > s(q, D)) O[tl] = q, O[U] = D, tl = U;
        else break l;
      }
    }
    return A;
  }
  function s(O, A) {
    var D = O.sortIndex - A.sortIndex;
    return D !== 0 ? D : O.id - A.id;
  }
  if (m.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
    var G = performance;
    m.unstable_now = function() {
      return G.now();
    };
  } else {
    var L = Date, C = L.now();
    m.unstable_now = function() {
      return L.now() - C;
    };
  }
  var Y = [], N = [], E = 1, X = null, R = 3, ol = !1, gl = !1, Dl = !1, Rl = !1, Tt = typeof setTimeout == "function" ? setTimeout : null, Ll = typeof clearTimeout == "function" ? clearTimeout : null, At = typeof setImmediate < "u" ? setImmediate : null;
  function El(O) {
    for (var A = M(N); A !== null; ) {
      if (A.callback === null) H(N);
      else if (A.startTime <= O) H(N), A.sortIndex = A.expirationTime, T(Y, A);
      else break;
      A = M(N);
    }
  }
  function wl(O) {
    if (Dl = !1, El(O), !gl) if (M(Y) !== null) gl = !0, Vl || (Vl = !0, k());
    else {
      var A = M(N);
      A !== null && rl(wl, A.startTime - O);
    }
  }
  var Vl = !1, Tl = -1, ll = 5, xl = -1;
  function tt() {
    return Rl ? !0 : !(m.unstable_now() - xl < ll);
  }
  function jt() {
    if (Rl = !1, Vl) {
      var O = m.unstable_now();
      xl = O;
      var A = !0;
      try {
        l: {
          gl = !1, Dl && (Dl = !1, Ll(Tl), Tl = -1), ol = !0;
          var D = R;
          try {
            t: {
              for (El(O), X = M(Y); X !== null && !(X.expirationTime > O && tt()); ) {
                var tl = X.callback;
                if (typeof tl == "function") {
                  X.callback = null, R = X.priorityLevel;
                  var sl = tl(X.expirationTime <= O);
                  if (O = m.unstable_now(), typeof sl == "function") {
                    X.callback = sl, El(O), A = !0;
                    break t;
                  }
                  X === M(Y) && H(Y), El(O);
                } else H(Y);
                X = M(Y);
              }
              if (X !== null) A = !0;
              else {
                var at = M(N);
                at !== null && rl(wl, at.startTime - O), A = !1;
              }
            }
            break l;
          } finally {
            X = null, R = D, ol = !1;
          }
          A = void 0;
        }
      } finally {
        A ? k() : Vl = !1;
      }
    }
  }
  var k;
  if (typeof At == "function") k = function() {
    At(jt);
  };
  else if (typeof MessageChannel < "u") {
    var bl = new MessageChannel(), Bl = bl.port2;
    bl.port1.onmessage = jt, k = function() {
      Bl.postMessage(null);
    };
  } else k = function() {
    Tt(jt, 0);
  };
  function rl(O, A) {
    Tl = Tt(function() {
      O(m.unstable_now());
    }, A);
  }
  m.unstable_IdlePriority = 5, m.unstable_ImmediatePriority = 1, m.unstable_LowPriority = 4, m.unstable_NormalPriority = 3, m.unstable_Profiling = null, m.unstable_UserBlockingPriority = 2, m.unstable_cancelCallback = function(O) {
    O.callback = null;
  }, m.unstable_forceFrameRate = function(O) {
    0 > O || 125 < O ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : ll = 0 < O ? Math.floor(1e3 / O) : 5;
  }, m.unstable_getCurrentPriorityLevel = function() {
    return R;
  }, m.unstable_next = function(O) {
    switch (R) {
      case 1:
      case 2:
      case 3:
        var A = 3;
        break;
      default:
        A = R;
    }
    var D = R;
    R = A;
    try {
      return O();
    } finally {
      R = D;
    }
  }, m.unstable_requestPaint = function() {
    Rl = !0;
  }, m.unstable_runWithPriority = function(O, A) {
    switch (O) {
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
        break;
      default:
        O = 3;
    }
    var D = R;
    R = O;
    try {
      return A();
    } finally {
      R = D;
    }
  }, m.unstable_scheduleCallback = function(O, A, D) {
    var tl = m.unstable_now();
    switch (typeof D == "object" && D !== null ? (D = D.delay, D = typeof D == "number" && 0 < D ? tl + D : tl) : D = tl, O) {
      case 1:
        var sl = -1;
        break;
      case 2:
        sl = 250;
        break;
      case 5:
        sl = 1073741823;
        break;
      case 4:
        sl = 1e4;
        break;
      default:
        sl = 5e3;
    }
    return sl = D + sl, O = {
      id: E++,
      callback: A,
      priorityLevel: O,
      startTime: D,
      expirationTime: sl,
      sortIndex: -1
    }, D > tl ? (O.sortIndex = D, T(N, O), M(Y) === null && O === M(N) && (Dl ? (Ll(Tl), Tl = -1) : Dl = !0, rl(wl, D - tl))) : (O.sortIndex = sl, T(Y, O), gl || ol || (gl = !0, Vl || (Vl = !0, k()))), O;
  }, m.unstable_shouldYield = tt, m.unstable_wrapCallback = function(O) {
    var A = R;
    return function() {
      var D = R;
      R = A;
      try {
        return O.apply(this, arguments);
      } finally {
        R = D;
      }
    };
  };
})), js = /* @__PURE__ */ Ht(((m, T) => {
  T.exports = Hs();
})), Rs = /* @__PURE__ */ Ht(((m) => {
  var T = uf();
  function M(N) {
    var E = "https://react.dev/errors/" + N;
    if (1 < arguments.length) {
      E += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var X = 2; X < arguments.length; X++) E += "&args[]=" + encodeURIComponent(arguments[X]);
    }
    return "Minified React error #" + N + "; visit " + E + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function H() {
  }
  var s = {
    d: {
      f: H,
      r: function() {
        throw Error(M(522));
      },
      D: H,
      C: H,
      L: H,
      m: H,
      X: H,
      S: H,
      M: H
    },
    p: 0,
    findDOMNode: null
  }, G = Symbol.for("react.portal");
  function L(N, E, X) {
    var R = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: G,
      key: R == null ? null : "" + R,
      children: N,
      containerInfo: E,
      implementation: X
    };
  }
  var C = T.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function Y(N, E) {
    if (N === "font") return "";
    if (typeof E == "string") return E === "use-credentials" ? E : "";
  }
  m.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = s, m.createPortal = function(N, E) {
    var X = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!E || E.nodeType !== 1 && E.nodeType !== 9 && E.nodeType !== 11) throw Error(M(299));
    return L(N, E, null, X);
  }, m.flushSync = function(N) {
    var E = C.T, X = s.p;
    try {
      if (C.T = null, s.p = 2, N) return N();
    } finally {
      C.T = E, s.p = X, s.d.f();
    }
  }, m.preconnect = function(N, E) {
    typeof N == "string" && (E ? (E = E.crossOrigin, E = typeof E == "string" ? E === "use-credentials" ? E : "" : void 0) : E = null, s.d.C(N, E));
  }, m.prefetchDNS = function(N) {
    typeof N == "string" && s.d.D(N);
  }, m.preinit = function(N, E) {
    if (typeof N == "string" && E && typeof E.as == "string") {
      var X = E.as, R = Y(X, E.crossOrigin), ol = typeof E.integrity == "string" ? E.integrity : void 0, gl = typeof E.fetchPriority == "string" ? E.fetchPriority : void 0;
      X === "style" ? s.d.S(N, typeof E.precedence == "string" ? E.precedence : void 0, {
        crossOrigin: R,
        integrity: ol,
        fetchPriority: gl
      }) : X === "script" && s.d.X(N, {
        crossOrigin: R,
        integrity: ol,
        fetchPriority: gl,
        nonce: typeof E.nonce == "string" ? E.nonce : void 0
      });
    }
  }, m.preinitModule = function(N, E) {
    if (typeof N == "string") if (typeof E == "object" && E !== null) {
      if (E.as == null || E.as === "script") {
        var X = Y(E.as, E.crossOrigin);
        s.d.M(N, {
          crossOrigin: X,
          integrity: typeof E.integrity == "string" ? E.integrity : void 0,
          nonce: typeof E.nonce == "string" ? E.nonce : void 0
        });
      }
    } else E ?? s.d.M(N);
  }, m.preload = function(N, E) {
    if (typeof N == "string" && typeof E == "object" && E !== null && typeof E.as == "string") {
      var X = E.as, R = Y(X, E.crossOrigin);
      s.d.L(N, X, {
        crossOrigin: R,
        integrity: typeof E.integrity == "string" ? E.integrity : void 0,
        nonce: typeof E.nonce == "string" ? E.nonce : void 0,
        type: typeof E.type == "string" ? E.type : void 0,
        fetchPriority: typeof E.fetchPriority == "string" ? E.fetchPriority : void 0,
        referrerPolicy: typeof E.referrerPolicy == "string" ? E.referrerPolicy : void 0,
        imageSrcSet: typeof E.imageSrcSet == "string" ? E.imageSrcSet : void 0,
        imageSizes: typeof E.imageSizes == "string" ? E.imageSizes : void 0,
        media: typeof E.media == "string" ? E.media : void 0
      });
    }
  }, m.preloadModule = function(N, E) {
    if (typeof N == "string") if (E) {
      var X = Y(E.as, E.crossOrigin);
      s.d.m(N, {
        as: typeof E.as == "string" && E.as !== "script" ? E.as : void 0,
        crossOrigin: X,
        integrity: typeof E.integrity == "string" ? E.integrity : void 0
      });
    } else s.d.m(N);
  }, m.requestFormReset = function(N) {
    s.d.r(N);
  }, m.unstable_batchedUpdates = function(N, E) {
    return N(E);
  }, m.useFormState = function(N, E, X) {
    return C.H.useFormState(N, E, X);
  }, m.useFormStatus = function() {
    return C.H.useHostTransitionStatus();
  }, m.version = "19.2.8";
})), Bs = /* @__PURE__ */ Ht(((m, T) => {
  function M() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(M);
      } catch (H) {
        console.error(H);
      }
  }
  M(), T.exports = Rs();
})), Cs = /* @__PURE__ */ Ht(((m) => {
  var T = js(), M = uf(), H = Bs();
  function s(l) {
    var t = "https://react.dev/errors/" + l;
    if (1 < arguments.length) {
      t += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var a = 2; a < arguments.length; a++) t += "&args[]=" + encodeURIComponent(arguments[a]);
    }
    return "Minified React error #" + l + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function G(l) {
    return !(!l || l.nodeType !== 1 && l.nodeType !== 9 && l.nodeType !== 11);
  }
  function L(l) {
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
  function C(l) {
    if (l.tag === 13) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function Y(l) {
    if (l.tag === 31) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function N(l) {
    if (L(l) !== l) throw Error(s(188));
  }
  function E(l) {
    var t = l.alternate;
    if (!t) {
      if (t = L(l), t === null) throw Error(s(188));
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
          if (n === a) return N(e), l;
          if (n === u) return N(e), t;
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
  function X(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l;
    for (l = l.child; l !== null; ) {
      if (t = X(l), t !== null) return t;
      l = l.sibling;
    }
    return null;
  }
  var R = Object.assign, ol = Symbol.for("react.element"), gl = Symbol.for("react.transitional.element"), Dl = Symbol.for("react.portal"), Rl = Symbol.for("react.fragment"), Tt = Symbol.for("react.strict_mode"), Ll = Symbol.for("react.profiler"), At = Symbol.for("react.consumer"), El = Symbol.for("react.context"), wl = Symbol.for("react.forward_ref"), Vl = Symbol.for("react.suspense"), Tl = Symbol.for("react.suspense_list"), ll = Symbol.for("react.memo"), xl = Symbol.for("react.lazy"), tt = Symbol.for("react.activity"), jt = Symbol.for("react.memo_cache_sentinel"), k = Symbol.iterator;
  function bl(l) {
    return l === null || typeof l != "object" ? null : (l = k && l[k] || l["@@iterator"], typeof l == "function" ? l : null);
  }
  var Bl = Symbol.for("react.client.reference");
  function rl(l) {
    if (l == null) return null;
    if (typeof l == "function") return l.$$typeof === Bl ? null : l.displayName || l.name || null;
    if (typeof l == "string") return l;
    switch (l) {
      case Rl:
        return "Fragment";
      case Ll:
        return "Profiler";
      case Tt:
        return "StrictMode";
      case Vl:
        return "Suspense";
      case Tl:
        return "SuspenseList";
      case tt:
        return "Activity";
    }
    if (typeof l == "object") switch (l.$$typeof) {
      case Dl:
        return "Portal";
      case El:
        return l.displayName || "Context";
      case At:
        return (l._context.displayName || "Context") + ".Consumer";
      case wl:
        var t = l.render;
        return l = l.displayName, l || (l = t.displayName || t.name || "", l = l !== "" ? "ForwardRef(" + l + ")" : "ForwardRef"), l;
      case ll:
        return t = l.displayName || null, t !== null ? t : rl(l.type) || "Memo";
      case xl:
        t = l._payload, l = l._init;
        try {
          return rl(l(t));
        } catch {
        }
    }
    return null;
  }
  var O = Array.isArray, A = M.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, D = H.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, tl = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, sl = [], at = -1;
  function d(l) {
    return { current: l };
  }
  function _(l) {
    0 > at || (l.current = sl[at], sl[at] = null, at--);
  }
  function U(l, t) {
    at++, sl[at] = l.current, l.current = t;
  }
  var q = d(null), J = d(null), w = d(null), nl = d(null);
  function Kl(l, t) {
    switch (U(w, t), U(J, l), U(q, null), t.nodeType) {
      case 9:
      case 11:
        l = (l = t.documentElement) && (l = l.namespaceURI) ? Ud(l) : 0;
        break;
      default:
        if (l = t.tagName, t = t.namespaceURI) t = Ud(t), l = pd(t, l);
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
    _(q), U(q, l);
  }
  function Al() {
    _(q), _(J), _(w);
  }
  function Ou(l) {
    l.memoizedState !== null && U(nl, l);
    var t = q.current, a = pd(t, l.type);
    t !== a && (U(J, l), U(q, a));
  }
  function ze(l) {
    J.current === l && (_(q), _(J)), nl.current === l && (_(nl), he._currentValue = tl);
  }
  var Xn, ef;
  function _a(l) {
    if (Xn === void 0) try {
      throw Error();
    } catch (a) {
      var t = a.stack.trim().match(/\n( *(at )?)/);
      Xn = t && t[1] || "", ef = -1 < a.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < a.stack.indexOf("@") ? "@unknown:0:0" : "";
    }
    return `
` + Xn + l + ef;
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
            var z = function() {
              throw Error();
            };
            if (Object.defineProperty(z.prototype, "props", { set: function() {
              throw Error();
            } }), typeof Reflect == "object" && Reflect.construct) {
              try {
                Reflect.construct(z, []);
              } catch (S) {
                var g = S;
              }
              Reflect.construct(l, [], z);
            } else {
              try {
                z.call();
              } catch (S) {
                g = S;
              }
              l.call(z.prototype);
            }
          } else {
            try {
              throw Error();
            } catch (S) {
              g = S;
            }
            (z = l()) && typeof z.catch == "function" && z.catch(function() {
            });
          }
        } catch (S) {
          if (S && g && typeof S.stack == "string") return [S.stack, g.stack];
        }
        return [null, null];
      } };
      u.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var e = Object.getOwnPropertyDescriptor(u.DetermineComponentFrameRoot, "name");
      e && e.configurable && Object.defineProperty(u.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
      var n = u.DetermineComponentFrameRoot(), i = n[0], c = n[1];
      if (i && c) {
        var f = i.split(`
`), o = c.split(`
`);
        for (e = u = 0; u < f.length && !f[u].includes("DetermineComponentFrameRoot"); ) u++;
        for (; e < o.length && !o[e].includes("DetermineComponentFrameRoot"); ) e++;
        if (u === f.length || e === o.length) for (u = f.length - 1, e = o.length - 1; 1 <= u && 0 <= e && f[u] !== o[e]; ) e--;
        for (; 1 <= u && 0 <= e; u--, e--) if (f[u] !== o[e]) {
          if (u !== 1 || e !== 1) do
            if (u--, e--, 0 > e || f[u] !== o[e]) {
              var r = `
` + f[u].replace(" at new ", " at ");
              return l.displayName && r.includes("<anonymous>") && (r = r.replace("<anonymous>", l.displayName)), r;
            }
          while (1 <= u && 0 <= e);
          break;
        }
      }
    } finally {
      Qn = !1, Error.prepareStackTrace = a;
    }
    return (a = l ? l.displayName || l.name : "") ? _a(a) : "";
  }
  function f1(l, t) {
    switch (l.tag) {
      case 26:
      case 27:
      case 5:
        return _a(l.type);
      case 16:
        return _a("Lazy");
      case 13:
        return l.child !== t && t !== null ? _a("Suspense Fallback") : _a("Suspense");
      case 19:
        return _a("SuspenseList");
      case 0:
      case 15:
        return Zn(l.type, !1);
      case 11:
        return Zn(l.type.render, !1);
      case 1:
        return Zn(l.type, !0);
      case 31:
        return _a("Activity");
      default:
        return "";
    }
  }
  function nf(l) {
    try {
      var t = "", a = null;
      do
        t += f1(l, a), a = l, l = l.return;
      while (l);
      return t;
    } catch (u) {
      return `
Error generating stack: ` + u.message + `
` + u.stack;
    }
  }
  var Ln = Object.prototype.hasOwnProperty, Vn = T.unstable_scheduleCallback, xn = T.unstable_cancelCallback, v1 = T.unstable_shouldYield, d1 = T.unstable_requestPaint, ut = T.unstable_now, m1 = T.unstable_getCurrentPriorityLevel, cf = T.unstable_ImmediatePriority, ff = T.unstable_UserBlockingPriority, _e = T.unstable_NormalPriority, s1 = T.unstable_LowPriority, vf = T.unstable_IdlePriority, y1 = T.log, h1 = T.unstable_setDisableYieldValue, Mu = null, et = null;
  function It(l) {
    if (typeof y1 == "function" && h1(l), et && typeof et.setStrictMode == "function") try {
      et.setStrictMode(Mu, l);
    } catch {
    }
  }
  var nt = Math.clz32 ? Math.clz32 : S1, o1 = Math.log, g1 = Math.LN2;
  function S1(l) {
    return l >>>= 0, l === 0 ? 32 : 31 - (o1(l) / g1 | 0) | 0;
  }
  var Ee = 256, Te = 262144, Ae = 4194304;
  function Ea(l) {
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
  function Oe(l, t, a) {
    var u = l.pendingLanes;
    if (u === 0) return 0;
    var e = 0, n = l.suspendedLanes, i = l.pingedLanes;
    l = l.warmLanes;
    var c = u & 134217727;
    return c !== 0 ? (u = c & ~n, u !== 0 ? e = Ea(u) : (i &= c, i !== 0 ? e = Ea(i) : a || (a = c & ~l, a !== 0 && (e = Ea(a))))) : (c = u & ~n, c !== 0 ? e = Ea(c) : i !== 0 ? e = Ea(i) : a || (a = u & ~l, a !== 0 && (e = Ea(a)))), e === 0 ? 0 : t !== 0 && t !== e && (t & n) === 0 && (n = e & -e, a = t & -t, n >= a || n === 32 && (a & 4194048) !== 0) ? t : e;
  }
  function Du(l, t) {
    return (l.pendingLanes & ~(l.suspendedLanes & ~l.pingedLanes) & t) === 0;
  }
  function r1(l, t) {
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
  function df() {
    var l = Ae;
    return Ae <<= 1, (Ae & 62914560) === 0 && (Ae = 4194304), l;
  }
  function Kn(l) {
    for (var t = [], a = 0; 31 > a; a++) t.push(l);
    return t;
  }
  function Me(l, t) {
    l.pendingLanes |= t, t !== 268435456 && (l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0);
  }
  function b1(l, t, a, u, e, n) {
    var i = l.pendingLanes;
    l.pendingLanes = a, l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0, l.expiredLanes &= a, l.entangledLanes &= a, l.errorRecoveryDisabledLanes &= a, l.shellSuspendCounter = 0;
    var c = l.entanglements, f = l.expirationTimes, o = l.hiddenUpdates;
    for (a = i & ~a; 0 < a; ) {
      var r = 31 - nt(a), z = 1 << r;
      c[r] = 0, f[r] = -1;
      var g = o[r];
      if (g !== null) for (o[r] = null, r = 0; r < g.length; r++) {
        var S = g[r];
        S !== null && (S.lane &= -536870913);
      }
      a &= ~z;
    }
    u !== 0 && mf(l, u, 0), n !== 0 && e === 0 && l.tag !== 0 && (l.suspendedLanes |= n & ~(i & ~t));
  }
  function mf(l, t, a) {
    l.pendingLanes |= t, l.suspendedLanes &= ~t;
    var u = 31 - nt(t);
    l.entangledLanes |= t, l.entanglements[u] = l.entanglements[u] | 1073741824 | a & 261930;
  }
  function sf(l, t) {
    var a = l.entangledLanes |= t;
    for (l = l.entanglements; a; ) {
      var u = 31 - nt(a), e = 1 << u;
      e & t | l[u] & t && (l[u] |= t), a &= ~e;
    }
  }
  function yf(l, t) {
    var a = t & -t;
    return a = (a & 42) !== 0 ? 1 : hf(a), (a & (l.suspendedLanes | t)) !== 0 ? 0 : a;
  }
  function hf(l) {
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
  function Jn(l) {
    return l &= -l, 2 < l ? 8 < l ? (l & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function of() {
    var l = D.p;
    return l !== 0 ? l : (l = window.event, l === void 0 ? 32 : kd(l.type));
  }
  function gf(l, t) {
    var a = D.p;
    try {
      return D.p = l, t();
    } finally {
      D.p = a;
    }
  }
  var Pt = Math.random().toString(36).slice(2), ql = "__reactFiber$" + Pt, Wl = "__reactProps$" + Pt, Uu = "__reactContainer$" + Pt, wn = "__reactEvents$" + Pt, z1 = "__reactListeners$" + Pt, _1 = "__reactHandles$" + Pt, Sf = "__reactResources$" + Pt, pu = "__reactMarker$" + Pt;
  function Wn(l) {
    delete l[ql], delete l[Wl], delete l[wn], delete l[z1], delete l[_1];
  }
  function La(l) {
    var t = l[ql];
    if (t) return t;
    for (var a = l.parentNode; a; ) {
      if (t = a[Uu] || a[ql]) {
        if (a = t.alternate, t.child !== null || a !== null && a.child !== null) for (l = Yd(l); l !== null; ) {
          if (a = l[ql]) return a;
          l = Yd(l);
        }
        return t;
      }
      l = a, a = l.parentNode;
    }
    return null;
  }
  function Va(l) {
    if (l = l[ql] || l[Uu]) {
      var t = l.tag;
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3) return l;
    }
    return null;
  }
  function Nu(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l.stateNode;
    throw Error(s(33));
  }
  function xa(l) {
    var t = l[Sf];
    return t || (t = l[Sf] = {
      hoistableStyles: /* @__PURE__ */ new Map(),
      hoistableScripts: /* @__PURE__ */ new Map()
    }), t;
  }
  function Cl(l) {
    l[pu] = !0;
  }
  var rf = /* @__PURE__ */ new Set(), bf = {};
  function Ta(l, t) {
    Ka(l, t), Ka(l + "Capture", t);
  }
  function Ka(l, t) {
    for (bf[l] = t, l = 0; l < t.length; l++) rf.add(t[l]);
  }
  var E1 = RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), zf = {}, _f = {};
  function T1(l) {
    return Ln.call(_f, l) ? !0 : Ln.call(zf, l) ? !1 : E1.test(l) ? _f[l] = !0 : (zf[l] = !0, !1);
  }
  function De(l, t, a) {
    if (T1(t)) if (a === null) l.removeAttribute(t);
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
  function Ue(l, t, a) {
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
  function Rt(l, t, a, u) {
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
  function st(l) {
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
  function Ef(l) {
    var t = l.type;
    return (l = l.nodeName) && l.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function A1(l, t, a) {
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
      var t = Ef(l) ? "checked" : "value";
      l._valueTracker = A1(l, t, "" + l[t]);
    }
  }
  function Tf(l) {
    if (!l) return !1;
    var t = l._valueTracker;
    if (!t) return !0;
    var a = t.getValue(), u = "";
    return l && (u = Ef(l) ? l.checked ? "true" : "false" : l.value), l = u, l !== a ? (t.setValue(l), !0) : !1;
  }
  function pe(l) {
    if (l = l || (typeof document < "u" ? document : void 0), typeof l > "u") return null;
    try {
      return l.activeElement || l.body;
    } catch {
      return l.body;
    }
  }
  var O1 = /[\n"\\]/g;
  function yt(l) {
    return l.replace(O1, function(t) {
      return "\\" + t.charCodeAt(0).toString(16) + " ";
    });
  }
  function kn(l, t, a, u, e, n, i, c) {
    l.name = "", i != null && typeof i != "function" && typeof i != "symbol" && typeof i != "boolean" ? l.type = i : l.removeAttribute("type"), t != null ? i === "number" ? (t === 0 && l.value === "" || l.value != t) && (l.value = "" + st(t)) : l.value !== "" + st(t) && (l.value = "" + st(t)) : i !== "submit" && i !== "reset" || l.removeAttribute("value"), t != null ? Fn(l, i, st(t)) : a != null ? Fn(l, i, st(a)) : u != null && l.removeAttribute("value"), e == null && n != null && (l.defaultChecked = !!n), e != null && (l.checked = e && typeof e != "function" && typeof e != "symbol"), c != null && typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" ? l.name = "" + st(c) : l.removeAttribute("name");
  }
  function Af(l, t, a, u, e, n, i, c) {
    if (n != null && typeof n != "function" && typeof n != "symbol" && typeof n != "boolean" && (l.type = n), t != null || a != null) {
      if (!(n !== "submit" && n !== "reset" || t != null)) {
        $n(l);
        return;
      }
      a = a != null ? "" + st(a) : "", t = t != null ? "" + st(t) : a, c || t === l.value || (l.value = t), l.defaultValue = t;
    }
    u = u ?? e, u = typeof u != "function" && typeof u != "symbol" && !!u, l.checked = c ? l.checked : !!u, l.defaultChecked = !!u, i != null && typeof i != "function" && typeof i != "symbol" && typeof i != "boolean" && (l.name = i), $n(l);
  }
  function Fn(l, t, a) {
    t === "number" && pe(l.ownerDocument) === l || l.defaultValue === "" + a || (l.defaultValue = "" + a);
  }
  function Ja(l, t, a, u) {
    if (l = l.options, t) {
      t = {};
      for (var e = 0; e < a.length; e++) t["$" + a[e]] = !0;
      for (a = 0; a < l.length; a++) e = t.hasOwnProperty("$" + l[a].value), l[a].selected !== e && (l[a].selected = e), e && u && (l[a].defaultSelected = !0);
    } else {
      for (a = "" + st(a), t = null, e = 0; e < l.length; e++) {
        if (l[e].value === a) {
          l[e].selected = !0, u && (l[e].defaultSelected = !0);
          return;
        }
        t !== null || l[e].disabled || (t = l[e]);
      }
      t !== null && (t.selected = !0);
    }
  }
  function Of(l, t, a) {
    if (t != null && (t = "" + st(t), t !== l.value && (l.value = t), a == null)) {
      l.defaultValue !== t && (l.defaultValue = t);
      return;
    }
    l.defaultValue = a != null ? "" + st(a) : "";
  }
  function Mf(l, t, a, u) {
    if (t == null) {
      if (u != null) {
        if (a != null) throw Error(s(92));
        if (O(u)) {
          if (1 < u.length) throw Error(s(93));
          u = u[0];
        }
        a = u;
      }
      a ??= "", t = a;
    }
    a = st(t), l.defaultValue = a, u = l.textContent, u === a && u !== "" && u !== null && (l.value = u), $n(l);
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
  var M1 = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));
  function Df(l, t, a) {
    var u = t.indexOf("--") === 0;
    a == null || typeof a == "boolean" || a === "" ? u ? l.setProperty(t, "") : t === "float" ? l.cssFloat = "" : l[t] = "" : u ? l.setProperty(t, a) : typeof a != "number" || a === 0 || M1.has(t) ? t === "float" ? l.cssFloat = a : l[t] = ("" + a).trim() : l[t] = a + "px";
  }
  function Uf(l, t, a) {
    if (t != null && typeof t != "object") throw Error(s(62));
    if (l = l.style, a != null) {
      for (var u in a) !a.hasOwnProperty(u) || t != null && t.hasOwnProperty(u) || (u.indexOf("--") === 0 ? l.setProperty(u, "") : u === "float" ? l.cssFloat = "" : l[u] = "");
      for (var e in t) u = t[e], t.hasOwnProperty(e) && a[e] !== u && Df(l, e, u);
    } else for (var n in t) t.hasOwnProperty(n) && Df(l, n, t[n]);
  }
  function In(l) {
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
  var D1 = /* @__PURE__ */ new Map([
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
  ]), U1 = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Ne(l) {
    return U1.test("" + l) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : l;
  }
  function Bt() {
  }
  var Pn = null;
  function li(l) {
    return l = l.target || l.srcElement || window, l.correspondingUseElement && (l = l.correspondingUseElement), l.nodeType === 3 ? l.parentNode : l;
  }
  var Wa = null, $a = null;
  function pf(l) {
    var t = Va(l);
    if (t && (l = t.stateNode)) {
      var a = l[Wl] || null;
      l: switch (l = t.stateNode, t.type) {
        case "input":
          if (kn(l, a.value, a.defaultValue, a.defaultValue, a.checked, a.defaultChecked, a.type, a.name), t = a.name, a.type === "radio" && t != null) {
            for (a = l; a.parentNode; ) a = a.parentNode;
            for (a = a.querySelectorAll('input[name="' + yt("" + t) + '"][type="radio"]'), t = 0; t < a.length; t++) {
              var u = a[t];
              if (u !== l && u.form === l.form) {
                var e = u[Wl] || null;
                if (!e) throw Error(s(90));
                kn(u, e.value, e.defaultValue, e.defaultValue, e.checked, e.defaultChecked, e.type, e.name);
              }
            }
            for (t = 0; t < a.length; t++) u = a[t], u.form === l.form && Tf(u);
          }
          break l;
        case "textarea":
          Of(l, a.value, a.defaultValue);
          break l;
        case "select":
          t = a.value, t != null && Ja(l, !!a.multiple, t, !1);
      }
    }
  }
  var ti = !1;
  function Nf(l, t, a) {
    if (ti) return l(t, a);
    ti = !0;
    try {
      return l(t);
    } finally {
      if (ti = !1, (Wa !== null || $a !== null) && (rn(), Wa && (t = Wa, l = $a, $a = Wa = null, pf(t), l)))
        for (t = 0; t < l.length; t++) pf(l[t]);
    }
  }
  function Hu(l, t) {
    var a = l.stateNode;
    if (a === null) return null;
    var u = a[Wl] || null;
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
  var Ct = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), ai = !1;
  if (Ct) try {
    var ju = {};
    Object.defineProperty(ju, "passive", { get: function() {
      ai = !0;
    } }), window.addEventListener("test", ju, ju), window.removeEventListener("test", ju, ju);
  } catch {
    ai = !1;
  }
  var la = null, ui = null, He = null;
  function Hf() {
    if (He) return He;
    var l, t = ui, a = t.length, u, e = "value" in la ? la.value : la.textContent, n = e.length;
    for (l = 0; l < a && t[l] === e[l]; l++) ;
    var i = a - l;
    for (u = 1; u <= i && t[a - u] === e[n - u]; u++) ;
    return He = e.slice(l, 1 < u ? 1 - u : void 0);
  }
  function je(l) {
    var t = l.keyCode;
    return "charCode" in l ? (l = l.charCode, l === 0 && t === 13 && (l = 13)) : l = t, l === 10 && (l = 13), 32 <= l || l === 13 ? l : 0;
  }
  function Re() {
    return !0;
  }
  function jf() {
    return !1;
  }
  function $l(l) {
    function t(a, u, e, n, i) {
      this._reactName = a, this._targetInst = e, this.type = u, this.nativeEvent = n, this.target = i, this.currentTarget = null;
      for (var c in l) l.hasOwnProperty(c) && (a = l[c], this[c] = a ? a(n) : n[c]);
      return this.isDefaultPrevented = (n.defaultPrevented != null ? n.defaultPrevented : n.returnValue === !1) ? Re : jf, this.isPropagationStopped = jf, this;
    }
    return R(t.prototype, {
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
  var Aa = {
    eventPhase: 0,
    bubbles: 0,
    cancelable: 0,
    timeStamp: function(l) {
      return l.timeStamp || Date.now();
    },
    defaultPrevented: 0,
    isTrusted: 0
  }, Be = $l(Aa), Ru = R({}, Aa, {
    view: 0,
    detail: 0
  }), p1 = $l(Ru), ei, ni, Bu, Ce = R({}, Ru, {
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
    getModifierState: ci,
    button: 0,
    buttons: 0,
    relatedTarget: function(l) {
      return l.relatedTarget === void 0 ? l.fromElement === l.srcElement ? l.toElement : l.fromElement : l.relatedTarget;
    },
    movementX: function(l) {
      return "movementX" in l ? l.movementX : (l !== Bu && (Bu && l.type === "mousemove" ? (ei = l.screenX - Bu.screenX, ni = l.screenY - Bu.screenY) : ni = ei = 0, Bu = l), ei);
    },
    movementY: function(l) {
      return "movementY" in l ? l.movementY : ni;
    }
  }), Rf = $l(Ce), N1 = $l(R({}, Ce, { dataTransfer: 0 })), ii = $l(R({}, Ru, { relatedTarget: 0 })), H1 = $l(R({}, Aa, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  })), j1 = $l(R({}, Aa, { clipboardData: function(l) {
    return "clipboardData" in l ? l.clipboardData : window.clipboardData;
  } })), Bf = $l(R({}, Aa, { data: 0 })), R1 = {
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
  }, B1 = {
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
  }, C1 = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function Y1(l) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(l) : (l = C1[l]) ? !!t[l] : !1;
  }
  function ci() {
    return Y1;
  }
  var q1 = $l(R({}, Ru, {
    key: function(l) {
      if (l.key) {
        var t = R1[l.key] || l.key;
        if (t !== "Unidentified") return t;
      }
      return l.type === "keypress" ? (l = je(l), l === 13 ? "Enter" : String.fromCharCode(l)) : l.type === "keydown" || l.type === "keyup" ? B1[l.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: ci,
    charCode: function(l) {
      return l.type === "keypress" ? je(l) : 0;
    },
    keyCode: function(l) {
      return l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    },
    which: function(l) {
      return l.type === "keypress" ? je(l) : l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    }
  })), Cf = $l(R({}, Ce, {
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
  })), G1 = $l(R({}, Ru, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: ci
  })), X1 = $l(R({}, Aa, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  })), Q1 = $l(R({}, Ce, {
    deltaX: function(l) {
      return "deltaX" in l ? l.deltaX : "wheelDeltaX" in l ? -l.wheelDeltaX : 0;
    },
    deltaY: function(l) {
      return "deltaY" in l ? l.deltaY : "wheelDeltaY" in l ? -l.wheelDeltaY : "wheelDelta" in l ? -l.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  })), Z1 = $l(R({}, Aa, {
    newState: 0,
    oldState: 0
  })), L1 = [
    9,
    13,
    27,
    32
  ], fi = Ct && "CompositionEvent" in window, Cu = null;
  Ct && "documentMode" in document && (Cu = document.documentMode);
  var V1 = Ct && "TextEvent" in window && !Cu, Yf = Ct && (!fi || Cu && 8 < Cu && 11 >= Cu), qf = " ", Gf = !1;
  function Xf(l, t) {
    switch (l) {
      case "keyup":
        return L1.indexOf(t.keyCode) !== -1;
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
  function Qf(l) {
    return l = l.detail, typeof l == "object" && "data" in l ? l.data : null;
  }
  var ka = !1;
  function x1(l, t) {
    switch (l) {
      case "compositionend":
        return Qf(t);
      case "keypress":
        return t.which !== 32 ? null : (Gf = !0, qf);
      case "textInput":
        return l = t.data, l === qf && Gf ? null : l;
      default:
        return null;
    }
  }
  function K1(l, t) {
    if (ka) return l === "compositionend" || !fi && Xf(l, t) ? (l = Hf(), He = ui = la = null, ka = !1, l) : null;
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
        return Yf && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var J1 = {
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
  function Zf(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t === "input" ? !!J1[l.type] : t === "textarea";
  }
  function Lf(l, t, a, u) {
    Wa ? $a ? $a.push(u) : $a = [u] : Wa = u, t = On(t, "onChange"), 0 < t.length && (a = new Be("onChange", "change", null, a, u), l.push({
      event: a,
      listeners: t
    }));
  }
  var Yu = null, qu = null;
  function w1(l) {
    _d(l, 0);
  }
  function Ye(l) {
    if (Tf(Nu(l))) return l;
  }
  function Vf(l, t) {
    if (l === "change") return t;
  }
  var xf = !1;
  if (Ct) {
    var vi;
    if (Ct) {
      var di = "oninput" in document;
      if (!di) {
        var Kf = document.createElement("div");
        Kf.setAttribute("oninput", "return;"), di = typeof Kf.oninput == "function";
      }
      vi = di;
    } else vi = !1;
    xf = vi && (!document.documentMode || 9 < document.documentMode);
  }
  function Jf() {
    Yu && (Yu.detachEvent("onpropertychange", wf), qu = Yu = null);
  }
  function wf(l) {
    if (l.propertyName === "value" && Ye(qu)) {
      var t = [];
      Lf(t, qu, l, li(l)), Nf(w1, t);
    }
  }
  function W1(l, t, a) {
    l === "focusin" ? (Jf(), Yu = t, qu = a, Yu.attachEvent("onpropertychange", wf)) : l === "focusout" && Jf();
  }
  function $1(l) {
    if (l === "selectionchange" || l === "keyup" || l === "keydown") return Ye(qu);
  }
  function k1(l, t) {
    if (l === "click") return Ye(t);
  }
  function F1(l, t) {
    if (l === "input" || l === "change") return Ye(t);
  }
  function I1(l, t) {
    return l === t && (l !== 0 || 1 / l === 1 / t) || l !== l && t !== t;
  }
  var it = typeof Object.is == "function" ? Object.is : I1;
  function Gu(l, t) {
    if (it(l, t)) return !0;
    if (typeof l != "object" || l === null || typeof t != "object" || t === null) return !1;
    var a = Object.keys(l), u = Object.keys(t);
    if (a.length !== u.length) return !1;
    for (u = 0; u < a.length; u++) {
      var e = a[u];
      if (!Ln.call(t, e) || !it(l[e], t[e])) return !1;
    }
    return !0;
  }
  function Wf(l) {
    for (; l && l.firstChild; ) l = l.firstChild;
    return l;
  }
  function $f(l, t) {
    var a = Wf(l);
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
      a = Wf(a);
    }
  }
  function kf(l, t) {
    return l && t ? l === t ? !0 : l && l.nodeType === 3 ? !1 : t && t.nodeType === 3 ? kf(l, t.parentNode) : "contains" in l ? l.contains(t) : l.compareDocumentPosition ? !!(l.compareDocumentPosition(t) & 16) : !1 : !1;
  }
  function Ff(l) {
    l = l != null && l.ownerDocument != null && l.ownerDocument.defaultView != null ? l.ownerDocument.defaultView : window;
    for (var t = pe(l.document); t instanceof l.HTMLIFrameElement; ) {
      try {
        var a = typeof t.contentWindow.location.href == "string";
      } catch {
        a = !1;
      }
      if (a) l = t.contentWindow;
      else break;
      t = pe(l.document);
    }
    return t;
  }
  function mi(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t && (t === "input" && (l.type === "text" || l.type === "search" || l.type === "tel" || l.type === "url" || l.type === "password") || t === "textarea" || l.contentEditable === "true");
  }
  var P1 = Ct && "documentMode" in document && 11 >= document.documentMode, Fa = null, si = null, Xu = null, yi = !1;
  function If(l, t, a) {
    var u = a.window === a ? a.document : a.nodeType === 9 ? a : a.ownerDocument;
    yi || Fa == null || Fa !== pe(u) || (u = Fa, "selectionStart" in u && mi(u) ? u = {
      start: u.selectionStart,
      end: u.selectionEnd
    } : (u = (u.ownerDocument && u.ownerDocument.defaultView || window).getSelection(), u = {
      anchorNode: u.anchorNode,
      anchorOffset: u.anchorOffset,
      focusNode: u.focusNode,
      focusOffset: u.focusOffset
    }), Xu && Gu(Xu, u) || (Xu = u, u = On(si, "onSelect"), 0 < u.length && (t = new Be("onSelect", "select", null, t, a), l.push({
      event: t,
      listeners: u
    }), t.target = Fa)));
  }
  function Oa(l, t) {
    var a = {};
    return a[l.toLowerCase()] = t.toLowerCase(), a["Webkit" + l] = "webkit" + t, a["Moz" + l] = "moz" + t, a;
  }
  var Ia = {
    animationend: Oa("Animation", "AnimationEnd"),
    animationiteration: Oa("Animation", "AnimationIteration"),
    animationstart: Oa("Animation", "AnimationStart"),
    transitionrun: Oa("Transition", "TransitionRun"),
    transitionstart: Oa("Transition", "TransitionStart"),
    transitioncancel: Oa("Transition", "TransitionCancel"),
    transitionend: Oa("Transition", "TransitionEnd")
  }, hi = {}, Pf = {};
  Ct && (Pf = document.createElement("div").style, "AnimationEvent" in window || (delete Ia.animationend.animation, delete Ia.animationiteration.animation, delete Ia.animationstart.animation), "TransitionEvent" in window || delete Ia.transitionend.transition);
  function Ma(l) {
    if (hi[l]) return hi[l];
    if (!Ia[l]) return l;
    var t = Ia[l], a;
    for (a in t) if (t.hasOwnProperty(a) && a in Pf) return hi[l] = t[a];
    return l;
  }
  var l0 = Ma("animationend"), t0 = Ma("animationiteration"), a0 = Ma("animationstart"), lm = Ma("transitionrun"), tm = Ma("transitionstart"), am = Ma("transitioncancel"), u0 = Ma("transitionend"), e0 = /* @__PURE__ */ new Map(), oi = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
  oi.push("scrollEnd");
  function Ot(l, t) {
    e0.set(l, t), Ta(t, [l]);
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
  }, ht = [], Pa = 0, gi = 0;
  function Ge() {
    for (var l = Pa, t = gi = Pa = 0; t < l; ) {
      var a = ht[t];
      ht[t++] = null;
      var u = ht[t];
      ht[t++] = null;
      var e = ht[t];
      ht[t++] = null;
      var n = ht[t];
      if (ht[t++] = null, u !== null && e !== null) {
        var i = u.pending;
        i === null ? e.next = e : (e.next = i.next, i.next = e), u.pending = e;
      }
      n !== 0 && n0(a, e, n);
    }
  }
  function Xe(l, t, a, u) {
    ht[Pa++] = l, ht[Pa++] = t, ht[Pa++] = a, ht[Pa++] = u, gi |= u, l.lanes |= u, l = l.alternate, l !== null && (l.lanes |= u);
  }
  function Si(l, t, a, u) {
    return Xe(l, t, a, u), Qe(l);
  }
  function Da(l, t) {
    return Xe(l, null, null, t), Qe(l);
  }
  function n0(l, t, a) {
    l.lanes |= a;
    var u = l.alternate;
    u !== null && (u.lanes |= a);
    for (var e = !1, n = l.return; n !== null; ) n.childLanes |= a, u = n.alternate, u !== null && (u.childLanes |= a), n.tag === 22 && (l = n.stateNode, l === null || l._visibility & 1 || (e = !0)), l = n, n = n.return;
    return l.tag === 3 ? (n = l.stateNode, e && t !== null && (e = 31 - nt(a), l = n.hiddenUpdates, u = l[e], u === null ? l[e] = [t] : u.push(t), t.lane = a | 536870912), n) : null;
  }
  function Qe(l) {
    if (50 < ce) throw ce = 0, Mc = null, Error(s(185));
    for (var t = l.return; t !== null; ) l = t, t = l.return;
    return l.tag === 3 ? l.stateNode : null;
  }
  var lu = {};
  function um(l, t, a, u) {
    this.tag = l, this.key = a, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = u, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function ct(l, t, a, u) {
    return new um(l, t, a, u);
  }
  function ri(l) {
    return l = l.prototype, !(!l || !l.isReactComponent);
  }
  function Yt(l, t) {
    var a = l.alternate;
    return a === null ? (a = ct(l.tag, t, l.key, l.mode), a.elementType = l.elementType, a.type = l.type, a.stateNode = l.stateNode, a.alternate = l, l.alternate = a) : (a.pendingProps = t, a.type = l.type, a.flags = 0, a.subtreeFlags = 0, a.deletions = null), a.flags = l.flags & 65011712, a.childLanes = l.childLanes, a.lanes = l.lanes, a.child = l.child, a.memoizedProps = l.memoizedProps, a.memoizedState = l.memoizedState, a.updateQueue = l.updateQueue, t = l.dependencies, a.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }, a.sibling = l.sibling, a.index = l.index, a.ref = l.ref, a.refCleanup = l.refCleanup, a;
  }
  function i0(l, t) {
    l.flags &= 65011714;
    var a = l.alternate;
    return a === null ? (l.childLanes = 0, l.lanes = t, l.child = null, l.subtreeFlags = 0, l.memoizedProps = null, l.memoizedState = null, l.updateQueue = null, l.dependencies = null, l.stateNode = null) : (l.childLanes = a.childLanes, l.lanes = a.lanes, l.child = a.child, l.subtreeFlags = 0, l.deletions = null, l.memoizedProps = a.memoizedProps, l.memoizedState = a.memoizedState, l.updateQueue = a.updateQueue, l.type = a.type, t = a.dependencies, l.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }), l;
  }
  function Ze(l, t, a, u, e, n) {
    var i = 0;
    if (u = l, typeof l == "function") ri(l) && (i = 1);
    else if (typeof l == "string") i = vs(l, a, q.current) ? 26 : l === "html" || l === "head" || l === "body" ? 27 : 5;
    else l: switch (l) {
      case tt:
        return l = ct(31, a, t, e), l.elementType = tt, l.lanes = n, l;
      case Rl:
        return Ua(a.children, e, n, t);
      case Tt:
        i = 8, e |= 24;
        break;
      case Ll:
        return l = ct(12, a, t, e | 2), l.elementType = Ll, l.lanes = n, l;
      case Vl:
        return l = ct(13, a, t, e), l.elementType = Vl, l.lanes = n, l;
      case Tl:
        return l = ct(19, a, t, e), l.elementType = Tl, l.lanes = n, l;
      default:
        if (typeof l == "object" && l !== null) switch (l.$$typeof) {
          case El:
            i = 10;
            break l;
          case At:
            i = 9;
            break l;
          case wl:
            i = 11;
            break l;
          case ll:
            i = 14;
            break l;
          case xl:
            i = 16, u = null;
            break l;
        }
        i = 29, a = Error(s(130, l === null ? "null" : typeof l, "")), u = null;
    }
    return t = ct(i, a, t, e), t.elementType = l, t.type = u, t.lanes = n, t;
  }
  function Ua(l, t, a, u) {
    return l = ct(7, l, u, t), l.lanes = a, l;
  }
  function bi(l, t, a) {
    return l = ct(6, l, null, t), l.lanes = a, l;
  }
  function c0(l) {
    var t = ct(18, null, null, 0);
    return t.stateNode = l, t;
  }
  function zi(l, t, a) {
    return t = ct(4, l.children !== null ? l.children : [], l.key, t), t.lanes = a, t.stateNode = {
      containerInfo: l.containerInfo,
      pendingChildren: null,
      implementation: l.implementation
    }, t;
  }
  var f0 = /* @__PURE__ */ new WeakMap();
  function ot(l, t) {
    if (typeof l == "object" && l !== null) {
      var a = f0.get(l);
      return a !== void 0 ? a : (t = {
        value: l,
        source: t,
        stack: nf(t)
      }, f0.set(l, t), t);
    }
    return {
      value: l,
      source: t,
      stack: nf(t)
    };
  }
  var tu = [], au = 0, Le = null, Qu = 0, gt = [], St = 0, ta = null, Ut = 1, pt = "";
  function qt(l, t) {
    tu[au++] = Qu, tu[au++] = Le, Le = l, Qu = t;
  }
  function v0(l, t, a) {
    gt[St++] = Ut, gt[St++] = pt, gt[St++] = ta, ta = l;
    var u = Ut;
    l = pt;
    var e = 32 - nt(u) - 1;
    u &= ~(1 << e), a += 1;
    var n = 32 - nt(t) + e;
    if (30 < n) {
      var i = e - e % 5;
      n = (u & (1 << i) - 1).toString(32), u >>= i, e -= i, Ut = 1 << 32 - nt(t) + e | a << e | u, pt = n + l;
    } else Ut = 1 << n | a << e | u, pt = l;
  }
  function _i(l) {
    l.return !== null && (qt(l, 1), v0(l, 1, 0));
  }
  function Ei(l) {
    for (; l === Le; ) Le = tu[--au], tu[au] = null, Qu = tu[--au], tu[au] = null;
    for (; l === ta; ) ta = gt[--St], gt[St] = null, pt = gt[--St], gt[St] = null, Ut = gt[--St], gt[St] = null;
  }
  function d0(l, t) {
    gt[St++] = Ut, gt[St++] = pt, gt[St++] = ta, Ut = t.id, pt = t.overflow, ta = l;
  }
  var Gl = null, yl = null, P = !1, aa = null, rt = !1, Ti = Error(s(519));
  function ua(l) {
    throw Zu(ot(Error(s(418, 1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML", "")), l)), Ti;
  }
  function m0(l) {
    var t = l.stateNode, a = l.type, u = l.memoizedProps;
    switch (t[ql] = l, t[Wl] = u, a) {
      case "dialog":
        $("cancel", t), $("close", t);
        break;
      case "iframe":
      case "object":
      case "embed":
        $("load", t);
        break;
      case "video":
      case "audio":
        for (a = 0; a < ve.length; a++) $(ve[a], t);
        break;
      case "source":
        $("error", t);
        break;
      case "img":
      case "image":
      case "link":
        $("error", t), $("load", t);
        break;
      case "details":
        $("toggle", t);
        break;
      case "input":
        $("invalid", t), Af(t, u.value, u.defaultValue, u.checked, u.defaultChecked, u.type, u.name, !0);
        break;
      case "select":
        $("invalid", t);
        break;
      case "textarea":
        $("invalid", t), Mf(t, u.value, u.defaultValue, u.children);
    }
    a = u.children, typeof a != "string" && typeof a != "number" && typeof a != "bigint" || t.textContent === "" + a || u.suppressHydrationWarning === !0 || Md(t.textContent, a) ? (u.popover != null && ($("beforetoggle", t), $("toggle", t)), u.onScroll != null && $("scroll", t), u.onScrollEnd != null && $("scrollend", t), u.onClick != null && (t.onclick = Bt), t = !0) : t = !1, t || ua(l, !0);
  }
  function s0(l) {
    for (Gl = l.return; Gl; ) switch (Gl.tag) {
      case 5:
      case 31:
      case 13:
        rt = !1;
        return;
      case 27:
      case 3:
        rt = !0;
        return;
      default:
        Gl = Gl.return;
    }
  }
  function uu(l) {
    if (l !== Gl) return !1;
    if (!P) return s0(l), P = !0, !1;
    var t = l.tag, a;
    if ((a = t !== 3 && t !== 27) && ((a = t === 5) && (a = l.type, a = !(a !== "form" && a !== "button") || Qc(l.type, l.memoizedProps)), a = !a), a && yl && ua(l), s0(l), t === 13) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(s(317));
      yl = Cd(l);
    } else if (t === 31) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(s(317));
      yl = Cd(l);
    } else t === 27 ? (t = yl, oa(l.type) ? (l = Kc, Kc = null, yl = l) : yl = t) : yl = Gl ? _t(l.stateNode.nextSibling) : null;
    return !0;
  }
  function pa() {
    yl = Gl = null, P = !1;
  }
  function Ai() {
    var l = aa;
    return l !== null && (Pl === null ? Pl = l : Pl.push.apply(Pl, l), aa = null), l;
  }
  function Zu(l) {
    aa === null ? aa = [l] : aa.push(l);
  }
  var Oi = d(null), Na = null, Gt = null;
  function ea(l, t, a) {
    U(Oi, t._currentValue), t._currentValue = a;
  }
  function Xt(l) {
    l._currentValue = Oi.current, _(Oi);
  }
  function Mi(l, t, a) {
    for (; l !== null; ) {
      var u = l.alternate;
      if ((l.childLanes & t) !== t ? (l.childLanes |= t, u !== null && (u.childLanes |= t)) : u !== null && (u.childLanes & t) !== t && (u.childLanes |= t), l === a) break;
      l = l.return;
    }
  }
  function Di(l, t, a, u) {
    var e = l.child;
    for (e !== null && (e.return = l); e !== null; ) {
      var n = e.dependencies;
      if (n !== null) {
        var i = e.child;
        n = n.firstContext;
        l: for (; n !== null; ) {
          var c = n;
          n = e;
          for (var f = 0; f < t.length; f++) if (c.context === t[f]) {
            n.lanes |= a, c = n.alternate, c !== null && (c.lanes |= a), Mi(n.return, a, l), u || (i = null);
            break l;
          }
          n = c.next;
        }
      } else if (e.tag === 18) {
        if (i = e.return, i === null) throw Error(s(341));
        i.lanes |= a, n = i.alternate, n !== null && (n.lanes |= a), Mi(i, a, l), i = null;
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
          it(e.pendingProps.value, i.value) || (l !== null ? l.push(c) : l = [c]);
        }
      } else if (e === nl.current) {
        if (i = e.alternate, i === null) throw Error(s(387));
        i.memoizedState.memoizedState !== e.memoizedState.memoizedState && (l !== null ? l.push(he) : l = [he]);
      }
      e = e.return;
    }
    l !== null && Di(t, l, a, u), t.flags |= 262144;
  }
  function Ve(l) {
    for (l = l.firstContext; l !== null; ) {
      if (!it(l.context._currentValue, l.memoizedValue)) return !0;
      l = l.next;
    }
    return !1;
  }
  function Ha(l) {
    Na = l, Gt = null, l = l.dependencies, l !== null && (l.firstContext = null);
  }
  function Xl(l) {
    return y0(Na, l);
  }
  function xe(l, t) {
    return Na === null && Ha(l), y0(l, t);
  }
  function y0(l, t) {
    var a = t._currentValue;
    if (t = {
      context: t,
      memoizedValue: a,
      next: null
    }, Gt === null) {
      if (l === null) throw Error(s(308));
      Gt = t, l.dependencies = {
        lanes: 0,
        firstContext: t
      }, l.flags |= 524288;
    } else Gt = Gt.next = t;
    return a;
  }
  var em = typeof AbortController < "u" ? AbortController : function() {
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
  }, nm = T.unstable_scheduleCallback, im = T.unstable_NormalPriority, Ul = {
    $$typeof: El,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function Ui() {
    return {
      controller: new em(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function Lu(l) {
    l.refCount--, l.refCount === 0 && nm(im, function() {
      l.controller.abort();
    });
  }
  var Vu = null, pi = 0, nu = 0, iu = null;
  function cm(l, t) {
    if (Vu === null) {
      var a = Vu = [];
      pi = 0, nu = jc(), iu = {
        status: "pending",
        value: void 0,
        then: function(u) {
          a.push(u);
        }
      };
    }
    return pi++, t.then(h0, h0), t;
  }
  function h0() {
    if (--pi === 0 && Vu !== null) {
      iu !== null && (iu.status = "fulfilled");
      var l = Vu;
      Vu = null, nu = 0, iu = null;
      for (var t = 0; t < l.length; t++) (0, l[t])();
    }
  }
  function fm(l, t) {
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
  var o0 = A.S;
  A.S = function(l, t) {
    $v = ut(), typeof t == "object" && t !== null && typeof t.then == "function" && cm(l, t), o0 !== null && o0(l, t);
  };
  var ja = d(null);
  function Ni() {
    var l = ja.current;
    return l !== null ? l : ml.pooledCache;
  }
  function Ke(l, t) {
    t === null ? U(ja, ja.current) : U(ja, t.pool);
  }
  function g0() {
    var l = Ni();
    return l === null ? null : {
      parent: Ul._currentValue,
      pool: l
    };
  }
  var cu = Error(s(460)), Hi = Error(s(474)), Je = Error(s(542)), we = { then: function() {
  } };
  function S0(l) {
    return l = l.status, l === "fulfilled" || l === "rejected";
  }
  function r0(l, t, a) {
    switch (a = l[a], a === void 0 ? l.push(t) : a !== t && (t.then(Bt, Bt), t = a), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw l = t.reason, z0(l), l;
      default:
        if (typeof t.status == "string") t.then(Bt, Bt);
        else {
          if (l = ml, l !== null && 100 < l.shellSuspendCounter) throw Error(s(482));
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
            throw l = t.reason, z0(l), l;
        }
        throw Ba = t, cu;
    }
  }
  function Ra(l) {
    try {
      var t = l._init;
      return t(l._payload);
    } catch (a) {
      throw a !== null && typeof a == "object" && typeof a.then == "function" ? (Ba = a, cu) : a;
    }
  }
  var Ba = null;
  function b0() {
    if (Ba === null) throw Error(s(459));
    var l = Ba;
    return Ba = null, l;
  }
  function z0(l) {
    if (l === cu || l === Je) throw Error(s(483));
  }
  var fu = null, xu = 0;
  function We(l) {
    var t = xu;
    return xu += 1, fu === null && (fu = []), r0(fu, l, t);
  }
  function Ku(l, t) {
    t = t.props.ref, l.ref = t !== void 0 ? t : null;
  }
  function $e(l, t) {
    throw t.$$typeof === ol ? Error(s(525)) : (l = Object.prototype.toString.call(t), Error(s(31, l === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : l)));
  }
  function _0(l) {
    function t(y, v) {
      if (l) {
        var h = y.deletions;
        h === null ? (y.deletions = [v], y.flags |= 16) : h.push(v);
      }
    }
    function a(y, v) {
      if (!l) return null;
      for (; v !== null; ) t(y, v), v = v.sibling;
      return null;
    }
    function u(y) {
      for (var v = /* @__PURE__ */ new Map(); y !== null; ) y.key !== null ? v.set(y.key, y) : v.set(y.index, y), y = y.sibling;
      return v;
    }
    function e(y, v) {
      return y = Yt(y, v), y.index = 0, y.sibling = null, y;
    }
    function n(y, v, h) {
      return y.index = h, l ? (h = y.alternate, h !== null ? (h = h.index, h < v ? (y.flags |= 67108866, v) : h) : (y.flags |= 67108866, v)) : (y.flags |= 1048576, v);
    }
    function i(y) {
      return l && y.alternate === null && (y.flags |= 67108866), y;
    }
    function c(y, v, h, b) {
      return v === null || v.tag !== 6 ? (v = bi(h, y.mode, b), v.return = y, v) : (v = e(v, h), v.return = y, v);
    }
    function f(y, v, h, b) {
      var Q = h.type;
      return Q === Rl ? r(y, v, h.props.children, b, h.key) : v !== null && (v.elementType === Q || typeof Q == "object" && Q !== null && Q.$$typeof === xl && Ra(Q) === v.type) ? (v = e(v, h.props), Ku(v, h), v.return = y, v) : (v = Ze(h.type, h.key, h.props, null, y.mode, b), Ku(v, h), v.return = y, v);
    }
    function o(y, v, h, b) {
      return v === null || v.tag !== 4 || v.stateNode.containerInfo !== h.containerInfo || v.stateNode.implementation !== h.implementation ? (v = zi(h, y.mode, b), v.return = y, v) : (v = e(v, h.children || []), v.return = y, v);
    }
    function r(y, v, h, b, Q) {
      return v === null || v.tag !== 7 ? (v = Ua(h, y.mode, b, Q), v.return = y, v) : (v = e(v, h), v.return = y, v);
    }
    function z(y, v, h) {
      if (typeof v == "string" && v !== "" || typeof v == "number" || typeof v == "bigint") return v = bi("" + v, y.mode, h), v.return = y, v;
      if (typeof v == "object" && v !== null) {
        switch (v.$$typeof) {
          case gl:
            return h = Ze(v.type, v.key, v.props, null, y.mode, h), Ku(h, v), h.return = y, h;
          case Dl:
            return v = zi(v, y.mode, h), v.return = y, v;
          case xl:
            return v = Ra(v), z(y, v, h);
        }
        if (O(v) || bl(v)) return v = Ua(v, y.mode, h, null), v.return = y, v;
        if (typeof v.then == "function") return z(y, We(v), h);
        if (v.$$typeof === El) return z(y, xe(y, v), h);
        $e(y, v);
      }
      return null;
    }
    function g(y, v, h, b) {
      var Q = v !== null ? v.key : null;
      if (typeof h == "string" && h !== "" || typeof h == "number" || typeof h == "bigint") return Q !== null ? null : c(y, v, "" + h, b);
      if (typeof h == "object" && h !== null) {
        switch (h.$$typeof) {
          case gl:
            return h.key === Q ? f(y, v, h, b) : null;
          case Dl:
            return h.key === Q ? o(y, v, h, b) : null;
          case xl:
            return h = Ra(h), g(y, v, h, b);
        }
        if (O(h) || bl(h)) return Q !== null ? null : r(y, v, h, b, null);
        if (typeof h.then == "function") return g(y, v, We(h), b);
        if (h.$$typeof === El) return g(y, v, xe(y, h), b);
        $e(y, h);
      }
      return null;
    }
    function S(y, v, h, b, Q) {
      if (typeof b == "string" && b !== "" || typeof b == "number" || typeof b == "bigint") return y = y.get(h) || null, c(v, y, "" + b, Q);
      if (typeof b == "object" && b !== null) {
        switch (b.$$typeof) {
          case gl:
            return y = y.get(b.key === null ? h : b.key) || null, f(v, y, b, Q);
          case Dl:
            return y = y.get(b.key === null ? h : b.key) || null, o(v, y, b, Q);
          case xl:
            return b = Ra(b), S(y, v, h, b, Q);
        }
        if (O(b) || bl(b)) return y = y.get(h) || null, r(v, y, b, Q, null);
        if (typeof b.then == "function") return S(y, v, h, We(b), Q);
        if (b.$$typeof === El) return S(y, v, h, xe(v, b), Q);
        $e(v, b);
      }
      return null;
    }
    function j(y, v, h, b) {
      for (var Q = null, al = null, B = v, x = v = 0, I = null; B !== null && x < h.length; x++) {
        B.index > x ? (I = B, B = null) : I = B.sibling;
        var ul = g(y, B, h[x], b);
        if (ul === null) {
          B === null && (B = I);
          break;
        }
        l && B && ul.alternate === null && t(y, B), v = n(ul, v, x), al === null ? Q = ul : al.sibling = ul, al = ul, B = I;
      }
      if (x === h.length) return a(y, B), P && qt(y, x), Q;
      if (B === null) {
        for (; x < h.length; x++) B = z(y, h[x], b), B !== null && (v = n(B, v, x), al === null ? Q = B : al.sibling = B, al = B);
        return P && qt(y, x), Q;
      }
      for (B = u(B); x < h.length; x++) I = S(B, y, x, h[x], b), I !== null && (l && I.alternate !== null && B.delete(I.key === null ? x : I.key), v = n(I, v, x), al === null ? Q = I : al.sibling = I, al = I);
      return l && B.forEach(function(za) {
        return t(y, za);
      }), P && qt(y, x), Q;
    }
    function Z(y, v, h, b) {
      if (h == null) throw Error(s(151));
      for (var Q = null, al = null, B = v, x = v = 0, I = null, ul = h.next(); B !== null && !ul.done; x++, ul = h.next()) {
        B.index > x ? (I = B, B = null) : I = B.sibling;
        var za = g(y, B, ul.value, b);
        if (za === null) {
          B === null && (B = I);
          break;
        }
        l && B && za.alternate === null && t(y, B), v = n(za, v, x), al === null ? Q = za : al.sibling = za, al = za, B = I;
      }
      if (ul.done) return a(y, B), P && qt(y, x), Q;
      if (B === null) {
        for (; !ul.done; x++, ul = h.next()) ul = z(y, ul.value, b), ul !== null && (v = n(ul, v, x), al === null ? Q = ul : al.sibling = ul, al = ul);
        return P && qt(y, x), Q;
      }
      for (B = u(B); !ul.done; x++, ul = h.next()) ul = S(B, y, x, ul.value, b), ul !== null && (l && ul.alternate !== null && B.delete(ul.key === null ? x : ul.key), v = n(ul, v, x), al === null ? Q = ul : al.sibling = ul, al = ul);
      return l && B.forEach(function(Ts) {
        return t(y, Ts);
      }), P && qt(y, x), Q;
    }
    function dl(y, v, h, b) {
      if (typeof h == "object" && h !== null && h.type === Rl && h.key === null && (h = h.props.children), typeof h == "object" && h !== null) {
        switch (h.$$typeof) {
          case gl:
            l: {
              for (var Q = h.key; v !== null; ) {
                if (v.key === Q) {
                  if (Q = h.type, Q === Rl) {
                    if (v.tag === 7) {
                      a(y, v.sibling), b = e(v, h.props.children), b.return = y, y = b;
                      break l;
                    }
                  } else if (v.elementType === Q || typeof Q == "object" && Q !== null && Q.$$typeof === xl && Ra(Q) === v.type) {
                    a(y, v.sibling), b = e(v, h.props), Ku(b, h), b.return = y, y = b;
                    break l;
                  }
                  a(y, v);
                  break;
                } else t(y, v);
                v = v.sibling;
              }
              h.type === Rl ? (b = Ua(h.props.children, y.mode, b, h.key), b.return = y, y = b) : (b = Ze(h.type, h.key, h.props, null, y.mode, b), Ku(b, h), b.return = y, y = b);
            }
            return i(y);
          case Dl:
            l: {
              for (Q = h.key; v !== null; ) {
                if (v.key === Q) if (v.tag === 4 && v.stateNode.containerInfo === h.containerInfo && v.stateNode.implementation === h.implementation) {
                  a(y, v.sibling), b = e(v, h.children || []), b.return = y, y = b;
                  break l;
                } else {
                  a(y, v);
                  break;
                }
                else t(y, v);
                v = v.sibling;
              }
              b = zi(h, y.mode, b), b.return = y, y = b;
            }
            return i(y);
          case xl:
            return h = Ra(h), dl(y, v, h, b);
        }
        if (O(h)) return j(y, v, h, b);
        if (bl(h)) {
          if (Q = bl(h), typeof Q != "function") throw Error(s(150));
          return h = Q.call(h), Z(y, v, h, b);
        }
        if (typeof h.then == "function") return dl(y, v, We(h), b);
        if (h.$$typeof === El) return dl(y, v, xe(y, h), b);
        $e(y, h);
      }
      return typeof h == "string" && h !== "" || typeof h == "number" || typeof h == "bigint" ? (h = "" + h, v !== null && v.tag === 6 ? (a(y, v.sibling), b = e(v, h), b.return = y, y = b) : (a(y, v), b = bi(h, y.mode, b), b.return = y, y = b), i(y)) : a(y, v);
    }
    return function(y, v, h, b) {
      try {
        xu = 0;
        var Q = dl(y, v, h, b);
        return fu = null, Q;
      } catch (B) {
        if (B === cu || B === Je) throw B;
        var al = ct(29, B, null, y.mode);
        return al.lanes = b, al.return = y, al;
      }
    };
  }
  var Ca = _0(!0), E0 = _0(!1), na = !1;
  function ji(l) {
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
  function Ya(l) {
    return {
      lane: l,
      tag: 0,
      payload: null,
      callback: null,
      next: null
    };
  }
  function qa(l, t, a) {
    var u = l.updateQueue;
    if (u === null) return null;
    if (u = u.shared, (el & 2) !== 0) {
      var e = u.pending;
      return e === null ? t.next = t : (t.next = e.next, e.next = t), u.pending = t, t = Qe(l), n0(l, null, a), t;
    }
    return Xe(l, u, t, a), Qe(l);
  }
  function Ju(l, t, a) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (a & 4194048) !== 0)) {
      var u = t.lanes;
      u &= l.pendingLanes, a |= u, t.lanes = a, sf(l, a);
    }
  }
  function Bi(l, t) {
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
  var Ci = !1;
  function wu() {
    if (Ci) {
      var l = iu;
      if (l !== null) throw l;
    }
  }
  function Wu(l, t, a, u) {
    Ci = !1;
    var e = l.updateQueue;
    na = !1;
    var n = e.firstBaseUpdate, i = e.lastBaseUpdate, c = e.shared.pending;
    if (c !== null) {
      e.shared.pending = null;
      var f = c, o = f.next;
      f.next = null, i === null ? n = o : i.next = o, i = f;
      var r = l.alternate;
      r !== null && (r = r.updateQueue, c = r.lastBaseUpdate, c !== i && (c === null ? r.firstBaseUpdate = o : c.next = o, r.lastBaseUpdate = f));
    }
    if (n !== null) {
      var z = e.baseState;
      i = 0, r = o = f = null, c = n;
      do {
        var g = c.lane & -536870913, S = g !== c.lane;
        if (S ? (F & g) === g : (u & g) === g) {
          g !== 0 && g === nu && (Ci = !0), r !== null && (r = r.next = {
            lane: 0,
            tag: c.tag,
            payload: c.payload,
            callback: null,
            next: null
          });
          l: {
            var j = l, Z = c;
            g = t;
            var dl = a;
            switch (Z.tag) {
              case 1:
                if (j = Z.payload, typeof j == "function") {
                  z = j.call(dl, z, g);
                  break l;
                }
                z = j;
                break l;
              case 3:
                j.flags = j.flags & -65537 | 128;
              case 0:
                if (j = Z.payload, g = typeof j == "function" ? j.call(dl, z, g) : j, g == null) break l;
                z = R({}, z, g);
                break l;
              case 2:
                na = !0;
            }
          }
          g = c.callback, g !== null && (l.flags |= 64, S && (l.flags |= 8192), S = e.callbacks, S === null ? e.callbacks = [g] : S.push(g));
        } else S = {
          lane: g,
          tag: c.tag,
          payload: c.payload,
          callback: c.callback,
          next: null
        }, r === null ? (o = r = S, f = z) : r = r.next = S, i |= g;
        if (c = c.next, c === null) {
          if (c = e.shared.pending, c === null) break;
          S = c, c = S.next, S.next = null, e.lastBaseUpdate = S, e.shared.pending = null;
        }
      } while (!0);
      r === null && (f = z), e.baseState = f, e.firstBaseUpdate = o, e.lastBaseUpdate = r, n === null && (e.shared.lanes = 0), da |= i, l.lanes = i, l.memoizedState = z;
    }
  }
  function T0(l, t) {
    if (typeof l != "function") throw Error(s(191, l));
    l.call(t);
  }
  function A0(l, t) {
    var a = l.callbacks;
    if (a !== null) for (l.callbacks = null, l = 0; l < a.length; l++) T0(a[l], t);
  }
  var vu = d(null), ke = d(0);
  function O0(l, t) {
    l = Wt, U(ke, l), U(vu, t), Wt = l | t.baseLanes;
  }
  function Yi() {
    U(ke, Wt), U(vu, vu.current);
  }
  function qi() {
    Wt = ke.current, _(vu), _(ke);
  }
  var ft = d(null), bt = null;
  function ia(l) {
    var t = l.alternate;
    U(Ol, Ol.current & 1), U(ft, l), bt === null && (t === null || vu.current !== null || t.memoizedState !== null) && (bt = l);
  }
  function Gi(l) {
    U(Ol, Ol.current), U(ft, l), bt === null && (bt = l);
  }
  function M0(l) {
    l.tag === 22 ? (U(Ol, Ol.current), U(ft, l), bt === null && (bt = l)) : ca(l);
  }
  function ca() {
    U(Ol, Ol.current), U(ft, ft.current);
  }
  function vt(l) {
    _(ft), bt === l && (bt = null), _(Ol);
  }
  var Ol = d(0);
  function Fe(l) {
    for (var t = l; t !== null; ) {
      if (t.tag === 13) {
        var a = t.memoizedState;
        if (a !== null && (a = a.dehydrated, a === null || Vc(a) || xc(a))) return t;
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
  var Qt = 0, V = null, fl = null, pl = null, Ie = !1, du = !1, Ga = !1, Pe = 0, $u = 0, mu = null, vm = 0;
  function zl() {
    throw Error(s(321));
  }
  function Xi(l, t) {
    if (t === null) return !1;
    for (var a = 0; a < t.length && a < l.length; a++) if (!it(l[a], t[a])) return !1;
    return !0;
  }
  function Qi(l, t, a, u, e, n) {
    return Qt = n, V = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, A.H = l === null || l.memoizedState === null ? vv : tc, Ga = !1, n = a(u, e), Ga = !1, du && (n = U0(t, a, u, e)), D0(l), n;
  }
  function D0(l) {
    A.H = Iu;
    var t = fl !== null && fl.next !== null;
    if (Qt = 0, pl = fl = V = null, Ie = !1, $u = 0, mu = null, t) throw Error(s(300));
    l === null || Nl || (l = l.dependencies, l !== null && Ve(l) && (Nl = !0));
  }
  function U0(l, t, a, u) {
    V = l;
    var e = 0;
    do {
      if (du && (mu = null), $u = 0, du = !1, 25 <= e) throw Error(s(301));
      if (e += 1, pl = fl = null, l.updateQueue != null) {
        var n = l.updateQueue;
        n.lastEffect = null, n.events = null, n.stores = null, n.memoCache != null && (n.memoCache.index = 0);
      }
      A.H = dv, n = t(a, u);
    } while (du);
    return n;
  }
  function dm() {
    var l = A.H, t = l.useState()[0];
    return t = typeof t.then == "function" ? ku(t) : t, l = l.useState()[0], (fl !== null ? fl.memoizedState : null) !== l && (V.flags |= 1024), t;
  }
  function Zi() {
    var l = Pe !== 0;
    return Pe = 0, l;
  }
  function Li(l, t, a) {
    t.updateQueue = l.updateQueue, t.flags &= -2053, l.lanes &= ~a;
  }
  function Vi(l) {
    if (Ie) {
      for (l = l.memoizedState; l !== null; ) {
        var t = l.queue;
        t !== null && (t.pending = null), l = l.next;
      }
      Ie = !1;
    }
    Qt = 0, pl = fl = V = null, du = !1, $u = Pe = 0, mu = null;
  }
  function Jl() {
    var l = {
      memoizedState: null,
      baseState: null,
      baseQueue: null,
      queue: null,
      next: null
    };
    return pl === null ? V.memoizedState = pl = l : pl = pl.next = l, pl;
  }
  function Ml() {
    if (fl === null) {
      var l = V.alternate;
      l = l !== null ? l.memoizedState : null;
    } else l = fl.next;
    var t = pl === null ? V.memoizedState : pl.next;
    if (t !== null) pl = t, fl = l;
    else {
      if (l === null)
        throw V.alternate === null ? Error(s(467)) : Error(s(310));
      fl = l, l = {
        memoizedState: fl.memoizedState,
        baseState: fl.baseState,
        baseQueue: fl.baseQueue,
        queue: fl.queue,
        next: null
      }, pl === null ? V.memoizedState = pl = l : pl = pl.next = l;
    }
    return pl;
  }
  function ln() {
    return {
      lastEffect: null,
      events: null,
      stores: null,
      memoCache: null
    };
  }
  function ku(l) {
    var t = $u;
    return $u += 1, mu === null && (mu = []), l = r0(mu, l, t), t = V, (pl === null ? t.memoizedState : pl.next) === null && (t = t.alternate, A.H = t === null || t.memoizedState === null ? vv : tc), l;
  }
  function tn(l) {
    if (l !== null && typeof l == "object") {
      if (typeof l.then == "function") return ku(l);
      if (l.$$typeof === El) return Xl(l);
    }
    throw Error(s(438, String(l)));
  }
  function xi(l) {
    var t = null, a = V.updateQueue;
    if (a !== null && (t = a.memoCache), t == null) {
      var u = V.alternate;
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
    }, a === null && (a = ln(), V.updateQueue = a), a.memoCache = t, a = t.data[t.index], a === void 0) for (a = t.data[t.index] = Array(l), u = 0; u < l; u++) a[u] = jt;
    return t.index++, a;
  }
  function Zt(l, t) {
    return typeof t == "function" ? t(l) : t;
  }
  function an(l) {
    return Ki(Ml(), fl, l);
  }
  function Ki(l, t, a) {
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
      var c = i = null, f = null, o = t, r = !1;
      do {
        var z = o.lane & -536870913;
        if (z !== o.lane ? (F & z) === z : (Qt & z) === z) {
          var g = o.revertLane;
          if (g === 0) f !== null && (f = f.next = {
            lane: 0,
            revertLane: 0,
            gesture: null,
            action: o.action,
            hasEagerState: o.hasEagerState,
            eagerState: o.eagerState,
            next: null
          }), z === nu && (r = !0);
          else if ((Qt & g) === g) {
            o = o.next, g === nu && (r = !0);
            continue;
          } else z = {
            lane: 0,
            revertLane: o.revertLane,
            gesture: null,
            action: o.action,
            hasEagerState: o.hasEagerState,
            eagerState: o.eagerState,
            next: null
          }, f === null ? (c = f = z, i = n) : f = f.next = z, V.lanes |= g, da |= g;
          z = o.action, Ga && a(n, z), n = o.hasEagerState ? o.eagerState : a(n, z);
        } else g = {
          lane: z,
          revertLane: o.revertLane,
          gesture: o.gesture,
          action: o.action,
          hasEagerState: o.hasEagerState,
          eagerState: o.eagerState,
          next: null
        }, f === null ? (c = f = g, i = n) : f = f.next = g, V.lanes |= z, da |= z;
        o = o.next;
      } while (o !== null && o !== t);
      if (f === null ? i = n : f.next = c, !it(n, l.memoizedState) && (Nl = !0, r && (a = iu, a !== null))) throw a;
      l.memoizedState = n, l.baseState = i, l.baseQueue = f, u.lastRenderedState = n;
    }
    return e === null && (u.lanes = 0), [l.memoizedState, u.dispatch];
  }
  function Ji(l) {
    var t = Ml(), a = t.queue;
    if (a === null) throw Error(s(311));
    a.lastRenderedReducer = l;
    var u = a.dispatch, e = a.pending, n = t.memoizedState;
    if (e !== null) {
      a.pending = null;
      var i = e = e.next;
      do
        n = l(n, i.action), i = i.next;
      while (i !== e);
      it(n, t.memoizedState) || (Nl = !0), t.memoizedState = n, t.baseQueue === null && (t.baseState = n), a.lastRenderedState = n;
    }
    return [n, u];
  }
  function p0(l, t, a) {
    var u = V, e = Ml(), n = P;
    if (n) {
      if (a === void 0) throw Error(s(407));
      a = a();
    } else a = t();
    var i = !it((fl || e).memoizedState, a);
    if (i && (e.memoizedState = a, Nl = !0), e = e.queue, $i(j0.bind(null, u, e, l), [l]), e.getSnapshot !== t || i || pl !== null && pl.memoizedState.tag & 1) {
      if (u.flags |= 2048, su(9, { destroy: void 0 }, H0.bind(null, u, e, a, t), null), ml === null) throw Error(s(349));
      n || (Qt & 127) !== 0 || N0(u, t, a);
    }
    return a;
  }
  function N0(l, t, a) {
    l.flags |= 16384, l = {
      getSnapshot: t,
      value: a
    }, t = V.updateQueue, t === null ? (t = ln(), V.updateQueue = t, t.stores = [l]) : (a = t.stores, a === null ? t.stores = [l] : a.push(l));
  }
  function H0(l, t, a, u) {
    t.value = a, t.getSnapshot = u, R0(t) && B0(l);
  }
  function j0(l, t, a) {
    return a(function() {
      R0(t) && B0(l);
    });
  }
  function R0(l) {
    var t = l.getSnapshot;
    l = l.value;
    try {
      var a = t();
      return !it(l, a);
    } catch {
      return !0;
    }
  }
  function B0(l) {
    var t = Da(l, 2);
    t !== null && lt(t, l, 2);
  }
  function wi(l) {
    var t = Jl();
    if (typeof l == "function") {
      var a = l;
      if (l = a(), Ga) {
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
      lastRenderedReducer: Zt,
      lastRenderedState: l
    }, t;
  }
  function C0(l, t, a, u) {
    return l.baseState = a, Ki(l, fl, typeof u == "function" ? u : Zt);
  }
  function mm(l, t, a, u, e) {
    if (nn(l)) throw Error(s(485));
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
      A.T !== null ? a(!0) : n.isTransition = !1, u(n), a = t.pending, a === null ? (n.next = t.pending = n, Y0(t, n)) : (n.next = a.next, t.pending = a.next = n);
    }
  }
  function Y0(l, t) {
    var a = t.action, u = t.payload, e = l.state;
    if (t.isTransition) {
      var n = A.T, i = {};
      A.T = i;
      try {
        var c = a(e, u), f = A.S;
        f !== null && f(i, c), q0(l, t, c);
      } catch (o) {
        Wi(l, t, o);
      } finally {
        n !== null && i.types !== null && (n.types = i.types), A.T = n;
      }
    } else try {
      n = a(e, u), q0(l, t, n);
    } catch (o) {
      Wi(l, t, o);
    }
  }
  function q0(l, t, a) {
    a !== null && typeof a == "object" && typeof a.then == "function" ? a.then(function(u) {
      G0(l, t, u);
    }, function(u) {
      return Wi(l, t, u);
    }) : G0(l, t, a);
  }
  function G0(l, t, a) {
    t.status = "fulfilled", t.value = a, X0(t), l.state = a, t = l.pending, t !== null && (a = t.next, a === t ? l.pending = null : (a = a.next, t.next = a, Y0(l, a)));
  }
  function Wi(l, t, a) {
    var u = l.pending;
    if (l.pending = null, u !== null) {
      u = u.next;
      do
        t.status = "rejected", t.reason = a, X0(t), t = t.next;
      while (t !== u);
    }
    l.action = null;
  }
  function X0(l) {
    l = l.listeners;
    for (var t = 0; t < l.length; t++) (0, l[t])();
  }
  function Q0(l, t) {
    return t;
  }
  function Z0(l, t) {
    if (P) {
      var a = ml.formState;
      if (a !== null) {
        l: {
          var u = V;
          if (P) {
            if (yl) {
              t: {
                for (var e = yl, n = rt; e.nodeType !== 8; ) {
                  if (!n) {
                    e = null;
                    break t;
                  }
                  if (e = _t(e.nextSibling), e === null) {
                    e = null;
                    break t;
                  }
                }
                n = e.data, e = n === "F!" || n === "F" ? e : null;
              }
              if (e) {
                yl = _t(e.nextSibling), u = e.data === "F!";
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
    return a = Jl(), a.memoizedState = a.baseState = t, u = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: Q0,
      lastRenderedState: t
    }, a.queue = u, a = iv.bind(null, V, u), u.dispatch = a, u = wi(!1), n = lc.bind(null, V, !1, u.queue), u = Jl(), e = {
      state: t,
      dispatch: null,
      action: l,
      pending: null
    }, u.queue = e, a = mm.bind(null, V, e, n, a), e.dispatch = a, u.memoizedState = l, [
      t,
      a,
      !1
    ];
  }
  function L0(l) {
    return V0(Ml(), fl, l);
  }
  function V0(l, t, a) {
    if (t = Ki(l, t, Q0)[0], l = an(Zt)[0], typeof t == "object" && t !== null && typeof t.then == "function") try {
      var u = ku(t);
    } catch (i) {
      throw i === cu ? Je : i;
    }
    else u = t;
    t = Ml();
    var e = t.queue, n = e.dispatch;
    return a !== t.memoizedState && (V.flags |= 2048, su(9, { destroy: void 0 }, sm.bind(null, e, a), null)), [
      u,
      n,
      l
    ];
  }
  function sm(l, t) {
    l.action = t;
  }
  function x0(l) {
    var t = Ml(), a = fl;
    if (a !== null) return V0(t, a, l);
    Ml(), t = t.memoizedState, a = Ml();
    var u = a.queue.dispatch;
    return a.memoizedState = l, [
      t,
      u,
      !1
    ];
  }
  function su(l, t, a, u) {
    return l = {
      tag: l,
      create: a,
      deps: u,
      inst: t,
      next: null
    }, t = V.updateQueue, t === null && (t = ln(), V.updateQueue = t), a = t.lastEffect, a === null ? t.lastEffect = l.next = l : (u = a.next, a.next = l, l.next = u, t.lastEffect = l), l;
  }
  function K0() {
    return Ml().memoizedState;
  }
  function un(l, t, a, u) {
    var e = Jl();
    V.flags |= l, e.memoizedState = su(1 | t, { destroy: void 0 }, a, u === void 0 ? null : u);
  }
  function en(l, t, a, u) {
    var e = Ml();
    u = u === void 0 ? null : u;
    var n = e.memoizedState.inst;
    fl !== null && u !== null && Xi(u, fl.memoizedState.deps) ? e.memoizedState = su(t, n, a, u) : (V.flags |= l, e.memoizedState = su(1 | t, n, a, u));
  }
  function J0(l, t) {
    un(8390656, 8, l, t);
  }
  function $i(l, t) {
    en(2048, 8, l, t);
  }
  function ym(l) {
    V.flags |= 4;
    var t = V.updateQueue;
    if (t === null) t = ln(), V.updateQueue = t, t.events = [l];
    else {
      var a = t.events;
      a === null ? t.events = [l] : a.push(l);
    }
  }
  function w0(l) {
    var t = Ml().memoizedState;
    return ym({
      ref: t,
      nextImpl: l
    }), function() {
      if ((el & 2) !== 0) throw Error(s(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function W0(l, t) {
    return en(4, 2, l, t);
  }
  function $0(l, t) {
    return en(4, 4, l, t);
  }
  function k0(l, t) {
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
  function F0(l, t, a) {
    a = a != null ? a.concat([l]) : null, en(4, 4, k0.bind(null, t, l), a);
  }
  function ki() {
  }
  function I0(l, t) {
    var a = Ml();
    t = t === void 0 ? null : t;
    var u = a.memoizedState;
    return t !== null && Xi(t, u[1]) ? u[0] : (a.memoizedState = [l, t], l);
  }
  function P0(l, t) {
    var a = Ml();
    t = t === void 0 ? null : t;
    var u = a.memoizedState;
    if (t !== null && Xi(t, u[1])) return u[0];
    if (u = l(), Ga) {
      It(!0);
      try {
        l();
      } finally {
        It(!1);
      }
    }
    return a.memoizedState = [u, t], u;
  }
  function Fi(l, t, a) {
    return a === void 0 || (Qt & 1073741824) !== 0 && (F & 261930) === 0 ? l.memoizedState = t : (l.memoizedState = a, l = Fv(), V.lanes |= l, da |= l, a);
  }
  function lv(l, t, a, u) {
    return it(a, t) ? a : vu.current !== null ? (l = Fi(l, a, u), it(l, t) || (Nl = !0), l) : (Qt & 42) === 0 || (Qt & 1073741824) !== 0 && (F & 261930) === 0 ? (Nl = !0, l.memoizedState = a) : (l = Fv(), V.lanes |= l, da |= l, t);
  }
  function tv(l, t, a, u, e) {
    var n = D.p;
    D.p = n !== 0 && 8 > n ? n : 8;
    var i = A.T, c = {};
    A.T = c, lc(l, !1, t, a);
    try {
      var f = e(), o = A.S;
      o !== null && o(c, f), f !== null && typeof f == "object" && typeof f.then == "function" ? Fu(l, t, fm(f, u), zt(l)) : Fu(l, t, u, zt(l));
    } catch (r) {
      Fu(l, t, {
        then: function() {
        },
        status: "rejected",
        reason: r
      }, zt());
    } finally {
      D.p = n, i !== null && c.types !== null && (i.types = c.types), A.T = i;
    }
  }
  function hm() {
  }
  function Ii(l, t, a, u) {
    if (l.tag !== 5) throw Error(s(476));
    var e = av(l).queue;
    tv(l, e, t, tl, a === null ? hm : function() {
      return uv(l), a(u);
    });
  }
  function av(l) {
    var t = l.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: tl,
      baseState: tl,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Zt,
        lastRenderedState: tl
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
        lastRenderedReducer: Zt,
        lastRenderedState: a
      },
      next: null
    }, l.memoizedState = t, l = l.alternate, l !== null && (l.memoizedState = t), t;
  }
  function uv(l) {
    var t = av(l);
    t.next === null && (t = l.alternate.memoizedState), Fu(l, t.next.queue, {}, zt());
  }
  function Pi() {
    return Xl(he);
  }
  function ev() {
    return Ml().memoizedState;
  }
  function nv() {
    return Ml().memoizedState;
  }
  function om(l) {
    for (var t = l.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var a = zt();
          l = Ya(a);
          var u = qa(t, l, a);
          u !== null && (lt(u, t, a), Ju(u, t, a)), t = { cache: Ui() }, l.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function gm(l, t, a) {
    var u = zt();
    a = {
      lane: u,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, nn(l) ? cv(t, a) : (a = Si(l, t, a, u), a !== null && (lt(a, l, u), fv(a, t, u)));
  }
  function iv(l, t, a) {
    Fu(l, t, a, zt());
  }
  function Fu(l, t, a, u) {
    var e = {
      lane: u,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    };
    if (nn(l)) cv(t, e);
    else {
      var n = l.alternate;
      if (l.lanes === 0 && (n === null || n.lanes === 0) && (n = t.lastRenderedReducer, n !== null)) try {
        var i = t.lastRenderedState, c = n(i, a);
        if (e.hasEagerState = !0, e.eagerState = c, it(c, i)) return Xe(l, t, e, 0), ml === null && Ge(), !1;
      } catch {
      }
      if (a = Si(l, t, e, u), a !== null) return lt(a, l, u), fv(a, t, u), !0;
    }
    return !1;
  }
  function lc(l, t, a, u) {
    if (u = {
      lane: 2,
      revertLane: jc(),
      gesture: null,
      action: u,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, nn(l)) {
      if (t) throw Error(s(479));
    } else t = Si(l, a, u, 2), t !== null && lt(t, l, 2);
  }
  function nn(l) {
    var t = l.alternate;
    return l === V || t !== null && t === V;
  }
  function cv(l, t) {
    du = Ie = !0;
    var a = l.pending;
    a === null ? t.next = t : (t.next = a.next, a.next = t), l.pending = t;
  }
  function fv(l, t, a) {
    if ((a & 4194048) !== 0) {
      var u = t.lanes;
      u &= l.pendingLanes, a |= u, t.lanes = a, sf(l, a);
    }
  }
  var Iu = {
    readContext: Xl,
    use: tn,
    useCallback: zl,
    useContext: zl,
    useEffect: zl,
    useImperativeHandle: zl,
    useLayoutEffect: zl,
    useInsertionEffect: zl,
    useMemo: zl,
    useReducer: zl,
    useRef: zl,
    useState: zl,
    useDebugValue: zl,
    useDeferredValue: zl,
    useTransition: zl,
    useSyncExternalStore: zl,
    useId: zl,
    useHostTransitionStatus: zl,
    useFormState: zl,
    useActionState: zl,
    useOptimistic: zl,
    useMemoCache: zl,
    useCacheRefresh: zl
  };
  Iu.useEffectEvent = zl;
  var vv = {
    readContext: Xl,
    use: tn,
    useCallback: function(l, t) {
      return Jl().memoizedState = [l, t === void 0 ? null : t], l;
    },
    useContext: Xl,
    useEffect: J0,
    useImperativeHandle: function(l, t, a) {
      a = a != null ? a.concat([l]) : null, un(4194308, 4, k0.bind(null, t, l), a);
    },
    useLayoutEffect: function(l, t) {
      return un(4194308, 4, l, t);
    },
    useInsertionEffect: function(l, t) {
      un(4, 2, l, t);
    },
    useMemo: function(l, t) {
      var a = Jl();
      t = t === void 0 ? null : t;
      var u = l();
      if (Ga) {
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
      var u = Jl();
      if (a !== void 0) {
        var e = a(t);
        if (Ga) {
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
      }, u.queue = l, l = l.dispatch = gm.bind(null, V, l), [u.memoizedState, l];
    },
    useRef: function(l) {
      var t = Jl();
      return l = { current: l }, t.memoizedState = l;
    },
    useState: function(l) {
      l = wi(l);
      var t = l.queue, a = iv.bind(null, V, t);
      return t.dispatch = a, [l.memoizedState, a];
    },
    useDebugValue: ki,
    useDeferredValue: function(l, t) {
      return Fi(Jl(), l, t);
    },
    useTransition: function() {
      var l = wi(!1);
      return l = tv.bind(null, V, l.queue, !0, !1), Jl().memoizedState = l, [!1, l];
    },
    useSyncExternalStore: function(l, t, a) {
      var u = V, e = Jl();
      if (P) {
        if (a === void 0) throw Error(s(407));
        a = a();
      } else {
        if (a = t(), ml === null) throw Error(s(349));
        (F & 127) !== 0 || N0(u, t, a);
      }
      e.memoizedState = a;
      var n = {
        value: a,
        getSnapshot: t
      };
      return e.queue = n, J0(j0.bind(null, u, n, l), [l]), u.flags |= 2048, su(9, { destroy: void 0 }, H0.bind(null, u, n, a, t), null), a;
    },
    useId: function() {
      var l = Jl(), t = ml.identifierPrefix;
      if (P) {
        var a = pt, u = Ut;
        a = (u & ~(1 << 32 - nt(u) - 1)).toString(32) + a, t = "_" + t + "R_" + a, a = Pe++, 0 < a && (t += "H" + a.toString(32)), t += "_";
      } else a = vm++, t = "_" + t + "r_" + a.toString(32) + "_";
      return l.memoizedState = t;
    },
    useHostTransitionStatus: Pi,
    useFormState: Z0,
    useActionState: Z0,
    useOptimistic: function(l) {
      var t = Jl();
      t.memoizedState = t.baseState = l;
      var a = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: null,
        lastRenderedState: null
      };
      return t.queue = a, t = lc.bind(null, V, !0, a), a.dispatch = t, [l, t];
    },
    useMemoCache: xi,
    useCacheRefresh: function() {
      return Jl().memoizedState = om.bind(null, V);
    },
    useEffectEvent: function(l) {
      var t = Jl(), a = { impl: l };
      return t.memoizedState = a, function() {
        if ((el & 2) !== 0) throw Error(s(440));
        return a.impl.apply(void 0, arguments);
      };
    }
  }, tc = {
    readContext: Xl,
    use: tn,
    useCallback: I0,
    useContext: Xl,
    useEffect: $i,
    useImperativeHandle: F0,
    useInsertionEffect: W0,
    useLayoutEffect: $0,
    useMemo: P0,
    useReducer: an,
    useRef: K0,
    useState: function() {
      return an(Zt);
    },
    useDebugValue: ki,
    useDeferredValue: function(l, t) {
      return lv(Ml(), fl.memoizedState, l, t);
    },
    useTransition: function() {
      var l = an(Zt)[0], t = Ml().memoizedState;
      return [typeof l == "boolean" ? l : ku(l), t];
    },
    useSyncExternalStore: p0,
    useId: ev,
    useHostTransitionStatus: Pi,
    useFormState: L0,
    useActionState: L0,
    useOptimistic: function(l, t) {
      return C0(Ml(), fl, l, t);
    },
    useMemoCache: xi,
    useCacheRefresh: nv
  };
  tc.useEffectEvent = w0;
  var dv = {
    readContext: Xl,
    use: tn,
    useCallback: I0,
    useContext: Xl,
    useEffect: $i,
    useImperativeHandle: F0,
    useInsertionEffect: W0,
    useLayoutEffect: $0,
    useMemo: P0,
    useReducer: Ji,
    useRef: K0,
    useState: function() {
      return Ji(Zt);
    },
    useDebugValue: ki,
    useDeferredValue: function(l, t) {
      var a = Ml();
      return fl === null ? Fi(a, l, t) : lv(a, fl.memoizedState, l, t);
    },
    useTransition: function() {
      var l = Ji(Zt)[0], t = Ml().memoizedState;
      return [typeof l == "boolean" ? l : ku(l), t];
    },
    useSyncExternalStore: p0,
    useId: ev,
    useHostTransitionStatus: Pi,
    useFormState: x0,
    useActionState: x0,
    useOptimistic: function(l, t) {
      var a = Ml();
      return fl !== null ? C0(a, fl, l, t) : (a.baseState = l, [l, a.queue.dispatch]);
    },
    useMemoCache: xi,
    useCacheRefresh: nv
  };
  dv.useEffectEvent = w0;
  function ac(l, t, a, u) {
    t = l.memoizedState, a = a(u, t), a = a == null ? t : R({}, t, a), l.memoizedState = a, l.lanes === 0 && (l.updateQueue.baseState = a);
  }
  var uc = {
    enqueueSetState: function(l, t, a) {
      l = l._reactInternals;
      var u = zt(), e = Ya(u);
      e.payload = t, a != null && (e.callback = a), t = qa(l, e, u), t !== null && (lt(t, l, u), Ju(t, l, u));
    },
    enqueueReplaceState: function(l, t, a) {
      l = l._reactInternals;
      var u = zt(), e = Ya(u);
      e.tag = 1, e.payload = t, a != null && (e.callback = a), t = qa(l, e, u), t !== null && (lt(t, l, u), Ju(t, l, u));
    },
    enqueueForceUpdate: function(l, t) {
      l = l._reactInternals;
      var a = zt(), u = Ya(a);
      u.tag = 2, t != null && (u.callback = t), t = qa(l, u, a), t !== null && (lt(t, l, a), Ju(t, l, a));
    }
  };
  function mv(l, t, a, u, e, n, i) {
    return l = l.stateNode, typeof l.shouldComponentUpdate == "function" ? l.shouldComponentUpdate(u, n, i) : t.prototype && t.prototype.isPureReactComponent ? !Gu(a, u) || !Gu(e, n) : !0;
  }
  function sv(l, t, a, u) {
    l = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(a, u), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(a, u), t.state !== l && uc.enqueueReplaceState(t, t.state, null);
  }
  function Xa(l, t) {
    var a = t;
    if ("ref" in t) {
      a = {};
      for (var u in t) u !== "ref" && (a[u] = t[u]);
    }
    if (l = l.defaultProps) {
      a === t && (a = R({}, a));
      for (var e in l) a[e] === void 0 && (a[e] = l[e]);
    }
    return a;
  }
  function Sm(l) {
    qe(l);
  }
  function rm(l) {
    console.error(l);
  }
  function bm(l) {
    qe(l);
  }
  function cn(l, t) {
    try {
      var a = l.onUncaughtError;
      a(t.value, { componentStack: t.stack });
    } catch (u) {
      setTimeout(function() {
        throw u;
      });
    }
  }
  function yv(l, t, a) {
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
  function ec(l, t, a) {
    return a = Ya(a), a.tag = 3, a.payload = { element: null }, a.callback = function() {
      cn(l, t);
    }, a;
  }
  function hv(l) {
    return l = Ya(l), l.tag = 3, l;
  }
  function ov(l, t, a, u) {
    var e = a.type.getDerivedStateFromError;
    if (typeof e == "function") {
      var n = u.value;
      l.payload = function() {
        return e(n);
      }, l.callback = function() {
        yv(t, a, u);
      };
    }
    var i = a.stateNode;
    i !== null && typeof i.componentDidCatch == "function" && (l.callback = function() {
      yv(t, a, u), typeof e != "function" && (ma === null ? ma = /* @__PURE__ */ new Set([this]) : ma.add(this));
      var c = u.stack;
      this.componentDidCatch(u.value, { componentStack: c !== null ? c : "" });
    });
  }
  function zm(l, t, a, u, e) {
    if (a.flags |= 32768, u !== null && typeof u == "object" && typeof u.then == "function") {
      if (t = a.alternate, t !== null && eu(t, a, e, !0), a = ft.current, a !== null) {
        switch (a.tag) {
          case 31:
          case 13:
            return bt === null ? bn() : a.alternate === null && _l === 0 && (_l = 3), a.flags &= -257, a.flags |= 65536, a.lanes = e, u === we ? a.flags |= 16384 : (t = a.updateQueue, t === null ? a.updateQueue = /* @__PURE__ */ new Set([u]) : t.add(u), pc(l, u, e)), !1;
          case 22:
            return a.flags |= 65536, u === we ? a.flags |= 16384 : (t = a.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([u])
            }, a.updateQueue = t) : (a = t.retryQueue, a === null ? t.retryQueue = /* @__PURE__ */ new Set([u]) : a.add(u)), pc(l, u, e)), !1;
        }
        throw Error(s(435, a.tag));
      }
      return pc(l, u, e), bn(), !1;
    }
    if (P) return t = ft.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = e, u !== Ti && (l = Error(s(422), { cause: u }), Zu(ot(l, a)))) : (u !== Ti && (t = Error(s(423), { cause: u }), Zu(ot(t, a))), l = l.current.alternate, l.flags |= 65536, e &= -e, l.lanes |= e, u = ot(u, a), e = ec(l.stateNode, u, e), Bi(l, e), _l !== 4 && (_l = 2)), !1;
    var n = Error(s(520), { cause: u });
    if (n = ot(n, a), ie === null ? ie = [n] : ie.push(n), _l !== 4 && (_l = 2), t === null) return !0;
    u = ot(u, a), a = t;
    do {
      switch (a.tag) {
        case 3:
          return a.flags |= 65536, l = e & -e, a.lanes |= l, l = ec(a.stateNode, u, l), Bi(a, l), !1;
        case 1:
          if (t = a.type, n = a.stateNode, (a.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || n !== null && typeof n.componentDidCatch == "function" && (ma === null || !ma.has(n)))) return a.flags |= 65536, e &= -e, a.lanes |= e, e = hv(e), ov(e, l, a, u), Bi(a, e), !1;
      }
      a = a.return;
    } while (a !== null);
    return !1;
  }
  var nc = Error(s(461)), Nl = !1;
  function Ql(l, t, a, u) {
    t.child = l === null ? E0(t, null, a, u) : Ca(t, l.child, a, u);
  }
  function gv(l, t, a, u, e) {
    a = a.render;
    var n = t.ref;
    if ("ref" in u) {
      var i = {};
      for (var c in u) c !== "ref" && (i[c] = u[c]);
    } else i = u;
    return Ha(t), u = Qi(l, t, a, i, n, e), c = Zi(), l !== null && !Nl ? (Li(l, t, e), Lt(l, t, e)) : (P && c && _i(t), t.flags |= 1, Ql(l, t, u, e), t.child);
  }
  function Sv(l, t, a, u, e) {
    if (l === null) {
      var n = a.type;
      return typeof n == "function" && !ri(n) && n.defaultProps === void 0 && a.compare === null ? (t.tag = 15, t.type = n, rv(l, t, n, u, e)) : (l = Ze(a.type, null, u, t, t.mode, e), l.ref = t.ref, l.return = t, t.child = l);
    }
    if (n = l.child, !yc(l, e)) {
      var i = n.memoizedProps;
      if (a = a.compare, a = a !== null ? a : Gu, a(i, u) && l.ref === t.ref) return Lt(l, t, e);
    }
    return t.flags |= 1, l = Yt(n, u), l.ref = t.ref, l.return = t, t.child = l;
  }
  function rv(l, t, a, u, e) {
    if (l !== null) {
      var n = l.memoizedProps;
      if (Gu(n, u) && l.ref === t.ref) if (Nl = !1, t.pendingProps = u = n, yc(l, e)) (l.flags & 131072) !== 0 && (Nl = !0);
      else return t.lanes = l.lanes, Lt(l, t, e);
    }
    return ic(l, t, a, u, e);
  }
  function bv(l, t, a, u) {
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
        return zv(l, t, n, a, u);
      }
      if ((a & 536870912) !== 0) t.memoizedState = {
        baseLanes: 0,
        cachePool: null
      }, l !== null && Ke(t, n !== null ? n.cachePool : null), n !== null ? O0(t, n) : Yi(), M0(t);
      else return u = t.lanes = 536870912, zv(l, t, n !== null ? n.baseLanes | a : a, a, u);
    } else n !== null ? (Ke(t, n.cachePool), O0(t, n), ca(t), t.memoizedState = null) : (l !== null && Ke(t, null), Yi(), ca(t));
    return Ql(l, t, e, a), t.child;
  }
  function Pu(l, t) {
    return l !== null && l.tag === 22 || t.stateNode !== null || (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), t.sibling;
  }
  function zv(l, t, a, u, e) {
    var n = Ni();
    return n = n === null ? null : {
      parent: Ul._currentValue,
      pool: n
    }, t.memoizedState = {
      baseLanes: a,
      cachePool: n
    }, l !== null && Ke(t, null), Yi(), M0(t), l !== null && eu(l, t, u, !0), t.childLanes = e, null;
  }
  function fn(l, t) {
    return t = dn({
      mode: t.mode,
      children: t.children
    }, l.mode), t.ref = l.ref, l.child = t, t.return = l, t;
  }
  function _v(l, t, a) {
    return Ca(t, l.child, null, a), l = fn(t, t.pendingProps), l.flags |= 2, vt(t), t.memoizedState = null, l;
  }
  function _m(l, t, a) {
    var u = t.pendingProps, e = (t.flags & 128) !== 0;
    if (t.flags &= -129, l === null) {
      if (P) {
        if (u.mode === "hidden") return l = fn(t, u), t.lanes = 536870912, Pu(null, l);
        if (Gi(t), (l = yl) ? (l = Bd(l, rt), l = l !== null && l.data === "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: ta !== null ? {
            id: Ut,
            overflow: pt
          } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = c0(l), a.return = t, t.child = a, Gl = t, yl = null)) : l = null, l === null) throw ua(t);
        return t.lanes = 536870912, null;
      }
      return fn(t, u);
    }
    var n = l.memoizedState;
    if (n !== null) {
      var i = n.dehydrated;
      if (Gi(t), e) if (t.flags & 256) t.flags &= -257, t = _v(l, t, a);
      else if (t.memoizedState !== null) t.child = l.child, t.flags |= 128, t = null;
      else throw Error(s(558));
      else if (Nl || eu(l, t, a, !1), e = (a & l.childLanes) !== 0, Nl || e) {
        if (u = ml, u !== null && (i = yf(u, a), i !== 0 && i !== n.retryLane)) throw n.retryLane = i, Da(l, i), lt(u, l, i), nc;
        bn(), t = _v(l, t, a);
      } else l = n.treeContext, yl = _t(i.nextSibling), Gl = t, P = !0, aa = null, rt = !1, l !== null && d0(t, l), t = fn(t, u), t.flags |= 4096;
      return t;
    }
    return l = Yt(l.child, {
      mode: u.mode,
      children: u.children
    }), l.ref = t.ref, t.child = l, l.return = t, l;
  }
  function vn(l, t) {
    var a = t.ref;
    if (a === null) l !== null && l.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof a != "function" && typeof a != "object") throw Error(s(284));
      (l === null || l.ref !== a) && (t.flags |= 4194816);
    }
  }
  function ic(l, t, a, u, e) {
    return Ha(t), a = Qi(l, t, a, u, void 0, e), u = Zi(), l !== null && !Nl ? (Li(l, t, e), Lt(l, t, e)) : (P && u && _i(t), t.flags |= 1, Ql(l, t, a, e), t.child);
  }
  function Ev(l, t, a, u, e, n) {
    return Ha(t), t.updateQueue = null, a = U0(t, u, a, e), D0(l), u = Zi(), l !== null && !Nl ? (Li(l, t, n), Lt(l, t, n)) : (P && u && _i(t), t.flags |= 1, Ql(l, t, a, n), t.child);
  }
  function Tv(l, t, a, u, e) {
    if (Ha(t), t.stateNode === null) {
      var n = lu, i = a.contextType;
      typeof i == "object" && i !== null && (n = Xl(i)), n = new a(u, n), t.memoizedState = n.state !== null && n.state !== void 0 ? n.state : null, n.updater = uc, t.stateNode = n, n._reactInternals = t, n = t.stateNode, n.props = u, n.state = t.memoizedState, n.refs = {}, ji(t), i = a.contextType, n.context = typeof i == "object" && i !== null ? Xl(i) : lu, n.state = t.memoizedState, i = a.getDerivedStateFromProps, typeof i == "function" && (ac(t, a, i, u), n.state = t.memoizedState), typeof a.getDerivedStateFromProps == "function" || typeof n.getSnapshotBeforeUpdate == "function" || typeof n.UNSAFE_componentWillMount != "function" && typeof n.componentWillMount != "function" || (i = n.state, typeof n.componentWillMount == "function" && n.componentWillMount(), typeof n.UNSAFE_componentWillMount == "function" && n.UNSAFE_componentWillMount(), i !== n.state && uc.enqueueReplaceState(n, n.state, null), Wu(t, u, n, e), wu(), n.state = t.memoizedState), typeof n.componentDidMount == "function" && (t.flags |= 4194308), u = !0;
    } else if (l === null) {
      n = t.stateNode;
      var c = t.memoizedProps, f = Xa(a, c);
      n.props = f;
      var o = n.context, r = a.contextType;
      i = lu, typeof r == "object" && r !== null && (i = Xl(r));
      var z = a.getDerivedStateFromProps;
      r = typeof z == "function" || typeof n.getSnapshotBeforeUpdate == "function", c = t.pendingProps !== c, r || typeof n.UNSAFE_componentWillReceiveProps != "function" && typeof n.componentWillReceiveProps != "function" || (c || o !== i) && sv(t, n, u, i), na = !1;
      var g = t.memoizedState;
      n.state = g, Wu(t, u, n, e), wu(), o = t.memoizedState, c || g !== o || na ? (typeof z == "function" && (ac(t, a, z, u), o = t.memoizedState), (f = na || mv(t, a, f, u, g, o, i)) ? (r || typeof n.UNSAFE_componentWillMount != "function" && typeof n.componentWillMount != "function" || (typeof n.componentWillMount == "function" && n.componentWillMount(), typeof n.UNSAFE_componentWillMount == "function" && n.UNSAFE_componentWillMount()), typeof n.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof n.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = u, t.memoizedState = o), n.props = u, n.state = o, n.context = i, u = f) : (typeof n.componentDidMount == "function" && (t.flags |= 4194308), u = !1);
    } else {
      n = t.stateNode, Ri(l, t), i = t.memoizedProps, r = Xa(a, i), n.props = r, z = t.pendingProps, g = n.context, o = a.contextType, f = lu, typeof o == "object" && o !== null && (f = Xl(o)), c = a.getDerivedStateFromProps, (o = typeof c == "function" || typeof n.getSnapshotBeforeUpdate == "function") || typeof n.UNSAFE_componentWillReceiveProps != "function" && typeof n.componentWillReceiveProps != "function" || (i !== z || g !== f) && sv(t, n, u, f), na = !1, g = t.memoizedState, n.state = g, Wu(t, u, n, e), wu();
      var S = t.memoizedState;
      i !== z || g !== S || na || l !== null && l.dependencies !== null && Ve(l.dependencies) ? (typeof c == "function" && (ac(t, a, c, u), S = t.memoizedState), (r = na || mv(t, a, r, u, g, S, f) || l !== null && l.dependencies !== null && Ve(l.dependencies)) ? (o || typeof n.UNSAFE_componentWillUpdate != "function" && typeof n.componentWillUpdate != "function" || (typeof n.componentWillUpdate == "function" && n.componentWillUpdate(u, S, f), typeof n.UNSAFE_componentWillUpdate == "function" && n.UNSAFE_componentWillUpdate(u, S, f)), typeof n.componentDidUpdate == "function" && (t.flags |= 4), typeof n.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof n.componentDidUpdate != "function" || i === l.memoizedProps && g === l.memoizedState || (t.flags |= 4), typeof n.getSnapshotBeforeUpdate != "function" || i === l.memoizedProps && g === l.memoizedState || (t.flags |= 1024), t.memoizedProps = u, t.memoizedState = S), n.props = u, n.state = S, n.context = f, u = r) : (typeof n.componentDidUpdate != "function" || i === l.memoizedProps && g === l.memoizedState || (t.flags |= 4), typeof n.getSnapshotBeforeUpdate != "function" || i === l.memoizedProps && g === l.memoizedState || (t.flags |= 1024), u = !1);
    }
    return n = u, vn(l, t), u = (t.flags & 128) !== 0, n || u ? (n = t.stateNode, a = u && typeof a.getDerivedStateFromError != "function" ? null : n.render(), t.flags |= 1, l !== null && u ? (t.child = Ca(t, l.child, null, e), t.child = Ca(t, null, a, e)) : Ql(l, t, a, e), t.memoizedState = n.state, l = t.child) : l = Lt(l, t, e), l;
  }
  function Av(l, t, a, u) {
    return pa(), t.flags |= 256, Ql(l, t, a, u), t.child;
  }
  var cc = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  function fc(l) {
    return {
      baseLanes: l,
      cachePool: g0()
    };
  }
  function vc(l, t, a) {
    return l = l !== null ? l.childLanes & ~a : 0, t && (l |= mt), l;
  }
  function Ov(l, t, a) {
    var u = t.pendingProps, e = !1, n = (t.flags & 128) !== 0, i;
    if ((i = n) || (i = l !== null && l.memoizedState === null ? !1 : (Ol.current & 2) !== 0), i && (e = !0, t.flags &= -129), i = (t.flags & 32) !== 0, t.flags &= -33, l === null) {
      if (P) {
        if (e ? ia(t) : ca(t), (l = yl) ? (l = Bd(l, rt), l = l !== null && l.data !== "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: ta !== null ? {
            id: Ut,
            overflow: pt
          } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = c0(l), a.return = t, t.child = a, Gl = t, yl = null)) : l = null, l === null) throw ua(t);
        return xc(l) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var c = u.children;
      return u = u.fallback, e ? (ca(t), e = t.mode, c = dn({
        mode: "hidden",
        children: c
      }, e), u = Ua(u, e, a, null), c.return = t, u.return = t, c.sibling = u, t.child = c, u = t.child, u.memoizedState = fc(a), u.childLanes = vc(l, i, a), t.memoizedState = cc, Pu(null, u)) : (ia(t), dc(t, c));
    }
    var f = l.memoizedState;
    if (f !== null && (c = f.dehydrated, c !== null)) {
      if (n) t.flags & 256 ? (ia(t), t.flags &= -257, t = mc(l, t, a)) : t.memoizedState !== null ? (ca(t), t.child = l.child, t.flags |= 128, t = null) : (ca(t), c = u.fallback, e = t.mode, u = dn({
        mode: "visible",
        children: u.children
      }, e), c = Ua(c, e, a, null), c.flags |= 2, u.return = t, c.return = t, u.sibling = c, t.child = u, Ca(t, l.child, null, a), u = t.child, u.memoizedState = fc(a), u.childLanes = vc(l, i, a), t.memoizedState = cc, t = Pu(null, u));
      else if (ia(t), xc(c)) {
        if (i = c.nextSibling && c.nextSibling.dataset, i) var o = i.dgst;
        i = o, u = Error(s(419)), u.stack = "", u.digest = i, Zu({
          value: u,
          source: null,
          stack: null
        }), t = mc(l, t, a);
      } else if (Nl || eu(l, t, a, !1), i = (a & l.childLanes) !== 0, Nl || i) {
        if (i = ml, i !== null && (u = yf(i, a), u !== 0 && u !== f.retryLane)) throw f.retryLane = u, Da(l, u), lt(i, l, u), nc;
        Vc(c) || bn(), t = mc(l, t, a);
      } else Vc(c) ? (t.flags |= 192, t.child = l.child, t = null) : (l = f.treeContext, yl = _t(c.nextSibling), Gl = t, P = !0, aa = null, rt = !1, l !== null && d0(t, l), t = dc(t, u.children), t.flags |= 4096);
      return t;
    }
    return e ? (ca(t), c = u.fallback, e = t.mode, f = l.child, o = f.sibling, u = Yt(f, {
      mode: "hidden",
      children: u.children
    }), u.subtreeFlags = f.subtreeFlags & 65011712, o !== null ? c = Yt(o, c) : (c = Ua(c, e, a, null), c.flags |= 2), c.return = t, u.return = t, u.sibling = c, t.child = u, Pu(null, u), u = t.child, c = l.child.memoizedState, c === null ? c = fc(a) : (e = c.cachePool, e !== null ? (f = Ul._currentValue, e = e.parent !== f ? {
      parent: f,
      pool: f
    } : e) : e = g0(), c = {
      baseLanes: c.baseLanes | a,
      cachePool: e
    }), u.memoizedState = c, u.childLanes = vc(l, i, a), t.memoizedState = cc, Pu(l.child, u)) : (ia(t), a = l.child, l = a.sibling, a = Yt(a, {
      mode: "visible",
      children: u.children
    }), a.return = t, a.sibling = null, l !== null && (i = t.deletions, i === null ? (t.deletions = [l], t.flags |= 16) : i.push(l)), t.child = a, t.memoizedState = null, a);
  }
  function dc(l, t) {
    return t = dn({
      mode: "visible",
      children: t
    }, l.mode), t.return = l, l.child = t;
  }
  function dn(l, t) {
    return l = ct(22, l, null, t), l.lanes = 0, l;
  }
  function mc(l, t, a) {
    return Ca(t, l.child, null, a), l = dc(t, t.pendingProps.children), l.flags |= 2, t.memoizedState = null, l;
  }
  function Mv(l, t, a) {
    l.lanes |= t;
    var u = l.alternate;
    u !== null && (u.lanes |= t), Mi(l.return, t, a);
  }
  function sc(l, t, a, u, e, n) {
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
  function Dv(l, t, a) {
    var u = t.pendingProps, e = u.revealOrder, n = u.tail;
    u = u.children;
    var i = Ol.current, c = (i & 2) !== 0;
    if (c ? (i = i & 1 | 2, t.flags |= 128) : i &= 1, U(Ol, i), Ql(l, t, u, a), u = P ? Qu : 0, !c && l !== null && (l.flags & 128) !== 0) l: for (l = t.child; l !== null; ) {
      if (l.tag === 13) l.memoizedState !== null && Mv(l, a, t);
      else if (l.tag === 19) Mv(l, a, t);
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
        for (a = t.child, e = null; a !== null; ) l = a.alternate, l !== null && Fe(l) === null && (e = a), a = a.sibling;
        a = e, a === null ? (e = t.child, t.child = null) : (e = a.sibling, a.sibling = null), sc(t, !1, e, a, n, u);
        break;
      case "backwards":
      case "unstable_legacy-backwards":
        for (a = null, e = t.child, t.child = null; e !== null; ) {
          if (l = e.alternate, l !== null && Fe(l) === null) {
            t.child = e;
            break;
          }
          l = e.sibling, e.sibling = a, a = e, e = l;
        }
        sc(t, !0, a, null, n, u);
        break;
      case "together":
        sc(t, !1, null, null, void 0, u);
        break;
      default:
        t.memoizedState = null;
    }
    return t.child;
  }
  function Lt(l, t, a) {
    if (l !== null && (t.dependencies = l.dependencies), da |= t.lanes, (a & t.childLanes) === 0) if (l !== null) {
      if (eu(l, t, a, !1), (a & t.childLanes) === 0) return null;
    } else return null;
    if (l !== null && t.child !== l.child) throw Error(s(153));
    if (t.child !== null) {
      for (l = t.child, a = Yt(l, l.pendingProps), t.child = a, a.return = t; l.sibling !== null; ) l = l.sibling, a = a.sibling = Yt(l, l.pendingProps), a.return = t;
      a.sibling = null;
    }
    return t.child;
  }
  function yc(l, t) {
    return (l.lanes & t) !== 0 ? !0 : (l = l.dependencies, !!(l !== null && Ve(l)));
  }
  function Em(l, t, a) {
    switch (t.tag) {
      case 3:
        Kl(t, t.stateNode.containerInfo), ea(t, Ul, l.memoizedState.cache), pa();
        break;
      case 27:
      case 5:
        Ou(t);
        break;
      case 4:
        Kl(t, t.stateNode.containerInfo);
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
          return u.dehydrated !== null ? (ia(t), t.flags |= 128, null) : (a & t.child.childLanes) !== 0 ? Ov(l, t, a) : (ia(t), l = Lt(l, t, a), l !== null ? l.sibling : null);
        ia(t);
        break;
      case 19:
        var e = (l.flags & 128) !== 0;
        if (u = (a & t.childLanes) !== 0, u || (eu(l, t, a, !1), u = (a & t.childLanes) !== 0), e) {
          if (u) return Dv(l, t, a);
          t.flags |= 128;
        }
        if (e = t.memoizedState, e !== null && (e.rendering = null, e.tail = null, e.lastEffect = null), U(Ol, Ol.current), u) break;
        return null;
      case 22:
        return t.lanes = 0, bv(l, t, a, t.pendingProps);
      case 24:
        ea(t, Ul, l.memoizedState.cache);
    }
    return Lt(l, t, a);
  }
  function Uv(l, t, a) {
    if (l !== null) if (l.memoizedProps !== t.pendingProps) Nl = !0;
    else {
      if (!yc(l, a) && (t.flags & 128) === 0) return Nl = !1, Em(l, t, a);
      Nl = (l.flags & 131072) !== 0;
    }
    else Nl = !1, P && (t.flags & 1048576) !== 0 && v0(t, Qu, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        l: {
          var u = t.pendingProps;
          if (l = Ra(t.elementType), t.type = l, typeof l == "function") ri(l) ? (u = Xa(l, u), t.tag = 1, t = Tv(null, t, l, u, a)) : (t.tag = 0, t = ic(null, t, l, u, a));
          else {
            if (l != null) {
              var e = l.$$typeof;
              if (e === wl) {
                t.tag = 11, t = gv(null, t, l, u, a);
                break l;
              } else if (e === ll) {
                t.tag = 14, t = Sv(null, t, l, u, a);
                break l;
              }
            }
            throw t = rl(l) || l, Error(s(306, t, ""));
          }
        }
        return t;
      case 0:
        return ic(l, t, t.type, t.pendingProps, a);
      case 1:
        return u = t.type, e = Xa(u, t.pendingProps), Tv(l, t, u, e, a);
      case 3:
        l: {
          if (Kl(t, t.stateNode.containerInfo), l === null) throw Error(s(387));
          u = t.pendingProps;
          var n = t.memoizedState;
          e = n.element, Ri(l, t), Wu(t, u, null, a);
          var i = t.memoizedState;
          if (u = i.cache, ea(t, Ul, u), u !== n.cache && Di(t, [Ul], a, !0), wu(), u = i.element, n.isDehydrated) if (n = {
            element: u,
            isDehydrated: !1,
            cache: i.cache
          }, t.updateQueue.baseState = n, t.memoizedState = n, t.flags & 256) {
            t = Av(l, t, u, a);
            break l;
          } else if (u !== e) {
            e = ot(Error(s(424)), t), Zu(e), t = Av(l, t, u, a);
            break l;
          } else {
            switch (l = t.stateNode.containerInfo, l.nodeType) {
              case 9:
                l = l.body;
                break;
              default:
                l = l.nodeName === "HTML" ? l.ownerDocument.body : l;
            }
            for (yl = _t(l.firstChild), Gl = t, P = !0, aa = null, rt = !0, a = E0(t, null, u, a), t.child = a; a; ) a.flags = a.flags & -3 | 4096, a = a.sibling;
          }
          else {
            if (pa(), u === e) {
              t = Lt(l, t, a);
              break l;
            }
            Ql(l, t, u, a);
          }
          t = t.child;
        }
        return t;
      case 26:
        return vn(l, t), l === null ? (a = Qd(t.type, null, t.pendingProps, null)) ? t.memoizedState = a : P || (a = t.type, l = t.pendingProps, u = Mn(w.current).createElement(a), u[ql] = t, u[Wl] = l, Zl(u, a, l), Cl(u), t.stateNode = u) : t.memoizedState = Qd(t.type, l.memoizedProps, t.pendingProps, l.memoizedState), null;
      case 27:
        return Ou(t), l === null && P && (u = t.stateNode = qd(t.type, t.pendingProps, w.current), Gl = t, rt = !0, e = yl, oa(t.type) ? (Kc = e, yl = _t(u.firstChild)) : yl = e), Ql(l, t, t.pendingProps.children, a), vn(l, t), l === null && (t.flags |= 4194304), t.child;
      case 5:
        return l === null && P && ((e = u = yl) && (u = km(u, t.type, t.pendingProps, rt), u !== null ? (t.stateNode = u, Gl = t, yl = _t(u.firstChild), rt = !1, e = !0) : e = !1), e || ua(t)), Ou(t), e = t.type, n = t.pendingProps, i = l !== null ? l.memoizedProps : null, u = n.children, Qc(e, n) ? u = null : i !== null && Qc(e, i) && (t.flags |= 32), t.memoizedState !== null && (e = Qi(l, t, dm, null, null, a), he._currentValue = e), vn(l, t), Ql(l, t, u, a), t.child;
      case 6:
        return l === null && P && ((l = a = yl) && (a = Fm(a, t.pendingProps, rt), a !== null ? (t.stateNode = a, Gl = t, yl = null, l = !0) : l = !1), l || ua(t)), null;
      case 13:
        return Ov(l, t, a);
      case 4:
        return Kl(t, t.stateNode.containerInfo), u = t.pendingProps, l === null ? t.child = Ca(t, null, u, a) : Ql(l, t, u, a), t.child;
      case 11:
        return gv(l, t, t.type, t.pendingProps, a);
      case 7:
        return Ql(l, t, t.pendingProps, a), t.child;
      case 8:
        return Ql(l, t, t.pendingProps.children, a), t.child;
      case 12:
        return Ql(l, t, t.pendingProps.children, a), t.child;
      case 10:
        return u = t.pendingProps, ea(t, t.type, u.value), Ql(l, t, u.children, a), t.child;
      case 9:
        return e = t.type._context, u = t.pendingProps.children, Ha(t), e = Xl(e), u = u(e), t.flags |= 1, Ql(l, t, u, a), t.child;
      case 14:
        return Sv(l, t, t.type, t.pendingProps, a);
      case 15:
        return rv(l, t, t.type, t.pendingProps, a);
      case 19:
        return Dv(l, t, a);
      case 31:
        return _m(l, t, a);
      case 22:
        return bv(l, t, a, t.pendingProps);
      case 24:
        return Ha(t), u = Xl(Ul), l === null ? (e = Ni(), e === null && (e = ml, n = Ui(), e.pooledCache = n, n.refCount++, n !== null && (e.pooledCacheLanes |= a), e = n), t.memoizedState = {
          parent: u,
          cache: e
        }, ji(t), ea(t, Ul, e)) : ((l.lanes & a) !== 0 && (Ri(l, t), Wu(t, null, null, a), wu()), e = l.memoizedState, n = t.memoizedState, e.parent !== u ? (e = {
          parent: u,
          cache: u
        }, t.memoizedState = e, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = e), ea(t, Ul, u)) : (u = n.cache, ea(t, Ul, u), u !== e.cache && Di(t, [Ul], a, !0))), Ql(l, t, t.pendingProps.children, a), t.child;
      case 29:
        throw t.pendingProps;
    }
    throw Error(s(156, t.tag));
  }
  function Vt(l) {
    l.flags |= 4;
  }
  function hc(l, t, a, u, e) {
    if ((t = (l.mode & 32) !== 0) && (t = !1), t) {
      if (l.flags |= 16777216, (e & 335544128) === e) if (l.stateNode.complete) l.flags |= 8192;
      else if (td()) l.flags |= 8192;
      else throw Ba = we, Hi;
    } else l.flags &= -16777217;
  }
  function pv(l, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0) l.flags &= -16777217;
    else if (l.flags |= 16777216, !Kd(t)) if (td()) l.flags |= 8192;
    else throw Ba = we, Hi;
  }
  function mn(l, t) {
    t !== null && (l.flags |= 4), l.flags & 16384 && (t = l.tag !== 22 ? df() : 536870912, l.lanes |= t, gu |= t);
  }
  function le(l, t) {
    if (!P) switch (l.tailMode) {
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
  function hl(l) {
    var t = l.alternate !== null && l.alternate.child === l.child, a = 0, u = 0;
    if (t) for (var e = l.child; e !== null; ) a |= e.lanes | e.childLanes, u |= e.subtreeFlags & 65011712, u |= e.flags & 65011712, e.return = l, e = e.sibling;
    else for (e = l.child; e !== null; ) a |= e.lanes | e.childLanes, u |= e.subtreeFlags, u |= e.flags, e.return = l, e = e.sibling;
    return l.subtreeFlags |= u, l.childLanes = a, t;
  }
  function Tm(l, t, a) {
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
        return hl(t), null;
      case 1:
        return hl(t), null;
      case 3:
        return a = t.stateNode, u = null, l !== null && (u = l.memoizedState.cache), t.memoizedState.cache !== u && (t.flags |= 2048), Xt(Ul), Al(), a.pendingContext && (a.context = a.pendingContext, a.pendingContext = null), (l === null || l.child === null) && (uu(t) ? Vt(t) : l === null || l.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, Ai())), hl(t), null;
      case 26:
        var e = t.type, n = t.memoizedState;
        return l === null ? (Vt(t), n !== null ? (hl(t), pv(t, n)) : (hl(t), hc(t, e, null, u, a))) : n ? n !== l.memoizedState ? (Vt(t), hl(t), pv(t, n)) : (hl(t), t.flags &= -16777217) : (l = l.memoizedProps, l !== u && Vt(t), hl(t), hc(t, e, l, u, a)), null;
      case 27:
        if (ze(t), a = w.current, e = t.type, l !== null && t.stateNode != null) l.memoizedProps !== u && Vt(t);
        else {
          if (!u) {
            if (t.stateNode === null) throw Error(s(166));
            return hl(t), null;
          }
          l = q.current, uu(t) ? m0(t, l) : (l = qd(e, u, a), t.stateNode = l, Vt(t));
        }
        return hl(t), null;
      case 5:
        if (ze(t), e = t.type, l !== null && t.stateNode != null) l.memoizedProps !== u && Vt(t);
        else {
          if (!u) {
            if (t.stateNode === null) throw Error(s(166));
            return hl(t), null;
          }
          if (n = q.current, uu(t)) m0(t, n);
          else {
            var i = Mn(w.current);
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
            n[ql] = t, n[Wl] = u;
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
            l: switch (Zl(n, e, u), e) {
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
            u && Vt(t);
          }
        }
        return hl(t), hc(t, t.type, l === null ? null : l.memoizedProps, t.pendingProps, a), null;
      case 6:
        if (l && t.stateNode != null) l.memoizedProps !== u && Vt(t);
        else {
          if (typeof u != "string" && t.stateNode === null) throw Error(s(166));
          if (l = w.current, uu(t)) {
            if (l = t.stateNode, a = t.memoizedProps, u = null, e = Gl, e !== null) switch (e.tag) {
              case 27:
              case 5:
                u = e.memoizedProps;
            }
            l[ql] = t, l = !!(l.nodeValue === a || u !== null && u.suppressHydrationWarning === !0 || Md(l.nodeValue, a)), l || ua(t, !0);
          } else l = Mn(l).createTextNode(u), l[ql] = t, t.stateNode = l;
        }
        return hl(t), null;
      case 31:
        if (a = t.memoizedState, l === null || l.memoizedState !== null) {
          if (u = uu(t), a !== null) {
            if (l === null) {
              if (!u) throw Error(s(318));
              if (l = t.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(s(557));
              l[ql] = t;
            } else pa(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            hl(t), l = !1;
          } else a = Ai(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = a), l = !0;
          if (!l)
            return t.flags & 256 ? (vt(t), t) : (vt(t), null);
          if ((t.flags & 128) !== 0) throw Error(s(558));
        }
        return hl(t), null;
      case 13:
        if (u = t.memoizedState, l === null || l.memoizedState !== null && l.memoizedState.dehydrated !== null) {
          if (e = uu(t), u !== null && u.dehydrated !== null) {
            if (l === null) {
              if (!e) throw Error(s(318));
              if (e = t.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(s(317));
              e[ql] = t;
            } else pa(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            hl(t), e = !1;
          } else e = Ai(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = e), e = !0;
          if (!e)
            return t.flags & 256 ? (vt(t), t) : (vt(t), null);
        }
        return vt(t), (t.flags & 128) !== 0 ? (t.lanes = a, t) : (a = u !== null, l = l !== null && l.memoizedState !== null, a && (u = t.child, e = null, u.alternate !== null && u.alternate.memoizedState !== null && u.alternate.memoizedState.cachePool !== null && (e = u.alternate.memoizedState.cachePool.pool), n = null, u.memoizedState !== null && u.memoizedState.cachePool !== null && (n = u.memoizedState.cachePool.pool), n !== e && (u.flags |= 2048)), a !== l && a && (t.child.flags |= 8192), mn(t, t.updateQueue), hl(t), null);
      case 4:
        return Al(), l === null && Ed(t.stateNode.containerInfo), hl(t), null;
      case 10:
        return Xt(t.type), hl(t), null;
      case 19:
        if (_(Ol), u = t.memoizedState, u === null) return hl(t), null;
        if (e = (t.flags & 128) !== 0, n = u.rendering, n === null) if (e) le(u, !1);
        else {
          if (_l !== 0 || l !== null && (l.flags & 128) !== 0) for (l = t.child; l !== null; ) {
            if (n = Fe(l), n !== null) {
              for (t.flags |= 128, le(u, !1), l = n.updateQueue, t.updateQueue = l, mn(t, l), t.subtreeFlags = 0, l = a, a = t.child; a !== null; ) i0(a, l), a = a.sibling;
              return U(Ol, Ol.current & 1 | 2), P && qt(t, u.treeForkCount), t.child;
            }
            l = l.sibling;
          }
          u.tail !== null && ut() > gn && (t.flags |= 128, e = !0, le(u, !1), t.lanes = 4194304);
        }
        else {
          if (!e) if (l = Fe(n), l !== null) {
            if (t.flags |= 128, e = !0, l = l.updateQueue, t.updateQueue = l, mn(t, l), le(u, !0), u.tail === null && u.tailMode === "hidden" && !n.alternate && !P) return hl(t), null;
          } else 2 * ut() - u.renderingStartTime > gn && a !== 536870912 && (t.flags |= 128, e = !0, le(u, !1), t.lanes = 4194304);
          u.isBackwards ? (n.sibling = t.child, t.child = n) : (l = u.last, l !== null ? l.sibling = n : t.child = n, u.last = n);
        }
        return u.tail !== null ? (l = u.tail, u.rendering = l, u.tail = l.sibling, u.renderingStartTime = ut(), l.sibling = null, a = Ol.current, U(Ol, e ? a & 1 | 2 : a & 1), P && qt(t, u.treeForkCount), l) : (hl(t), null);
      case 22:
      case 23:
        return vt(t), qi(), u = t.memoizedState !== null, l !== null ? l.memoizedState !== null !== u && (t.flags |= 8192) : u && (t.flags |= 8192), u ? (a & 536870912) !== 0 && (t.flags & 128) === 0 && (hl(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : hl(t), a = t.updateQueue, a !== null && mn(t, a.retryQueue), a = null, l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), u = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (u = t.memoizedState.cachePool.pool), u !== a && (t.flags |= 2048), l !== null && _(ja), null;
      case 24:
        return a = null, l !== null && (a = l.memoizedState.cache), t.memoizedState.cache !== a && (t.flags |= 2048), Xt(Ul), hl(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(s(156, t.tag));
  }
  function Am(l, t) {
    switch (Ei(t), t.tag) {
      case 1:
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 3:
        return Xt(Ul), Al(), l = t.flags, (l & 65536) !== 0 && (l & 128) === 0 ? (t.flags = l & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return ze(t), null;
      case 31:
        if (t.memoizedState !== null) {
          if (vt(t), t.alternate === null) throw Error(s(340));
          pa();
        }
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 13:
        if (vt(t), l = t.memoizedState, l !== null && l.dehydrated !== null) {
          if (t.alternate === null) throw Error(s(340));
          pa();
        }
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 19:
        return _(Ol), null;
      case 4:
        return Al(), null;
      case 10:
        return Xt(t.type), null;
      case 22:
      case 23:
        return vt(t), qi(), l !== null && _(ja), l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 24:
        return Xt(Ul), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function Nv(l, t) {
    switch (Ei(t), t.tag) {
      case 3:
        Xt(Ul), Al();
        break;
      case 26:
      case 27:
      case 5:
        ze(t);
        break;
      case 4:
        Al();
        break;
      case 31:
        t.memoizedState !== null && vt(t);
        break;
      case 13:
        vt(t);
        break;
      case 19:
        _(Ol);
        break;
      case 10:
        Xt(t.type);
        break;
      case 22:
      case 23:
        vt(t), qi(), l !== null && _(ja);
        break;
      case 24:
        Xt(Ul);
    }
  }
  function te(l, t) {
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
      cl(t, t.return, c);
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
              var f = a, o = c;
              try {
                o();
              } catch (r) {
                cl(e, f, r);
              }
            }
          }
          u = u.next;
        } while (u !== n);
      }
    } catch (r) {
      cl(t, t.return, r);
    }
  }
  function Hv(l) {
    var t = l.updateQueue;
    if (t !== null) {
      var a = l.stateNode;
      try {
        A0(t, a);
      } catch (u) {
        cl(l, l.return, u);
      }
    }
  }
  function jv(l, t, a) {
    a.props = Xa(l.type, l.memoizedProps), a.state = l.memoizedState;
    try {
      a.componentWillUnmount();
    } catch (u) {
      cl(l, t, u);
    }
  }
  function ae(l, t) {
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
      cl(l, t, e);
    }
  }
  function Nt(l, t) {
    var a = l.ref, u = l.refCleanup;
    if (a !== null) if (typeof u == "function") try {
      u();
    } catch (e) {
      cl(l, t, e);
    } finally {
      l.refCleanup = null, l = l.alternate, l != null && (l.refCleanup = null);
    }
    else if (typeof a == "function") try {
      a(null);
    } catch (e) {
      cl(l, t, e);
    }
    else a.current = null;
  }
  function Rv(l) {
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
      cl(l, l.return, e);
    }
  }
  function oc(l, t, a) {
    try {
      var u = l.stateNode;
      xm(u, l.type, a, t), u[Wl] = t;
    } catch (e) {
      cl(l, l.return, e);
    }
  }
  function Bv(l) {
    return l.tag === 5 || l.tag === 3 || l.tag === 26 || l.tag === 27 && oa(l.type) || l.tag === 4;
  }
  function gc(l) {
    l: for (; ; ) {
      for (; l.sibling === null; ) {
        if (l.return === null || Bv(l.return)) return null;
        l = l.return;
      }
      for (l.sibling.return = l.return, l = l.sibling; l.tag !== 5 && l.tag !== 6 && l.tag !== 18; ) {
        if (l.tag === 27 && oa(l.type) || l.flags & 2 || l.child === null || l.tag === 4) continue l;
        l.child.return = l, l = l.child;
      }
      if (!(l.flags & 2)) return l.stateNode;
    }
  }
  function Sc(l, t, a) {
    var u = l.tag;
    if (u === 5 || u === 6) l = l.stateNode, t ? (a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a).insertBefore(l, t) : (t = a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a, t.appendChild(l), a = a._reactRootContainer, a != null || t.onclick !== null || (t.onclick = Bt));
    else if (u !== 4 && (u === 27 && oa(l.type) && (a = l.stateNode, t = null), l = l.child, l !== null)) for (Sc(l, t, a), l = l.sibling; l !== null; ) Sc(l, t, a), l = l.sibling;
  }
  function sn(l, t, a) {
    var u = l.tag;
    if (u === 5 || u === 6) l = l.stateNode, t ? a.insertBefore(l, t) : a.appendChild(l);
    else if (u !== 4 && (u === 27 && oa(l.type) && (a = l.stateNode), l = l.child, l !== null)) for (sn(l, t, a), l = l.sibling; l !== null; ) sn(l, t, a), l = l.sibling;
  }
  function Cv(l) {
    var t = l.stateNode, a = l.memoizedProps;
    try {
      for (var u = l.type, e = t.attributes; e.length; ) t.removeAttributeNode(e[0]);
      Zl(t, u, a), t[ql] = l, t[Wl] = a;
    } catch (n) {
      cl(l, l.return, n);
    }
  }
  var xt = !1, Hl = !1, rc = !1, Yv = typeof WeakSet == "function" ? WeakSet : Set, Yl = null;
  function Om(l, t) {
    if (l = l.containerInfo, Gc = Rn, l = Ff(l), mi(l)) {
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
          var i = 0, c = -1, f = -1, o = 0, r = 0, z = l, g = null;
          t: for (; ; ) {
            for (var S; z !== a || e !== 0 && z.nodeType !== 3 || (c = i + e), z !== n || u !== 0 && z.nodeType !== 3 || (f = i + u), z.nodeType === 3 && (i += z.nodeValue.length), (S = z.firstChild) !== null; )
              g = z, z = S;
            for (; ; ) {
              if (z === l) break t;
              if (g === a && ++o === e && (c = i), g === n && ++r === u && (f = i), (S = z.nextSibling) !== null) break;
              z = g, g = z.parentNode;
            }
            z = S;
          }
          a = c === -1 || f === -1 ? null : {
            start: c,
            end: f
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
    }, Rn = !1, Yl = t; Yl !== null; ) if (t = Yl, l = t.child, (t.subtreeFlags & 1028) !== 0 && l !== null) l.return = t, Yl = l;
    else for (; Yl !== null; ) {
      switch (t = Yl, n = t.alternate, l = t.flags, t.tag) {
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
              var j = Xa(a.type, e);
              l = u.getSnapshotBeforeUpdate(j, n), u.__reactInternalSnapshotBeforeUpdate = l;
            } catch (Z) {
              cl(a, a.return, Z);
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
        l.return = t.return, Yl = l;
        break;
      }
      Yl = t.return;
    }
  }
  function qv(l, t, a) {
    var u = a.flags;
    switch (a.tag) {
      case 0:
      case 11:
      case 15:
        Jt(l, a), u & 4 && te(5, a);
        break;
      case 1:
        if (Jt(l, a), u & 4) if (l = a.stateNode, t === null) try {
          l.componentDidMount();
        } catch (i) {
          cl(a, a.return, i);
        }
        else {
          var e = Xa(a.type, t.memoizedProps);
          t = t.memoizedState;
          try {
            l.componentDidUpdate(e, t, l.__reactInternalSnapshotBeforeUpdate);
          } catch (i) {
            cl(a, a.return, i);
          }
        }
        u & 64 && Hv(a), u & 512 && ae(a, a.return);
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
            cl(a, a.return, i);
          }
        }
        break;
      case 27:
        t === null && u & 4 && Cv(a);
      case 26:
      case 5:
        Jt(l, a), t === null && u & 4 && Rv(a), u & 512 && ae(a, a.return);
        break;
      case 12:
        Jt(l, a);
        break;
      case 31:
        Jt(l, a), u & 4 && Qv(l, a);
        break;
      case 13:
        Jt(l, a), u & 4 && Zv(l, a), u & 64 && (l = a.memoizedState, l !== null && (l = l.dehydrated, l !== null && (a = Bm.bind(null, a), Im(l, a))));
        break;
      case 22:
        if (u = a.memoizedState !== null || xt, !u) {
          t = t !== null && t.memoizedState !== null || Hl, e = xt;
          var n = Hl;
          xt = u, (Hl = t) && !n ? wt(l, a, (a.subtreeFlags & 8772) !== 0) : Jt(l, a), xt = e, Hl = n;
        }
        break;
      case 30:
        break;
      default:
        Jt(l, a);
    }
  }
  function Gv(l) {
    var t = l.alternate;
    t !== null && (l.alternate = null, Gv(t)), l.child = null, l.deletions = null, l.sibling = null, l.tag === 5 && (t = l.stateNode, t !== null && Wn(t)), l.stateNode = null, l.return = null, l.dependencies = null, l.memoizedProps = null, l.memoizedState = null, l.pendingProps = null, l.stateNode = null, l.updateQueue = null;
  }
  var Sl = null, kl = !1;
  function Kt(l, t, a) {
    for (a = a.child; a !== null; ) Xv(l, t, a), a = a.sibling;
  }
  function Xv(l, t, a) {
    if (et && typeof et.onCommitFiberUnmount == "function") try {
      et.onCommitFiberUnmount(Mu, a);
    } catch {
    }
    switch (a.tag) {
      case 26:
        Hl || Nt(a, t), Kt(l, t, a), a.memoizedState ? a.memoizedState.count-- : a.stateNode && (a = a.stateNode, a.parentNode.removeChild(a));
        break;
      case 27:
        Hl || Nt(a, t);
        var u = Sl, e = kl;
        oa(a.type) && (Sl = a.stateNode, kl = !1), Kt(l, t, a), me(a.stateNode), Sl = u, kl = e;
        break;
      case 5:
        Hl || Nt(a, t);
      case 6:
        if (u = Sl, e = kl, Sl = null, Kt(l, t, a), Sl = u, kl = e, Sl !== null) if (kl) try {
          (Sl.nodeType === 9 ? Sl.body : Sl.nodeName === "HTML" ? Sl.ownerDocument.body : Sl).removeChild(a.stateNode);
        } catch (n) {
          cl(a, t, n);
        }
        else try {
          Sl.removeChild(a.stateNode);
        } catch (n) {
          cl(a, t, n);
        }
        break;
      case 18:
        Sl !== null && (kl ? (l = Sl, jd(l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l, a.stateNode), Au(l)) : jd(Sl, a.stateNode));
        break;
      case 4:
        u = Sl, e = kl, Sl = a.stateNode.containerInfo, kl = !0, Kt(l, t, a), Sl = u, kl = e;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        fa(2, a, t), Hl || fa(4, a, t), Kt(l, t, a);
        break;
      case 1:
        Hl || (Nt(a, t), u = a.stateNode, typeof u.componentWillUnmount == "function" && jv(a, t, u)), Kt(l, t, a);
        break;
      case 21:
        Kt(l, t, a);
        break;
      case 22:
        Hl = (u = Hl) || a.memoizedState !== null, Kt(l, t, a), Hl = u;
        break;
      default:
        Kt(l, t, a);
    }
  }
  function Qv(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null))) {
      l = l.dehydrated;
      try {
        Au(l);
      } catch (a) {
        cl(t, t.return, a);
      }
    }
  }
  function Zv(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null && (l = l.dehydrated, l !== null)))) try {
      Au(l);
    } catch (a) {
      cl(t, t.return, a);
    }
  }
  function Mm(l) {
    switch (l.tag) {
      case 31:
      case 13:
      case 19:
        var t = l.stateNode;
        return t === null && (t = l.stateNode = new Yv()), t;
      case 22:
        return l = l.stateNode, t = l._retryCache, t === null && (t = l._retryCache = new Yv()), t;
      default:
        throw Error(s(435, l.tag));
    }
  }
  function yn(l, t) {
    var a = Mm(l);
    t.forEach(function(u) {
      if (!a.has(u)) {
        a.add(u);
        var e = Cm.bind(null, l, u);
        u.then(e, e);
      }
    });
  }
  function Fl(l, t) {
    var a = t.deletions;
    if (a !== null) for (var u = 0; u < a.length; u++) {
      var e = a[u], n = l, i = t, c = i;
      l: for (; c !== null; ) {
        switch (c.tag) {
          case 27:
            if (oa(c.type)) {
              Sl = c.stateNode, kl = !1;
              break l;
            }
            break;
          case 5:
            Sl = c.stateNode, kl = !1;
            break l;
          case 3:
          case 4:
            Sl = c.stateNode.containerInfo, kl = !0;
            break l;
        }
        c = c.return;
      }
      if (Sl === null) throw Error(s(160));
      Xv(n, i, e), Sl = null, kl = !1, n = e.alternate, n !== null && (n.return = null), e.return = null;
    }
    if (t.subtreeFlags & 13886) for (t = t.child; t !== null; ) Lv(t, l), t = t.sibling;
  }
  var Mt = null;
  function Lv(l, t) {
    var a = l.alternate, u = l.flags;
    switch (l.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        Fl(t, l), Il(l), u & 4 && (fa(3, l, l.return), te(3, l), fa(5, l, l.return));
        break;
      case 1:
        Fl(t, l), Il(l), u & 512 && (Hl || a === null || Nt(a, a.return)), u & 64 && xt && (l = l.updateQueue, l !== null && (u = l.callbacks, u !== null && (a = l.shared.hiddenCallbacks, l.shared.hiddenCallbacks = a === null ? u : a.concat(u))));
        break;
      case 26:
        var e = Mt;
        if (Fl(t, l), Il(l), u & 512 && (Hl || a === null || Nt(a, a.return)), u & 4) {
          var n = a !== null ? a.memoizedState : null;
          if (u = l.memoizedState, a === null) if (u === null) if (l.stateNode === null) {
            l: {
              u = l.type, a = l.memoizedProps, e = e.ownerDocument || e;
              t: switch (u) {
                case "title":
                  n = e.getElementsByTagName("title")[0], (!n || n[pu] || n[ql] || n.namespaceURI === "http://www.w3.org/2000/svg" || n.hasAttribute("itemprop")) && (n = e.createElement(u), e.head.insertBefore(n, e.querySelector("head > title"))), Zl(n, u, a), n[ql] = l, Cl(n), u = n;
                  break l;
                case "link":
                  var i = Vd("link", "href", e).get(u + (a.href || ""));
                  if (i) {
                    for (var c = 0; c < i.length; c++) if (n = i[c], n.getAttribute("href") === (a.href == null || a.href === "" ? null : a.href) && n.getAttribute("rel") === (a.rel == null ? null : a.rel) && n.getAttribute("title") === (a.title == null ? null : a.title) && n.getAttribute("crossorigin") === (a.crossOrigin == null ? null : a.crossOrigin)) {
                      i.splice(c, 1);
                      break t;
                    }
                  }
                  n = e.createElement(u), Zl(n, u, a), e.head.appendChild(n);
                  break;
                case "meta":
                  if (i = Vd("meta", "content", e).get(u + (a.content || ""))) {
                    for (c = 0; c < i.length; c++) if (n = i[c], n.getAttribute("content") === (a.content == null ? null : "" + a.content) && n.getAttribute("name") === (a.name == null ? null : a.name) && n.getAttribute("property") === (a.property == null ? null : a.property) && n.getAttribute("http-equiv") === (a.httpEquiv == null ? null : a.httpEquiv) && n.getAttribute("charset") === (a.charSet == null ? null : a.charSet)) {
                      i.splice(c, 1);
                      break t;
                    }
                  }
                  n = e.createElement(u), Zl(n, u, a), e.head.appendChild(n);
                  break;
                default:
                  throw Error(s(468, u));
              }
              n[ql] = l, Cl(n), u = n;
            }
            l.stateNode = u;
          } else xd(e, l.type, l.stateNode);
          else l.stateNode = Ld(e, u, l.memoizedProps);
          else n !== u ? (n === null ? a.stateNode !== null && (a = a.stateNode, a.parentNode.removeChild(a)) : n.count--, u === null ? xd(e, l.type, l.stateNode) : Ld(e, u, l.memoizedProps)) : u === null && l.stateNode !== null && oc(l, l.memoizedProps, a.memoizedProps);
        }
        break;
      case 27:
        Fl(t, l), Il(l), u & 512 && (Hl || a === null || Nt(a, a.return)), a !== null && u & 4 && oc(l, l.memoizedProps, a.memoizedProps);
        break;
      case 5:
        if (Fl(t, l), Il(l), u & 512 && (Hl || a === null || Nt(a, a.return)), l.flags & 32) {
          e = l.stateNode;
          try {
            wa(e, "");
          } catch (j) {
            cl(l, l.return, j);
          }
        }
        u & 4 && l.stateNode != null && (e = l.memoizedProps, oc(l, e, a !== null ? a.memoizedProps : e)), u & 1024 && (rc = !0);
        break;
      case 6:
        if (Fl(t, l), Il(l), u & 4) {
          if (l.stateNode === null) throw Error(s(162));
          u = l.memoizedProps, a = l.stateNode;
          try {
            a.nodeValue = u;
          } catch (j) {
            cl(l, l.return, j);
          }
        }
        break;
      case 3:
        if (pn = null, e = Mt, Mt = Dn(t.containerInfo), Fl(t, l), Mt = e, Il(l), u & 4 && a !== null && a.memoizedState.isDehydrated) try {
          Au(t.containerInfo);
        } catch (j) {
          cl(l, l.return, j);
        }
        rc && (rc = !1, Vv(l));
        break;
      case 4:
        u = Mt, Mt = Dn(l.stateNode.containerInfo), Fl(t, l), Il(l), Mt = u;
        break;
      case 12:
        Fl(t, l), Il(l);
        break;
      case 31:
        Fl(t, l), Il(l), u & 4 && (u = l.updateQueue, u !== null && (l.updateQueue = null, yn(l, u)));
        break;
      case 13:
        Fl(t, l), Il(l), l.child.flags & 8192 && l.memoizedState !== null != (a !== null && a.memoizedState !== null) && (on = ut()), u & 4 && (u = l.updateQueue, u !== null && (l.updateQueue = null, yn(l, u)));
        break;
      case 22:
        e = l.memoizedState !== null;
        var f = a !== null && a.memoizedState !== null, o = xt, r = Hl;
        if (xt = o || e, Hl = r || f, Fl(t, l), Hl = r, xt = o, Il(l), u & 8192) l: for (t = l.stateNode, t._visibility = e ? t._visibility & -2 : t._visibility | 1, e && (a === null || f || xt || Hl || Qa(l)), a = null, t = l; ; ) {
          if (t.tag === 5 || t.tag === 26) {
            if (a === null) {
              f = a = t;
              try {
                if (n = f.stateNode, e) i = n.style, typeof i.setProperty == "function" ? i.setProperty("display", "none", "important") : i.display = "none";
                else {
                  c = f.stateNode;
                  var z = f.memoizedProps.style, g = z != null && z.hasOwnProperty("display") ? z.display : null;
                  c.style.display = g == null || typeof g == "boolean" ? "" : ("" + g).trim();
                }
              } catch (j) {
                cl(f, f.return, j);
              }
            }
          } else if (t.tag === 6) {
            if (a === null) {
              f = t;
              try {
                f.stateNode.nodeValue = e ? "" : f.memoizedProps;
              } catch (j) {
                cl(f, f.return, j);
              }
            }
          } else if (t.tag === 18) {
            if (a === null) {
              f = t;
              try {
                var S = f.stateNode;
                e ? Rd(S, !0) : Rd(f.stateNode, !1);
              } catch (j) {
                cl(f, f.return, j);
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
        u & 4 && (u = l.updateQueue, u !== null && (a = u.retryQueue, a !== null && (u.retryQueue = null, yn(l, a))));
        break;
      case 19:
        Fl(t, l), Il(l), u & 4 && (u = l.updateQueue, u !== null && (l.updateQueue = null, yn(l, u)));
        break;
      case 30:
        break;
      case 21:
        break;
      default:
        Fl(t, l), Il(l);
    }
  }
  function Il(l) {
    var t = l.flags;
    if (t & 2) {
      try {
        for (var a, u = l.return; u !== null; ) {
          if (Bv(u)) {
            a = u;
            break;
          }
          u = u.return;
        }
        if (a == null) throw Error(s(160));
        switch (a.tag) {
          case 27:
            var e = a.stateNode;
            sn(l, gc(l), e);
            break;
          case 5:
            var n = a.stateNode;
            a.flags & 32 && (wa(n, ""), a.flags &= -33), sn(l, gc(l), n);
            break;
          case 3:
          case 4:
            var i = a.stateNode.containerInfo;
            Sc(l, gc(l), i);
            break;
          default:
            throw Error(s(161));
        }
      } catch (c) {
        cl(l, l.return, c);
      }
      l.flags &= -3;
    }
    t & 4096 && (l.flags &= -4097);
  }
  function Vv(l) {
    if (l.subtreeFlags & 1024) for (l = l.child; l !== null; ) {
      var t = l;
      Vv(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), l = l.sibling;
    }
  }
  function Jt(l, t) {
    if (t.subtreeFlags & 8772) for (t = t.child; t !== null; ) qv(l, t.alternate, t), t = t.sibling;
  }
  function Qa(l) {
    for (l = l.child; l !== null; ) {
      var t = l;
      switch (t.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          fa(4, t, t.return), Qa(t);
          break;
        case 1:
          Nt(t, t.return);
          var a = t.stateNode;
          typeof a.componentWillUnmount == "function" && jv(t, t.return, a), Qa(t);
          break;
        case 27:
          me(t.stateNode);
        case 26:
        case 5:
          Nt(t, t.return), Qa(t);
          break;
        case 22:
          t.memoizedState === null && Qa(t);
          break;
        case 30:
          Qa(t);
          break;
        default:
          Qa(t);
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
          wt(e, n, a), te(4, n);
          break;
        case 1:
          if (wt(e, n, a), u = n, e = u.stateNode, typeof e.componentDidMount == "function") try {
            e.componentDidMount();
          } catch (o) {
            cl(u, u.return, o);
          }
          if (u = n, e = u.updateQueue, e !== null) {
            var c = u.stateNode;
            try {
              var f = e.shared.hiddenCallbacks;
              if (f !== null) for (e.shared.hiddenCallbacks = null, e = 0; e < f.length; e++) T0(f[e], c);
            } catch (o) {
              cl(u, u.return, o);
            }
          }
          a && i & 64 && Hv(n), ae(n, n.return);
          break;
        case 27:
          Cv(n);
        case 26:
        case 5:
          wt(e, n, a), a && u === null && i & 4 && Rv(n), ae(n, n.return);
          break;
        case 12:
          wt(e, n, a);
          break;
        case 31:
          wt(e, n, a), a && i & 4 && Qv(e, n);
          break;
        case 13:
          wt(e, n, a), a && i & 4 && Zv(e, n);
          break;
        case 22:
          n.memoizedState === null && wt(e, n, a), ae(n, n.return);
          break;
        case 30:
          break;
        default:
          wt(e, n, a);
      }
      t = t.sibling;
    }
  }
  function bc(l, t) {
    var a = null;
    l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), l = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (l = t.memoizedState.cachePool.pool), l !== a && (l != null && l.refCount++, a != null && Lu(a));
  }
  function zc(l, t) {
    l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Lu(l));
  }
  function Dt(l, t, a, u) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) xv(l, t, a, u), t = t.sibling;
  }
  function xv(l, t, a, u) {
    var e = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        Dt(l, t, a, u), e & 2048 && te(9, t);
        break;
      case 1:
        Dt(l, t, a, u);
        break;
      case 3:
        Dt(l, t, a, u), e & 2048 && (l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Lu(l)));
        break;
      case 12:
        if (e & 2048) {
          Dt(l, t, a, u), l = t.stateNode;
          try {
            var n = t.memoizedProps, i = n.id, c = n.onPostCommit;
            typeof c == "function" && c(i, t.alternate === null ? "mount" : "update", l.passiveEffectDuration, -0);
          } catch (f) {
            cl(t, t.return, f);
          }
        } else Dt(l, t, a, u);
        break;
      case 31:
        Dt(l, t, a, u);
        break;
      case 13:
        Dt(l, t, a, u);
        break;
      case 23:
        break;
      case 22:
        n = t.stateNode, i = t.alternate, t.memoizedState !== null ? n._visibility & 2 ? Dt(l, t, a, u) : ue(l, t) : n._visibility & 2 ? Dt(l, t, a, u) : (n._visibility |= 2, yu(l, t, a, u, (t.subtreeFlags & 10256) !== 0 || !1)), e & 2048 && bc(i, t);
        break;
      case 24:
        Dt(l, t, a, u), e & 2048 && zc(t.alternate, t);
        break;
      default:
        Dt(l, t, a, u);
    }
  }
  function yu(l, t, a, u, e) {
    for (e = e && ((t.subtreeFlags & 10256) !== 0 || !1), t = t.child; t !== null; ) {
      var n = l, i = t, c = a, f = u, o = i.flags;
      switch (i.tag) {
        case 0:
        case 11:
        case 15:
          yu(n, i, c, f, e), te(8, i);
          break;
        case 23:
          break;
        case 22:
          var r = i.stateNode;
          i.memoizedState !== null ? r._visibility & 2 ? yu(n, i, c, f, e) : ue(n, i) : (r._visibility |= 2, yu(n, i, c, f, e)), e && o & 2048 && bc(i.alternate, i);
          break;
        case 24:
          yu(n, i, c, f, e), e && o & 2048 && zc(i.alternate, i);
          break;
        default:
          yu(n, i, c, f, e);
      }
      t = t.sibling;
    }
  }
  function ue(l, t) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) {
      var a = l, u = t, e = u.flags;
      switch (u.tag) {
        case 22:
          ue(a, u), e & 2048 && bc(u.alternate, u);
          break;
        case 24:
          ue(a, u), e & 2048 && zc(u.alternate, u);
          break;
        default:
          ue(a, u);
      }
      t = t.sibling;
    }
  }
  var ee = 8192;
  function hu(l, t, a) {
    if (l.subtreeFlags & ee) for (l = l.child; l !== null; ) Kv(l, t, a), l = l.sibling;
  }
  function Kv(l, t, a) {
    switch (l.tag) {
      case 26:
        hu(l, t, a), l.flags & ee && l.memoizedState !== null && ds(a, Mt, l.memoizedState, l.memoizedProps);
        break;
      case 5:
        hu(l, t, a);
        break;
      case 3:
      case 4:
        var u = Mt;
        Mt = Dn(l.stateNode.containerInfo), hu(l, t, a), Mt = u;
        break;
      case 22:
        l.memoizedState === null && (u = l.alternate, u !== null && u.memoizedState !== null ? (u = ee, ee = 16777216, hu(l, t, a), ee = u) : hu(l, t, a));
        break;
      default:
        hu(l, t, a);
    }
  }
  function Jv(l) {
    var t = l.alternate;
    if (t !== null && (l = t.child, l !== null)) {
      t.child = null;
      do
        t = l.sibling, l.sibling = null, l = t;
      while (l !== null);
    }
  }
  function ne(l) {
    var t = l.deletions;
    if ((l.flags & 16) !== 0) {
      if (t !== null) for (var a = 0; a < t.length; a++) {
        var u = t[a];
        Yl = u, Wv(u, l);
      }
      Jv(l);
    }
    if (l.subtreeFlags & 10256) for (l = l.child; l !== null; ) wv(l), l = l.sibling;
  }
  function wv(l) {
    switch (l.tag) {
      case 0:
      case 11:
      case 15:
        ne(l), l.flags & 2048 && fa(9, l, l.return);
        break;
      case 3:
        ne(l);
        break;
      case 12:
        ne(l);
        break;
      case 22:
        var t = l.stateNode;
        l.memoizedState !== null && t._visibility & 2 && (l.return === null || l.return.tag !== 13) ? (t._visibility &= -3, hn(l)) : ne(l);
        break;
      default:
        ne(l);
    }
  }
  function hn(l) {
    var t = l.deletions;
    if ((l.flags & 16) !== 0) {
      if (t !== null) for (var a = 0; a < t.length; a++) {
        var u = t[a];
        Yl = u, Wv(u, l);
      }
      Jv(l);
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
  function Wv(l, t) {
    for (; Yl !== null; ) {
      var a = Yl;
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
      if (u = a.child, u !== null) u.return = a, Yl = u;
      else l: for (a = l; Yl !== null; ) {
        u = Yl;
        var e = u.sibling, n = u.return;
        if (Gv(u), u === a) {
          Yl = null;
          break l;
        }
        if (e !== null) {
          e.return = n, Yl = e;
          break l;
        }
        Yl = n;
      }
    }
  }
  var Dm = {
    getCacheForType: function(l) {
      var t = Xl(Ul), a = t.data.get(l);
      return a === void 0 && (a = l(), t.data.set(l, a)), a;
    },
    cacheSignal: function() {
      return Xl(Ul).controller.signal;
    }
  }, Um = typeof WeakMap == "function" ? WeakMap : Map, el = 0, ml = null, W = null, F = 0, il = 0, dt = null, va = !1, ou = !1, _c = !1, Wt = 0, _l = 0, da = 0, Za = 0, Ec = 0, mt = 0, gu = 0, ie = null, Pl = null, Tc = !1, on = 0, $v = 0, gn = 1 / 0, Sn = null, ma = null, jl = 0, sa = null, Su = null, $t = 0, Ac = 0, Oc = null, kv = null, ce = 0, Mc = null;
  function zt() {
    return (el & 2) !== 0 && F !== 0 ? F & -F : A.T !== null ? jc() : of();
  }
  function Fv() {
    if (mt === 0) if ((F & 536870912) === 0 || P) {
      var l = Te;
      Te <<= 1, (Te & 3932160) === 0 && (Te = 262144), mt = l;
    } else mt = 536870912;
    return l = ft.current, l !== null && (l.flags |= 32), mt;
  }
  function lt(l, t, a) {
    (l === ml && (il === 2 || il === 9) || l.cancelPendingCommit !== null) && (ru(l, 0), ya(l, F, mt, !1)), Me(l, a), ((el & 2) === 0 || l !== ml) && (l === ml && ((el & 2) === 0 && (Za |= a), _l === 4 && ya(l, F, mt, !1)), kt(l));
  }
  function Iv(l, t, a) {
    if ((el & 6) !== 0) throw Error(s(327));
    var u = !a && (t & 127) === 0 && (t & l.expiredLanes) === 0 || Du(l, t), e = u ? Hm(l, t) : Uc(l, t, !0), n = u;
    do {
      if (e === 0) {
        ou && !u && ya(l, t, 0, !1);
        break;
      } else {
        if (a = l.current.alternate, n && !pm(a)) {
          e = Uc(l, t, !1), n = !1;
          continue;
        }
        if (e === 2) {
          if (n = t, l.errorRecoveryDisabledLanes & n) var i = 0;
          else i = l.pendingLanes & -536870913, i = i !== 0 ? i : i & 536870912 ? 536870912 : 0;
          if (i !== 0) {
            t = i;
            l: {
              var c = l;
              e = ie;
              var f = c.current.memoizedState.isDehydrated;
              if (f && (ru(c, i).flags |= 256), i = Uc(c, i, !1), i !== 2) {
                if (_c && !f) {
                  c.errorRecoveryDisabledLanes |= n, Za |= n, e = 4;
                  break l;
                }
                n = Pl, Pl = e, n !== null && (Pl === null ? Pl = n : Pl.push.apply(Pl, n));
              }
              e = i;
            }
            if (n = !1, e !== 2) continue;
          }
        }
        if (e === 1) {
          ru(l, 0), ya(l, t, 0, !0);
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
              ya(u, t, mt, !va);
              break l;
            case 2:
              Pl = null;
              break;
            case 3:
            case 5:
              break;
            default:
              throw Error(s(329));
          }
          if ((t & 62914560) === t && (e = on + 300 - ut(), 10 < e)) {
            if (ya(u, t, mt, !va), Oe(u, 0, !0) !== 0) break l;
            $t = t, u.timeoutHandle = Nd(Pv.bind(null, u, a, Pl, Sn, Tc, t, mt, Za, gu, va, n, "Throttled", -0, 0), e);
            break l;
          }
          Pv(u, a, Pl, Sn, Tc, t, mt, Za, gu, va, n, null, -0, 0);
        }
      }
      break;
    } while (!0);
    kt(l);
  }
  function Pv(l, t, a, u, e, n, i, c, f, o, r, z, g, S) {
    if (l.timeoutHandle = -1, z = t.subtreeFlags, z & 8192 || (z & 16785408) === 16785408) {
      z = {
        stylesheets: null,
        count: 0,
        imgCount: 0,
        imgBytes: 0,
        suspenseyImages: [],
        waitingForImages: !0,
        waitingForViewTransition: !1,
        unsuspend: Bt
      }, Kv(t, n, z);
      var j = (n & 62914560) === n ? on - ut() : (n & 4194048) === n ? $v - ut() : 0;
      if (j = ms(z, j), j !== null) {
        $t = n, l.cancelPendingCommit = j(cd.bind(null, l, t, n, a, u, e, i, c, f, r, z, null, g, S)), ya(l, n, i, !o);
        return;
      }
    }
    cd(l, t, n, a, u, e, i, c, f);
  }
  function pm(l) {
    for (var t = l; ; ) {
      var a = t.tag;
      if ((a === 0 || a === 11 || a === 15) && t.flags & 16384 && (a = t.updateQueue, a !== null && (a = a.stores, a !== null))) for (var u = 0; u < a.length; u++) {
        var e = a[u], n = e.getSnapshot;
        e = e.value;
        try {
          if (!it(n(), e)) return !1;
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
  function ya(l, t, a, u) {
    t &= ~Ec, t &= ~Za, l.suspendedLanes |= t, l.pingedLanes &= ~t, u && (l.warmLanes |= t), u = l.expirationTimes;
    for (var e = t; 0 < e; ) {
      var n = 31 - nt(e), i = 1 << n;
      u[n] = -1, e &= ~i;
    }
    a !== 0 && mf(l, a, t);
  }
  function rn() {
    return (el & 6) === 0 ? (fe(0, !1), !1) : !0;
  }
  function Dc() {
    if (W !== null) {
      if (il === 0) var l = W.return;
      else l = W, Gt = Na = null, Vi(l), fu = null, xu = 0, l = W;
      for (; l !== null; ) Nv(l.alternate, l), l = l.return;
      W = null;
    }
  }
  function ru(l, t) {
    var a = l.timeoutHandle;
    a !== -1 && (l.timeoutHandle = -1, wm(a)), a = l.cancelPendingCommit, a !== null && (l.cancelPendingCommit = null, a()), $t = 0, Dc(), ml = l, W = a = Yt(l.current, null), F = t, il = 0, dt = null, va = !1, ou = Du(l, t), _c = !1, gu = mt = Ec = Za = da = _l = 0, Pl = ie = null, Tc = !1, (t & 8) !== 0 && (t |= t & 32);
    var u = l.entangledLanes;
    if (u !== 0) for (l = l.entanglements, u &= t; 0 < u; ) {
      var e = 31 - nt(u), n = 1 << e;
      t |= l[e], u &= ~n;
    }
    return Wt = t, Ge(), a;
  }
  function ld(l, t) {
    V = null, A.H = Iu, t === cu || t === Je ? (t = b0(), il = 3) : t === Hi ? (t = b0(), il = 4) : il = t === nc ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, dt = t, W === null && (_l = 1, cn(l, ot(t, l.current)));
  }
  function td() {
    var l = ft.current;
    return l === null ? !0 : (F & 4194048) === F ? bt === null : (F & 62914560) === F || (F & 536870912) !== 0 ? l === bt : !1;
  }
  function ad() {
    var l = A.H;
    return A.H = Iu, l === null ? Iu : l;
  }
  function ud() {
    var l = A.A;
    return A.A = Dm, l;
  }
  function bn() {
    _l = 4, va || (F & 4194048) !== F && ft.current !== null || (ou = !0), (da & 134217727) === 0 && (Za & 134217727) === 0 || ml === null || ya(ml, F, mt, !1);
  }
  function Uc(l, t, a) {
    var u = el;
    el |= 2;
    var e = ad(), n = ud();
    (ml !== l || F !== t) && (Sn = null, ru(l, t)), t = !1;
    var i = _l;
    l: do
      try {
        if (il !== 0 && W !== null) {
          var c = W, f = dt;
          switch (il) {
            case 8:
              Dc(), i = 6;
              break l;
            case 3:
            case 2:
            case 9:
            case 6:
              ft.current === null && (t = !0);
              var o = il;
              if (il = 0, dt = null, bu(l, c, f, o), a && ou) {
                i = 0;
                break l;
              }
              break;
            default:
              o = il, il = 0, dt = null, bu(l, c, f, o);
          }
        }
        Nm(), i = _l;
        break;
      } catch (r) {
        ld(l, r);
      }
    while (!0);
    return t && l.shellSuspendCounter++, Gt = Na = null, el = u, A.H = e, A.A = n, W === null && (ml = null, F = 0, Ge()), i;
  }
  function Nm() {
    for (; W !== null; ) ed(W);
  }
  function Hm(l, t) {
    var a = el;
    el |= 2;
    var u = ad(), e = ud();
    ml !== l || F !== t ? (Sn = null, gn = ut() + 500, ru(l, t)) : ou = Du(l, t);
    l: do
      try {
        if (il !== 0 && W !== null) {
          t = W;
          var n = dt;
          t: switch (il) {
            case 1:
              il = 0, dt = null, bu(l, t, n, 1);
              break;
            case 2:
            case 9:
              if (S0(n)) {
                il = 0, dt = null, nd(t);
                break;
              }
              t = function() {
                il !== 2 && il !== 9 || ml !== l || (il = 7), kt(l);
              }, n.then(t, t);
              break l;
            case 3:
              il = 7;
              break l;
            case 4:
              il = 5;
              break l;
            case 7:
              S0(n) ? (il = 0, dt = null, nd(t)) : (il = 0, dt = null, bu(l, t, n, 7));
              break;
            case 5:
              var i = null;
              switch (W.tag) {
                case 26:
                  i = W.memoizedState;
                case 5:
                case 27:
                  var c = W;
                  if (i ? Kd(i) : c.stateNode.complete) {
                    il = 0, dt = null;
                    var f = c.sibling;
                    if (f !== null) W = f;
                    else {
                      var o = c.return;
                      o !== null ? (W = o, zn(o)) : W = null;
                    }
                    break t;
                  }
              }
              il = 0, dt = null, bu(l, t, n, 5);
              break;
            case 6:
              il = 0, dt = null, bu(l, t, n, 6);
              break;
            case 8:
              Dc(), _l = 6;
              break l;
            default:
              throw Error(s(462));
          }
        }
        jm();
        break;
      } catch (r) {
        ld(l, r);
      }
    while (!0);
    return Gt = Na = null, A.H = u, A.A = e, el = a, W !== null ? 0 : (ml = null, F = 0, Ge(), _l);
  }
  function jm() {
    for (; W !== null && !v1(); ) ed(W);
  }
  function ed(l) {
    var t = Uv(l.alternate, l, Wt);
    l.memoizedProps = l.pendingProps, t === null ? zn(l) : W = t;
  }
  function nd(l) {
    var t = l, a = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = Ev(a, t, t.pendingProps, t.type, void 0, F);
        break;
      case 11:
        t = Ev(a, t, t.pendingProps, t.type.render, t.ref, F);
        break;
      case 5:
        Vi(t);
      default:
        Nv(a, t), t = W = i0(t, Wt), t = Uv(a, t, Wt);
    }
    l.memoizedProps = l.pendingProps, t === null ? zn(l) : W = t;
  }
  function bu(l, t, a, u) {
    Gt = Na = null, Vi(t), fu = null, xu = 0;
    var e = t.return;
    try {
      if (zm(l, e, t, a, F)) {
        _l = 1, cn(l, ot(a, l.current)), W = null;
        return;
      }
    } catch (n) {
      if (e !== null) throw W = e, n;
      _l = 1, cn(l, ot(a, l.current)), W = null;
      return;
    }
    t.flags & 32768 ? (P || u === 1 ? l = !0 : ou || (F & 536870912) !== 0 ? l = !1 : (va = l = !0, (u === 2 || u === 9 || u === 3 || u === 6) && (u = ft.current, u !== null && u.tag === 13 && (u.flags |= 16384))), id(t, l)) : zn(t);
  }
  function zn(l) {
    var t = l;
    do {
      if ((t.flags & 32768) !== 0) {
        id(t, va);
        return;
      }
      l = t.return;
      var a = Tm(t.alternate, t, Wt);
      if (a !== null) {
        W = a;
        return;
      }
      if (t = t.sibling, t !== null) {
        W = t;
        return;
      }
      W = t = l;
    } while (t !== null);
    _l === 0 && (_l = 5);
  }
  function id(l, t) {
    do {
      var a = Am(l.alternate, l);
      if (a !== null) {
        a.flags &= 32767, W = a;
        return;
      }
      if (a = l.return, a !== null && (a.flags |= 32768, a.subtreeFlags = 0, a.deletions = null), !t && (l = l.sibling, l !== null)) {
        W = l;
        return;
      }
      W = l = a;
    } while (l !== null);
    _l = 6, W = null;
  }
  function cd(l, t, a, u, e, n, i, c, f) {
    l.cancelPendingCommit = null;
    do
      _n();
    while (jl !== 0);
    if ((el & 6) !== 0) throw Error(s(327));
    if (t !== null) {
      if (t === l.current) throw Error(s(177));
      if (n = t.lanes | t.childLanes, n |= gi, b1(l, a, n, i, c, f), l === ml && (W = ml = null, F = 0), Su = t, sa = l, $t = a, Ac = n, Oc = e, kv = u, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (l.callbackNode = null, l.callbackPriority = 0, Ym(_e, function() {
        return sd(), null;
      })) : (l.callbackNode = null, l.callbackPriority = 0), u = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || u) {
        u = A.T, A.T = null, e = D.p, D.p = 2, i = el, el |= 4;
        try {
          Om(l, t, a);
        } finally {
          el = i, D.p = e, A.T = u;
        }
      }
      jl = 1, fd(), vd(), dd();
    }
  }
  function fd() {
    if (jl === 1) {
      jl = 0;
      var l = sa, t = Su, a = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || a) {
        a = A.T, A.T = null;
        var u = D.p;
        D.p = 2;
        var e = el;
        el |= 4;
        try {
          Lv(t, l);
          var n = Xc, i = Ff(l.containerInfo), c = n.focusedElem, f = n.selectionRange;
          if (i !== c && c && c.ownerDocument && kf(c.ownerDocument.documentElement, c)) {
            if (f !== null && mi(c)) {
              var o = f.start, r = f.end;
              if (r === void 0 && (r = o), "selectionStart" in c) c.selectionStart = o, c.selectionEnd = Math.min(r, c.value.length);
              else {
                var z = c.ownerDocument || document, g = z && z.defaultView || window;
                if (g.getSelection) {
                  var S = g.getSelection(), j = c.textContent.length, Z = Math.min(f.start, j), dl = f.end === void 0 ? Z : Math.min(f.end, j);
                  !S.extend && Z > dl && (i = dl, dl = Z, Z = i);
                  var y = $f(c, Z), v = $f(c, dl);
                  if (y && v && (S.rangeCount !== 1 || S.anchorNode !== y.node || S.anchorOffset !== y.offset || S.focusNode !== v.node || S.focusOffset !== v.offset)) {
                    var h = z.createRange();
                    h.setStart(y.node, y.offset), S.removeAllRanges(), Z > dl ? (S.addRange(h), S.extend(v.node, v.offset)) : (h.setEnd(v.node, v.offset), S.addRange(h));
                  }
                }
              }
            }
            for (z = [], S = c; S = S.parentNode; ) S.nodeType === 1 && z.push({
              element: S,
              left: S.scrollLeft,
              top: S.scrollTop
            });
            for (typeof c.focus == "function" && c.focus(), c = 0; c < z.length; c++) {
              var b = z[c];
              b.element.scrollLeft = b.left, b.element.scrollTop = b.top;
            }
          }
          Rn = !!Gc, Xc = Gc = null;
        } finally {
          el = e, D.p = u, A.T = a;
        }
      }
      l.current = t, jl = 2;
    }
  }
  function vd() {
    if (jl === 2) {
      jl = 0;
      var l = sa, t = Su, a = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || a) {
        a = A.T, A.T = null;
        var u = D.p;
        D.p = 2;
        var e = el;
        el |= 4;
        try {
          qv(l, t.alternate, t);
        } finally {
          el = e, D.p = u, A.T = a;
        }
      }
      jl = 3;
    }
  }
  function dd() {
    if (jl === 4 || jl === 3) {
      jl = 0, d1();
      var l = sa, t = Su, a = $t, u = kv;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? jl = 5 : (jl = 0, Su = sa = null, md(l, l.pendingLanes));
      var e = l.pendingLanes;
      if (e === 0 && (ma = null), Jn(a), t = t.stateNode, et && typeof et.onCommitFiberRoot == "function") try {
        et.onCommitFiberRoot(Mu, t, void 0, (t.current.flags & 128) === 128);
      } catch {
      }
      if (u !== null) {
        t = A.T, e = D.p, D.p = 2, A.T = null;
        try {
          for (var n = l.onRecoverableError, i = 0; i < u.length; i++) {
            var c = u[i];
            n(c.value, { componentStack: c.stack });
          }
        } finally {
          A.T = t, D.p = e;
        }
      }
      ($t & 3) !== 0 && _n(), kt(l), e = l.pendingLanes, (a & 261930) !== 0 && (e & 42) !== 0 ? l === Mc ? ce++ : (ce = 0, Mc = l) : ce = 0, fe(0, !1);
    }
  }
  function md(l, t) {
    (l.pooledCacheLanes &= t) === 0 && (t = l.pooledCache, t != null && (l.pooledCache = null, Lu(t)));
  }
  function _n() {
    return fd(), vd(), dd(), sd();
  }
  function sd() {
    if (jl !== 5) return !1;
    var l = sa, t = Ac;
    Ac = 0;
    var a = Jn($t), u = A.T, e = D.p;
    try {
      D.p = 32 > a ? 32 : a, A.T = null, a = Oc, Oc = null;
      var n = sa, i = $t;
      if (jl = 0, Su = sa = null, $t = 0, (el & 6) !== 0) throw Error(s(331));
      var c = el;
      if (el |= 4, wv(n.current), xv(n, n.current, i, a), el = c, fe(0, !1), et && typeof et.onPostCommitFiberRoot == "function") try {
        et.onPostCommitFiberRoot(Mu, n);
      } catch {
      }
      return !0;
    } finally {
      D.p = e, A.T = u, md(l, t);
    }
  }
  function yd(l, t, a) {
    t = ot(a, t), t = ec(l.stateNode, t, 2), l = qa(l, t, 2), l !== null && (Me(l, 2), kt(l));
  }
  function cl(l, t, a) {
    if (l.tag === 3) yd(l, l, a);
    else for (; t !== null; ) {
      if (t.tag === 3) {
        yd(t, l, a);
        break;
      } else if (t.tag === 1) {
        var u = t.stateNode;
        if (typeof t.type.getDerivedStateFromError == "function" || typeof u.componentDidCatch == "function" && (ma === null || !ma.has(u))) {
          l = ot(a, l), a = hv(2), u = qa(t, a, 2), u !== null && (ov(a, u, t, l), Me(u, 2), kt(u));
          break;
        }
      }
      t = t.return;
    }
  }
  function pc(l, t, a) {
    var u = l.pingCache;
    if (u === null) {
      u = l.pingCache = new Um();
      var e = /* @__PURE__ */ new Set();
      u.set(t, e);
    } else e = u.get(t), e === void 0 && (e = /* @__PURE__ */ new Set(), u.set(t, e));
    e.has(a) || (_c = !0, e.add(a), l = Rm.bind(null, l, t, a), t.then(l, l));
  }
  function Rm(l, t, a) {
    var u = l.pingCache;
    u !== null && u.delete(t), l.pingedLanes |= l.suspendedLanes & a, l.warmLanes &= ~a, ml === l && (F & a) === a && (_l === 4 || _l === 3 && (F & 62914560) === F && 300 > ut() - on ? (el & 2) === 0 && ru(l, 0) : Ec |= a, gu === F && (gu = 0)), kt(l);
  }
  function hd(l, t) {
    t === 0 && (t = df()), l = Da(l, t), l !== null && (Me(l, t), kt(l));
  }
  function Bm(l) {
    var t = l.memoizedState, a = 0;
    t !== null && (a = t.retryLane), hd(l, a);
  }
  function Cm(l, t) {
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
    u !== null && u.delete(t), hd(l, a);
  }
  function Ym(l, t) {
    return Vn(l, t);
  }
  var En = null, zu = null, Nc = !1, Tn = !1, Hc = !1, ha = 0;
  function kt(l) {
    l !== zu && l.next === null && (zu === null ? En = zu = l : zu = zu.next = l), Tn = !0, Nc || (Nc = !0, Gm());
  }
  function fe(l, t) {
    if (!Hc && Tn) {
      Hc = !0;
      do
        for (var a = !1, u = En; u !== null; ) {
          if (!t) if (l !== 0) {
            var e = u.pendingLanes;
            if (e === 0) var n = 0;
            else {
              var i = u.suspendedLanes, c = u.pingedLanes;
              n = (1 << 31 - nt(42 | l) + 1) - 1, n &= e & ~(i & ~c), n = n & 201326741 ? n & 201326741 | 1 : n ? n | 2 : 0;
            }
            n !== 0 && (a = !0, rd(u, n));
          } else n = F, n = Oe(u, u === ml ? n : 0, u.cancelPendingCommit !== null || u.timeoutHandle !== -1), (n & 3) === 0 || Du(u, n) || (a = !0, rd(u, n));
          u = u.next;
        }
      while (a);
      Hc = !1;
    }
  }
  function qm() {
    od();
  }
  function od() {
    Tn = Nc = !1;
    var l = 0;
    ha !== 0 && Jm() && (l = ha);
    for (var t = ut(), a = null, u = En; u !== null; ) {
      var e = u.next, n = gd(u, t);
      n === 0 ? (u.next = null, a === null ? En = e : a.next = e, e === null && (zu = a)) : (a = u, (l !== 0 || (n & 3) !== 0) && (Tn = !0)), u = e;
    }
    jl !== 0 && jl !== 5 || fe(l, !1), ha !== 0 && (ha = 0);
  }
  function gd(l, t) {
    for (var a = l.suspendedLanes, u = l.pingedLanes, e = l.expirationTimes, n = l.pendingLanes & -62914561; 0 < n; ) {
      var i = 31 - nt(n), c = 1 << i, f = e[i];
      f === -1 ? ((c & a) === 0 || (c & u) !== 0) && (e[i] = r1(c, t)) : f <= t && (l.expiredLanes |= c), n &= ~c;
    }
    if (t = ml, a = F, a = Oe(l, l === t ? a : 0, l.cancelPendingCommit !== null || l.timeoutHandle !== -1), u = l.callbackNode, a === 0 || l === t && (il === 2 || il === 9) || l.cancelPendingCommit !== null) return u !== null && u !== null && xn(u), l.callbackNode = null, l.callbackPriority = 0;
    if ((a & 3) === 0 || Du(l, a)) {
      if (t = a & -a, t === l.callbackPriority) return t;
      switch (u !== null && xn(u), Jn(a)) {
        case 2:
        case 8:
          a = ff;
          break;
        case 32:
          a = _e;
          break;
        case 268435456:
          a = vf;
          break;
        default:
          a = _e;
      }
      return u = Sd.bind(null, l), a = Vn(a, u), l.callbackPriority = t, l.callbackNode = a, t;
    }
    return u !== null && u !== null && xn(u), l.callbackPriority = 2, l.callbackNode = null, 2;
  }
  function Sd(l, t) {
    if (jl !== 0 && jl !== 5) return l.callbackNode = null, l.callbackPriority = 0, null;
    var a = l.callbackNode;
    if (_n() && l.callbackNode !== a) return null;
    var u = F;
    return u = Oe(l, l === ml ? u : 0, l.cancelPendingCommit !== null || l.timeoutHandle !== -1), u === 0 ? null : (Iv(l, u, t), gd(l, ut()), l.callbackNode != null && l.callbackNode === a ? Sd.bind(null, l) : null);
  }
  function rd(l, t) {
    if (_n()) return null;
    Iv(l, t, !0);
  }
  function Gm() {
    Wm(function() {
      (el & 6) !== 0 ? Vn(cf, qm) : od();
    });
  }
  function jc() {
    if (ha === 0) {
      var l = nu;
      l === 0 && (l = Ee, Ee <<= 1, (Ee & 261888) === 0 && (Ee = 256)), ha = l;
    }
    return ha;
  }
  function bd(l) {
    return l == null || typeof l == "symbol" || typeof l == "boolean" ? null : typeof l == "function" ? l : Ne("" + l);
  }
  function zd(l, t) {
    var a = t.ownerDocument.createElement("input");
    return a.name = t.name, a.value = t.value, l.id && a.setAttribute("form", l.id), t.parentNode.insertBefore(a, t), l = new FormData(l), a.parentNode.removeChild(a), l;
  }
  function Xm(l, t, a, u, e) {
    if (t === "submit" && a && a.stateNode === e) {
      var n = bd((e[Wl] || null).action), i = u.submitter;
      i && (t = (t = i[Wl] || null) ? bd(t.formAction) : i.getAttribute("formAction"), t !== null && (n = t, i = null));
      var c = new Be("action", "action", null, u, e);
      l.push({
        event: c,
        listeners: [{
          instance: null,
          listener: function() {
            if (u.defaultPrevented) {
              if (ha !== 0) {
                var f = i ? zd(e, i) : new FormData(e);
                Ii(a, {
                  pending: !0,
                  data: f,
                  method: e.method,
                  action: n
                }, null, f);
              }
            } else typeof n == "function" && (c.preventDefault(), f = i ? zd(e, i) : new FormData(e), Ii(a, {
              pending: !0,
              data: f,
              method: e.method,
              action: n
            }, n, f));
          },
          currentTarget: e
        }]
      });
    }
  }
  for (var Rc = 0; Rc < oi.length; Rc++) {
    var Bc = oi[Rc];
    Ot(Bc.toLowerCase(), "on" + (Bc[0].toUpperCase() + Bc.slice(1)));
  }
  Ot(l0, "onAnimationEnd"), Ot(t0, "onAnimationIteration"), Ot(a0, "onAnimationStart"), Ot("dblclick", "onDoubleClick"), Ot("focusin", "onFocus"), Ot("focusout", "onBlur"), Ot(lm, "onTransitionRun"), Ot(tm, "onTransitionStart"), Ot(am, "onTransitionCancel"), Ot(u0, "onTransitionEnd"), Ka("onMouseEnter", ["mouseout", "mouseover"]), Ka("onMouseLeave", ["mouseout", "mouseover"]), Ka("onPointerEnter", ["pointerout", "pointerover"]), Ka("onPointerLeave", ["pointerout", "pointerover"]), Ta("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" ")), Ta("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")), Ta("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]), Ta("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" ")), Ta("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" ")), Ta("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
  var ve = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), Qm = new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(ve));
  function _d(l, t) {
    t = (t & 4) !== 0;
    for (var a = 0; a < l.length; a++) {
      var u = l[a], e = u.event;
      u = u.listeners;
      l: {
        var n = void 0;
        if (t) for (var i = u.length - 1; 0 <= i; i--) {
          var c = u[i], f = c.instance, o = c.currentTarget;
          if (c = c.listener, f !== n && e.isPropagationStopped()) break l;
          n = c, e.currentTarget = o;
          try {
            n(e);
          } catch (r) {
            qe(r);
          }
          e.currentTarget = null, n = f;
        }
        else for (i = 0; i < u.length; i++) {
          if (c = u[i], f = c.instance, o = c.currentTarget, c = c.listener, f !== n && e.isPropagationStopped()) break l;
          n = c, e.currentTarget = o;
          try {
            n(e);
          } catch (r) {
            qe(r);
          }
          e.currentTarget = null, n = f;
        }
      }
    }
  }
  function $(l, t) {
    var a = t[wn];
    a === void 0 && (a = t[wn] = /* @__PURE__ */ new Set());
    var u = l + "__bubble";
    a.has(u) || (Td(t, l, 2, !1), a.add(u));
  }
  function Cc(l, t, a) {
    var u = 0;
    t && (u |= 4), Td(a, l, u, t);
  }
  var An = "_reactListening" + Math.random().toString(36).slice(2);
  function Ed(l) {
    if (!l[An]) {
      l[An] = !0, rf.forEach(function(a) {
        a !== "selectionchange" && (Qm.has(a) || Cc(a, !1, l), Cc(a, !0, l));
      });
      var t = l.nodeType === 9 ? l : l.ownerDocument;
      t === null || t[An] || (t[An] = !0, Cc("selectionchange", !1, t));
    }
  }
  function Td(l, t, a, u) {
    switch (kd(t)) {
      case 2:
        var e = gs;
        break;
      case 8:
        e = Ss;
        break;
      default:
        e = kc;
    }
    a = e.bind(null, t, a, l), e = void 0, !ai || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (e = !0), u ? e !== void 0 ? l.addEventListener(t, a, {
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
          var f = i.tag;
          if ((f === 3 || f === 4) && i.stateNode.containerInfo === e) return;
          i = i.return;
        }
        for (; c !== null; ) {
          if (i = La(c), i === null) return;
          if (f = i.tag, f === 5 || f === 6 || f === 26 || f === 27) {
            u = n = i;
            continue l;
          }
          c = c.parentNode;
        }
      }
      u = u.return;
    }
    Nf(function() {
      var o = n, r = li(a), z = [];
      l: {
        var g = e0.get(l);
        if (g !== void 0) {
          var S = Be, j = l;
          switch (l) {
            case "keypress":
              if (je(a) === 0) break l;
            case "keydown":
            case "keyup":
              S = q1;
              break;
            case "focusin":
              j = "focus", S = ii;
              break;
            case "focusout":
              j = "blur", S = ii;
              break;
            case "beforeblur":
            case "afterblur":
              S = ii;
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
              S = Rf;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              S = N1;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              S = G1;
              break;
            case l0:
            case t0:
            case a0:
              S = H1;
              break;
            case u0:
              S = X1;
              break;
            case "scroll":
            case "scrollend":
              S = p1;
              break;
            case "wheel":
              S = Q1;
              break;
            case "copy":
            case "cut":
            case "paste":
              S = j1;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              S = Cf;
              break;
            case "toggle":
            case "beforetoggle":
              S = Z1;
          }
          var Z = (t & 4) !== 0, dl = !Z && (l === "scroll" || l === "scrollend"), y = Z ? g !== null ? g + "Capture" : null : g;
          Z = [];
          for (var v = o, h; v !== null; ) {
            var b = v;
            if (h = b.stateNode, b = b.tag, b !== 5 && b !== 26 && b !== 27 || h === null || y === null || (b = Hu(v, y), b != null && Z.push(de(v, b, h))), dl) break;
            v = v.return;
          }
          0 < Z.length && (g = new S(g, j, null, a, r), z.push({
            event: g,
            listeners: Z
          }));
        }
      }
      if ((t & 7) === 0) {
        l: {
          if (g = l === "mouseover" || l === "pointerover", S = l === "mouseout" || l === "pointerout", g && a !== Pn && (j = a.relatedTarget || a.fromElement) && (La(j) || j[Uu])) break l;
          if ((S || g) && (g = r.window === r ? r : (g = r.ownerDocument) ? g.defaultView || g.parentWindow : window, S ? (j = a.relatedTarget || a.toElement, S = o, j = j ? La(j) : null, j !== null && (dl = L(j), Z = j.tag, j !== dl || Z !== 5 && Z !== 27 && Z !== 6) && (j = null)) : (S = null, j = o), S !== j)) {
            if (Z = Rf, b = "onMouseLeave", y = "onMouseEnter", v = "mouse", (l === "pointerout" || l === "pointerover") && (Z = Cf, b = "onPointerLeave", y = "onPointerEnter", v = "pointer"), dl = S == null ? g : Nu(S), h = j == null ? g : Nu(j), g = new Z(b, v + "leave", S, a, r), g.target = dl, g.relatedTarget = h, b = null, La(r) === o && (Z = new Z(y, v + "enter", j, a, r), Z.target = h, Z.relatedTarget = dl, b = Z), dl = b, S && j) t: {
              for (Z = Zm, y = S, v = j, h = 0, b = y; b; b = Z(b)) h++;
              b = 0;
              for (var Q = v; Q; Q = Z(Q)) b++;
              for (; 0 < h - b; ) y = Z(y), h--;
              for (; 0 < b - h; ) v = Z(v), b--;
              for (; h--; ) {
                if (y === v || v !== null && y === v.alternate) {
                  Z = y;
                  break t;
                }
                y = Z(y), v = Z(v);
              }
              Z = null;
            }
            else Z = null;
            S !== null && Ad(z, g, S, Z, !1), j !== null && dl !== null && Ad(z, dl, j, Z, !0);
          }
        }
        l: {
          if (g = o ? Nu(o) : window, S = g.nodeName && g.nodeName.toLowerCase(), S === "select" || S === "input" && g.type === "file") var al = Vf;
          else if (Zf(g)) if (xf) al = F1;
          else {
            al = $1;
            var B = W1;
          }
          else S = g.nodeName, !S || S.toLowerCase() !== "input" || g.type !== "checkbox" && g.type !== "radio" ? o && In(o.elementType) && (al = Vf) : al = k1;
          if (al && (al = al(l, o))) {
            Lf(z, al, a, r);
            break l;
          }
          B && B(l, g, o), l === "focusout" && o && g.type === "number" && o.memoizedProps.value != null && Fn(g, "number", g.value);
        }
        switch (B = o ? Nu(o) : window, l) {
          case "focusin":
            (Zf(B) || B.contentEditable === "true") && (Fa = B, si = o, Xu = null);
            break;
          case "focusout":
            Xu = si = Fa = null;
            break;
          case "mousedown":
            yi = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            yi = !1, If(z, a, r);
            break;
          case "selectionchange":
            if (P1) break;
          case "keydown":
          case "keyup":
            If(z, a, r);
        }
        var x;
        if (fi) l: {
          switch (l) {
            case "compositionstart":
              var I = "onCompositionStart";
              break l;
            case "compositionend":
              I = "onCompositionEnd";
              break l;
            case "compositionupdate":
              I = "onCompositionUpdate";
              break l;
          }
          I = void 0;
        }
        else ka ? Xf(l, a) && (I = "onCompositionEnd") : l === "keydown" && a.keyCode === 229 && (I = "onCompositionStart");
        I && (Yf && a.locale !== "ko" && (ka || I !== "onCompositionStart" ? I === "onCompositionEnd" && ka && (x = Hf()) : (la = r, ui = "value" in la ? la.value : la.textContent, ka = !0)), B = On(o, I), 0 < B.length && (I = new Bf(I, l, null, a, r), z.push({
          event: I,
          listeners: B
        }), x ? I.data = x : (x = Qf(a), x !== null && (I.data = x)))), (x = V1 ? x1(l, a) : K1(l, a)) && (I = On(o, "onBeforeInput"), 0 < I.length && (B = new Bf("onBeforeInput", "beforeinput", null, a, r), z.push({
          event: B,
          listeners: I
        }), B.data = x)), Xm(z, l, o, a, r);
      }
      _d(z, t);
    });
  }
  function de(l, t, a) {
    return {
      instance: l,
      listener: t,
      currentTarget: a
    };
  }
  function On(l, t) {
    for (var a = t + "Capture", u = []; l !== null; ) {
      var e = l, n = e.stateNode;
      if (e = e.tag, e !== 5 && e !== 26 && e !== 27 || n === null || (e = Hu(l, a), e != null && u.unshift(de(l, e, n)), e = Hu(l, t), e != null && u.push(de(l, e, n))), l.tag === 3) return u;
      l = l.return;
    }
    return [];
  }
  function Zm(l) {
    if (l === null) return null;
    do
      l = l.return;
    while (l && l.tag !== 5 && l.tag !== 27);
    return l || null;
  }
  function Ad(l, t, a, u, e) {
    for (var n = t._reactName, i = []; a !== null && a !== u; ) {
      var c = a, f = c.alternate, o = c.stateNode;
      if (c = c.tag, f !== null && f === u) break;
      c !== 5 && c !== 26 && c !== 27 || o === null || (f = o, e ? (o = Hu(a, n), o != null && i.unshift(de(a, o, f))) : e || (o = Hu(a, n), o != null && i.push(de(a, o, f)))), a = a.return;
    }
    i.length !== 0 && l.push({
      event: t,
      listeners: i
    });
  }
  var Lm = /\r\n?/g, Vm = /\u0000|\uFFFD/g;
  function Od(l) {
    return (typeof l == "string" ? l : "" + l).replace(Lm, `
`).replace(Vm, "");
  }
  function Md(l, t) {
    return t = Od(t), Od(l) === t;
  }
  function vl(l, t, a, u, e, n) {
    switch (a) {
      case "children":
        typeof u == "string" ? t === "body" || t === "textarea" && u === "" || wa(l, u) : (typeof u == "number" || typeof u == "bigint") && t !== "body" && wa(l, "" + u);
        break;
      case "className":
        Ue(l, "class", u);
        break;
      case "tabIndex":
        Ue(l, "tabindex", u);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        Ue(l, a, u);
        break;
      case "style":
        Uf(l, u, n);
        break;
      case "data":
        if (t !== "object") {
          Ue(l, "data", u);
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
        u = Ne("" + u), l.setAttribute(a, u);
        break;
      case "action":
      case "formAction":
        if (typeof u == "function") {
          l.setAttribute(a, "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");
          break;
        } else typeof n == "function" && (a === "formAction" ? (t !== "input" && vl(l, t, "name", e.name, e, null), vl(l, t, "formEncType", e.formEncType, e, null), vl(l, t, "formMethod", e.formMethod, e, null), vl(l, t, "formTarget", e.formTarget, e, null)) : (vl(l, t, "encType", e.encType, e, null), vl(l, t, "method", e.method, e, null), vl(l, t, "target", e.target, e, null)));
        if (u == null || typeof u == "symbol" || typeof u == "boolean") {
          l.removeAttribute(a);
          break;
        }
        u = Ne("" + u), l.setAttribute(a, u);
        break;
      case "onClick":
        u != null && (l.onclick = Bt);
        break;
      case "onScroll":
        u != null && $("scroll", l);
        break;
      case "onScrollEnd":
        u != null && $("scrollend", l);
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
        a = Ne("" + u), l.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", a);
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
        $("beforetoggle", l), $("toggle", l), De(l, "popover", u);
        break;
      case "xlinkActuate":
        Rt(l, "http://www.w3.org/1999/xlink", "xlink:actuate", u);
        break;
      case "xlinkArcrole":
        Rt(l, "http://www.w3.org/1999/xlink", "xlink:arcrole", u);
        break;
      case "xlinkRole":
        Rt(l, "http://www.w3.org/1999/xlink", "xlink:role", u);
        break;
      case "xlinkShow":
        Rt(l, "http://www.w3.org/1999/xlink", "xlink:show", u);
        break;
      case "xlinkTitle":
        Rt(l, "http://www.w3.org/1999/xlink", "xlink:title", u);
        break;
      case "xlinkType":
        Rt(l, "http://www.w3.org/1999/xlink", "xlink:type", u);
        break;
      case "xmlBase":
        Rt(l, "http://www.w3.org/XML/1998/namespace", "xml:base", u);
        break;
      case "xmlLang":
        Rt(l, "http://www.w3.org/XML/1998/namespace", "xml:lang", u);
        break;
      case "xmlSpace":
        Rt(l, "http://www.w3.org/XML/1998/namespace", "xml:space", u);
        break;
      case "is":
        De(l, "is", u);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < a.length) || a[0] !== "o" && a[0] !== "O" || a[1] !== "n" && a[1] !== "N") && (a = D1.get(a) || a, De(l, a, u));
    }
  }
  function qc(l, t, a, u, e, n) {
    switch (a) {
      case "style":
        Uf(l, u, n);
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
        u != null && $("scroll", l);
        break;
      case "onScrollEnd":
        u != null && $("scrollend", l);
        break;
      case "onClick":
        u != null && (l.onclick = Bt);
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
        if (!bf.hasOwnProperty(a)) l: {
          if (a[0] === "o" && a[1] === "n" && (e = a.endsWith("Capture"), t = a.slice(2, e ? a.length - 7 : void 0), n = l[Wl] || null, n = n != null ? n[a] : null, typeof n == "function" && l.removeEventListener(t, n, e), typeof u == "function")) {
            typeof n != "function" && n !== null && (a in l ? l[a] = null : l.hasAttribute(a) && l.removeAttribute(a)), l.addEventListener(t, u, e);
            break l;
          }
          a in l ? l[a] = u : u === !0 ? l.setAttribute(a, "") : De(l, a, u);
        }
    }
  }
  function Zl(l, t, a) {
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
        $("error", l), $("load", l);
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
              vl(l, t, n, i, a, null);
          }
        }
        e && vl(l, t, "srcSet", a.srcSet, a, null), u && vl(l, t, "src", a.src, a, null);
        return;
      case "input":
        $("invalid", l);
        var c = n = i = e = null, f = null, o = null;
        for (u in a) if (a.hasOwnProperty(u)) {
          var r = a[u];
          if (r != null) switch (u) {
            case "name":
              e = r;
              break;
            case "type":
              i = r;
              break;
            case "checked":
              f = r;
              break;
            case "defaultChecked":
              o = r;
              break;
            case "value":
              n = r;
              break;
            case "defaultValue":
              c = r;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              if (r != null) throw Error(s(137, t));
              break;
            default:
              vl(l, t, u, r, a, null);
          }
        }
        Af(l, n, c, f, o, i, e, !1);
        return;
      case "select":
        $("invalid", l), u = i = n = null;
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
            vl(l, t, e, c, a, null);
        }
        t = n, a = i, l.multiple = !!u, t != null ? Ja(l, !!u, t, !1) : a != null && Ja(l, !!u, a, !0);
        return;
      case "textarea":
        $("invalid", l), n = e = u = null;
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
            vl(l, t, i, c, a, null);
        }
        Mf(l, u, e, n);
        return;
      case "option":
        for (f in a) if (a.hasOwnProperty(f) && (u = a[f], u != null)) switch (f) {
          case "selected":
            l.selected = u && typeof u != "function" && typeof u != "symbol";
            break;
          default:
            vl(l, t, f, u, a, null);
        }
        return;
      case "dialog":
        $("beforetoggle", l), $("toggle", l), $("cancel", l), $("close", l);
        break;
      case "iframe":
      case "object":
        $("load", l);
        break;
      case "video":
      case "audio":
        for (u = 0; u < ve.length; u++) $(ve[u], l);
        break;
      case "image":
        $("error", l), $("load", l);
        break;
      case "details":
        $("toggle", l);
        break;
      case "embed":
      case "source":
      case "link":
        $("error", l), $("load", l);
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
        for (o in a) if (a.hasOwnProperty(o) && (u = a[o], u != null)) switch (o) {
          case "children":
          case "dangerouslySetInnerHTML":
            throw Error(s(137, t));
          default:
            vl(l, t, o, u, a, null);
        }
        return;
      default:
        if (In(t)) {
          for (r in a) a.hasOwnProperty(r) && (u = a[r], u !== void 0 && qc(l, t, r, u, a, void 0));
          return;
        }
    }
    for (c in a) a.hasOwnProperty(c) && (u = a[c], u != null && vl(l, t, c, u, a, null));
  }
  function xm(l, t, a, u) {
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
        var e = null, n = null, i = null, c = null, f = null, o = null, r = null;
        for (S in a) {
          var z = a[S];
          if (a.hasOwnProperty(S) && z != null) switch (S) {
            case "checked":
              break;
            case "value":
              break;
            case "defaultValue":
              f = z;
            default:
              u.hasOwnProperty(S) || vl(l, t, S, null, u, z);
          }
        }
        for (var g in u) {
          var S = u[g];
          if (z = a[g], u.hasOwnProperty(g) && (S != null || z != null)) switch (g) {
            case "type":
              n = S;
              break;
            case "name":
              e = S;
              break;
            case "checked":
              o = S;
              break;
            case "defaultChecked":
              r = S;
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
              S !== z && vl(l, t, g, S, u, z);
          }
        }
        kn(l, i, c, f, o, r, n, e);
        return;
      case "select":
        S = i = c = g = null;
        for (n in a) if (f = a[n], a.hasOwnProperty(n) && f != null) switch (n) {
          case "value":
            break;
          case "multiple":
            S = f;
          default:
            u.hasOwnProperty(n) || vl(l, t, n, null, u, f);
        }
        for (e in u) if (n = u[e], f = a[e], u.hasOwnProperty(e) && (n != null || f != null)) switch (e) {
          case "value":
            g = n;
            break;
          case "defaultValue":
            c = n;
            break;
          case "multiple":
            i = n;
          default:
            n !== f && vl(l, t, e, n, u, f);
        }
        t = c, a = i, u = S, g != null ? Ja(l, !!a, g, !1) : !!u != !!a && (t != null ? Ja(l, !!a, t, !0) : Ja(l, !!a, a ? [] : "", !1));
        return;
      case "textarea":
        S = g = null;
        for (c in a) if (e = a[c], a.hasOwnProperty(c) && e != null && !u.hasOwnProperty(c)) switch (c) {
          case "value":
            break;
          case "children":
            break;
          default:
            vl(l, t, c, null, u, e);
        }
        for (i in u) if (e = u[i], n = a[i], u.hasOwnProperty(i) && (e != null || n != null)) switch (i) {
          case "value":
            g = e;
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
            e !== n && vl(l, t, i, e, u, n);
        }
        Of(l, g, S);
        return;
      case "option":
        for (var j in a) if (g = a[j], a.hasOwnProperty(j) && g != null && !u.hasOwnProperty(j)) switch (j) {
          case "selected":
            l.selected = !1;
            break;
          default:
            vl(l, t, j, null, u, g);
        }
        for (f in u) if (g = u[f], S = a[f], u.hasOwnProperty(f) && g !== S && (g != null || S != null)) switch (f) {
          case "selected":
            l.selected = g && typeof g != "function" && typeof g != "symbol";
            break;
          default:
            vl(l, t, f, g, u, S);
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
        for (var Z in a) g = a[Z], a.hasOwnProperty(Z) && g != null && !u.hasOwnProperty(Z) && vl(l, t, Z, null, u, g);
        for (o in u) if (g = u[o], S = a[o], u.hasOwnProperty(o) && g !== S && (g != null || S != null)) switch (o) {
          case "children":
          case "dangerouslySetInnerHTML":
            if (g != null) throw Error(s(137, t));
            break;
          default:
            vl(l, t, o, g, u, S);
        }
        return;
      default:
        if (In(t)) {
          for (var dl in a) g = a[dl], a.hasOwnProperty(dl) && g !== void 0 && !u.hasOwnProperty(dl) && qc(l, t, dl, void 0, u, g);
          for (r in u) g = u[r], S = a[r], !u.hasOwnProperty(r) || g === S || g === void 0 && S === void 0 || qc(l, t, r, g, u, S);
          return;
        }
    }
    for (var y in a) g = a[y], a.hasOwnProperty(y) && g != null && !u.hasOwnProperty(y) && vl(l, t, y, null, u, g);
    for (z in u) g = u[z], S = a[z], !u.hasOwnProperty(z) || g === S || g == null && S == null || vl(l, t, z, g, u, S);
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
  function Km() {
    if (typeof performance.getEntriesByType == "function") {
      for (var l = 0, t = 0, a = performance.getEntriesByType("resource"), u = 0; u < a.length; u++) {
        var e = a[u], n = e.transferSize, i = e.initiatorType, c = e.duration;
        if (n && c && Dd(i)) {
          for (i = 0, c = e.responseEnd, u += 1; u < a.length; u++) {
            var f = a[u], o = f.startTime;
            if (o > c) break;
            var r = f.transferSize, z = f.initiatorType;
            r && Dd(z) && (f = f.responseEnd, i += r * (f < c ? 1 : (c - o) / (f - o)));
          }
          if (--u, t += 8 * (n + i) / (e.duration / 1e3), l++, 10 < l) break;
        }
      }
      if (0 < l) return t / l / 1e6;
    }
    return navigator.connection && (l = navigator.connection.downlink, typeof l == "number") ? l : 5;
  }
  var Gc = null, Xc = null;
  function Mn(l) {
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
  function pd(l, t) {
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
  function Jm() {
    var l = window.event;
    return l && l.type === "popstate" ? l === Zc ? !1 : (Zc = l, !0) : (Zc = null, !1);
  }
  var Nd = typeof setTimeout == "function" ? setTimeout : void 0, wm = typeof clearTimeout == "function" ? clearTimeout : void 0, Hd = typeof Promise == "function" ? Promise : void 0, Wm = typeof queueMicrotask == "function" ? queueMicrotask : typeof Hd < "u" ? function(l) {
    return Hd.resolve(null).then(l).catch($m);
  } : Nd;
  function $m(l) {
    setTimeout(function() {
      throw l;
    });
  }
  function oa(l) {
    return l === "head";
  }
  function jd(l, t) {
    var a = t, u = 0;
    do {
      var e = a.nextSibling;
      if (l.removeChild(a), e && e.nodeType === 8) if (a = e.data, a === "/$" || a === "/&") {
        if (u === 0) {
          l.removeChild(e), Au(t);
          return;
        }
        u--;
      } else if (a === "$" || a === "$?" || a === "$~" || a === "$!" || a === "&") u++;
      else if (a === "html") me(l.ownerDocument.documentElement);
      else if (a === "head") {
        a = l.ownerDocument.head, me(a);
        for (var n = a.firstChild; n; ) {
          var i = n.nextSibling, c = n.nodeName;
          n[pu] || c === "SCRIPT" || c === "STYLE" || c === "LINK" && n.rel.toLowerCase() === "stylesheet" || a.removeChild(n), n = i;
        }
      } else a === "body" && me(l.ownerDocument.body);
      a = e;
    } while (a);
    Au(t);
  }
  function Rd(l, t) {
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
  function km(l, t, a, u) {
    for (; l.nodeType === 1; ) {
      var e = a;
      if (l.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!u && (l.nodeName !== "INPUT" || l.type !== "hidden")) break;
      } else if (u) {
        if (!l[pu]) switch (t) {
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
      if (l = _t(l.nextSibling), l === null) break;
    }
    return null;
  }
  function Fm(l, t, a) {
    if (t === "") return null;
    for (; l.nodeType !== 3; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !a || (l = _t(l.nextSibling), l === null)) return null;
    return l;
  }
  function Bd(l, t) {
    for (; l.nodeType !== 8; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !t || (l = _t(l.nextSibling), l === null)) return null;
    return l;
  }
  function Vc(l) {
    return l.data === "$?" || l.data === "$~";
  }
  function xc(l) {
    return l.data === "$!" || l.data === "$?" && l.ownerDocument.readyState !== "loading";
  }
  function Im(l, t) {
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
  function _t(l) {
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
  var Kc = null;
  function Cd(l) {
    l = l.nextSibling;
    for (var t = 0; l; ) {
      if (l.nodeType === 8) {
        var a = l.data;
        if (a === "/$" || a === "/&") {
          if (t === 0) return _t(l.nextSibling);
          t--;
        } else a !== "$" && a !== "$!" && a !== "$?" && a !== "$~" && a !== "&" || t++;
      }
      l = l.nextSibling;
    }
    return null;
  }
  function Yd(l) {
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
  function qd(l, t, a) {
    switch (t = Mn(a), l) {
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
  function me(l) {
    for (var t = l.attributes; t.length; ) l.removeAttributeNode(t[0]);
    Wn(l);
  }
  var Et = /* @__PURE__ */ new Map(), Gd = /* @__PURE__ */ new Set();
  function Dn(l) {
    return typeof l.getRootNode == "function" ? l.getRootNode() : l.nodeType === 9 ? l : l.ownerDocument;
  }
  var Ft = D.d;
  D.d = {
    f: Pm,
    r: ls,
    D: ts,
    C: as,
    L: us,
    m: es,
    X: is,
    S: ns,
    M: cs
  };
  function Pm() {
    var l = Ft.f(), t = rn();
    return l || t;
  }
  function ls(l) {
    var t = Va(l);
    t !== null && t.tag === 5 && t.type === "form" ? uv(t) : Ft.r(l);
  }
  var _u = typeof document > "u" ? null : document;
  function Xd(l, t, a) {
    var u = _u;
    if (u && typeof t == "string" && t) {
      var e = yt(t);
      e = 'link[rel="' + l + '"][href="' + e + '"]', typeof a == "string" && (e += '[crossorigin="' + a + '"]'), Gd.has(e) || (Gd.add(e), l = {
        rel: l,
        crossOrigin: a,
        href: t
      }, u.querySelector(e) === null && (t = u.createElement("link"), Zl(t, "link", l), Cl(t), u.head.appendChild(t)));
    }
  }
  function ts(l) {
    Ft.D(l), Xd("dns-prefetch", l, null);
  }
  function as(l, t) {
    Ft.C(l, t), Xd("preconnect", l, t);
  }
  function us(l, t, a) {
    Ft.L(l, t, a);
    var u = _u;
    if (u && l && t) {
      var e = 'link[rel="preload"][as="' + yt(t) + '"]';
      t === "image" && a && a.imageSrcSet ? (e += '[imagesrcset="' + yt(a.imageSrcSet) + '"]', typeof a.imageSizes == "string" && (e += '[imagesizes="' + yt(a.imageSizes) + '"]')) : e += '[href="' + yt(l) + '"]';
      var n = e;
      switch (t) {
        case "style":
          n = Eu(l);
          break;
        case "script":
          n = Tu(l);
      }
      Et.has(n) || (l = R({
        rel: "preload",
        href: t === "image" && a && a.imageSrcSet ? void 0 : l,
        as: t
      }, a), Et.set(n, l), u.querySelector(e) !== null || t === "style" && u.querySelector(se(n)) || t === "script" && u.querySelector(ye(n)) || (t = u.createElement("link"), Zl(t, "link", l), Cl(t), u.head.appendChild(t)));
    }
  }
  function es(l, t) {
    Ft.m(l, t);
    var a = _u;
    if (a && l) {
      var u = t && typeof t.as == "string" ? t.as : "script", e = 'link[rel="modulepreload"][as="' + yt(u) + '"][href="' + yt(l) + '"]', n = e;
      switch (u) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          n = Tu(l);
      }
      if (!Et.has(n) && (l = R({
        rel: "modulepreload",
        href: l
      }, t), Et.set(n, l), a.querySelector(e) === null)) {
        switch (u) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (a.querySelector(ye(n))) return;
        }
        u = a.createElement("link"), Zl(u, "link", l), Cl(u), a.head.appendChild(u);
      }
    }
  }
  function ns(l, t, a) {
    Ft.S(l, t, a);
    var u = _u;
    if (u && l) {
      var e = xa(u).hoistableStyles, n = Eu(l);
      t = t || "default";
      var i = e.get(n);
      if (!i) {
        var c = {
          loading: 0,
          preload: null
        };
        if (i = u.querySelector(se(n))) c.loading = 5;
        else {
          l = R({
            rel: "stylesheet",
            href: l,
            "data-precedence": t
          }, a), (a = Et.get(n)) && Jc(l, a);
          var f = i = u.createElement("link");
          Cl(f), Zl(f, "link", l), f._p = new Promise(function(o, r) {
            f.onload = o, f.onerror = r;
          }), f.addEventListener("load", function() {
            c.loading |= 1;
          }), f.addEventListener("error", function() {
            c.loading |= 2;
          }), c.loading |= 4, Un(i, t, u);
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
  function is(l, t) {
    Ft.X(l, t);
    var a = _u;
    if (a && l) {
      var u = xa(a).hoistableScripts, e = Tu(l), n = u.get(e);
      n || (n = a.querySelector(ye(e)), n || (l = R({
        src: l,
        async: !0
      }, t), (t = Et.get(e)) && wc(l, t), n = a.createElement("script"), Cl(n), Zl(n, "link", l), a.head.appendChild(n)), n = {
        type: "script",
        instance: n,
        count: 1,
        state: null
      }, u.set(e, n));
    }
  }
  function cs(l, t) {
    Ft.M(l, t);
    var a = _u;
    if (a && l) {
      var u = xa(a).hoistableScripts, e = Tu(l), n = u.get(e);
      n || (n = a.querySelector(ye(e)), n || (l = R({
        src: l,
        async: !0,
        type: "module"
      }, t), (t = Et.get(e)) && wc(l, t), n = a.createElement("script"), Cl(n), Zl(n, "link", l), a.head.appendChild(n)), n = {
        type: "script",
        instance: n,
        count: 1,
        state: null
      }, u.set(e, n));
    }
  }
  function Qd(l, t, a, u) {
    var e = (e = w.current) ? Dn(e) : null;
    if (!e) throw Error(s(446));
    switch (l) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof a.precedence == "string" && typeof a.href == "string" ? (t = Eu(a.href), a = xa(e).hoistableStyles, u = a.get(t), u || (u = {
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
          l = Eu(a.href);
          var n = xa(e).hoistableStyles, i = n.get(l);
          if (i || (e = e.ownerDocument || e, i = {
            type: "stylesheet",
            instance: null,
            count: 0,
            state: {
              loading: 0,
              preload: null
            }
          }, n.set(l, i), (n = e.querySelector(se(l))) && !n._p && (i.instance = n, i.state.loading = 5), Et.has(l) || (a = {
            rel: "preload",
            as: "style",
            href: a.href,
            crossOrigin: a.crossOrigin,
            integrity: a.integrity,
            media: a.media,
            hrefLang: a.hrefLang,
            referrerPolicy: a.referrerPolicy
          }, Et.set(l, a), n || fs(e, l, a, i.state))), t && u === null) throw Error(s(528, ""));
          return i;
        }
        if (t && u !== null) throw Error(s(529, ""));
        return null;
      case "script":
        return t = a.async, a = a.src, typeof a == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Tu(a), a = xa(e).hoistableScripts, u = a.get(t), u || (u = {
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
  function Eu(l) {
    return 'href="' + yt(l) + '"';
  }
  function se(l) {
    return 'link[rel="stylesheet"][' + l + "]";
  }
  function Zd(l) {
    return R({}, l, {
      "data-precedence": l.precedence,
      precedence: null
    });
  }
  function fs(l, t, a, u) {
    l.querySelector('link[rel="preload"][as="style"][' + t + "]") ? u.loading = 1 : (t = l.createElement("link"), u.preload = t, t.addEventListener("load", function() {
      return u.loading |= 1;
    }), t.addEventListener("error", function() {
      return u.loading |= 2;
    }), Zl(t, "link", a), Cl(t), l.head.appendChild(t));
  }
  function Tu(l) {
    return '[src="' + yt(l) + '"]';
  }
  function ye(l) {
    return "script[async]" + l;
  }
  function Ld(l, t, a) {
    if (t.count++, t.instance === null) switch (t.type) {
      case "style":
        var u = l.querySelector('style[data-href~="' + yt(a.href) + '"]');
        if (u) return t.instance = u, Cl(u), u;
        var e = R({}, a, {
          "data-href": a.href,
          "data-precedence": a.precedence,
          href: null,
          precedence: null
        });
        return u = (l.ownerDocument || l).createElement("style"), Cl(u), Zl(u, "style", e), Un(u, a.precedence, l), t.instance = u;
      case "stylesheet":
        e = Eu(a.href);
        var n = l.querySelector(se(e));
        if (n) return t.state.loading |= 4, t.instance = n, Cl(n), n;
        u = Zd(a), (e = Et.get(e)) && Jc(u, e), n = (l.ownerDocument || l).createElement("link"), Cl(n);
        var i = n;
        return i._p = new Promise(function(c, f) {
          i.onload = c, i.onerror = f;
        }), Zl(n, "link", u), t.state.loading |= 4, Un(n, a.precedence, l), t.instance = n;
      case "script":
        return n = Tu(a.src), (e = l.querySelector(ye(n))) ? (t.instance = e, Cl(e), e) : (u = a, (e = Et.get(n)) && (u = R({}, a), wc(u, e)), l = l.ownerDocument || l, e = l.createElement("script"), Cl(e), Zl(e, "link", u), l.head.appendChild(e), t.instance = e);
      case "void":
        return null;
      default:
        throw Error(s(443, t.type));
    }
    else t.type === "stylesheet" && (t.state.loading & 4) === 0 && (u = t.instance, t.state.loading |= 4, Un(u, a.precedence, l));
    return t.instance;
  }
  function Un(l, t, a) {
    for (var u = a.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'), e = u.length ? u[u.length - 1] : null, n = e, i = 0; i < u.length; i++) {
      var c = u[i];
      if (c.dataset.precedence === t) n = c;
      else if (n !== e) break;
    }
    n ? n.parentNode.insertBefore(l, n.nextSibling) : (t = a.nodeType === 9 ? a.head : a, t.insertBefore(l, t.firstChild));
  }
  function Jc(l, t) {
    l.crossOrigin ??= t.crossOrigin, l.referrerPolicy ??= t.referrerPolicy, l.title ??= t.title;
  }
  function wc(l, t) {
    l.crossOrigin ??= t.crossOrigin, l.referrerPolicy ??= t.referrerPolicy, l.integrity ??= t.integrity;
  }
  var pn = null;
  function Vd(l, t, a) {
    if (pn === null) {
      var u = /* @__PURE__ */ new Map(), e = pn = /* @__PURE__ */ new Map();
      e.set(a, u);
    } else e = pn, u = e.get(a), u || (u = /* @__PURE__ */ new Map(), e.set(a, u));
    if (u.has(l)) return u;
    for (u.set(l, null), a = a.getElementsByTagName(l), e = 0; e < a.length; e++) {
      var n = a[e];
      if (!(n[pu] || n[ql] || l === "link" && n.getAttribute("rel") === "stylesheet") && n.namespaceURI !== "http://www.w3.org/2000/svg") {
        var i = n.getAttribute(t) || "";
        i = l + i;
        var c = u.get(i);
        c ? c.push(n) : u.set(i, [n]);
      }
    }
    return u;
  }
  function xd(l, t, a) {
    l = l.ownerDocument || l, l.head.insertBefore(a, t === "title" ? l.querySelector("head > title") : null);
  }
  function vs(l, t, a) {
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
  function Kd(l) {
    return !(l.type === "stylesheet" && (l.state.loading & 3) === 0);
  }
  function ds(l, t, a, u) {
    if (a.type === "stylesheet" && (typeof u.media != "string" || matchMedia(u.media).matches !== !1) && (a.state.loading & 4) === 0) {
      if (a.instance === null) {
        var e = Eu(u.href), n = t.querySelector(se(e));
        if (n) {
          t = n._p, t !== null && typeof t == "object" && typeof t.then == "function" && (l.count++, l = Nn.bind(l), t.then(l, l)), a.state.loading |= 4, a.instance = n, Cl(n);
          return;
        }
        n = t.ownerDocument || t, u = Zd(u), (e = Et.get(e)) && Jc(u, e), n = n.createElement("link"), Cl(n);
        var i = n;
        i._p = new Promise(function(c, f) {
          i.onload = c, i.onerror = f;
        }), Zl(n, "link", u), a.instance = n;
      }
      l.stylesheets === null && (l.stylesheets = /* @__PURE__ */ new Map()), l.stylesheets.set(a, t), (t = a.state.preload) && (a.state.loading & 3) === 0 && (l.count++, a = Nn.bind(l), t.addEventListener("load", a), t.addEventListener("error", a));
    }
  }
  var Wc = 0;
  function ms(l, t) {
    return l.stylesheets && l.count === 0 && jn(l, l.stylesheets), 0 < l.count || 0 < l.imgCount ? function(a) {
      var u = setTimeout(function() {
        if (l.stylesheets && jn(l, l.stylesheets), l.unsuspend) {
          var n = l.unsuspend;
          l.unsuspend = null, n();
        }
      }, 6e4 + t);
      0 < l.imgBytes && Wc === 0 && (Wc = 62500 * Km());
      var e = setTimeout(function() {
        if (l.waitingForImages = !1, l.count === 0 && (l.stylesheets && jn(l, l.stylesheets), l.unsuspend)) {
          var n = l.unsuspend;
          l.unsuspend = null, n();
        }
      }, (l.imgBytes > Wc ? 50 : 800) + t);
      return l.unsuspend = a, function() {
        l.unsuspend = null, clearTimeout(u), clearTimeout(e);
      };
    } : null;
  }
  function Nn() {
    if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
      if (this.stylesheets) jn(this, this.stylesheets);
      else if (this.unsuspend) {
        var l = this.unsuspend;
        this.unsuspend = null, l();
      }
    }
  }
  var Hn = null;
  function jn(l, t) {
    l.stylesheets = null, l.unsuspend !== null && (l.count++, Hn = /* @__PURE__ */ new Map(), t.forEach(ss, l), Hn = null, Nn.call(l));
  }
  function ss(l, t) {
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
      e = t.instance, i = e.getAttribute("data-precedence"), n = a.get(i) || u, n === u && a.set(null, e), a.set(i, e), this.count++, u = Nn.bind(this), e.addEventListener("load", u), e.addEventListener("error", u), n ? n.parentNode.insertBefore(e, n.nextSibling) : (l = l.nodeType === 9 ? l.head : l, l.insertBefore(e, l.firstChild)), t.state.loading |= 4;
    }
  }
  var he = {
    $$typeof: El,
    Provider: null,
    Consumer: null,
    _currentValue: tl,
    _currentValue2: tl,
    _threadCount: 0
  };
  function ys(l, t, a, u, e, n, i, c, f) {
    this.tag = 1, this.containerInfo = l, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Kn(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Kn(0), this.hiddenUpdates = Kn(null), this.identifierPrefix = u, this.onUncaughtError = e, this.onCaughtError = n, this.onRecoverableError = i, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = f, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function hs(l, t, a, u, e, n, i, c, f, o, r, z) {
    return l = new ys(l, t, a, i, f, o, r, z, c), t = 1, n === !0 && (t |= 24), n = ct(3, null, null, t), l.current = n, n.stateNode = l, t = Ui(), t.refCount++, l.pooledCache = t, t.refCount++, n.memoizedState = {
      element: u,
      isDehydrated: a,
      cache: t
    }, ji(n), l;
  }
  function os(l) {
    return l ? (l = lu, l) : lu;
  }
  function Jd(l, t, a, u, e, n) {
    e = os(e), u.context === null ? u.context = e : u.pendingContext = e, u = Ya(t), u.payload = { element: a }, n = n === void 0 ? null : n, n !== null && (u.callback = n), a = qa(l, u, t), a !== null && (lt(a, l, t), Ju(a, l, t));
  }
  function wd(l, t) {
    if (l = l.memoizedState, l !== null && l.dehydrated !== null) {
      var a = l.retryLane;
      l.retryLane = a !== 0 && a < t ? a : t;
    }
  }
  function $c(l, t) {
    wd(l, t), (l = l.alternate) && wd(l, t);
  }
  function Wd(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = Da(l, 67108864);
      t !== null && lt(t, l, 67108864), $c(l, 67108864);
    }
  }
  function $d(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = zt();
      t = hf(t);
      var a = Da(l, t);
      a !== null && lt(a, l, t), $c(l, t);
    }
  }
  var Rn = !0;
  function gs(l, t, a, u) {
    var e = A.T;
    A.T = null;
    var n = D.p;
    try {
      D.p = 2, kc(l, t, a, u);
    } finally {
      D.p = n, A.T = e;
    }
  }
  function Ss(l, t, a, u) {
    var e = A.T;
    A.T = null;
    var n = D.p;
    try {
      D.p = 8, kc(l, t, a, u);
    } finally {
      D.p = n, A.T = e;
    }
  }
  function kc(l, t, a, u) {
    if (Rn) {
      var e = Fc(u);
      if (e === null) Yc(l, t, u, Bn, a), Fd(l, u);
      else if (bs(e, l, t, a, u)) u.stopPropagation();
      else if (Fd(l, u), t & 4 && -1 < rs.indexOf(l)) {
        for (; e !== null; ) {
          var n = Va(e);
          if (n !== null) switch (n.tag) {
            case 3:
              if (n = n.stateNode, n.current.memoizedState.isDehydrated) {
                var i = Ea(n.pendingLanes);
                if (i !== 0) {
                  var c = n;
                  for (c.pendingLanes |= 2, c.entangledLanes |= 2; i; ) {
                    var f = 1 << 31 - nt(i);
                    c.entanglements[1] |= f, i &= ~f;
                  }
                  kt(n), (el & 6) === 0 && (gn = ut() + 500, fe(0, !1));
                }
              }
              break;
            case 31:
            case 13:
              c = Da(n, 2), c !== null && lt(c, n, 2), rn(), $c(n, 2);
          }
          if (n = Fc(u), n === null && Yc(l, t, u, Bn, a), n === e) break;
          e = n;
        }
        e !== null && u.stopPropagation();
      } else Yc(l, t, u, null, a);
    }
  }
  function Fc(l) {
    return l = li(l), Ic(l);
  }
  var Bn = null;
  function Ic(l) {
    if (Bn = null, l = La(l), l !== null) {
      var t = L(l);
      if (t === null) l = null;
      else {
        var a = t.tag;
        if (a === 13) {
          if (l = C(t), l !== null) return l;
          l = null;
        } else if (a === 31) {
          if (l = Y(t), l !== null) return l;
          l = null;
        } else if (a === 3) {
          if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
          l = null;
        } else t !== l && (l = null);
      }
    }
    return Bn = l, null;
  }
  function kd(l) {
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
        switch (m1()) {
          case cf:
            return 2;
          case ff:
            return 8;
          case _e:
          case s1:
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
  var Pc = !1, ga = null, Sa = null, ra = null, oe = /* @__PURE__ */ new Map(), ge = /* @__PURE__ */ new Map(), ba = [], rs = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");
  function Fd(l, t) {
    switch (l) {
      case "focusin":
      case "focusout":
        ga = null;
        break;
      case "dragenter":
      case "dragleave":
        Sa = null;
        break;
      case "mouseover":
      case "mouseout":
        ra = null;
        break;
      case "pointerover":
      case "pointerout":
        oe.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        ge.delete(t.pointerId);
    }
  }
  function Se(l, t, a, u, e, n) {
    return l === null || l.nativeEvent !== n ? (l = {
      blockedOn: t,
      domEventName: a,
      eventSystemFlags: u,
      nativeEvent: n,
      targetContainers: [e]
    }, t !== null && (t = Va(t), t !== null && Wd(t)), l) : (l.eventSystemFlags |= u, t = l.targetContainers, e !== null && t.indexOf(e) === -1 && t.push(e), l);
  }
  function bs(l, t, a, u, e) {
    switch (t) {
      case "focusin":
        return ga = Se(ga, l, t, a, u, e), !0;
      case "dragenter":
        return Sa = Se(Sa, l, t, a, u, e), !0;
      case "mouseover":
        return ra = Se(ra, l, t, a, u, e), !0;
      case "pointerover":
        var n = e.pointerId;
        return oe.set(n, Se(oe.get(n) || null, l, t, a, u, e)), !0;
      case "gotpointercapture":
        return n = e.pointerId, ge.set(n, Se(ge.get(n) || null, l, t, a, u, e)), !0;
    }
    return !1;
  }
  function Id(l) {
    var t = La(l.target);
    if (t !== null) {
      var a = L(t);
      if (a !== null) {
        if (t = a.tag, t === 13) {
          if (t = C(a), t !== null) {
            l.blockedOn = t, gf(l.priority, function() {
              $d(a);
            });
            return;
          }
        } else if (t === 31) {
          if (t = Y(a), t !== null) {
            l.blockedOn = t, gf(l.priority, function() {
              $d(a);
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
  function Cn(l) {
    if (l.blockedOn !== null) return !1;
    for (var t = l.targetContainers; 0 < t.length; ) {
      var a = Fc(l.nativeEvent);
      if (a === null) {
        a = l.nativeEvent;
        var u = new a.constructor(a.type, a);
        Pn = u, a.target.dispatchEvent(u), Pn = null;
      } else return t = Va(a), t !== null && Wd(t), l.blockedOn = a, !1;
      t.shift();
    }
    return !0;
  }
  function Pd(l, t, a) {
    Cn(l) && a.delete(t);
  }
  function zs() {
    Pc = !1, ga !== null && Cn(ga) && (ga = null), Sa !== null && Cn(Sa) && (Sa = null), ra !== null && Cn(ra) && (ra = null), oe.forEach(Pd), ge.forEach(Pd);
  }
  function Yn(l, t) {
    l.blockedOn === t && (l.blockedOn = null, Pc || (Pc = !0, T.unstable_scheduleCallback(T.unstable_NormalPriority, zs)));
  }
  var qn = null;
  function l1(l) {
    qn !== l && (qn = l, T.unstable_scheduleCallback(T.unstable_NormalPriority, function() {
      qn === l && (qn = null);
      for (var t = 0; t < l.length; t += 3) {
        var a = l[t], u = l[t + 1], e = l[t + 2];
        if (typeof u != "function") {
          if (Ic(u || a) === null) continue;
          break;
        }
        var n = Va(a);
        n !== null && (l.splice(t, 3), t -= 3, Ii(n, {
          pending: !0,
          data: e,
          method: a.method,
          action: u
        }, u, e));
      }
    }));
  }
  function Au(l) {
    function t(f) {
      return Yn(f, l);
    }
    ga !== null && Yn(ga, l), Sa !== null && Yn(Sa, l), ra !== null && Yn(ra, l), oe.forEach(t), ge.forEach(t);
    for (var a = 0; a < ba.length; a++) {
      var u = ba[a];
      u.blockedOn === l && (u.blockedOn = null);
    }
    for (; 0 < ba.length && (a = ba[0], a.blockedOn === null); ) Id(a), a.blockedOn === null && ba.shift();
    if (a = (l.ownerDocument || l).$$reactFormReplay, a != null) for (u = 0; u < a.length; u += 3) {
      var e = a[u], n = a[u + 1], i = e[Wl] || null;
      if (typeof n == "function") i || l1(a);
      else if (i) {
        var c = null;
        if (n && n.hasAttribute("formAction")) {
          if (e = n, i = n[Wl] || null) c = i.formAction;
          else if (Ic(e) !== null) continue;
        } else c = i.action;
        typeof c == "function" ? a[u + 1] = c : (a.splice(u, 3), u -= 3), l1(a);
      }
    }
  }
  function _s() {
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
  function lf(l) {
    this._internalRoot = l;
  }
  tf.prototype.render = lf.prototype.render = function(l) {
    var t = this._internalRoot;
    if (t === null) throw Error(s(409));
    var a = t.current;
    Jd(a, zt(), l, t, null, null);
  }, tf.prototype.unmount = lf.prototype.unmount = function() {
    var l = this._internalRoot;
    if (l !== null) {
      this._internalRoot = null;
      var t = l.containerInfo;
      Jd(l.current, 2, null, l, null, null), rn(), t[Uu] = null;
    }
  };
  function tf(l) {
    this._internalRoot = l;
  }
  tf.prototype.unstable_scheduleHydration = function(l) {
    if (l) {
      var t = of();
      l = {
        blockedOn: null,
        target: l,
        priority: t
      };
      for (var a = 0; a < ba.length && t !== 0 && t < ba[a].priority; a++) ;
      ba.splice(a, 0, l), a === 0 && Id(l);
    }
  };
  var t1 = M.version;
  if (t1 !== "19.2.8") throw Error(s(527, t1, "19.2.8"));
  D.findDOMNode = function(l) {
    var t = l._reactInternals;
    if (t === void 0)
      throw typeof l.render == "function" ? Error(s(188)) : (l = Object.keys(l).join(","), Error(s(268, l)));
    return l = E(t), l = l !== null ? X(l) : null, l = l === null ? null : l.stateNode, l;
  };
  var Es = {
    bundleType: 0,
    version: "19.2.8",
    rendererPackageName: "react-dom",
    currentDispatcherRef: A,
    reconcilerVersion: "19.2.8"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Gn = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Gn.isDisabled && Gn.supportsFiber) try {
      Mu = Gn.inject(Es), et = Gn;
    } catch {
    }
  }
  m.createRoot = function(l, t) {
    if (!G(l)) throw Error(s(299));
    var a = !1, u = "", e = Sm, n = rm, i = bm;
    return t != null && (t.unstable_strictMode === !0 && (a = !0), t.identifierPrefix !== void 0 && (u = t.identifierPrefix), t.onUncaughtError !== void 0 && (e = t.onUncaughtError), t.onCaughtError !== void 0 && (n = t.onCaughtError), t.onRecoverableError !== void 0 && (i = t.onRecoverableError)), t = hs(l, 1, !1, null, null, a, u, null, e, n, i, _s), l[Uu] = t.current, Ed(l), new lf(t);
  };
})), Ys = /* @__PURE__ */ Ht(((m, T) => {
  function M() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(M);
      } catch (H) {
        console.error(H);
      }
  }
  M(), T.exports = Cs();
})), qs = /* @__PURE__ */ Ht(((m) => {
  var T = Symbol.for("react.transitional.element"), M = Symbol.for("react.fragment");
  function H(s, G, L) {
    var C = null;
    if (L !== void 0 && (C = "" + L), G.key !== void 0 && (C = "" + G.key), "key" in G) {
      L = {};
      for (var Y in G) Y !== "key" && (L[Y] = G[Y]);
    } else L = G;
    return G = L.ref, {
      $$typeof: T,
      type: s,
      key: C,
      ref: G !== void 0 ? G : null,
      props: L
    };
  }
  m.Fragment = M, m.jsx = H, m.jsxs = H;
})), Gs = /* @__PURE__ */ Ht(((m, T) => {
  T.exports = qs();
})), Xs = Ys(), K = /* @__PURE__ */ ps(uf()), p = Gs(), Qs = 1, c1 = (0, K.createContext)(null);
function Is({ knopf: m, children: T }) {
  const [M, H] = (0, K.useState)([]), s = (0, K.useCallback)((C) => (H((Y) => [...Y, C]), () => H((Y) => Y.filter((N) => N !== C))), []), G = M.length > 0 ? Math.min(...M) : null, L = (0, K.useMemo)(() => ({
    knopf: m,
    erster: G,
    anmelden: s
  }), [
    m,
    G,
    s
  ]);
  return /* @__PURE__ */ (0, p.jsxs)(c1.Provider, {
    value: L,
    children: [G === null && /* @__PURE__ */ (0, p.jsx)("div", {
      className: "ara-kopf__vorne ara-kopf__vorne--allein",
      children: m
    }), T]
  });
}
function Ps({ titel: m, beschreibung: T, werkzeuge: M, aktionen: H, vorne: s, mittig: G = !1, ebene: L = 1 }) {
  const C = L === 2 ? "h2" : "h1", Y = (0, K.useRef)(null), N = Zs(Y, G), E = (0, K.useContext)(c1), [X] = (0, K.useState)(() => Qs++), R = E?.anmelden, ol = !G && s === void 0 && !!R;
  (0, K.useLayoutEffect)(() => ol && R ? R(X) : void 0, [
    ol,
    R,
    X
  ]);
  const gl = G ? null : s !== void 0 ? s : E?.erster === X ? E.knopf : null;
  return /* @__PURE__ */ (0, p.jsxs)("header", {
    ref: Y,
    className: "ara-kopf",
    "data-mittig": G ? "true" : void 0,
    style: N === null ? void 0 : { paddingRight: N },
    children: [
      /* @__PURE__ */ (0, p.jsxs)("div", {
        className: "ara-kopf__text",
        children: [/* @__PURE__ */ (0, p.jsx)(C, {
          className: "ara-kopf__titel",
          children: m
        }), T && /* @__PURE__ */ (0, p.jsx)("p", {
          className: "ara-kopf__satz",
          children: T
        })]
      }),
      !G && (M || gl) && /* @__PURE__ */ (0, p.jsxs)("div", {
        className: "ara-kopf__werkzeuge",
        role: "toolbar",
        "aria-label": `Aktionen: ${m}`,
        children: [
          M,
          M && gl && /* @__PURE__ */ (0, p.jsx)("span", {
            className: "ara-kopf__trenner",
            "aria-hidden": "true"
          }),
          gl && /* @__PURE__ */ (0, p.jsx)("span", {
            className: "ara-kopf__vorne",
            children: gl
          })
        ]
      }),
      H && /* @__PURE__ */ (0, p.jsx)("div", {
        className: "ara-kopf__aktionen",
        children: H
      })
    ]
  });
}
function Zs(m, T) {
  const [M, H] = (0, K.useState)(null);
  return (0, K.useLayoutEffect)(() => {
    if (T || typeof window > "u") return;
    const s = () => {
      const L = m.current;
      if (!L) return;
      const C = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ara-kapsel-platz"));
      if (!Number.isFinite(C) || C <= 0) {
        H(0);
        return;
      }
      const Y = document.documentElement.clientWidth - L.getBoundingClientRect().right;
      H(Math.max(0, Math.ceil(C - Y)));
    };
    s();
    const G = typeof ResizeObserver > "u" ? null : new ResizeObserver(s);
    return G?.observe(document.documentElement), window.addEventListener("resize", s), () => {
      G?.disconnect(), window.removeEventListener("resize", s);
    };
  }, [m, T]), M;
}
function ly({ symbol: m, beschriftung: T, aktiv: M, type: H = "button", className: s, ...G }) {
  return /* @__PURE__ */ (0, p.jsx)("button", {
    type: H,
    className: s ? `ara-werkzeug ${s}` : "ara-werkzeug",
    "aria-label": T,
    title: T,
    "aria-pressed": M === void 0 ? void 0 : M,
    ...G,
    children: /* @__PURE__ */ (0, p.jsx)("span", {
      className: "ara-werkzeug__symbol",
      "aria-hidden": "true",
      children: m
    })
  });
}
function ty({ beschriftung: m, dicht: T = !1, children: M }) {
  return /* @__PURE__ */ (0, p.jsxs)("div", { children: [m && /* @__PURE__ */ (0, p.jsx)("div", {
    className: "ara-liste__beschriftung",
    children: m
  }), /* @__PURE__ */ (0, p.jsx)("ul", {
    className: "ara-liste",
    "data-dicht": T ? "true" : void 0,
    "aria-label": m,
    children: M
  })] });
}
function ay({ titel: m, symbol: T, hinweis: M, unterzeile: H, erklaerung: s, onKlick: G, aktiv: L = !1, kennzeichen: C }) {
  const Y = /* @__PURE__ */ (0, p.jsxs)(p.Fragment, { children: [
    T && /* @__PURE__ */ (0, p.jsx)("span", {
      className: "ara-liste__symbol",
      "aria-hidden": "true",
      children: T
    }),
    /* @__PURE__ */ (0, p.jsxs)("span", {
      className: "ara-liste__text",
      children: [/* @__PURE__ */ (0, p.jsx)("span", {
        className: "ara-liste__wort",
        children: m
      }), H && /* @__PURE__ */ (0, p.jsx)("span", {
        className: "ara-liste__unterzeile",
        children: H
      })]
    }),
    M && /* @__PURE__ */ (0, p.jsx)("span", {
      className: "ara-liste__hinweis",
      children: M
    })
  ] });
  return /* @__PURE__ */ (0, p.jsx)("li", { children: G ? /* @__PURE__ */ (0, p.jsx)("button", {
    type: "button",
    className: "ara-liste__eintrag",
    "data-aktiv": L ? "true" : "false",
    "aria-current": L ? "true" : void 0,
    "data-testid": C,
    title: s,
    onClick: G,
    children: Y
  }) : /* @__PURE__ */ (0, p.jsx)("div", {
    className: "ara-liste__eintrag",
    "data-aktiv": L ? "true" : "false",
    "data-testid": C,
    title: s,
    children: Y
  }) });
}
function uy({ titel: m, hinweis: T, symbol: M, onKlick: H, kennzeichen: s, children: G }) {
  const L = (m || T) && /* @__PURE__ */ (0, p.jsxs)("div", {
    className: "ara-karte__kopf",
    children: [m && /* @__PURE__ */ (0, p.jsx)("h2", {
      className: "ara-karte__titel",
      children: m
    }), T && /* @__PURE__ */ (0, p.jsx)("span", {
      className: "ara-karte__hinweis",
      children: T
    })]
  }), C = G && /* @__PURE__ */ (0, p.jsx)("div", {
    className: "ara-karte__inhalt",
    children: G
  }), Y = M ? /* @__PURE__ */ (0, p.jsxs)(p.Fragment, { children: [/* @__PURE__ */ (0, p.jsx)("span", {
    className: "ara-karte__symbol",
    "aria-hidden": "true",
    children: M
  }), /* @__PURE__ */ (0, p.jsxs)("div", {
    className: "ara-karte__rumpf",
    children: [L, C]
  })] }) : /* @__PURE__ */ (0, p.jsxs)(p.Fragment, { children: [L, C] });
  return H ? /* @__PURE__ */ (0, p.jsx)("button", {
    type: "button",
    className: "ara-karte",
    "data-symbol": M ? "" : void 0,
    "data-testid": s,
    onClick: H,
    children: Y
  }) : /* @__PURE__ */ (0, p.jsx)("div", {
    className: "ara-karte",
    "data-symbol": M ? "" : void 0,
    "data-testid": s,
    children: Y
  });
}
function ey({ onAbsenden: m, aktionen: T, kennzeichen: M, children: H }) {
  const s = (G) => {
    G.preventDefault(), m?.();
  };
  return /* @__PURE__ */ (0, p.jsxs)("form", {
    className: "ara-formular",
    "data-testid": M,
    onSubmit: s,
    noValidate: !0,
    children: [H, T && /* @__PURE__ */ (0, p.jsx)("div", {
      className: "ara-formular__aktionen",
      children: T
    })]
  });
}
function ny({ kennung: m, beschriftung: T, hinweis: M, children: H }) {
  return /* @__PURE__ */ (0, p.jsxs)("div", {
    className: "ara-feld",
    children: [
      /* @__PURE__ */ (0, p.jsx)("label", {
        className: "ara-feld__beschriftung",
        htmlFor: m,
        children: T
      }),
      H,
      M && /* @__PURE__ */ (0, p.jsx)("p", {
        className: "ara-feld__hinweis",
        children: M
      })
    ]
  });
}
function re({ art: m = "still", typ: T = "knopf", onKlick: M, gesperrt: H = !1, kennzeichen: s, beschriftung: G, children: L }) {
  return /* @__PURE__ */ (0, p.jsx)("button", {
    type: T === "absenden" ? "submit" : "button",
    className: "ara-knopf",
    "data-art": m,
    "data-testid": s,
    "aria-label": G,
    disabled: H,
    onClick: M,
    children: L
  });
}
function iy({ art: m = "hinweis", titel: T, kennzeichen: M, children: H }) {
  return /* @__PURE__ */ (0, p.jsxs)("div", {
    className: "ara-meldung",
    "data-art": m,
    "data-testid": M,
    role: m === "fehler" ? "alert" : "status",
    children: [T && /* @__PURE__ */ (0, p.jsx)("p", {
      className: "ara-meldung__titel",
      children: T
    }), H]
  });
}
function a1(m) {
  return m ? [...m.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')] : [];
}
function cy({ offen: m, onSchliessen: T, titel: M = "Menü", kennzeichen: H, children: s }) {
  const G = (0, K.useRef)(null), L = (0, K.useRef)(null);
  return (0, K.useEffect)(() => {
    if (!m) return;
    L.current = document.activeElement;
    const C = (Y) => {
      if (Y.key === "Escape") {
        T();
        return;
      }
      if (Y.key !== "Tab") return;
      const N = a1(G.current);
      if (N.length === 0) return;
      const E = N[0], X = N[N.length - 1], R = document.activeElement;
      Y.shiftKey && (R === E || !G.current?.contains(R)) ? (Y.preventDefault(), X.focus()) : !Y.shiftKey && R === X && (Y.preventDefault(), E.focus());
    };
    return document.addEventListener("keydown", C), a1(G.current)[0]?.focus(), () => {
      document.removeEventListener("keydown", C), L.current?.focus?.();
    };
  }, [m, T]), m ? /* @__PURE__ */ (0, p.jsxs)(p.Fragment, { children: [/* @__PURE__ */ (0, p.jsx)("button", {
    type: "button",
    className: "ara-menue__schleier",
    "aria-label": `${M} schließen`,
    onClick: T
  }), /* @__PURE__ */ (0, p.jsxs)("div", {
    className: "ara-menue",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": M,
    "data-testid": H,
    ref: G,
    children: [/* @__PURE__ */ (0, p.jsxs)("div", {
      className: "ara-menue__kopf",
      children: [/* @__PURE__ */ (0, p.jsx)("span", { children: M }), /* @__PURE__ */ (0, p.jsx)("button", {
        type: "button",
        className: "ara-menue__zu",
        "aria-label": `${M} schließen`,
        onClick: T,
        children: "×"
      })]
    }), /* @__PURE__ */ (0, p.jsx)("div", {
      className: "ara-menue__inhalt",
      children: s
    })]
  })] }) : null;
}
var fy = 900;
function Ls(m = 900) {
  const [T, M] = (0, K.useState)(() => typeof window > "u" || typeof window.matchMedia != "function" ? !1 : window.matchMedia(`(max-width: ${m - 1}px)`).matches);
  return (0, K.useEffect)(() => {
    if (typeof window > "u" || typeof window.matchMedia != "function") return;
    const H = window.matchMedia(`(max-width: ${m - 1}px)`), s = () => M(H.matches);
    return s(), typeof H.addEventListener == "function" ? (H.addEventListener("change", s), () => H.removeEventListener("change", s)) : (H.addListener?.(s), () => H.removeListener?.(s));
  }, [m]), T;
}
var Vs = typeof window > "u" ? K.useEffect : K.useLayoutEffect;
function vy(m) {
  const T = Ls(m), [M, H] = (0, K.useState)(null), [s, G] = (0, K.useState)(null), L = (0, K.useCallback)((C) => H(C), []);
  return Vs(() => {
    if (!M) {
      G(null);
      return;
    }
    const C = () => {
      const N = M.getBoundingClientRect().width;
      G(N > 0 ? N : null);
    };
    if (C(), typeof ResizeObserver != "function") return;
    const Y = new ResizeObserver(C);
    return Y.observe(M), () => Y.disconnect();
  }, [M]), [
    L,
    s === null ? T : s < m,
    s
  ];
}
var dy = "5.9.3", xs = 0.25, Ks = 4, Js = 24;
function u1(m) {
  return Math.min(Ks, Math.max(xs, m));
}
var ws = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/;
function Ws(m, T) {
  if (T) return T;
  if (typeof m != "string")
    return m.type === "application/pdf" ? "pdf" : m.type.startsWith("image/") ? "bild" : null;
  if (m.startsWith("data:image/")) return "bild";
  if (m.startsWith("data:application/pdf")) return "pdf";
  const M = (m.split("?")[0] ?? "").toLowerCase();
  return M.endsWith(".pdf") ? "pdf" : ws.test(M) ? "bild" : null;
}
function be(m) {
  return new URL("pdf-dateien/" + m, import.meta.url).toString();
}
var e1 = null;
function $s() {
  return e1 ??= import("./marken-pdf.js").then((m) => (!m.GlobalWorkerOptions.workerSrc && !m.GlobalWorkerOptions.workerPort && (m.GlobalWorkerOptions.workerSrc = be("pdf.worker.min.js")), m)), e1;
}
var af = "Das Dokument ließ sich nicht öffnen.", ks = "Dieses Format kann hier nicht angezeigt werden.";
function Fs(m) {
  return m instanceof Error && m.name === "RenderingCancelledException";
}
function my({ quelle: m, art: T, name: M, leerHinweis: H = "Kein Dokument ausgewählt.", hoehe: s, kennzeichen: G, className: L }) {
  const [C, Y] = K.useState({ stufe: "leer" }), [N, E] = K.useState(1), [X, R] = K.useState(0), [ol, gl] = K.useState(null), [Dl, Rl] = K.useState(!1), [Tt, Ll] = K.useState(null), At = K.useRef(null), El = K.useRef(null), wl = K.useRef(null), Vl = K.useRef(null), Tl = M ?? (m instanceof File ? m.name : void 0);
  K.useEffect(() => {
    if (E(1), R(0), gl(null), Ll(null), m == null || m === "") {
      Y({ stufe: "leer" });
      return;
    }
    const k = Ws(m, T);
    if (!k) {
      Y({
        stufe: "fehler",
        meldung: ks
      });
      return;
    }
    if (k === "bild") {
      if (typeof m == "string") {
        Y({
          stufe: "bild",
          url: m
        });
        return;
      }
      const rl = URL.createObjectURL(m);
      return Y({
        stufe: "bild",
        url: rl
      }), () => URL.revokeObjectURL(rl);
    }
    let bl = !1, Bl;
    return Y({ stufe: "laden" }), (async () => {
      try {
        const rl = await $s(), O = typeof m == "string" ? { url: m } : { data: new Uint8Array(await m.arrayBuffer()) };
        if (bl) return;
        Bl = rl.getDocument({
          ...O,
          cMapUrl: be("cmaps/"),
          cMapPacked: !0,
          standardFontDataUrl: be("standard_fonts/"),
          wasmUrl: be("wasm/"),
          iccUrl: be("iccs/")
        });
        const A = await Bl.promise;
        if (bl) return;
        R(A.numPages), Y({
          stufe: "pdf",
          dokument: A
        });
      } catch {
        bl || Y({
          stufe: "fehler",
          meldung: af
        });
      }
    })(), () => {
      bl = !0, Bl?.destroy().catch(() => {
      });
    };
  }, [m, T]), K.useEffect(() => {
    if (C.stufe !== "pdf") return;
    let k = !1, bl;
    return (async () => {
      try {
        const Bl = await C.dokument.getPage(N);
        if (k) return;
        if (ol === null) {
          const D = El.current?.clientWidth ?? 640, tl = Bl.getViewport({ scale: 1 });
          gl(u1((D - Js) / tl.width));
          return;
        }
        const rl = wl.current;
        if (!rl) return;
        const O = Bl.getViewport({ scale: ol }), A = window.devicePixelRatio || 1;
        rl.width = Math.floor(O.width * A), rl.height = Math.floor(O.height * A), rl.style.width = `${Math.floor(O.width)}px`, rl.style.height = `${Math.floor(O.height)}px`, bl = Bl.render({
          canvas: rl,
          viewport: O,
          transform: A !== 1 ? [
            A,
            0,
            0,
            A,
            0,
            0
          ] : void 0
        }), await bl.promise;
      } catch (Bl) {
        !k && !Fs(Bl) && Y({
          stufe: "fehler",
          meldung: af
        });
      }
    })(), () => {
      k = !0, bl?.cancel();
    };
  }, [
    C,
    N,
    ol
  ]), K.useEffect(() => {
    if (!Dl) return;
    const k = (Bl) => {
      Bl.key === "Escape" && Rl(!1);
    }, bl = () => {
      document.fullscreenElement || Rl(!1);
    };
    return document.addEventListener("keydown", k), document.addEventListener("fullscreenchange", bl), () => {
      document.removeEventListener("keydown", k), document.removeEventListener("fullscreenchange", bl);
    };
  }, [Dl]);
  const ll = () => {
    if (Dl) {
      document.fullscreenElement && document.exitFullscreen().catch(() => {
      }), Rl(!1);
      return;
    }
    Rl(!0);
    try {
      At.current?.requestFullscreen?.().catch(() => {
      });
    } catch {
    }
  }, xl = () => {
    if (ol !== null) return ol;
    const k = Vl.current;
    return k && k.naturalWidth > 0 ? k.clientWidth / k.naturalWidth : 1;
  }, tt = (k) => {
    gl(u1(xl() * k));
  }, jt = C.stufe === "pdf" || C.stufe === "bild";
  return /* @__PURE__ */ (0, p.jsxs)("div", {
    ref: At,
    className: L ? `ara-dokumentanzeige ${L}` : "ara-dokumentanzeige",
    "data-vollbild": Dl || void 0,
    "data-testid": G,
    style: s ? { "--ara-dokument-hoehe": s } : void 0,
    role: "group",
    "aria-label": Tl ? `Dokument ${Tl}` : "Dokumentanzeige",
    children: [jt && /* @__PURE__ */ (0, p.jsxs)("div", {
      className: "ara-dokumentanzeige__leiste",
      children: [
        /* @__PURE__ */ (0, p.jsx)("span", {
          className: "ara-dokumentanzeige__name",
          title: Tl,
          children: Tl
        }),
        C.stufe === "pdf" && X > 1 && /* @__PURE__ */ (0, p.jsxs)("div", {
          className: "ara-dokumentanzeige__gruppe",
          children: [
            /* @__PURE__ */ (0, p.jsx)(re, {
              beschriftung: "Vorige Seite",
              gesperrt: N <= 1,
              onKlick: () => E((k) => Math.max(1, k - 1)),
              children: "‹"
            }),
            /* @__PURE__ */ (0, p.jsxs)("span", {
              className: "ara-dokumentanzeige__stand",
              "aria-live": "polite",
              children: [
                "Seite ",
                N,
                " von ",
                X
              ]
            }),
            /* @__PURE__ */ (0, p.jsx)(re, {
              beschriftung: "Nächste Seite",
              gesperrt: N >= X,
              onKlick: () => E((k) => Math.min(X, k + 1)),
              children: "›"
            })
          ]
        }),
        /* @__PURE__ */ (0, p.jsxs)("div", {
          className: "ara-dokumentanzeige__gruppe",
          children: [
            /* @__PURE__ */ (0, p.jsx)(re, {
              beschriftung: "Verkleinern",
              onKlick: () => tt(0.8),
              children: "−"
            }),
            /* @__PURE__ */ (0, p.jsx)("span", {
              className: "ara-dokumentanzeige__stand",
              children: ol === null ? "passend" : `${Math.round(ol * 100)} %`
            }),
            /* @__PURE__ */ (0, p.jsx)(re, {
              beschriftung: "Vergrößern",
              onKlick: () => tt(1.25),
              children: "+"
            }),
            /* @__PURE__ */ (0, p.jsx)(re, {
              beschriftung: Dl ? "Vollbild verlassen" : "Vollbild",
              onKlick: ll,
              children: /* @__PURE__ */ (0, p.jsx)("svg", {
                viewBox: "0 0 24 24",
                width: "14",
                height: "14",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                "aria-hidden": "true",
                children: /* @__PURE__ */ (0, p.jsx)("path", { d: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" })
              })
            })
          ]
        })
      ]
    }), /* @__PURE__ */ (0, p.jsxs)("div", {
      ref: El,
      className: "ara-dokumentanzeige__flaeche",
      children: [
        C.stufe === "leer" && /* @__PURE__ */ (0, p.jsx)("p", {
          className: "ara-dokumentanzeige__meldung",
          children: H
        }),
        C.stufe === "laden" && /* @__PURE__ */ (0, p.jsxs)("p", {
          className: "ara-dokumentanzeige__meldung",
          role: "status",
          "aria-live": "polite",
          children: [/* @__PURE__ */ (0, p.jsx)("span", {
            className: "ara-dokumentanzeige__kreisel",
            "aria-hidden": "true"
          }), "Wird geladen …"]
        }),
        C.stufe === "fehler" && /* @__PURE__ */ (0, p.jsx)("p", {
          className: "ara-dokumentanzeige__meldung",
          role: "alert",
          children: C.meldung
        }),
        C.stufe === "pdf" && /* @__PURE__ */ (0, p.jsx)("canvas", {
          ref: wl,
          className: "ara-dokumentanzeige__seite",
          role: "img",
          "aria-label": Tl ? `Seite ${N} von ${X} aus ${Tl}` : `Seite ${N} von ${X}`
        }),
        C.stufe === "bild" && /* @__PURE__ */ (0, p.jsx)("img", {
          ref: Vl,
          src: C.url,
          alt: Tl ?? "Bild",
          className: "ara-dokumentanzeige__bild",
          onLoad: (k) => Ll(k.currentTarget.naturalWidth),
          onError: () => Y({
            stufe: "fehler",
            meldung: af
          }),
          style: ol !== null && Tt ? {
            width: `${Math.round(Tt * ol)}px`,
            maxWidth: "none",
            maxHeight: "none"
          } : void 0
        })
      ]
    })]
  });
}
var sy = K.createElement;
function yy(m, T) {
  (0, Xs.createRoot)(T).render(m);
}
var hy = K.Fragment, oy = K.useEffect, gy = K.useMemo, Sy = K.useRef, ry = K.useState;
export {
  my as Dokumentanzeige,
  dy as FASSUNG,
  ny as Feld,
  ey as Formular,
  hy as Fragment,
  uy as Karte,
  re as Knopf,
  Ps as Kopf,
  Is as KopfVorne,
  ty as Liste,
  ay as ListenEintrag,
  iy as Meldung,
  cy as Menue,
  fy as SCHMAL_AB_PX,
  ly as Werkzeug,
  sy as h,
  yy as rendern,
  oy as useEffect,
  gy as useMemo,
  Sy as useRef,
  vy as useSchmalerBehaelter,
  Ls as useSchmalesFenster,
  ry as useState
};
