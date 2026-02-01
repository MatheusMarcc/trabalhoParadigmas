FROM node:25.2.1-alpine

WORKDIR /home/node/app

COPY ./app/package.json ./app/package-lock.json* ./

RUN npm install

COPY ./app .

EXPOSE 3000

# Usa nodemon para hot-reload automático quando arquivos mudam
# nodemon monitora mudanças e reinicia o servidor automaticamente
CMD ["npx", "nodemon", "indice.js", "--watch", ".", "--ext", "js,ejs"]