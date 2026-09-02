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

// @lit-labs/ssr-dom-shim/lib/element-internals.js
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

// @lit-labs/ssr-dom-shim/lib/events.js
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

// @lit-labs/ssr-dom-shim/lib/css.js
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

// @lit-labs/ssr-dom-shim/index.js
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
var NodeShim = class Node2 extends EventTarget {
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

// @lit/reactive-element/node/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t7, e7, o9) {
    if (this._$cssResult$ = true, o9 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t7, this.t = e7;
  }
  get styleSheet() {
    let t7 = this.o;
    const s5 = this.t;
    if (e && void 0 === t7) {
      const e7 = void 0 !== s5 && 1 === s5.length;
      e7 && (t7 = o.get(s5)), void 0 === t7 && ((this.o = t7 = new CSSStyleSheet()).replaceSync(this.cssText), e7 && o.set(s5, t7));
    }
    return t7;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t7) => new n("string" == typeof t7 ? t7 : t7 + "", void 0, s);
var i = (t7, ...e7) => {
  const o9 = 1 === t7.length ? t7[0] : e7.reduce((e8, s5, o10) => e8 + ((t8) => {
    if (true === t8._$cssResult$) return t8.cssText;
    if ("number" == typeof t8) return t8;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t8 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s5) + t7[o10 + 1], t7[0]);
  return new n(o9, t7, s);
};
var S = (s5, o9) => {
  if (e) s5.adoptedStyleSheets = o9.map((t7) => t7 instanceof CSSStyleSheet ? t7 : t7.styleSheet);
  else for (const e7 of o9) {
    const o10 = document.createElement("style"), n6 = t.litNonce;
    void 0 !== n6 && o10.setAttribute("nonce", n6), o10.textContent = e7.cssText, s5.appendChild(o10);
  }
};
var c = e || void 0 === t.CSSStyleSheet ? (t7) => t7 : (t7) => t7 instanceof CSSStyleSheet ? ((t8) => {
  let e7 = "";
  for (const s5 of t8.cssRules) e7 += s5.cssText;
  return r(e7);
})(t7) : t7;

// @lit/reactive-element/node/reactive-element.js
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
      const i7 = Symbol(), e7 = this.getPropertyDescriptor(t7, i7, s5);
      void 0 !== e7 && r2(this.prototype, t7, e7);
    }
  }
  static getPropertyDescriptor(t7, s5, i7) {
    const { get: e7, set: h4 } = o2(this.prototype, t7) ?? { get() {
      return this[s5];
    }, set(t8) {
      this[s5] = t8;
    } };
    return { get: e7, set(s6) {
      const r6 = e7?.call(this);
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
      const e7 = new Set(t7.flat(1 / 0).reverse());
      for (const t8 of e7) s5.unshift(c(t8));
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
    const i7 = this.constructor.elementProperties.get(t7), e7 = this.constructor._$Eu(t7, i7);
    if (void 0 !== e7 && true === i7.reflect) {
      const h4 = (void 0 !== i7.converter?.toAttribute ? i7.converter : b).toAttribute(s5, i7.type);
      this._$Em = t7, null == h4 ? this.removeAttribute(e7) : this.setAttribute(e7, h4), this._$Em = null;
    }
  }
  _$AK(t7, s5) {
    const i7 = this.constructor, e7 = i7._$Eh.get(t7);
    if (void 0 !== e7 && this._$Em !== e7) {
      const t8 = i7.getPropertyOptions(e7), h4 = "function" == typeof t8.converter ? { fromAttribute: t8.converter } : void 0 !== t8.converter?.fromAttribute ? t8.converter : b;
      this._$Em = e7;
      const r6 = h4.fromAttribute(s5, t8.type);
      this[e7] = r6 ?? this._$Ej?.get(e7) ?? r6, this._$Em = null;
    }
  }
  requestUpdate(t7, s5, i7, e7 = false, h4) {
    if (void 0 !== t7) {
      const r6 = this.constructor;
      if (false === e7 && (h4 = this[t7]), i7 ??= r6.getPropertyOptions(t7), !((i7.hasChanged ?? m)(h4, s5) || i7.useDefault && i7.reflect && h4 === this._$Ej?.get(t7) && !this.hasAttribute(r6._$Eu(t7, i7)))) return;
      this.C(t7, s5, i7);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t7, s5, { useDefault: i7, reflect: e7, wrapped: h4 }, r6) {
    i7 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t7) && (this._$Ej.set(t7, r6 ?? s5 ?? this[t7]), true !== h4 || void 0 !== r6) || (this._$AL.has(t7) || (this.hasUpdated || i7 || (s5 = void 0), this._$AL.set(t7, s5)), true === e7 && this._$Em !== t7 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t7));
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
        const { wrapped: t9 } = i7, e7 = this[s6];
        true !== t9 || this._$AL.has(s6) || void 0 === e7 || this.C(s6, void 0, i7, e7);
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

// lit-html/lit-html.js
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
  const s5 = t7.length - 1, e7 = [];
  let n6, l3 = 2 === i7 ? "<svg>" : 3 === i7 ? "<math>" : "", c5 = v;
  for (let i8 = 0; i8 < s5; i8++) {
    const s6 = t7[i8];
    let a3, u5, d3 = -1, f3 = 0;
    for (; f3 < s6.length && (c5.lastIndex = f3, u5 = c5.exec(s6), null !== u5); ) f3 = c5.lastIndex, c5 === v ? "!--" === u5[1] ? c5 = _ : void 0 !== u5[1] ? c5 = m2 : void 0 !== u5[2] ? (y2.test(u5[2]) && (n6 = RegExp("</" + u5[2], "g")), c5 = p2) : void 0 !== u5[3] && (c5 = p2) : c5 === p2 ? ">" === u5[0] ? (c5 = n6 ?? v, d3 = -1) : void 0 === u5[1] ? d3 = -2 : (d3 = c5.lastIndex - u5[2].length, a3 = u5[1], c5 = void 0 === u5[3] ? p2 : '"' === u5[3] ? $ : g2) : c5 === $ || c5 === g2 ? c5 = p2 : c5 === _ || c5 === m2 ? c5 = v : (c5 = p2, n6 = void 0);
    const x2 = c5 === p2 && t7[i8 + 1].startsWith("/>") ? " " : "";
    l3 += c5 === v ? s6 + r3 : d3 >= 0 ? (e7.push(a3), s6.slice(0, d3) + h2 + s6.slice(d3) + o3 + x2) : s6 + o3 + (-2 === d3 ? i8 : x2);
  }
  return [V(t7, l3 + (t7[s5] || "<?>") + (2 === i7 ? "</svg>" : 3 === i7 ? "</math>" : "")), e7];
};
var S2 = class _S {
  constructor({ strings: t7, _$litType$: i7 }, e7) {
    let r6;
    this.parts = [];
    let l3 = 0, a3 = 0;
    const u5 = t7.length - 1, d3 = this.parts, [f3, v3] = N(t7, i7);
    if (this.el = _S.createElement(f3, e7), P.currentNode = this.el.content, 2 === i7 || 3 === i7) {
      const t8 = this.el.content.firstChild;
      t8.replaceWith(...t8.childNodes);
    }
    for (; null !== (r6 = P.nextNode()) && d3.length < u5; ) {
      if (1 === r6.nodeType) {
        if (r6.hasAttributes()) for (const t8 of r6.getAttributeNames()) if (t8.endsWith(h2)) {
          const i8 = v3[a3++], s5 = r6.getAttribute(t8).split(o3), e8 = /([.?@])?(.*)/.exec(i8);
          d3.push({ type: 1, index: l3, name: e8[2], strings: s5, ctor: "." === e8[1] ? I : "?" === e8[1] ? L : "@" === e8[1] ? z : H }), r6.removeAttribute(t8);
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
function M(t7, i7, s5 = t7, e7) {
  if (i7 === E) return i7;
  let h4 = void 0 !== e7 ? s5._$Co?.[e7] : s5._$Cl;
  const o9 = a2(i7) ? void 0 : i7._$litDirective$;
  return h4?.constructor !== o9 && (h4?._$AO?.(false), void 0 === o9 ? h4 = void 0 : (h4 = new o9(t7), h4._$AT(t7, s5, e7)), void 0 !== e7 ? (s5._$Co ??= [])[e7] = h4 : s5._$Cl = h4), void 0 !== h4 && (i7 = M(t7, h4._$AS(t7, i7.values), h4, e7)), i7;
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
    const { el: { content: i7 }, parts: s5 } = this._$AD, e7 = (t7?.creationScope ?? l2).importNode(i7, true);
    P.currentNode = e7;
    let h4 = P.nextNode(), o9 = 0, n6 = 0, r6 = s5[0];
    for (; void 0 !== r6; ) {
      if (o9 === r6.index) {
        let i8;
        2 === r6.type ? i8 = new k(h4, h4.nextSibling, this, t7) : 1 === r6.type ? i8 = new r6.ctor(h4, r6.name, r6.strings, this, t7) : 6 === r6.type && (i8 = new Z(h4, this, t7)), this._$AV.push(i8), r6 = s5[++n6];
      }
      o9 !== r6?.index && (h4 = P.nextNode(), o9++);
    }
    return P.currentNode = l2, e7;
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
  constructor(t7, i7, s5, e7) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t7, this._$AB = i7, this._$AM = s5, this.options = e7, this._$Cv = e7?.isConnected ?? true;
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
    const { values: i7, _$litType$: s5 } = t7, e7 = "number" == typeof s5 ? this._$AC(t7) : (void 0 === s5.el && (s5.el = S2.createElement(V(s5.h, s5.h[0]), this.options)), s5);
    if (this._$AH?._$AD === e7) this._$AH.p(i7);
    else {
      const t8 = new R(e7, this), s6 = t8.u(this.options);
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
    let s5, e7 = 0;
    for (const h4 of t7) e7 === i7.length ? i7.push(s5 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s5 = i7[e7], s5._$AI(h4), e7++;
    e7 < i7.length && (this._$AR(s5 && s5._$AB.nextSibling, e7), i7.length = e7);
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
  constructor(t7, i7, s5, e7, h4) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t7, this.name = i7, this._$AM = e7, this.options = h4, s5.length > 2 || "" !== s5[0] || "" !== s5[1] ? (this._$AH = Array(s5.length - 1).fill(new String()), this.strings = s5) : this._$AH = A;
  }
  _$AI(t7, i7 = this, s5, e7) {
    const h4 = this.strings;
    let o9 = false;
    if (void 0 === h4) t7 = M(this, t7, i7, 0), o9 = !a2(t7) || t7 !== this._$AH && t7 !== E, o9 && (this._$AH = t7);
    else {
      const e8 = t7;
      let n6, r6;
      for (t7 = h4[0], n6 = 0; n6 < h4.length - 1; n6++) r6 = M(this, e8[s5 + n6], i7, n6), r6 === E && (r6 = this._$AH[n6]), o9 ||= !a2(r6) || r6 !== this._$AH[n6], r6 === A ? t7 = A : t7 !== A && (t7 += (r6 ?? "") + h4[n6 + 1]), this._$AH[n6] = r6;
    }
    o9 && !e7 && this.j(t7);
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
  constructor(t7, i7, s5, e7, h4) {
    super(t7, i7, s5, e7, h4), this.type = 5;
  }
  _$AI(t7, i7 = this) {
    if ((t7 = M(this, t7, i7, 0) ?? A) === E) return;
    const s5 = this._$AH, e7 = t7 === A && s5 !== A || t7.capture !== s5.capture || t7.once !== s5.once || t7.passive !== s5.passive, h4 = t7 !== A && (s5 === A || e7);
    e7 && this.element.removeEventListener(this.name, this, s5), h4 && this.element.addEventListener(this.name, this, t7), this._$AH = t7;
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
  const e7 = s5?.renderBefore ?? i7;
  let h4 = e7._$litPart$;
  if (void 0 === h4) {
    const t8 = s5?.renderBefore ?? null;
    e7._$litPart$ = h4 = new k(i7.insertBefore(c3(), t8), t8, void 0, s5 ?? {});
  }
  return h4._$AI(t7), h4;
};

// lit-element/lit-element.js
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

// @lit/reactive-element/node/decorators/property.js
var o5 = { attribute: true, type: String, converter: b, reflect: false, hasChanged: m };
var r4 = (t7 = o5, e7, r6) => {
  const { kind: n6, metadata: i7 } = r6;
  let s5 = globalThis.litPropertyMetadata.get(i7);
  if (void 0 === s5 && globalThis.litPropertyMetadata.set(i7, s5 = /* @__PURE__ */ new Map()), "setter" === n6 && ((t7 = Object.create(t7)).wrapped = true), s5.set(r6.name, t7), "accessor" === n6) {
    const { name: o9 } = r6;
    return { set(r7) {
      const n7 = e7.get.call(this);
      e7.set.call(this, r7), this.requestUpdate(o9, n7, t7, true, r7);
    }, init(e8) {
      return void 0 !== e8 && this.C(o9, void 0, t7, e8), e8;
    } };
  }
  if ("setter" === n6) {
    const { name: o9 } = r6;
    return function(r7) {
      const n7 = this[o9];
      e7.call(this, r7), this.requestUpdate(o9, n7, t7, true, r7);
    };
  }
  throw Error("Unsupported decorator location: " + n6);
};
function n4(t7) {
  return (e7, o9) => "object" == typeof o9 ? r4(t7, e7, o9) : ((t8, e8, o10) => {
    const r6 = e8.hasOwnProperty(o10);
    return e8.constructor.createProperty(o10, t8), r6 ? Object.getOwnPropertyDescriptor(e8, o10) : void 0;
  })(t7, e7, o9);
}

// @lit/reactive-element/node/decorators/state.js
function r5(r6) {
  return n4({ ...r6, state: true, attribute: false });
}

// @lit/reactive-element/node/decorators/base.js
var e3 = (e7, t7, c5) => (c5.configurable = true, c5.enumerable = true, Reflect.decorate && "object" != typeof t7 && Object.defineProperty(e7, t7, c5), c5);

// @lit/reactive-element/node/decorators/query.js
function e4(e7, r6) {
  return (n6, s5, i7) => {
    const o9 = (t7) => t7.renderRoot?.querySelector(e7) ?? null;
    if (r6) {
      const { get: e8, set: r7 } = "object" == typeof s5 ? n6 : i7 ?? (() => {
        const t7 = Symbol();
        return { get() {
          return this[t7];
        }, set(e9) {
          this[t7] = e9;
        } };
      })();
      return e3(n6, s5, { get() {
        let t7 = e8.call(this);
        return void 0 === t7 && (t7 = o9(this), (null !== t7 || this.hasUpdated) && r7.call(this, t7)), t7;
      } });
    }
    return e3(n6, s5, { get() {
      return o9(this);
    } });
  };
}

// @erplora/outfitkit/dist/define.js
function define(tag, ctor) {
  if (typeof customElements !== "undefined" && !customElements.get(tag)) {
    customElements.define(tag, ctor);
  }
}

// @erplora/outfitkit/dist/tabbar.js
var EPSILON = 1;
var HINT_PX = 28;
var HINT_VUELTA_MS = 420;
var CLASE = "ok-tabbar";
var DRAGGING_CLASS = "ok-tabbar-dragging";
var DRAG_THRESHOLD_PX = 4;
function tabbarOverflow(segment) {
  if (!segment) return "none";
  const maximo = segment.scrollWidth - segment.clientWidth;
  if (maximo <= EPSILON) return "none";
  const hayAntes = segment.scrollLeft > EPSILON;
  const hayDespues = segment.scrollLeft < maximo - EPSILON;
  if (hayAntes && hayDespues) return "both";
  if (hayAntes) return "start";
  return "end";
}
function syncTabbarOverflow(segment) {
  if (!segment) return;
  segment.dataset.overflow = tabbarOverflow(segment);
}
function shouldHintScroll(opts) {
  if (opts.reducedMotion) return false;
  if (opts.yaScrolleado) return false;
  return opts.overflow === "end" || opts.overflow === "both";
}
function hintScroll(segment) {
  if (!segment) return;
  segment.scrollTo({ left: HINT_PX, behavior: "smooth" });
  setTimeout(() => segment.scrollTo({ left: 0, behavior: "smooth" }), HINT_VUELTA_MS);
}
function bindDrag(segment) {
  let pointerId = null;
  let startX = 0;
  let startScroll = 0;
  let dragging = false;
  let swallowClick = false;
  let disarm = null;
  const onDown = (e7) => {
    if (e7.pointerType === "touch") return;
    if (e7.button !== 0) return;
    pointerId = e7.pointerId;
    startX = e7.clientX;
    startScroll = segment.scrollLeft;
    dragging = false;
    swallowClick = false;
  };
  const onMove = (e7) => {
    if (pointerId === null || e7.pointerId !== pointerId) return;
    if (e7.buttons === 0) {
      endDrag();
      return;
    }
    const delta = e7.clientX - startX;
    if (!dragging) {
      if (Math.abs(delta) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      segment.classList.add(DRAGGING_CLASS);
      segment.setPointerCapture?.(pointerId);
    }
    segment.scrollLeft = startScroll - delta;
  };
  const endDrag = () => {
    if (dragging) {
      if (pointerId !== null) segment.releasePointerCapture?.(pointerId);
      segment.classList.remove(DRAGGING_CLASS);
    }
    pointerId = null;
    dragging = false;
  };
  const onUp = (e7) => {
    if (pointerId === null || e7.pointerId !== pointerId) return;
    if (dragging) {
      swallowClick = true;
      if (disarm !== null) clearTimeout(disarm);
      disarm = setTimeout(() => {
        swallowClick = false;
        disarm = null;
      }, 0);
      segment.releasePointerCapture?.(pointerId);
      segment.classList.remove(DRAGGING_CLASS);
    }
    pointerId = null;
    dragging = false;
  };
  const onClick = (e7) => {
    if (!swallowClick) return;
    swallowClick = false;
    e7.stopPropagation();
    e7.preventDefault();
  };
  segment.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  segment.addEventListener("click", onClick, true);
  return () => {
    segment.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    segment.removeEventListener("click", onClick, true);
    if (disarm !== null) clearTimeout(disarm);
    segment.classList.remove(DRAGGING_CLASS);
  };
}
function bindTabbar(segment, opts = {}) {
  if (!segment) return () => {
  };
  segment.classList.add(CLASE);
  const sync = () => syncTabbarOverflow(segment);
  sync();
  segment.addEventListener("scroll", sync, { passive: true });
  const desatarArrastre = bindDrag(segment);
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
  ro?.observe(segment);
  const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(sync) : null;
  mo?.observe(segment, { childList: true });
  let pista = null;
  if (opts.hint !== false) {
    pista = setTimeout(() => {
      pista = null;
      const reducedMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (shouldHintScroll({ overflow: tabbarOverflow(segment), reducedMotion, yaScrolleado: segment.scrollLeft > 1 })) {
        hintScroll(segment);
      }
    }, 450);
  }
  return () => {
    segment.removeEventListener("scroll", sync);
    desatarArrastre();
    ro?.disconnect();
    mo?.disconnect();
    if (pista) clearTimeout(pista);
  };
}

// @erplora/module-sdk/src/index.ts
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
    } catch (e7) {
      if (mySeq !== this.seq) return;
      this.rows = [];
      this.total = 0;
      this.error = e7 instanceof Error ? e7.message : "Error cargando datos";
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
var SERVER_UNAVAILABLE = "server_unavailable";
function majorToMinor(amount, decimals) {
  const n6 = Number(amount);
  return Number.isFinite(n6) ? Math.round(n6 * 10 ** decimals) : 0;
}
function eurosToCents(euros2) {
  return majorToMinor(euros2, 2);
}
function centsToEuros(cents2) {
  return cents2 == null ? "" : (cents2 / 100).toFixed(2);
}

// ui/lib/quantity.ts
var QUANTITY_SCALE2 = 1e6;
function toMicro2(qty) {
  return Math.round(qty * QUANTITY_SCALE2);
}
function fromMicro2(raw) {
  return raw / QUANTITY_SCALE2;
}
function formatQuantity2(raw) {
  return String(fromMicro2(raw));
}
function onGrid2(raw, increment) {
  if (!Number.isFinite(increment) || increment <= 0) return true;
  return raw % increment === 0;
}

// ui/lib/price-label.ts
var UNIT_EACH = "ud";
function unitTag(unitCode) {
  return unitCode && unitCode !== UNIT_EACH ? unitCode : "";
}
function priceLabel(money2, unitCode) {
  const tag = unitTag(unitCode);
  return tag ? `${money2} / ${tag}` : money2;
}
function quantityLabel(qty, unitCode) {
  const n6 = formatQuantity2(toMicro2(qty)).replace(".", ",");
  const tag = unitTag(unitCode);
  return tag ? `${n6} ${tag}` : n6;
}

// ui/lib/paper-modifiers.ts
var SEP = " \xB7 ";
function modifierLabel(m4) {
  return (m4.name || "").trim() || (m4.option_id || "").trim();
}
function modifierNote(mods) {
  const parts = (mods ?? []).map(modifierLabel).filter(Boolean);
  return parts.length ? parts.join(SEP) : void 0;
}
function modifierIdentity(m4) {
  return `${m4.option_id || m4.name || ""}:${m4.price_delta ?? 0}`;
}

// ui/lib/paper-combos.ts
var SEP2 = " \xB7 ";
function deltaLabel(cents2) {
  const sign = cents2 < 0 ? "-" : "+";
  return `${sign}${(Math.abs(cents2) / 100).toFixed(2).replace(".", ",")}`;
}
function componentLabel(c5) {
  const name = (c5.name || "").trim() || (c5.option_id || "").trim();
  const delta = Number(c5.price_delta);
  return Number.isFinite(delta) && delta !== 0 ? `${name} (${deltaLabel(delta)})` : name;
}
function comboNote(combo) {
  const parts = (combo?.components ?? []).map(componentLabel).filter(Boolean);
  return parts.length ? parts.join(SEP2) : void 0;
}
function comboIdentity(combo) {
  if (!combo) return "";
  const parts = combo.components.map((c5) => `${c5.option_id || c5.name || ""}:${c5.price_delta ?? 0}`);
  return `{${combo.name}|${parts.join("|")}}`;
}
function parseComboSnapshot(raw) {
  if (typeof raw !== "string" || !raw.trim()) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return void 0;
  const v3 = parsed;
  const name = v3.name == null ? "" : String(v3.name).trim();
  if (!name) return void 0;
  const rawComponents = Array.isArray(v3.components) ? v3.components : [];
  const components = rawComponents.filter((c5) => !!c5 && typeof c5 === "object").map((c5) => {
    const option_id = c5.option_id == null ? void 0 : String(c5.option_id);
    const cname = c5.name == null || String(c5.name) === "" ? void 0 : String(c5.name);
    const delta = Number(c5.price_delta);
    return {
      ...option_id ? { option_id } : {},
      ...cname ? { name: cname } : {},
      ...Number.isFinite(delta) ? { price_delta: delta } : {}
    };
  }).filter((c5) => c5.name || c5.option_id);
  return { name, components };
}
function groupComboLines(lines) {
  const out = [];
  const byRef = /* @__PURE__ */ new Map();
  for (const line of lines) {
    const ref2 = line.combo_group_ref ? String(line.combo_group_ref) : "";
    if (!ref2) {
      out.push({ head: line, siblings: [line] });
      continue;
    }
    const existing = byRef.get(ref2);
    if (existing) {
      existing.siblings.push(line);
      continue;
    }
    const group = { head: line, siblings: [line], combo: parseComboSnapshot(line.combo) };
    byRef.set(ref2, group);
    out.push(group);
  }
  return out;
}

// @erplora/outfitkit/dist/ok-money.js
var __defProp2 = Object.defineProperty;
var __decorateClass2 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp2(target, key, result);
  return result;
};
var NOT_AN_AMOUNT = "\u2014";
function separatorsOf(locale) {
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345675e-1);
    return {
      decimal: parts.find((p4) => p4.type === "decimal")?.value ?? ".",
      group: parts.find((p4) => p4.type === "group")?.value ?? ","
    };
  } catch {
    return { decimal: ".", group: "," };
  }
}
function documentLocale() {
  if (typeof document === "undefined") return "en";
  const lang = document.documentElement?.lang?.trim();
  return lang || "en";
}
function formatMinor(value, opts) {
  const raw = typeof value === "number" ? Number.isInteger(value) ? String(value) : "" : typeof value === "string" ? value.trim() : "";
  if (!/^-?\d+$/.test(raw)) return opts.currency ? `${NOT_AN_AMOUNT} ${opts.currency}` : NOT_AN_AMOUNT;
  const negative = raw.startsWith("-");
  let digits = raw.replace(/^-0*/, "").replace(/^0+(?=\d)/, "");
  if (digits === "" || digits === "-") digits = "0";
  const decimals = Math.max(0, Math.floor(opts.decimals));
  const padded = digits.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded.slice(padded.length - decimals);
  const { decimal, group } = separatorsOf(opts.locale);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const number = decimals > 0 ? `${grouped}${decimal}${fracPart}` : grouped;
  const signed = negative && /[1-9]/.test(digits) ? `-${number}` : number;
  return opts.currency ? `${signed} ${opts.currency}` : signed;
}
var OkMoney = class extends i3 {
  constructor() {
    super(...arguments);
    this.value = void 0;
    this.decimals = 2;
    this.currency = "";
    this.locale = "";
  }
  static {
    this.styles = i`
    :host { display: inline; font-variant-numeric: tabular-nums; white-space: nowrap; }
  `;
  }
  render() {
    return b2`${formatMinor(this.value, {
      decimals: this.decimals,
      locale: this.locale || documentLocale(),
      currency: this.currency
    })}`;
  }
};
__decorateClass2([
  n4()
], OkMoney.prototype, "value");
__decorateClass2([
  n4({ type: Number })
], OkMoney.prototype, "decimals");
__decorateClass2([
  n4()
], OkMoney.prototype, "currency");
__decorateClass2([
  n4()
], OkMoney.prototype, "locale");
define("ok-money", OkMoney);

// ui/lib/receipt-html.ts
function esc(v3) {
  return String(v3 ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function money(v3, currency, decimals) {
  return formatMinor(v3, { decimals, locale: documentLocale(), currency });
}
function qtyPrice(l3, currency, decimals) {
  return `${quantityLabel(l3.qty, l3.unit_code)} \xD7 ${priceLabel(money(l3.unit_price, currency, decimals), l3.pricing_unit_code || l3.unit_code)}`;
}
function modLines(l3) {
  return (l3.printed_modifiers ?? []).map(modifierLabel).filter(Boolean).map((label) => `<div class="mod">${esc(label)}</div>`).join("");
}
function noteLine(l3) {
  const note = (l3.line_note ?? "").trim();
  return note ? `<div class="mod">${esc(note)}</div>` : "";
}
function componentLines(l3) {
  return (l3.combo?.components ?? []).map(componentLabel).filter(Boolean).map((label) => `<div class="comp">${esc(label)}</div>`).join("");
}
function receiptToPrintableHtml(doc) {
  const cur = doc.currency || "\u20AC";
  const dec = doc.decimals ?? 2;
  const lbl = { subtotal: "Subtotal", total: "TOTAL", change: "Cambio", document: "Documento", ...doc.labels };
  const lineas = (doc.lines ?? []).map((l3) => `
      <tr>
        <td class="n">${esc(l3.name)}<div class="q">${esc(qtyPrice(l3, cur, dec))}</div>${componentLines(l3)}${modLines(l3)}${noteLine(l3)}</td>
        <td class="a">${money(l3.total, cur, dec)}</td>
      </tr>`).join("");
  const impuestos = (doc.taxes ?? []).map((t7) => `
      <tr><td>${esc(t7.label)}</td><td class="a">${money(t7.amount, cur, dec)}</td></tr>`).join("");
  const pago = doc.payment ? `<tr><td>${esc(doc.payment.method)}</td><td class="a">${money(doc.payment.paid ?? doc.total, cur, dec)}</td></tr>` + (doc.payment.change != null ? `<tr><td>${esc(lbl.change)}</td><td class="a">${money(doc.payment.change, cur, dec)}</td></tr>` : "") : "";
  const claim = doc.claim_note || doc.claim_locator ? `<div class="claim">` + (doc.claim_note ? `<div class="claim-note">${esc(doc.claim_note)}</div>` : "") + (doc.claim_locator ? `<div class="claim-loc">${esc(doc.claim_locator)}</div>` : "") + (doc.claim_qr_data ? `<div class="claim-url">${esc(doc.claim_qr_data)}</div>` : "") + `</div>` : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(doc.number || doc.business?.name || lbl.document)}</title>
<style>
  /* Papel t\xE9rmico de 80 mm: sin m\xE1rgenes de p\xE1gina, el navegador no estampa cabecera ni pie. */
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 4mm; width: 80mm; background: #fff; color: #000;
         font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
  h1 { font-size: 14px; text-align: center; margin: 0 0 2mm; text-transform: uppercase; }
  .doc-title { font-size: 15px; font-weight: 700; text-align: center; letter-spacing: .08em; text-transform: uppercase; margin: 0 0 1mm; }
  .meta { text-align: center; font-size: 11px; margin-bottom: 2mm; }
  hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: .4mm 0; }
  td.a { text-align: right; white-space: nowrap; padding-left: 2mm; }
  .q { font-size: 10px; color: #333; }
  /* sales#148 \u2014 el suplemento, sangrado bajo su producto. La indentaci\xF3n ES el v\xEDnculo con la
     l\xEDnea madre: es lo que hacen Odoo (margin-start), Shopify (li anidado) y LS Central (l\xEDnea
     hija). Sin importe a la derecha: ya est\xE1 dentro del total de la l\xEDnea. */
  .mod { font-size: 11px; padding-left: 4mm; }
  /* sales#154 \u2014 the menu's component, indented under the menu line like a supplement (same level:
     LS Central \xABunder the Deal line\xBB, WooCommerce \xABindented\xBB, Maitre'D \xABunder the main combo
     item\xBB). No amount: the header carries the closed price the customer reconciles. */
  .comp { font-size: 11px; padding-left: 4mm; }
  .tot td { font-size: 15px; font-weight: 700; padding-top: 1mm; }
  .foot { text-align: center; font-size: 10px; margin-top: 3mm; }
  /* El bloque del claim (sales#103): al pie y separado del QR fiscal, como en el papel t\xE9rmico. */
  .claim { text-align: center; margin-top: 3mm; }
  .claim-note { font-size: 11px; font-weight: 700; }
  .claim-loc { font-size: 13px; letter-spacing: .08em; margin-top: 1mm; }
  .claim-url { font-size: 9px; color: #333; margin-top: 1mm; word-break: break-all; }
</style></head>
<body>
  ${doc.title ? `<div class="doc-title">${esc(doc.title)}</div>` : ""}
  <h1>${esc(doc.business?.name || "")}</h1>
  ${doc.business?.address ? `<div class="meta">${esc(doc.business.address)}</div>` : ""}
  ${doc.business?.tax_id ? `<div class="meta">${esc(doc.business.tax_id)}</div>` : ""}
  ${doc.number || doc.datetime ? `<div class="meta">${esc(doc.number || "")}${doc.number && doc.datetime ? " \xB7 " : ""}${esc(doc.datetime || "")}</div>` : ""}
  ${doc.customer ? `<div class="meta">${doc.customer_label ? `${esc(doc.customer_label)}: ` : ""}${esc(doc.customer)}</div>` : ""}
  <hr>
  <table>${lineas}</table>
  <hr>
  <table>
    ${doc.subtotal != null ? `<tr><td>${esc(lbl.subtotal)}</td><td class="a">${money(doc.subtotal, cur, dec)}</td></tr>` : ""}
    ${impuestos}
    <tr class="tot"><td>${esc(lbl.total)}</td><td class="a">${money(doc.total, cur, dec)}</td></tr>
    ${pago}
  </table>
  ${doc.footer ? `<div class="foot">${esc(doc.footer)}</div>` : ""}
  ${doc.qr_note ? `<div class="foot">${esc(doc.qr_note)}</div>` : ""}
  ${claim}
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

// ui/lib/pos-settings.ts
var POS_SETTINGS_DEFAULTS = Object.freeze({
  allow_cash: 1,
  allow_card: 1,
  allow_transfer: 0,
  sync_products: 1,
  sync_services: 1,
  require_customer: 0,
  allow_discounts: 1,
  enable_parked_tickets: 1,
  default_tax_included: 1,
  auto_invoice_with_tax_id: 0,
  default_document_format: "ticket",
  receipt_header: "",
  receipt_footer: "",
  receipt_footer_image: "",
  receipt_marketing_url: "",
  receipt_marketing_text: ""
});
function saved(v3) {
  return v3 !== void 0 && v3 !== null;
}
function asFlag(v3) {
  if (v3 === false || v3 === 0 || v3 === "0" || v3 === "") return 0;
  return 1;
}
function withPosSettingsDefaults(row) {
  const raw = row ?? {};
  const out = { ...raw };
  for (const [key, fallback] of Object.entries(POS_SETTINGS_DEFAULTS)) {
    const v3 = raw[key];
    if (!saved(v3)) {
      out[key] = fallback;
      continue;
    }
    out[key] = typeof fallback === "string" ? String(v3) : asFlag(v3);
  }
  return out;
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
  const p4 = withPosSettingsDefaults(policy);
  const allowed = (m4) => {
    const t7 = (m4.type || "").trim().toLowerCase();
    if (t7 === "cash") return p4.allow_cash !== 0;
    if (t7 === "card" || t7 === "credit" || t7 === "debit") return p4.allow_card !== 0;
    if (t7 === "transfer" || t7 === "bank") return p4.allow_transfer !== 0;
    return true;
  };
  const out = methods.filter(allowed);
  return out.length ? out : methods;
}
var PAY_ICON_NAMES = [
  .../* @__PURE__ */ new Set([...Object.values(BY_TYPE), ...BY_NAME.map(([, i7]) => i7), PAY_ICON_FALLBACK])
];
var SEED_NAME_TO_KEY = {
  Cash: "ui.cash",
  Card: "ui.card"
};
function payMethodDisplayName(method, t7) {
  const key = SEED_NAME_TO_KEY[(method.name || "").trim()];
  return key ? t7(key) : method.name || "";
}
function defaultPayMethod(methods) {
  return methods.find((m4) => (m4.type || "").trim().toLowerCase() === "cash") ?? methods.find((m4) => /efectiv|cash|met[\u00e1a]lico/i.test(m4.name || "")) ?? methods[0];
}

// ui/lib/dependency-read.ts
var MODULE_ABSENT_CODES = /* @__PURE__ */ new Set(["module_not_installed", "module_inactive"]);
function isModuleAbsent(e7) {
  const code = e7?.code;
  return typeof code === "string" && MODULE_ABSENT_CODES.has(code);
}
function toRows(r6) {
  if (Array.isArray(r6)) return r6;
  if (r6 && typeof r6 === "object" && Array.isArray(r6.rows)) return r6.rows;
  return [];
}
async function dependencyRead(read) {
  try {
    return { rows: toRows(await read()), absent: false, broken: false };
  } catch (e7) {
    const absent = isModuleAbsent(e7);
    return { rows: [], absent, broken: !absent };
  }
}
async function capabilityRead(read) {
  try {
    const answer = await read();
    if (answer === void 0) return { rows: [], absent: true, broken: false };
    return { rows: toRows(answer), absent: false, broken: false };
  } catch (e7) {
    const absent = isModuleAbsent(e7);
    return { rows: [], absent, broken: !absent };
  }
}

// ui/lib/pos-tax.ts
function isRoot(r6) {
  return r6.parent_id == null || String(r6.parent_id) === "";
}
function productSellability(catalog, taxCategoryKey) {
  if (!taxCategoryKey) return "no_tax_category";
  if (!catalog.available) return "unknown";
  return catalog.rates.has(String(taxCategoryKey)) ? "sellable" : "no_tax_rule";
}
async function loadTaxCatalog(client) {
  const map = /* @__PURE__ */ new Map();
  let available = false;
  let installed = true;
  try {
    const all = await client.queryAll("taxes.rules.list");
    available = Array.isArray(all) && all.length > 0;
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
  } catch (e7) {
    available = false;
    installed = !isModuleAbsent(e7);
  }
  return { rates: map, available, installed };
}
function resolveLineTax(catRatesMap, taxCategoryKey) {
  if (!taxCategoryKey) return 0;
  return catRatesMap.get(String(taxCategoryKey)) ?? 0;
}
function roundHalfUp(x2) {
  return Math.round(x2 + 1e-9);
}
function previewTaxBreakdown(lines, taxIncluded = POS_SETTINGS_DEFAULTS.default_tax_included !== 0) {
  const byRate = /* @__PURE__ */ new Map();
  for (const l3 of lines) {
    const rate = Number(l3.tax_rate) || 0;
    const amount = Number(l3.amount) || 0;
    if (rate <= 0 || amount === 0) continue;
    const base = taxIncluded ? roundHalfUp(amount / (1 + rate / 100)) : amount;
    const tax = taxIncluded ? amount - base : roundHalfUp(base * rate / 100);
    const acc = byRate.get(rate) ?? { rate, base: 0, amount: 0 };
    acc.base += base;
    acc.amount += tax;
    byRate.set(rate, acc);
  }
  return [...byRate.values()].sort((a3, b3) => a3.rate - b3.rate);
}

// ui/lib/document-mappers.ts
function minor(cents2) {
  return Number(cents2 ?? 0);
}
function hubDecimals() {
  const d3 = globalThis.erplora?.currencyDecimals;
  return typeof d3 === "number" && Number.isInteger(d3) && d3 >= 0 ? d3 : 2;
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
function payLabel(name, t7) {
  if (!name) return void 0;
  return t7 ? payMethodDisplayName({ id: "", name }, t7) : name;
}
function receiptLabels(t7, doc) {
  return {
    empty: t7("ui.docEmpty"),
    phone: t7("ui.docPhone"),
    receipt: t7("ui.docReceipt"),
    servedBy: t7("ui.docServedBy"),
    customer: doc?.customer_is_table ? t7("ui.docTable") : t7("ui.docCustomer"),
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
function orderChildLines(lines) {
  const ref2 = (l3) => (l3.parent_line_ref || "").trim();
  const byParent = /* @__PURE__ */ new Map();
  for (const l3 of lines) {
    const r6 = ref2(l3);
    if (!r6) continue;
    byParent.set(r6, [...byParent.get(r6) ?? [], l3]);
  }
  if (!byParent.size) return lines;
  const present = new Set(lines.map((l3) => l3.id).filter(Boolean));
  const out = [];
  for (const l3 of lines) {
    if (ref2(l3) && present.has(ref2(l3))) continue;
    out.push(l3);
    for (const child of byParent.get(l3.id ?? "") ?? []) out.push(child);
  }
  return out;
}
function parseModifierSnapshot(raw) {
  if (typeof raw !== "string" || !raw.trim()) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (!Array.isArray(parsed)) return void 0;
  const out = parsed.filter((m4) => !!m4 && typeof m4 === "object").map((m4) => {
    const option_id = m4.option_id == null ? void 0 : String(m4.option_id);
    const name = m4.name == null || String(m4.name) === "" ? void 0 : String(m4.name);
    const delta = Number(m4.price_delta);
    return {
      ...option_id ? { option_id } : {},
      ...name ? { name } : {},
      ...Number.isFinite(delta) ? { price_delta: delta } : {}
    };
  }).filter((m4) => m4.name || m4.option_id);
  return out.length ? out : void 0;
}
function lineLabel(l3, t7) {
  if (ref(l3)) return `+ ${lineName(l3, t7)}`;
  return lineName(l3, t7);
}
function lineName(l3, t7) {
  if (Number(l3.is_gift)) return `${l3.product_name} (Invitaci\xF3n)`;
  if (Number(l3.is_covered)) {
    const label = t7?.("ui.linePaidElsewhere");
    return `${l3.product_name} (${label && label !== "ui.linePaidElsewhere" ? label : "Prepaid"})`;
  }
  return l3.product_name;
}
function ref(l3) {
  return !!(l3.parent_line_ref || "").trim();
}
var CLAIM_NOTE_FALLBACK = "Get your invoice";
function claimPrintFields(fiscal, t7) {
  if (!fiscal.claim_locator) return {};
  return {
    claim_qr_data: fiscal.claim_qr || void 0,
    claim_note: t7 ? t7("ui.claimNote") : CLAIM_NOTE_FALLBACK,
    claim_locator: fiscal.claim_locator
  };
}
var DEFAULT_BUSINESS_NAME = "My business";
function splitHeader(raw) {
  const header = (raw || "").trim();
  return {
    name: header.split("\n")[0] || void 0,
    address: header.split("\n").slice(1).join(" ") || void 0
  };
}
var RAW_TAX_TYPES = /* @__PURE__ */ new Set(["vat", "surcharge", "sales_tax", "withholding", "excise", "import_duty"]);
function taxLabel(rate, v3, t7) {
  const r6 = Number(rate);
  const custom = v3?.label && !RAW_TAX_TYPES.has(v3.label) ? v3.label : void 0;
  const name = custom ?? (v3?.kind === "surcharge" ? t7 ? t7("ui.taxSurcharge") : "RE" : "IVA");
  const pct = Number.isFinite(r6) ? String(Number(r6.toFixed(2))) : rate;
  return `${name} ${pct}%`;
}
function parseTaxes(tax_breakdown, t7) {
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
      label: taxLabel(rate, v3, t7),
      rate: Number.isFinite(r6) ? r6 : void 0,
      base: minor(v3?.base),
      amount: minor(v3?.tax)
    };
  }).filter((t8) => t8.amount || t8.base);
}
function resolveFormat(sale, settings) {
  const v3 = sale.document_type || settings.default_document_format || "ticket";
  return v3 === "invoice" ? "invoice" : "ticket";
}
function paperUnit(l3) {
  if (!l3.unit_code) return {};
  return {
    unit_code: l3.unit_code,
    ...l3.unit_name ? { unit_name: l3.unit_name } : {},
    ...l3.pricing_unit_code ? { pricing_unit_code: l3.pricing_unit_code } : {}
  };
}
function paperModifiers(mods, combo, lineNote) {
  const note_raw = (lineNote ?? "").trim();
  if (!mods?.length && !combo && !note_raw) return {};
  const note = paperNote(combo, mods, note_raw);
  const components = (combo?.components ?? []).map(componentLabel).filter(Boolean);
  const modifiers = (mods ?? []).map(modifierLabel).filter(Boolean);
  return {
    ...mods?.length ? { printed_modifiers: mods } : {},
    ...combo ? { combo } : {},
    ...note ? { note } : {},
    // sales#156: and the RAW note, for the HTML paper — which paints it on a sub-line of its own
    // rather than chained — and for the bill's `jobId` fingerprint.
    ...note_raw ? { line_note: note_raw } : {},
    ...components.length ? { components } : {},
    ...modifiers.length ? { modifiers } : {}
  };
}
function paperNote(combo, mods, lineNote) {
  const parts = [comboNote(combo), modifierNote(mods), (lineNote ?? "").trim() || void 0].filter((s5) => !!s5);
  return parts.length ? parts.join(" \xB7 ") : void 0;
}
function menuLine(siblings, combo, t7) {
  const head = siblings[0];
  const sum = (pick) => siblings.reduce((s5, l3) => s5 + Number(pick(l3) ?? 0), 0);
  const mods = siblings.flatMap((l3) => parseModifierSnapshot(l3.modifiers) ?? []);
  return {
    name: lineLabel({ ...head, product_name: combo.name }, t7),
    qty: fromMicro2(Number(head.quantity)),
    unit_price: minor(sum((l3) => l3.unit_price)),
    total: minor(sum((l3) => l3.line_total)),
    ...paperModifiers(mods.length ? mods : void 0, combo, head.notes),
    ...paperUnit(head)
  };
}
function saleToReceipt(sale, lines, settings = {}, fiscal = {}, locale = "es", fallbackName = DEFAULT_BUSINESS_NAME, t7) {
  const header = splitHeader(settings.receipt_header);
  return {
    // sales#180 — the same priority as the bill: deliberate branding, then the legal name (the one
    // frozen on the invoice, else the one the hub holds today), then the translated fallback.
    business: { name: header.name || fiscal.issuer_name || settings.issuer_name || fallbackName, address: header.address, tax_id: fiscal.issuer_nif || void 0 },
    number: fiscal.number || sale.sale_number,
    datetime: formatDateTime(sale.created_at, locale),
    customer: fiscal.customer_name || sale.customer_name || void 0,
    // sales#154: the sibling rows of a menu collapse into ONE header line; a plain row is itself.
    // sales#147: cada hija va justo detrás de SU padre ANTES de agrupar los menús, para que el
    // orden del papel sea el de la jerarquía y no el que devuelva la base de datos.
    lines: groupComboLines(orderChildLines(lines)).map((g3) => g3.combo ? menuLine(g3.siblings, g3.combo, t7) : {
      name: lineLabel(g3.head, t7),
      qty: fromMicro2(Number(g3.head.quantity)),
      // fila en punto fijo 10⁶ (ADR-0147) → lógico para pintar
      unit_price: minor(g3.head.unit_price),
      total: minor(g3.head.line_total),
      // sales#148: what was charged, printed. sales#156: and the note the kitchen was given.
      // sales#147: a CHILD paints no supplement sub-line — it IS the supplement, and its row keeps
      // the snapshot only to be self-describing; repeating it underneath would read
      // «+ Refresco / · Refresco».
      ...ref(g3.head) ? {} : paperModifiers(parseModifierSnapshot(g3.head.modifiers), void 0, g3.head.notes),
      ...paperUnit(g3.head)
      // sales#28: la unidad congelada, para el papel
    }),
    subtotal: sale.subtotal != null ? minor(sale.subtotal) : void 0,
    taxes: parseTaxes(sale.tax_breakdown, t7).map((x2) => ({ label: x2.label, base: x2.base, amount: x2.amount })),
    total: minor(sale.total),
    payment: sale.payment_method_name ? { method: payLabel(sale.payment_method_name, t7), paid: sale.amount_tendered != null ? minor(sale.amount_tendered) : void 0, change: sale.change_due != null ? minor(sale.change_due) : void 0 } : void 0,
    currency: settings.currency || "\u20AC",
    decimals: hubDecimals(),
    footer: settings.receipt_footer || void 0,
    qr: fiscal.qr || void 0,
    qr_note: fiscal.qr_note || void 0,
    // QR promocional (solo tiquet; la factura A4 es formal). Sin URL no hay rastro.
    promo_qr: settings.receipt_marketing_url || void 0,
    promo_note: settings.receipt_marketing_url ? settings.receipt_marketing_text || void 0 : void 0
  };
}
function saleToInvoice(sale, lines, settings = {}, fiscal = {}, locale = "es", fallbackName = DEFAULT_BUSINESS_NAME, t7) {
  const header = splitHeader(settings.receipt_header);
  const invLines = orderChildLines(lines).map((l3) => ({
    // sales#28: `InvoiceLine` (outfitkit) no tiene campo de unidad, y la factura A4 debe decir
    // igualmente en qué va la línea — el hueco honesto es la descripción, como «Vino (botella)»:
    // «Tomate rosa (kg)». Sin unidad o con la suelta, la descripción queda como estaba.
    description: unitTag(l3.unit_code) ? `${lineLabel(l3, t7)} (${unitTag(l3.unit_code)})` : lineLabel(l3, t7),
    qty: fromMicro2(Number(l3.quantity)),
    // fila en punto fijo 10⁶ (ADR-0147) → lógico para pintar
    unit_price: minor(l3.unit_price),
    discount_percent: l3.discount_percent ? Number(l3.discount_percent) : void 0,
    tax_rate: l3.tax_rate != null ? Number(l3.tax_rate) : void 0,
    total: minor(l3.line_total)
  }));
  const taxes = parseTaxes(sale.tax_breakdown, t7);
  return {
    issuer: { name: fiscal.issuer_name || header.name || settings.issuer_name || fallbackName, address: header.address, tax_id: fiscal.issuer_nif || void 0 },
    customer: { name: fiscal.customer_name || sale.customer_name || "Cliente", tax_id: fiscal.customer_tax_id || void 0 },
    number: fiscal.number || sale.sale_number,
    issue_date: formatDateTime(sale.created_at, locale) || "",
    lines: invLines,
    subtotal: minor(sale.subtotal),
    discount_total: sale.discount_amount ? minor(sale.discount_amount) : void 0,
    taxes: taxes.map((t8) => ({ label: t8.label, rate: t8.rate, base: t8.base, amount: t8.amount })),
    tax_total: minor(sale.tax_amount),
    total: minor(sale.total),
    currency: settings.currency || "\u20AC",
    decimals: hubDecimals(),
    payment_method: payLabel(sale.payment_method_name, t7),
    footer: settings.receipt_footer || void 0,
    qr: fiscal.qr || void 0,
    qr_note: fiscal.qr_note || void 0
  };
}
function valuationBreakdown(v3) {
  return Object.entries(v3.tax_breakdown ?? {}).map(([key, entry]) => ({ rate: Number(key) || 0, base: entry.base, amount: entry.tax })).sort((a3, b3) => a3.rate - b3.rate);
}
function orderToPrebill(lines, settings = {}, opts = {}, valuation) {
  const header = splitHeader(settings.receipt_header);
  const unitPrice = (l3) => l3.price + (l3.modifiers ?? []).reduce((s5, m4) => s5 + (Number(m4.price_delta) || 0), 0);
  const lineAmount2 = (l3) => l3.is_gift ? 0 : Math.round(unitPrice(l3) * l3.qty);
  const taxIncluded = valuation?.tax_included ?? settings.default_tax_included !== 0;
  const taxes = valuation ? valuationBreakdown(valuation) : previewTaxBreakdown(lines.map((l3) => ({ amount: lineAmount2(l3), tax_rate: l3.tax_rate })), taxIncluded);
  const gross = lines.reduce((s5, l3) => s5 + lineAmount2(l3), 0);
  const taxTotal = taxes.reduce((s5, x2) => s5 + x2.amount, 0);
  const total = valuation ? valuation.total : taxIncluded ? gross : gross + taxTotal;
  const base = valuation ? valuation.subtotal : taxes.reduce((s5, x2) => s5 + x2.base, 0);
  const table = opts.tableLabel || void 0;
  const customer = table || opts.customerName || void 0;
  return {
    // Same job as the hardcoded «CUENTA» of the ESC/POS renderer: the first line tells this paper
    // from a fiscal ticket at a glance. The UI passes the translation; the fallback is canonical
    // English (ADR-0055).
    title: opts.title ?? "Bill",
    business: {
      // sales#180 — the SAME priority as the ticket: the deliberate ticket branding
      // (`receipt_header`), and failing that the business's LEGAL name (ADR-0061, which the ticket
      // reads already frozen on its invoice). The generic default is the LAST resort, not the
      // first: it was what the customer read on their bill while the ticket for the same sale
      // came out right.
      name: header.name || settings.issuer_name || opts.fallbackName || DEFAULT_BUSINESS_NAME,
      address: header.address
    },
    // number/qr/payment AUSENTES a propósito: esto no es una factura (ver doc de la función).
    datetime: formatDateTime(opts.datetime ?? (/* @__PURE__ */ new Date()).toISOString(), opts.locale ?? "es"),
    customer,
    ...table ? { customer_is_table: true } : {},
    lines: lines.map((l3) => ({
      name: l3.is_gift ? `${l3.name} (invitaci\xF3n)` : l3.name,
      qty: l3.qty,
      unit_price: minor(unitPrice(l3)),
      total: minor(lineAmount2(l3)),
      // sales#148: ya resueltos contra el catálogo VIVO por quien pide la cuenta (la fila del
      // pedido guarda solo los `option_id`; el nombre y el importe no son del navegador).
      // sales#154: and the menu's components, same door. sales#156: and the line's own note.
      ...paperModifiers(l3.modifiers, l3.combo, l3.note),
      ...paperUnit(l3)
      // sales#28: la unidad congelada, para el papel
    })),
    // The subtotal only exists when there is something to break down: with no tax catalogue the
    // bill comes out as it did, with its total and nothing else.
    ...taxes.length ? { subtotal: base } : {},
    taxes: taxes.map((x2) => ({ label: taxLabel(String(x2.rate), void 0), base: x2.base, amount: x2.amount })),
    total: minor(total),
    currency: settings.currency || "\u20AC",
    decimals: hubDecimals(),
    // Inglés canónico (ADR-0055): la UI pasa el texto ya traducido en `opts.notice`; esto es solo
    // el respaldo para llamadas sin i18n (tests, integraciones).
    footer: opts.notice ?? "Bill \u2014 this is not an invoice. The fiscal receipt is issued on payment."
  };
}

// ui/lib/print-document.ts
function euros(minor2, decimals = 2) {
  return minor2 == null ? void 0 : Number(minor2) / 10 ** decimals;
}
function printQuantity(qty, unitCode) {
  return unitTag(unitCode) ? `${quantityLabel(qty, unitCode)} ` : qty;
}
function printNotes(l3) {
  const notes = paperNote(l3.combo, l3.printed_modifiers, l3.line_note);
  const components = l3.combo?.components.map(componentLabel).filter(Boolean);
  const modifiers = l3.printed_modifiers?.map(modifierLabel).filter(Boolean);
  return {
    ...notes ? { notes } : {},
    ...components?.length ? { components } : {},
    ...modifiers?.length ? { modifiers } : {}
  };
}
function prebillToPrintDocument(lines, settings = {}, opts = {}, valuation) {
  const screen = orderToPrebill(lines, settings, opts, valuation);
  return {
    business_name: screen.business.name,
    business_address: screen.business.address,
    // The renderer prints this as «Mesa/Cliente»: on a bill it is the table, which is what the
    // waiter needs to know which paper goes where.
    customer_name: screen.customer,
    items: screen.lines.map((l3) => ({ name: l3.name, quantity: printQuantity(l3.qty, l3.unit_code), total: euros(l3.total, screen.decimals), ...printNotes(l3) })),
    // sales#180 — the bill carries its provisional VAT too: `render_prebill` already prints
    // `subtotal` + `tax_amount` under a `tax_label`, so this is data the paper knew how to show and
    // was not being given. With more than one rate the aggregate is NOT labelled with one of them.
    ...screen.subtotal != null ? { subtotal: euros(screen.subtotal, screen.decimals) } : {},
    ...screen.taxes?.length ? {
      tax_amount: euros(screen.taxes.reduce((s5, t7) => s5 + (t7.amount ?? 0), 0), screen.decimals),
      ...screen.taxes.length === 1 ? { tax_label: screen.taxes[0].label } : {}
    } : {},
    total: euros(screen.total, screen.decimals),
    notice: screen.footer
  };
}
function saleToPrintDocument(sale, lines, settings = {}, fiscal = {}, locale = "es", fallbackName, t7) {
  const screen = saleToReceipt(sale, lines, settings, fiscal, locale, fallbackName, t7);
  return {
    business_name: screen.business.name,
    business_address: screen.business.address,
    vat_number: screen.business.tax_id,
    receipt_id: screen.number,
    customer_name: screen.customer,
    items: screen.lines.map((l3) => ({ name: l3.name, quantity: printQuantity(l3.qty, l3.unit_code), total: euros(l3.total, screen.decimals), ...printNotes(l3) })),
    subtotal: euros(screen.subtotal, screen.decimals),
    // The tax total comes from the sale row, not from the breakdown: a sale without
    // `tax_breakdown` still has `tax_amount`, and the paper must not lose it.
    tax_amount: euros(sale.tax_amount, screen.decimals),
    discount: euros(sale.discount_amount, screen.decimals),
    total: euros(screen.total, screen.decimals),
    payment_method: screen.payment?.method,
    paid: euros(screen.payment?.paid, screen.decimals),
    change: euros(screen.payment?.change, screen.decimals),
    qr_data: screen.qr,
    // sales#103: el bloque «pide tu factura», VACÍO sin locator acuñado — el renderer imprime
    // solo los campos presentes, así que un tique sin claim sale byte a byte como hoy.
    ...claimPrintFields(fiscal, t7),
    receipt_footer: screen.footer
  };
}
function prebillJobId(orderId, lines) {
  const fingerprint = (lines || []).map((l3) => `${l3.name}${l3.qty}${l3.price}${l3.is_gift ? 1 : 0}${modifierPrint(l3.modifiers)}${comboIdentity(l3.combo)}${(l3.note ?? "").trim()}`).join("");
  return `prebill-${orderId || "open"}-${hash(fingerprint)}`;
}
function modifierPrint(mods) {
  if (!mods?.length) return "";
  return `[${mods.map(modifierIdentity).join("|")}]`;
}
var reprintSeq = 0;
function reprintJobId(saleId) {
  if (!saleId) return void 0;
  reprintSeq += 1;
  return `sale-${saleId}-${Date.now().toString(36)}-${reprintSeq}`;
}
function hash(s5) {
  let h4 = 2166136261;
  for (let i7 = 0; i7 < s5.length; i7++) {
    h4 ^= s5.charCodeAt(i7);
    h4 = Math.imul(h4, 16777619) >>> 0;
  }
  return h4.toString(36);
}

// @erplora/outfitkit/dist/shared/icons.js
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

// @erplora/outfitkit/dist/ok-inline-feedback.js
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
  dismiss: "Dismiss"
};
var OkInlineFeedback = class extends i3 {
  constructor() {
    super(...arguments);
    this.tone = "info";
    this.dismissible = false;
    this.hidden = false;
    this.labels = {};
    this.hasActions = false;
    this.onActionsSlotChange = (e7) => {
      const slot = e7.target;
      this.hasActions = slot.assignedNodes({ flatten: true }).length > 0;
    };
  }
  static {
    this.styles = i`
    :host {
      /* Vars overridable (estilo Ionic), default = cadena --ok-* → --ion-* → hex.
         --tone-color y --tone-icon se reasignan por tone abajo. */
      --tone-color: var(--ok-primary, var(--ion-color-primary, #3880ff));
      --background-opacity: 0.1;
      --color: var(--ok-text, var(--ion-text-color, #1c1b17));
      --border-radius: var(--ok-radius, var(--ion-border-radius, 8px));
      --padding: var(--ok-spacing, var(--ion-padding, 16px));
      --accent-width: 4px;
      --font: var(--ok-font, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);

      /* Responsive: el banner ocupa el ancho del contenedor. */
      display: block;
      width: 100%;
      font-family: var(--font);
      box-sizing: border-box;
    }
    :host([hidden]) { display: none; }

    /* Mapa de tonos → color Ionic + icono por defecto. */
    :host([tone='success']) { --tone-color: var(--ok-success, var(--ion-color-success, #2dd55b)); }
    :host([tone='warning']) { --tone-color: var(--ok-warning, var(--ion-color-warning, #ffc409)); }
    :host([tone='danger'])  { --tone-color: var(--ok-danger, var(--ion-color-danger, #c5000f)); }
    :host([tone='neutral']) { --tone-color: var(--ok-medium, var(--ion-color-medium, #5f5f5f)); }
    /* info / sin tono → primary (default ya aplicado en :host). */

    .box {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: var(--padding);
      border-radius: var(--border-radius);
      border-inline-start: var(--accent-width) solid var(--tone-color);
      /* Fondo tonal: el color del tono con baja opacidad (color-mix con fallback al borde fino). */
      background: color-mix(in srgb, var(--tone-color) calc(var(--background-opacity) * 100%), transparent);
      color: var(--color);
    }

    .icon {
      flex: 0 0 auto;
      font-size: 1.4rem;
      line-height: 1;
      color: var(--tone-color);
      margin-top: 0.05rem;
    }

    .content {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .row {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
    }
    .text {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .heading {
      font-weight: 700;
      font-size: 0.98rem;
      line-height: 1.3;
    }
    .body {
      font-size: 0.92rem;
      line-height: 1.45;
    }
    .actions {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    /* Si no hay actions, el slot queda vacío y no ocupa espacio. */
    .actions.empty { display: none; }

    .close {
      flex: 0 0 auto;
      background: none;
      border: 0;
      cursor: pointer;
      padding: 0.15rem;
      margin: -0.15rem -0.15rem 0 0;
      color: inherit;
      opacity: 0.6;
      font-size: 1.2rem;
      line-height: 1;
      border-radius: 4px;
      transition: background-color var(--ok-transition, 150ms ease), color var(--ok-transition, 150ms ease),
        border-color var(--ok-transition, 150ms ease), box-shadow var(--ok-transition, 150ms ease),
        opacity 0.15s ease, transform 120ms ease;
    }
    @media (hover: hover) {
      .close:hover { opacity: 1; background: rgba(var(--ion-text-color-rgb, 24, 24, 27), 0.07); }
    }
    .close:active { transform: scale(var(--ok-press-scale, 0.97)); }

    /* Móvil: las actions bajan bajo el texto (apiladas a ancho completo). */
    @media (max-width: 640px) {
      .row { flex-direction: column; align-items: stretch; }
      .actions { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) {
      .close:hover,
      .close:active { transform: none; }
    }
  `;
  }
  // Textos efectivos: defaults en inglés + overrides del consumidor.
  get t() {
    return { ...DEFAULT_LABELS, ...this.labels };
  }
  // Icono por defecto según el tono (overridable por la prop `icon`).
  defaultIcon() {
    switch (this.tone) {
      case "success":
        return iconCheckmarkCircle;
      case "warning":
        return iconWarning;
      case "danger":
        return iconAlertCircle;
      case "neutral":
        return iconInformationCircle;
      case "info":
      default:
        return iconInformationCircle;
    }
  }
  // Oculta el banner y avisa al consumidor; éste puede revertir restaurando `hidden=false`.
  dismiss() {
    this.hidden = true;
    this.dispatchEvent(new CustomEvent("ok-dismiss", { bubbles: true, composed: true }));
  }
  render() {
    const iconName = this.icon ?? this.defaultIcon();
    return b2`
      <div class="box" role="status">
        <ion-icon class="icon" .icon=${okIcon(iconName)} aria-hidden="true"></ion-icon>
        <div class="content">
          <div class="row">
            <div class="text">
              ${this.heading ? b2`<div class="heading">${this.heading}</div>` : null}
              <div class="body"><slot></slot></div>
            </div>
            <div class="actions ${this.hasActions ? "" : "empty"}">
              <slot name="actions" @slotchange=${this.onActionsSlotChange}></slot>
            </div>
          </div>
        </div>
        ${this.dismissible ? b2`
              <button class="close" aria-label=${this.t.dismiss} @click=${this.dismiss}>
                <ion-icon .icon=${iconClose} aria-hidden="true"></ion-icon>
              </button>
            ` : null}
      </div>
    `;
  }
};
__decorateClass3([
  n4({ type: String, reflect: true })
], OkInlineFeedback.prototype, "tone");
__decorateClass3([
  n4({ type: String })
], OkInlineFeedback.prototype, "heading");
__decorateClass3([
  n4({ type: String })
], OkInlineFeedback.prototype, "icon");
__decorateClass3([
  n4({ type: Boolean, reflect: true })
], OkInlineFeedback.prototype, "dismissible");
__decorateClass3([
  n4({ type: Boolean, reflect: true })
], OkInlineFeedback.prototype, "hidden");
__decorateClass3([
  n4({ attribute: false })
], OkInlineFeedback.prototype, "labels");
__decorateClass3([
  r5()
], OkInlineFeedback.prototype, "hasActions");
define("ok-inline-feedback", OkInlineFeedback);

// @erplora/outfitkit/dist/ok-qr.js
var __defProp4 = Object.defineProperty;
var __decorateClass4 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp4(target, key, result);
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
__decorateClass4([
  n4({ type: String })
], OkQr.prototype, "value");
__decorateClass4([
  n4({ type: String })
], OkQr.prototype, "ec");
__decorateClass4([
  n4({ type: Number })
], OkQr.prototype, "size");
__decorateClass4([
  n4({ type: String })
], OkQr.prototype, "color");
__decorateClass4([
  n4({ type: String })
], OkQr.prototype, "background");
__decorateClass4([
  n4({ type: Number })
], OkQr.prototype, "margin");
define("ok-qr", OkQr);

// @erplora/outfitkit/dist/ok-receipt.js
var __defProp5 = Object.defineProperty;
var __decorateClass5 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp5(target, key, result);
  return result;
};
var DEFAULT_LABELS2 = {
  empty: "No receipt data.",
  phone: "Tel.",
  receipt: "Receipt",
  servedBy: "Served by",
  customer: "Customer",
  table: "Table",
  item: "Item",
  amount: "Amount",
  noLines: "\u2014 No lines \u2014",
  subtotal: "Subtotal",
  total: "TOTAL",
  change: "Change"
};
function labelsOf(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((x2) => typeof x2 === "string" && x2.trim() !== "");
}
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
    .doc-title { text-align: center; font-size: 15px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 1mm; }
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
    /* #77 — Sub-líneas del menú (componentes) y de los suplementos: una por línea, 11px y 4mm de
       sangrado, como el papel HTML de sales. La nota (9px, una línea) era ilegible a un metro en
       el modal de la cuenta previa y no tenía jerarquía; LS Central, WooCommerce y Maitre'D listan
       los componentes sangrados bajo la línea del menú, sin importe. */
    .line-sub { font-size: 11px; padding-left: 4mm; word-break: break-word; }
    .line-sub::before { content: '› '; opacity: .6; }
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
    return { ...DEFAULT_LABELS2, ...this.labels };
  }
  cur() {
    return this.receipt?.currency ?? "\u20AC";
  }
  /** outfitkit#81 — el mismo formateador por cadena que `<ok-money>`: el entero se corta por
   *  `decimals` y se pinta con los separadores del idioma del documento. Sin `/100`, sin `toFixed`. */
  money(n6) {
    return formatMinor(n6, { decimals: this.receipt?.decimals ?? 2, locale: documentLocale(), currency: this.cur() });
  }
  render() {
    const r6 = this.receipt;
    if (!r6) return b2`<div class="paper empty">${this.t.empty}</div>`;
    return b2`<div class="paper" part="paper">
      ${r6.title ? b2`<div class="doc-title">${r6.title}</div>` : A}
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
        ${r6.number ? b2`<span>${this.t.receipt}: <strong>${r6.number}</strong></span>` : b2`<span></span>`}
        ${r6.datetime ? b2`<span>${r6.datetime}</span>` : A}
      </div>
      ${r6.cashier || r6.customer || r6.table ? b2`<div class="meta">
            ${r6.cashier ? b2`<span>${this.t.servedBy}: ${r6.cashier}</span>` : b2`<span></span>`}
            ${r6.table ? b2`<span>${this.t.table}: ${r6.table}</span>` : A}
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
        ${lines.map((l3) => {
      const comps = labelsOf(l3.components);
      const mods = labelsOf(l3.modifiers);
      const hasSub = comps.length > 0 || mods.length > 0;
      return b2`<tr>
              <td class="line-name">
                <div>${l3.name}</div>
                <div class="qty-price">${l3.qty} × ${this.money(l3.unit_price)}</div>
                ${comps.map((c5) => b2`<div class="line-sub comp">${c5}</div>`)}
                ${mods.map((m4) => b2`<div class="line-sub mod">${m4}</div>`)}
                ${!hasSub && l3.note ? b2`<div class="line-note">${l3.note}</div>` : A}
              </td>
              <td class="num">${this.money(l3.total)}</td>
            </tr>`;
    })}
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
__decorateClass5([
  n4({ attribute: false })
], OkReceipt.prototype, "receipt");
__decorateClass5([
  n4({ type: Number, attribute: "qr-size" })
], OkReceipt.prototype, "qrSize");
__decorateClass5([
  n4({ attribute: false })
], OkReceipt.prototype, "labels");
define("ok-receipt", OkReceipt);

// @erplora/outfitkit/dist/ok-invoice.js
var __defProp6 = Object.defineProperty;
var __decorateClass6 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp6(target, key, result);
  return result;
};
var DEFAULT_LABELS3 = {
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

    /* ── Papel ──────────────────────────────────────────────────────────────────────────────
       Una factura es un documento fiscal: acaba impresa, y en pantalla y en papel no se
       comporta igual. Lo que hay aquí resuelve lo que rompe al imprimir.

       NOTA: aquí NO va \`@page\` (tamaño y márgenes del folio). Es una at-rule de DOCUMENTO y
       dentro de un shadow root se IGNORA en silencio; la pone quien monta el documento —en el
       Hub, \`lib/print.ts\` al escribir el iframe aislado. */
    @media print {
      .sheet {
        /* En papel el ancho lo manda \`@page\`; forzar 210mm aquí provoca una segunda página
           en blanco cuando el navegador ya ha restado los márgenes. */
        width: auto;
        max-width: none;
        padding: 0;
      }
      /* Fondos y sombras: en pantalla ayudan a leer, en papel gastan tóner y salen sucios en
         láser monocroma. Se sustituye el relleno del bloque de receptor por un filete. */
      .bill-to {
        background: transparent;
        border: 1px solid var(--rule);
      }
      /* Que las cabeceras de la tabla se repitan en cada folio: una factura larga sin esto deja
         las columnas sin rotular a partir de la página 2. */
      table.lines thead { display: table-header-group; }
      table.lines tbody tr { break-inside: avoid; page-break-inside: avoid; }
      /* Los bloques que se leen como una unidad no se parten a la mitad. */
      .summary, .foot, .legal, .bill-to { break-inside: avoid; page-break-inside: avoid; }
      /* El total y el QR son lo que se comprueba de un vistazo: no deben quedar huérfanos. */
      .summary { break-before: avoid; page-break-before: avoid; }
    }
  `;
  }
  get t() {
    return { ...DEFAULT_LABELS3, ...this.labels };
  }
  cur() {
    return this.invoice?.currency ?? "\u20AC";
  }
  /** outfitkit#81 — importes ENTEROS en unidad mínima (ADR-0123), cortados por `decimals` y pintados
   *  con los separadores del idioma del documento (mismo formateador que `<ok-money>`). */
  money(n6) {
    return formatMinor(n6, { decimals: this.invoice?.decimals ?? 2, locale: documentLocale(), currency: this.cur() });
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
__decorateClass6([
  n4({ attribute: false })
], OkInvoice.prototype, "invoice");
__decorateClass6([
  n4({ type: Number, attribute: "qr-size" })
], OkInvoice.prototype, "qrSize");
__decorateClass6([
  n4({ attribute: false })
], OkInvoice.prototype, "labels");
define("ok-invoice", OkInvoice);

// ui/lib/public-claim.ts
var CLAIM_KIND = "invoice_request";
var CLAIM_COMMAND = "invoice.substitute";
var CLAIM_PUBLIC_FIELDS = ["customer_tax_id", "customer_name", "customer_address"];
async function mintInvoiceRequestClaim(invoiceId, items, opts = {}) {
  if (!invoiceId || !Array.isArray(items) || items.length === 0) return void 0;
  const doFetch = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!doFetch) return void 0;
  try {
    const res = await doFetch(opts.path ?? "/api/hub/public-claims", {
      method: "POST",
      // La sesión del cajero va con la llamada: same-origin, como todo lo que el WC pide al hub.
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: CLAIM_KIND,
        subject_id: invoiceId,
        command: CLAIM_COMMAND,
        sealed_payload: { original_invoice_id: invoiceId, items },
        public_fields: [...CLAIM_PUBLIC_FIELDS]
      })
    });
    if (!res.ok) return void 0;
    const body = await res.json();
    const locator = body.locator ?? body.data?.locator;
    if (!locator) return void 0;
    return { locator, url: body.url ?? body.data?.url ?? `/p/${locator}` };
  } catch {
    return void 0;
  }
}

// locales/es.json
var es_default = {
  name: "Ventas / TPV",
  description: "Terminal punto de venta: cierra y anula ventas, y consulta el hist\xF3rico y las m\xE9tricas.",
  navigation: {
    pos: {
      label: "Vender"
    },
    sales: {
      label: "Ventas"
    },
    settings: {
      label: "Ajustes TPV"
    },
    quick_notes: {
      label: "Notas r\xE1pidas"
    }
  },
  settings: {
    title: "TPV",
    fields: {
      allow_cash: {
        label: "Permitir efectivo"
      },
      allow_card: {
        label: "Permitir tarjeta"
      },
      allow_transfer: {
        label: "Permitir transferencia"
      },
      sync_products: {
        label: "Mostrar productos en el TPV",
        description: "Los productos se muestran cuando el m\xF3dulo Inventory est\xE1 instalado. Ap\xE1galo para vender solo servicios o l\xEDneas de precio libre."
      },
      sync_services: {
        label: "Mostrar servicios en el TPV",
        description: "Los servicios se muestran cuando el m\xF3dulo Services est\xE1 instalado. Ap\xE1galo para vender solo productos."
      },
      require_customer: {
        label: "Exigir cliente en cada venta"
      },
      allow_discounts: {
        label: "Permitir descuentos"
      },
      enable_parked_tickets: {
        label: "Permitir tiques aparcados"
      },
      default_tax_included: {
        label: "Precios con IVA incluido por defecto"
      },
      auto_invoice_with_tax_id: {
        label: "Emitir factura si el cliente tiene NIF"
      },
      default_document_format: {
        label: "Documento por defecto"
      },
      receipt_header: {
        label: "Cabecera del recibo",
        description: "Primera l\xEDnea = nombre; resto = direcci\xF3n."
      },
      receipt_footer: {
        label: "Pie del recibo"
      },
      receipt_footer_image: {
        label: "Imagen de pie (URL/base64)"
      },
      receipt_marketing_url: {
        label: "URL del QR promocional",
        description: "Rese\xF1as de Google, redes sociales, web\u2026 Vac\xEDo = sin QR promocional."
      },
      receipt_marketing_text: {
        label: "Texto del QR promocional",
        description: "P.ej. \xABEscanea y d\xE9janos una rese\xF1a\xBB."
      }
    }
  },
  roles: {
    cashier: {
      label: "Cajero"
    }
  },
  errors: {
    "sales.already_voided": "Esta venta ya est\xE1 anulada.",
    "sales.amount_negative": "La venta no puede llevar importes negativos.",
    "sales.catalog_unavailable": "No se ha podido cargar el cat\xE1logo de productos, as\xED que no se ha valorado ni cobrado nada.",
    "sales.combo_catalog_unavailable": "No se han podido cargar los men\xFAs, as\xED que no se ha cobrado nada. Comprueba que la app Combos est\xE1 instalada y vuelve a intentarlo.",
    "sales.combo_component_price_unknown": "Un componente del men\xFA no tiene precio de cat\xE1logo, as\xED que no se puede repartir su IVA. Ponle precio en el cat\xE1logo.",
    "sales.combo_group_over_max": "El men\xFA admite menos elecciones en ese plato. Quita una antes de cobrar.",
    "sales.combo_group_unresolved": "Al men\xFA le falta un plato por elegir. Compl\xE9talo antes de cobrar.",
    "sales.combo_not_available": "Ese men\xFA ya no est\xE1 en el cat\xE1logo. Quita la l\xEDnea y vuelve a a\xF1adirla.",
    "sales.combo_not_on_sale": "Ese men\xFA ya no est\xE1 a la venta. Qu\xEDtalo del tique o vuelve a activarlo en Combos.",
    "sales.combo_option_not_available": "Una de las elecciones del men\xFA ya no est\xE1 en el cat\xE1logo. Vuelve a elegirla.",
    "sales.combo_option_repeated": "Ese plato no admite elegir dos veces lo mismo.",
    "sales.combo_tax_category_missing": "Ese men\xFA no tiene categor\xEDa fiscal, as\xED que no se puede cobrar. Config\xFArala en Combos.",
    "sales.customer_required": "Este negocio exige un cliente en cada venta.",
    "sales.discount_out_of_range": "El descuento debe estar entre 0 % y 100 %, y nunca por encima del importe bruto.",
    "sales.discounts_not_allowed": "Este negocio no permite descuentos.",
    "sales.empty_sale": "A\xF1ade al menos una l\xEDnea antes de cobrar.",
    "sales.idempotency_key_required": "El cobro ha llegado sin clave de idempotencia, as\xED que se ha rechazado antes que arriesgarse a cobrar dos veces.",
    "sales.insufficient_tendered": "El importe entregado no cubre el total.",
    "sales.modifier_catalog_unavailable": "No se han podido cargar los suplementos, as\xED que no se ha podido valorar la l\xEDnea.",
    "sales.modifier_child_price_invalid": "Un suplemento se factura en l\xEDnea propia porque tributa a otro IVA, y esa l\xEDnea no puede valer cero o menos. Ponle precio en Suplementos, o qu\xEDtale la categor\xEDa fiscal.",
    "sales.modifier_not_available": "Uno de los suplementos de la l\xEDnea ya no est\xE1 en el cat\xE1logo. Vuelve a elegirlo.",
    "sales.no_tax_rule": "Una l\xEDnea tiene una categor\xEDa fiscal sin regla de IVA en este negocio. Config\xFArala en Impuestos antes de cobrar.",
    "sales.nothing_to_fire": "No hay nada que mandar a cocina: la comanda est\xE1 vac\xEDa, esta tanda ya se lanz\xF3, o el pedido no es de este negocio.",
    "sales.order_id_required": "Para mandar a cocina hace falta el pedido que se lanza.",
    "sales.order_line_modifiers_unreadable": "No se han podido leer los suplementos congelados en una l\xEDnea de la cuenta abierta, as\xED que no se ha valorado.",
    "sales.order_line_not_available": "Una l\xEDnea de la cuenta abierta ya no est\xE1. Vuelve a cargar la cuenta.",
    "sales.order_lines_unavailable": "No se han podido cargar las l\xEDneas de la cuenta abierta, as\xED que no se ha valorado nada.",
    "sales.order_unavailable": "Esa cuenta no es un pedido abierto de este negocio.",
    "sales.payment_method_not_available": "Ese medio de pago no est\xE1 disponible en este negocio.",
    "sales.payment_method_required": "Elige un medio de pago antes de cobrar.",
    "sales.payments_do_not_match_total": "Los pagos repartidos no suman el total de la venta. Revisa los importes y vuelve a cobrar.",
    "sales.product_not_available": "Un producto del tique ya no est\xE1 en el cat\xE1logo. Quita la l\xEDnea y vuelve a a\xF1adirla.",
    "sales.quantity_not_positive": "Una l\xEDnea no tiene cantidad: pon al menos una antes de cobrar.",
    "sales.quantity_off_grid": "La cantidad no encaja con el escal\xF3n del producto.",
    "sales.quick_note_not_found": "Esa nota r\xE1pida ya no est\xE1 en este negocio. Recarga la lista y vuelve a intentarlo.",
    "sales.refund_amount_invalid": "Cada pata de una devoluci\xF3n necesita un importe positivo.",
    "sales.refund_exceeds_tender": "A un medio de pago se le est\xE1 devolviendo m\xE1s de lo que cobr\xF3.",
    "sales.refund_method_unavailable": "Ese medio de pago no est\xE1 disponible en este negocio, as\xED que el dinero no puede volver por ah\xED.",
    "sales.refund_nothing_to_return": "No queda nada por devolver en esta venta.",
    "sales.refund_reason_required": "Una devoluci\xF3n necesita un motivo.",
    "sales.refund_requires_completed": "Solo se puede devolver una venta cerrada.",
    "sales.refund_tender_duplicated": "El mismo medio de pago aparece dos veces en la devoluci\xF3n. Ponlo en una sola pata.",
    "sales.refund_tender_not_eligible": "Ese medio de pago no puede recuperar su propio dinero. Elige otro destino.",
    "sales.refund_tender_unknown": "Ese medio de pago no es una de las formas en que se cobr\xF3 esta venta.",
    "sales.sale_already_refunded": "Esta venta ya tiene devoluciones, as\xED que ya no se puede anular. Devuelve lo que queda.",
    "sales.sale_not_found": "Esa venta no es de este negocio.",
    "sales.tax_catalog_unavailable": "No se han podido cargar las reglas de IVA, as\xED que no se ha cobrado nada. Vuelve a intentarlo y, si persiste, avisa al encargado.",
    "sales.tax_rate_out_of_range": "Un tipo de IVA del tique est\xE1 fuera de rango.",
    "sales.too_many_lines": "El tique tiene demasiadas l\xEDneas para cobrarlo de una vez. Div\xEDdelo en dos.",
    "sales.too_many_rows": "La venta necesita m\xE1s filas de las que el servidor puede escribir de una vez. Div\xEDdela en dos.",
    "sales.void_reason_required": "Hace falta un motivo para anular una venta.",
    "sales.void_requires_credit_note": "Esta venta lleva factura completa: emite una factura rectificativa en vez de anularla."
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
    errorLoadSale: "No se ha podido cargar la venta, as\xED que todav\xEDa no hay nada que devolver. Vuelve a intentarlo.",
    print: "Imprimir",
    printFailed: "No se pudo imprimir",
    qrValidateNote: "Escanea para validar la factura en la AEAT",
    claimNote: "Pide tu factura",
    docEmpty: "Sin datos de tiquet.",
    docEmptyInvoice: "Sin datos de factura.",
    docDefaultBusiness: "Mi negocio",
    docPhone: "Tel.",
    docReceipt: "Tiquet",
    docServedBy: "Atendido por",
    docTable: "Mesa",
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
    parkedTickets: "Cuentas abiertas",
    openCart: "Abrir carrito",
    openCartWithItems: "Abrir carrito, {count} art\xEDculos",
    openChecksAction: "Cuentas",
    openChecksHint: "Toca una cuenta para retomarla.",
    parkForLaterHint: "Aparca la cuenta actual para retomarla m\xE1s tarde. El t\xEDtulo es opcional.",
    leaveAtTableHint: "La cuenta actual seguir\xE1 en {label}; podr\xE1s retomarla desde su mesa o desde esta lista.",
    newCheckTitle: "Cuenta nueva",
    checkTitleLabel: "T\xEDtulo de la cuenta",
    editCheckTitle: "Editar t\xEDtulo de la cuenta",
    errorSavingTitle: "No se pudo guardar el t\xEDtulo de la cuenta",
    noCheckContext: "Cuenta sin mesa ni cliente",
    accountTab: "Cuenta",
    currentCommandTab: "Comanda actual",
    currentCommandHint: "Revisa cantidades y asignaciones. Al enviar, estas l\xEDneas quedar\xE1n agrupadas como una comanda recuperable.",
    noPendingCommand: "Todo est\xE1 enviado",
    noPendingCommandHint: "A\xF1ade productos para preparar una nueva comanda.",
    pendingSwitchTitle: "Productos sin enviar",
    pendingBeforeSwitch: "Hay productos en la comanda actual sin enviar ({count}). Env\xEDalos o elim\xEDnalos antes de cambiar de cuenta.",
    pendingStatus: "Pendiente",
    commandRound: "Comanda {n}",
    retrieveHint: "Cobra o aparca la venta actual para recuperar un ticket.",
    retrieve: "Recuperar",
    noParkedTickets: "No hay cuentas abiertas",
    errorPark: "No se pudo aparcar el ticket",
    errorRetrieve: "No se pudo recuperar el ticket",
    tendered: "Entregado",
    change: "Cambio",
    confirmCharge: "Confirmar cobro",
    charging: "Cobrando\u2026",
    errorCharge: "Error al cobrar",
    errorEmptySale: "A\xF1ade al menos una l\xEDnea antes de cobrar",
    errorPaymentMethod: "Elige un m\xE9todo de pago v\xE1lido",
    errorDiscountsOff: "Este negocio no permite descuentos",
    errorDiscountRange: "El descuento debe estar entre 0 % y 100 %",
    errorCustomerRequired: "Este negocio exige un cliente en cada venta",
    errorAmountNegative: "La venta no puede llevar importes negativos",
    errorInsufficientTendered: "El importe entregado no cubre el total",
    errorNoTaxRule: "Una l\xEDnea tiene una categor\xEDa fiscal sin regla de IVA en este negocio: config\xFArala en Impuestos antes de cobrar",
    errorModifierChildPrice: "Un suplemento de esa l\xEDnea se factura aparte porque tributa a otro IVA, y una l\xEDnea propia no puede valer cero o menos. Ponle precio en Suplementos, o qu\xEDtale la categor\xEDa fiscal",
    errorTaxCatalogUnavailable: "No se han podido cargar las reglas de IVA, as\xED que no se ha cobrado nada. Vuelve a intentarlo y, si persiste, avisa al encargado",
    all: "Todos",
    categoryFilter: "Categor\xEDas",
    products: "productos",
    items: "art\xEDculos",
    previous: "Anterior",
    next: "Siguiente",
    searchProductPlaceholder: "Buscar producto\u2026",
    searchAction: "Buscar",
    assign: "Asignar",
    noProducts: "Sin productos.",
    catalogAppAbsent: "{app} no est\xE1 instalada, as\xED que no hay rejilla de productos. Puedes cobrar servicios y ventas a precio libre; inst\xE1lala desde el marketplace para vender desde un cat\xE1logo.",
    notSellableBadge: "Falta el IVA",
    notSellableNoTaxCategory: "No se puede vender: sin categor\xEDa fiscal. Falta configurar el IVA.",
    notSellableNoTaxRule: "No se puede vender: su categor\xEDa fiscal no tiene tipo. Falta configurar el IVA.",
    catalogBlockedOne: "1 art\xEDculo no se puede vender: le falta configurar el IVA.",
    catalogBlocked: "{count} art\xEDculos no se pueden vender: les falta configurar el IVA.",
    catalogBlockedFix: "Revisar el cat\xE1logo",
    openPrice: "Precio libre",
    department: "Departamento (IVA)",
    noDepartments: "Sin departamentos configurados.",
    add: "A\xF1adir",
    sale: "Venta",
    cartEmptyTouch: "Toca un producto para a\xF1adirlo.",
    parkCurrentSale: "Aparcar esta cuenta",
    closeAction: "Cerrar",
    fullscreen: "Pantalla completa",
    giftBadge: "Invitaci\xF3n",
    giftAction: "Invitar / quitar invitaci\xF3n",
    printPrebill: "Imprimir cuenta",
    prebillTitle: "Cuenta",
    prebillNotice: "Cuenta \u2014 no es una factura. El tiquet fiscal se entrega al cobrar.",
    prebillPrintFailed: "No se pudo imprimir la cuenta",
    paymentMethod: "Forma de pago",
    documentFormat: "Documento",
    docTicket: "Tique",
    printReceipt: "Imprimir tiquet",
    parkedAs: "Aparcado como {number}",
    fireToKitchen: "Enviar a cocina",
    firedToKitchen: "Enviado a cocina",
    fireFailed: "No se pudo enviar a cocina",
    splitFailed: "No se pudo dividir la cuenta",
    lineNotSaved: "No se pudo guardar ese art\xEDculo \u2014 vuelve a tocarlo",
    linePaidElsewhere: "Ya pagado",
    lineTenders: "L\xEDneas pagadas de otra forma",
    tenderOneSessionPerLine: "Un canje cubre una l\xEDnea: separa la l\xEDnea para poder canjearla.",
    serverUnavailable: "El servidor no responde (puede estar reinici\xE1ndose). Int\xE9ntalo de nuevo en unos segundos y, si persiste, avisa al encargado.",
    checkoutUnknown: "No hemos podido confirmar si el cobro se complet\xF3. Compru\xE9balo en Ventas antes de volver a cobrar.",
    checkSales: "Comprobar en Ventas",
    payingPart: "Cobrando {n} l\xEDnea(s) de {total}",
    payExact: "Importe exacto",
    payCardHint: "Cobra {amount} en el dat\xE1fono y confirma.",
    chargeWithCard: "Cobrar {amount} con tarjeta",
    parkTitle: "Aparcar cuenta",
    parkNameLabel: "T\xEDtulo opcional",
    parkNameHint: "El t\xEDtulo es opcional y solo sirve para reconocer la cuenta cuando quieras retomarla.",
    parkNamePlaceholder: "p. ej. Ana \u2014 terraza",
    parkedToast: "Aparcada como \xAB{name}\xBB",
    leftAtTable: "La cuenta se queda en {label}",
    dirtyCartTitle: "Tienes una cuenta a medias",
    dirtyCartBody: "\xBFQu\xE9 hacemos con la cuenta actual?",
    parkAndOpen: "Aparcarla y abrir",
    discardAndOpen: "Eliminarla y abrir",
    cancel: "Cancelar",
    deleteCheck: "Eliminar cuenta",
    deleteCheckConfirm: "Toca otra vez para eliminar \u2014 anula la cuenta",
    courseInProgress: "Pendiente de enviar",
    qtyOffGrid: "La cantidad no encaja con el escal\xF3n del producto",
    scaleUnitMismatch: "La b\xE1scula pesa en {scale} y esta l\xEDnea va en {line}",
    leaveAtTable: "Dejar en la mesa",
    sentHeader: "Enviado",
    limitBlockedTitle: "Esta venta no puede ser un tique",
    limitBlockedBody: "Por encima de {max} la ley obliga a factura completa. Rellena los datos del cliente y cobra como siempre.",
    limitReadyTitle: "Esta venta sale como factura completa",
    limitReadyBody: "El cliente est\xE1 identificado, as\xED que el documento es una factura y no un tique.",
    limitFieldName: "Nombre o raz\xF3n social",
    limitFieldTaxId: "NIF",
    limitFieldAddress: "Domicilio",
    limitChargeBlocked: "Faltan los datos del cliente",
    tenderedShort: "Lo entregado no cubre el total",
    colDate: "Fecha",
    rangeLabel: "Periodo",
    rangeToday: "Hoy",
    range7d: "7 d\xEDas",
    range30d: "30 d\xEDas",
    rangeAll: "Todo",
    kpiTax: "IVA",
    kpiDiscounts: "Descuentos",
    kpiVoided: "Anuladas",
    discountLine: "Descuento en la l\xEDnea",
    discountLineOf: "Descuento en {name}",
    discountTicket: "Descuento del ticket",
    discountApply: "Aplicar",
    discountRemove: "Quitar",
    actionVoid: "Anular",
    voidTitle: "Anular la venta {number}",
    voidExplain: "La venta queda registrada como anulada; caja y stock se revierten una sola vez. El motivo es obligatorio.",
    voidReasonPlaceholder: "Motivo (obligatorio)",
    voidDone: "Venta anulada",
    voidFailed: "No se ha podido anular la venta",
    voidRequiresCreditNote: "Esta venta lleva factura completa: emite una factura rectificativa en vez de anularla",
    voidAlreadyVoided: "Esta venta ya est\xE1 anulada",
    voidAlreadyRefunded: "Esta venta ya tiene devoluciones: devuelve el importe que queda en vez de anularla",
    voidReasonRequired: "Hace falta un motivo para anular una venta",
    voidSaleNotFound: "Esa venta no est\xE1 en este negocio",
    taxSurcharge: "RE",
    screenMenu: "Pantalla",
    exitFullscreen: "Salir de pantalla completa",
    modifiers: "Opciones",
    modifierRequired: "Elige {n}",
    modifierUpTo: "Hasta {n}",
    modifierOptional: "Opcional",
    modifierPickOne: "Elige una opci\xF3n para continuar",
    remaining: "Restante",
    splitPayment: "Repartir el cobro",
    addTender: "A\xF1adir este cobro",
    legAmount: "Importe de este cobro",
    paymentsTaken: "Cobros tomados",
    tenderRemainingBlock: "Faltan {amount} por cubrir para poder cobrar la venta.",
    tenderRemainingShort: "Faltan {amount}",
    editTender: "Editar {name}, {amount}",
    removeTender: "Quitar {name}, {amount}",
    errorPaymentsMismatch: "El total ha cambiado mientras se repart\xEDa el cobro. Revisa los importes y vuelve a cobrar.",
    errorQuantityNotPositive: "Una l\xEDnea no tiene cantidad: pon al menos una antes de cobrar",
    actionRefund: "Devolver",
    statusRefunded: "Devuelta",
    refundTitle: "Devolver la venta {number}",
    refundExplain: "Elige cu\xE1nto vuelve por cada forma en que se pag\xF3. El reparto de abajo es una propuesta: cambia el importe que quieras.",
    refundLoading: "Cargando lo que se puede devolver\u2026",
    refundNothing: "No queda nada por devolver en esta venta.",
    refundLegCharged: "Cobrado",
    refundLegRefunded: "Ya devuelto",
    refundLegRemaining: "Devolvible",
    refundTotalLabel: "Se devuelve",
    refundProposeAll: "Devolver todo",
    refundDestination: "Devolver por",
    refundNeedsDestination: "{method}: elige por d\xF3nde vuelve este dinero.",
    refundOverCap: "{method}: {amount} es m\xE1s que los {remaining} que quedan por devolver.",
    refundNothingToReturn: "Escribe cu\xE1nto vuelve.",
    refundReasonLabel: "Motivo",
    refundReasonRequired: "Una devoluci\xF3n necesita un motivo.",
    refundReasonPlaceholder: "Por qu\xE9 vuelve el dinero",
    refundReasonAlreadyRefunded: "Ya se devolvi\xF3 entero.",
    refundReasonMethodUnavailable: "Ese medio de pago ya no est\xE1 disponible.",
    refundReasonNotEligible: "No puede volver por donde se cobr\xF3.",
    refundConfirm: "Devolver {amount}",
    refundDone: "Devoluci\xF3n registrada.",
    refundFailed: "No se ha podido registrar la devoluci\xF3n.",
    refundLineTenders: "L\xEDneas pagadas de otra forma",
    refundLineTendersHint: "Estas l\xEDneas no costaron dinero, as\xED que no entran en el reparto de arriba. Lo que vuelve a ellas se decide aqu\xED.",
    refundTenderPending: "El dinero ha vuelto, pero lo que se pag\xF3 de otra forma no se ha podido devolver. Rev\xEDsalo desde su m\xF3dulo.",
    refundExceedsTender: "A un medio de pago se le est\xE1 devolviendo m\xE1s de lo que cobr\xF3.",
    refundSaleNotFound: "Esa venta no es de este negocio.",
    refundRequiresCompleted: "Solo se puede devolver una venta cerrada.",
    refundMethodUnavailable: "Ese medio de pago no est\xE1 disponible en este negocio.",
    refundLegAmount: "Importe a devolver",
    errorComboCatalogUnavailable: "No se han podido cargar los men\xFAs, as\xED que no se ha cobrado nada. Comprueba que el m\xF3dulo Combos est\xE1 instalado y vuelve a intentarlo",
    errorComboNotAvailable: "Ese men\xFA ya no est\xE1 en el cat\xE1logo: quita la l\xEDnea y vuelve a a\xF1adirla",
    errorComboNotOnSale: "Ese men\xFA ya no est\xE1 a la venta. Qu\xEDtalo del tique o vuelve a activarlo en Combos",
    errorComboOptionNotAvailable: "Una de las elecciones del men\xFA ya no est\xE1 en el cat\xE1logo: vuelve a elegirla",
    errorComboGroupUnresolved: "Al men\xFA le falta un plato por elegir. Compl\xE9talo antes de cobrar",
    errorComboGroupOverMax: "El men\xFA admite menos elecciones en ese plato. Quita una antes de cobrar",
    errorComboOptionRepeated: "Ese plato no admite elegir dos veces lo mismo",
    errorComboComponentPriceUnknown: "Un componente del men\xFA no tiene precio de cat\xE1logo, as\xED que no se puede repartir su IVA. Ponle precio en el cat\xE1logo",
    errorComboTaxCategoryMissing: "Ese men\xFA no tiene categor\xEDa fiscal, as\xED que no se puede cobrar. Config\xFArala en Combos",
    errorTooManyLines: "El tique tiene demasiadas l\xEDneas para cobrarlo de una vez. Div\xEDdelo en dos",
    comboBadge: "Men\xFA",
    comboCatalogUnavailable: "No se han podido cargar los men\xFAs, as\xED que no se ofrece ninguno. Revisa el m\xF3dulo Combos e int\xE9ntalo de nuevo",
    comboGroupUnresolved: "Elige {n} en {group}",
    comboGroupOverMax: "{group} admite solo {n}",
    comboOptionRepeated: "{group} no admite el mismo art\xEDculo dos veces",
    comboRemoveOne: "Quitar un {name}",
    missingAppCharge: "{app} no est\xE1 instalada, as\xED que no se puede cobrar. Inst\xE1lala desde el marketplace.",
    missingAppChargeShort: "Falta {app}",
    appTaxes: "Impuestos",
    appInventory: "Inventario",
    appCatalogUnavailable: "{app} no ha respondido, as\xED que su cat\xE1logo puede estar incompleto. Revisa la aplicaci\xF3n y vuelve a cargar el TPV.",
    posSettingsUnavailable: "El TPV no ha podido leer sus propios ajustes, as\xED que muestra los valores por defecto. Vuelve a cargar para reintentarlo.",
    errorMissingApp: "La venta se ha rechazado porque falta una app que necesita. No se ha cobrado nada.",
    servedBy: "Atiende {name}",
    staffMe: "yo",
    staffMeOption: "Yo (quien tenga la sesi\xF3n)",
    staffAssigned: "el profesional asignado",
    staffPickerTitle: "Qui\xE9n atiende esta cuenta",
    staffPickerHint: "A esta persona se le atribuyen la venta, la comanda de cocina y el informe por persona. Si lo dejas en \xABYo\xBB, el TPV usa a quien tenga la sesi\xF3n.",
    staffPickerEmpty: "Este hub no tiene a nadie m\xE1s para atender. Da de alta personal en Ajustes.",
    staffLoading: "Cargando el equipo\u2026",
    staffLoadFailed: "No se ha podido cargar el equipo. La venta se sigue atribuyendo a quien tenga la sesi\xF3n.",
    lineNote: "Nota",
    lineNoteOf: "Nota en {name}",
    lineNotePlaceholder: "p. ej. poco hecho, alergia al marisco, sin hielo",
    lineNoteHint: "Cocina lee esta nota en la comanda.",
    lineNoteSave: "Guardar",
    lineNoteRemove: "Quitar",
    quickNotesTitle: "Notas r\xE1pidas",
    quickNotesIntro: "Las notas que el TPV ofrece de un toque en la hoja de nota de la l\xEDnea. Escribir a mano sigue funcionando.",
    quickNoteText: "Nota",
    quickNoteOrder: "Posici\xF3n",
    quickNotesEmpty: "Todav\xEDa no hay notas r\xE1pidas. A\xF1ade las que tu cocina oye a diario: \xABsin sal\xBB, \xABpoco hecho\xBB, \xABsin hielo\xBB.",
    quickNotesLoading: "Cargando notas r\xE1pidas\u2026",
    quickNotesSearch: "Buscar una nota\u2026",
    quickNoteAdd: "A\xF1adir",
    quickNoteSave: "Guardar",
    quickNoteSaving: "Guardando\u2026",
    quickNoteEdit: "Editar",
    quickNoteEditing: "Editando",
    quickNoteEditCancel: "Cancelar edici\xF3n",
    quickNoteDelete: "Eliminar",
    quickNoteDeleteTitle: "Eliminar nota r\xE1pida",
    quickNoteDeleteHint: "Deja de ofrecerse en el TPV. Las notas ya escritas en cuentas y ventas conservan su texto.",
    quickNoteCancel: "Cancelar",
    quickNoteSaveFailed: "No se ha podido guardar la nota r\xE1pida.",
    quickNoteDeleteFailed: "No se ha podido eliminar la nota r\xE1pida.",
    quickNotesLoadFailed: "No se han podido cargar las notas r\xE1pidas.",
    lineNoteQuickLoading: "Cargando notas r\xE1pidas\u2026",
    lineNoteQuickError: "No se han podido cargar las notas r\xE1pidas: escribe la nota a mano.",
    customerRequiredCharge: "Este negocio exige un cliente en cada venta. Elige uno para seguir con el cobro.",
    customerRequiredShort: "Falta el cliente",
    customerRequiredNoApp: "Este negocio exige un cliente en cada venta y la aplicaci\xF3n {app} no est\xE1 instalada: esta venta no se puede cerrar desde aqu\xED.",
    appCustomers: "Clientes"
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
    },
    quick_notes: {
      label: "Quick notes"
    }
  },
  settings: {
    title: "Point of sale",
    fields: {
      allow_cash: {
        label: "Allow cash"
      },
      allow_card: {
        label: "Allow card"
      },
      allow_transfer: {
        label: "Allow bank transfer"
      },
      sync_products: {
        label: "Show products in the till",
        description: "Products show up when the Inventory module is installed. Turn it off to sell only services or free-price lines."
      },
      sync_services: {
        label: "Show services in the till",
        description: "Services show up when the Services module is installed. Turn it off to sell only products."
      },
      require_customer: {
        label: "Require a customer on every sale"
      },
      allow_discounts: {
        label: "Allow discounts"
      },
      enable_parked_tickets: {
        label: "Allow parked tickets"
      },
      default_tax_included: {
        label: "Prices include VAT by default"
      },
      auto_invoice_with_tax_id: {
        label: "Issue an invoice when the customer has a tax ID"
      },
      default_document_format: {
        label: "Default document"
      },
      receipt_header: {
        label: "Receipt header",
        description: "First line = name; the rest = address."
      },
      receipt_footer: {
        label: "Receipt footer"
      },
      receipt_footer_image: {
        label: "Footer image (URL/base64)"
      },
      receipt_marketing_url: {
        label: "Promotional QR URL",
        description: "Google reviews, social media, your website\u2026 Empty = no promotional QR."
      },
      receipt_marketing_text: {
        label: "Promotional QR text",
        description: "For example \xABScan and leave us a review\xBB."
      }
    }
  },
  roles: {
    cashier: {
      label: "Cashier"
    }
  },
  errors: {
    "sales.already_voided": "This sale is already voided.",
    "sales.amount_negative": "The sale cannot carry negative amounts.",
    "sales.catalog_unavailable": "The product catalogue could not be loaded, so nothing was priced and nothing was charged.",
    "sales.combo_catalog_unavailable": "The menus could not be loaded, so nothing was charged. Check that the Combos app is installed and try again.",
    "sales.combo_component_price_unknown": "A component of the menu has no catalogue price, so its share of the VAT cannot be worked out. Give it a price in the catalogue.",
    "sales.combo_group_over_max": "The menu allows fewer choices in that course. Remove one before charging.",
    "sales.combo_group_unresolved": "The menu has a course still to be chosen. Complete it before charging.",
    "sales.combo_not_available": "That menu is not in the catalogue any more. Remove the line and add it again.",
    "sales.combo_not_on_sale": "That menu is no longer on sale. Remove it from the ticket, or put it back on sale in Combos.",
    "sales.combo_option_not_available": "One of the choices in the menu is no longer in the catalogue. Pick it again.",
    "sales.combo_option_repeated": "That course does not allow choosing the same item twice.",
    "sales.combo_tax_category_missing": "That menu has no tax category, so it cannot be charged. Set it in Combos.",
    "sales.customer_required": "This business requires a customer on every sale.",
    "sales.discount_out_of_range": "The discount must be between 0 % and 100 %, and never more than the gross amount.",
    "sales.discounts_not_allowed": "This business does not allow discounts.",
    "sales.empty_sale": "Add at least one line before charging.",
    "sales.idempotency_key_required": "The checkout arrived with no idempotency key, so it was refused rather than risk charging twice.",
    "sales.insufficient_tendered": "The amount tendered does not cover the total.",
    "sales.modifier_catalog_unavailable": "The supplements could not be loaded, so the line could not be priced.",
    "sales.modifier_child_price_invalid": "A supplement bills on a line of its own because it taxes at a different VAT rate, and that line cannot be worth zero or less. Give it a price in Modifiers, or take its tax category off.",
    "sales.modifier_not_available": "One of the supplements on the line is no longer in the catalogue. Pick it again.",
    "sales.no_tax_rule": "A line has a tax category with no VAT rule in this business. Set it up in Taxes before charging.",
    "sales.nothing_to_fire": "There is nothing to send to the kitchen: the check is empty, this round was already fired, or the order is not in this business.",
    "sales.order_id_required": "Sending to the kitchen needs the order it fires.",
    "sales.order_line_modifiers_unreadable": "The supplements frozen on a line of the open check could not be read, so the check was not priced.",
    "sales.order_line_not_available": "A line of the open check is no longer there. Load the check again.",
    "sales.order_lines_unavailable": "The lines of the open check could not be loaded, so nothing was priced.",
    "sales.order_unavailable": "That check is not an open order of this business.",
    "sales.payment_method_not_available": "That payment method is not available in this business.",
    "sales.payment_method_required": "Pick a payment method before charging.",
    "sales.payments_do_not_match_total": "The split payments do not add up to the total of the sale. Check the amounts and charge again.",
    "sales.product_not_available": "A product on the ticket is no longer in the catalogue. Remove the line and add it again.",
    "sales.quantity_not_positive": "A line has no quantity: set at least one before charging.",
    "sales.quantity_off_grid": "The quantity does not fit the product's step.",
    "sales.quick_note_not_found": "That quick note is not in this business any more. Reload the list and try again.",
    "sales.refund_amount_invalid": "Every leg of a refund needs a positive amount.",
    "sales.refund_exceeds_tender": "One tender is being given back more than it was charged.",
    "sales.refund_method_unavailable": "That payment method is not available in this business, so the money cannot go back through it.",
    "sales.refund_nothing_to_return": "There is nothing left to refund on this sale.",
    "sales.refund_reason_required": "A refund needs a reason.",
    "sales.refund_requires_completed": "Only a completed sale can be refunded.",
    "sales.refund_tender_duplicated": "The same tender appears twice in the refund. Put it on a single leg.",
    "sales.refund_tender_not_eligible": "That tender cannot take its own money back. Choose another destination.",
    "sales.refund_tender_unknown": "That tender is not one of the ways this sale was paid.",
    "sales.sale_already_refunded": "This sale already has refunds, so it can no longer be voided. Refund what is left instead.",
    "sales.sale_not_found": "That sale is not in this business.",
    "sales.tax_catalog_unavailable": "The VAT rules could not be loaded, so nothing was charged. Try again; if it keeps happening, call the manager.",
    "sales.tax_rate_out_of_range": "A VAT rate on the ticket is out of range.",
    "sales.too_many_lines": "The ticket has too many lines to be charged in one go. Split it into two.",
    "sales.too_many_rows": "The sale needs more rows than the server can write in one go. Split it into two.",
    "sales.void_reason_required": "A reason is required to void a sale.",
    "sales.void_requires_credit_note": "This sale carries a full invoice: issue a credit note instead of voiding it."
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
    errorLoadSale: "The sale could not be loaded, so there is nothing to refund yet. Try again.",
    print: "Print",
    printFailed: "Could not print",
    qrValidateNote: "Scan to validate the invoice at the AEAT",
    claimNote: "Get your invoice",
    docEmpty: "No receipt data.",
    docEmptyInvoice: "No invoice data.",
    docDefaultBusiness: "My business",
    docPhone: "Tel.",
    docReceipt: "Receipt",
    docServedBy: "Served by",
    docTable: "Table",
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
    parkedTickets: "Open checks",
    openCart: "Open cart",
    openCartWithItems: "Open cart, {count} items",
    openChecksAction: "Checks",
    openChecksHint: "Tap a check to resume it.",
    parkForLaterHint: "Park the current check to resume it later. The title is optional.",
    leaveAtTableHint: "The current check will remain on {label}; resume it from its table or this list.",
    newCheckTitle: "New check",
    checkTitleLabel: "Check title",
    editCheckTitle: "Edit check title",
    errorSavingTitle: "The check title could not be saved",
    noCheckContext: "Check without table or customer",
    accountTab: "Account",
    currentCommandTab: "Current order",
    currentCommandHint: "Review quantities and assignments. Sending groups these lines into a recoverable production order.",
    noPendingCommand: "Everything has been sent",
    noPendingCommandHint: "Add products to prepare another production order.",
    pendingSwitchTitle: "Unsent products",
    pendingBeforeSwitch: "There are unsent products in the current order ({count}). Send or remove them before switching checks.",
    pendingStatus: "Pending",
    commandRound: "Order {n}",
    retrieveHint: "Charge or park the current sale to retrieve a ticket.",
    retrieve: "Retrieve",
    noParkedTickets: "No open checks",
    errorPark: "Could not park the ticket",
    errorRetrieve: "Could not retrieve the ticket",
    tendered: "Tendered",
    change: "Change",
    confirmCharge: "Confirm charge",
    charging: "Charging\u2026",
    errorCharge: "Error charging",
    errorEmptySale: "Add at least one line before charging",
    errorPaymentMethod: "Pick a valid payment method",
    errorDiscountsOff: "This business does not allow discounts",
    errorDiscountRange: "The discount must be between 0 % and 100 %",
    errorCustomerRequired: "This business requires a customer on every sale",
    errorAmountNegative: "The sale cannot carry negative amounts",
    errorInsufficientTendered: "The amount tendered does not cover the total",
    errorNoTaxRule: "A line has a tax category with no VAT rule in this business \u2014 set it up in Taxes before charging",
    errorModifierChildPrice: "A supplement on that line bills on a line of its own because it taxes at a different VAT rate, and a line of its own cannot be worth zero or less. Give it a price in Modifiers, or take its tax category off",
    errorTaxCatalogUnavailable: "The VAT rules could not be loaded, so nothing was charged. Try again; if it keeps happening, call the manager",
    all: "All",
    categoryFilter: "Categories",
    products: "products",
    items: "items",
    previous: "Previous",
    next: "Next",
    searchProductPlaceholder: "Search product\u2026",
    searchAction: "Search",
    assign: "Assign",
    noProducts: "No products.",
    catalogAppAbsent: "{app} is not installed, so there is no product grid. You can still charge services and free-price sales; install it from the marketplace to sell from a catalogue.",
    notSellableBadge: "VAT missing",
    notSellableNoTaxCategory: "Cannot be sold: no tax category. VAT needs to be set up.",
    notSellableNoTaxRule: "Cannot be sold: its tax category has no rate. VAT needs to be set up.",
    catalogBlockedOne: "1 item cannot be sold: its VAT is not set up.",
    catalogBlocked: "{count} items cannot be sold: their VAT is not set up.",
    catalogBlockedFix: "Review the catalogue",
    openPrice: "Open price",
    department: "Department (VAT)",
    noDepartments: "No departments configured.",
    add: "Add",
    sale: "Sale",
    cartEmptyTouch: "Tap a product to add it.",
    parkCurrentSale: "Park this check",
    closeAction: "Close",
    fullscreen: "Full screen",
    giftBadge: "Gift",
    giftAction: "Comp / un-comp line",
    printPrebill: "Print bill",
    prebillTitle: "Bill",
    prebillNotice: "Bill \u2014 this is not an invoice. The fiscal receipt is issued on payment.",
    prebillPrintFailed: "Bill could not be printed",
    paymentMethod: "Payment method",
    documentFormat: "Document",
    docTicket: "Receipt",
    printReceipt: "Print receipt",
    parkedAs: "Parked as {number}",
    fireToKitchen: "Send to kitchen",
    firedToKitchen: "Sent to kitchen",
    fireFailed: "Couldn't send to kitchen",
    splitFailed: "Couldn't split the check",
    lineNotSaved: "Couldn't save that item \u2014 tap again",
    linePaidElsewhere: "Prepaid",
    lineTenders: "Lines paid another way",
    tenderOneSessionPerLine: "One redemption covers one line: split the line to redeem it.",
    serverUnavailable: "The server isn't responding (it may be restarting). Try again in a few seconds and, if it keeps happening, call the manager.",
    checkoutUnknown: "We couldn't confirm whether this charge went through. Check it in Sales before charging again.",
    checkSales: "Check in Sales",
    payingPart: "Paying {n} of {total}",
    qtyOffGrid: "Quantity doesn't fit the product's step",
    scaleUnitMismatch: "The scale weighs in {scale} and this line is priced in {line}",
    payExact: "Exact amount",
    payCardHint: "Charge {amount} on the card terminal, then confirm.",
    chargeWithCard: "Charge {amount} by card",
    parkTitle: "Park check",
    parkNameLabel: "Optional title",
    parkNameHint: "The title is optional and only helps identify the check when you resume it.",
    parkNamePlaceholder: "e.g. Ana \u2014 terrace",
    parkedToast: "Parked as \u201C{name}\u201D",
    leftAtTable: "Check stays on {label}",
    dirtyCartTitle: "You have a check in progress",
    dirtyCartBody: "What should we do with the current check?",
    parkAndOpen: "Park it and open",
    discardAndOpen: "Delete it and open",
    cancel: "Cancel",
    deleteCheck: "Delete check",
    deleteCheckConfirm: "Tap again to delete \u2014 this voids the check",
    courseInProgress: "Unsent",
    leaveAtTable: "Leave on the table",
    sentHeader: "Sent",
    limitBlockedTitle: "This sale cannot be a ticket",
    limitBlockedBody: "Over {max} the law requires a complete invoice. Fill in the customer's details and charge as usual.",
    limitReadyTitle: "This sale goes out as a complete invoice",
    limitReadyBody: "The customer is identified, so the document is a full invoice instead of a ticket.",
    limitFieldName: "Name or company name",
    limitFieldTaxId: "Tax ID",
    limitFieldAddress: "Address",
    limitChargeBlocked: "Enter the customer's details",
    tenderedShort: "The amount tendered does not cover the total",
    colDate: "Date",
    rangeLabel: "Period",
    rangeToday: "Today",
    range7d: "7 days",
    range30d: "30 days",
    rangeAll: "All",
    kpiTax: "VAT",
    kpiDiscounts: "Discounts",
    kpiVoided: "Voided",
    discountLine: "Line discount",
    discountLineOf: "Discount on {name}",
    discountTicket: "Ticket discount",
    discountApply: "Apply",
    discountRemove: "Remove",
    actionVoid: "Void",
    voidTitle: "Void sale {number}",
    voidExplain: "The sale stays on record as voided; cash and stock are reversed once. A reason is required.",
    voidReasonPlaceholder: "Reason (required)",
    voidDone: "Sale voided",
    voidFailed: "The sale could not be voided",
    voidRequiresCreditNote: "This sale carries a full invoice: issue a credit note instead of voiding it",
    voidAlreadyVoided: "This sale is already voided",
    voidAlreadyRefunded: "This sale already has refunds: return what is left instead of voiding it",
    voidReasonRequired: "A reason is required to void a sale",
    voidSaleNotFound: "That sale is not in this business",
    taxSurcharge: "Surcharge",
    screenMenu: "Screen",
    exitFullscreen: "Exit full screen",
    modifiers: "Options",
    modifierRequired: "Choose {n}",
    modifierUpTo: "Up to {n}",
    modifierOptional: "Optional",
    modifierPickOne: "Choose an option to continue",
    remaining: "Remaining",
    splitPayment: "Split the payment",
    addTender: "Add this payment",
    legAmount: "Amount for this payment",
    paymentsTaken: "Payments taken",
    tenderRemainingBlock: "{amount} still to cover before the sale can be charged.",
    tenderRemainingShort: "{amount} still to cover",
    editTender: "Edit {name}, {amount}",
    removeTender: "Remove {name}, {amount}",
    errorPaymentsMismatch: "The total changed while the payment was being split. Check the amounts and charge again.",
    errorQuantityNotPositive: "A line has no quantity: set at least one before charging",
    actionRefund: "Refund",
    statusRefunded: "Refunded",
    refundTitle: "Refund sale {number}",
    refundExplain: "Choose how much goes back to each way it was paid. The split below is a proposal \u2014 change any amount.",
    refundLoading: "Loading what can be refunded\u2026",
    refundNothing: "There is nothing left to refund on this sale.",
    refundLegCharged: "Charged",
    refundLegRefunded: "Already refunded",
    refundLegRemaining: "Refundable",
    refundTotalLabel: "Refunding",
    refundProposeAll: "Refund everything",
    refundDestination: "Give it back through",
    refundNeedsDestination: "{method}: choose where this money goes back.",
    refundOverCap: "{method}: {amount} is more than the {remaining} still refundable.",
    refundNothingToReturn: "Type how much goes back.",
    refundReasonLabel: "Reason",
    refundReasonRequired: "A refund needs a reason.",
    refundReasonPlaceholder: "Why the money goes back",
    refundReasonAlreadyRefunded: "Already given back in full.",
    refundReasonMethodUnavailable: "That payment method is no longer available.",
    refundReasonNotEligible: "Cannot go back the way it was paid.",
    refundConfirm: "Refund {amount}",
    refundDone: "Refund recorded.",
    refundFailed: "The refund could not be recorded.",
    refundLineTenders: "Lines paid another way",
    refundLineTendersHint: "These lines cost no money, so they are not part of the split above. What goes back to them is decided here.",
    refundTenderPending: "The money is back, but what was paid another way could not be returned. Check it from its own module.",
    refundExceedsTender: "One tender is being given back more than it was charged.",
    refundSaleNotFound: "That sale is not in this business.",
    refundRequiresCompleted: "Only a completed sale can be refunded.",
    refundMethodUnavailable: "That payment method is not available in this business.",
    refundLegAmount: "Refund amount",
    errorComboCatalogUnavailable: "The menus could not be loaded, so nothing was charged. Check that the Combos module is installed and try again",
    errorComboNotAvailable: "That menu is not in the catalogue any more \u2014 remove the line and add it again",
    errorComboNotOnSale: "That menu is no longer on sale. Remove it from the ticket or put it back on sale in Combos",
    errorComboOptionNotAvailable: "One of the choices in the menu is no longer on the catalogue \u2014 pick it again",
    errorComboGroupUnresolved: "The menu has a course still to be chosen. Complete it before charging",
    errorComboGroupOverMax: "The menu allows fewer choices in that course. Remove one before charging",
    errorComboOptionRepeated: "That course does not allow choosing the same item twice",
    errorComboComponentPriceUnknown: "A component of the menu has no catalogue price, so its share of the VAT cannot be worked out. Set its price in the catalogue",
    errorComboTaxCategoryMissing: "That menu has no tax category, so it cannot be charged. Set it in Combos",
    errorTooManyLines: "The ticket has too many lines to be charged in one go. Split it into two",
    comboBadge: "Menu",
    comboCatalogUnavailable: "The menus could not be loaded, so none are being offered. Check the Combos module and try again",
    comboGroupUnresolved: "Choose {n} in {group}",
    comboGroupOverMax: "{group} allows only {n}",
    comboOptionRepeated: "{group} cannot take the same item twice",
    comboRemoveOne: "Remove one {name}",
    missingAppCharge: "{app} is not installed, so nothing can be charged. Install it from the marketplace.",
    missingAppChargeShort: "{app} is missing",
    appTaxes: "Taxes",
    appInventory: "Inventory",
    appCatalogUnavailable: "{app} did not answer, so its catalogue may be incomplete. Check the app and reload the till.",
    posSettingsUnavailable: "The till could not read its own settings, so it is showing the defaults. Reload to try again.",
    errorMissingApp: "The sale was refused because an app it needs is not installed. Nothing was charged.",
    servedBy: "Served by {name}",
    staffMe: "me",
    staffMeOption: "Me (whoever is signed in)",
    staffAssigned: "the assigned professional",
    staffPickerTitle: "Who is serving this check",
    staffPickerHint: "The sale, the kitchen ticket and the per-person report are attributed to them. Leave it on \xABMe\xBB and the till uses whoever is signed in.",
    staffPickerEmpty: "This hub has nobody else to serve. Add staff from Settings.",
    staffLoading: "Loading the team\u2026",
    staffLoadFailed: "The team could not be loaded. The sale is still attributed to whoever is signed in.",
    lineNote: "Note",
    lineNoteOf: "Note on {name}",
    lineNotePlaceholder: "e.g. medium rare, shellfish allergy, no ice",
    lineNoteHint: "The kitchen reads this note on the ticket.",
    lineNoteSave: "Save",
    lineNoteRemove: "Remove",
    quickNotesTitle: "Quick notes",
    quickNotesIntro: "The notes the till offers with one tap on the line-note sheet. The waiter can still type anything by hand.",
    quickNoteText: "Note",
    quickNoteOrder: "Position",
    quickNotesEmpty: "No quick notes yet. Add the ones your kitchen hears every day \u2014 \u201Cno salt\u201D, \u201Cmedium rare\u201D, \u201Cno ice\u201D.",
    quickNotesLoading: "Loading quick notes\u2026",
    quickNotesSearch: "Search a note\u2026",
    quickNoteAdd: "Add",
    quickNoteSave: "Save",
    quickNoteSaving: "Saving\u2026",
    quickNoteEdit: "Edit",
    quickNoteEditing: "Editing",
    quickNoteEditCancel: "Cancel edit",
    quickNoteDelete: "Delete",
    quickNoteDeleteTitle: "Delete quick note",
    quickNoteDeleteHint: "It stops being offered at the till. The notes already typed on checks and sales keep their text.",
    quickNoteCancel: "Cancel",
    quickNoteSaveFailed: "The quick note could not be saved.",
    quickNoteDeleteFailed: "The quick note could not be deleted.",
    quickNotesLoadFailed: "The quick notes could not be loaded.",
    lineNoteQuickLoading: "Loading quick notes\u2026",
    lineNoteQuickError: "The quick notes could not be loaded \u2014 type the note by hand.",
    customerRequiredCharge: "This business requires a customer on every sale. Choose one to carry on with the charge.",
    customerRequiredShort: "Customer required",
    customerRequiredNoApp: "This business requires a customer on every sale, and the {app} app is not installed: this sale cannot be closed from here.",
    appCustomers: "Customers"
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
        // sales#203 — the RECEIPT's own settings (header, footer, promotional QR, whether prices
        // carry VAT inside) through `sales.pos_settings.get`, not the admin-only
        // `sales.settings.get`. Whoever prints a ticket is the cashier, and that query needs
        // `sales.manage_settings`: through it the paper came out blank of everything the shop had
        // configured for exactly the person who hands it over.
        erplora().query("sales.pos_settings.get").catch(() => [])
      ]);
      this.sale = Array.isArray(sale) ? sale[0] : sale;
      this.lines = lines || [];
      this.settings = withPosSettingsDefaults(
        Array.isArray(settingsRows) ? settingsRows[0] : settingsRows
      );
      void this.watchFiscal(this.saleId);
    } catch (e7) {
      this.error = e7 instanceof Error ? e7.message : erplora().t(CATALOG, "ui.errorDocument");
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
      const { fiscal, retry, claimInvoiceId } = await this.resolveFiscal(saleId);
      this.fiscal = fiscal;
      if (claimInvoiceId) {
        this.claimInvoiceId = claimInvoiceId;
        void this.ensureClaim(claimInvoiceId);
      }
      if (fiscal.qr || !retry) return;
    }
  }
  /** Resuelve venta → factura (`invoice.by_source`) → registro VeriFactu (`verifactu.records.by_invoice`)
   *  para obtener el QR de validación AEAT + nº fiscal oficial + CSV. Tolerante a fallos.
   *  `retry` = merece reintento (módulo presente, registro todavía no).
   *  `claimInvoiceId` = hay una F2 con algo que canjear (sales#103). */
  async resolveFiscal(saleId) {
    try {
      const invRows = await erplora().queryOptional(
        "invoice.by_source",
        { source_id: saleId }
      );
      if (invRows === void 0) return { fiscal: {}, retry: false };
      const invoice = Array.isArray(invRows) ? invRows[0] : invRows;
      if (!invoice?.id) return { fiscal: {}, retry: true };
      const claimInvoiceId = invoice.invoice_type === "F2" ? String(invoice.id) : void 0;
      const base = {
        number: invoice.number || void 0,
        issuer_nif: invoice.issuer_nif || void 0,
        // Issuer legal name resolved by the runtime from hub_settings.business_legal_name
        // (ADR-0061) — the document header must honor the business profile (#32).
        issuer_name: invoice.issuer_name || void 0,
        customer_name: invoice.customer_name || void 0,
        customer_tax_id: invoice.customer_tax_id || void 0
      };
      const recRows = await erplora().queryOptional(
        "verifactu.records.by_invoice",
        { invoice_id: invoice.id }
      );
      if (recRows === void 0) return { fiscal: base, retry: false, claimInvoiceId };
      const rec = Array.isArray(recRows) ? recRows[0] : recRows;
      if (!rec) return { fiscal: base, retry: true, claimInvoiceId };
      const csv = rec.aeat_csv || "";
      const qr = rec.qr_url || "";
      const t7 = (k2) => erplora().t(CATALOG, k2);
      return {
        fiscal: {
          ...base,
          qr: qr || void 0,
          qr_note: csv ? `CSV: ${csv}` : qr ? t7("ui.qrValidateNote") : void 0
        },
        retry: false,
        claimInvoiceId
      };
    } catch {
      return { fiscal: {}, retry: false };
    }
  }
  /**
   * sales#103 — acuña (o recupera) el claim «pide tu factura» de la F2, single-flight.
   *
   * La puerta es IDEMPOTENTE por `(kind, subject_id)` y el locator determinista, así que llamar
   * en cada impresión es el uso previsto; el single-flight local añade que ni dos ciclos del
   * watch ni una reimpresión inmediata disparen DOS acuñamientos observables. Un acuñamiento que
   * FALLA no se cachea: el siguiente intento (p. ej. otra impresión) vuelve a probar, y el hub lo
   * trata como la misma promesa de papel.
   *
   * Los `items` del payload sellado salen de `invoice.lines` (módulo invoice, OPCIONAL — ADR-0127):
   * el esquema de `invoice.substitute` los EXIGE y no se derivan server-side. Sin módulo no hay
   * claim y el tique sale exactamente como hoy.
   */
  async ensureClaim(invoiceId) {
    if (this.claim && this.claimInvoiceId === invoiceId) return;
    if (this.claimFlight && this.claimInvoiceId === invoiceId) return;
    this.claimInvoiceId = invoiceId;
    const flight = (async () => {
      const items = await erplora().queryOptional(
        "invoice.lines",
        { invoice_id: invoiceId }
      );
      if (items === void 0 || items.length === 0) return;
      const claim = await mintInvoiceRequestClaim(invoiceId, items);
      if (claim) this.claim = claim;
    })().catch(() => void 0).finally(() => {
      if (this.claimFlight === flight) this.claimFlight = void 0;
    });
    this.claimFlight = flight;
    await flight;
  }
  /** El fiscal del papel MÁS el claim acuñado (si lo hay): viajan juntos en `FiscalData`. */
  fiscalForPaper() {
    if (!this.claim) return this.fiscal;
    return {
      ...this.fiscal,
      claim_locator: this.claim.locator,
      // La puerta devuelve `/p/<locator>` relativo; el QR impreso necesita la URL ABSOLUTA del
      // hub (el origen de esta app ES el origen del hub).
      claim_qr: this.absoluteUrl(this.claim.url)
    };
  }
  /** `/p/<locator>` → URL absoluta contra el origen actual; si algo raro pasa, tal cual. */
  absoluteUrl(url) {
    const base = globalThis.location?.href;
    if (!base) return url;
    try {
      return new URL(url, base).href;
    } catch {
      return url;
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
    if (this.claimInvoiceId && !this.claim && !this.claimFlight) void this.ensureClaim(this.claimInvoiceId);
    const doc = saleToReceipt(
      this.sale,
      this.lines || [],
      this.settings || {},
      this.fiscal,
      erplora().locale,
      t7("ui.docDefaultBusiness"),
      t7
    );
    return receiptToPrintableHtml({
      ...doc,
      // sales#103: el mismo bloque «pide tu factura» que el papel térmico (claimPrintFields es
      // la única fuente, para que HTML y ESC/POS no puedan discrepar).
      ...claimPrintFields(this.fiscalForPaper(), t7),
      labels: { subtotal: t7("ui.docSubtotal"), total: t7("ui.docTotal"), change: t7("ui.docChange"), document: t7("ui.document") }
    });
  }
  /**
   * El documento **estructurado** que lee el renderizador ESC/POS (`escpos::render_receipt`).
   *
   * No es lo mismo que `printableHtml()`: aquel es para un navegador, este para una impresora
   * térmica, que busca POR CLAVE (`items`, `total`, `receipt_id`). Reimprimir mandaba `data` vacío
   * y el papel salía con todos los valores por defecto —«ERPlora», sin líneas, TOTAL 0,00— sin dar
   * ningún error (sales#79). `undefined` si aún no hay venta: nada que imprimir es mejor que un
   * tique en blanco.
   */
  printableDocument() {
    if (!this.sale) return void 0;
    const t7 = (k2) => erplora().t(CATALOG, k2);
    if (this.claimInvoiceId && !this.claim && !this.claimFlight) void this.ensureClaim(this.claimInvoiceId);
    return saleToPrintDocument(
      this.sale,
      this.lines || [],
      this.settings || {},
      this.fiscalForPaper(),
      erplora().locale,
      t7("ui.docDefaultBusiness"),
      t7
    );
  }
  render() {
    const t7 = (k2) => erplora().t(CATALOG, k2);
    if (this.loading) return b2`<p class="muted">${t7("ui.loadingDocument")}</p>`;
    if (this.error) return b2`<ok-inline-feedback tone="danger" icon="alert-circle-outline">${this.error}</ok-inline-feedback>`;
    if (!this.sale) return b2`<p class="muted">${t7("ui.noSale")}</p>`;
    const settings = this.settings || {};
    const lines = this.lines || [];
    const fmt = this.format || resolveFormat(this.sale, settings);
    const locale = erplora().locale;
    const fallbackName = t7("ui.docDefaultBusiness");
    return fmt === "invoice" ? b2`<ok-invoice
          .invoice=${saleToInvoice(this.sale, lines, settings, this.fiscal, locale, fallbackName, t7)}
          .labels=${invoiceLabels(t7)}></ok-invoice>` : b2`<ok-receipt
          .receipt=${saleToReceipt(this.sale, lines, settings, this.fiscal, locale, fallbackName, t7)}
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
  r5()
], ErpSalesDocument.prototype, "claim", 2);
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
    const data = el?.printableDocument?.();
    const sdk = globalThis.erplora;
    if (!sdk?.print) {
      if (html) printHtmlInIframe(html);
      else window.print();
      return;
    }
    void sdk.print({ role: "receipt", documentType: "receipt", html, data, jobId: reprintJobId(saleId) }).then((res) => {
      if (res?.via === "bridge" || res?.via === "queue") return;
      sdk.notify?.({ type: "error", message: res?.error ? `${t7("ui.printFailed")}: ${res.error}` : t7("ui.printFailed") });
    });
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
  if (c5.currentTableId) return c5.targetOrderId ? "load-target" : "start-new-check";
  if (!c5.cartHasItems) return "load-target";
  return c5.targetOrderId ? "park-then-load" : "assign-to-target";
}

// ui/lib/park-label.ts
function defaultParkLabel(tableLabel, now) {
  const mesa = (tableLabel ?? "").trim();
  if (mesa) return mesa;
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// ui/lib/rounds.ts
function pendingLines(lines) {
  return lines.filter((l3) => !l3.fired_at);
}
function isLineLocked(l3) {
  return !!l3.fired_at;
}
function nextRoundNo(lines) {
  const max = lines.reduce((m4, l3) => l3.fired_at && (l3.round_no ?? 0) > m4 ? l3.round_no ?? 0 : m4, 0);
  return max + 1;
}

// ui/lib/fire-order.ts
function kitchenNote(note, isGift, giftReason) {
  const reason = isGift ? (giftReason ?? "").trim() : "";
  return [(note ?? "").trim(), reason].filter(Boolean).join(" \xB7 ");
}
function buildFirePayload(orderId, label, lines, roundNo, waiterId) {
  if (!orderId || lines.length === 0) return void 0;
  return {
    order_id: orderId,
    label,
    ...roundNo && roundNo >= 1 ? { round_no: roundNo } : {},
    ...waiterId ? { waiter_id: waiterId } : {},
    // Sin mesa no es servicio de sala: barra, mostrador o para llevar.
    channel: label ? "dine_in" : "takeaway",
    items: lines.map((l3) => ({
      product_id: l3.id,
      product_name: l3.name,
      // Punto fijo 10⁶ (ADR-0147): cocina recibe 500000 y pinta 0,5 — su frontera, su formato.
      quantity: toMicro2(l3.qty),
      unit_price: l3.price,
      // sales#156: what the waiter typed and — when the line is comped — the reason, which is
      // floor information the cook needs to see.
      notes: kitchenNote(l3.note, l3.is_gift, l3.gift_reason),
      // sales#12: la CATEGORÍA (snapshot de la línea) es lo que deja a kitchen aplicar
      // categoría→estación; sin ella solo enrutaba lo que tuviera mapeo producto→estación.
      category_id: l3.category_id ?? null,
      // Y de qué línea de pedido salió: kitchen reparte una anulación entre las estaciones que
      // recibieron cada ronda por este id.
      order_item_id: l3.line_id ?? null,
      ...l3.modifiers?.length ? { modifiers: l3.modifiers.map((m4) => ({ option_id: m4.option_id })) } : {}
    }))
  };
}

// ui/lib/serial-queue.ts
function createSerialQueue() {
  let last = Promise.resolve();
  return (task) => {
    const run = last.then(task, task);
    last = run.catch(() => void 0);
    return run;
  };
}

// ui/lib/pos-cart.ts
function rows(r6) {
  if (Array.isArray(r6)) return r6;
  if (r6 && typeof r6 === "object" && Array.isArray(r6.rows)) return r6.rows;
  return [];
}
function parseModifiers(raw) {
  if (typeof raw !== "string" || !raw.trim()) return void 0;
  try {
    const v3 = JSON.parse(raw);
    if (!Array.isArray(v3)) return void 0;
    const out = v3.map((m4) => m4 && typeof m4 === "object" ? m4 : {}).filter((m4) => String(m4.option_id ?? "")).map((m4) => ({
      option_id: String(m4.option_id),
      ...typeof m4.price_delta === "number" && Number.isFinite(m4.price_delta) ? { price_delta: m4.price_delta } : {}
    }));
    return out.length ? out : void 0;
  } catch {
    return void 0;
  }
}
function parseCombo(raw) {
  if (typeof raw !== "string" || !raw.trim()) return void 0;
  try {
    const v3 = JSON.parse(raw);
    if (!v3 || typeof v3 !== "object") return void 0;
    const combo_id = String(v3.combo_id ?? "");
    if (!combo_id) return void 0;
    const raws = Array.isArray(v3.combo_choices) ? v3.combo_choices : [];
    const combo_choices = raws.map((c5) => c5 && typeof c5 === "object" ? c5 : {}).filter((c5) => String(c5.option_id ?? "")).map((c5) => ({
      option_id: String(c5.option_id),
      // DISPLAY y ROUTING: sin el nombre no se pinta el componente, y sin la categoría el KDS
      // no sabe a qué estación mandarlo al RETOMAR la cuenta (ADR-0381).
      product_name: c5.product_name ? String(c5.product_name) : void 0,
      category_id: c5.category_id ? String(c5.category_id) : null
    }));
    return { combo_id, combo_choices };
  } catch {
    return void 0;
  }
}
function comboColumn(l3) {
  if (!l3.combo_id) return "{}";
  return JSON.stringify({
    combo_id: l3.combo_id,
    combo_choices: (l3.combo_choices ?? []).map((c5) => ({
      option_id: c5.option_id,
      product_name: c5.product_name ?? "",
      category_id: c5.category_id ?? null
    }))
  });
}
function comboPayload(l3) {
  if (!l3.combo_id) return {};
  return {
    combo_id: l3.combo_id,
    combo_choices: (l3.combo_choices ?? []).map((c5) => ({
      option_id: c5.option_id,
      product_name: c5.product_name ?? "",
      category_id: c5.category_id ?? null
    }))
  };
}
async function listOpenChecks(client, excluir) {
  try {
    const r6 = rows(await client.query("sales.orders.list"));
    return r6.filter((o9) => o9.status === "open" && String(o9.id) !== excluir).map((o9) => ({
      id: String(o9.id),
      total: Number(o9.provisional_total) || 0,
      created_at: String(o9.created_at ?? ""),
      label: o9.label ? String(o9.label) : void 0,
      discount: Number(o9.discount_percent) > 0 ? Number(o9.discount_percent) : void 0,
      discount_amount: Number(o9.discount_amount) > 0 ? Number(o9.discount_amount) : void 0
    })).sort((a3, b3) => b3.created_at.localeCompare(a3.created_at));
  } catch {
    return [];
  }
}
function firstNewId(res) {
  const ids = res?.new_ids;
  return Array.isArray(ids) && typeof ids[0] === "string" ? ids[0] : "";
}
function provisionalLineTotal(unitPrice, qty, isGift, discount = 0, modifierDelta2 = 0) {
  return isGift ? 0 : roundHalfUp2((unitPrice + modifierDelta2) * qty * (1 - discount / 100));
}
function roundHalfUp2(x2) {
  return Math.round(x2 + 1e-9);
}
function modifierDelta(l3) {
  return (l3.modifiers ?? []).reduce((s5, m4) => s5 + (Number(m4.price_delta) || 0), 0);
}
function unitPriceWithModifiers(l3) {
  return l3.price + modifierDelta(l3);
}
function lineAmount(l3, ticketDiscount = 0) {
  if (l3.is_gift) return 0;
  return roundHalfUp2(
    unitPriceWithModifiers(l3) * l3.qty * (1 - (l3.discount ?? 0) / 100) * (1 - ticketDiscount / 100)
  );
}
function cartTotal(cart, ticketDiscount = 0) {
  return cart.reduce((s5, l3) => s5 + lineAmount(l3, ticketDiscount), 0);
}
function unitContextPayload(l3) {
  const ctx = {};
  if (l3.unit_code) ctx.unit_code = l3.unit_code;
  if (l3.unit_name) ctx.unit_name = l3.unit_name;
  if (l3.factor_num) ctx.factor_num = l3.factor_num;
  if (l3.factor_den) ctx.factor_den = l3.factor_den;
  if (l3.increment_value) ctx.increment_value = l3.increment_value;
  if (l3.price_quantity_value) ctx.price_quantity_value = l3.price_quantity_value;
  if (l3.pricing_unit_code) ctx.pricing_unit_code = l3.pricing_unit_code;
  if (l3.pricing_unit_name) ctx.pricing_unit_name = l3.pricing_unit_name;
  if (l3.pricing_factor_num) ctx.pricing_factor_num = l3.pricing_factor_num;
  if (l3.pricing_factor_den) ctx.pricing_factor_den = l3.pricing_factor_den;
  return ctx;
}
function toItemPayload(l3) {
  return {
    product_id: l3.id || null,
    product_name: l3.name,
    product_sku: l3.sku ?? "",
    price: l3.price,
    quantity: toMicro2(l3.qty),
    // punto fijo 10⁶ (ADR-0147)
    is_gift: !!l3.is_gift,
    gift_reason: l3.gift_reason ?? "",
    // sales#89: viaja también al ABRIR el pedido, no solo al añadir línea suelta.
    is_service: !!l3.is_service,
    tax_category_key: l3.tax_category_key ?? "",
    cost: l3.cost ?? 0,
    // sales#12: la categoría se congela en la línea del pedido (routing de cocina).
    category_id: l3.category_id ?? null,
    // sales#71: descuento manual de la línea, en %.
    discount: l3.discount ?? 0,
    // sales#156: the free-text note. Always present (empty string = no note) so the shape of the
    // payload does not depend on whether the waiter typed anything.
    notes: l3.note ?? "",
    // pm#93: solo los ids, en su orden. El importe lo resuelve el servidor contra
    // `modifiers.options.all` — el navegador no es autoridad del precio de un suplemento.
    modifiers: (l3.modifiers ?? []).map((m4) => ({ option_id: m4.option_id })),
    // sales#169: y la COMPOSICIÓN del menú, por el mismo motivo. Es la puerta por la que entra la
    // PRIMERA línea de toda cuenta: sin esto, abrir la mesa CON el menú lo perdía igual que
    // retomarla. El precio sigue siendo el del servidor.
    ...comboPayload(l3),
    ...unitContextPayload(l3)
  };
}
async function openOrderWithLines(client, lines, label) {
  const payload = { items: lines.map(toItemPayload) };
  if (label?.trim()) payload.label = label.trim();
  const res = await client.command("sales.order.open", payload);
  return firstNewId(res);
}
function orderLinePayload(orderId, l3) {
  return {
    order_id: orderId,
    product_id: l3.id || null,
    product_name: l3.name,
    product_sku: l3.sku ?? "",
    quantity: toMicro2(l3.qty),
    // punto fijo 10⁶ (ADR-0147)
    unit_price: l3.price,
    is_gift: !!l3.is_gift,
    gift_reason: l3.gift_reason ?? "",
    // sales#89: el pedido recuerda que la línea es un SERVICIO. Sin esto el flag se perdía al
    // materializar la línea (ADR-0141) y una cuenta RETOMADA cobraba el corte como producto.
    is_service: !!l3.is_service,
    tax_category_key: l3.tax_category_key ?? "",
    cost: l3.cost ?? 0,
    // sales#12: la categoría se congela en la línea del pedido (routing de cocina).
    category_id: l3.category_id ?? null,
    // sales#71: descuento manual de la línea (%), persistido con ella.
    discount_percent: l3.discount ?? 0,
    // sales#156: the line's free-text note, persisted with it.
    notes: l3.note ?? "",
    // pm#93: `order.add_line` es DECLARATIVO — el payload bindea a una columna TEXT, así que viaja
    // serializado. Solo los ids: el nombre y el precio definitivos los resuelve el cobro contra
    // `modifiers.options.all`. Esta fila es de trabajo, como su `line_total` provisional.
    modifiers: JSON.stringify((l3.modifiers ?? []).map((m4) => ({ option_id: m4.option_id }))),
    // sales#169: la composición del menú, serializada igual y con el mismo criterio. `'{}'` cuando
    // la línea no es un menú — y entonces el SQL deja `combo_group_ref` en NULL, así que una línea
    // normal no cambia en nada. El grupo NO se manda: lo minta el servidor con el id de la fila.
    combo: comboColumn(l3),
    line_total: provisionalLineTotal(l3.price, l3.qty, l3.is_gift, l3.discount ?? 0, modifierDelta(l3)),
    ...unitContextPayload(l3)
  };
}
async function addOpenPriceLine(client, orderId, l3) {
  const res = await client.command("sales.order.add_open_line", orderLinePayload(orderId, l3));
  return firstNewId(res);
}
async function addOrderLine(client, orderId, l3) {
  const res = await client.command("sales.order.add_line", orderLinePayload(orderId, l3));
  return firstNewId(res);
}
async function persistLineQty(client, orderId, line, qty) {
  let lineId = line.line_id;
  if (!lineId) {
    const persisted = await loadOrderLines(client, orderId);
    lineId = persisted.find((p4) => p4.id === line.id && !p4.is_gift === !line.is_gift)?.line_id;
  }
  if (!lineId) return false;
  line.line_id = lineId;
  await updateOrderLineQty(
    client,
    orderId,
    lineId,
    qty,
    line.price,
    line.is_gift,
    line.gift_reason,
    line.discount ?? 0,
    line.modifiers
  );
  return true;
}
async function updateOrderLineQty(client, orderId, lineId, qty, unitPrice, isGift, giftReason, discount = 0, modifiers) {
  await client.command("sales.order.update_line", {
    order_id: orderId,
    line_id: lineId,
    quantity: toMicro2(qty),
    // punto fijo 10⁶ (ADR-0147)
    line_total: provisionalLineTotal(unitPrice, qty, isGift, discount, modifierDelta({ modifiers })),
    // Alternar invitación cambia el importe: viaja junto para que la fila quede coherente.
    is_gift: isGift === void 0 ? null : isGift ? 1 : 0,
    gift_reason: giftReason ?? null
  });
}
async function updateOrderLineDiscount(client, orderId, line, discount) {
  if (!line.line_id) return;
  await client.command("sales.order.update_line", {
    order_id: orderId,
    line_id: line.line_id,
    quantity: toMicro2(line.qty),
    line_total: provisionalLineTotal(line.price, line.qty, line.is_gift, discount, modifierDelta(line)),
    discount_percent: discount,
    is_gift: null,
    gift_reason: null
  });
}
async function updateOrderLineNote(client, orderId, line, note) {
  if (!line.line_id) return;
  await client.command("sales.order.update_line", {
    order_id: orderId,
    line_id: line.line_id,
    quantity: toMicro2(line.qty),
    line_total: provisionalLineTotal(line.price, line.qty, line.is_gift, line.discount ?? 0, modifierDelta(line)),
    notes: note,
    is_gift: null,
    gift_reason: null
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
      // La fila trae punto fijo 10⁶ (ADR-0147); la UI trabaja en lógico. Cerrar y reabrir el
      // pedido debe seguir mostrando 0,5 kg — no 500000 ni 1.
      qty: fromMicro2(Number(x2.quantity) || 1e6),
      is_gift: x2.is_gift === 1 || x2.is_gift === true ? true : void 0,
      gift_reason: x2.gift_reason ? String(x2.gift_reason) : void 0,
      // Autoridad del IVA en servidor (ADR-0085) y coste para el arqueo de invitaciones: se
      // recuperan para que un pedido REANUDADO cobre con el mismo IVA que si no se hubiera recargado.
      tax_category_key: x2.tax_category_key ? String(x2.tax_category_key) : void 0,
      cost: Number(x2.cost) || void 0,
      // sales#89: servicio o producto. Una fila ANTERIOR a la columna no trae nada y vuelve como
      // producto — que es lo que era; marcarla de servicio haría que inventory le saltara el stock.
      is_service: x2.is_service === 1 || x2.is_service === true ? true : void 0,
      // sales#12: la categoría congelada vuelve con la línea (routing de cocina al retomar).
      category_id: x2.category_id ? String(x2.category_id) : void 0,
      // sales#71: el descuento de la línea vuelve al retomar la cuenta.
      discount: Number(x2.discount_percent) > 0 ? Number(x2.discount_percent) : void 0,
      // sales#156: the note comes back with the line. `undefined` and NOT '' when there is none:
      // the line then looks identical to those of every check opened before the column, and
      // nothing paints an empty sub-line under it.
      note: x2.notes ? String(x2.notes) : void 0,
      // pm#93: los suplementos vuelven con la línea. Una fila ANTERIOR a la columna, o un JSON
      // corrupto, devuelven `undefined` — se pierde el suplemento de esa línea, nunca la comanda.
      modifiers: parseModifiers(x2.modifiers),
      // sales#169: el MENÚ vuelve con la línea. Sin esto la línea retomada solo conserva el
      // `combo_id` metido en `product_id`, el cobro la toma por una línea de catálogo y RECHAZA la
      // venta entera (`sales.product_not_available`): la mesa no puede pagar.
      ...parseCombo(x2.combo),
      // Contexto de unidades CONGELADO (ADR-0147 §2.4): vuelve con la línea para que el pedido
      // reanudado valide la misma rejilla y cobre con el mismo contexto.
      unit_code: x2.unit_code ? String(x2.unit_code) : void 0,
      unit_name: x2.unit_name ? String(x2.unit_name) : void 0,
      factor_num: Number(x2.factor_num) || void 0,
      factor_den: Number(x2.factor_den) || void 0,
      increment_value: Number(x2.increment_value) || void 0,
      price_quantity_value: Number(x2.price_quantity_value) || void 0,
      pricing_unit_code: x2.pricing_unit_code ? String(x2.pricing_unit_code) : void 0,
      pricing_unit_name: x2.pricing_unit_name ? String(x2.pricing_unit_name) : void 0,
      pricing_factor_num: Number(x2.pricing_factor_num) || void 0,
      pricing_factor_den: Number(x2.pricing_factor_den) || void 0,
      // Tandas (2026-07-19): la ronda vuelve con la línea para que un pedido REANUDADO siga
      // sabiendo qué salió ya a cocina (y no lo re-envíe ni lo deje editar).
      round_no: Number(x2.round_no) || void 0,
      fired_at: x2.fired_at ? String(x2.fired_at) : void 0
    }));
  } catch {
    return [];
  }
}
async function mergeOrders(client, fromOrderId, toOrderId) {
  if (!fromOrderId || !toOrderId || fromOrderId === toOrderId) return;
  await client.command("sales.order.merge", { from_order_id: fromOrderId, to_order_id: toOrderId });
}
async function splitOrder(client, orderId, lineIds, label) {
  if (!orderId) return "";
  const res = await client.command("sales.order.split", {
    order_id: orderId,
    line_ids: [...lineIds],
    label: label ?? ""
  });
  return firstNewId(res);
}

// ui/lib/split-selection.ts
function esParcial(cart, sel) {
  const conId = cart.filter((l3) => l3.line_id);
  return sel.size > 0 && sel.size < conId.length;
}
function splitPayload(cart, sel) {
  const parcial = esParcial(cart, sel);
  const lineas = parcial ? cart.filter((l3) => l3.line_id && sel.has(l3.line_id)) : cart;
  return {
    line_ids: parcial ? lineas.map((l3) => l3.line_id) : void 0,
    keep_order_open: parcial,
    items: lineas.map((l3) => ({
      product_id: l3.id || null,
      product_name: l3.name,
      price: l3.price,
      quantity: l3.qty,
      tax_rate: l3.tax_rate ?? 0,
      tax_category_key: l3.tax_category_key ?? "",
      cost: l3.cost ?? 0,
      is_gift: !!l3.is_gift,
      gift_reason: l3.gift_reason ?? ""
    }))
  };
}

// ui/lib/simplified-limit.ts
function isOverSimplifiedLimit(payableCents, maxCents) {
  if (maxCents === null || maxCents <= 0) return false;
  return payableCents >= maxCents;
}
function recipientIsComplete(recipient) {
  return recipient.customerName.trim() !== "" && recipient.customerTaxId.trim() !== "" && recipient.customerAddress.trim() !== "";
}
function ticketIsBlocked(state) {
  if (!isOverSimplifiedLimit(state.payableCents, state.maxCents)) return false;
  return !(state.documentFormat === "invoice" && recipientIsComplete(state));
}

// ui/lib/current-check.ts
var CLAVE = "erplora.pos.currentCheck";
function rememberCurrentCheck(store, orderId) {
  try {
    store.setItem(CLAVE, orderId);
  } catch {
  }
}
function forgetCurrentCheck(store) {
  try {
    store.removeItem(CLAVE);
  } catch {
  }
}
function resolveCurrentCheck(store, abiertas) {
  let recordada = null;
  try {
    recordada = store.getItem(CLAVE);
  } catch {
    return void 0;
  }
  return recordada && abiertas.includes(recordada) ? recordada : void 0;
}

// ui/lib/brand-icons.ts
var BIZUM_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122 36"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M59.8625 12.8257c-1.0347 0-1.8704.8358-1.8704 1.8308v13.8113c0 1.0348.8357 1.8707 1.8704 1.8707s1.8704-.8359 1.8704-1.8707V14.6565c0-.995-.8357-1.8308-1.8704-1.8308Zm-.0001-6.88561c-1.154 0-2.1091.95524-2.1091 2.1095 0 1.15425.9551 2.14931 2.1091 2.14931 1.1541 0 2.1092-.95526 2.1092-2.14931 0-1.15426-.9551-2.1095-2.1092-2.1095ZM78.089 14.6566c0-1.1543-.9153-1.5921-1.751-1.5921h-9.2725c-.9153 0-1.6316.7164-1.6316 1.5921 0 .9154.7163 1.6319 1.6316 1.6319h6.0888l-7.8796 10.9853c-.2388.3184-.3581.7562-.3581 1.1144 0 1.1543.9153 1.7911 1.7112 1.7911h9.8296c.9153 0 1.6316-.7164 1.6316-1.6319 0-.9154-.7163-1.6318-1.6316-1.6318h-6.6062l7.7204-10.7466c.398-.5572.5174-1.0348.5174-1.5124Zm-27.3 8.6769c0 2.2687-.9949 3.6618-3.2633 3.6618-2.2683 0-3.2234-1.3931-3.2234-3.6618v-7.045h3.3826c2.7459 0 3.1041 1.5125 3.1041 3.1842v3.8608Zm3.7408-3.9404c0-3.8608-2.0296-6.3683-6.7653-6.3683h-3.4224V7.81078c0-1.03485-.8357-1.87069-1.8306-1.87069-1.0347 0-1.8704.83584-1.8704 1.87069V23.3335c0 3.8608 2.0693 7.0051 6.9642 7.0051 4.8551 0 6.9643-3.1841 6.9643-7.0051v-3.9404h-.0398Zm38.1642-6.5674c-1.0346 0-1.8704.8358-1.8704 1.8706v8.6371c0 2.2687-.9949 3.6617-3.2632 3.6617-2.2684 0-3.2235-1.393-3.2235-3.6617v-8.6371c0-1.0348-.8357-1.8706-1.8306-1.8706-1.0347 0-1.8704.8358-1.8704 1.8706v8.6371c0 3.8607 2.0694 7.0051 6.9643 7.0051 4.8551 0 6.9642-3.1842 6.9642-7.0051v-8.6371c-.0397-1.0348-.8755-1.8706-1.8704-1.8706Zm28.374 7.0451c0-3.8608-1.79-7.0052-6.645-7.0052-2.189 0-3.741.6369-4.816 1.7115-1.074-1.0348-2.626-1.7115-4.815-1.7115-4.8552 0-6.646 3.1842-6.646 7.0052v8.637c0 1.0348.8357 1.8707 1.8306 1.8707 1.0344 0 1.8704-.8359 1.8704-1.8707v-8.637c0-2.2687.716-3.6618 2.945-3.6618 2.268 0 2.945 1.3931 2.945 3.6618v8.637c0 1.0348.836 1.8707 1.83 1.8707 1.035 0 1.871-.8359 1.871-1.8707v-8.637c0-2.2687.716-3.6618 2.945-3.6618 2.268 0 2.945 1.3931 2.945 3.6618v8.637c0 1.0348.835 1.8707 1.83 1.8707 1.035 0 1.871-.8359 1.871-1.8707l.039-8.637ZM6.61567 12.8655c1.31327.9553 3.14387.6767 4.09893-.6368l3.4225-4.73643c.9551-1.31346.6765-3.14434-.6367-4.09959-1.3133-.95524-3.1439-.67663-4.09902.63683L5.93914 8.76593c-.9153 1.31347-.63673 3.14437.67653 4.09957ZM22.2952 6.17881c-1.3133-.95524-3.1439-.67663-4.099.63683L4.42685 25.7613c-.9551 1.3135-.67653 3.1444.63673 4.0996 1.31326.9553 3.14387.6767 4.09897-.6368L22.9319 10.2784c.9949-1.31345.6765-3.14434-.6367-4.09959ZM5.3024 4.66637c.9551-1.31346.67652-3.14435-.63674-4.099591C3.3524-.388466 1.52179-.109853.566693 1.20361c-.9551 1.31346-.676529 3.14435.636737 4.09959 1.31326.95525 3.14387.67663 4.09897-.63683ZM26.1952 30.6968c-1.3132-.9553-3.1438-.6766-4.0989.6368-.9551 1.3135-.6766 3.1444.6367 4.0996 1.3133.9553 3.1439.6766 4.099-.6368.9551-1.3135.6765-3.1444-.6368-4.0996Zm-5.3724-7.5226c-1.3132-.9552-3.1438-.6766-4.0989.6369l-3.4623 4.7364c-.9551 1.3134-.6765 3.1443.6367 4.0996 1.3133.9552 3.1439.6766 4.099-.6369l3.4623-4.7364c.9551-1.3134.6765-3.1443-.6368-4.0996Z"/></svg>';
function brandSvgFor(type, name) {
  const t7 = (type || "").trim().toLowerCase();
  const n6 = (name || "").trim().toLowerCase();
  if (t7 === "bizum" || n6 === "bizum") return BIZUM_SVG;
  return void 0;
}

// ui/lib/scale-entry.ts
var SCALE_WEIGHT_EVENT = "erplora:scale-weight";
function parseScaleReading(detail) {
  if (!detail || typeof detail !== "object") return null;
  const d3 = detail;
  const value = d3.value;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const unit = typeof d3.unit_code === "string" ? d3.unit_code.trim() : "";
  if (!unit) return null;
  const device = typeof d3.device_id === "string" && d3.device_id.trim() ? d3.device_id.trim() : void 0;
  return {
    value,
    unit_code: unit,
    stable: d3.stable === true,
    ...device ? { device_id: device } : {}
  };
}
function scaleTargetLine(cart, weighable) {
  for (let i7 = cart.length - 1; i7 >= 0; i7--) {
    const line = cart[i7];
    if (weighable(line.unit_code) && !isLineLocked(line)) return line;
  }
  return void 0;
}
function scaleVerdict(line, reading) {
  if (!line) return { ok: false, reason: "no_weighable_line" };
  if (!reading.stable) return { ok: false, reason: "unstable" };
  if ((line.unit_code ?? "") !== reading.unit_code) {
    return { ok: false, reason: "unit_mismatch", expected: line.unit_code ?? "", got: reading.unit_code };
  }
  if (reading.value <= 0) return { ok: false, reason: "zero" };
  return { ok: true, qty: reading.value };
}

// ui/lib/quick-note-text.ts
function segments(note) {
  return note.split(",").map((s5) => s5.trim()).filter((s5) => s5.length > 0);
}
function hasQuickNote(note, text) {
  const wanted = text.trim();
  return wanted.length > 0 && segments(note).includes(wanted);
}
function toggleQuickNote(note, text) {
  const wanted = text.trim();
  if (!wanted) return note.trim();
  const parts = segments(note);
  const at = parts.indexOf(wanted);
  if (at >= 0) parts.splice(at, 1);
  else parts.push(wanted);
  return parts.join(", ");
}

// ui/lib/combo-picker.ts
var str = (r6, k2) => {
  const v3 = r6[k2];
  return v3 === void 0 || v3 === null ? "" : String(v3);
};
var int = (r6, k2, fallback = 0) => {
  const n6 = Number(r6[k2]);
  return Number.isFinite(n6) ? Math.trunc(n6) : fallback;
};
var bool = (r6, k2) => {
  const v3 = r6[k2];
  return v3 === true || v3 === 1 || v3 === "1" || v3 === "t" || v3 === "true";
};
function groupComboRows(rows3) {
  const out = [];
  const byCombo = /* @__PURE__ */ new Map();
  const byGroup = /* @__PURE__ */ new Map();
  for (const raw of rows3) {
    if (!raw || typeof raw !== "object") continue;
    const r6 = raw;
    const comboId = str(r6, "combo_id");
    const groupId = str(r6, "group_id");
    const optionId = str(r6, "option_id");
    if (!comboId || !groupId || !optionId) continue;
    if (!bool(r6, "combo_is_active")) continue;
    let combo = byCombo.get(comboId);
    if (!combo) {
      combo = {
        combo_id: comboId,
        name: str(r6, "combo_name"),
        kitchen_name: str(r6, "combo_kitchen_name"),
        price: int(r6, "combo_price"),
        tax_category_key: str(r6, "combo_tax_category_key"),
        supply_kind: str(r6, "supply_kind"),
        groups: []
      };
      byCombo.set(comboId, combo);
      out.push(combo);
    }
    const groupKey = `${comboId}\0${groupId}`;
    let group = byGroup.get(groupKey);
    if (!group) {
      group = {
        id: groupId,
        name: str(r6, "group_name"),
        min: int(r6, "min_choices"),
        max: int(r6, "max_choices"),
        allow_repeat: bool(r6, "allow_repeat"),
        options: []
      };
      byGroup.set(groupKey, group);
      combo.groups.push(group);
    }
    group.options.push({
      option_id: optionId,
      source: str(r6, "source"),
      source_ref: str(r6, "source_ref"),
      price_delta: int(r6, "price_delta")
    });
  }
  return out;
}
function optionOf(combo, optionId) {
  for (const g3 of combo.groups) {
    const o9 = g3.options.find((x2) => x2.option_id === optionId);
    if (o9) return o9;
  }
  return void 0;
}
function comboTotalCents(combo, picks) {
  let total = combo.price;
  for (const id of picks) total += optionOf(combo, id)?.price_delta ?? 0;
  return total;
}
function picksIn(combo, group, picks) {
  const ids = new Set(group.options.map((o9) => o9.option_id));
  return picks.filter((p4) => ids.has(p4));
}
function comboBlockReason(combo, picks) {
  for (const g3 of combo.groups) {
    const mine = picksIn(combo, g3, picks);
    if (mine.length < g3.min) {
      return { key: "ui.comboGroupUnresolved", group: g3.name, n: g3.min };
    }
    if (g3.max > 0 && mine.length > g3.max) {
      return { key: "ui.comboGroupOverMax", group: g3.name, n: g3.max };
    }
    if (!g3.allow_repeat && new Set(mine).size !== mine.length) {
      return { key: "ui.comboOptionRepeated", group: g3.name };
    }
  }
  if (!picks.length) {
    return { key: "ui.comboGroupUnresolved", group: combo.name, n: 1 };
  }
  return void 0;
}
function canConfirmCombo(combo, picks) {
  return comboBlockReason(combo, picks) === void 0;
}

// lit-html/directive.js
var t3 = { ATTRIBUTE: 1, CHILD: 2, PROPERTY: 3, BOOLEAN_ATTRIBUTE: 4, EVENT: 5, ELEMENT: 6 };
var e5 = (t7) => (...e7) => ({ _$litDirective$: t7, values: e7 });
var i4 = class {
  constructor(t7) {
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AT(t7, e7, i7) {
    this._$Ct = t7, this._$AM = e7, this._$Ci = i7;
  }
  _$AS(t7, e7) {
    return this.update(t7, e7);
  }
  update(t7, e7) {
    return this.render(...e7);
  }
};

// lit-html/directives/unsafe-html.js
var e6 = class extends i4 {
  constructor(i7) {
    if (super(i7), this.it = A, i7.type !== t3.CHILD) throw Error(this.constructor.directiveName + "() can only be used in child bindings");
  }
  render(r6) {
    if (r6 === A || null == r6) return this._t = void 0, this.it = r6;
    if (r6 === E) return r6;
    if ("string" != typeof r6) throw Error(this.constructor.directiveName + "() called with a non-string value");
    if (r6 === this.it) return this._t;
    this.it = r6;
    const s5 = [r6];
    return s5.raw = s5, this._t = { _$litType$: this.constructor.resultType, strings: s5, values: [] };
  }
};
e6.directiveName = "unsafeHTML", e6.resultType = 1;
var o6 = e5(e6);

// lit-html/directives/unsafe-svg.js
var t4 = class extends e6 {
};
t4.directiveName = "unsafeSVG", t4.resultType = 2;
var o7 = e5(t4);

// ui/lib/split-tender.ts
function tendersTotal(tenders) {
  return tenders.reduce((sum, t7) => sum + Math.max(0, t7.amount), 0);
}
function remainingCents(payable, tenders) {
  return Math.max(0, Math.round(payable) - tendersTotal(tenders));
}
function changeDue(tenders) {
  return tenders.reduce(
    (sum, t7) => sum + (needsTendered(t7.method) ? Math.max(0, t7.tendered - t7.amount) : 0),
    0
  );
}
function planTender(method, typedCents, remaining) {
  if (!method || remaining <= 0) return void 0;
  const typed = Math.max(0, Math.round(typedCents) || 0);
  const amount = typed > 0 ? Math.min(typed, remaining) : remaining;
  const tendered = needsTendered(method) && typed > amount ? typed : amount;
  return { amount, tendered };
}
function buildPaymentsPayload(tenders) {
  return tenders.filter((t7) => t7.amount > 0).map((t7) => ({
    payment_method_id: t7.method?.id ?? null,
    amount: t7.amount,
    // Absent means «the exact amount» to the server, so it is only worth sending when the cashier
    // was handed more than the leg covers — which is the change.
    ...t7.tendered > t7.amount ? { amount_tendered: t7.tendered } : {}
  }));
}
function chargeBlock(payable, tenders) {
  if (!tenders.length) return void 0;
  const remaining = remainingCents(payable, tenders);
  return remaining > 0 ? { reason: "remaining", remaining } : void 0;
}

// ui/lib/line-tender.ts
function tenderableLines(lines) {
  return lines.filter(
    (l3) => !!l3.is_service && !!l3.line_id && !l3.is_gift && Math.round(l3.price * l3.qty) > 0
  );
}
function coverableLine(l3) {
  return l3.qty === 1;
}
function uncoveredLines(lines, covered) {
  if (!covered.size) return [...lines];
  return lines.filter((l3) => !l3.line_id || !covered.has(l3.line_id));
}

// @erplora/outfitkit/dist/ok-qty-stepper.js
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
    return { ...DEFAULT_LABELS4, ...this.labels };
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
  onInput(e7) {
    const raw = e7.target.value;
    const parsed = Number(raw);
    if (raw === "" || Number.isNaN(parsed)) return;
    this.commit(parsed);
  }
  // Al salir del campo, normaliza el texto al valor válido actual.
  onBlur(e7) {
    const input = e7.target;
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
        @input=${(e7) => this.onInput(e7)}
        @change=${(e7) => this.onBlur(e7)}
        @blur=${(e7) => this.onBlur(e7)}
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
__decorateClass7([
  n4({ type: Number })
], OkQtyStepper.prototype, "value");
__decorateClass7([
  n4({ type: Number })
], OkQtyStepper.prototype, "min");
__decorateClass7([
  n4({ type: Number })
], OkQtyStepper.prototype, "max");
__decorateClass7([
  n4({ type: Number })
], OkQtyStepper.prototype, "step");
__decorateClass7([
  n4({ type: Boolean, reflect: true })
], OkQtyStepper.prototype, "disabled");
__decorateClass7([
  n4({ attribute: false })
], OkQtyStepper.prototype, "labels");
define("ok-qty-stepper", OkQtyStepper);

// @erplora/outfitkit/dist/ok-spotlight-search.js
var __defProp8 = Object.defineProperty;
var __decorateClass8 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp8(target, key, result);
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

    /* Botón-trigger opcional (icon-only). #92 -- 44px, sin vecino con el que solapar. */
    button.trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--ok-tap-min, 44px);
      height: var(--ok-tap-min, 44px);
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
    /* #92 -- 44px; the middle of the row is a flexible <input>, so a bigger close button just
       grows into free space, no overlap. */
    .top .close {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--ok-tap-min, 44px);
      height: var(--ok-tap-min, 44px);
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
  onInput(e7) {
    this.value = e7.target.value;
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
        @click=${(e7) => {
      if (e7.target === e7.currentTarget) this.close();
    }}>
        <div class="top">
          <ion-icon class="lupa" .icon=${iconSearchOutline}></ion-icon>
          <input type="text" .value=${this.value} placeholder=${this.placeholder}
            aria-label=${this.placeholder} autocomplete="off" spellcheck="false"
            @input=${(e7) => this.onInput(e7)} />
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
__decorateClass8([
  n4({ type: Boolean, reflect: true })
], OkSpotlightSearch.prototype, "open");
__decorateClass8([
  n4()
], OkSpotlightSearch.prototype, "placeholder");
__decorateClass8([
  n4()
], OkSpotlightSearch.prototype, "value");
__decorateClass8([
  n4({ attribute: "trigger-icon" })
], OkSpotlightSearch.prototype, "triggerIcon");
__decorateClass8([
  n4({ attribute: "trigger-label" })
], OkSpotlightSearch.prototype, "triggerLabel");
__decorateClass8([
  e4(".top input")
], OkSpotlightSearch.prototype, "input");
define("ok-spotlight-search", OkSpotlightSearch);

// @erplora/outfitkit/dist/ok-empty-state.js
var __defProp9 = Object.defineProperty;
var __decorateClass9 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp9(target, key, result);
  return result;
};
var OkEmptyState = class extends i3 {
  constructor() {
    super(...arguments);
    this.icon = "file-tray-outline";
  }
  static {
    this.styles = i`
    /* Ancho máximo del contenedor; bloque a 100%. */
    :host {
      display: block;
      width: 100%;
      /* Tokens propios estilo Ionic (overridables): --ok-* → --ion-* → hex. */
      --icon-color: var(--ok-color-medium, var(--ion-color-medium, #92949c));
      --heading-color: var(--ok-text-color, var(--ion-text-color, #1f2933));
      --message-color: var(--ok-color-medium, var(--ion-color-medium, #92949c));
      --icon-size: 64px;
      --padding: 2.5rem 1.25rem;
    }

    /* Centrado vertical y horizontal del contenido. */
    .wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 0.5rem;
      padding: var(--padding);
      box-sizing: border-box;
      width: 100%;
    }

    ion-icon {
      font-size: var(--icon-size);
      color: var(--icon-color);
      opacity: 0.5; /* atenuado */
      margin-bottom: 0.25rem;
    }

    .heading {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--heading-color);
    }

    .message {
      margin: 0;
      font-size: 0.9375rem;
      color: var(--message-color);
      max-width: 38ch;
    }

    /* Acción debajo del texto. */
    .action {
      margin-top: 1rem;
    }

    /* Oculta los wrappers si no hay contenido. */
    .heading:empty,
    .message:empty {
      display: none;
    }
  `;
  }
  render() {
    return b2`
      <div class="wrap">
        <ion-icon .icon=${okIcon(this.icon)} aria-hidden="true"></ion-icon>
        ${this.heading ? b2`<h2 class="heading">${this.heading}</h2>` : null}
        ${this.message ? b2`<p class="message">${this.message}</p>` : null}
        <slot></slot>
        <div class="action">
          <slot name="action"></slot>
        </div>
      </div>
    `;
  }
};
__decorateClass9([
  n4()
], OkEmptyState.prototype, "icon");
__decorateClass9([
  n4()
], OkEmptyState.prototype, "heading");
__decorateClass9([
  n4()
], OkEmptyState.prototype, "message");
define("ok-empty-state", OkEmptyState);

// @erplora/outfitkit/dist/ok-status-pill.js
var __defProp10 = Object.defineProperty;
var __decorateClass10 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp10(target, key, result);
  return result;
};
var OkStatusPill = class extends i3 {
  constructor() {
    super(...arguments);
    this.tone = "neutral";
    this.dot = false;
    this.size = "md";
  }
  static {
    this.styles = i`
    :host {
      /* Vars overridable (estilo Ionic), default = cadena --ok-* → --ion-* → hex.
         --tone-color (base: fondo/punto/icono) y --tone-shade (texto) se reasignan por tone abajo. */
      --tone-color: var(--ok-medium, var(--ion-color-medium, #5f5f5f));
      --tone-shade: var(--ok-medium, var(--ion-color-medium-shade, #545454));
      --background-opacity: var(--ok-pill-bg-opacity, 0.14);
      --border-radius: var(--ok-pill-radius, 999px);
      --font: var(--ok-font, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);

      /* Inline: el pill vive en celdas de tabla, cabeceras y listados. */
      display: inline-flex;
      vertical-align: middle;
      font-family: var(--font);
      box-sizing: border-box;
    }

    /* Mapa de tonos → color Ionic (base + shade para el texto). */
    :host([tone='success']) {
      --tone-color: var(--ok-success, var(--ion-color-success, #2dd55b));
      --tone-shade: var(--ok-success, var(--ion-color-success-shade, #28bb50));
    }
    :host([tone='warning']) {
      --tone-color: var(--ok-warning, var(--ion-color-warning, #ffc409));
      --tone-shade: var(--ok-warning-shade, var(--ion-color-warning-shade, #e0ac08));
    }
    :host([tone='danger']) {
      --tone-color: var(--ok-danger, var(--ion-color-danger, #c5000f));
      --tone-shade: var(--ok-danger, var(--ion-color-danger-shade, #ad000d));
    }
    :host([tone='info']) {
      --tone-color: var(--ok-info, var(--ion-color-secondary, #0163aa));
      --tone-shade: var(--ok-info, var(--ion-color-secondary-shade, #015896));
    }
    :host([tone='primary']) {
      --tone-color: var(--ok-primary, var(--ion-color-primary, #3880ff));
      --tone-shade: var(--ok-primary, var(--ion-color-primary-shade, #3171e0));
    }
    /* neutral / sin tono → medium (default ya aplicado en :host). */

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4em;
      padding: 0.25em 0.7em;
      border-radius: var(--border-radius);
      /* Fondo tonal: el color del tono con baja opacidad. */
      background: color-mix(in srgb, var(--tone-color) calc(var(--background-opacity) * 100%), transparent);
      color: var(--ok-pill-color, var(--tone-shade));
      font-size: 0.8125rem;
      font-weight: 600;
      line-height: 1.4;
      white-space: nowrap;
    }
    :host([size='sm']) .pill {
      font-size: 0.72rem;
      padding: 0.2em 0.6em;
    }

    ion-icon {
      flex: 0 0 auto;
      font-size: 1.05em;
      pointer-events: none;
    }

    /* Punto de color (estilo Linear) en vez de icono. */
    .dot {
      flex: 0 0 auto;
      width: 0.5em;
      height: 0.5em;
      border-radius: 50%;
      background: var(--tone-color);
    }
  `;
  }
  render() {
    return b2`
      <span class="pill" part="pill">
        ${this.dot ? b2`<span class="dot" part="dot" aria-hidden="true"></span>` : this.icon ? b2`<ion-icon .icon=${okIcon(this.icon)} aria-hidden="true"></ion-icon>` : null}
        <slot>${this.label ?? ""}</slot>
      </span>
    `;
  }
};
__decorateClass10([
  n4({ type: String, reflect: true })
], OkStatusPill.prototype, "tone");
__decorateClass10([
  n4({ type: String })
], OkStatusPill.prototype, "label");
__decorateClass10([
  n4({ type: String })
], OkStatusPill.prototype, "icon");
__decorateClass10([
  n4({ type: Boolean, reflect: true })
], OkStatusPill.prototype, "dot");
__decorateClass10([
  n4({ type: String, reflect: true })
], OkStatusPill.prototype, "size");
define("ok-status-pill", OkStatusPill);

// ui/lib/checkout-preview.ts
function checkoutItems(lines, opts) {
  return lines.map((l3) => ({
    product_id: l3.id,
    product_name: l3.name,
    product_sku: l3.sku || "",
    price: l3.price,
    quantity: toMicro2(l3.qty),
    tax_category_key: l3.tax_category_key ?? null,
    tax_rate: l3.tax_rate ?? 0,
    category_id: l3.category_id ?? opts.primaryCategory?.(l3.id) ?? null,
    is_gift: l3.is_gift ?? false,
    gift_reason: l3.gift_reason ?? "",
    cost: l3.cost ?? 0,
    discount: l3.discount ?? 0,
    ...l3.is_service ? { is_service: true } : {},
    ...l3.modifiers?.length ? { modifiers: l3.modifiers.map((m4) => ({ option_id: m4.option_id })) } : {},
    ...l3.combo_id ? {
      combo_id: l3.combo_id,
      combo_choices: (l3.combo_choices ?? []).map((c5) => ({
        option_id: c5.option_id,
        product_name: c5.product_name ?? "",
        category_id: c5.category_id ?? null
      }))
    } : {},
    ...l3.line_id && opts.covered.has(l3.line_id) ? { covered: true } : {},
    ...l3.line_id ? { order_item_id: l3.line_id } : {},
    ...unitContextPayload(l3)
  }));
}
function checkoutPreviewPayload(shape, primaryCategory, orderId) {
  return {
    items: checkoutItems(shape.lines, { covered: shape.covered, primaryCategory }),
    discount_percent: shape.ticketDiscount,
    // sales#113: with a PARTIAL charge the fixed amount is not sent — it applies when the whole
    // check is closed, exactly as `sales.complete_sale` receives it.
    ...shape.ticketDiscountAmount > 0 && !shape.partial ? { discount_amount: shape.ticketDiscountAmount } : {},
    tax_included: shape.taxIncluded,
    ...orderId ? { order_id: orderId } : {}
  };
}
async function fetchCheckoutPreview(client, shape, opts = {}) {
  if (!shape.lines.length) return void 0;
  const res = await client.command(
    "sales.checkout.preview",
    checkoutPreviewPayload(shape, opts.primaryCategory, opts.orderId)
  );
  const result = res?.result;
  return result && typeof result.total === "number" ? result : void 0;
}
function previewSignature(shape) {
  const lines = shape.lines.map((l3) => [
    l3.line_id ?? l3.id,
    l3.id,
    l3.price,
    l3.qty,
    l3.discount ?? 0,
    l3.tax_category_key ?? "",
    l3.is_gift ? 1 : 0,
    l3.is_service ? 1 : 0,
    (l3.modifiers ?? []).map((m4) => m4.option_id).join("+"),
    l3.combo_id ?? "",
    (l3.combo_choices ?? []).map((c5) => c5.option_id).join("+")
  ]);
  return JSON.stringify([
    lines,
    shape.ticketDiscount,
    shape.ticketDiscountAmount,
    shape.taxIncluded,
    shape.partial ?? false,
    [...shape.covered].sort()
  ]);
}

// ui/lib/pos-open-price.ts
function buildOpenPriceLine(input) {
  const name = input.name.trim();
  if (!name) throw new Error("open-price: name is required");
  const taxCategoryKey = input.taxCategoryKey.trim();
  if (!taxCategoryKey) throw new Error("open-price: taxCategoryKey (departamento/IVA) is required");
  if (!Number.isInteger(input.priceCents) || input.priceCents <= 0) {
    throw new Error("open-price: priceCents must be a positive integer (c\xE9ntimos)");
  }
  return {
    id: "",
    // sin producto de catálogo → toItemPayload lo manda como product_id: null
    name,
    price: input.priceCents,
    qty: 1,
    tax_category_key: taxCategoryKey
  };
}

// ui/lib/checkout-key.ts
var KEY_PREFIX = "sale";
function newIdempotencyKey(source = globalThis.crypto) {
  const uuid = source?.randomUUID?.();
  if (uuid) return `${KEY_PREFIX}-${uuid}`;
  const bytes = new Uint8Array(16);
  if (source?.getRandomValues) {
    source.getRandomValues(bytes);
  } else {
    for (let i7 = 0; i7 < bytes.length; i7 += 1) bytes[i7] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b3) => b3.toString(16).padStart(2, "0")).join("");
  seq = (seq + 1) % 1e6;
  return `${KEY_PREFIX}-${Date.now().toString(36)}-${seq.toString(36)}-${hex}`;
}
var seq = 0;
var MESSAGES = {
  "sales.empty_sale": "ui.errorEmptySale",
  "sales.payment_method_required": "ui.errorPaymentMethod",
  "sales.payment_method_not_available": "ui.errorPaymentMethod",
  "sales.discounts_not_allowed": "ui.errorDiscountsOff",
  "sales.discount_out_of_range": "ui.errorDiscountRange",
  "sales.tax_rate_out_of_range": "ui.errorDiscountRange",
  "sales.customer_required": "ui.errorCustomerRequired",
  "sales.amount_negative": "ui.errorAmountNegative",
  "sales.insufficient_tendered": "ui.errorInsufficientTendered",
  // sales#159 (ADR-0386) — the legs of a split payment did not add up to the total the SERVER
  // priced. The screen builds the split on its preview, and the preview can sit a cent away from
  // the server's total (VAT excluded, weighed quantities, prorated discounts all round on the
  // server). The sale is refused, never absorbed, so the cashier has to be told what happened and
  // that the legs are still on screen to be fixed — not shown a raw domain code.
  "sales.payments_do_not_match_total": "ui.errorPaymentsMismatch",
  // sales#21 — no tax rule / no tax catalogue: the sale is refused, never priced by the browser.
  "sales.no_tax_rule": "ui.errorNoTaxRule",
  "sales.tax_catalog_unavailable": "ui.errorTaxCatalogUnavailable",
  "sales.idempotency_key_required": "ui.errorCharge",
  // sales#152 (ADR-0381) — el servidor arma el combo contra `combos.options.all` y falla CERRADO.
  // Cada uno manda al cajero a un sitio distinto, y por eso no comparten mensaje: «el menú se
  // retiró» se arregla en Combos, «falta un plato» se arregla en el tique, y «no se pudo cargar el
  // catálogo» no es culpa de nadie que esté delante de la caja. Un único «no se ha podido cobrar»
  // los convertiría a los tres en el mismo callejón sin salida.
  "sales.combo_catalog_unavailable": "ui.errorComboCatalogUnavailable",
  "sales.combo_not_available": "ui.errorComboNotAvailable",
  "sales.combo_not_on_sale": "ui.errorComboNotOnSale",
  "sales.combo_option_not_available": "ui.errorComboOptionNotAvailable",
  "sales.combo_group_unresolved": "ui.errorComboGroupUnresolved",
  "sales.combo_group_over_max": "ui.errorComboGroupOverMax",
  "sales.combo_option_repeated": "ui.errorComboOptionRepeated",
  "sales.combo_component_price_unknown": "ui.errorComboComponentPriceUnknown",
  "sales.combo_tax_category_missing": "ui.errorComboTaxCategoryMissing",
  "sales.too_many_lines": "ui.errorTooManyLines",
  // sales#147 (the amendment to ADR-0376) — a supplement that taxes differently now gets a LINE OF
  // ITS OWN, so it is charged instead of refused. What is still refused is a supplement that bills
  // apart and is worth NOTHING: a 0 € — or negative — row at another rate is a rebate wearing a tax
  // category, and it would declare a base the customer never bought. Its own message and not
  // `ui.errorCharge` on purpose: it is fixed on the option in the Modifiers catalogue, in ten
  // seconds, and only if the screen says which one.
  "sales.modifier_child_price_invalid": "ui.errorModifierChildPrice",
  // sales#201 (ADR-0147 §2.2) — an invalid quantity. The quantity pad already refuses off-grid
  // amounts before charging, so the handler is the last net; when it fires, the cashier gets the
  // SAME sentence the pad gives instead of a bare «could not charge».
  "sales.quantity_off_grid": "ui.qtyOffGrid",
  "sales.quantity_not_positive": "ui.errorQuantityNotPositive",
  // sales#185 (hub#1074, ADR-0400) — PLATFORM codes, not domain ones. `complete_sale` declares
  // `taxes.rules.list` as a read with `required: true`, so a hub missing the tax app (force
  // uninstalled, hub#1101, or deactivated by the ADR-0128 cascade) has the sale refused by the
  // runtime itself. The cashier has no business reading "module `taxes` is not installed": what
  // they need to know is that an app is missing and that NOTHING was charged.
  module_not_installed: "ui.errorMissingApp",
  module_inactive: "ui.errorMissingApp",
  // hub#701: the required read exists but did not resolve. The only `required` read of
  // `complete_sale` is the tax catalogue, so this is exactly what sales#21 already says.
  read_unavailable: "ui.errorTaxCatalogUnavailable"
};
function checkoutErrorKey(code) {
  return MESSAGES[code] ?? "ui.errorCharge";
}
function errorCode(e7) {
  const code = e7?.code;
  return typeof code === "string" ? code : "";
}

// ui/lib/transport-error.ts
var SERVER_UNAVAILABLE_KEY = "ui.serverUnavailable";
function transportErrorKey(e7) {
  const code = e7?.code;
  if (typeof code === "string" && code) return code === SERVER_UNAVAILABLE ? SERVER_UNAVAILABLE_KEY : null;
  const msg = e7 instanceof Error ? e7.message : String(e7 ?? "");
  if (!msg) return null;
  if (msg.includes("is not valid JSON")) return SERVER_UNAVAILABLE_KEY;
  if (/^(Failed to fetch|Load failed|NetworkError)/i.test(msg)) return SERVER_UNAVAILABLE_KEY;
  if (msg.includes("The string did not match the expected pattern")) return SERVER_UNAVAILABLE_KEY;
  if (msg.startsWith("JSON Parse error")) return SERVER_UNAVAILABLE_KEY;
  if (msg.startsWith("JSON.parse:")) return SERVER_UNAVAILABLE_KEY;
  if (/^Unexpected token .* in JSON/.test(msg)) return SERVER_UNAVAILABLE_KEY;
  return null;
}

// ui/lib/checkout-recovery.ts
var wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function recoverCheckout(probe, idempotencyKey, options = {}) {
  if (!idempotencyKey) return { outcome: "unknown" };
  const attempts = Math.max(1, options.attempts ?? 1);
  const sleep = options.sleep ?? wait;
  const delayMs = options.delayMs ?? 1500;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const rows3 = await probe(idempotencyKey);
      if (!rows3?.length) return { outcome: "not_charged" };
      return { outcome: "charged", saleId: rows3[0]?.id ?? "" };
    } catch {
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  return { outcome: "unknown" };
}

// ui/lib/media-photo-cache.ts
var MediaPhotoCache = class {
  constructor(client, changed = () => void 0, createObjectUrl = (blob) => URL.createObjectURL(blob), revokeObjectUrl = (url) => URL.revokeObjectURL(url), concurrency = 8) {
    this.client = client;
    this.changed = changed;
    this.createObjectUrl = createObjectUrl;
    this.revokeObjectUrl = revokeObjectUrl;
    this.concurrency = concurrency;
    this.urls = /* @__PURE__ */ new Map();
    this.generation = 0;
    this.changeScheduled = false;
  }
  get(ref2) {
    return ref2 ? this.urls.get(ref2) : void 0;
  }
  /** Retira sólo la foto que el navegador no pudo decodificar; el resto del muro sigue intacto. */
  drop(ref2, expectedUrl) {
    const url = this.urls.get(ref2);
    if (!url || expectedUrl !== void 0 && url !== expectedUrl) return;
    this.urls.delete(ref2);
    this.revokeObjectUrl(url);
    this.notifyChanged();
  }
  async replace(refs) {
    const generation = ++this.generation;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.revokeAll();
    const unique = [...new Set(refs.filter((ref2) => !!ref2?.trim()))];
    const client = this.client();
    const loader = client?.fetchMediaBlob;
    if (typeof loader !== "function" || unique.length === 0) return;
    let cursor = 0;
    const work = async () => {
      while (cursor < unique.length) {
        if (generation !== this.generation || controller.signal.aborted) return;
        const ref2 = unique[cursor++];
        let blob;
        try {
          blob = await loader.call(client, ref2, { signal: controller.signal });
        } catch {
          if (generation !== this.generation || controller.signal.aborted) return;
          continue;
        }
        if (!blob || !blob.type.toLowerCase().startsWith("image/")) continue;
        const url = this.createObjectUrl(blob);
        if (generation !== this.generation || controller.signal.aborted) {
          this.revokeObjectUrl(url);
          continue;
        }
        this.urls.set(ref2, url);
        this.notifyChanged();
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(Math.max(1, this.concurrency), unique.length) }, () => work())
    );
  }
  dispose() {
    ++this.generation;
    this.controller?.abort();
    this.controller = void 0;
    this.revokeAll();
  }
  revokeAll() {
    if (this.urls.size === 0) return;
    for (const url of this.urls.values()) this.revokeObjectUrl(url);
    this.urls.clear();
    this.notifyChanged();
  }
  /** Como máximo un repintado por frame, aunque terminen muchas de las 280 descargas juntas. */
  notifyChanged() {
    if (this.changeScheduled) return;
    this.changeScheduled = true;
    const flush = () => {
      this.changeScheduled = false;
      this.changed();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(flush);
    else queueMicrotask(flush);
  }
};

// ui/components/erp-pos-touch/erp-pos-touch.ts
var CATALOG2 = { es: es_default, en: en_default };
var CLOSED_PRICING = /* @__PURE__ */ new Set(["fixed", "free", ""]);
function deptDisplayName(c5) {
  return c5.display_name || c5.name;
}
function pushDigit(cur, k2) {
  if (k2 === "C") return "";
  if (k2 === "." && cur.includes(".")) return cur;
  return (cur + k2).slice(0, 9);
}
function erplora2() {
  const c5 = globalThis.erplora;
  if (!c5) throw new Error("erplora SDK no inicializado por el shell");
  return c5;
}
async function optionalRead(read) {
  try {
    const c5 = erplora2();
    if (typeof c5.queryOptional !== "function") return void 0;
    return await read(c5);
  } catch {
    return void 0;
  }
}
var LEGACY_PAGE_LIMIT = 500;
function catalogSourceOn(v3) {
  return v3 !== 0;
}
var HARD_DEPENDENCIES = ["inventory", "taxes"];
async function optionalCatalogRead(whole, page) {
  return capabilityRead(async () => {
    const c5 = erplora2();
    if (typeof c5.queryAllOptional === "function") return await whole(c5);
    if (typeof c5.queryOptional === "function") return await page(c5);
    return void 0;
  });
}
async function optionalReadAll(whole, page) {
  try {
    const c5 = erplora2();
    if (typeof c5.queryAllOptional === "function") return await whole(c5);
    if (typeof c5.queryOptional === "function") return await page(c5);
    return void 0;
  } catch {
    return void 0;
  }
}
function groupModifierRows(rows3) {
  const out = [];
  for (const raw of rows3) {
    const r6 = raw;
    const gid = String(r6.group_id ?? "");
    if (!gid) continue;
    let g3 = out.find((x2) => x2.id === gid);
    if (!g3) {
      g3 = {
        id: gid,
        name: String(r6.group_name ?? ""),
        min: Number(r6.min_choices ?? 0),
        max: Number(r6.max_choices ?? 0),
        options: []
      };
      out.push(g3);
    }
    const oid = String(r6.option_id ?? "");
    if (oid) g3.options.push({ id: oid, name: String(r6.option_name ?? ""), price_delta: Number(r6.price_delta ?? 0) });
  }
  return out;
}
function t5(key, params) {
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
    /**
     * El shell descarga cada ruta portable con la sesión del Hub y esta caché posee los `blob:` que
     * sí puede pintar un `<img>`. Un shell anterior no expone la capacidad y deja las iniciales.
     */
    this.photos = new MediaPhotoCache(
      () => erplora2(),
      () => this.requestUpdate()
    );
    /** Invalida continuaciones asíncronas de montajes anteriores, incluso tras reconectar rápido. */
    this.connectionEpoch = 0;
    this.chrome = "";
    this.fullscreen = false;
    this.moreOpen = false;
    this.products = [];
    this.categories = [];
    this.taxCategories = [];
    this.activeCat = "";
    this.q = "";
    this.cart = [];
    this.methods = [];
    this.settings = {};
    this.businessName = "";
    this.paying = false;
    this.tendered = "";
    this.openPriceOpen = false;
    this.ticketDiscount = 0;
    this.noteInput = "";
    this.quickNotes = [];
    this.quickNotesState = "idle";
    this.discountInput = "";
    this.ticketDiscountAmount = 0;
    this.discountMode = "percent";
    this.openAmount = "";
    this.modifierPicks = [];
    this.comboCatalog = [];
    this.comboCatalogFailed = false;
    this.brokenCatalogApps = [];
    this.catalogAppAbsent = false;
    this.comboPicks = [];
    this.comboNeedsGroup = "";
    this.openDept = "";
    this.splitting = false;
    this.tenders = [];
    this.docFormat = "ticket";
    this.busy = false;
    this.error = "";
    this.blockedNotice = "";
    /** Clave del INTENTO de cobro en curso (sales#20): se genera al abrir la pantalla de cobro, se
     *  REUTILIZA en cada reintento —por eso un timeout no crea una segunda venta— y se descarta en
     *  cuanto la venta consta. Vacía = no hay cobro en curso. */
    this.checkoutKey = "";
    this.checkoutUnknown = false;
    this.parked = [];
    this.splitSel = /* @__PURE__ */ new Set();
    this.covered = /* @__PURE__ */ new Map();
    this.parkedOpen = false;
    this.cartOpen = false;
    this.orderLabel = "";
    this.orderView = "account";
    this.searchOpen = false;
    this.prebillOpen = false;
    this.modifierCatalog = /* @__PURE__ */ new Map();
    this.parkPromptOpen = false;
    this.parkName = "";
    this.dirtyOpen = false;
    this.dirtyAllowCancel = false;
    this.printOnCharge = true;
    this.tableLabel = "";
    this.customerName = "";
    this.customerTaxId = "";
    this.customerAddress = "";
    this.simplifiedMaxCents = null;
    this.staffName = "";
    this.staffPickerOpen = false;
    this.hubUsers = [];
    this.staffPickerState = "idle";
    this.prodCats = /* @__PURE__ */ new Map();
    /** Registro de unidades (ADR-0147): code → fila, para congelar el contexto al añadir línea. */
    this.units = /* @__PURE__ */ new Map();
    /** Catálogo fiscal del hub: mapa tax_category_key → rate_pct (preview del IVA) + si LLEGÓ.
     *  Vacío y `available:false` mientras carga o si `taxes` no responde. ADR-0064/0066/0085. */
    this.taxCatalog = { rates: /* @__PURE__ */ new Map(), available: false, installed: true };
    this.missingChargeApp = "";
    /** Signature of the ticket already priced, so we do not re-ask on every repaint. */
    this.valuedSignature = "";
    /** Request counter: an older answer must never overwrite a newer one. */
    this.valuationSeq = 0;
    this.cartRestored = false;
    // Botones de asignación (ADR-0043 B): cada módulo que aporta a `sales.pos.assign` monta SU botón
    // (mesa, cliente…) en el header. Botones independientes: cada uno abre su propio modal. El POS no
    // conoce a `tables`/`customers`; solo monta sus WC y escucha `erp:order-context`/`erp:customer-context`.
    this.assignFillers = [];
    /** Fillers de acciones (`sales.pos.actions`): Cocina aporta «Enviar comanda» dentro del borrador. */
    this.actionFillers = [];
    /** Fillers del slot de INFO del pedido (`sales.pos.order_info`, cabecera de ENVIADO):
     *  kitchen aporta su chip «Comandas · N» que abre el modal con estados en vivo. */
    this.infoFillers = [];
    /** Fillers del slot de TENDER POR LÍNEA (`sales.pos.tender`, sales#162 / ADR-0386): `services`
     *  aporta aquí su bono, que cubre UNA línea de servicio entera. El POS no sabe qué es un bono —
     *  monta el slot, le pasa cuatro valores y escucha dos eventos. Sin el módulo dueño, `loadSlot`
     *  devuelve vacío y el cobro es exactamente el de siempre. */
    this.tenderFillers = [];
    /** Una instancia por (filler × línea). Se guardan aquí para que la MISMA sobreviva a cerrar y
     *  reabrir el sheet: el canje ya tomado sigue en pantalla, con su «deshacer». */
    this.tenderEls = /* @__PURE__ */ new Map();
    // Comanda ATADA a la mesa (puntos 1+2): al cambiar de mesa se GUARDA la comanda de la mesa
    // actual y se RECUPERA la de la nueva (o el carrito suelto si es null). Así tocar una mesa
    // ocupada trae su tiquet a la pantalla de venta, como cualquier POS.
    this.onOrderContext = async (e7) => {
      const d3 = e7.detail ?? { table_id: null };
      const nextTable = d3.table_id ?? void 0;
      if (nextTable && d3.order_id && d3.order_id === this.orderId) {
        const previousTableLabel = this.tableLabel;
        this.tableId = nextTable;
        this.tableLabel = d3.label ?? this.tableLabel;
        if (!this.orderLabel || this.orderLabel === previousTableLabel) this.orderLabel = this.tableLabel;
        return;
      }
      if (nextTable && nextTable === this.tableId) {
        const previousTableLabel = this.tableLabel;
        this.tableLabel = d3.label ?? this.tableLabel;
        if (!this.orderLabel || this.orderLabel === previousTableLabel) this.orderLabel = this.tableLabel;
        return;
      }
      const accion = decideOnTableChange({
        cartHasItems: this.cart.length > 0,
        currentTableId: this.tableId,
        targetTableId: nextTable,
        targetOrderId: d3.order_id ?? void 0
      });
      const aparcarOEliminar = async () => {
        const eleccion = await this.resolveDirtyCart(false);
        if (eleccion === "discard") await this.discardCurrent();
        else await this.parkWith(defaultParkLabel("", /* @__PURE__ */ new Date()));
      };
      if (accion === "clear" || accion === "park-then-clear") {
        const habiaMesa = !!this.tableId;
        this.tableId = void 0;
        this.tableLabel = "";
        if (accion === "park-then-clear") {
          if (habiaMesa) {
            this.parkName = defaultParkLabel("", /* @__PURE__ */ new Date());
            this.parkedOpen = false;
            this.parkPromptOpen = true;
          } else {
            await aparcarOEliminar();
          }
          return;
        }
        this.orderId = void 0;
        this.orderLabel = "";
        this.cart = [];
        return;
      }
      if (accion === "start-new-check") {
        this.tableId = nextTable;
        this.tableLabel = d3.label ?? "";
        this.orderId = void 0;
        this.orderLabel = this.tableLabel;
        this.cart = [];
        return;
      }
      if (accion === "assign-to-target") {
        this.tableId = nextTable;
        this.tableLabel = d3.label ?? "";
        if (!this.orderLabel) this.orderLabel = this.tableLabel;
        this.notifyOrderLinked();
        return;
      }
      if (accion === "park-then-load") await aparcarOEliminar();
      this.tableId = nextTable;
      this.tableLabel = d3.label ?? "";
      const linked = d3.order_id ?? void 0;
      this.orderId = linked;
      this.orderLabel = this.tableLabel;
      if (linked) rememberCurrentCheck(localStorage, linked);
      else forgetCurrentCheck(localStorage);
      this.cart = linked ? await loadOrderLines(erplora2(), linked) : [];
    };
    // Fusionar mesas (punto 3): el filler ya ejecutó tables.sessions.merge; aquí se combinan los
    // tiquets (sumando líneas idénticas) en la mesa destino y se limpia el origen.
    this.onOrderMerge = async (e7) => {
      const d3 = e7.detail;
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
        const previousTableLabel = this.tableLabel;
        this.tableId = d3.to_table_id;
        this.tableLabel = d3.to_label ?? this.tableLabel;
        if (!this.orderLabel || this.orderLabel === previousTableLabel) this.orderLabel = this.tableLabel;
        this.orderId = to;
        this.cart = await loadOrderLines(erplora2(), to);
      }
    };
    // Dividir la cuenta (sales#61): el filler ya ejecutó `tables.sessions.split`, así que la mesa
    // tiene una SEGUNDA cuenta viva — y nace sin pedido a propósito, porque las líneas y los importes
    // son de `sales`. Aquí se materializa ese segundo pedido con lo que el camarero haya MARCADO en
    // el carrito (la misma marca que ya sirve para cobrar por partes: se toca lo de quien se va) y se
    // publica para que la sala lo cuelgue de ESA cuenta, no de "la mesa".
    this.onOrderSplit = async (e7) => {
      const d3 = e7.detail;
      if (!d3) return;
      this.pendingSplitSession = d3.session_id ?? void 0;
      const source = d3.from_order_id ?? this.orderId;
      if (!source) {
        this.orderId = void 0;
        this.cart = [];
        this.splitSel = /* @__PURE__ */ new Set();
        this.orderLabel = d3.label ?? this.orderLabel;
        forgetCurrentCheck(localStorage);
        return;
      }
      const marcadas = source === this.orderId ? this.splitSel : /* @__PURE__ */ new Set();
      let nuevo = "";
      try {
        nuevo = await splitOrder(erplora2(), source, marcadas, d3.label ?? "");
      } catch {
        this.error = t5("ui.splitFailed");
        return;
      }
      if (!nuevo) {
        this.error = t5("ui.splitFailed");
        return;
      }
      this.splitSel = /* @__PURE__ */ new Set();
      this.orderId = nuevo;
      this.orderLabel = d3.label ?? this.orderLabel;
      if (d3.table_id) this.tableId = d3.table_id;
      rememberCurrentCheck(localStorage, nuevo);
      this.notifyOrderLinked();
      this.cart = await loadOrderLines(erplora2(), nuevo);
      this.parked = await listOpenChecks(erplora2(), nuevo);
    };
    // Transferir mesa (punto 4): el filler ya ejecutó tables.sessions.transfer; aquí se mueve la
    // comanda de la mesa origen a la destino (libre → sin comanda previa) y se limpia el origen.
    this.onOrderTransfer = async (e7) => {
      const d3 = e7.detail;
      if (!d3?.from_table_id || !d3?.to_table_id || d3.from_table_id === d3.to_table_id) return;
      if (this.tableId !== d3.from_table_id) return;
      const previousTableLabel = this.tableLabel;
      this.tableId = d3.to_table_id;
      this.tableLabel = d3.to_label ?? this.tableLabel;
      if (!this.orderLabel || this.orderLabel === previousTableLabel) this.orderLabel = this.tableLabel;
      const order = d3.to_order_id ?? this.orderId;
      if (order && order !== this.orderId) {
        this.orderId = order;
        this.cart = await loadOrderLines(erplora2(), order);
      }
    };
    this.onCustomerContext = (e7) => {
      const d3 = e7.detail ?? { customer_id: null };
      this.customerId = d3.customer_id ?? void 0;
      this.customerName = d3.customer_name ?? "";
      this.customerTaxId = d3.customer_tax_id ?? "";
      this.customerAddress = d3.customer_address ?? "";
      this.notifyOrderLinked();
    };
    this.onOrderFire = () => {
      void this.fireToKitchen();
    };
    /** Una línea la cubrió un tender externo: sale del importe a cobrar y el resto del ticket sigue
     *  cobrándose con su propio medio. El id del canje se guarda porque es lo que lo identifica. */
    this.onLineTenderHeld = (e7) => {
      const d3 = e7.detail;
      if (!d3?.lineRef) return;
      const next = new Map(this.covered);
      next.set(d3.lineRef, String(d3.redemptionId ?? ""));
      this.covered = next;
    };
    /** El cajero deshizo el canje antes de cobrar: la línea vuelve a contar. */
    this.onLineTenderReleased = (e7) => {
      const d3 = e7.detail;
      if (!d3?.lineRef) return;
      const next = new Map(this.covered);
      next.delete(d3.lineRef);
      this.covered = next;
    };
    this.onLocaleChange = () => this.requestUpdate();
    // ══ sales#28 · THE SCALE ═════════════════════════════════════════════════════════════════════
    //
    // Decided with the market (9 references + 2 forums; the table is in `lib/scale-entry.ts` and in
    // `architecture/modules/sales.md`). Square, Odoo, Clover, Toast, Lightspeed and Glop all do the
    // same thing: the cashier picks the article, THEN the platter, and the reading becomes that
    // line's quantity. Nothing here creates a line, and nothing here converts a unit.
    /** A weight the hardware measured. Fire-and-forget: the shell never waits for an answer. */
    this.onScaleWeight = (e7) => {
      void this.applyScaleWeight(e7.detail);
    };
    /** Asegura que existe un pedido abierto que respalde el carrito; devuelve su id ('' si falla).
     *  Si hay una MESA seleccionada, avisa a los fillers (`tables`) para que escriban la junction
     *  mesa↔pedido — `sales` no toca `tables`: es un contrato por evento (ADR-0043/0141). */
    /** Manda a cocina lo pedido hasta ahora (ADR-0141). La comanda nace del PEDIDO, no del cobro: el
     *  camarero dispara al tomar nota y el pedido sigue abierto hasta que el cliente pague. Cada
     *  disparo es una RONDA (bebidas primero, comida después), y `kitchen` las numera.
     *
     *  La etiqueta que verá el cocinero es la de la mesa asignada, y viaja OPACA: `sales` no depende
     *  de `tables`, solo reenvía el texto que el slot de mesas le dejó en `tableLabel`. */
    /** sales#80 — un disparo en vuelo. El filler de kitchen puede emitir dos `erp:order-fire` con un
     *  doble toque; el segundo llega antes de que el primero haya releído las líneas y vería las
     *  mismas pendientes. Mientras haya uno en vuelo, los demás se ignoran (defensa en la UI); el
     *  handler además rechaza `sales.nothing_to_fire` si el pedido ya no tiene nada pendiente. */
    this.firing = false;
    /** Una sola vía para el trabajo del carrito. Sin esto, cinco toques seguidos abrían cinco
     *  pedidos: cada uno veía «aún no hay pedido» porque el anterior seguía en vuelo (ADR-0144). */
    this.queue = createSerialQueue();
    this.padPrimed = false;
    this.tenderSeq = 0;
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
      display:block; height:100%; box-sizing:border-box; font-family: system-ui, sans-serif; color:var(--tx);
    }
    *, *::before, *::after { box-sizing:border-box; }

    .card { height:100%; display:flex; flex-direction:column; overflow:hidden; background:var(--bg);
      border:1px solid var(--ion-border-color); border-radius:16px; }
    /* sales#178 - grid-template-rows is the load-bearing half of the fix. .body holds ONE row and
       an implicit auto row is sized by its CONTENT: its base size is .catalog's min-content, which
       with a full restaurant menu (281 items) is ~6.800px at 1440 and ~13.600px at 834. Letting the
       ITEM shrink (min-height:0) does not stop the TRACK from growing - the item just stretches to
       fill a 6.800px row. minmax(0,1fr) pins the row to .body's own height, and only then does
       .grid ever reach its overflow:auto and the cart's ion-footer stay on screen. */
    .body { position:relative; flex:1; min-height:0; display:grid; grid-template-columns: 1fr 23rem;
      grid-template-rows: minmax(0, 1fr); }

    /* ── Catálogo ── */
    /* sales#178 - min-height:0 is NOT decoration here: .catalog is a grid item, and a grid item's
       default minimum size is its CONTENT. With a full restaurant menu (281 items) the tile grid is
       ~20.000px tall, .catalog refused to shrink under it, and the whole .body row grew to match:
       .grid never reached its own overflow:auto, the cart column stretched with it and its
       ion-footer -- Total, Discount, Pre-bill, CHARGE -- ended up 20.000px below the viewport. And
       .card is overflow:hidden, so there was not even a scrollbar: the content simply did not exist
       for the cashier. Same pair .body and .cart already carry; only min-width:0 was set here. */
    .catalog { display:flex; flex-direction:column; min-width:0; min-height:0; padding:.8rem; }
    .catbar { position:relative; display:flex; align-items:center; gap:.4rem; margin-bottom:.7rem; }

    /* Menú ⋮ de PANTALLA (no de venta): anclado bajo su botón, como cualquier kebab. La capa de
       cierre va fija sobre todo el viewport para que un toque fuera lo cierre venga de donde venga. */
    .more-scrim { position:fixed; inset:0; z-index:30; background:transparent; }
    dialog.more-menu { position:absolute; top:calc(100% + .35rem); right:0; left:auto; z-index:31;
      display:flex; flex-direction:column; gap:.15rem; margin:0; padding:.3rem;
      min-width:13rem; border:1px solid var(--ion-border-color); border-radius:var(--ok-radius,12px);
      background:var(--panel); color:var(--tx); box-shadow:var(--ok-shadow-modal, 0 18px 50px rgba(0,0,0,.35)); }
    dialog.more-menu button { display:flex; align-items:center; gap:.6rem; width:100%;
      padding:.7rem .7rem; font-size:.92rem; text-align:left; color:inherit; cursor:pointer;
      background:none; border:none; border-radius:var(--ok-radius-sm,10px); }
    dialog.more-menu button:hover { background:var(--tile-hi); }
    dialog.more-menu ion-icon { font-size:1.15rem; color:var(--mut); }
    .arrow { flex:none; width:2.1rem; height:2.1rem; border-radius:var(--ok-radius-sm,10px); border:1px solid var(--ion-border-color);
      background:var(--tile); color:var(--mut); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
    .arrow:hover { background:var(--tile-hi); color:var(--tx); }
    .arrow ion-icon { font-size:1.1rem; }
    ion-segment.category-segment { flex:1; min-width:0; width:auto; justify-content:flex-start;
      overflow-x:auto; scroll-behavior:smooth;
      overscroll-behavior-x:contain; padding:.15rem; scrollbar-width:none; --background:transparent; }
    ion-segment.category-segment::-webkit-scrollbar { display:none; }
    /* Mismo indicio de overflow que la bottom bar de OutfitKit. bindTabbar() publica qué borde
       esconde opciones y estas máscaras viven aquí porque el CSS global no cruza el Shadow DOM. */
    ion-segment.category-segment.ok-tabbar[data-overflow='end'] {
      -webkit-mask-image:linear-gradient(to right,#000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
      mask-image:linear-gradient(to right,#000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
    }
    ion-segment.category-segment.ok-tabbar[data-overflow='start'] {
      -webkit-mask-image:linear-gradient(to left,#000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
      mask-image:linear-gradient(to left,#000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
    }
    ion-segment.category-segment.ok-tabbar[data-overflow='both'] {
      -webkit-mask-image:linear-gradient(to right,transparent 0,#000 var(--ok-tabbar-fade,36px),
        #000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
      mask-image:linear-gradient(to right,transparent 0,#000 var(--ok-tabbar-fade,36px),
        #000 calc(100% - var(--ok-tabbar-fade,36px)),transparent 100%);
    }
    ion-segment-button.cat-segment-button { flex:0 0 9.5rem; min-width:9.5rem; min-height:4.4rem;
      margin:0 .275rem; border:1px solid transparent; border-radius:var(--ok-radius,12px);
      text-transform:none; --background:var(--tile); --background-checked:var(--tile-hi);
      --color:var(--tx); --color-checked:var(--tx); --indicator-color:transparent;
      --indicator-box-shadow:none; --padding-start:.65rem; --padding-end:.65rem; }
    ion-segment-button.cat-segment-button.segment-button-checked { border-color:var(--accent); }
    .cat-segment-label { display:flex; width:100%; height:100%; flex-direction:column;
      justify-content:center; align-items:flex-start; min-width:0; margin:0; text-align:left; }
    .cat-segment-label .cc-n { width:100%; font-weight:700; font-size:.92rem; line-height:1.1;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cat-segment-label .cc-c { font-size:.72rem; color:var(--mut); margin-top:.1rem; }

    /* Resultados del buscador de productos (proyectados en el slot de ok-spotlight-search). */
    .sp-list { background:transparent; }
    ion-list.sp-list { background:transparent; }
    .sp-list ion-item { --background:transparent; border-radius:var(--ok-radius-sm,10px); }
    .sp-price { font-weight:800; color:var(--accent); }
    .sp-list ion-item[disabled] .sp-warn { color:var(--ion-color-warning-shade,#b26a00); white-space:normal; }
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap:.7rem; overflow:auto; align-content:start; padding-bottom:.3rem; }
    ion-card.tile { margin:0; border-radius:var(--ok-radius,14px); box-shadow:none; border:1px solid var(--ion-border-color); background:var(--tile);
      overflow:hidden; display:flex; flex-direction:column; transition:border-color .12s, transform .05s; }
    ion-card.tile:hover { border-color:var(--accent); }
    ion-card.tile:active { transform:scale(.98); }
    /* sales#74 + sales#58 - an item checkout would reject: it shows, it takes the tap, and the tap
       SAYS why. Never the native disabled attribute: on Ionic that means pointer-events none, so a
       touchscreen swallows the tap and the reason (title needs a hover, aria-label needs a screen
       reader) reaches nobody - the grid just looks broken. Colour and opacity are not the message
       either (colour blindness, bad screens): the reason travels in WORDS, on the tile itself. */
    ion-card.tile[aria-disabled='true'] { opacity:.72; border-style:dashed; cursor:not-allowed; }
    ion-card.tile[aria-disabled='true']:hover { border-color:var(--ion-color-warning,#ffc409); }
    .thumb { height:5.6rem; background-size:cover; background-position:center; display:flex; align-items:center; justify-content:center;
      font-weight:800; font-size:1.4rem; color:rgba(255,255,255,.85); position:relative; }
    /* La foto TAPA el marcador en vez de sustituirlo: va absoluta sobre el degradado y las
       iniciales, que quedan debajo. Si no carga, no ocupa y asoma lo de abajo. */
    .thumb img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
    .thumb .warn { z-index:1; position:absolute; top:.28rem; right:.28rem; display:flex; align-items:center; justify-content:center;
      width:1.5rem; height:1.5rem; border-radius:50%; background:var(--ion-color-warning,#ffc409);
      color:var(--ion-color-warning-contrast,#000); font-size:1.05rem; }
    .tinfo { padding:.5rem .6rem .65rem; }
    /* The block label, on the tile and in words (Square and Toast paint "Sold Out" right there).
       The long reason goes to the notice the tap raises; the short label is what fits here. */
    .tile .blocked-badge { margin-top:.3rem; display:inline-block; max-width:100%; overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; padding:.08rem .38rem; border-radius:var(--ok-radius-pill,999px);
      background:var(--ion-color-warning,#ffc409); color:var(--ion-color-warning-contrast,#000);
      font-size:.68rem; font-weight:700; letter-spacing:.02em; text-transform:uppercase; }
    /* The notice the tap raises: where the cashier is already looking, not in a corner. */
    .blocked-notice { display:flex; align-items:center; gap:.4rem; margin:0 0 .5rem; padding:.45rem .6rem;
      border-radius:var(--ok-radius,14px); border:1px solid var(--ion-color-warning,#ffc409);
      background:color-mix(in srgb, var(--ion-color-warning,#ffc409) 16%, transparent);
      color:var(--tx); font-size:.82rem; line-height:1.25; }
    .blocked-notice ion-icon { flex:none; font-size:1.05rem; color:var(--ion-color-warning-shade,#e0ac08); }
    /* sales#185 — a full-colour primary button that is NOT going to charge is a promise the
       screen does not keep. It is dimmed, and stays live to the tap: openPay() answers with the
       reason. */
    ion-button.charge.blocked { --background:var(--ion-color-medium,#92949c);
      --background-activated:var(--ion-color-medium-shade,#808289);
      --background-focused:var(--ion-color-medium-shade,#808289); }
    /* sales#149 — the state of the CATALOGUE. Deliberately QUIETER than .blocked-notice: no
       coloured box, because this is not an incident raised by the tap that just happened but a
       condition that has been true since the till opened, and at that height it competes with the
       product. */
    /* A SENTENCE, not a bar of three boxes: in flex, a narrow width (mobile, or the shrunken grid
       of a tablet in portrait) breaks the row and leaves the icon alone on one line and the link on
       another. As running text the icon and the link travel INSIDE the sentence, and the notice
       takes as many lines as it needs without falling apart. */
    .catalog-health { display:block; margin:0 0 .5rem; padding:0 .1rem;
      color:var(--mut); font-size:.8rem; line-height:1.35; }
    .catalog-health ion-icon { display:inline-block; vertical-align:-.15em; margin-right:.3rem;
      font-size:1rem; color:var(--ion-color-warning-shade,#e0ac08); }
    /* An Ionic button comes with toolbar height: here it is a link inside a sentence. */
    .catalog-health .ch-fix { display:inline-block; vertical-align:-.35em;
      --padding-start:.25rem; --padding-end:.25rem; margin:0;
      height:1.5rem; font-size:.8rem; text-transform:none; letter-spacing:0; }
    .tile .n { font-weight:600; font-size:.9rem; line-height:1.2; color:var(--tx); }
    .tile .p { font-weight:800; color:var(--accent); margin-top:.25rem; }

    /* ── Carrito ── */
    .cart { position:relative; display:flex; flex-direction:column; min-height:0; background:var(--panel); border-left:1px solid var(--ion-border-color); }
    .cart ion-header ion-toolbar { --background:var(--panel); --color:var(--tx); --border-color:var(--ion-border-color); }
    .cart ion-title { font-size:1rem; }
    /* Contexto asignado (mesa/cliente) como CHIPS en el título — sustituye al texto "Venta". */
    /* Tamaño ÚNICO de los iconos de la cabecera del carrito. Ahí conviven iconos de tres dueños
       (TPV, mesas, clientes) y cada uno traía el suyo: el chip de mesa a 20px y los botones de al
       lado a 17px. Además el de mesa es de otro set (Material Symbols), con viewBox y grosor
       distintos de Ionicons: con el mismo número se ve MÁS PEQUEÑO, por eso se compensa aquí. Las
       custom properties cruzan el Shadow DOM, así que los módulos del slot heredan este valor. */
    ion-toolbar { --pos-hdr-icon-size: 1.75rem; }
    ion-buttons ion-icon { font-size: var(--pos-hdr-icon-size); }
    .cart-actions-slot { --pos-hdr-icon-size: 1.75rem; }
    .ctx-chips { display:flex; gap:.35rem; flex-wrap:wrap; }
    .ctx-chips .chip { font-size:.8rem; font-weight:700; color:var(--ok-on-accent, #fff); border-radius:var(--ok-radius-pill,999px); padding:.12rem .55rem; background:var(--accent); white-space:nowrap; }
    .ctx-chips .chip.cust { background:var(--ion-color-secondary, #5c7cfa); }
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
    /* sales#25 — el vacío de la REJILLA es una celda del grid, así que sin esto una frase de dos
       líneas se metía en una columna de 9rem y salía en vertical. Ahora ocupa toda la fila: cabe
       tanto «Sin productos.» como el motivo escrito del modo degradado, en los tres viewports. */
    .empty { color:var(--mut); text-align:center; padding:2.5rem 1rem; grid-column:1 / -1; max-width:34rem; margin-inline:auto; line-height:1.45; }
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
    /* Selector de MÉTODO dentro del sheet (tender): botones grandes con icono + nombre, objetivo
       táctil ≥56px. El elegido se marca por borde/acento Y por aria-pressed (no solo color). */
    .pay-methods { display:grid; grid-template-columns:repeat(2,1fr); gap:.5rem; margin:.1rem 0 .55rem; }
    .pm-btn { display:flex; align-items:center; justify-content:center; gap:.5rem; min-height:56px;
      border-radius:12px; border:1px solid var(--ion-border-color); background:var(--tile);
      color:var(--tx); font-weight:700; font-size:.95rem; cursor:pointer; }
    .pm-btn ion-icon { font-size:1.3rem; }
    .pm-btn[aria-pressed=true] { border-color:var(--accent); color:var(--accent);
      box-shadow:var(--ok-ring-accent, inset 0 0 0 1px var(--accent)); }
    .pm-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    /* Logo de marca (Bizum): es un wordmark ANCHO, no un glifo cuadrado como los Ionicons, así que
       se acota a la altura del icono y se deja crecer a lo ancho sin romper el botón. */
    .pay-methods .brand { display:inline-flex; align-items:center; height:1.15rem; }
    .pay-methods .brand svg { height:100%; width:auto; max-width:4.5rem; display:block; }
    /* Tarjeta: nada que teclear — el importe exacto y la pista del datáfono. */
    .pay-hint { margin:.1rem 0 .4rem; color:var(--mut); font-size:.9rem; }
    /* El cambio es lo que el cajero busca con el ojo al devolver. */
    .amt.big-change .v { font-size:1.6rem; font-weight:800; color:var(--accent); }

    /* ── sales#159 · pago mixto (ADR-0386) ────────────────────────────────────────────────── */
    /* EL RESTANTE. Vive en la cabecera del sheet, fuera del scroll, y es el segundo número más
       grande de la pantalla: en un reparto es el que se mira en cada pata. Se tiñe de acento
       mientras queda algo y de éxito en cuanto está cubierto — el color contesta antes que el texto. */
    .pay-remaining { display:flex; justify-content:space-between; align-items:baseline; gap:.75rem;
      margin:-.6rem 0 .9rem; padding:.5rem .7rem; border-radius:.7rem;
      border:1px solid var(--ion-border-color); background:var(--tile); color:var(--mut);
      font-size:.9rem; font-weight:600; }
    .pay-remaining .v { font-size:1.35rem; font-weight:800; color:var(--accent); }
    .pay-remaining[data-covered] { border-color:var(--ion-color-success,#2dd36f);
      background:color-mix(in srgb,var(--ion-color-success,#2dd36f) 10%,transparent); }
    .pay-remaining[data-covered] .v { color:var(--ion-color-success,#2dd36f); }
    /* Las patas ya tomadas. Fila alta (objetivo táctil ≥48px) con el importe a la derecha, donde
       el ojo compara una columna de números. */
    .tender-list { list-style:none; margin:0 0 .2rem; padding:0; display:flex; flex-direction:column; gap:.35rem; }
    .tender-row { display:flex; align-items:stretch; gap:.35rem; }
    .tender-edit { flex:1; display:flex; align-items:center; gap:.5rem; min-height:48px;
      padding:.4rem .65rem; border-radius:10px; border:1px solid var(--ion-border-color);
      background:var(--tile); color:var(--tx); font:inherit; text-align:left; cursor:pointer; }
    .tender-edit ion-icon { font-size:1.2rem; flex:none; color:var(--mut); }
    .tender-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tender-amount { font-weight:800; white-space:nowrap; }
    .tender-change { font-size:.78rem; color:var(--mut); white-space:nowrap; }
    .tender-remove { flex:none; width:48px; min-height:48px; display:flex; align-items:center;
      justify-content:center; border-radius:10px; border:1px solid var(--ion-border-color);
      background:var(--tile); color:var(--mut); cursor:pointer; }
    .tender-remove ion-icon { font-size:1.2rem; }
    /* sales#162 — TENDER POR LÍNEA: un renglón por línea de servicio, con el hueco del slot debajo.
       El importe cubierto se tacha: es la señal de un vistazo de que esa línea ya no se cobra. */
    .tl-list { list-style:none; margin:0 0 .2rem; padding:0; display:flex; flex-direction:column; gap:.45rem; }
    .tender-line { border:1px solid var(--ion-color-step-200,#e2e0dc); border-radius:.6rem; padding:.5rem .6rem; }
    .tl-h { display:flex; align-items:baseline; justify-content:space-between; gap:.5rem; }
    .tl-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tl-amount { font-weight:800; white-space:nowrap; }
    .tl-amount[data-covered] { text-decoration:line-through; color:var(--mut); }
    .tl-slot { margin-top:.45rem; }
    .tl-slot:empty { display:none; }
    .tl-note { margin-top:.35rem; font-size:.8rem; color:var(--mut); }
    /* Entrar a repartir es SECUNDARIO (la mayoría de los cobros son de un solo medio); tomar la
       pata, en cambio, es lo que se pulsa una vez por medio, así que lleva el acento. */
    .pay-split-btn, .pay-add { display:flex; align-items:center; justify-content:center; gap:.45rem;
      width:100%; min-height:52px; border-radius:12px; font:inherit; font-weight:700; cursor:pointer; }
    .pay-split-btn { border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); }
    .pay-add { border:1px solid var(--accent); background:color-mix(in srgb,var(--accent) 14%,transparent); color:var(--accent); }
    .pay-split-btn ion-icon, .pay-add ion-icon { font-size:1.25rem; }
    /* EL MOTIVO por el que no se puede cobrar, en palabras y en la pantalla — nunca en un title. */
    .pay-block-reason { margin:0 0 .45rem; padding:.5rem .65rem; border-radius:.6rem;
      border:1px solid var(--ion-color-warning,#e8a33d);
      background:color-mix(in srgb,var(--ion-color-warning,#e8a33d) 12%,transparent);
      color:var(--tx); font-size:.9rem; }
    /* Un cobro bloqueado se ve apagado, pero SIGUE recibiendo el toque (aria-disabled, no disabled). */
    ion-button.charge[aria-disabled='true'] { opacity:.75; }
    .print-row { --background:transparent; --padding-start:0; --inner-padding-end:0; margin:.5rem 0 .2rem; }
    .pay-err { color:var(--ion-color-danger,#d9480f); margin:.4rem 0 0; }
    /* hub#297 — la captura de NIF+domicilio por encima del techo de la simplificada. Va ARRIBA del
       todo en el sheet porque es lo primero que hay que resolver, y cambia de ámbar a neutro en
       cuanto está completa: el color deja de pedir algo cuando ya no hay nada que pedir. */
    .limit-capture { display:flex; flex-direction:column; gap:.35rem; margin:0 0 .8rem;
      padding:.7rem .75rem; border-radius:.7rem;
      border:1px solid var(--ion-color-warning,#e8a33d); background:color-mix(in srgb,var(--ion-color-warning,#e8a33d) 12%,transparent); }
    .limit-capture[data-done] { border-color:var(--ion-color-success,#2dd36f);
      background:color-mix(in srgb,var(--ion-color-success,#2dd36f) 10%,transparent); }
    .limit-head { display:flex; gap:.55rem; align-items:flex-start; margin-bottom:.25rem; }
    .limit-head ion-icon { font-size:1.35rem; flex:0 0 auto; margin-top:.1rem; }
    .limit-head strong { display:block; font-size:.98rem; }
    .limit-head p { margin:.15rem 0 0; font-size:.86rem; color:var(--mut); }
    .limit-capture ion-input { --background:var(--ion-background-color,#fff); --padding-start:.6rem;
      --padding-end:.6rem; border-radius:.5rem; }
    .err { color:var(--ion-color-danger,#d9480f); }
    .pay-actions { display:flex; gap:.5rem; }
    .pay-actions .charge { flex:1; }
    .pay-actions .charge-print { flex:none; width:64px; }
    .foot-actions { display:flex; gap:.5rem; }
    .foot-actions .ticket-discount { flex:none; width:56px; }
    .ticket-discount-row { display:flex; justify-content:space-between; font-size:.9rem; color:var(--ion-color-warning-shade, #b7791f); margin:.1rem 0; }
    .discount-mode { margin:0 0 .4rem; max-width:12rem; }
    .discount-foot { display:flex; gap:.5rem; align-items:center; }
    .discount-foot .charge { flex:1; }
    .line-discount-badge { vertical-align:middle; }
    .foot-actions .prebill { flex:none; width:56px; }
    .foot-actions .charge { flex:1; }

    /* desplegable tickets aparcados */
    .pdrop-back { position:absolute; inset:0; z-index:40; }
    .pdrop { position:absolute; top:2.9rem; right:.5rem; z-index:41; width:min(20rem,90%); background:var(--tile);
      border:1px solid var(--ion-border-color); border-radius:var(--ok-radius,12px); box-shadow:var(--ok-shadow-pop, 0 12px 32px rgba(0,0,0,.5)); padding:.5rem; max-height:60%; overflow:auto; }
    .pdrop .hint { color:var(--mut); font-size:.82rem; margin:.3rem .2rem .5rem; }
    .pdrop .hint.hint--center { text-align:center; }
    .pdrop .hint strong { color:var(--tx); }
    .pitem { display:flex; justify-content:space-between; align-items:center; gap:.3rem; border:1px solid var(--ion-border-color); border-radius:var(--ok-radius-sm,10px); padding:.2rem .3rem .2rem .6rem; margin-bottom:.35rem; }
    /* La FILA entera recupera: botón de verdad (accesible), sin pintas de botón. */
    .prow { flex:1; display:flex; flex-direction:column; align-items:flex-start; gap:.1rem;
      background:none; border:none; padding:.3rem 0; text-align:left; cursor:pointer; color:var(--tx); }
    .pn { font-weight:700; font-size:.9rem; }
    .pm { color:var(--mut); font-size:.78rem; }
    .pdel { margin:0; }

    .lqty { color:var(--mut); font-weight:700; }
    /* Secciones POR DATO: PENDIENTE DE ENVIAR arriba (borde de acento — donde trabaja el
       camarero) y ENVIADO debajo. El detalle por comanda es del chip+modal de kitchen, que se
       monta en .sec-slot de la cabecera de ENVIADO. */
    .secs { padding:.4rem .5rem .8rem; display:flex; flex-direction:column; gap:.6rem; }
    .sec { border:1px solid var(--ion-border-color); border-radius:var(--ok-radius,12px); overflow:hidden; }
    .sec.sec-pending { border-color:var(--accent); }
    .sec-h { display:flex; align-items:center; gap:.4rem; padding:.5rem .7rem;
      font-weight:700; font-size:.82rem; text-transform:uppercase; letter-spacing:.04em;
      background:var(--tile); }
    .sec-h .ccount { color:var(--mut); }
    .sec-h .sec-slot { margin-left:auto; display:inline-flex; align-items:center;
      text-transform:none; letter-spacing:0; }

    /* Diálogos nativos (top layer): aparcar-con-nombre y carrito sucio. En móvil/tablet toman
       ASPECTO de sheet (suben desde abajo, asa, esquinas solo arriba — pregunta de Ioan
       2026-07-19): mismo <dialog> nativo, que ion-action-sheet no aloja contenido rico y los
       overlays de Ionic en shadow Lit se re-parentan al body (ADR-0028). */
    dialog.park-dialog, dialog.dirty-dialog, dialog.staff-dialog { border:1px solid var(--ion-border-color); border-radius:var(--ok-radius,14px);
      background:var(--panel); color:var(--tx); padding:1rem 1.1rem; width:min(94vw,24rem);
      box-shadow:var(--ok-shadow-modal, 0 18px 50px rgba(0,0,0,.35)); }
    dialog.park-dialog::backdrop, dialog.dirty-dialog::backdrop, dialog.staff-dialog::backdrop { background:var(--ok-scrim, rgba(0,0,0,.45)); }
    @media (max-width: 820px) {
      dialog.park-dialog, dialog.dirty-dialog, dialog.staff-dialog { width:100vw; max-width:100vw; margin:auto 0 0;
        border-radius:var(--ok-radius-sheet-top, 18px 18px 0 0); border-bottom:none; padding-bottom:max(1rem, env(safe-area-inset-bottom)); }
      dialog.park-dialog::before, dialog.dirty-dialog::before, dialog.staff-dialog::before { content:''; display:block;
        width:2.4rem; height:.3rem; border-radius:var(--ok-radius-pill,999px); background:var(--ion-border-color);
        margin:0 auto .7rem; }
      .dlg-actions ion-button { flex:1; }
    }
    dialog h3 { margin:0 0 .5rem; font-size:1.05rem; }
    dialog p { margin:0 0 .8rem; color:var(--mut); }
    dialog.park-dialog input { width:100%; box-sizing:border-box; font-size:1rem; padding:.6rem .7rem;
      border-radius:var(--ok-radius-sm,10px); border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); }
    /* The list of people: rows tall enough for a thumb, and the current one marked — with a BORDER
       as well as colour, so it is distinguishable without relying on seeing the hue. */
    .staff-list { display:flex; flex-direction:column; gap:.35rem; max-height:min(50vh,18rem); overflow-y:auto; }
    .staff-opt { display:block; width:100%; text-align:left; padding:.7rem .8rem; font:inherit;
      border:1px solid var(--ion-border-color); border-radius:var(--ok-radius-sm,10px);
      background:var(--tile); color:var(--tx); cursor:pointer; }
    .staff-opt:hover { border-color:var(--accent); }
    .staff-opt:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
    .staff-opt[data-current] { border-color:var(--accent); color:var(--accent); font-weight:700; }
    .staff-note { margin:.2rem 0 0; color:var(--mut); font-size:.82rem; }
    .dlg-actions { display:flex; justify-content:flex-end; gap:.4rem; margin-top:.9rem; flex-wrap:wrap; }
    .badge-num { font-size:.62rem; min-width:1rem; height:1rem; padding:0 .2rem; border-radius:var(--ok-radius-pill,999px); background:var(--accent); color:var(--ok-on-accent,#fff); display:inline-flex; align-items:center; justify-content:center; position:absolute; top:.2rem; right:.2rem; }

    /* botón flotante de carrito (solo móvil) */
    .fab { display:none; position:absolute; right:1rem; bottom:1rem; z-index:50; width:3.6rem; height:3.6rem; border-radius:50%;
      border:none; background:var(--accent); color:var(--ok-on-accent,#fff); cursor:pointer; box-shadow:var(--ok-shadow-modal, 0 10px 26px rgba(0,0,0,.45)); align-items:center; justify-content:center; }
    .fab ion-icon { font-size:1.6rem; }
    .fab .badge { position:absolute; top:-.2rem; right:-.2rem; min-width:1.3rem; height:1.3rem; padding:0 .25rem; border-radius:var(--ok-radius-pill,999px);
      background:var(--ok-on-accent,#fff); color:var(--accent); font-size:.72rem; font-weight:800; display:inline-flex; align-items:center; justify-content:center; }
    .cart-close { display:none; }

    /* cobro / numpad (sheet oscuro) */
    .pay { display:flex; flex-direction:column; gap:.8rem; }
    .methods { display:flex; gap:.4rem; flex-wrap:wrap; }
    .chip { padding:.5rem .9rem; border-radius:var(--ok-radius-pill,999px); border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); cursor:pointer; }
    .chip[aria-pressed=true] { background:var(--accent); color:var(--ok-on-accent,#fff); border-color:transparent; }
    .amt { display:flex; justify-content:space-between; font-size:1.1rem; }
    .amt .v { font-weight:700; }
    .change { color:var(--ion-color-success, #2f9e44); }
    .numpad { display:grid; grid-template-columns: repeat(3, 1fr); gap:.35rem; margin-bottom:.2rem; }
    .numpad button { font-size:1.15rem; padding:.6rem; border-radius:var(--ok-radius-sm,10px); border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); cursor:pointer; }
    /* Precio libre: el tile fijo del catálogo + los botones de DEPARTAMENTO dentro del sheet. */
    .tile.open-price .op-thumb { display:flex; align-items:center; justify-content:center; font-size:2rem; color:var(--ion-color-primary,#3880ff); background:var(--ion-color-primary-tint,rgba(56,128,255,.14)); }
    .dept-label { margin:.5rem 0 .3rem; font-size:.8rem; opacity:.7; }
    .dept-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:.4rem; }
    /* ── sales#153 · el picker del menú ──────────────────────────────────────────────────── */
    ion-card.tile.combo { border-color:var(--accent); }
    .tile.combo .combo-badge { position:absolute; top:.3rem; left:.3rem; width:1.5rem; height:1.5rem;
      border-radius:999px; display:flex; align-items:center; justify-content:center;
      background:var(--ion-color-primary,#3880ff); color:#fff; font-size:.85rem; }
    .combo-group { margin-bottom:.35rem; }
    /* El contador lleva glifo ADEMÁS de color: el color solo no pasa contraste, y en un TPV la
       pantalla puede ser mala. */
    .combo-counter { display:inline-flex; align-items:center; gap:.25rem; font-weight:600; }
    .combo-group[data-needs='true'] .combo-counter { color:var(--ion-color-danger,#c5000f); }
    .combo-group[data-needs='false'] .combo-counter { color:var(--ion-color-success,#2dd36f); }
    /* El toque en un botón bloqueado CONTESTA: el grupo que falta se señala. */
    .combo-group[data-flagged='true'] { outline:2px solid var(--ion-color-danger,#c5000f);
      outline-offset:2px; border-radius:var(--ok-radius-sm,10px); }
    /* En el techo, lo no elegido se marca pero sigue LEGIBLE (Square no esconde lo no
       seleccionable). Nada de pointer-events:none — el toque tiene que llegar. */
    .combo-opt[data-barred='true'] { opacity:.6; border-style:dashed; }
    .combo-opt[aria-pressed='true'] { border-color:var(--accent);
      background:color-mix(in srgb,var(--accent) 12%,var(--tile)); }
    .combo-less { min-width:2.1rem; border-radius:var(--ok-radius-sm,10px);
      border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx);
      font-size:1.1rem; cursor:pointer; }
    .combo-total { display:flex; justify-content:space-between; align-items:baseline;
      padding:.35rem .1rem .5rem; color:var(--tx); font-size:1rem; }
    .combo-total strong { font-size:1.15rem; font-weight:800; }
    .combo-confirm { width:100%; min-height:2.9rem; padding:.6rem 1rem; font:inherit;
      font-weight:700; border-radius:var(--ok-radius-sm,10px); border:1px solid transparent;
      background:var(--ion-color-primary,#3880ff); color:#fff; cursor:pointer; }
    /* Bloqueado: se VE que no procede y el motivo va escrito DENTRO del boton -- nunca en title,
       que en tactil no existe. Y sin pointer-events:none, para que el toque conteste. */
    .combo-confirm[data-blocked='true'] { background:var(--tile-hi); color:var(--mut);
      border-color:var(--ion-border-color); cursor:not-allowed; }
    .dept-btn { display:flex; flex-direction:column; align-items:flex-start; gap:.1rem; padding:.55rem .7rem; border-radius:var(--ok-radius-sm,10px); border:1px solid var(--ion-border-color); background:var(--tile); color:var(--tx); cursor:pointer; text-align:left; }
    .dept-btn[aria-pressed='true'] { border-color:var(--ion-color-primary,#3880ff); background:var(--ion-color-primary-tint,rgba(56,128,255,.16)); }
    .dept-btn .dn { font-size:1rem; }
    .dept-btn .dr { font-size:.8rem; opacity:.7; }
    .dept-empty { grid-column:1/-1; opacity:.6; font-size:.85rem; padding:.5rem; }
    .scrim { position:fixed; inset:0; background:var(--ok-scrim, rgba(0,0,0,.6)); display:flex; align-items:center; justify-content:center; z-index:70; }
    /* Columna flex: el importe y el botón de cobrar NO se mueven; solo scrollea el centro. Antes
       el sheet entero scrolleaba y el botón principal quedaba fuera de pantalla — la acción más
       importante del TPV no puede exigir scroll. */
    .sheet { background:var(--panel); color:var(--tx); border:1px solid var(--ion-border-color);
      border-radius:var(--ok-radius-lg,16px); width:min(92vw,24rem); max-height:88vh; display:flex; flex-direction:column;
      overflow:hidden; box-shadow:var(--ok-shadow-modal, 0 12px 48px rgba(0,0,0,.6)); }
    .sheet-h, .sheet-top, .sheet-foot { flex:none; padding:0 1rem; }
    .sheet-h { padding-top:1rem; }
    .sheet-foot { padding:.75rem 1rem 1rem; border-top:1px solid var(--ion-border-color); }
    .pay { flex:1; min-height:0; overflow:auto; padding:0 1rem; }
    .sheet-h { display:flex; justify-content:space-between; align-items:center; margin-bottom:.8rem; }
    .sheet-h .t { font-size:1.2rem; font-weight:700; }
    .x { background:none; border:none; font-size:1.3rem; cursor:pointer; color:var(--mut); }

    @media (max-width: 820px) {
      .body { grid-template-columns: 1fr; }
      /* Sin sombra: aun cerrado (translateX(100%)) su box-shadow se derramaba ~30px hacia dentro
         por el borde derecho de la tarjeta; la separación al abrir la dan el backdrop y el borde. */
      /* Cerrado = INEXISTENTE, no solo «fuera de pantalla» (sales#58). Con únicamente el transform,
         sus botones —asignar mesa, asignar cliente, cobrar, cuentas abiertas— seguían anunciados en
         el árbol accesible y aceptaban clicks sin que ocurriera nada visible: controles fantasma,
         para un lector de pantalla igual que para Playwright. La propiedad visibility se hereda a
         todo el subárbol, así que este único punto cubre TODOS los controles de la cuenta, incluidos
         los que montan otros módulos en el slot. La transición retrasa el ocultado hasta que termina
         el deslizamiento; al abrir es inmediata. */
      .cart { position:absolute; top:0; right:0; bottom:0; width:min(92%,26rem); z-index:60;
        transform:translateX(100%); visibility:hidden;
        transition:transform .25s ease, visibility 0s linear .25s; }
      .cart[data-open] { transform:translateX(0); visibility:visible;
        transition:transform .25s ease, visibility 0s; }
      .cart-close { display:inline-flex; }
      .cart-backdrop[data-open] { display:block; position:absolute; inset:0; background:var(--ok-scrim, rgba(0,0,0,.5)); z-index:55; }
      .fab { display:inline-flex; }
    }
    .cart-backdrop { display:none; }

    /* ── Pulido visual 2026-07: conserva la estructura modular y acerca el POS al prototipo. ── */
    .card { border-radius:var(--ok-radius-lg,16px); box-shadow:var(--ok-shadow-card,none); }
    .body { grid-template-columns:minmax(0,1fr) minmax(23rem,24.5rem); }
    .catalog { padding:.72rem; }
    .catbar { gap:.5rem; margin-bottom:.68rem; }
    ion-segment.category-segment { padding:.05rem; }
    ion-segment-button.cat-segment-button { flex-basis:8.7rem; min-width:8.7rem; min-height:3.65rem;
      margin:0 .24rem; border-color:var(--line); --background:var(--tile);
      --background-checked:color-mix(in srgb,var(--accent) 10%,var(--tile)); }
    ion-segment-button.cat-segment-button:hover { --background:var(--tile-hi); }
    ion-segment-button.cat-segment-button.segment-button-checked { border-color:var(--accent);
      box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 45%,transparent); }
    .cat-segment-label .cc-n { font-size:.88rem; }
    .cat-segment-label .cc-c { font-size:.7rem; }
    .arrow.search-trigger { width:3rem; height:3.65rem; border-radius:var(--ok-radius,12px); color:var(--accent); }
    /* El ⋮ crece con su vecina: quedaba en 34px al lado de una lupa de 48×58 —se leía como un
       botón de segunda— y por debajo del área táctil que pide un dedo en el mostrador. Alto igual,
       ancho algo menor porque el icono es estrecho y no debe robarle sitio a las categorías. */
    .arrow.more-trigger { width:2.6rem; height:3.65rem; border-radius:var(--ok-radius,12px); }

    .grid { grid-template-columns:repeat(auto-fill,minmax(9.5rem,1fr)); gap:.62rem; }
    ion-card.tile { min-height:8.4rem; border-radius:var(--ok-radius,14px); cursor:pointer; }
    .thumb { height:4.85rem; flex:none; }
    .tinfo { flex:1; display:grid; grid-template-columns:minmax(0,1fr) auto; grid-template-rows:auto auto;
      gap:.15rem .5rem; align-content:center; padding:.52rem .62rem .58rem; }
    .tile .n { grid-column:1 / -1; font-size:.86rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .tile .sku { color:var(--mut); font-size:.66rem; align-self:end; }
    /* #277 — el precio («1,50 €») con white-space:nowrap desbordaba la celda auto del grid y la
       tarjeta overflow:hidden recortaba el «€». Se asegura espacio a la derecha del precio. */
    .tile .p { margin:0; padding-right:.15rem; color:var(--tx); font-size:.9rem; align-self:end; white-space:nowrap; }

    .cart { border-left:1px solid var(--line); }
    .cart ion-header { flex:none; border-bottom:1px solid var(--line); }
    .cart ion-toolbar { --min-height:3.6rem; }
    .order-toolbar { min-height:3.6rem; display:flex; align-items:stretch; gap:.12rem; padding:.24rem .35rem; }
    ion-button.header-action { width:3.25rem; height:3.05rem; margin:0; font-size:1.05rem;
      --padding-start:.2rem; --padding-end:.2rem; --border-radius:var(--ok-radius-sm,10px); --color:var(--mut); }
    ion-button.header-action::part(native) { display:flex; flex-direction:column; gap:.08rem; }
    ion-button.header-action ion-icon { font-size:1.2rem; }
    ion-button.header-action small { display:block; max-width:3rem; font-size:.56rem; line-height:1;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    /* Aparcar y Cuentas abiertas comparten fila con selectores icon-only aportados por otros
       módulos. Sus etiquetas viven en title/aria-label: pintarlas dentro de 52 px producía textos
       truncados y hacía que pareciesen acciones de otro nivel. */
    ion-button.header-action.icon-action { width:2.4rem; height:2.4rem; margin:auto 0;
      --padding-start:0; --padding-end:0; }
    ion-button.header-action.icon-action::part(native) { flex-direction:row; gap:0; }
    ion-button.header-action.icon-action ion-icon { font-size:var(--pos-hdr-icon-size,1.75rem); }
    /* El badge .badge-num (absoluto) se ancla a este botón: necesita un contexto de posicionamiento. */
    .open-checks-action { position:relative; }
    ion-button.header-action.assigned { --color:var(--accent); --background:color-mix(in srgb,var(--accent) 12%,transparent); }
    .cart-actions-slot { display:flex; align-items:center; min-width:0; }
    .actions-spacer { flex:1; min-width:.2rem; }
    .order-heading { padding:.62rem .8rem .58rem; border-bottom:1px solid var(--line); }
    .order-title-row { display:flex; align-items:center; gap:.35rem; }
    .order-title { flex:1; min-width:0; border:0; outline:0; padding:.08rem 0; background:transparent;
      color:var(--tx); font:inherit; font-size:1rem; font-weight:750; }
    .order-title::placeholder { color:var(--mut); }
    .title-edit { flex:none; width:2rem; height:2rem; display:inline-grid; place-items:center; padding:0;
      border:0; border-radius:var(--ok-radius-sm,8px); background:transparent; color:var(--mut); cursor:pointer; }
    .title-edit:hover, .title-edit:focus-visible { color:var(--accent); background:var(--tile-hi); outline:none; }
    .title-edit ion-icon { font-size:1rem; }
    .order-context { display:flex; gap:.3rem; flex-wrap:wrap; min-height:1.55rem; margin-top:.32rem; }
    .order-context ion-chip { height:1.55rem; margin:0; font-size:.68rem; --background:var(--tile); color:var(--mut); }
    .context-empty { color:var(--mut); font-size:.72rem; align-self:center; }
    /* sales#179 — who is serving. It is a BUTTON (tapped to transfer), but it reads like the other
       contexts of the check: same height and same visual weight as the ion-chips next to it, with
       the touch target a finger needs. */
    .ctx-chip { display:inline-flex; align-items:center; gap:.25rem; height:1.55rem; padding:0 .55rem;
      border:1px solid var(--ion-border-color); border-radius:var(--ok-radius-pill,999px);
      background:var(--tile); color:var(--mut); font:inherit; font-size:.68rem; cursor:pointer; }
    .ctx-chip:hover { color:var(--tx); }
    .ctx-chip:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
    .ctx-chip ion-icon { font-size:.95rem; }
    /* sales#222 — the customer this sale still owes. Warning, not danger: nothing has failed,
       something is missing, and it is one tap away. */
    .ctx-chip.needs-customer { border-color:var(--ion-color-warning, #ffc409); font-weight:700;
      color:var(--ion-color-warning-shade, #e0ac08); background:var(--tile); }
    .ctx-chip.needs-customer:hover { color:var(--ion-color-warning-shade, #e0ac08); }

    ion-segment.view-tabs { margin:.62rem .72rem .28rem; width:auto; border:1px solid var(--line);
      border-radius:var(--ok-radius-sm,11px); background:var(--tile); }
    ion-segment.view-tabs ion-segment-button { min-height:2.85rem; --indicator-color:var(--tile-hi);
      --color:var(--mut); --color-checked:var(--tx); font-weight:700; text-transform:none; }
    .view-tab-label { display:inline-flex; align-items:center; justify-content:center; gap:.38rem; }
    .pending-dot { display:inline-grid; place-items:center; min-width:1.18rem; height:1.18rem; padding:0 .25rem;
      border-radius:var(--ok-radius-pill,999px); background:var(--ion-color-warning,#f5a623); color:var(--ion-color-warning-contrast,#241700); font-size:.65rem; font-weight:850; }

    .cart ion-content.cart-body { --padding-top:.15rem; }
    ion-list.lines { padding:.28rem .48rem .45rem; }
    ion-list.lines ion-item { margin:.35rem 0; --background:var(--tile); --border-color:transparent;
      --border-radius:var(--ok-radius,12px); border:1px solid var(--line); border-radius:var(--ok-radius,12px); overflow:hidden; }
    ion-list.lines ion-item.sel { border-color:var(--accent); background:color-mix(in srgb,var(--accent) 7%,var(--tile)); }
    ion-list.lines ion-item h3 { display:flex; align-items:center; gap:.35rem; margin-bottom:.12rem; font-size:.85rem; }
    ion-list.lines ion-item p { font-size:.7rem; }
    ok-status-pill { vertical-align:middle; }
    .lineend .lt { font-size:.84rem; }
    .lineend .lt.is-gift { text-decoration:line-through; opacity:.55; }
    /* sales#156 — the note under its item, with the same visual weight as a sub-line on paper: it
       reads, but it does not compete with the product name or the amount. It wraps anywhere because
       "shellfish and nut allergy" does not fit on one line at 390 px. */
    .line-note-text { display:flex; align-items:flex-start; gap:.3rem; margin:.15rem 0 0;
      font-size:.8rem; color:var(--ion-color-medium); overflow-wrap:anywhere; }
    .line-note-text ion-icon { flex:none; font-size:.9rem; margin-top:.1rem; }
    /* The note sheet: the textarea takes the full width and is tall enough to read what was
       written without scrolling inside a field, which on touch is where text gets lost. */
    .note-sheet .note-input { width:100%; box-sizing:border-box; resize:none; font:inherit;
      padding:.6rem .7rem; border-radius:10px; border:1px solid var(--ion-border-color);
      background:var(--ion-item-background, var(--panel)); color:var(--tx); }
    .note-sheet .note-input:focus-visible { outline:2px solid var(--ion-color-primary); outline-offset:1px; }
    .note-sheet .note-hint { margin:.5rem 0 0; font-size:.78rem; color:var(--ion-color-medium); }
    /* sales#206 — the chips the business preconfigured, ABOVE the keyboard: on a phone the
       keyboard eats the bottom half of the screen, so anything under the textarea would be the
       first thing to disappear. They wrap because a business with eight notes has eight. */
    .note-sheet .note-chips { display:flex; flex-wrap:wrap; gap:.4rem; margin:0 0 .6rem; }
    .note-sheet .note-chip { font:inherit; font-size:.85rem; line-height:1.2; cursor:pointer;
      min-height:2.25rem; padding:.45rem .75rem; border-radius:999px;
      border:1px solid var(--ion-border-color, var(--line)); color:var(--tx);
      background:var(--ion-item-background, var(--panel)); }
    /* Applied = filled, not merely outlined: at arm's length on a busy pass a thicker border is
       not a state anybody reads. */
    .note-sheet .note-chip[aria-pressed='true'] { border-color:var(--ion-color-primary);
      background:var(--ion-color-primary); color:var(--ion-color-primary-contrast, #fff); }
    .note-sheet .note-chip:focus-visible { outline:2px solid var(--ion-color-primary); outline-offset:2px; }
    .note-sheet .note-chips-state { margin:0 0 .6rem; font-size:.78rem; color:var(--ion-color-medium); }
    .secs { padding:.32rem .48rem .65rem; gap:.52rem; }
    .sec { border-radius:var(--ok-radius,12px); }
    .sec-h { padding:.48rem .58rem; font-size:.7rem; background:transparent; border-bottom:1px solid var(--line); }
    .sec.sec-pending { border-color:color-mix(in srgb,var(--accent) 55%,var(--line)); }
    .sec-slot { min-width:0; }
    .draft-pane { padding:.28rem .48rem .7rem; }
    .draft-hint { margin:.2rem .18rem .52rem; color:var(--mut); font-size:.76rem; line-height:1.35; }
    .draft-actions-slot { display:flex; margin:.65rem 0 0; }
    .draft-actions-slot:empty { display:none; }
    .draft-empty { min-height:10rem; display:grid; place-items:center; }

    .cart-foot { padding:.62rem .72rem .7rem; }
    .total { margin:0 0 .5rem; font-size:.78rem; }
    .total b { font-size:1.55rem; }
    .foot-actions .prebill { width:3.25rem; }
    .foot-actions .charge { min-height:3rem; font-size:.98rem; }
    .pdrop { top:3.5rem; right:.45rem; width:min(22rem,calc(100% - .9rem)); max-height:72%; }
    .pitem { padding:.35rem .35rem .35rem .65rem; }

    @media (min-width:821px) and (max-width:1100px) {
      .body { grid-template-columns:minmax(0,1fr) 22rem; }
      .grid { grid-template-columns:repeat(auto-fill,minmax(8.8rem,1fr)); }
      ion-segment-button.cat-segment-button { flex-basis:8rem; min-width:8rem; }
    }
    @media (max-width:820px) {
      .body { grid-template-columns:1fr; }
      .catalog { padding:.58rem; }
      /* The cart FAB floats over the grid (position:absolute, 3.6rem wide, 1rem off the edge), so
         at 390px it sat on top of the last tile's PRICE. Square and Toast reserve that room at the
         end of the list instead of letting the button cover content: the grid keeps its own scroll
         and simply ends above the FAB. Desktop has no FAB, so this belongs in the mobile block. */
      .grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:.5rem; padding-bottom:5.2rem; }
      ion-card.tile { min-height:8rem; }
      ion-segment-button.cat-segment-button { flex-basis:7.8rem; min-width:7.8rem; }
      .cart { width:min(100%,27rem); }
      .order-toolbar { padding-left:.2rem; padding-right:.2rem; }
      .memory-only { display:none; }
      /* #277 — en tiles de 2 columnas el precio «1,50 €» se recortaba por la derecha (overflow:hidden
         de la tarjeta + white-space:nowrap). Un font-size algo menor lo hace caber sin recortar el «€». */
      .tile .p { font-size:.82rem; }
    }
    @media (max-width:340px) {
      .catalog { padding:.45rem; }
      .grid { gap:.42rem; }
      ion-segment-button.cat-segment-button { flex-basis:7rem; min-width:7rem; }
      ion-card.tile { min-height:7.7rem; }
      .thumb { height:4.5rem; }
    }
  `;
  }
  /**
   * Turns a measured weight into the quantity of the line it belongs to.
   *
   * 🔴 It goes through `setQtyAbs`, the very door the stepper uses — so `toMicro` and `onGrid`
   * judge a weighed 0,5 exactly as they judge a typed one, and an off-grid weight is refused with
   * `ui.qtyOffGrid` without altering the check. Opening a second path into the cart is the whole
   * mistake this contract exists to avoid.
   *
   * Most refusals are SILENT on purpose: a scale streams while a hand is still on the platter and
   * while nothing is selected, so turning that into a banner would train the cashier to ignore the
   * banner. The one that is said out loud is the unit mismatch — that is a misconfigured shop, and
   * it is the refusal standing between «532 g» and a kilo and a half on a fiscal document.
   */
  async applyScaleWeight(detail) {
    const reading = parseScaleReading(detail);
    if (!reading) return;
    const target = scaleTargetLine(this.cart, (code) => !!code && this.units.get(code)?.category === "mass");
    const verdict = scaleVerdict(target, reading);
    if (!verdict.ok) {
      if (verdict.reason === "unit_mismatch") {
        this.error = t5("ui.scaleUnitMismatch", { scale: verdict.got, line: verdict.expected });
      }
      return;
    }
    await this.queue(() => this.setQtyAbs(target.id, verdict.qty));
  }
  async connectedCallback() {
    const connectionEpoch = ++this.connectionEpoch;
    super.connectedCallback();
    window.addEventListener("erplora:locale-changed", this.onLocaleChange);
    window.addEventListener(SCALE_WEIGHT_EVENT, this.onScaleWeight);
    const brokenApps = /* @__PURE__ */ new Set();
    const absentApps = /* @__PURE__ */ new Set();
    const hardRead = async (app, read) => {
      const out = await dependencyRead(read);
      if (out.broken) brokenApps.add(app);
      return out.rows;
    };
    const capabilityCatalogRead = async (app, whole, page) => {
      const out = await optionalCatalogRead(whole, page);
      if (out.broken) brokenApps.add(app);
      if (out.absent) absentApps.add(app);
      return out.rows;
    };
    const policy = this.loadPosSettings();
    const fromSource = async (flag, read) => catalogSourceOn((await policy)[flag]) ? read() : [];
    try {
      const [
        prods,
        methods,
        businessRows,
        savedCart,
        parked,
        cats,
        prodCats,
        taxCatalog,
        unitRows,
        svcRows,
        svcCats,
        taxCats,
        fiscalLimits
      ] = await Promise.all([
        fromSource("sync_products", () => capabilityCatalogRead(
          "inventory",
          (c5) => c5.queryAllOptional("inventory.products.list"),
          (c5) => c5.queryOptional("inventory.products.list", { limit: LEGACY_PAGE_LIMIT })
        )),
        erplora2().query("sales.payment_methods").catch(() => []),
        // sales#180 — the business identity for the BILL's header. Deliberately apart from the
        // settings: it lives in `hub_settings` (single source, ADR-0061), not in this module's
        // table, and it answers on a freshly built hub where nobody has saved the till settings
        // yet — which is exactly where the bill used to come out headed with the generic default.
        erplora2().query("sales.business.get").catch(() => []),
        this.restoreOpenOrder(),
        listOpenChecks(erplora2()),
        fromSource("sync_products", () => capabilityCatalogRead(
          "inventory",
          (c5) => c5.queryAllOptional("inventory.categories.list", { sort: "name", dir: "asc" }),
          (c5) => c5.queryOptional("inventory.categories.list", { sort: "name", dir: "asc", limit: LEGACY_PAGE_LIMIT })
        )),
        fromSource("sync_products", () => capabilityCatalogRead(
          "inventory",
          (c5) => c5.queryAllOptional("inventory.product_categories"),
          (c5) => c5.queryOptional("inventory.product_categories")
        )),
        loadTaxCatalog(erplora2()),
        capabilityCatalogRead(
          "inventory",
          (c5) => c5.queryAllOptional("inventory.units.list"),
          (c5) => c5.queryOptional("inventory.units.list")
        ),
        // sales#89 — el catálogo VENDIBLE de servicios. Lectura OPCIONAL (ADR-0127): `services` NO
        // está en `depends_on` a propósito, porque `depends_on` es un contrato DURO que obligaría a
        // todo restaurante a instalar el módulo y ataría `sales` a su cascada de desactivación. Un
        // hub sin `services` recibe `undefined` y el TPV sigue siendo exactamente el de antes.
        fromSource("sync_services", () => this.loadServices()),
        fromSource("sync_services", () => this.loadServiceCategories()),
        // Departments for the free-price sale (ADR-0085). It never breaks the till: with no
        // departments the sheet says so. But a `taxes` that IS installed and does not answer is an
        // incident, not the absence of departments, and sales#25 makes that difference visible.
        hardRead("taxes", () => erplora2().queryAll("taxes.categories.list")),
        // hub#297 — qué techo pone el régimen fiscal de ESTE hub. Es una query del CORE
        // (`hub.`), no de `verifactu`: así el TPV no gana una dependencia del módulo fiscal y la
        // respuesta no desaparece el día que alguien lo desinstale.
        //
        // Best-effort a propósito. Si no responde (hub anterior a la query, arranque a medias) se
        // vende exactamente como siempre: un TPV no deja de cobrar porque una lectura falle. Lo
        // que NO queda desprotegido es el cable — §15.8 en el validador para el registro igual, y
        // esa es la mitad que impide que el número se gaste en una factura que la AEAT rechaza.
        erplora2().query("hub.fiscal.limits").catch(() => []),
        // sales#153 — los MENÚS que este hub vende. Una sola lectura (`combos.options.all`) da a la
        // vez las baldosas y sus grupos, así que es imposible ofrecer un menú cuyos cursos no se
        // hayan cargado: eso sería justo «ofrecer lo que el servidor va a rechazar».
        this.loadCombos(),
        // sales#111 / hub#960 — THE PREFLIGHT OF THE QUERY THE CHECKOUT PRICES AGAINST.
        //
        // `sales.complete_sale` resolves every catalogue line against `inventory.products.for_sale`
        // (sales#68), a query born in inventory 1.2.20. An older `inventory` answers the grid
        // perfectly and does NOT answer this one, so the till looked healthy and refused every
        // product at payment time. Until sales#25 that was bought at install time by the hard
        // dependency's `min_version` floor; with the dependency gone the till asks the question
        // itself — and gets an answer the floor never could give it, because a catalogue that is
        // present, recent and BROKEN (or denied) lands here too.
        //
        // The rows are thrown away on purpose: what is being read is whether the answer EXISTS.
        // It rides the `sync_products` switch because a till that shows no product grid has no
        // catalogue line to price, so there is nothing to preflight and nothing to warn about.
        fromSource("sync_products", () => capabilityCatalogRead(
          "inventory",
          (c5) => c5.queryAllOptional("inventory.products.for_sale"),
          (c5) => c5.queryOptional("inventory.products.for_sale")
        ))
      ]);
      if (connectionEpoch !== this.connectionEpoch || !this.isConnected) return;
      this.brokenCatalogApps = HARD_DEPENDENCIES.filter((app) => brokenApps.has(app));
      this.catalogAppAbsent = absentApps.has("inventory") && catalogSourceOn((await policy).sync_products);
      this.taxCatalog = taxCatalog;
      this.missingChargeApp = taxCatalog.installed ? "" : "taxes";
      this.simplifiedMaxCents = rows2(fiscalLimits)[0]?.simplified_invoice_max_cents ?? null;
      for (const u5 of unitRows) if (u5.code) this.units.set(u5.code, u5);
      this.products = [...prods.filter((p4) => p4.is_active !== 0), ...svcRows];
      void this.photos.replace(this.products.map((p4) => p4.image));
      for (const s5 of svcRows) {
        if (!s5.category_id) continue;
        if (!this.prodCats.has(s5.id)) this.prodCats.set(s5.id, /* @__PURE__ */ new Set());
        this.prodCats.get(s5.id).add(s5.category_id);
      }
      this.methods = rows2(methods);
      this.settings = await policy;
      this.businessName = rows2(businessRows)[0]?.name || "";
      this.docFormat = this.settings.default_document_format === "invoice" ? "invoice" : "ticket";
      this.payMethod = defaultPayMethod(this.payMethods);
      this.parked = parked;
      this.categories = [...cats.filter((c5) => c5.name), ...svcCats];
      this.taxCategories = taxCats.filter((c5) => c5.key && c5.is_active !== 0);
      for (const pc of prodCats) {
        if (!this.prodCats.has(pc.product_id)) this.prodCats.set(pc.product_id, /* @__PURE__ */ new Set());
        this.prodCats.get(pc.product_id).add(pc.category_id);
      }
      if (savedCart.length) this.cart = savedCart;
      await this.consumeAppointmentDeepLink(svcRows);
      await this.updateComplete;
      this.addEventListener("erp:order-context", this.onOrderContext);
      this.addEventListener("erp:order-merge", this.onOrderMerge);
      this.addEventListener("erp:order-split", this.onOrderSplit);
      this.addEventListener("erp:order-transfer", this.onOrderTransfer);
      this.addEventListener("erp:customer-context", this.onCustomerContext);
      this.addEventListener("erp:order-fire", this.onOrderFire);
      this.addEventListener("erp:voucher-held", this.onLineTenderHeld);
      this.addEventListener("erp:voucher-released", this.onLineTenderReleased);
      await this.resolveSlots();
      this.ensureSlotsMounted();
    } catch (e7) {
      this.error = e7 instanceof Error ? e7.message : t5("ui.errorLoadingPos");
    } finally {
      this.cartRestored = true;
    }
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    ++this.connectionEpoch;
    this.photos.dispose();
    window.removeEventListener("erplora:locale-changed", this.onLocaleChange);
    window.removeEventListener(SCALE_WEIGHT_EVENT, this.onScaleWeight);
    this.removeEventListener("erp:order-context", this.onOrderContext);
    this.removeEventListener("erp:order-merge", this.onOrderMerge);
    this.removeEventListener("erp:order-split", this.onOrderSplit);
    this.removeEventListener("erp:order-transfer", this.onOrderTransfer);
    this.removeEventListener("erp:customer-context", this.onCustomerContext);
    this.removeEventListener("erp:order-fire", this.onOrderFire);
    this.removeEventListener("erp:voucher-held", this.onLineTenderHeld);
    this.removeEventListener("erp:voucher-released", this.onLineTenderReleased);
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = void 0;
    }
    if (this.pendingSwitchAlert) {
      void this.pendingSwitchAlert.dismiss?.();
      this.pendingSwitchAlert.remove();
      this.pendingSwitchAlert = void 0;
    }
    this.categorySegmentCleanup?.();
    this.categorySegmentCleanup = void 0;
    this.categorySegment = void 0;
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
    let acciones = [];
    try {
      acciones = await sdk.loadSlot("sales.pos.actions") ?? [];
    } catch {
      acciones = [];
    }
    this.actionFillers = acciones.map((f3) => ({
      component: f3.component,
      el: document.createElement(f3.component)
    }));
    let info = [];
    try {
      info = await sdk.loadSlot("sales.pos.order_info") ?? [];
    } catch {
      info = [];
    }
    this.infoFillers = info.map((f3) => ({
      component: f3.component,
      el: document.createElement(f3.component)
    }));
    let tender = [];
    try {
      tender = await sdk.loadSlot("sales.pos.tender") ?? [];
    } catch {
      tender = [];
    }
    this.tenderFillers = tender.map((f3) => f3.component);
    this.requestUpdate();
  }
  /** (Re)engancha los botones de los fillers en el header; idempotente, sobrevive a re-renders. */
  ensureSlotsMounted() {
    const host = this.renderRoot.querySelector(".cart-actions-slot");
    if (host) for (const f3 of this.assignFillers) {
      if (f3.el.parentElement === host) continue;
      host.appendChild(f3.el);
      if (this.orderId) {
        f3.el.dispatchEvent(new CustomEvent("erp:order-restored", { detail: { order_id: this.orderId }, bubbles: false }));
      }
    }
    const draftActions = this.renderRoot.querySelector(".draft-actions-slot");
    if (draftActions) for (const f3 of this.actionFillers) {
      if (f3.el.parentElement === draftActions) continue;
      draftActions.appendChild(f3.el);
      this.emitPosState([f3]);
    }
    const infoHost = this.renderRoot.querySelector(".sec-slot");
    if (infoHost) for (const f3 of this.infoFillers) {
      if (f3.el.parentElement === infoHost) continue;
      infoHost.appendChild(f3.el);
      this.emitPosState([f3]);
    }
    this.ensureTenderSlotsMounted();
  }
  /** Tender POR LÍNEA (`sales.pos.tender`, sales#162): una instancia del filler por línea de
   *  servicio del cobro. Idempotente como el resto — el sheet se re-renderiza en cada tecla.
   *
   *  🔴 Las cuatro propiedades se ponen ANTES de insertar el elemento: el filler arranca su lectura
   *  en `connectedCallback`, así que un insert primero lo haría preguntar por un cliente vacío y
   *  pintar «este cliente no tiene bonos» encima de una clienta que sí lo tiene.
   *
   *  Las instancias se guardan en `tenderEls` y NO se recrean: cerrar el sheet desmonta el DOM del
   *  cobro, y con un elemento nuevo el canje ya tomado desaparecería de la pantalla junto con su
   *  «deshacer», dejando una sesión gastada que nadie puede devolver desde la caja. */
  ensureTenderSlotsMounted() {
    const lines = this.tenderLines;
    const alive = /* @__PURE__ */ new Set();
    for (const l3 of lines) {
      if (!coverableLine(l3)) continue;
      const host = [...this.renderRoot.querySelectorAll(".tender-line")].find((n6) => n6.dataset.line === l3.line_id)?.querySelector(".tl-slot");
      if (!host) continue;
      for (const component of this.tenderFillers) {
        const key = `${component}::${l3.line_id}`;
        alive.add(key);
        let el = this.tenderEls.get(key);
        if (!el) {
          el = document.createElement(component);
          this.tenderEls.set(key, el);
        }
        const props = el;
        props.customerId = this.customerId ?? "";
        props.serviceId = l3.id;
        props.checkoutRef = this.orderId ?? "";
        props.lineRef = l3.line_id;
        if (el.parentElement !== host) host.appendChild(el);
      }
    }
    for (const [key, el] of [...this.tenderEls]) {
      if (alive.has(key)) continue;
      el.remove();
      this.tenderEls.delete(key);
    }
    if (this.covered.size) {
      const billed = new Set(this.billedLines.map((l3) => l3.line_id));
      const next = new Map([...this.covered].filter(([lineId]) => billed.has(lineId)));
      if (next.size !== this.covered.size) this.covered = next;
    }
  }
  /** Cuenta a los fillers el estado mínimo del carrito (`erp:pos-state`). No viaja ninguna línea:
   *  `pending_count` permite que Mesas impida cambiar de cuenta antes de enviar la comanda y que
   *  Cocina pinte su acción/badge, sin acoplar esos módulos a los datos de sales. */
  emitPosState(fillers = [...this.assignFillers, ...this.actionFillers, ...this.infoFillers]) {
    for (const f3 of fillers) {
      f3.el.dispatchEvent(new CustomEvent("erp:pos-state", {
        detail: {
          order_id: this.orderId,
          items_count: this.cart.length,
          pending_count: pendingLines(this.cart).length,
          kitchen_enabled: this.hasKitchen,
          label: this.tableLabel,
          channel: "dine_in"
        },
        bubbles: false
      }));
    }
  }
  /** Tras cobrar: avisa a cada filler para que limpie su selección (mesa/cliente). */
  resetSlotContexts() {
    for (const f3 of this.assignFillers) {
      f3.el.dispatchEvent(new CustomEvent("erp:order-context-reset", { bubbles: false }));
      f3.el.dispatchEvent(new CustomEvent("erp:customer-context-reset", { bubbles: false }));
    }
  }
  /** sales#222 — asks the counter for the customer the sale cannot be closed without.
   *
   *  `sales` does NOT know `customers` (ADR-0043): it never opens anybody's picker and never
   *  touches its DOM. It fires `erp:customer-required` at whoever fills `sales.pos.assign` — the
   *  same shape as `erp:customer-context-reset`, which that filler already honours — and brings
   *  the slot into view. With nobody filling the slot there is no customer to choose here at all,
   *  and that is said naming the app, like a missing charge app (sales#185): a block with no fix
   *  on this screen has to name what would fix it. */
  askForCustomer() {
    if (!this.assignFillers.length) {
      this.notifyShell(t5("ui.customerRequiredNoApp", { app: this.appName("customers") }));
      return;
    }
    this.notifyShell(t5("ui.customerRequiredCharge"));
    for (const f3 of this.assignFillers) {
      f3.el.dispatchEvent(new CustomEvent("erp:customer-required", { bubbles: false }));
    }
    const host = this.renderRoot.querySelector(".cart-actions-slot");
    host?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }
  updated(_changed) {
    this.ensureSlotsMounted();
    this.syncChargeState();
    if (this.paying || this.prebillOpen) void this.refreshValuation();
    const categorySegment = this.renderRoot.querySelector("ion-segment.category-segment") ?? void 0;
    if (categorySegment !== this.categorySegment) {
      this.categorySegmentCleanup?.();
      this.categorySegment = categorySegment;
      this.categorySegmentCleanup = bindTabbar(categorySegment ?? null);
    }
    this.emitPosState();
    for (const d3 of this.renderRoot.querySelectorAll("dialog.park-dialog, dialog.dirty-dialog, dialog.staff-dialog")) {
      try {
        if (typeof d3.showModal === "function" && !d3.matches(":modal")) {
          d3.close();
          d3.showModal();
        }
      } catch {
      }
    }
    if (this.parkPromptOpen) {
      const campo = this.renderRoot.querySelector("dialog.park-dialog input");
      if (campo && document.activeElement !== campo) {
        campo.focus();
        campo.select();
      }
    }
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
  /** Total PREVIEW con los descuentos (sales#71); la autoridad sigue siendo el servidor. */
  get total() {
    return Math.max(0, cartTotal(this.cart, this.ticketDiscount) - this.ticketDiscountAmount);
  }
  /** Lo que la cuenta todavía DEBE: el total menos lo que un tender externo ya cubrió (sales#162).
   *  El botón del pie promete un importe, así que tiene que prometer el que se va a pedir — con un
   *  canje tomado, el sheet decía 9,00 € y el pie, detrás, seguía diciendo 27,00 €. El TOTAL del
   *  ticket sigue siendo 27,00 € y se pinta aparte: son dos números distintos y los dos son ciertos. */
  get owed() {
    const lines = uncoveredLines(this.cart, new Set(this.covered.keys()));
    return Math.max(0, cartTotal(lines, this.ticketDiscount) - this.ticketDiscountAmount);
  }
  /** Lo que el descuento de ticket quita (porcentaje + importe), para pintarlo. */
  get ticketDiscountTotal() {
    return cartTotal(this.cart, 0) - this.total;
  }
  get discountsAllowed() {
    return this.settings.allow_discounts !== 0;
  }
  /** sales#222 — does this shop demand a customer on EVERY sale?
   *
   *  Read from the same row the server decides with (`sales.pos_settings.get`, sales#203) and with
   *  the same reading as the handler (`hub_setting(..., "require_customer", false)`): absent or 0
   *  is off, anything else is on. A freshly installed hub has no row, so it is off. */
  get customerRequired() {
    const v3 = this.settings.require_customer;
    return v3 !== void 0 && v3 !== null && v3 !== 0 && v3 !== false;
  }
  /** ...and is this checkout missing it? The server's rule is `customer_id`, never the typed name:
   *  the screen asks for exactly what `sales.complete_sale` refuses over. */
  get missingRequiredCustomer() {
    return this.customerRequired && !this.customerId;
  }
  get itemCount() {
    return this.cart.reduce((s5, l3) => s5 + l3.qty, 0);
  }
  get parkingEnabled() {
    return this.settings.enable_parked_tickets !== 0;
  }
  /** La capacidad Cocina existe solo si el registro de slots ha montado alguno de sus fillers. */
  get hasKitchen() {
    return this.actionFillers.length > 0 || this.infoFillers.length > 0;
  }
  get pendingCount() {
    return pendingLines(this.cart).length;
  }
  get visibleOrderLabel() {
    return this.orderLabel || this.tableLabel;
  }
  /** Guarda el título en el pedido abierto. Antes de la primera línea queda preparado en memoria y
   *  `ensureOrder` lo usa al abrir el pedido, sin inventar otra entidad ni almacenamiento local. */
  async saveOrderLabel(value) {
    const label = value.trim();
    this.orderLabel = label;
    if (!this.orderId) return;
    try {
      await erplora2().command("sales.order.set_label", { order_id: this.orderId, label });
      this.parked = await listOpenChecks(erplora2(), this.orderId);
    } catch (e7) {
      this.error = e7 instanceof Error ? e7.message : t5("ui.errorSavingTitle");
    }
  }
  focusOrderTitle() {
    const input = this.renderRoot.querySelector(".order-title");
    input?.focus();
    input?.select();
  }
  /** Presenta el aviso como overlay GLOBAL de Ionic. Declararlo en el template del WC lo deja
   *  dentro de su Shadow DOM y, al portalizarlo Ionic, puede aparecer como una superficie negra
   *  sin contenido. En body hereda correctamente el modo y los colores claro/oscuro del Hub. */
  async showPendingSwitchAlert(count) {
    if (this.pendingSwitchAlert) return;
    const alert = document.createElement("ion-alert");
    alert.header = t5("ui.pendingSwitchTitle");
    alert.message = t5("ui.pendingBeforeSwitch", { count: String(count) });
    alert.buttons = [{ text: t5("ui.close"), role: "cancel" }];
    const cleanup = () => {
      if (this.pendingSwitchAlert === alert) this.pendingSwitchAlert = void 0;
      alert.remove();
    };
    alert.addEventListener("ionAlertDidDismiss", cleanup, { once: true });
    document.body.appendChild(alert);
    this.pendingSwitchAlert = alert;
    try {
      if (typeof alert.present === "function") await alert.present();
      else alert.isOpen = true;
    } catch {
      cleanup();
    }
  }
  /** En un TPV con Cocina no se cambia de cuenta desde el almacén mientras haya una comanda sin
   *  enviar. Sin Cocina no aplica: retail/peluquería pueden aparcar y recuperar con normalidad. */
  blockPendingAccountSwitch() {
    if (!this.hasKitchen || this.pendingCount === 0) return false;
    this.orderView = "draft";
    this.parkedOpen = false;
    this.cartOpen = true;
    void this.showPendingSwitchAlert(this.pendingCount);
    return true;
  }
  /** La categoría PRIMARIA de un producto (la primera de `prodCats`); `undefined` sin clasificar. */
  primaryCategory(productId) {
    return this.prodCats.get(productId)?.values().next().value ?? void 0;
  }
  catCount(id) {
    const c5 = this.categories.find((x2) => x2.id === id);
    return c5?.product_count ?? this.products.filter((p4) => this.prodCats.get(p4.id)?.has(id)).length;
  }
  /** Un ratón convencional no tiene gesto horizontal: sobre el segmento, su rueda desplaza las
   *  categorías lateralmente. Trackpad y táctil conservan su scroll nativo. */
  onCategoryWheel(e7) {
    const seg = e7.currentTarget;
    if (seg.scrollWidth <= seg.clientWidth || Math.abs(e7.deltaX) >= Math.abs(e7.deltaY)) return;
    e7.preventDefault();
    seg.scrollLeft += e7.deltaY;
  }
  /** Aparcar (ADR-0146): la cuenta se queda ABIERTA y solo se suelta de la pantalla. Ya no se
   *  copia a otra entidad —el pedido ya es la cuenta— y por eso no se pierde nada por el camino.
   *  Si venía de una mesa, su dueño la suelta también: la mesa queda libre para otros. */
  async park() {
    if (!this.cart.length) return;
    this.notifyPark();
    forgetCurrentCheck(localStorage);
    this.orderId = void 0;
    this.orderLabel = "";
    this.cart = [];
    this.tableId = void 0;
    this.tableLabel = "";
    this.parkedOpen = false;
    this.parked = await listOpenChecks(erplora2());
  }
  /** Punto de entrada del botón del desplegable. Con mesa es «DEJAR EN LA MESA» (la cuenta vive
   *  allí — modelo Toast/Lightspeed, decisión Ioan 2026-07-19): se suelta solo la PANTALLA y la
   *  mesa sigue ocupada con su cuenta. Sin mesa es APARCAR con nombre (default: la hora, patrón
   *  Loyverse), pre-seleccionado para sobreescribirlo de un toque. */
  async requestPark() {
    if (!this.cart.length) return;
    if (this.blockPendingAccountSwitch()) return;
    if (this.tableLabel.trim()) {
      await this.leaveOnTable();
      return;
    }
    this.parkName = defaultParkLabel("", /* @__PURE__ */ new Date());
    this.parkedOpen = false;
    this.parkPromptOpen = true;
  }
  /** «Dejar en la mesa»: etiqueta la cuenta con su mesa, suelta la PANTALLA y avisa a los
   *  fillers con `erp:order-detached` — que limpian su selección SIN tocar la sesión. La mesa
   *  sigue ocupada; la cuenta se recupera tocándola o desde la lista. JAMÁS aparca ni anula. */
  async leaveOnTable() {
    const id = this.orderId;
    const donde = this.tableLabel.trim();
    if (id && donde) await erplora2().command("sales.order.set_label", { order_id: id, label: donde }).catch(() => void 0);
    forgetCurrentCheck(localStorage);
    this.orderId = void 0;
    this.orderLabel = "";
    this.cart = [];
    this.tableId = void 0;
    this.tableLabel = "";
    this.parkedOpen = false;
    this.notifyOrderDetached();
    erplora2().notify?.({ type: "success", message: t5("ui.leftAtTable", { label: donde }) });
    this.parked = await listOpenChecks(erplora2());
  }
  /** Avisa a los fillers de que la cuenta se suelta DE PANTALLA: limpian su selección local y
   *  nada más (la sesión de mesa no se toca — soltarla es `erp:order-parked`, otra cosa). */
  notifyOrderDetached() {
    for (const f3 of this.assignFillers) {
      f3.el.dispatchEvent(new CustomEvent("erp:order-detached", { detail: {}, bubbles: false }));
    }
  }
  /** Aparca la cuenta actual CON nombre: persiste la etiqueta y luego suelta la pantalla.
   *  Aparcar JAMÁS anula (`sales.order.void` solo sale de una decisión explícita de eliminar) —
   *  el void que vivía aquí era la causa de «los tiquets aparcados desaparecen». */
  async parkWith(label) {
    const id = this.orderId;
    const nombre = label.trim() || defaultParkLabel("", /* @__PURE__ */ new Date());
    this.orderLabel = nombre;
    if (id) await erplora2().command("sales.order.set_label", { order_id: id, label: nombre }).catch(() => void 0);
    await this.park();
    erplora2().notify?.({ type: "success", message: t5("ui.parkedToast", { name: nombre }) });
  }
  /** ELIMINAR la cuenta actual (decisión explícita del diálogo de carrito sucio): anula el pedido
   *  y limpia la pantalla. El rastro queda (`voided`), no se borra nada. */
  async discardCurrent() {
    const id = this.orderId;
    if (id) await erplora2().command("sales.order.void", { order_id: id }).catch(() => void 0);
    forgetCurrentCheck(localStorage);
    this.orderId = void 0;
    this.orderLabel = "";
    this.cart = [];
    this.resetSlotContexts();
  }
  /** Abre el diálogo «¿aparcar o eliminar?» y espera la decisión. `allowCancel` solo al recuperar
   *  desde la lista (al tocar una mesa el filler ya cambió su selección: cancelar dejaría a los
   *  dos descoordinados, así que ahí solo hay aparcar/eliminar y cerrar equivale a aparcar). */
  resolveDirtyCart(allowCancel) {
    this.dirtyAllowCancel = allowCancel;
    this.dirtyOpen = true;
    return new Promise((res) => {
      this.dirtyResolve = res;
    });
  }
  answerDirty(c5) {
    this.dirtyOpen = false;
    const res = this.dirtyResolve;
    this.dirtyResolve = void 0;
    res?.(c5);
  }
  /** Eliminar una cuenta DE LA LISTA, en dos toques (armar → confirmar). Anula el pedido
   *  (`voided`, con rastro) — nunca de un roce: el primer toque solo cambia el icono. */
  async deleteCheck(oc) {
    if (this.armedDelete !== oc.id) {
      this.armedDelete = oc.id;
      if (this.armedTimer) clearTimeout(this.armedTimer);
      this.armedTimer = setTimeout(() => {
        this.armedDelete = void 0;
      }, 3e3);
      return;
    }
    if (this.armedTimer) {
      clearTimeout(this.armedTimer);
      this.armedTimer = void 0;
    }
    this.armedDelete = void 0;
    await erplora2().command("sales.order.void", { order_id: oc.id }).catch(() => void 0);
    this.parked = await listOpenChecks(erplora2(), this.orderId);
  }
  /** Recuperar una cuenta abierta = CAMBIAR de cuenta, igual que tocar otra mesa. Qué pasa con lo
   *  de delante (decisión Ioan 2026-07-19): si tiene MESA, se queda EN SU MESA — ni se aparca ni
   *  se suelta la sesión, recuperable tocándola (patrón Toast/Lightspeed) — y se avisa con toast;
   *  sin mesa, se PREGUNTA: aparcar (con la hora de nombre) o eliminar. */
  async retrieve(c5) {
    try {
      if (this.orderId !== c5.id && this.blockPendingAccountSwitch()) return;
      if (this.cart.length && this.orderId !== c5.id) {
        if (this.tableId) {
          await this.leaveOnTable();
        } else {
          this.parkedOpen = false;
          const eleccion = await this.resolveDirtyCart(true);
          if (eleccion === "cancel") return;
          if (eleccion === "discard") await this.discardCurrent();
          else await this.parkWith(defaultParkLabel("", /* @__PURE__ */ new Date()));
        }
      }
      this.orderId = c5.id;
      this.orderLabel = c5.label ?? "";
      this.ticketDiscount = c5.discount ?? 0;
      this.ticketDiscountAmount = c5.discount_amount ?? 0;
      rememberCurrentCheck(localStorage, c5.id);
      this.cart = await loadOrderLines(erplora2(), c5.id);
      this.notifyOrderRestored();
      this.parkedOpen = false;
      this.parked = await listOpenChecks(erplora2(), c5.id);
    } catch (e7) {
      this.error = e7 instanceof Error ? e7.message : t5("ui.errorRetrieve");
    }
  }
  /** Avisa a los dueños de que la cuenta se aparca, para que suelten lo suyo (la mesa). */
  notifyPark() {
    if (!this.orderId) return;
    for (const f3 of this.assignFillers) {
      f3.el.dispatchEvent(new CustomEvent("erp:order-parked", { detail: { order_id: this.orderId }, bubbles: false }));
    }
  }
  /** Avisa a los dueños de que se ha reabierto una cuenta, para que recuperen su contexto. */
  notifyOrderRestored() {
    if (!this.orderId) return;
    for (const f3 of this.assignFillers) {
      f3.el.dispatchEvent(new CustomEvent("erp:order-restored", { detail: { order_id: this.orderId }, bubbles: false }));
    }
  }
  /** Reanuda LA CUENTA QUE TENÍA ESTE TERMINAL tras recargar (ADR-0141/0146).
   *
   *  Antes se cogía «el primer pedido abierto»: con varias cuentas abiertas eso es aterrizar en la
   *  de otro camarero. La cuenta en curso es estado del DISPOSITIVO, así que se recuerda ahí; si ya
   *  se cobró, se empieza en blanco y el camarero elige — no se cae a otra cualquiera. */
  async restoreOpenOrder() {
    try {
      const cuentas = await listOpenChecks(erplora2());
      const id = resolveCurrentCheck(localStorage, cuentas.map((c5) => c5.id));
      if (!id) return [];
      this.orderId = id;
      this.orderLabel = cuentas.find((c5) => c5.id === id)?.label ?? "";
      this.ticketDiscount = cuentas.find((c5) => c5.id === id)?.discount ?? 0;
      this.ticketDiscountAmount = cuentas.find((c5) => c5.id === id)?.discount_amount ?? 0;
      for (const f3 of this.assignFillers) {
        f3.el.dispatchEvent(new CustomEvent("erp:order-restored", { detail: { order_id: id }, bubbles: false }));
      }
      return await loadOrderLines(erplora2(), id);
    } catch {
      return [];
    }
  }
  /** Avisa a los fillers de que hay pedido abierto para que ENLACEN lo suyo (mesa, cliente…).
   *  `sales` no escribe junctions ajenas ni conoce a esos módulos: solo publica el `order_id`.
   *
   *  Viaja también la CUENTA a la que engancharlo cuando se sabe (`pendingSplitSession`, sales#61).
   *  Una mesa dividida tiene varias cuentas vivas: sin ese id el dueño de la junction resuelve a la
   *  más antigua y el segundo pedido aterriza en la primera cuenta — las dos mitades acabarían
   *  cobrando la misma comanda. El id es OPACO para `sales`: se recibió en el evento y se reenvía. */
  notifyOrderLinked() {
    if (!this.orderId) return;
    const session = this.pendingSplitSession;
    for (const f3 of this.assignFillers) {
      f3.el.dispatchEvent(new CustomEvent("erp:order-linked", {
        detail: session ? { order_id: this.orderId, session_id: session } : { order_id: this.orderId },
        bubbles: false
      }));
    }
    this.pendingSplitSession = void 0;
  }
  async fireToKitchen() {
    if (!this.cart.length || this.firing) return;
    this.firing = true;
    try {
      await this.fireToKitchenNow();
    } finally {
      this.firing = false;
    }
  }
  async fireToKitchenNow() {
    const orderId = await this.ensureOrder(this.cart[0]);
    const pendientes = pendingLines(this.cart);
    const payload = buildFirePayload(
      orderId,
      this.tableLabel,
      pendientes,
      nextRoundNo(this.cart),
      this.staffId
    );
    if (!payload) return;
    try {
      await erplora2().command("sales.order.fire", payload);
      erplora2().notify?.({ type: "success", message: t5("ui.firedToKitchen") });
      if (this.orderId) this.cart = await loadOrderLines(erplora2(), this.orderId);
    } catch (e7) {
      if (errorCode(e7) === "sales.nothing_to_fire") {
        if (this.orderId) this.cart = await loadOrderLines(erplora2(), this.orderId).catch(() => this.cart);
        return;
      }
      this.error = t5("ui.fireFailed");
    }
  }
  /** Abre el pedido, opcionalmente ya con su primera línea.
   *
   *  🔴 sales#63 — `first: null` NO es un detalle: `sales.order.open` va con `sales.add_sale`, que
   *  tiene todo cajero. Si la línea de PRECIO LIBRE viajara dentro del payload que abre la cuenta,
   *  el importe entraría por una puerta que no pide el permiso y el control no ocurriría nunca.
   *  Por eso ese camino abre la cuenta VACÍA y añade su línea por el comando gateado. */
  async ensureOrder(first) {
    if (this.orderId) return this.orderId;
    this.orderId = await openOrderWithLines(erplora2(), first ? [first] : [], this.visibleOrderLabel);
    rememberCurrentCheck(localStorage, this.orderId);
    this.notifyOrderLinked();
    return this.orderId;
  }
  /** Empuja una línea NUEVA al carrito (sin fusionar), persistiéndola YA: abre el pedido con ella si
   *  no hay ninguno, o la añade al abierto. La fila queda escrita ANTES de que la UI siga (un corte de
   *  corriente ya no se lleva el artículo). Compartido por `addNow` (producto de catálogo) y la venta
   *  por PRECIO LIBRE, que nunca fusiona: todas sus líneas llevan `id: ''`. */
  /** Empuja una línea de PRECIO LIBRE, siempre por su puerta (sales#63).
   *
   *  Dos reglas, y ninguna es cosmética: la cuenta se abre **vacía** si aún no existe (meter el
   *  importe en `sales.order.open` lo colaría por `sales.add_sale`), y la línea entra por
   *  `sales.order.add_open_line`, que pide `sales.sell_open_price`. Al cajero sin ese permiso el
   *  runtime le contesta `requires_elevation` y el shell levanta el PIN del encargado — no es un
   *  callejón sin salida, es la autorización en el momento sin cerrar su sesión (ADR-0238). */
  async pushOpenPriceLine(line) {
    const orderId = await this.ensureOrder(null);
    line.line_id = await addOpenPriceLine(erplora2(), orderId, line);
    this.cart = [...this.cart, line];
  }
  async pushNewLine(line) {
    if (!this.orderId) {
      await this.ensureOrder(line);
      const persisted = this.orderId ? await loadOrderLines(erplora2(), this.orderId) : [];
      this.cart = persisted.length ? persisted.map((pl) => ({ ...line, ...pl })) : [...this.cart, line];
      return;
    }
    line.line_id = await addOrderLine(erplora2(), this.orderId, line);
    this.cart = [...this.cart, line];
  }
  /** Lee `?appointment_id=` de la URL, siembra la cita y BORRA el parámetro.
   *
   *  El shell no pasa props ni la ruta a los Web Components, así que el deep link es el único canal
   *  que tiene la agenda para decir «cobra esta cita». Se limpia con `replaceState` para que la
   *  orden no quede pegada a la barra de direcciones. */
  async consumeAppointmentDeepLink(services) {
    let id = null;
    try {
      id = new URLSearchParams(window.location.search).get("appointment_id");
    } catch {
      return;
    }
    if (!id) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("appointment_id");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
    }
    await this.seedFromAppointment(id, services);
  }
  /** Siembra el carrito con el servicio de una CITA (ADR-0077, seam cerrado en sales#89).
   *
   *  `sales` no sabe qué es una cita: lee UNA query pública y se queda con dos ids OPACOS
   *  (`appointment_id`, `staff_id`) que reenvía al cobrar. No hay `depends_on`, ni JOIN, ni
   *  conocimiento del dominio de citas — un hub sin el módulo abre el TPV vacío y en paz.
   *
   *  La cita guarda `service_price` pero NO la categoría fiscal, así que el IVA quedaría colgando.
   *  Se resuelve contra el catálogo de servicios que el TPV ya carga para el walk-in: una sola
   *  fuente de verdad fiscal para las dos puertas. */
  async seedFromAppointment(appointmentId, services) {
    const rowsIn = await optionalRead((c5) => c5.queryOptional("appointments.appointments.get", { id: appointmentId }));
    if (rowsIn === void 0) return;
    const ap = rows2(rowsIn)[0];
    if (!ap) return;
    const svc = services.find((s5) => s5.id === ap.service_id);
    const price = Number(ap.service_price) || Number(svc?.price) || 0;
    const name = ap.service_name || svc?.name || "";
    if (!name) return;
    this.appointmentId = ap.id || appointmentId;
    this.staffId = ap.staff_id || void 0;
    this.staffName = ap.staff_name || "";
    if (ap.customer_id) this.customerId = ap.customer_id;
    if (ap.customer_name) this.customerName = ap.customer_name;
    const tax_category_key = svc?.tax_category_key;
    await this.queue(() => this.addNow({
      id: svc?.id ?? "",
      name,
      price,
      tax_category_key,
      is_service: true,
      pricing_type: "fixed",
      is_active: 1
    }));
  }
  /** sales#179 — **who is serving this check**, and how it is transferred.
   *
   *  This screen does not decide the DEFAULT: `complete_sale` attributes the sale to the session
   *  user when the payload names nobody. The till does not know who is signed in (the SDK does not
   *  expose it) and **must not guess**: sending an id made up in the browser would attribute sales
   *  to whoever the caller pleased. What does belong to this screen is the other half of what
   *  Toast, Square for Restaurants and Lightspeed do: the waiter is pinned to the check and can be
   *  TRANSFERRED — whoever takes the table is not always the one at the terminal.
   *
   *  The list comes from `hub.users.list`, the core's RESERVED namespace (ADR-0192): personnel
   *  belongs to the hub, not to the `staff` module. It is asked for when the picker OPENS, not at
   *  boot: the till already makes plenty of calls there, and this one is only needed if somebody is
   *  about to change the waiter. */
  async openStaffPicker() {
    this.staffPickerOpen = true;
    if (this.staffPickerState === "ready" || this.staffPickerState === "loading") return;
    this.staffPickerState = "loading";
    try {
      const rowsIn = await erplora2().query("hub.users.list");
      this.hubUsers = rows2(rowsIn).filter((u5) => u5.is_active !== false && !!u5.id);
      this.staffPickerState = "ready";
    } catch {
      this.hubUsers = [];
      this.staffPickerState = "error";
    }
  }
  /** Choose who is serving. With no argument = **the session user**: the explicit attribution is
   *  cleared and the server decides again. */
  pickStaff(person) {
    this.staffId = person?.id;
    this.staffName = person?.name ?? "";
    this.staffPickerOpen = false;
  }
  /** What the chip reads. With an originating appointment the id is known but the name may not be
   *  (it is a `staff_member`, not a person of the hub): it says "the assigned professional" instead
   *  of showing a UUID or lying with "me". */
  get staffLabel() {
    const name = this.staffName || (this.staffId ? t5("ui.staffAssigned") : t5("ui.staffMe"));
    return t5("ui.servedBy", { name });
  }
  /** The till's own policy row (sales#25, widened by sales#203): which catalogue sources feed the
   *  grid, which payment methods are offered, whether discounts and parked tickets exist, whether
   *  prices carry VAT inside, how the checkout opens and what the receipt says.
   *
   *  Read through `sales.pos_settings.get` and NOT `sales.settings.get`: that one requires
   *  `sales.manage_settings`, which neither `cashier` nor `employee` has, so through it the till
   *  is blind to its own configuration for the two roles that use it all day.
   *
   *  A FAILURE falls back to the defaults — a till that opens with an empty grid because a
   *  settings read hiccuped is worse than one that shows everything — but it is not swallowed:
   *  the shell is told, because a policy nobody could read means the switches on the settings
   *  screen are not being honoured right now.
   *
   *  sales#223 — absence and failure both come out of `withPosSettingsDefaults`, which is the ONE
   *  place the UI declares what the till is out of the box. No reader below sees `undefined` again:
   *  they used to, and `undefined !== 0` turned every switch that ships OFF into an ON. */
  async loadPosSettings() {
    try {
      return withPosSettingsDefaults(rows2(await erplora2().query("sales.pos_settings.get"))[0]);
    } catch {
      this.notifyShell(t5("ui.posSettingsUnavailable"));
      return withPosSettingsDefaults(void 0);
    }
  }
  /** El catálogo VENDIBLE de `services`, mapeado a la forma de la rejilla (sales#89).
   *
   *  Un servicio se cobra por la MISMA puerta que un producto —misma tarjeta, mismo carrito, mismo
   *  cobro— para que no pueda divergir del camino fiscal. Lo único que lo distingue es
   *  `is_service`, que hace que el handler no lo mida contra el catálogo de `inventory` ni le
   *  descuente stock. `services` es la autoridad del precio y de la categoría fiscal. */
  async loadServices() {
    const rowsIn = await optionalReadAll(
      (c5) => c5.queryAllOptional("services.services.list"),
      (c5) => c5.queryOptional("services.services.list", { limit: LEGACY_PAGE_LIMIT })
    );
    if (rowsIn === void 0) return [];
    return rows2(rowsIn).map((s5) => ({
      id: s5.id,
      name: s5.name,
      price: Number(s5.price) || 0,
      // sales#99: without this the service never enters `prodCats` and its tab counts 0.
      category_id: s5.category_id,
      tax_category_key: s5.tax_category_key,
      pricing_type: s5.pricing_type ?? "fixed",
      is_service: true,
      is_active: 1
    }));
  }
  /** Las categorías de servicio salen como una pestaña más: 40 servicios en un muro plano no son
   *  usables en una peluquería con cliente delante. */
  async loadServiceCategories() {
    const rowsIn = await optionalReadAll(
      (c5) => c5.queryAllOptional("services.categories.list", { sort: "name", dir: "asc" }),
      (c5) => c5.queryOptional("services.categories.list", { sort: "name", dir: "asc", limit: LEGACY_PAGE_LIMIT })
    );
    if (rowsIn === void 0) return [];
    return rows2(rowsIn).filter((c5) => c5.name).map((c5) => ({ id: c5.id, name: c5.name }));
  }
  /** Motivo por el que este producto NO se puede cobrar, ya traducido; `undefined` si se puede
   *  (o si no hay catálogo fiscal con el que juzgarlo: eso es un incidente de `taxes`, no del
   *  producto, y cobrar es lo último que puede romperse). sales#74, ampliado en sales#89. */
  /** Best-effort: the shell toast goes ON TOP of our own notice, never instead of it. A shell with
   *  no notifier wired (or an older one) would leave the cashier with no explanation at all. */
  notifyShell(message) {
    const c5 = erplora2();
    try {
      c5.notify?.({ type: "warning", message });
    } catch {
    }
  }
  blockedReason(p4) {
    switch (productSellability(this.taxCatalog, p4.tax_category_key)) {
      case "no_tax_category":
        return t5("ui.notSellableNoTaxCategory");
      case "no_tax_rule":
        return t5("ui.notSellableNoTaxRule");
      default:
        return void 0;
    }
  }
  /** ¿Este servicio deja el precio SIN decidir? (services#12)
   *
   *  El mercado tiene dos estados, no cinco: un artículo lleva precio o es variable, y el variable
   *  «just asks the cashier how much» (Square; Vagaro lo cambia en el cobro). El «desde X» no es un
   *  motor de precios, es una etiqueta del catálogo — en Square ni siquiera existe. Así que
   *  `from`/`hourly`/`variable` caen todos en la misma pregunta, y `fixed`/`free` son precio final
   *  (gratis es una cifra decidida: preguntar sería preguntar algo que ya tiene respuesta). */
  needsAmount(p4) {
    return !!p4.is_service && !CLOSED_PRICING.has(p4.pricing_type ?? "fixed");
  }
  add(p4) {
    const blocked = this.blockedReason(p4);
    if (blocked) {
      this.blockedNotice = blocked;
      this.notifyShell(blocked);
      return Promise.resolve();
    }
    this.blockedNotice = "";
    if (this.needsAmount(p4)) {
      this.openOpenPrice({ amountCents: Number(p4.price) || 0, deptKey: p4.tax_category_key });
      return Promise.resolve();
    }
    return this.queue(() => this.addWithModifiers(p4));
  }
  /** pm#93 — si lo que se añade tiene grupos de suplementos, se PREGUNTA antes; si no, se añade
   *  igual que siempre.
   *
   *  La lectura es OPCIONAL (ADR-0127): `undefined` = el módulo `modifiers` no está instalado, y el
   *  TPV sigue cobrando sin enterarse. Ese es el 99 % de las pulsaciones de un TPV, y meterles un
   *  paso sería empeorar el producto para casi todo el mundo. */
  async addWithModifiers(p4) {
    const rows3 = await optionalRead(
      (c5) => c5.queryOptional("modifiers.for_target", {
        target_kind: p4.is_service ? "service" : "product",
        target_ref: p4.id,
        category_ref: this.primaryCategory(p4.id) ?? null
      })
    );
    const groups = groupModifierRows(Array.isArray(rows3) ? rows3 : []);
    if (!groups.length) return this.addNow(p4);
    this.modifierPicks = [];
    this.modifierSheet = { product: p4, groups };
  }
  /** ¿Se puede confirmar la hoja? Un grupo con `min >= 1` sin resolver NO deja seguir: es una
   *  PRECONDICIÓN, no un aviso — Toast bloquea el envío a cocina por lo mismo. El techo `max` se
   *  respeta igual (0 = sin techo). */
  canConfirmModifiers() {
    const sheet = this.modifierSheet;
    if (!sheet) return false;
    return sheet.groups.every((g3) => {
      const n6 = g3.options.filter((o9) => this.modifierPicks.includes(o9.id)).length;
      return n6 >= g3.min && (g3.max === 0 || n6 <= g3.max);
    });
  }
  /** Confirma la hoja y añade la línea con sus suplementos, en el ORDEN elegido.
   *
   *  🔴 Solo viaja el `option_id`: el importe que se COBRA lo resuelve el servidor contra
   *  `modifiers.options.all` (sales#68). El `price_delta` se queda EN LA PANTALLA (sales#208) —
   *  es el que la hoja acaba de enseñar y el que hace que la línea del carrito valga lo que se va
   *  a cobrar en vez del precio pelado del producto. */
  async confirmModifiers() {
    const sheet = this.modifierSheet;
    if (!sheet || !this.canConfirmModifiers()) return;
    const options = new Map(sheet.groups.flatMap((g3) => g3.options).map((o9) => [o9.id, o9]));
    const picks = this.modifierPicks.map((option_id) => ({
      option_id,
      ...options.get(option_id)?.price_delta ? { price_delta: options.get(option_id).price_delta } : {}
    }));
    this.modifierSheet = void 0;
    this.modifierPicks = [];
    await this.addNow(sheet.product, picks);
  }
  // ══ sales#153 · EL PICKER DEL MENÚ (ADR-0381) ════════════════════════════════════════════════
  //
  // Decidido con el mercado (12 referencias + foros; la tabla va en el PR). Tres veredictos:
  //  · HOJA ÚNICA con los grupos apilados, no wizard. Odoo lo hace así en 18 y en 19, y Toast
  //    construyó «Open View» para SALIR del wizard: «rather than in a sequential way».
  //  · El TECHO se respeta PARTIDO por el valor de `max` — ver `pickComboOption`.
  //  · El suplemento lleva SIGNO SEPARADO y se oculta si es cero — ver `comboDelta`.
  /** Lee el catálogo de menús. Distingue tres estados que NO son el mismo:
   *
   *  · `undefined` → el módulo `combos` no está instalado. `sales` no gana `depends_on` (ADR-0127)
   *    y el TPV es exactamente el de antes: ni baldosas ni aviso, porque no hay nada que avisar.
   *  · lanza → el módulo está y la lectura FALLÓ. Eso sí se dice: una rejilla misteriosamente
   *    corta es un fallo mudo, y este es el que deja al camarero buscando un menú que no aparece.
   *  · filas → los menús vendibles.
   */
  async loadCombos() {
    let raw;
    try {
      const c5 = erplora2();
      if (typeof c5.queryOptional !== "function") return;
      raw = await c5.queryOptional("combos.options.all", {});
    } catch {
      this.comboCatalogFailed = true;
      return;
    }
    if (raw === void 0 || raw === null) return;
    this.comboCatalog = groupComboRows(rows2(raw));
  }
  /** El nombre de un componente. `combos` referencia el artículo de forma OPACA (`source`/
   *  `source_ref`, `depends_on: []`), así que quien sabe cómo se llama es el catálogo que el TPV ya
   *  tiene cargado. Sin resolverlo, el camarero elegiría entre «p-sirloin» y «p-chicken». */
  comboOptionName(o9) {
    return this.products.find((p4) => p4.id === o9.source_ref)?.name ?? o9.source_ref;
  }
  /** El suplemento, con el SIGNO SEPARADO del número y vacío cuando es cero.
   *
   *  Es literalmente lo que hace Odoo (`Math.abs()` + `'+ '`/`'- '`, y `''` si es cero) y coincide
   *  con el modo `Relative` de WooCommerce y con el «−$1.00» que Square publica para «No cheese».
   *  El signo carga el significado: el color NO, porque el color solo no pasa contraste — y Odoo
   *  pinta los dos signos del mismo color a propósito. */
  comboDelta(o9) {
    if (!o9.price_delta) return "";
    return `${o9.price_delta > 0 ? "+" : "\u2212"} ${this.money(Math.abs(o9.price_delta))}`;
  }
  /** Cuántas veces está elegida una opción (con `allow_repeat` puede ser > 1). */
  comboCount(id) {
    return this.comboPicks.filter((x2) => x2 === id).length;
  }
  comboPicksIn(g3) {
    const ids = new Set(g3.options.map((o9) => o9.option_id));
    return this.comboPicks.filter((p4) => ids.has(p4));
  }
  /** El grupo llegó a su techo. `max = 0` es SIN TECHO: nunca se llena. */
  comboGroupFull(g3) {
    return g3.max > 0 && this.comboPicksIn(g3).length >= g3.max;
  }
  /** El contador de la cabecera, con la gramática de Toast Open View: `1` exacto · `1-3` rango ·
   *  `1+` mínimo sin techo · `3` opcional con techo · nada = opcional sin límite. Explica la regla
   *  ANTES de que se choque contra ella, que es lo que no hace apagar la opción sin más. */
  comboGroupCounter(g3) {
    if (g3.min > 0 && g3.max === g3.min) return `${g3.min}`;
    if (g3.min > 0 && g3.max > g3.min) return `${g3.min}-${g3.max}`;
    if (g3.min > 0 && g3.max === 0) return `${g3.min}+`;
    if (g3.min === 0 && g3.max > 0) return `${g3.max}`;
    return "";
  }
  openCombo(combo) {
    this.blockedNotice = "";
    this.comboPicks = [];
    this.comboNeedsGroup = "";
    this.comboSheet = { combo };
  }
  /**
   * Un toque en una opción. El mercado NO da una respuesta única al techo: la da **partida** por el
   * valor de `max`, y así se implementa.
   *
   * · `max === 1` → **AUTO-SWAP** tipo radio. Square se lo prescribe a sus integradores («use radio
   *   buttons when `max_selected_modifiers = 1`») y Odoo 18 lo hace con `<input type="radio">`. La
   *   anterior se RETIRA limpiamente: cuando Square falló en eso, el KDS imprimía «No Not spicy» y
   *   «Spicy Level 1» a la vez y hubo que renunciar a las preselecciones.
   * · `max > 1` (o 0 = sin techo) → acumula. En el techo, el toque no añade pero **CONTESTA**:
   *   marca el grupo. Nunca se apaga la opción entera —Square se niega a esconder lo no
   *   seleccionable— y el motivo vive en el contador de la cabecera, no en un `title` que en una
   *   pantalla táctil nadie puede leer.
   *
   * Y jamás se autoconfirma al llegar al mínimo: en Square eso se percibe como avería.
   */
  pickComboOption(g3, id) {
    this.comboNeedsGroup = "";
    const mine = new Set(g3.options.map((o9) => o9.option_id));
    if (g3.max === 1) {
      this.comboPicks = this.comboCount(id) > 0 ? this.comboPicks.filter((x2) => !mine.has(x2)) : [...this.comboPicks.filter((x2) => !mine.has(x2)), id];
      return;
    }
    const already = this.comboCount(id) > 0;
    if (already && !g3.allow_repeat) {
      this.comboPicks = this.comboPicks.filter((x2) => x2 !== id);
      return;
    }
    if (this.comboGroupFull(g3)) {
      this.comboNeedsGroup = g3.id;
      return;
    }
    this.comboPicks = [...this.comboPicks, id];
  }
  /** Quita UNA de las repeticiones (solo existe cuando el grupo permite repetir). */
  dropComboOption(id) {
    const i7 = this.comboPicks.lastIndexOf(id);
    if (i7 < 0) return;
    this.comboPicks = [...this.comboPicks.slice(0, i7), ...this.comboPicks.slice(i7 + 1)];
  }
  /** Por qué no se puede confirmar, o `undefined`. Sale de la MISMA función que decide el botón,
   *  así que el motivo escrito y el botón no pueden contradecirse. */
  comboBlocked() {
    const sheet = this.comboSheet;
    if (!sheet) return void 0;
    const why = comboBlockReason(sheet.combo, this.comboPicks);
    if (!why) return void 0;
    return { text: t5(why.key, { group: why.group, n: why.n ?? 1 }), group: why.group };
  }
  /** Confirma la composición y añade la línea. Solo viajan los `option_id` EN SU ORDEN —el que lee
   *  cocina—, más el nombre y la categoría de cada componente para DISPLAY y para que el KDS
   *  enrute cada uno a SU estación (el fallo de TouchBistro que ADR-0381 nombra).
   *
   *  🔴 El `price` que se manda es un PREVIEW. El servidor lo IGNORA y recalcula contra
   *  `combos.options.all`: quien decide el dinero es él, nunca el navegador (sales#68). */
  async confirmCombo() {
    const sheet = this.comboSheet;
    if (!sheet) return;
    if (!canConfirmCombo(sheet.combo, this.comboPicks)) {
      this.comboNeedsGroup = comboBlockReason(sheet.combo, this.comboPicks)?.group ?? "";
      const g3 = sheet.combo.groups.find((x2) => x2.name === this.comboNeedsGroup);
      if (g3) this.comboNeedsGroup = g3.id;
      return;
    }
    const combo = sheet.combo;
    const picks = this.comboPicks;
    const choices = picks.map((option_id) => {
      const o9 = combo.groups.flatMap((g3) => g3.options).find((x2) => x2.option_id === option_id);
      return {
        option_id,
        product_name: this.comboOptionName(o9),
        category_id: this.primaryCategory(o9.source_ref) ?? null
      };
    });
    this.comboSheet = void 0;
    this.comboPicks = [];
    this.comboNeedsGroup = "";
    await this.queue(() => this.addComboLine(combo, choices, comboTotalCents(combo, picks)));
  }
  toggleModifier(id) {
    this.modifierPicks = this.modifierPicks.includes(id) ? this.modifierPicks.filter((x2) => x2 !== id) : [...this.modifierPicks, id];
  }
  async addNow(p4, picks = []) {
    const fingerprint = (m4) => (m4 ?? []).map((x2) => x2.option_id).join("\0");
    const want = fingerprint(picks);
    const ex = this.cart.find((l3) => l3.id === p4.id && !l3.is_gift && fingerprint(l3.modifiers) === want);
    const tax_rate = resolveLineTax(this.taxCatalog.rates, p4.tax_category_key);
    try {
      if (ex) {
        const qty = ex.qty + 1;
        this.cart = this.cart.map((l3) => l3 === ex ? { ...l3, qty } : l3);
        if (this.orderId && !await persistLineQty(erplora2(), this.orderId, ex, qty)) {
          this.cart = this.cart.map((l3) => l3.id === ex.id && !l3.is_gift ? { ...l3, qty: ex.qty } : l3);
          this.error = t5("ui.lineNotSaved");
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
        cost: Number(p4.cost) || 0,
        // sales#12: la categoría se congela en la línea — es lo que enruta la comanda en kitchen y
        // sobrevive a retomar la cuenta (antes solo vivía en `prodCats`, en memoria).
        category_id: this.primaryCategory(p4.id),
        // pm#93: solo los ids, en su orden de elección.
        ...picks.length ? { modifiers: picks } : {},
        // sales#89: viaja hasta `complete_sale`, que por él no mide la línea contra el catálogo de
        // `inventory` ni le descuenta stock, y hasta `sale.completed`, donde `inventory` la salta.
        ...p4.is_service ? { is_service: true } : {},
        ...this.frozenUnitContext(p4)
      };
      await this.pushNewLine(line);
    } catch (e7) {
      const transportKey = transportErrorKey(e7);
      const msg = transportKey ? t5(transportKey) : e7 instanceof Error ? e7.message : String(e7);
      this.error = msg;
      erplora2().notify?.({ type: "error", message: msg });
    }
  }
  /** Añade la línea del MENÚ. Hermana de `addNow`, con su propia fusión: dos menús con segundo
   *  distinto NO son la misma línea (la composición entra en la identidad, igual que los
   *  suplementos en pm#93), o cocina recibiría «2 × Menú del día» y uno de los dos mal.
   *
   *  `price` es el PREVIEW que se acaba de enseñar; el servidor lo ignora y recalcula. */
  async addComboLine(combo, choices, previewCents) {
    const want = choices.map((c5) => c5.option_id).join("\0");
    const ex = this.cart.find(
      (l3) => l3.combo_id === combo.combo_id && !l3.is_gift && (l3.combo_choices ?? []).map((c5) => c5.option_id).join("\0") === want
    );
    const tax_rate = resolveLineTax(this.taxCatalog.rates, combo.tax_category_key);
    try {
      if (ex) {
        const qty = ex.qty + 1;
        this.cart = this.cart.map((l3) => l3 === ex ? { ...l3, qty } : l3);
        if (this.orderId && !await persistLineQty(erplora2(), this.orderId, ex, qty)) {
          this.cart = this.cart.map((l3) => l3 === ex ? { ...l3, qty: ex.qty } : l3);
        }
        return;
      }
      await this.pushNewLine({
        id: combo.combo_id,
        name: combo.name,
        price: previewCents,
        qty: 1,
        tax_category_key: combo.tax_category_key,
        tax_rate,
        cost: 0,
        combo_id: combo.combo_id,
        combo_choices: choices
      });
    } catch (e7) {
      const transportKey = transportErrorKey(e7);
      const msg = transportKey ? t5(transportKey) : e7 instanceof Error ? e7.message : String(e7);
      this.error = msg;
      erplora2().notify?.({ type: "error", message: msg });
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
      await updateOrderLineQty(erplora2(), this.orderId, ex.line_id, ex.qty, ex.price, is_gift, gift_reason ?? "", ex.discount ?? 0);
    }
  }
  /** Contexto de unidades CONGELADO desde el maestro (ADR-0147 §2.4): unidad de la línea, su
   *  incremento y la cantidad de precio (KPEIN). Sin registro/unidad → unidad suelta implícita. */
  frozenUnitContext(p4) {
    const u5 = p4.unit_code ? this.units.get(p4.unit_code) : void 0;
    if (!u5) return {};
    return {
      unit_code: u5.code,
      unit_name: u5.name || "",
      factor_num: Number(u5.factor_num) || 1,
      factor_den: Number(u5.factor_den) || 1,
      increment_value: Number(u5.increment_value) || void 0,
      price_quantity_value: Number(p4.price_quantity_value) || void 0,
      pricing_unit_code: p4.pricing_unit_code || u5.code
    };
  }
  /** Paso del stepper de una línea: el incremento congelado de su unidad (1 para `ud`). */
  stepOf(l3) {
    return l3.increment_value ? fromMicro2(l3.increment_value) : 1;
  }
  /** Fija la cantidad de una línea (desde ok-qty-stepper); al llegar a 0 la línea se elimina. */
  async setQtyAbs(id, v3, stepper) {
    const ex = this.cart.find((l3) => l3.id === id);
    if (!ex) return;
    const qtyMicro = toMicro2(Math.max(0, v3));
    if (!onGrid2(qtyMicro, ex.increment_value ?? 0)) {
      this.error = `${t5("ui.qtyOffGrid")} (${formatQuantity2(ex.increment_value ?? 0)} ${ex.unit_code ?? ""})`.trim();
      if (stepper) {
        await stepper.updateComplete;
        stepper.value = ex.qty;
      }
      return;
    }
    const qty = fromMicro2(qtyMicro);
    this.cart = qty > 0 ? this.cart.map((l3) => l3 === ex ? { ...l3, qty } : l3) : this.cart.filter((l3) => l3 !== ex);
    if (!this.orderId || !ex.line_id) return;
    if (qty > 0) await updateOrderLineQty(erplora2(), this.orderId, ex.line_id, qty, ex.price, ex.is_gift, void 0, ex.discount ?? 0);
    else await removeOrderLine(erplora2(), this.orderId, ex.line_id);
  }
  /** Imprime la CUENTA que se lleva a la mesa (no fiscal, ADR-0141).
   *
   *  Sale por la puerta GLOBAL del hub (`erplora.print`): impresora del rol `receipt` si la hay,
   *  cola del hub si no, y el diálogo del navegador como último respaldo. NO se imprime el DOM de
   *  la app —el papel vive en un ion-modal reparentado con shadow DOM y salía la app entera— sino
   *  el HTML PLANO en un iframe aislado.
   *
   *  Van DOS documentos con el mismo contenido y distinta forma, y confundirlos era el fallo
   *  (sales#78): el HTML plano es lo que imprime un navegador, y `data` es lo que lee el
   *  renderizador ESC/POS, que busca POR CLAVE (`items`, `business_name`) y con la forma de
   *  pantalla no falla —saca «ERPlora», sin líneas y TOTAL 0,00—. El `jobId` no es opcional: sin él
   *  la puerta ni intenta la cola del hub, y cambia con la cuenta para que una segunda ronda no se
   *  trague como duplicado. */
  /** Trae el catálogo de suplementos si la cuenta lo necesita (sales#148).
   *
   *  Solo cuando alguna línea lleva suplementos: en el 99 % de las cuentas de un TPV no hay
   *  ninguno, y cobrarle una lectura de más a ese 99 % por una integración accesoria es empeorar
   *  el producto para casi todo el mundo — el mismo criterio que `addWithModifiers`.
   *
   *  Lectura OPCIONAL (ADR-0127): si `modifiers` no está instalado no hay nada que resolver y la
   *  cuenta se imprime igual, con el id en lugar del nombre. Un papel feo es preferible a un cobro
   *  que el cliente no puede leer, que es justo el fallo que esta issue arregla. */
  async loadModifierCatalog() {
    if (!this.cart.some((l3) => l3.modifiers?.length)) return;
    const rows3 = await optionalRead((c5) => c5.queryOptional("modifiers.options.all", {}));
    if (!Array.isArray(rows3)) return;
    const map = /* @__PURE__ */ new Map();
    for (const raw of rows3) {
      const r6 = raw;
      const option_id = String(r6.option_id ?? "");
      if (!option_id) continue;
      const name = String(r6.name ?? "");
      const delta = Number(r6.price_delta);
      map.set(option_id, {
        option_id,
        ...name ? { name } : {},
        ...Number.isFinite(delta) ? { price_delta: delta } : {}
      });
    }
    this.modifierCatalog = map;
  }
  /** Los suplementos de una línea, con el nombre que el cliente debe leer. Sin resolver queda el
   *  id: la línea sale fea, pero sale. */
  resolvedModifiers(l3) {
    if (!l3.modifiers?.length) return void 0;
    return l3.modifiers.map((m4) => {
      const named = this.modifierCatalog.get(m4.option_id) ?? { option_id: m4.option_id };
      return m4.price_delta != null ? { ...named, price_delta: m4.price_delta } : named;
    });
  }
  /** El carrito en la forma de la CUENTA. Una sola fuente para el papel y para la pantalla del
   *  modal: si cada uno compusiera la suya, el camarero vería algo distinto de lo que imprime. */
  prebillLines() {
    return this.cart.map((l3) => ({
      name: l3.name,
      price: l3.price,
      qty: l3.qty,
      is_gift: l3.is_gift,
      unit_code: l3.unit_code,
      unit_name: l3.unit_name,
      // sales#180: and its VAT rate (the same PREVIEW the cart line already carries), so the bill
      // breaks the rates down the way Toast and Lightspeed do on a pre-bill. The real rate is
      // resolved by the server on checkout (ADR-0085); that does not change.
      tax_rate: l3.tax_rate,
      // sales#148: y sus suplementos, o el cliente paga un «+ queso» que su papel no nombra.
      ...this.resolvedModifiers(l3) ? { modifiers: this.resolvedModifiers(l3) } : {},
      // sales#154: y la composición del menú, o la cuenta dice «Menú del día» sin decir cuál.
      ...this.prebillCombo(l3) ? { combo: this.prebillCombo(l3) } : {},
      // sales#156: and its note, or the bill taken to the table says less than the ticket the
      // kitchen got — the customer reads one thing while the pass cooked another.
      ...l3.note ? { note: l3.note } : {}
    }));
  }
  /** The menu of a cart line as the bill prints it (sales#154): the components with the display
   *  name resolved when they were picked, and the supplement of each one from the combo catalogue
   *  the till already holds — never from the browser's arithmetic. A line that is not a menu yields
   *  nothing, so the bill of always does not change. */
  prebillCombo(l3) {
    if (!l3.combo_id) return void 0;
    const combo = this.comboCatalog.find((c5) => c5.combo_id === l3.combo_id);
    const options = new Map(combo?.groups.flatMap((g3) => g3.options).map((o9) => [o9.option_id, o9]) ?? []);
    return {
      name: l3.name,
      components: (l3.combo_choices ?? []).map((c5) => {
        const delta = options.get(c5.option_id)?.price_delta;
        return {
          option_id: c5.option_id,
          ...c5.product_name ? { name: c5.product_name } : {},
          ...delta ? { price_delta: delta } : {}
        };
      })
    };
  }
  /** The settings the BILL is built from: the till's, plus the business's LEGAL name, which heads
   *  the paper when there is no deliberate ticket header (sales#180). The currency scale is not
   *  passed: the mapper reads it from the SDK itself (`hubDecimals`). */
  get billSettings() {
    return { ...this.settings, issuer_name: this.businessName };
  }
  /** Whose bill this is: the TABLE when the order is a dine-in one, the customer otherwise. It is
   *  what goes in the only labelled meta slot `<ok-receipt>` has, and its label follows from it. */
  get billWho() {
    return {
      tableLabel: this.tableLabel || void 0,
      customerName: this.customerName || void 0,
      title: t5("ui.prebillTitle"),
      notice: t5("ui.prebillNotice"),
      fallbackName: t5("ui.docDefaultBusiness")
    };
  }
  /** The BILL on screen. It is composed once -- not twice in the template -- because both the
   *  document and the LABEL of its meta slot come out of it: `<ok-receipt>` labels that slot with
   *  `labels.customer`, and on a dine-in bill what sits there is the TABLE (sales#180). Until the
   *  element has a slot of its own for the table (ERPlora/outfitkit#87), the document decides the
   *  label. */
  /** sales#164 — the hub's valuation, BUT only when it priced the same thing this paper shows.
   *
   *  The bill is for the WHOLE table; the valuation is for the charge in progress, which with a
   *  line selection (ADR-0146) or a per-line redemption (sales#162) is a subset. Putting a total
   *  for something else there would be worse than composing it on screen, so in that case it is
   *  not passed and the paper comes out as it did. */
  get prebillValuation() {
    if (this.splitSel.size || this.covered.size) return void 0;
    return this.authoritative;
  }
  renderPrebillDoc() {
    const doc = orderToPrebill(this.prebillLines(), this.billSettings, this.billWho, this.prebillValuation);
    return b2`<ok-receipt id="prebill-doc" .receipt=${doc} .labels=${receiptLabels(t5, doc)}></ok-receipt>`;
  }
  async printPrebill() {
    await this.loadModifierCatalog();
    const lines = this.prebillLines();
    const opts = this.billWho;
    const settings = this.billSettings;
    const valuation = this.prebillValuation;
    const doc = orderToPrebill(lines, settings, opts, valuation);
    const html = receiptToPrintableHtml({
      ...doc,
      // sales#180: and the paper labels that datum for what it is -- "Table: S1", not a bare "S1".
      customer_label: doc.customer ? doc.customer_is_table ? t5("ui.docTable") : t5("ui.docCustomer") : void 0,
      // sales#120: el papel de la cuenta sale en el idioma del hub (labels, no plantilla).
      labels: { subtotal: t5("ui.docSubtotal"), total: t5("ui.docTotal"), change: t5("ui.docChange"), document: t5("ui.document") }
    });
    const sdk = globalThis.erplora;
    if (!sdk?.print) {
      printHtmlInIframe(html);
      return;
    }
    const res = await sdk.print({
      role: "receipt",
      documentType: "prebill",
      jobId: prebillJobId(this.orderId, lines),
      data: prebillToPrintDocument(lines, settings, opts, valuation),
      html
    }).catch((e7) => ({ via: "none", error: e7 instanceof Error ? e7.message : String(e7) }));
    if (res?.via === "bridge" || res?.via === "queue") return;
    erplora2().notify?.({
      type: "error",
      message: res?.error ? `${t5("ui.prebillPrintFailed")}: ${res.error}` : t5("ui.prebillPrintFailed")
    });
  }
  /** Marca/desmarca una línea para el cobro por partes. Solo tiene sentido con más de una línea:
   *  con una sola, «lo suyo» y «la cuenta» son lo mismo. */
  toggleSplit(l3) {
    if (!l3.line_id || this.cart.length < 2) return;
    const s5 = new Set(this.splitSel);
    if (s5.has(l3.line_id)) s5.delete(l3.line_id);
    else s5.add(l3.line_id);
    this.splitSel = s5;
  }
  openPay() {
    if (!this.cart.length) return;
    if (this.missingChargeApp) {
      this.notifyShell(t5("ui.missingAppCharge", { app: this.chargeAppName }));
      return;
    }
    if (this.missingRequiredCustomer) {
      this.askForCustomer();
      return;
    }
    this.checkoutKey = newIdempotencyKey();
    this.tendered = "";
    this.padPrimed = false;
    this.splitting = false;
    this.tenders = [];
    this.payMethod = defaultPayMethod(this.payMethods);
    this.docFormat = this.defaultDocFormat;
    if (this.overSimplifiedLimit) this.docFormat = "invoice";
    this.paying = true;
    this.dropValuation();
    void this.refreshValuation();
  }
  /**
   * Con qué formato se ABRE el cobro (hub#962).
   *
   * `auto_invoice_with_tax_id` llevaba desde su alta guardándose sin que lo leyera nadie: un
   * interruptor que no hace nada es peor que no tener interruptor, porque el comercio cree haber
   * pedido algo. Lo que dice es exactamente esto — «si el cliente se ha identificado con su NIF, es
   * que quiere factura» — y es la regla que aplican Odoo, Holded y los TPV españoles: quien da su
   * NIF en el mostrador no lo da por gusto.
   *
   * No decide sobre el techo: por encima, `openPay` fuerza factura igual, porque ahí no es una
   * preferencia del comercio sino la ley.
   */
  get defaultDocFormat() {
    if (this.settings.default_document_format === "invoice") return "invoice";
    const auto = this.settings.auto_invoice_with_tax_id;
    if ((auto === 1 || auto === true) && this.customerTaxId.trim()) return "invoice";
    return "ticket";
  }
  /**
   * ¿Hay algo que elegir? (hub#962) Por encima del techo de la simplificada, **no**: la venta sale
   * en factura por ley, y ofrecer un botón que devuelve a tique sería ofrecer romperla. Se oculta
   * en vez de deshabilitarse porque un control apagado y sin motivo se lee como una avería.
   */
  get canChooseDocFormat() {
    return !this.overSimplifiedLimit;
  }
  /** El cajero elige. Por encima del techo no se admite volver a tique (ver `canChooseDocFormat`). */
  chooseDocFormat(next) {
    if (next === "ticket" && this.overSimplifiedLimit) return;
    this.docFormat = next;
  }
  /** ¿Este cobro pasa del techo de la simplificada? (independiente de quién sea el cliente). */
  get overSimplifiedLimit() {
    return isOverSimplifiedLimit(this.payable, this.simplifiedMaxCents);
  }
  /** Lo que el TPV le puede pedir al mostrador, reunido para no repetirlo en tres sitios. */
  get limitState() {
    return {
      payableCents: this.payable,
      maxCents: this.simplifiedMaxCents,
      documentFormat: this.docFormat,
      customerName: this.customerName,
      customerTaxId: this.customerTaxId,
      customerAddress: this.customerAddress
    };
  }
  /** ¿Se puede cerrar este cobro tal y como está? Ver `lib/simplified-limit.ts`. */
  get chargeBlocked() {
    return ticketIsBlocked(this.limitState);
  }
  /** 🔴 Re-asserts the state of the charge buttons in the DOM AFTER every paint.
   *
   *  Measured in a real browser (`erplora dev` + CDP, sales#185), not deduced: on an `ion-button`
   *  neither `aria-disabled` nor a class set by Lit survives. Ionic (Stencil) takes the host over
   *  on hydration — it steals the `aria-*` and rewrites `className` with its own
   *  (`md button button-solid …`) — and Lit never writes either of them again: its `AttributePart`
   *  caches the last value it emitted, sees it has not changed and skips the write. Measured
   *  result: the block vanished from the DOM and from the colour as soon as the first line was
   *  added. It is the sales#58 hole through another door, and happy-dom cannot show it because
   *  Ionic does not hydrate there.
   *
   *  That is why the state is written HERE and not in the template, and with `classList`
   *  (surgical) instead of `class=` (which would wipe Ionic's own classes). It decides nothing the
   *  screen does not already say: it only stops the DOM from saying something else. It covers the
   *  sheet's button too (sales#159), which carried the same defect. */
  syncChargeState() {
    const blocked = [
      [".foot-actions ion-button.charge", !!this.missingChargeApp || this.missingRequiredCustomer],
      [".sheet-foot ion-button.charge", this.paying && !!this.chargeBlock]
    ];
    for (const [selector, isBlocked] of blocked) {
      const btn = this.renderRoot.querySelector(selector);
      if (!btn) continue;
      if (isBlocked) btn.setAttribute("aria-disabled", "true");
      else btn.removeAttribute("aria-disabled");
      btn.classList.toggle("blocked", isBlocked);
    }
  }
  willUpdate(changed) {
    if (changed.has("orderId") && !this.orderId) {
      this.ticketDiscount = 0;
      this.ticketDiscountAmount = 0;
    }
  }
  /** El teclado. Tras traer una pata a editar el importe queda CEBADO: la siguiente tecla lo
   *  sustituye en vez de encadenarse a él (50,00 + «6» daría 50,006, que no es un importe). Es como
   *  se comporta el teclado de cualquier TPV o calculadora tras un resultado. */
  tap(k2) {
    const base = this.padPrimed ? "" : this.tendered;
    this.padPrimed = false;
    this.tendered = pushDigit(base, k2);
  }
  // ── sales#156 · the LINE NOTE ──────────────────────────────────────────────────────────────
  //
  // Market shape (8 refs + forums, table in the PR): a button on the SELECTED LINE, next to the
  // supplements and the comp — Toast's "Special Request", Square's per-item Notes, Lightspeed's
  // line note, Odoo's "Customer Note", Clover's `lineItem.note`, Revel's special requests. Shopify
  // POS is the odd one out (order-level only, per line needs an app) and it loses: a note on the
  // ORDER does not say which plate it is about, which is the one thing the kitchen needs.
  /** Opens the sheet with the note the line ALREADY has: reopening to CORRECT is half the use,
   *  and a blank sheet would force retyping the whole allergy just to add a word to it. */
  openLineNote(lineId) {
    this.noteInput = this.cart.find((l3) => l3.line_id === lineId)?.note ?? "";
    this.noteSheet = { lineId };
    if (this.quickNotesState === "idle") void this.loadQuickNotes();
  }
  // ── sales#206 · the QUICK NOTES the business preconfigured ─────────────────────────────────
  //
  // Market shape (8 refs + forums, table in the PR): only Lightspeed Restaurant (K-Series) ships
  // this as a feature — notes created in the Back Office (add/edit/delete/reorder), applied with
  // one tap on the POS, printed on the docket and shown on the KDS. Toast, Square, Clover, Revel,
  // Simphony and SumUp give free text only, Odoo needs its configuration/app and Shopify POS needs
  // an app. So we copy Lightspeed, and only the part that survives our contract: the line carries
  // ONE note, so several chips COMPOSE that one string instead of several notes.
  /** Reads the catalogue through the till's own door.
   *
   *  `sales.quick_notes.list` reads with `sales.view_sale` and NOT with `sales.manage_settings`
   *  for the same reason `sales.pos_settings.get` exists (sales#205): the people tapping these
   *  chips are the `cashier` and the `employee`, and neither holds `manage_settings` — behind it
   *  the chips would be painted for whoever configured them and for nobody at the till. */
  async loadQuickNotes() {
    this.quickNotesState = "loading";
    try {
      this.quickNotes = rows2(
        await erplora2().queryAll("sales.quick_notes.list", { sort: "sort_order", dir: "asc" })
      ).slice().sort((a3, b3) => Number(a3.sort_order ?? 0) - Number(b3.sort_order ?? 0) || a3.text.localeCompare(b3.text));
      this.quickNotesState = "ready";
    } catch {
      this.quickNotes = [];
      this.quickNotesState = "error";
    }
  }
  /** A chip ADDS its text to what is in the box, and takes it out if it is already there. */
  toggleQuickNoteChip(text) {
    this.noteInput = toggleQuickNote(this.noteInput, text);
  }
  /** Saves the note on the line and on its order row. Empty (or whitespace only) REMOVES it: a
   *  note that cannot be deleted leaves the kitchen cooking to a request that was cancelled. */
  async applyLineNote(note) {
    const sheet = this.noteSheet;
    this.noteSheet = void 0;
    if (!sheet) return;
    const line = this.cart.find((l3) => l3.line_id === sheet.lineId);
    if (!line) return;
    const clean = note.trim();
    this.cart = this.cart.map((l3) => l3 === line ? { ...l3, note: clean || void 0 } : l3);
    if (this.orderId) {
      try {
        await updateOrderLineNote(erplora2(), this.orderId, line, clean);
      } catch (e7) {
        this.error = e7 instanceof Error ? e7.message : String(e7);
      }
    }
  }
  // ── sales#71 · descuentos manuales ─────────────────────────────────────────────────────────
  openDiscount(target, lineId) {
    this.discountMode = target === "ticket" && this.ticketDiscountAmount > 0 && this.ticketDiscount === 0 ? "amount" : "percent";
    const current = target === "ticket" ? this.discountMode === "amount" ? Number(centsToEuros(this.ticketDiscountAmount)) : this.ticketDiscount : this.cart.find((l3) => l3.line_id === lineId)?.discount ?? 0;
    this.discountInput = current > 0 ? String(current) : "";
    this.discountSheet = { target, lineId };
  }
  setDiscountMode(mode) {
    if (mode === this.discountMode) return;
    this.discountMode = mode;
    this.discountInput = "";
  }
  tapDiscount(k2) {
    const next = pushDigit(this.discountInput, k2);
    if (this.discountMode === "amount" || Number(next || "0") <= 100) this.discountInput = next;
  }
  /** Importe tecleado en céntimos (modo €). */
  get discountInputCents() {
    return Math.max(0, eurosToCents(this.discountInput || "0"));
  }
  /** sales#113 — aplica un importe FIJO (céntimos; 0 = quitar) al ticket, persistiéndolo en el pedido. */
  async applyDiscountAmount(cents2) {
    const sheet = this.discountSheet;
    this.discountSheet = void 0;
    if (!sheet || sheet.target !== "ticket") return;
    const value = Math.max(0, Math.round(cents2));
    this.ticketDiscountAmount = value;
    if (this.orderId) {
      try {
        await erplora2().command("sales.order.set_discount", { order_id: this.orderId, discount_percent: this.ticketDiscount, discount_amount: value });
      } catch (e7) {
        this.error = e7 instanceof Error ? e7.message : String(e7);
      }
    }
  }
  get discountInputPct() {
    return Math.min(100, Math.max(0, Number(this.discountInput || "0")));
  }
  /** Aplica el % tecleado (0 = quitar) a la línea o al ticket, persistiéndolo en el pedido. */
  async applyDiscount(pct) {
    const sheet = this.discountSheet;
    this.discountSheet = void 0;
    if (!sheet) return;
    const value = Math.min(100, Math.max(0, pct));
    if (sheet.target === "ticket") {
      this.ticketDiscount = value;
      if (this.orderId) {
        try {
          await erplora2().command("sales.order.set_discount", { order_id: this.orderId, discount_percent: value, discount_amount: this.ticketDiscountAmount });
        } catch (e7) {
          this.error = e7 instanceof Error ? e7.message : String(e7);
        }
      }
      return;
    }
    const line = this.cart.find((l3) => l3.line_id === sheet.lineId);
    if (!line) return;
    const discount = value > 0 ? value : void 0;
    this.cart = this.cart.map((l3) => l3 === line ? { ...l3, discount } : l3);
    if (this.orderId && line.line_id) {
      try {
        await updateOrderLineDiscount(erplora2(), this.orderId, { ...line, discount }, value);
      } catch (e7) {
        this.error = e7 instanceof Error ? e7.message : String(e7);
      }
    }
  }
  // El pinpad teclea EUROS («20» = 20 €); el contrato de la venta es CÉNTIMOS (ADR-0007/0123),
  // como `total`. Sin esta conversión: «Efectivo 0.20 €» y cambio 0 en el tiquet (QA 2026-07-17).
  get tenderedNum() {
    return eurosToCents(this.tendered || "0");
  }
  get change() {
    return Math.max(0, this.tenderedNum - this.payable);
  }
  /** sales#24 — cash typed in but SHORT of the payable. 0 (nothing typed) means «exact amount»;
   *  the server refuses the same case (`sales.insufficient_tendered`), this just spares the trip. */
  get tenderedShort() {
    if (this.splitting) return false;
    return needsTendered(this.payMethod) && this.tenderedNum > 0 && this.tenderedNum < this.payable;
  }
  // ── sales#159 · pagar UNA venta de N formas (ADR-0386) ─────────────────────────────────────
  /** Lo que queda por cubrir, en céntimos. Sin patas es la cuenta entera. */
  get remaining() {
    return remainingCents(this.payable, this.tenders);
  }
  /** La pata que se tomaría AHORA con lo elegido y lo tecleado. `undefined` = no hay nada que añadir. */
  get pendingTender() {
    return planTender(this.payMethod, this.tenderedNum, this.remaining);
  }
  /** El cambio del reparto: sale del EFECTIVO y nunca se prorratea (ADR-0386, decisión 2). Incluye
   *  la pata pendiente para que el cajero vea lo que va a devolver ANTES de tomarla. */
  get splitChange() {
    const pending = this.pendingTender;
    const legs = pending && this.payMethod ? [...this.tenders, { id: "pending", method: this.payMethod, ...pending }] : this.tenders;
    return changeDue(legs);
  }
  /** Empieza a repartir. No toma ninguna pata: abre la pantalla que las toma. */
  startSplit() {
    if (this.payable <= 0) return;
    this.splitting = true;
    this.error = "";
  }
  /** Toma la pata que hay compuesta (método + importe tecleado) y deja el resto por cubrir.
   *  Sin importe tecleado la pata cubre TODO el restante: es lo que hace que la última sea un solo
   *  toque, y lo que evita el atasco de Shopify con 3+ medios. */
  addTender() {
    const plan = this.pendingTender;
    if (!plan || !this.payMethod) return;
    this.tenders = [...this.tenders, { id: `tender-${this.tenderSeq += 1}`, method: this.payMethod, ...plan }];
    this.tendered = "";
    this.padPrimed = false;
    this.error = "";
  }
  /** Quita una pata: su importe vuelve al restante. */
  removeTender(id) {
    this.tenders = this.tenders.filter((t7) => t7.id !== id);
    this.error = "";
  }
  /** Edita una pata: vuelve al teclado con su importe y su método, para volver a tomarla. Es la
   *  edición más honesta en una pantalla táctil — un campo de texto dentro de una lista de filas se
   *  falla con el dedo, y aquí ya hay un teclado grande al que devolverla. */
  editTender(id) {
    const leg = this.tenders.find((t7) => t7.id === id);
    if (!leg) return;
    this.tenders = this.tenders.filter((t7) => t7.id !== id);
    this.payMethod = leg.method;
    this.tendered = centsToEuros(leg.tendered);
    this.padPrimed = true;
    this.error = "";
  }
  /** The name of the missing app, as the business sees it in the marketplace.
   *
   *  It is translated (`ui.appTaxes`) because the id (`taxes`) is a technical key and the notice is
   *  read by a cashier, not by an integrator. With no translation for an id we do not know it
   *  falls back to the id: saying `taxes` is ugly, but it is true — inventing a name would not
   *  be. */
  get chargeAppName() {
    return this.missingChargeApp ? this.appName(this.missingChargeApp) : "";
  }
  /** The same translation for any app id the till has to name (sales#25). */
  appName(id) {
    const key = `ui.app${id.charAt(0).toUpperCase()}${id.slice(1)}`;
    const name = t5(key);
    return name === key ? id : name;
  }
  /** POR QUÉ no se puede cobrar todavía, en palabras. `undefined` = se puede.
   *
   *  🔴 Esto NO se resuelve con el `disabled` nativo de Ionic. `disabled` es `pointer-events:none`:
   *  en una pantalla táctil el toque no llega a nada, no corre ningún handler, no se registra nada,
   *  y el motivo se queda en `title` — que necesita un hover que una tablet de mostrador no produce
   *  jamás. Es el bug de sales#58 y no vuelve por el botón más importante de la pantalla. */
  get chargeBlock() {
    if (this.missingChargeApp) {
      return {
        short: t5("ui.missingAppChargeShort", { app: this.chargeAppName }),
        reason: t5("ui.missingAppCharge", { app: this.chargeAppName })
      };
    }
    if (this.missingRequiredCustomer) {
      return { short: t5("ui.customerRequiredShort"), reason: t5("ui.customerRequiredCharge") };
    }
    if (this.chargeBlocked) {
      return { short: t5("ui.limitChargeBlocked"), reason: "" };
    }
    const split = chargeBlock(this.payable, this.tenders);
    if (split) {
      const amount = this.money(split.remaining);
      return { short: t5("ui.tenderRemainingShort", { amount }), reason: t5("ui.tenderRemainingBlock", { amount }) };
    }
    if (this.tenderedShort) return { short: t5("ui.tenderedShort"), reason: t5("ui.tenderedShort") };
    return void 0;
  }
  /** Las líneas que entran en ESTE cobro: la selección si la hay, o la cuenta entera (ADR-0146). */
  get billedLines() {
    return this.splitSel.size ? this.cart.filter((l3) => l3.line_id && this.splitSel.has(l3.line_id)) : this.cart;
  }
  /** De esas, las que todavía se cobran en DINERO: un tender externo pudo cubrir alguna entera
   *  (sales#162). Es la lista que decide el importe en pantalla y la que el servidor recalcula. */
  get chargedLines() {
    return uncoveredLines(this.billedLines, new Set(this.covered.keys()));
  }
  /** Líneas del cobro a las que se les puede OFRECER un tender externo por línea. Vacío cuando
   *  nadie hospeda el slot, cuando no hay cliente asignado (sin cliente no hay bono que ofrecer) o
   *  cuando el pedido aún no existe: `checkout_ref` es lo que deja liquidar el canje por evento. */
  get tenderLines() {
    if (!this.tenderFillers.length || !this.customerId || !this.orderId) return [];
    return tenderableLines(this.billedLines);
  }
  /** What is being charged NOW: the selection when there is one, or the whole check (ADR-0146).
   *
   *  🔴 sales#164 — THE SERVER RULES. This number decides the legs of a mixed payment, the change,
   *  the simplified-invoice ceiling and what the button promises, so it has to be the same one
   *  `complete_sale` is going to charge: with prices that do NOT carry the VAT inside, the screen's
   *  arithmetic showed the BASE and the drawer took base + quota (100.00 € → 121.00 €); and with a
   *  fixed-amount discount, a quantity by weight or a goods set menu split across rates the two
   *  drifted by a cent, which is exactly what fires `sales.payments_do_not_match_total`.
   *
   *  With no authoritative answer it falls back to the screen's own preview — what there was
   *  before, which charges the normal case right — and the server's refusal goes back to being a
   *  net, which is its place. */
  get payable() {
    if (this.authoritative) return this.authoritative.total;
    return this.screenPayable;
  }
  /** What THIS screen works out on its own. Only used while there is no answer from the server,
   *  and it is what the till always used before sales#164. */
  get screenPayable() {
    const base = cartTotal(this.chargedLines, this.ticketDiscount);
    return Math.max(0, base - (this.splitSel.size ? 0 : this.ticketDiscountAmount));
  }
  /** The ticket to price: EXACTLY the one that will be charged (`billedLines`, with the lines an
   *  external tender covered flagged so the server prices them at 0). */
  get checkoutShape() {
    return {
      lines: this.billedLines,
      ticketDiscount: this.ticketDiscount,
      ticketDiscountAmount: this.ticketDiscountAmount,
      covered: new Set(this.covered.keys()),
      taxIncluded: this.settings.default_tax_included !== 0,
      partial: this.splitSel.size > 0
    };
  }
  /** Asks the hub to price the ticket, if needed. Cheap to call on every repaint: it only goes to
   *  the network when something that MOVES the total changes (`previewSignature`).
   *
   *  It is only asked with the charge or the bill on screen: the valuation reads the whole sale
   *  catalogue, and doing it on every tap of the grid would put the till behind the network while
   *  nobody is looking at the number yet. */
  async refreshValuation() {
    const shape = this.checkoutShape;
    const signature = previewSignature(shape);
    if (signature === this.valuedSignature) return;
    this.valuedSignature = signature;
    const seq2 = ++this.valuationSeq;
    try {
      const valued = await fetchCheckoutPreview(erplora2(), shape, {
        primaryCategory: (id) => this.primaryCategory(id),
        orderId: this.orderId
      });
      if (seq2 !== this.valuationSeq) return;
      this.authoritative = valued;
    } catch {
      if (seq2 !== this.valuationSeq) return;
      this.authoritative = void 0;
    }
  }
  /** Forgets the valuation: the ticket left the screen, or it has just been charged. */
  dropValuation() {
    this.valuationSeq += 1;
    this.valuedSignature = "";
    this.authoritative = void 0;
  }
  // ── Precio libre / venta por DEPARTAMENTO (fuera de catálogo) ──────────────────────────────
  /** Abre la pregunta del importe. Sin argumentos es la tecla suelta «Precio libre» (en blanco);
   *  con ellos viene de un SERVICIO de precio no cerrado y arranca sugerido (services#12).
   *  `0` no se sugiere: un «desde 0 €» no es una pista, es ruido en la casilla. */
  openOpenPrice(seed) {
    const cents2 = seed?.amountCents ?? 0;
    this.openAmount = cents2 > 0 ? centsToEuros(cents2) : "";
    this.openDept = seed?.deptKey ?? "";
    this.openPriceOpen = true;
  }
  tapOpen(k2) {
    this.openAmount = pushDigit(this.openAmount, k2);
  }
  /** El numpad teclea EUROS; el contrato es CÉNTIMOS (ADR-0007), igual que en el cobro. */
  get openAmountCents() {
    return eurosToCents(this.openAmount || "0");
  }
  /** El % del departamento para pintarlo junto a su nombre; vacío si taxes no dio reglas (preview). */
  deptRateLabel(key) {
    const rates = this.taxCatalog.rates;
    return rates.has(key) ? `${rates.get(key)}%` : "";
  }
  /** Añade la venta libre: nombre = el del DEPARTAMENTO (estilo frutería, sin teclear), precio
   *  tecleado y su categoría fiscal. Nunca fusiona → siempre línea nueva (`pushNewLine`, serializada
   *  por `queue` como el resto del carrito). `buildOpenPriceLine` valida que no sea línea desnuda.
   *  sales#120: el nombre congelado es el del idioma del HUB (`display_name`, taxes#38) — es el que
   *  persiste como `product_name` y el que el cliente se lleva en el tique impreso; la IDENTIDAD
   *  fiscal sigue siendo `key`. */
  async addOpenPrice() {
    const dept = this.taxCategories.find((c5) => c5.key === this.openDept);
    if (!dept || this.openAmountCents <= 0) return;
    const line = buildOpenPriceLine({ name: deptDisplayName(dept), priceCents: this.openAmountCents, taxCategoryKey: dept.key });
    line.tax_rate = resolveLineTax(this.taxCatalog.rates, dept.key);
    this.openPriceOpen = false;
    try {
      await this.queue(() => this.pushOpenPriceLine(line));
    } catch (e7) {
      this.error = e7 instanceof Error ? e7.message : String(e7);
    }
  }
  /** Cierra la venta. La IMPRESIÓN no se dispara desde aquí: la hace el shell por el Bridge al
   *  recibir `sale.completed` (ajuste `auto_print_on_sale`). El toggle de la pantalla de cobro
   *  refleja esa preferencia; el diálogo del navegador solo aparece como respaldo manual. */
  async confirm(_print = false) {
    if (this.chargeBlocked) {
      this.docFormat = "invoice";
      this.paying = true;
      return;
    }
    const block = this.chargeBlock;
    if (block) {
      this.paying = true;
      this.notifyShell(block.reason || block.short);
      return;
    }
    this.busy = true;
    this.error = "";
    this.checkoutUnknown = false;
    if (!this.checkoutKey) this.checkoutKey = newIdempotencyKey();
    const checkoutKey = this.checkoutKey;
    const split = splitPayload(this.cart, this.splitSel);
    try {
      const cobradas = this.billedLines;
      const items = checkoutItems(cobradas, {
        covered: new Set(this.covered.keys()),
        primaryCategory: (id) => this.primaryCategory(id)
      });
      await erplora2().command("sales.complete_sale", {
        items,
        // sales#71: descuento de TICKET (%); el servidor lo prorratea por línea antes del IVA.
        discount_percent: this.ticketDiscount,
        // sales#113: importe FIJO (céntimos), repartido por resto mayor en el servidor (ADR-0210).
        // Con split (cobro parcial) no se manda: se aplica al cerrar la cuenta entera.
        ...this.ticketDiscountAmount > 0 && !split.line_ids ? { discount_amount: this.ticketDiscountAmount } : {},
        // sales#20: el servidor no cierra una venta sin clave, y con la misma clave dos veces
        // registra UNA. Es lo que hace seguro reintentar cuando el wifi del local parpadea.
        idempotency_key: checkoutKey,
        line_ids: split.line_ids ?? null,
        keep_order_open: split.keep_order_open,
        tax_included: this.settings.default_tax_included !== 0,
        payment_method_id: this.payMethod?.id ?? null,
        // El nombre viaja al tiquet: el de fábrica va traducido (seed canónico EN → i18n).
        // sales#108: the CANONICAL name travels (the server persists the catalogue row's name anyway,
        // ADR-0085); the ticket and the list translate it when they paint it.
        payment_method_name: this.payMethod?.name ?? "",
        // Sin entregado tecleado (tarjeta, importe justo) se cobra el PAYABLE: con split, caer al
        // total inflaba lo entregado y el cambio del tiquet.
        // sales#24: viaja SOLO lo que la cajera TECLEA. Sin nada tecleado (o con tarjeta) es importe
        // exacto y lo decide el servidor: el `payable` de pantalla es un preview que puede quedar por
        // debajo del total real (IVA excluido, a peso, descuentos) y haría saltar `insufficient_tendered`.
        ...needsTendered(this.payMethod) && this.tenderedNum > 0 ? { amount_tendered: this.tenderedNum } : {},
        // sales#159 (ADR-0386) — PAGO MIXTO. Solo viaja cuando el cajero ha repartido de verdad: con
        // una sola forma de pago manda el camino escalar de arriba, que es lo que hace todo lo demás
        // que llama a `complete_sale` (y lo que el servidor ya sabe convertir en su fila única). Con
        // patas, `payments[]` MANDA y los escalares pasan a derivarse de la pata mayor.
        //
        // ⚠️ Las patas se construyen sobre el PAYABLE de pantalla, que es un preview: el total lo
        // fija el servidor (IVA excluido, cantidades a peso y descuentos redondean allí). Si no
        // cuadran al céntimo la venta se RECHAZA (`sales.payments_do_not_match_total`) — a propósito,
        // porque una venta cuyas patas no suman es un cajón que acaba el día con un número que nadie
        // sabe explicar. El rechazo se pinta con palabras y el reparto se queda en pantalla para
        // corregirlo (`ui.errorPaymentsMismatch`).
        ...this.tenders.length ? { payments: buildPaymentsPayload(this.tenders) } : {},
        channel: "pos",
        source_module: "pos",
        // ADR-0141: la venta nace de este PEDIDO. El servidor lo marca completado (open→completed)
        // en el cobro final; para split-bill se enviaría `keep_order_open: true`.
        order_id: this.orderId ?? null,
        // ADR-0077 (seam cerrado en sales#89) — ids OPACOS que `sales` reenvía sin interpretar.
        // `appointment_id` hace que el handler emita `sales.sale.created_from_appointment`, con el
        // que `appointments` marca la cita cobrada en SU listener; `staff_id` atribuye la venta a
        // la profesional que atendió (≠ `employee_id`, que es la persona que cobra).
        appointment_id: this.appointmentId ?? null,
        staff_id: this.staffId ?? null,
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
      const recorded = rows2(await erplora2().query("sales.by_idempotency_key", { idempotency_key: checkoutKey }));
      const saleId = recorded[0]?.id;
      await this.finishSale(saleId, split);
    } catch (e7) {
      await this.handleCheckoutFailure(e7, checkoutKey, split);
    } finally {
      this.busy = false;
    }
  }
  /** Cierra la venta EN PANTALLA: limpia la comanda, suelta mesa y cliente, abre el documento.
   *
   *  Vive aparte porque hay DOS caminos que llegan aquí (hub#923): el cobro que responde, y el que
   *  perdió la respuesta pero cuya venta aparece luego por su clave de idempotencia. Duplicar este
   *  cierre era garantizar que un día divergieran. */
  async finishSale(saleId, split) {
    this.checkoutKey = "";
    this.error = "";
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = void 0;
    }
    this.paying = false;
    this.splitSel = /* @__PURE__ */ new Set();
    this.dropValuation();
    if (split.keep_order_open && this.orderId) {
      this.cart = await loadOrderLines(erplora2(), this.orderId);
      if (saleId) this.docSaleId = saleId;
      return;
    }
    this.cart = [];
    forgetCurrentCheck(localStorage);
    this.orderId = void 0;
    this.orderLabel = "";
    this.orderView = "account";
    this.tableId = void 0;
    this.tableLabel = "";
    this.customerId = void 0;
    this.customerName = "";
    this.customerTaxId = "";
    this.customerAddress = "";
    this.staffId = void 0;
    this.staffName = "";
    this.appointmentId = void 0;
    this.resetSlotContexts();
    if (saleId) this.docSaleId = saleId;
  }
  /** El cobro no terminó. Decide QUÉ se le dice al cajero — y esa decisión vale dinero.
   *
   *  hub#923 (saas#1460): con un fallo de TRANSPORTE no se sabe si la venta entró. En el incidente
   *  entró (200 en el servidor) y el proceso murió antes de que el cliente leyera la respuesta; la
   *  cajera vio la cadena cruda del motor, dedujo «no ha cobrado» y volvió a cobrar. Aquí se le
   *  pregunta al servidor por la CLAVE DE IDEMPOTENCIA, que es lo que convierte la duda en dato:
   *
   *    cobrada     → se cierra como si la respuesta hubiera llegado (el cliente ya pagó).
   *    no cobrada  → el servidor lo dice: reintentar es seguro (misma clave, nunca dos ventas).
   *    no se sabe  → se dice la verdad y se manda a Ventas. NUNCA «no se ha cobrado».
   *
   *  Un rechazo de DOMINIO (`sales.empty_sale`, …) no pasa por aquí: su frase lleva el código que
   *  el encargado necesita y se enseña tal cual. */
  async handleCheckoutFailure(e7, checkoutKey, split) {
    if (transportErrorKey(e7) !== SERVER_UNAVAILABLE_KEY) {
      const code = errorCode(e7);
      const key = checkoutErrorKey(code);
      const raw = e7 instanceof Error ? e7.message : String(e7 ?? "");
      this.error = key === "ui.errorCharge" && !code && raw ? raw : t5(key);
      return;
    }
    const recovery = await recoverCheckout(
      async (key) => rows2(await erplora2().query("sales.by_idempotency_key", { idempotency_key: key })),
      checkoutKey,
      // Dos intentos: un hub tumbado por OOM vuelve en segundos, y preguntar de nuevo es lo que
      // convierte «no sé» en una respuesta la mayoría de las veces.
      { attempts: 2 }
    );
    if (recovery.outcome === "charged") {
      await this.finishSale(recovery.saleId, split);
      return;
    }
    this.checkoutUnknown = recovery.outcome === "unknown";
    this.error = t5(this.checkoutUnknown ? "ui.checkoutUnknown" : SERVER_UNAVAILABLE_KEY);
  }
  /** La salida del cobro dudoso (hub#923): ir a Ventas a comprobar si aquello se cobró.
   *
   *  Solo aparece cuando NO se pudo averiguar. Un Web Component no recibe el router, así que el
   *  canal módulo→shell es empujar la URL y avisar con `popstate` (mismo patrón que `appointments`
   *  al mandar una cita al TPV). */
  renderCheckSalesLink() {
    if (!this.checkoutUnknown) return A;
    return b2`<ion-button size="small" fill="outline" class="check-sales" data-testid="checkout-check-sales"
      @click=${() => this.goToSales()}>
      <ion-icon slot="start" name="cart-outline"></ion-icon>${t5("ui.checkSales")}
    </ion-button>`;
  }
  goToSales() {
    window.history.pushState({}, "", "/m/sales/sales");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  /** sales#149 — how many catalogue lines CANNOT be charged, over the WHOLE catalogue.
   *
   *  Over `products`, not over `filtered`: the sentence is about the business ("the catalogue still
   *  has VAT to set up"), not about the open tab. Counting what is filtered would make the very same
   *  problem report a different number in every category, and zero in the first one that was fine. */
  get blockedCount() {
    return this.products.reduce((n6, p4) => this.blockedReason(p4) ? n6 + 1 : n6, 0);
  }
  /** Can THIS session do anything about the notice? A filter, not a wall (same criterion as the
   *  shell's `canOpenManagement`): the real authority is the runtime, this only decides what is
   *  painted.
   *
   *  `inventory.change_product` is the permission that opens the form where the fiscal category is
   *  assigned (`erp-inventory-products` requires it to edit), and `manager`/`admin` carry it — which
   *  is exactly the MANAGER this notice is addressed to; a cashier cannot fix it.
   *
   *  A shell that does NOT expose the permission channel (preview, older shell) is not saying "no":
   *  it is not answering. Failing closed there would silently remove the only place the business
   *  learns about this, and the notice costs a cashier nothing. */
  canFixCatalog() {
    const c5 = erplora2();
    if (typeof c5.hasPermission !== "function") return true;
    return c5.hasPermission("inventory.change_product");
  }
  goToProductSetup() {
    window.history.pushState({}, "", "/m/inventory/products?status=unconfigured");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  /** The AGGREGATE notice, once and before the shift (sales#149).
   *
   *  Until now a half configured catalogue was only noticeable tile by tile, with the customer
   *  waiting: the cashier's half (sales#74/#58). This is the manager's — the count, and the door it
   *  is fixed through.
   *
   *  DISCREET on purpose: one line, not a modal and not an `alert`. A till that opens with a window
   *  on top is a till people learn to dismiss without reading, and the catalogue goes on selling
   *  whatever does have VAT. Odoo and WooCommerce hide the misconfigured article (the till works,
   *  the manager never finds out); Square and Toast paint it on the tile but do not warn ahead
   *  either. We no longer hide it (sales#74), so what was missing was the sum. */
  renderCatalogHealth() {
    const n6 = this.blockedCount;
    if (!n6 || !this.canFixCatalog()) return A;
    return b2`<div class="catalog-health" role="status" data-testid="catalog-blocked-summary">
      <ion-icon name="alert-circle" aria-hidden="true"></ion-icon>
      <span class="ch-text">${n6 === 1 ? t5("ui.catalogBlockedOne") : t5("ui.catalogBlocked", { count: n6 })}</span>
      <ion-button size="small" fill="clear" class="ch-fix" data-testid="catalog-blocked-fix"
        @click=${() => this.goToProductSetup()}>${t5("ui.catalogBlockedFix")}</ion-button>
    </div>`;
  }
  /** The empty grid, WITH ITS REASON (sales#25).
   *
   *  `inventory` is an optional capability (ADR-0127): a hub without it sells services and
   *  free-price lines (ADR-0085) and that is a supported way to run a till — but it is the
   *  DEGRADED mode, not the normal one, and the market says so out loud. The Shopify POS community
   *  has been asking for variable prices per item since 2014 precisely because the free-price
   *  escape "works but you have to type the name every time and it reports nothing per item or
   *  category": the free line is not a substitute for a catalogue, so a till without one has to
   *  say what it is missing and how to get it, not just show a blank rectangle.
   *
   *  `role="status"`, never `alert`: nothing broke. A broken app is the notice above, and mixing
   *  the two is how an alert stops meaning anything. */
  renderEmptyGrid() {
    if (!this.catalogAppAbsent) return b2`<div class="empty">${t5("ui.noProducts")}</div>`;
    return b2`<div class="empty catalog-absent" role="status" data-testid="catalog-app-absent">
      ${t5("ui.catalogAppAbsent", { app: this.appName("inventory") })}
    </div>`;
  }
  /** hub#297 — la captura de NIF + domicilio cuando la venta pasa del techo de la simplificada.
   *
   *  **En la MISMA pantalla del cobro**, no en un modal encima: quien la tiene que rellenar está
   *  con el cliente delante y con el importe a la vista, y mandarlo a otra pantalla es donde estos
   *  flujos se abandonan. Los tres campos se pintan siempre (no escondidos tras un botón) porque no
   *  son opcionales: sin ellos esta venta no tiene documento válido que emitir.
   *
   *  Los campos vienen RELLENOS si hay cliente asignado (`sales.pos.assign` → ADR-0132), así que el
   *  caso normal del cliente de empresa que ya está en la ficha es leer y cobrar. */
  renderSimplifiedLimitCapture() {
    const done = recipientIsComplete(this.limitState);
    return b2`
      <div class="limit-capture" data-testid="simplified-limit-capture" ?data-done=${done}>
        <div class="limit-head">
          <ion-icon name=${done ? "document-text-outline" : "alert-circle-outline"}></ion-icon>
          <div>
            <strong>${done ? t5("ui.limitReadyTitle") : t5("ui.limitBlockedTitle")}</strong>
            <p>${done ? t5("ui.limitReadyBody") : t5("ui.limitBlockedBody", { max: this.money(this.simplifiedMaxCents ?? 0) })}</p>
          </div>
        </div>
        <ion-input label=${t5("ui.limitFieldName")} label-placement="stacked" .value=${this.customerName}
                   data-testid="limit-name" autocomplete="off"
                   @ionInput=${(e7) => {
      this.customerName = String(e7.target.value ?? "");
    }}></ion-input>
        <ion-input label=${t5("ui.limitFieldTaxId")} label-placement="stacked" .value=${this.customerTaxId}
                   data-testid="limit-tax-id" autocomplete="off"
                   @ionInput=${(e7) => {
      this.customerTaxId = String(e7.target.value ?? "");
    }}></ion-input>
        <ion-input label=${t5("ui.limitFieldAddress")} label-placement="stacked" .value=${this.customerAddress}
                   data-testid="limit-address" autocomplete="off"
                   @ionInput=${(e7) => {
      this.customerAddress = String(e7.target.value ?? "");
    }}></ion-input>
      </div>`;
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
    const cell = (id, name, count) => b2`
      <ion-segment-button class="cat-segment-button" value=${id}>
        <ion-label class="cat-segment-label">
          <span class="cc-n">${name}</span><span class="cc-c">${count} ${t5("ui.items")}</span>
        </ion-label>
      </ion-segment-button>`;
    return b2`
      <div class="catbar">
        <ion-segment class="category-segment" scrollable value=${this.activeCat}
          aria-label=${t5("ui.categoryFilter")} @wheel=${this.onCategoryWheel}
          @ionChange=${(e7) => {
      this.activeCat = e7.detail.value ?? "";
    }}>
          ${cell("", t5("ui.all"), this.products.length)}
          ${this.categories.map((c5) => cell(c5.id, c5.name, this.catCount(c5.id)))}
        </ion-segment>
        <!-- Lupa: despliega el buscador (gana alto para la rejilla). Hueco natural para el micro
             de búsqueda por voz cuando llegue. -->
        <button class="arrow search-trigger" title=${t5("ui.searchAction")} aria-pressed=${this.searchOpen}
          @click=${() => this.renderRoot.querySelector("ok-spotlight-search")?.openSearch?.()}>
          <ion-icon name="search-outline"></ion-icon>
        </button>
        ${this.renderMoreMenu()}
      </div>`;
  }
  /** Controles de chrome que el shell dice honrar en esta pestaña (`chrome="fullscreen …"`). */
  get chromeControls() {
    return this.chrome.split(/\s+/).filter(Boolean);
  }
  /**
   * Menú ⋮ de la barra de categorías: lo que afecta a la PANTALLA, no a la venta.
   *
   * Va aquí y no en la barra del carrito porque en un móvil el carrito se cierra —y con él se
   * llevaría su cabecera—, mientras que la barra de categorías está en todos los tamaños. Es
   * también el único sitio que sigue en pie DENTRO del modo: la topbar del shell, que es donde
   * ADR-0048 puso este botón, se esconde ella misma al activarlo y se lleva la salida consigo.
   *
   * Hoy lleva un solo control; nace como menú a propósito, porque es la lista la que va a crecer.
   */
  renderMoreMenu() {
    if (!this.chromeControls.length) return A;
    return b2`
      <button class="arrow more-trigger" title=${t5("ui.screenMenu")} aria-label=${t5("ui.screenMenu")}
        aria-haspopup="menu" aria-expanded=${this.moreOpen}
        @click=${() => {
      this.moreOpen = !this.moreOpen;
    }}>
        <ion-icon name="ellipsis-vertical-outline"></ion-icon>
      </button>
      ${this.moreOpen ? b2`
          <!-- Capa de cierre: un menú que solo se cierra por su propio botón se queda abierto en
               cuanto el cajero toca cualquier otra cosa. Transparente y sin scrim visible: es un
               menú, no un diálogo que exija atención. -->
          <div class="more-scrim" @click=${() => {
      this.moreOpen = false;
    }}></div>
          <!-- <dialog> nativo como el resto de overlays del TPV: los de Ionic dentro de un shadow
               Lit se re-parentan al body y pierden el CSS (ADR-0028). NO modal a propósito —es un
               menú anclado al ⋮, no un diálogo—, así que la salida con Esc se cablea a mano. -->
          <dialog class="more-menu" open role="menu"
            @keydown=${(e7) => {
      if (e7.key === "Escape") this.moreOpen = false;
    }}>
            ${this.chromeControls.includes("fullscreen") ? b2`
                <button type="button" role="menuitem" data-action="fullscreen"
                  @click=${() => this.requestChrome("fullscreen")}>
                  <ion-icon name=${this.fullscreen ? "contract-outline" : "expand-outline"}></ion-icon>
                  <span>${this.fullscreen ? t5("ui.exitFullscreen") : t5("ui.fullscreen")}</span>
                </button>` : A}
          </dialog>` : A}`;
  }
  /**
   * Pide al SHELL un control de chrome (ADR-0048: el módulo es contenido, el chrome es del shell).
   * `composed` para salir del shadow root y `bubbles` para llegar al host del módulo; sin las dos
   * la petición muere dentro del componente. Quien no la escuche, no la atiende —y por eso el ⋮ no
   * se pinta si el shell no anunció el control.
   */
  requestChrome(control) {
    this.moreOpen = false;
    this.dispatchEvent(new CustomEvent("erp:chrome-request", {
      detail: { control, action: "toggle" },
      bubbles: true,
      composed: true
    }));
  }
  renderCart() {
    return b2`
      <ion-header class="ion-no-border">
        <ion-toolbar>
          <div class="order-toolbar">
            ${this.parkingEnabled ? b2`<ion-button class="header-action icon-action park-action" fill="clear" ?disabled=${!this.cart.length}
                    title=${t5("ui.parkCurrentSale")} aria-label=${t5("ui.parkCurrentSale")}
                    @click=${() => void this.requestPark()}>
                  <ion-icon slot="icon-only" name="pause-circle-outline"></ion-icon>
                </ion-button>` : A}
            <!-- Cada módulo sigue siendo dueño de su botón y modal. Sales solo ofrece el hueco. -->
            <span class="cart-actions-slot"></span>
            <span class="actions-spacer"></span>
            <ion-button class="header-action icon-action open-checks-action" fill="clear"
                        title=${t5("ui.parkedTickets")} aria-label=${t5("ui.parkedTickets")}
                        @click=${() => {
      this.parkedOpen = !this.parkedOpen;
    }}>
              <ion-icon slot="icon-only" name="receipt-outline"></ion-icon>
              ${this.parked.length ? b2`<span class="badge-num">${this.parked.length}</span>` : A}
            </ion-button>
            <ion-button class="header-action cart-close" fill="clear" title=${t5("ui.closeAction")}
                        aria-label=${t5("ui.closeAction")} @click=${() => {
      this.cartOpen = false;
    }}>
              <ion-icon name="chevron-forward-outline"></ion-icon><small>${t5("ui.closeAction")}</small>
            </ion-button>
          </div>
        </ion-toolbar>

        <div class="order-heading">
          <div class="order-title-row">
            <input class="order-title" .value=${this.visibleOrderLabel}
                   placeholder=${t5("ui.newCheckTitle")} aria-label=${t5("ui.checkTitleLabel")}
                   @input=${(e7) => {
      this.orderLabel = e7.target.value;
    }}
                   @change=${(e7) => void this.saveOrderLabel(e7.target.value)} />
            <button class="title-edit" type="button" title=${t5("ui.editCheckTitle")}
                    aria-label=${t5("ui.editCheckTitle")} @click=${() => this.focusOrderTitle()}>
              <ion-icon name="create-outline"></ion-icon>
            </button>
          </div>
          <div class="order-context">
            <!-- Los módulos siguen siendo dueños de la asociación y del selector; sales solo
                 muestra las etiquetas opacas que recibe, iguales para Mesa y Cliente. Sus
                 botones permanecen libres arriba para asignar/cambiar cada contexto. -->
            ${this.tableLabel ? b2`<ion-chip><ion-icon name="grid-outline"></ion-icon><ion-label>${this.tableLabel}</ion-label></ion-chip>` : A}
            ${this.customerName ? b2`<ion-chip><ion-icon name="person-outline"></ion-icon><ion-label>${this.customerName}</ion-label></ion-chip>` : A}
            <!-- sales#179 — WHO IS SERVING. Always there, even with nobody chosen: if it is not
                 visible, nobody knows the sale is attributed at all, and the waiter cannot be
                 transferred. -->
            <button class="ctx-chip" type="button" data-testid="staff-chip"
                    aria-label=${t5("ui.staffPickerTitle")} title=${t5("ui.staffPickerTitle")}
                    @click=${() => void this.openStaffPicker()}>
              <ion-icon name="person-circle-outline"></ion-icon>
              <span>${this.staffLabel}</span>
            </button>
            <!-- sales#222 — the shop demands a customer and there is none: it is said HERE, in the
                 slot the customer occupies, and the chip is the shortcut to fill it. A block whose
                 only sign is a toast is a block nobody can act on once the toast is gone. -->
            ${this.missingRequiredCustomer ? b2`<button class="ctx-chip needs-customer" type="button" data-testid="needs-customer"
                             title=${t5("ui.customerRequiredCharge")} aria-label=${t5("ui.customerRequiredCharge")}
                             @click=${() => this.askForCustomer()}>
                       <ion-icon name="person-add-outline"></ion-icon>
                       <span>${t5("ui.customerRequiredShort")}</span>
                     </button>` : A}
            ${!this.tableLabel && !this.customerName && !this.missingRequiredCustomer ? b2`<span class="context-empty">${t5("ui.noCheckContext")}</span>` : A}
          </div>
        </div>

        ${this.hasKitchen ? b2`
          <ion-segment class="view-tabs" .value=${this.orderView}
            @ionChange=${(e7) => {
      this.orderView = e7.detail.value;
    }}>
            <ion-segment-button value="account"><ion-label>${t5("ui.accountTab")}</ion-label></ion-segment-button>
            <ion-segment-button value="draft"><ion-label><span class="view-tab-label">
              ${t5("ui.currentCommandTab")}
              ${this.pendingCount ? b2`<span class="pending-dot">${this.pendingCount}</span>` : A}
            </span></ion-label></ion-segment-button>
          </ion-segment>` : A}
      </ion-header>

      ${this.parkedOpen ? b2`
          <div class="pdrop-back" @click=${() => {
      this.parkedOpen = false;
    }}></div>
          <div class="pdrop">
            <ion-button size="small" expand="block" fill="outline" ?disabled=${!this.cart.length} @click=${() => void this.requestPark()}>${this.tableLabel.trim() ? t5("ui.leaveAtTable") : t5("ui.parkCurrentSale")}</ion-button>
            <p class="hint">${this.tableLabel.trim() ? t5("ui.leaveAtTableHint", { label: this.tableLabel }) : t5("ui.parkForLaterHint")}</p>
            <p class="hint"><strong>${t5("ui.parkedTickets")}</strong><br>${t5("ui.openChecksHint")}</p>
            ${this.parked.map((oc) => b2`<div class="pitem">
              <!-- La FILA entera recupera (objetivo táctil grande); eliminar es el icono aparte,
                   armado en dos toques para no borrar cuentas de un roce. Ya NO se bloquea con
                   algo marcado: lo de delante se aparca o se queda en su mesa (ADR-0146). -->
              <button class="prow" @click=${() => this.retrieve(oc)}>
                <span class="pn">${oc.label || this.money(oc.total)}</span>
                <span class="pm">${(oc.created_at || "").replace("T", " ").slice(11, 16)}${oc.label ? " \xB7 " + this.money(oc.total) : ""}</span>
              </button>
              <ion-button size="small" fill="clear" color="danger" class="pdel"
                          title=${this.armedDelete === oc.id ? t5("ui.deleteCheckConfirm") : t5("ui.deleteCheck")}
                          aria-label=${this.armedDelete === oc.id ? t5("ui.deleteCheckConfirm") : t5("ui.deleteCheck")}
                          @click=${() => void this.deleteCheck(oc)}>
                <ion-icon slot="icon-only" name=${this.armedDelete === oc.id ? "alert-circle-outline" : "trash-outline"}></ion-icon>
              </ion-button>
            </div>`)}
            ${!this.parked.length ? b2`<div class="hint hint--center">${t5("ui.noParkedTickets")}</div>` : A}
          </div>` : A}

      <!-- El CUERPO. ion-content es quien scrollea: las líneas crecen aquí dentro y ni el header ni
           el pie se mueven. Con divs a pelo, una comanda larga empujaba el botón de COBRAR fuera de
           la pantalla — en un TPV eso es no poder cobrar. -->
      <ion-content class="cart-body">
        ${this.hasKitchen && this.orderView === "draft" ? this.renderDraft() : this.hasFired ? this.renderSections() : this.renderOrderList()}
      </ion-content>

      <!-- El PIE. ion-footer es un pie de verdad: se queda abajo pase lo que pase. -->
      <ion-footer class="ion-no-border">
        <div class="cart-foot">
          ${this.ticketDiscount > 0 || this.ticketDiscountAmount > 0 ? b2`
          <div class="ticket-discount-row"><span>${t5("ui.discountTicket")}${this.ticketDiscount > 0 ? ` \u2212${this.ticketDiscount}%` : ""}</span><span>−${this.money(this.ticketDiscountTotal)}</span></div>` : A}
          <div class="total"><span>${t5("ui.colTotal")}</span><b>${this.money(this.total)}</b></div>
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
            <!-- Borrado en dos toques de la lista de cuentas: el nombre del icono es DINÁMICO
                 (trash → alert al armar), y el empaquetador solo hornea literales. -->
            <ion-icon name="trash-outline"></ion-icon>
            <ion-icon name="alert-circle-outline"></ion-icon>
            <!-- sales#71: el icono del descuento cambia con el estado (outline ↔ relleno). -->
            <ion-icon name="pricetag-outline"></ion-icon>
            <ion-icon name="pricetag"></ion-icon>
          </span>
          <!-- El MÉTODO de pago ya no se elige aquí: vive DENTRO del sheet de cobro, como la
               pantalla de tender de cualquier TPV (rediseño 2026-07-19). El footer solo acciona. -->
          <!-- Acciones SOLO-ICONO (ADR-0133): imprimir la CUENTA para llevarla a la mesa (no es un
               documento fiscal) y COBRAR (que sí emite el tiquet fiscal). El importe ya se ve
               grande arriba, así que el texto sobra; la etiqueta va en aria-label/title. -->
          <!-- El botón de COCINA ya no vive aquí: entra por el slot sales.pos.actions (lo
               aporta kitchen si está instalado/activo) y se monta dentro de Comanda actual. -->
          <div class="foot-actions">
            ${this.discountsAllowed ? b2`
            <ion-button class="ticket-discount" fill="outline" ?disabled=${!this.cart.length}
                        color=${this.ticketDiscount > 0 || this.ticketDiscountAmount > 0 ? "warning" : void 0}
                        title=${t5("ui.discountTicket")} aria-label=${t5("ui.discountTicket")}
                        @click=${() => this.openDiscount("ticket")}>
              <ion-icon slot="icon-only" name=${this.ticketDiscount > 0 || this.ticketDiscountAmount > 0 ? "pricetag" : "pricetag-outline"}></ion-icon>
            </ion-button>` : A}
            <ion-button class="prebill" fill="outline" ?disabled=${!this.cart.length}
                        title=${t5("ui.printPrebill")} aria-label=${t5("ui.printPrebill")}
                        @click=${() => {
      this.prebillOpen = true;
      void this.loadModifierCatalog();
    }}>
              <ion-icon slot="icon-only" name="print-outline"></ion-icon>
            </ion-button>
            <!-- sales#185 — with the app missing the button announces itself blocked but STAYS
                 ALIVE: aria-disabled, never the native disabled, which on Ionic is
                 pointer-events:none and would strand the reason in a title that a tablet never
                 shows (sales#58). openPay() takes the tap and answers with the shell's toast.
                 The blocked state itself is written by syncChargeState(), not here: Ionic steals
                 whatever the template puts on this host. -->
            <ion-button class="charge" ?disabled=${!this.cart.length}
                        title=${this.missingChargeApp ? t5("ui.missingAppCharge", { app: this.chargeAppName }) : this.missingRequiredCustomer ? t5("ui.customerRequiredCharge") : t5("ui.charge")}
                        aria-label=${t5("ui.charge")}
                        @click=${() => this.openPay()}>
              <ion-icon slot="start" name="card-outline"></ion-icon>
              ${t5("ui.charge")} · ${this.money(this.owed)}
            </ion-button>
          </div>
        </div>
      </ion-footer>`;
  }
  /** Vista temporal que existe únicamente cuando Cocina rellena sales.pos.actions. El botón
   *  sigue siendo propiedad de kitchen: sales solo lo coloca debajo de las líneas pendientes. */
  renderDraft() {
    const pendientes = pendingLines(this.cart);
    return b2`<div class="draft-pane">
      <p class="draft-hint">${t5("ui.currentCommandHint")}</p>
      ${pendientes.length ? b2`<ion-list class="lines" lines="none">${pendientes.map((l3) => this.renderLine(l3))}</ion-list>` : b2`<div class="draft-empty"><ok-empty-state icon="checkmark-done-outline"
            heading=${t5("ui.noPendingCommand")} message=${t5("ui.noPendingCommandHint")}></ok-empty-state></div>`}
      <div class="draft-actions-slot"></div>
    </div>`;
  }
  /** ¿Hay líneas ya ENVIADAS a producción? El carrito se parte en secciones cuando el DATO lo
   *  dice — no hay toggle: la funcionalidad llega instalando módulos (kitchen dispara; una
   *  tienda jamás dispara y jamás ve secciones). Composición de lo básico a lo complejo. */
  get hasFired() {
    return this.cart.some((l3) => !!l3.fired_at);
  }
  /** La pestaña PEDIDO (y el carrito plano sin modo restaurante): la cuenta a cobrar. */
  renderOrderList() {
    return this.cart.length ? b2`<ion-list class="lines" lines="full">
          ${this.cart.map((l3) => this.renderLine(l3))}
        </ion-list>` : b2`<div class="empty">${t5("ui.cartEmptyTouch")}</div>`;
  }
  /** Una línea de la cuenta. BLOQUEADA si ya salió a cocina (`fired_at`): la comida está en
   *  fuego — ni stepper ni invitación (el SQL también lo impone). Tocarla sigue marcándola para
   *  el cobro por partes: enviada ≠ no cobrable. */
  /** TENDER POR LÍNEA (sales#162 / ADR-0386). Un bono cubre una LÍNEA entera, no un importe, así
   *  que la pregunta «¿esto lo paga el bono?» se hace sobre la línea y no sobre el ticket. `sales`
   *  pinta el renglón y el hueco; QUÉ se ofrece ahí lo decide el módulo que hospeda el slot.
   *
   *  Sin fillers (nadie provee el slot) no se pinta NADA: ni cabecera, ni lista, ni hueco vacío. */
  renderLineTenders() {
    const lines = this.tenderLines;
    if (!lines.length) return A;
    return b2`
      <div class="pay-lbl">${t5("ui.lineTenders")}</div>
      <ul class="tl-list">
        ${lines.map((l3) => {
      const isCovered2 = !!l3.line_id && this.covered.has(l3.line_id);
      return b2`<li class="tender-line" data-line=${l3.line_id ?? ""}>
            <div class="tl-h">
              <span class="tl-name">${l3.name}</span>
              <span class="tl-amount" ?data-covered=${isCovered2}>${this.money(lineAmount(l3))}</span>
            </div>
            ${coverableLine(l3) ? b2`<div class="tl-slot"></div>` : b2`<div class="tl-note">${t5("ui.tenderOneSessionPerLine")}</div>`}
          </li>`;
    })}
      </ul>`;
  }
  renderLine(l3) {
    const locked = isLineLocked(l3);
    return b2`<ion-item class=${l3.line_id && this.splitSel.has(l3.line_id) ? "sel" : ""}
        button ?detail=${false} @click=${() => this.toggleSplit(l3)}>
      ${this.cart.length > 1 && l3.line_id ? b2`<ion-icon slot="start" class="selmark"
                  name=${this.splitSel.has(l3.line_id) ? "checkmark-circle" : "ellipse-outline"}
                  color=${this.splitSel.has(l3.line_id) ? "primary" : "medium"}></ion-icon>` : A}
      <ion-label>
        <h3>
          ${this.hasKitchen ? locked ? b2`<ok-status-pill tone="success" size="sm" dot>${t5("ui.commandRound", { n: String(l3.round_no ?? "") })}</ok-status-pill>` : b2`<ok-status-pill tone="warning" size="sm" dot>${t5("ui.pendingStatus")}</ok-status-pill>` : A}
          <span>${l3.name}</span>${l3.is_gift ? b2` <ion-badge color="success">${t5("ui.giftBadge")}</ion-badge>` : A}</h3>
        <!-- sales#208: el precio unitario que se enseña YA lleva los suplementos, que es el que
             va a salir impreso (el cobro mete el delta por el precio unitario de la línea). Con la
             base a secas, «9,00 €» debajo de un importe de «12,00 €» se lee como un fallo. -->
        <p>${priceLabel(this.money(unitPriceWithModifiers(l3)), l3.unit_code)}${l3.is_gift && l3.gift_reason ? b2` · ${l3.gift_reason}` : A}${l3.discount ? b2` <ion-badge class="line-discount-badge" color="warning">−${l3.discount}%</ion-badge>` : A}</p>
        <!-- sales#156: if the note is not visible the waiter does not know whether it was typed,
             so it gets typed twice or taken for granted. It goes on a sub-line of its own, the way
             the supplements do on paper. -->
        ${l3.note ? b2`<p class="line-note-text"><ion-icon name="chatbox-ellipses-outline"></ion-icon> ${l3.note}</p>` : A}
      </ion-label>
      <div slot="end" class="lineend">
        <span class="lt ${l3.is_gift ? "is-gift" : ""}">${this.money(lineAmount(l3))}</span>
        ${locked ? b2`<span class="lqty">×${formatQuantity2(toMicro2(l3.qty))}</span>` : b2`
            ${this.discountsAllowed ? b2`
            <ion-button class="line-discount" fill="clear" size="small" title=${t5("ui.discountLine")} aria-label=${t5("ui.discountLine")}
                        @click=${() => this.openDiscount("line", l3.line_id)}>
              <ion-icon name=${l3.discount ? "pricetag" : "pricetag-outline"} slot="icon-only" color=${l3.discount ? "warning" : "medium"}></ion-icon>
            </ion-button>` : A}
            <ion-button class="line-note" fill="clear" size="small" title=${t5("ui.lineNote")} aria-label=${t5("ui.lineNote")}
                        @click=${() => this.openLineNote(l3.line_id)}>
              <ion-icon name=${l3.note ? "chatbox-ellipses" : "chatbox-ellipses-outline"} slot="icon-only"
                        color=${l3.note ? "primary" : "medium"}></ion-icon>
            </ion-button>
            <ion-button fill="clear" size="small" title=${t5("ui.giftAction")} @click=${() => this.toggleGift(l3.id)}>
              <ion-icon name=${l3.is_gift ? "gift" : "gift-outline"} slot="icon-only" color=${l3.is_gift ? "success" : "medium"}></ion-icon>
            </ion-button>
            <ok-qty-stepper .value=${l3.qty} .min=${0} .step=${this.stepOf(l3)}
              @ok-change=${(e7) => this.setQtyAbs(
      l3.id,
      e7.detail.value,
      e7.currentTarget
    )}></ok-qty-stepper>`}
      </div>
    </ion-item>`;
  }
  /** Secciones POR DATO (debate Ioan 2026-07-19, 2ª ronda): PENDIENTE DE ENVIAR arriba
   *  (editable — donde trabaja el camarero) y ENVIADO debajo (bloqueado, cobrable). El detalle
   *  por comanda — números, horas, ESTADOS EN VIVO del KDS — no vive aquí: lo aporta kitchen
   *  con su chip+modal por el slot `sales.pos.order_info` (montado en la cabecera de ENVIADO).
   *  El envío es el botón de kitchen dentro de «Comanda actual» (uno solo, con badge). */
  renderSections() {
    const pendientes = pendingLines(this.cart);
    const enviadas = this.cart.filter((l3) => !!l3.fired_at);
    return b2`<div class="secs">
      ${pendientes.length ? b2`<div class="sec sec-pending">
        <div class="sec-h">
          <ion-icon name="create-outline" color="primary"></ion-icon>
          <span>${t5("ui.courseInProgress")}</span>
          <span class="ccount">· ${pendientes.length}</span>
        </div>
        <ion-list class="lines" lines="full">${pendientes.map((l3) => this.renderLine(l3))}</ion-list>
      </div>` : A}
      ${enviadas.length ? b2`<div class="sec sec-sent">
        <div class="sec-h">
          <ion-icon name="flame" color="warning"></ion-icon>
          <span>${t5("ui.sentHeader")}</span>
          <span class="ccount">· ${enviadas.length}</span>
          <span class="sec-slot"></span>
        </div>
        <ion-list class="lines" lines="full">${enviadas.map((l3) => this.renderLine(l3))}</ion-list>
      </div>` : A}
    </div>`;
  }
  render() {
    const blockedWhy = this.paying ? this.chargeBlock : void 0;
    return b2`<div class="card">
      <div class="body">
        <div class="catalog">
          ${this.renderCatBar()}
          <!-- sales#185 — the checkout error lives in ONE place at a time. With the sheet open
               this copy sits BEHIND the scrim, across the product grid, and the modal's edge clips
               it to half a sentence: the cashier reads the same thing twice and neither of them
               whole. The sheet's copy is the one in front of them. Closing the sheet hands the
               error back here: it is not lost, it is moved. -->
          ${this.error && !this.paying ? b2`<p class="err">${this.error}</p>${this.renderCheckSalesLink()}` : A}
          <!-- sales#185 — an app the checkout NEEDS is missing. The role is alert, not status:
               this is not ambient information, it is that this till cannot charge today. -->
          ${this.missingChargeApp ? b2`<div class="blocked-notice missing-app-notice" role="alert">
                <ion-icon name="alert-circle" aria-hidden="true"></ion-icon>
                <span>${t5("ui.missingAppCharge", { app: this.chargeAppName })}</span>
              </div>` : A}
          ${this.blockedNotice ? b2`<div class="blocked-notice" role="status">
                <ion-icon name="alert-circle" aria-hidden="true"></ion-icon><span>${this.blockedNotice}</span>
              </div>` : A}
          <!-- sales#153: la lectura del catálogo de menús FALLÓ (≠ «combos no está instalado»).
               Se dice, en vez de dejar la rejilla misteriosamente corta: un menú que no se puede
               componer no se ofrece, porque el servidor lo rechazaría al cobrar. -->
          ${this.comboCatalogFailed ? b2`<div class="blocked-notice combo-unavailable" role="status">
                <ion-icon name="alert-circle" aria-hidden="true"></ion-icon><span>${t5("ui.comboCatalogUnavailable")}</span>
              </div>` : A}
          <!-- sales#25: a HARD dependency (inventory, taxes) that IS installed and whose catalogue
               read FAILED. It is an alert, like the missing-app notice: the grid in front of the
               cashier is incomplete and no tap on it will say why. Its ABSENCE is not here — an
               app the hub does not have is a legitimate state that degrades in silence, and
               alarming about it would train the notice away.
               NOTE: no backticks in this comment. Inside an html tagged template a backtick ends
               the template literal and the whole file stops parsing. -->
          ${this.brokenCatalogApps.map((app) => b2`
            <div class="blocked-notice catalog-unavailable" role="alert" data-testid="dependency-read-failed">
              <ion-icon name="alert-circle" aria-hidden="true"></ion-icon>
              <span>${t5("ui.appCatalogUnavailable", { app: this.appName(app) })}</span>
            </div>`)}
          <!-- sales#149: the state of the CATALOGUE, one line and last among the notices. The two
               above belong to the tap that just happened; this one has been true since the till
               opened, so it must not push them down every time they appear. -->
          ${this.renderCatalogHealth()}
          <div class="grid">
            <!-- Los MENÚS van primero: en un local con menú del día es la primera comanda de la
                 hora punta. Solo en la pestaña «todo»: un combo no pertenece a ninguna categoría
                 de producto, así que pintarlo dentro de «Bebidas» sería mentir. -->
            ${!this.activeCat ? this.comboCatalog.map((c5) => b2`
              <ion-card button class="tile combo" data-combo-id=${c5.combo_id}
                        aria-label=${`${c5.name} \xB7 ${this.money(c5.price)}`}
                        @click=${() => this.openCombo(c5)}>
                <div class="thumb" style=${`background:${gradient(c5.name)}`}>
                  ${initials(c5.name)}
                  <span class="combo-badge"><ion-icon name="restaurant-outline"></ion-icon></span>
                </div>
                <div class="tinfo">
                  <div class="n">${c5.name}</div><div class="sku">${t5("ui.comboBadge")}</div>
                  <div class="p">${this.money(c5.price)}</div>
                </div>
              </ion-card>`) : A}
            ${this.filtered.map((p4) => {
      const blocked = this.blockedReason(p4);
      const photo = this.photos.get(p4.image);
      return b2`<ion-card button class="tile" aria-disabled=${blocked ? "true" : A}
                title=${blocked ?? A} aria-label=${blocked ? `${p4.name} \xB7 ${blocked}` : A}
                @click=${() => this.add(p4)}>
              <div class="thumb" style=${`background:${gradient(p4.name)}`}>
                ${initials(p4.name)}
                ${p4.image && photo ? b2`<img src=${photo} alt="" loading="lazy" aria-hidden="true"
                      @error=${() => this.photos.drop(p4.image, photo)}>` : A}
                ${blocked ? b2`<span class="warn"><ion-icon name="alert-circle"></ion-icon></span>` : A}
              </div>
              <!-- sales#57: nombre y precio mandan. El SKU/slug NO se pinta (ruido interno que además
                   entraba en el nombre accesible del botón; Square/Toast/Lightspeed no lo enseñan —
                   vive en la búsqueda). La UNIDAD sí, cuando no es la pieza: «kg», «l». -->
              <div class="tinfo"><div class="n">${p4.name}</div><div class="sku">${p4.unit_code && p4.unit_code !== "ud" ? p4.unit_code : ""}</div><div class="p">${this.money(Number(p4.price))}</div>
                ${blocked ? b2`<div class="blocked-badge">${t5("ui.notSellableBadge")}</div>` : A}</div>
            </ion-card>`;
    })}
            <!-- PRECIO LIBRE: vender género suelto que no está fichado (fruta a ojo). Va al FINAL de la
                 rejilla para no interceptar el "primer producto" (que es lo que tocan los tests y el
                 flujo normal); es una acción aparte, no un producto de catálogo. -->
            <ion-card button class="tile open-price" @click=${() => this.openOpenPrice()}>
              <div class="thumb op-thumb"><ion-icon name="pricetag-outline"></ion-icon></div>
              <div class="tinfo"><div class="n">${t5("ui.openPrice")}</div><div class="sku"></div><div class="p">+ €</div></div>
            </ion-card>
            ${!this.filtered.length ? this.renderEmptyGrid() : A}
          </div>
        </div>

        <div class="cart-backdrop" ?data-open=${this.cartOpen} @click=${() => {
      this.cartOpen = false;
    }}></div>
        <aside class="cart" id="pos-cart-drawer" ?data-open=${this.cartOpen}>${this.renderCart()}</aside>

        <!-- Botón flotante de carrito (solo móvil). sales#84: nombre accesible con la cantidad (el
             badge visual no lo lee nadie), y estado abierto/cerrado del cajón que controla. -->
        <button class="fab"
                aria-label=${this.itemCount ? t5("ui.openCartWithItems", { count: this.itemCount }) : t5("ui.openCart")}
                aria-expanded=${this.cartOpen ? "true" : "false"} aria-controls="pos-cart-drawer"
                @click=${() => {
      this.cartOpen = true;
    }}>
          <ion-icon name="cart-outline" aria-hidden="true"></ion-icon>
          ${this.itemCount ? b2`<span class="badge">${this.itemCount}</span>` : A}
        </button>
      </div>

      ${this.paying ? b2`<div class="scrim" @click=${(e7) => {
      if (e7.target.classList.contains("scrim")) this.paying = false;
    }}>
            <div class="sheet">
              <div class="sheet-h">
                <span class="t">${t5("ui.charge")}</span>
                <button class="x" @click=${() => {
      this.paying = false;
    }}>✕</button>
              </div>
              <!-- El IMPORTE manda en esta pantalla: grande, solo y SIEMPRE visible (fuera del
                   scroll). Antes vivía en letra pequeña del título y el ojo no lo encontraba. -->
              <div class="sheet-top">
                <div class="pay-total">${this.money(this.payable)}</div>
                ${this.splitSel.size ? b2`<div class="pay-split">${t5("ui.payingPart", { n: String(this.splitSel.size), total: this.money(this.total) })}</div>` : A}
                <!-- sales#159 — EL RESTANTE. Vive en la cabecera del sheet, FUERA del scroll: es el
                     número que el cajero mira en cada pata y esconderlo bajo el teclado es lo que
                     convierte un reparto en un «¿cuánto falta ya?» a mano. -->
                ${this.splitting ? b2`<div class="pay-remaining" aria-live="polite" ?data-covered=${this.remaining === 0}>
                      <span>${t5("ui.remaining")}</span><span class="v">${this.money(this.remaining)}</span>
                    </div>` : A}
              </div>
              <div class="pay">

                ${this.overSimplifiedLimit ? this.renderSimplifiedLimitCapture() : A}

                ${this.renderLineTenders()}

                <!-- TIQUE o FACTURA (hub#962). Dos botones grandes al lado del importe, como el
                     método de pago: es la otra pregunta que el mostrador hace en voz alta
                     («¿necesita factura?») y hasta ahora no tenía dónde contestarse — solo se podía
                     dejar puesto un valor por defecto en Ajustes. Por encima del techo de la
                     simplificada no se pinta: ahí la factura es obligatoria y ofrecer el botón de
                     tique sería ofrecer romper la ley. -->
                ${this.canChooseDocFormat ? b2`
                  <div class="pay-docformat" role="group" aria-label=${t5("ui.documentFormat")}>
                    ${["ticket", "invoice"].map((f3) => b2`
                      <button
                        class="pm-btn"
                        aria-pressed=${this.docFormat === f3 ? "true" : "false"}
                        @click=${() => this.chooseDocFormat(f3)}
                      >${f3 === "ticket" ? t5("ui.docTicket") : t5("ui.docInvoice")}</button>`)}
                  </div>` : A}

                <!-- sales#159 — LAS PATAS YA TOMADAS. Cada una se puede editar (vuelve al teclado
                     con su importe) y quitar (su importe vuelve al restante). Sin esto, corregir un
                     «no, eran 40 con tarjeta» obliga a cancelar el cobro entero. -->
                ${this.tenders.length ? b2`
                  <div class="pay-lbl">${t5("ui.paymentsTaken")}</div>
                  <ul class="tender-list">
                    ${this.tenders.map((leg) => {
      const name = payMethodDisplayName(leg.method, t5);
      const amount = this.money(leg.amount);
      const back = leg.tendered - leg.amount;
      return b2`<li class="tender-row">
                        <button class="tender-edit" aria-label=${t5("ui.editTender", { name, amount })}
                                @click=${() => this.editTender(leg.id)}>
                          <ion-icon name=${payMethodIcon(leg.method.type, leg.method.name)} aria-hidden="true"></ion-icon>
                          <span class="tender-name">${name}</span>
                          <span class="tender-amount">${amount}</span>
                          ${back > 0 ? b2`<span class="tender-change">${t5("ui.change")} ${this.money(back)}</span>` : A}
                        </button>
                        <button class="tender-remove" aria-label=${t5("ui.removeTender", { name, amount })}
                                @click=${() => this.removeTender(leg.id)}>
                          <ion-icon name="close-outline" aria-hidden="true"></ion-icon>
                        </button>
                      </li>`;
    })}
                  </ul>` : A}

                <!-- El MÉTODO se elige AQUÍ, como en la pantalla de tender de cualquier TPV:
                     botones grandes con icono y NOMBRE (el dueño los renombra a su gusto, así que
                     un icono mudo no basta). Solo se pinta con más de un método activo. -->
                ${this.payMethods.length > 1 ? b2`
                  <div class="pay-methods" role="group" aria-label=${t5("ui.paymentMethod")}>
                    ${this.payMethods.map((m4) => {
      const marca = brandSvgFor(m4.type, m4.name);
      const nombre = payMethodDisplayName(m4, t5);
      return b2`
                      <button class="pm-btn" aria-pressed=${this.payMethod?.id === m4.id ? "true" : "false"}
                              title=${nombre}
                              @click=${() => {
        this.payMethod = m4;
        if (!needsTendered(m4) && !this.splitting) this.tendered = "";
      }}>
                        ${marca ? b2`<span class="brand">${o7(marca)}</span>` : b2`<ion-icon name=${payMethodIcon(m4.type, m4.name)}></ion-icon>`}
                        <span class="pm-name">${nombre}</span>
                      </button>`;
    })}
                  </div>` : A}

                <!-- Entregado/cambio/teclado SOLO en efectivo: con tarjeta se cobra el importe
                     exacto y no hay nada que teclear (lo decide requires_change, no un "si es
                     efectivo"). Los ATAJOS son el patrón Toast: el exacto y los redondeos por
                     encima — el cajero toca en vez de teclear y el cambio sale solo. -->
                ${needsTendered(this.payMethod) || this.splitting ? b2`
                    <!-- Repartiendo, lo que se teclea es el importe de ESTA pata (en efectivo, lo
                         ENTREGADO, que puede pasarse: la diferencia es el cambio). Decirlo importa:
                         con tarjeta, «Entregado» invitaría a teclear lo que da el cliente. -->
                    <div class="amt pay-amount-label">
                      <span>${this.splitting && !needsTendered(this.payMethod) ? t5("ui.legAmount") : t5("ui.tendered")}</span>
                      <span class="v">${this.money(this.tenderedNum)}</span>
                    </div>
                    ${(this.splitting ? this.splitChange : this.change) > 0 ? b2`<div class="amt big-change"><span>${t5("ui.change")}</span><span class="v">${this.money(this.splitting ? this.splitChange : this.change)}</span></div>` : A}
                    <!-- SIN atajos de importe (73/75/80…): Ioan los eliminó el 2026-07-19 y pidió
                         NO volver a añadirlos. El entregado se teclea en el numpad, punto. -->
                    <div class="numpad">
                      ${["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "C"].map((k2) => b2`<button @click=${() => this.tap(k2)}>${k2}</button>`)}
                    </div>` : b2`
                    <div class="amt pay-exact"><span>${t5("ui.payExact")}</span><span class="v">${this.money(this.payable)}</span></div>
                    <p class="pay-hint">${t5("ui.payCardHint", { amount: this.money(this.payable) })}</p>`}

                <!-- sales#159 — la puerta al reparto, y luego la tecla que toma cada pata.
                     Repartir es OPT-IN: mientras no se pida, la pantalla es la de un solo medio.
                     🔴 «Añadir» SIN importe tecleado cubre TODO el restante, así que la ÚLTIMA pata
                     es un solo toque. Es justo lo que le falta a Shopify, donde con 3+ medios hay
                     que teclear cada importe a mano y el flujo se atasca («I could not exit the
                     screen other than to mark the order as part paid») — inviable en hora punta. -->
                ${this.payable > 0 && !this.splitting ? b2`<button class="pay-split-btn" @click=${() => this.startSplit()}>
                      <ion-icon name="swap-horizontal-outline" aria-hidden="true"></ion-icon>${t5("ui.splitPayment")}
                    </button>` : A}
                ${this.splitting && this.remaining > 0 ? b2`<button class="pay-add" @click=${() => this.addTender()}>
                      <ion-icon name="add-outline" aria-hidden="true"></ion-icon>${t5("ui.addTender")}
                    </button>` : A}

                <!-- Imprimir deja de ser un botón gemelo del de cobrar (dos botones azules iguales
                     no dicen cuál hace qué): es una PREFERENCIA del cobro. -->
                <ion-item lines="none" class="print-row">
                  <ion-icon slot="start" name="print-outline"></ion-icon>
                  <ion-label>${t5("ui.printReceipt")}</ion-label>
                  <ion-toggle slot="end" .checked=${this.printOnCharge}
                              @ionChange=${(e7) => {
      this.printOnCharge = !!e7.detail.checked;
    }}></ion-toggle>
                </ion-item>

              </div>
              <div class="sheet-foot">
                ${this.error ? b2`<p class="pay-err">${this.error}</p>${this.renderCheckSalesLink()}` : A}
                <!-- UNA acción, dice lo que hace y por cuánto, y no exige scroll para alcanzarla.
                     El importe es el PAYABLE: con split decía «Cobrar 3,60 €» para cobrar 1,80 €. -->
                <!-- sales#159 — EL MOTIVO, ESCRITO EN LA PANTALLA. No dentro del botón y no en un
                     title: el motivo tiene que poder leerse sin tocar nada y sin un ratón. -->
                ${blockedWhy?.reason ? b2`<p class="pay-block-reason">${blockedWhy.reason}</p>` : A}
                <!-- UNA acción, dice lo que hace y por cuánto, y no exige scroll para alcanzarla.
                     El importe es el PAYABLE: con split decía «Cobrar 3,60 €» para cobrar 1,80 €.
                     🔴 aria-disabled, JAMAS disabled: en Ionic disabled es pointer-events:none
                     y en una tablet de mostrador el toque muere en silencio (sales#58). Aquí el
                     toque llega, confirm() lo para y CONTESTA con lo que falta. busy sí es
                     disabled de verdad: ahí no hay nada que contestar y un segundo toque cobraría
                     dos veces. -->
                <ion-button class="charge" expand="block" ?disabled=${this.busy}
                            aria-disabled=${blockedWhy ? "true" : A}
                            @click=${() => this.confirm(this.printOnCharge)}>
                  ${this.busy ? t5("ui.charging") : blockedWhy ? blockedWhy.short : this.tenders.length ? `${t5("ui.charge")} ${this.money(this.payable)}` : needsTendered(this.payMethod) ? `${t5("ui.charge")} ${this.money(this.payable)}` : t5("ui.chargeWithCard", { amount: this.money(this.payable) })}
                </ion-button>
              </div>
            </div>
          </div>` : A}

      <!-- PRECIO LIBRE: reutiliza el sheet del cobro (.scrim/.sheet/.numpad). Tecleas el importe y
           eliges el DEPARTAMENTO (categoría fiscal, que lleva su IVA); "Añadir" queda deshabilitado
           hasta tener importe > 0 y departamento (nunca una línea desnuda). -->
      ${this.modifierSheet ? b2`<div class="scrim" @click=${(e7) => {
      if (e7.target.classList.contains("scrim")) {
        this.modifierSheet = void 0;
      }
    }}>
            <div class="sheet">
              <div class="sheet-h">
                <span class="t">${this.modifierSheet.product.name}</span>
                <button class="x" @click=${() => {
      this.modifierSheet = void 0;
    }}>✕</button>
              </div>
              <div class="pay">
                ${this.modifierSheet.groups.map((g3) => b2`
                  <div class="dept-label">
                    ${g3.name}
                    <!-- La obligatoriedad se LEE de min/max: el cajero ve la misma regla que aplica
                         el servidor, en vez de una etiqueta que puede contradecirla. -->
                    <small>${g3.min >= 1 ? t5("ui.modifierRequired", { n: g3.min }) : g3.max > 0 ? t5("ui.modifierUpTo", { n: g3.max }) : t5("ui.modifierOptional")}</small>
                  </div>
                  <div class="dept-grid" role="group" aria-label=${g3.name}>
                    ${g3.options.map((o9) => b2`
                      <button class="dept-btn" aria-pressed=${this.modifierPicks.includes(o9.id) ? "true" : "false"}
                              @click=${() => this.toggleModifier(o9.id)}>
                        <span class="dn">${o9.name}</span>
                        <span class="dr">${o9.price_delta ? this.money(o9.price_delta) : ""}</span>
                      </button>`)}
                  </div>`)}
              </div>
              <div class="sheet-foot">
                <ion-button class="charge" expand="block" ?disabled=${!this.canConfirmModifiers()}
                            @click=${() => this.confirmModifiers()}>
                  ${this.canConfirmModifiers() ? t5("ui.add") : t5("ui.modifierPickOne")}
                </ion-button>
              </div>
            </div>
          </div>` : A}
      <!-- sales#153 · EL PICKER DEL MENÚ. HOJA ÚNICA con los grupos apilados y scroll, no wizard:
           es a lo que ha convergido el mercado táctil (Odoo 18 y 19; Toast construyó «Open View»
           para salir del wizard, «rather than in a sequential way»). -->
      ${this.comboSheet ? b2`<div class="scrim" @click=${(e7) => {
      if (e7.target.classList.contains("scrim")) {
        this.comboSheet = void 0;
      }
    }}>
            <div class="sheet" data-combo-sheet>
              <div class="sheet-h">
                <span class="t">${this.comboSheet.combo.name}</span>
                <button class="x" @click=${() => {
      this.comboSheet = void 0;
    }}>✕</button>
              </div>
              <div class="pay">
                ${this.comboSheet.combo.groups.map((g3) => {
      const picked = this.comboPicksIn(g3);
      const needs = picked.length < g3.min;
      const full = this.comboGroupFull(g3);
      const counter = this.comboGroupCounter(g3);
      return b2`
                  <div class="combo-group" data-group-id=${g3.id}
                       data-needs=${needs ? "true" : "false"}
                       data-full=${full ? "true" : "false"}
                       data-flagged=${this.comboNeedsGroup === g3.id ? "true" : "false"}>
                    <div class="dept-label">
                      ${g3.name}
                      <!-- El contador de Toast Open View: explica la regla ANTES de chocar con
                           ella. La marca de estado NO es solo color (no pasaría contraste). -->
                      ${counter ? b2`<small class="combo-counter">
                        <span aria-hidden="true">${needs ? "\u2715" : "\u2713"}</span>
                        ${picked.length}/${counter}
                      </small>` : b2`<small>${t5("ui.modifierOptional")}</small>`}
                    </div>
                    <div class="dept-grid" role="group" aria-label=${g3.name}>
                      ${g3.options.map((o9) => {
        const n6 = this.comboCount(o9.option_id);
        const delta = this.comboDelta(o9);
        const barred = full && n6 === 0 && g3.max !== 1;
        return b2`
                        <button class="dept-btn combo-opt" data-option-id=${o9.option_id}
                                aria-pressed=${n6 > 0 ? "true" : "false"}
                                aria-disabled=${barred ? "true" : "false"}
                                data-barred=${barred ? "true" : "false"}
                                @click=${() => this.pickComboOption(g3, o9.option_id)}>
                          <span class="dn">${this.comboOptionName(o9)}${n6 > 1 ? b2` <b>×${n6}</b>` : A}</span>
                          ${delta ? b2`<span class="dr" data-delta>${delta}</span>` : A}
                        </button>
                        ${g3.allow_repeat && n6 > 0 ? b2`<button class="combo-less" data-drop-option=${o9.option_id}
                                         aria-label=${t5("ui.comboRemoveOne", { name: this.comboOptionName(o9) })}
                                         @click=${() => this.dropComboOption(o9.option_id)}>−</button>` : A}`;
      })}
                    </div>
                  </div>`;
    })}
              </div>
              <div class="sheet-foot">
                <!-- El TOTAL EN VIVO. No es opinión: Odoo lo añadió del 18 al 19. -->
                <div class="combo-total" data-combo-total>
                  <span>${t5("ui.colTotal")}</span>
                  <strong>${this.money(comboTotalCents(this.comboSheet.combo, this.comboPicks))}</strong>
                </div>
                <!-- 🔴 Botón PLANO a propósito, no ion-button: el disabled de Ionic es
                     pointer-events:none y se TRAGA el toque, dejando el motivo en title —
                     hover, imposible en un TPV. Y en Shadow DOM Ionic mueve los aria-* a su
                     <button> interno, así que un selector sobre el host no casaría nunca. Aquí el
                     aria-disabled y el gancho data-blocked viven en el elemento que controlo. -->
                ${(() => {
      const blocked = this.comboBlocked();
      return b2`<button class="combo-confirm" data-combo-confirm
                          aria-disabled=${blocked ? "true" : "false"}
                          data-blocked=${blocked ? "true" : "false"}
                          @click=${() => this.confirmCombo()}>
                    ${blocked ? blocked.text : `${t5("ui.add")} \xB7 ${this.money(comboTotalCents(this.comboSheet.combo, this.comboPicks))}`}
                  </button>`;
    })()}
              </div>
            </div>
          </div>` : A}
      ${this.openPriceOpen ? b2`<div class="scrim" @click=${(e7) => {
      if (e7.target.classList.contains("scrim")) this.openPriceOpen = false;
    }}>
            <div class="sheet">
              <div class="sheet-h">
                <span class="t">${t5("ui.openPrice")}</span>
                <button class="x" @click=${() => {
      this.openPriceOpen = false;
    }}>✕</button>
              </div>
              <div class="sheet-top"><div class="pay-total">${this.money(this.openAmountCents)}</div></div>
              <div class="pay">
                <div class="numpad">
                  ${["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "C"].map((k2) => b2`<button @click=${() => this.tapOpen(k2)}>${k2}</button>`)}
                </div>
                <div class="dept-label">${t5("ui.department")}</div>
                <div class="dept-grid" role="group" aria-label=${t5("ui.department")}>
                  ${this.taxCategories.map((c5) => b2`
                    <button class="dept-btn" aria-pressed=${this.openDept === c5.key ? "true" : "false"}
                            @click=${() => {
      this.openDept = c5.key;
    }}>
                      <span class="dn">${deptDisplayName(c5)}</span>
                      <span class="dr">${this.deptRateLabel(c5.key)}</span>
                    </button>`)}
                  ${!this.taxCategories.length ? b2`<div class="dept-empty">${t5("ui.noDepartments")}</div>` : A}
                </div>
              </div>
              <div class="sheet-foot">
                <ion-button class="charge" expand="block"
                            ?disabled=${!(this.openAmountCents > 0 && this.openDept)}
                            @click=${() => this.addOpenPrice()}>
                  ${t5("ui.add")}${this.openAmountCents > 0 ? ` ${this.money(this.openAmountCents)}` : ""}
                </ion-button>
              </div>
            </div>
          </div>` : A}

      <!-- LINE NOTE (sales#156): the free-text sheet the line's button opens. Same
           <div class="scrim"><div class="sheet"> as the discount — it rises from the bottom with
           its handle — because ion-action-sheet does not host rich content and Ionic overlays
           inside a shadow root get re-parented to the body (ADR-0028). Focus lands on the
           textarea: writing is what one comes here to do. -->
      ${this.noteSheet ? b2`<div class="scrim" @click=${(e7) => {
      if (e7.target.classList.contains("scrim")) this.noteSheet = void 0;
    }}>
            <div class="sheet note-sheet">
              <div class="sheet-h">
                <span class="t">${t5("ui.lineNoteOf", { name: this.cart.find((l3) => l3.line_id === this.noteSheet?.lineId)?.name ?? "" })}</span>
                <button class="x" aria-label=${t5("ui.closeAction")} @click=${() => {
      this.noteSheet = void 0;
    }}>✕</button>
              </div>
              <div class="sheet-top">
                <!-- sales#206 — the chips the business preconfigured. With none configured
                     NOTHING is painted here and the sheet is exactly the one sales#156 shipped:
                     a business that never configures anything pays nothing for this existing. -->
                ${this.quickNotesState === "loading" || this.quickNotesState === "error" ? b2`<p class="note-chips-state">
                      ${t5(this.quickNotesState === "loading" ? "ui.lineNoteQuickLoading" : "ui.lineNoteQuickError")}
                    </p>` : A}
                ${this.quickNotes.length ? b2`<div class="note-chips">
                      ${this.quickNotes.map((n6) => b2`
                        <button type="button" class="note-chip"
                                aria-pressed=${hasQuickNote(this.noteInput, n6.text) ? "true" : "false"}
                                @click=${() => this.toggleQuickNoteChip(n6.text)}>${n6.text}</button>`)}
                    </div>` : A}
                <textarea class="note-input" rows="3" maxlength="255" autofocus
                          aria-label=${t5("ui.lineNote")} placeholder=${t5("ui.lineNotePlaceholder")}
                          .value=${this.noteInput}
                          @input=${(e7) => {
      this.noteInput = e7.target.value;
    }}></textarea>
                <p class="note-hint">${t5("ui.lineNoteHint")}</p>
              </div>
              <div class="sheet-foot discount-foot">
                <ion-button fill="clear" color="medium"
                  @click=${() => this.applyLineNote("")}>${t5("ui.lineNoteRemove")}</ion-button>
                <ion-button class="charge note-save" expand="block"
                  @click=${() => this.applyLineNote(this.noteInput)}>${t5("ui.lineNoteSave")}</ion-button>
              </div>
            </div>
          </div>` : A}

      <!-- DESCUENTO (sales#71): mismo sheet/numpad del cobro. Se teclea el %, y Aplicar; 0 = quitar.
           Sobre la LÍNEA elegida o sobre el TICKET entero. El servidor prorratea y revalida
           allow_discounts; aquí solo se recoge la cifra. -->
      ${this.discountSheet ? b2`<div class="scrim" @click=${(e7) => {
      if (e7.target.classList.contains("scrim")) this.discountSheet = void 0;
    }}>
            <div class="sheet discount-sheet">
              <div class="sheet-h">
                <span class="t">${this.discountSheet.target === "ticket" ? t5("ui.discountTicket") : t5("ui.discountLineOf", { name: this.cart.find((l3) => l3.line_id === this.discountSheet?.lineId)?.name ?? "" })}</span>
                <button class="x" aria-label=${t5("ui.closeAction")} @click=${() => {
      this.discountSheet = void 0;
    }}>✕</button>
              </div>
              ${this.discountSheet.target === "ticket" ? b2`
              <!-- sales#113: % o € (importe fijo, «5 € menos»); ambos estándar en el mercado. -->
              <ion-segment class="discount-mode" value=${this.discountMode}
                @ionChange=${(e7) => this.setDiscountMode(e7.detail.value === "amount" ? "amount" : "percent")}>
                <ion-segment-button value="percent"><ion-label>%</ion-label></ion-segment-button>
                <ion-segment-button value="amount"><ion-label>€</ion-label></ion-segment-button>
              </ion-segment>` : A}
              <div class="sheet-top"><div class="pay-total">${this.discountMode === "amount" ? this.money(this.discountInputCents) : `${this.discountInput || "0"} %`}</div></div>
              <div class="pay">
                <div class="numpad">
                  ${["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "C"].map((k2) => b2`<button @click=${() => this.tapDiscount(k2)}>${k2}</button>`)}
                </div>
              </div>
              <div class="sheet-foot discount-foot">
                <ion-button fill="outline" color="medium"
                  @click=${() => this.discountMode === "amount" ? this.applyDiscountAmount(0) : this.applyDiscount(0)}>${t5("ui.discountRemove")}</ion-button>
                ${this.discountMode === "amount" ? b2`<ion-button class="charge" expand="block" ?disabled=${this.discountInputCents > cartTotal(this.cart, this.ticketDiscount)}
                      @click=${() => this.applyDiscountAmount(this.discountInputCents)}>
                      ${t5("ui.discountApply")}${this.discountInputCents > 0 ? ` \u2212${this.money(this.discountInputCents)}` : ""}
                    </ion-button>` : b2`<ion-button class="charge" expand="block" @click=${() => this.applyDiscount(this.discountInputPct)}>
                      ${t5("ui.discountApply")}${this.discountInputPct > 0 ? ` \u2212${this.discountInputPct}%` : ""}
                    </ion-button>`}
              </div>
            </div>
          </div>` : A}

      <!-- APARCAR sin mesa: se pide un NOMBRE (default: la hora, patrón Loyverse) pre-seleccionado
           para sobreescribirlo de un toque. <dialog> nativo: top layer, inmune al transform del
           drawer del carrito (gotcha conocido de overlays en ancestros con transform). -->
      ${this.parkPromptOpen ? b2`
        <dialog class="park-dialog" open>
          <h3>${t5("ui.parkTitle")}</h3>
          <p>${t5("ui.parkNameHint")}</p>
          <input type="text" .value=${this.parkName} placeholder=${t5("ui.parkNamePlaceholder")}
                 aria-label=${t5("ui.parkNameLabel")}
                 @input=${(e7) => {
      this.parkName = e7.target.value;
    }}
                 @keydown=${(e7) => {
      if (e7.key === "Enter") {
        this.parkPromptOpen = false;
        void this.parkWith(this.parkName);
      }
    }} />
          <div class="dlg-actions">
            <ion-button fill="clear" @click=${() => {
      this.parkPromptOpen = false;
    }}>${t5("ui.cancel")}</ion-button>
            <ion-button class="park-confirm"
                        @click=${() => {
      this.parkPromptOpen = false;
      void this.parkWith(this.parkName);
    }}>
              ${t5("ui.parkCurrentSale")}
            </ion-button>
          </div>
        </dialog>` : A}

      <!-- sales#179 — TRANSFER the check to somebody else. Same native <dialog> as parking
           (ion-action-sheet does not host rich content and Ionic overlays inside a Lit shadow root
           get re-parented to the body, ADR-0028), so on mobile it rises as a sheet. -->
      ${this.staffPickerOpen ? b2`
        <dialog class="staff-dialog" open>
          <h3>${t5("ui.staffPickerTitle")}</h3>
          <p>${t5("ui.staffPickerHint")}</p>
          <div class="staff-list">
            <button class="staff-opt" type="button" data-testid="staff-option-me"
                    ?data-current=${!this.staffId} @click=${() => this.pickStaff()}>
              ${t5("ui.staffMeOption")}
            </button>
            ${this.staffPickerState === "loading" ? b2`<p class="staff-note" data-testid="staff-loading">${t5("ui.staffLoading")}</p>` : A}
            ${this.staffPickerState === "error" ? b2`<p class="staff-note" data-testid="staff-error">${t5("ui.staffLoadFailed")}</p>` : A}
            ${this.staffPickerState === "ready" && !this.hubUsers.length ? b2`<p class="staff-note" data-testid="staff-empty">${t5("ui.staffPickerEmpty")}</p>` : A}
            ${this.hubUsers.map((u5) => b2`
              <button class="staff-opt" type="button" data-testid="staff-option"
                      ?data-current=${this.staffId === u5.id} @click=${() => this.pickStaff(u5)}>
                ${u5.name}
              </button>`)}
          </div>
          <div class="dlg-actions">
            <ion-button fill="clear" @click=${() => {
      this.staffPickerOpen = false;
    }}>${t5("ui.cancel")}</ion-button>
          </div>
        </dialog>` : A}

      <!-- CARRITO SUCIO al recuperar/tocar mesa: ¿qué hacemos con la cuenta actual? Aparcar es la
           salida segura (primario); eliminar anula con rastro (danger). Cancelar solo desde la
           lista — al tocar una mesa el filler ya cambió su selección y cancelar los descoordina. -->
      ${this.dirtyOpen ? b2`
        <dialog class="dirty-dialog" open>
          <h3>${t5("ui.dirtyCartTitle")}</h3>
          <p>${t5("ui.dirtyCartBody")}</p>
          <div class="dlg-actions">
            ${this.dirtyAllowCancel ? b2`<ion-button fill="clear" @click=${() => this.answerDirty("cancel")}>${t5("ui.cancel")}</ion-button>` : A}
            <ion-button class="discard-opt" color="danger" fill="outline"
                        @click=${() => this.answerDirty("discard")}>${t5("ui.discardAndOpen")}</ion-button>
            <ion-button class="park-opt" @click=${() => this.answerDirty("park")}>${t5("ui.parkAndOpen")}</ion-button>
          </div>
        </dialog>` : A}

      <!-- Buscador de productos = ok-spotlight-search (OutfitKit): overlay translúcido flotante que
           NO empuja la rejilla. La lupa del catbar controla su apertura. Al pulsar un resultado se
           añade al carrito y se cierra. -->
      <ok-spotlight-search placeholder=${t5("ui.searchProductPlaceholder")} .value=${this.q}
        @ok-open=${(e7) => {
      this.searchOpen = e7.detail.open;
      if (!e7.detail.open) this.q = "";
    }}
        @ok-input=${(e7) => {
      this.q = e7.detail.value;
    }}>
        <ion-list class="sp-list" lines="none">
          ${this.searchResults.map((p4) => {
      const blocked = this.blockedReason(p4);
      return b2`
            <ion-item button detail="false" aria-disabled=${blocked ? "true" : A} title=${blocked ?? A}
              @click=${() => {
        this.add(p4);
        this.q = "";
        this.renderRoot.querySelector("ok-spotlight-search")?.close?.();
      }}>
              <ion-label><h3>${p4.name}</h3>${blocked ? b2`<p class="sp-warn">${blocked}</p>` : p4.sku ? b2`<p>${p4.sku}</p>` : A}</ion-label>
              <span slot="end" class="sp-price">${this.money(Number(p4.price))}</span>
            </ion-item>`;
    })}
          ${this.q.trim() && !this.searchResults.length ? b2`<div class="empty">${t5("ui.noProducts")}</div>` : A}
        </ion-list>
      </ok-spotlight-search>

      ${renderDocumentModal({ saleId: this.docSaleId, onClose: () => {
      this.docSaleId = void 0;
    }, t: t5 })}
      <!-- CUENTA previa (ADR-0141): lo que se lleva a la mesa antes de cobrar. NO es fiscal — sin
           número de serie ni QR VeriFactu; el tiquet fiscal lo emite el cobro. -->
      <ion-modal class="doc-modal" .isOpen=${this.prebillOpen}
                 @ionModalDidDismiss=${() => {
      this.prebillOpen = false;
    }}>
        <ion-header><ion-toolbar>
          <ion-title>${t5("ui.prebillTitle")}</ion-title>
          <ion-buttons slot="end">
            <ion-button title=${t5("ui.print")} aria-label=${t5("ui.print")} @click=${() => void this.printPrebill()}>
              <ion-icon slot="icon-only" name="print-outline"></ion-icon>
            </ion-button>
            <ion-button title=${t5("ui.close")} aria-label=${t5("ui.close")}
                        @click=${() => {
      this.prebillOpen = false;
    }}>
              <ion-icon slot="icon-only" name="close-outline"></ion-icon>
            </ion-button>
          </ion-buttons>
        </ion-toolbar></ion-header>
        <ion-content class="doc-body ion-padding">
          <!-- .receipt and .labels are the ONLY properties ok-receipt reads. The bill used to be
               handed to it on .data —a property that does not exist— so receipt stayed undefined
               and the document was a white box reading «No receipt data.» in English on a Spanish
               hub (sales#87). Both defects were that one line: no document AND no labels, so the
               component fell back to its own built-in English DEFAULT_LABELS.
               (No backticks in comments inside a Lit template: they close the literal.) -->
          ${this.renderPrebillDoc()}
        </ion-content>
      </ion-modal>
    </div>`;
  }
};
__decorateClass([
  n4()
], ErpPosTouch.prototype, "chrome", 2);
__decorateClass([
  n4({ type: Boolean })
], ErpPosTouch.prototype, "fullscreen", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "moreOpen", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "products", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "categories", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "taxCategories", 2);
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
], ErpPosTouch.prototype, "businessName", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "paying", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "tendered", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "openPriceOpen", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "ticketDiscount", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "discountSheet", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "noteSheet", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "noteInput", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "quickNotes", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "quickNotesState", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "discountInput", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "ticketDiscountAmount", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "discountMode", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "openAmount", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "modifierSheet", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "modifierPicks", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "comboCatalog", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "comboCatalogFailed", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "brokenCatalogApps", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "catalogAppAbsent", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "comboSheet", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "comboPicks", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "comboNeedsGroup", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "openDept", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "payMethod", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "splitting", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "tenders", 2);
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
], ErpPosTouch.prototype, "blockedNotice", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "docSaleId", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "checkoutUnknown", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "parked", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "splitSel", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "covered", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "parkedOpen", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "cartOpen", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "orderLabel", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "orderView", 2);
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
], ErpPosTouch.prototype, "modifierCatalog", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "parkPromptOpen", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "parkName", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "dirtyOpen", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "dirtyAllowCancel", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "armedDelete", 2);
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
__decorateClass([
  r5()
], ErpPosTouch.prototype, "customerTaxId", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "customerAddress", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "simplifiedMaxCents", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "staffId", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "staffName", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "staffPickerOpen", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "hubUsers", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "staffPickerState", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "missingChargeApp", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "authoritative", 2);
__decorateClass([
  r5()
], ErpPosTouch.prototype, "padPrimed", 2);
define("erp-pos-touch", ErpPosTouch);

// ui/components/erp-pos/erp-pos.ts
var ErpPos = class extends i3 {
  constructor() {
    super(...arguments);
    this.chrome = "";
    this.fullscreen = false;
  }
  static {
    this.styles = i`:host { display:block; height:100%; }`;
  }
  render() {
    return b2`<erp-pos-touch
      chrome=${this.chrome}
      ?fullscreen=${this.fullscreen}
    ></erp-pos-touch>`;
  }
};
__decorateClass([
  n4()
], ErpPos.prototype, "chrome", 2);
__decorateClass([
  n4({ type: Boolean })
], ErpPos.prototype, "fullscreen", 2);
define("erp-pos", ErpPos);

// lit-html/directive-helpers.js
var { I: t6 } = j;
var i5 = (o9) => o9;
var s4 = () => document.createComment("");
var v2 = (o9, n6, e7) => {
  const l3 = o9._$AA.parentNode, d3 = void 0 === n6 ? o9._$AB : n6._$AA;
  if (void 0 === e7) {
    const i7 = l3.insertBefore(s4(), d3), n7 = l3.insertBefore(s4(), d3);
    e7 = new t6(i7, n7, o9, o9.options);
  } else {
    const t7 = e7._$AB.nextSibling, n7 = e7._$AM, c5 = n7 !== o9;
    if (c5) {
      let t8;
      e7._$AQ?.(o9), e7._$AM = o9, void 0 !== e7._$AP && (t8 = o9._$AU) !== n7._$AU && e7._$AP(t8);
    }
    if (t7 !== d3 || c5) {
      let o10 = e7._$AA;
      for (; o10 !== t7; ) {
        const t8 = i5(o10).nextSibling;
        i5(l3).insertBefore(o10, d3), o10 = t8;
      }
    }
  }
  return e7;
};
var u3 = (o9, t7, i7 = o9) => (o9._$AI(t7, i7), o9);
var m3 = {};
var p3 = (o9, t7 = m3) => o9._$AH = t7;
var M2 = (o9) => o9._$AH;
var h3 = (o9) => {
  o9._$AR(), o9._$AA.remove();
};

// lit-html/directives/repeat.js
var u4 = (e7, s5, t7) => {
  const r6 = /* @__PURE__ */ new Map();
  for (let l3 = s5; l3 <= t7; l3++) r6.set(e7[l3], l3);
  return r6;
};
var c4 = e5(class extends i4 {
  constructor(e7) {
    if (super(e7), e7.type !== t3.CHILD) throw Error("repeat() can only be used in text expressions");
  }
  dt(e7, s5, t7) {
    let r6;
    void 0 === t7 ? t7 = s5 : void 0 !== s5 && (r6 = s5);
    const l3 = [], o9 = [];
    let i7 = 0;
    for (const s6 of e7) l3[i7] = r6 ? r6(s6, i7) : i7, o9[i7] = t7(s6, i7), i7++;
    return { values: o9, keys: l3 };
  }
  render(e7, s5, t7) {
    return this.dt(e7, s5, t7).values;
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
      const e7 = y3.get(a3[k2]), t8 = void 0 !== e7 ? d3[e7] : null;
      if (null === t8) {
        const e8 = v2(s5, d3[x2]);
        u3(e8, p4[k2]), v3[k2] = e8;
      } else v3[k2] = u3(t8, p4[k2]), v2(s5, d3[x2], t8), d3[e7] = null;
      k2++;
    } else h3(d3[j2]), j2--;
    else h3(d3[x2]), x2++;
    for (; k2 <= w2; ) {
      const e7 = v2(s5, v3[w2 + 1]);
      u3(e7, p4[k2]), v3[k2++] = e7;
    }
    for (; x2 <= j2; ) {
      const e7 = d3[x2++];
      null !== e7 && h3(e7);
    }
    return this.ut = a3, p3(s5, v3), E;
  }
});

// lit-html/directives/style-map.js
var n5 = "important";
var i6 = " !" + n5;
var o8 = e5(class extends i4 {
  constructor(t7) {
    if (super(t7), t7.type !== t3.ATTRIBUTE || "style" !== t7.name || t7.strings?.length > 2) throw Error("The `styleMap` directive must be used in the `style` attribute and must be the only part in the attribute.");
  }
  render(t7) {
    return Object.keys(t7).reduce((e7, r6) => {
      const s5 = t7[r6];
      return null == s5 ? e7 : e7 + `${r6 = r6.includes("-") ? r6 : r6.replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g, "-$&").toLowerCase()}:${s5};`;
    }, "");
  }
  update(e7, [r6]) {
    const { style: s5 } = e7.element;
    if (void 0 === this.ft) return this.ft = new Set(Object.keys(r6)), this.render(r6);
    for (const t7 of this.ft) null == r6[t7] && (this.ft.delete(t7), t7.includes("-") ? s5.removeProperty(t7) : s5[t7] = null);
    for (const t7 in r6) {
      const e8 = r6[t7];
      if (null != e8) {
        this.ft.add(t7);
        const r7 = "string" == typeof e8 && e8.endsWith(i6);
        t7.includes("-") || r7 ? s5.setProperty(t7, r7 ? e8.slice(0, -11) : e8, r7 ? n5 : "") : s5[t7] = e8;
      }
    }
    return E;
  }
});

// @erplora/outfitkit/dist/ok-data-table.js
var CSV_BOM = "\uFEFF";
var WINDOWS_1252_C1 = [
  8364,
  129,
  8218,
  402,
  8222,
  8230,
  8224,
  8225,
  710,
  8240,
  352,
  8249,
  338,
  141,
  381,
  143,
  144,
  8216,
  8217,
  8220,
  8221,
  8226,
  8211,
  8212,
  732,
  8482,
  353,
  8250,
  339,
  157,
  382,
  376
];
function decodeWindows1252(bytes) {
  let text = "";
  for (const byte of bytes) {
    text += String.fromCharCode(byte >= 128 && byte <= 159 ? WINDOWS_1252_C1[byte - 128] : byte);
  }
  return text;
}
function decodeCsvBuffer(buf) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = decodeWindows1252(new Uint8Array(buf));
  }
  return text.charCodeAt(0) === 65279 ? text.slice(1) : text;
}
var __defProp11 = Object.defineProperty;
var __decorateClass11 = (decorators, target, key, kind) => {
  var result = void 0;
  for (var i7 = decorators.length - 1, decorator; i7 >= 0; i7--)
    if (decorator = decorators[i7])
      result = decorator(target, key, result) || result;
  if (result) __defProp11(target, key, result);
  return result;
};
var DEFAULT_LABELS5 = {
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
  recordPlural: "records",
  loadMore: "Load more"
};
var ES_LABELS = {
  search: "Buscar\u2026",
  empty: "Sin resultados",
  filters: "Filtros",
  clear: "Limpiar",
  apply: "Aplicar",
  selected: "{n} seleccionados",
  importCsv: "Importar CSV",
  exportCsv: "Exportar CSV",
  add: "A\xF1adir",
  moreActions: "M\xE1s acciones",
  rowsPerPage: "Filas por p\xE1gina",
  perPageShort: "{n} / p\xE1g.",
  viewList: "Vista lista",
  viewCards: "Vista tarjetas",
  columnsVisible: "Columnas visibles",
  columns: "Columnas",
  actions: "Acciones",
  close: "Cerrar",
  newRecord: "Nuevo",
  form: "Formulario",
  filterPlaceholder: "Filtrar\u2026",
  from: "Desde",
  to: "Hasta",
  fromOf: "{label} desde",
  toOf: "{label} hasta",
  gte: "\u2265",
  lte: "\u2264",
  noValues: "Sin valores",
  selectAll: "Seleccionar todo",
  selectRow: "Seleccionar fila",
  select: "Seleccionar",
  showing: "Mostrando {from}\u2013{to} de",
  recordSingular: "registro",
  recordPlural: "registros",
  loadMore: "Cargar m\xE1s"
};
var _OkDataTable = class _OkDataTable2 extends i3 {
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
    this.rowClickable = false;
    this.selectable = false;
    this.inlineFilters = false;
    this.menuActions = [];
    this.q = "";
    this.clientPage = 0;
    this.clientPageSize = 0;
    this.mobileShown = 0;
    this.clientSort = "";
    this.clientSortDir = "asc";
    this.clientFilters = {};
    this.filterDraft = {};
    this.panel = "none";
    this.viewMode = "table";
    this.viewChosenByUser = false;
    this.isMobile = false;
    this.xOverflow = false;
    this.hiddenKeys = /* @__PURE__ */ new Set();
    this.internalSelection = /* @__PURE__ */ new Set();
    this.menuOpen = false;
    this.onLocaleChanged = () => this.requestUpdate();
    this.onWindowResize = () => this.measureXOverflow();
    this.onSearch = (ev) => {
      const value = ev.target.value ?? "";
      if (this.serverSide) {
        this.emit("searchChange", value);
      } else {
        this.q = value;
        this.clientPage = 0;
        this.mobileShown = 0;
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

    /* Panel lateral derecho (drawer) DENTRO de la tabla: filtros / alta-edición. Base (sin media):
       overlay absoluto — es lo que había hasta #75 y lo que ve un navegador sin media queries. */
    .tk-scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.18); z-index: 19; }
    .drawer { position: absolute; top: 0; right: 0; height: 100%; width: 340px; max-width: 88%;
      background: var(--background); border-left: 1px solid var(--border-color);
      display: flex; flex-direction: column; z-index: 20;
      animation: tk-slide-in 0.18s ease; }
    @keyframes tk-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
    /* #75 — El panel EMPUJA en escritorio y es HOJA COMPLETA en móvil; nunca tapa a medias.
       Medido en el hub (Servicios/Citas): a 1440 el overlay de 340px se pintaba ENCIMA de
       «Duración», «Acciones» y el selector de columnas, con el 90% de la tabla vacío a la
       izquierda; a 390 dejaba una tira de 45px de tabla (media lupa, medio «Co…») que hacía
       parecer el formulario un pop-up mal puesto. Square Dashboard reduce la tabla con un panel
       fijo; Fresha/Shopify/Odoo abren una hoja a pantalla completa en móvil.
       ≥ 834px: mientras hay panel, .card pasa a rejilla de DOS columnas (tabla | panel 360px):
       la tabla se estrecha (ya sabe hacer scroll-x, #67) y nada queda tapado. */
    @media (min-width: 834px) {
      .card.has-panel { display: grid; grid-template-columns: minmax(0, 1fr) 360px; grid-template-rows: auto minmax(0, 1fr) auto; }
      .card.has-panel > .bar { grid-column: 1; grid-row: 1; }
      .card.has-panel > .scroll, .card.has-panel > .cards-grid, .card.has-panel > .empty { grid-column: 1; grid-row: 2; min-height: 0; overflow: auto; }
      .card.has-panel > .pager { grid-column: 1; grid-row: 3; }
      .card.has-panel > .drawer { position: static; grid-column: 2; grid-row: 1 / -1; width: auto; max-width: none; height: auto; min-height: 0; animation: none; }
      .card.has-panel > .tk-scrim { display: none; }
    }
    /* < 834px: hoja a pantalla completa con su cabecera (título + Cerrar); sin tira residual.
       position:fixed dentro de ion-content se ancla al área de contenido (contain), que es justo el hueco
       bajo la cabecera de la app: el usuario conserva el título de la página. */
    @media (max-width: 833.98px) {
      .drawer { position: fixed; inset: 0; top: var(--ok-sheet-top, 0px); width: 100%; max-width: none; height: auto; border-left: 0; z-index: 1000; }
      .tk-scrim { display: none; }
    }
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
    /* #76 — El alta en MÓVIL: botón primario CON etiqueta y área táctil de 44px, en vez del «+»
       icónico de 36px al final de la barra. Fresha/Square/Shopify POS ponen la acción primaria
       de la lista como botón visible con texto (o FAB), nunca como icono anónimo. */
    .add-btn { min-height: 44px; --border-radius: 10px; --padding-start: 0.9rem; --padding-end: 1rem; margin: 0; font-weight: 600; }
    .add-btn ion-icon { margin-inline-end: 0.35rem; }

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
    /* #67 — La barra horizontal es PERMANENTE cuando hay desbordamiento: la overlay de macOS se
       esconde a los pocos ms y deja la tabla sin ninguna pista de que sigue a la derecha. Al
       declarar ::-webkit-scrollbar el navegador pinta la clásica, que ocupa sitio y se ve. */
    .scroll { overflow-x: auto; }
    .scroll::-webkit-scrollbar { height: 10px; }
    .scroll::-webkit-scrollbar-track { background: transparent; }
    .scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--color) 25%, transparent); border-radius: 6px; }
    .scroll::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--color) 40%, transparent); }
    .grid { min-width: max-content; font-size: 14px; }
    .grow { display: grid; align-items: center; gap: 0.5rem; padding: 0 1rem; }
    .ghead { position: sticky; top: 0; z-index: 2; border-bottom: 1px solid var(--border-color);
      background: var(--header-background); padding-top: 0.55rem; padding-bottom: 0.55rem; }
    .gcell { display: flex; align-items: center; min-width: 0; }
    .gcell > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .gcell.right { justify-content: flex-end; text-align: right; }
    .gcell.center { justify-content: center; text-align: center; }
    /* #67 — COLUMNA DE ACCIONES FIJADA. Con seis columnas o más la rejilla desborda por diseño
       (min-width: max-content) y el botón que abre el registro se iba fuera de la pantalla: a
       1440px quedaba a 335px del borde, sin nada que lo delatara. Se queda pegada al borde
       derecho, como en Zendesk/Freshdesk/Shopify. Con background:inherit la hereda de la fila (que
       por eso es opaca), así conserva hover y selección sin que se lea nada por debajo. */
    .gcell.actions-col { position: sticky; right: 0; z-index: 1; background: inherit;
      margin-right: -1rem; padding-right: 1rem; }
    /* La sombra solo aparece cuando de verdad hay algo escondido a la izquierda (clase x-overflow);
       si la tabla cabe entera no se pinta nada. */
    .scroll.x-overflow .gcell.actions-col { box-shadow: -10px 0 10px -10px color-mix(in srgb, var(--color) 45%, transparent); }
    .ghead .gcell.actions-col { z-index: 3; }
    .gh { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-muted); }
    .gh.sortable { cursor: pointer; user-select: none; white-space: nowrap; transition: background-color var(--ok-transition, 150ms ease), color var(--ok-transition, 150ms ease), box-shadow var(--ok-transition, 150ms ease), transform 120ms ease; }
    @media (hover: hover) {
      .gh.sortable:hover { color: var(--color); }
    }
    /* Caret de orden (3 estados, icono Ionic): neutral atenuado / activo en color primario. */
    .caret { display: inline-flex; align-items: center; margin-left: 0.25rem; flex: 0 0 auto; font-size: 13px; opacity: 0.3; }
    .caret.on { opacity: 1; color: var(--primary); }
    .grow-data { background: var(--background); border-bottom: 1px solid var(--border-color-soft); padding-top: 0.6rem; padding-bottom: 0.6rem; transition: background-color var(--ok-transition, 150ms ease), color var(--ok-transition, 150ms ease), box-shadow var(--ok-transition, 150ms ease), transform 120ms ease; }
    .grow-data:last-child { border-bottom: 0; }
    @media (hover: hover) {
      .grow-data:hover { background: linear-gradient(var(--row-hover), var(--row-hover)), var(--background); }
    }
    .grow-data:active { transform: scale(0.995); }
    .grow-data.selected { background: linear-gradient(color-mix(in srgb, var(--primary) 10%, transparent), color-mix(in srgb, var(--primary) 10%, transparent)), var(--background); }
    /* #67 — Fila clicable (opt-in row-clickable): es lo primero que intenta el usuario y lo que
       hacen Odoo, Jira SM, Shopify o Square en sus listados. */
    .grow-data.clickable { cursor: pointer; }
    .grow-data.clickable:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
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
    /* #74 — Tarjeta clicable (opt-in row-clickable): la mitad de #67 que faltaba. La vista de
       tarjetas es la que la tabla elige SOLA en móvil, así que sin esto el registro no se podía
       abrir desde un teléfono (medido con combos 0.1.4: 0 rowClick a 390px). */
    ion-card.rcard.clickable { cursor: pointer; }
    ion-card.rcard.clickable:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
    @media (prefers-reduced-motion: reduce) {
      .gh.sortable:hover, .gh.sortable:active,
      .grow-data:hover, .grow-data:active { transform: none; }
    }
    /* Header: ion-card-header as a single row (icon + title + checkbox), keeping Ionic's padding.
       #79 — flex-direction/flex-wrap are SPELLED OUT on purpose: in ios mode (the mode the Hub
       shell pins, ADR-0143) Ionic's own host CSS gives ion-card-header a column direction, so a
       rule that only sets display:flex inherits it and the three children stack on three lines.
       Under md the same rule looked right, which is why it shipped. */
    ion-card-header.rcard-head { display: flex; flex-direction: row; flex-wrap: nowrap; align-items: center; gap: 0.5rem; }
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
    /* Las acciones de fila son icon-only y de tamaño small en escritorio. En tablet/móvil se
     * amplía el host completo (no solo el icono) para que el área táctil alcance 44×44 px. */
    @media (pointer: coarse), (max-width: 834px) {
      .actions ion-button { min-width: 44px; min-height: 44px; margin: 0; }
      .toolbtn { width: 44px; height: 44px; }
      .pager .nav ion-button { min-width: 44px; min-height: 44px; margin: 0; }
    }
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
    /* #78 — Pie en MÓVIL: un solo control «Cargar más» en lugar del pager numerado (Shopify
       IndexTable, Fresha, Square y Material hacen lo mismo: nadie pinta botones de página en un
       teléfono). Sin atributo fill: el sólido por defecto de Ionic es el único que pinta caja en
       modo ios (outfitkit#82 / ADR-0143). Los 44px son el área táctil mínima. */
    .pager .load-more { min-height: 44px; margin: 0; --padding-start: 1rem; --padding-end: 1rem; font-size: 13px; }
    .pager .nav .pp { font-weight: 600; color: var(--color); padding: 0 0.25rem; }
    /* Pager numerado: botón por página + «…» en los saltos (look del Hub). */
    /* #92 — min-width/height at 44px so a numbered page button matches the prev/next ion-button's
       own 44px tap target (line above): before this they were visibly smaller than their neighbors. */
    .pnum { min-width: var(--ok-tap-min, 44px); height: var(--ok-tap-min, 44px); padding: 0 0.4rem; border: 1px solid transparent; border-radius: 8px; background: none; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--color); cursor: pointer; transition: background 0.12s, border-color 0.12s; }
    .pnum:hover { background: var(--row-hover); }
    .pnum.on { background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary); border-color: color-mix(in srgb, var(--primary) 40%, transparent); }
    .pgap { padding: 0 0.15rem; color: var(--color-muted); }
    ion-button { --box-shadow: none; }
  `;
  }
  static {
    this.MOBILE_BREAKPOINT = 640;
  }
  connectedCallback() {
    super.connectedCallback();
    if (typeof window !== "undefined") {
      window.addEventListener("erplora:locale-changed", this.onLocaleChanged);
      window.addEventListener("resize", this.onWindowResize);
    }
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      this.mq = window.matchMedia(`(max-width: ${_OkDataTable2.MOBILE_BREAKPOINT}px)`);
      this.isMobile = this.mq.matches;
      const handler = (e7) => {
        const matches = "matches" in e7 ? e7.matches : this.mq?.matches ?? false;
        if (this.isMobile === matches) return;
        this.isMobile = matches;
        if (matches && this.cardViewEnabled) this.viewMode = "cards";
        else if (!matches && this.viewMode === "cards") this.viewMode = "table";
      };
      this.mq.addEventListener("change", handler);
      this._mqHandler = handler;
    }
  }
  /** #67 — Recalcula si la vista lista desborda a lo ancho (`scrollWidth > clientWidth`).
   *
   * Se mide después de renderizar, que es cuando el navegador ya conoce los anchos, y solo se
   * escribe el estado si CAMBIA: asignarlo siempre reprogramaría un render en bucle. */
  measureXOverflow() {
    const scroll = this.renderRoot?.querySelector?.(".scroll");
    const overflow = !!scroll && scroll.scrollWidth > scroll.clientWidth;
    if (this.xOverflow !== overflow) this.xOverflow = overflow;
  }
  /** Engancha el observador al contenedor de scroll del render actual (cambia entre vistas). */
  observeXOverflow() {
    if (typeof ResizeObserver === "undefined") return;
    const scroll = this.renderRoot?.querySelector?.(".scroll");
    if (!scroll) return;
    this.xObserver ??= new ResizeObserver(() => this.measureXOverflow());
    this.xObserver.disconnect();
    this.xObserver.observe(scroll);
    const grid = scroll.querySelector(".grid");
    if (grid) this.xObserver.observe(grid);
  }
  updated(changed) {
    this.observeXOverflow();
    this.measureXOverflow();
    if (changed.has("panel")) this.syncSheetTop();
  }
  /** #75 — Where the mobile sheet starts. `position: fixed; inset: 0` painted it from y=0 and the
   *  app's `ion-header` (its own stacking context, above the content) covered the sheet's title and
   *  its only Close button — measured at 390×844 in the Appointments parity page. CSS inside a
   *  shadow root cannot know where the content area begins, so on open the table measures the
   *  closest `ion-content` (walking through shadow hosts) and hands the offset over as a custom
   *  property; on close it is removed. Without an `ion-content` around, the sheet keeps y=0. */
  syncSheetTop() {
    if (this.panel === "none") {
      this.style.removeProperty("--ok-sheet-top");
      return;
    }
    let node = this;
    let content = null;
    while (node && !content) {
      const parent = node.parentNode ?? node.getRootNode?.()?.host ?? null;
      if (parent && parent.nodeType === Node.ELEMENT_NODE && parent.tagName === "ION-CONTENT") content = parent;
      node = parent === node ? null : parent;
    }
    const top = content ? Math.max(0, Math.round(content.getBoundingClientRect().top)) : 0;
    this.style.setProperty("--ok-sheet-top", `${top}px`);
  }
  disconnectedCallback() {
    if (typeof window !== "undefined") {
      window.removeEventListener("erplora:locale-changed", this.onLocaleChanged);
      window.removeEventListener("resize", this.onWindowResize);
    }
    this.xObserver?.disconnect();
    this.xObserver = void 0;
    if (this.mq) {
      const handler = this._mqHandler;
      if (handler) this.mq.removeEventListener("change", handler);
      this.mq = void 0;
    }
    super.disconnectedCallback();
  }
  // ── i18n: idioma del documento ← overrides explícitos de `.labels` ─────────────────────────
  get t() {
    const lang = typeof document === "undefined" ? "en" : document.documentElement.lang.toLowerCase();
    return { ...lang.startsWith("es") ? ES_LABELS : DEFAULT_LABELS5, ...this.labels };
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
    const rows3 = out.map((r6) => Object.fromEntries(headers.map((h4, i7) => [h4, r6[i7] ?? ""])));
    return { headers, rows: rows3 };
  }
  async onImportFile(ev) {
    const input = ev.target;
    const file = input.files?.[0];
    if (!file) return;
    const text = decodeCsvBuffer(await file.arrayBuffer());
    const { headers, rows: rows3 } = this.parseCsv(text);
    this.emit("csvImport", { headers, rows: rows3 });
    this.emit("import", { headers, rows: rows3 });
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
    this.mobileShown = 0;
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
    this.mobileShown = 0;
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
    this.mobileShown = 0;
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
    this.applyInitialView();
  }
  /** Re-evalúa la vista inicial cada render mientras el usuario no haya elegido a mano.
   *
   * `firstUpdated` NO basta: decide una sola vez, y los consumidores que asignan las props por JS
   * DESPUÉS de insertar el elemento —lo normal en páginas renderizadas por el servidor— llegan
   * tarde. En ese momento `cardViewEnabled` aún era `false`, así que no se conmutaba; y el
   * listener de `matchMedia` solo dispara al CAMBIAR el viewport, cosa que en un móvil no pasa
   * nunca. La tabla se quedaba con scroll lateral para siempre.
   *
   * Medido en Android contra producción el 2026-08-02 con el bundle ya actualizado:
   *   `views` antes de insertar  → tarjetas
   *   `views` después de insertar → tabla   ← lo que hace la página
   */
  willUpdate(changed) {
    this.applyInitialView();
    if (!this.serverSide && changed.has("rows") && this.mobileShown !== 0) this.mobileShown = 0;
  }
  applyInitialView() {
    if (this.viewChosenByUser) return;
    if (this.isMobile && this.cardViewEnabled) {
      this.viewMode = "cards";
    } else if (this.defaultView === "cards" && this.cardViewEnabled) {
      this.viewMode = "cards";
    } else if (this.defaultView === "table") {
      this.viewMode = "table";
    }
  }
  setViewMode(mode) {
    this.viewChosenByUser = true;
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
          fill="outline" mode="md"
          ?multiple=${multi}
          interface="modal"
          .interfaceOptions=${{ cssClass: "ok-overlay" }}
          placeholder=${this.t.select}
          @ionChange=${(e7) => this.onFilterSelect(col, e7.detail.value, multi)}
        >
          ${multi ? A : b2`<ion-select-option value="">${this.t.select}</ion-select-option>`}
          ${opts.map((o9) => b2`<ion-select-option value=${o9.value}>${o9.label}</ion-select-option>`)}
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
            <ion-input type=${t7} fill="outline" mode="md" placeholder=${type === "daterange" ? this.t.from : this.t.gte}
              @ionInput=${(e7) => onEdge(col, "from", e7)}></ion-input>
            <ion-input type=${t7} fill="outline" mode="md" placeholder=${type === "daterange" ? this.t.to : this.t.lte}
              @ionInput=${(e7) => onEdge(col, "to", e7)}></ion-input>
          </div>
        </div>
      `;
    }
    const inputType = type === "number" ? "number" : type === "date" ? "date" : "text";
    return b2`
      <ion-input
        type=${inputType}
        fill="outline" mode="md"
        label=${col.header}
        label-placement="stacked"
        placeholder=${this.t.filterPlaceholder}
        @ionInput=${(e7) => this.onFilterInput(col, e7)}
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
          @ionChange=${(e7) => this.onFilterSelect(col, e7.detail.value, multi)}
        >
          ${multi ? A : b2`<ion-select-option value="">${col.header}</ion-select-option>`}
          ${opts.map((o9) => b2`<ion-select-option value=${o9.value}>${o9.label}</ion-select-option>`)}
        </ion-select>
      `;
    }
    return b2`
      <span class="tk-daterange" role="group" aria-label=${col.header}>
        <ion-icon .icon=${iconCalendarOutline}></ion-icon>
        <ion-input type="date" aria-label=${this.t.fromOf.replace("{label}", col.header)} .value=${f3?.from ?? ""} @ionChange=${(e7) => this.onInlineRange(col, "from", e7)}></ion-input>
        <span class="arr">→</span>
        <ion-input type="date" aria-label=${this.t.toOf.replace("{label}", col.header)} .value=${f3?.to ?? ""} @ionChange=${(e7) => this.onInlineRange(col, "to", e7)}></ion-input>
      </span>
    `;
  }
  // Menú overflow («⋮») con ion-popover anclado por evento (Shadow-DOM-safe).
  renderOverflowMenu() {
    if (!this.menuActions.length) return A;
    return b2`
      <ion-button class="toolbtn" fill="clear" aria-label=${this.t.moreActions} @click=${(e7) => this.openMenu(e7)}>
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
              aria-label=${a3.label}
              title=${a3.label}
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
      visible = this.isMobile ? filtered.slice(0, Math.min(this.mobileShown || ps, count)) : filtered.slice(current * ps, current * ps + ps);
    }
    const served = this.serverSide ? (current + 1) * ps : Math.min(this.mobileShown || ps, count);
    const canLoadMore = this.isMobile && served < count;
    const loadMore = () => {
      if (this.serverSide) this.emit("pageChange", current + 1);
      else this.mobileShown = Math.min((this.mobileShown || ps) + ps, count);
    };
    const goTo = (p4) => {
      if (this.serverSide) this.emit("pageChange", p4);
      else this.clientPage = p4;
    };
    const setPageSize = (n6) => {
      if (this.serverSide) this.emit("pageSizeChange", n6);
      else {
        this.clientPageSize = n6;
        this.clientPage = 0;
        this.mobileShown = 0;
      }
    };
    const searchbar = this.serverSide ? b2`<ion-searchbar class="ion-no-border" placeholder=${this.effSearchPlaceholder} debounce="250" @ionInput=${this.onSearch}></ion-searchbar>` : b2`<ion-searchbar class="ion-no-border" .value=${this.q} placeholder=${this.effSearchPlaceholder} debounce="250" @ionInput=${this.onSearch}></ion-searchbar>`;
    const selCount = this.selection.size;
    const showTopbar = !!this.title || this.hasSearch || this.viewToggle || this.effColumnPicker || this.effExport || this.effImport || this.hasFilterRow || this.addable || !!this.primaryAction;
    return b2`
      <div class=${`card${this.panel !== "none" ? " has-panel" : ""}`}>
        ${showTopbar ? b2`
              <div class="bar">
                <div class="bar-main">
                  ${this.title ? b2`<div class="title-wrap"><h2 class="title">${this.title}</h2><span class="title-count">${count}</span></div>` : A}
                  ${this.hasSearch ? b2`<div class="search">${searchbar}</div>` : A}
                  ${this.inlineFilters ? this.renderInlineFilters() : A}
                  <span class="tk-spacer"></span>
                    ${this.effColumnPicker && !this.isMobile ? b2`
                          <ion-select
                            class="tk-cols"
                            multiple
                            interface="popover"
                            aria-label=${this.t.columnsVisible}
                            .value=${this.visibleColumns.map((c5) => c5.key)}
                            .selectedText=${this.t.columns}
                            @ionChange=${(e7) => this.setVisibleColumns(e7.detail.value)}
                          >
                            ${this.columns.map((c5) => b2`<ion-select-option value=${c5.key}>${c5.header}</ion-select-option>`)}
                          </ion-select>
                        ` : A}
                    ${this.effPageSizes.length && !this.isMobile ? b2`
                          <ion-select
                            class="tk-psize"
                            interface="popover"
                            aria-label=${this.t.rowsPerPage}
                            .value=${ps}
                            @ionChange=${(e7) => setPageSize(Number(e7.detail.value))}
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
                          <input class="tk-file" type="file" accept=".csv,text/csv" hidden @change=${(e7) => this.onImportFile(e7)} />
                        ` : A}
                    ${this.effExport ? this.toolButton("download-outline", false, () => this.exportCsv(), this.t.exportCsv) : A}
                    ${this.addable ? this.isMobile ? b2`
                            <ion-button class="primary-btn add-btn" size="small" @click=${() => this.toggle("create")}>
                              <ion-icon slot="start" .icon=${okIcon("add")}></ion-icon>${this.t.add}
                            </ion-button>
                          ` : this.toolButton("add", this.panel === "create", () => this.toggle("create"), this.t.add) : A}
                    ${this.renderOverflowMenu()}
                    ${this.primaryAction ? this.isMobile ? b2`
                            <ion-button class="primary-btn add-btn" size="small" @click=${() => this.emit("primaryAction", {})}>
                              <ion-icon slot="start" .icon=${okIcon(this.primaryAction.icon ?? "add")}></ion-icon>${this.primaryAction.label}
                            </ion-button>
                          ` : b2`
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
                    ${pages > 1 ? b2`${this.t.showing.replace("{from}", String(this.isMobile && !this.serverSide ? 1 : current * ps + 1)).replace("{to}", String(Math.min(served, count)))} ` : A}
                    <span class="strong">${count}</span> ${count === 1 ? this.t.recordSingular : this.t.recordPlural}
                  </span>
                  ${!showTopbar && this.effPageSizes.length ? b2`
                        <select class="psize" @change=${(e7) => setPageSize(Number(e7.target.value))}>
                          ${this.effPageSizes.map((n6) => b2`<option value=${n6} ?selected=${n6 === ps}>${this.t.perPageShort.replace("{n}", String(n6))}</option>`)}
                        </select>
                      ` : A}
                </div>
                ${this.isMobile ? canLoadMore ? b2`<ion-button class="load-more" size="small" @click=${loadMore}>${this.t.loadMore}</ion-button>` : A : pages > 1 ? b2`
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
            <ion-input type="date" label=${this.t.from} label-placement="stacked" fill="outline" mode="md" .value=${f3.from ?? ""} @ionChange=${(e7) => this.setFilterRange(col.key, "from", e7.detail.value ?? "")}></ion-input>
            <ion-input type="date" label=${this.t.to} label-placement="stacked" fill="outline" mode="md" .value=${f3.to ?? ""} @ionChange=${(e7) => this.setFilterRange(col.key, "to", e7.detail.value ?? "")}></ion-input>
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
          fill="outline" mode="md"
          multiple
          interface="modal"
          .interfaceOptions=${{ cssClass: "ok-overlay" }}
          placeholder=${this.t.select}
          .value=${selected}
          @ionChange=${(e7) => this.setFilterValues(col.key, e7.detail.value ?? [])}
        >
          ${opts.length === 0 ? b2`<ion-select-option .disabled=${true} value="">${this.t.noValues}</ion-select-option>` : opts.map((o9) => b2`<ion-select-option value=${o9.value}>${o9.label}</ion-select-option>`)}
        </ion-select>
      </div>
    `;
  }
  /** #67 — Enter/Espacio activan la fila clicable (y, desde #74, la tarjeta): si se llega con el
   *  tabulador, el ratón no puede ser el único camino. Espacio además NO debe desplazar la página. */
  onRowKeydown(e7, row) {
    if (e7.key !== "Enter" && e7.key !== " " && e7.key !== "Spacebar") return;
    e7.preventDefault();
    this.emit("rowClick", { row });
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
      <div class=${`scroll${this.xOverflow ? " x-overflow" : ""}`}>
        <div class="grid" role="table">
          <!-- Cabecera -->
          <div class="grow ghead" role="row" style=${o8(tpl)}>
            ${this.selectable ? b2`<span class="selcb"><ion-checkbox .checked=${allOn} aria-label=${this.t.selectAll} @ionChange=${() => this.toggleAll(visible)}></ion-checkbox></span>` : A}
            ${cols.map((c5) => {
      const sortable = this.isSortable(c5);
      const active = sortable && (this.serverSide ? this.sort === c5.key : this.clientSort === c5.key);
      const dir = this.serverSide ? this.sortDir : this.clientSortDir;
      const caretIcon = !active ? iconSwapVerticalOutline : dir === "asc" ? iconChevronUpOutline : iconChevronDownOutline;
      return b2`
                <div
                  class=${`gcell gh ${alignCls(c5.align)}${sortable ? " sortable" : ""}${c5.pinned === "end" ? " actions-col" : ""}`}
                  role="columnheader"
                  @click=${() => this.onHeaderClick(c5)}
                >
                  <span>${c5.header}</span>
                  ${sortable ? b2`<span class=${`caret${active ? " on" : ""}`}><ion-icon .icon=${okIcon(caretIcon)}></ion-icon></span>` : A}
                </div>
              `;
    })}
            ${this.actions.length ? b2`<div class="gcell gh right actions-col" role="columnheader">${this.t.actions}</div>` : A}
          </div>

          <!-- Filas -->
          ${c4(
      visible,
      (row) => this.keyOf(row),
      (row) => {
        const key = this.keyOf(row);
        const selected = this.selectable && this.selection.has(key);
        return b2`
                <div
                  class=${`grow grow-data${selected ? " selected" : ""}${this.rowClickable ? " clickable" : ""}`}
                  role="row"
                  style=${o8(tpl)}
                  tabindex=${this.rowClickable ? "0" : A}
                  @click=${this.rowClickable ? () => this.emit("rowClick", { row }) : A}
                  @keydown=${this.rowClickable ? (e7) => this.onRowKeydown(e7, row) : A}
                >
                  ${this.selectable ? b2`<span class="selcb" @click=${(e7) => e7.stopPropagation()}><ion-checkbox .checked=${selected} aria-label=${this.t.selectRow} @ionChange=${() => this.toggleRow(key)}></ion-checkbox></span>` : A}
                  ${cols.map(
          (c5) => b2`<div class=${`gcell ${alignCls(c5.align)}${c5.pinned === "end" ? " actions-col" : ""}`} role="cell">${c5.render ? c5.render(row) : b2`<span>${this.cell(c5, row)}</span>`}</div>`
        )}
                  ${this.actions.length ? b2`<div class="gcell right actions-col" role="cell" @click=${(e7) => e7.stopPropagation()}>${this.actionButtons(row)}</div>` : A}
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
              <ion-card
                class=${`rcard${selected ? " selected" : ""}${this.rowClickable ? " clickable" : ""}`}
                role=${this.rowClickable ? "button" : A}
                tabindex=${this.rowClickable ? "0" : A}
                @click=${this.rowClickable ? () => this.emit("rowClick", { row }) : A}
                @keydown=${this.rowClickable ? (e7) => this.onRowKeydown(e7, row) : A}
              >
                ${hasHead ? b2`
                      <ion-card-header class="rcard-head">
                        ${icon != null && icon !== "" ? b2`<span class="rc-icon">${typeof icon === "string" ? b2`<ion-icon .icon=${okIcon(icon)}></ion-icon>` : icon}</span>` : A}
                        <span class="rc-title">${this.cardTitle ? this.cardTitle(row) : A}</span>
                        ${this.selectable ? b2`<ion-checkbox .checked=${selected} aria-label=${this.t.select} @click=${(e7) => e7.stopPropagation()} @ionChange=${() => this.toggleRow(key)}></ion-checkbox>` : A}
                      </ion-card-header>
                    ` : A}
                <ion-card-content class="rcard-body">
                  ${this.renderCard ? this.renderCard(row) : this.visibleColumns.map(
          (c5) => b2`<div class="rrow"><span class="rk">${c5.header}</span><span class="rv">${c5.render ? c5.render(row) : this.cell(c5, row)}</span></div>`
        )}
                </ion-card-content>
                ${this.actions.length ? b2`<div class="ractions" @click=${(e7) => e7.stopPropagation()}>${this.actionButtons(row)}</div>` : A}
              </ion-card>
            `;
      }
    )}
      </div>
    `;
  }
};
__decorateClass11([
  n4({ attribute: false })
], _OkDataTable.prototype, "columns");
__decorateClass11([
  n4({ attribute: false })
], _OkDataTable.prototype, "rows");
__decorateClass11([
  n4({ attribute: false })
], _OkDataTable.prototype, "searchKeys");
__decorateClass11([
  n4({ attribute: "row-key-field" })
], _OkDataTable.prototype, "rowKeyField");
__decorateClass11([
  n4({ attribute: false })
], _OkDataTable.prototype, "rowKey");
__decorateClass11([
  n4({ type: Number, attribute: "page-size" })
], _OkDataTable.prototype, "pageSize");
__decorateClass11([
  n4({ attribute: "empty-message" })
], _OkDataTable.prototype, "emptyMessage");
__decorateClass11([
  n4({ attribute: "search-placeholder" })
], _OkDataTable.prototype, "searchPlaceholder");
__decorateClass11([
  n4({ attribute: false })
], _OkDataTable.prototype, "labels");
__decorateClass11([
  n4({ attribute: false })
], _OkDataTable.prototype, "actions");
__decorateClass11([
  n4({ type: Boolean })
], _OkDataTable.prototype, "addable");
__decorateClass11([
  n4({ attribute: false })
], _OkDataTable.prototype, "pageSizeOptions");
__decorateClass11([
  n4({ type: Boolean, reflect: true })
], _OkDataTable.prototype, "fill");
__decorateClass11([
  n4({ type: Boolean, attribute: "column-picker" })
], _OkDataTable.prototype, "columnPicker");
__decorateClass11([
  n4({ type: Boolean })
], _OkDataTable.prototype, "csv");
__decorateClass11([
  n4({ attribute: "csv-name" })
], _OkDataTable.prototype, "csvName");
__decorateClass11([
  n4({ type: Boolean, attribute: "server-side" })
], _OkDataTable.prototype, "serverSide");
__decorateClass11([
  n4({ type: Number })
], _OkDataTable.prototype, "total");
__decorateClass11([
  n4({ type: Number })
], _OkDataTable.prototype, "page");
__decorateClass11([
  n4({ type: Boolean })
], _OkDataTable.prototype, "searchable");
__decorateClass11([
  n4({ type: String })
], _OkDataTable.prototype, "sort");
__decorateClass11([
  n4({ attribute: "sort-dir" })
], _OkDataTable.prototype, "sortDir");
__decorateClass11([
  n4()
], _OkDataTable.prototype, "title");
__decorateClass11([
  n4({ attribute: false })
], _OkDataTable.prototype, "views");
__decorateClass11([
  n4({ attribute: "default-view" })
], _OkDataTable.prototype, "defaultView");
__decorateClass11([
  n4({ type: Boolean })
], _OkDataTable.prototype, "exportable");
__decorateClass11([
  n4({ type: Boolean })
], _OkDataTable.prototype, "importable");
__decorateClass11([
  n4({ type: Boolean, attribute: "column-selector" })
], _OkDataTable.prototype, "columnSelector");
__decorateClass11([
  n4({ attribute: false })
], _OkDataTable.prototype, "pageSizes");
__decorateClass11([
  n4({ type: Boolean, attribute: "row-clickable" })
], _OkDataTable.prototype, "rowClickable");
__decorateClass11([
  n4({ type: Boolean })
], _OkDataTable.prototype, "selectable");
__decorateClass11([
  n4({ attribute: false })
], _OkDataTable.prototype, "selectedKeys");
__decorateClass11([
  n4({ attribute: false })
], _OkDataTable.prototype, "primaryAction");
__decorateClass11([
  n4({ type: Boolean })
], _OkDataTable.prototype, "inlineFilters");
__decorateClass11([
  n4({ attribute: false })
], _OkDataTable.prototype, "menuActions");
__decorateClass11([
  n4({ attribute: false })
], _OkDataTable.prototype, "cardTitle");
__decorateClass11([
  n4({ attribute: false })
], _OkDataTable.prototype, "cardIcon");
__decorateClass11([
  n4({ attribute: false })
], _OkDataTable.prototype, "renderCard");
__decorateClass11([
  r5()
], _OkDataTable.prototype, "q");
__decorateClass11([
  r5()
], _OkDataTable.prototype, "clientPage");
__decorateClass11([
  r5()
], _OkDataTable.prototype, "clientPageSize");
__decorateClass11([
  r5()
], _OkDataTable.prototype, "mobileShown");
__decorateClass11([
  r5()
], _OkDataTable.prototype, "clientSort");
__decorateClass11([
  r5()
], _OkDataTable.prototype, "clientSortDir");
__decorateClass11([
  r5()
], _OkDataTable.prototype, "clientFilters");
__decorateClass11([
  r5()
], _OkDataTable.prototype, "filterDraft");
__decorateClass11([
  r5()
], _OkDataTable.prototype, "panel");
__decorateClass11([
  r5()
], _OkDataTable.prototype, "viewMode");
__decorateClass11([
  r5()
], _OkDataTable.prototype, "isMobile");
__decorateClass11([
  r5()
], _OkDataTable.prototype, "xOverflow");
__decorateClass11([
  r5()
], _OkDataTable.prototype, "hiddenKeys");
__decorateClass11([
  r5()
], _OkDataTable.prototype, "internalSelection");
__decorateClass11([
  r5()
], _OkDataTable.prototype, "menuOpen");
var OkDataTable = _OkDataTable;
define("ok-data-table", OkDataTable);

// ui/lib/domain-error-text.ts
var SOURCE_LANG = "en";
function textFor(catalog, lang, code) {
  const dict = catalog[lang];
  const text = dict?.errors?.[code];
  return typeof text === "string" && text.trim() ? text : "";
}
function domainErrorText(catalog, locale, e7) {
  const code = e7?.code;
  if (typeof code !== "string" || !code) return "";
  return textFor(catalog, locale, code) || textFor(catalog, SOURCE_LANG, code);
}

// ui/components/erp-pos-quick-notes/erp-pos-quick-notes.ts
var CATALOG3 = { es: es_default, en: en_default };
function erplora3() {
  const c5 = globalThis.erplora;
  if (!c5) throw new Error("erplora SDK not initialised by the shell");
  return c5;
}
function can(permission) {
  const client = erplora3();
  return typeof client.hasPermission === "function" ? client.hasPermission(permission) : true;
}
var ErpPosQuickNotes = class extends i3 {
  constructor() {
    super(...arguments);
    this.newText = "";
    this.newSortOrder = "";
    this.saving = false;
    this.formError = "";
    this.editingId = null;
    this.deleteTarget = null;
    this.onLocaleChange = () => this.requestUpdate();
  }
  static {
    this.styles = i`
    :host { display:flex; flex-direction:column; height:100%; min-height:0;
            font-family: system-ui, sans-serif; color: var(--ion-text-color, #1c1b18); }
    .page { display:flex; flex-direction:column; min-height:0; flex:1 1 auto; }
    .page > ok-data-table { flex:1 1 auto; min-height:0; }
    .intro { margin:0 0 .6rem; font-size:.85rem; color: var(--ion-color-medium, #6b6b6b); }
    .form { display:flex; flex-direction:column; gap:.7rem; }
    .form ion-button[type='submit'] { align-self:flex-end; }
  `;
  }
  get columns() {
    const t7 = (k2) => erplora3().t(CATALOG3, k2);
    return [
      { key: "text", header: t7("ui.quickNoteText"), sortable: true, filterable: true, filterType: "text" },
      // The position is the ONLY thing that decides the order of the chips at the till, so it is a
      // column and not a hidden field: the business has to see what it is changing.
      { key: "sort_order", header: t7("ui.quickNoteOrder"), align: "right", sortable: true }
    ];
  }
  get actions() {
    const t7 = (k2) => erplora3().t(CATALOG3, k2);
    return can("sales.manage_settings") ? [
      { id: "edit", label: t7("ui.quickNoteEdit"), icon: "create-outline" },
      { id: "delete", label: t7("ui.quickNoteDelete"), icon: "trash-outline", color: "danger" }
    ] : [];
  }
  async connectedCallback() {
    super.connectedCallback();
    window.addEventListener("erplora:locale-changed", this.onLocaleChange);
    this.ctrl = createListController(
      erplora3(),
      "sales.quick_notes.list",
      () => this.requestUpdate(),
      { pageSize: 50, sort: "sort_order", dir: "asc" }
    );
    await this.ctrl.load();
  }
  disconnectedCallback() {
    window.removeEventListener("erplora:locale-changed", this.onLocaleChange);
    super.disconnectedCallback();
  }
  dataTable() {
    return this.renderRoot.querySelector("ok-data-table");
  }
  async onRowAction(ev) {
    if (!can("sales.manage_settings")) return;
    const { actionId, row } = ev.detail;
    const note = row;
    if (actionId === "edit") {
      this.editingId = note.id;
      this.newText = note.text ?? "";
      this.newSortOrder = String(note.sort_order ?? 0);
      this.formError = "";
      this.dataTable()?.open("create");
    } else if (actionId === "delete") {
      this.deleteTarget = note;
    }
  }
  /** Back to a clean CREATE form. */
  cancelEdit() {
    this.editingId = null;
    this.newText = "";
    this.newSortOrder = "";
    this.formError = "";
  }
  /** Submit: create OR update by `editingId`. */
  async save(ev) {
    ev.preventDefault();
    if (!can("sales.manage_settings")) return;
    const text = this.newText.trim();
    if (!text) return;
    this.saving = true;
    this.formError = "";
    try {
      const fields = { text, sort_order: Number(this.newSortOrder) || 0 };
      if (this.editingId) {
        await erplora3().command("sales.quick_notes.update", { quick_note_id: this.editingId, ...fields });
      } else {
        await erplora3().command("sales.quick_notes.create", fields);
      }
      this.cancelEdit();
      this.dataTable()?.close();
      await this.ctrl.load();
    } catch (e7) {
      this.formError = domainErrorText(CATALOG3, erplora3().locale, e7) || erplora3().t(CATALOG3, "ui.quickNoteSaveFailed");
    } finally {
      this.saving = false;
    }
  }
  async confirmDelete() {
    const target = this.deleteTarget;
    if (!target || !can("sales.manage_settings")) return;
    this.saving = true;
    try {
      await erplora3().command("sales.quick_notes.delete", { quick_note_id: target.id });
      this.deleteTarget = null;
      await this.ctrl.load();
    } catch (e7) {
      this.formError = domainErrorText(CATALOG3, erplora3().locale, e7) || erplora3().t(CATALOG3, "ui.quickNoteDeleteFailed");
      this.deleteTarget = null;
    } finally {
      this.saving = false;
    }
  }
  renderDeleteConfirm() {
    const t7 = (k2) => erplora3().t(CATALOG3, k2);
    return b2`<ion-modal .isOpen=${!!this.deleteTarget}
        @ionModalDidDismiss=${() => {
      this.deleteTarget = null;
    }}>
      <ion-header class="ion-no-border">
        <ion-toolbar><ion-title>${t7("ui.quickNoteDeleteTitle")}</ion-title></ion-toolbar>
      </ion-header>
      <!-- Self-styled: ion-modal is reparented to <body>, this component's CSS does not reach it. -->
      <ion-content class="ion-padding">
        <ion-list lines="none">
          <ion-item>
            <ion-label class="ion-text-wrap">
              <b>${this.deleteTarget?.text ?? ""}</b> — ${t7("ui.quickNoteDeleteHint")}
            </ion-label>
          </ion-item>
        </ion-list>
        <ion-button class="ion-margin-top" expand="block" color="danger" ?disabled=${this.saving}
          @click=${() => this.confirmDelete()}>${t7("ui.quickNoteDelete")}</ion-button>
        <ion-button expand="block" fill="outline" ?disabled=${this.saving}
          @click=${() => {
      this.deleteTarget = null;
    }}>${t7("ui.quickNoteCancel")}</ion-button>
      </ion-content>
    </ion-modal>`;
  }
  render() {
    const t7 = (k2) => erplora3().t(CATALOG3, k2);
    const editable = can("sales.manage_settings");
    return b2`<div class="page">
      <p class="intro">${t7("ui.quickNotesIntro")}</p>
      ${this.formError ? b2`<ok-inline-feedback tone="danger" icon="alert-circle-outline">${this.formError}</ok-inline-feedback>` : A}
      ${this.ctrl?.error ? b2`<ok-inline-feedback tone="danger" icon="alert-circle-outline">${this.ctrl.error}</ok-inline-feedback>` : A}
      <ok-data-table
        .serverSide=${true}
        .fill=${true}
        .views=${true}
        .addable=${editable}
        .cardTitle=${(row) => String(row.text ?? "")}
        .columns=${this.columns}
        .rows=${this.ctrl?.rows ?? []}
        .total=${this.ctrl?.total ?? 0}
        .page=${this.ctrl?.state.page ?? 0}
        .pageSize=${this.ctrl?.state.pageSize ?? 50}
        .sort=${this.ctrl?.state.sort}
        .sortDir=${this.ctrl?.state.dir ?? "asc"}
        .searchable=${true}
        .searchPlaceholder=${t7("ui.quickNotesSearch")}
        .actions=${this.actions}
        .rowClickable=${editable}
        .emptyMessage=${this.ctrl?.loading ? t7("ui.quickNotesLoading") : t7("ui.quickNotesEmpty")}
        @rowAction=${(e7) => this.onRowAction(e7)}
        @rowClick=${(e7) => this.onRowAction({ detail: { actionId: "edit", row: e7.detail.row } })}
        @pageChange=${(e7) => this.ctrl.setPage(e7.detail)}
        @pageSizeChange=${(e7) => this.ctrl.setPageSize(e7.detail)}
        @sortChange=${(e7) => this.ctrl.setSort(e7.detail.sort, e7.detail.dir)}
        @searchChange=${(e7) => this.ctrl.setSearch(e7.detail)}
        @filterChange=${(e7) => this.ctrl.setFilter(e7.detail.col, e7.detail.value)}>
        <form slot="create" class="form" @submit=${(e7) => this.save(e7)}>
          ${this.editingId ? b2`<ok-inline-feedback tone="info" icon="create-outline">
                <b>${t7("ui.quickNoteEditing")}</b> — ${this.newText}
                <ion-button size="small" fill="clear" @click=${() => this.cancelEdit()}>${t7("ui.quickNoteEditCancel")}</ion-button>
              </ok-inline-feedback>` : A}
          <!-- mode="md" is not decoration: the shell pins Ionic's ios mode (ADR-0143) and fill
               paints in md only, so without it the box has no border and the person cannot see
               where to type. -->
          <ion-input mode="md" fill="outline" label-placement="floating" maxlength="80"
            label=${t7("ui.quickNoteText")} .value=${this.newText}
            @ionInput=${(e7) => {
      this.newText = e7.target.value;
    }}></ion-input>
          <ion-input mode="md" fill="outline" label-placement="floating" type="number" min="0" step="1"
            label=${t7("ui.quickNoteOrder")} .value=${this.newSortOrder}
            @ionInput=${(e7) => {
      this.newSortOrder = e7.target.value;
    }}></ion-input>
          <ion-button type="submit" ?disabled=${this.saving || !this.newText.trim()}>
            ${this.saving ? t7("ui.quickNoteSaving") : this.editingId ? t7("ui.quickNoteSave") : t7("ui.quickNoteAdd")}
          </ion-button>
        </form>
      </ok-data-table>
      ${this.renderDeleteConfirm()}
    </div>`;
  }
};
__decorateClass([
  r5()
], ErpPosQuickNotes.prototype, "newText", 2);
__decorateClass([
  r5()
], ErpPosQuickNotes.prototype, "newSortOrder", 2);
__decorateClass([
  r5()
], ErpPosQuickNotes.prototype, "saving", 2);
__decorateClass([
  r5()
], ErpPosQuickNotes.prototype, "formError", 2);
__decorateClass([
  r5()
], ErpPosQuickNotes.prototype, "editingId", 2);
__decorateClass([
  r5()
], ErpPosQuickNotes.prototype, "deleteTarget", 2);
define("erp-pos-quick-notes", ErpPosQuickNotes);

// ui/lib/refund-allocation.ts
var cents = (n6) => Math.max(0, Math.round(Number(n6) || 0));
function refundableTotal(legs) {
  return legs.reduce((sum, l3) => sum + cents(l3.remaining), 0);
}
function draftTotal(draft) {
  return Object.values(draft).reduce((sum, e7) => sum + cents(e7?.amount), 0);
}
function proportionalSplit(amount, legs) {
  const split = {};
  for (const l3 of legs) split[l3.payment_id] = 0;
  const weights = legs.map((l3) => cents(l3.remaining));
  const totalWeight = weights.reduce((a3, b3) => a3 + b3, 0);
  const magnitude = Math.min(cents(amount), totalWeight);
  if (magnitude <= 0 || totalWeight <= 0) return split;
  const remainders = [];
  let assigned = 0;
  legs.forEach((l3, i7) => {
    const numerator = magnitude * weights[i7];
    const part = Math.floor(numerator / totalWeight);
    split[l3.payment_id] = part;
    assigned += part;
    remainders.push({ rest: numerator % totalWeight, index: i7 });
  });
  remainders.sort((a3, b3) => b3.rest - a3.rest || a3.index - b3.index);
  let left = magnitude - assigned;
  for (const { index } of remainders) {
    if (left <= 0) break;
    split[legs[index].payment_id] += 1;
    left -= 1;
  }
  return split;
}
function refundBlock(draft, legs) {
  const known = legs.reduce((sum, l3) => sum + cents(draft[l3.payment_id]?.amount), 0);
  if (known <= 0) return { reason: "nothing" };
  const ordered = [...legs].sort((a3, b3) => a3.sort_order - b3.sort_order);
  for (const leg of ordered) {
    const amount = cents(draft[leg.payment_id]?.amount);
    if (amount > cents(leg.remaining)) {
      return { reason: "over-cap", leg, amount, remaining: cents(leg.remaining) };
    }
  }
  for (const leg of ordered) {
    const entry = draft[leg.payment_id];
    const amount = cents(entry?.amount);
    if (amount > 0 && Number(leg.refundable) !== 1 && !entry?.to) {
      return { reason: "needs-destination", leg, why: leg.reason };
    }
  }
  return void 0;
}
function buildAllocations(draft, legs) {
  return [...legs].sort((a3, b3) => a3.sort_order - b3.sort_order).flatMap((leg) => {
    const entry = draft[leg.payment_id];
    const amount = cents(entry?.amount);
    if (amount <= 0) return [];
    const changed = entry?.to && entry.to !== leg.payment_method_id;
    return [{ payment_id: leg.payment_id, amount, ...changed ? { to_payment_method_id: entry.to } : {} }];
  });
}
var REASON_KEYS = {
  already_refunded: "ui.refundReasonAlreadyRefunded",
  method_unavailable: "ui.refundReasonMethodUnavailable"
};
function reasonKey(reason) {
  return REASON_KEYS[reason] ?? "ui.refundReasonNotEligible";
}
function parseAmountToCents(text) {
  const raw = String(text ?? "").replace(/[^\d.,-]/g, "");
  if (!raw || raw.startsWith("-")) return 0;
  const cut = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("."));
  const digits = (part) => part.replace(/[^\d]/g, "");
  const whole = digits(cut >= 0 ? raw.slice(0, cut) : raw);
  const frac = cut >= 0 ? digits(raw.slice(cut + 1)) : "";
  const padded = (frac + "000").slice(0, 3);
  const units = Number(whole || "0");
  if (!Number.isFinite(units)) return 0;
  const cents2 = units * 100 + Number(padded.slice(0, 2));
  return Number(padded[2]) >= 5 ? cents2 + 1 : cents2;
}
function formatAmountInput(amount, locale) {
  const fixed = (Math.max(0, Math.round(Number(amount) || 0)) / 100).toFixed(2);
  let decimal = ".";
  try {
    decimal = new Intl.NumberFormat(locale || void 0).formatToParts(1.1).find((p4) => p4.type === "decimal")?.value ?? ".";
  } catch {
    decimal = ".";
  }
  return fixed.replace(".", decimal);
}

// ui/lib/refund-tender.ts
function coveredLines(lines) {
  return lines.filter((l3) => !!l3.id && !!l3.product_id && isCovered(l3));
}
function isCovered(l3) {
  return l3.is_covered === true || Number(l3.is_covered ?? 0) > 0;
}
function serviceOrdinals(covered) {
  const seen = /* @__PURE__ */ new Map();
  const out = /* @__PURE__ */ new Map();
  for (const l3 of covered) {
    const service = l3.product_id ?? "";
    const n6 = seen.get(service) ?? 0;
    out.set(l3.id, n6);
    seen.set(service, n6 + 1);
  }
  return out;
}

// ui/components/erp-sale-refund/erp-sale-refund.ts
var CATALOG4 = { es: es_default, en: en_default };
var REFUND_MESSAGES = {
  "sales.refund_exceeds_tender": "ui.refundExceedsTender",
  "sales.refund_tender_not_eligible": "ui.refundNeedsDestinationShort",
  "sales.refund_method_unavailable": "ui.refundMethodUnavailable",
  "sales.refund_reason_required": "ui.refundReasonRequired",
  "sales.refund_nothing_to_return": "ui.refundNothingToReturn",
  "sales.refund_requires_completed": "ui.refundRequiresCompleted",
  "sales.sale_not_found": "ui.refundSaleNotFound"
};
function refundErrorKey(code) {
  const key = REFUND_MESSAGES[code];
  if (!key) return "ui.refundFailed";
  return key === "ui.refundNeedsDestinationShort" ? "ui.refundReasonNotEligible" : key;
}
function erplora4() {
  const c5 = globalThis.erplora;
  if (!c5) throw new Error("erplora SDK no inicializado por el shell");
  return c5;
}
function newKey(saleId) {
  const rnd = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `refund-${saleId}-${rnd}`;
}
var ErpSaleRefund = class extends i3 {
  constructor() {
    super(...arguments);
    this.legs = [];
    this.methods = [];
    this.draft = {};
    this.reason = "";
    this.loading = false;
    this.error = "";
    this.busy = false;
    this.covered = [];
    this.tenderFillers = [];
    this.tenderNotices = /* @__PURE__ */ new Map();
    /** One instance per covered line, kept so it is not recreated on every render. */
    this.tenderEls = /* @__PURE__ */ new Map();
    /** La clave del intento, congelada: un reintento NO la renueva. */
    this.key = "";
    /** That line goes back to its external tender. The warning travels with the event because the
     *  line's hole can be off-screen when the thumb is already on the refund button. */
    this.onTenderRefundArmed = (e7) => {
      const d3 = e7.detail;
      if (!d3?.lineRef) return;
      const next = new Map(this.tenderNotices);
      next.set(d3.lineRef, String(d3.warning ?? ""));
      this.tenderNotices = next;
    };
    /** The filler undid it, or said that line does not go back: its warning stops being announced. */
    this.onTenderRefundDisarmed = (e7) => {
      const d3 = e7.detail;
      if (!d3?.lineRef) return;
      const next = new Map(this.tenderNotices);
      next.delete(d3.lineRef);
      this.tenderNotices = next;
    };
  }
  static {
    this.styles = i`
    :host { display:block; }
    /* 🔴 El padding es PROPIO, no la clase ion-padding: esa clase vive en el stylesheet GLOBAL de Ionic y
       NO atraviesa el shadow DOM, así que dentro de un módulo no aplica jamás. Medido en un
       Chromium real contra el preview: el cuerpo salia con padding 0 y el boton pegado al borde en
       los tres viewports. (Y no metas acentos graves en un comentario dentro de una plantilla css:
       cierran el literal.) */
    .refund-body, .refund-loading { padding:1rem; }
    /* A 1440 px la ficha se estiraba a 1.404 px de ancho: un formulario de importes con el nombre
       del medio a la izquierda y el campo a un metro a la derecha no se lee de un vistazo. Se
       centra con un ancho de lectura, y por debajo de eso ocupa lo que haya. */
    .refund-body { display:flex; flex-direction:column; gap:.85rem; max-width:46rem; margin:0 auto; }
    .refund-loading { display:flex; align-items:center; gap:.6rem; }
    h3 { margin:0; font-size:1.1rem; }
    .hint { margin:0; color:var(--ion-color-medium,#8b897f); font-size:.85rem; }
    .legs { display:flex; flex-direction:column; gap:.7rem; }
    .leg { border:1px solid var(--ion-border-color,#e0ddd4); border-radius:var(--ok-radius,12px); padding:.7rem .8rem; }
    .leg-head { display:flex; justify-content:space-between; align-items:baseline; gap:.5rem; }
    /* El dinero se lee en columna y a la derecha, como en cualquier ERP: alineado a la izquierda
       pegado al nombre del medio, la vista no tiene donde apoyarse para comparar dos importes. */
    .leg-head ion-input { margin-left:auto; max-width:12rem; --padding-end:0; text-align:right; }
    .leg-name { font-weight:700; }
    .leg-figures { display:flex; gap:.9rem; flex-wrap:wrap; color:var(--ion-color-medium,#8b897f); font-size:.78rem; margin:.25rem 0 .1rem; }
    /* El motivo se LEE sin tocar nada y sin ratón: nunca en un title ni dentro del botón. */
    .leg-reason { margin:.35rem 0 0; color:var(--ion-color-warning-shade,#b26a00); font-size:.82rem; }
    /* sales#166 - WHAT WAS NOT PAID IN MONEY: one card per covered line, with the slot hole
       underneath. A rule separates it from the split above, because they answer two different
       questions: how much money goes back, and what goes back to its tender. */
    .rt-block { border-top:1px solid var(--ion-border-color,#e0ddd4); padding-top:.85rem;
      display:flex; flex-direction:column; gap:.4rem; }
    .rt-lbl { font-weight:700; }
    .rt-list { list-style:none; margin:.2rem 0 0; padding:0; display:flex; flex-direction:column; gap:.5rem; }
    .refund-tender-line { border:1px solid var(--ion-border-color,#e0ddd4);
      border-radius:var(--ok-radius,12px); padding:.6rem .7rem; }
    .rt-name { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .rt-slot { margin-top:.45rem; }
    .rt-slot:empty { display:none; }
    .totals { display:flex; justify-content:space-between; align-items:baseline; font-size:1.05rem; }
    .totals .v { font-weight:800; }
    .block { margin:0; color:var(--ion-color-danger,#d9480f); font-size:.85rem; }
    /* El color de un ion-button dentro de shadow DOM NO puede venir del atributo color="danger":
       esa via pasa por las reglas globales .ion-color-*, que tampoco atraviesan el shadow. Medido: el
       boton salia con fondo transparente y texto blanco, o sea INVISIBLE sobre fondo claro. Las
       custom properties de Ionic si entran, asi que el color se pone por ahi. */
    ion-button.refund-confirm { --background:var(--ion-color-danger,#eb445a);
      --background-activated:var(--ion-color-danger-shade,#cf3c4f);
      --color:var(--ion-color-danger-contrast,#fff); --border-radius:12px; min-height:48px; }
    /* Bloqueado se ve apagado, pero SIGUE recibiendo el toque (aria-disabled, no disabled).
       🔴 El selector va sobre data-blocked, NO sobre [aria-disabled]: medido en un Chromium de
       verdad contra el preview, Ionic MUEVE los aria-* del host al <button> nativo de su shadow
       (el host se queda con class/expand/color y el interior recibe aria-disabled="true"). Es
       decir: el contrato de accesibilidad se cumple, pero un CSS colgado de [aria-disabled] en el
       host no casa NUNCA y el botón se ve encendido estando bloqueado.
       (Y no metas acentos graves en un comentario dentro de una plantilla css: cierran el
       literal.) */
    ion-button.refund-confirm[data-blocked='true'] { opacity:.75; }
    /* Tres viewports: por debajo de 560 px la ficha de la pata apila cifras e importe, que en una
       tablet de mostrador en vertical se salían de la caja. */
    @media (max-width: 559.98px) {
      .leg-head { flex-direction:column; align-items:stretch; }
      .leg-head ion-input { max-width:none; margin-left:0; }
      .leg-figures { gap:.5rem; }
    }
  `;
  }
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("erp:tender-refund-armed", this.onTenderRefundArmed);
    this.addEventListener("erp:tender-refund-disarmed", this.onTenderRefundDisarmed);
    void this.load();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("erp:tender-refund-armed", this.onTenderRefundArmed);
    this.removeEventListener("erp:tender-refund-disarmed", this.onTenderRefundDisarmed);
  }
  updated(changed) {
    if (changed.has("saleId")) void this.load();
    this.ensureTenderSlotsMounted();
  }
  async load() {
    const saleId = this.saleId;
    if (!saleId || this.loadedFor === saleId) return;
    this.loadedFor = saleId;
    this.loading = true;
    this.error = "";
    try {
      const [sales, legs, methods] = await Promise.all([
        erplora4().query("sales.get", { sale_id: saleId }),
        erplora4().query("sales.refund_options", { sale_id: saleId }),
        erplora4().query("sales.payment_methods")
      ]);
      this.sale = sales?.[0];
      this.legs = (legs ?? []).filter((l3) => Number(l3.remaining) > 0 || Number(l3.charged) > 0);
      this.methods = methods ?? [];
      this.key = newKey(saleId);
      const split = proportionalSplit(refundableTotal(this.legs), this.legs);
      this.draft = Object.fromEntries(Object.entries(split).map(([id, amount]) => [id, { amount }]));
      await this.loadTenderLines(saleId);
    } catch (e7) {
      const t7 = (k2) => erplora4().t(CATALOG4, k2);
      const transport = transportErrorKey(e7);
      this.error = transport ? t7(transport) : domainErrorText(CATALOG4, erplora4().locale, e7) || t7("ui.errorLoadSale");
    } finally {
      this.loading = false;
    }
  }
  /**
   * The ACCESSORY side of the screen: the lines another tender paid for, and the hole where its
   * owner decides whether they go back (sales#166 / ADR-0386).
   *
   * 🔴 Nothing here may bring down the money refund, which is this screen's authority: a customer
   * waiting for 18,00 € does not go without them because an accessory module did not answer. Hence
   * a `catch` of its own on every step, and the worst case is a section that is not painted.
   *
   * And the lines are not asked for when nobody fills the slot: with no tender owner there is
   * nothing to offer, so the read would be a call no pixel uses.
   */
  async loadTenderLines(saleId) {
    this.covered = [];
    this.tenderNotices = /* @__PURE__ */ new Map();
    const sdk = erplora4();
    if (typeof sdk.loadSlot !== "function") {
      this.tenderFillers = [];
      return;
    }
    try {
      const rows3 = await sdk.loadSlot("sales.refund.tender") ?? [];
      this.tenderFillers = rows3.map((f3) => String(f3.component));
    } catch {
      this.tenderFillers = [];
    }
    if (!this.tenderFillers.length) return;
    try {
      const lines = await sdk.query("sales.lines", { sale_id: saleId });
      this.covered = coveredLines(lines ?? []);
    } catch {
      this.covered = [];
    }
  }
  /**
   * One filler instance per covered line. Idempotent: the screen re-renders on every keystroke of
   * an amount.
   *
   * 🔴 The four properties are set BEFORE the element is inserted - same reason as in the till
   * (sales#162): the filler starts its read in `connectedCallback`, so inserting it first would
   * make it ask about an empty sale and paint "nothing to give back here" over a session that
   * does go back.
   */
  ensureTenderSlotsMounted() {
    if (!this.tenderFillers.length) return;
    const ordinals = serviceOrdinals(this.covered);
    const alive = /* @__PURE__ */ new Set();
    for (const l3 of this.covered) {
      const host = [...this.renderRoot.querySelectorAll(".refund-tender-line")].find((n6) => n6.dataset.line === l3.id)?.querySelector(".rt-slot");
      if (!host) continue;
      for (const component of this.tenderFillers) {
        const key = `${component}::${l3.id}`;
        alive.add(key);
        let el = this.tenderEls.get(key);
        if (!el) {
          el = document.createElement(component);
          this.tenderEls.set(key, el);
        }
        const props = el;
        props.saleId = this.saleId ?? "";
        props.lineRef = l3.id;
        props.serviceId = l3.product_id ?? "";
        props.lineIndex = ordinals.get(l3.id) ?? 0;
        if (el.parentElement !== host) host.appendChild(el);
      }
    }
    for (const [key, el] of [...this.tenderEls]) {
      if (alive.has(key)) continue;
      el.remove();
      this.tenderEls.delete(key);
    }
  }
  /** El operador teclea EUROS; lo que se guarda son céntimos. Nada más se recalcula: su reparto. */
  setAmount(paymentId, text) {
    this.draft = { ...this.draft, [paymentId]: { ...this.draft[paymentId], amount: parseAmountToCents(text) } };
  }
  setDestination(paymentId, methodId) {
    this.draft = { ...this.draft, [paymentId]: { ...this.draft[paymentId], to: methodId || void 0 } };
  }
  proposeAll() {
    const split = proportionalSplit(refundableTotal(this.legs), this.legs);
    this.draft = Object.fromEntries(
      Object.entries(split).map(([id, amount]) => [id, { ...this.draft[id], amount }])
    );
  }
  /** Por qué no se puede confirmar, ya escrito. `undefined` = adelante. */
  get blockText() {
    const t7 = (k2, p4) => erplora4().t(CATALOG4, k2, p4);
    const block = refundBlock(this.draft, this.legs);
    if (block?.reason === "nothing") return t7("ui.refundNothingToReturn");
    if (block?.reason === "over-cap") {
      return t7("ui.refundOverCap", {
        method: this.legName(block.leg),
        amount: erplora4().formatMoney(block.amount),
        remaining: erplora4().formatMoney(block.remaining)
      });
    }
    if (block?.reason === "needs-destination") {
      return t7("ui.refundNeedsDestination", { method: this.legName(block.leg) });
    }
    if (!this.reason.trim()) return t7("ui.refundReasonRequired");
    return void 0;
  }
  /** El nombre del método en el idioma del usuario: la fila guarda el nombre canónico del seed. */
  legName(leg) {
    return payMethodDisplayName(
      { id: leg.payment_method_id ?? "", name: leg.payment_method_name },
      (k2) => erplora4().t(CATALOG4, k2)
    );
  }
  async confirm() {
    const t7 = (k2, p4) => erplora4().t(CATALOG4, k2, p4);
    const why = this.blockText;
    if (why) {
      erplora4().notify?.({ type: "error", message: why });
      return;
    }
    if (this.busy) return;
    this.busy = true;
    try {
      const out = await erplora4().command("sales.refund", {
        sale_id: this.saleId,
        reason: this.reason.trim(),
        // La MISMA clave en cada intento: un reintento recupera el documento ya escrito en vez de
        // devolver el dinero por segunda vez (y `refund_ref` sigue siendo el mismo para services).
        idempotency_key: this.key,
        allocations: buildAllocations(this.draft, this.legs)
      });
      const committed = await this.commitTenderRefunds(out);
      erplora4().notify?.({ type: "success", message: t7("ui.refundDone") });
      if (!committed) erplora4().notify?.({ type: "error", message: t7("ui.refundTenderPending") });
      this.dispatchEvent(new CustomEvent("refunded", { bubbles: true, composed: true, detail: { saleId: this.saleId } }));
    } catch (e7) {
      erplora4().notify?.({ type: "error", message: t7(refundErrorKey(errorCode(e7))) });
    } finally {
      this.busy = false;
    }
  }
  /**
   * Hands every filler the document reference and WAITS for whatever it commits to do.
   *
   * The contract is `respondWith`'s: the detail carries `waitFor(promise)`, and whoever calls it
   * delays the screen's close until it settles. A filler that does not call it blocks nothing - the
   * host cannot force anyone to answer, and waiting forever would be worse than not waiting.
   *
   * Returns whether everything promised went through. It never throws: the money is already back.
   */
  async commitTenderRefunds(out) {
    const refundRef = String(out?.refund_ref ?? out?.refund_id ?? "");
    if (!refundRef || !this.tenderEls.size) return true;
    const refundId = String(out?.refund_id ?? refundRef);
    const pending = [];
    let dispatched = true;
    for (const el of this.tenderEls.values()) {
      const props = el;
      props.refundId = refundId;
      props.refundRef = refundRef;
      try {
        el.dispatchEvent(new CustomEvent("erp:tender-refund-commit", {
          detail: {
            saleId: this.saleId,
            refundId,
            refundRef,
            waitFor: (p4) => {
              pending.push(Promise.resolve(p4));
            }
          },
          bubbles: false
        }));
      } catch {
        dispatched = false;
      }
    }
    if (!pending.length) return dispatched;
    const settled = await Promise.allSettled(pending);
    return dispatched && settled.every((s5) => s5.status === "fulfilled");
  }
  /**
   * The lines an external tender paid for, with their hole underneath (sales#166 / ADR-0386).
   *
   * They are not part of the split above because they cost no money (`is_covered` -> net 0, tax 0),
   * which is why they need a place of their own: without it, the only way to give a session back
   * would be for the operator to remember to walk into the tender's module, which is exactly what
   * the market gets wrong.
   *
   * With no fillers NOTHING is painted: no header, no list, no empty hole.
   */
  renderTenderLines() {
    const t7 = (k2, p4) => erplora4().t(CATALOG4, k2, p4);
    if (!this.tenderFillers.length || !this.covered.length) return A;
    return b2`
      <div class="rt-block">
        <div class="rt-lbl">${t7("ui.refundLineTenders")}</div>
        <p class="hint">${t7("ui.refundLineTendersHint")}</p>
        <ul class="rt-list">
          ${this.covered.map((l3) => b2`
            <li class="refund-tender-line" data-line=${l3.id}>
              <div class="rt-name">${l3.product_name ?? ""}</div>
              <div class="rt-slot"></div>
            </li>`)}
        </ul>
      </div>`;
  }
  /** The warnings the fillers want read BEFORE confirming. They warn; they never block. */
  renderTenderNotices() {
    const notices = [...this.tenderNotices.values()].filter((n6) => !!n6);
    if (!notices.length) return A;
    return notices.map((n6) => b2`
      <ok-inline-feedback class="rt-notice" tone="warning" icon="alert-circle-outline">${n6}</ok-inline-feedback>`);
  }
  renderLeg(leg) {
    const t7 = (k2, p4) => erplora4().t(CATALOG4, k2, p4);
    const money2 = (c5) => erplora4().formatMoney(c5);
    const entry = this.draft[leg.payment_id];
    const eligible = Number(leg.refundable) === 1;
    return b2`<div class="leg" data-leg=${leg.payment_id}>
      <div class="leg-head">
        <span class="leg-name">${this.legName(leg)}</span>
        <ion-input
          class="refund-amount"
          type="text"
          inputmode="decimal"
          label=${t7("ui.refundLegAmount")}
          label-placement="stacked"
          .value=${formatAmountInput(entry?.amount ?? 0, erplora4().locale)}
          @ionInput=${(e7) => this.setAmount(leg.payment_id, e7.detail?.value ?? "")}
        ></ion-input>
      </div>
      <div class="leg-figures">
        <span>${t7("ui.refundLegCharged")}: ${money2(leg.charged)}</span>
        ${leg.refunded > 0 ? b2`<span>${t7("ui.refundLegRefunded")}: ${money2(leg.refunded)}</span>` : A}
        <span>${t7("ui.refundLegRemaining")}: ${money2(leg.remaining)}</span>
      </div>
      ${eligible ? A : b2`<p class="leg-reason">${t7(reasonKey(leg.reason))}</p>
            ${leg.remaining > 0 ? b2`<ion-select
                  class="refund-destination"
                  label=${t7("ui.refundDestination")}
                  label-placement="stacked"
                  .value=${entry?.to ?? ""}
                  @ionChange=${(e7) => this.setDestination(leg.payment_id, e7.detail?.value ?? "")}
                >
                  ${this.methods.map((m4) => b2`<ion-select-option value=${m4.id}>${payMethodDisplayName(m4, (k2) => erplora4().t(CATALOG4, k2))}</ion-select-option>`)}
                </ion-select>` : A}`}
    </div>`;
  }
  render() {
    const t7 = (k2, p4) => erplora4().t(CATALOG4, k2, p4);
    if (this.loading) {
      return b2`<div class="refund-loading">
        <ion-spinner name="crescent"></ion-spinner>
        <span>${t7("ui.refundLoading")}</span>
      </div>`;
    }
    if (this.error) {
      return b2`<ok-inline-feedback tone="danger" icon="alert-circle-outline">${this.error}</ok-inline-feedback>`;
    }
    if (!this.legs.length) {
      return b2`<ok-inline-feedback tone="warning" icon="information-circle-outline">${t7("ui.refundNothing")}</ok-inline-feedback>`;
    }
    const total = draftTotal(this.draft);
    const block = this.blockText;
    return b2`<div class="refund-body">
      <h3>${t7("ui.refundTitle", { number: this.sale?.sale_number ?? "" })}</h3>
      <p class="hint">${t7("ui.refundExplain")}</p>
      <div class="legs">${this.legs.map((l3) => this.renderLeg(l3))}</div>
      ${this.renderTenderLines()}
      <ion-button class="refund-propose" size="small" fill="clear" @click=${() => this.proposeAll()}>
        ${t7("ui.refundProposeAll")}
      </ion-button>
      <ion-textarea
        class="refund-reason"
        label=${t7("ui.refundReasonLabel")}
        label-placement="stacked"
        maxlength="500"
        placeholder=${t7("ui.refundReasonPlaceholder")}
        .value=${this.reason}
        @ionInput=${(e7) => {
      this.reason = e7.detail?.value ?? "";
    }}
      ></ion-textarea>
      <div class="totals">
        <span>${t7("ui.refundTotalLabel")}</span>
        <span class="v">${erplora4().formatMoney(total)}</span>
      </div>
      <!-- EL MOTIVO DEL BLOQUEO, ESCRITO EN LA PANTALLA: se lee sin tocar nada y sin un ratón. -->
      ${block ? b2`<p class="block">${block}</p>` : A}
      <!-- And the external tenders' warnings, next to the button: the line's hole can be
           off-screen when the thumb is already on the refund button (sales#166). -->
      ${this.renderTenderNotices()}
      <!-- 🔴 aria-disabled, JAMÁS el disabled de Ionic: en modo ios es pointer-events:none y en
           una tablet de mostrador el toque muere en silencio (sales#58). El estado ocupado sí es
           disabled de verdad: ahí no hay nada que contestar y un segundo toque devolvería dos
           veces. (Y no metas acentos graves en un comentario dentro de una plantilla Lit: cierran
           el literal.) -->
      <ion-button
        class="refund-confirm"
        expand="block"
        ?disabled=${this.busy}
        aria-disabled=${block ? "true" : A}
        data-blocked=${block ? "true" : A}
        @click=${() => {
      void this.confirm();
    }}
      >${t7("ui.refundConfirm", { amount: erplora4().formatMoney(total) })}</ion-button>
    </div>`;
  }
};
__decorateClass([
  n4({ attribute: "sale-id" })
], ErpSaleRefund.prototype, "saleId", 2);
__decorateClass([
  r5()
], ErpSaleRefund.prototype, "sale", 2);
__decorateClass([
  r5()
], ErpSaleRefund.prototype, "legs", 2);
__decorateClass([
  r5()
], ErpSaleRefund.prototype, "methods", 2);
__decorateClass([
  r5()
], ErpSaleRefund.prototype, "draft", 2);
__decorateClass([
  r5()
], ErpSaleRefund.prototype, "reason", 2);
__decorateClass([
  r5()
], ErpSaleRefund.prototype, "loading", 2);
__decorateClass([
  r5()
], ErpSaleRefund.prototype, "error", 2);
__decorateClass([
  r5()
], ErpSaleRefund.prototype, "busy", 2);
__decorateClass([
  r5()
], ErpSaleRefund.prototype, "covered", 2);
__decorateClass([
  r5()
], ErpSaleRefund.prototype, "tenderFillers", 2);
__decorateClass([
  r5()
], ErpSaleRefund.prototype, "tenderNotices", 2);
define("erp-sale-refund", ErpSaleRefund);

// ui/components/erp-sales-list/erp-sales-list.ts
var CATALOG5 = { es: es_default, en: en_default };
var STATUS_KEYS = {
  completed: "ui.statusCompleted",
  voided: "ui.statusVoided",
  // sales#160: una venta devuelta ENTERA pasa a `refunded`. Sin su clave, la celda pintaba la
  // palabra cruda de la base de datos sobre una UI en español (el mismo defecto que hub#923).
  refunded: "ui.statusRefunded"
};
var VOID_MESSAGES = {
  "sales.void_requires_credit_note": "ui.voidRequiresCreditNote",
  "sales.already_voided": "ui.voidAlreadyVoided",
  "sales.void_reason_required": "ui.voidReasonRequired",
  "sales.sale_not_found": "ui.voidSaleNotFound",
  // sales#247 — la venta ya tiene devoluciones. La frase NO se queda en «no se pudo»: nombra la
  // salida (devolver lo que queda), que es la acción de al lado y sigue estando ahí.
  "sales.sale_already_refunded": "ui.voidAlreadyRefunded"
};
function voidErrorKey(code) {
  return VOID_MESSAGES[code] ?? "ui.voidFailed";
}
var RANGE_KEYS = { today: "ui.rangeToday", "7d": "ui.range7d", "30d": "ui.range30d", all: "ui.rangeAll" };
function isoDay(daysAgo = 0) {
  const d3 = /* @__PURE__ */ new Date();
  d3.setDate(d3.getDate() - daysAgo);
  const pad = (n6) => String(n6).padStart(2, "0");
  return `${d3.getFullYear()}-${pad(d3.getMonth() + 1)}-${pad(d3.getDate())}`;
}
function rangeBounds(range) {
  if (range === "all") return {};
  const days = range === "today" ? 0 : range === "7d" ? 6 : 29;
  return { from: isoDay(days), to: isoDay(0) };
}
function erplora5() {
  const c5 = globalThis.erplora;
  if (!c5) throw new Error("erplora SDK no inicializado por el shell");
  return c5;
}
var _ErpSalesList = class _ErpSalesList extends i3 {
  constructor() {
    super(...arguments);
    this.stats = { count: 0, total_revenue: 0, avg_ticket: 0 };
    this.range = "today";
    this.statsError = "";
    this.tick = 0;
    this.kpiRow = false;
    this.onKpiMqChange = (e7) => {
      if (this.kpiRow !== e7.matches) this.kpiRow = e7.matches;
    };
    this.payMethods = [];
    this.onLocaleChange = () => this.requestUpdate();
  }
  static {
    this.styles = i`
    /* sales#126 — la vista LLENA el alto del outlet y gestiona SU scroll (el mismo contrato que
       payments/list y erp-pos). El body del hub tiene «overflow: hidden»: si el contenido crece
       por debajo del viewport y la propia vista no scrolla, no hay forma de llegar a él — ni rueda,
       ni teclado, ni arrastre. «min-height: 0» es lo que deja al hijo encogerse en el flex. */
    :host { display:flex; flex-direction:column; height:100%; min-height:0; font-family: system-ui, sans-serif; color: var(--ion-text-color,#1c1b18); }
    /* sales#126 — TODO el contenido vive en el contenedor con scroll propio: título, rangos, KPIs,
       tabla y pie «N registros» se alcanzan scrollando AQUÍ, salga lo que salga en cada viewport. */
    .scroll { flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; }
    h2 { margin:0 0 .75rem; font-size:1.15rem; }
    .cards { display:flex; gap:.6rem; margin-bottom:1rem; flex-wrap:wrap; }
    /* sales#126 — por debajo de 768 px los 6 KPI NO se apilan en 2 columnas × 3 filas (~230 px que
       se comían el viewport): UNA fila desplazable horizontalmente (Square/Toast). El desbordamiento
       horizontal lo absorbe la propia tira, nunca la página. */
    .cards.kpi-row { flex-wrap:nowrap; overflow-x:auto; min-width:0; scrollbar-width:thin; }
    .cards.kpi-row .card { flex:0 0 auto; }
    .range-segment { margin:.25rem 0 .75rem; max-width:32rem; }
    .card { flex:1; min-width:8rem; padding:.7rem .9rem; border:1px solid var(--ion-border-color,#e0ddd4); border-radius: var(--ok-radius, 12px); }
    .card .k { color:#8b897f; font-size:.75rem; text-transform:uppercase; }
    .card .v { font-size:1.3rem; font-weight:700; }
    .err { color:#d9480f; }
  `;
  }
  static {
    /** sales#126 — por debajo de 768 px los KPI colapsan en UNA fila desplazable (Square/Toast).
     *  La clase `kpi-row` es la que apaga el `flex-wrap`; así el contrato es medible en DOM y sigue
     *  al viewport en vivo (mismo mecanismo de matchMedia que usa ok-data-table para su modo tarjetas). */
    this.KPI_ROW_QUERY = "(max-width: 767.98px)";
  }
  // Getter (no campo): se re-evalúa en cada render, así los textos cambian con el idioma activo
  // (ADR-0055). El listener `erplora:locale-changed` re-renderiza.
  get documentActions() {
    const t7 = (k2) => erplora5().t(CATALOG5, k2);
    const actions = [
      { id: "document", label: t7("ui.actionDocument"), icon: "receipt-outline" }
    ];
    if (erplora5().hasPermission?.("sales.void_sale")) {
      actions.push({
        id: "void",
        label: t7("ui.actionVoid"),
        icon: "ban-outline",
        color: "danger",
        disabled: (r6) => r6.status !== "completed" || Number(r6.refunded_total ?? 0) > 0
      });
    }
    if (erplora5().hasPermission?.("sales.refund_sale")) {
      actions.push({
        id: "refund",
        label: t7("ui.actionRefund"),
        icon: "return-down-back-outline",
        color: "warning",
        disabled: (r6) => r6.status !== "completed"
      });
    }
    return actions;
  }
  /** sales#26 — pide el MOTIVO (obligatorio: Toast, Lightspeed y el software fiscal español lo
   *  exigen; es lo que luego se lee en el historial) y anula. Overlay global de Ionic, como el TPV. */
  async confirmVoid(sale) {
    const t7 = (k2, p4) => erplora5().t(CATALOG5, k2, p4);
    const alert = document.createElement("ion-alert");
    alert.header = t7("ui.voidTitle", { number: sale.sale_number });
    alert.message = t7("ui.voidExplain");
    alert.inputs = [{ name: "reason", type: "textarea", placeholder: t7("ui.voidReasonPlaceholder"), attributes: { maxlength: 500 } }];
    alert.buttons = [
      { text: t7("ui.cancel"), role: "cancel" },
      { text: t7("ui.actionVoid"), role: "destructive", handler: (data) => {
        const reason = (data?.reason ?? "").trim();
        if (!reason) {
          erplora5().notify?.({ type: "error", message: t7("ui.voidReasonRequired") });
          return false;
        }
        void this.voidSale(sale.id, reason);
        return true;
      } }
    ];
    alert.addEventListener("ionAlertDidDismiss", () => alert.remove(), { once: true });
    document.body.appendChild(alert);
    try {
      if (typeof alert.present === "function") await alert.present();
      else alert.isOpen = true;
    } catch {
      alert.remove();
    }
  }
  /** Ejecuta `sales.void`; el servidor decide (motivo, estado, factura) y aquí solo se cuenta. */
  async voidSale(saleId, reason) {
    const t7 = (k2) => erplora5().t(CATALOG5, k2);
    try {
      await erplora5().command("sales.void", { sale_id: saleId, reason });
      erplora5().notify?.({ type: "success", message: t7("ui.voidDone") });
      await Promise.all([this.ctrl.load(), this.loadStats()]);
    } catch (e7) {
      erplora5().notify?.({ type: "error", message: t7(voidErrorKey(errorCode(e7))) });
    }
  }
  get columns() {
    const t7 = (k2) => erplora5().t(CATALOG5, k2);
    return [
      // sales#27: la hora de cada venta a la vista (antes se ordenaba por ella y no se pintaba).
      {
        key: "created_at",
        header: t7("ui.colDate"),
        sortable: true,
        filterable: true,
        filterType: "daterange",
        format: (r6) => formatDateTime(String(r6.created_at ?? ""), erplora5().locale)
      },
      { key: "sale_number", header: t7("ui.colNumber"), sortable: true, filterable: true, filterType: "text" },
      { key: "customer_name", header: t7("ui.colCustomer"), sortable: true, filterable: true, filterType: "text", format: (r6) => r6.customer_name || "\u2014" },
      // sales#108: the row stores the canonical seed name («Cash»); the cell speaks the user's language.
      // sales#181: and so does the FILTER. Free text went to the server verbatim, against that same
      // canonical name, so filtering by the «Efectivo» you can read returned zero sales without a
      // word. Payment method is an enumerated dimension (Square, Toast, Odoo, Shopify all offer a
      // picker): the options carry the visible name and send the stored one. Same shape as `status`.
      {
        key: "payment_method_name",
        header: t7("ui.colPayment"),
        sortable: true,
        filterable: true,
        ...this.payMethods.length ? {
          filterType: "select",
          options: this.payMethods.map((m4) => ({ value: m4.name, label: payMethodDisplayName(m4, t7) }))
        } : { filterType: "text" },
        format: (r6) => r6.payment_method_name ? payMethodDisplayName({ id: "", name: r6.payment_method_name }, t7) : "\u2014"
      },
      {
        key: "status",
        header: t7("ui.colStatus"),
        sortable: true,
        filterable: true,
        filterType: "select",
        options: [
          { value: "completed", label: t7("ui.statusCompleted") },
          { value: "voided", label: t7("ui.statusVoided") },
          { value: "refunded", label: t7("ui.statusRefunded") }
        ],
        // hub#923: el filtro traducía, pero la CELDA pintaba el valor crudo de la BD — «completed»,
        // en inglés, sobre una UI en español. Es la lista a la que se manda al cajero cuando un cobro
        // queda en duda, así que la palabra que dice «esto se cobró» no puede ser jerga. Un estado
        // desconocido (un módulo más nuevo escribiendo `refunded`) cae a su valor crudo: peor sería
        // una celda vacía, que esconde el estado de la fila.
        format: (r6) => STATUS_KEYS[String(r6.status ?? "")] ? t7(STATUS_KEYS[String(r6.status)]) : String(r6.status ?? "")
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
    if (typeof window.matchMedia === "function") {
      this.kpiMq = window.matchMedia(_ErpSalesList.KPI_ROW_QUERY);
      this.kpiRow = this.kpiMq.matches;
      this.kpiMq.addEventListener("change", this.onKpiMqChange);
    }
    const b3 = rangeBounds(this.range);
    this.ctrl = createListController(erplora5(), "sales.list", () => this.requestUpdate(), {
      pageSize: 50,
      sort: "created_at",
      dir: "desc",
      // sales#27: se abre en HOY — las filas y los KPIs responden al mismo rango.
      // sales#125: el rango viaja como DÍAS (`erp_date`, la parte fecha que proyecta la query), no
      // sobre el timestamp crudo: el motor compara la columna tal cual y «hasta hoy» cortaba a las
      // 00:00 — «Hoy»/«7 días»/«30 días» salían vacías mientras los KPIs (que comparan por día)
      // sí contaban el día en curso.
      filters: b3.from ? { erp_date: { from: b3.from, to: b3.to } } : {}
    });
    await Promise.all([this.ctrl.load(), this.loadStats(), this.loadPayMethods()]);
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
    this.kpiMq?.removeEventListener("change", this.onKpiMqChange);
    super.disconnectedCallback();
    this.unsub?.();
  }
  /** sales#181 — the active payment methods, only to populate the column filter. If the query fails
   *  (no permission, a half-installed module) the list stays empty and the filter remains a text
   *  box: the history still opens, which is what the cashier came here for. */
  async loadPayMethods() {
    try {
      const rows3 = await erplora5().query("sales.payment_methods");
      this.payMethods = Array.isArray(rows3) ? rows3 : [];
    } catch {
      this.payMethods = [];
    }
  }
  /** El selector de fechas de la propia tabla (columna «Fecha») también filtra por DÍA: la
   *  columna pinta `created_at`, pero el rango que pide el usuario es de días y el filtro del
   *  servidor es `erp_date` (sales#125). Mandarlo al timestamp repetiría el corte a las 00:00. */
  onFilterChange(e7) {
    const col = e7.detail.col === "created_at" ? "erp_date" : e7.detail.col;
    this.ctrl.setFilter(col, e7.detail.value);
  }
  static {
    /** sales#243 — la columna «Nº» PINTA `sale_number` y ORDENA por `sale_seq`.
     *
     *  Mismo desdoblamiento que la columna «Fecha» de aquí arriba, y por el mismo motivo: lo que la
     *  celda enseña y lo que el servidor sabe ordenar son dos columnas distintas, y la traducción
     *  vive en esta frontera, que es la única que conoce las dos.
     *
     *  `sale_number` es TEXTO `YYYYMMDD-<secuencia>` y el relleno es un MÍNIMO, no un techo
     *  (hub#1393, tras la caída de sales#241): pasada la venta 9.999 del día la secuencia crece un
     *  dígito y el orden de texto deja de ser el numérico — la 10.000 caía entre la 1.000 y la 2.000.
     *  `sales.list` proyecta `sale_seq` justo para esto: una clave sintética que solo existe para
     *  ordenar. El número fiscal no se reescribe en ninguna parte — ni en la celda, ni en la query,
     *  ni en la fila.
     *
     *  El mapa es de UNA columna a propósito: reescribir a ciegas es como la columna de fecha
     *  acabaría pidiendo en silencio una clave que no existe. */
    this.SORT_KEYS = { sale_number: "sale_seq" };
  }
  onSortChange(e7) {
    this.ctrl.setSort(_ErpSalesList.SORT_KEYS[e7.detail.sort] ?? e7.detail.sort, e7.detail.dir);
  }
  /** La columna que la tabla marca como activa: la que el usuario pulsó, no la clave con la que se
   *  pregunta. Sin la vuelta atrás, `ok-data-table` recibiría `sale_seq` —una columna que no
   *  tiene—, borraría la flecha de «Nº» y la pantalla parecería sin ordenar estándo ordenada. */
  get paintedSort() {
    const asked = this.ctrl?.state.sort;
    if (asked === void 0) return void 0;
    return Object.keys(_ErpSalesList.SORT_KEYS).find((k2) => _ErpSalesList.SORT_KEYS[k2] === asked) ?? asked;
  }
  /** sales#27: cambia el rango de filas Y KPIs a la vez. */
  async setRange(range) {
    this.range = range;
    const b3 = rangeBounds(range);
    this.ctrl.setFilter("erp_date", b3.from ? { from: b3.from, to: b3.to } : null);
    await this.loadStats();
  }
  async loadStats() {
    try {
      const b3 = rangeBounds(this.range);
      const rows3 = await erplora5().query("sales.stats", { date_from: b3.from ?? null, date_to: b3.to ?? null });
      this.stats = rows3 && rows3[0] || { count: 0, total_revenue: 0, avg_ticket: 0 };
    } catch (e7) {
      const t7 = (k2) => erplora5().t(CATALOG5, k2);
      const transport = transportErrorKey(e7);
      this.statsError = transport ? t7(transport) : domainErrorText(CATALOG5, erplora5().locale, e7) || t7("ui.errorStats");
    }
  }
  render() {
    const t7 = (k2) => erplora5().t(CATALOG5, k2);
    return b2`<div class="scroll">
        <h2>${t7("ui.sales")}</h2>
        <ion-segment class="range-segment" value=${this.range} aria-label=${t7("ui.rangeLabel")}
          @ionChange=${(e7) => {
      void this.setRange(e7.detail.value || "today");
    }}>
          ${Object.keys(RANGE_KEYS).map((r6) => b2`<ion-segment-button value=${r6}><ion-label>${t7(RANGE_KEYS[r6])}</ion-label></ion-segment-button>`)}
        </ion-segment>
        <div class=${this.kpiRow ? "cards kpi-row" : "cards"}>
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
          <div class="card">
            <div class="k">${t7("ui.kpiTax")}</div>
            <div class="v">${erplora5().formatMoney(Number(this.stats.tax_total || 0))}</div>
          </div>
          <div class="card">
            <div class="k">${t7("ui.kpiDiscounts")}</div>
            <div class="v">${erplora5().formatMoney(Number(this.stats.discount_total || 0))}</div>
          </div>
          <div class="card">
            <div class="k">${t7("ui.kpiVoided")}</div>
            <div class="v">${Number(this.stats.voided_count || 0)}</div>
          </div>
        </div>
        ${this.statsError ? b2`<ok-inline-feedback tone="danger" icon="alert-circle-outline">${this.statsError}</ok-inline-feedback>` : A}
        ${this.ctrl?.error ? b2`<ok-inline-feedback tone="danger" icon="alert-circle-outline">${this.ctrl.error}</ok-inline-feedback>` : A}
        <!-- The «document» button is not the only door: rowClickable makes the whole row open the
             same document (outfitkit#67 — the actions column can be off-screen at 1440 px). -->
        <ok-data-table .serverSide=${true} .columns=${this.columns} .views=${true} .cardTitle=${(r6) => String(r6.sale_number ?? "\u2014")} .cardIcon=${() => "receipt-outline"} .rows=${this.ctrl?.rows ?? []} .total=${this.ctrl?.total ?? 0} .page=${this.ctrl?.state.page ?? 0} .pageSize=${this.ctrl?.state.pageSize ?? 50} .sort=${this.paintedSort} .sortDir=${this.ctrl?.state.dir ?? "desc"} .searchable=${true} .searchPlaceholder=${t7("ui.searchSalePlaceholder")} .emptyMessage=${this.ctrl?.loading ? t7("ui.loading") : t7("ui.noSales")} .actions=${this.documentActions} .rowClickable=${true} @rowAction=${(e7) => {
      if (e7.detail.actionId === "document") this.docSaleId = e7.detail.row.id;
      else if (e7.detail.actionId === "void") void this.confirmVoid(e7.detail.row);
      else if (e7.detail.actionId === "refund") this.refundSaleId = e7.detail.row.id;
    }} @rowClick=${(e7) => {
      this.docSaleId = e7.detail.row.id;
    }} @pageChange=${(e7) => this.ctrl.setPage(e7.detail)} @sortChange=${(e7) => this.onSortChange(e7)} @searchChange=${(e7) => this.ctrl.setSearch(e7.detail)} @filterChange=${(e7) => this.onFilterChange(e7)}></ok-data-table>
      </div>
      <!-- sales#126 — el modal FUERA del contenedor con scroll: Ionic lo reparenta al light-DOM
           igual, pero así la vista no arrastra overlays al scrollear. -->
      ${renderDocumentModal({ saleId: this.docSaleId, onClose: () => {
      this.docSaleId = void 0;
    }, t: t7 })}
      <!-- sales#160 — la devolución vive en su propio modal: el reparto por tender no cabe en un
           ion-alert, y el operador tiene que poder leer los topes mientras teclea. -->
      <ion-modal class="refund-modal" .isOpen=${!!this.refundSaleId}
        @ionModalDidDismiss=${() => {
      this.refundSaleId = void 0;
    }}>
        <ion-content>
          ${this.refundSaleId ? b2`<erp-sale-refund .saleId=${this.refundSaleId} @refunded=${() => {
      this.refundSaleId = void 0;
      void this.ctrl.load();
      void this.loadStats();
    }}></erp-sale-refund>` : A}
        </ion-content>
      </ion-modal>`;
  }
};
__decorateClass([
  r5()
], _ErpSalesList.prototype, "stats", 2);
__decorateClass([
  r5()
], _ErpSalesList.prototype, "range", 2);
__decorateClass([
  r5()
], _ErpSalesList.prototype, "statsError", 2);
__decorateClass([
  r5()
], _ErpSalesList.prototype, "tick", 2);
__decorateClass([
  r5()
], _ErpSalesList.prototype, "kpiRow", 2);
__decorateClass([
  r5()
], _ErpSalesList.prototype, "payMethods", 2);
__decorateClass([
  r5()
], _ErpSalesList.prototype, "docSaleId", 2);
__decorateClass([
  r5()
], _ErpSalesList.prototype, "refundSaleId", 2);
var ErpSalesList = _ErpSalesList;
define("erp-sales-list", ErpSalesList);
