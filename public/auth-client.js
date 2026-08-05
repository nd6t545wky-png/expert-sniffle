// <define:process.env>
var define_process_env_default = {};

// node_modules/.pnpm/better-auth@1.6.23_@cloudflare+workers-types@5.20260714.1/node_modules/better-auth/dist/client/broadcast-channel.mjs
var kBroadcastChannel = Symbol.for("better-auth:broadcast-channel");
var now = () => Math.floor(Date.now() / 1e3);
var WindowBroadcastChannel = class {
  listeners = /* @__PURE__ */ new Set();
  name;
  constructor(name = "better-auth.message") {
    this.name = name;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  post(message) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(this.name, JSON.stringify({
        ...message,
        timestamp: now()
      }));
    } catch {
    }
  }
  setup() {
    if (typeof window === "undefined" || typeof window.addEventListener === "undefined") return () => {
    };
    const handler = (event) => {
      if (event.key !== this.name) return;
      const message = JSON.parse(event.newValue ?? "{}");
      if (message?.event !== "session" || !message?.data) return;
      this.listeners.forEach((listener) => listener(message));
    };
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("storage", handler);
    };
  }
};
function getGlobalBroadcastChannel(name = "better-auth.message") {
  if (!globalThis[kBroadcastChannel]) globalThis[kBroadcastChannel] = new WindowBroadcastChannel(name);
  return globalThis[kBroadcastChannel];
}

// node_modules/.pnpm/nanostores@1.4.0/node_modules/nanostores/clean-stores/index.js
var clean = Symbol("clean");

// node_modules/.pnpm/nanostores@1.4.0/node_modules/nanostores/atom/index.js
var listenerQueue = [];
var lqIndex = 0;
var batchSeen = null;
var QUEUE_ITEMS_PER_LISTENER = 4;
var nanostoresGlobal = globalThis.nanostoresGlobal ||= { epoch: 0 };
var drainQueue = () => {
  for (lqIndex = 0; lqIndex < listenerQueue.length; lqIndex += QUEUE_ITEMS_PER_LISTENER) {
    listenerQueue[lqIndex](
      listenerQueue[lqIndex + 1].value,
      listenerQueue[lqIndex + 2],
      listenerQueue[lqIndex + 3]
    );
  }
  listenerQueue.length = 0;
};
var atom = /* @__NO_SIDE_EFFECTS__ */ (initialValue) => {
  let listeners = [];
  let $atom = {
    get() {
      if (!$atom.lc) {
        $atom.listen(() => {
        })();
      }
      return $atom.value;
    },
    init: initialValue,
    lc: 0,
    listen(listener) {
      $atom.lc = listeners.push(listener);
      return () => {
        for (let i = lqIndex + QUEUE_ITEMS_PER_LISTENER; i < listenerQueue.length; ) {
          if (listenerQueue[i] === listener) {
            listenerQueue.splice(i, QUEUE_ITEMS_PER_LISTENER);
          } else {
            i += QUEUE_ITEMS_PER_LISTENER;
          }
        }
        let index = listeners.indexOf(listener);
        if (~index) {
          listeners.splice(index, 1);
          if (!--$atom.lc) $atom.off();
        }
      };
    },
    notify(oldValue, changedKey) {
      nanostoresGlobal.epoch++;
      let runListenerQueue = !listenerQueue.length && !batchSeen;
      for (let listener of listeners) {
        if (batchSeen?.has(listener)) continue;
        batchSeen?.add(listener);
        listenerQueue.push(
          listener,
          $atom,
          oldValue,
          batchSeen ? void 0 : changedKey
        );
      }
      if (runListenerQueue) {
        drainQueue();
      }
    },
    /* It will be called on last listener unsubscribing.
       We will redefine it in onMount and onStop. */
    off() {
    },
    set(newValue) {
      let oldValue = $atom.value;
      if (oldValue !== newValue) {
        $atom.value = newValue;
        $atom.notify(oldValue);
      }
    },
    subscribe(listener) {
      let unbind = $atom.listen(listener);
      listener($atom.value);
      return unbind;
    },
    value: initialValue
  };
  if (true) {
    $atom[clean] = () => {
      listeners = [];
      $atom.lc = 0;
      $atom.off();
    };
  }
  return $atom;
};

// node_modules/.pnpm/nanostores@1.4.0/node_modules/nanostores/lifecycle/index.js
var SET = 2;
var MOUNT = 5;
var UNMOUNT = 6;
var REVERT_MUTATION = 10;
var on = (object, listener, eventKey, mutateStore) => {
  object.events = object.events || {};
  if (!object.events[eventKey + REVERT_MUTATION]) {
    object.events[eventKey + REVERT_MUTATION] = mutateStore((eventProps) => {
      object.events[eventKey].reduceRight((event, l) => (l(event), event), {
        shared: {},
        ...eventProps
      });
    });
  }
  object.events[eventKey] = object.events[eventKey] || [];
  object.events[eventKey].push(listener);
  return () => {
    let currentListeners = object.events[eventKey];
    let index = currentListeners.indexOf(listener);
    currentListeners.splice(index, 1);
    if (!currentListeners.length) {
      delete object.events[eventKey];
      object.events[eventKey + REVERT_MUTATION]();
      delete object.events[eventKey + REVERT_MUTATION];
    }
  };
};
var onSet = ($store, listener) => on($store, listener, SET, (runListeners) => {
  let originSet = $store.set;
  let originSetKey = $store.setKey;
  if ($store.setKey) {
    $store.setKey = (changed, changedValue) => {
      let isAborted;
      let abort = () => {
        isAborted = true;
      };
      runListeners({
        abort,
        changed,
        newValue: { ...$store.value, [changed]: changedValue }
      });
      if (!isAborted) return originSetKey(changed, changedValue);
    };
  }
  $store.set = (newValue) => {
    let isAborted;
    let abort = () => {
      isAborted = true;
    };
    runListeners({ abort, newValue });
    if (!isAborted) return originSet(newValue);
  };
  return () => {
    $store.set = originSet;
    $store.setKey = originSetKey;
  };
});
var STORE_UNMOUNT_DELAY = 1e3;
var onMount = ($store, initialize) => {
  let listener = (payload) => {
    let destroy = initialize(payload);
    if (destroy) $store.events[UNMOUNT].push(destroy);
  };
  return on($store, listener, MOUNT, (runListeners) => {
    let originListen = $store.listen;
    $store.listen = (...args) => {
      if (!$store.lc && !$store.active) {
        $store.active = true;
        runListeners();
      }
      return originListen(...args);
    };
    let originOff = $store.off;
    $store.events[UNMOUNT] = [];
    $store.off = () => {
      originOff();
      setTimeout(() => {
        if ($store.active && !$store.lc) {
          $store.active = false;
          for (let destroy of $store.events[UNMOUNT]) destroy();
          $store.events[UNMOUNT] = [];
        }
      }, STORE_UNMOUNT_DELAY);
    };
    if (true) {
      let originClean = $store[clean];
      $store[clean] = () => {
        for (let destroy of $store.events[UNMOUNT]) destroy();
        $store.events[UNMOUNT] = [];
        $store.active = false;
        originClean();
      };
    }
    return () => {
      $store.listen = originListen;
      $store.off = originOff;
    };
  });
};

// node_modules/.pnpm/better-auth@1.6.23_@cloudflare+workers-types@5.20260714.1/node_modules/better-auth/dist/client/equality.mjs
function isPlainObject(value) {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function isJsonEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!isJsonEqual(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) if (!(key in b) || !isJsonEqual(a[key], b[key])) return false;
    return true;
  }
  return false;
}
function withEquality(store, isEqual) {
  return onSet(store, ({ newValue, abort }) => {
    if (isEqual(store.value, newValue)) abort();
  });
}

// node_modules/.pnpm/better-auth@1.6.23_@cloudflare+workers-types@5.20260714.1/node_modules/better-auth/dist/client/focus-manager.mjs
var kFocusManager = Symbol.for("better-auth:focus-manager");
var WindowFocusManager = class {
  listeners = /* @__PURE__ */ new Set();
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  setFocused(focused) {
    this.listeners.forEach((listener) => listener(focused));
  }
  setup() {
    if (typeof window === "undefined" || typeof document === "undefined" || typeof window.addEventListener === "undefined") return () => {
    };
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") this.setFocused(true);
    };
    document.addEventListener("visibilitychange", visibilityHandler, false);
    return () => {
      document.removeEventListener("visibilitychange", visibilityHandler, false);
    };
  }
};
function getGlobalFocusManager() {
  if (!globalThis[kFocusManager]) globalThis[kFocusManager] = new WindowFocusManager();
  return globalThis[kFocusManager];
}

// node_modules/.pnpm/better-auth@1.6.23_@cloudflare+workers-types@5.20260714.1/node_modules/better-auth/dist/client/online-manager.mjs
var kOnlineManager = Symbol.for("better-auth:online-manager");
var WindowOnlineManager = class {
  listeners = /* @__PURE__ */ new Set();
  isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  setOnline(online) {
    this.isOnline = online;
    this.listeners.forEach((listener) => listener(online));
  }
  setup() {
    if (typeof window === "undefined" || typeof window.addEventListener === "undefined") return () => {
    };
    const onOnline = () => this.setOnline(true);
    const onOffline = () => this.setOnline(false);
    window.addEventListener("online", onOnline, false);
    window.addEventListener("offline", onOffline, false);
    return () => {
      window.removeEventListener("online", onOnline, false);
      window.removeEventListener("offline", onOffline, false);
    };
  }
};
function getGlobalOnlineManager() {
  if (!globalThis[kOnlineManager]) globalThis[kOnlineManager] = new WindowOnlineManager();
  return globalThis[kOnlineManager];
}

// node_modules/.pnpm/better-auth@1.6.23_@cloudflare+workers-types@5.20260714.1/node_modules/better-auth/dist/client/parser.mjs
var PROTO_POLLUTION_PATTERNS = {
  proto: /"(?:_|\\u0{2}5[Ff]){2}(?:p|\\u0{2}70)(?:r|\\u0{2}72)(?:o|\\u0{2}6[Ff])(?:t|\\u0{2}74)(?:o|\\u0{2}6[Ff])(?:_|\\u0{2}5[Ff]){2}"\s*:/,
  constructor: /"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/,
  protoShort: /"__proto__"\s*:/,
  constructorShort: /"constructor"\s*:/
};
var JSON_SIGNATURE = /^\s*["[{]|^\s*-?\d{1,16}(\.\d{1,17})?([Ee][+-]?\d+)?\s*$/;
var SPECIAL_VALUES = {
  true: true,
  false: false,
  null: null,
  undefined: void 0,
  nan: NaN,
  infinity: Number.POSITIVE_INFINITY,
  "-infinity": Number.NEGATIVE_INFINITY
};
var ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;
function isValidDate(date) {
  return date instanceof Date && !isNaN(date.getTime());
}
function parseISODate(value) {
  const match = ISO_DATE_REGEX.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, ms, offsetSign, offsetHour, offsetMinute] = match;
  const date = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), parseInt(hour, 10), parseInt(minute, 10), parseInt(second, 10), ms ? parseInt(ms.padEnd(3, "0"), 10) : 0));
  if (offsetSign) {
    const offset = (parseInt(offsetHour, 10) * 60 + parseInt(offsetMinute, 10)) * (offsetSign === "+" ? -1 : 1);
    date.setUTCMinutes(date.getUTCMinutes() + offset);
  }
  return isValidDate(date) ? date : null;
}
function betterJSONParse(value, options = {}) {
  const { strict = false, warnings = false, reviver, parseDates = true } = options;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const lowerValue = trimmed.toLowerCase();
  if (lowerValue.length <= 9 && lowerValue in SPECIAL_VALUES) return SPECIAL_VALUES[lowerValue];
  if (!JSON_SIGNATURE.test(trimmed)) {
    if (strict) throw new SyntaxError("[better-json] Invalid JSON");
    return value;
  }
  if (Object.entries(PROTO_POLLUTION_PATTERNS).some(([key, pattern]) => {
    const matches = pattern.test(trimmed);
    if (matches && warnings) console.warn(`[better-json] Detected potential prototype pollution attempt using ${key} pattern`);
    return matches;
  }) && strict) throw new Error("[better-json] Potential prototype pollution attempt detected");
  try {
    const secureReviver = (key, value2) => {
      if (key === "__proto__" || key === "constructor" && value2 && typeof value2 === "object" && "prototype" in value2) {
        if (warnings) console.warn(`[better-json] Dropping "${key}" key to prevent prototype pollution`);
        return;
      }
      if (parseDates && typeof value2 === "string") {
        const date = parseISODate(value2);
        if (date) return date;
      }
      return reviver ? reviver(key, value2) : value2;
    };
    return JSON.parse(trimmed, secureReviver);
  } catch (error) {
    if (strict) throw error;
    return value;
  }
}
function parseJSON(value, options = { strict: true }) {
  return betterJSONParse(value, options);
}

// node_modules/.pnpm/better-auth@1.6.23_@cloudflare+workers-types@5.20260714.1/node_modules/better-auth/dist/client/query.mjs
var isServer = () => typeof window === "undefined";
function isAuthQueryStateEqual(a, b) {
  return isJsonEqual(a.data, b.data) && a.error === b.error && a.isPending === b.isPending && a.isRefetching === b.isRefetching && a.refetch === b.refetch;
}
var useAuthQuery = (initializedAtom, path, $fetch, options) => {
  const value = atom({
    data: null,
    error: null,
    isPending: true,
    isRefetching: false,
    refetch: (queryParams) => fn(queryParams)
  });
  withEquality(value, isAuthQueryStateEqual);
  const fn = async (queryParams) => {
    return new Promise((resolve) => {
      const opts = typeof options === "function" ? options({
        data: value.get().data,
        error: value.get().error,
        isPending: value.get().isPending
      }) : options;
      $fetch(path, {
        ...opts,
        query: {
          ...opts?.query,
          ...queryParams?.query
        },
        async onSuccess(context) {
          const current = value.get();
          const stableData = current.data != null && context.data != null && isJsonEqual(current.data, context.data) ? current.data : context.data;
          value.set({
            data: stableData,
            error: null,
            isPending: false,
            isRefetching: false,
            refetch: value.value.refetch
          });
          await opts?.onSuccess?.(context);
        },
        async onError(context) {
          const { request } = context;
          const retryAttempts = typeof request.retry === "number" ? request.retry : request.retry?.attempts;
          const retryAttempt = request.retryAttempt || 0;
          if (retryAttempts && retryAttempt < retryAttempts) return;
          const isUnauthorized = context.error.status === 401;
          value.set({
            error: context.error,
            data: isUnauthorized ? null : value.get().data,
            isPending: false,
            isRefetching: false,
            refetch: value.value.refetch
          });
          await opts?.onError?.(context);
        },
        async onRequest(context) {
          const currentValue = value.get();
          value.set({
            isPending: currentValue.data === null,
            data: currentValue.data,
            error: null,
            isRefetching: true,
            refetch: value.value.refetch
          });
          await opts?.onRequest?.(context);
        }
      }).catch((error) => {
        value.set({
          error,
          data: value.get().data,
          isPending: false,
          isRefetching: false,
          refetch: value.value.refetch
        });
      }).finally(() => {
        resolve(void 0);
      });
    });
  };
  initializedAtom = Array.isArray(initializedAtom) ? initializedAtom : [initializedAtom];
  let isInitialized = false;
  const cleanups = [];
  for (const initAtom of initializedAtom) {
    const unbind = initAtom.subscribe(async () => {
      if (isServer()) return;
      if (isInitialized) await fn();
      else onMount(value, () => {
        const timeoutId = setTimeout(async () => {
          if (!isInitialized) {
            isInitialized = true;
            await fn();
          }
        }, 0);
        return () => {
          for (const u of cleanups) u();
          clearTimeout(timeoutId);
        };
      });
    });
    cleanups.push(unbind);
  }
  return value;
};

// node_modules/.pnpm/better-auth@1.6.23_@cloudflare+workers-types@5.20260714.1/node_modules/better-auth/dist/client/session-refresh.mjs
var now2 = () => Math.floor(Date.now() / 1e3);
var FOCUS_REFETCH_RATE_LIMIT_SECONDS = 5;
function createSessionRefreshManager(opts) {
  const { fetchSession, shouldPollSession = () => true, sessionSignal, options = {} } = opts;
  const refetchInterval = options.sessionOptions?.refetchInterval ?? 0;
  const refetchOnWindowFocus = options.sessionOptions?.refetchOnWindowFocus ?? true;
  const refetchWhenOffline = options.sessionOptions?.refetchWhenOffline ?? false;
  const state = {
    isInitialized: false,
    lastSessionRequest: 0
  };
  const shouldRefetch = () => {
    return refetchWhenOffline || getGlobalOnlineManager().isOnline;
  };
  const triggerRefetch = (event) => {
    if (!shouldRefetch()) return;
    if (event?.event === "storage") {
      fetchSession();
      return;
    }
    if (event?.event === "poll") {
      state.lastSessionRequest = now2();
      fetchSession();
      return;
    }
    if (event?.event === "visibilitychange") {
      if (now2() - state.lastSessionRequest < FOCUS_REFETCH_RATE_LIMIT_SECONDS) return;
      state.lastSessionRequest = now2();
      fetchSession();
      return;
    }
    fetchSession();
  };
  const broadcastSessionUpdate = (trigger) => {
    getGlobalBroadcastChannel().post({
      event: "session",
      data: { trigger },
      clientId: Math.random().toString(36).substring(7)
    });
  };
  const setupPolling = () => {
    if (refetchInterval && refetchInterval > 0) state.pollInterval = setInterval(() => {
      if (shouldPollSession()) triggerRefetch({ event: "poll" });
    }, refetchInterval * 1e3);
  };
  const setupBroadcast = () => {
    state.unsubscribeBroadcast = getGlobalBroadcastChannel().subscribe(() => {
      triggerRefetch({ event: "storage" });
    });
  };
  const setupFocusRefetch = () => {
    if (!refetchOnWindowFocus) return;
    state.unsubscribeFocus = getGlobalFocusManager().subscribe(() => {
      triggerRefetch({ event: "visibilitychange" });
    });
  };
  const setupOnlineRefetch = () => {
    state.unsubscribeOnline = getGlobalOnlineManager().subscribe((online) => {
      if (online) triggerRefetch({ event: "visibilitychange" });
    });
  };
  const setupSignalSubscription = () => {
    state.unsubscribeSignal = sessionSignal.listen(() => {
      fetchSession();
    });
  };
  const init = () => {
    if (state.isInitialized) return;
    state.isInitialized = true;
    setupPolling();
    setupBroadcast();
    setupFocusRefetch();
    setupOnlineRefetch();
    setupSignalSubscription();
    state.cleanupBroadcastSetup = getGlobalBroadcastChannel().setup();
    state.cleanupFocusSetup = getGlobalFocusManager().setup();
    state.cleanupOnlineSetup = getGlobalOnlineManager().setup();
  };
  const cleanup = () => {
    if (!state.isInitialized) return;
    if (state.pollInterval) {
      clearInterval(state.pollInterval);
      state.pollInterval = void 0;
    }
    if (state.unsubscribeBroadcast) {
      state.unsubscribeBroadcast();
      state.unsubscribeBroadcast = void 0;
    }
    if (state.unsubscribeFocus) {
      state.unsubscribeFocus();
      state.unsubscribeFocus = void 0;
    }
    if (state.unsubscribeOnline) {
      state.unsubscribeOnline();
      state.unsubscribeOnline = void 0;
    }
    if (state.unsubscribeSignal) {
      state.unsubscribeSignal();
      state.unsubscribeSignal = void 0;
    }
    if (state.cleanupBroadcastSetup) {
      state.cleanupBroadcastSetup();
      state.cleanupBroadcastSetup = void 0;
    }
    if (state.cleanupFocusSetup) {
      state.cleanupFocusSetup();
      state.cleanupFocusSetup = void 0;
    }
    if (state.cleanupOnlineSetup) {
      state.cleanupOnlineSetup();
      state.cleanupOnlineSetup = void 0;
    }
    state.isInitialized = false;
    state.lastSessionRequest = 0;
  };
  return {
    init,
    cleanup,
    triggerRefetch,
    broadcastSessionUpdate
  };
}

// node_modules/.pnpm/@better-auth+core@1.6.23_@better-auth+utils@0.4.2_@better-fetch+fetch@1.3.1_@cloudflare_3a1f226e012cb7342e731f513cafc346/node_modules/@better-auth/core/dist/env/env-impl.mjs
var _envShim = /* @__PURE__ */ Object.create(null);
var _getEnv = (useShim) => globalThis.process?.env || globalThis.Deno?.env.toObject() || globalThis.__env__ || (useShim ? _envShim : globalThis);
var env = new Proxy(_envShim, {
  get(_, prop) {
    return _getEnv()[prop] ?? _envShim[prop];
  },
  has(_, prop) {
    return prop in _getEnv() || prop in _envShim;
  },
  set(_, prop, value) {
    const env2 = _getEnv(true);
    env2[prop] = value;
    return true;
  },
  deleteProperty(_, prop) {
    if (!prop) return false;
    const env2 = _getEnv(true);
    delete env2[prop];
    return true;
  },
  ownKeys() {
    const env2 = _getEnv(true);
    return Object.keys(env2);
  }
});
var nodeENV = env.NODE_ENV ?? "";
function getEnvVar(key, fallback) {
  if (typeof process !== "undefined" && define_process_env_default) return define_process_env_default[key] ?? fallback;
  if (typeof Deno !== "undefined") return Deno.env.get(key) ?? fallback;
  if (typeof Bun !== "undefined") return Bun.env[key] ?? fallback;
  return fallback;
}
var ENV = Object.freeze({
  get BETTER_AUTH_SECRET() {
    return getEnvVar("BETTER_AUTH_SECRET");
  },
  get AUTH_SECRET() {
    return getEnvVar("AUTH_SECRET");
  },
  get BETTER_AUTH_TELEMETRY() {
    return getEnvVar("BETTER_AUTH_TELEMETRY");
  },
  get BETTER_AUTH_TELEMETRY_ID() {
    return getEnvVar("BETTER_AUTH_TELEMETRY_ID");
  },
  get NODE_ENV() {
    return getEnvVar("NODE_ENV", "development");
  },
  get PACKAGE_VERSION() {
    return getEnvVar("PACKAGE_VERSION", "0.0.0");
  },
  get BETTER_AUTH_TELEMETRY_ENDPOINT() {
    return getEnvVar("BETTER_AUTH_TELEMETRY_ENDPOINT", "");
  }
});

// node_modules/.pnpm/@better-auth+core@1.6.23_@better-auth+utils@0.4.2_@better-fetch+fetch@1.3.1_@cloudflare_3a1f226e012cb7342e731f513cafc346/node_modules/@better-auth/core/dist/utils/error-codes.mjs
function defineErrorCodes(codes) {
  return Object.fromEntries(Object.entries(codes).map(([key, value]) => [key, {
    code: key,
    message: value,
    toString: () => key
  }]));
}

// node_modules/.pnpm/better-call@1.3.7_zod@4.4.3/node_modules/better-call/dist/error.mjs
function isErrorStackTraceLimitWritable() {
  const desc = Object.getOwnPropertyDescriptor(Error, "stackTraceLimit");
  if (desc === void 0) return Object.isExtensible(Error);
  return Object.prototype.hasOwnProperty.call(desc, "writable") ? desc.writable : desc.set !== void 0;
}
function hideInternalStackFrames(stack) {
  const lines = stack.split("\n    at ");
  if (lines.length <= 1) return stack;
  lines.splice(1, 1);
  return lines.join("\n    at ");
}
function makeErrorForHideStackFrame(Base, clazz) {
  class HideStackFramesError extends Base {
    #hiddenStack;
    constructor(...args) {
      if (isErrorStackTraceLimitWritable()) {
        const limit = Error.stackTraceLimit;
        Error.stackTraceLimit = 0;
        super(...args);
        Error.stackTraceLimit = limit;
      } else super(...args);
      const stack = (/* @__PURE__ */ new Error()).stack;
      if (stack) this.#hiddenStack = hideInternalStackFrames(stack.replace(/^Error/, this.name));
    }
    get errorStack() {
      return this.#hiddenStack;
    }
  }
  Object.defineProperty(HideStackFramesError.prototype, "constructor", {
    get() {
      return clazz;
    },
    enumerable: false,
    configurable: true
  });
  return HideStackFramesError;
}
var statusCodes = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  MULTIPLE_CHOICES: 300,
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  SEE_OTHER: 303,
  NOT_MODIFIED: 304,
  TEMPORARY_REDIRECT: 307,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  NOT_ACCEPTABLE: 406,
  PROXY_AUTHENTICATION_REQUIRED: 407,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  GONE: 410,
  LENGTH_REQUIRED: 411,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  URI_TOO_LONG: 414,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RANGE_NOT_SATISFIABLE: 416,
  EXPECTATION_FAILED: 417,
  "I'M_A_TEAPOT": 418,
  MISDIRECTED_REQUEST: 421,
  UNPROCESSABLE_ENTITY: 422,
  LOCKED: 423,
  FAILED_DEPENDENCY: 424,
  TOO_EARLY: 425,
  UPGRADE_REQUIRED: 426,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
  UNAVAILABLE_FOR_LEGAL_REASONS: 451,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
  HTTP_VERSION_NOT_SUPPORTED: 505,
  VARIANT_ALSO_NEGOTIATES: 506,
  INSUFFICIENT_STORAGE: 507,
  LOOP_DETECTED: 508,
  NOT_EXTENDED: 510,
  NETWORK_AUTHENTICATION_REQUIRED: 511
};
var InternalAPIError = class extends Error {
  constructor(status = "INTERNAL_SERVER_ERROR", body = void 0, headers = {}, statusCode = typeof status === "number" ? status : statusCodes[status]) {
    super(body?.message, body?.cause ? { cause: body.cause } : void 0);
    this.status = status;
    this.body = body;
    this.headers = headers;
    this.statusCode = statusCode;
    this.name = "APIError";
    this.status = status;
    this.headers = headers;
    this.statusCode = statusCode;
    this.body = body;
  }
};
var kAPIErrorHeaderSymbol = Symbol.for("better-call:api-error-headers");
var APIError = makeErrorForHideStackFrame(InternalAPIError, Error);

// node_modules/.pnpm/@better-auth+core@1.6.23_@better-auth+utils@0.4.2_@better-fetch+fetch@1.3.1_@cloudflare_3a1f226e012cb7342e731f513cafc346/node_modules/@better-auth/core/dist/error/index.mjs
var BetterAuthError = class extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "BetterAuthError";
    this.message = message;
    this.stack = "";
  }
};

// node_modules/.pnpm/better-auth@1.6.23_@cloudflare+workers-types@5.20260714.1/node_modules/better-auth/dist/utils/url.mjs
var SLASH_CHAR_CODE = "/".charCodeAt(0);
function trimTrailingSlashes(value) {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === SLASH_CHAR_CODE) end--;
  return end === value.length ? value : value.slice(0, end);
}
function checkHasPath(url) {
  try {
    return (trimTrailingSlashes(new URL(url).pathname) || "/") !== "/";
  } catch {
    throw new BetterAuthError(`Invalid base URL: ${url}. Please provide a valid base URL.`);
  }
}
function assertHasProtocol(url) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") throw new BetterAuthError(`Invalid base URL: ${url}. URL must include 'http://' or 'https://'`);
  } catch (error) {
    if (error instanceof BetterAuthError) throw error;
    throw new BetterAuthError(`Invalid base URL: ${url}. Please provide a valid base URL.`, { cause: error });
  }
}
function withPath(url, path = "/api/auth") {
  assertHasProtocol(url);
  if (checkHasPath(url)) return url;
  const trimmedUrl = trimTrailingSlashes(url);
  if (!path || path === "/") return trimmedUrl;
  path = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedUrl}${path}`;
}
function validateProxyHeader(header, type) {
  if (!header || header.trim() === "") return false;
  if (type === "proto") return header === "http" || header === "https";
  if (type === "host") {
    if ([
      /\.\./,
      /\0/,
      /[\s]/,
      /^[.]/,
      /[<>'"]/,
      /javascript:/i,
      /file:/i,
      /data:/i
    ].some((pattern) => pattern.test(header))) return false;
    return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*(:[0-9]{1,5})?$/.test(header) || /^(\d{1,3}\.){3}\d{1,3}(:[0-9]{1,5})?$/.test(header) || /^\[[0-9a-fA-F:]+\](:[0-9]{1,5})?$/.test(header) || /^localhost(:[0-9]{1,5})?$/i.test(header);
  }
  return false;
}
function getBaseURL(url, path, request, loadEnv, trustedProxyHeaders) {
  if (url) return withPath(url, path);
  if (loadEnv !== false) {
    const fromEnv = env.BETTER_AUTH_URL || env.NEXT_PUBLIC_BETTER_AUTH_URL || env.PUBLIC_BETTER_AUTH_URL || env.NUXT_PUBLIC_BETTER_AUTH_URL || env.NUXT_PUBLIC_AUTH_URL || (env.BASE_URL !== "/" ? env.BASE_URL : void 0);
    if (fromEnv) return withPath(fromEnv, path);
  }
  const fromRequest = request?.headers.get("x-forwarded-host");
  const fromRequestProto = request?.headers.get("x-forwarded-proto");
  if (fromRequest && fromRequestProto && trustedProxyHeaders) {
    if (validateProxyHeader(fromRequestProto, "proto") && validateProxyHeader(fromRequest, "host")) try {
      return withPath(`${fromRequestProto}://${fromRequest}`, path);
    } catch (_error) {
    }
  }
  if (request) {
    const url2 = getOrigin(request.url);
    if (!url2) throw new BetterAuthError("Could not get origin from request. Please provide a valid base URL.");
    return withPath(url2, path);
  }
  if (typeof window !== "undefined" && window.location) return withPath(window.location.origin, path);
}
function getOrigin(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.origin === "null" ? null : parsedUrl.origin;
  } catch {
    return null;
  }
}

// node_modules/.pnpm/@better-auth+core@1.6.23_@better-auth+utils@0.4.2_@better-fetch+fetch@1.3.1_@cloudflare_3a1f226e012cb7342e731f513cafc346/node_modules/@better-auth/core/dist/utils/url.mjs
var DANGEROUS_URL_SCHEMES = [
  "javascript:",
  "data:",
  "vbscript:"
];
function isSafeUrlScheme(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return true;
  }
  return !DANGEROUS_URL_SCHEMES.includes(parsed.protocol);
}

// node_modules/.pnpm/better-auth@1.6.23_@cloudflare+workers-types@5.20260714.1/node_modules/better-auth/dist/client/fetch-plugins.mjs
var redirectPlugin = {
  id: "redirect",
  name: "Redirect",
  hooks: { onSuccess(context) {
    if (context.data?.url && context.data?.redirect && isSafeUrlScheme(context.data.url)) {
      if (typeof window !== "undefined" && window.location) {
        if (window.location) try {
          window.location.href = context.data.url;
        } catch {
        }
      }
    }
  } }
};

// node_modules/.pnpm/better-auth@1.6.23_@cloudflare+workers-types@5.20260714.1/node_modules/better-auth/dist/client/session-atom.mjs
var isServer2 = () => typeof window === "undefined";
function normalizeSessionResponse(res) {
  if (typeof res === "object" && res !== null && "data" in res && "error" in res) return res;
  return {
    data: res,
    error: null
  };
}
function normalizeSessionData(data) {
  if (!data) return null;
  if (data.session === null && data.user === null) return null;
  return data;
}
function isSessionAtomEqual(a, b) {
  return isJsonEqual(a.data, b.data) && a.error === b.error && a.isPending === b.isPending && a.isRefetching === b.isRefetching && a.refetch === b.refetch;
}
function getSessionAtom($fetch, options) {
  const $signal = atom(false);
  let abortController;
  const refetch = (queryParams) => fetchSession(queryParams);
  const session = atom({
    data: null,
    error: null,
    isPending: true,
    isRefetching: false,
    refetch
  });
  withEquality(session, isSessionAtomEqual);
  const settleAbortedFetch = (controller) => {
    if (abortController !== controller) return;
    const current = session.get();
    abortController = void 0;
    if (!current.isPending && !current.isRefetching) return;
    session.set({
      ...current,
      isPending: false,
      isRefetching: false,
      refetch
    });
  };
  const fetchSession = async (queryParams) => {
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;
    const current = session.get();
    session.set({
      ...current,
      isPending: current.data === null,
      isRefetching: true,
      error: null,
      refetch
    });
    try {
      const res = await $fetch("/get-session", {
        method: "GET",
        query: queryParams?.query,
        signal: controller.signal
      });
      if (controller.signal.aborted) {
        settleAbortedFetch(controller);
        return;
      }
      let { data, error } = normalizeSessionResponse(res);
      if (data?.needsRefresh) try {
        const refreshRes = await $fetch("/get-session", {
          method: "POST",
          signal: controller.signal
        });
        if (controller.signal.aborted) {
          settleAbortedFetch(controller);
          return;
        }
        ({ data, error } = normalizeSessionResponse(refreshRes));
      } catch {
        if (controller.signal.aborted) {
          settleAbortedFetch(controller);
          return;
        }
      }
      if (error) {
        const latest = session.get();
        const isUnauthorized = error?.status === 401;
        session.set({
          data: isUnauthorized ? null : latest.data,
          error,
          isPending: false,
          isRefetching: false,
          refetch
        });
        return;
      }
      const sessionData = normalizeSessionData(data);
      const current2 = session.get();
      const stableData = current2.data != null && sessionData != null && isJsonEqual(current2.data, sessionData) ? current2.data : sessionData;
      session.set({
        data: stableData,
        error: null,
        isPending: false,
        isRefetching: false,
        refetch
      });
    } catch (fetchError) {
      if (controller.signal.aborted) {
        settleAbortedFetch(controller);
        return;
      }
      const latest = session.get();
      session.set({
        data: latest.data,
        error: fetchError,
        isPending: false,
        isRefetching: false,
        refetch
      });
    }
  };
  let broadcastSessionUpdate = () => {
  };
  onMount(session, () => {
    let timeoutId;
    if (!isServer2()) timeoutId = setTimeout(() => {
      fetchSession();
    }, 0);
    const refreshManager = createSessionRefreshManager({
      fetchSession,
      shouldPollSession: () => session.get().data != null,
      sessionSignal: $signal,
      options
    });
    refreshManager.init();
    broadcastSessionUpdate = refreshManager.broadcastSessionUpdate;
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      const controller = abortController;
      controller?.abort();
      if (controller) settleAbortedFetch(controller);
      refreshManager.cleanup();
    };
  });
  return {
    session,
    $sessionSignal: $signal,
    broadcastSessionUpdate: (trigger) => broadcastSessionUpdate(trigger)
  };
}

// node_modules/.pnpm/defu@6.1.7/node_modules/defu/dist/defu.mjs
function isPlainObject2(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype && Object.getPrototypeOf(prototype) !== null) {
    return false;
  }
  if (Symbol.iterator in value) {
    return false;
  }
  if (Symbol.toStringTag in value) {
    return Object.prototype.toString.call(value) === "[object Module]";
  }
  return true;
}
function _defu(baseObject, defaults, namespace = ".", merger) {
  if (!isPlainObject2(defaults)) {
    return _defu(baseObject, {}, namespace, merger);
  }
  const object = { ...defaults };
  for (const key of Object.keys(baseObject)) {
    if (key === "__proto__" || key === "constructor") {
      continue;
    }
    const value = baseObject[key];
    if (value === null || value === void 0) {
      continue;
    }
    if (merger && merger(object, key, value, namespace)) {
      continue;
    }
    if (Array.isArray(value) && Array.isArray(object[key])) {
      object[key] = [...value, ...object[key]];
    } else if (isPlainObject2(value) && isPlainObject2(object[key])) {
      object[key] = _defu(
        value,
        object[key],
        (namespace ? `${namespace}.` : "") + key.toString(),
        merger
      );
    } else {
      object[key] = value;
    }
  }
  return object;
}
function createDefu(merger) {
  return (...arguments_) => (
    // eslint-disable-next-line unicorn/no-array-reduce
    arguments_.reduce((p, c) => _defu(p, c, "", merger), {})
  );
}
var defu = createDefu();
var defuFn = createDefu((object, key, currentValue) => {
  if (object[key] !== void 0 && typeof currentValue === "function") {
    object[key] = currentValue(object[key]);
    return true;
  }
});
var defuArrayFn = createDefu((object, key, currentValue) => {
  if (Array.isArray(object[key]) && typeof currentValue === "function") {
    object[key] = currentValue(object[key]);
    return true;
  }
});

// node_modules/.pnpm/@better-fetch+fetch@1.3.1/node_modules/@better-fetch/fetch/dist/index.js
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var BetterFetchError = class extends Error {
  constructor(status, statusText, error) {
    super(statusText || status.toString(), {
      cause: error
    });
    this.status = status;
    this.statusText = statusText;
    this.error = error;
    Error.captureStackTrace(this, this.constructor);
  }
};
var initializePlugins = async (url, options) => {
  var _a, _b, _c, _d, _e, _f;
  let opts = options || {};
  const hooks = {
    onRequest: [options == null ? void 0 : options.onRequest],
    onResponse: [options == null ? void 0 : options.onResponse],
    onSuccess: [options == null ? void 0 : options.onSuccess],
    onError: [options == null ? void 0 : options.onError],
    onRetry: [options == null ? void 0 : options.onRetry]
  };
  if (!options || !(options == null ? void 0 : options.plugins)) {
    return {
      url,
      options: opts,
      hooks
    };
  }
  for (const plugin of (options == null ? void 0 : options.plugins) || []) {
    if (plugin.init) {
      const pluginRes = await ((_a = plugin.init) == null ? void 0 : _a.call(plugin, url.toString(), options));
      opts = pluginRes.options || opts;
      url = pluginRes.url;
    }
    hooks.onRequest.push((_b = plugin.hooks) == null ? void 0 : _b.onRequest);
    hooks.onResponse.push((_c = plugin.hooks) == null ? void 0 : _c.onResponse);
    hooks.onSuccess.push((_d = plugin.hooks) == null ? void 0 : _d.onSuccess);
    hooks.onError.push((_e = plugin.hooks) == null ? void 0 : _e.onError);
    hooks.onRetry.push((_f = plugin.hooks) == null ? void 0 : _f.onRetry);
  }
  return {
    url,
    options: opts,
    hooks
  };
};
var LinearRetryStrategy = class {
  constructor(options) {
    this.options = options;
  }
  shouldAttemptRetry(attempt, response) {
    if (this.options.shouldRetry) {
      return Promise.resolve(
        attempt < this.options.attempts && this.options.shouldRetry(response)
      );
    }
    return Promise.resolve(attempt < this.options.attempts);
  }
  getDelay() {
    return this.options.delay;
  }
};
var ExponentialRetryStrategy = class {
  constructor(options) {
    this.options = options;
  }
  shouldAttemptRetry(attempt, response) {
    if (this.options.shouldRetry) {
      return Promise.resolve(
        attempt < this.options.attempts && this.options.shouldRetry(response)
      );
    }
    return Promise.resolve(attempt < this.options.attempts);
  }
  getDelay(attempt) {
    const delay = Math.min(
      this.options.maxDelay,
      this.options.baseDelay * 2 ** attempt
    );
    return delay;
  }
};
function createRetryStrategy(options) {
  if (typeof options === "number") {
    return new LinearRetryStrategy({
      type: "linear",
      attempts: options,
      delay: 1e3
    });
  }
  switch (options.type) {
    case "linear":
      return new LinearRetryStrategy(options);
    case "exponential":
      return new ExponentialRetryStrategy(options);
    default:
      throw new Error("Invalid retry strategy");
  }
}
var getAuthHeader = async (options) => {
  const headers = {};
  const getValue = async (value) => typeof value === "function" ? await value() : value;
  if (options == null ? void 0 : options.auth) {
    if (options.auth.type === "Bearer") {
      const token = await getValue(options.auth.token);
      if (!token) {
        return headers;
      }
      headers["authorization"] = `Bearer ${token}`;
    } else if (options.auth.type === "Basic") {
      const [username, password] = await Promise.all([
        getValue(options.auth.username),
        getValue(options.auth.password)
      ]);
      if (!username || !password) {
        return headers;
      }
      headers["authorization"] = `Basic ${btoa(`${username}:${password}`)}`;
    } else if (options.auth.type === "Custom") {
      const [prefix, value] = await Promise.all([
        getValue(options.auth.prefix),
        getValue(options.auth.value)
      ]);
      if (!value) {
        return headers;
      }
      headers["authorization"] = `${prefix != null ? prefix : ""} ${value}`;
    }
  }
  return headers;
};
var JSON_RE = /^application\/(?:[\w!#$%&*.^`~-]*\+)?json(;.+)?$/i;
function detectResponseType(request) {
  const _contentType = request.headers.get("content-type");
  const textTypes = /* @__PURE__ */ new Set([
    "image/svg",
    "application/xml",
    "application/xhtml",
    "application/html"
  ]);
  if (!_contentType) {
    return "json";
  }
  const contentType = _contentType.split(";").shift() || "";
  if (JSON_RE.test(contentType)) {
    return "json";
  }
  if (textTypes.has(contentType) || contentType.startsWith("text/")) {
    return "text";
  }
  return "blob";
}
function isJSONParsable(value) {
  try {
    JSON.parse(value);
    return true;
  } catch (error) {
    return false;
  }
}
function isJSONSerializable(value) {
  if (value === void 0) {
    return false;
  }
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean" || t === null) {
    return true;
  }
  if (t !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return true;
  }
  if (value.buffer) {
    return false;
  }
  return value.constructor && value.constructor.name === "Object" || typeof value.toJSON === "function";
}
function jsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}
function isFunction(value) {
  return typeof value === "function";
}
function getFetch(options) {
  if (options == null ? void 0 : options.customFetchImpl) {
    return options.customFetchImpl;
  }
  if (typeof globalThis !== "undefined" && isFunction(globalThis.fetch)) {
    return globalThis.fetch;
  }
  if (typeof window !== "undefined" && isFunction(window.fetch)) {
    return window.fetch;
  }
  throw new Error("No fetch implementation found");
}
function mergeHeaders(...sources) {
  const merged = {};
  for (const source of sources) {
    if (!source) {
      continue;
    }
    if (source instanceof Headers) {
      source.forEach((value, key) => {
        merged[key] = value;
      });
    } else {
      const entries = Array.isArray(source) ? source : Object.entries(source);
      for (const [key, value] of entries) {
        if (value !== null && value !== void 0) {
          merged[key] = value;
        }
      }
    }
  }
  return merged;
}
async function getHeaders(opts) {
  const headers = new Headers(mergeHeaders(opts == null ? void 0 : opts.headers, await getAuthHeader(opts)));
  if (!headers.has("content-type")) {
    const contentType = detectContentType(opts == null ? void 0 : opts.body);
    if (contentType) {
      headers.set("content-type", contentType);
    }
  }
  return headers;
}
function detectContentType(body) {
  if (isJSONSerializable(body)) {
    return "application/json";
  }
  return null;
}
function getMediaType(headers) {
  const contentType = headers.get("content-type");
  return contentType ? contentType.split(";")[0].trim().toLowerCase() : null;
}
function getBody(options, headers) {
  const { body } = options;
  if (!body) {
    return null;
  }
  if (!isJSONSerializable(body)) {
    return body;
  }
  if (typeof body === "string") {
    return body;
  }
  if (getMediaType(headers) === "application/x-www-form-urlencoded") {
    return new URLSearchParams(body).toString();
  }
  return JSON.stringify(body);
}
function getMethod(url, options) {
  var _a;
  if (options == null ? void 0 : options.method) {
    return options.method.toUpperCase();
  }
  if (url.startsWith("@")) {
    const pMethod = (_a = url.split("@")[1]) == null ? void 0 : _a.split("/")[0];
    if (!methods.includes(pMethod)) {
      return (options == null ? void 0 : options.body) ? "POST" : "GET";
    }
    return pMethod.toUpperCase();
  }
  return (options == null ? void 0 : options.body) ? "POST" : "GET";
}
function getTimeout(options, controller) {
  let abortTimeout;
  if (!(options == null ? void 0 : options.signal) && (options == null ? void 0 : options.timeout)) {
    abortTimeout = setTimeout(() => controller == null ? void 0 : controller.abort(), options == null ? void 0 : options.timeout);
  }
  return {
    abortTimeout,
    clearTimeout: () => {
      if (abortTimeout) {
        clearTimeout(abortTimeout);
      }
    }
  };
}
var ValidationError = class _ValidationError extends Error {
  constructor(issues, message) {
    super(message || JSON.stringify(issues, null, 2));
    this.issues = issues;
    Object.setPrototypeOf(this, _ValidationError.prototype);
  }
};
async function parseStandardSchema(schema, input) {
  const result = await schema["~standard"].validate(input);
  if (result.issues) {
    throw new ValidationError(result.issues);
  }
  return result.value;
}
var methods = ["get", "post", "put", "patch", "delete"];
var applySchemaPlugin = (config) => ({
  id: "apply-schema",
  name: "Apply Schema",
  version: "1.0.0",
  async init(url, options) {
    var _a, _b, _c, _d;
    const schema = ((_b = (_a = config.plugins) == null ? void 0 : _a.find(
      (plugin) => {
        var _a2;
        return ((_a2 = plugin.schema) == null ? void 0 : _a2.config) ? url.startsWith(plugin.schema.config.baseURL || "") || url.startsWith(plugin.schema.config.prefix || "") : false;
      }
    )) == null ? void 0 : _b.schema) || config.schema;
    if (schema) {
      let urlKey = url;
      if ((_c = schema.config) == null ? void 0 : _c.prefix) {
        if (urlKey.startsWith(schema.config.prefix)) {
          urlKey = urlKey.replace(schema.config.prefix, "");
          if (schema.config.baseURL) {
            url = url.replace(schema.config.prefix, schema.config.baseURL);
          }
        }
      }
      if ((_d = schema.config) == null ? void 0 : _d.baseURL) {
        if (urlKey.startsWith(schema.config.baseURL)) {
          urlKey = urlKey.replace(schema.config.baseURL, "");
        }
      }
      if (urlKey.startsWith("/") && urlKey.charAt(1) === "@") {
        urlKey = urlKey.substring(1);
      }
      const keySchema = schema.schema[urlKey];
      if (keySchema) {
        let validatedHeaders = options == null ? void 0 : options.headers;
        if (keySchema.headers && !(options == null ? void 0 : options.disableValidation)) {
          const normalizedHeaders = {};
          if (options == null ? void 0 : options.headers) {
            if (options.headers instanceof Headers) {
              options.headers.forEach((value, key) => {
                normalizedHeaders[key.toLowerCase()] = value;
              });
            } else if (typeof options.headers === "object") {
              for (const [key, value] of Object.entries(options.headers)) {
                if (value !== null && value !== void 0) {
                  normalizedHeaders[key.toLowerCase()] = value;
                }
              }
            }
          }
          const validated = await parseStandardSchema(
            keySchema.headers,
            normalizedHeaders
          );
          const finalHeaders = {};
          for (const [key, value] of Object.entries(validated)) {
            finalHeaders[key.toLowerCase()] = value;
          }
          validatedHeaders = finalHeaders;
        }
        let opts = __spreadProps(__spreadValues({}, options), {
          method: keySchema.method,
          output: keySchema.output,
          headers: validatedHeaders
        });
        if (!(options == null ? void 0 : options.disableValidation)) {
          opts = __spreadProps(__spreadValues({}, opts), {
            body: keySchema.input ? await parseStandardSchema(keySchema.input, options == null ? void 0 : options.body) : options == null ? void 0 : options.body,
            params: keySchema.params ? await parseStandardSchema(keySchema.params, options == null ? void 0 : options.params) : options == null ? void 0 : options.params,
            query: keySchema.query ? await parseStandardSchema(keySchema.query, options == null ? void 0 : options.query) : options == null ? void 0 : options.query
          });
        }
        return {
          url,
          options: opts
        };
      }
    }
    return {
      url,
      options
    };
  }
});
var createFetch = (config) => {
  async function $fetch(url, options) {
    const opts = __spreadProps(__spreadValues(__spreadValues({}, config), options), {
      headers: mergeHeaders(config == null ? void 0 : config.headers, options == null ? void 0 : options.headers),
      plugins: [...(config == null ? void 0 : config.plugins) || [], applySchemaPlugin(config || {}), ...(options == null ? void 0 : options.plugins) || []]
    });
    if (config == null ? void 0 : config.catchAllError) {
      try {
        return await betterFetch(url, opts);
      } catch (error) {
        return {
          data: null,
          error: {
            status: 500,
            statusText: "Fetch Error",
            message: "Fetch related error. Captured by catchAllError option. See error property for more details.",
            error
          }
        };
      }
    }
    return await betterFetch(url, opts);
  }
  return $fetch;
};
var isReservedPathSegment = (value) => value === "." || value === "..";
function encodePathSegment(segment, pathParams) {
  let pathSegment = segment;
  for (const [key, value] of pathParams) {
    pathSegment = pathSegment.replace(key, value);
  }
  if (isReservedPathSegment(pathSegment)) {
    throw new TypeError("Path parameters cannot be reserved path segments");
  }
  return encodeURIComponent(pathSegment);
}
function getURL2(url, option) {
  const { baseURL, params, query } = option || {
    query: {},
    params: {},
    baseURL: ""
  };
  let basePath = url.startsWith("http") ? url.split("/").slice(0, 3).join("/") : baseURL || "";
  if (url.startsWith("@")) {
    const m = url.toString().split("@")[1].split("/")[0];
    if (methods.includes(m)) {
      url = url.replace(`@${m}/`, "/");
    }
  }
  if (!basePath.endsWith("/")) basePath += "/";
  let [path, urlQuery] = url.replace(basePath, "").split("?");
  const queryParams = new URLSearchParams(urlQuery);
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null) continue;
    let serializedValue;
    if (typeof value === "string") {
      serializedValue = value;
    } else if (Array.isArray(value)) {
      for (const val of value) {
        queryParams.append(key, val);
      }
      continue;
    } else {
      serializedValue = JSON.stringify(value);
    }
    queryParams.set(key, serializedValue);
  }
  const pathParams = /* @__PURE__ */ new Map();
  if (params) {
    if (Array.isArray(params)) {
      const paramPaths = path.split("/").filter((p) => p.startsWith(":"));
      for (const [index, key] of paramPaths.entries()) {
        const value = params[index];
        pathParams.set(key, String(value));
      }
    } else {
      for (const [key, value] of Object.entries(params)) {
        pathParams.set(`:${key}`, String(value));
      }
    }
  }
  path = path.split("/").map((segment) => encodePathSegment(segment, pathParams)).join("/");
  path = path.replace(/^\/+/, "");
  let queryParamString = queryParams.toString();
  queryParamString = queryParamString.length > 0 ? `?${queryParamString}`.replace(/\+/g, "%20") : "";
  if (!basePath.startsWith("http")) {
    return `${basePath}${path}${queryParamString}`;
  }
  const _url = new URL(`${path}${queryParamString}`, basePath);
  return _url;
}
var betterFetch = async (url, options) => {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const {
    hooks,
    url: __url,
    options: opts
  } = await initializePlugins(url, options);
  const fetch2 = getFetch(opts);
  const controller = new AbortController();
  const signal = (_a = opts.signal) != null ? _a : controller.signal;
  const _url = getURL2(__url, opts);
  const headers = await getHeaders(opts);
  const body = getBody(opts, headers);
  const method = getMethod(__url, opts);
  const context = __spreadProps(__spreadValues({}, opts), {
    url: _url,
    headers,
    body,
    method,
    signal
  });
  for (const onRequest of hooks.onRequest) {
    if (onRequest) {
      const res = await onRequest(context);
      if (typeof res === "object" && res !== null) {
        Object.assign(context, res);
      }
    }
  }
  if ("pipeTo" in context && typeof context.pipeTo === "function" || typeof ((_b = options == null ? void 0 : options.body) == null ? void 0 : _b.pipe) === "function") {
    if (!("duplex" in context)) {
      context.duplex = "half";
    }
  }
  const { clearTimeout: clearTimeout2 } = getTimeout(opts, controller);
  let response = await fetch2(context.url, context);
  clearTimeout2();
  const responseContext = {
    response,
    request: context
  };
  for (const onResponse of hooks.onResponse) {
    if (onResponse) {
      const r = await onResponse(__spreadProps(__spreadValues({}, responseContext), {
        response: ((_c = options == null ? void 0 : options.hookOptions) == null ? void 0 : _c.cloneResponse) ? response.clone() : response
      }));
      if (r instanceof Response) {
        response = r;
      } else if (typeof r === "object" && r !== null) {
        response = r.response;
      }
    }
  }
  if (response.ok) {
    const hasBody = context.method !== "HEAD";
    if (!hasBody) {
      return {
        data: "",
        error: null
      };
    }
    const responseType = detectResponseType(response);
    const successContext = {
      data: null,
      response,
      request: context
    };
    if (responseType === "json" || responseType === "text") {
      const text = await response.text();
      const parser2 = (_d = context.jsonParser) != null ? _d : jsonParse;
      successContext.data = await parser2(text);
    } else {
      successContext.data = await response[responseType]();
    }
    if (context == null ? void 0 : context.output) {
      if (context.output && !context.disableValidation) {
        successContext.data = await parseStandardSchema(
          context.output,
          successContext.data
        );
      }
    }
    for (const onSuccess of hooks.onSuccess) {
      if (onSuccess) {
        await onSuccess(__spreadProps(__spreadValues({}, successContext), {
          response: ((_e = options == null ? void 0 : options.hookOptions) == null ? void 0 : _e.cloneResponse) ? response.clone() : response
        }));
      }
    }
    if (options == null ? void 0 : options.throw) {
      return successContext.data;
    }
    return {
      data: successContext.data,
      error: null
    };
  }
  const parser = (_f = options == null ? void 0 : options.jsonParser) != null ? _f : jsonParse;
  const responseText = await response.text();
  const isJSONResponse = isJSONParsable(responseText);
  const errorObject = isJSONResponse ? await parser(responseText) : null;
  const errorContext = {
    response,
    responseText,
    request: context,
    error: __spreadProps(__spreadValues({}, errorObject), {
      status: response.status,
      statusText: response.statusText
    })
  };
  for (const onError of hooks.onError) {
    if (onError) {
      await onError(__spreadProps(__spreadValues({}, errorContext), {
        response: ((_g = options == null ? void 0 : options.hookOptions) == null ? void 0 : _g.cloneResponse) ? response.clone() : response
      }));
    }
  }
  if (options == null ? void 0 : options.retry) {
    const retryStrategy = createRetryStrategy(options.retry);
    const _retryAttempt = (_h = options.retryAttempt) != null ? _h : 0;
    if (await retryStrategy.shouldAttemptRetry(_retryAttempt, response)) {
      for (const onRetry of hooks.onRetry) {
        if (onRetry) {
          await onRetry(responseContext);
        }
      }
      const delay = retryStrategy.getDelay(_retryAttempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return await betterFetch(url, __spreadProps(__spreadValues({}, options), {
        retryAttempt: _retryAttempt + 1
      }));
    }
  }
  if (options == null ? void 0 : options.throw) {
    throw new BetterFetchError(
      response.status,
      response.statusText,
      isJSONResponse ? errorObject : responseText
    );
  }
  return {
    data: null,
    error: __spreadProps(__spreadValues({}, errorObject), {
      status: response.status,
      statusText: response.statusText
    })
  };
};

// node_modules/.pnpm/better-auth@1.6.23_@cloudflare+workers-types@5.20260714.1/node_modules/better-auth/dist/client/config.mjs
var resolvePublicAuthUrl = (basePath) => {
  if (typeof process === "undefined") return void 0;
  const path = basePath ?? "/api/auth";
  if (define_process_env_default.NEXT_PUBLIC_AUTH_URL) return define_process_env_default.NEXT_PUBLIC_AUTH_URL;
  if (typeof window === "undefined") {
    if (define_process_env_default.NEXTAUTH_URL) try {
      return define_process_env_default.NEXTAUTH_URL;
    } catch {
    }
    if (define_process_env_default.VERCEL_URL) try {
      const protocol = define_process_env_default.VERCEL_URL.startsWith("http") ? "" : "https://";
      return `${new URL(`${protocol}${define_process_env_default.VERCEL_URL}`).origin}${path}`;
    } catch {
    }
  }
};
var getClientConfig = (options, loadEnv) => {
  const isCredentialsSupported = "credentials" in Request.prototype;
  const baseURL = getBaseURL(options?.baseURL, options?.basePath, void 0, loadEnv) ?? resolvePublicAuthUrl(options?.basePath) ?? "/api/auth";
  const pluginsFetchPlugins = options?.plugins?.flatMap((plugin) => plugin.fetchPlugins).filter((pl) => pl !== void 0) || [];
  const lifeCyclePlugin = {
    id: "lifecycle-hooks",
    name: "lifecycle-hooks",
    hooks: {
      onSuccess: options?.fetchOptions?.onSuccess,
      onError: options?.fetchOptions?.onError,
      onRequest: options?.fetchOptions?.onRequest,
      onResponse: options?.fetchOptions?.onResponse
    }
  };
  const { onSuccess: _onSuccess, onError: _onError, onRequest: _onRequest, onResponse: _onResponse, ...restOfFetchOptions } = options?.fetchOptions || {};
  const $fetch = createFetch({
    baseURL,
    ...isCredentialsSupported ? { credentials: "include" } : {},
    method: "GET",
    jsonParser(text) {
      if (!text) return null;
      return parseJSON(text, { strict: false });
    },
    customFetchImpl: fetch,
    ...restOfFetchOptions,
    plugins: [
      lifeCyclePlugin,
      ...restOfFetchOptions.plugins || [],
      ...options?.disableDefaultFetchPlugins ? [] : [redirectPlugin],
      ...pluginsFetchPlugins
    ]
  });
  const { $sessionSignal, session, broadcastSessionUpdate } = getSessionAtom($fetch, options);
  const plugins = options?.plugins || [];
  let pluginsActions = {};
  const pluginsAtoms = {
    $sessionSignal,
    session
  };
  const pluginPathMethods = {
    "/sign-out": "POST",
    "/revoke-sessions": "POST",
    "/revoke-other-sessions": "POST",
    "/delete-user": "POST"
  };
  const atomListeners = [{
    signal: "$sessionSignal",
    matcher(path) {
      return path === "/sign-out" || path === "/update-user" || path === "/update-session" || path === "/sign-up/email" || path === "/sign-in/email" || path === "/delete-user" || path === "/verify-email" || path === "/revoke-sessions" || path === "/revoke-session" || path === "/revoke-other-sessions" || path === "/change-email" || path === "/change-password";
    },
    callback(path) {
      if (path === "/sign-out") broadcastSessionUpdate("signout");
      else if (path === "/update-user" || path === "/update-session") broadcastSessionUpdate("updateUser");
    }
  }];
  for (const plugin of plugins) {
    if (plugin.getAtoms) Object.assign(pluginsAtoms, plugin.getAtoms?.($fetch));
    if (plugin.pathMethods) Object.assign(pluginPathMethods, plugin.pathMethods);
    if (plugin.atomListeners) atomListeners.push(...plugin.atomListeners);
  }
  const $store = {
    notify: (signal) => {
      pluginsAtoms[signal].set(!pluginsAtoms[signal].get());
    },
    listen: (signal, listener) => {
      pluginsAtoms[signal].subscribe(listener);
    },
    atoms: pluginsAtoms
  };
  for (const plugin of plugins) if (plugin.getActions) pluginsActions = defu(plugin.getActions?.($fetch, $store, options) ?? {}, pluginsActions);
  return {
    get baseURL() {
      return baseURL;
    },
    pluginsActions,
    pluginsAtoms,
    pluginPathMethods,
    atomListeners,
    $fetch,
    $store
  };
};

// node_modules/.pnpm/better-auth@1.6.23_@cloudflare+workers-types@5.20260714.1/node_modules/better-auth/dist/utils/is-atom.mjs
function isAtom(value) {
  return typeof value === "object" && value !== null && "get" in value && typeof value.get === "function" && "lc" in value && typeof value.lc === "number";
}

// node_modules/.pnpm/@better-auth+core@1.6.23_@better-auth+utils@0.4.2_@better-fetch+fetch@1.3.1_@cloudflare_3a1f226e012cb7342e731f513cafc346/node_modules/@better-auth/core/dist/utils/string.mjs
function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
var WORD_PATTERN = /[\p{Ll}\d]+|\p{Lu}+(?!\p{Ll})|\p{Lu}[\p{Ll}\d]+|\p{Lo}+/gu;
var APOSTROPHE_PATTERN = /['\u2019]/g;
function splitWords(input) {
  return input.replace(APOSTROPHE_PATTERN, "").match(WORD_PATTERN) ?? [];
}
function toKebabCase(input) {
  return splitWords(input).map((word) => word.toLowerCase()).join("-");
}

// node_modules/.pnpm/better-auth@1.6.23_@cloudflare+workers-types@5.20260714.1/node_modules/better-auth/dist/client/proxy.mjs
function getMethod2(path, knownPathMethods, args) {
  const method = knownPathMethods[path];
  const { fetchOptions, query: _query, ...body } = args || {};
  if (method) return method;
  if (fetchOptions?.method) return fetchOptions.method;
  if (body && Object.keys(body).length > 0) return "POST";
  return "GET";
}
function createDynamicPathProxy(routes, client2, knownPathMethods, atoms, atomListeners) {
  function createProxy(path = []) {
    return new Proxy(function() {
    }, {
      get(_, prop) {
        if (typeof prop !== "string") return;
        if (prop === "then" || prop === "catch" || prop === "finally") return;
        const fullPath = [...path, prop];
        let current = routes;
        for (const segment of fullPath) if (current && typeof current === "object" && segment in current) current = current[segment];
        else {
          current = void 0;
          break;
        }
        if (typeof current === "function") return current;
        if (isAtom(current)) return current;
        return createProxy(fullPath);
      },
      apply: async (_, __, args) => {
        const routePath = "/" + path.map(toKebabCase).join("/");
        const arg = args[0] || {};
        const fetchOptions = args[1] || {};
        const { query, fetchOptions: argFetchOptions, ...body } = arg;
        const options = {
          ...fetchOptions,
          ...argFetchOptions
        };
        const method = getMethod2(routePath, knownPathMethods, arg);
        return await client2(routePath, {
          ...options,
          body: method === "GET" ? void 0 : {
            ...body,
            ...options?.body || {}
          },
          query: query || options?.query,
          method,
          async onSuccess(context) {
            await options?.onSuccess?.(context);
            if (!atomListeners || options.disableSignal) return;
            const matches = atomListeners.filter((s) => s.matcher(routePath));
            if (!matches.length) return;
            const visited = /* @__PURE__ */ new Set();
            for (const match of matches) {
              const signal = atoms[match.signal];
              if (!signal) return;
              if (visited.has(match.signal)) continue;
              visited.add(match.signal);
              const val = signal.get();
              setTimeout(() => {
                signal.set(!val);
              }, 10);
              match.callback?.(routePath);
            }
          }
        });
      }
    });
  }
  return createProxy();
}

// node_modules/.pnpm/better-auth@1.6.23_@cloudflare+workers-types@5.20260714.1/node_modules/better-auth/dist/client/vanilla.mjs
function createAuthClient(options) {
  const { pluginPathMethods, pluginsActions, pluginsAtoms, $fetch, atomListeners, $store } = getClientConfig(options);
  const resolvedHooks = {};
  for (const [key, value] of Object.entries(pluginsAtoms)) resolvedHooks[`use${capitalizeFirstLetter(key)}`] = value;
  return createDynamicPathProxy({
    ...pluginsActions,
    ...resolvedHooks,
    $fetch,
    $store
  }, $fetch, pluginPathMethods, pluginsAtoms, atomListeners);
}

// node_modules/.pnpm/@better-auth+passkey@1.6.23_@better-auth+core@1.6.23_@better-auth+utils@0.4.2_@better-f_4a67e287c34ae9ee1fad1a7dbc17bea7/node_modules/@better-auth/passkey/dist/version-CPL1IvJK.mjs
var PASSKEY_ERROR_CODES = defineErrorCodes({
  CHALLENGE_NOT_FOUND: "Challenge not found",
  YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: "You are not allowed to register this passkey",
  FAILED_TO_VERIFY_REGISTRATION: "Failed to verify registration",
  PASSKEY_NOT_FOUND: "Passkey not found",
  AUTHENTICATION_FAILED: "Authentication failed",
  UNABLE_TO_CREATE_SESSION: "Unable to create session",
  FAILED_TO_UPDATE_PASSKEY: "Failed to update passkey",
  PREVIOUSLY_REGISTERED: "Previously registered",
  REGISTRATION_CANCELLED: "Registration cancelled",
  AUTH_CANCELLED: "Auth cancelled",
  UNKNOWN_ERROR: "Unknown error",
  SESSION_REQUIRED: "Passkey registration requires an authenticated session",
  RESOLVE_USER_REQUIRED: "Passkey registration requires either an authenticated session or a resolveUser callback when requireSession is false",
  RESOLVED_USER_INVALID: "Resolved user is invalid"
});
var PACKAGE_VERSION = "1.6.23";

// node_modules/.pnpm/@simplewebauthn+browser@13.3.0/node_modules/@simplewebauthn/browser/esm/helpers/bufferToBase64URLString.js
function bufferToBase64URLString(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const charCode of bytes) {
    str += String.fromCharCode(charCode);
  }
  const base64String = btoa(str);
  return base64String.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// node_modules/.pnpm/@simplewebauthn+browser@13.3.0/node_modules/@simplewebauthn/browser/esm/helpers/base64URLStringToBuffer.js
function base64URLStringToBuffer(base64URLString) {
  const base64 = base64URLString.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - base64.length % 4) % 4;
  const padded = base64.padEnd(base64.length + padLength, "=");
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
}

// node_modules/.pnpm/@simplewebauthn+browser@13.3.0/node_modules/@simplewebauthn/browser/esm/helpers/browserSupportsWebAuthn.js
function browserSupportsWebAuthn() {
  return _browserSupportsWebAuthnInternals.stubThis(globalThis?.PublicKeyCredential !== void 0 && typeof globalThis.PublicKeyCredential === "function");
}
var _browserSupportsWebAuthnInternals = {
  stubThis: (value) => value
};

// node_modules/.pnpm/@simplewebauthn+browser@13.3.0/node_modules/@simplewebauthn/browser/esm/helpers/toPublicKeyCredentialDescriptor.js
function toPublicKeyCredentialDescriptor(descriptor) {
  const { id } = descriptor;
  return {
    ...descriptor,
    id: base64URLStringToBuffer(id),
    /**
     * `descriptor.transports` is an array of our `AuthenticatorTransportFuture` that includes newer
     * transports that TypeScript's DOM lib is ignorant of. Convince TS that our list of transports
     * are fine to pass to WebAuthn since browsers will recognize the new value.
     */
    transports: descriptor.transports
  };
}

// node_modules/.pnpm/@simplewebauthn+browser@13.3.0/node_modules/@simplewebauthn/browser/esm/helpers/isValidDomain.js
function isValidDomain(hostname) {
  return (
    // Consider localhost valid as well since it's okay wrt Secure Contexts
    hostname === "localhost" || // Support punycode (ACE) or ascii labels and domains
    /^((xn--[a-z0-9-]+|[a-z0-9]+(-[a-z0-9]+)*)\.)+([a-z]{2,}|xn--[a-z0-9-]+)$/i.test(hostname)
  );
}

// node_modules/.pnpm/@simplewebauthn+browser@13.3.0/node_modules/@simplewebauthn/browser/esm/helpers/webAuthnError.js
var WebAuthnError = class extends Error {
  constructor({ message, code, cause, name }) {
    super(message, { cause });
    Object.defineProperty(this, "code", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.name = name ?? cause.name;
    this.code = code;
  }
};

// node_modules/.pnpm/@simplewebauthn+browser@13.3.0/node_modules/@simplewebauthn/browser/esm/helpers/identifyRegistrationError.js
function identifyRegistrationError({ error, options }) {
  const { publicKey } = options;
  if (!publicKey) {
    throw Error("options was missing required publicKey property");
  }
  if (error.name === "AbortError") {
    if (options.signal instanceof AbortSignal) {
      return new WebAuthnError({
        message: "Registration ceremony was sent an abort signal",
        code: "ERROR_CEREMONY_ABORTED",
        cause: error
      });
    }
  } else if (error.name === "ConstraintError") {
    if (publicKey.authenticatorSelection?.requireResidentKey === true) {
      return new WebAuthnError({
        message: "Discoverable credentials were required but no available authenticator supported it",
        code: "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT",
        cause: error
      });
    } else if (
      // @ts-ignore: `mediation` doesn't yet exist on CredentialCreationOptions but it's possible as of Sept 2024
      options.mediation === "conditional" && publicKey.authenticatorSelection?.userVerification === "required"
    ) {
      return new WebAuthnError({
        message: "User verification was required during automatic registration but it could not be performed",
        code: "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE",
        cause: error
      });
    } else if (publicKey.authenticatorSelection?.userVerification === "required") {
      return new WebAuthnError({
        message: "User verification was required but no available authenticator supported it",
        code: "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT",
        cause: error
      });
    }
  } else if (error.name === "InvalidStateError") {
    return new WebAuthnError({
      message: "The authenticator was previously registered",
      code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
      cause: error
    });
  } else if (error.name === "NotAllowedError") {
    return new WebAuthnError({
      message: error.message,
      code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
      cause: error
    });
  } else if (error.name === "NotSupportedError") {
    const validPubKeyCredParams = publicKey.pubKeyCredParams.filter((param) => param.type === "public-key");
    if (validPubKeyCredParams.length === 0) {
      return new WebAuthnError({
        message: 'No entry in pubKeyCredParams was of type "public-key"',
        code: "ERROR_MALFORMED_PUBKEYCREDPARAMS",
        cause: error
      });
    }
    return new WebAuthnError({
      message: "No available authenticator supported any of the specified pubKeyCredParams algorithms",
      code: "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG",
      cause: error
    });
  } else if (error.name === "SecurityError") {
    const effectiveDomain = globalThis.location.hostname;
    if (!isValidDomain(effectiveDomain)) {
      return new WebAuthnError({
        message: `${globalThis.location.hostname} is an invalid domain`,
        code: "ERROR_INVALID_DOMAIN",
        cause: error
      });
    } else if (publicKey.rp.id !== effectiveDomain) {
      return new WebAuthnError({
        message: `The RP ID "${publicKey.rp.id}" is invalid for this domain`,
        code: "ERROR_INVALID_RP_ID",
        cause: error
      });
    }
  } else if (error.name === "TypeError") {
    if (publicKey.user.id.byteLength < 1 || publicKey.user.id.byteLength > 64) {
      return new WebAuthnError({
        message: "User ID was not between 1 and 64 characters",
        code: "ERROR_INVALID_USER_ID_LENGTH",
        cause: error
      });
    }
  } else if (error.name === "UnknownError") {
    return new WebAuthnError({
      message: "The authenticator was unable to process the specified options, or could not create a new credential",
      code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
      cause: error
    });
  }
  return error;
}

// node_modules/.pnpm/@simplewebauthn+browser@13.3.0/node_modules/@simplewebauthn/browser/esm/helpers/webAuthnAbortService.js
var BaseWebAuthnAbortService = class {
  constructor() {
    Object.defineProperty(this, "controller", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
  }
  createNewAbortSignal() {
    if (this.controller) {
      const abortError = new Error("Cancelling existing WebAuthn API call for new one");
      abortError.name = "AbortError";
      this.controller.abort(abortError);
    }
    const newController = new AbortController();
    this.controller = newController;
    return newController.signal;
  }
  cancelCeremony() {
    if (this.controller) {
      const abortError = new Error("Manually cancelling existing WebAuthn API call");
      abortError.name = "AbortError";
      this.controller.abort(abortError);
      this.controller = void 0;
    }
  }
};
var WebAuthnAbortService = new BaseWebAuthnAbortService();

// node_modules/.pnpm/@simplewebauthn+browser@13.3.0/node_modules/@simplewebauthn/browser/esm/helpers/toAuthenticatorAttachment.js
var attachments = ["cross-platform", "platform"];
function toAuthenticatorAttachment(attachment) {
  if (!attachment) {
    return;
  }
  if (attachments.indexOf(attachment) < 0) {
    return;
  }
  return attachment;
}

// node_modules/.pnpm/@simplewebauthn+browser@13.3.0/node_modules/@simplewebauthn/browser/esm/methods/startRegistration.js
async function startRegistration(options) {
  if (!options.optionsJSON && options.challenge) {
    console.warn("startRegistration() was not called correctly. It will try to continue with the provided options, but this call should be refactored to use the expected call structure instead. See https://simplewebauthn.dev/docs/packages/browser#typeerror-cannot-read-properties-of-undefined-reading-challenge for more information.");
    options = { optionsJSON: options };
  }
  const { optionsJSON, useAutoRegister = false } = options;
  if (!browserSupportsWebAuthn()) {
    throw new Error("WebAuthn is not supported in this browser");
  }
  const publicKey = {
    ...optionsJSON,
    challenge: base64URLStringToBuffer(optionsJSON.challenge),
    user: {
      ...optionsJSON.user,
      id: base64URLStringToBuffer(optionsJSON.user.id)
    },
    excludeCredentials: optionsJSON.excludeCredentials?.map(toPublicKeyCredentialDescriptor)
  };
  const createOptions = {};
  if (useAutoRegister) {
    createOptions.mediation = "conditional";
  }
  createOptions.publicKey = publicKey;
  createOptions.signal = WebAuthnAbortService.createNewAbortSignal();
  let credential;
  try {
    credential = await navigator.credentials.create(createOptions);
  } catch (err) {
    throw identifyRegistrationError({ error: err, options: createOptions });
  }
  if (!credential) {
    throw new Error("Registration was not completed");
  }
  const { id, rawId, response, type } = credential;
  let transports = void 0;
  if (typeof response.getTransports === "function") {
    transports = response.getTransports();
  }
  let responsePublicKeyAlgorithm = void 0;
  if (typeof response.getPublicKeyAlgorithm === "function") {
    try {
      responsePublicKeyAlgorithm = response.getPublicKeyAlgorithm();
    } catch (error) {
      warnOnBrokenImplementation("getPublicKeyAlgorithm()", error);
    }
  }
  let responsePublicKey = void 0;
  if (typeof response.getPublicKey === "function") {
    try {
      const _publicKey = response.getPublicKey();
      if (_publicKey !== null) {
        responsePublicKey = bufferToBase64URLString(_publicKey);
      }
    } catch (error) {
      warnOnBrokenImplementation("getPublicKey()", error);
    }
  }
  let responseAuthenticatorData;
  if (typeof response.getAuthenticatorData === "function") {
    try {
      responseAuthenticatorData = bufferToBase64URLString(response.getAuthenticatorData());
    } catch (error) {
      warnOnBrokenImplementation("getAuthenticatorData()", error);
    }
  }
  return {
    id,
    rawId: bufferToBase64URLString(rawId),
    response: {
      attestationObject: bufferToBase64URLString(response.attestationObject),
      clientDataJSON: bufferToBase64URLString(response.clientDataJSON),
      transports,
      publicKeyAlgorithm: responsePublicKeyAlgorithm,
      publicKey: responsePublicKey,
      authenticatorData: responseAuthenticatorData
    },
    type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: toAuthenticatorAttachment(credential.authenticatorAttachment)
  };
}
function warnOnBrokenImplementation(methodName, cause) {
  console.warn(`The browser extension that intercepted this WebAuthn API call incorrectly implemented ${methodName}. You should report this error to them.
`, cause);
}

// node_modules/.pnpm/@simplewebauthn+browser@13.3.0/node_modules/@simplewebauthn/browser/esm/helpers/browserSupportsWebAuthnAutofill.js
function browserSupportsWebAuthnAutofill() {
  if (!browserSupportsWebAuthn()) {
    return _browserSupportsWebAuthnAutofillInternals.stubThis(new Promise((resolve) => resolve(false)));
  }
  const globalPublicKeyCredential = globalThis.PublicKeyCredential;
  if (globalPublicKeyCredential?.isConditionalMediationAvailable === void 0) {
    return _browserSupportsWebAuthnAutofillInternals.stubThis(new Promise((resolve) => resolve(false)));
  }
  return _browserSupportsWebAuthnAutofillInternals.stubThis(globalPublicKeyCredential.isConditionalMediationAvailable());
}
var _browserSupportsWebAuthnAutofillInternals = {
  stubThis: (value) => value
};

// node_modules/.pnpm/@simplewebauthn+browser@13.3.0/node_modules/@simplewebauthn/browser/esm/helpers/identifyAuthenticationError.js
function identifyAuthenticationError({ error, options }) {
  const { publicKey } = options;
  if (!publicKey) {
    throw Error("options was missing required publicKey property");
  }
  if (error.name === "AbortError") {
    if (options.signal instanceof AbortSignal) {
      return new WebAuthnError({
        message: "Authentication ceremony was sent an abort signal",
        code: "ERROR_CEREMONY_ABORTED",
        cause: error
      });
    }
  } else if (error.name === "NotAllowedError") {
    return new WebAuthnError({
      message: error.message,
      code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
      cause: error
    });
  } else if (error.name === "SecurityError") {
    const effectiveDomain = globalThis.location.hostname;
    if (!isValidDomain(effectiveDomain)) {
      return new WebAuthnError({
        message: `${globalThis.location.hostname} is an invalid domain`,
        code: "ERROR_INVALID_DOMAIN",
        cause: error
      });
    } else if (publicKey.rpId !== effectiveDomain) {
      return new WebAuthnError({
        message: `The RP ID "${publicKey.rpId}" is invalid for this domain`,
        code: "ERROR_INVALID_RP_ID",
        cause: error
      });
    }
  } else if (error.name === "UnknownError") {
    return new WebAuthnError({
      message: "The authenticator was unable to process the specified options, or could not create a new assertion signature",
      code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
      cause: error
    });
  }
  return error;
}

// node_modules/.pnpm/@simplewebauthn+browser@13.3.0/node_modules/@simplewebauthn/browser/esm/methods/startAuthentication.js
async function startAuthentication(options) {
  if (!options.optionsJSON && options.challenge) {
    console.warn("startAuthentication() was not called correctly. It will try to continue with the provided options, but this call should be refactored to use the expected call structure instead. See https://simplewebauthn.dev/docs/packages/browser#typeerror-cannot-read-properties-of-undefined-reading-challenge for more information.");
    options = { optionsJSON: options };
  }
  const { optionsJSON, useBrowserAutofill = false, verifyBrowserAutofillInput = true } = options;
  if (!browserSupportsWebAuthn()) {
    throw new Error("WebAuthn is not supported in this browser");
  }
  let allowCredentials;
  if (optionsJSON.allowCredentials?.length !== 0) {
    allowCredentials = optionsJSON.allowCredentials?.map(toPublicKeyCredentialDescriptor);
  }
  const publicKey = {
    ...optionsJSON,
    challenge: base64URLStringToBuffer(optionsJSON.challenge),
    allowCredentials
  };
  const getOptions = {};
  if (useBrowserAutofill) {
    if (!await browserSupportsWebAuthnAutofill()) {
      throw Error("Browser does not support WebAuthn autofill");
    }
    const eligibleInputs = document.querySelectorAll("input[autocomplete$='webauthn']");
    if (eligibleInputs.length < 1 && verifyBrowserAutofillInput) {
      throw Error('No <input> with "webauthn" as the only or last value in its `autocomplete` attribute was detected');
    }
    getOptions.mediation = "conditional";
    publicKey.allowCredentials = [];
  }
  getOptions.publicKey = publicKey;
  getOptions.signal = WebAuthnAbortService.createNewAbortSignal();
  let credential;
  try {
    credential = await navigator.credentials.get(getOptions);
  } catch (err) {
    throw identifyAuthenticationError({ error: err, options: getOptions });
  }
  if (!credential) {
    throw new Error("Authentication was not completed");
  }
  const { id, rawId, response, type } = credential;
  let userHandle = void 0;
  if (response.userHandle) {
    userHandle = bufferToBase64URLString(response.userHandle);
  }
  return {
    id,
    rawId: bufferToBase64URLString(rawId),
    response: {
      authenticatorData: bufferToBase64URLString(response.authenticatorData),
      clientDataJSON: bufferToBase64URLString(response.clientDataJSON),
      signature: bufferToBase64URLString(response.signature),
      userHandle
    },
    type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: toAuthenticatorAttachment(credential.authenticatorAttachment)
  };
}

// node_modules/.pnpm/@better-auth+passkey@1.6.23_@better-auth+core@1.6.23_@better-auth+utils@0.4.2_@better-f_4a67e287c34ae9ee1fad1a7dbc17bea7/node_modules/@better-auth/passkey/dist/client.mjs
var getPasskeyActions = ($fetch, { $listPasskeys, $store }) => {
  const signInPasskey = async (opts, options) => {
    const response = await $fetch("/passkey/generate-authenticate-options", {
      method: "GET",
      throw: false
    });
    if (!response.data) return response;
    const mergedExtensions = response.data.extensions || opts?.extensions ? {
      ...response.data.extensions || {},
      ...opts?.extensions || {}
    } : void 0;
    let res;
    try {
      res = await startAuthentication({
        optionsJSON: {
          ...response.data,
          extensions: mergedExtensions
        },
        useBrowserAutofill: opts?.autoFill
      });
    } catch (err) {
      return {
        data: null,
        error: {
          code: err instanceof WebAuthnError ? err.code : "AUTH_CANCELLED",
          message: PASSKEY_ERROR_CODES.AUTH_CANCELLED.message,
          status: 400,
          statusText: "BAD_REQUEST"
        }
      };
    }
    try {
      const { clientExtensionResults, ...responseBody } = res;
      const verified = await $fetch("/passkey/verify-authentication", {
        body: { response: responseBody },
        ...opts?.fetchOptions,
        ...options,
        method: "POST",
        throw: false
      });
      $listPasskeys.set(Math.random());
      $store.notify("$sessionSignal");
      if (opts?.returnWebAuthnResponse) return {
        ...verified,
        webauthn: {
          response: res,
          clientExtensionResults
        }
      };
      return verified;
    } catch (err) {
      console.error(`[Better Auth] Error verifying passkey`, err);
      return {
        data: null,
        error: {
          code: "AUTH_CANCELLED",
          message: PASSKEY_ERROR_CODES.AUTH_CANCELLED.message,
          status: 400,
          statusText: "BAD_REQUEST"
        }
      };
    }
  };
  const registerPasskey = async (opts, fetchOpts) => {
    const options = await $fetch("/passkey/generate-register-options", {
      method: "GET",
      query: {
        ...opts?.authenticatorAttachment && { authenticatorAttachment: opts.authenticatorAttachment },
        ...opts?.name && { name: opts.name },
        ...opts?.context && { context: opts.context }
      },
      throw: false
    });
    if (!options.data) return options;
    try {
      const mergedExtensions = options.data.extensions || opts?.extensions ? {
        ...options.data.extensions || {},
        ...opts?.extensions || {}
      } : void 0;
      const res = await startRegistration({
        optionsJSON: {
          ...options.data,
          extensions: mergedExtensions
        },
        useAutoRegister: opts?.useAutoRegister
      });
      const { clientExtensionResults, ...responseBody } = res;
      const verified = await $fetch("/passkey/verify-registration", {
        ...opts?.fetchOptions,
        ...fetchOpts,
        body: {
          response: responseBody,
          name: opts?.name
        },
        method: "POST",
        throw: false
      });
      if (!verified.data) return verified;
      $listPasskeys.set(Math.random());
      if (opts?.returnWebAuthnResponse) return {
        ...verified,
        webauthn: {
          response: res,
          clientExtensionResults
        }
      };
      return verified;
    } catch (e) {
      if (e instanceof WebAuthnError) {
        if (e.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return {
          data: null,
          error: {
            code: e.code,
            message: PASSKEY_ERROR_CODES.PREVIOUSLY_REGISTERED.message,
            status: 400,
            statusText: "BAD_REQUEST"
          }
        };
        if (e.code === "ERROR_CEREMONY_ABORTED") return {
          data: null,
          error: {
            code: e.code,
            message: PASSKEY_ERROR_CODES.REGISTRATION_CANCELLED.message,
            status: 400,
            statusText: "BAD_REQUEST"
          }
        };
        return {
          data: null,
          error: {
            code: e.code,
            message: e.message,
            status: 400,
            statusText: "BAD_REQUEST"
          }
        };
      }
      return {
        data: null,
        error: {
          code: "UNKNOWN_ERROR",
          message: e instanceof Error ? e.message : PASSKEY_ERROR_CODES.UNKNOWN_ERROR.message,
          status: 500,
          statusText: "INTERNAL_SERVER_ERROR"
        }
      };
    }
  };
  return {
    signIn: { passkey: signInPasskey },
    passkey: { addPasskey: registerPasskey },
    $Infer: {}
  };
};
var passkeyClient = () => {
  const $listPasskeys = atom();
  return {
    id: "passkey",
    version: PACKAGE_VERSION,
    $InferServerPlugin: {},
    getActions: ($fetch, $store) => getPasskeyActions($fetch, {
      $listPasskeys,
      $store
    }),
    getAtoms($fetch) {
      return {
        listPasskeys: useAuthQuery($listPasskeys, "/passkey/list-user-passkeys", $fetch, { method: "GET" }),
        $listPasskeys
      };
    },
    pathMethods: {
      "/passkey/register": "POST",
      "/passkey/authenticate": "POST"
    },
    atomListeners: [{
      matcher(path) {
        return path === "/passkey/verify-registration" || path === "/passkey/delete-passkey" || path === "/passkey/update-passkey" || path === "/sign-out";
      },
      signal: "$listPasskeys"
    }, {
      matcher: (path) => path === "/passkey/verify-authentication",
      signal: "$sessionSignal"
    }],
    $ERROR_CODES: PASSKEY_ERROR_CODES
  };
};

// src/auth-client.ts
var client = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/auth",
  plugins: [passkeyClient()]
});
var authBridge = {
  async getSession() {
    return client.getSession();
  },
  async signInGoogle() {
    return client.signIn.social({
      provider: "google",
      callbackURL: window.location.href
    });
  },
  async signInPasskey() {
    return client.signIn.passkey({ autoFill: false });
  },
  async signOut() {
    return client.signOut();
  },
  async addPasskey(name = "This device") {
    return client.passkey.addPasskey({
      name,
      authenticatorAttachment: "platform"
    });
  },
  async listPasskeys() {
    return client.passkey.listUserPasskeys();
  }
};
window.PitchingAuth = authBridge;
