import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(
      'https://api.generativeai.googleapis.com/v1/models/text-bison-001:generate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer AIzaSyB6_pJUPRdcpXI_qdmEPJrCsaih8pOKbzo'
        },
        body: JSON.stringify(req.body)
      }
    );

    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
