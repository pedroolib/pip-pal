// Pure profile helpers shared by main, renderer and the AI side.
import { SECTIONS, type Decoded, type Profile, type ProfileEntry, type Recipient } from './schemas'

type WithId = { id?: string }
const withId = <T extends WithId>(x: T): T => (x.id ? x : { ...x, id: crypto.randomUUID() })

/** Fills missing entry/strategy ids. Existing ids are kept, so it is idempotent. */
export function ensureIds(profile: Profile): Profile {
  const sections = mapSections(profile, (entries) => entries.map(withId))
  return { ...profile, sections, calmingStrategies: profile.calmingStrategies.map(withId) }
}

// `sections` is a full record, so "dropping" a section means emptying it.
function mapSections(
  profile: Profile,
  fn: (entries: ProfileEntry[]) => ProfileEntry[]
): Profile['sections'] {
  return Object.fromEntries(
    SECTIONS.map((s) => [s, fn(profile.sections[s] ?? [])])
  ) as Profile['sections']
}

/**
 * The profile reduced to what `recipient` may see. An empty `visibleTo` means private.
 * People (names) and pending suggestions never leave the owner.
 */
export function forRecipient(profile: Profile, recipient: Recipient): Profile {
  const visible = <T extends { visibleTo: Recipient[] }>(x: T): boolean =>
    x.visibleTo.includes(recipient)
  const sections = mapSections(profile, (entries) => entries.filter(visible))
  return {
    name: profile.name,
    role: profile.role,
    people: [],
    sections,
    calmingStrategies: profile.calmingStrategies.filter(visible)
  }
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu
// @mentions, minus trailing punctuation; a letter or "_" first, so "@10am" stays a time.
const HANDLE = /(?<![\p{L}\p{N}])@[\p{L}_](?:[\p{L}\p{N}._-]*[\p{L}\p{N}])?/gu
const TAIL = `[^\\s<>"]*[^\\s<>".,;:!?)\\]']` // a URL tail never ends on sentence punctuation
// shortcut: a bare domain (no scheme, no www.) is only caught for the TLDs listed here, so "startup.xyz" passes; widen the list when a real case shows up.
const URL_RE = new RegExp(
  `\\b(?:(?:https?|ftp)://|www\\.)${TAIL}|(?<![\\w.@-])(?:[a-z0-9-]+\\.)+(?:com|org|net|io|co|edu|gov|app|dev|ai|me|info|mx|es|uk|de|fr)\\b(?:[/?#]${TAIL})?`,
  'giu'
)
// shortcut: any run of 7+ digits split by spaces/dashes reads as a phone ("tasks 10 20 30 40" too); safe for privacy but may drop meaning, tighten if decodes suffer.
// An ISO date is matched first and kept, so "2026-11-01 10:30" is never read as a phone.
// shortcut: a phone written exactly like a valid date ("5551-12-25 67") keeps its date-shaped part; tighten if one shows up.
const PHONE =
  /(?<![\d+])(\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?!\d))|(?<![\d+])\+?\(?\d[\d\s().-]{5,}\d(?!\w)/g
const phone = (m: string, date?: string): string =>
  date || m.replace(/\D/g, '').length < 7 ? m : '[phone]'

// NFKC turns fullwidth letters into plain ones. Format characters (zero-width, soft hyphen) hide names: `fold` deletes them from keys, `softBreaks` keeps them in text as breaks.
// A lone ´ is typed as an apostrophe, and NFKC would split it into a space plus an accent.
// shortcut: NFKC also rewrites the text Claude sees ("½" -> "1⁄2", "x²" -> "x2", "℃" -> "°C"); apply it only for matching if decodes suffer.
// shortcut: Cyrillic look-alikes ("Dаna" with U+0430) are not folded to Latin; add a small skeleton map if one shows up.
const compatible = (s: string): string => s.replace(/´/g, "'").normalize('NFKC')
const normalize = (s: string): string => compatible(s).replace(/\p{Cf}/gu, '')

/**
 * The one mark left for a soft break (a run of invisible characters or wrapper tags). It is Cf, so `fold` deletes it
 * and keys never hold it, every Cf in the input becomes it so nothing can forge another, and it is no letter or mark.
 */
export const SOFT_BREAK = '\u200b'
// Every wrapper a prompt in src/main/ai uses. The lookahead stands for the `\b` after a tag name; a tag may go on with attributes.
const WRAPPER = /^\/?(?:message|said|known|correction|answers|facts)(?![\p{L}\p{N}_])/iu
const WRAPPER_HEAD = 12 // "/correction" plus the character after it
const IN_TAG = /[\p{Cc}\u200b]/u
// Whether the "<" at chars[open] starts a wrapper tag. Reads no further than the next "<".
const opensWrapper = (chars: string[], open: number): boolean => {
  let head = ''
  for (let i = open + 1; i < chars.length && chars[i] !== '<' && head.length < WRAPPER_HEAD; i++) {
    if (IN_TAG.test(chars[i])) continue
    if (/\s/.test(chars[i]) && (head === '' || head === '/')) continue
    head += chars[i]
  }
  return WRAPPER.test(head)
}
/**
 * NFKC text where each run of invisible characters or wrapper tags is one SOFT_BREAK, nested tags included: what a
 * removed tag left can complete an outer one. Idempotent, and deleting the breaks gives what `normalize` gives on tag-free text.
 */
export function softBreaks(text: string): string {
  const t = compatible(text).replace(/\p{Cf}+/gu, SOFT_BREAK)
  if (!t.includes('<')) return t
  // One pass with a stack, not a regex until stable, which is quadratic on deep nesting. A walk back either removes all
  // it read or leaves a ">" that stops the next walk, so each character is read a bounded number of times.
  const out: string[] = []
  for (const c of t.split('')) {
    out.push(c)
    if (c !== '>') continue
    for (let i = out.length - 2; i >= 0 && out[i] !== '>'; i--) {
      if (out[i] === '<' && opensWrapper(out, i)) {
        out.length = i
        out.push(SOFT_BREAK)
        break
      }
    }
  }
  return out.join('').replaceAll(/\u200b+/g, SOFT_BREAK)
}

// `text.replace(re, fn)` on the text read without its breaks. Breaks inside a replaced match go with it; all others stay.
function replaceJoined(
  text: string,
  re: RegExp,
  fn: (match: string, group?: string) => string
): string {
  if (!text.includes(SOFT_BREAK)) return text.replace(re, fn)
  const at: number[] = [] // where each joined character sits in `text`
  for (let i = 0; i < text.length; i++) if (text[i] !== SOFT_BREAK) at.push(i)
  let out = ''
  let last = 0
  for (const match of text.replaceAll(SOFT_BREAK, '').matchAll(re)) {
    const m = match[0]
    const swapped = fn(m, match[1])
    if (swapped === m) continue
    out += text.slice(last, at[match.index]) + swapped
    last = at[match.index + m.length - 1] + 1
  }
  return out + text.slice(last)
}

/**
 * Soft-broken text with emails, handles, links and phone numbers removed. Emails first: they may sit inside URLs.
 * A handle whose folded text is in `aliases` is kept, so the name swap turns it into its person's token.
 * The result still holds soft breaks: `names` reads and drops them.
 */
function stripContacts(text: string, aliases: Set<string> = new Set()): string {
  const noEmails = replaceJoined(softBreaks(text), EMAIL, () => '[email]')
  const noHandles = replaceJoined(noEmails, HANDLE, (m) =>
    aliases.has(fold(m.slice(1))) ? m : '[handle]'
  )
  return replaceJoined(
    replaceJoined(noHandles, URL_RE, () => '[link]'),
    PHONE,
    phone
  )
}

// Case, accents, apostrophes, hyphens and spacing folded, so "JOSE", "O’Brien" / "O'Brien", "Dana-Lee" / "Dana Lee","José" and "José" share one key.
const APOSTROPHES = "'’‘ʼ`"
const HYPHENS = '\\s‐‑-' // whitespace, U+2010, U+2011, hyphen-minus
// shortcut: ł/ø/ı/ß/æ have no NFD base letter, so "Łukasz" does not match "Lukasz"; add a small fold map when a user needs it.
const fold = (s: string): string =>
  normalize(s)
    .normalize('NFD')
    .replace(
      /(?<=[\p{sc=Latin}\p{sc=Greek}\p{sc=Cyrillic}\p{sc=Arabic}\p{sc=Hebrew}]\p{M}*)\p{M}/gu,
      ''
    ) // only these scripts fold marks; Thai, Devanagari, kana marks are part of the letter
    .normalize('NFC')
    .toLowerCase()
    .replace(new RegExp(`[${APOSTROPHES}]`, 'g'), "'")
    .replace(new RegExp(`[${HYPHENS}]+`, 'g'), ' ')
    .trim()
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Latin base letter -> itself plus its accented forms (Latin-1 to Extended-B, and Extended Additional for "ễ", "Ḥ"),
// so a name matches with or without accents.
const VARIANTS = new Map<string, string>()
for (const [lo, hi] of [
  [0xc0, 0x24f],
  [0x1e00, 0x1eff],
  [0x370, 0x4ff],
  [0x620, 0x6d3],
  [0x1f00, 0x1fff]
]) {
  for (let cp = lo; cp <= hi; cp++) {
    const ch = String.fromCodePoint(cp)
    const base = fold(ch)
    if (base.length === 1 && /\p{L}/u.test(base) && base !== ch.toLowerCase()) {
      VARIANTS.set(base, (VARIANTS.get(base) ?? base) + ch)
    }
  }
}
// Each letter may carry combining marks NFKC leaves loose ("Olsen" + U+034F, "Dana" + U+0332).
// The combining blocks, variation selectors and half marks are listed instead of \p{M}*, which V8 runs ~40x slower here.
const MARKS =
  '[\\u0300-\\u036f\\u0483-\\u0489\\u0591-\\u05c7\\u0610-\\u061a\\u064b-\\u065f\\u0670\\u06d6-\\u06ed\\u1ab0-\\u1aff\\u1dc0-\\u1dff\\u20d0-\\u20ff\\ufe00-\\ufe0f\\ufe20-\\ufe2f]*'
// eslint-disable-next-line no-misleading-character-class -- the class is a list of combining marks on purpose
const MARKS_RE = new RegExp(MARKS, 'iuy')

// Names are found by walking a trie of key characters from each text position: keys sharing a prefix ("a a a … q1",
// "a a a … q2") read it once instead of once per key, which took one big alternation regex to seconds on hostile text.
// Each step reuses the old regex's pieces (`iu` flags), and the walk picks what that alternation picked: the
// longest-first key that matches, ending where its backtracking first succeeds (profile.test.ts checks it byte for byte).
// A key character is one step: a letter (its accented forms, then loose marks), an optional apostrophe, or a space
// that matches a run of whitespace/hyphens.
type Step = { head: RegExp; kind: 'letter' | 'apostrophe' | 'space'; takesMark?: boolean }
// `loose`: the node ends a key or can go on with a character MARKS takes, so a letter step into it may give marks back.
type Node = { id: number; rank: number; min: number; kids: [Step, Node][]; loose?: boolean }
const steps = new Map<string, Step>()
const step = (c: string): Step => {
  let s = steps.get(c)
  if (!s) {
    const [src, kind]: [string, Step['kind']] =
      c === "'"
        ? [`[${APOSTROPHES}]`, 'apostrophe']
        : c === ' '
          ? [`[${HYPHENS}]+`, 'space']
          : [VARIANTS.has(c) ? `[${VARIANTS.get(c)}]` : escape(c), 'letter']
    steps.set(c, (s = { head: new RegExp(src, 'iuy'), kind }))
  }
  return s
}
const sticky = (re: RegExp, text: string, at: number): number => {
  re.lastIndex = at
  return re.test(text) ? re.lastIndex : -1
}
// Every character MARKS takes with `iu` (the mark blocks, plus "ι" forms through U+0345); none are astral.
let marky: string[] | undefined
const takesMark = (s: Step): boolean =>
  (s.takesMark ??= (marky ??= Array.from({ length: 0x10000 }, (_, i) =>
    String.fromCharCode(i)
  ).filter((c) => sticky(MARKS_RE, c, 0) > 0)).some((c) => sticky(s.head, c, 0) > 0))
const isLoose = (n: Node): boolean =>
  (n.loose ??=
    n.rank < Infinity ||
    n.kids.some(([s, kid]) => takesMark(s) || (s.kind === 'apostrophe' && isLoose(kid))))
// Where a step into `to` can end, as a range [hi, lo] tried from hi down, the order a backtracking regex tries them (greedy
// first), or null. Apostrophes, whitespace, hyphens and MARKS are never astral, so every index in the range is a character end.
function ends(s: Step, to: Node, text: string, at: number): [number, number] | null {
  const h = sticky(s.head, text, at)
  if (s.kind === 'apostrophe') return h < 0 ? [at, at] : [h, at]
  if (h < 0) return null
  if (s.kind === 'space') return [h, at + 1] // "+": at least one character
  const g = sticky(MARKS_RE, text, h)
  // Ending before a mark helps only if `to` can take that mark or end the key there; else only the greedy end can work.
  return [g, isLoose(to) ? h : g]
}
// Spec for the walk: the old one-big-regex matcher in __reference/profile.ts, checked by the differential tests in profile.test.ts.
function trie(keys: string[]): Node {
  let id = 0
  const node = (): Node => ({ id: id++, rank: Infinity, min: Infinity, kids: [] })
  const root = node()
  keys.forEach((k, rank) => {
    let n = root
    n.min = Math.min(n.min, rank)
    for (const c of k) {
      const s = step(c)
      let kid = n.kids.find(([x]) => x === s)?.[1]
      if (!kid) n.kids.push([s, (kid = node())])
      n = kid
      n.min = Math.min(n.min, rank)
    }
    n.rank = rank
  })
  return root
}
const NO_ENDS: [number, number] = [-1, 0] // an empty range: kid `k` is skipped
// End of the lowest-ranked key matching at `at` (keys are ranked longest first), or -1.
// `dead` is shared by every start in one text (same trie and `ok`): it holds the (node, position) visits that reach no key end.
function matchEnd(
  root: Node,
  text: string,
  at: number,
  ok: (end: number) => boolean,
  dead: Set<number>
): number {
  let best = Infinity
  let end = -1
  // A node already walked from a position found all it could there the first time; keys with loose marks reach one many ways.
  // A visit left with nothing found while `best` was still unset pruned nothing, so it is dead for every later start too:
  // without it a glued key led by two mark-taking characters ("̲̲さa", "ιιさa" on U+0345) was cubic in a run of marks (~35 s on 8000).
  // shortcut: on a run of marks the walk is still ~k·n² for a key with k mark-taking characters in a row (every start re-reads
  // the run). `aliasKey` refuses k >= 3; worst accepted on 8000: "1̲̲x" ~0.37 s, "̲̲さa" ~0.73 s, the four ι/U+0345 pairs + "さa"
  // together ~1.5 s. Names are not capped: a name "̲̲̲̲さa" takes ~1.7 s, 98 marks ~72 s. Collapse repeated marks in keys and
  // text if a real name ever has a run of marks.
  const seen = new Set<number>()
  // A depth-first walk with an explicit stack (one frame per key character, so a long name cannot overflow the call stack).
  // A frame tries its kids in order, each at every end `ends` gives, then checks its own key once they are done.
  // `e` down to `lo` are the ends still to try for kid `k`.
  type Frame = { n: Node; i: number; k: number; e: number; lo: number; visit: number }
  const stack: Frame[] = []
  const enter = (n: Node, i: number): void => {
    const visit = n.id * (text.length + 1) + i
    if (seen.has(visit) || dead.has(visit)) return
    seen.add(visit)
    stack.push({ n, i, k: -1, e: -1, lo: 0, visit })
  }
  enter(root, at)
  while (stack.length) {
    const f = stack[stack.length - 1]
    if (f.e >= f.lo && f.n.kids[f.k][1].min < best) enter(f.n.kids[f.k][1], f.e--)
    else if (++f.k < f.n.kids.length) {
      const [s, kid] = f.n.kids[f.k]
      ;[f.e, f.lo] = (kid.min < best && ends(s, kid, text, f.i)) || NO_ENDS
    } else {
      stack.pop()
      if (f.n.rank < best && ok(f.i)) [best, end] = [f.n.rank, f.i]
      if (best === Infinity) dead.add(f.visit)
    }
  }
  return end
}
const hasLetter = (s: string): boolean => /[\p{L}\p{N}]/u.test(s)

/** Longest alias Pip hides, in characters after the fold and without a leading "@". */
export const ALIAS_MAX = 100
/**
 * The key the scrubber matches an alias by (folded, without a leading "@"), or null when it ignores the alias:
 * under 2 letters or digits ("J", "@a") would swap single letters all over the text; over ALIAS_MAX, or with 3+ marks in a row, is refused.
 */
export function aliasKey(alias: string): string | null {
  const k = fold(alias).replace(/^@/, '').trim()
  if (k.length > ALIAS_MAX) return null
  // 3+ characters in a row the matcher reads as loose marks make the walk k·n² on a run of marks (98 took ~70 s); no name has that.
  let run = 0
  for (const c of k) if ((run = takesMark(step(c)) ? run + 1 : 0) > 2) return null
  const size = (
    k
      .replace(PHONE, phone)
      .replace(/\[phone\]/g, '')
      .match(/[\p{L}\p{N}]/gu) ?? []
  ).length
  return size < 2 ? null : k
}

// Name particles stay in the full-name key but are never names on their own ("del" in "reunión del lunes").
const PARTICLES = new Set(
  'de del la las los da di du do dos das le el y e van von der den bin'.split(' ')
)
const RESERVED = new Set(['me', 'someone', 'email', 'phone', 'link', 'handle'])

type Who = { role: string; real: string } // role: plain text, no brackets; real: the name restore gives back
// "[" is excluded inside too, so a long run of "[" with no "]" is scanned in linear time.
const BRACKET = /\[[^\][]+\]/g

/** Name swapping shared by `buildProfileContext` and `scrubForModel`. */
function nameSwapper(profile: Profile): {
  clean: (text: string) => string // contacts removed, then names swapped
  scrubRole: (role: string, self: Who, selfText: string) => string
  owner: Who
  restoreMap: Map<string, string> // lowercased "[Role]" -> real name
} {
  // Replace all names in ONE pass, so replacement text is never re-scanned. People override the owner.
  const owner: Who = { role: 'Me', real: profile.name.trim() }
  const someone: Who = { role: 'someone', real: '' }
  const who = new Map<string, Who>() // folded full name -> person
  // A name with no letter or digit would become a pattern that matches the empty string.
  if (hasLetter(fold(owner.real))) who.set(fold(owner.real), owner)
  // A person whose name has no letter ("🦊") is never matched by name but still gets a token for their aliases.
  const nameless = new Map<number, Who>()
  profile.people.forEach((p, i) => {
    const k = fold(p.name)
    // A role holds no brackets, "@" or contact tokens, so its [token] stays one restorable unit; each becomes a space so it never joins two words.
    const role = replaceJoined(
      stripContacts(p.role),
      /\[(?:email|handle|link|phone)\]|[[\]@]/g,
      () => ' '
    )
    // Inner breaks stay, so `scrubRole` still sees a name beside one; every token goes through `names`, which drops them.
    const collapsed = role.replace(/[\s\u200b]+/g, (m) => (/\s/.test(m) ? ' ' : m))
    const w = { role: collapsed.replace(/^[ \u200b]+|[ \u200b]+$/g, ''), real: p.name.trim() }
    if (hasLetter(k)) who.set(k, w)
    else nameless.set(i, w)
  })
  // Each word (2+ letters, not a particle) of a full name, with and without its apostrophe part ("o'brien", "brien"),
  // each hyphenated word written as one ("jeanpierre"), and the name without spaces ("samrivera")
  // point to the same person; a word two people share is just "someone". A part restores to the full name.
  // shortcut: words match case-insensitively, so a person "Will" also swaps the verb "will"; this errs toward privacy, add a common-word case rule if decodes suffer.
  // shortcut: [someone] is never restored, so the user may see it literally; explain it in the system prompt if users ask.
  // shortcut: nicknames and usernames the person did not add as aliases ("Sammy", "srivera") and possessives without an apostrophe ("Danas") pass; they need name detection.
  const all = new Map(who)
  for (const [k, w] of who) {
    const hyphened = w.real
      .split(/\s+/)
      .filter((x) => /[‐‑-]/.test(x))
      .map((x) => fold(x).replace(/ /g, ''))
    const words = [...new Set([...k.split(' '), ...k.split(/[ ']/), ...hyphened])].filter(
      (x) => x.length >= 2 && !PARTICLES.has(x) && hasLetter(x)
    )
    for (const word of k.includes(' ') ? [...words, k.replace(/ /g, '')] : words) {
      if (who.has(word)) continue
      all.set(word, all.has(word) && all.get(word) !== w ? someone : w)
    }
  }
  // Aliases join the same map whole (no word split, no space-less form) and without "@", so "@alexr" and "alexr" both match.
  // They never get their own token: restore gives the full name. Full names win; a key two people share is "someone".
  const aliases = new Set<string>()
  const owned: [Who, string[] | undefined][] = [
    [owner, profile.aliases],
    ...profile.people.map((p, i): [Who, string[] | undefined] => [
      who.get(fold(p.name)) ?? nameless.get(i)!,
      p.aliases
    ])
  ]
  for (const [w, list] of owned) {
    for (const a of list ?? []) {
      const k = aliasKey(a)
      if (k === null) continue
      // PHONE runs before the swap, so an alias's 7+ digit run is matched as "[phone]" ("srivera8675309" -> "srivera[phone]").
      const key = k.replace(PHONE, phone)
      aliases.add(k)
      if (who.has(key)) continue
      all.set(key, all.has(key) && all.get(key) !== w ? someone : w)
    }
  }
  // Longest first so "Ana Maria" wins over "Ana". Digits and "_" count as boundaries, so "sam_rivera" and "sam123" match.
  // An optional "@" lets a handle kept for an alias ("@alexr") become its token whole.
  // Scripts written without spaces (and Korean particles) glue names to the next word, so those keys skip the word boundary.
  // shortcut: Arabic/Hebrew prefixes glued to a name still leak; add those scripts to `unspaced` if that matters.
  // shortcut: one-character Han names and name parts that are ordinary words (まい, ชาย, 지원) over-scrub; partial CJK names stored without a space
  // (田中太郎 vs "田中さん", 王伟 vs "王总") are not caught; Tibetan syllable-split parts leak. Users should store CJK names with a space between family and given name.
  const U =
    '\\p{sc=Han}\\p{sc=Hiragana}\\p{sc=Katakana}\\p{sc=Hangul}\\p{sc=Thai}\\p{sc=Lao}\\p{sc=Khmer}\\p{sc=Myanmar}\\p{sc=Tibetan}'
  const unspaced = new RegExp(`[${U}]`, 'u')
  const edge = `(?![${U}])[\\p{L}\\p{M}]` // a letter or mark, but not one from a script written without spaces
  const keys = [...all.keys()].sort((x, y) => y.length - x.length)
  const spaced = trie(keys.filter((k) => !unspaced.test(k)))
  const glued = trie(keys.filter((k) => unspaced.test(k)))
  const before = new RegExp(`(?<!${edge})`, 'iuy')
  const after = new RegExp(`(?!${edge})`, 'iuy')
  // Where a name starting at `at` ends, or -1: a spaced key between word boundaries (after an "@" if one fits), else a glued key.
  const nameEnd = (
    text: string,
    at: number,
    dead: [Set<number>, Set<number>],
    breaks: Set<number>
  ): number => {
    const bounded = (e: number): boolean => breaks.has(e) || sticky(after, text, e) >= 0
    let e = -1
    if (breaks.has(at) || sticky(before, text, at) >= 0) {
      if (text[at] === '@') e = matchEnd(spaced, text, at + 1, bounded, dead[0])
      if (e < 0) e = matchEnd(spaced, text, at, bounded, dead[0])
    }
    return e < 0 ? matchEnd(glued, text, at, () => true, dead[1]) : e
  }
  // Same as `text.replace(oneBigRegex, fn)`: left to right, one pass, replacement text never re-scanned.
  // The walk reads the text without its breaks, so a name reads across them and the trie never sees one; a break only
  // counts as a word boundary. All breaks are gone from the result. Where one was the only boundary of a spaced key, the
  // old code leaked, and a space keeps the words apart ("Alex<ZWSP>said" -> "[Manager] said", "Alex<ZWSP>ander" -> "[Manager] ander").
  const names = (soft: string, fn: (m: string) => string): string => {
    const text = soft.replaceAll(SOFT_BREAK, '')
    const breaks = new Set<number>()
    for (let i = 0, j = 0; i < soft.length; i++) {
      if (soft[i] === SOFT_BREAK) breaks.add(j)
      else j++
    }
    let out = ''
    let last = 0
    const dead: [Set<number>, Set<number>] = [new Set(), new Set()]
    for (let at = 0; at < text.length;) {
      const e = nameEnd(text, at, dead, breaks)
      if (e > at) {
        const m = text.slice(at, e)
        const isSpaced = !unspaced.test(m)
        out += text.slice(last, at)
        if (isSpaced && breaks.has(at) && sticky(before, text, at) < 0 && !out.endsWith(' ')) {
          out += ' '
        }
        out += fn(m)
        if (isSpaced && breaks.has(e) && sticky(after, text, e) < 0) out += ' '
        last = at = e
      } else at += text.codePointAt(at)! > 0xffff ? 2 : 1
    }
    return out + text.slice(last)
  }
  // Looked up without apostrophes, since the pattern lets "OBrien" match "O'Brien".
  const bare = new Map([...all].map(([k, w]) => [k.replace(/'/g, ''), w]))
  const find = (m: string): Who => bare.get(fold(m).replace(/^@|'/g, '')) ?? someone
  // Names inside a role would leak through the replacement, so a role is scrubbed one level deep:
  // another person's name becomes their plain role (any name left inside that becomes "Me" for the owner, else "someone"),
  // and the person's own name becomes "this person", which keeps self-references from looping.
  const scrubRole = (role: string, self: Who, selfText: string): string =>
    names(role, (m) => {
      const w = find(m)
      return w === self ? selfText : names(w.role, (n) => (find(n) === owner ? 'Me' : 'someone'))
    })
  const token = new Map<Who, string>([
    [owner, '[Me]'],
    [someone, '[someone]']
  ])
  const restoreMap = new Map<string, string>()
  if (owner.real) restoreMap.set('[me]', owner.real)
  const people = [...new Set([...who.values(), ...nameless.values()])].filter((w) => w !== owner)
  // A role that is empty or reads like a fixed token becomes "person", so it cannot take over [Me] or [email].
  const base = people.map((w) => {
    const b = scrubRole(w.role, w, 'this person')
    return !b || RESERVED.has(b.toLowerCase()) ? 'person' : b
  })
  const used = new Set([...RESERVED].map((r) => `[${r}]`))
  people.forEach((w, i) => {
    const same = people.filter((_, j) => base[j].toLowerCase() === base[i].toLowerCase())
    // People sharing a role get numbered tokens; a suffix covers clashes like "Manager" x2 next to "Manager 1".
    const b = same.length > 1 ? `${base[i]} ${same.indexOf(w) + 1}` : base[i]
    let t = `[${b}]`
    for (let n = 2; used.has(t.toLowerCase()); n++) t = `[${b} ${n}]`
    used.add(t.toLowerCase())
    token.set(w, t)
    restoreMap.set(t.toLowerCase(), w.real)
  })
  const swap = (text: string): string => names(text, (m) => token.get(find(m))!)
  // A kept alias handle the swap missed (a mark outside MARKS after it) still never leaves; tokens never hold "@" + letter.
  const clean = (text: string): string =>
    swap(stripContacts(text, aliases)).replace(HANDLE, () => '[handle]')
  return { clean, scrubRole, owner, restoreMap }
}

/** Claude-ready text. Names become [Role], contacts are removed; pending entries are never included. */
export function buildProfileContext(profile: Profile): string {
  const { clean, scrubRole, owner } = nameSwapper(profile)
  const lines: string[] = [`[Me], ${scrubRole(stripContacts(profile.role), owner, 'Me')}`]
  for (const section of SECTIONS) {
    const entries = profile.sections[section]
    if (!entries?.length) continue
    lines.push('', `## ${section}`)
    for (const e of entries) lines.push(`- ${clean(e.text)} (${e.origin})`)
  }
  if (profile.calmingStrategies.length) {
    lines.push('', '## calmingStrategies')
    for (const c of profile.calmingStrategies) {
      lines.push(`- ${clean(c.label)} (${c.minutes} min) (${c.origin})`)
    }
  }
  return lines.join('\n')
}

/**
 * The text as it may leave the machine: emails, links and phone numbers removed, names swapped
 * for [Role] / [Me]. `restore` turns the role tokens in a reply back into the real names.
 */
export function scrubForModel(
  text: string,
  profile: Profile
): { text: string; restore: (s: string) => string } {
  const { clean, restoreMap } = nameSwapper(profile)
  // Contacts before names, so a name inside an address cannot split it.
  return {
    text: clean(text),
    // Only an exact token restores; a shortened or altered one ("[Teammate]") stays as written.
    // shortcut: a message that already contains a token ("ask [Manager 1]") is restored to a real name; owner-only output, escape typed tokens if it misleads.
    restore: (s) => s.replace(BRACKET, (m) => restoreMap.get(m.toLowerCase()) ?? m)
  }
}

/** Every string in a decode, restored. Only strings change; shape and other values are kept. */
export function restoreDecoded(decode: Decoded, restore: (s: string) => string): Decoded {
  const walk = (v: unknown): unknown =>
    typeof v === 'string'
      ? restore(v)
      : Array.isArray(v)
        ? v.map(walk)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
          : v
  return walk(decode) as Decoded
}
