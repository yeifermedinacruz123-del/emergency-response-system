# ---- Imagen del backend del Emergency Response System ----
FROM node:20-alpine

ENV NODE_ENV=production
ENV TZ=America/Bogota

WORKDIR /app

# Instalar dependencias primero para aprovechar la cache de capas
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar el codigo fuente
COPY . .

RUN mkdir -p uploads/emergencies logs

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
