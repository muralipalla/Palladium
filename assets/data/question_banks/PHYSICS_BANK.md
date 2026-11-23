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

A bank can optionally specify `selectionGroup` in the index with `id`, `title`
and `difficulty`. This combines its questions into one selection row without
changing their individual topic IDs or difficulty levels.

Physics practice initially selects up to 10 questions, distributed across the
available topic rows. Learners can change each count or use the quick-selection
buttons before starting. A completed signed-in attempt appears as Physics Daily
Practice Quiz in account scores.

## Motion graphs

`physics_motion_graphs.json` adds 20 MCQs: ten displacement–time questions and
ten velocity–time questions. Each type has five Level 1 and five Level 2
questions. The graph image is part of `promptLatex`, so it also appears in the
existing question review. Alternative text provides the plotted coordinates.
All 20 questions appear together in the **Graphical questions** selection row,
labelled **Levels 1–2**. Learners can select any count up to 20 from that row.
An **Enlarge graph** button in each question and its review opens the SVG at
full size, with horizontal scrolling on small screens.

The `graph` field stores the exact SI coordinates and axis scales used to draw
the SVG in `assets/graphs/physics_motion/`. The curved x–t question uses an exact
quadratic curve with a marked tangent. Regenerate the images after changing any
graph data:

```text
node scripts/generate-physics-motion-graphs.cjs
node scripts/validate-physics-motion-graphs.cjs
```

The validator independently calculates gradients, signed areas and interval
averages, checks each distractor, and calibrates the SVG coordinates against
its displayed axis ticks. New banks retain the Custom Quiz's existing grading.
