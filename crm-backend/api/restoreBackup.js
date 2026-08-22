// api/restoreBackup.js

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const execAsync = promisify(exec);



async function createBackup(req, res) {
  try {
    const { fileName } = req.body;
    const sanitizedFileName = fileName && /^[a-zA-Z0-9_\-]+$/.test(fileName) ? fileName : "";

    const command = sanitizedFileName
      ? `/usr/local/bin/backup_pgsql.sh ${sanitizedFileName}`
      : `/usr/local/bin/backup_pgsql.sh`;

    //console.log("Executing command:", command);

    // Выполняем команду асинхронно
    const { stdout, stderr } = await execAsync(command);

    return res.status(200).json({
      message: 'Бэкап успешно создан',
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });
  } catch (error) {
    console.error("Ошибка создания бэкапа:", error);
    const errorMessage = error.message || error.toString() || "Unknown error";
    return res.status(500).json({ error: errorMessage });
  }
}


async function createTemplateBackup(req, res) {
  try {
    const { fileName } = req.body;
    const sanitizedFileName = fileName && /^[a-zA-Z0-9_\-]+$/.test(fileName) ? fileName : "";

    const command = sanitizedFileName
      ? `/usr/local/bin/backup_template_pgsql.sh ${sanitizedFileName}`
      : `/usr/local/bin/backup_template_pgsql.sh`;

    // console.log("Executing command:", command);

    // Выполняем команду асинхронно
    const { stdout, stderr } = await execAsync(command);

    return res.status(200).json({
      message: 'Бэкап шаблон успешно создан',
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });
  } catch (error) {
    console.error("Ошибка создания бэкапа:", error);
    const errorMessage = error.message || error.toString() || "Unknown error";
    return res.status(500).json({ error: errorMessage });
  }
}



function restoreBackup(req, res) {
  try {
    const { fileName } = req.body;
    
    if (!fileName || !/^[\w.\-]+$/.test(fileName)) {
      return res.status(400).json({ error: 'Invalid file name' });
    }
    
    const backupsDir = '/var/backups/postgresql';
    const backupPath = path.join(backupsDir, fileName);
    
    // Получаем пароль из переменных окружения
    const dbPassword = process.env.DB_PASSWORD;
    
    // Формируем команду восстановления без вставки переменной в строку
    const command = `gunzip -c ${backupPath} | psql -U crm_user -d crm`;
    // Для Windows локально!
    // const command = `gzip.exe -dc ${backupPath} | psql -U crm_user -d crm`;

    // console.log("Executing command:", command);

    
    // Передаем переменную окружения PGPASSWORD через опцию env
    exec(command, { env: { ...process.env, PGPASSWORD: dbPassword } }, (error, stdout, stderr) => {
      if (error) {
        console.error("Ошибка восстановления:", stderr);
        return res.status(500).json({ error: stderr });
      }
      return res.json({ message: 'Restore successful', output: stdout });
    });
  } catch (err) {
    return res.status(400).json({ error: 'Invalid request data' });
  }
}


function restoreTemplate(req, res) {
  try {
    const { fileName } = req.body;
    
    if (!fileName || !/^[\w.\-]+$/.test(fileName)) {
      return res.status(400).json({ error: 'Invalid file name' });
    }
    
    const backupsDir = '/var/backups/templates';
    const backupPath = path.join(backupsDir, fileName);
    
    // Получаем пароль из переменных окружения
    const dbPassword = process.env.DB_PASSWORD;
    
    // Формируем команду восстановления без вставки переменной в строку
    const command = `gunzip -c ${backupPath} | psql -U crm_user -d crm`;

    // console.log("Executing command:", command);

    
    // Передаем переменную окружения PGPASSWORD через опцию env
    exec(command, { env: { ...process.env, PGPASSWORD: dbPassword } }, (error, stdout, stderr) => {
      if (error) {
        console.error("Ошибка восстановления:", stderr);
        return res.status(500).json({ error: stderr });
      }
      return res.json({ message: 'Restore successful', output: stdout });
    });
  } catch (err) {
    return res.status(400).json({ error: 'Invalid request data' });
  }
}


function getBackups(req, res) {
  const backupsDir = '/home/nodeapp/backups/postgresql';

  let files = [];
  try {
    files = fs.readdirSync(backupsDir);
  } catch (error) {
    console.error("Ошибка чтения директории бэкапов:", error);
    return res.status(500).json({ error: 'Ошибка чтения директории бэкапов' });
  }

  const backupFiles = files
    // .filter(file => file.endsWith('.sql.gz'))
    .map(file => {
      const filePath = path.join(backupsDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        createdAt: stats.birthtime,
      };
    });

  res.status(200).json(backupFiles);
}



function getTemplates(req, res) {
  const backupsDir = '/home/nodeapp/backups/templates';

  let files = [];
  try {
    files = fs.readdirSync(backupsDir);
  } catch (error) {
    console.error("Ошибка чтения директории шаблонов бэкапов:", error);
    return res.status(500).json({ error: 'Ошибка чтения директории шаблонов бэкапов' });
  }

  const backupFiles = files
    .filter(file => file.endsWith('.sql.gz'))
    .map(file => {
      const filePath = path.join(backupsDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        createdAt: stats.birthtime,
      };
    });

  res.status(200).json(backupFiles);
}





module.exports = { restoreBackup, restoreTemplate, getBackups, createBackup, createTemplateBackup, getTemplates };


