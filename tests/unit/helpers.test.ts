import { describe, test } from 'node:test';
import assert from 'node:assert';
import { Strog } from '../../src/index.js';

// Utility to parse a structured log line using the library's delimiter
function parse(line: string) {
	const delim = '\u2028';
	const idx = line.lastIndexOf(delim);
	if (idx === -1) return { message: line } as any;
	const message = line.slice(0, idx);
	const meta = JSON.parse(line.slice(idx + delim.length));
	return { message, metadata: meta } as any;
}

describe('Helper functions & edge branches', () => {
	test('serializeId pads to multiple of 3 hex chars (mod 1)', () => {
		const id = 0x1n; // hex '1'
		const s = (Strog as any).serializeId(id) as string;
		assert.equal(s.length % 3, 0);
		assert.equal(s, '001');
	});

	test('serializeId pads to multiple of 3 hex chars (mod 2)', () => {
		const id = 0x12n; // hex '12'
		const s = (Strog as any).serializeId(id) as string;
		assert.equal(s.length % 3, 0);
		assert.equal(s, '012');
	});

	test('parseId roundtrip', () => {
		const root = Strog('root', []); const line = root`x`;
		const meta = parse(line).metadata!;
		const idHex = meta.id!;
		const parsed = (Strog as any).parseId(idHex) as bigint;
		const reSer = (Strog as any).serializeId(parsed) as string;
		assert.equal(reSer, idHex);
	});

	test('parseId rejects bad length', () => {
		assert.throws(() => (Strog as any).parseId('12'), /Invalid id format/);
	});

	test('parseId rejects non-hex', () => {
		assert.throws(() => (Strog as any).parseId('ggg'), /Invalid id format/);
	});

	test('parentFromId root -> undefined, child -> parent', () => {
		const Root = Strog('root', []);
		const Child = Root.span('child', []);
		const rootMeta = parse(Root`r`).metadata!;
		const childMeta = parse(Child`c`).metadata!;
		const rootIdBig = (Strog as any).parseId(rootMeta.id);
		const childIdBig = (Strog as any).parseId(childMeta.id);
		const parentOfRoot = (Strog as any).parentFromId(rootIdBig);
		const parentOfChild = (Strog as any).parentFromId(childIdBig);
		assert.equal(parentOfRoot, undefined);
		assert.equal(parentOfChild, rootIdBig);
	});

	test('ordinal extracts low 12 bits', () => {
		const Root = Strog('root', []);
		const First = Root.span('c', []); First``;
		const Second = Root.span('c', []); const secondMeta = parse(Second``).metadata!;
		const secondIdBig = (Strog as any).parseId(secondMeta.id) as bigint;
		const ord = (Strog as any).ordinal(secondIdBig);
		assert.ok(ord >= 1 && ord <= 4095);
	});

	test('parent(string with no delimiter) -> undefined', () => {
		const res = (Strog as any).parent('plain log line');
		assert.equal(res, undefined);
	});

	test('parent(object with id)', () => {
		const Root = Strog('root', []);
		const id = parse(Root`x`).metadata!.id;
		const res = (Strog as any).parent({ id });
		assert.equal(res, undefined); // root has no parent
	});

	test('parent(object with metadata.id)', () => {
		const Root = Strog('root', []);
		const Child = Root.span('c', []);
		const childId = parse(Child`y`).metadata!.id;
		const parent = (Strog as any).parent({ metadata: { id: childId } });
		const rootId = parse(Root`z`).metadata!.id;
		assert.equal('0x' + (parent as bigint).toString(16), '0x' + (Strog as any).parseId(rootId).toString(16));
	});

	test('parent(number id)', () => {
		const Root = Strog('root', []);
		const Child = Root.span('c', []);
		const childIdHex = parse(Child`k`).metadata!.id;
		const childBig = (Strog as any).parseId(childIdHex) as bigint;
		const asNumber = Number(childBig);
		const parent = (Strog as any).parent(asNumber);
		const rootIdHex = parse(Root`m`).metadata!.id;
		assert.equal('0x' + (parent as bigint).toString(16), '0x' + (Strog as any).parseId(rootIdHex).toString(16));
	});

	test('parent(null) -> undefined', () => {
		const parent = (Strog as any).parent(null);
		assert.equal(parent, undefined);
	});
});
