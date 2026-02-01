import {
  criarEstado,
  obterDeslocamento,
  definirPagina,
  adicionarCidadeSelecionada,
  removerCidadeSelecionada,
  limparCidadesSelecionadas,
  cidadeSelecionada,
} from "../models/CidadeModel.js";
import {
  limparErroListaCidades,
  renderizarListaCidades,
  renderizarPaginaAtual,
  mostrarErroListaCidades,
  mostrarCarregamento,
  renderizarListaCidadesSelecionadas,
  atualizarContadorSelecionadas,
} from "../views/CidadeView.js";
import { coletarCidadesParalelo } from "../services/coletaDados.js";
import { executarKmeans } from "../services/kmeans.js";
import { renderizarClusters, renderizarGraficoClusters, mostrarProgressoClustering } from "../views/ClusterView.js";

const listaCidades = document.getElementById("cities-list");
const listaCidadesSelecionadas = document.getElementById("selected-cities-list");
const contadorSelecionadas = document.getElementById("selected-count");
const acoesSelecionadas = document.getElementById("selected-actions");
const botaoLimparTudo = document.getElementById("clear-all-button");
const botaoProximo = document.getElementById("button-next");
const botaoAnterior = document.getElementById("button-previous");
const caixaErro = document.getElementById("error-box");
const paginaAtual = document.getElementById("current-page");

if (!listaCidades || !listaCidadesSelecionadas || !contadorSelecionadas || !acoesSelecionadas || !botaoLimparTudo) {
  console.error("Elementos DOM críticos não encontrados. Verifique se o HTML está correto.");
}

let estado = criarEstado();

let carregando = false;
let ultimasCidadesRenderizadas = [];
let cidadesColetadas = [];
let coletando = false;
let agrupando = false;

const botaoIniciarColeta = document.getElementById("start-collection-button");
const botaoIniciarAgrupamento = document.getElementById("start-clustering-button");
const inputK = document.getElementById("k-input");
const inputCidades = document.getElementById("cities-input");
const estimativaTempo = document.getElementById("time-estimate");
const infoTempo = document.getElementById("time-info");
const secaoProgresso = document.getElementById("progress-section");
const barraProgresso = document.getElementById("progress-bar");
const textoProgresso = document.getElementById("progress-text");
const detalhesProgresso = document.getElementById("progress-details");
const estatisticasProgresso = document.getElementById("progress-stats");
const infoMemoria = document.getElementById("memory-info");
const textoInfoMemoria = document.getElementById("memory-info-text");
const secaoClusters = document.getElementById("clusters-section");
const containerClusters = document.getElementById("clusters-container");

const atualizarEstadoBotaoKmeans = () => {
  if (!botaoIniciarAgrupamento || !inputK) return;
  const k = parseInt(inputK.value, 10) || 2;
  const podeComColeta = cidadesColetadas.length >= k;
  const podeComSelecao = estado.selectedCities.length >= k;
  botaoIniciarAgrupamento.disabled = !(podeComColeta || podeComSelecao);
};

const atualizarEstimativaTempo = () => {
  if (!inputCidades || !estimativaTempo || !infoTempo) return;

  const cidadesAlvo = parseInt(inputCidades.value, 10) || 5000;
  const limitePorPagina = 10;
  const atrasoPorPagina = 2.5;

  const totalPaginas = Math.ceil(cidadesAlvo / limitePorPagina);
  const totalSegundos = totalPaginas * atrasoPorPagina;
  const totalMinutos = Math.ceil(totalSegundos / 60);

  let textoHorario = "";
  if (totalMinutos < 60) {
    textoHorario = `~${totalMinutos} min`;
  } else {
    const horas = Math.floor(totalMinutos / 60);
    const minutos = totalMinutos % 60;
    textoHorario = minutos > 0 ? `~${horas}h ${minutos}min` : `~${horas}h`;
  }

  estimativaTempo.textContent = textoHorario;
  infoTempo.textContent = `Coleta de ${cidadesAlvo.toLocaleString("pt-BR")} cidades levará aproximadamente ${textoHorario}`;
};

if (inputCidades) {
  inputCidades.addEventListener("input", atualizarEstimativaTempo);
  inputCidades.addEventListener("change", atualizarEstimativaTempo);
  atualizarEstimativaTempo();
}

document.querySelectorAll('[data-cities]').forEach((item) => {
  item.addEventListener("click", (evento) => {
    evento.preventDefault();
    const cidades = parseInt(item.getAttribute("data-cities"), 10);
    if (inputCidades && !isNaN(cidades)) {
      inputCidades.value = cidades;
      atualizarEstimativaTempo();
      inputCidades.focus();
      setTimeout(() => inputCidades.blur(), 500);
    }
  });
});

const desabilitarBotoes = (desabilitado) => {
  botaoProximo.disabled = desabilitado;
  botaoAnterior.disabled = desabilitado;
  if (desabilitado) {
    botaoProximo.classList.add("disabled");
    botaoAnterior.classList.add("disabled");
  } else {
    botaoProximo.classList.remove("disabled");
    botaoAnterior.classList.remove("disabled");
  }
};

const manipularPaginacao = async (direcao, elementos) => {
  if (carregando || coletando) return;

  try {
    carregando = true;
    desabilitarBotoes(true);
    limparErroListaCidades(elementos.caixaErro);
    mostrarCarregamento(elementos.listaCidades);

    const proximaPagina = direcao === "next" ? estado.page + 1 : direcao === "previous" ? estado.page - 1 : null;

    if (proximaPagina === null) {
      const erro = new Error("Invalid pagination direction");
      erro.status = 400;
      throw erro;
    }

    const novaPagina = proximaPagina <= 0 ? 1 : proximaPagina;

    estado = definirPagina(estado, novaPagina);

    const opcoes = {
      limit: estado.limit,
      offset: obterDeslocamento(estado),
      sort: estado.sort,
    };

    const cadeiaConsulta = new URLSearchParams(opcoes).toString();

    const resposta = await fetch(`/api/cities?${cadeiaConsulta}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!resposta.ok) {
      let mensagemErro = resposta.statusText;
      try {
        const dadosErro = await resposta.json();
        mensagemErro = dadosErro.error?.message || dadosErro.message || mensagemErro;
      } catch {}

      const paginaReverter = direcao === "next" ? estado.page - 1 : direcao === "previous" ? estado.page + 1 : estado.page;
      estado = definirPagina(estado, paginaReverter);

      const erro = new Error(mensagemErro);
      erro.status = resposta.status;
      throw erro;
    }

    const resultado = await resposta.json();
    const cidades = resultado.data ? Object.values(resultado.data) : [];
    ultimasCidadesRenderizadas = cidades;

    limparErroListaCidades(elementos.caixaErro);
    renderizarListaCidades(
      elementos.listaCidades,
      cidades,
      manipularSelecionarCidade,
      (idCidade) => cidadeSelecionada(estado, idCidade)
    );
    renderizarPaginaAtual(elementos.paginaAtual, estado.page);
  } catch (erro) {
    let mensagemErro = "Failed to fetch cities";

    if (erro instanceof TypeError && /fetch|network/i.test(erro.message)) {
      mensagemErro = "Network error: Unable to reach the server";
    } else if (typeof erro.status === "number") {
      const mensagensStatus = {
        400: `Invalid request: ${erro.message}`,
        401: "Unauthorized: Invalid or missing credentials",
        403: "Forbidden: You do not have permission to access this resource",
        404: "API endpoint not found",
        408: "Request timeout: The server took too long to respond",
        429: "Too many requests: Rate limit exceeded",
        500: "Server error: Please try again later",
        502: "Bad gateway: Invalid response from upstream server",
        503: "Service unavailable: The API is temporarily down",
        504: "Gateway timeout: The server took too long to respond",
      };
      mensagemErro = mensagensStatus[erro.status] || `${mensagemErro}: ${erro.message || "Unknown error"}`;
    } else if (erro.message) {
      mensagemErro = `${mensagemErro}: ${erro.message}`;
    } else {
      mensagemErro = "An unknown error occurred while fetching cities";
    }

    mostrarErroListaCidades(elementos.caixaErro, mensagemErro);
  } finally {
    carregando = false;
    desabilitarBotoes(false);
  }
};

const manipularSelecionarCidade = (cidade) => {
  if (!cidade || !listaCidadesSelecionadas || !contadorSelecionadas || !acoesSelecionadas || !listaCidades) return;

  estado = adicionarCidadeSelecionada(estado, cidade);
  renderizarListaCidadesSelecionadas(listaCidadesSelecionadas, estado.selectedCities, manipularRemoverCidade);
  atualizarContadorSelecionadas(contadorSelecionadas, estado.selectedCities.length);

  if (estado.selectedCities.length > 0) {
    acoesSelecionadas.classList.remove("d-none");
  }

  renderizarListaCidades(
    listaCidades,
    ultimasCidadesRenderizadas,
    manipularSelecionarCidade,
    (idCidade) => cidadeSelecionada(estado, idCidade)
  );
  atualizarEstadoBotaoKmeans();
};

const manipularRemoverCidade = (idCidade) => {
  if (!listaCidadesSelecionadas || !contadorSelecionadas || !acoesSelecionadas || !listaCidades) return;

  estado = removerCidadeSelecionada(estado, idCidade);
  renderizarListaCidadesSelecionadas(listaCidadesSelecionadas, estado.selectedCities, manipularRemoverCidade);
  atualizarContadorSelecionadas(contadorSelecionadas, estado.selectedCities.length);

  if (estado.selectedCities.length === 0) {
    acoesSelecionadas.classList.add("d-none");
  }

  renderizarListaCidades(
    listaCidades,
    ultimasCidadesRenderizadas,
    manipularSelecionarCidade,
    (idCidade) => cidadeSelecionada(estado, idCidade)
  );
  atualizarEstadoBotaoKmeans();
};

const manipularLimparTudo = () => {
  if (confirm("Tem certeza que deseja limpar todas as cidades selecionadas?")) {
    estado = limparCidadesSelecionadas(estado);
    renderizarListaCidadesSelecionadas(listaCidadesSelecionadas, estado.selectedCities, manipularRemoverCidade);
    atualizarContadorSelecionadas(contadorSelecionadas, estado.selectedCities.length);
    acoesSelecionadas.classList.add("d-none");
    renderizarListaCidades(
      listaCidades,
      ultimasCidadesRenderizadas,
      manipularSelecionarCidade,
      (idCidade) => cidadeSelecionada(estado, idCidade)
    );
    atualizarEstadoBotaoKmeans();
  }
};

if (inputK) inputK.addEventListener("input", atualizarEstadoBotaoKmeans);

botaoProximo.addEventListener("click", async () => {
  await manipularPaginacao("next", { listaCidades, caixaErro, paginaAtual });
});

botaoAnterior.addEventListener("click", async () => {
  await manipularPaginacao("previous", { listaCidades, caixaErro, paginaAtual });
});

if (botaoLimparTudo) {
  botaoLimparTudo.addEventListener("click", manipularLimparTudo);
}

const manipularIniciarColeta = async () => {
  if (coletando) return;

  try {
    const tempoInicio = Date.now();
    coletando = true;
    botaoIniciarColeta.disabled = true;
    botaoIniciarColeta.innerHTML = '<i class="bi bi-hourglass-split"></i> Coletando...';

    desabilitarBotoes(true);
    botaoProximo.disabled = true;
    botaoAnterior.disabled = true;

    secaoProgresso.classList.remove("d-none");
    secaoClusters.classList.add("d-none");
    secaoProgresso.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const usarMemoriaCompartilhada = typeof SharedArrayBuffer !== "undefined";
    if (usarMemoriaCompartilhada) {
      infoMemoria.classList.remove("d-none");
      textoInfoMemoria.textContent = "Usando memória compartilhada (SharedArrayBuffer) com sincronização Atomics";
    } else {
      infoMemoria.classList.add("d-none");
    }

    barraProgresso.style.width = "0%";
    barraProgresso.style.minWidth = "2%";
    barraProgresso.setAttribute("aria-valuenow", "0");
    textoProgresso.textContent = "0%";
    detalhesProgresso.textContent = usarMemoriaCompartilhada
      ? "Iniciando coleta paralela com memória compartilhada..."
      : "Iniciando coleta paralela (modo fallback)...";
    estatisticasProgresso.textContent = "";

    const cidadesAlvo = parseInt(inputCidades?.value || 5000, 10);

    if (isNaN(cidadesAlvo) || cidadesAlvo < 100) {
      alert("Por favor, insira um número válido de cidades (mínimo 100)");
      return;
    }

    if (cidadesAlvo > 50000) {
      alert("Número muito alto. Máximo recomendado: 50.000 cidades");
      return;
    }

    const atualizarBarra = (progresso, estatisticas) => {
      requestAnimationFrame(() => {
        if (barraProgresso) {
          barraProgresso.style.width = `${Math.min(100, Math.max(0, progresso))}%`;
          barraProgresso.style.minWidth = progresso > 0 ? "2%" : "2%";
          barraProgresso.setAttribute("aria-valuenow", String(progresso));
        }
        if (textoProgresso) textoProgresso.textContent = `${Math.round(progresso)}%`;

        if (detalhesProgresso) {
          if (estatisticas?.rateLimit) {
            detalhesProgresso.textContent = `Rate limit atingido. Aguardando ${estatisticas.waitTime}s antes de continuar...`;
            barraProgresso?.classList.remove("bg-warning");
            barraProgresso?.classList.add("bg-danger");
          } else {
            detalhesProgresso.textContent = `Coletando dados... ${estatisticas?.citiesCollected ?? 0} cidades`;
            barraProgresso?.classList.remove("bg-danger");
            barraProgresso?.classList.add("bg-warning");
          }
        }
        if (estatisticasProgresso) {
          const statusMemoria =
            typeof SharedArrayBuffer !== "undefined" ? " | Memória Compartilhada: Ativa" : " | Modo: Fallback";
          estatisticasProgresso.textContent = `Workers: ${estatisticas?.workers ?? 1} | Página: ${estatisticas?.currentPage ?? 0}/${estatisticas?.totalPages ?? 0}${statusMemoria}`;
        }
      });
    };

    cidadesColetadas = await coletarCidadesParalelo(cidadesAlvo, 10, atualizarBarra);

    const tempoFim = Date.now();
    const segundosDecorridos = Math.round((tempoFim - tempoInicio) / 1000);
    const minutosDecorridos = Math.floor(segundosDecorridos / 60);
    const segundosRestantes = segundosDecorridos % 60;
    const textoHorario =
      minutosDecorridos > 0 ? `${minutosDecorridos}min ${segundosRestantes}s` : `${segundosDecorridos}s`;

    barraProgresso.style.width = "100%";
    textoProgresso.textContent = "100%";
    detalhesProgresso.textContent = "Coleta concluída! Iniciando agrupamento K-Means...";
    estatisticasProgresso.textContent = `Total coletado: ${cidadesColetadas.length} cidades válidas | Tempo: ${textoHorario}`;

    atualizarEstadoBotaoKmeans();
    console.log(`Coleta concluída! ${cidadesColetadas.length} cidades coletadas em ${textoHorario}. Iniciando K-Means automaticamente...`);

    setTimeout(() => manipularIniciarAgrupamento(), 500);
  } catch (erro) {
    console.error("Erro na coleta:", erro);

    let mensagemErro = erro.message;
    if (erro.message.includes("limite") || erro.message.includes("limit") || erro.message.includes("ACCESS_DENIED")) {
      mensagemErro =
        "Limite de consulta excedido. O plano da API permite no máximo 10 resultados por página. A coleta continuará com esse limite.";
    } else if (erro.message.includes("429") || erro.message.includes("rate limit") || erro.message.includes("Too Many Requests")) {
      mensagemErro =
        "Rate limit excedido. O plano BASIC da RapidAPI tem limite muito baixo de requisições por segundo. Aguarde alguns minutos e tente novamente.";
    }

    alert(`Erro na coleta de dados: ${mensagemErro}`);
    detalhesProgresso.textContent = `Erro: ${mensagemErro}`;
    barraProgresso.classList.remove("progress-bar-animated");
    barraProgresso.classList.add("bg-danger");
  } finally {
    coletando = false;
    botaoIniciarColeta.disabled = false;
    botaoIniciarColeta.innerHTML = '<i class="bi bi-download"></i> Iniciar Coleta (~10k cidades)';
    desabilitarBotoes(false);
    botaoProximo.disabled = false;
    botaoAnterior.disabled = false;
  }
};

const converterCidadeParaPonto = (cidade) => ({
  latitude: cidade.latitude ?? 0,
  longitude: cidade.longitude ?? 0,
  population: cidade.population || 0,
  city: {
    ...cidade,
    name: cidade.name || cidade.city || cidade.cityName || `Cidade ${cidade.id || ""}`,
    country: cidade.country || cidade.countryCode || cidade.countryName || "N/A",
  },
});

const manipularIniciarAgrupamento = async () => {
  const fonteCidades =
    cidadesColetadas.length > 0 ? cidadesColetadas : estado.selectedCities.map(converterCidadeParaPonto);
  if (agrupando || fonteCidades.length === 0) return;

  const k = parseInt(inputK.value, 10);
  if (isNaN(k) || k < 2 || k > 50) {
    alert("Por favor, insira um valor válido para k (entre 2 e 50)");
    return;
  }

  if (fonteCidades.length < k) {
    alert(`Número de cidades (${fonteCidades.length}) deve ser maior ou igual a k (${k})`);
    return;
  }

  try {
    agrupando = true;
    botaoIniciarAgrupamento.disabled = true;
    botaoIniciarAgrupamento.innerHTML = '<i class="bi bi-hourglass-split"></i> Processando...';
    secaoClusters.classList.remove("d-none");
    mostrarProgressoClustering(containerClusters, 0, 100);

    const pontos =
      cidadesColetadas.length > 0
        ? cidadesColetadas.map((cidade) => ({
            latitude: cidade.latitude,
            longitude: cidade.longitude,
            population: cidade.population || 0,
            city: {
              ...cidade,
              name: cidade.name || cidade.city || cidade.cityName || `Cidade ${cidade.id || "Unknown"}`,
              country: cidade.country || cidade.countryCode || cidade.countryName || "N/A",
            },
          }))
        : estado.selectedCities.map(converterCidadeParaPonto);

    const resultado = await executarKmeans(pontos, k, 100, (iteracao) => {
      mostrarProgressoClustering(containerClusters, iteracao, 100);
    });

    renderizarClusters(containerClusters, resultado.clusters, pontos, resultado.centroids);
    renderizarGraficoClusters(resultado.clusters, pontos, resultado.centroids);

    secaoClusters?.scrollIntoView({ behavior: "smooth", block: "start" });

    const divInfo = document.createElement("div");
    divInfo.className = "alert alert-success mt-3";
    divInfo.innerHTML = `
      <strong><i class="bi bi-check-circle"></i> Clustering concluído!</strong><br>
      Iterações: ${resultado.iterations} |
      Convergência: ${resultado.converged ? "Sim" : "Não (máximo atingido)"} |
      Total de pontos: ${pontos.length}
    `;
    containerClusters.insertBefore(divInfo, containerClusters.firstChild);
  } catch (erro) {
    console.error("Erro no clustering:", erro);
    containerClusters.innerHTML = `
      <div class="alert alert-danger">
        <strong>Erro no clustering:</strong> ${erro.message}
      </div>
    `;
  } finally {
    agrupando = false;
    botaoIniciarAgrupamento.innerHTML = '<i class="bi bi-diagram-3"></i> Executar K-Means';
    atualizarEstadoBotaoKmeans();
  }
};

if (botaoIniciarColeta) {
  botaoIniciarColeta.addEventListener("click", manipularIniciarColeta);
}

if (botaoIniciarAgrupamento) {
  botaoIniciarAgrupamento.addEventListener("click", manipularIniciarAgrupamento);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    manipularPaginacao("next", { listaCidades, caixaErro, paginaAtual });
  });
} else {
  manipularPaginacao("next", { listaCidades, caixaErro, paginaAtual });
}
