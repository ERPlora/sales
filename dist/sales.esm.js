var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};

// ../../node_modules/.pnpm/@lit-labs+ssr-dom-shim@1.6.0/node_modules/@lit-labs/ssr-dom-shim/lib/element-internals.js
var ElementInternalsShim = class ElementInternals {
  get shadowRoot() {
    return this.__host.__shadowRoot;
  }
  constructor(_host) {
    this.ariaActiveDescendantElement = null;
    this.ariaAtomic = "";
    this.ariaAutoComplete = "";
    this.ariaBrailleLabel = "";
    this.ariaBrailleRoleDescription = "";
    this.ariaBusy = "";
    this.ariaChecked = "";
    this.ariaColCount = "";
    this.ariaColIndex = "";
    this.ariaColIndexText = "";
    this.ariaColSpan = "";
    this.ariaControlsElements = null;
    this.ariaCurrent = "";
    this.ariaDescribedByElements = null;
    this.ariaDescription = "";
    this.ariaDetailsElements = null;
    this.ariaDisabled = "";
    this.ariaErrorMessageElements = null;
    this.ariaExpanded = "";
    this.ariaFlowToElements = null;
    this.ariaHasPopup = "";
    this.ariaHidden = "";
    this.ariaInvalid = "";
    this.ariaKeyShortcuts = "";
    this.ariaLabel = "";
    this.ariaLabelledByElements = null;
    this.ariaLevel = "";
    this.ariaLive = "";
    this.ariaModal = "";
    this.ariaMultiLine = "";
    this.ariaMultiSelectable = "";
    this.ariaOrientation = "";
    this.ariaOwnsElements = null;
    this.ariaPlaceholder = "";
    this.ariaPosInSet = "";
    this.ariaPressed = "";
    this.ariaReadOnly = "";
    this.ariaRelevant = "";
    this.ariaRequired = "";
    this.ariaRoleDescription = "";
    this.ariaRowCount = "";
    this.ariaRowIndex = "";
    this.ariaRowIndexText = "";
    this.ariaRowSpan = "";
    this.ariaSelected = "";
    this.ariaSetSize = "";
    this.ariaSort = "";
    this.ariaValueMax = "";
    this.ariaValueMin = "";
    this.ariaValueNow = "";
    this.ariaValueText = "";
    this.role = "";
    this.form = null;
    this.labels = [];
    this.states = /* @__PURE__ */ new Set();
    this.validationMessage = "";
    this.validity = {};
    this.willValidate = true;
    this.__host = _host;
  }
  checkValidity() {
    console.warn("`ElementInternals.checkValidity()` was called on the server.This method always returns true.");
    return true;
  }
  reportValidity() {
    return true;
  }
  setFormValue() {
  }
  setValidity() {
  }
};

// ../../node_modules/.pnpm/@lit-labs+ssr-dom-shim@1.6.0/node_modules/@lit-labs/ssr-dom-shim/lib/events.js
var __classPrivateFieldSet = function(receiver, state, value, kind, f3) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f3) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f3 : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f3.call(receiver, value) : f3 ? f3.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet = function(receiver, state, kind, f3) {
  if (kind === "a" && !f3) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f3 : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f3 : kind === "a" ? f3.call(receiver) : f3 ? f3.value : state.get(receiver);
};
var _Event_cancelable;
var _Event_bubbles;
var _Event_composed;
var _Event_defaultPrevented;
var _Event_timestamp;
var _Event_propagationStopped;
var _Event_type;
var _Event_target;
var _Event_isBeingDispatched;
var _a;
var _CustomEvent_detail;
var _b;
var NONE = 0;
var CAPTURING_PHASE = 1;
var AT_TARGET = 2;
var BUBBLING_PHASE = 3;
var enumerableProperty = { __proto__: null };
enumerableProperty.enumerable = true;
Object.freeze(enumerableProperty);
var EventShim = (_a = class Event {
  constructor(type, options = {}) {
    _Event_cancelable.set(this, false);
    _Event_bubbles.set(this, false);
    _Event_composed.set(this, false);
    _Event_defaultPrevented.set(this, false);
    _Event_timestamp.set(this, Date.now());
    _Event_propagationStopped.set(this, false);
    _Event_type.set(this, void 0);
    _Event_target.set(this, void 0);
    _Event_isBeingDispatched.set(this, void 0);
    this.NONE = NONE;
    this.CAPTURING_PHASE = CAPTURING_PHASE;
    this.AT_TARGET = AT_TARGET;
    this.BUBBLING_PHASE = BUBBLING_PHASE;
    if (arguments.length === 0)
      throw new Error(`The type argument must be specified`);
    if (typeof options !== "object" || !options) {
      throw new Error(`The "options" argument must be an object`);
    }
    const { bubbles, cancelable, composed } = options;
    __classPrivateFieldSet(this, _Event_cancelable, !!cancelable, "f");
    __classPrivateFieldSet(this, _Event_bubbles, !!bubbles, "f");
    __classPrivateFieldSet(this, _Event_composed, !!composed, "f");
    __classPrivateFieldSet(this, _Event_type, `${type}`, "f");
    __classPrivateFieldSet(this, _Event_target, null, "f");
    __classPrivateFieldSet(this, _Event_isBeingDispatched, false, "f");
  }
  initEvent(_type, _bubbles, _cancelable) {
    throw new Error("Method not implemented.");
  }
  stopImmediatePropagation() {
    this.stopPropagation();
  }
  preventDefault() {
    __classPrivateFieldSet(this, _Event_defaultPrevented, true, "f");
  }
  get target() {
    return __classPrivateFieldGet(this, _Event_target, "f");
  }
  get currentTarget() {
    return __classPrivateFieldGet(this, _Event_target, "f");
  }
  get srcElement() {
    return __classPrivateFieldGet(this, _Event_target, "f");
  }
  get type() {
    return __classPrivateFieldGet(this, _Event_type, "f");
  }
  get cancelable() {
    return __classPrivateFieldGet(this, _Event_cancelable, "f");
  }
  get defaultPrevented() {
    return __classPrivateFieldGet(this, _Event_cancelable, "f") && __classPrivateFieldGet(this, _Event_defaultPrevented, "f");
  }
  get timeStamp() {
    return __classPrivateFieldGet(this, _Event_timestamp, "f");
  }
  composedPath() {
    return __classPrivateFieldGet(this, _Event_isBeingDispatched, "f") ? [__classPrivateFieldGet(this, _Event_target, "f")] : [];
  }
  get returnValue() {
    return !__classPrivateFieldGet(this, _Event_cancelable, "f") || !__classPrivateFieldGet(this, _Event_defaultPrevented, "f");
  }
  get bubbles() {
    return __classPrivateFieldGet(this, _Event_bubbles, "f");
  }
  get composed() {
    return __classPrivateFieldGet(this, _Event_composed, "f");
  }
  get eventPhase() {
    return __classPrivateFieldGet(this, _Event_isBeingDispatched, "f") ? _a.AT_TARGET : _a.NONE;
  }
  get cancelBubble() {
    return __classPrivateFieldGet(this, _Event_propagationStopped, "f");
  }
  set cancelBubble(value) {
    if (value) {
      __classPrivateFieldSet(this, _Event_propagationStopped, true, "f");
    }
  }
  stopPropagation() {
    __classPrivateFieldSet(this, _Event_propagationStopped, true, "f");
  }
  get isTrusted() {
    return false;
  }
}, _Event_cancelable = /* @__PURE__ */ new WeakMap(), _Event_bubbles = /* @__PURE__ */ new WeakMap(), _Event_composed = /* @__PURE__ */ new WeakMap(), _Event_defaultPrevented = /* @__PURE__ */ new WeakMap(), _Event_timestamp = /* @__PURE__ */ new WeakMap(), _Event_propagationStopped = /* @__PURE__ */ new WeakMap(), _Event_type = /* @__PURE__ */ new WeakMap(), _Event_target = /* @__PURE__ */ new WeakMap(), _Event_isBeingDispatched = /* @__PURE__ */ new WeakMap(), _a.NONE = NONE, _a.CAPTURING_PHASE = CAPTURING_PHASE, _a.AT_TARGET = AT_TARGET, _a.BUBBLING_PHASE = BUBBLING_PHASE, _a);
Object.defineProperties(EventShim.prototype, {
  initEvent: enumerableProperty,
  stopImmediatePropagation: enumerableProperty,
  preventDefault: enumerableProperty,
  target: enumerableProperty,
  currentTarget: enumerableProperty,
  srcElement: enumerableProperty,
  type: enumerableProperty,
  cancelable: enumerableProperty,
  defaultPrevented: enumerableProperty,
  timeStamp: enumerableProperty,
  composedPath: enumerableProperty,
  returnValue: enumerableProperty,
  bubbles: enumerableProperty,
  composed: enumerableProperty,
  eventPhase: enumerableProperty,
  cancelBubble: enumerableProperty,
  stopPropagation: enumerableProperty,
  isTrusted: enumerableProperty
});
var CustomEventShim = (_b = class CustomEvent2 extends EventShim {
  constructor(type, options = {}) {
    super(type, options);
    _CustomEvent_detail.set(this, void 0);
    __classPrivateFieldSet(this, _CustomEvent_detail, options?.detail ?? null, "f");
  }
  initCustomEvent(_type, _bubbles, _cancelable, _detail) {
    throw new Error("Method not implemented.");
  }
  get detail() {
    return __classPrivateFieldGet(this, _CustomEvent_detail, "f");
  }
}, _CustomEvent_detail = /* @__PURE__ */ new WeakMap(), _b);
Object.defineProperties(CustomEventShim.prototype, {
  detail: enumerableProperty
});
var EventShimWithRealType = EventShim;
var CustomEventShimWithRealType = CustomEventShim;

// ../../node_modules/.pnpm/@lit-labs+ssr-dom-shim@1.6.0/node_modules/@lit-labs/ssr-dom-shim/lib/css.js
var _a2;
var CSSRuleShim = (_a2 = class CSSRule {
  constructor() {
    this.STYLE_RULE = 1;
    this.CHARSET_RULE = 2;
    this.IMPORT_RULE = 3;
    this.MEDIA_RULE = 4;
    this.FONT_FACE_RULE = 5;
    this.PAGE_RULE = 6;
    this.NAMESPACE_RULE = 10;
    this.KEYFRAMES_RULE = 7;
    this.KEYFRAME_RULE = 8;
    this.SUPPORTS_RULE = 12;
    this.COUNTER_STYLE_RULE = 11;
    this.FONT_FEATURE_VALUES_RULE = 14;
    this.MARGIN_RULE = 9;
    this.__parentStyleSheet = null;
    this.cssText = "";
  }
  get parentRule() {
    return null;
  }
  get parentStyleSheet() {
    return this.__parentStyleSheet;
  }
  get type() {
    return 0;
  }
}, _a2.STYLE_RULE = 1, _a2.CHARSET_RULE = 2, _a2.IMPORT_RULE = 3, _a2.MEDIA_RULE = 4, _a2.FONT_FACE_RULE = 5, _a2.PAGE_RULE = 6, _a2.NAMESPACE_RULE = 10, _a2.KEYFRAMES_RULE = 7, _a2.KEYFRAME_RULE = 8, _a2.SUPPORTS_RULE = 12, _a2.COUNTER_STYLE_RULE = 11, _a2.FONT_FEATURE_VALUES_RULE = 14, _a2.MARGIN_RULE = 9, _a2);

// ../../node_modules/.pnpm/@lit-labs+ssr-dom-shim@1.6.0/node_modules/@lit-labs/ssr-dom-shim/index.js
globalThis.Event ??= EventShimWithRealType;
globalThis.CustomEvent ??= CustomEventShimWithRealType;
var constructionToken = Symbol();
var isCaptureEventListener = (options) => typeof options === "boolean" ? options : options?.capture ?? false;
var enumerableProperty2 = { __proto__: null };
enumerableProperty2.enumerable = true;
Object.freeze(enumerableProperty2);
var EventTarget = class {
  constructor() {
    this.__eventListeners = /* @__PURE__ */ new Map();
    this.__captureEventListeners = /* @__PURE__ */ new Map();
  }
  addEventListener(type, callback, options) {
    if (callback === void 0 || callback === null) {
      return;
    }
    const eventListenersMap = isCaptureEventListener(options) ? this.__captureEventListeners : this.__eventListeners;
    let eventListeners = eventListenersMap.get(type);
    if (eventListeners === void 0) {
      eventListeners = /* @__PURE__ */ new Map();
      eventListenersMap.set(type, eventListeners);
    } else if (eventListeners.has(callback)) {
      return;
    }
    const normalizedOptions = typeof options === "object" && options ? options : {};
    normalizedOptions.signal?.addEventListener("abort", () => this.removeEventListener(type, callback, options));
    eventListeners.set(callback, normalizedOptions ?? {});
  }
  removeEventListener(type, callback, options) {
    if (callback === void 0 || callback === null) {
      return;
    }
    const eventListenersMap = isCaptureEventListener(options) ? this.__captureEventListeners : this.__eventListeners;
    const eventListeners = eventListenersMap.get(type);
    if (eventListeners !== void 0) {
      eventListeners.delete(callback);
      if (!eventListeners.size) {
        eventListenersMap.delete(type);
      }
    }
  }
  dispatchEvent(event) {
    let composedPath = this.__resolveFullEventPath();
    if (!event.composed && this.__host) {
      composedPath = composedPath.slice(0, composedPath.indexOf(this.__host));
    }
    let stopPropagation = false;
    let stopImmediatePropagation = false;
    let eventPhase = EventShimWithRealType.NONE;
    let target = null;
    let tmpTarget = null;
    let currentTarget = null;
    const originalStopPropagation = event.stopPropagation;
    const originalStopImmediatePropagation = event.stopImmediatePropagation;
    Object.defineProperties(event, {
      target: {
        get() {
          return target ?? tmpTarget;
        },
        ...enumerableProperty2
      },
      srcElement: {
        get() {
          return event.target;
        },
        ...enumerableProperty2
      },
      currentTarget: {
        get() {
          return currentTarget;
        },
        ...enumerableProperty2
      },
      eventPhase: {
        get() {
          return eventPhase;
        },
        ...enumerableProperty2
      },
      composedPath: {
        value: () => composedPath,
        ...enumerableProperty2
      },
      stopPropagation: {
        value: () => {
          stopPropagation = true;
          originalStopPropagation.call(event);
        },
        ...enumerableProperty2
      },
      stopImmediatePropagation: {
        value: () => {
          stopImmediatePropagation = true;
          originalStopImmediatePropagation.call(event);
        },
        ...enumerableProperty2
      }
    });
    const invokeEventListener = (listener, options, eventListenerMap) => {
      if (typeof listener === "function") {
        listener(event);
      } else if (typeof listener?.handleEvent === "function") {
        listener.handleEvent(event);
      }
      if (options.once) {
        eventListenerMap.delete(listener);
      }
    };
    const finishDispatch = () => {
      currentTarget = null;
      eventPhase = EventShimWithRealType.NONE;
      return !event.defaultPrevented;
    };
    const captureEventPath = composedPath.slice().reverse();
    target = !this.__host || !event.composed ? this : null;
    const retarget = (eventTargets) => {
      tmpTarget = this;
      while (tmpTarget.__host && eventTargets.includes(tmpTarget.__host)) {
        tmpTarget = tmpTarget.__host;
      }
    };
    for (const eventTarget of captureEventPath) {
      if (!target && (!tmpTarget || tmpTarget === eventTarget.__host)) {
        retarget(captureEventPath.slice(captureEventPath.indexOf(eventTarget)));
      }
      currentTarget = eventTarget;
      eventPhase = eventTarget === event.target ? EventShimWithRealType.AT_TARGET : EventShimWithRealType.CAPTURING_PHASE;
      const captureEventListeners = eventTarget.__captureEventListeners.get(event.type);
      if (captureEventListeners) {
        for (const [listener, options] of captureEventListeners) {
          invokeEventListener(listener, options, captureEventListeners);
          if (stopImmediatePropagation) {
            return finishDispatch();
          }
        }
      }
      if (stopPropagation) {
        return finishDispatch();
      }
    }
    const bubbleEventPath = event.bubbles ? composedPath : [this];
    tmpTarget = null;
    for (const eventTarget of bubbleEventPath) {
      if (!target && (!tmpTarget || eventTarget === tmpTarget.__host)) {
        retarget(bubbleEventPath.slice(0, bubbleEventPath.indexOf(eventTarget) + 1));
      }
      currentTarget = eventTarget;
      eventPhase = eventTarget === event.target ? EventShimWithRealType.AT_TARGET : EventShimWithRealType.BUBBLING_PHASE;
      const eventListeners = eventTarget.__eventListeners.get(event.type);
      if (eventListeners) {
        for (const [listener, options] of eventListeners) {
          invokeEventListener(listener, options, eventListeners);
          if (stopImmediatePropagation) {
            return finishDispatch();
          }
        }
      }
      if (stopPropagation) {
        return finishDispatch();
      }
    }
    return finishDispatch();
  }
  __resolveFullEventPath() {
    if (this.__eventPathCache) {
      return this.__eventPathCache;
    } else if (!this.__eventTargetParent) {
      return this.__eventPathCache = [this, documentShim, windowShim];
    } else {
      return this.__eventPathCache = [
        this,
        ...this.__eventTargetParent.__resolveFullEventPath()
      ];
    }
  }
};
var attributes = /* @__PURE__ */ new WeakMap();
var attributesForElement = (element) => {
  let attrs = attributes.get(element);
  if (attrs === void 0) {
    attributes.set(element, attrs = /* @__PURE__ */ new Map());
  }
  return attrs;
};
var NodeShim = class Node extends EventTarget {
  getRootNode(options) {
    if (options?.composed) {
      return document2;
    }
    const host = this.__host;
    return host?.__shadowRoot ?? document2;
  }
};
var DocumentShim = class Document2 extends NodeShim {
  get adoptedStyleSheets() {
    return [];
  }
  createTreeWalker() {
    return {};
  }
  createTextNode() {
    return {};
  }
  createElement() {
    return {};
  }
};
var documentShim = new DocumentShim();
var document2 = documentShim;
var WindowShim = class Window extends NodeShim {
  constructor(token) {
    super();
    if (token !== constructionToken) {
      throw new TypeError("Illegal constructor");
    }
    Object.assign(this, globalThis, {
      CustomElementRegistry,
      customElements: customElements2,
      document: document2,
      Document: DocumentShim,
      Element: ElementShim,
      EventTarget,
      HTMLElement: HTMLElementShim,
      Node: NodeShim,
      ShadowRoot: ShadowRootShim,
      window: this,
      Window: WindowShim
    });
  }
};
var ElementShim = class Element extends NodeShim {
  constructor() {
    super(...arguments);
    this.__shadowRootMode = null;
    this.__shadowRoot = null;
    this.__internals = null;
  }
  get attributes() {
    return Array.from(attributesForElement(this)).map(([name, value]) => ({
      name,
      value
    }));
  }
  get shadowRoot() {
    if (this.__shadowRootMode === "closed") {
      return null;
    }
    return this.__shadowRoot;
  }
  get localName() {
    return this.constructor.__localName;
  }
  get tagName() {
    return this.localName?.toUpperCase();
  }
  setAttribute(name, value) {
    attributesForElement(this).set(name, String(value));
  }
  removeAttribute(name) {
    attributesForElement(this).delete(name);
  }
  toggleAttribute(name, force) {
    if (this.hasAttribute(name)) {
      if (force === void 0 || !force) {
        this.removeAttribute(name);
        return false;
      }
    } else {
      if (force === void 0 || force) {
        this.setAttribute(name, "");
        return true;
      } else {
        return false;
      }
    }
    return true;
  }
  hasAttribute(name) {
    return attributesForElement(this).has(name);
  }
  attachShadow(init) {
    this.__shadowRootMode = init.mode;
    const shadowRoot = new ShadowRootShim(constructionToken, init);
    shadowRoot.__eventTargetParent = this;
    shadowRoot.__host = this;
    return this.__shadowRoot = shadowRoot;
  }
  attachInternals() {
    if (this.__internals !== null) {
      throw new Error(`Failed to execute 'attachInternals' on 'HTMLElement': ElementInternals for the specified element was already attached.`);
    }
    const internals = new ElementInternalsShim(this);
    this.__internals = internals;
    return internals;
  }
  getAttribute(name) {
    const value = attributesForElement(this).get(name);
    return value ?? null;
  }
};
var HTMLElementShim = class HTMLElement extends ElementShim {
};
var HTMLElementShimWithRealType = HTMLElementShim;
var ShadowRootShim = class ShadowRoot extends NodeShim {
  get host() {
    return this.__host;
  }
  constructor(constructionToken2, init) {
    super();
    if (constructionToken2 !== constructionToken2) {
      throw new TypeError("Illegal constructor");
    }
    this.mode = init.mode;
  }
};
globalThis.litServerRoot ??= Object.defineProperty(new HTMLElementShimWithRealType(), "localName", {
  // Patch localName (and tagName) to return a unique name.
  get() {
    return "lit-server-root";
  }
});
function promiseWithResolvers() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
var CustomElementRegistry = class {
  constructor() {
    this.__definitions = /* @__PURE__ */ new Map();
    this.__reverseDefinitions = /* @__PURE__ */ new Map();
    this.__pendingWhenDefineds = /* @__PURE__ */ new Map();
  }
  define(name, ctor) {
    if (this.__definitions.has(name)) {
      if (true) {
        console.warn(`'CustomElementRegistry' already has "${name}" defined. This may have been caused by live reload or hot module replacement in which case it can be safely ignored.
Make sure to test your application with a production build as repeat registrations will throw in production.`);
      } else {
        throw new Error(`Failed to execute 'define' on 'CustomElementRegistry': the name "${name}" has already been used with this registry`);
      }
    }
    if (this.__reverseDefinitions.has(ctor)) {
      throw new Error(`Failed to execute 'define' on 'CustomElementRegistry': the constructor has already been used with this registry for the tag name ${this.__reverseDefinitions.get(ctor)}`);
    }
    ctor.__localName = name;
    this.__definitions.set(name, {
      ctor,
      // Note it's important we read `observedAttributes` in case it is a getter
      // with side-effects, as is the case in Lit, where it triggers class
      // finalization.
      //
      // TODO(aomarks) To be spec compliant, we should also capture the
      // registration-time lifecycle methods like `connectedCallback`. For them
      // to be actually accessible to e.g. the Lit SSR element renderer, though,
      // we'd need to introduce a new API for accessing them (since `get` only
      // returns the constructor).
      observedAttributes: ctor.observedAttributes ?? []
    });
    this.__reverseDefinitions.set(ctor, name);
    this.__pendingWhenDefineds.get(name)?.resolve(ctor);
    this.__pendingWhenDefineds.delete(name);
  }
  get(name) {
    const definition = this.__definitions.get(name);
    return definition?.ctor;
  }
  getName(ctor) {
    return this.__reverseDefinitions.get(ctor) ?? null;
  }
  initialize(_root) {
    throw new Error(`customElements.initialize is not currently supported in SSR. Please file a bug if you need it.`);
  }
  upgrade(_element) {
    throw new Error(`customElements.upgrade is not currently supported in SSR. Please file a bug if you need it.`);
  }
  async whenDefined(name) {
    const definition = this.__definitions.get(name);
    if (definition) {
      return definition.ctor;
    }
    let withResolvers = this.__pendingWhenDefineds.get(name);
    if (!withResolvers) {
      withResolvers = promiseWithResolvers();
      this.__pendingWhenDefineds.set(name, withResolvers);
    }
    return withResolvers.promise;
  }
};
var CustomElementRegistryShimWithRealType = CustomElementRegistry;
var customElements2 = new CustomElementRegistryShimWithRealType();
var windowShim = new WindowShim(constructionToken);

// ../../node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/node/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t7, e6, o7) {
    if (this._$cssResult$ = true, o7 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t7, this.t = e6;
  }
  get styleSheet() {
    let t7 = this.o;
    const s5 = this.t;
    if (e && void 0 === t7) {
      const e6 = void 0 !== s5 && 1 === s5.length;
      e6 && (t7 = o.get(s5)), void 0 === t7 && ((this.o = t7 = new CSSStyleSheet()).replaceSync(this.cssText), e6 && o.set(s5, t7));
    }
    return t7;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t7) => new n("string" == typeof t7 ? t7 : t7 + "", void 0, s);
var i = (t7, ...e6) => {
  const o7 = 1 === t7.length ? t7[0] : e6.reduce((e7, s5, o8) => e7 + ((t8) => {
    if (true === t8._$cssResult$) return t8.cssText;
    if ("number" == typeof t8) return t8;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t8 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s5) + t7[o8 + 1], t7[0]);
  return new n(o7, t7, s);
};
var S = (s5, o7) => {
  if (e) s5.adoptedStyleSheets = o7.map((t7) => t7 instanceof CSSStyleSheet ? t7 : t7.styleSheet);
  else for (const e6 of o7) {
    const o8 = document.createElement("style"), n6 = t.litNonce;
    void 0 !== n6 && o8.setAttribute("nonce", n6), o8.textContent = e6.cssText, s5.appendChild(o8);
  }
};
var c = e || void 0 === t.CSSStyleSheet ? (t7) => t7 : (t7) => t7 instanceof CSSStyleSheet ? ((t8) => {
  let e6 = "";
  for (const s5 of t8.cssRules) e6 += s5.cssText;
  return r(e6);
})(t7) : t7;

// ../../node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/node/reactive-element.js
var { is: h, defineProperty: r2, getOwnPropertyDescriptor: o2, getOwnPropertyNames: n2, getOwnPropertySymbols: a, getPrototypeOf: c2 } = Object;
var l = globalThis;
l.customElements ??= customElements2;
var p = l.trustedTypes;
var d = p ? p.emptyScript : "";
var u = l.reactiveElementPolyfillSupport;
var f = (t7, s5) => t7;
var b = { toAttribute(t7, s5) {
  switch (s5) {
    case Boolean:
      t7 = t7 ? d : null;
      break;
    case Object:
    case Array:
      t7 = null == t7 ? t7 : JSON.stringify(t7);
  }
  return t7;
}, fromAttribute(t7, s5) {
  let i7 = t7;
  switch (s5) {
    case Boolean:
      i7 = null !== t7;
      break;
    case Number:
      i7 = null === t7 ? null : Number(t7);
      break;
    case Object:
    case Array:
      try {
        i7 = JSON.parse(t7);
      } catch (t8) {
        i7 = null;
      }
  }
  return i7;
} };
var m = (t7, s5) => !h(t7, s5);
var y = { attribute: true, type: String, converter: b, reflect: false, useDefault: false, hasChanged: m };
Symbol.metadata ??= Symbol("metadata"), l.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var g = class extends (globalThis.HTMLElement ?? HTMLElementShimWithRealType) {
  static addInitializer(t7) {
    this._$Ei(), (this.l ??= []).push(t7);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t7, s5 = y) {
    if (s5.state && (s5.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t7) && ((s5 = Object.create(s5)).wrapped = true), this.elementProperties.set(t7, s5), !s5.noAccessor) {
      const i7 = Symbol(), e6 = this.getPropertyDescriptor(t7, i7, s5);
      void 0 !== e6 && r2(this.prototype, t7, e6);
    }
  }
  static getPropertyDescriptor(t7, s5, i7) {
    const { get: e6, set: h4 } = o2(this.prototype, t7) ?? { get() {
      return this[s5];
    }, set(t8) {
      this[s5] = t8;
    } };
    return { get: e6, set(s6) {
      const r6 = e6?.call(this);
      h4?.call(this, s6), this.requestUpdate(t7, r6, i7);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t7) {
    return this.elementProperties.get(t7) ?? y;
  }
  static _$Ei() {
    if (this.hasOwnProperty(f("elementProperties"))) return;
    const t7 = c2(this);
    t7.finalize(), void 0 !== t7.l && (this.l = [...t7.l]), this.elementProperties = new Map(t7.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(f("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(f("properties"))) {
      const t8 = this.properties, s5 = [...n2(t8), ...a(t8)];
      for (const i7 of s5) this.createProperty(i7, t8[i7]);
    }
    const t7 = this[Symbol.metadata];
    if (null !== t7) {
      const s5 = litPropertyMetadata.get(t7);
      if (void 0 !== s5) for (const [t8, i7] of s5) this.elementProperties.set(t8, i7);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t8, s5] of this.elementProperties) {
      const i7 = this._$Eu(t8, s5);
      void 0 !== i7 && this._$Eh.set(i7, t8);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(t7) {
    const s5 = [];
    if (Array.isArray(t7)) {
      const e6 = new Set(t7.flat(1 / 0).reverse());
      for (const t8 of e6) s5.unshift(c(t8));
    } else void 0 !== t7 && s5.push(c(t7));
    return s5;
  }
  static _$Eu(t7, s5) {
    const i7 = s5.attribute;
    return false === i7 ? void 0 : "string" == typeof i7 ? i7 : "string" == typeof t7 ? t7.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t7) => this.enableUpdating = t7), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t7) => t7(this));
  }
  addController(t7) {
    (this._$EO ??= /* @__PURE__ */ new Set()).add(t7), void 0 !== this.renderRoot && this.isConnected && t7.hostConnected?.();
  }
  removeController(t7) {
    this._$EO?.delete(t7);
  }
  _$E_() {
    const t7 = /* @__PURE__ */ new Map(), s5 = this.constructor.elementProperties;
    for (const i7 of s5.keys()) this.hasOwnProperty(i7) && (t7.set(i7, this[i7]), delete this[i7]);
    t7.size > 0 && (this._$Ep = t7);
  }
  createRenderRoot() {
    const t7 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S(t7, this.constructor.elementStyles), t7;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(true), this._$EO?.forEach((t7) => t7.hostConnected?.());
  }
  enableUpdating(t7) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t7) => t7.hostDisconnected?.());
  }
  attributeChangedCallback(t7, s5, i7) {
    this._$AK(t7, i7);
  }
  _$ET(t7, s5) {
    const i7 = this.constructor.elementProperties.get(t7), e6 = this.constructor._$Eu(t7, i7);
    if (void 0 !== e6 && true === i7.reflect) {
      const h4 = (void 0 !== i7.converter?.toAttribute ? i7.converter : b).toAttribute(s5, i7.type);
      this._$Em = t7, null == h4 ? this.removeAttribute(e6) : this.setAttribute(e6, h4), this._$Em = null;
    }
  }
  _$AK(t7, s5) {
    const i7 = this.constructor, e6 = i7._$Eh.get(t7);
    if (void 0 !== e6 && this._$Em !== e6) {
      const t8 = i7.getPropertyOptions(e6), h4 = "function" == typeof t8.converter ? { fromAttribute: t8.converter } : void 0 !== t8.converter?.fromAttribute ? t8.converter : b;
      this._$Em = e6;
      const r6 = h4.fromAttribute(s5, t8.type);
      this[e6] = r6 ?? this._$Ej?.get(e6) ?? r6, this._$Em = null;
    }
  }
  requestUpdate(t7, s5, i7, e6 = false, h4) {
    if (void 0 !== t7) {
      const r6 = this.constructor;
      if (false === e6 && (h4 = this[t7]), i7 ??= r6.getPropertyOptions(t7), !((i7.hasChanged ?? m)(h4, s5) || i7.useDefault && i7.reflect && h4 === this._$Ej?.get(t7) && !this.hasAttribute(r6._$Eu(t7, i7)))) return;
      this.C(t7, s5, i7);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t7, s5, { useDefault: i7, reflect: e6, wrapped: h4 }, r6) {
    i7 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t7) && (this._$Ej.set(t7, r6 ?? s5 ?? this[t7]), true !== h4 || void 0 !== r6) || (this._$AL.has(t7) || (this.hasUpdated || i7 || (s5 = void 0), this._$AL.set(t7, s5)), true === e6 && this._$Em !== t7 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t7));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t8) {
      Promise.reject(t8);
    }
    const t7 = this.scheduleUpdate();
    return null != t7 && await t7, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
        for (const [t9, s6] of this._$Ep) this[t9] = s6;
        this._$Ep = void 0;
      }
      const t8 = this.constructor.elementProperties;
      if (t8.size > 0) for (const [s6, i7] of t8) {
        const { wrapped: t9 } = i7, e6 = this[s6];
        true !== t9 || this._$AL.has(s6) || void 0 === e6 || this.C(s6, void 0, i7, e6);
      }
    }
    let t7 = false;
    const s5 = this._$AL;
    try {
      t7 = this.shouldUpdate(s5), t7 ? (this.willUpdate(s5), this._$EO?.forEach((t8) => t8.hostUpdate?.()), this.update(s5)) : this._$EM();
    } catch (s6) {
      throw t7 = false, this._$EM(), s6;
    }
    t7 && this._$AE(s5);
  }
  willUpdate(t7) {
  }
  _$AE(t7) {
    this._$EO?.forEach((t8) => t8.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t7)), this.updated(t7);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t7) {
    return true;
  }
  update(t7) {
    this._$Eq &&= this._$Eq.forEach((t8) => this._$ET(t8, this[t8])), this._$EM();
  }
  updated(t7) {
  }
  firstUpdated(t7) {
  }
};
g.elementStyles = [], g.shadowRootOptions = { mode: "open" }, g[f("elementProperties")] = /* @__PURE__ */ new Map(), g[f("finalized")] = /* @__PURE__ */ new Map(), u?.({ ReactiveElement: g }), (l.reactiveElementVersions ??= []).push("2.1.2");

// ../../node_modules/.pnpm/lit-html@3.3.3/node_modules/lit-html/lit-html.js
var t2 = globalThis;
var i2 = (t7) => t7;
var s2 = t2.trustedTypes;
var e2 = s2 ? s2.createPolicy("lit-html", { createHTML: (t7) => t7 }) : void 0;
var h2 = "$lit$";
var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
var n3 = "?" + o3;
var r3 = `<${n3}>`;
var l2 = document;
var c3 = () => l2.createComment("");
var a2 = (t7) => null === t7 || "object" != typeof t7 && "function" != typeof t7;
var u2 = Array.isArray;
var d2 = (t7) => u2(t7) || "function" == typeof t7?.[Symbol.iterator];
var f2 = "[ 	\n\f\r]";
var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var _ = /-->/g;
var m2 = />/g;
var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
var g2 = /'/g;
var $ = /"/g;
var y2 = /^(?:script|style|textarea|title)$/i;
var x = (t7) => (i7, ...s5) => ({ _$litType$: t7, strings: i7, values: s5 });
var b2 = x(1);
var w = x(2);
var T = x(3);
var E = Symbol.for("lit-noChange");
var A = Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t7, i7) {
  if (!u2(t7) || !t7.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e2 ? e2.createHTML(i7) : i7;
}
var N = (t7, i7) => {
  const s5 = t7.length - 1, e6 = [];
  let n6, l3 = 2 === i7 ? "<svg>" : 3 === i7 ? "<math>" : "", c5 = v;
  for (let i8 = 0; i8 < s5; i8++) {
    const s6 = t7[i8];
    let a3, u5, d3 = -1, f3 = 0;
    for (; f3 < s6.length && (c5.lastIndex = f3, u5 = c5.exec(s6), null !== u5); ) f3 = c5.lastIndex, c5 === v ? "!--" === u5[1] ? c5 = _ : void 0 !== u5[1] ? c5 = m2 : void 0 !== u5[2] ? (y2.test(u5[2]) && (n6 = RegExp("</" + u5[2], "g")), c5 = p2) : void 0 !== u5[3] && (c5 = p2) : c5 === p2 ? ">" === u5[0] ? (c5 = n6 ?? v, d3 = -1) : void 0 === u5[1] ? d3 = -2 : (d3 = c5.lastIndex - u5[2].length, a3 = u5[1], c5 = void 0 === u5[3] ? p2 : '"' === u5[3] ? $ : g2) : c5 === $ || c5 === g2 ? c5 = p2 : c5 === _ || c5 === m2 ? c5 = v : (c5 = p2, n6 = void 0);
    const x2 = c5 === p2 && t7[i8 + 1].startsWith("/>") ? " " : "";
    l3 += c5 === v ? s6 + r3 : d3 >= 0 ? (e6.push(a3), s6.slice(0, d3) + h2 + s6.slice(d3) + o3 + x2) : s6 + o3 + (-2 === d3 ? i8 : x2);
  }
  return [V(t7, l3 + (t7[s5] || "<?>") + (2 === i7 ? "</svg>" : 3 === i7 ? "</math>" : "")), e6];
};
var S2 = class _S {
  constructor({ strings: t7, _$litType$: i7 }, e6) {
    let r6;
    this.parts = [];
    let l3 = 0, a3 = 0;
    const u5 = t7.length - 1, d3 = this.parts, [f3, v3] = N(t7, i7);
    if (this.el = _S.createElement(f3, e6), P.currentNode = this.el.content, 2 === i7 || 3 === i7) {
      const t8 = this.el.content.firstChild;
      t8.replaceWith(...t8.childNodes);
    }
    for (; null !== (r6 = P.nextNode()) && d3.length < u5; ) {
      if (1 === r6.nodeType) {
        if (r6.hasAttributes()) for (const t8 of r6.getAttributeNames()) if (t8.endsWith(h2)) {
          const i8 = v3[a3++], s5 = r6.getAttribute(t8).split(o3), e7 = /([.?@])?(.*)/.exec(i8);
          d3.push({ type: 1, index: l3, name: e7[2], strings: s5, ctor: "." === e7[1] ? I : "?" === e7[1] ? L : "@" === e7[1] ? z : H }), r6.removeAttribute(t8);
        } else t8.startsWith(o3) && (d3.push({ type: 6, index: l3 }), r6.removeAttribute(t8));
        if (y2.test(r6.tagName)) {
          const t8 = r6.textContent.split(o3), i8 = t8.length - 1;
          if (i8 > 0) {
            r6.textContent = s2 ? s2.emptyScript : "";
            for (let s5 = 0; s5 < i8; s5++) r6.append(t8[s5], c3()), P.nextNode(), d3.push({ type: 2, index: ++l3 });
            r6.append(t8[i8], c3());
          }
        }
      } else if (8 === r6.nodeType) if (r6.data === n3) d3.push({ type: 2, index: l3 });
      else {
        let t8 = -1;
        for (; -1 !== (t8 = r6.data.indexOf(o3, t8 + 1)); ) d3.push({ type: 7, index: l3 }), t8 += o3.length - 1;
      }
      l3++;
    }
  }
  static createElement(t7, i7) {
    const s5 = l2.createElement("template");
    return s5.innerHTML = t7, s5;
  }
};
function M(t7, i7, s5 = t7, e6) {
  if (i7 === E) return i7;
  let h4 = void 0 !== e6 ? s5._$Co?.[e6] : s5._$Cl;
  const o7 = a2(i7) ? void 0 : i7._$litDirective$;
  return h4?.constructor !== o7 && (h4?._$AO?.(false), void 0 === o7 ? h4 = void 0 : (h4 = new o7(t7), h4._$AT(t7, s5, e6)), void 0 !== e6 ? (s5._$Co ??= [])[e6] = h4 : s5._$Cl = h4), void 0 !== h4 && (i7 = M(t7, h4._$AS(t7, i7.values), h4, e6)), i7;
}
var R = class {
  constructor(t7, i7) {
    this._$AV = [], this._$AN = void 0, this._$AD = t7, this._$AM = i7;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t7) {
    const { el: { content: i7 }, parts: s5 } = this._$AD, e6 = (t7?.creationScope ?? l2).importNode(i7, true);
    P.currentNode = e6;
    let h4 = P.nextNode(), o7 = 0, n6 = 0, r6 = s5[0];
    for (; void 0 !== r6; ) {
      if (o7 === r6.index) {
        let i8;
        2 === r6.type ? i8 = new k(h4, h4.nextSibling, this, t7) : 1 === r6.type ? i8 = new r6.ctor(h4, r6.name, r6.strings, this, t7) : 6 === r6.type && (i8 = new Z(h4, this, t7)), this._$AV.push(i8), r6 = s5[++n6];
      }
      o7 !== r6?.index && (h4 = P.nextNode(), o7++);
    }
    return P.currentNode = l2, e6;
  }
  p(t7) {
    let i7 = 0;
    for (const s5 of this._$AV) void 0 !== s5 && (void 0 !== s5.strings ? (s5._$AI(t7, s5, i7), i7 += s5.strings.length - 2) : s5._$AI(t7[i7])), i7++;
  }
};
var k = class _k {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t7, i7, s5, e6) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t7, this._$AB = i7, this._$AM = s5, this.options = e6, this._$Cv = e6?.isConnected ?? true;
  }
  get parentNode() {
    let t7 = this._$AA.parentNode;
    const i7 = this._$AM;
    return void 0 !== i7 && 11 === t7?.nodeType && (t7 = i7.parentNode), t7;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t7, i7 = this) {
    t7 = M(this, t7, i7), a2(t7) ? t7 === A || null == t7 || "" === t7 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t7 !== this._$AH && t7 !== E && this._(t7) : void 0 !== t7._$litType$ ? this.$(t7) : void 0 !== t7.nodeType ? this.T(t7) : d2(t7) ? this.k(t7) : this._(t7);
  }
  O(t7) {
    return this._$AA.parentNode.insertBefore(t7, this._$AB);
  }
  T(t7) {
    this._$AH !== t7 && (this._$AR(), this._$AH = this.O(t7));
  }
  _(t7) {
    this._$AH !== A && a2(this._$AH) ? this._$AA.nextSibling.data = t7 : this.T(l2.createTextNode(t7)), this._$AH = t7;
  }
  $(t7) {
    const { values: i7, _$litType$: s5 } = t7, e6 = "number" == typeof s5 ? this._$AC(t7) : (void 0 === s5.el && (s5.el = S2.createElement(V(s5.h, s5.h[0]), this.options)), s5);
    if (this._$AH?._$AD === e6) this._$AH.p(i7);
    else {
      const t8 = new R(e6, this), s6 = t8.u(this.options);
      t8.p(i7), this.T(s6), this._$AH = t8;
    }
  }
  _$AC(t7) {
    let i7 = C.get(t7.strings);
    return void 0 === i7 && C.set(t7.strings, i7 = new S2(t7)), i7;
  }
  k(t7) {
    u2(this._$AH) || (this._$AH = [], this._$AR());
    const i7 = this._$AH;
    let s5, e6 = 0;
    for (const h4 of t7) e6 === i7.length ? i7.push(s5 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s5 = i7[e6], s5._$AI(h4), e6++;
    e6 < i7.length && (this._$AR(s5 && s5._$AB.nextSibling, e6), i7.length = e6);
  }
  _$AR(t7 = this._$AA.nextSibling, s5) {
    for (this._$AP?.(false, true, s5); t7 !== this._$AB; ) {
      const s6 = i2(t7).nextSibling;
      i2(t7).remove(), t7 = s6;
    }
  }
  setConnected(t7) {
    void 0 === this._$AM && (this._$Cv = t7, this._$AP?.(t7));
  }
};
var H = class {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t7, i7, s5, e6, h4) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t7, this.name = i7, this._$AM = e6, this.options = h4, s5.length > 2 || "" !== s5[0] || "" !== s5[1] ? (this._$AH = Array(s5.length - 1).fill(new String()), this.strings = s5) : this._$AH = A;
  }
  _$AI(t7, i7 = this, s5, e6) {
    const h4 = this.strings;
    let o7 = false;
    if (void 0 === h4) t7 = M(this, t7, i7, 0), o7 = !a2(t7) || t7 !== this._$AH && t7 !== E, o7 && (this._$AH = t7);
    else {
      const e7 = t7;
      let n6, r6;
      for (t7 = h4[0], n6 = 0; n6 < h4.length - 1; n6++) r6 = M(this, e7[s5 + n6], i7, n6), r6 === E && (r6 = this._$AH[n6]), o7 ||= !a2(r6) || r6 !== this._$AH[n6], r6 === A ? t7 = A : t7 !== A && (t7 += (r6 ?? "") + h4[n6 + 1]), this._$AH[n6] = r6;
    }
    o7 && !e6 && this.j(t7);
  }
  j(t7) {
    t7 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t7 ?? "");
  }
};
var I = class extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t7) {
    this.element[this.name] = t7 === A ? void 0 : t7;
  }
};
var L = class extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t7) {
    this.element.toggleAttribute(this.name, !!t7 && t7 !== A);
  }
};
var z = class extends H {
  constructor(t7, i7, s5, e6, h4) {
    super(t7, i7, s5, e6, h4), this.type = 5;
  }
  _$AI(t7, i7 = this) {
    if ((t7 = M(this, t7, i7, 0) ?? A) === E) return;
    const s5 = this._$AH, e6 = t7 === A && s5 !== A || t7.capture !== s5.capture || t7.once !== s5.once || t7.passive !== s5.passive, h4 = t7 !== A && (s5 === A || e6);
    e6 && this.element.removeEventListener(this.name, this, s5), h4 && this.element.addEventListener(this.name, this, t7), this._$AH = t7;
  }
  handleEvent(t7) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t7) : this._$AH.handleEvent(t7);
  }
};
var Z = class {
  constructor(t7, i7, s5) {
    this.element = t7, this.type = 6, this._$AN = void 0, this._$AM = i7, this.options = s5;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t7) {
    M(this, t7);
  }
};
var j = { M: h2, P: o3, A: n3, C: 1, L: N, R, D: d2, V: M, I: k, H, N: L, U: z, B: I, F: Z };
var B = t2.litHtmlPolyfillSupport;
B?.(S2, k), (t2.litHtmlVersions ??= []).push("3.3.3");
var D = (t7, i7, s5) => {
  const e6 = s5?.renderBefore ?? i7;
  let h4 = e6._$litPart$;
  if (void 0 === h4) {
    const t8 = s5?.renderBefore ?? null;
    e6._$litPart$ = h4 = new k(i7.insertBefore(c3(), t8), t8, void 0, s5 ?? {});
  }
  return h4._$AI(t7), h4;
};

// ../../node_modules/.pnpm/lit-element@4.2.2/node_modules/lit-element/lit-element.js
var s3 = globalThis;
var i3 = class extends g {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    const t7 = super.createRenderRoot();
    return this.renderOptions.renderBefore ??= t7.firstChild, t7;
  }
  update(t7) {
    const r6 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t7), this._$Do = D(r6, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    super.connectedCallback(), this._$Do?.setConnected(true);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this._$Do?.setConnected(false);
  }
  render() {
    return E;
  }
};
i3._$litElement$ = true, i3["finalized"] = true, s3.litElementHydrateSupport?.({ LitElement: i3 });
var o4 = s3.litElementPolyfillSupport;
o4?.({ LitElement: i3 });
(s3.litElementVersions ??= []).push("4.2.2");

// ../../node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/node/decorators/property.js
var o5 = { attribute: true, type: String, converter: b, reflect: false, hasChanged: m };
var r4 = (t7 = o5, e6, r6) => {
  const { kind: n6, metadata: i7 } = r6;
  let s5 = globalThis.litPropertyMetadata.get(i7);
  if (void 0 === s5 && globalThis.litPropertyMetadata.set(i7, s5 = /* @__PURE__ */ new Map()), "setter" === n6 && ((t7 = Object.create(t7)).wrapped = true), s5.set(r6.name, t7), "accessor" === n6) {
    const { name: o7 } = r6;
    return { set(r7) {
      const n7 = e6.get.call(this);
      e6.set.call(this, r7), this.requestUpdate(o7, n7, t7, true, r7);
    }, init(e7) {
      return void 0 !== e7 && this.C(o7, void 0, t7, e7), e7;
    } };
  }
  if ("setter" === n6) {
    const { name: o7 } = r6;
    return function(r7) {
      const n7 = this[o7];
      e6.call(this, r7), this.requestUpdate(o7, n7, t7, true, r7);
    };
  }
  throw Error("Unsupported decorator location: " + n6);
};
function n4(t7) {
  return (e6, o7) => "object" == typeof o7 ? r4(t7, e6, o7) : ((t8, e7, o8) => {
    const r6 = e7.hasOwnProperty(o8);
    return e7.constructor.createProperty(o8, t8), r6 ? Object.getOwnPropertyDescriptor(e7, o8) : void 0;
  })(t7, e6, o7);
}

// ../../node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/node/decorators/state.js
function r5(r6) {
  return n4({ ...r6, state: true, attribute: false });
}

// ../../node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/node/decorators/base.js
var e3 = (e6, t7, c5) => (c5.configurable = true, c5.enumerable = true, Reflect.decorate && "object" != typeof t7 && Object.defineProperty(e6, t7, c5), c5);

// ../../node_modules/.pnpm/@lit+reactive-element@2.1.2/node_modules/@lit/reactive-element/node/decorators/query.js
function e4(e6, r6) {
  return (n6, s5, i7) => {
    const o7 = (t7) => t7.renderRoot?.querySelector(e6) ?? null;
    if (r6) {
      const { get: e7, set: r7 } = "object" == typeof s5 ? n6 : i7 ?? (() => {
        const t7 = Symbol();
        return { get() {
          return this[t7];
        }, set(e8) {
          this[t7] = e8;
        } };
      })();
      return e3(n6, s5, { get() {
        let t7 = e7.call(this);
        return void 0 === t7 && (t7 = o7(this), (null !== t7 || this.hasUpdated) && r7.call(this, t7)), t7;
      } });
    }
    return e3(n6, s5, { get() {
      return o7(this);
    } });
  };
}

// ../../node_modules/.pnpm/@erplora+outfitkit@file+..+outfitkit/node_modules/@erplora/outfitkit/dist/define.js
function define(tag, ctor) {
  if (typeof customElements !== "undefined" && !customElements.get(tag)) {
    customElements.define(tag, ctor);
  }
}

// ../../node_modules/.pnpm/@erplora+module-sdk@file+..+hub+packages+module-sdk/node_modules/@erplora/module-sdk/src/index.ts
function isEmpty(v3) {
  return v3 === null || v3 === void 0 || v3 === "";
}
var ListController = class {
  constructor(client, queryName, onChange = () => {
  }, opts = {}) {
    this.client = client;
    this.queryName = queryName;
    this.onChange = onChange;
    this.rows = [];
    this.total = 0;
    this.loading = false;
    this.error = "";
    /** Descarta respuestas obsoletas si llegan fuera de orden (race de cargas concurrentes). */
    this.seq = 0;
    this.state = {
      page: 0,
      pageSize: opts.pageSize ?? 50,
      search: "",
      sort: opts.sort,
      dir: opts.dir ?? "asc",
      filters: { ...opts.filters ?? {} },
      context: { ...opts.context ?? {} }
    };
  }
  /** Nº de páginas según el total del servidor (mínimo 1). */
  get pageCount() {
    return Math.max(1, Math.ceil(this.total / this.state.pageSize));
  }
  /** (Re)carga la página actual desde el servidor. */
  async load() {
    const s5 = this.state;
    const mySeq = ++this.seq;
    this.loading = true;
    this.error = "";
    this.onChange();
    try {
      const page = await this.client.queryPage(this.queryName, {
        limit: s5.pageSize,
        offset: s5.page * s5.pageSize,
        search: s5.search,
        sort: s5.sort,
        dir: s5.dir,
        filters: s5.filters,
        params: s5.context
      });
      if (mySeq !== this.seq) return;
      this.rows = page.rows ?? [];
      this.total = page.total ?? this.rows.length;
    } catch (e6) {
      if (mySeq !== this.seq) return;
      this.rows = [];
      this.total = 0;
      this.error = e6 instanceof Error ? e6.message : "Error cargando datos";
    } finally {
      if (mySeq === this.seq) {
        this.loading = false;
        this.onChange();
      }
    }
  }
  setPage(page) {
    this.state.page = Math.max(0, page);
    void this.load();
  }
  setSort(sort, dir) {
    this.state.sort = sort;
    this.state.dir = dir;
    this.state.page = 0;
    void this.load();
  }
  setSearch(search) {
    this.state.search = search;
    this.state.page = 0;
    void this.load();
  }
  /** Cambia el nº de filas por página y recarga desde la página 0. */
  setPageSize(pageSize) {
    this.state.pageSize = Math.max(1, pageSize);
    this.state.page = 0;
    void this.load();
  }
  /** Aplica/quita un filtro de columna; valores vacíos lo eliminan. Vuelve a la página 0. */
  setFilter(col, value) {
    if (isEmpty(value)) {
      delete this.state.filters[col];
    } else if (typeof value === "object" && value !== null) {
      const prev = this.state.filters[col] ?? {};
      const merged = { ...prev, ...value };
      const cleaned = Object.fromEntries(Object.entries(merged).filter(([, v3]) => !isEmpty(v3)));
      if (Object.keys(cleaned).length === 0) delete this.state.filters[col];
      else this.state.filters[col] = cleaned;
    } else {
      this.state.filters[col] = value;
    }
    this.state.page = 0;
    void this.load();
  }
  /** Fija/actualiza los params de contexto obligatorios (p.ej. al seleccionar el padre).
   *  Vuelve a la página 0 y recarga. Pasa `{}` o keys con valor vacío para limpiar. */
  setContext(context) {
    this.state.context = { ...context };
    this.state.page = 0;
    void this.load();
  }
  reset() {
    this.state.page = 0;
    this.state.search = "";
    this.state.filters = {};
    void this.load();
  }
};
function createListController(client, queryName, onChange = () => {
}, opts = {}) {
  return new ListController(client, queryName, onChange, opts);
}
function majorToMinor(amount, decimals) {
  const n6 = Number(amount);
  return Number.isFinite(n6) ? Math.round(n6 * 10 ** decimals) : 0;
}
function eurosToCents(euros) {
  return majorToMinor(euros, 2);
}

// ui/lib/receipt-html.ts
function esc(v3) {
  return String(v3 ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function money(v3, currency) {
  const n6 = Number(v3);
  return `${(Number.isFinite(n6) ? n6 : 0).toFixed(2).replace(".", ",")} ${currency}`;
}
function receiptToPrintableHtml(doc) {
  const cur = doc.currency || "\u20AC";
  const lineas = (doc.lines ?? []).map((l3) => `
      <tr>
        <td class="n">${esc(l3.name)}<div class="q">${esc(l3.qty)} \xD7 ${money(l3.unit_price, cur)}</div></td>
        <td class="a">${money(l3.total, cur)}</td>
      </tr>`).join("");
  const impuestos = (doc.taxes ?? []).map((t7) => `
      <tr><td>${esc(t7.label)}</td><td class="a">${money(t7.amount, cur)}</td></tr>`).join("");
  const pago = doc.payment ? `<tr><td>${esc(doc.payment.method)}</td><td class="a">${money(doc.payment.paid ?? doc.total, cur)}</td></tr>` + (doc.payment.change != null ? `<tr><td>Cambio</td><td class="a">${money(doc.payment.change, cur)}</td></tr>` : "") : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(doc.number || doc.business?.name || "Documento")}</title>
<style>
  /* Papel t\xE9rmico de 80 mm: sin m\xE1rgenes de p\xE1gina, el navegador no estampa cabecera ni pie. */
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 4mm; width: 80mm; background: #fff; color: #000;
         font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
  h1 { font-size: 14px; text-align: center; margin: 0 0 2mm; text-transform: uppercase; }
  .meta { text-align: center; font-size: 11px; margin-bottom: 2mm; }
  hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: .4mm 0; }
  td.a { text-align: right; white-space: nowrap; padding-left: 2mm; }
  .q { font-size: 10px; color: #333; }
  .tot td { font-size: 15px; font-weight: 700; padding-top: 1mm; }
  .foot { text-align: center; font-size: 10px; margin-top: 3mm; }
</style></head>
<body>
  <h1>${esc(doc.business?.name || "")}</h1>
  ${doc.business?.address ? `<div class="meta">${esc(doc.business.address)}</div>` : ""}
  ${doc.business?.tax_id ? `<div class="meta">${esc(doc.business.tax_id)}</div>` : ""}
  ${doc.number || doc.datetime ? `<div class="meta">${esc(doc.number || "")}${doc.number && doc.datetime ? " \xB7 " : ""}${esc(doc.datetime || "")}</div>` : ""}
  ${doc.customer ? `<div class="meta">${esc(doc.customer)}</div>` : ""}
  <hr>
  <table>${lineas}</table>
  <hr>
  <table>
    ${doc.subtotal != null ? `<tr><td>Subtotal</td><td class="a">${money(doc.subtotal, cur)}</td></tr>` : ""}
    ${impuestos}
    <tr class="tot"><td>TOTAL</td><td class="a">${money(doc.total, cur)}</td></tr>
    ${pago}
  </table>
  ${doc.footer ? `<div class="foot">${esc(doc.footer)}</div>` : ""}
  ${doc.qr_note ? `<div class="foot">${esc(doc.qr_note)}</div>` : ""}
</body></html>`;
}
function printHtmlInIframe(html, doc = document) {
  const frame = doc.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:80mm;height:1px;border:0;visibility:hidden;";
  doc.body.appendChild(frame);
  const w2 = frame.contentWindow;
  const d3 = frame.contentDocument;
  if (!w2 || !d3) {
    frame.remove();
    return;
  }
  d3.open();
  d3.write(html);
  d3.close();
  const lanzar = () => {
    try {
      w2.focus();
      w2.print();
    } finally {
      setTimeout(() => frame.remove(), 1e3);
    }
  };
  if (d3.readyState === "complete") setTimeout(lanzar, 50);
  else w2.addEventListener("load", () => setTimeout(lanzar, 50), { once: true });
}

// ../../node_modules/.pnpm/@erplora+outfitkit@file+..+outfitkit/node_modules/@erplora/outfitkit/dist/ok-qr.js
var __defProp2 = Object.defineProperty;
var __decorateClass2 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp2(target, key, result);
  return result;
};
var GF_EXP = new Uint8Array(512);
var GF_LOG = new Uint8Array(256);
(() => {
  let x2 = 1;
  for (let i7 = 0; i7 < 255; i7++) {
    GF_EXP[i7] = x2;
    GF_LOG[x2] = i7;
    x2 <<= 1;
    if (x2 & 256) x2 ^= 285;
  }
  for (let i7 = 255; i7 < 512; i7++) GF_EXP[i7] = GF_EXP[i7 - 255];
})();
function gfMul(a3, b3) {
  if (a3 === 0 || b3 === 0) return 0;
  return GF_EXP[GF_LOG[a3] + GF_LOG[b3]];
}
function rsGeneratorPoly(degree) {
  let poly = new Uint8Array([1]);
  for (let i7 = 0; i7 < degree; i7++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j2 = 0; j2 < poly.length; j2++) {
      next[j2] ^= poly[j2];
      next[j2 + 1] ^= gfMul(poly[j2], GF_EXP[i7]);
    }
    poly = next;
  }
  return poly;
}
function rsEncode(data, degree) {
  const gen = rsGeneratorPoly(degree);
  const res = new Uint8Array(data.length + degree);
  res.set(data);
  for (let i7 = 0; i7 < data.length; i7++) {
    const coef = res[i7];
    if (coef !== 0) {
      for (let j2 = 0; j2 < gen.length; j2++) {
        res[i7 + j2] ^= gfMul(gen[j2], coef);
      }
    }
  }
  return res.slice(data.length);
}
var EC_ORDER = ["L", "M", "Q", "H"];
var TOTAL_CODEWORDS = [
  26,
  44,
  70,
  100,
  134,
  172,
  196,
  242,
  292,
  346,
  404,
  466,
  532,
  581,
  655,
  733,
  815,
  901,
  991,
  1085,
  1156,
  1258,
  1364,
  1474,
  1588,
  1706,
  1828,
  1921,
  2051,
  2185,
  2323,
  2465,
  2611,
  2761,
  2876,
  3034,
  3196,
  3362,
  3532,
  3706
];
var EC_BLOCKS = [
  /* v1 */
  [[7, 1, 19, 0, 0], [10, 1, 16, 0, 0], [13, 1, 13, 0, 0], [17, 1, 9, 0, 0]],
  /* v2 */
  [[10, 1, 34, 0, 0], [16, 1, 28, 0, 0], [22, 1, 22, 0, 0], [28, 1, 16, 0, 0]],
  /* v3 */
  [[15, 1, 55, 0, 0], [26, 1, 44, 0, 0], [18, 2, 17, 0, 0], [22, 2, 13, 0, 0]],
  /* v4 */
  [[20, 1, 80, 0, 0], [18, 2, 32, 0, 0], [26, 2, 24, 0, 0], [16, 4, 9, 0, 0]],
  /* v5 */
  [[26, 1, 108, 0, 0], [24, 2, 43, 0, 0], [18, 2, 15, 2, 16], [22, 2, 11, 2, 12]],
  /* v6 */
  [[18, 2, 68, 0, 0], [16, 4, 27, 0, 0], [24, 4, 19, 0, 0], [28, 4, 15, 0, 0]],
  /* v7 */
  [[20, 2, 78, 0, 0], [18, 4, 31, 0, 0], [18, 2, 14, 4, 15], [26, 4, 13, 1, 14]],
  /* v8 */
  [[24, 2, 97, 0, 0], [22, 2, 38, 2, 39], [22, 4, 18, 2, 19], [26, 4, 14, 2, 15]],
  /* v9 */
  [[30, 2, 116, 0, 0], [22, 3, 36, 2, 37], [20, 4, 16, 4, 17], [24, 4, 12, 4, 13]],
  /* v10 */
  [[18, 2, 68, 2, 69], [26, 4, 43, 1, 44], [24, 6, 19, 2, 20], [28, 6, 15, 2, 16]],
  /* v11 */
  [[20, 4, 81, 0, 0], [30, 1, 50, 4, 51], [28, 4, 22, 4, 23], [24, 3, 12, 8, 13]],
  /* v12 */
  [[24, 2, 92, 2, 93], [22, 6, 36, 2, 37], [26, 4, 20, 6, 21], [28, 7, 14, 4, 15]],
  /* v13 */
  [[26, 4, 107, 0, 0], [22, 8, 37, 1, 38], [24, 8, 20, 4, 21], [22, 12, 11, 4, 12]],
  /* v14 */
  [[30, 3, 115, 1, 116], [24, 4, 40, 5, 41], [20, 11, 16, 5, 17], [24, 11, 12, 5, 13]],
  /* v15 */
  [[22, 5, 87, 1, 88], [24, 5, 41, 5, 42], [30, 5, 24, 7, 25], [24, 11, 12, 7, 13]],
  /* v16 */
  [[24, 5, 98, 1, 99], [28, 7, 45, 3, 46], [24, 15, 19, 2, 20], [30, 3, 15, 13, 16]],
  /* v17 */
  [[28, 1, 107, 5, 108], [28, 10, 46, 1, 47], [28, 1, 22, 15, 23], [28, 2, 14, 17, 15]],
  /* v18 */
  [[30, 5, 120, 1, 121], [26, 9, 43, 4, 44], [28, 17, 22, 1, 23], [28, 2, 14, 19, 15]],
  /* v19 */
  [[28, 3, 113, 4, 114], [26, 3, 44, 11, 45], [26, 17, 21, 4, 22], [26, 9, 13, 16, 14]],
  /* v20 */
  [[28, 3, 107, 5, 108], [26, 3, 41, 13, 42], [30, 15, 24, 5, 25], [28, 15, 15, 10, 16]],
  /* v21 */
  [[28, 4, 116, 4, 117], [26, 17, 42, 0, 0], [28, 17, 22, 6, 23], [30, 19, 16, 6, 17]],
  /* v22 */
  [[28, 2, 111, 7, 112], [28, 17, 46, 0, 0], [30, 7, 24, 16, 25], [24, 34, 13, 0, 0]],
  /* v23 */
  [[30, 4, 121, 5, 122], [28, 4, 47, 14, 48], [30, 11, 24, 14, 25], [30, 16, 15, 14, 16]],
  /* v24 */
  [[30, 6, 117, 4, 118], [28, 6, 45, 14, 46], [30, 11, 24, 16, 25], [30, 30, 16, 2, 17]],
  /* v25 */
  [[26, 8, 106, 4, 107], [28, 8, 47, 13, 48], [30, 7, 24, 22, 25], [30, 22, 15, 13, 16]],
  /* v26 */
  [[28, 10, 114, 2, 115], [28, 19, 46, 4, 47], [28, 28, 22, 6, 23], [30, 33, 16, 4, 17]],
  /* v27 */
  [[30, 8, 122, 4, 123], [28, 22, 45, 3, 46], [30, 8, 23, 26, 24], [30, 12, 15, 28, 16]],
  /* v28 */
  [[30, 3, 117, 10, 118], [28, 3, 45, 23, 46], [30, 4, 24, 31, 25], [30, 11, 15, 31, 16]],
  /* v29 */
  [[30, 7, 116, 7, 117], [28, 21, 45, 7, 46], [30, 1, 23, 37, 24], [30, 19, 15, 26, 16]],
  /* v30 */
  [[30, 5, 115, 10, 116], [28, 19, 47, 10, 48], [30, 15, 24, 25, 25], [30, 23, 15, 25, 16]],
  /* v31 */
  [[30, 13, 115, 3, 116], [28, 2, 46, 29, 47], [30, 42, 24, 1, 25], [30, 23, 15, 28, 16]],
  /* v32 */
  [[30, 17, 115, 0, 0], [28, 10, 46, 23, 47], [30, 10, 24, 35, 25], [30, 19, 15, 35, 16]],
  /* v33 */
  [[30, 17, 115, 1, 116], [28, 14, 46, 21, 47], [30, 29, 24, 19, 25], [30, 11, 15, 46, 16]],
  /* v34 */
  [[30, 13, 115, 6, 116], [28, 14, 46, 23, 47], [30, 44, 24, 7, 25], [30, 59, 16, 1, 17]],
  /* v35 */
  [[30, 12, 121, 7, 122], [28, 12, 47, 26, 48], [30, 39, 24, 14, 25], [30, 22, 15, 41, 16]],
  /* v36 */
  [[30, 6, 121, 14, 122], [28, 6, 47, 34, 48], [30, 46, 24, 10, 25], [30, 2, 15, 64, 16]],
  /* v37 */
  [[30, 17, 122, 4, 123], [28, 29, 46, 14, 47], [30, 49, 24, 10, 25], [30, 24, 15, 46, 16]],
  /* v38 */
  [[30, 4, 122, 18, 123], [28, 13, 46, 32, 47], [30, 48, 24, 14, 25], [30, 42, 15, 32, 16]],
  /* v39 */
  [[30, 20, 117, 4, 118], [28, 40, 47, 7, 48], [30, 43, 24, 22, 25], [30, 10, 15, 67, 16]],
  /* v40 */
  [[30, 19, 118, 6, 119], [28, 18, 47, 31, 48], [30, 34, 24, 34, 25], [30, 20, 15, 61, 16]]
];
var ALIGN_POS = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170]
];
var VERSION_INFO = [
  31892,
  34236,
  39577,
  42195,
  48118,
  51042,
  55367,
  58893,
  63784,
  68472,
  70749,
  76311,
  79154,
  84390,
  87683,
  92361,
  96236,
  102084,
  102881,
  110507,
  110734,
  117786,
  119615,
  126325,
  127568,
  133589,
  136944,
  141498,
  145311,
  150283,
  152622,
  158308,
  161089,
  167017
];
var FORMAT_INFO = [
  21522,
  20773,
  24188,
  23371,
  17913,
  16590,
  20375,
  19104,
  30660,
  29427,
  32170,
  30877,
  26159,
  25368,
  27713,
  26998,
  5769,
  5054,
  7399,
  6608,
  1890,
  597,
  3340,
  2107,
  13663,
  12392,
  16177,
  14854,
  9396,
  8579,
  11994,
  11245
];
var EC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };
var BitBuffer = class {
  constructor() {
    this.bits = [];
  }
  put(value, length) {
    for (let i7 = length - 1; i7 >= 0; i7--) {
      this.bits.push(value >>> i7 & 1);
    }
  }
  get length() {
    return this.bits.length;
  }
};
function charCountBits(version) {
  return version <= 9 ? 8 : 16;
}
function encodeData(bytes, version, ec) {
  const totalCw = TOTAL_CODEWORDS[version - 1];
  const blocks = EC_BLOCKS[version - 1][EC_ORDER.indexOf(ec)];
  const ecPerBlock = blocks[0];
  const numBlocks = blocks[1] + blocks[3];
  const totalEcCw = ecPerBlock * numBlocks;
  const dataCwCapacity = totalCw - totalEcCw;
  const dataBitCapacity = dataCwCapacity * 8;
  const ccBits = charCountBits(version);
  const buf = new BitBuffer();
  buf.put(4, 4);
  buf.put(bytes.length, ccBits);
  for (const b3 of bytes) buf.put(b3, 8);
  if (buf.length > dataBitCapacity) return null;
  const remaining = dataBitCapacity - buf.length;
  buf.put(0, Math.min(4, remaining));
  while (buf.length % 8 !== 0) buf.bits.push(0);
  const padBytes = [236, 17];
  let pi = 0;
  while (buf.length < dataBitCapacity) {
    buf.put(padBytes[pi], 8);
    pi ^= 1;
  }
  const dataCw = new Uint8Array(dataCwCapacity);
  for (let i7 = 0; i7 < dataCwCapacity; i7++) {
    let byte = 0;
    for (let j2 = 0; j2 < 8; j2++) byte = byte << 1 | buf.bits[i7 * 8 + j2];
    dataCw[i7] = byte;
  }
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  const layout = [];
  for (let g3 = 0; g3 < blocks[1]; g3++) layout.push([blocks[2]]);
  for (let g3 = 0; g3 < blocks[3]; g3++) layout.push([blocks[4]]);
  for (const [dlen] of layout) {
    const dblk = dataCw.slice(offset, offset + dlen);
    offset += dlen;
    dataBlocks.push(dblk);
    ecBlocks.push(rsEncode(dblk, ecPerBlock));
  }
  const result = new Uint8Array(totalCw);
  let ri = 0;
  const maxData = Math.max(...dataBlocks.map((b3) => b3.length));
  for (let i7 = 0; i7 < maxData; i7++) {
    for (const blk of dataBlocks) if (i7 < blk.length) result[ri++] = blk[i7];
  }
  for (let i7 = 0; i7 < ecPerBlock; i7++) {
    for (const blk of ecBlocks) result[ri++] = blk[i7];
  }
  return result;
}
function buildMatrix(codewords, version, ec) {
  const size = version * 4 + 17;
  const m4 = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r6, c5, v3, isReserved = true) => {
    m4[r6][c5] = v3;
    if (isReserved) reserved[r6][c5] = true;
  };
  const placeFinder = (r6, c5) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const rr = r6 + dr;
        const cc = c5 + dc;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inRing = dr >= 0 && dr <= 6 && (dc === 0 || dc === 6) || dc >= 0 && dc <= 6 && (dr === 0 || dr === 6);
        const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        set(rr, cc, inRing || inCore ? 1 : 0);
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);
  for (let i7 = 8; i7 < size - 8; i7++) {
    const v3 = i7 % 2 === 0 ? 1 : 0;
    set(6, i7, v3);
    set(i7, 6, v3);
  }
  const aps = ALIGN_POS[version - 1];
  for (const r6 of aps) {
    for (const c5 of aps) {
      if (reserved[r6][c5]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          set(r6 + dr, c5 + dc, ring === 1 ? 0 : 1);
        }
      }
    }
  }
  set(size - 8, 8, 1);
  for (let i7 = 0; i7 < 9; i7++) {
    if (!reserved[8][i7]) reserved[8][i7] = true;
    if (!reserved[i7][8]) reserved[i7][8] = true;
  }
  for (let i7 = 0; i7 < 8; i7++) {
    reserved[8][size - 1 - i7] = true;
    reserved[size - 1 - i7][8] = true;
  }
  reserved[8][8] = true;
  reserved[8][7] = true;
  reserved[7][8] = true;
  if (version >= 7) {
    for (let i7 = 0; i7 < 6; i7++) {
      for (let j2 = 0; j2 < 3; j2++) {
        reserved[i7][size - 11 + j2] = true;
        reserved[size - 11 + j2][i7] = true;
      }
    }
  }
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  const getBit = (idx) => idx < totalBits ? codewords[idx >> 3] >> 7 - (idx & 7) & 1 : 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i7 = 0; i7 < size; i7++) {
      const row = upward ? size - 1 - i7 : i7;
      for (let k2 = 0; k2 < 2; k2++) {
        const c5 = col - k2;
        if (reserved[row][c5] || m4[row][c5] !== null) continue;
        m4[row][c5] = getBit(bitIdx);
        bitIdx++;
      }
    }
    upward = !upward;
  }
  const maskFns = [
    (r6, c5) => (r6 + c5) % 2 === 0,
    (r6) => r6 % 2 === 0,
    (_r, c5) => c5 % 3 === 0,
    (r6, c5) => (r6 + c5) % 3 === 0,
    (r6, c5) => (Math.floor(r6 / 2) + Math.floor(c5 / 3)) % 2 === 0,
    (r6, c5) => r6 * c5 % 2 + r6 * c5 % 3 === 0,
    (r6, c5) => (r6 * c5 % 2 + r6 * c5 % 3) % 2 === 0,
    (r6, c5) => ((r6 + c5) % 2 + r6 * c5 % 3) % 2 === 0
  ];
  let bestPenalty = Infinity;
  let bestMatrix = [];
  for (let mask = 0; mask < 8; mask++) {
    const grid = Array.from({ length: size }, () => new Array(size).fill(false));
    for (let r6 = 0; r6 < size; r6++) {
      for (let c5 = 0; c5 < size; c5++) {
        let v3 = m4[r6][c5] === 1;
        if (!reserved[r6][c5] && maskFns[mask](r6, c5)) v3 = !v3;
        grid[r6][c5] = v3;
      }
    }
    applyFormatAndVersion(grid, reserved, version, ec, mask);
    const penalty = scorePenalty(grid);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMatrix = grid;
    }
  }
  return bestMatrix;
}
function applyFormatAndVersion(grid, _reserved, version, ec, mask) {
  const size = grid.length;
  const fmt = FORMAT_INFO[EC_FORMAT_BITS[ec] << 3 | mask];
  for (let i7 = 0; i7 < 15; i7++) {
    const bit = (fmt >> i7 & 1) === 1;
    if (i7 < 6) grid[i7][8] = bit;
    else if (i7 === 6) grid[7][8] = bit;
    else if (i7 === 7) grid[8][8] = bit;
    else if (i7 === 8) grid[8][7] = bit;
    else grid[8][14 - i7] = bit;
    if (i7 < 8) grid[8][size - 1 - i7] = bit;
    else grid[size - 15 + i7][8] = bit;
  }
  grid[size - 8][8] = true;
  if (version >= 7) {
    const vinfo = VERSION_INFO[version - 7];
    for (let i7 = 0; i7 < 18; i7++) {
      const bit = (vinfo >> i7 & 1) === 1;
      const r6 = Math.floor(i7 / 3);
      const c5 = i7 % 3;
      grid[r6][size - 11 + c5] = bit;
      grid[size - 11 + c5][r6] = bit;
    }
  }
}
function scorePenalty(grid) {
  const n6 = grid.length;
  let penalty = 0;
  const lineRun = (get) => {
    let p4 = 0;
    let runColor = get(0);
    let runLen = 1;
    for (let i7 = 1; i7 < n6; i7++) {
      const v3 = get(i7);
      if (v3 === runColor) {
        runLen++;
      } else {
        if (runLen >= 5) p4 += 3 + (runLen - 5);
        runColor = v3;
        runLen = 1;
      }
    }
    if (runLen >= 5) p4 += 3 + (runLen - 5);
    return p4;
  };
  for (let r6 = 0; r6 < n6; r6++) penalty += lineRun((c5) => grid[r6][c5]);
  for (let c5 = 0; c5 < n6; c5++) penalty += lineRun((r6) => grid[r6][c5]);
  for (let r6 = 0; r6 < n6 - 1; r6++) {
    for (let c5 = 0; c5 < n6 - 1; c5++) {
      const v3 = grid[r6][c5];
      if (v3 === grid[r6][c5 + 1] && v3 === grid[r6 + 1][c5] && v3 === grid[r6 + 1][c5 + 1]) penalty += 3;
    }
  }
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  const matchAt = (get, start) => {
    let a3 = true;
    let b3 = true;
    for (let k22 = 0; k22 < 11; k22++) {
      const v3 = get(start + k22);
      if (v3 !== pat1[k22]) a3 = false;
      if (v3 !== pat2[k22]) b3 = false;
    }
    return a3 || b3;
  };
  for (let r6 = 0; r6 < n6; r6++) {
    for (let c5 = 0; c5 <= n6 - 11; c5++) {
      if (matchAt((i7) => grid[r6][i7], c5)) penalty += 40;
    }
  }
  for (let c5 = 0; c5 < n6; c5++) {
    for (let r6 = 0; r6 <= n6 - 11; r6++) {
      if (matchAt((i7) => grid[i7][c5], r6)) penalty += 40;
    }
  }
  let dark = 0;
  for (let r6 = 0; r6 < n6; r6++) for (let c5 = 0; c5 < n6; c5++) if (grid[r6][c5]) dark++;
  const ratio = dark * 100 / (n6 * n6);
  const k2 = Math.floor(Math.abs(ratio - 50) / 5);
  penalty += k2 * 10;
  return penalty;
}
function generateQr(value, ec) {
  const bytes = new TextEncoder().encode(value);
  for (let version = 1; version <= 40; version++) {
    const codewords = encodeData(bytes, version, ec);
    if (codewords) return buildMatrix(codewords, version, ec);
  }
  return null;
}
var OkQr = class extends i3 {
  constructor() {
    super(...arguments);
    this.value = "";
    this.ec = "M";
    this.size = 160;
    this.color = "";
    this.background = "";
    this.margin = 4;
  }
  static {
    this.styles = i`
    :host {
      /* Tokens overridables (cadena --ok-* → --ion-* → hex). */
      --module-color: var(--ok-text, var(--ion-text-color, #000000));
      --bg-color: var(--ok-surface, transparent);

      /* Inline: ocupa solo lo que necesita su tamaño. */
      display: inline-block;
      line-height: 0;
    }
    svg {
      display: block;
      width: var(--ok-qr-size, 160px);
      height: var(--ok-qr-size, 160px);
    }
    rect.qr-bg {
      fill: var(--bg-color);
    }
    path.qr-fg {
      fill: var(--module-color);
      shape-rendering: crispEdges;
    }
  `;
  }
  render() {
    if (!this.value) return b2``;
    const level = EC_ORDER.includes(this.ec) ? this.ec : "M";
    const matrix = generateQr(this.value, level);
    if (!matrix) return b2``;
    const count = matrix.length;
    const quiet = Math.max(0, Math.floor(this.margin));
    const dim = count + quiet * 2;
    let d3 = "";
    for (let r6 = 0; r6 < count; r6++) {
      for (let c5 = 0; c5 < count; c5++) {
        if (matrix[r6][c5]) {
          d3 += `M${c5 + quiet} ${r6 + quiet}h1v1h-1z`;
        }
      }
    }
    const fg = this.color || void 0;
    const bg = this.background || void 0;
    const fgStyle = fg ? `fill:${fg}` : void 0;
    const bgStyle = bg ? `fill:${bg}` : void 0;
    const body = w`
      <rect class="qr-bg" x="0" y="0" width="${dim}" height="${dim}" style="${bgStyle ?? ""}"></rect>
      <path class="qr-fg" d="${d3}" style="${fgStyle ?? ""}"></path>
    `;
    return b2`
      <svg
        style="width:${this.size}px;height:${this.size}px"
        viewBox="0 0 ${dim} ${dim}"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label=${`C\xF3digo QR: ${this.value}`}
        shape-rendering="crispEdges"
      >
        ${body}
      </svg>
    `;
  }
};
__decorateClass2([
  n4({ type: String })
], OkQr.prototype, "value");
__decorateClass2([
  n4({ type: String })
], OkQr.prototype, "ec");
__decorateClass2([
  n4({ type: Number })
], OkQr.prototype, "size");
__decorateClass2([
  n4({ type: String })
], OkQr.prototype, "color");
__decorateClass2([
  n4({ type: String })
], OkQr.prototype, "background");
__decorateClass2([
  n4({ type: Number })
], OkQr.prototype, "margin");
define("ok-qr", OkQr);

// ../../node_modules/.pnpm/@erplora+outfitkit@file+..+outfitkit/node_modules/@erplora/outfitkit/dist/ok-receipt.js
var __defProp3 = Object.defineProperty;
var __decorateClass3 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp3(target, key, result);
  return result;
};
var DEFAULT_LABELS = {
  empty: "No receipt data.",
  phone: "Tel.",
  receipt: "Receipt",
  servedBy: "Served by",
  customer: "Customer",
  item: "Item",
  amount: "Amount",
  noLines: "\u2014 No lines \u2014",
  subtotal: "Subtotal",
  total: "TOTAL",
  change: "Change"
};
var OkReceipt = class extends i3 {
  constructor() {
    super(...arguments);
    this.qrSize = 120;
    this.labels = {};
  }
  static {
    this.styles = i`
    :host {
      /* Ancho de papel térmico estándar (80mm). Overridable vía --receipt-width. */
      --w: var(--receipt-width, 80mm);
      display: block;
      width: 100%;
    }
    .paper {
      box-sizing: border-box;
      width: var(--w);
      max-width: 100%;
      margin: 0 auto;
      padding: 4mm 3mm;
      background: #fff;
      color: #000;
      /* Monospace = look de tiquet; tabular para alinear importes. */
      font-family: 'Roboto Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
      font-size: 11px;
      line-height: 1.45;
      font-variant-numeric: tabular-nums;
    }
    .center { text-align: center; }
    .biz-logo { max-width: 60%; max-height: 22mm; margin: 0 auto 2mm; display: block; }
    .biz-name { font-size: 14px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .biz-meta { font-size: 10px; }
    .sep { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
    .meta {
      display: flex; justify-content: space-between; gap: .5rem;
      font-size: 10px;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: .3mm 0; vertical-align: top; }
    thead th { font-size: 9px; text-transform: uppercase; text-align: left; border-bottom: 1px solid #000; }
    th.num, td.num { text-align: right; white-space: nowrap; }
    .line-name { word-break: break-word; }
    .line-note { font-size: 9px; padding-left: 2mm; opacity: .8; }
    .qty-price { font-size: 9px; opacity: .85; }
    .totals { width: 100%; }
    .totals td { padding: .2mm 0; }
    .totals td.num { text-align: right; white-space: nowrap; }
    .grand td { font-size: 14px; font-weight: 700; padding-top: 1mm; }
    .pay td { font-size: 10px; }
    .footer { font-size: 10px; white-space: pre-line; }
    .qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 1mm; margin-top: 2mm; }
    .qr-note { font-size: 8px; text-align: center; word-break: break-word; }
    .promo-wrap { display: flex; flex-direction: column; align-items: center; gap: 1mm; margin-top: 2mm; }
    .promo-note { font-size: 9px; text-align: center; word-break: break-word; }
    .empty { padding: 4mm; text-align: center; color: #888; font-style: italic; }
  `;
  }
  get t() {
    return { ...DEFAULT_LABELS, ...this.labels };
  }
  cur() {
    return this.receipt?.currency ?? "\u20AC";
  }
  money(n6) {
    return `${Number(n6 ?? 0).toFixed(2)} ${this.cur()}`;
  }
  render() {
    const r6 = this.receipt;
    if (!r6) return b2`<div class="paper empty">${this.t.empty}</div>`;
    return b2`<div class="paper" part="paper">
      ${this.renderHeader(r6)}
      <hr class="sep" />
      ${this.renderMeta(r6)}
      <hr class="sep" />
      ${this.renderLines(r6)}
      <hr class="sep" />
      ${this.renderTotals(r6)}
      ${r6.footer ? b2`<hr class="sep" /><div class="center footer">${r6.footer}</div>` : A}
      ${this.renderQr(r6)}
      ${this.renderPromo(r6)}
    </div>`;
  }
  renderHeader(r6) {
    const b3 = r6.business ?? { name: "" };
    return b2`<div class="center">
      ${b3.logo_url ? b2`<img class="biz-logo" src=${b3.logo_url} alt=${b3.name || "logo"} />` : b2`<slot name="logo"></slot>`}
      <div class="biz-name">${b3.name}</div>
      ${b3.address ? b2`<div class="biz-meta">${b3.address}</div>` : A}
      ${b3.tax_id ? b2`<div class="biz-meta">${b3.tax_id}</div>` : A}
      ${b3.phone ? b2`<div class="biz-meta">${this.t.phone} ${b3.phone}</div>` : A}
    </div>`;
  }
  renderMeta(r6) {
    return b2`<div class="meta">
        <span>${this.t.receipt}: <strong>${r6.number}</strong></span>
        ${r6.datetime ? b2`<span>${r6.datetime}</span>` : A}
      </div>
      ${r6.cashier || r6.customer ? b2`<div class="meta">
            ${r6.cashier ? b2`<span>${this.t.servedBy}: ${r6.cashier}</span>` : b2`<span></span>`}
            ${r6.customer ? b2`<span>${this.t.customer}: ${r6.customer}</span>` : A}
          </div>` : A}`;
  }
  renderLines(r6) {
    const lines = r6.lines ?? [];
    if (!lines.length) return b2`<div class="center biz-meta">${this.t.noLines}</div>`;
    return b2`<table>
      <thead>
        <tr><th>${this.t.item}</th><th class="num">${this.t.amount}</th></tr>
      </thead>
      <tbody>
        ${lines.map(
      (l3) => b2`<tr>
              <td class="line-name">
                <div>${l3.name}</div>
                <div class="qty-price">${l3.qty} × ${this.money(l3.unit_price)}</div>
                ${l3.note ? b2`<div class="line-note">${l3.note}</div>` : A}
              </td>
              <td class="num">${this.money(l3.total)}</td>
            </tr>`
    )}
      </tbody>
    </table>`;
  }
  renderTotals(r6) {
    const taxes = r6.taxes ?? [];
    return b2`<table class="totals">
      ${r6.subtotal != null ? b2`<tr><td>${this.t.subtotal}</td><td class="num">${this.money(r6.subtotal)}</td></tr>` : A}
      ${taxes.map(
      (t7) => b2`<tr><td>${t7.label}</td><td class="num">${this.money(t7.amount)}</td></tr>`
    )}
      <tr class="grand"><td>${this.t.total}</td><td class="num">${this.money(r6.total)}</td></tr>
      ${r6.payment ? b2`<tr class="pay"><td>${r6.payment.method}</td><td class="num">${this.money(
      r6.payment.paid ?? r6.total
    )}</td></tr>
            ${r6.payment.change != null ? b2`<tr class="pay"><td>${this.t.change}</td><td class="num">${this.money(
      r6.payment.change
    )}</td></tr>` : A}` : A}
    </table>`;
  }
  renderQr(r6) {
    if (!r6.qr) return A;
    return b2`<div class="qr-wrap">
      <ok-qr .value=${r6.qr} .size=${this.qrSize} ec="M" color="#000" background="#fff"></ok-qr>
      ${r6.qr_note ? b2`<div class="qr-note">${r6.qr_note}</div>` : A}
    </div>`;
  }
  /** QR promocional (reseñas/redes): al final del papel y más pequeño que el fiscal. */
  renderPromo(r6) {
    if (!r6.promo_qr) return A;
    return b2`<div class="promo-wrap">
      ${r6.promo_note ? b2`<div class="promo-note">${r6.promo_note}</div>` : A}
      <ok-qr .value=${r6.promo_qr} .size=${Math.round(this.qrSize * 0.7)} ec="M" color="#000" background="#fff"></ok-qr>
    </div>`;
  }
};
__decorateClass3([
  n4({ attribute: false })
], OkReceipt.prototype, "receipt");
__decorateClass3([
  n4({ type: Number, attribute: "qr-size" })
], OkReceipt.prototype, "qrSize");
__decorateClass3([
  n4({ attribute: false })
], OkReceipt.prototype, "labels");
define("ok-receipt", OkReceipt);

// ../../node_modules/.pnpm/@erplora+outfitkit@file+..+outfitkit/node_modules/@erplora/outfitkit/dist/ok-invoice.js
var __defProp4 = Object.defineProperty;
var __decorateClass4 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp4(target, key, result);
  return result;
};
var DEFAULT_LABELS2 = {
  empty: "No invoice data.",
  invoice: "Invoice",
  number: "No.",
  date: "Date",
  dueDate: "Due date",
  billTo: "Bill to",
  description: "Description",
  qty: "Qty",
  price: "Price",
  discount: "Disc.",
  tax: "Tax",
  amount: "Amount",
  noLines: "\u2014 No lines \u2014",
  taxBase: "Tax base",
  discountTotal: "Discount",
  total: "TOTAL",
  paymentMethod: "Payment method"
};
var OkInvoice = class extends i3 {
  constructor() {
    super(...arguments);
    this.qrSize = 96;
    this.labels = {};
  }
  static {
    this.styles = i`
    :host {
      --ink: var(--ok-text, var(--ion-text-color, #1c1b18));
      --muted: #6b6b6b;
      --rule: #d9d6cf;
      --accent: var(--ok-color-primary, var(--ion-color-primary, #0091ce));
      --soft: color-mix(in srgb, var(--accent) 8%, #fff);
      display: block;
      width: 100%;
    }
    .sheet {
      box-sizing: border-box;
      /* A4: ancho de papel. Overridable vía --invoice-width. */
      width: var(--invoice-width, 210mm);
      max-width: 100%;
      margin: 0 auto;
      padding: 16mm 14mm;
      background: #fff;
      color: var(--ink);
      font-family: var(--ok-font, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);
      font-size: 12px;
      line-height: 1.5;
    }
    /* Cabecera: emisor a la izquierda, bloque "FACTURA" a la derecha. */
    .top { display: flex; justify-content: space-between; gap: 2rem; align-items: flex-start; }
    .issuer-logo { max-height: 18mm; max-width: 55mm; margin-bottom: .5rem; display: block; }
    .issuer-name { font-size: 15px; font-weight: 700; }
    .issuer-meta, .party-meta { color: var(--muted); font-size: 11px; white-space: pre-line; }
    .doc { text-align: right; min-width: 48mm; }
    .doc-title { font-size: 24px; font-weight: 800; letter-spacing: .06em; color: var(--accent); text-transform: uppercase; }
    .doc-type { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
    .doc-grid { margin-top: .6rem; display: grid; grid-template-columns: auto auto; gap: .1rem .8rem; justify-content: end; font-size: 11px; }
    .doc-grid .k { color: var(--muted); text-align: right; }
    .doc-grid .v { font-weight: 600; text-align: right; }
    /* Bloque receptor. */
    .bill-to { margin: 9mm 0 6mm; padding: 3mm 4mm; background: var(--soft); border-radius: 8px; }
    .bill-to .label { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .bill-to .name { font-weight: 700; font-size: 13px; }
    /* Tabla de líneas. */
    table.lines { width: 100%; border-collapse: collapse; margin-top: 2mm; }
    table.lines thead th {
      font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted);
      text-align: left; padding: 2mm 2mm; border-bottom: 1.5px solid var(--ink);
    }
    table.lines tbody td { padding: 2mm 2mm; border-bottom: 1px solid var(--rule); vertical-align: top; }
    .num { text-align: right; white-space: nowrap; }
    .desc { width: 42%; }
    /* Resumen de totales (derecha). */
    .summary { display: flex; justify-content: flex-end; margin-top: 4mm; }
    .summary table { border-collapse: collapse; min-width: 70mm; }
    .summary td { padding: 1mm 2mm; }
    .summary td.num { text-align: right; white-space: nowrap; }
    .summary .grand td { font-size: 15px; font-weight: 800; border-top: 1.5px solid var(--ink); padding-top: 2mm; }
    .summary .grand td.num { color: var(--accent); }
    .muted { color: var(--muted); }
    /* Pie: pago, notas, QR. */
    .foot { margin-top: 8mm; display: flex; justify-content: space-between; gap: 2rem; align-items: flex-start; }
    .pay-box { font-size: 11px; }
    .pay-box .h { font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
    .qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 1mm; }
    .qr-note { font-size: 8px; max-width: 36mm; text-align: center; color: var(--muted); word-break: break-word; }
    .legal { margin-top: 8mm; padding-top: 3mm; border-top: 1px solid var(--rule); font-size: 9px; color: var(--muted); white-space: pre-line; text-align: center; }
    .empty { padding: 12mm; text-align: center; color: #999; font-style: italic; }
  `;
  }
  get t() {
    return { ...DEFAULT_LABELS2, ...this.labels };
  }
  cur() {
    return this.invoice?.currency ?? "\u20AC";
  }
  money(n6) {
    return `${Number(n6 ?? 0).toFixed(2)} ${this.cur()}`;
  }
  render() {
    const inv = this.invoice;
    if (!inv) return b2`<div class="sheet empty">${this.t.empty}</div>`;
    return b2`<div class="sheet" part="sheet">
      ${this.renderTop(inv)}
      ${this.renderBillTo(inv)}
      ${this.renderLines(inv)}
      ${this.renderSummary(inv)}
      ${this.renderFoot(inv)}
      ${inv.footer ? b2`<div class="legal">${inv.footer}</div>` : A}
    </div>`;
  }
  party(p4) {
    const loc = [p4.postal_code, p4.city].filter(Boolean).join(" ");
    const lines = [p4.address, loc, p4.country, p4.tax_id, p4.email, p4.phone].filter(Boolean);
    return b2`${lines.map((l3) => b2`<div>${l3}</div>`)}`;
  }
  renderTop(inv) {
    const iss = inv.issuer ?? { name: "" };
    return b2`<div class="top">
      <div>
        ${iss.logo_url ? b2`<img class="issuer-logo" src=${iss.logo_url} alt=${iss.name || "logo"} />` : A}
        <div class="issuer-name">${iss.name}</div>
        <div class="issuer-meta">${this.party(iss)}</div>
      </div>
      <div class="doc">
        <div class="doc-title">${this.t.invoice}</div>
        ${inv.type ? b2`<div class="doc-type">${inv.type}</div>` : A}
        <div class="doc-grid">
          <span class="k">${this.t.number}</span><span class="v">${inv.number}</span>
          <span class="k">${this.t.date}</span><span class="v">${inv.issue_date}</span>
          ${inv.due_date ? b2`<span class="k">${this.t.dueDate}</span><span class="v">${inv.due_date}</span>` : A}
        </div>
      </div>
    </div>`;
  }
  renderBillTo(inv) {
    const c5 = inv.customer;
    if (!c5) return A;
    return b2`<div class="bill-to">
      <div class="label">${this.t.billTo}</div>
      <div class="name">${c5.name}</div>
      <div class="party-meta">${this.party(c5)}</div>
    </div>`;
  }
  renderLines(inv) {
    const lines = inv.lines ?? [];
    const hasDisc = lines.some((l3) => l3.discount_percent);
    const hasTax = lines.some((l3) => l3.tax_rate != null);
    return b2`<table class="lines">
      <thead>
        <tr>
          <th class="desc">${this.t.description}</th>
          <th class="num">${this.t.qty}</th>
          <th class="num">${this.t.price}</th>
          ${hasDisc ? b2`<th class="num">${this.t.discount}</th>` : A}
          ${hasTax ? b2`<th class="num">${this.t.tax}</th>` : A}
          <th class="num">${this.t.amount}</th>
        </tr>
      </thead>
      <tbody>
        ${lines.length ? lines.map(
      (l3) => b2`<tr>
                <td class="desc">${l3.description}</td>
                <td class="num">${l3.qty}</td>
                <td class="num">${this.money(l3.unit_price)}</td>
                ${hasDisc ? b2`<td class="num">${l3.discount_percent ? `${l3.discount_percent}%` : "\u2014"}</td>` : A}
                ${hasTax ? b2`<td class="num">${l3.tax_rate != null ? `${l3.tax_rate}%` : "\u2014"}</td>` : A}
                <td class="num">${this.money(l3.total)}</td>
              </tr>`
    ) : b2`<tr><td colspan="6" class="muted" style="text-align:center;padding:6mm">${this.t.noLines}</td></tr>`}
      </tbody>
    </table>`;
  }
  renderSummary(inv) {
    const taxes = inv.taxes ?? [];
    return b2`<div class="summary">
      <table>
        <tr><td class="muted">${this.t.taxBase}</td><td class="num">${this.money(inv.subtotal)}</td></tr>
        ${inv.discount_total ? b2`<tr><td class="muted">${this.t.discountTotal}</td><td class="num">−${this.money(inv.discount_total)}</td></tr>` : A}
        ${taxes.map(
      (t7) => b2`<tr><td class="muted">${t7.label}${t7.base != null ? b2` <span class="muted">(${this.money(t7.base)})</span>` : A}</td><td class="num">${this.money(t7.amount)}</td></tr>`
    )}
        <tr class="grand"><td>${this.t.total}</td><td class="num">${this.money(inv.total)}</td></tr>
      </table>
    </div>`;
  }
  renderFoot(inv) {
    const hasPay = inv.payment_method || inv.payment_terms || inv.notes;
    if (!hasPay && !inv.qr) return A;
    return b2`<div class="foot">
      <div class="pay-box">
        ${inv.payment_method ? b2`<div class="h">${this.t.paymentMethod}</div><div>${inv.payment_method}</div>` : A}
        ${inv.payment_terms ? b2`<div style="margin-top:2mm" class="muted">${inv.payment_terms}</div>` : A}
        ${inv.notes ? b2`<div style="margin-top:3mm">${inv.notes}</div>` : A}
      </div>
      ${inv.qr ? b2`<div class="qr-wrap">
            <ok-qr .value=${inv.qr} .size=${this.qrSize} ec="M"></ok-qr>
            ${inv.qr_note ? b2`<div class="qr-note">${inv.qr_note}</div>` : A}
          </div>` : A}
    </div>`;
  }
};
__decorateClass4([
  n4({ attribute: false })
], OkInvoice.prototype, "invoice");
__decorateClass4([
  n4({ type: Number, attribute: "qr-size" })
], OkInvoice.prototype, "qrSize");
__decorateClass4([
  n4({ attribute: false })
], OkInvoice.prototype, "labels");
define("ok-invoice", OkInvoice);

// ui/lib/document-mappers.ts
function toEuros(cents) {
  return Number(cents ?? 0) / 100;
}
function formatDateTime(iso, locale = "es") {
  if (!iso) return void 0;
  const d3 = new Date(iso);
  if (Number.isNaN(d3.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d3);
}
function receiptLabels(t7) {
  return {
    empty: t7("ui.docEmpty"),
    phone: t7("ui.docPhone"),
    receipt: t7("ui.docReceipt"),
    servedBy: t7("ui.docServedBy"),
    customer: t7("ui.docCustomer"),
    item: t7("ui.docItem"),
    amount: t7("ui.docAmount"),
    noLines: t7("ui.docNoLines"),
    subtotal: t7("ui.docSubtotal"),
    total: t7("ui.docTotal"),
    change: t7("ui.docChange")
  };
}
function invoiceLabels(t7) {
  return {
    empty: t7("ui.docEmptyInvoice"),
    invoice: t7("ui.docInvoice"),
    number: t7("ui.docNumber"),
    date: t7("ui.docDate"),
    dueDate: t7("ui.docDueDate"),
    billTo: t7("ui.docBillTo"),
    description: t7("ui.docDescription"),
    qty: t7("ui.docQty"),
    price: t7("ui.docPrice"),
    discount: t7("ui.docDiscount"),
    tax: t7("ui.docTax"),
    amount: t7("ui.docAmount"),
    noLines: t7("ui.docNoLines"),
    taxBase: t7("ui.docTaxBase"),
    discountTotal: t7("ui.docDiscountTotal"),
    total: t7("ui.docTotal"),
    paymentMethod: t7("ui.docPaymentMethod")
  };
}
function lineLabel(l3) {
  return Number(l3.is_gift) ? `${l3.product_name} (Invitaci\xF3n)` : l3.product_name;
}
function parseTaxes(tax_breakdown) {
  if (!tax_breakdown) return [];
  let obj;
  try {
    obj = JSON.parse(tax_breakdown);
  } catch {
    return [];
  }
  return Object.entries(obj).map(([rate, v3]) => {
    const r6 = Number(rate);
    return {
      label: `IVA ${Number.isFinite(r6) ? r6.toFixed(0) : rate}%`,
      rate: Number.isFinite(r6) ? r6 : void 0,
      base: toEuros(v3?.base),
      amount: toEuros(v3?.tax)
    };
  }).filter((t7) => t7.amount || t7.base);
}
function resolveFormat(sale, settings) {
  const v3 = sale.document_type || settings.default_document_format || "ticket";
  return v3 === "invoice" ? "invoice" : "ticket";
}
function saleToReceipt(sale, lines, settings = {}, fiscal = {}, locale = "es") {
  const header = (settings.receipt_header || "").trim();
  return {
    business: { name: header.split("\n")[0] || "Mi negocio", address: header.split("\n").slice(1).join(" ") || void 0, tax_id: fiscal.issuer_nif || void 0 },
    number: fiscal.number || sale.sale_number,
    datetime: formatDateTime(sale.created_at, locale),
    customer: fiscal.customer_name || sale.customer_name || void 0,
    lines: lines.map((l3) => ({
      name: lineLabel(l3),
      qty: Number(l3.quantity),
      unit_price: toEuros(l3.unit_price),
      total: toEuros(l3.line_total)
    })),
    subtotal: sale.subtotal != null ? toEuros(sale.subtotal) : void 0,
    taxes: parseTaxes(sale.tax_breakdown).map((t7) => ({ label: t7.label, base: t7.base, amount: t7.amount })),
    total: toEuros(sale.total),
    payment: sale.payment_method_name ? { method: sale.payment_method_name, paid: sale.amount_tendered != null ? toEuros(sale.amount_tendered) : void 0, change: sale.change_due != null ? toEuros(sale.change_due) : void 0 } : void 0,
    currency: settings.currency || "\u20AC",
    footer: settings.receipt_footer || void 0,
    qr: fiscal.qr || void 0,
    qr_note: fiscal.qr_note || void 0,
    // QR promocional (solo tiquet; la factura A4 es formal). Sin URL no hay rastro.
    promo_qr: settings.receipt_marketing_url || void 0,
    promo_note: settings.receipt_marketing_url ? settings.receipt_marketing_text || void 0 : void 0
  };
}
function saleToInvoice(sale, lines, settings = {}, fiscal = {}, locale = "es") {
  const header = (settings.receipt_header || "").trim();
  const invLines = lines.map((l3) => ({
    description: lineLabel(l3),
    qty: Number(l3.quantity),
    unit_price: toEuros(l3.unit_price),
    discount_percent: l3.discount_percent ? Number(l3.discount_percent) : void 0,
    tax_rate: l3.tax_rate != null ? Number(l3.tax_rate) : void 0,
    total: toEuros(l3.line_total)
  }));
  const taxes = parseTaxes(sale.tax_breakdown);
  return {
    issuer: { name: header.split("\n")[0] || "Mi negocio", address: header.split("\n").slice(1).join(" ") || void 0, tax_id: fiscal.issuer_nif || void 0 },
    customer: { name: fiscal.customer_name || sale.customer_name || "Cliente", tax_id: fiscal.customer_tax_id || void 0 },
    number: fiscal.number || sale.sale_number,
    issue_date: formatDateTime(sale.created_at, locale) || "",
    lines: invLines,
    subtotal: toEuros(sale.subtotal),
    discount_total: sale.discount_amount ? toEuros(sale.discount_amount) : void 0,
    taxes: taxes.map((t7) => ({ label: t7.label, rate: t7.rate, base: t7.base, amount: t7.amount })),
    tax_total: toEuros(sale.tax_amount),
    total: toEuros(sale.total),
    currency: settings.currency || "\u20AC",
    payment_method: sale.payment_method_name || void 0,
    footer: settings.receipt_footer || void 0,
    qr: fiscal.qr || void 0,
    qr_note: fiscal.qr_note || void 0
  };
}
function orderToPrebill(lines, settings = {}, opts = {}) {
  const header = (settings.receipt_header || "").trim();
  const cents = (l3) => l3.is_gift ? 0 : Math.round(l3.price * l3.qty);
  const total = lines.reduce((s5, l3) => s5 + cents(l3), 0);
  return {
    business: {
      name: header.split("\n")[0] || "Mi negocio",
      address: header.split("\n").slice(1).join(" ") || void 0
    },
    // number/qr/payment AUSENTES a propósito: esto no es una factura (ver doc de la función).
    datetime: formatDateTime(opts.datetime ?? (/* @__PURE__ */ new Date()).toISOString(), opts.locale ?? "es"),
    customer: opts.tableLabel || void 0,
    lines: lines.map((l3) => ({
      name: l3.is_gift ? `${l3.name} (invitaci\xF3n)` : l3.name,
      qty: l3.qty,
      unit_price: toEuros(l3.price),
      total: toEuros(cents(l3))
    })),
    total: toEuros(total),
    taxes: [],
    currency: settings.currency || "\u20AC",
    // Inglés canónico (ADR-0055): la UI pasa el texto ya traducido en `opts.notice`; esto es solo
    // el respaldo para llamadas sin i18n (tests, integraciones).
    footer: opts.notice ?? "Bill \u2014 this is not an invoice. The fiscal receipt is issued on payment."
  };
}

// locales/es.json
var es_default = {
  name: "Ventas / TPV",
  navigation: {
    pos: {
      label: "Vender"
    },
    sales: {
      label: "Ventas"
    },
    settings: {
      label: "Ajustes TPV"
    }
  },
  ui: {
    sales: "Ventas",
    tickets: "Tickets",
    revenue: "Ingresos",
    avgTicket: "Ticket medio",
    colNumber: "N\xFAmero",
    colCustomer: "Cliente",
    colPayment: "Pago",
    colStatus: "Estado",
    colTotal: "Total",
    statusCompleted: "Completada",
    statusVoided: "Anulada",
    actionDocument: "Documento",
    searchSalePlaceholder: "Buscar n\xFAmero o cliente\u2026",
    loading: "Cargando\u2026",
    noSales: "A\xFAn no hay ventas.",
    saleDocument: "Documento de venta",
    close: "Cerrar",
    errorStats: "Error cargando m\xE9tricas",
    print: "Imprimir",
    qrValidateNote: "Escanea para validar la factura en la AEAT",
    docEmpty: "Sin datos de tiquet.",
    docEmptyInvoice: "Sin datos de factura.",
    docPhone: "Tel.",
    docReceipt: "Tiquet",
    docServedBy: "Atendido por",
    docCustomer: "Cliente",
    docItem: "Concepto",
    docAmount: "Importe",
    docNoLines: "\u2014 Sin l\xEDneas \u2014",
    docSubtotal: "Subtotal",
    docTotal: "TOTAL",
    docChange: "Cambio",
    docInvoice: "Factura",
    docNumber: "N\xBA",
    docDate: "Fecha",
    docDueDate: "Vencimiento",
    docBillTo: "Facturar a",
    docDescription: "Descripci\xF3n",
    docQty: "Cant.",
    docPrice: "Precio",
    docDiscount: "Dto.",
    docTax: "Impuesto",
    docTaxBase: "Base imponible",
    docDiscountTotal: "Descuento",
    docPaymentMethod: "Forma de pago",
    loadingDocument: "Cargando documento\u2026",
    noSale: "Sin venta.",
    errorDocument: "Error cargando el documento",
    document: "Documento",
    loadingSettings: "Cargando ajustes\u2026",
    settingsSaved: "Ajustes guardados.",
    errorLoadingSettings: "Error cargando ajustes",
    errorSaving: "Error guardando",
    saving: "Guardando\u2026",
    saveSettings: "Guardar ajustes",
    groupSaleScreen: "Pantalla de venta",
    defaultScreen: "Pantalla por defecto",
    defaultScreenHint: "Cu\xE1l se abre al vender",
    screenTouch: "T\xE1ctil",
    screenDesktop: "Escritorio",
    groupSaleDocument: "Documento de la venta",
    defaultFormat: "Formato por defecto",
    defaultFormatHint: "Tiquet 80mm o factura A4",
    formatTicket: "Tiquet",
    formatInvoice: "Factura",
    autoInvoiceTaxId: "Factura autom\xE1tica con NIF",
    autoInvoiceTaxIdHint: "Si el cliente tiene NIF/CIF, emitir factura A4",
    groupPaymentMethods: "M\xE9todos de pago",
    cash: "Efectivo",
    card: "Tarjeta",
    transfer: "Transferencia",
    groupSale: "Venta",
    requireCustomer: "Exigir cliente",
    requireCustomerHint: "Obliga a seleccionar cliente en cada venta",
    allowDiscounts: "Permitir descuentos",
    taxIncluded: "Precios con impuestos incluidos",
    parkedTicketsToggle: "Tiquets aparcados",
    parkedTicketsToggleHint: "Permite dejar ventas en espera",
    syncProducts: "Sincronizar productos",
    syncServices: "Sincronizar servicios",
    parkedExpiryHours: "Caducidad de tiquets aparcados (horas)",
    groupReceipt: "Tiquet (cabecera y pie)",
    receiptHeader: "Cabecera",
    receiptFooter: "Pie",
    receiptFooterImage: "Imagen de pie (URL)",
    scanPlaceholder: "Escanea c\xF3digo / escribe SKU o nombre y Enter\u2026",
    errorLoadingPos: "Error cargando el POS",
    colProduct: "Producto",
    colPrice: "Precio",
    colQty: "Cant.",
    colAmount: "Importe",
    remove: "Quitar",
    cartEmptyDesktop: "Escanea o busca un producto para empezar.",
    park: "Aparcar",
    parked: "Aparcados",
    charge: "Cobrar",
    chargeShortcut: "Cobrar (F2)",
    parkedTickets: "Tickets aparcados",
    retrieveHint: "Cobra o aparca la venta actual para recuperar un ticket.",
    retrieve: "Recuperar",
    noParkedTickets: "No hay tickets aparcados.",
    errorPark: "No se pudo aparcar el ticket",
    errorRetrieve: "No se pudo recuperar el ticket",
    tendered: "Entregado",
    change: "Cambio",
    confirmCharge: "Confirmar cobro",
    charging: "Cobrando\u2026",
    errorCharge: "Error al cobrar",
    all: "Todos",
    products: "productos",
    previous: "Anterior",
    next: "Siguiente",
    searchProductPlaceholder: "Buscar producto\u2026",
    searchAction: "Buscar",
    assign: "Asignar",
    noProducts: "Sin productos.",
    sale: "Venta",
    cartEmptyTouch: "Toca un producto para a\xF1adirlo.",
    parkCurrentSale: "Aparcar venta actual",
    closeAction: "Cerrar",
    fullscreen: "Pantalla completa",
    giftBadge: "Invitaci\xF3n",
    giftAction: "Invitar / quitar invitaci\xF3n",
    printPrebill: "Imprimir cuenta",
    prebillTitle: "Cuenta",
    prebillNotice: "Cuenta \u2014 no es una factura. El tiquet fiscal se entrega al cobrar.",
    paymentMethod: "Forma de pago",
    printReceipt: "Imprimir tiquet",
    parkedAs: "Aparcado como {number}"
  },
  widgets: {
    "sales.today": {
      title: "Ventas hoy",
      label: "Hoy"
    },
    "sales.tickets_today": {
      title: "Tickets hoy",
      label: "Tickets"
    },
    "sales.last_7_days": {
      title: "Ventas \xFAltimos 7 d\xEDas"
    },
    "sales.recent_activity": {
      title: "Actividad reciente"
    }
  }
};

// locales/en.json
var en_default = {
  name: "Sales & POS",
  navigation: {
    pos: {
      label: "Vender"
    },
    sales: {
      label: "Sales"
    },
    settings: {
      label: "POS Settings"
    }
  },
  ui: {
    sales: "Sales",
    tickets: "Tickets",
    revenue: "Revenue",
    avgTicket: "Avg. ticket",
    colNumber: "Number",
    colCustomer: "Customer",
    colPayment: "Payment",
    colStatus: "Status",
    colTotal: "Total",
    statusCompleted: "Completed",
    statusVoided: "Voided",
    actionDocument: "Document",
    searchSalePlaceholder: "Search number or customer\u2026",
    loading: "Loading\u2026",
    noSales: "No sales yet.",
    saleDocument: "Sale document",
    close: "Close",
    errorStats: "Error loading metrics",
    print: "Print",
    qrValidateNote: "Scan to validate the invoice at the AEAT",
    docEmpty: "No receipt data.",
    docEmptyInvoice: "No invoice data.",
    docPhone: "Tel.",
    docReceipt: "Receipt",
    docServedBy: "Served by",
    docCustomer: "Customer",
    docItem: "Item",
    docAmount: "Amount",
    docNoLines: "\u2014 No lines \u2014",
    docSubtotal: "Subtotal",
    docTotal: "TOTAL",
    docChange: "Change",
    docInvoice: "Invoice",
    docNumber: "No.",
    docDate: "Date",
    docDueDate: "Due date",
    docBillTo: "Bill to",
    docDescription: "Description",
    docQty: "Qty",
    docPrice: "Price",
    docDiscount: "Disc.",
    docTax: "Tax",
    docTaxBase: "Tax base",
    docDiscountTotal: "Discount",
    docPaymentMethod: "Payment method",
    loadingDocument: "Loading document\u2026",
    noSale: "No sale.",
    errorDocument: "Error loading the document",
    document: "Document",
    loadingSettings: "Loading settings\u2026",
    settingsSaved: "Settings saved.",
    errorLoadingSettings: "Error loading settings",
    errorSaving: "Error saving",
    saving: "Saving\u2026",
    saveSettings: "Save settings",
    groupSaleScreen: "Sale screen",
    defaultScreen: "Default screen",
    defaultScreenHint: "Which one opens when selling",
    screenTouch: "Touch",
    screenDesktop: "Desktop",
    groupSaleDocument: "Sale document",
    defaultFormat: "Default format",
    defaultFormatHint: "80mm receipt or A4 invoice",
    formatTicket: "Receipt",
    formatInvoice: "Invoice",
    autoInvoiceTaxId: "Automatic invoice with tax ID",
    autoInvoiceTaxIdHint: "If the customer has a tax ID, issue an A4 invoice",
    groupPaymentMethods: "Payment methods",
    cash: "Cash",
    card: "Card",
    transfer: "Transfer",
    groupSale: "Sale",
    requireCustomer: "Require customer",
    requireCustomerHint: "Forces selecting a customer on every sale",
    allowDiscounts: "Allow discounts",
    taxIncluded: "Prices include tax",
    parkedTicketsToggle: "Parked tickets",
    parkedTicketsToggleHint: "Allows leaving sales on hold",
    syncProducts: "Sync products",
    syncServices: "Sync services",
    parkedExpiryHours: "Parked ticket expiry (hours)",
    groupReceipt: "Receipt (header and footer)",
    receiptHeader: "Header",
    receiptFooter: "Footer",
    receiptFooterImage: "Footer image (URL)",
    scanPlaceholder: "Scan code / type SKU or name and Enter\u2026",
    errorLoadingPos: "Error loading the POS",
    colProduct: "Product",
    colPrice: "Price",
    colQty: "Qty",
    colAmount: "Amount",
    remove: "Remove",
    cartEmptyDesktop: "Scan or search for a product to start.",
    park: "Park",
    parked: "Parked",
    charge: "Charge",
    chargeShortcut: "Charge (F2)",
    parkedTickets: "Parked tickets",
    retrieveHint: "Charge or park the current sale to retrieve a ticket.",
    retrieve: "Retrieve",
    noParkedTickets: "No parked tickets.",
    errorPark: "Could not park the ticket",
    errorRetrieve: "Could not retrieve the ticket",
    tendered: "Tendered",
    change: "Change",
    confirmCharge: "Confirm charge",
    charging: "Charging\u2026",
    errorCharge: "Error charging",
    all: "All",
    products: "products",
    previous: "Previous",
    next: "Next",
    searchProductPlaceholder: "Search product\u2026",
    searchAction: "Search",
    assign: "Assign",
    noProducts: "No products.",
    sale: "Sale",
    cartEmptyTouch: "Tap a product to add it.",
    parkCurrentSale: "Park current sale",
    closeAction: "Close",
    fullscreen: "Fullscreen",
    giftBadge: "Gift",
    giftAction: "Comp / un-comp line",
    printPrebill: "Print bill",
    prebillTitle: "Bill",
    prebillNotice: "Bill \u2014 this is not an invoice. The fiscal receipt is issued on payment.",
    paymentMethod: "Payment method",
    printReceipt: "Print receipt",
    parkedAs: "Parked as {number}"
  }
};

// ui/components/erp-sales-document/erp-sales-document.ts
var CATALOG = { es: es_default, en: en_default };
function erplora() {
  const c5 = globalThis.erplora;
  if (!c5) throw new Error("erplora SDK no inicializado por el shell");
  return c5;
}
var ErpSalesDocument = class extends i3 {
  constructor() {
    super(...arguments);
    this.loading = false;
    this.error = "";
    this.fiscal = {};
    this.fiscalRetryDelays = [400, 900, 1800];
    this.onLocaleChange = () => this.requestUpdate();
  }
  static {
    this.styles = i`
    :host { display:block; }
    .err { color:#d9480f; }
    .muted { color:#8b897f; }
    /* Presencia de PAPEL: sombra sutil sobre el fondo gris del modal (tiquet térmico / folio A4). */
    ok-receipt::part(paper),
    ok-invoice::part(sheet) {
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 8px 24px rgba(0, 0, 0, 0.08);
      border-radius: 2px;
    }
    @media print {
      :host { background: #fff; }
      /* En papel de verdad no hay sombras. */
      ok-receipt::part(paper),
      ok-invoice::part(sheet) { box-shadow: none; }
    }
  `;
  }
  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener("erplora:locale-changed", this.onLocaleChange);
    if (!this.sale && this.saleId) await this.load();
  }
  disconnectedCallback() {
    window.removeEventListener("erplora:locale-changed", this.onLocaleChange);
    super.disconnectedCallback();
  }
  updated(changed) {
    if (changed.has("saleId") && this.saleId && !this.sale) this.load();
  }
  async load() {
    if (!this.saleId || this.loadedFor === this.saleId) return;
    this.loadedFor = this.saleId;
    this.loading = true;
    this.error = "";
    try {
      const [sale, lines, settingsRows] = await Promise.all([
        erplora().query("sales.get", { sale_id: this.saleId }),
        erplora().query("sales.lines", { sale_id: this.saleId }),
        erplora().query("sales.settings.get").catch(() => [])
      ]);
      this.sale = Array.isArray(sale) ? sale[0] : sale;
      this.lines = lines || [];
      this.settings = (Array.isArray(settingsRows) ? settingsRows[0] : settingsRows) || {};
      void this.watchFiscal(this.saleId);
    } catch (e6) {
      this.error = e6 instanceof Error ? e6.message : erplora().t(CATALOG, "ui.errorDocument");
    } finally {
      this.loading = false;
    }
  }
  /** Resuelve lo fiscal con backoff: reintenta SOLO si el módulo está instalado pero el registro
   *  aún no existe (el race del Outbox). Módulo ausente (`queryOptional` → undefined) = una consulta
   *  y en paz. Si el usuario cambió de venta, aborta. */
  async watchFiscal(saleId) {
    for (const delay of [0, ...this.fiscalRetryDelays]) {
      if (delay) await new Promise((r6) => setTimeout(r6, delay));
      if (this.saleId !== saleId || !this.isConnected) return;
      const { fiscal, retry } = await this.resolveFiscal(saleId);
      this.fiscal = fiscal;
      if (fiscal.qr || !retry) return;
    }
  }
  /** Resuelve venta → factura (`invoice.by_source`) → registro VeriFactu (`verifactu.records.by_invoice`)
   *  para obtener el QR de validación AEAT + nº fiscal oficial + CSV. Tolerante a fallos.
   *  `retry` = merece reintento (módulo presente, registro todavía no). */
  async resolveFiscal(saleId) {
    try {
      const invRows = await erplora().queryOptional(
        "invoice.by_source",
        { source_id: saleId }
      );
      if (invRows === void 0) return { fiscal: {}, retry: false };
      const invoice = Array.isArray(invRows) ? invRows[0] : invRows;
      if (!invoice?.id) return { fiscal: {}, retry: true };
      const base = {
        number: invoice.number || void 0,
        issuer_nif: invoice.issuer_nif || void 0,
        customer_name: invoice.customer_name || void 0,
        customer_tax_id: invoice.customer_tax_id || void 0
      };
      const recRows = await erplora().queryOptional(
        "verifactu.records.by_invoice",
        { invoice_id: invoice.id }
      );
      if (recRows === void 0) return { fiscal: base, retry: false };
      const rec = Array.isArray(recRows) ? recRows[0] : recRows;
      if (!rec) return { fiscal: base, retry: true };
      const csv = rec.aeat_csv || "";
      const qr = rec.qr_url || "";
      const t7 = (k2) => erplora().t(CATALOG, k2);
      return {
        fiscal: {
          ...base,
          qr: qr || void 0,
          qr_note: csv ? `CSV: ${csv}` : qr ? t7("ui.qrValidateNote") : void 0
        },
        retry: false
      };
    } catch {
      return { fiscal: {}, retry: false };
    }
  }
  /**
   * El documento como **HTML plano y autocontenido**, para imprimirlo aislado (iframe) o para
   * generar el PDF desde Rust. No se imprime el DOM de este componente: vive dentro de un
   * `ion-modal` reparentado y con shadow DOM, y el navegador acababa sacando la app entera.
   * Devuelve '' si aún no hay venta cargada.
   */
  printableHtml() {
    if (!this.sale) return "";
    const t7 = (k2) => erplora().t(CATALOG, k2);
    const doc = saleToReceipt(this.sale, this.lines || [], this.settings || {}, this.fiscal, erplora().locale);
    return receiptToPrintableHtml(doc);
  }
  render() {
    const t7 = (k2) => erplora().t(CATALOG, k2);
    if (this.loading) return b2`<p class="muted">${t7("ui.loadingDocument")}</p>`;
    if (this.error) return b2`<p class="err">${this.error}</p>`;
    if (!this.sale) return b2`<p class="muted">${t7("ui.noSale")}</p>`;
    const settings = this.settings || {};
    const lines = this.lines || [];
    const fmt = this.format || resolveFormat(this.sale, settings);
    const locale = erplora().locale;
    return fmt === "invoice" ? b2`<ok-invoice
          .invoice=${saleToInvoice(this.sale, lines, settings, this.fiscal, locale)}
          .labels=${invoiceLabels(t7)}></ok-invoice>` : b2`<ok-receipt
          .receipt=${saleToReceipt(this.sale, lines, settings, this.fiscal, locale)}
          .labels=${receiptLabels(t7)}></ok-receipt>`;
  }
};
__decorateClass([
  n4({ attribute: "sale-id" })
], ErpSalesDocument.prototype, "saleId", 2);
__decorateClass([
  n4({ attribute: false })
], ErpSalesDocument.prototype, "sale", 2);
__decorateClass([
  n4({ attribute: false })
], ErpSalesDocument.prototype, "lines", 2);
__decorateClass([
  n4({ attribute: false })
], ErpSalesDocument.prototype, "settings", 2);
__decorateClass([
  n4()
], ErpSalesDocument.prototype, "format", 2);
__decorateClass([
  r5()
], ErpSalesDocument.prototype, "loading", 2);
__decorateClass([
  r5()
], ErpSalesDocument.prototype, "error", 2);
__decorateClass([
  r5()
], ErpSalesDocument.prototype, "fiscal", 2);
__decorateClass([
  n4({ attribute: false })
], ErpSalesDocument.prototype, "fiscalRetryDelays", 2);
define("erp-sales-document", ErpSalesDocument);

// ui/lib/document-modal.ts
function renderDocumentModal({ saleId, onClose, t: t7 }) {
  return b2`<ion-modal class="doc-modal" .isOpen=${!!saleId} @ionModalDidDismiss=${onClose}>
    <style>
      ion-modal.doc-modal {
        --width: min(440px, 100vw);
        --height: min(720px, 100vh);
        --border-radius: 14px;
      }
      ion-modal.doc-modal ion-content.doc-body {
        --background: var(--ion-color-light, #f4f5f8);
      }
      ion-modal.doc-modal ion-button.doc-close {
        margin: 6px;
      }
      ion-modal.doc-modal ion-footer ion-toolbar {
        --background: var(--ion-background-color, #fff);
        padding: 4px 10px calc(4px + var(--ion-safe-area-bottom, 0px));
      }
      /* Tiquet corto → papel centrado en vertical; largo → scrollea sin recortar arriba
         (margin:auto en el hijo, no justify-content: el clásico bug de flex + overflow). */
      ion-modal.doc-modal .doc-wrap {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        box-sizing: border-box;
      }
      ion-modal.doc-modal .doc-wrap > erp-sales-document { margin: auto 0; }
      /* Las reglas de IMPRESIÓN viven en el SHELL (apps/web/src/print.css), no aquí: un style
         dentro del modal solo existe mientras ESE modal está abierto, así que imprimir la cuenta
         previa —cuyo modal no lo llevaba— sacaba la app entera. La clase doc-modal es el contrato:
         el shell imprime lo que la lleve.
         (Y NO metas backticks en comentarios dentro de una plantilla Lit: cierran el literal.) */
    </style>
    <ion-content class="doc-body">
      <ion-button class="doc-close" slot="fixed" style="top:0;right:0" fill="clear" color="medium"
        aria-label=${t7("ui.close")} @click=${onClose}>
        <ion-icon name="close" slot="icon-only"></ion-icon>
      </ion-button>
      <div class="doc-wrap ion-padding" style="padding-top:44px">
        ${saleId ? b2`<erp-sales-document .saleId=${saleId}></erp-sales-document>` : A}
      </div>
    </ion-content>
    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <!-- Solo-icono (ADR-0133): el nombre va en aria-label, nunca texto visible. A ancho
             completo igualmente: en el TPV táctil el objetivo grande manda. -->
        <ion-button class="print" expand="block" aria-label=${t7("ui.print")} @click=${() => {
    const el = document.querySelector("ion-modal.doc-modal")?.querySelector("erp-sales-document");
    const html = el?.printableHtml?.();
    const sdk = globalThis.erplora;
    if (sdk?.print) void sdk.print({ role: "receipt", documentType: "receipt", html, jobId: saleId ? `sale-${saleId}` : void 0 });
    else if (html) printHtmlInIframe(html);
    else window.print();
  }}>
          <ion-icon slot="icon-only" name="print-outline"></ion-icon>
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-modal>`;
}

// ui/lib/table-switch.ts
function decideOnTableChange(c5) {
  if (!c5.targetTableId) return c5.cartHasItems ? "park-then-clear" : "clear";
  if (!c5.cartHasItems) return "load-target";
  return c5.targetOrderId ? "park-then-load" : "assign-to-target";
}

// ui/lib/pay-icons.ts
var PAY_ICON_FALLBACK = "ellipsis-horizontal-circle-outline";
var BY_TYPE = {
  cash: "cash-outline",
  card: "card-outline",
  credit: "card-outline",
  debit: "card-outline",
  transfer: "swap-horizontal-outline",
  bank: "swap-horizontal-outline",
  mobile: "phone-portrait-outline",
  wallet: "phone-portrait-outline",
  voucher: "ticket-outline",
  gift: "gift-outline"
};
var BY_NAME = [
  [/efectiv|cash|met[áa]lico|caja/i, "cash-outline"],
  [/tarjet|card|visa|mastercard|cr[ée]dito|d[ée]bito/i, "card-outline"],
  [/bizum|m[óo]vil|mobile|wallet|apple pay|google pay/i, "phone-portrait-outline"],
  [/transfer|banc|iban/i, "swap-horizontal-outline"],
  [/vale|ticket|cheque|restaurante/i, "ticket-outline"],
  [/regalo|gift/i, "gift-outline"]
];
function payMethodIcon(type, name) {
  const t7 = (type || "").trim().toLowerCase();
  if (BY_TYPE[t7]) return BY_TYPE[t7];
  const n6 = (name || "").trim();
  if (n6) {
    for (const [re, icon] of BY_NAME) if (re.test(n6)) return icon;
  }
  return PAY_ICON_FALLBACK;
}
function needsTendered(method) {
  if (!method) return true;
  if (method.requires_change !== void 0 && method.requires_change !== null) {
    return method.requires_change === 1 || method.requires_change === true;
  }
  return (method.type || "").trim().toLowerCase() === "cash";
}
function enabledPayMethods(methods, policy = {}) {
  const allowed = (m4) => {
    const t7 = (m4.type || "").trim().toLowerCase();
    if (t7 === "cash") return policy.allow_cash !== 0;
    if (t7 === "card" || t7 === "credit" || t7 === "debit") return policy.allow_card !== 0;
    if (t7 === "transfer" || t7 === "bank") return policy.allow_transfer !== 0;
    return true;
  };
  const out = methods.filter(allowed);
  return out.length ? out : methods;
}
var PAY_ICON_NAMES = [
  .../* @__PURE__ */ new Set([...Object.values(BY_TYPE), ...BY_NAME.map(([, i7]) => i7), PAY_ICON_FALLBACK])
];
function defaultPayMethod(methods) {
  return methods.find((m4) => (m4.type || "").trim().toLowerCase() === "cash") ?? methods.find((m4) => /efectiv|cash|met[\u00e1a]lico/i.test(m4.name || "")) ?? methods[0];
}

// ../../node_modules/.pnpm/@erplora+outfitkit@file+..+outfitkit/node_modules/@erplora/outfitkit/dist/shared/icons.js
var rawAdd = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M256 112v288m144-144H112"/></svg>';
var rawAlertCircle = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="currentColor" d="M256 48C141.31 48 48 141.31 48 256s93.31 208 208 208s208-93.31 208-208S370.69 48 256 48m0 319.91a20 20 0 1 1 20-20a20 20 0 0 1-20 20m21.72-201.15l-5.74 122a16 16 0 0 1-32 0l-5.74-121.94v-.05a21.74 21.74 0 1 1 43.44 0Z"/></svg>';
var rawAlertCircleOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192s192-86 192-192Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M250.26 166.05L256 288l5.73-121.95a5.74 5.74 0 0 0-5.79-6h0a5.74 5.74 0 0 0-5.68 6"/><path fill="currentColor" d="M256 367.91a20 20 0 1 1 20-20a20 20 0 0 1-20 20"/></svg>';
var rawAppsOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><rect width="80" height="80" x="64" y="64" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="216" y="64" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="368" y="64" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="64" y="216" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="216" y="216" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="368" y="216" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="64" y="368" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="216" y="368" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/><rect width="80" height="80" x="368" y="368" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" rx="40" ry="40"/></svg>';
var rawArchiveOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M80 152v256a40.12 40.12 0 0 0 40 40h272a40.12 40.12 0 0 0 40-40V152"/><rect width="416" height="80" x="48" y="64" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" rx="28" ry="28"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="m320 304l-64 64l-64-64m64 41.89V224"/></svg>';
var rawArrowRedoOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" d="M448 256L272 88v96C103.57 184 64 304.77 64 424c48.61-62.24 91.6-96 208-96v96Z"/></svg>';
var rawArrowUndoOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" d="M240 424v-96c116.4 0 159.39 33.76 208 96c0-119.23-39.57-240-208-240V88L64 256Z"/></svg>';
var rawBackspaceOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" d="M135.19 390.14a28.8 28.8 0 0 0 21.68 9.86h246.26A29 29 0 0 0 432 371.13V140.87A29 29 0 0 0 403.13 112H156.87a28.84 28.84 0 0 0-21.67 9.84L46.33 256l88.86 134.11Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M336.67 192.33L206.66 322.34m130.01 0L206.66 192.33m130.01 0L206.66 322.34m130.01 0L206.66 192.33"/></svg>';
var rawCalendarOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><rect width="416" height="384" x="48" y="80" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" rx="48"/><circle cx="296" cy="232" r="24" fill="currentColor"/><circle cx="376" cy="232" r="24" fill="currentColor"/><circle cx="296" cy="312" r="24" fill="currentColor"/><circle cx="376" cy="312" r="24" fill="currentColor"/><circle cx="136" cy="312" r="24" fill="currentColor"/><circle cx="216" cy="312" r="24" fill="currentColor"/><circle cx="136" cy="392" r="24" fill="currentColor"/><circle cx="216" cy="392" r="24" fill="currentColor"/><circle cx="296" cy="392" r="24" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M128 48v32m256-32v32"/><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" d="M464 160H48"/></svg>';
var rawCheckmarkCircle = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="currentColor" d="M256 48C141.31 48 48 141.31 48 256s93.31 208 208 208s208-93.31 208-208S370.69 48 256 48m108.25 138.29l-134.4 160a16 16 0 0 1-12 5.71h-.27a16 16 0 0 1-11.89-5.3l-57.6-64a16 16 0 1 1 23.78-21.4l45.29 50.32l122.59-145.91a16 16 0 0 1 24.5 20.58"/></svg>';
var rawCheckmarkOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M416 128L192 384l-96-96"/></svg>';
var rawChevronBack = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="M328 112L184 256l144 144"/></svg>';
var rawChevronBackOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="M328 112L184 256l144 144"/></svg>';
var rawChevronDownOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="m112 184l144 144l144-144"/></svg>';
var rawChevronForward = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="m184 112l144 144l-144 144"/></svg>';
var rawChevronForwardOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="m184 112l144 144l-144 144"/></svg>';
var rawChevronUpOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="48" d="m112 328l144-144l144 144"/></svg>';
var rawClose = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="currentColor" d="m289.94 256l95-95A24 24 0 0 0 351 127l-95 95l-95-95a24 24 0 0 0-34 34l95 95l-95 95a24 24 0 1 0 34 34l95-95l95 95a24 24 0 0 0 34-34Z"/></svg>';
var rawCloseOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M368 368L144 144m224 0L144 368"/></svg>';
var rawCloudUploadOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M320 367.79h76c55 0 100-29.21 100-83.6s-53-81.47-96-83.6c-8.89-85.06-71-136.8-144-136.8c-69 0-113.44 45.79-128 91.2c-60 5.7-112 43.88-112 106.4s54 106.4 120 106.4h56"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="m320 255.79l-64-64l-64 64m64 192.42V207.79"/></svg>';
var rawCreateOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M384 224v184a40 40 0 0 1-40 40H104a40 40 0 0 1-40-40V168a40 40 0 0 1 40-40h167.48"/><path fill="currentColor" d="M459.94 53.25a16.06 16.06 0 0 0-23.22-.56L424.35 65a8 8 0 0 0 0 11.31l11.34 11.32a8 8 0 0 0 11.34 0l12.06-12c6.1-6.09 6.67-16.01.85-22.38M399.34 90L218.82 270.2a9 9 0 0 0-2.31 3.93L208.16 299a3.91 3.91 0 0 0 4.86 4.86l24.85-8.35a9 9 0 0 0 3.93-2.31L422 112.66a9 9 0 0 0 0-12.66l-9.95-10a9 9 0 0 0-12.71 0"/></svg>';
var rawDocumentAttachOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M208 64h66.75a32 32 0 0 1 22.62 9.37l141.26 141.26a32 32 0 0 1 9.37 22.62V432a48 48 0 0 1-48 48H192a48 48 0 0 1-48-48V304"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M288 72v120a32 32 0 0 0 32 32h120"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="32" d="M160 80v152a23.69 23.69 0 0 1-24 24c-12 0-24-9.1-24-24V88c0-30.59 16.57-56 48-56s48 24.8 48 55.38v138.75c0 43-27.82 77.87-72 77.87s-72-34.86-72-77.87V144"/></svg>';
var rawDocumentOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" d="M416 221.25V416a48 48 0 0 1-48 48H144a48 48 0 0 1-48-48V96a48 48 0 0 1 48-48h98.75a32 32 0 0 1 22.62 9.37l141.26 141.26a32 32 0 0 1 9.37 22.62Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M256 56v120a32 32 0 0 0 32 32h120"/></svg>';
var rawDocumentTextOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" d="M416 221.25V416a48 48 0 0 1-48 48H144a48 48 0 0 1-48-48V96a48 48 0 0 1 48-48h98.75a32 32 0 0 1 22.62 9.37l141.26 141.26a32 32 0 0 1 9.37 22.62Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M256 56v120a32 32 0 0 0 32 32h120m-232 80h160m-160 80h160"/></svg>';
var rawDownloadOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M336 176h40a40 40 0 0 1 40 40v208a40 40 0 0 1-40 40H136a40 40 0 0 1-40-40V216a40 40 0 0 1 40-40h40"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="m176 272l80 80l80-80M256 48v288"/></svg>';
var rawEllipsisVertical = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><circle cx="256" cy="256" r="48" fill="currentColor"/><circle cx="256" cy="416" r="48" fill="currentColor"/><circle cx="256" cy="96" r="48" fill="currentColor"/></svg>';
var rawExpandOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M432 320v112H320m101.8-10.23L304 304M80 192V80h112M90.2 90.23L208 208M320 80h112v112M421.77 90.2L304 208M192 432H80V320m10.23 101.8L208 304"/></svg>';
var rawFileTrayOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="32" d="M384 80H128c-26 0-43 14-48 40L48 272v112a48.14 48.14 0 0 0 48 48h320a48.14 48.14 0 0 0 48-48V272l-32-152c-5-27-23-40-48-40Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M48 272h144m128 0h144m-272 0a64 64 0 0 0 128 0"/></svg>';
var rawFolderOpenOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M64 192v-72a40 40 0 0 1 40-40h75.89a40 40 0 0 1 22.19 6.72l27.84 18.56a40 40 0 0 0 22.19 6.72H408a40 40 0 0 1 40 40v40"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M479.9 226.55L463.68 392a40 40 0 0 1-39.93 40H88.25a40 40 0 0 1-39.93-40L32.1 226.55A32 32 0 0 1 64 192h384.1a32 32 0 0 1 31.8 34.55"/></svg>';
var rawInformationCircle = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="currentColor" d="M256 56C145.72 56 56 145.72 56 256s89.72 200 200 200s200-89.72 200-200S366.28 56 256 56m0 82a26 26 0 1 1-26 26a26 26 0 0 1 26-26m48 226h-88a16 16 0 0 1 0-32h28v-88h-16a16 16 0 0 1 0-32h32a16 16 0 0 1 16 16v104h28a16 16 0 0 1 0 32"/></svg>';
var rawMenuOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="32" d="M80 160h352M80 256h352M80 352h352"/></svg>';
var rawNotificationsOffOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M128.51 204.59q-.37 6.15-.37 12.76C128.14 304 110 320 84.33 351.43C73.69 364.45 83 384 101.62 384H320m94.5-48.7c-18.48-23.45-30.62-47.05-30.62-118c0-79.3-40.52-107.57-73.88-121.3c-4.43-1.82-8.6-6-9.95-10.55C294.21 65.54 277.82 48 256 48s-38.2 17.55-44 37.47c-1.35 4.6-5.52 8.71-10 10.53a150 150 0 0 0-18 8.79M320 384v16a64 64 0 0 1-128 0v-16"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="32" d="M448 448L64 64"/></svg>';
var rawOpenOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M384 224v184a40 40 0 0 1-40 40H104a40 40 0 0 1-40-40V168a40 40 0 0 1 40-40h167.48M336 64h112v112M224 288L440 72"/></svg>';
var rawPlayOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" d="M112 111v290c0 17.44 17 28.52 31 20.16l247.9-148.37c12.12-7.25 12.12-26.33 0-33.58L143 90.84c-14-8.36-31 2.72-31 20.16Z"/></svg>';
var rawRemove = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M400 256H112"/></svg>';
var rawSearchOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="32" d="M221.09 64a157.09 157.09 0 1 0 157.09 157.09A157.1 157.1 0 0 0 221.09 64Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="32" d="M338.29 338.29L448 448"/></svg>';
var rawSend = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="currentColor" d="m476.59 227.05l-.16-.07L49.35 49.84A23.56 23.56 0 0 0 27.14 52A24.65 24.65 0 0 0 16 72.59v113.29a24 24 0 0 0 19.52 23.57l232.93 43.07a4 4 0 0 1 0 7.86L35.53 303.45A24 24 0 0 0 16 327v113.31A23.57 23.57 0 0 0 26.59 460a23.94 23.94 0 0 0 13.22 4a24.55 24.55 0 0 0 9.52-1.93L476.4 285.94l.19-.09a32 32 0 0 0 0-58.8"/></svg>';
var rawSwapVerticalOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M464 208L352 96L240 208m112-94.87V416M48 304l112 112l112-112m-112 94V96"/></svg>';
var rawTrashOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="m112 112l20 320c.95 18.49 14.4 32 32 32h184c17.67 0 30.87-13.51 32-32l20-320"/><path fill="currentColor" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="32" d="M80 112h352"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M192 112V72h0a23.93 23.93 0 0 1 24-24h80a23.93 23.93 0 0 1 24 24h0v40m-64 64v224m-72-224l8 224m136-224l-8 224"/></svg>';
var rawTrendingDown = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M352 368h112V256"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="m48 144l121.37 121.37a32 32 0 0 0 45.26 0l50.74-50.74a32 32 0 0 1 45.26 0L448 352"/></svg>';
var rawTrendingUp = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M352 144h112v112"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="m48 368l121.37-121.37a32 32 0 0 1 45.26 0l50.74 50.74a32 32 0 0 0 45.26 0L448 160"/></svg>';
var rawVolumeHighOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M126 192H56a8 8 0 0 0-8 8v112a8 8 0 0 0 8 8h69.65a15.93 15.93 0 0 1 10.14 3.54l91.47 74.89A8 8 0 0 0 240 392V120a8 8 0 0 0-12.74-6.43l-91.47 74.89A15 15 0 0 1 126 192m194 128c9.74-19.38 16-40.84 16-64c0-23.48-6-44.42-16-64m48 176c19.48-33.92 32-64.06 32-112s-12-77.74-32-112m48 272c30-46 48-91.43 48-160s-18-113-48-160"/></svg>';
var rawVolumeLowOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M189.65 192H120a8 8 0 0 0-8 8v112a8 8 0 0 0 8 8h69.65a16 16 0 0 1 10.14 3.63l91.47 75a8 8 0 0 0 12.74-6.46V119.83a8 8 0 0 0-12.74-6.44l-91.47 75a16 16 0 0 1-10.14 3.61M384 320c9.74-19.41 16-40.81 16-64c0-23.51-6-44.4-16-64"/></svg>';
var rawVolumeMuteOutline = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-miterlimit="10" stroke-width="32" d="M416 432L64 80"/><path fill="currentColor" d="M224 136.92v33.8a4 4 0 0 0 1.17 2.82l24 24a4 4 0 0 0 6.83-2.82v-74.15a24.53 24.53 0 0 0-12.67-21.72a23.91 23.91 0 0 0-25.55 1.83a8 8 0 0 0-.66.51l-31.94 26.15a4 4 0 0 0-.29 5.92l17.05 17.06a4 4 0 0 0 5.37.26Zm0 238.16l-78.07-63.92a32 32 0 0 0-20.28-7.16H64v-96h50.72a4 4 0 0 0 2.82-6.83l-24-24a4 4 0 0 0-2.82-1.17H56a24 24 0 0 0-24 24v112a24 24 0 0 0 24 24h69.76l91.36 74.8a8 8 0 0 0 .66.51a23.93 23.93 0 0 0 25.85 1.69A24.49 24.49 0 0 0 256 391.45v-50.17a4 4 0 0 0-1.17-2.82l-24-24a4 4 0 0 0-6.83 2.82ZM352 256c0-24.56-5.81-47.88-17.75-71.27a16 16 0 0 0-28.5 14.54C315.34 218.06 320 236.62 320 256q0 4-.31 8.13a8 8 0 0 0 2.32 6.25l19.66 19.67a4 4 0 0 0 6.75-2A147 147 0 0 0 352 256m64 0c0-51.19-13.08-83.89-34.18-120.06a16 16 0 0 0-27.64 16.12C373.07 184.44 384 211.83 384 256c0 23.83-3.29 42.88-9.37 60.65a8 8 0 0 0 1.9 8.26l16.77 16.76a4 4 0 0 0 6.52-1.27C410.09 315.88 416 289.91 416 256"/><path fill="currentColor" d="M480 256c0-74.26-20.19-121.11-50.51-168.61a16 16 0 1 0-27 17.22C429.82 147.38 448 189.5 448 256c0 47.45-8.9 82.12-23.59 113a4 4 0 0 0 .77 4.55L443 391.39a4 4 0 0 0 6.4-1C470.88 348.22 480 307 480 256"/></svg>';
var rawWarning = '<svg viewBox="0 0 512 512" width="1.2em" height="1.2em" ><path fill="currentColor" d="M449.07 399.08L278.64 82.58c-12.08-22.44-44.26-22.44-56.35 0L51.87 399.08A32 32 0 0 0 80 446.25h340.89a32 32 0 0 0 28.18-47.17m-198.6-1.83a20 20 0 1 1 20-20a20 20 0 0 1-20 20m21.72-201.15l-5.74 122a16 16 0 0 1-32 0l-5.74-121.95a21.73 21.73 0 0 1 21.5-22.69h.21a21.74 21.74 0 0 1 21.73 22.7Z"/></svg>';
function bake(svg) {
  return `data:image/svg+xml;utf8,${svg}`;
}
var iconAdd = bake(rawAdd);
var iconAlertCircle = bake(rawAlertCircle);
var iconAlertCircleOutline = bake(rawAlertCircleOutline);
var iconAppsOutline = bake(rawAppsOutline);
var iconArchiveOutline = bake(rawArchiveOutline);
var iconArrowRedoOutline = bake(rawArrowRedoOutline);
var iconArrowUndoOutline = bake(rawArrowUndoOutline);
var iconBackspaceOutline = bake(rawBackspaceOutline);
var iconCalendarOutline = bake(rawCalendarOutline);
var iconCheckmarkCircle = bake(rawCheckmarkCircle);
var iconCheckmarkOutline = bake(rawCheckmarkOutline);
var iconChevronBack = bake(rawChevronBack);
var iconChevronBackOutline = bake(rawChevronBackOutline);
var iconChevronDownOutline = bake(rawChevronDownOutline);
var iconChevronForward = bake(rawChevronForward);
var iconChevronForwardOutline = bake(rawChevronForwardOutline);
var iconChevronUpOutline = bake(rawChevronUpOutline);
var iconClose = bake(rawClose);
var iconCloseOutline = bake(rawCloseOutline);
var iconCloudUploadOutline = bake(rawCloudUploadOutline);
var iconCreateOutline = bake(rawCreateOutline);
var iconDocumentAttachOutline = bake(rawDocumentAttachOutline);
var iconDocumentOutline = bake(rawDocumentOutline);
var iconDocumentTextOutline = bake(rawDocumentTextOutline);
var iconDownloadOutline = bake(rawDownloadOutline);
var iconEllipsisVertical = bake(rawEllipsisVertical);
var iconExpandOutline = bake(rawExpandOutline);
var iconFileTrayOutline = bake(rawFileTrayOutline);
var iconFolderOpenOutline = bake(rawFolderOpenOutline);
var iconInformationCircle = bake(rawInformationCircle);
var iconMenuOutline = bake(rawMenuOutline);
var iconNotificationsOffOutline = bake(rawNotificationsOffOutline);
var iconOpenOutline = bake(rawOpenOutline);
var iconPlayOutline = bake(rawPlayOutline);
var iconRemove = bake(rawRemove);
var iconSearchOutline = bake(rawSearchOutline);
var iconSend = bake(rawSend);
var iconSwapVerticalOutline = bake(rawSwapVerticalOutline);
var iconTrashOutline = bake(rawTrashOutline);
var iconTrendingDown = bake(rawTrendingDown);
var iconTrendingUp = bake(rawTrendingUp);
var iconVolumeHighOutline = bake(rawVolumeHighOutline);
var iconVolumeLowOutline = bake(rawVolumeLowOutline);
var iconVolumeMuteOutline = bake(rawVolumeMuteOutline);
var iconWarning = bake(rawWarning);
var BY_NAME2 = {
  "add": iconAdd,
  "alert-circle": iconAlertCircle,
  "alert-circle-outline": iconAlertCircleOutline,
  "apps-outline": iconAppsOutline,
  "archive-outline": iconArchiveOutline,
  "arrow-redo-outline": iconArrowRedoOutline,
  "arrow-undo-outline": iconArrowUndoOutline,
  "backspace-outline": iconBackspaceOutline,
  "calendar-outline": iconCalendarOutline,
  "checkmark-circle": iconCheckmarkCircle,
  "checkmark-outline": iconCheckmarkOutline,
  "chevron-back": iconChevronBack,
  "chevron-back-outline": iconChevronBackOutline,
  "chevron-down-outline": iconChevronDownOutline,
  "chevron-forward": iconChevronForward,
  "chevron-forward-outline": iconChevronForwardOutline,
  "chevron-up-outline": iconChevronUpOutline,
  "close": iconClose,
  "close-outline": iconCloseOutline,
  "cloud-upload-outline": iconCloudUploadOutline,
  "create-outline": iconCreateOutline,
  "document-attach-outline": iconDocumentAttachOutline,
  "document-outline": iconDocumentOutline,
  "document-text-outline": iconDocumentTextOutline,
  "download-outline": iconDownloadOutline,
  "ellipsis-vertical": iconEllipsisVertical,
  "expand-outline": iconExpandOutline,
  "file-tray-outline": iconFileTrayOutline,
  "folder-open-outline": iconFolderOpenOutline,
  "information-circle": iconInformationCircle,
  "menu-outline": iconMenuOutline,
  "notifications-off-outline": iconNotificationsOffOutline,
  "open-outline": iconOpenOutline,
  "play-outline": iconPlayOutline,
  "remove": iconRemove,
  "search-outline": iconSearchOutline,
  "send": iconSend,
  "swap-vertical-outline": iconSwapVerticalOutline,
  "trash-outline": iconTrashOutline,
  "trending-down": iconTrendingDown,
  "trending-up": iconTrendingUp,
  "volume-high-outline": iconVolumeHighOutline,
  "volume-low-outline": iconVolumeLowOutline,
  "volume-mute-outline": iconVolumeMuteOutline,
  "warning": iconWarning
};
function okIcon(value) {
  if (!value) return void 0;
  const trimmed = value.trimStart();
  if (trimmed.startsWith("<svg")) return bake(trimmed);
  return BY_NAME2[value] ?? value;
}

// ../../node_modules/.pnpm/@erplora+outfitkit@file+..+outfitkit/node_modules/@erplora/outfitkit/dist/ok-qty-stepper.js
var __defProp5 = Object.defineProperty;
var __decorateClass5 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp5(target, key, result);
  return result;
};
var DEFAULT_LABELS3 = {
  decrement: "Decrease",
  increment: "Increase"
};
var OkQtyStepper = class extends i3 {
  constructor() {
    super(...arguments);
    this.value = 0;
    this.min = 0;
    this.step = 1;
    this.disabled = false;
    this.labels = {};
  }
  static {
    this.styles = i`
    :host {
      /* Vars overridable (estilo Ionic), default = cadena --ok-* -> --ion-* -> hex */
      --color: var(--ok-text, var(--ion-text-color, #1c1b17));
      --field-bg: var(--ok-surface, var(--ion-background-color, #ffffff));
      --border-color: var(--ok-border, rgba(var(--ion-text-color-rgb, 28, 27, 23), 0.18));
      --border-radius: var(--ok-radius, 8px);
      --field-width: var(--ok-qty-field-width, 3.2rem);
      --font: var(--ok-font, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);

      /* Inline: ocupa solo lo necesario, alineado con texto circundante. */
      display: inline-flex;
      vertical-align: middle;
      color: var(--color);
      font-family: var(--font);
    }
    :host([disabled]) {
      opacity: 0.5;
      pointer-events: none;
    }

    .wrap {
      display: inline-flex;
      align-items: stretch;
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius);
      overflow: hidden;
      background: var(--field-bg);
    }

    /* Botones -/+ : ion-button compactos y sin margen, encajados en la caja. */
    ion-button {
      --padding-start: 0;
      --padding-end: 0;
      --border-radius: 0;
      --box-shadow: none;
      margin: 0;
      height: auto;
      min-width: 2.1rem;
    }
    ion-button ion-icon {
      font-size: 1.1rem;
    }

    /* Campo central editable: numérico, centrado, sin spinners nativos. */
    .field {
      width: var(--field-width);
      min-width: 0;
      text-align: center;
      border: 0;
      border-left: 1px solid var(--border-color);
      border-right: 1px solid var(--border-color);
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 0.95rem;
      padding: 0.25rem 0.2rem;
      -moz-appearance: textfield;
      appearance: textfield;
    }
    .field::-webkit-outer-spin-button,
    .field::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .field:focus {
      outline: none;
    }
    .field:disabled {
      background: transparent;
    }
  `;
  }
  // Textos efectivos: defaults en inglés + overrides del consumidor.
  get t() {
    return { ...DEFAULT_LABELS3, ...this.labels };
  }
  // Recorta `n` al rango [min, max] respetando los límites definidos.
  clamp(n6) {
    let v3 = n6;
    if (typeof this.min === "number" && v3 < this.min) v3 = this.min;
    if (typeof this.max === "number" && v3 > this.max) v3 = this.max;
    return v3;
  }
  // Aplica un nuevo valor (con clamp) y emite `ok-change` si cambió.
  commit(next) {
    const clamped = this.clamp(next);
    if (clamped === this.value) {
      this.requestUpdate();
      return;
    }
    this.value = clamped;
    this.dispatchEvent(
      new CustomEvent("ok-change", {
        detail: { value: clamped },
        bubbles: true,
        composed: true
      })
    );
  }
  decrement() {
    if (this.disabled) return;
    this.commit(this.value - this.step);
  }
  increment() {
    if (this.disabled) return;
    this.commit(this.value + this.step);
  }
  // Valida la edición manual: parsea, ignora no-números y hace clamp.
  onInput(e6) {
    const raw = e6.target.value;
    const parsed = Number(raw);
    if (raw === "" || Number.isNaN(parsed)) return;
    this.commit(parsed);
  }
  // Al salir del campo, normaliza el texto al valor válido actual.
  onBlur(e6) {
    const input = e6.target;
    const parsed = Number(input.value);
    if (input.value === "" || Number.isNaN(parsed)) {
      input.value = String(this.value);
    } else {
      this.commit(parsed);
      input.value = String(this.value);
    }
  }
  render() {
    const atMin = typeof this.min === "number" && this.value <= this.min;
    const atMax = typeof this.max === "number" && this.value >= this.max;
    return b2`<div class="wrap">
      <ion-button
        fill="clear"
        size="small"
        aria-label=${this.t.decrement}
        ?disabled=${this.disabled || atMin}
        @click=${() => this.decrement()}
      >
        <ion-icon slot="icon-only" .icon=${iconRemove}></ion-icon>
      </ion-button>
      <input
        class="field"
        type="number"
        inputmode="numeric"
        .value=${String(this.value)}
        min=${this.min}
        max=${this.max ?? ""}
        step=${this.step}
        ?disabled=${this.disabled}
        @input=${(e6) => this.onInput(e6)}
        @change=${(e6) => this.onBlur(e6)}
        @blur=${(e6) => this.onBlur(e6)}
      />
      <ion-button
        fill="clear"
        size="small"
        aria-label=${this.t.increment}
        ?disabled=${this.disabled || atMax}
        @click=${() => this.increment()}
      >
        <ion-icon slot="icon-only" .icon=${iconAdd}></ion-icon>
      </ion-button>
    </div>`;
  }
};
__decorateClass5([
  n4({ type: Number })
], OkQtyStepper.prototype, "value");
__decorateClass5([
  n4({ type: Number })
], OkQtyStepper.prototype, "min");
__decorateClass5([
  n4({ type: Number })
], OkQtyStepper.prototype, "max");
__decorateClass5([
  n4({ type: Number })
], OkQtyStepper.prototype, "step");
__decorateClass5([
  n4({ type: Boolean, reflect: true })
], OkQtyStepper.prototype, "disabled");
__decorateClass5([
  n4({ attribute: false })
], OkQtyStepper.prototype, "labels");
define("ok-qty-stepper", OkQtyStepper);

// ../../node_modules/.pnpm/@erplora+outfitkit@file+..+outfitkit/node_modules/@erplora/outfitkit/dist/ok-spotlight-search.js
var __defProp6 = Object.defineProperty;
var __decorateClass6 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp6(target, key, result);
  return result;
};
var OkSpotlightSearch = class extends i3 {
  constructor() {
    super(...arguments);
    this.open = false;
    this.placeholder = "";
    this.value = "";
    this.triggerIcon = "";
    this.triggerLabel = "";
  }
  static {
    this.styles = i`
    :host {
      --color: var(--ok-text, var(--ion-text-color, #1c1b17));
      --color-muted: var(--ok-text-muted, rgba(var(--ion-text-color-rgb, 28, 27, 23), 0.6));
      --panel-bg: var(--ok-surface, var(--ion-background-color, #ffffff));
      --scrim-bg: var(--ok-scrim, rgba(0, 0, 0, 0.28));
      --border-soft: var(--ok-border-soft, rgba(var(--ion-text-color-rgb, 28, 27, 23), 0.1));
      --radius: var(--ok-radius, 16px);
      --shadow: var(--ok-shadow, 0 24px 80px rgba(0, 0, 0, 0.35));
      --font: var(--ok-font, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);
      display: contents;
    }

    /* Botón-trigger opcional (icon-only). */
    button.trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.4rem;
      height: 2.4rem;
      padding: 0;
      border: 0;
      border-radius: 10px;
      background: none;
      color: var(--color-muted);
      cursor: pointer;
    }
    button.trigger[data-assigned] { color: var(--ok-primary, var(--ion-color-primary, #3880ff)); }
    button.trigger ion-icon { font-size: 1.35rem; }

    /* El <dialog> flota arriba-centro, translúcido con blur (Spotlight). El top layer lo saca de
       cualquier containing block. */
    dialog {
      margin: 10vh auto auto;
      width: min(92vw, 36rem);
      max-height: 72vh;
      padding: 0;
      border: none;
      border-radius: var(--radius);
      overflow: hidden;
      color: var(--color);
      font-family: var(--font);
      background: color-mix(in srgb, var(--panel-bg) 80%, transparent);
      -webkit-backdrop-filter: blur(22px) saturate(180%);
      backdrop-filter: blur(22px) saturate(180%);
      box-shadow: var(--shadow), 0 0 0 1px rgba(128, 128, 128, 0.18);
    }
    dialog::backdrop {
      background: var(--scrim-bg);
      -webkit-backdrop-filter: blur(3px);
      backdrop-filter: blur(3px);
    }

    /* Fila del input hero + cierre. */
    .top {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.7rem 0.85rem;
      border-bottom: 1px solid var(--border-soft);
    }
    .top .lupa { flex: 0 0 auto; font-size: 1.25rem; color: var(--color-muted); }
    .top input {
      flex: 1 1 auto;
      min-width: 0;
      border: 0;
      outline: none;
      background: none;
      color: inherit;
      font: inherit;
      font-size: 1.05rem;
    }
    .top input::placeholder { color: var(--color-muted); }
    .top .close {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      padding: 0;
      border: 0;
      border-radius: 8px;
      background: none;
      color: var(--color-muted);
      cursor: pointer;
    }
    .top .close ion-icon { font-size: 1.2rem; }

    /* Cuerpo scrollable: aquí caen los resultados del consumidor (slot por defecto). */
    .results { max-height: 56vh; overflow-y: auto; padding: 0.35rem; }
    .footer:not(:empty) { border-top: 1px solid var(--border-soft); padding: 0.3rem 0.6rem; }

    @media (max-width: 560px) {
      dialog { margin: 0 auto auto; width: 100vw; max-width: 100vw; max-height: 100vh; height: auto; border-radius: 0; }
    }
  `;
  }
  // ── API pública ──────────────────────────────────────────────────────────
  openSearch() {
    if (this.open) return;
    this.open = true;
    this.emitOpen(true);
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.emitOpen(false);
  }
  toggle() {
    this.open ? this.close() : this.openSearch();
  }
  emitOpen(open) {
    this.dispatchEvent(new CustomEvent("ok-open", { detail: { open }, bubbles: true, composed: true }));
  }
  onInput(e6) {
    this.value = e6.target.value;
    this.dispatchEvent(new CustomEvent("ok-input", { detail: { value: this.value }, bubbles: true, composed: true }));
  }
  // Sincroniza `open` ↔ el <dialog> nativo (top layer). try/catch porque happy-dom (tests) no
  // implementa showModal/close; ahí `open` sigue siendo la verdad.
  updated() {
    const d3 = this.renderRoot.querySelector("dialog");
    if (!d3) return;
    try {
      if (this.open && !d3.open) {
        d3.showModal();
        this.input?.focus();
      } else if (!this.open && d3.open) {
        d3.close();
      }
    } catch {
    }
  }
  render() {
    return b2`
      ${this.triggerIcon ? b2`<button class="trigger" ?data-assigned=${this.open} aria-label=${this.triggerLabel || this.placeholder}
            title=${this.triggerLabel || this.placeholder} @click=${() => this.openSearch()}>
            <ion-icon .icon=${okIcon(this.triggerIcon)}></ion-icon>
          </button>` : A}

      <dialog aria-label=${this.triggerLabel || this.placeholder}
        @close=${() => {
      if (this.open) {
        this.open = false;
        this.emitOpen(false);
      }
    }}
        @click=${(e6) => {
      if (e6.target === e6.currentTarget) this.close();
    }}>
        <div class="top">
          <ion-icon class="lupa" .icon=${iconSearchOutline}></ion-icon>
          <input type="text" .value=${this.value} placeholder=${this.placeholder}
            aria-label=${this.placeholder} autocomplete="off" spellcheck="false"
            @input=${(e6) => this.onInput(e6)} />
          <button class="close" aria-label="Cerrar" @click=${() => this.close()}>
            <ion-icon .icon=${iconCloseOutline}></ion-icon>
          </button>
        </div>
        <div class="results"><slot></slot></div>
        <div class="footer"><slot name="footer"></slot></div>
      </dialog>
    `;
  }
};
__decorateClass6([
  n4({ type: Boolean, reflect: true })
], OkSpotlightSearch.prototype, "open");
__decorateClass6([
  n4()
], OkSpotlightSearch.prototype, "placeholder");
__decorateClass6([
  n4()
], OkSpotlightSearch.prototype, "value");
__decorateClass6([
  n4({ attribute: "trigger-icon" })
], OkSpotlightSearch.prototype, "triggerIcon");
__decorateClass6([
  n4({ attribute: "trigger-label" })
], OkSpotlightSearch.prototype, "triggerLabel");
__decorateClass6([
  e4(".top input")
], OkSpotlightSearch.prototype, "input");
define("ok-spotlight-search", OkSpotlightSearch);

// ui/lib/pos-cart.ts
function rows(r6) {
  if (Array.isArray(r6)) return r6;
  if (r6 && typeof r6 === "object" && Array.isArray(r6.rows)) return r6.rows;
  return [];
}
function parseCartLines(cartData) {
  try {
    const parsed = typeof cartData === "string" ? JSON.parse(cartData) : cartData;
    const lines = Array.isArray(parsed) ? parsed : parsed?.lines;
    if (!Array.isArray(lines)) return [];
    return lines.filter((l3) => !!l3 && typeof l3 === "object").map((l3) => ({
      id: String(l3.id ?? ""),
      name: String(l3.name ?? ""),
      sku: l3.sku ? String(l3.sku) : void 0,
      price: Number(l3.price) || 0,
      qty: Math.max(1, Number(l3.qty) || 1),
      // Preserva la categoría fiscal del producto en el round-trip de persistencia/aparcado:
      // es lo que el servidor usa para resolver el % por país+categoría (ADR-0085). El % es preview.
      tax_category_key: l3.tax_category_key != null && String(l3.tax_category_key) !== "" ? String(l3.tax_category_key) : void 0,
      tax_rate: l3.tax_rate != null && Number.isFinite(Number(l3.tax_rate)) ? Number(l3.tax_rate) : void 0,
      cost: l3.cost != null && Number.isFinite(Number(l3.cost)) ? Number(l3.cost) : void 0,
      is_gift: l3.is_gift === true || l3.is_gift === 1 ? true : void 0,
      gift_reason: l3.gift_reason ? String(l3.gift_reason) : void 0
    })).filter((l3) => l3.id && l3.name);
  } catch {
    return [];
  }
}
function sameCartLine(a3, b3) {
  return a3.id === b3.id && a3.price === b3.price && a3.sku === b3.sku && a3.tax_category_key === b3.tax_category_key && a3.tax_rate === b3.tax_rate && !!a3.is_gift === !!b3.is_gift && a3.gift_reason === b3.gift_reason;
}
function mergeCartLines(base, incoming) {
  const out = base.map((l3) => ({ ...l3 }));
  for (const inc of incoming) {
    const match = out.find((l3) => sameCartLine(l3, inc));
    if (match) match.qty += inc.qty;
    else out.push({ ...inc });
  }
  return out;
}
async function loadActiveCart(client, tableId) {
  try {
    const r6 = rows(await client.query("sales.cart.get", { table_id: tableId ?? "" }));
    return r6.length ? parseCartLines(r6[0].cart_data) : [];
  } catch {
    return [];
  }
}
async function persistActiveCart(client, cart, tableId) {
  try {
    if (cart.length) {
      await client.command("sales.cart.save", { cart_data: JSON.stringify({ lines: cart }), table_id: tableId ?? "" });
    } else {
      await client.command("sales.cart.clear", { table_id: tableId ?? "" });
    }
  } catch {
  }
}
async function listParkedTickets(client) {
  try {
    return rows(await client.query("sales.parked_tickets"));
  } catch {
    return [];
  }
}
async function parkCart(client, cart, notes = "") {
  if (!cart.length) return null;
  const d3 = /* @__PURE__ */ new Date();
  const pad = (n6) => String(n6).padStart(2, "0");
  const ticketNumber = `P-${pad(d3.getHours())}${pad(d3.getMinutes())}${pad(d3.getSeconds())}`;
  try {
    await client.command("sales.park_ticket", {
      ticket_number: ticketNumber,
      cart_data: JSON.stringify({ lines: cart }),
      notes
    });
    return ticketNumber;
  } catch {
    return null;
  }
}
async function retrieveParkedTicket(client, ticket) {
  const lines = parseCartLines(ticket.cart_data);
  await client.command("sales.retrieve_ticket", { ticket_id: ticket.id });
  return lines;
}
function firstNewId(res) {
  const ids = res?.new_ids;
  return Array.isArray(ids) && typeof ids[0] === "string" ? ids[0] : "";
}
function provisionalLineTotal(unitPrice, qty, isGift) {
  return isGift ? 0 : Math.round(unitPrice * qty);
}
function toItemPayload(l3) {
  return {
    product_id: l3.id || null,
    product_name: l3.name,
    product_sku: l3.sku ?? "",
    price: l3.price,
    quantity: l3.qty,
    is_gift: !!l3.is_gift,
    gift_reason: l3.gift_reason ?? "",
    tax_category_key: l3.tax_category_key ?? "",
    cost: l3.cost ?? 0
  };
}
async function openOrderWithLines(client, lines) {
  const res = await client.command("sales.order.open", { items: lines.map(toItemPayload) });
  return firstNewId(res);
}
async function addOrderLine(client, orderId, l3) {
  const res = await client.command("sales.order.add_line", {
    order_id: orderId,
    product_id: l3.id || null,
    product_name: l3.name,
    product_sku: l3.sku ?? "",
    quantity: l3.qty,
    unit_price: l3.price,
    is_gift: !!l3.is_gift,
    gift_reason: l3.gift_reason ?? "",
    tax_category_key: l3.tax_category_key ?? "",
    cost: l3.cost ?? 0,
    line_total: provisionalLineTotal(l3.price, l3.qty, l3.is_gift)
  });
  return firstNewId(res);
}
async function updateOrderLineQty(client, orderId, lineId, qty, unitPrice, isGift, giftReason) {
  await client.command("sales.order.update_line", {
    order_id: orderId,
    line_id: lineId,
    quantity: qty,
    line_total: provisionalLineTotal(unitPrice, qty, isGift),
    // Alternar invitación cambia el importe: viaja junto para que la fila quede coherente.
    is_gift: isGift === void 0 ? null : isGift ? 1 : 0,
    gift_reason: giftReason ?? null
  });
}
async function removeOrderLine(client, orderId, lineId) {
  await client.command("sales.order.remove_line", { order_id: orderId, line_id: lineId });
}
async function loadOrderLines(client, orderId) {
  try {
    const r6 = rows(await client.query("sales.order.lines", { order_id: orderId }));
    return r6.map((x2) => ({
      line_id: String(x2.id ?? ""),
      id: String(x2.product_id ?? ""),
      name: String(x2.product_name ?? ""),
      sku: x2.product_sku ? String(x2.product_sku) : void 0,
      price: Number(x2.unit_price) || 0,
      qty: Number(x2.quantity) || 1,
      is_gift: x2.is_gift === 1 || x2.is_gift === true ? true : void 0,
      gift_reason: x2.gift_reason ? String(x2.gift_reason) : void 0,
      // Autoridad del IVA en servidor (ADR-0085) y coste para el arqueo de invitaciones: se
      // recuperan para que un pedido REANUDADO cobre con el mismo IVA que si no se hubiera recargado.
      tax_category_key: x2.tax_category_key ? String(x2.tax_category_key) : void 0,
      cost: Number(x2.cost) || void 0
    }));
  } catch {
    return [];
  }
}
async function findOpenOrder(client) {
  try {
    const r6 = rows(await client.query("sales.orders.list"));
    return r6.find((o7) => o7.status === "open")?.id ?? "";
  } catch {
    return "";
  }
}
async function mergeOrders(client, fromOrderId, toOrderId) {
  if (!fromOrderId || !toOrderId || fromOrderId === toOrderId) return;
  const lines = await loadOrderLines(client, fromOrderId);
  for (const l3 of lines) {
    await addOrderLine(client, toOrderId, l3);
  }
  await client.command("sales.order.void", { order_id: fromOrderId });
}

// ui/lib/pos-tax.ts
function isRoot(r6) {
  return r6.parent_id == null || String(r6.parent_id) === "";
}
async function buildCategoryRatesMap(client) {
  const map = /* @__PURE__ */ new Map();
  try {
    const all = await client.queryAll("taxes.rules.list");
    const rootByCat = /* @__PURE__ */ new Map();
    for (const r6 of all) {
      if (!r6 || !r6.tax_category_key || !isRoot(r6)) continue;
      const cat = String(r6.tax_category_key);
      const cur = rootByCat.get(cat);
      if (!cur || String(r6.valid_from ?? "") > String(cur.valid_from ?? "")) rootByCat.set(cat, r6);
    }
    for (const [cat, root] of rootByCat) {
      let pct = Number(root.rate_pct) || 0;
      for (const r6 of all) {
        if (r6 && String(r6.parent_id ?? "") === String(root.id ?? "__none__") && root.id != null) {
          pct += Number(r6.rate_pct) || 0;
        }
      }
      map.set(cat, pct);
    }
  } catch {
  }
  return map;
}
function resolveLineTax(catRatesMap, taxCategoryKey) {
  if (!taxCategoryKey) return 0;
  return catRatesMap.get(String(taxCategoryKey)) ?? 0;
}

// ui/components/erp-pos-touch/erp-pos-touch.ts
var CATALOG2 = { es: es_default, en: en_default };
function erplora2() {
  const c5 = globalThis.erplora;
  if (!c5) throw new Error("erplora SDK no inicializado por el shell");
  return c5;
}
function t3(key, params) {
  return erplora2().t(CATALOG2, key, params);
}
function rows2(r6) {
  if (Array.isArray(r6)) return r6;
  if (r6 && typeof r6 === "object" && Array.isArray(r6.rows)) return r6.rows;
  return [];
}
function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "\xB7";
}
function gradient(s5) {
  let h4 = 0;
  for (let i7 = 0; i7 < s5.length; i7++) h4 = (h4 * 31 + s5.charCodeAt(i7)) % 360;
  const h22 = (h4 + 38) % 360;
  return `linear-gradient(135deg, hsl(${h4} 42% 38%), hsl(${h22} 44% 26%))`;
}
var ErpPosTouch = class extends i3 {
  constructor() {
    super(...arguments);
    this.products = [];
    this.categories = [];
    this.activeCat = "";
    this.q = "";
    this.cart = [];
    this.methods = [];
    this.settings = {};
    this.paying = false;
    this.tendered = "";
    this.docFormat = "ticket";
    this.busy = false;
    this.error = "";
    this.parked = [];
    this.parkedOpen = false;
    this.cartOpen = false;
    this.fullscreen = false;
    this.searchOpen = false;
    this.prebillOpen = false;
    this.printOnCharge = true;
    this.tableLabel = "";
    this.customerName = "";
    /** Snapshot fiscal del cliente asignado (ADR-0132). Copia, no referencia: viaja con la venta. */
    this.customerTaxId = "";
    this.customerAddress = "";
    this.prodCats = /* @__PURE__ */ new Map();
    /** Mapa tax_category_key → rate_pct (vía taxes.rates.list); vacío si taxes no responde. ADR-0064/0066. */
    this.ratesMap = /* @__PURE__ */ new Map();
    this.cartRestored = false;
    // Botones de asignación (ADR-0043 B): cada módulo que aporta a `sales.pos.assign` monta SU botón
    // (mesa, cliente…) en el header. Botones independientes: cada uno abre su propio modal. El POS no
    // conoce a `tables`/`customers`; solo monta sus WC y escucha `erp:order-context`/`erp:customer-context`.
    this.assignFillers = [];
    // Comanda ATADA a la mesa (puntos 1+2): al cambiar de mesa se GUARDA la comanda de la mesa
    // actual y se RECUPERA la de la nueva (o el carrito suelto si es null). Así tocar una mesa
    // ocupada trae su tiquet a la pantalla de venta, como cualquier POS.
    this.onOrderContext = async (e6) => {
      const d3 = e6.detail ?? { table_id: null };
      const nextTable = d3.table_id ?? void 0;
      if (nextTable && nextTable === this.tableId) {
        this.tableLabel = d3.label ?? this.tableLabel;
        return;
      }
      const accion = decideOnTableChange({
        cartHasItems: this.cart.length > 0,
        currentTableId: this.tableId,
        targetTableId: nextTable,
        targetOrderId: d3.order_id ?? void 0
      });
      const aparcar = async () => {
        const n6 = await parkCart(erplora2(), this.cart);
        if (this.orderId) await erplora2().command("sales.order.void", { order_id: this.orderId }).catch(() => void 0);
        this.parked = await listParkedTickets(erplora2());
        if (n6) this.error = t3("ui.parkedAs", { number: n6 });
      };
      if (accion === "clear" || accion === "park-then-clear") {
        if (accion === "park-then-clear") await aparcar();
        this.tableId = void 0;
        this.tableLabel = "";
        this.orderId = void 0;
        this.cart = [];
        return;
      }
      if (accion === "assign-to-target") {
        this.tableId = nextTable;
        this.tableLabel = d3.label ?? "";
        if (this.orderId) {
          for (const f3 of this.assignFillers) {
            f3.el.dispatchEvent(new CustomEvent("erp:order-linked", { detail: { order_id: this.orderId }, bubbles: false }));
          }
        }
        return;
      }
      if (accion === "park-then-load") await aparcar();
      this.tableId = nextTable;
      this.tableLabel = d3.label ?? "";
      const linked = d3.order_id ?? void 0;
      this.orderId = linked;
      this.cart = linked ? await loadOrderLines(erplora2(), linked) : [];
    };
    // Fusionar mesas (punto 3): el filler ya ejecutó tables.sessions.merge; aquí se combinan los
    // tiquets (sumando líneas idénticas) en la mesa destino y se limpia el origen.
    this.onOrderMerge = async (e6) => {
      const d3 = e6.detail;
      if (!d3?.from_table_id || !d3?.to_table_id || d3.from_table_id === d3.to_table_id) return;
      const from = d3.from_order_id ?? void 0;
      let to = d3.to_order_id ?? void 0;
      if (!from) return;
      if (!to) {
        to = from;
      } else {
        await mergeOrders(erplora2(), from, to);
      }
      if (this.tableId === d3.from_table_id || this.tableId === d3.to_table_id) {
        this.tableId = d3.to_table_id;
        this.tableLabel = d3.to_label ?? this.tableLabel;
        this.orderId = to;
        this.cart = await loadOrderLines(erplora2(), to);
      }
    };
    // Transferir mesa (punto 4): el filler ya ejecutó tables.sessions.transfer; aquí se mueve la
    // comanda de la mesa origen a la destino (libre → sin comanda previa) y se limpia el origen.
    this.onOrderTransfer = async (e6) => {
      const d3 = e6.detail;
      if (!d3?.from_table_id || !d3?.to_table_id || d3.from_table_id === d3.to_table_id) return;
      if (this.tableId !== d3.from_table_id) return;
      this.tableId = d3.to_table_id;
      this.tableLabel = d3.to_label ?? this.tableLabel;
      const order = d3.to_order_id ?? this.orderId;
      if (order && order !== this.orderId) {
        this.orderId = order;
        this.cart = await loadOrderLines(erplora2(), order);
      }
    };
    this.onCustomerContext = (e6) => {
      const d3 = e6.detail ?? { customer_id: null };
      this.customerId = d3.customer_id ?? void 0;
      this.customerName = d3.customer_name ?? "";
      this.customerTaxId = d3.customer_tax_id ?? "";
      this.customerAddress = d3.customer_address ?? "";
    };
    this.onFsChange = () => {
      this.fullscreen = document.fullscreenElement === this;
    };
    this.onLocaleChange = () => this.requestUpdate();
  }
  static {
    this.styles = i`
    /* El COLOR lo pone el tema de Ionic (claro/oscuro según el hub); el POS solo aporta el LAYOUT.
       Los nombres internos (--bg/--tile/--accent…) se remapean a tokens --ion-* con fallback. */
    :host {
      --bg: var(--ion-background-color, #fff);
      --panel: var(--ion-background-color, #fff);
      --tile: var(--ion-card-background, var(--ion-background-color, #fff));
      --tile-hi: var(--ion-color-light, #f2f1ed);
      --line: var(--ion-border-color, #e6e3db);
      --tx: var(--ion-text-color, #1c1b18);
      --mut: var(--ion-color-medium, #8b897f);
      --accent: var(--ion-color-primary, #0091ce);
      --accent-2: var(--ion-color-primary-shade, #0081b9);
      display:block; height:100%; box-sizing:border-box; font-family: system-ui, sans-serif; color:var(--tx);
    }
    *, *::before, *::after { box-sizing:border-box; }

    .card { height:100%; display:flex; flex-direction:column; overflow:hidden; background:var(--bg);
      border:1px solid var(--ion-border-color); border-radius:16px; }
    .body { position:relative; flex:1; min-height:0; display:grid; grid-template-columns: 1fr 23rem; }

    /* ── Catálogo ── */
    .catalog { display:flex; flex-direction:column; min-width:0; padding:.8rem; }
    .catbar { display:flex; align-items:center; gap:.4rem; margin-bottom:.7rem; }
    .arrow { flex:none; width:2.1rem; height:2.1rem; border-radius:10px; border:1px solid var(--ion-border-color);
      background:var(--tile); color:var(--mut); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
    .arrow:hover { background:var(--tile-hi); color:var(--tx); }
    .arrow ion-icon { font-size:1.1rem; }
    .seg { flex:1; min-width:0; display:flex; gap:.55rem; overflow-x:auto; scroll-behavior:smooth; padding:.15rem; scrollbar-width:none; }
    .seg::-webkit-scrollbar { display:none; }
    .catcard { flex:none; width:9.5rem; height:4.4rem; border-radius:12px; overflow:hidden; position:relative; cursor:pointer;
      border:2px solid transparent; background:var(--tile); padding:0; text-align:left; color:#fff; }
    .catcard .cc-img { position:absolute; inset:0; background-size:cover; background-position:center; }
    .catcard .cc-img::after { content:''; position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,.15), rgba(0,0,0,.72)); }
    .catcard .cc-meta { position:absolute; left:.6rem; right:.6rem; bottom:.45rem; }
    .catcard .cc-n { font-weight:700; font-size:.92rem; line-height:1.1; }
    .catcard .cc-c { font-size:.72rem; color:#d8d6cf; margin-top:.1rem; }
    .catcard[aria-pressed=true] { border-color:var(--accent); }

    /* Resultados del buscador de productos (proyectados en el slot de ok-spotlight-search). */
    .sp-list { background:transparent; }
    ion-list.sp-list { background:transparent; }
    .sp-list ion-item { --background:transparent; border-radius:10px; }
    .sp-price { font-weight:800; color:var(--accent); }
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap:.7rem; overflow:auto; align-content:start; padding-bottom:.3rem; }
    ion-card.tile { margin:0; border-radius:14px; box-shadow:none; border:1px solid var(--ion-border-color); background:var(--tile);
      overflow:hidden; display:flex; flex-direction:column; transition:border-color .12s, transform .05s; }
    ion-card.tile:hover { border-color:var(--accent); }
    ion-card.tile:active { transform:scale(.98); }
    .thumb { height:5.6rem; background-size:cover; background-position:center; display:flex; align-items:center; justify-content:center;
      font-weight:800; font-size:1.4rem; color:rgba(255,255,255,.85); }
    .thumb img { width:100%; height:100%; object-fit:cover; }
    .tinfo { padding:.5rem .6rem .65rem; }
    .tile .n { font-weight:600; font-size:.9rem; line-height:1.2; color:var(--tx); }
    .tile .p { font-weight:800; color:var(--accent); margin-top:.25rem; }

    /* ── Carrito ── */
    .cart { position:relative; display:flex; flex-direction:column; min-height:0; background:var(--panel); border-left:1px solid var(--ion-border-color); }
    .cart ion-header ion-toolbar { --background:var(--panel); --color:var(--tx); --border-color:var(--ion-border-color); }
    .cart ion-title { font-size:1rem; }
    /* Contexto asignado (mesa/cliente) como CHIPS en el título — sustituye al texto "Venta". */
    .ctx-chips { display:flex; gap:.35rem; flex-wrap:wrap; }
    .ctx-chips .chip { font-size:.8rem; font-weight:700; color:#fff; border-radius:999px; padding:.12rem .55rem; background:var(--accent); white-space:nowrap; }
    .ctx-chips .chip.cust { background:#5c7cfa; }
    /* Contenedor donde los módulos montan su botón de asignación (mesa, cliente…) en el header. */
    .cart-actions-slot { display:flex; align-items:center; }
    .cart-actions-slot:empty { display:none; }
    /* El CUERPO. Ionic ya resuelve «header fijo · cuerpo con scroll · pie fijo»: ion-content trae
       su propio scroll, así que aquí solo hay que decirle que ocupe el hueco que queda. Antes esto
       era flex:1 + overflow:auto a mano sobre ion-list.lines, que no aplicaba al div del carrito
       vacío: nada empujaba al pie y COBRAR se movía. */
    .cart ion-content.cart-body { flex:1; min-height:0; --background:var(--panel); --color:var(--tx); }
    ion-list.lines { padding:0; background:transparent; }
    ion-list.lines ion-item { --background:transparent; --color:var(--tx); --border-color:var(--ion-border-color); --padding-start:.7rem; --inner-padding-end:.5rem; }
    ion-list.lines ion-item h3 { font-weight:600; color:var(--tx); }
    ion-list.lines ion-item p { color:var(--mut); }
    .lineend { display:flex; flex-direction:column; align-items:flex-end; gap:.3rem; }
    .lineend .lt { font-weight:700; white-space:nowrap; }
    ok-qty-stepper { --ok-qty-field-width:2.3rem; --ok-surface:var(--tile); --ok-text:var(--tx); --ok-border:var(--ion-border-color); }
    .empty { color:var(--mut); text-align:center; padding:2.5rem 1rem; }
    /* El PIE. ion-footer se queda abajo por su cuenta (es un pie de verdad, no un div con flex). */
    .cart ion-footer { flex:none; }
    .cart ion-footer ion-toolbar { --background:var(--panel); }
    .cart-foot { padding:.75rem; border-top:1px solid var(--ion-border-color); background:var(--panel); }
    .total { display:flex; justify-content:space-between; align-items:baseline; margin:.1rem 0 .65rem; font-size:1rem; color:var(--mut); }
    .total b { font-size:1.7rem; color:var(--tx); }
    .charge { font-size:1.05rem; font-weight:700; }
    /* Dos acciones solo-icono (ADR-0133): la cuenta ocupa lo justo y cobrar se lleva el resto,
       porque es la acción primaria y el dedo la busca sin mirar. */
    /* Cobro: los segments son la elección (método, formato) y abajo las dos salidas. */
    /* El importe manda: grande, centrado y solo. */
    .pay-total { font-size:2.4rem; font-weight:800; text-align:center; letter-spacing:-.02em;
      margin:.2rem 0 1rem; color:var(--tx); }
    /* Etiqueta de sección: dice QUÉ estás eligiendo (antes dos segments iguales sin contexto). */
    .pay-lbl { margin:.9rem 0 .35rem; font-size:.75rem; font-weight:700; text-transform:uppercase;
      letter-spacing:.06em; color:var(--mut); }
    .pay-methods { margin:.1rem 0 .55rem; --background:transparent; }
    /* Atajos de efectivo: el cajero pulsa en vez de teclear. */
    .quick { display:grid; grid-template-columns:repeat(4,1fr); gap:.4rem; margin:.7rem 0 .5rem; }
    .qbtn { padding:.55rem .2rem; border-radius:10px; border:1px solid var(--ion-border-color);
      background:var(--tile); color:var(--tx); font-weight:700; font-size:.9rem; cursor:pointer; }
    .qbtn[aria-pressed=true] { border-color:var(--accent); color:var(--accent); }
    /* El cambio es lo que el cajero busca con el ojo al devolver. */
    .amt.big-change .v { font-size:1.6rem; font-weight:800; color:var(--accent); }
    .print-row { --background:transparent; --padding-start:0; --inner-padding-end:0; margin:.5rem 0 .2rem; }
    .pay-err { color:var(--ion-color-danger,#d9480f); margin:.4rem 0 0; }
    .pay-actions { display:flex; gap:.5rem; }
    .pay-actions .charge { flex:1; }
    .pay-actions .charge-print { flex:none; width:64px; }
    .foot-actions { display:flex; gap:.5rem; }
    .foot-actions .prebill { flex:none; width:56px; }
    .foot-actions .charge { flex:1; }

    /* desplegable tickets aparcados */
    .pdrop-back { position:absolute; inset:0; z-index:40; }
    .pdrop { position:absolute; top:2.9rem; right:.5rem; z-index:41; width:min(20rem,90%); background:var(--tile);
      border:1px solid var(--ion-border-color); border-radius:12px; box-shadow:0 12px 32px rgba(0,0,0,.5); padding:.5rem; max-height:60%; overflow:auto; }
    .pdrop .hint { color:var(--mut); font-size:.82rem; margin:.3rem .2rem .5rem; }
    .pitem { display:flex; justify-content:space-between; align-items:center; gap:.6rem; border:1px solid var(--ion-border-color); border-radius:10px; padding:.45rem .6rem; margin-bottom:.35rem; }
    .pn { font-weight:700; font-size:.9rem; }
    .pm { color:var(--mut); font-size:.78rem; }
    .badge-num { font-size:.62rem; min-width:1rem; height:1rem; padding:0 .2rem; border-radius:999px; background:var(--accent); color:#fff; display:inline-flex; align-items:center; justify-content:center; position:absolute; top:.2rem; right:.2rem; }

    /* botón flotante de carrito (solo móvil) */
    .fab { display:none; position:absolute; right:1rem; bottom:1rem; z-index:50; width:3.6rem; height:3.6rem; border-radius:50%;
      border:none; background:var(--accent); color:#fff; cursor:pointer; box-shadow:0 10px 26px rgba(0,0,0,.45); align-items:center; justify-content:center; }
    .fab ion-icon { font-size:1.6rem; }
    .fab .badge { position:absolute; top:-.2rem; right:-.2rem; min-width:1.3rem; height:1.3rem; padding:0 .25rem; border-radius:999px;
      background:#fff; color:var(--accent); font-size:.72rem; font-weight:800; display:inline-flex; align-items:center; justify-content:center; }
    .cart-close { display:none; }

    /* cobro / numpad (sheet oscuro) */
    .pay { display:flex; flex-direction:column; gap:.8rem; }
    .methods { display:flex; gap:.4rem; flex-wrap:wrap; }
    .chip { padding:.5rem .9rem; border-radius:999px; border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); cursor:pointer; }
    .chip[aria-pressed=true] { background:var(--accent); color:#fff; border-color:transparent; }
    .amt { display:flex; justify-content:space-between; font-size:1.1rem; }
    .amt .v { font-weight:700; }
    .change { color:var(--ion-color-success, #2f9e44); }
    .numpad { display:grid; grid-template-columns: repeat(3, 1fr); gap:.35rem; margin-bottom:.2rem; }
    .numpad button { font-size:1.15rem; padding:.6rem; border-radius:10px; border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); cursor:pointer; }
    .scrim { position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex; align-items:center; justify-content:center; z-index:70; }
    /* Columna flex: el importe y el botón de cobrar NO se mueven; solo scrollea el centro. Antes
       el sheet entero scrolleaba y el botón principal quedaba fuera de pantalla — la acción más
       importante del TPV no puede exigir scroll. */
    .sheet { background:var(--panel); color:var(--tx); border:1px solid var(--ion-border-color);
      border-radius:16px; width:min(92vw,24rem); max-height:88vh; display:flex; flex-direction:column;
      overflow:hidden; box-shadow:0 12px 48px rgba(0,0,0,.6); }
    .sheet-h, .sheet-top, .sheet-foot { flex:none; padding:0 1rem; }
    .sheet-h { padding-top:1rem; }
    .sheet-foot { padding:.75rem 1rem 1rem; border-top:1px solid var(--ion-border-color); }
    .pay { flex:1; min-height:0; overflow:auto; padding:0 1rem; }
    .sheet-h { display:flex; justify-content:space-between; align-items:center; margin-bottom:.8rem; }
    .sheet-h .t { font-size:1.2rem; font-weight:700; }
    .x { background:none; border:none; font-size:1.3rem; cursor:pointer; color:var(--mut); }

    @media (max-width: 820px) {
      .body { grid-template-columns: 1fr; }
      .cart { position:absolute; top:0; right:0; bottom:0; width:min(92%,26rem); z-index:60;
        box-shadow:-8px 0 32px rgba(0,0,0,.5); transform:translateX(100%); transition:transform .25s ease; }
      .cart[data-open] { transform:translateX(0); }
      .cart-close { display:inline-flex; }
      .cart-backdrop[data-open] { display:block; position:absolute; inset:0; background:rgba(0,0,0,.5); z-index:55; }
      .fab { display:inline-flex; }
    }
    .cart-backdrop { display:none; }
  `;
  }
  async connectedCallback() {
    super.connectedCallback();
    document.addEventListener("fullscreenchange", this.onFsChange);
    window.addEventListener("erplora:locale-changed", this.onLocaleChange);
    try {
      const [prods, methods, settingsRows, savedCart, parked, cats, prodCats, ratesMap] = await Promise.all([
        erplora2().queryAll("inventory.products.list").catch(() => []),
        erplora2().query("sales.payment_methods").catch(() => []),
        erplora2().query("sales.settings.get").catch(() => []),
        this.restoreOpenOrder(),
        listParkedTickets(erplora2()),
        erplora2().queryAll("inventory.categories.list", { sort: "name", dir: "asc" }).catch(() => []),
        erplora2().queryAll("inventory.product_categories").catch(() => []),
        buildCategoryRatesMap(erplora2())
      ]);
      this.ratesMap = ratesMap;
      this.products = rows2(prods).filter((p4) => p4.is_active !== 0);
      this.methods = rows2(methods);
      this.settings = rows2(settingsRows)[0] || {};
      this.docFormat = this.settings.default_document_format === "invoice" ? "invoice" : "ticket";
      this.payMethod = defaultPayMethod(this.payMethods);
      this.parked = parked;
      this.categories = rows2(cats).filter((c5) => c5.name);
      for (const pc of rows2(prodCats)) {
        if (!this.prodCats.has(pc.product_id)) this.prodCats.set(pc.product_id, /* @__PURE__ */ new Set());
        this.prodCats.get(pc.product_id).add(pc.category_id);
      }
      if (savedCart.length) this.cart = savedCart;
      await this.updateComplete;
      this.addEventListener("erp:order-context", this.onOrderContext);
      this.addEventListener("erp:order-merge", this.onOrderMerge);
      this.addEventListener("erp:order-transfer", this.onOrderTransfer);
      this.addEventListener("erp:customer-context", this.onCustomerContext);
      await this.resolveSlots();
      this.ensureSlotsMounted();
    } catch (e6) {
      this.error = e6 instanceof Error ? e6.message : t3("ui.errorLoadingPos");
    } finally {
      this.cartRestored = true;
    }
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("fullscreenchange", this.onFsChange);
    window.removeEventListener("erplora:locale-changed", this.onLocaleChange);
    this.removeEventListener("erp:order-context", this.onOrderContext);
    this.removeEventListener("erp:order-merge", this.onOrderMerge);
    this.removeEventListener("erp:order-transfer", this.onOrderTransfer);
    this.removeEventListener("erp:customer-context", this.onCustomerContext);
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = void 0;
      void persistActiveCart(erplora2(), this.cart, this.tableId);
    }
  }
  async resolveSlots() {
    const sdk = globalThis.erplora;
    if (!sdk?.loadSlot) return;
    let resolved = [];
    try {
      resolved = await sdk.loadSlot("sales.pos.assign") ?? [];
    } catch {
      resolved = [];
    }
    this.assignFillers = resolved.map((f3) => ({
      component: f3.component,
      el: document.createElement(f3.component)
    }));
    this.requestUpdate();
  }
  /** (Re)engancha los botones de los fillers en el header; idempotente, sobrevive a re-renders. */
  ensureSlotsMounted() {
    const host = this.renderRoot.querySelector(".cart-actions-slot");
    if (!host || !this.assignFillers.length) return;
    for (const f3 of this.assignFillers) {
      if (f3.el.parentElement !== host) host.appendChild(f3.el);
    }
  }
  /** Tras cobrar: avisa a cada filler para que limpie su selección (mesa/cliente). */
  resetSlotContexts() {
    for (const f3 of this.assignFillers) {
      f3.el.dispatchEvent(new CustomEvent("erp:order-context-reset", { bubbles: false }));
      f3.el.dispatchEvent(new CustomEvent("erp:customer-context-reset", { bubbles: false }));
    }
  }
  updated(_changed) {
    this.ensureSlotsMounted();
  }
  // Dinero formateado con la MONEDA DEL HUB (ADR-0059): el SDK la resuelve de /api/hub/context
  // (misma fuente que dashboard/billing). Antes hardcodeaba '€' / la moneda por-módulo.
  // FIX QA (2026-06-25): el POS trabaja en CÉNTIMOS → formatMoney (divide /100), NO formatAmount
  // (que mostraba precios ×100).
  money(n6) {
    return erplora2().formatMoney(Number(n6) || 0);
  }
  /** Formas de pago que se ofrecen: activas (query) y permitidas por Ajustes (allow_*). */
  get payMethods() {
    return enabledPayMethods(this.methods, {
      allow_cash: this.settings.allow_cash,
      allow_card: this.settings.allow_card,
      allow_transfer: this.settings.allow_transfer
    });
  }
  get total() {
    return this.cart.reduce((s5, l3) => s5 + (l3.is_gift ? 0 : l3.price * l3.qty), 0);
  }
  get itemCount() {
    return this.cart.reduce((s5, l3) => s5 + l3.qty, 0);
  }
  get parkingEnabled() {
    return this.settings.enable_parked_tickets !== 0;
  }
  catCount(id) {
    const c5 = this.categories.find((x2) => x2.id === id);
    return c5?.product_count ?? this.products.filter((p4) => this.prodCats.get(p4.id)?.has(id)).length;
  }
  scrollCats(dir) {
    const seg = this.renderRoot.querySelector(".seg");
    seg?.scrollBy({ left: dir * 220, behavior: "smooth" });
  }
  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await this.requestFullscreen();
    } catch {
    }
  }
  async park() {
    if (!this.cart.length) return;
    const num = await parkCart(erplora2(), this.cart);
    if (!num) {
      this.error = t3("ui.errorPark");
      return;
    }
    this.cart = [];
    this.parkedOpen = false;
    this.parked = await listParkedTickets(erplora2());
  }
  async retrieve(t7) {
    if (this.cart.length) return;
    try {
      this.cart = await retrieveParkedTicket(erplora2(), t7);
      this.parkedOpen = false;
      this.parked = await listParkedTickets(erplora2());
    } catch (e6) {
      this.error = e6 instanceof Error ? e6.message : t7("ui.errorRetrieve");
    }
  }
  /** ADR-0141: reanuda el pedido ABIERTO (si lo hay) tras recargar. Sus líneas ya traen `line_id`
   *  (para poder mutarlas) y la categoría fiscal (autoridad del IVA al cobrar, ADR-0085). */
  async restoreOpenOrder() {
    try {
      const id = await findOpenOrder(erplora2());
      if (!id) return [];
      this.orderId = id;
      return await loadOrderLines(erplora2(), id);
    } catch {
      return [];
    }
  }
  /** Asegura que existe un pedido abierto que respalde el carrito; devuelve su id ('' si falla).
   *  Si hay una MESA seleccionada, avisa a los fillers (`tables`) para que escriban la junction
   *  mesa↔pedido — `sales` no toca `tables`: es un contrato por evento (ADR-0043/0141). */
  async ensureOrder(first) {
    if (this.orderId) return this.orderId;
    this.orderId = await openOrderWithLines(erplora2(), [first]);
    if (this.orderId && this.tableId) {
      for (const f3 of this.assignFillers) {
        f3.el.dispatchEvent(new CustomEvent("erp:order-linked", { detail: { order_id: this.orderId }, bubbles: false }));
      }
    }
    return this.orderId;
  }
  async add(p4) {
    const ex = this.cart.find((l3) => l3.id === p4.id && !l3.is_gift);
    const tax_rate = resolveLineTax(this.ratesMap, p4.tax_category_key);
    try {
      if (ex) {
        const qty = ex.qty + 1;
        this.cart = this.cart.map((l3) => l3 === ex ? { ...l3, qty } : l3);
        if (this.orderId && ex.line_id) {
          await updateOrderLineQty(erplora2(), this.orderId, ex.line_id, qty, ex.price, ex.is_gift);
        }
        return;
      }
      const line = {
        id: p4.id,
        name: p4.name,
        sku: p4.sku,
        price: Number(p4.price),
        qty: 1,
        tax_category_key: p4.tax_category_key,
        tax_rate,
        cost: Number(p4.cost) || 0
      };
      if (!this.orderId) {
        await this.ensureOrder(line);
        const persisted = this.orderId ? await loadOrderLines(erplora2(), this.orderId) : [];
        this.cart = persisted.length ? persisted.map((pl) => ({ ...line, ...pl })) : [...this.cart, line];
        return;
      }
      line.line_id = await addOrderLine(erplora2(), this.orderId, line);
      this.cart = [...this.cart, line];
    } catch (e6) {
      this.error = e6 instanceof Error ? e6.message : String(e6);
    }
  }
  /** Invitar/quitar invitación a una línea (comp, ADR-comp): toggle is_gift con un motivo por defecto.
   *  La línea regalo no se cobra (el servidor pone net/tax/total=0) pero descuenta stock. */
  async toggleGift(id) {
    const ex = this.cart.find((l3) => l3.id === id);
    if (!ex) return;
    const is_gift = !ex.is_gift;
    const gift_reason = is_gift ? ex.gift_reason || "Invitaci\xF3n" : void 0;
    this.cart = this.cart.map((l3) => l3 === ex ? { ...l3, is_gift, gift_reason } : l3);
    if (this.orderId && ex.line_id) {
      await updateOrderLineQty(erplora2(), this.orderId, ex.line_id, ex.qty, ex.price, is_gift, gift_reason ?? "");
    }
  }
  /** Fija la cantidad de una línea (desde ok-qty-stepper); al llegar a 0 la línea se elimina. */
  async setQtyAbs(id, v3) {
    const ex = this.cart.find((l3) => l3.id === id);
    if (!ex) return;
    const qty = Math.max(0, Math.round(v3));
    this.cart = qty > 0 ? this.cart.map((l3) => l3 === ex ? { ...l3, qty } : l3) : this.cart.filter((l3) => l3 !== ex);
    if (!this.orderId || !ex.line_id) return;
    if (qty > 0) await updateOrderLineQty(erplora2(), this.orderId, ex.line_id, qty, ex.price, ex.is_gift);
    else await removeOrderLine(erplora2(), this.orderId, ex.line_id);
  }
  /** Imprime la CUENTA (no fiscal). El navegador imprime el nodo del recibo; en Hub Local el
   *  bridge de impresoras ESC/POS es un paso aparte (no bloquea llevar la cuenta a la mesa). */
  printPrebill() {
    const doc = orderToPrebill(
      this.cart.map((l3) => ({ name: l3.name, price: l3.price, qty: l3.qty, is_gift: l3.is_gift })),
      this.settings,
      { tableLabel: this.tableLabel || void 0, notice: t3("ui.prebillNotice") }
    );
    const sdk = globalThis.erplora;
    const html = receiptToPrintableHtml(doc);
    if (sdk?.print) void sdk.print({ role: "receipt", documentType: "prebill", html, data: doc });
    else printHtmlInIframe(html);
  }
  openPay() {
    if (!this.cart.length) return;
    this.tendered = "";
    this.payMethod = defaultPayMethod(this.payMethods);
    this.docFormat = this.settings.default_document_format === "invoice" ? "invoice" : "ticket";
    this.paying = true;
  }
  tap(k2) {
    if (k2 === "C") {
      this.tendered = "";
      return;
    }
    if (k2 === "." && this.tendered.includes(".")) return;
    this.tendered = (this.tendered + k2).slice(0, 9);
  }
  // El pinpad teclea EUROS («20» = 20 €); el contrato de la venta es CÉNTIMOS (ADR-0007/0123),
  // como `total`. Sin esta conversión: «Efectivo 0.20 €» y cambio 0 en el tiquet (QA 2026-07-17).
  get tenderedNum() {
    return eurosToCents(this.tendered || "0");
  }
  get change() {
    return Math.max(0, this.tenderedNum - this.total);
  }
  /** Cierra la venta. La IMPRESIÓN no se dispara desde aquí: la hace el shell por el Bridge al
   *  recibir `sale.completed` (ajuste `auto_print_on_sale`). El toggle de la pantalla de cobro
   *  refleja esa preferencia; el diálogo del navegador solo aparece como respaldo manual. */
  async confirm(_print = false) {
    this.busy = true;
    this.error = "";
    try {
      const items = this.cart.map((l3) => ({ product_id: l3.id, product_name: l3.name, product_sku: l3.sku || "", price: l3.price, quantity: l3.qty, tax_category_key: l3.tax_category_key ?? null, tax_rate: l3.tax_rate ?? 0, category_id: this.prodCats.get(l3.id)?.values().next().value ?? null, is_gift: l3.is_gift ?? false, gift_reason: l3.gift_reason ?? "", cost: l3.cost ?? 0 }));
      await erplora2().command("sales.complete_sale", {
        items,
        tax_included: this.settings.default_tax_included !== 0,
        payment_method_id: this.payMethod?.id ?? null,
        payment_method_name: this.payMethod?.name ?? "Efectivo",
        amount_tendered: this.tenderedNum || this.total,
        channel: "pos",
        source_module: "pos",
        table_id: this.tableId ?? null,
        // ADR-0141: la venta nace de este PEDIDO. El servidor lo marca completado (open→completed)
        // en el cobro final; para split-bill se enviaría `keep_order_open: true`.
        order_id: this.orderId ?? null,
        customer_id: this.customerId ?? null,
        customer_name: this.customerName,
        // Snapshot fiscal del cliente (ADR-0132): sin esto la factura emitida desde el TPV sale sin
        // NIF ni dirección aunque el cliente los tenga en su ficha.
        customer_tax_id: this.customerTaxId,
        customer_address: this.customerAddress,
        // Tipo de documento fiscal (ADR-0140): viaja ATÓMICAMENTE con la venta; `invoice` lo lee del
        // evento para elegir F1 (completa) vs F2 (simplificada). Reemplaza al `set_document_type` retro.
        document_type: this.docFormat
      });
      const recent = rows2(await erplora2().query("sales.list", { limit: 1, sort: "created_at", dir: "desc" }));
      const saleId = recent[0]?.id;
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = void 0;
      }
      await persistActiveCart(erplora2(), [], this.tableId);
      this.paying = false;
      this.cart = [];
      this.orderId = void 0;
      this.tableId = void 0;
      this.tableLabel = "";
      this.customerId = void 0;
      this.customerName = "";
      this.customerTaxId = "";
      this.customerAddress = "";
      this.resetSlotContexts();
      if (saleId) this.docSaleId = saleId;
    } catch (e6) {
      this.error = e6 instanceof Error ? e6.message : t3("ui.errorCharge");
    } finally {
      this.busy = false;
    }
  }
  /** La REJILLA del catálogo: filtra por la categoría activa (la búsqueda por texto vive en el
   *  Spotlight, no empuja la rejilla). */
  get filtered() {
    if (this.activeCat && this.prodCats.size) {
      return this.products.filter((p4) => this.prodCats.get(p4.id)?.has(this.activeCat));
    }
    return this.products;
  }
  /** Resultados del buscador SPOTLIGHT: `q` sobre TODO el catálogo (nombre o SKU), sin categoría. */
  get searchResults() {
    const q = this.q.trim().toLowerCase();
    if (!q) return [];
    return this.products.filter((p4) => p4.name.toLowerCase().includes(q) || (p4.sku || "").toLowerCase().includes(q));
  }
  renderCatBar() {
    const cell = (id, name, count, bg) => b2`
      <button class="catcard" aria-pressed=${this.activeCat === id} @click=${() => {
      this.activeCat = id;
    }}>
        <span class="cc-img" style=${`background-image:${bg}`}></span>
        <span class="cc-meta"><span class="cc-n">${name}</span><span class="cc-c">${count} ${t3("ui.products")}</span></span>
      </button>`;
    return b2`
      <div class="catbar">
        <button class="arrow" title=${t3("ui.previous")} @click=${() => this.scrollCats(-1)}><ion-icon name="chevron-back-outline"></ion-icon></button>
        <div class="seg">
          ${cell("", t3("ui.all"), this.products.length, gradient("Todos"))}
          ${this.categories.map((c5) => cell(c5.id, c5.name, this.catCount(c5.id), c5.image ? `url(${c5.image})` : gradient(c5.name)))}
        </div>
        <button class="arrow" title=${t3("ui.next")} @click=${() => this.scrollCats(1)}><ion-icon name="chevron-forward-outline"></ion-icon></button>
        <!-- Lupa: despliega el buscador (gana alto para la rejilla). Hueco natural para el micro
             de búsqueda por voz cuando llegue. -->
        <button class="arrow" title=${t3("ui.searchAction")} aria-pressed=${this.searchOpen}
          @click=${() => this.renderRoot.querySelector("ok-spotlight-search")?.openSearch?.()}>
          <ion-icon name="search-outline"></ion-icon>
        </button>
      </div>`;
  }
  renderCart() {
    return b2`
      <ion-header class="ion-no-border">
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button class="cart-close" title=${t3("ui.closeAction")} @click=${() => {
      this.cartOpen = false;
    }}>
              <ion-icon slot="icon-only" name="chevron-forward-outline"></ion-icon>
            </ion-button>
          </ion-buttons>
          <!-- Contexto asignado como CHIPS (mesa/cliente); sin texto "Venta" (no aportaba). Se ven
               SIEMPRE en el header, por larga que sea la comanda. -->
          <ion-title>
            ${this.tableLabel || this.customerName ? b2`<span class="ctx-chips">
                  ${this.tableLabel ? b2`<span class="chip">${this.tableLabel}</span>` : A}
                  ${this.customerName ? b2`<span class="chip cust">${this.customerName}</span>` : A}
                </span>` : A}
          </ion-title>
          <ion-buttons slot="end">
            <!-- Botones de asignación (ADR-0043 B): cada módulo (tables, customers…) monta AQUÍ su
                 propio botón-icono vía provides_slots: sales.pos.assign; cada uno abre su modal. El
                 POS no sabe nada de ellos. Van a la izquierda de aparcar/pantalla completa. Vacío si
                 no hay aportantes. -->
            <span class="cart-actions-slot"></span>
            ${this.parkingEnabled ? b2`<ion-button title=${t3("ui.parkedTickets")} style="position:relative" @click=${() => {
      this.parkedOpen = !this.parkedOpen;
    }}>
                  <ion-icon slot="icon-only" name="file-tray-stacked-outline"></ion-icon>
                  ${this.parked.length ? b2`<span class="badge-num">${this.parked.length}</span>` : A}
                </ion-button>` : A}
            <ion-button title=${t3("ui.fullscreen")} @click=${() => this.toggleFullscreen()}>
              <ion-icon slot="icon-only" name=${this.fullscreen ? "contract-outline" : "expand-outline"}></ion-icon>
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      ${this.parkedOpen ? b2`
          <div class="pdrop-back" @click=${() => {
      this.parkedOpen = false;
    }}></div>
          <div class="pdrop">
            <ion-button size="small" expand="block" fill="outline" ?disabled=${!this.cart.length} @click=${() => this.park()}>${t3("ui.parkCurrentSale")}</ion-button>
            <p class="hint">${t3("ui.parkedTickets")}</p>
            ${this.parked.map((pt) => b2`<div class="pitem">
              <div><div class="pn">${pt.ticket_number}</div><div class="pm">${(pt.created_at || "").replace("T", " ").slice(0, 16)}</div></div>
              <ion-button size="small" ?disabled=${!!this.cart.length} @click=${() => this.retrieve(pt)}>${t3("ui.retrieve")}</ion-button>
            </div>`)}
            ${!this.parked.length ? b2`<div class="hint" style="text-align:center">${t3("ui.noParkedTickets")}</div>` : A}
          </div>` : A}

      <!-- El CUERPO. ion-content es quien scrollea: las líneas crecen aquí dentro y ni el header ni
           el pie se mueven. Con divs a pelo, una comanda larga empujaba el botón de COBRAR fuera de
           la pantalla — en un TPV eso es no poder cobrar. -->
      <ion-content class="cart-body">
        ${this.cart.length ? b2`<ion-list class="lines" lines="full">
              ${this.cart.map((l3) => b2`<ion-item>
                <ion-label>
                  <h3>${l3.name}${l3.is_gift ? b2` <ion-badge color="success">${t3("ui.giftBadge")}</ion-badge>` : A}</h3>
                  <p>${this.money(l3.price)}${l3.is_gift && l3.gift_reason ? b2` · ${l3.gift_reason}` : A}</p>
                </ion-label>
                <div slot="end" class="lineend">
                  <span class="lt" style=${l3.is_gift ? "text-decoration:line-through;opacity:.55" : ""}>${this.money(l3.price * l3.qty)}</span>
                  <ion-button fill="clear" size="small" title=${t3("ui.giftAction")} @click=${() => this.toggleGift(l3.id)}>
                    <ion-icon name=${l3.is_gift ? "gift" : "gift-outline"} slot="icon-only" color=${l3.is_gift ? "success" : "medium"}></ion-icon>
                  </ion-button>
                  <ok-qty-stepper .value=${l3.qty} .min=${0} .step=${1}
                    @ok-change=${(e6) => this.setQtyAbs(l3.id, e6.detail.value)}></ok-qty-stepper>
                </div>
              </ion-item>`)}
            </ion-list>` : b2`<div class="empty">${t3("ui.cartEmptyTouch")}</div>`}
      </ion-content>

      <!-- El PIE. ion-footer es un pie de verdad: se queda abajo pase lo que pase. -->
      <ion-footer class="ion-no-border">
        <div class="cart-foot">
          <div class="total"><span>${t3("ui.colTotal")}</span><b>${this.money(this.total)}</b></div>
          <!-- Forma de pago ANTES de cobrar (decisión de Ioan): se elige aquí, con la comanda
               delante, y el modal de cobro queda limpio. Solo-icono porque son 3-4 opciones fijas
               que el camarero reconoce de un vistazo; el nombre va en title/aria. Solo aparecen
               las ACTIVAS (is_active en la query + los allow_* de Ajustes). -->
          <!-- Los iconos de forma de pago se eligen en RUNTIME (payMethodIcon), y el empaquetador
               del módulo solo hornea LITERALES: sin esta lista el icono viaja vacío y el botón sale
               en blanco (le pasó a Bizum). Oculta, solo para que el build los recoja; hay un test
               (pay-icons-baked) que vigila que estén todos. -->
          <span hidden aria-hidden="true">
            <ion-icon name="cash-outline"></ion-icon>
            <ion-icon name="card-outline"></ion-icon>
            <ion-icon name="phone-portrait-outline"></ion-icon>
            <ion-icon name="swap-horizontal-outline"></ion-icon>
            <ion-icon name="ticket-outline"></ion-icon>
            <ion-icon name="gift-outline"></ion-icon>
            <ion-icon name="ellipsis-horizontal-circle-outline"></ion-icon>
          </span>
          ${this.payMethods.length > 1 ? b2`
            <ion-segment class="pay-methods" value=${this.payMethod?.id ?? ""}
                         @ionChange=${(e6) => {
      const id = e6.detail.value;
      this.payMethod = this.payMethods.find((m4) => m4.id === id) ?? this.payMethod;
      if (!needsTendered(this.payMethod)) this.tendered = "";
    }}>
              ${this.payMethods.map((m4) => b2`
                <ion-segment-button value=${m4.id} title=${m4.name} aria-label=${m4.name}>
                  <ion-icon name=${payMethodIcon(m4.type, m4.name)}></ion-icon>
                </ion-segment-button>`)}
            </ion-segment>` : A}
          <!-- Acciones SOLO-ICONO (ADR-0133): imprimir la CUENTA para llevarla a la mesa (no es un
               documento fiscal) y COBRAR (que sí emite el tiquet fiscal). El importe ya se ve
               grande arriba, así que el texto sobra; la etiqueta va en aria-label/title. -->
          <div class="foot-actions">
            <ion-button class="prebill" fill="outline" ?disabled=${!this.cart.length}
                        title=${t3("ui.printPrebill")} aria-label=${t3("ui.printPrebill")}
                        @click=${() => {
      this.prebillOpen = true;
    }}>
              <ion-icon slot="icon-only" name="print-outline"></ion-icon>
            </ion-button>
            <ion-button class="charge" ?disabled=${!this.cart.length}
                        title=${t3("ui.charge")} aria-label=${t3("ui.charge")}
                        @click=${() => this.openPay()}>
              <ion-icon slot="icon-only" name="cash-outline"></ion-icon>
            </ion-button>
          </div>
        </div>
      </ion-footer>`;
  }
  render() {
    return b2`<div class="card">
      <div class="body">
        <div class="catalog">
          ${this.renderCatBar()}
          ${this.error ? b2`<p style="color:var(--ion-color-danger,#d9480f)">${this.error}</p>` : A}
          <div class="grid">
            ${this.filtered.map((p4) => b2`<ion-card button class="tile" @click=${() => this.add(p4)}>
              <div class="thumb" style=${p4.image ? `background-image:url(${p4.image})` : `background:${gradient(p4.name)}`}>
                ${p4.image ? A : initials(p4.name)}
              </div>
              <div class="tinfo"><div class="n">${p4.name}</div><div class="p">${this.money(Number(p4.price))}</div></div>
            </ion-card>`)}
            ${!this.filtered.length ? b2`<div class="empty">${t3("ui.noProducts")}</div>` : A}
          </div>
        </div>

        <div class="cart-backdrop" ?data-open=${this.cartOpen} @click=${() => {
      this.cartOpen = false;
    }}></div>
        <aside class="cart" ?data-open=${this.cartOpen}>${this.renderCart()}</aside>

        <!-- Botón flotante de carrito (solo móvil) -->
        <button class="fab" @click=${() => {
      this.cartOpen = true;
    }}>
          <ion-icon name="cart-outline"></ion-icon>
          ${this.itemCount ? b2`<span class="badge">${this.itemCount}</span>` : A}
        </button>
      </div>

      ${this.paying ? b2`<div class="scrim" @click=${(e6) => {
      if (e6.target.classList.contains("scrim")) this.paying = false;
    }}>
            <div class="sheet">
              <div class="sheet-h">
                <span class="t">${t3("ui.charge")}</span>
                <button class="x" @click=${() => {
      this.paying = false;
    }}>✕</button>
              </div>
              <!-- El IMPORTE manda en esta pantalla: grande, solo y SIEMPRE visible (fuera del
                   scroll). Antes vivía en letra pequeña del título y el ojo no lo encontraba. -->
              <div class="sheet-top"><div class="pay-total">${this.money(this.total)}</div></div>
              <div class="pay">

                <!-- Entregado/cambio/teclado SOLO en efectivo: con tarjeta se cobra el total y no
                     hay nada que teclear (lo decide requires_change, no un "si es efectivo"). -->
                ${needsTendered(this.payMethod) ? b2`
                    <div class="amt"><span>${t3("ui.tendered")}</span><span class="v">${this.money(this.tenderedNum)}</span></div>
                    ${this.change > 0 ? b2`<div class="amt big-change"><span>${t3("ui.change")}</span><span class="v">${this.money(this.change)}</span></div>` : A}
                    <div class="numpad">
                      ${["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "C"].map((k2) => b2`<button @click=${() => this.tap(k2)}>${k2}</button>`)}
                    </div>` : A}

                <!-- Imprimir deja de ser un botón gemelo del de cobrar (dos botones azules iguales
                     no dicen cuál hace qué): es una PREFERENCIA del cobro. -->
                <ion-item lines="none" class="print-row">
                  <ion-icon slot="start" name="print-outline"></ion-icon>
                  <ion-label>${t3("ui.printReceipt")}</ion-label>
                  <ion-toggle slot="end" .checked=${this.printOnCharge}
                              @ionChange=${(e6) => {
      this.printOnCharge = !!e6.detail.checked;
    }}></ion-toggle>
                </ion-item>

              </div>
              <div class="sheet-foot">
                ${this.error ? b2`<p class="pay-err">${this.error}</p>` : A}
                <!-- UNA acción, dice lo que hace y por cuánto, y no exige scroll para alcanzarla. -->
                <ion-button class="charge" expand="block" ?disabled=${this.busy}
                            @click=${() => this.confirm(this.printOnCharge)}>
                  ${this.busy ? t3("ui.charging") : `${t3("ui.charge")} ${this.money(this.total)}`}
                </ion-button>
              </div>
            </div>
          </div>` : A}

      <!-- Buscador de productos = ok-spotlight-search (OutfitKit): overlay translúcido flotante que
           NO empuja la rejilla. La lupa del catbar controla su apertura. Al pulsar un resultado se
           añade al carrito y se cierra. -->
      <ok-spotlight-search placeholder=${t3("ui.searchProductPlaceholder")} .value=${this.q}
        @ok-open=${(e6) => {
      this.searchOpen = e6.detail.open;
      if (!e6.detail.open) this.q = "";
    }}
        @ok-input=${(e6) => {
      this.q = e6.detail.value;
    }}>
        <ion-list class="sp-list" lines="none">
          ${this.searchResults.map((p4) => b2`
            <ion-item button detail="false" @click=${() => {
      this.add(p4);
      this.q = "";
      this.renderRoot.querySelector("ok-spotlight-search")?.close?.();
    }}>
              <ion-label><h3>${p4.name}</h3>${p4.sku ? b2`<p>${p4.sku}</p>` : A}</ion-label>
              <span slot="end" class="sp-price">${this.money(Number(p4.price))}</span>
            </ion-item>`)}
          ${this.q.trim() && !this.searchResults.length ? b2`<div class="empty">${t3("ui.noProducts")}</div>` : A}
        </ion-list>
      </ok-spotlight-search>

      ${renderDocumentModal({ saleId: this.docSaleId, onClose: () => {
      this.docSaleId = void 0;
    }, t: t3 })}
      <!-- CUENTA previa (ADR-0141): lo que se lleva a la mesa antes de cobrar. NO es fiscal — sin
           número de serie ni QR VeriFactu; el tiquet fiscal lo emite el cobro. -->
      <ion-modal class="doc-modal" .isOpen=${this.prebillOpen}
                 @ionModalDidDismiss=${() => {
      this.prebillOpen = false;
    }}>
        <ion-header><ion-toolbar>
          <ion-title>${t3("ui.prebillTitle")}</ion-title>
          <ion-buttons slot="end">
            <ion-button title=${t3("ui.print")} aria-label=${t3("ui.print")} @click=${() => this.printPrebill()}>
              <ion-icon slot="icon-only" name="print-outline"></ion-icon>
            </ion-button>
            <ion-button title=${t3("ui.close")} aria-label=${t3("ui.close")}
                        @click=${() => {
      this.prebillOpen = false;
    }}>
              <ion-icon slot="icon-only" name="close-outline"></ion-icon>
            </ion-button>
          </ion-buttons>
        </ion-toolbar></ion-header>
        <ion-content class="doc-body ion-padding">
          <ok-receipt id="prebill-doc" .data=${orderToPrebill(
      this.cart.map((l3) => ({ name: l3.name, price: l3.price, qty: l3.qty, is_gift: l3.is_gift })),
      this.settings,
      { tableLabel: this.tableLabel || void 0, notice: t3("ui.prebillNotice") }
    )}></ok-receipt>
        </ion-content>
      </ion-modal>
    </div>`;
  }
};
__decorateClass([
  r5()
], ErpPosTouch.prototype, "products", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "categories", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "activeCat", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "q", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "cart", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "methods", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "settings", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "paying", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "tendered", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "payMethod", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "docFormat", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "busy", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "error", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "docSaleId", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "parked", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "parkedOpen", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "cartOpen", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "fullscreen", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "searchOpen", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "tableId", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "orderId", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "prebillOpen", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "printOnCharge", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "tableLabel", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "customerId", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "customerName", 2);
define("erp-pos-touch", ErpPosTouch);

// ui/components/erp-pos-desktop/erp-pos-desktop.ts
var CATALOG3 = { es: es_default, en: en_default };
function erplora3() {
  const c5 = globalThis.erplora;
  if (!c5) throw new Error("erplora SDK no inicializado por el shell");
  return c5;
}
function t4(key, params) {
  return erplora3().t(CATALOG3, key, params);
}
function rows3(r6) {
  if (Array.isArray(r6)) return r6;
  if (r6 && typeof r6 === "object" && Array.isArray(r6.rows)) return r6.rows;
  return [];
}
var ErpPosDesktop = class extends i3 {
  constructor() {
    super(...arguments);
    this.products = [];
    this.cart = [];
    this.methods = [];
    this.settings = {};
    this.term = "";
    this.paying = false;
    this.tendered = "";
    this.docFormat = "ticket";
    this.busy = false;
    this.error = "";
    this.parked = [];
    this.parkedOpen = false;
    this.tableLabel = "";
    this.customerName = "";
    /** Snapshot fiscal del cliente asignado (ADR-0132). Copia, no referencia: viaja con la venta. */
    this.customerTaxId = "";
    this.customerAddress = "";
    /** Mapa tax_category_key → rate_pct (vía taxes.rates.list); vacío si taxes no responde. ADR-0064/0066. */
    this.ratesMap = /* @__PURE__ */ new Map();
    this.cartRestored = false;
    // Botones de asignación (ADR-0043 B): cada módulo que aporta a `sales.pos.assign` monta SU botón
    // (mesa, cliente…) en las acciones. Botones independientes: cada uno abre su propio modal. El POS
    // no conoce a `tables`/`customers`; solo monta sus WC y escucha sus eventos.
    this.assignFillers = [];
    // Comanda ATADA a la mesa (puntos 1+2): guarda la comanda de la mesa actual y recupera la de la
    // nueva (o el carrito suelto si es null), como cualquier POS.
    this.onOrderContext = async (e6) => {
      const d3 = e6.detail ?? { table_id: null };
      const nextTable = d3.table_id ?? void 0;
      if (nextTable === this.tableId) {
        this.tableLabel = d3.label ?? this.tableLabel;
        return;
      }
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = void 0;
      }
      await persistActiveCart(erplora3(), this.cart, this.tableId);
      this.tableId = nextTable;
      this.tableLabel = d3.label ?? "";
      this.cart = await loadActiveCart(erplora3(), nextTable);
    };
    // Fusionar mesas (punto 3): combina los tiquets (sumando idénticas) en el destino, limpia origen.
    this.onOrderMerge = async (e6) => {
      const d3 = e6.detail;
      if (!d3?.from_table_id || !d3?.to_table_id || d3.from_table_id === d3.to_table_id) return;
      const [fromLines, toLines] = await Promise.all([
        loadActiveCart(erplora3(), d3.from_table_id),
        loadActiveCart(erplora3(), d3.to_table_id)
      ]);
      const merged = mergeCartLines(toLines, fromLines);
      await persistActiveCart(erplora3(), merged, d3.to_table_id);
      await persistActiveCart(erplora3(), [], d3.from_table_id);
      if (this.tableId === d3.from_table_id) {
        this.tableId = d3.to_table_id;
        this.tableLabel = d3.to_label ?? this.tableLabel;
        this.cart = merged;
      } else if (this.tableId === d3.to_table_id) {
        this.cart = merged;
      }
    };
    // Transferir mesa (punto 4): mueve la comanda de origen a destino (libre), limpia origen.
    this.onOrderTransfer = async (e6) => {
      const d3 = e6.detail;
      if (!d3?.from_table_id || !d3?.to_table_id || d3.from_table_id === d3.to_table_id) return;
      const lines = await loadActiveCart(erplora3(), d3.from_table_id);
      await persistActiveCart(erplora3(), lines, d3.to_table_id);
      await persistActiveCart(erplora3(), [], d3.from_table_id);
      if (this.tableId === d3.from_table_id) {
        this.tableId = d3.to_table_id;
        this.tableLabel = d3.to_label ?? this.tableLabel;
        this.cart = lines;
      }
    };
    this.onCustomerContext = (e6) => {
      const d3 = e6.detail ?? { customer_id: null };
      this.customerId = d3.customer_id ?? void 0;
      this.customerName = d3.customer_name ?? "";
      this.customerTaxId = d3.customer_tax_id ?? "";
      this.customerAddress = d3.customer_address ?? "";
    };
    this.onLocaleChange = () => this.requestUpdate();
  }
  static {
    this.styles = i`
    :host { display:block; font-family: system-ui, sans-serif; color: var(--ion-text-color,#1c1b18); }
    .scan { display:flex; gap:.5rem; margin-bottom:.8rem; }
    .scan input { flex:1; font-size:1.1rem; padding:.7rem .9rem; border:2px solid var(--ion-color-primary,#0091ce); border-radius:10px; background:var(--ion-background-color,#fff); color:inherit; }
    .sugg { position:relative; }
    .drop { position:absolute; z-index:5; left:0; right:0; background:var(--ion-background-color,#fff); border:1px solid var(--ion-border-color,#d9d6cf); border-radius:0 0 10px 10px; max-height:14rem; overflow:auto; box-shadow:0 8px 24px rgba(0,0,0,.12); }
    .drop button { display:flex; justify-content:space-between; width:100%; border:none; background:none; padding:.5rem .8rem; cursor:pointer; font:inherit; }
    .drop button:hover { background:var(--ion-color-light,#f2f1ed); }
    table { width:100%; border-collapse:collapse; }
    th, td { padding:.5rem .4rem; border-bottom:1px solid var(--ion-border-color,#eee); text-align:left; }
    th { font-size:.75rem; text-transform:uppercase; color:#8b897f; }
    td.num, th.num { text-align:right; white-space:nowrap; }
    td input.q { width:3.5rem; text-align:center; font:inherit; padding:.3rem; border:1px solid var(--ion-border-color,#d9d6cf); border-radius:6px; background:var(--ion-background-color,#fff); color:inherit; }
    .rm { background:none; border:none; color:#d9480f; cursor:pointer; }
    .foot { display:flex; justify-content:space-between; align-items:center; margin-top:1rem; gap:1rem; }
    .total { font-size:1.4rem; font-weight:800; display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; }
    .table-tag, .customer-tag { font-size:.8rem; font-weight:700; color:#fff; border-radius:999px; padding:.15rem .6rem; }
    .table-tag { background:var(--ion-color-primary,#0091ce); }
    .customer-tag { background:#5c7cfa; }
    /* Contenedor donde los módulos montan su botón de asignación (mesa, cliente…) en las acciones. */
    .cart-actions-slot { display:inline-flex; align-items:center; }
    .empty { color:#8b897f; text-align:center; padding:2rem 0; }
    /* overlay cobro */
    .scrim { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:50; }
    .sheet { background:var(--ion-background-color,#fff); border-radius:16px; padding:1rem; width:min(92vw,24rem); box-shadow:0 12px 48px rgba(0,0,0,.35); }
    .sheet-h { display:flex; justify-content:space-between; align-items:center; margin-bottom:.8rem; }
    .sheet-h .t { font-size:1.2rem; font-weight:700; }
    .x { background:none; border:none; font-size:1.3rem; cursor:pointer; color:#8b897f; }
    .pay { display:flex; flex-direction:column; gap:.8rem; }
    .methods { display:flex; gap:.4rem; flex-wrap:wrap; }
    .chip { padding:.5rem .9rem; border-radius:999px; border:1px solid var(--ion-border-color,#d9d6cf); background:var(--ion-background-color,#fff); cursor:pointer; }
    .chip[aria-pressed=true] { background:var(--ion-color-primary,#0091ce); color:#fff; border-color:transparent; }
    .field label { font-size:.85rem; color:#8b897f; }
    .field input { width:100%; box-sizing:border-box; font-size:1.3rem; padding:.6rem; border:1px solid var(--ion-border-color,#d9d6cf); border-radius:10px; background:var(--ion-background-color,#fff); color:inherit; }
    .change { color:#2f9e44; font-weight:700; }
    /* tickets aparcados */
    .actions { display:flex; gap:.4rem; flex-wrap:wrap; }
    .plist { display:flex; flex-direction:column; gap:.4rem; max-height:50vh; overflow:auto; }
    .pitem { display:flex; justify-content:space-between; align-items:center; gap:.6rem; border:1px solid var(--ion-border-color,#e0ddd4); border-radius:10px; padding:.5rem .7rem; }
    .pn { font-weight:700; }
    .pm { color:#8b897f; }
    .hint { color:#8b897f; font-size:.85rem; margin:.2rem 0 .6rem; }
  `;
  }
  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener("erplora:locale-changed", this.onLocaleChange);
    try {
      const [prods, methods, settingsRows, savedCart, parked, ratesMap] = await Promise.all([
        erplora3().queryAll("inventory.products.list").catch(() => []),
        erplora3().query("sales.payment_methods").catch(() => []),
        erplora3().query("sales.settings.get").catch(() => []),
        loadActiveCart(erplora3()),
        listParkedTickets(erplora3()),
        buildCategoryRatesMap(erplora3())
      ]);
      this.ratesMap = ratesMap;
      this.products = rows3(prods).filter((p4) => p4.is_active !== 0);
      this.methods = rows3(methods);
      this.settings = rows3(settingsRows)[0] || {};
      this.docFormat = this.settings.default_document_format === "invoice" ? "invoice" : "ticket";
      this.payMethod = this.methods[0];
      this.parked = parked;
      if (savedCart.length) this.cart = savedCart;
      await this.updateComplete;
      this.addEventListener("erp:order-context", this.onOrderContext);
      this.addEventListener("erp:order-merge", this.onOrderMerge);
      this.addEventListener("erp:order-transfer", this.onOrderTransfer);
      this.addEventListener("erp:customer-context", this.onCustomerContext);
      await this.resolveSlots();
      this.ensureSlotsMounted();
    } catch (e6) {
      this.error = e6 instanceof Error ? e6.message : t4("ui.errorLoadingPos");
    } finally {
      this.cartRestored = true;
    }
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("erplora:locale-changed", this.onLocaleChange);
    this.removeEventListener("erp:order-context", this.onOrderContext);
    this.removeEventListener("erp:order-merge", this.onOrderMerge);
    this.removeEventListener("erp:order-transfer", this.onOrderTransfer);
    this.removeEventListener("erp:customer-context", this.onCustomerContext);
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = void 0;
      void persistActiveCart(erplora3(), this.cart, this.tableId);
    }
  }
  /** Resuelve (una vez) los fillers del modal Asignar (ADR-0043 B) y crea sus instancias. */
  async resolveSlots() {
    const sdk = globalThis.erplora;
    if (!sdk?.loadSlot) return;
    let resolved = [];
    try {
      resolved = await sdk.loadSlot("sales.pos.assign") ?? [];
    } catch {
      resolved = [];
    }
    this.assignFillers = resolved.map((f3) => ({
      component: f3.component,
      el: document.createElement(f3.component)
    }));
    this.requestUpdate();
  }
  /** (Re)engancha los botones de los fillers en las acciones; idempotente, sobrevive a re-renders. */
  ensureSlotsMounted() {
    const host = this.renderRoot.querySelector(".cart-actions-slot");
    if (!host || !this.assignFillers.length) return;
    for (const f3 of this.assignFillers) {
      if (f3.el.parentElement !== host) host.appendChild(f3.el);
    }
  }
  /** Tras cobrar: avisa a cada filler para que limpie su selección (mesa/cliente). */
  resetSlotContexts() {
    for (const f3 of this.assignFillers) {
      f3.el.dispatchEvent(new CustomEvent("erp:order-context-reset", { bubbles: false }));
      f3.el.dispatchEvent(new CustomEvent("erp:customer-context-reset", { bubbles: false }));
    }
  }
  /** Persiste el carrito (debounced) y re-engancha los slots tras cada render. */
  updated(changed) {
    this.ensureSlotsMounted();
    if (!changed.has("cart") || !this.cartRestored) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = void 0;
      void persistActiveCart(erplora3(), this.cart, this.tableId);
    }, 400);
  }
  // Dinero formateado con la MONEDA DEL HUB (ADR-0059): el SDK la resuelve de /api/hub/context
  // (misma fuente que dashboard/billing). Antes hardcodeaba '€' / la moneda por-módulo.
  // FIX QA (2026-06-25): el POS trabaja en CÉNTIMOS (price de inventory.products.list, total del
  // carrito) → debe usar formatMoney (divide /100), NO formatAmount (espera unidades) que mostraba
  // los precios ×100 ("3.500,00 €" por un servicio de 35 €).
  money(n6) {
    return erplora3().formatMoney(Number(n6) || 0);
  }
  get total() {
    return this.cart.reduce((s5, l3) => s5 + (l3.is_gift ? 0 : l3.price * l3.qty), 0);
  }
  get parkingEnabled() {
    return this.settings.enable_parked_tickets !== 0;
  }
  /** Aparca el carrito actual como ticket y lo deja libre para la siguiente venta. */
  async park() {
    if (!this.cart.length) return;
    const num = await parkCart(erplora3(), this.cart);
    if (!num) {
      this.error = t4("ui.errorPark");
      return;
    }
    this.cart = [];
    this.parked = await listParkedTickets(erplora3());
    this.scanInput?.focus();
  }
  /** Recupera un ticket aparcado al carrito (solo con el carrito vacío). */
  async retrieve(t7) {
    if (this.cart.length) return;
    try {
      this.cart = await retrieveParkedTicket(erplora3(), t7);
      this.parkedOpen = false;
      this.parked = await listParkedTickets(erplora3());
    } catch (e6) {
      this.error = e6 instanceof Error ? e6.message : t7("ui.errorRetrieve");
    }
  }
  get matches() {
    const q = this.term.trim().toLowerCase();
    if (!q) return [];
    return this.products.filter((p4) => (p4.sku || "").toLowerCase().includes(q) || p4.name.toLowerCase().includes(q)).slice(0, 8);
  }
  add(p4) {
    const ex = this.cart.find((l3) => l3.id === p4.id && !l3.is_gift);
    const tax_rate = resolveLineTax(this.ratesMap, p4.tax_category_key);
    this.cart = ex ? this.cart.map((l3) => l3.id === p4.id && !l3.is_gift ? { ...l3, qty: l3.qty + 1 } : l3) : [...this.cart, { id: p4.id, name: p4.name, sku: p4.sku, price: Number(p4.price), qty: 1, tax_category_key: p4.tax_category_key, tax_rate, cost: Number(p4.cost) || 0 }];
    this.term = "";
    this.scanInput?.focus();
  }
  /** Invitar/quitar invitación a una línea (comp): toggle is_gift con motivo por defecto. */
  toggleGift(id) {
    this.cart = this.cart.map(
      (l3) => l3.id === id ? { ...l3, is_gift: !l3.is_gift, gift_reason: !l3.is_gift ? l3.gift_reason || "Invitaci\xF3n" : void 0 } : l3
    );
  }
  onScanKey(e6) {
    if (e6.key !== "Enter") return;
    const q = this.term.trim().toLowerCase();
    if (!q) return;
    const exact = this.products.find((p4) => (p4.sku || "").toLowerCase() === q);
    const pick = exact || this.matches[0];
    if (pick) this.add(pick);
  }
  setQty(id, qty) {
    this.cart = this.cart.map((l3) => l3.id === id ? { ...l3, qty: Math.max(1, qty || 1) } : l3);
  }
  remove(id) {
    this.cart = this.cart.filter((l3) => l3.id !== id);
  }
  openPay() {
    if (!this.cart.length) return;
    this.tendered = (this.total / 100).toFixed(2);
    this.payMethod = this.methods[0];
    this.docFormat = this.settings.default_document_format === "invoice" ? "invoice" : "ticket";
    this.paying = true;
  }
  /** Lo entregado por el cliente, en CÉNTIMOS (el input está en euros). */
  get tenderedNum() {
    return eurosToCents(this.tendered || "0");
  }
  get change() {
    return Math.max(0, this.tenderedNum - this.total);
  }
  async confirm() {
    this.busy = true;
    this.error = "";
    try {
      const items = this.cart.map((l3) => ({ product_id: l3.id, product_name: l3.name, product_sku: l3.sku || "", price: l3.price, quantity: l3.qty, tax_category_key: l3.tax_category_key ?? null, tax_rate: l3.tax_rate ?? 0, is_gift: l3.is_gift ?? false, gift_reason: l3.gift_reason ?? "", cost: l3.cost ?? 0 }));
      await erplora3().command("sales.complete_sale", {
        items,
        tax_included: this.settings.default_tax_included !== 0,
        payment_method_id: this.payMethod?.id ?? null,
        payment_method_name: this.payMethod?.name ?? "Efectivo",
        amount_tendered: this.tenderedNum || this.total,
        channel: "pos",
        source_module: "pos",
        table_id: this.tableId ?? null,
        customer_id: this.customerId ?? null,
        customer_name: this.customerName,
        // Snapshot fiscal del cliente (ADR-0132): sin esto la factura del TPV sale sin NIF.
        customer_tax_id: this.customerTaxId,
        customer_address: this.customerAddress,
        // Tipo de documento fiscal (ADR-0140): viaja ATÓMICAMENTE con la venta; `invoice` lo lee del
        // evento para elegir F1 (completa) vs F2 (simplificada). Reemplaza al `set_document_type` retro.
        document_type: this.docFormat
      });
      const recent = rows3(await erplora3().query("sales.list", { limit: 1, sort: "created_at", dir: "desc" }));
      const saleId = recent[0]?.id;
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = void 0;
      }
      await persistActiveCart(erplora3(), [], this.tableId);
      this.paying = false;
      this.cart = [];
      this.tableId = void 0;
      this.tableLabel = "";
      this.customerId = void 0;
      this.customerName = "";
      this.customerTaxId = "";
      this.customerAddress = "";
      this.resetSlotContexts();
      if (saleId) this.docSaleId = saleId;
    } catch (e6) {
      this.error = e6 instanceof Error ? e6.message : t4("ui.errorCharge");
    } finally {
      this.busy = false;
    }
  }
  render() {
    return b2`<div>
      <div class="scan">
        <div class="sugg" style="flex:1">
          <input id="scan" placeholder=${t4("ui.scanPlaceholder")}
            .value=${this.term}
            @input=${(e6) => {
      this.term = e6.target.value;
    }}
            @keydown=${(e6) => this.onScanKey(e6)} />
          ${this.matches.length ? b2`<div class="drop">
                ${this.matches.map((p4) => b2`<button @click=${() => this.add(p4)}>
                  <span>${p4.name} ${p4.sku ? b2`<small style="color:#8b897f">· ${p4.sku}</small>` : A}</span>
                  <span>${this.money(Number(p4.price))}</span>
                </button>`)}
              </div>` : A}
        </div>
      </div>
      ${this.error ? b2`<p style="color:#d9480f">${this.error}</p>` : A}

      <table>
        <thead><tr><th>${t4("ui.colProduct")}</th><th class="num">${t4("ui.colPrice")}</th><th class="num">${t4("ui.colQty")}</th><th class="num">${t4("ui.colAmount")}</th><th></th></tr></thead>
        <tbody>
          ${this.cart.length ? this.cart.map((l3) => b2`<tr>
                <td>${l3.name} ${l3.sku ? b2`<small style="color:#8b897f">· ${l3.sku}</small>` : A}${l3.is_gift ? b2` <ion-badge color="success">${t4("ui.giftBadge")}</ion-badge>` : A}</td>
                <td class="num">${this.money(l3.price)}</td>
                <td class="num"><input class="q" type="number" min="1" .value=${String(l3.qty)}
                  @input=${(e6) => this.setQty(l3.id, Number(e6.target.value))} /></td>
                <td class="num" style=${l3.is_gift ? "text-decoration:line-through;opacity:.55" : ""}>${this.money(l3.price * l3.qty)}</td>
                <td class="num"><button class="rm" @click=${() => this.toggleGift(l3.id)} title=${t4("ui.giftAction")} style=${l3.is_gift ? "color:var(--ion-color-success,#2dd36f)" : ""}>🎁</button> <button class="rm" @click=${() => this.remove(l3.id)} title=${t4("ui.remove")}>✕</button></td>
              </tr>`) : b2`<tr><td colspan="5"><div class="empty">${t4("ui.cartEmptyDesktop")}</div></td></tr>`}
        </tbody>
      </table>

      <div class="foot">
        <div class="total">${t4("ui.colTotal")} ${this.money(this.total)}${this.tableLabel ? b2`<span class="table-tag">${this.tableLabel}</span>` : A}${this.customerName ? b2`<span class="customer-tag">${this.customerName}</span>` : A}</div>
        <div class="actions">
          <!-- Botones de asignación (ADR-0043 B): cada módulo (tables, customers…) monta AQUÍ su
               propio botón, vía provides_slots: sales.pos.assign; cada uno abre su modal. -->
          <span class="cart-actions-slot"></span>
          ${this.parkingEnabled ? b2`
                <ion-button fill="outline" ?disabled=${!this.cart.length} @click=${() => this.park()}>${t4("ui.park")}</ion-button>
                <ion-button fill="outline" ?disabled=${!this.parked.length} @click=${() => {
      this.parkedOpen = true;
    }}>
                  ${t4("ui.parked")} (${this.parked.length})
                </ion-button>` : A}
          <ion-button ?disabled=${!this.cart.length} @click=${() => this.openPay()}>${t4("ui.chargeShortcut")}</ion-button>
        </div>
      </div>


      ${this.parkedOpen ? b2`<div class="scrim" @click=${(e6) => {
      if (e6.target.classList.contains("scrim")) this.parkedOpen = false;
    }}>
            <div class="sheet">
              <div class="sheet-h"><span class="t">${t4("ui.parkedTickets")}</span>
                <button class="x" @click=${() => {
      this.parkedOpen = false;
    }}>✕</button></div>
              ${this.cart.length ? b2`<p class="hint">${t4("ui.retrieveHint")}</p>` : A}
              <div class="plist">
                ${this.parked.map((pt) => b2`<div class="pitem">
                  <div>
                    <div class="pn">${pt.ticket_number}</div>
                    <small class="pm">${(pt.created_at || "").replace("T", " ").slice(0, 16)}</small>
                  </div>
                  <ion-button size="small" ?disabled=${!!this.cart.length} @click=${() => this.retrieve(pt)}>${t4("ui.retrieve")}</ion-button>
                </div>`)}
                ${!this.parked.length ? b2`<div class="empty">${t4("ui.noParkedTickets")}</div>` : A}
              </div>
            </div>
          </div>` : A}

      ${this.paying ? b2`<div class="scrim" @click=${(e6) => {
      if (e6.target.classList.contains("scrim")) this.paying = false;
    }}>
            <div class="sheet">
              <div class="sheet-h"><span class="t">${t4("ui.charge")} ${this.money(this.total)}</span>
                <button class="x" @click=${() => {
      this.paying = false;
    }}>✕</button></div>
              <div class="pay">
                <div class="methods">
                  ${this.methods.map((m4) => b2`<button class="chip" aria-pressed=${this.payMethod?.id === m4.id} @click=${() => {
      this.payMethod = m4;
    }}>${m4.name}</button>`)}
                  ${!this.methods.length ? b2`<button class="chip" aria-pressed="true">${t4("ui.cash")}</button>` : A}
                </div>
                <div class="field"><label>${t4("ui.tendered")}</label>
                  <input type="number" step="0.01" .value=${this.tendered}
                    @input=${(e6) => {
      this.tendered = e6.target.value;
    }} /></div>
                <div>${t4("ui.change")}: <span class="change">${this.money(this.change)}</span></div>
                <ion-segment value=${this.docFormat} @ionChange=${(e6) => {
      this.docFormat = e6.detail.value === "invoice" ? "invoice" : "ticket";
    }}>
                  <ion-segment-button value="ticket"><ion-label>${t4("ui.formatTicket")}</ion-label></ion-segment-button>
                  <ion-segment-button value="invoice"><ion-label>${t4("ui.formatInvoice")}</ion-label></ion-segment-button>
                </ion-segment>
                ${this.error ? b2`<p style="color:#d9480f">${this.error}</p>` : A}
                <ion-button expand="block" ?disabled=${this.busy} @click=${() => this.confirm()}>${this.busy ? t4("ui.charging") : t4("ui.confirmCharge")}</ion-button>
              </div>
            </div>
          </div>` : A}

      ${renderDocumentModal({ saleId: this.docSaleId, onClose: () => {
      this.docSaleId = void 0;
    }, t: t4 })}
    </div>`;
  }
};
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "products", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "cart", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "methods", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "settings", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "term", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "paying", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "tendered", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "payMethod", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "docFormat", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "busy", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "error", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "docSaleId", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "parked", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "parkedOpen", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "tableId", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "tableLabel", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "customerId", 2);
__decorateClass([
  r5()
], ErpPosDesktop.prototype, "customerName", 2);
__decorateClass([
  e4("#scan")
], ErpPosDesktop.prototype, "scanInput", 2);
define("erp-pos-desktop", ErpPosDesktop);

// ui/components/erp-pos/erp-pos.ts
function erplora4() {
  const c5 = globalThis.erplora;
  if (!c5) throw new Error("erplora SDK no inicializado por el shell");
  return c5;
}
var ErpPos = class extends i3 {
  constructor() {
    super(...arguments);
    this.layout = "touch";
    this.ready = false;
  }
  static {
    this.styles = i`:host { display:block; height:100%; }`;
  }
  async connectedCallback() {
    super.connectedCallback();
    try {
      const rows4 = await erplora4().query("sales.settings.get");
      const row = Array.isArray(rows4) ? rows4[0] : rows4;
      this.layout = row?.pos_layout === "desktop" ? "desktop" : "touch";
    } catch {
      this.layout = "touch";
    } finally {
      this.ready = true;
    }
  }
  render() {
    if (!this.ready) return b2``;
    return this.layout === "desktop" ? b2`<erp-pos-desktop></erp-pos-desktop>` : b2`<erp-pos-touch></erp-pos-touch>`;
  }
};
__decorateClass([
  r5()
], ErpPos.prototype, "layout", 2);
__decorateClass([
  r5()
], ErpPos.prototype, "ready", 2);
define("erp-pos", ErpPos);

// ../../node_modules/.pnpm/lit-html@3.3.3/node_modules/lit-html/directive.js
var t5 = { ATTRIBUTE: 1, CHILD: 2, PROPERTY: 3, BOOLEAN_ATTRIBUTE: 4, EVENT: 5, ELEMENT: 6 };
var e5 = (t7) => (...e6) => ({ _$litDirective$: t7, values: e6 });
var i4 = class {
  constructor(t7) {
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AT(t7, e6, i7) {
    this._$Ct = t7, this._$AM = e6, this._$Ci = i7;
  }
  _$AS(t7, e6) {
    return this.update(t7, e6);
  }
  update(t7, e6) {
    return this.render(...e6);
  }
};

// ../../node_modules/.pnpm/lit-html@3.3.3/node_modules/lit-html/directive-helpers.js
var { I: t6 } = j;
var i5 = (o7) => o7;
var s4 = () => document.createComment("");
var v2 = (o7, n6, e6) => {
  const l3 = o7._$AA.parentNode, d3 = void 0 === n6 ? o7._$AB : n6._$AA;
  if (void 0 === e6) {
    const i7 = l3.insertBefore(s4(), d3), n7 = l3.insertBefore(s4(), d3);
    e6 = new t6(i7, n7, o7, o7.options);
  } else {
    const t7 = e6._$AB.nextSibling, n7 = e6._$AM, c5 = n7 !== o7;
    if (c5) {
      let t8;
      e6._$AQ?.(o7), e6._$AM = o7, void 0 !== e6._$AP && (t8 = o7._$AU) !== n7._$AU && e6._$AP(t8);
    }
    if (t7 !== d3 || c5) {
      let o8 = e6._$AA;
      for (; o8 !== t7; ) {
        const t8 = i5(o8).nextSibling;
        i5(l3).insertBefore(o8, d3), o8 = t8;
      }
    }
  }
  return e6;
};
var u3 = (o7, t7, i7 = o7) => (o7._$AI(t7, i7), o7);
var m3 = {};
var p3 = (o7, t7 = m3) => o7._$AH = t7;
var M2 = (o7) => o7._$AH;
var h3 = (o7) => {
  o7._$AR(), o7._$AA.remove();
};

// ../../node_modules/.pnpm/lit-html@3.3.3/node_modules/lit-html/directives/repeat.js
var u4 = (e6, s5, t7) => {
  const r6 = /* @__PURE__ */ new Map();
  for (let l3 = s5; l3 <= t7; l3++) r6.set(e6[l3], l3);
  return r6;
};
var c4 = e5(class extends i4 {
  constructor(e6) {
    if (super(e6), e6.type !== t5.CHILD) throw Error("repeat() can only be used in text expressions");
  }
  dt(e6, s5, t7) {
    let r6;
    void 0 === t7 ? t7 = s5 : void 0 !== s5 && (r6 = s5);
    const l3 = [], o7 = [];
    let i7 = 0;
    for (const s6 of e6) l3[i7] = r6 ? r6(s6, i7) : i7, o7[i7] = t7(s6, i7), i7++;
    return { values: o7, keys: l3 };
  }
  render(e6, s5, t7) {
    return this.dt(e6, s5, t7).values;
  }
  update(s5, [t7, r6, c5]) {
    const d3 = M2(s5), { values: p4, keys: a3 } = this.dt(t7, r6, c5);
    if (!Array.isArray(d3)) return this.ut = a3, p4;
    const h4 = this.ut ??= [], v3 = [];
    let m4, y3, x2 = 0, j2 = d3.length - 1, k2 = 0, w2 = p4.length - 1;
    for (; x2 <= j2 && k2 <= w2; ) if (null === d3[x2]) x2++;
    else if (null === d3[j2]) j2--;
    else if (h4[x2] === a3[k2]) v3[k2] = u3(d3[x2], p4[k2]), x2++, k2++;
    else if (h4[j2] === a3[w2]) v3[w2] = u3(d3[j2], p4[w2]), j2--, w2--;
    else if (h4[x2] === a3[w2]) v3[w2] = u3(d3[x2], p4[w2]), v2(s5, v3[w2 + 1], d3[x2]), x2++, w2--;
    else if (h4[j2] === a3[k2]) v3[k2] = u3(d3[j2], p4[k2]), v2(s5, d3[x2], d3[j2]), j2--, k2++;
    else if (void 0 === m4 && (m4 = u4(a3, k2, w2), y3 = u4(h4, x2, j2)), m4.has(h4[x2])) if (m4.has(h4[j2])) {
      const e6 = y3.get(a3[k2]), t8 = void 0 !== e6 ? d3[e6] : null;
      if (null === t8) {
        const e7 = v2(s5, d3[x2]);
        u3(e7, p4[k2]), v3[k2] = e7;
      } else v3[k2] = u3(t8, p4[k2]), v2(s5, d3[x2], t8), d3[e6] = null;
      k2++;
    } else h3(d3[j2]), j2--;
    else h3(d3[x2]), x2++;
    for (; k2 <= w2; ) {
      const e6 = v2(s5, v3[w2 + 1]);
      u3(e6, p4[k2]), v3[k2++] = e6;
    }
    for (; x2 <= j2; ) {
      const e6 = d3[x2++];
      null !== e6 && h3(e6);
    }
    return this.ut = a3, p3(s5, v3), E;
  }
});

// ../../node_modules/.pnpm/lit-html@3.3.3/node_modules/lit-html/directives/style-map.js
var n5 = "important";
var i6 = " !" + n5;
var o6 = e5(class extends i4 {
  constructor(t7) {
    if (super(t7), t7.type !== t5.ATTRIBUTE || "style" !== t7.name || t7.strings?.length > 2) throw Error("The `styleMap` directive must be used in the `style` attribute and must be the only part in the attribute.");
  }
  render(t7) {
    return Object.keys(t7).reduce((e6, r6) => {
      const s5 = t7[r6];
      return null == s5 ? e6 : e6 + `${r6 = r6.includes("-") ? r6 : r6.replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g, "-$&").toLowerCase()}:${s5};`;
    }, "");
  }
  update(e6, [r6]) {
    const { style: s5 } = e6.element;
    if (void 0 === this.ft) return this.ft = new Set(Object.keys(r6)), this.render(r6);
    for (const t7 of this.ft) null == r6[t7] && (this.ft.delete(t7), t7.includes("-") ? s5.removeProperty(t7) : s5[t7] = null);
    for (const t7 in r6) {
      const e7 = r6[t7];
      if (null != e7) {
        this.ft.add(t7);
        const r7 = "string" == typeof e7 && e7.endsWith(i6);
        t7.includes("-") || r7 ? s5.setProperty(t7, r7 ? e7.slice(0, -11) : e7, r7 ? n5 : "") : s5[t7] = e7;
      }
    }
    return E;
  }
});

// ../../node_modules/.pnpm/@erplora+outfitkit@file+..+outfitkit/node_modules/@erplora/outfitkit/dist/ok-data-table.js
var CSV_BOM = "\uFEFF";
function decodeCsvBuffer(buf) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder("windows-1252").decode(buf);
  }
  return text.charCodeAt(0) === 65279 ? text.slice(1) : text;
}
var __defProp7 = Object.defineProperty;
var __decorateClass7 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp7(target, key, result);
  return result;
};
var DEFAULT_LABELS4 = {
  search: "Search\u2026",
  empty: "No results",
  filters: "Filters",
  clear: "Clear",
  apply: "Apply",
  selected: "{n} selected",
  importCsv: "Import CSV",
  exportCsv: "Export CSV",
  add: "Add",
  moreActions: "More actions",
  rowsPerPage: "Rows per page",
  perPageShort: "{n} / page",
  viewList: "View as list",
  viewCards: "View as cards",
  columnsVisible: "Visible columns",
  columns: "Columns",
  actions: "Actions",
  close: "Close",
  newRecord: "New",
  form: "Form",
  filterPlaceholder: "Filter\u2026",
  from: "From",
  to: "To",
  fromOf: "{label} from",
  toOf: "{label} to",
  gte: "\u2265",
  lte: "\u2264",
  noValues: "No values",
  selectAll: "Select all",
  selectRow: "Select row",
  select: "Select",
  showing: "Showing {from}\u2013{to} of",
  recordSingular: "record",
  recordPlural: "records"
};
var OkDataTable = class extends i3 {
  constructor() {
    super(...arguments);
    this.columns = [];
    this.rows = [];
    this.searchKeys = [];
    this.rowKeyField = "id";
    this.pageSize = 10;
    this.labels = {};
    this.actions = [];
    this.addable = false;
    this.pageSizeOptions = [10, 25, 50, 100];
    this.fill = false;
    this.columnPicker = true;
    this.csv = false;
    this.csvName = "export.csv";
    this.serverSide = false;
    this.total = 0;
    this.page = 0;
    this.searchable = false;
    this.sortDir = "asc";
    this.title = "";
    this.views = false;
    this.exportable = false;
    this.importable = false;
    this.columnSelector = false;
    this.selectable = false;
    this.inlineFilters = false;
    this.menuActions = [];
    this.q = "";
    this.clientPage = 0;
    this.clientPageSize = 0;
    this.clientSort = "";
    this.clientSortDir = "asc";
    this.clientFilters = {};
    this.filterDraft = {};
    this.panel = "none";
    this.viewMode = "table";
    this.hiddenKeys = /* @__PURE__ */ new Set();
    this.internalSelection = /* @__PURE__ */ new Set();
    this.menuOpen = false;
    this.onSearch = (ev) => {
      const value = ev.target.value ?? "";
      if (this.serverSide) {
        this.emit("searchChange", value);
      } else {
        this.q = value;
        this.clientPage = 0;
      }
    };
  }
  static {
    this.styles = i`
    :host {
      /* Vars overridable (estilo Ionic), default = cadena --ok-* → --ion-* → hex */
      --background: var(--ok-surface, var(--ion-card-background, var(--ion-background-color, #ffffff)));
      --color: var(--ok-text, var(--ion-text-color, #1c1b17));
      --color-muted: var(--ok-muted, var(--ion-color-medium, rgba(var(--ion-text-color-rgb, 24, 24, 27), 0.55)));
      --border-color: var(--ok-border, var(--ion-color-step-150, rgba(var(--ion-text-color-rgb, 24, 24, 27), 0.12)));
      --border-color-soft: var(--ok-border-soft, var(--ion-color-step-100, rgba(var(--ion-text-color-rgb, 24, 24, 27), 0.07)));
      /* Borde más marcado para los controles de la toolbar (selects/pastilla de fechas), para que se
       * distingan como controles en claro y oscuro aunque el lienzo y la superficie casi no contrasten. */
      --control-border: color-mix(in srgb, var(--color) 22%, transparent);
      /* Relieve de cabecera/pie: step-100 (definido en claro y oscuro) → contraste con el lienzo. */
      --header-background: var(--ok-surface-2, var(--ion-color-step-100, rgba(var(--ion-text-color-rgb, 24, 24, 27), 0.04)));
      --row-hover: var(--ok-row-hover, var(--ion-color-step-50, rgba(var(--ion-text-color-rgb, 24, 24, 27), 0.03)));
      --primary: var(--ok-primary, var(--ion-color-primary, #3880ff));
      --primary-contrast: var(--ok-primary-contrast, var(--ion-color-primary-contrast, #ffffff));
      --border-radius: var(--ok-radius, 16px);
      --font: var(--ok-font, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);

      display: block;
      color: var(--color);
      font-family: var(--font);
    }
    * { box-sizing: border-box; }
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      /* Flat: sin borde ni elevación (directiva 2026-06-09). */
      border: 0;
      border-radius: var(--border-radius);
      overflow: hidden;
      background: var(--background);
      box-shadow: none;
    }

    /* Panel lateral derecho (drawer) DENTRO de la tabla: filtros / alta-edición. No empuja contenido. */
    .tk-scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.18); z-index: 19; }
    .drawer { position: absolute; top: 0; right: 0; height: 100%; width: 340px; max-width: 88%;
      background: var(--background); border-left: 1px solid var(--border-color);
      box-shadow: -10px 0 28px rgba(0, 0, 0, 0.10); display: flex; flex-direction: column; z-index: 20;
      animation: tk-slide-in 0.18s ease; }
    @keyframes tk-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
    .drawer .dh { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
      padding: 0.6rem 0.5rem 0.6rem 1rem; border-bottom: 1px solid var(--border-color); font-size: 1rem; }
    .drawer .db { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.85rem; }
    .fblock { display: flex; flex-direction: column; gap: 0.45rem; }
    .flabel { font-size: 13px; font-weight: 500; color: var(--color); }
    .frange { display: flex; gap: 0.5rem; }
    /* Filtros cliente: multi-select con ion-select (ventana flotante de Ionic) + rango de fechas. */
    .daterange { display: flex; gap: 0.6rem; }
    .daterange ion-input { flex: 1; }
    /* Pie del drawer de filtros: Limpiar / Aplicar. */
    .df { flex: 0 0 auto; display: flex; align-items: center; justify-content: flex-end; gap: 0.4rem; padding: 0.6rem 0.85rem; border-top: 1px solid var(--border-color); }
    .df .df-clear { margin-right: auto; }

    /* Modo fill: la tabla ocupa el alto del contenedor; filas con scroll interno; pager fijo. */
    :host([fill]) { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    :host([fill]) .card { flex: 1 1 auto; min-height: 0; }
    :host([fill]) .bar, :host([fill]) .panel, :host([fill]) .pager { flex: 0 0 auto; }
    :host([fill]) .scroll, :host([fill]) .cards-grid { flex: 1 1 auto; min-height: 0; overflow: auto; }
    /* Sin filas, renderTable/renderCards devuelven SOLO el bloque .empty (sin .scroll). En modo
       fill hay que estirarlo para que ocupe el hueco entre toolbar y pager y centre su contenido
       (icono + mensaje) en vertical; si no, queda pegado arriba con el pager a media altura. */
    :host([fill]) .empty { flex: 1 1 auto; min-height: 0; }

    /* ── Topbar / cabecera (relieve) ─────────────────────────────────────────────────────── */
    .bar { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.65rem 1rem; border-bottom: 1px solid var(--border-color); background: var(--header-background); }
    /* Toolbar CONSOLIDADA: TODOS los controles son hijos directos de UNA sola fila flex que
     * envuelve ELEMENTO A ELEMENTO (no por bloques): caben en una línea → una línea; los que no
     * caben bajan a la(s) línea(s) que hagan falta. El cluster derecho se empuja al borde con
     * .tk-spacer (hueco flexible) solo cuando todo cabe en una línea; al envolver, el spacer se
     * oculta y todo se apila a la izquierda.
     * ORDEN CANÓNICO (2026-06-22, izquierda→derecha): [buscador] · [filtros en línea] · ‹spacer› ·
     * [SELECTORES: columnas → filas/página] · [BOTONES: vistas → filtros(funnel) → import → export →
     * alta → ⋮ → acción primaria]. Es decir: buscador al inicio, filtros en medio, y al final los
     * selectores (columnas, luego «N por página») seguidos de los botones de acción. */
    .bar-main { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
    .bar-main > ion-button { --padding-start: 0.5rem; --padding-end: 0.5rem; margin: 0; }
    /* Spacer que absorbe el hueco libre en pantallas anchas (empuja el cluster derecho al borde).
     * Se oculta por debajo de 1024px para que, al envolver, los controles se apilen a la izquierda. */
    .tk-spacer { flex: 1 1 0; min-width: 0; align-self: stretch; }
    @media (max-width: 1024px) { .tk-spacer { display: none; } }
    /* Buscador a ancho completo (línea propia) en móvil; el resto envuelve debajo. */
    @media (max-width: 640px) { .search { flex-basis: 100%; max-width: none; } }
    .title-wrap { display: flex; align-items: baseline; gap: 0.5rem; }
    .title { font-size: 15px; font-weight: 600; line-height: 1; margin: 0; }
    .title-count { font-size: 12px; font-weight: 500; color: var(--color-muted); }

    /* Botón de herramienta cuadrado (filtros/import/export), look del Hub: 36×36, badge contador. */
    .toolbtn { position: relative; --padding-start: 0; --padding-end: 0; --border-radius: 10px; width: 36px; height: 36px; margin: 0; }
    .toolbtn .badge { position: absolute; top: -5px; right: -5px; min-width: 16px; height: 16px; padding: 0 3px; border-radius: 999px; background: var(--primary); color: var(--primary-contrast); font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; pointer-events: none; }

    /* Buscador (caja con icono + limpiar), look del Hub. No crece (el spacer se queda el hueco);
     * puede encoger hasta min-width y, por debajo, envuelve. */
    .search { flex: 0 1 22rem; min-width: 12rem; max-width: 24rem; }
    ion-searchbar { --background: var(--background); --border-radius: 10px; padding: 0; min-height: 36px; }
    /* Flat: el buscador quita borde y elevación vía la clase específica de Ionic 'ion-no-border'.
     * (La regla global de Ionic para .ion-no-border no cruza el Shadow DOM, así que la
     * reimplementamos aquí dentro: --box-shadow controla la elevación; ::part(native) el borde.) */
    ion-searchbar.ion-no-border { --box-shadow: none; }
    ion-searchbar.ion-no-border::part(native) { border: none; box-shadow: none; }

    /* Toggle de vista lista/tarjetas (segmento) */
    .viewseg { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--background); }
    .viewseg ion-button { --border-radius: 7px; }

    /* Botón primario (primaryAction) */
    .primary-btn { --background: var(--primary); --color: var(--primary-contrast); }

    /* Selects de la toolbar: fondo + borde visibles (como el buscador y la pastilla de fechas) para
     * que se distingan como controles en claro y oscuro (sin fondo eran invisibles en dark). */
    .tk-cols { min-width: 6.5rem; max-width: 9rem; min-height: 38px; font-size: 13px; background: var(--background); color: var(--color); border: 1px solid var(--control-border); border-radius: 10px; --padding-start: 0.6rem; --padding-end: 0.4rem; --padding-top: 0.3rem; --padding-bottom: 0.3rem; }
    .vsep { width: 1px; align-self: stretch; background: var(--border-color); margin: 0.3rem 0.25rem; }

    /* Selector de filas/página en la toolbar (consolidado) */
    /* max-width: ion-select es display:block (sin core.css el host estira a la
     * línea entera cuando .bar-end hace wrap) — se capa como .tk-cols. */
    .tk-psize { min-width: 4.25rem; max-width: 5.5rem; min-height: 38px; font-size: 13px; background: var(--background); color: var(--color); border: 1px solid var(--control-border); border-radius: 10px; --padding-start: 0.6rem; --padding-end: 0.4rem; --padding-top: 0.35rem; --padding-bottom: 0.35rem; }

    /* Filtros EN LÍNEA en la toolbar (select / rango de fechas) */
    .tk-filter { min-width: 8.5rem; max-width: 13rem; min-height: 38px; font-size: 13px; background: var(--background); color: var(--color); border: 1px solid var(--control-border); border-radius: 10px; --padding-start: 0.7rem; --padding-end: 0.5rem; --padding-top: 0.35rem; --padding-bottom: 0.35rem; }
    .tk-daterange { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.6rem; min-height: 38px; border: 1px solid var(--control-border); border-radius: 10px; background: var(--background); color: var(--color-muted); font-size: 13px; }
    .tk-daterange ion-icon { font-size: 15px; flex: 0 0 auto; }
    .tk-daterange ion-input { --background: transparent; --padding-start: 0; --padding-end: 0; --padding-top: 2px; --padding-bottom: 2px; --color: var(--color); min-height: 26px; width: 6.8rem; font-size: 13px; }
    .tk-daterange .arr { color: var(--color-muted); }

    /* Barra contextual de selección */
    .selbar { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.7rem; border-radius: 10px;
      font-size: 13px; color: var(--primary);
      background: color-mix(in srgb, var(--primary) 12%, transparent); }
    .selbar .sel-clear { margin-left: auto; display: inline-flex; align-items: center; gap: 0.25rem; cursor: pointer; font-weight: 500; color: inherit; background: none; border: 0; font: inherit; }
    .selbar .sel-clear:hover { text-decoration: underline; }

    /* Acordeones (alta / filtros en modo tarjetas) */
    .panel { padding: 0.85rem 1rem; border-bottom: 1px solid var(--border-color); background: var(--header-background); }
    .filters-panel { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.6rem; }

    /* ── Vista lista en CSS GRID (no <table>): permite ancho por columna ──────────────────── */
    .scroll { overflow-x: auto; }
    .grid { min-width: max-content; font-size: 14px; }
    .grow { display: grid; align-items: center; gap: 0.5rem; padding: 0 1rem; }
    .ghead { position: sticky; top: 0; z-index: 2; border-bottom: 1px solid var(--border-color);
      background: var(--header-background); padding-top: 0.55rem; padding-bottom: 0.55rem; }
    .gcell { display: flex; align-items: center; min-width: 0; }
    .gcell > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .gcell.right { justify-content: flex-end; text-align: right; }
    .gcell.center { justify-content: center; text-align: center; }
    .gh { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-muted); }
    .gh.sortable { cursor: pointer; user-select: none; white-space: nowrap; transition: background-color var(--ok-transition, 150ms ease), color var(--ok-transition, 150ms ease), box-shadow var(--ok-transition, 150ms ease), transform 120ms ease; }
    @media (hover: hover) {
      .gh.sortable:hover { color: var(--color); }
    }
    /* Caret de orden (3 estados, icono Ionic): neutral atenuado / activo en color primario. */
    .caret { display: inline-flex; align-items: center; margin-left: 0.25rem; flex: 0 0 auto; font-size: 13px; opacity: 0.3; }
    .caret.on { opacity: 1; color: var(--primary); }
    .grow-data { border-bottom: 1px solid var(--border-color-soft); padding-top: 0.6rem; padding-bottom: 0.6rem; transition: background-color var(--ok-transition, 150ms ease), color var(--ok-transition, 150ms ease), box-shadow var(--ok-transition, 150ms ease), transform 120ms ease; }
    .grow-data:last-child { border-bottom: 0; }
    @media (hover: hover) {
      .grow-data:hover { background: var(--row-hover); }
    }
    .grow-data:active { transform: scale(0.995); }
    .grow-data.selected { background: color-mix(in srgb, var(--primary) 10%, transparent); }
    .selcb { display: flex; align-items: center; justify-content: center; }
    .filters-grow { padding-top: 0.4rem; padding-bottom: 0.6rem; }
    .filters-grow input, .filters-grow select { width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; padding: 0.3rem 0.4rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--background); color: var(--color); }
    .range { display: flex; gap: 0.25rem; }

    /* ── Vista tarjetas ──────────────────────────────────────────────────────────────────── */
    /* Cada tarjeta mide SU contenido (no se estira al alto de la fila ni del contenedor):
       - grid-auto-rows: max-content → cada fila implícita = alto de su contenido. CLAVE: sin esto,
         en modo fill (grid de alto fijo + align-content:start) cuando las tarjetas no caben el
         navegador encoge los tracks de fila y las tarjetas se solapan.
       - align-content: start → empaqueta las filas arriba (no reparte el hueco sobrante estirando).
       - align-items: start → en una fila multi-columna cada tarjeta mide su propio contenido.
       En modo fill el grid es flex-child con overflow:auto → cuando las tarjetas no caben aparece el
       scroll DENTRO de la tabla (no crece hacia fuera). */
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 0.75rem; padding: 1rem; grid-auto-rows: max-content; align-content: start; align-items: start; }
    /* Tarjeta = ion-card NATIVO de Ionic: su fondo, radio, elevación y padding son los de Ionic y NO
       se sobrescriben. Aquí solo se ajusta lo que el contexto de rejilla exige (margin) y los huecos
       que Ionic no trae (cabecera en fila, filas clave-valor, barra de acciones, resalte de selección). */
    ion-card.rcard { margin: 0; } /* la rejilla aporta el gap → sin esto el margin por defecto de ion-card lo duplica */
    ion-card.rcard.selected { outline: 2px solid var(--primary); outline-offset: -2px; }
    @media (prefers-reduced-motion: reduce) {
      .gh.sortable:hover, .gh.sortable:active,
      .grow-data:hover, .grow-data:active { transform: none; }
    }
    /* Cabecera: ion-card-header en fila (icono + título + checkbox); se conserva su padding Ionic. */
    ion-card-header.rcard-head { display: flex; align-items: center; gap: 0.5rem; }
    .rcard-head .rc-icon { display: inline-flex; color: var(--primary); }
    .rcard-head .rc-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    /* Cuerpo: ion-card-content (padding Ionic por defecto) con las filas clave-valor apiladas. */
    ion-card-content.rcard-body { display: flex; flex-direction: column; gap: 0.4rem; }
    .rrow { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 13px; }
    .rrow .rk { color: var(--color-muted); }
    .rrow .rv { font-weight: 500; text-align: right; color: var(--color); }
    /* Barra de acciones (Ionic no trae "card actions"): pie alineado a la derecha, fondo transparente. */
    .ractions { display: flex; justify-content: flex-end; gap: 0.25rem; padding: 0 0.5rem 0.5rem; }

    /* ── Estado vacío ────────────────────────────────────────────────────────────────────── */
    .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; padding: 3.5rem 1rem; text-align: center; color: var(--color-muted); }
    .empty .empty-ic { display: grid; place-items: center; width: 3.25rem; height: 3.25rem; border-radius: 999px; background: var(--header-background); font-size: 26px; }

    .actions { display: flex; gap: 0.25rem; justify-content: flex-end; }
    /* Spinner de acción en curso (loading): contenido dentro del ion-button small (Ionic lo fija
     * a 28px en el :host, por eso width/height y no font-size). Cubre tabla y tarjetas: los
     * botones de fila siempre van dentro de .actions. */
    .actions ion-spinner { width: 18px; height: 18px; }

    /* ── Pie: contador + paginación ──────────────────────────────────────────────────────── */
    .pager { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.55rem 1rem; border-top: 1px solid var(--border-color); background: var(--header-background); font-size: 12.5px; color: var(--color-muted); }
    .pager .left { display: flex; align-items: center; gap: 0.6rem; }
    .pager .strong { font-weight: 600; color: var(--color); }
    .psize { font: inherit; font-size: 12.5px; padding: 0.2rem 0.35rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--background); color: var(--color); }
    .pager .nav { display: flex; align-items: center; gap: 0.2rem; }
    .pager .nav .pp { font-weight: 600; color: var(--color); padding: 0 0.25rem; }
    /* Pager numerado: botón por página + «…» en los saltos (look del Hub). */
    .pnum { min-width: 1.75rem; height: 1.75rem; padding: 0 0.4rem; border: 1px solid transparent; border-radius: 8px; background: none; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--color); cursor: pointer; transition: background 0.12s, border-color 0.12s; }
    .pnum:hover { background: var(--row-hover); }
    .pnum.on { background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary); border-color: color-mix(in srgb, var(--primary) 40%, transparent); }
    .pgap { padding: 0 0.15rem; color: var(--color-muted); }
    ion-button { --box-shadow: none; }
  `;
  }
  // ── i18n: textos efectivos (default inglés ← overrides de `.labels`) ──────────────────────
  get t() {
    return { ...DEFAULT_LABELS4, ...this.labels };
  }
  /** Placeholder efectivo del buscador (prop explícita → label i18n → default inglés). */
  get effSearchPlaceholder() {
    return this.searchPlaceholder ?? this.t.search;
  }
  /** Mensaje efectivo de estado vacío (prop explícita → label i18n → default inglés). */
  get effEmptyMessage() {
    return this.emptyMessage ?? this.t.empty;
  }
  // ── Resolución de alias (compat + documentados) ──────────────────────────────────────────
  get effPageSizes() {
    return this.pageSizes ?? this.pageSizeOptions;
  }
  get effColumnPicker() {
    return this.columnPicker || this.columnSelector;
  }
  get effExport() {
    return this.csv || this.exportable;
  }
  get effImport() {
    return this.csv || this.importable;
  }
  /** ¿Está habilitado el conmutador de vista lista/tarjetas? */
  get viewToggle() {
    if (Array.isArray(this.views)) return this.views.length > 1;
    return this.views === true;
  }
  /** ¿Está disponible la vista tarjetas? (presente en `views` o `views === true`). */
  get cardViewEnabled() {
    if (Array.isArray(this.views)) return this.views.some((v3) => v3 === "cards" || v3 === "card");
    return this.views === true;
  }
  /** Columnas actualmente visibles (respeta el column chooser). */
  get visibleColumns() {
    return this.hiddenKeys.size ? this.columns.filter((c5) => !this.hiddenKeys.has(c5.key)) : this.columns;
  }
  setVisibleColumns(keys) {
    const visible = new Set(keys);
    this.hiddenKeys = new Set(this.columns.map((c5) => c5.key).filter((k2) => !visible.has(k2)));
    this.emit("columnsChange", { visible: keys });
  }
  // ── Selección ─────────────────────────────────────────────────────────────────────────────
  keyOf(row) {
    if (typeof this.rowKey === "function") return String(this.rowKey(row) ?? "");
    if (typeof this.rowKey === "string") return String(row[this.rowKey] ?? "");
    return String(row[this.rowKeyField] ?? "");
  }
  get selection() {
    return this.selectedKeys ?? this.internalSelection;
  }
  setSelection(next) {
    if (!this.selectedKeys) this.internalSelection = next;
    this.emit("selectionChange", { keys: [...next] });
    this.requestUpdate();
  }
  toggleRow(key) {
    const next = new Set(this.selection);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.setSelection(next);
  }
  toggleAll(visible) {
    const keys = visible.map((r6) => this.keyOf(r6));
    const allOn = keys.length > 0 && keys.every((k2) => this.selection.has(k2));
    const next = new Set(this.selection);
    if (allOn) keys.forEach((k2) => next.delete(k2));
    else keys.forEach((k2) => next.add(k2));
    this.setSelection(next);
  }
  // ── CSV ─────────────────────────────────────────────────────────────────────────────────────
  csvEscape(v3) {
    const s5 = v3 === null || v3 === void 0 ? "" : String(v3);
    return /[",\n\r]/.test(s5) ? `"${s5.replace(/"/g, '""')}"` : s5;
  }
  /** Exporta las filas a CSV (cabeceras = column.key). Si no hay filas, exporta solo la estructura. */
  exportCsv() {
    const cols = this.columns;
    const head = cols.map((c5) => this.csvEscape(c5.key)).join(",");
    const lines = this.rows.map((r6) => cols.map((c5) => this.csvEscape(r6[c5.key])).join(","));
    const csv = [head, ...lines].join("\r\n");
    const blob = new Blob([CSV_BOM + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a3 = document.createElement("a");
    a3.href = url;
    a3.download = this.csvName;
    a3.click();
    URL.revokeObjectURL(url);
    this.emit("csvExport", { rows: this.rows.length });
    this.emit("export", { rows: this.rows.length });
  }
  parseCsv(text) {
    const out = [];
    let row = [];
    let field = "";
    let q = false;
    for (let i7 = 0; i7 < text.length; i7++) {
      const c5 = text[i7];
      if (q) {
        if (c5 === '"') {
          if (text[i7 + 1] === '"') {
            field += '"';
            i7++;
          } else q = false;
        } else field += c5;
      } else if (c5 === '"') q = true;
      else if (c5 === ",") {
        row.push(field);
        field = "";
      } else if (c5 === "\n" || c5 === "\r") {
        if (c5 === "\r" && text[i7 + 1] === "\n") i7++;
        row.push(field);
        field = "";
        if (row.length > 1 || row[0] !== "") out.push(row);
        row = [];
      } else field += c5;
    }
    if (field !== "" || row.length) {
      row.push(field);
      out.push(row);
    }
    const headers = out.shift() ?? [];
    const rows4 = out.map((r6) => Object.fromEntries(headers.map((h4, i7) => [h4, r6[i7] ?? ""])));
    return { headers, rows: rows4 };
  }
  async onImportFile(ev) {
    const input = ev.target;
    const file = input.files?.[0];
    if (!file) return;
    const text = decodeCsvBuffer(await file.arrayBuffer());
    const { headers, rows: rows4 } = this.parseCsv(text);
    this.emit("csvImport", { headers, rows: rows4 });
    this.emit("import", { headers, rows: rows4 });
    input.value = "";
  }
  toggle(p4) {
    if (p4 === "filters" && this.panel !== "filters") {
      this.filterDraft = this.cloneFilters(this.clientFilters);
    }
    this.panel = this.panel === p4 ? "none" : p4;
  }
  // ── Filtros en memoria (modo cliente): borrador → aplicar. ───────────────────────────────────
  cloneFilters(src) {
    const out = {};
    for (const [k2, f3] of Object.entries(src)) {
      out[k2] = { values: f3.values ? new Set(f3.values) : void 0, from: f3.from, to: f3.to };
    }
    return out;
  }
  // Fija el conjunto de valores seleccionados de una columna (multi-select del drawer = ion-select).
  setFilterValues(key, values) {
    const next = this.cloneFilters(this.filterDraft);
    const clean = (values ?? []).filter((v3) => v3 != null && v3 !== "");
    if (clean.length) next[key] = { ...next[key], values: new Set(clean) };
    else next[key] = { ...next[key], values: void 0 };
    this.filterDraft = next;
  }
  setFilterRange(key, edge, value) {
    const next = this.cloneFilters(this.filterDraft);
    next[key] = { ...next[key], [edge]: value };
    this.filterDraft = next;
  }
  applyFilters() {
    const clean = {};
    for (const [k2, f3] of Object.entries(this.filterDraft)) {
      if (f3.values && f3.values.size > 0 || f3.from || f3.to) clean[k2] = f3;
    }
    this.clientFilters = clean;
    this.clientPage = 0;
    this.panel = "none";
    this.emit("filterChange", { filters: this.serializeFilters(clean) });
  }
  clearFilters() {
    this.filterDraft = {};
  }
  serializeFilters(src) {
    const out = {};
    for (const [k2, f3] of Object.entries(src)) {
      if (f3.values && f3.values.size > 0) out[k2] = [...f3.values];
      else if (f3.from || f3.to) out[k2] = { from: f3.from ?? "", to: f3.to ?? "" };
    }
    return out;
  }
  /** Abre el panel lateral (API pública para el módulo, p.ej. "editar" abre el form pre-rellenado). */
  open(panel = "create") {
    this.panel = panel;
  }
  /** Cierra el panel lateral. */
  close() {
    this.panel = "none";
  }
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
  get hasSearch() {
    return this.searchable || this.searchKeys.length > 0;
  }
  /** Columnas filtrables (con control en el panel de filtros). En cliente y en servidor. */
  get filterColumns() {
    return this.columns.filter((c5) => c5.filterable);
  }
  /** ¿Hay que mostrar el botón de Filtros? (cualquier columna filtrable). */
  get hasFilterRow() {
    return this.filterColumns.length > 0;
  }
  /** Nº de filtros activos (modo cliente) → badge del botón Filtros. */
  get activeFilterCount() {
    return Object.values(this.clientFilters).filter(
      (f3) => f3.values && f3.values.size > 0 || f3.from || f3.to
    ).length;
  }
  /** Valor crudo de una columna para ordenar/filtrar (usa format si lo hay, si no row[key]). */
  rawValue(col, row) {
    if (col.format) return col.format(row);
    return row[col.key];
  }
  /** Valores distintos de una columna (para los chips del filtro multi-select). */
  distinctValues(col) {
    const set = /* @__PURE__ */ new Set();
    for (const row of this.rows) {
      const v3 = this.rawValue(col, row);
      if (v3 != null && v3 !== "") set.add(String(v3));
    }
    return [...set].sort((a3, b3) => a3.localeCompare(b3));
  }
  /** Filas tras buscar + filtrar + ordenar EN MEMORIA (solo modo cliente). */
  get clientFiltered() {
    let result = this.rows;
    const needle = this.q.trim().toLowerCase();
    if (needle && this.searchKeys.length) {
      result = result.filter(
        (r6) => this.searchKeys.some((k2) => String(r6[k2] ?? "").toLowerCase().includes(needle))
      );
    }
    const fkeys = Object.keys(this.clientFilters);
    if (fkeys.length) {
      result = result.filter(
        (row) => fkeys.every((key) => {
          const f3 = this.clientFilters[key];
          const col = this.columns.find((c5) => c5.key === key);
          if (!col) return true;
          if (f3.values && f3.values.size > 0) {
            return f3.values.has(String(this.rawValue(col, row) ?? ""));
          }
          if (f3.from || f3.to) {
            const raw = this.rawValue(col, row);
            const t7 = raw == null ? NaN : new Date(raw).getTime();
            const from = f3.from ? new Date(f3.from).getTime() : -Infinity;
            const to = f3.to ? new Date(f3.to).getTime() + 864e5 - 1 : Infinity;
            return !Number.isNaN(t7) && t7 >= from && t7 <= to;
          }
          return true;
        })
      );
    }
    if (this.clientSort) {
      const col = this.columns.find((c5) => c5.key === this.clientSort);
      if (col) {
        const dir = this.clientSortDir === "asc" ? 1 : -1;
        result = [...result].sort((a3, b3) => {
          const va = this.rawValue(col, a3);
          const vb = this.rawValue(col, b3);
          if (va == null) return 1;
          if (vb == null) return -1;
          if (va < vb) return -1 * dir;
          if (va > vb) return 1 * dir;
          return 0;
        });
      }
    }
    return result;
  }
  cell(col, row) {
    if (col.format) return col.format(row);
    const v3 = row[col.key];
    return v3 === null || v3 === void 0 ? "" : String(v3);
  }
  /** ¿Es ordenable la columna? Servidor: opt-in (`sortable`). Cliente: por defecto SÍ (como el Hub),
   *  salvo `sortable: false` explícito. */
  isSortable(col) {
    return this.serverSide ? !!col.sortable : col.sortable !== false;
  }
  onHeaderClick(col) {
    if (!this.isSortable(col)) return;
    if (this.serverSide) {
      const dir = this.sort === col.key && this.sortDir === "asc" ? "desc" : "asc";
      this.emit("sortChange", { sort: col.key, dir });
      return;
    }
    if (this.clientSort === col.key) {
      this.clientSortDir = this.clientSortDir === "asc" ? "desc" : "asc";
    } else {
      this.clientSort = col.key;
      this.clientSortDir = "asc";
    }
  }
  onFilterInput(col, ev) {
    const value = ev.target.value ?? "";
    this.emit("filterChange", { col: col.key, value });
  }
  onRangeInput(col, edge, ev) {
    const raw = ev.target.value ?? "";
    const v3 = raw === "" ? "" : Number(raw);
    this.emit("filterChange", { col: col.key, value: { [edge]: v3 } });
  }
  onDateRangeInput(col, edge, ev) {
    const v3 = ev.target.value ?? "";
    this.emit("filterChange", { col: col.key, value: { [edge]: v3 } });
  }
  // ── Filtros EN LÍNEA (toolbar) ────────────────────────────────────────────────────────────
  // En modo cliente escriben directamente `clientFilters` (filtran en memoria); en servidor solo
  // emiten `filterChange`. Reutilizan la misma forma de filtro que el drawer (values / from / to).
  setClientFilter(key, patch) {
    const next = { ...this.clientFilters };
    const merged = { ...next[key], ...patch };
    const empty = (!merged.values || merged.values.size === 0) && !merged.from && !merged.to;
    if (empty) delete next[key];
    else next[key] = merged;
    this.clientFilters = next;
    this.clientPage = 0;
  }
  // ion-select (select/multiselect) del panel de filtros (renderFilterControl). En servidor emite
  // `filterChange`; en cliente escribe `clientFilters` (multiselect ⇒ filtra por inclusión).
  onFilterSelect(col, value, multi) {
    if (this.serverSide) {
      this.emit("filterChange", { col: col.key, value: value ?? (multi ? [] : "") });
      return;
    }
    if (multi) {
      const arr = Array.isArray(value) ? value.map((v3) => String(v3)) : value != null && value !== "" ? [String(value)] : [];
      this.setClientFilter(col.key, { values: arr.length ? new Set(arr) : void 0 });
    } else {
      const v3 = String(value ?? "");
      this.setClientFilter(col.key, { values: v3 ? /* @__PURE__ */ new Set([v3]) : void 0 });
    }
  }
  onInlineRange(col, edge, ev) {
    const v3 = ev.target.value ?? "";
    if (this.serverSide) {
      this.emit("filterChange", { col: col.key, value: { [edge]: v3 } });
      return;
    }
    this.setClientFilter(col.key, { [edge]: v3 || void 0 });
  }
  // Menú overflow: ancla el popover al botón vía el evento de click (compatible con Shadow DOM).
  openMenu(ev) {
    this.menuEv = ev;
    this.menuOpen = true;
  }
  // Aplica la vista inicial declarada (`default-view`) una sola vez, tras el primer render. Es la
  // forma robusta de arrancar en tarjetas sin depender de fijar `viewMode` por referencia (que
  // falla si la tabla monta detrás de un `v-if`/loading y el ref aún es null).
  firstUpdated() {
    if (this.defaultView === "cards" && this.cardViewEnabled) this.viewMode = "cards";
    else if (this.defaultView === "table") this.viewMode = "table";
  }
  setViewMode(mode) {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    this.emit("viewChange", mode);
  }
  // Control de filtro de una columna, con componentes Ionic (mismos inputs que el form de alta).
  renderFilterControl(col) {
    if (!col.filterable) return A;
    const type = col.filterType ?? "text";
    if (type === "select" || type === "multiselect") {
      const multi = type === "multiselect";
      const opts = col.options ?? this.distinctValues(col).map((v3) => ({ value: v3, label: v3 }));
      return b2`
        <ion-select
          label=${col.header}
          label-placement="stacked"
          fill="outline"
          ?multiple=${multi}
          interface="modal"
          .interfaceOptions=${{ cssClass: "ok-overlay" }}
          placeholder=${this.t.select}
          @ionChange=${(e6) => this.onFilterSelect(col, e6.detail.value, multi)}
        >
          ${multi ? A : b2`<ion-select-option value="">${this.t.select}</ion-select-option>`}
          ${opts.map((o7) => b2`<ion-select-option value=${o7.value}>${o7.label}</ion-select-option>`)}
        </ion-select>
      `;
    }
    if (type === "range" || type === "daterange") {
      const t7 = type === "daterange" ? "date" : "number";
      const onEdge = type === "daterange" ? this.onDateRangeInput.bind(this) : this.onRangeInput.bind(this);
      return b2`
        <div class="fblock">
          <span class="flabel">${col.header}</span>
          <div class="frange">
            <ion-input type=${t7} fill="outline" placeholder=${type === "daterange" ? this.t.from : this.t.gte}
              @ionInput=${(e6) => onEdge(col, "from", e6)}></ion-input>
            <ion-input type=${t7} fill="outline" placeholder=${type === "daterange" ? this.t.to : this.t.lte}
              @ionInput=${(e6) => onEdge(col, "to", e6)}></ion-input>
          </div>
        </div>
      `;
    }
    const inputType = type === "number" ? "number" : type === "date" ? "date" : "text";
    return b2`
      <ion-input
        type=${inputType}
        fill="outline"
        label=${col.header}
        label-placement="stacked"
        placeholder=${this.t.filterPlaceholder}
        @ionInput=${(e6) => this.onFilterInput(col, e6)}
      ></ion-input>
    `;
  }
  // Controles de filtro COMPACTOS para la toolbar (modo `inlineFilters`). Solo select y rango de
  // fechas (los del screenshot); el resto de tipos siguen disponibles vía el drawer si no se activa
  // `inlineFilters`. Look: «Todos los Estados» (placeholder) / «01/10/25 → 18/10/25».
  renderInlineFilters() {
    const cols = this.filterColumns.filter((c5) => {
      const t7 = c5.filterType ?? "text";
      return t7 === "select" || t7 === "multiselect" || t7 === "date" || t7 === "daterange";
    });
    if (!cols.length) return A;
    return b2`${cols.map((c5) => this.renderInlineFilter(c5))}`;
  }
  renderInlineFilter(col) {
    const type = col.filterType ?? "text";
    const f3 = this.clientFilters[col.key];
    if (type === "select" || type === "multiselect") {
      const multi = type === "multiselect";
      const opts = col.options ?? this.distinctValues(col).map((v3) => ({ value: v3, label: v3 }));
      const current = multi ? [...f3?.values ?? /* @__PURE__ */ new Set()] : f3?.values && f3.values.size ? [...f3.values][0] : "";
      return b2`
        <ion-select
          class="tk-filter"
          ?multiple=${multi}
          interface="modal"
          .interfaceOptions=${{ cssClass: "ok-overlay" }}
          aria-label=${col.header}
          placeholder=${col.header}
          .value=${current}
          @ionChange=${(e6) => this.onFilterSelect(col, e6.detail.value, multi)}
        >
          ${multi ? A : b2`<ion-select-option value="">${col.header}</ion-select-option>`}
          ${opts.map((o7) => b2`<ion-select-option value=${o7.value}>${o7.label}</ion-select-option>`)}
        </ion-select>
      `;
    }
    return b2`
      <span class="tk-daterange" role="group" aria-label=${col.header}>
        <ion-icon .icon=${iconCalendarOutline}></ion-icon>
        <ion-input type="date" aria-label=${this.t.fromOf.replace("{label}", col.header)} .value=${f3?.from ?? ""} @ionChange=${(e6) => this.onInlineRange(col, "from", e6)}></ion-input>
        <span class="arr">→</span>
        <ion-input type="date" aria-label=${this.t.toOf.replace("{label}", col.header)} .value=${f3?.to ?? ""} @ionChange=${(e6) => this.onInlineRange(col, "to", e6)}></ion-input>
      </span>
    `;
  }
  // Menú overflow («⋮») con ion-popover anclado por evento (Shadow-DOM-safe).
  renderOverflowMenu() {
    if (!this.menuActions.length) return A;
    return b2`
      <ion-button class="toolbtn" fill="clear" aria-label=${this.t.moreActions} @click=${(e6) => this.openMenu(e6)}>
        <ion-icon slot="icon-only" .icon=${iconEllipsisVertical}></ion-icon>
      </ion-button>
      <ion-popover
        .isOpen=${this.menuOpen}
        .event=${this.menuEv}
        dismiss-on-select="true"
        @didDismiss=${() => this.menuOpen = false}
      >
        <ion-content>
          <ion-list lines="none">
            ${this.menuActions.map(
      (a3) => b2`
                <ion-item button .detail=${false} @click=${() => {
        this.menuOpen = false;
        this.emit("menuAction", { actionId: a3.id });
      }}>
                  ${a3.icon ? b2`<ion-icon slot="start" .icon=${okIcon(a3.icon)} color=${a3.color ?? A}></ion-icon>` : A}
                  <ion-label color=${a3.color ?? A}>${a3.label}</ion-label>
                </ion-item>
              `
    )}
          </ion-list>
        </ion-content>
      </ion-popover>
    `;
  }
  // Botones de acción de una fila (compartido por vista tabla y tarjetas).
  actionButtons(row) {
    if (!this.actions.length) return A;
    return b2`
      <div class="actions">
        ${this.actions.map(
      (a3) => {
        const loading = a3.loading?.(row) === true;
        const disabled = loading || a3.disabled?.(row) === true;
        return b2`
            <ion-button
              size="small"
              fill="clear"
              color=${a3.color ?? "medium"}
              ?disabled=${disabled}
              aria-disabled=${disabled ? "true" : A}
              @click=${() => this.emit("rowAction", { actionId: a3.id, row })}
            >
              ${loading ? b2`<ion-spinner slot="icon-only" name="dots"></ion-spinner>` : a3.icon ? b2`<ion-icon slot="icon-only" .icon=${okIcon(a3.icon)}></ion-icon>` : a3.label}
            </ion-button>
          `;
      }
    )}
      </div>
    `;
  }
  // Botón de barra icon-only (filtros / alta / conmutador de vista). `on` = estado activo.
  // `badge` opcional → contador (p.ej. nº de filtros activos), look del Hub.
  toolButton(icon, on, onClick, label, badge) {
    return b2`
      <ion-button class="toolbtn" size="small" fill=${on ? "solid" : "outline"} title=${label} aria-label=${label} @click=${onClick}>
        <ion-icon slot="icon-only" .icon=${okIcon(icon)}></ion-icon>
        ${badge && badge > 0 ? b2`<span class="badge">${badge}</span>` : A}
      </ion-button>
    `;
  }
  /** Plantilla de columnas del grid de la vista lista: [checkbox] [columnas…] [acciones]. */
  gridTemplate() {
    return [
      this.selectable ? "2.75rem" : null,
      ...this.visibleColumns.map((c5) => c5.width ?? "minmax(8rem,1fr)"),
      this.actions.length ? "auto" : null
    ].filter(Boolean).join(" ");
  }
  /** Lista de páginas a mostrar en el pager numerado (1-based): primera, última, vecinas de la
   *  actual y «…» donde haya saltos. P.ej. en página 1 de 52 → [1,2,3,'…',52]. */
  pageList(cur1, total) {
    if (total <= 7) return Array.from({ length: total }, (_2, i7) => i7 + 1);
    const want = /* @__PURE__ */ new Set([1, total, cur1, cur1 - 1, cur1 + 1]);
    if (cur1 <= 3) [2, 3].forEach((p4) => want.add(p4));
    if (cur1 >= total - 2) [total - 1, total - 2].forEach((p4) => want.add(p4));
    const sorted = [...want].filter((p4) => p4 >= 1 && p4 <= total).sort((a3, b3) => a3 - b3);
    const out = [];
    let prev = 0;
    for (const p4 of sorted) {
      if (p4 - prev > 1) out.push("\u2026");
      out.push(p4);
      prev = p4;
    }
    return out;
  }
  render() {
    const ps = this.serverSide ? this.pageSize : this.clientPageSize || this.pageSize;
    let visible;
    let pages;
    let current;
    let count;
    if (this.serverSide) {
      visible = this.rows;
      count = this.total;
      pages = Math.max(1, Math.ceil(this.total / ps));
      current = Math.min(this.page, pages - 1);
    } else {
      const filtered = this.clientFiltered;
      count = filtered.length;
      pages = Math.max(1, Math.ceil(filtered.length / ps));
      current = Math.min(this.clientPage, pages - 1);
      visible = filtered.slice(current * ps, current * ps + ps);
    }
    const goTo = (p4) => {
      if (this.serverSide) this.emit("pageChange", p4);
      else this.clientPage = p4;
    };
    const setPageSize = (n6) => {
      if (this.serverSide) this.emit("pageSizeChange", n6);
      else {
        this.clientPageSize = n6;
        this.clientPage = 0;
      }
    };
    const searchbar = this.serverSide ? b2`<ion-searchbar class="ion-no-border" placeholder=${this.effSearchPlaceholder} debounce="250" @ionInput=${this.onSearch}></ion-searchbar>` : b2`<ion-searchbar class="ion-no-border" .value=${this.q} placeholder=${this.effSearchPlaceholder} debounce="250" @ionInput=${this.onSearch}></ion-searchbar>`;
    const selCount = this.selection.size;
    const showTopbar = !!this.title || this.hasSearch || this.viewToggle || this.effColumnPicker || this.effExport || this.effImport || this.hasFilterRow || this.addable || !!this.primaryAction;
    return b2`
      <div class="card">
        ${showTopbar ? b2`
              <div class="bar">
                <div class="bar-main">
                  ${this.title ? b2`<div class="title-wrap"><h2 class="title">${this.title}</h2><span class="title-count">${count}</span></div>` : A}
                  ${this.hasSearch ? b2`<div class="search">${searchbar}</div>` : A}
                  ${this.inlineFilters ? this.renderInlineFilters() : A}
                  <span class="tk-spacer"></span>
                    ${this.effColumnPicker ? b2`
                          <ion-select
                            class="tk-cols"
                            multiple
                            interface="popover"
                            aria-label=${this.t.columnsVisible}
                            .value=${this.visibleColumns.map((c5) => c5.key)}
                            .selectedText=${this.t.columns}
                            @ionChange=${(e6) => this.setVisibleColumns(e6.detail.value)}
                          >
                            ${this.columns.map((c5) => b2`<ion-select-option value=${c5.key}>${c5.header}</ion-select-option>`)}
                          </ion-select>
                        ` : A}
                    ${this.effPageSizes.length ? b2`
                          <ion-select
                            class="tk-psize"
                            interface="popover"
                            aria-label=${this.t.rowsPerPage}
                            .value=${ps}
                            @ionChange=${(e6) => setPageSize(Number(e6.detail.value))}
                          >
                            ${this.effPageSizes.map((n6) => b2`<ion-select-option .value=${n6}>${n6}</ion-select-option>`)}
                          </ion-select>
                        ` : A}
                    ${this.viewToggle ? b2`
                          <span class="viewseg">
                            ${this.toolButton("list-outline", this.viewMode === "table", () => this.setViewMode("table"), this.t.viewList)}
                            ${this.toolButton("grid-outline", this.viewMode === "cards", () => this.setViewMode("cards"), this.t.viewCards)}
                          </span>
                        ` : A}
                    ${this.hasFilterRow && !this.inlineFilters ? this.toolButton("funnel-outline", this.panel === "filters" || this.activeFilterCount > 0, () => this.toggle("filters"), this.t.filters, this.serverSide ? void 0 : this.activeFilterCount) : A}
                    ${this.effImport ? b2`
                          ${this.toolButton("cloud-upload-outline", false, () => this.renderRoot.querySelector(".tk-file")?.click(), this.t.importCsv)}
                          <input class="tk-file" type="file" accept=".csv,text/csv" hidden @change=${(e6) => this.onImportFile(e6)} />
                        ` : A}
                    ${this.effExport ? this.toolButton("download-outline", false, () => this.exportCsv(), this.t.exportCsv) : A}
                    ${this.addable ? this.toolButton("add", this.panel === "create", () => this.toggle("create"), this.t.add) : A}
                    ${this.renderOverflowMenu()}
                    ${this.primaryAction ? b2`
                          <ion-button
                            class="primary-btn"
                            size="small"
                            title=${this.primaryAction.label}
                            aria-label=${this.primaryAction.label}
                            @click=${() => this.emit("primaryAction", {})}
                          ><ion-icon slot="icon-only" .icon=${okIcon(this.primaryAction.icon ?? "add")}></ion-icon></ion-button>
                        ` : A}
                    <!-- El módulo proyecta aquí acciones globales adicionales. -->
                    <slot name="toolbar"></slot>
                </div>
                ${this.selectable && selCount > 0 ? b2`
                      <div class="selbar">
                        <strong>${this.t.selected.replace("{n}", String(selCount))}</strong>
                        <button class="sel-clear" @click=${() => this.setSelection(/* @__PURE__ */ new Set())}>
                          <ion-icon .icon=${iconClose} style="font-size:14px"></ion-icon> ${this.t.clear}
                        </button>
                      </div>
                    ` : A}
              </div>
            ` : A}

        ${this.viewMode === "cards" && this.cardViewEnabled ? this.renderCards(visible) : this.renderTable(visible)}

        ${pages > 1 || this.effPageSizes.length ? b2`
              <div class="pager">
                <div class="left">
                  <span>
                    ${pages > 1 ? b2`${this.t.showing.replace("{from}", String(current * ps + 1)).replace("{to}", String(Math.min((current + 1) * ps, count)))} ` : A}
                    <span class="strong">${count}</span> ${count === 1 ? this.t.recordSingular : this.t.recordPlural}
                  </span>
                  ${!showTopbar && this.effPageSizes.length ? b2`
                        <select class="psize" @change=${(e6) => setPageSize(Number(e6.target.value))}>
                          ${this.effPageSizes.map((n6) => b2`<option value=${n6} ?selected=${n6 === ps}>${this.t.perPageShort.replace("{n}", String(n6))}</option>`)}
                        </select>
                      ` : A}
                </div>
                ${pages > 1 ? b2`
                      <div class="nav">
                        <ion-button size="small" fill="clear" ?disabled=${current === 0} @click=${() => goTo(current - 1)}><ion-icon slot="icon-only" .icon=${iconChevronBack}></ion-icon></ion-button>
                        ${this.pageList(current + 1, pages).map(
      (p4) => p4 === "\u2026" ? b2`<span class="pgap">…</span>` : b2`<button class=${`pnum${p4 === current + 1 ? " on" : ""}`} @click=${() => goTo(p4 - 1)}>${p4}</button>`
    )}
                        <ion-button size="small" fill="clear" ?disabled=${current >= pages - 1} @click=${() => goTo(current + 1)}><ion-icon slot="icon-only" .icon=${iconChevronForward}></ion-icon></ion-button>
                      </div>
                    ` : A}
              </div>
            ` : A}

        ${this.panel !== "none" ? this.renderDrawer() : A}
      </div>
    `;
  }
  // Panel lateral derecho DENTRO de la tabla (no empuja contenido; igual en lista y tarjetas).
  renderDrawer() {
    const isFilters = this.panel === "filters";
    const clientFilters = isFilters && !this.serverSide;
    return b2`
      <div class="tk-scrim" @click=${() => this.close()}></div>
      <aside class="drawer" role="dialog" aria-label=${isFilters ? this.t.filters : this.t.form}>
        <header class="dh">
          <strong>${isFilters ? this.t.filters : this.t.newRecord}</strong>
          <ion-button fill="clear" size="small" aria-label=${this.t.close} @click=${() => this.close()}><ion-icon slot="icon-only" .icon=${iconClose}></ion-icon></ion-button>
        </header>
        <div class="db">
          ${isFilters ? clientFilters ? this.filterColumns.map((c5) => this.renderClientFilter(c5)) : this.filterColumns.map((c5) => b2`<div class="fblock">${this.renderFilterControl(c5)}</div>`) : b2`<slot name="create"></slot>`}
        </div>
        ${clientFilters ? b2`
              <footer class="df">
                <button class="sel-clear df-clear" ?disabled=${Object.keys(this.filterDraft).length === 0} @click=${() => this.clearFilters()}>${this.t.clear}</button>
                <ion-button class="primary-btn" size="small" @click=${() => this.applyFilters()}>${this.t.apply}</ion-button>
              </footer>
            ` : A}
      </aside>
    `;
  }
  // Control de filtro CLIENTE de una columna: chips multi-select (select) o rango de fechas.
  renderClientFilter(col) {
    const label = col.header;
    if (col.filterType === "daterange" || col.filterType === "date") {
      const f3 = this.filterDraft[col.key] ?? {};
      return b2`
        <div class="fblock">
          <span class="flabel">${label}</span>
          <div class="daterange">
            <ion-input type="date" label=${this.t.from} label-placement="stacked" fill="outline" .value=${f3.from ?? ""} @ionChange=${(e6) => this.setFilterRange(col.key, "from", e6.detail.value ?? "")}></ion-input>
            <ion-input type="date" label=${this.t.to} label-placement="stacked" fill="outline" .value=${f3.to ?? ""} @ionChange=${(e6) => this.setFilterRange(col.key, "to", e6.detail.value ?? "")}></ion-input>
          </div>
        </div>
      `;
    }
    const opts = col.options ?? this.distinctValues(col).map((v3) => ({ value: v3, label: v3 }));
    const selected = [...this.filterDraft[col.key]?.values ?? /* @__PURE__ */ new Set()];
    return b2`
      <div class="fblock">
        <ion-select
          label=${label}
          label-placement="stacked"
          fill="outline"
          multiple
          interface="modal"
          .interfaceOptions=${{ cssClass: "ok-overlay" }}
          placeholder=${this.t.select}
          .value=${selected}
          @ionChange=${(e6) => this.setFilterValues(col.key, e6.detail.value ?? [])}
        >
          ${opts.length === 0 ? b2`<ion-select-option .disabled=${true} value="">${this.t.noValues}</ion-select-option>` : opts.map((o7) => b2`<ion-select-option value=${o7.value}>${o7.label}</ion-select-option>`)}
        </ion-select>
      </div>
    `;
  }
  emptyState() {
    return b2`
      <div class="empty">
        <span class="empty-ic"><ion-icon .icon=${iconFileTrayOutline}></ion-icon></span>
        <span>${this.effEmptyMessage}</span>
      </div>
    `;
  }
  // Vista LISTA en CSS GRID (no <table>): permite ancho por columna y cabecera sticky.
  renderTable(visible) {
    if (visible.length === 0) return this.emptyState();
    const cols = this.visibleColumns;
    const tpl = { gridTemplateColumns: this.gridTemplate() };
    const allOn = this.selectable && visible.length > 0 && visible.every((r6) => this.selection.has(this.keyOf(r6)));
    const alignCls = (a3) => a3 === "right" ? "right" : a3 === "center" ? "center" : "left";
    return b2`
      <div class="scroll">
        <div class="grid" role="table">
          <!-- Cabecera -->
          <div class="grow ghead" role="row" style=${o6(tpl)}>
            ${this.selectable ? b2`<span class="selcb"><ion-checkbox .checked=${allOn} aria-label=${this.t.selectAll} @ionChange=${() => this.toggleAll(visible)}></ion-checkbox></span>` : A}
            ${cols.map((c5) => {
      const sortable = this.isSortable(c5);
      const active = sortable && (this.serverSide ? this.sort === c5.key : this.clientSort === c5.key);
      const dir = this.serverSide ? this.sortDir : this.clientSortDir;
      const caretIcon = !active ? iconSwapVerticalOutline : dir === "asc" ? iconChevronUpOutline : iconChevronDownOutline;
      return b2`
                <div
                  class=${`gcell gh ${alignCls(c5.align)}${sortable ? " sortable" : ""}`}
                  role="columnheader"
                  @click=${() => this.onHeaderClick(c5)}
                >
                  <span>${c5.header}</span>
                  ${sortable ? b2`<span class=${`caret${active ? " on" : ""}`}><ion-icon .icon=${okIcon(caretIcon)}></ion-icon></span>` : A}
                </div>
              `;
    })}
            ${this.actions.length ? b2`<div class="gcell gh right" role="columnheader">${this.t.actions}</div>` : A}
          </div>

          <!-- Filas -->
          ${c4(
      visible,
      (row) => this.keyOf(row),
      (row) => {
        const key = this.keyOf(row);
        const selected = this.selectable && this.selection.has(key);
        return b2`
                <div class=${`grow grow-data${selected ? " selected" : ""}`} role="row" style=${o6(tpl)}>
                  ${this.selectable ? b2`<span class="selcb"><ion-checkbox .checked=${selected} aria-label=${this.t.selectRow} @ionChange=${() => this.toggleRow(key)}></ion-checkbox></span>` : A}
                  ${cols.map(
          (c5) => b2`<div class=${`gcell ${alignCls(c5.align)}`} role="cell">${c5.render ? c5.render(row) : b2`<span>${this.cell(c5, row)}</span>`}</div>`
        )}
                  ${this.actions.length ? b2`<div class="gcell right" role="cell">${this.actionButtons(row)}</div>` : A}
                </div>
              `;
      }
    )}
        </div>
      </div>
    `;
  }
  renderCards(visible) {
    if (visible.length === 0) return this.emptyState();
    const hasHead = !!this.cardTitle || !!this.cardIcon || this.selectable;
    return b2`
      <div class="cards-grid">
        ${c4(
      visible,
      (row) => this.keyOf(row),
      (row) => {
        const key = this.keyOf(row);
        const selected = this.selectable && this.selection.has(key);
        const icon = this.cardIcon?.(row);
        return b2`
              <ion-card class=${`rcard${selected ? " selected" : ""}`}>
                ${hasHead ? b2`
                      <ion-card-header class="rcard-head">
                        ${icon != null && icon !== "" ? b2`<span class="rc-icon">${typeof icon === "string" ? b2`<ion-icon .icon=${okIcon(icon)}></ion-icon>` : icon}</span>` : A}
                        <span class="rc-title">${this.cardTitle ? this.cardTitle(row) : A}</span>
                        ${this.selectable ? b2`<ion-checkbox .checked=${selected} aria-label=${this.t.select} @ionChange=${() => this.toggleRow(key)}></ion-checkbox>` : A}
                      </ion-card-header>
                    ` : A}
                <ion-card-content class="rcard-body">
                  ${this.renderCard ? this.renderCard(row) : this.visibleColumns.map(
          (c5) => b2`<div class="rrow"><span class="rk">${c5.header}</span><span class="rv">${c5.render ? c5.render(row) : this.cell(c5, row)}</span></div>`
        )}
                </ion-card-content>
                ${this.actions.length ? b2`<div class="ractions">${this.actionButtons(row)}</div>` : A}
              </ion-card>
            `;
      }
    )}
      </div>
    `;
  }
};
__decorateClass7([
  n4({ attribute: false })
], OkDataTable.prototype, "columns");
__decorateClass7([
  n4({ attribute: false })
], OkDataTable.prototype, "rows");
__decorateClass7([
  n4({ attribute: false })
], OkDataTable.prototype, "searchKeys");
__decorateClass7([
  n4({ attribute: "row-key-field" })
], OkDataTable.prototype, "rowKeyField");
__decorateClass7([
  n4({ attribute: false })
], OkDataTable.prototype, "rowKey");
__decorateClass7([
  n4({ type: Number, attribute: "page-size" })
], OkDataTable.prototype, "pageSize");
__decorateClass7([
  n4({ attribute: "empty-message" })
], OkDataTable.prototype, "emptyMessage");
__decorateClass7([
  n4({ attribute: "search-placeholder" })
], OkDataTable.prototype, "searchPlaceholder");
__decorateClass7([
  n4({ attribute: false })
], OkDataTable.prototype, "labels");
__decorateClass7([
  n4({ attribute: false })
], OkDataTable.prototype, "actions");
__decorateClass7([
  n4({ type: Boolean })
], OkDataTable.prototype, "addable");
__decorateClass7([
  n4({ attribute: false })
], OkDataTable.prototype, "pageSizeOptions");
__decorateClass7([
  n4({ type: Boolean, reflect: true })
], OkDataTable.prototype, "fill");
__decorateClass7([
  n4({ type: Boolean, attribute: "column-picker" })
], OkDataTable.prototype, "columnPicker");
__decorateClass7([
  n4({ type: Boolean })
], OkDataTable.prototype, "csv");
__decorateClass7([
  n4({ attribute: "csv-name" })
], OkDataTable.prototype, "csvName");
__decorateClass7([
  n4({ type: Boolean, attribute: "server-side" })
], OkDataTable.prototype, "serverSide");
__decorateClass7([
  n4({ type: Number })
], OkDataTable.prototype, "total");
__decorateClass7([
  n4({ type: Number })
], OkDataTable.prototype, "page");
__decorateClass7([
  n4({ type: Boolean })
], OkDataTable.prototype, "searchable");
__decorateClass7([
  n4({ type: String })
], OkDataTable.prototype, "sort");
__decorateClass7([
  n4({ attribute: "sort-dir" })
], OkDataTable.prototype, "sortDir");
__decorateClass7([
  n4()
], OkDataTable.prototype, "title");
__decorateClass7([
  n4({ attribute: false })
], OkDataTable.prototype, "views");
__decorateClass7([
  n4({ attribute: "default-view" })
], OkDataTable.prototype, "defaultView");
__decorateClass7([
  n4({ type: Boolean })
], OkDataTable.prototype, "exportable");
__decorateClass7([
  n4({ type: Boolean })
], OkDataTable.prototype, "importable");
__decorateClass7([
  n4({ type: Boolean, attribute: "column-selector" })
], OkDataTable.prototype, "columnSelector");
__decorateClass7([
  n4({ attribute: false })
], OkDataTable.prototype, "pageSizes");
__decorateClass7([
  n4({ type: Boolean })
], OkDataTable.prototype, "selectable");
__decorateClass7([
  n4({ attribute: false })
], OkDataTable.prototype, "selectedKeys");
__decorateClass7([
  n4({ attribute: false })
], OkDataTable.prototype, "primaryAction");
__decorateClass7([
  n4({ type: Boolean })
], OkDataTable.prototype, "inlineFilters");
__decorateClass7([
  n4({ attribute: false })
], OkDataTable.prototype, "menuActions");
__decorateClass7([
  n4({ attribute: false })
], OkDataTable.prototype, "cardTitle");
__decorateClass7([
  n4({ attribute: false })
], OkDataTable.prototype, "cardIcon");
__decorateClass7([
  n4({ attribute: false })
], OkDataTable.prototype, "renderCard");
__decorateClass7([
  r5()
], OkDataTable.prototype, "q");
__decorateClass7([
  r5()
], OkDataTable.prototype, "clientPage");
__decorateClass7([
  r5()
], OkDataTable.prototype, "clientPageSize");
__decorateClass7([
  r5()
], OkDataTable.prototype, "clientSort");
__decorateClass7([
  r5()
], OkDataTable.prototype, "clientSortDir");
__decorateClass7([
  r5()
], OkDataTable.prototype, "clientFilters");
__decorateClass7([
  r5()
], OkDataTable.prototype, "filterDraft");
__decorateClass7([
  r5()
], OkDataTable.prototype, "panel");
__decorateClass7([
  r5()
], OkDataTable.prototype, "viewMode");
__decorateClass7([
  r5()
], OkDataTable.prototype, "hiddenKeys");
__decorateClass7([
  r5()
], OkDataTable.prototype, "internalSelection");
__decorateClass7([
  r5()
], OkDataTable.prototype, "menuOpen");
define("ok-data-table", OkDataTable);

// ui/components/erp-sales-list/erp-sales-list.ts
var CATALOG4 = { es: es_default, en: en_default };
function erplora5() {
  const c5 = globalThis.erplora;
  if (!c5) throw new Error("erplora SDK no inicializado por el shell");
  return c5;
}
var ErpSalesList = class extends i3 {
  constructor() {
    super(...arguments);
    this.stats = { count: 0, total_revenue: 0, avg_ticket: 0 };
    this.statsError = "";
    this.tick = 0;
    this.onLocaleChange = () => this.requestUpdate();
  }
  static {
    this.styles = i`
    :host { display:block; font-family: system-ui, sans-serif; color: var(--ion-text-color,#1c1b18); }
    h2 { margin:0 0 .75rem; font-size:1.15rem; }
    .cards { display:flex; gap:.6rem; margin-bottom:1rem; flex-wrap:wrap; }
    .card { flex:1; min-width:8rem; padding:.7rem .9rem; border:1px solid var(--ion-border-color,#e0ddd4); border-radius:12px; }
    .card .k { color:#8b897f; font-size:.75rem; text-transform:uppercase; }
    .card .v { font-size:1.3rem; font-weight:700; }
    .err { color:#d9480f; }
  `;
  }
  // Getter (no campo): se re-evalúa en cada render, así los textos cambian con el idioma activo
  // (ADR-0055). El listener `erplora:locale-changed` re-renderiza.
  get documentActions() {
    return [
      { id: "document", label: erplora5().t(CATALOG4, "ui.actionDocument"), icon: "receipt-outline" }
    ];
  }
  get columns() {
    const t7 = (k2) => erplora5().t(CATALOG4, k2);
    return [
      { key: "sale_number", header: t7("ui.colNumber"), sortable: true, filterable: true, filterType: "text" },
      { key: "customer_name", header: t7("ui.colCustomer"), sortable: true, filterable: true, filterType: "text", format: (r6) => r6.customer_name || "\u2014" },
      { key: "payment_method_name", header: t7("ui.colPayment"), sortable: true, filterable: true, filterType: "text", format: (r6) => r6.payment_method_name || "\u2014" },
      {
        key: "status",
        header: t7("ui.colStatus"),
        sortable: true,
        filterable: true,
        filterType: "select",
        options: [
          { value: "completed", label: t7("ui.statusCompleted") },
          { value: "voided", label: t7("ui.statusVoided") }
        ]
      },
      { key: "total", header: t7("ui.colTotal"), align: "right", sortable: true, filterable: true, filterType: "range", format: (r6) => erplora5().formatMoney(Number(r6.total || 0)) }
    ];
  }
  // TODO-LIT: componentWillLoad → connectedCallback. Recuerda: connectedCallback se dispara
  // en CADA reconexión al DOM (no solo en el primer montaje). Si la init debe correr una
  // sola vez tras el primer render, considera firstUpdated() en su lugar.
  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener("erplora:locale-changed", this.onLocaleChange);
    this.ctrl = createListController(erplora5(), "sales.list", () => this.requestUpdate(), {
      pageSize: 50,
      sort: "created_at",
      dir: "desc"
    });
    await Promise.all([this.ctrl.load(), this.loadStats()]);
    try {
      this.unsub = erplora5().on("sale.completed", () => {
        this.ctrl.load();
        this.loadStats();
      });
    } catch {
    }
  }
  disconnectedCallback() {
    window.removeEventListener("erplora:locale-changed", this.onLocaleChange);
    super.disconnectedCallback();
    this.unsub?.();
  }
  async loadStats() {
    try {
      const rows4 = await erplora5().query("sales.stats");
      this.stats = rows4 && rows4[0] || { count: 0, total_revenue: 0, avg_ticket: 0 };
    } catch (e6) {
      this.statsError = e6 instanceof Error ? e6.message : erplora5().t(CATALOG4, "ui.errorStats");
    }
  }
  render() {
    const t7 = (k2) => erplora5().t(CATALOG4, k2);
    return b2`<div>
        <h2>${t7("ui.sales")}</h2>
        <div class="cards">
          <div class="card">
            <div class="k">${t7("ui.tickets")}</div>
            <div class="v">${this.stats.count}</div>
          </div>
          <div class="card">
            <div class="k">${t7("ui.revenue")}</div>
            <div class="v">${erplora5().formatMoney(Number(this.stats.total_revenue || 0))}</div>
          </div>
          <div class="card">
            <div class="k">${t7("ui.avgTicket")}</div>
            <div class="v">${erplora5().formatMoney(Number(this.stats.avg_ticket || 0))}</div>
          </div>
        </div>
        ${this.statsError ? b2`<p class="err">${this.statsError}</p>` : A}
        ${this.ctrl?.error ? b2`<p class="err">${this.ctrl.error}</p>` : A}
        <ok-data-table .serverSide=${true} .columns=${this.columns} .views=${true} .cardTitle=${(r6) => String(r6.sale_number ?? "\u2014")} .cardIcon=${() => "receipt-outline"} .rows=${this.ctrl?.rows ?? []} .total=${this.ctrl?.total ?? 0} .page=${this.ctrl?.state.page ?? 0} .pageSize=${this.ctrl?.state.pageSize ?? 50} .sort=${this.ctrl?.state.sort} .sortDir=${this.ctrl?.state.dir ?? "desc"} .searchable=${true} .searchPlaceholder=${t7("ui.searchSalePlaceholder")} .emptyMessage=${this.ctrl?.loading ? t7("ui.loading") : t7("ui.noSales")} .actions=${this.documentActions} @rowAction=${(e6) => {
      if (e6.detail.actionId === "document") this.docSaleId = e6.detail.row.id;
    }} @pageChange=${(e6) => this.ctrl.setPage(e6.detail)} @sortChange=${(e6) => this.ctrl.setSort(e6.detail.sort, e6.detail.dir)} @searchChange=${(e6) => this.ctrl.setSearch(e6.detail)} @filterChange=${(e6) => this.ctrl.setFilter(e6.detail.col, e6.detail.value)}></ok-data-table>

        ${renderDocumentModal({ saleId: this.docSaleId, onClose: () => {
      this.docSaleId = void 0;
    }, t: t7 })}
      </div>`;
  }
};
__decorateClass([
  r5()
], ErpSalesList.prototype, "stats", 2);
__decorateClass([
  r5()
], ErpSalesList.prototype, "statsError", 2);
__decorateClass([
  r5()
], ErpSalesList.prototype, "tick", 2);
__decorateClass([
  r5()
], ErpSalesList.prototype, "docSaleId", 2);
define("erp-sales-list", ErpSalesList);
