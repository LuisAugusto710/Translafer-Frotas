import { Router, type IRouter } from "express";
import healthRouter from "./health";
import fretesRouter from "./fretes";
import abastecimentosRouter from "./abastecimentos";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fretesRouter);
router.use(abastecimentosRouter);
router.use(dashboardRouter);

export default router;
