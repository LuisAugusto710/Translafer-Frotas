import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./lib/session";
import { csrfProtection } from "./middlewares/auth";

const app: Express = express();

// Behind the Replit reverse proxy: trust the first proxy hop so secure
// cookies and req.ip work correctly.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Session + CSRF must run before the API routes. Frontend and API are
// same-origin behind the proxy, so no CORS layer is needed.
app.use(sessionMiddleware);
app.use(csrfProtection);

app.use("/api", router);

export default app;
