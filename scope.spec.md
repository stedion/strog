## Strog Scope/Span Specification (draft)

This document specifies the additions to Strog required to enable downstream log tailers/processors (e.g., Cloudflare tail workers) to reliably associate logs and errors with execution scopes (spans), build hierarchies, and compute metrics.

Status: draft for discussion. Non-normative notes are marked as “Note:”.

---

### Goals

- Provide a minimal, explicit span API in Strog that embeds correlation metadata into emitted log events.
- Allow log processors to reconstruct a tree of spans, associate unstructured logs and errors to the correct span, and compute durations and aggregates.
- Keep the tagged template UX ergonomic and backward-compatible.
- Support both explicit scoping (via `.scope()`) and implicit time/window scoping driven by start/end events.

### Non-goals

- Implement a full tracing system or exporter in Strog.
- Mandate a specific transport/collector; Strog outputs logs, processors consume them.

---

## Terminology

- Span: A named scope with a start and optional end, optionally a parent span.
- Event: A single log emission carrying structured metadata (start, attr, end, log, error).
- Attribute: A named set of metrics/fields recorded against an active span.
- Current span: The span considered active in the calling async context at a moment in time.

---

## API surface to add in Strog

TypeScript-like signatures shown for clarity; concrete typings are an implementation detail.

```ts
type SpanId = string; // e.g., ULID/UUID; stable across the span lifetime

interface SpanTemplateTag {
  // Tagged template usage starts the span when first invoked
  (strings: TemplateStringsArray, ...expr: unknown[]): string;

  /** Emit an end event via tagged template */
  end(strings: TemplateStringsArray, ...expr: unknown[]): string;

  /** Emit an attribute event via tagged template */
  [attrName: string]: (strings: TemplateStringsArray, ...expr: unknown[]) => string;
}

interface SpanDescriptor extends SpanTemplateTag {
  /** Stable id for the span descriptor (not an instance start); optional */
  __name__: string;

  /** Declare additional attributes available via tagged templates */
  addAttr(name: string, spec: AttrSpec): void;

  /** Declare the end-event schema and/or alias name */
  end(nameOrSpec?: string | AttrSpec, spec?: AttrSpec): SpanTemplateTag;

  /** Create a child span descriptor inheriting logical lineage */
  span(childName: string, startSpec?: AttrSpec): SpanDescriptor;

  /**
   * Run a function within this span’s async scope. Any thrown error is augmented
   * with __id__ and rethrown. The span is set as current for the function’s lifetime.
   */
  scope<T>(fn: (span: ActiveSpan) => Promise<T> | T): Promise<T>;
}

interface ActiveSpan {
  id: SpanId;
  name: string;
  parentId?: SpanId;
  startTs: number; // ms epoch
  // Methods for programmatic emission (non-template)
  emitAttr(name: string, values?: Record<string, unknown>): void;
  emitEnd(values?: Record<string, unknown>): void;
```

## Strog Span / Event Model (current implementation summary)
This file reflects the code as shipped today. Earlier drafts (kept minimal below) proposed additional features like `scope()` and implicit async context tracking—these are NOT implemented yet. Code is the source of truth.

### Goals (Implemented Now)
- Emit hierarchical span identifiers using fixed-width hex segments.
- Allow child spans, attribute events, and end events via explicit tag methods.
- Keep output human-first while embedding structured JSON metadata for tail processors.

### Deferred / Future (Not Implemented)
- `scope()` async context management
- Automatic attachment of span IDs to unrelated console/error lines
- Attribute aggregation hints (e.g. `:counter`, `:dist`) semantics enforcement
- Error event wrapping
- `.span()` defines a child descriptor; tagged usage activates it.

## Terminology (Practical Today)
- Span: Any tag created by `Strog(type, keys)` or `.span(type, keys)` (default role)
- Attr Event: Tag created by `.addAttr(type, keys)` (role = `attr`)
- End Event: Tag created by `.end(type, keys)` (role = `end`)
- ID: Hierarchical path (3 hex chars per level) e.g. `001002003`

## Event schema (log-tail friendly)

Every Strog-originated emission MUST include metadata these fields:

```
__type__:    string   // span name (e.g., 'ORDER')
__role__:   'span' | 'attr' | 'end' | 'log'
__id__:      string   // span instance id (parentid can be deduced with bitwise shifting)
```



---

## Attribute semantics

Attribute spec tokens (examples):
- `key` → literal field captured from template
- `key:set` → unique set of values
- `key:counter` → integer sum
- `key:dist` → distribution (count, sum, min, max; processor’s responsibility)

Strog behavior:
- Do not compute aggregates in-process; emit raw values. Aggregation happens in the processor.

---

## Scoping semantics

Two complementary mechanisms:

1) Implicit time-based scoping
- The first tagged use of a span descriptor (e.g., `console.info(ORDER\`...\`)`) emits a `start` and sets the span as current in the async context.
- Tagged `end` (e.g., `ORDER.end\`...\``) emits an `end` and clears current, restoring the parent span as current.
- Unstructured logs emitted while a span is current gain `__type__='log'` with the current `__id__` attached (if integration is enabled; see Integration section).

2) Explicit scoping via `.scope()`
- Establishes the span as current for the function’s execution (using AsyncLocalStorage or equivalent).
  Notes:
  - No async context tracking yet; association is purely by hierarchical IDs you emit.
  - Every emission is immutable; end/attr events do not mutate earlier span lines.
- If an `end` is missing, the span remains open; processors may close after timeout windows.
- Starting a child span does not implicitly end siblings.

---

## Integration points (optional but recommended)

- Async context: Use Node’s `AsyncLocalStorage` to track the current span per async flow.
- Console patching: Optionally wrap `console.*` to append the strog envelope to unstructured logs when a current span exists (`__type__='log'`).

---


## Attribute Tokens (Future Idea)
Earlier drafts referenced suffixes like `:counter`, `:dist`. Current implementation treats keys as plain strings; any aggregation semantics are decided downstream.


## Examples

### Explicit scope

## Hierarchy & Parents
Parent ID = trim last 3 hex chars. Example: `001002003` → parent `001002`. Root has a single 3-hex segment.
Ordinal within parent = numeric value of last 3 hex chars (base16). Children allocate sequential ordinals (1..4095). Separate child types (attr, end, nested span) each consume an ordinal.

```ts
const REQUEST = Strog('request-start', ['user_id', 'country_code']);
REQUEST.end('request-end', ['duration_ms:dist', 'status:set']);

const ORDER = REQUEST.span('order-start', ['order_id']);
ORDER.addAttr('order-lineitem', ['item_id:set', 'qty:counter', 'subtotal_cents:counter']);
ORDER.end('order-end', ['status:set', 'duration_ms:dist']);

console.info(REQUEST`start user:${uid} cc:${cc}`);
console.info(ORDER`fetch ${orderId}`);
console.info(ORDER.end`ok in:${ms}`); // scope returns to REQUEST
```

---

## Compatibility and migration

- Existing Strog tagged messages remain valid. New fields/envelopes are additions.
- Processors should key off `__version__` to handle evolutions.

---

## Open questions

1. ID format: UUID v4 vs ULID (sortable) for `__id__` and potential `traceId`?
4. Do we want an explicit `traceId` to group multiple top-level spans?
5. How to signal processor about attribute types (`:counter`, `:dist`) formally (string hints vs schema object)?

---

## Acceptance criteria (for implementation)

- `.span()`, `.addAttr()`, `.end()` implemented
- Hierarchical IDs (3-hex segments) working
- Parsing helpers (`parse`, `parent`, `parentHex`, `ordinal`) available
- Scenario test exercises multi-level + siblings + attrs + end ordering

Future acceptance criteria will extend this list as features land.
