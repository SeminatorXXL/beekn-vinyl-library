const { createApp } = require("./app");

const port = Number.parseInt(process.env.PORT || "3000", 10);
const app = createApp();

app.listen(port, () => {
  console.log(`BVL API listening on port ${port}`);
});
