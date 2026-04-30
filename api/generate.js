export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, max_tokens } = req.body;
    const prompt = messages[0].content;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: max_tokens || 1200,
            temperature: 0.7
          }
        })
      }
    );

    const data = await response.json();

    // Log full response to help debug
    console.log("Gemini response:", JSON.stringify(data));

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error || "Gemini API error" });
    }

    let text = "";
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        text = candidate.content.parts.map(function(p) { return p.text || ""; }).join("");
      }
    }

    if (!text) {
      return res.status(500).json({ error: "Empty response from Gemini. Raw: " + JSON.stringify(data) });
    }

    res.status(200).json({
      content: [{ type: "text", text: text }]
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
