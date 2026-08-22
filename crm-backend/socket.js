// socket.js
const { Server: IOServer } = require('socket.io');

let io = null;

/**
 * Инициализация Socket.IO — вызывается один раз из server.js
 * @param {http.Server} serverNode — HTTP-сервер
 * @param {Object} options — конфиг CORS, transports и т.д.
 * @returns {import('socket.io').Server}
 */
function init(serverNode, options) {
  io = new IOServer(serverNode, options);
  return io;
}

/**
 * Получить уже инициализированный io.
 * Если вызывать до init — бросит ошибку.
 */
function getIO() {
  if (!io) {
    throw new Error('Socket.IO ещё не инициализирован. Сначала вызовите init().');
  }
  return io;
}

module.exports = { init, getIO };
