export const PEOPLE = {
  t128n: { login: 't128n', name: 'Torben Haack', initials: 'TH' },
  mira: { login: 'mira', name: 'Mira Chen', initials: 'MC' },
  otto: { login: 'otto', name: 'Otto Berg', initials: 'OB' },
  dana: { login: 'dana', name: 'Dana Okafor', initials: 'DO' }
};

export const CURRENT_USER = PEOPLE.t128n;

export const REPOS = [
  { key: 'funnel', name: 'funnel', prefix: 'FUN' },
  { key: 'assay', name: 'assay', prefix: 'ASY' },
  { key: 'forges.link', name: 'forges.link', prefix: 'FRG' },
  { key: 'intake', name: 'intake', prefix: 'ING' }
];

export const STATUSES = [
  { key: 'Backlog', tone: 'secondary', icon: 'bi-circle' },
  { key: 'Todo', tone: 'secondary', icon: 'bi-circle' },
  { key: 'In progress', tone: 'primary', icon: 'bi-circle-half' },
  { key: 'In review', tone: 'warning', icon: 'bi-eye' },
  { key: 'Done', tone: 'success', icon: 'bi-check-circle' }
];

export const PRIORITIES = [
  { key: 'P1', label: 'P1 High', tone: 'danger' },
  { key: 'P2', label: 'P2 Medium', tone: 'body' },
  { key: 'P3', label: 'P3 Low', tone: 'secondary' }
];

export const SIZES = ['S', 'M', 'L'];

export const MILESTONES = [
  '2026.11 · Composer pass',
  '2026.10 · Bugzilla pass',
  '2026.11 · Triage pass',
  '2026.12 · Sync hardening',
  ''
];

export const GROUPINGS = [
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'none', label: 'Nothing' }
];

const p = (text) => ({ type: 'p', text });
const h2 = (text) => ({ type: 'h2', text });
const h3 = (text) => ({ type: 'h3', text });
const ul = (items) => ({ type: 'ul', items });
const ol = (items) => ({ type: 'ol', items });
const code = (text, language = '') => ({ type: 'code', text, language });
const quote = (text) => ({ type: 'quote', text });
const table = (head, rows) => ({ type: 'table', head, rows });

const event = (actor, action, time, icon = 'bi-dot') => ({
  type: 'event',
  actor,
  action,
  time,
  icon
});

const comment = (author, time, body) => ({ type: 'comment', author, time, body });

function defaultTimeline(issue) {
  const assignee = issue.assignee ? PEOPLE[issue.assignee] : null;
  const timeline = [
    event(issue.author, 'opened this issue', issue.openedLabel, 'bi-plus-circle'),
    event(issue.author, `added the label ${issue.labels[0] || 'needs-triage'}`, issue.openedLabel, 'bi-tag')
  ];

  if (assignee) {
    timeline.push(event(PEOPLE.t128n.login, `assigned this to ${assignee.name}`, issue.updatedLabel, 'bi-person'));
    timeline.push(
      comment(
        assignee.login,
        issue.updatedLabel,
        [
          p(
            `I can reproduce this on the current build. I am keeping the change narrow: one regression test, one behavior change, and a note in the release checklist.`
          ),
          p(`The repository and milestone are correct on my side. I will post the patch once the first pass is green.`)
        ]
      )
    );
  }

  return timeline;
}

const issues = [
  {
    id: 'FUN-58',
    number: 58,
    repo: 'funnel',
    title: 'Comment composer loses formatting on Cmd+Enter in Safari',
    status: 'In progress',
    priority: 'P1',
    size: 'M',
    assignee: 'mira',
    author: 'dana',
    milestone: '2026.11 · Composer pass',
    labels: ['bug', 'regression'],
    epic: 'Issue composer',
    openedAt: '2026-10-31T08:10:00Z',
    openedLabel: '3 days ago',
    updatedAt: '2026-11-03T10:15:00Z',
    updatedLabel: '1 hour ago',
    description: [
      p(
        'When a comment is submitted with **Cmd+Enter** in Safari, the composer drops the paragraph breaks and sends the entire body as one block. The issue is specific to the keyboard shortcut; the Comment button behaves correctly.'
      ),
      h2('Steps to reproduce'),
      ol([
        'Open any issue with more than two paragraphs in the comment composer.',
        'Put the caret at the end of the second paragraph.',
        'Press **Cmd+Enter** on macOS Safari 26.',
        'Open the posted comment in the activity stream.'
      ]),
      h2('Expected'),
      ul([
        'Paragraph breaks survive the submission.',
        'Lists and fenced code blocks keep their block boundaries.',
        'A failed serialization leaves the draft in the composer instead of posting a flattened comment.'
      ]),
      h2('Where it goes wrong'),
      p(
        'The shortcut calls `submitDraft()` before the editor has flushed its pending transaction. The button path awaits `editor.flush()` first. That is the entire difference between the two code paths.'
      ),
      quote(
        'We should make the submission path identical for every trigger. Keyboard shortcuts should not have a second serialization contract.'
      ),
      code(
        `async function submitDraft(draft) {
  const body = await editor.flush();
  if (!body.trim()) return;

  await comments.create({
    issueId: draft.issueId,
    body,
    source: draft.source
  });
}`,
        'ts'
      ),
      h3('Acceptance criteria'),
      ul([
        'Cmd+Enter and the Comment button produce byte-identical payloads.',
        'Pressing Escape during submission keeps the draft.',
        'A regression test covers Safari and Chromium.'
      ]),
      table(
        ['Surface', 'Current behavior', 'Required behavior'],
        [
          ['Comment button', 'Preserves blocks', 'No change'],
          ['Cmd+Enter', 'Flattens blocks', 'Preserves blocks'],
          ['Draft restore', 'Works', 'Works after failure']
        ]
      )
    ],
    timeline: [
      event('dana', 'opened this issue', '3 days ago', 'bi-plus-circle'),
      event('mira', 'moved this from Todo to In progress', '2 days ago', 'bi-arrow-right-circle'),
      event('mira', 'added the label regression', '2 days ago', 'bi-tag'),
      comment('mira', '2 days ago', [
        p(
          'Confirmed on Safari 26 and on the WebKit build used by the desktop wrapper. Chromium is fine, which is why the original test suite missed it.'
        ),
        p(
          'The shortcut path is the only caller that does not await `editor.flush()`. I have a failing test in `composer.spec.ts` and will push the fix behind it.'
        )
      ]),
      comment('dana', '1 day ago', [
        p(
          'The same thing happens if I paste a list and then use Cmd+Enter immediately. Waiting for the editor to settle first makes it reliable, so the flush ordering explanation matches what I see.'
        )
      ]),
      event('mira', 'set the milestone to 2026.11 · Composer pass', '1 day ago', 'bi-flag'),
      comment('otto', '4 hours ago', [
        p(
          'Please keep the fallback in place for older Safari versions. We still have two installations pinned to the previous minor release.'
        )
      ])
    ]
  },
  {
    id: 'FUN-53',
    number: 53,
    repo: 'funnel',
    title: 'Make the reserved label vocabulary configurable',
    status: 'Backlog',
    priority: 'P2',
    size: 'M',
    assignee: 't128n',
    author: 'otto',
    milestone: '2026.11 · Triage pass',
    labels: ['enhancement'],
    epic: 'Labels and triage',
    openedAt: '2026-10-20T09:30:00Z',
    openedLabel: '2 weeks ago',
    updatedAt: '2026-11-02T16:20:00Z',
    updatedLabel: '1 day ago',
    description: [
      p(
        'The reserved label vocabulary is hard-coded in three places: the API, the CLI, and the web form. It should be configurable per workspace while keeping the shipped defaults.'
      ),
      h2('Proposal'),
      ul([
        'Move the built-in vocabulary into a shipped default configuration file.',
        'Allow a workspace to add labels and mark a label as exclusive within a group.',
        'Keep validation in one service so the CLI and the web form cannot drift.'
      ]),
      h2('Default vocabulary'),
      code(
        `type: [bug, enhancement, documentation, chore]
priority: [low, normal, high, urgent]
state: [needs-triage, blocked]`,
        'yaml'
      ),
      p(
        'Renaming a reserved label should be a display alias, not a migration. Existing issue history must not be rewritten.'
      )
    ]
  },
  {
    id: 'FUN-61',
    number: 61,
    repo: 'funnel',
    title: 'Add keyboard navigation to the issue table',
    status: 'Todo',
    priority: 'P2',
    size: 'S',
    assignee: 'dana',
    author: 't128n',
    milestone: '2026.11 · Triage pass',
    labels: ['accessibility', 'enhancement'],
    epic: 'Issue list',
    openedAt: '2026-10-28T12:05:00Z',
    openedLabel: '6 days ago',
    updatedAt: '2026-11-02T09:40:00Z',
    updatedLabel: '1 day ago',
    description: [
      p(
        'The issue table can only be operated with a pointer. Rows should be reachable with the arrow keys, and Enter should open the focused issue.'
      ),
      h2('Scope'),
      ul([
        'Roving tabindex across rows.',
        'Home and End move to the first and last row.',
        'Enter opens the issue; Space selects it for bulk actions.',
        'The focused row must remain visible when the list scrolls.'
      ]),
      p('This is a keyboard-only change. Do not add a separate focus mode or a second list component.')
    ]
  },
  {
    id: 'FUN-62',
    number: 62,
    repo: 'funnel',
    title: 'Issue counts disagree between sidebar and list header',
    status: 'In progress',
    priority: 'P2',
    size: 'S',
    assignee: 'otto',
    author: 'mira',
    milestone: '2026.11 · Triage pass',
    labels: ['bug'],
    epic: 'Navigation',
    openedAt: '2026-10-29T14:20:00Z',
    openedLabel: '5 days ago',
    updatedAt: '2026-11-01T11:10:00Z',
    updatedLabel: '2 days ago',
    description: [
      p(
        'The sidebar badge counts all open issues, while the list header counts only the issues matching the current repository scope. Two different numbers appear on the same screen.'
      ),
      h2('Decision'),
      p(
        'The badge should reflect the same query as the destination it points to. A global count belongs in the workspace switcher, not next to a navigation item.'
      ),
      ul([
        'Compute both counts from one query helper.',
        'Show the active filter count next to the list heading.',
        'Add a test for repository-scoped and assignee-scoped views.'
      ])
    ]
  },
  {
    id: 'FUN-64',
    number: 64,
    repo: 'funnel',
    title: 'Dates render in the server timezone',
    status: 'Backlog',
    priority: 'P1',
    size: 'S',
    assignee: null,
    author: 'mira',
    milestone: '2026.11 · Triage pass',
    labels: ['bug', 'needs-triage'],
    epic: 'Dates and time',
    openedAt: '2026-11-02T07:45:00Z',
    openedLabel: '1 day ago',
    updatedAt: '2026-11-02T07:45:00Z',
    updatedLabel: '1 day ago',
    untriaged: true,
    source: 'Intake form',
    submitter: 'mira@acme.test',
    description: [
      p(
        'All issue timestamps are rendered in the server timezone instead of the viewer timezone. The date picker shows the correct local date, so the page mixes two timezones in one view.'
      ),
      h2('Examples'),
      ul([
        'An issue opened at 23:30 in Berlin appears on the previous day for a viewer in Berlin.',
        'The relative label says "1 day ago" while the absolute title shows yesterday.',
        'Milestone dates are also shifted by the server offset.'
      ]),
      p('Expected: every timestamp is serialized as UTC and formatted in the viewer timezone at render time.')
    ]
  },
  {
    id: 'FUN-65',
    number: 65,
    repo: 'funnel',
    title: 'Localize the date picker for RTL locales',
    status: 'Backlog',
    priority: 'P3',
    size: 'S',
    assignee: null,
    author: 'dana',
    milestone: '',
    labels: ['accessibility', 'needs-triage'],
    epic: 'Dates and time',
    openedAt: '2026-11-02T08:15:00Z',
    openedLabel: '1 day ago',
    updatedAt: '2026-11-02T08:15:00Z',
    updatedLabel: '1 day ago',
    untriaged: true,
    source: 'Email',
    submitter: 'dana@acme.test',
    description: [
      p(
        'The date picker stays left-to-right when the document direction is RTL. Month navigation arrows and the calendar grid do not mirror, and the selected range is hard to read.'
      ),
      h2('Acceptance'),
      ul([
        'The picker follows the document direction.',
        'Weekdays and month names are localized.',
        'Keyboard focus order remains logical in both directions.'
      ]),
      p('This is currently blocking the Arabic workspace pilot.')
    ]
  },
  {
    id: 'FUN-66',
    number: 66,
    repo: 'funnel',
    title: 'Collapse empty filter groups in the issue list',
    status: 'Todo',
    priority: 'P3',
    size: 'S',
    assignee: 't128n',
    author: 'otto',
    milestone: '',
    labels: ['enhancement'],
    epic: 'Issue list',
    openedAt: '2026-10-27T10:30:00Z',
    openedLabel: '1 week ago',
    updatedAt: '2026-10-31T15:00:00Z',
    updatedLabel: '3 days ago',
    description: [
      p(
        'Grouping by status currently renders empty groups with a zero count. They add noise to the scan and push real work below the fold.'
      ),
      ul([
        'Hide groups with no matching issues.',
        'Keep an explicit empty state when the whole query returns nothing.',
        'Do not hide a group the user has deliberately expanded while a filter is active.'
      ])
    ]
  },
  {
    id: 'FUN-67',
    number: 67,
    repo: 'funnel',
    title: 'Board lane headers drift on horizontal scroll',
    status: 'In review',
    priority: 'P2',
    size: 'M',
    assignee: 'otto',
    author: 'dana',
    milestone: '2026.10 · Bugzilla pass',
    labels: ['bug', 'regression'],
    epic: 'Board',
    openedAt: '2026-10-24T09:00:00Z',
    openedLabel: '1 week ago',
    updatedAt: '2026-10-30T13:45:00Z',
    updatedLabel: '4 days ago',
    description: [
      p(
        'When the board is wider than the viewport, the lane headers scroll at a different speed than the cards. After one horizontal swipe the header labels no longer line up with their columns.'
      ),
      h2('Cause'),
      p(
        'The header and the lane body are separate scroll containers. One uses `position: sticky` and the other uses a transform-based drag layer.'
      ),
      ul([
        'Use one scroll container for both regions.',
        'Verify the fix at 1024px, 1440px, and 1920px.',
        'Add a regression test for the drag path.'
      ])
    ]
  },
  {
    id: 'FUN-68',
    number: 68,
    repo: 'funnel',
    title: 'CSV export truncates past 1000 rows',
    status: 'In progress',
    priority: 'P1',
    size: 'M',
    assignee: 'mira',
    author: 't128n',
    milestone: '2026.11 · Triage pass',
    labels: ['bug'],
    epic: 'Export',
    openedAt: '2026-10-26T16:40:00Z',
    openedLabel: '1 week ago',
    updatedAt: '2026-11-02T12:20:00Z',
    updatedLabel: '1 day ago',
    description: [
      p(
        'CSV export stops at exactly 1000 rows. The response reports success, so users do not notice until they open the file.'
      ),
      h2('Expected behavior'),
      ul([
        'Export every row matching the current query.',
        'Stream large exports instead of buffering the full result.',
        'Report the row count in the response and in the UI.'
      ]),
      p('The default page size is being reused as the export limit. That coupling should be removed.')
    ]
  },
  {
    id: 'FUN-70',
    number: 70,
    repo: 'funnel',
    title: 'Link issue references in comments',
    status: 'Backlog',
    priority: 'P3',
    size: 'S',
    assignee: 'dana',
    author: 'mira',
    milestone: '',
    labels: ['enhancement'],
    epic: 'Issue composer',
    openedAt: '2026-10-22T08:10:00Z',
    openedLabel: '2 weeks ago',
    updatedAt: '2026-10-29T10:05:00Z',
    updatedLabel: '5 days ago',
    description: [
      p(
        'A reference such as `FUN-58` in a comment is rendered as plain text. It should link to the issue while preserving the author’s exact text.'
      ),
      ul([
        'Resolve references only for IDs that exist in the workspace.',
        'Do not link code spans or fenced blocks.',
        'Keep the reference visible in the raw markdown export.'
      ])
    ]
  },
  {
    id: 'ASY-1',
    number: 1,
    repo: 'assay',
    title: 'Runner agent with SSH and PowerShell execution',
    status: 'In progress',
    priority: 'P1',
    size: 'L',
    assignee: 't128n',
    author: 't128n',
    milestone: '2026.12 · Sync hardening',
    labels: ['enhancement'],
    epic: 'Runner',
    openedAt: '2026-10-31T07:00:00Z',
    openedLabel: '3 days ago',
    updatedAt: '2026-11-03T09:15:00Z',
    updatedLabel: '2 hours ago',
    description: [
      p(
        'Run plans on remote hosts without a checked-out working tree in the control plane. The first iteration targets Linux over SSH and Windows through PowerShell Remoting.'
      ),
      h2('Scope'),
      ul([
        'Add a runner agent that registers with the control plane and polls for work.',
        'Execute each plan step with a bounded timeout.',
        'Stream stdout and stderr into the execution log.',
        'Support `ssh` and `winrm` behind one runner interface.'
      ]),
      h2('Open questions'),
      ul([
        'Keep a transport session per host or reconnect for each run?',
        'Do secrets come from the environment or a short-lived file?'
      ]),
      code(
        `assay runner start --listen :7070 --transport ssh
assay run --plan ./plans/deploy.plan --target prod-web-01`,
        'sh'
      )
    ],
    timeline: [
      event('t128n', 'opened this issue', '3 days ago', 'bi-plus-circle'),
      comment('mkrause', '1 day ago', [
        p(
          'Should the transport be a plan-level option or a per-step option? Per step is more flexible, but it makes the plan format noticeably noisier.'
        )
      ]),
      comment('t128n', '1 hour ago', [
        p('Leaning towards per-target with a plan-level default. I will put a draft of the config shape in the repository this week.')
      ])
    ]
  },
  {
    id: 'ASY-3',
    number: 3,
    repo: 'assay',
    title: 'Migrate the VcsProvider port to forges.link',
    status: 'Todo',
    priority: 'P2',
    size: 'M',
    assignee: 'mira',
    author: 't128n',
    milestone: '2026.12 · Sync hardening',
    labels: ['enhancement'],
    epic: 'Forge integration',
    openedAt: '2026-10-26T16:40:00Z',
    openedLabel: '1 week ago',
    updatedAt: '2026-10-27T16:40:00Z',
    updatedLabel: '1 week ago',
    description: [
      p(
        'The `VcsProvider` port duplicates repository lookup, branch protection, pull request state, and webhook verification. Move the port onto forges.link and keep Assay responsible for planning and execution.'
      ),
      h2('Migration'),
      ol([
        'Replace the hand-written GitHub client with the forges.link `Forge` interface.',
        'Move adapter tests onto the shared contract suite.',
        'Keep a compatibility shim for the old configuration keys for one release.',
        'Delete duplicated response types.'
      ]),
      p('The change should be invisible to plan authors.')
    ]
  },
  {
    id: 'ASY-7',
    number: 7,
    repo: 'assay',
    title: 'Plan steps should report the resolved working directory',
    status: 'Backlog',
    priority: 'P3',
    size: 'S',
    assignee: 'otto',
    author: 'dana',
    milestone: '',
    labels: ['enhancement'],
    epic: 'Execution engine',
    openedAt: '2026-10-18T08:30:00Z',
    openedLabel: '2 weeks ago',
    updatedAt: '2026-10-25T09:20:00Z',
    updatedLabel: '1 week ago',
    description: [
      p(
        'Execution logs show the command that ran but not the directory it ran in. When a plan uses relative paths, the log is not enough to reproduce the failure.'
      ),
      ul([
        'Record the resolved working directory for every step.',
        'Include it in the JSON export.',
        'Show it in the execution detail view.'
      ])
    ]
  },
  {
    id: 'ASY-9',
    number: 9,
    repo: 'assay',
    title: 'Execution log drops stderr on Windows',
    status: 'Backlog',
    priority: 'P1',
    size: 'M',
    assignee: null,
    author: 'otto',
    milestone: '2026.12 · Sync hardening',
    labels: ['bug', 'needs-triage'],
    epic: 'Execution engine',
    openedAt: '2026-11-01T18:10:00Z',
    openedLabel: '2 days ago',
    updatedAt: '2026-11-01T18:10:00Z',
    updatedLabel: '2 days ago',
    untriaged: true,
    source: 'GitHub issue',
    submitter: 'otto@acme.test',
    description: [
      p(
        'On Windows runners, stderr is missing from the execution log when a step exits non-zero. The process exit code is correct, but the failure reason is lost.'
      ),
      h2('Notes'),
      ul([
        'WinRM merges stderr into the output stream unless `$ErrorActionPreference` is set.',
        'The Linux runner is unaffected.',
        'This makes failed deploys effectively undebuggable.'
      ]),
      p('Expected: stderr is captured separately and shown with the failing step.')
    ]
  },
  {
    id: 'FRG-12',
    number: 12,
    repo: 'forges.link',
    title: 'Webhook verification fails behind a proxy',
    status: 'In progress',
    priority: 'P1',
    size: 'M',
    assignee: 'dana',
    author: 'mira',
    milestone: '2026.12 · Sync hardening',
    labels: ['bug', 'security'],
    epic: 'Webhooks',
    openedAt: '2026-10-29T11:20:00Z',
    openedLabel: '5 days ago',
    updatedAt: '2026-11-02T17:30:00Z',
    updatedLabel: '1 day ago',
    description: [
      p(
        'Signature verification fails when forges.link is deployed behind a reverse proxy that rewrites the request body encoding. The same webhook verifies correctly when sent directly.'
      ),
      h2('Required behavior'),
      ul([
        'Verify the raw request body before any middleware parses it.',
        'Preserve the original content type and digest headers.',
        'Reject unsigned payloads with a useful error code.'
      ]),
      code(
        `const raw = await request.text();
const valid = verifySignature(raw, headers['x-forge-signature']);
if (!valid) return response(401, 'invalid-signature');`,
        'ts'
      )
    ]
  },
  {
    id: 'FRG-15',
    number: 15,
    repo: 'forges.link',
    title: 'Expose branch protection state in the repository API',
    status: 'In review',
    priority: 'P2',
    size: 'M',
    assignee: 'mira',
    author: 't128n',
    milestone: '2026.12 · Sync hardening',
    labels: ['enhancement'],
    epic: 'Repository API',
    openedAt: '2026-10-21T13:10:00Z',
    openedLabel: '2 weeks ago',
    updatedAt: '2026-11-01T14:40:00Z',
    updatedLabel: '2 days ago',
    description: [
      p(
        'The repository API exposes the default branch but not whether it is protected. Consumers currently make a second call to GitHub for that single field.'
      ),
      ul([
        'Add `protected` and `required_checks` to the repository response.',
        'Keep the field optional for providers that cannot report it.',
        'Document the compatibility behavior.'
      ])
    ]
  },
  {
    id: 'FRG-18',
    number: 18,
    repo: 'forges.link',
    title: 'Rate limit headers are not forwarded',
    status: 'Backlog',
    priority: 'P3',
    size: 'S',
    assignee: null,
    author: 'dana',
    milestone: '',
    labels: ['enhancement', 'needs-triage'],
    epic: 'Repository API',
    openedAt: '2026-10-31T16:50:00Z',
    openedLabel: '3 days ago',
    updatedAt: '2026-10-31T16:50:00Z',
    updatedLabel: '3 days ago',
    untriaged: true,
    source: 'Intake form',
    submitter: 'dana@acme.test',
    description: [
      p(
        'Upstream rate limit headers are dropped by the proxy layer. Clients cannot tell whether they are close to a limit until they receive a 429.'
      ),
      ul([
        'Forward `x-ratelimit-limit`, `x-ratelimit-remaining`, and `x-ratelimit-reset`.',
        'Add the headers to the API reference.',
        'Do not cache 429 responses.'
      ])
    ]
  },
  {
    id: 'ING-4',
    number: 4,
    repo: 'intake',
    title: 'Intake form loses the source when JavaScript is disabled',
    status: 'Todo',
    priority: 'P2',
    size: 'S',
    assignee: 't128n',
    author: 'mira',
    milestone: '2026.11 · Triage pass',
    labels: ['bug', 'accessibility'],
    epic: 'Intake',
    openedAt: '2026-10-25T09:40:00Z',
    openedLabel: '1 week ago',
    updatedAt: '2026-10-30T08:50:00Z',
    updatedLabel: '4 days ago',
    description: [
      p(
        'The source field is populated by a client-side script. With JavaScript disabled, submissions arrive with an empty source and cannot be routed to the right triage queue.'
      ),
      ul([
        'Render a hidden source field on the server.',
        'Keep the client enhancement for the source picker.',
        'Add a no-JavaScript submission test.'
      ])
    ]
  },
  {
    id: 'ING-6',
    number: 6,
    repo: 'intake',
    title: 'Duplicate submissions from the email gateway',
    status: 'In progress',
    priority: 'P1',
    size: 'M',
    assignee: 'otto',
    author: 't128n',
    milestone: '2026.11 · Triage pass',
    labels: ['bug'],
    epic: 'Email intake',
    openedAt: '2026-10-27T07:20:00Z',
    openedLabel: '1 week ago',
    updatedAt: '2026-11-02T08:10:00Z',
    updatedLabel: '1 day ago',
    description: [
      p(
        'The email gateway retries a delivery when its acknowledgement times out. Funnel creates a new submission for every retry because the message ID is not stored.'
      ),
      h2('Fix'),
      ul([
        'Persist the upstream message ID with a unique constraint.',
        'Return the existing submission for a repeated ID.',
        'Expose duplicate count in the intake diagnostics.'
      ])
    ]
  },
  {
    id: 'ING-9',
    number: 9,
    repo: 'intake',
    title: 'Show the submitter email in the triage queue',
    status: 'Backlog',
    priority: 'P3',
    size: 'S',
    assignee: 'dana',
    author: 'otto',
    milestone: '',
    labels: ['enhancement'],
    epic: 'Intake',
    openedAt: '2026-10-19T10:15:00Z',
    openedLabel: '2 weeks ago',
    updatedAt: '2026-10-24T09:25:00Z',
    updatedLabel: '1 week ago',
    description: [
      p(
        'Triage currently shows only the submitter display name. When two people have the same display name, the only way to tell them apart is to open the submission.'
      ),
      ul([
        'Show the email below the display name.',
        'Keep the address out of the issue description.',
        'Add a copy action for the address.'
      ])
    ]
  }
];

export const FIXTURES = issues.map((issue) => ({
  ...issue,
  timeline: issue.timeline || defaultTimeline(issue),
  description: issue.description || [p('No description provided.')]
}));
