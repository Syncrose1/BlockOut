# BlockOut Treemap Bug Report - Subcategory Task Rendering

## Issue Summary
Tasks in subcategories beyond the first one are not rendering correctly. Specifically:
- Subcategory 1 ("History Taking") displays its 2 tasks correctly
- Subcategory 2 ("Physical Exam") shows an empty space but its task is positioned at x=2049 (way off-screen)
- The task should be at approximately x=1025-1531 (within subcategory 2's bounds)

## Reproduction Steps
1. Create a timeblock with future end date
2. Create a category with 2 subcategories
3. Add 2 tasks to subcategory 1 (e.g., "History Taking")
4. Add 1 task to subcategory 2 (e.g., "Physical Exam")
5. View the treemap - task in subcategory 2 is invisible/hidden

## Expected Behavior
Both subcategories should display their tasks within their respective areas.

## Actual Behavior
- Subcategory 1 tasks: x=13 and x=519 (correct, within bounds)
- Subcategory 2 task: x=2049 (way outside bounds, should be ~1025-1531)
- The task is selectable/hoverable but rendered off-screen

## Technical Details

### Key Files
- `/src/utils/treemap.ts` - Squarified treemap layout algorithm
- `/src/components/Treemap.tsx` - Canvas rendering and coordinate conversion

### Current Coordinate Flow

1. **layoutTreemap** (Category level)
   - Lays out subcategories within category bounds
   - Calls squarify to calculate rectangles
   - Converts child coordinates to absolute

2. **Recursive call** (Subcategory level)
   - Lays out tasks within subcategory bounds
   - Available space: w=502, h=392 (correct)
   - Returns tasks with relative coordinates

3. **Coordinate conversion**
   - Subcategory gets positioned: x=1025 (correct)
   - Task relative x=1024 (WRONG - should be ~2-5)
   - After conversion: x=1024+1025=2049 (off-screen)

### The Problem
The recursive `layoutTreemap` call for subcategory 2's tasks is returning a task with x=1024, but the available width is only 502. This suggests the squarify algorithm is laying out the single task with coordinates that exceed the available space.

### Code Structure

**treemap.ts layoutTreemap()**:
```typescript
// For category with subcategories
result.children = childrenWithCoords.map((child) => {
  const childWithAbsoluteCoords = {
    ...child,
    x: Math.round(child.x! + result.x! + innerPad),
    y: Math.round(child.y! + result.y! + headerHeight + innerPad),
  };
  
  // Convert task coordinates
  if (child.children && child.children.length > 0) {
    childWithAbsoluteCoords.children = child.children.map((grandchild) => ({
      ...grandchild,
      x: Math.round(grandchild.x! + childWithAbsoluteCoords.x!), 
      y: Math.round(grandchild.y! + childWithAbsoluteCoords.y!),
    }));
  }
  
  return childWithAbsoluteCoords;
});
```

**treemap.ts squarify()**:
```typescript
export function squarify(areas: number[], rect: Rect): Rect[] {
  if (areas.length === 0) return [];
  if (areas.length === 1) return [rect]; // Single item case

  // For multiple items, uses row-based layout algorithm
  // Results stored in order of indices
}
```

### Hypotheses
1. The squarify algorithm is producing rectangles with x coordinates that reference the parent category's coordinate space instead of being relative to the subcategory
2. The single-item optimization in squarify (`if (areas.length === 1) return [rect]`) might not be accounting for the available space correctly when called recursively
3. The coordinate conversion is happening twice (once in recursive call, once in parent)

### What Has Been Tried
1. ✅ Fixed leafNodes collection to properly detect nested tasks for hover
2. ✅ Added minimum size constraints to prevent zero-size tiles
3. ✅ Removed area-based sorting to maintain node-to-rect mapping
4. ✅ Added consistent depth properties to all nodes
5. ❌ Debug logging showed task's relative x=1024 when available width is 502

### Open Questions
1. Why does the recursive layoutTreemap call return x=1024 for a task when available width is 502?
2. Is the single-area case in squarify returning wrong coordinates when nested?
3. Should task coordinates be reset to 0,0 before the recursive layout call?

### Test Data
```
Category: Clinical Skills (x: 3, y: 3, w: 1532, h: 451)
  Subcategory 1: History Taking (x: 7, y: 31, w: 1016, h: 420)
    - Task 1: Cardio History (x: 13, y: 61, w: 503, h: 389) ✓
    - Task 2: Respiratory History (x: 519, y: 61, w: 503, h: 389) ✓
  
  Subcategory 2: Physical Exam (x: 1025, y: 31, w: 506, h: 420)
    - Task 1: Abdominal Exam (x: 2049, y: 61, w: 499, h: 389) ✗
      Should be: x: ~1027-1530
```

## Success Criteria
- [ ] All tasks in subcategories render within their subcategory bounds
- [ ] Tasks remain hoverable/clickable
- [ ] Layout still respects area proportions (larger weights = larger tiles)
- [ ] No regression in non-subcategory task rendering

## Additional Context
- The app uses a squarified treemap algorithm (similar to WinDirStat)
- Three-level hierarchy: Category → Subcategory → Task
- Canvas-based rendering with manual coordinate calculation
- CSS zoom of 1.2x on sidebar/topbar requires coordinate adjustment for mouse events
