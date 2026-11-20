# Полный указатель страниц

В каталоге 73 маршрутов, соответствующих файлам `page.js` в `crm-fronend/src/app`. Динамический маршрут учитывается один раз независимо от числа записей. Для каждого маршрута есть отдельное описание в указанной главе. Имя раздела в таблице совпадает с заголовком карточки, по которому её можно найти в документе.

| Адрес | Страница и глава описания | Исходник |
| --- | --- | --- |
| `/` | [Стартовая страница и установка приложений](01-entry.md) | [page.js](../../crm-fronend/src/app/page.js) |
| `/403` | [Доступ запрещён](01-entry.md) | [page.js](../../crm-fronend/src/app/403/page.js) |
| `/admin` | [Резервные копии базы данных](05-administration.md) | [page.js](../../crm-fronend/src/app/admin/page.js) |
| `/admin/addons` | [Список надстроек](05-administration.md) | [page.js](../../crm-fronend/src/app/admin/addons/page.js) |
| `/admin/addons/[addonId]` | [Просмотр надстройки](05-administration.md) | [page.js](../../crm-fronend/src/app/admin/addons/[addonId]/page.js) |
| `/admin/addons/[addonId]/configurations/edit` | [Параметры надстройки](05-administration.md) | [page.js](../../crm-fronend/src/app/admin/addons/[addonId]/configurations/edit/page.js) |
| `/admin/addons/[addonId]/edit` | [Редактирование надстройки](05-administration.md) | [page.js](../../crm-fronend/src/app/admin/addons/[addonId]/edit/page.js) |
| `/admin/addons/create` | [Создание надстройки](05-administration.md) | [page.js](../../crm-fronend/src/app/admin/addons/create/page.js) |
| `/admin/allConfigs` | [Подписи и оформление ссылок конфигурации](05-administration.md) | [page.js](../../crm-fronend/src/app/admin/allConfigs/page.js) |
| `/admin/permissionParams` | [Доступ к параметрам](05-administration.md) | [page.js](../../crm-fronend/src/app/admin/permissionParams/page.js) |
| `/admin/permissions` | [Доступ к страницам](05-administration.md) | [page.js](../../crm-fronend/src/app/admin/permissions/page.js) |
| `/admin/roles` | [Роли](05-administration.md) | [page.js](../../crm-fronend/src/app/admin/roles/page.js) |
| `/admin/rooms` | [Управление чатами](05-administration.md) | [page.js](../../crm-fronend/src/app/admin/rooms/page.js) |
| `/admin/support-tickets` | [Тикеты поддержки](05-administration.md) | [page.js](../../crm-fronend/src/app/admin/support-tickets/page.js) |
| `/admin/templates` | [Резервные копии шаблонов](05-administration.md) | [page.js](../../crm-fronend/src/app/admin/templates/page.js) |
| `/admin/updates` | [Обновления системы](05-administration.md) | [page.js](../../crm-fronend/src/app/admin/updates/page.js) |
| `/admin/users` | [Пользователи](05-administration.md) | [page.js](../../crm-fronend/src/app/admin/users/page.js) |
| `/client/[id]` | [Карточка клиента](02-workflow.md) | [page.js](../../crm-fronend/src/app/client/[id]/page.js) |
| `/clients` | [Клиенты](02-workflow.md) | [page.js](../../crm-fronend/src/app/clients/page.js) |
| `/clients/add` | [Добавление клиента](02-workflow.md) | [page.js](../../crm-fronend/src/app/clients/add/page.js) |
| `/config` | [Каталог конфигураций](04-settings.md) | [page.js](../../crm-fronend/src/app/config/page.js) |
| `/config/3dscenes` | [3D проекты](03-collaboration.md) | [page.js](../../crm-fronend/src/app/config/3dscenes/page.js) |
| `/config/crmConfig` | [Поля CRM](04-settings.md) | [page.js](../../crm-fronend/src/app/config/crmConfig/page.js) |
| `/config/crmStatuses` | [Статусы CRM](04-settings.md) | [page.js](../../crm-fronend/src/app/config/crmStatuses/page.js) |
| `/config/dashbord` | [Настройка отчётов](04-settings.md) | [page.js](../../crm-fronend/src/app/config/dashbord/page.js) |
| `/config/event-config` | [Содержимое события графика](04-settings.md) | [page.js](../../crm-fronend/src/app/config/event-config/page.js) |
| `/config/eventInfos` | [Дополнительная информация события](04-settings.md) | [page.js](../../crm-fronend/src/app/config/eventInfos/page.js) |
| `/config/FasadVendors` | [Поставщики фасадов](04-settings.md) | [page.js](../../crm-fronend/src/app/config/FasadVendors/page.js) |
| `/config/Fields` | [Справочник Fields](04-settings.md) | [page.js](../../crm-fronend/src/app/config/Fields/page.js) |
| `/config/FurnVendors` | [Поставщики фурнитуры](04-settings.md) | [page.js](../../crm-fronend/src/app/config/FurnVendors/page.js) |
| `/config/Holidays` | [Рабочие и выходные дни](04-settings.md) | [page.js](../../crm-fronend/src/app/config/Holidays/page.js) |
| `/config/InfoSources` | [Источники обращений](04-settings.md) | [page.js](../../crm-fronend/src/app/config/InfoSources/page.js) |
| `/config/Installers` | [Установщики](04-settings.md) | [page.js](../../crm-fronend/src/app/config/Installers/page.js) |
| `/config/MainModel` | [Основная модель заказа](04-settings.md) | [page.js](../../crm-fronend/src/app/config/MainModel/page.js) |
| `/config/Managers` | [Менеджеры](04-settings.md) | [page.js](../../crm-fronend/src/app/config/Managers/page.js) |
| `/config/mobile-diagnostics` | [Диагностика мобильных приложений](05-administration.md) | [page.js](../../crm-fronend/src/app/config/mobile-diagnostics/page.js) |
| `/config/OrderStatuss` | [Статусы заказов](04-settings.md) | [page.js](../../crm-fronend/src/app/config/OrderStatuss/page.js) |
| `/config/Paylists` | [Типы оплаты](04-settings.md) | [page.js](../../crm-fronend/src/app/config/Paylists/page.js) |
| `/config/Schedule` | [Источники данных графика](04-settings.md) | [page.js](../../crm-fronend/src/app/config/Schedule/page.js) |
| `/config/security-diagnostics` | [Диагностика безопасности](05-administration.md) | [page.js](../../crm-fronend/src/app/config/security-diagnostics/page.js) |
| `/config/social-deploy` | [Social Deploy](03-collaboration.md) | [page.js](../../crm-fronend/src/app/config/social-deploy/page.js) |
| `/config/StatusColors` | [Цвета состояний](04-settings.md) | [page.js](../../crm-fronend/src/app/config/StatusColors/page.js) |
| `/config/Styles` | [Оформление и планировщик задач](04-settings.md) | [page.js](../../crm-fronend/src/app/config/Styles/page.js) |
| `/config/Technics` | [Технологи](04-settings.md) | [page.js](../../crm-fronend/src/app/config/Technics/page.js) |
| `/config/WorkVendors` | [Подрядчики](04-settings.md) | [page.js](../../crm-fronend/src/app/config/WorkVendors/page.js) |
| `/consult/[id]` | [Карточка консультации](02-workflow.md) | [page.js](../../crm-fronend/src/app/consult/[id]/page.js) |
| `/crm` | [CRM и список консультаций](02-workflow.md) | [page.js](../../crm-fronend/src/app/crm/page.js) |
| `/crm/add` | [Создание консультации](02-workflow.md) | [page.js](../../crm-fronend/src/app/crm/add/page.js) |
| `/crm/calendar` | [Общий календарь технологов](02-workflow.md) | [page.js](../../crm-fronend/src/app/crm/calendar/page.js) |
| `/crm/calendar/[id]` | [Календарь отдельного технолога](02-workflow.md) | [page.js](../../crm-fronend/src/app/crm/calendar/[id]/page.js) |
| `/dashbord` | [Дашборд отчётов](02-workflow.md) | [page.js](../../crm-fronend/src/app/dashbord/page.js) |
| `/details` | [Заказные позиции](02-workflow.md) | [page.js](../../crm-fronend/src/app/details/page.js) |
| `/fasadVendor/[id]` | [Карточка поставщика фасадов](04-settings.md) | [page.js](../../crm-fronend/src/app/fasadVendor/[id]/page.js) |
| `/field/[id]` | [Карточка значения Fields](04-settings.md) | [page.js](../../crm-fronend/src/app/field/[id]/page.js) |
| `/filespace` | [Файловое пространство](03-collaboration.md) | [page.js](../../crm-fronend/src/app/filespace/page.js) |
| `/furnVendor/[id]` | [Карточка поставщика фурнитуры](04-settings.md) | [page.js](../../crm-fronend/src/app/furnVendor/[id]/page.js) |
| `/infoSource/[id]` | [Карточка источника обращения](04-settings.md) | [page.js](../../crm-fronend/src/app/infoSource/[id]/page.js) |
| `/login` | [Страница авторизации](01-entry.md) | [page.js](../../crm-fronend/src/app/login/page.js) |
| `/main` | [График установок](02-workflow.md) | [page.js](../../crm-fronend/src/app/main/page.js) |
| `/order/[id]` | [Карточка заказа](02-workflow.md) | [page.js](../../crm-fronend/src/app/order/[id]/page.js) |
| `/orderConfig/[id]` | [Карточка объекта конфигурации](02-workflow.md) | [page.js](../../crm-fronend/src/app/orderConfig/[id]/page.js) |
| `/orderConfigs` | [Объекты конфигурации заказов](02-workflow.md) | [page.js](../../crm-fronend/src/app/orderConfigs/page.js) |
| `/orderConfigs/add` | [Добавление объекта конфигурации](02-workflow.md) | [page.js](../../crm-fronend/src/app/orderConfigs/add/page.js) |
| `/orders` | [Список заказов](02-workflow.md) | [page.js](../../crm-fronend/src/app/orders/page.js) |
| `/orders/add` | [Добавление заказа](02-workflow.md) | [page.js](../../crm-fronend/src/app/orders/add/page.js) |
| `/paylist/[id]` | [Карточка типа оплаты](04-settings.md) | [page.js](../../crm-fronend/src/app/paylist/[id]/page.js) |
| `/readys` | [Готовность](02-workflow.md) | [page.js](../../crm-fronend/src/app/readys/page.js) |
| `/webchats` | [Список веб-чатов](03-collaboration.md) | [page.js](../../crm-fronend/src/app/webchats/page.js) |
| `/webchats/[kind]/[id]` | [Внутренний чат](03-collaboration.md) | [page.js](../../crm-fronend/src/app/webchats/[kind]/[id]/page.js) |
| `/webchats/alerts` | [Оповещения](03-collaboration.md) | [page.js](../../crm-fronend/src/app/webchats/alerts/page.js) |
| `/webchats/max/[id]` | [Переписка MAX](03-collaboration.md) | [page.js](../../crm-fronend/src/app/webchats/max/[id]/page.js) |
| `/webchats/telegram/[id]` | [Переписка Telegram](03-collaboration.md) | [page.js](../../crm-fronend/src/app/webchats/telegram/[id]/page.js) |
| `/workVendor/[id]` | [Карточка подрядчика](04-settings.md) | [page.js](../../crm-fronend/src/app/workVendor/[id]/page.js) |

Файл `privacy-policy/_page.js` не включён в число маршрутов. Его статус описан в [главе о входе](01-entry.md). Общая оболочка и Windows-клиент также описаны отдельно, поскольку это не самостоятельные маршруты `page.js`.
