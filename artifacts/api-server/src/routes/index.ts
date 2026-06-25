import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tripsRouter from "./trips";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tripsRouter);
router.use(dashboardRouter);

export default router;
