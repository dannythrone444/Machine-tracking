export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { messages, max_tokens } = req.body;
    const prompt = messages[0].content;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: max_tokens || 1200,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "OpenAI API error" });
    }

    const text = data.choices?.[0]?.message?.content || "";

    if (!text) {
      return res.status(500).json({ error: "Empty response from OpenAI" });
    }

    res.status(200).json({
      content: [{ type: "text", text: text }]
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
