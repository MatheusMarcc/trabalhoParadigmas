const { buscarDadosCidadesApi } = require("../services/CidadeService");

const mostrar = async (requisicao, resposta) => {
  try {
    const opcoes = requisicao.query;
    const dados = await buscarDadosCidadesApi(opcoes);
    resposta.json(dados);
  } catch (erro) {
    const status = erro.status || erro.statusCode || 500;

    console.error(`[City API Controller Error] ${status}`, {
      path: requisicao.path,
      query: requisicao.query,
      errorMessage: erro.message,
      errorStatus: erro.status,
      apiError: erro.apiError,
    });

    resposta.status(status).json({
      error: erro.message || "Internal Server Error",
      ...(erro.apiError && { details: erro.apiError }),
    });
  }
};

module.exports = {
  mostrar,
};
