const validarAmbiente = () => {
  const variaveisObrigatorias = ["PORT", "RAPIDAPI_KEY"];
  const variaveisFaltando = variaveisObrigatorias.filter(
    (nomeVariavel) => !process.env[nomeVariavel]
  );

  if (variaveisFaltando.length > 0) {
    throw new Error(
      `Missing required environment variables: ${variaveisFaltando.join(", ")}\n` +
        "Please check your .env file or environment configuration."
    );
  }

  const porta = parseInt(process.env.PORT, 10);
  if (isNaN(porta) || porta < 1 || porta > 65535) {
    throw new Error(
      `Invalid PORT value: ${process.env.PORT}. Must be a number between 1 and 65535.`
    );
  }

  if (process.env.RAPIDAPI_KEY.length < 10) {
    throw new Error("RAPIDAPI_KEY appears to be invalid (too short).");
  }

  console.log("Environment variables validated successfully");
};

module.exports = { validarAmbiente };
