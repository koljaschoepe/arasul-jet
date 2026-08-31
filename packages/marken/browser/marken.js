var Ty = Object.create, ed = Object.defineProperty, Ay = Object.getOwnPropertyDescriptor, Oy = Object.getOwnPropertyNames, My = Object.getPrototypeOf, id = Object.prototype.hasOwnProperty, Ht = (y, A) => () => (A || (y((A = { exports: {} }).exports, A), y = null), A.exports), Dy = (y, A, U, C) => {
  if (A && typeof A == "object" || typeof A == "function")
    for (var h = Oy(A), V = 0, x = h.length, Q; V < x; V++)
      Q = h[V], !id.call(y, Q) && Q !== U && ed(y, Q, {
        get: ((X) => A[X]).bind(null, Q),
        enumerable: !(C = Ay(A, Q)) || C.enumerable
      });
  return y;
}, Uy = (y, A, U) => (U = y != null ? Ty(My(y)) : {}, Dy(A || !y || !y.__esModule || !id.call(y, "default") ? ed(U, "default", {
  value: y,
  enumerable: !0
}) : U, y)), Ny = /* @__PURE__ */ Ht(((y) => {
  var A = Symbol.for("react.transitional.element"), U = Symbol.for("react.portal"), C = Symbol.for("react.fragment"), h = Symbol.for("react.strict_mode"), V = Symbol.for("react.profiler"), x = Symbol.for("react.consumer"), Q = Symbol.for("react.context"), X = Symbol.for("react.forward_ref"), N = Symbol.for("react.suspense"), T = Symbol.for("react.memo"), q = Symbol.for("react.lazy"), R = Symbol.for("react.activity"), zl = Symbol.iterator;
  function Hl(d) {
    return d === null || typeof d != "object" ? null : (d = zl && d[zl] || d["@@iterator"], typeof d == "function" ? d : null);
  }
  var Ml = {
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
  function Ll(d, _, D) {
    this.props = d, this.context = _, this.refs = Tt, this.updater = D || Ml;
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
  function _l(d, _, D) {
    this.props = d, this.context = _, this.refs = Tt, this.updater = D || Ml;
  }
  var wl = _l.prototype = new At();
  wl.constructor = _l, Rl(wl, Ll.prototype), wl.isPureReactComponent = !0;
  var Vl = Array.isArray;
  function El() {
  }
  var P = {
    H: null,
    A: null,
    T: null,
    S: null
  }, xl = Object.prototype.hasOwnProperty;
  function tt(d, _, D) {
    var B = D.ref;
    return {
      $$typeof: A,
      type: d,
      key: _,
      ref: B !== void 0 ? B : null,
      props: D
    };
  }
  function jt(d, _) {
    return tt(d.type, _, d.props);
  }
  function $(d) {
    return typeof d == "object" && d !== null && d.$$typeof === A;
  }
  function Sl(d) {
    var _ = {
      "=": "=0",
      ":": "=2"
    };
    return "$" + d.replace(/[=:]/g, function(D) {
      return _[D];
    });
  }
  var Bl = /\/+/g;
  function gl(d, _) {
    return typeof d == "object" && d !== null && d.key != null ? Sl("" + d.key) : _.toString(36);
  }
  function O(d) {
    switch (d.status) {
      case "fulfilled":
        return d.value;
      case "rejected":
        throw d.reason;
      default:
        switch (typeof d.status == "string" ? d.then(El, El) : (d.status = "pending", d.then(function(_) {
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
  function E(d, _, D, B, K) {
    var J = typeof d;
    (J === "undefined" || J === "boolean") && (d = null);
    var nl = !1;
    if (d === null) nl = !0;
    else switch (J) {
      case "bigint":
      case "string":
      case "number":
        nl = !0;
        break;
      case "object":
        switch (d.$$typeof) {
          case A:
          case U:
            nl = !0;
            break;
          case q:
            return nl = d._init, E(nl(d._payload), _, D, B, K);
        }
    }
    if (nl) return K = K(d), nl = B === "" ? "." + gl(d, 0) : B, Vl(K) ? (D = "", nl != null && (D = nl.replace(Bl, "$&/") + "/"), E(K, _, D, "", function(Ou) {
      return Ou;
    })) : K != null && ($(K) && (K = jt(K, D + (K.key == null || d && d.key === K.key ? "" : ("" + K.key).replace(Bl, "$&/") + "/") + nl)), _.push(K)), 1;
    nl = 0;
    var Kl = B === "" ? "." : B + ":";
    if (Vl(d)) for (var Tl = 0; Tl < d.length; Tl++) B = d[Tl], J = Kl + gl(B, Tl), nl += E(B, _, D, J, K);
    else if (Tl = Hl(d), typeof Tl == "function") for (d = Tl.call(d), Tl = 0; !(B = d.next()).done; ) B = B.value, J = Kl + gl(B, Tl++), nl += E(B, _, D, J, K);
    else if (J === "object") {
      if (typeof d.then == "function") return E(O(d), _, D, B, K);
      throw _ = String(d), Error("Objects are not valid as a React child (found: " + (_ === "[object Object]" ? "object with keys {" + Object.keys(d).join(", ") + "}" : _) + "). If you meant to render a collection of children, use an array instead.");
    }
    return nl;
  }
  function M(d, _, D) {
    if (d == null) return d;
    var B = [], K = 0;
    return E(d, B, "", "", function(J) {
      return _.call(D, J, K++);
    }), B;
  }
  function ll(d) {
    if (d._status === -1) {
      var _ = d._result;
      _ = _(), _.then(function(D) {
        (d._status === 0 || d._status === -1) && (d._status = 1, d._result = D);
      }, function(D) {
        (d._status === 0 || d._status === -1) && (d._status = 2, d._result = D);
      }), d._status === -1 && (d._status = 0, d._result = _);
    }
    if (d._status === 1) return d._result.default;
    throw d._result;
  }
  var dl = typeof reportError == "function" ? reportError : function(d) {
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
    map: M,
    forEach: function(d, _, D) {
      M(d, function() {
        _.apply(this, arguments);
      }, D);
    },
    count: function(d) {
      var _ = 0;
      return M(d, function() {
        _++;
      }), _;
    },
    toArray: function(d) {
      return M(d, function(_) {
        return _;
      }) || [];
    },
    only: function(d) {
      if (!$(d)) throw Error("React.Children.only expected to receive a single React element child.");
      return d;
    }
  };
  y.Activity = R, y.Children = at, y.Component = Ll, y.Fragment = C, y.Profiler = V, y.PureComponent = _l, y.StrictMode = h, y.Suspense = N, y.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = P, y.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(d) {
      return P.H.useMemoCache(d);
    }
  }, y.cache = function(d) {
    return function() {
      return d.apply(null, arguments);
    };
  }, y.cacheSignal = function() {
    return null;
  }, y.cloneElement = function(d, _, D) {
    if (d == null) throw Error("The argument must be a React element, but you passed " + d + ".");
    var B = Rl({}, d.props), K = d.key;
    if (_ != null) for (J in _.key !== void 0 && (K = "" + _.key), _) !xl.call(_, J) || J === "key" || J === "__self" || J === "__source" || J === "ref" && _.ref === void 0 || (B[J] = _[J]);
    var J = arguments.length - 2;
    if (J === 1) B.children = D;
    else if (1 < J) {
      for (var nl = Array(J), Kl = 0; Kl < J; Kl++) nl[Kl] = arguments[Kl + 2];
      B.children = nl;
    }
    return tt(d.type, K, B);
  }, y.createContext = function(d) {
    return d = {
      $$typeof: Q,
      _currentValue: d,
      _currentValue2: d,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, d.Provider = d, d.Consumer = {
      $$typeof: x,
      _context: d
    }, d;
  }, y.createElement = function(d, _, D) {
    var B, K = {}, J = null;
    if (_ != null) for (B in _.key !== void 0 && (J = "" + _.key), _) xl.call(_, B) && B !== "key" && B !== "__self" && B !== "__source" && (K[B] = _[B]);
    var nl = arguments.length - 2;
    if (nl === 1) K.children = D;
    else if (1 < nl) {
      for (var Kl = Array(nl), Tl = 0; Tl < nl; Tl++) Kl[Tl] = arguments[Tl + 2];
      K.children = Kl;
    }
    if (d && d.defaultProps) for (B in nl = d.defaultProps, nl) K[B] === void 0 && (K[B] = nl[B]);
    return tt(d, J, K);
  }, y.createRef = function() {
    return { current: null };
  }, y.forwardRef = function(d) {
    return {
      $$typeof: X,
      render: d
    };
  }, y.isValidElement = $, y.lazy = function(d) {
    return {
      $$typeof: q,
      _payload: {
        _status: -1,
        _result: d
      },
      _init: ll
    };
  }, y.memo = function(d, _) {
    return {
      $$typeof: T,
      type: d,
      compare: _ === void 0 ? null : _
    };
  }, y.startTransition = function(d) {
    var _ = P.T, D = {};
    P.T = D;
    try {
      var B = d(), K = P.S;
      K !== null && K(D, B), typeof B == "object" && B !== null && typeof B.then == "function" && B.then(El, dl);
    } catch (J) {
      dl(J);
    } finally {
      _ !== null && D.types !== null && (_.types = D.types), P.T = _;
    }
  }, y.unstable_useCacheRefresh = function() {
    return P.H.useCacheRefresh();
  }, y.use = function(d) {
    return P.H.use(d);
  }, y.useActionState = function(d, _, D) {
    return P.H.useActionState(d, _, D);
  }, y.useCallback = function(d, _) {
    return P.H.useCallback(d, _);
  }, y.useContext = function(d) {
    return P.H.useContext(d);
  }, y.useDebugValue = function() {
  }, y.useDeferredValue = function(d, _) {
    return P.H.useDeferredValue(d, _);
  }, y.useEffect = function(d, _) {
    return P.H.useEffect(d, _);
  }, y.useEffectEvent = function(d) {
    return P.H.useEffectEvent(d);
  }, y.useId = function() {
    return P.H.useId();
  }, y.useImperativeHandle = function(d, _, D) {
    return P.H.useImperativeHandle(d, _, D);
  }, y.useInsertionEffect = function(d, _) {
    return P.H.useInsertionEffect(d, _);
  }, y.useLayoutEffect = function(d, _) {
    return P.H.useLayoutEffect(d, _);
  }, y.useMemo = function(d, _) {
    return P.H.useMemo(d, _);
  }, y.useOptimistic = function(d, _) {
    return P.H.useOptimistic(d, _);
  }, y.useReducer = function(d, _, D) {
    return P.H.useReducer(d, _, D);
  }, y.useRef = function(d) {
    return P.H.useRef(d);
  }, y.useState = function(d) {
    return P.H.useState(d);
  }, y.useSyncExternalStore = function(d, _, D) {
    return P.H.useSyncExternalStore(d, _, D);
  }, y.useTransition = function() {
    return P.H.useTransition();
  }, y.version = "19.2.8";
})), uf = /* @__PURE__ */ Ht(((y, A) => {
  A.exports = Ny();
})), py = /* @__PURE__ */ Ht(((y) => {
  function A(O, E) {
    var M = O.length;
    O.push(E);
    l: for (; 0 < M; ) {
      var ll = M - 1 >>> 1, dl = O[ll];
      if (0 < h(dl, E)) O[ll] = E, O[M] = dl, M = ll;
      else break l;
    }
  }
  function U(O) {
    return O.length === 0 ? null : O[0];
  }
  function C(O) {
    if (O.length === 0) return null;
    var E = O[0], M = O.pop();
    if (M !== E) {
      O[0] = M;
      l: for (var ll = 0, dl = O.length, at = dl >>> 1; ll < at; ) {
        var d = 2 * (ll + 1) - 1, _ = O[d], D = d + 1, B = O[D];
        if (0 > h(_, M)) D < dl && 0 > h(B, _) ? (O[ll] = B, O[D] = M, ll = D) : (O[ll] = _, O[d] = M, ll = d);
        else if (D < dl && 0 > h(B, M)) O[ll] = B, O[D] = M, ll = D;
        else break l;
      }
    }
    return E;
  }
  function h(O, E) {
    var M = O.sortIndex - E.sortIndex;
    return M !== 0 ? M : O.id - E.id;
  }
  if (y.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
    var V = performance;
    y.unstable_now = function() {
      return V.now();
    };
  } else {
    var x = Date, Q = x.now();
    y.unstable_now = function() {
      return x.now() - Q;
    };
  }
  var X = [], N = [], T = 1, q = null, R = 3, zl = !1, Hl = !1, Ml = !1, Rl = !1, Tt = typeof setTimeout == "function" ? setTimeout : null, Ll = typeof clearTimeout == "function" ? clearTimeout : null, At = typeof setImmediate < "u" ? setImmediate : null;
  function _l(O) {
    for (var E = U(N); E !== null; ) {
      if (E.callback === null) C(N);
      else if (E.startTime <= O) C(N), E.sortIndex = E.expirationTime, A(X, E);
      else break;
      E = U(N);
    }
  }
  function wl(O) {
    if (Ml = !1, _l(O), !Hl) if (U(X) !== null) Hl = !0, Vl || (Vl = !0, $());
    else {
      var E = U(N);
      E !== null && gl(wl, E.startTime - O);
    }
  }
  var Vl = !1, El = -1, P = 5, xl = -1;
  function tt() {
    return Rl ? !0 : !(y.unstable_now() - xl < P);
  }
  function jt() {
    if (Rl = !1, Vl) {
      var O = y.unstable_now();
      xl = O;
      var E = !0;
      try {
        l: {
          Hl = !1, Ml && (Ml = !1, Ll(El), El = -1), zl = !0;
          var M = R;
          try {
            t: {
              for (_l(O), q = U(X); q !== null && !(q.expirationTime > O && tt()); ) {
                var ll = q.callback;
                if (typeof ll == "function") {
                  q.callback = null, R = q.priorityLevel;
                  var dl = ll(q.expirationTime <= O);
                  if (O = y.unstable_now(), typeof dl == "function") {
                    q.callback = dl, _l(O), E = !0;
                    break t;
                  }
                  q === U(X) && C(X), _l(O);
                } else C(X);
                q = U(X);
              }
              if (q !== null) E = !0;
              else {
                var at = U(N);
                at !== null && gl(wl, at.startTime - O), E = !1;
              }
            }
            break l;
          } finally {
            q = null, R = M, zl = !1;
          }
          E = void 0;
        }
      } finally {
        E ? $() : Vl = !1;
      }
    }
  }
  var $;
  if (typeof At == "function") $ = function() {
    At(jt);
  };
  else if (typeof MessageChannel < "u") {
    var Sl = new MessageChannel(), Bl = Sl.port2;
    Sl.port1.onmessage = jt, $ = function() {
      Bl.postMessage(null);
    };
  } else $ = function() {
    Tt(jt, 0);
  };
  function gl(O, E) {
    El = Tt(function() {
      O(y.unstable_now());
    }, E);
  }
  y.unstable_IdlePriority = 5, y.unstable_ImmediatePriority = 1, y.unstable_LowPriority = 4, y.unstable_NormalPriority = 3, y.unstable_Profiling = null, y.unstable_UserBlockingPriority = 2, y.unstable_cancelCallback = function(O) {
    O.callback = null;
  }, y.unstable_forceFrameRate = function(O) {
    0 > O || 125 < O ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : P = 0 < O ? Math.floor(1e3 / O) : 5;
  }, y.unstable_getCurrentPriorityLevel = function() {
    return R;
  }, y.unstable_next = function(O) {
    switch (R) {
      case 1:
      case 2:
      case 3:
        var E = 3;
        break;
      default:
        E = R;
    }
    var M = R;
    R = E;
    try {
      return O();
    } finally {
      R = M;
    }
  }, y.unstable_requestPaint = function() {
    Rl = !0;
  }, y.unstable_runWithPriority = function(O, E) {
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
    var M = R;
    R = O;
    try {
      return E();
    } finally {
      R = M;
    }
  }, y.unstable_scheduleCallback = function(O, E, M) {
    var ll = y.unstable_now();
    switch (typeof M == "object" && M !== null ? (M = M.delay, M = typeof M == "number" && 0 < M ? ll + M : ll) : M = ll, O) {
      case 1:
        var dl = -1;
        break;
      case 2:
        dl = 250;
        break;
      case 5:
        dl = 1073741823;
        break;
      case 4:
        dl = 1e4;
        break;
      default:
        dl = 5e3;
    }
    return dl = M + dl, O = {
      id: T++,
      callback: E,
      priorityLevel: O,
      startTime: M,
      expirationTime: dl,
      sortIndex: -1
    }, M > ll ? (O.sortIndex = M, A(N, O), U(X) === null && O === U(N) && (Ml ? (Ll(El), El = -1) : Ml = !0, gl(wl, M - ll))) : (O.sortIndex = dl, A(X, O), Hl || zl || (Hl = !0, Vl || (Vl = !0, $()))), O;
  }, y.unstable_shouldYield = tt, y.unstable_wrapCallback = function(O) {
    var E = R;
    return function() {
      var M = R;
      R = E;
      try {
        return O.apply(this, arguments);
      } finally {
        R = M;
      }
    };
  };
})), Hy = /* @__PURE__ */ Ht(((y, A) => {
  A.exports = py();
})), jy = /* @__PURE__ */ Ht(((y) => {
  var A = uf();
  function U(N) {
    var T = "https://react.dev/errors/" + N;
    if (1 < arguments.length) {
      T += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var q = 2; q < arguments.length; q++) T += "&args[]=" + encodeURIComponent(arguments[q]);
    }
    return "Minified React error #" + N + "; visit " + T + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function C() {
  }
  var h = {
    d: {
      f: C,
      r: function() {
        throw Error(U(522));
      },
      D: C,
      C,
      L: C,
      m: C,
      X: C,
      S: C,
      M: C
    },
    p: 0,
    findDOMNode: null
  }, V = Symbol.for("react.portal");
  function x(N, T, q) {
    var R = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: V,
      key: R == null ? null : "" + R,
      children: N,
      containerInfo: T,
      implementation: q
    };
  }
  var Q = A.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function X(N, T) {
    if (N === "font") return "";
    if (typeof T == "string") return T === "use-credentials" ? T : "";
  }
  y.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = h, y.createPortal = function(N, T) {
    var q = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!T || T.nodeType !== 1 && T.nodeType !== 9 && T.nodeType !== 11) throw Error(U(299));
    return x(N, T, null, q);
  }, y.flushSync = function(N) {
    var T = Q.T, q = h.p;
    try {
      if (Q.T = null, h.p = 2, N) return N();
    } finally {
      Q.T = T, h.p = q, h.d.f();
    }
  }, y.preconnect = function(N, T) {
    typeof N == "string" && (T ? (T = T.crossOrigin, T = typeof T == "string" ? T === "use-credentials" ? T : "" : void 0) : T = null, h.d.C(N, T));
  }, y.prefetchDNS = function(N) {
    typeof N == "string" && h.d.D(N);
  }, y.preinit = function(N, T) {
    if (typeof N == "string" && T && typeof T.as == "string") {
      var q = T.as, R = X(q, T.crossOrigin), zl = typeof T.integrity == "string" ? T.integrity : void 0, Hl = typeof T.fetchPriority == "string" ? T.fetchPriority : void 0;
      q === "style" ? h.d.S(N, typeof T.precedence == "string" ? T.precedence : void 0, {
        crossOrigin: R,
        integrity: zl,
        fetchPriority: Hl
      }) : q === "script" && h.d.X(N, {
        crossOrigin: R,
        integrity: zl,
        fetchPriority: Hl,
        nonce: typeof T.nonce == "string" ? T.nonce : void 0
      });
    }
  }, y.preinitModule = function(N, T) {
    if (typeof N == "string") if (typeof T == "object" && T !== null) {
      if (T.as == null || T.as === "script") {
        var q = X(T.as, T.crossOrigin);
        h.d.M(N, {
          crossOrigin: q,
          integrity: typeof T.integrity == "string" ? T.integrity : void 0,
          nonce: typeof T.nonce == "string" ? T.nonce : void 0
        });
      }
    } else T ?? h.d.M(N);
  }, y.preload = function(N, T) {
    if (typeof N == "string" && typeof T == "object" && T !== null && typeof T.as == "string") {
      var q = T.as, R = X(q, T.crossOrigin);
      h.d.L(N, q, {
        crossOrigin: R,
        integrity: typeof T.integrity == "string" ? T.integrity : void 0,
        nonce: typeof T.nonce == "string" ? T.nonce : void 0,
        type: typeof T.type == "string" ? T.type : void 0,
        fetchPriority: typeof T.fetchPriority == "string" ? T.fetchPriority : void 0,
        referrerPolicy: typeof T.referrerPolicy == "string" ? T.referrerPolicy : void 0,
        imageSrcSet: typeof T.imageSrcSet == "string" ? T.imageSrcSet : void 0,
        imageSizes: typeof T.imageSizes == "string" ? T.imageSizes : void 0,
        media: typeof T.media == "string" ? T.media : void 0
      });
    }
  }, y.preloadModule = function(N, T) {
    if (typeof N == "string") if (T) {
      var q = X(T.as, T.crossOrigin);
      h.d.m(N, {
        as: typeof T.as == "string" && T.as !== "script" ? T.as : void 0,
        crossOrigin: q,
        integrity: typeof T.integrity == "string" ? T.integrity : void 0
      });
    } else h.d.m(N);
  }, y.requestFormReset = function(N) {
    h.d.r(N);
  }, y.unstable_batchedUpdates = function(N, T) {
    return N(T);
  }, y.useFormState = function(N, T, q) {
    return Q.H.useFormState(N, T, q);
  }, y.useFormStatus = function() {
    return Q.H.useHostTransitionStatus();
  }, y.version = "19.2.8";
})), Ry = /* @__PURE__ */ Ht(((y, A) => {
  function U() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(U);
      } catch (C) {
        console.error(C);
      }
  }
  U(), A.exports = jy();
})), By = /* @__PURE__ */ Ht(((y) => {
  var A = Hy(), U = uf(), C = Ry();
  function h(l) {
    var t = "https://react.dev/errors/" + l;
    if (1 < arguments.length) {
      t += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var a = 2; a < arguments.length; a++) t += "&args[]=" + encodeURIComponent(arguments[a]);
    }
    return "Minified React error #" + l + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function V(l) {
    return !(!l || l.nodeType !== 1 && l.nodeType !== 9 && l.nodeType !== 11);
  }
  function x(l) {
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
  function Q(l) {
    if (l.tag === 13) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function X(l) {
    if (l.tag === 31) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function N(l) {
    if (x(l) !== l) throw Error(h(188));
  }
  function T(l) {
    var t = l.alternate;
    if (!t) {
      if (t = x(l), t === null) throw Error(h(188));
      return t !== l ? null : l;
    }
    for (var a = l, u = t; ; ) {
      var n = a.return;
      if (n === null) break;
      var e = n.alternate;
      if (e === null) {
        if (u = n.return, u !== null) {
          a = u;
          continue;
        }
        break;
      }
      if (n.child === e.child) {
        for (e = n.child; e; ) {
          if (e === a) return N(n), l;
          if (e === u) return N(n), t;
          e = e.sibling;
        }
        throw Error(h(188));
      }
      if (a.return !== u.return) a = n, u = e;
      else {
        for (var i = !1, c = n.child; c; ) {
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
        if (!i) {
          for (c = e.child; c; ) {
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
          if (!i) throw Error(h(189));
        }
      }
      if (a.alternate !== u) throw Error(h(190));
    }
    if (a.tag !== 3) throw Error(h(188));
    return a.stateNode.current === a ? l : t;
  }
  function q(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l;
    for (l = l.child; l !== null; ) {
      if (t = q(l), t !== null) return t;
      l = l.sibling;
    }
    return null;
  }
  var R = Object.assign, zl = Symbol.for("react.element"), Hl = Symbol.for("react.transitional.element"), Ml = Symbol.for("react.portal"), Rl = Symbol.for("react.fragment"), Tt = Symbol.for("react.strict_mode"), Ll = Symbol.for("react.profiler"), At = Symbol.for("react.consumer"), _l = Symbol.for("react.context"), wl = Symbol.for("react.forward_ref"), Vl = Symbol.for("react.suspense"), El = Symbol.for("react.suspense_list"), P = Symbol.for("react.memo"), xl = Symbol.for("react.lazy"), tt = Symbol.for("react.activity"), jt = Symbol.for("react.memo_cache_sentinel"), $ = Symbol.iterator;
  function Sl(l) {
    return l === null || typeof l != "object" ? null : (l = $ && l[$] || l["@@iterator"], typeof l == "function" ? l : null);
  }
  var Bl = Symbol.for("react.client.reference");
  function gl(l) {
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
      case El:
        return "SuspenseList";
      case tt:
        return "Activity";
    }
    if (typeof l == "object") switch (l.$$typeof) {
      case Ml:
        return "Portal";
      case _l:
        return l.displayName || "Context";
      case At:
        return (l._context.displayName || "Context") + ".Consumer";
      case wl:
        var t = l.render;
        return l = l.displayName, l || (l = t.displayName || t.name || "", l = l !== "" ? "ForwardRef(" + l + ")" : "ForwardRef"), l;
      case P:
        return t = l.displayName || null, t !== null ? t : gl(l.type) || "Memo";
      case xl:
        t = l._payload, l = l._init;
        try {
          return gl(l(t));
        } catch {
        }
    }
    return null;
  }
  var O = Array.isArray, E = U.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, M = C.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, ll = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, dl = [], at = -1;
  function d(l) {
    return { current: l };
  }
  function _(l) {
    0 > at || (l.current = dl[at], dl[at] = null, at--);
  }
  function D(l, t) {
    at++, dl[at] = l.current, l.current = t;
  }
  var B = d(null), K = d(null), J = d(null), nl = d(null);
  function Kl(l, t) {
    switch (D(J, t), D(K, l), D(B, null), t.nodeType) {
      case 9:
      case 11:
        l = (l = t.documentElement) && (l = l.namespaceURI) ? U1(l) : 0;
        break;
      default:
        if (l = t.tagName, t = t.namespaceURI) t = U1(t), l = N1(t, l);
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
    _(B), D(B, l);
  }
  function Tl() {
    _(B), _(K), _(J);
  }
  function Ou(l) {
    l.memoizedState !== null && D(nl, l);
    var t = B.current, a = N1(t, l.type);
    t !== a && (D(K, l), D(B, a));
  }
  function _n(l) {
    K.current === l && (_(B), _(K)), nl.current === l && (_(nl), on._currentValue = ll);
  }
  var Xe, nf;
  function _a(l) {
    if (Xe === void 0) try {
      throw Error();
    } catch (a) {
      var t = a.stack.trim().match(/\n( *(at )?)/);
      Xe = t && t[1] || "", nf = -1 < a.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < a.stack.indexOf("@") ? "@unknown:0:0" : "";
    }
    return `
` + Xe + l + nf;
  }
  var Qe = !1;
  function Ze(l, t) {
    if (!l || Qe) return "";
    Qe = !0;
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
      var n = Object.getOwnPropertyDescriptor(u.DetermineComponentFrameRoot, "name");
      n && n.configurable && Object.defineProperty(u.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
      var e = u.DetermineComponentFrameRoot(), i = e[0], c = e[1];
      if (i && c) {
        var f = i.split(`
`), o = c.split(`
`);
        for (n = u = 0; u < f.length && !f[u].includes("DetermineComponentFrameRoot"); ) u++;
        for (; n < o.length && !o[n].includes("DetermineComponentFrameRoot"); ) n++;
        if (u === f.length || n === o.length) for (u = f.length - 1, n = o.length - 1; 1 <= u && 0 <= n && f[u] !== o[n]; ) n--;
        for (; 1 <= u && 0 <= n; u--, n--) if (f[u] !== o[n]) {
          if (u !== 1 || n !== 1) do
            if (u--, n--, 0 > n || f[u] !== o[n]) {
              var b = `
` + f[u].replace(" at new ", " at ");
              return l.displayName && b.includes("<anonymous>") && (b = b.replace("<anonymous>", l.displayName)), b;
            }
          while (1 <= u && 0 <= n);
          break;
        }
      }
    } finally {
      Qe = !1, Error.prepareStackTrace = a;
    }
    return (a = l ? l.displayName || l.name : "") ? _a(a) : "";
  }
  function cd(l, t) {
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
        return Ze(l.type, !1);
      case 11:
        return Ze(l.type.render, !1);
      case 1:
        return Ze(l.type, !0);
      case 31:
        return _a("Activity");
      default:
        return "";
    }
  }
  function ef(l) {
    try {
      var t = "", a = null;
      do
        t += cd(l, a), a = l, l = l.return;
      while (l);
      return t;
    } catch (u) {
      return `
Error generating stack: ` + u.message + `
` + u.stack;
    }
  }
  var Le = Object.prototype.hasOwnProperty, Ve = A.unstable_scheduleCallback, xe = A.unstable_cancelCallback, fd = A.unstable_shouldYield, vd = A.unstable_requestPaint, ut = A.unstable_now, dd = A.unstable_getCurrentPriorityLevel, cf = A.unstable_ImmediatePriority, ff = A.unstable_UserBlockingPriority, En = A.unstable_NormalPriority, md = A.unstable_LowPriority, vf = A.unstable_IdlePriority, yd = A.log, hd = A.unstable_setDisableYieldValue, Mu = null, nt = null;
  function It(l) {
    if (typeof yd == "function" && hd(l), nt && typeof nt.setStrictMode == "function") try {
      nt.setStrictMode(Mu, l);
    } catch {
    }
  }
  var et = Math.clz32 ? Math.clz32 : gd, sd = Math.log, od = Math.LN2;
  function gd(l) {
    return l >>>= 0, l === 0 ? 32 : 31 - (sd(l) / od | 0) | 0;
  }
  var Tn = 256, An = 262144, On = 4194304;
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
  function Mn(l, t, a) {
    var u = l.pendingLanes;
    if (u === 0) return 0;
    var n = 0, e = l.suspendedLanes, i = l.pingedLanes;
    l = l.warmLanes;
    var c = u & 134217727;
    return c !== 0 ? (u = c & ~e, u !== 0 ? n = Ea(u) : (i &= c, i !== 0 ? n = Ea(i) : a || (a = c & ~l, a !== 0 && (n = Ea(a))))) : (c = u & ~e, c !== 0 ? n = Ea(c) : i !== 0 ? n = Ea(i) : a || (a = u & ~l, a !== 0 && (n = Ea(a)))), n === 0 ? 0 : t !== 0 && t !== n && (t & e) === 0 && (e = n & -n, a = t & -t, e >= a || e === 32 && (a & 4194048) !== 0) ? t : n;
  }
  function Du(l, t) {
    return (l.pendingLanes & ~(l.suspendedLanes & ~l.pingedLanes) & t) === 0;
  }
  function Sd(l, t) {
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
    var l = On;
    return On <<= 1, (On & 62914560) === 0 && (On = 4194304), l;
  }
  function Ke(l) {
    for (var t = [], a = 0; 31 > a; a++) t.push(l);
    return t;
  }
  function Dn(l, t) {
    l.pendingLanes |= t, t !== 268435456 && (l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0);
  }
  function bd(l, t, a, u, n, e) {
    var i = l.pendingLanes;
    l.pendingLanes = a, l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0, l.expiredLanes &= a, l.entangledLanes &= a, l.errorRecoveryDisabledLanes &= a, l.shellSuspendCounter = 0;
    var c = l.entanglements, f = l.expirationTimes, o = l.hiddenUpdates;
    for (a = i & ~a; 0 < a; ) {
      var b = 31 - et(a), z = 1 << b;
      c[b] = 0, f[b] = -1;
      var g = o[b];
      if (g !== null) for (o[b] = null, b = 0; b < g.length; b++) {
        var S = g[b];
        S !== null && (S.lane &= -536870913);
      }
      a &= ~z;
    }
    u !== 0 && mf(l, u, 0), e !== 0 && n === 0 && l.tag !== 0 && (l.suspendedLanes |= e & ~(i & ~t));
  }
  function mf(l, t, a) {
    l.pendingLanes |= t, l.suspendedLanes &= ~t;
    var u = 31 - et(t);
    l.entangledLanes |= t, l.entanglements[u] = l.entanglements[u] | 1073741824 | a & 261930;
  }
  function yf(l, t) {
    var a = l.entangledLanes |= t;
    for (l = l.entanglements; a; ) {
      var u = 31 - et(a), n = 1 << u;
      n & t | l[u] & t && (l[u] |= t), a &= ~n;
    }
  }
  function hf(l, t) {
    var a = t & -t;
    return a = (a & 42) !== 0 ? 1 : sf(a), (a & (l.suspendedLanes | t)) !== 0 ? 0 : a;
  }
  function sf(l) {
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
  function Je(l) {
    return l &= -l, 2 < l ? 8 < l ? (l & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function of() {
    var l = M.p;
    return l !== 0 ? l : (l = window.event, l === void 0 ? 32 : k1(l.type));
  }
  function gf(l, t) {
    var a = M.p;
    try {
      return M.p = l, t();
    } finally {
      M.p = a;
    }
  }
  var Pt = Math.random().toString(36).slice(2), ql = "__reactFiber$" + Pt, Wl = "__reactProps$" + Pt, Uu = "__reactContainer$" + Pt, we = "__reactEvents$" + Pt, rd = "__reactListeners$" + Pt, zd = "__reactHandles$" + Pt, Sf = "__reactResources$" + Pt, Nu = "__reactMarker$" + Pt;
  function We(l) {
    delete l[ql], delete l[Wl], delete l[we], delete l[rd], delete l[zd];
  }
  function La(l) {
    var t = l[ql];
    if (t) return t;
    for (var a = l.parentNode; a; ) {
      if (t = a[Uu] || a[ql]) {
        if (a = t.alternate, t.child !== null || a !== null && a.child !== null) for (l = Y1(l); l !== null; ) {
          if (a = l[ql]) return a;
          l = Y1(l);
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
  function pu(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l.stateNode;
    throw Error(h(33));
  }
  function xa(l) {
    var t = l[Sf];
    return t || (t = l[Sf] = {
      hoistableStyles: /* @__PURE__ */ new Map(),
      hoistableScripts: /* @__PURE__ */ new Map()
    }), t;
  }
  function Cl(l) {
    l[Nu] = !0;
  }
  var bf = /* @__PURE__ */ new Set(), rf = {};
  function Ta(l, t) {
    Ka(l, t), Ka(l + "Capture", t);
  }
  function Ka(l, t) {
    for (rf[l] = t, l = 0; l < t.length; l++) bf.add(t[l]);
  }
  var _d = RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), zf = {}, _f = {};
  function Ed(l) {
    return Le.call(_f, l) ? !0 : Le.call(zf, l) ? !1 : _d.test(l) ? _f[l] = !0 : (zf[l] = !0, !1);
  }
  function Un(l, t, a) {
    if (Ed(t)) if (a === null) l.removeAttribute(t);
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
  function Nn(l, t, a) {
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
  function yt(l) {
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
  function Td(l, t, a) {
    var u = Object.getOwnPropertyDescriptor(l.constructor.prototype, t);
    if (!l.hasOwnProperty(t) && typeof u < "u" && typeof u.get == "function" && typeof u.set == "function") {
      var n = u.get, e = u.set;
      return Object.defineProperty(l, t, {
        configurable: !0,
        get: function() {
          return n.call(this);
        },
        set: function(i) {
          a = "" + i, e.call(this, i);
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
  function $e(l) {
    if (!l._valueTracker) {
      var t = Ef(l) ? "checked" : "value";
      l._valueTracker = Td(l, t, "" + l[t]);
    }
  }
  function Tf(l) {
    if (!l) return !1;
    var t = l._valueTracker;
    if (!t) return !0;
    var a = t.getValue(), u = "";
    return l && (u = Ef(l) ? l.checked ? "true" : "false" : l.value), l = u, l !== a ? (t.setValue(l), !0) : !1;
  }
  function pn(l) {
    if (l = l || (typeof document < "u" ? document : void 0), typeof l > "u") return null;
    try {
      return l.activeElement || l.body;
    } catch {
      return l.body;
    }
  }
  var Ad = /[\n"\\]/g;
  function ht(l) {
    return l.replace(Ad, function(t) {
      return "\\" + t.charCodeAt(0).toString(16) + " ";
    });
  }
  function ke(l, t, a, u, n, e, i, c) {
    l.name = "", i != null && typeof i != "function" && typeof i != "symbol" && typeof i != "boolean" ? l.type = i : l.removeAttribute("type"), t != null ? i === "number" ? (t === 0 && l.value === "" || l.value != t) && (l.value = "" + yt(t)) : l.value !== "" + yt(t) && (l.value = "" + yt(t)) : i !== "submit" && i !== "reset" || l.removeAttribute("value"), t != null ? Fe(l, i, yt(t)) : a != null ? Fe(l, i, yt(a)) : u != null && l.removeAttribute("value"), n == null && e != null && (l.defaultChecked = !!e), n != null && (l.checked = n && typeof n != "function" && typeof n != "symbol"), c != null && typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" ? l.name = "" + yt(c) : l.removeAttribute("name");
  }
  function Af(l, t, a, u, n, e, i, c) {
    if (e != null && typeof e != "function" && typeof e != "symbol" && typeof e != "boolean" && (l.type = e), t != null || a != null) {
      if (!(e !== "submit" && e !== "reset" || t != null)) {
        $e(l);
        return;
      }
      a = a != null ? "" + yt(a) : "", t = t != null ? "" + yt(t) : a, c || t === l.value || (l.value = t), l.defaultValue = t;
    }
    u = u ?? n, u = typeof u != "function" && typeof u != "symbol" && !!u, l.checked = c ? l.checked : !!u, l.defaultChecked = !!u, i != null && typeof i != "function" && typeof i != "symbol" && typeof i != "boolean" && (l.name = i), $e(l);
  }
  function Fe(l, t, a) {
    t === "number" && pn(l.ownerDocument) === l || l.defaultValue === "" + a || (l.defaultValue = "" + a);
  }
  function Ja(l, t, a, u) {
    if (l = l.options, t) {
      t = {};
      for (var n = 0; n < a.length; n++) t["$" + a[n]] = !0;
      for (a = 0; a < l.length; a++) n = t.hasOwnProperty("$" + l[a].value), l[a].selected !== n && (l[a].selected = n), n && u && (l[a].defaultSelected = !0);
    } else {
      for (a = "" + yt(a), t = null, n = 0; n < l.length; n++) {
        if (l[n].value === a) {
          l[n].selected = !0, u && (l[n].defaultSelected = !0);
          return;
        }
        t !== null || l[n].disabled || (t = l[n]);
      }
      t !== null && (t.selected = !0);
    }
  }
  function Of(l, t, a) {
    if (t != null && (t = "" + yt(t), t !== l.value && (l.value = t), a == null)) {
      l.defaultValue !== t && (l.defaultValue = t);
      return;
    }
    l.defaultValue = a != null ? "" + yt(a) : "";
  }
  function Mf(l, t, a, u) {
    if (t == null) {
      if (u != null) {
        if (a != null) throw Error(h(92));
        if (O(u)) {
          if (1 < u.length) throw Error(h(93));
          u = u[0];
        }
        a = u;
      }
      a ??= "", t = a;
    }
    a = yt(t), l.defaultValue = a, u = l.textContent, u === a && u !== "" && u !== null && (l.value = u), $e(l);
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
  var Od = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));
  function Df(l, t, a) {
    var u = t.indexOf("--") === 0;
    a == null || typeof a == "boolean" || a === "" ? u ? l.setProperty(t, "") : t === "float" ? l.cssFloat = "" : l[t] = "" : u ? l.setProperty(t, a) : typeof a != "number" || a === 0 || Od.has(t) ? t === "float" ? l.cssFloat = a : l[t] = ("" + a).trim() : l[t] = a + "px";
  }
  function Uf(l, t, a) {
    if (t != null && typeof t != "object") throw Error(h(62));
    if (l = l.style, a != null) {
      for (var u in a) !a.hasOwnProperty(u) || t != null && t.hasOwnProperty(u) || (u.indexOf("--") === 0 ? l.setProperty(u, "") : u === "float" ? l.cssFloat = "" : l[u] = "");
      for (var n in t) u = t[n], t.hasOwnProperty(n) && a[n] !== u && Df(l, n, u);
    } else for (var e in t) t.hasOwnProperty(e) && Df(l, e, t[e]);
  }
  function Ie(l) {
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
  var Md = /* @__PURE__ */ new Map([
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
  ]), Dd = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Hn(l) {
    return Dd.test("" + l) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : l;
  }
  function Bt() {
  }
  var Pe = null;
  function li(l) {
    return l = l.target || l.srcElement || window, l.correspondingUseElement && (l = l.correspondingUseElement), l.nodeType === 3 ? l.parentNode : l;
  }
  var Wa = null, $a = null;
  function Nf(l) {
    var t = Va(l);
    if (t && (l = t.stateNode)) {
      var a = l[Wl] || null;
      l: switch (l = t.stateNode, t.type) {
        case "input":
          if (ke(l, a.value, a.defaultValue, a.defaultValue, a.checked, a.defaultChecked, a.type, a.name), t = a.name, a.type === "radio" && t != null) {
            for (a = l; a.parentNode; ) a = a.parentNode;
            for (a = a.querySelectorAll('input[name="' + ht("" + t) + '"][type="radio"]'), t = 0; t < a.length; t++) {
              var u = a[t];
              if (u !== l && u.form === l.form) {
                var n = u[Wl] || null;
                if (!n) throw Error(h(90));
                ke(u, n.value, n.defaultValue, n.defaultValue, n.checked, n.defaultChecked, n.type, n.name);
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
  function pf(l, t, a) {
    if (ti) return l(t, a);
    ti = !0;
    try {
      return l(t);
    } finally {
      if (ti = !1, (Wa !== null || $a !== null) && (be(), Wa && (t = Wa, l = $a, $a = Wa = null, Nf(t), l)))
        for (t = 0; t < l.length; t++) Nf(l[t]);
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
    if (a && typeof a != "function") throw Error(h(231, t, typeof a));
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
  var la = null, ui = null, jn = null;
  function Hf() {
    if (jn) return jn;
    var l, t = ui, a = t.length, u, n = "value" in la ? la.value : la.textContent, e = n.length;
    for (l = 0; l < a && t[l] === n[l]; l++) ;
    var i = a - l;
    for (u = 1; u <= i && t[a - u] === n[e - u]; u++) ;
    return jn = n.slice(l, 1 < u ? 1 - u : void 0);
  }
  function Rn(l) {
    var t = l.keyCode;
    return "charCode" in l ? (l = l.charCode, l === 0 && t === 13 && (l = 13)) : l = t, l === 10 && (l = 13), 32 <= l || l === 13 ? l : 0;
  }
  function Bn() {
    return !0;
  }
  function jf() {
    return !1;
  }
  function $l(l) {
    function t(a, u, n, e, i) {
      this._reactName = a, this._targetInst = n, this.type = u, this.nativeEvent = e, this.target = i, this.currentTarget = null;
      for (var c in l) l.hasOwnProperty(c) && (a = l[c], this[c] = a ? a(e) : e[c]);
      return this.isDefaultPrevented = (e.defaultPrevented != null ? e.defaultPrevented : e.returnValue === !1) ? Bn : jf, this.isPropagationStopped = jf, this;
    }
    return R(t.prototype, {
      preventDefault: function() {
        this.defaultPrevented = !0;
        var a = this.nativeEvent;
        a && (a.preventDefault ? a.preventDefault() : typeof a.returnValue != "unknown" && (a.returnValue = !1), this.isDefaultPrevented = Bn);
      },
      stopPropagation: function() {
        var a = this.nativeEvent;
        a && (a.stopPropagation ? a.stopPropagation() : typeof a.cancelBubble != "unknown" && (a.cancelBubble = !0), this.isPropagationStopped = Bn);
      },
      persist: function() {
      },
      isPersistent: Bn
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
  }, Cn = $l(Aa), Ru = R({}, Aa, {
    view: 0,
    detail: 0
  }), Ud = $l(Ru), ni, ei, Bu, Yn = R({}, Ru, {
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
      return "movementX" in l ? l.movementX : (l !== Bu && (Bu && l.type === "mousemove" ? (ni = l.screenX - Bu.screenX, ei = l.screenY - Bu.screenY) : ei = ni = 0, Bu = l), ni);
    },
    movementY: function(l) {
      return "movementY" in l ? l.movementY : ei;
    }
  }), Rf = $l(Yn), Nd = $l(R({}, Yn, { dataTransfer: 0 })), ii = $l(R({}, Ru, { relatedTarget: 0 })), pd = $l(R({}, Aa, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  })), Hd = $l(R({}, Aa, { clipboardData: function(l) {
    return "clipboardData" in l ? l.clipboardData : window.clipboardData;
  } })), Bf = $l(R({}, Aa, { data: 0 })), jd = {
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
  }, Rd = {
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
  }, Bd = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function Cd(l) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(l) : (l = Bd[l]) ? !!t[l] : !1;
  }
  function ci() {
    return Cd;
  }
  var Yd = $l(R({}, Ru, {
    key: function(l) {
      if (l.key) {
        var t = jd[l.key] || l.key;
        if (t !== "Unidentified") return t;
      }
      return l.type === "keypress" ? (l = Rn(l), l === 13 ? "Enter" : String.fromCharCode(l)) : l.type === "keydown" || l.type === "keyup" ? Rd[l.keyCode] || "Unidentified" : "";
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
      return l.type === "keypress" ? Rn(l) : 0;
    },
    keyCode: function(l) {
      return l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    },
    which: function(l) {
      return l.type === "keypress" ? Rn(l) : l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    }
  })), Cf = $l(R({}, Yn, {
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
  })), qd = $l(R({}, Ru, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: ci
  })), Gd = $l(R({}, Aa, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  })), Xd = $l(R({}, Yn, {
    deltaX: function(l) {
      return "deltaX" in l ? l.deltaX : "wheelDeltaX" in l ? -l.wheelDeltaX : 0;
    },
    deltaY: function(l) {
      return "deltaY" in l ? l.deltaY : "wheelDeltaY" in l ? -l.wheelDeltaY : "wheelDelta" in l ? -l.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  })), Qd = $l(R({}, Aa, {
    newState: 0,
    oldState: 0
  })), Zd = [
    9,
    13,
    27,
    32
  ], fi = Ct && "CompositionEvent" in window, Cu = null;
  Ct && "documentMode" in document && (Cu = document.documentMode);
  var Ld = Ct && "TextEvent" in window && !Cu, Yf = Ct && (!fi || Cu && 8 < Cu && 11 >= Cu), qf = " ", Gf = !1;
  function Xf(l, t) {
    switch (l) {
      case "keyup":
        return Zd.indexOf(t.keyCode) !== -1;
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
  function Vd(l, t) {
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
  function xd(l, t) {
    if (ka) return l === "compositionend" || !fi && Xf(l, t) ? (l = Hf(), jn = ui = la = null, ka = !1, l) : null;
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
  var Kd = {
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
    return t === "input" ? !!Kd[l.type] : t === "textarea";
  }
  function Lf(l, t, a, u) {
    Wa ? $a ? $a.push(u) : $a = [u] : Wa = u, t = Oe(t, "onChange"), 0 < t.length && (a = new Cn("onChange", "change", null, a, u), l.push({
      event: a,
      listeners: t
    }));
  }
  var Yu = null, qu = null;
  function Jd(l) {
    _1(l, 0);
  }
  function qn(l) {
    if (Tf(pu(l))) return l;
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
    if (l.propertyName === "value" && qn(qu)) {
      var t = [];
      Lf(t, qu, l, li(l)), pf(Jd, t);
    }
  }
  function wd(l, t, a) {
    l === "focusin" ? (Jf(), Yu = t, qu = a, Yu.attachEvent("onpropertychange", wf)) : l === "focusout" && Jf();
  }
  function Wd(l) {
    if (l === "selectionchange" || l === "keyup" || l === "keydown") return qn(qu);
  }
  function $d(l, t) {
    if (l === "click") return qn(t);
  }
  function kd(l, t) {
    if (l === "input" || l === "change") return qn(t);
  }
  function Fd(l, t) {
    return l === t && (l !== 0 || 1 / l === 1 / t) || l !== l && t !== t;
  }
  var it = typeof Object.is == "function" ? Object.is : Fd;
  function Gu(l, t) {
    if (it(l, t)) return !0;
    if (typeof l != "object" || l === null || typeof t != "object" || t === null) return !1;
    var a = Object.keys(l), u = Object.keys(t);
    if (a.length !== u.length) return !1;
    for (u = 0; u < a.length; u++) {
      var n = a[u];
      if (!Le.call(t, n) || !it(l[n], t[n])) return !1;
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
    for (var t = pn(l.document); t instanceof l.HTMLIFrameElement; ) {
      try {
        var a = typeof t.contentWindow.location.href == "string";
      } catch {
        a = !1;
      }
      if (a) l = t.contentWindow;
      else break;
      t = pn(l.document);
    }
    return t;
  }
  function mi(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t && (t === "input" && (l.type === "text" || l.type === "search" || l.type === "tel" || l.type === "url" || l.type === "password") || t === "textarea" || l.contentEditable === "true");
  }
  var Id = Ct && "documentMode" in document && 11 >= document.documentMode, Fa = null, yi = null, Xu = null, hi = !1;
  function If(l, t, a) {
    var u = a.window === a ? a.document : a.nodeType === 9 ? a : a.ownerDocument;
    hi || Fa == null || Fa !== pn(u) || (u = Fa, "selectionStart" in u && mi(u) ? u = {
      start: u.selectionStart,
      end: u.selectionEnd
    } : (u = (u.ownerDocument && u.ownerDocument.defaultView || window).getSelection(), u = {
      anchorNode: u.anchorNode,
      anchorOffset: u.anchorOffset,
      focusNode: u.focusNode,
      focusOffset: u.focusOffset
    }), Xu && Gu(Xu, u) || (Xu = u, u = Oe(yi, "onSelect"), 0 < u.length && (t = new Cn("onSelect", "select", null, t, a), l.push({
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
  }, si = {}, Pf = {};
  Ct && (Pf = document.createElement("div").style, "AnimationEvent" in window || (delete Ia.animationend.animation, delete Ia.animationiteration.animation, delete Ia.animationstart.animation), "TransitionEvent" in window || delete Ia.transitionend.transition);
  function Ma(l) {
    if (si[l]) return si[l];
    if (!Ia[l]) return l;
    var t = Ia[l], a;
    for (a in t) if (t.hasOwnProperty(a) && a in Pf) return si[l] = t[a];
    return l;
  }
  var l0 = Ma("animationend"), t0 = Ma("animationiteration"), a0 = Ma("animationstart"), Pd = Ma("transitionrun"), lm = Ma("transitionstart"), tm = Ma("transitioncancel"), u0 = Ma("transitionend"), n0 = /* @__PURE__ */ new Map(), oi = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
  oi.push("scrollEnd");
  function Ot(l, t) {
    n0.set(l, t), Ta(t, [l]);
  }
  var Gn = typeof reportError == "function" ? reportError : function(l) {
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
  }, st = [], Pa = 0, gi = 0;
  function Xn() {
    for (var l = Pa, t = gi = Pa = 0; t < l; ) {
      var a = st[t];
      st[t++] = null;
      var u = st[t];
      st[t++] = null;
      var n = st[t];
      st[t++] = null;
      var e = st[t];
      if (st[t++] = null, u !== null && n !== null) {
        var i = u.pending;
        i === null ? n.next = n : (n.next = i.next, i.next = n), u.pending = n;
      }
      e !== 0 && e0(a, n, e);
    }
  }
  function Qn(l, t, a, u) {
    st[Pa++] = l, st[Pa++] = t, st[Pa++] = a, st[Pa++] = u, gi |= u, l.lanes |= u, l = l.alternate, l !== null && (l.lanes |= u);
  }
  function Si(l, t, a, u) {
    return Qn(l, t, a, u), Zn(l);
  }
  function Da(l, t) {
    return Qn(l, null, null, t), Zn(l);
  }
  function e0(l, t, a) {
    l.lanes |= a;
    var u = l.alternate;
    u !== null && (u.lanes |= a);
    for (var n = !1, e = l.return; e !== null; ) e.childLanes |= a, u = e.alternate, u !== null && (u.childLanes |= a), e.tag === 22 && (l = e.stateNode, l === null || l._visibility & 1 || (n = !0)), l = e, e = e.return;
    return l.tag === 3 ? (e = l.stateNode, n && t !== null && (n = 31 - et(a), l = e.hiddenUpdates, u = l[n], u === null ? l[n] = [t] : u.push(t), t.lane = a | 536870912), e) : null;
  }
  function Zn(l) {
    if (50 < fn) throw fn = 0, Mc = null, Error(h(185));
    for (var t = l.return; t !== null; ) l = t, t = l.return;
    return l.tag === 3 ? l.stateNode : null;
  }
  var lu = {};
  function am(l, t, a, u) {
    this.tag = l, this.key = a, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = u, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function ct(l, t, a, u) {
    return new am(l, t, a, u);
  }
  function bi(l) {
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
  function Ln(l, t, a, u, n, e) {
    var i = 0;
    if (u = l, typeof l == "function") bi(l) && (i = 1);
    else if (typeof l == "string") i = fy(l, a, B.current) ? 26 : l === "html" || l === "head" || l === "body" ? 27 : 5;
    else l: switch (l) {
      case tt:
        return l = ct(31, a, t, n), l.elementType = tt, l.lanes = e, l;
      case Rl:
        return Ua(a.children, n, e, t);
      case Tt:
        i = 8, n |= 24;
        break;
      case Ll:
        return l = ct(12, a, t, n | 2), l.elementType = Ll, l.lanes = e, l;
      case Vl:
        return l = ct(13, a, t, n), l.elementType = Vl, l.lanes = e, l;
      case El:
        return l = ct(19, a, t, n), l.elementType = El, l.lanes = e, l;
      default:
        if (typeof l == "object" && l !== null) switch (l.$$typeof) {
          case _l:
            i = 10;
            break l;
          case At:
            i = 9;
            break l;
          case wl:
            i = 11;
            break l;
          case P:
            i = 14;
            break l;
          case xl:
            i = 16, u = null;
            break l;
        }
        i = 29, a = Error(h(130, l === null ? "null" : typeof l, "")), u = null;
    }
    return t = ct(i, a, t, n), t.elementType = l, t.type = u, t.lanes = e, t;
  }
  function Ua(l, t, a, u) {
    return l = ct(7, l, u, t), l.lanes = a, l;
  }
  function ri(l, t, a) {
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
        stack: ef(t)
      }, f0.set(l, t), t);
    }
    return {
      value: l,
      source: t,
      stack: ef(t)
    };
  }
  var tu = [], au = 0, Vn = null, Qu = 0, gt = [], St = 0, ta = null, Ut = 1, Nt = "";
  function qt(l, t) {
    tu[au++] = Qu, tu[au++] = Vn, Vn = l, Qu = t;
  }
  function v0(l, t, a) {
    gt[St++] = Ut, gt[St++] = Nt, gt[St++] = ta, ta = l;
    var u = Ut;
    l = Nt;
    var n = 32 - et(u) - 1;
    u &= ~(1 << n), a += 1;
    var e = 32 - et(t) + n;
    if (30 < e) {
      var i = n - n % 5;
      e = (u & (1 << i) - 1).toString(32), u >>= i, n -= i, Ut = 1 << 32 - et(t) + n | a << n | u, Nt = e + l;
    } else Ut = 1 << e | a << n | u, Nt = l;
  }
  function _i(l) {
    l.return !== null && (qt(l, 1), v0(l, 1, 0));
  }
  function Ei(l) {
    for (; l === Vn; ) Vn = tu[--au], tu[au] = null, Qu = tu[--au], tu[au] = null;
    for (; l === ta; ) ta = gt[--St], gt[St] = null, Nt = gt[--St], gt[St] = null, Ut = gt[--St], gt[St] = null;
  }
  function d0(l, t) {
    gt[St++] = Ut, gt[St++] = Nt, gt[St++] = ta, Ut = t.id, Nt = t.overflow, ta = l;
  }
  var Gl = null, yl = null, I = !1, aa = null, bt = !1, Ti = Error(h(519));
  function ua(l) {
    throw Zu(ot(Error(h(418, 1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML", "")), l)), Ti;
  }
  function m0(l) {
    var t = l.stateNode, a = l.type, u = l.memoizedProps;
    switch (t[ql] = l, t[Wl] = u, a) {
      case "dialog":
        W("cancel", t), W("close", t);
        break;
      case "iframe":
      case "object":
      case "embed":
        W("load", t);
        break;
      case "video":
      case "audio":
        for (a = 0; a < dn.length; a++) W(dn[a], t);
        break;
      case "source":
        W("error", t);
        break;
      case "img":
      case "image":
      case "link":
        W("error", t), W("load", t);
        break;
      case "details":
        W("toggle", t);
        break;
      case "input":
        W("invalid", t), Af(t, u.value, u.defaultValue, u.checked, u.defaultChecked, u.type, u.name, !0);
        break;
      case "select":
        W("invalid", t);
        break;
      case "textarea":
        W("invalid", t), Mf(t, u.value, u.defaultValue, u.children);
    }
    a = u.children, typeof a != "string" && typeof a != "number" && typeof a != "bigint" || t.textContent === "" + a || u.suppressHydrationWarning === !0 || M1(t.textContent, a) ? (u.popover != null && (W("beforetoggle", t), W("toggle", t)), u.onScroll != null && W("scroll", t), u.onScrollEnd != null && W("scrollend", t), u.onClick != null && (t.onclick = Bt), t = !0) : t = !1, t || ua(l, !0);
  }
  function y0(l) {
    for (Gl = l.return; Gl; ) switch (Gl.tag) {
      case 5:
      case 31:
      case 13:
        bt = !1;
        return;
      case 27:
      case 3:
        bt = !0;
        return;
      default:
        Gl = Gl.return;
    }
  }
  function uu(l) {
    if (l !== Gl) return !1;
    if (!I) return y0(l), I = !0, !1;
    var t = l.tag, a;
    if ((a = t !== 3 && t !== 27) && ((a = t === 5) && (a = l.type, a = !(a !== "form" && a !== "button") || Qc(l.type, l.memoizedProps)), a = !a), a && yl && ua(l), y0(l), t === 13) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(h(317));
      yl = C1(l);
    } else if (t === 31) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(h(317));
      yl = C1(l);
    } else t === 27 ? (t = yl, oa(l.type) ? (l = Kc, Kc = null, yl = l) : yl = t) : yl = Gl ? _t(l.stateNode.nextSibling) : null;
    return !0;
  }
  function Na() {
    yl = Gl = null, I = !1;
  }
  function Ai() {
    var l = aa;
    return l !== null && (Pl === null ? Pl = l : Pl.push.apply(Pl, l), aa = null), l;
  }
  function Zu(l) {
    aa === null ? aa = [l] : aa.push(l);
  }
  var Oi = d(null), pa = null, Gt = null;
  function na(l, t, a) {
    D(Oi, t._currentValue), t._currentValue = a;
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
    var n = l.child;
    for (n !== null && (n.return = l); n !== null; ) {
      var e = n.dependencies;
      if (e !== null) {
        var i = n.child;
        e = e.firstContext;
        l: for (; e !== null; ) {
          var c = e;
          e = n;
          for (var f = 0; f < t.length; f++) if (c.context === t[f]) {
            e.lanes |= a, c = e.alternate, c !== null && (c.lanes |= a), Mi(e.return, a, l), u || (i = null);
            break l;
          }
          e = c.next;
        }
      } else if (n.tag === 18) {
        if (i = n.return, i === null) throw Error(h(341));
        i.lanes |= a, e = i.alternate, e !== null && (e.lanes |= a), Mi(i, a, l), i = null;
      } else i = n.child;
      if (i !== null) i.return = n;
      else for (i = n; i !== null; ) {
        if (i === l) {
          i = null;
          break;
        }
        if (n = i.sibling, n !== null) {
          n.return = i.return, i = n;
          break;
        }
        i = i.return;
      }
      n = i;
    }
  }
  function nu(l, t, a, u) {
    l = null;
    for (var n = t, e = !1; n !== null; ) {
      if (!e) {
        if ((n.flags & 524288) !== 0) e = !0;
        else if ((n.flags & 262144) !== 0) break;
      }
      if (n.tag === 10) {
        var i = n.alternate;
        if (i === null) throw Error(h(387));
        if (i = i.memoizedProps, i !== null) {
          var c = n.type;
          it(n.pendingProps.value, i.value) || (l !== null ? l.push(c) : l = [c]);
        }
      } else if (n === nl.current) {
        if (i = n.alternate, i === null) throw Error(h(387));
        i.memoizedState.memoizedState !== n.memoizedState.memoizedState && (l !== null ? l.push(on) : l = [on]);
      }
      n = n.return;
    }
    l !== null && Di(t, l, a, u), t.flags |= 262144;
  }
  function xn(l) {
    for (l = l.firstContext; l !== null; ) {
      if (!it(l.context._currentValue, l.memoizedValue)) return !0;
      l = l.next;
    }
    return !1;
  }
  function Ha(l) {
    pa = l, Gt = null, l = l.dependencies, l !== null && (l.firstContext = null);
  }
  function Xl(l) {
    return h0(pa, l);
  }
  function Kn(l, t) {
    return pa === null && Ha(l), h0(l, t);
  }
  function h0(l, t) {
    var a = t._currentValue;
    if (t = {
      context: t,
      memoizedValue: a,
      next: null
    }, Gt === null) {
      if (l === null) throw Error(h(308));
      Gt = t, l.dependencies = {
        lanes: 0,
        firstContext: t
      }, l.flags |= 524288;
    } else Gt = Gt.next = t;
    return a;
  }
  var um = typeof AbortController < "u" ? AbortController : function() {
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
  }, nm = A.unstable_scheduleCallback, em = A.unstable_NormalPriority, Dl = {
    $$typeof: _l,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function Ui() {
    return {
      controller: new um(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function Lu(l) {
    l.refCount--, l.refCount === 0 && nm(em, function() {
      l.controller.abort();
    });
  }
  var Vu = null, Ni = 0, eu = 0, iu = null;
  function im(l, t) {
    if (Vu === null) {
      var a = Vu = [];
      Ni = 0, eu = jc(), iu = {
        status: "pending",
        value: void 0,
        then: function(u) {
          a.push(u);
        }
      };
    }
    return Ni++, t.then(s0, s0), t;
  }
  function s0() {
    if (--Ni === 0 && Vu !== null) {
      iu !== null && (iu.status = "fulfilled");
      var l = Vu;
      Vu = null, eu = 0, iu = null;
      for (var t = 0; t < l.length; t++) (0, l[t])();
    }
  }
  function cm(l, t) {
    var a = [], u = {
      status: "pending",
      value: null,
      reason: null,
      then: function(n) {
        a.push(n);
      }
    };
    return l.then(function() {
      u.status = "fulfilled", u.value = t;
      for (var n = 0; n < a.length; n++) (0, a[n])(t);
    }, function(n) {
      for (u.status = "rejected", u.reason = n, n = 0; n < a.length; n++) (0, a[n])(void 0);
    }), u;
  }
  var o0 = E.S;
  E.S = function(l, t) {
    $v = ut(), typeof t == "object" && t !== null && typeof t.then == "function" && im(l, t), o0 !== null && o0(l, t);
  };
  var ja = d(null);
  function pi() {
    var l = ja.current;
    return l !== null ? l : ml.pooledCache;
  }
  function Jn(l, t) {
    t === null ? D(ja, ja.current) : D(ja, t.pool);
  }
  function g0() {
    var l = pi();
    return l === null ? null : {
      parent: Dl._currentValue,
      pool: l
    };
  }
  var cu = Error(h(460)), Hi = Error(h(474)), wn = Error(h(542)), Wn = { then: function() {
  } };
  function S0(l) {
    return l = l.status, l === "fulfilled" || l === "rejected";
  }
  function b0(l, t, a) {
    switch (a = l[a], a === void 0 ? l.push(t) : a !== t && (t.then(Bt, Bt), t = a), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw l = t.reason, z0(l), l;
      default:
        if (typeof t.status == "string") t.then(Bt, Bt);
        else {
          if (l = ml, l !== null && 100 < l.shellSuspendCounter) throw Error(h(482));
          l = t, l.status = "pending", l.then(function(u) {
            if (t.status === "pending") {
              var n = t;
              n.status = "fulfilled", n.value = u;
            }
          }, function(u) {
            if (t.status === "pending") {
              var n = t;
              n.status = "rejected", n.reason = u;
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
  function r0() {
    if (Ba === null) throw Error(h(459));
    var l = Ba;
    return Ba = null, l;
  }
  function z0(l) {
    if (l === cu || l === wn) throw Error(h(483));
  }
  var fu = null, xu = 0;
  function $n(l) {
    var t = xu;
    return xu += 1, fu === null && (fu = []), b0(fu, l, t);
  }
  function Ku(l, t) {
    t = t.props.ref, l.ref = t !== void 0 ? t : null;
  }
  function kn(l, t) {
    throw t.$$typeof === zl ? Error(h(525)) : (l = Object.prototype.toString.call(t), Error(h(31, l === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : l)));
  }
  function _0(l) {
    function t(m, v) {
      if (l) {
        var s = m.deletions;
        s === null ? (m.deletions = [v], m.flags |= 16) : s.push(v);
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
    function n(m, v) {
      return m = Yt(m, v), m.index = 0, m.sibling = null, m;
    }
    function e(m, v, s) {
      return m.index = s, l ? (s = m.alternate, s !== null ? (s = s.index, s < v ? (m.flags |= 67108866, v) : s) : (m.flags |= 67108866, v)) : (m.flags |= 1048576, v);
    }
    function i(m) {
      return l && m.alternate === null && (m.flags |= 67108866), m;
    }
    function c(m, v, s, r) {
      return v === null || v.tag !== 6 ? (v = ri(s, m.mode, r), v.return = m, v) : (v = n(v, s), v.return = m, v);
    }
    function f(m, v, s, r) {
      var Y = s.type;
      return Y === Rl ? b(m, v, s.props.children, r, s.key) : v !== null && (v.elementType === Y || typeof Y == "object" && Y !== null && Y.$$typeof === xl && Ra(Y) === v.type) ? (v = n(v, s.props), Ku(v, s), v.return = m, v) : (v = Ln(s.type, s.key, s.props, null, m.mode, r), Ku(v, s), v.return = m, v);
    }
    function o(m, v, s, r) {
      return v === null || v.tag !== 4 || v.stateNode.containerInfo !== s.containerInfo || v.stateNode.implementation !== s.implementation ? (v = zi(s, m.mode, r), v.return = m, v) : (v = n(v, s.children || []), v.return = m, v);
    }
    function b(m, v, s, r, Y) {
      return v === null || v.tag !== 7 ? (v = Ua(s, m.mode, r, Y), v.return = m, v) : (v = n(v, s), v.return = m, v);
    }
    function z(m, v, s) {
      if (typeof v == "string" && v !== "" || typeof v == "number" || typeof v == "bigint") return v = ri("" + v, m.mode, s), v.return = m, v;
      if (typeof v == "object" && v !== null) {
        switch (v.$$typeof) {
          case Hl:
            return s = Ln(v.type, v.key, v.props, null, m.mode, s), Ku(s, v), s.return = m, s;
          case Ml:
            return v = zi(v, m.mode, s), v.return = m, v;
          case xl:
            return v = Ra(v), z(m, v, s);
        }
        if (O(v) || Sl(v)) return v = Ua(v, m.mode, s, null), v.return = m, v;
        if (typeof v.then == "function") return z(m, $n(v), s);
        if (v.$$typeof === _l) return z(m, Kn(m, v), s);
        kn(m, v);
      }
      return null;
    }
    function g(m, v, s, r) {
      var Y = v !== null ? v.key : null;
      if (typeof s == "string" && s !== "" || typeof s == "number" || typeof s == "bigint") return Y !== null ? null : c(m, v, "" + s, r);
      if (typeof s == "object" && s !== null) {
        switch (s.$$typeof) {
          case Hl:
            return s.key === Y ? f(m, v, s, r) : null;
          case Ml:
            return s.key === Y ? o(m, v, s, r) : null;
          case xl:
            return s = Ra(s), g(m, v, s, r);
        }
        if (O(s) || Sl(s)) return Y !== null ? null : b(m, v, s, r, null);
        if (typeof s.then == "function") return g(m, v, $n(s), r);
        if (s.$$typeof === _l) return g(m, v, Kn(m, s), r);
        kn(m, s);
      }
      return null;
    }
    function S(m, v, s, r, Y) {
      if (typeof r == "string" && r !== "" || typeof r == "number" || typeof r == "bigint") return m = m.get(s) || null, c(v, m, "" + r, Y);
      if (typeof r == "object" && r !== null) {
        switch (r.$$typeof) {
          case Hl:
            return m = m.get(r.key === null ? s : r.key) || null, f(v, m, r, Y);
          case Ml:
            return m = m.get(r.key === null ? s : r.key) || null, o(v, m, r, Y);
          case xl:
            return r = Ra(r), S(m, v, s, r, Y);
        }
        if (O(r) || Sl(r)) return m = m.get(s) || null, b(v, m, r, Y, null);
        if (typeof r.then == "function") return S(m, v, s, $n(r), Y);
        if (r.$$typeof === _l) return S(m, v, s, Kn(v, r), Y);
        kn(v, r);
      }
      return null;
    }
    function p(m, v, s, r) {
      for (var Y = null, tl = null, j = v, L = v = 0, F = null; j !== null && L < s.length; L++) {
        j.index > L ? (F = j, j = null) : F = j.sibling;
        var al = g(m, j, s[L], r);
        if (al === null) {
          j === null && (j = F);
          break;
        }
        l && j && al.alternate === null && t(m, j), v = e(al, v, L), tl === null ? Y = al : tl.sibling = al, tl = al, j = F;
      }
      if (L === s.length) return a(m, j), I && qt(m, L), Y;
      if (j === null) {
        for (; L < s.length; L++) j = z(m, s[L], r), j !== null && (v = e(j, v, L), tl === null ? Y = j : tl.sibling = j, tl = j);
        return I && qt(m, L), Y;
      }
      for (j = u(j); L < s.length; L++) F = S(j, m, L, s[L], r), F !== null && (l && F.alternate !== null && j.delete(F.key === null ? L : F.key), v = e(F, v, L), tl === null ? Y = F : tl.sibling = F, tl = F);
      return l && j.forEach(function(za) {
        return t(m, za);
      }), I && qt(m, L), Y;
    }
    function G(m, v, s, r) {
      if (s == null) throw Error(h(151));
      for (var Y = null, tl = null, j = v, L = v = 0, F = null, al = s.next(); j !== null && !al.done; L++, al = s.next()) {
        j.index > L ? (F = j, j = null) : F = j.sibling;
        var za = g(m, j, al.value, r);
        if (za === null) {
          j === null && (j = F);
          break;
        }
        l && j && za.alternate === null && t(m, j), v = e(za, v, L), tl === null ? Y = za : tl.sibling = za, tl = za, j = F;
      }
      if (al.done) return a(m, j), I && qt(m, L), Y;
      if (j === null) {
        for (; !al.done; L++, al = s.next()) al = z(m, al.value, r), al !== null && (v = e(al, v, L), tl === null ? Y = al : tl.sibling = al, tl = al);
        return I && qt(m, L), Y;
      }
      for (j = u(j); !al.done; L++, al = s.next()) al = S(j, m, L, al.value, r), al !== null && (l && al.alternate !== null && j.delete(al.key === null ? L : al.key), v = e(al, v, L), tl === null ? Y = al : tl.sibling = al, tl = al);
      return l && j.forEach(function(Ey) {
        return t(m, Ey);
      }), I && qt(m, L), Y;
    }
    function vl(m, v, s, r) {
      if (typeof s == "object" && s !== null && s.type === Rl && s.key === null && (s = s.props.children), typeof s == "object" && s !== null) {
        switch (s.$$typeof) {
          case Hl:
            l: {
              for (var Y = s.key; v !== null; ) {
                if (v.key === Y) {
                  if (Y = s.type, Y === Rl) {
                    if (v.tag === 7) {
                      a(m, v.sibling), r = n(v, s.props.children), r.return = m, m = r;
                      break l;
                    }
                  } else if (v.elementType === Y || typeof Y == "object" && Y !== null && Y.$$typeof === xl && Ra(Y) === v.type) {
                    a(m, v.sibling), r = n(v, s.props), Ku(r, s), r.return = m, m = r;
                    break l;
                  }
                  a(m, v);
                  break;
                } else t(m, v);
                v = v.sibling;
              }
              s.type === Rl ? (r = Ua(s.props.children, m.mode, r, s.key), r.return = m, m = r) : (r = Ln(s.type, s.key, s.props, null, m.mode, r), Ku(r, s), r.return = m, m = r);
            }
            return i(m);
          case Ml:
            l: {
              for (Y = s.key; v !== null; ) {
                if (v.key === Y) if (v.tag === 4 && v.stateNode.containerInfo === s.containerInfo && v.stateNode.implementation === s.implementation) {
                  a(m, v.sibling), r = n(v, s.children || []), r.return = m, m = r;
                  break l;
                } else {
                  a(m, v);
                  break;
                }
                else t(m, v);
                v = v.sibling;
              }
              r = zi(s, m.mode, r), r.return = m, m = r;
            }
            return i(m);
          case xl:
            return s = Ra(s), vl(m, v, s, r);
        }
        if (O(s)) return p(m, v, s, r);
        if (Sl(s)) {
          if (Y = Sl(s), typeof Y != "function") throw Error(h(150));
          return s = Y.call(s), G(m, v, s, r);
        }
        if (typeof s.then == "function") return vl(m, v, $n(s), r);
        if (s.$$typeof === _l) return vl(m, v, Kn(m, s), r);
        kn(m, s);
      }
      return typeof s == "string" && s !== "" || typeof s == "number" || typeof s == "bigint" ? (s = "" + s, v !== null && v.tag === 6 ? (a(m, v.sibling), r = n(v, s), r.return = m, m = r) : (a(m, v), r = ri(s, m.mode, r), r.return = m, m = r), i(m)) : a(m, v);
    }
    return function(m, v, s, r) {
      try {
        xu = 0;
        var Y = vl(m, v, s, r);
        return fu = null, Y;
      } catch (j) {
        if (j === cu || j === wn) throw j;
        var tl = ct(29, j, null, m.mode);
        return tl.lanes = r, tl.return = m, tl;
      }
    };
  }
  var Ca = _0(!0), E0 = _0(!1), ea = !1;
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
    if (u = u.shared, (ul & 2) !== 0) {
      var n = u.pending;
      return n === null ? t.next = t : (t.next = n.next, n.next = t), u.pending = t, t = Zn(l), e0(l, null, a), t;
    }
    return Qn(l, u, t, a), Zn(l);
  }
  function Ju(l, t, a) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (a & 4194048) !== 0)) {
      var u = t.lanes;
      u &= l.pendingLanes, a |= u, t.lanes = a, yf(l, a);
    }
  }
  function Bi(l, t) {
    var a = l.updateQueue, u = l.alternate;
    if (u !== null && (u = u.updateQueue, a === u)) {
      var n = null, e = null;
      if (a = a.firstBaseUpdate, a !== null) {
        do {
          var i = {
            lane: a.lane,
            tag: a.tag,
            payload: a.payload,
            callback: null,
            next: null
          };
          e === null ? n = e = i : e = e.next = i, a = a.next;
        } while (a !== null);
        e === null ? n = e = t : e = e.next = t;
      } else n = e = t;
      a = {
        baseState: u.baseState,
        firstBaseUpdate: n,
        lastBaseUpdate: e,
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
    var n = l.updateQueue;
    ea = !1;
    var e = n.firstBaseUpdate, i = n.lastBaseUpdate, c = n.shared.pending;
    if (c !== null) {
      n.shared.pending = null;
      var f = c, o = f.next;
      f.next = null, i === null ? e = o : i.next = o, i = f;
      var b = l.alternate;
      b !== null && (b = b.updateQueue, c = b.lastBaseUpdate, c !== i && (c === null ? b.firstBaseUpdate = o : c.next = o, b.lastBaseUpdate = f));
    }
    if (e !== null) {
      var z = n.baseState;
      i = 0, b = o = f = null, c = e;
      do {
        var g = c.lane & -536870913, S = g !== c.lane;
        if (S ? (k & g) === g : (u & g) === g) {
          g !== 0 && g === eu && (Ci = !0), b !== null && (b = b.next = {
            lane: 0,
            tag: c.tag,
            payload: c.payload,
            callback: null,
            next: null
          });
          l: {
            var p = l, G = c;
            g = t;
            var vl = a;
            switch (G.tag) {
              case 1:
                if (p = G.payload, typeof p == "function") {
                  z = p.call(vl, z, g);
                  break l;
                }
                z = p;
                break l;
              case 3:
                p.flags = p.flags & -65537 | 128;
              case 0:
                if (p = G.payload, g = typeof p == "function" ? p.call(vl, z, g) : p, g == null) break l;
                z = R({}, z, g);
                break l;
              case 2:
                ea = !0;
            }
          }
          g = c.callback, g !== null && (l.flags |= 64, S && (l.flags |= 8192), S = n.callbacks, S === null ? n.callbacks = [g] : S.push(g));
        } else S = {
          lane: g,
          tag: c.tag,
          payload: c.payload,
          callback: c.callback,
          next: null
        }, b === null ? (o = b = S, f = z) : b = b.next = S, i |= g;
        if (c = c.next, c === null) {
          if (c = n.shared.pending, c === null) break;
          S = c, c = S.next, S.next = null, n.lastBaseUpdate = S, n.shared.pending = null;
        }
      } while (!0);
      b === null && (f = z), n.baseState = f, n.firstBaseUpdate = o, n.lastBaseUpdate = b, e === null && (n.shared.lanes = 0), da |= i, l.lanes = i, l.memoizedState = z;
    }
  }
  function T0(l, t) {
    if (typeof l != "function") throw Error(h(191, l));
    l.call(t);
  }
  function A0(l, t) {
    var a = l.callbacks;
    if (a !== null) for (l.callbacks = null, l = 0; l < a.length; l++) T0(a[l], t);
  }
  var vu = d(null), Fn = d(0);
  function O0(l, t) {
    l = Wt, D(Fn, l), D(vu, t), Wt = l | t.baseLanes;
  }
  function Yi() {
    D(Fn, Wt), D(vu, vu.current);
  }
  function qi() {
    Wt = Fn.current, _(vu), _(Fn);
  }
  var ft = d(null), rt = null;
  function ia(l) {
    var t = l.alternate;
    D(Al, Al.current & 1), D(ft, l), rt === null && (t === null || vu.current !== null || t.memoizedState !== null) && (rt = l);
  }
  function Gi(l) {
    D(Al, Al.current), D(ft, l), rt === null && (rt = l);
  }
  function M0(l) {
    l.tag === 22 ? (D(Al, Al.current), D(ft, l), rt === null && (rt = l)) : ca(l);
  }
  function ca() {
    D(Al, Al.current), D(ft, ft.current);
  }
  function vt(l) {
    _(ft), rt === l && (rt = null), _(Al);
  }
  var Al = d(0);
  function In(l) {
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
  var Qt = 0, Z = null, cl = null, Ul = null, Pn = !1, du = !1, Ga = !1, le = 0, $u = 0, mu = null, fm = 0;
  function bl() {
    throw Error(h(321));
  }
  function Xi(l, t) {
    if (t === null) return !1;
    for (var a = 0; a < t.length && a < l.length; a++) if (!it(l[a], t[a])) return !1;
    return !0;
  }
  function Qi(l, t, a, u, n, e) {
    return Qt = e, Z = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, E.H = l === null || l.memoizedState === null ? vv : tc, Ga = !1, e = a(u, n), Ga = !1, du && (e = U0(t, a, u, n)), D0(l), e;
  }
  function D0(l) {
    E.H = Iu;
    var t = cl !== null && cl.next !== null;
    if (Qt = 0, Ul = cl = Z = null, Pn = !1, $u = 0, mu = null, t) throw Error(h(300));
    l === null || Nl || (l = l.dependencies, l !== null && xn(l) && (Nl = !0));
  }
  function U0(l, t, a, u) {
    Z = l;
    var n = 0;
    do {
      if (du && (mu = null), $u = 0, du = !1, 25 <= n) throw Error(h(301));
      if (n += 1, Ul = cl = null, l.updateQueue != null) {
        var e = l.updateQueue;
        e.lastEffect = null, e.events = null, e.stores = null, e.memoCache != null && (e.memoCache.index = 0);
      }
      E.H = dv, e = t(a, u);
    } while (du);
    return e;
  }
  function vm() {
    var l = E.H, t = l.useState()[0];
    return t = typeof t.then == "function" ? ku(t) : t, l = l.useState()[0], (cl !== null ? cl.memoizedState : null) !== l && (Z.flags |= 1024), t;
  }
  function Zi() {
    var l = le !== 0;
    return le = 0, l;
  }
  function Li(l, t, a) {
    t.updateQueue = l.updateQueue, t.flags &= -2053, l.lanes &= ~a;
  }
  function Vi(l) {
    if (Pn) {
      for (l = l.memoizedState; l !== null; ) {
        var t = l.queue;
        t !== null && (t.pending = null), l = l.next;
      }
      Pn = !1;
    }
    Qt = 0, Ul = cl = Z = null, du = !1, $u = le = 0, mu = null;
  }
  function Jl() {
    var l = {
      memoizedState: null,
      baseState: null,
      baseQueue: null,
      queue: null,
      next: null
    };
    return Ul === null ? Z.memoizedState = Ul = l : Ul = Ul.next = l, Ul;
  }
  function Ol() {
    if (cl === null) {
      var l = Z.alternate;
      l = l !== null ? l.memoizedState : null;
    } else l = cl.next;
    var t = Ul === null ? Z.memoizedState : Ul.next;
    if (t !== null) Ul = t, cl = l;
    else {
      if (l === null)
        throw Z.alternate === null ? Error(h(467)) : Error(h(310));
      cl = l, l = {
        memoizedState: cl.memoizedState,
        baseState: cl.baseState,
        baseQueue: cl.baseQueue,
        queue: cl.queue,
        next: null
      }, Ul === null ? Z.memoizedState = Ul = l : Ul = Ul.next = l;
    }
    return Ul;
  }
  function te() {
    return {
      lastEffect: null,
      events: null,
      stores: null,
      memoCache: null
    };
  }
  function ku(l) {
    var t = $u;
    return $u += 1, mu === null && (mu = []), l = b0(mu, l, t), t = Z, (Ul === null ? t.memoizedState : Ul.next) === null && (t = t.alternate, E.H = t === null || t.memoizedState === null ? vv : tc), l;
  }
  function ae(l) {
    if (l !== null && typeof l == "object") {
      if (typeof l.then == "function") return ku(l);
      if (l.$$typeof === _l) return Xl(l);
    }
    throw Error(h(438, String(l)));
  }
  function xi(l) {
    var t = null, a = Z.updateQueue;
    if (a !== null && (t = a.memoCache), t == null) {
      var u = Z.alternate;
      u !== null && (u = u.updateQueue, u !== null && (u = u.memoCache, u != null && (t = {
        data: u.data.map(function(n) {
          return n.slice();
        }),
        index: 0
      })));
    }
    if (t ??= {
      data: [],
      index: 0
    }, a === null && (a = te(), Z.updateQueue = a), a.memoCache = t, a = t.data[t.index], a === void 0) for (a = t.data[t.index] = Array(l), u = 0; u < l; u++) a[u] = jt;
    return t.index++, a;
  }
  function Zt(l, t) {
    return typeof t == "function" ? t(l) : t;
  }
  function ue(l) {
    return Ki(Ol(), cl, l);
  }
  function Ki(l, t, a) {
    var u = l.queue;
    if (u === null) throw Error(h(311));
    u.lastRenderedReducer = a;
    var n = l.baseQueue, e = u.pending;
    if (e !== null) {
      if (n !== null) {
        var i = n.next;
        n.next = e.next, e.next = i;
      }
      t.baseQueue = n = e, u.pending = null;
    }
    if (e = l.baseState, n === null) l.memoizedState = e;
    else {
      t = n.next;
      var c = i = null, f = null, o = t, b = !1;
      do {
        var z = o.lane & -536870913;
        if (z !== o.lane ? (k & z) === z : (Qt & z) === z) {
          var g = o.revertLane;
          if (g === 0) f !== null && (f = f.next = {
            lane: 0,
            revertLane: 0,
            gesture: null,
            action: o.action,
            hasEagerState: o.hasEagerState,
            eagerState: o.eagerState,
            next: null
          }), z === eu && (b = !0);
          else if ((Qt & g) === g) {
            o = o.next, g === eu && (b = !0);
            continue;
          } else z = {
            lane: 0,
            revertLane: o.revertLane,
            gesture: null,
            action: o.action,
            hasEagerState: o.hasEagerState,
            eagerState: o.eagerState,
            next: null
          }, f === null ? (c = f = z, i = e) : f = f.next = z, Z.lanes |= g, da |= g;
          z = o.action, Ga && a(e, z), e = o.hasEagerState ? o.eagerState : a(e, z);
        } else g = {
          lane: z,
          revertLane: o.revertLane,
          gesture: o.gesture,
          action: o.action,
          hasEagerState: o.hasEagerState,
          eagerState: o.eagerState,
          next: null
        }, f === null ? (c = f = g, i = e) : f = f.next = g, Z.lanes |= z, da |= z;
        o = o.next;
      } while (o !== null && o !== t);
      if (f === null ? i = e : f.next = c, !it(e, l.memoizedState) && (Nl = !0, b && (a = iu, a !== null))) throw a;
      l.memoizedState = e, l.baseState = i, l.baseQueue = f, u.lastRenderedState = e;
    }
    return n === null && (u.lanes = 0), [l.memoizedState, u.dispatch];
  }
  function Ji(l) {
    var t = Ol(), a = t.queue;
    if (a === null) throw Error(h(311));
    a.lastRenderedReducer = l;
    var u = a.dispatch, n = a.pending, e = t.memoizedState;
    if (n !== null) {
      a.pending = null;
      var i = n = n.next;
      do
        e = l(e, i.action), i = i.next;
      while (i !== n);
      it(e, t.memoizedState) || (Nl = !0), t.memoizedState = e, t.baseQueue === null && (t.baseState = e), a.lastRenderedState = e;
    }
    return [e, u];
  }
  function N0(l, t, a) {
    var u = Z, n = Ol(), e = I;
    if (e) {
      if (a === void 0) throw Error(h(407));
      a = a();
    } else a = t();
    var i = !it((cl || n).memoizedState, a);
    if (i && (n.memoizedState = a, Nl = !0), n = n.queue, $i(j0.bind(null, u, n, l), [l]), n.getSnapshot !== t || i || Ul !== null && Ul.memoizedState.tag & 1) {
      if (u.flags |= 2048, yu(9, { destroy: void 0 }, H0.bind(null, u, n, a, t), null), ml === null) throw Error(h(349));
      e || (Qt & 127) !== 0 || p0(u, t, a);
    }
    return a;
  }
  function p0(l, t, a) {
    l.flags |= 16384, l = {
      getSnapshot: t,
      value: a
    }, t = Z.updateQueue, t === null ? (t = te(), Z.updateQueue = t, t.stores = [l]) : (a = t.stores, a === null ? t.stores = [l] : a.push(l));
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
    return l.baseState = a, Ki(l, cl, typeof u == "function" ? u : Zt);
  }
  function dm(l, t, a, u, n) {
    if (ie(l)) throw Error(h(485));
    if (l = t.action, l !== null) {
      var e = {
        payload: n,
        action: l,
        next: null,
        isTransition: !0,
        status: "pending",
        value: null,
        reason: null,
        listeners: [],
        then: function(i) {
          e.listeners.push(i);
        }
      };
      E.T !== null ? a(!0) : e.isTransition = !1, u(e), a = t.pending, a === null ? (e.next = t.pending = e, Y0(t, e)) : (e.next = a.next, t.pending = a.next = e);
    }
  }
  function Y0(l, t) {
    var a = t.action, u = t.payload, n = l.state;
    if (t.isTransition) {
      var e = E.T, i = {};
      E.T = i;
      try {
        var c = a(n, u), f = E.S;
        f !== null && f(i, c), q0(l, t, c);
      } catch (o) {
        Wi(l, t, o);
      } finally {
        e !== null && i.types !== null && (e.types = i.types), E.T = e;
      }
    } else try {
      e = a(n, u), q0(l, t, e);
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
    if (I) {
      var a = ml.formState;
      if (a !== null) {
        l: {
          var u = Z;
          if (I) {
            if (yl) {
              t: {
                for (var n = yl, e = bt; n.nodeType !== 8; ) {
                  if (!e) {
                    n = null;
                    break t;
                  }
                  if (n = _t(n.nextSibling), n === null) {
                    n = null;
                    break t;
                  }
                }
                e = n.data, n = e === "F!" || e === "F" ? n : null;
              }
              if (n) {
                yl = _t(n.nextSibling), u = n.data === "F!";
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
    }, a.queue = u, a = iv.bind(null, Z, u), u.dispatch = a, u = wi(!1), e = lc.bind(null, Z, !1, u.queue), u = Jl(), n = {
      state: t,
      dispatch: null,
      action: l,
      pending: null
    }, u.queue = n, a = dm.bind(null, Z, n, e, a), n.dispatch = a, u.memoizedState = l, [
      t,
      a,
      !1
    ];
  }
  function L0(l) {
    return V0(Ol(), cl, l);
  }
  function V0(l, t, a) {
    if (t = Ki(l, t, Q0)[0], l = ue(Zt)[0], typeof t == "object" && t !== null && typeof t.then == "function") try {
      var u = ku(t);
    } catch (i) {
      throw i === cu ? wn : i;
    }
    else u = t;
    t = Ol();
    var n = t.queue, e = n.dispatch;
    return a !== t.memoizedState && (Z.flags |= 2048, yu(9, { destroy: void 0 }, mm.bind(null, n, a), null)), [
      u,
      e,
      l
    ];
  }
  function mm(l, t) {
    l.action = t;
  }
  function x0(l) {
    var t = Ol(), a = cl;
    if (a !== null) return V0(t, a, l);
    Ol(), t = t.memoizedState, a = Ol();
    var u = a.queue.dispatch;
    return a.memoizedState = l, [
      t,
      u,
      !1
    ];
  }
  function yu(l, t, a, u) {
    return l = {
      tag: l,
      create: a,
      deps: u,
      inst: t,
      next: null
    }, t = Z.updateQueue, t === null && (t = te(), Z.updateQueue = t), a = t.lastEffect, a === null ? t.lastEffect = l.next = l : (u = a.next, a.next = l, l.next = u, t.lastEffect = l), l;
  }
  function K0() {
    return Ol().memoizedState;
  }
  function ne(l, t, a, u) {
    var n = Jl();
    Z.flags |= l, n.memoizedState = yu(1 | t, { destroy: void 0 }, a, u === void 0 ? null : u);
  }
  function ee(l, t, a, u) {
    var n = Ol();
    u = u === void 0 ? null : u;
    var e = n.memoizedState.inst;
    cl !== null && u !== null && Xi(u, cl.memoizedState.deps) ? n.memoizedState = yu(t, e, a, u) : (Z.flags |= l, n.memoizedState = yu(1 | t, e, a, u));
  }
  function J0(l, t) {
    ne(8390656, 8, l, t);
  }
  function $i(l, t) {
    ee(2048, 8, l, t);
  }
  function ym(l) {
    Z.flags |= 4;
    var t = Z.updateQueue;
    if (t === null) t = te(), Z.updateQueue = t, t.events = [l];
    else {
      var a = t.events;
      a === null ? t.events = [l] : a.push(l);
    }
  }
  function w0(l) {
    var t = Ol().memoizedState;
    return ym({
      ref: t,
      nextImpl: l
    }), function() {
      if ((ul & 2) !== 0) throw Error(h(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function W0(l, t) {
    return ee(4, 2, l, t);
  }
  function $0(l, t) {
    return ee(4, 4, l, t);
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
    a = a != null ? a.concat([l]) : null, ee(4, 4, k0.bind(null, t, l), a);
  }
  function ki() {
  }
  function I0(l, t) {
    var a = Ol();
    t = t === void 0 ? null : t;
    var u = a.memoizedState;
    return t !== null && Xi(t, u[1]) ? u[0] : (a.memoizedState = [l, t], l);
  }
  function P0(l, t) {
    var a = Ol();
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
    return a === void 0 || (Qt & 1073741824) !== 0 && (k & 261930) === 0 ? l.memoizedState = t : (l.memoizedState = a, l = Fv(), Z.lanes |= l, da |= l, a);
  }
  function lv(l, t, a, u) {
    return it(a, t) ? a : vu.current !== null ? (l = Fi(l, a, u), it(l, t) || (Nl = !0), l) : (Qt & 42) === 0 || (Qt & 1073741824) !== 0 && (k & 261930) === 0 ? (Nl = !0, l.memoizedState = a) : (l = Fv(), Z.lanes |= l, da |= l, t);
  }
  function tv(l, t, a, u, n) {
    var e = M.p;
    M.p = e !== 0 && 8 > e ? e : 8;
    var i = E.T, c = {};
    E.T = c, lc(l, !1, t, a);
    try {
      var f = n(), o = E.S;
      o !== null && o(c, f), f !== null && typeof f == "object" && typeof f.then == "function" ? Fu(l, t, cm(f, u), zt(l)) : Fu(l, t, u, zt(l));
    } catch (b) {
      Fu(l, t, {
        then: function() {
        },
        status: "rejected",
        reason: b
      }, zt());
    } finally {
      M.p = e, i !== null && c.types !== null && (i.types = c.types), E.T = i;
    }
  }
  function hm() {
  }
  function Ii(l, t, a, u) {
    if (l.tag !== 5) throw Error(h(476));
    var n = av(l).queue;
    tv(l, n, t, ll, a === null ? hm : function() {
      return uv(l), a(u);
    });
  }
  function av(l) {
    var t = l.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: ll,
      baseState: ll,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: Zt,
        lastRenderedState: ll
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
    return Xl(on);
  }
  function nv() {
    return Ol().memoizedState;
  }
  function ev() {
    return Ol().memoizedState;
  }
  function sm(l) {
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
  function om(l, t, a) {
    var u = zt();
    a = {
      lane: u,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, ie(l) ? cv(t, a) : (a = Si(l, t, a, u), a !== null && (lt(a, l, u), fv(a, t, u)));
  }
  function iv(l, t, a) {
    Fu(l, t, a, zt());
  }
  function Fu(l, t, a, u) {
    var n = {
      lane: u,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    };
    if (ie(l)) cv(t, n);
    else {
      var e = l.alternate;
      if (l.lanes === 0 && (e === null || e.lanes === 0) && (e = t.lastRenderedReducer, e !== null)) try {
        var i = t.lastRenderedState, c = e(i, a);
        if (n.hasEagerState = !0, n.eagerState = c, it(c, i)) return Qn(l, t, n, 0), ml === null && Xn(), !1;
      } catch {
      }
      if (a = Si(l, t, n, u), a !== null) return lt(a, l, u), fv(a, t, u), !0;
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
    }, ie(l)) {
      if (t) throw Error(h(479));
    } else t = Si(l, a, u, 2), t !== null && lt(t, l, 2);
  }
  function ie(l) {
    var t = l.alternate;
    return l === Z || t !== null && t === Z;
  }
  function cv(l, t) {
    du = Pn = !0;
    var a = l.pending;
    a === null ? t.next = t : (t.next = a.next, a.next = t), l.pending = t;
  }
  function fv(l, t, a) {
    if ((a & 4194048) !== 0) {
      var u = t.lanes;
      u &= l.pendingLanes, a |= u, t.lanes = a, yf(l, a);
    }
  }
  var Iu = {
    readContext: Xl,
    use: ae,
    useCallback: bl,
    useContext: bl,
    useEffect: bl,
    useImperativeHandle: bl,
    useLayoutEffect: bl,
    useInsertionEffect: bl,
    useMemo: bl,
    useReducer: bl,
    useRef: bl,
    useState: bl,
    useDebugValue: bl,
    useDeferredValue: bl,
    useTransition: bl,
    useSyncExternalStore: bl,
    useId: bl,
    useHostTransitionStatus: bl,
    useFormState: bl,
    useActionState: bl,
    useOptimistic: bl,
    useMemoCache: bl,
    useCacheRefresh: bl
  };
  Iu.useEffectEvent = bl;
  var vv = {
    readContext: Xl,
    use: ae,
    useCallback: function(l, t) {
      return Jl().memoizedState = [l, t === void 0 ? null : t], l;
    },
    useContext: Xl,
    useEffect: J0,
    useImperativeHandle: function(l, t, a) {
      a = a != null ? a.concat([l]) : null, ne(4194308, 4, k0.bind(null, t, l), a);
    },
    useLayoutEffect: function(l, t) {
      return ne(4194308, 4, l, t);
    },
    useInsertionEffect: function(l, t) {
      ne(4, 2, l, t);
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
        var n = a(t);
        if (Ga) {
          It(!0);
          try {
            a(t);
          } finally {
            It(!1);
          }
        }
      } else n = t;
      return u.memoizedState = u.baseState = n, l = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: l,
        lastRenderedState: n
      }, u.queue = l, l = l.dispatch = om.bind(null, Z, l), [u.memoizedState, l];
    },
    useRef: function(l) {
      var t = Jl();
      return l = { current: l }, t.memoizedState = l;
    },
    useState: function(l) {
      l = wi(l);
      var t = l.queue, a = iv.bind(null, Z, t);
      return t.dispatch = a, [l.memoizedState, a];
    },
    useDebugValue: ki,
    useDeferredValue: function(l, t) {
      return Fi(Jl(), l, t);
    },
    useTransition: function() {
      var l = wi(!1);
      return l = tv.bind(null, Z, l.queue, !0, !1), Jl().memoizedState = l, [!1, l];
    },
    useSyncExternalStore: function(l, t, a) {
      var u = Z, n = Jl();
      if (I) {
        if (a === void 0) throw Error(h(407));
        a = a();
      } else {
        if (a = t(), ml === null) throw Error(h(349));
        (k & 127) !== 0 || p0(u, t, a);
      }
      n.memoizedState = a;
      var e = {
        value: a,
        getSnapshot: t
      };
      return n.queue = e, J0(j0.bind(null, u, e, l), [l]), u.flags |= 2048, yu(9, { destroy: void 0 }, H0.bind(null, u, e, a, t), null), a;
    },
    useId: function() {
      var l = Jl(), t = ml.identifierPrefix;
      if (I) {
        var a = Nt, u = Ut;
        a = (u & ~(1 << 32 - et(u) - 1)).toString(32) + a, t = "_" + t + "R_" + a, a = le++, 0 < a && (t += "H" + a.toString(32)), t += "_";
      } else a = fm++, t = "_" + t + "r_" + a.toString(32) + "_";
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
      return t.queue = a, t = lc.bind(null, Z, !0, a), a.dispatch = t, [l, t];
    },
    useMemoCache: xi,
    useCacheRefresh: function() {
      return Jl().memoizedState = sm.bind(null, Z);
    },
    useEffectEvent: function(l) {
      var t = Jl(), a = { impl: l };
      return t.memoizedState = a, function() {
        if ((ul & 2) !== 0) throw Error(h(440));
        return a.impl.apply(void 0, arguments);
      };
    }
  }, tc = {
    readContext: Xl,
    use: ae,
    useCallback: I0,
    useContext: Xl,
    useEffect: $i,
    useImperativeHandle: F0,
    useInsertionEffect: W0,
    useLayoutEffect: $0,
    useMemo: P0,
    useReducer: ue,
    useRef: K0,
    useState: function() {
      return ue(Zt);
    },
    useDebugValue: ki,
    useDeferredValue: function(l, t) {
      return lv(Ol(), cl.memoizedState, l, t);
    },
    useTransition: function() {
      var l = ue(Zt)[0], t = Ol().memoizedState;
      return [typeof l == "boolean" ? l : ku(l), t];
    },
    useSyncExternalStore: N0,
    useId: nv,
    useHostTransitionStatus: Pi,
    useFormState: L0,
    useActionState: L0,
    useOptimistic: function(l, t) {
      return C0(Ol(), cl, l, t);
    },
    useMemoCache: xi,
    useCacheRefresh: ev
  };
  tc.useEffectEvent = w0;
  var dv = {
    readContext: Xl,
    use: ae,
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
      var a = Ol();
      return cl === null ? Fi(a, l, t) : lv(a, cl.memoizedState, l, t);
    },
    useTransition: function() {
      var l = Ji(Zt)[0], t = Ol().memoizedState;
      return [typeof l == "boolean" ? l : ku(l), t];
    },
    useSyncExternalStore: N0,
    useId: nv,
    useHostTransitionStatus: Pi,
    useFormState: x0,
    useActionState: x0,
    useOptimistic: function(l, t) {
      var a = Ol();
      return cl !== null ? C0(a, cl, l, t) : (a.baseState = l, [l, a.queue.dispatch]);
    },
    useMemoCache: xi,
    useCacheRefresh: ev
  };
  dv.useEffectEvent = w0;
  function ac(l, t, a, u) {
    t = l.memoizedState, a = a(u, t), a = a == null ? t : R({}, t, a), l.memoizedState = a, l.lanes === 0 && (l.updateQueue.baseState = a);
  }
  var uc = {
    enqueueSetState: function(l, t, a) {
      l = l._reactInternals;
      var u = zt(), n = Ya(u);
      n.payload = t, a != null && (n.callback = a), t = qa(l, n, u), t !== null && (lt(t, l, u), Ju(t, l, u));
    },
    enqueueReplaceState: function(l, t, a) {
      l = l._reactInternals;
      var u = zt(), n = Ya(u);
      n.tag = 1, n.payload = t, a != null && (n.callback = a), t = qa(l, n, u), t !== null && (lt(t, l, u), Ju(t, l, u));
    },
    enqueueForceUpdate: function(l, t) {
      l = l._reactInternals;
      var a = zt(), u = Ya(a);
      u.tag = 2, t != null && (u.callback = t), t = qa(l, u, a), t !== null && (lt(t, l, a), Ju(t, l, a));
    }
  };
  function mv(l, t, a, u, n, e, i) {
    return l = l.stateNode, typeof l.shouldComponentUpdate == "function" ? l.shouldComponentUpdate(u, e, i) : t.prototype && t.prototype.isPureReactComponent ? !Gu(a, u) || !Gu(n, e) : !0;
  }
  function yv(l, t, a, u) {
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
      for (var n in l) a[n] === void 0 && (a[n] = l[n]);
    }
    return a;
  }
  function gm(l) {
    Gn(l);
  }
  function Sm(l) {
    console.error(l);
  }
  function bm(l) {
    Gn(l);
  }
  function ce(l, t) {
    try {
      var a = l.onUncaughtError;
      a(t.value, { componentStack: t.stack });
    } catch (u) {
      setTimeout(function() {
        throw u;
      });
    }
  }
  function hv(l, t, a) {
    try {
      var u = l.onCaughtError;
      u(a.value, {
        componentStack: a.stack,
        errorBoundary: t.tag === 1 ? t.stateNode : null
      });
    } catch (n) {
      setTimeout(function() {
        throw n;
      });
    }
  }
  function nc(l, t, a) {
    return a = Ya(a), a.tag = 3, a.payload = { element: null }, a.callback = function() {
      ce(l, t);
    }, a;
  }
  function sv(l) {
    return l = Ya(l), l.tag = 3, l;
  }
  function ov(l, t, a, u) {
    var n = a.type.getDerivedStateFromError;
    if (typeof n == "function") {
      var e = u.value;
      l.payload = function() {
        return n(e);
      }, l.callback = function() {
        hv(t, a, u);
      };
    }
    var i = a.stateNode;
    i !== null && typeof i.componentDidCatch == "function" && (l.callback = function() {
      hv(t, a, u), typeof n != "function" && (ma === null ? ma = /* @__PURE__ */ new Set([this]) : ma.add(this));
      var c = u.stack;
      this.componentDidCatch(u.value, { componentStack: c !== null ? c : "" });
    });
  }
  function rm(l, t, a, u, n) {
    if (a.flags |= 32768, u !== null && typeof u == "object" && typeof u.then == "function") {
      if (t = a.alternate, t !== null && nu(t, a, n, !0), a = ft.current, a !== null) {
        switch (a.tag) {
          case 31:
          case 13:
            return rt === null ? re() : a.alternate === null && rl === 0 && (rl = 3), a.flags &= -257, a.flags |= 65536, a.lanes = n, u === Wn ? a.flags |= 16384 : (t = a.updateQueue, t === null ? a.updateQueue = /* @__PURE__ */ new Set([u]) : t.add(u), Nc(l, u, n)), !1;
          case 22:
            return a.flags |= 65536, u === Wn ? a.flags |= 16384 : (t = a.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([u])
            }, a.updateQueue = t) : (a = t.retryQueue, a === null ? t.retryQueue = /* @__PURE__ */ new Set([u]) : a.add(u)), Nc(l, u, n)), !1;
        }
        throw Error(h(435, a.tag));
      }
      return Nc(l, u, n), re(), !1;
    }
    if (I) return t = ft.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = n, u !== Ti && (l = Error(h(422), { cause: u }), Zu(ot(l, a)))) : (u !== Ti && (t = Error(h(423), { cause: u }), Zu(ot(t, a))), l = l.current.alternate, l.flags |= 65536, n &= -n, l.lanes |= n, u = ot(u, a), n = nc(l.stateNode, u, n), Bi(l, n), rl !== 4 && (rl = 2)), !1;
    var e = Error(h(520), { cause: u });
    if (e = ot(e, a), cn === null ? cn = [e] : cn.push(e), rl !== 4 && (rl = 2), t === null) return !0;
    u = ot(u, a), a = t;
    do {
      switch (a.tag) {
        case 3:
          return a.flags |= 65536, l = n & -n, a.lanes |= l, l = nc(a.stateNode, u, l), Bi(a, l), !1;
        case 1:
          if (t = a.type, e = a.stateNode, (a.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || e !== null && typeof e.componentDidCatch == "function" && (ma === null || !ma.has(e)))) return a.flags |= 65536, n &= -n, a.lanes |= n, n = sv(n), ov(n, l, a, u), Bi(a, n), !1;
      }
      a = a.return;
    } while (a !== null);
    return !1;
  }
  var ec = Error(h(461)), Nl = !1;
  function Ql(l, t, a, u) {
    t.child = l === null ? E0(t, null, a, u) : Ca(t, l.child, a, u);
  }
  function gv(l, t, a, u, n) {
    a = a.render;
    var e = t.ref;
    if ("ref" in u) {
      var i = {};
      for (var c in u) c !== "ref" && (i[c] = u[c]);
    } else i = u;
    return Ha(t), u = Qi(l, t, a, i, e, n), c = Zi(), l !== null && !Nl ? (Li(l, t, n), Lt(l, t, n)) : (I && c && _i(t), t.flags |= 1, Ql(l, t, u, n), t.child);
  }
  function Sv(l, t, a, u, n) {
    if (l === null) {
      var e = a.type;
      return typeof e == "function" && !bi(e) && e.defaultProps === void 0 && a.compare === null ? (t.tag = 15, t.type = e, bv(l, t, e, u, n)) : (l = Ln(a.type, null, u, t, t.mode, n), l.ref = t.ref, l.return = t, t.child = l);
    }
    if (e = l.child, !hc(l, n)) {
      var i = e.memoizedProps;
      if (a = a.compare, a = a !== null ? a : Gu, a(i, u) && l.ref === t.ref) return Lt(l, t, n);
    }
    return t.flags |= 1, l = Yt(e, u), l.ref = t.ref, l.return = t, t.child = l;
  }
  function bv(l, t, a, u, n) {
    if (l !== null) {
      var e = l.memoizedProps;
      if (Gu(e, u) && l.ref === t.ref) if (Nl = !1, t.pendingProps = u = e, hc(l, n)) (l.flags & 131072) !== 0 && (Nl = !0);
      else return t.lanes = l.lanes, Lt(l, t, n);
    }
    return ic(l, t, a, u, n);
  }
  function rv(l, t, a, u) {
    var n = u.children, e = l !== null ? l.memoizedState : null;
    if (l === null && t.stateNode === null && (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), u.mode === "hidden") {
      if ((t.flags & 128) !== 0) {
        if (e = e !== null ? e.baseLanes | a : a, l !== null) {
          for (u = t.child = l.child, n = 0; u !== null; ) n = n | u.lanes | u.childLanes, u = u.sibling;
          u = n & ~e;
        } else u = 0, t.child = null;
        return zv(l, t, e, a, u);
      }
      if ((a & 536870912) !== 0) t.memoizedState = {
        baseLanes: 0,
        cachePool: null
      }, l !== null && Jn(t, e !== null ? e.cachePool : null), e !== null ? O0(t, e) : Yi(), M0(t);
      else return u = t.lanes = 536870912, zv(l, t, e !== null ? e.baseLanes | a : a, a, u);
    } else e !== null ? (Jn(t, e.cachePool), O0(t, e), ca(t), t.memoizedState = null) : (l !== null && Jn(t, null), Yi(), ca(t));
    return Ql(l, t, n, a), t.child;
  }
  function Pu(l, t) {
    return l !== null && l.tag === 22 || t.stateNode !== null || (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), t.sibling;
  }
  function zv(l, t, a, u, n) {
    var e = pi();
    return e = e === null ? null : {
      parent: Dl._currentValue,
      pool: e
    }, t.memoizedState = {
      baseLanes: a,
      cachePool: e
    }, l !== null && Jn(t, null), Yi(), M0(t), l !== null && nu(l, t, u, !0), t.childLanes = n, null;
  }
  function fe(l, t) {
    return t = de({
      mode: t.mode,
      children: t.children
    }, l.mode), t.ref = l.ref, l.child = t, t.return = l, t;
  }
  function _v(l, t, a) {
    return Ca(t, l.child, null, a), l = fe(t, t.pendingProps), l.flags |= 2, vt(t), t.memoizedState = null, l;
  }
  function zm(l, t, a) {
    var u = t.pendingProps, n = (t.flags & 128) !== 0;
    if (t.flags &= -129, l === null) {
      if (I) {
        if (u.mode === "hidden") return l = fe(t, u), t.lanes = 536870912, Pu(null, l);
        if (Gi(t), (l = yl) ? (l = B1(l, bt), l = l !== null && l.data === "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: ta !== null ? {
            id: Ut,
            overflow: Nt
          } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = c0(l), a.return = t, t.child = a, Gl = t, yl = null)) : l = null, l === null) throw ua(t);
        return t.lanes = 536870912, null;
      }
      return fe(t, u);
    }
    var e = l.memoizedState;
    if (e !== null) {
      var i = e.dehydrated;
      if (Gi(t), n) if (t.flags & 256) t.flags &= -257, t = _v(l, t, a);
      else if (t.memoizedState !== null) t.child = l.child, t.flags |= 128, t = null;
      else throw Error(h(558));
      else if (Nl || nu(l, t, a, !1), n = (a & l.childLanes) !== 0, Nl || n) {
        if (u = ml, u !== null && (i = hf(u, a), i !== 0 && i !== e.retryLane)) throw e.retryLane = i, Da(l, i), lt(u, l, i), ec;
        re(), t = _v(l, t, a);
      } else l = e.treeContext, yl = _t(i.nextSibling), Gl = t, I = !0, aa = null, bt = !1, l !== null && d0(t, l), t = fe(t, u), t.flags |= 4096;
      return t;
    }
    return l = Yt(l.child, {
      mode: u.mode,
      children: u.children
    }), l.ref = t.ref, t.child = l, l.return = t, l;
  }
  function ve(l, t) {
    var a = t.ref;
    if (a === null) l !== null && l.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof a != "function" && typeof a != "object") throw Error(h(284));
      (l === null || l.ref !== a) && (t.flags |= 4194816);
    }
  }
  function ic(l, t, a, u, n) {
    return Ha(t), a = Qi(l, t, a, u, void 0, n), u = Zi(), l !== null && !Nl ? (Li(l, t, n), Lt(l, t, n)) : (I && u && _i(t), t.flags |= 1, Ql(l, t, a, n), t.child);
  }
  function Ev(l, t, a, u, n, e) {
    return Ha(t), t.updateQueue = null, a = U0(t, u, a, n), D0(l), u = Zi(), l !== null && !Nl ? (Li(l, t, e), Lt(l, t, e)) : (I && u && _i(t), t.flags |= 1, Ql(l, t, a, e), t.child);
  }
  function Tv(l, t, a, u, n) {
    if (Ha(t), t.stateNode === null) {
      var e = lu, i = a.contextType;
      typeof i == "object" && i !== null && (e = Xl(i)), e = new a(u, e), t.memoizedState = e.state !== null && e.state !== void 0 ? e.state : null, e.updater = uc, t.stateNode = e, e._reactInternals = t, e = t.stateNode, e.props = u, e.state = t.memoizedState, e.refs = {}, ji(t), i = a.contextType, e.context = typeof i == "object" && i !== null ? Xl(i) : lu, e.state = t.memoizedState, i = a.getDerivedStateFromProps, typeof i == "function" && (ac(t, a, i, u), e.state = t.memoizedState), typeof a.getDerivedStateFromProps == "function" || typeof e.getSnapshotBeforeUpdate == "function" || typeof e.UNSAFE_componentWillMount != "function" && typeof e.componentWillMount != "function" || (i = e.state, typeof e.componentWillMount == "function" && e.componentWillMount(), typeof e.UNSAFE_componentWillMount == "function" && e.UNSAFE_componentWillMount(), i !== e.state && uc.enqueueReplaceState(e, e.state, null), Wu(t, u, e, n), wu(), e.state = t.memoizedState), typeof e.componentDidMount == "function" && (t.flags |= 4194308), u = !0;
    } else if (l === null) {
      e = t.stateNode;
      var c = t.memoizedProps, f = Xa(a, c);
      e.props = f;
      var o = e.context, b = a.contextType;
      i = lu, typeof b == "object" && b !== null && (i = Xl(b));
      var z = a.getDerivedStateFromProps;
      b = typeof z == "function" || typeof e.getSnapshotBeforeUpdate == "function", c = t.pendingProps !== c, b || typeof e.UNSAFE_componentWillReceiveProps != "function" && typeof e.componentWillReceiveProps != "function" || (c || o !== i) && yv(t, e, u, i), ea = !1;
      var g = t.memoizedState;
      e.state = g, Wu(t, u, e, n), wu(), o = t.memoizedState, c || g !== o || ea ? (typeof z == "function" && (ac(t, a, z, u), o = t.memoizedState), (f = ea || mv(t, a, f, u, g, o, i)) ? (b || typeof e.UNSAFE_componentWillMount != "function" && typeof e.componentWillMount != "function" || (typeof e.componentWillMount == "function" && e.componentWillMount(), typeof e.UNSAFE_componentWillMount == "function" && e.UNSAFE_componentWillMount()), typeof e.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof e.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = u, t.memoizedState = o), e.props = u, e.state = o, e.context = i, u = f) : (typeof e.componentDidMount == "function" && (t.flags |= 4194308), u = !1);
    } else {
      e = t.stateNode, Ri(l, t), i = t.memoizedProps, b = Xa(a, i), e.props = b, z = t.pendingProps, g = e.context, o = a.contextType, f = lu, typeof o == "object" && o !== null && (f = Xl(o)), c = a.getDerivedStateFromProps, (o = typeof c == "function" || typeof e.getSnapshotBeforeUpdate == "function") || typeof e.UNSAFE_componentWillReceiveProps != "function" && typeof e.componentWillReceiveProps != "function" || (i !== z || g !== f) && yv(t, e, u, f), ea = !1, g = t.memoizedState, e.state = g, Wu(t, u, e, n), wu();
      var S = t.memoizedState;
      i !== z || g !== S || ea || l !== null && l.dependencies !== null && xn(l.dependencies) ? (typeof c == "function" && (ac(t, a, c, u), S = t.memoizedState), (b = ea || mv(t, a, b, u, g, S, f) || l !== null && l.dependencies !== null && xn(l.dependencies)) ? (o || typeof e.UNSAFE_componentWillUpdate != "function" && typeof e.componentWillUpdate != "function" || (typeof e.componentWillUpdate == "function" && e.componentWillUpdate(u, S, f), typeof e.UNSAFE_componentWillUpdate == "function" && e.UNSAFE_componentWillUpdate(u, S, f)), typeof e.componentDidUpdate == "function" && (t.flags |= 4), typeof e.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof e.componentDidUpdate != "function" || i === l.memoizedProps && g === l.memoizedState || (t.flags |= 4), typeof e.getSnapshotBeforeUpdate != "function" || i === l.memoizedProps && g === l.memoizedState || (t.flags |= 1024), t.memoizedProps = u, t.memoizedState = S), e.props = u, e.state = S, e.context = f, u = b) : (typeof e.componentDidUpdate != "function" || i === l.memoizedProps && g === l.memoizedState || (t.flags |= 4), typeof e.getSnapshotBeforeUpdate != "function" || i === l.memoizedProps && g === l.memoizedState || (t.flags |= 1024), u = !1);
    }
    return e = u, ve(l, t), u = (t.flags & 128) !== 0, e || u ? (e = t.stateNode, a = u && typeof a.getDerivedStateFromError != "function" ? null : e.render(), t.flags |= 1, l !== null && u ? (t.child = Ca(t, l.child, null, n), t.child = Ca(t, null, a, n)) : Ql(l, t, a, n), t.memoizedState = e.state, l = t.child) : l = Lt(l, t, n), l;
  }
  function Av(l, t, a, u) {
    return Na(), t.flags |= 256, Ql(l, t, a, u), t.child;
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
    var u = t.pendingProps, n = !1, e = (t.flags & 128) !== 0, i;
    if ((i = e) || (i = l !== null && l.memoizedState === null ? !1 : (Al.current & 2) !== 0), i && (n = !0, t.flags &= -129), i = (t.flags & 32) !== 0, t.flags &= -33, l === null) {
      if (I) {
        if (n ? ia(t) : ca(t), (l = yl) ? (l = B1(l, bt), l = l !== null && l.data !== "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: ta !== null ? {
            id: Ut,
            overflow: Nt
          } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = c0(l), a.return = t, t.child = a, Gl = t, yl = null)) : l = null, l === null) throw ua(t);
        return xc(l) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var c = u.children;
      return u = u.fallback, n ? (ca(t), n = t.mode, c = de({
        mode: "hidden",
        children: c
      }, n), u = Ua(u, n, a, null), c.return = t, u.return = t, c.sibling = u, t.child = c, u = t.child, u.memoizedState = fc(a), u.childLanes = vc(l, i, a), t.memoizedState = cc, Pu(null, u)) : (ia(t), dc(t, c));
    }
    var f = l.memoizedState;
    if (f !== null && (c = f.dehydrated, c !== null)) {
      if (e) t.flags & 256 ? (ia(t), t.flags &= -257, t = mc(l, t, a)) : t.memoizedState !== null ? (ca(t), t.child = l.child, t.flags |= 128, t = null) : (ca(t), c = u.fallback, n = t.mode, u = de({
        mode: "visible",
        children: u.children
      }, n), c = Ua(c, n, a, null), c.flags |= 2, u.return = t, c.return = t, u.sibling = c, t.child = u, Ca(t, l.child, null, a), u = t.child, u.memoizedState = fc(a), u.childLanes = vc(l, i, a), t.memoizedState = cc, t = Pu(null, u));
      else if (ia(t), xc(c)) {
        if (i = c.nextSibling && c.nextSibling.dataset, i) var o = i.dgst;
        i = o, u = Error(h(419)), u.stack = "", u.digest = i, Zu({
          value: u,
          source: null,
          stack: null
        }), t = mc(l, t, a);
      } else if (Nl || nu(l, t, a, !1), i = (a & l.childLanes) !== 0, Nl || i) {
        if (i = ml, i !== null && (u = hf(i, a), u !== 0 && u !== f.retryLane)) throw f.retryLane = u, Da(l, u), lt(i, l, u), ec;
        Vc(c) || re(), t = mc(l, t, a);
      } else Vc(c) ? (t.flags |= 192, t.child = l.child, t = null) : (l = f.treeContext, yl = _t(c.nextSibling), Gl = t, I = !0, aa = null, bt = !1, l !== null && d0(t, l), t = dc(t, u.children), t.flags |= 4096);
      return t;
    }
    return n ? (ca(t), c = u.fallback, n = t.mode, f = l.child, o = f.sibling, u = Yt(f, {
      mode: "hidden",
      children: u.children
    }), u.subtreeFlags = f.subtreeFlags & 65011712, o !== null ? c = Yt(o, c) : (c = Ua(c, n, a, null), c.flags |= 2), c.return = t, u.return = t, u.sibling = c, t.child = u, Pu(null, u), u = t.child, c = l.child.memoizedState, c === null ? c = fc(a) : (n = c.cachePool, n !== null ? (f = Dl._currentValue, n = n.parent !== f ? {
      parent: f,
      pool: f
    } : n) : n = g0(), c = {
      baseLanes: c.baseLanes | a,
      cachePool: n
    }), u.memoizedState = c, u.childLanes = vc(l, i, a), t.memoizedState = cc, Pu(l.child, u)) : (ia(t), a = l.child, l = a.sibling, a = Yt(a, {
      mode: "visible",
      children: u.children
    }), a.return = t, a.sibling = null, l !== null && (i = t.deletions, i === null ? (t.deletions = [l], t.flags |= 16) : i.push(l)), t.child = a, t.memoizedState = null, a);
  }
  function dc(l, t) {
    return t = de({
      mode: "visible",
      children: t
    }, l.mode), t.return = l, l.child = t;
  }
  function de(l, t) {
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
  function yc(l, t, a, u, n, e) {
    var i = l.memoizedState;
    i === null ? l.memoizedState = {
      isBackwards: t,
      rendering: null,
      renderingStartTime: 0,
      last: u,
      tail: a,
      tailMode: n,
      treeForkCount: e
    } : (i.isBackwards = t, i.rendering = null, i.renderingStartTime = 0, i.last = u, i.tail = a, i.tailMode = n, i.treeForkCount = e);
  }
  function Dv(l, t, a) {
    var u = t.pendingProps, n = u.revealOrder, e = u.tail;
    u = u.children;
    var i = Al.current, c = (i & 2) !== 0;
    if (c ? (i = i & 1 | 2, t.flags |= 128) : i &= 1, D(Al, i), Ql(l, t, u, a), u = I ? Qu : 0, !c && l !== null && (l.flags & 128) !== 0) l: for (l = t.child; l !== null; ) {
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
    switch (n) {
      case "forwards":
        for (a = t.child, n = null; a !== null; ) l = a.alternate, l !== null && In(l) === null && (n = a), a = a.sibling;
        a = n, a === null ? (n = t.child, t.child = null) : (n = a.sibling, a.sibling = null), yc(t, !1, n, a, e, u);
        break;
      case "backwards":
      case "unstable_legacy-backwards":
        for (a = null, n = t.child, t.child = null; n !== null; ) {
          if (l = n.alternate, l !== null && In(l) === null) {
            t.child = n;
            break;
          }
          l = n.sibling, n.sibling = a, a = n, n = l;
        }
        yc(t, !0, a, null, e, u);
        break;
      case "together":
        yc(t, !1, null, null, void 0, u);
        break;
      default:
        t.memoizedState = null;
    }
    return t.child;
  }
  function Lt(l, t, a) {
    if (l !== null && (t.dependencies = l.dependencies), da |= t.lanes, (a & t.childLanes) === 0) if (l !== null) {
      if (nu(l, t, a, !1), (a & t.childLanes) === 0) return null;
    } else return null;
    if (l !== null && t.child !== l.child) throw Error(h(153));
    if (t.child !== null) {
      for (l = t.child, a = Yt(l, l.pendingProps), t.child = a, a.return = t; l.sibling !== null; ) l = l.sibling, a = a.sibling = Yt(l, l.pendingProps), a.return = t;
      a.sibling = null;
    }
    return t.child;
  }
  function hc(l, t) {
    return (l.lanes & t) !== 0 ? !0 : (l = l.dependencies, !!(l !== null && xn(l)));
  }
  function _m(l, t, a) {
    switch (t.tag) {
      case 3:
        Kl(t, t.stateNode.containerInfo), na(t, Dl, l.memoizedState.cache), Na();
        break;
      case 27:
      case 5:
        Ou(t);
        break;
      case 4:
        Kl(t, t.stateNode.containerInfo);
        break;
      case 10:
        na(t, t.type, t.memoizedProps.value);
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
        var n = (l.flags & 128) !== 0;
        if (u = (a & t.childLanes) !== 0, u || (nu(l, t, a, !1), u = (a & t.childLanes) !== 0), n) {
          if (u) return Dv(l, t, a);
          t.flags |= 128;
        }
        if (n = t.memoizedState, n !== null && (n.rendering = null, n.tail = null, n.lastEffect = null), D(Al, Al.current), u) break;
        return null;
      case 22:
        return t.lanes = 0, rv(l, t, a, t.pendingProps);
      case 24:
        na(t, Dl, l.memoizedState.cache);
    }
    return Lt(l, t, a);
  }
  function Uv(l, t, a) {
    if (l !== null) if (l.memoizedProps !== t.pendingProps) Nl = !0;
    else {
      if (!hc(l, a) && (t.flags & 128) === 0) return Nl = !1, _m(l, t, a);
      Nl = (l.flags & 131072) !== 0;
    }
    else Nl = !1, I && (t.flags & 1048576) !== 0 && v0(t, Qu, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        l: {
          var u = t.pendingProps;
          if (l = Ra(t.elementType), t.type = l, typeof l == "function") bi(l) ? (u = Xa(l, u), t.tag = 1, t = Tv(null, t, l, u, a)) : (t.tag = 0, t = ic(null, t, l, u, a));
          else {
            if (l != null) {
              var n = l.$$typeof;
              if (n === wl) {
                t.tag = 11, t = gv(null, t, l, u, a);
                break l;
              } else if (n === P) {
                t.tag = 14, t = Sv(null, t, l, u, a);
                break l;
              }
            }
            throw t = gl(l) || l, Error(h(306, t, ""));
          }
        }
        return t;
      case 0:
        return ic(l, t, t.type, t.pendingProps, a);
      case 1:
        return u = t.type, n = Xa(u, t.pendingProps), Tv(l, t, u, n, a);
      case 3:
        l: {
          if (Kl(t, t.stateNode.containerInfo), l === null) throw Error(h(387));
          u = t.pendingProps;
          var e = t.memoizedState;
          n = e.element, Ri(l, t), Wu(t, u, null, a);
          var i = t.memoizedState;
          if (u = i.cache, na(t, Dl, u), u !== e.cache && Di(t, [Dl], a, !0), wu(), u = i.element, e.isDehydrated) if (e = {
            element: u,
            isDehydrated: !1,
            cache: i.cache
          }, t.updateQueue.baseState = e, t.memoizedState = e, t.flags & 256) {
            t = Av(l, t, u, a);
            break l;
          } else if (u !== n) {
            n = ot(Error(h(424)), t), Zu(n), t = Av(l, t, u, a);
            break l;
          } else {
            switch (l = t.stateNode.containerInfo, l.nodeType) {
              case 9:
                l = l.body;
                break;
              default:
                l = l.nodeName === "HTML" ? l.ownerDocument.body : l;
            }
            for (yl = _t(l.firstChild), Gl = t, I = !0, aa = null, bt = !0, a = E0(t, null, u, a), t.child = a; a; ) a.flags = a.flags & -3 | 4096, a = a.sibling;
          }
          else {
            if (Na(), u === n) {
              t = Lt(l, t, a);
              break l;
            }
            Ql(l, t, u, a);
          }
          t = t.child;
        }
        return t;
      case 26:
        return ve(l, t), l === null ? (a = Q1(t.type, null, t.pendingProps, null)) ? t.memoizedState = a : I || (a = t.type, l = t.pendingProps, u = Me(J.current).createElement(a), u[ql] = t, u[Wl] = l, Zl(u, a, l), Cl(u), t.stateNode = u) : t.memoizedState = Q1(t.type, l.memoizedProps, t.pendingProps, l.memoizedState), null;
      case 27:
        return Ou(t), l === null && I && (u = t.stateNode = q1(t.type, t.pendingProps, J.current), Gl = t, bt = !0, n = yl, oa(t.type) ? (Kc = n, yl = _t(u.firstChild)) : yl = n), Ql(l, t, t.pendingProps.children, a), ve(l, t), l === null && (t.flags |= 4194304), t.child;
      case 5:
        return l === null && I && ((n = u = yl) && (u = $m(u, t.type, t.pendingProps, bt), u !== null ? (t.stateNode = u, Gl = t, yl = _t(u.firstChild), bt = !1, n = !0) : n = !1), n || ua(t)), Ou(t), n = t.type, e = t.pendingProps, i = l !== null ? l.memoizedProps : null, u = e.children, Qc(n, e) ? u = null : i !== null && Qc(n, i) && (t.flags |= 32), t.memoizedState !== null && (n = Qi(l, t, vm, null, null, a), on._currentValue = n), ve(l, t), Ql(l, t, u, a), t.child;
      case 6:
        return l === null && I && ((l = a = yl) && (a = km(a, t.pendingProps, bt), a !== null ? (t.stateNode = a, Gl = t, yl = null, l = !0) : l = !1), l || ua(t)), null;
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
        return u = t.pendingProps, na(t, t.type, u.value), Ql(l, t, u.children, a), t.child;
      case 9:
        return n = t.type._context, u = t.pendingProps.children, Ha(t), n = Xl(n), u = u(n), t.flags |= 1, Ql(l, t, u, a), t.child;
      case 14:
        return Sv(l, t, t.type, t.pendingProps, a);
      case 15:
        return bv(l, t, t.type, t.pendingProps, a);
      case 19:
        return Dv(l, t, a);
      case 31:
        return zm(l, t, a);
      case 22:
        return rv(l, t, a, t.pendingProps);
      case 24:
        return Ha(t), u = Xl(Dl), l === null ? (n = pi(), n === null && (n = ml, e = Ui(), n.pooledCache = e, e.refCount++, e !== null && (n.pooledCacheLanes |= a), n = e), t.memoizedState = {
          parent: u,
          cache: n
        }, ji(t), na(t, Dl, n)) : ((l.lanes & a) !== 0 && (Ri(l, t), Wu(t, null, null, a), wu()), n = l.memoizedState, e = t.memoizedState, n.parent !== u ? (n = {
          parent: u,
          cache: u
        }, t.memoizedState = n, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = n), na(t, Dl, u)) : (u = e.cache, na(t, Dl, u), u !== n.cache && Di(t, [Dl], a, !0))), Ql(l, t, t.pendingProps.children, a), t.child;
      case 29:
        throw t.pendingProps;
    }
    throw Error(h(156, t.tag));
  }
  function Vt(l) {
    l.flags |= 4;
  }
  function sc(l, t, a, u, n) {
    if ((t = (l.mode & 32) !== 0) && (t = !1), t) {
      if (l.flags |= 16777216, (n & 335544128) === n) if (l.stateNode.complete) l.flags |= 8192;
      else if (t1()) l.flags |= 8192;
      else throw Ba = Wn, Hi;
    } else l.flags &= -16777217;
  }
  function Nv(l, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0) l.flags &= -16777217;
    else if (l.flags |= 16777216, !K1(t)) if (t1()) l.flags |= 8192;
    else throw Ba = Wn, Hi;
  }
  function me(l, t) {
    t !== null && (l.flags |= 4), l.flags & 16384 && (t = l.tag !== 22 ? df() : 536870912, l.lanes |= t, gu |= t);
  }
  function ln(l, t) {
    if (!I) switch (l.tailMode) {
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
    if (t) for (var n = l.child; n !== null; ) a |= n.lanes | n.childLanes, u |= n.subtreeFlags & 65011712, u |= n.flags & 65011712, n.return = l, n = n.sibling;
    else for (n = l.child; n !== null; ) a |= n.lanes | n.childLanes, u |= n.subtreeFlags, u |= n.flags, n.return = l, n = n.sibling;
    return l.subtreeFlags |= u, l.childLanes = a, t;
  }
  function Em(l, t, a) {
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
        return a = t.stateNode, u = null, l !== null && (u = l.memoizedState.cache), t.memoizedState.cache !== u && (t.flags |= 2048), Xt(Dl), Tl(), a.pendingContext && (a.context = a.pendingContext, a.pendingContext = null), (l === null || l.child === null) && (uu(t) ? Vt(t) : l === null || l.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, Ai())), hl(t), null;
      case 26:
        var n = t.type, e = t.memoizedState;
        return l === null ? (Vt(t), e !== null ? (hl(t), Nv(t, e)) : (hl(t), sc(t, n, null, u, a))) : e ? e !== l.memoizedState ? (Vt(t), hl(t), Nv(t, e)) : (hl(t), t.flags &= -16777217) : (l = l.memoizedProps, l !== u && Vt(t), hl(t), sc(t, n, l, u, a)), null;
      case 27:
        if (_n(t), a = J.current, n = t.type, l !== null && t.stateNode != null) l.memoizedProps !== u && Vt(t);
        else {
          if (!u) {
            if (t.stateNode === null) throw Error(h(166));
            return hl(t), null;
          }
          l = B.current, uu(t) ? m0(t, l) : (l = q1(n, u, a), t.stateNode = l, Vt(t));
        }
        return hl(t), null;
      case 5:
        if (_n(t), n = t.type, l !== null && t.stateNode != null) l.memoizedProps !== u && Vt(t);
        else {
          if (!u) {
            if (t.stateNode === null) throw Error(h(166));
            return hl(t), null;
          }
          if (e = B.current, uu(t)) m0(t, e);
          else {
            var i = Me(J.current);
            switch (e) {
              case 1:
                e = i.createElementNS("http://www.w3.org/2000/svg", n);
                break;
              case 2:
                e = i.createElementNS("http://www.w3.org/1998/Math/MathML", n);
                break;
              default:
                switch (n) {
                  case "svg":
                    e = i.createElementNS("http://www.w3.org/2000/svg", n);
                    break;
                  case "math":
                    e = i.createElementNS("http://www.w3.org/1998/Math/MathML", n);
                    break;
                  case "script":
                    e = i.createElement("div"), e.innerHTML = "<script><\/script>", e = e.removeChild(e.firstChild);
                    break;
                  case "select":
                    e = typeof u.is == "string" ? i.createElement("select", { is: u.is }) : i.createElement("select"), u.multiple ? e.multiple = !0 : u.size && (e.size = u.size);
                    break;
                  default:
                    e = typeof u.is == "string" ? i.createElement(n, { is: u.is }) : i.createElement(n);
                }
            }
            e[ql] = t, e[Wl] = u;
            l: for (i = t.child; i !== null; ) {
              if (i.tag === 5 || i.tag === 6) e.appendChild(i.stateNode);
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
            t.stateNode = e;
            l: switch (Zl(e, n, u), n) {
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
        return hl(t), sc(t, t.type, l === null ? null : l.memoizedProps, t.pendingProps, a), null;
      case 6:
        if (l && t.stateNode != null) l.memoizedProps !== u && Vt(t);
        else {
          if (typeof u != "string" && t.stateNode === null) throw Error(h(166));
          if (l = J.current, uu(t)) {
            if (l = t.stateNode, a = t.memoizedProps, u = null, n = Gl, n !== null) switch (n.tag) {
              case 27:
              case 5:
                u = n.memoizedProps;
            }
            l[ql] = t, l = !!(l.nodeValue === a || u !== null && u.suppressHydrationWarning === !0 || M1(l.nodeValue, a)), l || ua(t, !0);
          } else l = Me(l).createTextNode(u), l[ql] = t, t.stateNode = l;
        }
        return hl(t), null;
      case 31:
        if (a = t.memoizedState, l === null || l.memoizedState !== null) {
          if (u = uu(t), a !== null) {
            if (l === null) {
              if (!u) throw Error(h(318));
              if (l = t.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(h(557));
              l[ql] = t;
            } else Na(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            hl(t), l = !1;
          } else a = Ai(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = a), l = !0;
          if (!l)
            return t.flags & 256 ? (vt(t), t) : (vt(t), null);
          if ((t.flags & 128) !== 0) throw Error(h(558));
        }
        return hl(t), null;
      case 13:
        if (u = t.memoizedState, l === null || l.memoizedState !== null && l.memoizedState.dehydrated !== null) {
          if (n = uu(t), u !== null && u.dehydrated !== null) {
            if (l === null) {
              if (!n) throw Error(h(318));
              if (n = t.memoizedState, n = n !== null ? n.dehydrated : null, !n) throw Error(h(317));
              n[ql] = t;
            } else Na(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            hl(t), n = !1;
          } else n = Ai(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = n), n = !0;
          if (!n)
            return t.flags & 256 ? (vt(t), t) : (vt(t), null);
        }
        return vt(t), (t.flags & 128) !== 0 ? (t.lanes = a, t) : (a = u !== null, l = l !== null && l.memoizedState !== null, a && (u = t.child, n = null, u.alternate !== null && u.alternate.memoizedState !== null && u.alternate.memoizedState.cachePool !== null && (n = u.alternate.memoizedState.cachePool.pool), e = null, u.memoizedState !== null && u.memoizedState.cachePool !== null && (e = u.memoizedState.cachePool.pool), e !== n && (u.flags |= 2048)), a !== l && a && (t.child.flags |= 8192), me(t, t.updateQueue), hl(t), null);
      case 4:
        return Tl(), l === null && E1(t.stateNode.containerInfo), hl(t), null;
      case 10:
        return Xt(t.type), hl(t), null;
      case 19:
        if (_(Al), u = t.memoizedState, u === null) return hl(t), null;
        if (n = (t.flags & 128) !== 0, e = u.rendering, e === null) if (n) ln(u, !1);
        else {
          if (rl !== 0 || l !== null && (l.flags & 128) !== 0) for (l = t.child; l !== null; ) {
            if (e = In(l), e !== null) {
              for (t.flags |= 128, ln(u, !1), l = e.updateQueue, t.updateQueue = l, me(t, l), t.subtreeFlags = 0, l = a, a = t.child; a !== null; ) i0(a, l), a = a.sibling;
              return D(Al, Al.current & 1 | 2), I && qt(t, u.treeForkCount), t.child;
            }
            l = l.sibling;
          }
          u.tail !== null && ut() > ge && (t.flags |= 128, n = !0, ln(u, !1), t.lanes = 4194304);
        }
        else {
          if (!n) if (l = In(e), l !== null) {
            if (t.flags |= 128, n = !0, l = l.updateQueue, t.updateQueue = l, me(t, l), ln(u, !0), u.tail === null && u.tailMode === "hidden" && !e.alternate && !I) return hl(t), null;
          } else 2 * ut() - u.renderingStartTime > ge && a !== 536870912 && (t.flags |= 128, n = !0, ln(u, !1), t.lanes = 4194304);
          u.isBackwards ? (e.sibling = t.child, t.child = e) : (l = u.last, l !== null ? l.sibling = e : t.child = e, u.last = e);
        }
        return u.tail !== null ? (l = u.tail, u.rendering = l, u.tail = l.sibling, u.renderingStartTime = ut(), l.sibling = null, a = Al.current, D(Al, n ? a & 1 | 2 : a & 1), I && qt(t, u.treeForkCount), l) : (hl(t), null);
      case 22:
      case 23:
        return vt(t), qi(), u = t.memoizedState !== null, l !== null ? l.memoizedState !== null !== u && (t.flags |= 8192) : u && (t.flags |= 8192), u ? (a & 536870912) !== 0 && (t.flags & 128) === 0 && (hl(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : hl(t), a = t.updateQueue, a !== null && me(t, a.retryQueue), a = null, l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), u = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (u = t.memoizedState.cachePool.pool), u !== a && (t.flags |= 2048), l !== null && _(ja), null;
      case 24:
        return a = null, l !== null && (a = l.memoizedState.cache), t.memoizedState.cache !== a && (t.flags |= 2048), Xt(Dl), hl(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(h(156, t.tag));
  }
  function Tm(l, t) {
    switch (Ei(t), t.tag) {
      case 1:
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 3:
        return Xt(Dl), Tl(), l = t.flags, (l & 65536) !== 0 && (l & 128) === 0 ? (t.flags = l & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return _n(t), null;
      case 31:
        if (t.memoizedState !== null) {
          if (vt(t), t.alternate === null) throw Error(h(340));
          Na();
        }
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 13:
        if (vt(t), l = t.memoizedState, l !== null && l.dehydrated !== null) {
          if (t.alternate === null) throw Error(h(340));
          Na();
        }
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 19:
        return _(Al), null;
      case 4:
        return Tl(), null;
      case 10:
        return Xt(t.type), null;
      case 22:
      case 23:
        return vt(t), qi(), l !== null && _(ja), l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 24:
        return Xt(Dl), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function pv(l, t) {
    switch (Ei(t), t.tag) {
      case 3:
        Xt(Dl), Tl();
        break;
      case 26:
      case 27:
      case 5:
        _n(t);
        break;
      case 4:
        Tl();
        break;
      case 31:
        t.memoizedState !== null && vt(t);
        break;
      case 13:
        vt(t);
        break;
      case 19:
        _(Al);
        break;
      case 10:
        Xt(t.type);
        break;
      case 22:
      case 23:
        vt(t), qi(), l !== null && _(ja);
        break;
      case 24:
        Xt(Dl);
    }
  }
  function tn(l, t) {
    try {
      var a = t.updateQueue, u = a !== null ? a.lastEffect : null;
      if (u !== null) {
        var n = u.next;
        a = n;
        do {
          if ((a.tag & l) === l) {
            u = void 0;
            var e = a.create, i = a.inst;
            u = e(), i.destroy = u;
          }
          a = a.next;
        } while (a !== n);
      }
    } catch (c) {
      il(t, t.return, c);
    }
  }
  function fa(l, t, a) {
    try {
      var u = t.updateQueue, n = u !== null ? u.lastEffect : null;
      if (n !== null) {
        var e = n.next;
        u = e;
        do {
          if ((u.tag & l) === l) {
            var i = u.inst, c = i.destroy;
            if (c !== void 0) {
              i.destroy = void 0, n = t;
              var f = a, o = c;
              try {
                o();
              } catch (b) {
                il(n, f, b);
              }
            }
          }
          u = u.next;
        } while (u !== e);
      }
    } catch (b) {
      il(t, t.return, b);
    }
  }
  function Hv(l) {
    var t = l.updateQueue;
    if (t !== null) {
      var a = l.stateNode;
      try {
        A0(t, a);
      } catch (u) {
        il(l, l.return, u);
      }
    }
  }
  function jv(l, t, a) {
    a.props = Xa(l.type, l.memoizedProps), a.state = l.memoizedState;
    try {
      a.componentWillUnmount();
    } catch (u) {
      il(l, t, u);
    }
  }
  function an(l, t) {
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
    } catch (n) {
      il(l, t, n);
    }
  }
  function pt(l, t) {
    var a = l.ref, u = l.refCleanup;
    if (a !== null) if (typeof u == "function") try {
      u();
    } catch (n) {
      il(l, t, n);
    } finally {
      l.refCleanup = null, l = l.alternate, l != null && (l.refCleanup = null);
    }
    else if (typeof a == "function") try {
      a(null);
    } catch (n) {
      il(l, t, n);
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
    } catch (n) {
      il(l, l.return, n);
    }
  }
  function oc(l, t, a) {
    try {
      var u = l.stateNode;
      Vm(u, l.type, a, t), u[Wl] = t;
    } catch (n) {
      il(l, l.return, n);
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
  function ye(l, t, a) {
    var u = l.tag;
    if (u === 5 || u === 6) l = l.stateNode, t ? a.insertBefore(l, t) : a.appendChild(l);
    else if (u !== 4 && (u === 27 && oa(l.type) && (a = l.stateNode), l = l.child, l !== null)) for (ye(l, t, a), l = l.sibling; l !== null; ) ye(l, t, a), l = l.sibling;
  }
  function Cv(l) {
    var t = l.stateNode, a = l.memoizedProps;
    try {
      for (var u = l.type, n = t.attributes; n.length; ) t.removeAttributeNode(n[0]);
      Zl(t, u, a), t[ql] = l, t[Wl] = a;
    } catch (e) {
      il(l, l.return, e);
    }
  }
  var xt = !1, pl = !1, bc = !1, Yv = typeof WeakSet == "function" ? WeakSet : Set, Yl = null;
  function Am(l, t) {
    if (l = l.containerInfo, Gc = Re, l = Ff(l), mi(l)) {
      if ("selectionStart" in l) var a = {
        start: l.selectionStart,
        end: l.selectionEnd
      };
      else l: {
        a = (a = l.ownerDocument) && a.defaultView || window;
        var u = a.getSelection && a.getSelection();
        if (u && u.rangeCount !== 0) {
          a = u.anchorNode;
          var n = u.anchorOffset, e = u.focusNode;
          u = u.focusOffset;
          try {
            a.nodeType, e.nodeType;
          } catch {
            a = null;
            break l;
          }
          var i = 0, c = -1, f = -1, o = 0, b = 0, z = l, g = null;
          t: for (; ; ) {
            for (var S; z !== a || n !== 0 && z.nodeType !== 3 || (c = i + n), z !== e || u !== 0 && z.nodeType !== 3 || (f = i + u), z.nodeType === 3 && (i += z.nodeValue.length), (S = z.firstChild) !== null; )
              g = z, z = S;
            for (; ; ) {
              if (z === l) break t;
              if (g === a && ++o === n && (c = i), g === e && ++b === u && (f = i), (S = z.nextSibling) !== null) break;
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
    }, Re = !1, Yl = t; Yl !== null; ) if (t = Yl, l = t.child, (t.subtreeFlags & 1028) !== 0 && l !== null) l.return = t, Yl = l;
    else for (; Yl !== null; ) {
      switch (t = Yl, e = t.alternate, l = t.flags, t.tag) {
        case 0:
          if ((l & 4) !== 0 && (l = t.updateQueue, l = l !== null ? l.events : null, l !== null)) for (a = 0; a < l.length; a++) n = l[a], n.ref.impl = n.nextImpl;
          break;
        case 11:
        case 15:
          break;
        case 1:
          if ((l & 1024) !== 0 && e !== null) {
            l = void 0, a = t, n = e.memoizedProps, e = e.memoizedState, u = a.stateNode;
            try {
              var p = Xa(a.type, n);
              l = u.getSnapshotBeforeUpdate(p, e), u.__reactInternalSnapshotBeforeUpdate = l;
            } catch (G) {
              il(a, a.return, G);
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
          if ((l & 1024) !== 0) throw Error(h(163));
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
        Jt(l, a), u & 4 && tn(5, a);
        break;
      case 1:
        if (Jt(l, a), u & 4) if (l = a.stateNode, t === null) try {
          l.componentDidMount();
        } catch (i) {
          il(a, a.return, i);
        }
        else {
          var n = Xa(a.type, t.memoizedProps);
          t = t.memoizedState;
          try {
            l.componentDidUpdate(n, t, l.__reactInternalSnapshotBeforeUpdate);
          } catch (i) {
            il(a, a.return, i);
          }
        }
        u & 64 && Hv(a), u & 512 && an(a, a.return);
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
            il(a, a.return, i);
          }
        }
        break;
      case 27:
        t === null && u & 4 && Cv(a);
      case 26:
      case 5:
        Jt(l, a), t === null && u & 4 && Rv(a), u & 512 && an(a, a.return);
        break;
      case 12:
        Jt(l, a);
        break;
      case 31:
        Jt(l, a), u & 4 && Qv(l, a);
        break;
      case 13:
        Jt(l, a), u & 4 && Zv(l, a), u & 64 && (l = a.memoizedState, l !== null && (l = l.dehydrated, l !== null && (a = Rm.bind(null, a), Fm(l, a))));
        break;
      case 22:
        if (u = a.memoizedState !== null || xt, !u) {
          t = t !== null && t.memoizedState !== null || pl, n = xt;
          var e = pl;
          xt = u, (pl = t) && !e ? wt(l, a, (a.subtreeFlags & 8772) !== 0) : Jt(l, a), xt = n, pl = e;
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
    t !== null && (l.alternate = null, Gv(t)), l.child = null, l.deletions = null, l.sibling = null, l.tag === 5 && (t = l.stateNode, t !== null && We(t)), l.stateNode = null, l.return = null, l.dependencies = null, l.memoizedProps = null, l.memoizedState = null, l.pendingProps = null, l.stateNode = null, l.updateQueue = null;
  }
  var sl = null, kl = !1;
  function Kt(l, t, a) {
    for (a = a.child; a !== null; ) Xv(l, t, a), a = a.sibling;
  }
  function Xv(l, t, a) {
    if (nt && typeof nt.onCommitFiberUnmount == "function") try {
      nt.onCommitFiberUnmount(Mu, a);
    } catch {
    }
    switch (a.tag) {
      case 26:
        pl || pt(a, t), Kt(l, t, a), a.memoizedState ? a.memoizedState.count-- : a.stateNode && (a = a.stateNode, a.parentNode.removeChild(a));
        break;
      case 27:
        pl || pt(a, t);
        var u = sl, n = kl;
        oa(a.type) && (sl = a.stateNode, kl = !1), Kt(l, t, a), yn(a.stateNode), sl = u, kl = n;
        break;
      case 5:
        pl || pt(a, t);
      case 6:
        if (u = sl, n = kl, sl = null, Kt(l, t, a), sl = u, kl = n, sl !== null) if (kl) try {
          (sl.nodeType === 9 ? sl.body : sl.nodeName === "HTML" ? sl.ownerDocument.body : sl).removeChild(a.stateNode);
        } catch (e) {
          il(a, t, e);
        }
        else try {
          sl.removeChild(a.stateNode);
        } catch (e) {
          il(a, t, e);
        }
        break;
      case 18:
        sl !== null && (kl ? (l = sl, j1(l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l, a.stateNode), Au(l)) : j1(sl, a.stateNode));
        break;
      case 4:
        u = sl, n = kl, sl = a.stateNode.containerInfo, kl = !0, Kt(l, t, a), sl = u, kl = n;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        fa(2, a, t), pl || fa(4, a, t), Kt(l, t, a);
        break;
      case 1:
        pl || (pt(a, t), u = a.stateNode, typeof u.componentWillUnmount == "function" && jv(a, t, u)), Kt(l, t, a);
        break;
      case 21:
        Kt(l, t, a);
        break;
      case 22:
        pl = (u = pl) || a.memoizedState !== null, Kt(l, t, a), pl = u;
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
        il(t, t.return, a);
      }
    }
  }
  function Zv(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null && (l = l.dehydrated, l !== null)))) try {
      Au(l);
    } catch (a) {
      il(t, t.return, a);
    }
  }
  function Om(l) {
    switch (l.tag) {
      case 31:
      case 13:
      case 19:
        var t = l.stateNode;
        return t === null && (t = l.stateNode = new Yv()), t;
      case 22:
        return l = l.stateNode, t = l._retryCache, t === null && (t = l._retryCache = new Yv()), t;
      default:
        throw Error(h(435, l.tag));
    }
  }
  function he(l, t) {
    var a = Om(l);
    t.forEach(function(u) {
      if (!a.has(u)) {
        a.add(u);
        var n = Bm.bind(null, l, u);
        u.then(n, n);
      }
    });
  }
  function Fl(l, t) {
    var a = t.deletions;
    if (a !== null) for (var u = 0; u < a.length; u++) {
      var n = a[u], e = l, i = t, c = i;
      l: for (; c !== null; ) {
        switch (c.tag) {
          case 27:
            if (oa(c.type)) {
              sl = c.stateNode, kl = !1;
              break l;
            }
            break;
          case 5:
            sl = c.stateNode, kl = !1;
            break l;
          case 3:
          case 4:
            sl = c.stateNode.containerInfo, kl = !0;
            break l;
        }
        c = c.return;
      }
      if (sl === null) throw Error(h(160));
      Xv(e, i, n), sl = null, kl = !1, e = n.alternate, e !== null && (e.return = null), n.return = null;
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
        Fl(t, l), Il(l), u & 4 && (fa(3, l, l.return), tn(3, l), fa(5, l, l.return));
        break;
      case 1:
        Fl(t, l), Il(l), u & 512 && (pl || a === null || pt(a, a.return)), u & 64 && xt && (l = l.updateQueue, l !== null && (u = l.callbacks, u !== null && (a = l.shared.hiddenCallbacks, l.shared.hiddenCallbacks = a === null ? u : a.concat(u))));
        break;
      case 26:
        var n = Mt;
        if (Fl(t, l), Il(l), u & 512 && (pl || a === null || pt(a, a.return)), u & 4) {
          var e = a !== null ? a.memoizedState : null;
          if (u = l.memoizedState, a === null) if (u === null) if (l.stateNode === null) {
            l: {
              u = l.type, a = l.memoizedProps, n = n.ownerDocument || n;
              t: switch (u) {
                case "title":
                  e = n.getElementsByTagName("title")[0], (!e || e[Nu] || e[ql] || e.namespaceURI === "http://www.w3.org/2000/svg" || e.hasAttribute("itemprop")) && (e = n.createElement(u), n.head.insertBefore(e, n.querySelector("head > title"))), Zl(e, u, a), e[ql] = l, Cl(e), u = e;
                  break l;
                case "link":
                  var i = V1("link", "href", n).get(u + (a.href || ""));
                  if (i) {
                    for (var c = 0; c < i.length; c++) if (e = i[c], e.getAttribute("href") === (a.href == null || a.href === "" ? null : a.href) && e.getAttribute("rel") === (a.rel == null ? null : a.rel) && e.getAttribute("title") === (a.title == null ? null : a.title) && e.getAttribute("crossorigin") === (a.crossOrigin == null ? null : a.crossOrigin)) {
                      i.splice(c, 1);
                      break t;
                    }
                  }
                  e = n.createElement(u), Zl(e, u, a), n.head.appendChild(e);
                  break;
                case "meta":
                  if (i = V1("meta", "content", n).get(u + (a.content || ""))) {
                    for (c = 0; c < i.length; c++) if (e = i[c], e.getAttribute("content") === (a.content == null ? null : "" + a.content) && e.getAttribute("name") === (a.name == null ? null : a.name) && e.getAttribute("property") === (a.property == null ? null : a.property) && e.getAttribute("http-equiv") === (a.httpEquiv == null ? null : a.httpEquiv) && e.getAttribute("charset") === (a.charSet == null ? null : a.charSet)) {
                      i.splice(c, 1);
                      break t;
                    }
                  }
                  e = n.createElement(u), Zl(e, u, a), n.head.appendChild(e);
                  break;
                default:
                  throw Error(h(468, u));
              }
              e[ql] = l, Cl(e), u = e;
            }
            l.stateNode = u;
          } else x1(n, l.type, l.stateNode);
          else l.stateNode = L1(n, u, l.memoizedProps);
          else e !== u ? (e === null ? a.stateNode !== null && (a = a.stateNode, a.parentNode.removeChild(a)) : e.count--, u === null ? x1(n, l.type, l.stateNode) : L1(n, u, l.memoizedProps)) : u === null && l.stateNode !== null && oc(l, l.memoizedProps, a.memoizedProps);
        }
        break;
      case 27:
        Fl(t, l), Il(l), u & 512 && (pl || a === null || pt(a, a.return)), a !== null && u & 4 && oc(l, l.memoizedProps, a.memoizedProps);
        break;
      case 5:
        if (Fl(t, l), Il(l), u & 512 && (pl || a === null || pt(a, a.return)), l.flags & 32) {
          n = l.stateNode;
          try {
            wa(n, "");
          } catch (p) {
            il(l, l.return, p);
          }
        }
        u & 4 && l.stateNode != null && (n = l.memoizedProps, oc(l, n, a !== null ? a.memoizedProps : n)), u & 1024 && (bc = !0);
        break;
      case 6:
        if (Fl(t, l), Il(l), u & 4) {
          if (l.stateNode === null) throw Error(h(162));
          u = l.memoizedProps, a = l.stateNode;
          try {
            a.nodeValue = u;
          } catch (p) {
            il(l, l.return, p);
          }
        }
        break;
      case 3:
        if (Ne = null, n = Mt, Mt = De(t.containerInfo), Fl(t, l), Mt = n, Il(l), u & 4 && a !== null && a.memoizedState.isDehydrated) try {
          Au(t.containerInfo);
        } catch (p) {
          il(l, l.return, p);
        }
        bc && (bc = !1, Vv(l));
        break;
      case 4:
        u = Mt, Mt = De(l.stateNode.containerInfo), Fl(t, l), Il(l), Mt = u;
        break;
      case 12:
        Fl(t, l), Il(l);
        break;
      case 31:
        Fl(t, l), Il(l), u & 4 && (u = l.updateQueue, u !== null && (l.updateQueue = null, he(l, u)));
        break;
      case 13:
        Fl(t, l), Il(l), l.child.flags & 8192 && l.memoizedState !== null != (a !== null && a.memoizedState !== null) && (oe = ut()), u & 4 && (u = l.updateQueue, u !== null && (l.updateQueue = null, he(l, u)));
        break;
      case 22:
        n = l.memoizedState !== null;
        var f = a !== null && a.memoizedState !== null, o = xt, b = pl;
        if (xt = o || n, pl = b || f, Fl(t, l), pl = b, xt = o, Il(l), u & 8192) l: for (t = l.stateNode, t._visibility = n ? t._visibility & -2 : t._visibility | 1, n && (a === null || f || xt || pl || Qa(l)), a = null, t = l; ; ) {
          if (t.tag === 5 || t.tag === 26) {
            if (a === null) {
              f = a = t;
              try {
                if (e = f.stateNode, n) i = e.style, typeof i.setProperty == "function" ? i.setProperty("display", "none", "important") : i.display = "none";
                else {
                  c = f.stateNode;
                  var z = f.memoizedProps.style, g = z != null && z.hasOwnProperty("display") ? z.display : null;
                  c.style.display = g == null || typeof g == "boolean" ? "" : ("" + g).trim();
                }
              } catch (p) {
                il(f, f.return, p);
              }
            }
          } else if (t.tag === 6) {
            if (a === null) {
              f = t;
              try {
                f.stateNode.nodeValue = n ? "" : f.memoizedProps;
              } catch (p) {
                il(f, f.return, p);
              }
            }
          } else if (t.tag === 18) {
            if (a === null) {
              f = t;
              try {
                var S = f.stateNode;
                n ? R1(S, !0) : R1(f.stateNode, !1);
              } catch (p) {
                il(f, f.return, p);
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
        u & 4 && (u = l.updateQueue, u !== null && (a = u.retryQueue, a !== null && (u.retryQueue = null, he(l, a))));
        break;
      case 19:
        Fl(t, l), Il(l), u & 4 && (u = l.updateQueue, u !== null && (l.updateQueue = null, he(l, u)));
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
        if (a == null) throw Error(h(160));
        switch (a.tag) {
          case 27:
            var n = a.stateNode;
            ye(l, gc(l), n);
            break;
          case 5:
            var e = a.stateNode;
            a.flags & 32 && (wa(e, ""), a.flags &= -33), ye(l, gc(l), e);
            break;
          case 3:
          case 4:
            var i = a.stateNode.containerInfo;
            Sc(l, gc(l), i);
            break;
          default:
            throw Error(h(161));
        }
      } catch (c) {
        il(l, l.return, c);
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
          pt(t, t.return);
          var a = t.stateNode;
          typeof a.componentWillUnmount == "function" && jv(t, t.return, a), Qa(t);
          break;
        case 27:
          yn(t.stateNode);
        case 26:
        case 5:
          pt(t, t.return), Qa(t);
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
      var u = t.alternate, n = l, e = t, i = e.flags;
      switch (e.tag) {
        case 0:
        case 11:
        case 15:
          wt(n, e, a), tn(4, e);
          break;
        case 1:
          if (wt(n, e, a), u = e, n = u.stateNode, typeof n.componentDidMount == "function") try {
            n.componentDidMount();
          } catch (o) {
            il(u, u.return, o);
          }
          if (u = e, n = u.updateQueue, n !== null) {
            var c = u.stateNode;
            try {
              var f = n.shared.hiddenCallbacks;
              if (f !== null) for (n.shared.hiddenCallbacks = null, n = 0; n < f.length; n++) T0(f[n], c);
            } catch (o) {
              il(u, u.return, o);
            }
          }
          a && i & 64 && Hv(e), an(e, e.return);
          break;
        case 27:
          Cv(e);
        case 26:
        case 5:
          wt(n, e, a), a && u === null && i & 4 && Rv(e), an(e, e.return);
          break;
        case 12:
          wt(n, e, a);
          break;
        case 31:
          wt(n, e, a), a && i & 4 && Qv(n, e);
          break;
        case 13:
          wt(n, e, a), a && i & 4 && Zv(n, e);
          break;
        case 22:
          e.memoizedState === null && wt(n, e, a), an(e, e.return);
          break;
        case 30:
          break;
        default:
          wt(n, e, a);
      }
      t = t.sibling;
    }
  }
  function rc(l, t) {
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
    var n = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        Dt(l, t, a, u), n & 2048 && tn(9, t);
        break;
      case 1:
        Dt(l, t, a, u);
        break;
      case 3:
        Dt(l, t, a, u), n & 2048 && (l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Lu(l)));
        break;
      case 12:
        if (n & 2048) {
          Dt(l, t, a, u), l = t.stateNode;
          try {
            var e = t.memoizedProps, i = e.id, c = e.onPostCommit;
            typeof c == "function" && c(i, t.alternate === null ? "mount" : "update", l.passiveEffectDuration, -0);
          } catch (f) {
            il(t, t.return, f);
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
        e = t.stateNode, i = t.alternate, t.memoizedState !== null ? e._visibility & 2 ? Dt(l, t, a, u) : un(l, t) : e._visibility & 2 ? Dt(l, t, a, u) : (e._visibility |= 2, hu(l, t, a, u, (t.subtreeFlags & 10256) !== 0 || !1)), n & 2048 && rc(i, t);
        break;
      case 24:
        Dt(l, t, a, u), n & 2048 && zc(t.alternate, t);
        break;
      default:
        Dt(l, t, a, u);
    }
  }
  function hu(l, t, a, u, n) {
    for (n = n && ((t.subtreeFlags & 10256) !== 0 || !1), t = t.child; t !== null; ) {
      var e = l, i = t, c = a, f = u, o = i.flags;
      switch (i.tag) {
        case 0:
        case 11:
        case 15:
          hu(e, i, c, f, n), tn(8, i);
          break;
        case 23:
          break;
        case 22:
          var b = i.stateNode;
          i.memoizedState !== null ? b._visibility & 2 ? hu(e, i, c, f, n) : un(e, i) : (b._visibility |= 2, hu(e, i, c, f, n)), n && o & 2048 && rc(i.alternate, i);
          break;
        case 24:
          hu(e, i, c, f, n), n && o & 2048 && zc(i.alternate, i);
          break;
        default:
          hu(e, i, c, f, n);
      }
      t = t.sibling;
    }
  }
  function un(l, t) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) {
      var a = l, u = t, n = u.flags;
      switch (u.tag) {
        case 22:
          un(a, u), n & 2048 && rc(u.alternate, u);
          break;
        case 24:
          un(a, u), n & 2048 && zc(u.alternate, u);
          break;
        default:
          un(a, u);
      }
      t = t.sibling;
    }
  }
  var nn = 8192;
  function su(l, t, a) {
    if (l.subtreeFlags & nn) for (l = l.child; l !== null; ) Kv(l, t, a), l = l.sibling;
  }
  function Kv(l, t, a) {
    switch (l.tag) {
      case 26:
        su(l, t, a), l.flags & nn && l.memoizedState !== null && vy(a, Mt, l.memoizedState, l.memoizedProps);
        break;
      case 5:
        su(l, t, a);
        break;
      case 3:
      case 4:
        var u = Mt;
        Mt = De(l.stateNode.containerInfo), su(l, t, a), Mt = u;
        break;
      case 22:
        l.memoizedState === null && (u = l.alternate, u !== null && u.memoizedState !== null ? (u = nn, nn = 16777216, su(l, t, a), nn = u) : su(l, t, a));
        break;
      default:
        su(l, t, a);
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
  function en(l) {
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
        en(l), l.flags & 2048 && fa(9, l, l.return);
        break;
      case 3:
        en(l);
        break;
      case 12:
        en(l);
        break;
      case 22:
        var t = l.stateNode;
        l.memoizedState !== null && t._visibility & 2 && (l.return === null || l.return.tag !== 13) ? (t._visibility &= -3, se(l)) : en(l);
        break;
      default:
        en(l);
    }
  }
  function se(l) {
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
          fa(8, t, t.return), se(t);
          break;
        case 22:
          a = t.stateNode, a._visibility & 2 && (a._visibility &= -3, se(t));
          break;
        default:
          se(t);
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
        var n = u.sibling, e = u.return;
        if (Gv(u), u === a) {
          Yl = null;
          break l;
        }
        if (n !== null) {
          n.return = e, Yl = n;
          break l;
        }
        Yl = e;
      }
    }
  }
  var Mm = {
    getCacheForType: function(l) {
      var t = Xl(Dl), a = t.data.get(l);
      return a === void 0 && (a = l(), t.data.set(l, a)), a;
    },
    cacheSignal: function() {
      return Xl(Dl).controller.signal;
    }
  }, Dm = typeof WeakMap == "function" ? WeakMap : Map, ul = 0, ml = null, w = null, k = 0, el = 0, dt = null, va = !1, ou = !1, _c = !1, Wt = 0, rl = 0, da = 0, Za = 0, Ec = 0, mt = 0, gu = 0, cn = null, Pl = null, Tc = !1, oe = 0, $v = 0, ge = 1 / 0, Se = null, ma = null, jl = 0, ya = null, Su = null, $t = 0, Ac = 0, Oc = null, kv = null, fn = 0, Mc = null;
  function zt() {
    return (ul & 2) !== 0 && k !== 0 ? k & -k : E.T !== null ? jc() : of();
  }
  function Fv() {
    if (mt === 0) if ((k & 536870912) === 0 || I) {
      var l = An;
      An <<= 1, (An & 3932160) === 0 && (An = 262144), mt = l;
    } else mt = 536870912;
    return l = ft.current, l !== null && (l.flags |= 32), mt;
  }
  function lt(l, t, a) {
    (l === ml && (el === 2 || el === 9) || l.cancelPendingCommit !== null) && (bu(l, 0), ha(l, k, mt, !1)), Dn(l, a), ((ul & 2) === 0 || l !== ml) && (l === ml && ((ul & 2) === 0 && (Za |= a), rl === 4 && ha(l, k, mt, !1)), kt(l));
  }
  function Iv(l, t, a) {
    if ((ul & 6) !== 0) throw Error(h(327));
    var u = !a && (t & 127) === 0 && (t & l.expiredLanes) === 0 || Du(l, t), n = u ? pm(l, t) : Uc(l, t, !0), e = u;
    do {
      if (n === 0) {
        ou && !u && ha(l, t, 0, !1);
        break;
      } else {
        if (a = l.current.alternate, e && !Um(a)) {
          n = Uc(l, t, !1), e = !1;
          continue;
        }
        if (n === 2) {
          if (e = t, l.errorRecoveryDisabledLanes & e) var i = 0;
          else i = l.pendingLanes & -536870913, i = i !== 0 ? i : i & 536870912 ? 536870912 : 0;
          if (i !== 0) {
            t = i;
            l: {
              var c = l;
              n = cn;
              var f = c.current.memoizedState.isDehydrated;
              if (f && (bu(c, i).flags |= 256), i = Uc(c, i, !1), i !== 2) {
                if (_c && !f) {
                  c.errorRecoveryDisabledLanes |= e, Za |= e, n = 4;
                  break l;
                }
                e = Pl, Pl = n, e !== null && (Pl === null ? Pl = e : Pl.push.apply(Pl, e));
              }
              n = i;
            }
            if (e = !1, n !== 2) continue;
          }
        }
        if (n === 1) {
          bu(l, 0), ha(l, t, 0, !0);
          break;
        }
        l: {
          switch (u = l, e = n, e) {
            case 0:
            case 1:
              throw Error(h(345));
            case 4:
              if ((t & 4194048) !== t) break;
            case 6:
              ha(u, t, mt, !va);
              break l;
            case 2:
              Pl = null;
              break;
            case 3:
            case 5:
              break;
            default:
              throw Error(h(329));
          }
          if ((t & 62914560) === t && (n = oe + 300 - ut(), 10 < n)) {
            if (ha(u, t, mt, !va), Mn(u, 0, !0) !== 0) break l;
            $t = t, u.timeoutHandle = p1(Pv.bind(null, u, a, Pl, Se, Tc, t, mt, Za, gu, va, e, "Throttled", -0, 0), n);
            break l;
          }
          Pv(u, a, Pl, Se, Tc, t, mt, Za, gu, va, e, null, -0, 0);
        }
      }
      break;
    } while (!0);
    kt(l);
  }
  function Pv(l, t, a, u, n, e, i, c, f, o, b, z, g, S) {
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
      }, Kv(t, e, z);
      var p = (e & 62914560) === e ? oe - ut() : (e & 4194048) === e ? $v - ut() : 0;
      if (p = dy(z, p), p !== null) {
        $t = e, l.cancelPendingCommit = p(c1.bind(null, l, t, e, a, u, n, i, c, f, b, z, null, g, S)), ha(l, e, i, !o);
        return;
      }
    }
    c1(l, t, e, a, u, n, i, c, f);
  }
  function Um(l) {
    for (var t = l; ; ) {
      var a = t.tag;
      if ((a === 0 || a === 11 || a === 15) && t.flags & 16384 && (a = t.updateQueue, a !== null && (a = a.stores, a !== null))) for (var u = 0; u < a.length; u++) {
        var n = a[u], e = n.getSnapshot;
        n = n.value;
        try {
          if (!it(e(), n)) return !1;
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
  function ha(l, t, a, u) {
    t &= ~Ec, t &= ~Za, l.suspendedLanes |= t, l.pingedLanes &= ~t, u && (l.warmLanes |= t), u = l.expirationTimes;
    for (var n = t; 0 < n; ) {
      var e = 31 - et(n), i = 1 << e;
      u[e] = -1, n &= ~i;
    }
    a !== 0 && mf(l, a, t);
  }
  function be() {
    return (ul & 6) === 0 ? (vn(0, !1), !1) : !0;
  }
  function Dc() {
    if (w !== null) {
      if (el === 0) var l = w.return;
      else l = w, Gt = pa = null, Vi(l), fu = null, xu = 0, l = w;
      for (; l !== null; ) pv(l.alternate, l), l = l.return;
      w = null;
    }
  }
  function bu(l, t) {
    var a = l.timeoutHandle;
    a !== -1 && (l.timeoutHandle = -1, Jm(a)), a = l.cancelPendingCommit, a !== null && (l.cancelPendingCommit = null, a()), $t = 0, Dc(), ml = l, w = a = Yt(l.current, null), k = t, el = 0, dt = null, va = !1, ou = Du(l, t), _c = !1, gu = mt = Ec = Za = da = rl = 0, Pl = cn = null, Tc = !1, (t & 8) !== 0 && (t |= t & 32);
    var u = l.entangledLanes;
    if (u !== 0) for (l = l.entanglements, u &= t; 0 < u; ) {
      var n = 31 - et(u), e = 1 << n;
      t |= l[n], u &= ~e;
    }
    return Wt = t, Xn(), a;
  }
  function l1(l, t) {
    Z = null, E.H = Iu, t === cu || t === wn ? (t = r0(), el = 3) : t === Hi ? (t = r0(), el = 4) : el = t === ec ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, dt = t, w === null && (rl = 1, ce(l, ot(t, l.current)));
  }
  function t1() {
    var l = ft.current;
    return l === null ? !0 : (k & 4194048) === k ? rt === null : (k & 62914560) === k || (k & 536870912) !== 0 ? l === rt : !1;
  }
  function a1() {
    var l = E.H;
    return E.H = Iu, l === null ? Iu : l;
  }
  function u1() {
    var l = E.A;
    return E.A = Mm, l;
  }
  function re() {
    rl = 4, va || (k & 4194048) !== k && ft.current !== null || (ou = !0), (da & 134217727) === 0 && (Za & 134217727) === 0 || ml === null || ha(ml, k, mt, !1);
  }
  function Uc(l, t, a) {
    var u = ul;
    ul |= 2;
    var n = a1(), e = u1();
    (ml !== l || k !== t) && (Se = null, bu(l, t)), t = !1;
    var i = rl;
    l: do
      try {
        if (el !== 0 && w !== null) {
          var c = w, f = dt;
          switch (el) {
            case 8:
              Dc(), i = 6;
              break l;
            case 3:
            case 2:
            case 9:
            case 6:
              ft.current === null && (t = !0);
              var o = el;
              if (el = 0, dt = null, ru(l, c, f, o), a && ou) {
                i = 0;
                break l;
              }
              break;
            default:
              o = el, el = 0, dt = null, ru(l, c, f, o);
          }
        }
        Nm(), i = rl;
        break;
      } catch (b) {
        l1(l, b);
      }
    while (!0);
    return t && l.shellSuspendCounter++, Gt = pa = null, ul = u, E.H = n, E.A = e, w === null && (ml = null, k = 0, Xn()), i;
  }
  function Nm() {
    for (; w !== null; ) n1(w);
  }
  function pm(l, t) {
    var a = ul;
    ul |= 2;
    var u = a1(), n = u1();
    ml !== l || k !== t ? (Se = null, ge = ut() + 500, bu(l, t)) : ou = Du(l, t);
    l: do
      try {
        if (el !== 0 && w !== null) {
          t = w;
          var e = dt;
          t: switch (el) {
            case 1:
              el = 0, dt = null, ru(l, t, e, 1);
              break;
            case 2:
            case 9:
              if (S0(e)) {
                el = 0, dt = null, e1(t);
                break;
              }
              t = function() {
                el !== 2 && el !== 9 || ml !== l || (el = 7), kt(l);
              }, e.then(t, t);
              break l;
            case 3:
              el = 7;
              break l;
            case 4:
              el = 5;
              break l;
            case 7:
              S0(e) ? (el = 0, dt = null, e1(t)) : (el = 0, dt = null, ru(l, t, e, 7));
              break;
            case 5:
              var i = null;
              switch (w.tag) {
                case 26:
                  i = w.memoizedState;
                case 5:
                case 27:
                  var c = w;
                  if (i ? K1(i) : c.stateNode.complete) {
                    el = 0, dt = null;
                    var f = c.sibling;
                    if (f !== null) w = f;
                    else {
                      var o = c.return;
                      o !== null ? (w = o, ze(o)) : w = null;
                    }
                    break t;
                  }
              }
              el = 0, dt = null, ru(l, t, e, 5);
              break;
            case 6:
              el = 0, dt = null, ru(l, t, e, 6);
              break;
            case 8:
              Dc(), rl = 6;
              break l;
            default:
              throw Error(h(462));
          }
        }
        Hm();
        break;
      } catch (b) {
        l1(l, b);
      }
    while (!0);
    return Gt = pa = null, E.H = u, E.A = n, ul = a, w !== null ? 0 : (ml = null, k = 0, Xn(), rl);
  }
  function Hm() {
    for (; w !== null && !fd(); ) n1(w);
  }
  function n1(l) {
    var t = Uv(l.alternate, l, Wt);
    l.memoizedProps = l.pendingProps, t === null ? ze(l) : w = t;
  }
  function e1(l) {
    var t = l, a = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = Ev(a, t, t.pendingProps, t.type, void 0, k);
        break;
      case 11:
        t = Ev(a, t, t.pendingProps, t.type.render, t.ref, k);
        break;
      case 5:
        Vi(t);
      default:
        pv(a, t), t = w = i0(t, Wt), t = Uv(a, t, Wt);
    }
    l.memoizedProps = l.pendingProps, t === null ? ze(l) : w = t;
  }
  function ru(l, t, a, u) {
    Gt = pa = null, Vi(t), fu = null, xu = 0;
    var n = t.return;
    try {
      if (rm(l, n, t, a, k)) {
        rl = 1, ce(l, ot(a, l.current)), w = null;
        return;
      }
    } catch (e) {
      if (n !== null) throw w = n, e;
      rl = 1, ce(l, ot(a, l.current)), w = null;
      return;
    }
    t.flags & 32768 ? (I || u === 1 ? l = !0 : ou || (k & 536870912) !== 0 ? l = !1 : (va = l = !0, (u === 2 || u === 9 || u === 3 || u === 6) && (u = ft.current, u !== null && u.tag === 13 && (u.flags |= 16384))), i1(t, l)) : ze(t);
  }
  function ze(l) {
    var t = l;
    do {
      if ((t.flags & 32768) !== 0) {
        i1(t, va);
        return;
      }
      l = t.return;
      var a = Em(t.alternate, t, Wt);
      if (a !== null) {
        w = a;
        return;
      }
      if (t = t.sibling, t !== null) {
        w = t;
        return;
      }
      w = t = l;
    } while (t !== null);
    rl === 0 && (rl = 5);
  }
  function i1(l, t) {
    do {
      var a = Tm(l.alternate, l);
      if (a !== null) {
        a.flags &= 32767, w = a;
        return;
      }
      if (a = l.return, a !== null && (a.flags |= 32768, a.subtreeFlags = 0, a.deletions = null), !t && (l = l.sibling, l !== null)) {
        w = l;
        return;
      }
      w = l = a;
    } while (l !== null);
    rl = 6, w = null;
  }
  function c1(l, t, a, u, n, e, i, c, f) {
    l.cancelPendingCommit = null;
    do
      _e();
    while (jl !== 0);
    if ((ul & 6) !== 0) throw Error(h(327));
    if (t !== null) {
      if (t === l.current) throw Error(h(177));
      if (e = t.lanes | t.childLanes, e |= gi, bd(l, a, e, i, c, f), l === ml && (w = ml = null, k = 0), Su = t, ya = l, $t = a, Ac = e, Oc = n, kv = u, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (l.callbackNode = null, l.callbackPriority = 0, Cm(En, function() {
        return y1(), null;
      })) : (l.callbackNode = null, l.callbackPriority = 0), u = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || u) {
        u = E.T, E.T = null, n = M.p, M.p = 2, i = ul, ul |= 4;
        try {
          Am(l, t, a);
        } finally {
          ul = i, M.p = n, E.T = u;
        }
      }
      jl = 1, f1(), v1(), d1();
    }
  }
  function f1() {
    if (jl === 1) {
      jl = 0;
      var l = ya, t = Su, a = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || a) {
        a = E.T, E.T = null;
        var u = M.p;
        M.p = 2;
        var n = ul;
        ul |= 4;
        try {
          Lv(t, l);
          var e = Xc, i = Ff(l.containerInfo), c = e.focusedElem, f = e.selectionRange;
          if (i !== c && c && c.ownerDocument && kf(c.ownerDocument.documentElement, c)) {
            if (f !== null && mi(c)) {
              var o = f.start, b = f.end;
              if (b === void 0 && (b = o), "selectionStart" in c) c.selectionStart = o, c.selectionEnd = Math.min(b, c.value.length);
              else {
                var z = c.ownerDocument || document, g = z && z.defaultView || window;
                if (g.getSelection) {
                  var S = g.getSelection(), p = c.textContent.length, G = Math.min(f.start, p), vl = f.end === void 0 ? G : Math.min(f.end, p);
                  !S.extend && G > vl && (i = vl, vl = G, G = i);
                  var m = $f(c, G), v = $f(c, vl);
                  if (m && v && (S.rangeCount !== 1 || S.anchorNode !== m.node || S.anchorOffset !== m.offset || S.focusNode !== v.node || S.focusOffset !== v.offset)) {
                    var s = z.createRange();
                    s.setStart(m.node, m.offset), S.removeAllRanges(), G > vl ? (S.addRange(s), S.extend(v.node, v.offset)) : (s.setEnd(v.node, v.offset), S.addRange(s));
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
              var r = z[c];
              r.element.scrollLeft = r.left, r.element.scrollTop = r.top;
            }
          }
          Re = !!Gc, Xc = Gc = null;
        } finally {
          ul = n, M.p = u, E.T = a;
        }
      }
      l.current = t, jl = 2;
    }
  }
  function v1() {
    if (jl === 2) {
      jl = 0;
      var l = ya, t = Su, a = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || a) {
        a = E.T, E.T = null;
        var u = M.p;
        M.p = 2;
        var n = ul;
        ul |= 4;
        try {
          qv(l, t.alternate, t);
        } finally {
          ul = n, M.p = u, E.T = a;
        }
      }
      jl = 3;
    }
  }
  function d1() {
    if (jl === 4 || jl === 3) {
      jl = 0, vd();
      var l = ya, t = Su, a = $t, u = kv;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? jl = 5 : (jl = 0, Su = ya = null, m1(l, l.pendingLanes));
      var n = l.pendingLanes;
      if (n === 0 && (ma = null), Je(a), t = t.stateNode, nt && typeof nt.onCommitFiberRoot == "function") try {
        nt.onCommitFiberRoot(Mu, t, void 0, (t.current.flags & 128) === 128);
      } catch {
      }
      if (u !== null) {
        t = E.T, n = M.p, M.p = 2, E.T = null;
        try {
          for (var e = l.onRecoverableError, i = 0; i < u.length; i++) {
            var c = u[i];
            e(c.value, { componentStack: c.stack });
          }
        } finally {
          E.T = t, M.p = n;
        }
      }
      ($t & 3) !== 0 && _e(), kt(l), n = l.pendingLanes, (a & 261930) !== 0 && (n & 42) !== 0 ? l === Mc ? fn++ : (fn = 0, Mc = l) : fn = 0, vn(0, !1);
    }
  }
  function m1(l, t) {
    (l.pooledCacheLanes &= t) === 0 && (t = l.pooledCache, t != null && (l.pooledCache = null, Lu(t)));
  }
  function _e() {
    return f1(), v1(), d1(), y1();
  }
  function y1() {
    if (jl !== 5) return !1;
    var l = ya, t = Ac;
    Ac = 0;
    var a = Je($t), u = E.T, n = M.p;
    try {
      M.p = 32 > a ? 32 : a, E.T = null, a = Oc, Oc = null;
      var e = ya, i = $t;
      if (jl = 0, Su = ya = null, $t = 0, (ul & 6) !== 0) throw Error(h(331));
      var c = ul;
      if (ul |= 4, wv(e.current), xv(e, e.current, i, a), ul = c, vn(0, !1), nt && typeof nt.onPostCommitFiberRoot == "function") try {
        nt.onPostCommitFiberRoot(Mu, e);
      } catch {
      }
      return !0;
    } finally {
      M.p = n, E.T = u, m1(l, t);
    }
  }
  function h1(l, t, a) {
    t = ot(a, t), t = nc(l.stateNode, t, 2), l = qa(l, t, 2), l !== null && (Dn(l, 2), kt(l));
  }
  function il(l, t, a) {
    if (l.tag === 3) h1(l, l, a);
    else for (; t !== null; ) {
      if (t.tag === 3) {
        h1(t, l, a);
        break;
      } else if (t.tag === 1) {
        var u = t.stateNode;
        if (typeof t.type.getDerivedStateFromError == "function" || typeof u.componentDidCatch == "function" && (ma === null || !ma.has(u))) {
          l = ot(a, l), a = sv(2), u = qa(t, a, 2), u !== null && (ov(a, u, t, l), Dn(u, 2), kt(u));
          break;
        }
      }
      t = t.return;
    }
  }
  function Nc(l, t, a) {
    var u = l.pingCache;
    if (u === null) {
      u = l.pingCache = new Dm();
      var n = /* @__PURE__ */ new Set();
      u.set(t, n);
    } else n = u.get(t), n === void 0 && (n = /* @__PURE__ */ new Set(), u.set(t, n));
    n.has(a) || (_c = !0, n.add(a), l = jm.bind(null, l, t, a), t.then(l, l));
  }
  function jm(l, t, a) {
    var u = l.pingCache;
    u !== null && u.delete(t), l.pingedLanes |= l.suspendedLanes & a, l.warmLanes &= ~a, ml === l && (k & a) === a && (rl === 4 || rl === 3 && (k & 62914560) === k && 300 > ut() - oe ? (ul & 2) === 0 && bu(l, 0) : Ec |= a, gu === k && (gu = 0)), kt(l);
  }
  function s1(l, t) {
    t === 0 && (t = df()), l = Da(l, t), l !== null && (Dn(l, t), kt(l));
  }
  function Rm(l) {
    var t = l.memoizedState, a = 0;
    t !== null && (a = t.retryLane), s1(l, a);
  }
  function Bm(l, t) {
    var a = 0;
    switch (l.tag) {
      case 31:
      case 13:
        var u = l.stateNode, n = l.memoizedState;
        n !== null && (a = n.retryLane);
        break;
      case 19:
        u = l.stateNode;
        break;
      case 22:
        u = l.stateNode._retryCache;
        break;
      default:
        throw Error(h(314));
    }
    u !== null && u.delete(t), s1(l, a);
  }
  function Cm(l, t) {
    return Ve(l, t);
  }
  var Ee = null, zu = null, pc = !1, Te = !1, Hc = !1, sa = 0;
  function kt(l) {
    l !== zu && l.next === null && (zu === null ? Ee = zu = l : zu = zu.next = l), Te = !0, pc || (pc = !0, qm());
  }
  function vn(l, t) {
    if (!Hc && Te) {
      Hc = !0;
      do
        for (var a = !1, u = Ee; u !== null; ) {
          if (!t) if (l !== 0) {
            var n = u.pendingLanes;
            if (n === 0) var e = 0;
            else {
              var i = u.suspendedLanes, c = u.pingedLanes;
              e = (1 << 31 - et(42 | l) + 1) - 1, e &= n & ~(i & ~c), e = e & 201326741 ? e & 201326741 | 1 : e ? e | 2 : 0;
            }
            e !== 0 && (a = !0, b1(u, e));
          } else e = k, e = Mn(u, u === ml ? e : 0, u.cancelPendingCommit !== null || u.timeoutHandle !== -1), (e & 3) === 0 || Du(u, e) || (a = !0, b1(u, e));
          u = u.next;
        }
      while (a);
      Hc = !1;
    }
  }
  function Ym() {
    o1();
  }
  function o1() {
    Te = pc = !1;
    var l = 0;
    sa !== 0 && Km() && (l = sa);
    for (var t = ut(), a = null, u = Ee; u !== null; ) {
      var n = u.next, e = g1(u, t);
      e === 0 ? (u.next = null, a === null ? Ee = n : a.next = n, n === null && (zu = a)) : (a = u, (l !== 0 || (e & 3) !== 0) && (Te = !0)), u = n;
    }
    jl !== 0 && jl !== 5 || vn(l, !1), sa !== 0 && (sa = 0);
  }
  function g1(l, t) {
    for (var a = l.suspendedLanes, u = l.pingedLanes, n = l.expirationTimes, e = l.pendingLanes & -62914561; 0 < e; ) {
      var i = 31 - et(e), c = 1 << i, f = n[i];
      f === -1 ? ((c & a) === 0 || (c & u) !== 0) && (n[i] = Sd(c, t)) : f <= t && (l.expiredLanes |= c), e &= ~c;
    }
    if (t = ml, a = k, a = Mn(l, l === t ? a : 0, l.cancelPendingCommit !== null || l.timeoutHandle !== -1), u = l.callbackNode, a === 0 || l === t && (el === 2 || el === 9) || l.cancelPendingCommit !== null) return u !== null && u !== null && xe(u), l.callbackNode = null, l.callbackPriority = 0;
    if ((a & 3) === 0 || Du(l, a)) {
      if (t = a & -a, t === l.callbackPriority) return t;
      switch (u !== null && xe(u), Je(a)) {
        case 2:
        case 8:
          a = ff;
          break;
        case 32:
          a = En;
          break;
        case 268435456:
          a = vf;
          break;
        default:
          a = En;
      }
      return u = S1.bind(null, l), a = Ve(a, u), l.callbackPriority = t, l.callbackNode = a, t;
    }
    return u !== null && u !== null && xe(u), l.callbackPriority = 2, l.callbackNode = null, 2;
  }
  function S1(l, t) {
    if (jl !== 0 && jl !== 5) return l.callbackNode = null, l.callbackPriority = 0, null;
    var a = l.callbackNode;
    if (_e() && l.callbackNode !== a) return null;
    var u = k;
    return u = Mn(l, l === ml ? u : 0, l.cancelPendingCommit !== null || l.timeoutHandle !== -1), u === 0 ? null : (Iv(l, u, t), g1(l, ut()), l.callbackNode != null && l.callbackNode === a ? S1.bind(null, l) : null);
  }
  function b1(l, t) {
    if (_e()) return null;
    Iv(l, t, !0);
  }
  function qm() {
    wm(function() {
      (ul & 6) !== 0 ? Ve(cf, Ym) : o1();
    });
  }
  function jc() {
    if (sa === 0) {
      var l = eu;
      l === 0 && (l = Tn, Tn <<= 1, (Tn & 261888) === 0 && (Tn = 256)), sa = l;
    }
    return sa;
  }
  function r1(l) {
    return l == null || typeof l == "symbol" || typeof l == "boolean" ? null : typeof l == "function" ? l : Hn("" + l);
  }
  function z1(l, t) {
    var a = t.ownerDocument.createElement("input");
    return a.name = t.name, a.value = t.value, l.id && a.setAttribute("form", l.id), t.parentNode.insertBefore(a, t), l = new FormData(l), a.parentNode.removeChild(a), l;
  }
  function Gm(l, t, a, u, n) {
    if (t === "submit" && a && a.stateNode === n) {
      var e = r1((n[Wl] || null).action), i = u.submitter;
      i && (t = (t = i[Wl] || null) ? r1(t.formAction) : i.getAttribute("formAction"), t !== null && (e = t, i = null));
      var c = new Cn("action", "action", null, u, n);
      l.push({
        event: c,
        listeners: [{
          instance: null,
          listener: function() {
            if (u.defaultPrevented) {
              if (sa !== 0) {
                var f = i ? z1(n, i) : new FormData(n);
                Ii(a, {
                  pending: !0,
                  data: f,
                  method: n.method,
                  action: e
                }, null, f);
              }
            } else typeof e == "function" && (c.preventDefault(), f = i ? z1(n, i) : new FormData(n), Ii(a, {
              pending: !0,
              data: f,
              method: n.method,
              action: e
            }, e, f));
          },
          currentTarget: n
        }]
      });
    }
  }
  for (var Rc = 0; Rc < oi.length; Rc++) {
    var Bc = oi[Rc];
    Ot(Bc.toLowerCase(), "on" + (Bc[0].toUpperCase() + Bc.slice(1)));
  }
  Ot(l0, "onAnimationEnd"), Ot(t0, "onAnimationIteration"), Ot(a0, "onAnimationStart"), Ot("dblclick", "onDoubleClick"), Ot("focusin", "onFocus"), Ot("focusout", "onBlur"), Ot(Pd, "onTransitionRun"), Ot(lm, "onTransitionStart"), Ot(tm, "onTransitionCancel"), Ot(u0, "onTransitionEnd"), Ka("onMouseEnter", ["mouseout", "mouseover"]), Ka("onMouseLeave", ["mouseout", "mouseover"]), Ka("onPointerEnter", ["pointerout", "pointerover"]), Ka("onPointerLeave", ["pointerout", "pointerover"]), Ta("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" ")), Ta("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")), Ta("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]), Ta("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" ")), Ta("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" ")), Ta("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
  var dn = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), Xm = new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(dn));
  function _1(l, t) {
    t = (t & 4) !== 0;
    for (var a = 0; a < l.length; a++) {
      var u = l[a], n = u.event;
      u = u.listeners;
      l: {
        var e = void 0;
        if (t) for (var i = u.length - 1; 0 <= i; i--) {
          var c = u[i], f = c.instance, o = c.currentTarget;
          if (c = c.listener, f !== e && n.isPropagationStopped()) break l;
          e = c, n.currentTarget = o;
          try {
            e(n);
          } catch (b) {
            Gn(b);
          }
          n.currentTarget = null, e = f;
        }
        else for (i = 0; i < u.length; i++) {
          if (c = u[i], f = c.instance, o = c.currentTarget, c = c.listener, f !== e && n.isPropagationStopped()) break l;
          e = c, n.currentTarget = o;
          try {
            e(n);
          } catch (b) {
            Gn(b);
          }
          n.currentTarget = null, e = f;
        }
      }
    }
  }
  function W(l, t) {
    var a = t[we];
    a === void 0 && (a = t[we] = /* @__PURE__ */ new Set());
    var u = l + "__bubble";
    a.has(u) || (T1(t, l, 2, !1), a.add(u));
  }
  function Cc(l, t, a) {
    var u = 0;
    t && (u |= 4), T1(a, l, u, t);
  }
  var Ae = "_reactListening" + Math.random().toString(36).slice(2);
  function E1(l) {
    if (!l[Ae]) {
      l[Ae] = !0, bf.forEach(function(a) {
        a !== "selectionchange" && (Xm.has(a) || Cc(a, !1, l), Cc(a, !0, l));
      });
      var t = l.nodeType === 9 ? l : l.ownerDocument;
      t === null || t[Ae] || (t[Ae] = !0, Cc("selectionchange", !1, t));
    }
  }
  function T1(l, t, a, u) {
    switch (k1(t)) {
      case 2:
        var n = oy;
        break;
      case 8:
        n = gy;
        break;
      default:
        n = kc;
    }
    a = n.bind(null, t, a, l), n = void 0, !ai || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (n = !0), u ? n !== void 0 ? l.addEventListener(t, a, {
      capture: !0,
      passive: n
    }) : l.addEventListener(t, a, !0) : n !== void 0 ? l.addEventListener(t, a, { passive: n }) : l.addEventListener(t, a, !1);
  }
  function Yc(l, t, a, u, n) {
    var e = u;
    if ((t & 1) === 0 && (t & 2) === 0 && u !== null) l: for (; ; ) {
      if (u === null) return;
      var i = u.tag;
      if (i === 3 || i === 4) {
        var c = u.stateNode.containerInfo;
        if (c === n) break;
        if (i === 4) for (i = u.return; i !== null; ) {
          var f = i.tag;
          if ((f === 3 || f === 4) && i.stateNode.containerInfo === n) return;
          i = i.return;
        }
        for (; c !== null; ) {
          if (i = La(c), i === null) return;
          if (f = i.tag, f === 5 || f === 6 || f === 26 || f === 27) {
            u = e = i;
            continue l;
          }
          c = c.parentNode;
        }
      }
      u = u.return;
    }
    pf(function() {
      var o = e, b = li(a), z = [];
      l: {
        var g = n0.get(l);
        if (g !== void 0) {
          var S = Cn, p = l;
          switch (l) {
            case "keypress":
              if (Rn(a) === 0) break l;
            case "keydown":
            case "keyup":
              S = Yd;
              break;
            case "focusin":
              p = "focus", S = ii;
              break;
            case "focusout":
              p = "blur", S = ii;
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
              S = Nd;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              S = qd;
              break;
            case l0:
            case t0:
            case a0:
              S = pd;
              break;
            case u0:
              S = Gd;
              break;
            case "scroll":
            case "scrollend":
              S = Ud;
              break;
            case "wheel":
              S = Xd;
              break;
            case "copy":
            case "cut":
            case "paste":
              S = Hd;
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
              S = Qd;
          }
          var G = (t & 4) !== 0, vl = !G && (l === "scroll" || l === "scrollend"), m = G ? g !== null ? g + "Capture" : null : g;
          G = [];
          for (var v = o, s; v !== null; ) {
            var r = v;
            if (s = r.stateNode, r = r.tag, r !== 5 && r !== 26 && r !== 27 || s === null || m === null || (r = Hu(v, m), r != null && G.push(mn(v, r, s))), vl) break;
            v = v.return;
          }
          0 < G.length && (g = new S(g, p, null, a, b), z.push({
            event: g,
            listeners: G
          }));
        }
      }
      if ((t & 7) === 0) {
        l: {
          if (g = l === "mouseover" || l === "pointerover", S = l === "mouseout" || l === "pointerout", g && a !== Pe && (p = a.relatedTarget || a.fromElement) && (La(p) || p[Uu])) break l;
          if ((S || g) && (g = b.window === b ? b : (g = b.ownerDocument) ? g.defaultView || g.parentWindow : window, S ? (p = a.relatedTarget || a.toElement, S = o, p = p ? La(p) : null, p !== null && (vl = x(p), G = p.tag, p !== vl || G !== 5 && G !== 27 && G !== 6) && (p = null)) : (S = null, p = o), S !== p)) {
            if (G = Rf, r = "onMouseLeave", m = "onMouseEnter", v = "mouse", (l === "pointerout" || l === "pointerover") && (G = Cf, r = "onPointerLeave", m = "onPointerEnter", v = "pointer"), vl = S == null ? g : pu(S), s = p == null ? g : pu(p), g = new G(r, v + "leave", S, a, b), g.target = vl, g.relatedTarget = s, r = null, La(b) === o && (G = new G(m, v + "enter", p, a, b), G.target = s, G.relatedTarget = vl, r = G), vl = r, S && p) t: {
              for (G = Qm, m = S, v = p, s = 0, r = m; r; r = G(r)) s++;
              r = 0;
              for (var Y = v; Y; Y = G(Y)) r++;
              for (; 0 < s - r; ) m = G(m), s--;
              for (; 0 < r - s; ) v = G(v), r--;
              for (; s--; ) {
                if (m === v || v !== null && m === v.alternate) {
                  G = m;
                  break t;
                }
                m = G(m), v = G(v);
              }
              G = null;
            }
            else G = null;
            S !== null && A1(z, g, S, G, !1), p !== null && vl !== null && A1(z, vl, p, G, !0);
          }
        }
        l: {
          if (g = o ? pu(o) : window, S = g.nodeName && g.nodeName.toLowerCase(), S === "select" || S === "input" && g.type === "file") var tl = Vf;
          else if (Zf(g)) if (xf) tl = kd;
          else {
            tl = Wd;
            var j = wd;
          }
          else S = g.nodeName, !S || S.toLowerCase() !== "input" || g.type !== "checkbox" && g.type !== "radio" ? o && Ie(o.elementType) && (tl = Vf) : tl = $d;
          if (tl && (tl = tl(l, o))) {
            Lf(z, tl, a, b);
            break l;
          }
          j && j(l, g, o), l === "focusout" && o && g.type === "number" && o.memoizedProps.value != null && Fe(g, "number", g.value);
        }
        switch (j = o ? pu(o) : window, l) {
          case "focusin":
            (Zf(j) || j.contentEditable === "true") && (Fa = j, yi = o, Xu = null);
            break;
          case "focusout":
            Xu = yi = Fa = null;
            break;
          case "mousedown":
            hi = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            hi = !1, If(z, a, b);
            break;
          case "selectionchange":
            if (Id) break;
          case "keydown":
          case "keyup":
            If(z, a, b);
        }
        var L;
        if (fi) l: {
          switch (l) {
            case "compositionstart":
              var F = "onCompositionStart";
              break l;
            case "compositionend":
              F = "onCompositionEnd";
              break l;
            case "compositionupdate":
              F = "onCompositionUpdate";
              break l;
          }
          F = void 0;
        }
        else ka ? Xf(l, a) && (F = "onCompositionEnd") : l === "keydown" && a.keyCode === 229 && (F = "onCompositionStart");
        F && (Yf && a.locale !== "ko" && (ka || F !== "onCompositionStart" ? F === "onCompositionEnd" && ka && (L = Hf()) : (la = b, ui = "value" in la ? la.value : la.textContent, ka = !0)), j = Oe(o, F), 0 < j.length && (F = new Bf(F, l, null, a, b), z.push({
          event: F,
          listeners: j
        }), L ? F.data = L : (L = Qf(a), L !== null && (F.data = L)))), (L = Ld ? Vd(l, a) : xd(l, a)) && (F = Oe(o, "onBeforeInput"), 0 < F.length && (j = new Bf("onBeforeInput", "beforeinput", null, a, b), z.push({
          event: j,
          listeners: F
        }), j.data = L)), Gm(z, l, o, a, b);
      }
      _1(z, t);
    });
  }
  function mn(l, t, a) {
    return {
      instance: l,
      listener: t,
      currentTarget: a
    };
  }
  function Oe(l, t) {
    for (var a = t + "Capture", u = []; l !== null; ) {
      var n = l, e = n.stateNode;
      if (n = n.tag, n !== 5 && n !== 26 && n !== 27 || e === null || (n = Hu(l, a), n != null && u.unshift(mn(l, n, e)), n = Hu(l, t), n != null && u.push(mn(l, n, e))), l.tag === 3) return u;
      l = l.return;
    }
    return [];
  }
  function Qm(l) {
    if (l === null) return null;
    do
      l = l.return;
    while (l && l.tag !== 5 && l.tag !== 27);
    return l || null;
  }
  function A1(l, t, a, u, n) {
    for (var e = t._reactName, i = []; a !== null && a !== u; ) {
      var c = a, f = c.alternate, o = c.stateNode;
      if (c = c.tag, f !== null && f === u) break;
      c !== 5 && c !== 26 && c !== 27 || o === null || (f = o, n ? (o = Hu(a, e), o != null && i.unshift(mn(a, o, f))) : n || (o = Hu(a, e), o != null && i.push(mn(a, o, f)))), a = a.return;
    }
    i.length !== 0 && l.push({
      event: t,
      listeners: i
    });
  }
  var Zm = /\r\n?/g, Lm = /\u0000|\uFFFD/g;
  function O1(l) {
    return (typeof l == "string" ? l : "" + l).replace(Zm, `
`).replace(Lm, "");
  }
  function M1(l, t) {
    return t = O1(t), O1(l) === t;
  }
  function fl(l, t, a, u, n, e) {
    switch (a) {
      case "children":
        typeof u == "string" ? t === "body" || t === "textarea" && u === "" || wa(l, u) : (typeof u == "number" || typeof u == "bigint") && t !== "body" && wa(l, "" + u);
        break;
      case "className":
        Nn(l, "class", u);
        break;
      case "tabIndex":
        Nn(l, "tabindex", u);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        Nn(l, a, u);
        break;
      case "style":
        Uf(l, u, e);
        break;
      case "data":
        if (t !== "object") {
          Nn(l, "data", u);
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
        u = Hn("" + u), l.setAttribute(a, u);
        break;
      case "action":
      case "formAction":
        if (typeof u == "function") {
          l.setAttribute(a, "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");
          break;
        } else typeof e == "function" && (a === "formAction" ? (t !== "input" && fl(l, t, "name", n.name, n, null), fl(l, t, "formEncType", n.formEncType, n, null), fl(l, t, "formMethod", n.formMethod, n, null), fl(l, t, "formTarget", n.formTarget, n, null)) : (fl(l, t, "encType", n.encType, n, null), fl(l, t, "method", n.method, n, null), fl(l, t, "target", n.target, n, null)));
        if (u == null || typeof u == "symbol" || typeof u == "boolean") {
          l.removeAttribute(a);
          break;
        }
        u = Hn("" + u), l.setAttribute(a, u);
        break;
      case "onClick":
        u != null && (l.onclick = Bt);
        break;
      case "onScroll":
        u != null && W("scroll", l);
        break;
      case "onScrollEnd":
        u != null && W("scrollend", l);
        break;
      case "dangerouslySetInnerHTML":
        if (u != null) {
          if (typeof u != "object" || !("__html" in u)) throw Error(h(61));
          if (a = u.__html, a != null) {
            if (n.children != null) throw Error(h(60));
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
        a = Hn("" + u), l.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", a);
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
        W("beforetoggle", l), W("toggle", l), Un(l, "popover", u);
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
        Un(l, "is", u);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < a.length) || a[0] !== "o" && a[0] !== "O" || a[1] !== "n" && a[1] !== "N") && (a = Md.get(a) || a, Un(l, a, u));
    }
  }
  function qc(l, t, a, u, n, e) {
    switch (a) {
      case "style":
        Uf(l, u, e);
        break;
      case "dangerouslySetInnerHTML":
        if (u != null) {
          if (typeof u != "object" || !("__html" in u)) throw Error(h(61));
          if (a = u.__html, a != null) {
            if (n.children != null) throw Error(h(60));
            l.innerHTML = a;
          }
        }
        break;
      case "children":
        typeof u == "string" ? wa(l, u) : (typeof u == "number" || typeof u == "bigint") && wa(l, "" + u);
        break;
      case "onScroll":
        u != null && W("scroll", l);
        break;
      case "onScrollEnd":
        u != null && W("scrollend", l);
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
        if (!rf.hasOwnProperty(a)) l: {
          if (a[0] === "o" && a[1] === "n" && (n = a.endsWith("Capture"), t = a.slice(2, n ? a.length - 7 : void 0), e = l[Wl] || null, e = e != null ? e[a] : null, typeof e == "function" && l.removeEventListener(t, e, n), typeof u == "function")) {
            typeof e != "function" && e !== null && (a in l ? l[a] = null : l.hasAttribute(a) && l.removeAttribute(a)), l.addEventListener(t, u, n);
            break l;
          }
          a in l ? l[a] = u : u === !0 ? l.setAttribute(a, "") : Un(l, a, u);
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
        W("error", l), W("load", l);
        var u = !1, n = !1, e;
        for (e in a) if (a.hasOwnProperty(e)) {
          var i = a[e];
          if (i != null) switch (e) {
            case "src":
              u = !0;
              break;
            case "srcSet":
              n = !0;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(h(137, t));
            default:
              fl(l, t, e, i, a, null);
          }
        }
        n && fl(l, t, "srcSet", a.srcSet, a, null), u && fl(l, t, "src", a.src, a, null);
        return;
      case "input":
        W("invalid", l);
        var c = e = i = n = null, f = null, o = null;
        for (u in a) if (a.hasOwnProperty(u)) {
          var b = a[u];
          if (b != null) switch (u) {
            case "name":
              n = b;
              break;
            case "type":
              i = b;
              break;
            case "checked":
              f = b;
              break;
            case "defaultChecked":
              o = b;
              break;
            case "value":
              e = b;
              break;
            case "defaultValue":
              c = b;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              if (b != null) throw Error(h(137, t));
              break;
            default:
              fl(l, t, u, b, a, null);
          }
        }
        Af(l, e, c, f, o, i, n, !1);
        return;
      case "select":
        W("invalid", l), u = i = e = null;
        for (n in a) if (a.hasOwnProperty(n) && (c = a[n], c != null)) switch (n) {
          case "value":
            e = c;
            break;
          case "defaultValue":
            i = c;
            break;
          case "multiple":
            u = c;
          default:
            fl(l, t, n, c, a, null);
        }
        t = e, a = i, l.multiple = !!u, t != null ? Ja(l, !!u, t, !1) : a != null && Ja(l, !!u, a, !0);
        return;
      case "textarea":
        W("invalid", l), e = n = u = null;
        for (i in a) if (a.hasOwnProperty(i) && (c = a[i], c != null)) switch (i) {
          case "value":
            u = c;
            break;
          case "defaultValue":
            n = c;
            break;
          case "children":
            e = c;
            break;
          case "dangerouslySetInnerHTML":
            if (c != null) throw Error(h(91));
            break;
          default:
            fl(l, t, i, c, a, null);
        }
        Mf(l, u, n, e);
        return;
      case "option":
        for (f in a) if (a.hasOwnProperty(f) && (u = a[f], u != null)) switch (f) {
          case "selected":
            l.selected = u && typeof u != "function" && typeof u != "symbol";
            break;
          default:
            fl(l, t, f, u, a, null);
        }
        return;
      case "dialog":
        W("beforetoggle", l), W("toggle", l), W("cancel", l), W("close", l);
        break;
      case "iframe":
      case "object":
        W("load", l);
        break;
      case "video":
      case "audio":
        for (u = 0; u < dn.length; u++) W(dn[u], l);
        break;
      case "image":
        W("error", l), W("load", l);
        break;
      case "details":
        W("toggle", l);
        break;
      case "embed":
      case "source":
      case "link":
        W("error", l), W("load", l);
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
            throw Error(h(137, t));
          default:
            fl(l, t, o, u, a, null);
        }
        return;
      default:
        if (Ie(t)) {
          for (b in a) a.hasOwnProperty(b) && (u = a[b], u !== void 0 && qc(l, t, b, u, a, void 0));
          return;
        }
    }
    for (c in a) a.hasOwnProperty(c) && (u = a[c], u != null && fl(l, t, c, u, a, null));
  }
  function Vm(l, t, a, u) {
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
        var n = null, e = null, i = null, c = null, f = null, o = null, b = null;
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
              u.hasOwnProperty(S) || fl(l, t, S, null, u, z);
          }
        }
        for (var g in u) {
          var S = u[g];
          if (z = a[g], u.hasOwnProperty(g) && (S != null || z != null)) switch (g) {
            case "type":
              e = S;
              break;
            case "name":
              n = S;
              break;
            case "checked":
              o = S;
              break;
            case "defaultChecked":
              b = S;
              break;
            case "value":
              i = S;
              break;
            case "defaultValue":
              c = S;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              if (S != null) throw Error(h(137, t));
              break;
            default:
              S !== z && fl(l, t, g, S, u, z);
          }
        }
        ke(l, i, c, f, o, b, e, n);
        return;
      case "select":
        S = i = c = g = null;
        for (e in a) if (f = a[e], a.hasOwnProperty(e) && f != null) switch (e) {
          case "value":
            break;
          case "multiple":
            S = f;
          default:
            u.hasOwnProperty(e) || fl(l, t, e, null, u, f);
        }
        for (n in u) if (e = u[n], f = a[n], u.hasOwnProperty(n) && (e != null || f != null)) switch (n) {
          case "value":
            g = e;
            break;
          case "defaultValue":
            c = e;
            break;
          case "multiple":
            i = e;
          default:
            e !== f && fl(l, t, n, e, u, f);
        }
        t = c, a = i, u = S, g != null ? Ja(l, !!a, g, !1) : !!u != !!a && (t != null ? Ja(l, !!a, t, !0) : Ja(l, !!a, a ? [] : "", !1));
        return;
      case "textarea":
        S = g = null;
        for (c in a) if (n = a[c], a.hasOwnProperty(c) && n != null && !u.hasOwnProperty(c)) switch (c) {
          case "value":
            break;
          case "children":
            break;
          default:
            fl(l, t, c, null, u, n);
        }
        for (i in u) if (n = u[i], e = a[i], u.hasOwnProperty(i) && (n != null || e != null)) switch (i) {
          case "value":
            g = n;
            break;
          case "defaultValue":
            S = n;
            break;
          case "children":
            break;
          case "dangerouslySetInnerHTML":
            if (n != null) throw Error(h(91));
            break;
          default:
            n !== e && fl(l, t, i, n, u, e);
        }
        Of(l, g, S);
        return;
      case "option":
        for (var p in a) if (g = a[p], a.hasOwnProperty(p) && g != null && !u.hasOwnProperty(p)) switch (p) {
          case "selected":
            l.selected = !1;
            break;
          default:
            fl(l, t, p, null, u, g);
        }
        for (f in u) if (g = u[f], S = a[f], u.hasOwnProperty(f) && g !== S && (g != null || S != null)) switch (f) {
          case "selected":
            l.selected = g && typeof g != "function" && typeof g != "symbol";
            break;
          default:
            fl(l, t, f, g, u, S);
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
        for (var G in a) g = a[G], a.hasOwnProperty(G) && g != null && !u.hasOwnProperty(G) && fl(l, t, G, null, u, g);
        for (o in u) if (g = u[o], S = a[o], u.hasOwnProperty(o) && g !== S && (g != null || S != null)) switch (o) {
          case "children":
          case "dangerouslySetInnerHTML":
            if (g != null) throw Error(h(137, t));
            break;
          default:
            fl(l, t, o, g, u, S);
        }
        return;
      default:
        if (Ie(t)) {
          for (var vl in a) g = a[vl], a.hasOwnProperty(vl) && g !== void 0 && !u.hasOwnProperty(vl) && qc(l, t, vl, void 0, u, g);
          for (b in u) g = u[b], S = a[b], !u.hasOwnProperty(b) || g === S || g === void 0 && S === void 0 || qc(l, t, b, g, u, S);
          return;
        }
    }
    for (var m in a) g = a[m], a.hasOwnProperty(m) && g != null && !u.hasOwnProperty(m) && fl(l, t, m, null, u, g);
    for (z in u) g = u[z], S = a[z], !u.hasOwnProperty(z) || g === S || g == null && S == null || fl(l, t, z, g, u, S);
  }
  function D1(l) {
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
  function xm() {
    if (typeof performance.getEntriesByType == "function") {
      for (var l = 0, t = 0, a = performance.getEntriesByType("resource"), u = 0; u < a.length; u++) {
        var n = a[u], e = n.transferSize, i = n.initiatorType, c = n.duration;
        if (e && c && D1(i)) {
          for (i = 0, c = n.responseEnd, u += 1; u < a.length; u++) {
            var f = a[u], o = f.startTime;
            if (o > c) break;
            var b = f.transferSize, z = f.initiatorType;
            b && D1(z) && (f = f.responseEnd, i += b * (f < c ? 1 : (c - o) / (f - o)));
          }
          if (--u, t += 8 * (e + i) / (n.duration / 1e3), l++, 10 < l) break;
        }
      }
      if (0 < l) return t / l / 1e6;
    }
    return navigator.connection && (l = navigator.connection.downlink, typeof l == "number") ? l : 5;
  }
  var Gc = null, Xc = null;
  function Me(l) {
    return l.nodeType === 9 ? l : l.ownerDocument;
  }
  function U1(l) {
    switch (l) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function N1(l, t) {
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
  function Km() {
    var l = window.event;
    return l && l.type === "popstate" ? l === Zc ? !1 : (Zc = l, !0) : (Zc = null, !1);
  }
  var p1 = typeof setTimeout == "function" ? setTimeout : void 0, Jm = typeof clearTimeout == "function" ? clearTimeout : void 0, H1 = typeof Promise == "function" ? Promise : void 0, wm = typeof queueMicrotask == "function" ? queueMicrotask : typeof H1 < "u" ? function(l) {
    return H1.resolve(null).then(l).catch(Wm);
  } : p1;
  function Wm(l) {
    setTimeout(function() {
      throw l;
    });
  }
  function oa(l) {
    return l === "head";
  }
  function j1(l, t) {
    var a = t, u = 0;
    do {
      var n = a.nextSibling;
      if (l.removeChild(a), n && n.nodeType === 8) if (a = n.data, a === "/$" || a === "/&") {
        if (u === 0) {
          l.removeChild(n), Au(t);
          return;
        }
        u--;
      } else if (a === "$" || a === "$?" || a === "$~" || a === "$!" || a === "&") u++;
      else if (a === "html") yn(l.ownerDocument.documentElement);
      else if (a === "head") {
        a = l.ownerDocument.head, yn(a);
        for (var e = a.firstChild; e; ) {
          var i = e.nextSibling, c = e.nodeName;
          e[Nu] || c === "SCRIPT" || c === "STYLE" || c === "LINK" && e.rel.toLowerCase() === "stylesheet" || a.removeChild(e), e = i;
        }
      } else a === "body" && yn(l.ownerDocument.body);
      a = n;
    } while (a);
    Au(t);
  }
  function R1(l, t) {
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
          Lc(a), We(a);
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
  function $m(l, t, a, u) {
    for (; l.nodeType === 1; ) {
      var n = a;
      if (l.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!u && (l.nodeName !== "INPUT" || l.type !== "hidden")) break;
      } else if (u) {
        if (!l[Nu]) switch (t) {
          case "meta":
            if (!l.hasAttribute("itemprop")) break;
            return l;
          case "link":
            if (e = l.getAttribute("rel"), e === "stylesheet" && l.hasAttribute("data-precedence")) break;
            if (e !== n.rel || l.getAttribute("href") !== (n.href == null || n.href === "" ? null : n.href) || l.getAttribute("crossorigin") !== (n.crossOrigin == null ? null : n.crossOrigin) || l.getAttribute("title") !== (n.title == null ? null : n.title)) break;
            return l;
          case "style":
            if (l.hasAttribute("data-precedence")) break;
            return l;
          case "script":
            if (e = l.getAttribute("src"), (e !== (n.src == null ? null : n.src) || l.getAttribute("type") !== (n.type == null ? null : n.type) || l.getAttribute("crossorigin") !== (n.crossOrigin == null ? null : n.crossOrigin)) && e && l.hasAttribute("async") && !l.hasAttribute("itemprop")) break;
            return l;
          default:
            return l;
        }
      } else if (t === "input" && l.type === "hidden") {
        var e = n.name == null ? null : "" + n.name;
        if (n.type === "hidden" && l.getAttribute("name") === e) return l;
      } else return l;
      if (l = _t(l.nextSibling), l === null) break;
    }
    return null;
  }
  function km(l, t, a) {
    if (t === "") return null;
    for (; l.nodeType !== 3; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !a || (l = _t(l.nextSibling), l === null)) return null;
    return l;
  }
  function B1(l, t) {
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
  function Fm(l, t) {
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
  function C1(l) {
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
  function Y1(l) {
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
  function q1(l, t, a) {
    switch (t = Me(a), l) {
      case "html":
        if (l = t.documentElement, !l) throw Error(h(452));
        return l;
      case "head":
        if (l = t.head, !l) throw Error(h(453));
        return l;
      case "body":
        if (l = t.body, !l) throw Error(h(454));
        return l;
      default:
        throw Error(h(451));
    }
  }
  function yn(l) {
    for (var t = l.attributes; t.length; ) l.removeAttributeNode(t[0]);
    We(l);
  }
  var Et = /* @__PURE__ */ new Map(), G1 = /* @__PURE__ */ new Set();
  function De(l) {
    return typeof l.getRootNode == "function" ? l.getRootNode() : l.nodeType === 9 ? l : l.ownerDocument;
  }
  var Ft = M.d;
  M.d = {
    f: Im,
    r: Pm,
    D: ly,
    C: ty,
    L: ay,
    m: uy,
    X: ey,
    S: ny,
    M: iy
  };
  function Im() {
    var l = Ft.f(), t = be();
    return l || t;
  }
  function Pm(l) {
    var t = Va(l);
    t !== null && t.tag === 5 && t.type === "form" ? uv(t) : Ft.r(l);
  }
  var _u = typeof document > "u" ? null : document;
  function X1(l, t, a) {
    var u = _u;
    if (u && typeof t == "string" && t) {
      var n = ht(t);
      n = 'link[rel="' + l + '"][href="' + n + '"]', typeof a == "string" && (n += '[crossorigin="' + a + '"]'), G1.has(n) || (G1.add(n), l = {
        rel: l,
        crossOrigin: a,
        href: t
      }, u.querySelector(n) === null && (t = u.createElement("link"), Zl(t, "link", l), Cl(t), u.head.appendChild(t)));
    }
  }
  function ly(l) {
    Ft.D(l), X1("dns-prefetch", l, null);
  }
  function ty(l, t) {
    Ft.C(l, t), X1("preconnect", l, t);
  }
  function ay(l, t, a) {
    Ft.L(l, t, a);
    var u = _u;
    if (u && l && t) {
      var n = 'link[rel="preload"][as="' + ht(t) + '"]';
      t === "image" && a && a.imageSrcSet ? (n += '[imagesrcset="' + ht(a.imageSrcSet) + '"]', typeof a.imageSizes == "string" && (n += '[imagesizes="' + ht(a.imageSizes) + '"]')) : n += '[href="' + ht(l) + '"]';
      var e = n;
      switch (t) {
        case "style":
          e = Eu(l);
          break;
        case "script":
          e = Tu(l);
      }
      Et.has(e) || (l = R({
        rel: "preload",
        href: t === "image" && a && a.imageSrcSet ? void 0 : l,
        as: t
      }, a), Et.set(e, l), u.querySelector(n) !== null || t === "style" && u.querySelector(hn(e)) || t === "script" && u.querySelector(sn(e)) || (t = u.createElement("link"), Zl(t, "link", l), Cl(t), u.head.appendChild(t)));
    }
  }
  function uy(l, t) {
    Ft.m(l, t);
    var a = _u;
    if (a && l) {
      var u = t && typeof t.as == "string" ? t.as : "script", n = 'link[rel="modulepreload"][as="' + ht(u) + '"][href="' + ht(l) + '"]', e = n;
      switch (u) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          e = Tu(l);
      }
      if (!Et.has(e) && (l = R({
        rel: "modulepreload",
        href: l
      }, t), Et.set(e, l), a.querySelector(n) === null)) {
        switch (u) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (a.querySelector(sn(e))) return;
        }
        u = a.createElement("link"), Zl(u, "link", l), Cl(u), a.head.appendChild(u);
      }
    }
  }
  function ny(l, t, a) {
    Ft.S(l, t, a);
    var u = _u;
    if (u && l) {
      var n = xa(u).hoistableStyles, e = Eu(l);
      t = t || "default";
      var i = n.get(e);
      if (!i) {
        var c = {
          loading: 0,
          preload: null
        };
        if (i = u.querySelector(hn(e))) c.loading = 5;
        else {
          l = R({
            rel: "stylesheet",
            href: l,
            "data-precedence": t
          }, a), (a = Et.get(e)) && Jc(l, a);
          var f = i = u.createElement("link");
          Cl(f), Zl(f, "link", l), f._p = new Promise(function(o, b) {
            f.onload = o, f.onerror = b;
          }), f.addEventListener("load", function() {
            c.loading |= 1;
          }), f.addEventListener("error", function() {
            c.loading |= 2;
          }), c.loading |= 4, Ue(i, t, u);
        }
        i = {
          type: "stylesheet",
          instance: i,
          count: 1,
          state: c
        }, n.set(e, i);
      }
    }
  }
  function ey(l, t) {
    Ft.X(l, t);
    var a = _u;
    if (a && l) {
      var u = xa(a).hoistableScripts, n = Tu(l), e = u.get(n);
      e || (e = a.querySelector(sn(n)), e || (l = R({
        src: l,
        async: !0
      }, t), (t = Et.get(n)) && wc(l, t), e = a.createElement("script"), Cl(e), Zl(e, "link", l), a.head.appendChild(e)), e = {
        type: "script",
        instance: e,
        count: 1,
        state: null
      }, u.set(n, e));
    }
  }
  function iy(l, t) {
    Ft.M(l, t);
    var a = _u;
    if (a && l) {
      var u = xa(a).hoistableScripts, n = Tu(l), e = u.get(n);
      e || (e = a.querySelector(sn(n)), e || (l = R({
        src: l,
        async: !0,
        type: "module"
      }, t), (t = Et.get(n)) && wc(l, t), e = a.createElement("script"), Cl(e), Zl(e, "link", l), a.head.appendChild(e)), e = {
        type: "script",
        instance: e,
        count: 1,
        state: null
      }, u.set(n, e));
    }
  }
  function Q1(l, t, a, u) {
    var n = (n = J.current) ? De(n) : null;
    if (!n) throw Error(h(446));
    switch (l) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof a.precedence == "string" && typeof a.href == "string" ? (t = Eu(a.href), a = xa(n).hoistableStyles, u = a.get(t), u || (u = {
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
          var e = xa(n).hoistableStyles, i = e.get(l);
          if (i || (n = n.ownerDocument || n, i = {
            type: "stylesheet",
            instance: null,
            count: 0,
            state: {
              loading: 0,
              preload: null
            }
          }, e.set(l, i), (e = n.querySelector(hn(l))) && !e._p && (i.instance = e, i.state.loading = 5), Et.has(l) || (a = {
            rel: "preload",
            as: "style",
            href: a.href,
            crossOrigin: a.crossOrigin,
            integrity: a.integrity,
            media: a.media,
            hrefLang: a.hrefLang,
            referrerPolicy: a.referrerPolicy
          }, Et.set(l, a), e || cy(n, l, a, i.state))), t && u === null) throw Error(h(528, ""));
          return i;
        }
        if (t && u !== null) throw Error(h(529, ""));
        return null;
      case "script":
        return t = a.async, a = a.src, typeof a == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Tu(a), a = xa(n).hoistableScripts, u = a.get(t), u || (u = {
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
        throw Error(h(444, l));
    }
  }
  function Eu(l) {
    return 'href="' + ht(l) + '"';
  }
  function hn(l) {
    return 'link[rel="stylesheet"][' + l + "]";
  }
  function Z1(l) {
    return R({}, l, {
      "data-precedence": l.precedence,
      precedence: null
    });
  }
  function cy(l, t, a, u) {
    l.querySelector('link[rel="preload"][as="style"][' + t + "]") ? u.loading = 1 : (t = l.createElement("link"), u.preload = t, t.addEventListener("load", function() {
      return u.loading |= 1;
    }), t.addEventListener("error", function() {
      return u.loading |= 2;
    }), Zl(t, "link", a), Cl(t), l.head.appendChild(t));
  }
  function Tu(l) {
    return '[src="' + ht(l) + '"]';
  }
  function sn(l) {
    return "script[async]" + l;
  }
  function L1(l, t, a) {
    if (t.count++, t.instance === null) switch (t.type) {
      case "style":
        var u = l.querySelector('style[data-href~="' + ht(a.href) + '"]');
        if (u) return t.instance = u, Cl(u), u;
        var n = R({}, a, {
          "data-href": a.href,
          "data-precedence": a.precedence,
          href: null,
          precedence: null
        });
        return u = (l.ownerDocument || l).createElement("style"), Cl(u), Zl(u, "style", n), Ue(u, a.precedence, l), t.instance = u;
      case "stylesheet":
        n = Eu(a.href);
        var e = l.querySelector(hn(n));
        if (e) return t.state.loading |= 4, t.instance = e, Cl(e), e;
        u = Z1(a), (n = Et.get(n)) && Jc(u, n), e = (l.ownerDocument || l).createElement("link"), Cl(e);
        var i = e;
        return i._p = new Promise(function(c, f) {
          i.onload = c, i.onerror = f;
        }), Zl(e, "link", u), t.state.loading |= 4, Ue(e, a.precedence, l), t.instance = e;
      case "script":
        return e = Tu(a.src), (n = l.querySelector(sn(e))) ? (t.instance = n, Cl(n), n) : (u = a, (n = Et.get(e)) && (u = R({}, a), wc(u, n)), l = l.ownerDocument || l, n = l.createElement("script"), Cl(n), Zl(n, "link", u), l.head.appendChild(n), t.instance = n);
      case "void":
        return null;
      default:
        throw Error(h(443, t.type));
    }
    else t.type === "stylesheet" && (t.state.loading & 4) === 0 && (u = t.instance, t.state.loading |= 4, Ue(u, a.precedence, l));
    return t.instance;
  }
  function Ue(l, t, a) {
    for (var u = a.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'), n = u.length ? u[u.length - 1] : null, e = n, i = 0; i < u.length; i++) {
      var c = u[i];
      if (c.dataset.precedence === t) e = c;
      else if (e !== n) break;
    }
    e ? e.parentNode.insertBefore(l, e.nextSibling) : (t = a.nodeType === 9 ? a.head : a, t.insertBefore(l, t.firstChild));
  }
  function Jc(l, t) {
    l.crossOrigin ??= t.crossOrigin, l.referrerPolicy ??= t.referrerPolicy, l.title ??= t.title;
  }
  function wc(l, t) {
    l.crossOrigin ??= t.crossOrigin, l.referrerPolicy ??= t.referrerPolicy, l.integrity ??= t.integrity;
  }
  var Ne = null;
  function V1(l, t, a) {
    if (Ne === null) {
      var u = /* @__PURE__ */ new Map(), n = Ne = /* @__PURE__ */ new Map();
      n.set(a, u);
    } else n = Ne, u = n.get(a), u || (u = /* @__PURE__ */ new Map(), n.set(a, u));
    if (u.has(l)) return u;
    for (u.set(l, null), a = a.getElementsByTagName(l), n = 0; n < a.length; n++) {
      var e = a[n];
      if (!(e[Nu] || e[ql] || l === "link" && e.getAttribute("rel") === "stylesheet") && e.namespaceURI !== "http://www.w3.org/2000/svg") {
        var i = e.getAttribute(t) || "";
        i = l + i;
        var c = u.get(i);
        c ? c.push(e) : u.set(i, [e]);
      }
    }
    return u;
  }
  function x1(l, t, a) {
    l = l.ownerDocument || l, l.head.insertBefore(a, t === "title" ? l.querySelector("head > title") : null);
  }
  function fy(l, t, a) {
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
  function K1(l) {
    return !(l.type === "stylesheet" && (l.state.loading & 3) === 0);
  }
  function vy(l, t, a, u) {
    if (a.type === "stylesheet" && (typeof u.media != "string" || matchMedia(u.media).matches !== !1) && (a.state.loading & 4) === 0) {
      if (a.instance === null) {
        var n = Eu(u.href), e = t.querySelector(hn(n));
        if (e) {
          t = e._p, t !== null && typeof t == "object" && typeof t.then == "function" && (l.count++, l = pe.bind(l), t.then(l, l)), a.state.loading |= 4, a.instance = e, Cl(e);
          return;
        }
        e = t.ownerDocument || t, u = Z1(u), (n = Et.get(n)) && Jc(u, n), e = e.createElement("link"), Cl(e);
        var i = e;
        i._p = new Promise(function(c, f) {
          i.onload = c, i.onerror = f;
        }), Zl(e, "link", u), a.instance = e;
      }
      l.stylesheets === null && (l.stylesheets = /* @__PURE__ */ new Map()), l.stylesheets.set(a, t), (t = a.state.preload) && (a.state.loading & 3) === 0 && (l.count++, a = pe.bind(l), t.addEventListener("load", a), t.addEventListener("error", a));
    }
  }
  var Wc = 0;
  function dy(l, t) {
    return l.stylesheets && l.count === 0 && je(l, l.stylesheets), 0 < l.count || 0 < l.imgCount ? function(a) {
      var u = setTimeout(function() {
        if (l.stylesheets && je(l, l.stylesheets), l.unsuspend) {
          var e = l.unsuspend;
          l.unsuspend = null, e();
        }
      }, 6e4 + t);
      0 < l.imgBytes && Wc === 0 && (Wc = 62500 * xm());
      var n = setTimeout(function() {
        if (l.waitingForImages = !1, l.count === 0 && (l.stylesheets && je(l, l.stylesheets), l.unsuspend)) {
          var e = l.unsuspend;
          l.unsuspend = null, e();
        }
      }, (l.imgBytes > Wc ? 50 : 800) + t);
      return l.unsuspend = a, function() {
        l.unsuspend = null, clearTimeout(u), clearTimeout(n);
      };
    } : null;
  }
  function pe() {
    if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
      if (this.stylesheets) je(this, this.stylesheets);
      else if (this.unsuspend) {
        var l = this.unsuspend;
        this.unsuspend = null, l();
      }
    }
  }
  var He = null;
  function je(l, t) {
    l.stylesheets = null, l.unsuspend !== null && (l.count++, He = /* @__PURE__ */ new Map(), t.forEach(my, l), He = null, pe.call(l));
  }
  function my(l, t) {
    if (!(t.state.loading & 4)) {
      var a = He.get(l);
      if (a) var u = a.get(null);
      else {
        a = /* @__PURE__ */ new Map(), He.set(l, a);
        for (var n = l.querySelectorAll("link[data-precedence],style[data-precedence]"), e = 0; e < n.length; e++) {
          var i = n[e];
          (i.nodeName === "LINK" || i.getAttribute("media") !== "not all") && (a.set(i.dataset.precedence, i), u = i);
        }
        u && a.set(null, u);
      }
      n = t.instance, i = n.getAttribute("data-precedence"), e = a.get(i) || u, e === u && a.set(null, n), a.set(i, n), this.count++, u = pe.bind(this), n.addEventListener("load", u), n.addEventListener("error", u), e ? e.parentNode.insertBefore(n, e.nextSibling) : (l = l.nodeType === 9 ? l.head : l, l.insertBefore(n, l.firstChild)), t.state.loading |= 4;
    }
  }
  var on = {
    $$typeof: _l,
    Provider: null,
    Consumer: null,
    _currentValue: ll,
    _currentValue2: ll,
    _threadCount: 0
  };
  function yy(l, t, a, u, n, e, i, c, f) {
    this.tag = 1, this.containerInfo = l, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Ke(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Ke(0), this.hiddenUpdates = Ke(null), this.identifierPrefix = u, this.onUncaughtError = n, this.onCaughtError = e, this.onRecoverableError = i, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = f, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function hy(l, t, a, u, n, e, i, c, f, o, b, z) {
    return l = new yy(l, t, a, i, f, o, b, z, c), t = 1, e === !0 && (t |= 24), e = ct(3, null, null, t), l.current = e, e.stateNode = l, t = Ui(), t.refCount++, l.pooledCache = t, t.refCount++, e.memoizedState = {
      element: u,
      isDehydrated: a,
      cache: t
    }, ji(e), l;
  }
  function sy(l) {
    return l ? (l = lu, l) : lu;
  }
  function J1(l, t, a, u, n, e) {
    n = sy(n), u.context === null ? u.context = n : u.pendingContext = n, u = Ya(t), u.payload = { element: a }, e = e === void 0 ? null : e, e !== null && (u.callback = e), a = qa(l, u, t), a !== null && (lt(a, l, t), Ju(a, l, t));
  }
  function w1(l, t) {
    if (l = l.memoizedState, l !== null && l.dehydrated !== null) {
      var a = l.retryLane;
      l.retryLane = a !== 0 && a < t ? a : t;
    }
  }
  function $c(l, t) {
    w1(l, t), (l = l.alternate) && w1(l, t);
  }
  function W1(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = Da(l, 67108864);
      t !== null && lt(t, l, 67108864), $c(l, 67108864);
    }
  }
  function $1(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = zt();
      t = sf(t);
      var a = Da(l, t);
      a !== null && lt(a, l, t), $c(l, t);
    }
  }
  var Re = !0;
  function oy(l, t, a, u) {
    var n = E.T;
    E.T = null;
    var e = M.p;
    try {
      M.p = 2, kc(l, t, a, u);
    } finally {
      M.p = e, E.T = n;
    }
  }
  function gy(l, t, a, u) {
    var n = E.T;
    E.T = null;
    var e = M.p;
    try {
      M.p = 8, kc(l, t, a, u);
    } finally {
      M.p = e, E.T = n;
    }
  }
  function kc(l, t, a, u) {
    if (Re) {
      var n = Fc(u);
      if (n === null) Yc(l, t, u, Be, a), F1(l, u);
      else if (by(n, l, t, a, u)) u.stopPropagation();
      else if (F1(l, u), t & 4 && -1 < Sy.indexOf(l)) {
        for (; n !== null; ) {
          var e = Va(n);
          if (e !== null) switch (e.tag) {
            case 3:
              if (e = e.stateNode, e.current.memoizedState.isDehydrated) {
                var i = Ea(e.pendingLanes);
                if (i !== 0) {
                  var c = e;
                  for (c.pendingLanes |= 2, c.entangledLanes |= 2; i; ) {
                    var f = 1 << 31 - et(i);
                    c.entanglements[1] |= f, i &= ~f;
                  }
                  kt(e), (ul & 6) === 0 && (ge = ut() + 500, vn(0, !1));
                }
              }
              break;
            case 31:
            case 13:
              c = Da(e, 2), c !== null && lt(c, e, 2), be(), $c(e, 2);
          }
          if (e = Fc(u), e === null && Yc(l, t, u, Be, a), e === n) break;
          n = e;
        }
        n !== null && u.stopPropagation();
      } else Yc(l, t, u, null, a);
    }
  }
  function Fc(l) {
    return l = li(l), Ic(l);
  }
  var Be = null;
  function Ic(l) {
    if (Be = null, l = La(l), l !== null) {
      var t = x(l);
      if (t === null) l = null;
      else {
        var a = t.tag;
        if (a === 13) {
          if (l = Q(t), l !== null) return l;
          l = null;
        } else if (a === 31) {
          if (l = X(t), l !== null) return l;
          l = null;
        } else if (a === 3) {
          if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
          l = null;
        } else t !== l && (l = null);
      }
    }
    return Be = l, null;
  }
  function k1(l) {
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
        switch (dd()) {
          case cf:
            return 2;
          case ff:
            return 8;
          case En:
          case md:
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
  var Pc = !1, ga = null, Sa = null, ba = null, gn = /* @__PURE__ */ new Map(), Sn = /* @__PURE__ */ new Map(), ra = [], Sy = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");
  function F1(l, t) {
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
        ba = null;
        break;
      case "pointerover":
      case "pointerout":
        gn.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        Sn.delete(t.pointerId);
    }
  }
  function bn(l, t, a, u, n, e) {
    return l === null || l.nativeEvent !== e ? (l = {
      blockedOn: t,
      domEventName: a,
      eventSystemFlags: u,
      nativeEvent: e,
      targetContainers: [n]
    }, t !== null && (t = Va(t), t !== null && W1(t)), l) : (l.eventSystemFlags |= u, t = l.targetContainers, n !== null && t.indexOf(n) === -1 && t.push(n), l);
  }
  function by(l, t, a, u, n) {
    switch (t) {
      case "focusin":
        return ga = bn(ga, l, t, a, u, n), !0;
      case "dragenter":
        return Sa = bn(Sa, l, t, a, u, n), !0;
      case "mouseover":
        return ba = bn(ba, l, t, a, u, n), !0;
      case "pointerover":
        var e = n.pointerId;
        return gn.set(e, bn(gn.get(e) || null, l, t, a, u, n)), !0;
      case "gotpointercapture":
        return e = n.pointerId, Sn.set(e, bn(Sn.get(e) || null, l, t, a, u, n)), !0;
    }
    return !1;
  }
  function I1(l) {
    var t = La(l.target);
    if (t !== null) {
      var a = x(t);
      if (a !== null) {
        if (t = a.tag, t === 13) {
          if (t = Q(a), t !== null) {
            l.blockedOn = t, gf(l.priority, function() {
              $1(a);
            });
            return;
          }
        } else if (t === 31) {
          if (t = X(a), t !== null) {
            l.blockedOn = t, gf(l.priority, function() {
              $1(a);
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
  function Ce(l) {
    if (l.blockedOn !== null) return !1;
    for (var t = l.targetContainers; 0 < t.length; ) {
      var a = Fc(l.nativeEvent);
      if (a === null) {
        a = l.nativeEvent;
        var u = new a.constructor(a.type, a);
        Pe = u, a.target.dispatchEvent(u), Pe = null;
      } else return t = Va(a), t !== null && W1(t), l.blockedOn = a, !1;
      t.shift();
    }
    return !0;
  }
  function P1(l, t, a) {
    Ce(l) && a.delete(t);
  }
  function ry() {
    Pc = !1, ga !== null && Ce(ga) && (ga = null), Sa !== null && Ce(Sa) && (Sa = null), ba !== null && Ce(ba) && (ba = null), gn.forEach(P1), Sn.forEach(P1);
  }
  function Ye(l, t) {
    l.blockedOn === t && (l.blockedOn = null, Pc || (Pc = !0, A.unstable_scheduleCallback(A.unstable_NormalPriority, ry)));
  }
  var qe = null;
  function ld(l) {
    qe !== l && (qe = l, A.unstable_scheduleCallback(A.unstable_NormalPriority, function() {
      qe === l && (qe = null);
      for (var t = 0; t < l.length; t += 3) {
        var a = l[t], u = l[t + 1], n = l[t + 2];
        if (typeof u != "function") {
          if (Ic(u || a) === null) continue;
          break;
        }
        var e = Va(a);
        e !== null && (l.splice(t, 3), t -= 3, Ii(e, {
          pending: !0,
          data: n,
          method: a.method,
          action: u
        }, u, n));
      }
    }));
  }
  function Au(l) {
    function t(f) {
      return Ye(f, l);
    }
    ga !== null && Ye(ga, l), Sa !== null && Ye(Sa, l), ba !== null && Ye(ba, l), gn.forEach(t), Sn.forEach(t);
    for (var a = 0; a < ra.length; a++) {
      var u = ra[a];
      u.blockedOn === l && (u.blockedOn = null);
    }
    for (; 0 < ra.length && (a = ra[0], a.blockedOn === null); ) I1(a), a.blockedOn === null && ra.shift();
    if (a = (l.ownerDocument || l).$$reactFormReplay, a != null) for (u = 0; u < a.length; u += 3) {
      var n = a[u], e = a[u + 1], i = n[Wl] || null;
      if (typeof e == "function") i || ld(a);
      else if (i) {
        var c = null;
        if (e && e.hasAttribute("formAction")) {
          if (n = e, i = e[Wl] || null) c = i.formAction;
          else if (Ic(n) !== null) continue;
        } else c = i.action;
        typeof c == "function" ? a[u + 1] = c : (a.splice(u, 3), u -= 3), ld(a);
      }
    }
  }
  function zy() {
    function l(e) {
      e.canIntercept && e.info === "react-transition" && e.intercept({
        handler: function() {
          return new Promise(function(i) {
            return n = i;
          });
        },
        focusReset: "manual",
        scroll: "manual"
      });
    }
    function t() {
      n !== null && (n(), n = null), u || setTimeout(a, 20);
    }
    function a() {
      if (!u && !navigation.transition) {
        var e = navigation.currentEntry;
        e && e.url != null && navigation.navigate(e.url, {
          state: e.getState(),
          info: "react-transition",
          history: "replace"
        });
      }
    }
    if (typeof navigation == "object") {
      var u = !1, n = null;
      return navigation.addEventListener("navigate", l), navigation.addEventListener("navigatesuccess", t), navigation.addEventListener("navigateerror", t), setTimeout(a, 100), function() {
        u = !0, navigation.removeEventListener("navigate", l), navigation.removeEventListener("navigatesuccess", t), navigation.removeEventListener("navigateerror", t), n !== null && (n(), n = null);
      };
    }
  }
  function lf(l) {
    this._internalRoot = l;
  }
  tf.prototype.render = lf.prototype.render = function(l) {
    var t = this._internalRoot;
    if (t === null) throw Error(h(409));
    var a = t.current;
    J1(a, zt(), l, t, null, null);
  }, tf.prototype.unmount = lf.prototype.unmount = function() {
    var l = this._internalRoot;
    if (l !== null) {
      this._internalRoot = null;
      var t = l.containerInfo;
      J1(l.current, 2, null, l, null, null), be(), t[Uu] = null;
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
      for (var a = 0; a < ra.length && t !== 0 && t < ra[a].priority; a++) ;
      ra.splice(a, 0, l), a === 0 && I1(l);
    }
  };
  var td = U.version;
  if (td !== "19.2.8") throw Error(h(527, td, "19.2.8"));
  M.findDOMNode = function(l) {
    var t = l._reactInternals;
    if (t === void 0)
      throw typeof l.render == "function" ? Error(h(188)) : (l = Object.keys(l).join(","), Error(h(268, l)));
    return l = T(t), l = l !== null ? q(l) : null, l = l === null ? null : l.stateNode, l;
  };
  var _y = {
    bundleType: 0,
    version: "19.2.8",
    rendererPackageName: "react-dom",
    currentDispatcherRef: E,
    reconcilerVersion: "19.2.8"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Ge = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Ge.isDisabled && Ge.supportsFiber) try {
      Mu = Ge.inject(_y), nt = Ge;
    } catch {
    }
  }
  y.createRoot = function(l, t) {
    if (!V(l)) throw Error(h(299));
    var a = !1, u = "", n = gm, e = Sm, i = bm;
    return t != null && (t.unstable_strictMode === !0 && (a = !0), t.identifierPrefix !== void 0 && (u = t.identifierPrefix), t.onUncaughtError !== void 0 && (n = t.onUncaughtError), t.onCaughtError !== void 0 && (e = t.onCaughtError), t.onRecoverableError !== void 0 && (i = t.onRecoverableError)), t = hy(l, 1, !1, null, null, a, u, null, n, e, i, zy), l[Uu] = t.current, E1(l), new lf(t);
  };
})), Cy = /* @__PURE__ */ Ht(((y, A) => {
  function U() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(U);
      } catch (C) {
        console.error(C);
      }
  }
  U(), A.exports = By();
})), Yy = /* @__PURE__ */ Ht(((y) => {
  var A = Symbol.for("react.transitional.element"), U = Symbol.for("react.fragment");
  function C(h, V, x) {
    var Q = null;
    if (x !== void 0 && (Q = "" + x), V.key !== void 0 && (Q = "" + V.key), "key" in V) {
      x = {};
      for (var X in V) X !== "key" && (x[X] = V[X]);
    } else x = V;
    return V = x.ref, {
      $$typeof: A,
      type: h,
      key: Q,
      ref: V !== void 0 ? V : null,
      props: x
    };
  }
  y.Fragment = U, y.jsx = C, y.jsxs = C;
})), qy = /* @__PURE__ */ Ht(((y, A) => {
  A.exports = Yy();
})), ol = /* @__PURE__ */ Uy(uf()), Gy = Cy(), H = qy();
function wy({ titel: y, symbol: A, beschreibung: U, aktionen: C, mittig: h = !1 }) {
  return /* @__PURE__ */ (0, H.jsxs)("div", {
    className: "ara-kopf",
    "data-mittig": h ? "true" : void 0,
    children: [/* @__PURE__ */ (0, H.jsxs)("div", {
      className: "ara-kopf__text",
      children: [/* @__PURE__ */ (0, H.jsxs)("h1", {
        className: "ara-kopf__titel",
        children: [A && /* @__PURE__ */ (0, H.jsx)("span", {
          className: "ara-kopf__symbol",
          "aria-hidden": "true",
          children: A
        }), y]
      }), U && /* @__PURE__ */ (0, H.jsx)("p", {
        className: "ara-kopf__satz",
        children: U
      })]
    }), C && /* @__PURE__ */ (0, H.jsx)("div", {
      className: "ara-kopf__aktionen",
      children: C
    })]
  });
}
function Wy({ beschriftung: y, dicht: A = !1, children: U }) {
  return /* @__PURE__ */ (0, H.jsxs)("div", { children: [y && /* @__PURE__ */ (0, H.jsx)("div", {
    className: "ara-liste__beschriftung",
    children: y
  }), /* @__PURE__ */ (0, H.jsx)("ul", {
    className: "ara-liste",
    "data-dicht": A ? "true" : void 0,
    "aria-label": y,
    children: U
  })] });
}
function $y({ titel: y, symbol: A, hinweis: U, unterzeile: C, erklaerung: h, onKlick: V, aktiv: x = !1, kennzeichen: Q }) {
  const X = /* @__PURE__ */ (0, H.jsxs)(H.Fragment, { children: [
    A && /* @__PURE__ */ (0, H.jsx)("span", {
      className: "ara-liste__symbol",
      "aria-hidden": "true",
      children: A
    }),
    /* @__PURE__ */ (0, H.jsxs)("span", {
      className: "ara-liste__text",
      children: [/* @__PURE__ */ (0, H.jsx)("span", {
        className: "ara-liste__wort",
        children: y
      }), C && /* @__PURE__ */ (0, H.jsx)("span", {
        className: "ara-liste__unterzeile",
        children: C
      })]
    }),
    U && /* @__PURE__ */ (0, H.jsx)("span", {
      className: "ara-liste__hinweis",
      children: U
    })
  ] });
  return /* @__PURE__ */ (0, H.jsx)("li", { children: V ? /* @__PURE__ */ (0, H.jsx)("button", {
    type: "button",
    className: "ara-liste__eintrag",
    "data-aktiv": x ? "true" : "false",
    "aria-current": x ? "true" : void 0,
    "data-testid": Q,
    title: h,
    onClick: V,
    children: X
  }) : /* @__PURE__ */ (0, H.jsx)("div", {
    className: "ara-liste__eintrag",
    "data-aktiv": x ? "true" : "false",
    "data-testid": Q,
    title: h,
    children: X
  }) });
}
function ky({ titel: y, hinweis: A, symbol: U, onKlick: C, kennzeichen: h, children: V }) {
  const x = /* @__PURE__ */ (0, H.jsxs)(H.Fragment, { children: [(y || A || U) && /* @__PURE__ */ (0, H.jsxs)("div", {
    className: "ara-karte__kopf",
    children: [
      U && /* @__PURE__ */ (0, H.jsx)("span", {
        className: "ara-liste__symbol",
        "aria-hidden": "true",
        children: U
      }),
      y && /* @__PURE__ */ (0, H.jsx)("h2", {
        className: "ara-karte__titel",
        children: y
      }),
      A && /* @__PURE__ */ (0, H.jsx)("span", {
        className: "ara-karte__hinweis",
        children: A
      })
    ]
  }), V && /* @__PURE__ */ (0, H.jsx)("div", {
    className: "ara-karte__inhalt",
    children: V
  })] });
  return C ? /* @__PURE__ */ (0, H.jsx)("button", {
    type: "button",
    className: "ara-karte",
    "data-testid": h,
    onClick: C,
    children: x
  }) : /* @__PURE__ */ (0, H.jsx)("div", {
    className: "ara-karte",
    "data-testid": h,
    children: x
  });
}
function Fy({ onAbsenden: y, aktionen: A, kennzeichen: U, children: C }) {
  const h = (V) => {
    V.preventDefault(), y?.();
  };
  return /* @__PURE__ */ (0, H.jsxs)("form", {
    className: "ara-formular",
    "data-testid": U,
    onSubmit: h,
    noValidate: !0,
    children: [C, A && /* @__PURE__ */ (0, H.jsx)("div", {
      className: "ara-formular__aktionen",
      children: A
    })]
  });
}
function Iy({ kennung: y, beschriftung: A, hinweis: U, children: C }) {
  return /* @__PURE__ */ (0, H.jsxs)("div", {
    className: "ara-feld",
    children: [
      /* @__PURE__ */ (0, H.jsx)("label", {
        className: "ara-feld__beschriftung",
        htmlFor: y,
        children: A
      }),
      C,
      U && /* @__PURE__ */ (0, H.jsx)("p", {
        className: "ara-feld__hinweis",
        children: U
      })
    ]
  });
}
function rn({ art: y = "still", typ: A = "knopf", onKlick: U, gesperrt: C = !1, kennzeichen: h, beschriftung: V, children: x }) {
  return /* @__PURE__ */ (0, H.jsx)("button", {
    type: A === "absenden" ? "submit" : "button",
    className: "ara-knopf",
    "data-art": y,
    "data-testid": h,
    "aria-label": V,
    disabled: C,
    onClick: U,
    children: x
  });
}
function Py({ art: y = "hinweis", titel: A, kennzeichen: U, children: C }) {
  return /* @__PURE__ */ (0, H.jsxs)("div", {
    className: "ara-meldung",
    "data-art": y,
    "data-testid": U,
    role: y === "fehler" ? "alert" : "status",
    children: [A && /* @__PURE__ */ (0, H.jsx)("p", {
      className: "ara-meldung__titel",
      children: A
    }), C]
  });
}
function ad(y) {
  return y ? [...y.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')] : [];
}
function lh({ offen: y, onSchliessen: A, titel: U = "Menü", kennzeichen: C, children: h }) {
  const V = (0, ol.useRef)(null), x = (0, ol.useRef)(null);
  return (0, ol.useEffect)(() => {
    if (!y) return;
    x.current = document.activeElement;
    const Q = (X) => {
      if (X.key === "Escape") {
        A();
        return;
      }
      if (X.key !== "Tab") return;
      const N = ad(V.current);
      if (N.length === 0) return;
      const T = N[0], q = N[N.length - 1], R = document.activeElement;
      X.shiftKey && (R === T || !V.current?.contains(R)) ? (X.preventDefault(), q.focus()) : !X.shiftKey && R === q && (X.preventDefault(), T.focus());
    };
    return document.addEventListener("keydown", Q), ad(V.current)[0]?.focus(), () => {
      document.removeEventListener("keydown", Q), x.current?.focus?.();
    };
  }, [y, A]), y ? /* @__PURE__ */ (0, H.jsxs)(H.Fragment, { children: [/* @__PURE__ */ (0, H.jsx)("button", {
    type: "button",
    className: "ara-menue__schleier",
    "aria-label": `${U} schließen`,
    onClick: A
  }), /* @__PURE__ */ (0, H.jsxs)("div", {
    className: "ara-menue",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": U,
    "data-testid": C,
    ref: V,
    children: [/* @__PURE__ */ (0, H.jsxs)("div", {
      className: "ara-menue__kopf",
      children: [/* @__PURE__ */ (0, H.jsx)("span", { children: U }), /* @__PURE__ */ (0, H.jsx)("button", {
        type: "button",
        className: "ara-menue__zu",
        "aria-label": `${U} schließen`,
        onClick: A,
        children: "×"
      })]
    }), /* @__PURE__ */ (0, H.jsx)("div", {
      className: "ara-menue__inhalt",
      children: h
    })]
  })] }) : null;
}
var th = 900;
function ah(y = 900) {
  const [A, U] = (0, ol.useState)(() => typeof window > "u" || typeof window.matchMedia != "function" ? !1 : window.matchMedia(`(max-width: ${y - 1}px)`).matches);
  return (0, ol.useEffect)(() => {
    if (typeof window > "u" || typeof window.matchMedia != "function") return;
    const C = window.matchMedia(`(max-width: ${y - 1}px)`), h = () => U(C.matches);
    return h(), typeof C.addEventListener == "function" ? (C.addEventListener("change", h), () => C.removeEventListener("change", h)) : (C.addListener?.(h), () => C.removeListener?.(h));
  }, [y]), A;
}
var uh = "4.1.0", Xy = 0.25, Qy = 4, Zy = 24;
function ud(y) {
  return Math.min(Qy, Math.max(Xy, y));
}
var Ly = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/;
function Vy(y, A) {
  if (A) return A;
  if (typeof y != "string")
    return y.type === "application/pdf" ? "pdf" : y.type.startsWith("image/") ? "bild" : null;
  if (y.startsWith("data:image/")) return "bild";
  if (y.startsWith("data:application/pdf")) return "pdf";
  const U = (y.split("?")[0] ?? "").toLowerCase();
  return U.endsWith(".pdf") ? "pdf" : Ly.test(U) ? "bild" : null;
}
function zn(y) {
  return new URL("pdf-dateien/" + y, import.meta.url).toString();
}
var nd = null;
function xy() {
  return nd ??= import("./marken-pdf.js").then((y) => (!y.GlobalWorkerOptions.workerSrc && !y.GlobalWorkerOptions.workerPort && (y.GlobalWorkerOptions.workerSrc = zn("pdf.worker.min.js")), y)), nd;
}
var af = "Das Dokument ließ sich nicht öffnen.", Ky = "Dieses Format kann hier nicht angezeigt werden.";
function Jy(y) {
  return y instanceof Error && y.name === "RenderingCancelledException";
}
function nh({ quelle: y, art: A, name: U, leerHinweis: C = "Kein Dokument ausgewählt.", hoehe: h, kennzeichen: V, className: x }) {
  const [Q, X] = ol.useState({ stufe: "leer" }), [N, T] = ol.useState(1), [q, R] = ol.useState(0), [zl, Hl] = ol.useState(null), [Ml, Rl] = ol.useState(!1), [Tt, Ll] = ol.useState(null), At = ol.useRef(null), _l = ol.useRef(null), wl = ol.useRef(null), Vl = ol.useRef(null), El = U ?? (y instanceof File ? y.name : void 0);
  ol.useEffect(() => {
    if (T(1), R(0), Hl(null), Ll(null), y == null || y === "") {
      X({ stufe: "leer" });
      return;
    }
    const $ = Vy(y, A);
    if (!$) {
      X({
        stufe: "fehler",
        meldung: Ky
      });
      return;
    }
    if ($ === "bild") {
      if (typeof y == "string") {
        X({
          stufe: "bild",
          url: y
        });
        return;
      }
      const gl = URL.createObjectURL(y);
      return X({
        stufe: "bild",
        url: gl
      }), () => URL.revokeObjectURL(gl);
    }
    let Sl = !1, Bl;
    return X({ stufe: "laden" }), (async () => {
      try {
        const gl = await xy(), O = typeof y == "string" ? { url: y } : { data: new Uint8Array(await y.arrayBuffer()) };
        if (Sl) return;
        Bl = gl.getDocument({
          ...O,
          cMapUrl: zn("cmaps/"),
          cMapPacked: !0,
          standardFontDataUrl: zn("standard_fonts/"),
          wasmUrl: zn("wasm/"),
          iccUrl: zn("iccs/")
        });
        const E = await Bl.promise;
        if (Sl) return;
        R(E.numPages), X({
          stufe: "pdf",
          dokument: E
        });
      } catch {
        Sl || X({
          stufe: "fehler",
          meldung: af
        });
      }
    })(), () => {
      Sl = !0, Bl?.destroy().catch(() => {
      });
    };
  }, [y, A]), ol.useEffect(() => {
    if (Q.stufe !== "pdf") return;
    let $ = !1, Sl;
    return (async () => {
      try {
        const Bl = await Q.dokument.getPage(N);
        if ($) return;
        if (zl === null) {
          const ll = _l.current?.clientWidth ?? 640, dl = Bl.getViewport({ scale: 1 });
          Hl(ud((ll - Zy) / dl.width));
          return;
        }
        const gl = wl.current;
        if (!gl) return;
        const O = Bl.getViewport({ scale: zl }), E = window.devicePixelRatio || 1;
        gl.width = Math.floor(O.width * E), gl.height = Math.floor(O.height * E), gl.style.width = `${Math.floor(O.width)}px`, gl.style.height = `${Math.floor(O.height)}px`;
        const M = gl.getContext("2d");
        if (!M) return;
        Sl = Bl.render({
          canvasContext: M,
          viewport: O,
          transform: E !== 1 ? [
            E,
            0,
            0,
            E,
            0,
            0
          ] : void 0
        }), await Sl.promise;
      } catch (Bl) {
        !$ && !Jy(Bl) && X({
          stufe: "fehler",
          meldung: af
        });
      }
    })(), () => {
      $ = !0, Sl?.cancel();
    };
  }, [
    Q,
    N,
    zl
  ]), ol.useEffect(() => {
    if (!Ml) return;
    const $ = (Bl) => {
      Bl.key === "Escape" && Rl(!1);
    }, Sl = () => {
      document.fullscreenElement || Rl(!1);
    };
    return document.addEventListener("keydown", $), document.addEventListener("fullscreenchange", Sl), () => {
      document.removeEventListener("keydown", $), document.removeEventListener("fullscreenchange", Sl);
    };
  }, [Ml]);
  const P = () => {
    if (Ml) {
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
    if (zl !== null) return zl;
    const $ = Vl.current;
    return $ && $.naturalWidth > 0 ? $.clientWidth / $.naturalWidth : 1;
  }, tt = ($) => {
    Hl(ud(xl() * $));
  }, jt = Q.stufe === "pdf" || Q.stufe === "bild";
  return /* @__PURE__ */ (0, H.jsxs)("div", {
    ref: At,
    className: x ? `ara-dokumentanzeige ${x}` : "ara-dokumentanzeige",
    "data-vollbild": Ml || void 0,
    "data-testid": V,
    style: h ? { "--ara-dokument-hoehe": h } : void 0,
    role: "group",
    "aria-label": El ? `Dokument ${El}` : "Dokumentanzeige",
    children: [jt && /* @__PURE__ */ (0, H.jsxs)("div", {
      className: "ara-dokumentanzeige__leiste",
      children: [
        /* @__PURE__ */ (0, H.jsx)("span", {
          className: "ara-dokumentanzeige__name",
          title: El,
          children: El
        }),
        Q.stufe === "pdf" && q > 1 && /* @__PURE__ */ (0, H.jsxs)("div", {
          className: "ara-dokumentanzeige__gruppe",
          children: [
            /* @__PURE__ */ (0, H.jsx)(rn, {
              beschriftung: "Vorige Seite",
              gesperrt: N <= 1,
              onKlick: () => T(($) => Math.max(1, $ - 1)),
              children: "‹"
            }),
            /* @__PURE__ */ (0, H.jsxs)("span", {
              className: "ara-dokumentanzeige__stand",
              "aria-live": "polite",
              children: [
                "Seite ",
                N,
                " von ",
                q
              ]
            }),
            /* @__PURE__ */ (0, H.jsx)(rn, {
              beschriftung: "Nächste Seite",
              gesperrt: N >= q,
              onKlick: () => T(($) => Math.min(q, $ + 1)),
              children: "›"
            })
          ]
        }),
        /* @__PURE__ */ (0, H.jsxs)("div", {
          className: "ara-dokumentanzeige__gruppe",
          children: [
            /* @__PURE__ */ (0, H.jsx)(rn, {
              beschriftung: "Verkleinern",
              onKlick: () => tt(0.8),
              children: "−"
            }),
            /* @__PURE__ */ (0, H.jsx)("span", {
              className: "ara-dokumentanzeige__stand",
              children: zl === null ? "passend" : `${Math.round(zl * 100)} %`
            }),
            /* @__PURE__ */ (0, H.jsx)(rn, {
              beschriftung: "Vergrößern",
              onKlick: () => tt(1.25),
              children: "+"
            }),
            /* @__PURE__ */ (0, H.jsx)(rn, {
              beschriftung: Ml ? "Vollbild verlassen" : "Vollbild",
              onKlick: P,
              children: /* @__PURE__ */ (0, H.jsx)("svg", {
                viewBox: "0 0 24 24",
                width: "14",
                height: "14",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                "aria-hidden": "true",
                children: /* @__PURE__ */ (0, H.jsx)("path", { d: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" })
              })
            })
          ]
        })
      ]
    }), /* @__PURE__ */ (0, H.jsxs)("div", {
      ref: _l,
      className: "ara-dokumentanzeige__flaeche",
      children: [
        Q.stufe === "leer" && /* @__PURE__ */ (0, H.jsx)("p", {
          className: "ara-dokumentanzeige__meldung",
          children: C
        }),
        Q.stufe === "laden" && /* @__PURE__ */ (0, H.jsxs)("p", {
          className: "ara-dokumentanzeige__meldung",
          role: "status",
          "aria-live": "polite",
          children: [/* @__PURE__ */ (0, H.jsx)("span", {
            className: "ara-dokumentanzeige__kreisel",
            "aria-hidden": "true"
          }), "Wird geladen …"]
        }),
        Q.stufe === "fehler" && /* @__PURE__ */ (0, H.jsx)("p", {
          className: "ara-dokumentanzeige__meldung",
          role: "alert",
          children: Q.meldung
        }),
        Q.stufe === "pdf" && /* @__PURE__ */ (0, H.jsx)("canvas", {
          ref: wl,
          className: "ara-dokumentanzeige__seite",
          role: "img",
          "aria-label": El ? `Seite ${N} von ${q} aus ${El}` : `Seite ${N} von ${q}`
        }),
        Q.stufe === "bild" && /* @__PURE__ */ (0, H.jsx)("img", {
          ref: Vl,
          src: Q.url,
          alt: El ?? "Bild",
          className: "ara-dokumentanzeige__bild",
          onLoad: ($) => Ll($.currentTarget.naturalWidth),
          onError: () => X({
            stufe: "fehler",
            meldung: af
          }),
          style: zl !== null && Tt ? {
            width: `${Math.round(Tt * zl)}px`,
            maxWidth: "none",
            maxHeight: "none"
          } : void 0
        })
      ]
    })]
  });
}
var eh = ol.createElement;
function ih(y, A) {
  (0, Gy.createRoot)(A).render(y);
}
var ch = ol.Fragment, fh = ol.useEffect, vh = ol.useMemo, dh = ol.useRef, mh = ol.useState;
export {
  nh as Dokumentanzeige,
  uh as FASSUNG,
  Iy as Feld,
  Fy as Formular,
  ch as Fragment,
  ky as Karte,
  rn as Knopf,
  wy as Kopf,
  Wy as Liste,
  $y as ListenEintrag,
  Py as Meldung,
  lh as Menue,
  th as SCHMAL_AB_PX,
  eh as h,
  ih as rendern,
  fh as useEffect,
  vh as useMemo,
  dh as useRef,
  ah as useSchmalesFenster,
  mh as useState
};
