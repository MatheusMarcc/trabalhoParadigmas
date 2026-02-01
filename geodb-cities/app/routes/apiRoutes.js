const express = require("express");
const ApiCidadeController = require("../controllers/ApiCidadeController");
const queryParamsValidator = require("../middleware/queryParamsValidator");

const roteador = express.Router();

roteador.get("/api/cities", queryParamsValidator, ApiCidadeController.mostrar);

roteador.get("/api/health", (requisicao, resposta) => {
  resposta.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

module.exports = roteador;
