/**
 * Módulo de cache persistente para dados de cidades usando IndexedDB
 * Implementa estratégia de cache-first com fallback para rede
 */

const DB_NAME = "geodb_cities_cache";
const DB_VERSION = 1;
const STORE_NAME = "cities";
const CACHE_KEY = "cities_data";
const CACHE_TIMESTAMP_KEY = "cities_timestamp";
const CACHE_EXPIRY_DAYS = 30; // Cache válido por 30 dias

/**
 * Inicializa o banco de dados IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
const inicializarDB = () => {
  return new Promise((resolver, rejeitar) => {
    const requisicao = indexedDB.open(DB_NAME, DB_VERSION);

    requisicao.onerror = () => {
      rejeitar(new Error(`Erro ao abrir IndexedDB: ${requisicao.error}`));
    };

    requisicao.onsuccess = () => {
      resolver(requisicao.result);
    };

    requisicao.onupgradeneeded = (evento) => {
      const db = evento.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        objectStore.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
};

/**
 * Verifica se o cache está válido (não expirado)
 * @param {number} timestamp - Timestamp do cache
 * @returns {boolean}
 */
const cacheValido = (timestamp) => {
  if (!timestamp) return false;
  const agora = Date.now();
  const diferenca = agora - timestamp;
  const diasExpirados = diferenca / (1000 * 60 * 60 * 24);
  return diasExpirados < CACHE_EXPIRY_DAYS;
};

/**
 * Salva dados de cidades no cache IndexedDB
 * @param {Array} cidades - Array de cidades para cachear
 * @returns {Promise<void>}
 */
export const salvarCacheCidades = async (cidades) => {
  try {
    const db = await inicializarDB();
    const transacao = db.transaction([STORE_NAME], "readwrite");
    const store = transacao.objectStore(STORE_NAME);

    // Limpa cache antigo
    await new Promise((resolver, rejeitar) => {
      const requisicaoLimpeza = store.clear();
      requisicaoLimpeza.onsuccess = () => resolver();
      requisicaoLimpeza.onerror = () => rejeitar(requisicaoLimpeza.error);
    });

    // Salva novas cidades com timestamp
    const timestamp = Date.now();
    const dadosCache = {
      id: CACHE_KEY,
      cidades,
      timestamp,
    };

    await new Promise((resolver, rejeitar) => {
      const requisicao = store.put(dadosCache);
      requisicao.onsuccess = () => {
        console.log(`Cache salvo: ${cidades.length} cidades em ${new Date(timestamp).toLocaleString()}`);
        resolver();
      };
      requisicao.onerror = () => rejeitar(requisicao.error);
    });

    transacao.oncomplete = () => db.close();
  } catch (erro) {
    console.warn("Erro ao salvar cache:", erro);
    // Fallback para LocalStorage se IndexedDB falhar
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cidades));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (e) {
      console.warn("Erro ao salvar no LocalStorage:", e);
    }
  }
};

/**
 * Carrega dados de cidades do cache IndexedDB
 * @returns {Promise<Array|null>} Array de cidades ou null se não existir cache válido
 */
export const carregarCacheCidades = async () => {
  try {
    const db = await inicializarDB();
    const transacao = db.transaction([STORE_NAME], "readonly");
    const store = transacao.objectStore(STORE_NAME);

    return new Promise((resolver) => {
      const requisicao = store.get(CACHE_KEY);

      requisicao.onsuccess = () => {
        const resultado = requisicao.result;
        transacao.oncomplete = () => db.close();

        if (!resultado || !resultado.cidades || !Array.isArray(resultado.cidades)) {
          console.log("Cache não encontrado no IndexedDB, tentando LocalStorage...");
          // Fallback para LocalStorage
          try {
            const cacheLocal = localStorage.getItem(CACHE_KEY);
            const timestampLocal = localStorage.getItem(CACHE_TIMESTAMP_KEY);
            if (cacheLocal && timestampLocal) {
              const timestamp = parseInt(timestampLocal, 10);
              if (cacheValido(timestamp)) {
                const cidades = JSON.parse(cacheLocal);
                console.log(`Cache carregado do LocalStorage: ${cidades.length} cidades`);
                resolver(cidades);
                return;
              }
            }
          } catch (e) {
            console.warn("Erro ao carregar do LocalStorage:", e);
          }
          resolver(null);
          return;
        }

        if (!cacheValido(resultado.timestamp)) {
          console.log("Cache expirado, será necessário atualizar");
          resolver(null);
          return;
        }

        console.log(
          `Cache carregado do IndexedDB: ${resultado.cidades.length} cidades (cacheado em ${new Date(resultado.timestamp).toLocaleString()})`
        );
        resolver(resultado.cidades);
      };

      requisicao.onerror = () => {
        transacao.oncomplete = () => db.close();
        console.warn("Erro ao ler cache do IndexedDB, tentando LocalStorage...");
        // Fallback para LocalStorage
        try {
          const cacheLocal = localStorage.getItem(CACHE_KEY);
          const timestampLocal = localStorage.getItem(CACHE_TIMESTAMP_KEY);
          if (cacheLocal && timestampLocal) {
            const timestamp = parseInt(timestampLocal, 10);
            if (cacheValido(timestamp)) {
              const cidades = JSON.parse(cacheLocal);
              console.log(`Cache carregado do LocalStorage: ${cidades.length} cidades`);
              resolver(cidades);
              return;
            }
          }
        } catch (e) {
          console.warn("Erro ao carregar do LocalStorage:", e);
        }
        resolver(null);
      };
    });
  } catch (erro) {
    console.warn("Erro ao inicializar IndexedDB:", erro);
    // Fallback para LocalStorage
    try {
      const cacheLocal = localStorage.getItem(CACHE_KEY);
      const timestampLocal = localStorage.getItem(CACHE_TIMESTAMP_KEY);
      if (cacheLocal && timestampLocal) {
        const timestamp = parseInt(timestampLocal, 10);
        if (cacheValido(timestamp)) {
          const cidades = JSON.parse(cacheLocal);
          console.log(`Cache carregado do LocalStorage: ${cidades.length} cidades`);
          return cidades;
        }
      }
    } catch (e) {
      console.warn("Erro ao carregar do LocalStorage:", e);
    }
    return null;
  }
};

/**
 * Limpa o cache de cidades
 * @returns {Promise<void>}
 */
export const limparCacheCidades = async () => {
  try {
    const db = await inicializarDB();
    const transacao = db.transaction([STORE_NAME], "readwrite");
    const store = transacao.objectStore(STORE_NAME);

    await new Promise((resolver, rejeitar) => {
      const requisicao = store.clear();
      requisicao.onsuccess = () => {
        console.log("Cache limpo do IndexedDB");
        resolver();
      };
      requisicao.onerror = () => rejeitar(requisicao.error);
    });

    transacao.oncomplete = () => db.close();
  } catch (erro) {
    console.warn("Erro ao limpar cache do IndexedDB:", erro);
  }

  // Limpa LocalStorage também
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    console.log("Cache limpo do LocalStorage");
  } catch (e) {
    console.warn("Erro ao limpar LocalStorage:", e);
  }
};

/**
 * Verifica se existe cache válido disponível
 * @returns {Promise<boolean>}
 */
export const existeCacheValido = async () => {
  const cache = await carregarCacheCidades();
  return cache !== null && cache.length > 0;
};

/**
 * Carrega cidades do arquivo JSON estático (sample-cities.json.bak)
 * @returns {Promise<Array|null>} Array de cidades ou null se não conseguir carregar
 */
export const carregarCidadesDoArquivo = async () => {
  try {
    const resposta = await fetch("/data/sample-cities.json.bak");
    
    if (!resposta.ok) {
      console.warn(`Arquivo estático não encontrado: ${resposta.status}`);
      return null;
    }

    const cidades = await resposta.json();
    
    if (!Array.isArray(cidades) || cidades.length === 0) {
      console.warn("Arquivo estático não contém array válido de cidades");
      return null;
    }

    // Valida e filtra cidades com dados necessários
    const cidadesValidas = cidades.filter(
      (cidade) =>
        cidade.latitude !== undefined &&
        cidade.longitude !== undefined &&
        cidade.population !== undefined &&
        cidade.population > 0
    );

    console.log(`Arquivo estático carregado: ${cidadesValidas.length} cidades válidas de ${cidades.length} totais`);
    
    return cidadesValidas;
  } catch (erro) {
    console.warn("Erro ao carregar arquivo estático:", erro);
    return null;
  }
};
