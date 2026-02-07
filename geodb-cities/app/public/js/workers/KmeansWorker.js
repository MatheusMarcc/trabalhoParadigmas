import { desserializarPontos } from "../util/serializadorMemoriaCompartilhada.js";

const distanciaEuclidiana = (ponto1, ponto2) => {
  const diffLat = ponto1.latitude - ponto2.latitude;
  const diffLon = ponto1.longitude - ponto2.longitude;
  const diffPop = ponto1.population - ponto2.population;
  return Math.sqrt(diffLat * diffLat + diffLon * diffLon + diffPop * diffPop);
};

// Funções de desserialização são importadas do módulo serializador

self.onmessage = (evento) => {
  const { type, data } = evento.data;

  switch (type) {
    case "assign_points": {
      const {
        points: pontos,
        centroids: centroides,
        startIndex: indiceInicio,
        endIndex: indiceFim,
        sharedPointsBuffer,
        sharedCentroidsBuffer,
        pointsOffset,
        centroidsOffset,
        useSharedMemory,
      } = data;

      let pontosProcessar = pontos;
      let centroidesProcessar = centroides;

      // Tenta usar memória compartilhada se disponível
      if (useSharedMemory && sharedPointsBuffer && sharedCentroidsBuffer) {
        try {
          const pontosDesserializados = desserializarPontos(sharedPointsBuffer, pointsOffset || 0);
          const centroidesDesserializados = desserializarPontos(sharedCentroidsBuffer, centroidsOffset || 0);

          if (pontosDesserializados && centroidesDesserializados && pontosDesserializados.length > 0 && centroidesDesserializados.length > 0) {
            pontosProcessar = pontosDesserializados;
            centroidesProcessar = centroidesDesserializados;
          } else {
            console.warn("Falha ao desserializar da memória compartilhada, usando dados do postMessage");
          }
        } catch (erro) {
          console.warn("Erro ao processar memória compartilhada:", erro);
        }
      }

      if (!pontosProcessar || !centroidesProcessar) {
        self.postMessage({
          type: "error",
          error: "Dados inválidos para processamento",
        });
        return;
      }

      const atribuicoes = [];

      for (let i = indiceInicio; i < indiceFim && i < pontosProcessar.length; i++) {
        const ponto = pontosProcessar[i];
        let distMinima = Infinity;
        let centroideMaisProximo = 0;

        for (let j = 0; j < centroidesProcessar.length; j++) {
          const distancia = distanciaEuclidiana(ponto, centroidesProcessar[j]);
          if (distancia < distMinima) {
            distMinima = distancia;
            centroideMaisProximo = j;
          }
        }

        atribuicoes.push({
          pointIndex: i,
          centroidIndex: centroideMaisProximo,
          distance: distMinima,
        });
      }

      self.postMessage({
        type: "assignments_complete",
        assignments: atribuicoes,
        startIndex: indiceInicio,
        endIndex: indiceFim,
      });
      break;
    }

    case "calculate_new_centroids": {
      const { clusters, points: pontos, sharedPointsBuffer, pointsOffset, useSharedMemory } = data;

      let pontosProcessar = pontos;

      // Tenta usar memória compartilhada se disponível
      if (useSharedMemory && sharedPointsBuffer) {
        try {
          const pontosDesserializados = desserializarPontos(sharedPointsBuffer, pointsOffset || 0);

          if (pontosDesserializados) {
            pontosProcessar = pontosDesserializados;
          } else {
            console.warn("Falha ao desserializar pontos da memória compartilhada, usando dados do postMessage");
          }
        } catch (erro) {
          console.warn("Erro ao processar memória compartilhada:", erro);
        }
      }

      if (!pontosProcessar) {
        self.postMessage({
          type: "error",
          error: "Dados inválidos para processamento",
        });
        return;
      }

      const novosCentroides = [];

      for (let idCluster = 0; idCluster < clusters.length; idCluster++) {
        const pontosCluster = clusters[idCluster];

        if (pontosCluster.length === 0) {
          novosCentroides.push(null);
          continue;
        }

        let somaLat = 0;
        let somaLon = 0;
        let somaPop = 0;

        for (const indicePonto of pontosCluster) {
          if (indicePonto >= pontosProcessar.length) continue;
          const ponto = pontosProcessar[indicePonto];
          somaLat += ponto.latitude;
          somaLon += ponto.longitude;
          somaPop += ponto.population || 0;
        }

        const quantidade = pontosCluster.length;
        novosCentroides.push({
          latitude: somaLat / quantidade,
          longitude: somaLon / quantidade,
          population: somaPop / quantidade,
        });
      }

      self.postMessage({
        type: "centroids_complete",
        centroids: novosCentroides,
      });
      break;
    }

    default:
      self.postMessage({
        type: "error",
        error: `Unknown message type: ${type}`,
      });
  }
};
