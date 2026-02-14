import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { UserQuestionRequest } from "@/lib/types"
import { MessageCircleQuestion, Send } from "lucide-react"
import { cn } from "@/lib/utils"

interface UserQuestionProps {
  request: UserQuestionRequest
  onAnswer: (
    toolCallId: string,
    answers: Array<{ question: string; selectedOptions: string[]; customAnswer?: string }>
  ) => void
}

function QuestionBlock({
  question,
  selectedOptions,
  customAnswer,
  onToggleOption,
  onCustomAnswerChange
}: {
  question: UserQuestionRequest["questions"][number]
  selectedOptions: Set<string>
  customAnswer: string
  onToggleOption: (label: string) => void
  onCustomAnswerChange: (value: string) => void
}) {
  const [showOther, setShowOther] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-blue-600 bg-blue-100 rounded px-1.5 py-0.5">
          {question.header}
        </span>
      </div>
      <p className="text-sm text-zinc-800">{question.question}</p>
      <div className="flex flex-wrap gap-1.5">
        {question.options.map((option) => {
          const isSelected = selectedOptions.has(option.label)
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => onToggleOption(option.label)}
              className={cn(
                "text-left rounded-md border px-3 py-1.5 text-sm transition-colors",
                isSelected
                  ? "border-blue-300 bg-blue-50 text-blue-800"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
              )}
              title={option.description}
            >
              <span className="font-medium">{option.label}</span>
              {option.description && (
                <span className="text-xs text-zinc-500 ml-1.5">— {option.description}</span>
              )}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setShowOther(!showOther)}
          className={cn(
            "rounded-md border px-3 py-1.5 text-sm transition-colors",
            showOther
              ? "border-blue-300 bg-blue-50 text-blue-800"
              : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
          )}
        >
          Other
        </button>
      </div>
      {showOther && (
        <Input
          placeholder="Type your answer..."
          value={customAnswer}
          onChange={(e) => onCustomAnswerChange(e.target.value)}
          className="text-sm"
          autoFocus
        />
      )}
    </div>
  )
}

export function UserQuestion({ request, onAnswer }: UserQuestionProps) {
  const [selections, setSelections] = useState<Record<number, Set<string>>>({})
  const [customAnswers, setCustomAnswers] = useState<Record<number, string>>({})

  const handleToggleOption = (questionIndex: number, multiSelect: boolean, label: string) => {
    setSelections((prev) => {
      const current = prev[questionIndex] || new Set<string>()
      const next = new Set(current)

      if (next.has(label)) {
        next.delete(label)
      } else {
        if (!multiSelect) {
          next.clear()
        }
        next.add(label)
      }

      return { ...prev, [questionIndex]: next }
    })
  }

  const handleSubmit = () => {
    const answers = request.questions.map((q, i) => ({
      question: q.question,
      selectedOptions: Array.from(selections[i] || []),
      ...(customAnswers[i] ? { customAnswer: customAnswers[i] } : {})
    }))

    onAnswer(request.toolCallId, answers)
  }

  const hasAnySelection = request.questions.some(
    (_, i) => (selections[i]?.size ?? 0) > 0 || customAnswers[i]?.trim()
  )

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 my-2">
      <div className="flex items-start gap-2">
        <MessageCircleQuestion className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 space-y-3">
          {request.questions.map((question, index) => (
            <QuestionBlock
              key={index}
              question={question}
              selectedOptions={selections[index] || new Set()}
              customAnswer={customAnswers[index] || ""}
              onToggleOption={(label) =>
                handleToggleOption(index, question.multiSelect, label)
              }
              onCustomAnswerChange={(value) =>
                setCustomAnswers((prev) => ({ ...prev, [index]: value }))
              }
            />
          ))}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleSubmit} disabled={!hasAnySelection}>
              <Send className="w-3.5 h-3.5" />
              Submit
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
