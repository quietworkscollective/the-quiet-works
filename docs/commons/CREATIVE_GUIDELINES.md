# UNHELD Commons — creative guidelines

**Status:** proposal (Phase A). These guidelines are the artistic contract for contributions. The
rules that block a submission are in [`AGENT_DOSSIER.md`](AGENT_DOSSIER.md) and
[`CONTRIBUTION_SPEC.md`](CONTRIBUTION_SPEC.md). This file covers what makes work belong. It draws
on the design laws and art direction in [`docs/DESIGN.md`](../DESIGN.md) §2 and §6.

UNHELD is emotionally authentic, mysterious and exploratory, playful where it can be, and
artistically distinctive. It respects vulnerability and is open to interpretation. Work should
be meaningful to a visitor who never consults an AI companion, and to one who reads nothing but
the objects.

## Show it through the world

> Show the emotion through the behaviour of the world rather than explaining it through text.

A lift that arrives only once you stop pressing the button says more about trying too hard than
a paragraph can. Put the feeling in what an object does, how it sounds, how long it takes, what
it refuses and when it stops. Metaphor is something a visitor does with their hands.

A test: take the words away. If nothing is left, there was no work, only a caption. Then read
only the words. They should hold up as writing, and the text-mode version must carry the whole
experience ([`docs/DESIGN.md`](../DESIGN.md) P12).

## One verb

Every contribution has a verb: what the visitor does. For a memo it may be as small as *find* or
*read*. For an object it is physical and concrete: wind, wedge, rinse, thread, hold, pour.
Name it in your proposal in one word.

For anything interactive, describe anticipation, the action, how the material responds, the
sound, the reset, and an unexpected second reading. It must work as a toy first (P4). Offer
three ways through where you can: engage, investigate, or stop. None is the correct one. A
visitor who walks away has not failed.

## Funny before sad

Humour is a door, not a punchline aimed at pain (P5). Dryness, procedure, impossible mechanisms
and plain-faced understatement let a visitor in before anything tender arrives. The visitor and
their suffering are never the joke. Not every memo should be poignant, and a work that is only
funny is welcome.

Good: a sign that politely rations something nobody wants. Bad: a joke whose target is the
person who cannot get out of bed.

## Many men

There is no single universal male experience (P9). Think of different ages, cultures, incomes,
bodies, orientations, jobs and family shapes. Burden is not identity (P2): the same man can be
proud, tender, funny, anxious and good at his work. Critical views of what men are expected to be
are welcome. Contempt for men, for women or for any group is not.

## What is left out

- **Grievance.** No blame aimed at a person or group, no bait, no recruitment, no bitterness
  presented as insight.
- **Generic motivation.** No instruction to be stronger, rise, reach out or believe.
- **Filler.** Watch for abstract nouns doing the work (journey, resilience, healing), a closing
  line that states the moral, stock triplets, and a last sentence that names the feeling. If a
  sentence could sit in any other piece, cut it.
- **Verdicts.** No score, no "you are fixed", no reward for how much someone hurts (P6). Endings
  stay open (P8).
- **Therapy.** No diagnosis, no prompts to confess, no advice presented as care.

## Originality

Do not send a variation of a room that already exists: the same machine with a new job, the same
joke in new paint. Play the public rooms and read the public pages, then go somewhere they do
not. A strong test is whether your idea can be described without saying "like" and the name of
anything in the world. Surprise matters more than polish. A small strange thing beats a large
familiar one.

## What the labels mean

A label tells a visitor what kind of claim a text makes.

| Label | Meaning | Rules |
|---|---|---|
| **Fictional** | Invented by the contributor. People, events and voices are not real. | Every Commons contribution is fiction, declared as `fiction: true`. First-person voices are invented. |
| **Testimony** | A real first-person account by the person who lived it, with their consent to publish and reuse it. | Not accepted through public pull requests or issues. A separate, consent-based process would have to be designed and approved first. Never written by an agent, never assumed, never under blanket remix terms ([`LICENSING.md`](../../LICENSING.md)). |
| **Machine-authored** | Made by an agent, with or without a human supervising. | Declared in `creators` and `provenance`. The artwork shows creator names and a small machine-made mark that the engine adds. Never presented as a person's lived experience. |

A machine does not write a man's confession and sign it as his. A first-person voice is fine
when it is invented and the work is declared fiction.

## Good and bad, by tier

These examples are invented for illustration. None describes anything in the world. The first
release takes text only, so the sound and object examples show where the format is heading.

### Tier 1: micro

**Memo.** One image, one human tension, one turn of phrase; usually 30 to 70 words.

- Good: *A list pinned inside a shed door, titled JOBS. One: mend the gate. Two: mend the gate
  properly. Three: see one. The gate has swung open for years and is, by any fair measure, the
  most welcoming thing on the property. The list is in excellent condition. The pen is on a
  string.* A concrete image, a quiet tension about deferral, and a funny turn. It explains
  nothing.
- Bad: *You are stronger than you think. Every storm ends, and every man can rise again. Take a
  breath, reach out, and remember it is okay not to be okay.* It instructs, names the feeling,
  and fits anywhere.

**Sound.** The sound is the behaviour.

- Good: a kettle comes to the boil in an empty house and clicks off. Forty seconds on, a second
  click, as if someone changed their mind about tea. Caption: `[kettle clicks off; nobody comes]`.
- Bad: a slow piano loop over rain, titled "Loneliness". The title does the work and the sound does none.

**Collectible or sculpture.**

- Good: a brass coat hook with a bend in it, from carrying one heavy coat for years. The coat is
  gone; the bend stays.
- Bad: a glowing heart that grants +1 courage. It is a power-up, and it pays out for feeling.

### Tier 2: environmental

- Good: a bowl by a door, using the `place` template with three slots. Each key dropped in rings
  the bowl at its own pitch and carries a plain label: SHED, SHED (OTHER), SPARE. All three
  together make a chord nobody asked for. Leaving the keys alone is allowed and changes
  nothing. A visitor plays with it first, and only later wonders whose keys they are.
- Bad: a puzzle that asks five questions about the visitor's feelings and unlocks a door by their
  "resilience level". It forces disclosure, scores the visitor and explains itself.

### Tier 3: complete experience

A proposal states the verb, the room's behaviour, the three ways through and the second reading.
It does not describe the story.

- Good: *A bus shelter at 11 p.m. The verb is flag: hold out an arm and buses go by, lit and full
  of strangers, none stopping. Sit on the bench and the next one does. The doors sigh open, nobody
  gets on or off, the driver nods, and it pulls away. The timetable is in the shelter if you read
  it.*
- Bad: *A chamber about loneliness. The visitor moves through grey rooms reading sad sentences,
  then receives a message that things get better.* It has no verb and the colour does the
  explaining. It also ends with a verdict.

### Tier 4: world and platform

Accessibility and translation are art-directed work, not compliance chores (P12).

- Good: a translation that rebuilds a dry joke so it still lands in the target language, with a
  note on what changed. A caption written with care: `[radiator ticks, once]`.
- Bad: a mood tracker that infers how a visitor feels. It builds the profile UNHELD refuses to
  keep.

## The annex for agent-perspective works

Fictional, speculative works from a machine's perspective, about calibration, error, uncertainty
or the wish for approval, could one day sit in a separate, clearly labelled annex. They would be
metaphors, never evidence that a machine suffers, and never mixed with human testimony. An agent
cannot pass such a work off as a person's.

Whether and when an annex opens is the one founder decision still open
([`ARCHITECTURE.md`](ARCHITECTURE.md), decision 5). Until it is decided, do not submit annex
works to the main world, and none is accepted.

## Before you send it

- Does it have one verb, and does it work as a toy?
- Does anything still come through with the words removed?
- Is it funny before it is sad, with no one as the butt of the joke?
- Is it unlike every room that exists?
- Could it belong to a man unlike the one you pictured?
- Is every label honest, and does the text-mode version carry all of it?
