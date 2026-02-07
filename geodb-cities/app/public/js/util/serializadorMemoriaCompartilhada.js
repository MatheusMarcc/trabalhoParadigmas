export const calcularTamanhoBuffer = (cidades) => {
  let tamanhoTotal = 0;
  cidades.forEach((cidade) => {
    const jsonString = JSON.stringify(cidade);
    const bytesJson = new TextEncoder().encode(jsonString).length;
    tamanhoTotal += 4 + bytesJson;
  });
  return tamanhoTotal;
};

export const serializarCidade = (cidade, deslocamento, buffer) => {
  const jsonString = JSON.stringify(cidade);
  const bytesJson = new TextEncoder().encode(jsonString);
  const tamanho = bytesJson.length;

  const visualizacao = new DataView(buffer.buffer, buffer.byteOffset + deslocamento, 4);
  visualizacao.setUint32(0, tamanho, true);
  buffer.set(bytesJson, deslocamento + 4);

  return deslocamento + 4 + tamanho;
};

export const desserializarCidade = (deslocamento, buffer) => {
  try {
    const visualizacao = new DataView(buffer.buffer, buffer.byteOffset + deslocamento, 4);
    const tamanho = visualizacao.getUint32(0, true);

    if (tamanho === 0 || tamanho > buffer.length - deslocamento - 4) {
      return null;
    }

    const bytesJson = buffer.slice(deslocamento + 4, deslocamento + 4 + tamanho);
    const jsonString = new TextDecoder().decode(bytesJson);
    return JSON.parse(jsonString);
  } catch (erro) {
    console.error("Erro ao desserializar cidade:", erro);
    return null;
  }
};

export const serializarCidades = (cidades) => {
  const tamanhoTotal = calcularTamanhoBuffer(cidades);
  const buffer = new ArrayBuffer(tamanhoTotal);
  const uint8Array = new Uint8Array(buffer);

  let deslocamento = 0;
  cidades.forEach((cidade) => {
    deslocamento = serializarCidade(cidade, deslocamento, uint8Array);
  });

  return buffer;
};

export const desserializarCidades = (buffer, maxCidades = Infinity) => {
  const uint8Array = new Uint8Array(buffer);
  const cidades = [];
  let deslocamento = 0;
  let contador = 0;

  while (deslocamento < uint8Array.length && contador < maxCidades) {
    if (deslocamento + 4 > uint8Array.length) break;

    const cidade = desserializarCidade(deslocamento, uint8Array);
    if (!cidade) break;

    cidades.push(cidade);
    contador++;

    const visualizacao = new DataView(buffer, deslocamento, 4);
    const tamanho = visualizacao.getUint32(0, true);
    deslocamento += 4 + tamanho;
  }

  return cidades;
};

export const estimarTamanhoBuffer = (numCidades) => {
  const tamanhoMedioCidade = 200;
  const sobrecarga = 4;
  return numCidades * (tamanhoMedioCidade + sobrecarga) * 1.2;
};

/**
 * Serializa um array de pontos (objetos com latitude, longitude, population) em um buffer
 * @param {Array} pontos - Array de pontos para serializar
 * @returns {ArrayBuffer} Buffer com pontos serializados
 */
export const serializarPontos = (pontos) => {
  if (!Array.isArray(pontos) || pontos.length === 0) {
    return new ArrayBuffer(0);
  }

  let tamanhoTotal = 0;
  pontos.forEach((ponto) => {
    const jsonString = JSON.stringify(ponto);
    const bytesJson = new TextEncoder().encode(jsonString).length;
    tamanhoTotal += 4 + bytesJson;
  });

  const buffer = new ArrayBuffer(tamanhoTotal);
  const uint8Array = new Uint8Array(buffer);

  let deslocamento = 0;
  pontos.forEach((ponto) => {
    const jsonString = JSON.stringify(ponto);
    const bytesJson = new TextEncoder().encode(jsonString);
    const tamanho = bytesJson.length;

    const visualizacao = new DataView(buffer, deslocamento, 4);
    visualizacao.setUint32(0, tamanho, true);
    uint8Array.set(bytesJson, deslocamento + 4);

    deslocamento += 4 + tamanho;
  });

  return buffer;
};

/**
 * Serializa um array de centroides em um buffer
 * @param {Array} centroides - Array de centroides para serializar
 * @returns {ArrayBuffer} Buffer com centroides serializados
 */
export const serializarCentroides = (centroides) => {
  return serializarPontos(centroides); // Mesma estrutura que pontos
};

/**
 * Desserializa pontos de um buffer
 * @param {ArrayBuffer|SharedArrayBuffer} buffer - Buffer com pontos serializados
 * @param {number} offset - Offset inicial (padrão: 0)
 * @param {number} maxPontos - Número máximo de pontos a ler (padrão: Infinity)
 * @returns {Array} Array de pontos desserializados
 */
export const desserializarPontos = (buffer, offset = 0, maxPontos = Infinity) => {
  if (!buffer || buffer.byteLength === 0) {
    return [];
  }

  const uint8Array = new Uint8Array(buffer);
  const pontos = [];
  let deslocamento = offset;
  let contador = 0;

  while (deslocamento < uint8Array.length && contador < maxPontos) {
    if (deslocamento + 4 > uint8Array.length) break;

    const visualizacao = new DataView(buffer, deslocamento, 4);
    const tamanho = visualizacao.getUint32(0, true);

    if (tamanho === 0 || tamanho > uint8Array.length - deslocamento - 4) break;

    const bytesJson = uint8Array.slice(deslocamento + 4, deslocamento + 4 + tamanho);
    const jsonString = new TextDecoder().decode(bytesJson);
    const ponto = JSON.parse(jsonString);

    pontos.push(ponto);
    contador++;
    deslocamento += 4 + tamanho;
  }

  return pontos;
};

/**
 * Estima o tamanho necessário do buffer para serializar pontos
 * @param {number} numPontos - Número de pontos
 * @returns {number} Tamanho estimado em bytes
 */
export const estimarTamanhoBufferPontos = (numPontos) => {
  const tamanhoMedioPonto = 100; // Pontos são menores que cidades completas
  const sobrecarga = 4;
  return numPontos * (tamanhoMedioPonto + sobrecarga) * 1.2;
};
