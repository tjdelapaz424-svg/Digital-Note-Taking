// Firebase Cloud Function: generateStudyTools
//
// Takes typed notebook text and asks Claude to turn it into a multiple-choice
// quiz or a set of flashcards. The Anthropic API key lives only on the
// server (as a Firebase Functions secret), never in the browser.
//
// Deploy:
//   cd functions
//   npm install
//   firebase functions:secrets:set ANTHROPIC_API_KEY
//   firebase deploy --only functions
//
// After deploying, copy the printed function URL into
// js/notebook.js -> AI_STUDY_FUNCTION_URL.

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

const MODEL = 'claude-sonnet-4-6';

function buildPrompt(mode, count, notesText) {
  if (mode === 'flashcards') {
    return `You are helping a student study from their handwritten class notes (typed portions only, below).
Create exactly ${count} flashcards that cover the most important facts, terms, and ideas in these notes.

Respond with ONLY valid JSON, no markdown fences, no commentary, in this exact shape:
{"items":[{"front":"term or question","back":"answer or definition"}]}

NOTES:
"""
${notesText}
"""`;
  }
  return `You are helping a student study from their handwritten class notes (typed portions only, below).
Create exactly ${count} multiple-choice quiz questions that test understanding of these notes.
Each question needs exactly 4 answer choices, with exactly one correct answer.

Respond with ONLY valid JSON, no markdown fences, no commentary, in this exact shape:
{"items":[{"question":"...","choices":["A","B","C","D"],"correctIndex":0}]}

NOTES:
"""
${notesText}
"""`;
}

function extractJson(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in model response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

exports.generateStudyTools = onRequest(
  { secrets: [ANTHROPIC_API_KEY], cors: true, region: 'us-central1' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Use POST' });
      return;
    }

    try {
      const { notesText, mode, count } = req.body || {};
      if (!notesText || typeof notesText !== 'string' || notesText.trim().length < 10) {
        res.status(400).json({ error: 'notesText is required and must have some content' });
        return;
      }
      const safeMode = mode === 'flashcards' ? 'flashcards' : 'quiz';
      const safeCount = Math.min(Math.max(Number(count) || 5, 3), 12);
      // Keep the prompt bounded — this is meant for a page or two of typed notes.
      const trimmedNotes = notesText.slice(0, 8000);

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY.value(),
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          messages: [{ role: 'user', content: buildPrompt(safeMode, safeCount, trimmedNotes) }]
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Anthropic API error:', response.status, errText);
        res.status(502).json({ error: 'Upstream AI request failed' });
        return;
      }

      const data = await response.json();
      const textBlock = (data.content || []).find(b => b.type === 'text');
      if (!textBlock) {
        res.status(502).json({ error: 'No text in AI response' });
        return;
      }

      const parsed = extractJson(textBlock.text);
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      res.status(200).json({ items, mode: safeMode });
    } catch (err) {
      console.error('generateStudyTools failed:', err);
      res.status(500).json({ error: 'Could not generate study material' });
    }
  }
);
