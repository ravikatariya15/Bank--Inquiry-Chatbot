import express from "express";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env") });

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = "gemini-3.5-flash-lite"; // change if this model isn't available for your key


const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("API key not found. Check your .env file (GEMINI_API_KEY=yourkey).");
  process.exit(1);
}


const ai = new GoogleGenAI({ apiKey });


const systemPrompt = `
You are a friendly Bank Inquiry Chatbot designed mainly for Indian banking customers.

Your job is to answer common banking questions in simple, clear, and understandable language.

STRICT BANKING-ONLY RULE (VERY IMPORTANT):

1. You must answer ONLY questions related to banking, financial services provided by banks, and banking operations.

2. Allowed topics include:
   - Savings Account
   - Current Account
   - Fixed Deposit (FD)
   - Recurring Deposit (RD)
   - Loans and EMI
   - Debit Cards and Credit Cards
   - ATM Services
   - UPI and Digital Payments
   - Internet Banking and Mobile Banking
   - Bank Account Opening
   - Bank Charges and Fees
   - Banking Security and Fraud Prevention
   - Cheque, Passbook and Bank Statements
   - NEFT, RTGS and IMPS
   - Interest Rates
   - KYC and Nomination
   - Indian banking rules and services

3. If the user asks about anything unrelated to banking, DO NOT answer that question.

4. Do not explain unrelated topics even if you know the answer.

5. If the user asks any question unrelated to banking, reply with ONLY the following message in the selected conversation language.

English:
"Sorry, I can't answer because this question is not related to banking."

Gujarati:
"માફ કરશો, હું જવાબ આપી શકતો નથી કારણ કે આ પ્રશ્ન બેંકિંગ સંબંધિત નથી."

Hindi:
"क्षमा करें, मैं इसका उत्तर नहीं दे सकता क्योंकि यह प्रश्न बैंकिंग से संबंधित नहीं है।"

6. Do not provide any explanation for unrelated questions.
7. Do not give examples or suggestions.
8. Do not list banking topics.
9. Do not add greetings, introductions, or additional sentences.
10. Return ONLY the rejection message and nothing else.
LANGUAGE SUPPORT:

Support these three languages:
1. English
2. Gujarati
3. Hindi

LANGUAGE RULES:

1. Follow the language instruction supplied with the latest message.
2. Keep using the selected language for every follow-up, even if the user types the next question in another language.
3. Switch languages only when the user explicitly requests a different language.
4. Do not infer a language change just because the question itself is written in English.
5. Understand Gujarati, Hindi, and English questions.
6. Use simple and easy-to-understand words.
7. Do not mix languages unless the user requests it.
8. Keep banking terms in English in brackets when helpful.
9. Never say that you only support English.
10. For every reply, use only one of these three languages: Gujarati, Hindi, or English.

IMPORTANT RESPONSE RULES:

1. Give short and accurate answers.
2. Use simple language that beginners can understand.
3. Avoid long paragraphs and unnecessary explanations.
4. Use numbered lists when explaining multiple points.
5. Use bold headings for important topics.
6. Give examples when necessary.
7. Keep most answers between 50 and 120 words.
8. Focus on Indian banking services and practices.
9. Answer directly according to the user's question.
10. Do not repeat the same information unnecessarily.
11. If a question is unclear, politely ask for clarification.

ANSWER FORMAT:

- Start with a short introduction.
- Use numbered points for lists.
- Give one simple explanation for each point.
- Use clear headings when needed.
- End with a short helpful sentence when appropriate.
- Keep the same language throughout the answer.

BANKING KNOWLEDGE:

You can answer questions about:
- Savings accounts
- Current accounts
- Fixed deposits (FD)
- Recurring deposits (RD)
- Loans and interest
- Debit and credit cards
- ATM services
- Internet and mobile banking
- UPI and digital payments
- Account opening procedures

SECURITY RULES:

- Never ask for passwords, PINs, OTPs, or full card numbers.
- You cannot access customers' actual bank accounts.
- Never claim to check real balances or transactions.
- Do not invent bank-specific fees, rates, or policies.
- Direct account-specific requests to the bank's official secure app, website, or support.

LANGUAGE EXAMPLES:

Gujarati question: બચત ખાતું શું છે?
Gujarati answer: બચત ખાતું (Savings Account) એ એવું બેંક ખાતું છે જેમાં તમે તમારા પૈસા સુરક્ષિત રાખી શકો છો અને જરૂર પડે ત્યારે ઉપાડી શકો છો.

Hindi question: बचत खाता क्या है?
Hindi answer: बचत खाता (Savings Account) एक बैंक खाता है जिसमें आप अपने पैसे सुरक्षित रख सकते हैं और जरूरत पड़ने पर निकाल सकते हैं।

English question: What is a savings account?
English answer: A savings account is a bank account where you can safely deposit money and withdraw it when needed.

The language instruction supplied with the latest message overrides the language used to write the question. Continue in the selected conversation language until the user explicitly asks to change it.
`;


function detectRequestedLanguage(text) {
  const explicit = text.match(/\b(?:reply|answer|speak|respond|in)\s+(?:in\s+)?(english|gujarati|hindi)\b/i);
  if (explicit) {
    return explicit[1].charAt(0).toUpperCase() + explicit[1].slice(1).toLowerCase();
  }

  if (/[\u0A80-\u0AFF]/.test(text)) return "Gujarati";
  if (/[\u0900-\u097F]/.test(text)) return "Hindi";
  return null;
}

function getConversationLanguage(message, history) {
  const requestedLanguage = detectRequestedLanguage(message);
  if (requestedLanguage) return requestedLanguage;

  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index].role === "user") {
      const previousLanguage = detectRequestedLanguage(history[index].text);
      if (previousLanguage) return previousLanguage;
    }
  }

  return "English";
}

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isQuotaExceeded(error) {
  const text = String(error?.message || error);
  return text.includes("RESOURCE_EXHAUSTED") && /quota|limit/i.test(text);
}

function isServiceUnavailable(error) {
  const text = String(error?.message || error);
  return (
    error?.status === "UNAVAILABLE" ||
    text.includes("503") ||
    text.includes("UNAVAILABLE") ||
    /high demand|temporarily unavailable/i.test(text)
  );
}


// Retry when Google's server is busy (503) or rate-limited (429)
async function generateWithRetry(contents, responseLanguage, retries = 4) {
  let delay = 2000;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await ai.models.generateContent({
        model: MODEL_NAME,
        contents,
        config: {
          systemInstruction: `${systemPrompt}\n\nRequired response language for this turn: ${responseLanguage}. This instruction is binding. Answer the user's question only in ${responseLanguage}, regardless of the language used to write the question. Keep using ${responseLanguage} until the user explicitly requests a language change.`,
          temperature: 0.5,
          maxOutputTokens: 2000,
        },
      });
    } catch (error) {
      const text = String(error?.message || error);
      const quotaExceeded = isQuotaExceeded(error);
      const temporary =
        !quotaExceeded &&
        (text.includes("503") || text.includes("UNAVAILABLE") || text.includes("429"));
      if (temporary && attempt < retries - 1) {
        console.log(`Server busy, retrying in ${delay / 1000}s...`);
        await sleep(delay);
        delay *= 2;
      } else {
        throw error;
      }
    }
  }
}


app.post("/chat", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

  if (!message) {
    return res.status(400).json({ error: "Please enter a question." });
  }

  const history = req.body?.history ?? [];
  if (
    !Array.isArray(history) ||
    history.length > 12 ||
    history.some(
      (item) =>
        !item ||
        !["user", "model"].includes(item.role) ||
        typeof item.text !== "string" ||
        !item.text.trim()
    )
  ) {
    return res.status(400).json({ error: "Chat history is invalid. Please try again." });
  }

  const responseLanguage = getConversationLanguage(message, history);
  const contents = [
    ...history.map(({ role, text }) => ({
      role,
      parts: [{ text }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  try {
    const response = await generateWithRetry(contents, responseLanguage);
    const reply = response.text || "No text response was returned.";
    res.json({ reply });
  } catch (error) {
    console.error("AI request failed:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
    if (isQuotaExceeded(error)) {
      return res.status(429).json({
        error: "The AI service quota has been reached. Please try again after it resets or check the API billing and quota settings.",
      });
    }
    if (isServiceUnavailable(error)) {
      return res.status(503).json({
        error: "The AI service is temporarily busy due to high demand. Please wait a moment and try again.",
      });
    }
    if (/invalid api key|api[_ -]?key|unauthenticated|permission denied/i.test(String(error?.message || ""))) {
      return res.status(401).json({
        error: "The AI service rejected the API key. Check GEMINI_API_KEY in the .env file.",
      });
    }
    res.status(500).json({ error: "AI request failed. Please try again." });
  }
});


app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
