# Диагностика мобильных приложений

Эта страница нужна, чтобы в `orderspace.ru` видеть состояние мобильных приложений: какие клиенты активны, есть ли ошибки, задержки API/socket, проблемы с OTA и как менялась нагрузка за последние дни.

Страница находится здесь:

```text
/config/mobile-diagnostics
```

Вход на страницу есть из `/config` и показывается только на orderspace-хостах.

На странице есть кнопка `Экспорт 7д`. Она скачивает JSON-файл с агрегированной диагностикой за последние 7 дней:

```text
GET /api/mobile-diagnostics/export?days=7&bucket=day
```

Этот файл удобнее давать на разбор целиком, чем копировать текущую таблицу со страницы. В нем есть `byApp`, `slowApiEndpoints`, дневная `history`, сравнение `compare` и последние проблемные `issues`.
Кнопка `Diag 5` скачивает тот же отчет, но только по событиям со свежей схемой:

```text
GET /api/mobile-diagnostics/export?days=7&bucket=day&minDiagVersion=5
```

## Общая схема

Есть два способа попадания метрик в панель.

1. Приложение orderspace отправляет метрики напрямую в свой backend:

```text
mobile app -> orderspace backend -> mobile_diagnostic_events
```

Endpoint:

```text
POST /api/mobile-diagnostics/metrics
```

Этот endpoint требует обычный JWT пользователя, как остальные мобильные API.

2. Другие приложения отправляют метрики в свой backend, а их backend пересылает копию в orderspace:

```text
client mobile app -> client backend -> orderspace backend -> mobile_diagnostic_events
```

Центральный endpoint на orderspace:

```text
POST https://orderspace.ru/api/mobile-diagnostics/ingest
```

Он не использует пользовательский JWT. Его защищает серверный секрет в заголовке:

```text
x-mobile-diagnostics-secret: <секрет>
```

Секрет нельзя зашивать в мобильное приложение. Он должен храниться только в env backend-серверов.

## Что добавлено в backend

Основной файл:

```text
crm-backend/routes/mobileDiagnosticsRoutes.js
```

Модель:

```text
crm-backend/models/MobileDiagnosticEvent.js
```

Миграция:

```text
crm-backend/migrations/20260701120000-create-mobile-diagnostic-events.js
```

Таблица:

```text
mobile_diagnostic_events
```

В ней хранятся события от мобильных приложений: heartbeat, metric, error, state.

## Env-переменные

На orderspace backend:

```env
MOBILE_DIAGNOSTICS_INGEST_SECRET=<длинный_секрет>
```

Эта переменная включает прием внешних метрик через `/mobile-diagnostics/ingest`.

На backend других клиентов:

```env
MOBILE_DIAGNOSTICS_INGEST_SECRET=<тот_же_секрет>
```

Можно не задавать URL, тогда используется значение по умолчанию:

```text
https://orderspace.ru/api/mobile-diagnostics/ingest
```

Если нужно переопределить центральный URL:

```env
MOBILE_DIAGNOSTICS_CENTRAL_INGEST_URL=https://orderspace.ru/api/mobile-diagnostics/ingest
```

Для мобильного приложения можно задать отображаемое имя клиента:

```env
MOBILE_DIAGNOSTICS_APP_KEY=buhfinance
```

Если переменная не задана, appKey берется из `slug` приложения.

## Что отправляет мобильное приложение

Файл в мобильном приложении:

```text
services/mobileDiagnostics.ts
```

Он отправляет:

- `heartbeat` примерно раз в 30 секунд, когда приложение активно;
- `metric` при медленном API;
- `error`, если API вернул 5xx;
- `state`, например при изменении socket-состояния.

Пример события:

```json
{
  "appKey": "orderspace",
  "eventType": "heartbeat",
  "severity": "info",
  "deviceId": "mob-...",
  "platform": "android",
  "runtimeVersion": "orderspace-1.0.0",
  "appVersion": "1.0.0",
  "deviceModel": "HONOR ALT-LX1",
  "osVersion": "14",
  "screen": "/home",
  "metrics": {
    "apiLatencyMs": 320,
    "jsLagMs": 4
  },
  "state": {
    "socketConnected": true,
    "isConnected": true,
    "isInternetReachable": true
  }
}
```

## Как читать страницу

### Верхние карточки

`Пользователи онлайн`

Показывает socket-подключения к текущему backend-процессу. Это не история, а состояние прямо сейчас.

`Мобильные клиенты`

Берется из папки OTA-обновлений. Показывает, какие `appKey/runtime` опубликованы на этом backend.

`Push`

Количество Expo push-токенов и UnifiedPush-подписок в базе.

`OTA за сессию бэка`

Показывает запросы OTA, которые backend видел с момента последнего перезапуска процесса. Это in-memory счетчик, после рестарта обнуляется.

### Метрики приложения

`Diag`

Версия диагностической схемы, которую прислало мобильное приложение. `3` означает, что приложение уже отправляет server-duration и in-flight поля. `4` означает, что в приложении включен лимитер параллельных безопасных API-запросов и отправляется время ожидания очереди. `5` означает, что дополнительно исправлен `maxInFlight`: старый пик больше не прилипает после завершения пачки запросов. `6` добавляет сетевой контекст устройства: тип сети, состояние приложения, доступность интернета, дорогая сеть, поколение cellular и carrier. Если там `-`, `1` или `2`, устройство еще работает на старом JS/билде или не перезапустило приложение после OTA.

`Активные устройства`

Уникальные `deviceId`, от которых пришли события за последние 5 минут.

`API latency`

Средняя задержка API по событиям за последний час. `p95` означает, что 95% запросов были быстрее этого значения.
В проблемных событиях медленные запросы пишутся с методом и путем, например `slow-api:GET /orders 3579ms`.

`Socket reconnect`

Средняя длительность разрыва socket-соединения до переподключения. Это не ping websocket, а время между `socket-disconnected` и следующим `socket-connected`.
Считается только по событиям `socket-connected`, чтобы обычные heartbeat-события не раздували среднее значение.

`Проблемы за час`

Сумма warning и critical событий за последний час.

### Самые медленные API

Показывает группировку медленных API-событий за последний час по `method + path`.
В этот блок попадают только события `metric/error` с конкретным endpoint, heartbeat не учитывается.
Колонки `Client avg/p95` показывают полное время запроса на мобильном устройстве.
Колонки `Server avg/p95` показывают длительность backend handler из response header `x-api-duration-ms`; они заполняются только для новых мобильных событий после обновления backend и OTA.
Если мобильное событие еще не содержит header-метрику, страница пробует сопоставить endpoint с блоком `Медленные backend handlers`; тогда `Server source` будет `backend-session`.
Если значение пришло прямо из мобильного события, `Server source` будет `mobile-header`.
`Server samples` показывает, по скольким событиям реально есть server-измерение.
`Overhead avg` показывает среднюю разницу `client total - server handler` для событий, где есть обе цифры.
`In-flight avg/max` показывает, сколько API-запросов одновременно было активно в мобильном приложении, когда начался медленный запрос.
Если `Overhead avg` высокий и `In-flight max` большой, вероятна очередь/залп параллельных запросов на клиенте.
`Queue avg` показывает, сколько запрос в среднем ждал клиентского лимитера перед отправкой в сеть. После включения лимитера `In-flight max` должен стать около 8; если при этом `Queue avg` большой, значит экран все еще создает слишком много запросов, но они уже идут контролируемой очередью.
`Network` показывает тип сети в медленных событиях: `wifi`, `cellular`, `none` или `unknown`.
`App state` показывает, было ли приложение `active`, `background` или `inactive` во время события.
`Net flags` показывает сетевые признаки проблемы: `offline` (`isConnected=false`), `no-internet` (`isInternetReachable=false`), `expensive` (`isConnectionExpensive=true`). Эти поля помогают отличать backend-тормоза от плохой сети, VPN, слабого cellular или фонового состояния приложения.
Если client сильно больше server, значит часть задержки появляется вне handler: сеть, прокси, очередь запросов или клиентское соединение.
Если client и server близки, значит проблема в backend/DB.

Для анализа за неделю лучше использовать экспорт. В экспортном файле `slowApiEndpoints` считается за весь выбранный период, а не только за последний час.

После диагностики недельного экспорта push-регистрация в мобильном приложении вынесена из горячего старта: `AuthContext` больше не ждет push перед завершением initial auth, а планирует регистрацию с задержкой. Это снижает конкуренцию `/push/register` и `/push/unified/register` с первичной загрузкой `/app/rooms`, `/chat-summary` и внешних чатов.

### Медленные backend handlers

Показывает медленные `/api` запросы, которые измерил сам backend.
Это in-memory статистика текущего backend-процесса, после рестарта она обнуляется.
Колонка `Источник` группирует запросы по user-agent: `mobile`, `web`, `other` или `unknown`.
Колонка `User-Agent` показывает самый частый user-agent для endpoint.
Порог по умолчанию - `1200ms`, его можно поменять через env:

```env
API_PERFORMANCE_SLOW_THRESHOLD_MS=1200
```

Если мобильная таблица показывает `GET /app/rooms = 4000ms`, и backend handlers тоже показывают около `4000ms`, значит проблема почти наверняка в backend/DB.
Если backend показывает быстро, а мобильное приложение медленно, тогда вероятнее сеть, прокси, очередь запросов на клиенте или TLS/соединение.

### Прием метрик

Этот блок показывает здоровье самой системы диагностики.

`Попытки`

Сколько событий пытались записаться в текущей сессии backend-процесса.

`Принято`

Сколько событий успешно записано.

`Ошибки`

Сколько событий не удалось записать.

`Таблица`

Показывает, что backend проверил/создал таблицу `mobile_diagnostic_events`.

`Relay попытки`

Сколько раз клиентский backend пытался переслать метрику в central orderspace.

`Relay принято центром`

Сколько пересылок завершилось успешно.

`Relay ошибка`

Последняя ошибка server-to-server пересылки.

На самом orderspace relay обычно будет `0`, потому что orderspace не пересылает сам себе. Эти счетчики важнее на backend других клиентов.

### Предупреждения

Здесь появляются важные сигналы:

- ошибки OTA;
- старые push-токены;
- ошибки мобильных клиентов;
- высокая средняя задержка API.

### История за 7 дней

Это уже не in-memory данные, а события из таблицы `mobile_diagnostic_events`.

График показывает:

- устройства;
- ошибки;
- среднюю задержку API.

Справа блок `Сегодня / вчера`, чтобы быстро увидеть, стало ли хуже или лучше:

- события;
- устройства;
- ошибки;
- API avg.

### Метрики по приложениям

Таблица по `appKey`:

- сколько активных устройств за 5 минут;
- сколько событий за час;
- API avg;
- API p95;
- FPS, если приложение начнет его отправлять;
- память, если приложение начнет ее отправлять;
- ошибки за час.

### Последние проблемы приложения

Последние события уровня `warning` и `critical`.

Обычно сюда попадают:

- медленный API;
- 5xx от backend;
- socket-disconnect;
- ошибки, которые приложение явно отправило.

### Последние OTA-запросы

Это запросы к `/api/mobile-updates/...`.

Важно: этот блок хранится в памяти backend-процесса. После перезапуска он очищается.

## Как подключить новый клиентский backend

1. На orderspace backend должен быть задан:

```env
MOBILE_DIAGNOSTICS_INGEST_SECRET=<секрет>
```

2. На backend клиента задать тот же секрет:

```env
MOBILE_DIAGNOSTICS_INGEST_SECRET=<секрет>
```

3. Если central URL отличается:

```env
MOBILE_DIAGNOSTICS_CENTRAL_INGEST_URL=https://orderspace.ru/api/mobile-diagnostics/ingest
```

4. Перезапустить backend с обновлением env:

```bash
pm2 restart all --update-env
```

5. В мобильном приложении задать понятный appKey:

```env
MOBILE_DIAGNOSTICS_APP_KEY=source
```

или:

```env
MOBILE_DIAGNOSTICS_APP_KEY=buhfinance
```

6. Выпустить OTA/build, чтобы мобильное приложение начало слать события с новым appKey.

## Как проверить, что все работает

### На orderspace

Открыть:

```text
/config/mobile-diagnostics
```

Нажать:

```text
Проверить backend
```

Должно быть:

```text
GET https://orderspace.ru/api/mobile-diagnostics/summary -> 200
```

Вверху также должно быть:

```text
внешний ingest: включен
```

Если `выключен`, значит на orderspace backend не задан `MOBILE_DIAGNOSTICS_INGEST_SECRET` или backend не перезапущен с `--update-env`.

### В логах backend

При запуске backend:

```text
[mobile-diagnostics] route loaded
```

При открытии страницы:

```text
[mobile-diagnostics] summary ok
```

При приеме метрики:

```text
[mobile-diagnostics] metrics accepted
```

При внешнем приеме от другого backend:

```text
[mobile-diagnostics] metrics accepted { source: 'external', ... }
```

При пересылке с клиентского backend в orderspace:

```text
[mobile-diagnostics] central relay ok
```

Если пересылка не работает:

```text
[mobile-diagnostics] central relay failed
```

## Частые проблемы

### На странице пусто

Проверь:

1. Мобильное приложение действительно обновлено OTA/build.
2. Пользователь авторизован.
3. Backend перезапущен.
4. Есть строка `[mobile-diagnostics] metrics accepted` в логах backend.

### `внешний ingest: выключен`

На orderspace backend не задан:

```env
MOBILE_DIAGNOSTICS_INGEST_SECRET
```

или backend не перезапущен через:

```bash
pm2 restart all --update-env
```

### `Relay ошибка: invalid_ingest_secret`

Секрет на клиентском backend не совпадает с секретом на orderspace.

### Клиентские приложения не появляются в orderspace

Проверь на клиентском backend:

1. Есть `MOBILE_DIAGNOSTICS_INGEST_SECRET`.
2. Есть интернет-доступ до `https://orderspace.ru/api/mobile-diagnostics/ingest`.
3. В логах есть `central relay ok`.
4. В мобильном приложении задан понятный `MOBILE_DIAGNOSTICS_APP_KEY`.

### AppKey выглядит странно

Если не задан `MOBILE_DIAGNOSTICS_APP_KEY`, берется `slug` из `app.config.js`.

Лучше явно задавать:

```env
MOBILE_DIAGNOSTICS_APP_KEY=orderspace
MOBILE_DIAGNOSTICS_APP_KEY=source
MOBILE_DIAGNOSTICS_APP_KEY=buhfinance
```

## Что пока не измеряется точно

Сейчас система хорошо собирает:

- heartbeat;
- API latency;
- HTTP 5xx;
- socket state;
- JS lag;
- модель устройства;
- OS;
- экран;
- network state.

FPS и память уже есть в структуре панели, но мобильное приложение пока не отправляет настоящие значения FPS/памяти. Для этого нужен отдельный сборщик на стороне React Native.

## Короткая памятка

Orderspace видит все приложения только если:

```text
mobile app -> свой backend -> orderspace ingest
```

Секрет хранится только на backend.

Мобильные приложения не должны содержать `MOBILE_DIAGNOSTICS_INGEST_SECRET`.
