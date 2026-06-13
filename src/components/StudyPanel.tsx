import { useEffect, useState } from 'react'
import type { Socket } from 'socket.io-client'

/**
 * Study-to-Haste panel — take a short multi-subject test to speed up your teams'
 * automated battles (docs/CHARACTERS_DESIGN.md §3). Server-authoritative: the
 * server picks/score the questions and grants the haste stack; this only renders
 * and forwards answers.
 */

export interface HasteData {
  intervalMinutes: number
  defaultMinutes: number
  floorMinutes: number
  stacks: number
  maxStacks: number
  stackExpiries: number[]
}

interface ClientQuestion {
  id: string
  subject: string
  question: string
  answers: [string, string, string, string]
}

interface AnswerResult {
  correct: boolean
  explanation: string
  sessionComplete: boolean
  nextQuestion?: ClientQuestion
  result?: { score: number; total: number; hasteMinutes: number; message: string }
}

interface Props {
  haste: HasteData
  onClose: () => void
}

function fmtInterval(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`
}

const subjLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function StudyPanel({ haste, onClose }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [question, setQuestion] = useState<ClientQuestion | null>(null)
  const [answered, setAnswered] = useState<{ chosen: number; correct: boolean; explanation: string } | null>(null)
  const [progress, setProgress] = useState({ n: 0, total: 6 })
  const [finalResult, setFinalResult] = useState<AnswerResult['result'] | null>(null)

  const socket = () => (window as typeof window & { __lumenSocket?: Socket }).__lumenSocket

  useEffect(() => {
    const s = socket()
    if (!s) return
    const onStarted = (d: { sessionId: string; firstQuestion: ClientQuestion }) => {
      setSessionId(d.sessionId)
      setQuestion(d.firstQuestion)
      setAnswered(null)
      setFinalResult(null)
      setProgress({ n: 1, total: 6 })
    }
    const onResult = (d: AnswerResult) => {
      if (d.sessionComplete && d.result) {
        setFinalResult(d.result)
        setQuestion(null)
        setSessionId(null)
      } else if (d.nextQuestion) {
        // Brief feedback, then advance.
        setTimeout(() => {
          setQuestion(d.nextQuestion!)
          setAnswered(null)
          setProgress((p) => ({ ...p, n: p.n + 1 }))
        }, 900)
      }
    }
    s.on('study:started', onStarted)
    s.on('study:answer_result', onResult)
    return () => { s.off('study:started', onStarted); s.off('study:answer_result', onResult) }
  }, [])

  const startTest = () => socket()?.emit('study:start')
  const answer = (i: number) => {
    if (answered || !question || !sessionId) return
    // Optimistic: lock in the choice; the result event carries correctness.
    socket()?.emit('study:answer', { sessionId, questionId: question.id, answerIndex: i })
    // Local correctness is unknown until the server replies; show pending state.
    setAnswered({ chosen: i, correct: false, explanation: '' })
  }

  // The answer result also carries correctness/explanation — patch it in.
  useEffect(() => {
    const s = socket()
    if (!s) return
    const onResult = (d: AnswerResult) => {
      setAnswered((a) => (a ? { ...a, correct: d.correct, explanation: d.explanation } : a))
    }
    s.on('study:answer_result', onResult)
    return () => { s.off('study:answer_result', onResult) }
  }, [])

  const atFloor = haste.intervalMinutes <= haste.floorMinutes
  const testing = !!question || !!finalResult

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-lumen-gold/30 bg-lumen-dark shadow-2xl shadow-purple-900/40" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <h2 className="font-display text-xl text-lumen-gold">Study Hall</h2>
            <p className="text-xs text-gray-400">Study to speed up your teams' automated battles</p>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-gray-400 hover:bg-white/10 hover:text-white" aria-label="Close">✕</button>
        </div>

        <div className="p-5">
          {/* Haste status */}
          {!testing && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Automated battle every</p>
              <p className="font-display text-3xl text-lumen-gold">{fmtInterval(haste.intervalMinutes)}</p>
              <div className="mt-2 flex items-center gap-1.5">
                {Array.from({ length: haste.maxStacks }).map((_, i) => (
                  <span key={i} className={`h-2.5 flex-1 rounded-full ${i < haste.stacks ? 'bg-lumen-gold' : 'bg-white/10'}`} />
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-400">
                {haste.stacks}/{haste.maxStacks} study boosts active ·{' '}
                {atFloor ? 'at the fastest pace!' : `down from ${fmtInterval(haste.defaultMinutes)} default`}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">Each boost lasts 3 days · no penalty when they fade — just study again.</p>
            </div>
          )}

          {/* Active question */}
          {question && (
            <div>
              <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
                <span>Question {progress.n}/{progress.total}</span>
                <span className="rounded bg-white/10 px-2 py-0.5 text-lumen-gold">{subjLabel(question.subject)}</span>
              </div>
              <p className="mb-4 font-display text-lg text-white">{question.question}</p>
              <div className="space-y-2">
                {question.answers.map((a, i) => {
                  const chosen = answered?.chosen === i
                  const showState = answered && answered.explanation // result arrived
                  let cls = 'border-white/15 hover:bg-white/10 text-gray-100'
                  if (showState && chosen) cls = answered.correct ? 'border-green-500 bg-green-500/15 text-green-200' : 'border-red-500 bg-red-500/15 text-red-200'
                  else if (chosen) cls = 'border-lumen-gold/60 bg-lumen-gold/10 text-lumen-gold'
                  return (
                    <button key={i} onClick={() => answer(i)} disabled={!!answered}
                      className={`w-full rounded-lg border px-4 py-2.5 text-left text-sm disabled:cursor-default ${cls}`}>
                      {a}
                    </button>
                  )
                })}
              </div>
              {answered?.explanation && (
                <p className="mt-3 text-sm text-gray-300">{answered.correct ? '✓ ' : '✗ '}{answered.explanation}</p>
              )}
            </div>
          )}

          {/* Result */}
          {finalResult && (
            <div className="text-center">
              <p className="font-display text-2xl text-lumen-gold">Score: {finalResult.score}/{finalResult.total}</p>
              <p className="mt-2 text-sm text-gray-200">{finalResult.message}</p>
              <button onClick={onClose} className="mt-5 rounded-lg bg-lumen-gold/90 px-6 py-2 font-display font-bold text-lumen-dark hover:bg-lumen-gold">Done</button>
            </div>
          )}

          {/* Start button */}
          {!testing && (
            <button onClick={startTest}
              className="mt-4 w-full rounded-xl bg-lumen-gold/90 px-4 py-3 font-display font-bold text-lumen-dark hover:bg-lumen-gold">
              📖 Take a Study Test (6 questions)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
