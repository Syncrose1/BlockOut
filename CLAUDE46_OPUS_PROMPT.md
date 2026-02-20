# Task Chain V0 Redesign - Claude 4.6 Opus Escalation

## Current Working State
TaskChain.tsx is at a working baseline with:
- ✅ All emojis replaced with SVG icons
- ✅ Subtask infrastructure (store actions, types)
- ✅ Basic subtask UI (indented, separate chain items)
- ✅ Right-click menus for CTs and Main Tasks
- ✅ Workflow Chain header NOT yet implemented (we reverted that)

## Task
Implement the V0-inspired Task Chain redesign as shown in the mockup images. This is a major UI refactor.

## Design Mockup Reference
See images in conversation showing:
1. **Chain connector on left** - Vertical line with numbered circular nodes
2. **Nodes** show: completed (green checkmark), active (blue filled), pending (gray outline)
3. **Task cards on right** - Dark cards with rounded corners
4. **Subtasks inside parent cards** - Not as separate chain items
5. **Progress summary in header** - "Workflow Chain" with progress dots and counts
6. **Add task buttons integrated** - Small + buttons between nodes on the chain

## Implementation Requirements

### 1. Add Workflow Chain Header (Top)
Add this BEFORE the main chain area:
```tsx
{currentChain && currentChain.links.length > 0 && (
  <div className="workflow-chain-header">
    {/* ⛓️ icon + "Workflow Chain" title */}
    {/* Progress dots (one per parent task, colored by status) */}
    {/* Legend: Done/Active/Pending with counts */}
    {/* Counter: "X/Y" completed */}
  </div>
)}
```

### 2. Build Chain Items Helper
Add this useMemo BEFORE the return statement:
```tsx
const chainItems = useMemo(() => {
  if (!currentChain) return [];
  const items = [];
  let nodeNumber = 1;
  
  currentChain.links.forEach((link, index) => {
    if (link.type === 'subtask') return; // Skip - they'll be nested
    
    const subtasks = [];
    // Collect all consecutive subtasks after this parent
    for (let i = index + 1; i < currentChain.links.length; i++) {
      const sub = currentChain.links[i];
      if (sub.type === 'subtask' && sub.parentId === link.id) {
        subtasks.push({ link: sub, index: i });
      } else if (!sub.parentId) {
        break;
      }
    }
    
    items.push({ link, index, nodeNumber: nodeNumber++, subtasks });
  });
  
  return items;
}, [currentChain]);
```

### 3. Replace Chain Links Rendering
Replace the ENTIRE old chain links section (lines ~650-1200) with:

```tsx
{/* Chain Links - V0 Style */}
{currentChain && chainItems.map(({ link, index, nodeNumber, subtasks }) => {
  const isCT = link.type === 'ct';
  const ct = isCT ? chainTasks[link.taskId] : null;
  const mainTask = link.type === 'realtask' && link.taskId ? tasks[link.taskId] : null;
  const isPlaceholder = link.type === 'realtask' && !link.taskId;
  const task = ct || mainTask;
  const isCompleted = task?.completed || false;
  
  // Determine node appearance
  const isActive = nodeNumber === completedCount + 1;
  const nodeColor = isCompleted ? 'hsl(140, 60%, 40%)' : isActive ? 'var(--accent)' : 'var(--border)';
  
  return (
    <div key={link.id} style={{ display: 'flex', marginBottom: 16 }}>
      {/* Chain Connector Column */}
      <div style={{ 
        width: 60, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        position: 'relative'
      }}>
        {/* Vertical line from above */}
        {nodeNumber > 1 && (
          <div style={{ position: 'absolute', top: -16, bottom: '50%', width: 2, background: 'var(--border)' }} />
        )}
        
        {/* Node circle */}
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: isCompleted ? 'hsl(140, 60%, 40%)' : isActive ? 'var(--accent)' : 'transparent',
          border: `2px solid ${nodeColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isCompleted || isActive ? 'white' : 'var(--text-secondary)',
          fontWeight: 600,
          fontSize: 14,
          zIndex: 1,
        }}>
          {isCompleted ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          ) : nodeNumber}
        </div>
        
        {/* Vertical line going down */}
        <div style={{ flex: 1, width: 2, background: 'var(--border)', marginTop: 8 }} />
        
        {/* Add task button between nodes */}
        <button
          onClick={() => setInsertAfterIndex(index)}
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            marginTop: 4,
          }}
        >
          +
        </button>
      </div>
      
      {/* Task Card */}
      <div style={{ flex: 1, marginLeft: 16 }}>
        <motion.div
          style={{
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            padding: 16,
          }}
        >
          {/* Task content: title, badge, actions */}
          {/* ... keep existing task rendering logic ... */}
          
          {/* Subtasks section (if any) */}
          {subtasks.length > 0 && (
            <div style={{ 
              marginTop: 12, 
              paddingTop: 12, 
              borderTop: '1px solid var(--border)' 
            }}>
              {/* Progress: "X/Y" */}
              {/* List of subtasks */}
              {/* Add subtask button */}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
})}
```

### 4. Update Styling
Match the V0 dark design:
- Cards: `background: '#1e293b'` (or darker than `--bg-secondary`)
- Rounded corners: `borderRadius: 12px` or `var(--radius-lg)`
- Subtle borders: `border: 1px solid rgba(255,255,255,0.1)`
- Typography: Clean, modern sans-serif

## Files to Modify
1. `/src/components/TaskChain.tsx` - Main implementation
2. May need to update `/src/store/index.ts` for helper functions
3. May need to update `/src/types/index.ts` if new fields needed

## Testing
- [ ] Build passes: `npm run build`
- [ ] All existing tasks display
- [ ] Subtasks appear inside parent cards
- [ ] Chain nodes numbered correctly
- [ ] Node states render correctly (green/blue/gray)
- [ ] Add task buttons between nodes work
- [ ] Double-click completion works
- [ ] Right-click menus work
- [ ] Templates load correctly

## Key Constraint
Maintain ALL existing functionality while implementing the new visual design. The current code works - don't break it, just restructure the rendering.

## Starting Point
Current TaskChain.tsx is clean and working (commit 67cd080). The old chain links rendering is intact. You need to:
1. Add the chainItems helper
2. Add Workflow Chain header
3. Replace chain links rendering with V0 style
4. Ensure all existing functionality still works

## Notes
- Keep the ⛓️ emoji in the header (user specifically likes this one)
- Use existing SVG icons (checkmark, clock, etc.) that are already in the file
- Subtasks should be moved from separate chain items to inside parent containers
- The "Insert Task Here" inline modals can stay similar, just styled to match new design