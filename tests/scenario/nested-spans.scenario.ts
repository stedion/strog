/**
 * Scenario test (excluded from default unit test script) demonstrating nested span usage.
 * Run manually: node --test --import=tsx tests/scenario/nested-spans.scenario.ts
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { Strog } from '../../src/index.js';

test('scenario: multi-level nesting with attrs and end', () => {
	const Root = Strog('request', ['method', 'path']);
	const rootLine = Root`Handling ${'GET'} ${'/users/42'}`;
	const RootAttr = Root.addAttr('request', ['note']);
	const rootAttrLine = RootAttr`attr ${'root-info'}`;

	const DbSpan = Root.span('db', ['op']);
	const dbQueryLine = DbSpan`query ${'select-user'}`;
	const DbAttr = DbSpan.addAttr('db', ['rowCount']);
	const dbAttrLine = DbAttr`rows ${123}`;
	// Deeper nested span under db
	const DbInnerSpan = DbSpan.span('row', ['rowId']);
	const dbInnerLine = DbInnerSpan`row ${'42'}`;
	const DbInnerEnd = DbInnerSpan.end('row', ['durationMs']);
	const dbInnerEndLine = DbInnerEnd`done ${3}`;
	const DbEnd = DbSpan.end('db', ['durationMs']);
	const dbEndLine = DbEnd`done ${17}`;

	const RenderSpan = Root.span('render', ['template']);
	const renderLine = RenderSpan`tmpl ${'profile'}`;
	const renderEnd = RenderSpan.end('render', ['durationMs']);
	const renderEndLine = renderEnd`done ${4}`;

	const rootMeta = Strog.parse(rootLine).metadata!;
	const dbMeta = Strog.parse(dbQueryLine).metadata!;
	const dbAttrMeta = Strog.parse(dbAttrLine).metadata!;
	const dbInnerMeta = Strog.parse(dbInnerLine).metadata!;
	const dbInnerEndMeta = Strog.parse(dbInnerEndLine).metadata!;
	const dbEndMeta = Strog.parse(dbEndLine).metadata!;
	const renderMeta = Strog.parse(renderLine).metadata!;
	const renderEndMeta = Strog.parse(renderEndLine).metadata!;
	const rootAttrMeta = Strog.parse(rootAttrLine).metadata!;

	// Parent id prefix invariant
	// rootEnd not yet created; hierarchy checks for existing children only
	for (const m of [rootAttrMeta, dbMeta, dbAttrMeta, dbInnerMeta, dbInnerEndMeta, dbEndMeta, renderMeta, renderEndMeta]) {
		assert.ok(m.id!.startsWith(rootMeta.id!));
	}

	// Direct child spans (db, render) should be exactly one segment longer than root
	const rootLen = rootMeta.id!.length;
	assert.equal(rootAttrMeta.id!.length, rootLen + 3, 'root attr adds one segment');
	// root end not yet allocated
	assert.equal(dbMeta.id!.length, rootLen + 3, 'db span should add one 3-hex segment');
	assert.equal(renderMeta.id!.length, rootLen + 3, 'render span should add one 3-hex segment');

	// Attr / end under db extend db span by one more segment
	assert.equal(dbAttrMeta.id!.length, dbMeta.id!.length + 3, 'attr should add segment under db');
	assert.equal(dbInnerMeta.id!.length, dbMeta.id!.length + 3, 'inner span should add segment under db');
	assert.equal(dbInnerEndMeta.id!.length, dbInnerMeta.id!.length + 3, 'inner end should add segment under inner span');
	assert.equal(dbEndMeta.id!.length, dbMeta.id!.length + 3, 'end should add segment under db');
	assert.ok(dbAttrMeta.id!.startsWith(dbMeta.id!), 'attr id should start with db span id');
	assert.ok(dbInnerMeta.id!.startsWith(dbMeta.id!), 'inner span id should start with db span id');
	assert.ok(dbInnerEndMeta.id!.startsWith(dbInnerMeta.id!), 'inner end id should start with inner span id');
	assert.ok(dbEndMeta.id!.startsWith(dbMeta.id!), 'db end id should start with db span id');

	// Render end extends render span similarly
	assert.equal(renderEndMeta.id!.length, renderMeta.id!.length + 3, 'render end adds segment');
	assert.ok(renderEndMeta.id!.startsWith(renderMeta.id!), 'render end id should start with render span id');

	// Sibling spans (db vs render) differ in their immediate child segment
	const rootAttrSeg = rootAttrMeta.id!.slice(rootLen, rootLen + 3);
	const dbChildSeg = dbMeta.id!.slice(rootLen, rootLen + 3);
	const renderChildSeg = renderMeta.id!.slice(rootLen, rootLen + 3);
	const prelimRootChildren = [rootAttrSeg, dbChildSeg, renderChildSeg];
	assert.equal(new Set(prelimRootChildren).size, prelimRootChildren.length, 'pre-root-end child segments unique');

	// Children under db span have unique last segments
	const dbAttrSeg = dbAttrMeta.id!.slice(dbMeta.id!.length, dbMeta.id!.length + 3);
	const dbInnerSeg = dbInnerMeta.id!.slice(dbMeta.id!.length, dbMeta.id!.length + 3);
	const dbEndSeg = dbEndMeta.id!.slice(dbMeta.id!.length, dbMeta.id!.length + 3);
	const dbChildSegs = [dbAttrSeg, dbInnerSeg, dbEndSeg];
	assert.equal(new Set(dbChildSegs).size, dbChildSegs.length, 'db child segments unique (attr, inner, end)');

	// === Hierarchy verification using helper functions ===
	// Use parseId + parentFromId chain to reconstruct root for dbAttr and dbEnd
	const dbAttrIdBig = Strog.parseId(dbAttrMeta.id!);
	const dbAttrParent = Strog.parentFromId(dbAttrIdBig)!; // should be db span id bigint
	const dbAttrGrandParent = Strog.parentFromId(dbAttrParent)!; // should be root id bigint
	const dbSpanIdBig = Strog.parseId(dbMeta.id!);
	const dbInnerIdBig = Strog.parseId(dbInnerMeta.id!);
	const dbInnerEndIdBig = Strog.parseId(dbInnerEndMeta.id!);
	const dbEndIdBig = Strog.parseId(dbEndMeta.id!);
	const rootIdBig = Strog.parseId(rootMeta.id!);
	assert.equal(dbAttrParent, dbSpanIdBig, 'parentFromId(dbAttr) should equal db span id');
	assert.equal(dbAttrGrandParent, rootIdBig, 'grandparent of dbAttr should equal root');

	// parent() helper on structured log lines (string input)
	const pDbQuery = Strog.parent(dbQueryLine)!; // bigint root
	assert.equal(pDbQuery, rootIdBig, 'parent(dbQueryLine) should be root');
	const pDbAttr = Strog.parent(dbAttrLine)!; // bigint db span
	assert.equal(pDbAttr, dbSpanIdBig, 'parent(dbAttrLine) should be db span');

	// ordinal() should return low 12-bit segment ordinal for each level
	const dbOrd = Strog.ordinal(dbSpanIdBig);
	const renderOrd = Strog.ordinal(Strog.parseId(renderMeta.id!));
	assert.notEqual(dbOrd, renderOrd, 'Sibling span ordinals should differ');
	const dbAttrOrd = Strog.ordinal(dbAttrIdBig);
	const dbInnerOrd = Strog.ordinal(dbInnerIdBig);
	const dbEndOrd = Strog.ordinal(dbEndIdBig);
	const dbOrdSet = new Set([dbAttrOrd, dbInnerOrd, dbEndOrd]);
	assert.equal(dbOrdSet.size, 3, 'attr, inner span, and end ordinals under db span should be distinct');

	// Walk up from renderEnd using parent() with parsed object form
	const renderEndParent = Strog.parent({ metadata: { id: renderEndMeta.id } })!;
	assert.equal(renderEndParent, Strog.parseId(renderMeta.id!), 'parent(renderEnd) should equal render span');

	// Role semantics
	assert.equal(dbAttrMeta.role, 'attr');
	assert.equal(dbInnerMeta.role, undefined);
	assert.equal(dbInnerEndMeta.role, 'end');
	assert.equal(dbEndMeta.role, 'end');
	assert.equal(renderEndMeta.role, 'end');
	assert.equal(renderMeta.role, undefined);

	// Attribute capture
	assert.equal(dbAttrMeta.record?.rowCount, 123);
	assert.equal(dbInnerEndMeta.record?.durationMs, 3);
	assert.equal(dbEndMeta.record?.durationMs, 17);
	assert.equal(renderEndMeta.record?.durationMs, 4);

	// ---- Console reporting (visual tree) ----
	// Allocate & emit root end last so it gets the final ordinal
	const rootEndLine = Root.end('request', ['durationMs'])`end ${123}`;
	const rootEndMeta = Strog.parse(rootEndLine).metadata!;
	assert.equal(rootEndMeta.id!.length, rootLen + 3, 'root end adds one segment');
	const rootEndSeg = rootEndMeta.id!.slice(rootLen, rootLen + 3);
	const allRootChildren = [rootAttrSeg, dbChildSeg, renderChildSeg, rootEndSeg];
	assert.equal(new Set(allRootChildren).size, allRootChildren.length, 'all root-level child segments unique including root end');
	// Ensure root end ordinal > every previously allocated root child ordinal (lexicographic works since fixed 3-hex width)
	assert.ok(rootEndSeg > rootAttrSeg && rootEndSeg > dbChildSeg && rootEndSeg > renderChildSeg, 'root end segment should be greatest (allocated last)');

	const events = [
		{ label: 'root', line: rootLine },
		{ label: 'root attr', line: rootAttrLine },
		{ label: 'db span', line: dbQueryLine },
		{ label: 'db attr', line: dbAttrLine },
		{ label: 'db inner span', line: dbInnerLine },
		{ label: 'db inner end', line: dbInnerEndLine },
		{ label: 'db end', line: dbEndLine },
		{ label: 'render span', line: renderLine },
		{ label: 'render end', line: renderEndLine },
		{ label: 'root end', line: rootEndLine },
	];

	// ---- Root sibling scenario ----
	const RootSibling = Strog('maintenance', ['task']);
	const rootSiblingLine = RootSibling`Running ${'compaction'}`;
	const SiblingSpan = RootSibling.span('phase', ['name']);
	const siblingSpanLine = SiblingSpan`phase ${'stage-1'}`;
	const SiblingEnd = SiblingSpan.end('phase', ['durationMs']);
	const siblingEndLine = SiblingEnd`done ${42}`;
	const rootSiblingEndLine = RootSibling.end('maintenance', ['result'])`end ${'ok'}`;

	const rootSiblingMeta = Strog.parse(rootSiblingLine).metadata!;
	const siblingSpanMeta = Strog.parse(siblingSpanLine).metadata!;
	const siblingEndMeta = Strog.parse(siblingEndLine).metadata!;
	const rootSiblingEndMeta = Strog.parse(rootSiblingEndLine).metadata!;

	// Assertions for root sibling independence
	assert.notEqual(rootSiblingMeta.id, rootMeta.id, 'root sibling id differs from first root');
	assert.equal(rootSiblingMeta.id!.length, rootMeta.id!.length, 'root sibling id same length');
	assert.ok(!rootSiblingMeta.id!.startsWith(rootMeta.id!), 'root sibling id not prefixed by first root');
	assert.ok(siblingSpanMeta.id!.startsWith(rootSiblingMeta.id!), 'sibling span id prefixed by its root sibling');
	assert.ok(siblingEndMeta.id!.startsWith(siblingSpanMeta.id!), 'sibling end id prefixed by its span');

	// Ordinal comparison between roots (second root ordinal > first root ordinal)
	const rootOrdinal = Strog.ordinal(Strog.parseId(rootMeta.id!));
	const rootSiblingOrdinal = Strog.ordinal(Strog.parseId(rootSiblingMeta.id!));
	assert.ok(rootSiblingOrdinal > rootOrdinal, 'second root ordinal greater than first root ordinal');

	// Append sibling events for console tree
	events.push(
		{ label: 'root2', line: rootSiblingLine },
		{ label: 'root2 span', line: siblingSpanLine },
		{ label: 'root2 end', line: siblingEndLine },
		{ label: 'root2 root-end', line: rootSiblingEndLine },
	);

	function segments(id: string) { return id.match(/.{1,3}/g) || []; }

	// --- Aligned console table output ---
	// Compute dynamic widths considering indentation + bullet inside the label cell
	const maxLabelCell = Math.max(
		...events.map(e => {
			const meta = Strog.parse(e.line).metadata!;
			const depth = segments(meta.id!).length - 1;
			return depth * 2 + 2 + e.label.length; // indent + bullet+space + label
		})
	);
	const maxRole = Math.max(...events.map(e => (Strog.parse(e.line).metadata!.role || 'span').length));
	const maxId = Math.max(...events.map(e => Strog.parse(e.line).metadata!.id!.length));

	const headerLabel = 'label';
	const headerRole = 'role';
	const headerId = 'id';
	const headerOrd = 'ord';
	const headerLabelCell = headerLabel + ' '.repeat(Math.max(0, maxLabelCell - headerLabel.length));
	const headerRoleCell = headerRole + ' '.repeat(Math.max(0, maxRole - headerRole.length));
	const headerIdCell = headerId + ' '.repeat(Math.max(0, maxId - headerId.length));

	console.log('\nScenario Event Tree (aligned columns; id segments: 3-hex each)');
	console.log(`${headerLabelCell}  ${headerRoleCell}  ${headerIdCell}  ${headerOrd}`);
	for (const e of events) {
		const meta = Strog.parse(e.line).metadata!;
		const id = meta.id!;
		const depth = segments(id).length - 1; // root depth 0
		const ord = Strog.ordinal(Strog.parseId(id));
		const role = meta.role || 'span';
		const baseLabel = `${' '.repeat(depth * 2)}• ${e.label}`;
		const labelCell = baseLabel + ' '.repeat(Math.max(0, maxLabelCell - baseLabel.length));
		const roleCell = role + ' '.repeat(Math.max(0, maxRole - role.length));
		const idCell = id + ' '.repeat(Math.max(0, maxId - id.length));
		const ordStr = String(ord).padStart(4);
		console.log(`${labelCell}  ${roleCell}  ${idCell}  ${ordStr}`);
	}
});
