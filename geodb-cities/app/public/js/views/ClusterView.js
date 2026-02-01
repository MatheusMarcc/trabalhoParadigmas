const CORES_CLUSTERS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8",
  "#F7DC6F", "#BB8FCE", "#85C1E2", "#F8B739", "#52BE80",
  "#EC7063", "#5DADE2", "#58D68D", "#F4D03F", "#AF7AC5",
];

let instanciaGraficoClusters = null;

export const renderizarGraficoClusters = (clusters, pontos, centroides) => {
  const canvas = document.getElementById("grafico-clusters");
  if (!canvas) return;

  if (typeof Chart === "undefined") {
    console.warn("Chart.js não carregado. O gráfico será exibido quando a biblioteca estiver disponível.");
    setTimeout(() => renderizarGraficoClusters(clusters, pontos, centroides), 200);
    return;
  }

  if (instanciaGraficoClusters) {
    instanciaGraficoClusters.destroy();
    instanciaGraficoClusters = null;
  }

  const datasets = clusters.map((cluster, indiceCluster) => {
    const cor = CORES_CLUSTERS[indiceCluster % CORES_CLUSTERS.length];
    const dadosCluster = cluster
      .map((indicePonto) => {
        const ponto = pontos[indicePonto];
        if (!ponto) return null;
        return {
          x: ponto.longitude,
          y: ponto.latitude,
          nome: (ponto.city || ponto).name || (ponto.city || ponto).cityName || "",
        };
      })
      .filter(Boolean);

    return {
      label: `Cluster ${indiceCluster + 1} (${dadosCluster.length} cidades)`,
      data: dadosCluster,
      backgroundColor: cor,
      borderColor: cor,
      borderWidth: 1,
      pointRadius: 4,
      pointHoverRadius: 8,
      pointHoverBackgroundColor: cor,
    };
  });

  if (centroides && centroides.length > 0) {
    const dadosCentroides = centroides.map((c, i) => ({
      x: c.longitude,
      y: c.latitude,
      nome: `Centroide ${i + 1}`,
    }));
    datasets.push({
      label: "Centroides",
      data: dadosCentroides,
      backgroundColor: "#1a1a1a",
      borderColor: "#1a1a1a",
      borderWidth: 2,
      pointRadius: 10,
      pointStyle: "cross",
      pointHoverRadius: 14,
    });
  }

  const ctx = canvas.getContext("2d");
  instanciaGraficoClusters = new Chart(ctx, {
    type: "scatter",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: {
            usePointStyle: true,
            padding: 15,
            font: { size: 12 },
          },
        },
        tooltip: {
          backgroundColor: "rgba(0,0,0,0.8)",
          padding: 12,
          callbacks: {
            label: (ctx) => {
              const ponto = ctx.raw;
              const texto = ponto.nome ? `${ponto.nome} | ` : "";
              return `${texto}Lat: ${ponto.y?.toFixed(4)} | Lon: ${ponto.x?.toFixed(4)}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: "Longitude" },
          grid: { color: "rgba(0,0,0,0.06)" },
        },
        y: {
          title: { display: true, text: "Latitude" },
          grid: { color: "rgba(0,0,0,0.06)" },
        },
      },
    },
  });

  requestAnimationFrame(() => {
    if (instanciaGraficoClusters) instanciaGraficoClusters.resize();
  });
  setTimeout(() => {
    if (instanciaGraficoClusters) instanciaGraficoClusters.resize();
  }, 100);
};

export const renderizarClusters = (container, clusters, pontos, centroides) => {
  container.innerHTML = "";

  clusters.forEach((cluster, indiceCluster) => {
    if (cluster.length === 0) return;

    const cardCluster = document.createElement("div");
    cardCluster.className = "card mb-3 border";
    cardCluster.style.borderColor = CORES_CLUSTERS[indiceCluster % CORES_CLUSTERS.length];
    cardCluster.style.borderWidth = "3px";

    const cabecalhoCard = document.createElement("div");
    cabecalhoCard.className = "card-header text-white d-flex justify-content-between align-items-center";
    cabecalhoCard.style.backgroundColor = CORES_CLUSTERS[indiceCluster % CORES_CLUSTERS.length];

    const tituloCabecalho = document.createElement("h5");
    tituloCabecalho.className = "mb-0 fw-bold";
    tituloCabecalho.innerHTML = `
      <i class="bi bi-circle-fill"></i> Cluster ${indiceCluster + 1}
      <span class="badge bg-light text-dark ms-2">${cluster.length} cidades</span>
    `;

    const infoCentroide = document.createElement("small");
    if (centroides[indiceCluster]) {
      infoCentroide.innerHTML = `
        <i class="bi bi-geo-alt"></i>
        Lat: ${centroides[indiceCluster].latitude.toFixed(4)},
        Lon: ${centroides[indiceCluster].longitude.toFixed(4)}
        <br>
        <i class="bi bi-people"></i>
        Pop. média: ${Math.round(centroides[indiceCluster].population).toLocaleString("pt-BR")}
      `;
    }

    cabecalhoCard.appendChild(tituloCabecalho);
    cabecalhoCard.appendChild(infoCentroide);

    const corpoCard = document.createElement("div");
    corpoCard.className = "card-body";

    const listaCidades = document.createElement("div");
    listaCidades.className = "row g-2";
    listaCidades.style.maxHeight = "300px";
    listaCidades.style.overflowY = "auto";

    cluster.forEach((indicePonto) => {
      const ponto = pontos[indicePonto];
      if (!ponto) return;

      const cidade = ponto.city || ponto;
      if (!cidade) return;

      const colunaCidade = document.createElement("div");
      colunaCidade.className = "col-md-6";

      const cardCidade = document.createElement("div");
      cardCidade.className = "card border-0 bg-light mb-2";

      const corpoCidade = document.createElement("div");
      corpoCidade.className = "card-body p-2";

      const nomeCidade = document.createElement("strong");
      nomeCidade.className = "d-block";
      const nome = cidade.name || cidade.cityName || cidade.title || `Cidade ${indicePonto + 1}`;
      nomeCidade.textContent = nome;

      const detalhesCidade = document.createElement("small");
      detalhesCidade.className = "text-muted d-block";
      const populacao = ponto.population || cidade.population || 0;
      const pais = cidade.country || cidade.countryCode || cidade.countryName || cidade.region || "N/A";
      detalhesCidade.innerHTML = `
        ${pais} |
        Pop: ${populacao > 0 ? populacao.toLocaleString("pt-BR") : "N/A"}
      `;

      corpoCidade.appendChild(nomeCidade);
      corpoCidade.appendChild(detalhesCidade);
      cardCidade.appendChild(corpoCidade);
      colunaCidade.appendChild(cardCidade);
      listaCidades.appendChild(colunaCidade);
    });

    corpoCard.appendChild(listaCidades);
    cardCluster.appendChild(cabecalhoCard);
    cardCluster.appendChild(corpoCard);
    container.appendChild(cardCluster);
  });

  container.scrollTop = 0;
};

export const mostrarProgressoClustering = (container, iteracao, iteracoesMaximas) => {
  container.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-warning mb-3" role="status" style="width: 3rem; height: 3rem;">
        <span class="visually-hidden">Processando...</span>
      </div>
      <h5 class="fw-bold">Executando K-Means...</h5>
      <p class="text-muted">Iteração ${iteracao} de ${iteracoesMaximas}</p>
      <div class="progress mt-3" style="height: 25px;">
        <div
          class="progress-bar progress-bar-striped progress-bar-animated bg-warning"
          role="progressbar"
          style="width: ${(iteracao / iteracoesMaximas) * 100}%"
        >
          ${Math.round((iteracao / iteracoesMaximas) * 100)}%
        </div>
      </div>
    </div>
  `;
};
