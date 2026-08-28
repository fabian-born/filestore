import { Router } from 'express';

const router = Router();

// Not sensitive - just lets the App Info tab show what's actually deployed.
router.get('/version', (req, res) => {
  res.json({ version: process.env.APP_VERSION || 'dev' });
});

export default router;
