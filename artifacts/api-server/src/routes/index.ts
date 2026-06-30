import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import fretesRouter from "./fretes";
import abastecimentosRouter from "./abastecimentos";
import dashboardRouter from "./dashboard";
import backupRouter from "./backup";
import restoreRouter from "./restore";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
router.use(authRouter);

// Everything below requires an authenticated session
router.use(requireAuth);
router.use(fretesRouter);
router.use(abastecimentosRouter);
router.use(dashboardRouter);
router.use(backupRouter);
router.use(restoreRouter);

export default router;
