import { estimarTamanhoBuffer, desserializarCidades } from "../util/serializadorMemoriaCompartilhada.js";
import {
  carregarCacheCidades,
  salvarCacheCidades,
  existeCacheValido,
  carregarCidadesDoArquivo,
} from "../util/cacheCidades.js";

const sharedArrayBufferDisponivel = () => typeof SharedArrayBuffer !== "undefined";

/**
 * Carrega cidades com estratégia cache-first: verifica arquivo estático, depois cache, depois rede
 * @param {number} cidadesAlvo - Número de cidades desejadas
 * @param {number} limitePorPagina - Limite de cidades por página na API
 * @param {Function} aoProgresso - Callback de progresso
 * @param {boolean} forcarAtualizacao - Se true, ignora cache e força atualização
 * @returns {Promise<Array>} Array de cidades carregadas
 */
export const carregarCidadesComCache = async (
  cidadesAlvo = 10000,
  limitePorPagina = 10,
  aoProgresso,
  forcarAtualizacao = false
) => {
  // 1. PRIMEIRA PRIORIDADE: Tenta carregar do arquivo estático (sample-cities.json.bak)
  if (!forcarAtualizacao) {
    try {
      const cidadesArquivo = await carregarCidadesDoArquivo();
      if (cidadesArquivo && cidadesArquivo.length > 0) {
        console.log(`Arquivo estático encontrado: ${cidadesArquivo.length} cidades. Usando dados do arquivo.`);
        
        // Notifica progresso de arquivo estático
        if (aoProgresso) {
          aoProgresso(100, {
            workers: 0,
            currentPage: 0,
            totalPages: 0,
            citiesCollected: cidadesArquivo.length,
            fromFile: true,
            completed: true,
          });
        }

        // Salva no cache para uso futuro (se ainda não estiver em cache)
        try {
          const cacheExistente = await carregarCacheCidades();
          if (!cacheExistente || cacheExistente.length < cidadesArquivo.length) {
            await salvarCacheCidades(cidadesArquivo);
            console.log(`Cache atualizado com dados do arquivo estático`);
          }
        } catch (erro) {
          console.warn("Erro ao salvar arquivo no cache:", erro);
        }

        // Retorna cidades do arquivo (limitado ao alvo se necessário)
        return cidadesArquivo.slice(0, cidadesAlvo);
      }
    } catch (erro) {
      console.warn("Erro ao carregar arquivo estático, tentando cache:", erro);
    }

    // 2. SEGUNDA PRIORIDADE: Verifica cache IndexedDB/LocalStorage
    const cache = await carregarCacheCidades();
    if (cache && cache.length > 0) {
      console.log(`Cache encontrado: ${cache.length} cidades. Usando dados em cache.`);
      
      // Notifica progresso de cache
      if (aoProgresso) {
        aoProgresso(100, {
          workers: 0,
          currentPage: 0,
          totalPages: 0,
          citiesCollected: cache.length,
          fromCache: true,
          completed: true,
        });
      }

      // Retorna cache se tiver quantidade suficiente ou se for menor que o alvo
      if (cache.length >= cidadesAlvo || cache.length >= 1000) {
        return cache.slice(0, cidadesAlvo);
      } else {
        console.log(`Cache tem apenas ${cache.length} cidades, mas precisamos de ${cidadesAlvo}. Coletando mais...`);
        // Continua para coletar mais cidades
      }
    }
  } else {
    console.log("Atualização forçada: ignorando arquivo estático e cache, coletando dados da rede");
  }

  // 3. TERCEIRA PRIORIDADE: Cache não encontrado ou insuficiente: coleta da rede
  console.log("Coletando cidades da rede...");
  const cidadesColetadas = await coletarCidadesParalelo(cidadesAlvo, limitePorPagina, aoProgresso);

  // Salva no cache para uso futuro
  if (cidadesColetadas && cidadesColetadas.length > 0) {
    try {
      await salvarCacheCidades(cidadesColetadas);
      console.log(`Cache atualizado com ${cidadesColetadas.length} cidades`);
    } catch (erro) {
      console.warn("Erro ao salvar cache:", erro);
    }
  }

  return cidadesColetadas;
};

export const coletarCidadesParalelo = async (cidadesAlvo = 10000, limitePorPagina = 10, aoProgresso) => {
  const usarMemoriaCompartilhada = sharedArrayBufferDisponivel();

  if (!usarMemoriaCompartilhada) {
    console.warn("SharedArrayBuffer não disponível. Usando fallback com postMessage.");
    return coletaParalelaFallback(cidadesAlvo, limitePorPagina, aoProgresso);
  }

  const totalPaginas = Math.ceil(cidadesAlvo / limitePorPagina);
  const numWorkers = 1;
  const paginasPorWorker = Math.ceil(totalPaginas / numWorkers);

  const tamanhoCabecalho = 8;
  const tamanhoDadosEstimado = estimarTamanhoBuffer(cidadesAlvo * 1.5);
  const tamanhoTotalBuffer = tamanhoCabecalho + tamanhoDadosEstimado;

  let bufferCompartilhado;
  try {
    bufferCompartilhado = new SharedArrayBuffer(tamanhoTotalBuffer);
  } catch (erro) {
    console.warn("Erro ao criar SharedArrayBuffer:", erro);
    return coletaParalelaFallback(cidadesAlvo, limitePorPagina, aoProgresso);
  }

  const visualizacaoAtomica = new Int32Array(bufferCompartilhado, 0, 2);
  Atomics.store(visualizacaoAtomica, 0, tamanhoCabecalho);
  Atomics.store(visualizacaoAtomica, 1, 0);

  const workers = [];
  let totalProcessado = 0;

  for (let i = 0; i < numWorkers; i++) {
    const paginaInicio = i * paginasPorWorker + 1;
    const paginaFim = Math.min((i + 1) * paginasPorWorker, totalPaginas);

    if (paginaInicio > totalPaginas) break;

    const worker = new Worker("/js/workers/ColetaDadosWorker.js", { type: "module" });

    worker.postMessage({
      type: "start_collection",
      startPage: paginaInicio,
      endPage: paginaFim,
      limit: limitePorPagina,
      workerId: i,
      sharedBuffer: bufferCompartilhado,
      headerSize: tamanhoCabecalho,
      totalBufferSize: tamanhoTotalBuffer,
    });

    worker.onmessage = (evento) => {
      const { type, workerId, page, citiesCollected, error, waitTime } = evento.data;

      switch (type) {
        case "progress":
          totalProcessado++;
          let coletadasEstimadas = 0;
          try {
            if (visualizacaoAtomica && typeof Atomics !== "undefined") {
              const indiceEscritaAtual = Atomics.load(visualizacaoAtomica, 0);
              coletadasEstimadas = Math.floor((indiceEscritaAtual - tamanhoCabecalho) / 200);
            }
          } catch (e) {
            console.warn("Erro ao estimar cidades coletadas:", e);
          }

          if (aoProgresso) {
            const progressoBruto = (totalProcessado / totalPaginas) * 100;
            const progresso = totalProcessado > 0 ? Math.max(1, Math.min(100, progressoBruto)) : 0;
            aoProgresso(progresso, {
              workers: numWorkers,
              currentPage: page,
              totalPages: totalPaginas,
              citiesCollected: coletadasEstimadas,
              workerId,
            });
          }
          break;

        case "progress_log":
          console.log(`[Worker ${evento.data.workerId}] ${evento.data.message}`);
          break;

        case "complete":
          Atomics.add(visualizacaoAtomica, 1, 1);
          worker.terminate();
          break;

        case "rate_limit":
          if (aoProgresso) {
            const progressoBruto = (totalProcessado / totalPaginas) * 100;
            const progresso = totalProcessado > 0 ? Math.max(1, Math.min(100, progressoBruto)) : 0;
            let coletadasRateLimit = 0;
            try {
              if (visualizacaoAtomica && typeof Atomics !== "undefined") {
                const indiceEscritaAtual = Atomics.load(visualizacaoAtomica, 0);
                coletadasRateLimit = Math.floor((indiceEscritaAtual - tamanhoCabecalho) / 200);
              }
            } catch (e) {
              console.warn("Erro ao estimar cidades coletadas:", e);
            }
            aoProgresso(progresso, {
              workers: numWorkers,
              currentPage: page,
              totalPages: totalPaginas,
              citiesCollected: coletadasRateLimit,
              workerId,
              rateLimit: true,
              waitTime,
            });
          }
          console.warn(`Worker ${workerId} rate limit na página ${page}. Aguardando ${waitTime}s...`);
          break;

        case "error":
          console.warn(`Worker ${workerId} erro na página ${page}:`, error);
          break;

        case "critical_error":
          console.error(`Worker ${workerId} erro crítico:`, error);
          worker.terminate();
          Atomics.add(visualizacaoAtomica, 1, 1);
          break;

        default:
          console.warn(`Worker ${workerId} mensagem desconhecida:`, type);
      }
    };

    worker.onerror = (erro) => {
      console.error(`Worker ${i} erro:`, erro);
      worker.terminate();
      Atomics.add(visualizacaoAtomica, 1, 1);
    };

    workers.push(worker);
  }

  return new Promise((resolver, rejeitar) => {
    const verificarCompleto = setInterval(() => {
      const completados = Atomics.load(visualizacaoAtomica, 1);
      if (completados === numWorkers) {
        clearInterval(verificarCompleto);

        const indiceEscritaFinal = Atomics.load(visualizacaoAtomica, 0);
        const bufferDados = bufferCompartilhado.slice(tamanhoCabecalho, indiceEscritaFinal);
        const todasCidades = desserializarCidades(bufferDados);

        const cidadesUnicasPorId = Array.from(new Map(todasCidades.map((cidade) => [cidade.id, cidade])).values());

        const cidadesUnicas = [];
        const vistas = new Map();

        for (const cidade of cidadesUnicasPorId) {
          const nome = (cidade.name || cidade.cityName || "").toLowerCase().trim();
          const latArredondada = Math.round(cidade.latitude * 100) / 100;
          const lonArredondada = Math.round(cidade.longitude * 100) / 100;
          const chave = `${nome}|${latArredondada}|${lonArredondada}`;

          if (!vistas.has(chave)) {
            vistas.set(chave, cidade);
            cidadesUnicas.push(cidade);
          } else {
            const existente = vistas.get(chave);
            if (cidade.population > (existente.population || 0)) {
              const indice = cidadesUnicas.indexOf(existente);
              if (indice !== -1) {
                cidadesUnicas[indice] = cidade;
                vistas.set(chave, cidade);
              }
            }
          }
        }

        console.log(`Duplicatas removidas: ${todasCidades.length} -> ${cidadesUnicasPorId.length} -> ${cidadesUnicas.length}`);

        if (aoProgresso) {
          aoProgresso(100, {
            workers: numWorkers,
            totalPages: totalPaginas,
            citiesCollected: cidadesUnicas.length,
            completed: true,
          });
        }

        resolver(cidadesUnicas);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(verificarCompleto);
      workers.forEach((w) => w.terminate());
      rejeitar(new Error("Timeout na coleta de dados"));
    }, 600000);
  });
};

const coletaParalelaFallback = async (cidadesAlvo = 10000, limitePorPagina = 10, aoProgresso) => {
  const totalPaginas = Math.ceil(cidadesAlvo / limitePorPagina);
  const numWorkers = 1;
  const paginasPorWorker = Math.ceil(totalPaginas / numWorkers);

  const workers = [];
  const todasCidades = [];
  let workersCompletos = 0;
  let totalColetado = 0;
  let totalProcessado = 0;

  for (let i = 0; i < numWorkers; i++) {
    const paginaInicio = i * paginasPorWorker + 1;
    const paginaFim = Math.min((i + 1) * paginasPorWorker, totalPaginas);

    if (paginaInicio > totalPaginas) break;

    const worker = new Worker("/js/workers/ColetaDadosWorker.js", { type: "module" });

    worker.postMessage({
      type: "start_collection",
      startPage: paginaInicio,
      endPage: paginaFim,
      limit: limitePorPagina,
      workerId: i,
      useSharedMemory: false,
    });

    worker.onmessage = (evento) => {
      const { type, cities, workerId, page, citiesCollected } = evento.data;

      switch (type) {
        case "progress":
          totalProcessado++;
          if (aoProgresso) {
            const progressoBruto = (totalProcessado / totalPaginas) * 100;
            const progresso = totalProcessado > 0 ? Math.max(1, Math.min(100, progressoBruto)) : 0;
            aoProgresso(progresso, {
              workers: numWorkers,
              currentPage: page,
              totalPages: totalPaginas,
              citiesCollected: totalColetado + (citiesCollected || 0),
              workerId,
            });
          }
          break;

        case "complete":
          workersCompletos++;
          todasCidades.push(...(cities || []));
          totalColetado += (cities || []).length;
          worker.terminate();
          if (workersCompletos === workers.length && aoProgresso) {
            aoProgresso(100, {
              workers: numWorkers,
              totalPages: totalPaginas,
              citiesCollected: totalColetado,
              completed: true,
            });
          }
          break;

        case "error":
          console.warn(`Worker ${workerId} erro na página ${page}:`, evento.data.error);
          break;

        case "critical_error":
          console.error(`Worker ${workerId} erro crítico:`, evento.data.error);
          worker.terminate();
          workersCompletos++;
          break;
      }
    };

    worker.onerror = (erro) => {
      console.error(`Worker ${i} erro:`, erro);
      worker.terminate();
      workersCompletos++;
    };

    workers.push(worker);
  }

  return new Promise((resolver, rejeitar) => {
    const verificarCompleto = setInterval(() => {
      if (workersCompletos === workers.length) {
        clearInterval(verificarCompleto);

        const cidadesUnicasPorId = Array.from(new Map(todasCidades.map((cidade) => [cidade.id, cidade])).values());
        const cidadesUnicas = [];
        const vistas = new Map();

        for (const cidade of cidadesUnicasPorId) {
          const nome = (cidade.name || cidade.cityName || "").toLowerCase().trim();
          const latArredondada = Math.round(cidade.latitude * 100) / 100;
          const lonArredondada = Math.round(cidade.longitude * 100) / 100;
          const chave = `${nome}|${latArredondada}|${lonArredondada}`;

          if (!vistas.has(chave)) {
            vistas.set(chave, cidade);
            cidadesUnicas.push(cidade);
          } else {
            const existente = vistas.get(chave);
            if (cidade.population > (existente.population || 0)) {
              const indice = cidadesUnicas.indexOf(existente);
              if (indice !== -1) {
                cidadesUnicas[indice] = cidade;
                vistas.set(chave, cidade);
              }
            }
          }
        }

        console.log(`Duplicatas removidas (fallback): ${todasCidades.length} -> ${cidadesUnicas.length}`);
        resolver(cidadesUnicas);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(verificarCompleto);
      workers.forEach((w) => w.terminate());
      rejeitar(new Error("Timeout na coleta de dados"));
    }, 600000);
  });
};
