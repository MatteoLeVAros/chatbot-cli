
// chatbot-cli.js 

import 'dotenv/config';
import readline from 'node:readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

const history = [
    {
        role: 'system',
        content: 'Tu es un assistant utile et concis. Tu te souviens de tout ce qui a été dit dans cette conversation.'
    }
];

function printHistory() {
  console.log('\n--- Historique interne ---');
 
  for (const message of history) {
    const preview = message.content.length > 80
      ? message.content.slice(0, 80) + '...'
      : message.content;
 
    console.log(`[${message.role.padEnd(9)}] ${preview}`);
  }
 
  console.log('--------------------------\n');
}


async function askMistral(userMessage) {
  history.push({
    role: 'user',
    content: userMessage
  });
 
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: history,
      temperature: 0.7
    })
  });
 
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur API Mistral : ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const assistantMessage = data.choices[0].message.content;

  history.push({
    role: 'assistant',
    content: assistantMessage
  });
 
  return assistantMessage;
}
 
console.log('Chatbot CLI — Phase 2 : mémoire conversationnelle.');
console.log('Commandes disponibles :');
console.log('  /history : afficher l’historique interne');
console.log('(Ctrl+C pour quitter)\n');
 
while (true) {
  const input = await question('Vous : ');
 
  if (!input.trim()) {
    continue;
  }
 
  if (input === '/history') {
    printHistory();
    continue;
  }
 
  try {
    const reply = await askMistral(input);
    console.log(`IA : ${reply}\n`);
  } catch (error) {
    console.error(`Erreur : ${error.message}\n`);
  }
}