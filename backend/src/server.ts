import { app } from "./app";
import { env } from "./config/env";

app.listen(env.port, () => {
  console.log(`Plataforma Cross API ouvindo na porta ${env.port}`);
});
