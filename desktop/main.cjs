'use strict';
/* global URL, Response, setTimeout, console, process, __dirname */

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  Menu,
  protocol,
  session,
  shell,
} = require('electron');
const {
  isExternalHttpsUrl,
  isPathInsideRoot,
  isTrustedAppUrl,
  resolveAppRequest,
} = require('./security.cjs');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'cotlab',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      allowServiceWorkers: true,
    },
  },
]);

const smokeOutputArgument = process.argv.find((argument) =>
  argument.startsWith('--smoke-test-output='),
);
const smokeOutputCandidate = smokeOutputArgument
  ? path.resolve(smokeOutputArgument.slice('--smoke-test-output='.length))
  : null;
const smokeOutput = smokeOutputCandidate &&
  smokeOutputCandidate !== path.resolve(os.tmpdir()) &&
  isPathInsideRoot(smokeOutputCandidate, os.tmpdir()) &&
  path.extname(smokeOutputCandidate).toLowerCase() === '.json'
  ? smokeOutputCandidate
  : null;
let smokeFinished = false;

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function staticAssetRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app-dist')
    : path.resolve(__dirname, '..', 'app', 'dist');
}

async function writeSmokeResult(result, exitCode) {
  if (!smokeOutput || smokeFinished) return;
  smokeFinished = true;

  try {
    await fs.mkdir(path.dirname(smokeOutput), { recursive: true });
    await fs.writeFile(
      smokeOutput,
      `${JSON.stringify({ ...result, exitCode }, null, 2)}\n`,
      'utf8',
    );
  } finally {
    app.exit(exitCode);
  }
}

async function openExternalHttps(value) {
  if (!isExternalHttpsUrl(value)) return;
  await shell.openExternal(value, { activate: true });
}

function secureWebContents(contents) {
  contents.on('will-attach-webview', (event) => event.preventDefault());

  contents.setWindowOpenHandler(({ url }) => {
    void openExternalHttps(url).catch(() => {});
    return { action: 'deny' };
  });

  const guardNavigation = (event, url) => {
    if (isTrustedAppUrl(url)) return;
    event.preventDefault();
    void openExternalHttps(url).catch(() => {});
  };

  contents.on('will-navigate', guardNavigation);
  contents.on('will-redirect', guardNavigation);
}

function configureSessionSecurity() {
  const appSession = session.defaultSession;

  appSession.setPermissionCheckHandler(() => false);
  appSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });

  appSession.webRequest.onBeforeRequest((details, callback) => {
    let scheme;
    try {
      scheme = new URL(details.url).protocol;
    } catch {
      callback({ cancel: true });
      return;
    }

    callback({ cancel: !['cotlab:', 'blob:', 'data:'].includes(scheme) });
  });
}

async function installAppProtocol() {
  const root = staticAssetRoot();
  const canonicalRoot = await fs.realpath(root);

  protocol.handle('cotlab', async (request) => {
    const assetPath = resolveAppRequest(request.url, root);
    if (!assetPath) {
      return new Response('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    try {
      const canonicalAsset = await fs.realpath(assetPath);
      if (!isPathInsideRoot(canonicalAsset, canonicalRoot)) {
        throw new Error('Requested resource escapes the application root.');
      }
      const stat = await fs.stat(canonicalAsset);
      if (!stat.isFile()) throw new Error('Requested resource is not a file.');
      const body = await fs.readFile(canonicalAsset);
      const extension = path.extname(canonicalAsset).toLowerCase();
      return new Response(body, {
        status: 200,
        headers: {
          'cache-control': canonicalAsset.includes(`${path.sep}assets${path.sep}`)
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
          'content-type': MIME_TYPES.get(extension) ?? 'application/octet-stream',
          'cross-origin-resource-policy': 'same-origin',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch {
      return new Response('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  });
}

async function runSmokeCheck(window) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    try {
      const result = await window.webContents.executeJavaScript(`(() => {
        const root = document.querySelector('#root');
        return {
          location: window.location.href,
          title: document.title,
          heading: document.querySelector('h1')?.textContent?.trim() ?? '',
          curriculumTogglePresent: Boolean(document.querySelector('button[aria-label="Toggle curriculum"]')),
          parameterInputCount: document.querySelectorAll('input[type="number"]').length,
          rootChildCount: root?.childElementCount ?? 0,
          visibleTextLength: (root?.textContent ?? '').trim().length,
        };
      })()`, true);

      if (result.rootChildCount > 0 && result.visibleTextLength > 100) {
        const passed =
          result.location.startsWith('cotlab://app/') &&
          result.title === 'Constant On-Time Lab' &&
          result.heading === 'Constant On-Time Lab' &&
          result.curriculumTogglePresent &&
          result.parameterInputCount > 0;
        await writeSmokeResult(
          {
            passed,
            packaged: app.isPackaged,
            ...result,
          },
          passed ? 0 : 1,
        );
        return;
      }
    } catch (error) {
      await writeSmokeResult(
        { passed: false, error: String(error), packaged: app.isPackaged },
        1,
      );
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  await writeSmokeResult(
    { passed: false, error: 'Timed out waiting for the React application.', packaged: app.isPackaged },
    1,
  );
}

async function createMainWindow() {
  Menu.setApplicationMenu(null);
  const window = new BrowserWindow({
    width: 1440,
    height: 1024,
    minWidth: 1024,
    minHeight: 720,
    show: !smokeOutput,
    backgroundColor: '#09131d',
    title: 'Constant On-Time Lab',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      devTools: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      allowRunningInsecureContent: false,
      enableWebSQL: false,
      safeDialogs: true,
    },
  });

  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    void writeSmokeResult(
      { passed: false, error: `${code}: ${description}`, url, packaged: app.isPackaged },
      1,
    );
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    void writeSmokeResult(
      { passed: false, error: `Renderer exited: ${details.reason}`, packaged: app.isPackaged },
      1,
    );
  });

  await window.loadURL('cotlab://app/');
  if (smokeOutput) void runSmokeCheck(window);
}

app.on('web-contents-created', (_event, contents) => secureWebContents(contents));

app.whenReady().then(async () => {
  if (smokeOutputArgument && !smokeOutput) {
    app.exit(2);
    return;
  }
  configureSessionSecurity();
  await installAppProtocol();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
  });
}).catch((error) => {
  void writeSmokeResult(
    { passed: false, error: String(error), packaged: app.isPackaged },
    1,
  );
  if (!smokeOutput) {
    console.error(error);
    app.exit(1);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
