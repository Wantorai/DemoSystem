# Антивирус FileSpace

FileSpace отправляет новые S3-объекты в карантин и открывает доступ только после ответа ClamAV `OK`.

## ClamAV на Ubuntu/Debian

```bash
sudo apt update
sudo apt install clamav clamav-daemon
sudo freshclam
```

В `/etc/clamav/clamd.conf` должны быть включены локальный TCP-порт и проверка архивов:

```text
TCPSocket 3310
TCPAddr 127.0.0.1
ScanArchive yes
MaxRecursion 16
MaxFiles 10000
MaxThreads 2
MaxFileSize 100M
MaxScanSize 300M
StreamMaxLength 100M
EnableReloadCommand true
```

В Ubuntu 24.04 сокет создаёт `systemd`, поэтому дополнительно нужен
`/etc/systemd/system/clamav-daemon.socket.d/override.conf`:

```ini
[Socket]
ListenStream=127.0.0.1:3310
```

После изменения конфигурации:

```bash
sudo systemctl daemon-reload
sudo systemctl enable clamav-freshclam clamav-daemon
sudo systemctl restart clamav-freshclam clamav-daemon.socket clamav-daemon
sudo systemctl status clamav-daemon
sudo ss -ltnp | grep 3310
```

Порт 3310 нельзя открывать в интернет: backend подключается к нему через `127.0.0.1`.

## Переменные backend

```env
FILESPACE_ANTIVIRUS_ENABLED=true
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
CLAMAV_TIMEOUT_MS=120000
FILESPACE_AV_MAX_FILE_SIZE=104857600
FILESPACE_AV_MAX_ATTEMPTS=3
FILESPACE_AV_WORKER_MS=15000
FILESPACE_AV_WORKER_LIMIT=2
FILESPACE_AV_BACKFILL_SKIPPED=false
FILESPACE_BLOCKED_EXTENSIONS=exe,bat,cmd,com,scr,msi,ps1,vbs,js,jar
```

`FILESPACE_AV_MAX_FILE_SIZE` не должен превышать `StreamMaxLength` ClamAV. При необходимости список запрещённых расширений можно изменить, но пустое значение вернёт безопасный список по умолчанию.

Сначала включите антивирус с `FILESPACE_AV_BACKFILL_SKIPPED=false`: новые файлы
будут помещаться в карантин и проверяться, а ранее загруженные останутся
доступны. После проверки новых загрузок установите
`FILESPACE_AV_BACKFILL_SKIPPED=true`. В этом режиме старые файлы и их версии
проверяются постепенно в пределах `FILESPACE_AV_WORKER_LIMIT`; одновременно
недоступны только элементы текущей порции. Старые объекты крупнее
`FILESPACE_AV_MAX_FILE_SIZE` автоматически не блокируются и остаются со
статусом `skipped`.

После установки ClamAV следует применить миграцию `20260722110000-add-filespace-antivirus.js`, обновить backend и только затем принимать новые загрузки.
