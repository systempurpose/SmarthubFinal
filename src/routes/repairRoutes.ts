import { Router } from 'express';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
const router = Router();

async function adbShell(command: string): Promise<string> {
    const { stdout } = await execPromise(`adb shell ${command}`);
    return stdout;
}

router.get('/list-packages', async (req, res) => {
    try {
        const output = await adbShell('pm list packages -3');
        const packages = output.split('\n')
            .filter(l => l.startsWith('package:'))
            .map(l => l.replace('package:', '').trim());
        res.json(packages);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/uninstall', async (req, res) => {
    const { packages } = req.body;
    if (!Array.isArray(packages) || packages.length === 0) {
        return res.status(400).json({ error: 'No packages provided' });
    }
    const results = [];
    for (const pkg of packages) {
        try {
            const { stdout, stderr } = await execPromise(`adb uninstall ${pkg}`);
            results.push({ package: pkg, success: !stderr, message: stdout || stderr });
        } catch (err: any) {
            results.push({ package: pkg, success: false, message: err.message });
        }
    }
    res.json({ results });
});

// Optional: firmware flash placeholder
router.post('/flash-recovery', async (req, res) => {
    res.json({ warning: 'Firmware flashing not fully implemented. Use with extreme caution.' });
});

export default router;