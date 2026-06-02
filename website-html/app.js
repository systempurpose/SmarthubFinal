const RELEASE_OWNER = 'systempurpose';
const RELEASE_REPO = 'SmartHub3';

const RELEASE_FALLBACK_URL = `https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases/latest`;
const RELEASE_API_URL = `https://api.github.com/repos/${RELEASE_OWNER}/${RELEASE_REPO}/releases/latest`;

const TRACKING_NAMESPACE = 'smarthub3-portal';
const TRACKING_KEY = 'windows-download-clicks';

let resolvedDownloadUrl = RELEASE_FALLBACK_URL;

const els = {
  downloadBtn: document.getElementById('downloadBtn'),
  downloadStatus: document.getElementById('downloadStatus'),
  metricVersion: document.getElementById('metricVersion'),
  metricGithubDownloads: document.getElementById('metricGithubDownloads'),
  metricTrackedClicks: document.getElementById('metricTrackedClicks'),
  metricPublishedAt: document.getElementById('metricPublishedAt'),
  siteUrl: document.getElementById('siteUrl'),
};

function setStatus(message) {
  if (els.downloadStatus) {
    els.downloadStatus.textContent = message;
  }
}

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '--';
  return new Intl.NumberFormat().format(num);
}

function formatDate(isoText) {
  if (!isoText) return '--';
  const dt = new Date(isoText);
  if (Number.isNaN(dt.getTime())) return '--';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(dt);
}

function pickWindowsAsset(assets) {
  if (!Array.isArray(assets) || !assets.length) return null;

  const scored = assets
    .filter((asset) => asset && typeof asset.browser_download_url === 'string')
    .map((asset) => {
      const name = String(asset.name || '').toLowerCase();
      let score = 0;

      if (name.endsWith('.exe')) score += 100;
      if (name.endsWith('.msi')) score += 90;
      if (name.endsWith('.zip')) score += 60;
      if (name.includes('win') || name.includes('windows') || name.includes('setup') || name.includes('installer')) {
        score += 30;
      }

      return { asset, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.length ? scored[0].asset : null;
}

async function loadReleaseMetrics() {
  try {
    const res = await fetch(RELEASE_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Release API HTTP ${res.status}`);
    }

    const release = await res.json();
    const tag = release && typeof release.tag_name === 'string' ? release.tag_name : 'latest';
    const publishedAt = release && typeof release.published_at === 'string' ? release.published_at : '';

    const assets = Array.isArray(release && release.assets) ? release.assets : [];
    const selectedAsset = pickWindowsAsset(assets);

    if (selectedAsset && typeof selectedAsset.browser_download_url === 'string') {
      resolvedDownloadUrl = selectedAsset.browser_download_url;
    } else if (release && typeof release.html_url === 'string') {
      resolvedDownloadUrl = release.html_url;
    } else {
      resolvedDownloadUrl = RELEASE_FALLBACK_URL;
    }

    const githubDownloads = assets.reduce((sum, asset) => {
      const count = Number(asset && asset.download_count);
      return sum + (Number.isFinite(count) ? count : 0);
    }, 0);

    if (els.metricVersion) els.metricVersion.textContent = tag;
    if (els.metricPublishedAt) els.metricPublishedAt.textContent = formatDate(publishedAt);
    if (els.metricGithubDownloads) els.metricGithubDownloads.textContent = formatNumber(githubDownloads);

    setStatus('Ready. Download button tracks clicks and redirects to the latest Windows app asset.');
  } catch {
    if (els.metricVersion) els.metricVersion.textContent = 'latest';
    if (els.metricPublishedAt) els.metricPublishedAt.textContent = '--';
    if (els.metricGithubDownloads) els.metricGithubDownloads.textContent = '--';
    resolvedDownloadUrl = RELEASE_FALLBACK_URL;

    setStatus('Release API is unavailable right now. Download will open the latest release page.');
  }
}

async function loadTrackedClicks() {
  try {
    const url = `https://api.countapi.xyz/get/${encodeURIComponent(TRACKING_NAMESPACE)}/${encodeURIComponent(TRACKING_KEY)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Tracking API unavailable');

    const data = await res.json();
    const count = Number(data && data.value);
    if (els.metricTrackedClicks) {
      els.metricTrackedClicks.textContent = formatNumber(Number.isFinite(count) ? count : 0);
    }
  } catch {
    if (els.metricTrackedClicks) {
      els.metricTrackedClicks.textContent = '--';
    }
  }
}

async function incrementTrackedClicks() {
  try {
    const url = `https://api.countapi.xyz/hit/${encodeURIComponent(TRACKING_NAMESPACE)}/${encodeURIComponent(TRACKING_KEY)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Tracking increment failed');

    const data = await res.json();
    const count = Number(data && data.value);
    if (els.metricTrackedClicks && Number.isFinite(count)) {
      els.metricTrackedClicks.textContent = formatNumber(count);
    }
  } catch {
    // best-effort tracking only
  }
}

async function onDownloadClick() {
  if (!els.downloadBtn) return;

  els.downloadBtn.disabled = true;
  setStatus('Preparing secure redirect to Windows download...');

  try {
    await incrementTrackedClicks();
  } finally {
    window.location.href = resolvedDownloadUrl;
  }
}

function setSiteUrl() {
  if (!els.siteUrl) return;
  els.siteUrl.textContent = resolveWebsiteBaseUrl();
}

function resolveWebsiteBaseUrl() {
  try {
    return new URL('./', window.location.href).toString();
  } catch {
    return `${window.location.origin}/`;
  }
}

async function boot() {
  setSiteUrl();

  if (els.downloadBtn) {
    els.downloadBtn.addEventListener('click', onDownloadClick);
  }

  await Promise.all([loadReleaseMetrics(), loadTrackedClicks()]);
}

boot();
