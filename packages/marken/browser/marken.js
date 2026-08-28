var Ut = (b, O) => () => (O || (b((O = { exports: {} }).exports, O), b = null), O.exports), sd = /* @__PURE__ */ Ut(((b) => {
  var O = Symbol.for("react.transitional.element"), p = Symbol.for("react.portal"), j = Symbol.for("react.fragment"), S = Symbol.for("react.strict_mode"), ll = Symbol.for("react.profiler"), k = Symbol.for("react.consumer"), Al = Symbol.for("react.context"), dl = Symbol.for("react.forward_ref"), B = Symbol.for("react.suspense"), E = Symbol.for("react.memo"), X = Symbol.for("react.lazy"), C = Symbol.for("react.activity"), gt = Symbol.iterator;
  function Bl(y) {
    return y === null || typeof y != "object" ? null : (y = gt && y[gt] || y["@@iterator"], typeof y == "function" ? y : null);
  }
  var pl = {
    isMounted: function() {
      return !1;
    },
    enqueueForceUpdate: function() {
    },
    enqueueReplaceState: function() {
    },
    enqueueSetState: function() {
    }
  }, Kl = Object.assign, Wt = {};
  function xl(y, T, M) {
    this.props = y, this.context = T, this.refs = Wt, this.updater = M || pl;
  }
  xl.prototype.isReactComponent = {}, xl.prototype.setState = function(y, T) {
    if (typeof y != "object" && typeof y != "function" && y != null) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
    this.updater.enqueueSetState(this, y, T, "setState");
  }, xl.prototype.forceUpdate = function(y) {
    this.updater.enqueueForceUpdate(this, y, "forceUpdate");
  };
  function wt() {
  }
  wt.prototype = xl.prototype;
  function Ml(y, T, M) {
    this.props = y, this.context = T, this.refs = Wt, this.updater = M || pl;
  }
  var ot = Ml.prototype = new wt();
  ot.constructor = Ml, Kl(ot, xl.prototype), ot.isPureReactComponent = !0;
  var Jl = Array.isArray;
  function Wl() {
  }
  var w = {
    H: null,
    A: null,
    T: null,
    S: null
  }, jl = Object.prototype.hasOwnProperty;
  function Et(y, T, M) {
    var q = M.ref;
    return {
      $$typeof: O,
      type: y,
      key: T,
      ref: q !== void 0 ? q : null,
      props: M
    };
  }
  function za(y, T) {
    return Et(y.type, T, y.props);
  }
  function wl(y) {
    return typeof y == "object" && y !== null && y.$$typeof === O;
  }
  function At(y) {
    var T = {
      "=": "=0",
      ":": "=2"
    };
    return "$" + y.replace(/[=:]/g, function(M) {
      return T[M];
    });
  }
  var Za = /\/+/g;
  function bt(y, T) {
    return typeof y == "object" && y !== null && y.key != null ? At("" + y.key) : T.toString(36);
  }
  function U(y) {
    switch (y.status) {
      case "fulfilled":
        return y.value;
      case "rejected":
        throw y.reason;
      default:
        switch (typeof y.status == "string" ? y.then(Wl, Wl) : (y.status = "pending", y.then(function(T) {
          y.status === "pending" && (y.status = "fulfilled", y.value = T);
        }, function(T) {
          y.status === "pending" && (y.status = "rejected", y.reason = T);
        })), y.status) {
          case "fulfilled":
            return y.value;
          case "rejected":
            throw y.reason;
        }
    }
    throw y;
  }
  function A(y, T, M, q, Z) {
    var V = typeof y;
    (V === "undefined" || V === "boolean") && (y = null);
    var tl = !1;
    if (y === null) tl = !0;
    else switch (V) {
      case "bigint":
      case "string":
      case "number":
        tl = !0;
        break;
      case "object":
        switch (y.$$typeof) {
          case O:
          case p:
            tl = !0;
            break;
          case X:
            return tl = y._init, A(tl(y._payload), T, M, q, Z);
        }
    }
    if (tl) return Z = Z(y), tl = q === "" ? "." + bt(y, 0) : q, Jl(Z) ? (M = "", tl != null && (M = tl.replace(Za, "$&/") + "/"), A(Z, T, M, "", function(Ou) {
      return Ou;
    })) : Z != null && (wl(Z) && (Z = za(Z, M + (Z.key == null || y && y.key === Z.key ? "" : ("" + Z.key).replace(Za, "$&/") + "/") + tl)), T.push(Z)), 1;
    tl = 0;
    var Cl = q === "" ? "." : q + ":";
    if (Jl(y)) for (var sl = 0; sl < y.length; sl++) q = y[sl], V = Cl + bt(q, sl), tl += A(q, T, M, V, Z);
    else if (sl = Bl(y), typeof sl == "function") for (y = sl.call(y), sl = 0; !(q = y.next()).done; ) q = q.value, V = Cl + bt(q, sl++), tl += A(q, T, M, V, Z);
    else if (V === "object") {
      if (typeof y.then == "function") return A(U(y), T, M, q, Z);
      throw T = String(y), Error("Objects are not valid as a React child (found: " + (T === "[object Object]" ? "object with keys {" + Object.keys(y).join(", ") + "}" : T) + "). If you meant to render a collection of children, use an array instead.");
    }
    return tl;
  }
  function D(y, T, M) {
    if (y == null) return y;
    var q = [], Z = 0;
    return A(y, q, "", "", function(V) {
      return T.call(M, V, Z++);
    }), q;
  }
  function I(y) {
    if (y._status === -1) {
      var T = y._result;
      T = T(), T.then(function(M) {
        (y._status === 0 || y._status === -1) && (y._status = 1, y._result = M);
      }, function(M) {
        (y._status === 0 || y._status === -1) && (y._status = 2, y._result = M);
      }), y._status === -1 && (y._status = 0, y._result = T);
    }
    if (y._status === 1) return y._result.default;
    throw y._result;
  }
  var il = typeof reportError == "function" ? reportError : function(y) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var T = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof y == "object" && y !== null && typeof y.message == "string" ? String(y.message) : String(y),
        error: y
      });
      if (!window.dispatchEvent(T)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", y);
      return;
    }
    console.error(y);
  }, $l = {
    map: D,
    forEach: function(y, T, M) {
      D(y, function() {
        T.apply(this, arguments);
      }, M);
    },
    count: function(y) {
      var T = 0;
      return D(y, function() {
        T++;
      }), T;
    },
    toArray: function(y) {
      return D(y, function(T) {
        return T;
      }) || [];
    },
    only: function(y) {
      if (!wl(y)) throw Error("React.Children.only expected to receive a single React element child.");
      return y;
    }
  };
  b.Activity = C, b.Children = $l, b.Component = xl, b.Fragment = j, b.Profiler = ll, b.PureComponent = Ml, b.StrictMode = S, b.Suspense = B, b.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = w, b.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(y) {
      return w.H.useMemoCache(y);
    }
  }, b.cache = function(y) {
    return function() {
      return y.apply(null, arguments);
    };
  }, b.cacheSignal = function() {
    return null;
  }, b.cloneElement = function(y, T, M) {
    if (y == null) throw Error("The argument must be a React element, but you passed " + y + ".");
    var q = Kl({}, y.props), Z = y.key;
    if (T != null) for (V in T.key !== void 0 && (Z = "" + T.key), T) !jl.call(T, V) || V === "key" || V === "__self" || V === "__source" || V === "ref" && T.ref === void 0 || (q[V] = T[V]);
    var V = arguments.length - 2;
    if (V === 1) q.children = M;
    else if (1 < V) {
      for (var tl = Array(V), Cl = 0; Cl < V; Cl++) tl[Cl] = arguments[Cl + 2];
      q.children = tl;
    }
    return Et(y.type, Z, q);
  }, b.createContext = function(y) {
    return y = {
      $$typeof: Al,
      _currentValue: y,
      _currentValue2: y,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, y.Provider = y, y.Consumer = {
      $$typeof: k,
      _context: y
    }, y;
  }, b.createElement = function(y, T, M) {
    var q, Z = {}, V = null;
    if (T != null) for (q in T.key !== void 0 && (V = "" + T.key), T) jl.call(T, q) && q !== "key" && q !== "__self" && q !== "__source" && (Z[q] = T[q]);
    var tl = arguments.length - 2;
    if (tl === 1) Z.children = M;
    else if (1 < tl) {
      for (var Cl = Array(tl), sl = 0; sl < tl; sl++) Cl[sl] = arguments[sl + 2];
      Z.children = Cl;
    }
    if (y && y.defaultProps) for (q in tl = y.defaultProps, tl) Z[q] === void 0 && (Z[q] = tl[q]);
    return Et(y, V, Z);
  }, b.createRef = function() {
    return { current: null };
  }, b.forwardRef = function(y) {
    return {
      $$typeof: dl,
      render: y
    };
  }, b.isValidElement = wl, b.lazy = function(y) {
    return {
      $$typeof: X,
      _payload: {
        _status: -1,
        _result: y
      },
      _init: I
    };
  }, b.memo = function(y, T) {
    return {
      $$typeof: E,
      type: y,
      compare: T === void 0 ? null : T
    };
  }, b.startTransition = function(y) {
    var T = w.T, M = {};
    w.T = M;
    try {
      var q = y(), Z = w.S;
      Z !== null && Z(M, q), typeof q == "object" && q !== null && typeof q.then == "function" && q.then(Wl, il);
    } catch (V) {
      il(V);
    } finally {
      T !== null && M.types !== null && (T.types = M.types), w.T = T;
    }
  }, b.unstable_useCacheRefresh = function() {
    return w.H.useCacheRefresh();
  }, b.use = function(y) {
    return w.H.use(y);
  }, b.useActionState = function(y, T, M) {
    return w.H.useActionState(y, T, M);
  }, b.useCallback = function(y, T) {
    return w.H.useCallback(y, T);
  }, b.useContext = function(y) {
    return w.H.useContext(y);
  }, b.useDebugValue = function() {
  }, b.useDeferredValue = function(y, T) {
    return w.H.useDeferredValue(y, T);
  }, b.useEffect = function(y, T) {
    return w.H.useEffect(y, T);
  }, b.useEffectEvent = function(y) {
    return w.H.useEffectEvent(y);
  }, b.useId = function() {
    return w.H.useId();
  }, b.useImperativeHandle = function(y, T, M) {
    return w.H.useImperativeHandle(y, T, M);
  }, b.useInsertionEffect = function(y, T) {
    return w.H.useInsertionEffect(y, T);
  }, b.useLayoutEffect = function(y, T) {
    return w.H.useLayoutEffect(y, T);
  }, b.useMemo = function(y, T) {
    return w.H.useMemo(y, T);
  }, b.useOptimistic = function(y, T) {
    return w.H.useOptimistic(y, T);
  }, b.useReducer = function(y, T, M) {
    return w.H.useReducer(y, T, M);
  }, b.useRef = function(y) {
    return w.H.useRef(y);
  }, b.useState = function(y) {
    return w.H.useState(y);
  }, b.useSyncExternalStore = function(y, T, M) {
    return w.H.useSyncExternalStore(y, T, M);
  }, b.useTransition = function() {
    return w.H.useTransition();
  }, b.version = "19.2.8";
})), ti = /* @__PURE__ */ Ut(((b, O) => {
  O.exports = sd();
})), gd = /* @__PURE__ */ Ut(((b) => {
  function O(U, A) {
    var D = U.length;
    U.push(A);
    l: for (; 0 < D; ) {
      var I = D - 1 >>> 1, il = U[I];
      if (0 < S(il, A)) U[I] = A, U[D] = il, D = I;
      else break l;
    }
  }
  function p(U) {
    return U.length === 0 ? null : U[0];
  }
  function j(U) {
    if (U.length === 0) return null;
    var A = U[0], D = U.pop();
    if (D !== A) {
      U[0] = D;
      l: for (var I = 0, il = U.length, $l = il >>> 1; I < $l; ) {
        var y = 2 * (I + 1) - 1, T = U[y], M = y + 1, q = U[M];
        if (0 > S(T, D)) M < il && 0 > S(q, T) ? (U[I] = q, U[M] = D, I = M) : (U[I] = T, U[y] = D, I = y);
        else if (M < il && 0 > S(q, D)) U[I] = q, U[M] = D, I = M;
        else break l;
      }
    }
    return A;
  }
  function S(U, A) {
    var D = U.sortIndex - A.sortIndex;
    return D !== 0 ? D : U.id - A.id;
  }
  if (b.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
    var ll = performance;
    b.unstable_now = function() {
      return ll.now();
    };
  } else {
    var k = Date, Al = k.now();
    b.unstable_now = function() {
      return k.now() - Al;
    };
  }
  var dl = [], B = [], E = 1, X = null, C = 3, gt = !1, Bl = !1, pl = !1, Kl = !1, Wt = typeof setTimeout == "function" ? setTimeout : null, xl = typeof clearTimeout == "function" ? clearTimeout : null, wt = typeof setImmediate < "u" ? setImmediate : null;
  function Ml(U) {
    for (var A = p(B); A !== null; ) {
      if (A.callback === null) j(B);
      else if (A.startTime <= U) j(B), A.sortIndex = A.expirationTime, O(dl, A);
      else break;
      A = p(B);
    }
  }
  function ot(U) {
    if (pl = !1, Ml(U), !Bl) if (p(dl) !== null) Bl = !0, Jl || (Jl = !0, wl());
    else {
      var A = p(B);
      A !== null && bt(ot, A.startTime - U);
    }
  }
  var Jl = !1, Wl = -1, w = 5, jl = -1;
  function Et() {
    return Kl ? !0 : !(b.unstable_now() - jl < w);
  }
  function za() {
    if (Kl = !1, Jl) {
      var U = b.unstable_now();
      jl = U;
      var A = !0;
      try {
        l: {
          Bl = !1, pl && (pl = !1, xl(Wl), Wl = -1), gt = !0;
          var D = C;
          try {
            t: {
              for (Ml(U), X = p(dl); X !== null && !(X.expirationTime > U && Et()); ) {
                var I = X.callback;
                if (typeof I == "function") {
                  X.callback = null, C = X.priorityLevel;
                  var il = I(X.expirationTime <= U);
                  if (U = b.unstable_now(), typeof il == "function") {
                    X.callback = il, Ml(U), A = !0;
                    break t;
                  }
                  X === p(dl) && j(dl), Ml(U);
                } else j(dl);
                X = p(dl);
              }
              if (X !== null) A = !0;
              else {
                var $l = p(B);
                $l !== null && bt(ot, $l.startTime - U), A = !1;
              }
            }
            break l;
          } finally {
            X = null, C = D, gt = !1;
          }
          A = void 0;
        }
      } finally {
        A ? wl() : Jl = !1;
      }
    }
  }
  var wl;
  if (typeof wt == "function") wl = function() {
    wt(za);
  };
  else if (typeof MessageChannel < "u") {
    var At = new MessageChannel(), Za = At.port2;
    At.port1.onmessage = za, wl = function() {
      Za.postMessage(null);
    };
  } else wl = function() {
    Wt(za, 0);
  };
  function bt(U, A) {
    Wl = Wt(function() {
      U(b.unstable_now());
    }, A);
  }
  b.unstable_IdlePriority = 5, b.unstable_ImmediatePriority = 1, b.unstable_LowPriority = 4, b.unstable_NormalPriority = 3, b.unstable_Profiling = null, b.unstable_UserBlockingPriority = 2, b.unstable_cancelCallback = function(U) {
    U.callback = null;
  }, b.unstable_forceFrameRate = function(U) {
    0 > U || 125 < U ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : w = 0 < U ? Math.floor(1e3 / U) : 5;
  }, b.unstable_getCurrentPriorityLevel = function() {
    return C;
  }, b.unstable_next = function(U) {
    switch (C) {
      case 1:
      case 2:
      case 3:
        var A = 3;
        break;
      default:
        A = C;
    }
    var D = C;
    C = A;
    try {
      return U();
    } finally {
      C = D;
    }
  }, b.unstable_requestPaint = function() {
    Kl = !0;
  }, b.unstable_runWithPriority = function(U, A) {
    switch (U) {
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
        break;
      default:
        U = 3;
    }
    var D = C;
    C = U;
    try {
      return A();
    } finally {
      C = D;
    }
  }, b.unstable_scheduleCallback = function(U, A, D) {
    var I = b.unstable_now();
    switch (typeof D == "object" && D !== null ? (D = D.delay, D = typeof D == "number" && 0 < D ? I + D : I) : D = I, U) {
      case 1:
        var il = -1;
        break;
      case 2:
        il = 250;
        break;
      case 5:
        il = 1073741823;
        break;
      case 4:
        il = 1e4;
        break;
      default:
        il = 5e3;
    }
    return il = D + il, U = {
      id: E++,
      callback: A,
      priorityLevel: U,
      startTime: D,
      expirationTime: il,
      sortIndex: -1
    }, D > I ? (U.sortIndex = D, O(B, U), p(dl) === null && U === p(B) && (pl ? (xl(Wl), Wl = -1) : pl = !0, bt(ot, D - I))) : (U.sortIndex = il, O(dl, U), Bl || gt || (Bl = !0, Jl || (Jl = !0, wl()))), U;
  }, b.unstable_shouldYield = Et, b.unstable_wrapCallback = function(U) {
    var A = C;
    return function() {
      var D = C;
      C = A;
      try {
        return U.apply(this, arguments);
      } finally {
        C = D;
      }
    };
  };
})), od = /* @__PURE__ */ Ut(((b, O) => {
  O.exports = gd();
})), bd = /* @__PURE__ */ Ut(((b) => {
  var O = ti();
  function p(B) {
    var E = "https://react.dev/errors/" + B;
    if (1 < arguments.length) {
      E += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var X = 2; X < arguments.length; X++) E += "&args[]=" + encodeURIComponent(arguments[X]);
    }
    return "Minified React error #" + B + "; visit " + E + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function j() {
  }
  var S = {
    d: {
      f: j,
      r: function() {
        throw Error(p(522));
      },
      D: j,
      C: j,
      L: j,
      m: j,
      X: j,
      S: j,
      M: j
    },
    p: 0,
    findDOMNode: null
  }, ll = Symbol.for("react.portal");
  function k(B, E, X) {
    var C = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: ll,
      key: C == null ? null : "" + C,
      children: B,
      containerInfo: E,
      implementation: X
    };
  }
  var Al = O.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function dl(B, E) {
    if (B === "font") return "";
    if (typeof E == "string") return E === "use-credentials" ? E : "";
  }
  b.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = S, b.createPortal = function(B, E) {
    var X = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!E || E.nodeType !== 1 && E.nodeType !== 9 && E.nodeType !== 11) throw Error(p(299));
    return k(B, E, null, X);
  }, b.flushSync = function(B) {
    var E = Al.T, X = S.p;
    try {
      if (Al.T = null, S.p = 2, B) return B();
    } finally {
      Al.T = E, S.p = X, S.d.f();
    }
  }, b.preconnect = function(B, E) {
    typeof B == "string" && (E ? (E = E.crossOrigin, E = typeof E == "string" ? E === "use-credentials" ? E : "" : void 0) : E = null, S.d.C(B, E));
  }, b.prefetchDNS = function(B) {
    typeof B == "string" && S.d.D(B);
  }, b.preinit = function(B, E) {
    if (typeof B == "string" && E && typeof E.as == "string") {
      var X = E.as, C = dl(X, E.crossOrigin), gt = typeof E.integrity == "string" ? E.integrity : void 0, Bl = typeof E.fetchPriority == "string" ? E.fetchPriority : void 0;
      X === "style" ? S.d.S(B, typeof E.precedence == "string" ? E.precedence : void 0, {
        crossOrigin: C,
        integrity: gt,
        fetchPriority: Bl
      }) : X === "script" && S.d.X(B, {
        crossOrigin: C,
        integrity: gt,
        fetchPriority: Bl,
        nonce: typeof E.nonce == "string" ? E.nonce : void 0
      });
    }
  }, b.preinitModule = function(B, E) {
    if (typeof B == "string") if (typeof E == "object" && E !== null) {
      if (E.as == null || E.as === "script") {
        var X = dl(E.as, E.crossOrigin);
        S.d.M(B, {
          crossOrigin: X,
          integrity: typeof E.integrity == "string" ? E.integrity : void 0,
          nonce: typeof E.nonce == "string" ? E.nonce : void 0
        });
      }
    } else E ?? S.d.M(B);
  }, b.preload = function(B, E) {
    if (typeof B == "string" && typeof E == "object" && E !== null && typeof E.as == "string") {
      var X = E.as, C = dl(X, E.crossOrigin);
      S.d.L(B, X, {
        crossOrigin: C,
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
  }, b.preloadModule = function(B, E) {
    if (typeof B == "string") if (E) {
      var X = dl(E.as, E.crossOrigin);
      S.d.m(B, {
        as: typeof E.as == "string" && E.as !== "script" ? E.as : void 0,
        crossOrigin: X,
        integrity: typeof E.integrity == "string" ? E.integrity : void 0
      });
    } else S.d.m(B);
  }, b.requestFormReset = function(B) {
    S.d.r(B);
  }, b.unstable_batchedUpdates = function(B, E) {
    return B(E);
  }, b.useFormState = function(B, E, X) {
    return Al.H.useFormState(B, E, X);
  }, b.useFormStatus = function() {
    return Al.H.useHostTransitionStatus();
  }, b.version = "19.2.8";
})), zd = /* @__PURE__ */ Ut(((b, O) => {
  function p() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(p);
      } catch (j) {
        console.error(j);
      }
  }
  p(), O.exports = bd();
})), _d = /* @__PURE__ */ Ut(((b) => {
  var O = od(), p = ti(), j = zd();
  function S(l) {
    var t = "https://react.dev/errors/" + l;
    if (1 < arguments.length) {
      t += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var a = 2; a < arguments.length; a++) t += "&args[]=" + encodeURIComponent(arguments[a]);
    }
    return "Minified React error #" + l + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function ll(l) {
    return !(!l || l.nodeType !== 1 && l.nodeType !== 9 && l.nodeType !== 11);
  }
  function k(l) {
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
  function Al(l) {
    if (l.tag === 13) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function dl(l) {
    if (l.tag === 31) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function B(l) {
    if (k(l) !== l) throw Error(S(188));
  }
  function E(l) {
    var t = l.alternate;
    if (!t) {
      if (t = k(l), t === null) throw Error(S(188));
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
          if (e === a) return B(n), l;
          if (e === u) return B(n), t;
          e = e.sibling;
        }
        throw Error(S(188));
      }
      if (a.return !== u.return) a = n, u = e;
      else {
        for (var f = !1, c = n.child; c; ) {
          if (c === a) {
            f = !0, a = n, u = e;
            break;
          }
          if (c === u) {
            f = !0, u = n, a = e;
            break;
          }
          c = c.sibling;
        }
        if (!f) {
          for (c = e.child; c; ) {
            if (c === a) {
              f = !0, a = e, u = n;
              break;
            }
            if (c === u) {
              f = !0, u = e, a = n;
              break;
            }
            c = c.sibling;
          }
          if (!f) throw Error(S(189));
        }
      }
      if (a.alternate !== u) throw Error(S(190));
    }
    if (a.tag !== 3) throw Error(S(188));
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
  var C = Object.assign, gt = Symbol.for("react.element"), Bl = Symbol.for("react.transitional.element"), pl = Symbol.for("react.portal"), Kl = Symbol.for("react.fragment"), Wt = Symbol.for("react.strict_mode"), xl = Symbol.for("react.profiler"), wt = Symbol.for("react.consumer"), Ml = Symbol.for("react.context"), ot = Symbol.for("react.forward_ref"), Jl = Symbol.for("react.suspense"), Wl = Symbol.for("react.suspense_list"), w = Symbol.for("react.memo"), jl = Symbol.for("react.lazy"), Et = Symbol.for("react.activity"), za = Symbol.for("react.memo_cache_sentinel"), wl = Symbol.iterator;
  function At(l) {
    return l === null || typeof l != "object" ? null : (l = wl && l[wl] || l["@@iterator"], typeof l == "function" ? l : null);
  }
  var Za = Symbol.for("react.client.reference");
  function bt(l) {
    if (l == null) return null;
    if (typeof l == "function") return l.$$typeof === Za ? null : l.displayName || l.name || null;
    if (typeof l == "string") return l;
    switch (l) {
      case Kl:
        return "Fragment";
      case xl:
        return "Profiler";
      case Wt:
        return "StrictMode";
      case Jl:
        return "Suspense";
      case Wl:
        return "SuspenseList";
      case Et:
        return "Activity";
    }
    if (typeof l == "object") switch (l.$$typeof) {
      case pl:
        return "Portal";
      case Ml:
        return l.displayName || "Context";
      case wt:
        return (l._context.displayName || "Context") + ".Consumer";
      case ot:
        var t = l.render;
        return l = l.displayName, l || (l = t.displayName || t.name || "", l = l !== "" ? "ForwardRef(" + l + ")" : "ForwardRef"), l;
      case w:
        return t = l.displayName || null, t !== null ? t : bt(l.type) || "Memo";
      case jl:
        t = l._payload, l = l._init;
        try {
          return bt(l(t));
        } catch {
        }
    }
    return null;
  }
  var U = Array.isArray, A = p.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, D = j.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, I = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, il = [], $l = -1;
  function y(l) {
    return { current: l };
  }
  function T(l) {
    0 > $l || (l.current = il[$l], il[$l] = null, $l--);
  }
  function M(l, t) {
    $l++, il[$l] = l.current, l.current = t;
  }
  var q = y(null), Z = y(null), V = y(null), tl = y(null);
  function Cl(l, t) {
    switch (M(V, t), M(Z, l), M(q, null), t.nodeType) {
      case 9:
      case 11:
        l = (l = t.documentElement) && (l = l.namespaceURI) ? O1(l) : 0;
        break;
      default:
        if (l = t.tagName, t = t.namespaceURI) t = O1(t), l = D1(t, l);
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
    T(q), M(q, l);
  }
  function sl() {
    T(q), T(Z), T(V);
  }
  function Ou(l) {
    l.memoizedState !== null && M(tl, l);
    var t = q.current, a = D1(t, l.type);
    t !== a && (M(Z, l), M(q, a));
  }
  function zn(l) {
    Z.current === l && (T(q), T(Z)), tl.current === l && (T(tl), sn._currentValue = I);
  }
  var Ge, ai;
  function _a(l) {
    if (Ge === void 0) try {
      throw Error();
    } catch (a) {
      var t = a.stack.trim().match(/\n( *(at )?)/);
      Ge = t && t[1] || "", ai = -1 < a.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < a.stack.indexOf("@") ? "@unknown:0:0" : "";
    }
    return `
` + Ge + l + ai;
  }
  var re = !1;
  function Xe(l, t) {
    if (!l || re) return "";
    re = !0;
    var a = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var u = { DetermineComponentFrameRoot: function() {
        try {
          if (t) {
            var _ = function() {
              throw Error();
            };
            if (Object.defineProperty(_.prototype, "props", { set: function() {
              throw Error();
            } }), typeof Reflect == "object" && Reflect.construct) {
              try {
                Reflect.construct(_, []);
              } catch (g) {
                var s = g;
              }
              Reflect.construct(l, [], _);
            } else {
              try {
                _.call();
              } catch (g) {
                s = g;
              }
              l.call(_.prototype);
            }
          } else {
            try {
              throw Error();
            } catch (g) {
              s = g;
            }
            (_ = l()) && typeof _.catch == "function" && _.catch(function() {
            });
          }
        } catch (g) {
          if (g && s && typeof g.stack == "string") return [g.stack, s.stack];
        }
        return [null, null];
      } };
      u.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var n = Object.getOwnPropertyDescriptor(u.DetermineComponentFrameRoot, "name");
      n && n.configurable && Object.defineProperty(u.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
      var e = u.DetermineComponentFrameRoot(), f = e[0], c = e[1];
      if (f && c) {
        var i = f.split(`
`), h = c.split(`
`);
        for (n = u = 0; u < i.length && !i[u].includes("DetermineComponentFrameRoot"); ) u++;
        for (; n < h.length && !h[n].includes("DetermineComponentFrameRoot"); ) n++;
        if (u === i.length || n === h.length) for (u = i.length - 1, n = h.length - 1; 1 <= u && 0 <= n && i[u] !== h[n]; ) n--;
        for (; 1 <= u && 0 <= n; u--, n--) if (i[u] !== h[n]) {
          if (u !== 1 || n !== 1) do
            if (u--, n--, 0 > n || i[u] !== h[n]) {
              var o = `
` + i[u].replace(" at new ", " at ");
              return l.displayName && o.includes("<anonymous>") && (o = o.replace("<anonymous>", l.displayName)), o;
            }
          while (1 <= u && 0 <= n);
          break;
        }
      }
    } finally {
      re = !1, Error.prepareStackTrace = a;
    }
    return (a = l ? l.displayName || l.name : "") ? _a(a) : "";
  }
  function P1(l, t) {
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
        return Xe(l.type, !1);
      case 11:
        return Xe(l.type.render, !1);
      case 1:
        return Xe(l.type, !0);
      case 31:
        return _a("Activity");
      default:
        return "";
    }
  }
  function ui(l) {
    try {
      var t = "", a = null;
      do
        t += P1(l, a), a = l, l = l.return;
      while (l);
      return t;
    } catch (u) {
      return `
Error generating stack: ` + u.message + `
` + u.stack;
    }
  }
  var Qe = Object.prototype.hasOwnProperty, Ze = O.unstable_scheduleCallback, Ve = O.unstable_cancelCallback, ly = O.unstable_shouldYield, ty = O.unstable_requestPaint, Fl = O.unstable_now, ay = O.unstable_getCurrentPriorityLevel, ni = O.unstable_ImmediatePriority, ei = O.unstable_UserBlockingPriority, _n = O.unstable_NormalPriority, uy = O.unstable_LowPriority, fi = O.unstable_IdlePriority, ny = O.log, ey = O.unstable_setDisableYieldValue, Du = null, kl = null;
  function $t(l) {
    if (typeof ny == "function" && ey(l), kl && typeof kl.setStrictMode == "function") try {
      kl.setStrictMode(Du, l);
    } catch {
    }
  }
  var Il = Math.clz32 ? Math.clz32 : iy, fy = Math.log, cy = Math.LN2;
  function iy(l) {
    return l >>>= 0, l === 0 ? 32 : 31 - (fy(l) / cy | 0) | 0;
  }
  var Tn = 256, En = 262144, An = 4194304;
  function Ta(l) {
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
    var n = 0, e = l.suspendedLanes, f = l.pingedLanes;
    l = l.warmLanes;
    var c = u & 134217727;
    return c !== 0 ? (u = c & ~e, u !== 0 ? n = Ta(u) : (f &= c, f !== 0 ? n = Ta(f) : a || (a = c & ~l, a !== 0 && (n = Ta(a))))) : (c = u & ~e, c !== 0 ? n = Ta(c) : f !== 0 ? n = Ta(f) : a || (a = u & ~l, a !== 0 && (n = Ta(a)))), n === 0 ? 0 : t !== 0 && t !== n && (t & e) === 0 && (e = n & -n, a = t & -t, e >= a || e === 32 && (a & 4194048) !== 0) ? t : n;
  }
  function Uu(l, t) {
    return (l.pendingLanes & ~(l.suspendedLanes & ~l.pingedLanes) & t) === 0;
  }
  function vy(l, t) {
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
  function ci() {
    var l = An;
    return An <<= 1, (An & 62914560) === 0 && (An = 4194304), l;
  }
  function Le(l) {
    for (var t = [], a = 0; 31 > a; a++) t.push(l);
    return t;
  }
  function On(l, t) {
    l.pendingLanes |= t, t !== 268435456 && (l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0);
  }
  function yy(l, t, a, u, n, e) {
    var f = l.pendingLanes;
    l.pendingLanes = a, l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0, l.expiredLanes &= a, l.entangledLanes &= a, l.errorRecoveryDisabledLanes &= a, l.shellSuspendCounter = 0;
    var c = l.entanglements, i = l.expirationTimes, h = l.hiddenUpdates;
    for (a = f & ~a; 0 < a; ) {
      var o = 31 - Il(a), _ = 1 << o;
      c[o] = 0, i[o] = -1;
      var s = h[o];
      if (s !== null) for (h[o] = null, o = 0; o < s.length; o++) {
        var g = s[o];
        g !== null && (g.lane &= -536870913);
      }
      a &= ~_;
    }
    u !== 0 && ii(l, u, 0), e !== 0 && n === 0 && l.tag !== 0 && (l.suspendedLanes |= e & ~(f & ~t));
  }
  function ii(l, t, a) {
    l.pendingLanes |= t, l.suspendedLanes &= ~t;
    var u = 31 - Il(t);
    l.entangledLanes |= t, l.entanglements[u] = l.entanglements[u] | 1073741824 | a & 261930;
  }
  function vi(l, t) {
    var a = l.entangledLanes |= t;
    for (l = l.entanglements; a; ) {
      var u = 31 - Il(a), n = 1 << u;
      n & t | l[u] & t && (l[u] |= t), a &= ~n;
    }
  }
  function yi(l, t) {
    var a = t & -t;
    return a = (a & 42) !== 0 ? 1 : mi(a), (a & (l.suspendedLanes | t)) !== 0 ? 0 : a;
  }
  function mi(l) {
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
  function Ke(l) {
    return l &= -l, 2 < l ? 8 < l ? (l & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function di() {
    var l = D.p;
    return l !== 0 ? l : (l = window.event, l === void 0 ? 32 : W1(l.type));
  }
  function hi(l, t) {
    var a = D.p;
    try {
      return D.p = l, t();
    } finally {
      D.p = a;
    }
  }
  var Ft = Math.random().toString(36).slice(2), Ul = "__reactFiber$" + Ft, Gl = "__reactProps$" + Ft, Nu = "__reactContainer$" + Ft, xe = "__reactEvents$" + Ft, my = "__reactListeners$" + Ft, dy = "__reactHandles$" + Ft, Si = "__reactResources$" + Ft, Hu = "__reactMarker$" + Ft;
  function Je(l) {
    delete l[Ul], delete l[Gl], delete l[xe], delete l[my], delete l[dy];
  }
  function Va(l) {
    var t = l[Ul];
    if (t) return t;
    for (var a = l.parentNode; a; ) {
      if (t = a[Nu] || a[Ul]) {
        if (a = t.alternate, t.child !== null || a !== null && a.child !== null) for (l = C1(l); l !== null; ) {
          if (a = l[Ul]) return a;
          l = C1(l);
        }
        return t;
      }
      l = a, a = l.parentNode;
    }
    return null;
  }
  function La(l) {
    if (l = l[Ul] || l[Nu]) {
      var t = l.tag;
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3) return l;
    }
    return null;
  }
  function qu(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l.stateNode;
    throw Error(S(33));
  }
  function Ka(l) {
    var t = l[Si];
    return t || (t = l[Si] = {
      hoistableStyles: /* @__PURE__ */ new Map(),
      hoistableScripts: /* @__PURE__ */ new Map()
    }), t;
  }
  function Ol(l) {
    l[Hu] = !0;
  }
  var si = /* @__PURE__ */ new Set(), gi = {};
  function Ea(l, t) {
    xa(l, t), xa(l + "Capture", t);
  }
  function xa(l, t) {
    for (gi[l] = t, l = 0; l < t.length; l++) si.add(t[l]);
  }
  var hy = RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), oi = {}, bi = {};
  function Sy(l) {
    return Qe.call(bi, l) ? !0 : Qe.call(oi, l) ? !1 : hy.test(l) ? bi[l] = !0 : (oi[l] = !0, !1);
  }
  function Dn(l, t, a) {
    if (Sy(t)) if (a === null) l.removeAttribute(t);
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
  function Un(l, t, a) {
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
  function Nt(l, t, a, u) {
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
  function et(l) {
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
  function zi(l) {
    var t = l.type;
    return (l = l.nodeName) && l.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function sy(l, t, a) {
    var u = Object.getOwnPropertyDescriptor(l.constructor.prototype, t);
    if (!l.hasOwnProperty(t) && typeof u < "u" && typeof u.get == "function" && typeof u.set == "function") {
      var n = u.get, e = u.set;
      return Object.defineProperty(l, t, {
        configurable: !0,
        get: function() {
          return n.call(this);
        },
        set: function(f) {
          a = "" + f, e.call(this, f);
        }
      }), Object.defineProperty(l, t, { enumerable: u.enumerable }), {
        getValue: function() {
          return a;
        },
        setValue: function(f) {
          a = "" + f;
        },
        stopTracking: function() {
          l._valueTracker = null, delete l[t];
        }
      };
    }
  }
  function We(l) {
    if (!l._valueTracker) {
      var t = zi(l) ? "checked" : "value";
      l._valueTracker = sy(l, t, "" + l[t]);
    }
  }
  function _i(l) {
    if (!l) return !1;
    var t = l._valueTracker;
    if (!t) return !0;
    var a = t.getValue(), u = "";
    return l && (u = zi(l) ? l.checked ? "true" : "false" : l.value), l = u, l !== a ? (t.setValue(l), !0) : !1;
  }
  function Nn(l) {
    if (l = l || (typeof document < "u" ? document : void 0), typeof l > "u") return null;
    try {
      return l.activeElement || l.body;
    } catch {
      return l.body;
    }
  }
  var gy = /[\n"\\]/g;
  function ft(l) {
    return l.replace(gy, function(t) {
      return "\\" + t.charCodeAt(0).toString(16) + " ";
    });
  }
  function we(l, t, a, u, n, e, f, c) {
    l.name = "", f != null && typeof f != "function" && typeof f != "symbol" && typeof f != "boolean" ? l.type = f : l.removeAttribute("type"), t != null ? f === "number" ? (t === 0 && l.value === "" || l.value != t) && (l.value = "" + et(t)) : l.value !== "" + et(t) && (l.value = "" + et(t)) : f !== "submit" && f !== "reset" || l.removeAttribute("value"), t != null ? $e(l, f, et(t)) : a != null ? $e(l, f, et(a)) : u != null && l.removeAttribute("value"), n == null && e != null && (l.defaultChecked = !!e), n != null && (l.checked = n && typeof n != "function" && typeof n != "symbol"), c != null && typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" ? l.name = "" + et(c) : l.removeAttribute("name");
  }
  function Ti(l, t, a, u, n, e, f, c) {
    if (e != null && typeof e != "function" && typeof e != "symbol" && typeof e != "boolean" && (l.type = e), t != null || a != null) {
      if (!(e !== "submit" && e !== "reset" || t != null)) {
        We(l);
        return;
      }
      a = a != null ? "" + et(a) : "", t = t != null ? "" + et(t) : a, c || t === l.value || (l.value = t), l.defaultValue = t;
    }
    u = u ?? n, u = typeof u != "function" && typeof u != "symbol" && !!u, l.checked = c ? l.checked : !!u, l.defaultChecked = !!u, f != null && typeof f != "function" && typeof f != "symbol" && typeof f != "boolean" && (l.name = f), We(l);
  }
  function $e(l, t, a) {
    t === "number" && Nn(l.ownerDocument) === l || l.defaultValue === "" + a || (l.defaultValue = "" + a);
  }
  function Ja(l, t, a, u) {
    if (l = l.options, t) {
      t = {};
      for (var n = 0; n < a.length; n++) t["$" + a[n]] = !0;
      for (a = 0; a < l.length; a++) n = t.hasOwnProperty("$" + l[a].value), l[a].selected !== n && (l[a].selected = n), n && u && (l[a].defaultSelected = !0);
    } else {
      for (a = "" + et(a), t = null, n = 0; n < l.length; n++) {
        if (l[n].value === a) {
          l[n].selected = !0, u && (l[n].defaultSelected = !0);
          return;
        }
        t !== null || l[n].disabled || (t = l[n]);
      }
      t !== null && (t.selected = !0);
    }
  }
  function Ei(l, t, a) {
    if (t != null && (t = "" + et(t), t !== l.value && (l.value = t), a == null)) {
      l.defaultValue !== t && (l.defaultValue = t);
      return;
    }
    l.defaultValue = a != null ? "" + et(a) : "";
  }
  function Ai(l, t, a, u) {
    if (t == null) {
      if (u != null) {
        if (a != null) throw Error(S(92));
        if (U(u)) {
          if (1 < u.length) throw Error(S(93));
          u = u[0];
        }
        a = u;
      }
      a ??= "", t = a;
    }
    a = et(t), l.defaultValue = a, u = l.textContent, u === a && u !== "" && u !== null && (l.value = u), We(l);
  }
  function Wa(l, t) {
    if (t) {
      var a = l.firstChild;
      if (a && a === l.lastChild && a.nodeType === 3) {
        a.nodeValue = t;
        return;
      }
    }
    l.textContent = t;
  }
  var oy = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));
  function Mi(l, t, a) {
    var u = t.indexOf("--") === 0;
    a == null || typeof a == "boolean" || a === "" ? u ? l.setProperty(t, "") : t === "float" ? l.cssFloat = "" : l[t] = "" : u ? l.setProperty(t, a) : typeof a != "number" || a === 0 || oy.has(t) ? t === "float" ? l.cssFloat = a : l[t] = ("" + a).trim() : l[t] = a + "px";
  }
  function Oi(l, t, a) {
    if (t != null && typeof t != "object") throw Error(S(62));
    if (l = l.style, a != null) {
      for (var u in a) !a.hasOwnProperty(u) || t != null && t.hasOwnProperty(u) || (u.indexOf("--") === 0 ? l.setProperty(u, "") : u === "float" ? l.cssFloat = "" : l[u] = "");
      for (var n in t) u = t[n], t.hasOwnProperty(n) && a[n] !== u && Mi(l, n, u);
    } else for (var e in t) t.hasOwnProperty(e) && Mi(l, e, t[e]);
  }
  function Fe(l) {
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
  var by = /* @__PURE__ */ new Map([
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
  ]), zy = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Hn(l) {
    return zy.test("" + l) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : l;
  }
  function Ht() {
  }
  var ke = null;
  function Ie(l) {
    return l = l.target || l.srcElement || window, l.correspondingUseElement && (l = l.correspondingUseElement), l.nodeType === 3 ? l.parentNode : l;
  }
  var wa = null, $a = null;
  function Di(l) {
    var t = La(l);
    if (t && (l = t.stateNode)) {
      var a = l[Gl] || null;
      l: switch (l = t.stateNode, t.type) {
        case "input":
          if (we(l, a.value, a.defaultValue, a.defaultValue, a.checked, a.defaultChecked, a.type, a.name), t = a.name, a.type === "radio" && t != null) {
            for (a = l; a.parentNode; ) a = a.parentNode;
            for (a = a.querySelectorAll('input[name="' + ft("" + t) + '"][type="radio"]'), t = 0; t < a.length; t++) {
              var u = a[t];
              if (u !== l && u.form === l.form) {
                var n = u[Gl] || null;
                if (!n) throw Error(S(90));
                we(u, n.value, n.defaultValue, n.defaultValue, n.checked, n.defaultChecked, n.type, n.name);
              }
            }
            for (t = 0; t < a.length; t++) u = a[t], u.form === l.form && _i(u);
          }
          break l;
        case "textarea":
          Ei(l, a.value, a.defaultValue);
          break l;
        case "select":
          t = a.value, t != null && Ja(l, !!a.multiple, t, !1);
      }
    }
  }
  var Pe = !1;
  function Ui(l, t, a) {
    if (Pe) return l(t, a);
    Pe = !0;
    try {
      return l(t);
    } finally {
      if (Pe = !1, (wa !== null || $a !== null) && (ge(), wa && (t = wa, l = $a, $a = wa = null, Di(t), l)))
        for (t = 0; t < l.length; t++) Di(l[t]);
    }
  }
  function Yu(l, t) {
    var a = l.stateNode;
    if (a === null) return null;
    var u = a[Gl] || null;
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
    if (a && typeof a != "function") throw Error(S(231, t, typeof a));
    return a;
  }
  var qt = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), lf = !1;
  if (qt) try {
    var Bu = {};
    Object.defineProperty(Bu, "passive", { get: function() {
      lf = !0;
    } }), window.addEventListener("test", Bu, Bu), window.removeEventListener("test", Bu, Bu);
  } catch {
    lf = !1;
  }
  var kt = null, tf = null, qn = null;
  function Ni() {
    if (qn) return qn;
    var l, t = tf, a = t.length, u, n = "value" in kt ? kt.value : kt.textContent, e = n.length;
    for (l = 0; l < a && t[l] === n[l]; l++) ;
    var f = a - l;
    for (u = 1; u <= f && t[a - u] === n[e - u]; u++) ;
    return qn = n.slice(l, 1 < u ? 1 - u : void 0);
  }
  function Yn(l) {
    var t = l.keyCode;
    return "charCode" in l ? (l = l.charCode, l === 0 && t === 13 && (l = 13)) : l = t, l === 10 && (l = 13), 32 <= l || l === 13 ? l : 0;
  }
  function Bn() {
    return !0;
  }
  function Hi() {
    return !1;
  }
  function rl(l) {
    function t(a, u, n, e, f) {
      this._reactName = a, this._targetInst = n, this.type = u, this.nativeEvent = e, this.target = f, this.currentTarget = null;
      for (var c in l) l.hasOwnProperty(c) && (a = l[c], this[c] = a ? a(e) : e[c]);
      return this.isDefaultPrevented = (e.defaultPrevented != null ? e.defaultPrevented : e.returnValue === !1) ? Bn : Hi, this.isPropagationStopped = Hi, this;
    }
    return C(t.prototype, {
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
  }, Cn = rl(Aa), Cu = C({}, Aa, {
    view: 0,
    detail: 0
  }), _y = rl(Cu), af, uf, Ru, Rn = C({}, Cu, {
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
    getModifierState: ef,
    button: 0,
    buttons: 0,
    relatedTarget: function(l) {
      return l.relatedTarget === void 0 ? l.fromElement === l.srcElement ? l.toElement : l.fromElement : l.relatedTarget;
    },
    movementX: function(l) {
      return "movementX" in l ? l.movementX : (l !== Ru && (Ru && l.type === "mousemove" ? (af = l.screenX - Ru.screenX, uf = l.screenY - Ru.screenY) : uf = af = 0, Ru = l), af);
    },
    movementY: function(l) {
      return "movementY" in l ? l.movementY : uf;
    }
  }), qi = rl(Rn), Ty = rl(C({}, Rn, { dataTransfer: 0 })), nf = rl(C({}, Cu, { relatedTarget: 0 })), Ey = rl(C({}, Aa, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  })), Ay = rl(C({}, Aa, { clipboardData: function(l) {
    return "clipboardData" in l ? l.clipboardData : window.clipboardData;
  } })), Yi = rl(C({}, Aa, { data: 0 })), My = {
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
  }, Oy = {
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
  }, Dy = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function Uy(l) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(l) : (l = Dy[l]) ? !!t[l] : !1;
  }
  function ef() {
    return Uy;
  }
  var Ny = rl(C({}, Cu, {
    key: function(l) {
      if (l.key) {
        var t = My[l.key] || l.key;
        if (t !== "Unidentified") return t;
      }
      return l.type === "keypress" ? (l = Yn(l), l === 13 ? "Enter" : String.fromCharCode(l)) : l.type === "keydown" || l.type === "keyup" ? Oy[l.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: ef,
    charCode: function(l) {
      return l.type === "keypress" ? Yn(l) : 0;
    },
    keyCode: function(l) {
      return l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    },
    which: function(l) {
      return l.type === "keypress" ? Yn(l) : l.type === "keydown" || l.type === "keyup" ? l.keyCode : 0;
    }
  })), Bi = rl(C({}, Rn, {
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
  })), Hy = rl(C({}, Cu, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: ef
  })), qy = rl(C({}, Aa, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  })), Yy = rl(C({}, Rn, {
    deltaX: function(l) {
      return "deltaX" in l ? l.deltaX : "wheelDeltaX" in l ? -l.wheelDeltaX : 0;
    },
    deltaY: function(l) {
      return "deltaY" in l ? l.deltaY : "wheelDeltaY" in l ? -l.wheelDeltaY : "wheelDelta" in l ? -l.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  })), By = rl(C({}, Aa, {
    newState: 0,
    oldState: 0
  })), Cy = [
    9,
    13,
    27,
    32
  ], ff = qt && "CompositionEvent" in window, pu = null;
  qt && "documentMode" in document && (pu = document.documentMode);
  var Ry = qt && "TextEvent" in window && !pu, Ci = qt && (!ff || pu && 8 < pu && 11 >= pu), Ri = " ", pi = !1;
  function ji(l, t) {
    switch (l) {
      case "keyup":
        return Cy.indexOf(t.keyCode) !== -1;
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
  function Gi(l) {
    return l = l.detail, typeof l == "object" && "data" in l ? l.data : null;
  }
  var Fa = !1;
  function py(l, t) {
    switch (l) {
      case "compositionend":
        return Gi(t);
      case "keypress":
        return t.which !== 32 ? null : (pi = !0, Ri);
      case "textInput":
        return l = t.data, l === Ri && pi ? null : l;
      default:
        return null;
    }
  }
  function jy(l, t) {
    if (Fa) return l === "compositionend" || !ff && ji(l, t) ? (l = Ni(), qn = tf = kt = null, Fa = !1, l) : null;
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
        return Ci && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var Gy = {
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
  function ri(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t === "input" ? !!Gy[l.type] : t === "textarea";
  }
  function Xi(l, t, a, u) {
    wa ? $a ? $a.push(u) : $a = [u] : wa = u, t = Ae(t, "onChange"), 0 < t.length && (a = new Cn("onChange", "change", null, a, u), l.push({
      event: a,
      listeners: t
    }));
  }
  var ju = null, Gu = null;
  function ry(l) {
    b1(l, 0);
  }
  function pn(l) {
    if (_i(qu(l))) return l;
  }
  function Qi(l, t) {
    if (l === "change") return t;
  }
  var Zi = !1;
  if (qt) {
    var cf;
    if (qt) {
      var vf = "oninput" in document;
      if (!vf) {
        var Vi = document.createElement("div");
        Vi.setAttribute("oninput", "return;"), vf = typeof Vi.oninput == "function";
      }
      cf = vf;
    } else cf = !1;
    Zi = cf && (!document.documentMode || 9 < document.documentMode);
  }
  function Li() {
    ju && (ju.detachEvent("onpropertychange", Ki), Gu = ju = null);
  }
  function Ki(l) {
    if (l.propertyName === "value" && pn(Gu)) {
      var t = [];
      Xi(t, Gu, l, Ie(l)), Ui(ry, t);
    }
  }
  function Xy(l, t, a) {
    l === "focusin" ? (Li(), ju = t, Gu = a, ju.attachEvent("onpropertychange", Ki)) : l === "focusout" && Li();
  }
  function Qy(l) {
    if (l === "selectionchange" || l === "keyup" || l === "keydown") return pn(Gu);
  }
  function Zy(l, t) {
    if (l === "click") return pn(t);
  }
  function Vy(l, t) {
    if (l === "input" || l === "change") return pn(t);
  }
  function Ly(l, t) {
    return l === t && (l !== 0 || 1 / l === 1 / t) || l !== l && t !== t;
  }
  var Pl = typeof Object.is == "function" ? Object.is : Ly;
  function ru(l, t) {
    if (Pl(l, t)) return !0;
    if (typeof l != "object" || l === null || typeof t != "object" || t === null) return !1;
    var a = Object.keys(l), u = Object.keys(t);
    if (a.length !== u.length) return !1;
    for (u = 0; u < a.length; u++) {
      var n = a[u];
      if (!Qe.call(t, n) || !Pl(l[n], t[n])) return !1;
    }
    return !0;
  }
  function xi(l) {
    for (; l && l.firstChild; ) l = l.firstChild;
    return l;
  }
  function Ji(l, t) {
    var a = xi(l);
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
      a = xi(a);
    }
  }
  function Wi(l, t) {
    return l && t ? l === t ? !0 : l && l.nodeType === 3 ? !1 : t && t.nodeType === 3 ? Wi(l, t.parentNode) : "contains" in l ? l.contains(t) : l.compareDocumentPosition ? !!(l.compareDocumentPosition(t) & 16) : !1 : !1;
  }
  function wi(l) {
    l = l != null && l.ownerDocument != null && l.ownerDocument.defaultView != null ? l.ownerDocument.defaultView : window;
    for (var t = Nn(l.document); t instanceof l.HTMLIFrameElement; ) {
      try {
        var a = typeof t.contentWindow.location.href == "string";
      } catch {
        a = !1;
      }
      if (a) l = t.contentWindow;
      else break;
      t = Nn(l.document);
    }
    return t;
  }
  function yf(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t && (t === "input" && (l.type === "text" || l.type === "search" || l.type === "tel" || l.type === "url" || l.type === "password") || t === "textarea" || l.contentEditable === "true");
  }
  var Ky = qt && "documentMode" in document && 11 >= document.documentMode, ka = null, mf = null, Xu = null, df = !1;
  function $i(l, t, a) {
    var u = a.window === a ? a.document : a.nodeType === 9 ? a : a.ownerDocument;
    df || ka == null || ka !== Nn(u) || (u = ka, "selectionStart" in u && yf(u) ? u = {
      start: u.selectionStart,
      end: u.selectionEnd
    } : (u = (u.ownerDocument && u.ownerDocument.defaultView || window).getSelection(), u = {
      anchorNode: u.anchorNode,
      anchorOffset: u.anchorOffset,
      focusNode: u.focusNode,
      focusOffset: u.focusOffset
    }), Xu && ru(Xu, u) || (Xu = u, u = Ae(mf, "onSelect"), 0 < u.length && (t = new Cn("onSelect", "select", null, t, a), l.push({
      event: t,
      listeners: u
    }), t.target = ka)));
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
  }, hf = {}, Fi = {};
  qt && (Fi = document.createElement("div").style, "AnimationEvent" in window || (delete Ia.animationend.animation, delete Ia.animationiteration.animation, delete Ia.animationstart.animation), "TransitionEvent" in window || delete Ia.transitionend.transition);
  function Oa(l) {
    if (hf[l]) return hf[l];
    if (!Ia[l]) return l;
    var t = Ia[l], a;
    for (a in t) if (t.hasOwnProperty(a) && a in Fi) return hf[l] = t[a];
    return l;
  }
  var ki = Oa("animationend"), Ii = Oa("animationiteration"), Pi = Oa("animationstart"), xy = Oa("transitionrun"), Jy = Oa("transitionstart"), Wy = Oa("transitioncancel"), l0 = Oa("transitionend"), t0 = /* @__PURE__ */ new Map(), Sf = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
  Sf.push("scrollEnd");
  function zt(l, t) {
    t0.set(l, t), Ea(t, [l]);
  }
  var jn = typeof reportError == "function" ? reportError : function(l) {
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
  }, ct = [], Pa = 0, sf = 0;
  function Gn() {
    for (var l = Pa, t = sf = Pa = 0; t < l; ) {
      var a = ct[t];
      ct[t++] = null;
      var u = ct[t];
      ct[t++] = null;
      var n = ct[t];
      ct[t++] = null;
      var e = ct[t];
      if (ct[t++] = null, u !== null && n !== null) {
        var f = u.pending;
        f === null ? n.next = n : (n.next = f.next, f.next = n), u.pending = n;
      }
      e !== 0 && a0(a, n, e);
    }
  }
  function rn(l, t, a, u) {
    ct[Pa++] = l, ct[Pa++] = t, ct[Pa++] = a, ct[Pa++] = u, sf |= u, l.lanes |= u, l = l.alternate, l !== null && (l.lanes |= u);
  }
  function gf(l, t, a, u) {
    return rn(l, t, a, u), Xn(l);
  }
  function Da(l, t) {
    return rn(l, null, null, t), Xn(l);
  }
  function a0(l, t, a) {
    l.lanes |= a;
    var u = l.alternate;
    u !== null && (u.lanes |= a);
    for (var n = !1, e = l.return; e !== null; ) e.childLanes |= a, u = e.alternate, u !== null && (u.childLanes |= a), e.tag === 22 && (l = e.stateNode, l === null || l._visibility & 1 || (n = !0)), l = e, e = e.return;
    return l.tag === 3 ? (e = l.stateNode, n && t !== null && (n = 31 - Il(a), l = e.hiddenUpdates, u = l[n], u === null ? l[n] = [t] : u.push(t), t.lane = a | 536870912), e) : null;
  }
  function Xn(l) {
    if (50 < cn) throw cn = 0, Oc = null, Error(S(185));
    for (var t = l.return; t !== null; ) l = t, t = l.return;
    return l.tag === 3 ? l.stateNode : null;
  }
  var lu = {};
  function wy(l, t, a, u) {
    this.tag = l, this.key = a, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = u, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function lt(l, t, a, u) {
    return new wy(l, t, a, u);
  }
  function of(l) {
    return l = l.prototype, !(!l || !l.isReactComponent);
  }
  function Yt(l, t) {
    var a = l.alternate;
    return a === null ? (a = lt(l.tag, t, l.key, l.mode), a.elementType = l.elementType, a.type = l.type, a.stateNode = l.stateNode, a.alternate = l, l.alternate = a) : (a.pendingProps = t, a.type = l.type, a.flags = 0, a.subtreeFlags = 0, a.deletions = null), a.flags = l.flags & 65011712, a.childLanes = l.childLanes, a.lanes = l.lanes, a.child = l.child, a.memoizedProps = l.memoizedProps, a.memoizedState = l.memoizedState, a.updateQueue = l.updateQueue, t = l.dependencies, a.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }, a.sibling = l.sibling, a.index = l.index, a.ref = l.ref, a.refCleanup = l.refCleanup, a;
  }
  function u0(l, t) {
    l.flags &= 65011714;
    var a = l.alternate;
    return a === null ? (l.childLanes = 0, l.lanes = t, l.child = null, l.subtreeFlags = 0, l.memoizedProps = null, l.memoizedState = null, l.updateQueue = null, l.dependencies = null, l.stateNode = null) : (l.childLanes = a.childLanes, l.lanes = a.lanes, l.child = a.child, l.subtreeFlags = 0, l.deletions = null, l.memoizedProps = a.memoizedProps, l.memoizedState = a.memoizedState, l.updateQueue = a.updateQueue, l.type = a.type, t = a.dependencies, l.dependencies = t === null ? null : {
      lanes: t.lanes,
      firstContext: t.firstContext
    }), l;
  }
  function Qn(l, t, a, u, n, e) {
    var f = 0;
    if (u = l, typeof l == "function") of(l) && (f = 1);
    else if (typeof l == "string") f = ld(l, a, q.current) ? 26 : l === "html" || l === "head" || l === "body" ? 27 : 5;
    else l: switch (l) {
      case Et:
        return l = lt(31, a, t, n), l.elementType = Et, l.lanes = e, l;
      case Kl:
        return Ua(a.children, n, e, t);
      case Wt:
        f = 8, n |= 24;
        break;
      case xl:
        return l = lt(12, a, t, n | 2), l.elementType = xl, l.lanes = e, l;
      case Jl:
        return l = lt(13, a, t, n), l.elementType = Jl, l.lanes = e, l;
      case Wl:
        return l = lt(19, a, t, n), l.elementType = Wl, l.lanes = e, l;
      default:
        if (typeof l == "object" && l !== null) switch (l.$$typeof) {
          case Ml:
            f = 10;
            break l;
          case wt:
            f = 9;
            break l;
          case ot:
            f = 11;
            break l;
          case w:
            f = 14;
            break l;
          case jl:
            f = 16, u = null;
            break l;
        }
        f = 29, a = Error(S(130, l === null ? "null" : typeof l, "")), u = null;
    }
    return t = lt(f, a, t, n), t.elementType = l, t.type = u, t.lanes = e, t;
  }
  function Ua(l, t, a, u) {
    return l = lt(7, l, u, t), l.lanes = a, l;
  }
  function bf(l, t, a) {
    return l = lt(6, l, null, t), l.lanes = a, l;
  }
  function n0(l) {
    var t = lt(18, null, null, 0);
    return t.stateNode = l, t;
  }
  function zf(l, t, a) {
    return t = lt(4, l.children !== null ? l.children : [], l.key, t), t.lanes = a, t.stateNode = {
      containerInfo: l.containerInfo,
      pendingChildren: null,
      implementation: l.implementation
    }, t;
  }
  var e0 = /* @__PURE__ */ new WeakMap();
  function it(l, t) {
    if (typeof l == "object" && l !== null) {
      var a = e0.get(l);
      return a !== void 0 ? a : (t = {
        value: l,
        source: t,
        stack: ui(t)
      }, e0.set(l, t), t);
    }
    return {
      value: l,
      source: t,
      stack: ui(t)
    };
  }
  var tu = [], au = 0, Zn = null, Qu = 0, vt = [], yt = 0, It = null, Mt = 1, Ot = "";
  function Bt(l, t) {
    tu[au++] = Qu, tu[au++] = Zn, Zn = l, Qu = t;
  }
  function f0(l, t, a) {
    vt[yt++] = Mt, vt[yt++] = Ot, vt[yt++] = It, It = l;
    var u = Mt;
    l = Ot;
    var n = 32 - Il(u) - 1;
    u &= ~(1 << n), a += 1;
    var e = 32 - Il(t) + n;
    if (30 < e) {
      var f = n - n % 5;
      e = (u & (1 << f) - 1).toString(32), u >>= f, n -= f, Mt = 1 << 32 - Il(t) + n | a << n | u, Ot = e + l;
    } else Mt = 1 << e | a << n | u, Ot = l;
  }
  function _f(l) {
    l.return !== null && (Bt(l, 1), f0(l, 1, 0));
  }
  function Tf(l) {
    for (; l === Zn; ) Zn = tu[--au], tu[au] = null, Qu = tu[--au], tu[au] = null;
    for (; l === It; ) It = vt[--yt], vt[yt] = null, Ot = vt[--yt], vt[yt] = null, Mt = vt[--yt], vt[yt] = null;
  }
  function c0(l, t) {
    vt[yt++] = Mt, vt[yt++] = Ot, vt[yt++] = It, Mt = t.id, Ot = t.overflow, It = l;
  }
  var Nl = null, vl = null, W = !1, Pt = null, mt = !1, Ef = Error(S(519));
  function la(l) {
    throw Zu(it(Error(S(418, 1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML", "")), l)), Ef;
  }
  function i0(l) {
    var t = l.stateNode, a = l.type, u = l.memoizedProps;
    switch (t[Ul] = l, t[Gl] = u, a) {
      case "dialog":
        K("cancel", t), K("close", t);
        break;
      case "iframe":
      case "object":
      case "embed":
        K("load", t);
        break;
      case "video":
      case "audio":
        for (a = 0; a < yn.length; a++) K(yn[a], t);
        break;
      case "source":
        K("error", t);
        break;
      case "img":
      case "image":
      case "link":
        K("error", t), K("load", t);
        break;
      case "details":
        K("toggle", t);
        break;
      case "input":
        K("invalid", t), Ti(t, u.value, u.defaultValue, u.checked, u.defaultChecked, u.type, u.name, !0);
        break;
      case "select":
        K("invalid", t);
        break;
      case "textarea":
        K("invalid", t), Ai(t, u.value, u.defaultValue, u.children);
    }
    a = u.children, typeof a != "string" && typeof a != "number" && typeof a != "bigint" || t.textContent === "" + a || u.suppressHydrationWarning === !0 || A1(t.textContent, a) ? (u.popover != null && (K("beforetoggle", t), K("toggle", t)), u.onScroll != null && K("scroll", t), u.onScrollEnd != null && K("scrollend", t), u.onClick != null && (t.onclick = Ht), t = !0) : t = !1, t || la(l, !0);
  }
  function v0(l) {
    for (Nl = l.return; Nl; ) switch (Nl.tag) {
      case 5:
      case 31:
      case 13:
        mt = !1;
        return;
      case 27:
      case 3:
        mt = !0;
        return;
      default:
        Nl = Nl.return;
    }
  }
  function uu(l) {
    if (l !== Nl) return !1;
    if (!W) return v0(l), W = !0, !1;
    var t = l.tag, a;
    if ((a = t !== 3 && t !== 27) && ((a = t === 5) && (a = l.type, a = !(a !== "form" && a !== "button") || Xc(l.type, l.memoizedProps)), a = !a), a && vl && la(l), v0(l), t === 13) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(S(317));
      vl = B1(l);
    } else if (t === 31) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(S(317));
      vl = B1(l);
    } else t === 27 ? (t = vl, da(l.type) ? (l = Kc, Kc = null, vl = l) : vl = t) : vl = Nl ? St(l.stateNode.nextSibling) : null;
    return !0;
  }
  function Na() {
    vl = Nl = null, W = !1;
  }
  function Af() {
    var l = Pt;
    return l !== null && (Vl === null ? Vl = l : Vl.push.apply(Vl, l), Pt = null), l;
  }
  function Zu(l) {
    Pt === null ? Pt = [l] : Pt.push(l);
  }
  var Mf = y(null), Ha = null, Ct = null;
  function ta(l, t, a) {
    M(Mf, t._currentValue), t._currentValue = a;
  }
  function Rt(l) {
    l._currentValue = Mf.current, T(Mf);
  }
  function Of(l, t, a) {
    for (; l !== null; ) {
      var u = l.alternate;
      if ((l.childLanes & t) !== t ? (l.childLanes |= t, u !== null && (u.childLanes |= t)) : u !== null && (u.childLanes & t) !== t && (u.childLanes |= t), l === a) break;
      l = l.return;
    }
  }
  function Df(l, t, a, u) {
    var n = l.child;
    for (n !== null && (n.return = l); n !== null; ) {
      var e = n.dependencies;
      if (e !== null) {
        var f = n.child;
        e = e.firstContext;
        l: for (; e !== null; ) {
          var c = e;
          e = n;
          for (var i = 0; i < t.length; i++) if (c.context === t[i]) {
            e.lanes |= a, c = e.alternate, c !== null && (c.lanes |= a), Of(e.return, a, l), u || (f = null);
            break l;
          }
          e = c.next;
        }
      } else if (n.tag === 18) {
        if (f = n.return, f === null) throw Error(S(341));
        f.lanes |= a, e = f.alternate, e !== null && (e.lanes |= a), Of(f, a, l), f = null;
      } else f = n.child;
      if (f !== null) f.return = n;
      else for (f = n; f !== null; ) {
        if (f === l) {
          f = null;
          break;
        }
        if (n = f.sibling, n !== null) {
          n.return = f.return, f = n;
          break;
        }
        f = f.return;
      }
      n = f;
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
        var f = n.alternate;
        if (f === null) throw Error(S(387));
        if (f = f.memoizedProps, f !== null) {
          var c = n.type;
          Pl(n.pendingProps.value, f.value) || (l !== null ? l.push(c) : l = [c]);
        }
      } else if (n === tl.current) {
        if (f = n.alternate, f === null) throw Error(S(387));
        f.memoizedState.memoizedState !== n.memoizedState.memoizedState && (l !== null ? l.push(sn) : l = [sn]);
      }
      n = n.return;
    }
    l !== null && Df(t, l, a, u), t.flags |= 262144;
  }
  function Vn(l) {
    for (l = l.firstContext; l !== null; ) {
      if (!Pl(l.context._currentValue, l.memoizedValue)) return !0;
      l = l.next;
    }
    return !1;
  }
  function qa(l) {
    Ha = l, Ct = null, l = l.dependencies, l !== null && (l.firstContext = null);
  }
  function Hl(l) {
    return y0(Ha, l);
  }
  function Ln(l, t) {
    return Ha === null && qa(l), y0(l, t);
  }
  function y0(l, t) {
    var a = t._currentValue;
    if (t = {
      context: t,
      memoizedValue: a,
      next: null
    }, Ct === null) {
      if (l === null) throw Error(S(308));
      Ct = t, l.dependencies = {
        lanes: 0,
        firstContext: t
      }, l.flags |= 524288;
    } else Ct = Ct.next = t;
    return a;
  }
  var $y = typeof AbortController < "u" ? AbortController : function() {
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
  }, Fy = O.unstable_scheduleCallback, ky = O.unstable_NormalPriority, bl = {
    $$typeof: Ml,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function Uf() {
    return {
      controller: new $y(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function Vu(l) {
    l.refCount--, l.refCount === 0 && Fy(ky, function() {
      l.controller.abort();
    });
  }
  var Lu = null, Nf = 0, eu = 0, fu = null;
  function Iy(l, t) {
    if (Lu === null) {
      var a = Lu = [];
      Nf = 0, eu = Yc(), fu = {
        status: "pending",
        value: void 0,
        then: function(u) {
          a.push(u);
        }
      };
    }
    return Nf++, t.then(m0, m0), t;
  }
  function m0() {
    if (--Nf === 0 && Lu !== null) {
      fu !== null && (fu.status = "fulfilled");
      var l = Lu;
      Lu = null, eu = 0, fu = null;
      for (var t = 0; t < l.length; t++) (0, l[t])();
    }
  }
  function Py(l, t) {
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
  var d0 = A.S;
  A.S = function(l, t) {
    Jv = Fl(), typeof t == "object" && t !== null && typeof t.then == "function" && Iy(l, t), d0 !== null && d0(l, t);
  };
  var Ya = y(null);
  function Hf() {
    var l = Ya.current;
    return l !== null ? l : cl.pooledCache;
  }
  function Kn(l, t) {
    t === null ? M(Ya, Ya.current) : M(Ya, t.pool);
  }
  function h0() {
    var l = Hf();
    return l === null ? null : {
      parent: bl._currentValue,
      pool: l
    };
  }
  var cu = Error(S(460)), qf = Error(S(474)), xn = Error(S(542)), Jn = { then: function() {
  } };
  function S0(l) {
    return l = l.status, l === "fulfilled" || l === "rejected";
  }
  function s0(l, t, a) {
    switch (a = l[a], a === void 0 ? l.push(t) : a !== t && (t.then(Ht, Ht), t = a), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw l = t.reason, o0(l), l;
      default:
        if (typeof t.status == "string") t.then(Ht, Ht);
        else {
          if (l = cl, l !== null && 100 < l.shellSuspendCounter) throw Error(S(482));
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
            throw l = t.reason, o0(l), l;
        }
        throw Ca = t, cu;
    }
  }
  function Ba(l) {
    try {
      var t = l._init;
      return t(l._payload);
    } catch (a) {
      throw a !== null && typeof a == "object" && typeof a.then == "function" ? (Ca = a, cu) : a;
    }
  }
  var Ca = null;
  function g0() {
    if (Ca === null) throw Error(S(459));
    var l = Ca;
    return Ca = null, l;
  }
  function o0(l) {
    if (l === cu || l === xn) throw Error(S(483));
  }
  var iu = null, Ku = 0;
  function Wn(l) {
    var t = Ku;
    return Ku += 1, iu === null && (iu = []), s0(iu, l, t);
  }
  function xu(l, t) {
    t = t.props.ref, l.ref = t !== void 0 ? t : null;
  }
  function wn(l, t) {
    throw t.$$typeof === gt ? Error(S(525)) : (l = Object.prototype.toString.call(t), Error(S(31, l === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : l)));
  }
  function b0(l) {
    function t(m, v) {
      if (l) {
        var d = m.deletions;
        d === null ? (m.deletions = [v], m.flags |= 16) : d.push(v);
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
    function e(m, v, d) {
      return m.index = d, l ? (d = m.alternate, d !== null ? (d = d.index, d < v ? (m.flags |= 67108866, v) : d) : (m.flags |= 67108866, v)) : (m.flags |= 1048576, v);
    }
    function f(m) {
      return l && m.alternate === null && (m.flags |= 67108866), m;
    }
    function c(m, v, d, z) {
      return v === null || v.tag !== 6 ? (v = bf(d, m.mode, z), v.return = m, v) : (v = n(v, d), v.return = m, v);
    }
    function i(m, v, d, z) {
      var Y = d.type;
      return Y === Kl ? o(m, v, d.props.children, z, d.key) : v !== null && (v.elementType === Y || typeof Y == "object" && Y !== null && Y.$$typeof === jl && Ba(Y) === v.type) ? (v = n(v, d.props), xu(v, d), v.return = m, v) : (v = Qn(d.type, d.key, d.props, null, m.mode, z), xu(v, d), v.return = m, v);
    }
    function h(m, v, d, z) {
      return v === null || v.tag !== 4 || v.stateNode.containerInfo !== d.containerInfo || v.stateNode.implementation !== d.implementation ? (v = zf(d, m.mode, z), v.return = m, v) : (v = n(v, d.children || []), v.return = m, v);
    }
    function o(m, v, d, z, Y) {
      return v === null || v.tag !== 7 ? (v = Ua(d, m.mode, z, Y), v.return = m, v) : (v = n(v, d), v.return = m, v);
    }
    function _(m, v, d) {
      if (typeof v == "string" && v !== "" || typeof v == "number" || typeof v == "bigint") return v = bf("" + v, m.mode, d), v.return = m, v;
      if (typeof v == "object" && v !== null) {
        switch (v.$$typeof) {
          case Bl:
            return d = Qn(v.type, v.key, v.props, null, m.mode, d), xu(d, v), d.return = m, d;
          case pl:
            return v = zf(v, m.mode, d), v.return = m, v;
          case jl:
            return v = Ba(v), _(m, v, d);
        }
        if (U(v) || At(v)) return v = Ua(v, m.mode, d, null), v.return = m, v;
        if (typeof v.then == "function") return _(m, Wn(v), d);
        if (v.$$typeof === Ml) return _(m, Ln(m, v), d);
        wn(m, v);
      }
      return null;
    }
    function s(m, v, d, z) {
      var Y = v !== null ? v.key : null;
      if (typeof d == "string" && d !== "" || typeof d == "number" || typeof d == "bigint") return Y !== null ? null : c(m, v, "" + d, z);
      if (typeof d == "object" && d !== null) {
        switch (d.$$typeof) {
          case Bl:
            return d.key === Y ? i(m, v, d, z) : null;
          case pl:
            return d.key === Y ? h(m, v, d, z) : null;
          case jl:
            return d = Ba(d), s(m, v, d, z);
        }
        if (U(d) || At(d)) return Y !== null ? null : o(m, v, d, z, null);
        if (typeof d.then == "function") return s(m, v, Wn(d), z);
        if (d.$$typeof === Ml) return s(m, v, Ln(m, d), z);
        wn(m, d);
      }
      return null;
    }
    function g(m, v, d, z, Y) {
      if (typeof z == "string" && z !== "" || typeof z == "number" || typeof z == "bigint") return m = m.get(d) || null, c(v, m, "" + z, Y);
      if (typeof z == "object" && z !== null) {
        switch (z.$$typeof) {
          case Bl:
            return m = m.get(z.key === null ? d : z.key) || null, i(v, m, z, Y);
          case pl:
            return m = m.get(z.key === null ? d : z.key) || null, h(v, m, z, Y);
          case jl:
            return z = Ba(z), g(m, v, d, z, Y);
        }
        if (U(z) || At(z)) return m = m.get(d) || null, o(v, m, z, Y, null);
        if (typeof z.then == "function") return g(m, v, d, Wn(z), Y);
        if (z.$$typeof === Ml) return g(m, v, d, Ln(v, z), Y);
        wn(v, z);
      }
      return null;
    }
    function N(m, v, d, z) {
      for (var Y = null, $ = null, H = v, Q = v = 0, J = null; H !== null && Q < d.length; Q++) {
        H.index > Q ? (J = H, H = null) : J = H.sibling;
        var F = s(m, H, d[Q], z);
        if (F === null) {
          H === null && (H = J);
          break;
        }
        l && H && F.alternate === null && t(m, H), v = e(F, v, Q), $ === null ? Y = F : $.sibling = F, $ = F, H = J;
      }
      if (Q === d.length) return a(m, H), W && Bt(m, Q), Y;
      if (H === null) {
        for (; Q < d.length; Q++) H = _(m, d[Q], z), H !== null && (v = e(H, v, Q), $ === null ? Y = H : $.sibling = H, $ = H);
        return W && Bt(m, Q), Y;
      }
      for (H = u(H); Q < d.length; Q++) J = g(H, m, Q, d[Q], z), J !== null && (l && J.alternate !== null && H.delete(J.key === null ? Q : J.key), v = e(J, v, Q), $ === null ? Y = J : $.sibling = J, $ = J);
      return l && H.forEach(function(oa) {
        return t(m, oa);
      }), W && Bt(m, Q), Y;
    }
    function R(m, v, d, z) {
      if (d == null) throw Error(S(151));
      for (var Y = null, $ = null, H = v, Q = v = 0, J = null, F = d.next(); H !== null && !F.done; Q++, F = d.next()) {
        H.index > Q ? (J = H, H = null) : J = H.sibling;
        var oa = s(m, H, F.value, z);
        if (oa === null) {
          H === null && (H = J);
          break;
        }
        l && H && oa.alternate === null && t(m, H), v = e(oa, v, Q), $ === null ? Y = oa : $.sibling = oa, $ = oa, H = J;
      }
      if (F.done) return a(m, H), W && Bt(m, Q), Y;
      if (H === null) {
        for (; !F.done; Q++, F = d.next()) F = _(m, F.value, z), F !== null && (v = e(F, v, Q), $ === null ? Y = F : $.sibling = F, $ = F);
        return W && Bt(m, Q), Y;
      }
      for (H = u(H); !F.done; Q++, F = d.next()) F = g(H, m, Q, F.value, z), F !== null && (l && F.alternate !== null && H.delete(F.key === null ? Q : F.key), v = e(F, v, Q), $ === null ? Y = F : $.sibling = F, $ = F);
      return l && H.forEach(function(Sd) {
        return t(m, Sd);
      }), W && Bt(m, Q), Y;
    }
    function fl(m, v, d, z) {
      if (typeof d == "object" && d !== null && d.type === Kl && d.key === null && (d = d.props.children), typeof d == "object" && d !== null) {
        switch (d.$$typeof) {
          case Bl:
            l: {
              for (var Y = d.key; v !== null; ) {
                if (v.key === Y) {
                  if (Y = d.type, Y === Kl) {
                    if (v.tag === 7) {
                      a(m, v.sibling), z = n(v, d.props.children), z.return = m, m = z;
                      break l;
                    }
                  } else if (v.elementType === Y || typeof Y == "object" && Y !== null && Y.$$typeof === jl && Ba(Y) === v.type) {
                    a(m, v.sibling), z = n(v, d.props), xu(z, d), z.return = m, m = z;
                    break l;
                  }
                  a(m, v);
                  break;
                } else t(m, v);
                v = v.sibling;
              }
              d.type === Kl ? (z = Ua(d.props.children, m.mode, z, d.key), z.return = m, m = z) : (z = Qn(d.type, d.key, d.props, null, m.mode, z), xu(z, d), z.return = m, m = z);
            }
            return f(m);
          case pl:
            l: {
              for (Y = d.key; v !== null; ) {
                if (v.key === Y) if (v.tag === 4 && v.stateNode.containerInfo === d.containerInfo && v.stateNode.implementation === d.implementation) {
                  a(m, v.sibling), z = n(v, d.children || []), z.return = m, m = z;
                  break l;
                } else {
                  a(m, v);
                  break;
                }
                else t(m, v);
                v = v.sibling;
              }
              z = zf(d, m.mode, z), z.return = m, m = z;
            }
            return f(m);
          case jl:
            return d = Ba(d), fl(m, v, d, z);
        }
        if (U(d)) return N(m, v, d, z);
        if (At(d)) {
          if (Y = At(d), typeof Y != "function") throw Error(S(150));
          return d = Y.call(d), R(m, v, d, z);
        }
        if (typeof d.then == "function") return fl(m, v, Wn(d), z);
        if (d.$$typeof === Ml) return fl(m, v, Ln(m, d), z);
        wn(m, d);
      }
      return typeof d == "string" && d !== "" || typeof d == "number" || typeof d == "bigint" ? (d = "" + d, v !== null && v.tag === 6 ? (a(m, v.sibling), z = n(v, d), z.return = m, m = z) : (a(m, v), z = bf(d, m.mode, z), z.return = m, m = z), f(m)) : a(m, v);
    }
    return function(m, v, d, z) {
      try {
        Ku = 0;
        var Y = fl(m, v, d, z);
        return iu = null, Y;
      } catch (H) {
        if (H === cu || H === xn) throw H;
        var $ = lt(29, H, null, m.mode);
        return $.lanes = z, $.return = m, $;
      }
    };
  }
  var Ra = b0(!0), z0 = b0(!1), aa = !1;
  function Yf(l) {
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
  function Bf(l, t) {
    l = l.updateQueue, t.updateQueue === l && (t.updateQueue = {
      baseState: l.baseState,
      firstBaseUpdate: l.firstBaseUpdate,
      lastBaseUpdate: l.lastBaseUpdate,
      shared: l.shared,
      callbacks: null
    });
  }
  function pa(l) {
    return {
      lane: l,
      tag: 0,
      payload: null,
      callback: null,
      next: null
    };
  }
  function ja(l, t, a) {
    var u = l.updateQueue;
    if (u === null) return null;
    if (u = u.shared, (P & 2) !== 0) {
      var n = u.pending;
      return n === null ? t.next = t : (t.next = n.next, n.next = t), u.pending = t, t = Xn(l), a0(l, null, a), t;
    }
    return rn(l, u, t, a), Xn(l);
  }
  function Ju(l, t, a) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (a & 4194048) !== 0)) {
      var u = t.lanes;
      u &= l.pendingLanes, a |= u, t.lanes = a, vi(l, a);
    }
  }
  function Cf(l, t) {
    var a = l.updateQueue, u = l.alternate;
    if (u !== null && (u = u.updateQueue, a === u)) {
      var n = null, e = null;
      if (a = a.firstBaseUpdate, a !== null) {
        do {
          var f = {
            lane: a.lane,
            tag: a.tag,
            payload: a.payload,
            callback: null,
            next: null
          };
          e === null ? n = e = f : e = e.next = f, a = a.next;
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
  var Rf = !1;
  function Wu() {
    if (Rf) {
      var l = fu;
      if (l !== null) throw l;
    }
  }
  function wu(l, t, a, u) {
    Rf = !1;
    var n = l.updateQueue;
    aa = !1;
    var e = n.firstBaseUpdate, f = n.lastBaseUpdate, c = n.shared.pending;
    if (c !== null) {
      n.shared.pending = null;
      var i = c, h = i.next;
      i.next = null, f === null ? e = h : f.next = h, f = i;
      var o = l.alternate;
      o !== null && (o = o.updateQueue, c = o.lastBaseUpdate, c !== f && (c === null ? o.firstBaseUpdate = h : c.next = h, o.lastBaseUpdate = i));
    }
    if (e !== null) {
      var _ = n.baseState;
      f = 0, o = h = i = null, c = e;
      do {
        var s = c.lane & -536870913, g = s !== c.lane;
        if (g ? (x & s) === s : (u & s) === s) {
          s !== 0 && s === eu && (Rf = !0), o !== null && (o = o.next = {
            lane: 0,
            tag: c.tag,
            payload: c.payload,
            callback: null,
            next: null
          });
          l: {
            var N = l, R = c;
            s = t;
            var fl = a;
            switch (R.tag) {
              case 1:
                if (N = R.payload, typeof N == "function") {
                  _ = N.call(fl, _, s);
                  break l;
                }
                _ = N;
                break l;
              case 3:
                N.flags = N.flags & -65537 | 128;
              case 0:
                if (N = R.payload, s = typeof N == "function" ? N.call(fl, _, s) : N, s == null) break l;
                _ = C({}, _, s);
                break l;
              case 2:
                aa = !0;
            }
          }
          s = c.callback, s !== null && (l.flags |= 64, g && (l.flags |= 8192), g = n.callbacks, g === null ? n.callbacks = [s] : g.push(s));
        } else g = {
          lane: s,
          tag: c.tag,
          payload: c.payload,
          callback: c.callback,
          next: null
        }, o === null ? (h = o = g, i = _) : o = o.next = g, f |= s;
        if (c = c.next, c === null) {
          if (c = n.shared.pending, c === null) break;
          g = c, c = g.next, g.next = null, n.lastBaseUpdate = g, n.shared.pending = null;
        }
      } while (!0);
      o === null && (i = _), n.baseState = i, n.firstBaseUpdate = h, n.lastBaseUpdate = o, e === null && (n.shared.lanes = 0), ca |= f, l.lanes = f, l.memoizedState = _;
    }
  }
  function _0(l, t) {
    if (typeof l != "function") throw Error(S(191, l));
    l.call(t);
  }
  function T0(l, t) {
    var a = l.callbacks;
    if (a !== null) for (l.callbacks = null, l = 0; l < a.length; l++) _0(a[l], t);
  }
  var vu = y(null), $n = y(0);
  function E0(l, t) {
    l = Lt, M($n, l), M(vu, t), Lt = l | t.baseLanes;
  }
  function pf() {
    M($n, Lt), M(vu, vu.current);
  }
  function jf() {
    Lt = $n.current, T(vu), T($n);
  }
  var tt = y(null), dt = null;
  function ua(l) {
    var t = l.alternate;
    M(gl, gl.current & 1), M(tt, l), dt === null && (t === null || vu.current !== null || t.memoizedState !== null) && (dt = l);
  }
  function Gf(l) {
    M(gl, gl.current), M(tt, l), dt === null && (dt = l);
  }
  function A0(l) {
    l.tag === 22 ? (M(gl, gl.current), M(tt, l), dt === null && (dt = l)) : na(l);
  }
  function na() {
    M(gl, gl.current), M(tt, tt.current);
  }
  function at(l) {
    T(tt), dt === l && (dt = null), T(gl);
  }
  var gl = y(0);
  function Fn(l) {
    for (var t = l; t !== null; ) {
      if (t.tag === 13) {
        var a = t.memoizedState;
        if (a !== null && (a = a.dehydrated, a === null || Vc(a) || Lc(a))) return t;
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
  var pt = 0, G = null, nl = null, zl = null, kn = !1, yu = !1, Ga = !1, In = 0, $u = 0, mu = null, lm = 0;
  function hl() {
    throw Error(S(321));
  }
  function rf(l, t) {
    if (t === null) return !1;
    for (var a = 0; a < t.length && a < l.length; a++) if (!Pl(l[a], t[a])) return !1;
    return !0;
  }
  function Xf(l, t, a, u, n, e) {
    return pt = e, G = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, A.H = l === null || l.memoizedState === null ? fv : lc, Ga = !1, e = a(u, n), Ga = !1, yu && (e = O0(t, a, u, n)), M0(l), e;
  }
  function M0(l) {
    A.H = Iu;
    var t = nl !== null && nl.next !== null;
    if (pt = 0, zl = nl = G = null, kn = !1, $u = 0, mu = null, t) throw Error(S(300));
    l === null || _l || (l = l.dependencies, l !== null && Vn(l) && (_l = !0));
  }
  function O0(l, t, a, u) {
    G = l;
    var n = 0;
    do {
      if (yu && (mu = null), $u = 0, yu = !1, 25 <= n) throw Error(S(301));
      if (n += 1, zl = nl = null, l.updateQueue != null) {
        var e = l.updateQueue;
        e.lastEffect = null, e.events = null, e.stores = null, e.memoCache != null && (e.memoCache.index = 0);
      }
      A.H = cv, e = t(a, u);
    } while (yu);
    return e;
  }
  function tm() {
    var l = A.H, t = l.useState()[0];
    return t = typeof t.then == "function" ? Fu(t) : t, l = l.useState()[0], (nl !== null ? nl.memoizedState : null) !== l && (G.flags |= 1024), t;
  }
  function Qf() {
    var l = In !== 0;
    return In = 0, l;
  }
  function Zf(l, t, a) {
    t.updateQueue = l.updateQueue, t.flags &= -2053, l.lanes &= ~a;
  }
  function Vf(l) {
    if (kn) {
      for (l = l.memoizedState; l !== null; ) {
        var t = l.queue;
        t !== null && (t.pending = null), l = l.next;
      }
      kn = !1;
    }
    pt = 0, zl = nl = G = null, yu = !1, $u = In = 0, mu = null;
  }
  function Rl() {
    var l = {
      memoizedState: null,
      baseState: null,
      baseQueue: null,
      queue: null,
      next: null
    };
    return zl === null ? G.memoizedState = zl = l : zl = zl.next = l, zl;
  }
  function ol() {
    if (nl === null) {
      var l = G.alternate;
      l = l !== null ? l.memoizedState : null;
    } else l = nl.next;
    var t = zl === null ? G.memoizedState : zl.next;
    if (t !== null) zl = t, nl = l;
    else {
      if (l === null)
        throw G.alternate === null ? Error(S(467)) : Error(S(310));
      nl = l, l = {
        memoizedState: nl.memoizedState,
        baseState: nl.baseState,
        baseQueue: nl.baseQueue,
        queue: nl.queue,
        next: null
      }, zl === null ? G.memoizedState = zl = l : zl = zl.next = l;
    }
    return zl;
  }
  function Pn() {
    return {
      lastEffect: null,
      events: null,
      stores: null,
      memoCache: null
    };
  }
  function Fu(l) {
    var t = $u;
    return $u += 1, mu === null && (mu = []), l = s0(mu, l, t), t = G, (zl === null ? t.memoizedState : zl.next) === null && (t = t.alternate, A.H = t === null || t.memoizedState === null ? fv : lc), l;
  }
  function le(l) {
    if (l !== null && typeof l == "object") {
      if (typeof l.then == "function") return Fu(l);
      if (l.$$typeof === Ml) return Hl(l);
    }
    throw Error(S(438, String(l)));
  }
  function Lf(l) {
    var t = null, a = G.updateQueue;
    if (a !== null && (t = a.memoCache), t == null) {
      var u = G.alternate;
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
    }, a === null && (a = Pn(), G.updateQueue = a), a.memoCache = t, a = t.data[t.index], a === void 0) for (a = t.data[t.index] = Array(l), u = 0; u < l; u++) a[u] = za;
    return t.index++, a;
  }
  function jt(l, t) {
    return typeof t == "function" ? t(l) : t;
  }
  function te(l) {
    return Kf(ol(), nl, l);
  }
  function Kf(l, t, a) {
    var u = l.queue;
    if (u === null) throw Error(S(311));
    u.lastRenderedReducer = a;
    var n = l.baseQueue, e = u.pending;
    if (e !== null) {
      if (n !== null) {
        var f = n.next;
        n.next = e.next, e.next = f;
      }
      t.baseQueue = n = e, u.pending = null;
    }
    if (e = l.baseState, n === null) l.memoizedState = e;
    else {
      t = n.next;
      var c = f = null, i = null, h = t, o = !1;
      do {
        var _ = h.lane & -536870913;
        if (_ !== h.lane ? (x & _) === _ : (pt & _) === _) {
          var s = h.revertLane;
          if (s === 0) i !== null && (i = i.next = {
            lane: 0,
            revertLane: 0,
            gesture: null,
            action: h.action,
            hasEagerState: h.hasEagerState,
            eagerState: h.eagerState,
            next: null
          }), _ === eu && (o = !0);
          else if ((pt & s) === s) {
            h = h.next, s === eu && (o = !0);
            continue;
          } else _ = {
            lane: 0,
            revertLane: h.revertLane,
            gesture: null,
            action: h.action,
            hasEagerState: h.hasEagerState,
            eagerState: h.eagerState,
            next: null
          }, i === null ? (c = i = _, f = e) : i = i.next = _, G.lanes |= s, ca |= s;
          _ = h.action, Ga && a(e, _), e = h.hasEagerState ? h.eagerState : a(e, _);
        } else s = {
          lane: _,
          revertLane: h.revertLane,
          gesture: h.gesture,
          action: h.action,
          hasEagerState: h.hasEagerState,
          eagerState: h.eagerState,
          next: null
        }, i === null ? (c = i = s, f = e) : i = i.next = s, G.lanes |= _, ca |= _;
        h = h.next;
      } while (h !== null && h !== t);
      if (i === null ? f = e : i.next = c, !Pl(e, l.memoizedState) && (_l = !0, o && (a = fu, a !== null))) throw a;
      l.memoizedState = e, l.baseState = f, l.baseQueue = i, u.lastRenderedState = e;
    }
    return n === null && (u.lanes = 0), [l.memoizedState, u.dispatch];
  }
  function xf(l) {
    var t = ol(), a = t.queue;
    if (a === null) throw Error(S(311));
    a.lastRenderedReducer = l;
    var u = a.dispatch, n = a.pending, e = t.memoizedState;
    if (n !== null) {
      a.pending = null;
      var f = n = n.next;
      do
        e = l(e, f.action), f = f.next;
      while (f !== n);
      Pl(e, t.memoizedState) || (_l = !0), t.memoizedState = e, t.baseQueue === null && (t.baseState = e), a.lastRenderedState = e;
    }
    return [e, u];
  }
  function D0(l, t, a) {
    var u = G, n = ol(), e = W;
    if (e) {
      if (a === void 0) throw Error(S(407));
      a = a();
    } else a = t();
    var f = !Pl((nl || n).memoizedState, a);
    if (f && (n.memoizedState = a, _l = !0), n = n.queue, wf(H0.bind(null, u, n, l), [l]), n.getSnapshot !== t || f || zl !== null && zl.memoizedState.tag & 1) {
      if (u.flags |= 2048, du(9, { destroy: void 0 }, N0.bind(null, u, n, a, t), null), cl === null) throw Error(S(349));
      e || (pt & 127) !== 0 || U0(u, t, a);
    }
    return a;
  }
  function U0(l, t, a) {
    l.flags |= 16384, l = {
      getSnapshot: t,
      value: a
    }, t = G.updateQueue, t === null ? (t = Pn(), G.updateQueue = t, t.stores = [l]) : (a = t.stores, a === null ? t.stores = [l] : a.push(l));
  }
  function N0(l, t, a, u) {
    t.value = a, t.getSnapshot = u, q0(t) && Y0(l);
  }
  function H0(l, t, a) {
    return a(function() {
      q0(t) && Y0(l);
    });
  }
  function q0(l) {
    var t = l.getSnapshot;
    l = l.value;
    try {
      var a = t();
      return !Pl(l, a);
    } catch {
      return !0;
    }
  }
  function Y0(l) {
    var t = Da(l, 2);
    t !== null && Ll(t, l, 2);
  }
  function Jf(l) {
    var t = Rl();
    if (typeof l == "function") {
      var a = l;
      if (l = a(), Ga) {
        $t(!0);
        try {
          a();
        } finally {
          $t(!1);
        }
      }
    }
    return t.memoizedState = t.baseState = l, t.queue = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: jt,
      lastRenderedState: l
    }, t;
  }
  function B0(l, t, a, u) {
    return l.baseState = a, Kf(l, nl, typeof u == "function" ? u : jt);
  }
  function am(l, t, a, u, n) {
    if (ne(l)) throw Error(S(485));
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
        then: function(f) {
          e.listeners.push(f);
        }
      };
      A.T !== null ? a(!0) : e.isTransition = !1, u(e), a = t.pending, a === null ? (e.next = t.pending = e, C0(t, e)) : (e.next = a.next, t.pending = a.next = e);
    }
  }
  function C0(l, t) {
    var a = t.action, u = t.payload, n = l.state;
    if (t.isTransition) {
      var e = A.T, f = {};
      A.T = f;
      try {
        var c = a(n, u), i = A.S;
        i !== null && i(f, c), R0(l, t, c);
      } catch (h) {
        Wf(l, t, h);
      } finally {
        e !== null && f.types !== null && (e.types = f.types), A.T = e;
      }
    } else try {
      e = a(n, u), R0(l, t, e);
    } catch (h) {
      Wf(l, t, h);
    }
  }
  function R0(l, t, a) {
    a !== null && typeof a == "object" && typeof a.then == "function" ? a.then(function(u) {
      p0(l, t, u);
    }, function(u) {
      return Wf(l, t, u);
    }) : p0(l, t, a);
  }
  function p0(l, t, a) {
    t.status = "fulfilled", t.value = a, j0(t), l.state = a, t = l.pending, t !== null && (a = t.next, a === t ? l.pending = null : (a = a.next, t.next = a, C0(l, a)));
  }
  function Wf(l, t, a) {
    var u = l.pending;
    if (l.pending = null, u !== null) {
      u = u.next;
      do
        t.status = "rejected", t.reason = a, j0(t), t = t.next;
      while (t !== u);
    }
    l.action = null;
  }
  function j0(l) {
    l = l.listeners;
    for (var t = 0; t < l.length; t++) (0, l[t])();
  }
  function G0(l, t) {
    return t;
  }
  function r0(l, t) {
    if (W) {
      var a = cl.formState;
      if (a !== null) {
        l: {
          var u = G;
          if (W) {
            if (vl) {
              t: {
                for (var n = vl, e = mt; n.nodeType !== 8; ) {
                  if (!e) {
                    n = null;
                    break t;
                  }
                  if (n = St(n.nextSibling), n === null) {
                    n = null;
                    break t;
                  }
                }
                e = n.data, n = e === "F!" || e === "F" ? n : null;
              }
              if (n) {
                vl = St(n.nextSibling), u = n.data === "F!";
                break l;
              }
            }
            la(u);
          }
          u = !1;
        }
        u && (t = a[0]);
      }
    }
    return a = Rl(), a.memoizedState = a.baseState = t, u = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: G0,
      lastRenderedState: t
    }, a.queue = u, a = uv.bind(null, G, u), u.dispatch = a, u = Jf(!1), e = Pf.bind(null, G, !1, u.queue), u = Rl(), n = {
      state: t,
      dispatch: null,
      action: l,
      pending: null
    }, u.queue = n, a = am.bind(null, G, n, e, a), n.dispatch = a, u.memoizedState = l, [
      t,
      a,
      !1
    ];
  }
  function X0(l) {
    return Q0(ol(), nl, l);
  }
  function Q0(l, t, a) {
    if (t = Kf(l, t, G0)[0], l = te(jt)[0], typeof t == "object" && t !== null && typeof t.then == "function") try {
      var u = Fu(t);
    } catch (f) {
      throw f === cu ? xn : f;
    }
    else u = t;
    t = ol();
    var n = t.queue, e = n.dispatch;
    return a !== t.memoizedState && (G.flags |= 2048, du(9, { destroy: void 0 }, um.bind(null, n, a), null)), [
      u,
      e,
      l
    ];
  }
  function um(l, t) {
    l.action = t;
  }
  function Z0(l) {
    var t = ol(), a = nl;
    if (a !== null) return Q0(t, a, l);
    ol(), t = t.memoizedState, a = ol();
    var u = a.queue.dispatch;
    return a.memoizedState = l, [
      t,
      u,
      !1
    ];
  }
  function du(l, t, a, u) {
    return l = {
      tag: l,
      create: a,
      deps: u,
      inst: t,
      next: null
    }, t = G.updateQueue, t === null && (t = Pn(), G.updateQueue = t), a = t.lastEffect, a === null ? t.lastEffect = l.next = l : (u = a.next, a.next = l, l.next = u, t.lastEffect = l), l;
  }
  function V0() {
    return ol().memoizedState;
  }
  function ae(l, t, a, u) {
    var n = Rl();
    G.flags |= l, n.memoizedState = du(1 | t, { destroy: void 0 }, a, u === void 0 ? null : u);
  }
  function ue(l, t, a, u) {
    var n = ol();
    u = u === void 0 ? null : u;
    var e = n.memoizedState.inst;
    nl !== null && u !== null && rf(u, nl.memoizedState.deps) ? n.memoizedState = du(t, e, a, u) : (G.flags |= l, n.memoizedState = du(1 | t, e, a, u));
  }
  function L0(l, t) {
    ae(8390656, 8, l, t);
  }
  function wf(l, t) {
    ue(2048, 8, l, t);
  }
  function nm(l) {
    G.flags |= 4;
    var t = G.updateQueue;
    if (t === null) t = Pn(), G.updateQueue = t, t.events = [l];
    else {
      var a = t.events;
      a === null ? t.events = [l] : a.push(l);
    }
  }
  function K0(l) {
    var t = ol().memoizedState;
    return nm({
      ref: t,
      nextImpl: l
    }), function() {
      if ((P & 2) !== 0) throw Error(S(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function x0(l, t) {
    return ue(4, 2, l, t);
  }
  function J0(l, t) {
    return ue(4, 4, l, t);
  }
  function W0(l, t) {
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
  function w0(l, t, a) {
    a = a != null ? a.concat([l]) : null, ue(4, 4, W0.bind(null, t, l), a);
  }
  function $f() {
  }
  function $0(l, t) {
    var a = ol();
    t = t === void 0 ? null : t;
    var u = a.memoizedState;
    return t !== null && rf(t, u[1]) ? u[0] : (a.memoizedState = [l, t], l);
  }
  function F0(l, t) {
    var a = ol();
    t = t === void 0 ? null : t;
    var u = a.memoizedState;
    if (t !== null && rf(t, u[1])) return u[0];
    if (u = l(), Ga) {
      $t(!0);
      try {
        l();
      } finally {
        $t(!1);
      }
    }
    return a.memoizedState = [u, t], u;
  }
  function Ff(l, t, a) {
    return a === void 0 || (pt & 1073741824) !== 0 && (x & 261930) === 0 ? l.memoizedState = t : (l.memoizedState = a, l = wv(), G.lanes |= l, ca |= l, a);
  }
  function k0(l, t, a, u) {
    return Pl(a, t) ? a : vu.current !== null ? (l = Ff(l, a, u), Pl(l, t) || (_l = !0), l) : (pt & 42) === 0 || (pt & 1073741824) !== 0 && (x & 261930) === 0 ? (_l = !0, l.memoizedState = a) : (l = wv(), G.lanes |= l, ca |= l, t);
  }
  function I0(l, t, a, u, n) {
    var e = D.p;
    D.p = e !== 0 && 8 > e ? e : 8;
    var f = A.T, c = {};
    A.T = c, Pf(l, !1, t, a);
    try {
      var i = n(), h = A.S;
      h !== null && h(c, i), i !== null && typeof i == "object" && typeof i.then == "function" ? ku(l, t, Py(i, u), ht(l)) : ku(l, t, u, ht(l));
    } catch (o) {
      ku(l, t, {
        then: function() {
        },
        status: "rejected",
        reason: o
      }, ht());
    } finally {
      D.p = e, f !== null && c.types !== null && (f.types = c.types), A.T = f;
    }
  }
  function em() {
  }
  function kf(l, t, a, u) {
    if (l.tag !== 5) throw Error(S(476));
    var n = P0(l).queue;
    I0(l, n, t, I, a === null ? em : function() {
      return lv(l), a(u);
    });
  }
  function P0(l) {
    var t = l.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: I,
      baseState: I,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: jt,
        lastRenderedState: I
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
        lastRenderedReducer: jt,
        lastRenderedState: a
      },
      next: null
    }, l.memoizedState = t, l = l.alternate, l !== null && (l.memoizedState = t), t;
  }
  function lv(l) {
    var t = P0(l);
    t.next === null && (t = l.alternate.memoizedState), ku(l, t.next.queue, {}, ht());
  }
  function If() {
    return Hl(sn);
  }
  function tv() {
    return ol().memoizedState;
  }
  function av() {
    return ol().memoizedState;
  }
  function fm(l) {
    for (var t = l.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var a = ht();
          l = pa(a);
          var u = ja(t, l, a);
          u !== null && (Ll(u, t, a), Ju(u, t, a)), t = { cache: Uf() }, l.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function cm(l, t, a) {
    var u = ht();
    a = {
      lane: u,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, ne(l) ? nv(t, a) : (a = gf(l, t, a, u), a !== null && (Ll(a, l, u), ev(a, t, u)));
  }
  function uv(l, t, a) {
    ku(l, t, a, ht());
  }
  function ku(l, t, a, u) {
    var n = {
      lane: u,
      revertLane: 0,
      gesture: null,
      action: a,
      hasEagerState: !1,
      eagerState: null,
      next: null
    };
    if (ne(l)) nv(t, n);
    else {
      var e = l.alternate;
      if (l.lanes === 0 && (e === null || e.lanes === 0) && (e = t.lastRenderedReducer, e !== null)) try {
        var f = t.lastRenderedState, c = e(f, a);
        if (n.hasEagerState = !0, n.eagerState = c, Pl(c, f)) return rn(l, t, n, 0), cl === null && Gn(), !1;
      } catch {
      }
      if (a = gf(l, t, n, u), a !== null) return Ll(a, l, u), ev(a, t, u), !0;
    }
    return !1;
  }
  function Pf(l, t, a, u) {
    if (u = {
      lane: 2,
      revertLane: Yc(),
      gesture: null,
      action: u,
      hasEagerState: !1,
      eagerState: null,
      next: null
    }, ne(l)) {
      if (t) throw Error(S(479));
    } else t = gf(l, a, u, 2), t !== null && Ll(t, l, 2);
  }
  function ne(l) {
    var t = l.alternate;
    return l === G || t !== null && t === G;
  }
  function nv(l, t) {
    yu = kn = !0;
    var a = l.pending;
    a === null ? t.next = t : (t.next = a.next, a.next = t), l.pending = t;
  }
  function ev(l, t, a) {
    if ((a & 4194048) !== 0) {
      var u = t.lanes;
      u &= l.pendingLanes, a |= u, t.lanes = a, vi(l, a);
    }
  }
  var Iu = {
    readContext: Hl,
    use: le,
    useCallback: hl,
    useContext: hl,
    useEffect: hl,
    useImperativeHandle: hl,
    useLayoutEffect: hl,
    useInsertionEffect: hl,
    useMemo: hl,
    useReducer: hl,
    useRef: hl,
    useState: hl,
    useDebugValue: hl,
    useDeferredValue: hl,
    useTransition: hl,
    useSyncExternalStore: hl,
    useId: hl,
    useHostTransitionStatus: hl,
    useFormState: hl,
    useActionState: hl,
    useOptimistic: hl,
    useMemoCache: hl,
    useCacheRefresh: hl
  };
  Iu.useEffectEvent = hl;
  var fv = {
    readContext: Hl,
    use: le,
    useCallback: function(l, t) {
      return Rl().memoizedState = [l, t === void 0 ? null : t], l;
    },
    useContext: Hl,
    useEffect: L0,
    useImperativeHandle: function(l, t, a) {
      a = a != null ? a.concat([l]) : null, ae(4194308, 4, W0.bind(null, t, l), a);
    },
    useLayoutEffect: function(l, t) {
      return ae(4194308, 4, l, t);
    },
    useInsertionEffect: function(l, t) {
      ae(4, 2, l, t);
    },
    useMemo: function(l, t) {
      var a = Rl();
      t = t === void 0 ? null : t;
      var u = l();
      if (Ga) {
        $t(!0);
        try {
          l();
        } finally {
          $t(!1);
        }
      }
      return a.memoizedState = [u, t], u;
    },
    useReducer: function(l, t, a) {
      var u = Rl();
      if (a !== void 0) {
        var n = a(t);
        if (Ga) {
          $t(!0);
          try {
            a(t);
          } finally {
            $t(!1);
          }
        }
      } else n = t;
      return u.memoizedState = u.baseState = n, l = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: l,
        lastRenderedState: n
      }, u.queue = l, l = l.dispatch = cm.bind(null, G, l), [u.memoizedState, l];
    },
    useRef: function(l) {
      var t = Rl();
      return l = { current: l }, t.memoizedState = l;
    },
    useState: function(l) {
      l = Jf(l);
      var t = l.queue, a = uv.bind(null, G, t);
      return t.dispatch = a, [l.memoizedState, a];
    },
    useDebugValue: $f,
    useDeferredValue: function(l, t) {
      return Ff(Rl(), l, t);
    },
    useTransition: function() {
      var l = Jf(!1);
      return l = I0.bind(null, G, l.queue, !0, !1), Rl().memoizedState = l, [!1, l];
    },
    useSyncExternalStore: function(l, t, a) {
      var u = G, n = Rl();
      if (W) {
        if (a === void 0) throw Error(S(407));
        a = a();
      } else {
        if (a = t(), cl === null) throw Error(S(349));
        (x & 127) !== 0 || U0(u, t, a);
      }
      n.memoizedState = a;
      var e = {
        value: a,
        getSnapshot: t
      };
      return n.queue = e, L0(H0.bind(null, u, e, l), [l]), u.flags |= 2048, du(9, { destroy: void 0 }, N0.bind(null, u, e, a, t), null), a;
    },
    useId: function() {
      var l = Rl(), t = cl.identifierPrefix;
      if (W) {
        var a = Ot, u = Mt;
        a = (u & ~(1 << 32 - Il(u) - 1)).toString(32) + a, t = "_" + t + "R_" + a, a = In++, 0 < a && (t += "H" + a.toString(32)), t += "_";
      } else a = lm++, t = "_" + t + "r_" + a.toString(32) + "_";
      return l.memoizedState = t;
    },
    useHostTransitionStatus: If,
    useFormState: r0,
    useActionState: r0,
    useOptimistic: function(l) {
      var t = Rl();
      t.memoizedState = t.baseState = l;
      var a = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: null,
        lastRenderedState: null
      };
      return t.queue = a, t = Pf.bind(null, G, !0, a), a.dispatch = t, [l, t];
    },
    useMemoCache: Lf,
    useCacheRefresh: function() {
      return Rl().memoizedState = fm.bind(null, G);
    },
    useEffectEvent: function(l) {
      var t = Rl(), a = { impl: l };
      return t.memoizedState = a, function() {
        if ((P & 2) !== 0) throw Error(S(440));
        return a.impl.apply(void 0, arguments);
      };
    }
  }, lc = {
    readContext: Hl,
    use: le,
    useCallback: $0,
    useContext: Hl,
    useEffect: wf,
    useImperativeHandle: w0,
    useInsertionEffect: x0,
    useLayoutEffect: J0,
    useMemo: F0,
    useReducer: te,
    useRef: V0,
    useState: function() {
      return te(jt);
    },
    useDebugValue: $f,
    useDeferredValue: function(l, t) {
      return k0(ol(), nl.memoizedState, l, t);
    },
    useTransition: function() {
      var l = te(jt)[0], t = ol().memoizedState;
      return [typeof l == "boolean" ? l : Fu(l), t];
    },
    useSyncExternalStore: D0,
    useId: tv,
    useHostTransitionStatus: If,
    useFormState: X0,
    useActionState: X0,
    useOptimistic: function(l, t) {
      return B0(ol(), nl, l, t);
    },
    useMemoCache: Lf,
    useCacheRefresh: av
  };
  lc.useEffectEvent = K0;
  var cv = {
    readContext: Hl,
    use: le,
    useCallback: $0,
    useContext: Hl,
    useEffect: wf,
    useImperativeHandle: w0,
    useInsertionEffect: x0,
    useLayoutEffect: J0,
    useMemo: F0,
    useReducer: xf,
    useRef: V0,
    useState: function() {
      return xf(jt);
    },
    useDebugValue: $f,
    useDeferredValue: function(l, t) {
      var a = ol();
      return nl === null ? Ff(a, l, t) : k0(a, nl.memoizedState, l, t);
    },
    useTransition: function() {
      var l = xf(jt)[0], t = ol().memoizedState;
      return [typeof l == "boolean" ? l : Fu(l), t];
    },
    useSyncExternalStore: D0,
    useId: tv,
    useHostTransitionStatus: If,
    useFormState: Z0,
    useActionState: Z0,
    useOptimistic: function(l, t) {
      var a = ol();
      return nl !== null ? B0(a, nl, l, t) : (a.baseState = l, [l, a.queue.dispatch]);
    },
    useMemoCache: Lf,
    useCacheRefresh: av
  };
  cv.useEffectEvent = K0;
  function tc(l, t, a, u) {
    t = l.memoizedState, a = a(u, t), a = a == null ? t : C({}, t, a), l.memoizedState = a, l.lanes === 0 && (l.updateQueue.baseState = a);
  }
  var ac = {
    enqueueSetState: function(l, t, a) {
      l = l._reactInternals;
      var u = ht(), n = pa(u);
      n.payload = t, a != null && (n.callback = a), t = ja(l, n, u), t !== null && (Ll(t, l, u), Ju(t, l, u));
    },
    enqueueReplaceState: function(l, t, a) {
      l = l._reactInternals;
      var u = ht(), n = pa(u);
      n.tag = 1, n.payload = t, a != null && (n.callback = a), t = ja(l, n, u), t !== null && (Ll(t, l, u), Ju(t, l, u));
    },
    enqueueForceUpdate: function(l, t) {
      l = l._reactInternals;
      var a = ht(), u = pa(a);
      u.tag = 2, t != null && (u.callback = t), t = ja(l, u, a), t !== null && (Ll(t, l, a), Ju(t, l, a));
    }
  };
  function iv(l, t, a, u, n, e, f) {
    return l = l.stateNode, typeof l.shouldComponentUpdate == "function" ? l.shouldComponentUpdate(u, e, f) : t.prototype && t.prototype.isPureReactComponent ? !ru(a, u) || !ru(n, e) : !0;
  }
  function vv(l, t, a, u) {
    l = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(a, u), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(a, u), t.state !== l && ac.enqueueReplaceState(t, t.state, null);
  }
  function ra(l, t) {
    var a = t;
    if ("ref" in t) {
      a = {};
      for (var u in t) u !== "ref" && (a[u] = t[u]);
    }
    if (l = l.defaultProps) {
      a === t && (a = C({}, a));
      for (var n in l) a[n] === void 0 && (a[n] = l[n]);
    }
    return a;
  }
  function im(l) {
    jn(l);
  }
  function vm(l) {
    console.error(l);
  }
  function ym(l) {
    jn(l);
  }
  function ee(l, t) {
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
    } catch (n) {
      setTimeout(function() {
        throw n;
      });
    }
  }
  function uc(l, t, a) {
    return a = pa(a), a.tag = 3, a.payload = { element: null }, a.callback = function() {
      ee(l, t);
    }, a;
  }
  function mv(l) {
    return l = pa(l), l.tag = 3, l;
  }
  function dv(l, t, a, u) {
    var n = a.type.getDerivedStateFromError;
    if (typeof n == "function") {
      var e = u.value;
      l.payload = function() {
        return n(e);
      }, l.callback = function() {
        yv(t, a, u);
      };
    }
    var f = a.stateNode;
    f !== null && typeof f.componentDidCatch == "function" && (l.callback = function() {
      yv(t, a, u), typeof n != "function" && (ia === null ? ia = /* @__PURE__ */ new Set([this]) : ia.add(this));
      var c = u.stack;
      this.componentDidCatch(u.value, { componentStack: c !== null ? c : "" });
    });
  }
  function mm(l, t, a, u, n) {
    if (a.flags |= 32768, u !== null && typeof u == "object" && typeof u.then == "function") {
      if (t = a.alternate, t !== null && nu(t, a, n, !0), a = tt.current, a !== null) {
        switch (a.tag) {
          case 31:
          case 13:
            return dt === null ? oe() : a.alternate === null && Sl === 0 && (Sl = 3), a.flags &= -257, a.flags |= 65536, a.lanes = n, u === Jn ? a.flags |= 16384 : (t = a.updateQueue, t === null ? a.updateQueue = /* @__PURE__ */ new Set([u]) : t.add(u), Nc(l, u, n)), !1;
          case 22:
            return a.flags |= 65536, u === Jn ? a.flags |= 16384 : (t = a.updateQueue, t === null ? (t = {
              transitions: null,
              markerInstances: null,
              retryQueue: /* @__PURE__ */ new Set([u])
            }, a.updateQueue = t) : (a = t.retryQueue, a === null ? t.retryQueue = /* @__PURE__ */ new Set([u]) : a.add(u)), Nc(l, u, n)), !1;
        }
        throw Error(S(435, a.tag));
      }
      return Nc(l, u, n), oe(), !1;
    }
    if (W) return t = tt.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = n, u !== Ef && (l = Error(S(422), { cause: u }), Zu(it(l, a)))) : (u !== Ef && (t = Error(S(423), { cause: u }), Zu(it(t, a))), l = l.current.alternate, l.flags |= 65536, n &= -n, l.lanes |= n, u = it(u, a), n = uc(l.stateNode, u, n), Cf(l, n), Sl !== 4 && (Sl = 2)), !1;
    var e = Error(S(520), { cause: u });
    if (e = it(e, a), fn === null ? fn = [e] : fn.push(e), Sl !== 4 && (Sl = 2), t === null) return !0;
    u = it(u, a), a = t;
    do {
      switch (a.tag) {
        case 3:
          return a.flags |= 65536, l = n & -n, a.lanes |= l, l = uc(a.stateNode, u, l), Cf(a, l), !1;
        case 1:
          if (t = a.type, e = a.stateNode, (a.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || e !== null && typeof e.componentDidCatch == "function" && (ia === null || !ia.has(e)))) return a.flags |= 65536, n &= -n, a.lanes |= n, n = mv(n), dv(n, l, a, u), Cf(a, n), !1;
      }
      a = a.return;
    } while (a !== null);
    return !1;
  }
  var nc = Error(S(461)), _l = !1;
  function ql(l, t, a, u) {
    t.child = l === null ? z0(t, null, a, u) : Ra(t, l.child, a, u);
  }
  function hv(l, t, a, u, n) {
    a = a.render;
    var e = t.ref;
    if ("ref" in u) {
      var f = {};
      for (var c in u) c !== "ref" && (f[c] = u[c]);
    } else f = u;
    return qa(t), u = Xf(l, t, a, f, e, n), c = Qf(), l !== null && !_l ? (Zf(l, t, n), Gt(l, t, n)) : (W && c && _f(t), t.flags |= 1, ql(l, t, u, n), t.child);
  }
  function Sv(l, t, a, u, n) {
    if (l === null) {
      var e = a.type;
      return typeof e == "function" && !of(e) && e.defaultProps === void 0 && a.compare === null ? (t.tag = 15, t.type = e, sv(l, t, e, u, n)) : (l = Qn(a.type, null, u, t, t.mode, n), l.ref = t.ref, l.return = t, t.child = l);
    }
    if (e = l.child, !dc(l, n)) {
      var f = e.memoizedProps;
      if (a = a.compare, a = a !== null ? a : ru, a(f, u) && l.ref === t.ref) return Gt(l, t, n);
    }
    return t.flags |= 1, l = Yt(e, u), l.ref = t.ref, l.return = t, t.child = l;
  }
  function sv(l, t, a, u, n) {
    if (l !== null) {
      var e = l.memoizedProps;
      if (ru(e, u) && l.ref === t.ref) if (_l = !1, t.pendingProps = u = e, dc(l, n)) (l.flags & 131072) !== 0 && (_l = !0);
      else return t.lanes = l.lanes, Gt(l, t, n);
    }
    return ec(l, t, a, u, n);
  }
  function gv(l, t, a, u) {
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
        return ov(l, t, e, a, u);
      }
      if ((a & 536870912) !== 0) t.memoizedState = {
        baseLanes: 0,
        cachePool: null
      }, l !== null && Kn(t, e !== null ? e.cachePool : null), e !== null ? E0(t, e) : pf(), A0(t);
      else return u = t.lanes = 536870912, ov(l, t, e !== null ? e.baseLanes | a : a, a, u);
    } else e !== null ? (Kn(t, e.cachePool), E0(t, e), na(t), t.memoizedState = null) : (l !== null && Kn(t, null), pf(), na(t));
    return ql(l, t, n, a), t.child;
  }
  function Pu(l, t) {
    return l !== null && l.tag === 22 || t.stateNode !== null || (t.stateNode = {
      _visibility: 1,
      _pendingMarkers: null,
      _retryCache: null,
      _transitions: null
    }), t.sibling;
  }
  function ov(l, t, a, u, n) {
    var e = Hf();
    return e = e === null ? null : {
      parent: bl._currentValue,
      pool: e
    }, t.memoizedState = {
      baseLanes: a,
      cachePool: e
    }, l !== null && Kn(t, null), pf(), A0(t), l !== null && nu(l, t, u, !0), t.childLanes = n, null;
  }
  function fe(l, t) {
    return t = ie({
      mode: t.mode,
      children: t.children
    }, l.mode), t.ref = l.ref, l.child = t, t.return = l, t;
  }
  function bv(l, t, a) {
    return Ra(t, l.child, null, a), l = fe(t, t.pendingProps), l.flags |= 2, at(t), t.memoizedState = null, l;
  }
  function dm(l, t, a) {
    var u = t.pendingProps, n = (t.flags & 128) !== 0;
    if (t.flags &= -129, l === null) {
      if (W) {
        if (u.mode === "hidden") return l = fe(t, u), t.lanes = 536870912, Pu(null, l);
        if (Gf(t), (l = vl) ? (l = Y1(l, mt), l = l !== null && l.data === "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: It !== null ? {
            id: Mt,
            overflow: Ot
          } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = n0(l), a.return = t, t.child = a, Nl = t, vl = null)) : l = null, l === null) throw la(t);
        return t.lanes = 536870912, null;
      }
      return fe(t, u);
    }
    var e = l.memoizedState;
    if (e !== null) {
      var f = e.dehydrated;
      if (Gf(t), n) if (t.flags & 256) t.flags &= -257, t = bv(l, t, a);
      else if (t.memoizedState !== null) t.child = l.child, t.flags |= 128, t = null;
      else throw Error(S(558));
      else if (_l || nu(l, t, a, !1), n = (a & l.childLanes) !== 0, _l || n) {
        if (u = cl, u !== null && (f = yi(u, a), f !== 0 && f !== e.retryLane)) throw e.retryLane = f, Da(l, f), Ll(u, l, f), nc;
        oe(), t = bv(l, t, a);
      } else l = e.treeContext, vl = St(f.nextSibling), Nl = t, W = !0, Pt = null, mt = !1, l !== null && c0(t, l), t = fe(t, u), t.flags |= 4096;
      return t;
    }
    return l = Yt(l.child, {
      mode: u.mode,
      children: u.children
    }), l.ref = t.ref, t.child = l, l.return = t, l;
  }
  function ce(l, t) {
    var a = t.ref;
    if (a === null) l !== null && l.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof a != "function" && typeof a != "object") throw Error(S(284));
      (l === null || l.ref !== a) && (t.flags |= 4194816);
    }
  }
  function ec(l, t, a, u, n) {
    return qa(t), a = Xf(l, t, a, u, void 0, n), u = Qf(), l !== null && !_l ? (Zf(l, t, n), Gt(l, t, n)) : (W && u && _f(t), t.flags |= 1, ql(l, t, a, n), t.child);
  }
  function zv(l, t, a, u, n, e) {
    return qa(t), t.updateQueue = null, a = O0(t, u, a, n), M0(l), u = Qf(), l !== null && !_l ? (Zf(l, t, e), Gt(l, t, e)) : (W && u && _f(t), t.flags |= 1, ql(l, t, a, e), t.child);
  }
  function _v(l, t, a, u, n) {
    if (qa(t), t.stateNode === null) {
      var e = lu, f = a.contextType;
      typeof f == "object" && f !== null && (e = Hl(f)), e = new a(u, e), t.memoizedState = e.state !== null && e.state !== void 0 ? e.state : null, e.updater = ac, t.stateNode = e, e._reactInternals = t, e = t.stateNode, e.props = u, e.state = t.memoizedState, e.refs = {}, Yf(t), f = a.contextType, e.context = typeof f == "object" && f !== null ? Hl(f) : lu, e.state = t.memoizedState, f = a.getDerivedStateFromProps, typeof f == "function" && (tc(t, a, f, u), e.state = t.memoizedState), typeof a.getDerivedStateFromProps == "function" || typeof e.getSnapshotBeforeUpdate == "function" || typeof e.UNSAFE_componentWillMount != "function" && typeof e.componentWillMount != "function" || (f = e.state, typeof e.componentWillMount == "function" && e.componentWillMount(), typeof e.UNSAFE_componentWillMount == "function" && e.UNSAFE_componentWillMount(), f !== e.state && ac.enqueueReplaceState(e, e.state, null), wu(t, u, e, n), Wu(), e.state = t.memoizedState), typeof e.componentDidMount == "function" && (t.flags |= 4194308), u = !0;
    } else if (l === null) {
      e = t.stateNode;
      var c = t.memoizedProps, i = ra(a, c);
      e.props = i;
      var h = e.context, o = a.contextType;
      f = lu, typeof o == "object" && o !== null && (f = Hl(o));
      var _ = a.getDerivedStateFromProps;
      o = typeof _ == "function" || typeof e.getSnapshotBeforeUpdate == "function", c = t.pendingProps !== c, o || typeof e.UNSAFE_componentWillReceiveProps != "function" && typeof e.componentWillReceiveProps != "function" || (c || h !== f) && vv(t, e, u, f), aa = !1;
      var s = t.memoizedState;
      e.state = s, wu(t, u, e, n), Wu(), h = t.memoizedState, c || s !== h || aa ? (typeof _ == "function" && (tc(t, a, _, u), h = t.memoizedState), (i = aa || iv(t, a, i, u, s, h, f)) ? (o || typeof e.UNSAFE_componentWillMount != "function" && typeof e.componentWillMount != "function" || (typeof e.componentWillMount == "function" && e.componentWillMount(), typeof e.UNSAFE_componentWillMount == "function" && e.UNSAFE_componentWillMount()), typeof e.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof e.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = u, t.memoizedState = h), e.props = u, e.state = h, e.context = f, u = i) : (typeof e.componentDidMount == "function" && (t.flags |= 4194308), u = !1);
    } else {
      e = t.stateNode, Bf(l, t), f = t.memoizedProps, o = ra(a, f), e.props = o, _ = t.pendingProps, s = e.context, h = a.contextType, i = lu, typeof h == "object" && h !== null && (i = Hl(h)), c = a.getDerivedStateFromProps, (h = typeof c == "function" || typeof e.getSnapshotBeforeUpdate == "function") || typeof e.UNSAFE_componentWillReceiveProps != "function" && typeof e.componentWillReceiveProps != "function" || (f !== _ || s !== i) && vv(t, e, u, i), aa = !1, s = t.memoizedState, e.state = s, wu(t, u, e, n), Wu();
      var g = t.memoizedState;
      f !== _ || s !== g || aa || l !== null && l.dependencies !== null && Vn(l.dependencies) ? (typeof c == "function" && (tc(t, a, c, u), g = t.memoizedState), (o = aa || iv(t, a, o, u, s, g, i) || l !== null && l.dependencies !== null && Vn(l.dependencies)) ? (h || typeof e.UNSAFE_componentWillUpdate != "function" && typeof e.componentWillUpdate != "function" || (typeof e.componentWillUpdate == "function" && e.componentWillUpdate(u, g, i), typeof e.UNSAFE_componentWillUpdate == "function" && e.UNSAFE_componentWillUpdate(u, g, i)), typeof e.componentDidUpdate == "function" && (t.flags |= 4), typeof e.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof e.componentDidUpdate != "function" || f === l.memoizedProps && s === l.memoizedState || (t.flags |= 4), typeof e.getSnapshotBeforeUpdate != "function" || f === l.memoizedProps && s === l.memoizedState || (t.flags |= 1024), t.memoizedProps = u, t.memoizedState = g), e.props = u, e.state = g, e.context = i, u = o) : (typeof e.componentDidUpdate != "function" || f === l.memoizedProps && s === l.memoizedState || (t.flags |= 4), typeof e.getSnapshotBeforeUpdate != "function" || f === l.memoizedProps && s === l.memoizedState || (t.flags |= 1024), u = !1);
    }
    return e = u, ce(l, t), u = (t.flags & 128) !== 0, e || u ? (e = t.stateNode, a = u && typeof a.getDerivedStateFromError != "function" ? null : e.render(), t.flags |= 1, l !== null && u ? (t.child = Ra(t, l.child, null, n), t.child = Ra(t, null, a, n)) : ql(l, t, a, n), t.memoizedState = e.state, l = t.child) : l = Gt(l, t, n), l;
  }
  function Tv(l, t, a, u) {
    return Na(), t.flags |= 256, ql(l, t, a, u), t.child;
  }
  var fc = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  function cc(l) {
    return {
      baseLanes: l,
      cachePool: h0()
    };
  }
  function ic(l, t, a) {
    return l = l !== null ? l.childLanes & ~a : 0, t && (l |= nt), l;
  }
  function Ev(l, t, a) {
    var u = t.pendingProps, n = !1, e = (t.flags & 128) !== 0, f;
    if ((f = e) || (f = l !== null && l.memoizedState === null ? !1 : (gl.current & 2) !== 0), f && (n = !0, t.flags &= -129), f = (t.flags & 32) !== 0, t.flags &= -33, l === null) {
      if (W) {
        if (n ? ua(t) : na(t), (l = vl) ? (l = Y1(l, mt), l = l !== null && l.data !== "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: It !== null ? {
            id: Mt,
            overflow: Ot
          } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = n0(l), a.return = t, t.child = a, Nl = t, vl = null)) : l = null, l === null) throw la(t);
        return Lc(l) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var c = u.children;
      return u = u.fallback, n ? (na(t), n = t.mode, c = ie({
        mode: "hidden",
        children: c
      }, n), u = Ua(u, n, a, null), c.return = t, u.return = t, c.sibling = u, t.child = c, u = t.child, u.memoizedState = cc(a), u.childLanes = ic(l, f, a), t.memoizedState = fc, Pu(null, u)) : (ua(t), vc(t, c));
    }
    var i = l.memoizedState;
    if (i !== null && (c = i.dehydrated, c !== null)) {
      if (e) t.flags & 256 ? (ua(t), t.flags &= -257, t = yc(l, t, a)) : t.memoizedState !== null ? (na(t), t.child = l.child, t.flags |= 128, t = null) : (na(t), c = u.fallback, n = t.mode, u = ie({
        mode: "visible",
        children: u.children
      }, n), c = Ua(c, n, a, null), c.flags |= 2, u.return = t, c.return = t, u.sibling = c, t.child = u, Ra(t, l.child, null, a), u = t.child, u.memoizedState = cc(a), u.childLanes = ic(l, f, a), t.memoizedState = fc, t = Pu(null, u));
      else if (ua(t), Lc(c)) {
        if (f = c.nextSibling && c.nextSibling.dataset, f) var h = f.dgst;
        f = h, u = Error(S(419)), u.stack = "", u.digest = f, Zu({
          value: u,
          source: null,
          stack: null
        }), t = yc(l, t, a);
      } else if (_l || nu(l, t, a, !1), f = (a & l.childLanes) !== 0, _l || f) {
        if (f = cl, f !== null && (u = yi(f, a), u !== 0 && u !== i.retryLane)) throw i.retryLane = u, Da(l, u), Ll(f, l, u), nc;
        Vc(c) || oe(), t = yc(l, t, a);
      } else Vc(c) ? (t.flags |= 192, t.child = l.child, t = null) : (l = i.treeContext, vl = St(c.nextSibling), Nl = t, W = !0, Pt = null, mt = !1, l !== null && c0(t, l), t = vc(t, u.children), t.flags |= 4096);
      return t;
    }
    return n ? (na(t), c = u.fallback, n = t.mode, i = l.child, h = i.sibling, u = Yt(i, {
      mode: "hidden",
      children: u.children
    }), u.subtreeFlags = i.subtreeFlags & 65011712, h !== null ? c = Yt(h, c) : (c = Ua(c, n, a, null), c.flags |= 2), c.return = t, u.return = t, u.sibling = c, t.child = u, Pu(null, u), u = t.child, c = l.child.memoizedState, c === null ? c = cc(a) : (n = c.cachePool, n !== null ? (i = bl._currentValue, n = n.parent !== i ? {
      parent: i,
      pool: i
    } : n) : n = h0(), c = {
      baseLanes: c.baseLanes | a,
      cachePool: n
    }), u.memoizedState = c, u.childLanes = ic(l, f, a), t.memoizedState = fc, Pu(l.child, u)) : (ua(t), a = l.child, l = a.sibling, a = Yt(a, {
      mode: "visible",
      children: u.children
    }), a.return = t, a.sibling = null, l !== null && (f = t.deletions, f === null ? (t.deletions = [l], t.flags |= 16) : f.push(l)), t.child = a, t.memoizedState = null, a);
  }
  function vc(l, t) {
    return t = ie({
      mode: "visible",
      children: t
    }, l.mode), t.return = l, l.child = t;
  }
  function ie(l, t) {
    return l = lt(22, l, null, t), l.lanes = 0, l;
  }
  function yc(l, t, a) {
    return Ra(t, l.child, null, a), l = vc(t, t.pendingProps.children), l.flags |= 2, t.memoizedState = null, l;
  }
  function Av(l, t, a) {
    l.lanes |= t;
    var u = l.alternate;
    u !== null && (u.lanes |= t), Of(l.return, t, a);
  }
  function mc(l, t, a, u, n, e) {
    var f = l.memoizedState;
    f === null ? l.memoizedState = {
      isBackwards: t,
      rendering: null,
      renderingStartTime: 0,
      last: u,
      tail: a,
      tailMode: n,
      treeForkCount: e
    } : (f.isBackwards = t, f.rendering = null, f.renderingStartTime = 0, f.last = u, f.tail = a, f.tailMode = n, f.treeForkCount = e);
  }
  function Mv(l, t, a) {
    var u = t.pendingProps, n = u.revealOrder, e = u.tail;
    u = u.children;
    var f = gl.current, c = (f & 2) !== 0;
    if (c ? (f = f & 1 | 2, t.flags |= 128) : f &= 1, M(gl, f), ql(l, t, u, a), u = W ? Qu : 0, !c && l !== null && (l.flags & 128) !== 0) l: for (l = t.child; l !== null; ) {
      if (l.tag === 13) l.memoizedState !== null && Av(l, a, t);
      else if (l.tag === 19) Av(l, a, t);
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
        for (a = t.child, n = null; a !== null; ) l = a.alternate, l !== null && Fn(l) === null && (n = a), a = a.sibling;
        a = n, a === null ? (n = t.child, t.child = null) : (n = a.sibling, a.sibling = null), mc(t, !1, n, a, e, u);
        break;
      case "backwards":
      case "unstable_legacy-backwards":
        for (a = null, n = t.child, t.child = null; n !== null; ) {
          if (l = n.alternate, l !== null && Fn(l) === null) {
            t.child = n;
            break;
          }
          l = n.sibling, n.sibling = a, a = n, n = l;
        }
        mc(t, !0, a, null, e, u);
        break;
      case "together":
        mc(t, !1, null, null, void 0, u);
        break;
      default:
        t.memoizedState = null;
    }
    return t.child;
  }
  function Gt(l, t, a) {
    if (l !== null && (t.dependencies = l.dependencies), ca |= t.lanes, (a & t.childLanes) === 0) if (l !== null) {
      if (nu(l, t, a, !1), (a & t.childLanes) === 0) return null;
    } else return null;
    if (l !== null && t.child !== l.child) throw Error(S(153));
    if (t.child !== null) {
      for (l = t.child, a = Yt(l, l.pendingProps), t.child = a, a.return = t; l.sibling !== null; ) l = l.sibling, a = a.sibling = Yt(l, l.pendingProps), a.return = t;
      a.sibling = null;
    }
    return t.child;
  }
  function dc(l, t) {
    return (l.lanes & t) !== 0 ? !0 : (l = l.dependencies, !!(l !== null && Vn(l)));
  }
  function hm(l, t, a) {
    switch (t.tag) {
      case 3:
        Cl(t, t.stateNode.containerInfo), ta(t, bl, l.memoizedState.cache), Na();
        break;
      case 27:
      case 5:
        Ou(t);
        break;
      case 4:
        Cl(t, t.stateNode.containerInfo);
        break;
      case 10:
        ta(t, t.type, t.memoizedProps.value);
        break;
      case 31:
        if (t.memoizedState !== null) return t.flags |= 128, Gf(t), null;
        break;
      case 13:
        var u = t.memoizedState;
        if (u !== null)
          return u.dehydrated !== null ? (ua(t), t.flags |= 128, null) : (a & t.child.childLanes) !== 0 ? Ev(l, t, a) : (ua(t), l = Gt(l, t, a), l !== null ? l.sibling : null);
        ua(t);
        break;
      case 19:
        var n = (l.flags & 128) !== 0;
        if (u = (a & t.childLanes) !== 0, u || (nu(l, t, a, !1), u = (a & t.childLanes) !== 0), n) {
          if (u) return Mv(l, t, a);
          t.flags |= 128;
        }
        if (n = t.memoizedState, n !== null && (n.rendering = null, n.tail = null, n.lastEffect = null), M(gl, gl.current), u) break;
        return null;
      case 22:
        return t.lanes = 0, gv(l, t, a, t.pendingProps);
      case 24:
        ta(t, bl, l.memoizedState.cache);
    }
    return Gt(l, t, a);
  }
  function Ov(l, t, a) {
    if (l !== null) if (l.memoizedProps !== t.pendingProps) _l = !0;
    else {
      if (!dc(l, a) && (t.flags & 128) === 0) return _l = !1, hm(l, t, a);
      _l = (l.flags & 131072) !== 0;
    }
    else _l = !1, W && (t.flags & 1048576) !== 0 && f0(t, Qu, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        l: {
          var u = t.pendingProps;
          if (l = Ba(t.elementType), t.type = l, typeof l == "function") of(l) ? (u = ra(l, u), t.tag = 1, t = _v(null, t, l, u, a)) : (t.tag = 0, t = ec(null, t, l, u, a));
          else {
            if (l != null) {
              var n = l.$$typeof;
              if (n === ot) {
                t.tag = 11, t = hv(null, t, l, u, a);
                break l;
              } else if (n === w) {
                t.tag = 14, t = Sv(null, t, l, u, a);
                break l;
              }
            }
            throw t = bt(l) || l, Error(S(306, t, ""));
          }
        }
        return t;
      case 0:
        return ec(l, t, t.type, t.pendingProps, a);
      case 1:
        return u = t.type, n = ra(u, t.pendingProps), _v(l, t, u, n, a);
      case 3:
        l: {
          if (Cl(t, t.stateNode.containerInfo), l === null) throw Error(S(387));
          u = t.pendingProps;
          var e = t.memoizedState;
          n = e.element, Bf(l, t), wu(t, u, null, a);
          var f = t.memoizedState;
          if (u = f.cache, ta(t, bl, u), u !== e.cache && Df(t, [bl], a, !0), Wu(), u = f.element, e.isDehydrated) if (e = {
            element: u,
            isDehydrated: !1,
            cache: f.cache
          }, t.updateQueue.baseState = e, t.memoizedState = e, t.flags & 256) {
            t = Tv(l, t, u, a);
            break l;
          } else if (u !== n) {
            n = it(Error(S(424)), t), Zu(n), t = Tv(l, t, u, a);
            break l;
          } else {
            switch (l = t.stateNode.containerInfo, l.nodeType) {
              case 9:
                l = l.body;
                break;
              default:
                l = l.nodeName === "HTML" ? l.ownerDocument.body : l;
            }
            for (vl = St(l.firstChild), Nl = t, W = !0, Pt = null, mt = !0, a = z0(t, null, u, a), t.child = a; a; ) a.flags = a.flags & -3 | 4096, a = a.sibling;
          }
          else {
            if (Na(), u === n) {
              t = Gt(l, t, a);
              break l;
            }
            ql(l, t, u, a);
          }
          t = t.child;
        }
        return t;
      case 26:
        return ce(l, t), l === null ? (a = G1(t.type, null, t.pendingProps, null)) ? t.memoizedState = a : W || (a = t.type, l = t.pendingProps, u = Me(V.current).createElement(a), u[Ul] = t, u[Gl] = l, Yl(u, a, l), Ol(u), t.stateNode = u) : t.memoizedState = G1(t.type, l.memoizedProps, t.pendingProps, l.memoizedState), null;
      case 27:
        return Ou(t), l === null && W && (u = t.stateNode = R1(t.type, t.pendingProps, V.current), Nl = t, mt = !0, n = vl, da(t.type) ? (Kc = n, vl = St(u.firstChild)) : vl = n), ql(l, t, t.pendingProps.children, a), ce(l, t), l === null && (t.flags |= 4194304), t.child;
      case 5:
        return l === null && W && ((n = u = vl) && (u = Zm(u, t.type, t.pendingProps, mt), u !== null ? (t.stateNode = u, Nl = t, vl = St(u.firstChild), mt = !1, n = !0) : n = !1), n || la(t)), Ou(t), n = t.type, e = t.pendingProps, f = l !== null ? l.memoizedProps : null, u = e.children, Xc(n, e) ? u = null : f !== null && Xc(n, f) && (t.flags |= 32), t.memoizedState !== null && (n = Xf(l, t, tm, null, null, a), sn._currentValue = n), ce(l, t), ql(l, t, u, a), t.child;
      case 6:
        return l === null && W && ((l = a = vl) && (a = Vm(a, t.pendingProps, mt), a !== null ? (t.stateNode = a, Nl = t, vl = null, l = !0) : l = !1), l || la(t)), null;
      case 13:
        return Ev(l, t, a);
      case 4:
        return Cl(t, t.stateNode.containerInfo), u = t.pendingProps, l === null ? t.child = Ra(t, null, u, a) : ql(l, t, u, a), t.child;
      case 11:
        return hv(l, t, t.type, t.pendingProps, a);
      case 7:
        return ql(l, t, t.pendingProps, a), t.child;
      case 8:
        return ql(l, t, t.pendingProps.children, a), t.child;
      case 12:
        return ql(l, t, t.pendingProps.children, a), t.child;
      case 10:
        return u = t.pendingProps, ta(t, t.type, u.value), ql(l, t, u.children, a), t.child;
      case 9:
        return n = t.type._context, u = t.pendingProps.children, qa(t), n = Hl(n), u = u(n), t.flags |= 1, ql(l, t, u, a), t.child;
      case 14:
        return Sv(l, t, t.type, t.pendingProps, a);
      case 15:
        return sv(l, t, t.type, t.pendingProps, a);
      case 19:
        return Mv(l, t, a);
      case 31:
        return dm(l, t, a);
      case 22:
        return gv(l, t, a, t.pendingProps);
      case 24:
        return qa(t), u = Hl(bl), l === null ? (n = Hf(), n === null && (n = cl, e = Uf(), n.pooledCache = e, e.refCount++, e !== null && (n.pooledCacheLanes |= a), n = e), t.memoizedState = {
          parent: u,
          cache: n
        }, Yf(t), ta(t, bl, n)) : ((l.lanes & a) !== 0 && (Bf(l, t), wu(t, null, null, a), Wu()), n = l.memoizedState, e = t.memoizedState, n.parent !== u ? (n = {
          parent: u,
          cache: u
        }, t.memoizedState = n, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = n), ta(t, bl, u)) : (u = e.cache, ta(t, bl, u), u !== n.cache && Df(t, [bl], a, !0))), ql(l, t, t.pendingProps.children, a), t.child;
      case 29:
        throw t.pendingProps;
    }
    throw Error(S(156, t.tag));
  }
  function rt(l) {
    l.flags |= 4;
  }
  function hc(l, t, a, u, n) {
    if ((t = (l.mode & 32) !== 0) && (t = !1), t) {
      if (l.flags |= 16777216, (n & 335544128) === n) if (l.stateNode.complete) l.flags |= 8192;
      else if (Iv()) l.flags |= 8192;
      else throw Ca = Jn, qf;
    } else l.flags &= -16777217;
  }
  function Dv(l, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0) l.flags &= -16777217;
    else if (l.flags |= 16777216, !V1(t)) if (Iv()) l.flags |= 8192;
    else throw Ca = Jn, qf;
  }
  function ve(l, t) {
    t !== null && (l.flags |= 4), l.flags & 16384 && (t = l.tag !== 22 ? ci() : 536870912, l.lanes |= t, gu |= t);
  }
  function ln(l, t) {
    if (!W) switch (l.tailMode) {
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
  function yl(l) {
    var t = l.alternate !== null && l.alternate.child === l.child, a = 0, u = 0;
    if (t) for (var n = l.child; n !== null; ) a |= n.lanes | n.childLanes, u |= n.subtreeFlags & 65011712, u |= n.flags & 65011712, n.return = l, n = n.sibling;
    else for (n = l.child; n !== null; ) a |= n.lanes | n.childLanes, u |= n.subtreeFlags, u |= n.flags, n.return = l, n = n.sibling;
    return l.subtreeFlags |= u, l.childLanes = a, t;
  }
  function Sm(l, t, a) {
    var u = t.pendingProps;
    switch (Tf(t), t.tag) {
      case 16:
      case 15:
      case 0:
      case 11:
      case 7:
      case 8:
      case 12:
      case 9:
      case 14:
        return yl(t), null;
      case 1:
        return yl(t), null;
      case 3:
        return a = t.stateNode, u = null, l !== null && (u = l.memoizedState.cache), t.memoizedState.cache !== u && (t.flags |= 2048), Rt(bl), sl(), a.pendingContext && (a.context = a.pendingContext, a.pendingContext = null), (l === null || l.child === null) && (uu(t) ? rt(t) : l === null || l.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, Af())), yl(t), null;
      case 26:
        var n = t.type, e = t.memoizedState;
        return l === null ? (rt(t), e !== null ? (yl(t), Dv(t, e)) : (yl(t), hc(t, n, null, u, a))) : e ? e !== l.memoizedState ? (rt(t), yl(t), Dv(t, e)) : (yl(t), t.flags &= -16777217) : (l = l.memoizedProps, l !== u && rt(t), yl(t), hc(t, n, l, u, a)), null;
      case 27:
        if (zn(t), a = V.current, n = t.type, l !== null && t.stateNode != null) l.memoizedProps !== u && rt(t);
        else {
          if (!u) {
            if (t.stateNode === null) throw Error(S(166));
            return yl(t), null;
          }
          l = q.current, uu(t) ? i0(t, l) : (l = R1(n, u, a), t.stateNode = l, rt(t));
        }
        return yl(t), null;
      case 5:
        if (zn(t), n = t.type, l !== null && t.stateNode != null) l.memoizedProps !== u && rt(t);
        else {
          if (!u) {
            if (t.stateNode === null) throw Error(S(166));
            return yl(t), null;
          }
          if (e = q.current, uu(t)) i0(t, e);
          else {
            var f = Me(V.current);
            switch (e) {
              case 1:
                e = f.createElementNS("http://www.w3.org/2000/svg", n);
                break;
              case 2:
                e = f.createElementNS("http://www.w3.org/1998/Math/MathML", n);
                break;
              default:
                switch (n) {
                  case "svg":
                    e = f.createElementNS("http://www.w3.org/2000/svg", n);
                    break;
                  case "math":
                    e = f.createElementNS("http://www.w3.org/1998/Math/MathML", n);
                    break;
                  case "script":
                    e = f.createElement("div"), e.innerHTML = "<script><\/script>", e = e.removeChild(e.firstChild);
                    break;
                  case "select":
                    e = typeof u.is == "string" ? f.createElement("select", { is: u.is }) : f.createElement("select"), u.multiple ? e.multiple = !0 : u.size && (e.size = u.size);
                    break;
                  default:
                    e = typeof u.is == "string" ? f.createElement(n, { is: u.is }) : f.createElement(n);
                }
            }
            e[Ul] = t, e[Gl] = u;
            l: for (f = t.child; f !== null; ) {
              if (f.tag === 5 || f.tag === 6) e.appendChild(f.stateNode);
              else if (f.tag !== 4 && f.tag !== 27 && f.child !== null) {
                f.child.return = f, f = f.child;
                continue;
              }
              if (f === t) break l;
              for (; f.sibling === null; ) {
                if (f.return === null || f.return === t) break l;
                f = f.return;
              }
              f.sibling.return = f.return, f = f.sibling;
            }
            t.stateNode = e;
            l: switch (Yl(e, n, u), n) {
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
            u && rt(t);
          }
        }
        return yl(t), hc(t, t.type, l === null ? null : l.memoizedProps, t.pendingProps, a), null;
      case 6:
        if (l && t.stateNode != null) l.memoizedProps !== u && rt(t);
        else {
          if (typeof u != "string" && t.stateNode === null) throw Error(S(166));
          if (l = V.current, uu(t)) {
            if (l = t.stateNode, a = t.memoizedProps, u = null, n = Nl, n !== null) switch (n.tag) {
              case 27:
              case 5:
                u = n.memoizedProps;
            }
            l[Ul] = t, l = !!(l.nodeValue === a || u !== null && u.suppressHydrationWarning === !0 || A1(l.nodeValue, a)), l || la(t, !0);
          } else l = Me(l).createTextNode(u), l[Ul] = t, t.stateNode = l;
        }
        return yl(t), null;
      case 31:
        if (a = t.memoizedState, l === null || l.memoizedState !== null) {
          if (u = uu(t), a !== null) {
            if (l === null) {
              if (!u) throw Error(S(318));
              if (l = t.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(S(557));
              l[Ul] = t;
            } else Na(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            yl(t), l = !1;
          } else a = Af(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = a), l = !0;
          if (!l)
            return t.flags & 256 ? (at(t), t) : (at(t), null);
          if ((t.flags & 128) !== 0) throw Error(S(558));
        }
        return yl(t), null;
      case 13:
        if (u = t.memoizedState, l === null || l.memoizedState !== null && l.memoizedState.dehydrated !== null) {
          if (n = uu(t), u !== null && u.dehydrated !== null) {
            if (l === null) {
              if (!n) throw Error(S(318));
              if (n = t.memoizedState, n = n !== null ? n.dehydrated : null, !n) throw Error(S(317));
              n[Ul] = t;
            } else Na(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            yl(t), n = !1;
          } else n = Af(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = n), n = !0;
          if (!n)
            return t.flags & 256 ? (at(t), t) : (at(t), null);
        }
        return at(t), (t.flags & 128) !== 0 ? (t.lanes = a, t) : (a = u !== null, l = l !== null && l.memoizedState !== null, a && (u = t.child, n = null, u.alternate !== null && u.alternate.memoizedState !== null && u.alternate.memoizedState.cachePool !== null && (n = u.alternate.memoizedState.cachePool.pool), e = null, u.memoizedState !== null && u.memoizedState.cachePool !== null && (e = u.memoizedState.cachePool.pool), e !== n && (u.flags |= 2048)), a !== l && a && (t.child.flags |= 8192), ve(t, t.updateQueue), yl(t), null);
      case 4:
        return sl(), l === null && z1(t.stateNode.containerInfo), yl(t), null;
      case 10:
        return Rt(t.type), yl(t), null;
      case 19:
        if (T(gl), u = t.memoizedState, u === null) return yl(t), null;
        if (n = (t.flags & 128) !== 0, e = u.rendering, e === null) if (n) ln(u, !1);
        else {
          if (Sl !== 0 || l !== null && (l.flags & 128) !== 0) for (l = t.child; l !== null; ) {
            if (e = Fn(l), e !== null) {
              for (t.flags |= 128, ln(u, !1), l = e.updateQueue, t.updateQueue = l, ve(t, l), t.subtreeFlags = 0, l = a, a = t.child; a !== null; ) u0(a, l), a = a.sibling;
              return M(gl, gl.current & 1 | 2), W && Bt(t, u.treeForkCount), t.child;
            }
            l = l.sibling;
          }
          u.tail !== null && Fl() > Se && (t.flags |= 128, n = !0, ln(u, !1), t.lanes = 4194304);
        }
        else {
          if (!n) if (l = Fn(e), l !== null) {
            if (t.flags |= 128, n = !0, l = l.updateQueue, t.updateQueue = l, ve(t, l), ln(u, !0), u.tail === null && u.tailMode === "hidden" && !e.alternate && !W) return yl(t), null;
          } else 2 * Fl() - u.renderingStartTime > Se && a !== 536870912 && (t.flags |= 128, n = !0, ln(u, !1), t.lanes = 4194304);
          u.isBackwards ? (e.sibling = t.child, t.child = e) : (l = u.last, l !== null ? l.sibling = e : t.child = e, u.last = e);
        }
        return u.tail !== null ? (l = u.tail, u.rendering = l, u.tail = l.sibling, u.renderingStartTime = Fl(), l.sibling = null, a = gl.current, M(gl, n ? a & 1 | 2 : a & 1), W && Bt(t, u.treeForkCount), l) : (yl(t), null);
      case 22:
      case 23:
        return at(t), jf(), u = t.memoizedState !== null, l !== null ? l.memoizedState !== null !== u && (t.flags |= 8192) : u && (t.flags |= 8192), u ? (a & 536870912) !== 0 && (t.flags & 128) === 0 && (yl(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : yl(t), a = t.updateQueue, a !== null && ve(t, a.retryQueue), a = null, l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), u = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (u = t.memoizedState.cachePool.pool), u !== a && (t.flags |= 2048), l !== null && T(Ya), null;
      case 24:
        return a = null, l !== null && (a = l.memoizedState.cache), t.memoizedState.cache !== a && (t.flags |= 2048), Rt(bl), yl(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(S(156, t.tag));
  }
  function sm(l, t) {
    switch (Tf(t), t.tag) {
      case 1:
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 3:
        return Rt(bl), sl(), l = t.flags, (l & 65536) !== 0 && (l & 128) === 0 ? (t.flags = l & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return zn(t), null;
      case 31:
        if (t.memoizedState !== null) {
          if (at(t), t.alternate === null) throw Error(S(340));
          Na();
        }
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 13:
        if (at(t), l = t.memoizedState, l !== null && l.dehydrated !== null) {
          if (t.alternate === null) throw Error(S(340));
          Na();
        }
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 19:
        return T(gl), null;
      case 4:
        return sl(), null;
      case 10:
        return Rt(t.type), null;
      case 22:
      case 23:
        return at(t), jf(), l !== null && T(Ya), l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 24:
        return Rt(bl), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function Uv(l, t) {
    switch (Tf(t), t.tag) {
      case 3:
        Rt(bl), sl();
        break;
      case 26:
      case 27:
      case 5:
        zn(t);
        break;
      case 4:
        sl();
        break;
      case 31:
        t.memoizedState !== null && at(t);
        break;
      case 13:
        at(t);
        break;
      case 19:
        T(gl);
        break;
      case 10:
        Rt(t.type);
        break;
      case 22:
      case 23:
        at(t), jf(), l !== null && T(Ya);
        break;
      case 24:
        Rt(bl);
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
            var e = a.create, f = a.inst;
            u = e(), f.destroy = u;
          }
          a = a.next;
        } while (a !== n);
      }
    } catch (c) {
      ul(t, t.return, c);
    }
  }
  function ea(l, t, a) {
    try {
      var u = t.updateQueue, n = u !== null ? u.lastEffect : null;
      if (n !== null) {
        var e = n.next;
        u = e;
        do {
          if ((u.tag & l) === l) {
            var f = u.inst, c = f.destroy;
            if (c !== void 0) {
              f.destroy = void 0, n = t;
              var i = a, h = c;
              try {
                h();
              } catch (o) {
                ul(n, i, o);
              }
            }
          }
          u = u.next;
        } while (u !== e);
      }
    } catch (o) {
      ul(t, t.return, o);
    }
  }
  function Nv(l) {
    var t = l.updateQueue;
    if (t !== null) {
      var a = l.stateNode;
      try {
        T0(t, a);
      } catch (u) {
        ul(l, l.return, u);
      }
    }
  }
  function Hv(l, t, a) {
    a.props = ra(l.type, l.memoizedProps), a.state = l.memoizedState;
    try {
      a.componentWillUnmount();
    } catch (u) {
      ul(l, t, u);
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
      ul(l, t, n);
    }
  }
  function Dt(l, t) {
    var a = l.ref, u = l.refCleanup;
    if (a !== null) if (typeof u == "function") try {
      u();
    } catch (n) {
      ul(l, t, n);
    } finally {
      l.refCleanup = null, l = l.alternate, l != null && (l.refCleanup = null);
    }
    else if (typeof a == "function") try {
      a(null);
    } catch (n) {
      ul(l, t, n);
    }
    else a.current = null;
  }
  function qv(l) {
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
      ul(l, l.return, n);
    }
  }
  function Sc(l, t, a) {
    try {
      var u = l.stateNode;
      pm(u, l.type, a, t), u[Gl] = t;
    } catch (n) {
      ul(l, l.return, n);
    }
  }
  function Yv(l) {
    return l.tag === 5 || l.tag === 3 || l.tag === 26 || l.tag === 27 && da(l.type) || l.tag === 4;
  }
  function sc(l) {
    l: for (; ; ) {
      for (; l.sibling === null; ) {
        if (l.return === null || Yv(l.return)) return null;
        l = l.return;
      }
      for (l.sibling.return = l.return, l = l.sibling; l.tag !== 5 && l.tag !== 6 && l.tag !== 18; ) {
        if (l.tag === 27 && da(l.type) || l.flags & 2 || l.child === null || l.tag === 4) continue l;
        l.child.return = l, l = l.child;
      }
      if (!(l.flags & 2)) return l.stateNode;
    }
  }
  function gc(l, t, a) {
    var u = l.tag;
    if (u === 5 || u === 6) l = l.stateNode, t ? (a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a).insertBefore(l, t) : (t = a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a, t.appendChild(l), a = a._reactRootContainer, a != null || t.onclick !== null || (t.onclick = Ht));
    else if (u !== 4 && (u === 27 && da(l.type) && (a = l.stateNode, t = null), l = l.child, l !== null)) for (gc(l, t, a), l = l.sibling; l !== null; ) gc(l, t, a), l = l.sibling;
  }
  function ye(l, t, a) {
    var u = l.tag;
    if (u === 5 || u === 6) l = l.stateNode, t ? a.insertBefore(l, t) : a.appendChild(l);
    else if (u !== 4 && (u === 27 && da(l.type) && (a = l.stateNode), l = l.child, l !== null)) for (ye(l, t, a), l = l.sibling; l !== null; ) ye(l, t, a), l = l.sibling;
  }
  function Bv(l) {
    var t = l.stateNode, a = l.memoizedProps;
    try {
      for (var u = l.type, n = t.attributes; n.length; ) t.removeAttributeNode(n[0]);
      Yl(t, u, a), t[Ul] = l, t[Gl] = a;
    } catch (e) {
      ul(l, l.return, e);
    }
  }
  var Xt = !1, Tl = !1, oc = !1, Cv = typeof WeakSet == "function" ? WeakSet : Set, Dl = null;
  function gm(l, t) {
    if (l = l.containerInfo, Gc = Ye, l = wi(l), yf(l)) {
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
          var f = 0, c = -1, i = -1, h = 0, o = 0, _ = l, s = null;
          t: for (; ; ) {
            for (var g; _ !== a || n !== 0 && _.nodeType !== 3 || (c = f + n), _ !== e || u !== 0 && _.nodeType !== 3 || (i = f + u), _.nodeType === 3 && (f += _.nodeValue.length), (g = _.firstChild) !== null; )
              s = _, _ = g;
            for (; ; ) {
              if (_ === l) break t;
              if (s === a && ++h === n && (c = f), s === e && ++o === u && (i = f), (g = _.nextSibling) !== null) break;
              _ = s, s = _.parentNode;
            }
            _ = g;
          }
          a = c === -1 || i === -1 ? null : {
            start: c,
            end: i
          };
        } else a = null;
      }
      a = a || {
        start: 0,
        end: 0
      };
    } else a = null;
    for (rc = {
      focusedElem: l,
      selectionRange: a
    }, Ye = !1, Dl = t; Dl !== null; ) if (t = Dl, l = t.child, (t.subtreeFlags & 1028) !== 0 && l !== null) l.return = t, Dl = l;
    else for (; Dl !== null; ) {
      switch (t = Dl, e = t.alternate, l = t.flags, t.tag) {
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
              var N = ra(a.type, n);
              l = u.getSnapshotBeforeUpdate(N, e), u.__reactInternalSnapshotBeforeUpdate = l;
            } catch (R) {
              ul(a, a.return, R);
            }
          }
          break;
        case 3:
          if ((l & 1024) !== 0) {
            if (l = t.stateNode.containerInfo, a = l.nodeType, a === 9) Zc(l);
            else if (a === 1) switch (l.nodeName) {
              case "HEAD":
              case "HTML":
              case "BODY":
                Zc(l);
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
          if ((l & 1024) !== 0) throw Error(S(163));
      }
      if (l = t.sibling, l !== null) {
        l.return = t.return, Dl = l;
        break;
      }
      Dl = t.return;
    }
  }
  function Rv(l, t, a) {
    var u = a.flags;
    switch (a.tag) {
      case 0:
      case 11:
      case 15:
        Zt(l, a), u & 4 && tn(5, a);
        break;
      case 1:
        if (Zt(l, a), u & 4) if (l = a.stateNode, t === null) try {
          l.componentDidMount();
        } catch (f) {
          ul(a, a.return, f);
        }
        else {
          var n = ra(a.type, t.memoizedProps);
          t = t.memoizedState;
          try {
            l.componentDidUpdate(n, t, l.__reactInternalSnapshotBeforeUpdate);
          } catch (f) {
            ul(a, a.return, f);
          }
        }
        u & 64 && Nv(a), u & 512 && an(a, a.return);
        break;
      case 3:
        if (Zt(l, a), u & 64 && (l = a.updateQueue, l !== null)) {
          if (t = null, a.child !== null) switch (a.child.tag) {
            case 27:
            case 5:
              t = a.child.stateNode;
              break;
            case 1:
              t = a.child.stateNode;
          }
          try {
            T0(l, t);
          } catch (f) {
            ul(a, a.return, f);
          }
        }
        break;
      case 27:
        t === null && u & 4 && Bv(a);
      case 26:
      case 5:
        Zt(l, a), t === null && u & 4 && qv(a), u & 512 && an(a, a.return);
        break;
      case 12:
        Zt(l, a);
        break;
      case 31:
        Zt(l, a), u & 4 && Gv(l, a);
        break;
      case 13:
        Zt(l, a), u & 4 && rv(l, a), u & 64 && (l = a.memoizedState, l !== null && (l = l.dehydrated, l !== null && (a = Om.bind(null, a), Lm(l, a))));
        break;
      case 22:
        if (u = a.memoizedState !== null || Xt, !u) {
          t = t !== null && t.memoizedState !== null || Tl, n = Xt;
          var e = Tl;
          Xt = u, (Tl = t) && !e ? Vt(l, a, (a.subtreeFlags & 8772) !== 0) : Zt(l, a), Xt = n, Tl = e;
        }
        break;
      case 30:
        break;
      default:
        Zt(l, a);
    }
  }
  function pv(l) {
    var t = l.alternate;
    t !== null && (l.alternate = null, pv(t)), l.child = null, l.deletions = null, l.sibling = null, l.tag === 5 && (t = l.stateNode, t !== null && Je(t)), l.stateNode = null, l.return = null, l.dependencies = null, l.memoizedProps = null, l.memoizedState = null, l.pendingProps = null, l.stateNode = null, l.updateQueue = null;
  }
  var ml = null, Xl = !1;
  function Qt(l, t, a) {
    for (a = a.child; a !== null; ) jv(l, t, a), a = a.sibling;
  }
  function jv(l, t, a) {
    if (kl && typeof kl.onCommitFiberUnmount == "function") try {
      kl.onCommitFiberUnmount(Du, a);
    } catch {
    }
    switch (a.tag) {
      case 26:
        Tl || Dt(a, t), Qt(l, t, a), a.memoizedState ? a.memoizedState.count-- : a.stateNode && (a = a.stateNode, a.parentNode.removeChild(a));
        break;
      case 27:
        Tl || Dt(a, t);
        var u = ml, n = Xl;
        da(a.type) && (ml = a.stateNode, Xl = !1), Qt(l, t, a), dn(a.stateNode), ml = u, Xl = n;
        break;
      case 5:
        Tl || Dt(a, t);
      case 6:
        if (u = ml, n = Xl, ml = null, Qt(l, t, a), ml = u, Xl = n, ml !== null) if (Xl) try {
          (ml.nodeType === 9 ? ml.body : ml.nodeName === "HTML" ? ml.ownerDocument.body : ml).removeChild(a.stateNode);
        } catch (e) {
          ul(a, t, e);
        }
        else try {
          ml.removeChild(a.stateNode);
        } catch (e) {
          ul(a, t, e);
        }
        break;
      case 18:
        ml !== null && (Xl ? (l = ml, H1(l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l, a.stateNode), Mu(l)) : H1(ml, a.stateNode));
        break;
      case 4:
        u = ml, n = Xl, ml = a.stateNode.containerInfo, Xl = !0, Qt(l, t, a), ml = u, Xl = n;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        ea(2, a, t), Tl || ea(4, a, t), Qt(l, t, a);
        break;
      case 1:
        Tl || (Dt(a, t), u = a.stateNode, typeof u.componentWillUnmount == "function" && Hv(a, t, u)), Qt(l, t, a);
        break;
      case 21:
        Qt(l, t, a);
        break;
      case 22:
        Tl = (u = Tl) || a.memoizedState !== null, Qt(l, t, a), Tl = u;
        break;
      default:
        Qt(l, t, a);
    }
  }
  function Gv(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null))) {
      l = l.dehydrated;
      try {
        Mu(l);
      } catch (a) {
        ul(t, t.return, a);
      }
    }
  }
  function rv(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null && (l = l.dehydrated, l !== null)))) try {
      Mu(l);
    } catch (a) {
      ul(t, t.return, a);
    }
  }
  function om(l) {
    switch (l.tag) {
      case 31:
      case 13:
      case 19:
        var t = l.stateNode;
        return t === null && (t = l.stateNode = new Cv()), t;
      case 22:
        return l = l.stateNode, t = l._retryCache, t === null && (t = l._retryCache = new Cv()), t;
      default:
        throw Error(S(435, l.tag));
    }
  }
  function me(l, t) {
    var a = om(l);
    t.forEach(function(u) {
      if (!a.has(u)) {
        a.add(u);
        var n = Dm.bind(null, l, u);
        u.then(n, n);
      }
    });
  }
  function Ql(l, t) {
    var a = t.deletions;
    if (a !== null) for (var u = 0; u < a.length; u++) {
      var n = a[u], e = l, f = t, c = f;
      l: for (; c !== null; ) {
        switch (c.tag) {
          case 27:
            if (da(c.type)) {
              ml = c.stateNode, Xl = !1;
              break l;
            }
            break;
          case 5:
            ml = c.stateNode, Xl = !1;
            break l;
          case 3:
          case 4:
            ml = c.stateNode.containerInfo, Xl = !0;
            break l;
        }
        c = c.return;
      }
      if (ml === null) throw Error(S(160));
      jv(e, f, n), ml = null, Xl = !1, e = n.alternate, e !== null && (e.return = null), n.return = null;
    }
    if (t.subtreeFlags & 13886) for (t = t.child; t !== null; ) Xv(t, l), t = t.sibling;
  }
  var _t = null;
  function Xv(l, t) {
    var a = l.alternate, u = l.flags;
    switch (l.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        Ql(t, l), Zl(l), u & 4 && (ea(3, l, l.return), tn(3, l), ea(5, l, l.return));
        break;
      case 1:
        Ql(t, l), Zl(l), u & 512 && (Tl || a === null || Dt(a, a.return)), u & 64 && Xt && (l = l.updateQueue, l !== null && (u = l.callbacks, u !== null && (a = l.shared.hiddenCallbacks, l.shared.hiddenCallbacks = a === null ? u : a.concat(u))));
        break;
      case 26:
        var n = _t;
        if (Ql(t, l), Zl(l), u & 512 && (Tl || a === null || Dt(a, a.return)), u & 4) {
          var e = a !== null ? a.memoizedState : null;
          if (u = l.memoizedState, a === null) if (u === null) if (l.stateNode === null) {
            l: {
              u = l.type, a = l.memoizedProps, n = n.ownerDocument || n;
              t: switch (u) {
                case "title":
                  e = n.getElementsByTagName("title")[0], (!e || e[Hu] || e[Ul] || e.namespaceURI === "http://www.w3.org/2000/svg" || e.hasAttribute("itemprop")) && (e = n.createElement(u), n.head.insertBefore(e, n.querySelector("head > title"))), Yl(e, u, a), e[Ul] = l, Ol(e), u = e;
                  break l;
                case "link":
                  var f = Q1("link", "href", n).get(u + (a.href || ""));
                  if (f) {
                    for (var c = 0; c < f.length; c++) if (e = f[c], e.getAttribute("href") === (a.href == null || a.href === "" ? null : a.href) && e.getAttribute("rel") === (a.rel == null ? null : a.rel) && e.getAttribute("title") === (a.title == null ? null : a.title) && e.getAttribute("crossorigin") === (a.crossOrigin == null ? null : a.crossOrigin)) {
                      f.splice(c, 1);
                      break t;
                    }
                  }
                  e = n.createElement(u), Yl(e, u, a), n.head.appendChild(e);
                  break;
                case "meta":
                  if (f = Q1("meta", "content", n).get(u + (a.content || ""))) {
                    for (c = 0; c < f.length; c++) if (e = f[c], e.getAttribute("content") === (a.content == null ? null : "" + a.content) && e.getAttribute("name") === (a.name == null ? null : a.name) && e.getAttribute("property") === (a.property == null ? null : a.property) && e.getAttribute("http-equiv") === (a.httpEquiv == null ? null : a.httpEquiv) && e.getAttribute("charset") === (a.charSet == null ? null : a.charSet)) {
                      f.splice(c, 1);
                      break t;
                    }
                  }
                  e = n.createElement(u), Yl(e, u, a), n.head.appendChild(e);
                  break;
                default:
                  throw Error(S(468, u));
              }
              e[Ul] = l, Ol(e), u = e;
            }
            l.stateNode = u;
          } else Z1(n, l.type, l.stateNode);
          else l.stateNode = X1(n, u, l.memoizedProps);
          else e !== u ? (e === null ? a.stateNode !== null && (a = a.stateNode, a.parentNode.removeChild(a)) : e.count--, u === null ? Z1(n, l.type, l.stateNode) : X1(n, u, l.memoizedProps)) : u === null && l.stateNode !== null && Sc(l, l.memoizedProps, a.memoizedProps);
        }
        break;
      case 27:
        Ql(t, l), Zl(l), u & 512 && (Tl || a === null || Dt(a, a.return)), a !== null && u & 4 && Sc(l, l.memoizedProps, a.memoizedProps);
        break;
      case 5:
        if (Ql(t, l), Zl(l), u & 512 && (Tl || a === null || Dt(a, a.return)), l.flags & 32) {
          n = l.stateNode;
          try {
            Wa(n, "");
          } catch (N) {
            ul(l, l.return, N);
          }
        }
        u & 4 && l.stateNode != null && (n = l.memoizedProps, Sc(l, n, a !== null ? a.memoizedProps : n)), u & 1024 && (oc = !0);
        break;
      case 6:
        if (Ql(t, l), Zl(l), u & 4) {
          if (l.stateNode === null) throw Error(S(162));
          u = l.memoizedProps, a = l.stateNode;
          try {
            a.nodeValue = u;
          } catch (N) {
            ul(l, l.return, N);
          }
        }
        break;
      case 3:
        if (Ue = null, n = _t, _t = Oe(t.containerInfo), Ql(t, l), _t = n, Zl(l), u & 4 && a !== null && a.memoizedState.isDehydrated) try {
          Mu(t.containerInfo);
        } catch (N) {
          ul(l, l.return, N);
        }
        oc && (oc = !1, Qv(l));
        break;
      case 4:
        u = _t, _t = Oe(l.stateNode.containerInfo), Ql(t, l), Zl(l), _t = u;
        break;
      case 12:
        Ql(t, l), Zl(l);
        break;
      case 31:
        Ql(t, l), Zl(l), u & 4 && (u = l.updateQueue, u !== null && (l.updateQueue = null, me(l, u)));
        break;
      case 13:
        Ql(t, l), Zl(l), l.child.flags & 8192 && l.memoizedState !== null != (a !== null && a.memoizedState !== null) && (he = Fl()), u & 4 && (u = l.updateQueue, u !== null && (l.updateQueue = null, me(l, u)));
        break;
      case 22:
        n = l.memoizedState !== null;
        var i = a !== null && a.memoizedState !== null, h = Xt, o = Tl;
        if (Xt = h || n, Tl = o || i, Ql(t, l), Tl = o, Xt = h, Zl(l), u & 8192) l: for (t = l.stateNode, t._visibility = n ? t._visibility & -2 : t._visibility | 1, n && (a === null || i || Xt || Tl || Xa(l)), a = null, t = l; ; ) {
          if (t.tag === 5 || t.tag === 26) {
            if (a === null) {
              i = a = t;
              try {
                if (e = i.stateNode, n) f = e.style, typeof f.setProperty == "function" ? f.setProperty("display", "none", "important") : f.display = "none";
                else {
                  c = i.stateNode;
                  var _ = i.memoizedProps.style, s = _ != null && _.hasOwnProperty("display") ? _.display : null;
                  c.style.display = s == null || typeof s == "boolean" ? "" : ("" + s).trim();
                }
              } catch (N) {
                ul(i, i.return, N);
              }
            }
          } else if (t.tag === 6) {
            if (a === null) {
              i = t;
              try {
                i.stateNode.nodeValue = n ? "" : i.memoizedProps;
              } catch (N) {
                ul(i, i.return, N);
              }
            }
          } else if (t.tag === 18) {
            if (a === null) {
              i = t;
              try {
                var g = i.stateNode;
                n ? q1(g, !0) : q1(i.stateNode, !1);
              } catch (N) {
                ul(i, i.return, N);
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
        u & 4 && (u = l.updateQueue, u !== null && (a = u.retryQueue, a !== null && (u.retryQueue = null, me(l, a))));
        break;
      case 19:
        Ql(t, l), Zl(l), u & 4 && (u = l.updateQueue, u !== null && (l.updateQueue = null, me(l, u)));
        break;
      case 30:
        break;
      case 21:
        break;
      default:
        Ql(t, l), Zl(l);
    }
  }
  function Zl(l) {
    var t = l.flags;
    if (t & 2) {
      try {
        for (var a, u = l.return; u !== null; ) {
          if (Yv(u)) {
            a = u;
            break;
          }
          u = u.return;
        }
        if (a == null) throw Error(S(160));
        switch (a.tag) {
          case 27:
            var n = a.stateNode;
            ye(l, sc(l), n);
            break;
          case 5:
            var e = a.stateNode;
            a.flags & 32 && (Wa(e, ""), a.flags &= -33), ye(l, sc(l), e);
            break;
          case 3:
          case 4:
            var f = a.stateNode.containerInfo;
            gc(l, sc(l), f);
            break;
          default:
            throw Error(S(161));
        }
      } catch (c) {
        ul(l, l.return, c);
      }
      l.flags &= -3;
    }
    t & 4096 && (l.flags &= -4097);
  }
  function Qv(l) {
    if (l.subtreeFlags & 1024) for (l = l.child; l !== null; ) {
      var t = l;
      Qv(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), l = l.sibling;
    }
  }
  function Zt(l, t) {
    if (t.subtreeFlags & 8772) for (t = t.child; t !== null; ) Rv(l, t.alternate, t), t = t.sibling;
  }
  function Xa(l) {
    for (l = l.child; l !== null; ) {
      var t = l;
      switch (t.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          ea(4, t, t.return), Xa(t);
          break;
        case 1:
          Dt(t, t.return);
          var a = t.stateNode;
          typeof a.componentWillUnmount == "function" && Hv(t, t.return, a), Xa(t);
          break;
        case 27:
          dn(t.stateNode);
        case 26:
        case 5:
          Dt(t, t.return), Xa(t);
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
  function Vt(l, t, a) {
    for (a = a && (t.subtreeFlags & 8772) !== 0, t = t.child; t !== null; ) {
      var u = t.alternate, n = l, e = t, f = e.flags;
      switch (e.tag) {
        case 0:
        case 11:
        case 15:
          Vt(n, e, a), tn(4, e);
          break;
        case 1:
          if (Vt(n, e, a), u = e, n = u.stateNode, typeof n.componentDidMount == "function") try {
            n.componentDidMount();
          } catch (h) {
            ul(u, u.return, h);
          }
          if (u = e, n = u.updateQueue, n !== null) {
            var c = u.stateNode;
            try {
              var i = n.shared.hiddenCallbacks;
              if (i !== null) for (n.shared.hiddenCallbacks = null, n = 0; n < i.length; n++) _0(i[n], c);
            } catch (h) {
              ul(u, u.return, h);
            }
          }
          a && f & 64 && Nv(e), an(e, e.return);
          break;
        case 27:
          Bv(e);
        case 26:
        case 5:
          Vt(n, e, a), a && u === null && f & 4 && qv(e), an(e, e.return);
          break;
        case 12:
          Vt(n, e, a);
          break;
        case 31:
          Vt(n, e, a), a && f & 4 && Gv(n, e);
          break;
        case 13:
          Vt(n, e, a), a && f & 4 && rv(n, e);
          break;
        case 22:
          e.memoizedState === null && Vt(n, e, a), an(e, e.return);
          break;
        case 30:
          break;
        default:
          Vt(n, e, a);
      }
      t = t.sibling;
    }
  }
  function bc(l, t) {
    var a = null;
    l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), l = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (l = t.memoizedState.cachePool.pool), l !== a && (l != null && l.refCount++, a != null && Vu(a));
  }
  function zc(l, t) {
    l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Vu(l));
  }
  function Tt(l, t, a, u) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) Zv(l, t, a, u), t = t.sibling;
  }
  function Zv(l, t, a, u) {
    var n = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        Tt(l, t, a, u), n & 2048 && tn(9, t);
        break;
      case 1:
        Tt(l, t, a, u);
        break;
      case 3:
        Tt(l, t, a, u), n & 2048 && (l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Vu(l)));
        break;
      case 12:
        if (n & 2048) {
          Tt(l, t, a, u), l = t.stateNode;
          try {
            var e = t.memoizedProps, f = e.id, c = e.onPostCommit;
            typeof c == "function" && c(f, t.alternate === null ? "mount" : "update", l.passiveEffectDuration, -0);
          } catch (i) {
            ul(t, t.return, i);
          }
        } else Tt(l, t, a, u);
        break;
      case 31:
        Tt(l, t, a, u);
        break;
      case 13:
        Tt(l, t, a, u);
        break;
      case 23:
        break;
      case 22:
        e = t.stateNode, f = t.alternate, t.memoizedState !== null ? e._visibility & 2 ? Tt(l, t, a, u) : un(l, t) : e._visibility & 2 ? Tt(l, t, a, u) : (e._visibility |= 2, hu(l, t, a, u, (t.subtreeFlags & 10256) !== 0 || !1)), n & 2048 && bc(f, t);
        break;
      case 24:
        Tt(l, t, a, u), n & 2048 && zc(t.alternate, t);
        break;
      default:
        Tt(l, t, a, u);
    }
  }
  function hu(l, t, a, u, n) {
    for (n = n && ((t.subtreeFlags & 10256) !== 0 || !1), t = t.child; t !== null; ) {
      var e = l, f = t, c = a, i = u, h = f.flags;
      switch (f.tag) {
        case 0:
        case 11:
        case 15:
          hu(e, f, c, i, n), tn(8, f);
          break;
        case 23:
          break;
        case 22:
          var o = f.stateNode;
          f.memoizedState !== null ? o._visibility & 2 ? hu(e, f, c, i, n) : un(e, f) : (o._visibility |= 2, hu(e, f, c, i, n)), n && h & 2048 && bc(f.alternate, f);
          break;
        case 24:
          hu(e, f, c, i, n), n && h & 2048 && zc(f.alternate, f);
          break;
        default:
          hu(e, f, c, i, n);
      }
      t = t.sibling;
    }
  }
  function un(l, t) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) {
      var a = l, u = t, n = u.flags;
      switch (u.tag) {
        case 22:
          un(a, u), n & 2048 && bc(u.alternate, u);
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
  function Su(l, t, a) {
    if (l.subtreeFlags & nn) for (l = l.child; l !== null; ) Vv(l, t, a), l = l.sibling;
  }
  function Vv(l, t, a) {
    switch (l.tag) {
      case 26:
        Su(l, t, a), l.flags & nn && l.memoizedState !== null && td(a, _t, l.memoizedState, l.memoizedProps);
        break;
      case 5:
        Su(l, t, a);
        break;
      case 3:
      case 4:
        var u = _t;
        _t = Oe(l.stateNode.containerInfo), Su(l, t, a), _t = u;
        break;
      case 22:
        l.memoizedState === null && (u = l.alternate, u !== null && u.memoizedState !== null ? (u = nn, nn = 16777216, Su(l, t, a), nn = u) : Su(l, t, a));
        break;
      default:
        Su(l, t, a);
    }
  }
  function Lv(l) {
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
        Dl = u, xv(u, l);
      }
      Lv(l);
    }
    if (l.subtreeFlags & 10256) for (l = l.child; l !== null; ) Kv(l), l = l.sibling;
  }
  function Kv(l) {
    switch (l.tag) {
      case 0:
      case 11:
      case 15:
        en(l), l.flags & 2048 && ea(9, l, l.return);
        break;
      case 3:
        en(l);
        break;
      case 12:
        en(l);
        break;
      case 22:
        var t = l.stateNode;
        l.memoizedState !== null && t._visibility & 2 && (l.return === null || l.return.tag !== 13) ? (t._visibility &= -3, de(l)) : en(l);
        break;
      default:
        en(l);
    }
  }
  function de(l) {
    var t = l.deletions;
    if ((l.flags & 16) !== 0) {
      if (t !== null) for (var a = 0; a < t.length; a++) {
        var u = t[a];
        Dl = u, xv(u, l);
      }
      Lv(l);
    }
    for (l = l.child; l !== null; ) {
      switch (t = l, t.tag) {
        case 0:
        case 11:
        case 15:
          ea(8, t, t.return), de(t);
          break;
        case 22:
          a = t.stateNode, a._visibility & 2 && (a._visibility &= -3, de(t));
          break;
        default:
          de(t);
      }
      l = l.sibling;
    }
  }
  function xv(l, t) {
    for (; Dl !== null; ) {
      var a = Dl;
      switch (a.tag) {
        case 0:
        case 11:
        case 15:
          ea(8, a, t);
          break;
        case 23:
        case 22:
          if (a.memoizedState !== null && a.memoizedState.cachePool !== null) {
            var u = a.memoizedState.cachePool.pool;
            u != null && u.refCount++;
          }
          break;
        case 24:
          Vu(a.memoizedState.cache);
      }
      if (u = a.child, u !== null) u.return = a, Dl = u;
      else l: for (a = l; Dl !== null; ) {
        u = Dl;
        var n = u.sibling, e = u.return;
        if (pv(u), u === a) {
          Dl = null;
          break l;
        }
        if (n !== null) {
          n.return = e, Dl = n;
          break l;
        }
        Dl = e;
      }
    }
  }
  var bm = {
    getCacheForType: function(l) {
      var t = Hl(bl), a = t.data.get(l);
      return a === void 0 && (a = l(), t.data.set(l, a)), a;
    },
    cacheSignal: function() {
      return Hl(bl).controller.signal;
    }
  }, zm = typeof WeakMap == "function" ? WeakMap : Map, P = 0, cl = null, L = null, x = 0, al = 0, ut = null, fa = !1, su = !1, _c = !1, Lt = 0, Sl = 0, ca = 0, Qa = 0, Tc = 0, nt = 0, gu = 0, fn = null, Vl = null, Ec = !1, he = 0, Jv = 0, Se = 1 / 0, se = null, ia = null, El = 0, va = null, ou = null, Kt = 0, Ac = 0, Mc = null, Wv = null, cn = 0, Oc = null;
  function ht() {
    return (P & 2) !== 0 && x !== 0 ? x & -x : A.T !== null ? Yc() : di();
  }
  function wv() {
    if (nt === 0) if ((x & 536870912) === 0 || W) {
      var l = En;
      En <<= 1, (En & 3932160) === 0 && (En = 262144), nt = l;
    } else nt = 536870912;
    return l = tt.current, l !== null && (l.flags |= 32), nt;
  }
  function Ll(l, t, a) {
    (l === cl && (al === 2 || al === 9) || l.cancelPendingCommit !== null) && (bu(l, 0), ya(l, x, nt, !1)), On(l, a), ((P & 2) === 0 || l !== cl) && (l === cl && ((P & 2) === 0 && (Qa |= a), Sl === 4 && ya(l, x, nt, !1)), xt(l));
  }
  function $v(l, t, a) {
    if ((P & 6) !== 0) throw Error(S(327));
    var u = !a && (t & 127) === 0 && (t & l.expiredLanes) === 0 || Uu(l, t), n = u ? Em(l, t) : Uc(l, t, !0), e = u;
    do {
      if (n === 0) {
        su && !u && ya(l, t, 0, !1);
        break;
      } else {
        if (a = l.current.alternate, e && !_m(a)) {
          n = Uc(l, t, !1), e = !1;
          continue;
        }
        if (n === 2) {
          if (e = t, l.errorRecoveryDisabledLanes & e) var f = 0;
          else f = l.pendingLanes & -536870913, f = f !== 0 ? f : f & 536870912 ? 536870912 : 0;
          if (f !== 0) {
            t = f;
            l: {
              var c = l;
              n = fn;
              var i = c.current.memoizedState.isDehydrated;
              if (i && (bu(c, f).flags |= 256), f = Uc(c, f, !1), f !== 2) {
                if (_c && !i) {
                  c.errorRecoveryDisabledLanes |= e, Qa |= e, n = 4;
                  break l;
                }
                e = Vl, Vl = n, e !== null && (Vl === null ? Vl = e : Vl.push.apply(Vl, e));
              }
              n = f;
            }
            if (e = !1, n !== 2) continue;
          }
        }
        if (n === 1) {
          bu(l, 0), ya(l, t, 0, !0);
          break;
        }
        l: {
          switch (u = l, e = n, e) {
            case 0:
            case 1:
              throw Error(S(345));
            case 4:
              if ((t & 4194048) !== t) break;
            case 6:
              ya(u, t, nt, !fa);
              break l;
            case 2:
              Vl = null;
              break;
            case 3:
            case 5:
              break;
            default:
              throw Error(S(329));
          }
          if ((t & 62914560) === t && (n = he + 300 - Fl(), 10 < n)) {
            if (ya(u, t, nt, !fa), Mn(u, 0, !0) !== 0) break l;
            Kt = t, u.timeoutHandle = U1(Fv.bind(null, u, a, Vl, se, Ec, t, nt, Qa, gu, fa, e, "Throttled", -0, 0), n);
            break l;
          }
          Fv(u, a, Vl, se, Ec, t, nt, Qa, gu, fa, e, null, -0, 0);
        }
      }
      break;
    } while (!0);
    xt(l);
  }
  function Fv(l, t, a, u, n, e, f, c, i, h, o, _, s, g) {
    if (l.timeoutHandle = -1, _ = t.subtreeFlags, _ & 8192 || (_ & 16785408) === 16785408) {
      _ = {
        stylesheets: null,
        count: 0,
        imgCount: 0,
        imgBytes: 0,
        suspenseyImages: [],
        waitingForImages: !0,
        waitingForViewTransition: !1,
        unsuspend: Ht
      }, Vv(t, e, _);
      var N = (e & 62914560) === e ? he - Fl() : (e & 4194048) === e ? Jv - Fl() : 0;
      if (N = ad(_, N), N !== null) {
        Kt = e, l.cancelPendingCommit = N(n1.bind(null, l, t, e, a, u, n, f, c, i, o, _, null, s, g)), ya(l, e, f, !h);
        return;
      }
    }
    n1(l, t, e, a, u, n, f, c, i);
  }
  function _m(l) {
    for (var t = l; ; ) {
      var a = t.tag;
      if ((a === 0 || a === 11 || a === 15) && t.flags & 16384 && (a = t.updateQueue, a !== null && (a = a.stores, a !== null))) for (var u = 0; u < a.length; u++) {
        var n = a[u], e = n.getSnapshot;
        n = n.value;
        try {
          if (!Pl(e(), n)) return !1;
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
    t &= ~Tc, t &= ~Qa, l.suspendedLanes |= t, l.pingedLanes &= ~t, u && (l.warmLanes |= t), u = l.expirationTimes;
    for (var n = t; 0 < n; ) {
      var e = 31 - Il(n), f = 1 << e;
      u[e] = -1, n &= ~f;
    }
    a !== 0 && ii(l, a, t);
  }
  function ge() {
    return (P & 6) === 0 ? (vn(0, !1), !1) : !0;
  }
  function Dc() {
    if (L !== null) {
      if (al === 0) var l = L.return;
      else l = L, Ct = Ha = null, Vf(l), iu = null, Ku = 0, l = L;
      for (; l !== null; ) Uv(l.alternate, l), l = l.return;
      L = null;
    }
  }
  function bu(l, t) {
    var a = l.timeoutHandle;
    a !== -1 && (l.timeoutHandle = -1, rm(a)), a = l.cancelPendingCommit, a !== null && (l.cancelPendingCommit = null, a()), Kt = 0, Dc(), cl = l, L = a = Yt(l.current, null), x = t, al = 0, ut = null, fa = !1, su = Uu(l, t), _c = !1, gu = nt = Tc = Qa = ca = Sl = 0, Vl = fn = null, Ec = !1, (t & 8) !== 0 && (t |= t & 32);
    var u = l.entangledLanes;
    if (u !== 0) for (l = l.entanglements, u &= t; 0 < u; ) {
      var n = 31 - Il(u), e = 1 << n;
      t |= l[n], u &= ~e;
    }
    return Lt = t, Gn(), a;
  }
  function kv(l, t) {
    G = null, A.H = Iu, t === cu || t === xn ? (t = g0(), al = 3) : t === qf ? (t = g0(), al = 4) : al = t === nc ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, ut = t, L === null && (Sl = 1, ee(l, it(t, l.current)));
  }
  function Iv() {
    var l = tt.current;
    return l === null ? !0 : (x & 4194048) === x ? dt === null : (x & 62914560) === x || (x & 536870912) !== 0 ? l === dt : !1;
  }
  function Pv() {
    var l = A.H;
    return A.H = Iu, l === null ? Iu : l;
  }
  function l1() {
    var l = A.A;
    return A.A = bm, l;
  }
  function oe() {
    Sl = 4, fa || (x & 4194048) !== x && tt.current !== null || (su = !0), (ca & 134217727) === 0 && (Qa & 134217727) === 0 || cl === null || ya(cl, x, nt, !1);
  }
  function Uc(l, t, a) {
    var u = P;
    P |= 2;
    var n = Pv(), e = l1();
    (cl !== l || x !== t) && (se = null, bu(l, t)), t = !1;
    var f = Sl;
    l: do
      try {
        if (al !== 0 && L !== null) {
          var c = L, i = ut;
          switch (al) {
            case 8:
              Dc(), f = 6;
              break l;
            case 3:
            case 2:
            case 9:
            case 6:
              tt.current === null && (t = !0);
              var h = al;
              if (al = 0, ut = null, zu(l, c, i, h), a && su) {
                f = 0;
                break l;
              }
              break;
            default:
              h = al, al = 0, ut = null, zu(l, c, i, h);
          }
        }
        Tm(), f = Sl;
        break;
      } catch (o) {
        kv(l, o);
      }
    while (!0);
    return t && l.shellSuspendCounter++, Ct = Ha = null, P = u, A.H = n, A.A = e, L === null && (cl = null, x = 0, Gn()), f;
  }
  function Tm() {
    for (; L !== null; ) t1(L);
  }
  function Em(l, t) {
    var a = P;
    P |= 2;
    var u = Pv(), n = l1();
    cl !== l || x !== t ? (se = null, Se = Fl() + 500, bu(l, t)) : su = Uu(l, t);
    l: do
      try {
        if (al !== 0 && L !== null) {
          t = L;
          var e = ut;
          t: switch (al) {
            case 1:
              al = 0, ut = null, zu(l, t, e, 1);
              break;
            case 2:
            case 9:
              if (S0(e)) {
                al = 0, ut = null, a1(t);
                break;
              }
              t = function() {
                al !== 2 && al !== 9 || cl !== l || (al = 7), xt(l);
              }, e.then(t, t);
              break l;
            case 3:
              al = 7;
              break l;
            case 4:
              al = 5;
              break l;
            case 7:
              S0(e) ? (al = 0, ut = null, a1(t)) : (al = 0, ut = null, zu(l, t, e, 7));
              break;
            case 5:
              var f = null;
              switch (L.tag) {
                case 26:
                  f = L.memoizedState;
                case 5:
                case 27:
                  var c = L;
                  if (f ? V1(f) : c.stateNode.complete) {
                    al = 0, ut = null;
                    var i = c.sibling;
                    if (i !== null) L = i;
                    else {
                      var h = c.return;
                      h !== null ? (L = h, be(h)) : L = null;
                    }
                    break t;
                  }
              }
              al = 0, ut = null, zu(l, t, e, 5);
              break;
            case 6:
              al = 0, ut = null, zu(l, t, e, 6);
              break;
            case 8:
              Dc(), Sl = 6;
              break l;
            default:
              throw Error(S(462));
          }
        }
        Am();
        break;
      } catch (o) {
        kv(l, o);
      }
    while (!0);
    return Ct = Ha = null, A.H = u, A.A = n, P = a, L !== null ? 0 : (cl = null, x = 0, Gn(), Sl);
  }
  function Am() {
    for (; L !== null && !ly(); ) t1(L);
  }
  function t1(l) {
    var t = Ov(l.alternate, l, Lt);
    l.memoizedProps = l.pendingProps, t === null ? be(l) : L = t;
  }
  function a1(l) {
    var t = l, a = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = zv(a, t, t.pendingProps, t.type, void 0, x);
        break;
      case 11:
        t = zv(a, t, t.pendingProps, t.type.render, t.ref, x);
        break;
      case 5:
        Vf(t);
      default:
        Uv(a, t), t = L = u0(t, Lt), t = Ov(a, t, Lt);
    }
    l.memoizedProps = l.pendingProps, t === null ? be(l) : L = t;
  }
  function zu(l, t, a, u) {
    Ct = Ha = null, Vf(t), iu = null, Ku = 0;
    var n = t.return;
    try {
      if (mm(l, n, t, a, x)) {
        Sl = 1, ee(l, it(a, l.current)), L = null;
        return;
      }
    } catch (e) {
      if (n !== null) throw L = n, e;
      Sl = 1, ee(l, it(a, l.current)), L = null;
      return;
    }
    t.flags & 32768 ? (W || u === 1 ? l = !0 : su || (x & 536870912) !== 0 ? l = !1 : (fa = l = !0, (u === 2 || u === 9 || u === 3 || u === 6) && (u = tt.current, u !== null && u.tag === 13 && (u.flags |= 16384))), u1(t, l)) : be(t);
  }
  function be(l) {
    var t = l;
    do {
      if ((t.flags & 32768) !== 0) {
        u1(t, fa);
        return;
      }
      l = t.return;
      var a = Sm(t.alternate, t, Lt);
      if (a !== null) {
        L = a;
        return;
      }
      if (t = t.sibling, t !== null) {
        L = t;
        return;
      }
      L = t = l;
    } while (t !== null);
    Sl === 0 && (Sl = 5);
  }
  function u1(l, t) {
    do {
      var a = sm(l.alternate, l);
      if (a !== null) {
        a.flags &= 32767, L = a;
        return;
      }
      if (a = l.return, a !== null && (a.flags |= 32768, a.subtreeFlags = 0, a.deletions = null), !t && (l = l.sibling, l !== null)) {
        L = l;
        return;
      }
      L = l = a;
    } while (l !== null);
    Sl = 6, L = null;
  }
  function n1(l, t, a, u, n, e, f, c, i) {
    l.cancelPendingCommit = null;
    do
      ze();
    while (El !== 0);
    if ((P & 6) !== 0) throw Error(S(327));
    if (t !== null) {
      if (t === l.current) throw Error(S(177));
      if (e = t.lanes | t.childLanes, e |= sf, yy(l, a, e, f, c, i), l === cl && (L = cl = null, x = 0), ou = t, va = l, Kt = a, Ac = e, Mc = n, Wv = u, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (l.callbackNode = null, l.callbackPriority = 0, Um(_n, function() {
        return v1(), null;
      })) : (l.callbackNode = null, l.callbackPriority = 0), u = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || u) {
        u = A.T, A.T = null, n = D.p, D.p = 2, f = P, P |= 4;
        try {
          gm(l, t, a);
        } finally {
          P = f, D.p = n, A.T = u;
        }
      }
      El = 1, e1(), f1(), c1();
    }
  }
  function e1() {
    if (El === 1) {
      El = 0;
      var l = va, t = ou, a = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || a) {
        a = A.T, A.T = null;
        var u = D.p;
        D.p = 2;
        var n = P;
        P |= 4;
        try {
          Xv(t, l);
          var e = rc, f = wi(l.containerInfo), c = e.focusedElem, i = e.selectionRange;
          if (f !== c && c && c.ownerDocument && Wi(c.ownerDocument.documentElement, c)) {
            if (i !== null && yf(c)) {
              var h = i.start, o = i.end;
              if (o === void 0 && (o = h), "selectionStart" in c) c.selectionStart = h, c.selectionEnd = Math.min(o, c.value.length);
              else {
                var _ = c.ownerDocument || document, s = _ && _.defaultView || window;
                if (s.getSelection) {
                  var g = s.getSelection(), N = c.textContent.length, R = Math.min(i.start, N), fl = i.end === void 0 ? R : Math.min(i.end, N);
                  !g.extend && R > fl && (f = fl, fl = R, R = f);
                  var m = Ji(c, R), v = Ji(c, fl);
                  if (m && v && (g.rangeCount !== 1 || g.anchorNode !== m.node || g.anchorOffset !== m.offset || g.focusNode !== v.node || g.focusOffset !== v.offset)) {
                    var d = _.createRange();
                    d.setStart(m.node, m.offset), g.removeAllRanges(), R > fl ? (g.addRange(d), g.extend(v.node, v.offset)) : (d.setEnd(v.node, v.offset), g.addRange(d));
                  }
                }
              }
            }
            for (_ = [], g = c; g = g.parentNode; ) g.nodeType === 1 && _.push({
              element: g,
              left: g.scrollLeft,
              top: g.scrollTop
            });
            for (typeof c.focus == "function" && c.focus(), c = 0; c < _.length; c++) {
              var z = _[c];
              z.element.scrollLeft = z.left, z.element.scrollTop = z.top;
            }
          }
          Ye = !!Gc, rc = Gc = null;
        } finally {
          P = n, D.p = u, A.T = a;
        }
      }
      l.current = t, El = 2;
    }
  }
  function f1() {
    if (El === 2) {
      El = 0;
      var l = va, t = ou, a = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || a) {
        a = A.T, A.T = null;
        var u = D.p;
        D.p = 2;
        var n = P;
        P |= 4;
        try {
          Rv(l, t.alternate, t);
        } finally {
          P = n, D.p = u, A.T = a;
        }
      }
      El = 3;
    }
  }
  function c1() {
    if (El === 4 || El === 3) {
      El = 0, ty();
      var l = va, t = ou, a = Kt, u = Wv;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? El = 5 : (El = 0, ou = va = null, i1(l, l.pendingLanes));
      var n = l.pendingLanes;
      if (n === 0 && (ia = null), Ke(a), t = t.stateNode, kl && typeof kl.onCommitFiberRoot == "function") try {
        kl.onCommitFiberRoot(Du, t, void 0, (t.current.flags & 128) === 128);
      } catch {
      }
      if (u !== null) {
        t = A.T, n = D.p, D.p = 2, A.T = null;
        try {
          for (var e = l.onRecoverableError, f = 0; f < u.length; f++) {
            var c = u[f];
            e(c.value, { componentStack: c.stack });
          }
        } finally {
          A.T = t, D.p = n;
        }
      }
      (Kt & 3) !== 0 && ze(), xt(l), n = l.pendingLanes, (a & 261930) !== 0 && (n & 42) !== 0 ? l === Oc ? cn++ : (cn = 0, Oc = l) : cn = 0, vn(0, !1);
    }
  }
  function i1(l, t) {
    (l.pooledCacheLanes &= t) === 0 && (t = l.pooledCache, t != null && (l.pooledCache = null, Vu(t)));
  }
  function ze() {
    return e1(), f1(), c1(), v1();
  }
  function v1() {
    if (El !== 5) return !1;
    var l = va, t = Ac;
    Ac = 0;
    var a = Ke(Kt), u = A.T, n = D.p;
    try {
      D.p = 32 > a ? 32 : a, A.T = null, a = Mc, Mc = null;
      var e = va, f = Kt;
      if (El = 0, ou = va = null, Kt = 0, (P & 6) !== 0) throw Error(S(331));
      var c = P;
      if (P |= 4, Kv(e.current), Zv(e, e.current, f, a), P = c, vn(0, !1), kl && typeof kl.onPostCommitFiberRoot == "function") try {
        kl.onPostCommitFiberRoot(Du, e);
      } catch {
      }
      return !0;
    } finally {
      D.p = n, A.T = u, i1(l, t);
    }
  }
  function y1(l, t, a) {
    t = it(a, t), t = uc(l.stateNode, t, 2), l = ja(l, t, 2), l !== null && (On(l, 2), xt(l));
  }
  function ul(l, t, a) {
    if (l.tag === 3) y1(l, l, a);
    else for (; t !== null; ) {
      if (t.tag === 3) {
        y1(t, l, a);
        break;
      } else if (t.tag === 1) {
        var u = t.stateNode;
        if (typeof t.type.getDerivedStateFromError == "function" || typeof u.componentDidCatch == "function" && (ia === null || !ia.has(u))) {
          l = it(a, l), a = mv(2), u = ja(t, a, 2), u !== null && (dv(a, u, t, l), On(u, 2), xt(u));
          break;
        }
      }
      t = t.return;
    }
  }
  function Nc(l, t, a) {
    var u = l.pingCache;
    if (u === null) {
      u = l.pingCache = new zm();
      var n = /* @__PURE__ */ new Set();
      u.set(t, n);
    } else n = u.get(t), n === void 0 && (n = /* @__PURE__ */ new Set(), u.set(t, n));
    n.has(a) || (_c = !0, n.add(a), l = Mm.bind(null, l, t, a), t.then(l, l));
  }
  function Mm(l, t, a) {
    var u = l.pingCache;
    u !== null && u.delete(t), l.pingedLanes |= l.suspendedLanes & a, l.warmLanes &= ~a, cl === l && (x & a) === a && (Sl === 4 || Sl === 3 && (x & 62914560) === x && 300 > Fl() - he ? (P & 2) === 0 && bu(l, 0) : Tc |= a, gu === x && (gu = 0)), xt(l);
  }
  function m1(l, t) {
    t === 0 && (t = ci()), l = Da(l, t), l !== null && (On(l, t), xt(l));
  }
  function Om(l) {
    var t = l.memoizedState, a = 0;
    t !== null && (a = t.retryLane), m1(l, a);
  }
  function Dm(l, t) {
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
        throw Error(S(314));
    }
    u !== null && u.delete(t), m1(l, a);
  }
  function Um(l, t) {
    return Ze(l, t);
  }
  var _e = null, _u = null, Hc = !1, Te = !1, qc = !1, ma = 0;
  function xt(l) {
    l !== _u && l.next === null && (_u === null ? _e = _u = l : _u = _u.next = l), Te = !0, Hc || (Hc = !0, Hm());
  }
  function vn(l, t) {
    if (!qc && Te) {
      qc = !0;
      do
        for (var a = !1, u = _e; u !== null; ) {
          if (!t) if (l !== 0) {
            var n = u.pendingLanes;
            if (n === 0) var e = 0;
            else {
              var f = u.suspendedLanes, c = u.pingedLanes;
              e = (1 << 31 - Il(42 | l) + 1) - 1, e &= n & ~(f & ~c), e = e & 201326741 ? e & 201326741 | 1 : e ? e | 2 : 0;
            }
            e !== 0 && (a = !0, s1(u, e));
          } else e = x, e = Mn(u, u === cl ? e : 0, u.cancelPendingCommit !== null || u.timeoutHandle !== -1), (e & 3) === 0 || Uu(u, e) || (a = !0, s1(u, e));
          u = u.next;
        }
      while (a);
      qc = !1;
    }
  }
  function Nm() {
    d1();
  }
  function d1() {
    Te = Hc = !1;
    var l = 0;
    ma !== 0 && Gm() && (l = ma);
    for (var t = Fl(), a = null, u = _e; u !== null; ) {
      var n = u.next, e = h1(u, t);
      e === 0 ? (u.next = null, a === null ? _e = n : a.next = n, n === null && (_u = a)) : (a = u, (l !== 0 || (e & 3) !== 0) && (Te = !0)), u = n;
    }
    El !== 0 && El !== 5 || vn(l, !1), ma !== 0 && (ma = 0);
  }
  function h1(l, t) {
    for (var a = l.suspendedLanes, u = l.pingedLanes, n = l.expirationTimes, e = l.pendingLanes & -62914561; 0 < e; ) {
      var f = 31 - Il(e), c = 1 << f, i = n[f];
      i === -1 ? ((c & a) === 0 || (c & u) !== 0) && (n[f] = vy(c, t)) : i <= t && (l.expiredLanes |= c), e &= ~c;
    }
    if (t = cl, a = x, a = Mn(l, l === t ? a : 0, l.cancelPendingCommit !== null || l.timeoutHandle !== -1), u = l.callbackNode, a === 0 || l === t && (al === 2 || al === 9) || l.cancelPendingCommit !== null) return u !== null && u !== null && Ve(u), l.callbackNode = null, l.callbackPriority = 0;
    if ((a & 3) === 0 || Uu(l, a)) {
      if (t = a & -a, t === l.callbackPriority) return t;
      switch (u !== null && Ve(u), Ke(a)) {
        case 2:
        case 8:
          a = ei;
          break;
        case 32:
          a = _n;
          break;
        case 268435456:
          a = fi;
          break;
        default:
          a = _n;
      }
      return u = S1.bind(null, l), a = Ze(a, u), l.callbackPriority = t, l.callbackNode = a, t;
    }
    return u !== null && u !== null && Ve(u), l.callbackPriority = 2, l.callbackNode = null, 2;
  }
  function S1(l, t) {
    if (El !== 0 && El !== 5) return l.callbackNode = null, l.callbackPriority = 0, null;
    var a = l.callbackNode;
    if (ze() && l.callbackNode !== a) return null;
    var u = x;
    return u = Mn(l, l === cl ? u : 0, l.cancelPendingCommit !== null || l.timeoutHandle !== -1), u === 0 ? null : ($v(l, u, t), h1(l, Fl()), l.callbackNode != null && l.callbackNode === a ? S1.bind(null, l) : null);
  }
  function s1(l, t) {
    if (ze()) return null;
    $v(l, t, !0);
  }
  function Hm() {
    Xm(function() {
      (P & 6) !== 0 ? Ze(ni, Nm) : d1();
    });
  }
  function Yc() {
    if (ma === 0) {
      var l = eu;
      l === 0 && (l = Tn, Tn <<= 1, (Tn & 261888) === 0 && (Tn = 256)), ma = l;
    }
    return ma;
  }
  function g1(l) {
    return l == null || typeof l == "symbol" || typeof l == "boolean" ? null : typeof l == "function" ? l : Hn("" + l);
  }
  function o1(l, t) {
    var a = t.ownerDocument.createElement("input");
    return a.name = t.name, a.value = t.value, l.id && a.setAttribute("form", l.id), t.parentNode.insertBefore(a, t), l = new FormData(l), a.parentNode.removeChild(a), l;
  }
  function qm(l, t, a, u, n) {
    if (t === "submit" && a && a.stateNode === n) {
      var e = g1((n[Gl] || null).action), f = u.submitter;
      f && (t = (t = f[Gl] || null) ? g1(t.formAction) : f.getAttribute("formAction"), t !== null && (e = t, f = null));
      var c = new Cn("action", "action", null, u, n);
      l.push({
        event: c,
        listeners: [{
          instance: null,
          listener: function() {
            if (u.defaultPrevented) {
              if (ma !== 0) {
                var i = f ? o1(n, f) : new FormData(n);
                kf(a, {
                  pending: !0,
                  data: i,
                  method: n.method,
                  action: e
                }, null, i);
              }
            } else typeof e == "function" && (c.preventDefault(), i = f ? o1(n, f) : new FormData(n), kf(a, {
              pending: !0,
              data: i,
              method: n.method,
              action: e
            }, e, i));
          },
          currentTarget: n
        }]
      });
    }
  }
  for (var Bc = 0; Bc < Sf.length; Bc++) {
    var Cc = Sf[Bc];
    zt(Cc.toLowerCase(), "on" + (Cc[0].toUpperCase() + Cc.slice(1)));
  }
  zt(ki, "onAnimationEnd"), zt(Ii, "onAnimationIteration"), zt(Pi, "onAnimationStart"), zt("dblclick", "onDoubleClick"), zt("focusin", "onFocus"), zt("focusout", "onBlur"), zt(xy, "onTransitionRun"), zt(Jy, "onTransitionStart"), zt(Wy, "onTransitionCancel"), zt(l0, "onTransitionEnd"), xa("onMouseEnter", ["mouseout", "mouseover"]), xa("onMouseLeave", ["mouseout", "mouseover"]), xa("onPointerEnter", ["pointerout", "pointerover"]), xa("onPointerLeave", ["pointerout", "pointerover"]), Ea("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" ")), Ea("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")), Ea("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]), Ea("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" ")), Ea("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" ")), Ea("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
  var yn = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), Ym = new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(yn));
  function b1(l, t) {
    t = (t & 4) !== 0;
    for (var a = 0; a < l.length; a++) {
      var u = l[a], n = u.event;
      u = u.listeners;
      l: {
        var e = void 0;
        if (t) for (var f = u.length - 1; 0 <= f; f--) {
          var c = u[f], i = c.instance, h = c.currentTarget;
          if (c = c.listener, i !== e && n.isPropagationStopped()) break l;
          e = c, n.currentTarget = h;
          try {
            e(n);
          } catch (o) {
            jn(o);
          }
          n.currentTarget = null, e = i;
        }
        else for (f = 0; f < u.length; f++) {
          if (c = u[f], i = c.instance, h = c.currentTarget, c = c.listener, i !== e && n.isPropagationStopped()) break l;
          e = c, n.currentTarget = h;
          try {
            e(n);
          } catch (o) {
            jn(o);
          }
          n.currentTarget = null, e = i;
        }
      }
    }
  }
  function K(l, t) {
    var a = t[xe];
    a === void 0 && (a = t[xe] = /* @__PURE__ */ new Set());
    var u = l + "__bubble";
    a.has(u) || (_1(t, l, 2, !1), a.add(u));
  }
  function Rc(l, t, a) {
    var u = 0;
    t && (u |= 4), _1(a, l, u, t);
  }
  var Ee = "_reactListening" + Math.random().toString(36).slice(2);
  function z1(l) {
    if (!l[Ee]) {
      l[Ee] = !0, si.forEach(function(a) {
        a !== "selectionchange" && (Ym.has(a) || Rc(a, !1, l), Rc(a, !0, l));
      });
      var t = l.nodeType === 9 ? l : l.ownerDocument;
      t === null || t[Ee] || (t[Ee] = !0, Rc("selectionchange", !1, t));
    }
  }
  function _1(l, t, a, u) {
    switch (W1(t)) {
      case 2:
        var n = cd;
        break;
      case 8:
        n = id;
        break;
      default:
        n = $c;
    }
    a = n.bind(null, t, a, l), n = void 0, !lf || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (n = !0), u ? n !== void 0 ? l.addEventListener(t, a, {
      capture: !0,
      passive: n
    }) : l.addEventListener(t, a, !0) : n !== void 0 ? l.addEventListener(t, a, { passive: n }) : l.addEventListener(t, a, !1);
  }
  function pc(l, t, a, u, n) {
    var e = u;
    if ((t & 1) === 0 && (t & 2) === 0 && u !== null) l: for (; ; ) {
      if (u === null) return;
      var f = u.tag;
      if (f === 3 || f === 4) {
        var c = u.stateNode.containerInfo;
        if (c === n) break;
        if (f === 4) for (f = u.return; f !== null; ) {
          var i = f.tag;
          if ((i === 3 || i === 4) && f.stateNode.containerInfo === n) return;
          f = f.return;
        }
        for (; c !== null; ) {
          if (f = Va(c), f === null) return;
          if (i = f.tag, i === 5 || i === 6 || i === 26 || i === 27) {
            u = e = f;
            continue l;
          }
          c = c.parentNode;
        }
      }
      u = u.return;
    }
    Ui(function() {
      var h = e, o = Ie(a), _ = [];
      l: {
        var s = t0.get(l);
        if (s !== void 0) {
          var g = Cn, N = l;
          switch (l) {
            case "keypress":
              if (Yn(a) === 0) break l;
            case "keydown":
            case "keyup":
              g = Ny;
              break;
            case "focusin":
              N = "focus", g = nf;
              break;
            case "focusout":
              N = "blur", g = nf;
              break;
            case "beforeblur":
            case "afterblur":
              g = nf;
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
              g = qi;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              g = Ty;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              g = Hy;
              break;
            case ki:
            case Ii:
            case Pi:
              g = Ey;
              break;
            case l0:
              g = qy;
              break;
            case "scroll":
            case "scrollend":
              g = _y;
              break;
            case "wheel":
              g = Yy;
              break;
            case "copy":
            case "cut":
            case "paste":
              g = Ay;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              g = Bi;
              break;
            case "toggle":
            case "beforetoggle":
              g = By;
          }
          var R = (t & 4) !== 0, fl = !R && (l === "scroll" || l === "scrollend"), m = R ? s !== null ? s + "Capture" : null : s;
          R = [];
          for (var v = h, d; v !== null; ) {
            var z = v;
            if (d = z.stateNode, z = z.tag, z !== 5 && z !== 26 && z !== 27 || d === null || m === null || (z = Yu(v, m), z != null && R.push(mn(v, z, d))), fl) break;
            v = v.return;
          }
          0 < R.length && (s = new g(s, N, null, a, o), _.push({
            event: s,
            listeners: R
          }));
        }
      }
      if ((t & 7) === 0) {
        l: {
          if (s = l === "mouseover" || l === "pointerover", g = l === "mouseout" || l === "pointerout", s && a !== ke && (N = a.relatedTarget || a.fromElement) && (Va(N) || N[Nu])) break l;
          if ((g || s) && (s = o.window === o ? o : (s = o.ownerDocument) ? s.defaultView || s.parentWindow : window, g ? (N = a.relatedTarget || a.toElement, g = h, N = N ? Va(N) : null, N !== null && (fl = k(N), R = N.tag, N !== fl || R !== 5 && R !== 27 && R !== 6) && (N = null)) : (g = null, N = h), g !== N)) {
            if (R = qi, z = "onMouseLeave", m = "onMouseEnter", v = "mouse", (l === "pointerout" || l === "pointerover") && (R = Bi, z = "onPointerLeave", m = "onPointerEnter", v = "pointer"), fl = g == null ? s : qu(g), d = N == null ? s : qu(N), s = new R(z, v + "leave", g, a, o), s.target = fl, s.relatedTarget = d, z = null, Va(o) === h && (R = new R(m, v + "enter", N, a, o), R.target = d, R.relatedTarget = fl, z = R), fl = z, g && N) t: {
              for (R = Bm, m = g, v = N, d = 0, z = m; z; z = R(z)) d++;
              z = 0;
              for (var Y = v; Y; Y = R(Y)) z++;
              for (; 0 < d - z; ) m = R(m), d--;
              for (; 0 < z - d; ) v = R(v), z--;
              for (; d--; ) {
                if (m === v || v !== null && m === v.alternate) {
                  R = m;
                  break t;
                }
                m = R(m), v = R(v);
              }
              R = null;
            }
            else R = null;
            g !== null && T1(_, s, g, R, !1), N !== null && fl !== null && T1(_, fl, N, R, !0);
          }
        }
        l: {
          if (s = h ? qu(h) : window, g = s.nodeName && s.nodeName.toLowerCase(), g === "select" || g === "input" && s.type === "file") var $ = Qi;
          else if (ri(s)) if (Zi) $ = Vy;
          else {
            $ = Qy;
            var H = Xy;
          }
          else g = s.nodeName, !g || g.toLowerCase() !== "input" || s.type !== "checkbox" && s.type !== "radio" ? h && Fe(h.elementType) && ($ = Qi) : $ = Zy;
          if ($ && ($ = $(l, h))) {
            Xi(_, $, a, o);
            break l;
          }
          H && H(l, s, h), l === "focusout" && h && s.type === "number" && h.memoizedProps.value != null && $e(s, "number", s.value);
        }
        switch (H = h ? qu(h) : window, l) {
          case "focusin":
            (ri(H) || H.contentEditable === "true") && (ka = H, mf = h, Xu = null);
            break;
          case "focusout":
            Xu = mf = ka = null;
            break;
          case "mousedown":
            df = !0;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            df = !1, $i(_, a, o);
            break;
          case "selectionchange":
            if (Ky) break;
          case "keydown":
          case "keyup":
            $i(_, a, o);
        }
        var Q;
        if (ff) l: {
          switch (l) {
            case "compositionstart":
              var J = "onCompositionStart";
              break l;
            case "compositionend":
              J = "onCompositionEnd";
              break l;
            case "compositionupdate":
              J = "onCompositionUpdate";
              break l;
          }
          J = void 0;
        }
        else Fa ? ji(l, a) && (J = "onCompositionEnd") : l === "keydown" && a.keyCode === 229 && (J = "onCompositionStart");
        J && (Ci && a.locale !== "ko" && (Fa || J !== "onCompositionStart" ? J === "onCompositionEnd" && Fa && (Q = Ni()) : (kt = o, tf = "value" in kt ? kt.value : kt.textContent, Fa = !0)), H = Ae(h, J), 0 < H.length && (J = new Yi(J, l, null, a, o), _.push({
          event: J,
          listeners: H
        }), Q ? J.data = Q : (Q = Gi(a), Q !== null && (J.data = Q)))), (Q = Ry ? py(l, a) : jy(l, a)) && (J = Ae(h, "onBeforeInput"), 0 < J.length && (H = new Yi("onBeforeInput", "beforeinput", null, a, o), _.push({
          event: H,
          listeners: J
        }), H.data = Q)), qm(_, l, h, a, o);
      }
      b1(_, t);
    });
  }
  function mn(l, t, a) {
    return {
      instance: l,
      listener: t,
      currentTarget: a
    };
  }
  function Ae(l, t) {
    for (var a = t + "Capture", u = []; l !== null; ) {
      var n = l, e = n.stateNode;
      if (n = n.tag, n !== 5 && n !== 26 && n !== 27 || e === null || (n = Yu(l, a), n != null && u.unshift(mn(l, n, e)), n = Yu(l, t), n != null && u.push(mn(l, n, e))), l.tag === 3) return u;
      l = l.return;
    }
    return [];
  }
  function Bm(l) {
    if (l === null) return null;
    do
      l = l.return;
    while (l && l.tag !== 5 && l.tag !== 27);
    return l || null;
  }
  function T1(l, t, a, u, n) {
    for (var e = t._reactName, f = []; a !== null && a !== u; ) {
      var c = a, i = c.alternate, h = c.stateNode;
      if (c = c.tag, i !== null && i === u) break;
      c !== 5 && c !== 26 && c !== 27 || h === null || (i = h, n ? (h = Yu(a, e), h != null && f.unshift(mn(a, h, i))) : n || (h = Yu(a, e), h != null && f.push(mn(a, h, i)))), a = a.return;
    }
    f.length !== 0 && l.push({
      event: t,
      listeners: f
    });
  }
  var Cm = /\r\n?/g, Rm = /\u0000|\uFFFD/g;
  function E1(l) {
    return (typeof l == "string" ? l : "" + l).replace(Cm, `
`).replace(Rm, "");
  }
  function A1(l, t) {
    return t = E1(t), E1(l) === t;
  }
  function el(l, t, a, u, n, e) {
    switch (a) {
      case "children":
        typeof u == "string" ? t === "body" || t === "textarea" && u === "" || Wa(l, u) : (typeof u == "number" || typeof u == "bigint") && t !== "body" && Wa(l, "" + u);
        break;
      case "className":
        Un(l, "class", u);
        break;
      case "tabIndex":
        Un(l, "tabindex", u);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        Un(l, a, u);
        break;
      case "style":
        Oi(l, u, e);
        break;
      case "data":
        if (t !== "object") {
          Un(l, "data", u);
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
        } else typeof e == "function" && (a === "formAction" ? (t !== "input" && el(l, t, "name", n.name, n, null), el(l, t, "formEncType", n.formEncType, n, null), el(l, t, "formMethod", n.formMethod, n, null), el(l, t, "formTarget", n.formTarget, n, null)) : (el(l, t, "encType", n.encType, n, null), el(l, t, "method", n.method, n, null), el(l, t, "target", n.target, n, null)));
        if (u == null || typeof u == "symbol" || typeof u == "boolean") {
          l.removeAttribute(a);
          break;
        }
        u = Hn("" + u), l.setAttribute(a, u);
        break;
      case "onClick":
        u != null && (l.onclick = Ht);
        break;
      case "onScroll":
        u != null && K("scroll", l);
        break;
      case "onScrollEnd":
        u != null && K("scrollend", l);
        break;
      case "dangerouslySetInnerHTML":
        if (u != null) {
          if (typeof u != "object" || !("__html" in u)) throw Error(S(61));
          if (a = u.__html, a != null) {
            if (n.children != null) throw Error(S(60));
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
        K("beforetoggle", l), K("toggle", l), Dn(l, "popover", u);
        break;
      case "xlinkActuate":
        Nt(l, "http://www.w3.org/1999/xlink", "xlink:actuate", u);
        break;
      case "xlinkArcrole":
        Nt(l, "http://www.w3.org/1999/xlink", "xlink:arcrole", u);
        break;
      case "xlinkRole":
        Nt(l, "http://www.w3.org/1999/xlink", "xlink:role", u);
        break;
      case "xlinkShow":
        Nt(l, "http://www.w3.org/1999/xlink", "xlink:show", u);
        break;
      case "xlinkTitle":
        Nt(l, "http://www.w3.org/1999/xlink", "xlink:title", u);
        break;
      case "xlinkType":
        Nt(l, "http://www.w3.org/1999/xlink", "xlink:type", u);
        break;
      case "xmlBase":
        Nt(l, "http://www.w3.org/XML/1998/namespace", "xml:base", u);
        break;
      case "xmlLang":
        Nt(l, "http://www.w3.org/XML/1998/namespace", "xml:lang", u);
        break;
      case "xmlSpace":
        Nt(l, "http://www.w3.org/XML/1998/namespace", "xml:space", u);
        break;
      case "is":
        Dn(l, "is", u);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < a.length) || a[0] !== "o" && a[0] !== "O" || a[1] !== "n" && a[1] !== "N") && (a = by.get(a) || a, Dn(l, a, u));
    }
  }
  function jc(l, t, a, u, n, e) {
    switch (a) {
      case "style":
        Oi(l, u, e);
        break;
      case "dangerouslySetInnerHTML":
        if (u != null) {
          if (typeof u != "object" || !("__html" in u)) throw Error(S(61));
          if (a = u.__html, a != null) {
            if (n.children != null) throw Error(S(60));
            l.innerHTML = a;
          }
        }
        break;
      case "children":
        typeof u == "string" ? Wa(l, u) : (typeof u == "number" || typeof u == "bigint") && Wa(l, "" + u);
        break;
      case "onScroll":
        u != null && K("scroll", l);
        break;
      case "onScrollEnd":
        u != null && K("scrollend", l);
        break;
      case "onClick":
        u != null && (l.onclick = Ht);
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
        if (!gi.hasOwnProperty(a)) l: {
          if (a[0] === "o" && a[1] === "n" && (n = a.endsWith("Capture"), t = a.slice(2, n ? a.length - 7 : void 0), e = l[Gl] || null, e = e != null ? e[a] : null, typeof e == "function" && l.removeEventListener(t, e, n), typeof u == "function")) {
            typeof e != "function" && e !== null && (a in l ? l[a] = null : l.hasAttribute(a) && l.removeAttribute(a)), l.addEventListener(t, u, n);
            break l;
          }
          a in l ? l[a] = u : u === !0 ? l.setAttribute(a, "") : Dn(l, a, u);
        }
    }
  }
  function Yl(l, t, a) {
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
        K("error", l), K("load", l);
        var u = !1, n = !1, e;
        for (e in a) if (a.hasOwnProperty(e)) {
          var f = a[e];
          if (f != null) switch (e) {
            case "src":
              u = !0;
              break;
            case "srcSet":
              n = !0;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(S(137, t));
            default:
              el(l, t, e, f, a, null);
          }
        }
        n && el(l, t, "srcSet", a.srcSet, a, null), u && el(l, t, "src", a.src, a, null);
        return;
      case "input":
        K("invalid", l);
        var c = e = f = n = null, i = null, h = null;
        for (u in a) if (a.hasOwnProperty(u)) {
          var o = a[u];
          if (o != null) switch (u) {
            case "name":
              n = o;
              break;
            case "type":
              f = o;
              break;
            case "checked":
              i = o;
              break;
            case "defaultChecked":
              h = o;
              break;
            case "value":
              e = o;
              break;
            case "defaultValue":
              c = o;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              if (o != null) throw Error(S(137, t));
              break;
            default:
              el(l, t, u, o, a, null);
          }
        }
        Ti(l, e, c, i, h, f, n, !1);
        return;
      case "select":
        K("invalid", l), u = f = e = null;
        for (n in a) if (a.hasOwnProperty(n) && (c = a[n], c != null)) switch (n) {
          case "value":
            e = c;
            break;
          case "defaultValue":
            f = c;
            break;
          case "multiple":
            u = c;
          default:
            el(l, t, n, c, a, null);
        }
        t = e, a = f, l.multiple = !!u, t != null ? Ja(l, !!u, t, !1) : a != null && Ja(l, !!u, a, !0);
        return;
      case "textarea":
        K("invalid", l), e = n = u = null;
        for (f in a) if (a.hasOwnProperty(f) && (c = a[f], c != null)) switch (f) {
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
            if (c != null) throw Error(S(91));
            break;
          default:
            el(l, t, f, c, a, null);
        }
        Ai(l, u, n, e);
        return;
      case "option":
        for (i in a) if (a.hasOwnProperty(i) && (u = a[i], u != null)) switch (i) {
          case "selected":
            l.selected = u && typeof u != "function" && typeof u != "symbol";
            break;
          default:
            el(l, t, i, u, a, null);
        }
        return;
      case "dialog":
        K("beforetoggle", l), K("toggle", l), K("cancel", l), K("close", l);
        break;
      case "iframe":
      case "object":
        K("load", l);
        break;
      case "video":
      case "audio":
        for (u = 0; u < yn.length; u++) K(yn[u], l);
        break;
      case "image":
        K("error", l), K("load", l);
        break;
      case "details":
        K("toggle", l);
        break;
      case "embed":
      case "source":
      case "link":
        K("error", l), K("load", l);
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
        for (h in a) if (a.hasOwnProperty(h) && (u = a[h], u != null)) switch (h) {
          case "children":
          case "dangerouslySetInnerHTML":
            throw Error(S(137, t));
          default:
            el(l, t, h, u, a, null);
        }
        return;
      default:
        if (Fe(t)) {
          for (o in a) a.hasOwnProperty(o) && (u = a[o], u !== void 0 && jc(l, t, o, u, a, void 0));
          return;
        }
    }
    for (c in a) a.hasOwnProperty(c) && (u = a[c], u != null && el(l, t, c, u, a, null));
  }
  function pm(l, t, a, u) {
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
        var n = null, e = null, f = null, c = null, i = null, h = null, o = null;
        for (g in a) {
          var _ = a[g];
          if (a.hasOwnProperty(g) && _ != null) switch (g) {
            case "checked":
              break;
            case "value":
              break;
            case "defaultValue":
              i = _;
            default:
              u.hasOwnProperty(g) || el(l, t, g, null, u, _);
          }
        }
        for (var s in u) {
          var g = u[s];
          if (_ = a[s], u.hasOwnProperty(s) && (g != null || _ != null)) switch (s) {
            case "type":
              e = g;
              break;
            case "name":
              n = g;
              break;
            case "checked":
              h = g;
              break;
            case "defaultChecked":
              o = g;
              break;
            case "value":
              f = g;
              break;
            case "defaultValue":
              c = g;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              if (g != null) throw Error(S(137, t));
              break;
            default:
              g !== _ && el(l, t, s, g, u, _);
          }
        }
        we(l, f, c, i, h, o, e, n);
        return;
      case "select":
        g = f = c = s = null;
        for (e in a) if (i = a[e], a.hasOwnProperty(e) && i != null) switch (e) {
          case "value":
            break;
          case "multiple":
            g = i;
          default:
            u.hasOwnProperty(e) || el(l, t, e, null, u, i);
        }
        for (n in u) if (e = u[n], i = a[n], u.hasOwnProperty(n) && (e != null || i != null)) switch (n) {
          case "value":
            s = e;
            break;
          case "defaultValue":
            c = e;
            break;
          case "multiple":
            f = e;
          default:
            e !== i && el(l, t, n, e, u, i);
        }
        t = c, a = f, u = g, s != null ? Ja(l, !!a, s, !1) : !!u != !!a && (t != null ? Ja(l, !!a, t, !0) : Ja(l, !!a, a ? [] : "", !1));
        return;
      case "textarea":
        g = s = null;
        for (c in a) if (n = a[c], a.hasOwnProperty(c) && n != null && !u.hasOwnProperty(c)) switch (c) {
          case "value":
            break;
          case "children":
            break;
          default:
            el(l, t, c, null, u, n);
        }
        for (f in u) if (n = u[f], e = a[f], u.hasOwnProperty(f) && (n != null || e != null)) switch (f) {
          case "value":
            s = n;
            break;
          case "defaultValue":
            g = n;
            break;
          case "children":
            break;
          case "dangerouslySetInnerHTML":
            if (n != null) throw Error(S(91));
            break;
          default:
            n !== e && el(l, t, f, n, u, e);
        }
        Ei(l, s, g);
        return;
      case "option":
        for (var N in a) if (s = a[N], a.hasOwnProperty(N) && s != null && !u.hasOwnProperty(N)) switch (N) {
          case "selected":
            l.selected = !1;
            break;
          default:
            el(l, t, N, null, u, s);
        }
        for (i in u) if (s = u[i], g = a[i], u.hasOwnProperty(i) && s !== g && (s != null || g != null)) switch (i) {
          case "selected":
            l.selected = s && typeof s != "function" && typeof s != "symbol";
            break;
          default:
            el(l, t, i, s, u, g);
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
        for (var R in a) s = a[R], a.hasOwnProperty(R) && s != null && !u.hasOwnProperty(R) && el(l, t, R, null, u, s);
        for (h in u) if (s = u[h], g = a[h], u.hasOwnProperty(h) && s !== g && (s != null || g != null)) switch (h) {
          case "children":
          case "dangerouslySetInnerHTML":
            if (s != null) throw Error(S(137, t));
            break;
          default:
            el(l, t, h, s, u, g);
        }
        return;
      default:
        if (Fe(t)) {
          for (var fl in a) s = a[fl], a.hasOwnProperty(fl) && s !== void 0 && !u.hasOwnProperty(fl) && jc(l, t, fl, void 0, u, s);
          for (o in u) s = u[o], g = a[o], !u.hasOwnProperty(o) || s === g || s === void 0 && g === void 0 || jc(l, t, o, s, u, g);
          return;
        }
    }
    for (var m in a) s = a[m], a.hasOwnProperty(m) && s != null && !u.hasOwnProperty(m) && el(l, t, m, null, u, s);
    for (_ in u) s = u[_], g = a[_], !u.hasOwnProperty(_) || s === g || s == null && g == null || el(l, t, _, s, u, g);
  }
  function M1(l) {
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
  function jm() {
    if (typeof performance.getEntriesByType == "function") {
      for (var l = 0, t = 0, a = performance.getEntriesByType("resource"), u = 0; u < a.length; u++) {
        var n = a[u], e = n.transferSize, f = n.initiatorType, c = n.duration;
        if (e && c && M1(f)) {
          for (f = 0, c = n.responseEnd, u += 1; u < a.length; u++) {
            var i = a[u], h = i.startTime;
            if (h > c) break;
            var o = i.transferSize, _ = i.initiatorType;
            o && M1(_) && (i = i.responseEnd, f += o * (i < c ? 1 : (c - h) / (i - h)));
          }
          if (--u, t += 8 * (e + f) / (n.duration / 1e3), l++, 10 < l) break;
        }
      }
      if (0 < l) return t / l / 1e6;
    }
    return navigator.connection && (l = navigator.connection.downlink, typeof l == "number") ? l : 5;
  }
  var Gc = null, rc = null;
  function Me(l) {
    return l.nodeType === 9 ? l : l.ownerDocument;
  }
  function O1(l) {
    switch (l) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function D1(l, t) {
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
  function Xc(l, t) {
    return l === "textarea" || l === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var Qc = null;
  function Gm() {
    var l = window.event;
    return l && l.type === "popstate" ? l === Qc ? !1 : (Qc = l, !0) : (Qc = null, !1);
  }
  var U1 = typeof setTimeout == "function" ? setTimeout : void 0, rm = typeof clearTimeout == "function" ? clearTimeout : void 0, N1 = typeof Promise == "function" ? Promise : void 0, Xm = typeof queueMicrotask == "function" ? queueMicrotask : typeof N1 < "u" ? function(l) {
    return N1.resolve(null).then(l).catch(Qm);
  } : U1;
  function Qm(l) {
    setTimeout(function() {
      throw l;
    });
  }
  function da(l) {
    return l === "head";
  }
  function H1(l, t) {
    var a = t, u = 0;
    do {
      var n = a.nextSibling;
      if (l.removeChild(a), n && n.nodeType === 8) if (a = n.data, a === "/$" || a === "/&") {
        if (u === 0) {
          l.removeChild(n), Mu(t);
          return;
        }
        u--;
      } else if (a === "$" || a === "$?" || a === "$~" || a === "$!" || a === "&") u++;
      else if (a === "html") dn(l.ownerDocument.documentElement);
      else if (a === "head") {
        a = l.ownerDocument.head, dn(a);
        for (var e = a.firstChild; e; ) {
          var f = e.nextSibling, c = e.nodeName;
          e[Hu] || c === "SCRIPT" || c === "STYLE" || c === "LINK" && e.rel.toLowerCase() === "stylesheet" || a.removeChild(e), e = f;
        }
      } else a === "body" && dn(l.ownerDocument.body);
      a = n;
    } while (a);
    Mu(t);
  }
  function q1(l, t) {
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
  function Zc(l) {
    var t = l.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var a = t;
      switch (t = t.nextSibling, a.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          Zc(a), Je(a);
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
  function Zm(l, t, a, u) {
    for (; l.nodeType === 1; ) {
      var n = a;
      if (l.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!u && (l.nodeName !== "INPUT" || l.type !== "hidden")) break;
      } else if (u) {
        if (!l[Hu]) switch (t) {
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
      if (l = St(l.nextSibling), l === null) break;
    }
    return null;
  }
  function Vm(l, t, a) {
    if (t === "") return null;
    for (; l.nodeType !== 3; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !a || (l = St(l.nextSibling), l === null)) return null;
    return l;
  }
  function Y1(l, t) {
    for (; l.nodeType !== 8; )
      if ((l.nodeType !== 1 || l.nodeName !== "INPUT" || l.type !== "hidden") && !t || (l = St(l.nextSibling), l === null)) return null;
    return l;
  }
  function Vc(l) {
    return l.data === "$?" || l.data === "$~";
  }
  function Lc(l) {
    return l.data === "$!" || l.data === "$?" && l.ownerDocument.readyState !== "loading";
  }
  function Lm(l, t) {
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
  function St(l) {
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
  function B1(l) {
    l = l.nextSibling;
    for (var t = 0; l; ) {
      if (l.nodeType === 8) {
        var a = l.data;
        if (a === "/$" || a === "/&") {
          if (t === 0) return St(l.nextSibling);
          t--;
        } else a !== "$" && a !== "$!" && a !== "$?" && a !== "$~" && a !== "&" || t++;
      }
      l = l.nextSibling;
    }
    return null;
  }
  function C1(l) {
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
  function R1(l, t, a) {
    switch (t = Me(a), l) {
      case "html":
        if (l = t.documentElement, !l) throw Error(S(452));
        return l;
      case "head":
        if (l = t.head, !l) throw Error(S(453));
        return l;
      case "body":
        if (l = t.body, !l) throw Error(S(454));
        return l;
      default:
        throw Error(S(451));
    }
  }
  function dn(l) {
    for (var t = l.attributes; t.length; ) l.removeAttributeNode(t[0]);
    Je(l);
  }
  var st = /* @__PURE__ */ new Map(), p1 = /* @__PURE__ */ new Set();
  function Oe(l) {
    return typeof l.getRootNode == "function" ? l.getRootNode() : l.nodeType === 9 ? l : l.ownerDocument;
  }
  var Jt = D.d;
  D.d = {
    f: Km,
    r: xm,
    D: Jm,
    C: Wm,
    L: wm,
    m: $m,
    X: km,
    S: Fm,
    M: Im
  };
  function Km() {
    var l = Jt.f(), t = ge();
    return l || t;
  }
  function xm(l) {
    var t = La(l);
    t !== null && t.tag === 5 && t.type === "form" ? lv(t) : Jt.r(l);
  }
  var Tu = typeof document > "u" ? null : document;
  function j1(l, t, a) {
    var u = Tu;
    if (u && typeof t == "string" && t) {
      var n = ft(t);
      n = 'link[rel="' + l + '"][href="' + n + '"]', typeof a == "string" && (n += '[crossorigin="' + a + '"]'), p1.has(n) || (p1.add(n), l = {
        rel: l,
        crossOrigin: a,
        href: t
      }, u.querySelector(n) === null && (t = u.createElement("link"), Yl(t, "link", l), Ol(t), u.head.appendChild(t)));
    }
  }
  function Jm(l) {
    Jt.D(l), j1("dns-prefetch", l, null);
  }
  function Wm(l, t) {
    Jt.C(l, t), j1("preconnect", l, t);
  }
  function wm(l, t, a) {
    Jt.L(l, t, a);
    var u = Tu;
    if (u && l && t) {
      var n = 'link[rel="preload"][as="' + ft(t) + '"]';
      t === "image" && a && a.imageSrcSet ? (n += '[imagesrcset="' + ft(a.imageSrcSet) + '"]', typeof a.imageSizes == "string" && (n += '[imagesizes="' + ft(a.imageSizes) + '"]')) : n += '[href="' + ft(l) + '"]';
      var e = n;
      switch (t) {
        case "style":
          e = Eu(l);
          break;
        case "script":
          e = Au(l);
      }
      st.has(e) || (l = C({
        rel: "preload",
        href: t === "image" && a && a.imageSrcSet ? void 0 : l,
        as: t
      }, a), st.set(e, l), u.querySelector(n) !== null || t === "style" && u.querySelector(hn(e)) || t === "script" && u.querySelector(Sn(e)) || (t = u.createElement("link"), Yl(t, "link", l), Ol(t), u.head.appendChild(t)));
    }
  }
  function $m(l, t) {
    Jt.m(l, t);
    var a = Tu;
    if (a && l) {
      var u = t && typeof t.as == "string" ? t.as : "script", n = 'link[rel="modulepreload"][as="' + ft(u) + '"][href="' + ft(l) + '"]', e = n;
      switch (u) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          e = Au(l);
      }
      if (!st.has(e) && (l = C({
        rel: "modulepreload",
        href: l
      }, t), st.set(e, l), a.querySelector(n) === null)) {
        switch (u) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (a.querySelector(Sn(e))) return;
        }
        u = a.createElement("link"), Yl(u, "link", l), Ol(u), a.head.appendChild(u);
      }
    }
  }
  function Fm(l, t, a) {
    Jt.S(l, t, a);
    var u = Tu;
    if (u && l) {
      var n = Ka(u).hoistableStyles, e = Eu(l);
      t = t || "default";
      var f = n.get(e);
      if (!f) {
        var c = {
          loading: 0,
          preload: null
        };
        if (f = u.querySelector(hn(e))) c.loading = 5;
        else {
          l = C({
            rel: "stylesheet",
            href: l,
            "data-precedence": t
          }, a), (a = st.get(e)) && xc(l, a);
          var i = f = u.createElement("link");
          Ol(i), Yl(i, "link", l), i._p = new Promise(function(h, o) {
            i.onload = h, i.onerror = o;
          }), i.addEventListener("load", function() {
            c.loading |= 1;
          }), i.addEventListener("error", function() {
            c.loading |= 2;
          }), c.loading |= 4, De(f, t, u);
        }
        f = {
          type: "stylesheet",
          instance: f,
          count: 1,
          state: c
        }, n.set(e, f);
      }
    }
  }
  function km(l, t) {
    Jt.X(l, t);
    var a = Tu;
    if (a && l) {
      var u = Ka(a).hoistableScripts, n = Au(l), e = u.get(n);
      e || (e = a.querySelector(Sn(n)), e || (l = C({
        src: l,
        async: !0
      }, t), (t = st.get(n)) && Jc(l, t), e = a.createElement("script"), Ol(e), Yl(e, "link", l), a.head.appendChild(e)), e = {
        type: "script",
        instance: e,
        count: 1,
        state: null
      }, u.set(n, e));
    }
  }
  function Im(l, t) {
    Jt.M(l, t);
    var a = Tu;
    if (a && l) {
      var u = Ka(a).hoistableScripts, n = Au(l), e = u.get(n);
      e || (e = a.querySelector(Sn(n)), e || (l = C({
        src: l,
        async: !0,
        type: "module"
      }, t), (t = st.get(n)) && Jc(l, t), e = a.createElement("script"), Ol(e), Yl(e, "link", l), a.head.appendChild(e)), e = {
        type: "script",
        instance: e,
        count: 1,
        state: null
      }, u.set(n, e));
    }
  }
  function G1(l, t, a, u) {
    var n = (n = V.current) ? Oe(n) : null;
    if (!n) throw Error(S(446));
    switch (l) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof a.precedence == "string" && typeof a.href == "string" ? (t = Eu(a.href), a = Ka(n).hoistableStyles, u = a.get(t), u || (u = {
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
          var e = Ka(n).hoistableStyles, f = e.get(l);
          if (f || (n = n.ownerDocument || n, f = {
            type: "stylesheet",
            instance: null,
            count: 0,
            state: {
              loading: 0,
              preload: null
            }
          }, e.set(l, f), (e = n.querySelector(hn(l))) && !e._p && (f.instance = e, f.state.loading = 5), st.has(l) || (a = {
            rel: "preload",
            as: "style",
            href: a.href,
            crossOrigin: a.crossOrigin,
            integrity: a.integrity,
            media: a.media,
            hrefLang: a.hrefLang,
            referrerPolicy: a.referrerPolicy
          }, st.set(l, a), e || Pm(n, l, a, f.state))), t && u === null) throw Error(S(528, ""));
          return f;
        }
        if (t && u !== null) throw Error(S(529, ""));
        return null;
      case "script":
        return t = a.async, a = a.src, typeof a == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Au(a), a = Ka(n).hoistableScripts, u = a.get(t), u || (u = {
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
        throw Error(S(444, l));
    }
  }
  function Eu(l) {
    return 'href="' + ft(l) + '"';
  }
  function hn(l) {
    return 'link[rel="stylesheet"][' + l + "]";
  }
  function r1(l) {
    return C({}, l, {
      "data-precedence": l.precedence,
      precedence: null
    });
  }
  function Pm(l, t, a, u) {
    l.querySelector('link[rel="preload"][as="style"][' + t + "]") ? u.loading = 1 : (t = l.createElement("link"), u.preload = t, t.addEventListener("load", function() {
      return u.loading |= 1;
    }), t.addEventListener("error", function() {
      return u.loading |= 2;
    }), Yl(t, "link", a), Ol(t), l.head.appendChild(t));
  }
  function Au(l) {
    return '[src="' + ft(l) + '"]';
  }
  function Sn(l) {
    return "script[async]" + l;
  }
  function X1(l, t, a) {
    if (t.count++, t.instance === null) switch (t.type) {
      case "style":
        var u = l.querySelector('style[data-href~="' + ft(a.href) + '"]');
        if (u) return t.instance = u, Ol(u), u;
        var n = C({}, a, {
          "data-href": a.href,
          "data-precedence": a.precedence,
          href: null,
          precedence: null
        });
        return u = (l.ownerDocument || l).createElement("style"), Ol(u), Yl(u, "style", n), De(u, a.precedence, l), t.instance = u;
      case "stylesheet":
        n = Eu(a.href);
        var e = l.querySelector(hn(n));
        if (e) return t.state.loading |= 4, t.instance = e, Ol(e), e;
        u = r1(a), (n = st.get(n)) && xc(u, n), e = (l.ownerDocument || l).createElement("link"), Ol(e);
        var f = e;
        return f._p = new Promise(function(c, i) {
          f.onload = c, f.onerror = i;
        }), Yl(e, "link", u), t.state.loading |= 4, De(e, a.precedence, l), t.instance = e;
      case "script":
        return e = Au(a.src), (n = l.querySelector(Sn(e))) ? (t.instance = n, Ol(n), n) : (u = a, (n = st.get(e)) && (u = C({}, a), Jc(u, n)), l = l.ownerDocument || l, n = l.createElement("script"), Ol(n), Yl(n, "link", u), l.head.appendChild(n), t.instance = n);
      case "void":
        return null;
      default:
        throw Error(S(443, t.type));
    }
    else t.type === "stylesheet" && (t.state.loading & 4) === 0 && (u = t.instance, t.state.loading |= 4, De(u, a.precedence, l));
    return t.instance;
  }
  function De(l, t, a) {
    for (var u = a.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'), n = u.length ? u[u.length - 1] : null, e = n, f = 0; f < u.length; f++) {
      var c = u[f];
      if (c.dataset.precedence === t) e = c;
      else if (e !== n) break;
    }
    e ? e.parentNode.insertBefore(l, e.nextSibling) : (t = a.nodeType === 9 ? a.head : a, t.insertBefore(l, t.firstChild));
  }
  function xc(l, t) {
    l.crossOrigin ??= t.crossOrigin, l.referrerPolicy ??= t.referrerPolicy, l.title ??= t.title;
  }
  function Jc(l, t) {
    l.crossOrigin ??= t.crossOrigin, l.referrerPolicy ??= t.referrerPolicy, l.integrity ??= t.integrity;
  }
  var Ue = null;
  function Q1(l, t, a) {
    if (Ue === null) {
      var u = /* @__PURE__ */ new Map(), n = Ue = /* @__PURE__ */ new Map();
      n.set(a, u);
    } else n = Ue, u = n.get(a), u || (u = /* @__PURE__ */ new Map(), n.set(a, u));
    if (u.has(l)) return u;
    for (u.set(l, null), a = a.getElementsByTagName(l), n = 0; n < a.length; n++) {
      var e = a[n];
      if (!(e[Hu] || e[Ul] || l === "link" && e.getAttribute("rel") === "stylesheet") && e.namespaceURI !== "http://www.w3.org/2000/svg") {
        var f = e.getAttribute(t) || "";
        f = l + f;
        var c = u.get(f);
        c ? c.push(e) : u.set(f, [e]);
      }
    }
    return u;
  }
  function Z1(l, t, a) {
    l = l.ownerDocument || l, l.head.insertBefore(a, t === "title" ? l.querySelector("head > title") : null);
  }
  function ld(l, t, a) {
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
  function V1(l) {
    return !(l.type === "stylesheet" && (l.state.loading & 3) === 0);
  }
  function td(l, t, a, u) {
    if (a.type === "stylesheet" && (typeof u.media != "string" || matchMedia(u.media).matches !== !1) && (a.state.loading & 4) === 0) {
      if (a.instance === null) {
        var n = Eu(u.href), e = t.querySelector(hn(n));
        if (e) {
          t = e._p, t !== null && typeof t == "object" && typeof t.then == "function" && (l.count++, l = Ne.bind(l), t.then(l, l)), a.state.loading |= 4, a.instance = e, Ol(e);
          return;
        }
        e = t.ownerDocument || t, u = r1(u), (n = st.get(n)) && xc(u, n), e = e.createElement("link"), Ol(e);
        var f = e;
        f._p = new Promise(function(c, i) {
          f.onload = c, f.onerror = i;
        }), Yl(e, "link", u), a.instance = e;
      }
      l.stylesheets === null && (l.stylesheets = /* @__PURE__ */ new Map()), l.stylesheets.set(a, t), (t = a.state.preload) && (a.state.loading & 3) === 0 && (l.count++, a = Ne.bind(l), t.addEventListener("load", a), t.addEventListener("error", a));
    }
  }
  var Wc = 0;
  function ad(l, t) {
    return l.stylesheets && l.count === 0 && qe(l, l.stylesheets), 0 < l.count || 0 < l.imgCount ? function(a) {
      var u = setTimeout(function() {
        if (l.stylesheets && qe(l, l.stylesheets), l.unsuspend) {
          var e = l.unsuspend;
          l.unsuspend = null, e();
        }
      }, 6e4 + t);
      0 < l.imgBytes && Wc === 0 && (Wc = 62500 * jm());
      var n = setTimeout(function() {
        if (l.waitingForImages = !1, l.count === 0 && (l.stylesheets && qe(l, l.stylesheets), l.unsuspend)) {
          var e = l.unsuspend;
          l.unsuspend = null, e();
        }
      }, (l.imgBytes > Wc ? 50 : 800) + t);
      return l.unsuspend = a, function() {
        l.unsuspend = null, clearTimeout(u), clearTimeout(n);
      };
    } : null;
  }
  function Ne() {
    if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
      if (this.stylesheets) qe(this, this.stylesheets);
      else if (this.unsuspend) {
        var l = this.unsuspend;
        this.unsuspend = null, l();
      }
    }
  }
  var He = null;
  function qe(l, t) {
    l.stylesheets = null, l.unsuspend !== null && (l.count++, He = /* @__PURE__ */ new Map(), t.forEach(ud, l), He = null, Ne.call(l));
  }
  function ud(l, t) {
    if (!(t.state.loading & 4)) {
      var a = He.get(l);
      if (a) var u = a.get(null);
      else {
        a = /* @__PURE__ */ new Map(), He.set(l, a);
        for (var n = l.querySelectorAll("link[data-precedence],style[data-precedence]"), e = 0; e < n.length; e++) {
          var f = n[e];
          (f.nodeName === "LINK" || f.getAttribute("media") !== "not all") && (a.set(f.dataset.precedence, f), u = f);
        }
        u && a.set(null, u);
      }
      n = t.instance, f = n.getAttribute("data-precedence"), e = a.get(f) || u, e === u && a.set(null, n), a.set(f, n), this.count++, u = Ne.bind(this), n.addEventListener("load", u), n.addEventListener("error", u), e ? e.parentNode.insertBefore(n, e.nextSibling) : (l = l.nodeType === 9 ? l.head : l, l.insertBefore(n, l.firstChild)), t.state.loading |= 4;
    }
  }
  var sn = {
    $$typeof: Ml,
    Provider: null,
    Consumer: null,
    _currentValue: I,
    _currentValue2: I,
    _threadCount: 0
  };
  function nd(l, t, a, u, n, e, f, c, i) {
    this.tag = 1, this.containerInfo = l, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Le(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Le(0), this.hiddenUpdates = Le(null), this.identifierPrefix = u, this.onUncaughtError = n, this.onCaughtError = e, this.onRecoverableError = f, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = i, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function ed(l, t, a, u, n, e, f, c, i, h, o, _) {
    return l = new nd(l, t, a, f, i, h, o, _, c), t = 1, e === !0 && (t |= 24), e = lt(3, null, null, t), l.current = e, e.stateNode = l, t = Uf(), t.refCount++, l.pooledCache = t, t.refCount++, e.memoizedState = {
      element: u,
      isDehydrated: a,
      cache: t
    }, Yf(e), l;
  }
  function fd(l) {
    return l ? (l = lu, l) : lu;
  }
  function L1(l, t, a, u, n, e) {
    n = fd(n), u.context === null ? u.context = n : u.pendingContext = n, u = pa(t), u.payload = { element: a }, e = e === void 0 ? null : e, e !== null && (u.callback = e), a = ja(l, u, t), a !== null && (Ll(a, l, t), Ju(a, l, t));
  }
  function K1(l, t) {
    if (l = l.memoizedState, l !== null && l.dehydrated !== null) {
      var a = l.retryLane;
      l.retryLane = a !== 0 && a < t ? a : t;
    }
  }
  function wc(l, t) {
    K1(l, t), (l = l.alternate) && K1(l, t);
  }
  function x1(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = Da(l, 67108864);
      t !== null && Ll(t, l, 67108864), wc(l, 67108864);
    }
  }
  function J1(l) {
    if (l.tag === 13 || l.tag === 31) {
      var t = ht();
      t = mi(t);
      var a = Da(l, t);
      a !== null && Ll(a, l, t), wc(l, t);
    }
  }
  var Ye = !0;
  function cd(l, t, a, u) {
    var n = A.T;
    A.T = null;
    var e = D.p;
    try {
      D.p = 2, $c(l, t, a, u);
    } finally {
      D.p = e, A.T = n;
    }
  }
  function id(l, t, a, u) {
    var n = A.T;
    A.T = null;
    var e = D.p;
    try {
      D.p = 8, $c(l, t, a, u);
    } finally {
      D.p = e, A.T = n;
    }
  }
  function $c(l, t, a, u) {
    if (Ye) {
      var n = Fc(u);
      if (n === null) pc(l, t, u, Be, a), w1(l, u);
      else if (yd(n, l, t, a, u)) u.stopPropagation();
      else if (w1(l, u), t & 4 && -1 < vd.indexOf(l)) {
        for (; n !== null; ) {
          var e = La(n);
          if (e !== null) switch (e.tag) {
            case 3:
              if (e = e.stateNode, e.current.memoizedState.isDehydrated) {
                var f = Ta(e.pendingLanes);
                if (f !== 0) {
                  var c = e;
                  for (c.pendingLanes |= 2, c.entangledLanes |= 2; f; ) {
                    var i = 1 << 31 - Il(f);
                    c.entanglements[1] |= i, f &= ~i;
                  }
                  xt(e), (P & 6) === 0 && (Se = Fl() + 500, vn(0, !1));
                }
              }
              break;
            case 31:
            case 13:
              c = Da(e, 2), c !== null && Ll(c, e, 2), ge(), wc(e, 2);
          }
          if (e = Fc(u), e === null && pc(l, t, u, Be, a), e === n) break;
          n = e;
        }
        n !== null && u.stopPropagation();
      } else pc(l, t, u, null, a);
    }
  }
  function Fc(l) {
    return l = Ie(l), kc(l);
  }
  var Be = null;
  function kc(l) {
    if (Be = null, l = Va(l), l !== null) {
      var t = k(l);
      if (t === null) l = null;
      else {
        var a = t.tag;
        if (a === 13) {
          if (l = Al(t), l !== null) return l;
          l = null;
        } else if (a === 31) {
          if (l = dl(t), l !== null) return l;
          l = null;
        } else if (a === 3) {
          if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
          l = null;
        } else t !== l && (l = null);
      }
    }
    return Be = l, null;
  }
  function W1(l) {
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
        switch (ay()) {
          case ni:
            return 2;
          case ei:
            return 8;
          case _n:
          case uy:
            return 32;
          case fi:
            return 268435456;
          default:
            return 32;
        }
      default:
        return 32;
    }
  }
  var Ic = !1, ha = null, Sa = null, sa = null, gn = /* @__PURE__ */ new Map(), on = /* @__PURE__ */ new Map(), ga = [], vd = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");
  function w1(l, t) {
    switch (l) {
      case "focusin":
      case "focusout":
        ha = null;
        break;
      case "dragenter":
      case "dragleave":
        Sa = null;
        break;
      case "mouseover":
      case "mouseout":
        sa = null;
        break;
      case "pointerover":
      case "pointerout":
        gn.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        on.delete(t.pointerId);
    }
  }
  function bn(l, t, a, u, n, e) {
    return l === null || l.nativeEvent !== e ? (l = {
      blockedOn: t,
      domEventName: a,
      eventSystemFlags: u,
      nativeEvent: e,
      targetContainers: [n]
    }, t !== null && (t = La(t), t !== null && x1(t)), l) : (l.eventSystemFlags |= u, t = l.targetContainers, n !== null && t.indexOf(n) === -1 && t.push(n), l);
  }
  function yd(l, t, a, u, n) {
    switch (t) {
      case "focusin":
        return ha = bn(ha, l, t, a, u, n), !0;
      case "dragenter":
        return Sa = bn(Sa, l, t, a, u, n), !0;
      case "mouseover":
        return sa = bn(sa, l, t, a, u, n), !0;
      case "pointerover":
        var e = n.pointerId;
        return gn.set(e, bn(gn.get(e) || null, l, t, a, u, n)), !0;
      case "gotpointercapture":
        return e = n.pointerId, on.set(e, bn(on.get(e) || null, l, t, a, u, n)), !0;
    }
    return !1;
  }
  function $1(l) {
    var t = Va(l.target);
    if (t !== null) {
      var a = k(t);
      if (a !== null) {
        if (t = a.tag, t === 13) {
          if (t = Al(a), t !== null) {
            l.blockedOn = t, hi(l.priority, function() {
              J1(a);
            });
            return;
          }
        } else if (t === 31) {
          if (t = dl(a), t !== null) {
            l.blockedOn = t, hi(l.priority, function() {
              J1(a);
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
        ke = u, a.target.dispatchEvent(u), ke = null;
      } else return t = La(a), t !== null && x1(t), l.blockedOn = a, !1;
      t.shift();
    }
    return !0;
  }
  function F1(l, t, a) {
    Ce(l) && a.delete(t);
  }
  function md() {
    Ic = !1, ha !== null && Ce(ha) && (ha = null), Sa !== null && Ce(Sa) && (Sa = null), sa !== null && Ce(sa) && (sa = null), gn.forEach(F1), on.forEach(F1);
  }
  function Re(l, t) {
    l.blockedOn === t && (l.blockedOn = null, Ic || (Ic = !0, O.unstable_scheduleCallback(O.unstable_NormalPriority, md)));
  }
  var pe = null;
  function k1(l) {
    pe !== l && (pe = l, O.unstable_scheduleCallback(O.unstable_NormalPriority, function() {
      pe === l && (pe = null);
      for (var t = 0; t < l.length; t += 3) {
        var a = l[t], u = l[t + 1], n = l[t + 2];
        if (typeof u != "function") {
          if (kc(u || a) === null) continue;
          break;
        }
        var e = La(a);
        e !== null && (l.splice(t, 3), t -= 3, kf(e, {
          pending: !0,
          data: n,
          method: a.method,
          action: u
        }, u, n));
      }
    }));
  }
  function Mu(l) {
    function t(i) {
      return Re(i, l);
    }
    ha !== null && Re(ha, l), Sa !== null && Re(Sa, l), sa !== null && Re(sa, l), gn.forEach(t), on.forEach(t);
    for (var a = 0; a < ga.length; a++) {
      var u = ga[a];
      u.blockedOn === l && (u.blockedOn = null);
    }
    for (; 0 < ga.length && (a = ga[0], a.blockedOn === null); ) $1(a), a.blockedOn === null && ga.shift();
    if (a = (l.ownerDocument || l).$$reactFormReplay, a != null) for (u = 0; u < a.length; u += 3) {
      var n = a[u], e = a[u + 1], f = n[Gl] || null;
      if (typeof e == "function") f || k1(a);
      else if (f) {
        var c = null;
        if (e && e.hasAttribute("formAction")) {
          if (n = e, f = e[Gl] || null) c = f.formAction;
          else if (kc(n) !== null) continue;
        } else c = f.action;
        typeof c == "function" ? a[u + 1] = c : (a.splice(u, 3), u -= 3), k1(a);
      }
    }
  }
  function dd() {
    function l(e) {
      e.canIntercept && e.info === "react-transition" && e.intercept({
        handler: function() {
          return new Promise(function(f) {
            return n = f;
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
  function Pc(l) {
    this._internalRoot = l;
  }
  li.prototype.render = Pc.prototype.render = function(l) {
    var t = this._internalRoot;
    if (t === null) throw Error(S(409));
    var a = t.current;
    L1(a, ht(), l, t, null, null);
  }, li.prototype.unmount = Pc.prototype.unmount = function() {
    var l = this._internalRoot;
    if (l !== null) {
      this._internalRoot = null;
      var t = l.containerInfo;
      L1(l.current, 2, null, l, null, null), ge(), t[Nu] = null;
    }
  };
  function li(l) {
    this._internalRoot = l;
  }
  li.prototype.unstable_scheduleHydration = function(l) {
    if (l) {
      var t = di();
      l = {
        blockedOn: null,
        target: l,
        priority: t
      };
      for (var a = 0; a < ga.length && t !== 0 && t < ga[a].priority; a++) ;
      ga.splice(a, 0, l), a === 0 && $1(l);
    }
  };
  var I1 = p.version;
  if (I1 !== "19.2.8") throw Error(S(527, I1, "19.2.8"));
  D.findDOMNode = function(l) {
    var t = l._reactInternals;
    if (t === void 0)
      throw typeof l.render == "function" ? Error(S(188)) : (l = Object.keys(l).join(","), Error(S(268, l)));
    return l = E(t), l = l !== null ? X(l) : null, l = l === null ? null : l.stateNode, l;
  };
  var hd = {
    bundleType: 0,
    version: "19.2.8",
    rendererPackageName: "react-dom",
    currentDispatcherRef: A,
    reconcilerVersion: "19.2.8"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var je = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!je.isDisabled && je.supportsFiber) try {
      Du = je.inject(hd), kl = je;
    } catch {
    }
  }
  b.createRoot = function(l, t) {
    if (!ll(l)) throw Error(S(299));
    var a = !1, u = "", n = im, e = vm, f = ym;
    return t != null && (t.unstable_strictMode === !0 && (a = !0), t.identifierPrefix !== void 0 && (u = t.identifierPrefix), t.onUncaughtError !== void 0 && (n = t.onUncaughtError), t.onCaughtError !== void 0 && (e = t.onCaughtError), t.onRecoverableError !== void 0 && (f = t.onRecoverableError)), t = ed(l, 1, !1, null, null, a, u, null, n, e, f, dd), l[Nu] = t.current, z1(l), new Pc(t);
  };
})), Td = /* @__PURE__ */ Ut(((b, O) => {
  function p() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(p);
      } catch (j) {
        console.error(j);
      }
  }
  p(), O.exports = _d();
})), Ed = /* @__PURE__ */ Ut(((b) => {
  var O = Symbol.for("react.transitional.element"), p = Symbol.for("react.fragment");
  function j(S, ll, k) {
    var Al = null;
    if (k !== void 0 && (Al = "" + k), ll.key !== void 0 && (Al = "" + ll.key), "key" in ll) {
      k = {};
      for (var dl in ll) dl !== "key" && (k[dl] = ll[dl]);
    } else k = ll;
    return ll = k.ref, {
      $$typeof: O,
      type: S,
      key: Al,
      ref: ll !== void 0 ? ll : null,
      props: k
    };
  }
  b.Fragment = p, b.jsx = j, b.jsxs = j;
})), Ad = /* @__PURE__ */ Ut(((b, O) => {
  O.exports = Ed();
})), ba = ti(), Md = Td(), r = Ad();
function Od({ titel: b, symbol: O, beschreibung: p, aktionen: j }) {
  return /* @__PURE__ */ (0, r.jsxs)("div", {
    className: "ara-kopf",
    children: [/* @__PURE__ */ (0, r.jsxs)("div", {
      className: "ara-kopf__text",
      children: [/* @__PURE__ */ (0, r.jsxs)("h1", {
        className: "ara-kopf__titel",
        children: [O && /* @__PURE__ */ (0, r.jsx)("span", {
          className: "ara-kopf__symbol",
          "aria-hidden": "true",
          children: O
        }), b]
      }), p && /* @__PURE__ */ (0, r.jsx)("p", {
        className: "ara-kopf__satz",
        children: p
      })]
    }), j && /* @__PURE__ */ (0, r.jsx)("div", {
      className: "ara-kopf__aktionen",
      children: j
    })]
  });
}
function Dd({ beschriftung: b, children: O }) {
  return /* @__PURE__ */ (0, r.jsxs)("div", { children: [b && /* @__PURE__ */ (0, r.jsx)("div", {
    className: "ara-liste__beschriftung",
    children: b
  }), /* @__PURE__ */ (0, r.jsx)("ul", {
    className: "ara-liste",
    "aria-label": b,
    children: O
  })] });
}
function Ud({ titel: b, symbol: O, hinweis: p, onKlick: j, aktiv: S = !1, kennzeichen: ll }) {
  const k = /* @__PURE__ */ (0, r.jsxs)(r.Fragment, { children: [
    O && /* @__PURE__ */ (0, r.jsx)("span", {
      className: "ara-liste__symbol",
      "aria-hidden": "true",
      children: O
    }),
    /* @__PURE__ */ (0, r.jsx)("span", {
      className: "ara-liste__wort",
      children: b
    }),
    p && /* @__PURE__ */ (0, r.jsx)("span", {
      className: "ara-liste__hinweis",
      children: p
    })
  ] });
  return /* @__PURE__ */ (0, r.jsx)("li", { children: j ? /* @__PURE__ */ (0, r.jsx)("button", {
    type: "button",
    className: "ara-liste__eintrag",
    "data-aktiv": S ? "true" : "false",
    "aria-current": S ? "true" : void 0,
    "data-testid": ll,
    onClick: j,
    children: k
  }) : /* @__PURE__ */ (0, r.jsx)("div", {
    className: "ara-liste__eintrag",
    "data-aktiv": S ? "true" : "false",
    "data-testid": ll,
    children: k
  }) });
}
function Nd({ titel: b, hinweis: O, symbol: p, onKlick: j, kennzeichen: S, children: ll }) {
  const k = /* @__PURE__ */ (0, r.jsxs)(r.Fragment, { children: [(b || O || p) && /* @__PURE__ */ (0, r.jsxs)("div", {
    className: "ara-karte__kopf",
    children: [
      p && /* @__PURE__ */ (0, r.jsx)("span", {
        className: "ara-liste__symbol",
        "aria-hidden": "true",
        children: p
      }),
      b && /* @__PURE__ */ (0, r.jsx)("h2", {
        className: "ara-karte__titel",
        children: b
      }),
      O && /* @__PURE__ */ (0, r.jsx)("span", {
        className: "ara-karte__hinweis",
        children: O
      })
    ]
  }), ll && /* @__PURE__ */ (0, r.jsx)("div", {
    className: "ara-karte__inhalt",
    children: ll
  })] });
  return j ? /* @__PURE__ */ (0, r.jsx)("button", {
    type: "button",
    className: "ara-karte",
    "data-testid": S,
    onClick: j,
    children: k
  }) : /* @__PURE__ */ (0, r.jsx)("div", {
    className: "ara-karte",
    "data-testid": S,
    children: k
  });
}
function Hd({ onAbsenden: b, aktionen: O, kennzeichen: p, children: j }) {
  const S = (ll) => {
    ll.preventDefault(), b?.();
  };
  return /* @__PURE__ */ (0, r.jsxs)("form", {
    className: "ara-formular",
    "data-testid": p,
    onSubmit: S,
    noValidate: !0,
    children: [j, O && /* @__PURE__ */ (0, r.jsx)("div", {
      className: "ara-formular__aktionen",
      children: O
    })]
  });
}
function qd({ kennung: b, beschriftung: O, hinweis: p, children: j }) {
  return /* @__PURE__ */ (0, r.jsxs)("div", {
    className: "ara-feld",
    children: [
      /* @__PURE__ */ (0, r.jsx)("label", {
        className: "ara-feld__beschriftung",
        htmlFor: b,
        children: O
      }),
      j,
      p && /* @__PURE__ */ (0, r.jsx)("p", {
        className: "ara-feld__hinweis",
        children: p
      })
    ]
  });
}
function Yd({ art: b = "still", typ: O = "knopf", onKlick: p, gesperrt: j = !1, kennzeichen: S, beschriftung: ll, children: k }) {
  return /* @__PURE__ */ (0, r.jsx)("button", {
    type: O === "absenden" ? "submit" : "button",
    className: "ara-knopf",
    "data-art": b,
    "data-testid": S,
    "aria-label": ll,
    disabled: j,
    onClick: p,
    children: k
  });
}
function Bd({ art: b = "hinweis", titel: O, kennzeichen: p, children: j }) {
  return /* @__PURE__ */ (0, r.jsxs)("div", {
    className: "ara-meldung",
    "data-art": b,
    "data-testid": p,
    role: b === "fehler" ? "alert" : "status",
    children: [O && /* @__PURE__ */ (0, r.jsx)("p", {
      className: "ara-meldung__titel",
      children: O
    }), j]
  });
}
function Cd({ offen: b, onSchliessen: O, titel: p = "Menü", kennzeichen: j, children: S }) {
  const ll = (0, ba.useRef)(null);
  return (0, ba.useEffect)(() => {
    if (!b) return;
    const k = (Al) => {
      Al.key === "Escape" && O();
    };
    return document.addEventListener("keydown", k), ll.current?.querySelector("button, a, input, [tabindex]")?.focus(), () => document.removeEventListener("keydown", k);
  }, [b, O]), b ? /* @__PURE__ */ (0, r.jsxs)(r.Fragment, { children: [/* @__PURE__ */ (0, r.jsx)("button", {
    type: "button",
    className: "ara-menue__schleier",
    "aria-label": `${p} schließen`,
    onClick: O
  }), /* @__PURE__ */ (0, r.jsxs)("div", {
    className: "ara-menue",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": p,
    "data-testid": j,
    ref: ll,
    children: [/* @__PURE__ */ (0, r.jsxs)("div", {
      className: "ara-menue__kopf",
      children: [/* @__PURE__ */ (0, r.jsx)("span", { children: p }), /* @__PURE__ */ (0, r.jsx)("button", {
        type: "button",
        className: "ara-menue__zu",
        "aria-label": `${p} schließen`,
        onClick: O,
        children: "×"
      })]
    }), /* @__PURE__ */ (0, r.jsx)("div", {
      className: "ara-menue__inhalt",
      children: S
    })]
  })] }) : null;
}
var Rd = "1.0.0", pd = ba.createElement;
function jd(b, O) {
  (0, Md.createRoot)(O).render(b);
}
var Gd = ba.Fragment, rd = ba.useEffect, Xd = ba.useMemo, Qd = ba.useRef, Zd = ba.useState;
export {
  Rd as FASSUNG,
  qd as Feld,
  Hd as Formular,
  Gd as Fragment,
  Nd as Karte,
  Yd as Knopf,
  Od as Kopf,
  Dd as Liste,
  Ud as ListenEintrag,
  Bd as Meldung,
  Cd as Menue,
  pd as h,
  jd as rendern,
  rd as useEffect,
  Xd as useMemo,
  Qd as useRef,
  Zd as useState
};
