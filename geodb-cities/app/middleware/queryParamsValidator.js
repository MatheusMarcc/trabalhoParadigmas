const queryParamsValidator = (requisicao, resposta, proximo) => {
  const { limit, offset, sort } = requisicao.query;

  if (limit !== undefined) {
    const limiteNum = parseInt(limit, 10);
    if (isNaN(limiteNum) || limiteNum < 1 || limiteNum > 10) {
      return resposta.status(400).json({
        error: {
          message: "Parameter 'limit' must be a number between 1 and 10 (plan limit)",
          status: 400,
        },
      });
    }
    requisicao.query.limit = limiteNum;
  }

  if (offset !== undefined) {
    const deslocamentoNum = parseInt(offset, 10);
    if (isNaN(deslocamentoNum) || deslocamentoNum < 0) {
      return resposta.status(400).json({
        error: {
          message: "Parameter 'offset' must be a non-negative number",
          status: 400,
        },
      });
    }
    requisicao.query.offset = deslocamentoNum;
  }

  const camposOrdenacaoPermitidos = ["name", "population", "elevationMeters", "timezone"];
  if (sort !== undefined && !camposOrdenacaoPermitidos.includes(sort)) {
    return resposta.status(400).json({
      error: {
        message: `Parameter 'sort' must be one of: ${camposOrdenacaoPermitidos.join(", ")}`,
        status: 400,
      },
    });
  }

  proximo();
};

module.exports = queryParamsValidator;
