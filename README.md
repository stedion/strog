# Strog 🪵

Structured logging with hierarchical IDs and tagged template strings. Human-friendly text first, machine-friendly metadata always attached.

## Features

- 🏷️ Tagged template strings → frictionless adoption
- 🧬 Hierarchical span IDs (compact path encoding) for instant tree reconstruction
- 🔖 Roles: span (default), attr, end
- � Stays readable (plain message prefix) + machine parsable (JSON suffix)
- 📦 Zero dependencies
- 🧪 TypeScript-first API


## Installation

```bash
npm install strog
```

## Quick Start

```typescript
import { Strog } from 'strog';

const Request = Strog('request', ['method','path']);
const Db = Request.span('db', ['op']);
const DbAttr = Db.addAttr('db', ['rowCount']);
const DbEnd = Db.end('db', ['durationMs']);

const line1 = Request`Handling ${'GET'} ${'/users/42'}`;
const line2 = Db`query ${'select-user'}`;
const line3 = DbAttr`rows ${123}`;
const line4 = DbEnd`done ${17}`; // allocate end last for highest ordinal

// Each line ends with \u2028 + JSON metadata: { type, role?, id, record }
console.log(line1);

// Parse (tail processor style)
const parsed = [line1,line2,line3,line4].map(l => Strog.parse(l));
parsed.forEach(p => console.log(p.metadata));
```

## How It Works

Each tagged template call produces:

plain-text message + delimiter (default U+2028) + JSON metadata

The metadata object shape (current implementation):

{ type: string, role?: 'attr' | 'end', id?: string, record?: Record<string,any> }

IDs are hierarchical path encodings: fixed 3‑hex segments (12 bits each). Example: `001002003` → root `001`, child `002`, grandchild `003`. Parent = trim last 3 hex chars. Ordinal within parent = last segment numeric value.

End and attr events are independent child nodes; no mutation of earlier lines.

### Tail / Processing

```typescript
// In your log processor (Cloudflare Tail Worker, log aggregator, etc.)
import { Strog } from 'strog';

// Parse a log message that came through your system
const incomingLog = "GET /users completed in 150ms\u2028{...metadata...}";
const parsed = Strog.parse(incomingLog);

console.log(parsed.message);     // "GET /users completed in 150ms" 
console.log(parsed.metadata);  // { type: "...", metadata: {...} }
```

This enables a powerful workflow:
1. **Application code** uses Strog to create structured logs that look normal
2. **Log infrastructure** uses Strog parsing functions to extract rich metadata
3. **Zero configuration** needed - logs flow through existing systems unchanged

## Core API

`Strog(type: string, keys: string[]) => Tag`

Tag methods (all return new tags):
- `.span(type, keys)` create child span
- `.addAttr(type, keys)` attribute event tag (role = attr)
- `.end(type, keys)` end event tag (role = end)

Helpers:
- `Strog.parse(line)` → { message, metadata? }
- `Strog.parseId(id)` / `Strog.serializeId(bigint)`
- `Strog.parent(val|line|{metadata})` → parent id bigint
- `Strog.parentHex(idString)` → parent id string
- `Strog.ordinal(idBigInt)` → child ordinal (1..4095)

Delimiter: `Strog.set({ delimiter })` to override (non-empty string required).

## Examples

### Basic Logging

```typescript
import { Strog } from 'strog';

const UserAction = Strog('user-action', ['user_id', 'action']);

const userId = 'user_123';
const action = 'login';

// Create structured log
const logMessage = UserAction`User ${userId} performed ${action}`;
console.log(logMessage);
// Output: "User user_123 performed login⏎{\"type\":\"user-action\",\"metadata\":{\"user_id\":\"user_123\",\"action\":\"login\"}}"
```

### Hierarchical Spans

```ts
const Root = Strog('request', ['method','path']);
const Db = Root.span('db', ['op']);
const DbAttr = Db.addAttr('db', ['rowCount']);
const DbInner = Db.span('row', ['rowId']);
const DbInnerEnd = DbInner.end('row', ['durationMs']);
const DbEnd = Db.end('db', ['durationMs']);

const a = Root`GET ${'/users/42'}`;         // id 001
const b = Db`query ${'select-user'}`;       // id 001002
const c = DbAttr`rows ${123}`;              // id 001002001 (role attr)
const d = DbInner`row ${'42'}`;             // id 001002002
const e = DbInnerEnd`done ${3}`;            // id 001002002001 (role end)
const f = DbEnd`done ${17}`;                // id 001002003 (role end)

// parent reconstruction
const metaF = Strog.parse(f).metadata!;
const parentHex = Strog.parentHex(metaF.id); // '001002'
```


## Log Processing Example

```typescript
// In your Cloudflare Worker
import { Strog } from 'strog';

const RequestLog = Strog('http-request', ['method', 'url', 'status', 'duration']);

export default {
	async fetch(request: Request): Promise<Response> {
		const start = Date.now();
		
		// Process request
		const response = await handleRequest(request);
		
		const duration = Date.now() - start;
		
		// Structured log that appears normal but contains rich metadata
		console.log(RequestLog`${request.method} ${request.url} ${response.status} ${duration}ms`);
		
		return response;
	}
};
```

### Tail Worker Style Loop

```typescript
// In your Tail Worker for log processing
import { Strog } from 'strog';

export default {
	async tail(events: TraceItem[]): Promise<void> {
		for (const event of events) {
			if (event.logs) {
				for (const log of event.logs) {
					// Parse structured logs
					const parsed = Strog.parse(log.message);
					
					if (parsed.metadata) {
						// Send structured data to analytics
						await analytics.track({
							type: parsed.metadata.type,
							message: parsed.message,
							metadata: parsed.metadata,
							timestamp: log.timestamp,
						});
					}
				}
			}
		}
	}
};
```

### Types

```typescript
import { Strog, type Metadata, type StructuredLog, type StrogTagFunction } from 'strog';

// All types are properly exported
const UserEvent: StrogTagFunction = Strog('user-event', ['user_id', 'event_type']);

// Type-safe parsing
const parsed = UserEvent.parse(logMessage); // : StructuredLog
if ( parsed.metadata ) {
	const metadata = parsed.metadata; // : Metadata
	console.log(metadata.type);      // : string
	console.log(metadata.metadata);  // : Record<string, any> | undefined
}
```



## Design Notes (Why IDs Look Like 001002003)

- Fixed-width 3‑hex segments (12 bits) → cheap prefix tests & lexicographic ordering
- Parent = trim last 3 chars; ordinal = parse last 3 chars
- Up to 4095 children per node; overflow path can be detected (future handling)
- Separate `attr` / `end` nodes: immutable append-only model; no retroactive mutation

