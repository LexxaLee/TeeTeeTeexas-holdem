FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY deploy/package.json ./
RUN npm install --production

# Copy source files
COPY deploy/server.js ./deploy/server.js
COPY deploy/public/ ./deploy/public/
COPY src/ ./src/

EXPOSE 8080

CMD ["node", "deploy/server.js"]
