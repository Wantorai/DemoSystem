const db = require('../models');
const Order = db.sequelize.models.Order;
const Record = db.sequelize.models.Record; 
const StatusColorCRM = db.sequelize.models.StatusColorCRM;
const HolidayConfig = db.sequelize.models.HolidayConfig;
const { Sequelize } = require("sequelize");
const { Op, where, fn, json, literal } = require('sequelize');



// GET /api/orders?from=…&to=…&installer=…&technologistId=…
const getAllOrders = async (req, res) => {
  try {
    const { installer, technologistId } = req.query;

    // Сразу собираем whereClause
    let whereClause = {};

    if (installer) {
      whereClause = where(
        json('data.param17'),
        String(installer)
      );
    }

    if (technologistId) {
      // Если уже был whereClause от installer, объединяем через Op.and
      whereClause = whereClause[Op.and]
        ? { [Op.and]: [ whereClause, where(json('data.param7'), String(technologistId)) ] }
        : where(json('data.param7'), String(technologistId));
    }

    const orders = await Order.findAll({ where: whereClause });

    res.json(
      orders.map(o => {
        const plain = o.toJSON();
        return {
          ...plain,
          order_number: plain.order_number ?? plain.data.order_number,
        };
      })
    );
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};



// Переделываем GET чтобы оптимизировать загрузку данных для страницы заказов
const getAllOrdersForOrders = async (req, res) => {
  try {
    const { installer, technologistId, active } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 100;
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();

    // console.log('GET /orders query:', req.query, 'page,limit,offset:', page, limit, offset);

    let whereClause = {};

    // 🔹 Фильтр по активности (булевое поле)
    if (active !== undefined) {
      if (active === "true") {
        whereClause.active = true;
      } else if (active === "false") {
        whereClause.active = false;
      }
    }

    // 🔹 Фильтр по монтажнику
    if (installer) {
      whereClause = {
        ...whereClause,
        [Op.and]: [
          ...(whereClause[Op.and] || []),
          where(json("data.param17"), String(installer)),
        ],
      };
    }

    // 🔹 Фильтр по технологу
    if (technologistId) {
      whereClause = {
        ...whereClause,
        [Op.and]: [
          ...(whereClause[Op.and] || []),
          where(json("data.param7"), String(technologistId)),
        ],
      };
    }

    // 🔹 Поиск по БД до пагинации: номер заказа, адрес, клиент и id.
    if (search) {
      const like = db.sequelize.escape(`%${search}%`);
      whereClause = {
        ...whereClause,
        [Op.and]: [
          ...(whereClause[Op.and] || []),
          literal(`(
            "Order"."data"->>'order_number' ILIKE ${like} OR
            "Order"."data"->>'param5' ILIKE ${like} OR
            "Order"."data"->>'param1' ILIKE ${like} OR
            CAST("Order"."id" AS TEXT) ILIKE ${like}
          )`),
        ],
      };
    }

    const orders = await Order.findAll({
      where: whereClause,
      limit,
      offset,
      order: [
        [ literal(`(data->>'param13')::timestamp`), 'DESC' ],
        ['id', 'DESC']
      ],
      attributes: {
        include: [
          [
            fn(
              "COALESCE",
              literal(`(
                SELECT json_agg(oc.*)
                FROM "order_configs" oc
                WHERE oc."order_id" = "Order"."id"
              )`),
              literal(`'[]'::json`)
            ),
            "configs",
          ],
        ],
      },
    });


    res.json(
      orders.map((o) => {
        const plain = o.toJSON();
        const dataSafe = plain.data && typeof plain.data === "object"
          ? plain.data
          : plain.data ? JSON.parse(plain.data) : {};
        return {
          ...plain,
          order_number: plain.order_number ?? dataSafe.order_number,
          data: dataSafe,
          order_config: plain.configs,
        };
      })
    );

  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};



// Получит заказ по ID
const getOrderById = async (req, res) => {

  // console.log('Request Params:', req.params);


  try {
    const order = await Order.findByPk(req.params.id, {  });

    if (!order) {
        return res.status(404).json({ error: 'Заказ не найден' });
    }

    // console.log("Order Data:", order);


    res.status(200).json(order);
} catch (error) {
    console.error('Ошибка при получении заказа:', error);
    res.status(500).json({ error: 'Ошибка при получении заказа' });
}
};



// Создать новую задачу
const createOrder = async (req, res) => {
  try {
    const orderData = req.body; // Получаем данные из формы

    const isPlainObject =
      orderData &&
      typeof orderData === 'object' &&
      !Array.isArray(orderData);

    if (!isPlainObject || Object.keys(orderData).length === 0) {
      console.warn('[orders:create] rejected empty payload', {
        ip: req.ip,
        userAgent: req.get('user-agent') || null,
        origin: req.get('origin') || null,
        referer: req.get('referer') || null,
        contentType: req.get('content-type') || null,
      });
      return res.status(400).json({ error: 'Пустые данные заказа' });
    }

    const requiredKeys = ['param1', 'param2', 'param5'];
    const missingRequired = requiredKeys.filter((k) => {
      const value = orderData[k];
      return value == null || String(value).trim() === '';
    });

    if (missingRequired.length > 0) {
      console.warn('[orders:create] rejected missing required fields', {
        missingRequired,
        ip: req.ip,
        userAgent: req.get('user-agent') || null,
        origin: req.get('origin') || null,
        referer: req.get('referer') || null,
      });
      return res.status(400).json({
        error: `Не заполнены обязательные поля: ${missingRequired.join(', ')}`,
      });
    }

    const order = await Order.create({ data: orderData }); // Сохраняем заказ
    res.status(201).json(order); // Возвращаем созданный заказ
  } catch (error) {
    console.error('Ошибка при создании заказа:', error);
    res.status(500).json({ error: 'Ошибка при создании заказа' });
  }
};

// Обновить заказ
const updateOrder = async (req, res) => {
   // console.log('Вызывается updateOrder из orderController.js');

  try {
    const { id } = req.params;
    const { updatedData, active, comment1, comment2 } = req.body;

    // Если обновляемые данные передаются в updatedData.data,
    // то нужно выполнить слияние JSONB, чтобы не потерять поля, которые не обновлялись.
    // Например, если updatedData.data содержит только обновлённый param5.
    let mergeQuery = {};
    if (updatedData && updatedData.data) {
      // Преобразуем обновляемый объект в строку JSON.
      const newData = JSON.stringify(updatedData.data);
      // Используем Sequelize.literal, чтобы выполнить слияние JSONB: data = data || newData
      mergeQuery.data = Sequelize.literal(`data || '${newData}'`);
    }

    // Обновляем заказ: обновляем только поле data (слияние JSONB)
    await Order.update(mergeQuery, { where: { id } });


    // if (!updated) {
    //   return res.status(404).json({ message: "Order not found" });
    // }

    // Получаем обновлённый заказ
    const updatedOrder = await Order.findByPk(id);
    // console.log("Ответ сервера по updatedOrder:", updatedOrder);


    // Обновляем состояние
    await updatedOrder.update({
      active: active,
      comment1: comment1,
      comment2: comment2,
    });
    

    // Сохраняем обновлённый заказ (это обновит и статусные поля)
    await updatedOrder.save();

    res.status(200).json(updatedOrder);
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};



// Удалить задачу
const deleteOrder = async (req, res) => {
    const { id } = req.params;

    try {
        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        await order.destroy(); // Удаляем задачу из базы данных
        res.status(200).json({ message: 'Order deleted successfully' });
    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};



const createComments = async (req, res) => {
  try {
      const { comment1, comment2 } = req.body;
      const order = await Order.findByPk(req.params.id);

      if (!order) {
          return res.status(404).json({ message: "Заказ не найден" });
      }

      order.comment1 = comment1;
      order.comment2 = comment2;
      await order.save();

      res.json({ message: "Комментарии обновлены", order });
  } catch (error) {
      console.error("Ошибка при сохранении комментариев:", error);
      res.status(500).json({ message: "Ошибка сервера" });
  }
};



// Патчим дату установки
const updateOrderDateIfBusy = async (req, res) => {
  try {
    const { orderId, param15Date, installerId } = req.body;

    if (!param15Date || !installerId || !orderId) {
      return res.status(400).json({ message: 'orderId, param15Date и installerId обязательны' });
    }

    // console.log(`orderId=${orderId}, installerId=${installerId}, param15Date=${param15Date}`)

    // Получаем все активные заказы (кроме текущего)
    const allOrders = await Order.findAll({
      where: { active: true }
    });

    const installerOrders = allOrders.filter(o =>
      String(o.data?.param17) === String(installerId) &&
      o.id !== orderId
    );

    let newDate = new Date(param15Date);

    // Загружаем список праздников/выходных
    const holidayRows = await HolidayConfig.findAll({
      where: { isHoliday: true }
    });
    const holidayDates = holidayRows.map(h => h.date); // YYYY-MM-DD
        
    let dateChanged = false;

    // Проверяем пересечения с существующими заказами
    for (const order of installerOrders) {
      // Диапазон по сборке
      const sborkaStart = order.data?.sborkaDate ? new Date(order.data.sborkaDate) : null;
      const sborkaEnd = order.data?.sborkaEndDate ? new Date(order.data.sborkaEndDate) : null;

      // Диапазон по установке
      const installStart = order.data?.param15 ? new Date(order.data.param15) : null;
      const installEnd = order.data?.endDate ? new Date(order.data.endDate) : null;

      const ranges = [
        { start: sborkaStart, end: sborkaEnd, label: 'сборка' },
        { start: installStart, end: installEnd, label: 'установка' }
      ];

      for (const { start, end } of ranges) {
        if (start && end && newDate >= start && newDate <= end) {
          // console.log(`⛔ Пересечение с ${label}: ${start.toISOString()} — ${end.toISOString()}`);

          // Сдвигаем на день после конца периода
          newDate = new Date(end);
          newDate.setDate(newDate.getDate() + 1);
          dateChanged = true;

          // Проверка на выходной/праздник
          while (holidayDates.includes(newDate.toISOString().split('T')[0])) {
            newDate.setDate(newDate.getDate() + 1);
          }

          // Начинаем проверку заново, чтобы учесть новый newDate
          break;
        }
      }
    }

    let order = await Order.findByPk(orderId);

    if (!order) {
      return res.status(404).json({ message: "Заказ не найден" });
    }


    // Если дата изменилась — сохраняем в заказ
    if (dateChanged) {
      // console.log(`Дата установки изменена на ${newDate.toISOString().split('T')[0]}`);

      const correctEndDate = calculateEndDate(newDate, Number(order.data.param16), order.data.workOnWeekendConfig, holidayDates);

      const updatedData = {
        ...order.data,
        param15: newDate.toISOString().split('T')[0],
        endDate: correctEndDate
      };
      order.data = updatedData; // меняем ссылку на объект
      await order.save();
      return res.json(order.toJSON());
    }

    // Если дата не изменилась — возвращаем текущий заказ (чтобы фронт получил id и данные)
    return res.json(order.toJSON());

  } catch (err) {
    console.error('Ошибка в updateInstallerDate:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
}



// Заказы для CRM
/**
 * GET /ordersforcrm
 * Возвращает все активные заказы, помечая, есть ли для них активная консультация.
 * Returns all active orders, marking whether they have an active consultation.
 */
const getAllOrdersForCrm = async (req, res) => {
  try {
    const debugConsultId = Number(req.query.debugConsultId || 0);
    // 1) Загружаем активные заказы
    // 1) Load active orders
    const activeOrders = await Order.findAll({
      where: { active: true },
      order: [['id', 'DESC']],
      raw: true,
    });

    if (!activeOrders || activeOrders.length === 0) {
      return res.json({ total: 0, orders: [] });
    }

    // 2) Загружаем активные консультации
    // 2) Load active consultation records
    const activeRecords = await Record.findAll({
      where: { active: true },
      raw: true,
    });

    // 3) Формируем Set телефонов, по которым уже есть консультации
    // 3) Build a Set of phones that already have consultations
    const phonesSet = new Set();
    for (const r of activeRecords) {
      const recPhone = normalizePhone(
        r.clientPhone
      );
      if (recPhone) phonesSet.add(recPhone);
    }

    // 4) Оставляем заказы, телефон которых НЕ найден среди консультаций
    // 4) Keep orders whose phones are NOT found among consultations
    const ordersWithoutConsultations = activeOrders.filter(o => {
      const d = o.data || {};
      const orderPhone = normalizePhone(
        d.param2
      );
      // Если телефона нет — считаем, что консультации нет
      // If phone is missing — treat as no consultation
      if (!orderPhone) return true;
      // Если телефона нет в Set — консультации нет
      // If phone not in Set — no consultation
      return !phonesSet.has(orderPhone);
    });

    // 5) Формируем результат по заказам без консультаций
    // 5) Build result for orders without consultations
    const ordersErrors = ordersWithoutConsultations.map(o => {
      const d = o.data || {};
      return {
        type: 'order_without_consult',
        id: o.id,
        clientName: d.param1 || d.clientName || null,
        clientPhone: d.param2 || d.clientPhone || null,
        address: d.param5 || d.address || null,
        product: d.param9 || null,
        data: o.data,
        comment1: o.comment1,
        comment2: o.comment2,
      };
    });

    // 6) Ошибки "Заказ принят без звонков" теперь берём только из БД.
    let consultErrors = [];
    const normalizeText = (v) =>
      String(v || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const acceptedStatuses = await StatusColorCRM.findAll({ raw: true });
    const acceptedStatusIds = new Set(
      acceptedStatuses
        .filter((s) => String(s?.key || '') === 'orderOffered' || (normalizeText(s?.label).includes('заказ') && normalizeText(s?.label).includes('принят')))
        .map((s) => Number(s.id))
        .filter(Number.isFinite)
    );

    if (acceptedStatusIds.size > 0) {
      const markedRecords = await Record.findAll({
        where: {
          statusId: { [Op.in]: Array.from(acceptedStatusIds) },
          active: true,
          noCallsAtOrderAccepted: true,
        },
        raw: true,
      });

      consultErrors = markedRecords.map((rec) => ({
        type: 'accepted_without_calls',
        id: rec.id,
        consultId: rec.id,
        active: rec.active === true,
        clientPhone: rec.clientPhone || null,
        address: rec.address || rec?.newParams?.param5 || null,
        product: rec.serviceRequired || rec?.newParams?.param9 || null,
      }));
    }

    const allErrors = [...ordersErrors, ...consultErrors];

    const debugPayload = (() => {
      if (!Number.isFinite(debugConsultId) || debugConsultId <= 0) return undefined;
      const rec = activeRecords.find((r) => Number(r.id) === debugConsultId) || null;
      const consultErr = consultErrors.find((e) => Number(e.consultId) === debugConsultId) || null;
      return {
        consultId: debugConsultId,
        inConsultErrors: Boolean(consultErr),
        consultError: consultErr,
        record: rec ? {
          id: rec.id,
          active: rec.active,
          statusId: rec.statusId,
          clientPhone: rec.clientPhone || null,
          address: rec.address || rec?.newParams?.param5 || null,
          product: rec.serviceRequired || rec?.newParams?.param9 || null,
          noCallsAtOrderAccepted: rec.noCallsAtOrderAccepted === true,
        } : null,
      };
    })();

    return res.json({
      total: allErrors.length,
      orders: ordersErrors,
      consultErrors,
      errors: allErrors,
      meta: {
        scannedOrders: activeOrders.length,
        scannedRecords: activeRecords.length,
        note: 'Includes: orders without consultations + accepted consultations without calls.',
      },
      ...(debugPayload ? { debug: debugPayload } : {}),
    });
  } catch (error) {
    console.error('getAllOrdersForCrm error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: String(error),
    });
  }
};

// POST /api/orders/:id/archive-linked-consult
// Архивирует связанную консультацию (Record.active=false), если у заказа заполнены
// оба статуса: statusData.orderInstalled и statusData.orderPaid.
const archiveLinkedConsultByOrder = async (req, res) => {
  try {
    const toLast10 = (input) => {
      const digits = String(input || '').replace(/\D/g, '');
      if (!digits) return '';
      return digits.slice(-10);
    };

    const orderId = Number(req.params.id);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      return res.status(400).json({ ok: false, message: 'Некорректный id заказа' });
    }

    const order = await Order.findByPk(orderId, { raw: true });
    if (!order) {
      return res.status(404).json({ ok: false, message: 'Заказ не найден' });
    }

    const statusData = order?.data?.statusData || {};
    const readyInstalled = Boolean(statusData?.orderInstalled);
    const readyPaid = Boolean(statusData?.orderPaid);
    if (!readyInstalled || !readyPaid) {
      return res.json({
        ok: true,
        archived: false,
        skipped: 'statuses-not-ready',
      });
    }

    const orderPhoneRaw =
      String(order?.data?.param2 || '').trim() ||
      String(order?.data?.param4 || '').trim() ||
      '';
    const orderPhone = toLast10(orderPhoneRaw);
    if (!orderPhone) {
      return res.json({
        ok: true,
        archived: false,
        skipped: 'phone-missing',
      });
    }

    const activeRecords = await Record.findAll({
      where: { active: true },
      attributes: ['id', 'clientPhone', 'active'],
      raw: true,
      order: [['id', 'DESC']],
    });

    const target = (activeRecords || []).find((rec) => {
      const recPhone = toLast10(rec?.clientPhone);
      return recPhone && recPhone === orderPhone;
    });

    if (!target?.id) {
      return res.json({
        ok: true,
        archived: false,
        skipped: 'consult-not-found',
      });
    }

    await Record.update(
      { active: false },
      { where: { id: Number(target.id) } }
    );

    return res.json({
      ok: true,
      archived: true,
      consultId: Number(target.id),
    });
  } catch (error) {
    console.error('archiveLinkedConsultByOrder error:', error);
    return res.status(500).json({
      ok: false,
      message: 'Ошибка при архивировании консультации',
    });
  }
};

 


// Функция вычисления конечной даты заказа с учетом выходных дней
function calculateEndDate(
  startDateStr,
  workingDays,
  workOnWeekendConfig = { holiday: false, saturday: false, sunday: false },
  holidays = []
) {
  if (!startDateStr) {
    throw new Error("Дата начала отсутствует!");
  }

  const startDate = new Date(startDateStr);
  if (isNaN(startDate.getTime())) {
    throw new Error("Неверная дата начала: " + startDateStr);
  }

  let daysCounted = 0;
  let currentDate = new Date(startDate);

  // console.log("🚀 Начало расчёта с даты:", currentDate.toISOString());
  // console.log("🚀 Нужно рабочих дней:", workingDays);
  // console.log("🚀 Конфигурация выходных:", workOnWeekendConfig);

  while (daysCounted < workingDays) {
    const currentDateStr = currentDate.toISOString().split("T")[0];
    const dayOfWeek = currentDate.getDay(); // 0 - вс, 6 - сб
    let isWorkingDay = true;
    // let reason = "рабочий по умолчанию";

    // --- 1. Проверка субботы/воскресенья ---
    if (dayOfWeek === 6 && !workOnWeekendConfig.saturday) {
      isWorkingDay = false;
      // reason = "суббота (выходной)";
    }
    if (dayOfWeek === 0 && !workOnWeekendConfig.sunday) {
      isWorkingDay = false;
      // reason = "воскресенье (выходной)";
    }

    // --- 2. Проверка праздников ---
    if (holidays.includes(currentDateStr)) {
      // Если суббота и она рабочая — оставляем рабочей
      if (dayOfWeek === 6 && workOnWeekendConfig.saturday) {
        isWorkingDay = true;
        // reason = "суббота в праздниках, но рабочая";
      }
      // Если воскресенье и оно рабочее — оставляем рабочим
      else if (dayOfWeek === 0 && workOnWeekendConfig.sunday) {
        isWorkingDay = true;
        // reason = "воскресенье в праздниках, но рабочее";
      }
      // Обычный праздник
      else {
        isWorkingDay = false;
        // reason = "праздник";
      }
    }

    // --- 3. Спец-правило: holiday = true (работает всегда)
    if (workOnWeekendConfig.holiday === true) {
      isWorkingDay = true;
      // reason = "работа в любые выходные/праздники";
    }

    // Логируем
    // console.log(`${currentDateStr}: ${isWorkingDay ? "✅" : "❌"} (${reason})`);

    // Если это рабочий день, увеличиваем счётчик
    if (isWorkingDay) {
      daysCounted++;
    }

    // Если ещё не достигли нужного числа рабочих дней — идём дальше
    if (daysCounted < workingDays) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  // console.log("🎯 Конечная дата:", currentDate.toISOString());
  return currentDate.toISOString();
}


// Нормализуем телефон: оставляем только цифры (можно добавить обрезание к коду страны при необходимости).
// Normalize phone: keep digits only (you can add country code heuristics if needed).
function normalizePhone(input) {
  const digitsOnly = input.replace(/\D/g, '');

  if (digitsOnly.length === 11) {
    return digitsOnly.slice(1)
  }

  // В остальных случаях вернем как есть (или null по вкусу)
  return digitsOnly;
}





module.exports = { 
    getAllOrders, 
    getOrderById, 
    createOrder, 
    updateOrder, 
    deleteOrder,
    getAllOrdersForCrm,
    archiveLinkedConsultByOrder,
    createComments,
    updateOrderDateIfBusy,
    getAllOrdersForOrders  
};
