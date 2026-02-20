"use client"

import { Check, Circle, Clock, Plus, Link2 } from "lucide-react"
import { sampleTasks, getStatusColor, getTypeBadgeColor } from "@/lib/task-data"
import type { Task } from "@/lib/task-data"

function SubtaskPill({ task }: { task: Task }) {
  const statusColor = getStatusColor(task.status)
  const badgeColor = getTypeBadgeColor(task.type)

  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded-md transition-colors hover:bg-[#1a2744]">
      <div className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {task.status === "completed" ? (
          <div className="h-3.5 w-3.5 rounded-full flex items-center justify-center" style={{ backgroundColor: statusColor }}>
            <Check className="h-2 w-2 text-white" />
          </div>
        ) : task.status === "in-progress" ? (
          <div className="h-3.5 w-3.5 rounded-full border-[1.5px] flex items-center justify-center" style={{ borderColor: statusColor }}>
            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
          </div>
        ) : (
          <div className="h-3.5 w-3.5 rounded-full border-[1.5px] border-[#3d4a5e]" />
        )}
      </div>
      <span
        className={`text-[10px] flex-1 ${
          task.status === "completed" ? "line-through text-muted-foreground/40" : "text-foreground/70"
        }`}
      >
        {task.name}
      </span>
      <span
        className="rounded px-1 py-px text-[8px] font-bold uppercase"
        style={{ backgroundColor: `${badgeColor}12`, color: badgeColor }}
      >
        {task.type}
      </span>
    </div>
  )
}

function TimelineCard({
  task,
  index,
  side,
}: {
  task: Task
  index: number
  side: "left" | "right"
}) {
  const statusColor = getStatusColor(task.status)
  const badgeColor = getTypeBadgeColor(task.type)
  const hasSubtasks = task.subtasks && task.subtasks.length > 0
  const isActive = task.status === "in-progress"
  const isCompleted = task.status === "completed"
  const completedSubs = hasSubtasks ? task.subtasks!.filter((s) => s.status === "completed").length : 0
  const totalSubs = hasSubtasks ? task.subtasks!.length : 0

  return (
    <div className="relative group">
      {/* Notch pointer pointing toward spine */}
      <div
        className={`absolute top-4 ${side === "left" ? "-right-[6px]" : "-left-[6px]"} w-3 h-3 rotate-45 border transition-colors`}
        style={{
          backgroundColor: isActive ? "#1a2744" : "#1e293b",
          borderColor: isActive ? `${statusColor}30` : "#2d3a4e",
          borderTopColor: side === "left" ? "transparent" : undefined,
          borderBottomColor: side === "right" ? "transparent" : undefined,
          borderLeftColor: side === "left" ? "transparent" : undefined,
          borderRightColor: side === "right" ? "transparent" : undefined,
        }}
      />

      {/* Card */}
      <div
        className="relative rounded-xl border overflow-hidden transition-all duration-200"
        style={{
          backgroundColor: isActive ? "#1a2744" : "#1e293b",
          borderColor: isActive ? `${statusColor}30` : "#2d3a4e",
        }}
      >
        {/* Active glow */}
        {isActive && (
          <div
            className="absolute inset-0 rounded-xl opacity-100 pointer-events-none"
            style={{ background: `radial-gradient(ellipse at ${side === "left" ? "right" : "left"} center, ${statusColor}08, transparent 70%)` }}
          />
        )}

        <div className="relative p-3.5">
          {/* Header */}
          <div className="flex items-start gap-2.5 mb-2">
            <div className="flex-1 min-w-0">
              <h3
                className={`text-sm font-semibold leading-tight mb-1.5 ${
                  isCompleted ? "line-through text-muted-foreground/50" : "text-foreground"
                }`}
              >
                {task.name}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                  style={{ backgroundColor: `${badgeColor}12`, color: badgeColor }}
                >
                  {task.type === "?" ? "TBD" : task.type}
                </span>
                {task.duration && (
                  <span className="flex items-center gap-1 text-[9px] text-muted-foreground/50">
                    <Clock className="h-2.5 w-2.5" />
                    <span className="tabular-nums">{task.duration}</span>
                  </span>
                )}
                {isActive && (
                  <span
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold"
                    style={{ backgroundColor: `${statusColor}15`, color: statusColor }}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ backgroundColor: statusColor }} />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
                    </span>
                    Active
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Subtasks */}
          {hasSubtasks && (
            <div className="mt-2 pt-2 border-t border-border/30">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="flex h-1 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: "#0f172a" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(completedSubs / totalSubs) * 100}%`, backgroundColor: statusColor }}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground/40 tabular-nums">{completedSubs}/{totalSubs}</span>
              </div>
              <div className="flex flex-col rounded-lg overflow-hidden" style={{ backgroundColor: "#14203580" }}>
                {task.subtasks!.map((sub) => (
                  <SubtaskPill key={sub.id} task={sub} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SpineNode({
  task,
  index,
  isLast,
}: {
  task: Task
  index: number
  isLast: boolean
}) {
  const statusColor = getStatusColor(task.status)
  const isActive = task.status === "in-progress"
  const isCompleted = task.status === "completed"
  const side = index % 2 === 0 ? "left" : "right"

  return (
    <div className="relative flex items-stretch">
      {/* Left card area */}
      <div className="flex-1 flex justify-end pr-5">
        {side === "left" && <div className="w-full max-w-[300px]"><TimelineCard task={task} index={index} side="left" /></div>}
      </div>

      {/* Center spine */}
      <div className="flex flex-col items-center shrink-0 z-10 w-11">
        {/* Top connector */}
        {index > 0 && (
          <div className="h-4 w-[2px] rounded-full" style={{ backgroundColor: isCompleted || isActive ? statusColor : "#2d3a4e", opacity: isCompleted ? 0.6 : 1 }} />
        )}

        {/* Node */}
        <div className="relative">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl transition-all"
            style={{
              backgroundColor: isCompleted ? statusColor : isActive ? `${statusColor}18` : "#1a2236",
              border: isActive ? `1.5px solid ${statusColor}50` : isCompleted ? "none" : "1px solid #2d3a4e",
              boxShadow: isActive ? `0 0 20px ${statusColor}20` : "none",
            }}
          >
            {isCompleted ? (
              <Check className="h-4.5 w-4.5 text-white" />
            ) : isActive ? (
              <Circle className="h-3.5 w-3.5" style={{ fill: statusColor, color: statusColor }} />
            ) : (
              <span className="text-xs font-bold text-muted-foreground/30 tabular-nums">{index + 1}</span>
            )}
          </div>

          {/* Active ring pulse */}
          {isActive && (
            <div
              className="absolute -inset-1.5 rounded-[14px] animate-ping pointer-events-none"
              style={{
                border: `1px solid ${statusColor}`,
                opacity: 0.15,
                animationDuration: "2.5s",
              }}
            />
          )}
        </div>

        {/* Bottom connector + insert */}
        {!isLast && (
          <>
            <div className="h-3 w-[2px] rounded-full" style={{ backgroundColor: "#2d3a4e" }} />
            {/* Chain link SVG */}
            <svg width="14" height="18" viewBox="0 0 14 18" fill="none" className="shrink-0 my-0.5">
              <path
                d="M7 0 V4 C7 5.5 10 5.5 10 7 V11 C10 12.5 7 12.5 7 14 V18"
                stroke="#2d3a4e"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M7 0 V4 C7 5.5 4 5.5 4 7 V11 C4 12.5 7 12.5 7 14 V18"
                stroke="#2d3a4e"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <button className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/15 text-muted-foreground/15 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all duration-200 my-0.5">
              <Plus className="h-2.5 w-2.5" />
            </button>
            <svg width="14" height="18" viewBox="0 0 14 18" fill="none" className="shrink-0 my-0.5">
              <path
                d="M7 0 V4 C7 5.5 10 5.5 10 7 V11 C10 12.5 7 12.5 7 14 V18"
                stroke="#2d3a4e"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M7 0 V4 C7 5.5 4 5.5 4 7 V11 C4 12.5 7 12.5 7 14 V18"
                stroke="#2d3a4e"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <div className="h-3 w-[2px] rounded-full" style={{ backgroundColor: "#2d3a4e" }} />
          </>
        )}
      </div>

      {/* Right card area */}
      <div className="flex-1 flex justify-start pl-5">
        {side === "right" && <div className="w-full max-w-[300px]"><TimelineCard task={task} index={index} side="right" /></div>}
      </div>
    </div>
  )
}

export default function VariantETimeline() {
  const completedCount = sampleTasks.filter((t) => t.status === "completed").length

  return (
    <div className="py-8 px-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <div className="flex items-center gap-2.5 rounded-lg border border-border/50 px-4 py-2" style={{ backgroundColor: "#1e293b" }}>
          <Link2 className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">Workflow Chain</span>
          <div className="h-3.5 w-px bg-border/40 mx-1" />
          <div className="flex items-center gap-1">
            {sampleTasks.map((t, i) => (
              <div
                key={t.id}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: t.status === "in-progress" ? 18 : 8,
                  backgroundColor: getStatusColor(t.status),
                  opacity: t.status === "pending" ? 0.2 : 1,
                }}
              />
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground/50 tabular-nums ml-1">{completedCount}/{sampleTasks.length}</span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "hsl(140, 60%, 40%)" }} />
            <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Done</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#64748b" }} />
            <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Pending</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex flex-col">
        {sampleTasks.map((task, i) => (
          <SpineNode key={task.id} task={task} index={i} isLast={i === sampleTasks.length - 1} />
        ))}
      </div>

      {/* Terminal */}
      <div className="flex justify-center mt-4">
        <div className="flex flex-col items-center gap-1">
          <div className="h-3 w-[2px] rounded-full" style={{ backgroundColor: "#2d3a4e" }} />
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/30" style={{ backgroundColor: "#1a2236" }}>
            <div className="h-2 w-2 rounded-full bg-muted-foreground/20" />
          </div>
        </div>
      </div>
    </div>
  )
}
