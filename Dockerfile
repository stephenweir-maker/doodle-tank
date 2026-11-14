FROM node:20-alpine
WORKDIR /app
COPY index.html ./
COPY server ./server
ENV PORT=8080 DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8080
USER node
CMD ["node", "server/server.js"]
