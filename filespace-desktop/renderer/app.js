const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map((element) => [element.id, element]));
let appState = null;
let lastStatus = {};
let updateState = null;
let logs = [];

const setBusy = (busy) => {
  document.querySelectorAll('button').forEach((button) => { button.disabled = busy; });
};

const render = () => {
  const authenticated = Boolean(appState?.authenticated);
  const update = updateState || appState?.update || {};
  elements.loginCard.classList.toggle('hidden', authenticated);
  elements.syncCard.classList.toggle('hidden', !authenticated);
  elements.logCard.classList.toggle('hidden', !authenticated);
  elements.updateCard.classList.toggle('hidden', !authenticated || !update.available);
  elements.apiUrl.value = appState?.apiUrl || 'https://orderspace.ru/api';
  elements.userName.textContent = appState?.user?.name || '';
  elements.folderPath.textContent = appState?.syncPath || 'Не выбрана';
  elements.autoStart.checked = Boolean(appState?.autoStart);
  elements.rootCount.textContent = String(lastStatus.roots ?? appState?.sync?.roots ?? 0);
  elements.fileCount.textContent = String(lastStatus.files ?? appState?.sync?.files ?? 0);

  const running = Boolean(lastStatus.running ?? appState?.sync?.running);
  const busy = Boolean(lastStatus.busy ?? appState?.sync?.busy);
  const error = lastStatus.error ?? appState?.sync?.error;
  elements.startButton.textContent = running ? 'Приостановить' : 'Запустить';
  elements.syncButton.disabled = !running || busy;
  elements.openFolderButton.disabled = !appState?.syncPath;
  elements.connectionBadge.className = `badge ${error ? 'error' : busy ? 'busy' : running ? 'good' : 'neutral'}`;
  elements.connectionBadge.textContent = error ? 'Ошибка' : busy ? 'Синхронизация' : running ? 'Подключено' : 'Остановлено';
  elements.activity.className = `activity ${error ? 'error' : busy ? 'busy' : running ? 'running' : ''}`;
  elements.statusTitle.textContent = error ? 'Ошибка синхронизации' : busy ? (lastStatus.activity || 'Синхронизация…') : running ? 'Все изменения синхронизированы' : 'Синхронизация остановлена';
  elements.statusDetails.textContent = error || (running ? 'Клиент следит за локальной папкой и сервером.' : 'Локальные файлы не изменяются, пока синхронизация остановлена.');
  if (update.available) {
    elements.updateTitle.textContent = `Доступна версия ${update.version}`;
    elements.updateDetails.textContent = update.downloading
      ? `Скачивание обновления${update.progress == null ? '…' : `: ${update.progress}%`}`
      : 'После скачивания откроется установщик, а клиент завершит работу.';
    elements.updateError.textContent = update.error || '';
    elements.installUpdateButton.disabled = Boolean(update.downloading);
    elements.installUpdateButton.textContent = update.downloading
      ? (update.progress == null ? 'Скачивание…' : `Скачивание ${update.progress}%`)
      : 'Скачать и установить';
  }
};

const renderLog = () => {
  elements.log.innerHTML = '';
  if (!logs.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Действий пока нет';
    elements.log.append(empty);
    return;
  }
  logs.slice(0, 50).forEach((entry) => {
    const row = document.createElement('div');
    row.className = `log-entry ${entry.level || ''}`;
    row.textContent = entry.message;
    const time = document.createElement('time');
    time.textContent = new Date(entry.createdAt).toLocaleString('ru-RU');
    row.append(time);
    elements.log.append(row);
  });
};

const invoke = async (operation) => {
  setBusy(true);
  try {
    const next = await operation();
    if (next) appState = next;
    lastStatus = {};
  } catch (error) {
    lastStatus = { ...lastStatus, error: error.message };
  } finally {
    setBusy(false);
    render();
  }
};

elements.loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  elements.loginError.textContent = '';
  invoke(async () => {
    try {
      return await window.orderSpace.login({
        apiUrl: elements.apiUrl.value,
        username: elements.username.value,
        password: elements.password.value,
      });
    } catch (error) {
      elements.loginError.textContent = error.message;
      throw error;
    } finally {
      elements.password.value = '';
    }
  });
});
elements.logoutButton.addEventListener('click', () => invoke(() => window.orderSpace.logout()));
elements.chooseFolderButton.addEventListener('click', () => invoke(() => window.orderSpace.chooseFolder()));
elements.startButton.addEventListener('click', () => invoke(() => (
  (lastStatus.running ?? appState.sync.running) ? window.orderSpace.stop() : window.orderSpace.start()
)));
elements.syncButton.addEventListener('click', () => invoke(() => window.orderSpace.now()));
elements.openFolderButton.addEventListener('click', () => window.orderSpace.openFolder());
elements.autoStart.addEventListener('change', () => invoke(() => window.orderSpace.setAutoStart(elements.autoStart.checked)));
elements.installUpdateButton.addEventListener('click', () => invoke(() => window.orderSpace.installUpdate()));
elements.clearLog.addEventListener('click', () => { logs = []; renderLog(); });

window.orderSpace.onStatus((status) => {
  lastStatus = { ...lastStatus, ...status };
  render();
});
window.orderSpace.onLog((entry) => {
  logs.unshift(entry);
  renderLog();
});
window.orderSpace.onUpdate((value) => {
  updateState = value;
  render();
});

window.orderSpace.bootstrap().then((state) => {
  appState = state;
  updateState = state.update;
  elements.apiUrl.value = state.apiUrl;
  render();
  renderLog();
}).catch((error) => {
  lastStatus = { error: error.message };
  render();
});
