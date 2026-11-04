# Pip

A desktop companion for autistic adults in their first year of work. It keeps their profile alive and uses it to decode vague work messages.

## Language

**Profile**:
What Pip knows about how the person works best, split into sections, people and calming strategies. Shown to the person as "My profile".
_Avoid_: Manual, Mi manual, manual (in new text)

**Onboarding**:
The first-run setup where the person answers Pip's questions and Pip drafts their profile from those answers.
_Avoid_: Setup wizard, intro, tutorial

**Suggestion**:
A profile entry Pip proposes and the person accepts, edits or rejects; it is never used or shared until accepted.
_Avoid_: Pending entry (in UI text), insight

**Origin**:
Who wrote an entry's current text: `self` (the person), `onboarding` (Pip, from onboarding answers) or `learned` (Pip, from usage patterns or by rewriting a correction). Editing an entry makes it `self`.
_Avoid_: Coach entry, source

**Lesson**:
A note about the person's work that Pip saves when they correct it or answer its request for context. Shown to the person as "What you taught Pip". The profile is about the person; lessons are about their work.
_Avoid_: Memory entry, fact

**Kept answer**:
An onboarding answer saved in the profile word for word, because the person chose not to send it or Pip could not reach the model. Pip can still be asked to rewrite it.
_Avoid_: Literal entry, raw answer

**Real profile**:
A profile built by an actual person through onboarding, as opposed to Sam's demo profile.
_Avoid_: User profile

**Command**:
Pip's one keyboard shortcut (Ctrl+Shift+Space). With text selected it reads that text; with nothing selected it opens the command menu.
_Avoid_: Hotkey, capture shortcut, record hotkey

**Command menu**:
The small list that opens at the cursor when the command finds nothing selected: Pip's Home, Let Pip listen, Check-In, Tell Pip and Remember Pip.
_Avoid_: Launcher, palette

**Tell Pip**:
Writing or speaking to Pip and pressing Send. Pip answers with a reply and its why, and may offer to keep the words as a note. Only sent text leaves the machine, scrubbed.
_Avoid_: Chat, ask Pip, prompt

**Reminder**:
Something the person asked Pip to bring back at a chosen time. Kept on this machine, outside the profile, and shown under "Coming up". Pip never sends it anywhere.
_Avoid_: Alarm, task, timer

**Voice capture**:
Recording spoken words from the command menu ("Let Pip listen") or `pip-pal --record`, writing them down on this machine and reading the reviewed text with Pip.
_Avoid_: Meeting notes, dictation

**Source**:
What voice capture listens to: Microphone, Computer audio or Both.
_Avoid_: Input, device

**Transcript**:
The text Pip wrote down from a recording. Only the part the person reviews and sends leaves the machine, like any selection.
_Avoid_: Notes, recording (for the text)
