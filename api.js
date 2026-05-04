// api.js
import 'dotenv/config';
import express from 'express';
 
const app = express();
const PORT = 3000;
 
app.use(express.json());
 
const PROVIDERS = {
  mistral: {
    url: 'https://api.mistral.ai/v1/chat/completions',
    key: process.env.MISTRAL_API_KEY,
    model: 'mistral-small-latest'
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    key: process.env.GROQ_API_KEY,
    model: 'llama-3.3-70b-versatile'
  }
};
 
const sessionHistory = [
  {
    role: 'system',
    content: 'Tu es un assistant utile et concis. Tu te souviens de tout ce qui a été dit dans cette conversation.'
  }
];
 
function estimateTokensFromText(text) {
  return Math.ceil((text || '').length / 4);
}
 
function estimateTokensFromMessages(messages) {
  return messages.reduce((total, message) => {
    return total + estimateTokensFromText(message.content);
  }, 0);
}
 
function getProvider(name) {
  const normalized = (name || 'mistral').toLowerCase();
 
  if (!PROVIDERS[normalized]) {
    return null;
  }
 
  if (!PROVIDERS[normalized].key) {
    return null;
  }
 
  return {
    name: normalized,
    ...PROVIDERS[normalized]
  };
}
 
async function askProvider(userMessage, providerName = 'mistral') {
  const provider = getProvider(providerName);
 
  if (!provider) {
    throw new Error(`Provider invalide ou clé absente : ${providerName}`);
  }
 
  sessionHistory.push({
    role: 'user',
    content: userMessage
  });
 
  const response = await fetch(provider.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.key}`
    },
    body: JSON.stringify({
      model: provider.model,
      messages: sessionHistory,
      temperature: 0.7
    })
  });
 
  if (!response.ok) {
    const errorText = await response.text();
 
  
    sessionHistory.pop();
 
    throw new Error(`Erreur API ${provider.name} : ${response.status} ${errorText}`);
  }
 
  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content?.trim() || '';
 
  sessionHistory.push({
    role: 'assistant',
    content: reply
  });
 

  const tokens =
    data.usage?.total_tokens ??
    estimateTokensFromMessages(sessionHistory.slice(-2));
 
  return {
    reply,
    provider: provider.name,
    tokens
  };
}
 

app.get('/chat', async (req, res) => {
  const message = req.query.q;
  const provider = req.query.provider || 'mistral';
 
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({
      error: 'Paramètre q requis. Exemple : /chat?q=Bonjour'
    });
  }
 
  try {
    const result = await askProvider(message.trim(), provider);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
});
 

app.delete('/history', (req, res) => {

  sessionHistory.splice(1);
 
  return res.json({
    message: 'Historique réinitialisé.'
  });
});
 
app.get('/history', (req, res) => {
  return res.json({
    history: sessionHistory
  });
});
 
app.listen(PORT, () => {
  console.log(`API chatbot disponible sur http://localhost:${PORT}`);
});