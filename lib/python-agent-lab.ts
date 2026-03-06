export const PYTHON_AGENT_LAB_STORAGE_KEY = 'code-editor:python-agent-lab'

export type PythonAgentPatternId =
  | 'classifier'
  | 'tool-selector'
  | 'reranker'
  | 'evaluator'

export interface PythonAgentPatternDefinition {
  id: PythonAgentPatternId
  title: string
  icon: string
  description: string
  trainingGoal: string
  datasetHint: string
  expectedFields: string[]
  starterInstruction: string
  starterDataset: string
}

export interface PythonAgentPatternDraft {
  instruction: string
  datasetText: string
  notes: string
}

export interface PythonAgentLabState {
  selectedPatternId: PythonAgentPatternId
  drafts: Record<PythonAgentPatternId, PythonAgentPatternDraft>
}

export interface PythonAgentLabMetric {
  label: string
  value: string
  tone?: 'default' | 'good' | 'warn'
}

export interface PythonAgentLabRunResult {
  headline: string
  summary: string
  metrics: PythonAgentLabMetric[]
  findings: string[]
  preview: string[]
}

const CLASSIFIER_STARTER_DATASET = JSON.stringify(
  [
    { input: 'Reset my password and help me log in again.', label: 'account_support' },
    { input: 'The billing page charged me twice this month.', label: 'billing' },
    { input: 'Show me how to invite another teammate to the workspace.', label: 'product_help' },
    { input: 'My MFA code is not being accepted on sign in.', label: 'account_support' },
    { input: 'Can I switch from monthly to annual billing?', label: 'billing' },
    { input: 'Where do I configure the webhook URL for deployments?', label: 'product_help' },
  ],
  null,
  2,
)

const TOOL_SELECTOR_STARTER_DATASET = JSON.stringify(
  [
    {
      task: 'Trace why a regression landed after yesterday’s merge.',
      tool: 'git',
      rationale: 'History inspection and diff review are the fastest path.',
    },
    {
      task: 'Confirm whether a flaky UI test still fails in CI.',
      tool: 'terminal',
      rationale: 'Running the test harness gives direct evidence.',
    },
    {
      task: 'Check the latest framework docs for the correct cache API.',
      tool: 'docs',
      rationale: 'The answer depends on current documentation.',
    },
    {
      task: 'Inspect the code path that handles websocket retries.',
      tool: 'repo',
      rationale: 'The source of truth is in the local codebase.',
    },
  ],
  null,
  2,
)

const RERANKER_STARTER_DATASET = JSON.stringify(
  [
    {
      query: 'How do I deploy a Next.js app with environment variables?',
      relevant: 'Deploy the app, set environment variables in the hosting platform, and redeploy.',
      candidates: [
        'Deploy the app, set environment variables in the hosting platform, and redeploy.',
        'Use CSS grid to create a responsive layout.',
        'Reset the local git branch to remove stale commits.',
      ],
    },
    {
      query: 'What is the safest way to add auth to an existing dashboard?',
      relevant: 'Add server-side session checks, protect routes, and review role enforcement.',
      candidates: [
        'Add server-side session checks, protect routes, and review role enforcement.',
        'Use a brighter accent color in the sidebar.',
        'Delete node_modules and reinstall packages.',
      ],
    },
  ],
  null,
  2,
)

const EVALUATOR_STARTER_DATASET = JSON.stringify(
  [
    {
      prompt: 'Summarize the risk of shipping without tests.',
      response:
        'Shipping without tests increases regression risk, slows future changes, and makes rollback decisions less informed.',
      score: 0.95,
    },
    {
      prompt: 'Explain how to verify a refactor safely.',
      response:
        'Run the relevant tests, compare behavior before and after, inspect diffs, and validate edge cases.',
      score: 0.9,
    },
    {
      prompt: 'Describe rate limiting.',
      response: 'Rate limiting is useful.',
      score: 0.35,
    },
  ],
  null,
  2,
)

export const PYTHON_AGENT_PATTERNS: PythonAgentPatternDefinition[] = [
  {
    id: 'classifier',
    title: 'Intent Classifier',
    icon: 'lucide:tags',
    description:
      'Turn labeled examples into a lightweight router that picks the right intent or workflow for an agent.',
    trainingGoal: 'Train an agent to map incoming requests to stable intent labels.',
    datasetHint: 'JSON array of { input, label } objects.',
    expectedFields: ['input', 'label'],
    starterInstruction:
      'Route incoming user messages to the correct support or workflow label. Prefer precision over guessing.',
    starterDataset: CLASSIFIER_STARTER_DATASET,
  },
  {
    id: 'tool-selector',
    title: 'Tool Selector',
    icon: 'lucide:wrench',
    description:
      'Learn when an agent should reach for repo context, terminal execution, docs, or git actions.',
    trainingGoal: 'Train an agent to choose the best tool for a task before acting.',
    datasetHint: 'JSON array of { task, tool, rationale } objects.',
    expectedFields: ['task', 'tool', 'rationale'],
    starterInstruction:
      'Choose the lowest-risk tool that can gather decisive evidence for the task. Avoid unnecessary execution.',
    starterDataset: TOOL_SELECTOR_STARTER_DATASET,
  },
  {
    id: 'reranker',
    title: 'Retrieval Reranker',
    icon: 'lucide:arrow-up-wide-narrow',
    description:
      'Score candidate passages so an agent can surface the most relevant context before answering.',
    trainingGoal: 'Train an agent to rank candidate context by semantic usefulness.',
    datasetHint: 'JSON array of { query, relevant, candidates } objects.',
    expectedFields: ['query', 'relevant', 'candidates'],
    starterInstruction:
      'Rerank candidate snippets so the agent sees the most relevant context first and avoids distractors.',
    starterDataset: RERANKER_STARTER_DATASET,
  },
  {
    id: 'evaluator',
    title: 'Response Evaluator',
    icon: 'lucide:clipboard-check',
    description:
      'Build a scoring loop that judges whether an answer meets your quality bar before shipping it.',
    trainingGoal: 'Train an agent-side evaluator that scores outputs against a rubric.',
    datasetHint: 'JSON array of { prompt, response, score } objects.',
    expectedFields: ['prompt', 'response', 'score'],
    starterInstruction:
      'Score answers for completeness, correctness, and clarity. Penalize vague statements and missing verification.',
    starterDataset: EVALUATOR_STARTER_DATASET,
  },
]

function getPatternDefinition(patternId: PythonAgentPatternId): PythonAgentPatternDefinition {
  return (
    PYTHON_AGENT_PATTERNS.find((pattern) => pattern.id === patternId) ?? PYTHON_AGENT_PATTERNS[0]
  )
}

export function createDefaultPythonAgentLabState(): PythonAgentLabState {
  return {
    selectedPatternId: 'classifier',
    drafts: Object.fromEntries(
      PYTHON_AGENT_PATTERNS.map((pattern) => [
        pattern.id,
        {
          instruction: pattern.starterInstruction,
          datasetText: pattern.starterDataset,
          notes: '',
        },
      ]),
    ) as Record<PythonAgentPatternId, PythonAgentPatternDraft>,
  }
}

export function normalizePythonAgentLabState(input: unknown): PythonAgentLabState {
  const fallback = createDefaultPythonAgentLabState()
  if (!input || typeof input !== 'object') return fallback

  const raw = input as Partial<PythonAgentLabState>
  const selectedPatternId = PYTHON_AGENT_PATTERNS.some((pattern) => pattern.id === raw.selectedPatternId)
    ? (raw.selectedPatternId as PythonAgentPatternId)
    : fallback.selectedPatternId

  const drafts = PYTHON_AGENT_PATTERNS.reduce(
    (acc, pattern) => {
      const candidate = raw.drafts?.[pattern.id]
      acc[pattern.id] = {
        instruction:
          typeof candidate?.instruction === 'string'
            ? candidate.instruction
            : fallback.drafts[pattern.id].instruction,
        datasetText:
          typeof candidate?.datasetText === 'string'
            ? candidate.datasetText
            : fallback.drafts[pattern.id].datasetText,
        notes:
          typeof candidate?.notes === 'string' ? candidate.notes : fallback.drafts[pattern.id].notes,
      }
      return acc
    },
    {} as Record<PythonAgentPatternId, PythonAgentPatternDraft>,
  )

  return {
    selectedPatternId,
    drafts,
  }
}

export function getPatternDraft(
  state: PythonAgentLabState,
  patternId: PythonAgentPatternId,
): PythonAgentPatternDraft {
  return state.drafts[patternId]
}

export function resetPatternDraft(
  state: PythonAgentLabState,
  patternId: PythonAgentPatternId,
): PythonAgentLabState {
  const pattern = getPatternDefinition(patternId)
  return {
    ...state,
    drafts: {
      ...state.drafts,
      [patternId]: {
        instruction: pattern.starterInstruction,
        datasetText: pattern.starterDataset,
        notes: '',
      },
    },
  }
}

export function updatePatternDraft(
  state: PythonAgentLabState,
  patternId: PythonAgentPatternId,
  patch: Partial<PythonAgentPatternDraft>,
): PythonAgentLabState {
  return {
    ...state,
    drafts: {
      ...state.drafts,
      [patternId]: {
        ...state.drafts[patternId],
        ...patch,
      },
    },
  }
}

export function validatePatternDataset(
  patternId: PythonAgentPatternId,
  datasetText: string,
): string | null {
  const dataset = parseDataset(datasetText)
  if (!dataset.ok) return dataset.error

  const { expectedFields, title } = getPatternDefinition(patternId)
  const missing = dataset.value.find((row) =>
    expectedFields.some((field) => !(field in row) || row[field] === null || row[field] === ''),
  )

  if (missing) {
    return `${title} expects every row to include ${expectedFields.join(', ')}.`
  }

  return null
}

export function simulatePatternRun(
  patternId: PythonAgentPatternId,
  draft: PythonAgentPatternDraft,
): PythonAgentLabRunResult {
  const dataset = parseDataset(draft.datasetText)
  if (!dataset.ok) {
    return {
      headline: 'Dataset needs attention',
      summary: dataset.error,
      metrics: [{ label: 'Rows', value: '0', tone: 'warn' }],
      findings: ['Fix the JSON dataset before running a simulation.'],
      preview: [],
    }
  }

  switch (patternId) {
    case 'classifier':
      return simulateClassifier(dataset.value, draft.instruction)
    case 'tool-selector':
      return simulateToolSelector(dataset.value, draft.instruction)
    case 'reranker':
      return simulateReranker(dataset.value, draft.instruction)
    case 'evaluator':
      return simulateEvaluator(dataset.value, draft.instruction)
    default:
      return {
        headline: 'Unsupported pattern',
        summary: 'This pattern does not have a local simulation yet.',
        metrics: [],
        findings: [],
        preview: [],
      }
  }
}

export function buildPythonProgram(
  patternId: PythonAgentPatternId,
  draft: PythonAgentPatternDraft,
): string {
  const instruction = escapeForPythonTriple(draft.instruction.trim())
  const datasetText = escapeForPythonTriple(draft.datasetText.trim())
  const notes = escapeForPythonTriple(draft.notes.trim())

  switch (patternId) {
    case 'classifier':
      return `import json
import re
from collections import Counter, defaultdict

TRAINING_GOAL = r'''${instruction}'''
NOTES = r'''${notes}'''
DATASET_JSON = r'''${datasetText}'''


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9_]+", text.lower())


def load_examples() -> list[dict]:
    rows = json.loads(DATASET_JSON)
    return [
        {"input": str(row["input"]), "label": str(row["label"])}
        for row in rows
        if "input" in row and "label" in row
    ]


def train_keyword_router(rows: list[dict]) -> tuple[dict[str, Counter], str]:
    label_token_counts: dict[str, Counter] = defaultdict(Counter)
    labels = []
    for row in rows:
        label = row["label"]
        labels.append(label)
        label_token_counts[label].update(tokenize(row["input"]))
    majority_label = Counter(labels).most_common(1)[0][0]
    return dict(label_token_counts), majority_label


def predict(model: dict[str, Counter], fallback_label: str, text: str) -> str:
    tokens = tokenize(text)
    scored = {
        label: sum(counter[token] for token in tokens)
        for label, counter in model.items()
    }
    if not scored:
        return fallback_label
    best_label, best_score = max(scored.items(), key=lambda item: item[1])
    return best_label if best_score > 0 else fallback_label


def main() -> None:
    rows = load_examples()
    model, fallback_label = train_keyword_router(rows)
    print("Goal:", TRAINING_GOAL)
    if NOTES:
        print("Notes:", NOTES)
    print("Labels:", sorted(model))
    print("Fallback label:", fallback_label)

    while True:
        text = input("\\nUser message (blank to quit): ").strip()
        if not text:
            break
        print("Predicted label:", predict(model, fallback_label, text))


if __name__ == "__main__":
    main()
`
    case 'tool-selector':
      return `import json
import re
from collections import Counter, defaultdict

TRAINING_GOAL = r'''${instruction}'''
NOTES = r'''${notes}'''
DATASET_JSON = r'''${datasetText}'''


def tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9_]+", text.lower()))


def load_examples() -> list[dict]:
    rows = json.loads(DATASET_JSON)
    return [
        {
            "task": str(row["task"]),
            "tool": str(row["tool"]),
            "rationale": str(row.get("rationale", "")),
        }
        for row in rows
        if "task" in row and "tool" in row
    ]


def train_tool_policy(rows: list[dict]) -> tuple[dict[str, Counter], str]:
    tool_tokens: dict[str, Counter] = defaultdict(Counter)
    tools = []
    for row in rows:
        tool = row["tool"]
        tools.append(tool)
        tool_tokens[tool].update(tokenize(row["task"]))
    fallback_tool = Counter(tools).most_common(1)[0][0]
    return dict(tool_tokens), fallback_tool


def choose_tool(model: dict[str, Counter], fallback_tool: str, task: str) -> str:
    task_tokens = tokenize(task)
    scores = {
        tool: sum(counter[token] for token in task_tokens)
        for tool, counter in model.items()
    }
    if not scores:
        return fallback_tool
    best_tool, best_score = max(scores.items(), key=lambda item: item[1])
    return best_tool if best_score > 0 else fallback_tool


def main() -> None:
    rows = load_examples()
    model, fallback_tool = train_tool_policy(rows)
    print("Goal:", TRAINING_GOAL)
    if NOTES:
        print("Notes:", NOTES)
    print("Available tools:", sorted(model))
    print("Fallback tool:", fallback_tool)

    while True:
        task = input("\\nTask description (blank to quit): ").strip()
        if not task:
            break
        print("Recommended tool:", choose_tool(model, fallback_tool, task))


if __name__ == "__main__":
    main()
`
    case 'reranker':
      return `import json
import re

TRAINING_GOAL = r'''${instruction}'''
NOTES = r'''${notes}'''
DATASET_JSON = r'''${datasetText}'''


def tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9_]+", text.lower()))


def overlap_score(query: str, candidate: str) -> float:
    query_tokens = tokenize(query)
    candidate_tokens = tokenize(candidate)
    if not query_tokens:
        return 0.0
    return len(query_tokens & candidate_tokens) / len(query_tokens)


def rerank(query: str, candidates: list[str]) -> list[tuple[str, float]]:
    ranked = [(candidate, overlap_score(query, candidate)) for candidate in candidates]
    return sorted(ranked, key=lambda item: item[1], reverse=True)


def main() -> None:
    rows = json.loads(DATASET_JSON)
    print("Goal:", TRAINING_GOAL)
    if NOTES:
        print("Notes:", NOTES)

    for index, row in enumerate(rows, start=1):
        ranked = rerank(row["query"], row["candidates"])
        print(f"\\nExample {index}: {row['query']}")
        for candidate, score in ranked:
            marker = " <- relevant" if candidate == row["relevant"] else ""
            print(f"{score:.2f} | {candidate}{marker}")


if __name__ == "__main__":
    main()
`
    case 'evaluator':
      return `import json
import re
from statistics import mean

TRAINING_GOAL = r'''${instruction}'''
NOTES = r'''${notes}'''
DATASET_JSON = r'''${datasetText}'''


def tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9_]+", text.lower()))


def normalize_score(value: float) -> float:
    return value / 5.0 if value > 1 else value


def build_rubric(rows: list[dict]) -> set[str]:
    strong_tokens = set()
    for row in rows:
        score = normalize_score(float(row["score"]))
        if score >= 0.8:
            strong_tokens.update(tokenize(row["response"]))
    return strong_tokens


def score_response(rubric_tokens: set[str], response: str) -> float:
    response_tokens = tokenize(response)
    if not rubric_tokens:
        return 0.0
    return len(response_tokens & rubric_tokens) / len(rubric_tokens)


def main() -> None:
    rows = json.loads(DATASET_JSON)
    rubric = build_rubric(rows)
    gold_scores = [normalize_score(float(row["score"])) for row in rows]
    print("Goal:", TRAINING_GOAL)
    if NOTES:
        print("Notes:", NOTES)
    print("Average gold score:", round(mean(gold_scores), 3))

    while True:
        response = input("\\nCandidate response (blank to quit): ").strip()
        if not response:
            break
        print("Predicted quality score:", round(score_response(rubric, response), 3))


if __name__ == "__main__":
    main()
`
    default:
      return '# Unsupported pattern'
  }
}

function parseDataset(
  datasetText: string,
): { ok: true; value: Record<string, unknown>[] } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(datasetText)
    if (!Array.isArray(parsed)) {
      return { ok: false, error: 'Dataset must be a JSON array of training examples.' }
    }

    const rows = parsed.filter(
      (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
    )
    if (rows.length === 0) {
      return { ok: false, error: 'Dataset must contain at least one object example.' }
    }

    return { ok: true, value: rows }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Dataset JSON could not be parsed.',
    }
  }
}

function simulateClassifier(
  rows: Record<string, unknown>[],
  instruction: string,
): PythonAgentLabRunResult {
  const examples = rows.filter(
    (row): row is { input: string; label: string } =>
      typeof row.input === 'string' && typeof row.label === 'string',
  )
  const labelCounts = countBy(examples.map((row) => row.label))
  const labels = Object.keys(labelCounts)
  const majority = getTopCount(labelCounts)
  const majorityAccuracy = examples.length > 0 ? majority / examples.length : 0
  const imbalance = majorityAccuracy >= 0.65

  return {
    headline: 'Intent routing baseline ready',
    summary:
      'This simulation estimates how well a simple label router can bootstrap agent decisions before you move to a richer model.',
    metrics: [
      { label: 'Examples', value: String(examples.length) },
      { label: 'Labels', value: String(labels.length), tone: labels.length >= 3 ? 'good' : 'warn' },
      {
        label: 'Majority baseline',
        value: formatPercent(majorityAccuracy),
        tone: imbalance ? 'warn' : 'good',
      },
      {
        label: 'Prompt richness',
        value: instruction.trim().length >= 60 ? 'Strong' : 'Thin',
        tone: instruction.trim().length >= 60 ? 'good' : 'warn',
      },
    ],
    findings: [
      ...(examples.length < 6 ? ['Add more labeled examples before trusting the router.'] : []),
      ...(labels.length < 2 ? ['Use at least two labels so the classifier learns a real boundary.'] : []),
      ...(imbalance
        ? ['One label dominates the dataset, so the baseline can look good while learning very little.']
        : []),
      ...(instruction.trim().length < 60
        ? ['Expand the instruction so the training goal is explicit and stable across future examples.']
        : []),
    ],
    preview: examples.slice(0, 3).map((row) => `${row.label} <- ${row.input}`),
  }
}

function simulateToolSelector(
  rows: Record<string, unknown>[],
  instruction: string,
): PythonAgentLabRunResult {
  const examples = rows.filter(
    (row): row is { task: string; tool: string; rationale?: string } =>
      typeof row.task === 'string' && typeof row.tool === 'string',
  )
  const toolCounts = countBy(examples.map((row) => row.tool))
  const tools = Object.keys(toolCounts)
  const rationaleCoverage =
    examples.length > 0
      ? examples.filter((row) => typeof row.rationale === 'string' && row.rationale.trim().length > 0)
          .length / examples.length
      : 0

  return {
    headline: 'Tool policy simulation complete',
    summary:
      'The lab checks whether the dataset teaches the agent to prefer the right evidence-gathering tool instead of overusing one default action.',
    metrics: [
      { label: 'Examples', value: String(examples.length) },
      { label: 'Tools covered', value: String(tools.length), tone: tools.length >= 3 ? 'good' : 'warn' },
      {
        label: 'Rationale coverage',
        value: formatPercent(rationaleCoverage),
        tone: rationaleCoverage >= 0.75 ? 'good' : 'warn',
      },
      {
        label: 'Instruction clarity',
        value: instruction.toLowerCase().includes('risk') ? 'Risk-aware' : 'Generic',
        tone: instruction.toLowerCase().includes('risk') ? 'good' : 'warn',
      },
    ],
    findings: [
      ...(tools.length < 2 ? ['Add more than one tool label so the agent can learn trade-offs.'] : []),
      ...(rationaleCoverage < 0.75
        ? ['Include rationales in most rows so the agent learns why a tool is appropriate, not just which tool won.']
        : []),
      ...(instruction.toLowerCase().includes('risk')
        ? []
        : ['Mention risk, cost, or verification in the instruction so tool choice stays disciplined.']),
    ],
    preview: examples.slice(0, 3).map((row) => `${row.tool} <- ${row.task}`),
  }
}

function simulateReranker(
  rows: Record<string, unknown>[],
  instruction: string,
): PythonAgentLabRunResult {
  const examples = rows.filter(
    (row): row is { query: string; relevant: string; candidates: string[] } =>
      typeof row.query === 'string' &&
      typeof row.relevant === 'string' &&
      Array.isArray(row.candidates) &&
      row.candidates.every((candidate) => typeof candidate === 'string'),
  )
  const coverage =
    examples.length > 0
      ? examples.filter((row) => row.candidates.includes(row.relevant)).length / examples.length
      : 0
  const averageCandidates =
    examples.length > 0
      ? examples.reduce((sum, row) => sum + row.candidates.length, 0) / examples.length
      : 0

  return {
    headline: 'Reranker dataset looks usable',
    summary:
      'This pass checks whether your retrieval examples actually contain the relevant passage and enough distractors to teach ranking.',
    metrics: [
      { label: 'Examples', value: String(examples.length) },
      {
        label: 'Relevant in candidates',
        value: formatPercent(coverage),
        tone: coverage === 1 ? 'good' : 'warn',
      },
      {
        label: 'Avg candidates',
        value: averageCandidates ? averageCandidates.toFixed(1) : '0.0',
        tone: averageCandidates >= 3 ? 'good' : 'warn',
      },
      {
        label: 'Instruction fit',
        value: instruction.toLowerCase().includes('rank') ? 'Specific' : 'Generic',
        tone: instruction.toLowerCase().includes('rank') ? 'good' : 'warn',
      },
    ],
    findings: [
      ...(coverage < 1 ? ['Some rows omit the relevant passage from the candidate set, which breaks reranker supervision.'] : []),
      ...(averageCandidates < 3
        ? ['Use at least three candidates per query so ranking quality becomes measurable.']
        : []),
      ...(instruction.toLowerCase().includes('rank')
        ? []
        : ['State the ranking objective explicitly so the model learns relevance instead of generic similarity.']),
    ],
    preview: examples.slice(0, 2).map((row) => `${row.query} -> ${row.relevant}`),
  }
}

function simulateEvaluator(
  rows: Record<string, unknown>[],
  instruction: string,
): PythonAgentLabRunResult {
  const examples = rows.filter(
    (row): row is { prompt: string; response: string; score: number } =>
      typeof row.prompt === 'string' &&
      typeof row.response === 'string' &&
      typeof row.score === 'number',
  )
  const normalizedScores = examples.map((row) => normalizeScore(row.score))
  const averageScore =
    normalizedScores.length > 0
      ? normalizedScores.reduce((sum, score) => sum + score, 0) / normalizedScores.length
      : 0
  const passRate =
    normalizedScores.length > 0
      ? normalizedScores.filter((score) => score >= 0.8).length / normalizedScores.length
      : 0

  return {
    headline: 'Evaluator rubric simulation complete',
    summary:
      'The evaluator pattern checks whether your scoring examples teach the agent what “good” actually looks like before you automate acceptance.',
    metrics: [
      { label: 'Examples', value: String(examples.length) },
      {
        label: 'Average score',
        value: averageScore.toFixed(2),
        tone: averageScore >= 0.75 ? 'good' : 'warn',
      },
      {
        label: 'Pass rate',
        value: formatPercent(passRate),
        tone: passRate >= 0.5 ? 'good' : 'warn',
      },
      {
        label: 'Rubric strength',
        value: instruction.toLowerCase().includes('verification') ? 'Grounded' : 'Needs sharper rubric',
        tone: instruction.toLowerCase().includes('verification') ? 'good' : 'warn',
      },
    ],
    findings: [
      ...(examples.length < 4
        ? ['Add more scored examples so the evaluator sees both strong and weak responses.']
        : []),
      ...(normalizedScores.every((score) => score >= 0.8) || normalizedScores.every((score) => score < 0.8)
        ? ['Include both passing and failing examples or the evaluator will learn a one-sided rubric.']
        : []),
      ...(instruction.toLowerCase().includes('verification')
        ? []
        : ['Mention verification, correctness, or completeness so the score reflects more than style.']),
    ],
    preview: examples.slice(0, 3).map((row) => `${normalizeScore(row.score).toFixed(2)} <- ${row.prompt}`),
  }
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1
    return acc
  }, {})
}

function getTopCount(counts: Record<string, number>): number {
  return Object.values(counts).reduce((max, value) => Math.max(max, value), 0)
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function normalizeScore(score: number): number {
  return score > 1 ? score / 5 : score
}

function escapeForPythonTriple(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'''/g, "\\'\\'\\'")
}
