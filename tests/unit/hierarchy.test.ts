/**
 * Unit tests (moved from root tests/hierarchy.test.ts)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { Strog } from '../../src/index.js';

describe('Hierarchy and overflow behavior', () => {
  test('basic sibling ids share root prefix', () => {
    const Root = Strog('root', ['name']);
    const rLine = Root`Root ${'R'}`; const rMeta = Strog.parse(rLine).metadata!;
    const C1 = Root.span('child', ['name']);
    const C2 = Root.span('child', ['name']);
    const c1Meta = Strog.parse(C1`C1 ${'one'}`).metadata!;
    const c2Meta = Strog.parse(C2`C2 ${'two'}`).metadata!;
  assert.ok(c1Meta.id!.startsWith(rMeta.id!));
  assert.ok(c2Meta.id!.startsWith(rMeta.id!));
  assert.equal(c1Meta.id!.length, c2Meta.id!.length);
  });

  test('deep nesting adds 3 hex chars per level', () => {
    const Root = Strog('root', []);
    const Child = Root.span('child', []);
    const Grand = Child.span('grand', []);
    const r = Strog.parse(Root``).metadata!;
    const c = Strog.parse(Child``).metadata!;
    const g = Strog.parse(Grand``).metadata!;
  assert.ok(c.id!.startsWith(r.id!));
  assert.ok(g.id!.startsWith(c.id!));
  assert.equal(c.id!.length, r.id!.length + 3);
  assert.equal(g.id!.length, c.id!.length + 3);
  });

  test('attr and end roles emitted via addAttr / end helpers', () => {
    const Root = Strog('op', []);
    const Attr = Root.addAttr('op', ['k']);
    const End = Root.end('op', ['k']);
    const rootMeta = Strog.parse(Root`root ${'x'}`).metadata!;
    const attrMeta = Strog.parse(Attr`attr ${'y'}`).metadata!;
    const endMeta = Strog.parse(End`end ${'z'}`).metadata!;
    assert.equal(rootMeta.role, undefined);
    assert.equal(attrMeta.role, 'attr');
    assert.equal(endMeta.role, 'end');
  assert.ok(attrMeta.id!.startsWith(rootMeta.id!));
  assert.ok(endMeta.id!.startsWith(rootMeta.id!));
  });
});
