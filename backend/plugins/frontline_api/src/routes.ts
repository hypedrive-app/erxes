import { Router } from 'express';
import { router as facebookRouter } from './modules/integrations/facebook/routes';
import { router as instagramRouter } from './modules/integrations/instagram/routes';
import { router as whatsappRouter } from './modules/integrations/whatsapp/routes';
import { router as plivoRouter } from './modules/integrations/plivo/routes';

export const router: Router = Router();

router.use('/facebook', facebookRouter);
router.use('/instagram', instagramRouter);
router.use('/whatsapp', whatsappRouter);
router.use('/plivo', plivoRouter);
