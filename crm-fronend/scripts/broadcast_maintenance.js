// scripts/broadcast_maintenance.js

const { io } = require('socket.io-client');

const socket = io('http://localhost:5000', {
  transports: ['websocket'],
});

socket.on('connect', async () => {
  //console.log('✅ Соединение установлено. Рассылаем предупреждение...');

  for (let i = 10; i >= 0; i--) {
    socket.emit('maintenance:warning', { secondsLeft: i });
    process.stdout.write(`⏳ ${i} сек осталось...\n`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  //console.log('✅ Готово! Можно включать maintenance.');
  socket.disconnect();
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.error('❌ Не удалось подключиться к серверу:', err.message);
  process.exit(1);
});
