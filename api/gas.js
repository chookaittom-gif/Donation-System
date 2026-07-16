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

    const gasRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(req.body)
    });

    const text = await gasRes.text();

    try {
      const json = JSON.parse(text);
      return res.status(200).json(json);
    } catch (parseError) {
      return res.status(502).json({
        success: false,
        message: 'Invalid JSON response from Apps Script',
        raw: text
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Proxy error'
    });
  }
}
