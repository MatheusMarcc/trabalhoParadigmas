const axios = require("axios");
const { buildQueryString } = require("../util/cadeiaConsulta");

const buscarDadosCidadesApi = async (opcoes = {}) => {
  const {
    limit = 10,
    offset = 0,
    sort = "name",
    location,
    radius,
    distanceUnit = "MI",
    countryIds,
    excludedCountryIds,
    minPopulation,
    maxPopulation,
    namePrefix,
    timeZoneIds,
    types = "CITY",
    asciiMode = false,
    hateoasMode = true,
    languageCode,
    includeDeleted = "NONE",
  } = opcoes;

  const cadeiaConsulta = buildQueryString({
    offset,
    limit,
    sort,
    location,
    radius,
    distanceUnit,
    countryIds,
    excludedCountryIds,
    minPopulation,
    maxPopulation,
    namePrefix,
    timeZoneIds,
    types,
    asciiMode,
    hateoasMode,
    languageCode,
    includeDeleted,
  });

  const url = `https://wft-geo-db.p.rapidapi.com/v1/geo/cities?${cadeiaConsulta}`;

  if (!process.env.RAPIDAPI_KEY) {
    const erro = new Error("RAPIDAPI_KEY não configurada. Verifique as variáveis de ambiente.");
    erro.status = 500;
    throw erro;
  }

  const cabecalhos = {
    "x-rapidapi-host": "wft-geo-db.p.rapidapi.com",
    "x-rapidapi-key": process.env.RAPIDAPI_KEY,
  };

  try {
    const resposta = await axios.get(url, { headers: cabecalhos });
    return resposta.data;
  } catch (erro) {
    if (erro.response) {
      const status = erro.response.status;
      const textoStatus = erro.response.statusText;
      const dadosErro = erro.response.data;

      console.error(`[GeoDB API Error] Status: ${status}`, {
        url,
        textoStatus,
        errorData: dadosErro || 'No error data',
        headers: erro.response.headers,
      });

      if (dadosErro?.code === "ACCESS_DENIED" || dadosErro?.type === "WftSecurityError.AccessDenied") {
        const erroLimite = new Error(
          `Limite de consulta excedido: ${dadosErro.message || 'O limite solicitado excede o permitido no seu plano'}`
        );
        erroLimite.status = 403;
        erroLimite.statusCode = 403;
        erroLimite.apiError = dadosErro;
        erroLimite.isLimitError = true;
        throw erroLimite;
      }

      const erroApi = new Error(
        `API error: ${status} ${textoStatus}${dadosErro?.message ? ` - ${dadosErro.message}` : ''}`
      );
      erroApi.status = status;
      erroApi.statusCode = status;
      erroApi.apiError = dadosErro;

      throw erroApi;
    } else if (erro.request) {
      console.error('[GeoDB API Error] No response received', {
        url,
        message: erro.message,
      });
      throw new Error("Network error: Não foi possível conectar à API");
    } else {
      console.error('[GeoDB API Error] Request setup error', {
        url,
        message: erro.message,
        stack: erro.stack,
      });
      throw erro;
    }
  }
};

module.exports = { buscarDadosCidadesApi };
