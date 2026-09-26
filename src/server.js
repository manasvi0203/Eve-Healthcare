const createApp = require("./app");
const config = require("./config");

const app = createApp();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`EVE Healthcare backend listening on port ${config.port} [${config.env}]`);
  // eslint-disable-next-line no-console
  console.log(`Swagger docs: http://localhost:${config.port}/api/docs`);
});
