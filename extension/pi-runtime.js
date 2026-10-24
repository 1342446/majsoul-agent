var MJPiRuntime = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // scripts/pi-runtime-entry.mjs
  var pi_runtime_entry_exports = {};
  __export(pi_runtime_entry_exports, {
    run: () => run,
    version: () => version
  });

  // node_modules/@earendil-works/pi-ai/dist/utils/text.js
  function contentText(content, separator = "\n") {
    if (typeof content === "string")
      return content;
    return content.filter((block) => block.type === "text").map((block) => block.text).join(separator);
  }
  function getSystemMessageText(message) {
    const parts = [contentText(message.content)];
    for (const text of Object.values(message.sections ?? {})) {
      if (text !== null)
        parts.push(text);
    }
    return parts.filter((part) => part.length > 0).join("\n\n");
  }

  // node_modules/@earendil-works/pi-ai/dist/utils/transcript.js
  function createInitialSystemMessage(systemPrompt, tools) {
    const hasSystemPrompt = systemPrompt !== void 0 && systemPrompt.length > 0;
    const hasTools = tools !== void 0 && tools.length > 0;
    if (!hasSystemPrompt && !hasTools)
      return void 0;
    return {
      role: "system",
      content: systemPrompt ?? "",
      ...hasTools ? { toolsAdded: tools } : {},
      timestamp: 0
    };
  }
  function normalizeContext(context) {
    const initialMessage = createInitialSystemMessage(context.systemPrompt, context.tools);
    const messages = initialMessage ? [initialMessage, ...context.messages] : context.messages;
    return { messages };
  }
  function isSystemMessage(message) {
    return message.role === "system";
  }
  function getCurrentTools(messages) {
    const tools = /* @__PURE__ */ new Map();
    for (const message of messages) {
      if (!isSystemMessage(message))
        continue;
      for (const tool of message.toolsRemoved ?? [])
        tools.delete(tool.name);
      for (const tool of message.toolsAdded ?? [])
        tools.set(tool.name, tool);
    }
    return [...tools.values()];
  }
  function getCurrentSystemMessage(messages) {
    const content = [];
    const sections = /* @__PURE__ */ new Map();
    let timestamp;
    for (const message of messages) {
      if (!isSystemMessage(message))
        continue;
      timestamp ??= message.timestamp;
      const text = contentText(message.content);
      if (text.length > 0)
        content.push(text);
      for (const [name, value] of Object.entries(message.sections ?? {})) {
        if (value === null)
          sections.delete(name);
        else
          sections.set(name, value);
      }
    }
    const tools = getCurrentTools(messages);
    if (timestamp === void 0 && tools.length === 0)
      return void 0;
    return {
      role: "system",
      content: content.join("\n\n"),
      ...sections.size > 0 ? { sections: Object.fromEntries(sections) } : {},
      ...tools.length > 0 ? { toolsAdded: tools } : {},
      timestamp: timestamp ?? 0
    };
  }
  function getCurrentSystemPrompt(messages) {
    const message = getCurrentSystemMessage(messages);
    return message ? getSystemMessageText(message) : "";
  }
  function toToolDeclaration(tool) {
    return {
      name: tool.name,
      description: tool.description,
      parameters: JSON.parse(JSON.stringify(tool.parameters)),
      ...tool.constrainedSampling === void 0 ? {} : { constrainedSampling: tool.constrainedSampling }
    };
  }
  function declarationsEqual(left, right) {
    return JSON.stringify(toToolDeclaration(left)) === JSON.stringify(toToolDeclaration(right));
  }
  function getToolStateChanges(previous, current) {
    const previousTools = new Map(previous.map((tool) => [tool.name, tool]));
    const currentTools = new Map(current.map((tool) => [tool.name, tool]));
    return {
      toolsAdded: current.filter((tool) => {
        const previousTool = previousTools.get(tool.name);
        return previousTool === void 0 || !declarationsEqual(previousTool, tool);
      }).map(toToolDeclaration),
      toolsRemoved: previous.filter((tool) => {
        const currentTool = currentTools.get(tool.name);
        return currentTool === void 0 || !declarationsEqual(tool, currentTool);
      }).map((tool) => ({ name: tool.name }))
    };
  }

  // node_modules/@earendil-works/pi-ai/dist/utils/identity.js
  var PI_ATTRIBUTION = { name: "pi", url: "https://pi.dev", categories: ["cli-agent"] };
  function mergeClientIdentity(...sources) {
    let merged;
    for (const source of sources) {
      if (!source)
        continue;
      merged = { ...merged };
      if (source.userAgent !== void 0)
        merged.userAgent = source.userAgent;
      if (source.attribution !== void 0)
        merged.attribution = source.attribution;
      if (source.version !== void 0)
        merged.version = source.version;
    }
    return merged;
  }

  // node_modules/typebox/build/system/arguments/arguments.mjs
  var arguments_exports = {};
  __export(arguments_exports, {
    Match: () => Match
  });
  function Match(args, match) {
    return match[args.length]?.(...args) ?? (() => {
      throw Error("Invalid Arguments");
    })();
  }

  // node_modules/typebox/build/system/settings/settings.mjs
  var settings_exports = {};
  __export(settings_exports, {
    Get: () => Get,
    Reset: () => Reset,
    Set: () => Set2
  });

  // node_modules/typebox/build/guard/guard.mjs
  var guard_exports = {};
  __export(guard_exports, {
    Counted: () => Counted,
    Entries: () => Entries,
    EntriesRegExp: () => EntriesRegExp,
    Every: () => Every,
    EveryAll: () => EveryAll,
    GraphemeCount: () => GraphemeCount2,
    HasPropertyKey: () => HasPropertyKey,
    IsArray: () => IsArray,
    IsBigInt: () => IsBigInt,
    IsBoolean: () => IsBoolean,
    IsClassInstance: () => IsClassInstance,
    IsConstructor: () => IsConstructor,
    IsDeepEqual: () => IsDeepEqual,
    IsEqual: () => IsEqual,
    IsFunction: () => IsFunction,
    IsGreaterEqualThan: () => IsGreaterEqualThan,
    IsGreaterThan: () => IsGreaterThan,
    IsInteger: () => IsInteger,
    IsLessEqualThan: () => IsLessEqualThan,
    IsLessThan: () => IsLessThan,
    IsMaxLength: () => IsMaxLength2,
    IsMinLength: () => IsMinLength2,
    IsMultipleOf: () => IsMultipleOf,
    IsNull: () => IsNull,
    IsNumber: () => IsNumber,
    IsObject: () => IsObject,
    IsObjectNotArray: () => IsObjectNotArray,
    IsString: () => IsString,
    IsSymbol: () => IsSymbol,
    IsUndefined: () => IsUndefined,
    IsUnsafePropertyKey: () => IsUnsafePropertyKey,
    IsValueLike: () => IsValueLike,
    Keys: () => Keys,
    ShiftLeft: () => ShiftLeft,
    Some: () => Some,
    SomeAll: () => SomeAll,
    Symbols: () => Symbols,
    Values: () => Values
  });

  // node_modules/typebox/build/guard/string.mjs
  function IsBetween(value, min, max) {
    return value >= min && value <= max;
  }
  function IsZeroWidthJoiner(value) {
    return value === 8205;
  }
  function IsHighSurrogate(value) {
    return IsBetween(value, 55296, 56319);
  }
  function IsRegionalIndicator(value) {
    return IsBetween(value, 127462, 127487);
  }
  function IsVariationSelector(value) {
    return IsBetween(value, 65024, 65039);
  }
  function IsCombiningMark(value) {
    return IsBetween(value, 768, 879) || IsBetween(value, 6832, 6911) || IsBetween(value, 7616, 7679) || IsBetween(value, 65056, 65071);
  }
  function CodePointLength(value) {
    return value > 65535 ? 2 : 1;
  }
  function ConsumeModifiers(value, index) {
    while (index < value.length) {
      const point = value.codePointAt(index);
      if (IsCombiningMark(point) || IsVariationSelector(point)) {
        index += CodePointLength(point);
      } else {
        break;
      }
    }
    return index;
  }
  function NextGraphemeClusterIndex(value, clusterStart) {
    const startCP = value.codePointAt(clusterStart);
    let clusterEnd = clusterStart + CodePointLength(startCP);
    clusterEnd = ConsumeModifiers(value, clusterEnd);
    while (clusterEnd < value.length - 1 && IsZeroWidthJoiner(value.codePointAt(clusterEnd))) {
      const nextCP = value.codePointAt(clusterEnd + 1);
      clusterEnd += 1 + CodePointLength(nextCP);
      clusterEnd = ConsumeModifiers(value, clusterEnd);
    }
    if (IsRegionalIndicator(startCP) && clusterEnd < value.length && IsRegionalIndicator(value.codePointAt(clusterEnd))) {
      clusterEnd += CodePointLength(value.codePointAt(clusterEnd));
    }
    return clusterEnd;
  }
  function IsGraphemeCodePoint(value) {
    return value >= 768 && // above special range
    (IsHighSurrogate(value) || IsCombiningMark(value) || IsVariationSelector(value) || IsZeroWidthJoiner(value));
  }
  function GraphemeCount(value) {
    let count = 0;
    let index = 0;
    while (index < value.length) {
      index = NextGraphemeClusterIndex(value, index);
      count++;
    }
    return count;
  }
  function IsMinLengthSegmented(value, minLength) {
    let count = 0;
    let index = 0;
    while (index < value.length) {
      index = NextGraphemeClusterIndex(value, index);
      if (++count >= minLength)
        return true;
    }
    return false;
  }
  function IsMaxLengthSegmented(value, maxLength) {
    let count = 0;
    let index = 0;
    while (index < value.length) {
      index = NextGraphemeClusterIndex(value, index);
      if (++count > maxLength)
        return false;
    }
    return true;
  }
  function IsMinLength(value, minLength) {
    if (minLength === 0)
      return true;
    if (value.length < minLength)
      return false;
    let index = 0;
    while (true) {
      if (IsGraphemeCodePoint(value.charCodeAt(index))) {
        return IsMinLengthSegmented(value, minLength);
      }
      if (++index >= minLength)
        return true;
    }
  }
  function IsMaxLength(value, maxLength) {
    if (value.length <= maxLength)
      return true;
    let index = 0;
    while (true) {
      if (IsGraphemeCodePoint(value.charCodeAt(index))) {
        return IsMaxLengthSegmented(value, maxLength);
      }
      if (++index > maxLength)
        return false;
    }
  }

  // node_modules/typebox/build/guard/guard.mjs
  function IsArray(value) {
    return Array.isArray(value);
  }
  function IsBigInt(value) {
    return IsEqual(typeof value, "bigint");
  }
  function IsBoolean(value) {
    return IsEqual(typeof value, "boolean");
  }
  function IsConstructor(value) {
    if (IsUndefined(value) || !IsFunction(value))
      return false;
    const result = Function.prototype.toString.call(value);
    if (/^class\s/.test(result))
      return true;
    if (/\[native code\]/.test(result))
      return true;
    return false;
  }
  function IsFunction(value) {
    return IsEqual(typeof value, "function");
  }
  function IsInteger(value) {
    return Number.isInteger(value);
  }
  function IsNull(value) {
    return IsEqual(value, null);
  }
  function IsNumber(value) {
    return Number.isFinite(value);
  }
  function IsObjectNotArray(value) {
    return IsObject(value) && !IsArray(value);
  }
  function IsObject(value) {
    return IsEqual(typeof value, "object") && !IsNull(value);
  }
  function IsString(value) {
    return IsEqual(typeof value, "string");
  }
  function IsSymbol(value) {
    return IsEqual(typeof value, "symbol");
  }
  function IsUndefined(value) {
    return IsEqual(value, void 0);
  }
  function IsEqual(left, right) {
    return left === right;
  }
  function IsGreaterThan(left, right) {
    return left > right;
  }
  function IsLessThan(left, right) {
    return left < right;
  }
  function IsLessEqualThan(left, right) {
    return left <= right;
  }
  function IsGreaterEqualThan(left, right) {
    return left >= right;
  }
  function IsMultipleOf(dividend, divisor) {
    if (IsBigInt(dividend) || IsBigInt(divisor)) {
      return BigInt(dividend) % BigInt(divisor) === 0n;
    }
    const tolerance = 1e-10;
    if (!IsNumber(dividend))
      return true;
    if (IsInteger(dividend) && 1 / divisor % 1 === 0)
      return true;
    const mod = dividend % divisor;
    return Math.min(Math.abs(mod), Math.abs(mod - divisor), Math.abs(mod + divisor)) < tolerance;
  }
  function IsClassInstance(value) {
    if (!IsObject(value))
      return false;
    const proto = globalThis.Object.getPrototypeOf(value);
    if (IsNull(proto))
      return false;
    return IsEqual(typeof proto.constructor, "function") && !(IsEqual(proto.constructor, globalThis.Object) || IsEqual(proto.constructor.name, "Object"));
  }
  function IsValueLike(value) {
    return IsBigInt(value) || IsBoolean(value) || IsNull(value) || IsNumber(value) || IsString(value) || IsUndefined(value);
  }
  function GraphemeCount2(value) {
    return GraphemeCount(value);
  }
  function IsMaxLength2(value, length) {
    return IsMaxLength(value, length);
  }
  function IsMinLength2(value, length) {
    return IsMinLength(value, length);
  }
  function Every(value, offset, callback) {
    return value.every((item, index) => index < offset || callback(item, index));
  }
  function EveryAll(value, offset, callback) {
    let result = true;
    value.forEach((item, index) => {
      if (index >= offset && !callback(item, index))
        result = false;
    });
    return result;
  }
  function Some(value, callback) {
    return value.some((value2, index) => callback(value2, index));
  }
  function SomeAll(value, callback) {
    let result = false;
    value.forEach((item, index) => {
      if (callback(item, index))
        result = true;
    });
    return result;
  }
  function Counted(value, callback) {
    return value.reduce((result, value2, index) => callback(value2, index) ? ++result : result, 0);
  }
  function ShiftLeft(array, true_, false_) {
    return IsEqual(array.length, 0) ? false_() : true_(array[0], array.slice(1));
  }
  function IsUnsafePropertyKey(key) {
    return IsEqual(key, "__proto__") || IsEqual(key, "constructor") || IsEqual(key, "prototype");
  }
  function HasPropertyKey(value, key) {
    return IsUnsafePropertyKey(key) ? Object.prototype.hasOwnProperty.call(value, key) : key in value;
  }
  function EntriesRegExp(value) {
    return Keys(value).map((key) => [new RegExp(`^${key}$`), value[key]]);
  }
  function Entries(value) {
    return Object.entries(value);
  }
  function Keys(value) {
    return Object.getOwnPropertyNames(value);
  }
  function Symbols(value) {
    return Object.getOwnPropertySymbols(value);
  }
  function Values(value) {
    return Object.values(value);
  }
  function DeepEqualObject(left, right) {
    if (!IsObject(right))
      return false;
    const keys = Keys(left);
    return IsEqual(keys.length, Keys(right).length) && keys.every((key) => IsDeepEqual(left[key], right[key]));
  }
  function DeepEqualArray(left, right) {
    return IsArray(right) && IsEqual(left.length, right.length) && left.every((_, index) => IsDeepEqual(left[index], right[index]));
  }
  function IsDeepEqual(left, right) {
    return IsArray(left) ? DeepEqualArray(left, right) : IsObject(left) ? DeepEqualObject(left, right) : IsEqual(left, right);
  }

  // node_modules/typebox/build/guard/globals.mjs
  var globals_exports = {};
  __export(globals_exports, {
    IsBigInt64Array: () => IsBigInt64Array,
    IsBigUint64Array: () => IsBigUint64Array,
    IsBoolean: () => IsBoolean2,
    IsDate: () => IsDate,
    IsFloat32Array: () => IsFloat32Array,
    IsFloat64Array: () => IsFloat64Array,
    IsInt16Array: () => IsInt16Array,
    IsInt32Array: () => IsInt32Array,
    IsInt8Array: () => IsInt8Array,
    IsMap: () => IsMap,
    IsNumber: () => IsNumber2,
    IsRegExp: () => IsRegExp,
    IsSet: () => IsSet,
    IsString: () => IsString2,
    IsTypeArray: () => IsTypeArray,
    IsUint16Array: () => IsUint16Array,
    IsUint32Array: () => IsUint32Array,
    IsUint8Array: () => IsUint8Array,
    IsUint8ClampedArray: () => IsUint8ClampedArray
  });
  function IsBoolean2(value) {
    return value instanceof Boolean;
  }
  function IsNumber2(value) {
    return value instanceof Number;
  }
  function IsString2(value) {
    return value instanceof String;
  }
  function IsTypeArray(value) {
    return globalThis.ArrayBuffer.isView(value);
  }
  function IsInt8Array(value) {
    return value instanceof globalThis.Int8Array;
  }
  function IsUint8Array(value) {
    return value instanceof globalThis.Uint8Array;
  }
  function IsUint8ClampedArray(value) {
    return value instanceof globalThis.Uint8ClampedArray;
  }
  function IsInt16Array(value) {
    return value instanceof globalThis.Int16Array;
  }
  function IsUint16Array(value) {
    return value instanceof globalThis.Uint16Array;
  }
  function IsInt32Array(value) {
    return value instanceof globalThis.Int32Array;
  }
  function IsUint32Array(value) {
    return value instanceof globalThis.Uint32Array;
  }
  function IsFloat32Array(value) {
    return value instanceof globalThis.Float32Array;
  }
  function IsFloat64Array(value) {
    return value instanceof globalThis.Float64Array;
  }
  function IsBigInt64Array(value) {
    return value instanceof globalThis.BigInt64Array;
  }
  function IsBigUint64Array(value) {
    return value instanceof globalThis.BigUint64Array;
  }
  function IsRegExp(value) {
    return value instanceof globalThis.RegExp;
  }
  function IsDate(value) {
    return value instanceof globalThis.Date;
  }
  function IsSet(value) {
    return value instanceof globalThis.Set;
  }
  function IsMap(value) {
    return value instanceof globalThis.Map;
  }

  // node_modules/typebox/build/guard/index.mjs
  var guard_default = guard_exports;

  // node_modules/typebox/build/system/settings/settings.mjs
  var settings = {
    immutableTypes: false,
    maxErrors: 8,
    maxInstantiationCount: 128,
    useAcceleration: true,
    exactOptionalPropertyTypes: false,
    enumerableKind: false,
    correctiveParse: false,
    unionPrioritySort: true
  };
  function Reset() {
    settings.immutableTypes = false;
    settings.maxErrors = 8;
    settings.maxInstantiationCount = 128;
    settings.useAcceleration = true;
    settings.exactOptionalPropertyTypes = false;
    settings.enumerableKind = false;
    settings.correctiveParse = false;
    settings.unionPrioritySort = true;
  }
  function Set2(options) {
    for (const key of guard_exports.Keys(options)) {
      const value = options[key];
      if (value !== void 0) {
        Object.defineProperty(settings, key, { value });
      }
    }
  }
  function Get() {
    return settings;
  }

  // node_modules/typebox/build/schema/types/_refine.mjs
  function IsRefine(value) {
    return guard_exports.HasPropertyKey(value, "~refine") && guard_exports.IsArray(value["~refine"]) && guard_exports.Every(value["~refine"], 0, (value2) => guard_exports.IsObject(value2) && guard_exports.HasPropertyKey(value2, "check") && guard_exports.HasPropertyKey(value2, "error") && guard_exports.IsFunction(value2.check) && guard_exports.IsFunction(value2.error));
  }

  // node_modules/typebox/build/schema/types/schema.mjs
  function IsSchemaObject(value) {
    return guard_exports.IsObject(value) && !guard_exports.IsArray(value);
  }
  function IsSchemaBoolean(value) {
    return guard_exports.IsBoolean(value);
  }
  function IsSchema(value) {
    return IsSchemaObject(value) || IsSchemaBoolean(value);
  }

  // node_modules/typebox/build/schema/types/additionalItems.mjs
  function IsAdditionalItems(schema) {
    return guard_exports.HasPropertyKey(schema, "additionalItems") && IsSchema(schema.additionalItems);
  }

  // node_modules/typebox/build/schema/types/additionalProperties.mjs
  function IsAdditionalProperties(schema) {
    return guard_exports.HasPropertyKey(schema, "additionalProperties") && IsSchema(schema.additionalProperties);
  }

  // node_modules/typebox/build/schema/types/allOf.mjs
  function IsAllOf(schema) {
    return guard_exports.HasPropertyKey(schema, "allOf") && guard_exports.IsArray(schema.allOf) && schema.allOf.every((value) => IsSchema(value));
  }

  // node_modules/typebox/build/schema/types/anchor.mjs
  function IsAnchor(schema) {
    return guard_exports.HasPropertyKey(schema, "$anchor") && guard_exports.IsString(schema.$anchor);
  }

  // node_modules/typebox/build/schema/types/anyOf.mjs
  function IsAnyOf(schema) {
    return guard_exports.HasPropertyKey(schema, "anyOf") && guard_exports.IsArray(schema.anyOf) && schema.anyOf.every((value) => IsSchema(value));
  }

  // node_modules/typebox/build/schema/types/const.mjs
  function IsConst(value) {
    return guard_exports.HasPropertyKey(value, "const");
  }

  // node_modules/typebox/build/schema/types/contains.mjs
  function IsContains(schema) {
    return guard_exports.HasPropertyKey(schema, "contains") && IsSchema(schema.contains);
  }

  // node_modules/typebox/build/schema/types/default.mjs
  function IsDefault(schema) {
    return guard_exports.HasPropertyKey(schema, "default");
  }

  // node_modules/typebox/build/schema/types/dependencies.mjs
  function IsDependencies(schema) {
    return guard_exports.HasPropertyKey(schema, "dependencies") && guard_exports.IsObject(schema.dependencies) && Object.values(schema.dependencies).every((value) => IsSchema(value) || guard_exports.IsArray(value) && value.every((value2) => guard_exports.IsString(value2)));
  }

  // node_modules/typebox/build/schema/types/dependentRequired.mjs
  function IsDependentRequired(schema) {
    return guard_exports.HasPropertyKey(schema, "dependentRequired") && guard_exports.IsObject(schema.dependentRequired) && Object.values(schema.dependentRequired).every((value) => guard_exports.IsArray(value) && value.every((value2) => guard_exports.IsString(value2)));
  }

  // node_modules/typebox/build/schema/types/dependentSchemas.mjs
  function IsDependentSchemas(schema) {
    return guard_exports.HasPropertyKey(schema, "dependentSchemas") && guard_exports.IsObject(schema.dependentSchemas) && Object.values(schema.dependentSchemas).every((value) => IsSchema(value));
  }

  // node_modules/typebox/build/schema/types/dynamicAnchor.mjs
  function IsDynamicAnchor(schema) {
    return guard_exports.HasPropertyKey(schema, "$dynamicAnchor") && guard_exports.IsString(schema.$dynamicAnchor);
  }

  // node_modules/typebox/build/schema/types/dynamicRef.mjs
  function IsDynamicRef(schema) {
    return guard_exports.HasPropertyKey(schema, "$dynamicRef") && guard_exports.IsString(schema.$dynamicRef);
  }

  // node_modules/typebox/build/schema/types/else.mjs
  function IsElse(schema) {
    return guard_exports.HasPropertyKey(schema, "else") && IsSchema(schema.else);
  }

  // node_modules/typebox/build/schema/types/enum.mjs
  function IsEnum(schema) {
    return guard_exports.HasPropertyKey(schema, "enum") && guard_exports.IsArray(schema.enum);
  }

  // node_modules/typebox/build/schema/types/exclusiveMaximum.mjs
  function IsExclusiveMaximum(schema) {
    return guard_exports.HasPropertyKey(schema, "exclusiveMaximum") && (guard_exports.IsNumber(schema.exclusiveMaximum) || guard_exports.IsBigInt(schema.exclusiveMaximum));
  }

  // node_modules/typebox/build/schema/types/exclusiveMinimum.mjs
  function IsExclusiveMinimum(schema) {
    return guard_exports.HasPropertyKey(schema, "exclusiveMinimum") && (guard_exports.IsNumber(schema.exclusiveMinimum) || guard_exports.IsBigInt(schema.exclusiveMinimum));
  }

  // node_modules/typebox/build/schema/types/format.mjs
  function IsFormat(schema) {
    return guard_exports.HasPropertyKey(schema, "format") && guard_exports.IsString(schema.format);
  }

  // node_modules/typebox/build/schema/types/id.mjs
  function IsId(schema) {
    return guard_exports.HasPropertyKey(schema, "$id") && guard_exports.IsString(schema.$id);
  }

  // node_modules/typebox/build/schema/types/if.mjs
  function IsIf(schema) {
    return guard_exports.HasPropertyKey(schema, "if") && IsSchema(schema.if);
  }

  // node_modules/typebox/build/schema/types/items.mjs
  function IsItems(schema) {
    return guard_exports.HasPropertyKey(schema, "items") && (IsSchema(schema.items) || guard_exports.IsArray(schema.items) && schema.items.every((value) => {
      return IsSchema(value);
    }));
  }
  function IsItemsSized(schema) {
    return IsItems(schema) && guard_exports.IsArray(schema.items);
  }

  // node_modules/typebox/build/schema/types/maximum.mjs
  function IsMaximum(schema) {
    return guard_exports.HasPropertyKey(schema, "maximum") && (guard_exports.IsNumber(schema.maximum) || guard_exports.IsBigInt(schema.maximum));
  }

  // node_modules/typebox/build/schema/types/maxContains.mjs
  function IsMaxContains(schema) {
    return guard_exports.HasPropertyKey(schema, "maxContains") && guard_exports.IsNumber(schema.maxContains);
  }

  // node_modules/typebox/build/schema/types/maxItems.mjs
  function IsMaxItems(schema) {
    return guard_exports.HasPropertyKey(schema, "maxItems") && guard_exports.IsNumber(schema.maxItems);
  }

  // node_modules/typebox/build/schema/types/maxLength.mjs
  function IsMaxLength3(schema) {
    return guard_exports.HasPropertyKey(schema, "maxLength") && guard_exports.IsNumber(schema.maxLength);
  }

  // node_modules/typebox/build/schema/types/maxProperties.mjs
  function IsMaxProperties(schema) {
    return guard_exports.HasPropertyKey(schema, "maxProperties") && guard_exports.IsNumber(schema.maxProperties);
  }

  // node_modules/typebox/build/schema/types/minimum.mjs
  function IsMinimum(schema) {
    return guard_exports.HasPropertyKey(schema, "minimum") && (guard_exports.IsNumber(schema.minimum) || guard_exports.IsBigInt(schema.minimum));
  }

  // node_modules/typebox/build/schema/types/minContains.mjs
  function IsMinContains(schema) {
    return guard_exports.HasPropertyKey(schema, "minContains") && guard_exports.IsNumber(schema.minContains);
  }

  // node_modules/typebox/build/schema/types/minItems.mjs
  function IsMinItems(schema) {
    return guard_exports.HasPropertyKey(schema, "minItems") && guard_exports.IsNumber(schema.minItems);
  }

  // node_modules/typebox/build/schema/types/minLength.mjs
  function IsMinLength3(schema) {
    return guard_exports.HasPropertyKey(schema, "minLength") && guard_exports.IsNumber(schema.minLength);
  }

  // node_modules/typebox/build/schema/types/minProperties.mjs
  function IsMinProperties(schema) {
    return guard_exports.HasPropertyKey(schema, "minProperties") && guard_exports.IsNumber(schema.minProperties);
  }

  // node_modules/typebox/build/schema/types/multipleOf.mjs
  function IsMultipleOf2(schema) {
    return guard_exports.HasPropertyKey(schema, "multipleOf") && (guard_exports.IsNumber(schema.multipleOf) || guard_exports.IsBigInt(schema.multipleOf));
  }

  // node_modules/typebox/build/schema/types/not.mjs
  function IsNot(schema) {
    return guard_exports.HasPropertyKey(schema, "not") && IsSchema(schema.not);
  }

  // node_modules/typebox/build/schema/types/oneOf.mjs
  function IsOneOf(schema) {
    return guard_exports.HasPropertyKey(schema, "oneOf") && guard_exports.IsArray(schema.oneOf) && schema.oneOf.every((value) => IsSchema(value));
  }

  // node_modules/typebox/build/schema/types/pattern.mjs
  function IsPattern(schema) {
    return guard_exports.HasPropertyKey(schema, "pattern") && (guard_exports.IsString(schema.pattern) || schema.pattern instanceof RegExp);
  }

  // node_modules/typebox/build/schema/types/patternProperties.mjs
  function IsPatternProperties(schema) {
    return guard_exports.HasPropertyKey(schema, "patternProperties") && guard_exports.IsObject(schema.patternProperties) && Object.values(schema.patternProperties).every((value) => IsSchema(value));
  }

  // node_modules/typebox/build/schema/types/prefixItems.mjs
  function IsPrefixItems(schema) {
    return guard_exports.HasPropertyKey(schema, "prefixItems") && guard_exports.IsArray(schema.prefixItems) && schema.prefixItems.every((schema2) => IsSchema(schema2));
  }

  // node_modules/typebox/build/schema/types/properties.mjs
  function IsProperties(schema) {
    return guard_exports.HasPropertyKey(schema, "properties") && guard_exports.IsObject(schema.properties) && Object.values(schema.properties).every((value) => IsSchema(value));
  }

  // node_modules/typebox/build/schema/types/propertyNames.mjs
  function IsPropertyNames(schema) {
    return guard_exports.HasPropertyKey(schema, "propertyNames") && (guard_exports.IsObject(schema.propertyNames) || IsSchema(schema.propertyNames));
  }

  // node_modules/typebox/build/schema/types/recursiveAnchor.mjs
  function IsRecursiveAnchor(schema) {
    return guard_exports.HasPropertyKey(schema, "$recursiveAnchor") && guard_exports.IsBoolean(schema.$recursiveAnchor);
  }
  function IsRecursiveAnchorTrue(schema) {
    return IsRecursiveAnchor(schema) && guard_exports.IsEqual(schema.$recursiveAnchor, true);
  }

  // node_modules/typebox/build/schema/types/recursiveRef.mjs
  function IsRecursiveRef(schema) {
    return guard_exports.HasPropertyKey(schema, "$recursiveRef") && guard_exports.IsString(schema.$recursiveRef);
  }

  // node_modules/typebox/build/schema/types/ref.mjs
  function IsRef(schema) {
    return guard_exports.HasPropertyKey(schema, "$ref") && guard_exports.IsString(schema.$ref);
  }

  // node_modules/typebox/build/schema/types/required.mjs
  function IsRequired(schema) {
    return guard_exports.HasPropertyKey(schema, "required") && guard_exports.IsArray(schema.required) && schema.required.every((value) => guard_exports.IsString(value));
  }

  // node_modules/typebox/build/schema/types/then.mjs
  function IsThen(schema) {
    return guard_exports.HasPropertyKey(schema, "then") && IsSchema(schema.then);
  }

  // node_modules/typebox/build/schema/types/type.mjs
  function IsType(schema) {
    return guard_exports.HasPropertyKey(schema, "type") && (guard_exports.IsString(schema.type) || guard_exports.IsArray(schema.type) && schema.type.every((value) => guard_exports.IsString(value)));
  }

  // node_modules/typebox/build/schema/types/uniqueItems.mjs
  function IsUniqueItems(schema) {
    return guard_exports.HasPropertyKey(schema, "uniqueItems") && guard_exports.IsBoolean(schema.uniqueItems);
  }

  // node_modules/typebox/build/schema/types/unevaluatedItems.mjs
  function IsUnevaluatedItems(schema) {
    return guard_exports.HasPropertyKey(schema, "unevaluatedItems") && IsSchema(schema.unevaluatedItems);
  }

  // node_modules/typebox/build/schema/types/unevaluatedProperties.mjs
  function IsUnevaluatedProperties(schema) {
    return guard_exports.HasPropertyKey(schema, "unevaluatedProperties") && IsSchema(schema.unevaluatedProperties);
  }

  // node_modules/typebox/build/schema/engine/_context.mjs
  var CheckContext = class {
    constructor() {
      const indices = /* @__PURE__ */ new Set();
      const keys = /* @__PURE__ */ new Set();
      this.stack = [{ indices, keys }];
    }
    // ----------------------------------------------------------------
    // Stack
    // ----------------------------------------------------------------
    Push() {
      const indices = /* @__PURE__ */ new Set();
      const keys = /* @__PURE__ */ new Set();
      this.stack.push({ indices, keys });
      return true;
    }
    Pop() {
      this.stack.pop();
      return true;
    }
    // ----------------------------------------------------------------
    // Top
    // ----------------------------------------------------------------
    AddIndex(index) {
      this.GetIndices().add(index);
      return true;
    }
    AddKey(key) {
      this.GetKeys().add(key);
      return true;
    }
    GetIndices() {
      const top = this.stack[this.stack.length - 1];
      return top.indices;
    }
    GetKeys() {
      const top = this.stack[this.stack.length - 1];
      return top.keys;
    }
    Merge(results) {
      for (const context of results) {
        context.GetIndices().forEach((value) => this.GetIndices().add(value));
        context.GetKeys().forEach((value) => this.GetKeys().add(value));
      }
      return true;
    }
  };
  var ErrorContext = class extends CheckContext {
    constructor() {
      super();
      this.errors = [];
    }
    AtCapacity() {
      return this.errors.length >= settings_exports.Get().maxErrors;
    }
    AddError(error2) {
      if (!this.AtCapacity())
        this.errors.push(error2);
      return false;
    }
    GetErrors() {
      return this.errors;
    }
  };

  // node_modules/typebox/build/schema/engine/_refine.mjs
  function CheckRefine(_stack, _context, schema, value) {
    return guard_exports.Every(schema["~refine"], 0, (refinement, _) => refinement.check(value));
  }
  function ErrorRefine(_stack, context, schemaPath, instancePath, schema, value) {
    return guard_exports.EveryAll(schema["~refine"], 0, (refinement, index) => {
      return refinement.check(value) || context.AddError({
        keyword: "~refine",
        schemaPath,
        instancePath,
        params: { index, message: refinement.error(value) }
      });
    });
  }

  // node_modules/typebox/build/schema/engine/additionalItems.mjs
  function IsValid(schema) {
    return IsItems(schema) && guard_exports.IsArray(schema.items);
  }
  function CheckAdditionalItems(stack, context, schema, value) {
    if (!IsValid(schema))
      return true;
    const isAdditionalItems = guard_exports.Every(value, 0, (item, index) => {
      return guard_exports.IsLessThan(index, schema.items.length) || CheckSchemaPushStack(stack, context, schema.additionalItems, item) && context.AddIndex(index);
    });
    return isAdditionalItems;
  }
  function ErrorAdditionalItems(stack, context, schemaPath, instancePath, schema, value) {
    if (!IsValid(schema))
      return true;
    const isAdditionalItems = guard_exports.Every(value, 0, (item, index) => {
      const nextSchemaPath = `${schemaPath}/additionalItems`;
      const nextInstancePath = `${instancePath}/${index}`;
      return guard_exports.IsLessThan(index, schema.items.length) || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema.additionalItems, item) && context.AddIndex(index);
    });
    return isAdditionalItems;
  }

  // node_modules/typebox/build/schema/engine/_regexp.mjs
  function UnicodeRegExp(pattern) {
    return new RegExp(pattern, "u");
  }

  // node_modules/typebox/build/schema/engine/additionalProperties.mjs
  function GetPropertyKeyAsPattern(key) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return `^${escaped}$`;
  }
  function GetPropertiesPattern(schema) {
    const patterns = [];
    if (IsPatternProperties(schema))
      patterns.push(...guard_exports.Keys(schema.patternProperties));
    if (IsProperties(schema))
      patterns.push(...guard_exports.Keys(schema.properties).map(GetPropertyKeyAsPattern));
    return guard_exports.IsEqual(patterns.length, 0) ? "(?!)" : `(${patterns.join("|")})`;
  }
  function CheckAdditionalProperties(stack, context, schema, value) {
    const regexp = UnicodeRegExp(GetPropertiesPattern(schema));
    const isAdditionalProperties = guard_exports.Every(guard_exports.Keys(value), 0, (key, _index) => {
      return regexp.test(key) || CheckSchemaPushStack(stack, context, schema.additionalProperties, value[key]) && context.AddKey(key);
    });
    return isAdditionalProperties;
  }
  function ErrorAdditionalProperties(stack, context, schemaPath, instancePath, schema, value) {
    const regexp = UnicodeRegExp(GetPropertiesPattern(schema));
    const additionalProperties = [];
    const isAdditionalProperties = guard_exports.EveryAll(guard_exports.Keys(value), 0, (key, _index) => {
      const nextSchemaPath = `${schemaPath}/additionalProperties`;
      const nextInstancePath = `${instancePath}/${key}`;
      const isAdditionalProperty = regexp.test(key) || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema.additionalProperties, value[key]) && context.AddKey(key);
      if (!isAdditionalProperty)
        additionalProperties.push(key);
      return isAdditionalProperty;
    });
    return isAdditionalProperties || context.AddError({
      keyword: "additionalProperties",
      schemaPath,
      instancePath,
      params: { additionalProperties }
    });
  }

  // node_modules/typebox/build/schema/engine/allOf.mjs
  function CheckAllOf(stack, context, schema, value) {
    const results = schema.allOf.reduce((result, schema2) => {
      const nextContext = new CheckContext();
      return CheckSchema(stack, nextContext, schema2, value) ? [...result, nextContext] : result;
    }, []);
    return guard_exports.IsEqual(results.length, schema.allOf.length) && context.Merge(results);
  }
  function ErrorAllOf(stack, context, schemaPath, instancePath, schema, value) {
    const failedContexts = [];
    const results = schema.allOf.reduce((result, schema2, index) => {
      const nextSchemaPath = `${schemaPath}/allOf/${index}`;
      const nextContext = new ErrorContext();
      const isSchema = ErrorSchema(stack, nextContext, nextSchemaPath, instancePath, schema2, value);
      if (!isSchema)
        failedContexts.push(nextContext);
      return isSchema ? [...result, nextContext] : result;
    }, []);
    const isAllOf = guard_exports.IsEqual(results.length, schema.allOf.length) && context.Merge(results);
    if (!isAllOf)
      failedContexts.forEach((failed) => failed.GetErrors().forEach((error2) => context.AddError(error2)));
    return isAllOf;
  }

  // node_modules/typebox/build/schema/engine/anyOf.mjs
  function CheckAnyOf(stack, context, schema, value) {
    const results = schema.anyOf.reduce((result, schema2) => {
      const nextContext = new CheckContext();
      return CheckSchema(stack, nextContext, schema2, value) ? [...result, nextContext] : result;
    }, []);
    return guard_exports.IsGreaterThan(results.length, 0) && context.Merge(results);
  }
  function ErrorAnyOf(stack, context, schemaPath, instancePath, schema, value) {
    const failedContexts = [];
    const results = schema.anyOf.reduce((result, schema2, index) => {
      const nextContext = new ErrorContext();
      const nextSchemaPath = `${schemaPath}/anyOf/${index}`;
      const isSchema = ErrorSchema(stack, nextContext, nextSchemaPath, instancePath, schema2, value);
      if (!isSchema)
        failedContexts.push(nextContext);
      return isSchema ? [...result, nextContext] : result;
    }, []);
    const isAnyOf = guard_exports.IsGreaterThan(results.length, 0) && context.Merge(results);
    if (!isAnyOf)
      failedContexts.forEach((failed) => failed.GetErrors().forEach((error2) => context.AddError(error2)));
    return isAnyOf || context.AddError({
      keyword: "anyOf",
      schemaPath,
      instancePath,
      params: {}
    });
  }

  // node_modules/typebox/build/schema/engine/boolean.mjs
  function CheckSchemaBoolean(_stack, _context, schema, _value) {
    return schema;
  }
  function ErrorSchemaBoolean(stack, context, schemaPath, instancePath, schema, value) {
    return CheckSchemaBoolean(stack, context, schema, value) || context.AddError({
      keyword: "boolean",
      schemaPath,
      instancePath,
      params: {}
    });
  }

  // node_modules/typebox/build/schema/engine/const.mjs
  function CheckConst(_stack, _context, schema, value) {
    return guard_exports.IsValueLike(schema.const) ? guard_exports.IsEqual(value, schema.const) : guard_exports.IsDeepEqual(value, schema.const);
  }
  function ErrorConst(stack, context, schemaPath, instancePath, schema, value) {
    return CheckConst(stack, context, schema, value) || context.AddError({
      keyword: "const",
      schemaPath,
      instancePath,
      params: { allowedValue: schema.const }
    });
  }

  // node_modules/typebox/build/schema/engine/contains.mjs
  function IsValid2(schema) {
    return !(IsMinContains(schema) && guard_exports.IsEqual(schema.minContains, 0));
  }
  function CheckContains(stack, context, schema, value) {
    if (!IsValid2(schema))
      return true;
    return !guard_exports.IsEqual(value.length, 0) && guard_exports.SomeAll(value, (item, index) => {
      return CheckSchema(stack, context, schema.contains, item) && context.AddIndex(index);
    });
  }
  function ErrorContains(stack, context, schemaPath, instancePath, schema, value) {
    return CheckContains(stack, context, schema, value) || context.AddError({
      keyword: "contains",
      schemaPath,
      instancePath,
      params: { minContains: 1 }
    });
  }

  // node_modules/typebox/build/schema/engine/dependencies.mjs
  function CheckDependencies(stack, context, schema, value) {
    const isLength = guard_exports.IsEqual(guard_exports.Keys(value).length, 0);
    const isEvery = guard_exports.Every(guard_exports.Entries(schema.dependencies), 0, ([key, schema2]) => {
      return !guard_exports.HasPropertyKey(value, key) || (guard_exports.IsArray(schema2) ? schema2.every((key2) => guard_exports.HasPropertyKey(value, key2)) : CheckSchema(stack, context, schema2, value));
    });
    return isLength || isEvery;
  }
  function ErrorDependencies(stack, context, schemaPath, instancePath, schema, value) {
    const isLength = guard_exports.IsEqual(guard_exports.Keys(value).length, 0);
    const isEvery = guard_exports.EveryAll(guard_exports.Entries(schema.dependencies), 0, ([key, schema2]) => {
      const nextSchemaPath = `${schemaPath}/dependencies/${key}`;
      return !guard_exports.HasPropertyKey(value, key) || (guard_exports.IsArray(schema2) ? schema2.every((dependency) => guard_exports.HasPropertyKey(value, dependency) || context.AddError({
        keyword: "dependencies",
        schemaPath,
        instancePath,
        params: { property: key, dependencies: schema2 }
      })) : ErrorSchema(stack, context, nextSchemaPath, instancePath, schema2, value));
    });
    return isLength || isEvery;
  }

  // node_modules/typebox/build/schema/engine/dependentRequired.mjs
  function CheckDependentRequired(_stack, _context, schema, value) {
    const isLength = guard_exports.IsEqual(guard_exports.Keys(value).length, 0);
    const isEvery = guard_exports.Every(guard_exports.Entries(schema.dependentRequired), 0, ([key, keys]) => {
      return !guard_exports.HasPropertyKey(value, key) || keys.every((key2) => guard_exports.HasPropertyKey(value, key2));
    });
    return isLength || isEvery;
  }
  function ErrorDependentRequired(_stack, context, schemaPath, instancePath, schema, value) {
    const isLength = guard_exports.IsEqual(guard_exports.Keys(value).length, 0);
    const isEveryEntry = guard_exports.EveryAll(guard_exports.Entries(schema.dependentRequired), 0, ([key, keys]) => {
      return !guard_exports.HasPropertyKey(value, key) || guard_exports.EveryAll(keys, 0, (dependency) => guard_exports.HasPropertyKey(value, dependency) || context.AddError({
        keyword: "dependentRequired",
        schemaPath,
        instancePath,
        params: { property: key, dependencies: keys }
      }));
    });
    return isLength || isEveryEntry;
  }

  // node_modules/typebox/build/schema/engine/dependentSchemas.mjs
  function CheckDependentSchemas(stack, context, schema, value) {
    const isLength = guard_exports.IsEqual(guard_exports.Keys(value).length, 0);
    const isEvery = guard_exports.Every(guard_exports.Entries(schema.dependentSchemas), 0, ([key, schema2]) => {
      return !guard_exports.HasPropertyKey(value, key) || CheckSchema(stack, context, schema2, value);
    });
    return isLength || isEvery;
  }
  function ErrorDependentSchemas(stack, context, schemaPath, instancePath, schema, value) {
    const isLength = guard_exports.IsEqual(guard_exports.Keys(value).length, 0);
    const isEvery = guard_exports.EveryAll(guard_exports.Entries(schema.dependentSchemas), 0, ([key, schema2]) => {
      const nextSchemaPath = `${schemaPath}/dependentSchemas/${key}`;
      return !guard_exports.HasPropertyKey(value, key) || ErrorSchema(stack, context, nextSchemaPath, instancePath, schema2, value);
    });
    return isLength || isEvery;
  }

  // node_modules/typebox/build/schema/engine/dynamicRef.mjs
  function CheckDynamicRef(stack, context, schema, value) {
    const target = stack.DynamicRef(schema) ?? false;
    return IsSchema(target) && CheckSchema(stack, context, target, value);
  }
  function ErrorDynamicRef(stack, context, _schemaPath, instancePath, schema, value) {
    const target = stack.DynamicRef(schema) ?? false;
    return IsSchema(target) && ErrorSchema(stack, context, "#", instancePath, target, value);
  }

  // node_modules/typebox/build/schema/engine/enum.mjs
  function CheckEnum(_stack, _context, schema, value) {
    return guard_exports.Some(schema.enum, (option) => guard_exports.IsValueLike(option) ? guard_exports.IsEqual(value, option) : guard_exports.IsDeepEqual(value, option));
  }
  function ErrorEnum(stack, context, schemaPath, instancePath, schema, value) {
    return CheckEnum(stack, context, schema, value) || context.AddError({
      keyword: "enum",
      schemaPath,
      instancePath,
      params: { allowedValues: schema.enum }
    });
  }

  // node_modules/typebox/build/schema/engine/exclusiveMaximum.mjs
  function CheckExclusiveMaximum(_stack, _context, schema, value) {
    return guard_exports.IsLessThan(value, schema.exclusiveMaximum);
  }
  function ErrorExclusiveMaximum(stack, context, schemaPath, instancePath, schema, value) {
    return CheckExclusiveMaximum(stack, context, schema, value) || context.AddError({
      keyword: "exclusiveMaximum",
      schemaPath,
      instancePath,
      params: { comparison: "<", limit: schema.exclusiveMaximum }
    });
  }

  // node_modules/typebox/build/schema/engine/exclusiveMinimum.mjs
  function CheckExclusiveMinimum(_stack, _context, schema, value) {
    return guard_exports.IsGreaterThan(value, schema.exclusiveMinimum);
  }
  function ErrorExclusiveMinimum(stack, context, schemaPath, instancePath, schema, value) {
    return CheckExclusiveMinimum(stack, context, schema, value) || context.AddError({
      keyword: "exclusiveMinimum",
      schemaPath,
      instancePath,
      params: { comparison: ">", limit: schema.exclusiveMinimum }
    });
  }

  // node_modules/typebox/build/format/format.mjs
  var format_exports = {};
  __export(format_exports, {
    Clear: () => Clear,
    Entries: () => Entries2,
    Get: () => Get2,
    Has: () => Has,
    IsDate: () => IsDate2,
    IsDateTime: () => IsDateTime,
    IsDuration: () => IsDuration,
    IsEmail: () => IsEmail,
    IsHostname: () => IsHostname2,
    IsIPv4: () => IsIPv4,
    IsIPv6: () => IsIPv6,
    IsIdnEmail: () => IsIdnEmail,
    IsIdnHostname: () => IsIdnHostname2,
    IsIri: () => IsIri,
    IsIriReference: () => IsIriReference,
    IsJsonPointer: () => IsJsonPointer,
    IsJsonPointerUriFragment: () => IsJsonPointerUriFragment,
    IsRegex: () => IsRegex,
    IsRelativeJsonPointer: () => IsRelativeJsonPointer,
    IsTime: () => IsTime,
    IsUri: () => IsUri,
    IsUriReference: () => IsUriReference,
    IsUriTemplate: () => IsUriTemplate,
    IsUrl: () => IsUrl,
    IsUuid: () => IsUuid,
    Reset: () => Reset2,
    Set: () => Set3,
    Test: () => Test
  });

  // node_modules/typebox/build/format/date.mjs
  var DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
  function IsLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }
  function IsDate2(value) {
    const matches = DATE.exec(value);
    if (!matches)
      return false;
    const year = +matches[1];
    const month = +matches[2];
    const day = +matches[3];
    return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && IsLeapYear(year) ? 29 : DAYS[month]);
  }

  // node_modules/typebox/build/format/time.mjs
  var TIME = /^(\d\d):(\d\d):(\d\d)(?:\.\d+)?(?:([Zz])|([+-])(\d\d):(\d\d))?$/;
  function IsTime(value, strictTimeZone = true) {
    const matches = TIME.exec(value);
    if (!matches)
      return false;
    if (strictTimeZone && !matches[4] && !matches[5])
      return false;
    const hr = +matches[1];
    const min = +matches[2];
    const sec = +matches[3];
    if (hr > 23 || min > 59 || sec > 60)
      return false;
    if (matches[5]) {
      const tzH2 = +matches[6];
      const tzM2 = +matches[7];
      if (tzH2 > 23 || tzM2 > 59)
        return false;
    }
    if (sec < 60)
      return true;
    const tzSign = matches[5] === "-" ? -1 : 1;
    const tzH = +(matches[6] || 0);
    const tzM = +(matches[7] || 0);
    const totalUtcMin = hr * 60 + min - tzSign * (tzH * 60 + tzM);
    return (totalUtcMin % 1440 + 1440) % 1440 === 1439;
  }

  // node_modules/typebox/build/format/date_time.mjs
  function IsDateTime(value) {
    const dateTime = value.split(/T/i);
    return dateTime.length === 2 && IsDate2(dateTime[0]) && IsTime(dateTime[1]);
  }

  // node_modules/typebox/build/format/duration.mjs
  var Duration = /^P((\d+Y(\d+M(\d+D)?)?|\d+M(\d+D)?|\d+D)(T(\d+H(\d+M(\d+S)?)?|\d+M(\d+S)?|\d+S))?|T(\d+H(\d+M(\d+S)?)?|\d+M(\d+S)?|\d+S)|\d+W)$/;
  function IsDuration(value) {
    return Duration.test(value);
  }

  // node_modules/typebox/build/format/email.mjs
  var Email = /^(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[^"\\]|\\[\x20-\x7e])*")@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*|\[(?:IPv6:[a-f0-9:]+|(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(?:\.(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3})\])$/i;
  function IsEmail(value) {
    return Email.test(value);
  }

  // node_modules/typebox/build/format/idna/pattern/pattern.mjs
  var RE_RULE_HYPHEN_PLACEMENT = /^(?!-).*(?<!-)$/;
  var RE_RULE_NOT_RESERVED_ACE = /^(?!..--)/;
  var RE_ASCII_LDH = /^[a-zA-Z0-9-]*$/;
  var RE_ASCII = new RegExp("^\\p{ASCII}*$", "u");
  var RE_NON_ASCII = /[^\p{ASCII}]/u;
  var RE_ASCII_DIGIT = /[0-9]/;
  var RE_ARABIC_INDIC_DIGIT = /[\u{0660}-\u{0669}]/u;
  var RE_EXT_ARABIC_INDIC_DIGIT = /[\u{06f0}-\u{06f9}]/u;
  var RE_COMMON_SEPARATOR = /[\u{002e}\u{002c}\u{003a}\u{002f}]/u;
  var RE_EUROPEAN_SEPARATOR = /[\u{002d}\u{002b}]/u;
  var RE_MARK_NONSPACING = new RegExp("\\p{Mn}", "u");
  var RE_MARK_SPACING_COMBINING = new RegExp("\\p{Mc}", "u");
  var RE_MARK_ENCLOSING = new RegExp("\\p{Me}", "u");
  var RE_COMBINING_MARK = /[\p{Mn}\p{Mc}\p{Me}]/u;
  var RE_LETTER = new RegExp("\\p{L}", "u");
  var RE_NUMBER_DECIMAL = new RegExp("\\p{Nd}", "u");
  var RE_SCRIPT_GREEK = new RegExp("\\p{Script=Greek}", "u");
  var RE_SCRIPT_HEBREW = new RegExp("\\p{Script=Hebrew}", "u");
  var RE_SCRIPT_JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
  var RE_SCRIPT_ARABIC_LETTER = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Mandaic}]/u;
  var RE_VIRAMA = /[\u{094d}\u{09cd}\u{0a4d}\u{0acd}\u{0b4d}\u{0bcd}\u{0c4d}\u{0ccd}\u{0d3b}\u{0d3c}\u{0d4d}\u{0dca}\u{1b44}\u{1baa}\u{1bab}\u{a9c0}\u{11046}\u{1107f}\u{110b9}\u{11133}\u{11134}\u{111c0}\u{11235}\u{1134d}\u{11442}\u{114c2}\u{115bf}\u{1163f}\u{116b6}\u{11c3f}\u{11d44}\u{11d45}]/u;
  var RE_RFC5892_DISALLOWED = /[\u{0640}\u{07fa}\u{302e}\u{302f}\u{3031}\u{3032}\u{3033}\u{3034}\u{3035}\u{303b}]/u;
  var RE_CONTEXTO_EXCEPTIONS = /[\u{00b7}\u{0375}\u{05f3}\u{05f4}\u{200c}\u{200d}\u{30fb}]/u;
  var RE_PVALID_EXCEPTIONS = /[\u{00df}\u{03c2}\u{06fd}\u{06fe}\u{0f0b}\u{3007}]/u;
  var RE_EUROPEAN_NUMBER = new RegExp([
    RE_ASCII_DIGIT,
    RE_EXT_ARABIC_INDIC_DIGIT
  ].map((regexp) => regexp.source).join("|"), "u");
  var RE_PERMITTED_CATEGORY = new RegExp([
    RE_LETTER,
    RE_EUROPEAN_SEPARATOR,
    RE_COMMON_SEPARATOR,
    RE_NUMBER_DECIMAL,
    RE_MARK_NONSPACING,
    RE_MARK_SPACING_COMBINING,
    RE_CONTEXTO_EXCEPTIONS,
    RE_PVALID_EXCEPTIONS
  ].map((regexp) => regexp.source).join("|"), "u");

  // node_modules/typebox/build/format/idna/label/ascii.mjs
  function IsAsciiLabel(value) {
    return RE_RULE_HYPHEN_PLACEMENT.test(value) && RE_RULE_NOT_RESERVED_ACE.test(value) && RE_ASCII_LDH.test(value);
  }

  // node_modules/typebox/build/format/idna/format/puny.mjs
  var PUNYCODE_BASE = 36;
  var PUNYCODE_TMIN = 1;
  var PUNYCODE_TMAX = 26;
  var PUNYCODE_SKEW = 38;
  var PUNYCODE_DAMP = 700;
  var PUNYCODE_INITIAL_BIAS = 72;
  var PUNYCODE_INITIAL_N = 128;
  function ThrowDontCare() {
    throw null;
  }
  function IsAcePrefixed(value) {
    return value.toLowerCase().startsWith("xn--");
  }
  function Adapt(delta, numPoints, firstTime) {
    delta = firstTime ? Math.floor(delta / PUNYCODE_DAMP) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    let k = 0;
    while (delta > (PUNYCODE_BASE - PUNYCODE_TMIN) * PUNYCODE_TMAX >> 1) {
      delta = Math.floor(delta / (PUNYCODE_BASE - PUNYCODE_TMIN));
      k += PUNYCODE_BASE;
    }
    return k + Math.floor((PUNYCODE_BASE - PUNYCODE_TMIN + 1) * delta / (delta + PUNYCODE_SKEW));
  }
  function Decode(value) {
    const output = [];
    let n = PUNYCODE_INITIAL_N;
    let i = 0;
    let bias = PUNYCODE_INITIAL_BIAS;
    const delimIdx = value.lastIndexOf("-");
    if (delimIdx > 0) {
      for (let j = 0; j < delimIdx; j++) {
        const cp = value.charCodeAt(j);
        if (cp >= 128)
          ThrowDontCare();
        output.push(cp);
      }
    }
    let inIdx = delimIdx < 0 ? 0 : delimIdx + 1;
    while (inIdx < value.length) {
      const oldi = i;
      let w = 1;
      let k = PUNYCODE_BASE;
      while (true) {
        if (inIdx >= value.length)
          ThrowDontCare();
        const ch = value.charCodeAt(inIdx++);
        let digit;
        if (ch >= 97 && ch <= 122)
          digit = ch - 97;
        else if (ch >= 48 && ch <= 57)
          digit = ch - 48 + 26;
        else
          ThrowDontCare();
        i += digit * w;
        const t = k <= bias ? PUNYCODE_TMIN : k >= bias + PUNYCODE_TMAX ? PUNYCODE_TMAX : k - bias;
        if (digit < t)
          break;
        w *= PUNYCODE_BASE - t;
        k += PUNYCODE_BASE;
      }
      const outLen = output.length + 1;
      bias = Adapt(i - oldi, outLen, oldi === 0);
      n += Math.floor(i / outLen);
      i %= outLen;
      output.splice(i, 0, n);
      i++;
    }
    return String.fromCodePoint(...output);
  }
  function DigitToChar(digit) {
    return digit < 26 ? String.fromCharCode(digit + 97) : String.fromCharCode(digit - 26 + 48);
  }
  var RE_REPLACE_NON_ASCII = new RegExp(RE_NON_ASCII.source, "gu");
  function Encode(input) {
    const basic = input.replace(RE_REPLACE_NON_ASCII, "");
    const basicLength = basic.length;
    const result = basicLength > 0 ? [basic, "-"] : [];
    const codePoints = Array.from(input, (char) => char.codePointAt(0));
    let n = PUNYCODE_INITIAL_N;
    let delta = 0;
    let bias = PUNYCODE_INITIAL_BIAS;
    let handledCPCount = basicLength;
    while (handledCPCount < codePoints.length) {
      let m = Infinity;
      for (const cp of codePoints) {
        if (cp >= n && cp < m)
          m = cp;
      }
      delta += (m - n) * (handledCPCount + 1);
      n = m;
      for (const cp of codePoints) {
        if (cp < n)
          delta++;
        if (cp === n) {
          let q = delta;
          for (let k = PUNYCODE_BASE; ; k += PUNYCODE_BASE) {
            const t = k <= bias ? PUNYCODE_TMIN : k >= bias + PUNYCODE_TMAX ? PUNYCODE_TMAX : k - bias;
            if (q < t)
              break;
            const digit = t + (q - t) % (PUNYCODE_BASE - t);
            result.push(DigitToChar(digit));
            q = Math.floor((q - t) / (PUNYCODE_BASE - t));
          }
          result.push(DigitToChar(q));
          bias = Adapt(delta, handledCPCount + 1, handledCPCount === basicLength);
          delta = 0;
          handledCPCount++;
        }
      }
      delta++;
      n++;
    }
    return result.join("");
  }

  // node_modules/typebox/build/format/idna/format/bidi.mjs
  var RE_RTL_ALLOWED = /^(?:R|AL|AN|EN|ES|CS|ET|ON|BN|NSM)$/;
  var RE_LTR_ALLOWED = /^(?:L|EN|ES|CS|ET|ON|BN|NSM)$/;
  var RE_RTL_CLASSES = /^(?:R|AL|AN)$/;
  function HasBidiChars(value) {
    if (IsAcePrefixed(value)) {
      try {
        return HasRightToLeftCharacters(Decode(value.slice(4).toLowerCase()));
      } catch {
        return false;
      }
    }
    return HasRightToLeftCharacters(value);
  }
  function GetBidiClass(codePoint) {
    const char = String.fromCodePoint(codePoint);
    return RE_EUROPEAN_NUMBER.test(char) ? "EN" : RE_ARABIC_INDIC_DIGIT.test(char) ? "AN" : (
      // Pattern.RE_EUROPEAN_SEPARATOR.test(char) ? 'ES' : // (no-spec-coverage)
      // Pattern.RE_COMMON_SEPARATOR.test(char) ? 'CS' : // (no-spec-coverage)
      RE_MARK_NONSPACING.test(char) ? "NSM" : RE_SCRIPT_HEBREW.test(char) ? "R" : RE_SCRIPT_ARABIC_LETTER.test(char) ? "AL" : RE_LETTER.test(char) ? "L" : "ON"
    );
  }
  function HasRightToLeftCharacters(value) {
    for (const ch of value)
      if (RE_RTL_CLASSES.test(GetBidiClass(ch.codePointAt(0))))
        return true;
    return false;
  }
  function SatisfiesBidiRule(value) {
    let isRtl = false;
    let allowed = RE_LTR_ALLOWED;
    let sawEN = false;
    let sawAN = false;
    let isFirst = true;
    for (const ch of value) {
      const bidiClass = GetBidiClass(ch.codePointAt(0));
      if (isFirst) {
        if (bidiClass !== "L" && bidiClass !== "R" && bidiClass !== "AL")
          return false;
        isRtl = bidiClass === "R" || bidiClass === "AL";
        allowed = isRtl ? RE_RTL_ALLOWED : RE_LTR_ALLOWED;
        isFirst = false;
      }
      if (!allowed.test(bidiClass))
        return false;
      if (bidiClass === "EN")
        sawEN = true;
      else if (bidiClass === "AN")
        sawAN = true;
    }
    if (isRtl && sawEN && sawAN)
      return false;
    return true;
  }

  // node_modules/typebox/build/format/idna/label/unicode.mjs
  function ExceedsMaxALabelLength(value) {
    return RE_NON_ASCII.test(value) && Encode(value).length + 4 > 63;
  }
  function HasInvalidHyphens(chars) {
    if (chars[0] === "-" || chars[chars.length - 1] === "-")
      return true;
    return chars.slice(2).join("").startsWith("--");
  }
  function IsUnicodeLabel(value) {
    if (ExceedsMaxALabelLength(value))
      return false;
    if (HasRightToLeftCharacters(value) && !SatisfiesBidiRule(value))
      return false;
    const chars = [...value];
    const codePoints = chars.map((c) => c.codePointAt(0));
    const length = codePoints.length;
    if (HasInvalidHyphens(chars))
      return false;
    if (RE_COMBINING_MARK.test(chars[0]))
      return false;
    let hasJapanese = false;
    for (let i = 0; i < length; i++) {
      const codePoint = codePoints[i];
      const char = chars[i];
      if (RE_RFC5892_DISALLOWED.test(char))
        return false;
      if (!RE_PERMITTED_CATEGORY.test(char))
        return false;
      if (RE_SCRIPT_JAPANESE.test(char))
        hasJapanese = true;
      const prev = codePoints[i - 1], next = codePoints[i + 1];
      switch (codePoint) {
        case 183:
          if (prev !== 108 || next !== 108)
            return false;
          break;
        // MIDDLE DOT (Catalan)
        case 885:
          if (!next || !RE_SCRIPT_GREEK.test(chars[i + 1]))
            return false;
          break;
        // Greek KERAIA
        case 1523:
        case 1524:
          if (!prev || !RE_SCRIPT_HEBREW.test(chars[i - 1]))
            return false;
          break;
        // Hebrew GERESH
        case 8204:
          if (!prev || prev < 128 && !RE_VIRAMA.test(chars[i - 1]))
            return false;
          break;
        case 8205:
          if (!prev || !RE_VIRAMA.test(chars[i - 1]))
            return false;
          break;
        case 12539:
          break;
      }
    }
    if (value.includes("\u30FB") && !hasJapanese)
      return false;
    return true;
  }

  // node_modules/typebox/build/format/idna/label/puny.mjs
  function IsPunyLabel(value) {
    if (!IsAcePrefixed(value))
      return false;
    try {
      const body = value.slice(4).toLowerCase();
      if (body.lastIndexOf("-") === 0)
        return false;
      const decoded = Decode(body);
      if (!RE_NON_ASCII.test(decoded))
        return false;
      return IsUnicodeLabel(decoded);
    } catch {
      return false;
    }
  }

  // node_modules/typebox/build/format/idna/hostname.mjs
  function IsValidLabelLength(value) {
    return value.length > 0 && value.length <= 63;
  }
  function IsLabel(value) {
    return IsValidLabelLength(value) && (IsPunyLabel(value) || IsAsciiLabel(value));
  }
  function IsHostname(value) {
    if (value.length === 0 || value.length > 253)
      return false;
    if (value.charCodeAt(value.length - 1) === 46)
      return false;
    return value.split(".").every((label) => IsLabel(label));
  }

  // node_modules/typebox/build/format/idna/idn-hostname.mjs
  function IsValidLabelLength2(value) {
    return value.length > 0 && value.length <= 63;
  }
  function IsLabel2(value) {
    return IsValidLabelLength2(value) && (IsPunyLabel(value) || IsUnicodeLabel(value));
  }
  function NormalizeHostname(value) {
    return value.replace(/[\uff01-\uff5e]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 65248)).normalize("NFC").replace(/[\u00ad\u034f\u180b-\u180d\u200b\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/gu, "").replace(/[\u002E\u3002\uFF0E\uFF61]/g, ".");
  }
  function IsIdnHostname(value) {
    if (value.length === 0 || value.includes(" "))
      return false;
    const normalized = NormalizeHostname(value);
    if (normalized.length > 253)
      return false;
    const labels = normalized.split(".");
    const hasBidiChars = labels.some((label) => HasBidiChars(label));
    return labels.every((label) => IsLabel2(label) && (!hasBidiChars || SatisfiesBidiRule(label)));
  }

  // node_modules/typebox/build/format/hostname.mjs
  function IsHostname2(value) {
    return IsHostname(value);
  }

  // node_modules/typebox/build/format/idn_email.mjs
  var IdnEmail = /^(?:[A-Za-z0-9!#$%&'*+\/=?^_`{|}~\u{0080}-\u{10FFFF}-]+(?:\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~\u{0080}-\u{10FFFF}-]+)*|"(?:[^"\\]|\\.)*")@[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,62})(?<!-)(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,62})(?<!-))*$/iu;
  function IsIdnEmail(value) {
    return IdnEmail.test(value.normalize("NFC"));
  }

  // node_modules/typebox/build/format/idn_hostname.mjs
  function IsIdnHostname2(value) {
    return IsIdnHostname(value);
  }

  // node_modules/typebox/build/format/ipv4.mjs
  var IPv4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
  function IsIPv4(value) {
    return IPv4.test(value);
  }

  // node_modules/typebox/build/format/ipv6.mjs
  var IPv6 = /^(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:)?[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)$/i;
  function IsIPv6(value) {
    return IPv6.test(value);
  }

  // node_modules/typebox/build/format/iri_reference.mjs
  var InvalidIriChars = /[\x00-\x20\x7F\\]|%(?![0-9a-fA-F]{2})/;
  var MalformedScheme = /^[a-zA-Z][a-zA-Z0-9+\-.]*\/\//;
  function IsIriReference(value) {
    return !InvalidIriChars.test(value) && !MalformedScheme.test(value) && URL.canParse(value, "http://example.com");
  }

  // node_modules/typebox/build/format/iri.mjs
  var IpvFutureMatchMaxLength = 2048;
  var IpvFutureMatch = /\[[vV][0-9a-fA-F]+\.[^\]]+\]/;
  var InvalidIriChars2 = /[\x00-\x20<>\^`{|}\\]/;
  var InvalidPercentEncoding = /%(?![0-9a-fA-F]{2})/;
  function NarrowIpvFuture(value) {
    return value.length < IpvFutureMatchMaxLength ? value.replace(IpvFutureMatch, "[::1]") : value;
  }
  function IsIri(value) {
    if (InvalidIriChars2.test(value))
      return false;
    if (InvalidPercentEncoding.test(value))
      return false;
    return URL.canParse(NarrowIpvFuture(value));
  }

  // node_modules/typebox/build/format/json_pointer_uri_fragment.mjs
  var JsonPointerUriFragment = /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i;
  function IsJsonPointerUriFragment(value) {
    return JsonPointerUriFragment.test(value);
  }

  // node_modules/typebox/build/format/json_pointer.mjs
  var JsonPointer = /^(?:\/(?:[^~/]|~0|~1)*)*$/;
  function IsJsonPointer(value) {
    return JsonPointer.test(value);
  }

  // node_modules/typebox/build/format/regex.mjs
  function IsRegex(value) {
    try {
      new RegExp(value, "u");
      return true;
    } catch {
      return false;
    }
  }

  // node_modules/typebox/build/format/relative_json_pointer.mjs
  var RelativeJsonPointer = /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/;
  function IsRelativeJsonPointer(value) {
    return RelativeJsonPointer.test(value);
  }

  // node_modules/typebox/build/format/uri_reference.mjs
  var UriReference = /^(?:[a-z][a-z0-9+\-.]*:(?:\/\/(?:(?:[-a-z0-9._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:[\da-f]{1,4}:){6}(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|::(?:[\da-f]{1,4}:){5}(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:[\da-f]{1,4})?::(?:[\da-f]{1,4}:){4}(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[\da-f]{1,4}:){0,1}[\da-f]{1,4})?::(?:[\da-f]{1,4}:){3}(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[\da-f]{1,4}:){0,2}[\da-f]{1,4})?::(?:[\da-f]{1,4}:){2}(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[\da-f]{1,4}:){0,3}[\da-f]{1,4})?::[\da-f]{1,4}:(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[\da-f]{1,4}:){0,4}[\da-f]{1,4})?::(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[\da-f]{1,4}:){0,5}[\da-f]{1,4})?::[\da-f]{1,4}|(?:(?:[\da-f]{1,4}:){0,6}[\da-f]{1,4})?::)|v[0-9a-f]+\.[-a-z0-9._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)|(?:[-a-z0-9._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[-a-z0-9._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[-a-z0-9._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[-a-z0-9._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[-a-z0-9._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[-a-z0-9._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:\/\/(?:(?:[-a-z0-9._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:[\da-f]{1,4}:){6}(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|::(?:[\da-f]{1,4}:){5}(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:[\da-f]{1,4})?::(?:[\da-f]{1,4}:){4}(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[\da-f]{1,4}:){0,1}[\da-f]{1,4})?::(?:[\da-f]{1,4}:){3}(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[\da-f]{1,4}:){0,2}[\da-f]{1,4})?::(?:[\da-f]{1,4}:){2}(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[\da-f]{1,4}:){0,3}[\da-f]{1,4})?::[\da-f]{1,4}:(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[\da-f]{1,4}:){0,4}[\da-f]{1,4})?::(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[\da-f]{1,4}:){0,5}[\da-f]{1,4})?::[\da-f]{1,4}|(?:(?:[\da-f]{1,4}:){0,6}[\da-f]{1,4})?::)|v[0-9a-f]+\.[-a-z0-9._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)|(?:[-a-z0-9._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[-a-z0-9._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[-a-z0-9._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[-a-z0-9._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[-a-z0-9._~!$&'()*+,;=@]|%[0-9a-f]{2})+(?:\/(?:[-a-z0-9._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?)(?:\?(?:[-a-z0-9._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[-a-z0-9._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
  function IsUriReference(value) {
    return UriReference.test(value);
  }

  // node_modules/typebox/build/format/uri_template.mjs
  var UriTemplate = /^(?:(?:[^\x00-\x20"<>%\\^`{|}\x7f]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?:\.(?:[a-z0-9_]|%[0-9a-f]{2})+)*(?::[1-9]\d{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?:\.(?:[a-z0-9_]|%[0-9a-f]{2})+)*(?::[1-9]\d{0,3}|\*)?)*\})*$/i;
  function IsUriTemplate(value) {
    return UriTemplate.test(value);
  }

  // node_modules/typebox/build/format/uri.mjs
  var Uri = /^[a-z][a-z0-9+\-.]*:(?:\/\/(?:(?:[-a-z0-9._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:[\da-f]{1,4}:){6}(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|::(?:[\da-f]{1,4}:){5}(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:[\da-f]{1,4})?::(?:[\da-f]{1,4}:){4}(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[\da-f]{1,4}:){0,1}[\da-f]{1,4})?::(?:[\da-f]{1,4}:){3}(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[\da-f]{1,4}:){0,2}[\da-f]{1,4})?::(?:[\da-f]{1,4}:){2}(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[\da-f]{1,4}:){0,3}[\da-f]{1,4})?::[\da-f]{1,4}:(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[\da-f]{1,4}:){0,4}[\da-f]{1,4})?::(?:[\da-f]{1,4}:[\da-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))|(?:(?:[\da-f]{1,4}:){0,5}[\da-f]{1,4})?::[\da-f]{1,4}|(?:(?:[\da-f]{1,4}:){0,6}[\da-f]{1,4})?::)|v[0-9a-f]+\.[-a-z0-9._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)|(?:[-a-z0-9._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[-a-z0-9._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[-a-z0-9._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[-a-z0-9._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[-a-z0-9._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[-a-z0-9._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[-a-z0-9._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[-a-z0-9._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
  function IsUri(value) {
    return Uri.test(value);
  }

  // node_modules/typebox/build/format/url.mjs
  function IsUrl(value) {
    return URL.canParse(value);
  }

  // node_modules/typebox/build/format/uuid.mjs
  var Uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  function IsUuid(value) {
    return Uuid.test(value);
  }

  // node_modules/typebox/build/format/_registry.mjs
  var formats = /* @__PURE__ */ new Map();
  function Clear() {
    formats.clear();
  }
  function Entries2() {
    return [...formats.entries()];
  }
  function Set3(format, check) {
    formats.set(format, check);
  }
  function Has(format) {
    return formats.has(format);
  }
  function Get2(format) {
    return formats.get(format);
  }
  function Test(format, value) {
    return formats.get(format)?.(value) ?? true;
  }
  function Reset2() {
    Clear();
    formats.set("date-time", IsDateTime);
    formats.set("date", IsDate2);
    formats.set("duration", IsDuration);
    formats.set("email", IsEmail);
    formats.set("hostname", IsHostname2);
    formats.set("idn-email", IsIdnEmail);
    formats.set("idn-hostname", IsIdnHostname2);
    formats.set("ipv4", IsIPv4);
    formats.set("ipv6", IsIPv6);
    formats.set("iri-reference", IsIriReference);
    formats.set("iri", IsIri);
    formats.set("json-pointer-uri-fragment", IsJsonPointerUriFragment);
    formats.set("json-pointer", IsJsonPointer);
    formats.set("regex", IsRegex);
    formats.set("relative-json-pointer", IsRelativeJsonPointer);
    formats.set("time", IsTime);
    formats.set("uri-reference", IsUriReference);
    formats.set("uri-template", IsUriTemplate);
    formats.set("uri", IsUri);
    formats.set("url", IsUrl);
    formats.set("uuid", IsUuid);
  }
  Reset2();

  // node_modules/typebox/build/schema/engine/format.mjs
  function CheckFormat(_stack, _context, schema, value) {
    return format_exports.Test(schema.format, value);
  }
  function ErrorFormat(stack, context, schemaPath, instancePath, schema, value) {
    return CheckFormat(stack, context, schema, value) || context.AddError({
      keyword: "format",
      schemaPath,
      instancePath,
      params: { format: schema.format }
    });
  }

  // node_modules/typebox/build/schema/engine/if.mjs
  function CheckIf(stack, context, schema, value) {
    const thenSchema = IsThen(schema) ? schema.then : true;
    const elseSchema = IsElse(schema) ? schema.else : true;
    return CheckSchema(stack, context, schema.if, value) ? CheckSchema(stack, context, thenSchema, value) : CheckSchema(stack, context, elseSchema, value);
  }
  function ErrorIf(stack, context, schemaPath, instancePath, schema, value) {
    const thenSchema = IsThen(schema) ? schema.then : true;
    const elseSchema = IsElse(schema) ? schema.else : true;
    const trueContext = new ErrorContext();
    const isIf = ErrorSchema(stack, trueContext, `${schemaPath}/if`, instancePath, schema.if, value) ? ErrorSchema(stack, trueContext, `${schemaPath}/then`, instancePath, thenSchema, value) || context.AddError({
      keyword: "if",
      schemaPath,
      instancePath,
      params: { failingKeyword: "then" }
    }) : ErrorSchema(stack, context, `${schemaPath}/else`, instancePath, elseSchema, value) || context.AddError({
      keyword: "if",
      schemaPath,
      instancePath,
      params: { failingKeyword: "else" }
    });
    if (isIf)
      context.Merge([trueContext]);
    return isIf;
  }

  // node_modules/typebox/build/schema/engine/items.mjs
  function CheckItemsSized(stack, context, schema, value) {
    return guard_exports.Every(schema.items, 0, (schema2, index) => {
      return guard_exports.IsLessEqualThan(value.length, index) || CheckSchemaPushStack(stack, context, schema2, value[index]) && context.AddIndex(index);
    });
  }
  function ErrorItemsSized(stack, context, schemaPath, instancePath, schema, value) {
    return guard_exports.EveryAll(schema.items, 0, (schema2, index) => {
      const nextSchemaPath = `${schemaPath}/items/${index}`;
      const nextInstancePath = `${instancePath}/${index}`;
      return guard_exports.IsLessEqualThan(value.length, index) || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema2, value[index]) && context.AddIndex(index);
    });
  }
  function CheckItemsUnsized(stack, context, schema, value) {
    const offset = IsPrefixItems(schema) ? schema.prefixItems.length : 0;
    return guard_exports.Every(value, offset, (element, index) => {
      return CheckSchemaPushStack(stack, context, schema.items, element) && context.AddIndex(index);
    });
  }
  function ErrorItemsUnsized(stack, context, schemaPath, instancePath, schema, value) {
    const offset = IsPrefixItems(schema) ? schema.prefixItems.length : 0;
    return guard_exports.EveryAll(value, offset, (element, index) => {
      const nextSchemaPath = `${schemaPath}/items`;
      const nextInstancePath = `${instancePath}/${index}`;
      return ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema.items, element) && context.AddIndex(index);
    });
  }
  function CheckItems(stack, context, schema, value) {
    return IsItemsSized(schema) ? CheckItemsSized(stack, context, schema, value) : CheckItemsUnsized(stack, context, schema, value);
  }
  function ErrorItems(stack, context, schemaPath, instancePath, schema, value) {
    return IsItemsSized(schema) ? ErrorItemsSized(stack, context, schemaPath, instancePath, schema, value) : ErrorItemsUnsized(stack, context, schemaPath, instancePath, schema, value);
  }

  // node_modules/typebox/build/schema/engine/maxContains.mjs
  function IsValid3(schema) {
    return IsContains(schema);
  }
  function CheckMaxContains(stack, context, schema, value) {
    if (!IsValid3(schema))
      return true;
    const count = guard_exports.Counted(value, (item) => CheckSchema(stack, context, schema.contains, item));
    return guard_exports.IsLessEqualThan(count, schema.maxContains);
  }
  function ErrorMaxContains(stack, context, schemaPath, instancePath, schema, value) {
    const minContains = IsMinContains(schema) ? schema.minContains : 1;
    return CheckMaxContains(stack, context, schema, value) || context.AddError({
      keyword: "contains",
      schemaPath,
      instancePath,
      params: { minContains, maxContains: schema.maxContains }
    });
  }

  // node_modules/typebox/build/schema/engine/maximum.mjs
  function CheckMaximum(_stack, _context, schema, value) {
    return guard_exports.IsLessEqualThan(value, schema.maximum);
  }
  function ErrorMaximum(stack, context, schemaPath, instancePath, schema, value) {
    return CheckMaximum(stack, context, schema, value) || context.AddError({
      keyword: "maximum",
      schemaPath,
      instancePath,
      params: { comparison: "<=", limit: schema.maximum }
    });
  }

  // node_modules/typebox/build/schema/engine/maxItems.mjs
  function CheckMaxItems(_stack, _context, schema, value) {
    return guard_exports.IsLessEqualThan(value.length, schema.maxItems);
  }
  function ErrorMaxItems(stack, context, schemaPath, instancePath, schema, value) {
    return CheckMaxItems(stack, context, schema, value) || context.AddError({
      keyword: "maxItems",
      schemaPath,
      instancePath,
      params: { limit: schema.maxItems }
    });
  }

  // node_modules/typebox/build/schema/engine/maxLength.mjs
  function CheckMaxLength(_stack, _context, schema, value) {
    return guard_exports.IsMaxLength(value, schema.maxLength);
  }
  function ErrorMaxLength(stack, context, schemaPath, instancePath, schema, value) {
    return CheckMaxLength(stack, context, schema, value) || context.AddError({
      keyword: "maxLength",
      schemaPath,
      instancePath,
      params: { limit: schema.maxLength }
    });
  }

  // node_modules/typebox/build/schema/engine/maxProperties.mjs
  function CheckMaxProperties(_stack, _context, schema, value) {
    return guard_exports.IsLessEqualThan(guard_exports.Keys(value).length, schema.maxProperties);
  }
  function ErrorMaxProperties(stack, context, schemaPath, instancePath, schema, value) {
    return CheckMaxProperties(stack, context, schema, value) || context.AddError({
      keyword: "maxProperties",
      schemaPath,
      instancePath,
      params: { limit: schema.maxProperties }
    });
  }

  // node_modules/typebox/build/schema/engine/minContains.mjs
  function IsValid4(schema) {
    return IsContains(schema);
  }
  function CheckMinContains(stack, context, schema, value) {
    if (!IsValid4(schema))
      return true;
    const count = guard_exports.Counted(value, (item, index) => CheckSchema(stack, context, schema.contains, item) && context.AddIndex(index));
    return guard_exports.IsGreaterEqualThan(count, schema.minContains);
  }
  function ErrorMinContains(stack, context, schemaPath, instancePath, schema, value) {
    return CheckMinContains(stack, context, schema, value) || context.AddError({
      keyword: "contains",
      schemaPath,
      instancePath,
      params: { minContains: schema.minContains }
    });
  }

  // node_modules/typebox/build/schema/engine/minimum.mjs
  function CheckMinimum(_stack, _context, schema, value) {
    return guard_exports.IsGreaterEqualThan(value, schema.minimum);
  }
  function ErrorMinimum(stack, context, schemaPath, instancePath, schema, value) {
    return CheckMinimum(stack, context, schema, value) || context.AddError({
      keyword: "minimum",
      schemaPath,
      instancePath,
      params: { comparison: ">=", limit: schema.minimum }
    });
  }

  // node_modules/typebox/build/schema/engine/minItems.mjs
  function CheckMinItems(_stack, _context, schema, value) {
    return guard_exports.IsGreaterEqualThan(value.length, schema.minItems);
  }
  function ErrorMinItems(stack, context, schemaPath, instancePath, schema, value) {
    return CheckMinItems(stack, context, schema, value) || context.AddError({
      keyword: "minItems",
      schemaPath,
      instancePath,
      params: { limit: schema.minItems }
    });
  }

  // node_modules/typebox/build/schema/engine/minLength.mjs
  function CheckMinLength(_stack, _context, schema, value) {
    return guard_exports.IsMinLength(value, schema.minLength);
  }
  function ErrorMinLength(stack, context, schemaPath, instancePath, schema, value) {
    return CheckMinLength(stack, context, schema, value) || context.AddError({
      keyword: "minLength",
      schemaPath,
      instancePath,
      params: { limit: schema.minLength }
    });
  }

  // node_modules/typebox/build/schema/engine/minProperties.mjs
  function CheckMinProperties(_stack, _context, schema, value) {
    return guard_exports.IsGreaterEqualThan(guard_exports.Keys(value).length, schema.minProperties);
  }
  function ErrorMinProperties(stack, context, schemaPath, instancePath, schema, value) {
    return CheckMinProperties(stack, context, schema, value) || context.AddError({
      keyword: "minProperties",
      schemaPath,
      instancePath,
      params: { limit: schema.minProperties }
    });
  }

  // node_modules/typebox/build/schema/engine/multipleOf.mjs
  function CheckMultipleOf(_stack, _context, schema, value) {
    return guard_exports.IsMultipleOf(value, schema.multipleOf);
  }
  function ErrorMultipleOf(stack, context, schemaPath, instancePath, schema, value) {
    return CheckMultipleOf(stack, context, schema, value) || context.AddError({
      keyword: "multipleOf",
      schemaPath,
      instancePath,
      params: { multipleOf: schema.multipleOf }
    });
  }

  // node_modules/typebox/build/schema/engine/not.mjs
  function CheckNot(stack, context, schema, value) {
    const nextContext = new CheckContext();
    const isSchema = !CheckSchema(stack, nextContext, schema.not, value);
    const isNot = isSchema && context.Merge([nextContext]);
    return isNot;
  }
  function ErrorNot(stack, context, schemaPath, instancePath, schema, value) {
    return CheckNot(stack, context, schema, value) || context.AddError({
      keyword: "not",
      schemaPath,
      instancePath,
      params: {}
    });
  }

  // node_modules/typebox/build/schema/engine/oneOf.mjs
  function CheckOneOf(stack, context, schema, value) {
    const passedContexts = schema.oneOf.reduce((result, schema2) => {
      const nextContext = new CheckContext();
      return CheckSchema(stack, nextContext, schema2, value) ? [...result, nextContext] : result;
    }, []);
    return guard_exports.IsEqual(passedContexts.length, 1) && context.Merge(passedContexts);
  }
  function ErrorOneOf(stack, context, schemaPath, instancePath, schema, value) {
    const failedContexts = [];
    const passingSchemas = [];
    const passedContexts = schema.oneOf.reduce((result, schema2, index) => {
      const nextContext = new ErrorContext();
      const nextSchemaPath = `${schemaPath}/oneOf/${index}`;
      const isSchema = ErrorSchema(stack, nextContext, nextSchemaPath, instancePath, schema2, value);
      if (isSchema)
        passingSchemas.push(index);
      if (!isSchema)
        failedContexts.push(nextContext);
      return isSchema ? [...result, nextContext] : result;
    }, []);
    const isOneOf = guard_exports.IsEqual(passedContexts.length, 1) && context.Merge(passedContexts);
    if (!isOneOf && guard_exports.IsEqual(passingSchemas.length, 0))
      failedContexts.forEach((failed) => failed.GetErrors().forEach((error2) => context.AddError(error2)));
    return isOneOf || context.AddError({
      keyword: "oneOf",
      schemaPath,
      instancePath,
      params: { passingSchemas }
    });
  }

  // node_modules/typebox/build/schema/engine/pattern.mjs
  function CheckPattern(_stack, _context, schema, value) {
    const regexp = guard_exports.IsString(schema.pattern) ? UnicodeRegExp(schema.pattern) : schema.pattern;
    return regexp.test(value);
  }
  function ErrorPattern(stack, context, schemaPath, instancePath, schema, value) {
    return CheckPattern(stack, context, schema, value) || context.AddError({
      keyword: "pattern",
      schemaPath,
      instancePath,
      params: { pattern: schema.pattern }
    });
  }

  // node_modules/typebox/build/schema/engine/patternProperties.mjs
  function CheckPatternProperties(stack, context, schema, value) {
    return guard_exports.Every(guard_exports.Entries(schema.patternProperties), 0, ([pattern, schema2]) => {
      const regexp = UnicodeRegExp(pattern);
      return guard_exports.Every(guard_exports.Entries(value), 0, ([key, prop]) => {
        return !regexp.test(key) || CheckSchemaPushStack(stack, context, schema2, prop) && context.AddKey(key);
      });
    });
  }
  function ErrorPatternProperties(stack, context, schemaPath, instancePath, schema, value) {
    return guard_exports.EveryAll(guard_exports.Entries(schema.patternProperties), 0, ([pattern, schema2]) => {
      const nextSchemaPath = `${schemaPath}/patternProperties/${pattern}`;
      const regexp = UnicodeRegExp(pattern);
      return guard_exports.EveryAll(guard_exports.Entries(value), 0, ([key, value2]) => {
        const nextInstancePath = `${instancePath}/${key}`;
        const notKey = !regexp.test(key);
        return notKey || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema2, value2) && context.AddKey(key);
      });
    });
  }

  // node_modules/typebox/build/schema/engine/prefixItems.mjs
  function CheckPrefixItems(stack, context, schema, value) {
    return guard_exports.IsEqual(value.length, 0) || guard_exports.Every(schema.prefixItems, 0, (schema2, index) => {
      return guard_exports.IsLessEqualThan(value.length, index) || CheckSchemaPushStack(stack, context, schema2, value[index]) && context.AddIndex(index);
    });
  }
  function ErrorPrefixItems(stack, context, schemaPath, instancePath, schema, value) {
    return guard_exports.IsEqual(value.length, 0) || guard_exports.EveryAll(schema.prefixItems, 0, (schema2, index) => {
      const nextSchemaPath = `${schemaPath}/prefixItems/${index}`;
      const nextInstancePath = `${instancePath}/${index}`;
      return guard_exports.IsLessEqualThan(value.length, index) || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema2, value[index]) && context.AddIndex(index);
    });
  }

  // node_modules/typebox/build/schema/engine/_exact_optional.mjs
  function IsExactOptional(required, key) {
    return required.includes(key) || settings_exports.Get().exactOptionalPropertyTypes;
  }
  function InexactOptionalCheck(value, key) {
    return guard_exports.IsUndefined(value[key]);
  }

  // node_modules/typebox/build/schema/engine/properties.mjs
  function CheckProperties(stack, context, schema, value) {
    const required = IsRequired(schema) ? schema.required : [];
    const isProperties = guard_exports.Every(guard_exports.Entries(schema.properties), 0, ([key, schema2]) => {
      const isProperty = !guard_exports.HasPropertyKey(value, key) || CheckSchemaPushStack(stack, context, schema2, value[key]) && context.AddKey(key);
      return IsExactOptional(required, key) ? isProperty : InexactOptionalCheck(value, key) || isProperty;
    });
    return isProperties;
  }
  function ErrorProperties(stack, context, schemaPath, instancePath, schema, value) {
    const required = IsRequired(schema) ? schema.required : [];
    const isProperties = guard_exports.EveryAll(guard_exports.Entries(schema.properties), 0, ([key, schema2]) => {
      const nextSchemaPath = `${schemaPath}/properties/${key}`;
      const nextInstancePath = `${instancePath}/${key}`;
      const isProperty = () => !guard_exports.HasPropertyKey(value, key) || ErrorSchemaPushStack(stack, context, nextSchemaPath, nextInstancePath, schema2, value[key]) && context.AddKey(key);
      return IsExactOptional(required, key) ? isProperty() : InexactOptionalCheck(value, key) || isProperty();
    });
    return isProperties;
  }

  // node_modules/typebox/build/schema/engine/propertyNames.mjs
  function CheckPropertyNames(stack, context, schema, value) {
    return guard_exports.Every(guard_exports.Keys(value), 0, (key, _index) => CheckSchema(stack, context, schema.propertyNames, key));
  }
  function ErrorPropertyNames(stack, context, schemaPath, instancePath, schema, value) {
    const propertyNames = [];
    const isPropertyNames = guard_exports.EveryAll(guard_exports.Keys(value), 0, (key, _index) => {
      const nextInstancePath = `${instancePath}/${key}`;
      const nextSchemaPath = `${schemaPath}/propertyNames`;
      const isPropertyName = ErrorSchema(stack, context, nextSchemaPath, nextInstancePath, schema.propertyNames, key);
      if (!isPropertyName)
        propertyNames.push(key);
      return isPropertyName;
    });
    return isPropertyNames || context.AddError({
      keyword: "propertyNames",
      schemaPath,
      instancePath,
      params: { propertyNames }
    });
  }

  // node_modules/typebox/build/schema/engine/recursiveRef.mjs
  function CheckRecursiveRef(stack, context, schema, value) {
    const target = stack.RecursiveRef(schema) ?? false;
    return IsSchema(target) && CheckSchema(stack, context, target, value);
  }
  function ErrorRecursiveRef(stack, context, _schemaPath, instancePath, schema, value) {
    const target = stack.RecursiveRef(schema) ?? false;
    return IsSchema(target) && ErrorSchema(stack, context, "#", instancePath, target, value);
  }

  // node_modules/typebox/build/schema/engine/ref.mjs
  function CheckRef(stack, context, schema, value) {
    const target = stack.Ref(schema) ?? false;
    const nextContext = new CheckContext();
    const result = IsSchema(target) && CheckSchema(stack, nextContext, target, value);
    if (result)
      context.Merge([nextContext]);
    return result;
  }
  function ErrorRef(stack, context, _schemaPath, instancePath, schema, value) {
    const target = stack.Ref(schema) ?? false;
    const nextContext = new ErrorContext();
    const result = IsSchema(target) && ErrorSchema(stack, nextContext, "#", instancePath, target, value);
    if (result)
      context.Merge([nextContext]);
    if (!result)
      nextContext.GetErrors().forEach((error2) => context.AddError(error2));
    return result;
  }

  // node_modules/typebox/build/schema/engine/required.mjs
  function CheckRequired(_stack, _context, schema, value) {
    return guard_exports.Every(schema.required, 0, (key) => guard_exports.HasPropertyKey(value, key));
  }
  function ErrorRequired(_stack, context, schemaPath, instancePath, schema, value) {
    const requiredProperties = [];
    const isRequired = guard_exports.EveryAll(schema.required, 0, (key) => {
      const hasKey = guard_exports.HasPropertyKey(value, key);
      if (!hasKey)
        requiredProperties.push(key);
      return hasKey;
    });
    return isRequired || context.AddError({
      keyword: "required",
      schemaPath,
      instancePath,
      params: { requiredProperties }
    });
  }

  // node_modules/typebox/build/schema/engine/type.mjs
  function CheckTypeName(_stack, _context, type, _schema, value) {
    return (
      // jsonschema
      guard_exports.IsEqual(type, "object") ? guard_exports.IsObjectNotArray(value) : guard_exports.IsEqual(type, "array") ? guard_exports.IsArray(value) : guard_exports.IsEqual(type, "boolean") ? guard_exports.IsBoolean(value) : guard_exports.IsEqual(type, "integer") ? guard_exports.IsInteger(value) : guard_exports.IsEqual(type, "number") ? guard_exports.IsNumber(value) : guard_exports.IsEqual(type, "null") ? guard_exports.IsNull(value) : guard_exports.IsEqual(type, "string") ? guard_exports.IsString(value) : (
        // xschema
        guard_exports.IsEqual(type, "bigint") ? guard_exports.IsBigInt(value) : guard_exports.IsEqual(type, "constructor") ? guard_exports.IsConstructor(value) : guard_exports.IsEqual(type, "function") ? guard_exports.IsFunction(value) : guard_exports.IsEqual(type, "symbol") ? guard_exports.IsSymbol(value) : guard_exports.IsEqual(type, "undefined") ? guard_exports.IsUndefined(value) : guard_exports.IsEqual(type, "void") ? guard_exports.IsUndefined(value) : true
      )
    );
  }
  function CheckTypeNames(stack, context, types, schema, value) {
    return guard_exports.Some(types, (type) => CheckTypeName(stack, context, type, schema, value));
  }
  function CheckType(stack, context, schema, value) {
    return guard_exports.IsArray(schema.type) ? CheckTypeNames(stack, context, schema.type, schema, value) : CheckTypeName(stack, context, schema.type, schema, value);
  }
  function ErrorType(stack, context, schemaPath, instancePath, schema, value) {
    const isType = guard_exports.IsArray(schema.type) ? CheckTypeNames(stack, context, schema.type, schema, value) : CheckTypeName(stack, context, schema.type, schema, value);
    return isType || context.AddError({
      keyword: "type",
      schemaPath,
      instancePath,
      params: { type: schema.type }
    });
  }

  // node_modules/typebox/build/schema/engine/unevaluatedItems.mjs
  function CheckUnevaluatedItems(stack, context, schema, value) {
    const indices = context.GetIndices();
    return guard_exports.Every(value, 0, (item, index) => {
      return (indices.has(index) || CheckSchema(stack, context, schema.unevaluatedItems, item)) && context.AddIndex(index);
    });
  }
  function ErrorUnevaluatedItems(stack, context, schemaPath, instancePath, schema, value) {
    const indices = context.GetIndices();
    const unevaluatedItems = [];
    const isUnevaluatedItems = guard_exports.EveryAll(value, 0, (item, index) => {
      const nextContext = new ErrorContext();
      const isEvaluatedItem = (indices.has(index) || ErrorSchema(stack, nextContext, schemaPath, instancePath, schema.unevaluatedItems, item)) && context.AddIndex(index);
      if (!isEvaluatedItem)
        unevaluatedItems.push(index);
      return isEvaluatedItem;
    });
    return isUnevaluatedItems || context.AddError({
      keyword: "unevaluatedItems",
      schemaPath,
      instancePath,
      params: { unevaluatedItems }
    });
  }

  // node_modules/typebox/build/schema/engine/unevaluatedProperties.mjs
  function CheckUnevaluatedProperties(stack, context, schema, value) {
    const keys = context.GetKeys();
    return guard_exports.Every(guard_exports.Entries(value), 0, ([key, prop]) => {
      return keys.has(key) || CheckSchema(stack, context, schema.unevaluatedProperties, prop) && context.AddKey(key);
    });
  }
  function ErrorUnevaluatedProperties(stack, context, schemaPath, instancePath, schema, value) {
    const keys = context.GetKeys();
    const unevaluatedProperties = [];
    const isUnevaluatedProperties = guard_exports.EveryAll(guard_exports.Entries(value), 0, ([key, prop]) => {
      const nextContext = new ErrorContext();
      const isEvaluatedProperty = keys.has(key) || ErrorSchema(stack, nextContext, schemaPath, instancePath, schema.unevaluatedProperties, prop) && context.AddKey(key);
      if (!isEvaluatedProperty)
        unevaluatedProperties.push(key);
      return isEvaluatedProperty;
    });
    return isUnevaluatedProperties || context.AddError({
      keyword: "unevaluatedProperties",
      schemaPath,
      instancePath,
      params: { unevaluatedProperties }
    });
  }

  // node_modules/typebox/build/system/hashing/hash.mjs
  var hash_exports = {};
  __export(hash_exports, {
    Hash: () => Hash,
    HashCode: () => HashCode
  });

  // node_modules/typebox/build/system/unreachable/unreachable.mjs
  function Unreachable() {
    throw new Error("Unreachable");
  }

  // node_modules/typebox/build/system/hashing/hash.mjs
  function InstanceKeys(value) {
    const propertyKeys = /* @__PURE__ */ new Set();
    let current = value;
    while (current && current !== Object.prototype) {
      for (const key of Reflect.ownKeys(current)) {
        if (key !== "constructor" && typeof key !== "symbol")
          propertyKeys.add(key);
      }
      current = Object.getPrototypeOf(current);
    }
    return [...propertyKeys];
  }
  function IsIEEE754(value) {
    return typeof value === "number";
  }
  var ByteMarker;
  (function(ByteMarker2) {
    ByteMarker2[ByteMarker2["Array"] = 0] = "Array";
    ByteMarker2[ByteMarker2["BigInt"] = 1] = "BigInt";
    ByteMarker2[ByteMarker2["Boolean"] = 2] = "Boolean";
    ByteMarker2[ByteMarker2["Date"] = 3] = "Date";
    ByteMarker2[ByteMarker2["Constructor"] = 4] = "Constructor";
    ByteMarker2[ByteMarker2["Function"] = 5] = "Function";
    ByteMarker2[ByteMarker2["Null"] = 6] = "Null";
    ByteMarker2[ByteMarker2["Number"] = 7] = "Number";
    ByteMarker2[ByteMarker2["Object"] = 8] = "Object";
    ByteMarker2[ByteMarker2["RegExp"] = 9] = "RegExp";
    ByteMarker2[ByteMarker2["String"] = 10] = "String";
    ByteMarker2[ByteMarker2["Symbol"] = 11] = "Symbol";
    ByteMarker2[ByteMarker2["TypeArray"] = 12] = "TypeArray";
    ByteMarker2[ByteMarker2["Undefined"] = 13] = "Undefined";
  })(ByteMarker || (ByteMarker = {}));
  var Accumulator = BigInt("14695981039346656037");
  var [Prime, Size] = [BigInt("1099511628211"), BigInt(
    "18446744073709551616"
    /* 2 ^ 64 */
  )];
  var Bytes = Array.from({ length: 256 }).map((_, i) => BigInt(i));
  var F64 = new Float64Array(1);
  var F64In = new DataView(F64.buffer);
  var F64Out = new Uint8Array(F64.buffer);
  function FNV1A64_OP(byte) {
    Accumulator = Accumulator ^ Bytes[byte];
    Accumulator = Accumulator * Prime % Size;
  }
  function FromArray(value) {
    FNV1A64_OP(ByteMarker.Array);
    for (const item of value) {
      FromValue(item);
    }
  }
  function FromBigInt(value) {
    FNV1A64_OP(ByteMarker.BigInt);
    F64In.setBigInt64(0, value);
    for (const byte of F64Out) {
      FNV1A64_OP(byte);
    }
  }
  function FromBoolean(value) {
    FNV1A64_OP(ByteMarker.Boolean);
    FNV1A64_OP(value ? 1 : 0);
  }
  function FromConstructor(value) {
    FNV1A64_OP(ByteMarker.Constructor);
    FromValue(value.toString());
  }
  function FromDate(value) {
    FNV1A64_OP(ByteMarker.Date);
    FromValue(value.getTime());
  }
  function FromFunction(value) {
    FNV1A64_OP(ByteMarker.Function);
    FromValue(value.toString());
  }
  function FromNull(_value) {
    FNV1A64_OP(ByteMarker.Null);
  }
  function FromNumber(value) {
    FNV1A64_OP(ByteMarker.Number);
    F64In.setFloat64(
      0,
      value,
      true
      /* little-endian */
    );
    for (const byte of F64Out) {
      FNV1A64_OP(byte);
    }
  }
  function FromObject(value) {
    FNV1A64_OP(ByteMarker.Object);
    for (const key of InstanceKeys(value).sort()) {
      FromValue(key);
      FromValue(value[key]);
    }
  }
  function FromRegExp(value) {
    FNV1A64_OP(ByteMarker.RegExp);
    FromString(value.toString());
  }
  var encoder = new TextEncoder();
  function FromString(value) {
    FNV1A64_OP(ByteMarker.String);
    for (const byte of encoder.encode(value)) {
      FNV1A64_OP(byte);
    }
  }
  function FromSymbol(value) {
    FNV1A64_OP(ByteMarker.Symbol);
    FromValue(value.toString());
  }
  function FromTypeArray(value) {
    FNV1A64_OP(ByteMarker.TypeArray);
    const buffer = new Uint8Array(value.buffer);
    for (let i = 0; i < buffer.length; i++) {
      FNV1A64_OP(buffer[i]);
    }
  }
  function FromUndefined(_value) {
    return FNV1A64_OP(ByteMarker.Undefined);
  }
  function FromValue(value) {
    return globals_exports.IsTypeArray(value) ? FromTypeArray(value) : globals_exports.IsDate(value) ? FromDate(value) : globals_exports.IsRegExp(value) ? FromRegExp(value) : globals_exports.IsBoolean(value) ? FromBoolean(value.valueOf()) : globals_exports.IsString(value) ? FromString(value.valueOf()) : globals_exports.IsNumber(value) ? FromNumber(value.valueOf()) : IsIEEE754(value) ? FromNumber(value) : guard_exports.IsArray(value) ? FromArray(value) : guard_exports.IsBoolean(value) ? FromBoolean(value) : guard_exports.IsBigInt(value) ? FromBigInt(value) : guard_exports.IsConstructor(value) ? FromConstructor(value) : guard_exports.IsNull(value) ? FromNull(value) : guard_exports.IsObject(value) ? FromObject(value) : guard_exports.IsString(value) ? FromString(value) : guard_exports.IsSymbol(value) ? FromSymbol(value) : guard_exports.IsUndefined(value) ? FromUndefined(value) : guard_exports.IsFunction(value) ? FromFunction(value) : Unreachable();
  }
  function HashCode(value) {
    Accumulator = BigInt("14695981039346656037");
    FromValue(value);
    return Accumulator;
  }
  function Hash(value) {
    return HashCode(value).toString(16).padStart(16, "0");
  }

  // node_modules/typebox/build/schema/engine/uniqueItems.mjs
  function IsValid5(schema) {
    return !guard_exports.IsEqual(schema.uniqueItems, false);
  }
  function CheckUniqueItems(_stack, _context, schema, value) {
    if (!IsValid5(schema))
      return true;
    const set = new Set(value.map(hash_exports.Hash)).size;
    const isLength = value.length;
    return guard_exports.IsEqual(set, isLength);
  }
  function ErrorUniqueItems(_stack, context, schemaPath, instancePath, schema, value) {
    if (!IsValid5(schema))
      return true;
    const set = /* @__PURE__ */ new Set();
    const duplicateItems = value.reduce((result, value2, index) => {
      const hash = hash_exports.Hash(value2);
      if (set.has(hash))
        return [...result, index];
      set.add(hash);
      return result;
    }, []);
    const isUniqueItems = guard_exports.IsEqual(duplicateItems.length, 0);
    return isUniqueItems || context.AddError({
      keyword: "uniqueItems",
      schemaPath,
      instancePath,
      params: { duplicateItems }
    });
  }

  // node_modules/typebox/build/schema/engine/schema.mjs
  function CheckSchemaPushStack(stack, context, schema, value) {
    return context.Push() && CheckSchema(stack, context, schema, value) && context.Pop();
  }
  function CheckSchema(stack, context, schema, value) {
    stack.Push(schema);
    const result = IsSchemaBoolean(schema) ? CheckSchemaBoolean(stack, context, schema, value) : (!IsType(schema) || CheckType(stack, context, schema, value)) && (!(guard_exports.IsObject(value) && !guard_exports.IsArray(value)) || (!IsRequired(schema) || CheckRequired(stack, context, schema, value)) && (!IsAdditionalProperties(schema) || CheckAdditionalProperties(stack, context, schema, value)) && (!IsDependencies(schema) || CheckDependencies(stack, context, schema, value)) && (!IsDependentRequired(schema) || CheckDependentRequired(stack, context, schema, value)) && (!IsDependentSchemas(schema) || CheckDependentSchemas(stack, context, schema, value)) && (!IsPatternProperties(schema) || CheckPatternProperties(stack, context, schema, value)) && (!IsProperties(schema) || CheckProperties(stack, context, schema, value)) && (!IsPropertyNames(schema) || CheckPropertyNames(stack, context, schema, value)) && (!IsMinProperties(schema) || CheckMinProperties(stack, context, schema, value)) && (!IsMaxProperties(schema) || CheckMaxProperties(stack, context, schema, value))) && (!guard_exports.IsArray(value) || (!IsAdditionalItems(schema) || CheckAdditionalItems(stack, context, schema, value)) && (!IsContains(schema) || CheckContains(stack, context, schema, value)) && (!IsItems(schema) || CheckItems(stack, context, schema, value)) && (!IsMaxContains(schema) || CheckMaxContains(stack, context, schema, value)) && (!IsMaxItems(schema) || CheckMaxItems(stack, context, schema, value)) && (!IsMinContains(schema) || CheckMinContains(stack, context, schema, value)) && (!IsMinItems(schema) || CheckMinItems(stack, context, schema, value)) && (!IsPrefixItems(schema) || CheckPrefixItems(stack, context, schema, value)) && (!IsUniqueItems(schema) || CheckUniqueItems(stack, context, schema, value))) && (!guard_exports.IsString(value) || (!IsMaxLength3(schema) || CheckMaxLength(stack, context, schema, value)) && (!IsMinLength3(schema) || CheckMinLength(stack, context, schema, value)) && (!IsFormat(schema) || CheckFormat(stack, context, schema, value)) && (!IsPattern(schema) || CheckPattern(stack, context, schema, value))) && (!(guard_exports.IsNumber(value) || guard_exports.IsBigInt(value)) || (!IsExclusiveMaximum(schema) || CheckExclusiveMaximum(stack, context, schema, value)) && (!IsExclusiveMinimum(schema) || CheckExclusiveMinimum(stack, context, schema, value)) && (!IsMaximum(schema) || CheckMaximum(stack, context, schema, value)) && (!IsMinimum(schema) || CheckMinimum(stack, context, schema, value)) && (!IsMultipleOf2(schema) || CheckMultipleOf(stack, context, schema, value))) && (!IsRef(schema) || CheckRef(stack, context, schema, value)) && (!IsRecursiveRef(schema) || CheckRecursiveRef(stack, context, schema, value)) && (!IsDynamicRef(schema) || CheckDynamicRef(stack, context, schema, value)) && (!IsConst(schema) || CheckConst(stack, context, schema, value)) && (!IsEnum(schema) || CheckEnum(stack, context, schema, value)) && (!IsIf(schema) || CheckIf(stack, context, schema, value)) && (!IsNot(schema) || CheckNot(stack, context, schema, value)) && (!IsAllOf(schema) || CheckAllOf(stack, context, schema, value)) && (!IsAnyOf(schema) || CheckAnyOf(stack, context, schema, value)) && (!IsOneOf(schema) || CheckOneOf(stack, context, schema, value)) && (!IsUnevaluatedItems(schema) || (!guard_exports.IsArray(value) || CheckUnevaluatedItems(stack, context, schema, value))) && (!IsUnevaluatedProperties(schema) || (!guard_exports.IsObject(value) || CheckUnevaluatedProperties(stack, context, schema, value))) && (!IsRefine(schema) || CheckRefine(stack, context, schema, value));
    stack.Pop(schema);
    return result;
  }
  function ErrorSchemaPushStack(stack, context, schemaPath, instancePath, schema, value) {
    return context.Push() && ErrorSchema(stack, context, schemaPath, instancePath, schema, value) && context.Pop();
  }
  function ErrorSchema(stack, context, schemaPath, instancePath, schema, value) {
    if (context.AtCapacity())
      return false;
    stack.Push(schema);
    const result = IsSchemaBoolean(schema) ? ErrorSchemaBoolean(stack, context, schemaPath, instancePath, schema, value) : !!(+(!IsType(schema) || ErrorType(stack, context, schemaPath, instancePath, schema, value)) & +(!(guard_exports.IsObject(value) && !guard_exports.IsArray(value)) || !!(+(!IsRequired(schema) || ErrorRequired(stack, context, schemaPath, instancePath, schema, value)) & +(!IsAdditionalProperties(schema) || ErrorAdditionalProperties(stack, context, schemaPath, instancePath, schema, value)) & +(!IsDependencies(schema) || ErrorDependencies(stack, context, schemaPath, instancePath, schema, value)) & +(!IsDependentRequired(schema) || ErrorDependentRequired(stack, context, schemaPath, instancePath, schema, value)) & +(!IsDependentSchemas(schema) || ErrorDependentSchemas(stack, context, schemaPath, instancePath, schema, value)) & +(!IsPatternProperties(schema) || ErrorPatternProperties(stack, context, schemaPath, instancePath, schema, value)) & +(!IsProperties(schema) || ErrorProperties(stack, context, schemaPath, instancePath, schema, value)) & +(!IsPropertyNames(schema) || ErrorPropertyNames(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMinProperties(schema) || ErrorMinProperties(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMaxProperties(schema) || ErrorMaxProperties(stack, context, schemaPath, instancePath, schema, value)))) & +(!guard_exports.IsArray(value) || !!(+(!IsAdditionalItems(schema) || ErrorAdditionalItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsContains(schema) || ErrorContains(stack, context, schemaPath, instancePath, schema, value)) & +(!IsItems(schema) || ErrorItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMaxContains(schema) || ErrorMaxContains(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMaxItems(schema) || ErrorMaxItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMinContains(schema) || ErrorMinContains(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMinItems(schema) || ErrorMinItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsPrefixItems(schema) || ErrorPrefixItems(stack, context, schemaPath, instancePath, schema, value)) & +(!IsUniqueItems(schema) || ErrorUniqueItems(stack, context, schemaPath, instancePath, schema, value)))) & +(!guard_exports.IsString(value) || !!(+(!IsMaxLength3(schema) || ErrorMaxLength(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMinLength3(schema) || ErrorMinLength(stack, context, schemaPath, instancePath, schema, value)) & +(!IsFormat(schema) || ErrorFormat(stack, context, schemaPath, instancePath, schema, value)) & +(!IsPattern(schema) || ErrorPattern(stack, context, schemaPath, instancePath, schema, value)))) & +(!(guard_exports.IsNumber(value) || guard_exports.IsBigInt(value)) || !!(+(!IsExclusiveMaximum(schema) || ErrorExclusiveMaximum(stack, context, schemaPath, instancePath, schema, value)) & +(!IsExclusiveMinimum(schema) || ErrorExclusiveMinimum(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMaximum(schema) || ErrorMaximum(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMinimum(schema) || ErrorMinimum(stack, context, schemaPath, instancePath, schema, value)) & +(!IsMultipleOf2(schema) || ErrorMultipleOf(stack, context, schemaPath, instancePath, schema, value)))) & +(!IsRef(schema) || ErrorRef(stack, context, schemaPath, instancePath, schema, value)) & +(!IsRecursiveRef(schema) || ErrorRecursiveRef(stack, context, schemaPath, instancePath, schema, value)) & +(!IsDynamicRef(schema) || ErrorDynamicRef(stack, context, schemaPath, instancePath, schema, value)) & +(!IsConst(schema) || ErrorConst(stack, context, schemaPath, instancePath, schema, value)) & +(!IsEnum(schema) || ErrorEnum(stack, context, schemaPath, instancePath, schema, value)) & +(!IsIf(schema) || ErrorIf(stack, context, schemaPath, instancePath, schema, value)) & +(!IsNot(schema) || ErrorNot(stack, context, schemaPath, instancePath, schema, value)) & +(!IsAllOf(schema) || ErrorAllOf(stack, context, schemaPath, instancePath, schema, value)) & +(!IsAnyOf(schema) || ErrorAnyOf(stack, context, schemaPath, instancePath, schema, value)) & +(!IsOneOf(schema) || ErrorOneOf(stack, context, schemaPath, instancePath, schema, value)) & +(!IsUnevaluatedItems(schema) || (!guard_exports.IsArray(value) || ErrorUnevaluatedItems(stack, context, schemaPath, instancePath, schema, value))) & +(!IsUnevaluatedProperties(schema) || (!guard_exports.IsObject(value) || ErrorUnevaluatedProperties(stack, context, schemaPath, instancePath, schema, value)))) && (!IsRefine(schema) || ErrorRefine(stack, context, schemaPath, instancePath, schema, value));
    stack.Pop(schema);
    return result;
  }

  // node_modules/typebox/build/schema/resolve/resolve.mjs
  var resolve_exports = {};
  __export(resolve_exports, {
    Base: () => Base,
    DefaultBase: () => DefaultBase,
    DynamicRef: () => DynamicRef,
    Ref: () => Ref,
    ResolveDynamicRef: () => ResolveDynamicRef,
    ResolveRecursiveRef: () => ResolveRecursiveRef,
    ResolveRef: () => ResolveRef,
    Resource: () => Resource
  });

  // node_modules/typebox/build/schema/pointer/pointer.mjs
  var pointer_exports = {};
  __export(pointer_exports, {
    Delete: () => Delete,
    Get: () => Get3,
    Has: () => Has2,
    Indices: () => Indices,
    Set: () => Set4
  });
  function AssertNotRoot(indices) {
    if (indices.length === 0)
      throw Error("Cannot set root");
  }
  function AssertCanSet(value) {
    if (!guard_exports.IsObject(value))
      throw Error("Cannot set value");
  }
  function AssertIndex(index) {
    if (guard_exports.IsUnsafePropertyKey(index))
      throw Error("Pointer contains unsafe property key");
  }
  function AssertIndices(indices) {
    for (const index of indices)
      AssertIndex(index);
  }
  function IsNumericIndex(index) {
    return /^(0|[1-9]\d*)$/.test(index);
  }
  function TakeIndexRight(indices) {
    return [
      indices.slice(0, indices.length - 1),
      indices.slice(indices.length - 1)[0]
    ];
  }
  function HasIndex(index, value) {
    return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, index);
  }
  function GetIndex(index, value) {
    return guard_exports.IsObject(value) && !guard_exports.IsUnsafePropertyKey(index) ? value[index] : void 0;
  }
  function GetIndices(indices, value) {
    return indices.reduce((value2, index) => GetIndex(index, value2), value);
  }
  function Indices(pointer) {
    if (guard_exports.IsEqual(pointer.length, 0))
      return [];
    const indices = pointer.split("/").map((index) => index.replace(/~1/g, "/").replace(/~0/g, "~"));
    return indices.length > 0 && indices[0] === "" ? indices.slice(1) : indices;
  }
  function Has2(value, pointer) {
    let current = value;
    return Indices(pointer).every((index) => {
      if (!HasIndex(index, current))
        return false;
      current = current[index];
      return true;
    });
  }
  function Get3(value, pointer) {
    const indices = Indices(pointer);
    return GetIndices(indices, value);
  }
  function Set4(value, pointer, next) {
    const indices = Indices(pointer);
    AssertNotRoot(indices);
    AssertIndices(indices);
    const [head, index] = TakeIndexRight(indices);
    const parent = GetIndices(head, value);
    AssertCanSet(parent);
    parent[index] = next;
    return value;
  }
  function Delete(value, pointer) {
    const indices = Indices(pointer);
    AssertNotRoot(indices);
    AssertIndices(indices);
    const [head, index] = TakeIndexRight(indices);
    const parent = GetIndices(head, value);
    AssertCanSet(parent);
    if (guard_exports.IsArray(parent) && IsNumericIndex(index)) {
      parent.splice(+index, 1);
    } else {
      delete parent[index];
    }
    return value;
  }

  // node_modules/typebox/build/schema/resolve/resolve.mjs
  var DefaultBase = "https://json-schema.org";
  function FindDynamicAnchor(schema, name) {
    if (guard_exports.IsObject(schema) && IsDynamicAnchor(schema) && guard_exports.IsEqual(schema.$dynamicAnchor, name)) {
      return schema;
    }
    if (guard_exports.IsObject(schema)) {
      for (const key of guard_exports.Keys(schema)) {
        const result = FindDynamicAnchor(schema[key], name);
        if (result)
          return result;
      }
    }
    return void 0;
  }
  function FindBase(schema, base, target) {
    if (guard_exports.IsEqual(schema, target))
      return base.href;
    const nextBase = IsSchemaObject(schema) && IsId(schema) ? new URL(schema.$id, base.href) : base;
    if (guard_exports.IsArray(schema)) {
      for (const item of schema) {
        const result = FindBase(item, nextBase, target);
        if (!guard_exports.IsUndefined(result))
          return result;
      }
    } else if (guard_exports.IsObject(schema)) {
      for (const key of guard_exports.Keys(schema)) {
        const result = FindBase(schema[key], nextBase, target);
        if (!guard_exports.IsUndefined(result))
          return result;
      }
    }
    return void 0;
  }
  function MatchId(schema, base, ref) {
    if (guard_exports.IsEqual(schema.$id, ref.hash))
      return schema;
    const absoluteRef = new URL(ref.href, base.href);
    if (guard_exports.IsEqual(base.pathname, absoluteRef.pathname))
      return ref.hash.startsWith("#") ? MatchHash(schema, ref) : schema;
    return void 0;
  }
  function MatchAnchor(schema, base, ref) {
    const absoluteAnchor = new URL(`#${schema.$anchor}`, base.href);
    const absoluteRef = new URL(ref.href, base.href);
    return guard_exports.IsEqual(absoluteAnchor.href, absoluteRef.href) ? schema : void 0;
  }
  function MatchDynamicAnchor(schema, base, ref) {
    const absoluteAnchor = new URL(`#${schema.$dynamicAnchor}`, base.href);
    const absoluteRef = new URL(ref.href, base.href);
    const isMatch = guard_exports.IsEqual(absoluteAnchor.href, absoluteRef.href);
    return isMatch ? schema : void 0;
  }
  function MatchHash(schema, ref) {
    if (ref.href.endsWith("#"))
      return schema;
    if (!ref.hash.startsWith("#"))
      return void 0;
    const fragment = decodeURIComponent(ref.hash.slice(1));
    if (!fragment.startsWith("/"))
      return void 0;
    const result = pointer_exports.Get(schema, fragment);
    return result;
  }
  function Match2(schema, base, ref) {
    if (IsId(schema)) {
      const result = MatchId(schema, base, ref);
      if (!guard_exports.IsUndefined(result))
        return result;
    }
    if (IsAnchor(schema)) {
      const result = MatchAnchor(schema, base, ref);
      if (!guard_exports.IsUndefined(result))
        return result;
    }
    if (IsDynamicAnchor(schema)) {
      const result = MatchDynamicAnchor(schema, base, ref);
      if (!guard_exports.IsUndefined(result))
        return result;
    }
    return MatchHash(schema, ref);
  }
  function FromArray2(schema, base, ref) {
    return schema.reduce((result, item) => {
      const match = FromValue2(item, base, ref);
      return !guard_exports.IsUndefined(match) ? match : result;
    }, void 0);
  }
  function SkipProperty(key) {
    return guard_exports.IsEqual(key, "const") || guard_exports.IsEqual(key, "enum");
  }
  function FromObject2(schema, base, ref) {
    return guard_exports.Keys(schema).reduce((result, key) => {
      if (SkipProperty(key))
        return result;
      const match = FromValue2(schema[key], base, ref);
      return !guard_exports.IsUndefined(match) ? match : result;
    }, void 0);
  }
  function FromValue2(schema, base, ref) {
    const nextBase = IsSchemaObject(schema) && IsId(schema) ? new URL(schema.$id, base.href) : base;
    if (IsSchemaObject(schema)) {
      const result = Match2(schema, nextBase, ref);
      if (!guard_exports.IsUndefined(result))
        return result;
    }
    if (guard_exports.IsArray(schema))
      return FromArray2(schema, nextBase, ref);
    if (guard_exports.IsObject(schema))
      return FromObject2(schema, nextBase, ref);
    return void 0;
  }
  function Base(schema, base, target) {
    return FindBase(schema, new URL(base || ".", DefaultBase), target);
  }
  function Resource(context, schema, base, ref) {
    const result = Ref(context, schema, base, ref, false);
    return IsSchemaObject(result) && IsId(result) ? result : void 0;
  }
  function CanonicalHref(url) {
    return url.href.split("#")[0];
  }
  function RefContext(context, ref) {
    return guard_exports.HasPropertyKey(context, ref) ? context[ref] : void 0;
  }
  function RefLocal(schema, base, ref) {
    return FromValue2(schema, base, ref);
  }
  function RefRemote(context, base, ref) {
    const canonicalHref = CanonicalHref(ref);
    if (guard_exports.IsEqual(canonicalHref, CanonicalHref(base)))
      return void 0;
    if (!guard_exports.HasPropertyKey(context, canonicalHref))
      return void 0;
    const remoteSchema = context[canonicalHref];
    const remoteBase = IsSchemaObject(remoteSchema) && IsId(remoteSchema) ? new URL(remoteSchema.$id, canonicalHref) : new URL(canonicalHref);
    const result = guard_exports.IsEqual(ref.hash, "") ? remoteSchema : FromValue2(remoteSchema, remoteBase, ref);
    return result;
  }
  function LegacyRetrievedResource(root, lexicalSchema, referenceBase, ref, schema) {
    if (!ref.$ref.startsWith("#"))
      return void 0;
    if (guard_exports.HasPropertyKey(root, "$schema"))
      return void 0;
    const targetBase = Base(lexicalSchema, referenceBase, schema);
    if (guard_exports.IsUndefined(targetBase) || guard_exports.IsEqual(targetBase, referenceBase))
      return void 0;
    return { target: schema, base: targetBase, root: lexicalSchema };
  }
  function RemoteRetrievedResource(context, canonical, schema) {
    const remoteRoot = context[canonical];
    if (!IsSchemaObject(remoteRoot))
      return void 0;
    return { target: schema, base: canonical, root: remoteRoot };
  }
  function FindRetrievedResource(stackframe, ref, schema, canonical, isRemote) {
    const remote = isRemote ? RemoteRetrievedResource(stackframe.context, canonical, schema) : void 0;
    if (!guard_exports.IsUndefined(remote))
      return remote;
    return LegacyRetrievedResource(stackframe.root, stackframe.lexicalSchema, stackframe.referenceBase, ref, schema);
  }
  function FindResolvedResource(context, root, referenceBase, canonical, schema, ids) {
    if (IsId(schema))
      return void 0;
    const resource = Resource(context, root, referenceBase, canonical);
    if (!resource || ids.includes(resource))
      return void 0;
    return { target: schema, resource };
  }
  function Ref(remotes, schema, base, ref, applySchemaId = true) {
    const initialBase = new URL(base || ".", DefaultBase);
    const resolvedBase = applySchemaId && IsId(schema) ? new URL(schema.$id, initialBase) : initialBase;
    const initialRef = new URL(ref, resolvedBase.href);
    return RefContext(remotes, ref) ?? RefLocal(schema, resolvedBase, initialRef) ?? RefRemote(remotes, resolvedBase, initialRef);
  }
  function DynamicRef(context, root, base, schema, dynamicRef, dynamicAnchors) {
    const initialBase = new URL(base || ".", DefaultBase);
    const fragmentRoot = dynamicRef.$dynamicRef.startsWith("#") ? schema : root;
    const fragmentTarget = Ref(context, fragmentRoot, base, dynamicRef.$dynamicRef, false);
    if (guard_exports.IsUndefined(fragmentTarget)) {
      const fragment2 = new URL(dynamicRef.$dynamicRef, initialBase).hash;
      if (!fragment2.startsWith("#/") && fragment2.startsWith("#")) {
        const name = decodeURIComponent(fragment2.slice(1));
        const anchorTarget2 = dynamicAnchors.find((anchor) => guard_exports.IsEqual(anchor.$dynamicAnchor, name)) ?? FindDynamicAnchor(root, name);
        return anchorTarget2;
      }
      return void 0;
    }
    if (!IsSchemaObject(fragmentTarget) || !IsDynamicAnchor(fragmentTarget))
      return fragmentTarget;
    const fragment = new URL(dynamicRef.$dynamicRef, initialBase).hash;
    if (fragment.startsWith("#/"))
      return fragmentTarget;
    const anchorTarget = dynamicAnchors.find((anchor) => guard_exports.IsEqual(anchor.$dynamicAnchor, fragmentTarget.$dynamicAnchor));
    return anchorTarget ?? fragmentTarget;
  }
  function ResolveRef(stackframe, ref) {
    const source = stackframe.inRetrievedFrame ? stackframe.lexicalSchema : stackframe.root;
    const refRoot = ref.$ref.startsWith("#") ? stackframe.lexicalSchema : source;
    const schema = Ref(stackframe.context, refRoot, stackframe.referenceBase, ref.$ref, false);
    if (!schema || !IsSchemaObject(schema))
      return { schema };
    const canonical = new URL(ref.$ref, stackframe.referenceBase).href.split("#")[0];
    const isRemote = !guard_exports.IsEqual(canonical, stackframe.resourceBase);
    const retrievedResource = FindRetrievedResource(stackframe, ref, schema, canonical, isRemote);
    const resolvedResource = isRemote ? FindResolvedResource(stackframe.context, stackframe.root, stackframe.referenceBase, canonical, schema, stackframe.ids) : void 0;
    return { schema, retrievedResource, resolvedResource };
  }
  function ResolveRecursiveRef(stackframe, recursiveRef) {
    const refRoot = IsRecursiveAnchorTrue(stackframe.lexicalSchema) ? stackframe.recursiveAnchors[0] : stackframe.lexicalSchema;
    return Ref(stackframe.context, refRoot, stackframe.lexicalBase, recursiveRef.$recursiveRef, false);
  }
  function ResolveDynamicRef(stackframe, dynamicRef) {
    return DynamicRef(stackframe.context, stackframe.root, stackframe.lexicalBase, stackframe.lexicalSchema, dynamicRef, stackframe.dynamicAnchors);
  }

  // node_modules/typebox/build/schema/engine/_stack.mjs
  var __classPrivateFieldGet = function(receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
  };
  var _Stack_instances;
  var _Stack_StackFrame;
  var _Stack_ApplyRefResult;
  var _Stack_BuildBase;
  var _Stack_ResourceBaseURL;
  var _Stack_ReferenceBaseURL;
  var _Stack_LexicalSchema;
  var _Stack_RegisterResourceAnchorArray;
  var _Stack_UnregisterResourceAnchorArray;
  var _Stack_RegisterResourceAnchors;
  var _Stack_UnregisterResourceAnchors;
  var _Stack_RegisterResource;
  var _Stack_UnregisterResource;
  var _Stack_EnterResolvedResource;
  var _Stack_ExitResolvedResource;
  var Stack = class {
    constructor(context, schema) {
      _Stack_instances.add(this);
      this.context = context;
      this.schema = schema;
      this.ids = [];
      this.resourceIds = [];
      this.anchors = [];
      this.recursiveAnchors = [];
      this.dynamicAnchors = [];
      this.retrievedResources = /* @__PURE__ */ new Map();
      this.retrievedFrames = [];
      this.resolvedResources = /* @__PURE__ */ new Map();
      this.pendingResource = true;
    }
    // ----------------------------------------------------------------
    // LexicalBaseURL
    // ----------------------------------------------------------------
    LexicalBaseURL() {
      return __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_BuildBase).call(this, this.ids);
    }
    // ----------------------------------------------------------------
    // Push
    // ----------------------------------------------------------------
    Push(schema) {
      if (!IsSchemaObject(schema))
        return;
      if (IsId(schema))
        __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_RegisterResource).call(this, schema);
      if (IsAnchor(schema))
        this.anchors.push(schema);
      if (IsRecursiveAnchorTrue(schema))
        this.recursiveAnchors.push(schema);
      if (IsDynamicAnchor(schema))
        this.dynamicAnchors.push(schema);
      const retrievedResource = this.retrievedResources.get(schema);
      if (retrievedResource) {
        this.retrievedFrames.push({
          schema: retrievedResource.root,
          base: retrievedResource.base,
          idDepth: this.ids.length,
          resourceDepth: this.resourceIds.length
        });
      }
    }
    // ----------------------------------------------------------------
    // Pop
    // ----------------------------------------------------------------
    Pop(schema) {
      if (!IsSchemaObject(schema))
        return;
      if (IsId(schema))
        __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_UnregisterResource).call(this, schema);
      if (IsAnchor(schema))
        this.anchors.pop();
      if (IsRecursiveAnchorTrue(schema))
        this.recursiveAnchors.pop();
      if (IsDynamicAnchor(schema))
        this.dynamicAnchors.pop();
      if (this.retrievedResources.has(schema))
        this.retrievedFrames.pop();
      __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_ExitResolvedResource).call(this, schema);
    }
    // ----------------------------------------------------------------
    // Ref
    // ----------------------------------------------------------------
    Ref(ref) {
      const result = resolve_exports.ResolveRef(__classPrivateFieldGet(this, _Stack_instances, "m", _Stack_StackFrame).call(this), ref);
      __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_ApplyRefResult).call(this, result);
      return result.schema;
    }
    // ----------------------------------------------------------------
    // RecursiveRef
    // ----------------------------------------------------------------
    RecursiveRef(recursiveRef) {
      const result = resolve_exports.ResolveRecursiveRef(__classPrivateFieldGet(this, _Stack_instances, "m", _Stack_StackFrame).call(this), recursiveRef);
      if (result)
        this.pendingResource = true;
      return result;
    }
    // ----------------------------------------------------------------
    // DynamicRef
    // ----------------------------------------------------------------
    DynamicRef(dynamicRef) {
      const result = resolve_exports.ResolveDynamicRef(__classPrivateFieldGet(this, _Stack_instances, "m", _Stack_StackFrame).call(this), dynamicRef);
      if (result)
        this.pendingResource = true;
      return result;
    }
  };
  _Stack_instances = /* @__PURE__ */ new WeakSet(), _Stack_StackFrame = function _Stack_StackFrame2() {
    return {
      context: this.context,
      root: this.schema,
      ids: this.ids,
      lexicalSchema: __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_LexicalSchema).call(this),
      lexicalBase: this.LexicalBaseURL(),
      referenceBase: __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_ReferenceBaseURL).call(this),
      resourceBase: __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_ResourceBaseURL).call(this),
      recursiveAnchors: this.recursiveAnchors,
      dynamicAnchors: this.dynamicAnchors,
      inRetrievedFrame: this.retrievedFrames.length > 0
    };
  }, _Stack_ApplyRefResult = function _Stack_ApplyRefResult2(result) {
    if (!guard_exports.IsUndefined(result.schema))
      this.pendingResource = true;
    if (!guard_exports.IsUndefined(result.resolvedResource)) {
      __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_EnterResolvedResource).call(this, result.resolvedResource.target, result.resolvedResource.resource);
    }
    if (!guard_exports.IsUndefined(result.retrievedResource)) {
      this.retrievedResources.set(result.retrievedResource.target, {
        base: result.retrievedResource.base,
        root: result.retrievedResource.root
      });
    }
  }, _Stack_BuildBase = function _Stack_BuildBase2(stack) {
    const frame = this.retrievedFrames[this.retrievedFrames.length - 1];
    const base = frame ? new URL(frame.base) : new URL(resolve_exports.DefaultBase);
    const scoped = frame ? stack.slice(frame.idDepth) : stack;
    return scoped.reduce((result, schema) => new URL(schema.$id, result), base).href;
  }, _Stack_ResourceBaseURL = function _Stack_ResourceBaseURL2() {
    const frame = this.retrievedFrames[this.retrievedFrames.length - 1];
    if (!frame)
      return __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_BuildBase).call(this, this.resourceIds);
    return this.resourceIds.slice(frame.resourceDepth).reduce((result, schema) => new URL(schema.$id, result), new URL(frame.base)).href;
  }, _Stack_ReferenceBaseURL = function _Stack_ReferenceBaseURL2() {
    if (this.retrievedFrames.length > 0)
      return __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_ResourceBaseURL).call(this);
    const lexical = this.ids[this.ids.length - 1];
    if (lexical && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(lexical.$id))
      return this.LexicalBaseURL();
    return __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_ResourceBaseURL).call(this);
  }, _Stack_LexicalSchema = function _Stack_LexicalSchema2() {
    const frame = this.retrievedFrames[this.retrievedFrames.length - 1];
    if (frame)
      return this.ids.length > frame.idDepth ? this.ids[this.ids.length - 1] : frame.schema;
    return this.ids.length > 0 ? this.ids[this.ids.length - 1] : this.schema;
  }, _Stack_RegisterResourceAnchorArray = function _Stack_RegisterResourceAnchorArray2(schema) {
    schema.forEach((schema2) => __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_RegisterResourceAnchors).call(this, schema2, false));
  }, _Stack_UnregisterResourceAnchorArray = function _Stack_UnregisterResourceAnchorArray2(schema) {
    schema.forEach((schema2) => __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_UnregisterResourceAnchors).call(this, schema2, false));
  }, _Stack_RegisterResourceAnchors = function _Stack_RegisterResourceAnchors2(schema, isRoot = true) {
    if (IsSchemaBoolean(schema))
      return;
    if (guard_exports.IsArray(schema))
      return __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_RegisterResourceAnchorArray).call(this, schema);
    if (!IsSchemaObject(schema))
      return;
    const current = schema;
    if (!isRoot && IsId(current))
      return;
    if (!isRoot && IsDynamicAnchor(current))
      this.dynamicAnchors.push(current);
    for (const key of guard_exports.Keys(current))
      __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_RegisterResourceAnchors2).call(this, current[key], false);
  }, _Stack_UnregisterResourceAnchors = function _Stack_UnregisterResourceAnchors2(schema, isRoot = true) {
    if (IsSchemaBoolean(schema))
      return;
    if (guard_exports.IsArray(schema))
      return __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_UnregisterResourceAnchorArray).call(this, schema);
    if (!IsSchemaObject(schema))
      return;
    const current = schema;
    if (!isRoot && IsId(current))
      return;
    if (!isRoot && IsDynamicAnchor(current))
      this.dynamicAnchors.pop();
    for (const key of guard_exports.Keys(current))
      __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_UnregisterResourceAnchors2).call(this, current[key], false);
  }, _Stack_RegisterResource = function _Stack_RegisterResource2(schema) {
    this.ids.push(schema);
    const isResource = this.pendingResource;
    this.pendingResource = false;
    if (isResource)
      this.resourceIds.push(schema);
    __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_RegisterResourceAnchors).call(this, schema, true);
  }, _Stack_UnregisterResource = function _Stack_UnregisterResource2(schema) {
    this.ids.pop();
    const isResource = this.resourceIds.length > 0 && guard_exports.IsEqual(this.resourceIds[this.resourceIds.length - 1], schema);
    if (isResource)
      this.resourceIds.pop();
    __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_UnregisterResourceAnchors).call(this, schema, true);
  }, _Stack_EnterResolvedResource = function _Stack_EnterResolvedResource2(target, resource) {
    __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_RegisterResource).call(this, resource);
    this.resolvedResources.set(target, resource);
  }, _Stack_ExitResolvedResource = function _Stack_ExitResolvedResource2(target) {
    if (!this.resolvedResources.has(target))
      return;
    const resource = this.resolvedResources.get(target);
    __classPrivateFieldGet(this, _Stack_instances, "m", _Stack_UnregisterResource).call(this, resource);
    this.resolvedResources.delete(target);
  };

  // node_modules/typebox/build/system/locale/en_US.mjs
  function en_US(error2) {
    switch (error2.keyword) {
      case "additionalProperties":
        return "must not have additional properties";
      case "anyOf":
        return "must match a schema in anyOf";
      case "boolean":
        return "schema is false";
      case "const":
        return "must be equal to constant";
      case "contains":
        return "must contain at least 1 valid item";
      case "dependencies":
        return `must have properties ${error2.params.dependencies.join(", ")} when property ${error2.params.property} is present`;
      case "dependentRequired":
        return `must have properties ${error2.params.dependencies.join(", ")} when property ${error2.params.property} is present`;
      case "enum":
        return "must be equal to one of the allowed values";
      case "exclusiveMaximum":
        return `must be ${error2.params.comparison} ${error2.params.limit}`;
      case "exclusiveMinimum":
        return `must be ${error2.params.comparison} ${error2.params.limit}`;
      case "format":
        return `must match format "${error2.params.format}"`;
      case "if":
        return `must match "${error2.params.failingKeyword}" schema`;
      case "maxItems":
        return `must not have more than ${error2.params.limit} items`;
      case "maxLength":
        return `must not have more than ${error2.params.limit} characters`;
      case "maxProperties":
        return `must not have more than ${error2.params.limit} properties`;
      case "maximum":
        return `must be ${error2.params.comparison} ${error2.params.limit}`;
      case "minItems":
        return `must not have fewer than ${error2.params.limit} items`;
      case "minLength":
        return `must not have fewer than ${error2.params.limit} characters`;
      case "minProperties":
        return `must not have fewer than ${error2.params.limit} properties`;
      case "minimum":
        return `must be ${error2.params.comparison} ${error2.params.limit}`;
      case "multipleOf":
        return `must be multiple of ${error2.params.multipleOf}`;
      case "not":
        return "must not be valid";
      case "oneOf":
        return "must match exactly one schema in oneOf";
      case "pattern":
        return `must match pattern "${error2.params.pattern}"`;
      case "propertyNames":
        return `property names ${error2.params.propertyNames.join(", ")} are invalid`;
      case "required":
        return `must have required properties ${error2.params.requiredProperties.join(", ")}`;
      case "type":
        return typeof error2.params.type === "string" ? `must be ${error2.params.type}` : `must be either ${error2.params.type.join(" or ")}`;
      case "unevaluatedItems":
        return "must not have unevaluated items";
      case "unevaluatedProperties":
        return "must not have unevaluated properties";
      case "uniqueItems":
        return `must not have duplicate items`;
      case "~refine":
        return error2.params.message;
      // deno-coverage-ignore - unreachable
      default:
        return "an unknown validation error occurred";
    }
  }

  // node_modules/typebox/build/system/locale/_config.mjs
  var locale = en_US;
  function Get4() {
    return locale;
  }

  // node_modules/typebox/build/system/memory/memory.mjs
  var memory_exports = {};
  __export(memory_exports, {
    Assign: () => Assign,
    Clone: () => Clone,
    Create: () => Create,
    Discard: () => Discard,
    Metrics: () => Metrics,
    Update: () => Update
  });

  // node_modules/typebox/build/system/memory/metrics.mjs
  var Metrics = {
    assign: 0,
    create: 0,
    clone: 0,
    discard: 0,
    update: 0
  };

  // node_modules/typebox/build/system/memory/freeze.mjs
  function Freeze(value) {
    return settings_exports.Get().immutableTypes ? Object.freeze(value) : value;
  }

  // node_modules/typebox/build/system/memory/assign.mjs
  function Assign(left, right) {
    Metrics.assign += 1;
    return Freeze({ ...left, ...right });
  }

  // node_modules/typebox/build/system/memory/clone.mjs
  function FromClassInstance(value) {
    return value;
  }
  function IsSchemaObject2(value) {
    return guard_exports.HasPropertyKey(value, "~kind") || guard_exports.HasPropertyKey(value, "~unsafe");
  }
  function FromSchemaObject(value) {
    const result = {};
    for (const key of guard_exports.Keys(value)) {
      if (guard_exports.IsUnsafePropertyKey(key))
        continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      descriptor.value = FromValue3(descriptor.value);
      if (guard_exports.IsEqual(descriptor.enumerable, true)) {
        result[key] = descriptor.value;
      } else {
        Object.defineProperty(result, key, descriptor);
      }
    }
    return result;
  }
  function FromPlainObject(value) {
    const result = {};
    for (const key of guard_exports.Keys(value)) {
      if (guard_exports.IsUnsafePropertyKey(key))
        continue;
      result[key] = FromValue3(value[key]);
    }
    for (const key of guard_exports.Symbols(value)) {
      result[key] = FromValue3(value[key]);
    }
    return result;
  }
  function FromObject3(value) {
    return guard_exports.IsClassInstance(value) ? FromClassInstance(value) : IsSchemaObject2(value) ? FromSchemaObject(value) : FromPlainObject(value);
  }
  function FromArray3(value) {
    return value.map((element) => FromValue3(element));
  }
  function FromTypedArray(value) {
    return value.slice();
  }
  function FromRegExp2(value) {
    return new RegExp(value.source, value.flags);
  }
  function FromMap(value) {
    return new Map(FromValue3([...value.entries()]));
  }
  function FromSet(value) {
    return new Set(FromValue3([...value.values()]));
  }
  function FromValue3(value) {
    return globals_exports.IsTypeArray(value) ? FromTypedArray(value) : globals_exports.IsRegExp(value) ? FromRegExp2(value) : globals_exports.IsMap(value) ? FromMap(value) : globals_exports.IsSet(value) ? FromSet(value) : guard_exports.IsArray(value) ? FromArray3(value) : guard_exports.IsObject(value) ? FromObject3(value) : value;
  }
  function Clone(value) {
    Metrics.clone += 1;
    return FromValue3(value);
  }

  // node_modules/typebox/build/system/memory/create.mjs
  function MergeHidden(left, right) {
    for (const key of Object.keys(right)) {
      Object.defineProperty(left, key, {
        configurable: true,
        writable: true,
        enumerable: false,
        value: right[key]
      });
    }
    return left;
  }
  function Merge(left, right) {
    return { ...left, ...right };
  }
  function Create(hidden, enumerable, options = {}) {
    Metrics.create += 1;
    const withOptions = Merge(enumerable, options);
    const withHidden = settings_exports.Get().enumerableKind ? Merge(withOptions, hidden) : MergeHidden(withOptions, hidden);
    return Freeze(withHidden);
  }

  // node_modules/typebox/build/system/memory/discard.mjs
  function Discard(value, propertyKeys) {
    Metrics.discard += 1;
    const result = {};
    for (const key of guard_exports.Keys(value)) {
      if (propertyKeys.includes(key))
        continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      descriptor.value = Clone(descriptor.value);
      Object.defineProperty(result, key, descriptor);
    }
    return Freeze(result);
  }

  // node_modules/typebox/build/system/memory/update.mjs
  function Update(current, hidden, enumerable) {
    Metrics.update += 1;
    const settings2 = settings_exports.Get();
    const result = Clone(current);
    for (const key of Object.keys(hidden)) {
      Object.defineProperty(result, key, {
        configurable: true,
        writable: true,
        enumerable: settings2.enumerableKind,
        value: hidden[key]
      });
    }
    for (const key of Object.keys(enumerable)) {
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: enumerable[key]
      });
    }
    return Freeze(result);
  }

  // node_modules/typebox/build/schema/errors.mjs
  function Errors(...args) {
    const [context, schema, value] = arguments_exports.Match(args, {
      3: (context2, schema2, value2) => [context2, schema2, value2],
      2: (schema2, value2) => [{}, schema2, value2]
    });
    const stack = new Stack(context, schema);
    const errorContext = new ErrorContext();
    const result = ErrorSchema(stack, errorContext, "#", "", schema, value);
    const errors = errorContext.GetErrors();
    const locale2 = Get4();
    const localized = errors.map((error2) => ({ ...error2, message: locale2(error2) }));
    return [result, localized];
  }

  // node_modules/typebox/build/schema/check.mjs
  function Check(...args) {
    const [context, schema, value] = arguments_exports.Match(args, {
      3: (context2, schema2, value2) => [context2, schema2, value2],
      2: (schema2, value2) => [{}, schema2, value2]
    });
    const stack = new Stack(context, schema);
    const checkContext = new CheckContext();
    return CheckSchema(stack, checkContext, schema, value);
  }

  // node_modules/typebox/build/value/check/check.mjs
  function Check2(...args) {
    const [context, type, value] = arguments_exports.Match(args, {
      3: (context2, type2, value2) => [context2, type2, value2],
      2: (type2, value2) => [{}, type2, value2]
    });
    return Check(context, type, value);
  }

  // node_modules/typebox/build/value/errors/errors.mjs
  function Errors2(...args) {
    const [context, type, value] = arguments_exports.Match(args, {
      3: (context2, type2, value2) => [context2, type2, value2],
      2: (type2, value2) => [{}, type2, value2]
    });
    const [_, errors] = Errors(context, type, value);
    return errors;
  }

  // node_modules/typebox/build/value/assert/assert.mjs
  var AssertError = class extends Error {
    constructor(source, value, errors) {
      super(source);
      Object.defineProperty(this, "cause", {
        value: { source, errors, value },
        writable: false,
        configurable: false,
        enumerable: false
      });
    }
  };
  function Assert(...args) {
    const [context, type, value] = arguments_exports.Match(args, {
      3: (context2, type2, value2) => [context2, type2, value2],
      2: (type2, value2) => [{}, type2, value2]
    });
    const check = Check2(context, type, value);
    if (!check)
      throw new AssertError("Assert", value, Errors2(context, type, value));
  }

  // node_modules/typebox/build/type/types/schema.mjs
  function IsKind(value, kind) {
    return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.IsEqual(value["~kind"], kind);
  }
  function IsSchema2(value) {
    return guard_exports.IsObject(value);
  }

  // node_modules/typebox/build/type/types/deferred.mjs
  function Deferred(action, parameters, options) {
    return memory_exports.Create({ "~kind": "Deferred" }, { type: "deferred", action, parameters, options }, {});
  }
  function IsDeferred(value) {
    return IsKind(value, "Deferred");
  }

  // node_modules/typebox/build/type/engine/readonly/instantiate_add.mjs
  function AddReadonlyOperation(type) {
    return memory_exports.Update(type, { "~readonly": true }, {});
  }
  function AddReadonlyAction(type, options) {
    const result = memory_exports.Update(AddReadonlyOperation(type), {}, options);
    return result;
  }
  function AddReadonlyInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return AddReadonlyAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/engine/optional/instantiate_add.mjs
  function AddOptionalOperation(type) {
    return memory_exports.Update(type, { "~optional": true }, {});
  }
  function AddOptionalAction(type, options) {
    const result = memory_exports.Update(AddOptionalOperation(type), {}, options);
    return result;
  }
  function AddOptionalInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return AddOptionalAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/types/array.mjs
  function _Array_(items, options) {
    return memory_exports.Create({ "~kind": "Array" }, { type: "array", items }, options);
  }
  function IsArray2(value) {
    return IsKind(value, "Array");
  }
  function ArrayOptions(type) {
    return memory_exports.Discard(type, ["~kind", "type", "items"]);
  }

  // node_modules/typebox/build/type/types/constructor.mjs
  function Constructor(parameters, instanceType, options = {}) {
    return memory_exports.Create({ "~kind": "Constructor" }, { type: "constructor", parameters, instanceType }, options);
  }
  function IsConstructor2(value) {
    return IsKind(value, "Constructor");
  }
  function ConstructorOptions(type) {
    return memory_exports.Discard(type, ["~kind", "type", "parameters", "instanceType"]);
  }

  // node_modules/typebox/build/type/types/function.mjs
  function _Function_(parameters, returnType, options = {}) {
    return memory_exports.Create({ ["~kind"]: "Function" }, { type: "function", parameters, returnType }, options);
  }
  function IsFunction2(value) {
    return IsKind(value, "Function");
  }
  function FunctionOptions(type) {
    return memory_exports.Discard(type, ["~kind", "type", "parameters", "returnType"]);
  }

  // node_modules/typebox/build/type/types/ref.mjs
  function Ref2(ref, options) {
    return memory_exports.Create({ ["~kind"]: "Ref" }, { $ref: ref }, options);
  }
  function IsRef2(value) {
    return IsKind(value, "Ref");
  }

  // node_modules/typebox/build/type/types/generic.mjs
  function Generic(parameters, expression) {
    return memory_exports.Create({ "~kind": "Generic" }, { type: "generic", parameters, expression });
  }
  function IsGeneric(value) {
    return IsKind(value, "Generic");
  }

  // node_modules/typebox/build/type/types/any.mjs
  function Any(options) {
    return memory_exports.Create({ ["~kind"]: "Any" }, {}, options);
  }
  function IsAny(value) {
    return IsKind(value, "Any");
  }

  // node_modules/typebox/build/type/types/never.mjs
  var NeverPattern = "(?!)";
  function Never(options) {
    return memory_exports.Create({ "~kind": "Never" }, { not: {} }, options);
  }
  function IsNever(value) {
    return IsKind(value, "Never");
  }

  // node_modules/typebox/build/type/action/_add_optional.mjs
  function AddOptional(type, options = {}) {
    return AddOptionalAction(type, options);
  }

  // node_modules/typebox/build/type/types/_optional.mjs
  function IsOptional(value) {
    return IsSchema2(value) && guard_exports.HasPropertyKey(value, "~optional");
  }

  // node_modules/typebox/build/type/types/properties.mjs
  function RequiredArray(properties) {
    return guard_exports.Keys(properties).filter((key) => !IsOptional(properties[key]));
  }
  function PropertyKeys(properties) {
    return guard_exports.Keys(properties);
  }
  function PropertyValues(properties) {
    return guard_exports.Values(properties);
  }

  // node_modules/typebox/build/type/types/object.mjs
  function _Object_(properties, options = {}) {
    const requiredKeys = RequiredArray(properties);
    const required = requiredKeys.length > 0 ? { required: requiredKeys } : {};
    return memory_exports.Create({ "~kind": "Object" }, { type: "object", ...required, properties }, options);
  }
  function IsObject2(value) {
    return IsKind(value, "Object");
  }
  function ObjectOptions(type) {
    return memory_exports.Discard(type, ["~kind", "type", "properties", "required"]);
  }

  // node_modules/typebox/build/type/types/unknown.mjs
  function Unknown(options) {
    return memory_exports.Create({ ["~kind"]: "Unknown" }, {}, options);
  }
  function IsUnknown(value) {
    return IsKind(value, "Unknown");
  }

  // node_modules/typebox/build/type/types/cyclic.mjs
  function Cyclic($defs, $ref, options) {
    const defs = guard_exports.Keys($defs).reduce((result, key) => {
      return { ...result, [key]: memory_exports.Update($defs[key], {}, { $id: key }) };
    }, {});
    return memory_exports.Create({ ["~kind"]: "Cyclic" }, { $defs: defs, $ref }, options);
  }
  function IsCyclic(value) {
    return IsKind(value, "Cyclic");
  }

  // node_modules/typebox/build/type/types/unsafe.mjs
  function IsUnsafe(value) {
    return guard_exports.IsObjectNotArray(value) && guard_exports.HasPropertyKey(value, "~unsafe") && guard_exports.IsNull(value["~unsafe"]);
  }

  // node_modules/typebox/build/type/types/infer.mjs
  function IsInfer(value) {
    return IsKind(value, "Infer");
  }

  // node_modules/typebox/build/type/types/dependent.mjs
  function Dependent(if_, then_, else_, options = {}) {
    return memory_exports.Create({ "~kind": "Dependent" }, { if: if_, then: then_, else: else_ }, options);
  }
  function IsDependent(value) {
    return IsKind(value, "Dependent");
  }
  function DependentOptions(type) {
    return memory_exports.Discard(type, ["~kind", "if", "then", "else"]);
  }

  // node_modules/typebox/build/type/types/enum.mjs
  function IsEnum2(value) {
    return IsKind(value, "Enum");
  }

  // node_modules/typebox/build/type/types/intersect.mjs
  function Intersect(types, options = {}) {
    return memory_exports.Create({ "~kind": "Intersect" }, { allOf: types }, options);
  }
  function IsIntersect(value) {
    return IsKind(value, "Intersect");
  }
  function IntersectOptions(type) {
    return memory_exports.Discard(type, ["~kind", "allOf"]);
  }

  // node_modules/typebox/build/type/types/_codec.mjs
  function IsCodec(value) {
    return IsSchema2(value) && guard_exports.HasPropertyKey(value, "~codec") && guard_exports.IsObject(value["~codec"]) && guard_exports.HasPropertyKey(value["~codec"], "encode") && guard_exports.HasPropertyKey(value["~codec"], "decode");
  }

  // node_modules/typebox/build/type/types/_immutable.mjs
  function IsImmutable(value) {
    return IsSchema2(value) && guard_exports.HasPropertyKey(value, "~immutable");
  }

  // node_modules/typebox/build/type/action/_add_readonly.mjs
  function AddReadonly(type, options = {}) {
    return AddReadonlyAction(type, options);
  }

  // node_modules/typebox/build/type/types/_readonly.mjs
  function IsReadonly(value) {
    return IsSchema2(value) && guard_exports.HasPropertyKey(value, "~readonly");
  }

  // node_modules/typebox/build/type/types/_refine.mjs
  function IsRefinement(value) {
    return guard_exports.IsObjectNotArray(value) && guard_exports.HasPropertyKey(value, "check") && guard_exports.HasPropertyKey(value, "error") && guard_exports.IsFunction(value.check) && guard_exports.IsFunction(value.error);
  }
  function IsRefine2(value) {
    return IsSchema2(value) && guard_exports.HasPropertyKey(value, "~refine") && guard_exports.IsArray(value["~refine"]) && guard_exports.Every(value["~refine"], 0, (value2) => IsRefinement(value2));
  }

  // node_modules/typebox/build/type/types/bigint.mjs
  var BigIntPattern = "-?(?:0|[1-9][0-9]*)n";
  function BigInt2(options) {
    return memory_exports.Create({ "~kind": "BigInt" }, { type: "bigint" }, options);
  }
  function IsBigInt2(value) {
    return IsKind(value, "BigInt");
  }

  // node_modules/typebox/build/type/types/boolean.mjs
  function IsBoolean3(value) {
    return IsKind(value, "Boolean");
  }

  // node_modules/typebox/build/type/types/integer.mjs
  var IntegerPattern = "-?(?:0|[1-9][0-9]*)";
  function Integer(options) {
    return memory_exports.Create({ "~kind": "Integer" }, { type: "integer" }, options);
  }
  function IsInteger2(value) {
    return IsKind(value, "Integer");
  }

  // node_modules/typebox/build/type/types/literal.mjs
  var InvalidLiteralValue = class extends Error {
    constructor(value) {
      super(`Invalid Literal value`);
      Object.defineProperty(this, "cause", {
        value: { value },
        writable: false,
        configurable: false,
        enumerable: false
      });
    }
  };
  function LiteralTypeName(value) {
    return guard_exports.IsBigInt(value) ? "bigint" : guard_exports.IsBoolean(value) ? "boolean" : guard_exports.IsNumber(value) ? "number" : guard_exports.IsString(value) ? "string" : (() => {
      throw new InvalidLiteralValue(value);
    })();
  }
  function Literal(value, options) {
    return memory_exports.Create({ "~kind": "Literal" }, { type: LiteralTypeName(value), const: value }, options);
  }
  function IsLiteralValue(value) {
    return guard_exports.IsBigInt(value) || guard_exports.IsBoolean(value) || guard_exports.IsNumber(value) || guard_exports.IsString(value);
  }
  function IsLiteralBigInt(value) {
    return IsLiteral(value) && guard_exports.IsBigInt(value.const);
  }
  function IsLiteralBoolean(value) {
    return IsLiteral(value) && guard_exports.IsBoolean(value.const);
  }
  function IsLiteralNumber(value) {
    return IsLiteral(value) && guard_exports.IsNumber(value.const);
  }
  function IsLiteralString(value) {
    return IsLiteral(value) && guard_exports.IsString(value.const);
  }
  function IsLiteral(value) {
    return IsKind(value, "Literal");
  }

  // node_modules/typebox/build/type/types/null.mjs
  function Null(options) {
    return memory_exports.Create({ "~kind": "Null" }, { type: "null" }, options);
  }
  function IsNull2(value) {
    return IsKind(value, "Null");
  }

  // node_modules/typebox/build/type/types/number.mjs
  var NumberPattern = "-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?";
  function Number2(options) {
    return memory_exports.Create({ "~kind": "Number" }, { type: "number" }, options);
  }
  function IsNumber3(value) {
    return IsKind(value, "Number");
  }

  // node_modules/typebox/build/type/types/symbol.mjs
  function Symbol2(options) {
    return memory_exports.Create({ "~kind": "Symbol" }, { type: "symbol" }, options);
  }
  function IsSymbol2(value) {
    return IsKind(value, "Symbol");
  }

  // node_modules/typebox/build/type/types/string.mjs
  var StringPattern = ".*";
  function String2(options) {
    return memory_exports.Create({ "~kind": "String" }, { type: "string" }, options);
  }
  function IsString3(value) {
    return IsKind(value, "String");
  }

  // node_modules/typebox/build/type/types/union.mjs
  function Union(anyOf, options = {}) {
    return memory_exports.Create({ "~kind": "Union" }, { anyOf }, options);
  }
  function IsUnion(value) {
    return IsKind(value, "Union");
  }
  function UnionOptions(type) {
    return memory_exports.Discard(type, ["~kind", "anyOf"]);
  }

  // node_modules/typebox/build/type/engine/patterns/pattern.mjs
  function ParsePatternIntoTypes(pattern) {
    const parsed = Pattern(pattern);
    const result = guard_exports.IsEqual(parsed.length, 2) ? parsed[0] : [];
    return result;
  }

  // node_modules/typebox/build/type/engine/template_literal/is_finite.mjs
  function FromLiteral(_value) {
    return true;
  }
  function FromTypesReduce(types) {
    return guard_exports.ShiftLeft(types, (left, right) => FromType(left) ? FromTypesReduce(right) : false, () => true);
  }
  function FromTypes(types) {
    const result = guard_exports.IsEqual(types.length, 0) ? false : FromTypesReduce(types);
    return result;
  }
  function FromType(type) {
    return IsUnion(type) ? FromTypes(type.anyOf) : IsLiteral(type) ? FromLiteral(type.const) : false;
  }
  function IsTemplateLiteralFinite(types) {
    const result = FromTypes(types);
    return result;
  }

  // node_modules/typebox/build/type/engine/template_literal/create.mjs
  function TemplateLiteralCreate(pattern) {
    return memory_exports.Create({ ["~kind"]: "TemplateLiteral" }, { type: "string", pattern }, {});
  }

  // node_modules/typebox/build/type/engine/template_literal/decode.mjs
  function FromLiteralPush(variants, value, result = []) {
    return guard_exports.ShiftLeft(variants, (left, right) => FromLiteralPush(right, value, [...result, `${left}${value}`]), () => result);
  }
  function FromLiteral2(variants, value) {
    return guard_exports.IsEqual(variants.length, 0) ? [`${value}`] : FromLiteralPush(variants, value);
  }
  function FromUnion(variants, types, result = []) {
    return guard_exports.ShiftLeft(types, (left, right) => FromUnion(variants, right, [...result, ...FromType2(variants, left)]), () => result);
  }
  function FromType2(variants, type) {
    const result = IsUnion(type) ? FromUnion(variants, type.anyOf) : IsLiteral(type) ? FromLiteral2(variants, type.const) : Unreachable();
    return result;
  }
  function DecodeFromSpan(variants, types) {
    return guard_exports.ShiftLeft(types, (left, right) => DecodeFromSpan(FromType2(variants, left), right), () => variants);
  }
  function VariantsToLiterals(variants) {
    return variants.map((variant) => Literal(variant));
  }
  function DecodeTypesAsUnion(types) {
    const variants = DecodeFromSpan([], types);
    const literals = VariantsToLiterals(variants);
    const result = Union(literals);
    return result;
  }
  function DecodeTypes(types) {
    return guard_exports.IsEqual(types.length, 0) ? Unreachable() : (
      // Literal('') :
      guard_exports.IsEqual(types.length, 1) && IsLiteral(types[0]) ? types[0] : DecodeTypesAsUnion(types)
    );
  }
  function TemplateLiteralDecodeUnsafe(pattern) {
    const types = ParsePatternIntoTypes(pattern);
    const result = guard_exports.IsEqual(types.length, 0) ? String2() : IsTemplateLiteralFinite(types) ? DecodeTypes(types) : TemplateLiteralCreate(pattern);
    return result;
  }
  function TemplateLiteralDecode(pattern) {
    const decoded = TemplateLiteralDecodeUnsafe(pattern);
    const result = IsTemplateLiteral(decoded) ? String2() : decoded;
    return result;
  }

  // node_modules/typebox/build/type/engine/record/record_create.mjs
  function CreateRecord(key, value) {
    const type = "object";
    const patternProperties = { [key]: value };
    return memory_exports.Create({ ["~kind"]: "Record" }, { type, patternProperties });
  }

  // node_modules/typebox/build/type/engine/record/from_key_any.mjs
  function FromAnyKey(value) {
    return CreateRecord(StringKey, value);
  }

  // node_modules/typebox/build/type/engine/record/from_key_boolean.mjs
  function FromBooleanKey(value) {
    return _Object_({ true: value, false: value });
  }

  // node_modules/typebox/build/type/types/tuple.mjs
  function Tuple(types, options = {}) {
    const [items, minItems, additionalItems] = [types, types.length, false];
    return memory_exports.Create({ ["~kind"]: "Tuple" }, { type: "array", additionalItems, items, minItems }, options);
  }
  function IsTuple(value) {
    return IsKind(value, "Tuple");
  }
  function TupleOptions(type) {
    return memory_exports.Discard(type, ["~kind", "type", "items", "minItems", "additionalItems"]);
  }

  // node_modules/typebox/build/type/engine/readonly/instantiate_remove.mjs
  function RemoveReadonlyOperation(type) {
    return memory_exports.Discard(type, ["~readonly"]);
  }
  function RemoveReadonlyAction(type, options) {
    const result = memory_exports.Update(RemoveReadonlyOperation(type), {}, options);
    return result;
  }
  function RemoveReadonlyInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return RemoveReadonlyAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/action/_remove_readonly.mjs
  function RemoveReadonly(type, options = {}) {
    return RemoveReadonlyAction(type, options);
  }

  // node_modules/typebox/build/type/engine/optional/instantiate_remove.mjs
  function RemoveOptionalOperation(type) {
    return memory_exports.Discard(type, ["~optional"]);
  }
  function RemoveOptionalAction(type, options) {
    const result = memory_exports.Update(RemoveOptionalOperation(type), {}, options);
    return result;
  }
  function RemoveOptionalInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return RemoveOptionalAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/action/_remove_optional.mjs
  function RemoveOptional(type, options = {}) {
    return RemoveOptionalAction(type, options);
  }

  // node_modules/typebox/build/type/engine/tuple/to_object.mjs
  function TupleElementsToProperties(types) {
    const result = types.reduceRight((result2, right, index) => {
      return { [index]: right, ...result2 };
    }, {});
    return result;
  }
  function TupleToObject(type) {
    const properties = TupleElementsToProperties(type.items);
    const result = _Object_(properties);
    return result;
  }

  // node_modules/typebox/build/type/engine/evaluate/composite.mjs
  function CanComposite(type) {
    return IsObject2(type) || IsTuple(type);
  }
  function IsReadonlyProperty(left, right) {
    return IsReadonly(left) ? IsReadonly(right) ? true : false : false;
  }
  function IsOptionalProperty(left, right) {
    return IsOptional(left) ? IsOptional(right) ? true : false : false;
  }
  function CompositeProperty(left, right) {
    const isReadonly = IsReadonlyProperty(left, right);
    const isOptional = IsOptionalProperty(left, right);
    const evaluated = EvaluateIntersect([left, right]);
    const property = RemoveReadonly(RemoveOptional(evaluated));
    return isReadonly && isOptional ? AddReadonly(AddOptional(property)) : isReadonly && !isOptional ? AddReadonly(property) : !isReadonly && isOptional ? AddOptional(property) : property;
  }
  function CompositePropertyKey(left, right, key) {
    return key in left ? key in right ? CompositeProperty(left[key], right[key]) : left[key] : key in right ? right[key] : Never();
  }
  function CompositeProperties(left, right) {
    const keys = /* @__PURE__ */ new Set([...guard_exports.Keys(left), ...guard_exports.Keys(right)]);
    const result = [...keys].reduce((result2, key) => {
      return { ...result2, [key]: CompositePropertyKey(left, right, key) };
    }, {});
    return result;
  }
  function GetProperties(type) {
    const result = IsObject2(type) ? type.properties : IsTuple(type) ? TupleElementsToProperties(type.items) : {};
    return result;
  }
  function Composite(left, right) {
    const leftProperties = GetProperties(left);
    const rightProperties = GetProperties(right);
    const properties = CompositeProperties(leftProperties, rightProperties);
    const result = _Object_(properties);
    return result;
  }

  // node_modules/typebox/build/type/engine/evaluate/narrow.mjs
  function NarrowCompareRule(left, right) {
    const result = Compare(left, right);
    return guard_exports.IsEqual(result, CompareResultLeftInside) ? left : guard_exports.IsEqual(result, CompareResultRightInside) ? right : guard_exports.IsEqual(result, CompareResultEqual) ? right : Never();
  }
  function NarrowCompositeRule(left, right) {
    const canCompositeLeft = CanComposite(left);
    const canCompositeRight = CanComposite(right);
    return canCompositeLeft && canCompositeRight ? Composite(left, right) : canCompositeLeft && !canCompositeRight ? left : !canCompositeLeft && canCompositeRight ? right : NarrowCompareRule(left, right);
  }
  function Narrow(left, right) {
    return IsNever(left) ? left : IsAny(left) ? left : IsUnknown(left) ? right : IsNever(right) ? right : IsAny(right) ? right : IsUnknown(right) ? left : NarrowCompositeRule(left, right);
  }

  // node_modules/typebox/build/type/engine/evaluate/distribute.mjs
  function ShouldEvaluate(left, right) {
    const result = IsUnion(left) || IsUnion(right);
    return result;
  }
  function DistributeOperation(left, right) {
    const evaluatedLeft = EvaluateType(left);
    const evaluatedRight = EvaluateType(right);
    const shouldEvaluate = ShouldEvaluate(evaluatedLeft, evaluatedRight);
    const result = shouldEvaluate ? EvaluateIntersect([evaluatedLeft, evaluatedRight]) : Narrow(evaluatedLeft, evaluatedRight);
    return result;
  }
  function DistributeType(type, types, result = []) {
    return guard_exports.ShiftLeft(types, (left, right) => DistributeType(type, right, [...result, DistributeOperation(left, type)]), () => guard_exports.IsEqual(result.length, 0) ? [type] : result);
  }
  function DistributeUnion(types, distribution, result = []) {
    return guard_exports.ShiftLeft(types, (left, right) => DistributeUnion(right, distribution, [...result, ...Distribute([left], distribution)]), () => result);
  }
  function Distribute(types, result = []) {
    return guard_exports.ShiftLeft(types, (left, right) => IsUnion(left) ? Distribute(right, DistributeUnion(left.anyOf, result)) : Distribute(right, DistributeType(left, result)), () => result);
  }

  // node_modules/typebox/build/type/engine/exclude/operation.mjs
  function ExcludeType(left, right) {
    const check = Extends({}, left, right);
    const result = result_exports.IsExtendsTrueLike(check) ? [] : [left];
    return result;
  }
  function ExcludeUnion(left, right, result = []) {
    return guard_exports.ShiftLeft(left, (head, tail) => ExcludeUnion(tail, right, [...result, ...ExcludeType(head, right)]), () => result);
  }
  function ExcludeOperation(left, right) {
    const evaluated = EvaluateType(left);
    const canonical = IsUnion(evaluated) ? evaluated.anyOf : [evaluated];
    const remaining = ExcludeUnion(canonical, right);
    const result = EvaluateUnion(remaining);
    return result;
  }

  // node_modules/typebox/build/type/engine/evaluate/evaluate.mjs
  function EvaluateDependent(if_, then_, else_) {
    const intersected = EvaluateIntersect([if_, then_]);
    const excluded = ExcludeOperation(else_, if_);
    const result = EvaluateUnion([intersected, excluded]);
    return result;
  }
  function EvaluateEnum(values, result = []) {
    return guard_exports.ShiftLeft(values, (left, right) => EvaluateEnum(right, [...result, Literal(left)]), () => EvaluateUnion(result));
  }
  function EvaluateIntersect(types) {
    const distribution = Distribute(types);
    const broadend = Broaden(distribution);
    const result = EvaluateUnion(broadend);
    return result;
  }
  function EvaluateTemplateLiteral(pattern) {
    const evaluated = TemplateLiteralDecode(pattern);
    const result = EvaluateType(evaluated);
    return result;
  }
  function EvaluateUnion(types) {
    const broadend = Broaden(types);
    const result = EvaluateUnionFast(broadend);
    return result;
  }
  function EvaluateType(type) {
    const result = IsDependent(type) ? EvaluateDependent(type.if, type.then, type.else) : IsEnum2(type) ? EvaluateEnum(type.enum) : IsIntersect(type) ? EvaluateIntersect(type.allOf) : IsTemplateLiteral(type) ? EvaluateTemplateLiteral(type.pattern) : IsUnion(type) ? EvaluateUnion(type.anyOf) : type;
    return result;
  }
  function EvaluateUnionFast(types) {
    const result = guard_exports.IsEqual(types.length, 1) ? types[0] : guard_exports.IsEqual(types.length, 0) ? Never() : Union(types);
    return result;
  }

  // node_modules/typebox/build/type/engine/record/from_key_enum.mjs
  function FromEnumKey(values, value) {
    const unionKey = EvaluateEnum(values);
    const result = FromKey(unionKey, value);
    return result;
  }

  // node_modules/typebox/build/type/engine/record/from_key_integer.mjs
  function FromIntegerKey(_key, value) {
    const result = CreateRecord(IntegerKey, value);
    return result;
  }

  // node_modules/typebox/build/type/engine/record/from_key_intersect.mjs
  function FromIntersectKey(types, value) {
    const evaluatedKey = EvaluateIntersect(types);
    const result = FromKey(evaluatedKey, value);
    return result;
  }

  // node_modules/typebox/build/type/engine/record/from_key_literal.mjs
  function FromLiteralKey(key, value) {
    return guard_exports.IsString(key) || guard_exports.IsNumber(key) ? _Object_({ [key]: value }) : guard_exports.IsEqual(key, false) ? _Object_({ false: value }) : guard_exports.IsEqual(key, true) ? _Object_({ true: value }) : _Object_({});
  }

  // node_modules/typebox/build/type/engine/record/from_key_number.mjs
  function FromNumberKey(_key, value) {
    const result = CreateRecord(NumberKey, value);
    return result;
  }

  // node_modules/typebox/build/type/engine/record/from_key_string.mjs
  function FromStringKey(key, value) {
    return guard_exports.HasPropertyKey(key, "pattern") && (guard_exports.IsString(key.pattern) || key.pattern instanceof RegExp) ? CreateRecord(key.pattern.toString(), value) : CreateRecord(StringKey, value);
  }

  // node_modules/typebox/build/type/engine/record/from_key_template_literal.mjs
  function FromTemplateKey(pattern, value) {
    const types = ParsePatternIntoTypes(pattern);
    const finite = IsTemplateLiteralFinite(types);
    const result = finite ? FromKey(EvaluateTemplateLiteral(pattern), value) : CreateRecord(pattern, value);
    return result;
  }

  // node_modules/typebox/build/type/engine/evaluate/flatten.mjs
  function FlattenType(type) {
    const result = IsUnion(type) ? Flatten(type.anyOf) : [type];
    return result;
  }
  function Flatten(types, result = []) {
    return guard_exports.ShiftLeft(types, (left, right) => Flatten(right, [...result, ...FlattenType(left)]), () => result);
  }

  // node_modules/typebox/build/type/engine/record/from_key_union.mjs
  function StringOrNumberCheck(types) {
    return types.some((type) => IsString3(type) || IsNumber3(type) || IsInteger2(type));
  }
  function TryBuildRecord(types, value) {
    return guard_exports.IsEqual(StringOrNumberCheck(types), true) ? CreateRecord(StringKey, value) : void 0;
  }
  function CreateProperties(types, value) {
    return types.reduce((result, left) => {
      return IsLiteral(left) && (guard_exports.IsString(left.const) || guard_exports.IsNumber(left.const)) ? { ...result, [left.const]: value } : result;
    }, {});
  }
  function CreateObject(types, value) {
    const properties = CreateProperties(types, value);
    const result = _Object_(properties);
    return result;
  }
  function FromUnionKey(types, value) {
    const flattened = Flatten(types);
    const record = TryBuildRecord(flattened, value);
    return IsSchema2(record) ? record : CreateObject(flattened, value);
  }

  // node_modules/typebox/build/type/engine/record/from_key.mjs
  function FromKey(key, value) {
    const result = IsAny(key) ? FromAnyKey(value) : IsBoolean3(key) ? FromBooleanKey(value) : IsEnum2(key) ? FromEnumKey(key.enum, value) : IsInteger2(key) ? FromIntegerKey(key, value) : IsIntersect(key) ? FromIntersectKey(key.allOf, value) : IsLiteral(key) ? FromLiteralKey(key.const, value) : IsNumber3(key) ? FromNumberKey(key, value) : IsUnion(key) ? FromUnionKey(key.anyOf, value) : IsString3(key) ? FromStringKey(key, value) : IsTemplateLiteral(key) ? FromTemplateKey(key.pattern, value) : _Object_({});
    return result;
  }

  // node_modules/typebox/build/type/engine/record/instantiate.mjs
  function RecordAction(key, value, options) {
    const result = CanInstantiate([key]) ? memory_exports.Update(FromKey(key, value), {}, options) : RecordDeferred(key, value, options);
    return result;
  }
  function RecordInstantiate(context, state, key, value, options) {
    const instantiatedKey = InstantiateType(context, state, key);
    const instantiatedValue = InstantiateType(context, state, value);
    return RecordAction(instantiatedKey, instantiatedValue, options);
  }

  // node_modules/typebox/build/type/types/record.mjs
  var IntegerKey = `^${IntegerPattern}$`;
  var NumberKey = `^${NumberPattern}$`;
  var StringKey = `^${StringPattern}$`;
  function RecordDeferred(key, value, options = {}) {
    return Deferred("Record", [key, value], options);
  }
  function Record(key, value, options = {}) {
    return RecordAction(key, value, options);
  }
  function RecordFromPattern(pattern, value) {
    return CreateRecord(pattern, value);
  }
  function RecordPatternToType(pattern) {
    const result = guard_exports.IsEqual(pattern, StringKey) ? String2() : guard_exports.IsEqual(pattern, IntegerKey) ? Integer() : guard_exports.IsEqual(pattern, NumberKey) ? Number2() : TemplateLiteralDecodeUnsafe(pattern);
    return result;
  }
  function RecordPattern(type) {
    return guard_exports.Keys(type.patternProperties)[0];
  }
  function RecordKey(type) {
    const pattern = RecordPattern(type);
    const result = RecordPatternToType(pattern);
    return result;
  }
  function RecordValue(type) {
    return type.patternProperties[RecordPattern(type)];
  }
  function IsRecord(value) {
    return IsKind(value, "Record");
  }

  // node_modules/typebox/build/type/types/rest.mjs
  function Rest(type) {
    return memory_exports.Create({ "~kind": "Rest" }, { type: "rest", items: type }, {});
  }
  function IsRest(value) {
    return IsKind(value, "Rest");
  }

  // node_modules/typebox/build/type/types/this.mjs
  function IsThis(value) {
    return IsKind(value, "This");
  }

  // node_modules/typebox/build/type/types/undefined.mjs
  function Undefined(options) {
    return memory_exports.Create({ "~kind": "Undefined" }, { type: "undefined" }, options);
  }
  function IsUndefined2(value) {
    return IsKind(value, "Undefined");
  }

  // node_modules/typebox/build/type/types/void.mjs
  function IsVoid(value) {
    return IsKind(value, "Void");
  }

  // node_modules/typebox/build/type/script/mapping.mjs
  function PatternBigIntMapping(input) {
    return BigInt2();
  }
  function PatternStringMapping(input) {
    return String2();
  }
  function PatternNumberMapping(input) {
    return Number2();
  }
  function PatternIntegerMapping(input) {
    return Integer();
  }
  function PatternNeverMapping(input) {
    return Never();
  }
  function PatternTextMapping(input) {
    return Literal(input);
  }
  function PatternBaseMapping(input) {
    return input;
  }
  function PatternGroupMapping(input) {
    return Union(input[1]);
  }
  function PatternUnionMapping(input) {
    return input.length === 3 ? [...input[0], ...input[2]] : input.length === 1 ? [...input[0]] : [];
  }
  function PatternTermMapping(input) {
    return [input[0], ...input[1]];
  }
  function PatternBodyMapping(input) {
    return input;
  }
  function PatternMapping(input) {
    return input[1];
  }

  // node_modules/typebox/build/type/script/token/internal/match.mjs
  function IsMatch(value) {
    return IsEqual(value.length, 2);
  }
  function Match3(input, ok, fail) {
    return IsMatch(input) ? ok(input[0], input[1]) : fail();
  }

  // node_modules/typebox/build/type/script/token/internal/take.mjs
  function TakeVariant(variant, input) {
    return IsEqual(input.indexOf(variant), 0) ? [variant, input.slice(variant.length)] : [];
  }
  function Take(variants, input) {
    for (let i = 0; i < variants.length; i++) {
      const result = TakeVariant(variants[i], input);
      if (IsMatch(result))
        return result;
    }
    return [];
  }

  // node_modules/typebox/build/type/script/token/internal/char.mjs
  function Range(start, end) {
    return Array.from({ length: end - start + 1 }, (_, i) => String.fromCharCode(start + i));
  }
  var Alpha = [
    ...Range(97, 122),
    // Lowercase
    ...Range(65, 90)
    // Uppercase
  ];
  var Zero = "0";
  var NonZero = Range(49, 57);
  var Digit = [Zero, ...NonZero];
  var WhiteSpace = " ";
  var NewLine = "\n";
  var UnderScore = "_";
  var DollarSign = "$";

  // node_modules/typebox/build/type/script/token/internal/trim.mjs
  var LineComment = "//";
  var OpenComment = "/*";
  var CloseComment = "*/";
  function DiscardMultilineComment(input) {
    const index = input.indexOf(CloseComment);
    const result = IsEqual(index, -1) ? "" : input.slice(index + 2);
    return result;
  }
  function DiscardLineComment(input) {
    const index = input.indexOf(NewLine);
    const result = IsEqual(index, -1) ? "" : input.slice(index);
    return result;
  }
  function TrimStartUntilNewline(input) {
    return input.replace(/^[ \t\r\f\v]+/, "");
  }
  function TrimWhitespace(input) {
    const trimmed = TrimStartUntilNewline(input);
    return trimmed.startsWith(OpenComment) ? TrimWhitespace(DiscardMultilineComment(trimmed.slice(2))) : trimmed.startsWith(LineComment) ? TrimWhitespace(DiscardLineComment(trimmed.slice(2))) : trimmed;
  }
  function Trim(input) {
    const trimmed = input.trimStart();
    return trimmed.startsWith(OpenComment) ? Trim(DiscardMultilineComment(trimmed.slice(2))) : trimmed.startsWith(LineComment) ? Trim(DiscardLineComment(trimmed.slice(2))) : trimmed;
  }

  // node_modules/typebox/build/type/script/token/unsigned_integer.mjs
  var AllowedDigits = [...Digit, UnderScore];

  // node_modules/typebox/build/type/script/token/const.mjs
  function TakeConst(const_, input) {
    return Take([const_], input);
  }
  function Const(const_, input) {
    return IsEqual(const_, "") ? ["", input] : const_.startsWith(NewLine) ? TakeConst(const_, TrimWhitespace(input)) : const_.startsWith(WhiteSpace) ? TakeConst(const_, input) : TakeConst(const_, Trim(input));
  }

  // node_modules/typebox/build/type/script/token/ident.mjs
  var Initial = [...Alpha, UnderScore, DollarSign];
  var Remaining = [...Initial, ...Digit];

  // node_modules/typebox/build/type/script/token/unsigned_number.mjs
  var AllowedDigits2 = [...Digit, UnderScore];

  // node_modules/typebox/build/type/script/token/until.mjs
  function TakeOne(input) {
    const result = IsEqual(input, "") ? [] : [input.slice(0, 1), input.slice(1)];
    return result;
  }
  function IsInputMatchSentinal(end, input) {
    return ShiftLeft(end, (left, right) => input.startsWith(left) ? true : IsInputMatchSentinal(right, input), () => false);
  }
  function Until(end, input, result = "") {
    return Match3(
      TakeOne(input),
      (One, Rest2) => IsInputMatchSentinal(end, input) ? [result, input] : Until(end, Rest2, `${result}${One}`),
      () => []
    );
  }

  // node_modules/typebox/build/type/script/token/until_1.mjs
  function Until_1(end, input) {
    return Match3(Until(end, input), (Until2, UntilRest) => IsEqual(Until2, "") ? [] : [Until2, UntilRest], () => []);
  }

  // node_modules/typebox/build/type/script/parser.mjs
  var If = (result, left, right = () => []) => result.length === 2 ? left(result) : right();
  var PatternBigInt = (input) => If(Const("-?(?:0|[1-9][0-9]*)n", input), ([_0, input2]) => [PatternBigIntMapping(_0), input2]);
  var PatternString = (input) => If(Const(".*", input), ([_0, input2]) => [PatternStringMapping(_0), input2]);
  var PatternNumber = (input) => If(Const("-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?", input), ([_0, input2]) => [PatternNumberMapping(_0), input2]);
  var PatternInteger = (input) => If(Const("-?(?:0|[1-9][0-9]*)", input), ([_0, input2]) => [PatternIntegerMapping(_0), input2]);
  var PatternNever = (input) => If(Const("(?!)", input), ([_0, input2]) => [PatternNeverMapping(_0), input2]);
  var PatternText = (input) => If(Until_1(["-?(?:0|[1-9][0-9]*)n", ".*", "-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?", "-?(?:0|[1-9][0-9]*)", "(?!)", "(", ")", "$", "|"], input), ([_0, input2]) => [PatternTextMapping(_0), input2]);
  var PatternBase = (input) => If(If(PatternBigInt(input), ([_0, input2]) => [_0, input2], () => If(PatternString(input), ([_0, input2]) => [_0, input2], () => If(PatternNumber(input), ([_0, input2]) => [_0, input2], () => If(PatternInteger(input), ([_0, input2]) => [_0, input2], () => If(PatternNever(input), ([_0, input2]) => [_0, input2], () => If(PatternGroup(input), ([_0, input2]) => [_0, input2], () => If(PatternText(input), ([_0, input2]) => [_0, input2], () => []))))))), ([_0, input2]) => [PatternBaseMapping(_0), input2]);
  var PatternGroup = (input) => If(If(Const("(", input), ([_0, input2]) => If(PatternBody(input2), ([_1, input3]) => If(Const(")", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [PatternGroupMapping(_0), input2]);
  var PatternUnion = (input) => If(If(If(PatternTerm(input), ([_0, input2]) => If(Const("|", input2), ([_1, input3]) => If(PatternUnion(input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [_0, input2], () => If(If(PatternTerm(input), ([_0, input2]) => [[_0], input2]), ([_0, input2]) => [_0, input2], () => If([[], input], ([_0, input2]) => [_0, input2], () => []))), ([_0, input2]) => [PatternUnionMapping(_0), input2]);
  var PatternTerm = (input) => If(If(PatternBase(input), ([_0, input2]) => If(PatternBody(input2), ([_1, input3]) => [[_0, _1], input3])), ([_0, input2]) => [PatternTermMapping(_0), input2]);
  var PatternBody = (input) => If(If(PatternUnion(input), ([_0, input2]) => [_0, input2], () => If(PatternTerm(input), ([_0, input2]) => [_0, input2], () => [])), ([_0, input2]) => [PatternBodyMapping(_0), input2]);
  var Pattern = (input) => If(If(Const("^", input), ([_0, input2]) => If(PatternBody(input2), ([_1, input3]) => If(Const("$", input3), ([_2, input4]) => [[_0, _1, _2], input4]))), ([_0, input2]) => [PatternMapping(_0), input2]);

  // node_modules/typebox/build/type/engine/template_literal/encode.mjs
  function JoinString(input) {
    return input.join("|");
  }
  function UnwrapTemplateLiteralPattern(pattern) {
    return pattern.slice(1, pattern.length - 1);
  }
  function EncodeLiteral(value, right, pattern) {
    return EncodeTypes(right, `${pattern}${value}`);
  }
  function EncodeBigInt(right, pattern) {
    return EncodeTypes(right, `${pattern}${BigIntPattern}`);
  }
  function EncodeInteger(right, pattern) {
    return EncodeTypes(right, `${pattern}${IntegerPattern}`);
  }
  function EncodeNumber(right, pattern) {
    return EncodeTypes(right, `${pattern}${NumberPattern}`);
  }
  function EncodeBoolean(right, pattern) {
    return EncodeType(Union([Literal("false"), Literal("true")]), right, pattern);
  }
  function EncodeString(right, pattern) {
    return EncodeTypes(right, `${pattern}${StringPattern}`);
  }
  function EncodeTemplateLiteral(templatePattern, right, pattern) {
    return EncodeTypes(right, `${pattern}${UnwrapTemplateLiteralPattern(templatePattern)}`);
  }
  function EncodeTemplateLiteralDeferred(types, right, pattern) {
    const templateLiteral = TemplateLiteralAction(types, {});
    const result = EncodeType(templateLiteral, right, pattern);
    return result;
  }
  function EncodeEnum(values, right, pattern) {
    const evaluated = EvaluateEnum(values);
    return EncodeType(evaluated, right, pattern);
  }
  function EncodeUnion(types, right, pattern, result = []) {
    return guard_exports.ShiftLeft(types, (head, tail) => EncodeUnion(tail, right, pattern, [...result, EncodeType(head, [], "")]), () => EncodeTypes(right, `${pattern}(${JoinString(result)})`));
  }
  function EncodeType(type, right, pattern) {
    return IsEnum2(type) ? EncodeEnum(type.enum, right, pattern) : IsInteger2(type) ? EncodeInteger(right, pattern) : IsLiteral(type) ? EncodeLiteral(type.const, right, pattern) : IsBigInt2(type) ? EncodeBigInt(right, pattern) : IsBoolean3(type) ? EncodeBoolean(right, pattern) : IsNumber3(type) ? EncodeNumber(right, pattern) : IsString3(type) ? EncodeString(right, pattern) : IsTemplateLiteral(type) ? EncodeTemplateLiteral(type.pattern, right, pattern) : IsTemplateLiteralDeferred(type) ? EncodeTemplateLiteralDeferred(type.parameters[0], right, pattern) : IsUnion(type) ? EncodeUnion(type.anyOf, right, pattern) : NeverPattern;
  }
  function EncodeTypes(types, pattern) {
    return guard_exports.ShiftLeft(types, (left, right) => EncodeType(left, right, pattern), () => pattern);
  }
  function EncodePattern(types) {
    const encoded = EncodeTypes(types, "");
    const result = `^${encoded}$`;
    return result;
  }
  function TemplateLiteralEncode(types) {
    const pattern = EncodePattern(types);
    const result = TemplateLiteralCreate(pattern);
    return result;
  }

  // node_modules/typebox/build/type/engine/template_literal/instantiate.mjs
  function TemplateLiteralAction(types, options) {
    const result = CanInstantiate(types) ? memory_exports.Update(TemplateLiteralEncode(types), {}, options) : TemplateLiteralDeferred(types, options);
    return result;
  }
  function TemplateLiteralInstantiate(context, state, types, options) {
    const instantiatedTypes = InstantiateTypes(context, state, types);
    return TemplateLiteralAction(instantiatedTypes, options);
  }

  // node_modules/typebox/build/type/types/template_literal.mjs
  function TemplateLiteralDeferred(types, options = {}) {
    return Deferred("TemplateLiteral", [types], options);
  }
  function IsTemplateLiteralDeferred(value) {
    return IsSchema2(value) && guard_exports.HasPropertyKey(value, "action") && guard_exports.IsEqual(value.action, "TemplateLiteral");
  }
  function IsTemplateLiteral(value) {
    return IsKind(value, "TemplateLiteral");
  }

  // node_modules/typebox/build/type/extends/result.mjs
  var result_exports = {};
  __export(result_exports, {
    ExtendsFalse: () => ExtendsFalse,
    ExtendsTrue: () => ExtendsTrue,
    ExtendsUnion: () => ExtendsUnion,
    IsExtendsFalse: () => IsExtendsFalse,
    IsExtendsTrue: () => IsExtendsTrue,
    IsExtendsTrueLike: () => IsExtendsTrueLike,
    IsExtendsUnion: () => IsExtendsUnion,
    Match: () => Match4
  });
  function ExtendsUnion(inferred) {
    return memory_exports.Create({ ["~kind"]: "ExtendsUnion" }, { inferred });
  }
  function IsExtendsUnion(value) {
    return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "inferred") && guard_exports.IsEqual(value["~kind"], "ExtendsUnion") && guard_exports.IsObject(value.inferred);
  }
  function ExtendsTrue(inferred) {
    return memory_exports.Create({ ["~kind"]: "ExtendsTrue" }, { inferred });
  }
  function IsExtendsTrue(value) {
    return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "inferred") && guard_exports.IsEqual(value["~kind"], "ExtendsTrue") && guard_exports.IsObject(value.inferred);
  }
  function ExtendsFalse() {
    return memory_exports.Create({ ["~kind"]: "ExtendsFalse" }, {});
  }
  function IsExtendsFalse(value) {
    return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.IsEqual(value["~kind"], "ExtendsFalse");
  }
  function IsExtendsTrueLike(value) {
    return IsExtendsUnion(value) || IsExtendsTrue(value);
  }
  function Match4(result, true_, false_) {
    return IsExtendsTrueLike(result) ? true_(result.inferred) : false_();
  }

  // node_modules/typebox/build/type/extends/extends_right.mjs
  function ExtendsRightInfer(inferred, name, left, right) {
    return Match4(ExtendsLeft(inferred, left, right), (checkInferred) => ExtendsTrue(memory_exports.Assign(memory_exports.Assign(inferred, checkInferred), { [name]: left })), () => ExtendsFalse());
  }
  function ExtendsRightAny(inferred, _left) {
    return ExtendsTrue(inferred);
  }
  function ExtendsRightDependent(inferred, left, if_, then_, else_) {
    return Match4(ExtendsLeft(inferred, left, if_), (inferred2) => Match4(ExtendsLeft(inferred2, left, then_), (inferred3) => ExtendsTrue(inferred3), () => ExtendsFalse()), () => Match4(ExtendsLeft(inferred, left, else_), (inferred2) => ExtendsTrue(inferred2), () => ExtendsFalse()));
  }
  function ExtendsRightEnum(inferred, left, right) {
    const evaluated = EvaluateEnum(right);
    return ExtendsLeft(inferred, left, evaluated);
  }
  function ExtendsRightIntersect(inferred, left, right) {
    return guard_exports.ShiftLeft(right, (head, tail) => Match4(ExtendsLeft(inferred, left, head), (inferred2) => ExtendsRightIntersect(inferred2, left, tail), () => ExtendsFalse()), () => ExtendsTrue(inferred));
  }
  function ExtendsRightTemplateLiteral(inferred, left, right) {
    const evaluated = EvaluateTemplateLiteral(right);
    return ExtendsLeft(inferred, left, evaluated);
  }
  function ExtendsRightUnion(inferred, left, right) {
    return guard_exports.ShiftLeft(right, (head, tail) => Match4(ExtendsLeft(inferred, left, head), (inferred2) => ExtendsTrue(inferred2), () => ExtendsRightUnion(inferred, left, tail)), () => ExtendsFalse());
  }
  function ExtendsRight(inferred, left, right) {
    return IsAny(right) ? ExtendsRightAny(inferred, left) : IsDependent(right) ? ExtendsRightDependent(inferred, left, right.if, right.then, right.else) : IsEnum2(right) ? ExtendsRightEnum(inferred, left, right.enum) : IsInfer(right) ? ExtendsRightInfer(inferred, right.name, left, right.extends) : IsIntersect(right) ? ExtendsRightIntersect(inferred, left, right.allOf) : IsTemplateLiteral(right) ? ExtendsRightTemplateLiteral(inferred, left, right.pattern) : IsUnion(right) ? ExtendsRightUnion(inferred, left, right.anyOf) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsFalse();
  }

  // node_modules/typebox/build/type/extends/any.mjs
  function ExtendsAny(inferred, left, right) {
    return IsInfer(right) ? ExtendsRight(inferred, left, right) : IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsUnion(inferred);
  }

  // node_modules/typebox/build/type/extends/array.mjs
  function ExtendsImmutable(left, right) {
    const isImmutableLeft = IsImmutable(left);
    const isImmutableRight = IsImmutable(right);
    return isImmutableLeft && isImmutableRight ? true : !isImmutableLeft && isImmutableRight ? true : isImmutableLeft && !isImmutableRight ? false : true;
  }
  function ExtendsArray(inferred, arrayLeft, left, right) {
    return IsArray2(right) ? ExtendsImmutable(arrayLeft, right) ? ExtendsLeft(inferred, left, right.items) : ExtendsFalse() : ExtendsRight(inferred, arrayLeft, right);
  }

  // node_modules/typebox/build/type/extends/bigint.mjs
  function ExtendsBigInt(inferred, left, right) {
    return IsBigInt2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
  }

  // node_modules/typebox/build/type/extends/boolean.mjs
  function ExtendsBoolean(inferred, left, right) {
    return IsBoolean3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
  }

  // node_modules/typebox/build/type/extends/parameters.mjs
  function ParameterCompare(inferred, left, leftRest, right, rightRest) {
    const checkLeft = IsInfer(right) ? left : right;
    const checkRight = IsInfer(right) ? right : left;
    const isLeftOptional = IsOptional(left);
    const isRightOptional = IsOptional(right);
    return !isLeftOptional && isRightOptional ? ExtendsFalse() : Match4(ExtendsLeft(inferred, checkLeft, checkRight), (inferred2) => ExtendsParameters(inferred2, leftRest, rightRest), () => ExtendsFalse());
  }
  function ParameterRight(inferred, left, leftRest, rightRest) {
    return guard_exports.ShiftLeft(rightRest, (head, tail) => ParameterCompare(inferred, left, leftRest, head, tail), () => IsOptional(left) ? ExtendsTrue(inferred) : ExtendsFalse());
  }
  function ParametersLeft(inferred, left, rightRest) {
    return guard_exports.ShiftLeft(left, (head, tail) => ParameterRight(inferred, head, tail, rightRest), () => ExtendsTrue(inferred));
  }
  function ExtendsParameters(inferred, left, right) {
    return ParametersLeft(inferred, left, right);
  }

  // node_modules/typebox/build/type/extends/return_type.mjs
  function ExtendsReturnType(inferred, left, right) {
    return IsVoid(right) ? ExtendsTrue(inferred) : ExtendsLeft(inferred, left, right);
  }

  // node_modules/typebox/build/type/extends/constructor.mjs
  function ExtendsConstructor(inferred, parameters, returnType, right) {
    return IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : IsConstructor2(right) ? Match4(ExtendsParameters(inferred, parameters, right["parameters"]), (inferred2) => ExtendsReturnType(inferred2, returnType, right["instanceType"]), () => ExtendsFalse()) : ExtendsFalse();
  }

  // node_modules/typebox/build/type/extends/dependent.mjs
  function ExtendsDependent(inferred, if_, then_, else_, right) {
    return Match4(ExtendsLeft(inferred, if_, right), () => ExtendsLeft(inferred, then_, right), () => ExtendsLeft(inferred, else_, right));
  }

  // node_modules/typebox/build/type/extends/enum.mjs
  function ExtendsEnum(inferred, left, right) {
    const evaluated = EvaluateEnum(left);
    return ExtendsLeft(inferred, evaluated, right);
  }

  // node_modules/typebox/build/type/extends/function.mjs
  function ExtendsFunction(inferred, parameters, returnType, right) {
    return IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : IsFunction2(right) ? Match4(ExtendsParameters(inferred, parameters, right["parameters"]), (inferred2) => ExtendsReturnType(inferred2, returnType, right["returnType"]), () => ExtendsFalse()) : ExtendsFalse();
  }

  // node_modules/typebox/build/type/extends/integer.mjs
  function ExtendsInteger(inferred, left, right) {
    return IsInteger2(right) ? ExtendsTrue(inferred) : IsNumber3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
  }

  // node_modules/typebox/build/type/extends/intersect.mjs
  function ExtendsIntersect(inferred, left, right) {
    const evaluated = EvaluateIntersect(left);
    return ExtendsLeft(inferred, evaluated, right);
  }

  // node_modules/typebox/build/type/extends/literal.mjs
  function ExtendsLiteralValue(inferred, left, right) {
    return left === right ? ExtendsTrue(inferred) : ExtendsFalse();
  }
  function ExtendsLiteralBigInt(inferred, left, right) {
    return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsBigInt2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
  }
  function ExtendsLiteralBoolean(inferred, left, right) {
    return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsBoolean3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
  }
  function ExtendsLiteralNumber(inferred, left, right) {
    return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsNumber3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
  }
  function ExtendsLiteralString(inferred, left, right) {
    return IsLiteral(right) ? ExtendsLiteralValue(inferred, left, right.const) : IsString3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, Literal(left), right);
  }
  function ExtendsLiteral(inferred, left, right) {
    return guard_exports.IsBigInt(left.const) ? ExtendsLiteralBigInt(inferred, left.const, right) : guard_exports.IsBoolean(left.const) ? ExtendsLiteralBoolean(inferred, left.const, right) : guard_exports.IsNumber(left.const) ? ExtendsLiteralNumber(inferred, left.const, right) : guard_exports.IsString(left.const) ? ExtendsLiteralString(inferred, left.const, right) : Unreachable();
  }

  // node_modules/typebox/build/type/extends/never.mjs
  function ExtendsNever(inferred, left, right) {
    return IsInfer(right) ? ExtendsRight(inferred, left, right) : ExtendsTrue(inferred);
  }

  // node_modules/typebox/build/type/extends/null.mjs
  function ExtendsNull(inferred, left, right) {
    return IsNull2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
  }

  // node_modules/typebox/build/type/extends/number.mjs
  function ExtendsNumber(inferred, left, right) {
    return IsNumber3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
  }

  // node_modules/typebox/build/type/extends/object.mjs
  function ExtendsPropertyOptional(inferred, left, right) {
    return IsOptional(left) ? IsOptional(right) ? ExtendsTrue(inferred) : ExtendsFalse() : ExtendsTrue(inferred);
  }
  function ExtendsProperty(inferred, left, right) {
    return (
      // Right TInfer<TNever> is TExtendsFalse
      IsInfer(right) && IsNever(right.extends) ? ExtendsFalse() : Match4(ExtendsLeft(inferred, left, right), (inferred2) => ExtendsPropertyOptional(inferred2, left, right), () => ExtendsFalse())
    );
  }
  function ExtractInferredProperties(keys, properties) {
    return keys.reduce((result, key) => {
      return key in properties ? IsExtendsTrueLike(properties[key]) ? { ...result, ...properties[key].inferred } : Unreachable() : Unreachable();
    }, {});
  }
  function ExtendsPropertiesComparer(inferred, left, right) {
    const properties = {};
    for (const rightKey of guard_exports.Keys(right)) {
      properties[rightKey] = rightKey in left ? ExtendsProperty({}, left[rightKey], right[rightKey]) : IsOptional(right[rightKey]) ? IsInfer(right[rightKey]) ? ExtendsTrue(memory_exports.Assign(inferred, { [right[rightKey].name]: right[rightKey].extends })) : ExtendsTrue(inferred) : ExtendsFalse();
    }
    const checked2 = guard_exports.Values(properties).every((result) => IsExtendsTrueLike(result));
    const extracted = checked2 ? ExtractInferredProperties(guard_exports.Keys(properties), properties) : {};
    return checked2 ? ExtendsTrue(extracted) : ExtendsFalse();
  }
  function ExtendsProperties(inferred, left, right) {
    const compared = ExtendsPropertiesComparer(inferred, left, right);
    return IsExtendsTrueLike(compared) ? ExtendsTrue(memory_exports.Assign(inferred, compared.inferred)) : ExtendsFalse();
  }
  function ExtendsObjectToObject(inferred, left, right) {
    return ExtendsProperties(inferred, left, right);
  }
  function RecordMergeInferred(left, right) {
    return guard_exports.Keys(right).reduce((result, key) => {
      return {
        ...result,
        [key]: guard_exports.HasPropertyKey(left, key) ? IsUnion(result[key]) ? Union([...result[key].anyOf, right[key]]) : Union([left[key], right[key]]) : right[key]
      };
    }, left);
  }
  function ExtendsRecordComparer(properties, keys, type, result) {
    return guard_exports.ShiftLeft(keys, (left, right) => Match4(ExtendsLeft({}, properties[left], type), (inferred) => ExtendsRecordComparer(properties, right, type, RecordMergeInferred(result, inferred)), () => ExtendsFalse()), () => ExtendsTrue(result));
  }
  function ExtendsObjectToRecord(inferred, properties, _pattern, value) {
    const keys = guard_exports.Keys(properties);
    const result = ExtendsRecordComparer(properties, keys, value, inferred);
    return result;
  }
  function ExtendsObject(inferred, left, right) {
    return IsRecord(right) ? ExtendsObjectToRecord(inferred, left, RecordPattern(right), RecordValue(right)) : IsObject2(right) ? ExtendsObjectToObject(inferred, left, right.properties) : ExtendsRight(inferred, _Object_(left), right);
  }

  // node_modules/typebox/build/type/extends/record.mjs
  function FromObject4(inferred, properties) {
    return guard_exports.IsEqual(guard_exports.Keys(properties).length, 0) ? ExtendsTrue(inferred) : ExtendsFalse();
  }
  function FromRecord(inferred, _leftKey, leftValue, _rightKey, rightValue) {
    return ExtendsLeft(inferred, leftValue, rightValue);
  }
  function ExtendsRecord(inferred, leftPattern, leftValue, right) {
    return IsRecord(right) ? FromRecord(inferred, RecordPatternToType(leftPattern), leftValue, RecordPatternToType(RecordPattern(right)), RecordValue(right)) : IsObject2(right) ? FromObject4(inferred, right.properties) : IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsFalse();
  }

  // node_modules/typebox/build/type/extends/string.mjs
  function ExtendsString(inferred, left, right) {
    return IsString3(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
  }

  // node_modules/typebox/build/type/extends/symbol.mjs
  function ExtendsSymbol(inferred, left, right) {
    return IsSymbol2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
  }

  // node_modules/typebox/build/type/extends/template_literal.mjs
  function ExtendsTemplateLiteral(inferred, left, right) {
    const evaluated = EvaluateTemplateLiteral(left);
    return ExtendsLeft(inferred, evaluated, right);
  }

  // node_modules/typebox/build/type/extends/inference.mjs
  function Inferrable(name, type) {
    return memory_exports.Create({ "~kind": "Inferrable" }, { name, type }, {});
  }
  function IsInferable(value) {
    return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "~kind") && guard_exports.HasPropertyKey(value, "name") && guard_exports.HasPropertyKey(value, "type") && guard_exports.IsEqual(value["~kind"], "Inferrable") && guard_exports.IsString(value.name) && guard_exports.IsObject(value.type);
  }
  function TryRestInferable(type) {
    return IsRest(type) ? IsInfer(type.items) ? IsArray2(type.items.extends) ? Inferrable(type.items.name, type.items.extends.items) : IsUnknown(type.items.extends) ? Inferrable(type.items.name, type.items.extends) : void 0 : Unreachable() : void 0;
  }
  function TryInferable(type) {
    return IsInfer(type) ? Inferrable(type.name, type.extends) : void 0;
  }
  function TryInferResults(rest, right, result = []) {
    return guard_exports.ShiftLeft(rest, (head, tail) => Match4(ExtendsLeft({}, head, right), () => TryInferResults(tail, right, [...result, head]), () => void 0), () => result);
  }
  function InferTupleResult(inferred, name, left, right) {
    const results = TryInferResults(left, right);
    return guard_exports.IsArray(results) ? ExtendsTrue(memory_exports.Assign(inferred, { [name]: Tuple(results) })) : ExtendsFalse();
  }
  function InferUnionResult(inferred, name, left, right) {
    const results = TryInferResults(left, right);
    return guard_exports.IsArray(results) ? ExtendsTrue(memory_exports.Assign(inferred, { [name]: Union(results) })) : ExtendsFalse();
  }

  // node_modules/typebox/build/type/extends/tuple.mjs
  function Reverse(types) {
    return [...types].reverse();
  }
  function ApplyReverse(types, reversed) {
    return reversed ? Reverse(types) : types;
  }
  function Reversed(types) {
    const first = types.length > 0 ? types[0] : void 0;
    const inferrable = IsSchema2(first) ? TryRestInferable(first) : void 0;
    return IsSchema2(inferrable);
  }
  function ElementsCompare(inferred, reversed, left, leftRest, right, rightRest) {
    return Match4(ExtendsLeft(inferred, left, right), (checkInferred) => Elements(checkInferred, reversed, leftRest, rightRest), () => ExtendsFalse());
  }
  function ElementsLeft(inferred, reversed, leftRest, right, rightRest) {
    const inferable = TryRestInferable(right);
    return (
      // Rest Inferrable Right Means we delegate to TInferTupleResult to Generate a Result
      IsInferable(inferable) ? InferTupleResult(inferred, inferable["name"], ApplyReverse(leftRest, reversed), inferable["type"]) : guard_exports.ShiftLeft(leftRest, (head, tail) => ElementsCompare(inferred, reversed, head, tail, right, rightRest), () => ExtendsFalse())
    );
  }
  function ElementsRight(inferred, reversed, leftRest, rightRest) {
    return guard_exports.ShiftLeft(rightRest, (head, tail) => ElementsLeft(inferred, reversed, leftRest, head, tail), () => guard_exports.IsEqual(leftRest.length, 0) ? ExtendsTrue(inferred) : ExtendsFalse());
  }
  function Elements(inferred, reversed, leftRest, rightRest) {
    return ElementsRight(inferred, reversed, leftRest, rightRest);
  }
  function ExtendsTupleToTuple(inferred, left, right) {
    const instantiatedRight = InstantiateElements(inferred, State([], []), right);
    const reversed = Reversed(instantiatedRight);
    return Elements(inferred, reversed, ApplyReverse(left, reversed), ApplyReverse(instantiatedRight, reversed));
  }
  function ExtendsTupleToArray(inferred, left, right) {
    const inferrable = TryInferable(right);
    return IsInferable(inferrable) ? InferUnionResult(inferred, inferrable["name"], left, inferrable["type"]) : guard_exports.ShiftLeft(left, (head, tail) => Match4(ExtendsLeft(inferred, head, right), (inferred2) => ExtendsTupleToArray(inferred2, tail, right), () => ExtendsFalse()), () => ExtendsTrue(inferred));
  }
  function ExtendsTuple(inferred, left, right) {
    const instantiatedLeft = InstantiateElements(inferred, State([], []), left);
    return IsTuple(right) ? ExtendsTupleToTuple(inferred, instantiatedLeft, right.items) : IsArray2(right) ? ExtendsTupleToArray(inferred, instantiatedLeft, right.items) : ExtendsRight(inferred, Tuple(instantiatedLeft), right);
  }

  // node_modules/typebox/build/type/extends/undefined.mjs
  function ExtendsUndefined(inferred, left, right) {
    return IsVoid(right) ? ExtendsTrue(inferred) : IsUndefined2(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
  }

  // node_modules/typebox/build/type/extends/union.mjs
  function ExtendsUnionSome(inferred, type, unionTypes) {
    return guard_exports.ShiftLeft(unionTypes, (head, tail) => Match4(ExtendsLeft(inferred, type, head), (inferred2) => ExtendsTrue(inferred2), () => ExtendsUnionSome(inferred, type, tail)), () => ExtendsFalse());
  }
  function ExtendsUnionLeft(inferred, left, right) {
    return guard_exports.ShiftLeft(left, (head, tail) => Match4(ExtendsUnionSome(inferred, head, right), (inferred2) => ExtendsUnionLeft(inferred2, tail, right), () => ExtendsFalse()), () => ExtendsTrue(inferred));
  }
  function ExtendsUnion2(inferred, left, right) {
    const inferrable = TryInferable(right);
    return IsInferable(inferrable) ? InferUnionResult(inferred, inferrable.name, left, inferrable.type) : IsUnion(right) ? ExtendsUnionLeft(inferred, left, right.anyOf) : ExtendsUnionLeft(inferred, left, [right]);
  }

  // node_modules/typebox/build/type/extends/unknown.mjs
  function ExtendsUnknown(inferred, left, right) {
    return IsInfer(right) ? ExtendsRight(inferred, left, right) : IsAny(right) ? ExtendsTrue(inferred) : IsUnknown(right) ? ExtendsTrue(inferred) : ExtendsFalse();
  }

  // node_modules/typebox/build/type/extends/void.mjs
  function ExtendsVoid(inferred, left, right) {
    return IsVoid(right) ? ExtendsTrue(inferred) : ExtendsRight(inferred, left, right);
  }

  // node_modules/typebox/build/type/extends/extends_left.mjs
  function ExtendsLeft(inferred, left, right) {
    return IsAny(left) ? ExtendsAny(inferred, left, right) : IsArray2(left) ? ExtendsArray(inferred, left, left.items, right) : IsBigInt2(left) ? ExtendsBigInt(inferred, left, right) : IsBoolean3(left) ? ExtendsBoolean(inferred, left, right) : IsConstructor2(left) ? ExtendsConstructor(inferred, left.parameters, left.instanceType, right) : IsDependent(left) ? ExtendsDependent(inferred, left.if, left.then, left.else, right) : IsEnum2(left) ? ExtendsEnum(inferred, left.enum, right) : IsFunction2(left) ? ExtendsFunction(inferred, left.parameters, left.returnType, right) : IsInteger2(left) ? ExtendsInteger(inferred, left, right) : IsIntersect(left) ? ExtendsIntersect(inferred, left.allOf, right) : IsLiteral(left) ? ExtendsLiteral(inferred, left, right) : IsNever(left) ? ExtendsNever(inferred, left, right) : IsNull2(left) ? ExtendsNull(inferred, left, right) : IsNumber3(left) ? ExtendsNumber(inferred, left, right) : IsObject2(left) ? ExtendsObject(inferred, left.properties, right) : IsRecord(left) ? ExtendsRecord(inferred, RecordPattern(left), RecordValue(left), right) : IsString3(left) ? ExtendsString(inferred, left, right) : IsSymbol2(left) ? ExtendsSymbol(inferred, left, right) : IsTemplateLiteral(left) ? ExtendsTemplateLiteral(inferred, left.pattern, right) : IsTuple(left) ? ExtendsTuple(inferred, left.items, right) : IsUndefined2(left) ? ExtendsUndefined(inferred, left, right) : IsUnion(left) ? ExtendsUnion2(inferred, left.anyOf, right) : IsUnknown(left) ? ExtendsUnknown(inferred, left, right) : IsVoid(left) ? ExtendsVoid(inferred, left, right) : ExtendsFalse();
  }

  // node_modules/typebox/build/type/engine/interface/instantiate.mjs
  function InterfaceOperation(heritage, properties) {
    const result = EvaluateIntersect([...heritage, _Object_(properties)]);
    return result;
  }
  function InterfaceAction(heritage, properties, options) {
    const result = CanInstantiate(heritage) ? memory_exports.Update(InterfaceOperation(heritage, properties), {}, options) : InterfaceDeferred(heritage, properties, options);
    return result;
  }
  function InterfaceInstantiate(context, state, heritage, properties, options) {
    const instantiatedHeritage = InstantiateTypes(context, state, heritage);
    const instantiatedProperties = InstantiateProperties(context, state, properties);
    return InterfaceAction(instantiatedHeritage, instantiatedProperties, options);
  }

  // node_modules/typebox/build/type/action/interface.mjs
  function InterfaceDeferred(heritage, properties, options = {}) {
    return Deferred("Interface", [heritage, properties], options);
  }
  function IsInterfaceDeferred(value) {
    return IsSchema2(value) && guard_exports.HasPropertyKey(value, "action") && guard_exports.IsEqual(value.action, "Interface");
  }

  // node_modules/typebox/build/type/engine/cyclic/check.mjs
  function FromRef(stack, context, ref) {
    return stack.includes(ref) ? true : FromType3([...stack, ref], context, context[ref]);
  }
  function FromProperties(stack, context, properties) {
    const types = PropertyValues(properties);
    return FromTypes2(stack, context, types);
  }
  function FromTypes2(stack, context, types) {
    return guard_exports.ShiftLeft(types, (left, right) => FromType3(stack, context, left) ? true : FromTypes2(stack, context, right), () => false);
  }
  function FromType3(stack, context, type) {
    return IsRef2(type) ? FromRef(stack, context, type.$ref) : IsArray2(type) ? FromType3(stack, context, type.items) : IsConstructor2(type) ? FromTypes2(stack, context, [...type.parameters, type.instanceType]) : IsFunction2(type) ? FromTypes2(stack, context, [...type.parameters, type.returnType]) : IsInterfaceDeferred(type) ? FromProperties(stack, context, type.parameters[1]) : IsIntersect(type) ? FromTypes2(stack, context, type.allOf) : IsObject2(type) ? FromProperties(stack, context, type.properties) : IsUnion(type) ? FromTypes2(stack, context, type.anyOf) : IsTuple(type) ? FromTypes2(stack, context, type.items) : IsRecord(type) ? FromType3(stack, context, RecordValue(type)) : false;
  }
  function CyclicCheck(stack, context, type) {
    const result = FromType3(stack, context, type);
    return result;
  }

  // node_modules/typebox/build/type/engine/cyclic/candidates.mjs
  function ResolveCandidateKeys(context, keys) {
    return keys.reduce((result, left) => {
      return CyclicCheck([left], context, context[left]) ? [...result, left] : result;
    }, []);
  }
  function CyclicCandidates(context) {
    const keys = PropertyKeys(context);
    const result = ResolveCandidateKeys(context, keys);
    return result;
  }

  // node_modules/typebox/build/type/engine/cyclic/dependencies.mjs
  function FromRef2(context, ref, result) {
    return result.includes(ref) ? result : ref in context ? FromType4(context, context[ref], [...result, ref]) : Unreachable();
  }
  function FromProperties2(context, properties, result) {
    const types = PropertyValues(properties);
    return FromTypes3(context, types, result);
  }
  function FromTypes3(context, types, result) {
    return types.reduce((result2, left) => {
      return FromType4(context, left, result2);
    }, result);
  }
  function FromType4(context, type, result) {
    return IsRef2(type) ? FromRef2(context, type.$ref, result) : IsArray2(type) ? FromType4(context, type.items, result) : IsConstructor2(type) ? FromTypes3(context, [...type.parameters, type.instanceType], result) : IsFunction2(type) ? FromTypes3(context, [...type.parameters, type.returnType], result) : IsInterfaceDeferred(type) ? FromProperties2(context, type.parameters[1], result) : IsIntersect(type) ? FromTypes3(context, type.allOf, result) : IsObject2(type) ? FromProperties2(context, type.properties, result) : IsUnion(type) ? FromTypes3(context, type.anyOf, result) : IsTuple(type) ? FromTypes3(context, type.items, result) : IsRecord(type) ? FromType4(context, RecordValue(type), result) : result;
  }
  function CyclicDependencies(context, key, type) {
    const result = FromType4(context, type, [key]);
    return result;
  }

  // node_modules/typebox/build/type/engine/cyclic/extends.mjs
  function FromRef3(_ref) {
    return Any();
  }
  function FromProperties3(properties) {
    return guard_exports.Keys(properties).reduce((result, key) => {
      return { ...result, [key]: FromType5(properties[key]) };
    }, {});
  }
  function FromTypes4(types) {
    return types.reduce((result, left) => {
      return [...result, FromType5(left)];
    }, []);
  }
  function FromType5(type) {
    return IsRef2(type) ? FromRef3(type.$ref) : IsArray2(type) ? _Array_(FromType5(type.items), ArrayOptions(type)) : IsConstructor2(type) ? Constructor(FromTypes4(type.parameters), FromType5(type.instanceType)) : IsFunction2(type) ? _Function_(FromTypes4(type.parameters), FromType5(type.returnType)) : IsIntersect(type) ? Intersect(FromTypes4(type.allOf)) : IsObject2(type) ? _Object_(FromProperties3(type.properties)) : IsRecord(type) ? Record(RecordKey(type), FromType5(RecordValue(type))) : IsUnion(type) ? Union(FromTypes4(type.anyOf)) : IsTuple(type) ? Tuple(FromTypes4(type.items)) : type;
  }
  function CyclicAnyFromParameters(defs, ref) {
    return ref in defs ? FromType5(defs[ref]) : Unknown();
  }
  function CyclicExtends(type) {
    return CyclicAnyFromParameters(type.$defs, type.$ref);
  }

  // node_modules/typebox/build/type/engine/cyclic/instantiate.mjs
  function CyclicInterface(context, heritage, properties) {
    const instantiatedHeritage = InstantiateTypes(context, State([], []), heritage);
    const instantiatedProperties = InstantiateProperties({}, State([], []), properties);
    const evaluatedInterface = EvaluateIntersect([...instantiatedHeritage, _Object_(instantiatedProperties)]);
    return evaluatedInterface;
  }
  function CyclicDefinitions(context, dependencies) {
    const keys = guard_exports.Keys(context).filter((key) => dependencies.includes(key));
    return keys.reduce((result, key) => {
      const type = context[key];
      const instantiatedType = IsInterfaceDeferred(type) ? CyclicInterface(context, type.parameters[0], type.parameters[1]) : type;
      return { ...result, [key]: instantiatedType };
    }, {});
  }
  function InstantiateCyclic(context, ref, type) {
    const dependencies = CyclicDependencies(context, ref, type);
    const definitions = CyclicDefinitions(context, dependencies);
    const result = Cyclic(definitions, ref);
    return result;
  }

  // node_modules/typebox/build/type/engine/cyclic/target.mjs
  function Resolve(defs, ref) {
    return ref in defs ? IsRef2(defs[ref]) ? Resolve(defs, defs[ref].$ref) : defs[ref] : Never();
  }
  function CyclicTarget(defs, ref) {
    const result = Resolve(defs, ref);
    return result;
  }

  // node_modules/typebox/build/type/extends/extends.mjs
  function Canonical(type) {
    return IsCyclic(type) ? CyclicExtends(type) : IsUnsafe(type) ? Unknown() : type;
  }
  function Extends(inferred, left, right) {
    const canonicalLeft = Canonical(left);
    const canonicalRight = Canonical(right);
    return ExtendsLeft(inferred, canonicalLeft, canonicalRight);
  }

  // node_modules/typebox/build/type/engine/evaluate/compare.mjs
  var CompareResultEqual = 0;
  var CompareResultDisjoint = 1;
  var CompareResultLeftInside = 2;
  var CompareResultRightInside = 3;
  function Compare(left, right) {
    const extendsCheck = [Extends({}, left, right), Extends({}, right, left)];
    return result_exports.IsExtendsTrueLike(extendsCheck[0]) && result_exports.IsExtendsTrueLike(extendsCheck[1]) ? CompareResultEqual : result_exports.IsExtendsTrueLike(extendsCheck[0]) && result_exports.IsExtendsFalse(extendsCheck[1]) ? CompareResultLeftInside : result_exports.IsExtendsFalse(extendsCheck[0]) && result_exports.IsExtendsTrueLike(extendsCheck[1]) ? CompareResultRightInside : CompareResultDisjoint;
  }

  // node_modules/typebox/build/type/engine/evaluate/broaden.mjs
  function BroadenFilter(type, types, result = [], all = types) {
    return guard_exports.ShiftLeft(types, (left, right) => {
      const compare = Compare(type, left);
      return guard_exports.IsEqual(compare, CompareResultLeftInside) || guard_exports.IsEqual(compare, CompareResultEqual) ? all : guard_exports.IsEqual(compare, CompareResultDisjoint) ? BroadenFilter(type, right, [...result, left], all) : BroadenFilter(type, right, result, all);
    }, () => [...result, type]);
  }
  function BroadenType(type, types, result) {
    const evaluated = EvaluateType(type);
    return IsAny(evaluated) ? [evaluated] : (
      // terminate (always the most broad)
      IsUnknown(evaluated) ? [evaluated] : (
        // terminate (always the most broad)
        IsNever(evaluated) ? BroadenTypes(types, result) : (
          // ignored: never is dropped
          IsObject2(evaluated) ? BroadenTypes(types, [...result, evaluated]) : (
            // objects are always considered (too expensive to compare)
            BroadenTypes(types, BroadenFilter(evaluated, result))
          )
        )
      )
    );
  }
  function BroadenTypes(types, result = []) {
    return guard_exports.ShiftLeft(types, (left, right) => BroadenType(left, right, result), () => result);
  }
  function Broaden(types) {
    const broadened = BroadenTypes(types);
    const flattened = Flatten(broadened);
    return flattened;
  }

  // node_modules/typebox/build/type/engine/evaluate/instantiate.mjs
  function EvaluateAction(type, options) {
    const result = memory_exports.Update(EvaluateType(type), {}, options);
    return result;
  }
  function EvaluateInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return EvaluateAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/engine/call/distribute_arguments.mjs
  function CollectDistributionNames(expression, result = []) {
    return (
      // Conditional
      IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Conditional") ? IsRef2(expression.parameters[0]) ? CollectDistributionNames(expression.parameters[2], CollectDistributionNames(expression.parameters[3], [...result, expression.parameters[0]["$ref"]])) : CollectDistributionNames(expression.parameters[2], CollectDistributionNames(expression.parameters[3], result)) : IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Mapped") ? IsDeferred(expression.parameters[1]) && guard_exports.IsEqual(expression.parameters[1].action, "KeyOf") && IsRef2(expression.parameters[1].parameters[0]) ? [...result, expression.parameters[1].parameters[0]["$ref"]] : result : result
    );
  }
  function BuildDistributionArray(parameters, names) {
    return parameters.reduce((result, left) => [...result, names.includes(left.name)], []);
  }
  function ZipDistributionArray(arguments_, distributionArray, result = []) {
    return guard_exports.ShiftLeft(arguments_, (argumentLeft, argumentRight) => guard_exports.ShiftLeft(distributionArray, (booleanLeft, booleanRight) => ZipDistributionArray(argumentRight, booleanRight, [...result, [booleanLeft, argumentLeft]]), () => result), () => result);
  }
  function CanonicalArgument(type) {
    return IsTemplateLiteral(type) ? EvaluateTemplateLiteral(type.pattern) : IsEnum2(type) ? EvaluateEnum(type.enum) : type;
  }
  function Expand(type) {
    const canonicalArgument = CanonicalArgument(type);
    return IsUnion(canonicalArgument) ? [...canonicalArgument.anyOf] : [canonicalArgument];
  }
  function Append(current, type) {
    return current.reduce((result, left) => [...result, [...left, type]], []);
  }
  function Cross(current, variants) {
    return variants.reduce((result, left) => {
      return [...result, ...Append(current, left)];
    }, []);
  }
  function Distribute2(zipped) {
    return zipped.reduce((result, left) => {
      return guard_exports.IsEqual(left[0], true) ? Cross(result, Expand(left[1])) : Cross(result, [left[1]]);
    }, [[]]);
  }
  function DistributeArguments(parameters, arguments_, expression) {
    const distributionNames = CollectDistributionNames(expression);
    const distributionArray = BuildDistributionArray(parameters, distributionNames);
    const zippedArguments = ZipDistributionArray(arguments_, distributionArray);
    return IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Conditional") ? Distribute2(zippedArguments) : IsDeferred(expression) && guard_exports.IsEqual(expression.action, "Mapped") ? Distribute2(zippedArguments) : [arguments_];
  }

  // node_modules/typebox/build/type/engine/call/resolve_target.mjs
  function FromNotResolvable() {
    return ["(not-resolvable)", Never()];
  }
  function FromNotGeneric() {
    return ["(not-generic)", Never()];
  }
  function FromGeneric(name, parameters, expression) {
    return [name, Generic(parameters, expression)];
  }
  function FromRef4(context, ref, arguments_) {
    return ref in context ? FromType6(context, ref, context[ref], arguments_) : FromNotResolvable();
  }
  function FromType6(context, name, target, arguments_) {
    return IsGeneric(target) ? FromGeneric(name, target.parameters, target.expression) : IsRef2(target) ? FromRef4(context, target.$ref, arguments_) : FromNotGeneric();
  }
  function ResolveTarget(context, target, arguments_) {
    return FromType6(context, "(anonymous)", target, arguments_);
  }

  // node_modules/typebox/build/type/engine/call/resolve_arguments.mjs
  function AssertArgumentExtends(name, type, extends_) {
    if (IsInfer(type) || IsCall(type) || result_exports.IsExtendsTrueLike(Extends({}, type, extends_)))
      return;
    const cause = { parameter: name, expect: extends_, actual: type };
    throw new Error(`Argument for parameter ${name} does not satisfy constraint`, { cause });
  }
  function BindArgument(context, state, name, extends_, type) {
    const instantiatedArgument = InstantiateType(context, state, type);
    AssertArgumentExtends(name, instantiatedArgument, extends_);
    return memory_exports.Assign(context, { [name]: instantiatedArgument });
  }
  function BindArguments(context, state, parameterLeft, parameterRight, arguments_) {
    const instantiatedExtends = InstantiateType(context, state, parameterLeft.extends);
    const instantiatedEquals = InstantiateType(context, state, parameterLeft.equals);
    return guard_exports.ShiftLeft(arguments_, (left, right) => BindParameters(BindArgument(context, state, parameterLeft["name"], instantiatedExtends, left), state, parameterRight, right), () => BindParameters(BindArgument(context, state, parameterLeft["name"], instantiatedExtends, instantiatedEquals), state, parameterRight, []));
  }
  function BindParameters(context, state, parameters, arguments_) {
    return guard_exports.ShiftLeft(parameters, (left, right) => BindArguments(context, state, left, right, arguments_), () => context);
  }
  function ResolveArgumentsContext(context, state, parameters, arguments_) {
    return BindParameters(context, state, parameters, arguments_);
  }

  // node_modules/typebox/build/type/engine/call/instantiate.mjs
  var instantiationDepth = 0;
  var instantiationCount = 0;
  function InstantiationAssert() {
    if (guard_exports.IsLessThan(instantiationCount, settings_exports.Get().maxInstantiationCount))
      return;
    throw Error("Type instantiation is excessively deep and possibly infinite");
  }
  function InstantiationIncrement() {
    InstantiationAssert();
    instantiationCount++;
    instantiationDepth++;
  }
  function InstantiationDecrement() {
    instantiationDepth--;
    if (guard_exports.IsEqual(instantiationDepth, 0))
      instantiationCount = 0;
  }
  function Peek(state) {
    const result = guard_exports.IsGreaterThan(state.callstack.length, 0) ? state.callstack[state.callstack.length - 1] : "";
    return result;
  }
  function IsTailCall(state, name) {
    const result = guard_exports.IsEqual(Peek(state), name);
    return result;
  }
  function CallDispatch(context, state, target, parameters, expression, arguments_) {
    InstantiationIncrement();
    try {
      const argumentsContext = ResolveArgumentsContext(context, state, parameters, arguments_);
      const returnType = InstantiateType(argumentsContext, State([...state["callstack"], target["$ref"]], state["visited"]), expression);
      return InstantiateType(argumentsContext, State([], []), returnType);
    } finally {
      InstantiationDecrement();
    }
  }
  function CallDistributed(context, state, target, parameters, expression, distributedArguments) {
    return distributedArguments.reduce((result, arguments_) => {
      const returnType = CallDispatch(context, state, target, parameters, expression, arguments_);
      return [...result, returnType];
    }, []);
  }
  function CallImmediate(context, state, target, parameters, expression, arguments_) {
    const distributedArguments = DistributeArguments(parameters, arguments_, expression);
    const returnTypes = CallDistributed(context, state, target, parameters, expression, distributedArguments);
    const result = guard_exports.IsEqual(returnTypes.length, 1) ? returnTypes[0] : EvaluateUnion(returnTypes);
    return result;
  }
  function CallInstantiate(context, state, target, arguments_) {
    const instantiatedArguments = InstantiateTypes(context, state, arguments_);
    const resolved = ResolveTarget(context, target, arguments_);
    const name = resolved[0];
    const type = resolved[1];
    const result = IsGeneric(type) ? IsTailCall(state, name) ? CallConstruct(Ref2(name), instantiatedArguments) : CallImmediate(context, state, Ref2(name), type.parameters, type.expression, instantiatedArguments) : CallConstruct(target, instantiatedArguments);
    return result;
  }

  // node_modules/typebox/build/type/types/call.mjs
  function CallConstruct(target, arguments_) {
    return memory_exports.Create({ ["~kind"]: "Call" }, { type: "call", target, arguments: arguments_ }, {});
  }
  function IsCall(value) {
    return IsKind(value, "Call");
  }

  // node_modules/typebox/build/type/engine/immutable/instantiate_remove.mjs
  function RemoveImmutableOperation(type) {
    return memory_exports.Discard(type, ["~immutable"]);
  }
  function RemoveImmutableAction(type, options) {
    const result = memory_exports.Update(RemoveImmutableOperation(type), {}, options);
    return result;
  }
  function RemoveImmutableInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return RemoveImmutableAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/engine/intrinsics/mapping.mjs
  function ApplyMapping(mapping, value) {
    return mapping(value);
  }

  // node_modules/typebox/build/type/engine/intrinsics/from_literal.mjs
  function FromLiteral3(mapping, value) {
    return guard_exports.IsString(value) ? Literal(ApplyMapping(mapping, value)) : Literal(value);
  }

  // node_modules/typebox/build/type/engine/intrinsics/from_template_literal.mjs
  function FromTemplateLiteral(mapping, pattern) {
    const evaluated = EvaluateTemplateLiteral(pattern);
    const result = FromType7(mapping, evaluated);
    return result;
  }

  // node_modules/typebox/build/type/engine/intrinsics/from_union.mjs
  function FromUnion2(mapping, types) {
    const result = types.map((type) => FromType7(mapping, type));
    return Union(result);
  }

  // node_modules/typebox/build/type/engine/intrinsics/from_type.mjs
  function FromType7(mapping, type) {
    return IsLiteral(type) ? FromLiteral3(mapping, type.const) : IsTemplateLiteral(type) ? FromTemplateLiteral(mapping, type.pattern) : IsUnion(type) ? FromUnion2(mapping, type.anyOf) : type;
  }

  // node_modules/typebox/build/type/action/capitalize.mjs
  function CapitalizeDeferred(type, options = {}) {
    return Deferred("Capitalize", [type], options);
  }

  // node_modules/typebox/build/type/action/lowercase.mjs
  function LowercaseDeferred(type, options = {}) {
    return Deferred("Lowercase", [type], options);
  }

  // node_modules/typebox/build/type/action/uncapitalize.mjs
  function UncapitalizeDeferred(type, options = {}) {
    return Deferred("Uncapitalize", [type], options);
  }

  // node_modules/typebox/build/type/action/uppercase.mjs
  function UppercaseDeferred(type, options = {}) {
    return Deferred("Uppercase", [type], options);
  }

  // node_modules/typebox/build/type/engine/intrinsics/instantiate.mjs
  var CapitalizeMapping = (input) => input[0].toUpperCase() + input.slice(1);
  var LowercaseMapping = (input) => input.toLowerCase();
  var UncapitalizeMapping = (input) => input[0].toLowerCase() + input.slice(1);
  var UppercaseMapping = (input) => input.toUpperCase();
  function CapitalizeAction(type, options) {
    const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(CapitalizeMapping, type), {}, options) : CapitalizeDeferred(type, options);
    return result;
  }
  function LowercaseAction(type, options) {
    const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(LowercaseMapping, type), {}, options) : LowercaseDeferred(type, options);
    return result;
  }
  function UncapitalizeAction(type, options) {
    const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(UncapitalizeMapping, type), {}, options) : UncapitalizeDeferred(type, options);
    return result;
  }
  function UppercaseAction(type, options) {
    const result = CanInstantiate([type]) ? memory_exports.Update(FromType7(UppercaseMapping, type), {}, options) : UppercaseDeferred(type, options);
    return result;
  }
  function CapitalizeInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return CapitalizeAction(instantiatedType, options);
  }
  function LowercaseInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return LowercaseAction(instantiatedType, options);
  }
  function UncapitalizeInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return UncapitalizeAction(instantiatedType, options);
  }
  function UppercaseInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return UppercaseAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/action/conditional.mjs
  function ConditionalDeferred(left, right, true_, false_, options = {}) {
    return Deferred("Conditional", [left, right, true_, false_], options);
  }

  // node_modules/typebox/build/type/engine/conditional/instantiate.mjs
  function ConditionalOperation(context, state, left, right, true_, false_) {
    const extendsResult = Extends(context, left, right);
    return result_exports.IsExtendsUnion(extendsResult) ? Union([InstantiateType(extendsResult.inferred, state, true_), InstantiateType(context, state, false_)]) : result_exports.IsExtendsTrue(extendsResult) ? InstantiateType(extendsResult.inferred, state, true_) : InstantiateType(context, state, false_);
  }
  function ConditionalAction(context, state, left, right, true_, false_, options) {
    const result = CanInstantiate([left, right]) ? memory_exports.Update(ConditionalOperation(context, state, left, right, true_, false_), {}, options) : ConditionalDeferred(left, right, true_, false_, options);
    return result;
  }
  function ConditionalInstantiate(context, state, left, right, true_, false_, options) {
    const instantiatedLeft = InstantiateType(context, state, left);
    const instantiatedRight = InstantiateType(context, state, right);
    return ConditionalAction(context, state, instantiatedLeft, instantiatedRight, true_, false_, options);
  }

  // node_modules/typebox/build/type/action/constructor_parameters.mjs
  function ConstructorParametersDeferred(type, options = {}) {
    return Deferred("ConstructorParameters", [type], options);
  }

  // node_modules/typebox/build/type/engine/constructor_parameters/instantiate.mjs
  function ConstructorParametersOperation(type) {
    const parameters = IsConstructor2(type) ? type["parameters"] : [];
    const instantiatedParameters = InstantiateElements({}, State([], []), parameters);
    const result = Tuple(instantiatedParameters);
    return result;
  }
  function ConstructorParametersAction(type, options) {
    const result = CanInstantiate([type]) ? memory_exports.Update(ConstructorParametersOperation(type), {}, options) : ConstructorParametersDeferred(type, options);
    return result;
  }
  function ConstructorParametersInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return ConstructorParametersAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/action/exclude.mjs
  function ExcludeDeferred(left, right, options = {}) {
    return Deferred("Exclude", [left, right], options);
  }

  // node_modules/typebox/build/type/engine/exclude/instantiate.mjs
  function ExcludeAction(left, right, options) {
    const result = CanInstantiate([left, right]) ? memory_exports.Update(ExcludeOperation(left, right), {}, options) : ExcludeDeferred(left, right, options);
    return result;
  }
  function ExcludeInstantiate(context, state, left, right, options) {
    const instantiatedLeft = InstantiateType(context, state, left);
    const instantiatedRight = InstantiateType(context, state, right);
    return ExcludeAction(instantiatedLeft, instantiatedRight, options);
  }

  // node_modules/typebox/build/type/action/extract.mjs
  function ExtractDeferred(left, right, options = {}) {
    return Deferred("Extract", [left, right], options);
  }

  // node_modules/typebox/build/type/engine/extract/operation.mjs
  function ExtractType(left, right) {
    const check = Extends({}, left, right);
    const result = result_exports.IsExtendsTrueLike(check) ? [left] : [];
    return result;
  }
  function ExtractUnion(left, right, result = []) {
    return guard_exports.ShiftLeft(left, (head, tail) => ExtractUnion(tail, right, [...result, ...ExtractType(head, right)]), () => result);
  }
  function ExtractOperation(left, right) {
    const evaluated = EvaluateType(left);
    const canonical = IsUnion(evaluated) ? evaluated.anyOf : [evaluated];
    const remaining = ExtractUnion(canonical, right);
    const result = EvaluateUnion(remaining);
    return result;
  }

  // node_modules/typebox/build/type/engine/extract/instantiate.mjs
  function ExtractAction(left, right, options) {
    const result = CanInstantiate([left, right]) ? memory_exports.Update(ExtractOperation(left, right), {}, options) : ExtractDeferred(left, right, options);
    return result;
  }
  function ExtractInstantiate(context, state, left, right, options) {
    const instantiatedLeft = InstantiateType(context, state, left);
    const instantiatedRight = InstantiateType(context, state, right);
    return ExtractAction(instantiatedLeft, instantiatedRight, options);
  }

  // node_modules/typebox/build/type/action/indexed.mjs
  function IndexDeferred(type, indexer, options = {}) {
    return Deferred("Index", [type, indexer], options);
  }

  // node_modules/typebox/build/type/engine/object/from_cyclic.mjs
  function FromCyclic(defs, ref) {
    const target = CyclicTarget(defs, ref);
    const result = FromType8(target);
    return result;
  }

  // node_modules/typebox/build/type/engine/object/from_dependent.mjs
  function FromDependent(if_, then_, else_) {
    const evaluated = EvaluateDependent(if_, then_, else_);
    const result = FromType8(evaluated);
    return result;
  }

  // node_modules/typebox/build/type/engine/object/from_intersect.mjs
  function CollapseIntersectProperties(left, right) {
    const leftKeys = guard_exports.Keys(left).filter((key) => !guard_exports.HasPropertyKey(right, key));
    const rightKeys = guard_exports.Keys(right).filter((key) => !guard_exports.HasPropertyKey(left, key));
    const sharedKeys = guard_exports.Keys(left).filter((key) => guard_exports.HasPropertyKey(right, key));
    const leftProperties = leftKeys.reduce((result, key) => ({ ...result, [key]: left[key] }), {});
    const rightProperties = rightKeys.reduce((result, key) => ({ ...result, [key]: right[key] }), {});
    const sharedProperties = sharedKeys.reduce((result, key) => ({ ...result, [key]: EvaluateIntersect([left[key], right[key]]) }), {});
    const unique = memory_exports.Assign(leftProperties, rightProperties);
    const shared = memory_exports.Assign(unique, sharedProperties);
    return shared;
  }
  function FromIntersect(types) {
    return types.reduce((result, left) => {
      return CollapseIntersectProperties(result, FromType8(left));
    }, {});
  }

  // node_modules/typebox/build/type/engine/object/from_object.mjs
  function FromObject5(properties) {
    return properties;
  }

  // node_modules/typebox/build/type/engine/object/from_tuple.mjs
  function FromTuple(types) {
    const object = TupleToObject(Tuple(types));
    const result = FromType8(object);
    return result;
  }

  // node_modules/typebox/build/type/engine/object/from_union.mjs
  function CollapseUnionProperties(left, right) {
    const sharedKeys = guard_exports.Keys(left).filter((key) => key in right);
    const result = sharedKeys.reduce((result2, key) => {
      return { ...result2, [key]: EvaluateUnion([left[key], right[key]]) };
    }, {});
    return result;
  }
  function ReduceVariants(types, result) {
    return guard_exports.ShiftLeft(types, (left, right) => ReduceVariants(right, CollapseUnionProperties(result, FromType8(left))), () => result);
  }
  function FromUnion3(types) {
    return guard_exports.ShiftLeft(types, (left, right) => ReduceVariants(right, FromType8(left)), () => Unreachable());
  }

  // node_modules/typebox/build/type/engine/object/from_type.mjs
  function FromType8(type) {
    return IsCyclic(type) ? FromCyclic(type.$defs, type.$ref) : IsDependent(type) ? FromDependent(type.if, type.then, type.else) : IsIntersect(type) ? FromIntersect(type.allOf) : IsUnion(type) ? FromUnion3(type.anyOf) : IsTuple(type) ? FromTuple(type.items) : IsObject2(type) ? FromObject5(type.properties) : {};
  }

  // node_modules/typebox/build/type/engine/object/collapse.mjs
  function CollapseToObject(type) {
    const properties = FromType8(type);
    const result = _Object_(properties);
    return result;
  }

  // node_modules/typebox/build/type/engine/helpers/keys.mjs
  var integerKeyPattern = new RegExp("^(?:0|[1-9][0-9]*)$");
  function ConvertToIntegerKey(value) {
    const normal = `${value}`;
    return integerKeyPattern.test(normal) ? parseInt(normal) : value;
  }

  // node_modules/typebox/build/type/engine/indexed/from_array.mjs
  function NormalizeLiteral(value) {
    return Literal(ConvertToIntegerKey(value));
  }
  function NormalizeIndexerTypes(types) {
    return types.map((type) => NormalizeIndexer(type));
  }
  function NormalizeIndexer(type) {
    return IsIntersect(type) ? Intersect(NormalizeIndexerTypes(type.allOf)) : IsUnion(type) ? Union(NormalizeIndexerTypes(type.anyOf)) : IsLiteral(type) ? NormalizeLiteral(type.const) : type;
  }
  function FromArray4(type, indexer) {
    const normalizedIndexer = NormalizeIndexer(indexer);
    const check = Extends({}, normalizedIndexer, Number2());
    const result = (
      // indexer
      result_exports.IsExtendsTrueLike(check) ? type : IsLiteral(indexer) && guard_exports.IsEqual(indexer.const, "length") ? Number2() : Never()
    );
    return result;
  }

  // node_modules/typebox/build/type/engine/indexable/from_cyclic.mjs
  function FromCyclic2(defs, ref) {
    const target = CyclicTarget(defs, ref);
    const result = FromType9(target);
    return result;
  }

  // node_modules/typebox/build/type/engine/indexable/from_dependent.mjs
  function FromDependent2(if_, then_, else_) {
    const evaluated = EvaluateDependent(if_, then_, else_);
    const result = FromType9(evaluated);
    return result;
  }

  // node_modules/typebox/build/type/engine/indexable/from_enum.mjs
  function FromEnum(values) {
    const evaluated = EvaluateEnum(values);
    const result = FromType9(evaluated);
    return result;
  }

  // node_modules/typebox/build/type/engine/indexable/from_intersect.mjs
  function FromIntersect2(types) {
    const evaluated = EvaluateIntersect(types);
    const result = FromType9(evaluated);
    return result;
  }

  // node_modules/typebox/build/type/engine/indexable/from_literal.mjs
  function FromLiteral4(value) {
    const result = [`${value}`];
    return result;
  }

  // node_modules/typebox/build/type/engine/indexable/from_template_literal.mjs
  function FromTemplateLiteral2(pattern) {
    const evaluated = EvaluateTemplateLiteral(pattern);
    const result = FromType9(evaluated);
    return result;
  }

  // node_modules/typebox/build/type/engine/indexable/from_union.mjs
  function FromUnion4(types) {
    return types.reduce((result, left) => {
      return [...result, ...FromType9(left)];
    }, []);
  }

  // node_modules/typebox/build/type/engine/indexable/from_type.mjs
  function FromType9(type) {
    return IsCyclic(type) ? FromCyclic2(type.$defs, type.$ref) : IsDependent(type) ? FromDependent2(type.if, type.then, type.else) : IsEnum2(type) ? FromEnum(type.enum) : IsIntersect(type) ? FromIntersect2(type.allOf) : IsLiteral(type) ? FromLiteral4(type.const) : IsTemplateLiteral(type) ? FromTemplateLiteral2(type.pattern) : IsUnion(type) ? FromUnion4(type.anyOf) : [];
  }

  // node_modules/typebox/build/type/engine/indexable/to_indexable_keys.mjs
  function ToIndexableKeys(type) {
    const result = FromType9(type);
    return result;
  }

  // node_modules/typebox/build/type/engine/this/expand_this.mjs
  function FromTypes5(properties, types) {
    return types.map((type) => FromType10(properties, type));
  }
  function FromType10(properties, type) {
    return IsArray2(type) ? _Array_(FromType10(properties, type.items)) : IsConstructor2(type) ? Constructor(FromTypes5(properties, type.parameters), FromType10(properties, type.instanceType)) : IsFunction2(type) ? _Function_(FromTypes5(properties, type.parameters), FromType10(properties, type.returnType)) : IsTuple(type) ? Tuple(FromTypes5(properties, type.items)) : IsUnion(type) ? Union(FromTypes5(properties, type.anyOf)) : IsIntersect(type) ? Intersect(FromTypes5(properties, type.allOf)) : IsThis(type) ? _Object_(properties) : type;
  }
  function ExpandThis(properties, type) {
    const result = FromType10(properties, type);
    return result;
  }

  // node_modules/typebox/build/type/engine/indexed/from_object.mjs
  function IndexProperty(properties, key) {
    const selectedType = key in properties ? properties[key] : Never();
    const result = ExpandThis(properties, selectedType);
    return result;
  }
  function IndexProperties(properties, keys) {
    return keys.reduce((result, left) => {
      return [...result, IndexProperty(properties, left)];
    }, []);
  }
  function FromIndexer(properties, indexer) {
    const keys = ToIndexableKeys(indexer);
    const variants = IndexProperties(properties, keys);
    const result = EvaluateUnion(variants);
    return result;
  }
  var NumericKeyPattern = new RegExp(IntegerKey);
  function NumericKeys(keys) {
    const result = keys.filter((key) => NumericKeyPattern.test(key));
    return result;
  }
  function FromIndexerNumber(properties) {
    const keys = PropertyKeys(properties);
    const numericKeys = NumericKeys(keys);
    const variants = IndexProperties(properties, numericKeys);
    const result = EvaluateUnion(variants);
    return result;
  }
  function FromObject6(properties, indexer) {
    const result = IsNumber3(indexer) ? FromIndexerNumber(properties) : FromIndexer(properties, indexer);
    return result;
  }

  // node_modules/typebox/build/type/engine/indexed/array_indexer.mjs
  function ConvertLiteral(value) {
    return Literal(ConvertToIntegerKey(value));
  }
  function ArrayIndexerTypes(types) {
    return types.map((type) => FormatArrayIndexer(type));
  }
  function FormatArrayIndexer(type) {
    return IsIntersect(type) ? Intersect(ArrayIndexerTypes(type.allOf)) : IsUnion(type) ? Union(ArrayIndexerTypes(type.anyOf)) : IsLiteral(type) ? ConvertLiteral(type.const) : type;
  }

  // node_modules/typebox/build/type/engine/indexed/from_tuple.mjs
  function IndexElementsWithIndexer(types, indexer) {
    return types.reduceRight((result, right, index) => {
      const check = Extends({}, Literal(index), indexer);
      return result_exports.IsExtendsTrueLike(check) ? [right, ...result] : result;
    }, []);
  }
  function FromTupleWithIndexer(types, indexer) {
    const formattedArrayIndexer = FormatArrayIndexer(indexer);
    const elements = IndexElementsWithIndexer(types, formattedArrayIndexer);
    return EvaluateUnionFast(elements);
  }
  function FromTupleWithoutIndexer(types) {
    return EvaluateUnionFast(types);
  }
  function FromTuple2(types, indexer) {
    return (
      // length (intrinsic)
      IsLiteral(indexer) && guard_exports.IsEqual(indexer.const, "length") ? Literal(types.length) : IsNumber3(indexer) || IsInteger2(indexer) ? FromTupleWithoutIndexer(types) : FromTupleWithIndexer(types, indexer)
    );
  }

  // node_modules/typebox/build/type/engine/indexed/from_type.mjs
  function FromType11(type, indexer) {
    return IsArray2(type) ? FromArray4(type.items, indexer) : IsObject2(type) ? FromObject6(type.properties, indexer) : IsTuple(type) ? FromTuple2(type.items, indexer) : Never();
  }

  // node_modules/typebox/build/type/engine/indexed/instantiate.mjs
  function NormalizeType(type) {
    const result = IsCyclic(type) || IsDependent(type) || IsIntersect(type) || IsUnion(type) ? CollapseToObject(type) : type;
    return result;
  }
  function IndexAction(type, indexer, options) {
    const result = CanInstantiate([type, indexer]) ? memory_exports.Update(FromType11(NormalizeType(type), indexer), {}, options) : IndexDeferred(type, indexer, options);
    return result;
  }
  function IndexInstantiate(context, state, type, indexer, options) {
    const instantiatedType = InstantiateType(context, state, type);
    const instantiatedIndexer = InstantiateType(context, state, indexer);
    return IndexAction(instantiatedType, instantiatedIndexer, options);
  }

  // node_modules/typebox/build/type/action/instance_type.mjs
  function InstanceTypeDeferred(type, options = {}) {
    return Deferred("InstanceType", [type], options);
  }

  // node_modules/typebox/build/type/engine/instance_type/instantiate.mjs
  function InstanceTypeOperation(type) {
    return IsConstructor2(type) ? type["instanceType"] : Never();
  }
  function InstanceTypeAction(type, options) {
    const result = CanInstantiate([type]) ? memory_exports.Update(InstanceTypeOperation(type), {}, options) : InstanceTypeDeferred(type, options);
    return result;
  }
  function InstanceTypeInstantiate(context, state, type, options = {}) {
    const instantiatedType = InstantiateType(context, state, type);
    return InstanceTypeAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/action/keyof.mjs
  function KeyOfDeferred(type, options = {}) {
    return Deferred("KeyOf", [type], options);
  }

  // node_modules/typebox/build/type/engine/keyof/from_any.mjs
  function FromAny() {
    return Union([Number2(), String2(), Symbol2()]);
  }

  // node_modules/typebox/build/type/engine/keyof/from_array.mjs
  function FromArray5(_type) {
    return Number2();
  }

  // node_modules/typebox/build/type/engine/keyof/from_object.mjs
  function FromPropertyKeys(keys) {
    const result = keys.reduce((result2, left) => {
      return IsLiteralValue(left) ? [...result2, Literal(ConvertToIntegerKey(left))] : Unreachable();
    }, []);
    return result;
  }
  function FromObject7(properties) {
    const propertyKeys = guard_exports.Keys(properties);
    const variants = FromPropertyKeys(propertyKeys);
    const result = EvaluateUnionFast(variants);
    return result;
  }

  // node_modules/typebox/build/type/engine/keyof/from_record.mjs
  function FromRecord2(type) {
    return RecordKey(type);
  }

  // node_modules/typebox/build/type/engine/keyof/from_tuple.mjs
  function FromTuple3(types) {
    const result = types.map((_, index) => Literal(index));
    return EvaluateUnionFast(result);
  }

  // node_modules/typebox/build/type/engine/keyof/from_type.mjs
  function FromType12(type) {
    return IsAny(type) ? FromAny() : IsArray2(type) ? FromArray5(type.items) : IsObject2(type) ? FromObject7(type.properties) : IsRecord(type) ? FromRecord2(type) : IsTuple(type) ? FromTuple3(type.items) : Never();
  }

  // node_modules/typebox/build/type/engine/keyof/instantiate.mjs
  function NormalizeType2(type) {
    const result = IsCyclic(type) || IsDependent(type) || IsIntersect(type) || IsUnion(type) ? CollapseToObject(type) : type;
    return result;
  }
  function KeyOfAction(type, options) {
    return CanInstantiate([type]) ? memory_exports.Update(FromType12(NormalizeType2(type)), {}, options) : KeyOfDeferred(type, options);
  }
  function KeyOfInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return KeyOfAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/action/mapped.mjs
  function MappedDeferred(identifier, type, as, property, options = {}) {
    return Deferred("Mapped", [identifier, type, as, property], options);
  }

  // node_modules/typebox/build/type/engine/mapped/mapped_variants.mjs
  function FromTemplateLiteral3(pattern) {
    const evaluated = EvaluateTemplateLiteral(pattern);
    const result = FromType13(evaluated);
    return result;
  }
  function FromUnion5(types) {
    return types.reduce((result, left) => {
      return [...result, ...FromType13(left)];
    }, []);
  }
  function FromEnum2(values) {
    const evaluated = EvaluateEnum(values);
    const result = FromType13(evaluated);
    return result;
  }
  function FromLiteral5(value) {
    const result = guard_exports.IsNumber(value) ? [Literal(`${value}`)] : [Literal(value)];
    return result;
  }
  function FromType13(type) {
    const result = IsEnum2(type) ? FromEnum2(type.enum) : IsLiteral(type) ? FromLiteral5(type.const) : IsTemplateLiteral(type) ? FromTemplateLiteral3(type.pattern) : IsUnion(type) ? FromUnion5(type.anyOf) : [type];
    return result;
  }
  function MappedVariants(type) {
    const result = FromType13(type);
    return result;
  }

  // node_modules/typebox/build/type/engine/mapped/mapped_operation.mjs
  function CanonicalAs(instantiatedAs) {
    const result = IsTemplateLiteral(instantiatedAs) ? EvaluateTemplateLiteral(instantiatedAs.pattern) : instantiatedAs;
    return result;
  }
  function MappedVariant(context, state, identifier, variant, as, property) {
    const variantContext = memory_exports.Assign(context, { [identifier["name"]]: variant });
    const instantiatedAs = InstantiateType(variantContext, state, as);
    const canonicalAs = CanonicalAs(instantiatedAs);
    const instantiatedProperty = InstantiateType(variantContext, state, property);
    return IsLiteralNumber(canonicalAs) || IsLiteralString(canonicalAs) ? { [canonicalAs.const]: instantiatedProperty } : {};
  }
  function MappedProperties(context, state, identifier, variants, as, property) {
    return variants.reduce((result, left) => {
      return [...result, MappedVariant(context, state, identifier, left, as, property)];
    }, []);
  }
  function MappedObjects(properties) {
    return properties.reduce((result, left) => {
      return [...result, _Object_(left)];
    }, []);
  }
  function MappedOperation(context, state, identifier, type, as, property) {
    const variants = MappedVariants(type);
    const mappedProperties = MappedProperties(context, state, identifier, variants, as, property);
    const mappedObjects = MappedObjects(mappedProperties);
    const result = EvaluateIntersect(mappedObjects);
    return result;
  }

  // node_modules/typebox/build/type/engine/mapped/instantiate.mjs
  function MappedAction(context, state, identifier, type, as, property, options) {
    const result = CanInstantiate([type]) ? memory_exports.Update(MappedOperation(context, state, identifier, type, as, property), {}, options) : MappedDeferred(identifier, type, as, property, options);
    return result;
  }
  function MappedInstantiate(context, state, identifier, type, as, property, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return MappedAction(context, state, identifier, instantiatedType, as, property, options);
  }

  // node_modules/typebox/build/type/engine/module/instantiate.mjs
  function InstantiateCyclics(context, declarations, cyclicKeys) {
    const declarationContext = memory_exports.Assign(context, declarations);
    const declarationKeys = guard_exports.Keys(declarations).filter((key) => cyclicKeys.includes(key));
    return declarationKeys.reduce((result, key) => {
      return { ...result, [key]: InstantiateCyclic(declarationContext, key, declarations[key]) };
    }, {});
  }
  function InstantiateNonCyclics(context, declarations, cyclicKeys) {
    const declarationContext = memory_exports.Assign(context, declarations);
    const declarationKeys = guard_exports.Keys(declarations).filter((key) => !cyclicKeys.includes(key));
    return declarationKeys.reduce((result, key) => {
      return { ...result, [key]: InstantiateType(declarationContext, State([], []), declarations[key]) };
    }, {});
  }
  function InstantiateModule(context, declarations, options) {
    const cyclicCandidates = CyclicCandidates(declarations);
    const instantiatedCyclics = InstantiateCyclics(context, declarations, cyclicCandidates);
    const instantiatedNonCyclics = InstantiateNonCyclics(context, declarations, cyclicCandidates);
    const instantiatedModule = { ...instantiatedCyclics, ...instantiatedNonCyclics };
    return memory_exports.Update(instantiatedModule, {}, options);
  }
  function ModuleInstantiate(context, _state, declarations, options) {
    const instantiatedModule = InstantiateModule(context, declarations, options);
    return instantiatedModule;
  }

  // node_modules/typebox/build/type/action/non_nullable.mjs
  function NonNullableDeferred(type, options = {}) {
    return Deferred("NonNullable", [type], options);
  }

  // node_modules/typebox/build/type/engine/non_nullable/instantiate.mjs
  function NonNullableOperation(type) {
    const excluded = Union([Null(), Undefined()]);
    return ExcludeAction(type, excluded, {});
  }
  function NonNullableAction(type, options) {
    const result = CanInstantiate([type]) ? memory_exports.Update(NonNullableOperation(type), {}, options) : NonNullableDeferred(type, options);
    return result;
  }
  function NonNullableInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return NonNullableAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/action/omit.mjs
  function OmitDeferred(type, indexer, options = {}) {
    return Deferred("Omit", [type, indexer], options);
  }

  // node_modules/typebox/build/type/engine/indexable/to_indexable.mjs
  function ToIndexable(type) {
    const collapsed = CollapseToObject(type);
    const result = IsObject2(collapsed) ? collapsed.properties : Unreachable();
    return result;
  }

  // node_modules/typebox/build/type/engine/omit/from_type.mjs
  function FromKeys(properties, keys) {
    const result = guard_exports.Keys(properties).reduce((result2, key) => {
      return keys.includes(key) ? result2 : { ...result2, [key]: properties[key] };
    }, {});
    return result;
  }
  function FromType14(type, indexer) {
    const indexable = ToIndexable(type);
    const indexableKeys = ToIndexableKeys(indexer);
    const omitted = FromKeys(indexable, indexableKeys);
    const result = _Object_(omitted);
    return result;
  }

  // node_modules/typebox/build/type/engine/omit/instantiate.mjs
  function OmitAction(type, indexer, options) {
    const result = CanInstantiate([type, indexer]) ? memory_exports.Update(FromType14(type, indexer), {}, options) : OmitDeferred(type, indexer, options);
    return result;
  }
  function OmitInstantiate(context, state, type, indexer, options) {
    const instantiatedType = InstantiateType(context, state, type);
    const instantiatedIndexer = InstantiateType(context, state, indexer);
    return OmitAction(instantiatedType, instantiatedIndexer, options);
  }

  // node_modules/typebox/build/type/action/parameters.mjs
  function ParametersDeferred(type, options = {}) {
    return Deferred("Parameters", [type], options);
  }

  // node_modules/typebox/build/type/engine/parameters/instantiate.mjs
  function ParametersOperation(type) {
    const parameters = IsFunction2(type) ? type["parameters"] : [];
    const instantiatedParameters = InstantiateElements({}, State([], []), parameters);
    const result = Tuple(instantiatedParameters);
    return result;
  }
  function ParametersAction(type, options) {
    const result = CanInstantiate([type]) ? memory_exports.Update(ParametersOperation(type), {}, options) : ParametersDeferred(type, options);
    return result;
  }
  function ParametersInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return ParametersAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/action/partial.mjs
  function PartialDeferred(type, options = {}) {
    return Deferred("Partial", [type], options);
  }

  // node_modules/typebox/build/type/engine/partial/from_cyclic.mjs
  function FromCyclic3(defs, ref) {
    const target = CyclicTarget(defs, ref);
    const partial = FromType15(target);
    const result = Cyclic(memory_exports.Assign(defs, { [ref]: partial }), ref);
    return result;
  }

  // node_modules/typebox/build/type/engine/partial/from_dependent.mjs
  function FromDependent3(if_, then_, else_) {
    const evaluated = EvaluateDependent(if_, then_, else_);
    const result = FromType15(evaluated);
    return result;
  }

  // node_modules/typebox/build/type/engine/partial/from_intersect.mjs
  function FromIntersect3(types) {
    const evaluated = EvaluateIntersect(types);
    const result = FromType15(evaluated);
    return result;
  }

  // node_modules/typebox/build/type/engine/partial/from_union.mjs
  function FromUnion6(types) {
    const result = types.map((type) => FromType15(type));
    return Union(result);
  }

  // node_modules/typebox/build/type/engine/partial/from_object.mjs
  function FromObject8(properties) {
    const mapped = guard_exports.Keys(properties).reduce((result2, left) => {
      return { ...result2, [left]: AddOptional(properties[left]) };
    }, {});
    const result = _Object_(mapped);
    return result;
  }

  // node_modules/typebox/build/type/engine/partial/from_type.mjs
  function FromType15(type) {
    return IsCyclic(type) ? FromCyclic3(type.$defs, type.$ref) : IsDependent(type) ? FromDependent3(type.if, type.then, type.else) : IsIntersect(type) ? FromIntersect3(type.allOf) : IsUnion(type) ? FromUnion6(type.anyOf) : IsObject2(type) ? FromObject8(type.properties) : _Object_({});
  }

  // node_modules/typebox/build/type/engine/partial/instantiate.mjs
  function PartialAction(type, options) {
    const result = CanInstantiate([type]) ? memory_exports.Update(FromType15(type), {}, options) : PartialDeferred(type, options);
    return result;
  }
  function PartialInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return PartialAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/action/pick.mjs
  function PickDeferred(type, indexer, options = {}) {
    return Deferred("Pick", [type, indexer], options);
  }

  // node_modules/typebox/build/type/engine/pick/from_type.mjs
  function FromKeys2(properties, keys) {
    const result = guard_exports.Keys(properties).reduce((result2, key) => {
      return keys.includes(key) ? memory_exports.Assign(result2, { [key]: properties[key] }) : result2;
    }, {});
    return result;
  }
  function FromType16(type, indexer) {
    const indexable = ToIndexable(type);
    const keys = ToIndexableKeys(indexer);
    const applied = FromKeys2(indexable, keys);
    const result = _Object_(applied);
    return result;
  }

  // node_modules/typebox/build/type/engine/pick/instantiate.mjs
  function PickAction(type, indexer, options) {
    const result = CanInstantiate([type, indexer]) ? memory_exports.Update(FromType16(type, indexer), {}, options) : PickDeferred(type, indexer, options);
    return result;
  }
  function PickInstantiate(context, state, type, indexer, options) {
    const instantiatedType = InstantiateType(context, state, type);
    const instantiatedIndexer = InstantiateType(context, state, indexer);
    return PickAction(instantiatedType, instantiatedIndexer, options);
  }

  // node_modules/typebox/build/type/action/readonly_object.mjs
  function ReadonlyObjectDeferred(type, options = {}) {
    return Deferred("ReadonlyObject", [type], options);
  }

  // node_modules/typebox/build/type/engine/readonly_object/from_array.mjs
  function FromArray6(type) {
    const result = AddImmutable(_Array_(type));
    return result;
  }

  // node_modules/typebox/build/type/engine/readonly_object/from_cyclic.mjs
  function FromCyclic4(defs, ref) {
    const target = CyclicTarget(defs, ref);
    const partial = FromType17(target);
    const result = Cyclic(memory_exports.Assign(defs, { [ref]: partial }), ref);
    return result;
  }

  // node_modules/typebox/build/type/engine/readonly_object/from_dependent.mjs
  function FromDependent4(if_, then_, else_) {
    const evaluated = EvaluateDependent(if_, then_, else_);
    const result = FromType17(evaluated);
    return result;
  }

  // node_modules/typebox/build/type/engine/readonly_object/from_intersect.mjs
  function FromIntersect4(types) {
    const evaluated = EvaluateIntersect(types);
    const result = FromType17(evaluated);
    return result;
  }

  // node_modules/typebox/build/type/engine/readonly_object/from_object.mjs
  function FromObject9(properties) {
    const mapped = guard_exports.Keys(properties).reduce((result2, left) => {
      return { ...result2, [left]: AddReadonly(properties[left]) };
    }, {});
    const result = _Object_(mapped);
    return result;
  }

  // node_modules/typebox/build/type/engine/readonly_object/from_tuple.mjs
  function FromTuple4(types) {
    const result = AddImmutable(Tuple(types));
    return result;
  }

  // node_modules/typebox/build/type/engine/readonly_object/from_union.mjs
  function FromUnion7(types) {
    const result = types.map((type) => FromType17(type));
    return Union(result);
  }

  // node_modules/typebox/build/type/engine/readonly_object/from_type.mjs
  function FromType17(type) {
    return IsArray2(type) ? FromArray6(type.items) : IsCyclic(type) ? FromCyclic4(type.$defs, type.$ref) : IsDependent(type) ? FromDependent4(type.if, type.then, type.else) : IsIntersect(type) ? FromIntersect4(type.allOf) : IsObject2(type) ? FromObject9(type.properties) : IsTuple(type) ? FromTuple4(type.items) : IsUnion(type) ? FromUnion7(type.anyOf) : type;
  }

  // node_modules/typebox/build/type/engine/readonly_object/instantiate.mjs
  function ReadonlyObjectAction(type, options) {
    const result = CanInstantiate([type]) ? memory_exports.Update(FromType17(type), {}, options) : ReadonlyObjectDeferred(type);
    return result;
  }
  function ReadonlyObjectInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return ReadonlyObjectAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/engine/ref/instantiate.mjs
  function RefInstantiate(context, state, type, ref) {
    return state.visited.includes(ref) ? type : ref in context ? InstantiateType(context, State(state["callstack"], [...state["visited"], ref]), context[ref]) : type;
  }

  // node_modules/typebox/build/type/engine/required/from_cyclic.mjs
  function FromCyclic5(defs, ref) {
    const target = CyclicTarget(defs, ref);
    const partial = FromType18(target);
    const result = Cyclic(memory_exports.Assign(defs, { [ref]: partial }), ref);
    return result;
  }

  // node_modules/typebox/build/type/engine/required/from_dependent.mjs
  function FromDependent5(if_, then_, else_) {
    const evaluated = EvaluateDependent(if_, then_, else_);
    const result = FromType18(evaluated);
    return result;
  }

  // node_modules/typebox/build/type/engine/required/from_intersect.mjs
  function FromIntersect5(types) {
    const evaluated = EvaluateIntersect(types);
    const result = FromType18(evaluated);
    return result;
  }

  // node_modules/typebox/build/type/engine/required/from_union.mjs
  function FromUnion8(types) {
    const result = types.map((type) => FromType18(type));
    return Union(result);
  }

  // node_modules/typebox/build/type/engine/required/from_object.mjs
  function FromObject10(properties) {
    const mapped = guard_exports.Keys(properties).reduce((result2, left) => {
      return { ...result2, [left]: RemoveOptional(properties[left]) };
    }, {});
    const result = _Object_(mapped);
    return result;
  }

  // node_modules/typebox/build/type/engine/required/from_type.mjs
  function FromType18(type) {
    return IsCyclic(type) ? FromCyclic5(type.$defs, type.$ref) : IsDependent(type) ? FromDependent5(type.if, type.then, type.else) : IsIntersect(type) ? FromIntersect5(type.allOf) : IsUnion(type) ? FromUnion8(type.anyOf) : IsObject2(type) ? FromObject10(type.properties) : _Object_({});
  }

  // node_modules/typebox/build/type/action/required.mjs
  function RequiredDeferred(type, options = {}) {
    return Deferred("Required", [type], options);
  }

  // node_modules/typebox/build/type/engine/required/instantiate.mjs
  function RequiredAction(type, options) {
    const result = CanInstantiate([type]) ? memory_exports.Update(FromType18(type), {}, options) : RequiredDeferred(type, options);
    return result;
  }
  function RequiredInstantiate(context, state, type, options) {
    const instaniatedType = InstantiateType(context, state, type);
    return RequiredAction(instaniatedType, options);
  }

  // node_modules/typebox/build/type/action/return_type.mjs
  function ReturnTypeDeferred(type, options = {}) {
    return Deferred("ReturnType", [type], options);
  }

  // node_modules/typebox/build/type/engine/return_type/instantiate.mjs
  function ReturnTypeOperation(type) {
    return IsFunction2(type) ? type["returnType"] : Never();
  }
  function ReturnTypeAction(type, options) {
    const result = CanInstantiate([type]) ? memory_exports.Update(ReturnTypeOperation(type), {}, options) : ReturnTypeDeferred(type, options);
    return result;
  }
  function ReturnTypeInstantiate(context, state, type, options = {}) {
    const instantiatedType = InstantiateType(context, state, type);
    return ReturnTypeAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/action/with.mjs
  function WithDeferred(type, options) {
    return Deferred("With", [type, options], {});
  }
  function With(type, options) {
    return WithAction(type, options);
  }

  // node_modules/typebox/build/type/engine/with/instantiate.mjs
  function WithAction(type, options) {
    const result = CanInstantiate([type]) ? memory_exports.Update(type, {}, options) : WithDeferred(type, options);
    return result;
  }
  function WithInstantiate(context, state, type, options) {
    const instaniatedType = InstantiateType(context, state, type);
    return WithAction(instaniatedType, options);
  }

  // node_modules/typebox/build/type/engine/rest/spread.mjs
  function SpreadElement(type) {
    const result = IsRest(type) ? IsTuple(type.items) ? RestSpread(type.items.items) : IsInfer(type.items) ? [type] : IsRef2(type.items) ? [type] : [Never()] : [type];
    return result;
  }
  function RestSpread(types) {
    const result = types.reduce((result2, left) => {
      return [...result2, ...SpreadElement(left)];
    }, []);
    return result;
  }

  // node_modules/typebox/build/type/engine/instantiate.mjs
  function State(callstack, visited2) {
    return { callstack, visited: visited2 };
  }
  function CanInstantiate(types) {
    return guard_exports.ShiftLeft(types, (left, right) => IsRef2(left) ? false : CanInstantiate(right), () => true);
  }
  function InstantiateProperties(context, state, properties) {
    return guard_exports.Keys(properties).reduce((result, key) => {
      return { ...result, [key]: InstantiateType(context, state, properties[key]) };
    }, {});
  }
  function InstantiateElements(context, state, types) {
    const elements = InstantiateTypes(context, state, types);
    const result = RestSpread(elements);
    return result;
  }
  function InstantiateTypes(context, state, types) {
    return types.map((type) => InstantiateType(context, state, type));
  }
  function WithModifiers(type, instantiatedType) {
    const withOptional = IsOptional(type) ? AddOptionalAction(instantiatedType, {}) : instantiatedType;
    const withReadonly = IsReadonly(type) ? AddReadonlyAction(withOptional, {}) : withOptional;
    const withImmutable = IsImmutable(type) ? AddImmutableAction(withReadonly, {}) : withReadonly;
    return withImmutable;
  }
  function InstantiateDeferred(context, state, action, parameters, options) {
    return (
      // Modifiers
      guard_exports.IsEqual(action, "AddImmutable") ? AddImmutableInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "RemoveImmutable") ? RemoveImmutableInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "AddReadonly") ? AddReadonlyInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "RemoveReadonly") ? RemoveReadonlyInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "AddOptional") ? AddOptionalInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "RemoveOptional") ? RemoveOptionalInstantiate(context, state, parameters[0], options) : (
        // Actions
        guard_exports.IsEqual(action, "Capitalize") ? CapitalizeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Conditional") ? ConditionalInstantiate(context, state, parameters[0], parameters[1], parameters[2], parameters[3], options) : guard_exports.IsEqual(action, "ConstructorParameters") ? ConstructorParametersInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Evaluate") ? EvaluateInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Exclude") ? ExcludeInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Extract") ? ExtractInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Index") ? IndexInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "InstanceType") ? InstanceTypeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Interface") ? InterfaceInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "KeyOf") ? KeyOfInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Lowercase") ? LowercaseInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Mapped") ? MappedInstantiate(context, state, parameters[0], parameters[1], parameters[2], parameters[3], options) : guard_exports.IsEqual(action, "Module") ? ModuleInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "NonNullable") ? NonNullableInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Pick") ? PickInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Parameters") ? ParametersInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Partial") ? PartialInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Omit") ? OmitInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "ReadonlyObject") ? ReadonlyObjectInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Record") ? RecordInstantiate(context, state, parameters[0], parameters[1], options) : guard_exports.IsEqual(action, "Required") ? RequiredInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "ReturnType") ? ReturnTypeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "TemplateLiteral") ? TemplateLiteralInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Uncapitalize") ? UncapitalizeInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "Uppercase") ? UppercaseInstantiate(context, state, parameters[0], options) : guard_exports.IsEqual(action, "With") ? WithInstantiate(context, state, parameters[0], parameters[1]) : Deferred(action, parameters, options)
      )
    );
  }
  function InstantiateImmediate(context, state, type) {
    const instantiatedType = IsRef2(type) ? RefInstantiate(context, state, type, type.$ref) : IsArray2(type) ? _Array_(InstantiateType(context, state, type.items), ArrayOptions(type)) : IsCall(type) ? CallInstantiate(context, state, type.target, type.arguments) : IsConstructor2(type) ? Constructor(InstantiateTypes(context, state, type.parameters), InstantiateType(context, state, type.instanceType), ConstructorOptions(type)) : IsFunction2(type) ? _Function_(InstantiateTypes(context, state, type.parameters), InstantiateType(context, state, type.returnType), FunctionOptions(type)) : IsDependent(type) ? Dependent(InstantiateType(context, state, type.if), InstantiateType(context, state, type.then), InstantiateType(context, state, type.else), DependentOptions(type)) : IsIntersect(type) ? Intersect(InstantiateTypes(context, state, type.allOf), IntersectOptions(type)) : IsObject2(type) ? _Object_(InstantiateProperties(context, state, type.properties), ObjectOptions(type)) : IsRecord(type) ? RecordFromPattern(RecordPattern(type), InstantiateType(context, state, RecordValue(type))) : IsRest(type) ? Rest(InstantiateType(context, state, type.items)) : IsTuple(type) ? Tuple(InstantiateElements(context, state, type.items), TupleOptions(type)) : IsUnion(type) ? Union(InstantiateTypes(context, state, type.anyOf), UnionOptions(type)) : type;
    const withModifiers = WithModifiers(type, instantiatedType);
    return withModifiers;
  }
  function InstantiateType(context, state, type) {
    const result = IsDeferred(type) ? InstantiateDeferred(context, state, type.action, type.parameters, type.options) : InstantiateImmediate(context, state, type);
    return result;
  }
  function Instantiate(context, type) {
    return InstantiateType(context, State([], []), type);
  }

  // node_modules/typebox/build/type/engine/immutable/instantiate_add.mjs
  function AddImmutableOperation(type) {
    return memory_exports.Update(type, { "~immutable": true }, {});
  }
  function AddImmutableAction(type, options) {
    const result = memory_exports.Update(AddImmutableOperation(type), {}, options);
    return result;
  }
  function AddImmutableInstantiate(context, state, type, options) {
    const instantiatedType = InstantiateType(context, state, type);
    return AddImmutableAction(instantiatedType, options);
  }

  // node_modules/typebox/build/type/action/_add_immutable.mjs
  function AddImmutable(type, options = {}) {
    return AddImmutableAction(type, options);
  }

  // node_modules/typebox/build/type/action/evaluate.mjs
  function Evaluate(type, options = {}) {
    return EvaluateAction(type, options);
  }

  // node_modules/typebox/build/type/engine/priority/priority.mjs
  function Comparer(left, right) {
    const compareResult = Compare(left, right);
    return guard_exports.IsEqual(compareResult, CompareResultRightInside) ? 1 : guard_exports.IsEqual(compareResult, CompareResultDisjoint) ? 1 : 0;
  }
  function Insert(type, types, result = []) {
    return guard_exports.ShiftLeft(types, (left, right) => guard_exports.IsEqual(Comparer(type, left), 1) ? Insert(type, right, [...result, left]) : [...result, type, ...types], () => [...result, type]);
  }
  function Sort(types, result = []) {
    return guard_exports.ShiftLeft(types, (left, right) => Sort(right, Insert(left, result)), () => result);
  }
  function Priority(types) {
    const result = Sort(types);
    return result;
  }

  // node_modules/typebox/build/value/clean/from_array.mjs
  function FromArray7(context, type, value) {
    if (!guard_exports.IsArray(value))
      return value;
    return value.map((value2) => FromType19(context, type.items, value2));
  }

  // node_modules/typebox/build/value/clean/from_cyclic.mjs
  function FromCyclic6(context, type, value) {
    return FromType19({ ...context, ...type.$defs }, Ref2(type.$ref), value);
  }

  // node_modules/typebox/build/value/clean/from_intersect.mjs
  function EvaluateIntersection(context, type) {
    const additionalProperties = guard_exports.HasPropertyKey(type, "unevaluatedProperties") ? { additionalProperties: type.unevaluatedProperties } : {};
    const instantiated = Instantiate(context, type);
    const evaluated = Evaluate(instantiated);
    return IsObject2(evaluated) ? With(evaluated, additionalProperties) : evaluated;
  }
  function FromIntersect6(context, type, value) {
    const evaluated = EvaluateIntersection(context, type);
    return FromType19(context, evaluated, value);
  }

  // node_modules/typebox/build/value/clean/additional.mjs
  function GetAdditionalProperties(type) {
    const additionalProperties = guard_exports.HasPropertyKey(type, "additionalProperties") ? type.additionalProperties : void 0;
    return additionalProperties;
  }

  // node_modules/typebox/build/value/clean/from_object.mjs
  function FromObject11(context, type, value) {
    if (!guard_exports.IsObject(value) || guard_exports.IsArray(value))
      return value;
    const additionalProperties = GetAdditionalProperties(type);
    for (const key of guard_exports.Keys(value)) {
      if (guard_exports.HasPropertyKey(type.properties, key)) {
        value[key] = FromType19(context, type.properties[key], value[key]);
        continue;
      }
      const unknownCheck = (
        // 1. additionalProperties: true
        guard_exports.IsBoolean(additionalProperties) && guard_exports.IsEqual(additionalProperties, true) || IsSchema2(additionalProperties) && Check2(context, additionalProperties, value[key])
      );
      if (unknownCheck) {
        value[key] = FromType19(context, additionalProperties, value[key]);
        continue;
      }
      delete value[key];
    }
    return value;
  }

  // node_modules/typebox/build/value/clean/from_record.mjs
  function FromRecord3(context, type, value) {
    if (!guard_exports.IsObject(value))
      return value;
    const additionalProperties = GetAdditionalProperties(type);
    const [recordPattern, recordValue] = [new RegExp(RecordPattern(type)), RecordValue(type)];
    for (const key of guard_exports.Keys(value)) {
      if (recordPattern.test(key)) {
        value[key] = FromType19(context, recordValue, value[key]);
        continue;
      }
      const unknownCheck = (
        // 1. additionalProperties: true
        guard_exports.IsBoolean(additionalProperties) && guard_exports.IsEqual(additionalProperties, true) || IsSchema2(additionalProperties) && Check2(context, additionalProperties, value[key])
      );
      if (unknownCheck) {
        value[key] = FromType19(context, additionalProperties, value[key]);
        continue;
      }
      delete value[key];
    }
    return value;
  }

  // node_modules/typebox/build/value/clean/from_ref.mjs
  function FromRef5(context, type, value) {
    return guard_exports.HasPropertyKey(context, type.$ref) ? FromType19(context, context[type.$ref], value) : value;
  }

  // node_modules/typebox/build/value/clean/from_tuple.mjs
  function FromTuple5(context, schema, value) {
    if (!guard_exports.IsArray(value))
      return value;
    const length = Math.min(value.length, schema.items.length);
    for (let index = 0; index < length; index++) {
      value[index] = FromType19(context, schema.items[index], value[index]);
    }
    return guard_exports.IsGreaterThan(value.length, length) ? value.slice(0, length) : value;
  }

  // node_modules/typebox/build/value/clone/clone.mjs
  function Clone2(value) {
    return Clone(value);
  }

  // node_modules/typebox/build/value/clean/from_union.mjs
  function FromUnion9(context, type, value) {
    for (const schema of type.anyOf) {
      const clean = FromType19(context, schema, Clone2(value));
      if (Check2(context, schema, clean))
        return clean;
    }
    return value;
  }

  // node_modules/typebox/build/value/clean/from_type.mjs
  function FromType19(context, type, value) {
    return IsArray2(type) ? FromArray7(context, type, value) : IsCyclic(type) ? FromCyclic6(context, type, value) : IsIntersect(type) ? FromIntersect6(context, type, value) : IsObject2(type) ? FromObject11(context, type, value) : IsRecord(type) ? FromRecord3(context, type, value) : IsRef2(type) ? FromRef5(context, type, value) : IsTuple(type) ? FromTuple5(context, type, value) : IsUnion(type) ? FromUnion9(context, type, value) : value;
  }

  // node_modules/typebox/build/value/shared/union_priority_sort.mjs
  function Modifiers(type, next) {
    for (const key of guard_default.Keys(type)) {
      if (guard_default.HasPropertyKey(next, key))
        continue;
      next[key] = type[key];
    }
    return next;
  }
  function FromProperties4(properties) {
    const result = {};
    for (const key of guard_default.Keys(properties))
      result[key] = FromType20(properties[key]);
    return result;
  }
  function FromPriorityTypes(types) {
    return FromTypes6(Priority(types));
  }
  function FromTypes6(types) {
    return types.map((type) => FromType20(type));
  }
  function FromType20(type) {
    const next = IsArray2(type) ? _Array_(FromType20(type.items), ArrayOptions(type)) : IsIntersect(type) ? Intersect(FromTypes6(type.allOf)) : IsUnion(type) ? Union(FromPriorityTypes(type.anyOf)) : IsObject2(type) ? _Object_(FromProperties4(type.properties)) : IsRecord(type) ? Record(RecordKey(type), FromType20(RecordValue(type))) : IsTuple(type) ? Tuple(FromTypes6(type.items)) : type;
    return Modifiers(type, next);
  }
  function UnionPrioritySort(type) {
    const result = FromType20(type);
    return result;
  }

  // node_modules/typebox/build/value/clean/clean.mjs
  function Clean(...args) {
    const [context, type, value] = arguments_exports.Match(args, {
      3: (context2, type2, value2) => [context2, type2, value2],
      2: (type2, value2) => [{}, type2, value2]
    });
    const sorted = settings_exports.Get().unionPrioritySort ? UnionPrioritySort(type) : type;
    return FromType19(context, sorted, value);
  }

  // node_modules/typebox/build/value/convert/try/try.mjs
  var try_exports = {};
  __export(try_exports, {
    Fail: () => Fail,
    IsOk: () => IsOk,
    Ok: () => Ok,
    TryArray: () => TryArray,
    TryBigInt: () => TryBigInt,
    TryBoolean: () => TryBoolean,
    TryNull: () => TryNull,
    TryNumber: () => TryNumber,
    TryString: () => TryString,
    TryUndefined: () => TryUndefined
  });

  // node_modules/typebox/build/value/convert/try/try_result.mjs
  function IsOk(value) {
    return guard_exports.IsObject(value) && guard_exports.HasPropertyKey(value, "value");
  }
  function Ok(value) {
    return { value };
  }
  function Fail() {
    return void 0;
  }

  // node_modules/typebox/build/value/convert/try/try_array.mjs
  function TryArray(value) {
    return guard_exports.IsArray(value) ? Ok(value) : Ok([value]);
  }

  // node_modules/typebox/build/value/convert/try/try_bigint.mjs
  function FromBoolean2(value) {
    return guard_exports.IsEqual(value, true) ? Ok(BigInt(1)) : Ok(BigInt(0));
  }
  var bigintPattern = /^-?(0|[1-9]\d*)n$/;
  var decimalPattern = /^-?(0|[1-9]\d*)\.\d+$/;
  var integerPattern = /^-?(0|[1-9]\d*)$/;
  function IsStringBigIntLike(value) {
    return bigintPattern.test(value);
  }
  function IsStringDecimalLike(value) {
    return decimalPattern.test(value);
  }
  function IsStringIntegerLike(value) {
    return integerPattern.test(value);
  }
  function FromString2(value) {
    const lowercase = value.toLowerCase();
    return IsStringBigIntLike(value) ? Ok(BigInt(value.slice(0, value.length - 1))) : IsStringDecimalLike(value) ? Ok(BigInt(value.split(".")[0])) : IsStringIntegerLike(value) ? Ok(BigInt(value)) : guard_exports.IsEqual(lowercase, "false") ? Ok(BigInt(0)) : guard_exports.IsEqual(lowercase, "true") ? Ok(BigInt(1)) : Fail();
  }
  function TryBigInt(value) {
    return guard_exports.IsBigInt(value) ? Ok(value) : guard_exports.IsBoolean(value) ? FromBoolean2(value) : guard_exports.IsNumber(value) ? Ok(BigInt(Math.trunc(value))) : guard_exports.IsNull(value) ? Ok(BigInt(0)) : guard_exports.IsString(value) ? FromString2(value) : guard_exports.IsUndefined(value) ? Ok(BigInt(0)) : Fail();
  }

  // node_modules/typebox/build/value/convert/try/try_boolean.mjs
  function FromBigInt2(value) {
    return guard_exports.IsEqual(value, BigInt(0)) ? Ok(false) : guard_exports.IsEqual(value, BigInt(1)) ? Ok(true) : Fail();
  }
  function FromNumber2(value) {
    return guard_exports.IsEqual(value, 0) ? Ok(false) : guard_exports.IsEqual(value, 1) ? Ok(true) : Fail();
  }
  function FromString3(value) {
    return guard_exports.IsEqual(value.toLowerCase(), "false") ? Ok(false) : guard_exports.IsEqual(value.toLowerCase(), "true") ? Ok(true) : guard_exports.IsEqual(value, "0") ? Ok(false) : guard_exports.IsEqual(value, "1") ? Ok(true) : Fail();
  }
  function TryBoolean(value) {
    return guard_exports.IsBigInt(value) ? FromBigInt2(value) : guard_exports.IsBoolean(value) ? Ok(value) : guard_exports.IsNumber(value) ? FromNumber2(value) : guard_exports.IsNull(value) ? Ok(false) : guard_exports.IsString(value) ? FromString3(value) : guard_exports.IsUndefined(value) ? Ok(false) : Fail();
  }

  // node_modules/typebox/build/value/convert/try/try_null.mjs
  function FromBigInt3(value) {
    return guard_exports.IsEqual(value, BigInt(0)) ? Ok(null) : Fail();
  }
  function FromBoolean3(value) {
    return guard_exports.IsEqual(value, false) ? Ok(null) : Fail();
  }
  function FromNumber3(value) {
    return guard_exports.IsEqual(value, 0) ? Ok(null) : Fail();
  }
  function FromString4(value) {
    const lowercase = value.toLowerCase();
    const predicate = guard_exports.IsEqual(lowercase, "undefined") || guard_exports.IsEqual(lowercase, "null") || guard_exports.IsEqual(value, "") || guard_exports.IsEqual(value, "0");
    return predicate ? Ok(null) : Fail();
  }
  function TryNull(value) {
    return guard_exports.IsBigInt(value) ? FromBigInt3(value) : guard_exports.IsBoolean(value) ? FromBoolean3(value) : guard_exports.IsNumber(value) ? FromNumber3(value) : guard_exports.IsNull(value) ? Ok(null) : guard_exports.IsString(value) ? FromString4(value) : guard_exports.IsUndefined(value) ? Ok(null) : Fail();
  }

  // node_modules/typebox/build/value/convert/try/try_number.mjs
  var maxBigInt = BigInt(Number.MAX_SAFE_INTEGER);
  var minBigInt = BigInt(Number.MIN_SAFE_INTEGER);
  function FromBigInt4(value) {
    return value <= maxBigInt && value >= minBigInt ? Ok(Number(value)) : Fail();
  }
  function FromBoolean4(value) {
    return Ok(value ? 1 : 0);
  }
  function FromString5(value) {
    const coerced = +value;
    if (guard_exports.IsNumber(coerced))
      return Ok(coerced);
    const lowercase = value.toLowerCase();
    if (guard_exports.IsEqual(lowercase, "false"))
      return Ok(0);
    if (guard_exports.IsEqual(lowercase, "true"))
      return Ok(1);
    const result = TryBigInt(value);
    if (IsOk(result))
      return result.value <= maxBigInt && result.value >= minBigInt ? Ok(Number(result.value)) : Fail();
    return Fail();
  }
  function TryNumber(value) {
    return guard_exports.IsBigInt(value) ? FromBigInt4(value) : guard_exports.IsBoolean(value) ? FromBoolean4(value) : guard_exports.IsNumber(value) ? Ok(value) : guard_exports.IsNull(value) ? Ok(0) : guard_exports.IsString(value) ? FromString5(value) : guard_exports.IsUndefined(value) ? Ok(0) : Fail();
  }

  // node_modules/typebox/build/value/convert/try/try_string.mjs
  function TryString(value) {
    return guard_exports.IsBigInt(value) ? Ok(value.toString()) : guard_exports.IsBoolean(value) ? Ok(value.toString()) : guard_exports.IsNumber(value) ? Ok(value.toString()) : guard_exports.IsNull(value) ? Ok("null") : guard_exports.IsString(value) ? Ok(value) : guard_exports.IsUndefined(value) ? Ok("") : Fail();
  }

  // node_modules/typebox/build/value/convert/try/try_undefined.mjs
  function FromBigInt5(value) {
    return guard_exports.IsEqual(value, BigInt(0)) ? Ok(void 0) : Fail();
  }
  function FromBoolean5(value) {
    return guard_exports.IsEqual(value, false) ? Ok(void 0) : Fail();
  }
  function FromNumber4(value) {
    return guard_exports.IsEqual(value, 0) ? Ok(void 0) : Fail();
  }
  function FromString6(value) {
    const lowercase = value.toLowerCase();
    const predicate = guard_exports.IsEqual(lowercase, "undefined") || guard_exports.IsEqual(lowercase, "null") || guard_exports.IsEqual(value, "") || guard_exports.IsEqual(value, "0");
    return predicate ? Ok(void 0) : Fail();
  }
  function TryUndefined(value) {
    return guard_exports.IsBigInt(value) ? FromBigInt5(value) : guard_exports.IsBoolean(value) ? FromBoolean5(value) : guard_exports.IsNumber(value) ? FromNumber4(value) : guard_exports.IsNull(value) ? Ok(void 0) : guard_exports.IsString(value) ? FromString6(value) : guard_exports.IsUndefined(value) ? Ok(value) : Fail();
  }

  // node_modules/typebox/build/value/convert/from_array.mjs
  function FromArray8(context, type, value) {
    const result = try_exports.TryArray(value);
    return result.value.map((value2) => FromType21(context, type.items, value2));
  }

  // node_modules/typebox/build/value/convert/from_bigint.mjs
  function FromBigInt6(_context, _type, value) {
    const result = try_exports.TryBigInt(value);
    return try_exports.IsOk(result) ? result.value : value;
  }

  // node_modules/typebox/build/value/convert/from_boolean.mjs
  function FromBoolean6(_context, _type, value) {
    const result = try_exports.TryBoolean(value);
    return try_exports.IsOk(result) ? result.value : value;
  }

  // node_modules/typebox/build/value/convert/from_cyclic.mjs
  function FromCyclic7(context, type, value) {
    return FromType21({ ...context, ...type.$defs }, Ref2(type.$ref), value);
  }

  // node_modules/typebox/build/value/convert/from_enum.mjs
  function FromEnum3(context, type, value) {
    return FromType21(context, Evaluate(type), value);
  }

  // node_modules/typebox/build/value/convert/from_integer.mjs
  function FromInteger(_context, _type, value) {
    const result = try_exports.TryNumber(value);
    return try_exports.IsOk(result) ? Math.trunc(result.value) : value;
  }

  // node_modules/typebox/build/value/convert/from_intersect.mjs
  function FromIntersect7(context, type, value) {
    const instantiated = Instantiate(context, type);
    const evaluated = Evaluate(instantiated);
    return FromType21(context, evaluated, value);
  }

  // node_modules/typebox/build/value/convert/from_literal.mjs
  function FromLiteralBigInt(_context, type, value) {
    const result = try_exports.TryBigInt(value);
    return try_exports.IsOk(result) && guard_exports.IsEqual(type.const, result.value) ? result.value : value;
  }
  function FromLiteralBoolean(_context, type, value) {
    const result = try_exports.TryBoolean(value);
    return try_exports.IsOk(result) && guard_exports.IsEqual(type.const, result.value) ? result.value : value;
  }
  function FromLiteralNumber(_context, type, value) {
    const result = try_exports.TryNumber(value);
    return try_exports.IsOk(result) && guard_exports.IsEqual(type.const, result.value) ? result.value : value;
  }
  function FromLiteralString(_context, type, value) {
    const result = try_exports.TryString(value);
    return try_exports.IsOk(result) && guard_exports.IsEqual(type.const, result.value) ? result.value : value;
  }
  function FromLiteral6(context, type, value) {
    if (guard_exports.IsEqual(type.const, value))
      return value;
    return IsLiteralBigInt(type) ? FromLiteralBigInt(context, type, value) : IsLiteralBoolean(type) ? FromLiteralBoolean(context, type, value) : IsLiteralNumber(type) ? FromLiteralNumber(context, type, value) : IsLiteralString(type) ? FromLiteralString(context, type, value) : Unreachable();
  }

  // node_modules/typebox/build/value/convert/from_null.mjs
  function FromNull2(_context, _type, value) {
    const result = try_exports.TryNull(value);
    return try_exports.IsOk(result) ? result.value : value;
  }

  // node_modules/typebox/build/value/convert/from_number.mjs
  function FromNumber5(_context, _type, value) {
    const result = try_exports.TryNumber(value);
    return try_exports.IsOk(result) ? result.value : value;
  }

  // node_modules/typebox/build/value/convert/from_additional.mjs
  function FromAdditionalProperties(context, entries, additionalProperties, value) {
    const keys = guard_exports.Keys(value);
    for (const [regexp, _] of entries) {
      for (const key of keys) {
        if (!regexp.test(key)) {
          value[key] = FromType21(context, additionalProperties, value[key]);
        }
      }
    }
    return value;
  }

  // node_modules/typebox/build/value/shared/optional_undefined.mjs
  function IsOptionalUndefined(property, key, value) {
    return IsOptional(property) && guard_exports.IsUndefined(value[key]);
  }

  // node_modules/typebox/build/value/convert/from_object.mjs
  function FromProperties5(context, type, value) {
    const entries = guard_exports.EntriesRegExp(type.properties);
    const keys = guard_exports.Keys(value);
    for (const [regexp, property] of entries) {
      for (const key of keys) {
        if (!regexp.test(key) || IsOptionalUndefined(property, key, value))
          continue;
        value[key] = FromType21(context, property, value[key]);
      }
    }
    return guard_exports.HasPropertyKey(type, "additionalProperties") && guard_exports.IsObject(type.additionalProperties) ? FromAdditionalProperties(context, entries, type.additionalProperties, value) : value;
  }
  function FromObject12(context, type, value) {
    return guard_exports.IsObjectNotArray(value) ? FromProperties5(context, type, value) : value;
  }

  // node_modules/typebox/build/value/convert/from_record.mjs
  function FromPatternProperties(context, type, value) {
    const entries = guard_exports.EntriesRegExp(type.patternProperties);
    const keys = guard_exports.Keys(value);
    for (const [regexp, schema] of entries) {
      for (const key of keys) {
        if (regexp.test(key)) {
          value[key] = FromType21(context, schema, value[key]);
        }
      }
    }
    return guard_exports.HasPropertyKey(type, "additionalProperties") && guard_exports.IsObject(type.additionalProperties) ? FromAdditionalProperties(context, entries, type.additionalProperties, value) : value;
  }
  function FromRecord4(context, type, value) {
    return guard_exports.IsObjectNotArray(value) ? FromPatternProperties(context, type, value) : value;
  }

  // node_modules/typebox/build/value/convert/from_ref.mjs
  function FromRef6(context, type, value) {
    return guard_exports.HasPropertyKey(context, type.$ref) ? FromType21(context, context[type.$ref], value) : value;
  }

  // node_modules/typebox/build/value/convert/from_string.mjs
  function FromString7(_context, _type, value) {
    const result = try_exports.TryString(value);
    return try_exports.IsOk(result) ? result.value : value;
  }

  // node_modules/typebox/build/value/convert/from_template_literal.mjs
  function FromTemplateLiteral4(context, type, value) {
    return FromType21(context, Evaluate(type), value);
  }

  // node_modules/typebox/build/value/convert/from_tuple.mjs
  function FromTuple6(context, type, value) {
    if (!guard_exports.IsArray(value))
      return value;
    for (let index = 0; index < Math.min(type.items.length, value.length); index++) {
      value[index] = FromType21(context, type.items[index], value[index]);
    }
    return value;
  }

  // node_modules/typebox/build/value/convert/from_undefined.mjs
  function FromUndefined2(_context, _type, value) {
    const result = try_exports.TryUndefined(value);
    return try_exports.IsOk(result) ? result.value : value;
  }

  // node_modules/typebox/build/value/convert/from_union.mjs
  function FromUnion10(context, type, value) {
    const matched = type.anyOf.some((type2) => Check2(context, type2, value));
    if (matched)
      return value;
    const candidates = type.anyOf.map((type2) => FromType21(context, type2, Clone2(value)));
    const selected = candidates.find((value2) => Check2(context, type, value2));
    return guard_exports.IsUndefined(selected) ? value : selected;
  }

  // node_modules/typebox/build/value/convert/from_void.mjs
  function FromVoid(_context, _type, value) {
    const result = try_exports.TryUndefined(value);
    return try_exports.IsOk(result) ? void 0 : value;
  }

  // node_modules/typebox/build/value/convert/from_type.mjs
  function FromType21(context, type, value) {
    return IsArray2(type) ? FromArray8(context, type, value) : IsBigInt2(type) ? FromBigInt6(context, type, value) : IsBoolean3(type) ? FromBoolean6(context, type, value) : IsCyclic(type) ? FromCyclic7(context, type, value) : IsEnum2(type) ? FromEnum3(context, type, value) : IsInteger2(type) ? FromInteger(context, type, value) : IsIntersect(type) ? FromIntersect7(context, type, value) : IsLiteral(type) ? FromLiteral6(context, type, value) : IsNull2(type) ? FromNull2(context, type, value) : IsNumber3(type) ? FromNumber5(context, type, value) : IsObject2(type) ? FromObject12(context, type, value) : IsRecord(type) ? FromRecord4(context, type, value) : IsRef2(type) ? FromRef6(context, type, value) : IsString3(type) ? FromString7(context, type, value) : IsTemplateLiteral(type) ? FromTemplateLiteral4(context, type, value) : IsTuple(type) ? FromTuple6(context, type, value) : IsUndefined2(type) ? FromUndefined2(context, type, value) : IsUnion(type) ? FromUnion10(context, type, value) : IsVoid(type) ? FromVoid(context, type, value) : value;
  }

  // node_modules/typebox/build/value/convert/convert.mjs
  function Convert(...args) {
    const [context, type, value] = arguments_exports.Match(args, {
      3: (context2, type2, value2) => [context2, type2, value2],
      2: (type2, value2) => [{}, type2, value2]
    });
    return FromType21(context, type, value);
  }

  // node_modules/typebox/build/value/default/from_array.mjs
  function FromArray9(context, type, value) {
    if (!guard_exports.IsArray(value))
      return value;
    for (let i = 0; i < value.length; i++) {
      value[i] = FromType22(context, type.items, value[i]);
    }
    return value;
  }

  // node_modules/typebox/build/value/default/from_cyclic.mjs
  function FromCyclic8(context, type, value) {
    return FromType22({ ...context, ...type.$defs }, Ref2(type.$ref), value);
  }

  // node_modules/typebox/build/value/default/from_default.mjs
  function FromDefault(type, value) {
    if (!guard_exports.IsUndefined(value))
      return value;
    return guard_exports.IsFunction(type.default) ? type.default() : Clone2(type.default);
  }

  // node_modules/typebox/build/value/default/from_intersect.mjs
  function FromIntersect8(context, type, value) {
    const instantiated = Instantiate(context, type);
    const evaluated = Evaluate(instantiated);
    return FromType22(context, evaluated, value);
  }

  // node_modules/typebox/build/value/default/from_object.mjs
  function FromObject13(context, type, value) {
    if (!guard_exports.IsObject(value))
      return value;
    const knownPropertyKeys = guard_exports.Keys(type.properties);
    for (const key of knownPropertyKeys) {
      const propertyValue = FromType22(context, type.properties[key], value[key]);
      const isUnassignableUndefined = guard_exports.IsUndefined(propertyValue) && (IsOptional(type.properties[key]) || !guard_exports.HasPropertyKey(type.properties[key], "default"));
      if (isUnassignableUndefined)
        continue;
      value[key] = propertyValue;
    }
    if (!IsAdditionalProperties(type) || guard_exports.IsBoolean(type.additionalProperties))
      return value;
    for (const key of guard_exports.Keys(value)) {
      if (knownPropertyKeys.includes(key))
        continue;
      value[key] = FromType22(context, type.additionalProperties, value[key]);
    }
    return value;
  }

  // node_modules/typebox/build/value/default/from_record.mjs
  function FromRecord5(context, type, value) {
    if (!guard_exports.IsObject(value))
      return value;
    const [recordKey, recordValue] = [new RegExp(RecordPattern(type)), RecordValue(type)];
    for (const key of guard_exports.Keys(value)) {
      if (!(recordKey.test(key) && IsDefault(recordValue)))
        continue;
      value[key] = FromType22(context, recordValue, value[key]);
    }
    if (!IsAdditionalProperties(type))
      return value;
    for (const key of guard_exports.Keys(value)) {
      if (recordKey.test(key))
        continue;
      value[key] = FromType22(context, type.additionalProperties, value[key]);
    }
    return value;
  }

  // node_modules/typebox/build/value/default/from_ref.mjs
  function FromRef7(context, type, value) {
    return guard_exports.HasPropertyKey(context, type.$ref) ? FromType22(context, context[type.$ref], value) : value;
  }

  // node_modules/typebox/build/value/default/from_tuple.mjs
  function FromTuple7(context, schema, value) {
    if (!guard_exports.IsArray(value))
      return value;
    const [items, max] = [schema.items, Math.max(schema.items.length, value.length)];
    for (let i = 0; i < max; i++) {
      if (i < items.length)
        value[i] = FromType22(context, items[i], value[i]);
    }
    return value;
  }

  // node_modules/typebox/build/value/default/from_union.mjs
  function FromUnion11(context, schema, value) {
    for (const inner of schema.anyOf) {
      const result = FromType22(context, inner, Clone2(value));
      if (Check2(context, inner, result)) {
        return result;
      }
    }
    return value;
  }

  // node_modules/typebox/build/value/default/from_type.mjs
  function FromType22(context, type, value) {
    const defaulted = IsDefault(type) ? FromDefault(type, value) : value;
    return IsArray2(type) ? FromArray9(context, type, defaulted) : IsCyclic(type) ? FromCyclic8(context, type, defaulted) : IsIntersect(type) ? FromIntersect8(context, type, defaulted) : IsObject2(type) ? FromObject13(context, type, defaulted) : IsRecord(type) ? FromRecord5(context, type, defaulted) : IsRef2(type) ? FromRef7(context, type, defaulted) : IsTuple(type) ? FromTuple7(context, type, defaulted) : IsUnion(type) ? FromUnion11(context, type, defaulted) : defaulted;
  }

  // node_modules/typebox/build/value/default/default.mjs
  function Default(...args) {
    const [context, type, value] = arguments_exports.Match(args, {
      3: (context2, type2, value2) => [context2, type2, value2],
      2: (type2, value2) => [{}, type2, value2]
    });
    return FromType22(context, type, value);
  }

  // node_modules/typebox/build/value/pipeline/pipeline.mjs
  function Pipeline(pipeline) {
    return (...args) => {
      const [context, type, value] = arguments_exports.Match(args, {
        3: (context2, type2, value2) => [context2, type2, value2],
        2: (type2, value2) => [{}, type2, value2]
      });
      return pipeline.reduce((result, func) => func(context, type, result), value);
    };
  }

  // node_modules/typebox/build/value/codec/callback.mjs
  function Decode2(_context, type, value) {
    return type["~codec"].decode(value);
  }
  function Encode2(_context, type, value) {
    return type["~codec"].encode(value);
  }
  function Callback(direction, context, type, value) {
    if (!IsCodec(type))
      return value;
    return guard_exports.IsEqual(direction, "Decode") ? Decode2(context, type, value) : Encode2(context, type, value);
  }

  // node_modules/typebox/build/value/codec/from_array.mjs
  function Decode3(direction, context, type, value) {
    if (!guard_exports.IsArray(value))
      return value;
    for (let i = 0; i < value.length; i++) {
      value[i] = FromType23(direction, context, type.items, value[i]);
    }
    return Callback(direction, context, type, value);
  }
  function Encode3(direction, context, type, value) {
    const exterior = Callback(direction, context, type, value);
    if (!guard_exports.IsArray(exterior))
      return exterior;
    for (let i = 0; i < exterior.length; i++) {
      exterior[i] = FromType23(direction, context, type.items, exterior[i]);
    }
    return exterior;
  }
  function FromArray10(direction, context, type, value) {
    return guard_exports.IsEqual(direction, "Decode") ? Decode3(direction, context, type, value) : Encode3(direction, context, type, value);
  }

  // node_modules/typebox/build/value/codec/from_cyclic.mjs
  function FromCyclic9(direction, context, type, value) {
    value = FromType23(direction, { ...context, ...type.$defs }, Ref2(type.$ref), value);
    return Callback(direction, context, type, value);
  }

  // node_modules/typebox/build/value/codec/from_intersect.mjs
  function MergeInteriors(interiors) {
    return interiors.reduce((results, interior) => ({ ...results, ...interior }), {});
  }
  function NonMatchingInterior(value, interiors) {
    for (const interior of interiors)
      if (!guard_exports.IsDeepEqual(value, interior))
        return interior;
    return value;
  }
  function Decode4(direction, context, type, value) {
    if (guard_exports.IsEqual(type.allOf.length, 0))
      return Callback(direction, context, type, value);
    const interiors = type.allOf.map((schema) => FromType23(direction, context, schema, Clean(schema, Clone2(value))));
    const structural = interiors.every((result) => guard_exports.IsObject(result));
    const exterior = structural ? MergeInteriors(interiors) : NonMatchingInterior(value, interiors);
    return Callback(direction, context, type, exterior);
  }
  function Encode4(direction, context, type, value) {
    if (guard_exports.IsEqual(type.allOf.length, 0))
      return Callback(direction, context, type, value);
    const exterior = Callback(direction, context, type, value);
    const interiors = type.allOf.map((schema) => FromType23(direction, context, schema, Clean(schema, Clone2(exterior))));
    const structural = interiors.every((result) => guard_exports.IsObject(result));
    if (structural)
      return MergeInteriors(interiors);
    return NonMatchingInterior(exterior, interiors);
  }
  function FromIntersect9(direction, context, type, value) {
    return guard_exports.IsEqual(direction, "Decode") ? Decode4(direction, context, type, value) : Encode4(direction, context, type, value);
  }

  // node_modules/typebox/build/value/codec/from_object.mjs
  function Decode5(direction, context, type, value) {
    if (!guard_exports.IsObjectNotArray(value))
      return value;
    for (const key of guard_exports.Keys(type.properties)) {
      if (!guard_exports.HasPropertyKey(value, key) || IsOptionalUndefined(type.properties[key], key, value))
        continue;
      value[key] = FromType23(direction, context, type.properties[key], value[key]);
    }
    return Callback(direction, context, type, value);
  }
  function Encode5(direction, context, type, value) {
    const exterior = Callback(direction, context, type, value);
    if (!guard_exports.IsObjectNotArray(exterior))
      return exterior;
    for (const key of guard_exports.Keys(type.properties)) {
      if (!guard_exports.HasPropertyKey(exterior, key) || IsOptionalUndefined(type.properties[key], key, exterior))
        continue;
      exterior[key] = FromType23(direction, context, type.properties[key], exterior[key]);
    }
    return exterior;
  }
  function FromObject14(direction, context, type, value) {
    return guard_exports.IsEqual(direction, "Decode") ? Decode5(direction, context, type, value) : Encode5(direction, context, type, value);
  }

  // node_modules/typebox/build/value/codec/from_record.mjs
  function Decode6(direction, context, type, value) {
    if (!guard_exports.IsObjectNotArray(value))
      return value;
    const regexp = new RegExp(RecordPattern(type));
    for (const key of guard_exports.Keys(value)) {
      if (!regexp.test(key))
        continue;
      value[key] = FromType23(direction, context, RecordValue(type), value[key]);
    }
    return Callback(direction, context, type, value);
  }
  function Encode6(direction, context, type, value) {
    const exterior = Callback(direction, context, type, value);
    if (!guard_exports.IsObjectNotArray(exterior))
      return exterior;
    const regexp = new RegExp(RecordPattern(type));
    for (const key of guard_exports.Keys(exterior)) {
      if (!regexp.test(key))
        continue;
      exterior[key] = FromType23(direction, context, RecordValue(type), exterior[key]);
    }
    return exterior;
  }
  function FromRecord6(direction, context, type, value) {
    return guard_exports.IsEqual(direction, "Decode") ? Decode6(direction, context, type, value) : Encode6(direction, context, type, value);
  }

  // node_modules/typebox/build/value/codec/from_ref.mjs
  function ResolveRef2(direction, context, type, value) {
    return guard_exports.HasPropertyKey(context, type.$ref) ? FromType23(direction, context, context[type.$ref], value) : value;
  }
  function FromRef8(direction, context, type, value) {
    return guard_exports.IsEqual(direction, "Decode") ? Callback(direction, context, type, ResolveRef2(direction, context, type, value)) : ResolveRef2(direction, context, type, Callback(direction, context, type, value));
  }

  // node_modules/typebox/build/value/codec/from_tuple.mjs
  function Decode7(direction, context, type, value) {
    if (!guard_exports.IsArray(value))
      return value;
    for (let i = 0; i < Math.min(type.items.length, value.length); i++) {
      value[i] = FromType23(direction, context, type.items[i], value[i]);
    }
    return Callback(direction, context, type, value);
  }
  function Encode7(direction, context, type, value) {
    const exterior = Callback(direction, context, type, value);
    if (!guard_exports.IsArray(exterior))
      return value;
    for (let i = 0; i < Math.min(type.items.length, exterior.length); i++) {
      exterior[i] = FromType23(direction, context, type.items[i], exterior[i]);
    }
    return exterior;
  }
  function FromTuple8(direction, context, type, value) {
    return guard_exports.IsEqual(direction, "Decode") ? Decode7(direction, context, type, value) : Encode7(direction, context, type, value);
  }

  // node_modules/typebox/build/value/codec/from_union.mjs
  function Decode8(direction, context, type, value) {
    for (const schema of type.anyOf) {
      if (!Check2(context, schema, value))
        continue;
      const variant = FromType23(direction, context, schema, value);
      return Callback(direction, context, type, variant);
    }
    return value;
  }
  function Encode8(direction, context, type, value) {
    const exterior = Callback(direction, context, type, value);
    for (const schema of type.anyOf) {
      const variant = FromType23(direction, context, schema, Clone2(exterior));
      if (!Check2(context, schema, variant))
        continue;
      return variant;
    }
    return exterior;
  }
  function FromUnion12(direction, context, type, value) {
    return guard_exports.IsEqual(direction, "Decode") ? Decode8(direction, context, type, value) : Encode8(direction, context, type, value);
  }

  // node_modules/typebox/build/value/codec/from_type.mjs
  function FromType23(direction, context, type, value) {
    return IsArray2(type) ? FromArray10(direction, context, type, value) : IsCyclic(type) ? FromCyclic9(direction, context, type, value) : IsIntersect(type) ? FromIntersect9(direction, context, type, value) : IsObject2(type) ? FromObject14(direction, context, type, value) : IsRecord(type) ? FromRecord6(direction, context, type, value) : IsRef2(type) ? FromRef8(direction, context, type, value) : IsTuple(type) ? FromTuple8(direction, context, type, value) : IsUnion(type) ? FromUnion12(direction, context, type, value) : Callback(direction, context, type, value);
  }

  // node_modules/typebox/build/value/codec/decode.mjs
  var DecodeError = class extends AssertError {
    constructor(value, errors) {
      super("Decode", value, errors);
    }
  };
  function Assert2(context, type, value) {
    if (!Check2(context, type, value))
      throw new DecodeError(value, Errors2(context, type, value));
    return value;
  }
  function DecodeUnsafe(context, type, value) {
    const sorted = settings_exports.Get().unionPrioritySort ? UnionPrioritySort(type) : type;
    return FromType23("Decode", context, sorted, value);
  }
  var Decoder = Pipeline([
    (_context, _type, value) => Clone2(value),
    (context, type, value) => Default(context, type, value),
    (context, type, value) => Convert(context, type, value),
    (context, type, value) => Clean(context, type, value),
    (context, type, value) => Assert2(context, type, value),
    (context, type, value) => DecodeUnsafe(context, type, value)
  ]);
  function Decode9(...args) {
    const [context, type, value] = arguments_exports.Match(args, {
      3: (context2, type2, value2) => [context2, type2, value2],
      2: (type2, value2) => [{}, type2, value2]
    });
    return Decoder(context, type, value);
  }

  // node_modules/typebox/build/value/codec/encode.mjs
  var EncodeError = class extends AssertError {
    constructor(value, errors) {
      super("Encode", value, errors);
    }
  };
  function Assert3(context, type, value) {
    if (!Check2(context, type, value))
      throw new EncodeError(value, Errors2(context, type, value));
    return value;
  }
  function EncodeUnsafe(context, type, value) {
    const sorted = settings_exports.Get().unionPrioritySort ? UnionPrioritySort(type) : type;
    return FromType23("Encode", context, sorted, value);
  }
  var Encoder = Pipeline([
    (_context, _type, value) => Clone2(value),
    (context, type, value) => EncodeUnsafe(context, type, value),
    (context, type, value) => Default(context, type, value),
    (context, type, value) => Convert(context, type, value),
    (context, type, value) => Clean(context, type, value),
    (context, type, value) => Assert3(context, type, value)
  ]);
  function Encode9(...args) {
    const [context, type, value] = arguments_exports.Match(args, {
      3: (context2, type2, value2) => [context2, type2, value2],
      2: (type2, value2) => [{}, type2, value2]
    });
    return Encoder(context, type, value);
  }

  // node_modules/typebox/build/value/codec/has.mjs
  function FromArray11(context, type) {
    return IsCodec(type) || FromType24(context, type.items);
  }
  function FromCyclic10(context, type) {
    return IsCodec(type) || FromRef9({ ...context, ...type.$defs }, Ref2(type.$ref));
  }
  function FromIntersect10(context, type) {
    return IsCodec(type) || type.allOf.some((type2) => FromType24(context, type2));
  }
  function FromObject15(context, type) {
    return IsCodec(type) || guard_exports.Keys(type.properties).some((key) => {
      return FromType24(context, type.properties[key]);
    });
  }
  function FromRecord7(context, type) {
    return IsCodec(type) || FromType24(context, RecordValue(type));
  }
  function FromRef9(context, type) {
    if (visited.has(type.$ref))
      return false;
    visited.add(type.$ref);
    return IsCodec(type) || guard_exports.HasPropertyKey(context, type.$ref) && FromType24(context, context[type.$ref]);
  }
  function FromTuple9(context, type) {
    return IsCodec(type) || type.items.some((type2) => FromType24(context, type2));
  }
  function FromUnion13(context, type) {
    return IsCodec(type) || type.anyOf.some((type2) => FromType24(context, type2));
  }
  function FromType24(context, type) {
    return IsArray2(type) ? FromArray11(context, type) : IsCyclic(type) ? FromCyclic10(context, type) : IsIntersect(type) ? FromIntersect10(context, type) : IsObject2(type) ? FromObject15(context, type) : IsRecord(type) ? FromRecord7(context, type) : IsRef2(type) ? FromRef9(context, type) : IsTuple(type) ? FromTuple9(context, type) : IsUnion(type) ? FromUnion13(context, type) : IsCodec(type);
  }
  var visited = /* @__PURE__ */ new Set();
  function HasCodec(...args) {
    const [context, type] = arguments_exports.Match(args, {
      2: (context2, type2) => [context2, type2],
      1: (type2) => [{}, type2]
    });
    visited.clear();
    return FromType24(context, type);
  }

  // node_modules/typebox/build/value/create/error.mjs
  var CreateError = class extends Error {
    constructor(type, message) {
      super(message);
      this.type = type;
    }
  };

  // node_modules/typebox/build/value/create/from_default.mjs
  function FromDefault2(_context, schema) {
    return guard_exports.IsFunction(schema.default) ? schema.default(schema) : guard_exports.IsObject(schema.default) ? Clone2(schema.default) : schema.default;
  }

  // node_modules/typebox/build/value/create/from_array.mjs
  function FromArray12(context, type) {
    if (IsUniqueItems(type) && !IsDefault(type))
      throw new CreateError(type, "Arrays with uniqueItems constraints must specify a default annotation");
    const length = IsMinItems(type) ? type.minItems : 0;
    return Array.from({ length }, () => FromType25(context, type.items));
  }

  // node_modules/typebox/build/value/create/from_bigint.mjs
  function FromBigInt7(_context, type) {
    return IsExclusiveMinimum(type) ? BigInt(type.exclusiveMinimum) + BigInt(1) : IsMinimum(type) ? BigInt(type.minimum) : BigInt(0);
  }

  // node_modules/typebox/build/value/create/from_boolean.mjs
  function FromBoolean7(_context, _type) {
    return false;
  }

  // node_modules/typebox/build/value/create/from_constructor.mjs
  function FromConstructor2(context, type) {
    const instanceType = FromType25(context, type.instanceType);
    return class {
      constructor() {
        Object.assign(this, instanceType);
      }
    };
  }

  // node_modules/typebox/build/value/create/from_cyclic.mjs
  function FromCyclic11(context, type) {
    return FromType25({ ...context, ...type.$defs }, Ref2(type.$ref));
  }

  // node_modules/typebox/build/value/create/from_enum.mjs
  function FromEnum4(context, type) {
    return FromType25(context, Evaluate(type));
  }

  // node_modules/typebox/build/value/create/from_function.mjs
  function FromFunction2(context, type) {
    const returnType = FromType25(context, type.returnType);
    return () => returnType;
  }

  // node_modules/typebox/build/value/create/from_integer.mjs
  function FromInteger2(_context, type) {
    return IsExclusiveMinimum(type) && guard_exports.IsNumber(type.exclusiveMinimum) ? type.exclusiveMinimum + 1 : IsMinimum(type) ? type.minimum : 0;
  }

  // node_modules/typebox/build/value/create/from_intersect.mjs
  function FromIntersect11(context, type) {
    const instantiated = Instantiate(context, type);
    const evaluated = Evaluate(instantiated);
    return FromType25(context, evaluated);
  }

  // node_modules/typebox/build/value/create/from_literal.mjs
  function FromLiteral7(_context, type) {
    return type.const;
  }

  // node_modules/typebox/build/value/create/from_never.mjs
  function FromNever(_context, type) {
    throw new CreateError(type, "Cannot create TNever types");
  }

  // node_modules/typebox/build/value/create/from_null.mjs
  function FromNull3(_context, _type) {
    return null;
  }

  // node_modules/typebox/build/value/create/from_number.mjs
  function FromNumber6(_context, type) {
    return IsExclusiveMinimum(type) && guard_exports.IsNumber(type.exclusiveMinimum) ? type.exclusiveMinimum + 1 : IsMinimum(type) ? type.minimum : 0;
  }

  // node_modules/typebox/build/value/create/from_object.mjs
  function FromObject16(context, type) {
    const required = guard_exports.IsUndefined(type.required) ? [] : type.required;
    return required.reduce((result, key) => {
      return { ...result, [key]: FromType25(context, type.properties[key]) };
    }, {});
  }

  // node_modules/typebox/build/value/create/from_record.mjs
  function FromRecord8(_context, type) {
    if (IsMinProperties(type) && !IsDefault(type))
      throw new CreateError(type, "Record with the minProperties constraint must have a default annotation");
    return {};
  }

  // node_modules/typebox/build/value/create/from_ref.mjs
  function FromRef10(context, type) {
    return guard_exports.HasPropertyKey(context, type.$ref) ? FromType25(context, context[type.$ref]) : (() => {
      throw new CreateError(type, "Unable to deref Ref");
    })();
  }

  // node_modules/typebox/build/value/create/from_string.mjs
  function FromString8(_context, type) {
    const needsDefault = (IsPattern(type) || IsFormat(type)) && !IsDefault(type);
    if (needsDefault)
      throw Error("Strings with format or pattern constraints must specify default");
    const minLength = IsMinLength3(type) ? type.minLength : 0;
    return "".padEnd(minLength);
  }

  // node_modules/typebox/build/value/create/from_symbol.mjs
  function FromSymbol2(_context, _type) {
    return Symbol();
  }

  // node_modules/typebox/build/value/create/from_template_literal.mjs
  function FromTemplateLiteral5(context, type) {
    const decoded = TemplateLiteralDecode(type.pattern);
    if (IsString3(decoded))
      throw new CreateError(type, "Unable to create TemplateLiteral due to infinite type expansion");
    return FromType25(context, decoded);
  }

  // node_modules/typebox/build/value/create/from_tuple.mjs
  function FromTuple10(context, type) {
    return Array.from({ length: type.minItems }, (_, i) => FromType25(context, type.items[i]));
  }

  // node_modules/typebox/build/value/create/from_undefined.mjs
  function FromUndefined3(_context, _type) {
    return void 0;
  }

  // node_modules/typebox/build/value/create/from_union.mjs
  function FromUnion14(context, type) {
    if (guard_exports.IsEqual(type.anyOf.length, 0)) {
      throw Error("Unable to create Union with no variants");
    }
    return FromType25(context, type.anyOf[0]);
  }

  // node_modules/typebox/build/value/create/from_void.mjs
  function FromVoid2(_context, _type) {
    return void 0;
  }

  // node_modules/typebox/build/value/create/from_type.mjs
  function FromType25(context, type) {
    return (
      // -----------------------------------------------------
      // Default
      // -----------------------------------------------------
      IsDefault(type) ? FromDefault2(context, type) : (
        // -----------------------------------------------------
        // Types
        // -----------------------------------------------------
        IsArray2(type) ? FromArray12(context, type) : IsBigInt2(type) ? FromBigInt7(context, type) : IsBoolean3(type) ? FromBoolean7(context, type) : IsConstructor2(type) ? FromConstructor2(context, type) : IsCyclic(type) ? FromCyclic11(context, type) : IsEnum2(type) ? FromEnum4(context, type) : IsFunction2(type) ? FromFunction2(context, type) : IsInteger2(type) ? FromInteger2(context, type) : IsIntersect(type) ? FromIntersect11(context, type) : IsLiteral(type) ? FromLiteral7(context, type) : IsNever(type) ? FromNever(context, type) : IsNull2(type) ? FromNull3(context, type) : IsNumber3(type) ? FromNumber6(context, type) : IsObject2(type) ? FromObject16(context, type) : IsRecord(type) ? FromRecord8(context, type) : IsRef2(type) ? FromRef10(context, type) : IsString3(type) ? FromString8(context, type) : IsSymbol2(type) ? FromSymbol2(context, type) : IsTemplateLiteral(type) ? FromTemplateLiteral5(context, type) : IsTuple(type) ? FromTuple10(context, type) : IsUndefined2(type) ? FromUndefined3(context, type) : IsUnion(type) ? FromUnion14(context, type) : IsVoid(type) ? FromVoid2(context, type) : void 0
      )
    );
  }

  // node_modules/typebox/build/value/create/create.mjs
  function Create2(...args) {
    const [context, type] = arguments_exports.Match(args, {
      2: (context2, type2) => [context2, type2],
      1: (type2) => [{}, type2]
    });
    return FromType25(context, type);
  }

  // node_modules/typebox/build/value/equal/equal.mjs
  function Equal(left, right) {
    return guard_exports.IsDeepEqual(left, right);
  }

  // node_modules/typebox/build/value/hash/hash.mjs
  function Hash2(value) {
    return hash_exports.Hash(value);
  }

  // node_modules/typebox/build/value/parse/parse.mjs
  var ParseError = class extends AssertError {
    constructor(value, errors) {
      super("Parse", value, errors);
    }
  };
  function Assert4(context, type, value) {
    if (!Check2(context, type, value))
      throw new ParseError(value, Errors2(context, type, value));
    return value;
  }
  var Parser = Pipeline([
    (_context, _type, value) => Clone2(value),
    (context, type, value) => Default(context, type, value),
    (context, type, value) => Convert(context, type, value),
    (context, type, value) => Clean(context, type, value),
    (context, type, value) => Assert4(context, type, value)
  ]);
  function Parse(...args) {
    const [context, type, value] = arguments_exports.Match(args, {
      3: (context2, type2, value2) => [context2, type2, value2],
      2: (type2, value2) => [{}, type2, value2]
    });
    const checked2 = Check2(context, type, value);
    if (checked2)
      return value;
    if (settings_exports.Get().correctiveParse)
      return Parser(context, type, value);
    throw new ParseError(value, Errors2(context, type, value));
  }

  // node_modules/typebox/build/value/delta/diff.mjs
  function CreateUpdate(path, value) {
    return { type: "update", path, value };
  }
  function CreateInsert(path, value) {
    return { type: "insert", path, value };
  }
  function CreateDelete(path) {
    return { type: "delete", path };
  }
  function AssertCanDiffObject(value) {
    if (guard_exports.IsObject(value) && guard_exports.IsEqual(guard_exports.Symbols(value).length, 0))
      return;
    throw new Error("Cannot create diffs for objects with symbols keys");
  }
  function* FromObject17(path, left, right) {
    if (!guard_exports.IsObject(right) || guard_exports.IsArray(right))
      return yield CreateUpdate(path, right);
    AssertCanDiffObject(left);
    AssertCanDiffObject(right);
    const leftKeys = guard_exports.Keys(left);
    const rightKeys = guard_exports.Keys(right);
    for (const key of rightKeys) {
      if (guard_exports.HasPropertyKey(left, key))
        continue;
      if (guard_exports.IsUnsafePropertyKey(key))
        continue;
      yield CreateInsert(`${path}/${key}`, right[key]);
    }
    for (const key of leftKeys) {
      if (!guard_exports.HasPropertyKey(right, key))
        continue;
      if (guard_exports.IsUnsafePropertyKey(key))
        continue;
      if (Equal(left, right))
        continue;
      yield* FromValue4(`${path}/${key}`, left[key], right[key]);
    }
    for (const key of leftKeys) {
      if (guard_exports.HasPropertyKey(right, key))
        continue;
      if (guard_exports.IsUnsafePropertyKey(key))
        continue;
      yield CreateDelete(`${path}/${key}`);
    }
  }
  function* FromArray13(path, left, right) {
    if (!guard_exports.IsArray(right))
      return yield CreateUpdate(path, right);
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      yield* FromValue4(`${path}/${i}`, left[i], right[i]);
    }
    for (let i = 0; i < right.length; i++) {
      if (i < left.length)
        continue;
      yield CreateInsert(`${path}/${i}`, right[i]);
    }
    for (let i = left.length - 1; i >= 0; i--) {
      if (i < right.length)
        continue;
      yield CreateDelete(`${path}/${i}`);
    }
  }
  function* FromTypedArray2(path, left, right) {
    const typeLeft = globalThis.Object.getPrototypeOf(left).constructor.name;
    const typeRight = globalThis.Object.getPrototypeOf(right).constructor.name;
    const predicate = globals_exports.IsTypeArray(right) && guard_exports.IsEqual(left.length, right.length) && guard_exports.IsEqual(typeLeft, typeRight);
    if (predicate) {
      for (let index = 0; index < Math.min(left.length, right.length); index++) {
        yield* FromValue4(`${path}/${index}`, left[index], right[index]);
      }
    } else {
      return yield CreateUpdate(path, right);
    }
  }
  function* FromUnknown(path, left, right) {
    if (left === right)
      return;
    yield CreateUpdate(path, right);
  }
  function* FromValue4(path, left, right) {
    return globals_exports.IsTypeArray(left) ? yield* FromTypedArray2(path, left, right) : guard_exports.IsArray(left) ? yield* FromArray13(path, left, right) : guard_exports.IsObject(left) ? yield* FromObject17(path, left, right) : yield* FromUnknown(path, left, right);
  }
  function Diff(current, next) {
    return [...FromValue4("", current, next)];
  }

  // node_modules/typebox/build/value/delta/edit.mjs
  var Insert2 = _Object_({
    type: Literal("insert"),
    path: String2(),
    value: Unknown()
  });
  var Update2 = Object({
    type: Literal("update"),
    path: String2(),
    value: Unknown()
  });
  var Delete2 = _Object_({
    type: Literal("delete"),
    path: String2()
  });
  var Edit = Union([Insert2, Update2, Delete2]);

  // node_modules/typebox/build/value/delta/patch.mjs
  function IsRoot(edits) {
    return edits.length > 0 && edits[0].path === "" && edits[0].type === "update";
  }
  function IsEmpty(edits) {
    return edits.length === 0;
  }
  function Patch(current, edits) {
    if (IsRoot(edits))
      return Clone2(edits[0].value);
    if (IsEmpty(edits))
      return Clone2(current);
    const clone = Clone2(current);
    for (const edit of edits) {
      switch (edit.type) {
        case "insert": {
          pointer_exports.Set(clone, edit.path, edit.value);
          break;
        }
        case "update": {
          pointer_exports.Set(clone, edit.path, edit.value);
          break;
        }
        case "delete": {
          pointer_exports.Delete(clone, edit.path);
          break;
        }
      }
    }
    return clone;
  }

  // node_modules/typebox/build/value/repair/error.mjs
  var RepairError = class extends Error {
    constructor(context, type, value, message) {
      super(message);
      this.context = context;
      this.type = type;
      this.value = value;
    }
  };

  // node_modules/typebox/build/value/repair/from_array.mjs
  function MakeUnique(values) {
    const [hashes, result] = [/* @__PURE__ */ new Set(), []];
    for (const value of values) {
      const hash = Hash2(value);
      if (hashes.has(hash))
        continue;
      hashes.add(hash);
      result.push(value);
    }
    return result;
  }
  function FromArray14(context, type, value) {
    if (Check2(context, type, value))
      return value;
    const created = guard_exports.IsArray(value) ? value : Create2(context, type);
    const minimum = IsMinItems(type) && created.length < type.minItems ? [...created, ...Array.from({ length: type.minItems - created.length }, () => Create2(context, type))] : created;
    const maximum = IsMaxItems(type) && minimum.length > type.maxItems ? minimum.slice(0, type.maxItems) : minimum;
    const repaired = maximum.map((value2) => FromType26(context, type.items, value2));
    if (!IsUniqueItems(type) || IsUniqueItems(type) && !guard_exports.IsEqual(type.uniqueItems, true))
      return repaired;
    const unique = MakeUnique(repaired);
    if (!Check2(context, type, unique))
      throw new RepairError(context, type, value, "Failed to repair Array due to uniqueItems constraint");
    return unique;
  }

  // node_modules/typebox/build/value/repair/from_enum.mjs
  function FromEnum5(context, type, value) {
    return FromType26(context, Evaluate(type), value);
  }

  // node_modules/typebox/build/value/repair/from_intersect.mjs
  function FromIntersect12(context, type, value) {
    const instantiated = Instantiate(context, type);
    const evaluated = Evaluate(instantiated);
    return FromType26(context, evaluated, value);
  }

  // node_modules/typebox/build/value/repair/from_object.mjs
  function FromObject18(context, type, value) {
    if (Check2(context, type, value))
      return value;
    if (!guard_exports.IsObjectNotArray(value))
      return Create2(context, type);
    const required = new Set(guard_exports.IsUndefined(type.required) ? [] : type.required);
    const result = {};
    for (const [key, schema] of guard_exports.Entries(type.properties)) {
      if (!required.has(key) && guard_exports.IsUndefined(value[key]))
        continue;
      result[key] = key in value ? FromType26(context, schema, value[key]) : Create2(context, schema);
    }
    const evaluatedKeys = guard_exports.Keys(type.properties);
    if (IsAdditionalProperties(type) && guard_exports.IsObject(type.additionalProperties)) {
      for (const key of guard_exports.Keys(value)) {
        if (evaluatedKeys.includes(key))
          continue;
        result[key] = FromType26(context, type.additionalProperties, value[key]);
      }
    }
    return result;
  }

  // node_modules/typebox/build/value/repair/from_record.mjs
  function FromRecord9(context, type, value) {
    if (Check2(context, type, value))
      return value;
    if (guard_exports.IsNull(value) || !guard_exports.IsObject(value) || guard_exports.IsArray(value))
      return Create2(context, type);
    const recordKey = new RegExp(RecordPattern(type));
    const recordValue = RecordValue(type);
    const evaluatedKeys = /* @__PURE__ */ new Set();
    const result = {};
    for (const [key, value_] of guard_exports.Entries(value)) {
      if (!recordKey.test(key))
        continue;
      result[key] = FromType26(context, recordValue, value_);
      evaluatedKeys.add(key);
    }
    if (IsAdditionalProperties(type)) {
      for (const key of guard_exports.Keys(value)) {
        if (evaluatedKeys.has(key))
          continue;
        result[key] = FromType26(context, type.additionalProperties, value[key]);
      }
    }
    return result;
  }

  // node_modules/typebox/build/value/repair/from_ref.mjs
  function FromRef11(context, type, value) {
    return guard_exports.HasPropertyKey(context, type.$ref) ? FromType26(context, context[type.$ref], value) : (() => {
      throw new RepairError(context, type, value, "Unable to de-reference target type");
    })();
  }

  // node_modules/typebox/build/value/repair/from_template_literal.mjs
  function FromTemplateLiteral6(context, type, value) {
    const decoded = TemplateLiteralDecode(type.pattern);
    return FromType26(context, decoded, value);
  }

  // node_modules/typebox/build/value/repair/from_tuple.mjs
  function FromTuple11(context, schema, value) {
    if (Check2(context, schema, value))
      return value;
    if (!guard_exports.IsArray(value))
      return Create2(context, schema);
    return schema.items.map((schema2, index) => FromType26(context, schema2, value[index]));
  }

  // node_modules/typebox/build/value/shared/union_score_select.mjs
  function Deref(context, type, value) {
    return IsRef2(type) ? guard_exports.HasPropertyKey(context, type.$ref) ? Deref(context, context[type.$ref], value) : (() => {
      throw new Error("Unable to Deref target");
    })() : type;
  }
  function ScoreVariant(context, type, value) {
    if (!(IsObject2(type) && guard_exports.IsObject(value)))
      return 0;
    const keys = guard_exports.Keys(value);
    const entries = guard_exports.Entries(type.properties);
    return entries.reduce((result, [key, schema]) => {
      const literal = IsLiteral(schema) && guard_exports.IsEqual(schema.const, value[key]) ? 100 : 0;
      const checks = Check2(context, schema, value[key]) ? 10 : 0;
      const exists = keys.includes(key) ? 1 : 0;
      return result + (literal + checks + exists);
    }, 0);
  }
  function UnionScoreSelect(context, type, value) {
    const schemas = type.anyOf.map((schema) => Deref(context, schema, value));
    let [select, best] = [schemas[0], 0];
    for (const schema of schemas) {
      const score = ScoreVariant(context, schema, value);
      if (score > best) {
        select = schema;
        best = score;
      }
    }
    return select;
  }

  // node_modules/typebox/build/value/repair/from_union.mjs
  function RepairUnion(context, type, value) {
    const union = Union(Flatten(type.anyOf));
    const schema = UnionScoreSelect(context, union, value);
    return FromType26(context, schema, value);
  }
  function FromUnion15(context, type, value) {
    if (Check2(context, type, value))
      return Clone2(value);
    if (IsDefault(type))
      return Create2(context, type);
    return RepairUnion(context, type, value);
  }

  // node_modules/typebox/build/value/repair/from_unknown.mjs
  function FromUnknown2(context, type, value) {
    if (Check2(context, type, value))
      return value;
    const converted = Convert(context, type, value);
    if (Check2(context, type, converted))
      return converted;
    return Create2(context, type);
  }

  // node_modules/typebox/build/value/repair/from_type.mjs
  function AssertRepairableValue(context, type, value) {
    const unsupported = globals_exports.IsDate(value) || globals_exports.IsMap(value) || globals_exports.IsSet(value) || globals_exports.IsTypeArray(value) || guard_exports.IsConstructor(value) || guard_exports.IsFunction(value);
    if (unsupported) {
      throw new RepairError(context, type, value, "Value is not repairable");
    }
  }
  function AssertRepairableType(context, type, value) {
    const unsupported = IsConstructor2(type) || IsFunction2(type) || IsNever(type);
    if (unsupported) {
      throw new RepairError(context, type, value, "Type is not repairable");
    }
  }
  function CreateWhenUndefined(context, type, value) {
    return guard_exports.IsUndefined(value) && !IsUndefined2(type) ? Create2(context, type) : value;
  }
  function FinalizeRepair(context, type, repaired) {
    return IsRefine2(type) ? Check2(context, type, repaired) ? repaired : Create2(context, type) : repaired;
  }
  function FromType26(context, type, value) {
    AssertRepairableValue(context, type, value);
    AssertRepairableType(context, type, value);
    const candidate = CreateWhenUndefined(context, type, value);
    const repaired = IsArray2(type) ? FromArray14(context, type, candidate) : IsEnum2(type) ? FromEnum5(context, type, candidate) : IsIntersect(type) ? FromIntersect12(context, type, candidate) : IsObject2(type) ? FromObject18(context, type, candidate) : IsRecord(type) ? FromRecord9(context, type, candidate) : IsRef2(type) ? FromRef11(context, type, candidate) : IsTemplateLiteral(type) ? FromTemplateLiteral6(context, type, candidate) : IsTuple(type) ? FromTuple11(context, type, candidate) : IsUnion(type) ? FromUnion15(context, type, candidate) : FromUnknown2(context, type, candidate);
    return FinalizeRepair(context, type, repaired);
  }

  // node_modules/typebox/build/value/repair/repair.mjs
  function Repair(...args) {
    const [context, type, value] = arguments_exports.Match(args, {
      3: (context2, type2, value2) => [context2, type2, value2],
      2: (type2, value2) => [{}, type2, value2]
    });
    const repaired = FromType26(context, type, value);
    Assert(context, type, repaired);
    return repaired;
  }

  // node_modules/typebox/build/value/value.mjs
  var value_exports = {};
  __export(value_exports, {
    Assert: () => Assert,
    Check: () => Check2,
    Clean: () => Clean,
    Clone: () => Clone2,
    Convert: () => Convert,
    Create: () => Create2,
    Decode: () => Decode9,
    Default: () => Default,
    Diff: () => Diff,
    Encode: () => Encode9,
    Equal: () => Equal,
    Errors: () => Errors2,
    HasCodec: () => HasCodec,
    Hash: () => Hash2,
    Parse: () => Parse,
    Patch: () => Patch,
    Pointer: () => pointer_exports,
    Repair: () => Repair
  });

  // scripts/pi-schema-interpreter.mjs
  function Compile(schema) {
    return {
      Check: (value) => value_exports.Check(schema, value),
      Errors: (value) => value_exports.Errors(schema, value)
    };
  }

  // node_modules/@earendil-works/pi-ai/dist/utils/validation.js
  var validatorCache = /* @__PURE__ */ new WeakMap();
  var TYPEBOX_KIND = Symbol.for("TypeBox.Kind");
  function getSchemaTypes(schema) {
    if (typeof schema.type === "string") {
      return [schema.type];
    }
    if (Array.isArray(schema.type)) {
      return schema.type.filter((type) => typeof type === "string");
    }
    return [];
  }
  function matchesJsonType(value, type) {
    switch (type) {
      case "number":
        return typeof value === "number";
      case "integer":
        return typeof value === "number" && Number.isInteger(value);
      case "boolean":
        return typeof value === "boolean";
      case "string":
        return typeof value === "string";
      case "null":
        return value === null;
      case "array":
        return Array.isArray(value);
      case "object":
        return typeof value === "object" && value !== null && !Array.isArray(value);
      default:
        return false;
    }
  }
  function getSubSchemaValidator(schema) {
    try {
      return getValidator(schema);
    } catch {
      return void 0;
    }
  }
  function coercePrimitiveByType(value, type) {
    switch (type) {
      case "number": {
        if (value === null) {
          return 0;
        }
        if (typeof value === "string" && value.trim() !== "") {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) {
            return parsed;
          }
        }
        if (typeof value === "boolean") {
          return value ? 1 : 0;
        }
        return value;
      }
      case "integer": {
        if (value === null) {
          return 0;
        }
        if (typeof value === "string" && value.trim() !== "") {
          const parsed = Number(value);
          if (Number.isInteger(parsed)) {
            return parsed;
          }
        }
        if (typeof value === "boolean") {
          return value ? 1 : 0;
        }
        return value;
      }
      case "boolean": {
        if (value === null) {
          return false;
        }
        if (typeof value === "string") {
          if (value === "true") {
            return true;
          }
          if (value === "false") {
            return false;
          }
        }
        if (typeof value === "number") {
          if (value === 1) {
            return true;
          }
          if (value === 0) {
            return false;
          }
        }
        return value;
      }
      case "string": {
        if (value === null) {
          return "";
        }
        if (typeof value === "number" || typeof value === "boolean") {
          return String(value);
        }
        return value;
      }
      case "null": {
        if (value === "" || value === 0 || value === false) {
          return null;
        }
        return value;
      }
      default:
        return value;
    }
  }
  function applySchemaObjectCoercion(value, schema) {
    const properties = schema.properties;
    const definedKeys = new Set(properties ? Object.keys(properties) : []);
    if (properties) {
      for (const [key, propertySchema] of Object.entries(properties)) {
        if (!(key in value)) {
          continue;
        }
        value[key] = coerceWithJsonSchema(value[key], propertySchema);
      }
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const [key, propertyValue] of Object.entries(value)) {
        if (definedKeys.has(key)) {
          continue;
        }
        value[key] = coerceWithJsonSchema(propertyValue, schema.additionalProperties);
      }
    }
  }
  function applySchemaArrayCoercion(value, schema) {
    if (Array.isArray(schema.items)) {
      for (let index = 0; index < value.length; index++) {
        const itemSchema = schema.items[index];
        if (!itemSchema) {
          continue;
        }
        value[index] = coerceWithJsonSchema(value[index], itemSchema);
      }
      return;
    }
    if (schema.items && typeof schema.items === "object") {
      for (let index = 0; index < value.length; index++) {
        value[index] = coerceWithJsonSchema(value[index], schema.items);
      }
    }
  }
  function coerceWithUnionSchema(value, schemas) {
    for (const schema of schemas) {
      const validator = getSubSchemaValidator(schema);
      if (validator?.Check(value)) {
        return value;
      }
    }
    for (const schema of schemas) {
      const candidate = structuredClone(value);
      const coerced = coerceWithJsonSchema(candidate, schema);
      const validator = getSubSchemaValidator(schema);
      if (validator?.Check(coerced)) {
        return coerced;
      }
    }
    return value;
  }
  function coerceWithJsonSchema(value, schema) {
    let nextValue = value;
    if (Array.isArray(schema.allOf)) {
      for (const nested of schema.allOf) {
        nextValue = coerceWithJsonSchema(nextValue, nested);
      }
    }
    if (Array.isArray(schema.anyOf)) {
      nextValue = coerceWithUnionSchema(nextValue, schema.anyOf);
    }
    if (Array.isArray(schema.oneOf)) {
      nextValue = coerceWithUnionSchema(nextValue, schema.oneOf);
    }
    const schemaTypes = getSchemaTypes(schema);
    const matchesUnionMember = schemaTypes.length > 1 && schemaTypes.some((schemaType) => matchesJsonType(nextValue, schemaType));
    if (schemaTypes.length > 0 && !matchesUnionMember) {
      for (const schemaType of schemaTypes) {
        const candidate = coercePrimitiveByType(nextValue, schemaType);
        if (candidate !== nextValue) {
          nextValue = candidate;
          break;
        }
      }
    }
    if (schemaTypes.includes("object") && typeof nextValue === "object" && nextValue !== null && !Array.isArray(nextValue)) {
      applySchemaObjectCoercion(nextValue, schema);
    }
    if (schemaTypes.includes("array") && Array.isArray(nextValue)) {
      applySchemaArrayCoercion(nextValue, schema);
    }
    return nextValue;
  }
  function normalizeOptionalNulls(value, schema) {
    if (Array.isArray(value)) {
      if (Array.isArray(schema.items)) {
        for (let index = 0; index < value.length; index++) {
          const itemSchema = schema.items[index];
          if (itemSchema)
            normalizeOptionalNulls(value[index], itemSchema);
        }
      } else if (schema.items) {
        for (const item of value)
          normalizeOptionalNulls(item, schema.items);
      }
      return;
    }
    if (typeof value !== "object" || value === null || !schema.properties)
      return;
    const object = value;
    const required = new Set(schema.required ?? []);
    for (const [key, propertySchema] of Object.entries(schema.properties)) {
      if (!(key in object))
        continue;
      if (object[key] === null && !required.has(key) && typeof propertySchema.$ref !== "string" && getSubSchemaValidator(propertySchema)?.Check(null) === false) {
        delete object[key];
      } else {
        normalizeOptionalNulls(object[key], propertySchema);
      }
    }
  }
  function getValidator(schema) {
    const key = schema;
    const cached = validatorCache.get(key);
    if (cached) {
      return cached;
    }
    const validator = Compile(schema);
    validatorCache.set(key, validator);
    return validator;
  }
  function formatValidationPath(error2) {
    if (error2.keyword === "required") {
      const requiredProperties = error2.params.requiredProperties;
      const requiredProperty = requiredProperties?.[0];
      if (requiredProperty) {
        const basePath = error2.instancePath.replace(/^\//, "").replace(/\//g, ".");
        return basePath ? `${basePath}.${requiredProperty}` : requiredProperty;
      }
    }
    const path = error2.instancePath.replace(/^\//, "").replace(/\//g, ".");
    return path || "root";
  }
  function validateToolArguments(tool, toolCall) {
    if (toolCall.argumentsError) {
      throw new Error(`Invalid arguments for tool "${toolCall.name}": ${toolCall.argumentsError}`);
    }
    const args = structuredClone(toolCall.arguments);
    normalizeOptionalNulls(args, tool.parameters);
    value_exports.Convert(tool.parameters, args);
    const validator = getValidator(tool.parameters);
    if (!Object.getOwnPropertySymbols(tool.parameters).includes(TYPEBOX_KIND)) {
      const coerced = coerceWithJsonSchema(args, tool.parameters);
      if (coerced !== args) {
        if (typeof args === "object" && args !== null && typeof coerced === "object" && coerced !== null) {
          for (const key of Object.keys(args)) {
            delete args[key];
          }
          Object.assign(args, coerced);
        } else {
          return validator.Check(coerced) ? coerced : args;
        }
      }
    }
    if (validator.Check(args)) {
      return args;
    }
    const errors = validator.Errors(args).map((error2) => `  - ${formatValidationPath(error2)}: ${error2.message}`).join("\n") || "Unknown validation error";
    const errorMessage = `Validation failed for tool "${toolCall.name}":
${errors}

Received arguments:
${JSON.stringify(toolCall.arguments, null, 2)}`;
    throw new Error(errorMessage);
  }

  // node_modules/@earendil-works/pi-agent-core/dist/stream-fn.js
  var defaultStreamFn;
  function getDefaultStreamFn() {
    if (!defaultStreamFn) {
      throw new Error("No default stream function configured. Pass streamFn explicitly or call setDefaultStreamFn().");
    }
    return defaultStreamFn;
  }

  // node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js
  var DEFAULT_AGENT_IDENTITY = { attribution: PI_ATTRIBUTION };
  async function runAgentLoop(prompts, context, config, emit, signal, streamFn) {
    const initialMessages = declareToolChanges(context, prompts);
    const newMessages = [...initialMessages];
    const currentContext = {
      ...context,
      messages: [...context.messages, ...initialMessages]
    };
    await emit({ type: "agent_start" });
    await emit({ type: "turn_start" });
    for (const message of initialMessages) {
      await emit({ type: "message_start", message });
      await emit({ type: "message_end", message });
    }
    await runLoop(currentContext, newMessages, config, signal, emit, streamFn ?? getDefaultStreamFn());
    return newMessages;
  }
  async function runLoop(initialContext, newMessages, initialConfig, signal, emit, streamFunction) {
    let currentContext = initialContext;
    let config = initialConfig;
    let lastCompletedTurn;
    let explicitContinuation = false;
    let pendingMessages = await config.getSteeringMessages?.() || [];
    while (true) {
      let hasMoreToolCalls = true;
      while (hasMoreToolCalls || pendingMessages.length > 0) {
        let preparedMessages = [];
        if (lastCompletedTurn) {
          const nextTurnSnapshot = await config.prepareNextTurn?.(lastCompletedTurn);
          if (nextTurnSnapshot) {
            currentContext = nextTurnSnapshot.context ?? currentContext;
            preparedMessages = nextTurnSnapshot.messages ?? [];
            config = {
              ...config,
              model: nextTurnSnapshot.model ?? config.model,
              reasoning: nextTurnSnapshot.thinkingLevel === void 0 ? config.reasoning : nextTurnSnapshot.thinkingLevel === "off" ? void 0 : nextTurnSnapshot.thinkingLevel
            };
          }
          if (pendingMessages.length === 0) {
            pendingMessages = await config.getSteeringMessages?.() || [];
          }
          await emit({ type: "turn_start" });
        }
        for (const message2 of declareToolChanges(currentContext, [...preparedMessages, ...pendingMessages])) {
          await emit({ type: "message_start", message: message2 });
          await emit({ type: "message_end", message: message2 });
          currentContext.messages.push(message2);
          newMessages.push(message2);
        }
        pendingMessages = [];
        const requestUpdate = await config.prepareRequest?.({
          context: currentContext,
          model: config.model,
          thinkingLevel: config.reasoning ?? "off"
        }, signal);
        if (requestUpdate) {
          currentContext = requestUpdate.context ?? currentContext;
          config = {
            ...config,
            model: requestUpdate.model ?? config.model,
            reasoning: requestUpdate.thinkingLevel === void 0 ? config.reasoning : requestUpdate.thinkingLevel === "off" ? void 0 : requestUpdate.thinkingLevel
          };
        }
        const message = await streamAssistantResponse(currentContext, config, signal, emit, streamFunction);
        newMessages.push(message);
        if (message.stopReason === "error" || message.stopReason === "aborted") {
          lastCompletedTurn = {
            message,
            toolResults: [],
            context: currentContext,
            newMessages
          };
          await config.finishTurn?.(lastCompletedTurn, signal);
          await emit({ type: "turn_end", message, toolResults: [] });
          await emit({ type: "agent_end", messages: newMessages });
          return;
        }
        const toolCalls = message.content.filter((c) => c.type === "toolCall");
        const toolResults = [];
        hasMoreToolCalls = false;
        if (toolCalls.length > 0) {
          const executedToolBatch = message.stopReason === "length" ? await failToolCallsFromTruncatedMessage(toolCalls, emit) : await executeToolCalls(currentContext, message, config, signal, emit);
          toolResults.push(...executedToolBatch.messages);
          hasMoreToolCalls = !executedToolBatch.terminate;
          for (const result of toolResults) {
            currentContext.messages.push(result);
            newMessages.push(result);
          }
        }
        lastCompletedTurn = {
          message,
          toolResults,
          context: currentContext,
          newMessages
        };
        const decision = await config.finishTurn?.(lastCompletedTurn, signal);
        await emit({ type: "turn_end", message, toolResults });
        if (decision?.action === "end") {
          await emit({ type: "agent_end", messages: newMessages });
          return;
        }
        explicitContinuation = decision?.action === "continue";
        pendingMessages = await config.getSteeringMessages?.() || [];
        if (hasMoreToolCalls || pendingMessages.length > 0) {
          explicitContinuation = false;
        }
      }
      const followUpMessages = await config.getFollowUpMessages?.() || [];
      if (followUpMessages.length > 0) {
        explicitContinuation = false;
        pendingMessages = followUpMessages;
        continue;
      }
      if (explicitContinuation) {
        explicitContinuation = false;
        continue;
      }
      break;
    }
    await emit({ type: "agent_end", messages: newMessages });
  }
  function declareToolChanges(context, pendingMessages) {
    let systemIndex = -1;
    for (let i = pendingMessages.length - 1; i >= 0; i--) {
      if (pendingMessages[i].role === "system") {
        systemIndex = i;
        break;
      }
    }
    const pending = pendingMessages[systemIndex];
    const baseline = pending ? pendingMessages.map((message, index2) => index2 === systemIndex ? withToolChanges(pending, NO_CHANGES) : message) : pendingMessages;
    const changes = getToolStateChanges(getCurrentTools([...context.messages, ...baseline]), (context.tools ?? []).map(toToolDeclaration));
    const unchanged = changes.toolsAdded.length === 0 && changes.toolsRemoved.length === 0;
    if (pending) {
      if (unchanged && !pending.toolsAdded?.length && !pending.toolsRemoved?.length)
        return pendingMessages;
      return baseline.map((message, index2) => index2 === systemIndex ? withToolChanges(pending, changes) : message);
    }
    if (unchanged)
      return pendingMessages;
    const update = withToolChanges({ role: "system", content: "", timestamp: Date.now() }, changes);
    const insertIndex = pendingMessages.findIndex((message) => message.role !== "system");
    const index = insertIndex === -1 ? pendingMessages.length : insertIndex;
    return [...pendingMessages.slice(0, index), update, ...pendingMessages.slice(index)];
  }
  var NO_CHANGES = { toolsAdded: [], toolsRemoved: [] };
  function withToolChanges(message, { toolsAdded, toolsRemoved }) {
    const { toolsAdded: _added, toolsRemoved: _removed, ...rest } = message;
    return {
      ...rest,
      ...toolsAdded.length > 0 ? { toolsAdded } : {},
      ...toolsRemoved.length > 0 ? { toolsRemoved } : {}
    };
  }
  async function streamAssistantResponse(context, config, signal, emit, streamFunction) {
    let messages = context.messages;
    if (config.transformContext) {
      messages = await config.transformContext(messages, signal);
    }
    const llmMessages = await config.convertToLlm(messages);
    const llmContext = normalizeContext({ messages: llmMessages });
    const resolvedApiKey = (config.getApiKey ? await config.getApiKey(config.model.provider) : void 0) || config.apiKey;
    const response = await streamFunction(config.model, llmContext, {
      ...config,
      apiKey: resolvedApiKey,
      identity: mergeClientIdentity(DEFAULT_AGENT_IDENTITY, config.identity),
      signal
    });
    const result = async () => Object.assign(await response.result(), { thinkingLevel: config.reasoning ?? "off" });
    let partialMessage = null;
    let addedPartial = false;
    for await (const event of response) {
      switch (event.type) {
        case "start":
          partialMessage = event.partial;
          context.messages.push(partialMessage);
          addedPartial = true;
          await emit({ type: "message_start", message: { ...partialMessage } });
          break;
        case "text_start":
        case "text_delta":
        case "text_end":
        case "thinking_start":
        case "thinking_delta":
        case "thinking_end":
        case "toolcall_start":
        case "toolcall_delta":
        case "toolcall_end":
          if (partialMessage) {
            partialMessage = event.partial;
            context.messages[context.messages.length - 1] = partialMessage;
            await emit({
              type: "message_update",
              assistantMessageEvent: event,
              message: { ...partialMessage }
            });
          }
          break;
        case "done":
        case "error": {
          const finalMessage2 = await result();
          if (addedPartial) {
            context.messages[context.messages.length - 1] = finalMessage2;
          } else {
            context.messages.push(finalMessage2);
          }
          if (!addedPartial) {
            await emit({ type: "message_start", message: { ...finalMessage2 } });
          }
          await emit({ type: "message_end", message: finalMessage2 });
          return finalMessage2;
        }
      }
    }
    const finalMessage = await result();
    if (addedPartial) {
      context.messages[context.messages.length - 1] = finalMessage;
    } else {
      context.messages.push(finalMessage);
      await emit({ type: "message_start", message: { ...finalMessage } });
    }
    await emit({ type: "message_end", message: finalMessage });
    return finalMessage;
  }
  async function failToolCallsFromTruncatedMessage(toolCalls, emit) {
    const messages = [];
    for (const toolCall of toolCalls) {
      await emit({
        type: "tool_execution_start",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: toolCall.arguments
      });
      const finalized = {
        toolCall,
        result: createErrorToolResult(`Tool call "${toolCall.name}" was not executed: the response hit the output token limit, so its arguments may be truncated. Re-issue the tool call with complete arguments.`),
        isError: true
      };
      await emitToolExecutionEnd(finalized, emit);
      const toolResultMessage = createToolResultMessage(finalized);
      await emitToolResultMessage(toolResultMessage, emit);
      messages.push(toolResultMessage);
    }
    return { messages, terminate: false };
  }
  async function executeToolCalls(currentContext, assistantMessage2, config, signal, emit) {
    const toolCalls = assistantMessage2.content.filter((c) => c.type === "toolCall");
    const hasSequentialToolCall = toolCalls.some((tc) => currentContext.tools?.find((t) => t.name === tc.name)?.executionMode === "sequential");
    if (config.toolExecution === "sequential" || hasSequentialToolCall) {
      return executeToolCallsSequential(currentContext, assistantMessage2, toolCalls, config, signal, emit);
    }
    return executeToolCallsParallel(currentContext, assistantMessage2, toolCalls, config, signal, emit);
  }
  async function executeToolCallsSequential(currentContext, assistantMessage2, toolCalls, config, signal, emit) {
    const finalizedCalls = [];
    const messages = [];
    for (const toolCall of toolCalls) {
      await emit({
        type: "tool_execution_start",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: toolCall.arguments
      });
      const preparation = await prepareToolCall(currentContext, assistantMessage2, toolCall, config, signal);
      let finalized;
      if (preparation.kind === "immediate") {
        finalized = {
          toolCall,
          result: preparation.result,
          isError: preparation.isError
        };
      } else {
        const executed = await executePreparedToolCall(preparation, signal, emitToolExecutionUpdate(toolCall, emit));
        finalized = await finalizeExecutedToolCall(currentContext, assistantMessage2, preparation, executed, config, signal);
      }
      await emitToolExecutionEnd(finalized, emit);
      const toolResultMessage = createToolResultMessage(finalized);
      await emitToolResultMessage(toolResultMessage, emit);
      finalizedCalls.push(finalized);
      messages.push(toolResultMessage);
      if (signal?.aborted) {
        break;
      }
    }
    return {
      messages,
      terminate: shouldTerminateToolBatch(finalizedCalls)
    };
  }
  async function executeToolCallsParallel(currentContext, assistantMessage2, toolCalls, config, signal, emit) {
    const finalizedCalls = [];
    for (const toolCall of toolCalls) {
      await emit({
        type: "tool_execution_start",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: toolCall.arguments
      });
      const preparation = await prepareToolCall(currentContext, assistantMessage2, toolCall, config, signal);
      if (preparation.kind === "immediate") {
        const finalized = {
          toolCall,
          result: preparation.result,
          isError: preparation.isError
        };
        await emitToolExecutionEnd(finalized, emit);
        finalizedCalls.push(finalized);
        if (signal?.aborted) {
          break;
        }
        continue;
      }
      finalizedCalls.push(async () => {
        if (signal?.aborted) {
          const finalized2 = {
            toolCall,
            result: createErrorToolResult("Operation aborted"),
            isError: true
          };
          await emitToolExecutionEnd(finalized2, emit);
          return finalized2;
        }
        const executed = await executePreparedToolCall(preparation, signal, emitToolExecutionUpdate(toolCall, emit));
        const finalized = await finalizeExecutedToolCall(currentContext, assistantMessage2, preparation, executed, config, signal);
        await emitToolExecutionEnd(finalized, emit);
        return finalized;
      });
      if (signal?.aborted) {
        break;
      }
    }
    const orderedFinalizedCalls = await Promise.all(finalizedCalls.map((entry) => typeof entry === "function" ? entry() : Promise.resolve(entry)));
    const messages = [];
    for (const finalized of orderedFinalizedCalls) {
      const toolResultMessage = createToolResultMessage(finalized);
      await emitToolResultMessage(toolResultMessage, emit);
      messages.push(toolResultMessage);
    }
    return {
      messages,
      terminate: shouldTerminateToolBatch(orderedFinalizedCalls)
    };
  }
  function shouldTerminateToolBatch(finalizedCalls) {
    return finalizedCalls.length > 0 && finalizedCalls.every((finalized) => finalized.result.terminate === true);
  }
  function prepareToolCallArguments(tool, toolCall) {
    if (!tool.prepareArguments) {
      return toolCall;
    }
    const preparedArguments = tool.prepareArguments(toolCall.arguments);
    if (preparedArguments === toolCall.arguments) {
      return toolCall;
    }
    return {
      ...toolCall,
      arguments: preparedArguments
    };
  }
  async function prepareToolCall(currentContext, assistantMessage2, toolCall, config, signal, tools = currentContext.tools ?? []) {
    const tool = tools.find((t) => t.name === toolCall.name);
    if (!tool) {
      return {
        kind: "immediate",
        result: createErrorToolResult(`Tool ${toolCall.name} not found`),
        isError: true
      };
    }
    try {
      const preparedToolCall = prepareToolCallArguments(tool, toolCall);
      const validatedArgs = validateToolArguments(tool, preparedToolCall);
      if (config.beforeToolCall) {
        const beforeResult = await config.beforeToolCall({
          assistantMessage: assistantMessage2,
          toolCall,
          args: validatedArgs,
          context: currentContext
        }, signal);
        if (signal?.aborted) {
          return {
            kind: "immediate",
            result: createErrorToolResult("Operation aborted"),
            isError: true
          };
        }
        if (beforeResult?.block) {
          const result = createErrorToolResult(beforeResult.reason || "Tool execution was blocked");
          if (beforeResult.terminate === true) {
            result.terminate = true;
          }
          return {
            kind: "immediate",
            result,
            isError: true
          };
        }
      }
      if (signal?.aborted) {
        return {
          kind: "immediate",
          result: createErrorToolResult("Operation aborted"),
          isError: true
        };
      }
      return {
        kind: "prepared",
        toolCall,
        tool,
        args: validatedArgs
      };
    } catch (error2) {
      return {
        kind: "immediate",
        result: createErrorToolResult(error2 instanceof Error ? error2.message : String(error2)),
        isError: true
      };
    }
  }
  function emitToolExecutionUpdate(toolCall, emit) {
    return (partialResult) => emit({
      type: "tool_execution_update",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: toolCall.arguments,
      partialResult
    });
  }
  async function executePreparedToolCall(prepared, signal, onUpdate) {
    const updateEvents = [];
    let acceptingUpdates = true;
    const startedAt = performance.now();
    const elapsed = () => Math.round(performance.now() - startedAt);
    try {
      const result = await prepared.tool.execute(prepared.toolCall.id, prepared.args, signal, (partialResult) => {
        if (!acceptingUpdates)
          return;
        updateEvents.push(Promise.resolve(onUpdate(partialResult)));
      });
      const durationMs = elapsed();
      acceptingUpdates = false;
      await Promise.all(updateEvents);
      return { result, isError: result.isError === true, durationMs };
    } catch (error2) {
      const durationMs = elapsed();
      acceptingUpdates = false;
      await Promise.all(updateEvents);
      return {
        result: createErrorToolResult(error2 instanceof Error ? error2.message : String(error2)),
        isError: true,
        durationMs
      };
    } finally {
      acceptingUpdates = false;
    }
  }
  async function finalizeExecutedToolCall(currentContext, assistantMessage2, prepared, executed, config, signal) {
    let result = executed.result;
    let isError = executed.isError;
    if (config.afterToolCall) {
      try {
        const afterResult = await config.afterToolCall({
          assistantMessage: assistantMessage2,
          toolCall: prepared.toolCall,
          args: prepared.args,
          result,
          isError,
          context: currentContext
        }, signal);
        if (afterResult) {
          const structuredContent = afterResult.structuredContent ?? (afterResult.content ? void 0 : result.structuredContent);
          result = {
            ...result,
            content: afterResult.content ?? result.content,
            details: afterResult.details ?? result.details,
            usage: afterResult.usage ?? result.usage,
            terminate: afterResult.terminate ?? result.terminate
          };
          if (structuredContent === void 0)
            delete result.structuredContent;
          else
            result.structuredContent = structuredContent;
          isError = afterResult.isError ?? isError;
        }
      } catch (error2) {
        result = createErrorToolResult(error2 instanceof Error ? error2.message : String(error2));
        isError = true;
      }
    }
    return {
      toolCall: prepared.toolCall,
      result,
      isError,
      durationMs: executed.durationMs
    };
  }
  function createErrorToolResult(message) {
    return {
      content: [{ type: "text", text: message }],
      details: {}
    };
  }
  async function emitToolExecutionEnd(finalized, emit) {
    await emit({
      type: "tool_execution_end",
      toolCallId: finalized.toolCall.id,
      toolName: finalized.toolCall.name,
      result: finalized.result,
      isError: finalized.isError,
      ...finalized.durationMs === void 0 ? {} : { durationMs: finalized.durationMs }
    });
  }
  function createToolResultMessage(finalized) {
    return {
      role: "toolResult",
      toolCallId: finalized.toolCall.id,
      toolName: finalized.toolCall.name,
      // Untyped tools (JS extensions) can return results without content; normalize
      // so the null never enters session history or provider payloads.
      content: finalized.result.content ?? [],
      details: finalized.result.details,
      usage: finalized.result.usage,
      isError: finalized.isError,
      ...finalized.durationMs === void 0 ? {} : { durationMs: finalized.durationMs },
      timestamp: Date.now()
    };
  }
  async function emitToolResultMessage(toolResultMessage, emit) {
    await emit({ type: "message_start", message: toolResultMessage });
    await emit({ type: "message_end", message: toolResultMessage });
  }

  // scripts/pi-runtime-entry.mjs
  var version = "pi-agent-core@1.4.0";
  var emptyUsage = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });
  function error(message, code) {
    return Object.assign(new Error(message), { code });
  }
  function bounded(value, fallback, maximum) {
    return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), maximum) : fallback;
  }
  function checked(promise, signal) {
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason || error("Pi run cancelled", "ABORTED"));
      if (signal.aborted) return abort();
      signal.addEventListener("abort", abort, { once: true });
      Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }
  function assistantMessage(value, model) {
    const response = typeof value === "string" ? { text: value } : value || {};
    const content = response.content || [
      ...response.text == null ? [] : [{ type: "text", text: response.text }],
      ...(response.toolCalls || []).map((call, index) => ({ type: "toolCall", id: call.id || `call-${index}`, name: call.name, arguments: call.arguments || {} }))
    ];
    const usage = { ...emptyUsage(), ...response.usage };
    if (!Number.isFinite(response.usage?.totalTokens)) usage.totalTokens = (usage.input || 0) + (usage.output || 0) + (usage.cacheRead || 0) + (usage.cacheWrite || 0);
    return {
      ...response,
      role: "assistant",
      content,
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage,
      stopReason: response.stopReason || (content.some((item) => item.type === "toolCall") ? "toolUse" : "stop"),
      timestamp: Date.now()
    };
  }
  async function run(options = {}) {
    if (typeof options.transport !== "function") throw error("Pi transport is required", "TRANSPORT_REQUIRED");
    const budget = options.budget || {};
    const limits = {
      turns: bounded(budget.maxTurns, 6, 20),
      tools: bounded(budget.maxToolCalls, 12, 60),
      tokens: bounded(budget.maxTokens, 16e3, 2e5),
      timeout: bounded(budget.timeoutMs, 6e4, 3e5)
    };
    const controller = new AbortController(), signal = controller.signal;
    const abort = () => controller.abort(options.signal.reason || error("Pi run cancelled", "ABORTED"));
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(error("Pi time budget exceeded", "TIME_BUDGET")), limits.timeout);
    let turns = 0, toolCalls = 0, usage = emptyUsage();
    const model = { id: "configured-model", name: "Configured model", api: "openai-completions", provider: "custom", ...options.model };
    const tools = (options.tools || []).map((tool) => ({
      ...tool,
      label: tool.label || tool.name,
      execute: async (id, args, toolSignal, update) => {
        if (signal.aborted) throw signal.reason;
        return checked(tool.execute(id, args, toolSignal, update), signal);
      }
    }));
    const messages = [...options.messages || []];
    if (options.systemPrompt) messages.unshift({ role: "system", content: options.systemPrompt, timestamp: Date.now() });
    const streamFn = async (selectedModel, context) => {
      if (signal.aborted) throw signal.reason;
      if (turns >= limits.turns) throw error("Pi turn budget exceeded", "TURN_BUDGET");
      if (usage.totalTokens >= limits.tokens) throw error("Pi token budget exceeded", "TOKEN_BUDGET");
      turns++;
      const finalTurn = turns === limits.turns;
      const response = assistantMessage(await checked(options.transport({
        model: selectedModel,
        messages: context.messages,
        systemPrompt: getCurrentSystemPrompt(context.messages),
        tools: finalTurn ? [] : getCurrentTools(context.messages),
        signal,
        maxTokens: limits.tokens - usage.totalTokens,
        finalTurn
      }), signal), model);
      for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"]) usage[key] += Number(response.usage[key]) || 0;
      const calls = response.content.filter((item) => item.type === "toolCall").length;
      if (finalTurn && calls) throw error("Pi final turn must return an answer", "TURN_BUDGET");
      if (!tools.length && calls) throw error("This API does not support tool calls", "TOOLS_UNAVAILABLE");
      if (toolCalls + calls > limits.tools) throw error("Pi tool budget exceeded", "TOOL_BUDGET");
      if (usage.totalTokens > limits.tokens) throw error("Pi token budget exceeded", "TOKEN_BUDGET");
      toolCalls += calls;
      return { result: async () => response, async *[Symbol.asyncIterator]() {
        yield { type: "done", message: response };
      } };
    };
    try {
      const result = await checked(runAgentLoop([], { messages, tools }, {
        model,
        convertToLlm: (items) => items,
        toolExecution: "sequential",
        finishTurn: () => !tools.length ? { action: "end" } : void 0
      }, async (event) => {
        if (options.onEvent) await options.onEvent(event);
      }, signal, streamFn), signal);
      const allMessages = [...messages, ...result];
      const assistant = [...allMessages].reverse().find((item) => item.role === "assistant");
      if (assistant?.stopReason === "error" || assistant?.stopReason === "aborted") throw error(assistant.errorMessage || "Pi model failed", assistant.stopReason === "aborted" ? "ABORTED" : "MODEL_ERROR");
      return { messages: allMessages, assistant, text: (assistant?.content || []).filter((item) => item.type === "text").map((item) => item.text).join(""), usage, turns, toolCalls, stopReason: assistant?.stopReason || "stop" };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
  return __toCommonJS(pi_runtime_entry_exports);
})();
