var Ut = (o, O) => () => (O || (o((O = { exports: {} }).exports, O), o = null), O.exports), gd = /* @__PURE__ */ Ut(((o) => {
  var O = Symbol.for("react.transitional.element"), C = Symbol.for("react.portal"), j = Symbol.for("react.fragment"), S = Symbol.for("react.strict_mode"), w = Symbol.for("react.profiler"), I = Symbol.for("react.consumer"), El = Symbol.for("react.context"), tl = Symbol.for("react.forward_ref"), Y = Symbol.for("react.suspense"), E = Symbol.for("react.memo"), r = Symbol.for("react.lazy"), B = Symbol.for("react.activity"), gt = Symbol.iterator;
  function Bl(y) {
    return y === null || typeof y != "object" ? null : (y = gt && y[gt] || y["@@iterator"], typeof y == "function" ? y : null);
  }
  var Cl = {
    isMounted: function() {
      return !1;
    },
    enqueueForceUpdate: function() {
    },
    enqueueReplaceState: function() {
    },
    enqueueSetState: function() {
    }
  }, Kl = Object.assign, wt = {};
  function xl(y, _, M) {
    this.props = y, this.context = _, this.refs = wt, this.updater = M || Cl;
  }
  xl.prototype.isReactComponent = {}, xl.prototype.setState = function(y, _) {
    if (typeof y != "object" && typeof y != "function" && y != null) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
    this.updater.enqueueSetState(this, y, _, "setState");
  }, xl.prototype.forceUpdate = function(y) {
    this.updater.enqueueForceUpdate(this, y, "forceUpdate");
  };
  function $t() {
  }
  $t.prototype = xl.prototype;
  function Ml(y, _, M) {
    this.props = y, this.context = _, this.refs = wt, this.updater = M || Cl;
  }
  var ot = Ml.prototype = new $t();
  ot.constructor = Ml, Kl(ot, xl.prototype), ot.isPureReactComponent = !0;
  var Jl = Array.isArray;
  function Wl() {
  }
  var $ = {
    H: null,
    A: null,
    T: null,
    S: null
  }, rl = Object.prototype.hasOwnProperty;
  function Et(y, _, M) {
    var q = M.ref;
    return {
      $$typeof: O,
      type: y,
      key: _,
      ref: q !== void 0 ? q : null,
      props: M
    };
  }
  function za(y, _) {
    return Et(y.type, _, y.props);
  }
  function wl(y) {
    return typeof y == "object" && y !== null && y.$$typeof === O;
  }
  function At(y) {
    var _ = {
      "=": "=0",
      ":": "=2"
    };
    return "$" + y.replace(/[=:]/g, function(M) {
      return _[M];
    });
  }
  var Za = /\/+/g;
  function bt(y, _) {
    return typeof y == "object" && y !== null && y.key != null ? At("" + y.key) : _.toString(36);
  }
  function U(y) {
    switch (y.status) {
      case "fulfilled":
        return y.value;
      case "rejected":
        throw y.reason;
      default:
        switch (typeof y.status == "string" ? y.then(Wl, Wl) : (y.status = "pending", y.then(function(_) {
          y.status === "pending" && (y.status = "fulfilled", y.value = _);
        }, function(_) {
          y.status === "pending" && (y.status = "rejected", y.reason = _);
        })), y.status) {
          case "fulfilled":
            return y.value;
          case "rejected":
            throw y.reason;
        }
    }
    throw y;
  }
  function A(y, _, M, q, Z) {
    var V = typeof y;
    (V === "undefined" || V === "boolean") && (y = null);
    var al = !1;
    if (y === null) al = !0;
    else switch (V) {
      case "bigint":
      case "string":
      case "number":
        al = !0;
        break;
      case "object":
        switch (y.$$typeof) {
          case O:
          case C:
            al = !0;
            break;
          case r:
            return al = y._init, A(al(y._payload), _, M, q, Z);
        }
    }
    if (al) return Z = Z(y), al = q === "" ? "." + bt(y, 0) : q, Jl(Z) ? (M = "", al != null && (M = al.replace(Za, "$&/") + "/"), A(Z, _, M, "", function(Ou) {
      return Ou;
    })) : Z != null && (wl(Z) && (Z = za(Z, M + (Z.key == null || y && y.key === Z.key ? "" : ("" + Z.key).replace(Za, "$&/") + "/") + al)), _.push(Z)), 1;
    al = 0;
    var Rl = q === "" ? "." : q + ":";
    if (Jl(y)) for (var sl = 0; sl < y.length; sl++) q = y[sl], V = Rl + bt(q, sl), al += A(q, _, M, V, Z);
    else if (sl = Bl(y), typeof sl == "function") for (y = sl.call(y), sl = 0; !(q = y.next()).done; ) q = q.value, V = Rl + bt(q, sl++), al += A(q, _, M, V, Z);
    else if (V === "object") {
      if (typeof y.then == "function") return A(U(y), _, M, q, Z);
      throw _ = String(y), Error("Objects are not valid as a React child (found: " + (_ === "[object Object]" ? "object with keys {" + Object.keys(y).join(", ") + "}" : _) + "). If you meant to render a collection of children, use an array instead.");
    }
    return al;
  }
  function D(y, _, M) {
    if (y == null) return y;
    var q = [], Z = 0;
    return A(y, q, "", "", function(V) {
      return _.call(M, V, Z++);
    }), q;
  }
  function P(y) {
    if (y._status === -1) {
      var _ = y._result;
      _ = _(), _.then(function(M) {
        (y._status === 0 || y._status === -1) && (y._status = 1, y._result = M);
      }, function(M) {
        (y._status === 0 || y._status === -1) && (y._status = 2, y._result = M);
      }), y._status === -1 && (y._status = 0, y._result = _);
    }
    if (y._status === 1) return y._result.default;
    throw y._result;
  }
  var vl = typeof reportError == "function" ? reportError : function(y) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var _ = new window.ErrorEvent("error", {
        bubbles: !0,
        cancelable: !0,
        message: typeof y == "object" && y !== null && typeof y.message == "string" ? String(y.message) : String(y),
        error: y
      });
      if (!window.dispatchEvent(_)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", y);
      return;
    }
    console.error(y);
  }, $l = {
    map: D,
    forEach: function(y, _, M) {
      D(y, function() {
        _.apply(this, arguments);
      }, M);
    },
    count: function(y) {
      var _ = 0;
      return D(y, function() {
        _++;
      }), _;
    },
    toArray: function(y) {
      return D(y, function(_) {
        return _;
      }) || [];
    },
    only: function(y) {
      if (!wl(y)) throw Error("React.Children.only expected to receive a single React element child.");
      return y;
    }
  };
  o.Activity = B, o.Children = $l, o.Component = xl, o.Fragment = j, o.Profiler = w, o.PureComponent = Ml, o.StrictMode = S, o.Suspense = Y, o.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = $, o.__COMPILER_RUNTIME = {
    __proto__: null,
    c: function(y) {
      return $.H.useMemoCache(y);
    }
  }, o.cache = function(y) {
    return function() {
      return y.apply(null, arguments);
    };
  }, o.cacheSignal = function() {
    return null;
  }, o.cloneElement = function(y, _, M) {
    if (y == null) throw Error("The argument must be a React element, but you passed " + y + ".");
    var q = Kl({}, y.props), Z = y.key;
    if (_ != null) for (V in _.key !== void 0 && (Z = "" + _.key), _) !rl.call(_, V) || V === "key" || V === "__self" || V === "__source" || V === "ref" && _.ref === void 0 || (q[V] = _[V]);
    var V = arguments.length - 2;
    if (V === 1) q.children = M;
    else if (1 < V) {
      for (var al = Array(V), Rl = 0; Rl < V; Rl++) al[Rl] = arguments[Rl + 2];
      q.children = al;
    }
    return Et(y.type, Z, q);
  }, o.createContext = function(y) {
    return y = {
      $$typeof: El,
      _currentValue: y,
      _currentValue2: y,
      _threadCount: 0,
      Provider: null,
      Consumer: null
    }, y.Provider = y, y.Consumer = {
      $$typeof: I,
      _context: y
    }, y;
  }, o.createElement = function(y, _, M) {
    var q, Z = {}, V = null;
    if (_ != null) for (q in _.key !== void 0 && (V = "" + _.key), _) rl.call(_, q) && q !== "key" && q !== "__self" && q !== "__source" && (Z[q] = _[q]);
    var al = arguments.length - 2;
    if (al === 1) Z.children = M;
    else if (1 < al) {
      for (var Rl = Array(al), sl = 0; sl < al; sl++) Rl[sl] = arguments[sl + 2];
      Z.children = Rl;
    }
    if (y && y.defaultProps) for (q in al = y.defaultProps, al) Z[q] === void 0 && (Z[q] = al[q]);
    return Et(y, V, Z);
  }, o.createRef = function() {
    return { current: null };
  }, o.forwardRef = function(y) {
    return {
      $$typeof: tl,
      render: y
    };
  }, o.isValidElement = wl, o.lazy = function(y) {
    return {
      $$typeof: r,
      _payload: {
        _status: -1,
        _result: y
      },
      _init: P
    };
  }, o.memo = function(y, _) {
    return {
      $$typeof: E,
      type: y,
      compare: _ === void 0 ? null : _
    };
  }, o.startTransition = function(y) {
    var _ = $.T, M = {};
    $.T = M;
    try {
      var q = y(), Z = $.S;
      Z !== null && Z(M, q), typeof q == "object" && q !== null && typeof q.then == "function" && q.then(Wl, vl);
    } catch (V) {
      vl(V);
    } finally {
      _ !== null && M.types !== null && (_.types = M.types), $.T = _;
    }
  }, o.unstable_useCacheRefresh = function() {
    return $.H.useCacheRefresh();
  }, o.use = function(y) {
    return $.H.use(y);
  }, o.useActionState = function(y, _, M) {
    return $.H.useActionState(y, _, M);
  }, o.useCallback = function(y, _) {
    return $.H.useCallback(y, _);
  }, o.useContext = function(y) {
    return $.H.useContext(y);
  }, o.useDebugValue = function() {
  }, o.useDeferredValue = function(y, _) {
    return $.H.useDeferredValue(y, _);
  }, o.useEffect = function(y, _) {
    return $.H.useEffect(y, _);
  }, o.useEffectEvent = function(y) {
    return $.H.useEffectEvent(y);
  }, o.useId = function() {
    return $.H.useId();
  }, o.useImperativeHandle = function(y, _, M) {
    return $.H.useImperativeHandle(y, _, M);
  }, o.useInsertionEffect = function(y, _) {
    return $.H.useInsertionEffect(y, _);
  }, o.useLayoutEffect = function(y, _) {
    return $.H.useLayoutEffect(y, _);
  }, o.useMemo = function(y, _) {
    return $.H.useMemo(y, _);
  }, o.useOptimistic = function(y, _) {
    return $.H.useOptimistic(y, _);
  }, o.useReducer = function(y, _, M) {
    return $.H.useReducer(y, _, M);
  }, o.useRef = function(y) {
    return $.H.useRef(y);
  }, o.useState = function(y) {
    return $.H.useState(y);
  }, o.useSyncExternalStore = function(y, _, M) {
    return $.H.useSyncExternalStore(y, _, M);
  }, o.useTransition = function() {
    return $.H.useTransition();
  }, o.version = "19.2.8";
})), ti = /* @__PURE__ */ Ut(((o, O) => {
  O.exports = gd();
})), od = /* @__PURE__ */ Ut(((o) => {
  function O(U, A) {
    var D = U.length;
    U.push(A);
    l: for (; 0 < D; ) {
      var P = D - 1 >>> 1, vl = U[P];
      if (0 < S(vl, A)) U[P] = A, U[D] = vl, D = P;
      else break l;
    }
  }
  function C(U) {
    return U.length === 0 ? null : U[0];
  }
  function j(U) {
    if (U.length === 0) return null;
    var A = U[0], D = U.pop();
    if (D !== A) {
      U[0] = D;
      l: for (var P = 0, vl = U.length, $l = vl >>> 1; P < $l; ) {
        var y = 2 * (P + 1) - 1, _ = U[y], M = y + 1, q = U[M];
        if (0 > S(_, D)) M < vl && 0 > S(q, _) ? (U[P] = q, U[M] = D, P = M) : (U[P] = _, U[y] = D, P = y);
        else if (M < vl && 0 > S(q, D)) U[P] = q, U[M] = D, P = M;
        else break l;
      }
    }
    return A;
  }
  function S(U, A) {
    var D = U.sortIndex - A.sortIndex;
    return D !== 0 ? D : U.id - A.id;
  }
  if (o.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
    var w = performance;
    o.unstable_now = function() {
      return w.now();
    };
  } else {
    var I = Date, El = I.now();
    o.unstable_now = function() {
      return I.now() - El;
    };
  }
  var tl = [], Y = [], E = 1, r = null, B = 3, gt = !1, Bl = !1, Cl = !1, Kl = !1, wt = typeof setTimeout == "function" ? setTimeout : null, xl = typeof clearTimeout == "function" ? clearTimeout : null, $t = typeof setImmediate < "u" ? setImmediate : null;
  function Ml(U) {
    for (var A = C(Y); A !== null; ) {
      if (A.callback === null) j(Y);
      else if (A.startTime <= U) j(Y), A.sortIndex = A.expirationTime, O(tl, A);
      else break;
      A = C(Y);
    }
  }
  function ot(U) {
    if (Cl = !1, Ml(U), !Bl) if (C(tl) !== null) Bl = !0, Jl || (Jl = !0, wl());
    else {
      var A = C(Y);
      A !== null && bt(ot, A.startTime - U);
    }
  }
  var Jl = !1, Wl = -1, $ = 5, rl = -1;
  function Et() {
    return Kl ? !0 : !(o.unstable_now() - rl < $);
  }
  function za() {
    if (Kl = !1, Jl) {
      var U = o.unstable_now();
      rl = U;
      var A = !0;
      try {
        l: {
          Bl = !1, Cl && (Cl = !1, xl(Wl), Wl = -1), gt = !0;
          var D = B;
          try {
            t: {
              for (Ml(U), r = C(tl); r !== null && !(r.expirationTime > U && Et()); ) {
                var P = r.callback;
                if (typeof P == "function") {
                  r.callback = null, B = r.priorityLevel;
                  var vl = P(r.expirationTime <= U);
                  if (U = o.unstable_now(), typeof vl == "function") {
                    r.callback = vl, Ml(U), A = !0;
                    break t;
                  }
                  r === C(tl) && j(tl), Ml(U);
                } else j(tl);
                r = C(tl);
              }
              if (r !== null) A = !0;
              else {
                var $l = C(Y);
                $l !== null && bt(ot, $l.startTime - U), A = !1;
              }
            }
            break l;
          } finally {
            r = null, B = D, gt = !1;
          }
          A = void 0;
        }
      } finally {
        A ? wl() : Jl = !1;
      }
    }
  }
  var wl;
  if (typeof $t == "function") wl = function() {
    $t(za);
  };
  else if (typeof MessageChannel < "u") {
    var At = new MessageChannel(), Za = At.port2;
    At.port1.onmessage = za, wl = function() {
      Za.postMessage(null);
    };
  } else wl = function() {
    wt(za, 0);
  };
  function bt(U, A) {
    Wl = wt(function() {
      U(o.unstable_now());
    }, A);
  }
  o.unstable_IdlePriority = 5, o.unstable_ImmediatePriority = 1, o.unstable_LowPriority = 4, o.unstable_NormalPriority = 3, o.unstable_Profiling = null, o.unstable_UserBlockingPriority = 2, o.unstable_cancelCallback = function(U) {
    U.callback = null;
  }, o.unstable_forceFrameRate = function(U) {
    0 > U || 125 < U ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : $ = 0 < U ? Math.floor(1e3 / U) : 5;
  }, o.unstable_getCurrentPriorityLevel = function() {
    return B;
  }, o.unstable_next = function(U) {
    switch (B) {
      case 1:
      case 2:
      case 3:
        var A = 3;
        break;
      default:
        A = B;
    }
    var D = B;
    B = A;
    try {
      return U();
    } finally {
      B = D;
    }
  }, o.unstable_requestPaint = function() {
    Kl = !0;
  }, o.unstable_runWithPriority = function(U, A) {
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
    var D = B;
    B = U;
    try {
      return A();
    } finally {
      B = D;
    }
  }, o.unstable_scheduleCallback = function(U, A, D) {
    var P = o.unstable_now();
    switch (typeof D == "object" && D !== null ? (D = D.delay, D = typeof D == "number" && 0 < D ? P + D : P) : D = P, U) {
      case 1:
        var vl = -1;
        break;
      case 2:
        vl = 250;
        break;
      case 5:
        vl = 1073741823;
        break;
      case 4:
        vl = 1e4;
        break;
      default:
        vl = 5e3;
    }
    return vl = D + vl, U = {
      id: E++,
      callback: A,
      priorityLevel: U,
      startTime: D,
      expirationTime: vl,
      sortIndex: -1
    }, D > P ? (U.sortIndex = D, O(Y, U), C(tl) === null && U === C(Y) && (Cl ? (xl(Wl), Wl = -1) : Cl = !0, bt(ot, D - P))) : (U.sortIndex = vl, O(tl, U), Bl || gt || (Bl = !0, Jl || (Jl = !0, wl()))), U;
  }, o.unstable_shouldYield = Et, o.unstable_wrapCallback = function(U) {
    var A = B;
    return function() {
      var D = B;
      B = A;
      try {
        return U.apply(this, arguments);
      } finally {
        B = D;
      }
    };
  };
})), bd = /* @__PURE__ */ Ut(((o, O) => {
  O.exports = od();
})), zd = /* @__PURE__ */ Ut(((o) => {
  var O = ti();
  function C(Y) {
    var E = "https://react.dev/errors/" + Y;
    if (1 < arguments.length) {
      E += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var r = 2; r < arguments.length; r++) E += "&args[]=" + encodeURIComponent(arguments[r]);
    }
    return "Minified React error #" + Y + "; visit " + E + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function j() {
  }
  var S = {
    d: {
      f: j,
      r: function() {
        throw Error(C(522));
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
  }, w = Symbol.for("react.portal");
  function I(Y, E, r) {
    var B = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return {
      $$typeof: w,
      key: B == null ? null : "" + B,
      children: Y,
      containerInfo: E,
      implementation: r
    };
  }
  var El = O.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function tl(Y, E) {
    if (Y === "font") return "";
    if (typeof E == "string") return E === "use-credentials" ? E : "";
  }
  o.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = S, o.createPortal = function(Y, E) {
    var r = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!E || E.nodeType !== 1 && E.nodeType !== 9 && E.nodeType !== 11) throw Error(C(299));
    return I(Y, E, null, r);
  }, o.flushSync = function(Y) {
    var E = El.T, r = S.p;
    try {
      if (El.T = null, S.p = 2, Y) return Y();
    } finally {
      El.T = E, S.p = r, S.d.f();
    }
  }, o.preconnect = function(Y, E) {
    typeof Y == "string" && (E ? (E = E.crossOrigin, E = typeof E == "string" ? E === "use-credentials" ? E : "" : void 0) : E = null, S.d.C(Y, E));
  }, o.prefetchDNS = function(Y) {
    typeof Y == "string" && S.d.D(Y);
  }, o.preinit = function(Y, E) {
    if (typeof Y == "string" && E && typeof E.as == "string") {
      var r = E.as, B = tl(r, E.crossOrigin), gt = typeof E.integrity == "string" ? E.integrity : void 0, Bl = typeof E.fetchPriority == "string" ? E.fetchPriority : void 0;
      r === "style" ? S.d.S(Y, typeof E.precedence == "string" ? E.precedence : void 0, {
        crossOrigin: B,
        integrity: gt,
        fetchPriority: Bl
      }) : r === "script" && S.d.X(Y, {
        crossOrigin: B,
        integrity: gt,
        fetchPriority: Bl,
        nonce: typeof E.nonce == "string" ? E.nonce : void 0
      });
    }
  }, o.preinitModule = function(Y, E) {
    if (typeof Y == "string") if (typeof E == "object" && E !== null) {
      if (E.as == null || E.as === "script") {
        var r = tl(E.as, E.crossOrigin);
        S.d.M(Y, {
          crossOrigin: r,
          integrity: typeof E.integrity == "string" ? E.integrity : void 0,
          nonce: typeof E.nonce == "string" ? E.nonce : void 0
        });
      }
    } else E ?? S.d.M(Y);
  }, o.preload = function(Y, E) {
    if (typeof Y == "string" && typeof E == "object" && E !== null && typeof E.as == "string") {
      var r = E.as, B = tl(r, E.crossOrigin);
      S.d.L(Y, r, {
        crossOrigin: B,
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
  }, o.preloadModule = function(Y, E) {
    if (typeof Y == "string") if (E) {
      var r = tl(E.as, E.crossOrigin);
      S.d.m(Y, {
        as: typeof E.as == "string" && E.as !== "script" ? E.as : void 0,
        crossOrigin: r,
        integrity: typeof E.integrity == "string" ? E.integrity : void 0
      });
    } else S.d.m(Y);
  }, o.requestFormReset = function(Y) {
    S.d.r(Y);
  }, o.unstable_batchedUpdates = function(Y, E) {
    return Y(E);
  }, o.useFormState = function(Y, E, r) {
    return El.H.useFormState(Y, E, r);
  }, o.useFormStatus = function() {
    return El.H.useHostTransitionStatus();
  }, o.version = "19.2.8";
})), Td = /* @__PURE__ */ Ut(((o, O) => {
  function C() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(C);
      } catch (j) {
        console.error(j);
      }
  }
  C(), O.exports = zd();
})), _d = /* @__PURE__ */ Ut(((o) => {
  var O = bd(), C = ti(), j = Td();
  function S(l) {
    var t = "https://react.dev/errors/" + l;
    if (1 < arguments.length) {
      t += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var a = 2; a < arguments.length; a++) t += "&args[]=" + encodeURIComponent(arguments[a]);
    }
    return "Minified React error #" + l + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function w(l) {
    return !(!l || l.nodeType !== 1 && l.nodeType !== 9 && l.nodeType !== 11);
  }
  function I(l) {
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
  function El(l) {
    if (l.tag === 13) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function tl(l) {
    if (l.tag === 31) {
      var t = l.memoizedState;
      if (t === null && (l = l.alternate, l !== null && (t = l.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function Y(l) {
    if (I(l) !== l) throw Error(S(188));
  }
  function E(l) {
    var t = l.alternate;
    if (!t) {
      if (t = I(l), t === null) throw Error(S(188));
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
          if (e === a) return Y(n), l;
          if (e === u) return Y(n), t;
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
  function r(l) {
    var t = l.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return l;
    for (l = l.child; l !== null; ) {
      if (t = r(l), t !== null) return t;
      l = l.sibling;
    }
    return null;
  }
  var B = Object.assign, gt = Symbol.for("react.element"), Bl = Symbol.for("react.transitional.element"), Cl = Symbol.for("react.portal"), Kl = Symbol.for("react.fragment"), wt = Symbol.for("react.strict_mode"), xl = Symbol.for("react.profiler"), $t = Symbol.for("react.consumer"), Ml = Symbol.for("react.context"), ot = Symbol.for("react.forward_ref"), Jl = Symbol.for("react.suspense"), Wl = Symbol.for("react.suspense_list"), $ = Symbol.for("react.memo"), rl = Symbol.for("react.lazy"), Et = Symbol.for("react.activity"), za = Symbol.for("react.memo_cache_sentinel"), wl = Symbol.iterator;
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
      case wt:
        return "StrictMode";
      case Jl:
        return "Suspense";
      case Wl:
        return "SuspenseList";
      case Et:
        return "Activity";
    }
    if (typeof l == "object") switch (l.$$typeof) {
      case Cl:
        return "Portal";
      case Ml:
        return l.displayName || "Context";
      case $t:
        return (l._context.displayName || "Context") + ".Consumer";
      case ot:
        var t = l.render;
        return l = l.displayName, l || (l = t.displayName || t.name || "", l = l !== "" ? "ForwardRef(" + l + ")" : "ForwardRef"), l;
      case $:
        return t = l.displayName || null, t !== null ? t : bt(l.type) || "Memo";
      case rl:
        t = l._payload, l = l._init;
        try {
          return bt(l(t));
        } catch {
        }
    }
    return null;
  }
  var U = Array.isArray, A = C.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, D = j.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, P = {
    pending: !1,
    data: null,
    method: null,
    action: null
  }, vl = [], $l = -1;
  function y(l) {
    return { current: l };
  }
  function _(l) {
    0 > $l || (l.current = vl[$l], vl[$l] = null, $l--);
  }
  function M(l, t) {
    $l++, vl[$l] = l.current, l.current = t;
  }
  var q = y(null), Z = y(null), V = y(null), al = y(null);
  function Rl(l, t) {
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
    _(q), M(q, l);
  }
  function sl() {
    _(q), _(Z), _(V);
  }
  function Ou(l) {
    l.memoizedState !== null && M(al, l);
    var t = q.current, a = D1(t, l.type);
    t !== a && (M(Z, l), M(q, a));
  }
  function zn(l) {
    Z.current === l && (_(q), _(Z)), al.current === l && (_(al), sn._currentValue = P);
  }
  var je, ai;
  function Ta(l) {
    if (je === void 0) try {
      throw Error();
    } catch (a) {
      var t = a.stack.trim().match(/\n( *(at )?)/);
      je = t && t[1] || "", ai = -1 < a.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < a.stack.indexOf("@") ? "@unknown:0:0" : "";
    }
    return `
` + je + l + ai;
  }
  var Ge = !1;
  function Xe(l, t) {
    if (!l || Ge) return "";
    Ge = !0;
    var a = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var u = { DetermineComponentFrameRoot: function() {
        try {
          if (t) {
            var T = function() {
              throw Error();
            };
            if (Object.defineProperty(T.prototype, "props", { set: function() {
              throw Error();
            } }), typeof Reflect == "object" && Reflect.construct) {
              try {
                Reflect.construct(T, []);
              } catch (g) {
                var s = g;
              }
              Reflect.construct(l, [], T);
            } else {
              try {
                T.call();
              } catch (g) {
                s = g;
              }
              l.call(T.prototype);
            }
          } else {
            try {
              throw Error();
            } catch (g) {
              s = g;
            }
            (T = l()) && typeof T.catch == "function" && T.catch(function() {
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
              var b = `
` + i[u].replace(" at new ", " at ");
              return l.displayName && b.includes("<anonymous>") && (b = b.replace("<anonymous>", l.displayName)), b;
            }
          while (1 <= u && 0 <= n);
          break;
        }
      }
    } finally {
      Ge = !1, Error.prepareStackTrace = a;
    }
    return (a = l ? l.displayName || l.name : "") ? Ta(a) : "";
  }
  function ly(l, t) {
    switch (l.tag) {
      case 26:
      case 27:
      case 5:
        return Ta(l.type);
      case 16:
        return Ta("Lazy");
      case 13:
        return l.child !== t && t !== null ? Ta("Suspense Fallback") : Ta("Suspense");
      case 19:
        return Ta("SuspenseList");
      case 0:
      case 15:
        return Xe(l.type, !1);
      case 11:
        return Xe(l.type.render, !1);
      case 1:
        return Xe(l.type, !0);
      case 31:
        return Ta("Activity");
      default:
        return "";
    }
  }
  function ui(l) {
    try {
      var t = "", a = null;
      do
        t += ly(l, a), a = l, l = l.return;
      while (l);
      return t;
    } catch (u) {
      return `
Error generating stack: ` + u.message + `
` + u.stack;
    }
  }
  var Qe = Object.prototype.hasOwnProperty, Ze = O.unstable_scheduleCallback, Ve = O.unstable_cancelCallback, ty = O.unstable_shouldYield, ay = O.unstable_requestPaint, Fl = O.unstable_now, uy = O.unstable_getCurrentPriorityLevel, ni = O.unstable_ImmediatePriority, ei = O.unstable_UserBlockingPriority, Tn = O.unstable_NormalPriority, ny = O.unstable_LowPriority, fi = O.unstable_IdlePriority, ey = O.log, fy = O.unstable_setDisableYieldValue, Du = null, kl = null;
  function Ft(l) {
    if (typeof ey == "function" && fy(l), kl && typeof kl.setStrictMode == "function") try {
      kl.setStrictMode(Du, l);
    } catch {
    }
  }
  var Il = Math.clz32 ? Math.clz32 : vy, cy = Math.log, iy = Math.LN2;
  function vy(l) {
    return l >>>= 0, l === 0 ? 32 : 31 - (cy(l) / iy | 0) | 0;
  }
  var _n = 256, En = 262144, An = 4194304;
  function _a(l) {
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
    return c !== 0 ? (u = c & ~e, u !== 0 ? n = _a(u) : (f &= c, f !== 0 ? n = _a(f) : a || (a = c & ~l, a !== 0 && (n = _a(a))))) : (c = u & ~e, c !== 0 ? n = _a(c) : f !== 0 ? n = _a(f) : a || (a = u & ~l, a !== 0 && (n = _a(a)))), n === 0 ? 0 : t !== 0 && t !== n && (t & e) === 0 && (e = n & -n, a = t & -t, e >= a || e === 32 && (a & 4194048) !== 0) ? t : n;
  }
  function Uu(l, t) {
    return (l.pendingLanes & ~(l.suspendedLanes & ~l.pingedLanes) & t) === 0;
  }
  function yy(l, t) {
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
  function my(l, t, a, u, n, e) {
    var f = l.pendingLanes;
    l.pendingLanes = a, l.suspendedLanes = 0, l.pingedLanes = 0, l.warmLanes = 0, l.expiredLanes &= a, l.entangledLanes &= a, l.errorRecoveryDisabledLanes &= a, l.shellSuspendCounter = 0;
    var c = l.entanglements, i = l.expirationTimes, h = l.hiddenUpdates;
    for (a = f & ~a; 0 < a; ) {
      var b = 31 - Il(a), T = 1 << b;
      c[b] = 0, i[b] = -1;
      var s = h[b];
      if (s !== null) for (h[b] = null, b = 0; b < s.length; b++) {
        var g = s[b];
        g !== null && (g.lane &= -536870913);
      }
      a &= ~T;
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
  var kt = Math.random().toString(36).slice(2), Ul = "__reactFiber$" + kt, jl = "__reactProps$" + kt, Nu = "__reactContainer$" + kt, xe = "__reactEvents$" + kt, dy = "__reactListeners$" + kt, hy = "__reactHandles$" + kt, Si = "__reactResources$" + kt, Hu = "__reactMarker$" + kt;
  function Je(l) {
    delete l[Ul], delete l[jl], delete l[xe], delete l[dy], delete l[hy];
  }
  function Va(l) {
    var t = l[Ul];
    if (t) return t;
    for (var a = l.parentNode; a; ) {
      if (t = a[Nu] || a[Ul]) {
        if (a = t.alternate, t.child !== null || a !== null && a.child !== null) for (l = R1(l); l !== null; ) {
          if (a = l[Ul]) return a;
          l = R1(l);
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
  var Sy = RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), oi = {}, bi = {};
  function sy(l) {
    return Qe.call(bi, l) ? !0 : Qe.call(oi, l) ? !1 : Sy.test(l) ? bi[l] = !0 : (oi[l] = !0, !1);
  }
  function Dn(l, t, a) {
    if (sy(t)) if (a === null) l.removeAttribute(t);
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
  function gy(l, t, a) {
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
      l._valueTracker = gy(l, t, "" + l[t]);
    }
  }
  function Ti(l) {
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
  var oy = /[\n"\\]/g;
  function ft(l) {
    return l.replace(oy, function(t) {
      return "\\" + t.charCodeAt(0).toString(16) + " ";
    });
  }
  function we(l, t, a, u, n, e, f, c) {
    l.name = "", f != null && typeof f != "function" && typeof f != "symbol" && typeof f != "boolean" ? l.type = f : l.removeAttribute("type"), t != null ? f === "number" ? (t === 0 && l.value === "" || l.value != t) && (l.value = "" + et(t)) : l.value !== "" + et(t) && (l.value = "" + et(t)) : f !== "submit" && f !== "reset" || l.removeAttribute("value"), t != null ? $e(l, f, et(t)) : a != null ? $e(l, f, et(a)) : u != null && l.removeAttribute("value"), n == null && e != null && (l.defaultChecked = !!e), n != null && (l.checked = n && typeof n != "function" && typeof n != "symbol"), c != null && typeof c != "function" && typeof c != "symbol" && typeof c != "boolean" ? l.name = "" + et(c) : l.removeAttribute("name");
  }
  function _i(l, t, a, u, n, e, f, c) {
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
  var by = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));
  function Mi(l, t, a) {
    var u = t.indexOf("--") === 0;
    a == null || typeof a == "boolean" || a === "" ? u ? l.setProperty(t, "") : t === "float" ? l.cssFloat = "" : l[t] = "" : u ? l.setProperty(t, a) : typeof a != "number" || a === 0 || by.has(t) ? t === "float" ? l.cssFloat = a : l[t] = ("" + a).trim() : l[t] = a + "px";
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
  var zy = /* @__PURE__ */ new Map([
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
  ]), Ty = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function Hn(l) {
    return Ty.test("" + l) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : l;
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
      var a = l[jl] || null;
      l: switch (l = t.stateNode, t.type) {
        case "input":
          if (we(l, a.value, a.defaultValue, a.defaultValue, a.checked, a.defaultChecked, a.type, a.name), t = a.name, a.type === "radio" && t != null) {
            for (a = l; a.parentNode; ) a = a.parentNode;
            for (a = a.querySelectorAll('input[name="' + ft("" + t) + '"][type="radio"]'), t = 0; t < a.length; t++) {
              var u = a[t];
              if (u !== l && u.form === l.form) {
                var n = u[jl] || null;
                if (!n) throw Error(S(90));
                we(u, n.value, n.defaultValue, n.defaultValue, n.checked, n.defaultChecked, n.type, n.name);
              }
            }
            for (t = 0; t < a.length; t++) u = a[t], u.form === l.form && Ti(u);
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
    var u = a[jl] || null;
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
  var It = null, tf = null, qn = null;
  function Ni() {
    if (qn) return qn;
    var l, t = tf, a = t.length, u, n = "value" in It ? It.value : It.textContent, e = n.length;
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
  function Gl(l) {
    function t(a, u, n, e, f) {
      this._reactName = a, this._targetInst = n, this.type = u, this.nativeEvent = e, this.target = f, this.currentTarget = null;
      for (var c in l) l.hasOwnProperty(c) && (a = l[c], this[c] = a ? a(e) : e[c]);
      return this.isDefaultPrevented = (e.defaultPrevented != null ? e.defaultPrevented : e.returnValue === !1) ? Bn : Hi, this.isPropagationStopped = Hi, this;
    }
    return B(t.prototype, {
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
  }, Rn = Gl(Aa), Ru = B({}, Aa, {
    view: 0,
    detail: 0
  }), _y = Gl(Ru), af, uf, pu, pn = B({}, Ru, {
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
      return "movementX" in l ? l.movementX : (l !== pu && (pu && l.type === "mousemove" ? (af = l.screenX - pu.screenX, uf = l.screenY - pu.screenY) : uf = af = 0, pu = l), af);
    },
    movementY: function(l) {
      return "movementY" in l ? l.movementY : uf;
    }
  }), qi = Gl(pn), Ey = Gl(B({}, pn, { dataTransfer: 0 })), nf = Gl(B({}, Ru, { relatedTarget: 0 })), Ay = Gl(B({}, Aa, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  })), My = Gl(B({}, Aa, { clipboardData: function(l) {
    return "clipboardData" in l ? l.clipboardData : window.clipboardData;
  } })), Yi = Gl(B({}, Aa, { data: 0 })), Oy = {
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
  }, Dy = {
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
  }, Uy = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  function Ny(l) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(l) : (l = Uy[l]) ? !!t[l] : !1;
  }
  function ef() {
    return Ny;
  }
  var Hy = Gl(B({}, Ru, {
    key: function(l) {
      if (l.key) {
        var t = Oy[l.key] || l.key;
        if (t !== "Unidentified") return t;
      }
      return l.type === "keypress" ? (l = Yn(l), l === 13 ? "Enter" : String.fromCharCode(l)) : l.type === "keydown" || l.type === "keyup" ? Dy[l.keyCode] || "Unidentified" : "";
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
  })), Bi = Gl(B({}, pn, {
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
  })), qy = Gl(B({}, Ru, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: ef
  })), Yy = Gl(B({}, Aa, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  })), By = Gl(B({}, pn, {
    deltaX: function(l) {
      return "deltaX" in l ? l.deltaX : "wheelDeltaX" in l ? -l.wheelDeltaX : 0;
    },
    deltaY: function(l) {
      return "deltaY" in l ? l.deltaY : "wheelDeltaY" in l ? -l.wheelDeltaY : "wheelDelta" in l ? -l.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  })), Ry = Gl(B({}, Aa, {
    newState: 0,
    oldState: 0
  })), py = [
    9,
    13,
    27,
    32
  ], ff = qt && "CompositionEvent" in window, Cu = null;
  qt && "documentMode" in document && (Cu = document.documentMode);
  var Cy = qt && "TextEvent" in window && !Cu, Ri = qt && (!ff || Cu && 8 < Cu && 11 >= Cu), pi = " ", Ci = !1;
  function ri(l, t) {
    switch (l) {
      case "keyup":
        return py.indexOf(t.keyCode) !== -1;
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
  function ji(l) {
    return l = l.detail, typeof l == "object" && "data" in l ? l.data : null;
  }
  var Fa = !1;
  function ry(l, t) {
    switch (l) {
      case "compositionend":
        return ji(t);
      case "keypress":
        return t.which !== 32 ? null : (Ci = !0, pi);
      case "textInput":
        return l = t.data, l === pi && Ci ? null : l;
      default:
        return null;
    }
  }
  function jy(l, t) {
    if (Fa) return l === "compositionend" || !ff && ri(l, t) ? (l = Ni(), qn = tf = It = null, Fa = !1, l) : null;
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
        return Ri && t.locale !== "ko" ? null : t.data;
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
  function Gi(l) {
    var t = l && l.nodeName && l.nodeName.toLowerCase();
    return t === "input" ? !!Gy[l.type] : t === "textarea";
  }
  function Xi(l, t, a, u) {
    wa ? $a ? $a.push(u) : $a = [u] : wa = u, t = Ae(t, "onChange"), 0 < t.length && (a = new Rn("onChange", "change", null, a, u), l.push({
      event: a,
      listeners: t
    }));
  }
  var ru = null, ju = null;
  function Xy(l) {
    b1(l, 0);
  }
  function Cn(l) {
    if (Ti(qu(l))) return l;
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
    ru && (ru.detachEvent("onpropertychange", Ki), ju = ru = null);
  }
  function Ki(l) {
    if (l.propertyName === "value" && Cn(ju)) {
      var t = [];
      Xi(t, ju, l, Ie(l)), Ui(Xy, t);
    }
  }
  function Qy(l, t, a) {
    l === "focusin" ? (Li(), ru = t, ju = a, ru.attachEvent("onpropertychange", Ki)) : l === "focusout" && Li();
  }
  function Zy(l) {
    if (l === "selectionchange" || l === "keyup" || l === "keydown") return Cn(ju);
  }
  function Vy(l, t) {
    if (l === "click") return Cn(t);
  }
  function Ly(l, t) {
    if (l === "input" || l === "change") return Cn(t);
  }
  function Ky(l, t) {
    return l === t && (l !== 0 || 1 / l === 1 / t) || l !== l && t !== t;
  }
  var Pl = typeof Object.is == "function" ? Object.is : Ky;
  function Gu(l, t) {
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
  var xy = qt && "documentMode" in document && 11 >= document.documentMode, ka = null, mf = null, Xu = null, df = !1;
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
    }), Xu && Gu(Xu, u) || (Xu = u, u = Ae(mf, "onSelect"), 0 < u.length && (t = new Rn("onSelect", "select", null, t, a), l.push({
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
  var ki = Oa("animationend"), Ii = Oa("animationiteration"), Pi = Oa("animationstart"), Jy = Oa("transitionrun"), Wy = Oa("transitionstart"), wy = Oa("transitioncancel"), l0 = Oa("transitionend"), t0 = /* @__PURE__ */ new Map(), Sf = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
  Sf.push("scrollEnd");
  function zt(l, t) {
    t0.set(l, t), Ea(t, [l]);
  }
  var rn = typeof reportError == "function" ? reportError : function(l) {
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
  function jn() {
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
  function Gn(l, t, a, u) {
    ct[Pa++] = l, ct[Pa++] = t, ct[Pa++] = a, ct[Pa++] = u, sf |= u, l.lanes |= u, l = l.alternate, l !== null && (l.lanes |= u);
  }
  function gf(l, t, a, u) {
    return Gn(l, t, a, u), Xn(l);
  }
  function Da(l, t) {
    return Gn(l, null, null, t), Xn(l);
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
  function $y(l, t, a, u) {
    this.tag = l, this.key = a, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = u, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function lt(l, t, a, u) {
    return new $y(l, t, a, u);
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
    else if (typeof l == "string") f = td(l, a, q.current) ? 26 : l === "html" || l === "head" || l === "body" ? 27 : 5;
    else l: switch (l) {
      case Et:
        return l = lt(31, a, t, n), l.elementType = Et, l.lanes = e, l;
      case Kl:
        return Ua(a.children, n, e, t);
      case wt:
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
          case $t:
            f = 9;
            break l;
          case ot:
            f = 11;
            break l;
          case $:
            f = 14;
            break l;
          case rl:
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
  var tu = [], au = 0, Zn = null, Qu = 0, vt = [], yt = 0, Pt = null, Mt = 1, Ot = "";
  function Bt(l, t) {
    tu[au++] = Qu, tu[au++] = Zn, Zn = l, Qu = t;
  }
  function f0(l, t, a) {
    vt[yt++] = Mt, vt[yt++] = Ot, vt[yt++] = Pt, Pt = l;
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
  function Tf(l) {
    l.return !== null && (Bt(l, 1), f0(l, 1, 0));
  }
  function _f(l) {
    for (; l === Zn; ) Zn = tu[--au], tu[au] = null, Qu = tu[--au], tu[au] = null;
    for (; l === Pt; ) Pt = vt[--yt], vt[yt] = null, Ot = vt[--yt], vt[yt] = null, Mt = vt[--yt], vt[yt] = null;
  }
  function c0(l, t) {
    vt[yt++] = Mt, vt[yt++] = Ot, vt[yt++] = Pt, Mt = t.id, Ot = t.overflow, Pt = l;
  }
  var Nl = null, yl = null, W = !1, la = null, mt = !1, Ef = Error(S(519));
  function ta(l) {
    throw Zu(it(Error(S(418, 1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML", "")), l)), Ef;
  }
  function i0(l) {
    var t = l.stateNode, a = l.type, u = l.memoizedProps;
    switch (t[Ul] = l, t[jl] = u, a) {
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
        K("invalid", t), _i(t, u.value, u.defaultValue, u.checked, u.defaultChecked, u.type, u.name, !0);
        break;
      case "select":
        K("invalid", t);
        break;
      case "textarea":
        K("invalid", t), Ai(t, u.value, u.defaultValue, u.children);
    }
    a = u.children, typeof a != "string" && typeof a != "number" && typeof a != "bigint" || t.textContent === "" + a || u.suppressHydrationWarning === !0 || A1(t.textContent, a) ? (u.popover != null && (K("beforetoggle", t), K("toggle", t)), u.onScroll != null && K("scroll", t), u.onScrollEnd != null && K("scrollend", t), u.onClick != null && (t.onclick = Ht), t = !0) : t = !1, t || ta(l, !0);
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
    if ((a = t !== 3 && t !== 27) && ((a = t === 5) && (a = l.type, a = !(a !== "form" && a !== "button") || Xc(l.type, l.memoizedProps)), a = !a), a && yl && ta(l), v0(l), t === 13) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(S(317));
      yl = B1(l);
    } else if (t === 31) {
      if (l = l.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(S(317));
      yl = B1(l);
    } else t === 27 ? (t = yl, ha(l.type) ? (l = Kc, Kc = null, yl = l) : yl = t) : yl = Nl ? St(l.stateNode.nextSibling) : null;
    return !0;
  }
  function Na() {
    yl = Nl = null, W = !1;
  }
  function Af() {
    var l = la;
    return l !== null && (Vl === null ? Vl = l : Vl.push.apply(Vl, l), la = null), l;
  }
  function Zu(l) {
    la === null ? la = [l] : la.push(l);
  }
  var Mf = y(null), Ha = null, Rt = null;
  function aa(l, t, a) {
    M(Mf, t._currentValue), t._currentValue = a;
  }
  function pt(l) {
    l._currentValue = Mf.current, _(Mf);
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
      } else if (n === al.current) {
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
    Ha = l, Rt = null, l = l.dependencies, l !== null && (l.firstContext = null);
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
    }, Rt === null) {
      if (l === null) throw Error(S(308));
      Rt = t, l.dependencies = {
        lanes: 0,
        firstContext: t
      }, l.flags |= 524288;
    } else Rt = Rt.next = t;
    return a;
  }
  var Fy = typeof AbortController < "u" ? AbortController : function() {
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
  }, ky = O.unstable_scheduleCallback, Iy = O.unstable_NormalPriority, bl = {
    $$typeof: Ml,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  function Uf() {
    return {
      controller: new Fy(),
      data: /* @__PURE__ */ new Map(),
      refCount: 0
    };
  }
  function Vu(l) {
    l.refCount--, l.refCount === 0 && ky(Iy, function() {
      l.controller.abort();
    });
  }
  var Lu = null, Nf = 0, eu = 0, fu = null;
  function Py(l, t) {
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
  function lm(l, t) {
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
    Jv = Fl(), typeof t == "object" && t !== null && typeof t.then == "function" && Py(l, t), d0 !== null && d0(l, t);
  };
  var Ya = y(null);
  function Hf() {
    var l = Ya.current;
    return l !== null ? l : il.pooledCache;
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
          if (l = il, l !== null && 100 < l.shellSuspendCounter) throw Error(S(482));
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
        throw Ra = t, cu;
    }
  }
  function Ba(l) {
    try {
      var t = l._init;
      return t(l._payload);
    } catch (a) {
      throw a !== null && typeof a == "object" && typeof a.then == "function" ? (Ra = a, cu) : a;
    }
  }
  var Ra = null;
  function g0() {
    if (Ra === null) throw Error(S(459));
    var l = Ra;
    return Ra = null, l;
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
      var R = d.type;
      return R === Kl ? b(m, v, d.props.children, z, d.key) : v !== null && (v.elementType === R || typeof R == "object" && R !== null && R.$$typeof === rl && Ba(R) === v.type) ? (v = n(v, d.props), xu(v, d), v.return = m, v) : (v = Qn(d.type, d.key, d.props, null, m.mode, z), xu(v, d), v.return = m, v);
    }
    function h(m, v, d, z) {
      return v === null || v.tag !== 4 || v.stateNode.containerInfo !== d.containerInfo || v.stateNode.implementation !== d.implementation ? (v = zf(d, m.mode, z), v.return = m, v) : (v = n(v, d.children || []), v.return = m, v);
    }
    function b(m, v, d, z, R) {
      return v === null || v.tag !== 7 ? (v = Ua(d, m.mode, z, R), v.return = m, v) : (v = n(v, d), v.return = m, v);
    }
    function T(m, v, d) {
      if (typeof v == "string" && v !== "" || typeof v == "number" || typeof v == "bigint") return v = bf("" + v, m.mode, d), v.return = m, v;
      if (typeof v == "object" && v !== null) {
        switch (v.$$typeof) {
          case Bl:
            return d = Qn(v.type, v.key, v.props, null, m.mode, d), xu(d, v), d.return = m, d;
          case Cl:
            return v = zf(v, m.mode, d), v.return = m, v;
          case rl:
            return v = Ba(v), T(m, v, d);
        }
        if (U(v) || At(v)) return v = Ua(v, m.mode, d, null), v.return = m, v;
        if (typeof v.then == "function") return T(m, Wn(v), d);
        if (v.$$typeof === Ml) return T(m, Ln(m, v), d);
        wn(m, v);
      }
      return null;
    }
    function s(m, v, d, z) {
      var R = v !== null ? v.key : null;
      if (typeof d == "string" && d !== "" || typeof d == "number" || typeof d == "bigint") return R !== null ? null : c(m, v, "" + d, z);
      if (typeof d == "object" && d !== null) {
        switch (d.$$typeof) {
          case Bl:
            return d.key === R ? i(m, v, d, z) : null;
          case Cl:
            return d.key === R ? h(m, v, d, z) : null;
          case rl:
            return d = Ba(d), s(m, v, d, z);
        }
        if (U(d) || At(d)) return R !== null ? null : b(m, v, d, z, null);
        if (typeof d.then == "function") return s(m, v, Wn(d), z);
        if (d.$$typeof === Ml) return s(m, v, Ln(m, d), z);
        wn(m, d);
      }
      return null;
    }
    function g(m, v, d, z, R) {
      if (typeof z == "string" && z !== "" || typeof z == "number" || typeof z == "bigint") return m = m.get(d) || null, c(v, m, "" + z, R);
      if (typeof z == "object" && z !== null) {
        switch (z.$$typeof) {
          case Bl:
            return m = m.get(z.key === null ? d : z.key) || null, i(v, m, z, R);
          case Cl:
            return m = m.get(z.key === null ? d : z.key) || null, h(v, m, z, R);
          case rl:
            return z = Ba(z), g(m, v, d, z, R);
        }
        if (U(z) || At(z)) return m = m.get(d) || null, b(v, m, z, R, null);
        if (typeof z.then == "function") return g(m, v, d, Wn(z), R);
        if (z.$$typeof === Ml) return g(m, v, d, Ln(v, z), R);
        wn(v, z);
      }
      return null;
    }
    function N(m, v, d, z) {
      for (var R = null, F = null, H = v, Q = v = 0, J = null; H !== null && Q < d.length; Q++) {
        H.index > Q ? (J = H, H = null) : J = H.sibling;
        var k = s(m, H, d[Q], z);
        if (k === null) {
          H === null && (H = J);
          break;
        }
        l && H && k.alternate === null && t(m, H), v = e(k, v, Q), F === null ? R = k : F.sibling = k, F = k, H = J;
      }
      if (Q === d.length) return a(m, H), W && Bt(m, Q), R;
      if (H === null) {
        for (; Q < d.length; Q++) H = T(m, d[Q], z), H !== null && (v = e(H, v, Q), F === null ? R = H : F.sibling = H, F = H);
        return W && Bt(m, Q), R;
      }
      for (H = u(H); Q < d.length; Q++) J = g(H, m, Q, d[Q], z), J !== null && (l && J.alternate !== null && H.delete(J.key === null ? Q : J.key), v = e(J, v, Q), F === null ? R = J : F.sibling = J, F = J);
      return l && H.forEach(function(ba) {
        return t(m, ba);
      }), W && Bt(m, Q), R;
    }
    function p(m, v, d, z) {
      if (d == null) throw Error(S(151));
      for (var R = null, F = null, H = v, Q = v = 0, J = null, k = d.next(); H !== null && !k.done; Q++, k = d.next()) {
        H.index > Q ? (J = H, H = null) : J = H.sibling;
        var ba = s(m, H, k.value, z);
        if (ba === null) {
          H === null && (H = J);
          break;
        }
        l && H && ba.alternate === null && t(m, H), v = e(ba, v, Q), F === null ? R = ba : F.sibling = ba, F = ba, H = J;
      }
      if (k.done) return a(m, H), W && Bt(m, Q), R;
      if (H === null) {
        for (; !k.done; Q++, k = d.next()) k = T(m, k.value, z), k !== null && (v = e(k, v, Q), F === null ? R = k : F.sibling = k, F = k);
        return W && Bt(m, Q), R;
      }
      for (H = u(H); !k.done; Q++, k = d.next()) k = g(H, m, Q, k.value, z), k !== null && (l && k.alternate !== null && H.delete(k.key === null ? Q : k.key), v = e(k, v, Q), F === null ? R = k : F.sibling = k, F = k);
      return l && H.forEach(function(sd) {
        return t(m, sd);
      }), W && Bt(m, Q), R;
    }
    function cl(m, v, d, z) {
      if (typeof d == "object" && d !== null && d.type === Kl && d.key === null && (d = d.props.children), typeof d == "object" && d !== null) {
        switch (d.$$typeof) {
          case Bl:
            l: {
              for (var R = d.key; v !== null; ) {
                if (v.key === R) {
                  if (R = d.type, R === Kl) {
                    if (v.tag === 7) {
                      a(m, v.sibling), z = n(v, d.props.children), z.return = m, m = z;
                      break l;
                    }
                  } else if (v.elementType === R || typeof R == "object" && R !== null && R.$$typeof === rl && Ba(R) === v.type) {
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
          case Cl:
            l: {
              for (R = d.key; v !== null; ) {
                if (v.key === R) if (v.tag === 4 && v.stateNode.containerInfo === d.containerInfo && v.stateNode.implementation === d.implementation) {
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
          case rl:
            return d = Ba(d), cl(m, v, d, z);
        }
        if (U(d)) return N(m, v, d, z);
        if (At(d)) {
          if (R = At(d), typeof R != "function") throw Error(S(150));
          return d = R.call(d), p(m, v, d, z);
        }
        if (typeof d.then == "function") return cl(m, v, Wn(d), z);
        if (d.$$typeof === Ml) return cl(m, v, Ln(m, d), z);
        wn(m, d);
      }
      return typeof d == "string" && d !== "" || typeof d == "number" || typeof d == "bigint" ? (d = "" + d, v !== null && v.tag === 6 ? (a(m, v.sibling), z = n(v, d), z.return = m, m = z) : (a(m, v), z = bf(d, m.mode, z), z.return = m, m = z), f(m)) : a(m, v);
    }
    return function(m, v, d, z) {
      try {
        Ku = 0;
        var R = cl(m, v, d, z);
        return iu = null, R;
      } catch (H) {
        if (H === cu || H === xn) throw H;
        var F = lt(29, H, null, m.mode);
        return F.lanes = z, F.return = m, F;
      }
    };
  }
  var pa = b0(!0), z0 = b0(!1), ua = !1;
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
  function Ca(l) {
    return {
      lane: l,
      tag: 0,
      payload: null,
      callback: null,
      next: null
    };
  }
  function ra(l, t, a) {
    var u = l.updateQueue;
    if (u === null) return null;
    if (u = u.shared, (ll & 2) !== 0) {
      var n = u.pending;
      return n === null ? t.next = t : (t.next = n.next, n.next = t), u.pending = t, t = Xn(l), a0(l, null, a), t;
    }
    return Gn(l, u, t, a), Xn(l);
  }
  function Ju(l, t, a) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (a & 4194048) !== 0)) {
      var u = t.lanes;
      u &= l.pendingLanes, a |= u, t.lanes = a, vi(l, a);
    }
  }
  function Rf(l, t) {
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
  var pf = !1;
  function Wu() {
    if (pf) {
      var l = fu;
      if (l !== null) throw l;
    }
  }
  function wu(l, t, a, u) {
    pf = !1;
    var n = l.updateQueue;
    ua = !1;
    var e = n.firstBaseUpdate, f = n.lastBaseUpdate, c = n.shared.pending;
    if (c !== null) {
      n.shared.pending = null;
      var i = c, h = i.next;
      i.next = null, f === null ? e = h : f.next = h, f = i;
      var b = l.alternate;
      b !== null && (b = b.updateQueue, c = b.lastBaseUpdate, c !== f && (c === null ? b.firstBaseUpdate = h : c.next = h, b.lastBaseUpdate = i));
    }
    if (e !== null) {
      var T = n.baseState;
      f = 0, b = h = i = null, c = e;
      do {
        var s = c.lane & -536870913, g = s !== c.lane;
        if (g ? (x & s) === s : (u & s) === s) {
          s !== 0 && s === eu && (pf = !0), b !== null && (b = b.next = {
            lane: 0,
            tag: c.tag,
            payload: c.payload,
            callback: null,
            next: null
          });
          l: {
            var N = l, p = c;
            s = t;
            var cl = a;
            switch (p.tag) {
              case 1:
                if (N = p.payload, typeof N == "function") {
                  T = N.call(cl, T, s);
                  break l;
                }
                T = N;
                break l;
              case 3:
                N.flags = N.flags & -65537 | 128;
              case 0:
                if (N = p.payload, s = typeof N == "function" ? N.call(cl, T, s) : N, s == null) break l;
                T = B({}, T, s);
                break l;
              case 2:
                ua = !0;
            }
          }
          s = c.callback, s !== null && (l.flags |= 64, g && (l.flags |= 8192), g = n.callbacks, g === null ? n.callbacks = [s] : g.push(s));
        } else g = {
          lane: s,
          tag: c.tag,
          payload: c.payload,
          callback: c.callback,
          next: null
        }, b === null ? (h = b = g, i = T) : b = b.next = g, f |= s;
        if (c = c.next, c === null) {
          if (c = n.shared.pending, c === null) break;
          g = c, c = g.next, g.next = null, n.lastBaseUpdate = g, n.shared.pending = null;
        }
      } while (!0);
      b === null && (i = T), n.baseState = i, n.firstBaseUpdate = h, n.lastBaseUpdate = b, e === null && (n.shared.lanes = 0), ia |= f, l.lanes = f, l.memoizedState = T;
    }
  }
  function T0(l, t) {
    if (typeof l != "function") throw Error(S(191, l));
    l.call(t);
  }
  function _0(l, t) {
    var a = l.callbacks;
    if (a !== null) for (l.callbacks = null, l = 0; l < a.length; l++) T0(a[l], t);
  }
  var vu = y(null), $n = y(0);
  function E0(l, t) {
    l = Lt, M($n, l), M(vu, t), Lt = l | t.baseLanes;
  }
  function Cf() {
    M($n, Lt), M(vu, vu.current);
  }
  function rf() {
    Lt = $n.current, _(vu), _($n);
  }
  var tt = y(null), dt = null;
  function na(l) {
    var t = l.alternate;
    M(gl, gl.current & 1), M(tt, l), dt === null && (t === null || vu.current !== null || t.memoizedState !== null) && (dt = l);
  }
  function jf(l) {
    M(gl, gl.current), M(tt, l), dt === null && (dt = l);
  }
  function A0(l) {
    l.tag === 22 ? (M(gl, gl.current), M(tt, l), dt === null && (dt = l)) : ea(l);
  }
  function ea() {
    M(gl, gl.current), M(tt, tt.current);
  }
  function at(l) {
    _(tt), dt === l && (dt = null), _(gl);
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
  var Ct = 0, G = null, el = null, zl = null, kn = !1, yu = !1, ja = !1, In = 0, $u = 0, mu = null, tm = 0;
  function hl() {
    throw Error(S(321));
  }
  function Gf(l, t) {
    if (t === null) return !1;
    for (var a = 0; a < t.length && a < l.length; a++) if (!Pl(l[a], t[a])) return !1;
    return !0;
  }
  function Xf(l, t, a, u, n, e) {
    return Ct = e, G = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, A.H = l === null || l.memoizedState === null ? fv : lc, ja = !1, e = a(u, n), ja = !1, yu && (e = O0(t, a, u, n)), M0(l), e;
  }
  function M0(l) {
    A.H = Iu;
    var t = el !== null && el.next !== null;
    if (Ct = 0, zl = el = G = null, kn = !1, $u = 0, mu = null, t) throw Error(S(300));
    l === null || Tl || (l = l.dependencies, l !== null && Vn(l) && (Tl = !0));
  }
  function O0(l, t, a, u) {
    G = l;
    var n = 0;
    do {
      if (yu && (mu = null), $u = 0, yu = !1, 25 <= n) throw Error(S(301));
      if (n += 1, zl = el = null, l.updateQueue != null) {
        var e = l.updateQueue;
        e.lastEffect = null, e.events = null, e.stores = null, e.memoCache != null && (e.memoCache.index = 0);
      }
      A.H = cv, e = t(a, u);
    } while (yu);
    return e;
  }
  function am() {
    var l = A.H, t = l.useState()[0];
    return t = typeof t.then == "function" ? Fu(t) : t, l = l.useState()[0], (el !== null ? el.memoizedState : null) !== l && (G.flags |= 1024), t;
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
    Ct = 0, zl = el = G = null, yu = !1, $u = In = 0, mu = null;
  }
  function pl() {
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
    if (el === null) {
      var l = G.alternate;
      l = l !== null ? l.memoizedState : null;
    } else l = el.next;
    var t = zl === null ? G.memoizedState : zl.next;
    if (t !== null) zl = t, el = l;
    else {
      if (l === null)
        throw G.alternate === null ? Error(S(467)) : Error(S(310));
      el = l, l = {
        memoizedState: el.memoizedState,
        baseState: el.baseState,
        baseQueue: el.baseQueue,
        queue: el.queue,
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
  function rt(l, t) {
    return typeof t == "function" ? t(l) : t;
  }
  function te(l) {
    return Kf(ol(), el, l);
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
      var c = f = null, i = null, h = t, b = !1;
      do {
        var T = h.lane & -536870913;
        if (T !== h.lane ? (x & T) === T : (Ct & T) === T) {
          var s = h.revertLane;
          if (s === 0) i !== null && (i = i.next = {
            lane: 0,
            revertLane: 0,
            gesture: null,
            action: h.action,
            hasEagerState: h.hasEagerState,
            eagerState: h.eagerState,
            next: null
          }), T === eu && (b = !0);
          else if ((Ct & s) === s) {
            h = h.next, s === eu && (b = !0);
            continue;
          } else T = {
            lane: 0,
            revertLane: h.revertLane,
            gesture: null,
            action: h.action,
            hasEagerState: h.hasEagerState,
            eagerState: h.eagerState,
            next: null
          }, i === null ? (c = i = T, f = e) : i = i.next = T, G.lanes |= s, ia |= s;
          T = h.action, ja && a(e, T), e = h.hasEagerState ? h.eagerState : a(e, T);
        } else s = {
          lane: T,
          revertLane: h.revertLane,
          gesture: h.gesture,
          action: h.action,
          hasEagerState: h.hasEagerState,
          eagerState: h.eagerState,
          next: null
        }, i === null ? (c = i = s, f = e) : i = i.next = s, G.lanes |= T, ia |= T;
        h = h.next;
      } while (h !== null && h !== t);
      if (i === null ? f = e : i.next = c, !Pl(e, l.memoizedState) && (Tl = !0, b && (a = fu, a !== null))) throw a;
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
      Pl(e, t.memoizedState) || (Tl = !0), t.memoizedState = e, t.baseQueue === null && (t.baseState = e), a.lastRenderedState = e;
    }
    return [e, u];
  }
  function D0(l, t, a) {
    var u = G, n = ol(), e = W;
    if (e) {
      if (a === void 0) throw Error(S(407));
      a = a();
    } else a = t();
    var f = !Pl((el || n).memoizedState, a);
    if (f && (n.memoizedState = a, Tl = !0), n = n.queue, wf(H0.bind(null, u, n, l), [l]), n.getSnapshot !== t || f || zl !== null && zl.memoizedState.tag & 1) {
      if (u.flags |= 2048, du(9, { destroy: void 0 }, N0.bind(null, u, n, a, t), null), il === null) throw Error(S(349));
      e || (Ct & 127) !== 0 || U0(u, t, a);
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
    var t = pl();
    if (typeof l == "function") {
      var a = l;
      if (l = a(), ja) {
        Ft(!0);
        try {
          a();
        } finally {
          Ft(!1);
        }
      }
    }
    return t.memoizedState = t.baseState = l, t.queue = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: rt,
      lastRenderedState: l
    }, t;
  }
  function B0(l, t, a, u) {
    return l.baseState = a, Kf(l, el, typeof u == "function" ? u : rt);
  }
  function um(l, t, a, u, n) {
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
      A.T !== null ? a(!0) : e.isTransition = !1, u(e), a = t.pending, a === null ? (e.next = t.pending = e, R0(t, e)) : (e.next = a.next, t.pending = a.next = e);
    }
  }
  function R0(l, t) {
    var a = t.action, u = t.payload, n = l.state;
    if (t.isTransition) {
      var e = A.T, f = {};
      A.T = f;
      try {
        var c = a(n, u), i = A.S;
        i !== null && i(f, c), p0(l, t, c);
      } catch (h) {
        Wf(l, t, h);
      } finally {
        e !== null && f.types !== null && (e.types = f.types), A.T = e;
      }
    } else try {
      e = a(n, u), p0(l, t, e);
    } catch (h) {
      Wf(l, t, h);
    }
  }
  function p0(l, t, a) {
    a !== null && typeof a == "object" && typeof a.then == "function" ? a.then(function(u) {
      C0(l, t, u);
    }, function(u) {
      return Wf(l, t, u);
    }) : C0(l, t, a);
  }
  function C0(l, t, a) {
    t.status = "fulfilled", t.value = a, r0(t), l.state = a, t = l.pending, t !== null && (a = t.next, a === t ? l.pending = null : (a = a.next, t.next = a, R0(l, a)));
  }
  function Wf(l, t, a) {
    var u = l.pending;
    if (l.pending = null, u !== null) {
      u = u.next;
      do
        t.status = "rejected", t.reason = a, r0(t), t = t.next;
      while (t !== u);
    }
    l.action = null;
  }
  function r0(l) {
    l = l.listeners;
    for (var t = 0; t < l.length; t++) (0, l[t])();
  }
  function j0(l, t) {
    return t;
  }
  function G0(l, t) {
    if (W) {
      var a = il.formState;
      if (a !== null) {
        l: {
          var u = G;
          if (W) {
            if (yl) {
              t: {
                for (var n = yl, e = mt; n.nodeType !== 8; ) {
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
                yl = St(n.nextSibling), u = n.data === "F!";
                break l;
              }
            }
            ta(u);
          }
          u = !1;
        }
        u && (t = a[0]);
      }
    }
    return a = pl(), a.memoizedState = a.baseState = t, u = {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: j0,
      lastRenderedState: t
    }, a.queue = u, a = uv.bind(null, G, u), u.dispatch = a, u = Jf(!1), e = Pf.bind(null, G, !1, u.queue), u = pl(), n = {
      state: t,
      dispatch: null,
      action: l,
      pending: null
    }, u.queue = n, a = um.bind(null, G, n, e, a), n.dispatch = a, u.memoizedState = l, [
      t,
      a,
      !1
    ];
  }
  function X0(l) {
    return Q0(ol(), el, l);
  }
  function Q0(l, t, a) {
    if (t = Kf(l, t, j0)[0], l = te(rt)[0], typeof t == "object" && t !== null && typeof t.then == "function") try {
      var u = Fu(t);
    } catch (f) {
      throw f === cu ? xn : f;
    }
    else u = t;
    t = ol();
    var n = t.queue, e = n.dispatch;
    return a !== t.memoizedState && (G.flags |= 2048, du(9, { destroy: void 0 }, nm.bind(null, n, a), null)), [
      u,
      e,
      l
    ];
  }
  function nm(l, t) {
    l.action = t;
  }
  function Z0(l) {
    var t = ol(), a = el;
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
    var n = pl();
    G.flags |= l, n.memoizedState = du(1 | t, { destroy: void 0 }, a, u === void 0 ? null : u);
  }
  function ue(l, t, a, u) {
    var n = ol();
    u = u === void 0 ? null : u;
    var e = n.memoizedState.inst;
    el !== null && u !== null && Gf(u, el.memoizedState.deps) ? n.memoizedState = du(t, e, a, u) : (G.flags |= l, n.memoizedState = du(1 | t, e, a, u));
  }
  function L0(l, t) {
    ae(8390656, 8, l, t);
  }
  function wf(l, t) {
    ue(2048, 8, l, t);
  }
  function em(l) {
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
    return em({
      ref: t,
      nextImpl: l
    }), function() {
      if ((ll & 2) !== 0) throw Error(S(440));
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
    return t !== null && Gf(t, u[1]) ? u[0] : (a.memoizedState = [l, t], l);
  }
  function F0(l, t) {
    var a = ol();
    t = t === void 0 ? null : t;
    var u = a.memoizedState;
    if (t !== null && Gf(t, u[1])) return u[0];
    if (u = l(), ja) {
      Ft(!0);
      try {
        l();
      } finally {
        Ft(!1);
      }
    }
    return a.memoizedState = [u, t], u;
  }
  function Ff(l, t, a) {
    return a === void 0 || (Ct & 1073741824) !== 0 && (x & 261930) === 0 ? l.memoizedState = t : (l.memoizedState = a, l = wv(), G.lanes |= l, ia |= l, a);
  }
  function k0(l, t, a, u) {
    return Pl(a, t) ? a : vu.current !== null ? (l = Ff(l, a, u), Pl(l, t) || (Tl = !0), l) : (Ct & 42) === 0 || (Ct & 1073741824) !== 0 && (x & 261930) === 0 ? (Tl = !0, l.memoizedState = a) : (l = wv(), G.lanes |= l, ia |= l, t);
  }
  function I0(l, t, a, u, n) {
    var e = D.p;
    D.p = e !== 0 && 8 > e ? e : 8;
    var f = A.T, c = {};
    A.T = c, Pf(l, !1, t, a);
    try {
      var i = n(), h = A.S;
      h !== null && h(c, i), i !== null && typeof i == "object" && typeof i.then == "function" ? ku(l, t, lm(i, u), ht(l)) : ku(l, t, u, ht(l));
    } catch (b) {
      ku(l, t, {
        then: function() {
        },
        status: "rejected",
        reason: b
      }, ht());
    } finally {
      D.p = e, f !== null && c.types !== null && (f.types = c.types), A.T = f;
    }
  }
  function fm() {
  }
  function kf(l, t, a, u) {
    if (l.tag !== 5) throw Error(S(476));
    var n = P0(l).queue;
    I0(l, n, t, P, a === null ? fm : function() {
      return lv(l), a(u);
    });
  }
  function P0(l) {
    var t = l.memoizedState;
    if (t !== null) return t;
    t = {
      memoizedState: P,
      baseState: P,
      baseQueue: null,
      queue: {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: rt,
        lastRenderedState: P
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
        lastRenderedReducer: rt,
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
  function cm(l) {
    for (var t = l.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var a = ht();
          l = Ca(a);
          var u = ra(t, l, a);
          u !== null && (Ll(u, t, a), Ju(u, t, a)), t = { cache: Uf() }, l.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function im(l, t, a) {
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
        if (n.hasEagerState = !0, n.eagerState = c, Pl(c, f)) return Gn(l, t, n, 0), il === null && jn(), !1;
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
      return pl().memoizedState = [l, t === void 0 ? null : t], l;
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
      var a = pl();
      t = t === void 0 ? null : t;
      var u = l();
      if (ja) {
        Ft(!0);
        try {
          l();
        } finally {
          Ft(!1);
        }
      }
      return a.memoizedState = [u, t], u;
    },
    useReducer: function(l, t, a) {
      var u = pl();
      if (a !== void 0) {
        var n = a(t);
        if (ja) {
          Ft(!0);
          try {
            a(t);
          } finally {
            Ft(!1);
          }
        }
      } else n = t;
      return u.memoizedState = u.baseState = n, l = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: l,
        lastRenderedState: n
      }, u.queue = l, l = l.dispatch = im.bind(null, G, l), [u.memoizedState, l];
    },
    useRef: function(l) {
      var t = pl();
      return l = { current: l }, t.memoizedState = l;
    },
    useState: function(l) {
      l = Jf(l);
      var t = l.queue, a = uv.bind(null, G, t);
      return t.dispatch = a, [l.memoizedState, a];
    },
    useDebugValue: $f,
    useDeferredValue: function(l, t) {
      return Ff(pl(), l, t);
    },
    useTransition: function() {
      var l = Jf(!1);
      return l = I0.bind(null, G, l.queue, !0, !1), pl().memoizedState = l, [!1, l];
    },
    useSyncExternalStore: function(l, t, a) {
      var u = G, n = pl();
      if (W) {
        if (a === void 0) throw Error(S(407));
        a = a();
      } else {
        if (a = t(), il === null) throw Error(S(349));
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
      var l = pl(), t = il.identifierPrefix;
      if (W) {
        var a = Ot, u = Mt;
        a = (u & ~(1 << 32 - Il(u) - 1)).toString(32) + a, t = "_" + t + "R_" + a, a = In++, 0 < a && (t += "H" + a.toString(32)), t += "_";
      } else a = tm++, t = "_" + t + "r_" + a.toString(32) + "_";
      return l.memoizedState = t;
    },
    useHostTransitionStatus: If,
    useFormState: G0,
    useActionState: G0,
    useOptimistic: function(l) {
      var t = pl();
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
      return pl().memoizedState = cm.bind(null, G);
    },
    useEffectEvent: function(l) {
      var t = pl(), a = { impl: l };
      return t.memoizedState = a, function() {
        if ((ll & 2) !== 0) throw Error(S(440));
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
      return te(rt);
    },
    useDebugValue: $f,
    useDeferredValue: function(l, t) {
      return k0(ol(), el.memoizedState, l, t);
    },
    useTransition: function() {
      var l = te(rt)[0], t = ol().memoizedState;
      return [typeof l == "boolean" ? l : Fu(l), t];
    },
    useSyncExternalStore: D0,
    useId: tv,
    useHostTransitionStatus: If,
    useFormState: X0,
    useActionState: X0,
    useOptimistic: function(l, t) {
      return B0(ol(), el, l, t);
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
      return xf(rt);
    },
    useDebugValue: $f,
    useDeferredValue: function(l, t) {
      var a = ol();
      return el === null ? Ff(a, l, t) : k0(a, el.memoizedState, l, t);
    },
    useTransition: function() {
      var l = xf(rt)[0], t = ol().memoizedState;
      return [typeof l == "boolean" ? l : Fu(l), t];
    },
    useSyncExternalStore: D0,
    useId: tv,
    useHostTransitionStatus: If,
    useFormState: Z0,
    useActionState: Z0,
    useOptimistic: function(l, t) {
      var a = ol();
      return el !== null ? B0(a, el, l, t) : (a.baseState = l, [l, a.queue.dispatch]);
    },
    useMemoCache: Lf,
    useCacheRefresh: av
  };
  cv.useEffectEvent = K0;
  function tc(l, t, a, u) {
    t = l.memoizedState, a = a(u, t), a = a == null ? t : B({}, t, a), l.memoizedState = a, l.lanes === 0 && (l.updateQueue.baseState = a);
  }
  var ac = {
    enqueueSetState: function(l, t, a) {
      l = l._reactInternals;
      var u = ht(), n = Ca(u);
      n.payload = t, a != null && (n.callback = a), t = ra(l, n, u), t !== null && (Ll(t, l, u), Ju(t, l, u));
    },
    enqueueReplaceState: function(l, t, a) {
      l = l._reactInternals;
      var u = ht(), n = Ca(u);
      n.tag = 1, n.payload = t, a != null && (n.callback = a), t = ra(l, n, u), t !== null && (Ll(t, l, u), Ju(t, l, u));
    },
    enqueueForceUpdate: function(l, t) {
      l = l._reactInternals;
      var a = ht(), u = Ca(a);
      u.tag = 2, t != null && (u.callback = t), t = ra(l, u, a), t !== null && (Ll(t, l, a), Ju(t, l, a));
    }
  };
  function iv(l, t, a, u, n, e, f) {
    return l = l.stateNode, typeof l.shouldComponentUpdate == "function" ? l.shouldComponentUpdate(u, e, f) : t.prototype && t.prototype.isPureReactComponent ? !Gu(a, u) || !Gu(n, e) : !0;
  }
  function vv(l, t, a, u) {
    l = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(a, u), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(a, u), t.state !== l && ac.enqueueReplaceState(t, t.state, null);
  }
  function Ga(l, t) {
    var a = t;
    if ("ref" in t) {
      a = {};
      for (var u in t) u !== "ref" && (a[u] = t[u]);
    }
    if (l = l.defaultProps) {
      a === t && (a = B({}, a));
      for (var n in l) a[n] === void 0 && (a[n] = l[n]);
    }
    return a;
  }
  function vm(l) {
    rn(l);
  }
  function ym(l) {
    console.error(l);
  }
  function mm(l) {
    rn(l);
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
    return a = Ca(a), a.tag = 3, a.payload = { element: null }, a.callback = function() {
      ee(l, t);
    }, a;
  }
  function mv(l) {
    return l = Ca(l), l.tag = 3, l;
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
      yv(t, a, u), typeof n != "function" && (va === null ? va = /* @__PURE__ */ new Set([this]) : va.add(this));
      var c = u.stack;
      this.componentDidCatch(u.value, { componentStack: c !== null ? c : "" });
    });
  }
  function dm(l, t, a, u, n) {
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
    if (W) return t = tt.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = n, u !== Ef && (l = Error(S(422), { cause: u }), Zu(it(l, a)))) : (u !== Ef && (t = Error(S(423), { cause: u }), Zu(it(t, a))), l = l.current.alternate, l.flags |= 65536, n &= -n, l.lanes |= n, u = it(u, a), n = uc(l.stateNode, u, n), Rf(l, n), Sl !== 4 && (Sl = 2)), !1;
    var e = Error(S(520), { cause: u });
    if (e = it(e, a), fn === null ? fn = [e] : fn.push(e), Sl !== 4 && (Sl = 2), t === null) return !0;
    u = it(u, a), a = t;
    do {
      switch (a.tag) {
        case 3:
          return a.flags |= 65536, l = n & -n, a.lanes |= l, l = uc(a.stateNode, u, l), Rf(a, l), !1;
        case 1:
          if (t = a.type, e = a.stateNode, (a.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || e !== null && typeof e.componentDidCatch == "function" && (va === null || !va.has(e)))) return a.flags |= 65536, n &= -n, a.lanes |= n, n = mv(n), dv(n, l, a, u), Rf(a, n), !1;
      }
      a = a.return;
    } while (a !== null);
    return !1;
  }
  var nc = Error(S(461)), Tl = !1;
  function ql(l, t, a, u) {
    t.child = l === null ? z0(t, null, a, u) : pa(t, l.child, a, u);
  }
  function hv(l, t, a, u, n) {
    a = a.render;
    var e = t.ref;
    if ("ref" in u) {
      var f = {};
      for (var c in u) c !== "ref" && (f[c] = u[c]);
    } else f = u;
    return qa(t), u = Xf(l, t, a, f, e, n), c = Qf(), l !== null && !Tl ? (Zf(l, t, n), jt(l, t, n)) : (W && c && Tf(t), t.flags |= 1, ql(l, t, u, n), t.child);
  }
  function Sv(l, t, a, u, n) {
    if (l === null) {
      var e = a.type;
      return typeof e == "function" && !of(e) && e.defaultProps === void 0 && a.compare === null ? (t.tag = 15, t.type = e, sv(l, t, e, u, n)) : (l = Qn(a.type, null, u, t, t.mode, n), l.ref = t.ref, l.return = t, t.child = l);
    }
    if (e = l.child, !dc(l, n)) {
      var f = e.memoizedProps;
      if (a = a.compare, a = a !== null ? a : Gu, a(f, u) && l.ref === t.ref) return jt(l, t, n);
    }
    return t.flags |= 1, l = Yt(e, u), l.ref = t.ref, l.return = t, t.child = l;
  }
  function sv(l, t, a, u, n) {
    if (l !== null) {
      var e = l.memoizedProps;
      if (Gu(e, u) && l.ref === t.ref) if (Tl = !1, t.pendingProps = u = e, dc(l, n)) (l.flags & 131072) !== 0 && (Tl = !0);
      else return t.lanes = l.lanes, jt(l, t, n);
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
      }, l !== null && Kn(t, e !== null ? e.cachePool : null), e !== null ? E0(t, e) : Cf(), A0(t);
      else return u = t.lanes = 536870912, ov(l, t, e !== null ? e.baseLanes | a : a, a, u);
    } else e !== null ? (Kn(t, e.cachePool), E0(t, e), ea(t), t.memoizedState = null) : (l !== null && Kn(t, null), Cf(), ea(t));
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
    }, l !== null && Kn(t, null), Cf(), A0(t), l !== null && nu(l, t, u, !0), t.childLanes = n, null;
  }
  function fe(l, t) {
    return t = ie({
      mode: t.mode,
      children: t.children
    }, l.mode), t.ref = l.ref, l.child = t, t.return = l, t;
  }
  function bv(l, t, a) {
    return pa(t, l.child, null, a), l = fe(t, t.pendingProps), l.flags |= 2, at(t), t.memoizedState = null, l;
  }
  function hm(l, t, a) {
    var u = t.pendingProps, n = (t.flags & 128) !== 0;
    if (t.flags &= -129, l === null) {
      if (W) {
        if (u.mode === "hidden") return l = fe(t, u), t.lanes = 536870912, Pu(null, l);
        if (jf(t), (l = yl) ? (l = Y1(l, mt), l = l !== null && l.data === "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: Pt !== null ? {
            id: Mt,
            overflow: Ot
          } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = n0(l), a.return = t, t.child = a, Nl = t, yl = null)) : l = null, l === null) throw ta(t);
        return t.lanes = 536870912, null;
      }
      return fe(t, u);
    }
    var e = l.memoizedState;
    if (e !== null) {
      var f = e.dehydrated;
      if (jf(t), n) if (t.flags & 256) t.flags &= -257, t = bv(l, t, a);
      else if (t.memoizedState !== null) t.child = l.child, t.flags |= 128, t = null;
      else throw Error(S(558));
      else if (Tl || nu(l, t, a, !1), n = (a & l.childLanes) !== 0, Tl || n) {
        if (u = il, u !== null && (f = yi(u, a), f !== 0 && f !== e.retryLane)) throw e.retryLane = f, Da(l, f), Ll(u, l, f), nc;
        oe(), t = bv(l, t, a);
      } else l = e.treeContext, yl = St(f.nextSibling), Nl = t, W = !0, la = null, mt = !1, l !== null && c0(t, l), t = fe(t, u), t.flags |= 4096;
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
    return qa(t), a = Xf(l, t, a, u, void 0, n), u = Qf(), l !== null && !Tl ? (Zf(l, t, n), jt(l, t, n)) : (W && u && Tf(t), t.flags |= 1, ql(l, t, a, n), t.child);
  }
  function zv(l, t, a, u, n, e) {
    return qa(t), t.updateQueue = null, a = O0(t, u, a, n), M0(l), u = Qf(), l !== null && !Tl ? (Zf(l, t, e), jt(l, t, e)) : (W && u && Tf(t), t.flags |= 1, ql(l, t, a, e), t.child);
  }
  function Tv(l, t, a, u, n) {
    if (qa(t), t.stateNode === null) {
      var e = lu, f = a.contextType;
      typeof f == "object" && f !== null && (e = Hl(f)), e = new a(u, e), t.memoizedState = e.state !== null && e.state !== void 0 ? e.state : null, e.updater = ac, t.stateNode = e, e._reactInternals = t, e = t.stateNode, e.props = u, e.state = t.memoizedState, e.refs = {}, Yf(t), f = a.contextType, e.context = typeof f == "object" && f !== null ? Hl(f) : lu, e.state = t.memoizedState, f = a.getDerivedStateFromProps, typeof f == "function" && (tc(t, a, f, u), e.state = t.memoizedState), typeof a.getDerivedStateFromProps == "function" || typeof e.getSnapshotBeforeUpdate == "function" || typeof e.UNSAFE_componentWillMount != "function" && typeof e.componentWillMount != "function" || (f = e.state, typeof e.componentWillMount == "function" && e.componentWillMount(), typeof e.UNSAFE_componentWillMount == "function" && e.UNSAFE_componentWillMount(), f !== e.state && ac.enqueueReplaceState(e, e.state, null), wu(t, u, e, n), Wu(), e.state = t.memoizedState), typeof e.componentDidMount == "function" && (t.flags |= 4194308), u = !0;
    } else if (l === null) {
      e = t.stateNode;
      var c = t.memoizedProps, i = Ga(a, c);
      e.props = i;
      var h = e.context, b = a.contextType;
      f = lu, typeof b == "object" && b !== null && (f = Hl(b));
      var T = a.getDerivedStateFromProps;
      b = typeof T == "function" || typeof e.getSnapshotBeforeUpdate == "function", c = t.pendingProps !== c, b || typeof e.UNSAFE_componentWillReceiveProps != "function" && typeof e.componentWillReceiveProps != "function" || (c || h !== f) && vv(t, e, u, f), ua = !1;
      var s = t.memoizedState;
      e.state = s, wu(t, u, e, n), Wu(), h = t.memoizedState, c || s !== h || ua ? (typeof T == "function" && (tc(t, a, T, u), h = t.memoizedState), (i = ua || iv(t, a, i, u, s, h, f)) ? (b || typeof e.UNSAFE_componentWillMount != "function" && typeof e.componentWillMount != "function" || (typeof e.componentWillMount == "function" && e.componentWillMount(), typeof e.UNSAFE_componentWillMount == "function" && e.UNSAFE_componentWillMount()), typeof e.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof e.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = u, t.memoizedState = h), e.props = u, e.state = h, e.context = f, u = i) : (typeof e.componentDidMount == "function" && (t.flags |= 4194308), u = !1);
    } else {
      e = t.stateNode, Bf(l, t), f = t.memoizedProps, b = Ga(a, f), e.props = b, T = t.pendingProps, s = e.context, h = a.contextType, i = lu, typeof h == "object" && h !== null && (i = Hl(h)), c = a.getDerivedStateFromProps, (h = typeof c == "function" || typeof e.getSnapshotBeforeUpdate == "function") || typeof e.UNSAFE_componentWillReceiveProps != "function" && typeof e.componentWillReceiveProps != "function" || (f !== T || s !== i) && vv(t, e, u, i), ua = !1, s = t.memoizedState, e.state = s, wu(t, u, e, n), Wu();
      var g = t.memoizedState;
      f !== T || s !== g || ua || l !== null && l.dependencies !== null && Vn(l.dependencies) ? (typeof c == "function" && (tc(t, a, c, u), g = t.memoizedState), (b = ua || iv(t, a, b, u, s, g, i) || l !== null && l.dependencies !== null && Vn(l.dependencies)) ? (h || typeof e.UNSAFE_componentWillUpdate != "function" && typeof e.componentWillUpdate != "function" || (typeof e.componentWillUpdate == "function" && e.componentWillUpdate(u, g, i), typeof e.UNSAFE_componentWillUpdate == "function" && e.UNSAFE_componentWillUpdate(u, g, i)), typeof e.componentDidUpdate == "function" && (t.flags |= 4), typeof e.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof e.componentDidUpdate != "function" || f === l.memoizedProps && s === l.memoizedState || (t.flags |= 4), typeof e.getSnapshotBeforeUpdate != "function" || f === l.memoizedProps && s === l.memoizedState || (t.flags |= 1024), t.memoizedProps = u, t.memoizedState = g), e.props = u, e.state = g, e.context = i, u = b) : (typeof e.componentDidUpdate != "function" || f === l.memoizedProps && s === l.memoizedState || (t.flags |= 4), typeof e.getSnapshotBeforeUpdate != "function" || f === l.memoizedProps && s === l.memoizedState || (t.flags |= 1024), u = !1);
    }
    return e = u, ce(l, t), u = (t.flags & 128) !== 0, e || u ? (e = t.stateNode, a = u && typeof a.getDerivedStateFromError != "function" ? null : e.render(), t.flags |= 1, l !== null && u ? (t.child = pa(t, l.child, null, n), t.child = pa(t, null, a, n)) : ql(l, t, a, n), t.memoizedState = e.state, l = t.child) : l = jt(l, t, n), l;
  }
  function _v(l, t, a, u) {
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
        if (n ? na(t) : ea(t), (l = yl) ? (l = Y1(l, mt), l = l !== null && l.data !== "&" ? l : null, l !== null && (t.memoizedState = {
          dehydrated: l,
          treeContext: Pt !== null ? {
            id: Mt,
            overflow: Ot
          } : null,
          retryLane: 536870912,
          hydrationErrors: null
        }, a = n0(l), a.return = t, t.child = a, Nl = t, yl = null)) : l = null, l === null) throw ta(t);
        return Lc(l) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var c = u.children;
      return u = u.fallback, n ? (ea(t), n = t.mode, c = ie({
        mode: "hidden",
        children: c
      }, n), u = Ua(u, n, a, null), c.return = t, u.return = t, c.sibling = u, t.child = c, u = t.child, u.memoizedState = cc(a), u.childLanes = ic(l, f, a), t.memoizedState = fc, Pu(null, u)) : (na(t), vc(t, c));
    }
    var i = l.memoizedState;
    if (i !== null && (c = i.dehydrated, c !== null)) {
      if (e) t.flags & 256 ? (na(t), t.flags &= -257, t = yc(l, t, a)) : t.memoizedState !== null ? (ea(t), t.child = l.child, t.flags |= 128, t = null) : (ea(t), c = u.fallback, n = t.mode, u = ie({
        mode: "visible",
        children: u.children
      }, n), c = Ua(c, n, a, null), c.flags |= 2, u.return = t, c.return = t, u.sibling = c, t.child = u, pa(t, l.child, null, a), u = t.child, u.memoizedState = cc(a), u.childLanes = ic(l, f, a), t.memoizedState = fc, t = Pu(null, u));
      else if (na(t), Lc(c)) {
        if (f = c.nextSibling && c.nextSibling.dataset, f) var h = f.dgst;
        f = h, u = Error(S(419)), u.stack = "", u.digest = f, Zu({
          value: u,
          source: null,
          stack: null
        }), t = yc(l, t, a);
      } else if (Tl || nu(l, t, a, !1), f = (a & l.childLanes) !== 0, Tl || f) {
        if (f = il, f !== null && (u = yi(f, a), u !== 0 && u !== i.retryLane)) throw i.retryLane = u, Da(l, u), Ll(f, l, u), nc;
        Vc(c) || oe(), t = yc(l, t, a);
      } else Vc(c) ? (t.flags |= 192, t.child = l.child, t = null) : (l = i.treeContext, yl = St(c.nextSibling), Nl = t, W = !0, la = null, mt = !1, l !== null && c0(t, l), t = vc(t, u.children), t.flags |= 4096);
      return t;
    }
    return n ? (ea(t), c = u.fallback, n = t.mode, i = l.child, h = i.sibling, u = Yt(i, {
      mode: "hidden",
      children: u.children
    }), u.subtreeFlags = i.subtreeFlags & 65011712, h !== null ? c = Yt(h, c) : (c = Ua(c, n, a, null), c.flags |= 2), c.return = t, u.return = t, u.sibling = c, t.child = u, Pu(null, u), u = t.child, c = l.child.memoizedState, c === null ? c = cc(a) : (n = c.cachePool, n !== null ? (i = bl._currentValue, n = n.parent !== i ? {
      parent: i,
      pool: i
    } : n) : n = h0(), c = {
      baseLanes: c.baseLanes | a,
      cachePool: n
    }), u.memoizedState = c, u.childLanes = ic(l, f, a), t.memoizedState = fc, Pu(l.child, u)) : (na(t), a = l.child, l = a.sibling, a = Yt(a, {
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
    return pa(t, l.child, null, a), l = vc(t, t.pendingProps.children), l.flags |= 2, t.memoizedState = null, l;
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
  function jt(l, t, a) {
    if (l !== null && (t.dependencies = l.dependencies), ia |= t.lanes, (a & t.childLanes) === 0) if (l !== null) {
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
  function Sm(l, t, a) {
    switch (t.tag) {
      case 3:
        Rl(t, t.stateNode.containerInfo), aa(t, bl, l.memoizedState.cache), Na();
        break;
      case 27:
      case 5:
        Ou(t);
        break;
      case 4:
        Rl(t, t.stateNode.containerInfo);
        break;
      case 10:
        aa(t, t.type, t.memoizedProps.value);
        break;
      case 31:
        if (t.memoizedState !== null) return t.flags |= 128, jf(t), null;
        break;
      case 13:
        var u = t.memoizedState;
        if (u !== null)
          return u.dehydrated !== null ? (na(t), t.flags |= 128, null) : (a & t.child.childLanes) !== 0 ? Ev(l, t, a) : (na(t), l = jt(l, t, a), l !== null ? l.sibling : null);
        na(t);
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
        aa(t, bl, l.memoizedState.cache);
    }
    return jt(l, t, a);
  }
  function Ov(l, t, a) {
    if (l !== null) if (l.memoizedProps !== t.pendingProps) Tl = !0;
    else {
      if (!dc(l, a) && (t.flags & 128) === 0) return Tl = !1, Sm(l, t, a);
      Tl = (l.flags & 131072) !== 0;
    }
    else Tl = !1, W && (t.flags & 1048576) !== 0 && f0(t, Qu, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        l: {
          var u = t.pendingProps;
          if (l = Ba(t.elementType), t.type = l, typeof l == "function") of(l) ? (u = Ga(l, u), t.tag = 1, t = Tv(null, t, l, u, a)) : (t.tag = 0, t = ec(null, t, l, u, a));
          else {
            if (l != null) {
              var n = l.$$typeof;
              if (n === ot) {
                t.tag = 11, t = hv(null, t, l, u, a);
                break l;
              } else if (n === $) {
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
        return u = t.type, n = Ga(u, t.pendingProps), Tv(l, t, u, n, a);
      case 3:
        l: {
          if (Rl(t, t.stateNode.containerInfo), l === null) throw Error(S(387));
          u = t.pendingProps;
          var e = t.memoizedState;
          n = e.element, Bf(l, t), wu(t, u, null, a);
          var f = t.memoizedState;
          if (u = f.cache, aa(t, bl, u), u !== e.cache && Df(t, [bl], a, !0), Wu(), u = f.element, e.isDehydrated) if (e = {
            element: u,
            isDehydrated: !1,
            cache: f.cache
          }, t.updateQueue.baseState = e, t.memoizedState = e, t.flags & 256) {
            t = _v(l, t, u, a);
            break l;
          } else if (u !== n) {
            n = it(Error(S(424)), t), Zu(n), t = _v(l, t, u, a);
            break l;
          } else {
            switch (l = t.stateNode.containerInfo, l.nodeType) {
              case 9:
                l = l.body;
                break;
              default:
                l = l.nodeName === "HTML" ? l.ownerDocument.body : l;
            }
            for (yl = St(l.firstChild), Nl = t, W = !0, la = null, mt = !0, a = z0(t, null, u, a), t.child = a; a; ) a.flags = a.flags & -3 | 4096, a = a.sibling;
          }
          else {
            if (Na(), u === n) {
              t = jt(l, t, a);
              break l;
            }
            ql(l, t, u, a);
          }
          t = t.child;
        }
        return t;
      case 26:
        return ce(l, t), l === null ? (a = j1(t.type, null, t.pendingProps, null)) ? t.memoizedState = a : W || (a = t.type, l = t.pendingProps, u = Me(V.current).createElement(a), u[Ul] = t, u[jl] = l, Yl(u, a, l), Ol(u), t.stateNode = u) : t.memoizedState = j1(t.type, l.memoizedProps, t.pendingProps, l.memoizedState), null;
      case 27:
        return Ou(t), l === null && W && (u = t.stateNode = p1(t.type, t.pendingProps, V.current), Nl = t, mt = !0, n = yl, ha(t.type) ? (Kc = n, yl = St(u.firstChild)) : yl = n), ql(l, t, t.pendingProps.children, a), ce(l, t), l === null && (t.flags |= 4194304), t.child;
      case 5:
        return l === null && W && ((n = u = yl) && (u = Vm(u, t.type, t.pendingProps, mt), u !== null ? (t.stateNode = u, Nl = t, yl = St(u.firstChild), mt = !1, n = !0) : n = !1), n || ta(t)), Ou(t), n = t.type, e = t.pendingProps, f = l !== null ? l.memoizedProps : null, u = e.children, Xc(n, e) ? u = null : f !== null && Xc(n, f) && (t.flags |= 32), t.memoizedState !== null && (n = Xf(l, t, am, null, null, a), sn._currentValue = n), ce(l, t), ql(l, t, u, a), t.child;
      case 6:
        return l === null && W && ((l = a = yl) && (a = Lm(a, t.pendingProps, mt), a !== null ? (t.stateNode = a, Nl = t, yl = null, l = !0) : l = !1), l || ta(t)), null;
      case 13:
        return Ev(l, t, a);
      case 4:
        return Rl(t, t.stateNode.containerInfo), u = t.pendingProps, l === null ? t.child = pa(t, null, u, a) : ql(l, t, u, a), t.child;
      case 11:
        return hv(l, t, t.type, t.pendingProps, a);
      case 7:
        return ql(l, t, t.pendingProps, a), t.child;
      case 8:
        return ql(l, t, t.pendingProps.children, a), t.child;
      case 12:
        return ql(l, t, t.pendingProps.children, a), t.child;
      case 10:
        return u = t.pendingProps, aa(t, t.type, u.value), ql(l, t, u.children, a), t.child;
      case 9:
        return n = t.type._context, u = t.pendingProps.children, qa(t), n = Hl(n), u = u(n), t.flags |= 1, ql(l, t, u, a), t.child;
      case 14:
        return Sv(l, t, t.type, t.pendingProps, a);
      case 15:
        return sv(l, t, t.type, t.pendingProps, a);
      case 19:
        return Mv(l, t, a);
      case 31:
        return hm(l, t, a);
      case 22:
        return gv(l, t, a, t.pendingProps);
      case 24:
        return qa(t), u = Hl(bl), l === null ? (n = Hf(), n === null && (n = il, e = Uf(), n.pooledCache = e, e.refCount++, e !== null && (n.pooledCacheLanes |= a), n = e), t.memoizedState = {
          parent: u,
          cache: n
        }, Yf(t), aa(t, bl, n)) : ((l.lanes & a) !== 0 && (Bf(l, t), wu(t, null, null, a), Wu()), n = l.memoizedState, e = t.memoizedState, n.parent !== u ? (n = {
          parent: u,
          cache: u
        }, t.memoizedState = n, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = n), aa(t, bl, u)) : (u = e.cache, aa(t, bl, u), u !== n.cache && Df(t, [bl], a, !0))), ql(l, t, t.pendingProps.children, a), t.child;
      case 29:
        throw t.pendingProps;
    }
    throw Error(S(156, t.tag));
  }
  function Gt(l) {
    l.flags |= 4;
  }
  function hc(l, t, a, u, n) {
    if ((t = (l.mode & 32) !== 0) && (t = !1), t) {
      if (l.flags |= 16777216, (n & 335544128) === n) if (l.stateNode.complete) l.flags |= 8192;
      else if (Iv()) l.flags |= 8192;
      else throw Ra = Jn, qf;
    } else l.flags &= -16777217;
  }
  function Dv(l, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0) l.flags &= -16777217;
    else if (l.flags |= 16777216, !V1(t)) if (Iv()) l.flags |= 8192;
    else throw Ra = Jn, qf;
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
  function ml(l) {
    var t = l.alternate !== null && l.alternate.child === l.child, a = 0, u = 0;
    if (t) for (var n = l.child; n !== null; ) a |= n.lanes | n.childLanes, u |= n.subtreeFlags & 65011712, u |= n.flags & 65011712, n.return = l, n = n.sibling;
    else for (n = l.child; n !== null; ) a |= n.lanes | n.childLanes, u |= n.subtreeFlags, u |= n.flags, n.return = l, n = n.sibling;
    return l.subtreeFlags |= u, l.childLanes = a, t;
  }
  function sm(l, t, a) {
    var u = t.pendingProps;
    switch (_f(t), t.tag) {
      case 16:
      case 15:
      case 0:
      case 11:
      case 7:
      case 8:
      case 12:
      case 9:
      case 14:
        return ml(t), null;
      case 1:
        return ml(t), null;
      case 3:
        return a = t.stateNode, u = null, l !== null && (u = l.memoizedState.cache), t.memoizedState.cache !== u && (t.flags |= 2048), pt(bl), sl(), a.pendingContext && (a.context = a.pendingContext, a.pendingContext = null), (l === null || l.child === null) && (uu(t) ? Gt(t) : l === null || l.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, Af())), ml(t), null;
      case 26:
        var n = t.type, e = t.memoizedState;
        return l === null ? (Gt(t), e !== null ? (ml(t), Dv(t, e)) : (ml(t), hc(t, n, null, u, a))) : e ? e !== l.memoizedState ? (Gt(t), ml(t), Dv(t, e)) : (ml(t), t.flags &= -16777217) : (l = l.memoizedProps, l !== u && Gt(t), ml(t), hc(t, n, l, u, a)), null;
      case 27:
        if (zn(t), a = V.current, n = t.type, l !== null && t.stateNode != null) l.memoizedProps !== u && Gt(t);
        else {
          if (!u) {
            if (t.stateNode === null) throw Error(S(166));
            return ml(t), null;
          }
          l = q.current, uu(t) ? i0(t, l) : (l = p1(n, u, a), t.stateNode = l, Gt(t));
        }
        return ml(t), null;
      case 5:
        if (zn(t), n = t.type, l !== null && t.stateNode != null) l.memoizedProps !== u && Gt(t);
        else {
          if (!u) {
            if (t.stateNode === null) throw Error(S(166));
            return ml(t), null;
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
            e[Ul] = t, e[jl] = u;
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
            u && Gt(t);
          }
        }
        return ml(t), hc(t, t.type, l === null ? null : l.memoizedProps, t.pendingProps, a), null;
      case 6:
        if (l && t.stateNode != null) l.memoizedProps !== u && Gt(t);
        else {
          if (typeof u != "string" && t.stateNode === null) throw Error(S(166));
          if (l = V.current, uu(t)) {
            if (l = t.stateNode, a = t.memoizedProps, u = null, n = Nl, n !== null) switch (n.tag) {
              case 27:
              case 5:
                u = n.memoizedProps;
            }
            l[Ul] = t, l = !!(l.nodeValue === a || u !== null && u.suppressHydrationWarning === !0 || A1(l.nodeValue, a)), l || ta(t, !0);
          } else l = Me(l).createTextNode(u), l[Ul] = t, t.stateNode = l;
        }
        return ml(t), null;
      case 31:
        if (a = t.memoizedState, l === null || l.memoizedState !== null) {
          if (u = uu(t), a !== null) {
            if (l === null) {
              if (!u) throw Error(S(318));
              if (l = t.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(S(557));
              l[Ul] = t;
            } else Na(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            ml(t), l = !1;
          } else a = Af(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = a), l = !0;
          if (!l)
            return t.flags & 256 ? (at(t), t) : (at(t), null);
          if ((t.flags & 128) !== 0) throw Error(S(558));
        }
        return ml(t), null;
      case 13:
        if (u = t.memoizedState, l === null || l.memoizedState !== null && l.memoizedState.dehydrated !== null) {
          if (n = uu(t), u !== null && u.dehydrated !== null) {
            if (l === null) {
              if (!n) throw Error(S(318));
              if (n = t.memoizedState, n = n !== null ? n.dehydrated : null, !n) throw Error(S(317));
              n[Ul] = t;
            } else Na(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            ml(t), n = !1;
          } else n = Af(), l !== null && l.memoizedState !== null && (l.memoizedState.hydrationErrors = n), n = !0;
          if (!n)
            return t.flags & 256 ? (at(t), t) : (at(t), null);
        }
        return at(t), (t.flags & 128) !== 0 ? (t.lanes = a, t) : (a = u !== null, l = l !== null && l.memoizedState !== null, a && (u = t.child, n = null, u.alternate !== null && u.alternate.memoizedState !== null && u.alternate.memoizedState.cachePool !== null && (n = u.alternate.memoizedState.cachePool.pool), e = null, u.memoizedState !== null && u.memoizedState.cachePool !== null && (e = u.memoizedState.cachePool.pool), e !== n && (u.flags |= 2048)), a !== l && a && (t.child.flags |= 8192), ve(t, t.updateQueue), ml(t), null);
      case 4:
        return sl(), l === null && z1(t.stateNode.containerInfo), ml(t), null;
      case 10:
        return pt(t.type), ml(t), null;
      case 19:
        if (_(gl), u = t.memoizedState, u === null) return ml(t), null;
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
            if (t.flags |= 128, n = !0, l = l.updateQueue, t.updateQueue = l, ve(t, l), ln(u, !0), u.tail === null && u.tailMode === "hidden" && !e.alternate && !W) return ml(t), null;
          } else 2 * Fl() - u.renderingStartTime > Se && a !== 536870912 && (t.flags |= 128, n = !0, ln(u, !1), t.lanes = 4194304);
          u.isBackwards ? (e.sibling = t.child, t.child = e) : (l = u.last, l !== null ? l.sibling = e : t.child = e, u.last = e);
        }
        return u.tail !== null ? (l = u.tail, u.rendering = l, u.tail = l.sibling, u.renderingStartTime = Fl(), l.sibling = null, a = gl.current, M(gl, n ? a & 1 | 2 : a & 1), W && Bt(t, u.treeForkCount), l) : (ml(t), null);
      case 22:
      case 23:
        return at(t), rf(), u = t.memoizedState !== null, l !== null ? l.memoizedState !== null !== u && (t.flags |= 8192) : u && (t.flags |= 8192), u ? (a & 536870912) !== 0 && (t.flags & 128) === 0 && (ml(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : ml(t), a = t.updateQueue, a !== null && ve(t, a.retryQueue), a = null, l !== null && l.memoizedState !== null && l.memoizedState.cachePool !== null && (a = l.memoizedState.cachePool.pool), u = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (u = t.memoizedState.cachePool.pool), u !== a && (t.flags |= 2048), l !== null && _(Ya), null;
      case 24:
        return a = null, l !== null && (a = l.memoizedState.cache), t.memoizedState.cache !== a && (t.flags |= 2048), pt(bl), ml(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(S(156, t.tag));
  }
  function gm(l, t) {
    switch (_f(t), t.tag) {
      case 1:
        return l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 3:
        return pt(bl), sl(), l = t.flags, (l & 65536) !== 0 && (l & 128) === 0 ? (t.flags = l & -65537 | 128, t) : null;
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
        return _(gl), null;
      case 4:
        return sl(), null;
      case 10:
        return pt(t.type), null;
      case 22:
      case 23:
        return at(t), rf(), l !== null && _(Ya), l = t.flags, l & 65536 ? (t.flags = l & -65537 | 128, t) : null;
      case 24:
        return pt(bl), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function Uv(l, t) {
    switch (_f(t), t.tag) {
      case 3:
        pt(bl), sl();
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
        _(gl);
        break;
      case 10:
        pt(t.type);
        break;
      case 22:
      case 23:
        at(t), rf(), l !== null && _(Ya);
        break;
      case 24:
        pt(bl);
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
      nl(t, t.return, c);
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
            var f = u.inst, c = f.destroy;
            if (c !== void 0) {
              f.destroy = void 0, n = t;
              var i = a, h = c;
              try {
                h();
              } catch (b) {
                nl(n, i, b);
              }
            }
          }
          u = u.next;
        } while (u !== e);
      }
    } catch (b) {
      nl(t, t.return, b);
    }
  }
  function Nv(l) {
    var t = l.updateQueue;
    if (t !== null) {
      var a = l.stateNode;
      try {
        _0(t, a);
      } catch (u) {
        nl(l, l.return, u);
      }
    }
  }
  function Hv(l, t, a) {
    a.props = Ga(l.type, l.memoizedProps), a.state = l.memoizedState;
    try {
      a.componentWillUnmount();
    } catch (u) {
      nl(l, t, u);
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
      nl(l, t, n);
    }
  }
  function Dt(l, t) {
    var a = l.ref, u = l.refCleanup;
    if (a !== null) if (typeof u == "function") try {
      u();
    } catch (n) {
      nl(l, t, n);
    } finally {
      l.refCleanup = null, l = l.alternate, l != null && (l.refCleanup = null);
    }
    else if (typeof a == "function") try {
      a(null);
    } catch (n) {
      nl(l, t, n);
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
      nl(l, l.return, n);
    }
  }
  function Sc(l, t, a) {
    try {
      var u = l.stateNode;
      rm(u, l.type, a, t), u[jl] = t;
    } catch (n) {
      nl(l, l.return, n);
    }
  }
  function Yv(l) {
    return l.tag === 5 || l.tag === 3 || l.tag === 26 || l.tag === 27 && ha(l.type) || l.tag === 4;
  }
  function sc(l) {
    l: for (; ; ) {
      for (; l.sibling === null; ) {
        if (l.return === null || Yv(l.return)) return null;
        l = l.return;
      }
      for (l.sibling.return = l.return, l = l.sibling; l.tag !== 5 && l.tag !== 6 && l.tag !== 18; ) {
        if (l.tag === 27 && ha(l.type) || l.flags & 2 || l.child === null || l.tag === 4) continue l;
        l.child.return = l, l = l.child;
      }
      if (!(l.flags & 2)) return l.stateNode;
    }
  }
  function gc(l, t, a) {
    var u = l.tag;
    if (u === 5 || u === 6) l = l.stateNode, t ? (a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a).insertBefore(l, t) : (t = a.nodeType === 9 ? a.body : a.nodeName === "HTML" ? a.ownerDocument.body : a, t.appendChild(l), a = a._reactRootContainer, a != null || t.onclick !== null || (t.onclick = Ht));
    else if (u !== 4 && (u === 27 && ha(l.type) && (a = l.stateNode, t = null), l = l.child, l !== null)) for (gc(l, t, a), l = l.sibling; l !== null; ) gc(l, t, a), l = l.sibling;
  }
  function ye(l, t, a) {
    var u = l.tag;
    if (u === 5 || u === 6) l = l.stateNode, t ? a.insertBefore(l, t) : a.appendChild(l);
    else if (u !== 4 && (u === 27 && ha(l.type) && (a = l.stateNode), l = l.child, l !== null)) for (ye(l, t, a), l = l.sibling; l !== null; ) ye(l, t, a), l = l.sibling;
  }
  function Bv(l) {
    var t = l.stateNode, a = l.memoizedProps;
    try {
      for (var u = l.type, n = t.attributes; n.length; ) t.removeAttributeNode(n[0]);
      Yl(t, u, a), t[Ul] = l, t[jl] = a;
    } catch (e) {
      nl(l, l.return, e);
    }
  }
  var Xt = !1, _l = !1, oc = !1, Rv = typeof WeakSet == "function" ? WeakSet : Set, Dl = null;
  function om(l, t) {
    if (l = l.containerInfo, jc = Ye, l = wi(l), yf(l)) {
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
          var f = 0, c = -1, i = -1, h = 0, b = 0, T = l, s = null;
          t: for (; ; ) {
            for (var g; T !== a || n !== 0 && T.nodeType !== 3 || (c = f + n), T !== e || u !== 0 && T.nodeType !== 3 || (i = f + u), T.nodeType === 3 && (f += T.nodeValue.length), (g = T.firstChild) !== null; )
              s = T, T = g;
            for (; ; ) {
              if (T === l) break t;
              if (s === a && ++h === n && (c = f), s === e && ++b === u && (i = f), (g = T.nextSibling) !== null) break;
              T = s, s = T.parentNode;
            }
            T = g;
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
    for (Gc = {
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
              var N = Ga(a.type, n);
              l = u.getSnapshotBeforeUpdate(N, e), u.__reactInternalSnapshotBeforeUpdate = l;
            } catch (p) {
              nl(a, a.return, p);
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
  function pv(l, t, a) {
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
          nl(a, a.return, f);
        }
        else {
          var n = Ga(a.type, t.memoizedProps);
          t = t.memoizedState;
          try {
            l.componentDidUpdate(n, t, l.__reactInternalSnapshotBeforeUpdate);
          } catch (f) {
            nl(a, a.return, f);
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
            _0(l, t);
          } catch (f) {
            nl(a, a.return, f);
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
        Zt(l, a), u & 4 && jv(l, a);
        break;
      case 13:
        Zt(l, a), u & 4 && Gv(l, a), u & 64 && (l = a.memoizedState, l !== null && (l = l.dehydrated, l !== null && (a = Dm.bind(null, a), Km(l, a))));
        break;
      case 22:
        if (u = a.memoizedState !== null || Xt, !u) {
          t = t !== null && t.memoizedState !== null || _l, n = Xt;
          var e = _l;
          Xt = u, (_l = t) && !e ? Vt(l, a, (a.subtreeFlags & 8772) !== 0) : Zt(l, a), Xt = n, _l = e;
        }
        break;
      case 30:
        break;
      default:
        Zt(l, a);
    }
  }
  function Cv(l) {
    var t = l.alternate;
    t !== null && (l.alternate = null, Cv(t)), l.child = null, l.deletions = null, l.sibling = null, l.tag === 5 && (t = l.stateNode, t !== null && Je(t)), l.stateNode = null, l.return = null, l.dependencies = null, l.memoizedProps = null, l.memoizedState = null, l.pendingProps = null, l.stateNode = null, l.updateQueue = null;
  }
  var dl = null, Xl = !1;
  function Qt(l, t, a) {
    for (a = a.child; a !== null; ) rv(l, t, a), a = a.sibling;
  }
  function rv(l, t, a) {
    if (kl && typeof kl.onCommitFiberUnmount == "function") try {
      kl.onCommitFiberUnmount(Du, a);
    } catch {
    }
    switch (a.tag) {
      case 26:
        _l || Dt(a, t), Qt(l, t, a), a.memoizedState ? a.memoizedState.count-- : a.stateNode && (a = a.stateNode, a.parentNode.removeChild(a));
        break;
      case 27:
        _l || Dt(a, t);
        var u = dl, n = Xl;
        ha(a.type) && (dl = a.stateNode, Xl = !1), Qt(l, t, a), dn(a.stateNode), dl = u, Xl = n;
        break;
      case 5:
        _l || Dt(a, t);
      case 6:
        if (u = dl, n = Xl, dl = null, Qt(l, t, a), dl = u, Xl = n, dl !== null) if (Xl) try {
          (dl.nodeType === 9 ? dl.body : dl.nodeName === "HTML" ? dl.ownerDocument.body : dl).removeChild(a.stateNode);
        } catch (e) {
          nl(a, t, e);
        }
        else try {
          dl.removeChild(a.stateNode);
        } catch (e) {
          nl(a, t, e);
        }
        break;
      case 18:
        dl !== null && (Xl ? (l = dl, H1(l.nodeType === 9 ? l.body : l.nodeName === "HTML" ? l.ownerDocument.body : l, a.stateNode), Mu(l)) : H1(dl, a.stateNode));
        break;
      case 4:
        u = dl, n = Xl, dl = a.stateNode.containerInfo, Xl = !0, Qt(l, t, a), dl = u, Xl = n;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        fa(2, a, t), _l || fa(4, a, t), Qt(l, t, a);
        break;
      case 1:
        _l || (Dt(a, t), u = a.stateNode, typeof u.componentWillUnmount == "function" && Hv(a, t, u)), Qt(l, t, a);
        break;
      case 21:
        Qt(l, t, a);
        break;
      case 22:
        _l = (u = _l) || a.memoizedState !== null, Qt(l, t, a), _l = u;
        break;
      default:
        Qt(l, t, a);
    }
  }
  function jv(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null))) {
      l = l.dehydrated;
      try {
        Mu(l);
      } catch (a) {
        nl(t, t.return, a);
      }
    }
  }
  function Gv(l, t) {
    if (t.memoizedState === null && (l = t.alternate, l !== null && (l = l.memoizedState, l !== null && (l = l.dehydrated, l !== null)))) try {
      Mu(l);
    } catch (a) {
      nl(t, t.return, a);
    }
  }
  function bm(l) {
    switch (l.tag) {
      case 31:
      case 13:
      case 19:
        var t = l.stateNode;
        return t === null && (t = l.stateNode = new Rv()), t;
      case 22:
        return l = l.stateNode, t = l._retryCache, t === null && (t = l._retryCache = new Rv()), t;
      default:
        throw Error(S(435, l.tag));
    }
  }
  function me(l, t) {
    var a = bm(l);
    t.forEach(function(u) {
      if (!a.has(u)) {
        a.add(u);
        var n = Um.bind(null, l, u);
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
            if (ha(c.type)) {
              dl = c.stateNode, Xl = !1;
              break l;
            }
            break;
          case 5:
            dl = c.stateNode, Xl = !1;
            break l;
          case 3:
          case 4:
            dl = c.stateNode.containerInfo, Xl = !0;
            break l;
        }
        c = c.return;
      }
      if (dl === null) throw Error(S(160));
      rv(e, f, n), dl = null, Xl = !1, e = n.alternate, e !== null && (e.return = null), n.return = null;
    }
    if (t.subtreeFlags & 13886) for (t = t.child; t !== null; ) Xv(t, l), t = t.sibling;
  }
  var Tt = null;
  function Xv(l, t) {
    var a = l.alternate, u = l.flags;
    switch (l.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        Ql(t, l), Zl(l), u & 4 && (fa(3, l, l.return), tn(3, l), fa(5, l, l.return));
        break;
      case 1:
        Ql(t, l), Zl(l), u & 512 && (_l || a === null || Dt(a, a.return)), u & 64 && Xt && (l = l.updateQueue, l !== null && (u = l.callbacks, u !== null && (a = l.shared.hiddenCallbacks, l.shared.hiddenCallbacks = a === null ? u : a.concat(u))));
        break;
      case 26:
        var n = Tt;
        if (Ql(t, l), Zl(l), u & 512 && (_l || a === null || Dt(a, a.return)), u & 4) {
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
        Ql(t, l), Zl(l), u & 512 && (_l || a === null || Dt(a, a.return)), a !== null && u & 4 && Sc(l, l.memoizedProps, a.memoizedProps);
        break;
      case 5:
        if (Ql(t, l), Zl(l), u & 512 && (_l || a === null || Dt(a, a.return)), l.flags & 32) {
          n = l.stateNode;
          try {
            Wa(n, "");
          } catch (N) {
            nl(l, l.return, N);
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
            nl(l, l.return, N);
          }
        }
        break;
      case 3:
        if (Ue = null, n = Tt, Tt = Oe(t.containerInfo), Ql(t, l), Tt = n, Zl(l), u & 4 && a !== null && a.memoizedState.isDehydrated) try {
          Mu(t.containerInfo);
        } catch (N) {
          nl(l, l.return, N);
        }
        oc && (oc = !1, Qv(l));
        break;
      case 4:
        u = Tt, Tt = Oe(l.stateNode.containerInfo), Ql(t, l), Zl(l), Tt = u;
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
        var i = a !== null && a.memoizedState !== null, h = Xt, b = _l;
        if (Xt = h || n, _l = b || i, Ql(t, l), _l = b, Xt = h, Zl(l), u & 8192) l: for (t = l.stateNode, t._visibility = n ? t._visibility & -2 : t._visibility | 1, n && (a === null || i || Xt || _l || Xa(l)), a = null, t = l; ; ) {
          if (t.tag === 5 || t.tag === 26) {
            if (a === null) {
              i = a = t;
              try {
                if (e = i.stateNode, n) f = e.style, typeof f.setProperty == "function" ? f.setProperty("display", "none", "important") : f.display = "none";
                else {
                  c = i.stateNode;
                  var T = i.memoizedProps.style, s = T != null && T.hasOwnProperty("display") ? T.display : null;
                  c.style.display = s == null || typeof s == "boolean" ? "" : ("" + s).trim();
                }
              } catch (N) {
                nl(i, i.return, N);
              }
            }
          } else if (t.tag === 6) {
            if (a === null) {
              i = t;
              try {
                i.stateNode.nodeValue = n ? "" : i.memoizedProps;
              } catch (N) {
                nl(i, i.return, N);
              }
            }
          } else if (t.tag === 18) {
            if (a === null) {
              i = t;
              try {
                var g = i.stateNode;
                n ? q1(g, !0) : q1(i.stateNode, !1);
              } catch (N) {
                nl(i, i.return, N);
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
        nl(l, l.return, c);
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
    if (t.subtreeFlags & 8772) for (t = t.child; t !== null; ) pv(l, t.alternate, t), t = t.sibling;
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
            nl(u, u.return, h);
          }
          if (u = e, n = u.updateQueue, n !== null) {
            var c = u.stateNode;
            try {
              var i = n.shared.hiddenCallbacks;
              if (i !== null) for (n.shared.hiddenCallbacks = null, n = 0; n < i.length; n++) T0(i[n], c);
            } catch (h) {
              nl(u, u.return, h);
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
          Vt(n, e, a), a && f & 4 && jv(n, e);
          break;
        case 13:
          Vt(n, e, a), a && f & 4 && Gv(n, e);
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
  function _t(l, t, a, u) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) Zv(l, t, a, u), t = t.sibling;
  }
  function Zv(l, t, a, u) {
    var n = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        _t(l, t, a, u), n & 2048 && tn(9, t);
        break;
      case 1:
        _t(l, t, a, u);
        break;
      case 3:
        _t(l, t, a, u), n & 2048 && (l = null, t.alternate !== null && (l = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== l && (t.refCount++, l != null && Vu(l)));
        break;
      case 12:
        if (n & 2048) {
          _t(l, t, a, u), l = t.stateNode;
          try {
            var e = t.memoizedProps, f = e.id, c = e.onPostCommit;
            typeof c == "function" && c(f, t.alternate === null ? "mount" : "update", l.passiveEffectDuration, -0);
          } catch (i) {
            nl(t, t.return, i);
          }
        } else _t(l, t, a, u);
        break;
      case 31:
        _t(l, t, a, u);
        break;
      case 13:
        _t(l, t, a, u);
        break;
      case 23:
        break;
      case 22:
        e = t.stateNode, f = t.alternate, t.memoizedState !== null ? e._visibility & 2 ? _t(l, t, a, u) : un(l, t) : e._visibility & 2 ? _t(l, t, a, u) : (e._visibility |= 2, hu(l, t, a, u, (t.subtreeFlags & 10256) !== 0 || !1)), n & 2048 && bc(f, t);
        break;
      case 24:
        _t(l, t, a, u), n & 2048 && zc(t.alternate, t);
        break;
      default:
        _t(l, t, a, u);
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
          var b = f.stateNode;
          f.memoizedState !== null ? b._visibility & 2 ? hu(e, f, c, i, n) : un(e, f) : (b._visibility |= 2, hu(e, f, c, i, n)), n && h & 2048 && bc(f.alternate, f);
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
        Su(l, t, a), l.flags & nn && l.memoizedState !== null && ad(a, Tt, l.memoizedState, l.memoizedProps);
        break;
      case 5:
        Su(l, t, a);
        break;
      case 3:
      case 4:
        var u = Tt;
        Tt = Oe(l.stateNode.containerInfo), Su(l, t, a), Tt = u;
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
          fa(8, t, t.return), de(t);
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
          Vu(a.memoizedState.cache);
      }
      if (u = a.child, u !== null) u.return = a, Dl = u;
      else l: for (a = l; Dl !== null; ) {
        u = Dl;
        var n = u.sibling, e = u.return;
        if (Cv(u), u === a) {
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
  var zm = {
    getCacheForType: function(l) {
      var t = Hl(bl), a = t.data.get(l);
      return a === void 0 && (a = l(), t.data.set(l, a)), a;
    },
    cacheSignal: function() {
      return Hl(bl).controller.signal;
    }
  }, Tm = typeof WeakMap == "function" ? WeakMap : Map, ll = 0, il = null, L = null, x = 0, ul = 0, ut = null, ca = !1, su = !1, Tc = !1, Lt = 0, Sl = 0, ia = 0, Qa = 0, _c = 0, nt = 0, gu = 0, fn = null, Vl = null, Ec = !1, he = 0, Jv = 0, Se = 1 / 0, se = null, va = null, Al = 0, ya = null, ou = null, Kt = 0, Ac = 0, Mc = null, Wv = null, cn = 0, Oc = null;
  function ht() {
    return (ll & 2) !== 0 && x !== 0 ? x & -x : A.T !== null ? Yc() : di();
  }
  function wv() {
    if (nt === 0) if ((x & 536870912) === 0 || W) {
      var l = En;
      En <<= 1, (En & 3932160) === 0 && (En = 262144), nt = l;
    } else nt = 536870912;
    return l = tt.current, l !== null && (l.flags |= 32), nt;
  }
  function Ll(l, t, a) {
    (l === il && (ul === 2 || ul === 9) || l.cancelPendingCommit !== null) && (bu(l, 0), ma(l, x, nt, !1)), On(l, a), ((ll & 2) === 0 || l !== il) && (l === il && ((ll & 2) === 0 && (Qa |= a), Sl === 4 && ma(l, x, nt, !1)), xt(l));
  }
  function $v(l, t, a) {
    if ((ll & 6) !== 0) throw Error(S(327));
    var u = !a && (t & 127) === 0 && (t & l.expiredLanes) === 0 || Uu(l, t), n = u ? Am(l, t) : Uc(l, t, !0), e = u;
    do {
      if (n === 0) {
        su && !u && ma(l, t, 0, !1);
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
                if (Tc && !i) {
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
          bu(l, 0), ma(l, t, 0, !0);
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
              ma(u, t, nt, !ca);
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
            if (ma(u, t, nt, !ca), Mn(u, 0, !0) !== 0) break l;
            Kt = t, u.timeoutHandle = U1(Fv.bind(null, u, a, Vl, se, Ec, t, nt, Qa, gu, ca, e, "Throttled", -0, 0), n);
            break l;
          }
          Fv(u, a, Vl, se, Ec, t, nt, Qa, gu, ca, e, null, -0, 0);
        }
      }
      break;
    } while (!0);
    xt(l);
  }
  function Fv(l, t, a, u, n, e, f, c, i, h, b, T, s, g) {
    if (l.timeoutHandle = -1, T = t.subtreeFlags, T & 8192 || (T & 16785408) === 16785408) {
      T = {
        stylesheets: null,
        count: 0,
        imgCount: 0,
        imgBytes: 0,
        suspenseyImages: [],
        waitingForImages: !0,
        waitingForViewTransition: !1,
        unsuspend: Ht
      }, Vv(t, e, T);
      var N = (e & 62914560) === e ? he - Fl() : (e & 4194048) === e ? Jv - Fl() : 0;
      if (N = ud(T, N), N !== null) {
        Kt = e, l.cancelPendingCommit = N(n1.bind(null, l, t, e, a, u, n, f, c, i, b, T, null, s, g)), ma(l, e, f, !h);
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
  function ma(l, t, a, u) {
    t &= ~_c, t &= ~Qa, l.suspendedLanes |= t, l.pingedLanes &= ~t, u && (l.warmLanes |= t), u = l.expirationTimes;
    for (var n = t; 0 < n; ) {
      var e = 31 - Il(n), f = 1 << e;
      u[e] = -1, n &= ~f;
    }
    a !== 0 && ii(l, a, t);
  }
  function ge() {
    return (ll & 6) === 0 ? (vn(0, !1), !1) : !0;
  }
  function Dc() {
    if (L !== null) {
      if (ul === 0) var l = L.return;
      else l = L, Rt = Ha = null, Vf(l), iu = null, Ku = 0, l = L;
      for (; l !== null; ) Uv(l.alternate, l), l = l.return;
      L = null;
    }
  }
  function bu(l, t) {
    var a = l.timeoutHandle;
    a !== -1 && (l.timeoutHandle = -1, Xm(a)), a = l.cancelPendingCommit, a !== null && (l.cancelPendingCommit = null, a()), Kt = 0, Dc(), il = l, L = a = Yt(l.current, null), x = t, ul = 0, ut = null, ca = !1, su = Uu(l, t), Tc = !1, gu = nt = _c = Qa = ia = Sl = 0, Vl = fn = null, Ec = !1, (t & 8) !== 0 && (t |= t & 32);
    var u = l.entangledLanes;
    if (u !== 0) for (l = l.entanglements, u &= t; 0 < u; ) {
      var n = 31 - Il(u), e = 1 << n;
      t |= l[n], u &= ~e;
    }
    return Lt = t, jn(), a;
  }
  function kv(l, t) {
    G = null, A.H = Iu, t === cu || t === xn ? (t = g0(), ul = 3) : t === qf ? (t = g0(), ul = 4) : ul = t === nc ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, ut = t, L === null && (Sl = 1, ee(l, it(t, l.current)));
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
    return A.A = zm, l;
  }
  function oe() {
    Sl = 4, ca || (x & 4194048) !== x && tt.current !== null || (su = !0), (ia & 134217727) === 0 && (Qa & 134217727) === 0 || il === null || ma(il, x, nt, !1);
  }
  function Uc(l, t, a) {
    var u = ll;
    ll |= 2;
    var n = Pv(), e = l1();
    (il !== l || x !== t) && (se = null, bu(l, t)), t = !1;
    var f = Sl;
    l: do
      try {
        if (ul !== 0 && L !== null) {
          var c = L, i = ut;
          switch (ul) {
            case 8:
              Dc(), f = 6;
              break l;
            case 3:
            case 2:
            case 9:
            case 6:
              tt.current === null && (t = !0);
              var h = ul;
              if (ul = 0, ut = null, zu(l, c, i, h), a && su) {
                f = 0;
                break l;
              }
              break;
            default:
              h = ul, ul = 0, ut = null, zu(l, c, i, h);
          }
        }
        Em(), f = Sl;
        break;
      } catch (b) {
        kv(l, b);
      }
    while (!0);
    return t && l.shellSuspendCounter++, Rt = Ha = null, ll = u, A.H = n, A.A = e, L === null && (il = null, x = 0, jn()), f;
  }
  function Em() {
    for (; L !== null; ) t1(L);
  }
  function Am(l, t) {
    var a = ll;
    ll |= 2;
    var u = Pv(), n = l1();
    il !== l || x !== t ? (se = null, Se = Fl() + 500, bu(l, t)) : su = Uu(l, t);
    l: do
      try {
        if (ul !== 0 && L !== null) {
          t = L;
          var e = ut;
          t: switch (ul) {
            case 1:
              ul = 0, ut = null, zu(l, t, e, 1);
              break;
            case 2:
            case 9:
              if (S0(e)) {
                ul = 0, ut = null, a1(t);
                break;
              }
              t = function() {
                ul !== 2 && ul !== 9 || il !== l || (ul = 7), xt(l);
              }, e.then(t, t);
              break l;
            case 3:
              ul = 7;
              break l;
            case 4:
              ul = 5;
              break l;
            case 7:
              S0(e) ? (ul = 0, ut = null, a1(t)) : (ul = 0, ut = null, zu(l, t, e, 7));
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
                    ul = 0, ut = null;
                    var i = c.sibling;
                    if (i !== null) L = i;
                    else {
                      var h = c.return;
                      h !== null ? (L = h, be(h)) : L = null;
                    }
                    break t;
                  }
              }
              ul = 0, ut = null, zu(l, t, e, 5);
              break;
            case 6:
              ul = 0, ut = null, zu(l, t, e, 6);
              break;
            case 8:
              Dc(), Sl = 6;
              break l;
            default:
              throw Error(S(462));
          }
        }
        Mm();
        break;
      } catch (b) {
        kv(l, b);
      }
    while (!0);
    return Rt = Ha = null, A.H = u, A.A = n, ll = a, L !== null ? 0 : (il = null, x = 0, jn(), Sl);
  }
  function Mm() {
    for (; L !== null && !ty(); ) t1(L);
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
    Rt = Ha = null, Vf(t), iu = null, Ku = 0;
    var n = t.return;
    try {
      if (dm(l, n, t, a, x)) {
        Sl = 1, ee(l, it(a, l.current)), L = null;
        return;
      }
    } catch (e) {
      if (n !== null) throw L = n, e;
      Sl = 1, ee(l, it(a, l.current)), L = null;
      return;
    }
    t.flags & 32768 ? (W || u === 1 ? l = !0 : su || (x & 536870912) !== 0 ? l = !1 : (ca = l = !0, (u === 2 || u === 9 || u === 3 || u === 6) && (u = tt.current, u !== null && u.tag === 13 && (u.flags |= 16384))), u1(t, l)) : be(t);
  }
  function be(l) {
    var t = l;
    do {
      if ((t.flags & 32768) !== 0) {
        u1(t, ca);
        return;
      }
      l = t.return;
      var a = sm(t.alternate, t, Lt);
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
      var a = gm(l.alternate, l);
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
    while (Al !== 0);
    if ((ll & 6) !== 0) throw Error(S(327));
    if (t !== null) {
      if (t === l.current) throw Error(S(177));
      if (e = t.lanes | t.childLanes, e |= sf, my(l, a, e, f, c, i), l === il && (L = il = null, x = 0), ou = t, ya = l, Kt = a, Ac = e, Mc = n, Wv = u, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (l.callbackNode = null, l.callbackPriority = 0, Nm(Tn, function() {
        return v1(), null;
      })) : (l.callbackNode = null, l.callbackPriority = 0), u = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || u) {
        u = A.T, A.T = null, n = D.p, D.p = 2, f = ll, ll |= 4;
        try {
          om(l, t, a);
        } finally {
          ll = f, D.p = n, A.T = u;
        }
      }
      Al = 1, e1(), f1(), c1();
    }
  }
  function e1() {
    if (Al === 1) {
      Al = 0;
      var l = ya, t = ou, a = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || a) {
        a = A.T, A.T = null;
        var u = D.p;
        D.p = 2;
        var n = ll;
        ll |= 4;
        try {
          Xv(t, l);
          var e = Gc, f = wi(l.containerInfo), c = e.focusedElem, i = e.selectionRange;
          if (f !== c && c && c.ownerDocument && Wi(c.ownerDocument.documentElement, c)) {
            if (i !== null && yf(c)) {
              var h = i.start, b = i.end;
              if (b === void 0 && (b = h), "selectionStart" in c) c.selectionStart = h, c.selectionEnd = Math.min(b, c.value.length);
              else {
                var T = c.ownerDocument || document, s = T && T.defaultView || window;
                if (s.getSelection) {
                  var g = s.getSelection(), N = c.textContent.length, p = Math.min(i.start, N), cl = i.end === void 0 ? p : Math.min(i.end, N);
                  !g.extend && p > cl && (f = cl, cl = p, p = f);
                  var m = Ji(c, p), v = Ji(c, cl);
                  if (m && v && (g.rangeCount !== 1 || g.anchorNode !== m.node || g.anchorOffset !== m.offset || g.focusNode !== v.node || g.focusOffset !== v.offset)) {
                    var d = T.createRange();
                    d.setStart(m.node, m.offset), g.removeAllRanges(), p > cl ? (g.addRange(d), g.extend(v.node, v.offset)) : (d.setEnd(v.node, v.offset), g.addRange(d));
                  }
                }
              }
            }
            for (T = [], g = c; g = g.parentNode; ) g.nodeType === 1 && T.push({
              element: g,
              left: g.scrollLeft,
              top: g.scrollTop
            });
            for (typeof c.focus == "function" && c.focus(), c = 0; c < T.length; c++) {
              var z = T[c];
              z.element.scrollLeft = z.left, z.element.scrollTop = z.top;
            }
          }
          Ye = !!jc, Gc = jc = null;
        } finally {
          ll = n, D.p = u, A.T = a;
        }
      }
      l.current = t, Al = 2;
    }
  }
  function f1() {
    if (Al === 2) {
      Al = 0;
      var l = ya, t = ou, a = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || a) {
        a = A.T, A.T = null;
        var u = D.p;
        D.p = 2;
        var n = ll;
        ll |= 4;
        try {
          pv(l, t.alternate, t);
        } finally {
          ll = n, D.p = u, A.T = a;
        }
      }
      Al = 3;
    }
  }
  function c1() {
    if (Al === 4 || Al === 3) {
      Al = 0, ay();
      var l = ya, t = ou, a = Kt, u = Wv;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? Al = 5 : (Al = 0, ou = ya = null, i1(l, l.pendingLanes));
      var n = l.pendingLanes;
      if (n === 0 && (va = null), Ke(a), t = t.stateNode, kl && typeof kl.onCommitFiberRoot == "function") try {
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
    if (Al !== 5) return !1;
    var l = ya, t = Ac;
    Ac = 0;
    var a = Ke(Kt), u = A.T, n = D.p;
    try {
      D.p = 32 > a ? 32 : a, A.T = null, a = Mc, Mc = null;
      var e = ya, f = Kt;
      if (Al = 0, ou = ya = null, Kt = 0, (ll & 6) !== 0) throw Error(S(331));
      var c = ll;
      if (ll |= 4, Kv(e.current), Zv(e, e.current, f, a), ll = c, vn(0, !1), kl && typeof kl.onPostCommitFiberRoot == "function") try {
        kl.onPostCommitFiberRoot(Du, e);
      } catch {
      }
      return !0;
    } finally {
      D.p = n, A.T = u, i1(l, t);
    }
  }
  function y1(l, t, a) {
    t = it(a, t), t = uc(l.stateNode, t, 2), l = ra(l, t, 2), l !== null && (On(l, 2), xt(l));
  }
  function nl(l, t, a) {
    if (l.tag === 3) y1(l, l, a);
    else for (; t !== null; ) {
      if (t.tag === 3) {
        y1(t, l, a);
        break;
      } else if (t.tag === 1) {
        var u = t.stateNode;
        if (typeof t.type.getDerivedStateFromError == "function" || typeof u.componentDidCatch == "function" && (va === null || !va.has(u))) {
          l = it(a, l), a = mv(2), u = ra(t, a, 2), u !== null && (dv(a, u, t, l), On(u, 2), xt(u));
          break;
        }
      }
      t = t.return;
    }
  }
  function Nc(l, t, a) {
    var u = l.pingCache;
    if (u === null) {
      u = l.pingCache = new Tm();
      var n = /* @__PURE__ */ new Set();
      u.set(t, n);
    } else n = u.get(t), n === void 0 && (n = /* @__PURE__ */ new Set(), u.set(t, n));
    n.has(a) || (Tc = !0, n.add(a), l = Om.bind(null, l, t, a), t.then(l, l));
  }
  function Om(l, t, a) {
    var u = l.pingCache;
    u !== null && u.delete(t), l.pingedLanes |= l.suspendedLanes & a, l.warmLanes &= ~a, il === l && (x & a) === a && (Sl === 4 || Sl === 3 && (x & 62914560) === x && 300 > Fl() - he ? (ll & 2) === 0 && bu(l, 0) : _c |= a, gu === x && (gu = 0)), xt(l);
  }
  function m1(l, t) {
    t === 0 && (t = ci()), l = Da(l, t), l !== null && (On(l, t), xt(l));
  }
  function Dm(l) {
    var t = l.memoizedState, a = 0;
    t !== null && (a = t.retryLane), m1(l, a);
  }
  function Um(l, t) {
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
  function Nm(l, t) {
    return Ze(l, t);
  }
  var Te = null, Tu = null, Hc = !1, _e = !1, qc = !1, da = 0;
  function xt(l) {
    l !== Tu && l.next === null && (Tu === null ? Te = Tu = l : Tu = Tu.next = l), _e = !0, Hc || (Hc = !0, qm());
  }
  function vn(l, t) {
    if (!qc && _e) {
      qc = !0;
      do
        for (var a = !1, u = Te; u !== null; ) {
          if (!t) if (l !== 0) {
            var n = u.pendingLanes;
            if (n === 0) var e = 0;
            else {
              var f = u.suspendedLanes, c = u.pingedLanes;
              e = (1 << 31 - Il(42 | l) + 1) - 1, e &= n & ~(f & ~c), e = e & 201326741 ? e & 201326741 | 1 : e ? e | 2 : 0;
            }
            e !== 0 && (a = !0, s1(u, e));
          } else e = x, e = Mn(u, u === il ? e : 0, u.cancelPendingCommit !== null || u.timeoutHandle !== -1), (e & 3) === 0 || Uu(u, e) || (a = !0, s1(u, e));
          u = u.next;
        }
      while (a);
      qc = !1;
    }
  }
  function Hm() {
    d1();
  }
  function d1() {
    _e = Hc = !1;
    var l = 0;
    da !== 0 && Gm() && (l = da);
    for (var t = Fl(), a = null, u = Te; u !== null; ) {
      var n = u.next, e = h1(u, t);
      e === 0 ? (u.next = null, a === null ? Te = n : a.next = n, n === null && (Tu = a)) : (a = u, (l !== 0 || (e & 3) !== 0) && (_e = !0)), u = n;
    }
    Al !== 0 && Al !== 5 || vn(l, !1), da !== 0 && (da = 0);
  }
  function h1(l, t) {
    for (var a = l.suspendedLanes, u = l.pingedLanes, n = l.expirationTimes, e = l.pendingLanes & -62914561; 0 < e; ) {
      var f = 31 - Il(e), c = 1 << f, i = n[f];
      i === -1 ? ((c & a) === 0 || (c & u) !== 0) && (n[f] = yy(c, t)) : i <= t && (l.expiredLanes |= c), e &= ~c;
    }
    if (t = il, a = x, a = Mn(l, l === t ? a : 0, l.cancelPendingCommit !== null || l.timeoutHandle !== -1), u = l.callbackNode, a === 0 || l === t && (ul === 2 || ul === 9) || l.cancelPendingCommit !== null) return u !== null && u !== null && Ve(u), l.callbackNode = null, l.callbackPriority = 0;
    if ((a & 3) === 0 || Uu(l, a)) {
      if (t = a & -a, t === l.callbackPriority) return t;
      switch (u !== null && Ve(u), Ke(a)) {
        case 2:
        case 8:
          a = ei;
          break;
        case 32:
          a = Tn;
          break;
        case 268435456:
          a = fi;
          break;
        default:
          a = Tn;
      }
      return u = S1.bind(null, l), a = Ze(a, u), l.callbackPriority = t, l.callbackNode = a, t;
    }
    return u !== null && u !== null && Ve(u), l.callbackPriority = 2, l.callbackNode = null, 2;
  }
  function S1(l, t) {
    if (Al !== 0 && Al !== 5) return l.callbackNode = null, l.callbackPriority = 0, null;
    var a = l.callbackNode;
    if (ze() && l.callbackNode !== a) return null;
    var u = x;
    return u = Mn(l, l === il ? u : 0, l.cancelPendingCommit !== null || l.timeoutHandle !== -1), u === 0 ? null : ($v(l, u, t), h1(l, Fl()), l.callbackNode != null && l.callbackNode === a ? S1.bind(null, l) : null);
  }
  function s1(l, t) {
    if (ze()) return null;
    $v(l, t, !0);
  }
  function qm() {
    Qm(function() {
      (ll & 6) !== 0 ? Ze(ni, Hm) : d1();
    });
  }
  function Yc() {
    if (da === 0) {
      var l = eu;
      l === 0 && (l = _n, _n <<= 1, (_n & 261888) === 0 && (_n = 256)), da = l;
    }
    return da;
  }
  function g1(l) {
    return l == null || typeof l == "symbol" || typeof l == "boolean" ? null : typeof l == "function" ? l : Hn("" + l);
  }
  function o1(l, t) {
    var a = t.ownerDocument.createElement("input");
    return a.name = t.name, a.value = t.value, l.id && a.setAttribute("form", l.id), t.parentNode.insertBefore(a, t), l = new FormData(l), a.parentNode.removeChild(a), l;
  }
  function Ym(l, t, a, u, n) {
    if (t === "submit" && a && a.stateNode === n) {
      var e = g1((n[jl] || null).action), f = u.submitter;
      f && (t = (t = f[jl] || null) ? g1(t.formAction) : f.getAttribute("formAction"), t !== null && (e = t, f = null));
      var c = new Rn("action", "action", null, u, n);
      l.push({
        event: c,
        listeners: [{
          instance: null,
          listener: function() {
            if (u.defaultPrevented) {
              if (da !== 0) {
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
    var Rc = Sf[Bc];
    zt(Rc.toLowerCase(), "on" + (Rc[0].toUpperCase() + Rc.slice(1)));
  }
  zt(ki, "onAnimationEnd"), zt(Ii, "onAnimationIteration"), zt(Pi, "onAnimationStart"), zt("dblclick", "onDoubleClick"), zt("focusin", "onFocus"), zt("focusout", "onBlur"), zt(Jy, "onTransitionRun"), zt(Wy, "onTransitionStart"), zt(wy, "onTransitionCancel"), zt(l0, "onTransitionEnd"), xa("onMouseEnter", ["mouseout", "mouseover"]), xa("onMouseLeave", ["mouseout", "mouseover"]), xa("onPointerEnter", ["pointerout", "pointerover"]), xa("onPointerLeave", ["pointerout", "pointerover"]), Ea("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" ")), Ea("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")), Ea("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]), Ea("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" ")), Ea("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" ")), Ea("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
  var yn = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), Bm = new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(yn));
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
          } catch (b) {
            rn(b);
          }
          n.currentTarget = null, e = i;
        }
        else for (f = 0; f < u.length; f++) {
          if (c = u[f], i = c.instance, h = c.currentTarget, c = c.listener, i !== e && n.isPropagationStopped()) break l;
          e = c, n.currentTarget = h;
          try {
            e(n);
          } catch (b) {
            rn(b);
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
    a.has(u) || (T1(t, l, 2, !1), a.add(u));
  }
  function pc(l, t, a) {
    var u = 0;
    t && (u |= 4), T1(a, l, u, t);
  }
  var Ee = "_reactListening" + Math.random().toString(36).slice(2);
  function z1(l) {
    if (!l[Ee]) {
      l[Ee] = !0, si.forEach(function(a) {
        a !== "selectionchange" && (Bm.has(a) || pc(a, !1, l), pc(a, !0, l));
      });
      var t = l.nodeType === 9 ? l : l.ownerDocument;
      t === null || t[Ee] || (t[Ee] = !0, pc("selectionchange", !1, t));
    }
  }
  function T1(l, t, a, u) {
    switch (W1(t)) {
      case 2:
        var n = id;
        break;
      case 8:
        n = vd;
        break;
      default:
        n = $c;
    }
    a = n.bind(null, t, a, l), n = void 0, !lf || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (n = !0), u ? n !== void 0 ? l.addEventListener(t, a, {
      capture: !0,
      passive: n
    }) : l.addEventListener(t, a, !0) : n !== void 0 ? l.addEventListener(t, a, { passive: n }) : l.addEventListener(t, a, !1);
  }
  function Cc(l, t, a, u, n) {
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
      var h = e, b = Ie(a), T = [];
      l: {
        var s = t0.get(l);
        if (s !== void 0) {
          var g = Rn, N = l;
          switch (l) {
            case "keypress":
              if (Yn(a) === 0) break l;
            case "keydown":
            case "keyup":
              g = Hy;
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
              g = Ey;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              g = qy;
              break;
            case ki:
            case Ii:
            case Pi:
              g = Ay;
              break;
            case l0:
              g = Yy;
              break;
            case "scroll":
            case "scrollend":
              g = _y;
              break;
            case "wheel":
              g = By;
              break;
            case "copy":
            case "cut":
            case "paste":
              g = My;
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
              g = Ry;
          }
          var p = (t & 4) !== 0, cl = !p && (l === "scroll" || l === "scrollend"), m = p ? s !== null ? s + "Capture" : null : s;
          p = [];
          for (var v = h, d; v !== null; ) {
            var z = v;
            if (d = z.stateNode, z = z.tag, z !== 5 && z !== 26 && z !== 27 || d === null || m === null || (z = Yu(v, m), z != null && p.push(mn(v, z, d))), cl) break;
            v = v.return;
          }
          0 < p.length && (s = new g(s, N, null, a, b), T.push({
            event: s,
            listeners: p
          }));
        }
      }
      if ((t & 7) === 0) {
        l: {
          if (s = l === "mouseover" || l === "pointerover", g = l === "mouseout" || l === "pointerout", s && a !== ke && (N = a.relatedTarget || a.fromElement) && (Va(N) || N[Nu])) break l;
          if ((g || s) && (s = b.window === b ? b : (s = b.ownerDocument) ? s.defaultView || s.parentWindow : window, g ? (N = a.relatedTarget || a.toElement, g = h, N = N ? Va(N) : null, N !== null && (cl = I(N), p = N.tag, N !== cl || p !== 5 && p !== 27 && p !== 6) && (N = null)) : (g = null, N = h), g !== N)) {
            if (p = qi, z = "onMouseLeave", m = "onMouseEnter", v = "mouse", (l === "pointerout" || l === "pointerover") && (p = Bi, z = "onPointerLeave", m = "onPointerEnter", v = "pointer"), cl = g == null ? s : qu(g), d = N == null ? s : qu(N), s = new p(z, v + "leave", g, a, b), s.target = cl, s.relatedTarget = d, z = null, Va(b) === h && (p = new p(m, v + "enter", N, a, b), p.target = d, p.relatedTarget = cl, z = p), cl = z, g && N) t: {
              for (p = Rm, m = g, v = N, d = 0, z = m; z; z = p(z)) d++;
              z = 0;
              for (var R = v; R; R = p(R)) z++;
              for (; 0 < d - z; ) m = p(m), d--;
              for (; 0 < z - d; ) v = p(v), z--;
              for (; d--; ) {
                if (m === v || v !== null && m === v.alternate) {
                  p = m;
                  break t;
                }
                m = p(m), v = p(v);
              }
              p = null;
            }
            else p = null;
            g !== null && _1(T, s, g, p, !1), N !== null && cl !== null && _1(T, cl, N, p, !0);
          }
        }
        l: {
          if (s = h ? qu(h) : window, g = s.nodeName && s.nodeName.toLowerCase(), g === "select" || g === "input" && s.type === "file") var F = Qi;
          else if (Gi(s)) if (Zi) F = Ly;
          else {
            F = Zy;
            var H = Qy;
          }
          else g = s.nodeName, !g || g.toLowerCase() !== "input" || s.type !== "checkbox" && s.type !== "radio" ? h && Fe(h.elementType) && (F = Qi) : F = Vy;
          if (F && (F = F(l, h))) {
            Xi(T, F, a, b);
            break l;
          }
          H && H(l, s, h), l === "focusout" && h && s.type === "number" && h.memoizedProps.value != null && $e(s, "number", s.value);
        }
        switch (H = h ? qu(h) : window, l) {
          case "focusin":
            (Gi(H) || H.contentEditable === "true") && (ka = H, mf = h, Xu = null);
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
            df = !1, $i(T, a, b);
            break;
          case "selectionchange":
            if (xy) break;
          case "keydown":
          case "keyup":
            $i(T, a, b);
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
        else Fa ? ri(l, a) && (J = "onCompositionEnd") : l === "keydown" && a.keyCode === 229 && (J = "onCompositionStart");
        J && (Ri && a.locale !== "ko" && (Fa || J !== "onCompositionStart" ? J === "onCompositionEnd" && Fa && (Q = Ni()) : (It = b, tf = "value" in It ? It.value : It.textContent, Fa = !0)), H = Ae(h, J), 0 < H.length && (J = new Yi(J, l, null, a, b), T.push({
          event: J,
          listeners: H
        }), Q ? J.data = Q : (Q = ji(a), Q !== null && (J.data = Q)))), (Q = Cy ? ry(l, a) : jy(l, a)) && (J = Ae(h, "onBeforeInput"), 0 < J.length && (H = new Yi("onBeforeInput", "beforeinput", null, a, b), T.push({
          event: H,
          listeners: J
        }), H.data = Q)), Ym(T, l, h, a, b);
      }
      b1(T, t);
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
  function Rm(l) {
    if (l === null) return null;
    do
      l = l.return;
    while (l && l.tag !== 5 && l.tag !== 27);
    return l || null;
  }
  function _1(l, t, a, u, n) {
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
  var pm = /\r\n?/g, Cm = /\u0000|\uFFFD/g;
  function E1(l) {
    return (typeof l == "string" ? l : "" + l).replace(pm, `
`).replace(Cm, "");
  }
  function A1(l, t) {
    return t = E1(t), E1(l) === t;
  }
  function fl(l, t, a, u, n, e) {
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
        } else typeof e == "function" && (a === "formAction" ? (t !== "input" && fl(l, t, "name", n.name, n, null), fl(l, t, "formEncType", n.formEncType, n, null), fl(l, t, "formMethod", n.formMethod, n, null), fl(l, t, "formTarget", n.formTarget, n, null)) : (fl(l, t, "encType", n.encType, n, null), fl(l, t, "method", n.method, n, null), fl(l, t, "target", n.target, n, null)));
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
        (!(2 < a.length) || a[0] !== "o" && a[0] !== "O" || a[1] !== "n" && a[1] !== "N") && (a = zy.get(a) || a, Dn(l, a, u));
    }
  }
  function rc(l, t, a, u, n, e) {
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
          if (a[0] === "o" && a[1] === "n" && (n = a.endsWith("Capture"), t = a.slice(2, n ? a.length - 7 : void 0), e = l[jl] || null, e = e != null ? e[a] : null, typeof e == "function" && l.removeEventListener(t, e, n), typeof u == "function")) {
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
              fl(l, t, e, f, a, null);
          }
        }
        n && fl(l, t, "srcSet", a.srcSet, a, null), u && fl(l, t, "src", a.src, a, null);
        return;
      case "input":
        K("invalid", l);
        var c = e = f = n = null, i = null, h = null;
        for (u in a) if (a.hasOwnProperty(u)) {
          var b = a[u];
          if (b != null) switch (u) {
            case "name":
              n = b;
              break;
            case "type":
              f = b;
              break;
            case "checked":
              i = b;
              break;
            case "defaultChecked":
              h = b;
              break;
            case "value":
              e = b;
              break;
            case "defaultValue":
              c = b;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              if (b != null) throw Error(S(137, t));
              break;
            default:
              fl(l, t, u, b, a, null);
          }
        }
        _i(l, e, c, i, h, f, n, !1);
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
            fl(l, t, n, c, a, null);
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
            fl(l, t, f, c, a, null);
        }
        Ai(l, u, n, e);
        return;
      case "option":
        for (i in a) if (a.hasOwnProperty(i) && (u = a[i], u != null)) switch (i) {
          case "selected":
            l.selected = u && typeof u != "function" && typeof u != "symbol";
            break;
          default:
            fl(l, t, i, u, a, null);
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
            fl(l, t, h, u, a, null);
        }
        return;
      default:
        if (Fe(t)) {
          for (b in a) a.hasOwnProperty(b) && (u = a[b], u !== void 0 && rc(l, t, b, u, a, void 0));
          return;
        }
    }
    for (c in a) a.hasOwnProperty(c) && (u = a[c], u != null && fl(l, t, c, u, a, null));
  }
  function rm(l, t, a, u) {
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
        var n = null, e = null, f = null, c = null, i = null, h = null, b = null;
        for (g in a) {
          var T = a[g];
          if (a.hasOwnProperty(g) && T != null) switch (g) {
            case "checked":
              break;
            case "value":
              break;
            case "defaultValue":
              i = T;
            default:
              u.hasOwnProperty(g) || fl(l, t, g, null, u, T);
          }
        }
        for (var s in u) {
          var g = u[s];
          if (T = a[s], u.hasOwnProperty(s) && (g != null || T != null)) switch (s) {
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
              b = g;
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
              g !== T && fl(l, t, s, g, u, T);
          }
        }
        we(l, f, c, i, h, b, e, n);
        return;
      case "select":
        g = f = c = s = null;
        for (e in a) if (i = a[e], a.hasOwnProperty(e) && i != null) switch (e) {
          case "value":
            break;
          case "multiple":
            g = i;
          default:
            u.hasOwnProperty(e) || fl(l, t, e, null, u, i);
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
            e !== i && fl(l, t, n, e, u, i);
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
            fl(l, t, c, null, u, n);
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
            n !== e && fl(l, t, f, n, u, e);
        }
        Ei(l, s, g);
        return;
      case "option":
        for (var N in a) if (s = a[N], a.hasOwnProperty(N) && s != null && !u.hasOwnProperty(N)) switch (N) {
          case "selected":
            l.selected = !1;
            break;
          default:
            fl(l, t, N, null, u, s);
        }
        for (i in u) if (s = u[i], g = a[i], u.hasOwnProperty(i) && s !== g && (s != null || g != null)) switch (i) {
          case "selected":
            l.selected = s && typeof s != "function" && typeof s != "symbol";
            break;
          default:
            fl(l, t, i, s, u, g);
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
        for (var p in a) s = a[p], a.hasOwnProperty(p) && s != null && !u.hasOwnProperty(p) && fl(l, t, p, null, u, s);
        for (h in u) if (s = u[h], g = a[h], u.hasOwnProperty(h) && s !== g && (s != null || g != null)) switch (h) {
          case "children":
          case "dangerouslySetInnerHTML":
            if (s != null) throw Error(S(137, t));
            break;
          default:
            fl(l, t, h, s, u, g);
        }
        return;
      default:
        if (Fe(t)) {
          for (var cl in a) s = a[cl], a.hasOwnProperty(cl) && s !== void 0 && !u.hasOwnProperty(cl) && rc(l, t, cl, void 0, u, s);
          for (b in u) s = u[b], g = a[b], !u.hasOwnProperty(b) || s === g || s === void 0 && g === void 0 || rc(l, t, b, s, u, g);
          return;
        }
    }
    for (var m in a) s = a[m], a.hasOwnProperty(m) && s != null && !u.hasOwnProperty(m) && fl(l, t, m, null, u, s);
    for (T in u) s = u[T], g = a[T], !u.hasOwnProperty(T) || s === g || s == null && g == null || fl(l, t, T, s, u, g);
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
            var b = i.transferSize, T = i.initiatorType;
            b && M1(T) && (i = i.responseEnd, f += b * (i < c ? 1 : (c - h) / (i - h)));
          }
          if (--u, t += 8 * (e + f) / (n.duration / 1e3), l++, 10 < l) break;
        }
      }
      if (0 < l) return t / l / 1e6;
    }
    return navigator.connection && (l = navigator.connection.downlink, typeof l == "number") ? l : 5;
  }
  var jc = null, Gc = null;
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
  var U1 = typeof setTimeout == "function" ? setTimeout : void 0, Xm = typeof clearTimeout == "function" ? clearTimeout : void 0, N1 = typeof Promise == "function" ? Promise : void 0, Qm = typeof queueMicrotask == "function" ? queueMicrotask : typeof N1 < "u" ? function(l) {
    return N1.resolve(null).then(l).catch(Zm);
  } : U1;
  function Zm(l) {
    setTimeout(function() {
      throw l;
    });
  }
  function ha(l) {
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
  function Vm(l, t, a, u) {
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
  function Lm(l, t, a) {
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
  function Km(l, t) {
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
  function R1(l) {
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
  function p1(l, t, a) {
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
  var st = /* @__PURE__ */ new Map(), C1 = /* @__PURE__ */ new Set();
  function Oe(l) {
    return typeof l.getRootNode == "function" ? l.getRootNode() : l.nodeType === 9 ? l : l.ownerDocument;
  }
  var Jt = D.d;
  D.d = {
    f: xm,
    r: Jm,
    D: Wm,
    C: wm,
    L: $m,
    m: Fm,
    X: Im,
    S: km,
    M: Pm
  };
  function xm() {
    var l = Jt.f(), t = ge();
    return l || t;
  }
  function Jm(l) {
    var t = La(l);
    t !== null && t.tag === 5 && t.type === "form" ? lv(t) : Jt.r(l);
  }
  var _u = typeof document > "u" ? null : document;
  function r1(l, t, a) {
    var u = _u;
    if (u && typeof t == "string" && t) {
      var n = ft(t);
      n = 'link[rel="' + l + '"][href="' + n + '"]', typeof a == "string" && (n += '[crossorigin="' + a + '"]'), C1.has(n) || (C1.add(n), l = {
        rel: l,
        crossOrigin: a,
        href: t
      }, u.querySelector(n) === null && (t = u.createElement("link"), Yl(t, "link", l), Ol(t), u.head.appendChild(t)));
    }
  }
  function Wm(l) {
    Jt.D(l), r1("dns-prefetch", l, null);
  }
  function wm(l, t) {
    Jt.C(l, t), r1("preconnect", l, t);
  }
  function $m(l, t, a) {
    Jt.L(l, t, a);
    var u = _u;
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
      st.has(e) || (l = B({
        rel: "preload",
        href: t === "image" && a && a.imageSrcSet ? void 0 : l,
        as: t
      }, a), st.set(e, l), u.querySelector(n) !== null || t === "style" && u.querySelector(hn(e)) || t === "script" && u.querySelector(Sn(e)) || (t = u.createElement("link"), Yl(t, "link", l), Ol(t), u.head.appendChild(t)));
    }
  }
  function Fm(l, t) {
    Jt.m(l, t);
    var a = _u;
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
      if (!st.has(e) && (l = B({
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
  function km(l, t, a) {
    Jt.S(l, t, a);
    var u = _u;
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
          l = B({
            rel: "stylesheet",
            href: l,
            "data-precedence": t
          }, a), (a = st.get(e)) && xc(l, a);
          var i = f = u.createElement("link");
          Ol(i), Yl(i, "link", l), i._p = new Promise(function(h, b) {
            i.onload = h, i.onerror = b;
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
  function Im(l, t) {
    Jt.X(l, t);
    var a = _u;
    if (a && l) {
      var u = Ka(a).hoistableScripts, n = Au(l), e = u.get(n);
      e || (e = a.querySelector(Sn(n)), e || (l = B({
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
  function Pm(l, t) {
    Jt.M(l, t);
    var a = _u;
    if (a && l) {
      var u = Ka(a).hoistableScripts, n = Au(l), e = u.get(n);
      e || (e = a.querySelector(Sn(n)), e || (l = B({
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
  function j1(l, t, a, u) {
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
          }, st.set(l, a), e || ld(n, l, a, f.state))), t && u === null) throw Error(S(528, ""));
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
  function G1(l) {
    return B({}, l, {
      "data-precedence": l.precedence,
      precedence: null
    });
  }
  function ld(l, t, a, u) {
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
        var n = B({}, a, {
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
        u = G1(a), (n = st.get(n)) && xc(u, n), e = (l.ownerDocument || l).createElement("link"), Ol(e);
        var f = e;
        return f._p = new Promise(function(c, i) {
          f.onload = c, f.onerror = i;
        }), Yl(e, "link", u), t.state.loading |= 4, De(e, a.precedence, l), t.instance = e;
      case "script":
        return e = Au(a.src), (n = l.querySelector(Sn(e))) ? (t.instance = n, Ol(n), n) : (u = a, (n = st.get(e)) && (u = B({}, a), Jc(u, n)), l = l.ownerDocument || l, n = l.createElement("script"), Ol(n), Yl(n, "link", u), l.head.appendChild(n), t.instance = n);
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
  function td(l, t, a) {
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
  function ad(l, t, a, u) {
    if (a.type === "stylesheet" && (typeof u.media != "string" || matchMedia(u.media).matches !== !1) && (a.state.loading & 4) === 0) {
      if (a.instance === null) {
        var n = Eu(u.href), e = t.querySelector(hn(n));
        if (e) {
          t = e._p, t !== null && typeof t == "object" && typeof t.then == "function" && (l.count++, l = Ne.bind(l), t.then(l, l)), a.state.loading |= 4, a.instance = e, Ol(e);
          return;
        }
        e = t.ownerDocument || t, u = G1(u), (n = st.get(n)) && xc(u, n), e = e.createElement("link"), Ol(e);
        var f = e;
        f._p = new Promise(function(c, i) {
          f.onload = c, f.onerror = i;
        }), Yl(e, "link", u), a.instance = e;
      }
      l.stylesheets === null && (l.stylesheets = /* @__PURE__ */ new Map()), l.stylesheets.set(a, t), (t = a.state.preload) && (a.state.loading & 3) === 0 && (l.count++, a = Ne.bind(l), t.addEventListener("load", a), t.addEventListener("error", a));
    }
  }
  var Wc = 0;
  function ud(l, t) {
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
    l.stylesheets = null, l.unsuspend !== null && (l.count++, He = /* @__PURE__ */ new Map(), t.forEach(nd, l), He = null, Ne.call(l));
  }
  function nd(l, t) {
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
    _currentValue: P,
    _currentValue2: P,
    _threadCount: 0
  };
  function ed(l, t, a, u, n, e, f, c, i) {
    this.tag = 1, this.containerInfo = l, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Le(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Le(0), this.hiddenUpdates = Le(null), this.identifierPrefix = u, this.onUncaughtError = n, this.onCaughtError = e, this.onRecoverableError = f, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = i, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function fd(l, t, a, u, n, e, f, c, i, h, b, T) {
    return l = new ed(l, t, a, f, i, h, b, T, c), t = 1, e === !0 && (t |= 24), e = lt(3, null, null, t), l.current = e, e.stateNode = l, t = Uf(), t.refCount++, l.pooledCache = t, t.refCount++, e.memoizedState = {
      element: u,
      isDehydrated: a,
      cache: t
    }, Yf(e), l;
  }
  function cd(l) {
    return l ? (l = lu, l) : lu;
  }
  function L1(l, t, a, u, n, e) {
    n = cd(n), u.context === null ? u.context = n : u.pendingContext = n, u = Ca(t), u.payload = { element: a }, e = e === void 0 ? null : e, e !== null && (u.callback = e), a = ra(l, u, t), a !== null && (Ll(a, l, t), Ju(a, l, t));
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
  function id(l, t, a, u) {
    var n = A.T;
    A.T = null;
    var e = D.p;
    try {
      D.p = 2, $c(l, t, a, u);
    } finally {
      D.p = e, A.T = n;
    }
  }
  function vd(l, t, a, u) {
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
      if (n === null) Cc(l, t, u, Be, a), w1(l, u);
      else if (md(n, l, t, a, u)) u.stopPropagation();
      else if (w1(l, u), t & 4 && -1 < yd.indexOf(l)) {
        for (; n !== null; ) {
          var e = La(n);
          if (e !== null) switch (e.tag) {
            case 3:
              if (e = e.stateNode, e.current.memoizedState.isDehydrated) {
                var f = _a(e.pendingLanes);
                if (f !== 0) {
                  var c = e;
                  for (c.pendingLanes |= 2, c.entangledLanes |= 2; f; ) {
                    var i = 1 << 31 - Il(f);
                    c.entanglements[1] |= i, f &= ~i;
                  }
                  xt(e), (ll & 6) === 0 && (Se = Fl() + 500, vn(0, !1));
                }
              }
              break;
            case 31:
            case 13:
              c = Da(e, 2), c !== null && Ll(c, e, 2), ge(), wc(e, 2);
          }
          if (e = Fc(u), e === null && Cc(l, t, u, Be, a), e === n) break;
          n = e;
        }
        n !== null && u.stopPropagation();
      } else Cc(l, t, u, null, a);
    }
  }
  function Fc(l) {
    return l = Ie(l), kc(l);
  }
  var Be = null;
  function kc(l) {
    if (Be = null, l = Va(l), l !== null) {
      var t = I(l);
      if (t === null) l = null;
      else {
        var a = t.tag;
        if (a === 13) {
          if (l = El(t), l !== null) return l;
          l = null;
        } else if (a === 31) {
          if (l = tl(t), l !== null) return l;
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
        switch (uy()) {
          case ni:
            return 2;
          case ei:
            return 8;
          case Tn:
          case ny:
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
  var Ic = !1, Sa = null, sa = null, ga = null, gn = /* @__PURE__ */ new Map(), on = /* @__PURE__ */ new Map(), oa = [], yd = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");
  function w1(l, t) {
    switch (l) {
      case "focusin":
      case "focusout":
        Sa = null;
        break;
      case "dragenter":
      case "dragleave":
        sa = null;
        break;
      case "mouseover":
      case "mouseout":
        ga = null;
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
  function md(l, t, a, u, n) {
    switch (t) {
      case "focusin":
        return Sa = bn(Sa, l, t, a, u, n), !0;
      case "dragenter":
        return sa = bn(sa, l, t, a, u, n), !0;
      case "mouseover":
        return ga = bn(ga, l, t, a, u, n), !0;
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
      var a = I(t);
      if (a !== null) {
        if (t = a.tag, t === 13) {
          if (t = El(a), t !== null) {
            l.blockedOn = t, hi(l.priority, function() {
              J1(a);
            });
            return;
          }
        } else if (t === 31) {
          if (t = tl(a), t !== null) {
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
  function Re(l) {
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
    Re(l) && a.delete(t);
  }
  function dd() {
    Ic = !1, Sa !== null && Re(Sa) && (Sa = null), sa !== null && Re(sa) && (sa = null), ga !== null && Re(ga) && (ga = null), gn.forEach(F1), on.forEach(F1);
  }
  function pe(l, t) {
    l.blockedOn === t && (l.blockedOn = null, Ic || (Ic = !0, O.unstable_scheduleCallback(O.unstable_NormalPriority, dd)));
  }
  var Ce = null;
  function k1(l) {
    Ce !== l && (Ce = l, O.unstable_scheduleCallback(O.unstable_NormalPriority, function() {
      Ce === l && (Ce = null);
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
      return pe(i, l);
    }
    Sa !== null && pe(Sa, l), sa !== null && pe(sa, l), ga !== null && pe(ga, l), gn.forEach(t), on.forEach(t);
    for (var a = 0; a < oa.length; a++) {
      var u = oa[a];
      u.blockedOn === l && (u.blockedOn = null);
    }
    for (; 0 < oa.length && (a = oa[0], a.blockedOn === null); ) $1(a), a.blockedOn === null && oa.shift();
    if (a = (l.ownerDocument || l).$$reactFormReplay, a != null) for (u = 0; u < a.length; u += 3) {
      var n = a[u], e = a[u + 1], f = n[jl] || null;
      if (typeof e == "function") f || k1(a);
      else if (f) {
        var c = null;
        if (e && e.hasAttribute("formAction")) {
          if (n = e, f = e[jl] || null) c = f.formAction;
          else if (kc(n) !== null) continue;
        } else c = f.action;
        typeof c == "function" ? a[u + 1] = c : (a.splice(u, 3), u -= 3), k1(a);
      }
    }
  }
  function hd() {
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
      for (var a = 0; a < oa.length && t !== 0 && t < oa[a].priority; a++) ;
      oa.splice(a, 0, l), a === 0 && $1(l);
    }
  };
  var I1 = C.version;
  if (I1 !== "19.2.8") throw Error(S(527, I1, "19.2.8"));
  D.findDOMNode = function(l) {
    var t = l._reactInternals;
    if (t === void 0)
      throw typeof l.render == "function" ? Error(S(188)) : (l = Object.keys(l).join(","), Error(S(268, l)));
    return l = E(t), l = l !== null ? r(l) : null, l = l === null ? null : l.stateNode, l;
  };
  var Sd = {
    bundleType: 0,
    version: "19.2.8",
    rendererPackageName: "react-dom",
    currentDispatcherRef: A,
    reconcilerVersion: "19.2.8"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var re = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!re.isDisabled && re.supportsFiber) try {
      Du = re.inject(Sd), kl = re;
    } catch {
    }
  }
  o.createRoot = function(l, t) {
    if (!w(l)) throw Error(S(299));
    var a = !1, u = "", n = vm, e = ym, f = mm;
    return t != null && (t.unstable_strictMode === !0 && (a = !0), t.identifierPrefix !== void 0 && (u = t.identifierPrefix), t.onUncaughtError !== void 0 && (n = t.onUncaughtError), t.onCaughtError !== void 0 && (e = t.onCaughtError), t.onRecoverableError !== void 0 && (f = t.onRecoverableError)), t = fd(l, 1, !1, null, null, a, u, null, n, e, f, hd), l[Nu] = t.current, z1(l), new Pc(t);
  };
})), Ed = /* @__PURE__ */ Ut(((o, O) => {
  function C() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
      try {
        __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(C);
      } catch (j) {
        console.error(j);
      }
  }
  C(), O.exports = _d();
})), Ad = /* @__PURE__ */ Ut(((o) => {
  var O = Symbol.for("react.transitional.element"), C = Symbol.for("react.fragment");
  function j(S, w, I) {
    var El = null;
    if (I !== void 0 && (El = "" + I), w.key !== void 0 && (El = "" + w.key), "key" in w) {
      I = {};
      for (var tl in w) tl !== "key" && (I[tl] = w[tl]);
    } else I = w;
    return w = I.ref, {
      $$typeof: O,
      type: S,
      key: El,
      ref: w !== void 0 ? w : null,
      props: I
    };
  }
  o.Fragment = C, o.jsx = j, o.jsxs = j;
})), Md = /* @__PURE__ */ Ut(((o, O) => {
  O.exports = Ad();
})), Wt = ti(), Od = Ed(), X = Md();
function Dd({ titel: o, symbol: O, beschreibung: C, aktionen: j }) {
  return /* @__PURE__ */ (0, X.jsxs)("div", {
    className: "ara-kopf",
    children: [/* @__PURE__ */ (0, X.jsxs)("div", {
      className: "ara-kopf__text",
      children: [/* @__PURE__ */ (0, X.jsxs)("h1", {
        className: "ara-kopf__titel",
        children: [O && /* @__PURE__ */ (0, X.jsx)("span", {
          className: "ara-kopf__symbol",
          "aria-hidden": "true",
          children: O
        }), o]
      }), C && /* @__PURE__ */ (0, X.jsx)("p", {
        className: "ara-kopf__satz",
        children: C
      })]
    }), j && /* @__PURE__ */ (0, X.jsx)("div", {
      className: "ara-kopf__aktionen",
      children: j
    })]
  });
}
function Ud({ beschriftung: o, children: O }) {
  return /* @__PURE__ */ (0, X.jsxs)("div", { children: [o && /* @__PURE__ */ (0, X.jsx)("div", {
    className: "ara-liste__beschriftung",
    children: o
  }), /* @__PURE__ */ (0, X.jsx)("ul", {
    className: "ara-liste",
    "aria-label": o,
    children: O
  })] });
}
function Nd({ titel: o, symbol: O, hinweis: C, onKlick: j, aktiv: S = !1, kennzeichen: w }) {
  const I = /* @__PURE__ */ (0, X.jsxs)(X.Fragment, { children: [
    O && /* @__PURE__ */ (0, X.jsx)("span", {
      className: "ara-liste__symbol",
      "aria-hidden": "true",
      children: O
    }),
    /* @__PURE__ */ (0, X.jsx)("span", {
      className: "ara-liste__wort",
      children: o
    }),
    C && /* @__PURE__ */ (0, X.jsx)("span", {
      className: "ara-liste__hinweis",
      children: C
    })
  ] });
  return /* @__PURE__ */ (0, X.jsx)("li", { children: j ? /* @__PURE__ */ (0, X.jsx)("button", {
    type: "button",
    className: "ara-liste__eintrag",
    "data-aktiv": S ? "true" : "false",
    "aria-current": S ? "true" : void 0,
    "data-testid": w,
    onClick: j,
    children: I
  }) : /* @__PURE__ */ (0, X.jsx)("div", {
    className: "ara-liste__eintrag",
    "data-aktiv": S ? "true" : "false",
    "data-testid": w,
    children: I
  }) });
}
function Hd({ titel: o, hinweis: O, symbol: C, onKlick: j, kennzeichen: S, children: w }) {
  const I = /* @__PURE__ */ (0, X.jsxs)(X.Fragment, { children: [(o || O || C) && /* @__PURE__ */ (0, X.jsxs)("div", {
    className: "ara-karte__kopf",
    children: [
      C && /* @__PURE__ */ (0, X.jsx)("span", {
        className: "ara-liste__symbol",
        "aria-hidden": "true",
        children: C
      }),
      o && /* @__PURE__ */ (0, X.jsx)("h2", {
        className: "ara-karte__titel",
        children: o
      }),
      O && /* @__PURE__ */ (0, X.jsx)("span", {
        className: "ara-karte__hinweis",
        children: O
      })
    ]
  }), w && /* @__PURE__ */ (0, X.jsx)("div", {
    className: "ara-karte__inhalt",
    children: w
  })] });
  return j ? /* @__PURE__ */ (0, X.jsx)("button", {
    type: "button",
    className: "ara-karte",
    "data-testid": S,
    onClick: j,
    children: I
  }) : /* @__PURE__ */ (0, X.jsx)("div", {
    className: "ara-karte",
    "data-testid": S,
    children: I
  });
}
function qd({ onAbsenden: o, aktionen: O, kennzeichen: C, children: j }) {
  const S = (w) => {
    w.preventDefault(), o?.();
  };
  return /* @__PURE__ */ (0, X.jsxs)("form", {
    className: "ara-formular",
    "data-testid": C,
    onSubmit: S,
    noValidate: !0,
    children: [j, O && /* @__PURE__ */ (0, X.jsx)("div", {
      className: "ara-formular__aktionen",
      children: O
    })]
  });
}
function Yd({ kennung: o, beschriftung: O, hinweis: C, children: j }) {
  return /* @__PURE__ */ (0, X.jsxs)("div", {
    className: "ara-feld",
    children: [
      /* @__PURE__ */ (0, X.jsx)("label", {
        className: "ara-feld__beschriftung",
        htmlFor: o,
        children: O
      }),
      j,
      C && /* @__PURE__ */ (0, X.jsx)("p", {
        className: "ara-feld__hinweis",
        children: C
      })
    ]
  });
}
function Bd({ art: o = "still", typ: O = "knopf", onKlick: C, gesperrt: j = !1, kennzeichen: S, beschriftung: w, children: I }) {
  return /* @__PURE__ */ (0, X.jsx)("button", {
    type: O === "absenden" ? "submit" : "button",
    className: "ara-knopf",
    "data-art": o,
    "data-testid": S,
    "aria-label": w,
    disabled: j,
    onClick: C,
    children: I
  });
}
function Rd({ art: o = "hinweis", titel: O, kennzeichen: C, children: j }) {
  return /* @__PURE__ */ (0, X.jsxs)("div", {
    className: "ara-meldung",
    "data-art": o,
    "data-testid": C,
    role: o === "fehler" ? "alert" : "status",
    children: [O && /* @__PURE__ */ (0, X.jsx)("p", {
      className: "ara-meldung__titel",
      children: O
    }), j]
  });
}
function P1(o) {
  return o ? [...o.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')] : [];
}
function pd({ offen: o, onSchliessen: O, titel: C = "Menü", kennzeichen: j, children: S }) {
  const w = (0, Wt.useRef)(null), I = (0, Wt.useRef)(null);
  return (0, Wt.useEffect)(() => {
    if (!o) return;
    I.current = document.activeElement;
    const El = (tl) => {
      if (tl.key === "Escape") {
        O();
        return;
      }
      if (tl.key !== "Tab") return;
      const Y = P1(w.current);
      if (Y.length === 0) return;
      const E = Y[0], r = Y[Y.length - 1], B = document.activeElement;
      tl.shiftKey && (B === E || !w.current?.contains(B)) ? (tl.preventDefault(), r.focus()) : !tl.shiftKey && B === r && (tl.preventDefault(), E.focus());
    };
    return document.addEventListener("keydown", El), P1(w.current)[0]?.focus(), () => {
      document.removeEventListener("keydown", El), I.current?.focus?.();
    };
  }, [o, O]), o ? /* @__PURE__ */ (0, X.jsxs)(X.Fragment, { children: [/* @__PURE__ */ (0, X.jsx)("button", {
    type: "button",
    className: "ara-menue__schleier",
    "aria-label": `${C} schließen`,
    onClick: O
  }), /* @__PURE__ */ (0, X.jsxs)("div", {
    className: "ara-menue",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": C,
    "data-testid": j,
    ref: w,
    children: [/* @__PURE__ */ (0, X.jsxs)("div", {
      className: "ara-menue__kopf",
      children: [/* @__PURE__ */ (0, X.jsx)("span", { children: C }), /* @__PURE__ */ (0, X.jsx)("button", {
        type: "button",
        className: "ara-menue__zu",
        "aria-label": `${C} schließen`,
        onClick: O,
        children: "×"
      })]
    }), /* @__PURE__ */ (0, X.jsx)("div", {
      className: "ara-menue__inhalt",
      children: S
    })]
  })] }) : null;
}
var Cd = "2.0.0", rd = Wt.createElement;
function jd(o, O) {
  (0, Od.createRoot)(O).render(o);
}
var Gd = Wt.Fragment, Xd = Wt.useEffect, Qd = Wt.useMemo, Zd = Wt.useRef, Vd = Wt.useState;
export {
  Cd as FASSUNG,
  Yd as Feld,
  qd as Formular,
  Gd as Fragment,
  Hd as Karte,
  Bd as Knopf,
  Dd as Kopf,
  Ud as Liste,
  Nd as ListenEintrag,
  Rd as Meldung,
  pd as Menue,
  rd as h,
  jd as rendern,
  Xd as useEffect,
  Qd as useMemo,
  Zd as useRef,
  Vd as useState
};
