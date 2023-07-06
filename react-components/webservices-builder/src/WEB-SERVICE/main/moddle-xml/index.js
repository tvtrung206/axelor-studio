import { forEach, assign, find, filter, isString, map } from "min-dash";
import { Parser } from "saxen";
import { coerceType, parseNameNS, isSimpleType, Moddle } from "../moddle";

function hasLowerCaseAlias(pkg) {
  return pkg.xml && pkg.xml.tagAlias === "lowerCase";
}

const DEFAULT_NS_MAP = {
  xsi: "http://www.w3.org/2001/XMLSchema-instance",
};

const XSI_TYPE = "xsi:type";

function serializeFormat(element) {
  return element.xml && element.xml.serialize;
}

function serializeAsType(element) {
  return serializeFormat(element) === XSI_TYPE;
}

function serializeAsProperty(element) {
  return serializeFormat(element) === "property";
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function aliasToName(aliasNs, pkg) {
  if (!hasLowerCaseAlias(pkg)) {
    return aliasNs.name;
  }

  return aliasNs.prefix + ":" + capitalize(aliasNs.localName);
}

function prefixedToName(nameNs, pkg) {
  let name = nameNs.name,
    localName = nameNs.localName;

  let typePrefix = pkg.xml && pkg.xml.typePrefix;

  if (typePrefix && localName.indexOf(typePrefix) === 0) {
    return nameNs.prefix + ":" + localName.slice(typePrefix.length);
  } else {
    return name;
  }
}

function normalizeXsiTypeName(name, model) {
  let nameNs = parseNameNS(name);
  let pkg = model.getPackage(nameNs.prefix);

  return prefixedToName(nameNs, pkg);
}

function error(message) {
  return new Error(message);
}

/**
 * Get the moddle descriptor for a given instance or type.
 *
 * @param  {ModdleElement|Function} element
 *
 * @return {Object} the moddle descriptor
 */
function getModdleDescriptor(element) {
  return element.$descriptor;
}

function defer(fn) {
  setTimeout(fn, 0);
}

/**
 * A parse context.
 *
 * @class
 *
 * @param {Object} options
 * @param {ElementHandler} options.rootHandler the root handler for parsing a document
 * @param {boolean} [options.lax=false] whether or not to ignore invalid elements
 */
function Context(options) {
  /**
   * @property {ElementHandler} rootHandler
   */

  /**
   * @property {Boolean} lax
   */

  assign(this, options);

  this.elementsById = {};
  this.references = [];
  this.warnings = [];

  /**
   * Add an unresolved reference.
   *
   * @param {Object} reference
   */
  this.addReference = function (reference) {
    this.references.push(reference);
  };

  /**
   * Add a processed element.
   *
   * @param {ModdleElement} element
   */
  this.addElement = function (element) {
    if (!element) {
      throw error("expected element");
    }

    let elementsById = this.elementsById;

    let descriptor = getModdleDescriptor(element);

    let idProperty = descriptor.idProperty,
      id;

    if (idProperty) {
      id = element.get(idProperty.name);

      if (id) {
        // for QName validation as per http://www.w3.org/TR/REC-xml/#NT-NameChar
        if (!/^([a-z][\w-.]*:)?[a-z_][\w-.]*$/i.test(id)) {
          throw new Error("illegal ID <" + id + ">");
        }

        if (elementsById[id]) {
          throw error("duplicate ID <" + id + ">");
        }

        elementsById[id] = element;
      }
    }
  };

  /**
   * Add an import warning.
   *
   * @param {Object} warning
   * @param {String} warning.message
   * @param {Error} [warning.error]
   */
  this.addWarning = function (warning) {
    this.warnings.push(warning);
  };
}

function BaseHandler() {}

BaseHandler.prototype.handleEnd = function () {};
BaseHandler.prototype.handleText = function () {};
BaseHandler.prototype.handleNode = function () {};

/**
 * A simple pass through handler that does nothing except for
 * ignoring all input it receives.
 *
 * This is used to ignore unknown elements and
 * attributes.
 */
function NoopHandler() {}

NoopHandler.prototype = Object.create(BaseHandler.prototype);

NoopHandler.prototype.handleNode = function () {
  return this;
};

function BodyHandler() {}

BodyHandler.prototype = Object.create(BaseHandler.prototype);

BodyHandler.prototype.handleText = function (text) {
  this.body = (this.body || "") + text;
};

function ReferenceHandler(property, context) {
  this.property = property;
  this.context = context;
}

ReferenceHandler.prototype = Object.create(BodyHandler.prototype);

ReferenceHandler.prototype.handleNode = function (node) {
  if (this.element) {
    throw error("expected no sub nodes");
  } else {
    this.element = this.createReference(node);
  }

  return this;
};

ReferenceHandler.prototype.handleEnd = function () {
  this.element.id = this.body;
};

ReferenceHandler.prototype.createReference = function (node) {
  return {
    property: this.property.ns.name,
    id: "",
  };
};

function ValueHandler(propertyDesc, element) {
  this.element = element;
  this.propertyDesc = propertyDesc;
}

ValueHandler.prototype = Object.create(BodyHandler.prototype);

ValueHandler.prototype.handleEnd = function () {
  let value = this.body || "",
    element = this.element,
    propertyDesc = this.propertyDesc;

  value = coerceType(propertyDesc.type, value);

  if (propertyDesc.isMany) {
    element.get(propertyDesc.name).push(value);
  } else {
    element.set(propertyDesc.name, value);
  }
};

function BaseElementHandler() {}

BaseElementHandler.prototype = Object.create(BodyHandler.prototype);

BaseElementHandler.prototype.handleNode = function (node) {
  let parser = this,
    element = this.element;

  if (!element) {
    element = this.element = this.createElement(node);

    this.context.addElement(element);
  } else {
    parser = this.handleChild(node);
  }

  return parser;
};

/**
 * @class Reader.ElementHandler
 *
 */
function ElementHandler(model, typeName, context) {
  this.model = model;
  this.type = model.getType(typeName);
  this.context = context;
}

ElementHandler.prototype = Object.create(BaseElementHandler.prototype);

ElementHandler.prototype.addReference = function (reference) {
  this.context.addReference(reference);
};

ElementHandler.prototype.handleText = function (text) {
  let element = this.element,
    descriptor = getModdleDescriptor(element),
    bodyProperty = descriptor.bodyProperty;

  if (!bodyProperty) {
    throw error("unexpected body text <" + text + ">");
  }

  BodyHandler.prototype.handleText.call(this, text);
};

ElementHandler.prototype.handleEnd = function () {
  let value = this.body,
    element = this.element,
    descriptor = getModdleDescriptor(element),
    bodyProperty = descriptor.bodyProperty;

  if (bodyProperty && value !== undefined) {
    value = coerceType(bodyProperty.type, value);
    element.set(bodyProperty.name, value);
  }
};

/**
 * Create an instance of the model from the given node.
 *
 * @param  {Element} node the xml node
 */
ElementHandler.prototype.createElement = function (node) {
  let attributes = node.attributes,
    Type = this.type,
    descriptor = getModdleDescriptor(Type),
    context = this.context,
    instance = new Type({}),
    model = this.model,
    propNameNs;

  forEach(attributes, function (value, name) {
    let prop = descriptor.propertiesByName[name],
      values;

    if (prop && prop.isReference) {
      if (!prop.isMany) {
        context.addReference({
          element: instance,
          property: prop.ns.name,
          id: value,
        });
      } else {
        // IDREFS: parse references as whitespace-separated list
        values = value.split(" ");

        forEach(values, function (v) {
          context.addReference({
            element: instance,
            property: prop.ns.name,
            id: v,
          });
        });
      }
    } else {
      if (prop) {
        value = coerceType(prop.type, value);
      } else if (name !== "xmlns") {
        propNameNs = parseNameNS(name, descriptor.ns.prefix);

        // check whether attribute is defined in a well-known namespace
        // if that is the case we emit a warning to indicate potential misuse
        if (model.getPackage(propNameNs.prefix)) {
          context.addWarning({
            message: "unknown attribute <" + name + ">",
            element: instance,
            property: name,
            value: value,
          });
        }
      }

      instance.set(name, value);
    }
  });

  return instance;
};

ElementHandler.prototype.getPropertyForNode = function (node) {
  let name = node.name;
  let nameNs = parseNameNS(name);

  let type = this.type,
    model = this.model,
    descriptor = getModdleDescriptor(type);

  let propertyName = nameNs.name,
    property = descriptor.propertiesByName[propertyName],
    elementTypeName,
    elementType;

  // search for properties by name first

  if (property && !property.isAttr) {
    if (serializeAsType(property)) {
      elementTypeName = node.attributes[XSI_TYPE];

      // xsi type is optional, if it does not exists the
      // default type is assumed
      if (elementTypeName) {
        // take possible type prefixes from XML
        // into account, i.e.: xsi:type="t{ActualType}"
        elementTypeName = normalizeXsiTypeName(elementTypeName, model);

        elementType = model.getType(elementTypeName);

        return assign({}, property, {
          effectiveType: getModdleDescriptor(elementType).name,
        });
      }
    }

    // search for properties by name first
    return property;
  }

  let pkg = model.getPackage(nameNs.prefix);

  if (pkg) {
    elementTypeName = aliasToName(nameNs, pkg);
    elementType = model.getType(elementTypeName);

    // search for collection members later
    property = find(descriptor.properties, function (p) {
      return (
        !p.isVirtual &&
        !p.isReference &&
        !p.isAttribute &&
        elementType.hasType(p.type)
      );
    });

    if (property) {
      return assign({}, property, {
        effectiveType: getModdleDescriptor(elementType).name,
      });
    }
  } else {
    // parse unknown element (maybe extension)
    property = find(descriptor.properties, function (p) {
      return !p.isReference && !p.isAttribute && p.type === "Element";
    });

    if (property) {
      return property;
    }
  }

  throw error("unrecognized element <" + nameNs.name + ">");
};

ElementHandler.prototype.toString = function () {
  return "ElementDescriptor[" + getModdleDescriptor(this.type).name + "]";
};

ElementHandler.prototype.valueHandler = function (propertyDesc, element) {
  return new ValueHandler(propertyDesc, element);
};

ElementHandler.prototype.referenceHandler = function (propertyDesc) {
  return new ReferenceHandler(propertyDesc, this.context);
};

ElementHandler.prototype.handler = function (type) {
  if (type === "Element") {
    return new GenericElementHandler(this.model, type, this.context);
  } else {
    return new ElementHandler(this.model, type, this.context);
  }
};

/**
 * Handle the child element parsing
 *
 * @param  {Element} node the xml node
 */
ElementHandler.prototype.handleChild = function (node) {
  let propertyDesc, type, element, childHandler;

  propertyDesc = this.getPropertyForNode(node);
  element = this.element;

  type = propertyDesc.effectiveType || propertyDesc.type;

  if (isSimpleType(type)) {
    return this.valueHandler(propertyDesc, element);
  }

  if (propertyDesc.isReference) {
    childHandler = this.referenceHandler(propertyDesc).handleNode(node);
  } else {
    childHandler = this.handler(type).handleNode(node);
  }

  let newElement = childHandler.element;

  // child handles may decide to skip elements
  // by not returning anything
  if (newElement !== undefined) {
    if (propertyDesc.isMany) {
      element.get(propertyDesc.name).push(newElement);
    } else {
      element.set(propertyDesc.name, newElement);
    }

    if (propertyDesc.isReference) {
      assign(newElement, {
        element: element,
      });

      this.context.addReference(newElement);
    } else {
      // establish child -> parent relationship
      newElement.$parent = element;
    }
  }

  return childHandler;
};

/**
 * An element handler that performs special validation
 * to ensure the node it gets initialized with matches
 * the handlers type (namespace wise).
 *
 * @param {Moddle} model
 * @param {String} typeName
 * @param {Context} context
 */
function RootElementHandler(model, typeName, context) {
  ElementHandler.call(this, model, typeName, context);
}

RootElementHandler.prototype = Object.create(ElementHandler.prototype);

RootElementHandler.prototype.createElement = function (node) {
  let name = node.name,
    nameNs = parseNameNS(name),
    model = this.model,
    type = this.type,
    pkg = model.getPackage(nameNs.prefix),
    typeName = (pkg && aliasToName(nameNs, pkg)) || name;

  // verify the correct namespace if we parse
  // the first element in the handler tree
  //
  // this ensures we don't mistakenly import wrong namespace elements
  if (!type.hasType(typeName)) {
    throw error("unexpected element <" + node.originalName + ">");
  }

  return ElementHandler.prototype.createElement.call(this, node);
};

function GenericElementHandler(model, typeName, context) {
  this.model = model;
  this.context = context;
}

GenericElementHandler.prototype = Object.create(BaseElementHandler.prototype);

GenericElementHandler.prototype.createElement = function (node) {
  let name = node.name,
    ns = parseNameNS(name),
    prefix = ns.prefix,
    uri = node.ns[prefix + "$uri"],
    attributes = node.attributes;

  return this.model.createAny(name, uri, attributes);
};

GenericElementHandler.prototype.handleChild = function (node) {
  let handler = new GenericElementHandler(
      this.model,
      "Element",
      this.context
    ).handleNode(node),
    element = this.element;

  let newElement = handler.element,
    children;

  if (newElement !== undefined) {
    children = element.$children = element.$children || [];
    children.push(newElement);

    // establish child -> parent relationship
    newElement.$parent = element;
  }

  return handler;
};

GenericElementHandler.prototype.handleEnd = function () {
  if (this.body) {
    this.element.$body = this.body;
  }
};

/**
 * A reader for a meta-model
 *
 * @param {Object} options
 * @param {Model} options.model used to read xml files
 * @param {Boolean} options.lax whether to make parse errors warnings
 */
function Reader(options) {
  if (options instanceof Moddle) {
    options = {
      model: options,
    };
  }

  assign(this, { lax: false }, options);
}

/**
 * Parse the given XML into a moddle document tree.
 *
 * @param {String} xml
 * @param {ElementHandler|Object} options or rootHandler
 * @param  {Function} done
 */
Reader.prototype.fromXML = function (xml, options, done) {
  let rootHandler = options.rootHandler;

  if (options instanceof ElementHandler) {
    // root handler passed via (xml, { rootHandler: ElementHandler }, ...)
    rootHandler = options;
    options = {};
  } else {
    if (typeof options === "string") {
      // rootHandler passed via (xml, 'someString', ...)
      rootHandler = this.handler(options);
      options = {};
    } else if (typeof rootHandler === "string") {
      // rootHandler passed via (xml, { rootHandler: 'someString' }, ...)
      rootHandler = this.handler(rootHandler);
    }
  }

  let model = this.model,
    lax = this.lax;

  let context = new Context(assign({}, options, { rootHandler: rootHandler })),
    parser = new Parser({ proxy: true }),
    stack = createStack();

  rootHandler.context = context;

  // push root handler
  stack.push(rootHandler);

  /**
   * Handle error.
   *
   * @param  {Error} err
   * @param  {Function} getContext
   * @param  {boolean} lax
   *
   * @return {boolean} true if handled
   */
  function handleError(err, getContext, lax) {
    let ctx = getContext();

    let line = ctx.line,
      column = ctx.column,
      data = ctx.data;

    // we receive the full context data here,
    // for elements trim down the information
    // to the tag name, only
    if (data.charAt(0) === "<" && data.indexOf(" ") !== -1) {
      data = data.slice(0, data.indexOf(" ")) + ">";
    }

    let message =
      "unparsable content " +
      (data ? data + " " : "") +
      "detected\n\t" +
      "line: " +
      line +
      "\n\t" +
      "column: " +
      column +
      "\n\t" +
      "nested error: " +
      err.message;

    if (lax) {
      context.addWarning({
        message: message,
        error: err,
      });

      return true;
    } else {
      throw error(message);
    }
  }

  function handleWarning(err, getContext) {
    // just like handling errors in <lax=true> mode
    return handleError(err, getContext, true);
  }

  /**
   * Resolve collected references on parse end.
   */
  function resolveReferences() {
    let elementsById = context.elementsById;
    let references = context.references;

    let i, r;

    for (i = 0; (r = references[i]); i++) {
      let element = r.element;
      let reference = elementsById[r.id];
      let property = getModdleDescriptor(element).propertiesByName[r.property];

      if (!reference) {
        context.addWarning({
          message: "unresolved reference <" + r.id + ">",
          element: r.element,
          property: r.property,
          value: r.id,
        });
      }

      if (property.isMany) {
        let collection = element.get(property.name),
          idx = collection.indexOf(r);

        // we replace an existing place holder (idx != -1) or
        // append to the collection instead
        if (idx === -1) {
          idx = collection.length;
        }

        if (!reference) {
          // remove unresolvable reference
          collection.splice(idx, 1);
        } else {
          // add or update reference in collection
          collection[idx] = reference;
        }
      } else {
        element.set(property.name, reference);
      }
    }
  }

  function handleClose() {
    stack.pop().handleEnd();
  }

  let PREAMBLE_START_PATTERN = /^<\?xml /i;

  let ENCODING_PATTERN = / encoding="([^"]+)"/i;

  let UTF_8_PATTERN = /^utf-8$/i;

  function handleQuestion(question) {
    if (!PREAMBLE_START_PATTERN.test(question)) {
      return;
    }

    let match = ENCODING_PATTERN.exec(question);
    let encoding = match && match[1];

    if (!encoding || UTF_8_PATTERN.test(encoding)) {
      return;
    }

    context.addWarning({
      message:
        "unsupported document encoding <" +
        encoding +
        ">, " +
        "falling back to UTF-8",
    });
  }

  function handleOpen(node, getContext) {
    let handler = stack.peek();

    try {
      stack.push(handler.handleNode(node));
    } catch (err) {
      if (handleError(err, getContext, lax)) {
        stack.push(new NoopHandler());
      }
    }
  }

  function handleCData(text, getContext) {
    try {
      stack.peek().handleText(text);
    } catch (err) {
      handleWarning(err, getContext);
    }
  }

  function handleText(text, getContext) {
    // strip whitespace only nodes, i.e. before
    // <!CDATA[ ... ]> sections and in between tags
    text = text.trim();

    if (!text) {
      return;
    }

    handleCData(text, getContext);
  }

  let uriMap = model.getPackages().reduce(function (uriMap, p) {
    uriMap[p.uri] = p.prefix;

    return uriMap;
  }, {});

  parser
    .ns(uriMap)
    .on("openTag", function (obj, decodeStr, selfClosing, getContext) {
      // gracefully handle unparsable attributes (attrs=false)
      let attrs = obj.attrs || {};

      let decodedAttrs = Object.keys(attrs).reduce(function (d, key) {
        let value = decodeStr(attrs[key]);

        d[key] = value;

        return d;
      }, {});

      let node = {
        name: obj.name,
        originalName: obj.originalName,
        attributes: decodedAttrs,
        ns: obj.ns,
      };

      handleOpen(node, getContext);
    })
    .on("question", handleQuestion)
    .on("closeTag", handleClose)
    .on("cdata", handleCData)
    .on("text", function (text, decodeEntities, getContext) {
      handleText(decodeEntities(text), getContext);
    })
    .on("error", handleError)
    .on("warn", handleWarning);

  // deferred parse XML to make loading really ascnchronous
  // this ensures the execution environment (node or browser)
  // is kept responsive and that certain optimization strategies
  // can kick in
  defer(function () {
    let err;

    try {
      parser.parse(xml);

      resolveReferences();
    } catch (e) {
      err = e;
    }

    let element = rootHandler.element;

    // handle the situation that we could not extract
    // the desired root element from the document
    if (!err && !element) {
      err = error(
        "failed to parse document as <" +
          rootHandler.type.$descriptor.name +
          ">"
      );
    }

    done(err, err ? undefined : element, context);
  });
};

Reader.prototype.handler = function (name) {
  return new RootElementHandler(this.model, name);
};

// helpers //////////////////////////

function createStack() {
  let stack = [];

  Object.defineProperty(stack, "peek", {
    value: function () {
      return this[this.length - 1];
    },
  });

  return stack;
}

let XML_PREAMBLE = '<?xml version="1.0" encoding="UTF-8"?>\n';

let ESCAPE_ATTR_CHARS = /<|>|'|"|&|\n\r|\n/g;
let ESCAPE_CHARS = /<|>|&/g;

function Namespaces(parent) {
  let prefixMap = {};
  let uriMap = {};
  let used = {};

  let wellknown = [];
  let custom = [];

  // API

  this.byUri = function (uri) {
    return uriMap[uri] || (parent && parent.byUri(uri));
  };

  this.add = function (ns, isWellknown) {
    uriMap[ns.uri] = ns;

    if (isWellknown) {
      wellknown.push(ns);
    } else {
      custom.push(ns);
    }

    this.mapPrefix(ns.prefix, ns.uri);
  };

  this.uriByPrefix = function (prefix) {
    return prefixMap[prefix || "xmlns"];
  };

  this.mapPrefix = function (prefix, uri) {
    prefixMap[prefix || "xmlns"] = uri;
  };

  this.logUsed = function (ns) {
    let uri = ns.uri;

    used[uri] = this.byUri(uri);
  };

  this.getUsed = function (ns) {
    function isUsed(ns) {
      return used[ns.uri];
    }

    let allNs = [].concat(wellknown, custom);

    return allNs.filter(isUsed);
  };
}

function lower(string) {
  return string.charAt(0).toLowerCase() + string.slice(1);
}

function nameToAlias(name, pkg) {
  if (hasLowerCaseAlias(pkg)) {
    return lower(name);
  } else {
    return name;
  }
}

function inherits(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true,
    },
  });
}

function nsName(ns) {
  if (isString(ns)) {
    return ns;
  } else {
    // return ns.localName
    return (ns.prefix ? ns.prefix + ":" : "") + ns.localName;
  }
}

function getNsAttrs(namespaces) {
  return map(namespaces.getUsed(), function (ns) {
    let name = "xmlns" + (ns.prefix ? ":" + ns.prefix : "");
    return { name: name, value: ns.uri };
  });
}

function getElementNs(ns, descriptor) {
  if (descriptor.isGeneric) {
    return assign({ localName: descriptor.ns.localName }, ns);
  } else {
    return assign(
      { localName: nameToAlias(descriptor.ns.localName, descriptor.$pkg) },
      ns
    );
  }
}

function getPropertyNs(ns, descriptor) {
  return assign({ localName: descriptor.ns.localName }, ns);
}

function getSerializableProperties(element) {
  let descriptor = element.$descriptor;

  return filter(descriptor.properties, function (p) {
    let name = p.name;

    if (p.isVirtual) {
      return false;
    }

    // do not serialize defaults
    if (!element.hasOwnProperty(name)) {
      return false;
    }

    let value = element[name];

    // do not serialize default equals
    if (value === p.default) {
      return false;
    }

    // do not serialize null properties
    if (value === null) {
      return false;
    }

    return p.isMany ? value.length : true;
  });
}

let ESCAPE_ATTR_MAP = {
  "\n": "#10",
  "\n\r": "#10",
  '"': "#34",
  "'": "#39",
  "<": "#60",
  ">": "#62",
  "&": "#38",
};

let ESCAPE_MAP = {
  "<": "lt",
  ">": "gt",
  "&": "amp",
};

function escape(str, charPattern, replaceMap) {
  // ensure we are handling strings here
  str = isString(str) ? str : "" + str;

  return str.replace(charPattern, function (s) {
    return "&" + replaceMap[s] + ";";
  });
}

/**
 * Escape a string attribute to not contain any bad values (line breaks, '"', ...)
 *
 * @param {String} str the string to escape
 * @return {String} the escaped string
 */
function escapeAttr(str) {
  return escape(str, ESCAPE_ATTR_CHARS, ESCAPE_ATTR_MAP);
}

function escapeBody(str) {
  return escape(str, ESCAPE_CHARS, ESCAPE_MAP);
}

function filterAttributes(props) {
  return filter(props, function (p) {
    return p.isAttr;
  });
}

function filterContained(props) {
  return filter(props, function (p) {
    return !p.isAttr;
  });
}

function ReferenceSerializer(tagName) {
  this.tagName = tagName;
}

ReferenceSerializer.prototype.build = function (element) {
  this.element = element;
  return this;
};

ReferenceSerializer.prototype.serializeTo = function (writer) {
  writer
    .appendIndent()
    .append(
      "<" + this.tagName + ">" + this.element.id + "</" + this.tagName + ">"
    )
    .appendNewLine();
};

function BodySerializer() {}

BodySerializer.prototype.serializeValue = BodySerializer.prototype.serializeTo =
  function (writer) {
    writer.append(this.escape ? escapeBody(this.value) : this.value);
  };

BodySerializer.prototype.build = function (prop, value) {
  this.value = value;

  if (prop.type === "String" && value.search(ESCAPE_CHARS) !== -1) {
    this.escape = true;
  }

  return this;
};

function ValueSerializer(tagName) {
  this.tagName = tagName;
}

inherits(ValueSerializer, BodySerializer);

ValueSerializer.prototype.serializeTo = function (writer) {
  writer.appendIndent().append("<" + this.tagName + ">");

  this.serializeValue(writer);

  writer.append("</" + this.tagName + ">").appendNewLine();
};

function ElementSerializer(parent, propertyDescriptor) {
  this.body = [];
  this.attrs = [];

  this.parent = parent;
  this.propertyDescriptor = propertyDescriptor;
}

ElementSerializer.prototype.build = function (element) {
  this.element = element;

  let elementDescriptor = element.$descriptor,
    propertyDescriptor = this.propertyDescriptor;

  let otherAttrs, properties;

  let isGeneric = elementDescriptor.isGeneric;

  if (isGeneric) {
    otherAttrs = this.parseGeneric(element);
  } else {
    otherAttrs = this.parseNsAttributes(element);
  }

  if (propertyDescriptor) {
    this.ns = this.nsPropertyTagName(propertyDescriptor);
  } else {
    this.ns = this.nsTagName(elementDescriptor);
  }

  // compute tag name
  this.tagName = this.addTagName(this.ns);

  if (!isGeneric) {
    properties = getSerializableProperties(element);

    this.parseAttributes(filterAttributes(properties));
    this.parseContainments(filterContained(properties));
  }

  this.parseGenericAttributes(element, otherAttrs);

  return this;
};

ElementSerializer.prototype.nsTagName = function (descriptor) {
  let effectiveNs = this.logNamespaceUsed(descriptor.ns);
  return getElementNs(effectiveNs, descriptor);
};

ElementSerializer.prototype.nsPropertyTagName = function (descriptor) {
  let effectiveNs = this.logNamespaceUsed(descriptor.ns);
  return getPropertyNs(effectiveNs, descriptor);
};

ElementSerializer.prototype.isLocalNs = function (ns) {
  return ns.uri === this.ns.uri;
};

/**
 * Get the actual ns attribute name for the given element.
 *
 * @param {Object} element
 * @param {Boolean} [element.inherited=false]
 *
 * @return {Object} nsName
 */
ElementSerializer.prototype.nsAttributeName = function (element) {
  let ns;

  if (isString(element)) {
    ns = parseNameNS(element);
  } else {
    ns = element.ns;
  }

  // return just local name for inherited attributes
  if (element.inherited) {
    return { localName: ns.localName };
  }

  // parse + log effective ns
  let effectiveNs = this.logNamespaceUsed(ns);

  // LOG ACTUAL namespace use
  this.getNamespaces().logUsed(effectiveNs);

  // strip prefix if same namespace like parent
  if (this.isLocalNs(effectiveNs)) {
    return { localName: ns.localName };
  } else {
    return assign({ localName: ns.localName }, effectiveNs);
  }
};

ElementSerializer.prototype.parseGeneric = function (element) {
  let self = this,
    body = this.body;

  let attributes = [];

  forEach(element, function (val, key) {
    let nonNsAttr;

    if (key === "$body") {
      body.push(new BodySerializer().build({ type: "String" }, val));
    } else if (key === "$children") {
      forEach(val, function (child) {
        body.push(new ElementSerializer(self).build(child));
      });
    } else if (key.indexOf("$") !== 0) {
      nonNsAttr = self.parseNsAttribute(element, key, val);

      if (nonNsAttr) {
        attributes.push({ name: key, value: val });
      }
    }
  });

  return attributes;
};

ElementSerializer.prototype.parseNsAttribute = function (element, name, value) {
  let model = element.$model;

  let nameNs = parseNameNS(name);

  let ns;

  // parse xmlns:foo="http://foo.bar"
  if (nameNs.prefix === "xmlns") {
    ns = { prefix: nameNs.localName, uri: value };
  }

  // parse xmlns="http://foo.bar"
  if (!nameNs.prefix && nameNs.localName === "xmlns") {
    ns = { uri: value };
  }

  if (!ns) {
    return {
      name: name,
      value: value,
    };
  }

  if (model && model.getPackage(value)) {
    // register well known namespace
    this.logNamespace(ns, true, true);
  } else {
    // log custom namespace directly as used
    let actualNs = this.logNamespaceUsed(ns, true);

    this.getNamespaces().logUsed(actualNs);
  }
};

/**
 * Parse namespaces and return a list of left over generic attributes
 *
 * @param  {Object} element
 * @return {Array<Object>}
 */
ElementSerializer.prototype.parseNsAttributes = function (element, attrs) {
  let self = this;

  let genericAttrs = element.$attrs;

  let attributes = [];

  // parse namespace attributes first
  // and log them. push non namespace attributes to a list
  // and process them later
  forEach(genericAttrs, function (value, name) {
    let nonNsAttr = self.parseNsAttribute(element, name, value);

    if (nonNsAttr) {
      attributes.push(nonNsAttr);
    }
  });

  return attributes;
};

ElementSerializer.prototype.parseGenericAttributes = function (
  element,
  attributes
) {
  let self = this;

  forEach(attributes, function (attr) {
    // do not serialize xsi:type attribute
    // it is set manually based on the actual implementation type
    if (attr.name === XSI_TYPE) {
      return;
    }

    try {
      self.addAttribute(self.nsAttributeName(attr.name), attr.value);
    } catch (e) {
      console.warn(
        "missing namespace information for ",
        attr.name,
        "=",
        attr.value,
        "on",
        element,
        e
      );
    }
  });
};

ElementSerializer.prototype.parseContainments = function (properties) {
  let self = this,
    body = this.body,
    element = this.element;

  forEach(properties, function (p) {
    let value = element.get(p.name),
      isReference = p.isReference,
      isMany = p.isMany;

    if (!isMany) {
      value = [value];
    }

    if (p.isBody) {
      body.push(new BodySerializer().build(p, value[0]));
    } else if (isSimpleType(p.type)) {
      forEach(value, function (v) {
        body.push(
          new ValueSerializer(self.addTagName(self.nsPropertyTagName(p))).build(
            p,
            v
          )
        );
      });
    } else if (isReference) {
      forEach(value, function (v) {
        body.push(
          new ReferenceSerializer(
            self.addTagName(self.nsPropertyTagName(p))
          ).build(v)
        );
      });
    } else {
      // allow serialization via type
      // rather than element name
      let asType = serializeAsType(p),
        asProperty = serializeAsProperty(p);

      forEach(value, function (v) {
        let serializer;

        if (asType) {
          serializer = new TypeSerializer(self, p);
        } else if (asProperty) {
          serializer = new ElementSerializer(self, p);
        } else {
          serializer = new ElementSerializer(self);
        }

        body.push(serializer.build(v));
      });
    }
  });
};

ElementSerializer.prototype.getNamespaces = function (local) {
  let namespaces = this.namespaces,
    parent = this.parent,
    parentNamespaces;

  if (!namespaces) {
    parentNamespaces = parent && parent.getNamespaces();

    if (local || !parentNamespaces) {
      this.namespaces = namespaces = new Namespaces(parentNamespaces);
    } else {
      namespaces = parentNamespaces;
    }
  }

  return namespaces;
};

ElementSerializer.prototype.logNamespace = function (ns, wellknown, local) {
  let namespaces = this.getNamespaces(local);

  let nsUri = ns.uri,
    nsPrefix = ns.prefix;

  let existing = namespaces.byUri(nsUri);

  if (!existing) {
    namespaces.add(ns, wellknown);
  }

  namespaces.mapPrefix(nsPrefix, nsUri);

  return ns;
};

ElementSerializer.prototype.logNamespaceUsed = function (ns, local) {
  let element = this.element,
    model = element.$model,
    namespaces = this.getNamespaces(local);

  // ns may be
  //
  //   * prefix only
  //   * prefix:uri
  //   * localName only

  let prefix = ns.prefix,
    uri = ns.uri,
    newPrefix,
    idx,
    wellknownUri;

  // handle anonymous namespaces (elementForm=unqualified), cf. #23
  if (!prefix && !uri) {
    return { localName: ns.localName };
  }

  wellknownUri =
    DEFAULT_NS_MAP[prefix] || (model && (model.getPackage(prefix) || {}).uri);

  uri = uri || wellknownUri || namespaces.uriByPrefix(prefix);

  if (!uri) {
    throw new Error("no namespace uri given for prefix <" + prefix + ">");
  }

  ns = namespaces.byUri(uri);

  if (!ns) {
    newPrefix = prefix;
    idx = 1;

    // find a prefix that is not mapped yet
    while (namespaces.uriByPrefix(newPrefix)) {
      newPrefix = prefix + "_" + idx++;
    }

    ns = this.logNamespace(
      { prefix: newPrefix, uri: uri },
      wellknownUri === uri
    );
  }

  if (prefix) {
    namespaces.mapPrefix(prefix, uri);
  }

  return ns;
};

ElementSerializer.prototype.parseAttributes = function (properties) {
  let self = this,
    element = this.element;

  forEach(properties, function (p) {
    let value = element.get(p.name);

    if (p.isReference) {
      if (!p.isMany) {
        value = value.id;
      } else {
        let values = [];
        forEach(value, function (v) {
          values.push(v.id);
        });
        // IDREFS is a whitespace-separated list of references.
        value = values.join(" ");
      }
    }

    self.addAttribute(self.nsAttributeName(p), value);
  });
};

ElementSerializer.prototype.addTagName = function (nsTagName) {
  let actualNs = this.logNamespaceUsed(nsTagName);

  this.getNamespaces().logUsed(actualNs);

  return nsName(nsTagName);
};

ElementSerializer.prototype.addAttribute = function (name, value) {
  let attrs = this.attrs;

  if (isString(value)) {
    value = escapeAttr(value);
  }

  attrs.push({ name: name, value: value });
};

ElementSerializer.prototype.serializeAttributes = function (writer) {
  let attrs = this.attrs,
    namespaces = this.namespaces;

  if (namespaces) {
    attrs = getNsAttrs(namespaces).concat(attrs);
  }

  forEach(attrs, function (a) {
    writer
      .append(" ")
      .append(nsName(a.name))
      .append('="')
      .append(a.value)
      .append('"');
  });
};

ElementSerializer.prototype.serializeTo = function (writer) {
  let firstBody = this.body[0],
    indent = firstBody && firstBody.constructor !== BodySerializer;

  writer.appendIndent().append("<" + this.tagName);

  this.serializeAttributes(writer);

  writer.append(firstBody ? ">" : " />");

  if (firstBody) {
    if (indent) {
      writer.appendNewLine().indent();
    }

    forEach(this.body, function (b) {
      b.serializeTo(writer);
    });

    if (indent) {
      writer.unindent().appendIndent();
    }

    writer.append("</" + this.tagName + ">");
  }

  writer.appendNewLine();
};

/**
 * A serializer for types that handles serialization of data types
 */
function TypeSerializer(parent, propertyDescriptor) {
  ElementSerializer.call(this, parent, propertyDescriptor);
}

inherits(TypeSerializer, ElementSerializer);

TypeSerializer.prototype.parseNsAttributes = function (element) {
  // extracted attributes
  let attributes = ElementSerializer.prototype.parseNsAttributes.call(
    this,
    element
  );

  let descriptor = element.$descriptor;

  // only serialize xsi:type if necessary
  if (descriptor.name === this.propertyDescriptor.type) {
    return attributes;
  }

  let typeNs = (this.typeNs = this.nsTagName(descriptor));
  this.getNamespaces().logUsed(this.typeNs);

  // add xsi:type attribute to represent the elements
  // actual type

  let pkg = element.$model.getPackage(typeNs.uri),
    typePrefix = (pkg.xml && pkg.xml.typePrefix) || "";

  this.addAttribute(
    this.nsAttributeName(XSI_TYPE),
    (typeNs.prefix ? typeNs.prefix + ":" : "") +
      typePrefix +
      descriptor.ns.localName
  );

  return attributes;
};

TypeSerializer.prototype.isLocalNs = function (ns) {
  return ns.uri === (this.typeNs || this.ns).uri;
};

function SavingWriter() {
  this.value = "";

  this.write = function (str) {
    this.value += str;
  };
}

function FormatingWriter(out, format) {
  let indent = [""];

  this.append = function (str) {
    out.write(str);

    return this;
  };

  this.appendNewLine = function () {
    if (format) {
      out.write("\n");
    }

    return this;
  };

  this.appendIndent = function () {
    if (format) {
      out.write(indent.join("  "));
    }

    return this;
  };

  this.indent = function () {
    indent.push("");
    return this;
  };

  this.unindent = function () {
    indent.pop();
    return this;
  };
}

/**
 * A writer for meta-model backed document trees
 *
 * @param {Object} options output options to pass into the writer
 */
function Writer(options) {
  options = assign({ format: false, preamble: true }, options || {});

  function toXML(tree, writer) {
    let internalWriter = writer || new SavingWriter();
    let formatingWriter = new FormatingWriter(internalWriter, options.format);

    if (options.preamble) {
      formatingWriter.append(XML_PREAMBLE);
    }

    new ElementSerializer().build(tree).serializeTo(formatingWriter);

    if (!writer) {
      return internalWriter.value;
    }
  }

  return {
    toXML: toXML,
  };
}

export { Reader, Writer };
