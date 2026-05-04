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
 
async function chatStream(userMessage) {
  const provider = PROVIDERS[currentProviderName];
 
  history.push({
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
      messages: history,
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
 
  console.log('Chatbot CLI — Phase 4 ');
  console.log('Commandes disponibles :');
  console.log('  /history            : afficher l’historique');
  console.log('  /provider mistral   : utiliser Mistral');
  console.log('  /provider groq      : utiliser Groq');
  console.log('  /current            : afficher le provider actuel');
  console.log('  /exit               : quitter\n');
 
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