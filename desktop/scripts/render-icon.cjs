'use strict';
/* global console, __dirname */

const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const source = path.resolve(__dirname, '..', '..', 'app', 'public', 'favicon.svg');
  const destination = path.resolve(__dirname, '..', 'build', 'icon.png');
  const svg = await fs.readFile(source, 'utf8');
  const imageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const documentUrl = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
    <style>
      html, body, img { width: 100%; height: 100%; margin: 0; }
      img { display: block; }
    </style>
    <img src="${imageUrl}" alt="">
  `)}`;
  const window = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    offscreen: true,
    transparent: true,
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  await window.loadURL(documentUrl);
  await window.webContents.executeJavaScript("document.querySelector('img').decode()", true);
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, image.toPNG());
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
