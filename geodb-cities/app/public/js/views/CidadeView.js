const mostrarErroListaCidades = (elemento, mensagem) => {
  elemento.style.display = "block";
  elemento.className = "alert alert-danger mt-4";
  elemento.setAttribute("role", "alert");
  elemento.innerHTML = `<strong>Error:</strong> ${mensagem}`;
};

const limparErroListaCidades = (elemento) => {
  elemento.innerHTML = "";
  elemento.style.display = "none";
  elemento.removeAttribute("role");
};

const mostrarCarregamento = (elemento) => {
  elemento.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      <p class="mt-2 text-muted">Loading cities...</p>
    </div>
  `;
};

const renderizarListaCidades = (elemento, cidades, aoSelecionarCidade, estaSelecionada) => {
  elemento.innerHTML = "";

  if (!cidades || cidades.length === 0) {
    elemento.innerHTML = `
      <div class="alert alert-info mt-4" role="alert">
        <i class="bi bi-info-circle"></i> No cities found.
      </div>
    `;
    return;
  }

  cidades.forEach((cidade) => {
    const itemCidade = document.createElement("div");
    itemCidade.className = "card mb-3 border";
    itemCidade.setAttribute("data-city-id", cidade.id || "");

    if (estaSelecionada && estaSelecionada(cidade.id)) {
      itemCidade.classList.add("border-success", "bg-light");
    }

    const corpoCard = document.createElement("div");
    corpoCard.className = "card-body";

    const nomeCidade = document.createElement("h5");
    nomeCidade.className = "card-title d-flex justify-content-between align-items-center";
    nomeCidade.innerHTML = `
      <span>${cidade.name || "Unknown"}</span>
      ${estaSelecionada && estaSelecionada(cidade.id)
        ? '<span class="badge bg-success"><i class="bi bi-check-circle"></i> Selected</span>'
        : ''}
    `;

    const paisCidade = document.createElement("p");
    paisCidade.className = "card-text mb-1";
    paisCidade.innerHTML = `<i class="bi bi-flag text-primary"></i> <strong>Country:</strong> ${cidade.country || "N/A"}`;

    const regiaoCidade = document.createElement("p");
    regiaoCidade.className = "card-text mb-1 text-muted small";
    regiaoCidade.innerHTML = `<i class="bi bi-geo-alt text-secondary"></i> Region: ${cidade.region || "N/A"} ${cidade.regionCode ? `(${cidade.regionCode})` : ""}`;

    const populacaoCidade = document.createElement("p");
    populacaoCidade.className = "card-text mb-2";
    const populacao = cidade.population ? cidade.population.toLocaleString("en-US") : "N/A";
    populacaoCidade.innerHTML = `<i class="bi bi-people text-info"></i> <strong>Population:</strong> ${populacao}`;

    const botaoSelecionar = document.createElement("button");
    botaoSelecionar.className = estaSelecionada && estaSelecionada(cidade.id)
      ? "btn btn-success btn-sm"
      : "btn btn-primary btn-sm";
    botaoSelecionar.type = "button";
    botaoSelecionar.innerHTML = estaSelecionada && estaSelecionada(cidade.id)
      ? '<i class="bi bi-check-circle"></i> Selected'
      : '<i class="bi bi-plus-circle"></i> Selecionar Cidade';
    botaoSelecionar.setAttribute("aria-label", `Selecionar ${cidade.name}`);
    botaoSelecionar.disabled = estaSelecionada && estaSelecionada(cidade.id);

    if (aoSelecionarCidade) {
      botaoSelecionar.addEventListener("click", () => aoSelecionarCidade(cidade));
    }

    corpoCard.appendChild(nomeCidade);
    corpoCard.appendChild(paisCidade);
    corpoCard.appendChild(regiaoCidade);
    corpoCard.appendChild(populacaoCidade);
    corpoCard.appendChild(botaoSelecionar);
    itemCidade.appendChild(corpoCard);
    elemento.appendChild(itemCidade);
  });
};

const renderizarListaCidadesSelecionadas = (elemento, cidadesSelecionadas, aoRemoverCidade) => {
  elemento.innerHTML = "";

  if (!cidadesSelecionadas || cidadesSelecionadas.length === 0) {
    elemento.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="bi bi-inbox display-4 d-block mb-3"></i>
        <p class="mb-0">No cities selected yet</p>
        <small>Click "Select City" to add cities here</small>
      </div>
    `;
    return;
  }

  cidadesSelecionadas.forEach((cidade) => {
    const itemCidade = document.createElement("div");
    itemCidade.className = "card mb-2 border-success";
    itemCidade.setAttribute("data-selected-city-id", cidade.id || "");

    const corpoCard = document.createElement("div");
    corpoCard.className = "card-body p-3";

    const linhaCabecalho = document.createElement("div");
    linhaCabecalho.className = "d-flex justify-content-between align-items-start mb-2";

    const nomeCidade = document.createElement("h6");
    nomeCidade.className = "card-title mb-0 fw-bold";
    nomeCidade.textContent = cidade.name || "Unknown";

    const botaoRemover = document.createElement("button");
    botaoRemover.className = "btn btn-outline-danger btn-sm";
    botaoRemover.type = "button";
    botaoRemover.innerHTML = '<i class="bi bi-x-circle"></i>';
    botaoRemover.setAttribute("aria-label", `Remove ${cidade.name}`);
    botaoRemover.title = "Remove city";

    if (aoRemoverCidade) {
      botaoRemover.addEventListener("click", () => aoRemoverCidade(cidade.id));
    }

    linhaCabecalho.appendChild(nomeCidade);
    linhaCabecalho.appendChild(botaoRemover);

    const infoCidade = document.createElement("div");
    infoCidade.className = "small text-muted";
    infoCidade.innerHTML = `
      <div><i class="bi bi-flag"></i> ${cidade.country || "N/A"}</div>
      <div><i class="bi bi-people"></i> ${cidade.population ? cidade.population.toLocaleString("en-US") : "N/A"}</div>
    `;

    corpoCard.appendChild(linhaCabecalho);
    corpoCard.appendChild(infoCidade);
    itemCidade.appendChild(corpoCard);
    elemento.appendChild(itemCidade);
  });
};

const atualizarContadorSelecionadas = (elemento, quantidade) => {
  if (elemento) {
    elemento.textContent = quantidade;
  }
};

const renderizarPaginaAtual = (elemento, pagina) => {
  elemento.textContent = `Página ${pagina}`;
  elemento.setAttribute("aria-label", `Página atual: ${pagina}`);
};

export {
  limparErroListaCidades,
  renderizarListaCidades,
  renderizarPaginaAtual,
  mostrarErroListaCidades,
  mostrarCarregamento,
  renderizarListaCidadesSelecionadas,
  atualizarContadorSelecionadas,
};
