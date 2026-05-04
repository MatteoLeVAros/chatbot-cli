// chatbot-cli.js
import 'dotenv/config';
import readline from 'node:readline';
 
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
 
function question(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}
 
const history = [
  {
    role: 'system',
    content: 'Tu es un assistant utile et concis. Tu te souviens de tout ce qui a été dit dans cette conversation.'
  }
];
 
const MAX_HISTORY = 20;
 
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
 

const PRICING = {
  mistral: {
    inputPerMillion: 0.10,
    outputPerMillion: 0.30
  },
  groq: {
    inputPerMillion: 0.59,
    outputPerMillion: 0.79
  }
};
 
const sessionMetrics = {
  requestCount: 0,
  estimatedInputTokens: 0,
  estimatedOutputTokens: 0,
  estimatedCostUsd: 0
};
 
let currentProviderName = 'mistral';
 
function switchProvider(name) {
  const normalized = name.trim().toLowerCase();
 
  if (!PROVIDERS[normalized]) {
    return false;
  }
 
  if (!PROVIDERS[normalized].key) {
    console.log(`Clé API manquante pour "${normalized}" dans le fichier .env`);
    return false;
  }
 
  currentProviderName = normalized;
  return true;
}
 

function estimateTokensFromText(text) {
  return Math.ceil((text || '').length / 4);
}
 
function estimateTokensFromMessages(messages) {
  return messages.reduce((total, message) => {
    return total + estimateTokensFromText(message.content);
  }, 0);
}
 
function estimateCostUsd(providerName, inputTokens, outputTokens) {
  const pricing = PRICING[providerName];
 
  if (!pricing) {
    return 0;
  }
 
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
 
  return inputCost + outputCost;
}
 
function printRequestMetrics({ latencyMs, inputTokens, outputTokens, costUsd }) {
  console.log(
    `[métriques] latence: ${latencyMs} ms | ` +
    `tokens estimés: in ${inputTokens} / out ${outputTokens} | ` +
    `coût estimé requête: $${costUsd.toFixed(6)} | ` +
    `coût session: $${sessionMetrics.estimatedCostUsd.toFixed(6)}\n`
  );
}
 
async function summarizeMessages(messagesToSummarize) {
  if (!process.env.MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY manquante : nécessaire pour la compression automatique.');
  }
 
  const conversationText = messagesToSummarize
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');
 
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content:
            'Tu résumes une conversation en 3 à 5 phrases maximum. ' +
            'Conserve uniquement les faits importants, les préférences utilisateur, ' +
            'les décisions prises et le contexte utile pour continuer la conversation. ' +
            'Sois factuel, concis, et n’ajoute aucune information.'
        },
        {
          role: 'user',
          content: `Voici la conversation à résumer :\n\n${conversationText}`
        }
      ],
      temperature: 0.3
    })
  });
 
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur pendant la compression du contexte : ${response.status} ${errorText}`);
  }
 
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || 'Résumé indisponible.';
}
 
async function compressHistory() {
  if (history.length <= 2) {
    return;
  }
 
  const lastMessage = history[history.length - 1];
  const keepLastUserMessage = lastMessage?.role === 'user';
 
  const messagesToCompress = keepLastUserMessage
    ? history.slice(1, -1)
    : history.slice(1);
 
  if (messagesToCompress.length === 0) {
    return;
  }
 
  const summary = await summarizeMessages(messagesToCompress);
 
  if (keepLastUserMessage) {
    history.splice(
      1,
      history.length - 2,
      {
        role: 'system',
        content: `Résumé de la conversation précédente : ${summary}`
      }
    );
  } else {
    history.splice(
      1,
      history.length - 1,
      {
        role: 'system',
        content: `Résumé de la conversation précédente : ${summary}`
      }
    );
  }
 
  console.log(`💡 Contexte compressé (${messagesToCompress.length} messages → 1 résumé)`);
}
 

async function resumeConversation() {
  if (!process.env.MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY manquante : nécessaire pour la commande /resume.');
  }
 
  const conversationMessages = history.slice(1);
 
  if (conversationMessages.length === 0) {
    return 'Résumé :\n- Commencer une conversation avant de demander un résumé.';
  }
 
  const conversationText = conversationMessages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');
 
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content:
            'Tu es un assistant spécialisé dans le résumé de conversation. ' +
            'Résume la conversation en 5 bullet points maximum. ' +
            'Chaque bullet point doit commencer par "- " suivi d’un verbe. ' +
            'Conserve uniquement les éléments importants : sujets abordés, décisions, préférences et faits utiles. ' +
            'Ne mets aucune introduction avant les bullets.'
        },
        {
          role: 'user',
          content: `Voici la conversation à résumer :\n\n${conversationText}`
        }
      ],
      temperature: 0.3
    })
  });
 
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur /resume : ${response.status} ${errorText}`);
  }
 
  const data = await response.json();
  const summary = data.choices?.[0]?.message?.content?.trim();
 
  return `Résumé :\n${summary || '- Résumé indisponible.'}`;
}
 

async function translateLast(targetLanguage) {
  if (!process.env.MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY manquante : nécessaire pour la commande /translate.');
  }
 
  const lastAssistantMessage = [...history]
    .reverse()
    .find((m) => m.role === 'assistant');
 
  if (!lastAssistantMessage) {
    return 'Traduction :\n- Aucun message de l’assistant à traduire pour le moment.';
  }
 
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content:
            `Tu es un traducteur professionnel. Traduis le texte fourni en ${targetLanguage}. ` +
            'Retourne uniquement la traduction, sans commentaires, sans introduction.'
        },
        {
          role: 'user',
          content: lastAssistantMessage.content
        }
      ],
      temperature: 0.1
    })
  });
 
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur /translate : ${response.status} ${errorText}`);
  }
 
  const data = await response.json();
  const translatedText = data.choices?.[0]?.message?.content?.trim();
 
  return `Traduction : ${translatedText || 'Traduction indisponible.'}`;
}
 
async function chatStream(userMessage) {
  const provider = PROVIDERS[currentProviderName];
 
  history.push({
    role: 'user',
    content: userMessage
  });
 
  if (history.length - 1 > MAX_HISTORY) {
    await compressHistory();
  }
 
  const requestMessages = [...history];
  const inputTokensEstimate = estimateTokensFromMessages(requestMessages);
  const startTime = Date.now();
 
  const response = await fetch(provider.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.key}`
    },
    body: JSON.stringify({
      model: provider.model,
      messages: requestMessages,
      temperature: 0.7,
      stream: true
    })
  });
 
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur API ${currentProviderName} : ${response.status} ${errorText}`);
  }
 
  if (!response.body) {
    throw new Error('Réponse sans body.');
  }
 
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
 
  let fullContent = '';
  let buffer = '';
  let finished = false;
 
  process.stdout.write('IA : ');
 
  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
 
    buffer += decoder.decode(value, { stream: true });
 
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
 
    for (const event of events) {
      const lines = event.split('\n');
 
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
 
        const data = line.slice(5).trim();
 
        if (data === '[DONE]') {
          finished = true;
          break;
        }
 
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
 
          if (delta) {
            process.stdout.write(delta);
            fullContent += delta;
          }
        } catch {
         
        }
      }
    }
  }
 
  process.stdout.write('\n\n');
 
  history.push({
    role: 'assistant',
    content: fullContent
  });
 
  const latencyMs = Date.now() - startTime;
  const outputTokensEstimate = estimateTokensFromText(fullContent);
  const requestCostUsd = estimateCostUsd(
    currentProviderName,
    inputTokensEstimate,
    outputTokensEstimate
  );
 
  sessionMetrics.requestCount += 1;
  sessionMetrics.estimatedInputTokens += inputTokensEstimate;
  sessionMetrics.estimatedOutputTokens += outputTokensEstimate;
  sessionMetrics.estimatedCostUsd += requestCostUsd;
 
  printRequestMetrics({
    latencyMs,
    inputTokens: inputTokensEstimate,
    outputTokens: outputTokensEstimate,
    costUsd: requestCostUsd
  });
 
  return fullContent;
}
 
function printHistory() {
  console.log('\n--- Historique interne ---');
 
  for (const message of history) {
    const preview =
      message.content.length > 80
        ? message.content.slice(0, 80) + '...'
        : message.content;
 
    console.log(`[${message.role.padEnd(9)}] ${preview}`);
  }
 
  console.log('--------------------------\n');
}
 
function printCurrentProvider() {
  const provider = PROVIDERS[currentProviderName];
  console.log(`Provider actuel : ${currentProviderName} (${provider.model})\n`);
}
 
function printSessionMetrics() {
  console.log('--- Métriques session ---');
  console.log(`Requêtes              : ${sessionMetrics.requestCount}`);
  console.log(`Tokens input estimés  : ${sessionMetrics.estimatedInputTokens}`);
  console.log(`Tokens output estimés : ${sessionMetrics.estimatedOutputTokens}`);
  console.log(`Coût estimé session   : $${sessionMetrics.estimatedCostUsd.toFixed(6)}`);
  console.log('------------------------\n');
}
 
function closeApp() {
  console.log('\nAu revoir 👋');
  rl.close();
  process.exit(0);
}
 
process.on('SIGINT', closeApp);
 
async function main() {
  if (!process.env.MISTRAL_API_KEY && !process.env.GROQ_API_KEY) {
    console.error('Erreur : aucune clé Mistral ou Groq trouvée dans .env');
    process.exit(1);
  }
 
  if (!PROVIDERS[currentProviderName].key && PROVIDERS.groq.key) {
    currentProviderName = 'groq';
  }
 
  console.log('Chatbot CLI — Phase 7');
  console.log('Commandes disponibles :');
  console.log('  /history                 : afficher l’historique');
  console.log('  /provider mistral        : utiliser Mistral');
  console.log('  /provider groq           : utiliser Groq');
  console.log('  /current                 : afficher le provider actuel');
  console.log('  /resume                  : résumer la conversation');
  console.log('  /translate <langue>      : traduire le dernier message IA');
  console.log('  /metrics                 : afficher les métriques de session');
  console.log('  /exit                    : ctrl C');
 
  printCurrentProvider();
 
  while (true) {
    const input = await question('Vous : ');
 
    if (!input.trim()) {
      continue;
    }
 
    if (input === '/history') {
      printHistory();
      continue;
    }
 
    if (input === '/current') {
      printCurrentProvider();
      continue;
    }
 
    if (input === '/metrics') {
      printSessionMetrics();
      continue;
    }
 
    if (input === '/resume') {
      try {
        const summary = await resumeConversation();
        console.log(`${summary}\n`);
      } catch (error) {
        console.error(`Erreur : ${error.message}\n`);
      }
      continue;
    }
 
    if (input === '/translate') {
      console.log('Usage : /translate <langue>\n');
      continue;
    }
 
    if (input.startsWith('/translate ')) {
      const targetLanguage = input.slice('/translate '.length).trim();
 
      if (!targetLanguage) {
        console.log('Usage : /translate <langue>\n');
        continue;
      }
 
      try {
        const translated = await translateLast(targetLanguage);
        console.log(`${translated}\n`);
      } catch (error) {
        console.error(`Erreur : ${error.message}\n`);
      }
 
      continue;
    }
 
    if (input === '/exit') {
      closeApp();
    }
 
    if (input.startsWith('/provider ')) {
      const providerName = input.slice('/provider '.length).trim();
      const ok = switchProvider(providerName);
 
      if (ok) {
        const provider = PROVIDERS[currentProviderName];
        console.log(`Provider changé : ${currentProviderName} (${provider.model})\n`);
      } else {
        console.log('Provider inconnu ou clé absente. Choisis : mistral, groq\n');
      }
 
      continue;
    }
 
    try {
      await chatStream(input);
    } catch (error) {
      console.error(`Erreur : ${error.message}\n`);
    }
  }
}
 
main();