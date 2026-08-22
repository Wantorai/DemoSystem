# frontend/Dockerfile
FROM node:20

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./
RUN npm install

# Копируем исходный код
COPY . .

# Открываем порт для фронтенда
EXPOSE 3000

# Запускаем приложение в режиме разработки
CMD [ "npm", "run", "dev" ]
