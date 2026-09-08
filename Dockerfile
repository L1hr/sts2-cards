FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY . .

# Koyeb 默认通过 PORT 环境变量注入端口（默认 8000）
EXPOSE 8000

CMD ["node", "server.js"]
