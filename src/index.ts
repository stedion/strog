/**
 * Strog - A structured logging library with tagged template strings
 * 
 * Enables rich runtime metadata tagging while preserving human readability
 * in development and machine parsing in production.
 */

export type StrogRole = 'attr' | 'end' | undefined; // TODO: extend with 'span' | 'log' | 'error'

export type StrogId = string;

export type Metadata = {
	type     : string,
	role?    : StrogRole,
	id?      : StrogId,
	record?  : Record<string, any> | undefined,
};

export type StructuredLog = {
	message   : string,
	metadata? : Metadata,
};

export type StrogOptions = {
	delimiter : string,
};


export type StrogTagFunction = {
	( strings : TemplateStringsArray, ...placeholders : any[] ) : string,
	span    ( type: string, keys: string[] ) : StrogTagFunction,
	addAttr ( type: string, keys: string[] ) : StrogTagFunction,
	end     ( type: string, keys: string[] ) : StrogTagFunction,
	__keys        : string[],
	__children    : number,
	__id__        : bigint,
	__parent?     : StrogTagFunction | undefined,
	__disabled?   : string,
};

// 12-bit segments => 3 hex characters per hierarchical level.
const SEG_BITS = 12n;
const SEG_SIZE = 1n << SEG_BITS; // 4096
const SEG_MASK = SEG_SIZE - 1n; // 0xFFFn

// Natural hard child limit (12-bit segment supports ordinals 1..4095).
const HARD_CHILD_LIMIT = Number(SEG_MASK); // 4095

let LAST_ROOT = 0n;

let STROG_OPTIONS = { delimiter: '\u2028' } as StrogOptions;

function safeJsonParse<T>(json: string): T | void {
	try {
		return JSON.parse(json);
	} catch {}
}

export function Strog ( type: string, keys: string[], parent?: StrogTagFunction, role?: StrogRole ) : StrogTagFunction {

	const tagFn : StrogTagFunction = ( strings: TemplateStringsArray, ...placeholders: any[] ) : string => {
		const plainMessage = String.raw ( { raw: strings }, ...placeholders );
		if ( tagFn.__disabled ) return `${plainMessage}⚠${tagFn.__disabled}`;
		const id = Strog.serializeId ( tagFn.__id__ );
		const metadata = Strog.metadata ( type, placeholders, keys, role, id );
		const delimiter = STROG_OPTIONS.delimiter;
		return `${plainMessage}${delimiter}${JSON.stringify(metadata)}`;
	};

	tagFn.__keys = keys;
	tagFn.__children = 0;
	tagFn.__parent = parent;

	if ( !parent ) {
		LAST_ROOT++;
		tagFn.__id__ = LAST_ROOT;
	} else {
		parent.__children++;
		if ( parent.__disabled ) {
			tagFn.__id__ = parent.__id__;
			tagFn.__disabled = parent.__disabled;
		} else {
			if ( parent.__children <= HARD_CHILD_LIMIT ) {
				tagFn.__id__ = Strog.id ( parent.__id__, parent.__children );
			} else {
				tagFn.__id__ = parent.__id__;
				tagFn.__disabled = `trunc-lim`;
			}
		}
	} 

	tagFn.span = ( type: string, keys: string[] ) => {
		return Strog ( type, keys, tagFn )
	};

	tagFn.addAttr = ( type: string, keys: string [] ) => {
		return Strog ( type, keys, tagFn, 'attr' );
	};

	tagFn.end = ( type: string, keys: string[] ) => {
		return Strog ( type, keys, tagFn, 'end' );
	}

	// tagFn.scope = () => {};

	return tagFn as StrogTagFunction;
}

Strog.set = function ( options: StrogOptions ) {
	STROG_OPTIONS = options;
}

Strog.metadata = function ( type: string, placeholders: any[], keys: string[], role?: StrogRole, id?: StrogId ) : Metadata {
	const record = Strog.record ( placeholders, keys );
	return { type, role, id, record } as Metadata;
}

Strog.record = function ( placeholders: any[], keys: string[] ): Record<string, any> {
	const result: Record<string, any> = {};
	for ( let i = 0; i < keys.length; i++ ) {
		const key = keys[i];
		if (key !== undefined) result[key] = placeholders[i];
	}
	return result;
};

Strog.parse = function ( structuredLogMessage: string, delimiter = STROG_OPTIONS.delimiter ) : StructuredLog {
	if (delimiter === '') throw new Error('Delimiter cannot be empty string.');
	const delimiterIndex = structuredLogMessage.lastIndexOf(delimiter);
	if (delimiterIndex === -1) return { message: structuredLogMessage } as StructuredLog;
	const message = structuredLogMessage.slice ( 0, delimiterIndex );
	const metadatajson = structuredLogMessage.slice ( delimiterIndex + delimiter.length );
	const metadata = metadatajson ? safeJsonParse<Metadata> ( metadatajson ) : undefined;
	return { message, metadata } as StructuredLog;
};


Strog.id = function ( parentId : bigint, childOrdinal: number ) {
	return ( parentId << SEG_BITS ) | BigInt ( childOrdinal );
}

Strog.serializeId = function ( id: bigint ) : StrogId {
	let hex = id.toString(16);
	const rem = hex.length % 3;
	if ( rem ) hex = '0'.repeat(3 - rem) + hex;
	return hex;
}

Strog.parseId = function ( id: string ) : bigint {
	// Require length to be a multiple of 3 (12-bit segments => 3 hex chars each)
	if ( id.length % 3 !== 0 ) throw new Error('Invalid id format');
	if (!/^([0-9a-fA-F]+)$/.test(id)) throw new Error('Invalid id format');
	return BigInt('0x' + id);
}


Strog.parentFromId = function ( id: bigint | number | undefined ) : bigint | undefined | void {
	if ( id ) {
		if ( typeof id === 'number' ) id = BigInt(id);
		const p = id >> SEG_BITS;
		return p === 0n ? undefined : p;
	}
};

Strog.parent = function ( val: any ) : bigint | number | undefined | void {
	const type = typeof val;
	switch ( type ) {
		case 'number': return Strog.parentFromId ( val );
		case 'string': {
			const parsed = Strog.parse( val );
			const idStr = parsed.metadata?.id;
			return idStr ? Strog.parentFromId ( Strog.parseId(idStr) ) : undefined;
		}
		case 'object': 
			if ( val ) {
				const idStr = (val as any).id ?? (val as any).metadata?.id;
				return idStr ? Strog.parentFromId ( Strog.parseId(idStr) ) : undefined;
			}
	}
};

// Convenience: given a hex id string return its parent hex id (or undefined for a root)
Strog.parentHex = function ( id: string | undefined ) : string | undefined {
	if (!id) return undefined;
	const p = Strog.parentFromId( Strog.parseId(id) );
	return p ? Strog.serializeId(p as bigint) : undefined;
};

Strog.ordinal = function ( id: bigint ) : number {
	return Number ( id & SEG_MASK );
};
