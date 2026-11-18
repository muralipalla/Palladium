# Physics practice question bank

The Physics Daily Practice Quiz reads its banks from `questionbank_index.json`.
Add questions to `physics_motion.json`, or add another JSON bank and register it
in the index with `"subject": "Physics"`. The quiz discovers the available
topics and question counts from the bank; no page changes are needed.

Each question needs a unique `id`, `subject`, `chapterId`, `chapterName`,
`topicId`, `topic`, `difficulty`, `questionType`, `promptLatex`,
`optionsLatex`, `answerLatex`, `explanationLatex`, and `hintsLatex`. Use the
same chapter, topic, and difficulty values for questions that should appear
together in one selection row. `answerLatex` must match one of the option
strings exactly. The text fields accept plain text or MathJax/LaTeX, as in
the Chemistry Custom Quiz.

Physics practice initially selects up to 10 questions, distributed across the
available topic rows. Learners can change each count or use the quick-selection
buttons before starting. A completed signed-in attempt appears as Physics Daily
Practice Quiz in account scores.
