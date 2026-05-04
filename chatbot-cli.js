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
 
async function chatStream(userMessage) {
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
      temperature: 0.7,
      stream: true
    })
  });
 
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erreur API Mistral : ${response.status} ${errorText}`);
  }
 
  if (!response.body) {
    throw new Error('Réponse sans body stream.');
  }
 
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
 
  let fullContent = '';
  let buffer = '';
  let streamFinished = false;
 
  process.stdout.write('IA : ');
 
  while (!streamFinished) {
    const { done, value } = await reader.read();
    if (done) break;
 
    buffer += decoder.decode(value, { stream: true });
 
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
 
    for (const event of events) {
      const lines = event.split('\n');
 
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
 
        const jsonStr = line.slice(5).trim();
 
        if (jsonStr === '[DONE]') {
          streamFinished = true;
          break;
        }
 
        try {
          const parsed = JSON.parse(jsonStr);
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
 

  buffer += decoder.decode();
 
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
 
console.log('Chatbot CLI — Phase 3 : streaming + mémoire conversationnelle.');
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
    await chatStream(input);
  } catch (error) {
    console.error(`Erreur : ${error.message}\n`);
  }
}