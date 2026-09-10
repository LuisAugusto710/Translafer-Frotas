import express from "express";
import app from "./dist/vercel-bundle/vercel.mjs";

// Use the tested bundle rather than recompiling workspace TypeScript in Vercel.
const server = express();
server.use(app);

export default server;
