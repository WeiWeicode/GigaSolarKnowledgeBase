FROM node:20-alpine

WORKDIR /app

# 先複製 package 清單，利用 Docker layer cache
COPY package*.json ./
RUN npm ci --omit=dev

# 複製原始碼
COPY src ./src

# 確保上傳目錄存在（實際檔案由 volume 掛載）
RUN mkdir -p uploads

EXPOSE 5155

CMD ["node", "src/index.js"]
