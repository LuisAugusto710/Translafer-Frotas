import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminResetRouter from "./admin-reset";
import fretesRouter from "./fretes";
import abastecimentosRouter from "./abastecimentos";
import despesasRouter from "./despesas";
import dashboardRouter from "./dashboard";
import backupRouter from "./backup";
import restoreRouter from "./restore";
import fleetConfigsRouter from "./fleet-configs";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
router.use(authRouter);
router.use(adminResetRouter);

// Everything below requires an authenticated session
router.use(requireAuth);
router.use(fretesRouter);
router.use(abastecimentosRouter);
router.use(despesasRouter);
router.use(dashboardRouter);
router.use(backupRouter);
router.use(restoreRouter);
router.use(fleetConfigsRouter);

export default router;
