'use strict';
/* global URL */

const path = require('node:path');

const APP_PROTOCOL = 'cotlab:';
const APP_HOST = 'app';
const APP_ENTRY = 'index.html';

function parseTrustedAppUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== APP_PROTOCOL ||
      url.hostname !== APP_HOST ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== ''
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function isTrustedAppUrl(value) {
  return parseTrustedAppUrl(value) !== null;
}

function isExternalHttpsUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.hostname !== ''
    );
  } catch {
    return false;
  }
}

function isPathInsideRoot(candidate, root) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return (
    relative === '' ||
    (
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    )
  );
}

function resolveAppRequest(value, staticRoot) {
  const url = parseTrustedAppUrl(value);
  if (!url) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  if (decodedPath.includes('\0') || decodedPath.includes('\\')) return null;

  const segments = decodedPath.split('/');
  if (segments.some((segment) => segment === '..')) return null;

  const relativePath = decodedPath === '/' || decodedPath === ''
    ? APP_ENTRY
    : path.posix.normalize(decodedPath).replace(/^\/+/, '');

  if (
    relativePath === '' ||
    relativePath === '.' ||
    relativePath === '..' ||
    relativePath.startsWith('../')
  ) {
    return null;
  }

  const root = path.resolve(staticRoot);
  const candidate = path.resolve(root, ...relativePath.split('/'));
  const rootRelative = path.relative(root, candidate);

  if (
    rootRelative === '..' ||
    rootRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(rootRelative)
  ) {
    return null;
  }

  return candidate;
}

module.exports = {
  APP_HOST,
  APP_PROTOCOL,
  isExternalHttpsUrl,
  isPathInsideRoot,
  isTrustedAppUrl,
  resolveAppRequest,
};
