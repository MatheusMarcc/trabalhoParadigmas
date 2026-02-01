const ATRASO_REQUISICAO_MS = 2000;
const MARGEM_SEGURANCA_MS = 500;

const buscarPagina = async (deslocamento, limite, pagina = null) => {
  const maxTentativas = 3;
  let tentativa = 0;

  while (tentativa < maxTentativas) {
    try {
      const cadeiaConsulta = new URLSearchParams({
        offset: deslocamento,
        limit: limite,
        sort: "name",
      }).toString();

      const resposta = await fetch(`/api/cities?${cadeiaConsulta}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!resposta.ok) {
        const status = resposta.status;

        if (status === 429) {
          const tempoEspera = Math.min(15000 * (tentativa + 1), 60000);
          console.warn(`Rate limit atingido. Aguardando ${tempoEspera / 1000}s antes de retry ${tentativa + 1}/${maxTentativas}`);

          self.postMessage({
            type: "rate_limit",
            workerId: idWorkerAtual,
            waitTime: tempoEspera / 1000,
            page: pagina,
          });

          await new Promise((resolver) => setTimeout(resolver, tempoEspera));
          tentativa++;
          continue;
        } else if (status === 403) {
          const dadosErro = await resposta.json().catch(() => ({}));
          throw new Error(`Acesso negado: ${dadosErro.error?.message || dadosErro.message || "Limite excedido"}`);
        } else if (status === 500 || status === 502 || status === 503 || status === 504) {
          const tempoEspera = 2000 * (tentativa + 1);
          await new Promise((resolver) => setTimeout(resolver, tempoEspera));
          tentativa++;
          continue;
        }

        let mensagemErro = `HTTP error! status: ${status}`;
        try {
          const dadosErro = await resposta.json();
          mensagemErro = dadosErro.error?.message || dadosErro.error || mensagemErro;
        } catch {}
        throw new Error(mensagemErro);
      }

      const dados = await resposta.json();
      return dados;
    } catch (erro) {
      tentativa++;
      if (tentativa >= maxTentativas) throw erro;
      await new Promise((resolver) => setTimeout(resolver, 1000 * tentativa));
    }
  }
};

const escreverCidadeNoBuffer = (cidade, bufferCompartilhado, visualizacaoAtomica, tamanhoCabecalho, tamanhoTotalBuffer) => {
  try {
    const jsonString = JSON.stringify(cidade);
    const bytesJson = new TextEncoder().encode(jsonString);
    const tamanhoCidade = 4 + bytesJson.length;

    let indiceEscrita;
    let tentativas = 0;
    const maxTentativas = 100;

    while (tentativas < maxTentativas) {
      indiceEscrita = Atomics.load(visualizacaoAtomica, 0);

      if (indiceEscrita + tamanhoCidade > tamanhoTotalBuffer) {
        console.warn(`Worker ${idWorkerAtual}: Buffer cheio.`);
        return false;
      }

      const indiceEsperado = indiceEscrita;
      const novoIndice = indiceEscrita + tamanhoCidade;
      const indiceReal = Atomics.compareExchange(visualizacaoAtomica, 0, indiceEsperado, novoIndice);

      if (indiceReal === indiceEsperado) {
        indiceEscrita = indiceEsperado;
        break;
      }
      tentativas++;
    }

    if (tentativas >= maxTentativas) {
      console.warn(`Worker ${idWorkerAtual}: Falhou ao reservar espaço.`);
      return false;
    }

    const uint8Array = new Uint8Array(bufferCompartilhado);
    const visualizacao = new DataView(bufferCompartilhado, indiceEscrita, 4);
    visualizacao.setUint32(0, bytesJson.length, true);
    uint8Array.set(bytesJson, indiceEscrita + 4);

    return true;
  } catch (erro) {
    console.error(`Worker ${idWorkerAtual}: Erro ao escrever cidade:`, erro);
    return false;
  }
};

let idWorkerAtual = 0;
let bufferCompartilhado = null;
let visualizacaoAtomica = null;
let tamanhoCabecalho = 0;
let tamanhoTotalBuffer = 0;
let usarMemoriaCompartilhada = false;

self.onmessage = async (evento) => {
  const {
    type,
    startPage,
    endPage,
    limit,
    workerId,
    sharedBuffer: bufferRecebido,
    headerSize: cabecalhoRecebido,
    totalBufferSize: tamanhoRecebido,
    useSharedMemory: usarMemoriaRecebido,
  } = evento.data;

  idWorkerAtual = workerId;

  if (bufferRecebido && usarMemoriaRecebido !== false) {
    try {
      bufferCompartilhado = bufferRecebido;
      tamanhoCabecalho = cabecalhoRecebido || 8;
      tamanhoTotalBuffer = tamanhoRecebido || bufferCompartilhado.byteLength;
      visualizacaoAtomica = new Int32Array(bufferCompartilhado, 0, 2);
      usarMemoriaCompartilhada = true;
    } catch (erro) {
      console.warn(`Worker ${workerId}: Erro ao configurar memória compartilhada:`, erro);
      usarMemoriaCompartilhada = false;
    }
  } else {
    usarMemoriaCompartilhada = false;
  }

  try {
    const resultados = [];
    let totalCidades = 0;
    let cidadesColetadas = 0;

    for (let pagina = startPage; pagina <= endPage; pagina++) {
      const deslocamento = (pagina - 1) * limit;

      try {
        const dados = await buscarPagina(deslocamento, limit, pagina);

        let cidades = [];
        if (dados.data) {
          cidades = Array.isArray(dados.data) ? dados.data : Object.values(dados.data);
        }

        const cidadesValidas = cidades.filter(
          (cidade) =>
            cidade.latitude !== undefined &&
            cidade.longitude !== undefined &&
            cidade.population !== undefined &&
            cidade.population > 0
        );

        if (usarMemoriaCompartilhada && bufferCompartilhado) {
          cidadesValidas.forEach((cidade) => {
            if (escreverCidadeNoBuffer(cidade, bufferCompartilhado, visualizacaoAtomica, tamanhoCabecalho, tamanhoTotalBuffer)) {
              cidadesColetadas++;
            }
          });
        } else {
          resultados.push(...cidadesValidas);
          cidadesColetadas = resultados.length;
        }

        totalCidades += cidades.length;

        self.postMessage({
          type: "progress",
          workerId,
          page: pagina,
          totalPages: endPage - startPage + 1,
          citiesCollected: cidadesColetadas,
          totalCitiesInPage: cidades.length,
        });

        if (pagina < endPage) {
          await new Promise((resolver) => setTimeout(resolver, ATRASO_REQUISICAO_MS));
          await new Promise((resolver) => setTimeout(resolver, MARGEM_SEGURANCA_MS));

          if (pagina % 10 === 0) {
            self.postMessage({
              type: "progress_log",
              workerId,
              message: `Processadas ${pagina - startPage + 1} de ${endPage - startPage + 1} páginas`,
            });
          }
        }
      } catch (erro) {
        self.postMessage({
          type: "error",
          workerId,
          page: pagina,
          error: erro.message,
        });
      }
    }

    self.postMessage({
      type: "complete",
      workerId,
      cities: usarMemoriaCompartilhada ? [] : resultados,
      totalCities: totalCidades,
    });
  } catch (erro) {
    self.postMessage({
      type: "critical_error",
      workerId,
      error: erro.message,
    });
  }
};
