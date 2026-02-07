FROM node:25.2.1-alpine

WORKDIR /home/node/app

# Copia apenas arquivos de dependências primeiro (para melhor cache do Docker)
COPY ./app/package.json ./app/package-lock.json* ./

# Instala todas as dependências (incluindo devDependencies para nodemon)
RUN npm install --no-audit --no-fund && \
    npm cache clean --force

# Copia o restante da aplicação (exceto node_modules que já foi instalado)
COPY ./app .

# Torna o healthcheck executável
RUN chmod +x healthcheck.js || true

# Garante permissões corretas
RUN chown -R node:node /home/node/app

EXPOSE 3000

# Usa nodemon para hot-reload automático quando arquivos mudam
# nodemon monitora mudanças e reinicia o servidor automaticamente
CMD ["npx", "nodemon", "indice.js", "--watch", ".", "--ext", "js,ejs"]