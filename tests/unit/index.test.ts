/**
 * Unit tests (moved from root tests/index.test.ts)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { Strog } from '../../src/index.js';

describe('Strog function factory - static methods', () => {
  test('should create tag with direct function call', () => {
    const EndpointMetric = Strog('endpoint-metric', ['method', 'endpoint']);
    const method = 'GET';
    const endpoint = '/users/123';
    const logMessage = EndpointMetric`${method} ${endpoint}`;
    assert.equal(typeof logMessage, 'string');
    assert(logMessage.includes('GET /users/123'));
  });
  test('should create tag with custom delimiter via global set', () => {
    const original = { delimiter: '\u2028' };
    Strog.set({ delimiter: '·' });
    const CustomTag = Strog('custom', ['key']);
    const message = CustomTag`Value: ${'test'}`;
    assert(message.includes('Value: test'));
    assert(message.includes('·'));
    Strog.set(original);
  });
  test('should create tag with multi-character delimiter via global set', () => {
    const original = { delimiter: '\u2028' };
    Strog.set({ delimiter: '===SEPARATOR===' });
    const CustomTag = Strog('custom', ['key']);
    const message = CustomTag`Value: ${'test'}`;
    assert(message.includes('Value: test'));
    assert(message.includes('===SEPARATOR==='));
    Strog.set(original);
  });
  test('should build metadata object', () => {
    const result = Strog.metadata('test', ['value'], ['key']);
    assert.equal(result.type, 'test');
    assert.equal(result.record?.key, 'value');
  });
  test('should build metadata object with multiple keys', () => {
    const result = Strog.metadata('test', ['value1', 'value2'], ['key1', 'key2']);
    assert.equal(result.type, 'test');
    assert.equal(result.record?.key1, 'value1');
    assert.equal(result.record?.key2, 'value2');
  });
  test('should parse structured message', () => {
    const testMessage = 'Hello world\u2028{"type":"test","record":{"key":"value"}}';
    const parsed = Strog.parse(testMessage);
    assert.equal(parsed.message, 'Hello world');
    assert.equal(parsed.metadata?.type, 'test');
    assert.equal(parsed.metadata?.record?.key, 'value');
  });
  test('should parse message with custom delimiter', () => {
    const testMessage = 'Hello world·{"type":"test","record":{"key":"value"}}';
    const parsed = Strog.parse(testMessage, '·');
    assert.equal(parsed.message, 'Hello world');
    assert.equal(parsed.metadata?.type, 'test');
    assert.equal(parsed.metadata?.record?.key, 'value');
  });
  test('should handle message without metadata', () => {
    const testMessage = 'Just a regular message';
    const parsed = Strog.parse(testMessage);
    assert.equal(parsed.message, 'Just a regular message');
    assert.equal(parsed.metadata, undefined);
  });
});

describe('Strog function factory - basic usage', () => {
  test('should work with default delimiter', () => {
    const TestTag = Strog('test', ['key']);
    const message = TestTag`Message: ${'value'}`;
    const parsed = Strog.parse(message);
    assert.equal(parsed.message, 'Message: value');
    assert.equal(parsed.metadata?.type, 'test');
    assert.equal(parsed.metadata?.record?.key, 'value');
  });
  test('should work with custom delimiter (global)', () => {
    const original = { delimiter: '\u2028' };
    Strog.set({ delimiter: '|' });
    const TestTag = Strog('test', ['key']);
    const message = TestTag`Message: ${'value'}`;
    const parsed = Strog.parse(message, '|');
    assert.equal(parsed.message, 'Message: value');
    assert.equal(parsed.metadata?.type, 'test');
    assert.equal(parsed.metadata?.record?.key, 'value');
    Strog.set(original);
  });
  test('should work with multi-character delimiter (global)', () => {
    const original = { delimiter: '\u2028' };
    Strog.set({ delimiter: '||DELIM||' });
    const TestTag = Strog('test', ['key']);
    const message = TestTag`Message: ${'value'}`;
    const parsed = Strog.parse(message, '||DELIM||');
    assert.equal(parsed.message, 'Message: value');
    assert.equal(parsed.metadata?.type, 'test');
    assert.equal(parsed.metadata?.record?.key, 'value');
    Strog.set(original);
  });
  test('should handle more keys than placeholders', () => {
    const TestTag = Strog('test', ['key1', 'key2', 'key3']);
    const message = TestTag`Values: ${'first'} ${'second'}`;
    const parsed = Strog.parse(message);
    assert.equal(parsed.metadata?.record?.key1, 'first');
    assert.equal(parsed.metadata?.record?.key2, 'second');
    assert.equal(parsed.metadata?.record?.key3, undefined);
  });
  test('should handle more placeholders than keys', () => {
    const TestTag = Strog('test', ['key1', 'key2']);
    const message = TestTag`Values: ${'first'} ${'second'} ${'third'}`;
    const parsed = Strog.parse(message);
    assert.equal(parsed.metadata?.record?.key1, 'first');
    assert.equal(parsed.metadata?.record?.key2, 'second');
  });
  test('should handle empty keys array', () => {
    const EmptyTag = Strog('empty', []);
    const message = EmptyTag`Just a message`;
    const parsed = Strog.parse(message);
    assert.equal(parsed.metadata?.type, 'empty');
    assert.deepEqual(parsed.metadata?.record, {});
  });
});

describe('Integration style (single-file)', () => {
  test('should work end-to-end with direct function calls', () => {
    const UserAction = Strog('user-action', ['user_id', 'action', 'timestamp']);
    const userId = 'user_123'; const action = 'login'; const timestamp = Date.now();
    const logMessage = UserAction`User ${userId} performed ${action} at ${timestamp}`;
    assert(logMessage.includes(`User ${userId} performed ${action} at ${timestamp}`));
    const parsed = Strog.parse(logMessage);
    assert.equal(parsed.message, `User ${userId} performed ${action} at ${timestamp}`);
    assert.equal(parsed.metadata?.record?.user_id, userId);
    assert.equal(parsed.metadata?.record?.action, action);
    assert.equal(parsed.metadata?.record?.timestamp, timestamp);
  });
  test('should work end-to-end with static methods', () => {
    const UserAction = Strog('user-action', ['user_id', 'action', 'timestamp']);
    const userId = 'user_456'; const action = 'logout'; const timestamp = Date.now();
    const logMessage = UserAction`User ${userId} performed ${action} at ${timestamp}`;
    const parsed = Strog.parse(logMessage);
    assert.equal(parsed.metadata?.record?.user_id, userId);
    assert.equal(parsed.metadata?.record?.action, action);
    assert.equal(parsed.metadata?.record?.timestamp, timestamp);
  });
  test('should maintain consistency between tag and static parsing', () => {
    const original = { delimiter: '\u2028' }; const delimiter = '||';
    Strog.set({ delimiter });
    const StaticTag = Strog('test', ['key']);
    const message1 = StaticTag`Test message: ${'value'}`;
    const parsed = Strog.parse(message1, delimiter);
    assert.equal(parsed.message, 'Test message: value');
    assert.equal(parsed.metadata?.record?.key, 'value');
    Strog.set(original);
  });
});

describe('Edge cases and error handling', () => {
  test('should handle delimiter appearing in message', () => {
    const original = { delimiter: '\u2028' }; Strog.set({ delimiter: '|' });
    const TestTag = Strog('test', ['key']);
    const message = TestTag`Message with | delimiter: ${'value'}`;
    const parsed = Strog.parse(message, '|');
    assert.equal(parsed.metadata?.record?.key, 'value');
    Strog.set(original);
  });
  test('should handle multi-character delimiter appearing in message', () => {
    const original = { delimiter: '\u2028' }; Strog.set({ delimiter: '||SEP||' });
    const TestTag = Strog('test', ['key']);
    const message = TestTag`Message with ||SEP|| in content: ${'value'}`;
    const parsed = Strog.parse(message, '||SEP||');
    assert.equal(parsed.metadata?.record?.key, 'value');
    assert(parsed.message.includes('||SEP||'));
    Strog.set(original);
  });
  test('should handle malformed JSON in metadata', () => {
    const malformedMessage = 'Hello world\u2028{invalid json}';
    const parsed = Strog.parse(malformedMessage);
    assert.equal(parsed.message, 'Hello world');
    assert.equal(parsed.metadata, undefined);
  });
  test('should reject empty delimiter when parsing', () => {
    assert.throws(() => { Strog.parse('some message', ''); }, /Delimiter cannot be empty string/);
  });
});
