# UI Refinements — 4 Targeted Changes

## 1. Remove header bottom border

**File:** `src/ui/components/Header.tsx:50`

Remove `border-b border-white/[0.06]` from the `<header>` className. The header will blend seamlessly into the page background.

## 2. Subtler sidebar inputs

**Files:** `src/ui/theme.ts`, `src/ui/components/CreateForm.tsx`, `src/ui/components/WorktreeList.tsx`, `src/ui/components/JiraIssueList.tsx`

The sidebar inputs currently use `bg-surface-input` (#242930) which is too prominent against the panel (#12151a). Changes:

- **theme.ts**: Add a new `input.bgSidebar` token: `'bg-white/[0.04]'` — nearly invisible, just a hint of a field
- **theme.ts**: Add `border.inputSidebar`: `'border-white/[0.06]'` — thinner/subtler than regular inputs
- **CreateForm.tsx**: Replace the `inputClass` with sidebar-specific styling: smaller padding (`px-2 py-1.5`), use `bgSidebar` + `border.inputSidebar`, `text-[11px]`
- **WorktreeList.tsx**: Same treatment for the filter input
- **JiraIssueList.tsx**: Same treatment for the search input

Settings/detail panel inputs remain unchanged — they already look good in their context.

## 3. Reduce button color noise

**Files:** `src/ui/theme.ts`, `src/ui/components/detail/ActionToolbar.tsx`, `src/ui/components/detail/GitActionInputs.tsx`

Currently every action has a unique semantic color (green start, red stop, orange commit, cyan push, purple PR). This creates visual noise. New approach:

- **Start/Stop** keep their semantic colors (emerald/red) — these are primary lifecycle actions
- **Delete** stays muted gray with red hover — already good
- **Commit, Push, PR** all become **neutral/muted** — use `text-[#9ca3af]` with `hover:bg-white/[0.06]` (same as the rename action style). Active state uses `text-white bg-white/[0.08]`
- **GitActionInputs.tsx**: Commit/PR submit buttons become neutral too — `bg-white/[0.06] text-[#9ca3af] hover:bg-white/[0.10]` (like `button.secondary`). Input focus rings become standard accent teal instead of orange/purple
- **theme.ts**: Update `action.commit`, `action.push`, `action.pr` tokens to neutral palette. Remove `border.focusCommit`, `border.focusPr`, `input.ringCommit`, `input.ringPr` (use the standard accent ones)

## 4. Jira detail panel redesign

**File:** `src/ui/components/detail/JiraDetailPanel.tsx`

Current issues: cluttered header, poor section separation, metadata hard to scan. Changes:

**Header area:**

- Keep the issue key link, type badge, status badge, priority — but add more breathing room
- Move assignee/reporter/updated metadata into a compact 2-column grid below the summary (key-value pairs)
- Labels get their own line with slightly more margin

**Section separators:**

- Replace the `divide-y divide-white/[0.06]` with explicit section containers that have `mt-6` spacing and the `SectionHeader` text
- Each section (Description, Attachments, Comments) gets a subtle top border only when preceded by another section, plus generous vertical padding (`py-5`)

**Comments:**

- Add a subtle left border accent on each comment block for visual rhythm
- Slightly larger gap between comments

**Footer metadata (created/updated):**

- Move into the header metadata grid instead of a separate footer section

## Verification

1. `pnpm check-types` — no type errors
2. `pnpm build` — successful build
3. `pnpm check-lint` — no lint errors
4. Visual check: sidebar inputs recede, action buttons are calmer, Jira detail has clear sections
