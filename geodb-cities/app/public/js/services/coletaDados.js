import { estimarTamanhoBuffer, desserializarCidades } from "../util/serializadorMemoriaCompartilhada.js";

const sharedArrayBufferDisponivel = () => typeof SharedArrayBuffer !== "undefined";

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
