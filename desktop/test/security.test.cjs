'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  isExternalHttpsUrl,
  isPathInsideRoot,
  isTrustedAppUrl,
  resolveAppRequest,
} = require('../security.cjs');

const root = path.resolve('C:\\constant-on-time\\app\\dist');

test('accepts only the canonical application origin', () => {
  assert.equal(isTrustedAppUrl('cotlab://app/'), true);
  assert.equal(isTrustedAppUrl('cotlab://app/assets/index.js'), true);
  assert.equal(isTrustedAppUrl('cotlab://evil/'), false);
  assert.equal(isTrustedAppUrl('https://app/'), false);
  assert.equal(isTrustedAppUrl('cotlab://user@app/'), false);
  assert.equal(isTrustedAppUrl('cotlab://app:1234/'), false);
});

test('resolves local application resources beneath the distribution root', () => {
  assert.equal(resolveAppRequest('cotlab://app/', root), path.join(root, 'index.html'));
  assert.equal(
    resolveAppRequest('cotlab://app/assets/index.js?cache=1', root),
    path.join(root, 'assets', 'index.js'),
  );
});

test('rejects traversal and malformed application paths', () => {
  assert.equal(resolveAppRequest('cotlab://app/assets/%2f..%2fsecret', root), null);
  assert.equal(resolveAppRequest('cotlab://app/assets/%5c..%5csecret', root), null);
  assert.equal(resolveAppRequest('cotlab://app/%00secret', root), null);
  assert.equal(resolveAppRequest('cotlab://evil/index.html', root), null);
  assert.equal(resolveAppRequest('not a url', root), null);
});

test('permits only credential-free HTTPS external destinations', () => {
  assert.equal(isExternalHttpsUrl('https://example.com/reference'), true);
  assert.equal(isExternalHttpsUrl('https://example.com:8443/reference'), true);
  assert.equal(isExternalHttpsUrl('http://example.com/reference'), false);
  assert.equal(isExternalHttpsUrl('mailto:person@example.com'), false);
  assert.equal(isExternalHttpsUrl('https://user@example.com/reference'), false);
  assert.equal(isExternalHttpsUrl('javascript:alert(1)'), false);
});

test('recognizes canonical paths inside a trusted root', () => {
  assert.equal(isPathInsideRoot(path.join(root, 'assets', 'index.js'), root), true);
  assert.equal(isPathInsideRoot(root, root), true);
  assert.equal(isPathInsideRoot(path.resolve(root, '..', 'secret.txt'), root), false);
});
