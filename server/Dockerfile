FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY public ./public
COPY shared ./shared
COPY server ./server
RUN mkdir -p /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=4173 WORKLENS_DATABASE=/data/worklens.db
EXPOSE 4173
VOLUME /data
CMD ["node", "server/index.mjs"]
