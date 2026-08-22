const axios = require('axios');
const { loadTokensFromDB, saveTokensToDB } = require('./services/tokenStorage');


class Tele2Api {

  /**
   * Конструктор принимает исходные токены. Если их нет, можно передать null.
   * @param {string} accessToken – начальный access token
   * @param {string} refreshToken – refresh token для обновления access token
   */
  constructor(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.baseURL = 'https://ats2.t2.ru/crm/openapi';

    // Создаем экземпляр axios с базовыми настройками
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 180000 // можно настроить таймаут
    });

    // Интерсептор для автоматического добавления заголовка Authorization
    this.client.interceptors.request.use(config => {
      config.headers['Authorization'] = this.accessToken;
      return config;
    }, error => Promise.reject(error));

    // Инициализация блокировок обновления токена
    this._isRefreshing = false;
    this._refreshPromise = null;
  }

  /**
   * Метод инициализации. Загружает токены из базы и устанавливает их.
   */
  async init() {
    try {
      const { accessToken, refreshToken } = await loadTokensFromDB();
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      // Устанавливаем актуальный токен в заголовки клиента
      this.client.defaults.headers['Authorization'] = this.accessToken;
      //console.log('Токены успешно загружены из БД.');
    } catch (err) {
      console.error('Ошибка загрузки токенов из БД:', err.message);
      throw err;
    }
  }


  /**
   * Метод для обновления Access Token
   * Отправляем запрос на эндпоинт refresh token:
   * PUT https://ats2.t2.ru/crm/openapi/authorization/refresh/token
   */
  async refreshAccessToken() {
    try {
      //console.log('Попытка обновить access token...');
      const response = await axios.put(`${this.baseURL}/authorization/refresh/token`, null, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': this.refreshToken
        }
      });
  
      if (response.data && response.data.accessToken) {
        this.accessToken = response.data.accessToken;
        this.refreshToken = response.data.refreshToken || this.refreshToken;
        this.client.defaults.headers['Authorization'] = this.accessToken;
        await saveTokensToDB(this.accessToken, this.refreshToken);
        //console.log('Access token успешно обновлён.');
        return this.accessToken;
      } else {
        throw new Error('Не удалось получить access token после обновления.');
      }
    } catch (error) {
      if (error.response) {
        console.error('❌ Ошибка HTTP:', error.response.status);
        console.error('📄 Сообщение:', error.response.data.message);
        console.error('📋 Детали:', error.response.data.details);
      } else if (error.request) {
        console.error('❌ Ошибка запроса (нет ответа):', error.request);
      } else {
        console.error('❌ Ошибка:', error.message);
      }
      throw error; // можно выбросить дальше, если нужно
    }
  }



/**
   * Универсальный метод для выполнения GET-запросов с автоматическим обновлением токена.
   * @param {string} endpoint – URL эндпоинта.
   * @param {object} [params] – параметры запроса.
   */
    async getRequest(endpoint, params = {}) {
      try {
        const response = await this.client.get(endpoint, { params });
        return response.data;
      } catch (error) {
        if (error.response && error.response.status === 403) {
          console.warn('Access token истёк. Обновляем токен...');
          // Если процесс обновления уже идет, ждём его завершения
          if (this._isRefreshing) {
            await this._refreshPromise;
          } else {
            this._isRefreshing = true;
            this._refreshPromise = this.refreshAccessToken();
            await this._refreshPromise;
            this._isRefreshing = false;
          }
          this.client.defaults.headers['Authorization'] = this.accessToken;
          // Повторяем запрос
          const retryResponse = await this.client.get(endpoint, { params });
          return retryResponse.data;
        } else {
          throw error;
        }
      }
    }  


  /**
   * Метод для получения статистики звонков за период.
   * @param {Date} startDate – дата начала периода.
   * @param {Date} endDate – дата окончания периода.
   * @param {string} phone – номер телефона.
   * @returns {Promise<object>} – данные статистики звонков.
   */
  async getCallStatistics(startDate, endDate, phone) {
    // Преобразуем даты в ISO формат, который ожидается API
    // Пример: 2022-07-24T10:15:30+03:00
    const start = startDate.toISOString();
    const end = endDate.toISOString();
    const number = phone

    const params = {
      start,
      end,
      number
    };

    // Выполняем GET-запрос к /statistics/common с параметрами
    return await this.getRequest('/statistics/journal', params);
  }

  /**
   * Удобный метод для получения статистики звонков за последние три дня.
   */
  async getStatisticsLastThreeDays() {
    const endDate = new Date();
    // Начало периода: 3 дня назад
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 3);

    return await this.getCallStatistics(startDate, endDate);
  }


  /**
   * Пример метода для получения информации о текущих звонках
   * Если приходит ошибка авторизации (например, истёк токен), происходит попытка обновления токена и повтор запроса.
   */
  async getCurrentCalls() {
    try {
      const response = await this.client.get('/monitoring/calls');
        if (!response.data) {
            throw new Error('Ответ от API не содержит данных.');
        }
      return response.data;
    } catch (error) {
      // Если ошибка связана с авторизацией, пробуем обновить токен
      if (error.response && error.response.status === 403) {
        console.warn('Access token истёк. Обновляем токен...');
        await this.refreshAccessToken();
        // Обновляем заголовок в клиенте
        this.client.defaults.headers['Authorization'] = this.accessToken;
        // Пытаемся повторно выполнить запрос
        const retryResponse = await this.client.get('/monitoring/calls');
        return retryResponse.data;
      } else {
        // Если ошибка не связана с авторизацией, пробрасываем её выше
        throw error;
      }
    }
  }



  /**
   * Метод для получения списка записей разговоров.
 * @param {string} start – начальная дата (ISO формат).
 * @param {string} end – конечная дата (ISO формат).
 * @param {object} [options] – дополнительные опциональные параметры: { callee, caller, is_recorded }.
 * @returns {Promise<object[]>} – список записей разговоров.
 */
  async getCallRecords(start, end, options = {}) {
    // Формируем параметры запроса
    const params = { start, end, ...options };
    return await this.getRequest('/call-records/info', params);
  }



  async getEmployeeIds() {
    return await this.getRequest('/employees');
  }



  /**
     * Совершает исходящий вызов через Tele2 API.
     *
     * @param {string} destination - Номер телефона клиента.
     * @param {string} source - Номер телефона сотрудника.
     * @returns {Promise<object>} - Результат запроса в виде JSON.
     */
  async callOutgoing(destination, source) {
    const endpoint = '/call/outgoing';

    try {
      const response = await this.client.post(endpoint, null, {
        params: {
          destination: destination,
          source: source,
          callType: 'CRM_OUTGOING'
        },
        headers: {
          Authorization: this.accessToken
        }
      });
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 403) {
        console.warn('Access token истёк. Обновляем токен...');
        if (this._isRefreshing) {
          await this._refreshPromise;
        } else {
          this._isRefreshing = true;
          this._refreshPromise = this.refreshAccessToken();
          await this._refreshPromise;
          this._isRefreshing = false;
        }
        try {
          // Повторный запрос после обновления токена
          const retryResponse = await this.client.post(endpoint, null, {
            params: {
              destination: destination,
              source: source,
              callType: 'CRM_OUTGOING'
            },
            headers: {
              Authorization: this.accessToken
            }
          });
          return retryResponse.data;
        } catch (retryError) {
          console.error('Ошибка при повторном вызове:', retryError.message);
          throw retryError;
        }
      } else {
        console.error('Ошибка при вызове callOutgoing:', error.message);
        throw error;
      }
    }
  }




  async fetchRecordingFile(filename) {
    
    const endpoint = '/call-records/file';

    try {
      
      const response = await this.client.get(endpoint, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          Authorization: this.accessToken,
          Accept: 'application/octet-stream',
        },
        params: {
          filename: filename
        }
      });
  
      return Buffer.from(response.data, 'binary');
    } catch (error) {

      if (error.response && error.response.status === 403) {
        console.warn('Access token истёк. Обновляем токен...');
  
        if (this._isRefreshing) {
          await this._refreshPromise;
        } else {
          this._isRefreshing = true;
          this._refreshPromise = this.refreshAccessToken();
          await this._refreshPromise;
          this._isRefreshing = false;
        }
  
        try {
          const retryResponse = await this.client.get(endpoint, {
            responseType: 'arraybuffer',
            headers: {
              Authorization: this.accessToken,
              Accept: 'application/octet-stream',
            },
            params: {
              filename: filename
            }
          });
          return Buffer.from(retryResponse.data, 'binary');
        } catch (retryError) {
          console.error('Ошибка при повторной попытке загрузки файла:', retryError.message);
          return null;
        }
  
      } else {
        console.error('Ошибка при получении записи:', error.message);
        return null;
      }
    }
  }
  
  

}

module.exports = Tele2Api;
