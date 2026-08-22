# backend/Dockerfile
FROM node:20

WORKDIR /app

# Копируем package.json и package-lock.json (если есть) для установки зависимостей
COPY package*.json ./
RUN npm install

# Копируем исходный код
COPY . .

# Открываем порт, на котором работает бэкенд
EXPOSE 5000

# Запускаем сервер
CMD [ "node", "server.js" ]
