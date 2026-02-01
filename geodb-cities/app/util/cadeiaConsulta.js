const construirCadeiaConsulta = (parametros) => {
  const parametrosLimpos = Object.fromEntries(
    Object.entries(parametros).filter(([_, valor]) => valor != null && valor !== undefined)
  );
  return new URLSearchParams(parametrosLimpos).toString();
};

module.exports = { buildQueryString: construirCadeiaConsulta };
