# Task Chain V0 Redesign - Escalation Prompt

## Current State
The TaskChain component currently has:
1. ✅ Workflow Chain header with progress bar (showing done/active/pending counts)
2. ✅ `chainItems` helper that filters parent tasks and includes their subtasks
3. ✅ All emojis replaced with SVG icons
4. ✅ Subtask store actions and types implemented
5. ⚠️ Old chain links rendering (lines 680-1190) that needs complete replacement

## Task
Replace the old chain links rendering section (lines ~680-1190 in `/src/components/TaskChain.tsx`) with a new V0-inspired design.

## Design Requirements (from V0 mockup)

### Layout Structure
```
[Chain Connector - Left Side]     [Task Cards - Right Side]
    ━━━━●━━━━                              ┌─────────────────┐
    (node 1)                               │ Task 1          │
    ━━━━●━━━━                              │ CT badge, title │
    (node 2)                               │ [subtasks...]   │
    ━━━━●━━━━                              └─────────────────┘
    (node 3)
```

### Visual Elements Required:

1. **Chain Connector (Left Side)**
   - Vertical line connecting all nodes
   - Numbered circular nodes for each parent task (1, 2, 3...)
   - Node states:
     - Completed: Green checkmark, filled green circle
     - Active: Blue/purple filled circle (current task)
     - Pending: Gray outline circle
   - "Add task" mini-buttons integrated between nodes (small + icon)

2. **Task Cards (Right Side)**
   - Dark background (#1e293b or darker)
   - Rounded corners (radius-lg)
   - Subtle border
   - Content:
     - Task title (strikethrough if completed)
     - Type badge (CT/M/TBD)
     - Duration if completed (with clock icon)
     - Status indicator (green/blue dot for active)
     - Action buttons (Complete, Add Subtask, Delete)

3. **Subtasks Inside Parent Container**
   - Subtasks appear INSIDE the parent task card, not as separate chain items
   - Visual hierarchy with indentation or nested styling
   - Progress bar showing subtask completion (e.g., "2/3")
   - List of subtasks with checkboxes/completion status
   - "Add subtask" button at bottom of subtask list

4. **Add Task Flow**
   - Clicking "+" between nodes opens inline add modal
   - Two options: "Chain Task" (quick) or "Main Task" (from pool)
   - Appears inline, not at bottom of screen

## Technical Constraints

1. **Use existing data structures:**
   - `chainItems` helper already filters parent tasks with their subtasks
   - Each item has: `{ link, index, nodeNumber, subtasks }`
   - `subtasks` is array of `{ link, index }`

2. **Maintain all existing functionality:**
   - Double-click to complete
   - Right-click context menus
   - Drag and drop (if implemented)
   - SHIFT+multiselect
   - Template loading/saving
   - Duration survey modal for CTs

3. **Styling:**
   - Use existing CSS variables: `--bg-secondary`, `--accent`, `--radius-lg`, etc.
   - Keep dark theme
   - Use existing color scheme for CT (blue), Main Task (purple), Completed (green)

4. **TypeScript:**
   - Must maintain type safety
   - All props must be properly typed

## Files to Modify
- `/src/components/TaskChain.tsx` - Main file (replace lines 680-1190)
- May need to update `/src/types/index.ts` if new properties needed

## Current Code Structure
The old rendering uses:
```tsx
{currentChain && currentChain.links.map((link, index) => {
  // ... lots of logic ...
  return (
    <div key={link.id} style={{ marginLeft: indentLevel * 24 }}>
      <motion.div>...</motion.div>
      {/* Subtask creation UI */}
      {/* Insert button */}
    </div>
  );
})}
```

Replace with:
```tsx
{chainItems.map(({ link, index, nodeNumber, subtasks }) => {
  // New V0-style rendering
  return (
    <div key={link.id} style={{ display: 'flex', gap: 20 }}>
      {/* Chain connector column */}
      <div style={{ width: 60, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Line up */}
        <div style={{ width: 2, flex: 1, background: 'var(--border)' }} />
        {/* Node */}
        <div style={{ ... node styling ... }}>{nodeNumber}</div>
        {/* Line down */}
        <div style={{ width: 2, flex: 1, background: 'var(--border)' }} />
        {/* Add button between nodes */}
        <button>+</button>
      </div>
      
      {/* Task card with subtasks inside */}
      <div style={{ flex: 1 }}>
        <motion.div>...</motion.div>
        {subtasks.length > 0 && (
          <div className="subtask-container">
            {/* Subtask list */}
          </div>
        )}
      </div>
    </div>
  );
})}
```

## Testing Checklist
- [ ] All existing tasks display correctly
- [ ] Subtasks appear inside parent containers
- [ ] Chain nodes are numbered correctly
- [ ] Node states (completed/active/pending) show correctly
- [ ] Add task buttons work between nodes
- [ ] Progress bar in header updates correctly
- [ ] Double-click completes tasks
- [ ] Right-click menus work
- [ ] Templates load/save correctly
- [ ] Build passes without errors

## Reference Images
See attached V0 mockup images showing:
- Chain connector with numbered nodes on left
- Task cards with subtasks nested inside
- Progress indicators
- Dark theme styling

## Priority
This is a major UI redesign. Ensure existing functionality is preserved while implementing the new visual design.