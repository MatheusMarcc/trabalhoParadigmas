const express = require("express");
const CidadeController = require("../controllers/CidadeController");

const roteador = express.Router();

roteador.get("/geo/cities", CidadeController.indice);

module.exports = roteador;
