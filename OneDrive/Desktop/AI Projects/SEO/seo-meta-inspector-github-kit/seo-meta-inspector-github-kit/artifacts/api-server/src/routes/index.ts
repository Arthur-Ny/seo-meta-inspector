import { Router, type IRouter } from "express";
import healthRouter from "./health";
import seoRouter from "./seo";
import feedbackRouter from "./feedback";

const router: IRouter = Router();

router.use(healthRouter);
router.use(seoRouter);
router.use(feedbackRouter);

export default router;
