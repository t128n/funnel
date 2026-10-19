# Diataxis Principles in Detail

This document expands the four documentation types with concrete guidance and examples. Use `SKILL.md` for the framework and compass; use this file when you need to apply or explain a specific type in depth.

## Tutorials — Learning by Doing

A tutorial is a lesson. The user is a learner who wants to acquire skill through practice. The teacher — you — is responsible for the learner's success.

### Core principles

1. **You are responsible for the learner's success.** Every step must work exactly as written. Test the path end to end. If a step can fail, remove the ambiguity or handle it explicitly.
2. **Focus on doing, not explaining.** The learner should be engaged in the craft, not reading a textbook. Explain only what is needed to complete the next action, and link to explanation for anything deeper.
3. **Show where they're going upfront.** State what the learner will build or achieve, so every step has a purpose they can see.
4. **Deliver visible results early and often.** Get something on screen, running, or working as soon as possible. Early success builds confidence and momentum.
5. **Maintain a narrative of expectation.** Tell the learner what they should see and notice: "You'll see…", "Notice that…", "The output should look like…". This confirms they are on track.
6. **Be concrete and specific — one path only.** Choose one tool, one directory, one command, one approach. Alternatives belong elsewhere.
7. **Eliminate the unexpected.** A tutorial should be perfectly repeatable. Pin versions, provide complete commands, and avoid assumptions about the learner's environment where possible.
8. **Encourage repetition.** Repetition builds the "feeling of doing". Where useful, invite the learner to repeat an action with a small variation.
9. **Aspire to perfect reliability.** A tutorial that works most of the time is not a tutorial. It is a source of frustration.

### Shape

- State the outcome and what will be built.
- Give a short, honest account of what the learner needs before starting.
- Lead with the smallest useful success.
- Build in stages, each ending in a visible result.
- Confirm expected outcomes throughout.
- Finish with something complete and working.
- Point to next steps: related tutorials, how-to guides, reference, and explanation.

### Language

- "We will create…"
- "First, do X. Now, do Y."
- "Notice that…"
- "You should see…"
- "You have built…"

Use "we" to signal shared responsibility, and "you" when describing what the learner will observe or achieve.

### Avoid

- Multiple approaches or optional alternatives.
- Long conceptual detours.
- Exercises that assume knowledge the tutorial has not established.
- Real-world complexity, edge cases, and production caveats.
- Leaving the learner to debug an environment you did not describe.
- Ending without a working result.

### Example fragment

> We will build a small command-line tool that counts the words in a file. By the end, you will have a working program and will know how to run it on your own files.
>
> First, create a new directory and move into it:
>
> ```sh
> mkdir wordcount
> cd wordcount
> ```
>
> Now create a file called `count.sh` and add the following…
>
> Run it against the sample file:
>
> ```sh
> sh count.sh sample.txt
> ```
>
> You should see:
>
> ```
> 42
> ```
>
> Notice that the number is the count of whitespace-separated words. If your output differs, check that you saved the file and are in the `wordcount` directory.

## How-to Guides — Working to Achieve a Goal

A how-to guide is directions. The user is a practitioner who already has competence and wants to get a specific thing done. Responsibility for success is shared, but the guide must respect the user's intelligence.

### Core principles

1. **Address real-world problems, not tool capabilities.** Start from what the user is trying to achieve, not from a feature list. "How to rotate database credentials without downtime" is a real problem; "How to use the credentials API" is a tool description in disguise.
2. **Assume competence.** Do not explain what a database, a commit, or an HTTP header is. State prerequisites and move on.
3. **Provide a logical sequence that flows with human thinking.** Order steps the way the user will encounter them. Group related actions. Resolve decisions close to where they are needed.
4. **Address real-world complexity with conditionals.** Use "If X, do Y" to handle meaningful variation without derailing the main path.
5. **Seek flow.** Anticipate the user's next move and minimise context switching. Keep the information they need at the point of use, and link out rather than interrupting the task.
6. **Omit unnecessary detail.** Practical usability beats completeness. Include what is needed to finish safely; link to reference for exhaustive detail.
7. **Focus on tasks, not tools.** The guide's title and structure should describe the goal, not the menu item or API that happens to implement it.
8. **Name guides clearly.** Use "How to [accomplish X]" and make the goal specific.

### Shape

- State the goal and when the guide applies.
- List only the prerequisites that materially affect the task.
- Present the main path as numbered steps.
- Place conditionals where the decision arises.
- Include verification: how the user knows it worked.
- Include recovery where failure is likely or costly.
- Link to reference for exact options and to explanation for background.

### Language

- "This guide shows you how to…"
- "If you want X, do Y."
- "To achieve W, do Z."
- "If you are using X, use Y instead."

### Avoid

- Teaching fundamentals.
- Exhaustive option lists.
- Explaining why the product works the way it does.
- Tool-first titles such as "Using the configuration object".
- Hiding important caveats in a footnote.
- Assuming a single environment when the task commonly varies.

### Example fragment

> # How to rotate database credentials without downtime
>
> This guide shows you how to replace a database password while keeping the application available. It assumes you can deploy a new application version and that the database supports two active passwords.
>
> 1. Create a second credential in the database.
> 2. Add the new credential to your secret store.
> 3. Deploy the application with both credentials available.
> 4. Confirm that new connections use the new credential.
> 5. Remove the old credential.
>
> If your database does not support two active passwords, take a maintenance window and follow the single-credential variant below.

## Reference — Facts While Working

Reference is description. The user is working and needs accurate facts, quickly, without being told what to do. It should be austere, consistent, and authoritative.

### Core principles

1. **Describe, don't instruct.** State what exists, what it does, what it accepts, and what it returns. Do not turn reference into a procedure.
2. **Mirror the product architecture.** Structure and naming should match how the product is organised, so users can find things by recognition.
3. **Use standard, consistent patterns throughout.** Every entry should follow the same shape: name, description, type, default, constraints, example.
4. **Be austere and authoritative.** Avoid hedging, marketing language, and unnecessary prose. State facts plainly and completely.
5. **Separate description from instruction.** If a user needs a sequence of actions, link to a how-to guide.
6. **Provide succinct usage examples.** Examples clarify form and syntax; they should not become tutorials.
7. **Completeness matters.** Unlike a how-to guide, reference should cover the whole surface area, including edge cases and constraints.

### Shape

- Group entries by product structure.
- Use consistent headings and field order.
- State types, defaults, allowed values, and constraints.
- Document errors and side effects.
- Include short examples.
- Cross-link to related reference entries, how-to guides, and explanation.

### Language

- "X is available as Y."
- "Sub-commands are: A, B, C."
- "You must use X. Never Y."
- "Default: `false`."
- "Returns `null` when no match is found."

### Avoid

- Step-by-step procedures.
- Tutorial-style encouragement.
- Opinion and trade-off discussion.
- Inconsistent terminology or entry structure.
- Incomplete option lists.
- Examples that introduce concepts the entry does not define.

### Example fragment

> ## `--output`
>
> Writes the result to the given path instead of standard output.
>
> - **Type:** string
> - **Default:** none
> - **Allowed values:** any writable file path
> - **Behaviour:** Creates the file if it does not exist. Overwrites it if it does.
> - **Errors:** Exits with status 1 if the path is not writable.
>
> ```sh
> tool build --output ./dist/report.json
> ```

## Explanation — Understanding Concepts

Explanation is discussion. The user is studying to understand, and wants context, reasons, and connections. It may take a perspective and discuss trade-offs.

### Core principles

1. **Talk about the subject from multiple angles.** Consider history, design, constraints, alternatives, and consequences.
2. **Answer "why".** Explain design decisions, trade-offs, and the forces that shaped them.
3. **Make connections to related concepts.** Place the subject in a wider picture and link to related explanation.
4. **Provide context and the bigger picture.** Help the user build a mental model, not just a list of facts.
5. **Permit opinion and perspective.** Discuss trade-offs honestly. Make clear when something is a judgement rather than a fact.
6. **Keep boundaries clear.** Do not include procedures or exhaustive reference tables. Link to them instead.
7. **Take a higher, wider perspective.** Step back from the immediate task and explain how the pieces fit together.

### Shape

- Open with the question or tension the explanation addresses.
- Build a mental model progressively.
- Discuss alternatives and trade-offs.
- Connect to related concepts and documents.
- Close with implications, not instructions.

### Language

- "The reason for X is…"
- "W is better than Z, because…"
- "Some prefer W. This can be effective, but…"
- "This design reflects a trade-off between…"

### Avoid

- Step-by-step instructions.
- Exhaustive parameter lists.
- Marketing claims presented as fact.
- Unexplained jargon.
- Drifting into a tutorial or reference.
- Presenting one opinion as the only reasonable view.

### Example fragment

> ## Why the scheduler favours short jobs
>
> The scheduler does not optimise for fairness first; it optimises for throughput. Short jobs finish quickly and free capacity, so giving them priority reduces the average time a job spends in the queue. This is a deliberate trade-off: a long job may wait behind many short ones, which can feel unfair even when total throughput improves.
>
> Alternatives such as first-in-first-out are easier to reason about and distribute waiting time more evenly. They tend to perform worse when job lengths vary widely. The current design is therefore a bet that most workloads contain many short jobs — a bet that holds for interactive systems but not necessarily for batch processing.

## Choosing Between Types

| If the user needs… | Write… | Because… |
| --- | --- | --- |
| To learn a skill by completing a guided exercise | Tutorial | They are acquiring skill through action |
| To accomplish a specific goal at work | How-to guide | They are applying skill through action |
| To look up a fact, option, or behaviour | Reference | They are applying skill and need information |
| To understand why something works or is designed a certain way | Explanation | They are acquiring understanding |

When a single request spans several needs, split it into separate documents and link between them. Do not force one document to be a lesson, a recipe, a dictionary, and a discussion at once.
