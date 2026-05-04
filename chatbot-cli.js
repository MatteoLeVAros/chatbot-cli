
// chatbot-cli.js pas de mémoire pas de streaming 

import 'dotenv/config';
import readline from 'node:readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function askMistral(userMessage) {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [
        {role: 'user', content: userMessage}
      ]
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;

}

console.log('Chatbot CLI - Phase 1. (ctrl+C pour quitter)');



while (true) {
  const input = await question('Vous : ');
  const reply = await askMistral(input);
  console.log(`IA : ${reply}\n`);
}