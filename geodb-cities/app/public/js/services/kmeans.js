import {
  serializarPontos,
  serializarCentroides,
  estimarTamanhoBufferPontos,
} from "../util/serializadorMemoriaCompartilhada.js";

const sharedArrayBufferDisponivel = () => typeof SharedArrayBuffer !== "undefined";

const normalizarDados = (pontos) => {
  if (pontos.length === 0) return { pontosNormalizados: [], faixas: null };

  const latitudes = pontos.map((p) => p.latitude);
  const longitudes = pontos.map((p) => p.longitude);
  const populacoes = pontos.map((p) => p.population || 0);

  const latMin = Math.min(...latitudes);
  const latMax = Math.max(...latitudes);
  const lonMin = Math.min(...longitudes);
  const lonMax = Math.max(...longitudes);
  const popMin = Math.min(...populacoes);
  const popMax = Math.max(...populacoes);

  const faixaLat = latMax - latMin || 1;
  const faixaLon = lonMax - lonMin || 1;
  const faixaPop = popMax - popMin || 1;

  const pontosNormalizados = pontos.map((ponto) => ({
    ...ponto,
    latitude: (ponto.latitude - latMin) / faixaLat,
    longitude: (ponto.longitude - lonMin) / faixaLon,
    population: ((ponto.population || 0) - popMin) / faixaPop,
  }));

  return {
    pontosNormalizados,
    faixas: {
      lat: { min: latMin, max: latMax, range: faixaLat },
      lon: { min: lonMin, max: lonMax, range: faixaLon },
      pop: { min: popMin, max: popMax, range: faixaPop },
    },
  };
};

const desnormalizarCentroides = (centroidesNormalizados, faixas) => {
  if (!faixas) return centroidesNormalizados;

  return centroidesNormalizados.map((centroide) => ({
    ...centroide,
    latitude: centroide.latitude * faixas.lat.range + faixas.lat.min,
    longitude: centroide.longitude * faixas.lon.range + faixas.lon.min,
    population: centroide.population * faixas.pop.range + faixas.pop.min,
  }));
};

const inicializarCentroides = (pontosNormalizados, k) => {
  const centroides = [];
  for (let i = 0; i < k; i++) {
    centroides.push({
      latitude: Math.random(),
      longitude: Math.random(),
      population: Math.random(),
    });
  }
  return centroides;
};

const distanciaEuclidiana = (ponto1, ponto2) => {
  const diffLat = ponto1.latitude - ponto2.latitude;
  const diffLon = ponto1.longitude - ponto2.longitude;
  const diffPop = ponto1.population - ponto2.population;
  return Math.sqrt(diffLat * diffLat + diffLon * diffLon + diffPop * diffPop);
};

const atribuirPontosAosClusters = async (pontos, centroides, numWorkers = 4) => {
  const pontosPorWorker = Math.ceil(pontos.length / numWorkers);
  const workers = [];
  const promessas = [];
  const usarMemoriaCompartilhada = sharedArrayBufferDisponivel();

  let sharedPointsBuffer = null;
  let sharedCentroidsBuffer = null;

  // Prepara buffers compartilhados se disponível
  if (usarMemoriaCompartilhada) {
    try {
      const bufferPontos = serializarPontos(pontos);
      const bufferCentroides = serializarCentroides(centroides);

      sharedPointsBuffer = new SharedArrayBuffer(bufferPontos.byteLength);
      sharedCentroidsBuffer = new SharedArrayBuffer(bufferCentroides.byteLength);

      new Uint8Array(sharedPointsBuffer).set(new Uint8Array(bufferPontos));
      new Uint8Array(sharedCentroidsBuffer).set(new Uint8Array(bufferCentroides));
    } catch (erro) {
      console.warn("Erro ao criar SharedArrayBuffer, usando fallback:", erro);
    }
  }

  for (let i = 0; i < numWorkers; i++) {
    const indiceInicio = i * pontosPorWorker;
    const indiceFim = Math.min((i + 1) * pontosPorWorker, pontos.length);

    if (indiceInicio >= pontos.length) break;

    const worker = new Worker("/js/workers/KmeansWorker.js", { type: "module" });

    const promessa = new Promise((resolver, rejeitar) => {
      worker.onmessage = (evento) => {
        if (evento.data.type === "assignments_complete") {
          worker.terminate();
          resolver(evento.data.assignments);
        } else if (evento.data.type === "error") {
          worker.terminate();
          rejeitar(new Error(evento.data.error));
        }
      };
      worker.onerror = (erro) => {
        worker.terminate();
        rejeitar(erro);
      };
    });

    // Envia dados via memória compartilhada se disponível, senão usa postMessage
    worker.postMessage({
      type: "assign_points",
      data: {
        points: usarMemoriaCompartilhada && sharedPointsBuffer ? null : pontos,
        centroids: usarMemoriaCompartilhada && sharedCentroidsBuffer ? null : centroides,
        startIndex: indiceInicio,
        endIndex: indiceFim,
        sharedPointsBuffer,
        sharedCentroidsBuffer,
        pointsOffset: 0,
        centroidsOffset: 0,
        useSharedMemory: usarMemoriaCompartilhada && sharedPointsBuffer && sharedCentroidsBuffer,
      },
    });

    workers.push(worker);
    promessas.push(promessa);
  }

  const todasAtribuicoes = await Promise.all(promessas);
  return todasAtribuicoes.flat();
};

const calcularNovosCentroides = async (clusters, pontos) => {
  return new Promise((resolver, rejeitar) => {
    const worker = new Worker("/js/workers/KmeansWorker.js", { type: "module" });
    const usarMemoriaCompartilhada = sharedArrayBufferDisponivel();

    let sharedPointsBuffer = null;

    // Prepara buffer compartilhado se disponível
    if (usarMemoriaCompartilhada) {
      try {
        const bufferPontos = serializarPontos(pontos);
        sharedPointsBuffer = new SharedArrayBuffer(bufferPontos.byteLength);
        new Uint8Array(sharedPointsBuffer).set(new Uint8Array(bufferPontos));
      } catch (erro) {
        console.warn("Erro ao criar SharedArrayBuffer para centroides, usando fallback:", erro);
      }
    }

    worker.onmessage = (evento) => {
      if (evento.data.type === "centroids_complete") {
        worker.terminate();
        resolver(evento.data.centroids);
      } else if (evento.data.type === "error") {
        worker.terminate();
        rejeitar(new Error(evento.data.error));
      }
    };
    worker.onerror = (erro) => {
      worker.terminate();
      rejeitar(erro);
    };

    // Envia dados via memória compartilhada se disponível, senão usa postMessage
    worker.postMessage({
      type: "calculate_new_centroids",
      data: {
        clusters,
        points: usarMemoriaCompartilhada && sharedPointsBuffer ? null : pontos,
        sharedPointsBuffer,
        pointsOffset: 0,
        useSharedMemory: usarMemoriaCompartilhada && sharedPointsBuffer,
      },
    });
  });
};

const convergiu = (centroidesAntigos, centroidesNovos, limiar = 0.01) => {
  for (let i = 0; i < centroidesAntigos.length; i++) {
    if (!centroidesAntigos[i] || !centroidesNovos[i]) continue;
    const dist = distanciaEuclidiana(centroidesAntigos[i], centroidesNovos[i]);
    if (dist > limiar) return false;
  }
  return true;
};

export const executarKmeans = async (pontos, k, iteracoesMaximas = 100, aoIteracao) => {
  if (pontos.length < k) {
    throw new Error(`Número de pontos (${pontos.length}) deve ser maior ou igual a k (${k})`);
  }

  const { pontosNormalizados, faixas } = normalizarDados(pontos);
  let centroides = inicializarCentroides(pontosNormalizados, k);
  const numWorkers = Math.min(navigator.hardwareConcurrency || 4, 8);

  for (let iteracao = 0; iteracao < iteracoesMaximas; iteracao++) {
    const atribuicoes = await atribuirPontosAosClusters(pontosNormalizados, centroides, numWorkers);
    const clusters = Array.from({ length: k }, () => []);

    for (const atrib of atribuicoes) {
      clusters[atrib.centroidIndex].push(atrib.pointIndex);
    }

    const novosCentroides = await calcularNovosCentroides(clusters, pontosNormalizados);

    for (let i = 0; i < novosCentroides.length; i++) {
      if (!novosCentroides[i]) {
        if (centroides[i]) {
          novosCentroides[i] = { ...centroides[i] };
        } else {
          novosCentroides[i] = {
            latitude: Math.random(),
            longitude: Math.random(),
            population: Math.random(),
          };
        }
      }
    }

    if (convergiu(centroides, novosCentroides)) {
      const centroidesFinais = desnormalizarCentroides(novosCentroides, faixas);
      if (aoIteracao) aoIteracao(iteracao + 1, clusters, centroidesFinais, true);
      return {
        clusters,
        centroids: centroidesFinais,
        iterations: iteracao + 1,
        converged: true,
      };
    }

    centroides = novosCentroides;

    if (aoIteracao) {
      const centroidesAtuais = desnormalizarCentroides(centroides, faixas);
      aoIteracao(iteracao + 1, clusters, centroidesAtuais, false);
    }
  }

  const atribuicoes = await atribuirPontosAosClusters(pontosNormalizados, centroides, numWorkers);
  const clusters = Array.from({ length: k }, () => []);
  for (const atrib of atribuicoes) {
    clusters[atrib.centroidIndex].push(atrib.pointIndex);
  }

  const centroidesFinais = desnormalizarCentroides(centroides, faixas);

  return {
    clusters,
    centroids: centroidesFinais,
    iterations: iteracoesMaximas,
    converged: false,
  };
};
