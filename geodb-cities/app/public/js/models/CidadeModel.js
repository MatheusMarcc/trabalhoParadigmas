const criarEstado = (pagina = 0, limite = 10, ordenacao = "name") => ({
  page: pagina,
  limit: limite,
  sort: ordenacao,
  selectedCities: [],
});

const definirPagina = (estado, pagina) => ({
  ...estado,
  page: Math.max(0, pagina),
});

const obterDeslocamento = (estado) => Math.max(0, estado.page - 1) * estado.limit;

const adicionarCidadeSelecionada = (estado, cidade) => {
  const jaSelecionada = estado.selectedCities.some((selecionada) => selecionada.id === cidade.id);
  if (jaSelecionada) return estado;

  return {
    ...estado,
    selectedCities: [...estado.selectedCities, cidade],
  };
};

const removerCidadeSelecionada = (estado, idCidade) => ({
  ...estado,
  selectedCities: estado.selectedCities.filter((cidade) => cidade.id !== idCidade),
});

const limparCidadesSelecionadas = (estado) => ({
  ...estado,
  selectedCities: [],
});

const cidadeSelecionada = (estado, idCidade) => {
  return estado.selectedCities.some((cidade) => cidade.id === idCidade);
};

export {
  criarEstado,
  obterDeslocamento,
  definirPagina,
  adicionarCidadeSelecionada,
  removerCidadeSelecionada,
  limparCidadesSelecionadas,
  cidadeSelecionada,
};
