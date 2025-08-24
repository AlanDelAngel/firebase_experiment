const express = require("express");
const axios = require("axios");
require("dotenv").config();

const router = express.Router();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

router.post("/chat", async (req, res) => {
    try {
        const userMessage = req.body.message;

        if (!userMessage) {
            return res.status(400).json({ error: "Mensaje no proporcionado." });
        }

        const response = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-3.5-turbo", // Change to "gpt-4" if available
                messages: [
                    { role: "system", content: "You are an AI assistant for Leones Calistenia." },
                    { role: "user", content: userMessage }
                ],
                max_tokens: 200,
            },
            {
                headers: {
                    "Authorization": `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                },
            }
        );

        // Extract response text correctly
        const aiMessage = response.data.choices?.[0]?.message?.content || "No response from AI.";

        res.json({ response: aiMessage });

    } catch (error) {
        console.error("❌ OpenAI API Error:", error.response?.data || error.message);
        res.status(500).json({ error: "AI Service Unavailable" });
    }
});

module.exports = router;
