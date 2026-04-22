const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  try {
    // There is no direct listModels in the JS SDK typically used this way, 
    // but we can try a simple query to see if the model exists.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Hi");
    console.log("Success with gemini-1.5-flash:", result.response.text());
  } catch (err) {
    console.error("Error with gemini-1.5-flash:", err.message);
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent("Hi");
    console.log("Success with gemini-pro:", result.response.text());
  } catch (err) {
    console.error("Error with gemini-pro:", err.message);
  }
}

listModels();
