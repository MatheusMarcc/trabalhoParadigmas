const errorHandler = (erro, requisicao, resposta, proximo) => {
  if (resposta.headersSent) {
    return proximo(erro);
  }

  const status = erro.status || erro.statusCode || 500;
  const mensagem = erro.message || "Internal Server Error";

  console.error(`[ERROR] ${status} - ${mensagem}`, {
    path: requisicao.path,
    method: requisicao.method,
    query: requisicao.query,
    error: process.env.NODE_ENV === "development" ? erro.stack : undefined,
  });

  resposta.status(status).json({
    error: {
      message: mensagem,
      status,
      ...(process.env.NODE_ENV === "development" && { stack: erro.stack }),
    },
  });
};

module.exports = errorHandler;
