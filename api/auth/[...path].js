let appPromise;

module.exports = async function handler(req, res) {
  appPromise ??= import("../../artifacts/api-server/dist/vercel-bundle/vercel.mjs").then((m) => m.default);
  const app = await appPromise;
  return app(req, res);
};
