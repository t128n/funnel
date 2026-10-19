# Diataxis Reference: Quality and Complex Cases

This document provides a quality framework, guidance for situations that do not fit neatly into one quadrant, and additional material for reviewing documentation. Use `SKILL.md` for the framework and `principles.md` for type-specific guidance.

## Quality Framework

A good document is not merely accurate. It serves one user need, fits the moment the user is in, and moves them forward. Assess documentation against these dimensions.

### 1. Need fit

- Is the user learning or working?
- Are they seeking action or understanding?
- Does the document address that need directly?

If you cannot name the user need in one sentence, the document is probably serving none of them well.

### 2. Type fidelity

- Does the content behave like the type it claims to be?
- Would a tutorial reader be able to follow it without choices or prior knowledge?
- Would a working reader be able to act on the how-to guide without being taught fundamentals?
- Is reference neutral and complete?
- Does explanation answer "why" without turning into instructions?

### 3. Flow

- Does each section anticipate the user's next question?
- Is information placed where it is needed, rather than where it is convenient to store?
- Does the user have to hold unnecessary thoughts in their head?
- Are decisions resolved close to the point where they arise?

### 4. Language

- Is the language appropriate for the type?
- Is it concrete and free of ambiguity?
- Is terminology consistent with the rest of the documentation and the product?
- Is it written in British English?

### 5. Boundaries

- Is explanation leaking into action-oriented documents?
- Is instruction leaking into reference?
- Is reference detail bloating a how-to guide?
- If content serves another need, has it been extracted and linked?

### 6. Reliability

- For tutorials: does every step work exactly as written?
- For how-to guides: does the main path work under the stated conditions?
- For reference: are the facts complete and current?
- For explanation: are opinions labelled as opinions?

### 7. Maintainability

- Will the document survive a product change?
- Are volatile details linked rather than duplicated?
- Is there a clear owner or source of truth?
- Does the structure follow the product, so changes are easy to place?

## Complex Scenarios

### A piece of content serves multiple needs

Split it. Do not make one document do several jobs.

- Keep the guided path in a tutorial.
- Move task-specific variation into how-to guides.
- Move exact facts into reference.
- Move reasoning into explanation.
- Link between them at the point of transition.

Example: a "Getting started" page often wants to teach, instruct, and document configuration at once. Keep the guided first success as a tutorial, link to configuration reference, and link to explanation for architecture.

### "Getting started" — tutorial or how-to?

Ask whether the user is learning or working.

- If they are new and need a first successful experience, write a tutorial.
- If they already know the system and need to set it up for a specific purpose, write a how-to guide.

A "Getting started" page can be a tutorial, but only if it genuinely teaches through doing. If it assumes the user knows what they want and offers choices, it is a how-to guide.

### A how-to guide needs background information

Do not insert a lecture. Add a short bridge sentence at the point of use and link to the explanation.

> "The scheduler prioritises short jobs. For why that trade-off exists, see [Why the scheduler favours short jobs](../explanation/scheduler.md)."

### Reference entries need usage context

Add a succinct example, not a procedure. If the user needs a sequence of actions to accomplish something, link to a how-to guide.

### Explanation starts giving instructions

Remove the steps and link to the relevant how-to guide. Explanation may describe an approach, but it should not direct the user through one.

### A tutorial must cover real-world complexity

Do not add it to the tutorial. Move the complexity into a how-to guide and link to it after the tutorial's successful outcome.

### Multiple audiences

Do not write one document for everyone. Identify the primary audience and write for them. Create separate documents for genuinely different audiences, and link between them where their journeys overlap.

### Documenting a feature

Start from the user's goal, not the feature's name.

- If the feature solves a specific problem at work, write a how-to guide.
- If users need to know the exact options, write reference.
- If users need to understand why it exists, write explanation.
- If users need to learn the feature from scratch, write a tutorial.

A feature may need several documents. That is normal.

### API documentation

Treat the API's surface as reference: endpoints, parameters, types, defaults, errors, and examples. Treat common sequences of calls as how-to guides. Treat design rationale and lifecycle concepts as explanation. Treat a first successful integration as a tutorial.

### Troubleshooting

- If the user is diagnosing a specific failure while working, write a how-to guide ("How to diagnose…").
- If the user needs a list of error codes and causes, write reference.
- If the user needs to understand why failures occur, write explanation.

### Legacy documentation with mixed content

Do not attempt a full rewrite in one pass. Review one piece at a time:

1. Identify the need that piece serves.
2. Decide which type it should be.
3. Improve one aspect — separation, language, or completeness.
4. Move extracted content to the right document and link it.
5. Repeat.

Structure will emerge from consistent local decisions.

### Documentation for an internal tool with no clear users

Start by identifying the practitioner and the moment of use. Ask:

- Who opens this document, and what are they trying to do?
- Are they learning the tool or using it under pressure?
- What will they reach for next?

If the answer is "everyone, for everything", the scope is too broad. Narrow it to one primary need and split the rest.

## Review Protocol

When reviewing documentation:

1. **Name the type.** State which Diataxis type the content currently behaves like, and which type it should be.
2. **Name the need.** Explain the user need that justifies the type.
3. **Identify the smallest useful improvement.** Prefer one concrete change over a full restructure.
4. **Make or describe the change.** Apply Diataxis principles rather than generic editing advice.
5. **Preserve links and continuity.** When moving content, leave a link where the user will look for it.
6. **Verify the result.** Confirm the document now serves one need in the language of its type.

### Worked review example

> **Current content:** A page titled "Authentication" that begins with a conceptual overview of tokens, then lists every configuration option, then walks through logging in, then discusses why the token format was chosen.
>
> **Assessment:** The page mixes all four types. The overview and rationale are explanation; the option list is reference; the login walkthrough is a how-to guide. There is no tutorial, and none is needed.
>
> **Improvement:** Split the page into an explanation ("How authentication works"), reference ("Authentication configuration"), and a how-to guide ("How to authenticate a request"). Keep the page as a short index that links to each.
>
> **Language changes:** Remove instructional language from the overview, remove rationale from the option list, and remove conceptual explanation from the walkthrough.

## Additional Guidance

### On completeness

Completeness is a virtue in reference and a liability elsewhere. A how-to guide that covers every option becomes hard to use. A tutorial that covers every case stops being a lesson. Ask whether the additional detail helps the user complete the need in front of them.

### On examples

- Tutorials need complete, runnable examples.
- How-to guides need examples for the main path and meaningful variants.
- Reference needs short, syntactically correct examples.
- Explanation needs illustrative examples that clarify a concept, not full procedures.

### On links

Link at the point of need, not in a distant "See also" section. A user who is told to "see the reference" after finishing a task has to reconstruct their context. Place the link where the next question arises.

### On structure

Do not impose a four-part structure on every product or page. The four types describe user needs, not a mandatory information architecture. A small product may need only a tutorial and a how-to guide. A mature product may need all four, with several documents in each.

### On tone

Tone follows type:

- Tutorials may be warm and encouraging.
- How-to guides are direct and economical.
- Reference is neutral and factual.
- Explanation is discursive and may hold a perspective.

Consistency within a type matters more than uniformity across types.

### On uncertainty

When the type is unclear, use the compass in `SKILL.md`. If the need is still unclear, ask the user:

- Who is this for?
- Are they learning or working?
- Do they need to do something or understand something?

Do not guess and produce a document that sits between types.

## Quality Checklist

Use this before delivering documentation.

- [ ] The primary user need is stated or clearly implied.
- [ ] The document matches one Diataxis type.
- [ ] The language matches that type.
- [ ] No content belongs in another type without a link explaining where it went.
- [ ] The structure follows the user's path, not the product's internal organisation (except in reference, where it should mirror the product).
- [ ] Tutorials have one path, complete steps, and a working result.
- [ ] How-to guides assume competence and focus on the goal.
- [ ] Reference is neutral, consistent, and complete.
- [ ] Explanation answers "why" and discusses trade-offs.
- [ ] Examples are appropriate to the type.
- [ ] Links appear at the point of need.
- [ ] British English spelling is used throughout.
