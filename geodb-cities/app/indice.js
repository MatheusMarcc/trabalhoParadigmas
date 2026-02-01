const caminho = require("node:path");
require("dotenv").config({ path: caminho.join(__dirname, "..", ".env") });
const express = require("express");
const webRoutes = require("./routes/webRoutes");
const apiRoutes = require("./routes/apiRoutes");
const errorHandler = require("./middleware/errorHandler");
const { validarAmbiente } = require("./util/validadorAmbiente");

try {
  validarAmbiente();
} catch (erro) {
  console.error("Environment validation failed:", erro.message);
  process.exit(1);
}

const aplicacao = express();

aplicacao.set("view engine", "ejs");
aplicacao.set("views", caminho.join(__dirname, "views"));

aplicacao.use(express.urlencoded({ extended: true }));

aplicacao.use((requisicao, resposta, proximo) => {
  resposta.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  resposta.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  proximo();
});

aplicacao.use(express.static(caminho.join(__dirname, "public"), {
  etag: true,
  lastModified: true,
  setHeaders: (resposta, caminhoArquivo) => {
    if (caminhoArquivo.endsWith('.js')) {
      resposta.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      resposta.setHeader('Cache-Control', 'no-cache, must-revalidate');
      resposta.setHeader('Pragma', 'no-cache');
    }
  }
}));

aplicacao.use(webRoutes);
aplicacao.use(apiRoutes);
aplicacao.use(errorHandler);

const porta = process.env.PORT || 3000;

aplicacao.listen(porta, () => {
  console.log(`Server is running on port ${porta}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Access: http://localhost:${porta}`);
});
