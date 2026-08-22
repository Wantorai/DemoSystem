// Исключаем локальную среду из кода
if (process.env.IS_SERVER !== 'true') {
  // Возвращаем заглушки
  module.exports = {
    getCallsByPhone: (req, res) => res.status(503).send('Tele2 API отключен в локальной среде'),
    getRecordMpeg: (req, res) => res.status(503).send('Tele2 API отключен в локальной среде'),
  };
} else {

    const Tele2Api = require('./Tele2Api');
    const TelegramBot = require('node-telegram-bot-api');
    const { Employee, Technic, InfoSource, Record, CRMConfig } = require('./models'); 
    const { parse, format, isValid, addHours  } = require('date-fns');
    const Calendar = require('telegram-inline-calendar');
    require('dotenv').config();
    const { scheduleReminderJob } = require('./reminderScheduler');
    const axios = require('axios');
    const { Op } = require('sequelize');

    // Токены и идентификаторы

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_TOKEN;
    const GROUP_CHAT_ID = process.env.GROUP_CHAT;
    const REGISTRATION_PASSWORD = process.env.REG_PASSWORD;

    var savedForms = new Map();
    var initialMessageIds = new Map();
    var calendarCallMap = new Map(); // chatId -> callId

    const globalFormCallbacks = new Map();// Для хранения функций продолжения опроса формы по chatId
    let formStepsMap = new Map(); // key: chatId, value: { currentStepIndex, formData, askNextQuestion }
    let formChangeSession = new Map(); // chatId => { formId, field }

    var externalCalls = new Map();     // uuid → запись
    var externalCallsDay = new Map();
    var externalCallsAll = new Map();
    var tele2Api;

    // ========== ДОБАВЛЯЕМ ОБЪЕКТ ДЛЯ ХРАНЕНИЯ СОСТОЯНИЯ ФОРМ ==========
    const userFormStates = new Map(); // userId -> { active: boolean, step: string, data: any, timestamp: number }

    // Проверка доступности сайта
    async function isSiteAvailable() {
      try {
        const response = await axios.get('https://orderspace.ru/', {
          validateStatus: () => true, // важно: не выбрасывать ошибку при 503
        });
        return response.status !== 503;
      } catch (err) {
        return false; // если сайт вообще не отвечает
      }
    }


    // // Добавим новый домен РАБОТАЕТ КРИВО !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    // async function isSiteAvailable() {
    //   const sites = [
    //     'https://order-space.ru/',
    //     'https://orderspace.ru/'
    //   ];

    //   for (const url of sites) {
    //     try {
    //       const res = await axios.get(url, { validateStatus: () => true });
    //       if (res.status !== 503) return true;   // Если сайт отвечает — успех
    //       // If site responds — success
    //     } catch(e) {
    //       // Ошибка просто значит, что переходим к следующему
    //       // Error means we move to the next one
    //     }
    //   }

    //   return false; // Если оба сайта недоступны
    //   // If both sites are unavailable
    // }



    // Логика
    function tele2() {  
      // Создаем экземпляр Tele2Api с пустыми токенами, поскольку они будут загружены из БД
      tele2Api = new Tele2Api('', '');
      

      // Инициализируем Tele2Api (асинхронная загрузка токенов из БД)
      tele2Api.init()
      .then(async () => {
        // console.log('Tele2Api инициализирован успешно.');
        const { setBot: setReminderBot, initScheduledReminders } = require('./reminderScheduler');
        const { setBot: setGlobalBot } = require('./bot');


        const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

        // Устанавливаем бот в двух модулях
        setReminderBot(bot);   // для напоминаний
        setGlobalBot(bot);     // для глобального доступа в других частях системы

        // 2) Сразу загружаем и планируем все существующие напоминания:
        initScheduledReminders().catch(console.error);


        // Вызов меню
        await bot.setMyCommands([
          { command: 'create_request', description: '📋 Создать заявку по номеру' },
          { command: 'save_record', description: '🧰 Сохранить разговор с номером' },
          { command: 'start', description: '⚠️ Регистрация сотрудника' },
          // { command: 'stop', description: '⛔ Сбросить форму' },
        ]);

        const EMPLOYEE_REFRESH_INTERVAL = 1000 * 60 * 30; // 30 минут время обновления проверки новых сотрудников

        let phoneToEmployeeMap = {};

        const calendar = new Calendar(bot, {
          date_format: 'DD-MM-YYYY',
          language: 'ru'
        });



        // 3) Регистрация бота
        bot.onText(/\/start(?:\s(.*))?/, async (msg, match) => {
          const chatId = msg.chat.id;
          const input = match[1]?.trim();

          const available = await isSiteAvailable();
          if (!available) {
            return bot.sendMessage(chatId, '🚧 Сайт сейчас на обслуживании. Попробуйте позже.');
          }
        
          if (!input) {
            bot.sendMessage(chatId, '📱 Пожалуйста, введите ваш номер и пароль: /start номер пароль');
            return;
          }
        
          const [fullNumber, password] = input.split(/\s+/);
        
          if (!fullNumber || !password) {
            bot.sendMessage(chatId, '⚠️ Введите номер и пароль через пробел: /start номер пароль');
            return;
          }
        
          if (password !== REGISTRATION_PASSWORD) {
            bot.sendMessage(chatId, '⛔️ Неверный пароль. Доступ запрещён.');
            return;
          }

          try {
            let employee = await Employee.findOne({ where: { fullNumber } });
        
            if (!employee) {
              employee = await Employee.create({
                fullNumber,
                telegramId: chatId,
                employeeId: null,
              });
              bot.sendMessage(chatId, '✅ Вы зарегистрированы как новый сотрудник!');

            } else {
              await employee.update({ telegramId: chatId });
              await bot.sendMessage(chatId, '✅ Вы успешно авторизованы.');         
            }
          } catch (err) {
            console.error('Ошибка регистрации:', err);
            bot.sendMessage(chatId, 'Произошла ошибка. Попробуйте позже.');
          }
        });


        // 1) Создать заявку по номеру
        bot.onText(/\/create_request/, async (msg) => {
          const chatId = msg.chat.id;
          const userId = msg.from.id;

          const available = await isSiteAvailable();
         // console.log('available = ', available)

          if (!available) {
            return bot.sendMessage(chatId, '🚧 Сайт сейчас на обслуживании. Попробуйте позже.');
          }
        
          bot.sendMessage(chatId, 'Введите номер клиента:');
        
          bot.once('message', async (msg2) => {
            const enteredPhone = normalizePhone(msg2.text);
            const employee = await Employee.findOne({ where: { telegramId: userId } });
        
            if (!employee) {
              return bot.sendMessage(chatId, '⚠️ Вы не зарегистрированы как сотрудник.');
            }

            if (!enteredPhone) {
              bot.sendMessage(chatId, '⚠️ Неверный номер телефона.');
              return;
            }
            
            // Получаем записи за последние 24 часа
            await pollCallRecordsDay();

            // Ищем подходящую запись
            const matchedRecord = Array.from(externalCallsDay.values())
            .reverse() // Чтобы взять последнюю по времени
            .find(call =>
              call.callerNumber?.includes(enteredPhone) || call.calleeNumber?.includes(enteredPhone)
            );
        
            if (!matchedRecord) {
              bot.sendMessage(chatId, '⚠️ Не найдено записей с этим номером.');
              bot.sendMessage(chatId, '📋 Формируем создание заявки');
            // console.log("Создаем заявку без АТС", employee , enteredPhone)
              sendFormToOperatorNewClient(employee, enteredPhone)

            } else {

              // console.log('📥 Обрабатываем запись:', matchedRecord);
              sendFormToOperator(employee, matchedRecord);
              await bot.sendMessage(chatId, 'Ожидайте данные.');
              
            }
          });
        });


        // // ========== МОДИФИЦИРУЕМ ОБРАБОТЧИК /create_request ==========
        // bot.onText(/\/create_request/, async (msg) => {
        //   const chatId = msg.chat.id;
        //   const userId = msg.from.id;

        //   const available = await isSiteAvailable();
        //   if (!available) {
        //     return bot.sendMessage(chatId, '🚧 Сайт сейчас на обслуживании. Попробуйте позже.');
        //   }

        //   // Проверяем, есть ли активная форма у пользователя
        //   const userState = userFormStates.get(userId);
        //   if (userState && userState.active) {
        //     return bot.sendMessage(chatId, 
        //       `⚠️ *У вас уже есть активная форма!*\n\n` +
        //       `Текущий шаг: ${userState.step}\n` +
        //       `Начато: ${format(new Date(userState.timestamp), 'HH:mm')}\n\n` +
        //       `Чтобы начать новую форму:\n` +
        //       `1. Завершите текущую\n` +
        //       `2. Или сбросьте через /stop`,
        //       { parse_mode: 'Markdown' }
        //     );
        //   }

        //   // Устанавливаем новое состояние
        //   userFormStates.set(userId, {
        //     active: true,
        //     step: 'awaiting_phone',
        //     timestamp: Date.now(),
        //     data: {}
        //   });

        //   bot.sendMessage(chatId, '📱 Введите номер клиента:');

        //   // Используем once, чтобы не накапливать обработчики
        //   bot.once('message', async (msg2) => {
        //     // Проверяем, не была ли форма сброшена во время ожидания
        //     const currentState = userFormStates.get(userId);
        //     if (!currentState || !currentState.active) {
        //       return bot.sendMessage(chatId, '❌ Форма была сброшена. Начните заново с /create_request');
        //     }

        //     const enteredPhone = normalizePhone(msg2.text);
        //     const employee = await Employee.findOne({ where: { telegramId: userId } });

        //     if (!employee) {
        //       userFormStates.delete(userId); // Очищаем состояние
        //       return bot.sendMessage(chatId, '⚠️ Вы не зарегистрированы как сотрудник.');
        //     }

        //     if (!enteredPhone) {
        //       userFormStates.delete(userId); // Очищаем состояние
        //       return bot.sendMessage(chatId, '⚠️ Неверный номер телефона.');
        //     }

        //     // Обновляем состояние
        //     userFormStates.set(userId, {
        //       ...currentState,
        //       step: 'processing_phone',
        //       data: { ...currentState.data, phone: enteredPhone }
        //     });

        //     // Получаем записи за последние 24 часа
        //     await pollCallRecordsDay();

        //     // Ищем подходящую запись
        //     const matchedRecord = Array.from(externalCallsDay.values())
        //       .reverse()
        //       .find(call =>
        //         call.callerNumber?.includes(enteredPhone) || call.calleeNumber?.includes(enteredPhone)
        //       );

        //     if (!matchedRecord) {
        //       // Обновляем состояние
        //       userFormStates.set(userId, {
        //         ...userFormStates.get(userId),
        //         step: 'creating_new_client'
        //       });

        //       bot.sendMessage(chatId, '⚠️ Не найдено записей с этим номером.');
        //       bot.sendMessage(chatId, '📋 Формируем создание заявки');

        //       // Отправляем форму оператору
        //       sendFormToOperatorNewClient(employee, enteredPhone);
              
        //       // Очищаем состояние после отправки формы
        //       userFormStates.delete(userId);
        //     } else {
        //       // Обновляем состояние
        //       userFormStates.set(userId, {
        //         ...userFormStates.get(userId),
        //         step: 'found_record_processing'
        //       });

        //       bot.sendMessage(chatId, '✅ Найдена запись разговора. Обрабатываю...');
              
        //       // Отправляем форму оператору
        //       sendFormToOperator(employee, matchedRecord);
              
        //       // Очищаем состояние после отправки формы
        //       userFormStates.delete(userId);
              
        //       await bot.sendMessage(chatId, '✅ Данные отправлены оператору.');
        //     }
        //   });
        // });


        // 2) Сохранить разговор с номером
        bot.onText(/\/save_record/, async (msg) => {
          const chatId = msg.chat.id;

          const available = await isSiteAvailable();
          if (!available) {
            return bot.sendMessage(chatId, '🚧 Сайт сейчас на обслуживании. Попробуйте позже.');
          }

          bot.sendMessage(chatId, 'Введите номер клиента:');
          bot.once('message', async (msg2) => {
            const enteredPhone = normalizePhone(msg2.text);
        
            if (!enteredPhone) {
              bot.sendMessage(chatId, '⚠️ Неверный номер телефона.');
              return;
            } else {
              bot.sendMessage(chatId, '⚠️ Ожидайте запись разговора...');
            }



            // Получаем записи за последние 24 часа
            await pollCallRecordsDay();

            // console.log('externalCallsDay = ', externalCallsDay);
            // console.log('enteredPhone = ', enteredPhone);
        
            // Ищем подходящую запись (можно latest или first)
            const matchedRecord = Array.from(externalCallsDay.values())
              .reverse() // Чтобы взять последнюю по времени
              .find(call =>
                call.callerNumber?.includes(enteredPhone) || call.calleeNumber?.includes(enteredPhone)
              );


        
            if (!matchedRecord) {
              bot.sendMessage(chatId, '⚠️ Не найдено записей с этим номером.');
              return;
            }
        
            const textMsg = `
        📞 Найдена запись:
        📅 ${format(addHours(new Date(matchedRecord.date), 7), 'dd.MM.yyyy HH:mm')}
        👤 Номер: ${matchedRecord.callerNumber} → ${matchedRecord.calleeNumber}
        ⏱️ Длительность: ${matchedRecord.callDuration || 0} сек.
        `.trim();
        
            bot.sendMessage(chatId, textMsg, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '▶️ Загрузить запись', callback_data: `download:${matchedRecord.uuid}` },
                    { text: '❌ Отмена', callback_data: `cancel:${matchedRecord.uuid}` }
                  ]
                ]
              }
            });
          });
        });


        bot.onText(/\/hide/, (msg) => {
          bot.sendMessage(msg.chat.id, 'Клавиатура скрыта ✅', {
            reply_markup: {
              remove_keyboard: true
            }
          });
        });


        // // ========== КОМАНДА /stop ДЛЯ СБРОСА ФОРМЫ ==========
        // bot.onText(/\/stop/, async (msg) => {
        //   const chatId = msg.chat.id;
        //   const userId = msg.from.id;

        //   // Очищаем все связанные состояния пользователя
        //   let clearedItems = [];
          
        //   // 1. Очищаем состояние формы
        //   if (userFormStates.has(userId)) {
        //     userFormStates.delete(userId);
        //     clearedItems.push('активная форма');
        //   }
          
        //   // 2. Очищаем из formStepsMap (если используется)
        //   if (formStepsMap.has(chatId)) {
        //     formStepsMap.delete(chatId);
        //     clearedItems.push('шаги формы');
        //   }
          
        //   // 3. Очищаем из formChangeSession
        //   if (formChangeSession.has(chatId)) {
        //     formChangeSession.delete(chatId);
        //     clearedItems.push('сессия изменения формы');
        //   }
          
        //   // 4. Очищаем из globalFormCallbacks
        //   if (globalFormCallbacks.has(chatId)) {
        //     globalFormCallbacks.delete(chatId);
        //     clearedItems.push('коллбэки формы');
        //   }
          
        //   // 5. Очищаем из calendarCallMap
        //   if (calendarCallMap.has(chatId)) {
        //     calendarCallMap.delete(chatId);
        //     clearedItems.push('календарь');
        //   }
          
        //   // 6. Очищаем из savedForms (ищем по userId)
        //   for (const [formId, formData] of savedForms.entries()) {
        //     if (formData.userId === userId) {
        //       savedForms.delete(formId);
        //       clearedItems.push('сохраненная форма');
        //     }
        //   }

        //   if (clearedItems.length > 0) {
        //     await bot.sendMessage(chatId, 
        //       `✅ *Форма полностью сброшена!*\n\n` +
        //       `Очищено:\n` +
        //       clearedItems.map(item => `▪️ ${item}`).join('\n') + `\n\n` +
        //       `Теперь вы можете начать заново с /create_request`,
        //       { parse_mode: 'Markdown' }
        //     );
        //   } else {
        //     await bot.sendMessage(chatId,
        //       `ℹ️ *Нет активных форм для сброса*\n\n` +
        //       `Чтобы создать новую заявку, используйте /create_request`,
        //       { parse_mode: 'Markdown' }
        //     );
        //   }
        // });

            
        // Обновляем данные сотрудников
        async function refreshEmployeeMap() {
          try {
            const employees = await tele2Api.getEmployeeIds(); // [{ employeeId, fullNumber, ... }]
            phoneToEmployeeMap = {};

            // Перебираем всех сотрудников из Tele2 API
            for (const emp of employees) {
              // Проверяем, существует ли сотрудник в базе данных по номеру телефона
              let employee = await Employee.findOne({ where: { fullNumber: emp.fullNumber } });

              if (!employee) {
                // Если сотрудник не найден, добавляем его в базу
                employee = await Employee.create({
                  fullNumber: emp.fullNumber,
                  employeeId: emp.employeeId,
                  telegramId: null, // Пока нет Telegram ID
                });
                // console.log(`🆕 Новый сотрудник добавлен в базу: ${emp.fullNumber}`);
              } else {
                // Если сотрудник найден, обновляем его данные
                await employee.update({ employeeId: emp.employeeId });
                // console.log(`🔄 Данные сотрудника обновлены: ${emp.fullNumber}`);
              }

              // Добавляем в мапу для дальнейшего использования
              phoneToEmployeeMap[emp.fullNumber] = employee.employeeId;
            }

            // console.log('📋 Обновлён список сотрудников:', phoneToEmployeeMap);
          } catch (err) {
            console.error('❌ Ошибка загрузки сотрудников:', err.message);
          }
        }
          

        // Получение звонков за последние 24 часа * 7
        function getTimeWindowDay() {
          const endDate = new Date();
          const startDate = new Date();
          startDate.setMinutes(endDate.getMinutes() - 10080);
          return {
            start: startDate.toISOString(),
            end: endDate.toISOString()
          };
        }


        // Отправка формы оператору
        async function sendFormToOperator(employee, callRecord) {

          let clientPhoneNumber;

          // console.log('callRecord.callType: ', callRecord.callType);

          if (callRecord.callType != 'OUTGOING') { 
            // employeeId = phoneToEmployeeMap[callRecord.calleeNumber]; // Если звонят нам}
            clientPhoneNumber = callRecord.callerNumber;
          } else {
            // employeeId = phoneToEmployeeMap[callRecord.callerNumber]; // Если мы сами звоним !!!
            clientPhoneNumber = callRecord.calleeNumber; 
          } 

            // console.log(`📞 Обработка звонка в боте для employeeId: ${employeeId}`);
            // console.log("запись = ", callRecord);
            // console.log("Звонящий = ", callRecord.callerNumber)
            // console.log("Вызываемый = ", callRecord.calleeNumber)

            const atsStatus = await findClientInATS(clientPhoneNumber);
          
            const message = `📞 Новая запись разговора:\n` +
                            `👤 Звонящий: ${callRecord.callerNumber || 'не указан'}\n` +
                            `📲 Вызываемый: ${callRecord.calleeNumber}\n` +
                            `❓ Клиент: ${atsStatus}\n` +
                            `🎧 Запись: ${callRecord.recordFileName || 'нет записи'}`;
          
                            const options = {
                              reply_markup: {
                                inline_keyboard: [
                                  [
                                    { text: '✅ Создать заявку', callback_data: `save:${callRecord.uuid}` },
                                    { text: '❌ Удалить', callback_data: `delete:${callRecord.uuid}` },
                                  ],
                                  [
                                    { text: '🎧 Прослушать / 📤 Сохранить запись', callback_data: `listen:${callRecord.uuid}` },
                                  ],
                                ]
                              }
                            };
                            

            if (!employee || !employee.telegramId) {
              console.warn(`⚠️ Telegram ID не найден для employee: ${employee}`);
              return;
            }

            const employeeTelegramId = employee.telegramId;
            // console.log(`📲 Telegram ID для employeeId ${employeeId}: ${employeeTelegramId}`);
            // const employeeTelegramId = '5550218302';

            try {
              const sentMsg = await bot.sendMessage(employeeTelegramId, message, options);
              // console.log(`📨 Форма отправлена оператору (employeeId: ${employeeId}), message_id=${sentMsg.message_id}`);
              initialMessageIds.set(callRecord.uuid, sentMsg.message_id);
            } catch(err) {
              console.error('Ошибка отправки формы оператору:', err.message);
            }

        }



        // Отправка формы оператору если клиент не звонил на телефон АТС
        async function sendFormToOperatorNewClient(employee, clientPhoneNumber) {
         
            const message = `👤 Заявка для нового клиента:`
          
            const options = {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Создать заявку', callback_data: `saveNoATC:${clientPhoneNumber}` },
                    { text: '❌ Отмена', callback_data: `cancell:${clientPhoneNumber}` },
                  ],
                ]
              }
            };
                            
            const employeeTelegramId = employee.telegramId;
            // console.log(`📲 Telegram ID для employeeId ${employeeId}: ${employeeTelegramId}`);
            // const employeeTelegramId = '5550218302';
          
            bot.sendMessage(employeeTelegramId, message, options)
        }


        // новый вариант для Map  
        function getCallRecordById(uuid) {
          return externalCalls.get(uuid) || externalCallsDay.get(uuid) || null;
        }



        // Сохранение
        async function handleSaveForm(query, callRecord) {
          try {
            const chatId = query.from.id;
            const date = callRecord.date || new Date();
            let phone;

            // Если существует запись разговора
            if (typeof callRecord === "object" && callRecord !== null) {

              if (callRecord.callType != 'OUTGOING') { 
                phone = callRecord.callerNumber; // Если звонят нам}
              } else {
                phone = callRecord.calleeNumber; // Если мы сами звоним !!! 
              } 

            } else {
              phone = callRecord
            }



            const formData = {
              callRecordId: callRecord?.uuid || String(chatId),
              name: '',
              address: '',
              description: '',
              whenDay: '',
              whenHour: '',
              technicId: '',
              payment: '',
              sourceId: '',
              phone: phone,
              comment: '',
              numberObjects: '',
            };

            let currentStepIndex = 0;

            bot.sendMessage(query.from.id, `Дата заявки: ${format(new Date(date), 'dd-MM-yyyy')}`);
            bot.sendMessage(query.from.id, `Номер телефона: ${phone}`);  
            
            setTimeout(() => {
            
            const stepMap = ['name', 'address', 'description', 'numberObjects', 'whenDay', 'whenHour', 'technicId', 'sourceId', 'payment', 'comment'];
            const prompts = {
              name: 'Укажите имя заказчика:',
              address: 'Укажите адрес:',
              description: 'Что требуется:',
              numberObjects: 'Кол-во изделий',
              whenDay: 'Укажите дату:',
              whenHour: 'Укажите время:',
              technicId: 'Укажите технолога:',
              comment: 'Комментарий:',
              sourceId: 'Откуда (источник информации):',
              payment: 'Оплата:',
            };        
        
            const askNextQuestion = async () => {
              formStepsMap.set(chatId, { currentStepIndex, formData, askNextQuestion });
              const currentField = stepMap[currentStepIndex];
              // console.log(`Текущий шаг: ${currentStepIndex}, поле: ${currentField}`);
          
              if (currentField === 'whenDay') {
              
                calendarCallMap.set(chatId, callRecord.uuid);
              
                globalFormCallbacks.set(chatId, () => {
                  currentStepIndex++;
                  askNextQuestion();
                });
              
                try {
                  calendar.startNavCalendar(query.message);
                } catch (e) {
                  console.error('Ошибка при запуске календаря:', e);
                  bot.sendMessage(chatId, 'Произошла ошибка при запуске календаря.');
                }
              
                return;
              }
          
              if (currentField === 'whenHour') {
                const timeKeyboard = generateTimeKeyboard();
                bot.sendMessage(chatId, '🕓 Укажите время:', { reply_markup: timeKeyboard }).then(() => {
                  bot.once('callback_query', async (cbQuery) => {
                    if (cbQuery.data.startsWith('time:')) {
                      const selectedTime = cbQuery.data.replace('time:', '');

                      formData.whenHour = selectedTime;
                      currentStepIndex++;
                      askNextQuestion();
                    }
                  });
                });
                return;
              }

              if (currentField === 'technicId') {
                const technics = await Technic.findAll(); 
                const buttons = technics.map(t => [{
                  text: t.name, callback_data: `technic:${t.id}`
                }]);
            
                buttons.push([{ text: 'Не указан', callback_data: 'technic:null' }]);
            
                await bot.sendMessage(chatId, prompts[currentField], {
                  reply_markup: {
                    inline_keyboard: buttons
                  }
                });
            

                globalFormCallbacks.set(chatId, () => {
                  currentStepIndex++;
                  askNextQuestion();
                });

                return;
              }  
                            
              if (currentField === 'sourceId') {
                const sources = await InfoSource.findAll(); 
                const buttons = sources.map(t => [{
                  text: t.name, callback_data: `source:${t.id}`
                }]);       
                await bot.sendMessage(chatId, prompts[currentField], {
                  reply_markup: {
                    inline_keyboard: buttons
                  }
                });        
                globalFormCallbacks.set(chatId, () => {
                  currentStepIndex++;
                  askNextQuestion();
                });
                return;
              }  
            

              const displayTime = formData.whenHour === '00:00' ? '❓ Неизвестно' : formData.whenHour;
              
              
              // Остальные поля – обычный текстовый ввод
              bot.sendMessage(chatId, prompts[currentField])
                .then(() => {
                  bot.once('message', async (msg) => {
                    formData[currentField] = msg.text;
                    currentStepIndex++;
                    if (currentStepIndex < stepMap.length) {
                      askNextQuestion();
                    } else {
                      // Все поля заполнены, сохраняем форму и отправляем итоговое сообщение
                      const formId = callRecord?.uuid || String(chatId);
                      savedForms.set(formId, formData);
                      // console.log('DEBUG: Final formData:', formData);    

                      // Сохраняем данные в БД
                      const userId = query.from.id;
                      let technic;
                      
                      if (formData.technicId != 'null') {
                        technic = await Technic.findOne({ where: { id: Number(formData.technicId)} });
                      }

                      const source = await InfoSource.findOne({ where: { id: Number(formData.sourceId) } });

                      if (!source) {
                        await bot.sendMessage(query.from.id, '❌ Источник не определен.');
                        return;
                      }

                      // Сохраняем ID технолога в заявке
                      formData.technicName = technic?.name || 'Не указан';
                      formData.sourceId = source?.id;
                      formData.sourceName = source?.name;     
                      
                      const statusId = 15; // ожидает взятия

                      // console.log(`DEBUG: userId=${userId}, technic=${technic}, source=${source}, , callRecord=${callRecord}`);
                      await saveData(formData, source, technic, callRecord, userId, statusId); // Сохраняем данные в БД            

                      const formMessage = `
                        📋 <b>Консультация:</b>
                        📅 Заявка от: ${format(new Date(date), 'dd-MM-yyyy')}
                        📞 Телефон: ${formData.phone}
                        👤 Имя: ${formData.name}
                        📍 Адрес: ${formData.address}
                        🔧 Требуется: ${formData.description}
                        🛠️ Кол-во изделий: ${(formData.numberObjects)}
                        📅 Дата: ${formData.whenDay}
                        🕓 Время: ${displayTime}
                        🧑‍💼 Технолог: ${formData.technicName}  
                        💬 Комментарий: ${formData.comment}
                        💰 Оплата: ${formData.payment}
                        📌 Источник: ${formData.sourceName}
                                      `.trim();

                        const options = {
                          parse_mode: 'HTML',
                          reply_markup: {
                          inline_keyboard: [
                            [

                              { text: '✅ Взять в работу', callback_data: `take:${callRecord?.uuid || chatId}` },
                              { text: '➡️ Передать в чат', callback_data: `pass:${callRecord?.uuid || chatId}` }
                            ],
                            [
                              { text: '📄 В черновики', callback_data: `draft:${callRecord?.uuid || chatId}` },
                              { text: '✏️ Изменить', callback_data: `change:${callRecord?.uuid || chatId}` },
                            ],
                            [
                              { text: '❌ Отмена / Удалить', callback_data: `delete:${callRecord?.uuid || chatId}` },
                            ],
                            [
                              { text: '💾 Сохранить контакт', callback_data: `add_contact:${callRecord?.uuid || chatId}` },
                            ],
                          ]
                        }
                      };
        
                      bot.sendMessage(chatId, formMessage, options);
                    }
                  });
                })
                .catch(err => console.error('Ошибка при отправке текстового запроса:', err));
            };
        
            askNextQuestion();
          }, 1500);
          } catch (err) {
            console.error('❌ Ошибка в handleSaveForm:', err);
            bot.sendMessage(query.from.id, 'Произошла ошибка при запуске формы.');
          }
        
        }
        
        bot.on("polling_error", (err) => {
          console.error("📛 Polling error:", err.code, err.response?.body || err.message);
        });
        

        // Для повторных изменений
        function waitForFieldEdit() {
          bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            const session = formChangeSession.get(chatId);

            if (!session || !savedForms.has(session.formId)) {
              // console.log('[waitForFieldEdit] Игнорируем сообщение — сессия неактивна');
              return;
            }
        
            const { formId, field } = session;
            // console.log(`[waitForFieldEdit] Ждём новое значение от chatId=${chatId}, formId=${formId}`);
        
            const value = msg.text.trim();
        
            const form = savedForms.get(formId);
            if (!form) {
              await bot.sendMessage(chatId, '⚠️ Форма не найдена в waitForFieldEdit');
              return;
            }
        
            form[field] = value;
            savedForms.set(formId, form);
            formChangeSession.delete(chatId);
        
            // console.log(`[waitForFieldEdit] Получено новое значение для "${field}": ${value}`);
        
            const callRecordOrig = getCallRecordById(formId); // 🎯 ВОТ ОНО!
        
            if (!callRecordOrig) {
              console.warn(`⚠️ Не найден звонок по ID: ${formId}`);
              return;
            }
        
            const updatedFormMessage = formatFormMessage(form, callRecordOrig);
        
            const options = {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Взять в работу', callback_data: `take:${formId}` },
                    { text: '➡️ Передать в чат', callback_data: `pass:${formId}` }
                  ],
                  [
                    { text: '📄 В черновики', callback_data: `draft:${formId}` },
                    { text: '✏️ Изменить', callback_data: `change:${formId}` }
                  ]
                ]
              }
            };
        
            await bot.sendMessage(chatId, updatedFormMessage, options);
        
            // После этого снова возвращаемся к редактированию:
            // console.log(`[
            //   ] Готов к повторному изменению поля "${field}"`);
            formChangeSession.set(chatId, { formId, field }); // для повторного изменения
            // console.log(`[waitForFieldEdit] Ждём новое значение от chatId=${chatId}, formId=${formId}`);
          });
        }
        
        function formatFormMessage(formData, callRecordOrig) {
          return `📋 <b>Консультация:</b>
          📞 Телефон: ${formData.phone || '❓'}
          👤 Имя: ${formData.name || '❓'}
          📍 Адрес: ${formData.address || '❓'}
          🔧 Требуется: ${formData.description || '❓'}
          🛠️ Кол-во изделий: ${(formData.numberObjects || '❓')}
          📅 Дата: ${formData.whenDay || '❓'}
          🕓 Время: ${formData.whenHour || '❓'}
          🧑‍💼 Технолог: ${formData.technicName || '❓'}
          💬 Комментарий: ${formData.comment || '❓'}
          💰 Оплата: ${formData.payment || '❓'}
          📌 Источник: ${formData.sourceName || '❓'}`;
        }
        
        
        // 🎯 Сохраняем коллбэк для обновления формы
        function setFormUpdateCallback(chatId, callRecordOrig) {
      
          globalFormCallbacks.set(chatId, async () => {
            const session = formChangeSession.get(chatId);
            if (!session) {
              console.warn(`[callback] Сессия не найдена для chatId=${chatId}`);
              return;
            }

            const { formId } = session;
            const form = savedForms.get(formId);
            if (!form) {
              console.warn(`[callback] Форма не найдена для formId=${formId}`);
              return;
            }

            const updatedFormMessage = formatFormMessage(form, callRecordOrig);

            const options = {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✅ Взять в работу', callback_data: `take:${formId}` },
                    { text: '➡️ Передать в чат', callback_data: `pass:${formId}` }
                  ],
                  [
                    { text: '📄 В черновики', callback_data: `draft:${formId}` },
                    { text: '✏️ Изменить', callback_data: `change:${formId}` }
                  ]
                ]
              }
            };
        
            await bot.sendMessage(chatId, updatedFormMessage, options);

          });

        }
        
        const isWaitingForTime = new Set();

        // Обработка нажатий на кнопки
        bot.on('callback_query', async (query) => {

          const chatId = query.message.chat.id;
          const data = query.data;

          // console.log('callback_query:', data);
          // console.log("savedForms в callback_query = ", savedForms)  
      
          // 1. Обработка выбора времени (callback_data начинается с "time:")
          // Обработка выбора времени через inline‑клавиатуру:
          if (data.startsWith('time:')) {
            if (isWaitingForTime.has(chatId)) {
              // console.log("DEBUG: Время уже обрабатывается, игнорируем повторный callback");
              return;
            }
            isWaitingForTime.add(chatId);
        
            const selectedTime = data.replace('time:', '');
        
            const callId = calendarCallMap.get(chatId);

            if (callId) {
              let form = savedForms.get(callId) || { chatId };
              form.whenHour = selectedTime;
              savedForms.set(callId, form);
              const displayTime = form.whenHour === '00:00' ? '❓ Неизвестно' : form.whenHour;
              await bot.sendMessage(chatId, `🕐 Вы выбрали время: ${displayTime}`);
              // console.log(`DEBUG: Updated savedForms for callId: ${callId} =>`, form);
            }
        
            if (globalFormCallbacks.has(chatId)) {
              // console.log(`DEBUG: Calling globalFormCallbacks for chatId: ${chatId}`);
              const resume = globalFormCallbacks.get(chatId);
              globalFormCallbacks.delete(chatId); // Удаляем сразу
              resume();
            } else {
              // console.log("DEBUG: globalFormCallbacks не найдены для chatId:", chatId);
            }
        
            isWaitingForTime.delete(chatId);
            return;
          }
        
          // 2. Обработка выбора даты через календарь
          // Предполагаем, что telegram-inline-calendar сохраняет в calendar.chats
          if (query.message && calendar.chats.has(chatId) &&
              query.message.message_id === calendar.chats.get(chatId)) {
            const res = calendar.clickButtonCalendar(query); // res должен быть строкой, например, "16-04-2025.day_calendar"
            if (res !== -1) {
              // Убираем суффикс (например, ".day_calendar")
              const dateStr = res.replace('.day_calendar', '');
              const parsedDate = parse(dateStr, 'dd-MM-yyyy', new Date());
              if (!isValid(parsedDate)) {
                console.error('Неверная дата, полученная из календаря:', res);
                await bot.sendMessage(chatId, 'Произошла ошибка при выборе даты.');
                return;
              }
              const formattedDate = format(parsedDate, 'dd.MM.yyyy');
              await bot.sendMessage(chatId, `📅 Вы выбрали дату: ${formattedDate}`);

              // Сохраняем дату прямо в formStepsMap, чтобы она попала в итоговую форму
              const stepData = formStepsMap.get(chatId);
              if (stepData) {
                stepData.formData.whenDay = formattedDate;
                formStepsMap.set(chatId, stepData); // переустановить на всякий случай
                // console.log('✅ whenDay обновлено в formStepsMap:', stepData.formData.whenDay);
              } else {
                // console.log('⚠️ formStepsMap не найден для chatId:', chatId);
              }

              // const callId = calendarCallMap.get(chatId);

              // if (!callId) {
              //   await bot.sendMessage(chatId, '⚠️ Не удалось определить звонок для сохранения даты.');
              //   return;
              // } 

              // let form = savedForms.get(callId) || { chatId };
              // form.whenDay = formattedDate;
              // savedForms.set(callId, form);
              

              // ⬇️ вызываем сохранённый callback
              const callback = globalFormCallbacks.get(chatId);
              if (callback) {
                globalFormCallbacks.delete(chatId); // очистить после вызова
                // console.log('DEBUG: globalFormCallbacks очистили после вызова для chatId:', chatId);
                callback();
              } else {
                // console.log('DEBUG: globalFormCallbacks не найдены для chatId:', chatId);
              }
            }
            return;
          }
        

          // 3. Обработка выбора технолога если понадобится именно изменять технолога
          if (data.startsWith('technic:')) {
            const technicId = data.replace('technic:', '');
            // console.log(`[technic] Получен technicId: ${technicId}`);
          
            const technic = technicId === 'null' ? null : await Technic.findByPk(technicId);
            if (technicId !== 'null' && !technic) {
              console.warn(`[technic] ❌ Технолог с id=${technicId} не найден.`);
              await bot.sendMessage(chatId, '❌ Технолог не найден.');
              return;
            }
          
            // === 1. Проверяем stepData из обычной формы (входящий звонок) ===
            const stepData = formStepsMap.get(chatId);
            const callIdFromCalendar = calendarCallMap.get(chatId);
            // console.log(`[technic] stepData найден: ${!!stepData}, callIdFromCalendar: ${callIdFromCalendar}`);
          
            if (stepData) {
              stepData.formData.technicId = technic?.id || null;
              stepData.formData.technicName = technic?.name || 'Не указан';
              formStepsMap.set(chatId, stepData);
          
              if (callIdFromCalendar) {
                let form = savedForms.get(callIdFromCalendar) || { chatId };
                form.technic = technic?.id || null;
                savedForms.set(callIdFromCalendar, form);
                // console.log(`[technic] Обновлён savedForm для входящего звонка:`, form);
              }
          
              await bot.sendMessage(chatId, `👷 Вы выбрали технолога: ${technic?.name || 'Не указан'}`);
            }
          
            // === 2. Проверяем, не редактирует ли пользователь существующую форму ===
            const session = formChangeSession.get(chatId);
            // console.log(`[technic] session найден: ${!!session}`);
          
            if (session) {
              const { formId } = session;
              const form = savedForms.get(formId);
              // console.log(`[technic] Режим редактирования: formId=${formId}, form найдена: ${!!form}`);
          
              if (form) {
                form.technic = technic?.id || null;
                savedForms.set(formId, form);
                // console.log(`[technic] ✅ Обновлён savedForm в режиме редактирования:`, form);
                await bot.sendMessage(chatId, `👷 Технолог обновлён: ${technic?.name || 'Не указан'}`);
              }
            }
          
            // === 3. Вызываем коллбэк, если есть ===
            const callback = globalFormCallbacks.get(chatId);
            // console.log(`[technic] callback найден: ${!!callback}`);
          
            if (callback) {
              globalFormCallbacks.delete(chatId);
              // console.log(`[technic] 🔁 Вызываем сохранённый callback`);
              callback();
            }
          
            return;
          }
                

          // 4. Обработка выбора источника
          if (data.startsWith('source:')) {
            const sourceId = data.replace('source:', '');
          
            const stepData = formStepsMap.get(chatId);
            if (!stepData) return;
          
            if (sourceId === 'null') {
              stepData.formData.sourceId = null;
              stepData.formData.sourceName = 'Не указан';
          
              const callId = calendarCallMap.get(chatId);
              if (callId) {
                let form = savedForms.get(callId) || { chatId };
                form.source = null;
                savedForms.set(callId, form);
              }
          
              await bot.sendMessage(chatId, `❌ Источник не указан`);
          
              // вызываем сохранённый callback
              const callback = globalFormCallbacks.get(chatId);
              if (callback) {
                globalFormCallbacks.delete(chatId);
                callback();
              }
          
              return;
            }
          
            const source = await InfoSource.findByPk(sourceId);
            if (!source) {
              await bot.sendMessage(chatId, '❌ Источник не найден.');
              return;
            }
          
            stepData.formData.sourceId = source.id;
            stepData.formData.sourceName = source.name;
          
            const callId = calendarCallMap.get(chatId);
            if (callId) {
              const form = savedForms.get(callId) || { chatId };
              form.source = source.id;
              savedForms.set(callId, form);
            }
          
            await bot.sendMessage(chatId, `✅ Вы выбрали источник: ${source.name}`);
          
            // вызываем сохранённый callback
            const callback = globalFormCallbacks.get(chatId);
            if (callback) {
              globalFormCallbacks.delete(chatId);
              callback();
            }
          
            return;
          }


          // 5. Обработка редактирования поля формы
          if (data.startsWith('editField:')) {
            const [, field, id] = data.split(':');
            const form = savedForms.get(id) || savedForms.get(chatId);
            if (!form) {
              await bot.sendMessage(chatId , '⚠️ Форма не найдена в data.startsWith(editField)');
              return;
            }
          
            let callRecordOrig = getCallRecordById(id);
            formChangeSession.set(chatId, { formId: id, field });
          
            // console.log(`[editField] Начат режим редактирования поля "${field}" для формы ${id}`);

            if (field === 'whenDay') {
              // Открываем календарь         
              calendarCallMap.set(chatId, callRecordOrig.uuid);

              calendar.startNavCalendar(query.message);

              setFormUpdateCallback(chatId, callRecordOrig);         
            
            } else if (field === 'whenHour') {
              // Открываем селектор времени
              const timeKeyboard = generateTimeKeyboard();
              bot.sendMessage(chatId, '🕓 Укажите время:', { reply_markup: timeKeyboard }).then(() => {
                bot.once('callback_query', async (cbQuery) => {
                  if (cbQuery.data.startsWith('time:')) {
                    const selectedTime = cbQuery.data.replace('time:', '');
                    form.whenHour = selectedTime;
                  }
                });
              });

              setFormUpdateCallback(chatId, callRecordOrig);

            } else if (field.startsWith('technic')) {
              const technics = await Technic.findAll(); 
              const buttons = technics.map(t => [{
                text: t.name, callback_data: `technic:${t.id}`
              }]);
          
              await bot.sendMessage(chatId,  '👷 Выберите технолога:', {
                reply_markup: {
                  inline_keyboard: buttons
                }
              });
          
              setFormUpdateCallback(chatId, callRecordOrig);
                  
              return;
            }


            else if (field.startsWith('source')) {
              const sources = await InfoSource.findAll(); 
              const buttons = sources.map(t => [{
                text: t.name, callback_data: `source:${t.id}`
              }]);
          
              await bot.sendMessage(chatId,  '👷 Выберите источник:', {
                reply_markup: {
                  inline_keyboard: buttons
                }
              });
          
              setFormUpdateCallback(chatId, callRecordOrig);
                  
              return;
            } 

            
            else {
              await bot.sendMessage(chatId, `✏️ Введите новое значение`);
              waitForFieldEdit(chatId, id, callRecordOrig); // запускаем слушатель          
            }

            return;
          }
                

          // 6. Обработка вызова через планировщик напоминаний звонков из reminderScheduler.js
          if (data.startsWith('call_now:')) {

            const recordId = data.split(':')[1];
        
            // 1) Получаем запись консультации
            const record = await Record.findByPk(recordId);
            if (!record) {
              return bot.answerCallbackQuery(query.id, { text: '❌ Консультация не найдена' });
            }

            // console.log("technicName = ", record.technicName )
        
            // 2) По имени технолога берём телефон из Technic
            const technic = await Technic.findOne({ where: { name: record.technicName } });
            if (!technic) {
              return bot.answerCallbackQuery(query.id, { text: '❌ Технолог не найден' });
            }
            const technicPhone = technic.phone.replace(/\D/g, ''); // нормализуем

            // console.log("technicsPhone = ", technicPhone)
        
            // 3) По телефону технолога ищем запись в Employee
            const employee = await Employee.findOne({ where: { fullNumber: technicPhone } });
            if (!employee || !employee.telegramId) {
              return bot.answerCallbackQuery(query.id, { text: '❌ Не найден Telegram ID технолога' });
            }
            const userId = employee.telegramId;

            // console.log("employee = ", employee)
        
            // 4) Теперь инициализируем звонок
            try {
              await tele2Api.callOutgoing(record.clientPhone, technicPhone);
              await bot.answerCallbackQuery(query.id, { text: '✅ Звонок инициирован. Ожидайте набора.' });
              await bot.sendMessage(userId, `📞 Звонок клиенту ${record.clientPhone} запущен.`);
            } catch (err) {
              console.error('Ошибка инициирования звонка:', err);
              await bot.sendMessage(userId, `❌ Ошибка при вызове: ${err.message}`);
            }
          }   
      

          // 6. Общая обработка остальных callback'ов (например, "save:UUID", "pass:UUID" и т.п.)
          // Чтобы корректно сформировать UUID даже если он содержит двоеточия,
          // объединяем все части, начиная со второй.
          const parts = query.data.split(':');
          const action = parts[0];
          const id = parts.slice(1).join(':');      
          const activeReminders = new Map(); // id => intervalId
          const callRecord = getCallRecordById(id);  
          
          // if (!callRecord) {
          //   console.warn(`⚠️ Не найден звонок по ID: ${id}`);
          //   return;
          // }

          switch (action) {
            
            case 'delete': {
              const chatId = query.from.id;
              const formId = query.data.replace('delete:', '');
            
              await bot.sendMessage(chatId, '❗ Вы уверены, что хотите удалить эту форму?', {
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '✅ Да, удалить', callback_data: `confirmDelete:${formId}` },
                      { text: '❌ Отмена', callback_data: `cancelDelete:${formId}` }
                    ]
                  ]
                }
              });
            
              break;
            }
            
            case 'confirmDelete': {
              const formId = query.data.replace('confirmDelete:', '');
              const chatId = query.from.id;
              const messageId = initialMessageIds.get(formId);
            
              if (messageId) {
                bot.deleteMessage(chatId, messageId).catch(err => {
                  console.error('Ошибка удаления сообщения:', err.message);
                });
              }
            
              // Удаляем все данные
              savedForms.delete(formId);
              formChangeSession.delete(chatId);
              calendarCallMap.forEach((callId, keyChatId) => {
                if (callId === formId) calendarCallMap.delete(keyChatId);
              });
              globalFormCallbacks.delete(chatId);
              formStepsMap.delete(chatId);
              isWaitingForTime.delete(chatId);
              initialMessageIds.delete(formId);
              // processedCallRecordIds.delete(uuid)
              // console.log("Данные удалены")
              await bot.sendMessage(chatId, '🗑️ Форма удалена и все временные данные очищены.');
              break;
            }
            
            case 'cancelDelete': {
              const chatId = query.from.id;
              await bot.sendMessage(chatId, '❎ Удаление отменено.');
              break;
            }

            case 'cancel': {
              const chatId = query.from.id;
              await bot.sendMessage(chatId, '❎ Действие отменено.');
              break;
            }         

                  
            case 'save': {return handleSaveForm(query, callRecord);}

            case 'saveNoATC': {return handleSaveForm(query, parts[1]);}
        
            case 'pass': {
              const form = savedForms.get(id);
              if (!form) {
                bot.sendMessage(query.from.id, '⚠️ Форма не найдена. Сначала сохраните данные.');
                break;
              }
            
              sendFormToGroup({ form, callRecord, id, chatId: query.from.id });
              break;
            }
            
            case 'pass_without_technic': {
              const form = savedForms.get(id);
              if (!form) {
                bot.sendMessage(query.from.id, '⚠️ Форма не найдена. Сначала сохраните данные.');
                break;
              }
            
              sendFormToGroup({ form, callRecord, id, chatId: query.from.id, skipTechnic: true });
              break;
            }
            
        
            case 'take': {

            const form = savedForms.get(id);

            if (!form) {
              bot.answerCallbackQuery(query.id, { text: '⚠️ Форма не найдена в take.' });
              return;
            }
        
            const userId = query.from.id;
            const userName = query.from.first_name || query.from.username || 'Неизвестный';

            const technicObj = await Employee.findOne({ where: { telegramId: userId } });

            if (!technicObj) {
              await bot.sendMessage(userId, '❌ Вы не зарегистрированы как сотрудник. Обратитесь к администратору.');
              return;
            }

            const technic = await Technic.findOne({ where: { phone: technicObj.fullNumber } });
            const source = await InfoSource.findOne({ where: { id: form.sourceId } });

            if (!technic) {
              await bot.sendMessage(query.from.id, '❌ Вы не зарегистрированы как технолог. Обратитесь к администратору.');
              return;
            }

            if (!source) {
              await bot.sendMessage(query.from.id, '❌ Источник не определен.');
              return;
            }

            // Сохраняем ID технолога в заявке
            form.technicId = technic.id;
            form.technicName = technic.name;
            form.sourceId = source.id;
            form.sourceName = source.name;
            savedForms.set(id, form); // пересохраняем
        
            const personalMessage = `
      📩 <b>Вы приняли заявку в работу</b>
      
      📅 Дата обращения: ${format(new Date(form.date || new Date()), 'dd-MM-yyyy')}
      📞 Телефон: ${form.phone}
      👤 Имя заказчика: ${form.name}
      📍 Адрес: ${form.address}
      🔧 Требуется: ${form.description}
      🛠️ Кол-во изделий: ${(form.numberObjects)}
      📅 Дата: ${form.whenDay}
      🕓 Время: ${form.whenHour}
      💰 Оплата: ${form.payment}
      💬 Комментарий: ${form.comment}  
      👷 Назначен специалист: ${technic.name || "userName"}
      📌 Источник: ${source.name}
          `.trim();
        
            const buttons = {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '📞 Позвонить', callback_data: `call:${id}` },
                    { text: '⏰ Позвонить позже', callback_data: `callLater:${id}` }
                  ],
                  [
                    { text: '✅ Уже созвонились', callback_data: `already:${id}` },
                    { text: '✏️ Изменить', callback_data: `change:${id}` },
                  ],
                  [
                    { text: '📄 В черновики', callback_data: `draft:${id}` },
                    { text: '➡️ Передать в чат', callback_data: `pass_without_technic:${id}` }
                  ],
                  [
                    { text: '💾 Сохранить контакт', callback_data: `add_contact:${id}` },
                  ],
                ]
              }
            };

            const statusId = 9; // взят в работу

            await saveData(form, source, technic, callRecord, userId, statusId); // Сохраняем данные в БД
        
            await bot.sendMessage(userId, personalMessage, buttons);
            await bot.answerCallbackQuery(query.id, { text: '🛠️ Заявка взята в работу' });
        
            // (опционально) можно обновить кнопку в группе, чтобы видно было, кто взял
            bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
              chat_id: query.message.chat.id,
              message_id: query.message.message_id
            });
        
            bot.sendMessage(query.message.chat.id, `✅ Заявка взята в работу: ${userName}`);
                

              break;
            }
        
            case 'draft': {
              bot.sendMessage(query.from.id, '📝 Форма сохранена в черновик.');
              // console.log(`🗂️ Черновик звонка ${id}`);
              break;
            }


            case 'add_contact': {

              const form = savedForms.get(id);

              // console.log("FORMA = ", form)
  
              if (!form) {
                bot.answerCallbackQuery(query.id, { text: '⚠️ Форма не найдена.' });
                return;
              }

              let raw = form.phone || '?';
              let digits = raw.replace(/\D/g, '');       // оставляем только цифры
              if (!digits.startsWith('7')) {
                // на всякий случай
                digits = '7' + digits;
              }
              const phoneNumber = '+' + digits;
          
              // 2) Собираем поля для отправки карточки
              const phone   = phoneNumber;
              const name    = form.name  || 'Клиент';
              const address = form.address     || '';
          
              // 3) Отправляем карточку контакта
              await bot.sendContact(
                chatId,
                phone,
                address, // first_name (отобразится как имя)
                {
                  last_name: name, // отобразится как фамилия
                  vcard: `FN:${address} ${name}\nTEL:${phone}`
                }
              );
          
              // 4) Ответ на нажатие кнопки
              await bot.answerCallbackQuery(query.id, { text: 'Контакт отправлен' });

              break;
            }            

            case 'listen': {
                // Получаем файл записи через Tele2 API через наш экземпляр tele2Api
                try {
                  const audioBuffer = await tele2Api.fetchRecordingFile(callRecord.recordFileName);
                  
                  if (!audioBuffer) {
                    await bot.sendMessage(query.from.id, '❌ Не удалось получить запись.');
                  } else {
                    const { Readable } = require('stream');
                    const audioStream = Readable.from(audioBuffer);
                    // console.log('Размер буфера записи:', audioBuffer.length);

                    await bot.sendAudio(query.from.id, audioStream, {
                      filename: `${callRecord.recordFileName}.mp3`,
                      contentType: 'audio/mpeg',
                      title: 'Запись разговора',
                      performer: callRecord.callerNumber || 'Звонящий',
                    });                          
                  }
                } catch (err) {
                  console.error('Ошибка в кейсе listen:', err.message);
                  await bot.sendMessage(query.from.id, '❌ Ошибка воспроизведения записи.');
                }
                break;
            }

            case 'download': {
              try {
                const uuid = query.data.split(':')[1]; // Получаем UUID из callback_data
                const record = externalCallsDay.get(uuid);
            
                if (!record) {
                  await bot.sendMessage(query.from.id, '❌ Запись не найдена.');
                  break;
                }
            
                const audioBuffer = await tele2Api.fetchRecordingFile(record.recordFileName);
            
                if (!audioBuffer) {
                  await bot.sendMessage(query.from.id, '❌ Не удалось получить запись.');
                  break;
                }
            
                const { Readable } = require('stream');
                const audioStream = Readable.from(audioBuffer);
            
                await bot.sendAudio(query.from.id, audioStream, {
                  filename: `${record.recordFileName}.mp3`,
                  contentType: 'audio/mpeg',
                  title: 'Запись разговора',
                  performer: record.callerNumber || 'Звонящий',
                });
            
              } catch (err) {
                console.error('Ошибка в кейсе listen:', err.message);
                await bot.sendMessage(query.from.id, '❌ Ошибка воспроизведения записи.');
              }
            
              break;
            }
            
            
            case 'callLater': {
              const form = savedForms.get(id);
              if (!form) {
                bot.sendMessage(query.from.id, '⚠️ Заявка не найдена.');
                break;
              }
            
              if (activeReminders.has(id)) {
                bot.sendMessage(query.from.id, '⏰ Напоминание уже активно.');
                break;
              }
            
              bot.sendMessage(query.from.id, '🔔 Напоминания включены. Я буду напоминать каждые 30 минут.');
            
              const intervalId = setInterval(() => {
                bot.sendMessage(query.from.id, `⏰ Напоминание: нужно позвонить клиенту ${form.name} по номеру ${form.phone || form.callerNumber || callRecord?.callerNumber}`);
              }, 30 * 60 * 1000); // 30 минут
            
              activeReminders.set(id, intervalId);
              break;
            }

                      
            case 'call': {
              const form = savedForms.get(id);
            
              if (!form || !callRecord) {
                await bot.answerCallbackQuery(query.id, { text: '⚠️ Данные заявки не найдены.' });
                return;
              }
            
              const userId = query.from.id;
      
              const technicObj = await Employee.findOne({ where: { telegramId: userId } });
            
              // 1. Показываем сообщение о начале вызова
              await bot.sendMessage(userId, `📞 Начинаем звонок по номеру: ${form.phone}`);

              try {

                await tele2Api.callOutgoing(form.phone, technicObj.fullNumber);

                await bot.sendMessage(userId, '✅ Звонок инициализирован.');
                
              } catch (error) {
                console.error('Ошибка вызова:', error);
                await bot.sendMessage(userId, `❌ Ошибка при вызове: ${error.message}`);
              }  
              
              setTimeout(async () => {
            
                // 2. Повторно показываем форму
                const confirmationMessage = `
            📋 <b>Заявка</b>
            
            📅 Дата обращения: ${format(new Date(form.date || new Date()), 'dd-MM-yyyy')}
            📞 Телефон: ${form.phone}
            👤 Имя заказчика: ${form.name}
            📍 Адрес: ${form.address}
            🔧 Требуется: ${form.description}
            🛠️ Кол-во изделий: ${(form.numberObjects)}
            📅 Дата: ${form.whenDay || 'не указана'}
            🕓 Время: ${form.whenHour || 'не указано'}
            👷 Технолог: ${form.technicName}
            💬 Комментарий: ${form.comment || ''}
            💰 Оплата: ${form.payment}
            📌 Источник: ${form.sourceName}
                `.trim();
            
                const actionButtons = {
                  parse_mode: 'HTML',
                  reply_markup: {
                    inline_keyboard: [
                      [
                        { text: '✅ Назначить время', callback_data: `assignTime:${id}` },
                        { text: '❌ Отмена', callback_data: `delete:${callRecord.uuid}` },
                      ],
                      [
                        { text: '📞 Позвонить', callback_data: `call:${id}` },
                        { text: '⏰ Перезвонить позже', callback_data: `callLater:${id}` }                                        
                      ],
                    ]
                  }
                };
            
                await bot.sendMessage(userId, confirmationMessage, actionButtons);
              }, 3000);
              break;
            }


            case 'assignTime': {

              const id = data.replace('assignTime:', '');
              const form = savedForms.get(id);
            
              if (!form) {
                await bot.answerCallbackQuery(query.id, { text: '⚠️ Форма не найдена.' });
                return;
              }
            
              calendarCallMap.set(chatId, id);
            
              calendar.startNavCalendar(query.message, '📅 Выберите дату для записи:');
            
              // После выбора даты пойдет "clickButtonCalendar" (оно уже есть)
              // и потом сохранённый callback вызовется из globalFormCallbacks
              globalFormCallbacks.set(chatId, async () => {
                // После выбора даты покажем время            
                const timeKeyboard = generateTimeKeyboard();
                await bot.sendMessage(chatId, '🕓 Укажите время:', { reply_markup: timeKeyboard }).then(() => {
                  bot.once('callback_query', async (cbQuery) => {
                    if (cbQuery.data.startsWith('time:')) {
                      const selectedTime = cbQuery.data.replace('time:', '');
                      // console.log("selectedTime = ", selectedTime)
                      form.whenHour = selectedTime;

                    }
                  });
                });
            
                globalFormCallbacks.set(chatId, async () => {
                  // ✅ После выбора времени — запрашиваем комментарий
            
                  const formId = calendarCallMap.get(chatId);
                  const form = savedForms.get(formId);

                  // 💥 Убираем конфликтующий слушатель из waitForFieldEdit
                  formChangeSession.delete(chatId);
            
                  let existingComment = form.comment || '';
                  let prompt = '💬 Комментарии:';
                  if (existingComment) {
                    prompt += `\n(Существующий: "${existingComment}")\n➕ Новый комментарий.`;
                  }
            
                  await bot.sendMessage(chatId, prompt);
      
                  bot.once('message', async (msg) => {
                    const newComment = msg.text.trim();
                
                    if (form.comment) {
                      form.comment += `\n${newComment}`;
                    } else {
                      form.comment = newComment;
                    }
                
                    savedForms.set(formId, form);
                
                    await bot.sendMessage(chatId, `
      📋 Консультация:
      
      📅 Дата: ${form.whenDay}
      🕓 Время: ${form.whenHour}
      💬 Инфо: ${form.comment}
                    `.trim(), {
                      reply_markup: {
                        inline_keyboard: [
                          [
                            { text: '✅ Назначаем', callback_data: `confirmAssign:${formId}` },
                            { text: '❌ Отменяем', callback_data: `delete:${formId}` }
                          ]
                        ]
                      }
                    });
                  });
      
                });
              });
            break;  
            }
            
            case 'change': {

              // console.log("Запускаем изменения")

              const form = savedForms.get(id);
              if (!form) {
                await bot.sendMessage(chatId, '⚠️ Форма не найдена');
                return;
              }

              // console.log("FORMA = ", form)
          
              // Сохраняем текущую форму в редактировании
              formChangeSession.set(chatId, { formId: id, step: 'selectField' });
          
              const fieldKeyboard = {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '📞 Телефон', callback_data: `editField:phone:${id}` }],
                    [{ text: '👤 Имя', callback_data: `editField:name:${id}` }],
                    [{ text: '📍 Адрес', callback_data: `editField:address:${id}` }],
                    [{ text: '🔧 Требуется', callback_data: `editField:description:${id}` }],
                    [{ text: '🛠️ Кол-во изделий', callback_data: `editField:numberObjects:${id}` }],
                    [{ text: '📅 Дата', callback_data: `editField:whenDay:${id}` }],
                    [{ text: '🕓 Время', callback_data: `editField:whenHour:${id}` }],
                    [{ text: '🧑‍💼 Технолог', callback_data: `editField:technicName:${id}` }],                                       
                    [{ text: '💬 Комментарий', callback_data: `editField:comment:${id}` }],
                    [{ text: '💰 Оплата', callback_data: `editField:payment:${id}` }],
                    [{ text: '📌 Источник', callback_data: `editField:sourceName:${id}` }]
                  ]
                }
              };
          
              await bot.sendMessage(chatId, 'Выберите, что хотите изменить:', fieldKeyboard);

              break;
            }

            case 'already': {

              const form = savedForms.get(id);
            
              if (!form || !callRecord) {
                await bot.answerCallbackQuery(query.id, { text: '⚠️ Данные заявки не найдены.' });
                return;
              }
            
              const userId = query.from.id; 
              
              const confirmationMessage = 'Выберите действие'

              const actionButtons = {
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '✅ Назначить время', callback_data: `assignTime:${id}` },
                      { text: '⏰ Перезвонить позже', callback_data: `callLater:${id}` }
                    ],
                    [
                      { text: '❌ Отмена / Удалить', callback_data: `delete:${callRecord.uuid}` },
                    ],
                  ]
                }
              };

              await bot.sendMessage(userId, confirmationMessage, actionButtons);
            }

          }
        
          bot.answerCallbackQuery(query.id, { text: `Действие "${action}" выполнено.` });
        });
        

        // Функция создания выбора времени  
        function generateTimeKeyboard() {
          const times = [];
          for (let hour = 9; hour < 20; hour++) {
            const h = hour.toString().padStart(2, '0');
            times.push(`${h}:00`);
            times.push(`${h}:30`);
          }

          const keyboard = [];
          for (let i = 0; i < times.length; i += 4) {
            keyboard.push(times.slice(i, i + 4).map(time => ({
              text: time,
              callback_data: `time:${time}`
            })));
          }

          // Добавим кнопку "Неизвестно" в отдельной строке
          keyboard.push([
            { text: '❓ Неизвестно', callback_data: 'time:00:00' }
          ]);

          return { inline_keyboard: keyboard };
        }


        // Рефакториинг для отправки формы в группу
        function sendFormToGroup({ form, callRecord, id, chatId, skipTechnic = false }) {
          const technicLine = skipTechnic
            ? '🧑‍💼 Технолог: Не указан'
            : `🧑‍💼 Технолог: ${form.technicName}`;

          const chatMessage = `
      📋 <b>Консультация:</b>
      📅 Заявка от: ${format(new Date(callRecord?.date || new Date()), 'dd-MM-yyyy')}
      📞 Телефон: ${form.phone}
      👤 Имя: ${form.name}
      📍 Адрес: ${form.address}
      🔧 Требуется: ${form.description}
      🛠️ Кол-во изделий: ${(form.numberObjects)}
      📅 Дата: ${form.whenDay}
      🕓 Время: ${form.whenHour}
      ${technicLine}
      💬 Комментарий: ${form.comment || ''}
      💰 Оплата: ${form.payment}
      📌 Источник: ${form.sourceName}
        `.trim();

          const groupOptions = {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🛠️ Взять в работу', callback_data: `take:${id}` }]
              ]
            }
          };

          bot.sendMessage(GROUP_CHAT_ID, chatMessage, groupOptions);
          bot.sendMessage(chatId, '✅ Обращение передано в чат');
        }


        // Запрос звонков за сутки * 7
        async function pollCallRecordsDay() {

          const { start, end } = getTimeWindowDay();
          const callRecords = await tele2Api.getCallRecords(start, end, { is_recorded: true, size: 1000 });
        
          // console.log(getTimeWindowDay());

          const newRecs = callRecords.filter(call => {
            return (call.callType === 'SINGLE_CHANNEL' || call.callType === 'MULTI_CHANNEL' || call.callType === 'OUTGOING')
              && call.recordFileName
          });
        
          for (const rec of newRecs) {
            if (!externalCallsDay.has(rec.uuid)) {
              externalCallsDay.set(rec.uuid, rec);
              // console.log(`✅ Добавлена запись: ${rec}`);
            }
          }   
          // console.log(`Число записей: ${newRecs.length}`);
        }


        // Функция сохранения данных в базу для CRM
        async function saveData(form, source, technic, callRecord, userId, statusId) {
          const [day, month, year] = form.whenDay?.split('.') || [];
          const clientPhone = form.phone?.replace(/^(\+7|8)/, '7'); // Приводим к единому виду
          let employeePhone;
          
          if (callRecord) {
            const { callerNumber, calleeNumber } = callRecord;
            // Если caller — это клиент, то берём callee; иначе — caller:
            employeePhone =
              callerNumber === clientPhone
                ? calleeNumber
                : callerNumber;
          }


          // 2. Загружаем и фильтруем только реальные дефолты из конфига
          const allConfigs = await CRMConfig.findAll({});
          const configsWithValue = allConfigs.filter(cfg =>
            cfg.value != null && String(cfg.value).trim() !== ''
          );
          // console.log('📦 реальные дефолты:', configsWithValue.map(c => `${c.field}=${c.value}`));


          // 3. Собираем defaultNewParams
          const defaultNewParams = configsWithValue.reduce((acc, cfg) => {
            acc[cfg.field] = String(cfg.value);
            return acc;
          }, {});
          // Перекрываем дефолт для numberObjects, если он передан в форме
          if (form.numberObjects != null) {
            defaultNewParams.numberObjects = String(form.numberObjects);
          }

          // Рассчитываем serviceDate
          const serviceDate = form.whenDay && form.whenHour
            ? (() => {
                const date = new Date(`${year}-${month}-${day}T${form.whenHour}:00`);
                date.setHours(date.getHours() - 7); // ваш сдвиг
                return date;
              })()
            : form.whenDay
              ? (() => new Date(`${year}-${month}-${day}`))()
              : null;

          // Рассчитываем напоминалку
          let reminderCallDate = null;
          const isValidRemindTime = /^[0-9]+$/.test(60); // первое напоминание за 60 минут
          if (serviceDate && isValidRemindTime) {
            const minutesBefore = parseInt(60, 10);
            reminderCallDate = new Date(serviceDate.getTime() - minutesBefore * 60_000);
          }

          let secondCallDate = null
          if (statusId === Number(9)) {
            secondCallDate = new Date()
          }
          
          // Подготовка данных
          const newData = {
            requestDate: form.date ? new Date(form.date) : new Date(),
            address: form.address || null,
            clientName: form.name || null,
            serviceRequired: form.description || null,
            serviceDate,          
            serviceTime: form.whenHour || null,
            reminderCallDate,
            paymentAmount: form.payment || null,
            source: source?.name || null,
            technicName: technic?.name || null,
            statusId: statusId, // взят в работу,?
            clientPhone: clientPhone || null,
            comment: form.comment || null,
            email: form.email || null,
            secondCallDate: secondCallDate,
            active: true,
        
            // Звонок
            callUuid: callRecord?.uuid || null,
            callDate: callRecord?.date ? new Date(callRecord.date) : null,
            callType: callRecord?.callType || null,
            destinationNumber: callRecord?.destinationNumber || null,
            callerNumber: callRecord?.callerNumber || null,
            callerName: callRecord?.callerName || null,
            calleeNumber: callRecord?.calleeNumber || null,
            calleeName: callRecord?.calleeName || null,
            callDuration: callRecord?.callDuration || null,
            callStatus: callRecord?.callStatus || null,
            recordFileName: callRecord?.recordFileName || null,

            // Добавляем дополнительные поля
            telegramId: userId || '',
            lastTalk: employeePhone || technic.phone,
            // numberObjects: form.numberObjects,
            newParams: defaultNewParams,

          };

         
          try {
            const shouldCreateNewConsult = Number(statusId) === 15;
            let existing = null;

            if (callRecord?.uuid) {
              existing = await Record.findOne({
                where: { callUuid: callRecord.uuid },
                order: [['createdAt', 'DESC']],
              });
            }

            if (!existing && !shouldCreateNewConsult) {
              const phoneCandidates = Array.from(new Set([
                clientPhone,
                form.phone,
                form.phone?.replace(/^\+7/, '7'),
                form.phone?.replace(/^8/, '7'),
              ].filter(Boolean)));

              existing = await Record.findOne({
                where: {
                  clientPhone: { [Op.in]: phoneCandidates },
                  active: true,
                  statusId: 15,
                },
                order: [['createdAt', 'DESC']],
              });
            }
        
            if (existing) {           
              const mergedParams = {
                ...defaultNewParams,
                ...existing.newParams
              };

              // Обновляем ожидающую консультацию, не создавая копию при нажатии "Взять в работу".
              await existing.update({
                ...newData,
                newParams: mergedParams
              });

            } else {

              const record = await Record.create(newData);

              // если у нас есть reminderCallDate и бот уже инициализирован — планируем задачу
              if (record.reminderCallDate) {
                scheduleReminderJob(record);
              }

            }
          } catch (err) {
            console.error('❌ Ошибка при сохранении записи в БД:', err);
          }
        }

        // Ищем статистистику по номеру
        async function findClientInATS(clientPhoneNumber) {
          const now = new Date();
          // const twoYearsAgo = new Date();
          // twoYearsAgo.setFullYear(now.getFullYear() - 2);
          const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 часа назад
        
          try {
            const stats = await tele2Api.getCallStatistics(oneDayAgo, now, clientPhoneNumber);

            // console.log('Статистика вызовов:', stats);
            
            const entry = stats[0]; // предполагаем, что один элемент на номер
            if (entry && entry.numberOfCalls > 0) {
              return '✅ Звонил в течении суток';
            } else {
              return '❌ Не звонил в течении суток';
            }
          } catch (error) {
            console.error('Ошибка при получении статистики вызовов:', error);
            return '⚠️ Ошибка запроса';
          }
        }

        // Первый запуск
        refreshEmployeeMap();

        // Интервалы
        setInterval(refreshEmployeeMap, EMPLOYEE_REFRESH_INTERVAL);

      })
      .catch(err => {
        console.error('Ошибка инициализации Tele2Api:', err.message);
      });   
    }

    // Запускаем функцию tele2()
    tele2();


    // Запрос звонков за все 2 года
    async function pollCallRecordsAll(phone) {
    // console.log("Вызывается pollCallRecordsAll")

      try {

        const { start, end } = getTimeWindowAll();

        const callRecordsFrom = await tele2Api.getCallRecords(start, end, {
          is_recorded: true,
          size: 1000,
          caller: phone,
          callType: 'OUTGOING'
        });

      // console.log(`Число записей исходящих: ${callRecordsFrom.length}`)
        
        const callRecordsTo = await tele2Api.getCallRecords(start, end, {
          is_recorded: true,
          size: 1000,
          callee: phone,
          callType: 'SINGLE_CHANNEL'
        });

      // console.log(`Число записей входящих: ${callRecordsTo.length}`)
        
        // Объединить результаты
        const combined = [...callRecordsFrom, ...callRecordsTo];

        for (const rec of combined) {
          if (!externalCallsAll.has(rec.uuid)) {
            externalCallsAll.set(rec.uuid, rec);
          // console.log(`✅ Добавлена запись: ${rec}`);
          }
        }   

      // console.log(`Число записей всех: ${combined.length}`);

      } catch (err) {
        console.error("Ошибка в pollCallRecordsAll Звонки не найдены:", err.message);
        return []; // или обработай fallback
      }       
    }


    // 🔽 Функция получения  и передачи всех звонков по номеру
    async function getCallsByPhone(req, res) {

      const { phone } = req.query;
      // console.log("getCallsByPhone phone = ", phone)
      if (!phone) return res.status(400).json({ error: 'phone is required' });

      try {

        // Очищаем старые записи, чтобы не накапливались
        externalCallsAll.clear();

        const normalizedPhone = normalizePhone(phone);

        // Забираем все новые записи за весь период
        await pollCallRecordsAll(normalizedPhone);

        const allCalls = Array.from(externalCallsAll.values());
        // console.log("allCalls = ", allCalls.length)

        res.json(allCalls);
      } catch (err) {
        console.error('Ошибка в getCallsByPhone:', err);
        res.status(500).json({ error: 'Internal error' });
      }
    }


    // Получение звонков за последние 2 года
    function getTimeWindowAll() {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMinutes(endDate.getMinutes() - 1000000); // за 2 года
      return {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      };
    }    


    // Получаем запись для прослушивания
    async function getRecordMpeg(req, res) {
      // console.log("getRecordMpeg")
      try {
        const { filename } = req.params;
        // console.log("filename = ", filename)
        const audioBuffer = await tele2Api.fetchRecordingFile(filename);
        
        if (!audioBuffer) return res.status(404).send('Файл не найден');

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `inline; filename="${filename}.mp3"`);
        res.send(audioBuffer);
      } catch (err) {
        console.error('Ошибка при получении записи:', err);
        res.status(500).send('Ошибка при получении записи');
      }
    }

    
    // Функция для нормализации телефона
    function normalizePhone(input) {
      const digitsOnly = input.replace(/\D/g, '');
    
      if (digitsOnly.length === 11) {
        // Если начинается с 8, заменяем на 7
        if (digitsOnly.startsWith('8')) {
          return '7' + digitsOnly.slice(1);
        }
    
        // Если начинается с 7, оставляем как есть
        if (digitsOnly.startsWith('7')) {
          return digitsOnly;
        }
    
        // Если начинается с 9 — добавляем 7 в начале
        if (digitsOnly.startsWith('9')) {
          return '7' + digitsOnly;
        }
      }
    
      // Если 10 цифр и начинается с 9 — тоже добавим 7
      if (digitsOnly.length === 10 && digitsOnly.startsWith('9')) {
        return '7' + digitsOnly;
      }
    
      // В остальных случаях вернем как есть (или null по вкусу)
      return digitsOnly;
    }

    module.exports = {
      tele2,
      getCallsByPhone,
      getRecordMpeg
    };

} // Запускаем сервер Express
