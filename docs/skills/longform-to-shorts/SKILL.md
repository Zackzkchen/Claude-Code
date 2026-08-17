---
name: longform-to-shorts
description: Turn a long recording into short, self-contained clips that make sense to someone who never saw the original.
when_to_use: >
  Use when the user has a long video or recording and wants short clips cut out of
  it. Examples "find the best moments and make a short out of it", "turn this into
  shorts", "clip this podcast", "make three shorts from this", "what are the best
  parts of this", "cut this down into something I can post". Do not use when the
  user wants several variants of one finished edit (use hook-variants instead), or
  when they only want an existing edit resized for another platform (use
  multi-platform-cut instead).
allowed-tools:
  - MediaProbe
  - Transcript
  - Timeline
  - Audio
  - Caption
  - Export
argument-hint: "[clip_count] [max_seconds] [platform]"
arguments:
  - clip_count
  - max_seconds
  - platform
context: fork
version: 1.0.0
---

# Longform to Shorts

Find the moments in a long recording that can travel on their own, and cut each
one into a clip that needs no setup, no context, and no apology.

The hard part of this job is not cutting. It is choosing. Most of this skill is
about how to choose, and about refusing to deliver a weak clip just because a
number was requested.

## Inputs

Arguments are positional and may arrive empty. Apply the default whenever a
value is empty.

- `$clip_count` — how many clips to produce. Default 3. If the user said "a
  short" or "a clip" in the singular, treat that as 1.
- `$max_seconds` — hard ceiling per clip. Default 45.
- `$platform` — delivery target. Default vertical 9:16 short-form.

## Goal

Up to `$clip_count` clips, each at or under `$max_seconds`, each of which a
stranger can watch cold and fully understand. Every clip ships with captions,
leveled audio, and a one-line reason it was chosen.

Delivering two strong clips is a success. Delivering three clips where one is
padding is a failure.

## What makes a moment worth clipping

Score every candidate against these five signals. A moment needs at least three
to qualify, and signal 1 is mandatory.

1. **Standalone** — the opening sentence makes sense with zero prior context.
   This one is non-negotiable.
2. **Payoff** — the thought completes inside the clip. Nothing is left hanging.
3. **Specificity** — contains a number, a name, a date, or a concrete example
   rather than a general opinion.
4. **Tension** — surprising, contrarian, a mistake being admitted, or something
   at stake.
5. **Delivery** — the voice changes. Faster, louder, slower, or emotional. Flat
   delivery does not travel no matter how good the words are.

Reject a candidate outright when any of these are true.

- The first sentence opens with "so", "and", "but", "because", or "like". These
  signal that the setup lives in the part being cut away.
- It refers to something the viewer cannot see, for example "as I showed
  earlier" or "this chart here", and the reference cannot be trimmed out.
- The punchline depends on a section that is not included in the clip.
- It names a person, product, or concept that was introduced earlier and would
  read as unexplained jargon.

## Steps

### 1. Probe the source and check that this skill is the right one

Read the duration and measure the share of the runtime that is speech.

If the source is under 3 minutes, stop and say that tightening the existing cut
is the better move rather than clipping it. If speech is under 40 percent of the
runtime, say that this is footage-led material and a beat-matched montage will
outperform transcript-driven clipping. In both cases hand the decision back to
the user instead of proceeding.

**Success criteria** — duration and speech share are measured, and either the
skill continues with a stated reason, or it stops with a concrete alternative.

### 2. Transcribe with timestamps

Produce a timestamped transcript. Mark speaker changes, silences over one
second, false starts, and any sentence the speaker restarts.

**Artifacts** — the timestamped transcript, reused by every later step. Do not
re-transcribe.

**Success criteria** — transcript covers the full runtime, and every silence
over one second is marked.

### 3. Build the candidate list

Segment the transcript into complete thoughts, not fixed time windows. A
candidate runs from the first word of an idea to the last word of its payoff.

Collect every candidate between 15 and 90 seconds. Over-collect here. It is
cheaper to reject candidates in the next step than to go looking for more.

**Success criteria** — at least three times `$clip_count` candidates exist, each
with start and end timestamps and its full text.

### 4. Score and select

Apply the rubric above to every candidate. Record the signals each one hit and
the reason for every rejection.

Select the top `$clip_count`, then check the selection as a set. Drop any clip
that makes substantially the same point as a stronger one, and do not backfill
it. Two clips saying the same thing compete with each other once posted.

If fewer than `$clip_count` candidates qualify, deliver fewer and say so
plainly. Never lower the bar to hit the number.

**Rules** — never pad the count with a clip that failed signal 1.

**Artifacts** — the selected moments plus a written rationale per clip. The
rationale must survive into the final report, because the user will ask why
these were chosen.

**Success criteria** — every selected clip has its qualifying signals listed,
and every rejected near-miss has a one-line reason.

### 5. Set the in and out points

Move the in point to the first frame of the first word, with a breath of
headroom so the clip does not start clipped. Move the out point just past the
final consonant of the payoff, then stop. Trailing dead air after a payoff is
the most common reason a viewer scrolls before the loop.

**Success criteria** — no clip begins mid-word or mid-breath, and no clip has
more than half a second of silence after its final word.

### 6. Rework the opening into a hook

Identify the strongest single sentence in the clip. If it is not already first,
move it to the front as a cold open and let the original opening follow it.

The first three seconds must contain one complete sentence that is
comprehensible with the sound off.

**Rules** — never fabricate or reword a claim the speaker did not make.
Reordering their own sentences is allowed. Inventing a sentence is not.

**Success criteria** — the first three seconds of every clip hold a complete
sentence, and playing it muted with captions still communicates the hook.

### 7. Tighten

Remove filler words, false starts, repeated words, and self-corrections.
Compress remaining pauses toward 0.3 seconds.

Keep a pause longer than 1.5 seconds when it lands immediately before a key
claim or after a punchline. That pause is doing work.

Only after all of the above, if a clip still exceeds `$max_seconds`, apply a
mild speed-up. Never lead with speed to solve a length problem.

**Success criteria** — every clip is at or under `$max_seconds`, no cut is
audible as a click or a half-breath, and any deliberately kept pause is noted.

### 8. Caption, level, and frame

Burn in captions sized for `$platform`, one short line at a time, positioned
clear of the speaker's face and hands. Normalize loudness so all clips match
each other, and reframe to the target aspect ratio with the speaker inside the
safe area.

**Success criteria** — captions are readable at phone size and never cover a
face, loudness is consistent across clips, and the speaker is never cropped.

### 9. Export and report

Export every clip, then report in this shape and nothing longer.

- one line per clip stating what it is about and which signals it hit
- original runtime against total delivered runtime
- how many filler words and how much dead air were removed
- any near-miss that was rejected, with its reason
- if fewer clips than requested were delivered, why

**Rules** — the per-clip rationale from step 4 must appear verbatim in this
report. It is the only record of the selection reasoning that reaches the user.

**Success criteria** — every requested clip is exported and playable, and the
user can decide what to post by reading the report alone without opening a
single file.

## Hard rules

- Never invent words the speaker did not say.
- Never deliver a clip whose opening sentence needs prior context.
- Never pad the clip count.
- Never solve length with speed before solving it with cuts.
- Never cut a pause that is carrying meaning.
- Always state which clips were rejected and why. The rejections are as
  informative to the user as the selections.
