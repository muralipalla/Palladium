# Optional quiz timing and score cleanup

Select **Record time taken (optional)** to display elapsed time and save it with
the completed attempt. Timing is off on a new page. It runs from the start of
the attempt until completion, including time away from the tab. Selecting the
option during an attempt includes time since that attempt started. New attempts
reset the clock; completion freezes it.

The option is shared by English practice, Mathematics Skill Builders, the
Physics and Chemistry Custom Quizzes, and the other active scored quiz pages.
The Einstein puzzle also offers elapsed timing, stopping when its solution is
opened; that ungraded puzzle does not create a score record.

Saved scores and administrator results show **Time taken**. Untimed new attempts
show **Not timed**; older attempts without duration data show **Not recorded**.
Existing durations remain readable. Questions, answer keys and scoring rules
are unchanged.

## Student score selection

Open **My scores**, optionally filter by quiz, and select individual score
checkboxes or **Select all shown scores**. **Delete selected scores** asks for
confirmation before permanently deleting the selected attempts. Students can
only list and delete their own scores. The list is paginated in groups of 50.

## Administrator cleanup

Open **Quiz results** from the administrator navigation. Filter by student,
quiz, or **Completed before (local date)**. The date is exclusive and uses the
administrator's local midnight. Select individual records or **Select all
shown records**, then choose **Delete selected records** and confirm the
record and student counts. Each page holds up to 100 records. Selections clear
when changing pages, refreshing or applying filters.

Deletion removes the selected attempts and matching vocabulary score logs.
Student accounts, questions, and vocabulary mastery are retained. Tiny
user/attempt-ID markers prevent offline imports from recreating deleted scores;
they contain no score or answer details and are removed with the account.

## Implementation and validation

`js/quiz-timer.js` owns the optional clock. `ProgressStore` connects it to quiz
lifecycle events and stores the optional value in the existing
`quiz_attempts.duration_seconds` column. Timing details also survive local
progress import and vocabulary retries.

The final optional-timing/cleanup section of `supabase/schema.sql` upgrades an
existing project. Administrator functions use authenticated public wrappers
and guarded privileged functions in the unexposed `palladium_private` schema.
Existing student row-level ownership policies remain in force.

Run `node scripts/validate-quiz-timing.cjs` for clock, score-selection event,
cancellation/confirmation, ownership, syntax and question-integrity checks.
`scripts/test-score-cleanup.sql` tests the actual database permissions and
deletion functions using temporary fixtures in a transaction that rolls back.
It also checks offline replay, retained mastery and account-removal cascades.

These automated checks do not establish visual browser behavior. Report browser
verification separately when publishing.
