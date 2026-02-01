const indice = async (requisicao, resposta, proximo) => {
  try {
    resposta.render("indice");
  } catch (erro) {
    proximo(erro);
  }
};

module.exports = {
  indice,
};
