const distanciaEuclidiana = (ponto1, ponto2) => {
  const diffLat = ponto1.latitude - ponto2.latitude;
  const diffLon = ponto1.longitude - ponto2.longitude;
  const diffPop = ponto1.population - ponto2.population;
  return Math.sqrt(diffLat * diffLat + diffLon * diffLon + diffPop * diffPop);
};

self.onmessage = (evento) => {
  const { type, data } = evento.data;

  switch (type) {
    case "assign_points": {
      const { points: pontos, centroids: centroides, startIndex: indiceInicio, endIndex: indiceFim } = data;
      const atribuicoes = [];

      for (let i = indiceInicio; i < indiceFim; i++) {
        const ponto = pontos[i];
        let distMinima = Infinity;
        let centroideMaisProximo = 0;

        for (let j = 0; j < centroides.length; j++) {
          const distancia = distanciaEuclidiana(ponto, centroides[j]);
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
      const { clusters, points: pontos } = data;
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
          const ponto = pontos[indicePonto];
          somaLat += ponto.latitude;
          somaLon += ponto.longitude;
          somaPop += ponto.population;
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
