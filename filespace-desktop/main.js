const path = require('path');
const {
  app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification,
  powerMonitor, safeStorage, shell, Tray,
} = require('electron');
const { ApiClient, normalizeApiUrl } = require('./src/apiClient');
const { createStores } = require('./src/stateStore');
const { SyncEngine } = require('./src/syncEngine');
const { UpdateService } = require('./src/updateService');
const { version: clientVersion } = require('./package.json');

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let window;
let tray;
let stores;
let settings;
let engine;
let updater;
let updateTimer;
let token = '';
let quitting = false;

const trayIconPath = () => path.join(__dirname, 'assets', 'orderspace-tray.png');

const trayImage = () => {
  const image = nativeImage.createFromPath(trayIconPath());
  if (image.isEmpty()) throw new Error('Не удалось загрузить иконку системного трея');
  return image.resize({ width: 20, height: 20, quality: 'best' });
};

const decryptToken = (encrypted) => {
  if (!encrypted || !safeStorage.isEncryptionAvailable()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  } catch (error) {
    console.warn('[desktop] token decrypt failed', error.message);
    return '';
  }
};

const saveSettings = () => stores.settings.save(settings);
const apiClient = () => (token ? new ApiClient(settings.apiUrl, token) : null);

const publicState = () => ({
  apiUrl: settings.apiUrl,
  syncPath: settings.syncPath,
  user: settings.user,
  autoStart: settings.autoStart,
  authenticated: Boolean(token),
  update: updater?.publicState() || null,
  sync: {
    running: engine?.running || false,
    busy: engine?.busy || false,
    initialized: engine?.state?.initialized || false,
    files: Object.keys(engine?.state?.files || {}).length,
    roots: Object.keys(engine?.state?.roots || {}).length,
    error: engine?.connectionError || '',
  },
});

const send = (channel, value) => {
  if (window && !window.isDestroyed()) window.webContents.send(channel, value);
};

const createWindow = () => {
  window = new BrowserWindow({
    width: 820,
    height: 700,
    minWidth: 680,
    minHeight: 600,
    show: false,
    title: 'OrderSpace FileSpace',
    icon: trayIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.removeMenu();
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  window.once('ready-to-show', () => window.show());
  window.on('close', (event) => {
    if (!quitting && engine?.running) {
      event.preventDefault();
      window.hide();
    }
  });
};

const updateTrayMenu = () => {
  if (!tray) return;
  const update = updater?.publicState();
  const template = [
    { label: 'Открыть OrderSpace FileSpace', click: () => { window.show(); window.focus(); } },
    { label: 'Синхронизировать сейчас', enabled: Boolean(engine?.running), click: () => engine.syncNow().catch((error) => send('sync:status', { error: error.message })) },
    { type: 'separator' },
    engine?.running
      ? { label: 'Приостановить синхронизацию', click: () => { engine.stop(); updateTrayMenu(); } }
      : { label: 'Запустить синхронизацию', enabled: Boolean(token && settings.syncPath), click: () => startSync().catch((error) => send('sync:status', { error: error.message })) },
  ];
  if (update?.available) {
    template.push(
      { type: 'separator' },
      {
        label: update.downloading
          ? `Скачивание обновления${update.progress == null ? '…' : `: ${update.progress}%`}`
          : `Установить обновление ${update.version}`,
        enabled: !update.downloading,
        click: () => applyUpdate().catch((error) => updater?.setState({ error: error.message })),
      },
    );
  }
  template.push(
    { type: 'separator' },
    { label: 'Выход', click: () => { quitting = true; app.quit(); } },
  );
  tray.setToolTip(update?.available ? `OrderSpace FileSpace — доступна версия ${update.version}` : 'OrderSpace FileSpace');
  tray.setContextMenu(Menu.buildFromTemplate(template));
};

const createTray = () => {
  tray = new Tray(trayImage());
  tray.setToolTip('OrderSpace FileSpace');
  tray.on('double-click', () => { window.show(); window.focus(); });
  updateTrayMenu();
};

const startSync = async () => {
  if (!token) throw new Error('Сначала войдите в CRM');
  if (!settings.syncPath) throw new Error('Выберите локальную папку');
  await engine.configure({ apiUrl: settings.apiUrl, token, syncPath: settings.syncPath });
  await engine.start();
  updateTrayMenu();
  return publicState();
};

const notifyUpdate = async (update) => {
  if (!update.available || settings.lastNotifiedVersion === update.version) return;
  settings.lastNotifiedVersion = update.version;
  await saveSettings();
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title: 'Обновление OrderSpace FileSpace',
    body: `Доступна версия ${update.version}. Откройте клиент, чтобы установить её.`,
    icon: trayIconPath(),
  });
  notification.on('click', () => {
    window.show();
    window.focus();
  });
  notification.show();
};

const checkForUpdates = async () => {
  if (!token || !updater) return;
  try {
    const update = await updater.check();
    await notifyUpdate(update);
  } catch (error) {
    console.warn('[desktop:update] check failed', error.message);
  }
};

const applyUpdate = async () => {
  if (!updater) throw new Error('Служба обновления ещё не запущена');
  const installerPath = await updater.download();
  if (!installerPath) return publicState();
  const openError = await shell.openPath(installerPath);
  if (openError) throw new Error(openError);
  setTimeout(() => {
    quitting = true;
    app.quit();
  }, 1000);
  return publicState();
};

const registerIpc = () => {
  ipcMain.handle('app:bootstrap', () => publicState());
  ipcMain.handle('auth:login', async (_event, payload) => {
    const apiUrl = normalizeApiUrl(payload.apiUrl);
    const result = await new ApiClient(apiUrl).login(String(payload.username || '').trim(), String(payload.password || ''));
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows не предоставил защищённое хранилище для токена');
    token = result.token;
    settings.apiUrl = apiUrl;
    settings.user = result.user;
    settings.encryptedToken = safeStorage.encryptString(token).toString('base64');
    await saveSettings();
    setTimeout(() => checkForUpdates(), 1000);
    return publicState();
  });
  ipcMain.handle('auth:logout', async () => {
    engine.stop();
    if (token) {
      await apiClient()?.request('/auth/logout', { method: 'POST' }).catch(() => {});
    }
    token = '';
    settings.encryptedToken = '';
    settings.user = null;
    updater?.clear();
    await saveSettings();
    updateTrayMenu();
    return publicState();
  });
  ipcMain.handle('sync:choose-folder', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Выберите папку OrderSpace FileSpace',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return publicState();
    const nextPath = path.resolve(result.filePaths[0]);
    if (settings.syncPath && path.resolve(settings.syncPath) !== nextPath) {
      engine.stop();
      await engine.resetState();
    }
    settings.syncPath = nextPath;
    await saveSettings();
    return publicState();
  });
  ipcMain.handle('sync:start', () => startSync());
  ipcMain.handle('sync:stop', () => {
    engine.stop();
    updateTrayMenu();
    return publicState();
  });
  ipcMain.handle('sync:now', async () => {
    await engine.syncNow();
    return publicState();
  });
  ipcMain.handle('sync:open-folder', async () => {
    if (settings.syncPath) await shell.openPath(settings.syncPath);
  });
  ipcMain.handle('settings:auto-start', async (_event, enabled) => {
    settings.autoStart = Boolean(enabled);
    app.setLoginItemSettings({ openAtLogin: settings.autoStart, path: process.execPath });
    await saveSettings();
    return publicState();
  });
  ipcMain.handle('update:check', async () => {
    await checkForUpdates();
    return publicState();
  });
  ipcMain.handle('update:install', () => applyUpdate());
};

app.on('before-quit', () => {
  quitting = true;
  clearInterval(updateTimer);
  engine?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'win32') app.quit();
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window) {
      window.show();
      window.focus();
    }
  });
  app.whenReady().then(async () => {
    app.setAppUserModelId('ru.orderspace.filespace');
    stores = createStores(app.getPath('userData'));
    settings = await stores.settings.load();
    token = decryptToken(settings.encryptedToken);
    engine = new SyncEngine({
      syncStateStore: stores.syncState,
      trashPath: (target) => shell.trashItem(target),
    });
    updater = new UpdateService({
      currentVersion: clientVersion,
      downloadsDir: app.getPath('temp'),
      getApiClient: apiClient,
      onState: (value) => {
        send('update:state', value);
        updateTrayMenu();
      },
    });
    engine.on('status', (value) => { send('sync:status', value); updateTrayMenu(); });
    engine.on('log', (value) => send('sync:log', value));
    createWindow();
    createTray();
    registerIpc();
    powerMonitor.on('suspend', () => engine?.suspendForSleep());
    powerMonitor.on('resume', () => {
      engine?.resumeAfterWake();
      setTimeout(() => checkForUpdates(), 10_000);
    });
    setTimeout(() => checkForUpdates(), 15_000);
    updateTimer = setInterval(() => checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
    if (token && settings.syncPath) {
      startSync().catch((error) => send('sync:status', { error: error.message }));
    }
  });
}
