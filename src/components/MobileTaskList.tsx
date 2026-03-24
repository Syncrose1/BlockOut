import { useState, useMemo } from 'react';
import { useStore } from '../store';
import { debouncedSave } from '../utils/persistence';
import { UnifiedTaskContextMenu } from './Modals';
import type { Task, Category } from '../types';

interface CategoryGroup {
  category: Category;
  subcategories: Map<string, { name: string; tasks: Task[] }>;
  uncategorizedTasks: Task[];
  completedCount: number;
  totalCount: number;
}

export function MobileTaskList() {
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const activeBlockId = useStore((s) => s.activeBlockId);
  const showTimelessPool = useStore((s) => s.showTimelessPool);
  const poolViewMode = useStore((s) => s.poolViewMode);
  const toggleTask = useStore((s) => s.toggleTask);
  const focusMode = useStore((s) => s.focusMode);
  const focusedCategoryId = useStore((s) => s.pomodoro.focusedCategoryId);
  const setCompletionSurveyTask = useStore((s) => s.setCompletionSurveyTask);
  const setEditingTaskId = useStore((s) => s.setEditingTaskId);

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ taskId: string; x: number; y: number } | null>(null);

  // Get relevant tasks based on active view
  const relevantTasks = useMemo(() => {
    if (showTimelessPool) {
      const allTasks = Object.values(tasks);
      if (poolViewMode === 'unassigned') {
        const now = Date.now();
        const activeAssignedIds = new Set(
          Object.values(timeBlocks)
            .filter((b) => b.endDate > now)
            .flatMap((b) => b.taskIds)
        );
        return allTasks.filter((t) => !activeAssignedIds.has(t.id));
      }
      return allTasks;
    }
    if (activeBlockId) {
      const block = timeBlocks[activeBlockId];
      if (block) {
        return block.taskIds.map((id) => tasks[id]).filter(Boolean);
      }
    }
    return [];
  }, [tasks, timeBlocks, activeBlockId, showTimelessPool, poolViewMode]);

  // Group tasks by category and subcategory
  const categoryGroups = useMemo(() => {
    const groups = new Map<string, CategoryGroup>();

    for (const task of relevantTasks) {
      const cat = categories[task.categoryId];
      if (!cat) continue;

      if (!groups.has(cat.id)) {
        groups.set(cat.id, {
          category: cat,
          subcategories: new Map(),
          uncategorizedTasks: [],
          completedCount: 0,
          totalCount: 0,
        });
      }

      const group = groups.get(cat.id)!;
      group.totalCount++;
      if (task.completed) group.completedCount++;

      if (task.subcategoryId) {
        const sub = cat.subcategories.find((s) => s.id === task.subcategoryId);
        if (sub) {
          if (!group.subcategories.has(sub.id)) {
            group.subcategories.set(sub.id, { name: sub.name, tasks: [] });
          }
          group.subcategories.get(sub.id)!.tasks.push(task);
        } else {
          group.uncategorizedTasks.push(task);
        }
      } else {
        group.uncategorizedTasks.push(task);
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.category.name.localeCompare(b.category.name));
  }, [relevantTasks, categories]);

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const toggleSubcategory = (subId: string) => {
    setExpandedSubcategories((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  };

  const handleToggleTask = (task: Task) => {
    if (task.completed) {
      toggleTask(task.id);
      debouncedSave();
    } else {
      // Check for locked dependencies
      const deps = task.dependsOn || [];
      const unmet = deps.filter((depId) => !tasks[depId]?.completed);
      if (unmet.length > 0) return; // Locked

      toggleTask(task.id);
      debouncedSave();
      // Show completion survey
      setCompletionSurveyTask(task.id);
    }
  };

  const handleTaskContextMenu = (e: React.TouchEvent | React.MouseEvent, taskId: string) => {
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setContextMenu({ taskId, x: rect.left, y: rect.bottom + 4 });
  };

  if (relevantTasks.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">&#x25A6;</div>
        <h3>No tasks yet</h3>
        <p>Add tasks using the + Task button above</p>
      </div>
    );
  }

  const totalCompleted = relevantTasks.filter((t) => t.completed).length;
  const totalTasks = relevantTasks.length;

  return (
    <div className="mobile-task-list">
      {/* Summary bar */}
      <div className="mobile-task-summary">
        <span className="mobile-task-summary-text">
          {totalCompleted}/{totalTasks} completed
        </span>
        <div className="mobile-task-summary-bar">
          <div
            className="mobile-task-summary-fill"
            style={{ width: `${totalTasks > 0 ? (totalCompleted / totalTasks) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Category groups */}
      {categoryGroups.map((group) => {
        const isExpanded = expandedCategories.has(group.category.id);
        const isFocusDimmed = focusMode && focusedCategoryId && focusedCategoryId !== group.category.id;
        const progress = group.totalCount > 0 ? (group.completedCount / group.totalCount) * 100 : 0;

        return (
          <div
            key={group.category.id}
            className="mobile-category-group"
            style={{ opacity: isFocusDimmed ? 0.35 : 1 }}
          >
            {/* Category header */}
            <button
              className="mobile-category-header"
              onClick={() => toggleCategory(group.category.id)}
            >
              <span
                className="mobile-category-dot"
                style={{ background: group.category.color }}
              />
              <span className="mobile-category-name">{group.category.name}</span>
              <span className="mobile-category-count">
                {group.completedCount}/{group.totalCount}
              </span>
              <div className="mobile-category-progress">
                <div
                  className="mobile-category-progress-fill"
                  style={{ width: `${progress}%`, background: group.category.color }}
                />
              </div>
              <span className={`mobile-category-chevron ${isExpanded ? 'expanded' : ''}`}>
                &#x276F;
              </span>
            </button>

            {/* Expanded task list */}
            {isExpanded && (
              <div className="mobile-category-tasks">
                {/* Uncategorized tasks (no subcategory) */}
                {group.uncategorizedTasks.map((task) => (
                  <MobileTaskItem
                    key={task.id}
                    task={task}
                    color={group.category.color}
                    allTasks={tasks}
                    onToggle={() => handleToggleTask(task)}
                    onEdit={() => setEditingTaskId(task.id)}
                    onContextMenu={(e) => handleTaskContextMenu(e, task.id)}
                  />
                ))}

                {/* Subcategory groups */}
                {Array.from(group.subcategories.entries()).map(([subId, sub]) => {
                  const isSubExpanded = expandedSubcategories.has(subId);
                  const subCompleted = sub.tasks.filter((t) => t.completed).length;

                  return (
                    <div key={subId} className="mobile-subcategory-group">
                      <button
                        className="mobile-subcategory-header"
                        onClick={() => toggleSubcategory(subId)}
                      >
                        <span className={`mobile-category-chevron small ${isSubExpanded ? 'expanded' : ''}`}>
                          &#x276F;
                        </span>
                        <span className="mobile-subcategory-name">{sub.name}</span>
                        <span className="mobile-category-count">
                          {subCompleted}/{sub.tasks.length}
                        </span>
                      </button>

                      {isSubExpanded &&
                        sub.tasks.map((task) => (
                          <MobileTaskItem
                            key={task.id}
                            task={task}
                            color={group.category.color}
                            allTasks={tasks}
                            onToggle={() => handleToggleTask(task)}
                            onEdit={() => setEditingTaskId(task.id)}
                            onContextMenu={(e) => handleTaskContextMenu(e, task.id)}
                            indented
                          />
                        ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {contextMenu && (
        <UnifiedTaskContextMenu
          open={true}
          taskId={contextMenu.taskId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

// ─── Individual task item ────────────────────────────────────────────────────

interface MobileTaskItemProps {
  task: Task;
  color: string;
  allTasks: Record<string, Task>;
  onToggle: () => void;
  onEdit: () => void;
  onContextMenu: (e: React.TouchEvent | React.MouseEvent) => void;
  indented?: boolean;
}

function MobileTaskItem({ task, color, allTasks, onToggle, onEdit, onContextMenu, indented }: MobileTaskItemProps) {
  const deps = task.dependsOn || [];
  const unmetDeps = deps.filter((depId) => !allTasks[depId]?.completed);
  const isLocked = unmetDeps.length > 0;

  const weightLabels: Record<number, string> = { 1: 'S', 2: 'M', 3: 'L', 5: 'XL' };

  return (
    <div
      className={`mobile-task-item ${task.completed ? 'completed' : ''} ${isLocked ? 'locked' : ''} ${indented ? 'indented' : ''}`}
      onContextMenu={onContextMenu}
    >
      <button
        className={`mobile-task-check ${task.completed ? 'done' : ''}`}
        onClick={onToggle}
        disabled={isLocked}
        style={task.completed ? { borderColor: color, background: color } : undefined}
      >
        {task.completed && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {isLocked && <span style={{ fontSize: 9 }}>&#x1F512;</span>}
      </button>

      <div className="mobile-task-content" onClick={onEdit}>
        <span className={`mobile-task-title ${task.completed ? 'completed' : ''}`}>
          {task.title}
        </span>
        {task.notes && (
          <span className="mobile-task-notes">{task.notes}</span>
        )}
      </div>

      <div className="mobile-task-meta">
        {task.weight > 1 && (
          <span className="mobile-task-weight">{weightLabels[task.weight] || task.weight}</span>
        )}
        {task.actualDuration && (
          <span className="mobile-task-duration">{task.actualDuration}m</span>
        )}
      </div>
    </div>
  );
}
