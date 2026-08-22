const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

// Запускаем скрипт cleanup-old-voice-messages.js каждую ночь в 05:00
cron.schedule('0 22 * * *', () => {
  //console.log('Запуск ежедневной очистки старых голосовых сообщений:', new Date().toISOString());
  const cleanupScript = path.resolve('/home/nodeapp/crm-backend/workers/cleanup-old-voice-messages.js');
  // запускаем через spawn, чтобы не блокировать основной процесс
  if (!fs.existsSync(cleanupScript)) {
    console.error('cleanup script not found at', cleanupScript);
    } else {
    //console.log('cleanup script path:', cleanupScript);
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, [cleanupScript], { stdio: 'inherit', env: process.env });

    //console.log('spawned child pid=', child.pid);
    child.on('close', code => console.log('cleanup script cleanup-old-voice-messages finished with code', code));
    }
});