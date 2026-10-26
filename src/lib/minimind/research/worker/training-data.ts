// ============================================================
// MiniMind — research/worker/training-data.ts
// ============================================================
// Phase 65: Browser-safe tiny training corpus.
//
// Provides a small inline text corpus so the Worker can run
// real training without filesystem access.
//
// This is the SAME corpus used in phase61-e2e.test.ts —
// verified to produce real, reproducible loss curves.
// ============================================================

/**
 * Tiny training corpus (~30 sentences, ~300 words).
 *
 * Small enough for quick training in browser (~100 steps),
 * diverse enough for the model to learn something measurable.
 *
 * Used by TrainingWorker for real training execution.
 */
export const TINY_TRAINING_CORPUS: string[] = [
  "the cat sat on the mat and looked at the dog",
  "the dog ran after the cat but the cat was too fast",
  "once upon a time there was a small village",
  "the people of the village were very happy",
  "they had food and water and shelter from the rain",
  "every day the children would play in the fields",
  "the sun was warm and the sky was blue",
  "in the forest there lived a wise old owl",
  "the owl knew many things about the world",
  "animals came from far away to ask the owl questions",
  "the owl would think carefully before answering",
  "one day a rabbit asked about the meaning of life",
  "the owl said life is about being kind to others",
  "the rabbit thanked the owl and went home happy",
  "the next day a fox came to visit the owl",
  "the fox wanted to know how to be clever",
  "the owl said cleverness comes from listening more than talking",
  "the fox practiced listening and became very wise",
  "soon all the animals in the forest lived in peace",
  "they shared their food and helped each other every day",
  "the birds sang beautiful songs in the morning light",
  "the fish swam in the clear cool water of the pond",
  "butterflies danced among the flowers in the meadow",
  "the trees whispered secrets to each other in the wind",
  "children laughed and played games until the sun went down",
  "the moon rose high above the mountains casting silver light",
  "stars twinkled like diamonds scattered across the dark sky",
  "a gentle breeze carried the scent of pine through the valley",
  "the river flowed steadily onward toward the distant ocean",
  "in the garden roses bloomed in shades of red and pink",
];
