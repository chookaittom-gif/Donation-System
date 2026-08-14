const RETRYABLE_READ_ACTIONS = new Set([
  'getPublicProjectInfo',
  'getDashboardDataAll',
  'getSettings',
  'getBankAccounts',
  'getDonations',
  'getDonorsSummary',
  'getDashboardStats',
  'getChartData',
  'getRecentDonations',
  'getTopDonors',
  'getUsers'
]);
const UPSTREAM_TIMEOUT_MS = 18000;

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        message: 'Method not allowed'
      });
    }

    const apiUrl = process.env.API_URL;

    if (!apiUrl) {
      return res.status(500).json({
        success: false,
        message: 'API_URL is not configured'
      });
    }

    const retryableReadAction = RETRYABLE_READ_ACTIONS.has(req.body?.action);
    const attempts = retryableReadAction ? 2 : 1;

    for (let attempt = 0; attempt < attempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

      try {
        const gasRes = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(req.body),
          signal: controller.signal
        });

        const text = await gasRes.text();

        try {
          const json = JSON.parse(text);
          return res.status(200).json(json);
        } catch (parseError) {
          if (attempt + 1 < attempts) continue;

          return res.status(502).json({
            success: false,
            message: 'Invalid JSON response from Apps Script',
            upstreamStatus: gasRes.status
          });
        }
      } catch (error) {
        if (attempt + 1 < attempts) continue;

        if (error?.name === 'AbortError') {
          return res.status(504).json({
            success: false,
            message: 'Apps Script request timed out'
          });
        }

        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Proxy error'
    });
  }
}
