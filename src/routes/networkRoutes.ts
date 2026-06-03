import { Router } from 'express';
import { connectivityInfo } from '../adb';

const router = Router();

router.get('/status/:id', async (req, res) => {
  try {
    const deviceId = req.params.id;
    const netInfo = await connectivityInfo(deviceId);
    res.json(netInfo);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;